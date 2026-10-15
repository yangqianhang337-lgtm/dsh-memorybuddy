/**
 * zh / en dictionaries for the WorkBuddy panel and its two settings pages.
 *
 * The panel ships Chinese first (memory-plan §10) with an English fallback, so
 * every user-visible string goes through `t()` rather than being written inline:
 * a hardcoded label would be invisible to the locale switch and would silently
 * break the English half of the release.
 */

export const NS = 'workbuddy-memory'

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

  /* Feedback */
  'toast.saved': string
  'toast.failed': string
  'toast.imported': string
  'toast.consolidated': string
  'toast.reset': string
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
  'entry.label': 'WorkBuddy',
  'entry.tip': 'WorkBuddy 个性化与记忆',

  'nav.personalize': '个性化',
  'nav.memory': '记忆与进化',
  'nav.search': '搜索设置项或记忆',

  'personalize.title': '个性化',
  'personalize.subtitle': '这些设置会立即生效，并写入本机的记忆目录。',
  'card.userName.title': 'WorkBuddy 对你的称呼',
  'card.agentName.title': 'WorkBuddy 的名字',
  'card.replyStyle.title': '回复风格',
  'card.replyStyle.desc': '选择 WorkBuddy 回复的默认语气。',
  'card.welcome.title': '欢迎语',
  'card.welcome.desc': '当对话加载较慢时，用一句问候陪你等待。',
  'card.showFileChanges.title': '显示文件修改过程',
  'card.showFileChanges.desc': '开启后，WorkBuddy 会逐步展示每次文件改动的过程与结果。',
  'card.instructions.title': '给 WorkBuddy 的指令',
  'card.instructions.desc': '写下你希望 WorkBuddy 一直遵守的要求，之后每次对话和任务都会默认生效。',
  'card.instructions.placeholder': '例如：回答尽量简洁，先给结论',
  'card.persona.title': '人设设定',
  'card.persona.desc': '设定 WorkBuddy 的身份、性格与表达风格，对所有回复生效。',
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
  'memory.entriesHint': '只在服务端记下条目；内容始终以 markdown 文件为准。',
  'memory.footerLead': '记忆内容遵循 ',
  'memory.privacyPolicy': 'WorkBuddy 隐私政策',
  'memory.footerTail': '，仅你本人可见',
  'memory.hits': '命中 {count} 条记忆',
  'memory.noHits': '没有命中「{query}」',
  'memory.footer': '记忆内容遵循 WorkBuddy 隐私政策，仅你本人可见',
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

  'toast.saved': '已保存',
  'toast.failed': '保存失败',
  'toast.imported': '已导入并合并',
  'toast.consolidated': '整理完成',
  'toast.reset': '已重置',
  'toast.forgotten': '已移入 archive/',
  'toast.approved': '已批准并写入技能目录',
  'toast.discarded': '已丢弃草稿',
  'toast.pathCopied': '记忆目录路径已复制到剪贴板',
  'confirm.reset.title': '重置长期记忆？',
  'confirm.reset.body': '当前内容会先归档到 journal/ 下的备份目录，然后重建为空骨架。',
  'confirm.reset.ok': '重置',
  'confirm.forget.title': '遗忘这条记忆？',
  'confirm.forget.body': '条目会被移入 archive/，可以人工恢复。',
  'confirm.forget.ok': '遗忘',
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
  'doc.instructions': '给 WorkBuddy 的指令',
  'doc.index': '长期记忆',
}

const en: Dictionary = {
  'entry.label': 'WorkBuddy',
  'entry.tip': 'WorkBuddy personalization and memory',

  'nav.personalize': 'Personalization',
  'nav.memory': 'Memory & evolution',
  'nav.search': 'Search settings or memory',

  'personalize.title': 'Personalization',
  'personalize.subtitle': 'These settings apply immediately and are written to your local memory folder.',
  'card.userName.title': 'What WorkBuddy calls you',
  'card.agentName.title': "WorkBuddy's name",
  'card.replyStyle.title': 'Reply style',
  'card.replyStyle.desc': 'Choose the default tone of WorkBuddy replies.',
  'card.welcome.title': 'Welcome message',
  'card.welcome.desc': 'While a conversation is loading, a greeting keeps you company.',
  'card.showFileChanges.title': 'Show file changes',
  'card.showFileChanges.desc': 'When on, WorkBuddy walks through each file change and its result.',
  'card.instructions.title': 'Instructions for WorkBuddy',
  'card.instructions.desc': 'Write the rules WorkBuddy should always follow; they apply to every conversation and task by default.',
  'card.instructions.placeholder': 'For example: keep answers short, lead with the conclusion',
  'card.persona.title': 'Persona',
  'card.persona.desc': "Sets WorkBuddy's identity, character and voice; it affects every reply.",
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
  'memory.entriesHint': 'Entries are recorded on the server side; the markdown files stay the source of truth.',
  'memory.footerLead': 'Memory follows the ',
  'memory.privacyPolicy': 'WorkBuddy privacy policy',
  'memory.footerTail': ' and is visible only to you',
  'memory.hits': '{count} memories matched',
  'memory.noHits': 'Nothing matched "{query}"',
  'memory.footer': 'Memory follows the WorkBuddy privacy policy and is visible only to you',
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

  'toast.saved': 'Saved',
  'toast.failed': 'Could not save',
  'toast.imported': 'Imported and merged',
  'toast.consolidated': 'Consolidation finished',
  'toast.reset': 'Reset',
  'toast.forgotten': 'Moved to archive/',
  'toast.approved': 'Approved and written to the skills folder',
  'toast.discarded': 'Draft discarded',
  'toast.pathCopied': 'Memory folder path copied to the clipboard',
  'confirm.reset.title': 'Reset long-term memory?',
  'confirm.reset.body': 'The current content is archived under journal/ first, then the skeleton is rebuilt.',
  'confirm.reset.ok': 'Reset',
  'confirm.forget.title': 'Forget this memory?',
  'confirm.forget.body': 'The entry moves to archive/ and can be restored by hand.',
  'confirm.forget.ok': 'Forget',
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
  'doc.instructions': 'Instructions for WorkBuddy',
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
