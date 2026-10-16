/**
 * The consolidation trigger scheduler (memory-plan §6.1).
 *
 * Deterministic consolidation already works; what was missing was anything that
 * ever *called* it. This module owns the four triggers the plan promises —
 * startup catch-up, idle, session end, fixed time — and nothing else: it never
 * touches a memory file, it only decides *when* to ask the consolidator for a
 * pass.
 *
 * Two rules shape the whole design:
 *
 * 1. **Every timer is owned by the caller's `ctx.effect()`.** Hot reload tears
 *    the effect down and calls `stop()`, so a reloaded plugin cannot leave a
 *    second scheduler ticking behind the first one.
 * 2. **A trigger is only a hint.** `shouldRun()` re-reads `state.json` every
 *    time, because the watermark can have moved since the timer was armed (a
 *    manual pass from the panel, or another trigger firing first). A stale
 *    timer therefore costs one cheap read, never a duplicate pass.
 *
 * `consolidateQuiet` is deliberately NOT consulted here: it controls whether the
 * panel raises a notice, not whether work happens.
 */

import type { ConsolidationReport, Consolidator } from './consolidate.ts'
import type { MemoryStore } from './store.ts'
import type { PreferencesView } from '../protocol.ts'

/** How long after mount the startup catch-up fires (memory-plan §6.1). */
export const STARTUP_DELAY_MS = 90_000

/** How often the idle / fixed-time ticker wakes up. */
const TICK_MS = 30_000

/** Debounce after the last session goes away before a session-end pass runs. */
const SESSION_END_DEBOUNCE_MS = 15_000

/** What the scheduler needs from the plugin. */
export interface SchedulerHost {
  store: MemoryStore
  consolidator: Consolidator
  /** Current preferences, re-read so a live switch takes effect immediately. */
  preferences: () => PreferencesView
  log: (message: string) => void
  /** Called after a pass that actually ran, so the panel can refresh. */
  onRun?: (report: ConsolidationReport) => void
}

/** Why a pass did not run, in the journal's words. */
type SkipReason = string | undefined

/**
 * Test seams.
 *
 * The production values are the constants above; a verifier cannot wait 90
 * seconds for the startup catch-up or ten minutes for an idle pass, so the
 * three delays and the clock are injectable. Nothing in the plugin passes
 * anything but the defaults.
 */
export interface SchedulerOptions {
  startupDelayMs?: number
  tickMs?: number
  sessionEndDebounceMs?: number
  now?: () => number
}

export class ConsolidationScheduler {
  private readonly host: SchedulerHost
  private readonly startupDelayMs: number
  private readonly tickMs: number
  private readonly sessionEndDebounceMs: number
  private readonly now: () => number
  private startupTimer: NodeJS.Timeout | null = null
  private tickTimer: NodeJS.Timeout | null = null
  private sessionEndTimer: NodeJS.Timeout | null = null
  private running = false
  private lastActivity: number
  private lastFixedDay = ''
  private stopped = true

  constructor(host: SchedulerHost, options: SchedulerOptions = {}) {
    this.host = host
    this.startupDelayMs = options.startupDelayMs ?? STARTUP_DELAY_MS
    this.tickMs = options.tickMs ?? TICK_MS
    this.sessionEndDebounceMs = options.sessionEndDebounceMs ?? SESSION_END_DEBOUNCE_MS
    this.now = options.now ?? (() => Date.now())
    this.lastActivity = this.now()
  }

  /** Arm the startup catch-up and the periodic ticker. */
  start(): void {
    if (!this.stopped) return
    this.stopped = false
    this.lastActivity = this.now()
    const mode = this.host.preferences().consolidateOn
    // The startup catch-up belongs to the default mode only; `idle`,
    // `session-end` and `fixed` are narrower choices and must not inherit it.
    if (mode === 'startup-idle') {
      this.startupTimer = setTimeout(() => {
        this.startupTimer = null
        void this.fire('启动补齐')
      }, this.startupDelayMs)
      this.startupTimer.unref?.()
    }
    this.tickTimer = setInterval(() => {
      void this.tick()
    }, this.tickMs)
    this.tickTimer.unref?.()
  }

  /** Record session activity, pushing the idle trigger back. */
  touch(): void {
    this.lastActivity = this.now()
  }

  /**
   * A session reached a persistence checkpoint or went away.
   *
   * The plan calls this "session end"; the runtime has no such event, so the
   * caller feeds both `session/flush` and `session/disposed` here and the
   * debounce below collapses a burst into one pass.
   */
  sessionEnded(): void {
    if (this.stopped) return
    if (this.host.preferences().consolidateOn !== 'session-end') return
    if (this.sessionEndTimer !== null) clearTimeout(this.sessionEndTimer)
    this.sessionEndTimer = setTimeout(() => {
      this.sessionEndTimer = null
      void this.fire('会话结束')
    }, this.sessionEndDebounceMs)
    this.sessionEndTimer.unref?.()
  }

  /** Release every timer. Safe to call twice, and safe before `start()`. */
  stop(): void {
    this.stopped = true
    for (const timer of [this.startupTimer, this.tickTimer, this.sessionEndTimer]) {
      if (timer !== null) clearTimeout(timer as NodeJS.Timeout)
    }
    this.startupTimer = null
    this.tickTimer = null
    this.sessionEndTimer = null
  }

  /** True while a pass started by this scheduler is in flight. */
  get busy(): boolean {
    return this.running
  }

  /** One tick: the idle trigger, then the fixed-time trigger. */
  private async tick(): Promise<void> {
    if (this.stopped) return
    const preferences = this.host.preferences()
    if (preferences.consolidateOn === 'startup-idle' || preferences.consolidateOn === 'idle') {
      const idleMs = Math.max(1, preferences.consolidateIdleMinutes) * 60_000
      if (this.now() - this.lastActivity >= idleMs) {
        // Re-arm immediately on a successful pass: otherwise the very next tick
        // (30s later) would see the same stale `lastActivity` and fire again.
        this.lastActivity = this.now()
        await this.fire('空闲')
        return
      }
    }
    if (preferences.consolidateOn === 'fixed' && (await this.fixedTimeReached(preferences))) {
      await this.fire('固定时间')
    }
  }

  /** True once per day, when the local clock has reached `consolidateFixedTime`. */
  private async fixedTimeReached(preferences: PreferencesView): Promise<boolean> {
    const match = /^(\d{1,2}):(\d{2})$/.exec(preferences.consolidateFixedTime.trim())
    if (match === null) return false
    const now = new Date()
    const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
    if (this.lastFixedDay === day) return false
    const target = Number(match[1]) * 60 + Number(match[2])
    if (now.getHours() * 60 + now.getMinutes() < target) return false
    // The day marker is only written by the pass itself, so a skipped pass (no
    // pending notes) is retried on the next tick instead of being lost for a day.
    return true
  }

  /**
   * Ask the consolidator for one pass, unless there is nothing to do.
   *
   * The gate is the plan's: enough time since the last pass, and at least one
   * note waiting. A quiet store therefore costs one `state.json` read and no
   * journal entry.
   */
  private async fire(reason: string): Promise<void> {
    if (this.stopped || this.running) return
    const preferences = this.host.preferences()
    if (!preferences.conversationMemory) {
      this.host.log(`跳过整理（${reason}）：会话记忆已关闭`)
      return
    }
    if (this.host.consolidator.busy) {
      this.host.log(`跳过整理（${reason}）：上一次整理还在进行中`)
      return
    }
    const skip = await this.skipReason(preferences, reason)
    if (skip !== undefined) {
      this.host.log(`跳过整理（${reason}）：${skip}`)
      return
    }
    this.running = true
    try {
      const report = await this.host.consolidator.run(reason)
      if (this.stopped) return
      this.host.onRun?.(report)
      this.host.log(
        `自动整理完成（${reason}）：新增 ${report.added} · 合并 ${report.merged} · 归档 ${report.archived}`,
      )
    } catch (error) {
      // The consolidator already catches its own failures; this is belt and
      // braces so a broken trigger can never take the plugin down.
      this.host.log(`自动整理失败（${reason}）：${String(error)}`)
    } finally {
      this.running = false
      const mode = this.host.preferences().consolidateOn
      if (mode === 'fixed') {
        const now = new Date()
        this.lastFixedDay = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
      }
    }
  }

  /** The plan's gate, or `undefined` when the pass may run. */
  private async skipReason(preferences: PreferencesView, reason: string): Promise<SkipReason> {
    const state = await this.host.store.readState()
    if (state.pending.length === 0) return '没有待整理的会话'
    if (reason === '启动补齐' || reason === '空闲' || reason === '固定时间') {
      const hours = Math.max(0, preferences.consolidateIntervalHours)
      if (state.lastConsolidateAt !== null && hours > 0) {
        const elapsed = Date.now() - Date.parse(state.lastConsolidateAt)
        if (Number.isFinite(elapsed) && elapsed < hours * 3_600_000) {
          const remaining = Math.ceil((hours * 3_600_000 - elapsed) / 60_000)
          return `距上次整理不足 ${hours} 小时（还需 ${remaining} 分钟）`
        }
      }
    }
    return undefined
  }
}
