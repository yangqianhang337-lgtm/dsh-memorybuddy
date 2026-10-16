/**
 * Shared contract between the host half and the browser half.
 *
 * The host owns every file under `$DSH_HOME/dsh-memorybuddy/`; the browser
 * is a same-origin asynchronous view over that store. Both halves import this
 * module so a route rename cannot drift between them.
 */

/** Root-absolute route prefix the host registers. */
export const API_PREFIX = '/api/memorybuddy'

/** Reply style choices, in the order the panel offers them. */
export const REPLY_STYLES = ['默认', '简洁', '详细', '教学', '直接'] as const
export type ReplyStyle = (typeof REPLY_STYLES)[number]

/** Consolidation triggers. `fixed` is supported but off by default. */
export const CONSOLIDATE_MODES = ['startup-idle', 'idle', 'session-end', 'fixed'] as const
export type ConsolidateMode = (typeof CONSOLIDATE_MODES)[number]

/** Model policy for the model stage. `off` beats the user's own model choice. */
export const MODEL_POLICIES = ['free-first', 'allowlist', 'session-default', 'off'] as const
export type ModelPolicy = (typeof MODEL_POLICIES)[number]

/** How a model call failed, which decides its cooldown window. */
export const FAILURE_KINDS = ['quota', 'missing', 'auth', 'network', 'unknown'] as const
export type FailureKind = (typeof FAILURE_KINDS)[number]

/** One selectable model, as the picker renders it. */
export interface ModelOption {
  provider: string
  id: string
  name: string
  /** Free-tier tag, matched on the `(provider, id)` pair — never the bare id. */
  free: boolean
  /**
   * Context window, when the runtime advertised one.
   *
   * The listing only reports what the adapter publishes; `resolveModelInfo`
   * remains the authority, and this is absent for every adapter that does not
   * put `contextWindow` on its `LlmDiscoveredModel` entries.
   */
  contextWindow?: number
}

/** The enumerated catalogue the picker draws from. */
export interface ModelCatalog {
  providers: { id: string; name: string }[]
  models: ModelOption[]
  /** When the host last refreshed this list, for the cache caption. */
  fetchedAt: string
  /** Why the list is empty, when it is (`llm` service absent, discovery failed). */
  note?: string
}

/** How much text the model stage may send in one call (memory-plan §6.1.2). */
export const MAX_INPUT_BYTES = 16 * 1024

/** One operation of the model's diff. It proposes; the host disposes. */
export type DistillOperation =
  | { op: 'add'; topic: TopicKey; text: string }
  | { op: 'update'; id: string; anchor: string; text: string }

/** An operation that passed the verbatim-anchor check. */
export interface DistillProposal {
  op: 'add' | 'update'
  /** The entry being revised, for `update`. */
  id?: string
  anchor?: string
  topic: TopicKey
  text: string
}

/** What the last model-stage attempt did, for the panel's status line. */
export interface ModelRunView {
  /** `provider/model` that actually produced the diff, when one did. */
  used?: string
  tokens?: number
  /** How many of the model's operations the host actually applied. */
  applied?: number
  /** Operations the host refused, and why (a bad anchor, a pinned entry). */
  rejected?: string[]
  /** Routes that were tried and failed, for the journal. */
  failures?: string[]
  /** Set when the user's chosen model failed and the chain took over. */
  fellBackFrom?: string
  /** Set when the model stage did not run at all. */
  skippedReason?: string
  at?: string
}

/** The live state of the user's own model pick, for the picker card (§4.4). */
export interface ModelChoiceStatus {
  provider: string
  model: string
  /** Empty means "not chosen". */
  chosen: boolean
  /** `resolveModelInfo` said this route resolves right now. */
  ok: boolean
  /** Why it does not, in the panel's words. */
  reason?: string
  /** The route's `reasoning.efforts`, so the effort menu cannot invent one. */
  efforts: string[]
  defaultEffort?: string
  contextWindow?: number
  /** True when `modelAllowlist` refuses the user's own pick (§4.4 rule 5). */
  blockedByAllowlist: boolean
  /** True when the route is inside its cooldown window. */
  cooling: boolean
  /** True when `modelPolicy: 'off'` beats the pick (§4.4 rule 6). */
  disabled: boolean
}

/** A cooling-down route, surfaced so the panel can explain a skip. */
export interface CooldownView {
  route: string
  kind: FailureKind
  until: string
  minutes: number
}

/**
 * Live facts about the runtime that `state.json` cannot hold.
 *
 * They are computed per request by the routes and merged into the snapshot, so
 * the panel can show "整理中" and the picker's validation without either value
 * ever being persisted (a stale `running: true` on disk would be a lie after a
 * crash).
 */
export interface RuntimeView {
  /** True while a consolidation pass is in flight. */
  running: boolean
  /** The user's model pick, resolved against the live registry. */
  modelChoice?: ModelChoiceStatus
  /** The enumerated catalogue, when the panel asked for it. */
  catalog?: ModelCatalog
}

/** Confidence ladder of one memory entry. */
export const CONFIDENCES = ['低', '中', '高'] as const
export type Confidence = (typeof CONFIDENCES)[number]

/** Topic files under `memory/`, with the heading each one carries. */
export const TOPICS = [
  { key: 'background', file: 'background.md', title: '工作背景' },
  { key: 'habits', file: 'habits.md', title: '行事风格' },
  { key: 'environment', file: 'environment.md', title: '环境路径' },
  { key: 'preferences-learned', file: 'preferences-learned.md', title: '习得偏好' },
] as const
export type TopicKey = (typeof TOPICS)[number]['key']

/** The three hand-editable top-level documents, keyed by the panel's tab id. */
export const DOCUMENTS = ['persona', 'instructions'] as const
export type DocumentKey = (typeof DOCUMENTS)[number]

/** One entry as the panel sees it. */
export interface EntryView {
  id: string
  text: string
  confidence: Confidence
  /** Distinct dates the entry was corroborated on. */
  days: number
  first: string
  last: string
  sources: string[]
  pinned: boolean
  conflict: boolean
}

/** One editable document: body text plus its optimistic-concurrency token. */
export interface DocumentView {
  /** `preferences.md` | `profile.md` | `instructions.md` | `memory/<topic>.md` */
  path: string
  /** Body only — the panel never edits front-matter directly. */
  text: string
  /** sha1 of the whole file on disk; a save must echo it back. */
  revision: string
  updated: string
}

/** One session note the collector wrote. */
export interface SessionNoteView {
  id: string
  date: string
  path: string
  updated: string
  /** False while the note still awaits a consolidation pass. */
  consolidated: boolean
  events: number
  title: string
}

/** One skill draft awaiting approval. */
export interface DraftView {
  name: string
  title: string
  path: string
  createdAt: string
  repeats: number
}

/**
 * One draft in full, for the detail dialog (P7 §6.2 B).
 *
 * The dialog must be able to show everything the plan lists — the complete
 * content preview, the path 批准 would write, and the sessions the draft came
 * from — without a second round trip per field, so all of it rides the snapshot's
 * sibling read.
 */
export interface DraftDetail extends DraftView {
  /** The complete `SKILL.md` text, front-matter included, as 批准 would write it. */
  text: string
  /** Just the body, for the rendered preview pane. */
  body: string
  description: string
  whenToUse: string
  /** Session notes the pattern was mined from. */
  derivedFrom: string[]
  /** The absolute path 批准 writes to. */
  target: string
}

/** One project memory file under `memory/projects/<slug>.md` (P6). */
export interface ProjectView {
  slug: string
  /** Root-relative file path, for the panel's 编辑 link. */
  path: string
  updated: string
  /** Entry count in the file (all confidences; the file itself is the source of truth). */
  entries: number
}

/** Everything the panel renders, in one snapshot. */
export interface MemorySnapshot {
  ok: true
  /** Absolute data root, shown read-only in the panel. */
  root: string
  /** Bumped whenever any file under the root changes. */
  revision: string
  preferences: PreferencesView
  documents: Record<string, DocumentView>
  entries: Record<string, EntryView[]>
  index: DocumentView
  sessions: { pending: number; total: number; lastAt: string | null; items: SessionNoteView[] }
  consolidation: {
    lastAt: string | null
    reason: string
    /** Which stage the last pass reached. */
    modelStage: 'disabled' | 'deterministic' | 'model'
    modelNote: string
    /** What the model stage did last time (§4.4), read back from `state.json`. */
    model?: ModelRunView
  }
  /**
   * Live runtime facts, merged in by the routes on every request.
   *
   * They are deliberately NOT part of the stored snapshot: `running` would be
   * a lie after a crash, and the catalogue is a network-backed cache.
   */
  runtime?: RuntimeView
  /** Unanswered questions a pass raised (conflicts, stale 高 entries). */
  questions: string[]
  /** Journal dates that have a backup, newest first — the rollback menu. */
  history: string[]
  drafts: DraftView[]
  /** Project memory files (P6), newest-updated first. */
  projects: ProjectView[]
  /** Non-fatal problems the panel should surface (e.g. a redacted secret). */
  warnings: string[]
}

/** One journal day, as the history view renders it. */
export interface JournalView {
  date: string
  /** The journal markdown body, or `''` when only a backup exists. */
  text: string
  /** Root-relative files that day's backup can restore. */
  backups: string[]
}

/**
 * The light answer to `GET /consolidate-status`.
 *
 * The panel polls this while a pass runs. It is deliberately a SUBSET of
 * `MemorySnapshot`: the full snapshot re-reads every document and recomputes a
 * sha1 revision, which is far too much work to repeat every two seconds.
 */
export interface ConsolidateStatus {
  running: boolean
  revision: string
  consolidation: MemorySnapshot['consolidation']
  questions: string[]
  history: string[]
  pending: number
}

/** Preference fields, exactly the front-matter keys of `preferences.md`. */
export interface PreferencesView {
  userName: string
  agentName: string
  replyStyle: ReplyStyle
  welcome: boolean
  showFileChanges: boolean
  conversationMemory: boolean
  localMemorySkills: boolean
  consolidateOn: ConsolidateMode
  consolidateIntervalHours: number
  consolidateIdleMinutes: number
  consolidateFixedTime: string
  consolidateQuiet: boolean
  modelPolicy: ModelPolicy
  modelAllowlist: string[]
  /** The user's own model pick, which outranks the candidate chain (§4.4). */
  modelChoiceProvider: string
  modelChoiceModel: string
  /** Must be one of that model's `reasoning.efforts`; empty means "model default". */
  modelChoiceEffort: string
  promptBudgetBytes: number
}

/** A save request for one document. */
export interface SaveRequest {
  /** `profile.md` / `instructions.md` / `memory/<topic>.md` */
  path: string
  text: string
  /** The revision the editor loaded; a mismatch is a conflict, not an overwrite. */
  revision: string
}

/** A patch of preference fields. */
export interface PreferencesPatch {
  patch: Partial<PreferencesView>
  /** The revision the editor loaded; ignored for switch-like toggles. */
  revision?: string
}

/**
 * The phrase a 彻底删除 must be confirmed with (P8).
 *
 * A typed word rather than a second click, because this is the only operation in
 * the plugin that cannot be undone: everything else archives. It lives here, not
 * in the host half, so the panel and the route compare against the SAME constant
 * — two copies would drift, and a drift would show up as a button that cannot be
 * armed at all.
 */
export const WIPE_CONFIRMATION = 'DELETE'

/** Manual actions the panel can trigger. */
export type MemoryAction =
  | { kind: 'consolidate' }
  | { kind: 'reset-document'; path: string }
  | { kind: 'reset-all' }
  | { kind: 'forget-entry'; topic: string; id: string }
  | { kind: 'pin-entry'; topic: string; id: string; pinned: boolean }
  | { kind: 'dismiss-question'; index: number }
  | { kind: 'rollback'; date: string }
  /**
   * 彻底删除 (P8) — the only irreversible action in the plugin.
   *
   * `confirm` must be the literal phrase the panel makes the user type; the host
   * re-checks it rather than trusting that the client did, because a client that
   * skipped the prompt would make the fence decorative.
   */
  | { kind: 'wipe-all'; confirm: string }
  /** `text` carries the edited file for 编辑后批准; omitted promotes verbatim. */
  | { kind: 'approve-draft'; name: string; text?: string }
  /** Archives the draft under `archive/skills-draft/` — it is never deleted. */
  | { kind: 'ignore-draft'; name: string }
  | { kind: 'forget-project'; slug: string }

/** Save outcome. `conflict` carries the on-disk text so no edit is lost. */
export type SaveResult =
  | { ok: true; snapshot: MemorySnapshot }
  | { ok: false; error: 'conflict'; path: string; text: string; revision: string }
  | { ok: false; error: string }

/** Narrow an unknown JSON body to an object. */
export function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}
