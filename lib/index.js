// src/protocol.ts
var API_PREFIX = "/api/memorybuddy";
var REPLY_STYLES = ["\u9ED8\u8BA4", "\u7B80\u6D01", "\u8BE6\u7EC6", "\u6559\u5B66", "\u76F4\u63A5"];
var CONSOLIDATE_MODES = ["startup-idle", "idle", "session-end", "fixed"];
var MODEL_POLICIES = ["free-first", "allowlist", "session-default", "off"];
var CONFIDENCES = ["\u4F4E", "\u4E2D", "\u9AD8"];
var TOPICS = [
  { key: "background", file: "background.md", title: "\u5DE5\u4F5C\u80CC\u666F" },
  { key: "habits", file: "habits.md", title: "\u884C\u4E8B\u98CE\u683C" },
  { key: "environment", file: "environment.md", title: "\u73AF\u5883\u8DEF\u5F84" },
  { key: "preferences-learned", file: "preferences-learned.md", title: "\u4E60\u5F97\u504F\u597D" }
];
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
      this.stateFor(session);
      this.backfill(session);
    }
  }
  /** Sessions currently tracked, for diagnostics. */
  get tracked() {
    return this.sessions.size;
  }
  /** Live state of one session, creating it on first sight. */
  stateFor(session) {
    const existing = this.sessions.get(session.id);
    if (existing !== void 0) {
      const workspace = sessionWorkspace(session);
      if (workspace !== "" && existing.workspace === "") existing.workspace = workspace;
      return existing;
    }
    const state = {
      id: session.id,
      workspace: sessionWorkspace(session),
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
    for (const event of userLines) {
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

// src/host/consolidate.ts
var DECAY_DAYS = { \u4F4E: 30, \u4E2D: 90, \u9AD8: null };
var STALE_QUESTION_DAYS = 180;
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
  running = false;
  constructor(store, log) {
    this.store = store;
    this.log = log;
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
      at
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
    const consumed = [];
    for (const relative of pending) {
      const document = await this.store.readDocument(relative);
      if (document.body.trim() === "" && Object.keys(document.front).length === 0) continue;
      const date = frontString(document.front, "started", today).slice(0, 10);
      candidates.push(...candidatesFrom(document.body, relative, /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today));
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
    if (consumed.length > 0 || changedTopics.length > 0) {
      await this.store.appendJournal(this.journalLines(report, consumed, changedTopics));
    }
    await this.store.patchState((current) => ({
      ...current,
      pending: current.pending.filter((relative) => !consumed.includes(relative)),
      lastConsolidateAt: report.at,
      questions: this.mergeQuestions(current.questions, report.questions)
    }));
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
      "\u6A21\u578B\u63D0\u70BC\uFF1A\u672A\u542F\u7528\uFF08\u9996\u7248\u53EA\u505A\u786E\u5B9A\u6027\u6574\u7406\uFF09"
    ];
    if (report.questions.length > 0) {
      lines.push(`\u5F85\u786E\u8BA4 ${report.questions.length} \u9879\uFF1A`);
      for (const question of report.questions) lines.push(`  - ${question}`);
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

// src/host/prompt.ts
var SECTION_NAME = "plugin:memorybuddy";
var SECTION_ORDER = 120;
var TOOL_HINT = "\uFF08\u66F4\u591A\u8BB0\u5FC6\u89C1 memorybuddy_recall \u5DE5\u5177\uFF09";
var PromptCache = class {
  store;
  preferences;
  documents = /* @__PURE__ */ new Map();
  primed = false;
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
    if (this.documents.has(relative)) return;
    const document = await this.store.readDocument(relative);
    this.documents.set(relative, document.body);
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
  return [
    {
      kind: "exact",
      path: `${API_PREFIX}/state`,
      handler: async (request, response) => {
        if (request.method !== "GET") return writeJson(response, 405, { ok: false, error: "method-not-allowed" });
        if (!guard(request, response)) return;
        const snapshot = await host.store.snapshot();
        writeJson(response, 200, snapshot);
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
        writeJson(response, 200, { ok: true, snapshot: await host.store.snapshot() });
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
        writeJson(response, 200, { ok: true, snapshot: await host.store.snapshot() });
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
            snapshot: await host.store.snapshot()
          });
        }
        try {
          const result = await runAction(host, record);
          host.onChanged();
          writeJson(response, 200, { ok: true, result, snapshot: await host.store.snapshot() });
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
    case "forget-entry":
      return { removed: await host.store.editEntry(action.topic, action.id, { remove: true }) };
    case "pin-entry":
      return { pinned: await host.store.editEntry(action.topic, action.id, { pinned: action.pinned }) };
    case "dismiss-question":
      return { dismissed: await host.store.dismissQuestion(action.index) };
    case "rollback":
      return await host.store.rollback(action.date);
    case "approve-draft":
      return { approved: await host.store.approveDraft(action.name) };
    case "discard-draft":
      return { discarded: await host.store.discardDraft(action.name) };
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
import { join as join3 } from "node:path";

// src/host/fsx.ts
import { randomBytes } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
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

// src/host/dsh-home.ts
import { homedir } from "node:os";
import { isAbsolute, join as join2, resolve } from "node:path";
function expandHome(path, home = homedir()) {
  if (path === "~") return home;
  if (path.startsWith("~/") || path.startsWith("~\\")) return join2(home, path.slice(2));
  return path;
}
function resolveDshHome(env = process.env, home = homedir()) {
  const configured = env.DSH_HOME?.trim();
  if (configured !== void 0 && configured !== "") {
    const expanded = expandHome(configured, home);
    return isAbsolute(expanded) ? expanded : resolve(expanded);
  }
  return join2(home, ".dsh");
}
var MEMORY_DIR_NAME = "dsh-memorybuddy";
function resolveMemoryRoot(env = process.env) {
  return join2(resolveDshHome(env), MEMORY_DIR_NAME);
}
function resolveSkillsRoot(env = process.env) {
  return join2(resolveDshHome(env), "skills");
}

// src/host/store.ts
var EMPTY_STATE = {
  schema: 1,
  processed: {},
  pending: [],
  lastConsolidateAt: null,
  modelCooldown: {},
  confidence: {},
  questions: []
};
var SECRET_PATTERNS = [
  { label: "OpenAI \u98CE\u683C\u5BC6\u94A5", pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/ },
  { label: "GitHub \u4EE4\u724C", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { label: "AWS Access Key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: "Bearer \u4EE4\u724C", pattern: /\bBearer\s+[A-Za-z0-9._-]{20,}/i },
  { label: "\u79C1\u94A5\u5757", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: "\u8D4B\u503C\u5F0F\u53E3\u4EE4", pattern: /\b(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S{8,}/i }
];
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
  return { text: result, warnings };
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
    return join3(this.root, relative);
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
    for (const directory of ["memory/projects", "sessions", "journal", "skills-draft", "archive"]) {
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
      return {
        schema: typeof parsed.schema === "number" ? parsed.schema : 1,
        processed: parsed.processed ?? {},
        pending: Array.isArray(parsed.pending) ? parsed.pending : [],
        lastConsolidateAt: parsed.lastConsolidateAt ?? null,
        modelCooldown: parsed.modelCooldown ?? {},
        confidence: parsed.confidence ?? {},
        questions: Array.isArray(parsed.questions) ? parsed.questions.filter((item) => typeof item === "string") : []
      };
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
          const parsed = JSON.parse(raw);
          current = {
            schema: typeof parsed.schema === "number" ? parsed.schema : 1,
            processed: parsed.processed ?? {},
            pending: Array.isArray(parsed.pending) ? parsed.pending : [],
            lastConsolidateAt: parsed.lastConsolidateAt ?? null,
            modelCooldown: parsed.modelCooldown ?? {},
            confidence: parsed.confidence ?? {},
            questions: Array.isArray(parsed.questions) ? parsed.questions.filter((item) => typeof item === "string") : []
          };
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
  /** Write one session note. */
  async writeSessionNote(date, id, front, body) {
    const relative = `sessions/${date}/${id}.md`;
    await ensureDir(this.path(`sessions/${date}`));
    const document = await this.readDocument(relative);
    const merged = { kind: "session-note", schema: 1, ...document.front, ...front };
    await writeFileAtomic(this.path(relative), renderDocument(merged, body));
    return relative;
  }
  /** Skill drafts awaiting approval. */
  async readDrafts() {
    const names = await listDir(this.path("skills-draft"));
    const drafts = [];
    for (const name of names) {
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
      await writeFileAtomic(join3(directory, relative.replaceAll("/", "__")), raw);
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
      const raw = await readTextOrUndefined(join3(directory, item.name));
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
      const destination = join3(directory, relative);
      await ensureDir(join3(destination, ".."));
      await movePath(source, destination);
      moved.push(relative);
    }
    const raw = await readTextOrUndefined(this.path("state.json"));
    if (raw !== void 0) await writeFileAtomic(join3(directory, "state.json"), raw);
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
  /** Promote a draft into `$DSH_HOME/skills/<name>/SKILL.md`. */
  async approveDraft(name) {
    const source = await readTextOrUndefined(this.path(`skills-draft/${name}/SKILL.md`));
    if (source === void 0) return false;
    await writeFileAtomic(join3(this.skillsRoot, name, "SKILL.md"), source);
    await removeFile(this.path(`skills-draft/${name}/SKILL.md`)).catch(() => void 0);
    return true;
  }
  /** Drop a draft without promoting it. */
  async discardDraft(name) {
    const target = this.path(`skills-draft/${name}/SKILL.md`);
    if (!await exists(target)) return false;
    await removeFile(target);
    return true;
  }
  /** Build the snapshot the panel renders. */
  async snapshot() {
    await this.ensure();
    const [preferences, state, sessions, drafts, allEntries] = await Promise.all([
      this.readPreferences(),
      this.readState(),
      this.readSessions(),
      this.readDrafts(),
      this.readAllEntries()
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
        // The deterministic stage is what actually runs today; the model stage
        // upgrades this to `'model'` once P5 lands, and `modelNote` says which.
        modelStage: state.lastConsolidateAt === null ? "disabled" : "deterministic",
        modelNote: state.lastConsolidateAt === null ? "\u8FD8\u6CA1\u6709\u6574\u7406\u8FC7\uFF08\u6A21\u578B\u63D0\u70BC\u672A\u542F\u7528\uFF09" : "\u786E\u5B9A\u6027\u6574\u7406\u5DF2\u542F\u7528\uFF1B\u6A21\u578B\u63D0\u70BC\u672A\u542F\u7528"
      },
      questions: [...state.questions],
      history: await this.readHistory(),
      drafts,
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
    log
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
