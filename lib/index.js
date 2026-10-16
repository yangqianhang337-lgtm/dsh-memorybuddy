// src/protocol.ts
var API_PREFIX = "/api/memorybuddy";
var REPLY_STYLES = ["\u9ED8\u8BA4", "\u7B80\u6D01", "\u8BE6\u7EC6", "\u6559\u5B66", "\u76F4\u63A5"];
var CONSOLIDATE_MODES = ["startup-idle", "idle", "session-end", "fixed"];
var MODEL_POLICIES = ["free-first", "allowlist", "session-default", "off"];
var MAX_INPUT_BYTES = 16 * 1024;
var CONFIDENCES = ["\u4F4E", "\u4E2D", "\u9AD8"];
var TOPICS = [
  { key: "background", file: "background.md", title: "\u5DE5\u4F5C\u80CC\u666F" },
  { key: "habits", file: "habits.md", title: "\u884C\u4E8B\u98CE\u683C" },
  { key: "environment", file: "environment.md", title: "\u73AF\u5883\u8DEF\u5F84" },
  { key: "preferences-learned", file: "preferences-learned.md", title: "\u4E60\u5F97\u504F\u597D" }
];
var WIPE_CONFIRMATION = "DELETE";
function asRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return void 0;
  return value;
}

// src/host/entries.ts
import { createHash } from "node:crypto";
function entryId(text) {
  return `M-${createHash("sha1").update(text.trim(), "utf8").digest("hex").slice(0, 8)}`;
}
function dayKey(date = /* @__PURE__ */ new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function parseDay(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (match === null) return void 0;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? void 0 : date;
}
function daysBetween(earlier, later) {
  const a = parseDay(earlier);
  const b = parseDay(later);
  if (a === void 0 || b === void 0) return 0;
  return Math.round((b.getTime() - a.getTime()) / 864e5);
}
function confidenceForDays(days) {
  if (days >= 4) return "\u9AD8";
  if (days >= 2) return "\u4E2D";
  return "\u4F4E";
}
var ENTRY_PATTERN = /^\s*[-*]\s+(?:\[([A-Za-z0-9-]+)\]\s*)?(.+?)\s*$/;
function splitComment(raw) {
  const match = /<!--([\s\S]*?)-->\s*$/.exec(raw);
  if (match === null) return { text: raw.trim(), meta: void 0 };
  return { text: raw.slice(0, match.index).trim(), meta: match[1].trim() };
}
function readMeta(meta) {
  const record = {};
  if (meta === void 0) return record;
  for (const part of meta.split(/\s+/)) {
    const separator = part.indexOf(":");
    if (separator <= 0) continue;
    record[part.slice(0, separator)] = part.slice(separator + 1);
  }
  return record;
}
function parseEntries(body) {
  const entries = [];
  const lines = body.split("\n");
  for (let line = 0; line < lines.length; line += 1) {
    const match = ENTRY_PATTERN.exec(lines[line]);
    if (match === null) continue;
    const { text, meta } = splitComment(match[2]);
    if (text === "") continue;
    const fields = readMeta(meta);
    const days = Number.parseInt(fields.days ?? "1", 10);
    const confidence = CONFIDENCES.includes(fields.conf ?? "") ? fields.conf : confidenceForDays(Number.isFinite(days) ? days : 1);
    const first = fields.first ?? dayKey();
    const last = fields.last ?? first;
    entries.push({
      id: match[1] ?? entryId(text),
      text,
      confidence,
      days: Number.isFinite(days) && days > 0 ? days : 1,
      first,
      last,
      sources: (fields.src ?? "").split(",").map((item) => item.trim()).filter((item) => item !== ""),
      pinned: fields.pin === "1",
      conflict: fields.conflict === "1",
      line
    });
  }
  return entries;
}
function renderEntry(entry) {
  const fields = [
    `conf:${entry.confidence}`,
    `days:${entry.days}`,
    `first:${entry.first}`,
    `last:${entry.last}`
  ];
  if (entry.sources.length > 0) fields.push(`src:${entry.sources.join(",")}`);
  if (entry.pinned) fields.push("pin:1");
  if (entry.conflict) fields.push("conflict:1");
  return `- [${entry.id}] ${entry.text} <!-- ${fields.join(" ")} -->`;
}
function renderTopicBody(body, entries) {
  const lines = body.split("\n");
  const listLines = /* @__PURE__ */ new Set();
  for (let line = 0; line < lines.length; line += 1) {
    if (ENTRY_PATTERN.test(lines[line])) listLines.add(line);
  }
  const kept = [];
  let inserted = false;
  for (let line = 0; line < lines.length; line += 1) {
    if (listLines.has(line)) {
      if (!inserted) {
        kept.push(...entries.map(renderEntry));
        inserted = true;
      }
      continue;
    }
    kept.push(lines[line]);
  }
  if (!inserted) {
    if (entries.length > 0) kept.push("", ...entries.map(renderEntry));
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}
function normalizeForCompare(text) {
  return text.toLowerCase().normalize("NFKC").replace(/[\s]+/g, "").replace(/[，。、；：！？,.;:!?"'`（）()【】\[\]{}<>《》]/g, "");
}
function bigrams(text) {
  const grams = /* @__PURE__ */ new Set();
  for (let index = 0; index + 1 < text.length; index += 1) grams.add(text.slice(index, index + 2));
  if (text.length === 1) grams.add(text);
  return grams;
}
function similarity(left, right) {
  const a = bigrams(normalizeForCompare(left));
  const b = bigrams(normalizeForCompare(right));
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared += 1;
  return shared / (a.size + b.size - shared);
}
var MERGE_THRESHOLD = 0.75;
function contradicts(existing, candidate) {
  if (similarity(existing, candidate) < 0.5) return false;
  const negations = ["\u4E0D", "\u522B", "\u65E0\u9700", "\u7981\u6B62", "no longer", "not ", "don't", "never"];
  const has = (text) => negations.some((token) => text.includes(token));
  return has(existing) !== has(candidate);
}

// src/host/privacy.ts
import { statSync } from "node:fs";
import { join } from "node:path";
var NO_MEMORY_MARKER = ".no-memory";
var MARKER_TTL_MS = 1e3;
var markerCache = /* @__PURE__ */ new Map();
var MARKER_CACHE_LIMIT = 256;
function isNoMemoryWorkspace(workspace) {
  const path = workspace.trim();
  if (path === "") return false;
  const cached = markerCache.get(path);
  if (cached !== void 0 && Date.now() - cached.at < MARKER_TTL_MS) return true;
  let marked = false;
  try {
    marked = statSync(join(path, NO_MEMORY_MARKER)).isFile();
  } catch {
    marked = false;
  }
  if (marked) {
    if (markerCache.size >= MARKER_CACHE_LIMIT) {
      const oldest = markerCache.keys().next();
      if (oldest.done !== true) markerCache.delete(oldest.value);
    }
    markerCache.set(path, { at: Date.now() });
  } else {
    markerCache.delete(path);
  }
  return marked;
}
function isUntrustedEvent(kind) {
  return kind !== "user";
}

// src/host/collector.ts
var IDLE_FINALIZE_MS = 12e4;
var FLUSH_INTERVAL_MS = 5e3;
var FLUSH_EVENT_COUNT = 20;
var MAX_RECORDED_EVENTS = 400;
var MAX_ASSISTANT_EVENTS = 60;
var MAX_DIALOGUE_LINES = 40;
var MAX_EXCERPT_CHARS = 400;
var MAX_SESSIONS_TRACKED = 64;
var MAX_CALL_NAMES = 512;
var PREFERENCE_PATTERNS = [
  { label: "\u660E\u786E\u504F\u597D", pattern: /以后都|今后都|下次都|每次都|一律|统一用/ },
  { label: "\u660E\u786E\u504F\u597D", pattern: /我不喜欢|我不想要|别再|不要再|不要用|请勿/ },
  { label: "\u56DE\u590D\u98CE\u683C", pattern: /先给结论|直接说|说重点|别废话|简短点|详细一点|讲细一点/ },
  { label: "\u7EA0\u9519", pattern: /不对[，,]?\s*应该|错了|不是这样|应该是|其实应该/ },
  { label: "\u786C\u7EA6\u675F", pattern: /必须用|只能用|不能用|禁止|不支持|锁定版本|别升级/ },
  { label: "\u51B3\u7B56", pattern: /就用|选[择定]?\s*\S+\s*(不|而不是|而不是用)|不选\S+因为|原因是/ }
];
function messageOf(data) {
  const inner = data?.message;
  if (inner !== null && typeof inner === "object" && !Array.isArray(inner)) {
    return inner;
  }
  return data;
}
function messageText(data) {
  const content = messageOf(data)?.content;
  if (!Array.isArray(content)) return "";
  const parts = [];
  for (const block of content) {
    if (block === null || typeof block !== "object") continue;
    const record = block;
    if (record.type === "text" && typeof record.text === "string") parts.push(record.text);
  }
  return parts.join("\n").trim();
}
function excerpt(text, max = MAX_EXCERPT_CHARS) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max)}\u2026`;
}
function eventTime(event) {
  if (typeof event.time === "string") return event.time;
  if (typeof event.time === "number" && Number.isFinite(event.time)) {
    return new Date(event.time).toISOString();
  }
  return (/* @__PURE__ */ new Date()).toISOString();
}
function sessionWorkspace(session) {
  const cwd = session.header?.meta?.cwd ?? session.header?.cwd;
  return typeof cwd === "string" ? cwd : "";
}
var SessionCollector = class {
  host;
  sessions = /* @__PURE__ */ new Map();
  draining = Promise.resolve();
  constructor(host) {
    this.host = host;
  }
  /** Handle one `session/event`. */
  observe(session, event) {
    if (!this.host.enabled()) {
      if (this.sessions.size > 0) this.forgetAll();
      return;
    }
    const state = this.stateFor(session);
    if (state === void 0) return;
    if (isNoMemoryWorkspace(state.workspace)) {
      this.sessions.delete(session.id);
      this.host.log(`\u5DE5\u4F5C\u76EE\u5F55\u51FA\u73B0 ${NO_MEMORY_MARKER} \u6807\u8BB0\uFF0C\u5DF2\u505C\u6B62\u5E76\u4E22\u5F03\u672C\u6B21\u4F1A\u8BDD\u7684\u7F13\u51B2\u5185\u5BB9`);
      return;
    }
    if (!state.backfilled) this.backfill(session, event.seq);
    state.seq = Math.max(state.seq, event.seq);
    const recorded = this.reduce(state, event);
    if (recorded !== void 0) {
      this.buffer(state, recorded);
      state.dirty += 1;
    }
    state.ended = eventTime(event);
    this.scheduleFlush(state);
    this.scheduleIdleFinalize(state);
  }
  /** Force everything buffered for `session` to disk (a durability checkpoint). */
  async flush(session) {
    const state = this.sessions.get(session.id);
    if (state === void 0) return;
    await this.enqueue(async () => {
      await this.persist(state);
    });
  }
  /** A session went away: write its note and drop the live state. */
  async dispose(session) {
    const state = this.sessions.get(session.id);
    if (state === void 0) return;
    this.clearTimers(state);
    this.sessions.delete(session.id);
    if (isNoMemoryWorkspace(state.workspace)) return;
    await this.enqueue(async () => {
      state.finalized = true;
      await this.persist(state);
    });
  }
  /** Stop collecting and drop every buffer without writing it. */
  forgetAll() {
    for (const state of this.sessions.values()) this.clearTimers(state);
    this.sessions.clear();
  }
  /** Adopt the sessions that already exist when the plugin loads. */
  adopt(sessions) {
    if (!this.host.enabled()) return;
    for (const session of sessions) {
      if (this.sessions.has(session.id)) continue;
      if (this.sessions.size >= MAX_SESSIONS_TRACKED) return;
      const state = this.stateFor(session);
      if (state === void 0) continue;
      this.backfill(session);
    }
  }
  /** Sessions currently tracked, for diagnostics. */
  get tracked() {
    return this.sessions.size;
  }
  /**
   * Live state of one session, creating it on first sight.
   *
   * Returns `undefined` when the session must not be collected at all — a
   * `.no-memory` marker in its working directory (P8 §5.2 row 6). The decision is
   * made HERE, before any event is buffered, because 「整会话不采集」 means no note
   * is ever written: a session that was buffered and filtered afterwards would
   * still have had its events held in memory, and would still write a note if the
   * filter were ever missed.
   *
   * The check costs one `statSync`, and it is paid ONCE per session (at
   * creation), not per event — which is why it can be synchronous at all and why
   * the event path stays allocation-free.
   */
  stateFor(session) {
    const existing = this.sessions.get(session.id);
    if (existing !== void 0) {
      const workspace2 = sessionWorkspace(session);
      if (workspace2 !== "" && existing.workspace === "") existing.workspace = workspace2;
      return existing;
    }
    const workspace = sessionWorkspace(session);
    if (isNoMemoryWorkspace(workspace)) {
      this.host.log(`\u5DE5\u4F5C\u76EE\u5F55\u5E26 ${NO_MEMORY_MARKER} \u6807\u8BB0\uFF0C\u672C\u6B21\u4F1A\u8BDD\u4E0D\u91C7\u96C6\uFF08${workspace}\uFF09`);
      return void 0;
    }
    const state = {
      id: session.id,
      workspace,
      started: (/* @__PURE__ */ new Date()).toISOString(),
      ended: null,
      turns: 0,
      events: [],
      callNames: /* @__PURE__ */ new Map(),
      dirty: 0,
      seq: 0,
      backfilled: false,
      timer: null,
      idleTimer: null,
      finalized: false
    };
    this.sessions.set(session.id, state);
    return state;
  }
  /**
   * Replay the part of a session's log that happened before the plugin mounted.
   *
   * A session the Host already had open when this plugin loaded emits nothing
   * about its past: `session/event` is a live feed, not a replay. Without this
   * the first note of an in-flight session says `turns: 0` and 「还没有可记录
   * 的内容」 even though the session is thousands of events deep — the note is
   * not empty because nothing happened, but because we arrived late.
   *
   * Runs once per session, and only when the session exposes its log.
   *
   * @param uptoExclusive - replay only events below this seq. `observe()` passes
   *   the seq of the event it is already holding, so the live path records that
   *   one and the replay never doubles it.
   */
  backfill(session, uptoExclusive = Number.POSITIVE_INFINITY) {
    if (!this.host.enabled()) return;
    const state = this.sessions.get(session.id) ?? this.stateFor(session);
    if (state === void 0) return;
    if (state.backfilled) return;
    state.backfilled = true;
    const snapshot = session.snapshotEvents;
    if (typeof snapshot !== "function") return;
    let events;
    try {
      events = snapshot.call(session, 0, uptoExclusive);
    } catch (error) {
      this.host.log(`\u4F1A\u8BDD\u5386\u53F2\u56DE\u586B\u5931\u8D25\uFF08${session.id}\uFF09\uFF1A${String(error)}`);
      return;
    }
    let recorded = 0;
    let earliest;
    for (const event of events) {
      if (typeof event?.type !== "string" || typeof event.seq !== "number") continue;
      if (event.seq >= uptoExclusive) continue;
      if (event.seq > state.seq) state.seq = event.seq;
      const time = eventTime(event);
      if (earliest === void 0 || time < earliest) earliest = time;
      const line = this.reduce(state, event);
      if (line !== void 0 && this.buffer(state, line)) recorded += 1;
    }
    if (earliest !== void 0 && earliest < state.started) state.started = earliest;
    state.dirty += recorded;
  }
  /**
   * Append a recorded line under the two caps, returning whether it was kept.
   *
   * Assistant replies are capped on their own so their volume cannot evict the
   * user's own words from the fixed note budget. Both the live path and the
   * history replay go through here, or a replayed session would ignore the caps.
   */
  buffer(state, line) {
    const assistantFull = line.kind === "assistant" && state.events.filter((item) => item.kind === "assistant").length >= MAX_ASSISTANT_EVENTS;
    if (assistantFull || state.events.length >= MAX_RECORDED_EVENTS) return false;
    state.events.push(line);
    return true;
  }
  /** Reduce one event to a recorded line, or `undefined` when it is not kept. */
  reduce(state, event) {
    const data = event.data;
    switch (event.type) {
      case "user/message": {
        const source = data?.source ?? {};
        if (source.kind !== "user") return void 0;
        const text = messageText(data);
        if (text === "") return void 0;
        return { kind: "user", seq: event.seq, time: eventTime(event), text: excerpt(text) };
      }
      case "assistant/message": {
        const text = messageText(data);
        if (text === "") return void 0;
        return { kind: "assistant", seq: event.seq, time: eventTime(event), text: excerpt(text, 200) };
      }
      case "tool/call": {
        const callId = typeof data?.callId === "string" ? data.callId : "";
        const name = typeof data?.name === "string" ? data.name : "";
        if (callId !== "" && name !== "") {
          if (state.callNames.size >= MAX_CALL_NAMES) state.callNames.clear();
          state.callNames.set(callId, name);
        }
        return void 0;
      }
      case "tool/result": {
        const message = messageOf(data);
        const source = message?.source;
        const callId = typeof message?.toolCallId === "string" ? message.toolCallId : typeof data?.toolCallId === "string" ? data.toolCallId : typeof source?.callId === "string" ? source.callId : "";
        const known = callId === "" ? void 0 : state.callNames.get(callId);
        const fallback = typeof data?.name === "string" ? data.name : typeof message?.name === "string" ? message.name : "";
        const name = known ?? fallback;
        const failed = message?.isError === true || data?.isError === true || data?.error !== void 0 || data?.ok === false;
        if (callId !== "" && known !== void 0) state.callNames.delete(callId);
        return {
          kind: "tool",
          seq: event.seq,
          time: eventTime(event),
          text: `${name === "" ? "\u5DE5\u5177\u8C03\u7528" : name}${failed ? "\uFF08\u5931\u8D25\uFF09" : "\uFF08\u6210\u529F\uFF09"}`
        };
      }
      case "turn/end": {
        state.turns += 1;
        const reason = data?.reason ?? {};
        const kind = typeof reason.kind === "string" ? reason.kind : "";
        return { kind: "turn", seq: event.seq, time: eventTime(event), text: kind === "" ? "\u56DE\u5408\u7ED3\u675F" : `\u56DE\u5408\u7ED3\u675F\uFF08${kind}\uFF09` };
      }
      default:
        return void 0;
    }
  }
  /** Flush on the throttle (5s or 20 events). */
  scheduleFlush(state) {
    if (state.dirty >= FLUSH_EVENT_COUNT) {
      if (state.timer !== null) clearTimeout(state.timer);
      state.timer = null;
      void this.enqueue(async () => {
        await this.persist(state);
      });
      return;
    }
    if (state.timer !== null) return;
    state.timer = setTimeout(() => {
      state.timer = null;
      void this.enqueue(async () => {
        await this.persist(state);
      });
    }, FLUSH_INTERVAL_MS);
    state.timer.unref?.();
  }
  /** Finalize the note once the session has been quiet for a while. */
  scheduleIdleFinalize(state) {
    if (state.idleTimer !== null) clearTimeout(state.idleTimer);
    state.idleTimer = setTimeout(() => {
      state.idleTimer = null;
      if (state.finalized) return;
      state.finalized = true;
      void this.enqueue(async () => {
        await this.persist(state);
        this.sessions.delete(state.id);
      });
    }, IDLE_FINALIZE_MS);
    state.idleTimer.unref?.();
  }
  /** Clear both timers of one session. */
  clearTimers(state) {
    if (state.timer !== null) clearTimeout(state.timer);
    if (state.idleTimer !== null) clearTimeout(state.idleTimer);
    state.timer = null;
    state.idleTimer = null;
  }
  /** Serialize writes so two sessions never interleave on `state.json`. */
  enqueue(operation) {
    const next = this.draining.then(operation, operation);
    this.draining = next.catch(() => void 0);
    return next;
  }
  /** Write the session note plus the state watermark. */
  async persist(state) {
    if (!this.host.enabled() && !state.finalized) return;
    if (state.dirty === 0 && !state.finalized) return;
    try {
      const relative = await this.host.store.writeSessionNote(
        dayKey(new Date(state.started)),
        state.id,
        {
          sessionId: state.id,
          workspace: state.workspace,
          started: state.started,
          ended: state.ended ?? (/* @__PURE__ */ new Date()).toISOString(),
          turns: state.turns,
          events: state.events.length,
          consolidated: false,
          title: this.title(state),
          updated: (/* @__PURE__ */ new Date()).toISOString()
        },
        this.renderBody(state)
      );
      state.dirty = 0;
      await this.markPending(relative, state.seq);
      this.host.onNote?.(relative);
    } catch (error) {
      this.host.log(`\u4F1A\u8BDD\u7B14\u8BB0\u5199\u5165\u5931\u8D25\uFF08${state.id}\uFF09\uFF1A${String(error)}`);
    }
  }
  /** A one-line title for the note: the first thing the user asked. */
  title(state) {
    const first = state.events.find((event) => event.kind === "user");
    return first === void 0 ? state.id.slice(0, 8) : excerpt(first.text, 60);
  }
  /** Render the note body (memory-plan §4.4). */
  renderBody(state) {
    const userLines = state.events.filter((event) => event.kind === "user");
    const assistantLines = state.events.filter((event) => event.kind === "assistant");
    const toolLines = state.events.filter((event) => event.kind === "tool");
    const candidates = [];
    for (const event of state.events) {
      if (isUntrustedEvent(event.kind)) continue;
      for (const { label, pattern } of PREFERENCE_PATTERNS) {
        if (!pattern.test(event.text)) continue;
        candidates.push(`- (\u5019\u9009 \xB7 ${label}) ${excerpt(event.text, 160)} \xB7 seq ${event.seq}`);
        break;
      }
    }
    const projects = state.workspace === "" ? [] : [`- ${state.workspace}\uFF1A\u672C\u4F1A\u8BDD\u7684\u5DE5\u4F5C\u76EE\u5F55`];
    const failed = toolLines.filter((line) => line.text.includes("\uFF08\u5931\u8D25\uFF09"));
    const dialogue = state.events.filter((event) => event.kind === "user" || event.kind === "assistant").slice(0, MAX_DIALOGUE_LINES).map((event) => `- ${event.kind === "user" ? "" : "\u52A9\u624B\uFF1A"}${event.text}`);
    const counts = /* @__PURE__ */ new Map();
    for (const line of toolLines) {
      const name = line.text.replace(/（(成功|失败)）$/, "");
      const entry = counts.get(name) ?? { ok: 0, failed: 0 };
      if (line.text.endsWith("\uFF08\u5931\u8D25\uFF09")) entry.failed += 1;
      else entry.ok += 1;
      counts.set(name, entry);
    }
    const toolSummary = counts.size === 0 ? [] : [
      `- \u5DE5\u5177\u8C03\u7528 ${toolLines.length} \u6B21\uFF1A${[...counts.entries()].map(([name, entry]) => `${name} \xD7${entry.ok + entry.failed}`).join("\u3001")}${failed.length > 0 ? `\uFF08\u5931\u8D25 ${failed.length} \u6B21\uFF09` : ""}`
    ];
    const sections = [
      "## \u505A\u4E86\u4EC0\u4E48",
      dialogue.length === 0 && toolSummary.length === 0 ? "- \uFF08\u672C\u4F1A\u8BDD\u8FD8\u6CA1\u6709\u53EF\u8BB0\u5F55\u7684\u5185\u5BB9\uFF09" : [...dialogue, ...toolSummary].join("\n"),
      "",
      "## \u89C2\u5BDF\u5230\u7684\u5DE5\u4F5C\u4E60\u60EF\u5019\u9009",
      candidates.length === 0 ? "- \uFF08\u65E0\uFF09" : candidates.slice(0, 12).join("\n"),
      "",
      "## \u9879\u76EE\u76F8\u5173",
      projects.length === 0 ? "- \uFF08\u65E0\uFF09" : projects.join("\n"),
      "",
      "## \u672A\u51B3\u4E8B\u9879",
      failed.length === 0 ? "- \uFF08\u65E0\uFF09" : failed.slice(0, 8).map((line) => `- \u5DE5\u5177 ${line.text.replace("\uFF08\u5931\u8D25\uFF09", "")} \u5728 seq ${line.seq} \u5931\u8D25`).join("\n")
    ];
    return sections.join("\n");
  }
  /** Record the note in `state.json` so a consolidation pass picks it up. */
  async markPending(relative, seq) {
    await this.host.store.patchState((state) => {
      const processed = { ...state.processed };
      if (seq >= (processed[this.keyFor(relative)] ?? 0)) processed[this.keyFor(relative)] = seq;
      const pending = state.pending.includes(relative) ? state.pending : [...state.pending, relative];
      return { ...state, processed, pending };
    });
  }
  /** The watermark key of one note. */
  keyFor(relative) {
    return relative;
  }
  /** Topic keys the collector can propose candidates for. */
  static get topics() {
    return TOPICS.map((topic) => topic.key);
  }
};

// src/host/document.ts
import { createHash as createHash2 } from "node:crypto";

// src/host/yaml.ts
function writeScalar(value) {
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[${value.map((item) => JSON.stringify(item)).join(", ")}]`;
  }
  const text = value;
  if (text === "") return '""';
  if (/^(true|false|null|~)$/i.test(text)) return JSON.stringify(text);
  if (/^-?\d+(\.\d+)?$/.test(text)) return JSON.stringify(text);
  if (/^[[\]{}#&*!|>%@`"']/.test(text) || /[:#]\s|\s$|^\s/.test(text)) return JSON.stringify(text);
  return text;
}
function stringifyFrontMatter(record) {
  const lines = Object.entries(record).map(([key, value]) => `${key}: ${writeScalar(value)}`);
  return `${lines.join("\n")}
`;
}
function unquote(raw) {
  const text = raw.trim();
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    try {
      const parsed = JSON.parse(text);
      return typeof parsed === "string" ? parsed : text.slice(1, -1);
    } catch {
      return text.slice(1, -1);
    }
  }
  if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) return text.slice(1, -1).replaceAll("''", "'");
  return text;
}
function splitFlowList(body) {
  const parts = [];
  let current = "";
  let quote;
  for (const char of body) {
    if (quote !== void 0) {
      current += char;
      if (char === quote) quote = void 0;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === ",") {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part !== "");
}
function readScalar(raw) {
  const text = raw.trim();
  if (text === "") return "";
  if (text.startsWith("[") && text.endsWith("]")) return splitFlowList(text.slice(1, -1)).map(unquote);
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^-?\d+$/.test(text)) return Number.parseInt(text, 10);
  if (/^-?\d*\.\d+$/.test(text)) return Number.parseFloat(text);
  return unquote(text);
}
function parseFrontMatter(body) {
  const record = {};
  let prefix = "";
  for (const line of body.split(/\r?\n/)) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    const content = line.trim();
    const separator = content.indexOf(":");
    if (separator <= 0) continue;
    const key = content.slice(0, separator).trim();
    const rawValue = content.slice(separator + 1);
    if (indent > 0) {
      record[`${prefix}${key}`] = readScalar(rawValue);
      continue;
    }
    if (rawValue.trim() === "") {
      prefix = `${key}.`;
      record[key] = "";
      continue;
    }
    prefix = "";
    record[key] = readScalar(rawValue);
  }
  return record;
}

// src/host/document.ts
var EMPTY_DOCUMENT = { front: {}, body: "", revision: revisionOf("") };
function revisionOf(text) {
  return createHash2("sha1").update(text, "utf8").digest("hex");
}
function normalizeBody(body) {
  return body.replaceAll("\r\n", "\n").replace(/\n+$/, "");
}
function parseDocument(raw) {
  const text = raw.replaceAll("\r\n", "\n");
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (match === null) {
    return { front: {}, body: normalizeBody(text), revision: revisionOf(raw) };
  }
  return {
    front: parseFrontMatter(match[1]),
    body: normalizeBody(text.slice(match[0].length)),
    revision: revisionOf(raw)
  };
}
function renderDocument(front, body) {
  const normalized = normalizeBody(body);
  return `---
${stringifyFrontMatter(front)}---
${normalized === "" ? "" : `${normalized}
`}`;
}
function frontString(front, key, fallback) {
  const value = front[key];
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : fallback;
}
function frontNumber(front, key, fallback) {
  const value = front[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}
function frontList(front, key) {
  const value = front[key];
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value !== "") return [value];
  return [];
}

// src/host/templates.ts
var DEFAULT_PERSONA_BODY = "\u4F60\u662F DSH\u540C\u5B66\uFF0C\u6211\u6700\u597D\u7684\u52A9\u624B\u3002";
var DEFAULT_PREFERENCES = {
  userName: "",
  agentName: "DSH\u540C\u5B66",
  replyStyle: "\u9ED8\u8BA4",
  welcome: true,
  showFileChanges: false,
  conversationMemory: true,
  localMemorySkills: true,
  consolidateOn: "startup-idle",
  consolidateIntervalHours: 24,
  consolidateIdleMinutes: 10,
  consolidateFixedTime: "03:00",
  consolidateQuiet: true,
  modelPolicy: "free-first",
  modelAllowlist: [],
  modelChoiceProvider: "",
  modelChoiceModel: "",
  modelChoiceEffort: "",
  promptBudgetBytes: 4096
};
function preferencesTemplate(now) {
  return renderDocument(
    {
      kind: "preferences",
      schema: 1,
      updated: now,
      userName: DEFAULT_PREFERENCES.userName,
      agentName: DEFAULT_PREFERENCES.agentName,
      replyStyle: DEFAULT_PREFERENCES.replyStyle,
      welcome: DEFAULT_PREFERENCES.welcome,
      showFileChanges: DEFAULT_PREFERENCES.showFileChanges,
      conversationMemory: DEFAULT_PREFERENCES.conversationMemory,
      localMemorySkills: DEFAULT_PREFERENCES.localMemorySkills,
      consolidateOn: DEFAULT_PREFERENCES.consolidateOn,
      consolidateIntervalHours: DEFAULT_PREFERENCES.consolidateIntervalHours,
      consolidateIdleMinutes: DEFAULT_PREFERENCES.consolidateIdleMinutes,
      consolidateFixedTime: DEFAULT_PREFERENCES.consolidateFixedTime,
      consolidateQuiet: DEFAULT_PREFERENCES.consolidateQuiet,
      modelPolicy: DEFAULT_PREFERENCES.modelPolicy,
      modelAllowlist: [...DEFAULT_PREFERENCES.modelAllowlist],
      modelChoiceProvider: DEFAULT_PREFERENCES.modelChoiceProvider,
      modelChoiceModel: DEFAULT_PREFERENCES.modelChoiceModel,
      modelChoiceEffort: DEFAULT_PREFERENCES.modelChoiceEffort,
      promptBudgetBytes: DEFAULT_PREFERENCES.promptBudgetBytes
    },
    [
      "# \u4E2A\u6027\u5316",
      "",
      "\u8FD9\u4E2A\u6587\u4EF6\u4FDD\u5B58\u4F60\u7684\u79F0\u547C\u3001\u52A9\u624B\u7684\u540D\u5B57\u4E0E\u56DE\u590D\u98CE\u683C\u3002\u9762\u677F\u4E0A\u7684\u6539\u52A8\u4F1A\u5199\u56DE\u8FD9\u91CC\uFF0C",
      "\u4F60\u4E5F\u53EF\u4EE5\u76F4\u63A5\u7528\u7F16\u8F91\u5668\u6539\uFF1A\u6539\u5B8C\u4FDD\u5B58\uFF0C\u9762\u677F\u4E0B\u4E00\u6B21\u5237\u65B0\u5C31\u4F1A\u8BFB\u5230\u65B0\u503C\u3002"
    ].join("\n")
  );
}
function profileTemplate(now) {
  return renderDocument(
    { kind: "persona", schema: 1, updated: now, injectOrder: 100 },
    DEFAULT_PERSONA_BODY
  );
}
function instructionsTemplate(now) {
  return renderDocument({ kind: "instructions", schema: 1, updated: now }, "");
}
var INDEX_SECTIONS = [
  { key: "background", title: "\u5DE5\u4F5C\u80CC\u666F" },
  { key: "habits", title: "\u884C\u4E8B\u98CE\u683C" },
  { key: "environment", title: "\u672C\u673A\u8F6F\u4EF6\u4E0E\u8DEF\u5F84\uFF08\u8DE8\u9879\u76EE\uFF09" },
  { key: "projects", title: "\u9879\u76EE\u7D22\u5F15" }
];
var INDEX_PLACEHOLDER = "<!-- \u7531\u63D2\u4EF6\u4ECE\u771F\u5B9E\u4F1A\u8BDD\u4E2D\u79EF\u7D2F\uFF1B\u6682\u65E0\u5185\u5BB9 -->";
function memoryIndexTemplate(now) {
  return renderDocument(
    {
      kind: "memory-index",
      schema: 1,
      generated: now,
      sources: ["habits", "background", "environment", "preferences-learned"],
      budgetBytes: DEFAULT_PREFERENCES.promptBudgetBytes
    },
    [
      "# \u957F\u671F\u8BB0\u5FC6",
      "",
      ...INDEX_SECTIONS.flatMap((section) => [`## ${section.title}`, INDEX_PLACEHOLDER, ""])
    ].join("\n").trimEnd()
  );
}
function topicTemplate(topic, title, now) {
  return renderDocument(
    { kind: "memory-topic", topic, title, schema: 1, updated: now },
    [`# ${title}`, "", "\uFF08\u5F53\u524D\u4E3A\u7A7A\u3002\uFF09"].join("\n")
  );
}
function initialFiles(now) {
  const files = {
    "preferences.md": preferencesTemplate(now),
    "profile.md": profileTemplate(now),
    "instructions.md": instructionsTemplate(now),
    "memory/index.md": memoryIndexTemplate(now)
  };
  for (const topic of TOPICS) {
    files[`memory/${topic.file}`] = topicTemplate(topic.key, topic.title, now);
  }
  return files;
}

// src/host/prompt.ts
var SECTION_NAME = "plugin:memorybuddy";
var SECTION_ORDER = 120;
var TOOL_HINT = "\uFF08\u66F4\u591A\u8BB0\u5FC6\u89C1 memorybuddy_recall \u5DE5\u5177\uFF09";
var PromptCache = class {
  store;
  preferences;
  documents = /* @__PURE__ */ new Map();
  primed = false;
  /** The project file the last `watchProject` registered, re-read on every prime. */
  watched;
  constructor(store) {
    this.store = store;
  }
  /** Re-read every file the section renders. */
  async prime() {
    const preferences = await this.store.readPreferences();
    const documents = /* @__PURE__ */ new Map();
    for (const relative of ["profile.md", "instructions.md", "memory/index.md"]) {
      const document = await this.store.readDocument(relative);
      documents.set(relative, document.body);
    }
    if (this.watched !== void 0) {
      const document = await this.store.readDocument(this.watched);
      documents.set(this.watched, document.body);
    }
    this.preferences = preferences;
    this.documents = documents;
    this.primed = true;
  }
  /** True once `prime` has succeeded at least once. */
  get ready() {
    return this.primed;
  }
  /** The section text for one session. */
  render(workspace) {
    const preferences = this.preferences;
    if (preferences === void 0) return { text: "", bytes: 0, truncated: false };
    const parts = [];
    const header = this.renderPreferences(preferences);
    if (header !== "") parts.push(header);
    const persona = this.documents.get("profile.md")?.trim() ?? "";
    if (persona !== "") parts.push(`\u3010\u4EBA\u8BBE\u3011
${clamp(persona, 800)}`);
    const instructions = this.documents.get("instructions.md")?.trim() ?? "";
    if (isMeaningful(instructions)) parts.push(`\u3010\u7528\u6237\u6307\u4EE4\u3011
${clamp(instructions, 800)}`);
    const index = this.documents.get("memory/index.md") ?? "";
    const budget = Math.max(256, preferences.promptBudgetBytes);
    const fitted = fitIndex(index, budget);
    if (fitted.text !== "") parts.push(`\u3010\u957F\u671F\u8BB0\u5FC6\u3011
${fitted.text}`);
    const project = this.renderProject(workspace);
    if (project !== "") parts.push(project);
    const text = parts.join("\n\n");
    return { text, bytes: Buffer.byteLength(text, "utf8"), truncated: fitted.truncated };
  }
  /** `preferences.md` compressed to the two lines the plan budgets. */
  renderPreferences(preferences) {
    const who = preferences.userName.trim() === "" ? "\uFF08\u672A\u8BBE\u7F6E\u79F0\u547C\uFF09" : preferences.userName.trim();
    const lines = [`\u3010\u7528\u6237\u504F\u597D\u3011\u79F0\u547C\uFF1A${who} \xB7 \u52A9\u624B\u540D\uFF1A${preferences.agentName} \xB7 \u56DE\u590D\u98CE\u683C\uFF1A${preferences.replyStyle}`];
    const switches = [];
    if (!preferences.welcome) switches.push("\u5173\u95ED\u6B22\u8FCE\u8BED");
    if (preferences.showFileChanges) switches.push("\u5C55\u793A\u6587\u4EF6\u6539\u52A8");
    if (!preferences.conversationMemory) switches.push("\u4F1A\u8BDD\u8BB0\u5FC6\u5DF2\u5173\u95ED");
    if (!preferences.localMemorySkills) switches.push("\u672C\u5730\u8BB0\u5FC6\u6280\u80FD\u5DF2\u5173\u95ED");
    if (preferences.consolidateQuiet) switches.push("\u9759\u9ED8\u6574\u7406");
    if (switches.length > 0) lines.push(`\u3010\u5F00\u5173\u3011${switches.join(" \xB7 ")}`);
    return lines.join("\n");
  }
  /**
   * Inject project memory only when the session works inside that project.
   *
   * The plan is explicit about this: a project's facts are noise in another
   * project's conversation, and injecting them would both waste budget and
   * invite the assistant to apply the wrong conventions.
   */
  renderProject(workspace) {
    if (workspace === void 0 || workspace.trim() === "") return "";
    const slug = slugify(workspace);
    if (slug === "") return "";
    const body = this.documents.get(`memory/projects/${slug}.md`);
    if (body === void 0 || !isMeaningful(body)) return "";
    return `\u3010\u672C\u9879\u76EE\u8BB0\u5FC6\u3011
${clamp(body, 1200)}`;
  }
  /** Register a project file the renderer may need. */
  async watchProject(workspace) {
    const slug = slugify(workspace);
    if (slug === "") return;
    const relative = `memory/projects/${slug}.md`;
    if (this.watched !== relative) {
      this.watched = relative;
      const document = await this.store.readDocument(relative);
      this.documents.set(relative, document.body);
      return;
    }
    if (!this.documents.has(relative)) {
      const document = await this.store.readDocument(relative);
      this.documents.set(relative, document.body);
    }
  }
};
function slugify(workspace) {
  const base = workspace.replaceAll("\\", "/").split("/").filter((part) => part !== "").pop() ?? "";
  return base.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}
function fitIndex(index, budget) {
  const sections = splitIndex(index);
  if (sections.length === 0) return { text: "", truncated: false };
  const rendered = sections.map((section) => renderSection(section));
  let text = rendered.join("\n\n");
  if (Buffer.byteLength(text, "utf8") <= budget) return { text, truncated: false };
  const kept = [...sections];
  while (kept.length > 1) {
    kept.pop();
    text = kept.map((section) => renderSection(section)).join("\n\n");
    if (Buffer.byteLength(text, "utf8") <= budget) break;
  }
  if (Buffer.byteLength(text, "utf8") > budget) {
    text = clamp(text, budget - Buffer.byteLength(TOOL_HINT, "utf8") - 1);
  }
  return { text: `${text}
${TOOL_HINT}`, truncated: true };
}
function splitIndex(index) {
  const sections = [];
  let current;
  for (const line of index.split("\n")) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading !== null) {
      current = { title: heading[1], lines: [] };
      sections.push(current);
      continue;
    }
    if (current !== void 0) current.lines.push(line);
  }
  return sections.filter((section) => section.lines.some((line) => isMeaningful(line)));
}
function renderSection(section) {
  const body = section.lines.join("\n").trim();
  return `## ${section.title}
${body}`;
}
function isMeaningful(body) {
  const text = body.trim();
  if (text === "") return false;
  if (text === INDEX_PLACEHOLDER) return false;
  const withoutPlaceholders = text.replaceAll(INDEX_PLACEHOLDER, "").replace(/（当前为空[^）]*）/g, "").replace(/（无）/g, "").trim();
  return withoutPlaceholders !== "";
}
function clamp(text, maxBytes) {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
  const lines = [];
  let used = 0;
  for (const line of text.split("\n")) {
    const cost = Buffer.byteLength(line, "utf8") + 1;
    if (used + cost > maxBytes) break;
    lines.push(line);
    used += cost;
  }
  return lines.join("\n").trimEnd();
}
var INDEX_TITLES = INDEX_SECTIONS.map((section) => section.title);
var TOPIC_KEYS = TOPICS.map((topic) => topic.key);

// src/host/project.ts
function extractProjectFacts(noteBody, workspace, source, date) {
  const slug = slugify(workspace);
  if (slug === "") return [];
  const section = projectSection(noteBody);
  if (section === void 0) return [];
  const candidates = [];
  for (const raw of section) {
    const match = /^\s*[-*]\s+(.+?)\s*$/.exec(raw);
    if (match === null) continue;
    const text = match[1].trim();
    if (text === "" || text.startsWith("\uFF08\u65E0\uFF09")) continue;
    if (/：本会话的工作目录\s*$/.test(text)) continue;
    candidates.push({ slug, workspace, text, source, date });
  }
  return candidates;
}
function projectSection(noteBody) {
  const lines = noteBody.split("\n");
  const start = lines.findIndex((line) => line.trim() === "## \u9879\u76EE\u76F8\u5173");
  if (start < 0) return void 0;
  const end = lines.findIndex((line, index) => index > start && /^##\s+/.test(line.trim()));
  return lines.slice(start + 1, end < 0 ? lines.length : end);
}

// src/host/skills.ts
var MIN_REPEATS = 3;
var MIN_DATES = 2;
var SCAN_LIMIT = 200;
var MIN_TOOLS = 2;
var NOISE_TOOLS = /* @__PURE__ */ new Set(["read", "glob", "grep", "pwsh", "todowrite", "todo_write", "taskboard"]);
function datesOfSources(sources) {
  const dates = /* @__PURE__ */ new Set();
  for (const source of sources) {
    const match = /^sessions\/(\d{4}-\d{2}-\d{2})\//.exec(source);
    if (match !== null) dates.add(match[1]);
  }
  return [...dates].sort();
}
var SkillGenerator = class {
  store;
  log;
  constructor(store, log) {
    this.store = store;
    this.log = log;
  }
  /**
   * Mine the three classes and write the drafts that qualify.
   *
   * Never throws: a skill draft is a bonus, and a store hiccup while looking for
   * bonuses must not cost the pass its topic writes.
   */
  async run(now = (/* @__PURE__ */ new Date()).toISOString()) {
    const report = { created: [], skipped: [] };
    let candidates;
    try {
      candidates = await this.mine();
    } catch (error) {
      this.log(`\u6280\u80FD\u8349\u7A3F\u626B\u63CF\u5931\u8D25\uFF1A${String(error)}`);
      return report;
    }
    const claimed = /* @__PURE__ */ new Set();
    for (const candidate of candidates) {
      if (claimed.has(candidate.name)) {
        report.skipped.push(candidate.name);
        continue;
      }
      if (await this.store.draftExists(candidate.name)) {
        report.skipped.push(candidate.name);
        continue;
      }
      claimed.add(candidate.name);
      try {
        await this.store.writeSkillDraft(candidate.name, candidate, now);
        report.created.push(candidate.name);
        this.log(`\u5DF2\u751F\u6210\u6280\u80FD\u8349\u7A3F ${candidate.name}\uFF08\u91CD\u590D ${candidate.repeats} \u6B21\uFF0C\u8DE8 ${candidate.dates.length} \u5929\uFF09`);
      } catch (error) {
        this.log(`\u6280\u80FD\u8349\u7A3F ${candidate.name} \u5199\u5165\u5931\u8D25\uFF1A${String(error)}`);
      }
    }
    return report;
  }
  /** Mine the three classes, in priority order. */
  async mine() {
    const [topics, samples] = await Promise.all([this.store.readAllEntries(), this.collect()]);
    const candidates = [];
    candidates.push(...await this.projects());
    candidates.push(...candidatesFromEntries(topics));
    candidates.push(...candidatesFromTools(samples));
    return candidates.sort((a, b) => b.repeats - a.repeats);
  }
  /** Project conventions, read one file at a time so one bad file is survivable. */
  async projects() {
    const candidates = [];
    for (const project of await this.store.readProjects()) {
      const slug = project.slug;
      let entries;
      try {
        entries = await this.store.readProjectEntries(slug);
      } catch (error) {
        this.log(`\u9879\u76EE ${slug} \u7684\u6280\u80FD\u8349\u7A3F\u626B\u63CF\u8DF3\u8FC7\uFF1A${String(error)}`);
        continue;
      }
      for (const entry of entries) {
        if (!corroborated(entry)) continue;
        const sources = [...entry.sources].sort();
        const dates = datesOfSources(sources);
        candidates.push({
          kind: "project",
          name: `${slug}-${nameFragment(entry.text)}`.slice(0, 64).replace(/-+$/, ""),
          title: `${slug} \u7684\u9879\u76EE\u7EA6\u5B9A`,
          description: excerpt2(entry.text),
          whenToUse: `\u5728 ${slug} \u76EE\u5F55\u91CC\u5DE5\u4F5C\u3001\u6216\u8981\u6539\u52A8\u8FD9\u4E2A\u9879\u76EE\u65F6\u5148\u6309\u8FD9\u6761\u6765\u3002`,
          steps: [`1. ${entry.text}`],
          derivedFrom: sources,
          dates,
          repeats: sources.length
        });
      }
    }
    return candidates;
  }
  /**
   * Read the recent notes as samples.
   *
   * Bounded at `SCAN_LIMIT` newest notes: the corroboration rule needs history,
   * but a notes tree that grows without bound would make every pass re-read all
   * of it. The cap is generous enough that a pattern assembled over weeks still
   * reaches the threshold on the pass that completes it.
   */
  async collect() {
    const notes = await this.store.readSessions(SCAN_LIMIT);
    const samples = [];
    for (const note of notes) {
      const document = await this.store.readDocument(note.path);
      samples.push({
        path: note.path,
        date: note.date,
        body: document.body,
        workspace: typeof document.front.workspace === "string" ? document.front.workspace : ""
      });
    }
    return samples;
  }
};
function candidatesFromEntries(entries) {
  const candidates = [];
  for (const topic of TOPICS) {
    const title = topic.title;
    for (const entry of entries[topic.key] ?? []) {
      if (!corroborated(entry)) continue;
      const sources = [...entry.sources].sort();
      const dates = datesOfSources(sources);
      candidates.push({
        kind: "habit",
        name: `${nameFragment(entry.text)}-${confidenceTag(entry.confidence)}`,
        title: `\u53CD\u590D\u51FA\u73B0\u7684${title}`,
        description: excerpt2(entry.text),
        whenToUse: `\u9047\u5230\u540C\u7C7B\u4E8B\u60C5\u65F6\u7167\u8FD9\u6761\u6765\uFF1A${excerpt2(entry.text, 60)}`,
        steps: [`1. ${entry.text}`],
        derivedFrom: sources,
        dates,
        repeats: sources.length
      });
    }
  }
  return candidates;
}
function corroborated(entry) {
  const sources = [...new Set(entry.sources.filter((source) => source !== ""))];
  if (sources.length < MIN_REPEATS) return false;
  return datesOfSources(sources).length >= MIN_DATES;
}
function candidatesFromTools(samples) {
  const bySlug = /* @__PURE__ */ new Map();
  for (const sample of samples) {
    const slug = lastSegment(sample.workspace);
    if (slug === "") continue;
    const names = toolsIn(sectionLines(sample.body, "## \u505A\u4E86\u4EC0\u4E48"));
    if (names.length < MIN_TOOLS) continue;
    let combos = bySlug.get(slug);
    if (combos === void 0) {
      combos = /* @__PURE__ */ new Map();
      bySlug.set(slug, combos);
    }
    for (const combo of pairs(names)) {
      const list = combos.get(combo) ?? [];
      list.push({ path: sample.path, date: sample.date });
      combos.set(combo, list);
    }
  }
  const candidates = [];
  for (const [slug, combos] of bySlug) {
    for (const [combo, occurrences] of combos) {
      const dates = [...new Set(occurrences.map((item) => item.date))].sort();
      if (dates.length < MIN_DATES || occurrences.length < MIN_REPEATS) continue;
      const tools = combo.split("+");
      candidates.push({
        kind: "tools",
        name: `${slug}-${tools.map(nameFragment).join("-")}`.slice(0, 64).replace(/-+$/, ""),
        title: `${slug} \u91CC\u5E38\u7528\u7684\u5DE5\u5177\u7EC4\u5408`,
        description: `\u5728 ${slug} \u91CC\uFF0C${tools.join(" \u4E0E ")} \u5728 ${dates.length} \u4E2A\u65E5\u671F\u91CC\u53CD\u590D\u4E00\u8D77\u51FA\u73B0\uFF08${occurrences.length} \u6B21\u4F1A\u8BDD\uFF09\u3002`,
        whenToUse: `\u5728 ${slug} \u91CC\u505A\u540C\u7C7B\u5DE5\u4F5C\u65F6\uFF0C\u4F18\u5148\u7528\u8FD9\u7EC4\u5DE5\u5177\u3002`,
        steps: dates.map((date, index) => `${index + 1}. ${date} \u7684\u4F1A\u8BDD\u91CC\u7528\u4E86 ${tools.join(" \u4E0E ")}`),
        derivedFrom: [...new Set(occurrences.map((item) => item.path))].sort(),
        dates,
        repeats: occurrences.length
      });
    }
  }
  return candidates;
}
function toolsIn(lines) {
  for (const line of lines) {
    const match = /^\s*[-*]\s*工具调用\s+\d+\s*次[：:]\s*(.+?)(?:（失败\s*\d+\s*次）)?\s*$/.exec(line);
    if (match === null) continue;
    const names = [];
    for (const part of match[1].split("\u3001")) {
      const name = part.replace(/×\s*\d+\s*$/, "").trim();
      if (name === "" || NOISE_TOOLS.has(name.toLowerCase())) continue;
      if (!names.includes(name)) names.push(name);
    }
    return names;
  }
  return [];
}
function pairs(names) {
  const result = [];
  for (let i = 0; i + 1 < names.length; i += 1) {
    result.push([names[i], names[i + 1]].sort().join("+"));
  }
  return [...new Set(result)];
}
function sectionLines(body, heading) {
  const lines = body.split("\n");
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) return [];
  const end = lines.findIndex((line, index) => index > start && /^##\s+/.test(line.trim()));
  return lines.slice(start + 1, end < 0 ? lines.length : end);
}
function excerpt2(text, max = 80) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max)}\u2026`;
}
function lastSegment(workspace) {
  return workspace.replaceAll("\\", "/").split("/").filter((part) => part !== "").pop() ?? "";
}
function nameFragment(text) {
  const ascii = text.toLowerCase().normalize("NFKC").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (ascii !== "") return ascii.slice(0, 32).replace(/-+$/, "");
  let hash = 0;
  for (const char of text) hash = hash * 31 + (char.codePointAt(0) ?? 0) >>> 0;
  return `skill-${hash.toString(36).slice(0, 8)}`;
}
function confidenceTag(confidence) {
  return confidence === "\u9AD8" ? "high" : confidence === "\u4E2D" ? "mid" : "low";
}
function renderDraftBody(candidate) {
  return [
    `# ${candidate.title}`,
    "",
    "> \u8FD9\u4EFD\u8349\u7A3F\u7531 MemoryBuddy \u4ECE\u4F60\u7684\u4F1A\u8BDD\u91CC\u81EA\u52A8\u63D0\u70BC\uFF0C\u8BF7\u5148\u786E\u8BA4\u518D\u6279\u51C6\u3002",
    "",
    "## \u6B65\u9AA4",
    ...candidate.steps,
    "",
    "## \u8BC1\u636E",
    `- \u5728 ${candidate.repeats} \u6B21\u4F1A\u8BDD\u91CC\u51FA\u73B0\uFF0C\u8DE8 ${candidate.dates.length} \u4E2A\u65E5\u671F\uFF08${candidate.dates.join("\u3001")}\uFF09`,
    `- \u6765\u6E90\u4F1A\u8BDD\uFF1A${candidate.derivedFrom.map(trimSession).join("\u3001")}`
  ].join("\n");
}
function trimSession(path) {
  return path.replace(/^sessions\//, "").replace(/\.md$/, "");
}

// src/host/consolidate.ts
var DECAY_DAYS = { \u4F4E: 30, \u4E2D: 90, \u9AD8: null };
var STALE_QUESTION_DAYS = 180;
function candidatesFrom(noteBody, source, date) {
  const candidates = [];
  for (const raw of noteBody.split("\n")) {
    const match = /^\s*[-*]\s+\(候选(?:\s*·\s*([^)]*))?\)\s*(.+?)\s*$/.exec(raw);
    if (match === null) continue;
    const text = match[2].replace(/\s*·\s*seq\s+\d+\s*$/i, "").trim();
    if (text === "" || text.startsWith("\uFF08\u65E0\uFF09")) continue;
    candidates.push({ text, topic: topicFor(match[1]), source, date });
  }
  return candidates;
}
function topicFor(label) {
  if (label === void 0) return "habits";
  if (label.includes("\u73AF\u5883") || label.includes("\u8DEF\u5F84")) return "environment";
  if (label.includes("\u80CC\u666F")) return "background";
  if (label.includes("\u504F\u597D") || label.includes("\u98CE\u683C")) return "preferences-learned";
  return "habits";
}
var Consolidator = class {
  store;
  log;
  generator;
  running = false;
  /**
   * The model stage, injected after construction.
   *
   * It is a setter rather than a constructor argument because `index.ts` builds
   * the store and the consolidator before it can soft-probe `ctx.get('llm')`,
   * and the scheduler may already be ticking. Absent means deterministic-only,
   * which is exactly the pre-P5 behaviour.
   */
  distiller;
  constructor(store, log) {
    this.store = store;
    this.log = log;
    this.generator = new SkillGenerator(store, log);
  }
  /** Install the model stage. Called once the `llm` service is known. */
  setDistiller(distiller) {
    this.distiller = distiller;
  }
  /** True while a pass is in flight. */
  get busy() {
    return this.running;
  }
  /**
   * Run one deterministic pass.
   *
   * Returns the report even when nothing changed, because the panel shows the
   * reason ("暂无可整理的会话") rather than hiding the button's effect.
   */
  async run(reason, limit = 20) {
    const at = (/* @__PURE__ */ new Date()).toISOString();
    const report = {
      reason,
      scanned: 0,
      added: 0,
      merged: 0,
      conflicted: 0,
      archived: 0,
      questions: [],
      files: [],
      at,
      projectAdded: 0,
      projectMerged: 0,
      projectFiles: [],
      draftsCreated: [],
      draftsArchived: []
    };
    if (this.running) {
      report.questions.push("\u4E0A\u4E00\u6B21\u6574\u7406\u8FD8\u5728\u8FDB\u884C\u4E2D\uFF0C\u672C\u6B21\u5DF2\u8DF3\u8FC7\u3002");
      return report;
    }
    this.running = true;
    try {
      await this.runInner(report, limit);
    } catch (error) {
      this.log(`\u6574\u7406\u5931\u8D25\uFF1A${String(error)}`);
      report.questions.push(`\u6574\u7406\u8FC7\u7A0B\u4E2D\u51FA\u9519\uFF1A${String(error)}`);
    } finally {
      this.running = false;
    }
    return report;
  }
  /** The body of one pass. */
  async runInner(report, limit) {
    await this.store.ensure();
    const state = await this.store.readState();
    const pending = state.pending.slice(0, limit);
    const today = dayKey();
    const candidates = [];
    const projectCandidates = [];
    const consumed = [];
    for (const relative of pending) {
      const document = await this.store.readDocument(relative);
      if (document.body.trim() === "" && Object.keys(document.front).length === 0) continue;
      const date = frontString(document.front, "started", today).slice(0, 10);
      const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;
      candidates.push(...candidatesFrom(document.body, relative, day));
      const workspace = frontString(document.front, "workspace", "");
      projectCandidates.push(...extractProjectFacts(document.body, workspace, relative, day));
      consumed.push(relative);
      report.scanned += 1;
    }
    const touched = /* @__PURE__ */ new Set([
      "memory/index.md",
      ...TOPICS.map((topic) => `memory/${topic.file}`)
    ]);
    const entriesByTopic = /* @__PURE__ */ new Map();
    for (const topic of TOPICS) entriesByTopic.set(topic.key, await this.store.readEntries(topic.key));
    const before = /* @__PURE__ */ new Map();
    for (const [topic, entries] of entriesByTopic) before.set(topic, entries.map(stripLine));
    for (const candidate of candidates) {
      const topic = candidate.topic ?? "habits";
      const entries = entriesByTopic.get(topic);
      if (entries === void 0) continue;
      this.applyCandidate(entries, candidate, report);
    }
    await this.projectStage(projectCandidates, report);
    await this.distillStage(candidates, entriesByTopic, report);
    for (const topic of TOPICS) {
      const entries = entriesByTopic.get(topic.key);
      if (entries === void 0) continue;
      await this.decay(topic.key, entries, today, report);
    }
    const changedTopics = TOPICS.filter((topic) => {
      const previous = before.get(topic.key) ?? [];
      const next = entriesByTopic.get(topic.key) ?? [];
      return JSON.stringify(previous) !== JSON.stringify(next.map(stripLine));
    });
    if (changedTopics.length > 0 || consumed.length > 0) {
      await this.store.backup([...touched]);
      report.files.push(...touched);
    }
    for (const topic of changedTopics) {
      await this.store.writeEntries(topic.key, (entriesByTopic.get(topic.key) ?? []).map(stripLine));
    }
    if (changedTopics.length > 0) await this.rebuildIndex(entriesByTopic);
    await this.skillStage(report);
    if (consumed.length > 0 || changedTopics.length > 0 || report.draftsCreated.length > 0 || report.draftsArchived.length > 0) {
      await this.store.appendJournal(this.journalLines(report, consumed, changedTopics));
    }
    await this.store.patchState((current) => ({
      ...current,
      pending: current.pending.filter((relative) => !consumed.includes(relative)),
      lastConsolidateAt: report.at,
      questions: this.mergeQuestions(current.questions, report.questions),
      ...report.model === void 0 ? {} : { lastModelRun: report.model }
    }));
  }
  /**
   * Generate skill drafts and archive the stale ones (P7 §6.2 A/C).
   *
   * Two halves, in this order. Generation first, because a draft created today
   * carries today's `createdAt` and the archive pass must not immediately judge
   * it stale. The archive half is the plan's 30-day rule and is a move into
   * `archive/skills-draft/`, never a delete.
   *
   * This method must never throw. A skill draft is a bonus on top of a pass whose
   * topic writes are already on disk, and losing those to a scan hiccup would
   * trade a durable outcome for a cosmetic one.
   */
  async skillStage(report) {
    try {
      const generation = await this.generator.run(report.at);
      report.draftsCreated = generation.created;
    } catch (error) {
      this.log(`\u6280\u80FD\u8349\u7A3F\u751F\u6210\u5931\u8D25\uFF1A${String(error)}`);
    }
    try {
      report.draftsArchived = await this.store.archiveStaleDrafts();
    } catch (error) {
      this.log(`\u6280\u80FD\u8349\u7A3F\u5F52\u6863\u5931\u8D25\uFF1A${String(error)}`);
    }
  }
  /**
   * Run the model stage and fold whatever survives validation into the topics.
   *
   * This method must never throw: the deterministic result is already in memory
   * and is about to be written, and losing it because a model route was flaky
   * would be strictly worse than never having called a model at all.
   */
  async distillStage(candidates, entriesByTopic, report) {
    const distiller = this.distiller;
    if (distiller === void 0) return;
    let outcome;
    try {
      outcome = await distiller.run({ candidates, entriesByTopic });
    } catch (error) {
      this.log(`\u6A21\u578B\u63D0\u70BC\u5F02\u5E38\uFF1A${String(error)}`);
      report.model = { skippedReason: `\u6A21\u578B\u63D0\u70BC\u5F02\u5E38\uFF1A${String(error)}`, at: report.at };
      return;
    }
    report.model = {
      ...outcome.used === void 0 ? {} : { used: outcome.used },
      ...outcome.fellBackFrom === void 0 ? {} : { fellBackFrom: outcome.fellBackFrom },
      ...outcome.skippedReason === void 0 ? {} : { skippedReason: outcome.skippedReason },
      ...outcome.failures.length === 0 ? {} : { failures: outcome.failures },
      ...outcome.rejected.length === 0 ? {} : { rejected: outcome.rejected },
      tokens: outcome.tokens,
      applied: 0,
      at: report.at
    };
    for (const proposal of outcome.proposals) {
      const entries = entriesByTopic.get(proposal.topic);
      if (entries === void 0) continue;
      if (proposal.op === "update") {
        const target = entries.find((entry) => entry.id === proposal.id);
        if (target === void 0) continue;
        target.text = proposal.text;
        report.model.applied = (report.model.applied ?? 0) + 1;
        continue;
      }
      this.applyCandidate(
        entries,
        { text: proposal.text, topic: proposal.topic, source: "\u6A21\u578B\u63D0\u70BC", date: dayKey() },
        report
      );
      report.model.applied = (report.model.applied ?? 0) + 1;
    }
    for (const rejection of outcome.rejected) report.questions.push(`\u6A21\u578B\u63D0\u70BC\u88AB\u62D2\u7EDD\uFF1A${rejection}`);
  }
  /**
   * Keep the unanswered questions in `state.json` for the panel.
   *
   * A pass re-raises the same conflict every time it sees the same pair, so the
   * new list replaces the old one instead of growing without bound; the union
   * keeps a question raised by a *different* topic alive.
   */
  mergeQuestions(existing, raised) {
    const next = [...raised];
    for (const question of existing) {
      if (!next.includes(question)) next.push(question);
    }
    return next.slice(0, 50);
  }
  /**
   * File project facts into `memory/projects/<slug>.md` (P6).
   *
   * The merge path is the topic path verbatim — `applyCandidate` works on any
   * `Entry[]` — so a project fact gets the same dedupe, contradiction marking
   * and confidence ladder as a habit. The only difference is the destination
   * file, and that each project file is backed up and written independently.
   *
   * This method must never throw: a bad project line must not cost the pass
   * its topic writes.
   */
  async projectStage(candidates, report) {
    if (candidates.length === 0) return;
    const bySlug = /* @__PURE__ */ new Map();
    for (const candidate of candidates) {
      const list = bySlug.get(candidate.slug);
      if (list === void 0) bySlug.set(candidate.slug, [candidate]);
      else list.push(candidate);
    }
    for (const [slug, facts] of bySlug) {
      try {
        await this.projectApply(slug, facts, report);
      } catch (error) {
        this.log(`\u9879\u76EE\u8BB0\u5FC6 ${slug} \u6574\u7406\u5931\u8D25\uFF1A${String(error)}`);
        report.questions.push(`\u9879\u76EE\u8BB0\u5FC6 ${slug} \u6574\u7406\u5931\u8D25\uFF1A${String(error)}`);
      }
    }
  }
  /** Merge one slug's facts into its file. */
  async projectApply(slug, facts, report) {
    const entries = await this.store.readProjectEntries(slug);
    const before = JSON.stringify(entries.map(stripLine));
    const counters = { added: 0, merged: 0, questions: [] };
    for (const fact of facts) {
      this.applyProjectCandidate(entries, fact, counters);
    }
    if (JSON.stringify(entries.map(stripLine)) === before) return;
    const relative = `memory/projects/${slug}.md`;
    await this.store.backup([relative]);
    await this.store.writeProjectEntries(slug, entries.map(stripLine));
    report.projectAdded += counters.added;
    report.projectMerged += counters.merged;
    if (counters.questions.length > 0) report.questions.push(...counters.questions);
    if (!report.projectFiles.includes(relative)) report.projectFiles.push(relative);
  }
  /** `applyCandidate` against a project file's counters. */
  applyProjectCandidate(entries, candidate, counters) {
    let best;
    let bestScore = 0;
    for (const entry of entries) {
      const score = similarity(entry.text, candidate.text);
      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    }
    if (best !== void 0 && bestScore >= MERGE_THRESHOLD) {
      if (best.pinned) return;
      best.days = (/* @__PURE__ */ new Set([...corroborationDates(best), candidate.date])).size;
      best.confidence = confidenceForDays(best.days);
      if (best.last < candidate.date) best.last = candidate.date;
      if (candidate.date < best.first) best.first = candidate.date;
      if (!best.sources.includes(candidate.source)) best.sources.push(candidate.source);
      counters.merged += 1;
      return;
    }
    if (best !== void 0 && contradicts(best.text, candidate.text)) {
      if (!best.pinned) {
        best.conflict = true;
        best.sources = [.../* @__PURE__ */ new Set([...best.sources, candidate.source])];
      }
      counters.questions.push(`\u300C${truncate(best.text)}\u300D\u4E0E\u300C${truncate(candidate.text)}\u300D\u4E92\u76F8\u77DB\u76FE\uFF0C\u8BF7\u5728\u4E0B\u4E00\u6B21\u6574\u7406\u65F6\u4E8C\u9009\u4E00\u3002`);
      return;
    }
    entries.push({
      id: entryId(candidate.text),
      text: candidate.text,
      confidence: "\u4F4E",
      days: 1,
      first: candidate.date,
      last: candidate.date,
      sources: [candidate.source],
      pinned: false,
      conflict: false,
      line: entries.length
    });
    counters.added += 1;
  }
  /**
   * Fold one candidate into a topic's entry list.
   *
   * Merge when an existing entry says the same thing (similarity ≥ 0.75) or
   * contradicts it — a contradiction is merged as a *marked* conflict rather
   * than added as a third line, so the pair the user is asked about stays a
   * pair. Everything else is a new entry.
   */
  applyCandidate(entries, candidate, report) {
    let best;
    let bestScore = 0;
    for (const entry of entries) {
      const score = similarity(entry.text, candidate.text);
      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    }
    if (best !== void 0 && bestScore >= MERGE_THRESHOLD) {
      if (best.pinned) return;
      best.days = (/* @__PURE__ */ new Set([...corroborationDates(best), candidate.date])).size;
      best.confidence = confidenceForDays(best.days);
      if (best.last < candidate.date) best.last = candidate.date;
      if (candidate.date < best.first) best.first = candidate.date;
      if (!best.sources.includes(candidate.source)) best.sources.push(candidate.source);
      report.merged += 1;
      return;
    }
    if (best !== void 0 && contradicts(best.text, candidate.text)) {
      if (!best.pinned) {
        best.conflict = true;
        best.sources = [.../* @__PURE__ */ new Set([...best.sources, candidate.source])];
      }
      report.conflicted += 1;
      report.questions.push(`\u300C${truncate(best.text)}\u300D\u4E0E\u300C${truncate(candidate.text)}\u300D\u4E92\u76F8\u77DB\u76FE\uFF0C\u8BF7\u5728\u4E0B\u4E00\u6B21\u6574\u7406\u65F6\u4E8C\u9009\u4E00\u3002`);
      return;
    }
    entries.push({
      id: entryId(candidate.text),
      text: candidate.text,
      confidence: "\u4F4E",
      days: 1,
      first: candidate.date,
      last: candidate.date,
      sources: [candidate.source],
      pinned: false,
      conflict: false,
      line: entries.length
    });
    report.added += 1;
  }
  /**
   * Move stale entries into `archive/` and collect the questions.
   *
   * 高 entries are never archived, but one that has not been corroborated for
   * 180 days gets a question instead — the plan asks rather than assumes.
   */
  async decay(topic, entries, today, report) {
    const doomed = [];
    for (const entry of entries) {
      if (entry.pinned) continue;
      const age = daysBetween(entry.last, today);
      const window = DECAY_DAYS[entry.confidence];
      if (window !== null && age >= window) {
        doomed.push(entry.id);
        continue;
      }
      if (entry.confidence === "\u9AD8" && age >= STALE_QUESTION_DAYS) {
        report.questions.push(`\u300C${truncate(entry.text)}\u300D\u5DF2\u7ECF ${age} \u5929\u6CA1\u6709\u65B0\u7684\u4F50\u8BC1\u4E86\uFF0C\u8FD9\u6761\u8FD8\u6210\u7ACB\u5417\uFF1F`);
      }
    }
    if (doomed.length === 0) return;
    report.archived += await this.store.archiveEntries(topic, doomed, "decay");
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      if (doomed.includes(entries[index].id)) entries.splice(index, 1);
    }
  }
  /**
   * Rebuild `memory/index.md` from the topic files.
   *
   * Only 中 and 高 entries appear (memory-plan §5.2): the index is the part
   * that gets injected into every prompt, so a 低 candidate must not spend the
   * budget before it has been corroborated.
   */
  async rebuildIndex(entriesByTopic) {
    const document = await this.store.readDocument("memory/index.md");
    const lines = ["# \u957F\u671F\u8BB0\u5FC6", ""];
    for (const section of INDEX_SECTIONS) {
      const entries = section.key === "projects" ? [] : (entriesByTopic.get(section.key) ?? []).filter(
        (entry) => entry.confidence !== "\u4F4E" || entry.pinned
      );
      lines.push(`## ${section.title}`);
      if (entries.length === 0) {
        lines.push(INDEX_PLACEHOLDER);
      } else {
        for (const entry of entries) {
          const flags = [entry.confidence, `${entry.days} \u5929`, entry.pinned ? "pinned" : "", entry.conflict ? "\u26A0 \u51B2\u7A81" : ""].filter((part) => part !== "").join(" \xB7 ");
          lines.push(`- ${entry.text} <sub>${flags}</sub>`);
        }
      }
      lines.push("");
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const front = {
      ...document.front,
      kind: "memory-index",
      schema: 1,
      generated: now,
      updated: now,
      sources: ["habits", "background", "environment", "preferences-learned"]
    };
    await this.store.writeDocument("memory/index.md", front, lines.join("\n").trimEnd());
  }
  /** The journal lines of one pass. */
  journalLines(report, consumed, changed) {
    const lines = [
      `\u89E6\u53D1\u65B9\u5F0F\uFF1A${report.reason}`,
      `\u626B\u63CF\u4F1A\u8BDD\u7B14\u8BB0 ${report.scanned} \u4E2A\uFF08\u672C\u6B21\u6807\u8BB0\u4E3A\u5DF2\u6574\u7406 ${consumed.length} \u4E2A\uFF09`,
      `\u65B0\u589E ${report.added} \u6761 \xB7 \u5408\u5E76 ${report.merged} \u6761 \xB7 \u51B2\u7A81 ${report.conflicted} \u6761 \xB7 \u5F52\u6863 ${report.archived} \u6761`,
      `\u6539\u5199\u6587\u4EF6\uFF1A${changed.length === 0 ? "\uFF08\u65E0\uFF09" : changed.map((topic) => `memory/${topic.file}`).join("\u3001")}`,
      ...this.modelLines(report),
      ...this.projectLines(report),
      ...this.skillLines(report)
    ];
    if (report.questions.length > 0) {
      lines.push(`\u5F85\u786E\u8BA4 ${report.questions.length} \u9879\uFF1A`);
      for (const question of report.questions) lines.push(`  - ${question}`);
    }
    return lines;
  }
  /**
   * The journal's account of the model stage.
   *
   * The journal is the audit trail the user reads when they want to know what a
   * pass actually did, so it names the model, the tokens and the fallback —
   * "未启用" is only the truth when the stage really did not run.
   */
  modelLines(report) {
    const model = report.model;
    if (model === void 0) return ["\u6A21\u578B\u63D0\u70BC\uFF1A\u672A\u542F\u7528\uFF08\u786E\u5B9A\u6027\u6574\u7406\uFF09"];
    if (model.skippedReason !== void 0) return [`\u6A21\u578B\u63D0\u70BC\uFF1A\u672A\u6267\u884C\uFF08${model.skippedReason}\uFF09`];
    if (model.used === void 0) return ["\u6A21\u578B\u63D0\u70BC\uFF1A\u672A\u6267\u884C"];
    const lines = [
      `\u6A21\u578B\u63D0\u70BC\uFF1A${model.used}${model.tokens !== void 0 && model.tokens > 0 ? `\uFF08${model.tokens} token\uFF09` : ""} \xB7 \u5E94\u7528 ${model.applied ?? 0} \u6761`
    ];
    if (model.fellBackFrom !== void 0) {
      lines.push(`\u81EA\u9009\u6A21\u578B ${model.fellBackFrom} \u5931\u8D25\uFF0C\u5DF2\u56DE\u9000\u5230 ${model.used}`);
    }
    for (const failure of model.failures ?? []) lines.push(`\u5019\u9009\u5931\u8D25\uFF1A${failure}`);
    for (const rejection of model.rejected ?? []) lines.push(`\u88AB\u62D2\u7EDD\uFF1A${rejection}`);
    return lines;
  }
  /** The journal's account of the project stage (P6). */
  projectLines(report) {
    if (report.projectFiles.length === 0) return [];
    return [
      `\u9879\u76EE\u8BB0\u5FC6\uFF1A\u65B0\u589E ${report.projectAdded} \u6761 \xB7 \u5408\u5E76 ${report.projectMerged} \u6761\uFF08${report.projectFiles.join("\u3001")}\uFF09`
    ];
  }
  /**
   * The journal's account of the skill stage (P7).
   *
   * Generation is reported even when it produced nothing, because the archive
   * half usually does run: a pass that silently moved three drafts out of the
   * pending list would otherwise leave the user wondering where they went.
   */
  skillLines(report) {
    const lines = [];
    if (report.draftsCreated.length > 0) {
      lines.push(`\u6280\u80FD\u8349\u7A3F\uFF1A\u65B0\u589E ${report.draftsCreated.length} \u4EFD\uFF08${report.draftsCreated.join("\u3001")}\uFF09\u2014\u2014 \u7B49\u5F85\u4F60\u6279\u51C6`);
    }
    if (report.draftsArchived.length > 0) {
      lines.push(`\u6280\u80FD\u8349\u7A3F\uFF1A${report.draftsArchived.length} \u4EFD\u8D85\u8FC7 30 \u5929\u672A\u5904\u7406\uFF0C\u5DF2\u5F52\u6863\u5230 archive/skills-draft/`);
    }
    return lines;
  }
};
function corroborationDates(entry) {
  const dates = /* @__PURE__ */ new Set();
  if (/^\d{4}-\d{2}-\d{2}$/.test(entry.first)) dates.add(entry.first);
  if (/^\d{4}-\d{2}-\d{2}$/.test(entry.last)) dates.add(entry.last);
  return [...dates];
}
function stripLine(entry) {
  const { line: _line, ...rest } = entry;
  return rest;
}
function truncate(text, max = 40) {
  return text.length <= max ? text : `${text.slice(0, max)}\u2026`;
}

// src/host/fsx.ts
import { randomBytes } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join as join2 } from "node:path";
var TRANSIENT = /* @__PURE__ */ new Set(["EACCES", "EBUSY", "EPERM"]);
var RENAME_ATTEMPTS = 8;
var DEFAULT_LOCK_WAIT_MS = 2e3;
var LOCK_BACKOFF_MS = 20;
var LOCK_BACKOFF_MAX_MS = 200;
function sleep(ms) {
  return new Promise((resolve2) => setTimeout(resolve2, ms));
}
function hasCode(error, codes) {
  return typeof error === "object" && error !== null && codes.has(String(error.code));
}
async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}
async function ensureParent(path) {
  await mkdir(dirname(path), { recursive: true });
}
async function readTextOrUndefined(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (hasCode(error, /* @__PURE__ */ new Set(["ENOENT", "EISDIR", "ENOTDIR"]))) return void 0;
    throw error;
  }
}
async function readText(path) {
  return await readTextOrUndefined(path) ?? "";
}
async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
async function writeFileAtomic(path, content) {
  await ensureParent(path);
  const temp = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(temp, content, { encoding: "utf8", flag: "wx" });
  let lastError;
  for (let attempt = 0; attempt < RENAME_ATTEMPTS; attempt += 1) {
    try {
      await rename(temp, path);
      return;
    } catch (error) {
      lastError = error;
      if (!hasCode(error, TRANSIENT)) break;
      await sleep(Math.min(LOCK_BACKOFF_MS * 2 ** attempt, LOCK_BACKOFF_MAX_MS));
    }
  }
  await rm(temp, { force: true }).catch(() => void 0);
  throw lastError;
}
async function removeFile(path) {
  await rm(path, { force: true });
}
async function movePath(from, to) {
  let lastError;
  for (let attempt = 0; attempt < RENAME_ATTEMPTS; attempt += 1) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      lastError = error;
      if (!hasCode(error, TRANSIENT)) throw error;
      await sleep(Math.min(LOCK_BACKOFF_MS * 2 ** attempt, LOCK_BACKOFF_MAX_MS));
    }
  }
  throw lastError;
}
function processAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !hasCode(error, /* @__PURE__ */ new Set(["ESRCH"]));
  }
}
async function withFileLock(path, operation, waitMs = DEFAULT_LOCK_WAIT_MS) {
  const lockPath = `${path}.lock`;
  await ensureParent(lockPath);
  const deadline = Date.now() + waitMs;
  let backoff = LOCK_BACKOFF_MS;
  for (; ; ) {
    try {
      const handle = await open(lockPath, "wx");
      await handle.writeFile(`${process.pid}
`, "utf8");
      await handle.close();
      break;
    } catch (error) {
      if (!hasCode(error, /* @__PURE__ */ new Set(["EEXIST"]))) throw error;
      const recorded = Number.parseInt((await readTextOrUndefined(lockPath))?.trim() ?? "", 10);
      if (Number.isSafeInteger(recorded) && !processAlive(recorded)) {
        await rm(lockPath, { force: true }).catch(() => void 0);
        continue;
      }
      if (Date.now() >= deadline) throw new Error(`atomic-write: timed out waiting for the writer lock at ${lockPath}`);
      await sleep(backoff);
      backoff = Math.min(backoff * 2, LOCK_BACKOFF_MAX_MS);
    }
  }
  try {
    return await operation();
  } finally {
    await rm(lockPath, { force: true }).catch(() => void 0);
  }
}
async function listDir(path) {
  try {
    const { readdir } = await import("node:fs/promises");
    return await readdir(path);
  } catch (error) {
    if (hasCode(error, /* @__PURE__ */ new Set(["ENOENT", "ENOTDIR"]))) return [];
    throw error;
  }
}
async function mtimeIso(path) {
  try {
    return (await stat(path)).mtime.toISOString();
  } catch {
    return null;
  }
}

// src/host/model-picker.ts
import { join as join4 } from "node:path";

// src/host/dsh-home.ts
import { homedir } from "node:os";
import { isAbsolute, join as join3, resolve } from "node:path";
function expandHome(path, home = homedir()) {
  if (path === "~") return home;
  if (path.startsWith("~/") || path.startsWith("~\\")) return join3(home, path.slice(2));
  return path;
}
function resolveDshHome(env = process.env, home = homedir()) {
  const configured = env.DSH_HOME?.trim();
  if (configured !== void 0 && configured !== "") {
    const expanded = expandHome(configured, home);
    return isAbsolute(expanded) ? expanded : resolve(expanded);
  }
  return join3(home, ".dsh");
}
var MEMORY_DIR_NAME = "dsh-memorybuddy";
function resolveMemoryRoot(env = process.env) {
  return join3(resolveDshHome(env), MEMORY_DIR_NAME);
}
function resolveSkillsRoot(env = process.env) {
  return join3(resolveDshHome(env), "skills");
}

// src/host/model-picker.ts
var COOLDOWN_MINUTES = {
  quota: 6 * 60,
  missing: 24 * 60,
  auth: 24 * 60,
  network: 30,
  unknown: 30
};
var CATALOG_TTL_MS = 10 * 6e4;
var CATALOG_FILES = [".workbuddy-catalog.json", ".workbuddy-ai-catalog.json"];
var THIRD_PARTY_PROVIDERS = ["sensenova", "qwen"];
function classifyFailure(error) {
  const code = typeof error?.code === "string" ? error.code : "";
  if (code === "UNSUPPORTED_REASONING_EFFORT" || code === "INVALID_MODEL_REASONING") return "missing";
  if (code === "INVALID_PREPARED_CALL" || code === "INVALID_MODEL_INFO" || code === "INVALID_CATALOG") {
    return "unknown";
  }
  if (code === "NO_ADAPTER") return "missing";
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  if (/额度|限流|配额|欠费|rate.?limit|quota|insufficient|too many requests|429/i.test(text)) return "quota";
  if (/不存在|not found|unknown model|no such model|unsupported model|404/i.test(text)) return "missing";
  if (/认证|鉴权|未授权|unauthor|invalid.?api.?key|401|403|api key/i.test(text)) return "auth";
  if (/网络|超时|timed?\s?out|timeout|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|socket|abort/i.test(text)) {
    return "network";
  }
  return "unknown";
}
function routeKey(provider, model) {
  return `${provider}/${model}`;
}
function allows(allowed, provider, model) {
  if (allowed.length === 0) return true;
  const route = routeKey(provider, model);
  return allowed.some((entry) => entry === route || entry === model || entry === provider);
}
async function readFreeModels(dshHome) {
  const found = [];
  const now = Date.now();
  for (const file of CATALOG_FILES) {
    const raw = await readTextOrUndefined(join4(dshHome, file));
    if (raw === void 0) continue;
    try {
      const parsed = JSON.parse(raw);
      for (const [account, value] of Object.entries(parsed.entries ?? {})) {
        const provider = account.replace(/:$/, "");
        for (const model of value?.models ?? []) {
          const record = model;
          if (typeof record.id !== "string") continue;
          if (isFree(record.billing, record.promotions, now)) {
            found.push({ provider, model: record.id });
          }
        }
      }
    } catch {
    }
  }
  return found;
}
function isFree(billing, promotions, now) {
  if (billing?.free === true) return true;
  const amount = typeof billing?.credits === "string" ? Number(billing.credits.replace(/[^0-9.]/g, "")) : Number.NaN;
  if (Number.isFinite(amount) && amount === 0) return true;
  for (const promotion of promotions ?? []) {
    const record = promotion;
    const factor = typeof record.factor === "number" ? record.factor : 1;
    const start = typeof record.start === "number" ? record.start : 0;
    const end = typeof record.end === "number" ? record.end : Number.POSITIVE_INFINITY;
    if (factor === 0 && now >= start && now < end) return true;
  }
  return false;
}
var ModelPicker = class {
  dshHome;
  catalogCache;
  constructor(dshHome = resolveDshHome()) {
    this.dshHome = dshHome;
  }
  /** Drop the cached catalogue — called on `llm/adapters-updated`. */
  invalidate() {
    this.catalogCache = void 0;
  }
  /**
   * Enumerate providers and models for the panel's dropdown.
   *
   * `listModels()` is asynchronous and may hit the network, so the result is
   * cached for `CATALOG_TTL_MS` and only refreshed when the panel actually
   * expands the menu. Without the cache, opening the panel would fan out one
   * network call per provider every time.
   */
  async catalog(llm, now = Date.now()) {
    if (this.catalogCache !== void 0 && now - this.catalogCache.at < CATALOG_TTL_MS) {
      return this.catalogCache.value;
    }
    const fetchedAt = new Date(now).toISOString();
    if (llm?.listProviders === void 0) {
      const empty = { providers: [], models: [], fetchedAt, note: "\u5F53\u524D\u73AF\u5883\u6CA1\u6709\u53EF\u7528\u7684\u6A21\u578B\u670D\u52A1" };
      this.catalogCache = { at: now, value: empty };
      return empty;
    }
    let providers = [];
    try {
      providers = llm.listProviders() ?? [];
    } catch {
      providers = [];
    }
    const free = await readFreeModels(this.dshHome);
    const models = [];
    let failed = 0;
    for (const provider of providers) {
      if (llm.listModels === void 0) break;
      try {
        const listed = await llm.listModels(provider.id);
        for (const info of listed ?? []) {
          const id = typeof info.id === "string" ? info.id : "";
          if (id === "") continue;
          models.push({
            provider: provider.id,
            id,
            name: typeof info.name === "string" && info.name !== "" ? info.name : id,
            // Pair match, never the bare id (§4.4).
            free: free.some((entry) => entry.provider === provider.id && entry.model === id)
          });
        }
      } catch {
        failed += 1;
      }
    }
    const note = models.length === 0 ? failed > 0 ? "\u6A21\u578B\u5217\u8868\u62C9\u53D6\u5931\u8D25\uFF0C\u53EF\u4EE5\u624B\u586B provider/model" : "\u5F53\u524D\u73AF\u5883\u6CA1\u6709\u53EF\u7528\u7684\u6A21\u578B" : failed > 0 ? `${failed} \u4E2A provider \u7684\u6A21\u578B\u5217\u8868\u62C9\u53D6\u5931\u8D25` : void 0;
    const value = { providers, models, fetchedAt, note };
    this.catalogCache = { at: now, value };
    return value;
  }
  /** Resolve one route's capability, for the picker's validation line. */
  async validate(llm, provider, model) {
    if (provider === "" || model === "") return { ok: false, reason: "\u672A\u6307\u5B9A", efforts: [] };
    if (llm?.resolveModelInfo === void 0) return { ok: false, reason: "\u5F53\u524D\u73AF\u5883\u6CA1\u6709\u6A21\u578B\u670D\u52A1", efforts: [] };
    try {
      const info = await llm.resolveModelInfo(provider, model);
      const efforts = (info.reasoning?.efforts ?? []).map((effort) => typeof effort.id === "string" ? effort.id : "").filter((id) => id !== "");
      return {
        ok: true,
        efforts,
        defaultEffort: info.reasoning?.defaultEffort,
        contextWindow: info.context?.contextWindow
      };
    } catch (error) {
      return { ok: false, reason: classifyFailure(error), efforts: [] };
    }
  }
  /** Every cooling-down route, newest deadline first. */
  cooldowns(state, now = Date.now()) {
    const views = [];
    for (const [route, until] of Object.entries(state.modelCooldown)) {
      if (typeof until !== "number" || until <= now) continue;
      views.push({
        route,
        kind: "unknown",
        until: new Date(until).toISOString(),
        minutes: Math.ceil((until - now) / 6e4)
      });
    }
    return views.sort((left, right) => left.until.localeCompare(right.until));
  }
  /** True when the route is still cooling down. */
  cooling(state, provider, model, now = Date.now()) {
    const until = state.modelCooldown[routeKey(provider, model)];
    return typeof until === "number" && until > now;
  }
  /**
   * Build the ordered candidate chain for one pass.
   *
   * `available` is what the runtime advertises; when the caller has no
   * enumeration (headless, or the service is absent) the chain falls back to
   * the user's pick plus the free tier, which are both known without it.
   */
  async chain(input) {
    const now = input.now ?? Date.now();
    const { preferences, cooldown } = input;
    const policy = preferences.modelPolicy;
    const allowed = preferences.modelAllowlist;
    if (policy === "off") return { chain: [], skipped: "\u5DF2\u5173\u95ED\u6A21\u578B\u63D0\u70BC" };
    const free = await readFreeModels(this.dshHome);
    const seen = /* @__PURE__ */ new Set();
    const chain = [];
    const push = (route) => {
      const key = routeKey(route.provider, route.model);
      if (route.provider === "" || route.model === "") return;
      if (seen.has(key)) return;
      if (!allows(allowed, route.provider, route.model)) return;
      if (this.cooling({ modelCooldown: cooldown }, route.provider, route.model, now)) return;
      seen.add(key);
      chain.push(route);
    };
    const choiceProvider = preferences.modelChoiceProvider.trim();
    const choiceModel = preferences.modelChoiceModel.trim();
    const choiceUsable = choiceProvider !== "" && choiceModel !== "";
    if (choiceUsable) {
      const effort = preferences.modelChoiceEffort.trim();
      push({ provider: choiceProvider, model: choiceModel, effort: effort === "" ? void 0 : effort, source: "choice" });
    }
    if (policy === "free-first" || policy === "session-default") {
      const listed = new Set(input.available.map((item) => routeKey(item.provider, item.id)));
      const usable = free.filter(
        (entry) => (
          // A catalogue may name an account the runtime no longer routes; when we
          // have an enumeration, trust it.
          listed.size === 0 || listed.has(routeKey(entry.provider, entry.model))
        )
      );
      for (const entry of usable) push({ provider: entry.provider, model: entry.model, source: "free" });
    }
    for (const provider of input.available) {
      if (!THIRD_PARTY_PROVIDERS.includes(provider.provider)) continue;
      push({ provider: provider.provider, model: provider.id, source: "third-party" });
    }
    if (input.sessionDefault !== void 0) {
      push({
        provider: input.sessionDefault.provider,
        model: input.sessionDefault.model,
        source: "session-default"
      });
    }
    for (const provider of input.available) push({ provider: provider.provider, model: provider.id, source: "any" });
    if (chain.length === 0) {
      const why = choiceUsable && !allows(allowed, choiceProvider, choiceModel) ? "\u4F60\u9009\u7684\u6A21\u578B\u4E0D\u5728\u767D\u540D\u5355\u91CC" : "\u6CA1\u6709\u53EF\u7528\u7684\u6A21\u578B\uFF08\u6216\u90FD\u5728\u51B7\u5374\u4E2D\uFF09";
      return { chain, skipped: why };
    }
    return { chain };
  }
};

// src/host/distill.ts
var CALL_TIMEOUT_MS = 45e3;
var TOTAL_BUDGET_MS = 6e4;
var MAX_ATTEMPTS = 2;
var TEMPERATURE = 0;
var MAX_OUTPUT_TOKENS = 2048;
var SYSTEM_PROMPT = [
  "\u4F60\u662F\u957F\u671F\u8BB0\u5FC6\u6574\u7406\u5668\u3002\u4F60\u53EA\u8F93\u51FA JSON\uFF0C\u4E0D\u8F93\u51FA\u4EFB\u4F55\u89E3\u91CA\u3001\u524D\u8A00\u6216 Markdown \u4EE3\u7801\u5757\u3002",
  "\u8F93\u5165\u4F1A\u7ED9\u4F60\uFF1A\u82E5\u5E72\u6761\u300C\u5019\u9009\u300D\uFF08\u4ECE\u4F1A\u8BDD\u91CC\u6458\u51FA\u6765\u7684\u539F\u8BDD\uFF09\u4E0E\u5F53\u524D\u5DF2\u5B58\u5728\u7684\u8BB0\u5FC6\u6761\u76EE\uFF08\u5E26 id\uFF09\u3002",
  "\u4F60\u7684\u4EFB\u52A1\u662F\u628A\u5019\u9009\u6574\u7406\u6210\u6761\u76EE\uFF0C\u89C4\u5219\uFF1A",
  '1. \u53EA\u8F93\u51FA JSON \u5BF9\u8C61\uFF0C\u5F62\u5982 {"ops":[{"op":"add","topic":"habits","text":"..."}]}\u3002',
  '2. op \u53EA\u80FD\u662F "add" \u6216 "update"\u3002',
  '3. "add" \u7528\u4E8E\u65B0\u4E8B\u5B9E\uFF0C\u5FC5\u987B\u7ED9 topic\uFF08background / habits / environment / preferences-learned\uFF09\u4E0E text\u3002',
  '4. "update" \u7528\u4E8E\u4FEE\u8BA2\u5DF2\u6709\u6761\u76EE\uFF0C\u5FC5\u987B\u7ED9 id\u3001anchor \u4E0E text\u3002anchor \u5FC5\u987B\u4E0E\u5DF2\u6709\u6761\u76EE\u6587\u672C**\u9010\u5B57\u76F8\u540C**\uFF0C\u5426\u5219\u8BE5\u6761\u4F5C\u5E9F\u3002',
  "5. text \u7528\u7B2C\u4E09\u4EBA\u79F0\u9648\u8FF0\u53E5\uFF0C\u4E00\u53E5\u8BDD\u8BF4\u5B8C\uFF0C\u4E0D\u8981\u5E8F\u53F7\u3001\u4E0D\u8981\u5F15\u53F7\u3001\u4E0D\u8981\u300C\u7528\u6237\u8BF4\u300D\u3002",
  "6. \u4E0D\u8981\u81C6\u6D4B\uFF1A\u5019\u9009\u91CC\u6CA1\u6709\u7684\u4FE1\u606F\u4E00\u5F8B\u4E0D\u8981\u5199\u3002\u5B81\u53EF\u5C11\u5199\u3002",
  "7. \u5019\u9009\u91CC\u7684\u5BC6\u94A5\u3001\u53E3\u4EE4\u3001\u8EAB\u4EFD\u8BC1\u3001\u94F6\u884C\u5361\u3001\u624B\u673A\u53F7\u4E00\u5F8B\u4E0D\u8981\u5199\u8FDB text\u3002",
  '8. \u5982\u679C\u5019\u9009\u90FD\u662F\u7410\u788E\u5185\u5BB9\u3001\u6CA1\u6709\u4EFB\u4F55\u503C\u5F97\u957F\u671F\u8BB0\u4F4F\u7684\u4E8B\u5B9E\uFF0C\u8F93\u51FA {"ops":[]}\u3002'
].join("\n");
async function openStream(llm, config, request) {
  if (typeof llm.prepareCall === "function") {
    const handle = await llm.prepareCall(config, request.signal);
    return handle.stream({
      ...handle.config,
      messages: request.messages,
      system: request.system,
      signal: request.signal
    });
  }
  if (typeof llm.stream === "function") {
    return llm.stream({ ...config, messages: request.messages, system: request.system, signal: request.signal });
  }
  throw new Error("llm \u670D\u52A1\u4E0D\u652F\u6301\u6D41\u5F0F\u8C03\u7528");
}
async function withBudget(step, ms) {
  if (ms <= 0) return { budget: true };
  let timer;
  try {
    return await Promise.race([
      step().then((value) => ({ value })),
      new Promise((resolve2) => {
        timer = setTimeout(() => resolve2({ budget: true }), ms);
      })
    ]);
  } finally {
    if (timer !== void 0) clearTimeout(timer);
  }
}
async function collect(stream) {
  let text = "";
  let tokens = 0;
  for await (const raw of stream) {
    const chunk = raw;
    if (chunk.type === "text-delta" && typeof chunk.text === "string") text += chunk.text;
    if (chunk.type === "usage" && chunk.usage !== void 0) {
      const usage = chunk.usage;
      tokens = typeof usage.totalTokens === "number" ? usage.totalTokens : (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
    }
    if (chunk.type === "finish") {
      const kind = chunk.reason?.kind;
      if (kind === "error" || kind === "aborted") {
        const failure = chunk.reason?.failure;
        const message = typeof failure === "object" && failure !== null ? JSON.stringify(failure).slice(0, 300) : String(kind);
        throw new Error(`\u6A21\u578B\u8C03\u7528\u5931\u8D25\uFF1A${message}`);
      }
    }
  }
  return { text, tokens };
}
function buildInput(candidates, entriesByTopic) {
  const lines = ["# \u5019\u9009"];
  if (candidates.length === 0) lines.push("\uFF08\u65E0\uFF09");
  for (const candidate of candidates) {
    lines.push(`- (${candidate.topic ?? "habits"}) ${candidate.text}`);
  }
  lines.push("", "# \u5DF2\u6709\u6761\u76EE");
  let any = false;
  for (const topic of TOPICS) {
    const entries = entriesByTopic.get(topic.key) ?? [];
    if (entries.length === 0) continue;
    lines.push(`## ${topic.title}`);
    for (const entry of entries) {
      any = true;
      lines.push(`- [${entry.id}] (${entry.confidence} \xB7 ${entry.days} \u5929) ${entry.text}`);
    }
  }
  if (!any) lines.push("\uFF08\u65E0\uFF09");
  let body = lines.join("\n");
  let truncated = false;
  if (Buffer.byteLength(body, "utf8") > MAX_INPUT_BYTES) {
    const kept = [];
    let bytes = 0;
    for (const line of lines) {
      const size = Buffer.byteLength(`${line}
`, "utf8");
      if (bytes + size > MAX_INPUT_BYTES) break;
      kept.push(line);
      bytes += size;
    }
    body = kept.join("\n");
    truncated = true;
  }
  const messages = [{ role: "user", content: [{ type: "text", text: body }] }];
  return { messages, bytes: Buffer.byteLength(body, "utf8"), truncated };
}
function isolateJson(raw) {
  const trimmed = raw.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const body = fenced !== null ? fenced[1].trim() : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return void 0;
  return body.slice(start, end + 1);
}
function parseOperations(raw) {
  const json = isolateJson(raw);
  if (json === void 0) return void 0;
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    return void 0;
  }
  if (typeof parsed !== "object" || parsed === null) return void 0;
  const ops = parsed.ops;
  if (!Array.isArray(ops)) return void 0;
  const result = [];
  for (const item of ops) {
    if (typeof item !== "object" || item === null) continue;
    const record = item;
    const op = record.op;
    const text = typeof record.text === "string" ? record.text.trim() : "";
    if (text === "") continue;
    if (op === "add") {
      const topic = typeof record.topic === "string" ? record.topic : "";
      const known = TOPICS.find((entry) => entry.key === topic);
      if (known === void 0) continue;
      result.push({ op: "add", topic: known.key, text });
      continue;
    }
    if (op === "update") {
      const id = typeof record.id === "string" ? record.id.trim() : "";
      const anchor = typeof record.anchor === "string" ? record.anchor.trim() : "";
      if (id === "" || anchor === "") continue;
      result.push({ op: "update", id, anchor, text });
    }
  }
  return result;
}
function validate(operations, entriesByTopic) {
  const byId = /* @__PURE__ */ new Map();
  for (const [topic, entries] of entriesByTopic) {
    for (const entry of entries) byId.set(entry.id, { entry, topic });
  }
  const proposals = [];
  const rejected = [];
  const seen = /* @__PURE__ */ new Set();
  for (const operation of operations) {
    const text = operation.text.trim();
    if (text === "") continue;
    if (operation.op === "add") {
      const topic = operation.topic ?? "habits";
      const key2 = `${topic}:${text}`;
      if (seen.has(key2)) continue;
      seen.add(key2);
      proposals.push({ op: "add", topic, text });
      continue;
    }
    const found = byId.get(operation.id);
    if (found === void 0) {
      rejected.push(`\u6A21\u578B\u5F15\u7528\u4E86\u4E0D\u5B58\u5728\u7684\u6761\u76EE ${operation.id}`);
      continue;
    }
    if (found.entry.pinned) {
      rejected.push(`\u6761\u76EE ${operation.id} \u5DF2\u88AB\u624B\u5DE5\u56FA\u5B9A\uFF0C\u6A21\u578B\u6539\u5199\u88AB\u5FFD\u7565`);
      continue;
    }
    if (found.entry.text.trim() !== operation.anchor.trim()) {
      rejected.push(`\u6A21\u578B\u5BF9\u6761\u76EE ${operation.id} \u7684\u9010\u5B57\u951A\u70B9\u4E0D\u5339\u914D\uFF0C\u8BE5\u6761\u6539\u5199\u88AB\u5FFD\u7565`);
      continue;
    }
    if (similarity(found.entry.text, text) >= 0.99) continue;
    const key = `${found.topic}:${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    proposals.push({ op: "update", id: operation.id, anchor: operation.anchor, topic: found.topic, text });
  }
  return { proposals, rejected };
}
var Distiller = class {
  host;
  constructor(host) {
    this.host = host;
  }
  /**
   * Try the candidate chain until one route produces a usable diff.
   *
   * `llm` being absent is a normal state (headless profiles, a stripped
   * composition), not an error: the stage reports why it was skipped and the
   * deterministic result stands.
   */
  async run(input) {
    const outcome = { proposals: [], rejected: [], tokens: 0, failures: [] };
    let resolved;
    try {
      resolved = await this.host.routes();
    } catch (error) {
      outcome.skippedReason = `\u65E0\u6CD5\u89E3\u6790\u5019\u9009\u6A21\u578B\uFF1A${String(error)}`;
      return outcome;
    }
    if (resolved.skippedReason !== void 0) {
      outcome.skippedReason = resolved.skippedReason;
      return outcome;
    }
    if (resolved.llm === void 0) {
      outcome.skippedReason = "\u5F53\u524D\u73AF\u5883\u6CA1\u6709 llm \u670D\u52A1";
      return outcome;
    }
    if (resolved.chain.length === 0) {
      outcome.skippedReason = "\u6CA1\u6709\u53EF\u7528\u7684\u6A21\u578B";
      return outcome;
    }
    const built = buildInput(input.candidates, input.entriesByTopic);
    const started = Date.now();
    const choice = resolved.chain[0]?.source === "choice" ? resolved.chain[0] : void 0;
    const pending = [...resolved.chain.slice(0, MAX_ATTEMPTS)];
    let attempted = 0;
    while (pending.length > 0 && attempted < MAX_ATTEMPTS) {
      const route = pending.shift();
      if (route === void 0) break;
      attempted += 1;
      const remaining = TOTAL_BUDGET_MS - (Date.now() - started);
      if (remaining <= 0) {
        outcome.skippedReason = "\u6A21\u578B\u63D0\u70BC\u8D85\u51FA\u603B\u9884\u7B97\uFF0C\u672C\u8F6E\u653E\u5F03";
        return outcome;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(CALL_TIMEOUT_MS, remaining));
      timer.unref?.();
      const routeName = `${route.provider}/${route.model}`;
      try {
        const config = {
          provider: route.provider,
          model: route.model,
          temperature: TEMPERATURE,
          maxTokens: MAX_OUTPUT_TOKENS
        };
        if (route.effort !== void 0 && route.effort !== "") config.reasoningEffort = route.effort;
        const raced = await withBudget(
          async () => {
            const stream = await openStream(resolved.llm, config, {
              messages: built.messages,
              system: SYSTEM_PROMPT,
              signal: controller.signal
            });
            return collect(stream);
          },
          Math.min(CALL_TIMEOUT_MS, remaining)
        );
        if ("budget" in raced) {
          outcome.skippedReason = "\u6A21\u578B\u63D0\u70BC\u8D85\u51FA\u603B\u9884\u7B97\uFF0C\u672C\u8F6E\u653E\u5F03";
          this.host.log(`\u6A21\u578B ${routeName} \u8C03\u7528\u8D85\u51FA\u603B\u9884\u7B97\uFF0C\u672C\u8F6E\u653E\u5F03`);
          return outcome;
        }
        const collected = raced.value;
        const operations = parseOperations(collected.text);
        if (operations === void 0) {
          outcome.failures.push(`${routeName}\uFF1A\u8F93\u51FA\u4E0D\u662F\u53EF\u89E3\u6790\u7684 JSON diff`);
          this.host.log(`\u6A21\u578B ${routeName} \u7684\u8F93\u51FA\u4E0D\u662F\u53EF\u89E3\u6790\u7684 JSON diff\uFF0C\u5DF2\u6362\u4E0B\u4E00\u4E2A\u5019\u9009`);
          await this.host.cooldown.record(route.provider, route.model, "unknown");
          continue;
        }
        const checked = validate(operations, input.entriesByTopic);
        outcome.proposals = checked.proposals;
        outcome.rejected = checked.rejected;
        outcome.tokens = collected.tokens;
        outcome.used = routeName;
        const firstKey = `${choice?.provider ?? ""}/${choice?.model ?? ""}`;
        if (choice !== void 0 && routeKey(route.provider, route.model) !== firstKey) {
          outcome.fellBackFrom = firstKey;
        }
        await this.host.cooldown.clear(route.provider, route.model);
        return outcome;
      } catch (error) {
        const kind = classifyFailure(error);
        if (kind === "missing" && route.effort !== void 0 && route.effort !== "" && isEffortRefusal(error)) {
          this.host.log(`\u6A21\u578B ${routeName} \u4E0D\u652F\u6301\u6863\u4F4D ${route.effort}\uFF0C\u6539\u7528\u6A21\u578B\u9ED8\u8BA4\u6863\u4F4D\u91CD\u8BD5`);
          outcome.failures.push(`${routeName}\uFF1A\u6863\u4F4D ${route.effort} \u4E0D\u53D7\u652F\u6301\uFF0C\u5DF2\u6539\u7528\u9ED8\u8BA4\u6863\u4F4D`);
          pending.unshift({ ...route, effort: void 0 });
          clearTimeout(timer);
          continue;
        }
        outcome.failures.push(`${routeName}\uFF1A${kind}`);
        this.host.log(`\u6A21\u578B ${routeName} \u8C03\u7528\u5931\u8D25\uFF08${kind}\uFF09\uFF1A${String(error)}`);
        await this.host.cooldown.record(route.provider, route.model, kind);
      } finally {
        clearTimeout(timer);
      }
    }
    outcome.skippedReason = `\u6240\u6709\u5019\u9009\u6A21\u578B\u90FD\u5931\u8D25\u4E86\uFF08\u6700\u540E\u4E00\u6B21\uFF1A${outcome.failures[outcome.failures.length - 1] ?? "\u672A\u77E5"}\uFF09`;
    return outcome;
  }
};
function isEffortRefusal(error) {
  const code = typeof error?.code === "string" ? error.code : "";
  if (code === "UNSUPPORTED_REASONING_EFFORT" || code === "INVALID_MODEL_REASONING") return true;
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return /unsupported reasoning|invalid model reasoning|unknown reasoning effort|reasoning effort/i.test(text);
}

// src/host/mount-once.ts
var MOUNTED = Symbol.for("dsh-web.mounted-plugins");
var WAITERS = Symbol.for("dsh-web.mounted-plugins.waiters");
function mountedSet() {
  const scope = globalThis;
  const existing = scope[MOUNTED];
  if (existing instanceof Set) return existing;
  const created = /* @__PURE__ */ new Set();
  scope[MOUNTED] = created;
  return created;
}
function waiterQueue() {
  const scope = globalThis;
  const existing = scope[WAITERS];
  if (Array.isArray(existing)) return existing;
  const created = [];
  scope[WAITERS] = created;
  return created;
}
function mountOnce(packageName, fn) {
  const mounted = mountedSet();
  const queue = waiterQueue();
  return function guarded(...args) {
    const ctx = args[0];
    const mount = () => {
      mounted.add(packageName);
      let dispose;
      try {
        dispose = fn.apply(this, args);
      } catch (error) {
        mounted.delete(packageName);
        throw error;
      }
      if (typeof dispose !== "function") return dispose;
      return () => {
        try {
          ;
          dispose();
        } finally {
          mounted.delete(packageName);
          for (const waiter of queue.splice(0)) {
            queueMicrotask(() => {
              waiter.run();
            });
          }
        }
      };
    };
    if (!mounted.has(packageName)) return mount();
    let alive = true;
    const pending = {
      run: () => {
        if (alive) mount();
      }
    };
    queue.push(pending);
    try {
      ctx?.effect?.(() => () => {
        alive = false;
        const index = queue.indexOf(pending);
        if (index >= 0) queue.splice(index, 1);
      }, `${packageName}: mount waiter`);
    } catch {
    }
    return void 0;
  };
}

// src/host/http.ts
var DEFAULT_BODY_LIMIT = 64 * 1024;
var JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "referrer-policy": "no-referrer",
  "cache-control": "no-store"
};
function asJsonObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return void 0;
  return value;
}
async function readJsonBody(request, options = {}) {
  const maxBytes = options.maxBytes ?? DEFAULT_BODY_LIMIT;
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > maxBytes) {
      request.destroy();
      return void 0;
    }
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (text === "") return void 0;
  try {
    return JSON.parse(text);
  } catch {
    return void 0;
  }
}
function writeJson(response, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  response.writeHead(status, { ...JSON_HEADERS, ...headers });
  response.end(payload);
}
function isJsonRequest(request) {
  const contentType = request.headers["content-type"] ?? "";
  return contentType.toLowerCase().startsWith("application/json");
}

// src/host/loopback.ts
import { isIP } from "node:net";
function isIPv4Loopback(value) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value);
  if (match === null) return false;
  return Number(match[1]) === 127;
}
function isLoopbackAddress(address) {
  if (address === void 0 || address === "") return false;
  const normalized = address.startsWith("::ffff:") ? address.slice(7) : address;
  if (normalized === "::1") return true;
  if (isIP(normalized) === 4) return isIPv4Loopback(normalized);
  return false;
}
function isLoopbackHostname(hostname) {
  const bare = hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  if (bare === "localhost") return true;
  if (bare === "::1") return true;
  if (isIP(bare) === 4) return isIPv4Loopback(bare);
  return false;
}
function isLoopbackRequest(request) {
  if (!isLoopbackAddress(request.socket.remoteAddress ?? void 0)) return false;
  const host = request.headers.host;
  if (typeof host !== "string") return false;
  let hostUrl;
  try {
    hostUrl = new URL(`http://${host}`);
  } catch {
    return false;
  }
  if (!isLoopbackHostname(hostUrl.hostname)) return false;
  if (request.headers["sec-fetch-site"] === "cross-site") return false;
  const origin = request.headers.origin;
  if (typeof origin !== "string" || origin === "") return true;
  try {
    return new URL(origin).host === hostUrl.host;
  } catch {
    return false;
  }
}

// src/host/routes.ts
var BROWSER_AUTH_COOKIE_PREFIX = "dsh-auth-";
var ACTION_LIMIT = 64 * 1024;
var SAVE_LIMIT = 1024 * 1024;
function carriesBrowserAuthCookie(header) {
  if (typeof header !== "string" || header === "") return false;
  for (const segment of header.split(";")) {
    if (segment.trim().startsWith(BROWSER_AUTH_COOKIE_PREFIX)) return true;
  }
  return false;
}
function browserSameOriginMarker(request) {
  if (request.headers["sec-fetch-site"] === "same-origin") return true;
  if (typeof request.headers.origin === "string") return true;
  return carriesBrowserAuthCookie(request.headers.cookie);
}
function isTrustedMemoryRequest(request) {
  if (!browserSameOriginMarker(request)) return false;
  if (isLoopbackRequest(request)) return true;
  return isLoopbackAddress(request.socket.remoteAddress ?? void 0) && carriesBrowserAuthCookie(request.headers.cookie);
}
function memoryRoutes(host) {
  const guard = (request, response) => {
    if (isTrustedMemoryRequest(request)) return true;
    writeJson(response, 403, { ok: false, error: "forbidden" });
    return false;
  };
  const withRuntime = async (snapshot) => {
    if (host.runtime === void 0) {
      return { ...snapshot, runtime: { running: host.consolidator.busy } };
    }
    try {
      return { ...snapshot, runtime: await host.runtime() };
    } catch (error) {
      host.log(`\u8BFB\u53D6\u8FD0\u884C\u65F6\u72B6\u6001\u5931\u8D25\uFF1A${String(error)}`);
      return { ...snapshot, runtime: { running: host.consolidator.busy } };
    }
  };
  return [
    {
      kind: "exact",
      path: `${API_PREFIX}/state`,
      handler: async (request, response) => {
        if (request.method !== "GET") return writeJson(response, 405, { ok: false, error: "method-not-allowed" });
        if (!guard(request, response)) return;
        writeJson(response, 200, await withRuntime(await host.store.snapshot()));
      }
    },
    {
      kind: "exact",
      path: `${API_PREFIX}/models`,
      handler: async (request, response) => {
        if (request.method !== "GET") return writeJson(response, 405, { ok: false, error: "method-not-allowed" });
        if (!guard(request, response)) return;
        if (host.catalog === void 0) {
          const empty = {
            providers: [],
            models: [],
            fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
            note: "\u5F53\u524D\u73AF\u5883\u6CA1\u6709\u53EF\u7528\u7684\u6A21\u578B\u670D\u52A1"
          };
          return writeJson(response, 200, { ok: true, catalog: empty });
        }
        try {
          writeJson(response, 200, { ok: true, catalog: await host.catalog() });
        } catch (error) {
          host.log(`\u679A\u4E3E\u6A21\u578B\u5931\u8D25\uFF1A${String(error)}`);
          writeJson(response, 200, {
            ok: true,
            catalog: { providers: [], models: [], fetchedAt: (/* @__PURE__ */ new Date()).toISOString(), note: String(error) }
          });
        }
      }
    },
    {
      kind: "exact",
      path: `${API_PREFIX}/consolidate-status`,
      handler: async (request, response) => {
        if (request.method !== "GET") return writeJson(response, 405, { ok: false, error: "method-not-allowed" });
        if (!guard(request, response)) return;
        const snapshot = await host.store.snapshot();
        writeJson(response, 200, {
          ok: true,
          running: host.consolidator.busy,
          revision: snapshot.revision,
          consolidation: snapshot.consolidation,
          questions: snapshot.questions,
          history: snapshot.history,
          pending: snapshot.sessions.pending
        });
      }
    },
    {
      kind: "exact",
      path: `${API_PREFIX}/save`,
      handler: async (request, response) => {
        if (request.method !== "POST") return writeJson(response, 405, { ok: false, error: "method-not-allowed" });
        if (!guard(request, response)) return;
        if (!isJsonRequest(request)) return writeJson(response, 415, { ok: false, error: "json-required" });
        const body = asJsonObject(await readJsonBody(request, { maxBytes: SAVE_LIMIT }));
        if (body === void 0) return writeJson(response, 400, { ok: false, error: "invalid-body" });
        const path = typeof body.path === "string" ? body.path : "";
        const text = typeof body.text === "string" ? body.text : "";
        const revision = typeof body.revision === "string" ? body.revision : "";
        if (path === "") return writeJson(response, 400, { ok: false, error: "invalid-path" });
        const outcome = await host.store.saveDocument(path, text, revision);
        if (!outcome.ok) {
          return writeJson(response, 409, {
            ok: false,
            error: "conflict",
            path,
            text: outcome.text,
            revision: outcome.revision
          });
        }
        host.onChanged();
        writeJson(response, 200, { ok: true, snapshot: await withRuntime(await host.store.snapshot()) });
      }
    },
    {
      kind: "exact",
      path: `${API_PREFIX}/preferences`,
      handler: async (request, response) => {
        if (request.method !== "POST") return writeJson(response, 405, { ok: false, error: "method-not-allowed" });
        if (!guard(request, response)) return;
        if (!isJsonRequest(request)) return writeJson(response, 415, { ok: false, error: "json-required" });
        const body = asJsonObject(await readJsonBody(request, { maxBytes: ACTION_LIMIT }));
        if (body === void 0) return writeJson(response, 400, { ok: false, error: "invalid-body" });
        const patch = asJsonObject(body.patch);
        if (patch === void 0) return writeJson(response, 400, { ok: false, error: "invalid-patch" });
        await host.store.patchPreferences({ patch });
        host.onChanged();
        writeJson(response, 200, { ok: true, snapshot: await withRuntime(await host.store.snapshot()) });
      }
    },
    {
      kind: "exact",
      path: `${API_PREFIX}/draft`,
      handler: async (request, response) => {
        if (request.method !== "GET") return writeJson(response, 405, { ok: false, error: "method-not-allowed" });
        if (!guard(request, response)) return;
        const url = new URL(request.url ?? "/", "http://localhost");
        const draft = await host.store.readDraft(url.searchParams.get("name") ?? "");
        if (draft === void 0) return writeJson(response, 404, { ok: false, error: "draft-not-found" });
        writeJson(response, 200, { ok: true, draft });
      }
    },
    {
      kind: "exact",
      path: `${API_PREFIX}/journal`,
      handler: async (request, response) => {
        if (request.method !== "GET") return writeJson(response, 405, { ok: false, error: "method-not-allowed" });
        if (!guard(request, response)) return;
        const url = new URL(request.url ?? "/", "http://localhost");
        const date = url.searchParams.get("date") ?? "";
        const journal = await host.store.readJournal(date);
        writeJson(response, 200, { ok: true, journal });
      }
    },
    {
      kind: "exact",
      path: `${API_PREFIX}/action`,
      handler: async (request, response) => {
        if (request.method !== "POST") return writeJson(response, 405, { ok: false, error: "method-not-allowed" });
        if (!guard(request, response)) return;
        if (!isJsonRequest(request)) return writeJson(response, 415, { ok: false, error: "json-required" });
        const body = asJsonObject(await readJsonBody(request, { maxBytes: ACTION_LIMIT }));
        if (body === void 0) return writeJson(response, 400, { ok: false, error: "invalid-body" });
        const action = body.action;
        const record = asRecord(action);
        if (record === void 0 || typeof record.kind !== "string") {
          return writeJson(response, 400, { ok: false, error: "invalid-action" });
        }
        if (record.kind === "consolidate") {
          const started = host.consolidator.busy ? false : true;
          if (started) {
            void host.consolidator.run("\u624B\u52A8\u6574\u7406").then((report) => {
              host.onChanged();
              host.log(`\u624B\u52A8\u6574\u7406\u5B8C\u6210\uFF1A\u65B0\u589E ${report.added} \xB7 \u5408\u5E76 ${report.merged} \xB7 \u5F52\u6863 ${report.archived}`);
            }).catch((error) => {
              host.log(`\u624B\u52A8\u6574\u7406\u5931\u8D25\uFF1A${String(error)}`);
            });
          }
          return writeJson(response, 202, {
            ok: true,
            result: { started, reason: started ? void 0 : "\u4E0A\u4E00\u6B21\u6574\u7406\u8FD8\u5728\u8FDB\u884C\u4E2D" },
            snapshot: await withRuntime(await host.store.snapshot())
          });
        }
        try {
          const result = await runAction(host, record);
          host.onChanged();
          if (record.kind === "wipe-all") {
            return writeJson(response, 200, { ok: true, result, wiped: true });
          }
          writeJson(response, 200, { ok: true, result, snapshot: await withRuntime(await host.store.snapshot()) });
        } catch (error) {
          host.log(`\u52A8\u4F5C\u5931\u8D25\uFF1A${String(error)}`);
          writeJson(response, 500, { ok: false, error: String(error) });
        }
      }
    }
  ];
}
async function runAction(host, action) {
  switch (action.kind) {
    case "reset-document":
      await host.store.resetDocument(action.path);
      return { path: action.path };
    case "reset-all":
      return await host.store.resetAll();
    case "wipe-all": {
      const confirmed = typeof action.confirm === "string" ? action.confirm : "";
      host.forgetSessions?.();
      const result = await host.store.wipeAll(confirmed);
      host.log(`\u5F7B\u5E95\u5220\u9664\u5B8C\u6210\uFF1A\u8BB0\u5FC6\u6839\u4E0E ${result.skills.length} \u4E2A\u6280\u80FD\u5DF2\u5220\u9664`);
      return result;
    }
    case "forget-entry":
      return { removed: await host.store.editEntry(action.topic, action.id, { remove: true }) };
    case "pin-entry":
      return { pinned: await host.store.editEntry(action.topic, action.id, { pinned: action.pinned }) };
    case "dismiss-question":
      return { dismissed: await host.store.dismissQuestion(action.index) };
    case "rollback":
      return await host.store.rollback(action.date);
    case "approve-draft":
      return {
        approved: await host.store.approveDraft(
          action.name,
          typeof action.text === "string" ? action.text : void 0
        )
      };
    case "ignore-draft":
      return { ignored: await host.store.ignoreDraft(action.name) };
    case "forget-project":
      return { forgotten: await host.store.archiveProject(action.slug) };
    default:
      return { ignored: true };
  }
}

// src/host/schedule.ts
var STARTUP_DELAY_MS = 9e4;
var TICK_MS = 3e4;
var SESSION_END_DEBOUNCE_MS = 15e3;
var ConsolidationScheduler = class {
  host;
  startupDelayMs;
  tickMs;
  sessionEndDebounceMs;
  now;
  startupTimer = null;
  tickTimer = null;
  sessionEndTimer = null;
  running = false;
  lastActivity;
  lastFixedDay = "";
  stopped = true;
  constructor(host, options = {}) {
    this.host = host;
    this.startupDelayMs = options.startupDelayMs ?? STARTUP_DELAY_MS;
    this.tickMs = options.tickMs ?? TICK_MS;
    this.sessionEndDebounceMs = options.sessionEndDebounceMs ?? SESSION_END_DEBOUNCE_MS;
    this.now = options.now ?? (() => Date.now());
    this.lastActivity = this.now();
  }
  /** Arm the startup catch-up and the periodic ticker. */
  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.lastActivity = this.now();
    const mode = this.host.preferences().consolidateOn;
    if (mode === "startup-idle") {
      this.startupTimer = setTimeout(() => {
        this.startupTimer = null;
        void this.fire("\u542F\u52A8\u8865\u9F50");
      }, this.startupDelayMs);
      this.startupTimer.unref?.();
    }
    this.tickTimer = setInterval(() => {
      void this.tick();
    }, this.tickMs);
    this.tickTimer.unref?.();
  }
  /** Record session activity, pushing the idle trigger back. */
  touch() {
    this.lastActivity = this.now();
  }
  /**
   * A session reached a persistence checkpoint or went away.
   *
   * The plan calls this "session end"; the runtime has no such event, so the
   * caller feeds both `session/flush` and `session/disposed` here and the
   * debounce below collapses a burst into one pass.
   */
  sessionEnded() {
    if (this.stopped) return;
    if (this.host.preferences().consolidateOn !== "session-end") return;
    if (this.sessionEndTimer !== null) clearTimeout(this.sessionEndTimer);
    this.sessionEndTimer = setTimeout(() => {
      this.sessionEndTimer = null;
      void this.fire("\u4F1A\u8BDD\u7ED3\u675F");
    }, this.sessionEndDebounceMs);
    this.sessionEndTimer.unref?.();
  }
  /** Release every timer. Safe to call twice, and safe before `start()`. */
  stop() {
    this.stopped = true;
    for (const timer of [this.startupTimer, this.tickTimer, this.sessionEndTimer]) {
      if (timer !== null) clearTimeout(timer);
    }
    this.startupTimer = null;
    this.tickTimer = null;
    this.sessionEndTimer = null;
  }
  /** True while a pass started by this scheduler is in flight. */
  get busy() {
    return this.running;
  }
  /** One tick: the idle trigger, then the fixed-time trigger. */
  async tick() {
    if (this.stopped) return;
    const preferences = this.host.preferences();
    if (preferences.consolidateOn === "startup-idle" || preferences.consolidateOn === "idle") {
      const idleMs = Math.max(1, preferences.consolidateIdleMinutes) * 6e4;
      if (this.now() - this.lastActivity >= idleMs) {
        this.lastActivity = this.now();
        await this.fire("\u7A7A\u95F2");
        return;
      }
    }
    if (preferences.consolidateOn === "fixed" && await this.fixedTimeReached(preferences)) {
      await this.fire("\u56FA\u5B9A\u65F6\u95F4");
    }
  }
  /** True once per day, when the local clock has reached `consolidateFixedTime`. */
  async fixedTimeReached(preferences) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(preferences.consolidateFixedTime.trim());
    if (match === null) return false;
    const now = /* @__PURE__ */ new Date();
    const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    if (this.lastFixedDay === day) return false;
    const target = Number(match[1]) * 60 + Number(match[2]);
    if (now.getHours() * 60 + now.getMinutes() < target) return false;
    return true;
  }
  /**
   * Ask the consolidator for one pass, unless there is nothing to do.
   *
   * The gate is the plan's: enough time since the last pass, and at least one
   * note waiting. A quiet store therefore costs one `state.json` read and no
   * journal entry.
   */
  async fire(reason) {
    if (this.stopped || this.running) return;
    const preferences = this.host.preferences();
    if (!preferences.conversationMemory) {
      this.host.log(`\u8DF3\u8FC7\u6574\u7406\uFF08${reason}\uFF09\uFF1A\u4F1A\u8BDD\u8BB0\u5FC6\u5DF2\u5173\u95ED`);
      return;
    }
    if (this.host.consolidator.busy) {
      this.host.log(`\u8DF3\u8FC7\u6574\u7406\uFF08${reason}\uFF09\uFF1A\u4E0A\u4E00\u6B21\u6574\u7406\u8FD8\u5728\u8FDB\u884C\u4E2D`);
      return;
    }
    const skip = await this.skipReason(preferences, reason);
    if (skip !== void 0) {
      this.host.log(`\u8DF3\u8FC7\u6574\u7406\uFF08${reason}\uFF09\uFF1A${skip}`);
      return;
    }
    this.running = true;
    try {
      const report = await this.host.consolidator.run(reason);
      if (this.stopped) return;
      this.host.onRun?.(report);
      this.host.log(
        `\u81EA\u52A8\u6574\u7406\u5B8C\u6210\uFF08${reason}\uFF09\uFF1A\u65B0\u589E ${report.added} \xB7 \u5408\u5E76 ${report.merged} \xB7 \u5F52\u6863 ${report.archived}`
      );
    } catch (error) {
      this.host.log(`\u81EA\u52A8\u6574\u7406\u5931\u8D25\uFF08${reason}\uFF09\uFF1A${String(error)}`);
    } finally {
      this.running = false;
      const mode = this.host.preferences().consolidateOn;
      if (mode === "fixed") {
        const now = /* @__PURE__ */ new Date();
        this.lastFixedDay = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
      }
    }
  }
  /** The plan's gate, or `undefined` when the pass may run. */
  async skipReason(preferences, reason) {
    const state = await this.host.store.readState();
    if (state.pending.length === 0) return "\u6CA1\u6709\u5F85\u6574\u7406\u7684\u4F1A\u8BDD";
    if (reason === "\u542F\u52A8\u8865\u9F50" || reason === "\u7A7A\u95F2" || reason === "\u56FA\u5B9A\u65F6\u95F4") {
      const hours = Math.max(0, preferences.consolidateIntervalHours);
      if (state.lastConsolidateAt !== null && hours > 0) {
        const elapsed = Date.now() - Date.parse(state.lastConsolidateAt);
        if (Number.isFinite(elapsed) && elapsed < hours * 36e5) {
          const remaining = Math.ceil((hours * 36e5 - elapsed) / 6e4);
          return `\u8DDD\u4E0A\u6B21\u6574\u7406\u4E0D\u8DB3 ${hours} \u5C0F\u65F6\uFF08\u8FD8\u9700 ${remaining} \u5206\u949F\uFF09`;
        }
      }
    }
    return void 0;
  }
};

// src/host/store.ts
import { join as join5 } from "node:path";
import { rm as rm2 } from "node:fs/promises";
var DRAFT_TTL_DAYS = 30;
function isSkillName(name) {
  return /^[A-Za-z0-9一-龥][A-Za-z0-9一-龥._-]{0,63}$/.test(name) && !name.includes("..");
}
var EMPTY_STATE = {
  schema: 1,
  processed: {},
  pending: [],
  lastConsolidateAt: null,
  modelCooldown: {},
  confidence: {},
  questions: []
};
function stateFrom(parsed) {
  const state = {
    schema: typeof parsed.schema === "number" ? parsed.schema : 1,
    processed: parsed.processed ?? {},
    pending: Array.isArray(parsed.pending) ? parsed.pending : [],
    lastConsolidateAt: parsed.lastConsolidateAt ?? null,
    modelCooldown: parsed.modelCooldown ?? {},
    confidence: parsed.confidence ?? {},
    questions: Array.isArray(parsed.questions) ? parsed.questions.filter((item) => typeof item === "string") : []
  };
  if (parsed.lastModelRun !== void 0 && parsed.lastModelRun !== null) state.lastModelRun = parsed.lastModelRun;
  return state;
}
function modelNote(state) {
  if (state.lastConsolidateAt === null) return "\u8FD8\u6CA1\u6709\u6574\u7406\u8FC7";
  const run = state.lastModelRun;
  if (run === void 0) return "\u786E\u5B9A\u6027\u6574\u7406\u5DF2\u542F\u7528\uFF1B\u6A21\u578B\u63D0\u70BC\u672A\u542F\u7528";
  if (run.skippedReason !== void 0) return `\u4E0A\u6B21\u6A21\u578B\u63D0\u70BC\u672A\u6267\u884C\uFF1A${run.skippedReason}`;
  if (run.used === void 0) return "\u786E\u5B9A\u6027\u6574\u7406\u5DF2\u542F\u7528\uFF1B\u6A21\u578B\u63D0\u70BC\u672A\u6267\u884C";
  const applied = run.applied ?? 0;
  const tokens = run.tokens !== void 0 && run.tokens > 0 ? `\uFF0C${run.tokens} token` : "";
  const fell = run.fellBackFrom === void 0 ? "" : `\uFF08\u81EA\u9009\u6A21\u578B ${run.fellBackFrom} \u5931\u8D25\uFF0C\u5DF2\u56DE\u9000\uFF09`;
  return `\u4E0A\u6B21\u6574\u7406\u7528\u4E86 ${run.used}${tokens}\uFF0C\u5E94\u7528 ${applied} \u6761${fell}`;
}
var SECRET_PATTERNS = [
  { label: "OpenAI \u98CE\u683C\u5BC6\u94A5", pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/ },
  { label: "GitHub \u4EE4\u724C", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { label: "AWS Access Key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: "Bearer \u4EE4\u724C", pattern: /\bBearer\s+[A-Za-z0-9._-]{20,}/i },
  { label: "\u79C1\u94A5\u5757", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: "\u8D4B\u503C\u5F0F\u53E3\u4EE4", pattern: /\b(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S{8,}/i }
];
var PII_PATTERNS = [
  // 18-digit mainland ID. The date-shaped middle block is what separates it from
  // an arbitrary 18-digit run, and the trailing `[\dXx]` from an even longer one.
  { label: "\u8EAB\u4EFD\u8BC1\u53F7", pattern: /(?<!\d)\d{6}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?!\d)/ },
  // Mainland mobile: 11 digits, `1` then 3–9. The lookarounds keep it from
  // matching the middle of a longer number.
  { label: "\u624B\u673A\u53F7", pattern: /(?<!\d)1[3-9]\d{9}(?!\d)/ },
  // Mainland landline with an area code.
  { label: "\u56FA\u5B9A\u7535\u8BDD", pattern: /(?<!\d)0\d{2,3}-\d{7,8}(?!\d)/ }
];
function isLuhnCard(digits) {
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let value = digits.charCodeAt(index) - 48;
    if (value < 0 || value > 9) return false;
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    double = !double;
  }
  return sum % 10 === 0;
}
function cardCandidates(text) {
  return text.match(/(?<!\d)\d{13,19}(?!\d)/g) ?? [];
}
function documentTargets() {
  return [
    { path: "profile.md", kind: "persona" },
    { path: "instructions.md", kind: "instructions" },
    { path: "memory/index.md", kind: "memory-index" },
    ...TOPICS.map((topic) => ({ path: `memory/${topic.file}`, kind: "memory-topic", topic: topic.key }))
  ];
}
function documentTarget(path) {
  return documentTargets().find((target) => target.path === path);
}
function redact(text) {
  let result = text;
  const warnings = [];
  for (const { label, pattern } of SECRET_PATTERNS) {
    if (!pattern.test(result)) continue;
    result = result.replace(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`), "\uFF3B\u5DF2\u9690\u53BB\uFF3D");
    warnings.push(`\u68C0\u6D4B\u5230${label}\uFF0C\u5DF2\u4ECE\u8BB0\u5FC6\u5185\u5BB9\u4E2D\u9690\u53BB\u3002`);
  }
  const kept = [];
  let dropped = 0;
  for (const line of result.split("\n")) {
    const labels = PII_PATTERNS.filter(({ pattern }) => pattern.test(line)).map((entry) => entry.label);
    if (cardCandidates(line).some(isLuhnCard)) labels.push("\u94F6\u884C\u5361\u53F7");
    if (labels.length === 0) {
      kept.push(line);
      continue;
    }
    dropped += 1;
    warnings.push(`\u68C0\u6D4B\u5230${[...new Set(labels)].join("\u3001")}\uFF0C\u5DF2\u6574\u6761\u7565\u53BB\u3002`);
  }
  return { text: dropped === 0 ? result : kept.join("\n"), warnings };
}
var MemoryStore = class {
  root;
  skillsRoot;
  warnings = [];
  constructor(root = resolveMemoryRoot(), skillsRoot = resolveSkillsRoot()) {
    this.root = root;
    this.skillsRoot = skillsRoot;
  }
  /** Absolute path of a root-relative file. */
  path(relative) {
    return join5(this.root, relative);
  }
  /** Create the data root and every skeleton file that is missing. */
  async ensure() {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    await ensureDir(this.root);
    for (const [relative, content] of Object.entries(initialFiles(now))) {
      const target = this.path(relative);
      if (await exists(target)) continue;
      await writeFileAtomic(target, content);
    }
    for (const directory of ["memory/projects", "sessions", "journal", "skills-draft", "archive", "approved-skills"]) {
      await ensureDir(this.path(directory));
    }
    if (!await exists(this.path("state.json"))) await this.writeState(EMPTY_STATE);
  }
  /** Read `state.json`, falling back to the empty state on a broken file. */
  async readState() {
    const raw = await readTextOrUndefined(this.path("state.json"));
    if (raw === void 0 || raw.trim() === "") return { ...EMPTY_STATE };
    try {
      const parsed = JSON.parse(raw);
      return stateFrom(parsed);
    } catch {
      this.warnings.push("state.json \u65E0\u6CD5\u89E3\u6790\uFF0C\u5DF2\u6309\u7A7A\u72B6\u6001\u7EE7\u7EED\uFF08\u8BB0\u5FC6\u6587\u4EF6\u672A\u53D7\u5F71\u54CD\uFF09\u3002");
      return { ...EMPTY_STATE };
    }
  }
  /**
   * Persist `state.json`.
   *
   * Under the file lock, because every caller is a read-modify-write: the
   * collector reads, merges its watermark and writes; a consolidation pass does
   * the same with `pending`. Without the lock the two interleave and the later
   * writer silently reverts the other's field — a lost watermark means a session
   * is consolidated twice, and the user sees nothing at all. The window used to
   * be milliseconds wide, which is why it never bit; anything that awaits
   * between the read and the write (a model call, a network request) widens it
   * to seconds.
   */
  async writeState(state) {
    await withFileLock(this.path("state.json"), async () => {
      await writeFileAtomic(this.path("state.json"), `${JSON.stringify(state, null, 2)}
`);
    });
  }
  /**
   * Merge a patch into `state.json` under one lock.
   *
   * `patch` receives the state as it is on disk *at this moment*, so two writers
   * that touch different fields both survive. Prefer this over `readState` +
   * `writeState` for any new caller.
   */
  async patchState(patch) {
    const target = this.path("state.json");
    return await withFileLock(target, async () => {
      const raw = await readTextOrUndefined(target);
      let current = { ...EMPTY_STATE };
      if (raw !== void 0 && raw.trim() !== "") {
        try {
          current = stateFrom(JSON.parse(raw));
        } catch {
          this.warnings.push("state.json \u65E0\u6CD5\u89E3\u6790\uFF0C\u5DF2\u6309\u7A7A\u72B6\u6001\u7EE7\u7EED\uFF08\u8BB0\u5FC6\u6587\u4EF6\u672A\u53D7\u5F71\u54CD\uFF09\u3002");
        }
      }
      const next = patch(current);
      await writeFileAtomic(target, `${JSON.stringify(next, null, 2)}
`);
      return next;
    });
  }
  /** Read one markdown document. */
  async readDocument(relative) {
    const raw = await readTextOrUndefined(this.path(relative));
    if (raw === void 0) return EMPTY_DOCUMENT;
    return parseDocument(raw);
  }
  /** Read the preferences file into its typed view. */
  async readPreferences() {
    const document = await this.readDocument("preferences.md");
    const front = document.front;
    const mode = frontString(front, "consolidateOn", DEFAULT_PREFERENCES.consolidateOn);
    const policy = frontString(front, "modelPolicy", DEFAULT_PREFERENCES.modelPolicy);
    const style = frontString(front, "replyStyle", DEFAULT_PREFERENCES.replyStyle);
    return {
      userName: frontString(front, "userName", DEFAULT_PREFERENCES.userName),
      agentName: frontString(front, "agentName", DEFAULT_PREFERENCES.agentName),
      replyStyle: REPLY_STYLES.includes(style) ? style : DEFAULT_PREFERENCES.replyStyle,
      welcome: frontBooleanOr(front, "welcome", DEFAULT_PREFERENCES.welcome),
      showFileChanges: frontBooleanOr(front, "showFileChanges", DEFAULT_PREFERENCES.showFileChanges),
      conversationMemory: frontBooleanOr(front, "conversationMemory", DEFAULT_PREFERENCES.conversationMemory),
      localMemorySkills: frontBooleanOr(front, "localMemorySkills", DEFAULT_PREFERENCES.localMemorySkills),
      consolidateOn: CONSOLIDATE_MODES.includes(mode) ? mode : DEFAULT_PREFERENCES.consolidateOn,
      consolidateIntervalHours: frontNumber(front, "consolidateIntervalHours", DEFAULT_PREFERENCES.consolidateIntervalHours),
      consolidateIdleMinutes: frontNumber(front, "consolidateIdleMinutes", DEFAULT_PREFERENCES.consolidateIdleMinutes),
      consolidateFixedTime: frontString(front, "consolidateFixedTime", DEFAULT_PREFERENCES.consolidateFixedTime),
      consolidateQuiet: frontBooleanOr(front, "consolidateQuiet", DEFAULT_PREFERENCES.consolidateQuiet),
      modelPolicy: MODEL_POLICIES.includes(policy) ? policy : DEFAULT_PREFERENCES.modelPolicy,
      modelAllowlist: frontList(front, "modelAllowlist"),
      modelChoiceProvider: frontString(front, "modelChoiceProvider", DEFAULT_PREFERENCES.modelChoiceProvider),
      modelChoiceModel: frontString(front, "modelChoiceModel", DEFAULT_PREFERENCES.modelChoiceModel),
      modelChoiceEffort: frontString(front, "modelChoiceEffort", DEFAULT_PREFERENCES.modelChoiceEffort),
      promptBudgetBytes: frontNumber(front, "promptBudgetBytes", DEFAULT_PREFERENCES.promptBudgetBytes)
    };
  }
  /**
   * Merge `patch` into the preferences front-matter.
   *
   * Read-modify-write under the file lock: two panel tabs toggling different
   * switches must not lose one another's change, and the front-matter has more
   * keys than any single patch carries.
   */
  async patchPreferences(patch) {
    const target = this.path("preferences.md");
    await withFileLock(target, async () => {
      const raw = await readTextOrUndefined(target);
      const document = raw === void 0 ? parseDocument("") : parseDocument(raw);
      const next = { ...document.front };
      for (const [key, value] of Object.entries(patch.patch)) {
        if (value === void 0) continue;
        next[key] = value;
      }
      next.kind = "preferences";
      next.schema = 1;
      next.updated = (/* @__PURE__ */ new Date()).toISOString();
      await writeFileAtomic(target, renderDocument(next, document.body));
    });
    return await this.readPreferences();
  }
  /**
   * Write one document body, refusing to clobber a concurrent edit.
   *
   * `expected` is the revision the editor loaded. A mismatch means somebody
   * else (the user in an editor, or a consolidation pass) wrote the file in the
   * meantime, and the caller must resolve it — the store never silently wins.
   */
  async saveDocument(relative, body, expected) {
    const target = this.path(relative);
    const outcome = await withFileLock(target, async () => {
      const raw = await readTextOrUndefined(target);
      const current = raw === void 0 ? EMPTY_DOCUMENT : parseDocument(raw);
      if (raw !== void 0 && expected !== "" && current.revision !== expected) {
        return { ok: false, text: current.body, revision: current.revision };
      }
      const { text } = redact(body);
      const next = { ...current.front, updated: (/* @__PURE__ */ new Date()).toISOString() };
      await writeFileAtomic(target, renderDocument(next, text));
      return { ok: true, document: parseDocument(await readText(target)) };
    });
    return outcome;
  }
  /**
   * Write a document with an explicit front-matter record.
   *
   * Used by consolidation (which owns the index's front-matter) rather than by
   * the panel, whose edits are body-only and go through `saveDocument`.
   */
  async writeDocument(relative, front, body) {
    await withFileLock(this.path(relative), async () => {
      const existing = await this.readDocument(relative);
      await writeFileAtomic(this.path(relative), renderDocument({ ...existing.front, ...front }, body));
    });
  }
  /** Rewrite a document back to its shipped skeleton. */
  async resetDocument(relative) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const target = documentTarget(relative);
    if (target === void 0) return;
    const content = target.kind === "persona" ? profileTemplate(now) : target.kind === "instructions" ? instructionsTemplate(now) : target.kind === "memory-index" ? memoryIndexTemplate(now) : topicTemplate(
      target.topic ?? "",
      TOPICS.find((topic) => topic.key === target.topic)?.title ?? "",
      now
    );
    await writeFileAtomic(this.path(relative), content);
  }
  /** Every entry of one topic file. */
  async readEntries(topic) {
    const file = TOPICS.find((item) => item.key === topic)?.file;
    if (file === void 0) return [];
    const document = await this.readDocument(`memory/${file}`);
    return parseEntries(document.body);
  }
  /** Every entry of every topic file, keyed by topic. */
  async readAllEntries() {
    const result = {};
    for (const topic of TOPICS) result[topic.key] = await this.readEntries(topic.key);
    return result;
  }
  /** Rewrite one topic file from its entries. */
  async writeEntries(topic, entries) {
    const file = TOPICS.find((item) => item.key === topic)?.file;
    if (file === void 0) return;
    const relative = `memory/${file}`;
    await withFileLock(this.path(relative), async () => {
      const document = await this.readDocument(relative);
      const body = renderTopicBody(document.body, entries);
      const next = { ...document.front, updated: (/* @__PURE__ */ new Date()).toISOString() };
      await writeFileAtomic(this.path(relative), renderDocument(next, body));
    });
  }
  /** Drop one entry, or flip its `pinned` flag. */
  async editEntry(topic, id, change) {
    const entries = await this.readEntries(topic);
    const index = entries.findIndex((entry) => entry.id === id);
    if (index < 0) return false;
    const next = entries.map((entry) => ({ ...entry }));
    if (change.remove === true) next.splice(index, 1);
    else if (change.pinned !== void 0) next[index].pinned = change.pinned;
    await this.writeEntries(topic, next);
    return true;
  }
  /** Move an entry into `archive/` (decay, memory-plan §5.3). */
  async archiveEntries(topic, ids, reason) {
    if (ids.length === 0) return 0;
    const entries = await this.readEntries(topic);
    const wanted = new Set(ids);
    const moved = entries.filter((entry) => wanted.has(entry.id));
    if (moved.length === 0) return 0;
    const archivePath = this.path(`archive/${topic}-${dayKey()}.md`);
    const existing = await readTextOrUndefined(archivePath);
    const lines = moved.map((entry) => `- [${entry.id}] ${entry.text} <!-- archived:${dayKey()} reason:${reason} -->`);
    const header = existing ?? `---
kind: memory-archive
topic: ${topic}
schema: 1
updated: ${(/* @__PURE__ */ new Date()).toISOString()}
---
# \u5F52\u6863 \xB7 ${topic}
`;
    await writeFileAtomic(archivePath, `${header.trimEnd()}
${lines.join("\n")}
`);
    await this.writeEntries(topic, entries.filter((entry) => !wanted.has(entry.id)));
    return moved.length;
  }
  /* -------------------------------------------------------------- *
   * Project memory (P6, memorybuddy-plan §5): the same entry format
   * as a topic file, one file per workspace under memory/projects/.
   * -------------------------------------------------------------- */
  /** Every entry of one project file. Missing file = no entries. */
  async readProjectEntries(slug) {
    const document = await this.readDocument(`memory/projects/${slug}.md`);
    if (document.body.trim() === "" && Object.keys(document.front).length === 0) return [];
    return parseEntries(document.body);
  }
  /** Rewrite one project file from its entries, creating it when absent. */
  async writeProjectEntries(slug, entries) {
    const relative = `memory/projects/${slug}.md`;
    await withFileLock(this.path(relative), async () => {
      const document = await this.readDocument(relative);
      const body = renderTopicBody(document.body, entries);
      const front = Object.keys(document.front).length === 0 ? { kind: "project-memory", slug, schema: 1 } : document.front;
      const next = { ...front, updated: (/* @__PURE__ */ new Date()).toISOString() };
      await writeFileAtomic(this.path(relative), renderDocument(next, body));
    });
  }
  /** Every project file the panel can show, newest-updated first. */
  async readProjects() {
    const names = await listDir(this.path("memory/projects"));
    const projects = [];
    for (const name of names) {
      if (!name.endsWith(".md")) continue;
      const relative = `memory/projects/${name}`;
      const document = await this.readDocument(relative);
      if (document.body.trim() === "" && Object.keys(document.front).length === 0) continue;
      projects.push({
        slug: name.slice(0, -3),
        path: relative,
        updated: frontString(document.front, "updated", await mtimeIso(this.path(relative)) ?? ""),
        entries: parseEntries(document.body).length
      });
    }
    return projects.sort((a, b) => b.updated.localeCompare(a.updated));
  }
  /**
   * Forget one project: its file moves to `archive/projects-<slug>-<day>.md`.
   * A move, never a delete — same policy as decay and reset-all.
   */
  async archiveProject(slug) {
    if (!/^[a-z0-9一-龥._-]{1,64}$/.test(slug)) return false;
    const source = this.path(`memory/projects/${slug}.md`);
    if (!await exists(source)) return false;
    const destination = this.path(`archive/projects-${slug}-${dayKey()}.md`);
    await ensureDir(this.path("archive"));
    await movePath(source, destination);
    return true;
  }
  /** Session notes, newest first. */
  async readSessions(limit = 50) {
    const state = await this.readState();
    const pending = new Set(state.pending);
    const dates = (await listDir(this.path("sessions"))).filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name)).sort().reverse();
    const notes = [];
    for (const date of dates) {
      const ids = await listDir(this.path(`sessions/${date}`));
      for (const id of ids) {
        if (!id.endsWith(".md")) continue;
        const relative = `sessions/${date}/${id}`;
        const document = await this.readDocument(relative);
        notes.push({
          id: id.slice(0, -3),
          date,
          path: relative,
          updated: frontString(document.front, "updated", await mtimeIso(this.path(relative)) ?? ""),
          consolidated: !pending.has(relative),
          events: frontNumber(document.front, "events", 0),
          title: frontString(document.front, "title", "")
        });
        if (notes.length >= limit) return notes;
      }
    }
    return notes;
  }
  /**
   * Write one session note.
   *
   * The blacklist runs HERE, at the single choke point every note passes through,
   * rather than only at the two places it used to be applied (`memorybuddy_remember`
   * and `saveDocument`). A session note is the plugin's primary data path: the
   * collector writes whatever the user and the assistant said, verbatim, and the
   * next consolidation pass lifts `(候选 · …)` lines straight into a topic file —
   * which is then injected into every future conversation. Filtering only the tool
   * and the editor left the most common route wide open, and a phone number typed
   * once in an ordinary session would have ended up in `memory/index.md`.
   *
   * The FRONT-MATTER is filtered too, not just the body. The note's `title` is the
   * collector's excerpt of the user's first message, so a conversation that opens
   * with a phone number put it there — and the panel renders that title in the
   * session list, which means filtering only the body would have hidden the leak
   * from every test that reads the note's content while it sat in plain sight in
   * the header.
   *
   * Warnings are collected so the panel can tell the user that a line went missing
   * rather than letting them assume the plugin lost it.
   */
  async writeSessionNote(date, id, front, body) {
    const relative = `sessions/${date}/${id}.md`;
    await ensureDir(this.path(`sessions/${date}`));
    const document = await this.readDocument(relative);
    const cleanedFront = {};
    for (const [key, value] of Object.entries({ ...document.front, ...front })) {
      if (typeof value !== "string") {
        cleanedFront[key] = value;
        continue;
      }
      const cleaned2 = redact(value);
      for (const warning of cleaned2.warnings) this.warnings.push(warning);
      cleanedFront[key] = cleaned2.text;
    }
    const cleaned = redact(body);
    for (const warning of cleaned.warnings) this.warnings.push(warning);
    await writeFileAtomic(
      this.path(relative),
      renderDocument({ kind: "session-note", schema: 1, ...cleanedFront }, cleaned.text)
    );
    return relative;
  }
  /**
   * Skill drafts awaiting approval.
   *
   * `isSkillName` filters the listing: a directory whose name is not a valid skill
   * name cannot be approved, edited or ignored through any action, so listing it
   * would only render a card whose every button fails. Skipping it here means the
   * panel never shows a draft the host would refuse.
   */
  async readDrafts() {
    const names = await listDir(this.path("skills-draft"));
    const drafts = [];
    for (const name of names) {
      if (!isSkillName(name)) continue;
      const relative = `skills-draft/${name}/SKILL.md`;
      const document = await this.readDocument(relative);
      if (document.body.trim() === "" && Object.keys(document.front).length === 0) continue;
      drafts.push({
        name,
        title: frontString(document.front, "title", name),
        path: relative,
        createdAt: frontString(document.front, "createdAt", ""),
        repeats: frontNumber(document.front, "repeats", 0)
      });
    }
    return drafts;
  }
  /**
   * One draft in full, for the detail dialog (P7 §6.2 B).
   *
   * The panel needs the whole `SKILL.md` — front-matter included, because that
   * file is what approval copies verbatim into `$DSH_HOME/skills/` — plus the
   * sessions it was derived from, which live in the front-matter as
   * `derivedFrom` and are listed here so the dialog can render them without
   * re-parsing YAML.
   */
  async readDraft(name) {
    if (!isSkillName(name)) return void 0;
    const relative = `skills-draft/${name}/SKILL.md`;
    const document = await this.readDocument(relative);
    if (document.body.trim() === "" && Object.keys(document.front).length === 0) return void 0;
    return {
      name,
      title: frontString(document.front, "title", name),
      path: relative,
      createdAt: frontString(document.front, "createdAt", ""),
      repeats: frontNumber(document.front, "repeats", 0),
      /** The complete file text: front-matter + body, exactly as it would be promoted. */
      text: renderDocument(document.front, document.body),
      body: document.body,
      description: frontString(document.front, "description", ""),
      whenToUse: frontString(document.front, "whenToUse", ""),
      derivedFrom: frontList(document.front, "derivedFrom"),
      /** Where 批准 would write it. */
      target: join5(this.skillsRoot, name, "SKILL.md")
    };
  }
  /**
   * Whether this pattern already has a draft OR an approved skill.
   *
   * The approved check is what stops the regeneration loop: a user who approves a
   * draft has it as a real skill in `$DSH_HOME/skills/`, and re-mining the same
   * pattern on the next pass would raise an identical draft that competes with
   * the skill they already approved — and would sit in the pending list until the
   * 30-day archive filed it as unattended. Generation asks about both roots, so
   * the answer stays correct even if the approved skill is later deleted by hand.
   */
  async draftExists(name) {
    if (!isSkillName(name)) return false;
    if (await exists(this.path(`skills-draft/${name}/SKILL.md`))) return true;
    return exists(join5(this.skillsRoot, name, "SKILL.md"));
  }
  /**
   * Write one generated draft (P7 §6.2 A).
   *
   * `createdAt` is stamped here and never rewritten: the 30-day archive counts
   * from it, so a refreshed draft would keep resetting its own deadline. The
   * front-matter field names are the ones `readDrafts` / `readDraft` read, and
   * `source: memorybuddy-evolved` is what distinguishes a generated draft from a
   * hand-written one for anyone reading the file outside the panel.
   */
  async writeSkillDraft(name, candidate, now) {
    if (!isSkillName(name)) throw new Error(`skill-draft: \u975E\u6CD5\u76EE\u5F55\u540D ${String(name)}`);
    const relative = `skills-draft/${name}/SKILL.md`;
    const front = {
      name,
      title: candidate.title,
      description: candidate.description,
      whenToUse: candidate.whenToUse,
      source: "memorybuddy-evolved",
      derivedFrom: candidate.derivedFrom,
      repeats: candidate.repeats,
      dates: candidate.dates,
      createdAt: now
    };
    await writeFileAtomic(this.path(relative), renderDocument(front, renderDraftBody(candidate)));
    return relative;
  }
  /**
   * Archive drafts nobody acted on for 30 days (P7 §6.2 C).
   *
   * A move into `archive/skills-draft/`, never a delete — the same rule decay,
   * 重置 and forget-project follow. `createdAt` is read per file rather than from
   * the directory listing, because a hand-created draft has no mtime worth
   * trusting and no front-matter date at all is left alone rather than treated as
   * infinitely old.
   *
   * Each name is archived independently and a failure is reported rather than
   * thrown: `movePath` throws `EPERM` when the destination directory already
   * exists (a user who ignored one draft and later regenerates the same name hits
   * exactly that), and one such name must not freeze the archive for every name
   * that would have followed it in the directory listing.
   */
  async archiveStaleDrafts(days = DRAFT_TTL_DAYS) {
    const today = dayKey();
    const archived = [];
    await ensureDir(this.path("archive/skills-draft"));
    for (const name of await listDir(this.path("skills-draft"))) {
      try {
        const relative = `skills-draft/${name}/SKILL.md`;
        const document = await this.readDocument(relative);
        const created = frontString(document.front, "createdAt", "");
        if (!/^\d{4}-\d{2}-\d{2}/.test(created)) continue;
        if (daysBetween(created.slice(0, 10), today) < days) continue;
        await movePath(this.path(`skills-draft/${name}`), this.path(`archive/skills-draft/${name}`));
        archived.push(name);
      } catch (error) {
        this.warnings.push(`\u6280\u80FD\u8349\u7A3F ${name} \u5F52\u6863\u5931\u8D25\uFF1A${String(error)}`);
      }
    }
    return archived;
  }
  /** Append a journal entry recording what a pass changed. */
  async appendJournal(lines) {
    const date = dayKey();
    const relative = `journal/${date}.md`;
    const existing = await readTextOrUndefined(this.path(relative));
    const header = existing ?? `---
kind: journal
date: ${date}
schema: 1
---
# \u6574\u7406\u65E5\u5FD7 \xB7 ${date}
`;
    const stamp = (/* @__PURE__ */ new Date()).toISOString().slice(11, 19);
    const entry = `
## ${stamp}

${lines.map((line) => `- ${line}`).join("\n")}
`;
    await writeFileAtomic(this.path(relative), `${header.trimEnd()}
${entry}`);
  }
  /** Back up the files a pass is about to rewrite. */
  async backup(paths) {
    await this.backupInto(this.path(`journal/${dayKey()}/backup`), paths);
  }
  /** Copy `paths` into an already-chosen backup directory. */
  async backupInto(directory, paths) {
    await ensureDir(directory);
    const written = [];
    for (const relative of paths) {
      const raw = await readTextOrUndefined(this.path(relative));
      if (raw === void 0) continue;
      await writeFileAtomic(join5(directory, relative.replaceAll("/", "__")), raw);
      written.push(relative);
    }
    return written;
  }
  /** Journal dates that carry a backup, newest first. */
  async readHistory() {
    const names = await listDir(this.path("journal"));
    const dates = [];
    for (const name of names) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(name)) continue;
      if ((await listDir(this.path(`journal/${name}/backup`))).length > 0) dates.push(name);
    }
    return dates.sort().reverse();
  }
  /**
   * Read one journal day: its log text and the files its backup can restore.
   *
   * The backup file names encode the original path with `/` → `__`, which is
   * unambiguous because a Windows path cannot contain `/` and the memory layout
   * never names a file with a double underscore.
   */
  async readJournal(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { date, text: "", backups: [] };
    const text = await readTextOrUndefined(this.path(`journal/${date}.md`)) ?? "";
    const backups = (await listDir(this.path(`journal/${date}/backup`))).map((name) => name.replaceAll("__", "/")).sort();
    return { date, text, backups };
  }
  /**
   * Restore one journal day's backup over the live files.
   *
   * Three safety rules, all deliberate:
   *
   * 1. The backup is read into memory *before* anything is written. A rollback
   *    to today would otherwise overwrite `journal/<today>/backup/` — the very
   *    files it is about to restore from — and "restore" the damage instead.
   * 2. The state being replaced is snapshotted into its own timestamped
   *    directory, never into the backup it came from, so a day's original
   *    backup survives and stays re-rollback-able.
   * 3. A file that did not exist when the backup was taken is left alone rather
   *    than deleted: the backup records what to put back, not what to remove,
   *    and guessing the difference from the file list would delete memory that
   *    was created after the pass.
   */
  async rollback(date) {
    const directory = this.path(`journal/${date}/backup`);
    const names = await listDir(directory);
    const targets = names.map((name) => ({ name, relative: name.replaceAll("__", "/") })).filter((item) => item.relative !== "" && !item.relative.includes("..") && !item.relative.startsWith("/"));
    if (targets.length === 0) return { restored: [], date, snapshot: "" };
    const captured = [];
    for (const item of targets) {
      const raw = await readTextOrUndefined(join5(directory, item.name));
      if (raw === void 0) continue;
      captured.push({ relative: item.relative, raw });
    }
    const stamp = (/* @__PURE__ */ new Date()).toISOString().slice(11, 19).replaceAll(":", "-");
    const snapshot = `journal/${dayKey()}/rollback-${stamp}`;
    await this.backupInto(this.path(snapshot), captured.map((item) => item.relative));
    const restored = [];
    for (const item of captured) {
      await writeFileAtomic(this.path(item.relative), item.raw);
      restored.push(item.relative);
    }
    await this.appendJournal([
      `\u5DF2\u56DE\u6EDA\u5230 ${date} \u7684\u5907\u4EFD\uFF1A\u6062\u590D ${restored.length} \u4E2A\u6587\u4EF6\uFF08\u56DE\u6EDA\u524D\u7684\u72B6\u6001\u5DF2\u518D\u6B21\u5907\u4EFD\u5230 ${snapshot}/\uFF09`
    ]);
    return { restored, date, snapshot };
  }
  /**
   * Archive the whole memory and rebuild the empty skeleton.
   *
   * The plan's 重置 (§6.3) is a move, never a delete: `memory/`, `sessions/`,
   * `journal/` and the three hand-editable documents all move into
   * `archive/reset-<timestamp>/`, so a reset that turns out to be a mistake is
   * undone by dragging the directory back.
   */
  async resetAll() {
    const stamp = (/* @__PURE__ */ new Date()).toISOString().replaceAll(":", "-").replace(/\.\d+Z$/, "Z");
    const directory = this.path(`archive/reset-${stamp}`);
    await ensureDir(directory);
    const moved = [];
    for (const relative of ["memory", "sessions", "journal", "skills-draft", "profile.md", "instructions.md"]) {
      const source = this.path(relative);
      if (!await exists(source)) continue;
      const destination = join5(directory, relative);
      await ensureDir(join5(destination, ".."));
      await movePath(source, destination);
      moved.push(relative);
    }
    const raw = await readTextOrUndefined(this.path("state.json"));
    if (raw !== void 0) await writeFileAtomic(join5(directory, "state.json"), raw);
    await this.writeState({ ...EMPTY_STATE });
    await this.ensure();
    return { archived: `archive/reset-${stamp}`, files: moved.length };
  }
  /** Drop one unanswered question by index. */
  async dismissQuestion(index) {
    let removed = false;
    await this.patchState((state) => {
      if (index < 0 || index >= state.questions.length) return state;
      removed = true;
      const questions = [...state.questions];
      questions.splice(index, 1);
      return { ...state, questions };
    });
    return removed;
  }
  /**
   * Record which skills this plugin promoted, for 彻底删除 (P8).
   *
   * 彻底删除 must remove what the plugin WROTE and nothing else. `$DSH_HOME/skills`
   * is a shared namespace the user may have filled by hand or with other tools,
   * and deleting a hand-written skill because it happened to sit next to ours
   * would be a data loss the user never asked for.
   *
   * The index lives under the memory root, so it disappears with it — which is
   * why it cannot be the only record: an approval made before this file existed
   * is invisible to it. The promoted skill's own front-matter
   * (`source: memorybuddy-evolved`) is checked as well; between the two, an
   * approval from any build is covered.
   */
  async recordApprovedSkill(name) {
    if (!isSkillName(name)) return;
    await ensureDir(this.path("approved-skills"));
    await writeFileAtomic(this.path(`approved-skills/${name}.txt`), `${name}
`);
  }
  /** The names of the skills this plugin promoted, from both recorded sources. */
  async approvedSkills() {
    const names = /* @__PURE__ */ new Set();
    for (const file of await listDir(this.path("approved-skills"))) {
      if (!file.endsWith(".txt")) continue;
      const name = file.slice(0, -4);
      if (isSkillName(name)) names.add(name);
    }
    for (const entry of await listDir(this.skillsRoot)) {
      if (!isSkillName(entry) || names.has(entry)) continue;
      const raw = await readTextOrUndefined(join5(this.skillsRoot, entry, "SKILL.md"));
      if (raw !== void 0 && frontString(parseDocument(raw).front, "source", "") === "memorybuddy-evolved") {
        names.add(entry);
      }
    }
    return [...names].sort();
  }
  /**
   * 彻底删除 (P8): remove the memory root and every skill this plugin promoted.
   *
   * THE ONE IRREVERSIBLE OPERATION IN THIS PLUGIN. Everything else — decay,
   * 重置, 忽略, forget-project — moves data into `archive/`; this deletes it, and
   * there is no way back. It is therefore a separate action rather than a
   * stronger `reset-all`, and it only runs when the caller passes the exact
   * confirmation phrase, which the panel requires the user to TYPE. A button that
   * any single click could fire would be indistinguishable from a crash.
   *
   * `skillsRoot` is touched only for the names in `approvedSkills()`: the rest of
   * `$DSH_HOME/skills` belongs to the user, not to this plugin.
   */
  async wipeAll(wipeConfirmation) {
    if (wipeConfirmation !== WIPE_CONFIRMATION) {
      throw new Error("wipe: \u786E\u8BA4\u8BCD\u4E0D\u5339\u914D\uFF0C\u672A\u5220\u9664\u4EFB\u4F55\u5185\u5BB9");
    }
    const skills = await this.approvedSkills();
    await rm2(this.root, { recursive: true, force: true });
    const removed = [];
    for (const name of skills) {
      const target = join5(this.skillsRoot, name);
      if (!await exists(target)) continue;
      await rm2(target, { recursive: true, force: true });
      removed.push(name);
    }
    return { root: this.root, skills: removed };
  }
  /**
   * Promote a draft into `$DSH_HOME/skills/<name>/SKILL.md`.
   *
   * `text` is the 编辑后批准 path: the panel sends the edited file text and it is
   * what lands, so the user can fix a draft before DSH ever loads it. Omitted,
   * the on-disk draft is promoted verbatim.
   *
   * Two preconditions, both load-bearing:
   *
   * 1. **The draft must exist.** Without this, `approve-draft` with a `text` body
   *    is a write primitive: it would create `$DSH_HOME/skills/<anything>/SKILL.md`
   *    for a name that was never a pending draft, and DSH auto-loads every skill
   *    in that root. `name` is name-validated, but a valid name that no draft
   *    claimed is still not the user's pending item. The check is kept even though
   *    the panel cannot produce that call.
   * 2. **`text` must be non-empty.** An empty string is a legal `text`, and
   *    `text ?? source` would take it over the real draft and promote a 0-byte
   *    skill — destroying the draft on the way. An empty editor is a client-side
   *    mistake, not an instruction to write nothing.
   *
   * The promotion is a whole-file write into the skills root and nothing else —
   * this is the only place in the plugin that writes there, which is what makes
   * 「默认绝不自动写入」 a structural fact rather than a promise.
   */
  async approveDraft(name, text) {
    if (!isSkillName(name)) return false;
    const source = await readTextOrUndefined(this.path(`skills-draft/${name}/SKILL.md`));
    if (source === void 0) return false;
    const content = text === void 0 || text === "" ? source : text;
    await writeFileAtomic(join5(this.skillsRoot, name, "SKILL.md"), content);
    await this.recordApprovedSkill(name);
    await removeFile(this.path(`skills-draft/${name}/SKILL.md`)).catch(() => void 0);
    return true;
  }
  /**
   * 忽略 one draft without promoting it (P7 §6.2 B).
   *
   * The plan's 忽略 is not a discard: an ignored draft is one the user declined
   * today and may still want next week, so it moves to `archive/skills-draft/`
   * like every other thing this plugin sets aside. It is removed from the pending
   * list, which is what makes the red dot and the banner go away.
   */
  async ignoreDraft(name) {
    if (!isSkillName(name)) return false;
    const source = this.path(`skills-draft/${name}`);
    if (!await exists(join5(source, "SKILL.md"))) return false;
    const stamp = (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replaceAll(":", "-");
    await ensureDir(this.path("archive/skills-draft"));
    let destination = this.path(`archive/skills-draft/${name}`);
    if (await exists(destination)) destination = this.path(`archive/skills-draft/${name}-${stamp}`);
    await movePath(source, destination);
    return true;
  }
  /** Build the snapshot the panel renders. */
  async snapshot() {
    await this.ensure();
    const [preferences, state, sessions, drafts, allEntries, projects] = await Promise.all([
      this.readPreferences(),
      this.readState(),
      this.readSessions(),
      this.readDrafts(),
      this.readAllEntries(),
      this.readProjects()
    ]);
    const documents = {};
    for (const target of documentTargets()) {
      const document = await this.readDocument(target.path);
      documents[target.path] = {
        path: target.path,
        text: document.body,
        revision: document.revision,
        updated: frontString(document.front, "updated", "")
      };
    }
    for (const project of projects) {
      const document = await this.readDocument(project.path);
      documents[project.path] = {
        path: project.path,
        text: document.body,
        revision: document.revision,
        updated: project.updated
      };
    }
    const indexDocument = await this.readDocument("memory/index.md");
    const entries = {};
    for (const [topic, list] of Object.entries(allEntries)) {
      entries[topic] = list.filter((entry) => entry.confidence !== "\u4F4E" || entry.pinned).map(({ line: _line, ...entry }) => entry);
    }
    const revision = await this.computeRevision();
    return {
      ok: true,
      root: this.root,
      revision,
      preferences,
      documents,
      entries,
      index: {
        path: "memory/index.md",
        text: indexDocument.body,
        revision: indexDocument.revision,
        updated: frontString(indexDocument.front, "updated", "")
      },
      sessions: {
        pending: state.pending.length,
        total: sessions.length,
        lastAt: sessions[0]?.updated ?? null,
        items: sessions.slice(0, 20)
      },
      consolidation: {
        lastAt: state.lastConsolidateAt,
        reason: await this.consolidationReason(preferences),
        // The stage the LAST pass reached. A pass that ran the model stage and
        // applied at least one operation is `'model'`; one that ran the model
        // stage and fell back to deterministic-only is still `'deterministic'`,
        // which is the honest reading of what the memory files reflect.
        modelStage: state.lastConsolidateAt === null ? "disabled" : state.lastModelRun?.used !== void 0 && (state.lastModelRun.applied ?? 0) > 0 ? "model" : "deterministic",
        modelNote: modelNote(state),
        ...state.lastModelRun === void 0 ? {} : { model: state.lastModelRun }
      },
      questions: [...state.questions],
      history: await this.readHistory(),
      drafts,
      projects,
      warnings: [...this.warnings]
    };
  }
  /** Why consolidation has not run, in the panel's own words. */
  async consolidationReason(preferences) {
    const state = await this.readState();
    if (state.pending.length > 0) return `\u6709 ${state.pending.length} \u4E2A\u4F1A\u8BDD\u5F85\u6574\u7406`;
    if (preferences.consolidateOn === "fixed") return `\u6309\u56FA\u5B9A\u65F6\u95F4 ${preferences.consolidateFixedTime} \u6574\u7406`;
    if (!preferences.conversationMemory) return "\u4F1A\u8BDD\u8BB0\u5FC6\u5DF2\u5173\u95ED";
    return "\u6682\u65E0\u53EF\u6574\u7406\u7684\u4F1A\u8BDD";
  }
  /** Content revision over the files the panel renders. */
  async computeRevision() {
    const parts = [];
    for (const relative of [
      "preferences.md",
      ...documentTargets().map((target) => target.path),
      "state.json"
    ]) {
      const raw = await readTextOrUndefined(this.path(relative));
      parts.push(`${relative}:${raw === void 0 ? "missing" : revisionOf(raw)}`);
    }
    return revisionOf(parts.join("\n"));
  }
  /** Record a non-fatal warning for the next snapshot. */
  warn(message) {
    if (this.warnings.includes(message)) return;
    this.warnings.push(message);
  }
  /** Clear the warnings already shown. */
  clearWarnings() {
    this.warnings = [];
  }
};
function frontBooleanOr(front, key, fallback) {
  const value = front[key];
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

// src/index.ts
var PACKAGE_NAME = "dsh-memorybuddy";
var DEFAULT_PREFERENCES_VIEW = {
  ...DEFAULT_PREFERENCES,
  modelAllowlist: [...DEFAULT_PREFERENCES.modelAllowlist]
};
var inject = ["systemPrompt", "agents", "commands"];
var MEMORY_TOOL_NAMES = ["memorybuddy_recall", "memorybuddy_remember", "memorybuddy_forget"];
var MEMORY_TOOL_GUIDANCE = [
  "\u672C\u673A\u5DF2\u5B89\u88C5 dsh-memorybuddy \u63D2\u4EF6\uFF1A\u5B83\u628A\u8DE8\u4F1A\u8BDD\u7684\u957F\u671F\u8BB0\u5FC6\u4FDD\u5B58\u5728 $DSH_HOME/dsh-memorybuddy/ \u7684 markdown \u6587\u4EF6\u91CC\uFF0C",
  "\u5E76\u5728\u6BCF\u8F6E\u5BF9\u8BDD\u91CC\u628A\u7528\u6237\u504F\u597D\u3001\u4EBA\u8BBE\u3001\u6307\u4EE4\u4E0E\u8BB0\u5FC6\u7D22\u5F15\u6CE8\u5165\u5230\u8FD9\u91CC\u3002",
  "\u9700\u8981\u56DE\u5FC6\u7528\u6237\u504F\u597D\u3001\u73AF\u5883\u4E8B\u5B9E\u6216\u9879\u76EE\u7EA6\u5B9A\u65F6\u8C03\u7528 memorybuddy_recall\uFF1B",
  "\u7528\u6237\u660E\u786E\u8981\u6C42\u300C\u8BB0\u4F4F\u300D\u67D0\u4EF6\u4E8B\u65F6\u8C03\u7528 memorybuddy_remember\uFF1B",
  "\u8BB0\u5FC6\u6709\u8BEF\u6216\u5DF2\u8FC7\u671F\u65F6\u8C03\u7528 memorybuddy_forget\u3002",
  "\u5DE5\u5177\u6CA1\u8FD4\u56DE\u7684\u5185\u5BB9\u4E0D\u8981\u5F53\u4F5C\u5DF2\u77E5\u4E8B\u5B9E\u3002"
].join("");
function renderJson(_args, value) {
  return [{ type: "text", text: JSON.stringify(value, null, 2) }];
}
var JSON_OBJECT_SCHEMA = { type: "object", additionalProperties: true };
function workspaceOf(context) {
  const section = context;
  const cwd = section?.agent?.session?.header?.cwd;
  if (typeof cwd === "string" && cwd !== "") return cwd;
  const scope = section?.scope;
  const scoped = scope?.session?.header?.cwd;
  return typeof scoped === "string" ? scoped : "";
}
function callingSessionId(exec) {
  const agent = exec?.agent;
  const id = agent?.id ?? agent?.session?.id;
  return typeof id === "string" ? id : "tool";
}
function topicOf(text) {
  if (/路径|目录|安装|版本|venv|环境变量|命令|端口/.test(text)) return "environment";
  if (/项目|仓库|代码库|构建|约定|模块/.test(text)) return "background";
  if (/偏好|喜欢|风格|习惯|不要|以后都|先给结论/.test(text)) return "preferences-learned";
  return "habits";
}
function apply(ctx) {
  applyImpl(ctx);
}
var applyImpl = mountOnce(PACKAGE_NAME, (ctx) => {
  const logger = ctx.logger;
  const log = (message) => {
    try {
      logger?.info?.(`${PACKAGE_NAME}: ${message}`);
    } catch {
    }
    try {
      console.error(`${PACKAGE_NAME}: ${message}`);
    } catch {
    }
  };
  const store = new MemoryStore();
  const promptCache = new PromptCache(store);
  let collecting = true;
  let preferences;
  let watchedProject = "";
  const collector = new SessionCollector({
    store,
    enabled: () => collecting,
    log,
    onNote: () => {
      void refresh();
    }
  });
  const consolidator = new Consolidator(store, log);
  const picker = new ModelPicker();
  const resolveChain = async () => {
    const llm = service("llm");
    const view = preferences ?? DEFAULT_PREFERENCES_VIEW;
    const state = await store.readState();
    let available = [];
    if (llm?.listProviders !== void 0) {
      try {
        const providers = llm.listProviders() ?? [];
        if (llm.listModels !== void 0) {
          const catalogue = await picker.catalog(llm);
          available = catalogue.models.map((option) => ({ provider: option.provider, id: option.id }));
        } else {
          available = providers.map((provider) => ({ provider: provider.id, id: "" })).filter((item) => item.id !== "");
        }
      } catch {
        available = [];
      }
    }
    const sessionDefault = (() => {
      try {
        const selection = service("agentDefaultModel")?.currentSelection?.();
        if (selection?.provider === void 0 || selection.model === void 0) return void 0;
        return { provider: selection.provider, model: selection.model };
      } catch {
        return void 0;
      }
    })();
    const resolved = await picker.chain({
      preferences: view,
      cooldown: state.modelCooldown,
      llm,
      available,
      ...sessionDefault === void 0 ? {} : { sessionDefault }
    });
    return {
      llm,
      chain: resolved.chain,
      ...resolved.skipped === void 0 ? {} : { skippedReason: resolved.skipped }
    };
  };
  const distiller = new Distiller({
    log,
    routes: resolveChain,
    cooldown: {
      async record(provider, model, kind) {
        const minutes = COOLDOWN_MINUTES[kind];
        const until = Date.now() + minutes * 6e4;
        await store.patchState((current) => ({
          ...current,
          modelCooldown: { ...current.modelCooldown, [routeKey(provider, model)]: until }
        }));
        log(`\u6A21\u578B ${routeKey(provider, model)} \u8FDB\u5165\u51B7\u5374 ${minutes} \u5206\u949F\uFF08${kind}\uFF09`);
      },
      async clear(provider, model) {
        const key = routeKey(provider, model);
        await store.patchState((current) => {
          if (current.modelCooldown[key] === void 0) return current;
          const next = { ...current.modelCooldown };
          delete next[key];
          return { ...current, modelCooldown: next };
        });
      }
    }
  });
  consolidator.setDistiller(distiller);
  let disposeSection;
  let disposeTools;
  let refreshing;
  const service = (name) => {
    try {
      return ctx.get?.(name);
    } catch {
      return void 0;
    }
  };
  const toolsOf = () => {
    const tools = service("tools");
    return tools !== void 0 && typeof tools.register === "function" ? tools : void 0;
  };
  const memoryTool = () => ({
    name: "memorybuddy_recall",
    description: "\u68C0\u7D22\u8DE8\u4F1A\u8BDD\u957F\u671F\u8BB0\u5FC6\u3002\u4E0D\u4F20\u53C2\u6570\u65F6\u8FD4\u56DE\u8BB0\u5FC6\u7D22\u5F15\u4E0E\u5404\u4E3B\u9898\u7684\u6761\u76EE\u6570\uFF1B\u4F20 query \u65F6\u6309\u5173\u952E\u8BCD\u68C0\u7D22\u6761\u76EE\uFF08\u542B\u4F4E\u7F6E\u4FE1\u5019\u9009\uFF09\u3002",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "\u8981\u68C0\u7D22\u7684\u5173\u952E\u8BCD\u6216\u95EE\u9898\uFF1B\u7559\u7A7A\u8FD4\u56DE\u76EE\u5F55\u7D22\u5F15" },
        topic: {
          type: "string",
          enum: TOPICS.map((topic) => topic.key),
          description: "\u9650\u5B9A\u5728\u67D0\u4E2A\u4E3B\u9898\u5185\u68C0\u7D22\uFF08\u5DE5\u4F5C\u80CC\u666F / \u884C\u4E8B\u98CE\u683C / \u73AF\u5883\u8DEF\u5F84 / \u4E60\u5F97\u504F\u597D\uFF09"
        }
      },
      additionalProperties: false
    },
    output: { schema: JSON_OBJECT_SCHEMA, render: renderJson },
    async execute(args) {
      const query = typeof args.query === "string" ? args.query.trim() : "";
      const wanted = typeof args.topic === "string" ? args.topic : "";
      const topics = TOPICS.filter((topic) => wanted === "" || topic.key === wanted);
      if (query === "") {
        const index = await store.readDocument("memory/index.md");
        const counts = {};
        for (const topic of topics) counts[topic.key] = (await store.readEntries(topic.key)).length;
        return { ok: true, index: index.body, counts };
      }
      const needle = query.toLowerCase();
      const hits = [];
      for (const topic of topics) {
        for (const entry of await store.readEntries(topic.key)) {
          if (!entry.text.toLowerCase().includes(needle)) continue;
          hits.push({
            id: entry.id,
            topic: topic.key,
            topicTitle: topic.title,
            text: entry.text,
            confidence: entry.confidence,
            days: entry.days,
            last: entry.last,
            pinned: entry.pinned,
            conflict: entry.conflict
          });
        }
      }
      return { ok: true, query, count: hits.length, entries: hits.slice(0, 50) };
    }
  });
  const rememberTool = () => ({
    name: "memorybuddy_remember",
    description: "\u4E3B\u52A8\u8BB0\u4E0B\u4E00\u6761\u8DE8\u4F1A\u8BDD\u4E8B\u5B9E\u3002\u4EC5\u7528\u4E8E\u7528\u6237\u660E\u786E\u8981\u6C42\u8BB0\u4F4F\u7684\u5185\u5BB9\u3001\u7A33\u5B9A\u73AF\u5883\u4E8B\u5B9E\u3001\u9879\u76EE\u7EA6\u5B9A\u4E0E\u786C\u7EA6\u675F\uFF1B\u5BC6\u94A5\u7B49\u654F\u611F\u5185\u5BB9\u4F1A\u88AB\u62D2\u7EDD\u3002",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "\u8981\u8BB0\u4F4F\u7684\u5B8C\u6574\u53E5\u5B50\uFF0C\u5199\u6210\u53EF\u72EC\u7ACB\u9605\u8BFB\u7684\u4E8B\u5B9E" },
        topic: {
          type: "string",
          enum: TOPICS.map((topic) => topic.key),
          description: "\u5F52\u5165\u54EA\u4E2A\u4E3B\u9898\uFF1B\u7701\u7565\u65F6\u6309\u5185\u5BB9\u81EA\u52A8\u5F52\u7C7B"
        },
        scope: { type: "string", description: "\u53EF\u9009\u7684\u9002\u7528\u8303\u56F4\u8BF4\u660E\uFF08\u4F8B\u5982\u67D0\u4E2A\u9879\u76EE\u540D\uFF09" }
      },
      required: ["text"],
      additionalProperties: false
    },
    output: { schema: JSON_OBJECT_SCHEMA, render: renderJson },
    async execute(args, exec) {
      const raw = typeof args.text === "string" ? args.text.trim() : "";
      if (raw === "") return { ok: false, code: "empty", message: "\u6CA1\u6709\u53EF\u5199\u5165\u7684\u5185\u5BB9\u3002" };
      const cleaned = redact(raw);
      if (cleaned.warnings.length > 0) {
        for (const warning of cleaned.warnings) store.warn(warning);
        return { ok: false, code: "redacted", message: `\u5185\u5BB9\u547D\u4E2D\u654F\u611F\u4FE1\u606F\uFF08${cleaned.warnings.join("\uFF1B")}\uFF09\uFF0C\u5DF2\u62D2\u7EDD\u5199\u5165\u3002` };
      }
      const wanted = typeof args.topic === "string" ? args.topic : "";
      const topic = TOPICS.some((item) => item.key === wanted) ? wanted : topicOf(raw);
      const id = entryId(raw);
      const entries = await store.readEntries(topic);
      if (entries.some((entry) => entry.id === id)) {
        return { ok: true, topic, id, deduped: true, message: "\u8FD9\u6761\u8BB0\u5FC6\u5DF2\u7ECF\u5B58\u5728\uFF0C\u672A\u91CD\u590D\u5199\u5165\u3002" };
      }
      const today = dayKey();
      const source = typeof args.scope === "string" && args.scope.trim() !== "" ? `${args.scope.trim()}@${callingSessionId(exec)}` : callingSessionId(exec);
      const next = [
        ...entries,
        {
          id,
          line: entries.length,
          text: raw,
          confidence: "\u4F4E",
          days: 1,
          first: today,
          last: today,
          sources: [source],
          pinned: false,
          conflict: false
        }
      ];
      await store.writeEntries(topic, next);
      return {
        ok: true,
        topic,
        id,
        confidence: "\u4F4E",
        message: "\u5DF2\u5199\u5165\u3002\u540C\u4E00\u4E8B\u5B9E\u5728 2\u20133 \u4E2A\u4E0D\u540C\u65E5\u671F\u518D\u6B21\u51FA\u73B0\u540E\u4F1A\u81EA\u52A8\u5347\u4E3A\u300C\u4E2D\u300D\u5E76\u8FDB\u5165\u957F\u671F\u8BB0\u5FC6\u7D22\u5F15\u3002"
      };
    }
  });
  const forgetTool = () => ({
    name: "memorybuddy_forget",
    description: "\u8F6F\u5220\u9664\u4E00\u6761\u8BB0\u5FC6\uFF1A\u6761\u76EE\u79FB\u5165 archive/ \u76EE\u5F55\uFF0C\u53EF\u4EE5\u4EBA\u5DE5\u6062\u590D\uFF0C\u4E0D\u4F1A\u7269\u7406\u5220\u9664\u3002",
    parameters: {
      type: "object",
      properties: { id: { type: "string", description: "\u6761\u76EE id\uFF0C\u5F62\u5982 M-1a2b3c4d" } },
      required: ["id"],
      additionalProperties: false
    },
    output: { schema: JSON_OBJECT_SCHEMA, render: renderJson },
    async execute(args) {
      const id = typeof args.id === "string" ? args.id.trim() : "";
      if (id === "") return { ok: false, code: "empty", message: "\u7F3A\u5C11\u6761\u76EE id\u3002" };
      for (const topic of TOPICS) {
        const entries = await store.readEntries(topic.key);
        if (!entries.some((entry) => entry.id === id)) continue;
        const moved = await store.archiveEntries(topic.key, [id], "\u5DE5\u5177\u8F6F\u5220\u9664");
        return { ok: moved > 0, topic: topic.key, id, message: "\u5DF2\u79FB\u5165 archive/\uFF0C\u53EF\u901A\u8FC7\u624B\u5DE5\u7F16\u8F91\u6062\u590D\u3002" };
      }
      return { ok: false, code: "missing", message: `\u6CA1\u6709\u627E\u5230\u6761\u76EE ${id}\u3002` };
    }
  });
  const setToolsEnabled = (active) => {
    if (!active) {
      try {
        disposeTools?.();
      } catch {
      }
      disposeTools = void 0;
      return;
    }
    if (disposeTools !== void 0) return;
    const tools = toolsOf();
    if (tools === void 0) return;
    const disposers = [];
    try {
      for (const definition of [memoryTool(), rememberTool(), forgetTool()]) {
        const off = tools.register(definition);
        if (typeof off === "function") disposers.push(off);
      }
    } catch (error) {
      for (const off of disposers) {
        try {
          off();
        } catch {
        }
      }
      log(`\u5DE5\u5177\u6CE8\u518C\u5931\u8D25\uFF08agent \u5DE5\u5177\u5C06\u4E0D\u53EF\u7528\uFF09\uFF1A${String(error)}`);
      return;
    }
    disposeTools = () => {
      for (const off of disposers) off();
    };
  };
  const toolsVisible = (context) => {
    const tools = toolsOf();
    if (tools === void 0) return false;
    const scope = context?.scope;
    for (const name of MEMORY_TOOL_NAMES) {
      try {
        if (tools.get(name, scope) !== void 0) return true;
      } catch {
        return true;
      }
    }
    return false;
  };
  const syncSection = () => {
    if (disposeSection !== void 0) {
      try {
        disposeSection();
      } catch {
      }
      disposeSection = void 0;
    }
    if (preferences === void 0) return;
    try {
      const off = ctx.systemPrompt.section({
        name: SECTION_NAME,
        order: SECTION_ORDER,
        // Memory is user prose and may legitimately contain `{{ }}`: expanding
        // it as a template would either throw or silently eat the text.
        interpolate: false,
        text: (context) => {
          const workspace = workspaceOf(context);
          if (workspace !== "" && workspace !== watchedProject) {
            watchedProject = workspace;
            void promptCache.watchProject(workspace).catch(() => void 0);
          }
          const rendered = promptCache.render(workspace);
          if (rendered.text === "") return "";
          return toolsVisible(context) ? `${rendered.text}

${MEMORY_TOOL_GUIDANCE}` : rendered.text;
        }
      });
      if (typeof off === "function") disposeSection = off;
    } catch (error) {
      log(`\u7CFB\u7EDF\u63D0\u793A\u6CE8\u5165\u5931\u8D25\uFF08\u8BB0\u5FC6\u5C06\u4E0D\u8FDB\u5165\u63D0\u793A\u8BCD\uFF09\uFF1A${String(error)}`);
    }
  };
  const refreshNow = async () => {
    try {
      preferences = await store.readPreferences();
      collecting = preferences.conversationMemory;
      await promptCache.prime();
      syncSection();
      setToolsEnabled(preferences.localMemorySkills);
    } catch (error) {
      log(`\u72B6\u6001\u5237\u65B0\u5931\u8D25\uFF1A${String(error)}`);
    }
  };
  const refresh = () => {
    const next = (refreshing ?? Promise.resolve()).then(refreshNow, refreshNow);
    refreshing = next.catch(() => void 0);
    return next;
  };
  const routes = memoryRoutes({
    store,
    consolidator,
    onChanged: () => {
      void refresh();
    },
    log,
    /**
     * 彻底删除 (P8) drops every in-memory session buffer before the delete runs.
     *
     * Without this a session that was mid-flight at wipe time flushes itself on
     * its next timer tick and recreates the memory root together with the content
     * the user was just told had been destroyed.
     */
    forgetSessions: () => collector.forgetAll(),
    /**
     * Live facts, computed per request.
     *
     * `running` comes from the consolidator itself; the model pick is validated
     * against the live registry so the card can say "这个模型现在解析不了"
     * instead of failing on the next pass.
     */
    runtime: async () => {
      const view = preferences ?? DEFAULT_PREFERENCES_VIEW;
      const llm = service("llm");
      const state = await store.readState();
      const provider = view.modelChoiceProvider.trim();
      const model = view.modelChoiceModel.trim();
      const chosen = provider !== "" && model !== "";
      const choice = {
        provider,
        model,
        chosen,
        ok: false,
        efforts: [],
        blockedByAllowlist: chosen && !allows(view.modelAllowlist, provider, model),
        cooling: chosen && picker.cooling(state, provider, model),
        disabled: view.modelPolicy === "off"
      };
      if (chosen && !choice.blockedByAllowlist) {
        const checked = await picker.validate(llm, provider, model);
        choice.ok = checked.ok;
        choice.efforts = checked.efforts;
        if (checked.reason !== void 0) choice.reason = checked.reason;
        if (checked.defaultEffort !== void 0) choice.defaultEffort = checked.defaultEffort;
        if (checked.contextWindow !== void 0) choice.contextWindow = checked.contextWindow;
      } else if (choice.blockedByAllowlist) {
        choice.reason = "\u4E0D\u5728\u767D\u540D\u5355\u91CC";
      }
      return { running: consolidator.busy, modelChoice: choice };
    },
    catalog: async () => await picker.catalog(service("llm"))
  });
  const scheduler = new ConsolidationScheduler({
    store,
    consolidator,
    preferences: () => preferences ?? DEFAULT_PREFERENCES_VIEW,
    log,
    onRun: () => {
      void refresh();
    }
  });
  ctx.effect?.(() => {
    scheduler.start();
    return () => {
      scheduler.stop();
    };
  }, `${PACKAGE_NAME}: consolidation scheduler`);
  ctx.effect?.(() => {
    const disposers = [];
    let torn = false;
    const register = (scoped) => {
      const server = typeof scoped.get === "function" ? scoped.get("webServer") : void 0;
      if (server === void 0 || typeof server.register !== "function") {
        log("\u672A\u68C0\u6D4B\u5230 webServer\uFF0C\u8DF3\u8FC7 HTTP \u8DEF\u7531\u6CE8\u518C\uFF08\u8BB0\u5FC6\u4E0E\u5DE5\u5177\u7167\u5E38\u5DE5\u4F5C\uFF09");
        return;
      }
      const owned = [];
      try {
        for (const route of routes) {
          const off = server.register(route);
          if (typeof off === "function") owned.push(off);
        }
      } catch (error) {
        for (const off of owned.splice(0)) {
          try {
            off();
          } catch {
          }
        }
        throw error;
      }
      if (torn) {
        for (const off of owned.splice(0)) off();
        return;
      }
      disposers.push(...owned);
    };
    if (typeof ctx.inject !== "function") {
      log("\u672A\u68C0\u6D4B\u5230 ctx.inject\uFF0C\u8DF3\u8FC7 HTTP \u8DEF\u7531\u6CE8\u518C\uFF08\u8BB0\u5FC6\u4E0E\u5DE5\u5177\u7167\u5E38\u5DE5\u4F5C\uFF09");
      return void 0;
    }
    ctx.inject(["webServer"], register);
    return () => {
      torn = true;
      for (const off of disposers.splice(0)) off();
    };
  }, `${PACKAGE_NAME}: http routes`);
  ctx.effect?.(() => {
    const disposers = [];
    const subscribe = (event, listener) => {
      const handle = ctx.on?.(event, listener);
      if (typeof handle === "function") disposers.push(handle);
    };
    subscribe("session/event", (session, event) => {
      scheduler.touch();
      collector.observe(session, event);
    });
    subscribe("session/flush", (session) => {
      void collector.flush(session);
      scheduler.sessionEnded();
    });
    subscribe("session/disposed", (session) => {
      void collector.dispose(session);
      scheduler.sessionEnded();
    });
    try {
      const live = ctx.agents.list();
      collector.adopt(live.map((agent) => agent.session));
    } catch {
    }
    return () => {
      for (const off of disposers.splice(0)) off();
      collector.forgetAll();
    };
  }, `${PACKAGE_NAME}: session collector`);
  ctx.effect?.(() => () => {
    try {
      disposeSection?.();
    } catch {
    }
    disposeSection = void 0;
    setToolsEnabled(false);
    collector.forgetAll();
  }, `${PACKAGE_NAME}: prompt section and tools`);
  ctx.effect?.(() => {
    const handle = ctx.on?.("llm/adapters-updated", () => picker.invalidate());
    return () => {
      if (typeof handle === "function") handle();
    };
  }, `${PACKAGE_NAME}: model catalogue invalidation`);
  try {
    const off = ctx.commands.register({
      name: "memory",
      description: "\u67E5\u770B\u957F\u671F\u8BB0\u5FC6\u72B6\u6001\uFF0C\u6216\u7ACB\u5373\u6267\u884C\u4E00\u6B21\u786E\u5B9A\u6027\u6574\u7406",
      input: { hint: "\u72B6\u6001 | \u6574\u7406" },
      // The runtime hands the handler a frozen `{ commandId, agent, rawInput,
      // attachments, signal }` invocation, not the raw text.
      handler: async (invocation) => {
        const raw = invocation?.rawInput;
        const argument = typeof raw === "string" ? raw.trim() : "";
        if (argument === "\u6574\u7406") {
          const report = await consolidator.run("\u624B\u52A8\u6574\u7406");
          return {
            kind: "success",
            text: `\u6574\u7406\u5B8C\u6210\uFF1A\u626B\u63CF ${report.scanned} \u6761\u5019\u9009\uFF0C\u65B0\u589E ${report.added}\uFF0C\u5408\u5E76 ${report.merged}\uFF0C\u5F52\u6863 ${report.archived}\u3002`
          };
        }
        const snapshot = await store.snapshot();
        const pending = snapshot.sessions.pending;
        const drafts = snapshot.drafts.length;
        return {
          kind: "success",
          text: [
            `\u8BB0\u5FC6\u76EE\u5F55\uFF1A${snapshot.root}`,
            `\u5F85\u6574\u7406\u4F1A\u8BDD\uFF1A${pending} \u4E2A \xB7 \u5F85\u6279\u51C6\u6280\u80FD\uFF1A${drafts} \u4E2A`,
            `\u4E0A\u6B21\u6574\u7406\uFF1A${snapshot.consolidation.lastAt ?? "\uFF08\u8FD8\u6CA1\u6709\u6574\u7406\u8FC7\uFF09"}`,
            snapshot.consolidation.modelNote
          ].join("\n")
        };
      }
    });
    if (typeof off === "function") {
      ctx.effect?.(() => () => {
        ;
        off();
      }, `${PACKAGE_NAME}: /memory command`);
    }
  } catch (error) {
    log(`/memory \u547D\u4EE4\u6CE8\u518C\u5931\u8D25\uFF1A${String(error)}`);
  }
  void (async () => {
    try {
      await store.ensure();
      await refresh();
      log(`\u5DF2\u5C31\u7EEA\uFF0C\u8BB0\u5FC6\u76EE\u5F55\uFF1A${store.root}`);
    } catch (error) {
      log(`\u521D\u59CB\u5316\u5931\u8D25\uFF1A${String(error)}`);
    }
  })();
});
export {
  MEMORY_TOOL_GUIDANCE,
  MEMORY_TOOL_NAMES,
  apply,
  inject
};
//# sourceMappingURL=index.js.map
