/**
 * Skill draft generation (P7, memorybuddy-plan §6).
 *
 * This is the producer `skills-draft/` never had. Everything downstream — the
 * panel's red dot, the banner, the pending cards, 批准/忽略 — existed and worked;
 * no code ever wrote a file into that directory, so the whole approval flow was
 * dead code waiting for this file.
 *
 * ## What counts as "the same operation repeated"
 *
 * The plan says 「同一类操作在多个会话中重复出现（≥3 次、≥2 个日期）」 without
 * naming the categories. Three deterministic signals are available, and all three
 * are mined in a fixed priority order, because a draft the user cannot use costs
 * more attention than a draft they miss:
 *
 * 1. **项目约定** — a fact consolidation already merged into
 *    `memory/projects/<slug>.md` (P6).
 * 2. **长期记忆条目** — a topic entry consolidation already corroborated.
 * 3. **工具组合** — a repeated *shape* of work inside one project, mined from the
 *    aggregate line the collector writes. Only a combination is eligible, never
 *    a single tool: every session calls `read` and `grep`, so a single-tool rule
 *    fires on nothing but noise, while a repeated pairing is what "how I work in
 *    this repo" actually looks like.
 *
 * Classes 1 and 2 read what consolidation *already decided* — a merged entry's
 * corroboration count is the same 中/高 badge the user sees, and re-deriving it
 * here would duplicate the dedupe logic and risk disagreeing with it. Only
 * class 3 mines raw notes, because tool traffic has no merged store.
 *
 * ## Determinism
 *
 * The generator never calls a model. A draft that appears or disappears based on
 * a remote call's mood is not something an approval prompt can be honest about,
 * and P5's model stage has no business writing files the user has not seen.
 *
 * ## What it never does
 *
 * It never writes to `$DSH_HOME/skills/`. Generation stops at `skills-draft/`;
 * promotion is `store.approveDraft`, which only the panel's 批准 button calls.
 * That is memory-plan §6.2's bottom line and the reason the feature exists, so
 * it is enforced by construction: nothing in this module touches the skills root.
 */

import type { Entry } from './entries.ts'
import { TOPICS } from '../protocol.ts'
import type { MemoryStore } from './store.ts'

/**
 * The plan's threshold: repeated ≥3 times AND across ≥2 dates.
 *
 * Both halves matter and they are not redundant. Three repetitions inside one
 * day is one busy afternoon, not a habit; two dates corroborated once each is a
 * habit but a weak one. Requiring both is what keeps the queue from filling with
 * incidents.
 */
export const MIN_REPEATS = 3
export const MIN_DATES = 2

/** How many session notes one pass looks back over. */
export const SCAN_LIMIT = 200

/** How many tools must co-occur before the tools class is eligible. */
const MIN_TOOLS = 2

/** Tools that carry no skill signal on their own and are dropped from class 3. */
const NOISE_TOOLS = new Set(['read', 'glob', 'grep', 'pwsh', 'todowrite', 'todo_write', 'taskboard'])

/** One mined pattern, before it becomes a draft. */
export interface SkillCandidate {
  /** Which signal produced it; decides the title and the wording. */
  kind: 'project' | 'habit' | 'tools'
  /** The directory name, e.g. `dsh-memorybuddy-build`. */
  name: string
  /** One line for the card heading. */
  title: string
  /** The one-sentence summary that goes into `description:`. */
  description: string
  /** The `whenToUse:` line. */
  whenToUse: string
  /** The numbered body: one line per corroborating occurrence. */
  steps: string[]
  /** Session notes that witnessed the pattern, oldest first. */
  derivedFrom: string[]
  /** Distinct dates the pattern spans, oldest first. */
  dates: string[]
  /** Total occurrences seen — what `repeats:` records. */
  repeats: number
}

/** One session note as the generator needs to see it. */
export interface NoteSample {
  /** `sessions/<date>/<id>.md` — the `derivedFrom` value. */
  path: string
  /** `YYYY-MM-DD`. */
  date: string
  /** The note body. */
  body: string
  /** The workspace the session ran in, from the note's front-matter. */
  workspace: string
}

/**
 * The dates a `derivedFrom` path witnesses.
 *
 * A merged entry records only `first` and `last`, which are the two ENDPOINTS of
 * its span — not the set of dates that corroborated it. Claiming "跨 N 个日期"
 * from the endpoints would report 2 for a pattern that actually appeared on five
 * days, so the real date set is recovered from the source paths themselves, where
 * the date is the directory name by construction.
 */
export function datesOfSources(sources: readonly string[]): string[] {
  const dates = new Set<string>()
  for (const source of sources) {
    const match = /^sessions\/(\d{4}-\d{2}-\d{2})\//.exec(source)
    if (match !== null) dates.add(match[1])
  }
  return [...dates].sort()
}

/** What one generation pass did. */
export interface GenerationReport {
  /** Drafts written this pass. */
  created: string[]
  /** Patterns that already had a draft, or collided on one, and were left alone. */
  skipped: string[]
}

/* ------------------------------------------------------------------ *
 * The generator
 * ------------------------------------------------------------------ */

/**
 * Scan the notes and write drafts for every pattern that reaches the threshold.
 *
 * An existing draft is never rewritten: `createdAt` is what the 30-day archive
 * counts from, and a draft whose text shifts under the user's cursor while they
 * read it is worse than one that stays put. A pattern that already has a draft is
 * reported as `skipped`.
 */
export class SkillGenerator {
  private readonly store: MemoryStore
  private readonly log: (message: string) => void

  constructor(store: MemoryStore, log: (message: string) => void) {
    this.store = store
    this.log = log
  }

  /**
   * Mine the three classes and write the drafts that qualify.
   *
   * Never throws: a skill draft is a bonus, and a store hiccup while looking for
   * bonuses must not cost the pass its topic writes.
   */
  async run(now = new Date().toISOString()): Promise<GenerationReport> {
    const report: GenerationReport = { created: [], skipped: [] }
    let candidates: SkillCandidate[]
    try {
      candidates = await this.mine()
    } catch (error) {
      this.log(`技能草稿扫描失败：${String(error)}`)
      return report
    }
    // Two candidates can land on the same directory name — the fragment is a
    // lossy hash of the claim, so two near-identical entries in one project
    // collide. First one wins; the second would otherwise overwrite a draft the
    // user may be reading.
    const claimed = new Set<string>()
    for (const candidate of candidates) {
      if (claimed.has(candidate.name)) {
        report.skipped.push(candidate.name)
        continue
      }
      if (await this.store.draftExists(candidate.name)) {
        report.skipped.push(candidate.name)
        continue
      }
      claimed.add(candidate.name)
      try {
        await this.store.writeSkillDraft(candidate.name, candidate, now)
        report.created.push(candidate.name)
        this.log(`已生成技能草稿 ${candidate.name}（重复 ${candidate.repeats} 次，跨 ${candidate.dates.length} 天）`)
      } catch (error) {
        this.log(`技能草稿 ${candidate.name} 写入失败：${String(error)}`)
      }
    }
    return report
  }

  /** Mine the three classes, in priority order. */
  private async mine(): Promise<SkillCandidate[]> {
    const [topics, samples] = await Promise.all([this.store.readAllEntries(), this.collect()])
    const candidates: SkillCandidate[] = []
    candidates.push(...(await this.projects()))
    candidates.push(...candidatesFromEntries(topics))
    candidates.push(...candidatesFromTools(samples))
    return candidates.sort((a, b) => b.repeats - a.repeats)
  }

  /** Project conventions, read one file at a time so one bad file is survivable. */
  private async projects(): Promise<SkillCandidate[]> {
    const candidates: SkillCandidate[] = []
    for (const project of await this.store.readProjects()) {
      const slug = project.slug
      let entries: Entry[]
      try {
        entries = await this.store.readProjectEntries(slug)
      } catch (error) {
        this.log(`项目 ${slug} 的技能草稿扫描跳过：${String(error)}`)
        continue
      }
      for (const entry of entries) {
        if (!corroborated(entry)) continue
        const sources = [...entry.sources].sort()
        const dates = datesOfSources(sources)
        candidates.push({
          kind: 'project',
          name: `${slug}-${nameFragment(entry.text)}`.slice(0, 64).replace(/-+$/, ''),
          title: `${slug} 的项目约定`,
          description: excerpt(entry.text),
          whenToUse: `在 ${slug} 目录里工作、或要改动这个项目时先按这条来。`,
          steps: [`1. ${entry.text}`],
          derivedFrom: sources,
          dates,
          repeats: sources.length,
        })
      }
    }
    return candidates
  }

  /**
   * Read the recent notes as samples.
   *
   * Bounded at `SCAN_LIMIT` newest notes: the corroboration rule needs history,
   * but a notes tree that grows without bound would make every pass re-read all
   * of it. The cap is generous enough that a pattern assembled over weeks still
   * reaches the threshold on the pass that completes it.
   */
  private async collect(): Promise<NoteSample[]> {
    const notes = await this.store.readSessions(SCAN_LIMIT)
    const samples: NoteSample[] = []
    for (const note of notes) {
      const document = await this.store.readDocument(note.path)
      samples.push({
        path: note.path,
        date: note.date,
        body: document.body,
        workspace: typeof document.front.workspace === 'string' ? document.front.workspace : '',
      })
    }
    return samples
  }
}

/* ------------------------------------------------------------------ *
 * Classes 1 and 2 — what consolidation already learned
 * ------------------------------------------------------------------ */

/** The merged topic entries keyed by topic. */
type EntriesByTopic = Record<string, Entry[]>

/** Topic entries consolidation corroborated across dates. */
function candidatesFromEntries(entries: EntriesByTopic): SkillCandidate[] {
  const candidates: SkillCandidate[] = []
  for (const topic of TOPICS) {
    const title = topic.title
    for (const entry of entries[topic.key] ?? []) {
      if (!corroborated(entry)) continue
      const sources = [...entry.sources].sort()
      const dates = datesOfSources(sources)
      candidates.push({
        kind: 'habit',
        name: `${nameFragment(entry.text)}-${confidenceTag(entry.confidence)}`,
        title: `反复出现的${title}`,
        description: excerpt(entry.text),
        whenToUse: `遇到同类事情时照这条来：${excerpt(entry.text, 60)}`,
        steps: [`1. ${entry.text}`],
        derivedFrom: sources,
        dates,
        repeats: sources.length,
      })
    }
  }
  return candidates
}

/**
 * Whether one merged entry clears the plan's threshold.
 *
 * The ≥3 half counts the sessions that said it (`entry.sources`); the ≥2-dates
 * half counts the distinct dates among those same sessions, recovered from the
 * paths — see `datesOfSources`. Using `entry.days` for the second test instead
 * would accept an entry whose corroboration is real but whose DATES cannot be
 * shown, because the draft has to name them.
 *
 * An entry whose sources carry no parseable date fails the second test: a pattern
 * with no dates to show cannot honestly claim 「跨 ≥2 个日期」.
 */
export function corroborated(entry: Entry): boolean {
  const sources = [...new Set(entry.sources.filter(source => source !== ''))]
  if (sources.length < MIN_REPEATS) return false
  return datesOfSources(sources).length >= MIN_DATES
}

/* ------------------------------------------------------------------ *
 * Class 3 — repeated tool combinations inside one project
 * ------------------------------------------------------------------ */

/** One session's witness of a pattern. */
interface Occurrence {
  path: string
  date: string
}

/**
 * A tool pairing that keeps showing up in the same project.
 *
 * The aggregate line the collector already writes
 * (`- 工具调用 12 次：read ×8、edit ×3`) carries this, so the class costs one regex
 * per note and no new instrumentation.
 */
function candidatesFromTools(samples: readonly NoteSample[]): SkillCandidate[] {
  const bySlug = new Map<string, Map<string, Occurrence[]>>()
  for (const sample of samples) {
    const slug = lastSegment(sample.workspace)
    if (slug === '') continue
    const names = toolsIn(sectionLines(sample.body, '## 做了什么'))
    if (names.length < MIN_TOOLS) continue
    let combos = bySlug.get(slug)
    if (combos === undefined) {
      combos = new Map<string, Occurrence[]>()
      bySlug.set(slug, combos)
    }
    for (const combo of pairs(names)) {
      const list = combos.get(combo) ?? []
      list.push({ path: sample.path, date: sample.date })
      combos.set(combo, list)
    }
  }
  const candidates: SkillCandidate[] = []
  for (const [slug, combos] of bySlug) {
    for (const [combo, occurrences] of combos) {
      const dates = [...new Set(occurrences.map(item => item.date))].sort()
      if (dates.length < MIN_DATES || occurrences.length < MIN_REPEATS) continue
      const tools = combo.split('+')
      candidates.push({
        kind: 'tools',
        name: `${slug}-${tools.map(nameFragment).join('-')}`.slice(0, 64).replace(/-+$/, ''),
        title: `${slug} 里常用的工具组合`,
        description: `在 ${slug} 里，${tools.join(' 与 ')} 在 ${dates.length} 个日期里反复一起出现（${occurrences.length} 次会话）。`,
        whenToUse: `在 ${slug} 里做同类工作时，优先用这组工具。`,
        steps: dates.map((date, index) => `${index + 1}. ${date} 的会话里用了 ${tools.join(' 与 ')}`),
        derivedFrom: [...new Set(occurrences.map(item => item.path))].sort(),
        dates,
        repeats: occurrences.length,
      })
    }
  }
  return candidates
}

/** The tool names in a note's aggregate line, in first-seen order. */
function toolsIn(lines: readonly string[]): string[] {
  for (const line of lines) {
    const match = /^\s*[-*]\s*工具调用\s+\d+\s*次[：:]\s*(.+?)(?:（失败\s*\d+\s*次）)?\s*$/.exec(line)
    if (match === null) continue
    const names: string[] = []
    for (const part of match[1].split('、')) {
      const name = part.replace(/×\s*\d+\s*$/, '').trim()
      if (name === '' || NOISE_TOOLS.has(name.toLowerCase())) continue
      if (!names.includes(name)) names.push(name)
    }
    return names
  }
  return []
}

/**
 * Every unordered adjacent pair of `names`, as a sorted `a+b` key.
 *
 * Adjacent rather than combinatorial: five tools in a session would otherwise
 * yield ten patterns that all claim the same evidence, and the user would get ten
 * drafts from one working day. Sorted so the key is order-independent — `edit`
 * before `read` and `read` before `edit` are one pattern, not two.
 */
export function pairs(names: readonly string[]): string[] {
  const result: string[] = []
  for (let i = 0; i + 1 < names.length; i += 1) {
    result.push([names[i], names[i + 1]].sort().join('+'))
  }
  return [...new Set(result)]
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

/** The list lines of one `## …` section, or `[]` when the section is absent. */
export function sectionLines(body: string, heading: string): string[] {
  const lines = body.split('\n')
  const start = lines.findIndex(line => line.trim() === heading)
  if (start < 0) return []
  const end = lines.findIndex((line, index) => index > start && /^##\s+/.test(line.trim()))
  return lines.slice(start + 1, end < 0 ? lines.length : end)
}

/** Shorten a claim for a one-line description. */
function excerpt(text: string, max = 80): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max)}…`
}

/** The last path segment of a workspace — the project slug (P6's rule). */
function lastSegment(workspace: string): string {
  return workspace.replaceAll('\\', '/').split('/').filter(part => part !== '').pop() ?? ''
}

/**
 * A directory-safe fragment of a claim.
 *
 * DSH's skill loader reads `$DSH_HOME/skills/<name>/SKILL.md`, so a name with a
 * path separator or a space would not survive that path; everything outside
 * `[a-z0-9]` collapses to `-`. A fully Chinese claim leaves nothing, so it is
 * hashed instead: stable across passes, and two different claims can never
 * collide on an empty string. The readable Chinese stays in `title` /
 * `description`, where a human is the one looking.
 */
export function nameFragment(text: string): string {
  const ascii = text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (ascii !== '') return ascii.slice(0, 32).replace(/-+$/, '')
  let hash = 0
  for (const char of text) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0
  return `skill-${hash.toString(36).slice(0, 8)}`
}

/** A short confidence marker, so two habits never collide on one directory. */
function confidenceTag(confidence: string): string {
  return confidence === '高' ? 'high' : confidence === '中' ? 'mid' : 'low'
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

/**
 * The markdown body of a draft, below the front-matter.
 *
 * It is deliberately a *summary of evidence*, not an invented procedure. A draft
 * claiming steps the user never took would be a fabrication wearing this
 * plugin's name; what is written here is what the sessions actually showed, and
 * 批准 / 编辑后批准 are how the user turns it into an instruction of their own.
 */
export function renderDraftBody(candidate: SkillCandidate): string {
  return [
    `# ${candidate.title}`,
    '',
    '> 这份草稿由 MemoryBuddy 从你的会话里自动提炼，请先确认再批准。',
    '',
    '## 步骤',
    ...candidate.steps,
    '',
    '## 证据',
    `- 在 ${candidate.repeats} 次会话里出现，跨 ${candidate.dates.length} 个日期（${candidate.dates.join('、')}）`,
    `- 来源会话：${candidate.derivedFrom.map(trimSession).join('、')}`,
  ].join('\n')
}

/** `sessions/2026-01-02/abc.md` → `2026-01-02 abc`, for a one-line evidence list. */
function trimSession(path: string): string {
  return path.replace(/^sessions\//, '').replace(/\.md$/, '')
}
