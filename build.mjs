/**
 * Build the two halves of dsh-memorybuddy.
 *
 * Two bundles come out of one run, because the plugin is served the same way on
 * both sides of the process boundary and each side has a different module
 * universe:
 *
 * - `lib/index.js` is the Node half. It runs inside the DSH host process, where
 *   only `node:*` builtins and the host's own package table resolve, so
 *   everything except builtins is bundled in and nothing is marked external
 *   except Node's own modules.
 * - `lib/client.js` is the browser half. It is fetched by
 *   `@deepseek-ai/dsh-client-modules` and evaluated through the page's module
 *   loader, which resolves a fixed seed of shared modules and nothing else. The
 *   shared React runtime MUST stay external or two copies of React would exist
 *   in one page and hooks would break, so `react`, `react/jsx-runtime`,
 *   `react-dom` and the primitives package are external here.
 *
 * The browser bundle is wrapped in the loader's own registration call rather
 * than being a real ES module: the page's `require` is a synchronous table
 * lookup, and `window.__ModuleLoader__.load({ id, factory })` is the only entry
 * point it offers. Executing the script therefore does nothing but register the
 * factory; all side effects (including CSS injection) run when the factory is
 * first materialized.
 *
 * `--watch` rebuilds on change for `pnpm run dev`; the CSS is inlined by hand at
 * authoring time (see src/client/styles.ts), so there is no CSS pipeline here.
 */

import { build, context } from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url))
const PACKAGE_NAME = 'dsh-memorybuddy'

/** Node half: bundle everything, keep Node's own modules external. */
const HOST_OPTIONS = {
  entryPoints: [join(ROOT, 'src/index.ts')],
  outfile: join(ROOT, 'lib/index.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  logLevel: 'info',
  // The host resolves its own service packages from its bundle, so leaving them
  // external would produce an import that cannot be resolved from a profile.
  external: ['node:*'],
}

/** Browser half: shared React runtime stays external; everything else bundles. */
const CLIENT_OPTIONS = {
  entryPoints: [join(ROOT, 'src/client/index.ts')],
  outfile: join(ROOT, 'lib/client.js'),
  bundle: true,
  // CommonJS, not IIFE: the loader hands the factory a `require`, a `module` and
  // an `exports`, exactly the CJS environment, so the bundle's own
  // `exports.apply` / `exports.inject` land where the loader looks for them.
  // An IIFE with `globalName` cannot be used here — its `var NAME = …` would be
  // scoped to the factory function and never reach `globalThis`.
  format: 'cjs',
  platform: 'browser',
  target: 'es2021',
  sourcemap: true,
  logLevel: 'info',
  jsx: 'automatic',
  external: [
    'react',
    'react/jsx-runtime',
    'react-dom',
    'react-dom/client',
    '@deepseek-ai/dsh-client-ui-primitives',
  ],
}

/** The loader registration a browser bundle must present. */
function clientWrapper(body) {
  return `window.__ModuleLoader__.load({
  id: ${JSON.stringify(PACKAGE_NAME)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    let react = require("react");
    let react_jsx_runtime = require("react/jsx-runtime");
${body}
    // esbuild's CommonJS output ends with a reassignment of module.exports to
    // its __toCommonJS wrapper, which REPLACES the object exports started as -
    // so the module tag has to be stamped on whatever module.exports finally
    // points at, not on the original export object.
    Object.defineProperty(module.exports, Symbol.toStringTag, { value: "Module" });
    return module.exports;
  }
});
`
}

/**
 * Wrap the emitted browser bundle in its loader registration.
 *
 * esbuild writes `lib/client.js` itself, so the rewrite happens through a plugin
 * `onEnd` hook rather than by re-reading the file: that way `--watch` produces
 * the same loadable artifact as a one-shot build, instead of a bare CommonJS
 * module the page cannot register.
 */
const CLIENT_WRAPPER_PLUGIN = {
  name: 'memorybuddy:loader-registration',
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length > 0) return
      const code = await readFile(CLIENT_OPTIONS.outfile, 'utf8')
      // esbuild's own `//# sourceMappingURL=` comment must stay the LAST line,
      // or a debugger stops resolving the bundle back to its sources.
      const marker = '//# sourceMappingURL='
      const index = code.lastIndexOf(marker)
      const bundle = index === -1 ? code : code.slice(0, index)
      const sourceMapComment = index === -1 ? '' : code.slice(index)
      await writeFile(
        CLIENT_OPTIONS.outfile,
        `${clientWrapper(bundle.trimEnd())}${sourceMapComment}`,
        'utf8',
      )
    })
  },
}

/** Build the browser half once, with the wrapper applied. */
async function buildClient() {
  await build({ ...CLIENT_OPTIONS, plugins: [CLIENT_WRAPPER_PLUGIN] })
}

/** Keep the readable version string in one place. */
async function readVersion() {
  const text = await readFile(join(ROOT, 'package.json'), 'utf8')
  return JSON.parse(text).version
}

const watching = process.argv.includes('--watch')

if (watching) {
  const hostContext = await context(HOST_OPTIONS)
  await hostContext.watch()
  const clientContext = await context({ ...CLIENT_OPTIONS, plugins: [CLIENT_WRAPPER_PLUGIN] })
  await clientContext.watch()
  console.log(`${PACKAGE_NAME} ${await readVersion()}: watching for changes`)
} else {
  await build(HOST_OPTIONS)
  await buildClient()
  console.log(`${PACKAGE_NAME} ${await readVersion()}: built lib/index.js and lib/client.js`)
}
