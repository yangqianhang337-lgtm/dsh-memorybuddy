# 更新日志

本项目遵循[语义化版本](https://semver.org/lang/zh-CN/)。

> 说明：0.1.0 一节保留发布当时的原文（那时本项目尚未正式命名），其中出现的旧名与旧工具名
> 是当时的事实记录，不再改写；改名本身记录在 0.2.0 一节。

## [0.4.0] - 2026-10-16

**P5 模型提炼**：确定性整理（扫描、去重、重建索引）之后，第一次接上模型阶段——把候选交给模型做
「提炼」（改写、补充、归纳），失败自动回退、按类别冷却，全程只发摘要不发原始对话。

### 新增

- **模型阶段接入整理** `src/host/distill.ts`：单次调用 45 秒上限、整轮 60 秒总预算、每轮最多 2 个候选、
  `temperature: 0`、输入上限 16 KB（超长按行边界截断）。输出必须是 `{"ops":[…]}` JSON diff
  （只允许 add / update），`update` 需要条目 id + **逐字锚点**，锚点不匹配、条目不存在、条目被 `pinned`
  都会被拒绝并上浮为待确认问题；与现有条目相似度 ≥0.99 的改写视为无操作丢弃。
  模型阶段排在确定性合并**之后**：确定性已合并的候选模型只能在其基础上改写，`applied: 0` 是正常结果，
  不再因此打扰用户。
- **候选链与自选模型** `src/host/model-picker.ts`：优先级 用户自选 → 免费档（读
  `$DSH_HOME/.workbuddy-catalog.json` / `.workbuddy-ai-catalog.json` 的 `billing.free === true` 或
  `credits === 'x0.00'`，按 `(provider, id)` 配对）→ 第三方（`sensenova` / `qwen`）→ 会话默认
  （`ctx.agentDefaultModel.currentSelection()`，只读，绝不调 `saveSelection()`）→ 任意可用。
  `modelPolicy: 'off'` 压过自选；`modelAllowlist` 非空是**硬边界**，自选也受约束；
  免费档与运行时枚举取交集，避免撞上运行时根本路由不了的池账号。
- **冷却表**：失败按类别写 `state.json.modelCooldown`——额度 6h / 模型不存在 24h / 认证失败 24h /
  网络 30min / 未知 30min。**键只按路由 `provider/model` 建**，自选与候选链共用同一张表，
  同一个模型不会被连撞两次；成功即清除。
- **`GET /api/memorybuddy/models`**：下拉框的真实枚举（`llm.listProviders()` + `listModels()`），
  宿主侧缓存 10 分钟、监听 `llm/adapters-updated` 主动失效；`GET /api/memorybuddy/consolidate-status`
  是轻量轮询目标（全量快照要重读所有文档并重算 sha1，不适合每 2 秒拉一次）。
- **面板「提炼模型」卡片**：下拉选项 = `name（provider/id）· 免费`；选中即经 `llm.resolveModelInfo`
  校验（可用 → 上下文窗口与思考档位；不可用 → 红字原因）；`modelChoiceEffort` 的选项来自该模型真实的
  `reasoning.efforts`，不写死档位；`off` 置灰整卡；「加入白名单」按钮在自选越界时出现。
  快照新增 `runtime` 块（`running` + 自选模型现状）——刻意**不落盘**，崩溃后 `running: true` 就是一句谎话。
- 面板「整理时机」一行升级为完整的模型运行记录（`consolidation.model`）：用了哪个模型、多少 token、
  是否回退、未执行原因。

### 修复

- **prepared 调用按解析后配置分发**：`prepareCall` 返回的是冻结的单次句柄，其 `stream()` 用
  `callConfigEquals` 逐字段比对请求与**已解析**配置（默认 effort / maxTokens 已物化），
  直接展开输入配置会报 `INVALID_PREPARED_CALL`。现在用 `{...handle.config, messages, system, signal}` 分发。
- **消息内容必须是块数组**：DSH 适配器按 `message.content.some(…)` 走**类型化块**（`{type:'text', text}`），
  传字符串会报 `content.some is not a function`（UNKNOWN）。构造输入改为块数组。
- `state.json` 新增 `lastModelRun`：重启不丢失「上次哪个模型跑了、结果如何」这唯一的模型侧记录。
- 调试可见性：插件日志在 `dsh web` 组合下有 stderr 镜像（原 logger 无落盘目标，模型失败的真实报错完全不可见）。

### 验证

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `node tools/verify-bundle.mjs` | 10/10 |
| `node tools/verify-client-factory.mjs` | 13/13 |
| `node tools/verify-headless.mjs` | 11 passed, 0 failed |
| `node tools/verify-host.mjs` | 49/49（七条路由断言） |
| `node tools/verify-schedule.mjs` | 14/14 |
| `node tools/verify-model.mjs`（新增） | **30/30**（预算、冷却、白名单、隐私、块数组消息等） |
| `node tools/verify-replay.mjs`（已结束的真实会话日志） | 14/14 |

真机验证：影子实例（独立 `DSH_HOME` + `.credentials.yaml`，端口 19411）实测全链路——
真实模型调用成功（`deepseek-account/deepseek-flash`，322–470 token），候选经确定性合并后模型按预期返回
空 diff（`应用 0 条`），冷却表只出现单层键，`off` / 自选 / 空闲轮次的面板文案均正确；
`MISSING_CREDENTIAL` 被正确归类为 `auth` 并写 24h 冷却。

## [0.3.0] - 2026-10-16

**P4 自动整合闭环**：整合不再只靠手点。四个触发（启动补齐 / 空闲 / 会话结束 / 固定时间）真正接上了，
整理结果（待确认问题、整理历史、一键回滚）第一次出现在面板里，而「重置」不再是重置一个索引文件，
而是把全部记忆归档。

### 新增

- **触发调度器** `src/host/schedule.ts`：`consolidateOn` 的四个取值第一次真正生效。
  - `startup-idle`（默认）：启动 90 秒后补一次 + 空闲 `consolidateIdleMinutes`（默认 10 分钟）触发一次。
  - `idle`：只按空闲触发，不做启动补齐。
  - `session-end`：会话结束（`session/flush` / `session/disposed`）后 15 秒防抖触发。
  - `fixed`：每天到 `consolidateFixedTime`（默认 03:00）触发一次；默认关闭。
  - 统一闸门：距上次整理 ≥ `consolidateIntervalHours`（默认 24 小时）**且**有待整理的会话笔记；
    单次最多 20 个；`conversationMemory` 关闭时不触发。所有定时器挂在 `ctx.effect()` 上，热重载不留残留。
- **待确认问题上浮**：整理过程中产生的冲突与「这条还成立吗」不再只写进日志，
  `MemorySnapshot.questions` 把它们送到面板的「待你确认」卡片，可逐条「知道了」（`dismiss-question`）。
- **整理历史与回滚**：新增 `GET /api/memorybuddy/journal?date=`，面板新增「整理历史」卡片
  （查看当天日志 / 回滚到这一天）。回滚会把当前状态先备份到 `journal/<日期>/rollback-<时间>/`，
  再把当天 `journal/<日期>/backup/` 里的文件写回去。
- **「重置」改为归档全部**：`reset-all` 把 `memory/`、`sessions/`、`journal/`、`skills-draft/`、
  `profile.md`、`instructions.md` 移入 `archive/reset-<时间戳>/` 并重建空骨架——**不删除任何文件**。
- 面板「整理时机」一行改为显示宿主的真实阶段（`consolidation.modelNote`），而不是永远显示同一句占位文案。

### 修复

- **`state.json` 并发写入会丢数据**：`writeState()` 只做原子写、没有加锁，而整合与采集都是
  「读—改—写」。此前窗口只有几毫秒，P4 加入模型阶段后窗口可达数十秒，期间任何一个会话的
  水位线写入都会被整份覆盖（`processed` / `pending` 回退、会话被重复整理）。现在
  `writeState()` 在 `withFileLock` 内写入，并新增 `patchState()` 供读改写使用；
  采集的水位线与整合的 `pending` / `lastConsolidateAt` / `questions` 都改走它。
- **回滚会吃掉自己的备份**：`rollback(date)` 把「回滚前的状态」备份进了它正要恢复的那个目录，
  当回滚目标就是当天时，恢复出来的正是被改坏的内容——且没有任何报错。
  现在改为**先把要恢复的字节读进内存**，再把被替换的状态快照到独立的
  `journal/<日期>/rollback-<时间>/`，源备份保持原样、可以反复回滚。
- 手动「立即整理」不再阻塞浏览器：动作立即返回 `202 {"started":true}`，面板改为轮询
  （2 秒一次，最多 6 次）读取结果——此前一次带模型阶段的整理可能跑几十秒，
  而浏览器请求 15 秒就超时，超时后 `Consolidator.running` 还会把后续触发全部拒掉。
- 日志前缀重复：`collector.ts` / `consolidate.ts` / `routes.ts` 里的 `memorybuddy: ` 与
  `src/index.ts` 已加的 `dsh-memorybuddy: ` 叠成双前缀，已去掉多余的一层。
- `store.ts` 中 `resetDocument()` 的声明与首条语句挤在同一行，已拆开。

### 验证

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `node tools/verify-bundle.mjs` | 10/10 |
| `node tools/verify-client-factory.mjs` | 13/13 |
| `node tools/verify-headless.mjs` | 11 passed, 0 failed |
| `node tools/verify-host.mjs` | **49/49**（0.2.0 为 35/35） |
| `node tools/verify-schedule.mjs`（新增） | 14/14 |
| `node tools/verify-replay.mjs`（已结束的真实会话日志） | 14/14 |

真机验证：用影子实例（独立 `DSH_HOME` + `--profile mbp4`，端口 19411）实测「启动补齐」在启动约
90 秒后自行触发，写入 `journal/2026-10-16.md`、备份 5 个文件、`pending` 清空。

## [0.2.0] - 2026-10-16

**重命名发布**：项目正式定名 **memorybuddy**，插件内所有属于本项目自身的 `workbuddy` 标识
改为 `memorybuddy`，以便与用户电脑上已有的 workbuddy 系列（`dsh-workbuddy-xdpool` 插件、
`.workbuddy-*.json` 模型目录）区分开。**别人的 workbuddy 一律未动。**

### 变更（破坏性）

| 项目 | 0.1.0 | 0.2.0 |
|---|---|---|
| 包名 | `dsh-workbuddy-memory` | `dsh-memorybuddy` |
| 数据目录 | `$DSH_HOME/dsh-workbuddy-memory/` | `$DSH_HOME/dsh-memorybuddy/` |
| bundle 条目 id | `workbuddy-memory` | `memorybuddy` |
| HTTP 前缀 | `/api/workbuddy-memory` | `/api/memorybuddy` |
| 提示词 section | `plugin:workbuddy-memory` | `plugin:memorybuddy` |
| 工具名 | `workbuddy_memory` / `workbuddy_remember` / `workbuddy_forget` | `memorybuddy_recall` / `memorybuddy_remember` / `memorybuddy_forget` |
| 面板 id / DOM 锚点 | `workbuddy` / `data-dsh-workbuddy-view` | `memorybuddy` / `data-dsh-memorybuddy-view` |
| 两个设置页 id | `workbuddy-personalize` / `workbuddy-memory` | `memorybuddy-personalize` / `memorybuddy-memory` |
| CSS 类前缀 | `wb*` | `mb*` |
| 界面文案（zh/en） | `WorkBuddy` | `MemoryBuddy` |

- 工具 `workbuddy_memory` 改名为 `memorybuddy_recall`（不叫 `memorybuddy_memory`，避免叠词）。
- **不提供旧名别名**：0.1.0 未公开发布，无人依赖旧名；别名会把旧名永久留在代码里。
- 界面文案随之改动，因此与参考截图相比文字有出入（布局、间距、字号不变）——这是有意为之。

### 迁移（从 0.1.0 升级）

数据目录名变了，**升级前请先关闭 DSH Desktop**（否则旧插件会继续写旧目录、并在迁移后又把它重建出来）：

```powershell
# 1) 备份（可选，但强烈建议）
Copy-Item "$env:DSH_HOME\dsh-workbuddy-memory" "$env:DSH_HOME\dsh-workbuddy-memory.bak" -Recurse

# 2) 应用已关闭的前提下，改目录名
Move-Item "$env:DSH_HOME\dsh-workbuddy-memory" "$env:DSH_HOME\dsh-memorybuddy"
```

目录内**没有任何文件需要改内容**：`state.json` 用的是相对路径，`preferences.md` / `profile.md` /
`instructions.md` / `memory/*.md` 只存记忆内容本身。只有会话笔记里的 `workspace:` 字段提到仓库路径，
那是**工作目录**、不是数据目录名，与本次改名无关。

然后卸载旧包、装入新包（应用内插件管理界面，或 `dsh plugin --profile <名> remove dsh-workbuddy-memory`
后 `add link:<仓库路径>`），重启应用。旧记忆内容会原样出现在面板里。

### 修复

- 本次升级会一并加载 0.1.0 后期修好的宿主半边——此前一直未生效的三处采集缺陷
  （助手回复被丢弃、工具名退化成字面量 `tool`、晚装载的会话看不到历史）在重启后生效。

## [0.1.0] - 2026-10-15

首个发布。覆盖规划中的 **P0–P3**。

### 新增

**P0 骨架**

- 双面插件包结构：`src/index.ts`（宿主半边，Node）与 `src/client/*`（浏览器半边），
  由 `build.mjs` 一次构建出 `lib/index.js` 与 `lib/client.js`。
- 浏览器半边按 DSH 模块加载器的线格式封装（`window.__ModuleLoader__.load({ id, factory })`），
  只向加载器请求 `react`、`react/jsx-runtime` 与 `@deepseek-ai/dsh-client-ui-primitives`。
- `cordis.patch.yml`：一行 `insert` 同时挂载两半。
- 一级侧边栏面板（`sidebar.panellist` + `main`，order 30），左栏两行——个性化 / 记忆与进化。
- 两个原生设置页（`settings.section`，order 30 / 31），与面板共用同一套卡片组件。
- 应用内 CSS 注入：每个样式表一个 `<style>` 标签，用 `data-plugin-css` 幂等去重；
  配色一律走 `--dsw-alias-*` 与导航专用的 `--dsw-specific-sidebar-nav-item-*` 令牌。

**P1 存储层**

- 数据根目录解析自 `DSH_HOME`，回退 `~/.dsh`，再拼 `dsh-workbuddy-memory/`（0.2.0 起为 `dsh-memorybuddy/`）；代码里不含任何硬编码用户路径。
- markdown + YAML front-matter 读写（自带最小 YAML 实现，不引入运行时依赖）。
- 原子写：临时文件 + rename，并对 Windows 的瞬时 `EACCES`/`EBUSY`/`EPERM` 做重试退避。
- 文件锁（`.lock` 同级文件）让并发写不丢数据：基于修订号校验，冲突时返回 409 并**把磁盘上的内容一起带回**，
  让调用方可以合并而不是盲目覆盖。
- `state.json`：采集水位线、待整理队列、模型冷却表。
- 默认模板全部是空骨架；人设默认只有「你是 DSH同学，我最好的助手。」。
- 写入前脱敏：六类密钥/令牌/口令模式命中即替换为 `［已隐去］` 并拒绝落盘。

**P2 面板 UI**

- 个性化页：称呼、名字、回复风格、欢迎语、显示文件修改过程、给 WorkBuddy 的指令、人设设定、长期记忆。
- 记忆与进化页：对话记忆 / 本地记忆与技能开关、管理记忆（重置 / 编辑 / 导入）、立即整理、
  上次与下次整理时间及触发条件、长期记忆 markdown 渲染与编辑、按主题分组的条目管理（置顶 / 遗忘）、
  会话列表、隐私说明与「复制记忆目录路径」。
- 每张卡片自带编辑/保存/取消，保存走带修订号校验的 HTTP 路由；`Ctrl+S` 保存、`Esc` 取消。
- 搜索框：在个性化下按标题/说明过滤卡片，在记忆与进化下检索条目并高亮命中。
- 中英双语文案（`zh` / `en`），按 DSH 语言设置自动切换。
- 冲突对话框：本机出现并发写时由你决定保留哪一份。

**P3 采集**

- 订阅 `session/event` 采集全部会话；只关心 `user/message`（且 `source.kind === 'user'`）、
  `assistant/message`、`tool/call`、`tool/result`、`turn/end`。
- `tool/result` 与 `tool/call` 按 `callId` 关联：**只记工具名与成败，不记正文**。
- 节流落盘：默认 5 秒或每 20 条事件刷一次；`session/flush` 强制排空。
- 会话笔记写入 `sessions/<YYYY-MM-DD>/<session-id>.md`，含「做了什么 / 观察到的工作习惯候选 / 项目相关 / 未决事项」四节。
- 开关关闭即停：`conversationMemory = false` 时立即停止采集并清空内存缓冲，不缓存、不落盘。
- 确定性整理：扫描待整理的会话笔记、按 0.75 的相似度阈值去重合并、升级置信度、按天衰减归档、
  重建 `memory/index.md`；**先备份再写入**，会话笔记只有在内容确实落盘之后才会被标记为已整理。

**Agent 工具与命令**

- `workbuddy_memory`：检索长期记忆；不传 `query` 时返回记忆索引与各主题条数。
- `workbuddy_remember`：主动记下一条事实（先跑脱敏检查，命中密钥就拒绝）。
- `workbuddy_forget`：软删除一条记忆，移入 `archive/`。
- `/memory` 命令：`状态` 看概况，`整理` 立即执行一次确定性整理。

**文档与发布准备**

- `README.md`（中文为主 + 英文摘要）、MIT `LICENSE`、本更新日志、`.gitignore`。
- 提交 `lib/` 构建产物：克隆后无需安装任何 devDependency 即可直接装载。

### 已知限制

- **不做模型提炼**：首版整理只做确定性工作，面板如实显示「模型提炼未启用（首版）」。
- 采集靠订阅，只能看到插件装载之后发生的事件；装载时已在运行的会话，其早期消息不在记忆里。
- 原生设置页的导航图标固定为 DSH 外壳的默认图标，第三方 section 无法自定义。
- 「打开记忆目录」在纯网页环境里没有对应系统调用，实际行为是复制路径到剪贴板。

### 修复

- **无 GUI 的组合里插件不再消失**：`webServer` 从 `inject` 里去掉，改为用 `ctx.get()` 软探测。
  此前在没有 web 服务的 `dsh headless` 组合里，硬依赖会让整个插件停在 pending——
  不只是少几条 HTTP 路由，而是采集、工具、注入全部不生效，CLI 只报告
  `dsh: warning: 1 entry did not activate`。
- **软探测必须走 `ctx.get()`**：Cordis 的 context 是代理，读取任何未在 `inject` 里声明的属性都会抛
  `Error: cannot get property "webServer" without inject`，直接 `ctx.webServer` 判空会在无头组合里崩掉 `apply`。
- **验收脚手架不再掩盖这个错误**：`tools/verify-host.mjs` 的桩上下文原先把 `webServer`
  暴露成普通属性，与真实代理语义不符，因此测不出上面那个问题；现已改为只经 `get()`
  暴露可选服务、其余属性一律抛错，并新增 `tools/verify-headless.mjs` 专门回归无头组合。
