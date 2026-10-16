/**
 * Panel state: one shared controller for the first-level panel and the two
 * native settings pages.
 *
 * Both surfaces show the same store, so they share one controller instance
 * rather than each polling the host: a save made in the panel is already on
 * screen when the user opens the settings page, and the host sees exactly one
 * subscriber per page load.
 */

import * as React from 'react'
import { MemoryApi, MemoryApiError } from './transport'
import type { ConsolidateStatus, JournalView, MemorySnapshot, ModelCatalog, PreferencesView } from '../protocol'

/** What the panel needs to render, in one immutable value. */
export interface MemoryView {
  /** The last snapshot that arrived, kept across a failed refresh. */
  snapshot: MemorySnapshot | undefined
  /** True until the first snapshot (or the first failure) arrives. */
  loading: boolean
  /** The last failure, already phrased for the panel. */
  error: string | undefined
  /** A save conflict: the other writer's text plus what the user typed. */
  conflict: { path: string; theirs: string; revision: string; mine: string } | undefined
  /** True while any action is in flight, so the panel can disable buttons. */
  busy: boolean
}

type Listener = () => void

/**
 * The value a slot registration injects into its component.
 *
 * It carries NO data on purpose. A slot entry's inject result is memoized on
 * `[actions, definition, scopeBinding]`, so a face rebuilt from live state would
 * keep handing the component the snapshot from the moment it mounted; the face
 * is therefore stable and the component reads state through `useView`, which
 * subscribes to the controller directly.
 */
export interface MemoryFace {
  /** Subscribe to the shared controller and return its current view. */
  useView: () => MemoryView
  /** Patch preferences; resolves when the host has confirmed the write. */
  onPatch: (patch: Record<string, unknown>) => void
  /** Save one markdown document under revision control. */
  onSaveDocument: (path: string, text: string, revision: string) => Promise<boolean>
  /** Run one of the host's memory actions. */
  onAction: (action: Record<string, unknown>) => Promise<boolean>
  /**
   * Ask for a consolidation pass.
   *
   * Separate from `onAction` because the host answers before the pass finishes:
   * the caller needs to know whether it started, not what it produced.
   */
  onConsolidate: () => Promise<{ started: boolean; reason?: string }>
  /** Read one journal day, for the history view. */
  onJournal: (date: string) => Promise<JournalView | undefined>
  /**
   * The runtime's model catalogue, for the picker's dropdown.
   *
   * It is a separate call because the enumeration is the one piece of panel data
   * that may cost a network round trip, and it is only needed once the user opens
   * the card.
   */
  onCatalog: () => Promise<ModelCatalog | undefined>
}

const EMPTY: MemoryView = {
  snapshot: undefined,
  loading: true,
  error: undefined,
  conflict: undefined,
  busy: false,
}

export class MemoryController {
  private readonly api = new MemoryApi()
  private view: MemoryView = EMPTY
  private readonly listeners = new Set<Listener>()
  private disposed = false
  /** Timer of the post-consolidation poll, when one is armed. */
  private pollTimer: ReturnType<typeof globalThis.setTimeout> | undefined

  /** The current value; stable between mutations so React can bail out. */
  get(): MemoryView {
    return this.view
  }

  /** Subscribe to changes; returns the unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Stop serving subscribers (called from the owning effect's cleanup). */
  dispose(): void {
    this.disposed = true
    this.listeners.clear()
    if (this.pollTimer !== undefined) {
      globalThis.clearTimeout(this.pollTimer)
      this.pollTimer = undefined
    }
  }

  private set(patch: Partial<MemoryView> | ((current: MemoryView) => Partial<MemoryView>)): void {
    if (this.disposed) return
    const next = typeof patch === 'function' ? patch(this.view) : patch
    this.view = { ...this.view, ...next }
    for (const listener of [...this.listeners]) {
      try {
        listener()
      } catch {
        // A broken subscriber must not stop the others from updating.
      }
    }
  }

  /** Human-readable text for a failure the transport reported. */
  private describe(error: unknown, fallback: string): string {
    if (error instanceof MemoryApiError && error.kind === 'unreachable') return 'unreachable'
    if (error instanceof MemoryApiError && error.kind === 'timeout') return 'timeout'
    return error instanceof Error && error.message !== '' ? error.message : fallback
  }

  /** Load (or reload) the whole snapshot. */
  async load(): Promise<void> {
    try {
      const snapshot = await this.api.state()
      this.set({ snapshot, loading: false, error: undefined })
    } catch (error) {
      this.set({ loading: false, error: this.describe(error, 'load') })
    }
  }

  /** Patch preferences; a successful write returns the fresh snapshot. */
  async patch(patch: Record<string, unknown>): Promise<boolean> {
    this.set({ busy: true })
    try {
      const snapshot = await this.api.preferences({ patch })
      this.set({ snapshot, busy: false, error: undefined })
      return true
    } catch (error) {
      this.set({ busy: false, error: this.describe(error, 'save') })
      return false
    }
  }

  /** Save one document. Returns 'saved', 'conflict' or 'failed'. */
  async save(path: string, text: string, revision: string): Promise<'saved' | 'conflict' | 'failed'> {
    this.set({ busy: true })
    try {
      const result = await this.api.save(path, text, revision)
      if (result.ok) {
        this.set({ snapshot: result.snapshot, busy: false, conflict: undefined, error: undefined })
        return 'saved'
      }
      // A conflict is a normal outcome, not an error: the user's typing is
      // still in the editor and the choice of which side wins is theirs.
      //
      // `error === 'conflict'` alone does not narrow the union — the generic
      // `{ error: string }` member also admits that literal — so the presence of
      // `path` is what identifies the conflict payload.
      if ('path' in result) {
        this.set({
          busy: false,
          conflict: { path: result.path, theirs: result.text, revision: result.revision, mine: text },
        })
        return 'conflict'
      }
      this.set({ busy: false, error: result.error })
      return 'failed'
    } catch (error) {
      this.set({ busy: false, error: this.describe(error, 'save') })
      return 'failed'
    }
  }

  /** Accept the on-disk version of a conflicted document. */
  resolveConflictWithTheirs(): void {
    const conflict = this.view.conflict
    if (conflict === undefined) return
    this.set({ conflict: undefined })
  }

  /** Retry the save with the freshly-read revision (overwrite with mine). */
  async resolveConflictWithMine(): Promise<'saved' | 'failed'> {
    const conflict = this.view.conflict
    if (conflict === undefined) return 'failed'
    this.set({ conflict: undefined })
    const outcome = await this.save(conflict.path, conflict.mine, conflict.revision)
    return outcome === 'saved' ? 'saved' : 'failed'
  }

  /** Dismiss a conflict without saving. */
  dismissConflict(): void {
    this.set({ conflict: undefined })
  }

  /** Run a host action and adopt the snapshot it returns. */
  async act(action: Record<string, unknown>): Promise<boolean> {
    this.set({ busy: true })
    try {
      const snapshot = await this.api.action(action)
      this.set({ snapshot, busy: false, error: undefined })
      return true
    } catch (error) {
      this.set({ busy: false, error: this.describe(error, 'save') })
      return false
    }
  }

  /**
   * Ask for a consolidation pass and then poll for its result.
   *
   * The host answers the request immediately (a model-stage pass can outlive the
   * browser's 15 s timeout), so the panel cannot learn the outcome from the
   * response. It re-reads the snapshot a few times instead, which is enough for
   * the deterministic stage the plugin ships today and honest about the rest.
   */
  async consolidate(): Promise<{ started: boolean; reason?: string }> {
    this.set({ busy: true })
    let started = false
    let reason: string | undefined
    try {
      const outcome = await this.api.consolidate()
      this.set({ snapshot: outcome.snapshot, busy: false, error: undefined })
      started = outcome.started
      reason = outcome.reason
    } catch (error) {
      this.set({ busy: false, error: this.describe(error, 'save') })
      return { started: false }
    }
    if (!started) return reason === undefined ? { started: false } : { started: false, reason }
    this.armPoll()
    return { started: true }
  }

  /**
   * Re-read the snapshot until the pass stops changing it, or give up.
   *
   * The poll hits `GET /consolidate-status`, not `/state`: the full snapshot
   * re-reads every document and recomputes a sha1 revision, which is far too
   * much to repeat every two seconds while a model call is in flight. The light
   * answer carries the consolidation block, the question list and the revision —
   * everything the panel re-renders on — and a terminal tick does one full
   * `load()` so the returned revision is the final one.
   *
   * Rounds are bounded rather than time-bounded because a bounded loop cannot
   * leak a timer if a tick throws: each round awaits, and the timer is only
   * re-armed after the await settles.
   */
  private armPoll(): void {
    if (this.pollTimer !== undefined) globalThis.clearTimeout(this.pollTimer)
    let rounds = 0
    const tick = async (): Promise<void> => {
      if (this.disposed) return
      rounds += 1
      let status: ConsolidateStatus | undefined
      try {
        status = await this.api.consolidateStatus()
      } catch {
        // A failed poll tick is not a page error: the pass is still running on
        // the host, and the next tick will see it.
      }
      if (this.disposed) return
      if (status !== undefined) {
        this.set(current => ({
          ...current,
          busy: status.running,
          snapshot:
            current.snapshot === undefined
              ? current.snapshot
              : {
                  ...current.snapshot,
                  revision: status.revision,
                  consolidation: status.consolidation,
                  questions: status.questions,
                  history: status.history,
                  sessions: { ...current.snapshot.sessions, pending: status.pending },
                },
        }))
      }
      if (this.disposed || rounds >= 12) {
        this.pollTimer = undefined
        await this.load()
        return
      }
      this.pollTimer = globalThis.setTimeout(() => void tick(), 2_000)
    }
    this.pollTimer = globalThis.setTimeout(() => void tick(), 1_500)
  }

  /** Read one journal day (log text plus the files its backup can restore). */
  async journal(date: string): Promise<JournalView | undefined> {
    try {
      return await this.api.journal(date)
    } catch (error) {
      this.set({ error: this.describe(error, 'load') })
      return undefined
    }
  }

  /**
   * Read the model catalogue.
   *
   * It deliberately does NOT set `busy`: opening a dropdown must not disable the
   * whole page's buttons, and a failed enumeration is a note on the card rather
   * than a page-level error.
   */
  async catalog(): Promise<ModelCatalog | undefined> {
    try {
      return await this.api.models()
    } catch (error) {
      this.set({ error: this.describe(error, 'load') })
      return undefined
    }
  }

  /** Clear a transient error once the panel has shown it. */
  clearError(): void {
    this.set({ error: undefined })
  }

  /** The preferences of the current snapshot, if any. */
  preferences(): PreferencesView | undefined {
    return this.view.snapshot?.preferences
  }
}

/**
 * Subscribe a component to a controller's view.
 *
 * `useSyncExternalStore` is the supported binding because the controller hands
 * back the SAME object until a mutation happens, which is exactly the identity
 * contract the hook needs to avoid an infinite re-render loop.
 *
 * @param controller - the panel controller.
 * @returns the current view.
 */
export function useMemoryView(controller: MemoryController): MemoryView {
  const subscribe = React.useCallback((notify: () => void) => controller.subscribe(notify), [controller])
  const getSnapshot = React.useCallback(() => controller.get(), [controller])
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
