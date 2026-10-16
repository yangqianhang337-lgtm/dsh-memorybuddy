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

/** Model policy for the (not yet enabled) model stage. */
export const MODEL_POLICIES = ['free-first', 'allowlist', 'session-default', 'off'] as const
export type ModelPolicy = (typeof MODEL_POLICIES)[number]

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
    /** Which stage the last pass reached. The model stage lands in P5. */
    modelStage: 'disabled' | 'deterministic' | 'model'
    modelNote: string
  }
  /** Unanswered questions a pass raised (conflicts, stale 高 entries). */
  questions: string[]
  /** Journal dates that have a backup, newest first — the rollback menu. */
  history: string[]
  drafts: DraftView[]
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

/** Manual actions the panel can trigger. */
export type MemoryAction =
  | { kind: 'consolidate' }
  | { kind: 'reset-document'; path: string }
  | { kind: 'reset-all' }
  | { kind: 'forget-entry'; topic: string; id: string }
  | { kind: 'pin-entry'; topic: string; id: string; pinned: boolean }
  | { kind: 'dismiss-question'; index: number }
  | { kind: 'rollback'; date: string }
  | { kind: 'approve-draft'; name: string }
  | { kind: 'discard-draft'; name: string }

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
