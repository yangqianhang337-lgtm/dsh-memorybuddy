/**
 * Materialize the browser bundle the way the page's loader would.
 *
 * Source inspection proves the envelope; this proves the factory actually runs.
 * The bundle is evaluated against a stub `window.__ModuleLoader__`, a stub React
 * runtime and a stub `document`, then the factory is called with a `require` that
 * mirrors the loader's seed table. A throw here is exactly what would surface in
 * the browser console as a failed registration.
 *
 * This is not a render test — nothing is mounted and no DOM tree is asserted. It
 * answers one question: does the plugin register, and does it export the two
 * symbols the loader looks for?
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(ROOT, 'lib/client.js'), 'utf8')

const registrations = []

/* --- stub React: enough shape for module initialization, nothing more ------- */

const noop = () => undefined

/** A stand-in for every React hook the client modules call at module scope. */
const react = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  createContext: () => ({ Provider: noop, Consumer: noop }),
  forwardRef: render => render,
  memo: render => render,
  useCallback: fn => fn,
  useEffect: noop,
  useMemo: fn => fn(),
  useRef: value => ({ current: value }),
  useState: value => [typeof value === 'function' ? value() : value, noop],
  version: '18.3.1',
}

const jsxRuntime = {
  jsx: react.createElement,
  jsxs: react.createElement,
  Fragment: Symbol('Fragment'),
}

/** Primitives: every named export the page resolves is a renderable no-op. */
const primitives = new Proxy(
  {},
  { get: (_target, key) => (typeof key === 'string' ? () => null : undefined) },
)

const SEED = {
  react,
  'react/jsx-runtime': jsxRuntime,
  'react-dom': { createPortal: noop },
  'react-dom/client': { createRoot: () => ({ render: noop, unmount: noop }) },
  '@deepseek-ai/dsh-client-ui-primitives': primitives,
}

const requireStub = (specifier) => {
  if (Object.prototype.hasOwnProperty.call(SEED, specifier)) return SEED[specifier]
  throw new Error(`client-modules: requested external "${specifier}"`)
}

/* --- stub document: the bundle injects a <style> at materialization --------- */

const appended = []
const documentStub = {
  head: { appendChild: node => appended.push(node) },
  querySelector: () => null,
  createElement: () => ({ dataset: {}, textContent: '' }),
}

const sandbox = {
  window: {
    __ModuleLoader__: {
      load(registration) {
        registrations.push(registration)
      },
    },
  },
  document: documentStub,
  navigator: { clipboard: { writeText: async () => undefined } },
  console,
  setTimeout,
  clearTimeout,
}
sandbox.globalThis = sandbox

vm.createContext(sandbox)
vm.runInContext(source, sandbox, { filename: 'lib/client.js' })

const results = []
const record = (label, ok, detail) => results.push({ label, ok, detail })

record('one registration', registrations.length === 1, `${registrations.length} registration(s)`)

const registration = registrations[0]
record('registration id', registration?.id === 'dsh-workbuddy-memory', String(registration?.id))

let exports
try {
  exports = registration.factory(requireStub)
  record('factory materialized', true, 'no throw')
} catch (error) {
  record('factory materialized', false, error instanceof Error ? error.message : String(error))
}

if (exports !== undefined) {
  record('exports.apply is a function', typeof exports.apply === 'function', typeof exports.apply)
  record('exports.inject is an array', Array.isArray(exports.inject), JSON.stringify(exports.inject))
  record(
    'toStringTag is Module',
    Object.prototype.toString.call(exports) === '[object Module]',
    Object.prototype.toString.call(exports),
  )
}

record(
  'no side effects at materialization',
  appended.length === 0,
  `${appended.length} <style> tag(s) before apply()`,
)

/* --- run apply() against a stub context ------------------------------------ */

const registered = []
const injected = []

const slots = {
  inject(key, callback) {
    injected.push(key)
    const dispose = callback()
    return typeof dispose === 'function' ? dispose : () => {}
  },
  register(options, component) {
    registered.push({ options, component })
    return () => {}
  },
}

let effectDisposers = 0
const ctx = {
  effect(callback) {
    const dispose = callback()
    if (typeof dispose === 'function') effectDisposers += 1
    return () => {}
  },
  on: () => () => {},
  get: () => undefined,
  slots,
  locale: {
    register: () => () => {},
    bind: () => key => key,
    getSnapshot: () => ({ active: 'zh' }),
  },
}

try {
  exports.apply(ctx)
  record('apply() returned without throwing', true, 'ok')
} catch (error) {
  record('apply() returned without throwing', false, error instanceof Error ? error.message : String(error))
}

record('stylesheet injected on apply()', appended.length === 1, `${appended.length} <style> tag(s)`)
record(
  'panel id used for the panel seat',
  registered.some(item => item.options.name === 'sidebar.panellist'),
  registered.map(item => String(item.options.name)).join(', ') || '(none)',
)
record(
  'page registered into the main slot',
  registered.some(item => item.options.name === 'main'),
  registered.filter(item => item.options.name === 'main').map(item => String(item.options.key)).join(', ') || '(none)',
)
record(
  'two settings sections registered',
  registered.filter(item => item.options.name === 'settings.section').length === 2,
  registered
    .filter(item => item.options.name === 'settings.section')
    .map(item => `${String(item.options.id)}@${String(item.options.order)}`)
    .join(', ') || '(none)',
)
record(
  'every registration came through slots.inject',
  injected.length === registered.length && injected.length > 0,
  `${injected.length} inject(s) for ${registered.length} registration(s)`,
)

const failed = results.filter(item => !item.ok)
for (const item of results) console.log(`${item.ok ? 'ok  ' : 'FAIL'}  ${item.label}: ${item.detail}`)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length > 0) process.exitCode = 1
