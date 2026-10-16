/**
 * Host half of `dsh-memorybuddy`.
 *
 * The host owns everything durable:
 *   - the markdown store under `$DSH_HOME/dsh-memorybuddy/`,
 *   - the four HTTP routes the panel talks to,
 *   - the system-prompt section that injects long-term memory,
 *   - the `session/event` collector that turns live sessions into notes,
 *   - the three agent tools of memory-plan §5.5.
 *
 * Three constraints from memory-plan §8.2 shape every line below:
 *
 *   1. `inject` lists only services that are certainly present. A hard
 *      dependency on a service this deployment lacks makes `apply` never run
 *      at all — the plugin simply vanishes with no error. `llm` / `tools` /
 *      `timer` are therefore acquired through `ctx.get()` and degrade when
 *      missing.
 *   2. Every subscription, timer and route registration hangs off
 *      `ctx.effect()`. A hot rebuild disposes the fiber and the old
 *      registrations must come down before the new ones go up, or the GUI
 *      ends up with two panels and the route table throws `duplicate route`.
 *   3. Registration is synchronous and the durable work is asynchronous.
 *      Routes must exist the moment `apply` returns, but `ensure()` has to
 *      touch the disk; awaiting it first would mean registering into a fiber
 *      that may already be disposed.
 */

import type { MemoryStore as MemoryStoreType } from './host/store.ts'
import type { Entry } from './host/entries.ts'
import type { EventLike, SessionLike } from './host/collector.ts'
import type { PreferencesView } from './protocol.ts'
import { TOPICS } from './protocol.ts'
import { SessionCollector } from './host/collector.ts'
import { Consolidator } from './host/consolidate.ts'
import { dayKey, entryId } from './host/entries.ts'
import { mountOnce } from './host/mount-once.ts'
import { PromptCache, SECTION_NAME, SECTION_ORDER } from './host/prompt.ts'
import { memoryRoutes } from './host/routes.ts'
import { ConsolidationScheduler } from './host/schedule.ts'
import { MemoryStore, redact } from './host/store.ts'
import { DEFAULT_PREFERENCES } from './host/templates.ts'

/** The package name, used as the mount guard's seat and the log prefix. */
const PACKAGE_NAME = 'dsh-memorybuddy'

/**
 * The preferences a fresh install has.
 *
 * The scheduler reads preferences on a timer, and its first tick can beat the
 * asynchronous `refresh()` that loads them. Falling back to the shipped
 * defaults keeps that race harmless: the worst case is one tick that behaves
 * like a fresh install, and the next one sees the real file.
 */
const DEFAULT_PREFERENCES_VIEW: PreferencesView = {
  ...DEFAULT_PREFERENCES,
  modelAllowlist: [...DEFAULT_PREFERENCES.modelAllowlist],
}

/**
 * Services the host half cannot work without.
 *
 * Three of the four are installed by `@deepseek-ai/dsh-base` in EVERY
 * composition: `systemPrompt` is where memory is injected, and `agents` /
 * `commands` are the session and command registries.
 *
 * `webServer` is deliberately NOT listed, for two independent reasons:
 *
 * 1. It only exists where a GUI does (`@deepseek-ai/dsh-web-app`), and a hard
 *    `inject` on an absent service leaves the whole plugin PENDING — no
 *    collector, no tools, no injection — in every headless composition (CLI
 *    runs, the capture-only test context). Memory is at its most useful in
 *    exactly those runs. See memory-plan.md:569.
 * 2. `webServer` is a SCOPED service: it is invisible to the top-level context
 *    even when it is installed. A probe plugin declaring
 *    `inject = ['systemPrompt','agents','commands']` in a full GUI composition
 *    saw `tools` / `llm` / `skills` / `timer` resolve through `ctx.get()` while
 *    `ctx.get('webServer')` stayed `undefined`; the same plugin reached the
 *    service — and registered a working route — only inside
 *    `ctx.inject(['webServer'], scoped => …)`. A `ctx.get` soft probe therefore
 *    skips registration SILENTLY in every host, GUI included.
 *
 * The scoped inject below is what makes both true at once: the callback runs
 * only when the service is composed (so a headless run is unaffected), and it
 * receives a context that can actually see `webServer`.
 */
export const inject = ['systemPrompt', 'agents', 'commands']

/** The three tool names of memory-plan §5.5, in registration order. */
export const MEMORY_TOOL_NAMES = ['memorybuddy_recall', 'memorybuddy_remember', 'memorybuddy_forget'] as const

/** What the model is told about the plugin, appended under the memory text. */
export const MEMORY_TOOL_GUIDANCE = [
  '本机已安装 dsh-memorybuddy 插件：它把跨会话的长期记忆保存在 $DSH_HOME/dsh-memorybuddy/ 的 markdown 文件里，',
  '并在每轮对话里把用户偏好、人设、指令与记忆索引注入到这里。',
  '需要回忆用户偏好、环境事实或项目约定时调用 memorybuddy_recall；',
  '用户明确要求「记住」某件事时调用 memorybuddy_remember；',
  '记忆有误或已过期时调用 memorybuddy_forget。',
  '工具没返回的内容不要当作已知事实。',
].join('')

/* ------------------------------------------------------------------ *
 * Minimal structural types for the Cordis / DSH host services we touch.
 * The real packages are type-only peers that do not resolve from a
 * profile's `node_modules`, so the shapes are declared locally and the
 * runtime call site casts. Every accessor is optional: a capture-only
 * test context implements none of them.
 * ------------------------------------------------------------------ */

/** Anything `tools.register` hands back. */
type Disposer = () => void

/** The scoped `tools` service, as much of it as this plugin uses. */
interface ToolsLike {
  register(definition: unknown): unknown
  get(name: string, scope?: unknown): unknown
}

/** The scoped `systemPrompt` service. */
interface SystemPromptLike {
  section(section: {
    name: string
    order: number
    text: (context: unknown) => string
    interpolate?: boolean
  }): unknown
}

/** The `webServer` service. */
interface WebServerLike {
  register(route: unknown): unknown
}

/** The `agents` service. */
interface AgentsLike {
  list(): readonly { session: SessionLike }[]
}

/** The `commands` service. */
interface CommandsLike {
  register(definition: unknown): unknown
}

/** The host context, narrowed to what this plugin calls. */
interface HostContext {
  effect?(callback: () => unknown, label?: string): unknown
  on?(event: string, listener: (...args: never[]) => unknown): unknown
  get?(name: string): unknown
  provide?(name: string, value: unknown): void
  inject?(names: readonly string[], callback: (scoped: HostContext) => unknown): unknown
  systemPrompt: SystemPromptLike
  agents: AgentsLike
  commands: CommandsLike
  logger?: { info?: (message: string) => void; warn?: (message: string) => void }
}

/** A section context as the agent loop builds it (`assembleContextFor`). */
interface SectionContext {
  agent?: { session?: { header?: { cwd?: unknown } } }
  scope?: unknown
}

/** The tool output shape the panel and the model both read. */
type ToolValue = Record<string, unknown>

/** The definition object handed to `tools.register`. */
interface ToolDefinition {
  name: string
  description: string
  parameters: ToolValue
  output: { schema: ToolValue; render: (args: unknown, value: unknown) => unknown[] }
  execute: (args: Record<string, unknown>, exec: unknown) => Promise<ToolValue>
}

/** Render any tool value as one text block. */
function renderJson(_args: unknown, value: unknown): unknown[] {
  return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
}

/** A plain JSON object, for the tool's declared output schema. */
const JSON_OBJECT_SCHEMA: ToolValue = { type: 'object', additionalProperties: true }

/** True when the value is a plain record. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

/** The workspace a prompt assembly belongs to, or `''` when unknown. */
function workspaceOf(context: unknown): string {
  const section = context as SectionContext | undefined
  const cwd = section?.agent?.session?.header?.cwd
  if (typeof cwd === 'string' && cwd !== '') return cwd
  const scope = section?.scope as { session?: { header?: { cwd?: unknown } } } | undefined
  const scoped = scope?.session?.header?.cwd
  return typeof scoped === 'string' ? scoped : ''
}

/** The session a tool call came from, used as the entry's source. */
function callingSessionId(exec: unknown): string {
  const agent = (exec as { agent?: { id?: unknown; session?: { id?: unknown } } } | undefined)?.agent
  const id = agent?.id ?? agent?.session?.id
  return typeof id === 'string' ? id : 'tool'
}

/** Guess the topic a remembered sentence belongs to (memory-plan §4.3). */
function topicOf(text: string): string {
  if (/路径|目录|安装|版本|venv|环境变量|命令|端口/.test(text)) return 'environment'
  if (/项目|仓库|代码库|构建|约定|模块/.test(text)) return 'background'
  if (/偏好|喜欢|风格|习惯|不要|以后都|先给结论/.test(text)) return 'preferences-learned'
  return 'habits'
}

/** The host half's entry point. */
export function apply(ctx: HostContext): void {
  applyImpl(ctx)
}

/** The real implementation, wrapped by the shared one-mount guard. */
const applyImpl = mountOnce(PACKAGE_NAME, (ctx: HostContext): void => {
  const logger = ctx.logger
  const log = (message: string): void => {
    try {
      logger?.info?.(`${PACKAGE_NAME}: ${message}`)
    } catch {
      // A capture-only logger must never take the plugin down.
    }
  }

  const store = new MemoryStore()
  const promptCache = new PromptCache(store)

  /** Whether collection is live; mirrors `conversationMemory` in preferences. */
  let collecting = true
  /** The last preferences read, exposed to the tools and the section gate. */
  let preferences: PreferencesView | undefined
  /** The project files the prompt renderer already loaded. */
  let watchedProject = ''

  const collector = new SessionCollector({
    store,
    enabled: () => collecting,
    log,
    onNote: () => {
      void refresh()
    },
  })
  const consolidator = new Consolidator(store, log)

  let disposeSection: Disposer | undefined
  let disposeTools: Disposer | undefined
  let refreshing: Promise<void> | undefined

  /** Acquire an optional service without turning a missing one into a crash. */
  const service = <T>(name: string): T | undefined => {
    try {
      return ctx.get?.(name) as T | undefined
    } catch {
      return undefined
    }
  }

  const toolsOf = (): ToolsLike | undefined => {
    const tools = service<ToolsLike>('tools')
    return tools !== undefined && typeof tools.register === 'function' ? tools : undefined
  }

  /* -------------------------------------------------------------- *
   * Tools (memory-plan §5.5)
   * -------------------------------------------------------------- */

  const memoryTool = (): ToolDefinition => ({
    name: 'memorybuddy_recall',
    description:
      '检索跨会话长期记忆。不传参数时返回记忆索引与各主题的条目数；传 query 时按关键词检索条目（含低置信候选）。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '要检索的关键词或问题；留空返回目录索引' },
        topic: {
          type: 'string',
          enum: TOPICS.map(topic => topic.key),
          description: '限定在某个主题内检索（工作背景 / 行事风格 / 环境路径 / 习得偏好）',
        },
      },
      additionalProperties: false,
    },
    output: { schema: JSON_OBJECT_SCHEMA, render: renderJson },
    async execute(args): Promise<ToolValue> {
      const query = typeof args.query === 'string' ? args.query.trim() : ''
      const wanted = typeof args.topic === 'string' ? args.topic : ''
      const topics = TOPICS.filter(topic => wanted === '' || topic.key === wanted)
      if (query === '') {
        const index = await store.readDocument('memory/index.md')
        const counts: Record<string, number> = {}
        for (const topic of topics) counts[topic.key] = (await store.readEntries(topic.key as never)).length
        return { ok: true, index: index.body, counts }
      }
      const needle = query.toLowerCase()
      const hits: Array<Record<string, unknown>> = []
      for (const topic of topics) {
        for (const entry of await store.readEntries(topic.key as never)) {
          if (!entry.text.toLowerCase().includes(needle)) continue
          hits.push({
            id: entry.id,
            topic: topic.key,
            topicTitle: topic.title,
            text: entry.text,
            confidence: entry.confidence,
            days: entry.days,
            last: entry.last,
            pinned: entry.pinned,
            conflict: entry.conflict,
          })
        }
      }
      return { ok: true, query, count: hits.length, entries: hits.slice(0, 50) }
    },
  })

  const rememberTool = (): ToolDefinition => ({
    name: 'memorybuddy_remember',
    description:
      '主动记下一条跨会话事实。仅用于用户明确要求记住的内容、稳定环境事实、项目约定与硬约束；密钥等敏感内容会被拒绝。',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要记住的完整句子，写成可独立阅读的事实' },
        topic: {
          type: 'string',
          enum: TOPICS.map(topic => topic.key),
          description: '归入哪个主题；省略时按内容自动归类',
        },
        scope: { type: 'string', description: '可选的适用范围说明（例如某个项目名）' },
      },
      required: ['text'],
      additionalProperties: false,
    },
    output: { schema: JSON_OBJECT_SCHEMA, render: renderJson },
    async execute(args, exec): Promise<ToolValue> {
      const raw = typeof args.text === 'string' ? args.text.trim() : ''
      if (raw === '') return { ok: false, code: 'empty', message: '没有可写入的内容。' }

      // memory-plan §5.2 blacklist 1: a secret is dropped, never stored.
      const cleaned = redact(raw)
      if (cleaned.warnings.length > 0) {
        for (const warning of cleaned.warnings) store.warn(warning)
        return { ok: false, code: 'redacted', message: `内容命中敏感信息（${cleaned.warnings.join('；')}），已拒绝写入。` }
      }

      const wanted = typeof args.topic === 'string' ? args.topic : ''
      const topic = TOPICS.some(item => item.key === wanted) ? wanted : topicOf(raw)
      const id = entryId(raw)
      const entries = await store.readEntries(topic as never)
      if (entries.some(entry => entry.id === id)) {
        return { ok: true, topic, id, deduped: true, message: '这条记忆已经存在，未重复写入。' }
      }

      const today = dayKey()
      const source = typeof args.scope === 'string' && args.scope.trim() !== ''
        ? `${args.scope.trim()}@${callingSessionId(exec)}`
        : callingSessionId(exec)
      const next: Entry[] = [
        ...entries,
        {
          id,
          line: entries.length,
          text: raw,
          confidence: '低',
          days: 1,
          first: today,
          last: today,
          sources: [source],
          pinned: false,
          conflict: false,
        },
      ]
      await store.writeEntries(topic as never, next)
      return {
        ok: true,
        topic,
        id,
        confidence: '低',
        message: '已写入。同一事实在 2–3 个不同日期再次出现后会自动升为「中」并进入长期记忆索引。',
      }
    },
  })

  const forgetTool = (): ToolDefinition => ({
    name: 'memorybuddy_forget',
    description: '软删除一条记忆：条目移入 archive/ 目录，可以人工恢复，不会物理删除。',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: '条目 id，形如 M-1a2b3c4d' } },
      required: ['id'],
      additionalProperties: false,
    },
    output: { schema: JSON_OBJECT_SCHEMA, render: renderJson },
    async execute(args): Promise<ToolValue> {
      const id = typeof args.id === 'string' ? args.id.trim() : ''
      if (id === '') return { ok: false, code: 'empty', message: '缺少条目 id。' }
      for (const topic of TOPICS) {
        const entries = await store.readEntries(topic.key as never)
        if (!entries.some(entry => entry.id === id)) continue
        const moved = await store.archiveEntries(topic.key as never, [id], '工具软删除')
        return { ok: moved > 0, topic: topic.key, id, message: '已移入 archive/，可通过手工编辑恢复。' }
      }
      return { ok: false, code: 'missing', message: `没有找到条目 ${id}。` }
    },
  })

  /** Register the memory tools, or take them back down. */
  const setToolsEnabled = (active: boolean): void => {
    if (!active) {
      try {
        disposeTools?.()
      } catch {
        // A failed teardown must not stop the rest of the dispose path.
      }
      disposeTools = undefined
      return
    }
    if (disposeTools !== undefined) return
    const tools = toolsOf()
    if (tools === undefined) return
    const disposers: Disposer[] = []
    try {
      for (const definition of [memoryTool(), rememberTool(), forgetTool()]) {
        const off = tools.register(definition) as unknown
        if (typeof off === 'function') disposers.push(off as Disposer)
      }
    } catch (error) {
      for (const off of disposers) {
        try {
          off()
        } catch {
          // Ignore: the registration below already failed.
        }
      }
      log(`工具注册失败（agent 工具将不可用）：${String(error)}`)
      return
    }
    disposeTools = () => {
      for (const off of disposers) off()
    }
  }

  /** True when the memory tools are reachable from this prompt scope. */
  const toolsVisible = (context: unknown): boolean => {
    const tools = toolsOf()
    if (tools === undefined) return false
    const scope = (context as SectionContext | undefined)?.scope
    for (const name of MEMORY_TOOL_NAMES) {
      try {
        if (tools.get(name, scope) !== undefined) return true
      } catch {
        // A refused lookup is not proof the tool is gone; keep the guidance.
        return true
      }
    }
    return false
  }

  /* -------------------------------------------------------------- *
   * Prompt section (memory-plan §5.4)
   * -------------------------------------------------------------- */

  /** Install the memory section, replacing any previous registration. */
  const syncSection = (): void => {
    if (disposeSection !== undefined) {
      try {
        disposeSection()
      } catch {
        // Ignore: the section registry is going away anyway.
      }
      disposeSection = undefined
    }
    if (preferences === undefined) return
    try {
      const off = ctx.systemPrompt.section({
        name: SECTION_NAME,
        order: SECTION_ORDER,
        // Memory is user prose and may legitimately contain `{{ }}`: expanding
        // it as a template would either throw or silently eat the text.
        interpolate: false,
        text: (context: unknown): string => {
          const workspace = workspaceOf(context)
          if (workspace !== '' && workspace !== watchedProject) {
            watchedProject = workspace
            void promptCache.watchProject(workspace).catch(() => undefined)
          }
          const rendered = promptCache.render(workspace)
          if (rendered.text === '') return ''
          return toolsVisible(context) ? `${rendered.text}\n\n${MEMORY_TOOL_GUIDANCE}` : rendered.text
        },
      })
      if (typeof off === 'function') disposeSection = off as Disposer
    } catch (error) {
      log(`系统提示注入失败（记忆将不进入提示词）：${String(error)}`)
    }
  }

  /* -------------------------------------------------------------- *
   * Refresh: re-read preferences and re-derive every derived state.
   * -------------------------------------------------------------- */

  const refreshNow = async (): Promise<void> => {
    try {
      preferences = await store.readPreferences()
      collecting = preferences.conversationMemory
      await promptCache.prime()
      syncSection()
      setToolsEnabled(preferences.localMemorySkills)
    } catch (error) {
      log(`状态刷新失败：${String(error)}`)
    }
  }

  /** Serialize refreshes so two saves cannot interleave their re-reads. */
  const refresh = (): Promise<void> => {
    const next = (refreshing ?? Promise.resolve()).then(refreshNow, refreshNow)
    refreshing = next.catch(() => undefined)
    return next
  }

  /* -------------------------------------------------------------- *
   * Registrations. Each one is owned by an effect so a hot rebuild
   * takes the old copy down before the new one goes up.
   * -------------------------------------------------------------- */

  const routes = memoryRoutes({
    store: store as unknown as MemoryStoreType,
    consolidator,
    onChanged: () => {
      void refresh()
    },
    log,
  })

  /**
   * The trigger scheduler (memory-plan §6.1).
   *
   * Its whole input is `preferences` (re-read live, so flipping a switch in the
   * panel takes effect on the next tick) plus the activity clock the session
   * subscription below keeps. The scheduler never touches a memory file: it only
   * decides *when* to ask the consolidator for a pass.
   */
  const scheduler = new ConsolidationScheduler({
    store: store as unknown as MemoryStoreType,
    consolidator,
    preferences: () => preferences ?? DEFAULT_PREFERENCES_VIEW,
    log,
    onRun: () => {
      void refresh()
    },
  })

  ctx.effect?.(() => {
    scheduler.start()
    return () => {
      scheduler.stop()
    }
  }, `${PACKAGE_NAME}: consolidation scheduler`)

  ctx.effect?.(() => {
    const disposers: Disposer[] = []
    let torn = false

    /*
     * Register through a SCOPED inject, not through `ctx.get`:
     *
     * - `ctx.inject` runs the callback only when `webServer` is actually
     *   composed, so a headless profile keeps working with no route at all
     *   instead of the whole plugin going pending (probe A/B).
     * - Only the scoped context can see `webServer`; the top-level `get()`
     *   returns `undefined` for it even in a full GUI composition (probe B),
     *   which is why the previous `ctx.get` probe skipped registration
     *   silently everywhere.
     *
     * The callback fires asynchronously — measured: the effect body returns
     * BEFORE it runs — so teardown has to cope with both orderings: routes
     * registered after the effect was disposed are rolled back immediately,
     * and routes registered before it are closed by the returned disposer.
     */
    const register = (scoped: HostContext): void => {
      const server = (typeof scoped.get === 'function' ? scoped.get('webServer') : undefined) as
        | WebServerLike
        | undefined
      if (server === undefined || typeof server.register !== 'function') {
        log('未检测到 webServer，跳过 HTTP 路由注册（记忆与工具照常工作）')
        return
      }
      const owned: Disposer[] = []
      try {
        for (const route of routes) {
          const off = server.register(route)
          if (typeof off === 'function') owned.push(off as Disposer)
        }
      } catch (error) {
        for (const off of owned.splice(0)) {
          try {
            off()
          } catch {
            // Ignore: the mount is failing anyway.
          }
        }
        throw error
      }
      if (torn) {
        // Disposed while the callback was in flight: never leak the routes.
        for (const off of owned.splice(0)) off()
        return
      }
      disposers.push(...owned)
    }

    if (typeof ctx.inject !== 'function') {
      log('未检测到 ctx.inject，跳过 HTTP 路由注册（记忆与工具照常工作）')
      return undefined
    }
    ctx.inject(['webServer'], register)

    return () => {
      torn = true
      for (const off of disposers.splice(0)) off()
    }
  }, `${PACKAGE_NAME}: http routes`)

  ctx.effect?.(() => {
    const disposers: Disposer[] = []
    const subscribe = (event: string, listener: (...args: never[]) => unknown): void => {
      const handle = ctx.on?.(event, listener) as unknown
      if (typeof handle === 'function') disposers.push(handle as Disposer)
    }
    subscribe('session/event', (session: SessionLike, event: EventLike) => {
      scheduler.touch()
      collector.observe(session, event)
    })
    subscribe('session/flush', (session: SessionLike) => {
      void collector.flush(session)
      scheduler.sessionEnded()
    })
    subscribe('session/disposed', (session: SessionLike) => {
      void collector.dispose(session)
      scheduler.sessionEnded()
    })
    // Sessions that were already live when the plugin loaded still need notes.
    try {
      const live = ctx.agents.list()
      collector.adopt(live.map(agent => agent.session))
    } catch {
      // An empty registry is not an error.
    }
    return () => {
      for (const off of disposers.splice(0)) off()
      collector.forgetAll()
    }
  }, `${PACKAGE_NAME}: session collector`)

  ctx.effect?.(() => () => {
    try {
      disposeSection?.()
    } catch {
      // Ignore: the fiber is going away.
    }
    disposeSection = undefined
    setToolsEnabled(false)
    collector.forgetAll()
  }, `${PACKAGE_NAME}: prompt section and tools`)

  // `/memory` is the escape hatch for a user who is not looking at the panel.
  try {
    const off = ctx.commands.register({
      name: 'memory',
      description: '查看长期记忆状态，或立即执行一次确定性整理',
      input: { hint: '状态 | 整理' },
      // The runtime hands the handler a frozen `{ commandId, agent, rawInput,
      // attachments, signal }` invocation, not the raw text.
      handler: async (invocation: unknown): Promise<unknown> => {
        const raw = (invocation as { rawInput?: unknown } | undefined)?.rawInput
        const argument = typeof raw === 'string' ? raw.trim() : ''
        if (argument === '整理') {
          const report = await consolidator.run('手动整理')
          return {
            kind: 'success',
            text: `整理完成：扫描 ${report.scanned} 条候选，新增 ${report.added}，合并 ${report.merged}，归档 ${report.archived}。`,
          }
        }
        const snapshot = await store.snapshot()
        const pending = snapshot.sessions.pending
        const drafts = snapshot.drafts.length
        return {
          kind: 'success',
          text: [
            `记忆目录：${snapshot.root}`,
            `待整理会话：${pending} 个 · 待批准技能：${drafts} 个`,
            `上次整理：${snapshot.consolidation.lastAt ?? '（还没有整理过）'}`,
            snapshot.consolidation.modelNote,
          ].join('\n'),
        }
      },
    })
    if (typeof off === 'function') {
      ctx.effect?.(() => () => {
        ;(off as Disposer)()
      }, `${PACKAGE_NAME}: /memory command`)
    }
  } catch (error) {
    log(`/memory 命令注册失败：${String(error)}`)
  }

  // The durable half: create the directory, load the cache, then serve.
  void (async () => {
    try {
      await store.ensure()
      await refresh()
      log(`已就绪，记忆目录：${store.root}`)
    } catch (error) {
      log(`初始化失败：${String(error)}`)
    }
  })()
})
