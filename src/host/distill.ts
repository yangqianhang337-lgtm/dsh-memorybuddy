/**
 * The model stage: turn collected candidates into memory entries (P5).
 *
 * This runs *after* the deterministic stage, never instead of it. The
 * deterministic half already guarantees nothing is lost — every candidate it
 * saw is on disk before this file is even loaded. The model's job is the part
 * a regex cannot do: rephrase a rambling sentence into a fact, notice that
 * three separate lines are one preference, and say so in one entry.
 *
 * Four rules, each of which exists because breaking it was a real bug:
 *
 * 1. **The model returns a diff, never a document.** It cannot rewrite
 *    `memory/habits.md`; it can only propose operations. A model that returns
 *    prose, or a whole file, is rejected wholesale (memory-plan §6.1.1).
 * 2. **Every update must quote the entry it updates, verbatim.** An `id` alone
 *    proves nothing about whether the model actually read the entry; a verbatim
 *    anchor does. A mismatch drops that one operation, not the pass.
 * 3. **A pinned entry is untouchable.** The user edited it by hand, so no
 *    automatic stage may rephrase it — the anchor check passes, and then the
 *    operation is refused anyway.
 * 4. **The whole stage has one budget, not one per route.** Five routes at 45 s
 *    each would outlive the browser's own 15 s request timeout and leave
 *    `Consolidator.running` stuck true, so every later trigger would be
 *    rejected as "上一次整理还在进行中".
 *
 * Nothing in this file throws out of the stage: every failure becomes a
 * `skippedReason` on the outcome, because a broken model route must never cost
 * the user a consolidation pass.
 */

import {
  MAX_INPUT_BYTES,
  TOPICS,
  type DistillOperation,
  type DistillProposal,
  type FailureKind,
  type TopicKey,
} from '../protocol.ts'
import { similarity, type Entry } from './entries.ts'
import type { Candidate } from './consolidate.ts'
import {
  classifyFailure,
  routeKey,
  type LlmCallConfigLike,
  type LlmLike,
  type ModelRoute,
  type PreparedCallLike,
} from './model-picker.ts'

/** One call may not exceed this (memorybuddy-plan §4.2). */
export const CALL_TIMEOUT_MS = 45_000
/** The whole stage may not exceed this (§4.4 rule 0). */
export const TOTAL_BUDGET_MS = 60_000
/** How many routes one pass may try before giving up (§4.4 rule 0). */
export const MAX_ATTEMPTS = 2
/** Sampling controls: the task is extraction, not writing. */
const TEMPERATURE = 0
const MAX_OUTPUT_TOKENS = 2048

/** Where a failed route's cooldown goes. The consolidator owns the store. */
export interface CooldownSink {
  record: (provider: string, model: string, kind: FailureKind) => Promise<void>
  clear: (provider: string, model: string) => Promise<void>
}

/** What one pass of the model stage did. */
export interface DistillOutcome {
  /** Operations that survived validation, in the order the model returned them. */
  proposals: DistillProposal[]
  /** Why individual operations were dropped — surfaced in the journal. */
  rejected: string[]
  /** Total tokens the winning call reported, when it reported any. */
  tokens: number
  /** `provider/model` that produced the diff. */
  used?: string
  /** The user's own choice, when the chain had to take over from it. */
  fellBackFrom?: string
  /** Set when the stage did not run at all. */
  skippedReason?: string
  /** Routes that were tried and failed, for the journal. */
  failures: string[]
}

/** The system prompt. It has to be blunt: a chatty model is an unusable one. */
const SYSTEM_PROMPT = [
  '你是长期记忆整理器。你只输出 JSON，不输出任何解释、前言或 Markdown 代码块。',
  '输入会给你：若干条「候选」（从会话里摘出来的原话）与当前已存在的记忆条目（带 id）。',
  '你的任务是把候选整理成条目，规则：',
  '1. 只输出 JSON 对象，形如 {"ops":[{"op":"add","topic":"habits","text":"..."}]}。',
  '2. op 只能是 "add" 或 "update"。',
  '3. "add" 用于新事实，必须给 topic（background / habits / environment / preferences-learned）与 text。',
  '4. "update" 用于修订已有条目，必须给 id、anchor 与 text。anchor 必须与已有条目文本**逐字相同**，否则该条作废。',
  '5. text 用第三人称陈述句，一句话说完，不要序号、不要引号、不要「用户说」。',
  '6. 不要臆测：候选里没有的信息一律不要写。宁可少写。',
  '7. 候选里的密钥、口令、身份证、银行卡、手机号一律不要写进 text。',
  '8. 如果候选都是琐碎内容、没有任何值得长期记住的事实，输出 {"ops":[]}。',
].join('\n')

/** The subset of `PreparedLlmCall` this module uses. */
type PreparedLike = PreparedCallLike

/**
 * Dispatch one one-shot call on the registration-bound path.
 *
 * `prepareCall(config).stream(request)` is what the official agent loop uses.
 * The public `llm.stream(options)` is an ordinary instance property a provider
 * plugin may legitimately overwrite with the waterfall signature
 * `(options, next)` — calling it then raises
 * `TypeError: next(...) is not a function or its return value is not async iterable`.
 * The public method stays as the fallback for a runtime that has no
 * `prepareCall` at all, so an older or proxied service keeps working.
 */
async function openStream(
  llm: LlmLike,
  config: LlmCallConfigLike,
  request: { messages: unknown[]; system: string; signal: AbortSignal },
): Promise<AsyncIterable<unknown>> {
  if (typeof llm.prepareCall === 'function') {
    const handle = (await llm.prepareCall(config, request.signal)) as PreparedLike
    // The stream request must equal the handle's RESOLVED config, not the
    // input one: `prepareCall` materializes defaults (e.g. the model's
    // `reasoning.defaultEffort` when no effort was requested, `maxTokens`
    // from `defaultMaxTokens`), and the dispatch compares the request against
    // that resolved config field-for-field. Spreading the input config
    // reproduces "prepared LLM call config changed before adapter dispatch" —
    // the real shadow failure of 2026-10-16, twice over: first for the missing
    // fields, then again for the input-vs-resolved `reasoningEffort` mismatch.
    return handle.stream({
      ...handle.config,
      messages: request.messages,
      system: request.system,
      signal: request.signal,
    })
  }
  if (typeof llm.stream === 'function') {
    return llm.stream({ ...config, messages: request.messages, system: request.system, signal: request.signal })
  }
  throw new Error('llm 服务不支持流式调用')
}

/**
 * Race one awaited stage step against the pass's total budget.
 *
 * The abort timer only helps when the adapter honours the signal — and a
 * provider plugin that never settles on `prepareCall` (or on `stream()`) hangs
 * the entire consolidation pass, because `collect` is a `for await` that never
 * yields. The budget check BETWEEN routes cannot catch that: the loop only
 * reaches it once the awaited step returns. So every awaited step is raced
 * against a hard deadline, and losing the race is reported as a budget abort.
 *
 * This is why the total budget is 60 s while a single call may run for 45 s:
 * the first route can consume the whole budget, and the second never starts.
 */
async function withBudget<T>(step: () => Promise<T>, ms: number): Promise<{ value: T } | { budget: true }> {
  if (ms <= 0) return { budget: true }
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      step().then(value => ({ value })),
      new Promise<{ budget: true }>(resolve => {
        // Deliberately NOT `unref`ed. An unref'd timer does not keep the event
        // loop alive, so a host whose loop is otherwise idle — and every CLI
        // verifier, which has nothing else pending — exits before the budget
        // ever fires and the pass is abandoned mid-flight instead of being
        // reported as a budget abort. Both outcomes kill the timer in `finally`,
        // so it never outlives the step it guards.
        timer = setTimeout(() => resolve({ budget: true }), ms)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/** Collect a stream's text and token usage. Throws on an error finish. */
async function collect(stream: AsyncIterable<unknown>): Promise<{ text: string; tokens: number }> {
  let text = ''
  let tokens = 0
  for await (const raw of stream) {    const chunk = raw as {
      type?: string
      text?: string
      usage?: { totalTokens?: number; inputTokens?: number; outputTokens?: number }
      reason?: { kind?: string; failure?: unknown }
    }
    if (chunk.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
    if (chunk.type === 'usage' && chunk.usage !== undefined) {
      const usage = chunk.usage
      tokens =
        typeof usage.totalTokens === 'number' ? usage.totalTokens : (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0)
    }
    if (chunk.type === 'finish') {
      const kind = chunk.reason?.kind
      if (kind === 'error' || kind === 'aborted') {
        // The runtime turns adapter and dispatch failures into a terminal finish
        // chunk rather than a throw, so this is where a bad route surfaces.
        const failure = chunk.reason?.failure
        const message =
          typeof failure === 'object' && failure !== null ? JSON.stringify(failure).slice(0, 300) : String(kind)
        throw new Error(`模型调用失败：${message}`)
      }
    }
  }
  return { text, tokens }
}

/**
 * Build the user message: the candidates plus a compact digest of what is
 * already known.
 *
 * Only candidates and entry digests travel — never raw dialogue. A session
 * note's `## 做了什么` section stays on disk; the model sees the `(候选 · …)`
 * lines the collector already filtered for meaning (memorybuddy-plan §4.8
 * P5-14).
 */
export function buildInput(
  candidates: readonly Candidate[],
  entriesByTopic: Map<TopicKey, Entry[]>,
): { messages: { role: 'user'; content: readonly { type: 'text'; text: string }[] }[]; bytes: number; truncated: boolean } {
  const lines: string[] = ['# 候选']
  if (candidates.length === 0) lines.push('（无）')
  for (const candidate of candidates) {
    lines.push(`- (${candidate.topic ?? 'habits'}) ${candidate.text}`)
  }
  lines.push('', '# 已有条目')
  let any = false
  for (const topic of TOPICS) {
    const entries = entriesByTopic.get(topic.key) ?? []
    if (entries.length === 0) continue
    lines.push(`## ${topic.title}`)
    for (const entry of entries) {
      any = true
      lines.push(`- [${entry.id}] (${entry.confidence} · ${entry.days} 天) ${entry.text}`)
    }
  }
  if (!any) lines.push('（无）')

  let body = lines.join('\n')
  let truncated = false
  if (Buffer.byteLength(body, 'utf8') > MAX_INPUT_BYTES) {
    // Cut on line boundaries and keep the header, so the model still knows what
    // it is looking at even when the digest did not fit.
    const kept: string[] = []
    let bytes = 0
    for (const line of lines) {
      const size = Buffer.byteLength(`${line}\n`, 'utf8')
      if (bytes + size > MAX_INPUT_BYTES) break
      kept.push(line)
      bytes += size
    }
    body = kept.join('\n')
    truncated = true
  }
  // Adapter contract (dsh-llm-deepseek serialize / prepareImages): message
  // content MUST be an array of typed blocks (`content.some(...)` walks it) —
  // a plain string reaches the adapter and dies with
  // `content.some is not a function` (code UNKNOWN).
  const messages = [{ role: 'user' as const, content: [{ type: 'text' as const, text: body }] }]
  return { messages, bytes: Buffer.byteLength(body, 'utf8'), truncated }
}

/** Strip a Markdown fence and isolate the outermost JSON object. */
function isolateJson(raw: string): string | undefined {
  const trimmed = raw.trim()
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)
  const body = fenced !== null ? fenced[1].trim() : trimmed
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) return undefined
  return body.slice(start, end + 1)
}

/** Parse and shape-check the model's diff. Returns `undefined` when unusable. */
export function parseOperations(raw: string): DistillOperation[] | undefined {
  const json = isolateJson(raw)
  if (json === undefined) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const ops = (parsed as { ops?: unknown }).ops
  if (!Array.isArray(ops)) return undefined
  const result: DistillOperation[] = []
  for (const item of ops) {
    if (typeof item !== 'object' || item === null) continue
    const record = item as Record<string, unknown>
    const op = record.op
    const text = typeof record.text === 'string' ? record.text.trim() : ''
    if (text === '') continue
    if (op === 'add') {
      const topic = typeof record.topic === 'string' ? record.topic : ''
      const known = TOPICS.find(entry => entry.key === topic)
      if (known === undefined) continue
      result.push({ op: 'add', topic: known.key, text })
      continue
    }
    if (op === 'update') {
      const id = typeof record.id === 'string' ? record.id.trim() : ''
      const anchor = typeof record.anchor === 'string' ? record.anchor.trim() : ''
      if (id === '' || anchor === '') continue
      result.push({ op: 'update', id, anchor, text })
    }
  }
  return result
}

/**
 * Validate the model's diff against the entries it claims to be editing.
 *
 * The verbatim anchor is the whole point: a model that never read the entry
 * cannot reproduce it, so a mismatch is a hallucination and the operation is
 * dropped. The pass continues — one bad operation is not a bad pass.
 */
export function validate(
  operations: readonly DistillOperation[],
  entriesByTopic: Map<TopicKey, Entry[]>,
): { proposals: DistillProposal[]; rejected: string[] } {
  const byId = new Map<string, { entry: Entry; topic: TopicKey }>()
  for (const [topic, entries] of entriesByTopic) {
    for (const entry of entries) byId.set(entry.id, { entry, topic })
  }
  const proposals: DistillProposal[] = []
  const rejected: string[] = []
  const seen = new Set<string>()

  for (const operation of operations) {
    const text = operation.text.trim()
    if (text === '') continue
    if (operation.op === 'add') {
      const topic = operation.topic ?? 'habits'
      const key = `${topic}:${text}`
      if (seen.has(key)) continue
      seen.add(key)
      proposals.push({ op: 'add', topic, text })
      continue
    }
    const found = byId.get(operation.id)
    if (found === undefined) {
      rejected.push(`模型引用了不存在的条目 ${operation.id}`)
      continue
    }
    if (found.entry.pinned) {
      // The user edited this by hand; the anchor matched, and it is still off
      // limits (memorybuddy-plan §4.8 P5-13).
      rejected.push(`条目 ${operation.id} 已被手工固定，模型改写被忽略`)
      continue
    }
    if (found.entry.text.trim() !== operation.anchor.trim()) {
      rejected.push(`模型对条目 ${operation.id} 的逐字锚点不匹配，该条改写被忽略`)
      continue
    }
    // A "rewrite" that changes nothing is not worth a write.
    if (similarity(found.entry.text, text) >= 0.99) continue
    const key = `${found.topic}:${text}`
    if (seen.has(key)) continue
    seen.add(key)
    proposals.push({ op: 'update', id: operation.id, anchor: operation.anchor, topic: found.topic, text })
  }
  return { proposals, rejected }
}

/** What the distiller needs from the plugin. */
export interface DistillHost {
  log: (message: string) => void
  cooldown: CooldownSink
  /**
   * Resolve the routes to try, right now.
   *
   * It is a callback rather than a constructor argument because both halves
   * change between passes: `ctx.get('llm')` may appear or vanish as plugins load,
   * and the chain depends on the cooldown table the previous pass just wrote.
   */
  routes: () => Promise<{ llm: LlmLike | undefined; chain: readonly ModelRoute[]; skippedReason?: string }>
}

/**
 * Run the model stage once.
 *
 * The caller has already built the candidate list and the entry map, and has
 * already applied the deterministic stage — so a failure here costs the model's
 * refinement and nothing else.
 */
export class Distiller {
  private readonly host: DistillHost

  constructor(host: DistillHost) {
    this.host = host
  }

  /**
   * Try the candidate chain until one route produces a usable diff.
   *
   * `llm` being absent is a normal state (headless profiles, a stripped
   * composition), not an error: the stage reports why it was skipped and the
   * deterministic result stands.
   */
  async run(input: {
    candidates: readonly Candidate[]
    entriesByTopic: Map<TopicKey, Entry[]>
  }): Promise<DistillOutcome> {
    const outcome: DistillOutcome = { proposals: [], rejected: [], tokens: 0, failures: [] }
    let resolved: { llm: LlmLike | undefined; chain: readonly ModelRoute[]; skippedReason?: string }
    try {
      resolved = await this.host.routes()
    } catch (error) {
      outcome.skippedReason = `无法解析候选模型：${String(error)}`
      return outcome
    }
    if (resolved.skippedReason !== undefined) {
      outcome.skippedReason = resolved.skippedReason
      return outcome
    }
    if (resolved.llm === undefined) {
      outcome.skippedReason = '当前环境没有 llm 服务'
      return outcome
    }
    if (resolved.chain.length === 0) {
      outcome.skippedReason = '没有可用的模型'
      return outcome
    }

    const built = buildInput(input.candidates, input.entriesByTopic)
    const started = Date.now()
    const choice = resolved.chain[0]?.source === 'choice' ? resolved.chain[0] : undefined
    // The routes to actually try. It starts as the chain, but an effort refusal
    // inserts a RETRY of the same route with the effort dropped, so the next
    // iteration of the loop re-runs the model rather than moving on to a
    // different one. `prepareCall` rejects an unsupported effort outright — no
    // clamping, no aliasing — and a 24 h `missing` cooldown would take a
    // perfectly good model out of the chain for a whole day over a pick the
    // panel could not have known was wrong.
    const pending: ModelRoute[] = [...resolved.chain.slice(0, MAX_ATTEMPTS)]
    let attempted = 0

    while (pending.length > 0 && attempted < MAX_ATTEMPTS) {
      const route = pending.shift()
      if (route === undefined) break
      attempted += 1
      const remaining = TOTAL_BUDGET_MS - (Date.now() - started)
      if (remaining <= 0) {
        outcome.skippedReason = '模型提炼超出总预算，本轮放弃'
        return outcome
      }
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), Math.min(CALL_TIMEOUT_MS, remaining))
      timer.unref?.()
      const routeName = `${route.provider}/${route.model}`
      try {
        const config: LlmCallConfigLike = {
          provider: route.provider,
          model: route.model,
          temperature: TEMPERATURE,
          maxTokens: MAX_OUTPUT_TOKENS,
        }
        if (route.effort !== undefined && route.effort !== '') config.reasoningEffort = route.effort
        // One race for the whole step — dispatch AND collection — because a
        // stream that never settles is the same bug as a `prepareCall` that
        // never resolves, and the budget check between routes cannot see either.
        const raced = await withBudget(
          async () => {
            const stream = await openStream(resolved.llm as LlmLike, config, {
              messages: built.messages,
              system: SYSTEM_PROMPT,
              signal: controller.signal,
            })
            return collect(stream)
          },
          Math.min(CALL_TIMEOUT_MS, remaining),
        )
        if ('budget' in raced) {
          outcome.skippedReason = '模型提炼超出总预算，本轮放弃'
          this.host.log(`模型 ${routeName} 调用超出总预算，本轮放弃`)
          return outcome
        }
        const collected = raced.value
        const operations = parseOperations(collected.text)
        if (operations === undefined) {
          outcome.failures.push(`${routeName}：输出不是可解析的 JSON diff`)
          this.host.log(`模型 ${routeName} 的输出不是可解析的 JSON diff，已换下一个候选`)
          await this.host.cooldown.record(route.provider, route.model, 'unknown')
          continue
        }
        const checked = validate(operations, input.entriesByTopic)
        outcome.proposals = checked.proposals
        outcome.rejected = checked.rejected
        outcome.tokens = collected.tokens
        outcome.used = routeName
        // "Fell back" means the FIRST route in the chain did not work. The
        // comparison is on the route key, not object identity: the retry path
        // spreads the route into a new object, so `route !== choice` would be
        // true even when the model that eventually ran IS the user's pick.
        const firstKey = `${choice?.provider ?? ''}/${choice?.model ?? ''}`
        if (choice !== undefined && routeKey(route.provider, route.model) !== firstKey) {
          outcome.fellBackFrom = firstKey
        }
        await this.host.cooldown.clear(route.provider, route.model)
        return outcome
      } catch (error) {
        const kind = classifyFailure(error)
        // A refused effort is the panel's guess being wrong, not the model's
        // fault: drop the effort and re-queue the SAME route for this pass,
        // instead of cooling the model off for a day.
        if (kind === 'missing' && route.effort !== undefined && route.effort !== '' && isEffortRefusal(error)) {
          this.host.log(`模型 ${routeName} 不支持档位 ${route.effort}，改用模型默认档位重试`)
          outcome.failures.push(`${routeName}：档位 ${route.effort} 不受支持，已改用默认档位`)
          pending.unshift({ ...route, effort: undefined })
          clearTimeout(timer)
          continue
        }
        outcome.failures.push(`${routeName}：${kind}`)
        this.host.log(`模型 ${routeName} 调用失败（${kind}）：${String(error)}`)
        await this.host.cooldown.record(route.provider, route.model, kind)
      } finally {
        clearTimeout(timer)
      }
    }

    outcome.skippedReason = `所有候选模型都失败了（最后一次：${outcome.failures[outcome.failures.length - 1] ?? '未知'}）`
    return outcome
  }
}

/**
 * True when a `missing`-classified failure is really an effort the model refused.
 *
 * The runtime's own codes are `UNSUPPORTED_REASONING_EFFORT` (the effort exists
 * on some model but not this one) and `INVALID_MODEL_REASONING` (the adapter
 * reported a malformed reasoning block). Adapters also word it in prose, which
 * is why the message is checked too.
 */
function isEffortRefusal(error: unknown): boolean {
  const code =
    typeof (error as { code?: unknown } | null)?.code === 'string' ? (error as { code: string }).code : ''
  if (code === 'UNSUPPORTED_REASONING_EFFORT' || code === 'INVALID_MODEL_REASONING') return true
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return /unsupported reasoning|invalid model reasoning|unknown reasoning effort|reasoning effort/i.test(text)
}
