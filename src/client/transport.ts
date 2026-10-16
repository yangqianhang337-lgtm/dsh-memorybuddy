/**
 * HTTP client for the host half.
 *
 * The prefix is DOCUMENT-RELATIVE (`API_PREFIX.slice(1)`): the GUI page carries
 * `<base href="./">`, so a root-absolute `/api/…` resolves against the document
 * base and escapes its directory under a sub-path deployment (memory-plan §8.2).
 *
 * Every call is same-origin and carries no credentials the page could leak: the
 * Desktop shell attaches the `dsh-auth-` cookie itself and never exposes it to
 * page script, which is exactly what the host route's tripwire checks.
 */

import { API_PREFIX } from '../protocol'
import type {
  ConsolidateStatus,
  DocumentView,
  EntryView,
  JournalView,
  MemorySnapshot,
  ModelCatalog,
  SessionNoteView,
  DraftView,
  PreferencesPatch,
  PreferencesView,
  SaveResult,
} from '../protocol'

/** Route prefix relative to the document, safe under `<base href="./">`. */
export const CLIENT_PREFIX = API_PREFIX.replace(/^\//, '')

/** How long a single call may hang before the panel reports it as unreachable. */
const REQUEST_TIMEOUT_MS = 15_000

/** A typed failure carrying a message already phrased for the panel. */
export class MemoryApiError extends Error {
  constructor(public readonly kind: 'unreachable' | 'timeout' | 'status' | 'body', message: string) {
    super(message)
    this.name = 'MemoryApiError'
  }
}

/** A save that lost a race: the on-disk text travels back so nothing is lost. */
export interface SaveConflict {
  ok: false
  error: 'conflict'
  path: string
  text: string
  revision: string
}

/** One pending-approval draft plus its body, as the panel shows it. */
export interface DraftDetail extends DraftView {
  body: string
}

export interface MemoryState {
  snapshot: MemorySnapshot
}

async function request(path: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController()
  const timer = globalThis.setTimeout(() => {
    controller.abort()
  }, REQUEST_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(path, { ...init, signal: controller.signal })
  } catch (error) {
    if (controller.signal.aborted) throw new MemoryApiError('timeout', 'timeout')
    throw new MemoryApiError('unreachable', String(error))
  } finally {
    globalThis.clearTimeout(timer)
  }
  const text = await response.text()
  if (!response.ok) {
    // The body still travels: a 409 carries the other writer's text, and the
    // route's own error body names the failure better than the status does.
    let parsed: unknown
    try {
      parsed = text.trim() === '' ? undefined : JSON.parse(text)
    } catch {
      parsed = undefined
    }
    const error = new MemoryApiError('status', `${String(response.status)}`) as MemoryApiError & {
      payload?: unknown
    }
    error.payload = parsed
    throw error
  }
  if (text.trim() === '') return undefined
  try {
    return JSON.parse(text)
  } catch {
    throw new MemoryApiError('body', 'invalid-json')
  }
}

/** Narrow an unknown payload to a snapshot, or throw a typed body error. */
function asSnapshot(value: unknown): MemorySnapshot {
  const record = value as { ok?: unknown } | undefined
  if (record === undefined || record === null || record.ok !== true) {
    throw new MemoryApiError('body', 'malformed-snapshot')
  }
  return value as MemorySnapshot
}

export class MemoryApi {
  /** The whole panel state in one round trip. */
  async state(): Promise<MemorySnapshot> {
    return asSnapshot(await request(`${CLIENT_PREFIX}/state`, { cache: 'no-store' }))
  }

  /** Save one document; a revision mismatch comes back as a conflict. */
  async save(path: string, text: string, revision: string): Promise<SaveResult> {
    try {
      const value = await request(`${CLIENT_PREFIX}/save`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path, text, revision }),
      })
      return value as SaveResult
    } catch (error) {
      const payload = (error as { payload?: unknown }).payload as SaveConflict | undefined
      if (payload !== undefined && payload.error === 'conflict') return payload
      throw error
    }
  }

  /** Patch the preference front-matter; the host merges field by field. */
  async preferences(patch: PreferencesPatch): Promise<MemorySnapshot> {
    const value = (await request(`${CLIENT_PREFIX}/preferences`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    })) as { snapshot?: unknown }
    return asSnapshot(value?.snapshot)
  }

  /** Run one of the panel's actions (reset, forget, pin, approve…). */
  async action(action: Record<string, unknown>): Promise<MemorySnapshot> {
    const value = (await request(`${CLIENT_PREFIX}/action`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action }),
    })) as { snapshot?: unknown }
    return asSnapshot(value?.snapshot)
  }

  /**
   * Ask for a consolidation pass.
   *
   * Unlike `action()` this returns the pass's own answer, because the host
   * replies before the work finishes: the panel has to know whether a pass
   * actually started, not what it produced.
   */
  async consolidate(): Promise<{ snapshot: MemorySnapshot; started: boolean; reason?: string }> {
    const value = (await request(`${CLIENT_PREFIX}/action`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: { kind: 'consolidate' } }),
    })) as { snapshot?: unknown; result?: { started?: unknown; reason?: unknown } }
    const reason = typeof value?.result?.reason === 'string' ? value.result.reason : undefined
    return {
      snapshot: asSnapshot(value?.snapshot),
      started: value?.result?.started === true,
      ...(reason === undefined ? {} : { reason }),
    }
  }

  /** Read one journal day: its log text plus the files its backup can restore. */
  async journal(date: string): Promise<JournalView> {
    const value = (await request(
      `${CLIENT_PREFIX}/journal?date=${encodeURIComponent(date)}`,
      { cache: 'no-store' },
    )) as { journal?: unknown }
    const record = value?.journal as JournalView | undefined
    if (record === undefined || typeof record.date !== 'string') {
      throw new MemoryApiError('body', 'malformed-journal')
    }
    return { date: record.date, text: record.text ?? '', backups: record.backups ?? [] }
  }

  /**
   * The runtime's model catalogue, for the picker's dropdown.
   *
   * The host caches the enumeration (a `listModels` call may hit the network), so
   * opening the card twice is cheap — but this is still NOT a per-render call.
   */
  async models(): Promise<ModelCatalog> {
    const value = (await request(`${CLIENT_PREFIX}/models`, { cache: 'no-store' })) as {
      catalog?: unknown
    }
    const catalog = value?.catalog as ModelCatalog | undefined
    if (catalog === undefined || !Array.isArray(catalog.models)) {
      throw new MemoryApiError('body', 'malformed-catalog')
    }
    return catalog
  }

  /**
   * A light status poll while a pass runs.
   *
   * It exists because the full snapshot re-reads every document and recomputes a
   * sha1 revision — far too much to repeat every couple of seconds. The answer
   * is the subset the panel actually changes on.
   */
  async consolidateStatus(): Promise<ConsolidateStatus> {
    const value = (await request(`${CLIENT_PREFIX}/consolidate-status`, { cache: 'no-store' })) as
      | Partial<ConsolidateStatus>
      | undefined
    if (value === undefined || typeof value.revision !== 'string') {
      throw new MemoryApiError('body', 'malformed-status')
    }
    return {
      running: value.running === true,
      revision: value.revision,
      consolidation: value.consolidation ?? { lastAt: null, reason: '', modelStage: 'disabled', modelNote: '' },
      questions: value.questions ?? [],
      history: value.history ?? [],
      pending: typeof value.pending === 'number' ? value.pending : 0,
    }
  }
}

/** Convenience re-exports so the card components import one module. */
export type {
  ConsolidateStatus,
  DocumentView,
  DraftView,
  EntryView,
  JournalView,
  MemorySnapshot,
  ModelCatalog,
  PreferencesView,
  SessionNoteView,
  SaveResult,
}
