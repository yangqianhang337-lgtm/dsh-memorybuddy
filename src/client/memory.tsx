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
  Confirm,
  DocumentBody,
  EntryList,
  Row,
  ToastHost,
  type Translate,
} from './cards.tsx'
import { CONSOLIDATE_MODES, TOPICS, type DraftView, type EntryView, type JournalView, type MemorySnapshot, type SessionNoteView } from '../protocol.ts'
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

/** The pending-draft cards (§6.2 step 3: approve or discard, one by one). */
function DraftCards({
  t,
  drafts,
  busy,
  onApprove,
  onDiscard,
}: {
  t: Translate
  drafts: DraftView[]
  busy: boolean
  onApprove: (name: string) => void
  onDiscard: (name: string) => void
}): React.ReactElement {
  return (
    <>
      {drafts.map(draft => (
        <Card
          key={draft.name}
          title={draft.title}
          description={`${t('draft.source')} · ${t('draft.repeats', { count: String(draft.repeats) })}`}
          actions={
            <>
              <Button size="sm" variant="primary" disabled={busy} onClick={() => onApprove(draft.name)}>
                {t('action.approve')}
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onDiscard(draft.name)}>
                {t('action.discard')}
              </Button>
            </>
          }
        >
          <div className={css.note}>{draft.path}</div>
        </Card>
      ))}
    </>
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
  heading = true,
  bare = false,
}: MemoryPageProps): React.ReactElement {
  const [toast, setToast] = React.useState<{ token: number; text: string; tone?: 'success' | 'danger' }>({
    token: 0,
    text: '',
  })
  const [resetOpen, setResetOpen] = React.useState(false)
  const [forget, setForget] = React.useState<{ topic: string; id: string } | undefined>(undefined)
  const [indexEditing, setIndexEditing] = React.useState(false)
  const [indexDraft, setIndexDraft] = React.useState('')
  const [rollbackDate, setRollbackDate] = React.useState<string | undefined>(undefined)
  const [journalDate, setJournalDate] = React.useState('')
  const [journal, setJournal] = React.useState<JournalView | undefined>(undefined)
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
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void consolidate()}>
              {t('action.consolidate')}
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

      <DraftCards
        t={t}
        drafts={drafts}
        busy={busy}
        onApprove={name => {
          void onAction({ kind: 'approve-draft', name }).then(ok =>
            say(ok ? t('toast.approved') : t('toast.failed'), ok ? 'success' : 'danger'),
          )
        }}
        onDiscard={name => {
          void onAction({ kind: 'discard-draft', name }).then(ok =>
            say(ok ? t('toast.discarded') : t('toast.failed'), ok ? 'success' : 'danger'),
          )
        }}
      />

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
        open={rollbackDate !== undefined}
        title={t('confirm.rollback.title')}
        body={`${t('confirm.rollback.body')}（${rollbackDate ?? ''}）`}
        confirmLabel={t('confirm.rollback.ok')}
        cancelLabel={t('action.cancel')}
        onConfirm={() => void doRollback()}
        onCancel={() => setRollbackDate(undefined)}
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
