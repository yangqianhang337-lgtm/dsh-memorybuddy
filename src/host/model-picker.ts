/**
 * Which model the distillation stage calls (memory-plan §6.1.2, memorybuddy-plan §4.4–§4.6).
 *
 * The order is fixed and the user's own pick sits at the top of it:
 *
 *   1. the model the user chose in the panel (`modelChoiceProvider` / `modelChoiceModel`)
 *   2. the free tier, read from the pool catalogues on disk
 *   3. a third-party provider that is already configured
 *   4. the session default model (read-only — never `saveSelection`)
 *   5. anything the runtime advertises
 *
 * Three rules keep this honest, and each one exists because its absence was a
 * real bug in the first draft of the plan:
 *
 * - **The cooldown table is keyed by the route `provider/model` only.** The
 *   draft gave the user's pick a `choice:` prefix, which meant a rate-limited
 *   `hy3` was written under one key and then immediately re-tried under
 *   another, because the free tier's first entry is the same `hy3`. One table,
 *   one key.
 * - **`modelAllowlist` is a hard boundary, the user's own pick included.** A
 *   field cannot mean both "suggested" and "enforced"; if the user declared a
 *   boundary, letting their pick step over it contradicts the policy they just
 *   set.
 * - **The free tag is matched on the `(provider, id)` pair.** The catalogue is
 *   grouped by account, so `hy3` can appear under two providers, and the
 *   runtime's own docs say catalogue membership is advisory. A bare-id match
 *   would tag the wrong row.
 *
 * Nothing here throws: every failure becomes a skip reason, because a broken
 * model route must never take down a consolidation pass.
 */

import { readTextOrUndefined } from './fsx.ts'
import { join } from 'node:path'
import { resolveDshHome } from './dsh-home.ts'
import type {
  CooldownView,
  FailureKind,
  ModelCatalog,
  ModelOption,
  ModelPolicy,
  PreferencesView,
} from '../protocol.ts'

/** One entry of the candidate chain, already resolved to a concrete route. */
export interface ModelRoute {
  provider: string
  model: string
  /** Empty means "let the model decide". */
  effort?: string
  /** Why this route is in the chain — the journal names it. */
  source: 'choice' | 'free' | 'third-party' | 'session-default' | 'any'
}

/** The subset of `LlmRuntime` this module uses, soft-probed via `ctx.get('llm')`. */
export interface LlmLike {
  listProviders?: () => { id: string; name: string }[]
  listModels?: (provider: string) => Promise<readonly LlmModelInfoLike[]>
  resolveModelInfo?: (provider: string, model: string, signal?: AbortSignal) => Promise<LlmResolvedLike>
  prepareCall?: (config: LlmCallConfigLike, signal?: AbortSignal) => Promise<PreparedCallLike>
  /**
   * The public streaming method, used only as a fallback when `prepareCall` is
   * absent. It is an ordinary instance property that a provider plugin may
   * legitimately overwrite with the waterfall listener signature
   * `(options, next)`, so it is never the first choice.
   */
  stream?: (options: Record<string, unknown>) => AsyncIterable<unknown>
}

export interface LlmModelInfoLike {
  provider?: string
  id?: string
  name?: string
  description?: string
}

export interface LlmResolvedLike extends LlmModelInfoLike {
  context?: { contextWindow?: number }
  defaultMaxTokens?: number
  reasoning?: { efforts?: { id?: string; name?: string }[]; defaultEffort?: string }
}

export interface LlmCallConfigLike {
  provider: string
  model: string
  reasoningEffort?: string
  temperature?: number
  maxTokens?: number
}

export interface PreparedCallLike {
  /** The config the runtime actually resolved — defaults materialized, frozen. */
  config: LlmCallConfigLike
  /**
   * The request is a full `GenerateOptions`: the prepared handle validates it
   * against the config it resolved and rejects with
   * "prepared LLM call config changed before adapter dispatch" when the config
   * fields differ — including a `reasoningEffort` default it materialized that
   * the caller never asked for.
   */
  stream: (
    request: LlmCallConfigLike & { messages: unknown[]; system?: string; signal?: AbortSignal },
  ) => AsyncIterable<unknown>
}

/** Cooldown windows per failure kind (memorybuddy-plan §4.6). */export const COOLDOWN_MINUTES: Record<FailureKind, number> = {
  quota: 6 * 60,
  missing: 24 * 60,
  auth: 24 * 60,
  network: 30,
  unknown: 30,
}

/** How long an enumerated catalogue stays fresh before we ask the runtime again. */
const CATALOG_TTL_MS = 10 * 60_000

/** The pool catalogues, in the order the plan names them. */
const CATALOG_FILES = ['.workbuddy-catalog.json', '.workbuddy-ai-catalog.json']

/** Providers the plan names as "already configured third parties" (§4.5 level 3). */
const THIRD_PARTY_PROVIDERS = ['sensenova', 'qwen']

/** Classify a thrown error into a cooldown bucket. Conservative by design. */
/**
 * Map a thrown call failure to one of the five cooldown kinds.
 *
 * The runtime reports these as `LlmError` with a `code` (INVALID_MODEL_REASONING,
 * UNSUPPORTED_REASONING_EFFORT, NO_ADAPTER, INVALID_PREPARED_CALL, …), so the
 * code is consulted first: matching on the message text alone would bucket an
 * unsupported effort as "auth" the moment an adapter mentions its api key in the
 * error string.
 */
export function classifyFailure(error: unknown): FailureKind {
  const code =
    typeof (error as { code?: unknown } | null)?.code === 'string' ? (error as { code: string }).code : ''
  if (code === 'UNSUPPORTED_REASONING_EFFORT' || code === 'INVALID_MODEL_REASONING') return 'missing'
  if (code === 'INVALID_PREPARED_CALL' || code === 'INVALID_MODEL_INFO' || code === 'INVALID_CATALOG') {
    return 'unknown'
  }
  if (code === 'NO_ADAPTER') return 'missing'
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  if (/额度|限流|配额|欠费|rate.?limit|quota|insufficient|too many requests|429/i.test(text)) return 'quota'
  if (/不存在|not found|unknown model|no such model|unsupported model|404/i.test(text)) return 'missing'
  if (/认证|鉴权|未授权|unauthor|invalid.?api.?key|401|403|api key/i.test(text)) return 'auth'
  if (/网络|超时|timed?\s?out|timeout|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|socket|abort/i.test(text)) {
    return 'network'
  }
  return 'unknown'
}

/** `provider/model`, the one true cooldown key. */
export function routeKey(provider: string, model: string): string {
  return `${provider}/${model}`
}

/** True when the model is inside a non-empty allowlist. An empty list allows all. */
export function allows(allowed: readonly string[], provider: string, model: string): boolean {
  if (allowed.length === 0) return true
  const route = routeKey(provider, model)
  return allowed.some(entry => entry === route || entry === model || entry === provider)
}

/** The picker's shape of one free-tier catalogue entry. */
interface FreeEntry {
  provider: string
  model: string
}

/**
 * Read the on-disk pool catalogues for free-tier models.
 *
 * Shape: `{ entries: { "<account>:": { models: [{ id, billing: { free, credits } }] } } }`.
 * The account key is the closest thing the file has to a provider, so it is
 * used as one — and a catalogue that cannot be read simply yields no free tier,
 * which sends the chain to its next level rather than failing the pass.
 *
 * Read on every pass, never cached: free-ness is time-boxed by `promotions[]`
 * (a promotion with `factor: 0` marks a model free for a window), so a cached
 * free list would keep promoting a model after its promotion ends.
 */
export async function readFreeModels(dshHome: string): Promise<FreeEntry[]> {
  const found: FreeEntry[] = []
  const now = Date.now()
  for (const file of CATALOG_FILES) {
    const raw = await readTextOrUndefined(join(dshHome, file))
    if (raw === undefined) continue
    try {
      const parsed = JSON.parse(raw) as {
        entries?: Record<string, { models?: unknown[] }>
      }
      for (const [account, value] of Object.entries(parsed.entries ?? {})) {
        const provider = account.replace(/:$/, '')
        for (const model of value?.models ?? []) {
          const record = model as {
            id?: unknown
            billing?: { free?: unknown; credits?: unknown }
            promotions?: unknown[]
          }
          if (typeof record.id !== 'string') continue
          if (isFree(record.billing, record.promotions, now)) {
            found.push({ provider, model: record.id })
          }
        }
      }
    } catch {
      // A malformed catalogue is not an error: the chain has four more levels.
    }
  }
  return found
}

/**
 * Decide whether one catalogue entry counts as free right now.
 *
 * Three independent sources, any one of which is enough:
 * - `billing.free === true`;
 * - `billing.credits` whose amount is zero — the two catalogues disagree on
 *   whether the unit is attached (`"x0.00 credits"` vs `"x0.00"`), so the
 *   comparison is on the parsed amount rather than the literal string;
 * - a live promotion (`{ start, end, factor: 0 }` inside its window), which is
 *   how the app catalogue marks a model free without touching its base price.
 *
 * A missing `credits` is tolerated (some entries carry only `free`).
 */
function isFree(
  billing: { free?: unknown; credits?: unknown } | undefined,
  promotions: unknown[] | undefined,
  now: number,
): boolean {
  if (billing?.free === true) return true
  // The two catalogues disagree on the format: the CLI one writes
  // `"x0.00 credits"`, the app one `"x0.00"`. `parseFloat` refuses both, because
  // it stops at the leading `x` — so the number is extracted first.
  const amount = typeof billing?.credits === 'string' ? Number(billing.credits.replace(/[^0-9.]/g, '')) : Number.NaN
  if (Number.isFinite(amount) && amount === 0) return true
  for (const promotion of promotions ?? []) {
    const record = promotion as { start?: unknown; end?: unknown; factor?: unknown }
    const factor = typeof record.factor === 'number' ? record.factor : 1
    const start = typeof record.start === 'number' ? record.start : 0
    const end = typeof record.end === 'number' ? record.end : Number.POSITIVE_INFINITY
    if (factor === 0 && now >= start && now < end) return true
  }
  return false
}

/**
 * Resolve the model stage's candidate chain for one pass.
 *
 * Pure with respect to the runtime: it reads preferences, `state.json`'s
 * cooldown table and the on-disk catalogues, and never calls a model.
 */
export class ModelPicker {
  private readonly dshHome: string
  private catalogCache: { at: number; value: ModelCatalog } | undefined

  constructor(dshHome: string = resolveDshHome()) {
    this.dshHome = dshHome
  }

  /** Drop the cached catalogue — called on `llm/adapters-updated`. */
  invalidate(): void {
    this.catalogCache = undefined
  }

  /**
   * Enumerate providers and models for the panel's dropdown.
   *
   * `listModels()` is asynchronous and may hit the network, so the result is
   * cached for `CATALOG_TTL_MS` and only refreshed when the panel actually
   * expands the menu. Without the cache, opening the panel would fan out one
   * network call per provider every time.
   */
  async catalog(llm: LlmLike | undefined, now: number = Date.now()): Promise<ModelCatalog> {
    if (this.catalogCache !== undefined && now - this.catalogCache.at < CATALOG_TTL_MS) {
      return this.catalogCache.value
    }
    const fetchedAt = new Date(now).toISOString()
    if (llm?.listProviders === undefined) {
      const empty: ModelCatalog = { providers: [], models: [], fetchedAt, note: '当前环境没有可用的模型服务' }
      this.catalogCache = { at: now, value: empty }
      return empty
    }
    let providers: { id: string; name: string }[] = []
    try {
      providers = llm.listProviders() ?? []
    } catch {
      providers = []
    }
    const free = await readFreeModels(this.dshHome)
    const models: ModelOption[] = []
    let failed = 0
    for (const provider of providers) {
      if (llm.listModels === undefined) break
      try {
        const listed = await llm.listModels(provider.id)
        for (const info of listed ?? []) {
          const id = typeof info.id === 'string' ? info.id : ''
          if (id === '') continue
          models.push({
            provider: provider.id,
            id,
            name: typeof info.name === 'string' && info.name !== '' ? info.name : id,
            // Pair match, never the bare id (§4.4).
            free: free.some(entry => entry.provider === provider.id && entry.model === id),
          })
        }
      } catch {
        failed += 1
      }
    }
    const note =
      models.length === 0
        ? failed > 0
          ? '模型列表拉取失败，可以手填 provider/model'
          : '当前环境没有可用的模型'
        : failed > 0
          ? `${failed} 个 provider 的模型列表拉取失败`
          : undefined
    const value: ModelCatalog = { providers, models, fetchedAt, note }
    this.catalogCache = { at: now, value }
    return value
  }

  /** Resolve one route's capability, for the picker's validation line. */
  async validate(
    llm: LlmLike | undefined,
    provider: string,
    model: string,
  ): Promise<{ ok: boolean; reason?: string; efforts: string[]; defaultEffort?: string; contextWindow?: number }> {
    if (provider === '' || model === '') return { ok: false, reason: '未指定', efforts: [] }
    if (llm?.resolveModelInfo === undefined) return { ok: false, reason: '当前环境没有模型服务', efforts: [] }
    try {
      const info = await llm.resolveModelInfo(provider, model)
      const efforts = (info.reasoning?.efforts ?? [])
        .map(effort => (typeof effort.id === 'string' ? effort.id : ''))
        .filter(id => id !== '')
      return {
        ok: true,
        efforts,
        defaultEffort: info.reasoning?.defaultEffort,
        contextWindow: info.context?.contextWindow,
      }
    } catch (error) {
      return { ok: false, reason: classifyFailure(error), efforts: [] }
    }
  }

  /** Every cooling-down route, newest deadline first. */
  cooldowns(state: { modelCooldown: Record<string, number> }, now: number = Date.now()): CooldownView[] {
    const views: CooldownView[] = []
    for (const [route, until] of Object.entries(state.modelCooldown)) {
      if (typeof until !== 'number' || until <= now) continue
      views.push({
        route,
        kind: 'unknown',
        until: new Date(until).toISOString(),
        minutes: Math.ceil((until - now) / 60_000),
      })
    }
    return views.sort((left, right) => left.until.localeCompare(right.until))
  }

  /** True when the route is still cooling down. */
  cooling(state: { modelCooldown: Record<string, number> }, provider: string, model: string, now: number = Date.now()): boolean {
    const until = state.modelCooldown[routeKey(provider, model)]
    return typeof until === 'number' && until > now
  }

  /**
   * Build the ordered candidate chain for one pass.
   *
   * `available` is what the runtime advertises; when the caller has no
   * enumeration (headless, or the service is absent) the chain falls back to
   * the user's pick plus the free tier, which are both known without it.
   */
  async chain(input: {
    preferences: PreferencesView
    cooldown: Record<string, number>
    llm: LlmLike | undefined
    available: readonly { provider: string; id: string }[]
    sessionDefault?: { provider: string; model: string }
    now?: number
  }): Promise<{ chain: ModelRoute[]; skipped?: string }> {
    const now = input.now ?? Date.now()
    const { preferences, cooldown } = input
    const policy: ModelPolicy = preferences.modelPolicy
    const allowed = preferences.modelAllowlist

    // `off` beats everything, the user's own pick included (§4.4 rule 6): the
    // user said "no model distillation", and a remembered choice is not a
    // standing override of a later, more explicit instruction.
    if (policy === 'off') return { chain: [], skipped: '已关闭模型提炼' }

    const free = await readFreeModels(this.dshHome)
    const seen = new Set<string>()
    const chain: ModelRoute[] = []
    const push = (route: ModelRoute): void => {
      const key = routeKey(route.provider, route.model)
      if (route.provider === '' || route.model === '') return
      if (seen.has(key)) return
      if (!allows(allowed, route.provider, route.model)) return
      if (this.cooling({ modelCooldown: cooldown }, route.provider, route.model, now)) return
      seen.add(key)
      chain.push(route)
    }

    // 1. The user's pick.
    const choiceProvider = preferences.modelChoiceProvider.trim()
    const choiceModel = preferences.modelChoiceModel.trim()
    const choiceUsable = choiceProvider !== '' && choiceModel !== ''
    if (choiceUsable) {
      const effort = preferences.modelChoiceEffort.trim()
      push({ provider: choiceProvider, model: choiceModel, effort: effort === '' ? undefined : effort, source: 'choice' })
    }

    // 2. Free tier.
    if (policy === 'free-first' || policy === 'session-default') {
      const listed = new Set(input.available.map(item => routeKey(item.provider, item.id)))
      const usable = free.filter(entry =>
        // A catalogue may name an account the runtime no longer routes; when we
        // have an enumeration, trust it.
        listed.size === 0 || listed.has(routeKey(entry.provider, entry.model)),
      )
      for (const entry of usable) push({ provider: entry.provider, model: entry.model, source: 'free' })
    }

    // 3. Third-party providers that are already configured.
    for (const provider of input.available) {
      if (!THIRD_PARTY_PROVIDERS.includes(provider.provider)) continue
      push({ provider: provider.provider, model: provider.id, source: 'third-party' })
    }

    // 4. The session default, read-only.
    if (input.sessionDefault !== undefined) {
      push({
        provider: input.sessionDefault.provider,
        model: input.sessionDefault.model,
        source: 'session-default',
      })
    }

    // 5. Anything at all.
    for (const provider of input.available) push({ provider: provider.provider, model: provider.id, source: 'any' })

    if (chain.length === 0) {
      const why =
        choiceUsable && !allows(allowed, choiceProvider, choiceModel)
          ? '你选的模型不在白名单里'
          : '没有可用的模型（或都在冷却中）'
      return { chain, skipped: why }
    }
    return { chain }
  }
}
