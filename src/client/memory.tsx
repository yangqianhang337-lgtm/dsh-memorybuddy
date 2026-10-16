/**
 * The 「记忆与进化」 page (memory-plan §2.4).
 *
 * Everything the page shows comes from the host snapshot: no client-side state
 * survives a reload, and every write goes back through the host route so the
 * markdown on disk stays the single source of truth. The page owns three things
 * the cards do not: the pending-draft banner (§6.2), the import file picker (the
 * host has no import route, so the merge is composed here and written through
 * the ordinary revision-checked save), and the consolidated-timing line (§6.1).
 */

import * as React from 'react'
import { Button, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  Banner,
  Card,
  ChoiceMenu,
  Confirm,
  DocumentBody,
  DraftDialog,
  EntryList,
  OptionMenu,
  Row,
  ToastHost,
  TypedConfirm,
  type LabelledOption,
  type Translate,
} from './cards.tsx'
import {
  CONSOLIDATE_MODES,
  TOPICS,
  WIPE_CONFIRMATION,
  type DraftDetail,
  type DraftView,
  type EntryView,
  type JournalView,
  type ModelCatalog,
  type MemorySnapshot,
  type ProjectView,
  type SessionNoteView,
} from '../protocol.ts'
import { cx, panelCss as css } from './styles.ts'

export interface MemoryPageProps {
  t: Translate
  snapshot: MemorySnapshot | undefined
  loading: boolean
  busy: boolean
  /** Search box contents: entries and sessions are filtered and highlighted. */
  query: string
  onPatch: (patch: Record<string, unknown>) => void
  onSaveDocument: (path: string, text: string, revision: string) => Promise<boolean>
  onAction: (action: Record<string, unknown>) => Promise<boolean>
  /** Start a pass and poll for its result; resolves once it was accepted. */
  onConsolidate: () => Promise<{ started: boolean; reason?: string }>
  /** Read one journal day for the history view. */
  onJournal: (date: string) => Promise<JournalView | undefined>
  /** Read one skill draft in full for the detail dialog (P7 §6.2 B). */
  onDraft: (name: string) => Promise<DraftDetail | undefined>
  /**
   * Read the runtime's model catalogue, for the picker card's dropdown.
   *
   * Separate from `onAction` because it is the one panel read that may cost a
   * network round trip: the host caches it, and the card only asks for it when
   * the user actually opens the dropdown.
   */
  onCatalog: () => Promise<ModelCatalog | undefined>
  /**
   * Render the page heading (title + schedule line). The first-level panel keeps
   * it because that drop has no nav label of ours; the Settings drop passes
   * false, because the reference draws no heading above the cards.
   */
  heading?: boolean
  /**
   * Render without the panel's own scroll container, for the Settings drop: the
   * shell already supplies the options column's padding and scrolling there.
   */
  bare?: boolean
}
/** Topic display name, falling back to the raw key for an unknown topic. */
function topicTitle(t: Translate, key: string): string {
  return t(`topic.${key}`)
}

/** One line describing when the next automatic pass happens (memory-plan §6.1). */
function scheduleLine(t: Translate, snapshot: MemorySnapshot | undefined): string {
  const mode = snapshot?.preferences.consolidateOn ?? 'startup-idle'
  const known = (CONSOLIDATE_MODES as readonly string[]).includes(mode)
  const base = t(`schedule.${known ? mode : 'startup-idle'}`)
  if (mode === 'fixed' && snapshot !== undefined) {
    return `${base} ${snapshot.preferences.consolidateFixedTime}`
  }
  if (mode === 'idle' && snapshot !== undefined) {
    return `${base}（${snapshot.preferences.consolidateIdleMinutes} 分钟）`
  }
  return base
}

/**
 * One model entry as the dropdown renders it (§4.4).
 *
 * The id is the `provider/model` route — the same string the host stores in
 * `modelChoiceProvider` + `modelChoiceModel` and keys its cooldown table by.
 * The label is for humans only; the host never parses it back.
 */
function modelOptions(catalog: ModelCatalog | undefined): LabelledOption[] {
  if (catalog === undefined) return []
  return catalog.models.map(model => ({
    id: `${model.provider}/${model.id}`,
    label: `${model.name}（${model.provider}/${model.id}）${model.free ? ' · 免费' : ''}`,
  }))
}

/**
 * The 「提炼模型」 card (memorybuddy-plan §4.4).
 *
 * Everything on it is derived: the dropdown is a live enumeration from the host,
 * the verdict is the host's `resolveModelInfo` result, and the allowlist button
 * exists because a non-empty allowlist is a HARD boundary that binds the user's
 * own choice too (§4.4 rule 5). There is no client-side copy of the policy.
 *
 * `off` greys the card out (§4.4 rule 6) rather than hiding it, so the user can
 * still see what they picked and find the switch that turns it back on.
 */
function ModelPickerCard({
  t,
  snapshot,
  busy,
  onPatch,
  onCatalog,
}: {
  t: Translate
  snapshot: MemorySnapshot | undefined
  busy: boolean
  onPatch: (patch: Record<string, unknown>) => void
  onCatalog: () => Promise<ModelCatalog | undefined>
}): React.ReactElement {
  const [catalog, setCatalog] = React.useState<ModelCatalog | undefined>(undefined)
  const [fetched, setFetched] = React.useState(false)
  const preferences = snapshot?.preferences
  const choice = snapshot?.runtime?.modelChoice
  const provider = preferences?.modelChoiceProvider ?? ''
  const model = preferences?.modelChoiceModel ?? ''
  const route = provider !== '' && model !== '' ? `${provider}/${model}` : ''
  const policy = preferences?.modelPolicy ?? 'free-first'
  const off = policy === 'off'
  const options = modelOptions(catalog)

  /**
   * Fetch the enumeration on first use.
   *
   * The host caches it with a TTL and invalidates on `llm/adapters-updated`,
   * so this is once per panel life in practice — but the card never blocks on
   * it: until the answer lands the dropdown simply has no options.
   */
  const load = React.useCallback(async (): Promise<void> => {
    if (fetched) return
    setFetched(true)
    const next = await onCatalog()
    setCatalog(next)
  }, [fetched, onCatalog])

  const allowlist = preferences?.modelAllowlist ?? []
  const efforts = choice?.efforts ?? []
  const effort = preferences?.modelChoiceEffort ?? ''

  return (
    <Card title={t('memory.modelPick')} description={t('memory.modelPickHint')}>
      <Row>
        <div className={css.cardText}>
          <div className={css.cardTitle}>{t('memory.modelPick')}</div>
          <div className={css.cardDesc}>{route === '' ? t('memory.modelPickAuto') : t('memory.modelPickValue', { provider, model })}</div>
        </div>
        <div className={cx(css.pickRow, off ? css.pickOff : undefined)}>
          <span onMouseEnter={() => void load()} onFocus={() => void load()}>
            <OptionMenu
              value={route}
              options={options}
              placeholder={fetched && options.length === 0 ? t('memory.modelPickEmpty') : t('memory.modelPickAuto')}
              disabled={off || busy}
              ariaLabel={t('memory.modelPick')}
              onSelect={next => {
                const [nextProvider, ...rest] = next.split('/')
                if (nextProvider === undefined || rest.length === 0) return
                const nextModel = rest.join('/')
                onPatch({ modelChoiceProvider: nextProvider, modelChoiceModel: nextModel, modelChoiceEffort: '' })
              }}
            />
          </span>
          {route !== '' && (
            <Button
              size="sm"
              variant="outline"
              disabled={off || busy}
              onClick={() => onPatch({ modelChoiceProvider: '', modelChoiceModel: '', modelChoiceEffort: '' })}
            >
              {t('memory.modelPickReset')}
            </Button>
          )}
        </div>
      </Row>

      {/*
        The verdict comes from the host's live `resolveModelInfo`, refreshed on
        every snapshot. It is what makes a stale pick visible instead of only
        failing on the next pass.
      */}
      {off ? (
        <div className={css.pickWarn}>{t('memory.modelPickOff')}</div>
      ) : route === '' ? (
        <div className={css.note}>{t('memory.modelPickAuto')}</div>
      ) : choice === undefined ? (
        <div className={css.note}>{t('memory.modelStage')}</div>
      ) : (
        <>
          {choice.blockedByAllowlist ? (
            <div className={cx(css.error, css.pickRow)}>
              <span>{t('memory.modelPickBlocked')}</span>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => onPatch({ modelAllowlist: [...allowlist, `${provider}/${model}`] })}
              >
                {t('memory.modelPickAllow')}
              </Button>
            </div>
          ) : choice.ok ? (
            <div className={css.pickOk}>
              {t('memory.modelPickOk', {
                context: choice.contextWindow === undefined ? '—' : String(choice.contextWindow),
              })}
            </div>
          ) : (
            <div className={css.pickBad}>
              {t('memory.modelPickBad', { reason: choice.reason ?? 'unknown' })}
            </div>
          )}
          {!choice.blockedByAllowlist && choice.cooling && (
            <div className={css.pickWarn}>{t('memory.modelPickCooling', { minutes: '—' })}</div>
          )}
          {choice.ok && !choice.blockedByAllowlist && efforts.length > 0 && (
            <Row>
              <div className={css.cardText}>
                <div className={css.cardTitle}>{t('memory.modelPickEffort')}</div>
                <div className={css.cardDesc}>{choice.defaultEffort ?? efforts[0]}</div>
              </div>
              <ChoiceMenu
                value={effort === '' ? (choice.defaultEffort ?? efforts[0]) : effort}
                options={efforts}
                disabled={off || busy}
                ariaLabel={t('memory.modelPickEffort')}
                onSelect={next => onPatch({ modelChoiceEffort: next === choice.defaultEffort ? '' : next })}
              />
            </Row>
          )}
        </>
      )}

      {/* What the last pass actually did, from the journal's model record. */}
      <div className={css.pick}>
        <div className={css.note}>
          {snapshot?.consolidation.model !== undefined && snapshot.consolidation.model.used !== undefined
            ? `${t('memory.modelRun', { model: snapshot.consolidation.model.used })}${
                snapshot.consolidation.model.tokens === undefined
                  ? ''
                  : t('memory.modelRunTokens', { tokens: String(snapshot.consolidation.model.tokens) })
              }${
                snapshot.consolidation.model.fellBackFrom === undefined
                  ? ''
                  : t('memory.modelRunFallback', { from: snapshot.consolidation.model.fellBackFrom })
              }`
            : snapshot?.consolidation.model?.skippedReason === undefined
              ? t('memory.modelPickAuto')
              : t('memory.modelRunSkipped', { reason: snapshot.consolidation.model.skippedReason })}
        </div>
        <div className={css.note}>{t('memory.modelPickNote')}</div>
      </div>
    </Card>
  )
}

/**
 * The pending-draft cards (memory-plan §6.2 step 3).
 *
 * The card row is deliberately thin — 查看 opens the detail dialog, and the three
 * decisions the plan requires (批准 / 编辑后批准 / 忽略) live in that dialog, where
 * the user can actually read what they are approving. A 批准 button that writes a
 * file into `$DSH_HOME/skills/` without ever showing the file would make the plan's
 * approval step decorative.
 */
function DraftCards({
  t,
  drafts,
  busy,
  onView,
}: {
  t: Translate
  drafts: DraftView[]
  busy: boolean
  onView: (name: string) => void
}): React.ReactElement {
  return (
    <>
      {drafts.map(draft => (
        <Card
          key={draft.name}
          title={draft.title}
          description={`${t('draft.source')} · ${t('draft.repeats', { count: String(draft.repeats) })}`}
          actions={
            <Button size="sm" variant="primary" disabled={busy} onClick={() => onView(draft.name)}>
              {t('draft.view')}
            </Button>
          }
        >
          <div className={css.note}>{draft.path}</div>
        </Card>
      ))}
    </>
  )
}

/**
 * 项目记忆 (P6 §5): one card per project file under `memory/projects/`.
 *
 * The card lists what exists — slug, entry count, last update — and offers the
 * two operations the plan gives it: 编辑 (the document editor, revision-checked
 * like every other document) and 归档 (forget-project, which moves the file to
 * archive/). The v1 collector only records a workspace's existence, so a young
 * install shows the empty line rather than a greyed-out card.
 */
function ProjectsCard({
  t,
  projects,
  busy,
  onEdit,
  onForget,
}: {
  t: Translate
  projects: ProjectView[]
  busy: boolean
  onEdit: (path: string) => void
  onForget: (slug: string) => void
}): React.ReactElement {
  return (
    <Card title={t('memory.projects')} description={t('memory.projectsHint')}>
      {projects.length === 0 ? (
        <div className={css.proseEmpty}>{t('memory.projectsEmpty')}</div>
      ) : (
        <div className={cx(css.entries)}>
          {projects.map(project => (
            <div className={css.entry} key={project.slug}>
              <div className={css.entryBody}>
                <div className={css.entryText}>{project.slug}</div>
                <div className={css.entryMeta}>
                  <span>{t('memory.projectEntries', { count: String(project.entries) })}</span>
                  <span>{project.updated.slice(0, 10)}</span>
                </div>
              </div>
              <div className={css.entryActions}>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => onEdit(project.path)}>
                  {t('action.edit')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className={css.danger}
                  disabled={busy}
                  onClick={() => onForget(project.slug)}
                >
                  {t('memory.projectForget')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

/** The memory page. */
export function MemoryPage({
  t,
  snapshot,
  loading,
  busy,
  query,
  onPatch,
  onSaveDocument,
  onAction,
  onConsolidate,
  onJournal,
  onDraft,
  onCatalog,
  heading = true,
  bare = false,
}: MemoryPageProps): React.ReactElement {
  const [toast, setToast] = React.useState<{ token: number; text: string; tone?: 'success' | 'danger' }>({
    token: 0,
    text: '',
  })
  const [resetOpen, setResetOpen] = React.useState(false)
  const [wipeOpen, setWipeOpen] = React.useState(false)
  const [forget, setForget] = React.useState<{ topic: string; id: string } | undefined>(undefined)
  const [forgetProject, setForgetProject] = React.useState<string | undefined>(undefined)
  const [projectDoc, setProjectDoc] = React.useState<string | undefined>(undefined)
  const [projectDraft, setProjectDraft] = React.useState('')
  const [indexEditing, setIndexEditing] = React.useState(false)
  const [indexDraft, setIndexDraft] = React.useState('')
  const [rollbackDate, setRollbackDate] = React.useState<string | undefined>(undefined)
  const [journalDate, setJournalDate] = React.useState('')
  const [journal, setJournal] = React.useState<JournalView | undefined>(undefined)
  // The dialog is open from the click on 查看 until it is closed or the draft is
  // handled, so BOTH pieces are state: `draftOpen` keeps it mounted (and showing
  // its loading line) while `draft` carries the content, which arrives a round
  // trip later.
  const [draftOpen, setDraftOpen] = React.useState(false)
  const [draftLoading, setDraftLoading] = React.useState(false)
  const [draft, setDraft] = React.useState<DraftDetail | undefined>(undefined)
  const fileRef = React.useRef<HTMLInputElement | null>(null)

  const say = React.useCallback(
    (text: string, tone?: 'success' | 'danger'): void => {
      setToast(current => ({ token: current.token + 1, text, ...(tone === undefined ? {} : { tone }) }))
    },
    [],
  )

  const preferences = snapshot?.preferences
  const index = snapshot?.index
  const needle = query.trim().toLowerCase()

  /** Entries of one topic, filtered by the search box when it holds text. */
  const entriesOf = React.useCallback(
    (key: string): EntryView[] => {
      const all = snapshot?.entries[key] ?? []
      if (needle === '') return all
      return all.filter(entry => entry.text.toLowerCase().includes(needle))
    },
    [needle, snapshot],
  )

  const matched = React.useMemo(() => {
    const grouped: Array<{ key: string; items: EntryView[] }> = []
    for (const topic of TOPICS) {
      const items = entriesOf(topic.key)
      if (items.length > 0) grouped.push({ key: topic.key, items })
    }
    return grouped
  }, [entriesOf])

  const hitCount = matched.reduce((total, group) => total + group.items.length, 0)

  const sessions = React.useMemo((): SessionNoteView[] => {
    const items = snapshot?.sessions.items ?? []
    if (needle === '') return items
    return items.filter(
      item => item.id.toLowerCase().includes(needle) || item.title.toLowerCase().includes(needle),
    )
  }, [needle, snapshot])

  const drafts = snapshot?.drafts ?? []
  const questions = snapshot?.questions ?? []
  const history = snapshot?.history ?? []

  /** Flip one preference through the host; failures surface as a toast. */
  const patchPreference = React.useCallback(
    (key: string, value: unknown): void => {
      onPatch({ [key]: value })
    },
    [onPatch],
  )

  const consolidate = React.useCallback(async (): Promise<void> => {
    const outcome = await onConsolidate()
    if (!outcome.started) {
      say(outcome.reason ?? t('toast.failed'), 'danger')
      return
    }
    // The host answers before the pass finishes, so this is "accepted", not
    // "done": the controller polls and the card updates itself.
    say(t('toast.consolidating'), 'success')
  }, [onConsolidate, say, t])

  const doReset = React.useCallback(async (): Promise<void> => {
    setResetOpen(false)
    const ok = await onAction({ kind: 'reset-all' })
    say(ok ? t('toast.resetAll') : t('toast.failed'), ok ? 'success' : 'danger')
  }, [onAction, say, t])

  /**
   * 彻底删除 (P8).
   *
   * The phrase travels in the action and the host re-checks it, so a client that
   * skipped the dialog would still be refused. On success the memory root is
   * GONE, which means the snapshot the action returns describes a directory that
   * no longer exists — the store recreates it on the next `ensure()`, and the
   * honest thing to show afterwards is the toast, not a stale list of entries
   * that were just deleted.
   */
  const doWipe = React.useCallback(async (): Promise<void> => {
    setWipeOpen(false)
    const ok = await onAction({ kind: 'wipe-all', confirm: WIPE_CONFIRMATION })
    say(ok ? t('toast.wiped') : t('toast.failed'), ok ? 'success' : 'danger')
  }, [onAction, say, t])

  const dismissQuestion = React.useCallback(
    async (index: number): Promise<void> => {
      const ok = await onAction({ kind: 'dismiss-question', index })
      say(ok ? t('toast.dismissed') : t('toast.failed'), ok ? 'success' : 'danger')
    },
    [onAction, say, t],
  )

  const openJournal = React.useCallback(
    async (date: string): Promise<void> => {
      setJournalDate(date)
      setJournal(await onJournal(date))
    },
    [onJournal],
  )

  /** Open the detail dialog and load the draft's full text. */
  const openDraft = React.useCallback(
    async (name: string): Promise<void> => {
      setDraftOpen(true)
      setDraftLoading(true)
      setDraft(undefined)
      const loaded = await onDraft(name)
      setDraft(loaded)
      setDraftLoading(false)
      if (loaded === undefined) say(t('draft.detail.gone'), 'danger')
    },
    [onDraft, say, t],
  )

  const closeDraft = React.useCallback((): void => {
    setDraftOpen(false)
    setDraft(undefined)
  }, [])

  /**
   * 批准 / 编辑后批准.
   *
   * `text` present means the user edited the file in the dialog; it is passed
   * straight through to the host, which writes exactly those bytes. The dialog is
   * closed only after the host confirms, so a failed write leaves the text on
   * screen to retry rather than discarding the user's work.
   */
  const approveDraft = React.useCallback(
    async (text?: string): Promise<void> => {
      if (draft === undefined) return
      const ok = await onAction(
        text === undefined ? { kind: 'approve-draft', name: draft.name } : { kind: 'approve-draft', name: draft.name, text },
      )
      say(ok ? t('toast.approved') : t('toast.failed'), ok ? 'success' : 'danger')
      if (ok) closeDraft()
    },
    [closeDraft, draft, onAction, say, t],
  )

  /** 忽略: the draft is archived, not deleted, and leaves the pending list. */
  const ignoreDraft = React.useCallback(async (): Promise<void> => {
    if (draft === undefined) return
    const name = draft.name
    const ok = await onAction({ kind: 'ignore-draft', name })
    say(ok ? t('toast.discarded') : t('toast.failed'), ok ? 'success' : 'danger')
    if (ok) closeDraft()
  }, [closeDraft, draft, onAction, say, t])

  const doRollback = React.useCallback(async (): Promise<void> => {
    const date = rollbackDate
    setRollbackDate(undefined)
    if (date === undefined) return
    const ok = await onAction({ kind: 'rollback', date })
    say(ok ? t('toast.rolledBack') : t('toast.failed'), ok ? 'success' : 'danger')
    if (ok) setJournal(await onJournal(date))
  }, [onJournal, onAction, rollbackDate, say, t])

  const doForget = React.useCallback(async (): Promise<void> => {
    const target = forget
    setForget(undefined)
    if (target === undefined) return
    const ok = await onAction({ kind: 'forget-entry', topic: target.topic, id: target.id })
    say(ok ? t('toast.forgotten') : t('toast.failed'), ok ? 'success' : 'danger')
  }, [forget, onAction, say, t])

  const doForgetProject = React.useCallback(async (): Promise<void> => {
    const slug = forgetProject
    setForgetProject(undefined)
    if (slug === undefined) return
    const ok = await onAction({ kind: 'forget-project', slug })
    say(ok ? t('toast.forgotten') : t('toast.failed'), ok ? 'success' : 'danger')
  }, [forgetProject, onAction, say, t])

  const documents = snapshot?.documents ?? {}
  const projectView = projectDoc === undefined ? undefined : documents[projectDoc]
  /** Save the open project document through the revision-checked host route. */
  const saveProject = React.useCallback(async (): Promise<void> => {
    const path = projectDoc
    if (path === undefined) return
    const ok = await onSaveDocument(path, projectDraft, projectView?.revision ?? '')
    say(ok ? t('toast.saved') : t('toast.failed'), ok ? 'success' : 'danger')
    if (ok) setProjectDoc(undefined)
  }, [projectDoc, projectView, onSaveDocument, projectDraft, say, t])

  const doPin = React.useCallback(
    async (topic: string, id: string, pinned: boolean): Promise<void> => {
      const ok = await onAction({ kind: 'pin-entry', topic, id, pinned })
      if (!ok) say(t('toast.failed'), 'danger')
    },
    [onAction, say, t],
  )

  /** Merge a picked markdown file into the long-term memory document. */
  const onFilePicked = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
      const file = event.currentTarget.files?.[0]
      event.currentTarget.value = ''
      if (file === undefined) return
      let picked = ''
      try {
        picked = await file.text()
      } catch {
        say(t('toast.failed'), 'danger')
        return
      }
      if (picked.trim() === '') {
        say(t('toast.failed'), 'danger')
        return
      }
      // Merge under a date heading so an import is traceable in the file the
      // user later reads, rather than a silent concatenation.
      const stamp = new Date().toISOString().slice(0, 10)
      const current = index?.text ?? ''
      const merged = `${current.trimEnd()}\n\n## 导入 ${stamp} · ${file.name}\n\n${picked.trim()}\n`
      const ok = await onSaveDocument('memory/index.md', merged, index?.revision ?? '')
      say(ok ? t('toast.imported') : t('toast.failed'), ok ? 'success' : 'danger')
    },
    [index, onSaveDocument, say, t],
  )

  /** Save the 管理记忆 document through the revision-checked host route. */
  const saveIndex = React.useCallback(async (): Promise<void> => {
    const ok = await onSaveDocument('memory/index.md', indexDraft, index?.revision ?? '')
    say(ok ? t('toast.saved') : t('toast.failed'), ok ? 'success' : 'danger')
    if (ok) setIndexEditing(false)
  }, [index, indexDraft, onSaveDocument, say, t])

  const cancelIndex = React.useCallback((): void => {
    setIndexDraft(index?.text ?? '')
    setIndexEditing(false)
  }, [index])

  const copyRoot = React.useCallback(async (): Promise<void> => {
    const root = snapshot?.root ?? ''
    try {
      await navigator.clipboard.writeText(root)
      say(t('toast.pathCopied'), 'success')
    } catch {
      say(root === '' ? t('toast.failed') : root)
    }
  }, [say, snapshot, t])

  const openPrivacy = React.useCallback((): void => {
    // No shell bridge is reachable from the page, so the honest move is to show
    // the rule that actually governs this data rather than a dead link.
    say(`${t('memory.footerLead')}${t('memory.privacyPolicy')}${t('memory.footerTail')}`)
  }, [say, t])

  return (
    <div className={bare ? css.section : css.content}>
      {drafts.length > 0 && (
        <Banner
          text={t('draft.banner', { count: String(drafts.length) })}
          action={
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void openDraft(drafts[0].name)}>
              {t('draft.view')}
            </Button>
          }
        />
      )}

      {/*
        待你确认 (§5.3): a conflict or a stale 高 entry that a pass could not
        resolve on its own. It is deliberately NOT a banner: a banner is about
        something new, and these stay until the user answers them.
      */}
      {questions.length > 0 && (
        <Card title={t('memory.questions')} description={t('memory.questionsHint')}>
          <div className={cx(css.entries)}>
            {questions.map((question, index) => (
              <div className={css.entry} key={`${index}-${question}`}>
                <div className={css.entryBody}>
                  <div className={css.entryText}>{question}</div>
                </div>
                <div className={css.entryActions}>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void dismissQuestion(index)}>
                    {t('action.dismiss')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/*
        `heading` is false in the Settings drop: the shell supplies its own nav
        row there and the reference draws no page heading above the cards. The
        first-level panel keeps it, because that drop has no nav label of ours.
      */}
      {heading && (
        <div>
          <div className={css.title}>{t('memory.title')}</div>
          <div className={css.subtitle}>
            {t('memory.subtitle')} · {t('memory.last')}：
            {snapshot?.consolidation.lastAt ?? t('memory.never')} · {t('memory.next')}：
            {scheduleLine(t, snapshot)}
            {snapshot !== undefined && snapshot.sessions.pending > 0
              ? ` · ${t('memory.pending', { count: String(snapshot.sessions.pending) })}`
              : ''}
          </div>
        </div>
      )}

      <Card>
        <Row>
          <div className={css.cardText}>
            <div className={css.cardTitle}>{t('card.conversationMemory.title')}</div>
            <div className={css.cardDesc}>{t('card.conversationMemory.desc')}</div>
          </div>
          <Switch
            label={t('card.conversationMemory.title')}
            checked={preferences?.conversationMemory ?? true}
            disabled={busy || loading}
            onChange={next => patchPreference('conversationMemory', next)}
          />
        </Row>
        <Row>
          <div className={css.cardText}>
            <div className={css.cardTitle}>{t('card.localMemorySkills.title')}</div>
            <div className={css.cardDesc}>{t('card.localMemorySkills.desc')}</div>
          </div>
          <Switch
            label={t('card.localMemorySkills.title')}
            checked={preferences?.localMemorySkills ?? true}
            disabled={busy || loading}
            onChange={next => patchPreference('localMemorySkills', next)}
          />
        </Row>
      </Card>

      {/*
        The 管理记忆 card carries both the document and the controls that act on
        it: the reference screenshot draws 重置 · 编辑 · 导入 on the header and the
        rendered index right below, so the index is NOT a second card here (the
        个性化 page is where 长期记忆 stands alone).
      */}
      <Card
        title={t('card.manage.title')}
        description={t('card.manage.desc')}
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              className={css.danger}
              disabled={busy}
              onClick={() => setResetOpen(true)}
            >
              {t('action.reset')}
            </Button>
            {indexEditing ? (
              <>
                <Button size="sm" variant="primary" disabled={busy} onClick={() => void saveIndex()}>
                  {t('action.save')}
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={cancelIndex}>
                  {t('action.cancel')}
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setIndexDraft(index?.text ?? '')
                  setIndexEditing(true)
                }}
              >
                {t('action.edit')}
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
              {t('action.import')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || history.length === 0}
              onClick={() => void openJournal(journalDate === '' ? history[0] ?? '' : journalDate)}
            >
              {t('action.history')}
            </Button>
          </>
        }
      >
        <input
          ref={fileRef}
          className={css.hidden}
          type="file"
          accept=".md,.markdown,text/markdown,text/plain"
          aria-label={t('action.import')}
          onChange={event => void onFilePicked(event)}
        />
        <DocumentBody
          t={t}
          value={index?.text ?? ''}
          draft={indexDraft}
          onDraft={setIndexDraft}
          editing={indexEditing}
          loading={loading}
          renderPreview
          tall
          ariaLabel={t('card.manage.title')}
          bodyTitle={t('card.longTerm.title')}
          onKeyDown={event => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
              event.preventDefault()
              void saveIndex()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              cancelIndex()
            }
          }}
        />
        {/* The reference card ends at its body; the panel adds the root path. */}
        {!bare && <div className={css.note}>{snapshot?.root ?? ''}</div>}
      </Card>

      {/*
        整理时机, 已记住的条目 and 最近的会话沉淀 are ours: the reference's page
        ends at 管理记忆 followed by the privacy line, so the Settings drop
        (`bare`) stops there to match it. The first-level panel keeps them —
        that drop is where the schedule is configured, where the search box
        highlights entries (§2.2 deviation 3) and where the collected sessions
        are reviewed.
      */}
      {!bare && (
        <>
        {/*
          The model picker sits above the schedule card: it is the thing you
          configure once, and the schedule card is what you trigger. Both live
          in the first-level panel only, because the bare (onboarding) panel has
          nowhere to show a catalogue dropdown.
        */}
        <ModelPickerCard
          t={t}
          snapshot={snapshot}
          busy={busy}
          onPatch={onPatch}
          onCatalog={onCatalog}
        />
        <Card title={t('memory.schedule')}>
          <Row>
            <div className={css.cardText}>
              <div className={css.cardTitle}>{t('memory.last')}</div>
              <div className={css.cardDesc}>
                {snapshot?.consolidation.lastAt ?? t('memory.never')} · {t('memory.next')}：
                {scheduleLine(t, snapshot)}
              </div>
            </div>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void consolidate()}>
              {t('action.consolidate')}
            </Button>
          </Row>
          <Row>
            <div className={css.cardText}>
              <div className={css.cardTitle}>{t('card.consolidateQuiet.title')}</div>
              <div className={css.cardDesc}>{t('card.consolidateQuiet.desc')}</div>
            </div>
            <Switch
              label={t('card.consolidateQuiet.title')}
              checked={preferences?.consolidateQuiet ?? true}
              disabled={busy || loading}
              onChange={next => patchPreference('consolidateQuiet', next)}
            />
          </Row>
          {/*
            The host knows which stage actually ran; the locale string is only
            the fallback for a snapshot that has not loaded yet.
          */}
          <div className={css.note}>{snapshot?.consolidation.modelNote ?? t('memory.modelStage')}</div>
        </Card>
        </>
      )}

      {/*
        整理历史 (§6.3): every pass backs up what it rewrites, so any pass can be
        undone. The list is dates only — a day's log is fetched when the user
        asks for it, because most of the time nobody does.
      */}
      {!bare && (
        <Card title={t('memory.history')} description={t('memory.historyHint')}>
          {history.length === 0 ? (
            <div className={css.proseEmpty}>{t('memory.historyEmpty')}</div>
          ) : (
            <>
              <div className={cx(css.entries)}>
                {history.map(date => (
                  <div className={css.entry} key={date}>
                    <div className={css.entryBody}>
                      <div className={css.entryText}>{date}</div>
                    </div>
                    <div className={css.entryActions}>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void openJournal(date)}
                      >
                        {journalDate === date ? t('memory.rollbackOpen') : t('action.history')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className={css.danger}
                        disabled={busy}
                        onClick={() => setRollbackDate(date)}
                      >
                        {t('memory.rollback')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              {journal !== undefined && journalDate !== '' && (
                <div className={css.prose}>
                  <div className={css.note}>
                    {journalDate} · {t('memory.historyBackups', { count: String(journal.backups.length) })}
                  </div>
                  {journal.backups.length > 0 && (
                    <div className={css.note}>{journal.backups.join(' · ')}</div>
                  )}
                  <div className={css.journalBody}>{journal.text.trim() === '' ? t('empty') : journal.text}</div>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {/*
        项目记忆 (P6 §5): one card per project file, after the history card.
        The editor reuses the same DocumentBody as the index card with the
        project file's own revision token.
      */}
      {!bare && (
        <ProjectsCard
          t={t}
          projects={snapshot?.projects ?? []}
          busy={busy}
          onEdit={path => {
            setProjectDoc(path)
            setProjectDraft(documents[path]?.text ?? '')
          }}
          onForget={slug => setForgetProject(slug)}
        />
      )}
      {projectDoc !== undefined && (
        <Card title={projectDoc} description={t('memory.projectsHint')}>
          <DocumentBody
            t={t}
            value={projectView?.text ?? ''}
            draft={projectDraft}
            onDraft={setProjectDraft}
            editing
            loading={loading}
            renderPreview
            tall
            ariaLabel={projectDoc}
            bodyTitle={projectDoc}
            onKeyDown={event => {
              if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                event.preventDefault()
                void saveProject()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                setProjectDoc(undefined)
              }
            }}
          />
          <div className={css.entryActions}>
            <Button size="sm" variant="primary" disabled={busy} onClick={() => void saveProject()}>
              {t('action.save')}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setProjectDoc(undefined)}>
              {t('action.cancel')}
            </Button>
          </div>
        </Card>
      )}

      <DraftCards t={t} drafts={drafts} busy={busy} onView={name => void openDraft(name)} />

      {draftOpen && (
        <DraftDialog
          draft={draft}
          t={t}
          loading={draftLoading}
          busy={busy}
          onApprove={text => void approveDraft(text)}
          onIgnore={() => void ignoreDraft()}
          onClose={closeDraft}
        />
      )}

      {!bare && (
        <>
          <div>
            <div className={css.cardTitle}>{t('memory.entries')}</div>
            <div className={css.subtitle}>
              {needle === '' ? '' : `${t('memory.hits', { count: String(hitCount) })} · `}
              {t('memory.entriesHint')}
            </div>
          </div>

          {matched.length === 0 ? (
            <div className={css.proseEmpty}>{t('memory.entriesEmpty')}</div>
          ) : (
            matched.map(group => (
              <Card key={group.key} title={topicTitle(t, group.key)}>
                <EntryList
                  entries={group.items}
                  topicTitle={topicTitle(t, group.key)}
                  t={t}
                  query={query}
                  onForget={id => setForget({ topic: group.key, id })}
                  onPin={(id, pinned) => void doPin(group.key, id, pinned)}
                />
              </Card>
            ))
          )}

          <Card title={t('memory.sessions')}>
            {sessions.length === 0 ? (
              <div className={css.proseEmpty}>{t('memory.sessionsEmpty')}</div>
            ) : (
              <div className={cx(css.entries)}>
                {sessions.map(item => (
                  <div className={css.entry} key={item.path}>
                    <div className={css.entryBody}>
                      <div className={css.entryText}>{item.title === '' ? item.id : item.title}</div>
                      <div className={css.entryMeta}>
                        <span>{item.date}</span>
                        <span>{t('memory.sessionEvents', { count: String(item.events) })}</span>
                        <span>
                          {item.consolidated ? t('memory.sessionDone') : t('memory.sessionPending')}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {/*
        危险区 (P8). It is a SEPARATE card at the very bottom rather than another
        button in 管理记忆: that card's 重置 archives, and putting a permanent
        delete next to it would make the two look like the same kind of thing.
        Placed apart, with the irreversibility spelled out, the difference is
        visible before the click rather than after it.
      */}
      <Card
        title={t('wipe.card.title')}
        description={t('wipe.card.desc')}
        actions={
          <Button
            size="sm"
            variant="outline"
            className={css.danger}
            disabled={busy || loading}
            onClick={() => setWipeOpen(true)}
          >
            {t('wipe.button')}
          </Button>
        }
      />

      {/*
        The Settings drop reproduces the reference footer exactly: one centred
        muted line with 隐私政策 as an inline link. The panel adds the plan's
        §2.4 actions (复制路径 / 查看隐私规则) because that drop is ours to shape.
      */}
      {bare ? (
        <div className={css.footerCenter}>
          {t('memory.footerLead')}
          <button className={css.footerLink} onClick={openPrivacy}>
            {t('memory.privacyPolicy')}
          </button>
          {t('memory.footerTail')}
        </div>
      ) : (
        <div className={css.footer}>
          <span>
            {t('memory.footerLead')}
            <button className={css.footerLink} onClick={openPrivacy}>
              {t('memory.privacyPolicy')}
            </button>
            {t('memory.footerTail')}
          </span>
          <div className={css.footerLinks}>
            <Button size="sm" variant="outline" onClick={() => void copyRoot()}>
              {t('action.copyPath')}
            </Button>
          </div>
        </div>
      )}

      <Confirm
        open={resetOpen}
        title={t('confirm.reset.title')}
        body={t('confirm.reset.body')}
        confirmLabel={t('confirm.reset.ok')}
        cancelLabel={t('action.cancel')}
        onConfirm={() => void doReset()}
        onCancel={() => setResetOpen(false)}
      />
      <Confirm
        open={forget !== undefined}
        title={t('confirm.forget.title')}
        body={t('confirm.forget.body')}
        confirmLabel={t('confirm.forget.ok')}
        cancelLabel={t('action.cancel')}
        onConfirm={() => void doForget()}
        onCancel={() => setForget(undefined)}
      />
      <Confirm
        open={forgetProject !== undefined}
        title={t('confirm.projectForget.title')}
        body={`${t('confirm.projectForget.body')}（${forgetProject ?? ''}）`}
        confirmLabel={t('confirm.projectForget.ok')}
        cancelLabel={t('action.cancel')}
        onConfirm={() => void doForgetProject()}
        onCancel={() => setForgetProject(undefined)}
      />
      <Confirm
        open={rollbackDate !== undefined}
        title={t('confirm.rollback.title')}
        body={`${t('confirm.rollback.body')}（${rollbackDate ?? ''}）`}
        confirmLabel={t('confirm.rollback.ok')}
        cancelLabel={t('action.cancel')}
        onConfirm={() => void doRollback()}
        onCancel={() => setRollbackDate(undefined)}
      />
      {/* The root path is spelled out: the typed phrase is the fence, and the
          path is what the user is agreeing to remove. */}
      <TypedConfirm
        open={wipeOpen}
        title={t('confirm.wipe.title')}
        body={t('confirm.wipe.body')}
        {...(snapshot?.root === undefined ? {} : { detail: snapshot.root })}
        phrase={WIPE_CONFIRMATION}
        hint={t('confirm.wipe.hint')}
        confirmLabel={t('confirm.wipe.ok')}
        cancelLabel={t('action.cancel')}
        busy={busy}
        onConfirm={() => void doWipe()}
        onCancel={() => setWipeOpen(false)}
      />

      <ToastHost
        token={toast.token}
        text={toast.text}
        {...(toast.tone === undefined ? {} : { tone: toast.tone })}
        onDone={() => setToast(current => ({ ...current, text: '' }))}
      />
    </div>
  )
}
