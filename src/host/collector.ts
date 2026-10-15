/**
 * The session collector: turns live session traffic into session notes.
 *
 * It listens to every session (not just the ones this plugin opened), buffers
 * the interesting events in memory, and writes them out on a throttle. Nothing
 * here calls a model — the note is a deterministic reduction of what happened,
 * because the whole point of the first release is that memory keeps working
 * when no model is reachable (memory-plan §5.1, §6.1.1).
 *
 * Two rules shape the code:
 *
 * 1. **Only the shape of a tool call is kept, never its body.** A `tool/result`
 *    can carry a file's contents or an HTTP response; storing it would both
 *    explode the note and leak whatever passed through. The note records the
 *    tool name and whether it succeeded.
 * 2. **Turning the switch off stops collection immediately** — no buffering, no
 *    delayed write of what was already buffered. `conversationMemory: false`
 *    is checked at event time, not at flush time.
 */

import { TOPICS } from '../protocol.ts'
import type { MemoryStore, PluginState } from './store.ts'
import { dayKey } from './entries.ts'

/** How long a session may go quiet before its note is considered final. */
const IDLE_FINALIZE_MS = 120_000
/** Flush cadence while a session is active (memory-plan §5.1: 5s or 20 events). */
const FLUSH_INTERVAL_MS = 5_000
const FLUSH_EVENT_COUNT = 20
/** Cap on the events recorded into one note, so a long session stays readable. */
const MAX_RECORDED_EVENTS = 400
/**
 * Separate, smaller cap for assistant replies.
 *
 * A long session emits far more assistant messages than anything else (one per
 * step), so without this they would fill `MAX_RECORDED_EVENTS` on their own and
 * the user's own words — the lines the note is actually built from — would stop
 * being recorded partway through the session.
 */
const MAX_ASSISTANT_EVENTS = 60
/** Cap on dialogue lines rendered into one note, so a long session stays readable. */
const MAX_DIALOGUE_LINES = 40
/** Cap on the excerpt kept for one user message. */
const MAX_EXCERPT_CHARS = 400
/** Cap on how many notes one flush rewrites the state for. */
const MAX_SESSIONS_TRACKED = 64
/** Cap on remembered call ids, so a long session cannot grow the map forever. */
const MAX_CALL_NAMES = 512

/**
 * Sentences that mark a durable preference (memory-plan §5.2 whitelist 1/5).
 *
 * Deliberately a short literal list rather than a model call: a false positive
 * here costs the user one candidate line they can delete, and a false negative
 * costs nothing at all because the next consolidation pass sees the same text.
 */
const PREFERENCE_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: '明确偏好', pattern: /以后都|今后都|下次都|每次都|一律|统一用/ },
  { label: '明确偏好', pattern: /我不喜欢|我不想要|别再|不要再|不要用|请勿/ },
  { label: '回复风格', pattern: /先给结论|直接说|说重点|别废话|简短点|详细一点|讲细一点/ },
  { label: '纠错', pattern: /不对[，,]?\s*应该|错了|不是这样|应该是|其实应该/ },
  { label: '硬约束', pattern: /必须用|只能用|不能用|禁止|不支持|锁定版本|别升级/ },
  { label: '决策', pattern: /就用|选[择定]?\s*\S+\s*(不|而不是|而不是用)|不选\S+因为|原因是/ },
]

/** One event worth remembering, already reduced to text. */
interface RecordedEvent {
  kind: 'user' | 'assistant' | 'tool' | 'turn'
  seq: number
  time: string
  text: string
}

/** Live state of one session being collected. */
interface SessionState {
  id: string
  workspace: string
  started: string
  ended: string | null
  turns: number
  events: RecordedEvent[]
  /** Tool names by call id, so a result can name the tool that produced it. */
  callNames: Map<string, string>
  /** Events not yet persisted into the note. */
  dirty: number
  seq: number
  /** Whether the session's existing log was already replayed into `events`. */
  backfilled: boolean
  timer: ReturnType<typeof setTimeout> | null
  idleTimer: ReturnType<typeof setTimeout> | null
  finalized: boolean
}

/** What the collector needs from the rest of the plugin. */
export interface CollectorHost {
  store: MemoryStore
  /** The live value of `conversationMemory`; read at event time. */
  enabled: () => boolean
  log: (message: string) => void
  /** Called after a note is written, so the panel can be nudged. */
  onNote?: (relative: string) => void
}

/** Minimal shape of the session object the DSH event carries. */
export interface SessionLike {
  id: string
  header?: { cwd?: string; meta?: { cwd?: string } }
  /**
   * The session's own committed log, when it exposes one.
   *
   * `session/event` only delivers what happens from the moment of subscription,
   * so this is the only way to see the part of a session that ran before the
   * plugin mounted. Optional because a capture-only context may hand us a
   * stripped session object.
   */
  snapshotEvents?: (fromSeq?: number, toSeqExclusive?: number) => readonly EventLike[]
}

/** Minimal shape of one session event. */
export interface EventLike {
  type: string
  seq: number
  time?: number | string
  data?: Record<string, unknown>
}

/**
 * The message record an event carries.
 *
 * `user/message` puts the message fields at the top level, while
 * `assistant/message` and `tool/result` wrap them in `data.message`. Reading a
 * single shape is how a collector silently records nothing at all: the text
 * lives one level deeper than the code expects and every excerpt is empty.
 */
function messageOf(data: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const inner = data?.message
  if (inner !== null && typeof inner === 'object' && !Array.isArray(inner)) {
    return inner as Record<string, unknown>
  }
  return data
}

/** Extract the plain text of a message payload. */
function messageText(data: Record<string, unknown> | undefined): string {
  const content = messageOf(data)?.content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (block === null || typeof block !== 'object') continue
    const record = block as { type?: unknown; text?: unknown }
    if (record.type === 'text' && typeof record.text === 'string') parts.push(record.text)
  }
  return parts.join('\n').trim()
}

/** Collapse whitespace and cut an excerpt down to one line. */
function excerpt(text: string, max = MAX_EXCERPT_CHARS): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max)}…`
}

/** The ISO time of an event, falling back to now. */
function eventTime(event: EventLike): string {
  if (typeof event.time === 'string') return event.time
  if (typeof event.time === 'number' && Number.isFinite(event.time)) {
    return new Date(event.time).toISOString()
  }
  return new Date().toISOString()
}

/** The workspace recorded on a session, if any. */
function sessionWorkspace(session: SessionLike): string {
  const cwd = session.header?.meta?.cwd ?? session.header?.cwd
  return typeof cwd === 'string' ? cwd : ''
}

/**
 * The session collector.
 *
 * One instance lives for the whole Host process; every subscription is
 * registered by the caller on `ctx.effect`, so a plugin reload drops them.
 */
export class SessionCollector {
  private readonly host: CollectorHost
  private readonly sessions = new Map<string, SessionState>()
  private draining: Promise<void> = Promise.resolve()

  constructor(host: CollectorHost) {
    this.host = host
  }

  /** Handle one `session/event`. */
  observe(session: SessionLike, event: EventLike): void {
    if (!this.host.enabled()) {
      // The switch may have been turned off mid-session: drop what we held so
      // the user's expectation ("off means off") is literally true.
      if (this.sessions.size > 0) this.forgetAll()
      return
    }
    const state = this.stateFor(session)
    // First sight of a session that predates the plugin: replay its log first,
    // so the live event below lands on top of the history rather than replacing it.
    if (!state.backfilled) this.backfill(session, event.seq)
    state.seq = Math.max(state.seq, event.seq)
    const recorded = this.reduce(state, event)
    if (recorded !== undefined) {
      this.buffer(state, recorded)
      state.dirty += 1
    }
    state.ended = eventTime(event)
    this.scheduleFlush(state)
    this.scheduleIdleFinalize(state)
  }

  /** Force everything buffered for `session` to disk (a durability checkpoint). */
  async flush(session: SessionLike): Promise<void> {
    const state = this.sessions.get(session.id)
    if (state === undefined) return
    await this.enqueue(async () => {
      await this.persist(state)
    })
  }

  /** A session went away: write its note and drop the live state. */
  async dispose(session: SessionLike): Promise<void> {
    const state = this.sessions.get(session.id)
    if (state === undefined) return
    this.clearTimers(state)
    this.sessions.delete(session.id)
    await this.enqueue(async () => {
      state.finalized = true
      await this.persist(state)
    })
  }

  /** Stop collecting and drop every buffer without writing it. */
  forgetAll(): void {
    for (const state of this.sessions.values()) this.clearTimers(state)
    this.sessions.clear()
  }

  /** Adopt the sessions that already exist when the plugin loads. */
  adopt(sessions: readonly SessionLike[]): void {
    if (!this.host.enabled()) return
    for (const session of sessions) {
      if (this.sessions.has(session.id)) continue
      if (this.sessions.size >= MAX_SESSIONS_TRACKED) return
      this.stateFor(session)
      // An adopted session is one that was already running: replay its log or
      // its note will claim the session did nothing.
      this.backfill(session)
    }
  }

  /** Sessions currently tracked, for diagnostics. */
  get tracked(): number {
    return this.sessions.size
  }

  /** Live state of one session, creating it on first sight. */
  private stateFor(session: SessionLike): SessionState {
    const existing = this.sessions.get(session.id)
    if (existing !== undefined) {
      const workspace = sessionWorkspace(session)
      if (workspace !== '' && existing.workspace === '') existing.workspace = workspace
      return existing
    }
    const state: SessionState = {
      id: session.id,
      workspace: sessionWorkspace(session),
      started: new Date().toISOString(),
      ended: null,
      turns: 0,
      events: [],
      callNames: new Map(),
      dirty: 0,
      seq: 0,
      backfilled: false,
      timer: null,
      idleTimer: null,
      finalized: false,
    }
    this.sessions.set(session.id, state)
    return state
  }

  /**
   * Replay the part of a session's log that happened before the plugin mounted.
   *
   * A session the Host already had open when this plugin loaded emits nothing
   * about its past: `session/event` is a live feed, not a replay. Without this
   * the first note of an in-flight session says `turns: 0` and 「还没有可记录
   * 的内容」 even though the session is thousands of events deep — the note is
   * not empty because nothing happened, but because we arrived late.
   *
   * Runs once per session, and only when the session exposes its log.
   *
   * @param uptoExclusive - replay only events below this seq. `observe()` passes
   *   the seq of the event it is already holding, so the live path records that
   *   one and the replay never doubles it.
   */
  backfill(session: SessionLike, uptoExclusive = Number.POSITIVE_INFINITY): void {
    if (!this.host.enabled()) return
    const state = this.sessions.get(session.id) ?? this.stateFor(session)
    if (state.backfilled) return
    state.backfilled = true
    const snapshot = session.snapshotEvents
    if (typeof snapshot !== 'function') return
    let events: readonly EventLike[]
    try {
      events = snapshot.call(session, 0, uptoExclusive)
    } catch (error) {
      this.host.log(`会话历史回填失败（${session.id}）：${String(error)}`)
      return
    }
    // The log is replayed in order so `tool/call` still resolves the
    // `tool/result` that follows it; anything already seen live is skipped.
    let recorded = 0
    let earliest: string | undefined
    for (const event of events) {
      if (typeof event?.type !== 'string' || typeof event.seq !== 'number') continue
      if (event.seq >= uptoExclusive) continue
      if (event.seq > state.seq) state.seq = event.seq
      const time = eventTime(event)
      if (earliest === undefined || time < earliest) earliest = time
      const line = this.reduce(state, event)
      if (line !== undefined && this.buffer(state, line)) recorded += 1
    }
    // The note belongs to the day the session actually began, not to the day
    // this plugin happened to load.
    if (earliest !== undefined && earliest < state.started) state.started = earliest
    state.dirty += recorded
  }

  /**
   * Append a recorded line under the two caps, returning whether it was kept.
   *
   * Assistant replies are capped on their own so their volume cannot evict the
   * user's own words from the fixed note budget. Both the live path and the
   * history replay go through here, or a replayed session would ignore the caps.
   */
  private buffer(state: SessionState, line: RecordedEvent): boolean {
    const assistantFull =
      line.kind === 'assistant' && state.events.filter(item => item.kind === 'assistant').length >= MAX_ASSISTANT_EVENTS
    if (assistantFull || state.events.length >= MAX_RECORDED_EVENTS) return false
    state.events.push(line)
    return true
  }

  /** Reduce one event to a recorded line, or `undefined` when it is not kept. */
  private reduce(state: SessionState, event: EventLike): RecordedEvent | undefined {
    const data = event.data
    switch (event.type) {
      case 'user/message': {
        const source = (data?.source ?? {}) as { kind?: unknown }
        // Only the human's own words: a reply to an assistant question, a
        // subagent prompt or a tool-injected message is not the user speaking.
        if (source.kind !== 'user') return undefined
        const text = messageText(data)
        if (text === '') return undefined
        return { kind: 'user', seq: event.seq, time: eventTime(event), text: excerpt(text) }
      }
      case 'assistant/message': {
        const text = messageText(data)
        if (text === '') return undefined
        return { kind: 'assistant', seq: event.seq, time: eventTime(event), text: excerpt(text, 200) }
      }
      case 'tool/call': {
        // Remembered, never recorded: the result carries the outcome but not the
        // tool's name, so the pair can only be reconstructed from the call.
        const callId = typeof data?.callId === 'string' ? data.callId : ''
        const name = typeof data?.name === 'string' ? data.name : ''
        if (callId !== '' && name !== '') {
          if (state.callNames.size >= MAX_CALL_NAMES) state.callNames.clear()
          state.callNames.set(callId, name)
        }
        return undefined
      }
      case 'tool/result': {
        // Name and outcome only — never the payload (memory-plan §5.1).
        const message = messageOf(data)
        const source = message?.source as { callId?: unknown } | undefined
        const callId =
          typeof message?.toolCallId === 'string'
            ? message.toolCallId
            : typeof data?.toolCallId === 'string'
              ? data.toolCallId
              : typeof source?.callId === 'string'
                ? source.callId
                : ''
        const known = callId === '' ? undefined : state.callNames.get(callId)
        // The name is only on the matching `tool/call`; a result that arrives
        // without one is still recorded, just without a name to attribute it to.
        const fallback = typeof data?.name === 'string' ? data.name : typeof message?.name === 'string' ? message.name : ''
        const name = known ?? fallback
        const failed = message?.isError === true || data?.isError === true || data?.error !== undefined || data?.ok === false
        if (callId !== '' && known !== undefined) state.callNames.delete(callId)
        return {
          kind: 'tool',
          seq: event.seq,
          time: eventTime(event),
          text: `${name === '' ? '工具调用' : name}${failed ? '（失败）' : '（成功）'}`,
        }
      }
      case 'turn/end': {
        state.turns += 1
        const reason = (data?.reason ?? {}) as { kind?: unknown }
        const kind = typeof reason.kind === 'string' ? reason.kind : ''
        return { kind: 'turn', seq: event.seq, time: eventTime(event), text: kind === '' ? '回合结束' : `回合结束（${kind}）` }
      }
      default:
        return undefined
    }
  }

  /** Flush on the throttle (5s or 20 events). */
  private scheduleFlush(state: SessionState): void {
    if (state.dirty >= FLUSH_EVENT_COUNT) {
      if (state.timer !== null) clearTimeout(state.timer)
      state.timer = null
      void this.enqueue(async () => {
        await this.persist(state)
      })
      return
    }
    if (state.timer !== null) return
    state.timer = setTimeout(() => {
      state.timer = null
      void this.enqueue(async () => {
        await this.persist(state)
      })
    }, FLUSH_INTERVAL_MS)
    state.timer.unref?.()
  }

  /** Finalize the note once the session has been quiet for a while. */
  private scheduleIdleFinalize(state: SessionState): void {
    if (state.idleTimer !== null) clearTimeout(state.idleTimer)
    state.idleTimer = setTimeout(() => {
      state.idleTimer = null
      if (state.finalized) return
      state.finalized = true
      void this.enqueue(async () => {
        await this.persist(state)
        this.sessions.delete(state.id)
      })
    }, IDLE_FINALIZE_MS)
    state.idleTimer.unref?.()
  }

  /** Clear both timers of one session. */
  private clearTimers(state: SessionState): void {
    if (state.timer !== null) clearTimeout(state.timer)
    if (state.idleTimer !== null) clearTimeout(state.idleTimer)
    state.timer = null
    state.idleTimer = null
  }

  /** Serialize writes so two sessions never interleave on `state.json`. */
  private enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.draining.then(operation, operation)
    this.draining = next.catch(() => undefined)
    return next
  }

  /** Write the session note plus the state watermark. */
  private async persist(state: SessionState): Promise<void> {
    if (!this.host.enabled() && !state.finalized) return
    if (state.dirty === 0 && !state.finalized) return
    try {
      const relative = await this.host.store.writeSessionNote(
        dayKey(new Date(state.started)),
        state.id,
        {
          sessionId: state.id,
          workspace: state.workspace,
          started: state.started,
          ended: state.ended ?? new Date().toISOString(),
          turns: state.turns,
          events: state.events.length,
          consolidated: false,
          title: this.title(state),
          updated: new Date().toISOString(),
        },
        this.renderBody(state),
      )
      state.dirty = 0
      await this.markPending(relative, state.seq)
      this.host.onNote?.(relative)
    } catch (error) {
      this.host.log(`workbuddy-memory: 会话笔记写入失败（${state.id}）：${String(error)}`)
    }
  }

  /** A one-line title for the note: the first thing the user asked. */
  private title(state: SessionState): string {
    const first = state.events.find(event => event.kind === 'user')
    return first === undefined ? state.id.slice(0, 8) : excerpt(first.text, 60)
  }

  /** Render the note body (memory-plan §4.4). */
  private renderBody(state: SessionState): string {
    const userLines = state.events.filter(event => event.kind === 'user')
    const assistantLines = state.events.filter(event => event.kind === 'assistant')
    const toolLines = state.events.filter(event => event.kind === 'tool')
    const candidates: string[] = []
    for (const event of userLines) {
      for (const { label, pattern } of PREFERENCE_PATTERNS) {
        if (!pattern.test(event.text)) continue
        candidates.push(`- (候选 · ${label}) ${excerpt(event.text, 160)} · seq ${event.seq}`)
        break
      }
    }
    const projects = state.workspace === '' ? [] : [`- ${state.workspace}：本会话的工作目录`]
    const failed = toolLines.filter(line => line.text.includes('（失败）'))
    // What the session did, in event order: the user's asks and the assistant's
    // replies. Tool traffic is aggregated instead of listed, because a real
    // session emits over a thousand of them and a note is a summary, not a log.
    const dialogue = state.events
      .filter(event => event.kind === 'user' || event.kind === 'assistant')
      .slice(0, MAX_DIALOGUE_LINES)
      .map(event => `- ${event.kind === 'user' ? '' : '助手：'}${event.text}`)
    const counts = new Map<string, { ok: number; failed: number }>()
    for (const line of toolLines) {
      const name = line.text.replace(/（(成功|失败)）$/, '')
      const entry = counts.get(name) ?? { ok: 0, failed: 0 }
      if (line.text.endsWith('（失败）')) entry.failed += 1
      else entry.ok += 1
      counts.set(name, entry)
    }
    const toolSummary =
      counts.size === 0
        ? []
        : [
            `- 工具调用 ${toolLines.length} 次：${[...counts.entries()]
              .map(([name, entry]) => `${name} ×${entry.ok + entry.failed}`)
              .join('、')}${failed.length > 0 ? `（失败 ${failed.length} 次）` : ''}`,
          ]
    const sections = [
      '## 做了什么',
      dialogue.length === 0 && toolSummary.length === 0
        ? '- （本会话还没有可记录的内容）'
        : [...dialogue, ...toolSummary].join('\n'),
      '',
      '## 观察到的工作习惯候选',
      candidates.length === 0 ? '- （无）' : candidates.slice(0, 12).join('\n'),
      '',
      '## 项目相关',
      projects.length === 0 ? '- （无）' : projects.join('\n'),
      '',
      '## 未决事项',
      failed.length === 0
        ? '- （无）'
        : failed.slice(0, 8).map(line => `- 工具 ${line.text.replace('（失败）', '')} 在 seq ${line.seq} 失败`).join('\n'),
    ]
    return sections.join('\n')
  }

  /** Record the note in `state.json` so a consolidation pass picks it up. */
  private async markPending(relative: string, seq: number): Promise<void> {
    const store = this.host.store
    const state: PluginState = await store.readState()
    const processed = { ...state.processed }
    // The watermark is monotonic: a late flush of an old buffer must not lower it.
    if (seq >= (processed[this.keyFor(relative)] ?? 0)) processed[this.keyFor(relative)] = seq
    const pending = state.pending.includes(relative) ? state.pending : [...state.pending, relative]
    await store.writeState({ ...state, processed, pending })
  }

  /** The watermark key of one note. */
  private keyFor(relative: string): string {
    return relative
  }

  /** Topic keys the collector can propose candidates for. */
  static get topics(): readonly string[] {
    return TOPICS.map(topic => topic.key)
  }
}
