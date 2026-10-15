/**
 * The two native settings pages (memory-plan §2.1 landing B).
 *
 * The Settings dialog declares `settings.section` as a plain list seat, so a
 * page registered here gets the shell's own nav row, its scrolling options
 * column and its `close` owner prop — which is why these pages render cards
 * only, with no nav column, no search box and no scroller of their own. They
 * reuse the exact components the first-level panel uses, so a change to a card
 * lands in both drops at once.
 *
 * The nav glyph is the shell's, not ours: a `settings.section` registration
 * cannot pass an icon, and the shell's `navIcon(id)` maps only its own built-in
 * ids, falling back to the settings gear for anything else. That is the ~60%
 * fidelity the plan accepted for this landing.
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
} from './cards.tsx'
import { PersonalizePage } from './personalize.tsx'
import { t } from './t.ts'
import type { MemoryFace } from './service.ts'
import { TOPICS, type DraftView, type MemorySnapshot } from '../protocol.ts'
import { panelCss as css } from './styles.ts'

/**
 * Props every settings page receives: our injected face plus whatever the shell
 * merges in on top (it always supplies `close` as an owner prop).
 */
export interface SettingsSectionProps {
  face: MemoryFace
  /** Supplied by the shell as an owner prop; unused here but part of the seat. */
  close?: () => void
}

/** `setting.section` id for 个性化; must stay stable across releases. */
export const PERSONALIZE_SECTION_ID = 'workbuddy-personalize'
/** `setting.section` id for 记忆与进化. */
export const MEMORY_SECTION_ID = 'workbuddy-memory'

/**
 * 个性化 as a native settings page.
 *
 * The panel's search box had no seat here, so the page passes an empty query and
 * shows every card, exactly as the Settings dialog's other sections do.
 */
export function PersonalizeSettingsSection(props: SettingsSectionProps): React.ReactElement {
  const { face } = props
  const view = face.useView()
  return (
    <div className={css.section}>
      <div className={css.title}>{t('personalize.title')}</div>
      <div className={css.subtitle}>{t('personalize.subtitle')}</div>
      <PersonalizePage
        t={t}
        snapshot={view.snapshot}
        loading={view.loading}
        busy={view.busy}
        query=""
        onPatch={face.onPatch}
        onSaveDocument={face.onSaveDocument}
      />
    </div>
  )
}

/** 记忆与进化 as a native settings page: the switches, the management card, the body. */
export function MemorySettingsSection(props: SettingsSectionProps): React.ReactElement {
  const { face } = props
  const view = face.useView()
  const { snapshot, loading, busy } = view
  const { onPatch, onSaveDocument, onAction } = face
  const [toast, setToast] = React.useState<{ token: number; text: string; tone?: 'success' | 'danger' }>({
    token: 0,
    text: '',
  })
  const [resetOpen, setResetOpen] = React.useState(false)
  const [indexEditing, setIndexEditing] = React.useState(false)
  const [preview, setPreview] = React.useState(true)

  const say = React.useCallback((text: string, tone?: 'success' | 'danger'): void => {
    setToast(current => ({ token: current.token + 1, text, ...(tone === undefined ? {} : { tone }) }))
  }, [])

  const preferences = snapshot?.preferences
  const index = snapshot?.index
  const drafts: DraftView[] = snapshot?.drafts ?? []

  const consolidate = React.useCallback(async (): Promise<void> => {
    const ok = await onAction({ kind: 'consolidate' })
    say(ok ? t('toast.consolidated') : t('toast.failed'), ok ? 'success' : 'danger')
  }, [onAction, say, t])

  const doReset = React.useCallback(async (): Promise<void> => {
    setResetOpen(false)
    const ok = await onAction({ kind: 'reset-document', path: 'memory/index.md' })
    say(ok ? t('toast.reset') : t('toast.failed'), ok ? 'success' : 'danger')
  }, [onAction, say, t])

  const matched = React.useMemo(() => {
    const groups: Array<{ key: string; items: MemorySnapshot['entries'][string] }> = []
    for (const topic of TOPICS) {
      const items = snapshot?.entries[topic.key] ?? []
      if (items.length > 0) groups.push({ key: topic.key, items })
    }
    return groups
  }, [snapshot])

  return (
    <div className={css.section}>
      {drafts.length > 0 && <Banner text={t('draft.banner', { count: String(drafts.length) })} />}

      <div className={css.title}>{t('memory.title')}</div>
      <div className={css.subtitle}>
        {t('memory.subtitle')} · {t('memory.last')}：{snapshot?.consolidation.lastAt ?? t('memory.never')}
      </div>

      <Card
        title={t('memory.card.toggles')}
        actions={
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void consolidate()}>
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
            onChange={next => onPatch({ conversationMemory: next })}
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
            onChange={next => onPatch({ localMemorySkills: next })}
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
          </>
        }
      >
        <div className={css.note}>{snapshot?.root ?? ''}</div>
      </Card>

      {drafts.map(draft => (
        <Card
          key={draft.name}
          title={draft.title}
          description={`${t('draft.source')} · ${t('draft.repeats', { count: String(draft.repeats) })}`}
          actions={
            <>
              <Button
                size="sm"
                variant="primary"
                disabled={busy}
                onClick={() => {
                  void onAction({ kind: 'approve-draft', name: draft.name }).then(ok =>
                    say(ok ? t('toast.approved') : t('toast.failed'), ok ? 'success' : 'danger'),
                  )
                }}
              >
                {t('action.approve')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  void onAction({ kind: 'discard-draft', name: draft.name }).then(ok =>
                    say(ok ? t('toast.discarded') : t('toast.failed'), ok ? 'success' : 'danger'),
                  )
                }}
              >
                {t('action.discard')}
              </Button>
            </>
          }
        >
          <div className={css.note}>{draft.path}</div>
        </Card>
      ))}

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

      {matched.map(group => (
        <Card key={group.key} title={t(`topic.${group.key}`)}>
          <EntryList
            entries={group.items}
            topicTitle={t(`topic.${group.key}`)}
            t={t}
            onForget={id => {
              void onAction({ kind: 'forget-entry', topic: group.key, id }).then(ok =>
                say(ok ? t('toast.forgotten') : t('toast.failed'), ok ? 'success' : 'danger'),
              )
            }}
            onPin={(id, pinned) => {
              void onAction({ kind: 'pin-entry', topic: group.key, id, pinned })
            }}
          />
        </Card>
      ))}

      <div className={css.footer}>
        <span>{t('memory.footer')}</span>
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

      <ToastHost
        token={toast.token}
        text={toast.text}
        {...(toast.tone === undefined ? {} : { tone: toast.tone })}
        onDone={() => setToast(current => ({ ...current, text: '' }))}
      />
    </div>
  )
}

/**
 * Register both native settings pages.
 *
 * `settings.section` is a plain list seat declared by the Settings dialog, so a
 * registration here only supplies the nav row metadata and the component; the
 * shell owns the icon, the highlight and the scrolling. `order` ascending puts
 * 个性化 before 记忆与进化 (the shell's own General section is 0, Plugins 15).
 *
 * No `locale` namespace is declared: doing so would make the slots kit throw
 * `SlotAssemblyError` when no locale face is installed for this entry, and the
 * module-level translator already follows the active language.
 */
export function registerSettingsSections(
  ctx: { slots: unknown },
  face: MemoryFace,
): () => void {
  const slots = ctx.slots as {
    inject(key: string, callback: () => () => void): () => void
    register(options: Record<string, unknown>, component: unknown): () => void
  }
  const disposers: Array<() => void> = []

  const register = (id: string, order: number, label: string, component: unknown): void => {
    disposers.push(
      slots.inject('settings.section', () => {
        const off = slots.register(
          { name: 'settings.section', id, order, label: () => t(label), inject: () => ({ face }) },
          component,
        )
        // `register` may hand back no disposer on a host that models the seat
        // differently; the inject callback still has to return one.
        return typeof off === 'function' ? (off as () => void) : () => {}
      }),
    )
  }

  register(PERSONALIZE_SECTION_ID, 30, 'nav.personalize', PersonalizeSettingsSection)
  register(MEMORY_SECTION_ID, 31, 'nav.memory', MemorySettingsSection)

  return () => {
    for (const dispose of disposers.splice(0)) dispose()
  }
}
