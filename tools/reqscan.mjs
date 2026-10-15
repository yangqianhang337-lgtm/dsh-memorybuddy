// Scan a client bundle for every module specifier it require()s at runtime.
// Usage: node tools/reqscan.mjs <client.js> [more...]
import { readFileSync } from 'node:fs'

const RE = /require\(\s*(["'`])([^"'`]+)\1\s*\)/g

for (const file of process.argv.slice(2)) {
  const src = readFileSync(file, 'utf8')
  const specs = new Set()
  for (const m of src.matchAll(RE)) specs.add(m[2])
  console.log(`=== ${file} (${src.length} chars) ===`)
  if (specs.size === 0) console.log('  (no static require specs)')
  for (const s of [...specs].sort()) console.log(`  ${s}`)
  const loader = src.match(/__ModuleLoader__\.load\(\{[\s\S]{0,200}/)
  console.log('  loader head:', loader ? loader[0].replace(/\s+/g, ' ').slice(0, 180) : '(none)')
}
