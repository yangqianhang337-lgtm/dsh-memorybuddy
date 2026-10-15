/**
 * The injected prompt section (memory-plan §5.4).
 *
 * Order 120 places memory between the deployment persona (0) and the plan
 * policy (500): the persona says who the assistant is, memory says what it
 * knows about this user, and everything else follows.
 *
 * `interpolate: false` is not cosmetic. Memory text is user prose and may
 * contain `{{ }}`; with interpolation on, a remembered sentence could expand a
 * template variable — or fail to render at all.
 *
 * The renderer is called every turn, so it reads from a cache the writer
 * refreshes rather than hitting the disk inside the prompt path. The cache is
 * primed at mount and after every write; a miss returns the last known text,
 * never an empty section, because losing the user's memory mid-conversation is
 * worse than showing one turn of stale text.
 */

import { TOPICS, type PreferencesView, type TopicKey } from '../protocol.ts'
import { frontString, parseDocument } from './document.ts'
import { INDEX_PLACEHOLDER, INDEX_SECTIONS } from './templates.ts'
import type { MemoryStore } from './store.ts'

/** The name of the section, as it appears in the prompt ledger. */
export const SECTION_NAME = 'plugin:workbuddy-memory'
/** Between the persona (0) and PLAN_POLICY (500). */
export const SECTION_ORDER = 120
/** The line appended when the index had to be truncated. */
const TOOL_HINT = '（更多记忆见 workbuddy_memory 工具）'

/** The rendered text of one turn. */
export interface RenderedMemory {
  text: string
  /** Bytes actually spent, for the panel's diagnostics. */
  bytes: number
  /** True when the index did not fit and was cut. */
  truncated: boolean
}

/** The cache the prompt path reads. */
export class PromptCache {
  private readonly store: MemoryStore
  private preferences: PreferencesView | undefined
  private documents = new Map<string, string>()
  private primed = false

  constructor(store: MemoryStore) {
    this.store = store
  }

  /** Re-read every file the section renders. */
  async prime(): Promise<void> {
    const preferences = await this.store.readPreferences()
    const documents = new Map<string, string>()
    for (const relative of ['profile.md', 'instructions.md', 'memory/index.md']) {
      const document = await this.store.readDocument(relative)
      documents.set(relative, document.body)
    }
    this.preferences = preferences
    this.documents = documents
    this.primed = true
  }

  /** True once `prime` has succeeded at least once. */
  get ready(): boolean {
    return this.primed
  }

  /** The section text for one session. */
  render(workspace?: string): RenderedMemory {
    const preferences = this.preferences
    if (preferences === undefined) return { text: '', bytes: 0, truncated: false }

    const parts: string[] = []
    const header = this.renderPreferences(preferences)
    if (header !== '') parts.push(header)

    const persona = this.documents.get('profile.md')?.trim() ?? ''
    if (persona !== '') parts.push(`【人设】\n${clamp(persona, 800)}`)

    const instructions = this.documents.get('instructions.md')?.trim() ?? ''
    if (isMeaningful(instructions)) parts.push(`【用户指令】\n${clamp(instructions, 800)}`)

    const index = this.documents.get('memory/index.md') ?? ''
    const budget = Math.max(256, preferences.promptBudgetBytes)
    const fitted = fitIndex(index, budget)
    if (fitted.text !== '') parts.push(`【长期记忆】\n${fitted.text}`)

    const project = this.renderProject(workspace)
    if (project !== '') parts.push(project)

    const text = parts.join('\n\n')
    return { text, bytes: Buffer.byteLength(text, 'utf8'), truncated: fitted.truncated }
  }

  /** `preferences.md` compressed to the two lines the plan budgets. */
  private renderPreferences(preferences: PreferencesView): string {
    const who = preferences.userName.trim() === '' ? '（未设置称呼）' : preferences.userName.trim()
    const lines = [`【用户偏好】称呼：${who} · 助手名：${preferences.agentName} · 回复风格：${preferences.replyStyle}`]
    const switches: string[] = []
    if (!preferences.welcome) switches.push('关闭欢迎语')
    if (preferences.showFileChanges) switches.push('展示文件改动')
    if (!preferences.conversationMemory) switches.push('会话记忆已关闭')
    if (!preferences.localMemorySkills) switches.push('本地记忆技能已关闭')
    if (preferences.consolidateQuiet) switches.push('静默整理')
    if (switches.length > 0) lines.push(`【开关】${switches.join(' · ')}`)
    return lines.join('\n')
  }

  /**
   * Inject project memory only when the session works inside that project.
   *
   * The plan is explicit about this: a project's facts are noise in another
   * project's conversation, and injecting them would both waste budget and
   * invite the assistant to apply the wrong conventions.
   */
  private renderProject(workspace: string | undefined): string {
    if (workspace === undefined || workspace.trim() === '') return ''
    const slug = slugify(workspace)
    if (slug === '') return ''
    const body = this.documents.get(`memory/projects/${slug}.md`)
    if (body === undefined || !isMeaningful(body)) return ''
    return `【本项目记忆】\n${clamp(body, 1200)}`
  }

  /** Register a project file the renderer may need. */
  async watchProject(workspace: string): Promise<void> {
    const slug = slugify(workspace)
    if (slug === '') return
    const relative = `memory/projects/${slug}.md`
    if (this.documents.has(relative)) return
    const document = await this.store.readDocument(relative)
    this.documents.set(relative, document.body)
  }
}

/** The slug a workspace directory maps to under `memory/projects/`. */
export function slugify(workspace: string): string {
  const base = workspace.replaceAll('\\', '/').split('/').filter(part => part !== '').pop() ?? ''
  return base
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

/**
 * Fit `memory/index.md` into `budget` bytes, dropping whole sections.
 *
 * The section order is the plan's priority: 工作背景 survives longest, 项目索引
 * goes first. A section is dropped whole rather than clipped mid-sentence,
 * because half a remembered fact is worse than none.
 */
export function fitIndex(index: string, budget: number): { text: string; truncated: boolean } {
  const sections = splitIndex(index)
  if (sections.length === 0) return { text: '', truncated: false }
  const rendered = sections.map(section => renderSection(section))
  let text = rendered.join('\n\n')
  if (Buffer.byteLength(text, 'utf8') <= budget) return { text, truncated: false }

  // Drop from the least important end until it fits.
  const kept = [...sections]
  while (kept.length > 1) {
    kept.pop()
    text = kept.map(section => renderSection(section)).join('\n\n')
    if (Buffer.byteLength(text, 'utf8') <= budget) break
  }
  if (Buffer.byteLength(text, 'utf8') > budget) {
    text = clamp(text, budget - Buffer.byteLength(TOOL_HINT, 'utf8') - 1)
  }
  return { text: `${text}\n${TOOL_HINT}`, truncated: true }
}

/** One section of the index file. */
interface IndexSection {
  title: string
  lines: string[]
}

/** Split an index body into its `##` sections. */
function splitIndex(index: string): IndexSection[] {
  const sections: IndexSection[] = []
  let current: IndexSection | undefined
  for (const line of index.split('\n')) {
    const heading = /^##\s+(.+?)\s*$/.exec(line)
    if (heading !== null) {
      current = { title: heading[1], lines: [] }
      sections.push(current)
      continue
    }
    if (current !== undefined) current.lines.push(line)
  }
  return sections.filter(section => section.lines.some(line => isMeaningful(line)))
}

/** Render one section back to text. */
function renderSection(section: IndexSection): string {
  const body = section.lines.join('\n').trim()
  return `## ${section.title}\n${body}`
}

/** True when a body says something beyond a template placeholder. */
function isMeaningful(body: string): boolean {
  const text = body.trim()
  if (text === '') return false
  if (text === INDEX_PLACEHOLDER) return false
  const withoutPlaceholders = text
    .replaceAll(INDEX_PLACEHOLDER, '')
    .replace(/（当前为空[^）]*）/g, '')
    .replace(/（无）/g, '')
    .trim()
  return withoutPlaceholders !== ''
}

/** Cut `text` to at most `maxBytes` UTF-8 bytes on a line boundary. */
function clamp(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return text
  const lines: string[] = []
  let used = 0
  for (const line of text.split('\n')) {
    const cost = Buffer.byteLength(line, 'utf8') + 1
    if (used + cost > maxBytes) break
    lines.push(line)
    used += cost
  }
  return lines.join('\n').trimEnd()
}

/** Section titles the index is expected to carry, for the panel's preview. */
export const INDEX_TITLES = INDEX_SECTIONS.map(section => section.title)
/** Topic files the section may eventually read. */
export const TOPIC_KEYS: readonly TopicKey[] = TOPICS.map(topic => topic.key)
/** Re-exported for callers that only need to read one front-matter value. */
export { frontString, parseDocument }
