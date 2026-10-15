/**
 * Verify the browser bundle presents the loader registration the page expects.
 *
 * The check is a plain source inspection rather than an evaluation, because the
 * bundle is written for a browser page: it calls `window.__ModuleLoader__` and
 * `require("react")`, neither of which exists in Node. What can be proven here is
 * the part that silently breaks the panel — the registration envelope, the
 * external module requests, and whether evaluating the factory would actually
 * produce `apply` and `inject`.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PATH = join(ROOT, 'lib/client.js')
const source = readFileSync(PATH, 'utf8')

const findings = []

/** Record one check's outcome. */
function check(label, ok, detail) {
  findings.push({ label, ok, detail })
}

check(
  'registration call',
  source.startsWith('window.__ModuleLoader__.load({'),
  source.slice(0, 40).replace(/\n/g, ' '),
)

check(
  'package id',
  source.includes('id: "dsh-workbuddy-memory"'),
  'id: "dsh-workbuddy-memory"',
)

check(
  'factory signature',
  /factory: \(require\) => \{/.test(source),
  'factory: (require) => {',
)

// Every bare `require("…")` the loader will be asked to resolve, minus the
// React pair the wrapper itself introduces.
const requested = new Set()
for (const match of source.matchAll(/require\((["'])([^"']+)\1\)/g)) requested.add(match[2])

const ALLOWED = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/dsh-client-ui-primitives',
])
const unexpected = [...requested].filter(name => !ALLOWED.has(name))
check(
  'external requests',
  unexpected.length === 0,
  `${[...requested].join(', ')}${unexpected.length > 0 ? ` (UNEXPECTED: ${unexpected.join(', ')})` : ''}`,
)

check(
  'exports expose apply and inject',
  /apply: \(\) => apply/.test(source) && /inject: \(\) => inject/.test(source),
  'esbuild __export map lists apply and inject',
)

check(
  'module tag stamped on the final exports',
  /Object\.defineProperty\(module\.exports, Symbol\.toStringTag/.test(source),
  'Symbol.toStringTag set after esbuild reassigns module.exports',
)

// `PAGE_FLAG` is a page-lifetime global, so its name appearing in the bundle is
// expected; the IIFE escape hatch that must NOT appear is a globalName carrier.
check(
  'no IIFE global escape',
  !source.includes('globalThis.__dshWorkBuddyMemory'),
  'no globalName artifact',
)

// The component code must actually be inside the factory: a bundle that only
// registered an empty factory would mount nothing at all.
check(
  'panel id baked in',
  source.includes('"workbuddy"') || source.includes("'workbuddy'"),
  'PANEL_ID literal present',
)

check(
  'settings section ids baked in',
  source.includes('workbuddy-personalize') && source.includes('workbuddy-memory"'),
  'both settings.section ids present',
)

check(
  'sourcemap comment is last',
  source.trimEnd().endsWith('//# sourceMappingURL=client.js.map'),
  source.trimEnd().split('\n').at(-1),
)

const failed = findings.filter(item => !item.ok)
for (const item of findings) console.log(`${item.ok ? 'ok  ' : 'FAIL'}  ${item.label}: ${item.detail}`)
console.log(`\n${findings.length - failed.length}/${findings.length} checks passed`)
if (failed.length > 0) process.exitCode = 1
