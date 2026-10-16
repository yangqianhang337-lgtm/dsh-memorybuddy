/**
 * Test-only entry: re-exports the collector, store and scheduler so a verifier
 * can drive them with events captured from the app's own session log. Bundled
 * by tools/verify-replay.mjs and tools/verify-schedule.mjs; never shipped in
 * lib/.
 */
export { SessionCollector } from '../src/host/collector.ts'
export { MemoryStore } from '../src/host/store.ts'
export { Consolidator } from '../src/host/consolidate.ts'
export { ConsolidationScheduler } from '../src/host/schedule.ts'
export { DEFAULT_PREFERENCES } from '../src/host/templates.ts'
