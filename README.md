# dsh-workbuddy-memory

把 WorkBuddy 的**个性化设置**与**跨会话长期记忆**存成你自己能看、能改、能带走的 markdown 文件，
并在 DeepSeek Harness 里提供**一个一级侧边栏面板**和**两个原生设置页**。

- 数据全部落在 `$DSH_HOME/dsh-workbuddy-memory/`，就是普通 markdown，随时手改。
- 插件本身不写入你的项目仓库，也不写入 `AGENTS.md`。
- 删除插件不会删除你的记忆；怎么彻底清理由你决定（见「卸载与数据清理」）。

> **English abstract** — A dual-sided DeepSeek Harness plugin that stores personalization
> (`profile.md`, `instructions.md`, `preferences.md`) and cross-session memory
> (`memory/*.md`, `sessions/<date>/*.md`) as plain hand-editable Markdown under
> `$DSH_HOME/dsh-workbuddy-memory/`. It ships one first-level sidebar panel and two native
> settings pages, injects a compact memory section into every turn's system prompt, and
> exposes three agent tools (`workbuddy_memory`, `workbuddy_remember`, `workbuddy_forget`)
> plus a `/memory` command. First release (0.1.0) covers the skeleton, the storage layer,
> the panel UI, and session collection; memory distillation by a model is **not** enabled yet.

---

## 功能

### 一级侧边栏面板

装好后侧边栏多出一行 WorkBuddy 图标（排在「插件」「定时」之后），点开是一个两栏面板：

```
┌──────────────┬──────────────────────────────────────────┐
│ 🔍 搜索       │  个性化                                   │
│              │  ┌────────────────────────────────────┐  │
│ 个性化        │  │ 称呼 / 名字                         │  │
│ 记忆与进化 ●  │  │ 回复风格 / 欢迎语 / 显示文件修改过程   │  │
│              │  ├────────────────────────────────────┤  │
│              │  │ 给 WorkBuddy 的指令     [编辑]       │  │
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
| 给 WorkBuddy 的指令 | `instructions.md` | 只写要求，例：`回答尽量简洁，先给结论` |
| 人设设定 | `profile.md` | 身份、性格、表达风格，对所有回复生效 |
| 长期记忆 | `memory/index.md` | 跨会话沉淀的结论，可编辑也可只看预览 |

### 记忆与进化

- **对话记忆**开关：关掉后**立刻停止采集**，不缓存、不落盘（`sessions/` 不再增长）。
- **本地记忆与技能**开关：控制本地记忆技能与技能草案。
- **管理记忆**：`重置`（二次确认后归档并重建骨架）、`编辑`（整篇 markdown 进编辑态）、`导入`（选一个 `.md` 合并进长期记忆）。
- **立即整理**：跑一次确定性整理——扫描待整理的会话笔记、去重合并、重建 `memory/index.md`。
- 页面顶部显示上次 / 下次整理时间与触发条件，底部是隐私说明与「复制记忆目录路径」。

### 三个 agent 工具 + 一个命令

| 名称 | 作用 |
|---|---|
| `workbuddy_memory` | 检索长期记忆；不传 `query` 时返回记忆索引与各主题条数 |
| `workbuddy_remember` | 主动记下一条事实（先跑脱敏检查，命中密钥就拒绝写入） |
| `workbuddy_forget` | 软删除一条记忆（移入 `archive/`，可人工恢复） |
| `/memory` | `状态` 看当前记忆概况；`整理` 立即执行一次确定性整理 |

---

## 安装

要求：DSH `>= 0.2.0-rc.2`。插件本身没有运行时依赖（宿主半边只用 `node:*` 内置模块，浏览器半边只用 `react` / `react/jsx-runtime`）。

```bash
# 从已克隆的目录安装（link: 方式，改代码即时生效）
dsh plugin --profile <profile名> add link:/绝对路径/dsh-workbuddy-memory
```

> **注意**：DSH Desktop 的 `desktop` profile 被 Electron 应用独占管理，
> 命令行会拒绝 `--profile desktop`（报 `profile "desktop" is managed exclusively by the Electron application`）。
> 这种情况下请用应用内的**插件管理**界面安装，或把插件装到其它 profile。

安装后重启应用或重载窗口，侧边栏就会出现 WorkBuddy 图标。

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

全部在 `$DSH_HOME/dsh-workbuddy-memory/`（Windows 默认 `C:\Users\<你>\.dsh\dsh-workbuddy-memory\`）：

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
skills-draft/<name>/      待你批准的技能草案
archive/                  被遗忘/被重置的条目的归档（软删除）
state.json                采集水位线、待整理队列、冷却表
```

**所有文件都是普通 markdown**，用任何编辑器改都生效，插件下一轮就读到新内容。
手改过的条目会被标成 `pinned`，自动整理**永不**改动或删除它。

### 置信度与升级

同一条事实在不同**日期**被观察到多次才升级：1 天 = 低，2–3 天 = 中，4 天以上或你确认过 = 高。
只有**中/高**（或你手动 `pinned` 的）条目会进入 `memory/index.md` 与系统提示。
低置信度条目 30 天、中置信度 90 天没有任何佐证会被归档；高置信度不衰减。

### 整理什么时候跑

不是靠「深夜定时」，而是：

| 触发 | 默认 |
|---|---|
| 启动补齐（启动 90 秒后补一次漏掉的） | 开 |
| 空闲（默认闲置 10 分钟） | 开 |
| 会话结束 | 开 |
| 手动（面板上的「立即整理」/ `/memory 整理`） | 开 |
| 固定时间 | **关** |

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
| `modelPolicy` | `free-first` | 模型选择策略 |
| `modelAllowlist` | `[]` | 允许的模型 |
| `promptBudgetBytes` | `4096` | 注入系统提示的记忆预算（字节） |

注入进每轮系统提示的内容有明确预算：人设 800 B、用户指令 800 B、长期记忆 4096 B（可配）、本项目记忆 1200 B；
超预算时按「工作背景 > 行事风格 > 环境路径 > 项目索引」的优先级截断。
记忆文本以 `interpolate: false` 注入，所以你写进记忆里的 `{{ }}` 不会被当作模板展开。

---

## 隐私说明

- **数据不出本机**：记忆只写到 `$DSH_HOME/dsh-workbuddy-memory/`，插件没有任何上报通道。
- **会话笔记只记工具名与成败，绝不记工具正文**——避免正文体积爆炸，也避免把命令输出里的密钥写进记忆。
- **写入前脱敏**：匹配以下六类模式的内容会被替换成 `［已隐去］` 并拒绝落盘——
  OpenAI 风格 `sk-…` 密钥、GitHub `gh[pousr]_…` 令牌、AWS `AKIA…`、`Bearer …` 令牌、
  `-----BEGIN … PRIVATE KEY-----` 私钥块、`password|secret|token|api_key = …` 赋值式口令。
- **只采集你真说过的话**：`user/message` 里来自运行时上下文、其它插件、子 agent 的消息都不会进记忆。
- **HTTP 路由只对本机开放**：`/api/workbuddy-memory/*` 要求同源标记，并同时校验回环地址或 DSH 外壳注入的会话 cookie；
  这是一个绊线（tripwire）而非身份认证——它挡住的是从页面脚本或其它进程发起的越权调用。
- **首版不做模型提炼**：面板会如实显示「模型提炼未启用（首版）」。整理只做确定性工作（扫描、去重、重建索引），
  不会把你的记忆内容发给任何模型。

---

## 卸载与数据清理

```bash
dsh plugin --profile <profile名> remove dsh-workbuddy-memory
```

或在应用内的插件管理界面里禁用/移除。

**卸载不会删除你的记忆**——`$DSH_HOME/dsh-workbuddy-memory/` 会原样保留，重新装上就能接着用。
想彻底清除：

```powershell
# 先自己备份一份（可选）
Copy-Item "$env:DSH_HOME\dsh-workbuddy-memory" "$env:USERPROFILE\Desktop\workbuddy-memory-backup" -Recurse

# 再删除
Remove-Item "$env:DSH_HOME\dsh-workbuddy-memory" -Recurse -Force
```

如果这个插件把技能草案批准成了真实技能，那份文件在 `$DSH_HOME/skills/<name>/SKILL.md`，需要单独删除。

---

## 首版范围（0.1.0）

本次发布覆盖 **P0–P3**：

- **P0 骨架**：包结构、构建链、`cordis.patch.yml`、一级面板、两个设置页。
- **P1 存储层**：`$DSH_HOME` 目录、markdown 读写、front-matter、原子写、`state.json`；并发写不丢数据。
- **P2 面板 UI**：全部卡片与编辑/保存/导入/重置、搜索过滤、中英文案。
- **P3 采集**：`session/event` 采集、节流落盘、`session/flush` 排空、会话摘要文件；开关关闭即停。

**尚未实现**（等你验收 P0–P3 后再定）：模型提炼、技能自动生成与批准流程的完整形态、记忆自动注入的进一步优化、跨设备同步。

---

## 已知限制

- 采集靠订阅 `session/event`，只能看到**插件装载之后**发生的事件。对于插件装载时已经在跑的会话，
  它的早期消息不在记忆里——这是订阅制而非回放制的固有边界。
- 原生设置页的导航图标固定为 DSH 外壳的默认图标，无法自定义。
- 「打开记忆目录」在纯网页环境里没有对应的系统调用，实际行为是**复制路径到剪贴板**。

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
