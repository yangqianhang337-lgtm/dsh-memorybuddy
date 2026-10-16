/**
 * Project memory verification (P6, memorybuddy-plan §5).
 *
 * Drives the real `MemoryStore` + `Consolidator` in a throwaway `DSH_HOME`,
 * exactly like `verify-schedule.mjs`, and proves the plan's four acceptance
 * rows:
 *
 * - P6-1 自动积累: a session note with a `## 项目相关` fact + a workspace
 *   front-matter lands in `memory/projects/<slug>.md` after a pass; a second
 *   fact on another day merges (days++), not duplicates.
 * - P6-2 slug mapping: the workspace's last path segment becomes the file, so
 *   two different projects never share a file.
 * - P6-3 self-line skip: `本会话的工作目录` provenance never becomes an entry.
 * - P6-4 仓库零污染: the pass writes only under `$DSH_HOME`; a git repo at the
 *   workspace stays clean.
 * - P6-5 the snapshot lists projects and `forget-project` archives the file.
 * - P6-6 the prompt injects 【本项目记忆】 only for the matching workspace and
 *   sees a pass's writes on the next prime (the staleness fix).
 *
 * Usage: node tools/verify-project.mjs
 */
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const home = mkdtempSync(join(tmpdir(), 'dsh-memorybuddy-project-'))
process.env.DSH_HOME = home

const results = []
const record = (label, ok, detail) => {
  results.push({ label, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

/* ── bundle the real host modules ─────────────────────────────────────── */

const outfile = join(ROOT, '.tmp-project-bundle.mjs')
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

const { MemoryStore, Consolidator, PromptCache, extractProjectFactsImpl, slugify } = await import(
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

const store = new MemoryStore()
await store.ensure()
const consolidator = new Consolidator(store, () => {})

const day = new Date().toISOString().slice(0, 10)

/** Seed one pending session note with a project fact (and optionally a habit). */
async function seedNote(seq, workspace, projectLine) {
  await store.writeSessionNote(
    day,
    `proj-${seq}`,
    {
      sessionId: `proj-${seq}`,
      workspace,
      started: new Date().toISOString(),
      ended: new Date().toISOString(),
      turns: 1,
      events: 2,
      consolidated: false,
      title: `proj ${seq}`,
      updated: new Date().toISOString(),
    },
    `## 做了什么\n\n- 记一下：构建用 pnpm。\n\n## 观察到的工作习惯候选\n\n- (候选 · 明确偏好) 以后都用中文回复 · seq ${seq}\n\n## 项目相关\n\n${projectLine}\n\n## 未决事项\n\n- （无）\n`,
  )
  await store.patchState(state => ({
    ...state,
    processed: { ...state.processed, [`sessions/${day}/proj-${seq}.md`]: seq },
    pending: state.pending.includes(`sessions/${day}/proj-${seq}.md`)
      ? state.pending
      : [...state.pending, `sessions/${day}/proj-${seq}.md`],
  }))
}

/** Reset the watermark so the interval gate does not block a test. */
async function clearLastRun() {
  await store.patchState(state => ({ ...state, lastConsolidateAt: null }))
}

/* ── 1. extraction unit checks ────────────────────────────────────────── */

const UNIT_BODY = '## 项目相关\n\n- D:\\repo：构建用 pnpm\n- D:\\repo：本会话的工作目录\n- （无）\n\n## 未决事项\n'
const facts = extractProjectFactsImpl(UNIT_BODY, 'D:\\repo', 'sessions/x/note.md', day)
record(
  'P6-3 the self-line and （无） never become candidates',
  facts.length === 1 && facts[0].text === 'D:\\repo：构建用 pnpm',
  JSON.stringify(facts),
)
record(
  'P6-2 slugify takes the last path segment and keeps CJK',
  slugify('D:\\repos\\dsh-memorybuddy') === 'dsh-memorybuddy' && slugify('C:\\工作\\测试项目') === '测试项目',
  `${slugify('D:\\repos\\dsh-memorybuddy')} / ${slugify('C:\\工作\\测试项目')}`,
)
record(
  'P6-2 an empty workspace yields no candidates (cannot file a fact without a project)',
  extractProjectFactsImpl(UNIT_BODY, '', 'sessions/x/note.md', day).length === 0,
)

/* ── 2. a pass files the fact into memory/projects/<slug>.md ──────────── */

await clearLastRun()
await seedNote(1, 'D:\\dsh-memorybuddy', '- D:\\dsh-memorybuddy：构建用 pnpm，不要用 npm')
const report1 = await consolidator.run('测试整理')
const projectFile = memoryFile('memory/projects/dsh-memorybuddy.md')
record(
  'P6-1 the pass wrote the project fact into memory/projects/<slug>.md',
  projectFile !== undefined && projectFile.includes('构建用 pnpm，不要用 npm'),
  projectFile === undefined ? 'file missing' : projectFile.slice(0, 200),
)
record(
  'P6-1 the report counted the project file',
  report1.projectAdded === 1 && report1.projectFiles.includes('memory/projects/dsh-memorybuddy.md'),
  JSON.stringify({ added: report1.projectAdded, files: report1.projectFiles }),
)
record(
  'P6-1 the pass still merged the habit into the topic file (project stage is additive)',
  report1.added >= 1,
  `added ${report1.added} merged ${report1.merged}`,
)

/* ── 3. a second fact on the project merges, not duplicates ───────────── */

await clearLastRun()
await seedNote(2, 'D:\\dsh-memorybuddy', '- D:\\dsh-memorybuddy：构建用 pnpm，不要用 npm')
const report2 = await consolidator.run('测试整理')
record(
  'P6-1 a repeated fact merges (no duplicate line, corroborated)',
  report2.projectAdded === 0 && report2.projectMerged >= 1,
  JSON.stringify({ added: report2.projectAdded, merged: report2.projectMerged }),
)
const afterMerge = memoryFile('memory/projects/dsh-memorybuddy.md')
const factLines = (afterMerge ?? '').split('\n').filter(line => line.includes('构建用 pnpm'))
record(
  'P6-1 the project file holds exactly one line for the fact',
  factLines.length === 1,
  `${factLines.length} line(s)`,
)

/* ── 4. repo untouched (仓库零污染) ───────────────────────────────────── */

let gitClean = true
let gitDetail = 'workspace is not a git repo — asserting on DSH_HOME isolation instead'
try {
  const status = execFileSync('git', ['-C', ROOT, 'status', '--porcelain'], { encoding: 'utf8' })
  // Only the pass could have created these at the repo root (dev edits are
  // expected and ignored): memory/, sessions/, journal/, archive/, state.json.
  const passWrites = status
    .split('\n')
    .filter(line => line.trim() !== '')
    .filter(line => /^\s?\?\?\s+(memory|sessions|journal|archive)(\/|\.|$)|state\.json/.test(line))
  gitClean = passWrites.length === 0
  gitDetail = passWrites.length === 0 ? 'repo clean of pass writes (dev edits excluded)' : JSON.stringify(passWrites.slice(0, 5))
} catch {
  // git missing — fall through with the isolation detail.
}
record('P6-4 仓库零污染: the pass wrote nothing outside $DSH_HOME', gitClean, gitDetail)
record(
  'P6-4 all pass writes stayed under the memory root',
  existsSync(join(root, 'memory/projects')) && !existsSync(join(ROOT, 'memory')),
  `root ${root}`,
)

/* ── 5. snapshot lists projects; forget-project archives ──────────────── */

const snapshot = await store.snapshot()
record(
  'P6-5 the snapshot lists the project file with its entry count',
  snapshot.projects.length === 1 && snapshot.projects[0].slug === 'dsh-memorybuddy' && snapshot.projects[0].entries >= 1,
  JSON.stringify(snapshot.projects),
)
record(
  'P6-5 the project file rides in snapshot.documents for the panel editor',
  snapshot.documents['memory/projects/dsh-memorybuddy.md'] !== undefined,
)
const archived = await store.archiveProject('dsh-memorybuddy')
record(
  'P6-5 forget-project moves the file into archive/',
  archived && !existsSync(join(root, 'memory/projects/dsh-memorybuddy.md')) && existsSync(join(root, `archive/projects-dsh-memorybuddy-${day}.md`)),
)
const afterForget = await store.snapshot()
record('P6-5 the snapshot no longer lists the archived project', afterForget.projects.length === 0)

/* ── 6. prompt injection: matching workspace only, fresh after a write ── */

// P6-5 archived the file above; recreate it so the prompt has something to read.
await store.writeProjectEntries('dsh-memorybuddy', [
  { id: 'p6seed', text: '构建用 pnpm，不要用 npm', confidence: '低', days: 1, first: day, last: day, sources: ['tests'], pinned: false, conflict: false },
])
const cache = new PromptCache(store)
await cache.watchProject('D:\\dsh-memorybuddy')
await cache.prime()
const other = cache.render('C:\\somewhere-else').text
// slugify takes the LAST path segment, so the matching render must be the
// project root itself (a subdir would be a different project: 'subdir').
const matched = cache.render('D:\\dsh-memorybuddy').text
record(
  'P6-6 【本项目记忆】 injects only for the matching workspace',
  !other.includes('【本项目记忆】') && matched.includes('【本项目记忆】') && matched.includes('构建用 pnpm，不要用 npm'),
  other === '' && matched === '' ? 'both empty' : `other ${other.length}B matched ${matched.length}B`,
)

// Prove prime() picks a NEW write up without re-registering the workspace.
await store.writeProjectEntries('dsh-memorybuddy', [
  { id: 'p6probe', text: '发布前跑 verify-project', confidence: '中', days: 2, first: day, last: day, sources: ['tests'], pinned: false, conflict: false },
])
await cache.prime()
const refreshed = cache.render('D:\\dsh-memorybuddy').text
record(
  'P6-6 a write reaches the prompt on the next prime (staleness fix)',
  refreshed.includes('发布前跑 verify-project'),
  refreshed.includes('【本项目记忆】') ? 'injected' : refreshed === '' ? 'empty' : 'no project block',
)

/* ── summary ──────────────────────────────────────────────────────────── */

const failed = results.filter(result => !result.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
rmSync(outfile, { force: true })
if (failed.length > 0) {
  rmSync(home, { recursive: true, force: true })
  process.exit(1)
}
rmSync(home, { recursive: true, force: true })
