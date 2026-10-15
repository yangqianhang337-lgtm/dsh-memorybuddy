# memorybuddy 改名方案（update-plan.md）

> 状态：**待你过目确认**（确认前不改任何代码）
> 起因（m06406）：项目此前未正式命名，现定名 **memorybuddy**，以便与用户电脑上已有的 `workbuddy` 系列（`dsh-workbuddy-xdpool` 插件、`.workbuddy-*.json` 模型目录）明确区分。
> 目标：插件内所有与项目自身身份相关的 `workbuddy` 标识改为 `memorybuddy`；**不碰**别人的 workbuddy。
> 影响面（已逐文件实测，`node_modules` / `.git` / `.tmp-*` / `lib` 除外）：**31 个文件、232 处**出现 `workbuddy`（不分大小写）；其中 `update-plan.md` 本文占 50 处、`memory-plan.md` 历史文档占 41 处，**真正要改的是 29 个文件、141 处**；另加 profile 安装项 1 处、数据目录 1 处、CSS 类 44 个（96 处，全在 `styles.ts`）。

---

## 1. 一句话

把**属于本项目自己的**标识（包名、路由、工具名、槽位 id、CSS 前缀、界面文案、数据目录、仓库目录）从 `workbuddy` 改成 `memorybuddy`；
把**别人家的** workbuddy（`dsh-workbuddy-xdpool` 插件、`.workbuddy-catalog.json`、`rewind-snapshots` 快照、git 历史）原样保留。

---

## 2. 命名映射表（改什么）

| 项目 | 现在 | 改为 | 位置 |
|---|---|---|---|
| npm/Gitee 包名 | `dsh-workbuddy-memory` | **`dsh-memorybuddy`**（见 §7.1） | `package.json:2`、profile 依赖 |
| 仓库目录 | `D:\dsh-workbuddy-memory` | `D:\dsh-memorybuddy`（见 §7.4） | 文件系统 |
| 数据目录 | `$DSH_HOME/dsh-workbuddy-memory/` | `$DSH_HOME/dsh-memorybuddy/` | `src/host/dsh-home.ts:32` `MEMORY_DIR_NAME` |
| bundle 条目 id | `workbuddy-memory` | `memorybuddy` | `cordis.patch.yml` |
| HTTP 前缀 | `/api/workbuddy-memory` | `/api/memorybuddy` | `src/protocol.ts:10` `API_PREFIX` |
| 提示词 section | `plugin:workbuddy-memory` | `plugin:memorybuddy` | `src/host/prompt.ts:25` `SECTION_NAME` |
| 工具名 ×3 | `workbuddy_memory` / `workbuddy_remember` / `workbuddy_forget` | `memorybuddy_recall` / `memorybuddy_remember` / `memorybuddy_forget`（见 §7.3） | `src/index.ts:74,258,307,375` |
| 面板 id | `workbuddy` | `memorybuddy` | `src/client/icons.tsx:18` `PANEL_ID` |
| 两个设置页 id | `workbuddy-personalize` / `workbuddy-memory` | `memorybuddy-personalize` / `memorybuddy-memory` | `src/client/sections.tsx:35,37` |
| DOM 锚点 | `data-dsh-plugin="workbuddy"` / `data-dsh-workbuddy-view` | `data-dsh-plugin="memorybuddy"` / `data-dsh-memorybuddy-view` | `src/client/panel.tsx:66` |
| 页面挂载标记 | `__dshWorkBuddyMemoryMounted` | `__dshMemoryBuddyMounted` | `src/client/index.ts:49` `PAGE_FLAG` |
| CSS 类前缀 | `wb*`（44 个唯一类名 / 96 处，全部在 `styles.ts`） | `mb*` | `src/client/styles.ts`（CSS 正文 + `panelCss` 映射；引用不改） |
| 日志前缀 | `workbuddy-memory:` | `memorybuddy:` | `src/index.ts`、`src/client/index.ts`、`src/host/{collector,consolidate,routes}.ts`、`build.mjs:108` |
| 界面文案 | `WorkBuddy`（zh 24 处 + en 对应） | **`MemoryBuddy`**（见 §7.2） | `src/client/locales.ts` |
| 组件名 | `WorkBuddyPanel` / `WorkBuddyPanelIcon` / `registerWorkBuddyPanel` | `MemoryBuddyPanel` / `MemoryBuddyPanelIcon` / `registerMemoryBuddyPanel` | `src/client/{panel,icons,index}.tsx` |
| 版权署名 | `dsh-workbuddy-memory contributors` | `memorybuddy contributors` | `LICENSE:3` |
| 版本 | `0.1.0` | **`0.2.0`** | `package.json`（重命名是破坏性变更） |

---

## 3. 逐文件改动清单（31 个文件命中，其中 29 个要改）

按出现次数排序（数字 = `workbuddy` 不分大小写出现次数）：

**仓库元数据**
- `README.md` 20 —— 包名 11、工具名 6、路由 1、界面文案 5
- `memory-plan.md` 41 —— **见 §7.5，建议不参与替换**
- `CHANGELOG.md` 5 —— **旧条目保留，新增 0.2.0 条目**（见 §7.6）
- `cordis.patch.yml` 5 —— `- id` + `name`
- `build.mjs` 3 —— 文件头注释、`PACKAGE_NAME`、sourcemap 插件名
- `package.json` 2 —— `name` + `description`
- `package-lock.json` 2 —— 由 npm 重新生成
- `.gitignore` 2 —— 注释 + 数据目录兜底行
- `LICENSE` 1 —— 版权署名
- `icon.svg` 0 命中（注释说的是「记忆卡片」，无需改）

**宿主半边**
- `src/index.ts` 11 —— `:42` `PACKAGE_NAME`、`:74` `MEMORY_TOOL_NAMES`、`:258`/`:307`/`:375` 三个工具的 `name`、`inject` 注释、`MEMORY_TOOL_GUIDANCE` 文案、日志前缀
- `src/protocol.ts` 2 —— `:10` `API_PREFIX` + 头部注释
- `src/host/dsh-home.ts` 2 —— `:32` `MEMORY_DIR_NAME` + 文档注释
- `src/host/prompt.ts` 2 —— `:25` `SECTION_NAME`、`:29` `TOOL_HINT`（`（更多记忆见 workbuddy_memory 工具）`）
- `src/host/routes.ts` 2 —— 头部注释、日志前缀
- `src/host/collector.ts` / `consolidate.ts` / `store.ts` / `templates.ts` 各 1 —— 日志前缀、文档注释

**浏览器半边**
- `src/client/locales.ts` 26 —— `NS`、界面文案（zh 与 en 两张表都要改）
- `src/client/panel.tsx` 9 —— `:66` DOM 锚点 `data-dsh-plugin="workbuddy"` / `data-dsh-workbuddy-view`、组件名、注释
- `src/client/index.ts` 8 —— `:49` `PAGE_FLAG = '__dshWorkBuddyMemoryMounted'`、`console.error` 前缀、`ctx.effect` label、导入名
- `src/client/styles.ts` 1（另有 **96 处 `wb` 类名 / 44 个唯一类**）—— `PACKAGE_NAME` + 全部类名
- `src/client/icons.tsx` 2 —— `:18` `PANEL_ID`、组件名
- `src/client/sections.tsx` 2 —— `:35`/`:37` 两个 `settings.section` id 常量
- `src/client/cards.tsx` 2 —— 仅注释

**验收脚本（tools/）**
- `tools/verify-host.mjs` 16、`tools/verify-bundle.mjs` 5、`tools/verify-headless.mjs` 4、`tools/verify-replay.mjs` 2、`tools/verify-client-factory.mjs` 1
- 这些断言里**硬编码了旧名**，必须同步改，否则改名后全红。逐条已核实：

  `tools/verify-bundle.mjs`
  - `:35-36` `source.includes('id: "dsh-workbuddy-memory"')`
  - `:80` `!source.includes('globalThis.__dshWorkBuddyMemory')`
  - `:88` `source.includes('"workbuddy"') || source.includes("'workbuddy'")`
  - `:94` `source.includes('workbuddy-personalize') && source.includes('workbuddy-memory"')`

  `tools/verify-client-factory.mjs`
  - `:102` `registration?.id === 'dsh-workbuddy-memory'`

  `tools/verify-host.mjs`
  - `:29` 临时目录前缀 `'dsh-workbuddy-test-'`；`:52`/`:240`/`:263` 数据目录名 `'dsh-workbuddy-memory'`
  - `:216`/`:268`/`:276`/`:298` 及后续全部 HTTP 调用路径 `/api/workbuddy-memory/*`
  - 断言失败信息里的中文文案也提到旧名，建议一并统一

  `tools/verify-headless.mjs`
  - `:33` 临时目录前缀 `'dsh-workbuddy-headless-'`、`:239` 数据目录名
  - `:155` `section.name === 'plugin:workbuddy-memory'`、`:160` 三个 `workbuddy_*` 工具名
  - `:144` `!host.inject.includes('webServer')` —— **不受改名影响**，但它是上一个修复（`ctx.get` 拿不到 `webServer`）的回归闸门，改名期间不要误改

  `tools/verify-replay.mjs`
  - `:69` 临时目录前缀 `'dsh-workbuddy-replay-'`、`:100` 数据目录名

**生成物（lib/，随构建重写）**
- `lib/index.js`、`lib/client.js` 与两个 `.map` —— 由 `node build.mjs` 重新生成，**不手工编辑**。

**不参与改名**
- `update-plan.md`（本文）与 `memory-plan.md`（41 处）—— 见 §7.5。

**验证脚手架 `.tmp-probe/`（gitignored，但阶段 5 要用）**
- `.tmp-probe/interact.mjs`（5 处）、`probe.mjs`（5 处）、`search.mjs`（2 处）里硬编码了两个**选择器**：`[data-dsh-workbuddy-view]` 与 `[data-dsh-panel-entry="workbuddy"]`。
- 这两个锚点会随 `panel.tsx` / `icons.tsx` 改名而失效，**不改就等于阶段 5 的实况验证全查不到元素**。阶段 2 改完锚点后立刻同步这三个脚本（共 12 处）。
- 其余脚本（`cdp.mjs` / `clickxy.mjs` / `authproxy.mjs` / `probe-agents.mjs` / `probe-webserver.mjs`）不含旧名，无需改。

---

## 4. 必须保留 `workbuddy` 的地方（安全边界）

| 保留项 | 为什么 |
|---|---|
| `profiles\desktop\package.json:23` `"dsh-workbuddy-xdpool": "1.8.4"` 与 `:50` bundles 里的 `dsh-workbuddy-xdpool` | 这是**另一个插件**（你的模型池），与 `:22`/`:51` 那两行（**本插件**，要改）只差一个词，改的时候必须逐行核对 |
| `profiles\desktop\cordis.patch.yml:63` `provider: workbuddy-xdpool`、`:94-95` `- id: llm-workbuddy-xdpool` / `name: dsh-workbuddy-xdpool` | 同上那个插件，改掉会让 provider 失效 |
| `$DSH_HOME\.workbuddy-catalog.json`、`.workbuddy-ai-catalog.json`、`.workbuddy-ai-probe.json` | 上面那个池的数据文件，不属于本项目 |
| `$DSH_HOME\rewind-snapshots\**` 中的历史快照 | 会话历史记录，只读 |
| git 提交历史（4 个 commit：`821db70`→`dab6f59`） | 历史不可改写（如要改写再单独讨论） |
| `D:\dsh-workbuddy-memory\.tmp-refs\*`（三张参考截图） | gitignored 的原始素材 |
| 文档中「用户电脑上的 workbuddy」这类**区别说明** | 改名目的正是区分二者，说明文字必须提到旧名 |

> **执行纪律**：全程**禁止**在仓库外做全局查找替换；仓库内也用逐文件编辑 + `grep` 复核，不做跨目录盲替换。

---

## 5. 执行顺序（7 个阶段）

**阶段 0 · 留退路**
1. 确认工作区干净：当前 HEAD `dab6f59`，仅 `update-plan.md` 一个未跟踪文件。
2. 备份数据目录（实测 14 个文件、约 6.5 KB）：`Copy-Item C:\Users\A3373\.dsh\dsh-workbuddy-memory C:\Users\A3373\.dsh\dsh-workbuddy-memory.bak-<时间戳> -Recurse`。
3. 备份 profile：`profiles\desktop\{package.json,cordis.patch.yml}` → `.pre-memorybuddy-<时间戳>`。

**阶段 1 · 宿主半边**（`src/protocol.ts` → `src/host/*` → `src/index.ts`）
先把「对外契约」定死：包名、`API_PREFIX`、`MEMORY_DIR_NAME`、`SECTION_NAME`、三个工具名、`MEMORY_TOOL_GUIDANCE`。
工具名改动后，`src/index.ts` 里工具定义的 `name` 与 `MEMORY_TOOL_NAMES` 必须一致（现有 `MEMORY_TOOL_NAMES` 常量就是防这个的）。
**注**：`src/protocol.ts` 是 `src/` 顶层文件（不是 `src/host/` 下），路径别写错。

**阶段 2 · 浏览器半边**（`src/client/styles.ts` 的 CSS 前缀 → 其余组件 → `locales.ts`）
`wb*` → `mb*` **只需改 `styles.ts` 一个文件**：实测 44 个类名、96 处出现，全部落在该文件的 CSS 正文与 `panelCss` 映射里；`panelCss` 的**键名**（`root` / `cardTitle` / …）不变，所以 `cards.tsx`、`panel.tsx`、`memory.tsx`、`personalize.tsx` 里的 `css.xxx` 引用**一行都不用动**（已用脚本扫描确认仓库内不存在任何字面量 `wbXxx` 类名，`styles.ts` 除外）。
随后改 `panel.tsx`/`icons.tsx`（组件名与 DOM 锚点）、`index.ts`（`PAGE_FLAG`、日志前缀、导入名）、`sections.tsx`（两个段 id）、最后 `locales.ts`（zh/en 两张表一起改，`NS` 也要改）。

**阶段 3 · 仓库元数据**：`package.json`（含 version 0.2.0）→ `package-lock.json` 重生成 → `cordis.patch.yml` → `build.mjs` → `.gitignore` → `LICENSE` → `README.md` → `CHANGELOG.md`。

**阶段 4 · 重建 + 全绿**（改完立刻跑，避免误差累积）
```
npx tsc --noEmit -p tsconfig.json
node build.mjs
node tools/verify-bundle.mjs
node tools/verify-client-factory.mjs
node tools/verify-host.mjs
node tools/verify-headless.mjs
node tools/verify-replay.mjs "C:\Users\A3373\.dsh\sessions\--D-dsh-workbuddy-memory--\46d2879f-7507-4aba-9ff6-2b27a010060c\session.v4.jsonl.zstd"
```
预期：typecheck 0 错；5 个验收全绿（当前基线 10/10、13/13、35/35、11、14/14）。

**阶段 5 · 影子 profile 预演（不动你的正在运行的应用）**
按已验证过的做法新建一个一次性 profile（上次用的 `wbweb` 方式）：
```
dsh.cmd --profile mbweb --from-default-profile web --dump-config
dsh.cmd plugin --profile mbweb add link:D:\dsh-workbuddy-memory
dsh.cmd --profile mbweb --port 19411 --no-open
```
用 CDP 打开 → 确认侧边栏出现 **MemoryBuddy**、面板与两个设置页正常、`GET /api/memorybuddy/state` 返回 401/403（路由存在）而不是 404。
**这一步通过之前不碰 desktop profile。**
（预演完记得删掉 `profiles\mbweb` 与后台进程——上次留下的 `wbweb`/`wbhead`/`wbhl` 已清理，别再造新的残留。）

**用户重启类操作**：阶段 6 第 3 步与第 5 步都要开关 DSH Desktop，**这两步由你来点**（我不能替你关闭正在运行的桌面应用）；其余步骤我全部执行。

**阶段 6 · 装进 desktop profile + 迁移数据**
1. 用 `plugin_manager` 卸载旧包：`remove_bundle` target `dsh-workbuddy-memory`（它会同时清掉 `profiles\desktop\package.json` 的依赖与 bundles 条目，并让 pnpm 重生成 `pnpm-lock.yaml`）。
2. 装入新包：`plugin_manager install_bundle` target `link:D:\dsh-workbuddy-memory`（包名已是 `dsh-memorybuddy`）。
3. **关掉 DSH Desktop**（否则旧插件会继续写旧目录、并把旧目录重建出来）。
4. 迁移数据目录：`Move-Item C:\Users\A3373\.dsh\dsh-workbuddy-memory C:\Users\A3373\.dsh\dsh-memorybuddy`
   - **实测：目录内没有任何文件需要改内容**。`state.json` 用的是相对路径（`sessions/2026-10-15/session-….md`）、`preferences.md` / `profile.md` / `instructions.md` / `memory/*.md` 只写记忆内容；只有会话笔记里的 `workspace:` 字段提到仓库路径（那是**工作目录**，不是数据目录名），与本次改名无关。
   - 迁移时若应用还开着，旧插件会立刻把旧目录重建出来——这正是第 3 步必须在迁移前的原因。
5. 启动 DSH Desktop → 检查：
   - 旧记忆内容完整（`preferences.md`、`profile.md`、`instructions.md`、`memory/*.md`、`sessions/*`）
   - 面板出现、两个设置页出现、工具名变为 `memorybuddy_*`
   - `sessions/` 继续写入，且**这次会加载已修好的宿主 bundle**（P3 采集修复一直在等这次重启）

**阶段 7 · 仓库目录改名（可放最后，见 §7.4）**
关掉应用 → 改目录名 → 重新 `link:` 安装 → 验证。**注意**：当前会话的 cwd 是 `D:\dsh-workbuddy-memory`，改目录会让本会话的相对路径失效，建议由你手动执行或换新会话。
**副作用（可接受）**：会话日志目录 `$DSH_HOME\sessions\--D-dsh-workbuddy-memory--\` 已存在 5 个新笔记，它是**按工作目录名**生成的（见该目录下形如 `--D-dsh~6D4B~8BD5~...` 的其它项目）；仓库改名后 DSH 会另建一个新日志目录，不回退、不冲突。这些笔记只用于 `tools/verify-replay.mjs` 的实况回放（阶段 4 用的那个文件仍在旧目录下，**可正常读取**）。

---

## 6. 验收标准

| 编号 | 标准 | 方法 |
|---|---|---|
| R1 | 仓库内 `workbuddy` 残留仅限 §4 白名单 | `grep -ri workbuddy` 逐条核对 |
| R2 | typecheck + 构建通过 | `npx tsc --noEmit` / `node build.mjs` |
| R3 | 5 个验收脚本全绿 | 见阶段 4 |
| R4 | 影子 profile 里面板/设置页/路由/工具全部按新名工作 | 阶段 5 |
| R5 | 旧记忆数据零丢失 | 迁移前后逐文件比对（大小 + 内容） |
| R6 | 用户电脑上的 workbuddy-xdpool 与模型目录不受影响 | 重启后模型列表正常 |
| R7 | README/CHANGELOG 说明改名与迁移步骤 | 人工阅读 |

---

## 7. 需要你拍板的 6 件事（附我的推荐）

**7.1 包名** —— 推荐 **`dsh-memorybuddy`**。
理由：与本机其它 DSH 插件命名习惯一致（`dsh-context`、`dshmarket`、`dsh-rewind-plugin`），一眼看出是 DSH 插件；裸名 `memorybuddy` 容易被误认为通用 npm 包。若你更喜欢短名，就定 `memorybuddy`，我照改。

**7.2 界面文案** —— 推荐**改**：`WorkBuddy` → `MemoryBuddy`。
代价：P2 的「与截图逐像素比对」是拿原产品截图为基准的，文案改动意味着**文字偏离截图原文**（布局、间距、字号不变）。但项目已正式命名，界面再自称 WorkBuddy 才是真问题。**这一条请你明确点头**，否则我按原样保留截图文案。

**7.3 工具名** —— 推荐 `memorybuddy_recall` / `memorybuddy_remember` / `memorybuddy_forget`。
理由：`memorybuddy_memory` 是叠词。注意：工具名会写进每轮注入的系统提示（`MEMORY_TOOL_GUIDANCE`），改名后模型看到的名字同步变化，**旧会话里历史工具调用记录不受影响**（那是日志）。
是否保留旧名别名？**推荐不保留**——0.1.0 未公开发布、无人依赖旧名，别名会把 `workbuddy` 永久留在代码里。

**7.4 仓库目录 `D:\dsh-workbuddy-memory`** —— 推荐**改**为 `D:\dsh-memorybuddy`，但放在**最后一步**。
成本：profile 里的 `link:` 路径、所有文档里的路径、以及本会话 cwd 都要跟着变。若你想省事，也可以保留目录名（功能无影响，只是名字不一致）。

**7.5 `memory-plan.md`（41 处）** —— 推荐**保留原文**，仅在文件顶部加一行：
> 注：本项目已于 2026-10-16 正式命名为 memorybuddy，代码内标识相应改为 memorybuddy；本文为当时的历史方案，保留原文。
理由：它是历史方案文档，不是插件的一部分；整篇替换会破坏「当时基于 WorkBuddy 截图做的设计」这一事实记录。

**7.6 CHANGELOG 旧条目** —— 推荐**保留 0.1.0 条目原文**（历史记录），新增 `## [0.2.0]` 写明「重命名 + 数据目录迁移」，并给出迁移命令。若你希望 CHANGELOG 里不出现旧名，我就整体替换——请指定。

---

## 8. 附带收益

这次改名顺带解决一个**悬置已久**的问题：你现在运行中的 DSH Desktop（PID 26248，2026-10-15 17:41 启动）仍在执行**改名前的宿主 bundle**，P3 采集修复（`turns` 恒为 0、工具名退化成字面量 `tool`）一直没生效。阶段 6 的重启会把修复后的宿主半边一并加载——重启后请检查 `sessions/` 新笔记里 `turns` 与工具名是否正确。

---

## 9. 风险表

| 风险 | 概率 | 影响 | 对策 |
|---|---|---|---|
| 误改 `dsh-workbuddy-xdpool` 导致模型池失效 | 中 | 高 | §4 白名单 + 禁止仓库外全局替换 + 改后核对 profile |
| 数据目录迁移失败/重复 | 中 | 高 | 阶段 0 先整目录备份；迁移用 `Move-Item` 并逐文件核对 |
| 应用未关闭就迁移，旧插件重建旧目录 | 高 | 中 | 迁移必须在阶段 6 第 3 步之后（应用已关）执行 |
| 改名后遗留旧 CSS `<style>` 标签 | 低 | 低 | 刷新页面即可。注入守卫的 key 是 `` `${PACKAGE_NAME}/panel.module.css` ``（`styles.ts:113` → `:164`），包名一改即换了 key，新标签正常注入；旧标签的类名（`wb*`）此时已无人引用，纯属残留，刷新后消失 |
| 验收脚本断言未同步导致假红 | 高 | 低 | 阶段 4 与阶段 1/2 一起改、一起跑 |
| 旧会话历史记录里的旧工具名被误认为 bug | 低 | 低 | CHANGELOG 说明 |

---

## 10. 不做什么（明确排除）

- 不改写 git 历史
- 不改 `rewind-snapshots` / 会话日志
- 不改 `dsh-workbuddy-xdpool` 及其数据文件
- 不做旧工具名/旧 id 的兼容别名
- 不在 `src/` 内留下任何 `workbuddy` 字面量（包括「兼容旧目录」的自动迁移代码——迁移按 §5 手工执行，正是为了不让旧名回到代码里）
