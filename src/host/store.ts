/**
 * The memory store: every file under `$DSH_HOME/dsh-workbuddy-memory/`.
 *
 * This is the only module that touches the data root. It owns the layout
 * (memory-plan §3.2), the templates (§4), the optimistic-concurrency revision
 * of every editable document, the secret filter (§5.2 blacklist), and the
 * `state.json` watermark the collector and the consolidator share.
 *
 * Reads are lock-free: `writeFileAtomic` commits with a rename, so a reader
 * either sees the old file or the new one. Writes that read-modify-write a file
 * (a preference patch, a consolidation pass) take the file lock.
 */

import { join } from 'node:path'
import {
  EMPTY_DOCUMENT,
  frontList,
  frontNumber,
  frontString,
  parseDocument,
  renderDocument,
  revisionOf,
  type MarkdownDocument,
} from './document.ts'
import {
  ensureDir,
  exists,
  listDir,
  mtimeIso,
  readText,
  readTextOrUndefined,
  removeFile,
  withFileLock,
  writeFileAtomic,
} from './fsx.ts'
import { resolveMemoryRoot, resolveSkillsRoot } from './dsh-home.ts'
import {
  DEFAULT_PERSONA_BODY,
  DEFAULT_PREFERENCES,
  initialFiles,
  instructionsTemplate,
  memoryIndexTemplate,
  profileTemplate,
  topicTemplate,
} from './templates.ts'
import { dayKey, parseEntries, renderTopicBody, type Entry } from './entries.ts'
import {
  CONSOLIDATE_MODES,
  MODEL_POLICIES,
  REPLY_STYLES,
  TOPICS,
  type Confidence,
  type ConsolidateMode,
  type DocumentView,
  type DraftView,
  type EntryView,
  type MemorySnapshot,
  type ModelPolicy,
  type PreferencesPatch,
  type PreferencesView,
  type ReplyStyle,
  type SessionNoteView,
  type TopicKey,
} from '../protocol.ts'

/** `state.json`: the plugin's only non-markdown file. */
export interface PluginState {
  schema: number
  /** Session events already folded into a session note, keyed by session id. */
  processed: Record<string, number>
  /** Session notes awaiting a consolidation pass. */
  pending: string[]
  lastConsolidateAt: string | null
  /** Failure classes with a cooldown, for the model stage (memory-plan §6.1.2). */
  modelCooldown: Record<string, number>
  /** Per-entry corroboration bookkeeping that cannot live in the markdown. */
  confidence: Record<string, { days: number; first: string; last: string }>
}

const EMPTY_STATE: PluginState = {
  schema: 1,
  processed: {},
  pending: [],
  lastConsolidateAt: null,
  modelCooldown: {},
  confidence: {},
}

/** Secrets the blacklist drops outright (memory-plan §5.2). */
const SECRET_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'OpenAI 风格密钥', pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/ },
  { label: 'GitHub 令牌', pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { label: 'AWS Access Key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: 'Bearer 令牌', pattern: /\bBearer\s+[A-Za-z0-9._-]{20,}/i },
  { label: '私钥块', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: '赋值式口令', pattern: /\b(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S{8,}/i },
]

/** One document the store can address by its root-relative path. */
export interface DocumentTarget {
  path: string
  kind: 'persona' | 'instructions' | 'memory-index' | 'memory-topic'
  topic?: TopicKey
}

/** The three hand-editable documents plus every topic file. */
export function documentTargets(): DocumentTarget[] {
  return [
    { path: 'profile.md', kind: 'persona' },
    { path: 'instructions.md', kind: 'instructions' },
    { path: 'memory/index.md', kind: 'memory-index' },
    ...TOPICS.map(topic => ({ path: `memory/${topic.file}`, kind: 'memory-topic' as const, topic: topic.key })),
  ]
}

/** Resolve one target by path, or `undefined` when it is not editable. */
export function documentTarget(path: string): DocumentTarget | undefined {
  return documentTargets().find(target => target.path === path)
}

/** Strip anything the blacklist forbids, reporting what was dropped. */
export function redact(text: string): { text: string; warnings: string[] } {
  let result = text
  const warnings: string[] = []
  for (const { label, pattern } of SECRET_PATTERNS) {
    if (!pattern.test(result)) continue
    result = result.replace(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`), '［已隐去］')
    warnings.push(`检测到${label}，已从记忆内容中隐去。`)
  }
  return { text: result, warnings }
}

/** The memory store. */
export class MemoryStore {
  readonly root: string
  readonly skillsRoot: string
  private warnings: string[] = []

  constructor(root = resolveMemoryRoot(), skillsRoot = resolveSkillsRoot()) {
    this.root = root
    this.skillsRoot = skillsRoot
  }

  /** Absolute path of a root-relative file. */
  path(relative: string): string {
    return join(this.root, relative)
  }

  /** Create the data root and every skeleton file that is missing. */
  async ensure(): Promise<void> {
    const now = new Date().toISOString()
    await ensureDir(this.root)
    for (const [relative, content] of Object.entries(initialFiles(now))) {
      const target = this.path(relative)
      if (await exists(target)) continue
      await writeFileAtomic(target, content)
    }
    for (const directory of ['memory/projects', 'sessions', 'journal', 'skills-draft', 'archive']) {
      await ensureDir(this.path(directory))
    }
    if (!(await exists(this.path('state.json')))) await this.writeState(EMPTY_STATE)
  }

  /** Read `state.json`, falling back to the empty state on a broken file. */
  async readState(): Promise<PluginState> {
    const raw = await readTextOrUndefined(this.path('state.json'))
    if (raw === undefined || raw.trim() === '') return { ...EMPTY_STATE }
    try {
      const parsed = JSON.parse(raw) as Partial<PluginState>
      return {
        schema: typeof parsed.schema === 'number' ? parsed.schema : 1,
        processed: parsed.processed ?? {},
        pending: Array.isArray(parsed.pending) ? parsed.pending : [],
        lastConsolidateAt: parsed.lastConsolidateAt ?? null,
        modelCooldown: parsed.modelCooldown ?? {},
        confidence: parsed.confidence ?? {},
      }
    } catch {
      // A corrupt state file must not take the plugin down: the watermark is
      // rebuildable (the worst case is one redundant consolidation pass).
      this.warnings.push('state.json 无法解析，已按空状态继续（记忆文件未受影响）。')
      return { ...EMPTY_STATE }
    }
  }

  /** Persist `state.json`. */
  async writeState(state: PluginState): Promise<void> {
    await writeFileAtomic(this.path('state.json'), `${JSON.stringify(state, null, 2)}\n`)
  }

  /** Read one markdown document. */
  async readDocument(relative: string): Promise<MarkdownDocument> {
    const raw = await readTextOrUndefined(this.path(relative))
    if (raw === undefined) return EMPTY_DOCUMENT
    return parseDocument(raw)
  }

  /** Read the preferences file into its typed view. */
  async readPreferences(): Promise<PreferencesView> {
    const document = await this.readDocument('preferences.md')
    const front = document.front
    const mode = frontString(front, 'consolidateOn', DEFAULT_PREFERENCES.consolidateOn)
    const policy = frontString(front, 'modelPolicy', DEFAULT_PREFERENCES.modelPolicy)
    const style = frontString(front, 'replyStyle', DEFAULT_PREFERENCES.replyStyle)
    return {
      userName: frontString(front, 'userName', DEFAULT_PREFERENCES.userName),
      agentName: frontString(front, 'agentName', DEFAULT_PREFERENCES.agentName),
      replyStyle: (REPLY_STYLES as readonly string[]).includes(style) ? (style as ReplyStyle) : DEFAULT_PREFERENCES.replyStyle,
      welcome: frontBooleanOr(front, 'welcome', DEFAULT_PREFERENCES.welcome),
      showFileChanges: frontBooleanOr(front, 'showFileChanges', DEFAULT_PREFERENCES.showFileChanges),
      conversationMemory: frontBooleanOr(front, 'conversationMemory', DEFAULT_PREFERENCES.conversationMemory),
      localMemorySkills: frontBooleanOr(front, 'localMemorySkills', DEFAULT_PREFERENCES.localMemorySkills),
      consolidateOn: (CONSOLIDATE_MODES as readonly string[]).includes(mode) ? (mode as ConsolidateMode) : DEFAULT_PREFERENCES.consolidateOn,
      consolidateIntervalHours: frontNumber(front, 'consolidateIntervalHours', DEFAULT_PREFERENCES.consolidateIntervalHours),
      consolidateIdleMinutes: frontNumber(front, 'consolidateIdleMinutes', DEFAULT_PREFERENCES.consolidateIdleMinutes),
      consolidateFixedTime: frontString(front, 'consolidateFixedTime', DEFAULT_PREFERENCES.consolidateFixedTime),
      consolidateQuiet: frontBooleanOr(front, 'consolidateQuiet', DEFAULT_PREFERENCES.consolidateQuiet),
      modelPolicy: (MODEL_POLICIES as readonly string[]).includes(policy) ? (policy as ModelPolicy) : DEFAULT_PREFERENCES.modelPolicy,
      modelAllowlist: frontList(front, 'modelAllowlist'),
      promptBudgetBytes: frontNumber(front, 'promptBudgetBytes', DEFAULT_PREFERENCES.promptBudgetBytes),
    }
  }

  /**
   * Merge `patch` into the preferences front-matter.
   *
   * Read-modify-write under the file lock: two panel tabs toggling different
   * switches must not lose one another's change, and the front-matter has more
   * keys than any single patch carries.
   */
  async patchPreferences(patch: PreferencesPatch): Promise<PreferencesView> {
    const target = this.path('preferences.md')
    await withFileLock(target, async () => {
      const raw = await readTextOrUndefined(target)
      const document = raw === undefined ? parseDocument('') : parseDocument(raw)
      const next = { ...document.front }
      for (const [key, value] of Object.entries(patch.patch)) {
        if (value === undefined) continue
        next[key] = value
      }
      next.kind = 'preferences'
      next.schema = 1
      next.updated = new Date().toISOString()
      await writeFileAtomic(target, renderDocument(next, document.body))
    })
    return await this.readPreferences()
  }

  /**
   * Write one document body, refusing to clobber a concurrent edit.
   *
   * `expected` is the revision the editor loaded. A mismatch means somebody
   * else (the user in an editor, or a consolidation pass) wrote the file in the
   * meantime, and the caller must resolve it — the store never silently wins.
   */
  async saveDocument(relative: string, body: string, expected: string): Promise<
    { ok: true; document: MarkdownDocument } | { ok: false; text: string; revision: string }
  > {
    const target = this.path(relative)
    const outcome = await withFileLock(target, async () => {
      const raw = await readTextOrUndefined(target)
      const current = raw === undefined ? EMPTY_DOCUMENT : parseDocument(raw)
      if (raw !== undefined && expected !== '' && current.revision !== expected) {
        return { ok: false as const, text: current.body, revision: current.revision }
      }
      const { text } = redact(body)
      const next = { ...current.front, updated: new Date().toISOString() }
      await writeFileAtomic(target, renderDocument(next, text))
      return { ok: true as const, document: parseDocument(await readText(target)) }
    })
    return outcome
  }

  /**
   * Write a document with an explicit front-matter record.
   *
   * Used by consolidation (which owns the index's front-matter) rather than by
   * the panel, whose edits are body-only and go through `saveDocument`.
   */
  async writeDocument(
    relative: string,
    front: Record<string, string | number | boolean | string[]>,
    body: string,
  ): Promise<void> {
    await withFileLock(this.path(relative), async () => {
      const existing = await this.readDocument(relative)
      await writeFileAtomic(this.path(relative), renderDocument({ ...existing.front, ...front }, body))
    })
  }

  /** Rewrite a document back to its shipped skeleton. */
  async resetDocument(relative: string): Promise<void> {    const now = new Date().toISOString()
    const target = documentTarget(relative)
    if (target === undefined) return
    const content =
      target.kind === 'persona'
        ? profileTemplate(now)
        : target.kind === 'instructions'
          ? instructionsTemplate(now)
          : target.kind === 'memory-index'
            ? memoryIndexTemplate(now)
            : topicTemplate(
              target.topic ?? '',
              TOPICS.find(topic => topic.key === target.topic)?.title ?? '',
              now,
            )
    await writeFileAtomic(this.path(relative), content)
  }

  /** Every entry of one topic file. */
  async readEntries(topic: TopicKey): Promise<Entry[]> {
    const file = TOPICS.find(item => item.key === topic)?.file
    if (file === undefined) return []
    const document = await this.readDocument(`memory/${file}`)
    return parseEntries(document.body)
  }

  /** Every entry of every topic file, keyed by topic. */
  async readAllEntries(): Promise<Record<string, Entry[]>> {
    const result: Record<string, Entry[]> = {}
    for (const topic of TOPICS) result[topic.key] = await this.readEntries(topic.key)
    return result
  }

  /** Rewrite one topic file from its entries. */
  async writeEntries(topic: TopicKey, entries: EntryView[]): Promise<void> {
    const file = TOPICS.find(item => item.key === topic)?.file
    if (file === undefined) return
    const relative = `memory/${file}`
    await withFileLock(this.path(relative), async () => {
      const document = await this.readDocument(relative)
      const body = renderTopicBody(document.body, entries)
      const next = { ...document.front, updated: new Date().toISOString() }
      await writeFileAtomic(this.path(relative), renderDocument(next, body))
    })
  }

  /** Drop one entry, or flip its `pinned` flag. */
  async editEntry(topic: TopicKey, id: string, change: { remove?: boolean; pinned?: boolean }): Promise<boolean> {
    const entries = await this.readEntries(topic)
    const index = entries.findIndex(entry => entry.id === id)
    if (index < 0) return false
    const next: EntryView[] = entries.map(entry => ({ ...entry }))
    if (change.remove === true) next.splice(index, 1)
    else if (change.pinned !== undefined) next[index].pinned = change.pinned
    await this.writeEntries(topic, next)
    return true
  }

  /** Move an entry into `archive/` (decay, memory-plan §5.3). */
  async archiveEntries(topic: TopicKey, ids: readonly string[], reason: string): Promise<number> {
    if (ids.length === 0) return 0
    const entries = await this.readEntries(topic)
    const wanted = new Set(ids)
    const moved = entries.filter(entry => wanted.has(entry.id))
    if (moved.length === 0) return 0
    const archivePath = this.path(`archive/${topic}-${dayKey()}.md`)
    const existing = await readTextOrUndefined(archivePath)
    const lines = moved.map(entry => `- [${entry.id}] ${entry.text} <!-- archived:${dayKey()} reason:${reason} -->`)
    const header = existing ?? `---\nkind: memory-archive\ntopic: ${topic}\nschema: 1\nupdated: ${new Date().toISOString()}\n---\n# 归档 · ${topic}\n`
    await writeFileAtomic(archivePath, `${header.trimEnd()}\n${lines.join('\n')}\n`)
    await this.writeEntries(topic, entries.filter(entry => !wanted.has(entry.id)))
    return moved.length
  }

  /** Session notes, newest first. */
  async readSessions(limit = 50): Promise<SessionNoteView[]> {
    const state = await this.readState()
    const pending = new Set(state.pending)
    const dates = (await listDir(this.path('sessions'))).filter(name => /^\d{4}-\d{2}-\d{2}$/.test(name)).sort().reverse()
    const notes: SessionNoteView[] = []
    for (const date of dates) {
      const ids = await listDir(this.path(`sessions/${date}`))
      for (const id of ids) {
        if (!id.endsWith('.md')) continue
        const relative = `sessions/${date}/${id}`
        const document = await this.readDocument(relative)
        notes.push({
          id: id.slice(0, -3),
          date,
          path: relative,
          updated: frontString(document.front, 'updated', (await mtimeIso(this.path(relative))) ?? ''),
          consolidated: !pending.has(relative),
          events: frontNumber(document.front, 'events', 0),
          title: frontString(document.front, 'title', ''),
        })
        if (notes.length >= limit) return notes
      }
    }
    return notes
  }

  /** Write one session note. */
  async writeSessionNote(
    date: string,
    id: string,
    front: Record<string, string | number | boolean | string[]>,
    body: string,
  ): Promise<string> {
    const relative = `sessions/${date}/${id}.md`
    await ensureDir(this.path(`sessions/${date}`))
    const document = await this.readDocument(relative)
    const merged = { kind: 'session-note', schema: 1, ...document.front, ...front }
    await writeFileAtomic(this.path(relative), renderDocument(merged, body))
    return relative
  }

  /** Skill drafts awaiting approval. */
  async readDrafts(): Promise<DraftView[]> {
    const names = await listDir(this.path('skills-draft'))
    const drafts: DraftView[] = []
    for (const name of names) {
      const relative = `skills-draft/${name}/SKILL.md`
      const document = await this.readDocument(relative)
      if (document.body.trim() === '' && Object.keys(document.front).length === 0) continue
      drafts.push({
        name,
        title: frontString(document.front, 'title', name),
        path: relative,
        createdAt: frontString(document.front, 'createdAt', ''),
        repeats: frontNumber(document.front, 'repeats', 0),
      })
    }
    return drafts
  }

  /** Append a journal entry recording what a pass changed. */
  async appendJournal(lines: string[]): Promise<void> {
    const date = dayKey()
    const relative = `journal/${date}.md`
    const existing = await readTextOrUndefined(this.path(relative))
    const header = existing ?? `---\nkind: journal\ndate: ${date}\nschema: 1\n---\n# 整理日志 · ${date}\n`
    const stamp = new Date().toISOString().slice(11, 19)
    const entry = `\n## ${stamp}\n\n${lines.map(line => `- ${line}`).join('\n')}\n`
    await writeFileAtomic(this.path(relative), `${header.trimEnd()}\n${entry}`)
  }

  /** Back up the files a pass is about to rewrite. */
  async backup(paths: readonly string[]): Promise<void> {
    const directory = this.path(`journal/${dayKey()}/backup`)
    await ensureDir(directory)
    for (const relative of paths) {
      const raw = await readTextOrUndefined(this.path(relative))
      if (raw === undefined) continue
      await writeFileAtomic(join(directory, relative.replaceAll('/', '__')), raw)
    }
  }

  /** Promote a draft into `$DSH_HOME/skills/<name>/SKILL.md`. */
  async approveDraft(name: string): Promise<boolean> {
    const source = await readTextOrUndefined(this.path(`skills-draft/${name}/SKILL.md`))
    if (source === undefined) return false
    await writeFileAtomic(join(this.skillsRoot, name, 'SKILL.md'), source)
    await removeFile(this.path(`skills-draft/${name}/SKILL.md`)).catch(() => undefined)
    return true
  }

  /** Drop a draft without promoting it. */
  async discardDraft(name: string): Promise<boolean> {
    const target = this.path(`skills-draft/${name}/SKILL.md`)
    if (!(await exists(target))) return false
    await removeFile(target)
    return true
  }

  /** Build the snapshot the panel renders. */
  async snapshot(): Promise<MemorySnapshot> {
    await this.ensure()
    const [preferences, state, sessions, drafts, allEntries] = await Promise.all([
      this.readPreferences(),
      this.readState(),
      this.readSessions(),
      this.readDrafts(),
      this.readAllEntries(),
    ])
    const documents: Record<string, DocumentView> = {}
    for (const target of documentTargets()) {
      const document = await this.readDocument(target.path)
      documents[target.path] = {
        path: target.path,
        text: document.body,
        revision: document.revision,
        updated: frontString(document.front, 'updated', ''),
      }
    }
    const indexDocument = await this.readDocument('memory/index.md')
    const entries: Record<string, EntryView[]> = {}
    for (const [topic, list] of Object.entries(allEntries)) {
      entries[topic] = list
        .filter(entry => entry.confidence !== '低' || entry.pinned)
        .map(({ line: _line, ...entry }) => entry)
    }
    const revision = await this.computeRevision()
    return {
      ok: true,
      root: this.root,
      revision,
      preferences,
      documents,
      entries,
      index: {
        path: 'memory/index.md',
        text: indexDocument.body,
        revision: indexDocument.revision,
        updated: frontString(indexDocument.front, 'updated', ''),
      },
      sessions: {
        pending: state.pending.length,
        total: sessions.length,
        lastAt: sessions[0]?.updated ?? null,
        items: sessions.slice(0, 20),
      },
      consolidation: {
        lastAt: state.lastConsolidateAt,
        reason: await this.consolidationReason(preferences),
        modelStage: 'disabled',
        modelNote: '模型提炼未启用（首版）',
      },
      drafts,
      warnings: [...this.warnings],
    }
  }

  /** Why consolidation has not run, in the panel's own words. */
  private async consolidationReason(preferences: PreferencesView): Promise<string> {
    const state = await this.readState()
    if (state.pending.length > 0) return `有 ${state.pending.length} 个会话待整理`
    if (preferences.consolidateOn === 'fixed') return `按固定时间 ${preferences.consolidateFixedTime} 整理`
    if (!preferences.conversationMemory) return '会话记忆已关闭'
    return '暂无可整理的会话'
  }

  /** Content revision over the files the panel renders. */
  private async computeRevision(): Promise<string> {
    const parts: string[] = []
    for (const relative of [
      'preferences.md',
      ...documentTargets().map(target => target.path),
      'state.json',
    ]) {
      const raw = await readTextOrUndefined(this.path(relative))
      parts.push(`${relative}:${raw === undefined ? 'missing' : revisionOf(raw)}`)
    }
    return revisionOf(parts.join('\n'))
  }

  /** Record a non-fatal warning for the next snapshot. */
  warn(message: string): void {
    if (this.warnings.includes(message)) return
    this.warnings.push(message)
  }

  /** Clear the warnings already shown. */
  clearWarnings(): void {
    this.warnings = []
  }
}

/** Read a boolean front-matter value with the plan's default. */
function frontBooleanOr(
  front: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const value = front[key]
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

/** Re-exported so callers do not import the template module directly. */
export { DEFAULT_PERSONA_BODY }

/** The confidence ladder, re-exported for the consolidator. */
export type { Confidence }
