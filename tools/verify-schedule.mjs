/**
 * Trigger-scheduler verification (P4, memory-plan §6.1).
 *
 * The scheduler is the one P4 change a smoke test cannot reach through the HTTP
 * routes: it fires on wall-clock timers, and the production delays are 90 s
 * (startup catch-up), 10 min (idle) and 15 s (session-end debounce). Waiting for
 * those in a test would make the suite unusable, so this verifier injects the
 * test seams the class exposes (`startupDelayMs` / `tickMs` /
 * `sessionEndDebounceMs` / `now`) and drives the real `ConsolidationScheduler`
 * against a real `MemoryStore` + `Consolidator` in a throwaway `DSH_HOME`.
 *
 * What it proves, one row per trigger:
 *
 * - 启动补齐 fires once after the delay, and ONLY in `startup-idle` mode.
 * - 空闲 fires after `consolidateIdleMinutes` without activity, and `touch()`
 *   pushes it back (an active session must not be consolidated mid-work).
 * - 会话结束 fires on `sessionEnded()` and debounces a burst into one pass.
 * - 固定时间 fires once the local clock passes `consolidateFixedTime`, once per
 *   day.
 * - The gate holds: no pending notes ⇒ no pass; `conversationMemory` off ⇒ no
 *   pass; a fresh `lastConsolidateAt` ⇒ no pass.
 * - `stop()` releases every timer (the hot-reload contract).
 *
 * Usage: node tools/verify-schedule.mjs
 */
import { mkdtempSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const home = mkdtempSync(join(tmpdir(), 'dsh-memorybuddy-schedule-'))
process.env.DSH_HOME = home

const results = []
const record = (label, ok, detail) => {
  results.push({ label, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/* ── bundle the real host modules ─────────────────────────────────────── */

const outfile = join(ROOT, '.tmp-schedule-bundle.mjs')
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

const { MemoryStore, Consolidator, ConsolidationScheduler, DEFAULT_PREFERENCES } = await import(
  pathToFileURL(outfile).href
)

const root = join(home, 'dsh-memorybuddy')
const memoryFile = relative => {
  try {
    return readFileSync(join(root, relative), 'utf8')
  } catch {
    return undefined
  }
}
const journalDays = () => {
  const dir = join(root, 'journal')
  return existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name) : []
}

const store = new MemoryStore()
await store.ensure()
const consolidator = new Consolidator(store, () => {})

/** Seed one pending session note so a pass has something to consume. */
async function seedPending(seq) {
  const day = new Date().toISOString().slice(0, 10)
  await store.writeSessionNote(
    day,
    `sched-${seq}`,
    { sessionId: `sched-${seq}`, workspace: 'D:\\dsh-memorybuddy', started: new Date().toISOString(), ended: new Date().toISOString(), turns: 1, events: 2, consolidated: false, title: `sched ${seq}`, updated: new Date().toISOString() },
    '## 做了什么\n\n- 记一下：我以后都用中文回复。\n\n## 观察到的工作习惯候选\n\n- (候选 · 明确偏好) 以后都用中文回复 · seq 1\n\n## 项目相关\n\n- D:\\dsh-memorybuddy：本会话的工作目录\n\n## 未决事项\n\n- （无）\n',
  )
  await store.patchState(state => ({
    ...state,
    processed: { ...state.processed, [`sessions/${day}/sched-${seq}.md`]: seq },
    pending: state.pending.includes(`sessions/${day}/sched-${seq}.md`)
      ? state.pending
      : [...state.pending, `sessions/${day}/sched-${seq}.md`],
  }))
}

/** Reset the watermark so the interval gate does not block a test. */
async function clearLastRun() {
  await store.patchState(state => ({ ...state, lastConsolidateAt: null }))
}

/** Build a scheduler with test timings and a preferences override. */
function makeScheduler(overrides = {}, timings = {}) {
  const preferences = { ...DEFAULT_PREFERENCES, ...overrides }
  const logs = []
  const runs = []
  const scheduler = new ConsolidationScheduler(
    {
      store,
      consolidator,
      preferences: () => preferences,
      log: message => logs.push(message),
      onRun: report => runs.push(report),
    },
    { startupDelayMs: 120, tickMs: 60, sessionEndDebounceMs: 80, ...timings },
  )
  return { scheduler, preferences, logs, runs }
}

/* ── 1. startup catch-up ──────────────────────────────────────────────── */

await clearLastRun()
await seedPending(1)
const startup = makeScheduler({ consolidateOn: 'startup-idle' })
startup.scheduler.start()
await sleep(400)
startup.scheduler.stop()
record(
  'P4-1 启动补齐 fires after the delay',
  startup.runs.length === 1,
  `${startup.runs.length} pass(es); logs ${JSON.stringify(startup.logs).slice(0, 160)}`,
)
record(
  'P4-1 the startup pass consumed the pending note',
  (await store.readState()).pending.length === 0,
  `pending ${JSON.stringify((await store.readState()).pending)}`,
)
record(
  'P4-1 the startup pass wrote a journal entry',
  journalDays().length > 0,
  JSON.stringify(journalDays()),
)

/* ── 2. the startup catch-up belongs to startup-idle only ─────────────── */

await clearLastRun()
await seedPending(2)
const idleOnly = makeScheduler({ consolidateOn: 'idle', consolidateIdleMinutes: 60 })
idleOnly.scheduler.start()
await sleep(300)
idleOnly.scheduler.stop()
record(
  'P4-3 `idle` mode does NOT inherit the startup catch-up',
  idleOnly.runs.length === 0,
  `${idleOnly.runs.length} pass(es)`,
)

/* ── 3. idle trigger + touch() pushing it back ────────────────────────── */

await clearLastRun()
await seedPending(3)
// The idle window is a minute wide, so the test owns the clock: `touch()` is
// followed by a jump forward, which is the same arithmetic the real timer does
// and takes milliseconds instead of a minute.
let clock = Date.now()
const idle = makeScheduler(
  { consolidateOn: 'idle', consolidateIdleMinutes: 1 },
  { tickMs: 50, now: () => clock },
)
idle.scheduler.start()
// Keep the session "active": every touch resets the window.
let activeRuns = 0
for (let i = 0; i < 4; i += 1) {
  idle.scheduler.touch()
  clock += 20_000
  await sleep(120)
  activeRuns = idle.runs.length
}
record(
  'P4-2 an active session is not consolidated',
  activeRuns === 0,
  `${activeRuns} pass(es) while touching`,
)
// Now go quiet for longer than the 1-minute idle window.
clock += 70_000
await sleep(300)
idle.scheduler.stop()
record(
  'P4-2 空闲 fires after consolidateIdleMinutes of silence',
  idle.runs.length === 1,
  `${idle.runs.length} pass(es); logs ${JSON.stringify(idle.logs).slice(0, 200)}`,
)

/* ── 4. session-end trigger + debounce ────────────────────────────────── */

await clearLastRun()
await seedPending(4)
const endTrigger = makeScheduler({ consolidateOn: 'session-end' })
endTrigger.scheduler.start()
// A burst of flushes/disposals must collapse into ONE pass.
for (let i = 0; i < 5; i += 1) endTrigger.scheduler.sessionEnded()
await sleep(400)
endTrigger.scheduler.stop()
record(
  'P4-3 会话结束 fires once for a burst (debounced)',
  endTrigger.runs.length === 1,
  `${endTrigger.runs.length} pass(es)`,
)

/* ── 5. fixed-time trigger ────────────────────────────────────────────── */

await clearLastRun()
await seedPending(5)
// A clock the test owns: 03:05 local, past the 03:00 default.
const fixedNow = new Date()
fixedNow.setHours(3, 5, 0, 0)
const fixed = makeScheduler({ consolidateOn: 'fixed', consolidateFixedTime: '03:00' }, { tickMs: 50, now: () => fixedNow.getTime() })
fixed.scheduler.start()
await sleep(300)
fixed.scheduler.stop()
record(
  'P4-3 固定时间 fires once the clock passes the target',
  fixed.runs.length === 1,
  `${fixed.runs.length} pass(es)`,
)

await clearLastRun()
await seedPending(6)
const notYet = makeScheduler({ consolidateOn: 'fixed', consolidateFixedTime: '23:59' }, { tickMs: 50 })
notYet.scheduler.start()
await sleep(250)
notYet.scheduler.stop()
record(
  'P4-3 固定时间 stays quiet before the target time',
  notYet.runs.length === 0,
  `${notYet.runs.length} pass(es)`,
)

/* ── 6. the gate ──────────────────────────────────────────────────────── */

const empty = makeScheduler({ consolidateOn: 'startup-idle' })
// Nothing pending: the startup catch-up must skip, not journal an empty pass.
await store.patchState(state => ({ ...state, pending: [] }))
empty.scheduler.start()
await sleep(300)
empty.scheduler.stop()
record(
  'P4-3 an empty queue does not run a pass',
  empty.runs.length === 0 && empty.logs.some(line => line.includes('没有待整理的会话')),
  JSON.stringify(empty.logs).slice(0, 200),
)

await clearLastRun()
await seedPending(7)
const off = makeScheduler({ consolidateOn: 'startup-idle', conversationMemory: false })
off.scheduler.start()
await sleep(300)
off.scheduler.stop()
record(
  'P4-3 对话记忆 off stops automatic passes',
  off.runs.length === 0 && off.logs.some(line => line.includes('会话记忆已关闭')),
  JSON.stringify(off.logs).slice(0, 200),
)

await store.patchState(state => ({ ...state, lastConsolidateAt: new Date().toISOString() }))
const tooSoon = makeScheduler({ consolidateOn: 'startup-idle', consolidateIntervalHours: 24 })
tooSoon.scheduler.start()
await sleep(300)
tooSoon.scheduler.stop()
record(
  'P4-3 the interval gate holds a second pass back',
  tooSoon.runs.length === 0 && tooSoon.logs.some(line => line.includes('距上次整理不足')),
  JSON.stringify(tooSoon.logs).slice(0, 200),
)

/* ── 7. stop() releases the timers (hot reload) ───────────────────────── */

await clearLastRun()
await seedPending(8)
const stopper = makeScheduler({ consolidateOn: 'startup-idle' })
stopper.scheduler.start()
stopper.scheduler.stop()
await sleep(300)
record(
  'P4-7 stop() cancels the pending startup timer',
  stopper.runs.length === 0,
  `${stopper.runs.length} pass(es) after stop()`,
)

/* ── 8. the scheduler never touches a memory file by itself ───────────── */

const before = memoryFile('memory/habits.md')
await clearLastRun()
const quiet = makeScheduler({ consolidateOn: 'startup-idle' })
quiet.scheduler.start()
await sleep(250)
quiet.scheduler.stop()
record(
  'P4-7 a skipped trigger leaves the memory files untouched',
  memoryFile('memory/habits.md') === before,
  'habits.md unchanged',
)

/* ── report ───────────────────────────────────────────────────────────── */

const failed = results.filter(item => !item.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
console.log(`memory root: ${root}`)
if (process.env.KEEP_TEST_HOME !== '1') rmSync(home, { recursive: true, force: true })
if (failed.length > 0) process.exitCode = 1
