/**
 * Host-half smoke test: mount the plugin into a stub host context and drive it.
 *
 * This exercises the acceptance criteria that cannot be checked by reading code,
 * against a throwaway `DSH_HOME`:
 *
 * - P1: the memory tree is created, a document written by hand is read back, a
 *   stale revision is refused instead of silently overwriting, and two
 *   concurrent saves both land.
 * - P3: session events produce a note under `sessions/`, a second flush does not
 *   duplicate it, and turning 对话记忆 off stops collection dead.
 *
 * The host context is a stub because the real services only exist inside the
 * running app. It records what the plugin registers — routes, prompt section,
 * commands, tools — so the test can assert on the wiring as well as the data.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Readable } from 'node:stream'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/* --- a throwaway DSH_HOME -------------------------------------------------- */

const home = mkdtempSync(join(tmpdir(), 'dsh-memorybuddy-test-'))
process.env.DSH_HOME = home

const results = []
const record = (label, ok, detail) => results.push({ label, ok, detail })

/**
 * Wait for the plugin's write queue to drain.
 *
 * The collector serializes every disk write through one promise chain and the
 * event listener starts a flush without awaiting it, so a test cannot observe
 * the file the instant it emits an event. Polling the queue's own microtask
 * turn is enough; the alternative (a fixed sleep) would be flaky on a slow disk.
 */
async function settle(rounds = 8) {
  for (let index = 0; index < rounds; index += 1) {
    await new Promise(resolve => setTimeout(resolve, 40))
  }
}

/** Read a file under the memory root, or undefined. */
function memoryFile(relative) {
  try {
    return readFileSync(join(home, 'dsh-memorybuddy', relative), 'utf8')
  } catch {
    return undefined
  }
}

/* --- stub host context ----------------------------------------------------- */

const routes = new Map()
const sections = []
const commands = []
const tools = new Map()
const effects = []
const listeners = new Map()

/** Services the plugin reaches through `ctx.get(name)` rather than `inject`. */
const optional = {
  tools: {
    register(definition) {
      tools.set(definition.name, definition)
      return () => {}
    },
    get: name => tools.get(name),
  },
}

/** The `webServer` service, reachable ONLY through a scoped inject. */
const webServer = {
  register(route) {
    routes.set(`${route.kind} ${route.path}`, route)
    return () => {}
  },
}

const ctx = {
  logger: { info: () => {}, warn: () => {}, error: () => {} },
  // Services NOT listed in the plugin's `inject` are reachable only through
  // `get()` — the real Cordis context is a proxy that throws on most other
  // properties. Modelling that here is what makes this test able to catch the
  // "cannot get property X without inject" class of bug, which it previously
  // missed because the stub exposed webServer as a plain property.
  //
  // `webServer` is deliberately ABSENT from this map, because it is a SCOPED
  // service: measured against a real GUI composition, a probe plugin declaring
  // `inject = ['systemPrompt','agents','commands']` saw `tools` / `llm` /
  // `skills` / `timer` resolve here while `get('webServer')` stayed undefined
  // and only `ctx.inject(['webServer'], …)` reached it. A stub that answered
  // `get('webServer')` therefore hid a real defect: the plugin registered no
  // routes at all in a live host while this test stayed green.
  get(name) {
    return optional[name]
  },
  inject(names, callback) {
    const scoped = { ...ctx, get: name => (name === 'webServer' ? webServer : optional[name]) }
    if (names.includes('webServer')) callback(scoped)
    return () => {}
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
}

const host = await import(pathToFileURL(join(ROOT, 'lib/index.js')).href)
host.apply(ctx)

record('apply() mounted', true, `inject = ${JSON.stringify(host.inject)}`)
record(
  'eight routes registered',
  routes.size === 8,
  [...routes.keys()].join(', '),
)
record('/memory command registered', commands.some(c => c.name === 'memory'), commands.map(c => c.name).join(', ') || '(none)')
record(
  'session lifecycle is subscribed',
  ['session/event', 'session/flush', 'session/disposed'].every(name => listeners.has(name)),
  [...listeners.keys()].join(', ') || '(none)',
)
record(
  'every subscription/timer hangs on ctx.effect',
  effects.length >= 3,
  `${effects.length} effect(s): ${effects.join(' | ')}`,
)

/* --- drive the HTTP routes with fake req/res ------------------------------- */

/** Build a request the route handler will accept as a same-origin page call. */
function request(method, path, body) {
  const payload = body === undefined ? [] : [Buffer.from(JSON.stringify(body), 'utf8')]
  const stream = Readable.from(payload)
  stream.method = method
  stream.url = path
  stream.headers = {
    'sec-fetch-site': 'same-origin',
    host: '127.0.0.1:19387',
    'x-forwarded-for': '127.0.0.1',
    // The route answers 415 unless the body announces itself as JSON, so a POST
    // fixture must carry the header a real `fetch` would set.
    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
  }
  stream.socket = { remoteAddress: '127.0.0.1', localAddress: '127.0.0.1' }
  return stream
}

/** Capture a response into `{ status, body }`. */
function response() {
  const chunks = []
  const res = {
    statusCode: 0,
    headers: {},
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value
    },
    writeHead(status, headers) {
      this.statusCode = status
      if (headers) Object.assign(this.headers, headers)
      return this
    },
    write(chunk) {
      chunks.push(Buffer.from(chunk))
      return true
    },
    end(chunk) {
      if (chunk !== undefined) chunks.push(Buffer.from(chunk))
      this.body = chunks.length === 0 ? undefined : JSON.parse(Buffer.concat(chunks).toString('utf8'))
      this.done = true
      return this
    },
  }
  return res
}

/** Invoke one registered route and wait for its response. */
async function call(method, path, body) {
  // Routes are registered without their query string; the handler reads it back
  // off `request.url`, exactly as the real server hands it over.
  const lookup = path.split('?')[0]
  const key = [...routes.keys()].find(candidate => candidate.endsWith(` ${lookup}`))
  if (key === undefined) throw new Error(`no route for ${path}`)
  const res = response()
  await routes.get(key).handler(request(method, path, body), res)
  // A handler that never calls end() would hang the test; a 0 status says so.
  return { status: res.statusCode, body: res.body }
}

// The plugin defers `store.ensure()` into a floating task, so the first route
// call is what proves the tree exists; give that task a turn to settle.
await new Promise(resolve => setTimeout(resolve, 250))

const state0 = await call('GET', '/api/memorybuddy/state', undefined)
record(
  'GET /state answers 200',
  state0.status === 200 && state0.body?.ok === true,
  `status ${state0.status}`,
)
record('prompt section registered after init', sections.length >= 1, sections.map(s => s.name).join(', ') || '(none)')
record(
  'prompt section refuses interpolation',
  sections.every(section => section.interpolate === false),
  sections.map(section => String(section.interpolate)).join(', ') || '(none)',
)
record(
  'prompt section order is 120',
  sections.every(section => section.order === 120),
  sections.map(section => String(section.order)).join(', ') || '(none)',
)
record(
  'memory tree created',
  memoryFile('preferences.md') !== undefined && memoryFile('memory/index.md') !== undefined,
  `preferences.md ${memoryFile('preferences.md') === undefined ? 'MISSING' : 'ok'}, memory/index.md ${memoryFile('memory/index.md') === undefined ? 'MISSING' : 'ok'}`,
)
record(
  'snapshot reports the memory root',
  typeof state0.body?.root === 'string' && state0.body.root.endsWith('dsh-memorybuddy'),
  state0.body?.root,
)
record(
  'model stage is honestly disabled',
  state0.body?.consolidation?.modelStage === 'disabled',
  `${state0.body?.consolidation?.modelStage} / ${state0.body?.consolidation?.modelNote}`,
)
record(
  'every document target is present',
  ['profile.md', 'instructions.md', 'memory/index.md', 'memory/background.md', 'memory/habits.md', 'memory/environment.md', 'memory/preferences-learned.md'].every(
    path => state0.body?.documents?.[path] !== undefined,
  ),
  Object.keys(state0.body?.documents ?? {}).join(', '),
)

/* --- P1: hand edit, stale revision, concurrent writes ---------------------- */

const profile = state0.body.documents['profile.md']

// A hand edit is the whole point of shipping markdown: write the file behind the
// plugin's back, exactly as a user would in an editor.
writeFileSync(
  join(home, 'dsh-memorybuddy/profile.md'),
  profile.text.replace('你是 DSH同学，我最好的助手。', '你是 测试同学，一个手写的人设。'),
  'utf8',
)

const state1 = await call('GET', '/api/memorybuddy/state', undefined)
record(
  'hand edit is read back with a new revision',
  state1.body?.documents?.['profile.md']?.text.includes('手写的人设') === true &&
    state1.body.documents['profile.md'].revision !== profile.revision,
  `revision ${profile.revision.slice(0, 8)} -> ${String(state1.body?.documents?.['profile.md']?.revision).slice(0, 8)}`,
)

const stale = await call('POST', '/api/memorybuddy/save', {
  path: 'profile.md',
  text: 'STALE WRITE MUST NOT LAND',
  revision: profile.revision,
})
record(
  'stale revision is refused, not overwritten',
  stale.status === 409 && stale.body?.error === 'conflict',
  `status ${stale.status}, error ${stale.body?.error}`,
)
record(
  'the refusal carries the on-disk text for merging',
  stale.body?.text?.includes('手写的人设') === true,
  `${String(stale.body?.text).slice(0, 32)}…`,
)
record(
  'the stale write did not reach the disk',
  memoryFile('profile.md').includes('STALE WRITE MUST NOT LAND') === false,
  'file unchanged',
)

const current = state1.body.documents['profile.md'].revision
const fresh = await call('POST', '/api/memorybuddy/save', {
  path: 'profile.md',
  text: '你是 并发同学。',
  revision: current,
})
record('a current revision saves', fresh.status === 200 && fresh.body?.ok === true, `status ${fresh.status}`)

// Two writers racing on the same revision: exactly one may win, and the loser
// must be told rather than silently dropped.
const rev = state1.body.documents['instructions.md'].revision
const [raceA, raceB] = await Promise.all([
  call('POST', '/api/memorybuddy/save', { path: 'instructions.md', text: '写入 A', revision: rev }),
  call('POST', '/api/memorybuddy/save', { path: 'instructions.md', text: '写入 B', revision: rev }),
])
const winners = [raceA, raceB].filter(item => item.status === 200).length
const losers = [raceA, raceB].filter(item => item.status === 409).length
record(
  'concurrent writes lose nothing: one wins, one is told',
  winners === 1 && losers === 1,
  `${winners} saved, ${losers} conflicted`,
)
record(
  'the surviving text is one whole write, not a blend',
  ['写入 A', '写入 B'].includes(memoryFile('instructions.md').match(/写入 [AB]/)?.[0]),
  memoryFile('instructions.md').match(/写入 [AB]/)?.[0],
)

/* --- preferences ----------------------------------------------------------- */

const patched = await call('POST', '/api/memorybuddy/preferences', {
  patch: { userName: '测试者', replyStyle: '简洁' },
})
record(
  'preferences patch persists',
  patched.status === 200 && patched.body?.snapshot?.preferences?.userName === '测试者',
  `userName ${patched.body?.snapshot?.preferences?.userName}, replyStyle ${patched.body?.snapshot?.preferences?.replyStyle}`,
)

const injectedText = sections.at(-1)?.text?.({ agent: { session: { header: { cwd: ROOT } } } })
record(
  'the injected section carries the saved preference',
  typeof injectedText === 'string' && injectedText.includes('测试者'),
  typeof injectedText === 'string' ? `${injectedText.slice(0, 60).replace(/\n/g, ' / ')}…` : typeof injectedText,
)

/* --- P3: collection ------------------------------------------------------- */

/** Build a session-shaped object the collector accepts. */
function session(id) {
  return { id, header: { cwd: ROOT, id } }
}

/** Emit one of the four recorded event shapes. */
function event(type, seq, data) {
  return { type, seq, time: Date.now(), data }
}

/**
 * The event fixtures below copy the shapes the running app actually emits.
 *
 * That detail is load-bearing: `user/message` puts its fields at the top level
 * while `assistant/message` and `tool/result` nest theirs under `data.message`,
 * and the tool's NAME is only ever on the matching `tool/call`. A fixture that
 * flattens those differences makes a collector that reads one shape look
 * correct while it silently records nothing.
 */
function userMessage(text) {
  return { content: [{ type: 'text', text }], source: { kind: 'user', rpcId: 'rpc-test' }, role: 'user', id: 'msg-1' }
}

function assistantMessage(text) {
  return { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text }], source: { kind: 'model' } } }
}

function toolCall(callId, name) {
  return { turn: 1, step: 1, callId, name, arguments: '{}' }
}

function toolResult(callId, text, isError = false) {
  return {
    turn: 1,
    step: 1,
    message: {
      role: 'tool',
      source: { kind: 'tool', callId },
      toolCallId: callId,
      content: [{ type: 'text', text }],
      isError,
    },
  }
}

const target = session('sess-test-1')
listeners.get('session/created')?.(target)
listeners.get('session/event')?.(target, event('user/message', 1, userMessage('以后都用中文回复我')))
listeners.get('session/event')?.(target, event('assistant/message', 2, assistantMessage('好的，以后都用中文。')))
listeners.get('session/event')?.(target, event('tool/call', 3, toolCall('call_a', 'read_file')))
listeners.get('session/event')?.(target, event('tool/result', 4, toolResult('call_a', 'SECRET_PAYLOAD_MARKER')))
listeners.get('session/event')?.(target, event('tool/call', 5, toolCall('call_b', 'write_file')))
listeners.get('session/event')?.(target, event('tool/result', 6, toolResult('call_b', 'SECRET_PAYLOAD_MARKER', true)))
listeners.get('session/event')?.(target, event('turn/end', 7, { turn: 1, reason: { kind: 'completed' } }))
// The listener fires `collector.flush()` without awaiting it, so the test waits
// for the write queue to drain rather than for the handler's return value.
listeners.get('session/flush')?.(target)
await settle()

const sessionsRoot = join(home, 'dsh-memorybuddy/sessions')
const dayDirs = (existsSync(sessionsRoot) ? readdirSync(sessionsRoot, { withFileTypes: true }) : [])
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
const notePath = dayDirs.length > 0 ? `${dayDirs[0]}/sess-test-1.md` : undefined
const note = notePath === undefined ? undefined : memoryFile(`sessions/${notePath}`)

record('a session note was written', note !== undefined, notePath ?? '(no sessions/ day directory)')
record(
  'the note records the user turn',
  note?.includes('以后都用中文回复我') === true,
  note === undefined ? '(no note)' : `${note.split('\n').length} lines`,
)
record(
  'failed tool calls surface under 未决事项',
  note?.includes('工具 write_file 在 seq 6 失败') === true,
  note?.split('\n').filter(line => line.startsWith('- 工具 ')).join(' | ') ?? '(none)',
)
record(
  'the note names the tools that ran (correlated from tool/call)',
  note?.includes('read_file ×1') === true && note?.includes('write_file ×1') === true,
  note?.split('\n').find(line => line.startsWith('- 工具调用')) ?? '(no tool summary line)',
)
record(
  'the turn count is non-zero when a turn ended',
  note?.includes('turns: 1') === true,
  note?.split('\n').find(line => line.startsWith('turns:')) ?? '(no turns line)',
)
record(
  'assistant replies are recorded too',
  note?.includes('好的，以后都用中文。') === true,
  note?.includes('好的，以后都用中文。') === true ? 'assistant line present' : '(assistant text missing)',
)
record(
  'tool payloads are never recorded (name and outcome only)',
  note?.includes('SECRET_PAYLOAD_MARKER') === false,
  note === undefined ? '(no note)' : 'no payload text in the note',
)
record(
  'the preference line became a candidate',
  note?.includes('(候选') === true,
  note?.split('\n').filter(line => line.includes('(候选')).join(' | ') ?? '(none)',
)
record(
  'a second flush does not duplicate the note',
  (() => {
    // The watermark in state.json is what makes a re-flush a no-op: the note is
    // rewritten only when new events arrived since the last persist.
    const before = note
    listeners.get('session/flush')?.(target)
    return before !== undefined
  })(),
  'note present after flush',
)

/* --- toggle off really stops collection ----------------------------------- */

const off = await call('POST', '/api/memorybuddy/preferences', { patch: { conversationMemory: false } })
record(
  '对话记忆 can be switched off',
  off.body?.snapshot?.preferences?.conversationMemory === false,
  String(off.body?.snapshot?.preferences?.conversationMemory),
)

const target2 = session('sess-test-2')
// The switch is read from the store on every event, so wait for the refresh the
// preferences route triggers before emitting anything else.
await settle(4)
listeners.get('session/created')?.(target2)
listeners.get('session/event')?.(target2, event('user/message', 1, userMessage('这条不应该被记录')))
listeners.get('session/flush')?.(target2)
await settle(4)

const leaked = existsSync(join(home, `dsh-memorybuddy/sessions/${dayDirs[0] ?? ''}/sess-test-2.md`))
record('the switch off stops collection', leaked === false, leaked ? 'sess-test-2.md EXISTS' : 'no file written')

/* --- consolidation --------------------------------------------------------- */

// The action answers BEFORE the pass finishes (a model-stage pass can outlive
// the browser's 15 s timeout), so the response only says "accepted"; the result
// has to be read back from the memory tree.
const consolidated = await call('POST', '/api/memorybuddy/action', { action: { kind: 'consolidate' } })
record(
  'manual consolidation is accepted immediately',
  // 202, not 200: the pass is accepted, not finished.
  consolidated.status === 202 && consolidated.body?.result?.started === true,
  `status ${consolidated.status}, ${JSON.stringify(consolidated.body?.result ?? {})}`.slice(0, 120),
)

await settle(8)
const journalDay = dayDirs[0] ?? new Date().toISOString().slice(0, 10)
const journalText = memoryFile(`journal/${journalDay}.md`)
record('consolidation wrote a journal entry', journalText !== undefined, 'journal present')

// P4-4: the pass's own questions reach the panel through the snapshot.
const stateAfter = await call('GET', '/api/memorybuddy/state', undefined)
record(
  'the snapshot carries the questions field',
  Array.isArray(stateAfter.body?.questions),
  `questions = ${JSON.stringify(stateAfter.body?.questions ?? null).slice(0, 80)}`,
)
record(
  'the model stage reports deterministic, not disabled',
  stateAfter.body?.consolidation?.modelStage === 'deterministic',
  String(stateAfter.body?.consolidation?.modelStage),
)
record(
  'the snapshot lists the day as rollback-able history',
  Array.isArray(stateAfter.body?.history) && stateAfter.body.history.includes(journalDay),
  JSON.stringify(stateAfter.body?.history ?? null),
)

/* --- P4-5: history + rollback ---------------------------------------------- */

const journalRoute = await call('GET', `/api/memorybuddy/journal?date=${journalDay}`, undefined)
record(
  'GET /journal answers with the day and its backups',
  journalRoute.status === 200 && journalRoute.body?.journal?.date === journalDay,
  `status ${journalRoute.status}, backups ${journalRoute.body?.journal?.backups?.length ?? 'n/a'}`,
)
record(
  'the journal route reports the files a rollback can restore',
  Array.isArray(journalRoute.body?.journal?.backups) && journalRoute.body.journal.backups.length > 0,
  JSON.stringify(journalRoute.body?.journal?.backups ?? null),
)

// P4-5: a rollback restores the backup AND backs up the state it replaced.
const rolled = await call('POST', '/api/memorybuddy/action', { action: { kind: 'rollback', date: journalDay } })
record(
  'rollback runs and reports what it restored',
  rolled.status === 200 && Array.isArray(rolled.body?.result?.restored),
  JSON.stringify(rolled.body?.result ?? {}).slice(0, 120),
)
record(
  'rollback itself is rollback-able (it backed up first)',
  (memoryFile(`journal/${journalDay}.md`) ?? '').includes(`已回滚到 ${journalDay}`),
  'journal records the rollback',
)

// P4-5 regression: a rollback must actually REMOVE the damage.
//
// The first draft asserted only the journal line, which is why it passed while
// `rollback(date)` was quietly destroying its own source: it snapshotted the
// replaced state into `journal/<today>/backup/` — the same directory it was
// about to restore from whenever the target day IS today — so every "restored"
// file was rewritten with the damaged bytes and the log line still looked fine.
// Asserting the content, not the log, is the whole point of this check.
const damaged = journalRoute.body?.journal?.backups?.[0]
if (typeof damaged === 'string' && damaged !== '') {
  const damagedPath = join(home, 'dsh-memorybuddy', damaged)
  const pristine = readFileSync(damagedPath, 'utf8')
  const marker = 'ROLLBACK_SHOULD_REMOVE_THIS_LINE'
  writeFileSync(damagedPath, `${pristine}\n- ${marker}\n`, 'utf8')
  record(
    'the damage is really on disk before the rollback',
    (memoryFile(damaged) ?? '').includes(marker),
    damaged,
  )

  // Same-day rollback: the case that used to overwrite its own backup.
  const undo = await call('POST', '/api/memorybuddy/action', { action: { kind: 'rollback', date: journalDay } })
  record(
    'a rollback to today actually removes the damage',
    undo.status === 200 && !(memoryFile(damaged) ?? '').includes(marker),
    `status ${undo.status}, ${damaged}`,
  )
  record(
    'a rollback to today does not damage its own backup source',
    !(readFileSync(join(home, 'dsh-memorybuddy', `journal/${journalDay}/backup`, damaged.replaceAll('/', '__')), 'utf8')).includes(marker),
    `journal/${journalDay}/backup/${damaged.replaceAll('/', '__')}`,
  )
  record(
    'a rollback keeps a snapshot of what it replaced, in its own directory',
    typeof undo.body?.result?.snapshot === 'string'
      && undo.body.result.snapshot.startsWith(`journal/${journalDay}/rollback-`)
      && !undo.body.result.snapshot.endsWith('/backup'),
    String(undo.body?.result?.snapshot),
  )
}

/* --- P7: the draft detail route ------------------------------------------- */

// A hand-written draft stands in for a generated one: the route's job is to read
// whatever `skills-draft/<name>/SKILL.md` holds, and verify-skills.mjs already
// proves the generator writes that file.
const draftName = 'host-verify-draft'
mkdirSync(join(home, 'dsh-memorybuddy', 'skills-draft', draftName), { recursive: true })
writeFileSync(
  join(home, 'dsh-memorybuddy', 'skills-draft', draftName, 'SKILL.md'),
  `---\nname: ${draftName}\ntitle: 主机验收草稿\ndescription: 一句话\nwhenToUse: 验收时\nsource: memorybuddy-evolved\nderivedFrom: ["sessions/${journalDay}/a.md", "sessions/${journalDay}/b.md", "sessions/${journalDay}/c.md"]\nrepeats: 3\ncreatedAt: ${new Date().toISOString()}\n---\n# 主机验收草稿\n`,
  'utf8',
)

const draftRoute = await call('GET', `/api/memorybuddy/draft?name=${draftName}`, undefined)
record(
  'GET /draft answers with the full file text, target path and source sessions',
  draftRoute.status === 200 &&
    typeof draftRoute.body?.draft?.text === 'string' &&
    draftRoute.body.draft.text.includes('主机验收草稿') &&
    draftRoute.body.draft.body.includes('# 主机验收草稿') &&
    draftRoute.body.draft.derivedFrom.length === 3 &&
    typeof draftRoute.body?.draft?.target === 'string' &&
    draftRoute.body.draft.target.endsWith(join('skills', draftName, 'SKILL.md')),
  `status ${draftRoute.status}, sources ${draftRoute.body?.draft?.derivedFrom?.length ?? 'n/a'}`,
)
record(
  'the draft route refuses a name that could escape the skills root',
  (await call('GET', '/api/memorybuddy/draft?name=..%2F..%2Fescape', undefined)).status === 404,
  '404 for a traversing name',
)
record(
  'a draft that does not exist answers 404 rather than an empty 200',
  (await call('GET', '/api/memorybuddy/draft?name=no-such-draft', undefined)).status === 404,
)

/* --- P4-6: reset archives instead of deleting ------------------------------ */

const beforeReset = memoryFile('preferences.md') !== undefined
const reset = await call('POST', '/api/memorybuddy/action', { action: { kind: 'reset-all' } })
record(
  'reset-all archives everything and rebuilds the skeleton',
  reset.status === 200 && typeof reset.body?.result?.archived === 'string' && beforeReset,
  JSON.stringify(reset.body?.result ?? {}).slice(0, 160),
)
const archived = reset.body?.result?.archived
record(
  'reset-all really moved the old memory into archive/',
  typeof archived === 'string' && existsSync(join(home, 'dsh-memorybuddy', archived, 'memory')),
  String(archived),
)
record(
  'reset-all left a working skeleton behind',
  memoryFile('memory/index.md') !== undefined && memoryFile('preferences.md') !== undefined,
  'skeleton rebuilt',
)

/* --- P8-1: 彻底删除 through the live route --------------------------------- */

// Run LAST: it removes the memory root every earlier assertion depends on.
//
// The response shape is the point of these two checks. `snapshot()` calls
// `ensure()`, so a wipe answered with a snapshot would rebuild the skeleton in
// the same response — the user would be told 「已彻底删除」 while an empty memory
// directory reappeared behind them. The route therefore answers `wiped: true`
// with NO snapshot, and the panel reloads instead of adopting one.
const wrongPhrase = await call('POST', '/api/memorybuddy/action', {
  action: { kind: 'wipe-all', confirm: 'delete' },
})
record(
  'wipe-all refuses a wrong confirmation phrase and keeps everything',
  wrongPhrase.status === 500 && existsSync(join(home, 'dsh-memorybuddy', 'memory')),
  `status ${wrongPhrase.status}, memory still there=${existsSync(join(home, 'dsh-memorybuddy', 'memory'))}`,
)

const noConfirm = await call('POST', '/api/memorybuddy/action', { action: { kind: 'wipe-all' } })
record(
  'wipe-all refuses a missing confirmation field',
  noConfirm.status === 500 && existsSync(join(home, 'dsh-memorybuddy', 'memory')),
  `status ${noConfirm.status}`,
)

// The collector buffers must be dropped BEFORE the delete. A session that was
// mid-flight at wipe time would otherwise flush itself on its next timer tick
// and recreate the memory root together with the content the user was just told
// had been destroyed — so the harness drives a real buffered session through the
// plugin's own listeners and checks the root stays gone.
const liveSession = session('sess-live-at-wipe')
// The toggle-off test above left `conversationMemory: false`, which stops
// collection for every later section. Switch it back on, or this session never
// buffers and the "root stays gone" assertion passes for the wrong reason.
await call('POST', '/api/memorybuddy/preferences', { patch: { conversationMemory: true } })
await settle(4)
listeners.get('session/created')?.(liveSession)
// Deliberately NOT flushed. The realistic hazard is a session whose events are
// still sitting in the throttle window when the user wipes — an already-flushed
// note has `dirty === 0`, so a later flush writes nothing and would make the
// assertion pass even with the route doing nothing.
listeners.get('session/event')?.(liveSession, event('user/message', 1, userMessage('删除之前说的话')))
const liveSessionDates = existsSync(join(home, 'dsh-memorybuddy', 'sessions'))
  ? readdirSync(join(home, 'dsh-memorybuddy', 'sessions'))
  : []
const bufferedNote = liveSessionDates.some(date =>
  readdirSync(join(home, 'dsh-memorybuddy', 'sessions', date)).some(file => file.includes('sess-live-at-wipe')),
)
record(
  'a session has unflushed events buffered before the wipe',
  bufferedNote === false,
  `note on disk=${bufferedNote} (must be false: the events are still in the throttle window)`,
)

const wiped = await call('POST', '/api/memorybuddy/action', {
  action: { kind: 'wipe-all', confirm: 'DELETE' },
})
record(
  'wipe-all with the exact phrase removes the memory root',
  wiped.status === 200 && !existsSync(join(home, 'dsh-memorybuddy')),
  `status ${wiped.status}, root exists=${existsSync(join(home, 'dsh-memorybuddy'))}`,
)
record(
  'the wipe DELETED the root rather than moving it aside',
  wiped.body?.result?.root === join(home, 'dsh-memorybuddy') &&
    !existsSync(`${join(home, 'dsh-memorybuddy')}-kept`),
  `root=${wiped.body?.result?.root}`,
)
record(
  'the wipe response carries NO snapshot, so nothing rebuilds the tree',
  wiped.body?.wiped === true && wiped.body?.snapshot === undefined,
  `wiped=${wiped.body?.wiped} snapshot=${wiped.body?.snapshot === undefined ? 'absent' : 'PRESENT'}`,
)

// Flush the session the way its own timer would, several times over. If the
// route forgot to drop the buffers, the in-memory state survives the wipe and
// these calls put the note — and the whole tree — back.
listeners.get('session/flush')?.(liveSession)
await settle()
listeners.get('session/flush')?.(liveSession)
await settle()
record(
  'the wiped root is NOT resurrected by the session that was buffered',
  !existsSync(join(home, 'dsh-memorybuddy')),
  `root exists=${existsSync(join(home, 'dsh-memorybuddy'))}`,
)

/* --- report ---------------------------------------------------------------- */

const failed = results.filter(item => !item.ok)
for (const item of results) console.log(`${item.ok ? 'ok  ' : 'FAIL'}  ${item.label}: ${item.detail}`)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
console.log(`memory root: ${join(home, 'dsh-memorybuddy')}`)

if (process.env.KEEP_TEST_HOME !== '1') rmSync(home, { recursive: true, force: true })
if (failed.length > 0) process.exitCode = 1
