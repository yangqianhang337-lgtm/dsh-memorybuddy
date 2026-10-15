# 更新日志

本项目遵循[语义化版本](https://semver.org/lang/zh-CN/)。

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

- 数据根目录解析自 `DSH_HOME`，回退 `~/.dsh`，再拼 `dsh-workbuddy-memory/`；代码里不含任何硬编码用户路径。
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
