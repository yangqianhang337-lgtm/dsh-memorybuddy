/**
 * Headless-composition smoke test.
 *
 * The desktop app is not the only place this plugin runs. `dsh headless` (a
 * CLI profile with `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-headless`) has
 * no `webServer` at all — there is no GUI to serve. Memory is at its most
 * useful in exactly those runs, so the host half must keep working there.
 *
 * This test exists because that assumption was WRONG in the first release and
 * only a real headless boot revealed it:
 *
 *   1. `webServer` was in `inject`, so in a headless composition the whole
 *      plugin stayed PENDING — not merely route-less, but with no collector,
 *      no tools and no prompt injection. The CLI reported it as
 *      `dsh: warning: 1 entry did not activate`.
 *   2. After `webServer` was made optional, the probe still read
 *      `ctx.webServer` directly and crashed with
 *      `Error: cannot get property "webServer" without inject` — the Cordis
 *      context is a PROXY that throws on any property missing from `inject`.
 *      Only `ctx.get(name)` reaches an optional service.
 *
 * The context below models both behaviours (proxy that throws, plus `get()`),
 * so a regression fails here instead of in the user's CLI.
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const home = mkdtempSync(join(tmpdir(), 'dsh-workbuddy-headless-'))
process.env.DSH_HOME = home

let passed = 0
let failed = 0
const record = (label, ok, detail) => {
  if (ok) {
    passed += 1
    console.log(`ok    ${label}${detail === undefined ? '' : `: ${detail}`}`)
  } else {
    failed += 1
    console.log(`FAIL  ${label}${detail === undefined ? '' : `: ${detail}`}`)
  }
}

/* --- a headless host context ---------------------------------------------- *
 * Declared services are plain properties (they are in `inject`). Everything
 * else goes through `get`, and any OTHER property access throws, exactly as
 * the real Cordis proxy does.
 * ------------------------------------------------------------------------- */

const sections = []
const commands = []
const tools = new Map()
const effects = []
const listeners = new Map()
const optionalServices = {
  // Deliberately absent: webServer. A headless profile has none.
  tools: {
    register(definition) {
      tools.set(definition.name, definition)
      return () => {}
    },
    get: name => tools.get(name),
  },
}

const declared = {
  systemPrompt: {
    section(options) {
      sections.push(options)
      return () => {}
    },
  },
  agents: { list: () => [] },
  commands: {
    register(definition) {
      commands.push(definition)
      return () => {}
    },
  },
  on(name, listener) {
    listeners.set(name, listener)
    return () => {}
  },
  effect(callback, label) {
    effects.push(label ?? 'effect')
    const dispose = callback()
    return typeof dispose === 'function' ? dispose : () => {}
  },
  /*
   * `ctx.inject` is a CORDIS CORE method, so it exists in every composition
   * including this one — only the SERVICE it asks for may be missing. That is
   * the whole point of the mechanism: the callback below simply never fires
   * when a headless profile has no `webServer`, and nothing throws.
   */
  inject(names, callback) {
    const scoped = { ...declared, get: name => (name === 'webServer' ? undefined : optionalServices[name]) }
    if (names.includes('webServer') && scoped.get('webServer') !== undefined) callback(scoped)
    return () => {}
  },
  get(name) {
    return optionalServices[name]
  },
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}

const ctx = new Proxy(declared, {
  get(target, property) {
    if (property in target) return target[property]
    throw new Error(`cannot get property "${String(property)}" without inject`)
  },
  has(target, property) {
    return property in target
  },
})

/* --- mount ---------------------------------------------------------------- */

let mountError
let host
try {
  host = await import(pathToFileURL(join(ROOT, 'lib/index.js')).href)
  host.apply(ctx)
} catch (error) {
  mountError = error
}

record(
  'apply() survives a composition without webServer',
  mountError === undefined,
  mountError === undefined ? 'mounted' : String(mountError),
)
if (mountError !== undefined) {
  console.log(`\n${passed} passed, ${failed} failed`)
  rmSync(home, { recursive: true, force: true })
  process.exit(1)
}

record(
  'webServer is not a hard dependency',
  !host.inject.includes('webServer'),
  `inject = ${JSON.stringify(host.inject)}`,
)

// Registration of the prompt section and the tools happens after the
// asynchronous `store.ensure()` + preference read that `apply` kicks off, so
// give that work a moment before asserting on it.
await new Promise(resolve => setTimeout(resolve, 600))

record(
  'the prompt section is registered anyway',
  sections.some(section => section.name === 'plugin:workbuddy-memory'),
  sections.map(section => section.name).join(', ') || '(none)',
)
record(
  'the memory tools are registered anyway',
  ['workbuddy_memory', 'workbuddy_remember', 'workbuddy_forget'].every(name => tools.has(name)),
  [...tools.keys()].join(', ') || '(none)',
)
record(
  '/memory is registered anyway',
  commands.some(definition => definition.name === 'memory'),
  commands.map(definition => definition.name).join(', ') || '(none)',
)
record(
  'session lifecycle is still subscribed',
  ['session/event', 'session/flush', 'session/disposed'].every(name => listeners.has(name)),
  [...listeners.keys()].join(', ') || '(none)',
)

/* --- collection must still work ------------------------------------------- */

const session = {
  id: 'session-headless-1',
  header: { cwd: ROOT },
  snapshotEvents: () => [],
}
const event = (type, seq, data) => ({ type, seq, time: 1_700_000_000_000 + seq, data })

try {
  listeners.get('session/created')?.(session)
  listeners.get('session/event')?.(
    session,
    event('user/message', 1, {
      content: [{ type: 'text', text: '记一下：我以后都用中文回复。' }],
      source: { kind: 'user' },
      role: 'user',
      id: 'm1',
    }),
  )
  listeners.get('session/event')?.(
    session,
    event('tool/call', 2, { turn: 1, step: 1, callId: 'call_a', name: 'read_file', arguments: {} }),
  )
  listeners.get('session/event')?.(
    session,
    event('tool/result', 3, {
      message: {
        role: 'tool',
        source: { kind: 'tool', callId: 'call_a' },
        toolCallId: 'call_a',
        content: [{ type: 'text', text: 'file body' }],
        isError: false,
      },
    }),
  )
  listeners.get('session/event')?.(session, event('turn/end', 4, { turn: 1, reason: { kind: 'completed' } }))
  await listeners.get('session/flush')?.(session)
} catch (error) {
  record('collecting a turn throws nothing', false, String(error))
}

// The flush enqueues a write; give the queue a moment to drain.
await new Promise(resolve => setTimeout(resolve, 400))

/** Find the note wherever the collector dated it (local date, not UTC). */
function findNote(directory) {
  let entries = []
  try {
    entries = readdirSync(directory, { withFileTypes: true })
  } catch {
    return ''
  }
  for (const entry of entries) {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) {
      const nested = findNote(full)
      if (nested !== '') return nested
    } else if (entry.name === 'session-headless-1.md') {
      return full
    }
  }
  return ''
}

const notePath = findNote(join(home, 'dsh-workbuddy-memory', 'sessions'))
let note = ''
try {
  note = readFileSync(notePath, 'utf8')
} catch {
  // Missing file is the failure the assertion below reports.
}

record('a note was written without a web server', note !== '', notePath || '(no note found)')
record('the turn count is right', /turns: 1/.test(note), (note.match(/turns: \d+/) ?? ['(none)'])[0])
record(
  'the user message was recorded',
  note.includes('我以后都用中文回复'),
  note.includes('我以后都用中文回复') ? 'present' : 'missing',
)
record(
  'the tool name was resolved from tool/call',
  note.includes('read_file') && !note.includes('工具 tool '),
  (note.match(/- 工具调用[^\n]*/) ?? ['(none)'])[0],
)
record(
  'a preference candidate was detected',
  note.includes('候选'),
  (note.match(/- \(候选[^\n]*/) ?? ['(none)'])[0],
)

console.log(`\n${passed} passed, ${failed} failed`)
rmSync(home, { recursive: true, force: true })
process.exit(failed === 0 ? 0 : 1)
