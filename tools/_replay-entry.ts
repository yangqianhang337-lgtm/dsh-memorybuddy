/**
 * Test-only entry: re-exports the collector and store so a verifier can drive
 * them with events captured from the app's own session log. Bundled by
 * tools/verify-replay.mjs; never shipped in lib/.
 */
export { SessionCollector } from '../src/host/collector.ts'
export { MemoryStore } from '../src/host/store.ts'
