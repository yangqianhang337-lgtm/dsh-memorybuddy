/**
 * Test-only entry: re-exports the collector, store and scheduler so a verifier
 * can drive them with events captured from the app's own session log. Bundled
 * by tools/verify-replay.mjs and tools/verify-schedule.mjs; never shipped in
 * lib/.
 *
 * Also exports the model stage (picker + distiller), so a verifier can drive
 * the whole chain against a synthetic `LlmLike` and a real catalogue on disk.
 */
export { SessionCollector } from '../src/host/collector.ts'
export { MemoryStore } from '../src/host/store.ts'
export { Consolidator } from '../src/host/consolidate.ts'
export { ConsolidationScheduler } from '../src/host/schedule.ts'
export { DEFAULT_PREFERENCES } from '../src/host/templates.ts'
export { ModelPicker, COOLDOWN_MINUTES, allows, routeKey } from '../src/host/model-picker.ts'
export { Distiller, TOTAL_BUDGET_MS, CALL_TIMEOUT_MS, MAX_ATTEMPTS, buildInput } from '../src/host/distill.ts'
export { extractProjectFacts as extractProjectFactsImpl } from '../src/host/project.ts'
export { PromptCache, slugify } from '../src/host/prompt.ts'
