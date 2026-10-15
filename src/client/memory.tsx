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
import { Button, IconEditOutlineMedium, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  Banner,
  Card,
  Confirm,
  EditableCard,
  EntryList,
  Row,
  ToastHost,
  type Translate,
} from './cards.tsx'
import { CONSOLIDATE_MODES, TOPICS, type DraftView, type EntryView, type MemorySnapshot, type SessionNoteView } from '../protocol.ts'
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
}: MemoryPageProps): React.ReactElement {
  const [toast, setToast] = React.useState<{ token: number; text: string; tone?: 'success' | 'danger' }>({
    token: 0,
    text: '',
  })
  const [resetOpen, setResetOpen] = React.useState(false)
  const [forget, setForget] = React.useState<{ topic: string; id: string } | undefined>(undefined)
  const [indexEditing, setIndexEditing] = React.useState(false)
  const [preview, setPreview] = React.useState(true)
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

  /** Flip one preference through the host; failures surface as a toast. */
  const patchPreference = React.useCallback(
    (key: string, value: unknown): void => {
      onPatch({ [key]: value })
    },
    [onPatch],
  )

  const consolidate = React.useCallback(async (): Promise<void> => {
    const ok = await onAction({ kind: 'consolidate' })
    say(ok ? t('toast.consolidated') : t('toast.failed'), ok ? 'success' : 'danger')
  }, [onAction, say, t])

  const doReset = React.useCallback(async (): Promise<void> => {
    setResetOpen(false)
    const ok = await onAction({ kind: 'reset-document', path: 'memory/index.md' })
    say(ok ? t('toast.reset') : t('toast.failed'), ok ? 'success' : 'danger')
  }, [onAction, say, t])

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
    say(t('memory.footer'))
  }, [say, t])

  return (
    <div className={css.content}>
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

      <Card
        title={t('memory.card.toggles')}
        actions={
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void consolidate()}
          >
            {t('action.consolidate')}
          </Button>
        }
      >
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
        <div className={css.note}>{t('memory.modelStage')}</div>
      </Card>

      <Card
        title={t('card.manage.title')}
        description={t('card.manage.desc')}
        actions={
          <>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setResetOpen(true)}>
              {t('action.reset')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              icon={<IconEditOutlineMedium size={14} />}
              disabled={busy}
              onClick={() => {
                setPreview(false)
                setIndexEditing(true)
              }}
            >
              {t('action.edit')}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
              {t('action.import')}
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
        <div className={css.note}>{snapshot?.root ?? ''}</div>
      </Card>

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

      <EditableCard
        title={t('card.longTerm.title')}
        description={t('card.longTerm.desc')}
        t={t}
        value={index?.text ?? ''}
        loading={loading}
        renderPreview={preview}
        tall
        editing={indexEditing}
        onEditingChange={setIndexEditing}
        extraAction={
          <Button
            size="sm"
            variant="ghost"
            aria-pressed={preview}
            disabled={indexEditing}
            onClick={() => setPreview(current => !current)}
          >
            {preview ? t('action.preview') : t('action.raw')}
          </Button>
        }
        onSave={async text => {
          const ok = await onSaveDocument('memory/index.md', text, index?.revision ?? '')
          say(ok ? t('toast.saved') : t('toast.failed'), ok ? 'success' : 'danger')
          return ok
        }}
      />

      <div>
        <div className={css.cardTitle}>{t('memory.entries')}</div>
        <div className={css.subtitle}>
          {needle === '' ? '' : `${t('memory.hits', { count: String(hitCount) })} · `}
          {t('memory.modelStage')}
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
                    <span>{item.consolidated ? t('memory.sessionDone') : t('memory.sessionPending')}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className={css.footer}>
        <span>{t('memory.footer')}</span>
        <div className={css.footerLinks}>
          <Button size="sm" variant="outline" onClick={() => void copyRoot()}>
            {t('action.copyPath')}
          </Button>
          <Button size="sm" variant="ghost" onClick={openPrivacy}>
            {t('action.privacy')}
          </Button>
        </div>
      </div>

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

      <ToastHost
        token={toast.token}
        text={toast.text}
        {...(toast.tone === undefined ? {} : { tone: toast.tone })}
        onDone={() => setToast(current => ({ ...current, text: '' }))}
      />
    </div>
  )
}
