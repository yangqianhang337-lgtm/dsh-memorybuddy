# MemoryBuddy 后续开发计划（memorybuddy-plan.md）

> 状态：**P5 已交付（0.4.0）**，P6–P8 待你过目确认（确认前不改代码）
> 前置：`memory-plan.md` 的 **P0–P3 已交付**（0.1.0），项目已于 2026-10-16 更名为 **memorybuddy**（0.2.0，见 `update-plan.md`）。
> 本文用途：把 `memory-plan.md` §9.2 的 P4–P8 路线图**按代码实况重新切分**，作为 P3 之后开发的唯一参照。
> 与旧计划的关系：**本文覆盖并取代 `memory-plan.md` §9.2**；§9.1（P0–P3）已完成，仅作历史记录。
>
> **进度**：§3（P4 自动整合闭环）已于 0.3.0 交付；§4（P5 模型提炼）已于 0.4.0 交付，
> 验收 30/30 + 全套回归绿 + 真机实测（真实模型调用成功、冷却/回退/白名单均验证）通过；
> 下一阶段是 §5（P6 项目级记忆）。
>
> **P5 实测要点**（详见 §4.8 结果列与 CHANGELOG 0.4.0）：`prepareCall` 句柄必须用**解析后配置**分发
> （否则 `INVALID_PREPARED_CALL`）；消息 `content` 必须是**类型化块数组**（否则 `content.some is not a function`）；
> 免费档必须与运行时枚举取交集（池账号不是运行时 provider）；`applied: 0`（确定性已合并、模型返回空 diff）
> 是正常结果，不上浮问题。

---

## 0. 一句话

P0–P3 真正交付的比计划多：`memory-plan.md` 划给 P4/P5 的**提炼与注入其实已经在 0.1.0 里做完了**。
真正缺的是**让系统自转起来的那一环**——触发调度、模型提炼、审计回滚、项目记忆写入、技能草稿生成、隐私收尾。
所以后续不是"继续做 P4、P5"，而是：**P4 自动整合闭环 → P5 模型提炼 → P6 项目记忆 → P7 技能进化 → P8 隐私与发布**。

---

## 1. 现状盘点（0.2.0，commit `2f65925`，工作树干净）

### 1.1 已经交付、**不要重做**的能力

| 能力 | 落点 | 说明 |
|---|---|---|
| 存储层 | `src/host/store.ts` 576 行 | `$DSH_HOME/dsh-memorybuddy/`、front-matter、原子写、文件锁、409 冲突回带盘上文本 |
| 采集 | `src/host/collector.ts` 579 行 | `session/event` 订阅、5s/20 事件节流、`session/flush` 排空、挂载时补齐（`snapshotEvents`）、开关关闭即停 |
| 会话笔记 | `renderBody()` | 四段式：`做了什么` / `观察到的工作习惯候选` / `项目相关` / `未决事项` |
| **写入判据**（原 P4） | `collector.ts:57-63` `PREFERENCE_PATTERNS` | 6 类标签：明确偏好×2、回复风格、纠错、硬约束、决策 |
| **去重合并**（原 P4） | `src/host/entries.ts` `similarity()` | 字符 bigram 的 Jaccard，`MERGE_THRESHOLD = 0.75`，无需中文分词依赖 |
| **冲突检测**（原 P4） | `entries.ts` `contradicts()` | 相似度 ≥0.5 且否定词翻转，保守策略（宁可漏问，不可错问） |
| **置信度阶梯**（原 P4） | `entries.ts` + `state.json` | 低 1 天 / 中 2–3 天 / 高 ≥4 天；只有中/高（或 pinned）进 `index.md` 与系统提示 |
| **衰减归档**（原 P4） | `consolidate.ts` `DECAY_DAYS` | 低 30 天 / 中 90 天 / 高不衰减；`STALE_QUESTION_DAYS = 180` 会提问 |
| **index.md 生成**（原 P4） | `consolidate.ts` `rebuildIndex()` | 分节渲染 + front-matter 水位 |
| **脱敏**（原 P4） | `store.ts` `SECRET_PATTERNS` | 6 类正则 → `［已隐去］`，命中即**拒绝落盘**并记警告 |
| **系统提示注入**（原 P5） | `src/host/prompt.ts` | `SECTION_NAME = 'plugin:memorybuddy'`、`SECTION_ORDER = 120`、`interpolate: false` |
| **预算截断**（原 P5） | `prompt.ts` `fitIndex()` | 人设 800 B / 指令 800 B / 索引 `promptBudgetBytes`(4096) / 项目 1200 B；按"工作背景 > 行事风格 > 环境路径 > 项目索引"从最不重要端丢整节 |
| **三个智能体工具**（原 P5） | `src/index.ts:257/306/374` | `memorybuddy_recall` / `memorybuddy_remember` / `memorybuddy_forget`，受 `localMemorySkills` 开关控制 |
| **`/memory` 命令** | `src/index.ts:630` | `状态` / `整理` |
| **确定性整合**（原 P6 前半） | `src/host/consolidate.ts` 403 行 | 先备份 → 合并 → 衰减 → 重建索引 → 写 journal → **最后**才清 pending 水位 |
| **备份与日志**（原 P6 后半） | `store.backup()` / `appendJournal()` | `journal/<date>/backup/` 与 `journal/<date>.md` |
| **技能草稿的读写与批准**（原 P7 后半） | `store.readDrafts/approveDraft/discardDraft` | `skills-draft/<name>/SKILL.md` → 批准写入 `$DSH_HOME/skills/<name>/SKILL.md`（`skill-filesystem` 的 `user-dsh` 根，rank 400，自动发现） |
| **草稿 UI**（原 P7 后半） | `src/client/memory.tsx:68-105`、`panel.tsx` | 待批准卡片 + 顶部横幅 + 侧边栏红点 |

### 1.2 文档宣称、代码里**并不存在**的（本文要补的就是这些）

> 下表是 **0.2.0 时的盘点**（本文的立项依据）。P4 已修掉缺口 1、5、6、7、10，并在原表下方标注了结果。

| # | 缺口 | 证据 | P4 后 |
|---|---|---|---|
| 1 | **触发调度完全不存在** | `consolidator.run()` 全仓只有两个调用点：`src/index.ts:640`（`/memory 整理`）与 `src/host/routes.ts:174`（面板「立即整理」）。`consolidateOn` / `consolidateIntervalHours` / `consolidateIdleMinutes` / `consolidateFixedTime` 只被**解析和显示**（`store.ts:214-216,528`、`memory.tsx:56-63`），没有任何代码消费它们。`README.md:145-158` 的四种触发是**空头承诺**。 | ✅ 已修（§3.2 A，`src/host/schedule.ts`） |
| 2 | **模型提炼不存在** | 全仓无 `llm` 使用：`openOneShotStream` / `prepareCall` / `resolveModelInfo` 零命中。`modelPolicy` / `modelAllowlist` 只解析+显示；`state.modelCooldown` 建了结构但**从未写入**。`consolidate.ts:373` 硬编码 `模型提炼：未启用（首版只做确定性整理）`，`protocol.ts` 里 `MemorySnapshot.consolidation.modelStage` 的类型就是字面量 `'disabled'`。 | ✅ 已修（§4，`src/host/distill.ts` + `src/host/model-picker.ts`，0.4.0） |
| 3 | **技能草稿没有生产者** | `readDrafts` / `approveDraft` / `discardDraft` + 卡片 + 红点全都在，但**没有任何代码往 `skills-draft/` 里写**。`DraftView.repeats` / `createdAt` 只被读，没有写方。 | ⬜ P7 |
| 4 | **项目级记忆没有写入方** | `memory/projects/<slug>.md` 只被 `prompt.ts:117-134` 读（`renderProject` 截断 1200 B）与 `watchProject()` 懒加载；`ensure()` 只建目录。`slugify()` 在 `prompt.ts:138` 定义但没有任何写入路径。 | ⬜ P6 |
| 5 | **历史 / 回滚没有 UI** | `appendJournal` 与 `backup()` 写了数据，但**没有客户端读它们**，`MemoryAction` 里也没有 rollback / reset-all 类型。 | ✅ 已修（§3.2 C） |
| 6 | **「重置」名不副实** | `memory.tsx:187` 硬编码 `onAction({kind:'reset-document', path:'memory/index.md'})`——只重置索引骨架，不是 `memory-plan.md` §6.3 要求的"归档全部到 `archive/reset-<时间戳>/` 再重建"。 | ✅ 已修（§3.2 D） |
| 7 | **冲突提问上不了 UI** | `report.questions` 会被生成（`consolidate.ts:270,310`），但只写进 journal 文本（`:375-377`）；`MemorySnapshot` 没有 questions 字段，面板看不到。 | ✅ 已修（§3.2 B） |
| 8 | **`no-memory` 标记与 PII 检测缺失** | 只有 6 条密钥正则；`memory-plan.md` §5.2 黑名单第 2、6 条未实现。 | ⬜ P8 |
| 9 | **P8 收尾未做** | 彻底删除（二次确认 + 手打 `DELETE`）没有；Gitee 仓库未建（`git remote -v` 为空，无 tag）。 | ⬜ P8 |
| 10 | **`writeState()` 无文件锁（潜伏的数据丢失风险）** | `store.ts:187` 只有 `writeFileAtomic`，没有 `withFileLock`；而 `consolidate.ts`（`:165` 读 / `:233` 写）与 `collector.ts`（`:562` 读 / `:567` 写）都是「读-改-写」。当前窗口是毫秒级所以没撞上，**任何在读写之间插入 `await` 的改动都会让它变成真丢数据**。 | ✅ 已修（§4.3） |

### 1.3 立项时的实测证据（0.2.0）

```
npx tsc --noEmit -p tsconfig.json   → exit 0
node build.mjs                      → dsh-memorybuddy 0.2.0: built lib/index.js and lib/client.js
node tools/verify-bundle.mjs        → 10/10
node tools/verify-client-factory.mjs→ 13/13
node tools/verify-headless.mjs      → 11 passed, 0 failed
node tools/verify-host.mjs          → 35/35
node tools/verify-replay.mjs <已结束的 18.5 MB 真实日志> → 14/14
```

**0.3.0（P4 交付后）的基线**：`verify-host` **49/49**、新增 `verify-schedule` **14/14**，其余不变；真机实测另见 §3.3。

运行态：插件以 `SymbolicLink` 装在 `C:\Users\A3373\.dsh\profiles\desktop\node_modules\dsh-memorybuddy` → `D:\dsh-memorybuddy`，所以**宿主半边改动只需 `node build.mjs` + 重启 DSH**；浏览器半边可热重载。

数据目录 `C:\Users\A3373\.dsh\dsh-memorybuddy\` 现有 7 份会话笔记，`state.json` 里 `lastConsolidateAt: null`、`pending` 7 条——**整合从未跑过一次**（这正是 P4 要解决的第一件事）。

---

## 2. 阶段重切（取代 `memory-plan.md` §9.2）

| 新阶段 | 名称 | 一句话 | 对应旧编号 | 预估 | 状态 |
|---|---|---|---|---|---|
| **P4** | 自动整合闭环 | 让已经能跑的确定性整合**自己跑起来**，并且**看得见、撤得回** | P6 前半 + 新 | 中 | ✅ 0.3.0 |
| **P5** | 模型提炼 | 在 P4 的两阶段骨架上接模型阶段：**用户自选优先** → 免费优先候选链 → 冷却 → 失败降级 | P6 后半 | 大 | ✅ 0.4.0 |
| **P6** | 项目级记忆 | `memory/projects/<slug>.md` 从只读变可写，并上 UI | 新 | 中 | ⬜ 下一阶段 |
| **P7** | 技能进化 | 草稿生成器（≥3 次 / ≥2 日期）+ 详情页 + 编辑后批准 + 30 天归档 | P7 前半 | 中 | ⬜ |
| **P8** | 隐私收尾与发布 | 彻底删除、`no-memory`、PII、文档对齐、Gitee | P8 | 小 | ⬜ |

**排序理由**：P4 先把闭环合上——否则 P5 的模型阶段无处挂载；P5 会引入**不可预测的自动写入**，所以 P4 必须先把回滚与可观测性做出来；P7 的输入是 P4/P5 的整合产物；P8 收口。

**P4 的实际收益（已兑现）**：数据目录里积压的 7 份会话笔记在影子实例启动 90 秒后被自动整理掉，产出第一条真实记忆条目；面板从此能看到「整理做了什么」（journal 文本 + 备份文件清单）并一键回滚。**P4 也让 §4.3 的并发缺陷提前修掉了**——那本是 P5 的前置任务，但它与触发调度同源（两者都引入「读-改-写之间夹 await」），所以并到 P4 一起做更省事。

**P5 的实际收益（已兑现）**：真实模型调用端到端打通（`deepseek-account/deepseek-flash`，322–470 token/轮），
候选经确定性合并后模型正确返回空 diff；冷却表单层键、自选/回退/白名单/`off` 全部真机验证。
实现中发现的两个**运行时契约**与计划写的不同，已回写 §4.2：prepared 句柄必须按**解析后配置**分发；
消息 `content` 必须是**类型化块数组**。免费档还必须与运行时枚举取交集——池目录里的账号名不是运行时 provider id。

---

## 3. P4 · 自动整合闭环

### 3.1 目标

让 `consolidator.run()` 在四种时机自动触发，把「整理做了什么」暴露到面板，并让用户能**一键撤回**任何一次自动整理。

### 3.2 改动清单

> **已交付状态**：本节四项全部实现于 0.3.0。落地时相对原设计有三处修正，已回写到下面（标 **实测修正**）。

**A. 新增 `src/host/schedule.ts`（触发调度器）**

```ts
// 实际签名：时钟在类内部，不再由 host 提供 lastEventAt（见「实测修正 1」）
export interface SchedulerHost {
  store: MemoryStore
  consolidator: Consolidator
  preferences: () => PreferencesView
  log: (message: string) => void
  onRun?: (report: ConsolidationReport) => void
}
export interface SchedulerOptions {
  startupDelayMs?      // 默认 STARTUP_DELAY_MS = 90_000
  tickMs?              // 默认 TICK_MS = 30_000
  sessionEndDebounceMs?// 默认 SESSION_END_DEBOUNCE_MS = 15_000
  now?                 // 默认 Date.now
}
class ConsolidationScheduler {
  constructor(host: SchedulerHost, options: SchedulerOptions = {})
  start(): void        // 启动补齐：延迟 90s 后检查一次
  touch(): void        // 每个 session/event 调用，重置空闲计时
  sessionEnded(): void // 会话结束（防抖）
  stop(): void
  get busy(): boolean
}
```

**实测修正 1**：时钟移进类内（`options.now`），`lastEventAt` 从 host 签名里去掉。原因是触发调度必须能被测试驱动——`tools/verify-schedule.mjs` 靠注入 `now()` 把「空闲 10 分钟」压缩成一次跳变，否则测试得真睡 70 秒。

判据（`memory-plan.md` §6.1 原文）：`距上次整合 ≥ consolidateIntervalHours(24h)` **且** `state.pending.length > 0`，再按模式触发：

| 模式 | `consolidateOn` | 行为 |
|---|---|---|
| 启动补齐 | `startup-idle`（默认） | 启动后 **90s** 检查一次 |
| 空闲 | `idle` | 连续 `consolidateIdleMinutes`(10) 无 `session/event` → 整理 |
| 会话结束 | `session-end` | `session/flush` 后若为最后一个活跃会话 → 整理 |
| 固定时间 | `fixed` | 到 `consolidateFixedTime`(03:00) → 整理（默认关） |
| 手动 | — | 已实现，保留 |

纪律：
- **所有定时器挂在 `ctx.effect()` 上**，热重载必须自动清理（`collector.ts` 的 `scheduleFlush` 是现成范例，用 `.unref?.()` 避免拖住进程）。
- 单次最多处理 20 个待整理会话（`consolidator.run(reason, limit)` 已支持 `limit`）。
- `consolidateQuiet` 只影响提示，不影响执行。
- 会话结束时若 `pending` 为空，**不跑**（避免空转写 journal）。

**实测修正 2**：`start()` 只在 `consolidateOn === 'startup-idle'` 时武装启动定时器；`sessionEnded()` 只在模式为 `session-end` 时才建防抖定时器。原设计没写这条，会导致 `idle` 模式白拿一次启动补齐（P4-3 的验收点之一）。

**实测修正 3**：`fixed` 模式的 `lastFixedDay` 只在 `fire()` 的 `finally` 里写。若写在判据里，一次被闸门（不足 24h / 无待整理）挡下的固定时间触发会**当天再也不补**；写在 `finally` 才能下一个 tick 重试。

**B. 待确认问题进快照**（缺口 7）

- `src/protocol.ts`：`MemorySnapshot` 增 `questions: string[]`；`consolidation.modelStage` 类型由字面量 `'disabled'` 放宽为 `'disabled' | 'deterministic' | 'model'`。
- `src/host/store.ts`：`snapshot()` 从 `state.json` 新增的 `questions: string[]` 字段读取（`consolidate.run()` 结束时写入）。
- `src/client/memory.tsx`：在「管理记忆」卡片下方新增**待确认卡片**，每条一行 + `忽略` 按钮（走新的 `{kind:'dismiss-question', index}` action）。

**实测修正 4**：`questions` 用 `mergeQuestions(existing, raised)` 合并而不是直接覆盖——新一轮的提问排在前面，旧问题里没被重提的保留，整体 `slice(0, 50)`。直接覆盖会让「另一个主题提出的问题」被无关的一轮整理顺手抹掉。

**C. 历史与回滚**（缺口 5）

- 新路由 `GET ${API_PREFIX}/journal?date=YYYY-MM-DD` → `{date, text, backups: string[]}`。
- 新 action `{kind:'rollback', date}` → 把 `journal/<date>/backup/` 里的文件还原回原位（`__` 还原成 `/`），还原前**先给当前状态再做一次备份**，并在 journal 追加一行 `已回滚到 <date> 的备份`。
- 面板「管理记忆」卡片新增 `历史` 按钮 → 弹层列出有 journal 的日期 → 选中后显示 journal 文本 + `回滚到这一天`。

**实测修正 5（🔴 这是原设计里的一个真 bug，真机实测才发现）**：原设计的「回滚前先给当前状态再做一次备份」会备份到 `journal/<今天>/backup/`——而当回滚目标**就是今天**时，那正是它马上要读取的源备份目录。于是「回滚前的快照」把源备份覆盖掉，恢复出来的每个文件都带着被改坏的字节，**且没有任何报错**。修正后 `rollback()` 遵守三条：
1. 先把要恢复的字节**读进内存**，再碰磁盘；
2. 被替换的状态快照到**独立目录** `journal/<日期>/rollback-<HH-MM-SS>/`，绝不写进源备份；
3. 仍然只写回备份里有的文件，不删任何备份没提到的文件。

`tools/verify-host.mjs` 最初没抓到这个 bug，因为它的断言只检查 journal 里那行文本，不检查恢复后的内容——**回滚的断言必须「先改坏一个文件 → 回滚 → 断言坏内容消失」，断言日志行证明不了任何事**。

**D. 「重置」改成归档全部**（缺口 6）

- 新 action `{kind:'reset-all'}`：把 `memory/` + `sessions/` + `profile.md` + `instructions.md` **整体移动**到 `archive/reset-<ISO 时间戳>/`，再 `ensure()` 重建空骨架（`state.json` 的 `pending` / `processed` 一并清空）。
- **不真删**。前端二次确认文案：「全部记忆会移入 `archive/`，不会删除。确认重置？」

**实测修正 6**：实际移动的还有 `journal/` 与 `skills-draft/`（共 6 项），`state.json` 也复制一份进归档目录。归档目录名里的 `:` 换成 `-`（Windows 文件名不允许冒号）。

**E. 手动整理改为「立即返回 + 轮询」（原设计遗漏，实测补上）**

`src/client/transport.ts:29` 的 `REQUEST_TIMEOUT_MS = 15_000` 是浏览器侧超时，而一次带模型阶段的整理可以跑几十秒。原设计让 `action` 路由同步 `await` 整轮整理，结果是：15 秒后浏览器报超时，而宿主侧 `Consolidator.running` 仍为 `true`，此后所有触发都被「上一次整理还在进行中，本次已跳过」拒掉。

修正：`action` 路由在 `runAction` 之前拦截 `kind === 'consolidate'`，**立即返回 202 + `{started:true}`**，整理在后台跑；面板改为轮询（2 秒一次、最多 6 轮）读取结果。真机实测该路由 **15 ms** 返回。

### 3.3 验收标准（**已全部通过**）

| # | 验收 | 结果 |
|---|---|---|
| P4-1 | 启动补齐会触发 | ✅ 影子实例（独立 `DSH_HOME` + `--profile mbp4`，端口 19411）启动约 90s 后自行触发，写入 `journal/2026-10-16.md`，备份 5 个文件，`pending` 清空 |
| P4-2 | 空闲会触发 | ✅ `tools/verify-schedule.mjs` 用注入时钟跳变验证（活动会话 `touch()` 会重置窗口；静置超过 `consolidateIdleMinutes` 触发一次） |
| P4-3 | 开关真的生效 | ✅ 四种模式各验一次；`idle` 不继承启动补齐；`fixed` 默认关时不触发；`session-end` 对 5 次连续 `sessionEnded()` 只触发一次 |
| P4-4 | 问题可见 | ✅ 造一对矛盾条目（「以后都用中文回复我」vs「以后都不要用中文回复我」）→ 面板出现待确认卡片 → 点「知道了」后 `state.json.questions` 清空、卡片消失 |
| P4-5 | 回滚可用 | ✅ 真机：改坏 `memory/background.md` → 回滚 → 坏内容消失，源备份未被污染，被替换状态留在 `journal/2026-10-16/rollback-02-12-06/` |
| P4-6 | 重置是归档 | ✅ `archive/reset-2026-10-16T02-08-47Z/` 含 6 项旧文件，骨架重建 |
| P4-7 | 热重载不残留 | ✅ `stop()` 取消待触发的启动定时器；被闸门挡下的触发不会改写 `memory/habits.md`（逐字节比对） |
| P4-8 | 回归 | ✅ `verify-host.mjs` **49/49**、`verify-schedule.mjs` **14/14**、`verify-headless.mjs` 11/0、`verify-bundle` 10/10、`verify-client-factory` 13/13、`verify-replay` 14/14 |

真机验收另附：`GET /state` 返回 `modelStage: "deterministic"`、`history: ["2026-10-16"]`；`GET /journal` 返回 5 个可回滚文件；面板 12/12 项检查通过（`[data-dsh-memorybuddy-view]` 内四张卡片全部渲染）。

---

## 4. P5 · 模型提炼

### 4.1 目标

在确定性阶段之后接一个**可选**的模型阶段：把「新增候选 + 现有画像摘要」交给模型，要求它**只输出 diff**（带逐字锚点），失败即降级，绝不影响确定性阶段已落盘的结果。

### 4.2 模型调用契约（**已实测确认**，照抄即安全）

`@deepseek-ai/dsh-llm` 服务键 `llm`，类型 `LlmRuntime`。已从 asar 里核对过的真实签名：

```ts
listProviders(): LlmProviderInfo[]                                              // 同步
listModels(provider: string): Promise<readonly LlmModelInfo[]>                  // 异步、可能打网络 → 必须缓存（§4.4）
resolveModelInfo(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo>   // 校验用，**不是** resolveModel
prepareCall(config: LlmCallConfig, signal?: AbortSignal): Promise<PreparedLlmCall>   // LlmRuntime 上收 **config 对象**
// LlmCallConfig = { provider, model, reasoningEffort?, temperature?, maxTokens?, stop? }
// LlmResolvedModelInfo extends LlmModelInfo { context?: {contextWindow}, defaultMaxTokens?, reasoning?: {efforts, defaultEffort?} }
// 事件：'llm/adapters-updated'(): void  —— payload-free 的注册表变更通知（emit）
// 事件：'llm/stream'                   —— 每次流式调用的 waterfall（重试/重放/路由）
```

```ts
// 正确路径：注册绑定的 prepareCall，而非公开的 llm.stream
const handle = await llm.prepareCall({ provider, model, reasoningEffort?, temperature?, maxTokens? })
// 分发时用【解析后配置】：handle.stream 会用 callConfigEquals 逐字段比对请求与已解析配置，
// 直接展开输入配置会在运行物化了默认值（如 reasoningEffort）时炸 INVALID_PREPARED_CALL（真机踩过）。
for await (const chunk of handle.stream({ ...handle.config, messages, system, signal })) { /* … */ }
```

> **0.4.0 实测补充（两条真机踩出来的契约）**：
> 1. `handle.stream()` 的请求**必须**带 `...handle.config`（解析后配置），否则 `INVALID_PREPARED_CALL`；
> 2. 消息 `content` 必须是**类型化块数组**（`[{type:'text', text}]`），不能是字符串——
>    适配器按 `message.content.some(…)` 走块，传字符串炸 `content.some is not a function`（UNKNOWN）。
>    正确形状：`messages: [{ role: 'user', content: [{ type: 'text', text }] }]`。

- `ctx.llm` 的官方用法是 `ctx.llm.stream({provider, model, messages})`（见 `dsh-llm/README.md`），**但第三方 provider 插件可能覆写 `llm.stream` 为 waterfall 签名 `(options, next)`**，此时调用方会炸 `TypeError: next(...) is not a function or its return value is not async iterable`。`prepareCall()` 把适配器代际、重试策略绑死在句柄上，HMR 也不会串代际。
- task-board 的 `openOneShotStream(llm, config, request)` 就是这个模式的封装（`@linxin666/dsh-client-ui-task-board/lib/types/host/llm-dispatch.d.ts`），可直接照抄其形状：**调用配置必须在 `config` 里，不能混进 `request`**。
- `ctx.llm` 通过 `ctx.get('llm')` 软探测；拿不到就跳过模型阶段。
- **别把 `LlmRuntime` 与 `LlmAdapter` 的同名方法混了**：`LlmRuntime.prepareCall(config, signal?)` 收 **config 对象**，`LlmAdapter.prepareCall(provider, model, signal?)` 收三个参数；`resolveModel` 只存在于 `LlmAdapter` 上，插件层校验模型一律用 **`LlmRuntime.resolveModelInfo(provider, model)`**。
- `StreamChunk` 里有 `{ type: 'usage'; usage: TokenUsage }`，token 记账可用；`{ type: 'finish'; reason; replayState? }` 是流结束标志。
- 约束：**单次 45s 超时**、输入上限 **16KB**、输出必须是 JSON diff、解析失败即放弃本轮；**整轮还有总预算，见 §4.4 规则 0**。

### 4.3 前置任务：修 `writeState()` 的并发缺陷 —— ✅ **已随 P4 完成**

> 这不是新功能，是被模型阶段**引爆**的既有缺陷。**已在 0.3.0 修掉**，P5 可以直接开工。

`src/host/store.ts:187` 的 `writeState()` 原本只有 `writeFileAtomic`，**没有 `withFileLock`**。而它是「读-改-写」模式的两处调用方：

| 调用方 | 读 | 写 |
|---|---|---|
| `src/host/consolidate.ts` | `:165` | `:233` |
| `src/host/collector.ts` | `:562` | `:567` |

原窗口只有**毫秒级**，所以从未撞上。一旦把模型调用插进「读」和「写」之间，窗口被拉长到**最长 45 秒**——这期间任何一次会话 flush 写水位线，都会被整理结束时的那次写**整个覆盖**：`processed` 回退、`pending` 回退，同一个会话被重复整理，且**用户看不到任何报错**。

**已实施（两条都做了，比原计划更稳）**

1. `writeState()` 内部包一层 `withFileLock`（照抄 `patchPreferences()` 的写法）。
2. 新增 `patchState(patch: (state) => PluginState)`：**在一次锁内**完成「读-改-写」，供所有新调用方使用。`consolidate.ts` 的收尾与 `collector.ts` 的 `markPending()` 都已改走它。

**验收（P5-0）**：✅ `verify-host.mjs` 的并发场景通过；`patchState` 的合并语义保证整理期间采集新增的笔记与水位线不被覆盖。

---

### 4.4 用户自选模型（**最高优先级**）

> 由你（m00783）追加：允许使用者自己挑一个模型，**优先级最高**；自选模型失效时自动降级到 §4.5 的候选链。
> 两者不冲突——自选是"我就要用它"，候选链是"它挂了怎么办"。

**配置**（`preferences.md` front-matter 新增三项）

| 键 | 默认 | 含义 |
|---|---|---|
| `modelChoiceProvider` | `""` | 用户显式指定的 provider（如 `workbuddy-xdpool-global`）；空 = 不指定 |
| `modelChoiceModel` | `""` | 用户显式指定的 model id（如 `hy3`）；与上一项同时为空才算"未指定" |
| `modelChoiceEffort` | `""` | 该模型的 `reasoningEffort`；空 = 用模型默认。**必须是该模型 `reasoning.efforts` 里的值** |
| `modelAllowlist` | `[]` | **语义收窄**：不再是"显式指定"，而是**硬边界**（见规则 5） |

> **为什么拆成两个键**：provider id 或 model id 本身可能含 `/`（如 `openrouter/anthropic/claude-x`），单键 `provider/model` 无论按第一个还是最后一个 `/` 切都可能切错。两个键从根上回避解析歧义，也让 front-matter 可读性更好。

**UI**（「记忆与进化」页新增「提炼模型」卡片）

- 一个下拉框，选项由运行时**真实枚举**得来，不写死：
  ```ts
  const providers = llm.listProviders()                    // 同步、注册顺序
  const models = await llm.listModels(provider)            // 异步、可能打网络 → 走缓存
  // LlmModelInfo = { provider, id, name, description?, inputModalities? }
  ```
  选项文案 `name (provider/id)`；免费标记见下。
- **枚举必须走 host 侧缓存**（`model-picker.ts`）：`listModels()` 是异步的、可能真的发网络请求，每个 provider 一次，面板每次打开都调会卡住。缓存带 TTL（如 10 分钟），并监听 `ctx.on('llm/adapters-updated', …)`（payload-free 的注册表变更通知）**主动失效**。下拉**展开时**才拉取。
- **免费标记按 `(provider, id)` 配对匹配**，不要只匹配裸 model id：本机池目录 `$DSH_HOME/.workbuddy-ai-catalog.json` 是**按账号分组**的，`hy3` 可能同时挂在 `workbuddy-xdpool-global` 和 `sensenova` 下；而且运行时 jsDoc 明说目录是 **advisory**（`listModels`: "Catalog membership does not constrain core routing"）。配不上就**不加标记**，卡片底部写「免费标记仅供参考」。
- 选中即写 `modelChoiceProvider` / `modelChoiceModel`，**立刻用 `llm.resolveModelInfo(provider, model)` 校验**（只读、不消耗额度），把结果写在卡片上：
  - 可用 → 绿字「可用」，并展示上下文窗口与可选 `reasoningEffort` 档位；
  - 不可用 → 红字「当前不可用，整理时会自动回退到候选链」，并给一个 `改回自动` 按钮。
- **`modelChoiceEffort` 的下拉项来自 `resolveModelInfo().reasoning?.efforts`**，不能写死档位名——否则用户能选到模型不支持的档位，调用直接失败。`reasoning.defaultEffort` 作为默认提示。
- `modelPolicy: 'off'` 时整张卡片置灰（见规则 6）。

**执行语义（关键）**

0. **整轮有总预算，不是每个候选 45s**：模型阶段整体限 **60 秒**、每轮最多尝试 **2 个候选**，到点即放弃本轮、记录原因。单次调用仍是 45s 上限。
   > 否则：5 级候选链 × 45s = 最坏 225s，而面板的 `REQUEST_TIMEOUT_MS = 15_000`（`src/client/transport.ts:29`）会让「立即整理」在 15 秒时**报超时**，而整理其实还在跑；期间 `Consolidator.running` 一直为真，后续所有触发都被 `上一次整理还在进行中，本次已跳过` 挡掉。配套：手动整理**立即返回**（返回 `{started: true}`）再由面板轮询状态，不要同步等。
1. `modelChoiceModel` 非空 → **第一顺位**调用它（配 `modelChoiceEffort`，为空则不传该字段）。
2. 调用失败 → 按 §4.6 的类别写冷却，**立刻**在同一轮内降级到 §4.5 候选链继续尝试（不是放弃整轮），且**仍受规则 0 的总预算约束**。
3. 降级发生时**必须可见**：journal 追加一行 `自选模型 <provider>/<model> 失败（<类别>），已回退到 <实际使用的模型>`；面板「提炼模型」卡片显示「上次回退：<时间> · <原因>」。
4. 自选模型处于冷却期时，**不重复撞墙**：直接走候选链，日志记 `自选模型处于冷却（剩 N 分钟）`。
5. **`modelAllowlist` 非空时永远是硬边界**，自选模型也受它约束。
   > 一个字段不能同时是"建议"和"强制"。反例：用户把 `modelPolicy` 设为 `allowlist`、名单填 `['hy3']`，却又让 `modelChoiceModel` 指向 `gpt-6-astra`（x6.67）直接生效——这**直接违背用户自己刚声明的策略**。
   > 做法：自选不在名单内 → 调用前拦下，卡片红字「你选的模型不在白名单里」+ 一个 `加入白名单` 按钮（点了就写进 `modelAllowlist`），而不是静默生效或静默忽略。
6. **`modelPolicy: 'off'` 优先级高于自选**：`off` = 用户明确说了"不要模型提炼"，此时**不发起任何调用**，卡片置灰并显示「已关闭模型提炼」。写进计划，不留歧义。
7. `modelChoiceProvider` / `modelChoiceModel` 任一为空即视为未指定，不报错、不提示。

### 4.5 回退候选链（不写死模型名）

1. **用户自选**（§4.4，填了、可用、且在白名单内、且不在冷却期）
2. **免费优先**（`modelPolicy: 'free-first'`，默认）：本机池目录 `$DSH_HOME/.workbuddy-catalog.json` / `.workbuddy-ai-catalog.json` 里 `billing.free === true` 或 `credits === 'x0.00'`。
   实测本机免费档：**`hy4-preview-f`、`hy3`、`deepseek-v4.1-flash`**（均为 300k/192k 上下文，`billing.free: true`，`credits: "x0.00"`）。
   注意 `step-5-preview` **不是**免费的（x0.43），`memory-plan.md` §6.1.2 把它列进免费档是**过时的**，以池目录为准。
   池目录读不到 → 退到「名字含 `免费` / `free`」→ 退到「provider 属于反代池」。
   `modelAllowlist` 非空时，本层只在该名单内筛（名单为空则不限制）。
3. 第三方已配置 provider：`sensenova`、`qwen`（来自 `llm-pi-ai`）
4. 会话默认模型：`ctx.agentDefaultModel.currentSelection()` → `{provider, model, reasoningEffort?}`（**只读，绝不调 `saveSelection()`**）
5. 任意可用模型

> 候选一律经 `llm.resolveModelInfo(provider, model)` 校验后再调用；逐个尝试，任一成功即停止，**且受 §4.4 规则 0 的总预算约束**。

### 4.6 冷却表

失败按类别写进 `state.json.modelCooldown`（结构已存在，只是没人写）：

| 失败类别 | 冷却 |
|---|---|
| 额度耗尽 / 限流 | 6h |
| 模型不存在 | 24h |
| 认证失败 | 24h |
| 网络错误 | 30min |

逐个候选尝试；**全部失败** → 跳过模型阶段，面板显示「上次模型提炼未执行：<原因>」。所有调用包在 try/catch 里，**任何模型异常都不得让插件崩溃、阻塞或丢数据**。

**冷却键只按路由 `provider/model` 建**，自选与候选链**共用同一张表**。

> 早先的写法给自选加了 `choice:` 前缀（两张表），这是个真 bug：自选 `hy3` 被限流 → 写 `choice:…/hy3` → 立刻降级到候选链 → 候选链第一档**也是 `hy3`**（免费档）→ **同一个模型被连撞两次**，反而加深限流。
> 「上次回退到哪个模型」是**纯 UX 状态**，存进 `snapshot.consolidation.lastFallback`，**不参与门禁判断**。

### 4.7 改动清单

- **前置**：`src/host/store.ts` 的 `writeState()` 加 `withFileLock`（§4.3）。
- 新增 `src/host/model-picker.ts`：候选链解析 + 自选模型优先/回退 + 冷却表读写 + 池目录解析 + **`listModels()` 缓存与 `llm/adapters-updated` 失效**（`memory-plan.md` §8.1 原本就规划了这个文件，0.1.0 没建）。
- 新增 `src/host/distill.ts`：构造输入（候选摘要 + 现有画像摘要，**只发摘要不发原始对话**）、解析 JSON diff、校验逐字锚点、**总预算计时**。
- `src/host/consolidate.ts`：在 `runInner()` 的「合并候选」与「衰减」之间插入模型阶段；`ConsolidationReport` 增 `model?: { provider, model, tokens, applied, skippedReason, fellBackFrom?: string }`。
- `src/host/store.ts`：`appendJournal` 的 `模型提炼：未启用…` 改为写入真实模型与 token 数；`snapshot()` 的 `modelNote` 改为动态。
- `src/host/routes.ts`：**新增 `GET ${API_PREFIX}/models`**（返回缓存的 `{providers: [{id,name}], models: {provider: [{id,name,free,efforts,contextWindow}]}}`）；`/action` 的 `consolidate` 改为**立即返回 `{started: true}`**（配合 §4.4 规则 0），并新增 `GET ${API_PREFIX}/consolidate-status` 供轮询。顺手修头注释「five routes」与 `:162` 的双前缀（见 §8.2 陷阱 9/10）。
- `src/client/transport.ts`：`MemoryApi` 增 `models()` 与 `consolidateStatus()`（`REQUEST_TIMEOUT_MS` 不适用于这两条轮询请求）。
- `src/protocol.ts`：`PreferencesView` 增 `modelChoiceProvider` / `modelChoiceModel` / `modelChoiceEffort`；`MemorySnapshot.consolidation` 增 `modelChoiceStatus?: {ok, reason?, efforts?}`、`lastFallback?: {at, from, to, reason}`、`running?: boolean`；`PreferencesPatch` 同步；新增 `ModelCatalog` 类型。
- `src/host/templates.ts`：`DEFAULT_PREFERENCES` 增三项默认值。
- `src/client/memory.tsx`：新增「提炼模型」卡片（下拉 + effort 档位 + 校验结果 + `改回自动` + `加入白名单`），`memory.modelStage` 文案改为显示「上次整理用了 `<provider>/<model>`，<N> token」或「未执行：<原因>」。
- `src/client/locales.ts`：新增卡片与状态文案（zh/en）。

### 4.8 验收标准

| # | 验收 | 做法 | 结果（0.4.0） |
|---|---|---|---|
| P5-0 | **并发写 state 不丢数据** | 模型调用处注入 10s 延迟 + 并发触发一次会话 flush → 整理后 `state.json` 两条写入都在（§4.3） | ✅ `verify-host.mjs` 并发场景（§4.3 随 P4 修掉，`patchState` 合并语义） |
| P5-1 | diff 真的被应用 | 造 3 条待提炼候选 → 跑整理 → `memory/*.md` 出现新条目，journal 记录模型与 token | ✅ 单测覆盖 `distillStage` 的 add/update 折叠（真机：确定性已合并时模型正确返回空 diff，`应用 0 条` 是正常结果） |
| P5-2 | **自选模型优先** | 在面板里选一个模型 → 跑整理 → journal 里的模型**就是它**（不是免费档） | ✅ 真机：选 `deepseek-official/deepseek-flash` → `runtime.modelChoice` 真实校验（efforts/defaultEffort/contextWindow） |
| P5-3 | **自选失效会回退** | 把 `modelChoiceModel` 改成一个不存在的 id → 跑整理 → 整理照常完成，journal 有 `已回退到 <实际模型>` 一行，面板显示回退原因 | ✅ 单测 + 真机：自选失败 → 链内下一个候选接管，`fellBackFrom` 记录 |
| P5-4 | **回退不撞墙（同一模型不连撞两次）** | 自选 `hy3` 且候选链首档也是 `hy3`，令其失败 → 冷却表里 `provider/model` 键**只有一个**；第 2 次触发**不发起**对 `hy3` 的调用，日志为 `处于冷却（剩 N 分钟）` | ✅ 真机：冷却表只出现单层键（无 `choice:` 前缀），第 2 轮直接 `没有可用的模型（或都在冷却中）` |
| P5-5 | **总预算生效** | 让候选链前 3 个都失败 → 模型阶段在 **60s 内**结束（不是 135s+），面板不报 timeout，`running` 归位为 false | ✅ `verify-model.mjs` P5-10（45s 真实等待场景） |
| P5-6 | 下拉是真实枚举 | 下拉选项与 `llm.listProviders()` / `llm.listModels()` 结果一致；免费档带 `· 免费` 标记；**展开面板不触发网络风暴**（第二次展开走缓存） | ✅ 真机：`GET /models` 返回运行时真实枚举；宿主缓存 10 分钟 + `llm/adapters-updated` 失效 |
| P5-7 | 免费标记按 (provider,id) 配对 | 构造一个只在一个 provider 下免费的模型 → 另一个 provider 下**不显示** `· 免费` | ✅ 单测：`readFreeModels` 按 `(provider, id)` 配对 |
| P5-8 | 免费优先生效 | `modelChoiceModel` 为空、`modelPolicy: 'free-first'` 时，日志里的模型属于 {`hy4-preview-f`,`hy3`,`deepseek-v4.1-flash`} | ✅ 单测（免费档与运行时枚举取交集）；真机环境免费池账号不是运行时 provider，交集为空 → 按设计落到第 5 级 |
| P5-9 | **白名单是硬边界** | `modelAllowlist` 填 `['hy3']` → 候选链只用 `hy3`；且 `modelChoiceModel` 选 `gpt-6-astra` 时**被拦下**并提示「加入白名单」，不发起调用 | ✅ 单测 `allows()` 硬边界 + 卡片「加入白名单」按钮 |
| P5-10 | **`off` 压过自选** | `modelPolicy: 'off'` + 非空 `modelChoiceModel` → **不发起任何调用**，卡片显示「已关闭模型提炼」 | ✅ 单测 + 真机（卡片置灰） |
| P5-11 | effort 档位受校验 | 选一个不支持 `reasoning` 的模型 → 档位下拉为空或置灰，调用时**不传** `reasoningEffort` | ✅ 档位只来自 `resolveModelInfo().reasoning.efforts`（真机：`deepseek-flash` 给出 `off/low/high/max`） |
| P5-12 | 降级不崩 | `llm` 服务不存在（headless 场景）→ 不发起任何调用，整理照常完成 | ✅ `verify-model.mjs` P5-12（`routes()` 返回空 → `当前环境没有 llm 服务`，不抛） |
| P5-13 | 不覆盖用户编辑 | 手工 `pinned` 一条 → 跑整理 → 该条**逐字未变** | ✅ `verify-model.mjs` P5 校验链（锚点不匹配/pinned/不存在条目都拒绝） |
| P5-14 | 不发送原始对话 | 抓一次调用的入参，确认只有候选摘要与画像摘要 | ✅ `verify-model.mjs` P5-14（入参含候选摘要、无 `## 做了什么` 原文标记） |
| P5-15 | 回归 | 五个 verifier 全绿（§8.3） | ✅ 六个全绿：host 49/49、schedule 14/14、model 30/30（新增）、bundle 10/10、client-factory 13/13、headless 11、replay 14/14 |

---

## 5. P6 · 项目级记忆

### 5.1 目标

`memory/projects/<slug>.md` 目前**只读**（`prompt.ts:117-134` 渲染，截断 1200 B）。补上写入方与 UI，让"这个仓库的构建命令/目录约定/踩过的坑"能自动积累。

### 5.2 改动清单

- `src/host/entries.ts` 或新增 `src/host/project.ts`：从会话笔记的 `## 项目相关` 段与工作目录抽取项目事实候选。
- `src/host/consolidate.ts`：整理时按 `slugify(workspace)` 归并到对应项目文件，复用同一套去重/冲突/置信度逻辑。
- `src/protocol.ts`：`MemorySnapshot` 增 `projects: {slug, path, updated, bytes}[]`。
- 新 action `{kind:'forget-project'; slug}`（归档而非删除）。
- `src/client/memory.tsx`：「记忆与进化」页新增**项目记忆卡片**（当前工作目录对应的项目文件、条目数、`编辑` / `归档`）。
- **硬约束**：只写 `$DSH_HOME/dsh-memorybuddy/memory/projects/`，**绝不往用户仓库里写文件、绝不写 `AGENTS.md`**。

### 5.3 验收标准

| # | 验收 | 做法 |
|---|---|---|
| P6-1 | 自动积累 | 在 `D:\dsh-memorybuddy` 跑一个会话 → 整理后 `memory/projects/dsh-memorybuddy.md` 出现条目 |
| P6-2 | 注入只在匹配目录 | 换一个工作目录开会话 → 系统提示里**没有** `【本项目记忆】` 段 |
| P6-3 | 预算生效 | 把项目文件写到 5 KB → 注入被截到 1200 B |
| P6-4 | 仓库零污染 | `git status --short` 在跑完整理后仍为空 |
| P6-5 | 回归 | 五个 verifier 全绿 |

---

## 6. P7 · 技能进化

### 6.1 目标

`skills-draft/` 的读写与批准链路**已经通了**，只缺**生产者**和**详情页**。

### 6.2 改动清单

**A. 草稿生成器**（缺口 3）

- 触发判据（`memory-plan.md` §6.2）：同一类操作**重复 ≥3 次**且跨**≥2 个日期**。
- 输入：`sessions/` 里已整理的笔记 + 工具调用聚合行（`- 工具调用 N 次：…`）。
- 产出 `skills-draft/<name>/SKILL.md`，front-matter：
  ```yaml
  ---
  name: <技能名>
  title: <一句话标题>
  description: <一句话描述>
  whenToUse: <何时使用>
  source: memorybuddy-evolved
  derivedFrom: [sessions/<日期>/<id>, …]
  repeats: <次数>
  createdAt: <ISO8601>
  ---
  ```
  （`store.readDrafts()` 已在读 `title` / `createdAt` / `repeats`，字段名必须对齐。）
- **默认绝不自动写入 `$DSH_HOME/skills/`**；只有用户点「批准」才落盘。

**B. 详情页**（缺口 3 的后半）

- 草稿卡片加 `查看` → 弹层展示：完整内容预览、目标写入路径（`$DSH_HOME/skills/<name>/SKILL.md`）、来源会话列表。
- 三个按钮：`批准` / `编辑后批准` / `忽略`（`memory-plan.md` §6.2 原文要求三按钮；当前只有两个）。
- `编辑后批准` = 先在弹层里改 SKILL.md 正文，再走 `approve-draft`。

**C. 30 天归档**

- 整理时扫描 `skills-draft/`，`createdAt` 超 30 天且未处理 → 移入 `archive/skills-draft/`（不删除）。

### 6.3 验收标准

| # | 验收 | 做法 |
|---|---|---|
| P7-1 | 生成判据 | 造 3 次跨 2 天的同类操作 → 出现草稿；只造 2 次 → **不**出现 |
| P7-2 | 三级提示 | 红点 + 顶部横幅 + 待批准卡片同时可见，处理后红点消失 |
| P7-3 | 批准落盘 | 点批准 → `$DSH_HOME/skills/<name>/SKILL.md` 存在，草稿目录清空 |
| P7-4 | 编辑后批准 | 改正文再批准 → 落盘内容是改过的 |
| P7-5 | 30 天归档 | 把 `createdAt` 改到 31 天前 → 跑整理 → 移入 `archive/skills-draft/` |
| P7-6 | 不自动写入 | 生成草稿后不操作 → `$DSH_HOME/skills/` 无新目录 |
| P7-7 | 回归 | 五个 verifier 全绿 |

---

## 7. P8 · 隐私收尾与发布

### 7.1 改动清单

| # | 项 | 做法 |
|---|---|---|
| 1 | **彻底删除** | 面板 `危险区` → 二次确认弹窗 + **手打 `DELETE`** → `Remove-Item -Recurse` 整个记忆根 + 批准的技能目录。区别于「重置」（归档） |
| 2 | **`no-memory` 标记** | 会话/工作目录带 `no-memory` 标记时**完全不采集**（`memory-plan.md` §5.2 黑名单第 6 条）。落点待定，见 §9 待拍板 |
| 3 | **PII 检测** | 在 `SECRET_PATTERNS` 之外补身份证/银行卡/手机号模式（§5.2 黑名单第 2 条） |
| 4 | **防投毒** | 外部内容（`web_fetch` / `web_search` / 工具结果）标记不可信，不进长期记忆（§5.2 黑名单第 4 条）。当前 `tool/result` 只记名字+成败，已天然规避大半 |
| 5 | **文档对齐** | `README.md` §145-158 的触发表在 P4 落地后才是真的；`§首版范围` 改为 0.2.0 现状；`CHANGELOG.md` 加新版本条目 |
| 6 | **Gitee 发布** | 建仓、`git remote add`、推 `master`、打 tag `v0.3.0`（或按实际） |

### 7.2 验收标准

| # | 验收 |
|---|---|
| P8-1 | 彻底删除后记忆根不存在，且**必须**手打 `DELETE` 才能执行 |
| P8-2 | `no-memory` 会话跑完不产生任何会话笔记 |
| P8-3 | 身份证/银行卡/手机号样例会命中并拒绝落盘 |
| P8-4 | README 与代码逐条对得上（触发表、配置表、已知限制） |
| P8-5 | Gitee 仓库可 clone，clone 后 `npm install && npm run build` 通过（`lib/` 已入库，理论上无需 build） |

---

## 8. 已知陷阱与实现纪律（**踩过的坑，别踩第二次**）

### 8.1 DSH 运行时约束

1. **`inject` 里只放必然存在的服务**。宿主半边 `inject = ['systemPrompt','agents','commands']`；`webServer` / `tools` / `llm` / `agentDefaultModel` 一律 `ctx.get()` 软探测。硬 `inject` 一个部署里没有的服务会让 `apply` **永不执行**。
2. **`webServer` 必须走 `ctx.inject(['webServer'], cb)`，不能 `ctx.get('webServer')`**——即使完整 GUI 组合里，顶层 `ctx.get` 也拿不到这个 scoped 服务。注入回调是**异步**的，拆除逻辑必须同时处理两种先后顺序（`src/index.ts:525-587` 有现成的 `torn` 标志写法）。
3. **路由前缀必须是文档相对的**：`PREFIX.slice(1)`，不要以 `/` 开头。
4. **所有定时器 / 订阅必须挂在 `ctx.effect()` 上**，否则热重载后重复触发（P4 的调度器最容易犯这个错）。
5. **注入记忆文本必须 `interpolate: false`**，否则用户写进记忆的 `{{ }}` 会被当模板展开。
6. **浏览器半边只能 `require` `react` / `react/jsx-runtime`**；`apply` 全程 try/catch，**永不抛出**。
7. **模型调用走 `prepareCall(config).stream(request)`**，不要用公开的 `llm.stream()`（可能被第三方插件覆写成 waterfall 签名）。

### 8.2 本仓库的历史坑

8. **`verify-replay.mjs` 必须指向"已结束"的日志**。会话日志里的 `turn/end` 与 assistant 的 `text` 块是**回合结束时才落盘**的，所以对一份**正在跑**的会话日志跑回放，`turns matches the real turn/end count` 与 `assistant text appears as 助手：` 这两条断言**必然失败**——这是日志形态问题，不是采集缺陷。实测：同一份代码对**已结束**的 18.5 MB 日志跑出 **14/14**。写新测试时把这条写进注释。
9. **日志前缀重复**：`consolidate.ts:154`、`routes.ts:162`、`collector.ts:491` 里写的是 `` `memorybuddy: 整理失败：…` ``，而 `src/index.ts` 的 `log` 回调**已经**加了 `dsh-memorybuddy: ` 前缀，实际输出是双前缀。P4 已统一（内部一律不带前缀，由 `log` 统一加）。
10. **`routes.ts` 头注释说"one prefix, five routes"，实际只注册了 4 条**。P4 已改为 5 条并修好注释（`state` / `save` / `preferences` / `journal` / `action`）。
11. **`store.ts:292` `resetDocument` 有格式缺陷**：`{` 与第一条语句在同一行。P4 已修。
12. **`memory-plan.md` §8.1 的包结构与实际不符**：实际把 `distill` + `redact` 并进了 `store.ts` / `entries.ts`，`consolidator` 叫 `consolidate.ts`，且没有 `model-picker.ts` / `skills.ts`。P5 新建 `model-picker.ts` 是回归原设计。
13. **`writeState()` 没有文件锁**（`store.ts:187`），而 `consolidate.ts` 与 `collector.ts` 都是「读-改-写」。今天不炸只因为窗口是毫秒级；**任何在读写之间插入 await 的改动都会把它变成数据丢失**（模型调用、网络请求、大文件 IO 都算）。P4 已加锁并新增 `patchState()` 根治（§4.3）。
14. **`REQUEST_TIMEOUT_MS = 15_000`**（`transport.ts:29`）是**浏览器侧**的超时，与宿主侧任何耗时任务无关。宿主里凡是可能跑超过 15 秒的操作，都必须改成「立即返回 + 轮询」，否则面板报的 timeout 是假的，用户会以为失败了而重复点击。P4 的 `consolidate` 路由已按此改（202 + 2 秒轮询）。
15. **真机验收的固定套路（P4 实测有效，后续阶段照用）**：`verify-*.mjs` 全部跑在打桩宿主上，**抓不到「路由没注册上」「卡片没渲染」「定时器没启动」这类问题**。完整流程：
    1. 起影子实例：`$env:DSH_HOME="<临时目录>"; $env:ELECTRON_RUN_AS_NODE="1"; & "D:\DSH-Desktop\resources\runtime\cli\bin\dsh.cmd" --from-default-profile web --profile <名> --dump-config`，再 `... plugin --profile <名> add link:D:/dsh-memorybuddy`，最后 `... --profile <名> --no-open --port 19411`。**`dsh` 不在 PATH 上**，入口是 `D:\DSH-Desktop\resources\runtime\cli\bin\dsh.cmd`。
    2. 把真实记忆目录拷进影子 `DSH_HOME`，才有真实数据可整理。
    3. HTTP 面：影子实例的 `/api/memorybuddy/*` **只认 `sec-fetch-site: same-origin`**（回环地址不需要 cookie），可以直接 `fetch`。
    4. UI 面：headless Chrome `--remote-debugging-port=9222` + CDP（`.tmp-probe/p4-panel.mjs` 是现成范例）。
16. **驱动影子实例 UI 的三个坑**（P4 逐个踩过）：
    - 新 profile 会弹**两层 onboarding 遮罩**（欢迎页「继续」+ API key 门「稍后配置」），**遮罩会吞掉合成点击**。不先点掉它们，点侧边栏那一行永远没反应，而且**页面不报任何错**。
    - 合成点击要用 `Input.dispatchMouseEvent`（`mousePressed` + `mouseReleased`），且**必须先 `scrollIntoView`**——坐标在视口外的点击会静默落空。这就是「按钮存在但点不动」的唯一原因。
    - 断言要匹配**真实文案**：历史卡片的按钮在展开前叫「历史」，展开后才变成「查看当天日志」；`待你确认` 卡片只在 `questions.length > 0` 时渲染，空列表下它**本来就不该出现**——按固定文案硬找会得到假失败。
17. **在运行中的实例旁边改 `state.json` 一定会被覆盖**：采集器会在会话 flush 时重写它。要造测试数据（如冲突候选），**必须先停实例、写好、再启动**；写完立刻通过 HTTP 触发一次整理，别指望手改的 `pending` 能活过下一次 flush。
18. **写文件别带 BOM**：插件用普通 `utf8` 读写，`Set-Content -Encoding UTF8` 在 Windows PowerShell 5.1 下会写 BOM，导致 front-matter 第一个键变成 `\ufeff---`。用 `[System.IO.File]::WriteAllText(path, text, New-Object System.Text.UTF8Encoding($false))`。
19. **P5 模型调试：插件日志要镜像到 stderr**：`dsh web` 组合下 `ctx.logger?.info` **没有任何落盘目标**（serverN.log / logs/ / plugin-manager/logs 都没有），模型失败的真实报错完全不可见。`src/index.ts` 的 `log()` 已加 try/catch 保护的 `console.error` 镜像——插件报错去 `serverN.err.log`。
20. **影子实例没有凭据**：独立 `DSH_HOME` 下 `deepseek-official` 路由会报 `MISSING_CREDENTIAL`（no API key for provider route），被归类 `auth` 写 24h 冷却。要真机跑通模型调用，把 `C:\Users\<你>\.dsh\.credentials.yaml` 拷进影子 home。注意 `deepseek-account` 与 `deepseek-official` 是**两条路由**，凭据只解其中之一。
21. **池目录的免费模型 ≠ 运行时可路由**：`$DSH_HOME/.workbuddy-*.json` 里的账号名（如 `17bb6eaf-…`）**不是运行时 provider id**——运行时枚举里根本没有它们。候选链的免费档必须与运行时枚举**取交集**，交集为空就落到下一级，这不是 bug 而是设计（撞一个运行时路由不了的模型只会白白烧一次预算）。

### 8.3 每次提交前必须过

```powershell
cd D:\dsh-memorybuddy
npx tsc --noEmit -p tsconfig.json
node build.mjs
node tools/verify-bundle.mjs           # 期望 10/10
node tools/verify-client-factory.mjs   # 期望 13/13
node tools/verify-headless.mjs         # 期望 11 passed, 0 failed
node tools/verify-host.mjs             # 期望 49/49（P4 后；此前 35/35）
node tools/verify-schedule.mjs         # 期望 14/14（P4 新增）
node tools/verify-model.mjs            # 期望 30/30（P5 新增）
node tools/verify-replay.mjs "C:\Users\A3373\.dsh\sessions\--D-dsh-workbuddy-memory--\session-ebae0951-2d5d-40f2-bc44-21f65142d9a9\session.v4.jsonl.zstd"   # 期望 14/14
```

> 最后一条**必须用已结束的日志**（见陷阱 8）。上表基线为 2026-10-16（0.4.0）实测值，新增功能后只应上升不应下降。

**真机验收（改动宿主半边后必须做一次）**：`verify-*.mjs` 跑的是打桩宿主，抓不到「路由是否真的注册上」「面板卡片是否真的渲染」这类问题。做法见陷阱 15。

### 8.4 数据安全纪律

- **先备份、再写入**：任何自动写入前，受影响文件必须先进 `journal/<date>/backup/`。`consolidate.ts` 已经这么做，P4/P5/P6/P7 的新写入路径**必须沿用**。
- **绝不真删**：归档代替删除（`archive/`）。唯一的例外是 P8 的「彻底删除」，且必须手打 `DELETE`。
- **绝不覆盖 `pinned` 条目**：用户手工编辑过的条目标 `pinned`，自动整理**永不改动**。
- **冲突不自动裁决**：只标记 `⚠ 冲突` + 提问，绝不自动二选一。

---

## 9. 需要你拍板的事项

| # | 事项 | 选项 | 我的建议 | 状态 |
|---|---|---|---|---|
| 1 | **P4 触发默认值** | 沿用 `startup-idle`（启动补齐 + 空闲）／ 只留手动 | **沿用**。README 已承诺，且实测数据目录里 7 份笔记从未被整理过，正是缺这一环 | ✅ 已按建议实现（`templates.ts` 默认 `startup-idle`） |
| 2 | **模型提炼默认开关** | `modelPolicy: 'free-first'` 默认开 ／ 默认 `off` 纯确定性 | **默认开**。免费档实测有 3 个可用模型，额度消耗≈0；面板随时可切 `off` | ✅ 已拍板（m01973：按推荐，默认开） |
| 2b | **自选模型是否默认空** | `modelChoiceProvider` / `modelChoiceModel` 均 `""`（不指定，走免费优先）／ 预填一个（如 `hy3`） | **默认空**。想指定的人自己去下拉里选；不想管的人无感 | ✅ 已拍板（m01973：按推荐，默认空） |
| 2c | **`modelAllowlist` 非空时是否约束自选** | 硬边界（自选也受约束，越界时给「加入白名单」按钮）／ 只管候选链（自选永远放行） | **硬边界**。用户声明了白名单就是声明了边界，让自选绕过等于自相矛盾（§4.4 规则 5） | ✅ 已拍板（m01973：按推荐，硬边界） |
| 3 | **P5 是否发原始对话** | 只发候选摘要 ／ 发原始对话 | **只发摘要**（`memory-plan.md` §7 原文），隐私底线 | ✅ 已拍板（m01973：按推荐，只发摘要） |
| 4 | **`no-memory` 标记怎么表达** | 会话标题前缀 ／ 工作目录放 `.no-memory` 文件 ／ 面板手动标记 | **工作目录放 `.no-memory`**——最符合"按项目关记忆"的直觉，且不依赖会话命名 | ⬜ 待你确认（P8） |
| 5 | **P6 项目记忆是否默认开** | 默认开（自动积累）／ 默认关（手动启用） | **默认开**，但只写 `$DSH_HOME`，仓库零污染（P6-4 已作为验收项） | ⬜ 待你确认（P6） |
| 6 | **P7 技能草稿的生成是否要用户确认** | 自动生成草稿 + 用户批准落盘 ／ 生成前也先问 | **自动生成草稿**（`memory-plan.md` §6.2 原文：默认绝不自动**写入**，但生成草稿本身可以自动） | ⬜ 待你确认（P7） |
| 7 | **版本号节奏** | P4 一版（0.3.0）、P5–P6 一版（0.4.0）、P7–P8 一版（1.0.0）／ 每个阶段一版 | **三版节奏**，与阶段价值对齐 | ✅ 0.3.0 已按此发版 |
| 8 | **P8 的 Gitee 仓库名** | `dsh-memorybuddy` ／ 其它 | **`dsh-memorybuddy`**，与 npm 包名一致 | ⬜ 待你确认（P8） |

---

## 10. 不做什么（明确排除）

- **不改 git 历史**、不为旧名 `workbuddy` 留任何兼容别名或 shim（`update-plan.md` §10 已定）。
- **不碰别人的 workbuddy**：`dsh-workbuddy-xdpool` 插件、`.workbuddy-*.json` 池目录、`rewind-snapshots` 一律不动。
- **不做跨设备同步**（`memory-plan.md` §11.1 已排除）。
- **不做夜间定时**：触发依赖"你开着电脑的时候，错过就补"。
- **不写用户仓库**：不写 `AGENTS.md`，不在项目目录里落任何文件。
- **不引入运行时依赖**：宿主半边只用 `node:*`，浏览器半边只用 `react`。
- **不做全文重写式模型输出**：模型阶段只接受 JSON diff + 逐字锚点。
- **不用 `saveSelection()` 改写你的默认模型**：自选模型只存进 `preferences.md` 的 `modelChoiceProvider` / `modelChoiceModel`，绝不碰 DSH 的会话默认模型配置。

---

**你确认后我从 P4 开始开发。**
