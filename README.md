# dsh-memorybuddy

把 MemoryBuddy 的**个性化设置**与**跨会话长期记忆**存成你自己能看、能改、能带走的 markdown 文件，
并在 DeepSeek Harness 里提供**一个一级侧边栏面板**和**两个原生设置页**。

- 数据全部落在 `$DSH_HOME/dsh-memorybuddy/`，就是普通 markdown，随时手改。
- 插件本身不写入你的项目仓库，也不写入 `AGENTS.md`。
- 删除插件不会删除你的记忆；怎么彻底清理由你决定（见「卸载与数据清理」）。

> **English abstract** — A dual-sided DeepSeek Harness plugin that stores personalization
> (`profile.md`, `instructions.md`, `preferences.md`) and cross-session memory
> (`memory/*.md`, `sessions/<date>/*.md`) as plain hand-editable Markdown under
> `$DSH_HOME/dsh-memorybuddy/`. It ships one first-level sidebar panel and two native
> settings pages, injects a compact memory section into every turn's system prompt, and
> exposes three agent tools (`memorybuddy_recall`, `memorybuddy_remember`, `memorybuddy_forget`)
> plus a `/memory` command. Consolidation is closed-loop: scheduled triggers, a question
> card, journal history with rollback, and (since 0.4.0) model distillation — the user may
> pick the model, otherwise a free-first candidate chain is tried, both behind an
> allowlist and cooldown table; only candidate/profile summaries are ever sent to a model,
> never raw dialogue.

---

## 功能

### 一级侧边栏面板

装好后侧边栏多出一行 MemoryBuddy 图标（排在「插件」「定时」之后），点开是一个两栏面板：

```
┌──────────────┬──────────────────────────────────────────┐
│ 🔍 搜索       │  个性化                                   │
│              │  ┌────────────────────────────────────┐  │
│ 个性化        │  │ 称呼 / 名字                         │  │
│ 记忆与进化 ●  │  │ 回复风格 / 欢迎语 / 显示文件修改过程   │  │
│              │  ├────────────────────────────────────┤  │
│              │  │ 给 MemoryBuddy 的指令     [编辑]       │  │
│              │  ├────────────────────────────────────┤  │
│              │  │ 人设设定                [编辑]       │  │
│              │  ├────────────────────────────────────┤  │
│              │  │ 长期记忆          [编辑] [预览]      │  │
│              │  └────────────────────────────────────┘  │
└──────────────┴──────────────────────────────────────────┘
```

左栏只有两行——**个性化**和**记忆与进化**——不重复设置里已有的其它入口。
**记忆与进化**右侧出现红点时，表示有待你处理的技能草案。

搜索框是真的在工作：在「个性化」下按标题/说明过滤卡片，在「记忆与进化」下检索命中的记忆条目并高亮。

### 两个原生设置页

同一个面板内容也注册成设置对话框里的两页（`设置 → 个性化`、`设置 → 记忆与进化`），
与面板共用同一套卡片组件。原生设置页的图标由 DSH 外壳决定（第三方 section 拿不到自定义图标），
所以这里显示的是默认齿轮图标——这是刻意接受的差异。

### 个性化

| 卡片 | 存到哪 | 说明 |
|---|---|---|
| 称呼 / 名字 | `preferences.md` | 注入系统提示时的「称呼：X · 助手名：Y」 |
| 回复风格 | `preferences.md` | 默认 / 简洁 / 详细 / 教学 / 直接 |
| 欢迎语 | `preferences.md` | 关闭后不再有开场白 |
| 显示文件修改过程 | `preferences.md` | 是否展示改动细节 |
| 给 MemoryBuddy 的指令 | `instructions.md` | 只写要求，例：`回答尽量简洁，先给结论` |
| 人设设定 | `profile.md` | 身份、性格、表达风格，对所有回复生效 |
| 长期记忆 | `memory/index.md` | 跨会话沉淀的结论，可编辑也可只看预览 |

### 记忆与进化

- **对话记忆**开关：关掉后**立刻停止采集**，不缓存、不落盘（`sessions/` 不再增长），自动整理也随之停下。
- **本地记忆与技能**开关：控制本地记忆技能与技能草案。
- **管理记忆**：`重置`（二次确认后把全部记忆归档到 `archive/reset-<时间戳>/` 并重建空骨架，**不删除**）、
  `编辑`（整篇 markdown 进编辑态）、`导入`（选一个 `.md` 合并进长期记忆）、`历史`（看每天的整理日志与备份清单）。
- **立即整理**：请求一次整理后**立刻返回**，面板自己轮询结果——整理慢也不会让按钮显示成失败。
- **待你确认**：整理遇到互相矛盾的条目、或某条高置信度记忆太久没有新佐证时，会把问题列在这里，
  每条一个「知道了」。问题存在 `state.json` 里，重启后仍在。
- **整理历史**：按日期列出每次整理的日志正文与当天备份的文件清单，`回滚到这一天` 把备份还原回去；
  回滚前会先把**当前**状态再备份一次，所以回滚本身也能回滚。
- **提炼模型**：整理的最后一步可以交给模型做「提炼」（只发候选摘要与画像摘要，**绝不发原始对话**）。
  不选就是「自动（免费优先）」：按 用户自选 → 免费档 → 已配置的第三方 → 会话默认 → 任意可用 的顺序
  逐个尝试；选了某个模型就优先用它，失败自动回退到这条链。失败按类别写冷却表，同一模型不会被连撞两次；
  `modelAllowlist` 非空时是**硬边界**，自选模型也受它约束。整轮限 60 秒预算、最多试 2 个候选。
- **项目记忆**：整理时从会话笔记的「项目相关」一节提取本项目的实事（构建命令、约定、路径……），
  按**工作目录**归档到 `memory/projects/<项目名>.md`，与四个主题记忆互相独立。
  只有工作目录匹配的会话才会注入它的 `【本项目记忆】`（≤ 1200 B），别的项目读不到；
  面板里可以查看条数、直接编辑、或「归档此项目」把整个文件移进 `archive/`。
  仓库零污染：项目记忆只写 `$DSH_HOME`，你的项目目录一个字节都不会碰。
- **技能草稿**：整理时识别「同一类操作重复 **≥3 次**且跨 **≥2 个日期**」，自动生成一份技能草稿到
  `skills-draft/<名>/SKILL.md`。判定看三类信号——项目约定、跨日期被佐证的长期记忆条目、
  以及同一项目里反复共现的**工具组合**（高频噪声工具不算）。
  草稿正文是**证据摘要**（步骤 + 次数 + 跨哪些日期 + 来源会话），不是替你编好的流程。
  侧边栏红点 + 顶部横幅 + 待批准卡片三级提示；点「查看」打开详情弹层，里面能看到
  **完整内容**、**批准后会写到哪里**、**来自哪些会话**，然后三选一：

  | 按钮 | 作用 |
  |---|---|
  | 批准 | 原样写入 `$DSH_HOME/skills/<名>/SKILL.md`，DSH 会自动发现并加载 |
  | 编辑后批准 | 先在弹层里改，改完再按同样路径写入（预览与编辑器是同一份文本，落盘就是你刚看过的） |
  | 忽略 | 移入 `archive/skills-draft/`（**不删除**，下周你可能还想要），红点消失 |

  **草稿会自动生成，但绝不会自动写入 `$DSH_HOME/skills/`**——只有你点「批准」才落盘。
  30 天没处理的草稿自动归档。这是 `memory-plan.md` §6.2 的底线，代码里也是这么保证的：
  `skills.ts` 中没有任何方法接触 skills root，唯一的写入点是「批准」按钮走的那一条。
- 页面顶部显示上次 / 下次整理时间与触发条件，底部是隐私说明与「复制记忆目录路径」。

### 三个 agent 工具 + 一个命令

| 名称 | 作用 |
|---|---|
| `memorybuddy_recall`  | 检索长期记忆；不传 `query` 时返回记忆索引与各主题条数 |
| `memorybuddy_remember` | 主动记下一条事实（先跑脱敏检查，命中密钥就拒绝写入） |
| `memorybuddy_forget`  | 软删除一条记忆（移入 `archive/`，可人工恢复） |
| `/memory` | `状态` 看当前记忆概况；`整理` 立即执行一次确定性整理 |

---

## 安装

要求：DSH `>= 0.2.0-rc.2`。插件本身没有运行时依赖（宿主半边只用 `node:*` 内置模块，浏览器半边只用 `react` / `react/jsx-runtime`）。

```bash
# 从已克隆的目录安装（link: 方式，改代码即时生效）
dsh plugin --profile <profile名> add link:/绝对路径/dsh-memorybuddy
```

> **注意**：DSH Desktop 的 `desktop` profile 被 Electron 应用独占管理，
> 命令行会拒绝 `--profile desktop`（报 `profile "desktop" is managed exclusively by the Electron application`）。
> 这种情况下请用应用内的**插件管理**界面安装，或把插件装到其它 profile。

安装后重启应用或重载窗口，侧边栏就会出现 MemoryBuddy 图标。

### 从源码构建

仓库**已提交 `lib/` 构建产物**，克隆后不必构建即可直接装载。
想改代码时：

```bash
npm install          # 只装 devDependencies（esbuild / typescript / @types/*）
npm run build        # 生成 lib/index.js（宿主半边）与 lib/client.js（浏览器半边）
npm run watch        # 改代码即时重建
```

---

## 数据布局

全部在 `$DSH_HOME/dsh-memorybuddy/`（Windows 默认 `C:\Users\<你>\.dsh\dsh-memorybuddy\`）：

```
preferences.md            称呼 / 名字 / 回复风格 / 开关 / 整理策略
profile.md                人设设定（注入【人设】）
instructions.md           用户指令（注入【用户指令】）
memory/
  index.md                长期记忆索引（只有中/高置信度条目会进这里）
  background.md           工作背景
  habits.md               行事风格
  environment.md          环境路径
  preferences-learned.md  习得偏好
  projects/<slug>.md      按项目隔离的记忆
sessions/<YYYY-MM-DD>/<session-id>.md   会话沉淀中间层
journal/<YYYY-MM-DD>.md   整理日志（每次整理、每次保存都留痕）
journal/<日期>/backup/    写入前的原件备份
skills-draft/<name>/      待你批准的技能草稿（由整理自动生成，批准后写入 $DSH_HOME/skills）
archive/                  被遗忘/被重置/被忽略的条目的归档（软删除）
archive/skills-draft/     30 天未处理或被忽略的技能草稿（软删除）
state.json                采集水位线、待整理队列、待确认问题、模型冷却表
```

**所有文件都是普通 markdown**，用任何编辑器改都生效，插件下一轮就读到新内容。
手改过的条目会被标成 `pinned`，自动整理**永不**改动或删除它。

### 置信度与升级

同一条事实在不同**日期**被观察到多次才升级：1 天 = 低，2–3 天 = 中，4 天以上或你确认过 = 高。
只有**中/高**（或你手动 `pinned` 的）条目会进入 `memory/index.md` 与系统提示。
低置信度条目 30 天、中置信度 90 天没有任何佐证会被归档；高置信度不衰减。

### 整理什么时候跑

不是靠「深夜定时」，而是由 `consolidateOn` 选一种触发方式：

| `consolidateOn` | 触发 | 说明 |
|---|---|---|
| `startup-idle`（默认） | 启动补齐 **+** 空闲 | 启动 90 秒后补一次；之后闲置 `consolidateIdleMinutes` 分钟再补 |
| `idle` | 空闲 | 只按闲置时间触发，不做启动补齐 |
| `session-end` | 会话结束 | 会话落盘/关闭后触发（有 15 秒防抖，一阵密集写盘只整理一次） |
| `fixed` | 固定时间 | 到 `consolidateFixedTime`（默认 03:00）触发，每天一次 |
| 手动 | 面板「立即整理」/ `/memory 整理` | 任何模式下都可用 |

无论哪种触发都要同时满足两个条件才会真的跑：**距上次整理 ≥ `consolidateIntervalHours`**（默认 24 小时）
且**有待整理的会话笔记**。所以一个安静的插件只会多读一次 `state.json`，不会空写日志。

整理默认静默，不弹窗；单次最多处理 20 个待整理会话；
**先备份、再写入**，会话笔记只有在内容确实落盘之后才会被标记为已整理。

---

## 配置项

`preferences.md` 的 front-matter 就是配置，也可以直接在面板里改：

| 键 | 默认 | 含义 |
|---|---|---|
| `userName` | `""` | 你的称呼 |
| `agentName` | `DSH同学` | 助手名字 |
| `replyStyle` | `默认` | 回复风格 |
| `welcome` | `true` | 是否显示欢迎语 |
| `showFileChanges` | `false` | 是否展示文件改动过程 |
| `conversationMemory` | `true` | 会话记忆总开关 |
| `localMemorySkills` | `true` | 本地记忆与技能开关 |
| `consolidateOn` | `startup-idle` | 整理触发方式 |
| `consolidateIntervalHours` | `24` | 两次整理的最小间隔 |
| `consolidateIdleMinutes` | `10` | 空闲多久算空闲 |
| `consolidateFixedTime` | `03:00` | 固定整理时间（`consolidateOn: fixed` 时才用） |
| `consolidateQuiet` | `true` | 整理是否静默 |
| `modelPolicy` | `free-first` | 模型选择策略：`free-first` / `choice` / `session-default` / `allowlist` / `off`（`off` = 不做模型提炼） |
| `modelAllowlist` | `[]` | 允许的模型；**非空时是硬边界**，自选模型也受它约束 |
| `modelChoiceProvider` | `""` | 自选模型的 provider；空 = 不指定，走候选链 |
| `modelChoiceModel` | `""` | 自选模型的 model id；与上一项同时为空才算未指定 |
| `modelChoiceEffort` | `""` | 自选模型的思考档位；必须是该模型 `reasoning.efforts` 里的值，空 = 用模型默认 |
| `promptBudgetBytes` | `4096` | 注入系统提示的记忆预算（字节） |

注入进每轮系统提示的内容有明确预算：人设 800 B、用户指令 800 B、长期记忆 4096 B（可配）、本项目记忆 1200 B；
超预算时按「工作背景 > 行事风格 > 环境路径 > 项目索引」的优先级截断。
记忆文本以 `interpolate: false` 注入，所以你写进记忆里的 `{{ }}` 不会被当作模板展开。

---

## 隐私说明

- **数据不出本机**：记忆只写到 `$DSH_HOME/dsh-memorybuddy/`，插件没有任何上报通道。
- **`.no-memory`：整会话不采集**。在工作目录里放一个 `.no-memory` 文件，
  这个目录下的会话**一条笔记都不会写**——决定在采集器拿到第一个事件之前就做出，
  不是事后过滤。会话进行中出现该文件也会立刻停止并丢弃已缓冲的内容。
  它是仓库里的一个普通文件，跟着项目走，`git status` 看得见。
- **会话笔记只记工具名与成败，绝不记工具正文**——避免正文体积爆炸，也避免把命令输出里的密钥写进记忆。
- **只采集你真说过的话**：`user/message` 里来自运行时上下文、其它插件、子 agent 的消息都不会进记忆。
- **只让你自己的话成为记忆候选**：助手引用 `web_fetch` / `web_search` 拿回来的内容
  （包括伪装成「指令」的注入文本）永远不会被当成你的偏好记下来。
- **写入前脱敏**。命中下面任一模式时，**整行被略去**并在面板给出告警——
  身份证号、银行卡号（校验 Luhn 位，提交哈希/时间戳/订单号不会误判）、手机号、固定电话。
  密钥类（OpenAI `sk-…`、GitHub `gh[pousr]_…`、AWS `AKIA…`、`Bearer …`、私钥块、
  `password|secret|token|api_key = …`）则是**就地隐去**，保留句子本身。
  过滤点在 `store.writeSessionNote`——所有会话笔记的唯一入口，
  而不是只在「手动记一条」和面板编辑时才生效。
- **HTTP 路由只对本机开放**：`/api/memorybuddy/*` 要求同源标记，并同时校验回环地址或 DSH 外壳注入的会话 cookie；
  这是一个绊线（tripwire）而非身份认证——它挡住的是从页面脚本或其它进程发起的越权调用。
- **模型提炼只发摘要**：模型阶段见到的只有候选条目摘要与现有画像摘要（单次输入上限 16 KB），
  **绝不发送原始对话**；模型返回的是 JSON diff，经逐字锚点校验后才可能改写条目，`pinned` 条目永不被改。
  `modelPolicy: 'off'` 时完全不发起任何模型调用。失败按类别写冷却表（额度 6h / 模型不存在或认证失败 24h / 网络 30min），
  面板如实显示「上次整理用了 <模型>，<N> token」或「未执行：<原因>」。

---

## 卸载与数据清理

```bash
dsh plugin --profile <profile名> remove dsh-memorybuddy
```

或在应用内的插件管理界面里禁用/移除。

**卸载不会删除你的记忆**——`$DSH_HOME/dsh-memorybuddy/` 会原样保留，重新装上就能接着用。
想彻底清除，用面板「记忆与进化」页底部的 **危险区 → 彻底删除全部记忆**：
它要求你**手打 `DELETE`** 才执行，删掉整个记忆目录以及本插件批准生成的技能，
**不进回收站、无法恢复**。

也可以手工做（等价，但不会替你删技能）：

```powershell
# 先自己备份一份（可选）
Copy-Item "$env:DSH_HOME\dsh-memorybuddy" "$env:USERPROFILE\Desktop\memorybuddy-backup" -Recurse

# 再删除
Remove-Item "$env:DSH_HOME\dsh-memorybuddy" -Recurse -Force
```

如果这个插件把技能草案批准成了真实技能，那份文件在 `$DSH_HOME/skills/<name>/SKILL.md`。
面板的「彻底删除」只删**本插件批准过**的那些（凭 `approved-skills/` 索引与技能文件里的
`source: memorybuddy-evolved` 识别）；你自己写的或别的工具装的技能不在其列，不会被碰。

---

## 版本范围

**0.1.0 — P0–P3（首版）**

- **P0 骨架**：包结构、构建链、`cordis.patch.yml`、一级面板、两个设置页。
- **P1 存储层**：`$DSH_HOME` 目录、markdown 读写、front-matter、原子写、`state.json`；并发写不丢数据。
- **P2 面板 UI**：全部卡片与编辑/保存/导入/重置、搜索过滤、中英文案。
- **P3 采集**：`session/event` 采集、节流落盘、`session/flush` 排空、会话摘要文件；开关关闭即停。

**0.2.0 — 重命名发布**：项目定名 memorybuddy，数据目录与全部标识随之改名（见 CHANGELOG 的迁移步骤）。

**0.3.0 — P4 自动整合闭环**：四个触发（启动补齐 / 空闲 / 会话结束 / 固定时间）真正接上；
待确认问题、整理历史与一键回滚进入面板；「重置」改为把全部记忆归档到 `archive/reset-<时间戳>/`。
详见下方「整理什么时候跑」。

**0.4.0 — P5 模型提炼**：整理的最后一步接上模型阶段（用户自选 → 免费优先 → 第三方 → 会话默认 → 任意可用，
失败按类别冷却、自动回退，白名单是硬边界，`off` 压过一切）。
新增「提炼模型」面板卡片（真实枚举 + 校验 + 思考档位 + 改回自动 + 加入白名单）与
`GET /api/memorybuddy/models`、`GET /api/memorybuddy/consolidate-status` 两条路由。
隐私底线不变：只发候选与画像摘要，绝不发原始对话。

**0.5.0 — P6 项目级记忆**：整理时把会话笔记「项目相关」一节里的实事按工作目录归档到
`memory/projects/<项目名>.md`（slug 取路径最后一段，保留中文），与主题记忆同一套合并/冲突/置信度机制；
只有工作目录匹配的会话注入 `【本项目记忆】`（≤ 1200 B），注入前重读文件，整理写入的实事当轮就生效。
面板新增「项目记忆」卡片（条数 / 更新时间 / 编辑 / 归档此项目）；
`forget-project` action 把整个文件移入 `archive/projects-<名>-<日期>.md`。仓库零污染，只写 `$DSH_HOME`。

**0.6.0 — P7 技能进化**：补上 `skills-draft/` 一直缺的生产者。整理时按**三类确定性信号**
识别「同一类操作重复 ≥3 次、跨 ≥2 个日期」并自动生成技能草稿：
① 项目约定（`memory/projects/<slug>.md` 里已合并的事实）② 跨日期被佐证的长期记忆条目
③ 同一项目里反复共现的**工具组合**（≥2 个工具才入选，`read`/`grep`/`pwsh` 等高频噪声工具被剔除）。
前两类复用整理阶段**已经做出的合并判断**，不重复实现去重；全程确定性、不调模型。
草稿正文写的是**证据摘要**（步骤 + 次数 + 跨哪些日期 + 来源会话），不是编造的流程。
面板三级提示（红点 + 横幅 + 待批准卡片）+ 详情弹层（完整内容 / 目标写入路径 / 来源会话），
弹层内提供 **批准 / 编辑后批准 / 忽略**（预览与编辑器是同一份文本的两个视图）。
**草稿自动生成，但绝不自动写入 `$DSH_HOME/skills/`**——只有点「批准」才落盘，
这由结构保证：`skills.ts` 里没有任何方法接触 skills root。
30 天未处理的草稿移入 `archive/skills-draft/`（不删除）；「忽略」也是归档而非丢弃。
新增 `GET /api/memorybuddy/draft?name=` 与 `ignore-draft` action。

**1.0.0 — P8 隐私收尾与发布**：补齐 `memory-plan.md` §5.2 黑名单剩下的三条，
并给出全插件**唯一不可撤销**的操作。

- **`.no-memory`**：工作目录里放一个同名文件，这个目录下的会话**一条笔记都不写**。
  判定在采集器拿到第一个事件之前做出（不是事后过滤），会话进行中出现该文件也会立刻停止
  并丢弃已缓冲的内容。同名的**目录**不算标记——否则一个误建的文件夹会静默关掉记忆。
- **PII 检测**：身份证号、银行卡号（校验 Luhn 位，提交哈希 / 时间戳 / 订单号不会误判）、
  手机号、固定电话——命中的**整行被略去**并在面板告警。密钥类仍是就地隐去，保留句子。
  过滤点在 `store.writeSessionNote`，即所有会话笔记的唯一入口。
- **防投毒**：只有用户自己的话能成为记忆候选。助手引用 `web_fetch` / `web_search`
  拿回来的内容（包括伪装成指令的注入文本）永远不会被记成你的偏好。
- **彻底删除**：面板底部「危险区」，要求**手打 `DELETE`** 才执行（大小写敏感）。
  删掉整个记忆目录 + 本插件批准过的技能；**你自己写的或别的工具装的技能不动**
  （`$DSH_HOME/skills/` 是共享目录）。删除前会先丢弃采集缓冲、删除后不回填快照，
  所以不会出现「删完又长出来」。

**尚未实现**：跨设备同步。

---

## 已知限制

- 采集靠订阅 `session/event`，只能看到**插件装载之后**发生的事件。对于插件装载时已经在跑的会话，
  它的早期消息不在记忆里——这是订阅制而非回放制的固有边界。
- 原生设置页的导航图标固定为 DSH 外壳的默认图标，无法自定义。
- 「打开记忆目录」在纯网页环境里没有对应的系统调用，实际行为是**复制路径到剪贴板**。
- PII 过滤是**正则 + 校验位**，不是解析器：没有校验位的境外卡号、
  分散在多处的号码拼写、写成了汉字数字的号码都可能漏过。它的目标是挡住「顺手记一个手机号」，
  不是合规级的 DLP。
- 彻底删除**不进回收站**，也没有第二道保险（不进回收站正是它的设计，备份由你自己决定）。

---

## 运行环境

宿主半边只在 `inject` 里声明**必然存在**的服务（`systemPrompt` / `agents` / `commands`）；
`webServer`、`tools`、`llm` 都是可选的，用 `ctx.get()` 软探测，缺了就跳过对应的那部分能力。

因此它在有 GUI 和无 GUI 的组合里都能装载：

| 组合 | HTTP 路由 | 采集 | 工具 | 记忆注入 |
| --- | --- | --- | --- | --- |
| DSH Desktop / `dsh web` | ✅ | ✅ | ✅ | ✅ |
| `dsh headless`（无 `webServer`） | 跳过 | ✅ | ✅ | ✅ |

> 注：Cordis 的 context 是代理，读取任何未在 `inject` 中声明的属性都会抛错，
> 所以可选服务只能通过 `ctx.get(name)` 取得——直接写 `ctx.webServer` 会在无头组合里让 `apply` 失败。

---

## 许可

[MIT](LICENSE)
