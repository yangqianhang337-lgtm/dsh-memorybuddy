/**
 * The deterministic consolidation pass (memory-plan §6.1.1 stage 1).
 *
 * This is the half of consolidation that never calls a model, and it is the
 * only half the first release ships. It reads every session note marked
 * `consolidated: false`, lifts the candidate lines out of them, merges each
 * candidate into the topic file it belongs to (or adds it), raises
 * corroboration, decays what has gone stale, and rebuilds `memory/index.md`.
 *
 * The ordering matters and is the plan's: **back up first, then apply, then
 * journal**. A crash anywhere in the middle therefore leaves either the old
 * files plus a backup (harmless) or the new files plus a journal entry (also
 * harmless) — never a half-applied pass with no way back.
 */

import { INDEX_PLACEHOLDER, INDEX_SECTIONS, memoryIndexTemplate } from './templates.ts'
import {
  MERGE_THRESHOLD,
  confidenceForDays,
  contradicts,
  dayKey,
  entryId,
  parseEntries,
  similarity,
  type Entry,
} from './entries.ts'
import { TOPICS, type Confidence, type EntryView, type TopicKey } from '../protocol.ts'
import { frontString, parseDocument } from './document.ts'
import type { MemoryStore, PluginState } from './store.ts'

/** A candidate lifted out of one session note. */
export interface Candidate {
  text: string
  /** The topic the note suggested, when the line named one. */
  topic: TopicKey | undefined
  /** The note it came from, for `src:` provenance. */
  source: string
  /** `YYYY-MM-DD` the note belongs to — the unit of corroboration. */
  date: string
}

/** What one pass changed, for the journal and the panel. */
export interface ConsolidationReport {
  reason: string
  scanned: number
  added: number
  merged: number
  conflicted: number
  archived: number
  questions: string[]
  files: string[]
  at: string
}

/** Decay windows, in days (memory-plan §5.3). */
const DECAY_DAYS: Record<Confidence, number | null> = { 低: 30, 中: 90, 高: null }
/** A 高-confidence entry is questioned after this long without a related session. */
const STALE_QUESTION_DAYS = 180

/** Parse `YYYY-MM-DD` into a local date, or `undefined`. */
function parseDay(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (match === null) return undefined
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? undefined : date
}

/** Whole days between two `YYYY-MM-DD` values (negative when `later` is first). */
export function daysBetween(earlier: string, later: string): number {
  const a = parseDay(earlier)
  const b = parseDay(later)
  if (a === undefined || b === undefined) return 0
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

/**
 * Lift candidate lines out of one session note body.
 *
 * The collector writes them as `- (候选 · <label>) <text> · seq <N>`; anything
 * else in the note is context for a human, not a memory, and is ignored. A
 * note with no candidates contributes nothing — which is the common case and
 * the reason consolidation is cheap.
 */
export function candidatesFrom(noteBody: string, source: string, date: string): Candidate[] {
  const candidates: Candidate[] = []
  for (const raw of noteBody.split('\n')) {
    const match = /^\s*[-*]\s+\(候选(?:\s*·\s*([^)]*))?\)\s*(.+?)\s*$/.exec(raw)
    if (match === null) continue
    const text = match[2].replace(/\s*·\s*seq\s+\d+\s*$/i, '').trim()
    if (text === '' || text.startsWith('（无）')) continue
    candidates.push({ text, topic: topicFor(match[1]), source, date })
  }
  return candidates
}

/** Guess the topic of a candidate from its label, defaulting to habits. */
function topicFor(label: string | undefined): TopicKey {
  if (label === undefined) return 'habits'
  if (label.includes('环境') || label.includes('路径')) return 'environment'
  if (label.includes('背景')) return 'background'
  if (label.includes('偏好') || label.includes('风格')) return 'preferences-learned'
  return 'habits'
}

/**
 * The consolidator.
 *
 * One instance per plugin mount. `run` is re-entrant-safe: the store takes the
 * file lock per document, and the caller (the trigger scheduler) additionally
 * refuses to start a pass while one is in flight.
 */
export class Consolidator {
  private readonly store: MemoryStore
  private readonly log: (message: string) => void
  private running = false

  constructor(store: MemoryStore, log: (message: string) => void) {
    this.store = store
    this.log = log
  }

  /** True while a pass is in flight. */
  get busy(): boolean {
    return this.running
  }

  /**
   * Run one deterministic pass.
   *
   * Returns the report even when nothing changed, because the panel shows the
   * reason ("暂无可整理的会话") rather than hiding the button's effect.
   */
  async run(reason: string, limit = 20): Promise<ConsolidationReport> {
    const at = new Date().toISOString()
    const report: ConsolidationReport = {
      reason,
      scanned: 0,
      added: 0,
      merged: 0,
      conflicted: 0,
      archived: 0,
      questions: [],
      files: [],
      at,
    }
    if (this.running) {
      report.questions.push('上一次整理还在进行中，本次已跳过。')
      return report
    }
    this.running = true
    try {
      await this.runInner(report, limit)
    } catch (error) {
      this.log(`整理失败：${String(error)}`)
      report.questions.push(`整理过程中出错：${String(error)}`)
    } finally {
      this.running = false
    }
    return report
  }

  /** The body of one pass. */
  private async runInner(report: ConsolidationReport, limit: number): Promise<void> {
    await this.store.ensure()
    const state = await this.store.readState()
    const pending = state.pending.slice(0, limit)
    const today = dayKey()

    // 1. Read every pending note into candidates. Nothing is written yet, so a
    //    failure here costs nothing.
    const candidates: Candidate[] = []
    const consumed: string[] = []
    for (const relative of pending) {
      const document = await this.store.readDocument(relative)
      if (document.body.trim() === '' && Object.keys(document.front).length === 0) continue
      const date = frontString(document.front, 'started', today).slice(0, 10)
      candidates.push(...candidatesFrom(document.body, relative, /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today))
      consumed.push(relative)
      report.scanned += 1
    }

    // 2. Back up every file this pass may rewrite, BEFORE touching anything.
    const touched = new Set<string>([
      'memory/index.md',
      ...TOPICS.map(topic => `memory/${topic.file}`),
    ])
    const entriesByTopic = new Map<TopicKey, Entry[]>()
    for (const topic of TOPICS) entriesByTopic.set(topic.key, await this.store.readEntries(topic.key))

    const before = new Map<string, EntryView[]>()
    for (const [topic, entries] of entriesByTopic) before.set(topic, entries.map(stripLine))

    // 3. Apply: merge each candidate into its topic.
    for (const candidate of candidates) {
      const topic = candidate.topic ?? 'habits'
      const entries = entriesByTopic.get(topic)
      if (entries === undefined) continue
      this.applyCandidate(entries, candidate, report)
    }

    // 4. Decay: archive what has gone stale, question what claims to be settled.
    for (const topic of TOPICS) {
      const entries = entriesByTopic.get(topic.key)
      if (entries === undefined) continue
      await this.decay(topic.key, entries, today, report)
    }

    // 5. Write: only topics that actually changed, then the index.
    const changedTopics = TOPICS.filter(topic => {
      const previous = before.get(topic.key) ?? []
      const next = entriesByTopic.get(topic.key) ?? []
      return JSON.stringify(previous) !== JSON.stringify(next.map(stripLine))
    })
    if (changedTopics.length > 0 || consumed.length > 0) {
      await this.store.backup([...touched])
      report.files.push(...touched)
    }
    for (const topic of changedTopics) {
      await this.store.writeEntries(topic.key, (entriesByTopic.get(topic.key) ?? []).map(stripLine))
    }
    if (changedTopics.length > 0) await this.rebuildIndex(entriesByTopic)

    // 6. Journal, then clear the watermark. The order is deliberate: a note is
    //    only marked consolidated once its content is safely on disk.
    if (consumed.length > 0 || changedTopics.length > 0) {
      await this.store.appendJournal(this.journalLines(report, consumed, changedTopics))
    }
    // `patchState` merges against the file as it is *now*: the collector may have
    // added a note (and its watermark) while this pass was reading notes, and a
    // blind overwrite would drop it — the note would be consolidated twice and
    // the watermark rolled back.
    await this.store.patchState(current => ({
      ...current,
      pending: current.pending.filter(relative => !consumed.includes(relative)),
      lastConsolidateAt: report.at,
      questions: this.mergeQuestions(current.questions, report.questions),
    }))
  }

  /**
   * Keep the unanswered questions in `state.json` for the panel.
   *
   * A pass re-raises the same conflict every time it sees the same pair, so the
   * new list replaces the old one instead of growing without bound; the union
   * keeps a question raised by a *different* topic alive.
   */
  private mergeQuestions(existing: readonly string[], raised: readonly string[]): string[] {
    const next = [...raised]
    for (const question of existing) {
      if (!next.includes(question)) next.push(question)
    }
    return next.slice(0, 50)
  }

  /**
   * Fold one candidate into a topic's entry list.
   *
   * Merge when an existing entry says the same thing (similarity ≥ 0.75) or
   * contradicts it — a contradiction is merged as a *marked* conflict rather
   * than added as a third line, so the pair the user is asked about stays a
   * pair. Everything else is a new entry.
   */
  private applyCandidate(entries: Entry[], candidate: Candidate, report: ConsolidationReport): void {
    let best: Entry | undefined
    let bestScore = 0
    for (const entry of entries) {
      const score = similarity(entry.text, candidate.text)
      if (score > bestScore) {
        bestScore = score
        best = entry
      }
    }
    if (best !== undefined && bestScore >= MERGE_THRESHOLD) {
      if (best.pinned) return
      best.days = new Set([...corroborationDates(best), candidate.date]).size
      best.confidence = confidenceForDays(best.days)
      if (best.last < candidate.date) best.last = candidate.date
      if (candidate.date < best.first) best.first = candidate.date
      if (!best.sources.includes(candidate.source)) best.sources.push(candidate.source)
      report.merged += 1
      return
    }
    if (best !== undefined && contradicts(best.text, candidate.text)) {
      if (!best.pinned) {
        best.conflict = true
        best.sources = [...new Set([...best.sources, candidate.source])]
      }
      report.conflicted += 1
      report.questions.push(`「${truncate(best.text)}」与「${truncate(candidate.text)}」互相矛盾，请在下一次整理时二选一。`)
      return
    }
    entries.push({
      id: entryId(candidate.text),
      text: candidate.text,
      confidence: '低',
      days: 1,
      first: candidate.date,
      last: candidate.date,
      sources: [candidate.source],
      pinned: false,
      conflict: false,
      line: entries.length,
    })
    report.added += 1
  }

  /**
   * Move stale entries into `archive/` and collect the questions.
   *
   * 高 entries are never archived, but one that has not been corroborated for
   * 180 days gets a question instead — the plan asks rather than assumes.
   */
  private async decay(
    topic: TopicKey,
    entries: Entry[],
    today: string,
    report: ConsolidationReport,
  ): Promise<void> {
    const doomed: string[] = []
    for (const entry of entries) {
      if (entry.pinned) continue
      const age = daysBetween(entry.last, today)
      const window = DECAY_DAYS[entry.confidence]
      if (window !== null && age >= window) {
        doomed.push(entry.id)
        continue
      }
      if (entry.confidence === '高' && age >= STALE_QUESTION_DAYS) {
        report.questions.push(`「${truncate(entry.text)}」已经 ${age} 天没有新的佐证了，这条还成立吗？`)
      }
    }
    if (doomed.length === 0) return
    report.archived += await this.store.archiveEntries(topic, doomed, 'decay')
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      if (doomed.includes(entries[index].id)) entries.splice(index, 1)
    }
  }

  /**
   * Rebuild `memory/index.md` from the topic files.
   *
   * Only 中 and 高 entries appear (memory-plan §5.2): the index is the part
   * that gets injected into every prompt, so a 低 candidate must not spend the
   * budget before it has been corroborated.
   */
  private async rebuildIndex(entriesByTopic: Map<TopicKey, Entry[]>): Promise<void> {
    const document = await this.store.readDocument('memory/index.md')
    const lines: string[] = ['# 长期记忆', '']
    for (const section of INDEX_SECTIONS) {
      const entries =
        section.key === 'projects'
          ? []
          : (entriesByTopic.get(section.key as TopicKey) ?? []).filter(
            entry => entry.confidence !== '低' || entry.pinned,
          )
      lines.push(`## ${section.title}`)
      if (entries.length === 0) {
        lines.push(INDEX_PLACEHOLDER)
      } else {
        for (const entry of entries) {
          const flags = [entry.confidence, `${entry.days} 天`, entry.pinned ? 'pinned' : '', entry.conflict ? '⚠ 冲突' : '']
            .filter(part => part !== '')
            .join(' · ')
          lines.push(`- ${entry.text} <sub>${flags}</sub>`)
        }
      }
      lines.push('')
    }
    const now = new Date().toISOString()
    const front = {
      ...document.front,
      kind: 'memory-index',
      schema: 1,
      generated: now,
      updated: now,
      sources: ['habits', 'background', 'environment', 'preferences-learned'],
    }
    await this.store.writeDocument('memory/index.md', front, lines.join('\n').trimEnd())
  }

  /** The journal lines of one pass. */
  private journalLines(
    report: ConsolidationReport,
    consumed: readonly string[],
    changed: readonly { key: string; file: string }[],
  ): string[] {
    const lines = [
      `触发方式：${report.reason}`,
      `扫描会话笔记 ${report.scanned} 个（本次标记为已整理 ${consumed.length} 个）`,
      `新增 ${report.added} 条 · 合并 ${report.merged} 条 · 冲突 ${report.conflicted} 条 · 归档 ${report.archived} 条`,
      `改写文件：${changed.length === 0 ? '（无）' : changed.map(topic => `memory/${topic.file}`).join('、')}`,
      '模型提炼：未启用（首版只做确定性整理）',
    ]
    if (report.questions.length > 0) {
      lines.push(`待确认 ${report.questions.length} 项：`)
      for (const question of report.questions) lines.push(`  - ${question}`)
    }
    return lines
  }
}

/** Corroboration dates already recorded for an entry. */
function corroborationDates(entry: Entry): string[] {
  const dates = new Set<string>()
  if (/^\d{4}-\d{2}-\d{2}$/.test(entry.first)) dates.add(entry.first)
  if (/^\d{4}-\d{2}-\d{2}$/.test(entry.last)) dates.add(entry.last)
  return [...dates]
}

/** Drop the parse-only `line` field. */
function stripLine(entry: Entry): EntryView {
  const { line: _line, ...rest } = entry
  return rest
}

/** Shorten an entry for a question line. */
function truncate(text: string, max = 40): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`
}

/** Re-exported for the panel's "why is this empty" copy. */
export { memoryIndexTemplate, parseDocument }
