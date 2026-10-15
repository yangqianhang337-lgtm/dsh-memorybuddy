/**
 * The card components shared by the first-level panel and the two native
 * settings pages.
 *
 * Both surfaces render these exact components, which is what keeps the two
 * drops consistent: a fix to the read-only/editable switch or to the save path
 * lands in both places at once instead of drifting apart.
 *
 * Every interactive control comes from `@deepseek-ai/dsh-client-ui-primitives`
 * so the visuals follow the shell's own theme tokens rather than a private
 * palette. Two gaps are filled locally because the kit has no primitive for
 * them: a `<textarea>` (no Textarea export) and a select-shaped control (no
 * Select export, so `Menu` is anchored to a Button).
 */

import * as React from 'react'
import {
  Button,
  IconCheckOutlineMedium,
  IconChevronDownOutlineMedium,
  IconCloseOutlineMedium,
  IconPinOutlineMedium,
  IconRefreshOutlineMedium,
  IconTrashOutlineMedium,
  Input,
  MarkdownText,
  Menu,
  Modal,
  Switch,
  Tag,
  Toast,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { panelCss as css, cx } from './styles'

/** Translator handed down through `inject()`. */
export type Translate = (key: string, params?: Record<string, string>) => string

/* ------------------------------------------------------------------ *
 * Card shell
 * ------------------------------------------------------------------ */

export interface CardProps {
  /**
   * Card heading, with an optional description under it.
   *
   * Omit both for a card whose rows are their own labels: the reference design
   * headings only the cards that own a document (给 WorkBuddy 的指令 / 人设设定 /
   * 长期记忆 / 管理记忆). A card of plain setting rows starts straight at the
   * first row, so repeating its first row's label as a heading would print the
   * same words twice.
   */
  title?: string
  description?: string
  /** Top-right controls (the 编辑 / 保存 / 取消 cluster). */
  actions?: React.ReactNode
  children?: React.ReactNode
}

/** One card. The panel and both settings pages share this frame. */
export function Card({ title, description, actions, children }: CardProps): React.ReactElement {
  const heading = (title !== undefined && title !== '') || actions !== undefined
  return (
    <section className={css.card}>
      {heading && (
        <div className={css.cardHead}>
          <div className={css.cardText}>
            {title !== undefined && title !== '' && <div className={css.cardTitle}>{title}</div>}
            {description !== undefined && description !== '' && (
              <div className={css.cardDesc}>{description}</div>
            )}
          </div>
          {actions !== undefined && <div className={css.cardActions}>{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

/** One label/control row inside a card (the settings-row geometry). */
export function Row({ children }: { children: React.ReactNode }): React.ReactElement {
  return <div className={css.row}>{children}</div>
}

/* ------------------------------------------------------------------ *
 * Editable document: read-only prose in, markdown out
 * ------------------------------------------------------------------ */

export interface EditableCardProps {
  title: string
  description?: string
  t: Translate
  /** The stored markdown. */
  value: string
  /** True while the host has not answered yet. */
  loading?: boolean
  /** Render the read-only view as prose instead of as raw markdown. */
  renderPreview?: boolean
  placeholder?: string
  tall?: boolean
  /** Called with the edited text; returns true when the save succeeded. */
  onSave: (text: string) => Promise<boolean>
  /** Extra control rendered next to 编辑 (the preview toggle). */
  extraAction?: React.ReactNode
  /**
   * Extra control rendered AFTER the 编辑 / 保存 group. The 管理记忆 card uses
   * both slots so its action row reads 重置 · 编辑 · 导入, which is the order the
   * reference screenshot draws and the order the plan's table lists.
   */
  extraActionEnd?: React.ReactNode
  /**
   * Controlled edit state. The memory page lifts this so its 管理记忆 card can
   * offer 编辑 for the same document; omitting both props leaves the card
   * self-managed, which is what the 个性化 page uses.
   */
  editing?: boolean
  onEditingChange?: (next: boolean) => void
}

/* ------------------------------------------------------------------ *
 * Document body: the editor / prose pane shared by every document card
 * ------------------------------------------------------------------ */

export interface DocumentBodyProps {
  t: Translate
  /** The stored text (used for the read-only view and as the empty check). */
  value: string
  /** The text currently in the editor. */
  draft: string
  onDraft: (next: string) => void
  editing: boolean
  loading?: boolean
  /** Render the read-only view as prose instead of as raw markdown. */
  renderPreview?: boolean
  placeholder?: string
  tall?: boolean
  /** Accessible name for the textarea (there is no visible label). */
  ariaLabel: string
  /**
   * The document's own `# …` heading, dropped from the prose view.
   *
   * `memory/index.md` opens with `# 长期记忆` and `instructions.md` with `# 指令`
   * because those files are also read as plain markdown; rendering that H1 inside
   * a card that already carries the same title prints the words twice. The
   * textarea keeps the line — editing the file means editing the whole file.
   */
  bodyTitle?: string
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void
}

/**
 * Drop the leading H1 when it only repeats the card title.
 *
 * The comparison is a substring test in either direction, so `# 长期记忆` is
 * dropped from a card titled 长期记忆 and `# 长期记忆（跨会话）` still matches,
 * while a heading the user wrote as content (`# 备注`) survives.
 */
export function stripLeadingTitle(text: string, bodyTitle: string | undefined): string {
  if (bodyTitle === undefined || bodyTitle === '') return text
  const lines = text.split('\n')
  let index = 0
  while (index < lines.length && lines[index].trim() === '') index += 1
  const first = lines[index]
  if (first === undefined || !first.startsWith('# ')) return text
  const heading = first.slice(2).trim()
  if (heading === '') return text
  if (!heading.includes(bodyTitle) && !bodyTitle.includes(heading)) return text
  return lines.slice(index + 1).join('\n')
}

/**
 * The pane inside a document card: a raw-markdown textarea while editing, a
 * rendered (or raw) read-only view otherwise.
 *
 * It is separate from `EditableCard` because the 管理记忆 card owns its own
 * action row (重置 · 编辑 · 导入) while showing the very same document body — two
 * renderings of one document must not drift (memory-plan §2.4).
 */
export function DocumentBody({
  t,
  value,
  draft,
  onDraft,
  editing,
  loading = false,
  renderPreview = false,
  placeholder,
  tall = false,
  ariaLabel,
  bodyTitle,
  onKeyDown,
}: DocumentBodyProps): React.ReactElement {
  if (editing) {
    return (
      <textarea
        className={cx(css.editor, tall && css.editorTall)}
        value={draft}
        placeholder={placeholder}
        spellCheck={false}
        onChange={event => onDraft(event.currentTarget.value)}
        {...(onKeyDown === undefined ? {} : { onKeyDown })}
        aria-label={ariaLabel}
      />
    )
  }
  return (
    <div className={css.prose}>
      {loading ? (
        <div className={css.loading}>{t('loading')}</div>
      ) : value.trim() === '' ? (
        // An empty document shows its placeholder when it has one: the reference
        // draws 「给 WorkBuddy 的指令」 as a box whose only text is the example.
        <div className={css.proseEmpty}>
          {placeholder === undefined || placeholder === '' ? t('empty') : placeholder}
        </div>
      ) : renderPreview ? (
        <MarkdownText text={stripLeadingTitle(value, bodyTitle)} />
      ) : (
        <pre className={css.draftBody}>{value}</pre>
      )}
    </div>
  )
}

/**
 * A card that flips between a rendered view and a raw-markdown editor.
 *
 * The draft text lives here rather than in the parent so a failed save keeps
 * the user's typing on screen: the card stays in edit mode until the parent
 * confirms the write landed.
 */
export function EditableCard({
  title,
  description,
  t,
  value,
  loading = false,
  renderPreview = false,
  placeholder,
  tall = false,
  onSave,
  extraAction,
  extraActionEnd,
  editing: editingProp,
  onEditingChange,
}: EditableCardProps): React.ReactElement {
  const [selfEditing, setSelfEditing] = React.useState(false)
  const editing = editingProp ?? selfEditing
  const [draft, setDraft] = React.useState(value)
  const [saving, setSaving] = React.useState(false)

  /** Keep the local (uncontrolled) copy in step with a lifted state owner. */
  const setEditing = React.useCallback(
    (next: boolean): void => {
      setSelfEditing(next)
      onEditingChange?.(next)
    },
    [onEditingChange],
  )

  // Adopt host-side changes only while not editing, so a background refresh
  // cannot overwrite what the user is in the middle of typing.
  React.useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  const save = React.useCallback(async (): Promise<void> => {
    if (saving) return
    setSaving(true)
    try {
      const ok = await onSave(draft)
      if (ok) setEditing(false)
    } finally {
      setSaving(false)
    }
  }, [draft, onSave, saving])

  const cancel = React.useCallback((): void => {
    setDraft(value)
    setEditing(false)
  }, [value])

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    // Ctrl/Cmd+S saves THIS card; Esc cancels it (memory-plan §2.5).
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      void save()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      cancel()
    }
  }

  return (
    <Card
      title={title}
      description={description}
      actions={
        <>
          {extraAction}
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
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              {t('action.edit')}
            </Button>
          )}
          {extraActionEnd}
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
          tall={tall}
          ariaLabel={title}
          bodyTitle={title}
          {...(placeholder === undefined ? {} : { placeholder })}
          onKeyDown={onKeyDown}
        />
      ) : (
        <DocumentBody
          t={t}
          value={value}
          draft={draft}
          onDraft={setDraft}
          editing={false}
          loading={loading}
          renderPreview={renderPreview}
          tall={tall}
          ariaLabel={title}
          bodyTitle={title}
          {...(placeholder === undefined ? {} : { placeholder })}
        />
      )}
    </Card>
  )
}

/* ------------------------------------------------------------------ *
 * Switch row
 * ------------------------------------------------------------------ */

export interface SwitchCardProps {
  title: string
  description?: string
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
}

/** One boolean setting, rendered as a full card. */
export function SwitchCard({
  title,
  description,
  label,
  checked,
  disabled = false,
  onChange,
}: SwitchCardProps): React.ReactElement {
  return (
    <Card title={title} description={description}>
      <Row>
        <span className={css.cardTitle}>{label}</span>
        <Switch checked={checked} label={label} disabled={disabled} onChange={onChange} />
      </Row>
    </Card>
  )
}

/* ------------------------------------------------------------------ *
 * Text field
 * ------------------------------------------------------------------ */

export interface TextFieldProps {
  value: string
  placeholder?: string
  disabled?: boolean
  ariaLabel: string
  onCommit: (next: string) => void
  icon?: React.ReactNode
}

/**
 * An `Input` that commits on blur or Enter rather than on every keystroke.
 *
 * Each keystroke would otherwise be a read-modify-write of `preferences.md` on
 * the host; committing on blur keeps a typed word to one write without making
 * the field feel laggy.
 */
export function TextField({
  value,
  placeholder,
  disabled = false,
  ariaLabel,
  onCommit,
  icon,
}: TextFieldProps): React.ReactElement {
  const [draft, setDraft] = React.useState(value)
  React.useEffect(() => {
    setDraft(value)
  }, [value])

  const commit = (): void => {
    if (draft === value) return
    onCommit(draft)
  }

  return (
    <Input
      icon={icon}
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={event => setDraft(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        }
        if (event.key === 'Escape') {
          setDraft(value)
          event.currentTarget.blur()
        }
      }}
    />
  )
}

/* ------------------------------------------------------------------ *
 * Select-shaped menu (no Select primitive exists)
 * ------------------------------------------------------------------ */

export interface ChoiceMenuProps {
  value: string
  options: readonly string[]
  disabled?: boolean
  ariaLabel: string
  onSelect: (next: string) => void
}

/**
 * A `Menu` anchored to a button, standing in for the missing Select.
 *
 * `Menu`'s `anchor` prop is the trigger ELEMENT, which the menu renders in
 * place inside its own root span — not a ref to an element rendered elsewhere.
 * Passing a ref would leave the menu with nothing to position against and
 * silently drop the trigger from the DOM.
 */
export function ChoiceMenu({
  value,
  options,
  disabled = false,
  ariaLabel,
  onSelect,
}: ChoiceMenuProps): React.ReactElement {
  const [open, setOpen] = React.useState(false)

  return (
    <Menu
      open={open}
      align="end"
      selectedId={value}
      items={options.map(option => ({ id: option, label: option }))}
      onSelect={next => {
        setOpen(false)
        if (next !== value) onSelect(next)
      }}
      onClose={() => setOpen(false)}
      anchor={
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-haspopup="menu"
          aria-expanded={open}
          icon={<IconChevronDownOutlineMedium size={14} />}
          onClick={() => setOpen(current => !current)}
        >
          {value}
        </Button>
      }
    />
  )
}

/* ------------------------------------------------------------------ *
 * Entry list (memory page)
 * ------------------------------------------------------------------ */

export interface EntryListProps {
  entries: Array<{
    id: string
    text: string
    confidence: string
    days: number
    last: string
    pinned: boolean
    conflict: boolean
  }>
  topicTitle: string
  t: Translate
  /** Highlighted substring from the search box. */
  query?: string
  onForget: (id: string) => void
  onPin: (id: string, pinned: boolean) => void
}

/** Render `text` with every occurrence of `query` wrapped for highlighting. */
function highlight(text: string, query: string | undefined): React.ReactNode {
  const needle = (query ?? '').trim()
  if (needle === '') return text
  const lower = text.toLowerCase()
  const target = needle.toLowerCase()
  const parts: React.ReactNode[] = []
  let index = 0
  let key = 0
  for (;;) {
    const hit = lower.indexOf(target, index)
    if (hit < 0) break
    if (hit > index) parts.push(text.slice(index, hit))
    parts.push(
      <mark className={css.mark} key={key++}>
        {text.slice(hit, hit + target.length)}
      </mark>,
    )
    index = hit + target.length
  }
  if (parts.length === 0) return text
  if (index < text.length) parts.push(text.slice(index))
  return parts
}

/** The memory entries of one topic, with per-entry actions. */
export function EntryList({
  entries,
  topicTitle,
  t,
  query,
  onForget,
  onPin,
}: EntryListProps): React.ReactElement {
  return (
    <div className={css.entries}>
      {entries.map(entry => (
        <div className={css.entry} key={entry.id}>
          <div className={css.entryBody}>
            <div className={css.entryText}>{highlight(entry.text, query)}</div>
            <div className={css.entryMeta}>
              <Tag tone="quiet">{topicTitle}</Tag>
              <Tag tone={entry.confidence === '高' ? 'success' : 'outline'}>{entry.confidence}</Tag>
              <span>
                {entry.days} 天 · {entry.last}
              </span>
              {entry.pinned && <Tag tone="info">pinned</Tag>}
              {entry.conflict && (
                <span className={css.conflict} title={t('conflict.title')}>
                  ⚠ 冲突
                </span>
              )}
            </div>
          </div>
          <div className={css.entryActions}>
            <Button
              size="sm"
              variant="ghost"
              aria-label={entry.pinned ? t('action.unpin') : t('action.pin')}
              title={entry.pinned ? t('action.unpin') : t('action.pin')}
              icon={<IconPinOutlineMedium size={14} />}
              onClick={() => onPin(entry.id, !entry.pinned)}
            />
            <Button
              size="sm"
              variant="ghost"
              aria-label={t('action.forget')}
              title={t('action.forget')}
              icon={<IconTrashOutlineMedium size={14} />}
              onClick={() => onForget(entry.id)}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Confirm + toast
 * ------------------------------------------------------------------ */

export interface ConfirmProps {
  open: boolean
  title: string
  body: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
}

/** A yes/no modal. `Modal` portals itself and traps focus. */
export function Confirm({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmProps): React.ReactElement {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      closeLabel={cancelLabel}
      footer={
        <>
          <Button variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant="primary" onClick={onConfirm} data-modal-autofocus="">
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className={css.cardDesc}>{body}</div>
    </Modal>
  )
}

export interface ConflictProps {
  open: boolean
  title: string
  body: string
  keepMine: string
  keepTheirs: string
  cancelLabel: string
  onMine: () => void
  onTheirs: () => void
  onCancel: () => void
}

/** The 409 chooser: neither side is discarded without the user's say-so. */
export function ConflictDialog({
  open,
  title,
  body,
  keepMine,
  keepTheirs,
  cancelLabel,
  onMine,
  onTheirs,
  onCancel,
}: ConflictProps): React.ReactElement {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      closeLabel={cancelLabel}
      footer={
        <>
          <Button variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant="outline" onClick={onTheirs}>
            {keepTheirs}
          </Button>
          <Button variant="primary" onClick={onMine} data-modal-autofocus="">
            {keepMine}
          </Button>
        </>
      }
    >
      <div className={css.cardDesc}>{body}</div>
    </Modal>
  )
}

export interface ToastHostProps {
  /** Bumped on every toast so the same text re-shows (Toast needs a new key). */
  token: number
  text: string
  tone?: 'success' | 'danger'
  onDone: () => void
}

/** Renders one transient toast; `token` is the React key that re-arms it. */
export function ToastHost({ token, text, tone, onDone }: ToastHostProps): React.ReactElement | null {
  if (text === '') return null
  return (
    <Toast
      key={token}
      text={text}
      {...(tone === undefined ? {} : { tone })}
      onDone={onDone}
    />
  )
}

/* ------------------------------------------------------------------ *
 * Banner
 * ------------------------------------------------------------------ */

export interface BannerProps {
  text: string
  action?: React.ReactNode
}

/** The pending-approval banner at the top of the memory page. */
export function Banner({ text, action }: BannerProps): React.ReactElement {
  return (
    <div className={css.banner} role="status">
      <span>{text}</span>
      {action}
    </div>
  )
}

/** Re-export the two icons the pages need, so callers import one module. */
export { IconCheckOutlineMedium, IconCloseOutlineMedium, IconRefreshOutlineMedium }
