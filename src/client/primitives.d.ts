/**
 * Local type surface for `@deepseek-ai/dsh-client-ui-primitives`.
 *
 * The real package lives only inside the DSH app bundle and is resolved at
 * runtime by the page's module loader — it is not installable from npm, so there
 * are no `.d.ts` files to import. This declaration mirrors the parts of the API
 * the browser half actually uses, taken from the shipped bundle, so the
 * components are type-checked instead of silently becoming `any`.
 *
 * Keep it in step with the primitives when a new one is used; anything missing
 * here shows up as a compile error rather than a runtime surprise.
 */

declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type * as React from 'react'

  /** Common shape of every icon component. */
  export interface IconProps {
    size?: number
    className?: string
    strokeWidth?: number
  }

  export type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'toolbar'
  export type ButtonSize = 'md' | 'sm'

  export const Button: React.ForwardRefExoticComponent<
    React.ButtonHTMLAttributes<HTMLButtonElement> & {
      variant?: ButtonVariant
      size?: ButtonSize
      icon?: React.ReactNode
    }
  >

  /** `className` lands on the wrapper span, not the input. */
  export const Input: React.ForwardRefExoticComponent<
    React.InputHTMLAttributes<HTMLInputElement> & { icon?: React.ReactNode }
  >

  export interface SwitchProps {
    checked: boolean
    /** Receives the NEXT boolean, not an event. */
    onChange: (next: boolean) => void
    /** aria-label only; the visible label is the caller's job. */
    label: string
    disabled?: boolean
    title?: string
    className?: string
  }
  export const Switch: React.FunctionComponent<SwitchProps>

  export interface MenuEntry {
    id: string
    label?: string
    type?: 'separator' | 'label'
    text?: string
    icon?: React.ReactNode
    disabled?: boolean
    danger?: boolean
    submenu?: MenuEntry[]
  }

  export interface MenuProps {
    open: boolean
    /** The trigger ELEMENT, rendered in place by the menu. */
    anchor: React.ReactElement
    items?: MenuEntry[]
    children?: React.ReactNode
    selectedId?: string
    selectedIds?: string[]
    /** Fires with the entry id and does NOT close the menu. */
    onSelect?: (id: string) => void
    onClose?: () => void
    align?: 'start' | 'end'
    side?: 'top' | 'bottom'
    portal?: boolean
    dense?: boolean
    compact?: boolean
    autoFocus?: boolean
    className?: string
    listClassName?: string
  }
  export const Menu: React.FunctionComponent<MenuProps>

  export interface ModalProps {
    open: boolean
    onClose: () => void
    title?: React.ReactNode
    closeLabel?: string
    description?: React.ReactNode
    children?: React.ReactNode
    footer?: React.ReactNode
    className?: string
    contentClassName?: string
    headless?: boolean
    backdropBlur?: boolean
  }
  export const Modal: React.FunctionComponent<ModalProps>

  export interface MarkdownTextProps {
    text: string
    streaming?: boolean
    variant?: 'body' | 'compact'
  }
  /** Renders markdown; there is no `className` prop — wrap it to style. */
  export const MarkdownText: React.FunctionComponent<MarkdownTextProps>

  export interface TagProps {
    tone?: 'outline' | 'solid' | 'neutral' | 'quiet' | 'success' | 'info' | 'warning' | 'danger'
    className?: string
    children?: React.ReactNode
  }
  /** Read-only badge; it takes no onClick. */
  export const Tag: React.FunctionComponent<TagProps>

  export interface ToastProps {
    text: string
    icon?: React.ReactNode
    tone?: 'success' | 'danger' | 'neutral'
    anchor?: HTMLElement | null
    holdMs?: number
    actions?: React.ReactNode
    onDone?: () => void
  }
  /** Re-showing the same text needs a fresh React key. */
  export const Toast: React.FunctionComponent<ToastProps>

  export const IconCheckOutlineMedium: React.FunctionComponent<IconProps>
  export const IconChevronDownOutlineMedium: React.FunctionComponent<IconProps>
  export const IconCloseOutlineMedium: React.FunctionComponent<IconProps>
  export const IconEditOutlineMedium: React.FunctionComponent<IconProps>
  export const IconLightOutlineMedium: React.FunctionComponent<IconProps>
  export const IconPersonalizationOutlineMedium: React.FunctionComponent<IconProps>
  export const IconPinOutlineMedium: React.FunctionComponent<IconProps>
  export const IconRefreshOutlineMedium: React.FunctionComponent<IconProps>
  export const IconSearchOutlineMedium: React.FunctionComponent<IconProps>
  export const IconTrashOutlineMedium: React.FunctionComponent<IconProps>
}
