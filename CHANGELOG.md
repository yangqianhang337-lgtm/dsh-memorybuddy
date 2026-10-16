# 更新日志

本项目遵循[语义化版本](https://semver.org/lang/zh-CN/)。

> 说明：0.1.0 一节保留发布当时的原文（那时本项目尚未正式命名），其中出现的旧名与旧工具名
> 是当时的事实记录，不再改写；改名本身记录在 0.2.0 一节。

## [1.0.0] - 2026-10-16

**P8 隐私收尾与发布**：补齐 `memory-plan.md` §5.2 黑名单剩下的三条（`.no-memory` / PII / 防投毒），
并给出全插件**唯一不可撤销**的操作「彻底删除」。至此 P0–P8 路线图全部交付。

### 新增

- **`.no-memory` 标记** `src/host/privacy.ts`：工作目录里放一个 `.no-memory` 文件，
  这个目录下的会话**一条笔记都不写**（拍板 m04340 的形态：文件跟着仓库走，`git status` 看得见）。
  判定在采集器拿到第一个事件**之前**做出，而不是事后过滤——「整会话不采集」如果只是
  「先收下再删掉」，那么缓冲期间的事件仍然进过内存。
  同名的**目录**不算标记（一个误建的文件夹不该静默关掉记忆）；
  「查不到」一律当作**没有标记**（把「无法判断」解释成「不记」会让每个 stat 失败的会话都失去记忆，
  而这个失败模式完全不可见）。
- **PII 检测**：身份证号、银行卡号、手机号、固定电话——命中的**整行被略去**并在面板告警；
  密钥类仍是**就地隐去**，保留句子本身。过滤点是 `store.writeSessionNote`，
  即**所有会话笔记的唯一入口**。银行卡号校验 Luhn 位，否则每一个 16–19 位数字串
  （提交哈希、时间戳、订单号）都会被误判，而那会把技术项目的记忆整片抹掉。
- **「彻底删除」**：面板底部新增「危险区」卡片，要求**手打 `DELETE`**（大小写敏感）才执行。
  删掉整个记忆根 + **本插件批准过的**技能；`$DSH_HOME/skills/` 是共享目录，
  用户自己写的或别的工具装的技能不在其列。`WIPE_CONFIRMATION` 与面板共用同一个常量，
  宿主**重新校验**而不是相信客户端已经弹过窗。
- `POST /api/memorybuddy/action {"action":{"kind":"wipe-all","confirm":"DELETE"}}`。
- `approved-skills/` 索引：记录本插件批准过的技能名，供彻底删除识别。
  识别同时看技能文件自己的 `source: memorybuddy-evolved`，
  所以**旧版本批准的技能也删得掉**（索引是后加的，早先的批准它没看见）。

### 修复

（这些是自查发现的，交付前已全部修掉；见下方「验证」的变异测试）

- **PII 曾能绕过插件的主要数据路径**：`redact()` 原本只接在 `memorybuddy_remember` 工具和
  面板编辑器上，而**会话笔记这条主路径完全没接**——采集器把用户说的话原样写进
  `sessions/`，下一次整理就把 `(候选 · …)` 提升进主题文件，也就是每次对话都会注入的
  `memory/index.md`。实测确认过一次：手机号与身份证号确实落进了 `preferences-learned.md`。
  现在过滤在 `writeSessionNote` 这个唯一入口上。
- **front-matter 也要过滤**：笔记的 `title` 是用户第一句话的摘要，
  以手机号开头的一段对话会把号码写进标题，而面板的会话列表**直接渲染它**。
- **彻底删除后数据会自己长回来**（两条路径，都很安静）：
  ① 正在缓冲的会话会在下一个节拍里把记忆根连同内容一起重建；
  ② 删除动作的响应里带着 `snapshot()`，而 `snapshot()` 内部会 `ensure()`——
  同一次响应就把刚删掉的骨架建回来了。现在删除前先 `forgetAll()` 丢弃缓冲，
  删除后的响应**不带快照**，面板改为重新拉取。
- **`.no-memory` 只在会话开始时判一次**：标记出现在会话进行中时，之后的内容仍然会被记。
  计划原文写的是「采集器挂载与**会话事件时**检查」，且中途放文件的人要的是「现在就别记了」。
  现在在 `observe` / `flush` / `dispose` 三处都查。
- **标记缓存只缓存肯定答案**：原来正反两面都缓存，于是「把文件丢进正在跑的项目」
  会有一段盲区在继续采集。现在只缓存「已标记」——
  缓存肯定答案最坏只是让一个**本就退出**的会话晚一会儿结束；
  缓存否定答案则会让一个**刚退出**的会话继续被记，这个方向不能错。
- **防投毒原本是装饰性的**：采集器里写的是「遍历 `userLines` + 一行永远不可能触发的守卫」，
  守卫删掉毫无影响，安全性质其实全压在循环变量上。现在遍历**全部事件**、
  由 `isUntrustedEvent` 过滤——这样删掉守卫就会立刻放进助手文本，规则才真正承重。

### 验证

| 检查 | 结果 |
|---|---|
| `npx tsc --noEmit` | 通过 |
| `node build.mjs` | `lib/index.js` 185.4 kb / `lib/client.js` 130.1 kb |
| `tools/verify-privacy.mjs`（新增） | 27/27 |
| `tools/verify-host.mjs` | 59/59（新增 7 条 P8-1 路由检查：确认词、响应无快照、缓冲不复活根） |
| `tools/verify-skills.mjs` | 31/31 |
| `tools/verify-schedule.mjs` | 14/14 |
| `tools/verify-model.mjs` | 30/30 |
| `tools/verify-project.mjs` | 16/16 |
| `tools/verify-bundle.mjs` | 10/10 |
| `tools/verify-client-factory.mjs` | 13/13 |
| `tools/verify-headless.mjs` | 11 通过 / 0 失败 |

`verify-privacy.mjs` 覆盖：PII 命中与**不误判**（提交哈希 / 时间戳 / 订单号 / 校验位错误的「卡号」都保留）、
**经由真实写入路径**（会话笔记 → 整理 → 主题文件）全程无 PII、
助手注入文本不成为候选而用户偏好照常采集、
`.no-memory` 目录（含会话中途出现）不产生笔记且不被跟踪、普通目录照常工作、
彻底删除真的删（而非挪走）、错确认词与空确认词都拒绝且**什么都没删**、
只删本插件批准的技能而**用户手写的技能存活**、先 `forgetAll()` 再删时缓冲不会把记忆根写回来。

**变异测试**：逐条撤掉上面每一个修复重跑验证器，**10 处改动全部被捕获**
（笔记正文过滤、front-matter 过滤、确认词校验、技能范围、根目录真删、标记整体移除、
标记只在创建时查、防投毒守卫失效、删除后返回快照、不丢弃采集缓冲）——
否则这些检查只是自证的摆设。

## [0.6.0] - 2026-10-16

**P7 技能进化**：补上 `skills-draft/` 一直缺的**生产者**。整理时从已合并的记忆里识别
「同一类操作重复 ≥3 次、跨 ≥2 个日期」，自动生成一份技能草稿到 `skills-draft/<名>/SKILL.md`；
面板给出三级提示（侧边栏红点 + 顶部横幅 + 待批准卡片），详情弹层展示完整内容、目标写入路径与来源会话，
并提供 **批准 / 编辑后批准 / 忽略** 三个按钮。**草稿自动生成，但绝不自动写入 `$DSH_HOME/skills/`**——
只有点「批准」才落盘。30 天未处理的草稿移入 `archive/skills-draft/`（不删除）。

### 新增

- **草稿生成器** `src/host/skills.ts`：三类信号按固定优先级挖掘——
  ① 项目约定（`memory/projects/<slug>.md` 里已被合并的事实）② 长期记忆条目（跨日期被佐证的条目）
  ③ 工具组合（同一项目里反复共现的**相邻工具对**，≥2 个工具才入选，`read`/`grep`/`pwsh` 等高频噪声工具被剔除）。
  ① ② 复用**整理阶段已经做出的合并判断**（不重新实现去重），③ 才回读原始会话笔记（上限 200 条）。
  **全程确定性，不调模型**：一份草稿的出现与否取决于远端调用的心情，批准提示就无法诚实。
- **草稿文件格式**：`name` / `title` / `description` / `whenToUse` / `source: memorybuddy-evolved` /
  `derivedFrom` / `repeats` / `dates` / `createdAt`，正文是**证据摘要**（步骤 + 出现次数 + 跨哪些日期 + 来源会话），
  不是编造的流程——声称用户从未做过的步骤就是冒用本插件名义的编造。
- **存储层** `src/host/store.ts`：`writeSkillDraft` / `draftExists` / `readDraft`（完整文件文本、
  目标路径、来源会话）/ `archiveStaleDrafts`（30 天 TTL）/ `ignoreDraft`（移入 `archive/skills-draft/`，
  不是删除）/ `approveDraft(name, text?)`（`text` 是「编辑后批准」通道，落盘的就是用户改过的那份）。
- **整理管线第 5.1 步** `src/host/consolidate.ts`：`skillStage()` 排在**写入之后**，
  这样今天刚被佐证到中/高的约定当轮就能出草稿，不用等下一次整理；先生成后归档，
  避免把当天新建的草稿立刻当成过期。报告新增 `draftsCreated` / `draftsArchived`。
- **详情弹层** `src/client/cards.tsx` `DraftDialog`：完整内容预览 + 目标写入路径 + 来源会话列表，
  预览与编辑器是**同一份文本**的两个视图——所以「编辑后批准」写出的字节就是用户刚看过的那份。
- **`GET /api/memorybuddy/draft?name=`**：读单份草稿全文；404 表示「已经处理完了」，
  而不是报错（弹层可能比批准按钮慢一拍）。
- **`ignore-draft` action**：忽略 = 归档，不是丢弃。
- 草稿目录名做**路径穿越校验**（`isSkillName`），因为 `name` 来自 HTTP body 而它是 `$DSH_HOME/skills/` 下的路径段。

### 修复

- **证据日期不再说谎**：合并后的条目只记 `first` / `last` 两个端点，早期实现直接拿它们当
  「跨 N 个日期」上报，出现过「3 次会话、跨 3 个日期」却只列 2 个日期的情况。
  现在从 `derivedFrom` 的路径里还原**真实日期集合**，日期数不够就不生成草稿——
  一份无法列出自己日期的草稿，不该声称自己「跨 ≥2 个日期」。
- **`approve-draft` 曾是一个写入原语**（自查发现）：带 `text` 的批准不再校验草稿是否存在，
  于是 `{"kind":"approve-draft","name":"任意合法名","text":"<任意内容>"}` 能往
  `$DSH_HOME/skills/` 写一个**从未作为草稿存在过**的技能文件，而 DSH 会自动加载该目录下的每个技能。
  现在恢复「草稿必须存在」的前置条件（名字合法 ≠ 有待批准草稿），并拒绝空 `text`——
  `text ?? source` 会让 `''` 顶掉真实草稿，把用户正在编辑的技能批准成 0 字节并顺手删掉草稿。
- **已批准的技能不再反复变回待批准草稿**：生成器的「已存在」检查原先只看 `skills-draft/`，
  用户批准后下一轮整理会重新提炼出**一模一样**的草稿，与他刚批准的技能抢注意力，
  30 天后还会被当成无人处理归档掉。现在同时检查 `$DSH_HOME/skills/`。
- **归档草稿不再被一个坏名字卡死**：`archiveStaleDrafts` 逐个 `try`，
  目标目录已存在时 `movePath` 抛 `EPERM`（忽略过同名草稿后重新生成就会遇到），
  以前这会让该名字之后的所有草稿都停止归档。
- **`text` 的运行时类型校验**：它是本插件唯一会变成 skills 根下**文件内容**的路由字段，
  非字符串 body 以前会直接进 `writeFileAtomic`（先建目录再抛 500）。
- **移除 `discard-draft`**：它是一个**真删除**（不归档）的活路由，且 P7 后已无任何 UI 调用方——
  与「绝不真删」相悖，留着只是风险。改用 `ignore-draft`（归档）。
- `readDrafts()` 用 `isSkillName` 过滤目录名：不合法的名字批准/编辑/忽略都会被拒，
  列出来只会渲染一张每个按钮都点不动的卡片。

### 验证

| 检查 | 结果 |
|---|---|
| `npx tsc --noEmit` | 通过 |
| `node build.mjs` | `lib/index.js` 173.6 kb / `lib/client.js` 124.4 kb |
| `tools/verify-skills.mjs`（新增） | 31/31 |
| `tools/verify-host.mjs` | 52/52（新增 3 条 `/draft` 路由检查，路由数 7 → 8） |
| `tools/verify-schedule.mjs` | 14/14 |
| `tools/verify-model.mjs` | 30/30 |
| `tools/verify-project.mjs` | 16/16 |
| `tools/verify-bundle.mjs` | 10/10 |
| `tools/verify-client-factory.mjs` | 13/13 |
| `tools/verify-headless.mjs` | 11 通过 / 0 失败 |

`verify-skills.mjs` 覆盖：判据两半**各自独立**（2 次跨 2 日不生成、3 次跨 3 日生成、
3 次**同一天**也不生成、同一条目改成跨 2 日即生成）、草稿落盘路径与 front-matter 字段、
正文证据段、**生成阶段绝不碰 `$DSH_HOME/skills/`**、批准后草稿列表清空（红点与横幅消失）、
**编辑后批准写的是改过的文本**且 front-matter 保留、
**已批准的模式不会再次变成待批准草稿**、忽略移入 `archive/skills-draft/`、
31 天草稿被归档而当天草稿留存、二次整理不覆盖已有草稿、
批准的两个前置条件（无草稿不写、空 `text` 回退到草稿）、路径穿越名校验、仓库零污染。

**变异测试**：逐条撤掉上述修复重跑验证器，6 处改动**全部被捕获**（写入原语、空 `text`、
重生循环、判据两半、噪声工具过滤），确认这些检查不是自证的摆设。

## [0.5.0] - 2026-10-16

**P6 项目级记忆**：整理时把会话笔记「项目相关」一节里的实事，按工作目录归档成每个项目一份的
`memory/projects/<项目名>.md`——构建命令、约定、路径这类「只属于这个项目」的记忆，
与四个主题记忆互相独立。只有工作目录匹配的会话才注入它的 `【本项目记忆】`。

### 新增

- **项目实事提取** `src/host/project.ts`：从会话笔记的 `## 项目相关` 一节逐行提取
  （跳过 `（无）` 和「…：本会话的工作目录」自述行），slug 取工作目录**最后一段**（保留中文，最长 64 字符）；
  工作目录为空的会话不产生候选。
- **整理管线第 3.1 步** `src/host/consolidate.ts`：项目阶段排在确定性合并之后、模型提炼之前，
  复用与主题记忆同一套合并（相似度 ≥0.75 判重）、冲突（矛盾上浮待确认）、置信度机制；
  单个项目文件写失败不影响整轮整理（只记一条待确认问题）。整理报告新增
  `projectAdded` / `projectMerged` / `projectFiles`，日志出现「项目记忆：新增 N 条 · 合并 M 条（…）」。
- **存储层** `src/host/store.ts`：`readProjectEntries` / `writeProjectEntries`（带文件锁，
  front `kind: project-memory`）/ `readProjects`（按更新时间倒序）/ `archiveProject`
  （slug 白名单校验，移入 `archive/projects-<名>-<日期>.md`）；快照新增 `projects` 数组，
  每个项目文件同时挂进 `documents` 供面板编辑。
- **面板「项目记忆」卡片**：列出所有项目（名称 / 条数 / 更新日期），支持直接编辑整篇 markdown
  （走普通 `/save` 通道，带修订校验），「归档此项目」二次确认后归档；中英文案齐备。
- **`forget-project` action**：`POST /api/memorybuddy/action {"action":{"kind":"forget-project","slug":"…"}}`。
- **注入修复** `src/host/prompt.ts`：`prime()` 现在会重读已登记的项目文件——
  整理刚写入的项目实事，下一次会话注入就能带上，不用等工作目录变化。
  `watchProject` 在工作目录**变化时**才登记（不变的不重复登记，prime 负责刷新）。

### 验证

| 检查 | 结果 |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | 通过 |
| `node build.mjs` | `lib/index.js` 155.9 kb / `lib/client.js` 117.2 kb |
| `tools/verify-project.mjs`（新增） | 16/16 |
| `tools/verify-bundle.mjs` | 10/10 |
| `tools/verify-client-factory.mjs` | 13/13 |
| `tools/verify-headless.mjs` | 11 通过 / 0 失败 |
| `tools/verify-host.mjs` | 49/49 |
| `tools/verify-schedule.mjs` | 14/14 |
| `tools/verify-model.mjs` | 30/30 |
| `tools/verify-replay.mjs`（真实会话日志） | 14/14 |

`verify-project.mjs` 覆盖：提取与合并进 `memory/projects/<slug>.md`、slug 映射（含中文路径）、
自述行与 `（无）` 跳过、项目阶段对主题记忆是**加法**、重复实事合并不重复落行、
仓库零污染（全部写入都留在 `$DSH_HOME`）、快照与归档回路、
`【本项目记忆】` 只注入工作目录匹配的会话、整理写入的实事下一次 `prime()` 即生效。

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
