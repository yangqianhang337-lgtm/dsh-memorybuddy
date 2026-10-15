// List the named exports of a bundled ESM module by scanning for its export statement.
import { readFileSync } from 'node:fs'

const file = process.argv[2]
const src = readFileSync(file, 'utf8')
const patterns = [/export\s*\{/g, /exports\.(\w+)\s*=/g]
let found = false
for (const re of patterns) {
  const names = new Set()
  for (const m of src.matchAll(re)) {
    if (re.source.startsWith('export')) {
      // slice balanced braces
      let i = m.index + m[0].length - 1
      let depth = 0
      let j = i
      for (; j < src.length; j += 1) {
        if (src[j] === '{') depth += 1
        else if (src[j] === '}') { depth -= 1; if (depth === 0) break }
      }
      const body = src.slice(i + 1, j)
      for (const part of body.split(',')) {
        const t = part.trim()
        if (t === '') continue
        const asMatch = t.match(/\bas\s+([\w$]+)$/)
        names.add(asMatch ? asMatch[1] : t.split(/\s+/)[0])
      }
    } else {
      names.add(m[1])
    }
  }
  if (names.size > 0) {
    found = true
    console.log(`--- ${re.source} (${names.size}) ---`)
    console.log([...names].sort().join(' '))
  }
}
if (!found) console.log('(no exports found)')
