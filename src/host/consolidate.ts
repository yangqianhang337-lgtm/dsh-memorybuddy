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
  daysBetween,
  entryId,
  parseEntries,
  similarity,
  type Entry,
} from './entries.ts'
import { TOPICS, type Confidence, type EntryView, type ModelRunView, type TopicKey } from '../protocol.ts'
import { frontString, parseDocument } from './document.ts'
import type { Distiller } from './distill.ts'
import { extractProjectFacts, type ProjectCandidate } from './project.ts'
import { SkillGenerator, type GenerationReport } from './skills.ts'
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
  /** What the model stage did, when it ran at all (§4.4). */
  model?: ModelRunView
  /** Project facts filed into `memory/projects/` this pass (P6). */
  projectAdded: number
  projectMerged: number
  projectFiles: string[]
  /** Skill drafts generated this pass (P7). */
  draftsCreated: string[]
  /** Drafts nobody acted on for 30 days, moved into `archive/` (P7). */
  draftsArchived: string[]
}

/** Decay windows, in days (memory-plan §5.3). */
const DECAY_DAYS: Record<Confidence, number | null> = { 低: 30, 中: 90, 高: null }
/** A 高-confidence entry is questioned after this long without a related session. */
const STALE_QUESTION_DAYS = 180

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
  private readonly generator: SkillGenerator
  private running = false
  /**
   * The model stage, injected after construction.
   *
   * It is a setter rather than a constructor argument because `index.ts` builds
   * the store and the consolidator before it can soft-probe `ctx.get('llm')`,
   * and the scheduler may already be ticking. Absent means deterministic-only,
   * which is exactly the pre-P5 behaviour.
   */
  private distiller: Distiller | undefined

  constructor(store: MemoryStore, log: (message: string) => void) {
    this.store = store
    this.log = log
    this.generator = new SkillGenerator(store, log)
  }

  /** Install the model stage. Called once the `llm` service is known. */
  setDistiller(distiller: Distiller | undefined): void {
    this.distiller = distiller
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
      projectAdded: 0,
      projectMerged: 0,
      projectFiles: [],
      draftsCreated: [],
      draftsArchived: [],
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
    const projectCandidates: ProjectCandidate[] = []
    const consumed: string[] = []
    for (const relative of pending) {
      const document = await this.store.readDocument(relative)
      if (document.body.trim() === '' && Object.keys(document.front).length === 0) continue
      const date = frontString(document.front, 'started', today).slice(0, 10)
      const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today
      candidates.push(...candidatesFrom(document.body, relative, day))
      // P6: the note's workspace front-matter decides which project file a
      // `## 项目相关` fact belongs to; a note without one has no project.
      const workspace = frontString(document.front, 'workspace', '')
      projectCandidates.push(...extractProjectFacts(document.body, workspace, relative, day))
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

    // 3.1 Project memory (P6): file each `## 项目相关` fact into its project's
    //     file. Runs before the model stage so a model op can still touch the
    //     topics the project stage left alone — the two stages share no files.
    await this.projectStage(projectCandidates, report)

    // 3.5 The model stage. It runs on the candidates the deterministic pass just
    //     consumed, and its operations go through the same merge path, so a
    //     model suggestion can merge into an entry rather than duplicate it.
    //     Everything about it is optional: if it is absent, fails, or returns
    //     nothing usable, step 4 onward proceeds exactly as before.
    await this.distillStage(candidates, entriesByTopic, report)

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

    // 5.1 Skill drafts (P7 §6.2 A/C). It runs AFTER the writes above on purpose:
    //     the generator reads the merged entries and project files this pass
    //     just produced, so a convention corroborated by the note that arrived
    //     today can generate its draft in the very same pass instead of waiting
    //     for the next one.
    await this.skillStage(report)

    // 6. Journal, then clear the watermark. The order is deliberate: a note is
    //    only marked consolidated once its content is safely on disk.
    if (consumed.length > 0 || changedTopics.length > 0 || report.draftsCreated.length > 0 || report.draftsArchived.length > 0) {
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
      ...(report.model === undefined ? {} : { lastModelRun: report.model }),
    }))
  }

  /**
   * Generate skill drafts and archive the stale ones (P7 §6.2 A/C).
   *
   * Two halves, in this order. Generation first, because a draft created today
   * carries today's `createdAt` and the archive pass must not immediately judge
   * it stale. The archive half is the plan's 30-day rule and is a move into
   * `archive/skills-draft/`, never a delete.
   *
   * This method must never throw. A skill draft is a bonus on top of a pass whose
   * topic writes are already on disk, and losing those to a scan hiccup would
   * trade a durable outcome for a cosmetic one.
   */
  private async skillStage(report: ConsolidationReport): Promise<void> {
    try {
      const generation: GenerationReport = await this.generator.run(report.at)
      report.draftsCreated = generation.created
    } catch (error) {
      this.log(`技能草稿生成失败：${String(error)}`)
    }
    try {
      report.draftsArchived = await this.store.archiveStaleDrafts()
    } catch (error) {
      this.log(`技能草稿归档失败：${String(error)}`)
    }
  }

  /**
   * Run the model stage and fold whatever survives validation into the topics.
   *
   * This method must never throw: the deterministic result is already in memory
   * and is about to be written, and losing it because a model route was flaky
   * would be strictly worse than never having called a model at all.
   */
  private async distillStage(
    candidates: readonly Candidate[],
    entriesByTopic: Map<TopicKey, Entry[]>,
    report: ConsolidationReport,
  ): Promise<void> {
    const distiller = this.distiller
    if (distiller === undefined) return
    let outcome
    try {
      outcome = await distiller.run({ candidates, entriesByTopic })
    } catch (error) {
      // `Distiller.run` already swallows its own failures; this is the belt to
      // that suspenders, because a throw here would lose the whole pass.
      this.log(`模型提炼异常：${String(error)}`)
      report.model = { skippedReason: `模型提炼异常：${String(error)}`, at: report.at }
      return
    }
    report.model = {
      ...(outcome.used === undefined ? {} : { used: outcome.used }),
      ...(outcome.fellBackFrom === undefined ? {} : { fellBackFrom: outcome.fellBackFrom }),
      ...(outcome.skippedReason === undefined ? {} : { skippedReason: outcome.skippedReason }),
      ...(outcome.failures.length === 0 ? {} : { failures: outcome.failures }),
      ...(outcome.rejected.length === 0 ? {} : { rejected: outcome.rejected }),
      tokens: outcome.tokens,
      applied: 0,
      at: report.at,
    }
    for (const proposal of outcome.proposals) {
      const entries = entriesByTopic.get(proposal.topic)
      if (entries === undefined) continue
      if (proposal.op === 'update') {
        const target = entries.find(entry => entry.id === proposal.id)
        // `validate` proved the entry existed and was not pinned; it can still
        // be gone here if an earlier proposal in the same diff replaced it.
        if (target === undefined) continue
        target.text = proposal.text
        report.model.applied = (report.model.applied ?? 0) + 1
        continue
      }
      // An `add` goes through the same similarity/contradiction machinery as a
      // candidate, so the model cannot create a near-duplicate of an entry the
      // deterministic pass already merged.
      this.applyCandidate(
        entries,
        { text: proposal.text, topic: proposal.topic, source: '模型提炼', date: dayKey() },
        report,
      )
      report.model.applied = (report.model.applied ?? 0) + 1
    }
    // applied === 0 is a NORMAL outcome here: the deterministic stage has
    // already merged every candidate by the time the model sees them, so a
    // correct `{"ops":[]}` is the expected reply most passes. The journal line
    // already records 应用 0 条; raising a 待确认 question for it would nag the
    // user on every pass and teach them to ignore the card.
    for (const rejection of outcome.rejected) report.questions.push(`模型提炼被拒绝：${rejection}`)
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
   * File project facts into `memory/projects/<slug>.md` (P6).
   *
   * The merge path is the topic path verbatim — `applyCandidate` works on any
   * `Entry[]` — so a project fact gets the same dedupe, contradiction marking
   * and confidence ladder as a habit. The only difference is the destination
   * file, and that each project file is backed up and written independently.
   *
   * This method must never throw: a bad project line must not cost the pass
   * its topic writes.
   */
  private async projectStage(candidates: readonly ProjectCandidate[], report: ConsolidationReport): Promise<void> {
    if (candidates.length === 0) return
    const bySlug = new Map<string, ProjectCandidate[]>()
    for (const candidate of candidates) {
      const list = bySlug.get(candidate.slug)
      if (list === undefined) bySlug.set(candidate.slug, [candidate])
      else list.push(candidate)
    }
    for (const [slug, facts] of bySlug) {
      try {
        await this.projectApply(slug, facts, report)
      } catch (error) {
        this.log(`项目记忆 ${slug} 整理失败：${String(error)}`)
        report.questions.push(`项目记忆 ${slug} 整理失败：${String(error)}`)
      }
    }
  }

  /** Merge one slug's facts into its file. */
  private async projectApply(
    slug: string,
    facts: readonly ProjectCandidate[],
    report: ConsolidationReport,
  ): Promise<void> {
    const entries = await this.store.readProjectEntries(slug)
    const before = JSON.stringify(entries.map(stripLine))
    const counters = { added: 0, merged: 0, questions: [] as string[] }
    for (const fact of facts) {
      this.applyProjectCandidate(entries, fact, counters)
    }
    if (JSON.stringify(entries.map(stripLine)) === before) return
    const relative = `memory/projects/${slug}.md`
    await this.store.backup([relative])
    await this.store.writeProjectEntries(slug, entries.map(stripLine))
    report.projectAdded += counters.added
    report.projectMerged += counters.merged
    if (counters.questions.length > 0) report.questions.push(...counters.questions)
    if (!report.projectFiles.includes(relative)) report.projectFiles.push(relative)
  }

  /** `applyCandidate` against a project file's counters. */
  private applyProjectCandidate(entries: Entry[], candidate: ProjectCandidate, counters: { added: number; merged: number; questions: string[] }): void {
    // Exactly the topic merge path; duplicated here only because
    // `applyCandidate` counts into the topic fields of the shared report.
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
      counters.merged += 1
      return
    }
    if (best !== undefined && contradicts(best.text, candidate.text)) {
      if (!best.pinned) {
        best.conflict = true
        best.sources = [...new Set([...best.sources, candidate.source])]
      }
      counters.questions.push(`「${truncate(best.text)}」与「${truncate(candidate.text)}」互相矛盾，请在下一次整理时二选一。`)
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
    counters.added += 1
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
      ...this.modelLines(report),
      ...this.projectLines(report),
      ...this.skillLines(report),
    ]
    if (report.questions.length > 0) {
      lines.push(`待确认 ${report.questions.length} 项：`)
      for (const question of report.questions) lines.push(`  - ${question}`)
    }
    return lines
  }

  /**
   * The journal's account of the model stage.
   *
   * The journal is the audit trail the user reads when they want to know what a
   * pass actually did, so it names the model, the tokens and the fallback —
   * "未启用" is only the truth when the stage really did not run.
   */
  private modelLines(report: ConsolidationReport): string[] {
    const model = report.model
    if (model === undefined) return ['模型提炼：未启用（确定性整理）']
    if (model.skippedReason !== undefined) return [`模型提炼：未执行（${model.skippedReason}）`]
    if (model.used === undefined) return ['模型提炼：未执行']
    const lines = [
      `模型提炼：${model.used}${model.tokens !== undefined && model.tokens > 0 ? `（${model.tokens} token）` : ''} · 应用 ${model.applied ?? 0} 条`,
    ]
    if (model.fellBackFrom !== undefined) {
      lines.push(`自选模型 ${model.fellBackFrom} 失败，已回退到 ${model.used}`)
    }
    for (const failure of model.failures ?? []) lines.push(`候选失败：${failure}`)
    for (const rejection of model.rejected ?? []) lines.push(`被拒绝：${rejection}`)
    return lines
  }

  /** The journal's account of the project stage (P6). */
  private projectLines(report: ConsolidationReport): string[] {
    if (report.projectFiles.length === 0) return []
    return [
      `项目记忆：新增 ${report.projectAdded} 条 · 合并 ${report.projectMerged} 条（${report.projectFiles.join('、')}）`,
    ]
  }

  /**
   * The journal's account of the skill stage (P7).
   *
   * Generation is reported even when it produced nothing, because the archive
   * half usually does run: a pass that silently moved three drafts out of the
   * pending list would otherwise leave the user wondering where they went.
   */
  private skillLines(report: ConsolidationReport): string[] {
    const lines: string[] = []
    if (report.draftsCreated.length > 0) {
      lines.push(`技能草稿：新增 ${report.draftsCreated.length} 份（${report.draftsCreated.join('、')}）—— 等待你批准`)
    }
    if (report.draftsArchived.length > 0) {
      lines.push(`技能草稿：${report.draftsArchived.length} 份超过 30 天未处理，已归档到 archive/skills-draft/`)
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
