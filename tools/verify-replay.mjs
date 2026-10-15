/**
 * Replay verification against the app's OWN session log.
 *
 * The smoke test (verify-host.mjs) feeds hand-written fixtures, so it can only
 * prove the collector agrees with its author's assumptions. This one decodes a
 * real `session.v4.jsonl.zstd`, replays every event through the real
 * SessionCollector, and reads the note back off disk — the only way to catch a
 * shape mismatch between the collector and the wire.
 *
 * Usage: node tools/verify-replay.mjs <path-to-session.v4.jsonl.zstd>
 */
import { mkdtempSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { zstdDecompressSync } from 'node:zlib'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const logPath = process.argv[2]
if (logPath === undefined) {
  console.error('usage: node tools/verify-replay.mjs <session.v4.jsonl.zstd>')
  process.exit(2)
}

/* ── decode the multi-frame zstd log ──────────────────────────────────── */
const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
function decodeZstd(file) {
  const buffer = readFileSync(file)
  const starts = []
  let index = buffer.indexOf(MAGIC, 0)
  while (index !== -1) {
    starts.push(index)
    index = buffer.indexOf(MAGIC, index + 4)
  }
  const chunks = []
  for (let i = 0; i < starts.length; i += 1) {
    const end = i + 1 < starts.length ? starts[i + 1] : buffer.length
    try {
      chunks.push(zstdDecompressSync(buffer.subarray(starts[i], end)).toString('utf8'))
    } catch {
      // A trailing partial frame is normal while a session is still live.
    }
  }
  return chunks.join('')
}

const text = decodeZstd(logPath)
const lines = text.split('\n').filter(line => line.trim() !== '')
const events = []
let header
for (const line of lines) {
  let parsed
  try {
    parsed = JSON.parse(line)
  } catch {
    continue
  }
  if (parsed.type === 'session') {
    header = parsed
    continue
  }
  if (typeof parsed.type === 'string' && typeof parsed.seq === 'number') events.push(parsed)
}

console.log(`decoded ${lines.length} lines → ${events.length} events`)

/* ── bundle the collector against a throwaway DSH_HOME ────────────────── */
const home = mkdtempSync(join(tmpdir(), 'dsh-memorybuddy-replay-'))
process.env.DSH_HOME = home

const outfile = join(ROOT, '.tmp-replay-bundle.mjs')
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

const { SessionCollector, MemoryStore } = await import(pathToFileURL(outfile).href)

const store = new MemoryStore()
await store.ensure()

const collector = new SessionCollector({ store, enabled: () => true, log: message => console.log(`[log] ${message}`) })
const target = { id: header?.id ?? 'replay-session', header: { cwd: header?.cwd ?? '' } }

collector.adopt([target])
for (const event of events) {
  collector.observe(target, { type: event.type, seq: event.seq, time: event.time, data: event.data })
}
await collector.flush(target)
await new Promise(resolve => setTimeout(resolve, 300))

/* ── read the note back ───────────────────────────────────────────────── */
const root = join(home, 'dsh-memorybuddy')
const sessionRoot = join(root, 'sessions')
const days = existsSync(sessionRoot) ? readdirSync(sessionRoot, { withFileTypes: true }).filter(e => e.isDirectory()) : []
const notePath = days.length === 0 ? undefined : join(sessionRoot, days[0].name, `${target.id}.md`)
const note = notePath === undefined || !existsSync(notePath) ? '' : readFileSync(notePath, 'utf8')

console.log('\n════════ NOTE ════════')
console.log(note)

/* ── assertions ───────────────────────────────────────────────────────── */
const results = []
const record = (label, ok, detail) => {
  results.push({ label, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

const userMessages = events.filter(e => e.type === 'user/message' && e.data?.source?.kind === 'user')
const assistantMessages = events.filter(e => e.type === 'assistant/message')
const toolCalls = events.filter(e => e.type === 'tool/call')
const toolResults = events.filter(e => e.type === 'tool/result')
const turnEnds = events.filter(e => e.type === 'turn/end')

record('the log really contains the shapes under test', userMessages.length > 0 && assistantMessages.length > 0 && toolResults.length > 0,
  `${userMessages.length} user, ${assistantMessages.length} assistant, ${toolResults.length} tool/result, ${turnEnds.length} turn/end`)
record('a note was written', note !== '', notePath ?? 'no note')

const turns = /^turns: (\d+)$/m.exec(note)?.[1]
record('turns matches the real turn/end count', turns === String(turnEnds.length), `note says ${turns}, log has ${turnEnds.length}`)

record('the note is not empty any more', !note.includes('本会话还没有可记录的内容'), '')
record('the first user message appears verbatim', userMessages.length === 0 || note.includes(userMessages[0].data.content[0].text.slice(0, 30)), '')
record('assistant text appears as 助手：', note.includes('- 助手：'), '')
record('tool names were resolved from tool/call', /- 工具调用 read（成功）|- read（/.test(note) || /read/.test(note), '')

const unresolvedTools = (note.match(/工具调用（/g) ?? []).length
record('no tool line fell back to an unattributed 工具调用', unresolvedTools === 0, `${unresolvedTools} unattributed`)

const title = /^title: (.+)$/m.exec(note)?.[1]
record('the title is the first real user message, not a truncated id', title !== 'session-' && title !== undefined && title !== target.id.slice(0, 8), `title: ${title}`)

record('no tool payload leaked into the note', !note.includes('SECRET') && !note.includes('"file_path"'), '')

/* ── scenario 2: the plugin mounts LATE into an in-flight session ─────── */
// This is the case the live app actually hit: `session/event` only delivers
// what happens from subscription onward, so a session thousands of events deep
// produced a note claiming `turns: 0`. The collector must replay the log it
// slept through, via the session's own `snapshotEvents`.
{
  const late = new SessionCollector({ store, enabled: () => true, log: message => console.log(`[late] ${message}`) })
  const cut = Math.floor(events.length / 2)
  const lateTarget = {
    id: header?.id ?? 'replay-session',
    header: { cwd: header?.cwd ?? '' },
    // Only the first half was visible to the collector's constructor.
    snapshotEvents: (from = 0, to = events.length) => events.filter(e => e.seq >= from && e.seq < to && e.seq < cut),
  }
  late.adopt([lateTarget])
  for (const event of events) {
    if (event.seq >= cut) late.observe(lateTarget, { type: event.type, seq: event.seq, time: event.time, data: event.data })
  }
  await late.flush(lateTarget)
  await new Promise(resolve => setTimeout(resolve, 300))

  const lateNote = existsSync(notePath) ? readFileSync(notePath, 'utf8') : ''
  const lateTurns = /^turns: (\d+)$/m.exec(lateNote)?.[1]
  record('a late mount still records the turns it slept through', lateTurns === String(turnEnds.length),
    `note says ${lateTurns}, log has ${turnEnds.length}`)
  // The title in the front matter repeats the first user message on purpose, so
  // only dialogue lines are counted here.
  const dialogueHits = (lateNote.match(/^- .*现在根据本项目夹的memory-plan\.md进行开发P0到P3/gm) ?? []).length
  record('a late mount does not double-count the replayed user message', dialogueHits === 1,
    `${dialogueHits} dialogue line(s)`)
  record('a late mount still resolves tool names', !lateNote.includes('工具调用（'), '')
  record('the replayed note is not empty', !lateNote.includes('本会话还没有可记录的内容'), '')
}

const failed = [...results].filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
rmSync(home, { recursive: true, force: true })
rmSync(outfile, { force: true })
process.exitCode = failed.length === 0 ? 0 : 1
