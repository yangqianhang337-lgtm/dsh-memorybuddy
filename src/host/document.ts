/**
 * Markdown documents with YAML front-matter: parse, render, and hash.
 *
 * One file is one `---` block, a body, and nothing else. The body is what the
 * panel edits; the front-matter is what the host owns. A file whose
 * front-matter is missing or broken is still readable — the body is everything
 * and the record comes back empty — because a half-written file must never
 * make the panel show an error page instead of the user's own text.
 */

import { createHash } from 'node:crypto'
import { parseFrontMatter, stringifyFrontMatter, type FrontMatterValue } from './yaml.ts'

/** Re-exported so a module writing front-matter needs only `document.ts`. */
export type { FrontMatterValue }

/** A parsed document. */
export interface MarkdownDocument {
  front: Record<string, FrontMatterValue>
  body: string
  /** sha1 of the raw file text — the optimistic-concurrency token. */
  revision: string
}

/** The empty document a missing file reads as. */
export const EMPTY_DOCUMENT: MarkdownDocument = { front: {}, body: '', revision: revisionOf('') }

/** sha1 of arbitrary text. */
export function revisionOf(text: string): string {
  return createHash('sha1').update(text, 'utf8').digest('hex')
}

/** Normalize the line endings and trailing whitespace of a body. */
export function normalizeBody(body: string): string {
  return body.replaceAll('\r\n', '\n').replace(/\n+$/, '')
}

/** Parse raw file text into a document. */
export function parseDocument(raw: string): MarkdownDocument {
  const text = raw.replaceAll('\r\n', '\n')
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text)
  if (match === null) {
    return { front: {}, body: normalizeBody(text), revision: revisionOf(raw) }
  }
  return {
    front: parseFrontMatter(match[1]),
    body: normalizeBody(text.slice(match[0].length)),
    revision: revisionOf(raw),
  }
}

/** Render a document back to file text. */
export function renderDocument(front: Record<string, FrontMatterValue>, body: string): string {
  const normalized = normalizeBody(body)
  return `---\n${stringifyFrontMatter(front)}---\n${normalized === '' ? '' : `${normalized}\n`}`
}

/** Read one front-matter value as a string. */
export function frontString(front: Record<string, FrontMatterValue>, key: string, fallback: string): string {
  const value = front[key]
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : fallback
}

/** Read one front-matter value as a boolean. */
export function frontBoolean(front: Record<string, FrontMatterValue>, key: string, fallback: boolean): boolean {
  const value = front[key]
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

/** Read one front-matter value as a number. */
export function frontNumber(front: Record<string, FrontMatterValue>, key: string, fallback: number): number {
  const value = front[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

/** Read one front-matter value as a string list. */
export function frontList(front: Record<string, FrontMatterValue>, key: string): string[] {
  const value = front[key]
  if (Array.isArray(value)) return value
  if (typeof value === 'string' && value !== '') return [value]
  return []
}
