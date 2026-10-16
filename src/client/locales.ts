/**
 * zh / en dictionaries for the MemoryBuddy panel and its two settings pages.
 *
 * The panel ships Chinese first (memory-plan §10) with an English fallback, so
 * every user-visible string goes through `t()` rather than being written inline:
 * a hardcoded label would be invisible to the locale switch and would silently
 * break the English half of the release.
 */

export const NS = 'memorybuddy'

export interface Dictionary {
  /** Panel row label in the sidebar shell. */
  'entry.label': string
  'entry.tip': string

  /* Left nav */
  'nav.personalize': string
  'nav.memory': string
  'nav.search': string

  /* Personalize page */
  'personalize.title': string
  'personalize.subtitle': string
  // The two identity rows carry no description: the reference draws them as a
  // bare label + input, so there is no string to translate.
  'card.userName.title': string
  'card.agentName.title': string
  'card.replyStyle.title': string
  'card.replyStyle.desc': string
  'card.welcome.title': string
  'card.welcome.desc': string
  'card.showFileChanges.title': string
  'card.showFileChanges.desc': string
  'card.instructions.title': string
  'card.instructions.desc': string
  'card.instructions.placeholder': string
  'card.persona.title': string
  'card.persona.desc': string
  'card.longTerm.title': string
  'card.longTerm.desc': string

  /* Memory page */
  'memory.title': string
  'memory.subtitle': string
  'card.conversationMemory.title': string
  'card.conversationMemory.desc': string
  'card.localMemorySkills.title': string
  'card.localMemorySkills.desc': string
  'card.manage.title': string
  'card.manage.desc': string
  'memory.schedule': string
  'memory.next': string
  'memory.last': string
  'memory.never': string
  'memory.pending': string
  'memory.modelStage': string
  'memory.modelPick': string
  'memory.modelPickHint': string
  'memory.modelPickAuto': string
  'memory.modelPickValue': string
  'memory.modelPickFree': string
  'memory.modelPickEffort': string
  'memory.modelPickOk': string
  'memory.modelPickBad': string
  'memory.modelPickBlocked': string
  'memory.modelPickCooling': string
  'memory.modelPickOff': string
  'memory.modelPickAllow': string
  'memory.modelPickReset': string
  'memory.modelPickEmpty': string
  'memory.modelPickNote': string
  'memory.modelRun': string
  'memory.modelRunTokens': string
  'memory.modelRunFallback': string
  'memory.modelRunSkipped': string
  'memory.questions': string
  'memory.questionsHint': string
  'memory.history': string
  'memory.historyHint': string
  'memory.historyEmpty': string
  'memory.historyBackups': string
  'memory.rollback': string
  'memory.rollbackOpen': string
  'memory.entriesHint': string
  'memory.footerLead': string
  'memory.privacyPolicy': string
  'memory.footerTail': string
  'memory.hits': string
  'memory.noHits': string
  'memory.footer': string
  'memory.entries': string
  'memory.entriesEmpty': string
  'memory.sessions': string
  'memory.sessionsEmpty': string
  'memory.sessionEvents': string
  'memory.sessionPending': string
  'memory.sessionDone': string
  'card.consolidateQuiet.title': string
  'card.consolidateQuiet.desc': string
  'schedule.startup-idle': string
  'schedule.idle': string
  'schedule.session-end': string
  'schedule.fixed': string
  'topic.background': string
  'topic.habits': string
  'topic.environment': string
  'topic.preferences-learned': string

  /* Cards / actions */
  'action.edit': string
  'action.save': string
  'action.cancel': string
  'action.preview': string
  'action.raw': string
  'action.reset': string
  'action.import': string
  'action.consolidate': string
  'action.openFolder': string
  'action.copyPath': string
  'action.privacy': string
  'action.forget': string
  'action.pin': string
  'action.unpin': string
  'action.approve': string
  'action.discard': string
  'action.retry': string
  'action.reload': string
  'action.history': string
  'action.dismiss': string

  /* Feedback */
  'toast.saved': string
  'toast.failed': string
  'toast.imported': string
  'toast.consolidated': string
  'toast.consolidating': string
  'toast.reset': string
  'toast.resetAll': string
  'toast.rolledBack': string
  'toast.dismissed': string
  'toast.forgotten': string
  'toast.approved': string
  'toast.discarded': string
  'toast.pathCopied': string
  'confirm.reset.title': string
  'confirm.reset.body': string
  'confirm.reset.ok': string
  'confirm.forget.title': string
  'confirm.forget.body': string
  'confirm.forget.ok': string
  'confirm.rollback.title': string
  'confirm.rollback.body': string
  'confirm.rollback.ok': string
  'conflict.title': string
  'conflict.body': string
  'conflict.keepMine': string
  'conflict.keepTheirs': string
  'error.load': string
  'error.unreachable': string
  'error.save': string
  'loading': string
  'empty': string
  'unsaved': string

  /* Skills */
  'draft.banner': string
  'draft.card.title': string
  'draft.repeats': string
  'draft.source': string

  /* Documents shown inside the memory page */
  'doc.persona': string
  'doc.instructions': string
  'doc.index': string
}

const zh: Dictionary = {
  'entry.label': 'MemoryBuddy',
  'entry.tip': 'MemoryBuddy 个性化与记忆',

  'nav.personalize': '个性化',
  'nav.memory': '记忆与进化',
  'nav.search': '搜索设置项或记忆',

  'personalize.title': '个性化',
  'personalize.subtitle': '这些设置会立即生效，并写入本机的记忆目录。',
  'card.userName.title': 'MemoryBuddy 对你的称呼',
  'card.agentName.title': 'MemoryBuddy 的名字',
  'card.replyStyle.title': '回复风格',
  'card.replyStyle.desc': '选择 MemoryBuddy 回复的默认语气。',
  'card.welcome.title': '欢迎语',
  'card.welcome.desc': '当对话加载较慢时，用一句问候陪你等待。',
  'card.showFileChanges.title': '显示文件修改过程',
  'card.showFileChanges.desc': '开启后，MemoryBuddy 会逐步展示每次文件改动的过程与结果。',
  'card.instructions.title': '给 MemoryBuddy 的指令',
  'card.instructions.desc': '写下你希望 MemoryBuddy 一直遵守的要求，之后每次对话和任务都会默认生效。',
  'card.instructions.placeholder': '例如：回答尽量简洁，先给结论',
  'card.persona.title': '人设设定',
  'card.persona.desc': '设定 MemoryBuddy 的身份、性格与表达风格，对所有回复生效。',
  'card.longTerm.title': '长期记忆',
  'card.longTerm.desc': '跨会话保存的重要信息与结论，可随时查看和修改。',

  'memory.title': '记忆与进化',
  'memory.subtitle': '自动整理更新，可随时查看和编辑',
  'card.conversationMemory.title': '对话记忆',
  'card.conversationMemory.desc': '记住对话中的重要信息，让后续回答更贴合你。',
  'card.localMemorySkills.title': '本地记忆与技能',
  'card.localMemorySkills.desc': '自动记录工作过程并优化技能，数据仅保存在你的设备上。',
  'card.manage.title': '管理记忆',
  'card.manage.desc': '自动整理更新，可随时查看和编辑。',
  'memory.schedule': '整理时机',
  'memory.next': '下次整理',
  'memory.last': '上次整理',
  'memory.never': '（还没有整理过）',
  'memory.pending': '{count} 个会话待整理',
  'memory.modelStage': '模型提炼未启用（首版）',
  'memory.modelPick': '提炼模型',
  'memory.modelPickHint': '留空则按「免费优先」自动挑选；选了就优先用它，失败时自动回退。',
  'memory.modelPickAuto': '自动（免费优先）',
  'memory.modelPickValue': '{provider} / {model}',
  'memory.modelPickFree': '· 免费',
  'memory.modelPickEffort': '思考档位',
  'memory.modelPickOk': '可用 · 上下文 {context}',
  'memory.modelPickBad': '当前不可用（{reason}），整理时会自动回退到候选链',
  'memory.modelPickBlocked': '你选的模型不在白名单里',
  'memory.modelPickCooling': '这个模型正在冷却（剩 {minutes} 分钟），整理时会跳过它',
  'memory.modelPickOff': '已关闭模型提炼',
  'memory.modelPickAllow': '加入白名单',
  'memory.modelPickReset': '改回自动',
  'memory.modelPickEmpty': '当前环境没有可用的模型服务。',
  'memory.modelPickNote': '免费标记仅供参考（按 provider 配对匹配）',
  'memory.modelRun': '上次整理用了 {model}',
  'memory.modelRunTokens': ' · {tokens} token',
  'memory.modelRunFallback': ' · 已从 {from} 回退',
  'memory.modelRunSkipped': '未执行：{reason}',
  'memory.questions': '待你确认',
  'memory.questionsHint': '整理时发现这几处互相矛盾或久未更新，处理完请点「知道了」。',
  'memory.history': '整理历史',
  'memory.historyHint': '每天第一次整理前会先备份；回滚会把当天的备份写回，回滚前的状态也会再备份一次。',
  'memory.historyEmpty': '还没有可回滚的备份。',
  'memory.historyBackups': '{count} 个文件',
  'memory.rollback': '回滚到这一天',
  'memory.rollbackOpen': '查看当天日志',
  'memory.entriesHint': '只在服务端记下条目；内容始终以 markdown 文件为准。',
  'memory.footerLead': '记忆内容遵循 ',
  'memory.privacyPolicy': 'MemoryBuddy 隐私政策',
  'memory.footerTail': '，仅你本人可见',
  'memory.hits': '命中 {count} 条记忆',
  'memory.noHits': '没有命中「{query}」',
  'memory.footer': '记忆内容遵循 MemoryBuddy 隐私政策，仅你本人可见',
  'memory.entries': '已记住的条目',
  'memory.entriesEmpty': '还没有积累到条目。多聊几轮后会自动出现。',
  'memory.sessions': '最近的会话沉淀',
  'memory.sessionsEmpty': '还没有会话沉淀文件。',
  'memory.sessionEvents': '{count} 条事件',
  'memory.sessionPending': '待整理',
  'memory.sessionDone': '已整理',
  'card.consolidateQuiet.title': '静默整理',
  'card.consolidateQuiet.desc': '整理时不弹出提示，只在记忆页留下记录。',
  'schedule.startup-idle': '启动补齐 + 空闲时',
  'schedule.idle': '空闲时',
  'schedule.session-end': '会话结束时',
  'schedule.fixed': '每天固定时间',
  'topic.background': '工作背景',
  'topic.habits': '行事风格',
  'topic.environment': '本机软件与路径',
  'topic.preferences-learned': '习得偏好',

  'action.edit': '编辑',
  'action.save': '保存',
  'action.cancel': '取消',
  'action.preview': '预览',
  'action.raw': '原文',
  'action.reset': '重置',
  'action.import': '导入',
  'action.consolidate': '立即整理',
  'action.openFolder': '打开记忆目录',
  'action.copyPath': '复制记忆目录路径',
  'action.privacy': '查看隐私规则',
  'action.forget': '遗忘',
  'action.pin': '固定',
  'action.unpin': '取消固定',
  'action.approve': '批准',
  'action.discard': '丢弃',
  'action.retry': '重试',
  'action.reload': '重新加载',
  'action.history': '历史',
  'action.dismiss': '知道了',

  'toast.saved': '已保存',
  'toast.failed': '保存失败',
  'toast.imported': '已导入并合并',
  'toast.consolidated': '整理完成',
  'toast.consolidating': '已开始整理，稍后刷新查看结果',
  'toast.reset': '已重置',
  'toast.resetAll': '全部记忆已移入 archive/，骨架已重建',
  'toast.rolledBack': '已回滚',
  'toast.dismissed': '已标记为知道',
  'toast.forgotten': '已移入 archive/',
  'toast.approved': '已批准并写入技能目录',
  'toast.discarded': '已丢弃草稿',
  'toast.pathCopied': '记忆目录路径已复制到剪贴板',
  'confirm.reset.title': '重置长期记忆？',
  'confirm.reset.body': '全部记忆（memory/、sessions/、journal/、人设与指令）会移入 archive/reset-<时间戳>/，不会删除。确认重置？',
  'confirm.reset.ok': '归档并重置',
  'confirm.forget.title': '遗忘这条记忆？',
  'confirm.forget.body': '条目会被移入 archive/，可以人工恢复。',
  'confirm.forget.ok': '遗忘',
  'confirm.rollback.title': '回滚到这一天的备份？',
  'confirm.rollback.body': '当天备份覆盖的文件会被写回，回滚前的当前状态会先再备份一次。',
  'confirm.rollback.ok': '回滚',
  'conflict.title': '这份内容在别处被改过',
  'conflict.body': '你的编辑没有丢：选择保留哪一份，或取消后手工合并。',
  'conflict.keepMine': '用我的覆盖',
  'conflict.keepTheirs': '用磁盘上的版本',
  'error.load': '读取记忆失败',
  'error.unreachable': '连不上宿主服务，DSH 可能正在重启。',
  'error.save': '保存失败',
  'loading': '加载中…',
  'empty': '（暂无内容）',
  'unsaved': '未保存',

  'draft.banner': '有 {count} 个技能草稿等待你批准',
  'draft.card.title': '待批准技能',
  'draft.repeats': '重复 {count} 次',
  'draft.source': '来自会话',

  'doc.persona': '人设设定',
  'doc.instructions': '给 MemoryBuddy 的指令',
  'doc.index': '长期记忆',
}

const en: Dictionary = {
  'entry.label': 'MemoryBuddy',
  'entry.tip': 'MemoryBuddy personalization and memory',

  'nav.personalize': 'Personalization',
  'nav.memory': 'Memory & evolution',
  'nav.search': 'Search settings or memory',

  'personalize.title': 'Personalization',
  'personalize.subtitle': 'These settings apply immediately and are written to your local memory folder.',
  'card.userName.title': 'What MemoryBuddy calls you',
  'card.agentName.title': "MemoryBuddy's name",
  'card.replyStyle.title': 'Reply style',
  'card.replyStyle.desc': 'Choose the default tone of MemoryBuddy replies.',
  'card.welcome.title': 'Welcome message',
  'card.welcome.desc': 'While a conversation is loading, a greeting keeps you company.',
  'card.showFileChanges.title': 'Show file changes',
  'card.showFileChanges.desc': 'When on, MemoryBuddy walks through each file change and its result.',
  'card.instructions.title': 'Instructions for MemoryBuddy',
  'card.instructions.desc': 'Write the rules MemoryBuddy should always follow; they apply to every conversation and task by default.',
  'card.instructions.placeholder': 'For example: keep answers short, lead with the conclusion',
  'card.persona.title': 'Persona',
  'card.persona.desc': "Sets MemoryBuddy's identity, character and voice; it affects every reply.",
  'card.longTerm.title': 'Long-term memory',
  'card.longTerm.desc': 'Important facts and conclusions kept across conversations; view or edit any time.',

  'memory.title': 'Memory & evolution',
  'memory.subtitle': 'Updated automatically; you can review and edit it any time',
  'card.conversationMemory.title': 'Conversation memory',
  'card.conversationMemory.desc': 'Remembers what matters from your conversations so later answers fit you better.',
  'card.localMemorySkills.title': 'Local memory and skills',
  'card.localMemorySkills.desc': 'Records your work and improves skills automatically; the data stays on your device.',
  'card.manage.title': 'Manage memory',
  'card.manage.desc': 'Updated automatically; you can review and edit it any time.',
  'memory.schedule': 'Consolidation',
  'memory.next': 'Next pass',
  'memory.last': 'Last pass',
  'memory.never': '(never run yet)',
  'memory.pending': '{count} sessions waiting',
  'memory.modelStage': 'Model distillation is off (first release)',
  'memory.modelPick': 'Distillation model',
  'memory.modelPickHint': 'Leave it empty to pick automatically (free first); a choice is tried first and falls back on failure.',
  'memory.modelPickAuto': 'Automatic (free first)',
  'memory.modelPickValue': '{provider} / {model}',
  'memory.modelPickFree': '· free',
  'memory.modelPickEffort': 'Reasoning effort',
  'memory.modelPickOk': 'Available · context {context}',
  'memory.modelPickBad': 'Not available right now ({reason}); a pass will fall back to the chain',
  'memory.modelPickBlocked': 'Your choice is not in the allowlist',
  'memory.modelPickCooling': 'This model is cooling down ({minutes} min left); a pass will skip it',
  'memory.modelPickOff': 'Model distillation is off',
  'memory.modelPickAllow': 'Add to allowlist',
  'memory.modelPickReset': 'Back to automatic',
  'memory.modelPickEmpty': 'No model service is available in this environment.',
  'memory.modelPickNote': 'The free tag is advisory (matched per provider)',
  'memory.modelRun': 'Last pass used {model}',
  'memory.modelRunTokens': ' · {tokens} tokens',
  'memory.modelRunFallback': ' · fell back from {from}',
  'memory.modelRunSkipped': 'Not run: {reason}',
  'memory.questions': 'Waiting for your answer',
  'memory.questionsHint': 'A pass found these contradictory or stale; dismiss each one once you have handled it.',
  'memory.history': 'Consolidation history',
  'memory.historyHint': 'Every pass backs up what it rewrites first; a rollback writes that day back and backs up the current state in turn.',
  'memory.historyEmpty': 'No backups to roll back to yet.',
  'memory.historyBackups': '{count} files',
  'memory.rollback': 'Roll back to this day',
  'memory.rollbackOpen': 'View that day',
  'memory.entriesHint': 'Entries are recorded on the server side; the markdown files stay the source of truth.',
  'memory.footerLead': 'Memory follows the ',
  'memory.privacyPolicy': 'MemoryBuddy privacy policy',
  'memory.footerTail': ' and is visible only to you',
  'memory.hits': '{count} memories matched',
  'memory.noHits': 'Nothing matched "{query}"',
  'memory.footer': 'Memory follows the MemoryBuddy privacy policy and is visible only to you',
  'memory.entries': 'Remembered entries',
  'memory.entriesEmpty': 'Nothing accumulated yet. Entries show up after a few conversations.',
  'memory.sessions': 'Recent session notes',
  'memory.sessionsEmpty': 'No session notes yet.',
  'memory.sessionEvents': '{count} events',
  'memory.sessionPending': 'pending',
  'memory.sessionDone': 'consolidated',
  'card.consolidateQuiet.title': 'Quiet consolidation',
  'card.consolidateQuiet.desc': 'Consolidate without a prompt; the memory page still records each pass.',
  'schedule.startup-idle': 'On startup and when idle',
  'schedule.idle': 'When idle',
  'schedule.session-end': 'At the end of a session',
  'schedule.fixed': 'At a fixed time each day',
  'topic.background': 'Work background',
  'topic.habits': 'Working style',
  'topic.environment': 'Tools and paths',
  'topic.preferences-learned': 'Learned preferences',

  'action.edit': 'Edit',
  'action.save': 'Save',
  'action.cancel': 'Cancel',
  'action.preview': 'Preview',
  'action.raw': 'Markdown',
  'action.reset': 'Reset',
  'action.import': 'Import',
  'action.consolidate': 'Consolidate now',
  'action.openFolder': 'Open memory folder',
  'action.copyPath': 'Copy memory folder path',
  'action.privacy': 'View privacy rules',
  'action.forget': 'Forget',
  'action.pin': 'Pin',
  'action.unpin': 'Unpin',
  'action.approve': 'Approve',
  'action.discard': 'Discard',
  'action.retry': 'Retry',
  'action.reload': 'Reload',
  'action.history': 'History',
  'action.dismiss': 'Got it',

  'toast.saved': 'Saved',
  'toast.failed': 'Could not save',
  'toast.imported': 'Imported and merged',
  'toast.consolidated': 'Consolidation finished',
  'toast.consolidating': 'Consolidation started; refresh shortly for the result',
  'toast.reset': 'Reset',
  'toast.resetAll': 'All memory moved to archive/ and the skeleton rebuilt',
  'toast.rolledBack': 'Rolled back',
  'toast.dismissed': 'Marked as handled',
  'toast.forgotten': 'Moved to archive/',
  'toast.approved': 'Approved and written to the skills folder',
  'toast.discarded': 'Draft discarded',
  'toast.pathCopied': 'Memory folder path copied to the clipboard',
  'confirm.reset.title': 'Reset long-term memory?',
  'confirm.reset.body':
    'All memory (memory/, sessions/, journal/, persona and instructions) moves to archive/reset-<timestamp>/ — nothing is deleted. Reset?',
  'confirm.reset.ok': 'Archive and reset',
  'confirm.forget.title': 'Forget this memory?',
  'confirm.forget.body': 'The entry moves to archive/ and can be restored by hand.',
  'confirm.forget.ok': 'Forget',
  'confirm.rollback.title': 'Roll back to that day?',
  'confirm.rollback.body':
    'Files covered by that day’s backup are written back, and the current state is backed up first.',
  'confirm.rollback.ok': 'Roll back',
  'conflict.title': 'This content changed elsewhere',
  'conflict.body': 'Your edit is not lost: keep one version, or cancel and merge by hand.',
  'conflict.keepMine': 'Overwrite with mine',
  'conflict.keepTheirs': 'Use the version on disk',
  'error.load': 'Could not read memory',
  'error.unreachable': 'The host service is unreachable; DSH may be restarting.',
  'error.save': 'Could not save',
  'loading': 'Loading…',
  'empty': '(nothing yet)',
  'unsaved': 'Unsaved',

  'draft.banner': '{count} skill drafts are waiting for your approval',
  'draft.card.title': 'Skills awaiting approval',
  'draft.repeats': 'Repeated {count} times',
  'draft.source': 'From sessions',

  'doc.persona': 'Persona',
  'doc.instructions': 'Instructions for MemoryBuddy',
  'doc.index': 'Long-term memory',
}

export const DICTIONARIES: Record<string, Dictionary> = { zh, en }

/** Message keys, so a typo is a compile error rather than an empty label. */
export type MessageKey = keyof Dictionary

/** Interpolate `{name}` placeholders; an unknown key renders as the key itself. */
export function translate(
  dictionaries: Record<string, Dictionary>,
  locale: string,
  key: string,
  params?: Record<string, string>,
): string {
  // `Dictionary` is an interface, so it carries no index signature and cannot be
  // assigned to `Record<string, string>` directly; the lookup goes through
  // `unknown` for that reason only.
  const table = (dictionaries[locale] ?? zh) as unknown as Record<string, string | undefined>
  const fallback = zh as unknown as Record<string, string | undefined>
  const template = table[key] ?? fallback[key] ?? key
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? params[name] ?? match : match,
  )
}
