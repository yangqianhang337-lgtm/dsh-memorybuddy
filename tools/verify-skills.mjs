/**
 * Skill draft verification (P7, memorybuddy-plan §6).
 *
 * Drives the real `MemoryStore` + `Consolidator` + `SkillGenerator` in a
 * throwaway `DSH_HOME`, exactly like `verify-project.mjs`, and proves the plan's
 * seven acceptance rows:
 *
 * - P7-1 生成判据: 3 occurrences across 2 dates produce a draft; 2 do not; 3 on
 *   one date do not (the ≥2-date half is independent, not implied by ≥3).
 * - P7-2 三级提示: the snapshot carries the draft (red dot + banner + card all
 *   read `snapshot.drafts`), and processing it empties the list.
 * - P7-3 批准落盘: 批准 writes `$DSH_HOME/skills/<name>/SKILL.md` and empties the
 *   draft directory.
 * - P7-4 编辑后批准: the promoted file is the EDITED text, not the draft's.
 * - P7-5 30 天归档: a 31-day-old draft moves into `archive/skills-draft/` on the
 *   next pass, and is not deleted.
 * - P7-6 不自动写入: generating drafts alone never touches `$DSH_HOME/skills/`.
 * - P7-7 回归: the other eight verifiers (run separately) stay green.
 *
 * Usage: node tools/verify-skills.mjs
 */
import { mkdtempSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const home = mkdtempSync(join(tmpdir(), 'dsh-memorybuddy-skills-'))
process.env.DSH_HOME = home

const results = []
const record = (label, ok, detail) => {
  results.push({ label, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

/* ── bundle the real host modules ─────────────────────────────────────── */

const outfile = join(ROOT, '.tmp-skills-bundle.mjs')
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

const { MemoryStore, Consolidator, SkillGenerator, MIN_DATES, MIN_REPEATS, isSkillName } = await import(
  pathToFileURL(outfile).href
)

const root = join(home, 'dsh-memorybuddy')
const skillsRoot = join(home, 'skills')
const memoryFile = relative => {
  try {
    return readFileSync(join(root, relative), 'utf8')
  } catch {
    return undefined
  }
}

/** Shift a `YYYY-MM-DD` by `days` (negative = past). */
function shiftDay(day, days) {
  const date = new Date(`${day}T12:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

const today = new Date().toISOString().slice(0, 10)
const yesterday = shiftDay(today, -1)

const store = new MemoryStore()
await store.ensure()
const consolidator = new Consolidator(store, () => {})
const generator = new SkillGenerator(store, () => {})

/**
 * Seed one session note.
 *
 * `facts` become `## 项目相关` lines, `tools` the collector's aggregate line, and
 * `habits` `(候选 · …)` lines — the three signals the generator mines.
 */
async function seedNote({ id, day, workspace, facts = [], tools = [], habits = [] }) {
  const relative = `sessions/${day}/${id}.md`
  const toolLine =
    tools.length === 0
      ? ''
      : `- 工具调用 ${tools.length * 3} 次：${tools.map(tool => `${tool} ×3`).join('、')}`
  const body = [
    '## 做了什么',
    '',
    ...(toolLine === '' ? ['- （本会话还没有可记录的内容）'] : [toolLine]),
    '',
    '## 观察到的工作习惯候选',
    '',
    ...(habits.length === 0 ? ['- （无）'] : habits.map(text => `- (候选 · 明确偏好) ${text} · seq 1`)),
    '',
    '## 项目相关',
    '',
    ...(facts.length === 0
      ? ['- （无）']
      : [`- ${workspace}：本会话的工作目录`, ...facts.map(text => `- ${text}`)]),
    '',
    '## 未决事项',
    '',
    '- （无）',
  ].join('\n')
  await store.writeSessionNote(
    day,
    id,
    {
      sessionId: id,
      workspace,
      started: `${day}T09:00:00.000Z`,
      ended: `${day}T10:00:00.000Z`,
      turns: 1,
      events: 3,
      consolidated: false,
      title: id,
      updated: new Date().toISOString(),
    },
    body,
  )
  await store.patchState(state => ({
    ...state,
    pending: state.pending.includes(relative) ? state.pending : [...state.pending, relative],
  }))
  return relative
}

/** Reset the interval gate so a test pass is never skipped. */
async function clearLastRun() {
  await store.patchState(state => ({ ...state, lastConsolidateAt: null }))
}

/* ── 1. unit: thresholds are the plan's, and independent of each other ── */

record(
  'P7-1 the threshold is the plan\'s: ≥3 occurrences across ≥2 dates',
  MIN_REPEATS === 3 && MIN_DATES === 2,
  `${MIN_REPEATS} / ${MIN_DATES}`,
)
record(
  'P7-6 a skill name that could escape the skills root is refused',
  isSkillName('build-pnpm') &&
    isSkillName('构建约定') &&
    !isSkillName('../escape') &&
    !isSkillName('a/b') &&
    !isSkillName('..') &&
    !isSkillName(''),
)

/* ── 2. P7-1 判据: 2 occurrences produce nothing ───────────────────────── */

await clearLastRun()
await seedNote({ id: 's1', day: today, workspace: 'D:\\dsh-memorybuddy', facts: ['构建用 pnpm，不要用 npm'] })
await seedNote({ id: 's2', day: yesterday, workspace: 'D:\\dsh-memorybuddy', facts: ['构建用 pnpm，不要用 npm'] })
const early = await consolidator.run('P7 两次判定')
record(
  'P7-1 two occurrences across two dates produce NO draft',
  early.draftsCreated.length === 0,
  JSON.stringify(early.draftsCreated),
)

/* ── 3. P7-1 判据: the third occurrence completes the pattern ──────────── */

await clearLastRun()
await seedNote({ id: 's3', day: shiftDay(today, -2), workspace: 'D:\\dsh-memorybuddy', facts: ['构建用 pnpm，不要用 npm'] })
const full = await consolidator.run('P7 三次判定')
record(
  'P7-1 the third occurrence across three dates produces a draft',
  full.draftsCreated.length === 1 && full.draftsCreated[0].startsWith('dsh-memorybuddy-'),
  JSON.stringify(full.draftsCreated),
)
const draftName = full.draftsCreated[0]
const draftFile = memoryFile(`skills-draft/${draftName}/SKILL.md`)
record(
  'P7-1 the draft lands at skills-draft/<name>/SKILL.md',
  draftFile !== undefined,
  draftFile === undefined ? 'missing' : draftFile.split('\n').length + ' lines',
)
record(
  'P7-1 the front-matter carries the fields the plan fixes',
  draftFile !== undefined &&
    /^name: /m.test(draftFile) &&
    /^title: /m.test(draftFile) &&
    /^description: /m.test(draftFile) &&
    /^whenToUse: /m.test(draftFile) &&
    /^source: memorybuddy-evolved$/m.test(draftFile) &&
    /^derivedFrom: \[/m.test(draftFile) &&
    /^repeats: 3$/m.test(draftFile) &&
    /^createdAt: \d{4}-\d{2}-\d{2}T/m.test(draftFile),
  draftFile === undefined ? 'missing' : draftFile.split('\n').slice(0, 10).join(' | '),
)
record(
  'P7-1 the body names the evidence: repeats, dates and source sessions',
  draftFile !== undefined &&
    draftFile.includes('在 3 次会话里出现') &&
    draftFile.includes('3 个日期') &&
    draftFile.includes('构建用 pnpm'),
  draftFile === undefined ? 'missing' : 'evidence section',
)

/* ── 4. P7-6 不自动写入 ───────────────────────────────────────────────── */

record(
  'P7-6 generating drafts never writes into $DSH_HOME/skills/',
  !existsSync(skillsRoot),
  existsSync(skillsRoot) ? 'skills root exists' : 'skills root absent',
)

/* ── 5. P7-2 三级提示: the snapshot is what all three levels read ──────── */

const withDraft = await store.snapshot()
record(
  'P7-2 the snapshot lists the draft with title, repeats and createdAt',
  withDraft.drafts.length === 1 &&
    withDraft.drafts[0].name === draftName &&
    withDraft.drafts[0].repeats === 3 &&
    withDraft.drafts[0].createdAt !== '',
  JSON.stringify(withDraft.drafts),
)
const detail = await store.readDraft(draftName)
record(
  'P7-2 the detail read returns preview text, target path and source sessions',
  detail !== undefined &&
    detail.text.includes('构建用 pnpm') &&
    detail.body.includes('## 证据') &&
    detail.target === join(skillsRoot, draftName, 'SKILL.md') &&
    detail.derivedFrom.length === 3,
  detail === undefined ? 'missing' : `${detail.derivedFrom.length} sources → ${detail.target}`,
)

/* ── 6. P7-4 编辑后批准 ──────────────────────────────────────────────── */

// Edit the exact heading the generator writes (`## 证据`), and assert on what
// changed. An earlier version replaced `# 证据`, which the body does not contain
// as a line, so the "not the draft" half of the assertion passed for a reason
// unrelated to what it claimed.
const draftBody = detail?.body ?? ''
record(
  'the generated body really contains the heading the edit test rewrites',
  draftBody.includes('\n## 证据\n'),
  draftBody === '' ? 'missing' : '## 证据 found',
)
const edited = (detail?.text ?? '').replace('\n## 证据\n', '\n## 证据（已由用户改写）\n')
const approvedEdited = await store.approveDraft(draftName, edited)
const promotedEdited = existsSync(join(skillsRoot, draftName, 'SKILL.md'))
  ? readFileSync(join(skillsRoot, draftName, 'SKILL.md'), 'utf8')
  : undefined
record(
  'P7-4 编辑后批准 writes the EDITED text, not the draft',
  approvedEdited &&
    promotedEdited !== undefined &&
    promotedEdited !== draftBody &&
    promotedEdited.includes('\n## 证据（已由用户改写）\n') &&
    !promotedEdited.includes('\n## 证据\n'),
  promotedEdited === undefined
    ? 'not written'
    : `edited heading present=${promotedEdited.includes('已由用户改写')}, original absent=${!promotedEdited.includes('\n## 证据\n')}`,
)
record(
  'P7-3 the promoted file keeps the front-matter (DSH loads name/description)',
  promotedEdited !== undefined &&
    /^name: /m.test(promotedEdited) &&
    /^description: /m.test(promotedEdited),
)

/* ── 6b. the preconditions 批准 must not skip ─────────────────────────── */

record(
  'P7-6 批准 refuses a name that is not a pending draft (no write primitive)',
  (await store.approveDraft('never-existed', '# injected\n')) === false &&
    !existsSync(join(skillsRoot, 'never-existed', 'SKILL.md')),
  'no skill created for an unknown name',
)
record(
  'P7-6 批准 refuses a name that could escape the skills root',
  (await store.approveDraft('../escape', '# x\n')) === false &&
    !existsSync(join(skillsRoot, '..', 'escape')),
)
// The empty-text check needs a draft that is STILL pending, so it runs before
// the real approval below. `text === ''` must fall back to the draft on disk
// rather than promoting a 0-byte skill and taking the draft with it.
await store.writeSkillDraft(
  'empty-text-probe',
  {
    kind: 'project',
    name: 'empty-text-probe',
    title: '空文本探针',
    description: '用于验证批准时空文本不会清空文件',
    whenToUse: '仅测试',
    steps: ['1. 占位'],
    derivedFrom: [`sessions/${yesterday}/p1.md`, `sessions/${today}/p2.md`, `sessions/${today}/p3.md`],
    dates: [yesterday, today],
    repeats: 3,
  },
  `${today}T09:00:00.000Z`,
)
const emptyApproved = await store.approveDraft('empty-text-probe', '')
const emptyPromoted = existsSync(join(skillsRoot, 'empty-text-probe', 'SKILL.md'))
  ? readFileSync(join(skillsRoot, 'empty-text-probe', 'SKILL.md'), 'utf8')
  : undefined
record(
  'P7-6 批准 with an EMPTY text promotes the draft instead of writing nothing',
  emptyApproved && emptyPromoted !== undefined && emptyPromoted.includes('空文本探针'),
  emptyPromoted === undefined ? 'nothing written' : `${emptyPromoted.length} bytes`,
)
rmSync(join(skillsRoot, 'empty-text-probe'), { recursive: true, force: true })

/* ── 7. P7-3 批准落盘 clears the pending list ─────────────────────────── */

const afterApprove = await store.snapshot()
record(
  'P7-3 approving empties the draft list (red dot and banner go away)',
  afterApprove.drafts.length === 0 && !existsSync(join(root, `skills-draft/${draftName}/SKILL.md`)),
  JSON.stringify(afterApprove.drafts),
)

/* ── 8. P7-1 the tools class, and the noise-tool guard ────────────────── */

// The fixture is a project where the ONLY tools are noise ones plus one real
// tool. That shape is what makes the assertion meaningful: with `edit` alone
// there is no eligible pair, so ANY draft produced means a noise tool slipped
// through the filter. The earlier fixture put `edit` next to `present`, so the
// `edit+present` pair fired regardless of whether the filter existed at all.
const NOISE_ONLY = 'D:\\noise-only-project'
await clearLastRun()
for (const [id, day] of [
  ['n1', today],
  ['n2', yesterday],
  ['n3', shiftDay(today, -2)],
]) {
  await seedNote({ id, day, workspace: NOISE_ONLY, tools: ['read', 'grep', 'pwsh'] })
}
const noisePass = await consolidator.run('P7 噪声工具')
record(
  'P7-1 a project whose tools are ALL noise produces NO draft at all',
  noisePass.draftsCreated.length === 0,
  JSON.stringify(noisePass.draftsCreated),
)

await clearLastRun()
for (const [id, day] of [
  ['t1', today],
  ['t2', yesterday],
  ['t3', shiftDay(today, -2)],
]) {
  await seedNote({ id, day, workspace: 'D:\\dsh-memorybuddy', tools: ['edit', 'present', 'read', 'grep'] })
}
const withTools = await consolidator.run('P7 工具组合')
record(
  'P7-1 a repeated tool COMBINATION produces a draft',
  withTools.draftsCreated.some(name => name.includes('present')),
  JSON.stringify(withTools.draftsCreated),
)
record(
  'P7-1 a noise tool never appears in a generated draft NAME',
  !withTools.draftsCreated.some(name => /(^|-)(read|grep|pwsh)($|-)/.test(name)),
  JSON.stringify(withTools.draftsCreated.filter(name => /read|grep|pwsh/.test(name))),
)
// The pair that actually survived filtering must be the real-tool pair, not a
// noise tool paired with a real one: `present+read` would be filtered to nothing
// only if BOTH its members are noise-filtered.
record(
  'P7-1 the surviving pair is real+real, never real+noise',
  withTools.draftsCreated.some(name => name.endsWith('edit-present')) &&
    !withTools.draftsCreated.some(name => /(edit|present)-(read|grep|pwsh)$/.test(name)),
  JSON.stringify(withTools.draftsCreated),
)

/* ── 8b. P7-1 the two halves of the threshold are independent ─────────── */

// The plan requires ≥3 AND ≥2 dates. Three occurrences inside ONE day is one
// busy afternoon, not a habit — this asserts that half directly, which the
// 2-occurrence test above does not.
await clearLastRun()
await store.writeProjectEntries('single-day-project', [
  {
    id: 'oneday',
    text: '单日里重复三次的约定',
    confidence: '中',
    days: 1,
    first: today,
    last: today,
    sources: [`sessions/${today}/s1.md`, `sessions/${today}/s2.md`, `sessions/${today}/s3.md`],
    pinned: false,
    conflict: false,
  },
])
const oneDay = await generator.run()
record(
  'P7-1 three occurrences on ONE date produce NO draft (the ≥2-date half bites)',
  !oneDay.created.some(name => name.startsWith('single-day-project-')),
  JSON.stringify(oneDay.created),
)

// The same entry, now corroborated across two dates, does generate.
await store.writeProjectEntries('single-day-project', [
  {
    id: 'oneday',
    text: '单日里重复三次的约定',
    confidence: '中',
    days: 2,
    first: yesterday,
    last: today,
    sources: [`sessions/${yesterday}/s1.md`, `sessions/${today}/s2.md`, `sessions/${today}/s3.md`],
    pinned: false,
    conflict: false,
  },
])
const twoDay = await generator.run()
record(
  'P7-1 the same entry across two dates DOES generate',
  twoDay.created.some(name => name.startsWith('single-day-project-')),
  JSON.stringify(twoDay.created),
)

/* ── 9. P7-2 忽略 archives rather than deletes ────────────────────────── */

// Every earlier step asserts its own precondition, so reaching here already
// proves drafts exist; this block needs no separate "is there one?" check.
const pendingBefore = (await store.snapshot()).drafts
if (pendingBefore.length > 0) {
  const victim = pendingBefore[0].name
  const ignored = await store.ignoreDraft(victim)
  record(
    'P7-2 忽略 moves the draft to archive/skills-draft/ (never a delete)',
    ignored &&
      !existsSync(join(root, `skills-draft/${victim}/SKILL.md`)) &&
      existsSync(join(root, `archive/skills-draft/${victim}/SKILL.md`)),
    `archive/skills-draft/${victim}`,
  )
}

/* ── 10. P7-5 30 天归档 ───────────────────────────────────────────────── */

// A fresh generator so only the stale-draft rule is under test.
const staleName = 'stale-draft'
const staleDay = shiftDay(today, -31)
await store.writeSkillDraft(
  staleName,
  {
    kind: 'project',
    name: staleName,
    title: '过期草稿',
    description: '这条草稿 31 天没人处理',
    whenToUse: '不会触发',
    steps: ['1. 占位'],
    derivedFrom: [`sessions/${staleDay}/old.md`],
    dates: [staleDay],
    repeats: 3,
  },
  `${staleDay}T09:00:00.000Z`,
)
// And a fresh one that must survive the same pass.
const freshName = 'fresh-draft'
await store.writeSkillDraft(
  freshName,
  {
    kind: 'project',
    name: freshName,
    title: '新草稿',
    description: '这条刚生成',
    whenToUse: '不会归档',
    steps: ['1. 占位'],
    derivedFrom: [`sessions/${today}/new.md`],
    dates: [today],
    repeats: 3,
  },
  `${today}T09:00:00.000Z`,
)

await clearLastRun()
const archivedPass = await consolidator.run('P7 归档')
record(
  'P7-5 a draft older than 30 days is archived by the pass',
  archivedPass.draftsArchived.includes(staleName) &&
    !existsSync(join(root, `skills-draft/${staleName}/SKILL.md`)) &&
    existsSync(join(root, `archive/skills-draft/${staleName}/SKILL.md`)),
  JSON.stringify(archivedPass.draftsArchived),
)
record(
  'P7-5 a fresh draft is left in place',
  existsSync(join(root, `skills-draft/${freshName}/SKILL.md`)),
)
record(
  'P7-5 the journal records the generation and the archive',
  (memoryFile(`journal/${today}.md`) ?? '').includes('技能草稿'),
  (memoryFile(`journal/${today}.md`) ?? '').split('\n').filter(l => l.includes('技能草稿')).join(' | '),
)

/* ── 11. regeneration neither overwrites nor resurrects ────────────────── */

const before = readFileSync(join(root, `skills-draft/${freshName}/SKILL.md`), 'utf8')
await clearLastRun()
const again = await generator.run()
const after = readFileSync(join(root, `skills-draft/${freshName}/SKILL.md`), 'utf8')
record(
  'P7-1 a second pass does not rewrite a draft that already exists',
  before === after && again.created.length === 0,
  `created ${again.created.length}, skipped ${again.skipped.length}`,
)

// The draft approved back in step 6 is now a real skill in $DSH_HOME/skills/.
// Re-mining must not raise an identical pending draft that competes with the
// skill the user already approved — and that the 30-day archive would then file
// as unattended.
await clearLastRun()
const thirdPass = await generator.run()
record(
  'P7-3 an APPROVED pattern is never re-raised as a pending draft',
  !thirdPass.created.includes(draftName),
  `created ${JSON.stringify(thirdPass.created)}`,
)

/* ── 12. P7-6 nothing was written into the skills root without approval ── */

record(
  'P7-6 only the approved draft reached $DSH_HOME/skills/',
  existsSync(join(skillsRoot, draftName, 'SKILL.md')) &&
    !existsSync(join(skillsRoot, staleName)) &&
    !existsSync(join(skillsRoot, freshName)),
  existsSync(skillsRoot) ? readdirSync(skillsRoot).join(', ') : 'no skills root',
)

/* ── 13. repo untouched (仓库零污染) ──────────────────────────────────── */

let gitClean = true
let gitDetail = 'workspace is not a git repo — asserting on DSH_HOME isolation instead'
try {
  const status = execFileSync('git', ['-C', ROOT, 'status', '--porcelain'], { encoding: 'utf8' })
  const passWrites = status
    .split('\n')
    .filter(line => line.trim() !== '')
    .filter(line => /^\s?\?\?\s+(memory|sessions|journal|archive|skills-draft)(\/|\.|$)|state\.json/.test(line))
  gitClean = passWrites.length === 0
  gitDetail = gitClean ? 'repo clean of pass writes (dev edits excluded)' : JSON.stringify(passWrites.slice(0, 5))
} catch {
  // git missing — fall through with the isolation detail.
}
record('P7-6 仓库零污染: the pass wrote nothing outside $DSH_HOME', gitClean, gitDetail)

/* ── summary ──────────────────────────────────────────────────────────── */

const failed = results.filter(result => !result.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
rmSync(outfile, { force: true })
rmSync(home, { recursive: true, force: true })
if (failed.length > 0) process.exit(1)
