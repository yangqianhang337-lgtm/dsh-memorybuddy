# WorkBuddy 个性化 + 记忆与进化 · DSH 插件实施方案（memory-plan.md）

> 注：本项目已于 2026-10-16 正式命名为 **memorybuddy**，代码内标识相应改为 `memorybuddy`（详见 update-plan.md 与 CHANGELOG 0.2.0）；本文是当时的历史方案，保留原文不改。

> 状态：**第 2 稿 · 待你过目确认**（确认前不写任何插件代码）
> 目标运行环境：本机 DSH Desktop（`D:\DSH-Desktop`，profile `desktop`，GUI http://127.0.0.1:19387 ）
> 插件源码目录：`D:\dsh-workbuddy-memory`
> 记忆数据目录：`C:\Users\A3373\.dsh\dsh-workbuddy-memory\`（按你 m00671 第 0 条修改）
> 日期：2026-10-15

---

## 0. 一句话方案

做一个**双面插件** `dsh-workbuddy-memory`：

- **宿主半边（Node）**：把「称呼 / 名字 / 回复风格 / 开关 / 人设 / 指令 / 长期记忆」以 **markdown 文件** 落盘到 `$DSH_HOME/dsh-workbuddy-memory/`；监听**全部会话**的事件自动沉淀，在**你电脑开着的时候**择机「整合 / 进化」（**不依赖夜间定时**）。
- **浏览器半边（Web GUI）**：复刻你给的三张截图，做成 **一个一级侧边栏面板**（`个性化` + `记忆与进化` 两页，其余导航项一律不做），**同时**提供两个 DSH 原生设置页入口，两处共享同一套组件。

**首版只做 P0–P3**（骨架 / 存储 / 面板 UI / 采集），你先看效果，再决定是否继续 P4–P8。

---

## 1. 调研结论（先回答问题，再谈方案）

### 1.1 DSH 侧：已用源码实证的硬约束

我把 `D:\DSH-Desktop\resources\app.asar` 解出来逐条核对了官方实现（工具留在 `tools\asar.mjs`），以下不是猜测：

| 事项 | 实测结论 | 对方案的影响 |
|---|---|---|
| 设置页注册 | `settings.section` 是 list 槽位，注册 `{name,id,order,label,children,inject}` + 组件即可新增一页 | 「个性化」「记忆与进化」可各占一页 |
| 设置导航**分组** | 设置对话框的左侧导航是**平铺**的，只有 `order` 排序，**没有分组标题** | 截图里的「设置 / 功能 / 数据与安全」三个分组标题**无法**在 DSH 原生设置对话框里复刻（我们自己的面板里可以） |
| 设置导航**搜索框** | 官方 `SettingsRoot` 源码里**没有**搜索框（无 `search` / `placeholder` 实现） | 截图左上角「搜索设置项」在原生设置页里**做不到**；在我们自己的面板里**可以做** |
| 设置导航**图标** | `navIcon(id)` 是硬编码白名单（`account`/`models`/`agent-presets`/`plugins`/`archived-sessions`），**其余一律齿轮** | 新注册的两个原生设置页只会拿到齿轮图标（面板里则是 1:1 图标） |
| 官方图标库 | `IconPersonalizationOutlineMedium`（人形）与 `IconLightOutlineMedium`（灯泡）**都已存在** | 自绘导航可直接用同款图标，视觉 1:1 |
| 官方组件库 | `Button / Input / Switch / Menu / Modal / MarkdownText / SettingsForm / Tag / Pill / Tooltip …` 全部具名导出 | 截图里的开关、输入框、下拉、卡片、markdown 正文全部用官方组件，**自动跟随主题** |
| 主题令牌 | `--dsw-alias-bg-layer-1/2`、`--dsw-alias-border-l1`、`--dsw-alias-label-primary/secondary`、`--dsw-specific-sidebar-fill` 等 | 暗色/亮色自动适配，不写死颜色 |
| 系统提示注入 | `systemPrompt.section({name, order, text})`，**`text` 可以是函数**（每轮组装时求值） | 记忆能每轮动态进提示，且能按预算截断 |
| 提示序表 | `DEPLOYMENT_PERSONA_PREFIX = 0` → `PLAN_POLICY = 500` 之间是空的 | 记忆 section 插在 **order 100~200**，紧跟人设、早于计划策略 |
| 会话事件 | `session/event` 是**提交后**的追加馈送；`user/message` 的 `data` 本身就是消息 | 跨会话采集的唯一正确入口 |
| 持久化时机 | `dsh-session` 头注释明说「持久化是插件的事：订阅 `session/event`，在 `session/flush` 上排空」 | 落盘要挂在 `session/flush` |
| 浏览器↔宿主 | ① `webServer.register` 自建 HTTP 路由（task-board 走的稳路，有同源/loopback 鉴权栅栏）② `host.call` 包私有 RPC（`harness.handle(method, fn)` 注册） | 用 ①（可 SSE 推送实时刷新） |
| 插件安装 | `dsh plugin --profile desktop add link:<本地路径>` | 本机可直接以 link 方式装载调试 |
| 技能发现根 | `$DSH_HOME/skills`（source `user-dsh`）、`<项目>/.dsh/skills`、`~/.agents/skills` | 「进化」产出的技能写这里能被 DSH **自动加载** |
| 用户级指令文件 | `$DSH_HOME/AGENTS.md` **当前不存在**（空位） | 不抢占，插件用自有目录 |
| 构建链 | 本机 Node v24.15.0 可用；参考包用 TypeScript + tsdown + CSS Modules | 可本地构建（首次需联网装 devDependencies） |

**模型侧实测**（关系到「优先免费模型」）：

- 本机 `workbuddy-xdpool` 插件（你反代的池）注册的 provider id 是 **`workbuddy-xdpool-global`**（全球）与 **`workbuddy-xdpool`**（国内）。
- 池的模型目录是明文 JSON，**直接带免费标记**：`C:\Users\A3373\.dsh\.workbuddy-catalog.json`（18 个模型，字段 `billing.free` / `billing.credits`，如 `hy3` → `credits: "x0.00 credits"`、`badges: ["限时免费"]`）与 `.workbuddy-ai-catalog.json`（27 个模型，其中 `hy4-preview-f`、`hy3`、`deepseek-v4.1-flash` 的 `billing.free === true`）。
- 池内代码里 `multiplier: 0` 就是网关自己的「免费」写法（`credits: "x0.00"`），另有 `限时免费 / 夜间折扣 / 夜间免费` 徽章。
- `llm` 服务提供 `listProviders()` / `listModels(provider)` / `resolveModelInfo(provider, model)`，可在运行时动态发现，**不必写死模型名**。

### 1.2 公开经验：你没想到但必须补的 10 条

你第 5 条要求「检索网上公开信息，补充不到位的地方」。联网检索本机 `web_search` 端点 401 不可用（`Authentication Fails, api key ... invalid`），我用可用的抓取通道 + 既有公开资料总结如下，并把结论直接转成了设计约束：

| # | 补充要求 | 来源/依据 | 落进方案的位置 |
|---|---|---|---|
| 1 | **记忆必须分层**：用户级（跨项目）／项目级／会话级，越具体越优先 | Claude Code 官方记忆模型（`~/.claude/CLAUDE.md` + 项目 `CLAUDE.md` + `CLAUDE.local.md`，支持 `@path` 导入） | §3.2 目录结构、§5.4 注入顺序 |
| 2 | **写入要有明确判据**，否则上下文必然膨胀 | Hermes Agent 记忆治理「少而准」；Claude Code 把记忆定位为「指令」而非流水账 | §5.2 写入判据（7 条白名单 + 6 条黑名单） |
| 3 | **需要去重与冲突消解** | mem0 / Zep 的共识；同一事实多来源要合并而非叠加 | §5.3 |
| 4 | **需要「整合/固化」循环**，把散记提炼成画像与技能 | Neo4j「From memory to behavior」：skills + user profiles + **consolidation loop**；mem0 的 *Dream* 后台固化 | §6.1 自动整合 |
| 5 | **固化要「多天佐证」再采纳**，不能单次对话就写死 | hermes-dreaming：*corroborates candidate facts with what humans actually said on distinct days*，只提出少数值得保留的，并给出**逐字编辑锚点** | §5.2 置信度门槛、§6.1 |
| 6 | **需要遗忘/衰减机制**，过时记忆要主动问「还成立吗」 | hermes-dreaming：*asks whether stale memory entries still hold* | §5.3 衰减与归档、§6.1 复审 |
| 7 | **必须可读可编辑可回滚**（纯文本优先） | Arize Alyx 的结论标题就是「why we chose a file over a knowledge graph」——与你「markdown 为主」同向 | §4、§6.3 |
| 8 | **注入要有 token 预算 + 渐进式披露**，全量塞提示会烧额度 | 你明确的偏好「在意对话额度消耗」+ Claude Skills 的渐进式披露 | §5.4 预算与按需读取 |
| 9 | **隐私与安全**：敏感信息不得入库、仅本地、可审计、可一键清空 | 三张截图页脚已写「记忆内容遵循隐私政策，仅你本人可见」 | §7 |
| 10 | **防记忆投毒**：从网页/工具读到的外部内容不得自动写入长期记忆 | 提示注入攻击面；外部内容是不可信数据 | §7 硬规则 |

> 说明：本机 `web_search` 端点当前 401，方案里凡涉及「网上经验」的条目均标注了来源名称；若你要我补正式的可点击引用链接，需要先修好 Settings → Plugins 里的搜索端点配置，我再补一轮检索。

---

## 2. UI 复刻方案（三张截图 → DSH）

### 2.1 落点：A + B 都做（已按你 m00671 第 2 条确认）

| | 方案 A：一级侧边栏面板（主界面） | 方案 B：两个原生设置页 |
|---|---|---|
| 落点 | `sidebar.panellist` + `main` | `settings.section` ×2 |
| 视觉还原度 | **≈100%**：左栏搜索框 + 图标行 + 右侧卡片区，全部自绘 | ≈60%：导航平铺、无搜索、图标是齿轮 |
| 作用 | 日常使用的**主入口**，1:1 截图体验 | DSH 原生可达性（在「设置」里也能找到） |
| 工作量 | 中 | 小（复用 A 的卡片组件） |

**两者共享同一套 React 卡片组件**，多出来的成本很小。

### 2.2 面板布局（只做两页，其余一律不做）

按你 m00671 的要求：**左侧其余栏不用做**。左栏只有 **两行**：`个性化`、`记忆与进化`。

```
┌ 侧边栏图标行（order 30；Plugins=0 / Schedule=10 / 任务板=20）──────────┐
│                                                                       │
│  ┌ 左栏 188px ──────────┐ ┌ 右栏 内容区（可滚动）─────────────────┐  │
│  │ [🔍 搜索设置项      ] │ │  ┌ 卡片 ───────────────────────────┐ │  │
│  │                      │ │  │ WorkBuddy 对你的称呼   [       ] │ │  │
│  │ 👤 个性化      ←选中 │ │  │ WorkBuddy 的名字       [DSH同学 ] │ │  │
│  │ 💡 记忆与进化        │ │  └─────────────────────────────────┘ │  │
│  │                      │ │  ┌ 卡片 ───────────────────────────┐ │  │
│  │                      │ │  │ 回复风格            [默认  ▾]   │ │  │
│  │                      │ │  │ 欢迎语                   [ ●]   │ │  │
│  │                      │ │  │ 显示文件修改过程          [○ ]   │ │  │
│  │                      │ │  └─────────────────────────────────┘ │  │
│  │                      │ │  ┌ 卡片：给 WorkBuddy 的指令 [编辑]┐ │  │
│  │                      │ │  │ 写下你希望…默认生效。            │ │  │
│  │                      │ │  │ [textarea 占位：例如：回答尽量   │ │  │
│  │                      │ │  │  简洁，先给结论                 ] │ │  │
│  │                      │ │  └─────────────────────────────────┘ │  │
│  │                      │ │  ┌ 卡片：人设设定          [编辑] ┐ │  │
│  │                      │ │  │ 设定 WorkBuddy 的身份…           │ │  │
│  │                      │ │  │ [可滚动 textarea]                │ │  │
│  │                      │ │  └─────────────────────────────────┘ │  │
│  │                      │ │  ┌ 卡片：长期记忆          [编辑] ┐ │  │
│  │                      │ │  │ 跨会话保存的重要信息…            │ │  │
│  │                      │ │  │ [可滚动 textarea：条目式记忆]    │ │  │
│  │                      │ │  └─────────────────────────────────┘ │  │
│  └──────────────────────┘ └───────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
```

**与截图的 3 处刻意偏差（请确认）**：

1. **左栏只保留 2 行**（个性化 / 记忆与进化），其余 10 项不做 —— 按你 m00671 的指示。
2. **不显示分组标题**（设置 / 功能 / 数据与安全）—— 只有 2 行时分组标题没有意义，属于纯冗余。
3. **搜索框保留**（视觉 1:1），但做成**真的有用**：在「个性化」页过滤设置项，在「记忆与进化」页**搜索并高亮记忆条目**（跨会话记忆一多，这个搜索框价值很大）。

其它细节：

- 左栏尺寸、行高、间距、圆角、hover/选中底色**照抄官方** `SettingsRoot.module.css`（`nav 188px`、`navCell 40px`、`radius-md`、`--dsw-specific-sidebar-nav-item-hover/active`）。
- 图标：`个性化` = `IconPersonalizationOutlineMedium`，`记忆与进化` = `IconLightOutlineMedium`（与截图一致，官方图标库里都有）。
- 语义锚点：根节点打 `data-dsh-plugin="workbuddy"`、`data-dsh-workbuddy-view`（供皮肤/自动化定位，与 task-board 同做法）。

### 2.3 「个性化」页（截图 1 + 2）

| 截图元素 | 实现 |
|---|---|
| WorkBuddy 对你的称呼 | `Input`，存 `preferences.md` 的 `userName`（**默认空**，首次打开提示填写） |
| WorkBuddy 的名字 | `Input`，存 `agentName`（**默认 `DSH同学`**） |
| 回复风格（下拉） | `Menu`，枚举 `默认 / 简洁 / 详细 / 教学 / 直接` |
| 欢迎语（开关） | `Switch`，默认 **开** |
| 显示文件修改过程（开关） | `Switch`，默认 **关** |
| 给 WorkBuddy 的指令（编辑 + 大文本域） | `instructions.md`，占位符「例如：回答尽量简洁，先给结论」 |
| 人设设定（编辑 + 可滚动文本域） | `profile.md`，副标题「设定 WorkBuddy 的身份、性格与表达风格，对所有回复生效」 |
| 长期记忆（编辑 + 可滚动文本域） | `memory/index.md` 的渲染/编辑视图，副标题「跨会话保存的重要信息与结论，可随时查看和修改」 |

### 2.4 「记忆与进化」页（截图 3）

| 截图元素 | 实现 |
|---|---|
| 「对话记忆」开关 + 副标题 | `Switch`，绑 `preferences.md` 的 `conversationMemory` |
| 「本地记忆与技能」开关 + 副标题 | `Switch`，绑 `localMemorySkills` |
| 「管理记忆」+ `重置` / `编辑` / `导入` | `重置`=二次确认后归档并重建；`编辑`=整篇进编辑态；`导入`=选 markdown 文件合并 |
| 副标题「自动整理更新，可随时查看和编辑」 | 显示**上次/下次整理时间与触发条件**（见 §6.1），可点开配置 |
| 大号 markdown 正文 | 官方 `MarkdownText` 渲染 `memory/index.md`，可滚动 |
| 页脚「记忆内容遵循隐私政策，仅你本人可见」 | 静态文案 + 「打开记忆目录」按钮 + 「查看隐私规则」 |
| **（新增）待批准技能提示区** | 有草稿时**页面顶部横幅** + 侧边栏图标红点（见 §6.2） |

### 2.5 「可供用户自由编辑」的具体交互

- 每张卡片右上角 `编辑`：点击后从只读变可编辑，出现 `保存` / `取消`。
- 保存走宿主 HTTP 路由（带版本校验，避免并发覆盖），成功后局部刷新 + Toast「已保存」。
- 所有文本域支持 markdown 原文编辑；`长期记忆` 卡片额外提供「编辑 / 预览」切换。
- 快捷键：`Ctrl+S` 保存当前编辑卡片，`Esc` 取消。
- 任何一次保存都写进 `journal/` 变更日志，可回滚（§6.3）。

---

## 3. 数据存储位置（你让我决定，这里给结论与理由）

### 3.1 结论（已按你 m00671 第 0 条改为 `dsh-workbuddy-memory`）

```
C:\Users\A3373\.dsh\dsh-workbuddy-memory\        ← 记忆根目录（= $DSH_HOME/dsh-workbuddy-memory）
```

代码里**不写死** `C:\Users\A3373`，而是 `$DSH_HOME/dsh-workbuddy-memory`（`DSH_HOME` 环境变量优先，否则 `~/.dsh`）——这样将来发到 Gitee，别人装也能用。

> 命名提醒：插件**源码**在 `D:\dsh-workbuddy-memory`（D 盘），记忆**数据**在 `C:\Users\A3373\.dsh\dsh-workbuddy-memory`（C 盘 `$DSH_HOME` 下）。同名但不同盘、不同用途，互不干扰；卸载/重装插件不影响记忆。

**为什么放 `$DSH_HOME` 下：**

1. **跨对话/跨项目**：你的要求 2 是「跨对话服务」。只有 `$DSH_HOME` 是全局的；放工作区会被项目边界切断。
2. **与 DSH 既有约定同构**：DSH 自己就是这么放的——`$DSH_HOME/skills`（用户级技能）、`$DSH_HOME/sessions`（会话日志）、`$DSH_HOME/storages`（域存储）、`$DSH_HOME/task-board`。插件自建同名子目录，不抢占任何既有命名空间。
3. **不污染你的仓库**：项目级记忆也按项目路径哈希存回这里，**不会**往 `D:\全自动太极技能包`、`D:\www.suitanglian.com知识库` 等目录里塞文件（你已确认同意）。
4. **纯文本可迁移**：整个目录拷走即完成迁移/备份；`git init` 就能做版本历史。
5. **与「本地记忆与技能」开关语义一致**（截图 3 副标题：*数据仅保存在你的设备上*）。

### 3.2 目录结构

```
C:\Users\A3373\.dsh\dsh-workbuddy-memory\
├── preferences.md          # 称呼/名字/回复风格/开关/整理策略（截图1 卡片A/B、截图3 开关）
├── profile.md              # 人设设定（截图2 卡片D）
├── instructions.md         # 给 WorkBuddy 的指令（截图1 卡片C）
├── memory\
│   ├── index.md            # 长期记忆总览 = 截图2 卡片E / 截图3 正文（自动生成 + 可手改）
│   ├── habits.md           # 工作习惯与行事风格
│   ├── background.md       # 工作背景
│   ├── environment.md      # 本机软件与路径（跨项目）
│   ├── preferences-learned.md  # 从行为中归纳出的偏好
│   └── projects\
│       └── <项目slug>.md    # 项目级记忆（按项目路径 keyed）
├── sessions\
│   └── <YYYY-MM-DD>\
│       └── <session-id>.md  # 每个会话的沉淀摘要（中间层，整合后可归档）
├── journal\
│   ├── <YYYY-MM-DD>.md      # 每次整合的运行日志 + 变更 diff + 回滚锚点
│   └── <YYYY-MM-DD>\backup\ # 受影响文件的写入前备份
├── skills-draft\            # 进化出的技能草稿（**待你批准**）
├── archive\                 # 衰减归档（不删除，只搬走）
└── state.json               # 唯一的非 markdown 文件：索引/哈希/计数/水位线
```

`state.json` 只放**机器状态**（各文件 mtime+hash、已处理到哪个会话的哪个 seq、条目 id→位置索引、上次整合时间、模型冷却表、置信度计数）。所有**内容**都是 markdown —— 符合你「以 markdown 为主」的要求，同时避免每次全量扫描目录。

---

## 4. markdown 文件格式约定

统一 front-matter（YAML）+ 正文。

> **重要（按你 m00671 第 4.5 条）**：下面所有示例里的记忆内容**全部是占位结构**，插件**不会**预填任何真实内容——你截图里的「河南科技大学 / 太极技能包 / 剪映路径」等只是给我看的**格式参考**，不会被写进任何模板。所有记忆条目都由插件从**你自己的真实会话**里积累，或由你手写。

### 4.1 `preferences.md`

```markdown
---
kind: preferences
schema: 1
updated: <ISO8601>
userName: ""              # 留空 → 面板首次打开时提示填写
agentName: "DSH同学"
replyStyle: 默认          # 默认 | 简洁 | 详细 | 教学 | 直接
welcome: true             # 欢迎语
showFileChanges: false    # 显示文件修改过程
conversationMemory: true  # 对话记忆
localMemorySkills: true   # 本地记忆与技能
# ---- 整合策略（见 §6.1）----
consolidateOn: startup-idle   # startup-idle（默认，开机后择机）| interval | fixed-time | manual
consolidateIntervalHours: 24  # 距上次整合超过该小时数且期间有新会话 → 触发
consolidateIdleMinutes: 10    # 空闲判定：连续 N 分钟无会话事件
consolidateFixedTime: "03:00" # 仅 consolidateOn=fixed-time 时使用（给不关机的用户）
consolidateQuiet: true        # 触发时不弹窗、不打断，只在面板显示结果
# ---- 模型策略（见 §6.1.3）----
modelPolicy: free-first   # free-first（默认）| user-list-only | session-default | off
modelAllowlist: []        # 例如 ["workbuddy-xdpool-global/hy3", "sensenova/..."]
promptBudgetBytes: 4096   # 注入系统提示的字节上限
---

（本文件由插件维护；正文留空。修改 front-matter 即修改设置。）
```

### 4.2 `profile.md`（人设设定，截图 2 卡片 D）

**默认内容**（按你 m00671 第 4.2 条）：

```markdown
---
kind: persona
schema: 1
updated: <ISO8601>
injectOrder: 100
---

你是 DSH同学，我最好的助手。
```

其余留给你自由编辑（可以加性格、表达风格、口头禅、禁忌等）。插件**不**往这里写任何自动内容。

### 4.3 `memory/habits.md`（工作习惯，条目式 + 可溯源）

```markdown
---
kind: memory
topic: habits
schema: 1
updated: <ISO8601>
---

# 工作习惯与行事风格

<!-- 每条格式：[id] (首次出现日, 佐证天数, 置信度) 内容 · 来源会话 -->
<!-- 插件按 §5.2 判据自动追加；你可以手改手删，手改过的条目会被标记 pinned 永不被自动改写 -->

- [hab-0001] (<日期>, 佐证 1 天, 低) <待积累>
```

- **`佐证 N 天`** 是 §1.2 第 5 条的落地：同一事实在**不同日期**被观察到 N 次才升级置信度。
- **来源** 是会话 id 前缀，可点击跳到 `sessions/` 对应文件 → 完整溯源。
- 你手改过的条目打 `pinned`，自动整合**永不**改动或删除。

### 4.4 `sessions/<日期>/<session-id>.md`（会话沉淀中间层）

```markdown
---
kind: session-note
sessionId: <uuid>
workspace: <会话工作目录>
started: <ISO8601>
ended: <ISO8601>
turns: <N>
consolidated: false
---

## 做了什么
- <按会话内容生成的要点>

## 观察到的工作习惯候选
- (候选) <模式描述> · seq <N>

## 项目相关
- <路径>：<事实>

## 未决事项
- <待办/待确认>
```

首版（P3）这一层由**确定性规则**生成（不调模型）：会话结束时落骨架 + 用户原话里命中的偏好句式。整合（P6）再升级质量。

### 4.5 `memory/index.md`（长期记忆总览，注入系统提示的那一份）

由整合器从上面各文件**生成**（允许手改，手改优先）。**初始为空白骨架**：

```markdown
---
kind: memory-index
schema: 1
generated: <ISO8601>
sources: [habits, background, environment, preferences-learned]
budgetBytes: 4096
---

# 长期记忆

## 工作背景
<!-- 由插件从真实会话中积累；暂无内容 -->

## 行事风格
<!-- 由插件从真实会话中积累；暂无内容 -->

## 本机软件与路径（跨项目）
<!-- 由插件从真实会话中积累；暂无内容 -->

## 项目索引
<!-- 由插件从真实会话中积累；暂无内容 -->
```

---

## 5. 跨会话记忆机制

### 5.1 采集（宿主半边）

```
ctx.on('session/event', (session, event) => { … })   // 全部会话，提交后触发
ctx.on('session/flush', …)                           // 耐久检查点 → 落盘
```

- 只关心 `user/message`、`assistant/message`、`tool/call`、`tool/result`、`turn/end`；`tool/result` 只取名字与成败，**不存正文**（防体积爆炸与泄密）。
- 内存里按 session 缓冲，**节流落盘**（默认 5s 或每 20 条事件），`session/flush` 强制排空。
- 会话结束（`session/end` 或空闲超时）→ 生成 `sessions/<date>/<id>.md` 骨架（确定性，不调模型）。
- **开关关闭时**：`conversationMemory=false` 立即停止采集（不缓存、不落盘）。

### 5.2 提炼：什么值得记（写入判据）

**白名单（可写入）**
1. 用户明确表达的偏好/要求（「以后都…」「我不喜欢…」「先给结论」）
2. 反复出现的做法（同一模式在 ≥2 个不同日期出现）
3. 稳定的环境事实（路径、venv、账号、常用工具链）
4. 项目结构事实（仓库位置、构建命令、关键约定）
5. 用户的纠正（「不对，应该…」）→ 最高优先级，立即生效
6. 明确的决策与理由（选了 X 不选 Y，因为 Z）
7. 硬约束（版本、不可用的端点、禁用项）

**黑名单（永不写入）**
1. 密钥/token/密码/cookie/私钥 → 命中即丢弃并记一条脱敏告警
2. 身份证/银行卡/手机号等 PII（除非用户明确要求记住）
3. 一次性任务的中间产物、临时路径、调试输出
4. 从网页/工具读到的**外部内容**（防记忆投毒，见 §7）
5. 助手自己的猜测/建议（除非用户确认过）
6. 任何带 `no-memory` 标记的会话内容

**置信度**：`低`(1 天) → `中`(2–3 天) → `高`(≥4 天或用户明确确认)。**只有 `中` 以上才进 `index.md` 注入提示**；`低` 留在候选区等佐证。

### 5.3 去重 / 冲突 / 衰减

- **去重**：写入前对已有条目做归一化 + 关键词重叠度比对（阈值 0.75）；命中则**合并**（佐证天数 +1、来源追加）而不是新增。
- **冲突**：新事实与旧事实矛盾时**不自动覆盖**——标 `⚠ 冲突`，两条并存，下一次整合时在面板/`journal/` 里向你提一个二选一问题；你答完才消解。
- **衰减**：`低` 置信条目 30 天无新佐证 → 移入 `archive/`；`中` 90 天；`高` 不自动衰减，但整合时若发现「相关会话已 180 天未出现」会问一句「这条还成立吗」。
- **用户手改优先**：任何被人工编辑过的条目打 `pinned` 标记，自动整合**永不**改动或删除。

### 5.4 注入系统提示（预算 + 渐进式披露）

```
ctx.systemPrompt.section({
  name: 'plugin:workbuddy-memory',
  order: 120,                       // 紧跟人设(0)、早于 PLAN_POLICY(500)
  text: (context) => renderMemory(context),   // 每轮求值
  interpolate: false,               // 记忆里可能有 {{ }}，禁止变量插值
})
```

注入顺序与预算：

1. `preferences.md` → 压缩成 2 行（称呼、回复风格、关键开关）· 约 200 B
2. `profile.md`（人设）· 约 800 B
3. `instructions.md`（指令）· 约 800 B
4. `memory/index.md` · 上限 `promptBudgetBytes`（默认 4096 B），超出时**按章节优先级截断**（工作背景 > 行事风格 > 环境路径 > 项目索引），并在末尾追加一行 `（更多记忆见 workbuddy_memory 工具）`
5. 项目级记忆只在**当前会话工作目录命中该项目**时注入

**渐进式披露**：给智能体 3 个工具按需读取完整内容（§5.5），避免全量塞提示烧额度。

### 5.5 面向智能体的工具（`ctx.tools.register`）

| 工具 | 作用 |
|---|---|
| `workbuddy_memory(query?, topic?)` | 检索长期记忆；不传参返回目录索引 |
| `workbuddy_remember(text, topic, scope?)` | 主动记一条（走 §5.2 判据与脱敏） |
| `workbuddy_forget(id)` | 软删除（移入 `archive/`，可恢复） |

工具注册是**全局 + 设置开关**；提示词 section 用 `tools.get(name, scope) === undefined ? '' : text` 门控——工具被禁用时指导语同步消失。

---

## 6. 自动整合与进化机制（已按你 m00671 第 6 条重写）

> **核心修正**：你晚上电脑关机，`03:00` 的定时器**永远不会触发**。所以整合理念从「每晚定时」改为 **「你开着电脑的时候，错过就补」**。

### 6.1 触发机制（不再依赖夜间）

`state.json` 记录 `lastConsolidateAt` 与 `pendingSessions`。满足「距上次整合 ≥ `consolidateIntervalHours`（默认 24h）」**且**「有新会话素材」时，按下列任一条件触发：

| 触发方式 | 说明 | 默认 |
|---|---|---|
| **启动补齐** | DSH 启动后延迟 90s（避开启动高峰）检查一次；你早上开机 → 自动补上昨晚的整合 | ✅ 开 |
| **空闲触发** | 运行中连续 `consolidateIdleMinutes`（默认 10 分钟）无会话事件 → 后台整理 | ✅ 开 |
| **会话结束触发** | `session/end` 后若已过间隔且是最后一个活跃会话（防抖）→ 整理 | ✅ 开 |
| **手动** | 面板「立即整理」按钮，随时可用 | ✅ 开 |
| **固定时间** | 仅给不关机的人；默认**关闭** | ❌ 关 |

- 全程 `consolidateQuiet: true`：**不弹窗、不打断、不占用你的对话**，只在面板显示「上次整理：<时间> · <结果>」。
- 一次整理最多处理 N 个待整合会话（默认 20），剩下的下次继续，**绝不长时间占用**。
- 电脑关机期间什么都不做（没有后台进程），下次开机自动补 —— 这就是「错过即补」。

#### 6.1.1 整合流程（两阶段，模型失败也不影响）

1. **确定性阶段（不调模型，零成本、零风险）**：扫描 `sessions/` 中 `consolidated: false` 的文件 → 归一化候选 → 去重合并 → 佐证天数 +1 → 衰减/归档 → 重建 `index.md`。
2. **模型阶段（可选，失败即降级）**：把「新增候选 + 现有画像摘要」喂给模型，要求它**只输出 diff**（新增/修改/删除的条目，带**逐字锚点**），而不是重写全文。
3. **写入阶段**：先备份受影响文件到 `journal/<date>/backup/`，再应用 diff，写 `journal/<date>.md`（含 diff、耗时、token 消耗、用了哪个模型）。
4. **提问阶段**：冲突项、过期项、技能草稿 → 生成待确认列表，在面板上以卡片呈现（**不阻塞**、不打扰）。

> **关键**：即使模型阶段完全失败（没额度、模型下架、断网），确定性阶段的结果**照样落盘**。整合永远不会因为模型问题而崩溃或丢数据。

#### 6.1.2 模型选择的容错设计（按你「不能写死、不能崩」的要求）

**候选解析链**（逐级回退，全部运行时发现，**不写死模型名**）：

1. **你显式指定的**（`modelAllowlist`，如 `workbuddy-xdpool-global/hy3`）—— 若填了且可用，优先。
2. **免费优先（`free-first`，默认）**：从已注册 provider 的模型目录里筛出免费档。免费判据（按可靠性排序）：
   - 本机池目录 `$DSH_HOME/.workbuddy-catalog.json` / `.workbuddy-ai-catalog.json` 里 `billing.free === true` 或 `credits` 为 `x0.00`（实测本机免费档：`hy3`、`step-5-preview`、`hy4-preview-f`、`deepseek-v4.1-flash`）；
   - 模型显示名含 `免费` / `限时免费` / `free`（池把费率拼进 `name`，如 `Hy3 · 限时免费`）；
   - provider 属于你的反代池（`workbuddy-xdpool-global` / `workbuddy-xdpool`）。
   > 池目录文件是**加分项**不是硬依赖：读不到就退到「名字含免费」→ 退到「provider 优先」。
3. **第三方已配置 provider**：`sensenova`、`qwen`（来自 `llm-pi-ai`）。
4. **当前会话默认模型**：`agentDefaultModel.currentSelection()`（只读，**绝不改写**你的默认模型）。
5. **任意可用模型**。

**失败处理**：

- 每次调用前用 `llm.resolveModelInfo(provider, model)` 校验；调用走 `openOneShotStream`（与 task-board 同款），**45s 超时**、输入上限 16KB、输出必须是 JSON diff，解析失败即放弃本轮模型阶段。
- 失败按类别写进 `state.json` 的**冷却表**，避免反复撞同一面墙：额度耗尽/限流 **6h**、模型不存在 **24h**、认证失败 **24h**、网络错误 **30min**。
- 逐个候选尝试；**全部失败** → 跳过模型阶段，只做确定性整合，并在面板显示一行「上次模型提炼未执行：<原因>」。
- 所有调用包在 try/catch 里，**任何模型异常都不得让插件崩溃、阻塞或丢数据**。

#### 6.1.3 与「额度」的关系

- 免费档优先 + 单次调用（不分片）+ 只发候选摘要（不发原始对话）→ 默认策略下每次整合的额度消耗≈0。
- 面板显示「上次整理用了哪个模型、花了多少 token」，你可随时把 `modelPolicy` 改成 `off`（纯确定性整理）。

### 6.2 技能生成（「进化」的产出）——必须你批准

当某类操作在多个会话中重复出现（≥3 次、≥2 个日期），整合器生成一份技能草稿到 `skills-draft\<name>\SKILL.md`。

**明显提示（按你 m00671 要求强化）**：

1. 侧边栏面板图标上显示**红点角标**（有草稿就常驻，直到处理完）；
2. 打开面板时，「记忆与进化」页**顶部横幅**：「发现 N 条可沉淀的技能，是否查看？」+ 一键跳到草稿列表；
3. 面板「记忆与进化」页常驻一张**待批准卡片**，显示草稿数量与最新一条的摘要；
4. 草稿详情页展示：**完整内容预览 + 目标写入路径 + 来源会话**，三个按钮：`批准` / `编辑后批准` / `忽略`。

**默认绝不自动写入**。只有你点「批准」才写入 `$DSH_HOME/skills/<name>/SKILL.md`（DSH `skill-filesystem` 的 `user-dsh` 根，**自动发现并加载**）。30 天未处理的草稿自动移入 `archive/`（不删除）。

```markdown
---
name: <技能名>
description: <一句话描述>
whenToUse: <何时使用>
source: workbuddy-evolved
derivedFrom: [sessions/<日期>/<id>, …]
approvedAt: <ISO8601>
---

## 步骤
1. …
```

### 6.3 回滚与审计

- 每次自动写入前，受影响文件完整备份到 `journal/<date>/backup/`。
- `journal/<date>.md` 记录：改了什么文件、加/删/改了哪些条目、为什么、用了哪个模型、多少 token。
- 面板「管理记忆」卡片提供 `历史` 入口：按日期看 diff，一键回滚某次整合。
- `重置` = 归档当前全部记忆到 `archive/reset-<时间戳>/` 并重建空目录（**不真删**）。

---

## 7. 隐私与安全

| 措施 | 做法 |
|---|---|
| 仅本地 | 记忆只写 `$DSH_HOME/dsh-workbuddy-memory`；除「整合」那一次模型调用外**不出网**；整合调用只发候选条目摘要，不发原始对话 |
| 敏感信息过滤 | 写入前过正则 + 熵检测（密钥/token/密码/私钥/PII），命中即丢弃并记脱敏告警 |
| 防记忆投毒 | 从 `web_fetch`/`web_search`/工具结果读到的外部内容**一律标记为不可信**，不进入长期记忆；只有用户自己的话与已验证的本地文件事实可入库 |
| 可审计 | 每次自动变更都有 `journal/` 记录 + 备份，可逐条追溯来源会话 |
| 可一键关闭 | 两个开关（对话记忆 / 本地记忆与技能）关闭后立即停止采集与写入；面板显示当前状态 |
| 可一键清空 | 「重置」归档而非删除；另有「彻底删除」需二次确认 + 手打 `DELETE` |
| 不抢占 | 不写 `$DSH_HOME/AGENTS.md`、不改用户其它配置；卸载插件不删记忆目录 |

---

## 8. 技术架构

### 8.1 包结构

```
D:\dsh-workbuddy-memory\
├── package.json           # name: dsh-workbuddy-memory；dsh.bundle.patch + dsh.client
├── cordis.patch.yml       # - insert: [{ id: workbuddy-memory, name: 'dsh-workbuddy-memory' }]
├── icon.svg
├── README.md / README.zh-CN.md / LICENSE / .gitignore   # 为 Gitee 发布准备（§10）
├── tsconfig*.json
├── src\
│   ├── index.ts           # 宿主半边入口（apply = mountOnce(...)）
│   ├── host\
│   │   ├── store.ts       # 记忆根目录解析、markdown 读写、front-matter、原子写
│   │   ├── collector.ts   # session/event 采集 + 节流落盘 + session/flush 排空
│   │   ├── distill.ts     # 写入判据、去重、冲突、置信度、衰减
│   │   ├── consolidator.ts# 触发调度 + 确定性整合 + 模型 diff（含模型候选链与冷却表）
│   │   ├── model-picker.ts# 免费优先的模型候选解析 + 失败回退
│   │   ├── prompt.ts      # systemPrompt.section 渲染 + 预算截断
│   │   ├── tools.ts       # workbuddy_memory / remember / forget
│   │   ├── skills.ts      # 技能草稿 → $DSH_HOME/skills 批准写入
│   │   ├── routes.ts      # webServer 路由 + SSE + 同源/loopback 鉴权
│   │   ├── redact.ts      # 敏感信息过滤
│   │   └── dsh-home.ts    # $DSH_HOME 解析
│   └── client\
│       ├── index.ts       # 浏览器半边入口（slots.inject + register）
│       ├── panel.tsx      # 一级面板（左栏 2 行 + 右内容区）
│       ├── sections.tsx   # 两个 settings.section 页
│       ├── cards\         # 卡片组件（称呼/风格/指令/人设/长期记忆/管理记忆/技能草稿）
│       ├── transport.ts   # HTTP 客户端（文档相对前缀 + SSE）
│       ├── locales.ts     # zh/en 文案
│       └── *.module.css
└── lib\                   # 构建产物（宿主 index.js / 浏览器 client.js）
```

### 8.2 关键实现约束（全部来自实证，照抄即安全）

- **浏览器半边只 require `react` / `react/jsx-runtime`**，其余走内置符号（`ctx` / `host` / `styles` / `React`）与 `ctx.get()` 软探测。硬 `inject` 一个当前部署没有的服务会让 `apply` **永不执行**。
- `inject` 只列必然存在的：客户端 `['slots','locale']`，宿主 `['systemPrompt','webServer','agents','commands']`；`llm` / `tools` / `skills` / `timer` 一律 `ctx.get()` 软取用 + 缺失降级。
- 浏览器半边 `apply` 整体 try/catch，**只 console.error 不抛**（apply 抛异常会让整个 GUI 启动失败）。
- 宿主路由的客户端前缀必须是**文档相对路径**（`PREFIX.slice(1)`）——页面带 `<base href="./">`，绝对路径在子路径部署下会跑出目录。
- 路由鉴权照抄 task-board：`sec-fetch-site: same-origin` / loopback / `dsh-auth-` cookie 三选一放行。
- 热重载安全：所有订阅/定时器挂在 `ctx.effect()` 上，bundle 就地重建时先拆干净再重挂，否则会出现第二份界面。
- `ctx.provide` 前先判 `typeof ctx.provide === 'function'`（测试上下文没有服务注册表）。
- 记忆文本注入时 `interpolate: false`，否则 `{{ }}` 会抛错。

### 8.3 配置与设置页联动

宿主半边的 `Config` 用 `@deepseek-ai/schemastery` 声明，可编辑字段标 `.volatile()` → DSH 会自动为这一行生成一个设置表单卡片（GUI 的插件页里）。读取用 `readConfigField(field, fallback)` + `ctx.on('loader/volatile-update', sync)`，改动免重启生效。

### 8.4 装载方式（本机）

```
dsh plugin --profile desktop add link:D:\dsh-workbuddy-memory
```

以 link 方式装载：改代码 → 重新 build → 浏览器半边热重载；宿主半边改动需重启 DSH。

---

## 9. 实施阶段

### 9.1 首版范围：P0–P3（按你 m00671 决定）

| 阶段 | 内容 | 验收标准 |
|---|---|---|
| **P0 骨架** | 包结构 + 构建链 + `cordis.patch.yml` + 一级面板空壳 + 两个 settings.section 空壳 | 侧边栏出现 WorkBuddy 图标；面板与两个设置页能打开；build 通过 |
| **P1 存储层** | `$DSH_HOME/dsh-workbuddy-memory` 目录 + markdown 读写 + front-matter + 原子写 + `state.json` | 文件能被手动编辑并正确回读；并发写不丢数据 |
| **P2 面板 UI** | 三张截图的全部卡片 + 编辑/保存/导入/重置 + 搜索过滤 + zh/en 文案 | 与截图逐像素比对通过；所有文本可编辑并落盘 |
| **P3 采集** | `session/event` 采集 + 节流落盘 + `session/flush` + 会话摘要文件 | 跑几个会话后 `sessions/` 有正确文件；开关关闭即停 |

> P2 的「记忆与进化」页会包含开关、`管理记忆` 三个按钮、markdown 正文渲染与编辑。`立即整理` 按钮在 P2 里**只做确定性部分**（扫描/去重/重建 index），模型阶段留到 P6；面板文案会如实显示「模型提炼未启用（首版）」。

### 9.2 后续版本（本次不做，等你验收 P0–P3 后再定）

| 阶段 | 内容 |
|---|---|
| **P4 提炼** | 写入判据 + 去重/冲突/置信度/衰减 + `index.md` 生成 + 脱敏 |
| **P5 注入** | `systemPrompt.section` + 预算截断 + 3 个智能体工具 |
| **P6 整合** | 触发调度 + 确定性整合 + 模型 diff（含免费优先与失败回退）+ journal + 回滚 |
| **P7 进化** | 技能草稿 + 批准 → `$DSH_HOME/skills` + 红点/横幅提示 |
| **P8 收尾** | 隐私面板、彻底删除、README、Gitee 发布准备 |

---

## 10. 开源发布准备（Gitee）

你说项目完成后要发到 Gitee，所以首版就按**可发布**的标准写：

| 项 | 做法 |
|---|---|
| 通用性 | 代码里**不出现** `C:\Users\A3373`、不出现任何你的个人数据；路径一律 `$DSH_HOME` / 环境变量解析 |
| 默认模板 | 全部为空骨架（§4），新用户装上是干净的；人设默认只有「你是 DSH同学，我最好的助手。」 |
| 许可 | `LICENSE`（**建议 MIT**，DSH 生态的第三方插件普遍宽松；如你想要 Apache-2.0 也可以，请指定） |
| 文档 | `README.md`（中文为主 + 英文摘要）：功能、截图、安装（`dsh plugin add link:`）、配置项、隐私说明、卸载与数据清理 |
| 仓库卫生 | `.gitignore` 排除 `node_modules/`、`lib/`（或保留构建产物，看你）、本地记忆数据、`.refs/`、临时文件 |
| 数据隔离 | 记忆数据在 `$DSH_HOME` 下，**不在仓库里**；仓库里不含任何用户记忆 |
| 版本 | 语义化版本 + `CHANGELOG.md`；首版 `0.1.0` |
| 兼容声明 | `package.json` 的 `dsh.engines.dsh: ">=0.2.0-rc.2"`（与 task-board 一致） |

---

## 11. 已确认决策 & 仍需你拍板的事项

### 11.1 已按你 m00671 确认并写进本稿

| # | 事项 | 决定 |
|---|---|---|
| 0 | 记忆数据目录 | `$DSH_HOME/dsh-workbuddy-memory/`（= `C:\Users\A3373\.dsh\dsh-workbuddy-memory\`） |
| 2.1 | UI 落点 | **A + B 都做**（一级面板 + 两个原生设置页） |
| 4.2 | 人设默认内容 | 「你是 DSH同学，我最好的助手。」 |
| 4.5 | 记忆模板 | **不预填任何截图内容**，全部空骨架（其它记忆模块同理） |
| 6 | 整合时机 | **不依赖夜间**：启动补齐 + 空闲触发 + 会话结束 + 手动；固定时间默认关 |
| 6 | 模型选择 | **免费优先 + 多级回退 + 冷却表 + 绝不崩溃**；全部失败则只做确定性整合 |
| 6 | 技能提炼 | **必须你逐条批准**，红点角标 + 页面横幅 + 待批准卡片三级提示 |
| — | 项目级记忆 | 同意：只写 `$DSH_HOME` 下，**不往仓库里写文件** |
| — | 首版范围 | **P0–P3** |
| — | 左栏其余项 | **不做**，只复刻「个性化」+「记忆与进化」 |
| — | Gitee | 项目完成后发布，首版即按可发布标准写（§10） |

### 11.2 还需你确认的 3 个小点

1. **左栏搜索框**：保留（做成记忆搜索，视觉 1:1）／ 去掉（更简洁）—— 我倾向**保留**。
2. **许可协议**：MIT（**推荐**）／ Apache-2.0 ／ 其它。
3. **`lib/` 构建产物是否入库**：入库（别人 clone 即用，**推荐**）／ 不入库（只发源码，需自行 build）。

---

**你确认后我立即从 P0 开始开发。**
