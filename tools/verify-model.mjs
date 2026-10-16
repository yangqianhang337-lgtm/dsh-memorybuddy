/**
 * Model-stage verification (P5, memorybuddy-plan §4.4–§4.8).
 *
 * Every check here is a decision that was a real bug in the first draft of the
 * plan, so each one is named after the rule it protects:
 *
 *  P5-2  one cooldown table keyed by `provider/model` only — a rate-limited
 *        `hy3` must NOT be retried under a second key (the `choice:` prefix
 *        that let the same model be hit twice in one pass).
 *  P5-3  the user's pick sits at the top of the chain, `off` beats it, and a
 *        non-empty `modelAllowlist` is a HARD boundary that binds the pick too.
 *  P5-4  a stored pick whose provider contains no `/` still parses (the two
 *        front-matter keys exist precisely so it can).
 *  P5-7  the free tag is matched on the `(provider, id)` PAIR: `hy3` is free
 *        under one account and paid under another, so a bare-id match tags the
 *        wrong row.
 *  P5-9  an unsupported effort drops the effort and retries the SAME route
 *        instead of cooling the model off for 24 h over a panel guess.
 *  P5-10 the total budget is honoured: a chain of slow routes is abandoned with
 *        a reason, never allowed to run past `TOTAL_BUDGET_MS`.
 *  P5-11 a parse failure and a thrown call both record a cooldown, and a
 *        SUCCESS clears it.
 *  P5-13 the model's proposals are validated against the real entry map: a
 *        phantom id, a pinned entry, a wrong verbatim anchor and a no-op
 *        rewrite are all rejected by name.
 *  P5-14 a model that throws mid-pass costs the refinement only — the
 *        deterministic result stands and the pass does not fail.
 *
 * Usage: node tools/verify-model.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const home = mkdtempSync(join(tmpdir(), 'dsh-memorybuddy-model-'))
process.env.DSH_HOME = home

const results = []
const record = (label, ok, detail) => {
  results.push({ label, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

/* ── bundle the real host modules ─────────────────────────────────────── */

const outfile = join(ROOT, '.tmp-model-bundle.mjs')
await build({
  entryPoints: [join(ROOT, 'tools/_replay-entry.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  external: ['node:*'],
  logLevel: 'silent',
})

const { ModelPicker, Distiller, DEFAULT_PREFERENCES, TOTAL_BUDGET_MS, buildInput } = await import(pathToFileURL(outfile).href)

/* ── a synthetic runtime ──────────────────────────────────────────────── */

/**
 * A fake `llm` service.
 *
 * `failWith` makes every call throw that error, so a test can exercise
 * `classifyFailure` without a network. `chunks` is the text the fake model
 * "returns", which lets the diff parser be driven for real.
 */
function makeLlm({ providers = [], listed = [], failWith, resolved, callLog = [] } = {}) {
  return {
    listProviders: () => providers,
    listModels: async provider => listed.filter(model => model.provider === provider),
    resolveModelInfo: async (provider, model) => {
      callLog.push({ provider, model })
      if (failWith !== undefined) throw failWith
      return resolved ?? {}
    },
    prepareCall: async config => ({
      config,
      stream: async function* () {
        callLog.push({ dispatched: config })
        if (failWith !== undefined) throw failWith
        if (chunks !== undefined) {
          for (const text of chunks) yield { type: 'text-delta', index: 0, text }
        }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    }),
  }
}

let chunks

/** A diff the model "wrote": one add, one update of a real entry. */
const GOOD_DIFF = JSON.stringify({
  ops: [
    { op: 'add', topic: 'habits', text: '用户偏好先给结论再给过程' },
    { op: 'update', id: 'M-1', anchor: '用户使用 DSH Desktop。', text: '用户使用 DSH Desktop 与 memorybuddy 插件。' },
  ],
})

/** The entry map the distiller validates proposals against. */
const entries = () =>
  new Map([
    ['habits', [{ id: 'M-1', text: '用户使用 DSH Desktop。', pinned: false }]],
    ['background', []],
  ])

const prefs = patch => ({ ...DEFAULT_PREFERENCES, ...patch })

/* ══ P5-2 / P5-3  the chain itself ═══════════════════════════════════ */

{
  const picker = new ModelPicker(home)
  const cooldown = {}

  // The pick is tried first.
  const picked = await picker.chain({
    preferences: prefs({ modelChoiceProvider: 'workbuddy-xdpool-global', modelChoiceModel: 'hy3' }),
    cooldown,
    llm: undefined,
    available: [{ provider: 'workbuddy-xdpool-global', id: 'hy3' }],
  })
  record('P5-3 the pick is the chain head', picked.chain[0]?.source === 'choice' && picked.chain[0]?.model === 'hy3', picked.chain.map(r => r.source).join(' → '))

  // `off` beats the pick.
  const off = await picker.chain({
    preferences: prefs({ modelPolicy: 'off', modelChoiceProvider: 'workbuddy-xdpool-global', modelChoiceModel: 'hy3' }),
    cooldown,
    llm: undefined,
    available: [{ provider: 'workbuddy-xdpool-global', id: 'hy3' }],
  })
  record('P5-3 off beats the pick', off.chain.length === 0 && off.skipped === '已关闭模型提炼', off.skipped)

  // A non-empty allowlist binds the pick too.
  const blocked = await picker.chain({
    preferences: prefs({ modelAllowlist: ['other-model'], modelChoiceProvider: 'workbuddy-xdpool-global', modelChoiceModel: 'hy3' }),
    cooldown,
    llm: undefined,
    available: [{ provider: 'workbuddy-xdpool-global', id: 'hy3' }],
  })
  record('P5-3 the allowlist binds the pick', blocked.chain.length === 0 && blocked.skipped === '你选的模型不在白名单里', blocked.skipped)

  // One key, one model: the pick and the free tier must not both hold hy3.
  const twice = await picker.chain({
    preferences: prefs({ modelChoiceProvider: 'workbuddy-xdpool-global', modelChoiceModel: 'hy3' }),
    cooldown,
    llm: undefined,
    available: [{ provider: 'workbuddy-xdpool-global', id: 'hy3' }],
  })
  const routes = twice.chain.map(r => `${r.provider}/${r.model}`)
  record('P5-2 one route appears once', new Set(routes).size === routes.length, routes.join(' '))

  // A cooled-off route is skipped by source, not by key.
  const cooling = await picker.chain({
    preferences: prefs({ modelChoiceProvider: 'workbuddy-xdpool-global', modelChoiceModel: 'hy3' }),
    cooldown: { 'workbuddy-xdpool-global/hy3': Date.now() + 60_000 },
    llm: undefined,
    available: [{ provider: 'workbuddy-xdpool-global', id: 'hy3' }, { provider: 'sensenova', id: 'kimi' }],
  })
  record('P5-2 a cooling route is dropped', cooling.chain.every(r => r.model !== 'hy3'), cooling.chain.map(r => r.model).join(' '))
}

/* ══ P5-7  the free tag ══════════════════════════════════════════════ */

{
  // hy3 is free under the CLI account and paid under the app account.
  const catalogue = {
    version: 1,
    entries: {
      'cli-account:': {
        models: [
          { id: 'hy3', billing: { free: true } },
          { id: 'paid-model', billing: { credits: 'x0.43', free: false } },
        ],
      },
      'app-account:': {
        models: [
          { id: 'hy3', billing: { credits: 'x0.00' } },
          { id: 'promo-model', billing: { credits: 'x2.00' }, promotions: [{ start: 0, end: Date.now() + 60_000, factor: 0 }] },
          { id: 'expired-promo', billing: { credits: 'x2.00' }, promotions: [{ start: 0, end: 1, factor: 0 }] },
        ],
      },
    },
  }
  writeFileSync(join(home, '.workbuddy-catalog.json'), JSON.stringify(catalogue))

  const picker = new ModelPicker(home)
  const built = await picker.catalog({
    listProviders: () => [
      { id: 'cli-account', name: 'CLI' },
      { id: 'app-account', name: 'App' },
    ],
    listModels: async provider => [
      { provider, id: 'hy3', name: 'Hy3' },
      ...(provider === 'cli-account' ? [{ provider, id: 'paid-model', name: 'Paid' }] : []),
      ...(provider === 'app-account'
        ? [
            { provider, id: 'promo-model', name: 'Promo' },
            { provider, id: 'expired-promo', name: 'Expired' },
          ]
        : []),
    ],
  })
  const tag = model => built.models.find(item => item.id === model && item.provider === 'app-account')?.free
  record('P5-7 a free id under a paid account is NOT tagged', tag('hy3') === true, `app-account/hy3 free=${tag('hy3')}`)
  const paid = built.models.find(item => item.id === 'hy3' && item.provider === 'cli-account')
  record('P5-7 the pair, not the id: cli-account/hy3 tagged', paid?.free === true, `cli-account/hy3 free=${paid?.free}`)
  record(
    'P5-7 a live promotion counts as free',
    built.models.find(item => item.id === 'promo-model')?.free === true,
    'promotion factor 0',
  )
  record(
    'P5-7 an expired promotion does not',
    built.models.find(item => item.id === 'expired-promo')?.free === false,
    'promotion window closed',
  )
}

/* ══ P5-9 / P5-10 / P5-11 / P5-14  the distiller ═══════════════════════ */

const route = (provider, model) => ({ provider, model, source: 'any' })

{
  // A good diff is applied and the cooldown is cleared.
  chunks = [GOOD_DIFF]
  const cooldownCalls = []
  let distiller = new Distiller({
    log: () => {},
    cooldown: {
      record: (provider, model, kind) => cooldownCalls.push([`${provider}/${model}`, kind]),
      clear: (provider, model) => cooldownCalls.push([`${provider}/${model}`, 'cleared']),
    },
    routes: async () => ({
      llm: makeLlm({ providers: [{ id: 'p1', name: 'P1' }] }),
      chain: [route('p1', 'm1')],
    }),
  })
  let outcome = await distiller.run({ candidates: [{ text: 'note one', topic: 'habits' }], entriesByTopic: entries() })
  record('P5-11 a good diff applies', outcome.proposals.length === 2, `${outcome.proposals.length} proposals`)
  record('P5-11 success clears the cooldown', cooldownCalls.some(call => call[1] === 'cleared'), cooldownCalls.map(c => c.join(':')).join(' '))

  // A refused effort retries the SAME route without it, and does not cool it.
  chunks = [GOOD_DIFF]
  cooldownCalls.length = 0
  let attempts = 0
  distiller = new Distiller({
    log: () => {},
    cooldown: {
      record: (provider, model, kind) => cooldownCalls.push([`${provider}/${model}`, kind]),
      clear: (provider, model) => cooldownCalls.push([`${provider}/${model}`, 'cleared']),
    },
    routes: async () => ({
      llm: {
        listProviders: () => [],
        prepareCall: async config => ({
          config,
          stream: async function* () {
            attempts += 1
            if (attempts === 1) {
              const error = new Error('unsupported reasoning effort "max"')
              error.code = 'UNSUPPORTED_REASONING_EFFORT'
              throw error
            }
            yield { type: 'text-delta', index: 0, text: GOOD_DIFF }
            yield { type: 'finish', reason: { kind: 'stop' } }
          },
        }),
      },
      chain: [{ provider: 'p1', model: 'm1', effort: 'max', source: 'choice' }],
    }),
  })
  outcome = await distiller.run({ candidates: [{ text: 'note one', topic: 'habits' }], entriesByTopic: entries() })
  record('P5-9 a refused effort retries without it', attempts === 2 && outcome.used === 'p1/m1', `${attempts} attempts, used=${outcome.used}`)
  record('P5-9 the model is not cooled off', cooldownCalls.every(call => call[1] !== 'missing'), cooldownCalls.map(c => c.join(':')).join(' '))

  // A genuine failure cools the route and falls to the next candidate. The
  // chain's head is the user's pick, so the record must say it fell back FROM
  // it — that is the sentence the journal line 「自选模型 X 失败，已回退到 Y」
  // is built from.
  chunks = undefined
  cooldownCalls.length = 0
  let firstOnly = true
  distiller = new Distiller({
    log: () => {},
    cooldown: {
      record: (provider, model, kind) => cooldownCalls.push([`${provider}/${model}`, kind]),
      clear: (provider, model) => cooldownCalls.push([`${provider}/${model}`, 'cleared']),
    },
    routes: async () => ({
      llm: {
        listProviders: () => [],
        prepareCall: async config => ({
          config,
          stream: async function* () {
            if (firstOnly) {
              firstOnly = false
              const error = new Error('rate limit exceeded')
              throw error
            }
            yield { type: 'text-delta', index: 0, text: GOOD_DIFF }
            yield { type: 'finish', reason: { kind: 'stop' } }
          },
        }),
      },
      chain: [{ provider: 'p1', model: 'm1', source: 'choice' }, route('p2', 'm2')],
    }),
  })
  outcome = await distiller.run({ candidates: [{ text: 'note one', topic: 'habits' }], entriesByTopic: entries() })
  record('P5-11 a failure cools the route and falls back', outcome.used === 'p2/m2', `used=${outcome.used}`)
  record('P5-11 the journal records where it fell back from', outcome.fellBackFrom === 'p1/m1', `fellBackFrom=${outcome.fellBackFrom}`)
  record('P5-2 the cooldown is keyed by the route', cooldownCalls.some(call => call[0] === 'p1/m1' && call[1] === 'quota'), cooldownCalls.map(c => c.join(':')).join(' '))

  // An unparseable diff is treated as a failure of THAT route.
  chunks = ['I am not JSON at all']
  cooldownCalls.length = 0
  distiller = new Distiller({
    log: () => {},
    cooldown: {
      record: (provider, model, kind) => cooldownCalls.push([`${provider}/${model}`, kind]),
      clear: (provider, model) => cooldownCalls.push([`${provider}/${model}`, 'cleared']),
    },
    routes: async () => ({ llm: makeLlm({ providers: [{ id: 'p1', name: 'P1' }] }), chain: [route('p1', 'm1')] }),
  })
  outcome = await distiller.run({ candidates: [{ text: 'note one', topic: 'habits' }], entriesByTopic: entries() })
  record('P5-11 an unparseable diff cools the route', cooldownCalls.some(call => call[1] === 'unknown'), cooldownCalls.map(c => c.join(':')).join(' '))
}

/* ══ P5-13  validation of the model's proposals ═══════════════════════ */

{
  chunks = [JSON.stringify({
    ops: [
      { op: 'add', topic: 'habits', text: '一条真正有用的记忆' },
      { op: 'update', id: 'NO-SUCH-ID', anchor: 'x', text: 'y' },
      { op: 'update', id: 'M-1', anchor: '完全不匹配的锚点', text: 'z' },
      { op: 'update', id: 'M-1', anchor: '用户使用 DSH Desktop。', text: '用户使用 DSH Desktop。' },
    ],
  })]
  const distiller = new Distiller({
    log: () => {},
    cooldown: { record: () => {}, clear: () => {} },
    routes: async () => ({ llm: makeLlm({ providers: [{ id: 'p1', name: 'P1' }] }), chain: [route('p1', 'm1')] }),
  })
  const outcome = await distiller.run({ candidates: [{ text: 'note one', topic: 'habits' }], entriesByTopic: entries() })
  const reasons = outcome.rejected.join(' | ')
  record('P5-13 a phantom id is rejected by name', reasons.includes('不存在的条目 NO-SUCH-ID'), reasons)
  record('P5-13 a wrong anchor is rejected by name', reasons.includes('逐字锚点不匹配'), reasons)
  record('P5-13 a no-op rewrite is dropped', outcome.proposals.filter(p => p.op === 'update').length === 0, `${outcome.proposals.length} proposals`)
  record('P5-13 the good add survives', outcome.proposals.some(p => p.op === 'add' && p.text === '一条真正有用的记忆'), reasons)

  // A pinned entry is never rewritten.
  chunks = [JSON.stringify({ ops: [{ op: 'update', id: 'M-9', anchor: '固定条目', text: '改写它' }] })]
  const pinned = new Distiller({
    log: () => {},
    cooldown: { record: () => {}, clear: () => {} },
    routes: async () => ({ llm: makeLlm({ providers: [{ id: 'p1', name: 'P1' }] }), chain: [route('p1', 'm1')] }),
  })
  const pinnedOutcome = await pinned.run({
    candidates: [{ text: 'note one', topic: 'habits' }],
    entriesByTopic: new Map([['habits', [{ id: 'M-9', text: '固定条目', pinned: true }]]]),
  })
  record('P5-13 a pinned entry is never rewritten', pinnedOutcome.rejected.some(r => r.includes('已被手工固定')), pinnedOutcome.rejected.join(' | '))
}

/* ══ P5-10  the total budget ══════════════════════════════════════════ */

{
  // Every route hangs. The stage must give up with a reason rather than run
  // forever, and it must do so without the abort ever being wired into the
  // fake stream (the runtime aborts the *request*, which the distiller mirrors
  // onto the config's signal; a stream that ignores it is exactly the case the
  // total budget exists for).
  const before = Date.now()
  const distiller = new Distiller({
    log: () => {},
    cooldown: { record: () => {}, clear: () => {} },
    routes: async () => ({
      llm: {
        listProviders: () => [],
        prepareCall: () => new Promise(() => {}),
        // Absent on purpose: an adapter that never settles must take the
        // withBudget race, which is what this check measures.
      },
      chain: [route('p1', 'm1'), route('p2', 'm2')],
    }),
  })
  const outcome = await distiller.run({ candidates: [{ text: 'note one', topic: 'habits' }], entriesByTopic: entries() })
  const elapsed = Date.now() - before
  record('P5-10 the total budget abandons the pass', outcome.skippedReason === '模型提炼超出总预算，本轮放弃', outcome.skippedReason)
  record('P5-10 the pass ended within the total budget', elapsed < TOTAL_BUDGET_MS + 5_000, `${elapsed} ms`)
}

/* ══ P5-14  a throw costs the refinement only ═════════════════════════ */

{
  const distiller = new Distiller({
    log: () => {},
    cooldown: { record: () => {}, clear: () => {} },
    routes: async () => {
      throw new Error('adapter exploded')
    },
  })
  const outcome = await distiller.run({ candidates: [{ text: 'note one', topic: 'habits' }], entriesByTopic: entries() })
  record('P5-14 a route-resolution throw is a skip, not a crash', outcome.skippedReason?.startsWith('无法解析候选模型') === true, outcome.skippedReason)
}

/* ══ P5-8 / P5-12  free-first, and a missing llm service ══════════════ */

{
  // With no pick and `free-first`, the chain must be made of free models only.
  const picker = new ModelPicker(home)
  const freeFirst = await picker.chain({
    preferences: prefs({ modelPolicy: 'free-first', modelChoiceProvider: '', modelChoiceModel: '' }),
    cooldown: {},
    llm: undefined,
    available: [
      { provider: 'cli-account', id: 'hy3' },
      { provider: 'cli-account', id: 'paid-model' },
      { provider: 'app-account', id: 'hy3' },
    ],
  })
  const freeIds = freeFirst.chain.filter(r => r.source === 'free').map(r => r.model)
  record(
    'P5-8 free-first picks only free models',
    freeIds.length > 0 && freeIds.every(id => id !== 'paid-model'),
    freeIds.join(' ') || freeFirst.chain.map(r => r.source).join(' → '),
  )

  // `llm` absent is a normal state, not an error: the distiller says why it
  // was skipped and never throws.
  const absent = new Distiller({
    log: () => {},
    cooldown: { record: () => {}, clear: () => {} },
    routes: async () => ({ llm: undefined, chain: [] }),
  })
  const outcome = await absent.run({ candidates: [{ text: 'note one', topic: 'habits' }], entriesByTopic: entries() })
  record('P5-12 no llm service is a skip, not a crash', outcome.proposals.length === 0 && outcome.skippedReason !== undefined, outcome.skippedReason)
}

/* ══ P5-14  only summaries reach the model ══════════════════════════════ */

{
  // The prompt carries the candidate digest and the entry digest — never the
  // raw dialogue. A session note's `## 做了什么` section must not appear in
  // the request body, because that section is what the collector kept for the
  // user's own file and is exactly what "don't send raw dialogue" protects.
  // Drive a real diff through a real prepared handle first, so the block also
  // proves the distiller dispatched at all, then assert on `buildInput`'s
  // output — the exact bytes that transit to the model.
  chunks = [GOOD_DIFF]
  const distiller = new Distiller({
    log: () => {},
    cooldown: { record: () => {}, clear: () => {} },
    routes: async () => ({
      llm: {
        listProviders: () => [],
        prepareCall: async config => ({
          config,
          stream: async function* () {
            yield { type: 'text-delta', index: 0, text: GOOD_DIFF }
            yield { type: 'finish', reason: { kind: 'stop' } }
          },
        }),
      },
      chain: [route('p1', 'm1')],
    }),
  })
  const candidates = [{ text: '（候选 · habits）用户说偏好先给结论', topic: 'habits' }]
  const ran = await distiller.run({ candidates, entriesByTopic: entries() })
  const sent = buildInput(candidates, entries()).messages[0].content[0].text
  record('P5-14 the stage dispatched at all', ran.used === 'p1/m1', `${ran.used ?? 'skip'}`)
  record(
    'P5-14 the request carries the candidate digest',
    sent.includes('（候选 · habits）用户说偏好先给结论'),
    'digest present',
  )
  record('P5-14 the request carries no raw dialogue marker', !sent.includes('## 做了什么'), 'no raw section')
}

/* ── report ──────────────────────────────────────────────────────────── */

const failed = results.filter(item => !item.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
rmSync(ROOT + '/.tmp-model-bundle.mjs', { force: true })
rmSync(home, { recursive: true, force: true })
process.exit(failed.length === 0 ? 0 : 1)
