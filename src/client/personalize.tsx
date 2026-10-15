/**
 * The 个性化 page.
 *
 * Rendered by BOTH drops with the same components: inside the first-level panel
 * (with its own left nav around it) and inside the native settings page (where
 * the shell supplies the nav). The page therefore takes the search query as a
 * prop instead of owning a search box, so the panel's box can filter it while
 * the settings page shows everything.
 *
 * Every value maps onto `preferences.md` or one of the two documents — the plan's
 * §2.3 card-to-storage table is the specification this file implements.
 */

import * as React from 'react'
import { Button, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import { REPLY_STYLES } from '../protocol'
import type { MemorySnapshot } from '../protocol'
import { Card, ChoiceMenu, DocumentBody, EditableCard, Row, TextField } from './cards'
import type { Translate } from './cards'
import { panelCss as css } from './styles'

export interface PersonalizePageProps {
  t: Translate
  snapshot: MemorySnapshot | undefined
  loading: boolean
  busy: boolean
  /** Live search text; empty means "show every card". */
  query: string
  /** Persist one preference field. */
  onPatch: (patch: Record<string, unknown>) => void
  /** Persist one document (profile.md / instructions.md / memory/index.md). */
  onSaveDocument: (path: string, text: string, revision: string) => Promise<boolean>
}

/** Case-insensitive match against a card's title and description. */
function matches(query: string, title: string, description: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true
  return `${title} ${description}`.toLowerCase().includes(needle)
}

export function PersonalizePage({
  t,
  snapshot,
  loading,
  busy,
  query,
  onPatch,
  onSaveDocument,
}: PersonalizePageProps): React.ReactElement {
  const preferences = snapshot?.preferences
  const documents = snapshot?.documents ?? {}
  const index = snapshot?.index

  /** Save helper bound to one relative path. */
  const saveAt = React.useCallback(
    (path: string) => async (text: string): Promise<boolean> => {
      const current = documents[path]
      return await onSaveDocument(path, text, current?.revision ?? '')
    },
    [documents, onSaveDocument],
  )

  const profile = documents['profile.md']
  const instructions = documents['instructions.md']

  const cards: React.ReactNode[] = []

  if (matches(query, t('card.userName.title'), '') ||
      matches(query, t('card.agentName.title'), '')) {
    // Both identity rows carry no description: the reference draws them as a
    // bare label + input, so no `cardDesc` line is rendered at all (an empty
    // string would still leave a div with its own margins).
    cards.push(
      <Card key="identity">
        <Row>
          <div className={css.cardText}>
            <div className={css.cardTitle}>{t('card.userName.title')}</div>
          </div>
          <TextField
            ariaLabel={t('card.userName.title')}
            value={preferences?.userName ?? ''}
            disabled={busy || preferences === undefined}
            onCommit={next => onPatch({ userName: next })}
          />
        </Row>
        <Row>
          <div className={css.cardText}>
            <div className={css.cardTitle}>{t('card.agentName.title')}</div>
          </div>
          <TextField
            ariaLabel={t('card.agentName.title')}
            value={preferences?.agentName ?? ''}
            disabled={busy || preferences === undefined}
            onCommit={next => onPatch({ agentName: next })}
          />
        </Row>
      </Card>,
    )
  }

  if (matches(query, t('card.replyStyle.title'), t('card.replyStyle.desc')) ||
      matches(query, t('card.welcome.title'), t('card.welcome.desc')) ||
      matches(query, t('card.showFileChanges.title'), t('card.showFileChanges.desc'))) {
    cards.push(
      <Card key="behaviour">
        <Row>
          <div className={css.cardText}>
            <div className={css.cardTitle}>{t('card.replyStyle.title')}</div>
            <div className={css.cardDesc}>{t('card.replyStyle.desc')}</div>
          </div>
          <ChoiceMenu
            ariaLabel={t('card.replyStyle.title')}
            value={preferences?.replyStyle ?? REPLY_STYLES[0]}
            options={REPLY_STYLES}
            disabled={busy || preferences === undefined}
            onSelect={next => onPatch({ replyStyle: next })}
          />
        </Row>
        <Row>
          <div className={css.cardText}>
            <div className={css.cardTitle}>{t('card.welcome.title')}</div>
            <div className={css.cardDesc}>{t('card.welcome.desc')}</div>
          </div>
          <Switch
            label={t('card.welcome.title')}
            checked={preferences?.welcome ?? true}
            disabled={busy || preferences === undefined}
            onChange={next => onPatch({ welcome: next })}
          />
        </Row>
        <Row>
          <div className={css.cardText}>
            <div className={css.cardTitle}>{t('card.showFileChanges.title')}</div>
            <div className={css.cardDesc}>{t('card.showFileChanges.desc')}</div>
          </div>
          <Switch
            label={t('card.showFileChanges.title')}
            checked={preferences?.showFileChanges ?? false}
            disabled={busy || preferences === undefined}
            onChange={next => onPatch({ showFileChanges: next })}
          />
        </Row>
      </Card>,
    )
  }

  if (matches(query, t('card.instructions.title'), t('card.instructions.desc'))) {
    cards.push(
      <EditableCard
        key="instructions"
        t={t}
        title={t('card.instructions.title')}
        description={t('card.instructions.desc')}
        value={instructions?.text ?? ''}
        loading={loading}
        // The reference shows this card as an EMPTY box whose only text is the
        // placeholder, so the read-only view falls back to it too.
        placeholder={t('card.instructions.placeholder')}
        tall
        onSave={saveAt('instructions.md')}
      />,
    )
  }

  if (matches(query, t('card.persona.title'), t('card.persona.desc'))) {
    cards.push(
      <EditableCard
        key="persona"
        t={t}
        title={t('card.persona.title')}
        description={t('card.persona.desc')}
        value={profile?.text ?? ''}
        loading={loading}
        tall
        // The persona is prose the user wrote for a human reader, so the
        // read-only view renders it rather than showing raw markdown.
        renderPreview
        onSave={saveAt('profile.md')}
      />,
    )
  }

  if (matches(query, t('card.longTerm.title'), t('card.longTerm.desc'))) {
    cards.push(
      <LongTermCard
        key="long-term"
        t={t}
        loading={loading}
        value={index?.text ?? ''}
        onSave={text => onSaveDocument('memory/index.md', text, index?.revision ?? '')}
      />,
    )
  }

  if (cards.length === 0) {
    return <div className={css.loading}>{t('memory.noHits', { query })}</div>
  }

  return <>{cards}</>
}

/* ------------------------------------------------------------------ *
 * Long-term memory card
 * ------------------------------------------------------------------ */

/**
 * The long-term-memory card: rendered markdown by default, with an explicit
 * 预览 / 原文 toggle (memory-plan §2.5 gives this card the extra switch because
 * its body is machine-written, so the user needs to see the real `##` sections).
 */
export function LongTermCard({
  t,
  value,
  loading,
  onSave,
}: {
  t: Translate
  value: string
  loading: boolean
  onSave: (text: string) => Promise<boolean>
}): React.ReactElement {
  const [editing, setEditing] = React.useState(false)
  const [preview, setPreview] = React.useState(true)
  const [draft, setDraft] = React.useState(value)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  const save = React.useCallback(async (): Promise<void> => {
    setSaving(true)
    try {
      if (await onSave(draft)) setEditing(false)
    } finally {
      setSaving(false)
    }
  }, [draft, onSave])

  const cancel = React.useCallback((): void => {
    setDraft(value)
    setEditing(false)
  }, [value])

  return (
    <Card
      title={t('card.longTerm.title')}
      description={t('card.longTerm.desc')}
      actions={
        <>
          {editing ? (
            <>
              <Button size="sm" variant="primary" disabled={saving} onClick={() => void save()}>
                {t('action.save')}
              </Button>
              <Button size="sm" variant="outline" disabled={saving} onClick={cancel}>
                {t('action.cancel')}
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="ghost"
                aria-pressed={preview}
                onClick={() => setPreview(current => !current)}
              >
                {preview ? t('action.preview') : t('action.raw')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setPreview(false)
                  setEditing(true)
                }}
              >
                {t('action.edit')}
              </Button>
            </>
          )}
        </>
      }
    >
      {editing ? (
        <DocumentBody
          t={t}
          value={value}
          draft={draft}
          onDraft={setDraft}
          editing
          tall
          ariaLabel={t('card.longTerm.title')}
          onKeyDown={event => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
              event.preventDefault()
              void save()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              cancel()
            }
          }}
        />
      ) : (
        <DocumentBody
          t={t}
          value={value}
          draft={draft}
          onDraft={setDraft}
          editing={false}
          loading={loading}
          renderPreview={preview}
          tall
          ariaLabel={t('card.longTerm.title')}
          bodyTitle={t('card.longTerm.title')}
        />
      )}
    </Card>
  )
}
