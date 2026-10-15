/**
 * The YAML subset this plugin's own front-matter uses.
 *
 * Every file here is written by this plugin and read back by this plugin (plus
 * a human in an editor), so the dialect is deliberately tiny: `key: value`
 * pairs, booleans, numbers, `[]` and `["a", "b"]` lists, and single- or
 * double-quoted strings. A full YAML dependency would be the only runtime
 * dependency of the host half, and `@deepseek-ai/*` packages are not resolvable
 * from a profile's `node_modules` — so a self-contained subset is the only
 * option that keeps the package installable from a plain `git clone`.
 *
 * A value the subset cannot represent is quoted on write, so a round trip is
 * always lossless for the shapes we produce.
 */

/** One parsed front-matter record. */
export type FrontMatterValue = string | number | boolean | string[]

/** Serialize one scalar the way the reader will parse it back. */
function writeScalar(value: FrontMatterValue): string {
  if (typeof value === 'boolean' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    return `[${value.map(item => JSON.stringify(item)).join(', ')}]`
  }
  const text = value
  if (text === '') return '""'
  // Quote anything that would otherwise be read as another type, carry a
  // structural character, or gain/lose surrounding whitespace.
  if (/^(true|false|null|~)$/i.test(text)) return JSON.stringify(text)
  if (/^-?\d+(\.\d+)?$/.test(text)) return JSON.stringify(text)
  if (/^[[\]{}#&*!|>%@`"']/.test(text) || /[:#]\s|\s$|^\s/.test(text)) return JSON.stringify(text)
  return text
}

/** Serialize a front-matter record in insertion order. */
export function stringifyFrontMatter(record: Record<string, FrontMatterValue>): string {
  const lines = Object.entries(record).map(([key, value]) => `${key}: ${writeScalar(value)}`)
  return `${lines.join('\n')}\n`
}

/** Strip one layer of matching quotes. */
function unquote(raw: string): string {
  const text = raw.trim()
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(text)
      return typeof parsed === 'string' ? parsed : text.slice(1, -1)
    } catch {
      return text.slice(1, -1)
    }
  }
  if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) return text.slice(1, -1).replaceAll("''", "'")
  return text
}

/** Split an inline flow list body on top-level commas. */
function splitFlowList(body: string): string[] {
  const parts: string[] = []
  let current = ''
  let quote: '"' | "'" | undefined
  for (const char of body) {
    if (quote !== undefined) {
      current += char
      if (char === quote) quote = undefined
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      current += char
      continue
    }
    if (char === ',') {
      parts.push(current)
      current = ''
      continue
    }
    current += char
  }
  parts.push(current)
  return parts.map(part => part.trim()).filter(part => part !== '')
}

/** Parse one scalar; unknown shapes stay strings. */
function readScalar(raw: string): FrontMatterValue {
  const text = raw.trim()
  if (text === '') return ''
  if (text.startsWith('[') && text.endsWith(']')) return splitFlowList(text.slice(1, -1)).map(unquote)
  if (text === 'true') return true
  if (text === 'false') return false
  if (/^-?\d+$/.test(text)) return Number.parseInt(text, 10)
  if (/^-?\d*\.\d+$/.test(text)) return Number.parseFloat(text)
  return unquote(text)
}

/**
 * Parse a front-matter block body into a record.
 *
 * Nested mappings are flattened with a dotted key (`a.b: v`) so a hand-edited
 * nested block still survives a read instead of being silently dropped.
 */
export function parseFrontMatter(body: string): Record<string, FrontMatterValue> {
  const record: Record<string, FrontMatterValue> = {}
  let prefix = ''
  for (const line of body.split(/\r?\n/)) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    const indent = line.length - line.trimStart().length
    const content = line.trim()
    const separator = content.indexOf(':')
    if (separator <= 0) continue
    const key = content.slice(0, separator).trim()
    const rawValue = content.slice(separator + 1)
    if (indent > 0) {
      record[`${prefix}${key}`] = readScalar(rawValue)
      continue
    }
    if (rawValue.trim() === '') {
      // A block mapping or block list follows; remember the prefix for the
      // dotted flattening above and treat the key itself as empty.
      prefix = `${key}.`
      record[key] = ''
      continue
    }
    prefix = ''
    record[key] = readScalar(rawValue)
  }
  return record
}
