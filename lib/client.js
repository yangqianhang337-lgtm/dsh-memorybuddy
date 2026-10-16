window.__ModuleLoader__.load({
  id: "dsh-memorybuddy",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    let react = require("react");
    let react_jsx_runtime = require("react/jsx-runtime");
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/locales.ts
var NS = "memorybuddy";
var zh = {
  "entry.label": "MemoryBuddy",
  "entry.tip": "MemoryBuddy \u4E2A\u6027\u5316\u4E0E\u8BB0\u5FC6",
  "nav.personalize": "\u4E2A\u6027\u5316",
  "nav.memory": "\u8BB0\u5FC6\u4E0E\u8FDB\u5316",
  "nav.search": "\u641C\u7D22\u8BBE\u7F6E\u9879\u6216\u8BB0\u5FC6",
  "personalize.title": "\u4E2A\u6027\u5316",
  "personalize.subtitle": "\u8FD9\u4E9B\u8BBE\u7F6E\u4F1A\u7ACB\u5373\u751F\u6548\uFF0C\u5E76\u5199\u5165\u672C\u673A\u7684\u8BB0\u5FC6\u76EE\u5F55\u3002",
  "card.userName.title": "MemoryBuddy \u5BF9\u4F60\u7684\u79F0\u547C",
  "card.agentName.title": "MemoryBuddy \u7684\u540D\u5B57",
  "card.replyStyle.title": "\u56DE\u590D\u98CE\u683C",
  "card.replyStyle.desc": "\u9009\u62E9 MemoryBuddy \u56DE\u590D\u7684\u9ED8\u8BA4\u8BED\u6C14\u3002",
  "card.welcome.title": "\u6B22\u8FCE\u8BED",
  "card.welcome.desc": "\u5F53\u5BF9\u8BDD\u52A0\u8F7D\u8F83\u6162\u65F6\uFF0C\u7528\u4E00\u53E5\u95EE\u5019\u966A\u4F60\u7B49\u5F85\u3002",
  "card.showFileChanges.title": "\u663E\u793A\u6587\u4EF6\u4FEE\u6539\u8FC7\u7A0B",
  "card.showFileChanges.desc": "\u5F00\u542F\u540E\uFF0CMemoryBuddy \u4F1A\u9010\u6B65\u5C55\u793A\u6BCF\u6B21\u6587\u4EF6\u6539\u52A8\u7684\u8FC7\u7A0B\u4E0E\u7ED3\u679C\u3002",
  "card.instructions.title": "\u7ED9 MemoryBuddy \u7684\u6307\u4EE4",
  "card.instructions.desc": "\u5199\u4E0B\u4F60\u5E0C\u671B MemoryBuddy \u4E00\u76F4\u9075\u5B88\u7684\u8981\u6C42\uFF0C\u4E4B\u540E\u6BCF\u6B21\u5BF9\u8BDD\u548C\u4EFB\u52A1\u90FD\u4F1A\u9ED8\u8BA4\u751F\u6548\u3002",
  "card.instructions.placeholder": "\u4F8B\u5982\uFF1A\u56DE\u7B54\u5C3D\u91CF\u7B80\u6D01\uFF0C\u5148\u7ED9\u7ED3\u8BBA",
  "card.persona.title": "\u4EBA\u8BBE\u8BBE\u5B9A",
  "card.persona.desc": "\u8BBE\u5B9A MemoryBuddy \u7684\u8EAB\u4EFD\u3001\u6027\u683C\u4E0E\u8868\u8FBE\u98CE\u683C\uFF0C\u5BF9\u6240\u6709\u56DE\u590D\u751F\u6548\u3002",
  "card.longTerm.title": "\u957F\u671F\u8BB0\u5FC6",
  "card.longTerm.desc": "\u8DE8\u4F1A\u8BDD\u4FDD\u5B58\u7684\u91CD\u8981\u4FE1\u606F\u4E0E\u7ED3\u8BBA\uFF0C\u53EF\u968F\u65F6\u67E5\u770B\u548C\u4FEE\u6539\u3002",
  "memory.title": "\u8BB0\u5FC6\u4E0E\u8FDB\u5316",
  "memory.subtitle": "\u81EA\u52A8\u6574\u7406\u66F4\u65B0\uFF0C\u53EF\u968F\u65F6\u67E5\u770B\u548C\u7F16\u8F91",
  "card.conversationMemory.title": "\u5BF9\u8BDD\u8BB0\u5FC6",
  "card.conversationMemory.desc": "\u8BB0\u4F4F\u5BF9\u8BDD\u4E2D\u7684\u91CD\u8981\u4FE1\u606F\uFF0C\u8BA9\u540E\u7EED\u56DE\u7B54\u66F4\u8D34\u5408\u4F60\u3002",
  "card.localMemorySkills.title": "\u672C\u5730\u8BB0\u5FC6\u4E0E\u6280\u80FD",
  "card.localMemorySkills.desc": "\u81EA\u52A8\u8BB0\u5F55\u5DE5\u4F5C\u8FC7\u7A0B\u5E76\u4F18\u5316\u6280\u80FD\uFF0C\u6570\u636E\u4EC5\u4FDD\u5B58\u5728\u4F60\u7684\u8BBE\u5907\u4E0A\u3002",
  "card.manage.title": "\u7BA1\u7406\u8BB0\u5FC6",
  "card.manage.desc": "\u81EA\u52A8\u6574\u7406\u66F4\u65B0\uFF0C\u53EF\u968F\u65F6\u67E5\u770B\u548C\u7F16\u8F91\u3002",
  "memory.schedule": "\u6574\u7406\u65F6\u673A",
  "memory.next": "\u4E0B\u6B21\u6574\u7406",
  "memory.last": "\u4E0A\u6B21\u6574\u7406",
  "memory.never": "\uFF08\u8FD8\u6CA1\u6709\u6574\u7406\u8FC7\uFF09",
  "memory.pending": "{count} \u4E2A\u4F1A\u8BDD\u5F85\u6574\u7406",
  "memory.modelStage": "\u6A21\u578B\u63D0\u70BC\u672A\u542F\u7528\uFF08\u9996\u7248\uFF09",
  "memory.questions": "\u5F85\u4F60\u786E\u8BA4",
  "memory.questionsHint": "\u6574\u7406\u65F6\u53D1\u73B0\u8FD9\u51E0\u5904\u4E92\u76F8\u77DB\u76FE\u6216\u4E45\u672A\u66F4\u65B0\uFF0C\u5904\u7406\u5B8C\u8BF7\u70B9\u300C\u77E5\u9053\u4E86\u300D\u3002",
  "memory.history": "\u6574\u7406\u5386\u53F2",
  "memory.historyHint": "\u6BCF\u5929\u7B2C\u4E00\u6B21\u6574\u7406\u524D\u4F1A\u5148\u5907\u4EFD\uFF1B\u56DE\u6EDA\u4F1A\u628A\u5F53\u5929\u7684\u5907\u4EFD\u5199\u56DE\uFF0C\u56DE\u6EDA\u524D\u7684\u72B6\u6001\u4E5F\u4F1A\u518D\u5907\u4EFD\u4E00\u6B21\u3002",
  "memory.historyEmpty": "\u8FD8\u6CA1\u6709\u53EF\u56DE\u6EDA\u7684\u5907\u4EFD\u3002",
  "memory.historyBackups": "{count} \u4E2A\u6587\u4EF6",
  "memory.rollback": "\u56DE\u6EDA\u5230\u8FD9\u4E00\u5929",
  "memory.rollbackOpen": "\u67E5\u770B\u5F53\u5929\u65E5\u5FD7",
  "memory.entriesHint": "\u53EA\u5728\u670D\u52A1\u7AEF\u8BB0\u4E0B\u6761\u76EE\uFF1B\u5185\u5BB9\u59CB\u7EC8\u4EE5 markdown \u6587\u4EF6\u4E3A\u51C6\u3002",
  "memory.footerLead": "\u8BB0\u5FC6\u5185\u5BB9\u9075\u5FAA ",
  "memory.privacyPolicy": "MemoryBuddy \u9690\u79C1\u653F\u7B56",
  "memory.footerTail": "\uFF0C\u4EC5\u4F60\u672C\u4EBA\u53EF\u89C1",
  "memory.hits": "\u547D\u4E2D {count} \u6761\u8BB0\u5FC6",
  "memory.noHits": "\u6CA1\u6709\u547D\u4E2D\u300C{query}\u300D",
  "memory.footer": "\u8BB0\u5FC6\u5185\u5BB9\u9075\u5FAA MemoryBuddy \u9690\u79C1\u653F\u7B56\uFF0C\u4EC5\u4F60\u672C\u4EBA\u53EF\u89C1",
  "memory.entries": "\u5DF2\u8BB0\u4F4F\u7684\u6761\u76EE",
  "memory.entriesEmpty": "\u8FD8\u6CA1\u6709\u79EF\u7D2F\u5230\u6761\u76EE\u3002\u591A\u804A\u51E0\u8F6E\u540E\u4F1A\u81EA\u52A8\u51FA\u73B0\u3002",
  "memory.sessions": "\u6700\u8FD1\u7684\u4F1A\u8BDD\u6C89\u6DC0",
  "memory.sessionsEmpty": "\u8FD8\u6CA1\u6709\u4F1A\u8BDD\u6C89\u6DC0\u6587\u4EF6\u3002",
  "memory.sessionEvents": "{count} \u6761\u4E8B\u4EF6",
  "memory.sessionPending": "\u5F85\u6574\u7406",
  "memory.sessionDone": "\u5DF2\u6574\u7406",
  "card.consolidateQuiet.title": "\u9759\u9ED8\u6574\u7406",
  "card.consolidateQuiet.desc": "\u6574\u7406\u65F6\u4E0D\u5F39\u51FA\u63D0\u793A\uFF0C\u53EA\u5728\u8BB0\u5FC6\u9875\u7559\u4E0B\u8BB0\u5F55\u3002",
  "schedule.startup-idle": "\u542F\u52A8\u8865\u9F50 + \u7A7A\u95F2\u65F6",
  "schedule.idle": "\u7A7A\u95F2\u65F6",
  "schedule.session-end": "\u4F1A\u8BDD\u7ED3\u675F\u65F6",
  "schedule.fixed": "\u6BCF\u5929\u56FA\u5B9A\u65F6\u95F4",
  "topic.background": "\u5DE5\u4F5C\u80CC\u666F",
  "topic.habits": "\u884C\u4E8B\u98CE\u683C",
  "topic.environment": "\u672C\u673A\u8F6F\u4EF6\u4E0E\u8DEF\u5F84",
  "topic.preferences-learned": "\u4E60\u5F97\u504F\u597D",
  "action.edit": "\u7F16\u8F91",
  "action.save": "\u4FDD\u5B58",
  "action.cancel": "\u53D6\u6D88",
  "action.preview": "\u9884\u89C8",
  "action.raw": "\u539F\u6587",
  "action.reset": "\u91CD\u7F6E",
  "action.import": "\u5BFC\u5165",
  "action.consolidate": "\u7ACB\u5373\u6574\u7406",
  "action.openFolder": "\u6253\u5F00\u8BB0\u5FC6\u76EE\u5F55",
  "action.copyPath": "\u590D\u5236\u8BB0\u5FC6\u76EE\u5F55\u8DEF\u5F84",
  "action.privacy": "\u67E5\u770B\u9690\u79C1\u89C4\u5219",
  "action.forget": "\u9057\u5FD8",
  "action.pin": "\u56FA\u5B9A",
  "action.unpin": "\u53D6\u6D88\u56FA\u5B9A",
  "action.approve": "\u6279\u51C6",
  "action.discard": "\u4E22\u5F03",
  "action.retry": "\u91CD\u8BD5",
  "action.reload": "\u91CD\u65B0\u52A0\u8F7D",
  "action.history": "\u5386\u53F2",
  "action.dismiss": "\u77E5\u9053\u4E86",
  "toast.saved": "\u5DF2\u4FDD\u5B58",
  "toast.failed": "\u4FDD\u5B58\u5931\u8D25",
  "toast.imported": "\u5DF2\u5BFC\u5165\u5E76\u5408\u5E76",
  "toast.consolidated": "\u6574\u7406\u5B8C\u6210",
  "toast.consolidating": "\u5DF2\u5F00\u59CB\u6574\u7406\uFF0C\u7A0D\u540E\u5237\u65B0\u67E5\u770B\u7ED3\u679C",
  "toast.reset": "\u5DF2\u91CD\u7F6E",
  "toast.resetAll": "\u5168\u90E8\u8BB0\u5FC6\u5DF2\u79FB\u5165 archive/\uFF0C\u9AA8\u67B6\u5DF2\u91CD\u5EFA",
  "toast.rolledBack": "\u5DF2\u56DE\u6EDA",
  "toast.dismissed": "\u5DF2\u6807\u8BB0\u4E3A\u77E5\u9053",
  "toast.forgotten": "\u5DF2\u79FB\u5165 archive/",
  "toast.approved": "\u5DF2\u6279\u51C6\u5E76\u5199\u5165\u6280\u80FD\u76EE\u5F55",
  "toast.discarded": "\u5DF2\u4E22\u5F03\u8349\u7A3F",
  "toast.pathCopied": "\u8BB0\u5FC6\u76EE\u5F55\u8DEF\u5F84\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F",
  "confirm.reset.title": "\u91CD\u7F6E\u957F\u671F\u8BB0\u5FC6\uFF1F",
  "confirm.reset.body": "\u5168\u90E8\u8BB0\u5FC6\uFF08memory/\u3001sessions/\u3001journal/\u3001\u4EBA\u8BBE\u4E0E\u6307\u4EE4\uFF09\u4F1A\u79FB\u5165 archive/reset-<\u65F6\u95F4\u6233>/\uFF0C\u4E0D\u4F1A\u5220\u9664\u3002\u786E\u8BA4\u91CD\u7F6E\uFF1F",
  "confirm.reset.ok": "\u5F52\u6863\u5E76\u91CD\u7F6E",
  "confirm.forget.title": "\u9057\u5FD8\u8FD9\u6761\u8BB0\u5FC6\uFF1F",
  "confirm.forget.body": "\u6761\u76EE\u4F1A\u88AB\u79FB\u5165 archive/\uFF0C\u53EF\u4EE5\u4EBA\u5DE5\u6062\u590D\u3002",
  "confirm.forget.ok": "\u9057\u5FD8",
  "confirm.rollback.title": "\u56DE\u6EDA\u5230\u8FD9\u4E00\u5929\u7684\u5907\u4EFD\uFF1F",
  "confirm.rollback.body": "\u5F53\u5929\u5907\u4EFD\u8986\u76D6\u7684\u6587\u4EF6\u4F1A\u88AB\u5199\u56DE\uFF0C\u56DE\u6EDA\u524D\u7684\u5F53\u524D\u72B6\u6001\u4F1A\u5148\u518D\u5907\u4EFD\u4E00\u6B21\u3002",
  "confirm.rollback.ok": "\u56DE\u6EDA",
  "conflict.title": "\u8FD9\u4EFD\u5185\u5BB9\u5728\u522B\u5904\u88AB\u6539\u8FC7",
  "conflict.body": "\u4F60\u7684\u7F16\u8F91\u6CA1\u6709\u4E22\uFF1A\u9009\u62E9\u4FDD\u7559\u54EA\u4E00\u4EFD\uFF0C\u6216\u53D6\u6D88\u540E\u624B\u5DE5\u5408\u5E76\u3002",
  "conflict.keepMine": "\u7528\u6211\u7684\u8986\u76D6",
  "conflict.keepTheirs": "\u7528\u78C1\u76D8\u4E0A\u7684\u7248\u672C",
  "error.load": "\u8BFB\u53D6\u8BB0\u5FC6\u5931\u8D25",
  "error.unreachable": "\u8FDE\u4E0D\u4E0A\u5BBF\u4E3B\u670D\u52A1\uFF0CDSH \u53EF\u80FD\u6B63\u5728\u91CD\u542F\u3002",
  "error.save": "\u4FDD\u5B58\u5931\u8D25",
  "loading": "\u52A0\u8F7D\u4E2D\u2026",
  "empty": "\uFF08\u6682\u65E0\u5185\u5BB9\uFF09",
  "unsaved": "\u672A\u4FDD\u5B58",
  "draft.banner": "\u6709 {count} \u4E2A\u6280\u80FD\u8349\u7A3F\u7B49\u5F85\u4F60\u6279\u51C6",
  "draft.card.title": "\u5F85\u6279\u51C6\u6280\u80FD",
  "draft.repeats": "\u91CD\u590D {count} \u6B21",
  "draft.source": "\u6765\u81EA\u4F1A\u8BDD",
  "doc.persona": "\u4EBA\u8BBE\u8BBE\u5B9A",
  "doc.instructions": "\u7ED9 MemoryBuddy \u7684\u6307\u4EE4",
  "doc.index": "\u957F\u671F\u8BB0\u5FC6"
};
var en = {
  "entry.label": "MemoryBuddy",
  "entry.tip": "MemoryBuddy personalization and memory",
  "nav.personalize": "Personalization",
  "nav.memory": "Memory & evolution",
  "nav.search": "Search settings or memory",
  "personalize.title": "Personalization",
  "personalize.subtitle": "These settings apply immediately and are written to your local memory folder.",
  "card.userName.title": "What MemoryBuddy calls you",
  "card.agentName.title": "MemoryBuddy's name",
  "card.replyStyle.title": "Reply style",
  "card.replyStyle.desc": "Choose the default tone of MemoryBuddy replies.",
  "card.welcome.title": "Welcome message",
  "card.welcome.desc": "While a conversation is loading, a greeting keeps you company.",
  "card.showFileChanges.title": "Show file changes",
  "card.showFileChanges.desc": "When on, MemoryBuddy walks through each file change and its result.",
  "card.instructions.title": "Instructions for MemoryBuddy",
  "card.instructions.desc": "Write the rules MemoryBuddy should always follow; they apply to every conversation and task by default.",
  "card.instructions.placeholder": "For example: keep answers short, lead with the conclusion",
  "card.persona.title": "Persona",
  "card.persona.desc": "Sets MemoryBuddy's identity, character and voice; it affects every reply.",
  "card.longTerm.title": "Long-term memory",
  "card.longTerm.desc": "Important facts and conclusions kept across conversations; view or edit any time.",
  "memory.title": "Memory & evolution",
  "memory.subtitle": "Updated automatically; you can review and edit it any time",
  "card.conversationMemory.title": "Conversation memory",
  "card.conversationMemory.desc": "Remembers what matters from your conversations so later answers fit you better.",
  "card.localMemorySkills.title": "Local memory and skills",
  "card.localMemorySkills.desc": "Records your work and improves skills automatically; the data stays on your device.",
  "card.manage.title": "Manage memory",
  "card.manage.desc": "Updated automatically; you can review and edit it any time.",
  "memory.schedule": "Consolidation",
  "memory.next": "Next pass",
  "memory.last": "Last pass",
  "memory.never": "(never run yet)",
  "memory.pending": "{count} sessions waiting",
  "memory.modelStage": "Model distillation is off (first release)",
  "memory.questions": "Waiting for your answer",
  "memory.questionsHint": "A pass found these contradictory or stale; dismiss each one once you have handled it.",
  "memory.history": "Consolidation history",
  "memory.historyHint": "Every pass backs up what it rewrites first; a rollback writes that day back and backs up the current state in turn.",
  "memory.historyEmpty": "No backups to roll back to yet.",
  "memory.historyBackups": "{count} files",
  "memory.rollback": "Roll back to this day",
  "memory.rollbackOpen": "View that day",
  "memory.entriesHint": "Entries are recorded on the server side; the markdown files stay the source of truth.",
  "memory.footerLead": "Memory follows the ",
  "memory.privacyPolicy": "MemoryBuddy privacy policy",
  "memory.footerTail": " and is visible only to you",
  "memory.hits": "{count} memories matched",
  "memory.noHits": 'Nothing matched "{query}"',
  "memory.footer": "Memory follows the MemoryBuddy privacy policy and is visible only to you",
  "memory.entries": "Remembered entries",
  "memory.entriesEmpty": "Nothing accumulated yet. Entries show up after a few conversations.",
  "memory.sessions": "Recent session notes",
  "memory.sessionsEmpty": "No session notes yet.",
  "memory.sessionEvents": "{count} events",
  "memory.sessionPending": "pending",
  "memory.sessionDone": "consolidated",
  "card.consolidateQuiet.title": "Quiet consolidation",
  "card.consolidateQuiet.desc": "Consolidate without a prompt; the memory page still records each pass.",
  "schedule.startup-idle": "On startup and when idle",
  "schedule.idle": "When idle",
  "schedule.session-end": "At the end of a session",
  "schedule.fixed": "At a fixed time each day",
  "topic.background": "Work background",
  "topic.habits": "Working style",
  "topic.environment": "Tools and paths",
  "topic.preferences-learned": "Learned preferences",
  "action.edit": "Edit",
  "action.save": "Save",
  "action.cancel": "Cancel",
  "action.preview": "Preview",
  "action.raw": "Markdown",
  "action.reset": "Reset",
  "action.import": "Import",
  "action.consolidate": "Consolidate now",
  "action.openFolder": "Open memory folder",
  "action.copyPath": "Copy memory folder path",
  "action.privacy": "View privacy rules",
  "action.forget": "Forget",
  "action.pin": "Pin",
  "action.unpin": "Unpin",
  "action.approve": "Approve",
  "action.discard": "Discard",
  "action.retry": "Retry",
  "action.reload": "Reload",
  "action.history": "History",
  "action.dismiss": "Got it",
  "toast.saved": "Saved",
  "toast.failed": "Could not save",
  "toast.imported": "Imported and merged",
  "toast.consolidated": "Consolidation finished",
  "toast.consolidating": "Consolidation started; refresh shortly for the result",
  "toast.reset": "Reset",
  "toast.resetAll": "All memory moved to archive/ and the skeleton rebuilt",
  "toast.rolledBack": "Rolled back",
  "toast.dismissed": "Marked as handled",
  "toast.forgotten": "Moved to archive/",
  "toast.approved": "Approved and written to the skills folder",
  "toast.discarded": "Draft discarded",
  "toast.pathCopied": "Memory folder path copied to the clipboard",
  "confirm.reset.title": "Reset long-term memory?",
  "confirm.reset.body": "All memory (memory/, sessions/, journal/, persona and instructions) moves to archive/reset-<timestamp>/ \u2014 nothing is deleted. Reset?",
  "confirm.reset.ok": "Archive and reset",
  "confirm.forget.title": "Forget this memory?",
  "confirm.forget.body": "The entry moves to archive/ and can be restored by hand.",
  "confirm.forget.ok": "Forget",
  "confirm.rollback.title": "Roll back to that day?",
  "confirm.rollback.body": "Files covered by that day\u2019s backup are written back, and the current state is backed up first.",
  "confirm.rollback.ok": "Roll back",
  "conflict.title": "This content changed elsewhere",
  "conflict.body": "Your edit is not lost: keep one version, or cancel and merge by hand.",
  "conflict.keepMine": "Overwrite with mine",
  "conflict.keepTheirs": "Use the version on disk",
  "error.load": "Could not read memory",
  "error.unreachable": "The host service is unreachable; DSH may be restarting.",
  "error.save": "Could not save",
  "loading": "Loading\u2026",
  "empty": "(nothing yet)",
  "unsaved": "Unsaved",
  "draft.banner": "{count} skill drafts are waiting for your approval",
  "draft.card.title": "Skills awaiting approval",
  "draft.repeats": "Repeated {count} times",
  "draft.source": "From sessions",
  "doc.persona": "Persona",
  "doc.instructions": "Instructions for MemoryBuddy",
  "doc.index": "Long-term memory"
};
var DICTIONARIES = { zh, en };
function translate(dictionaries, locale, key, params) {
  const table = dictionaries[locale] ?? zh;
  const fallback = zh;
  const template = table[key] ?? fallback[key] ?? key;
  if (params === void 0) return template;
  return template.replace(
    /\{(\w+)\}/g,
    (match, name) => Object.prototype.hasOwnProperty.call(params, name) ? params[name] ?? match : match
  );
}

// src/client/service.ts
var React = __toESM(require("react"), 1);

// src/protocol.ts
var API_PREFIX = "/api/memorybuddy";
var REPLY_STYLES = ["\u9ED8\u8BA4", "\u7B80\u6D01", "\u8BE6\u7EC6", "\u6559\u5B66", "\u76F4\u63A5"];
var CONSOLIDATE_MODES = ["startup-idle", "idle", "session-end", "fixed"];
var TOPICS = [
  { key: "background", file: "background.md", title: "\u5DE5\u4F5C\u80CC\u666F" },
  { key: "habits", file: "habits.md", title: "\u884C\u4E8B\u98CE\u683C" },
  { key: "environment", file: "environment.md", title: "\u73AF\u5883\u8DEF\u5F84" },
  { key: "preferences-learned", file: "preferences-learned.md", title: "\u4E60\u5F97\u504F\u597D" }
];

// src/client/transport.ts
var CLIENT_PREFIX = API_PREFIX.replace(/^\//, "");
var REQUEST_TIMEOUT_MS = 15e3;
var MemoryApiError = class extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
    this.name = "MemoryApiError";
  }
};
async function request(path, init) {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(path, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new MemoryApiError("timeout", "timeout");
    throw new MemoryApiError("unreachable", String(error));
  } finally {
    globalThis.clearTimeout(timer);
  }
  const text = await response.text();
  if (!response.ok) {
    let parsed;
    try {
      parsed = text.trim() === "" ? void 0 : JSON.parse(text);
    } catch {
      parsed = void 0;
    }
    const error = new MemoryApiError("status", `${String(response.status)}`);
    error.payload = parsed;
    throw error;
  }
  if (text.trim() === "") return void 0;
  try {
    return JSON.parse(text);
  } catch {
    throw new MemoryApiError("body", "invalid-json");
  }
}
function asSnapshot(value) {
  const record = value;
  if (record === void 0 || record === null || record.ok !== true) {
    throw new MemoryApiError("body", "malformed-snapshot");
  }
  return value;
}
var MemoryApi = class {
  /** The whole panel state in one round trip. */
  async state() {
    return asSnapshot(await request(`${CLIENT_PREFIX}/state`, { cache: "no-store" }));
  }
  /** Save one document; a revision mismatch comes back as a conflict. */
  async save(path, text, revision) {
    try {
      const value = await request(`${CLIENT_PREFIX}/save`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path, text, revision })
      });
      return value;
    } catch (error) {
      const payload = error.payload;
      if (payload !== void 0 && payload.error === "conflict") return payload;
      throw error;
    }
  }
  /** Patch the preference front-matter; the host merges field by field. */
  async preferences(patch) {
    const value = await request(`${CLIENT_PREFIX}/preferences`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch)
    });
    return asSnapshot(value?.snapshot);
  }
  /** Run one of the panel's actions (reset, forget, pin, approve…). */
  async action(action) {
    const value = await request(`${CLIENT_PREFIX}/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action })
    });
    return asSnapshot(value?.snapshot);
  }
  /**
   * Ask for a consolidation pass.
   *
   * Unlike `action()` this returns the pass's own answer, because the host
   * replies before the work finishes: the panel has to know whether a pass
   * actually started, not what it produced.
   */
  async consolidate() {
    const value = await request(`${CLIENT_PREFIX}/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: { kind: "consolidate" } })
    });
    const reason = typeof value?.result?.reason === "string" ? value.result.reason : void 0;
    return {
      snapshot: asSnapshot(value?.snapshot),
      started: value?.result?.started === true,
      ...reason === void 0 ? {} : { reason }
    };
  }
  /** Read one journal day: its log text plus the files its backup can restore. */
  async journal(date) {
    const value = await request(
      `${CLIENT_PREFIX}/journal?date=${encodeURIComponent(date)}`,
      { cache: "no-store" }
    );
    const record = value?.journal;
    if (record === void 0 || typeof record.date !== "string") {
      throw new MemoryApiError("body", "malformed-journal");
    }
    return { date: record.date, text: record.text ?? "", backups: record.backups ?? [] };
  }
};

// src/client/service.ts
var EMPTY = {
  snapshot: void 0,
  loading: true,
  error: void 0,
  conflict: void 0,
  busy: false
};
var MemoryController = class {
  constructor() {
    __publicField(this, "api", new MemoryApi());
    __publicField(this, "view", EMPTY);
    __publicField(this, "listeners", /* @__PURE__ */ new Set());
    __publicField(this, "disposed", false);
    /** Timer of the post-consolidation poll, when one is armed. */
    __publicField(this, "pollTimer");
  }
  /** The current value; stable between mutations so React can bail out. */
  get() {
    return this.view;
  }
  /** Subscribe to changes; returns the unsubscribe function. */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  /** Stop serving subscribers (called from the owning effect's cleanup). */
  dispose() {
    this.disposed = true;
    this.listeners.clear();
    if (this.pollTimer !== void 0) {
      globalThis.clearTimeout(this.pollTimer);
      this.pollTimer = void 0;
    }
  }
  set(patch) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch {
      }
    }
  }
  /** Human-readable text for a failure the transport reported. */
  describe(error, fallback) {
    if (error instanceof MemoryApiError && error.kind === "unreachable") return "unreachable";
    if (error instanceof MemoryApiError && error.kind === "timeout") return "timeout";
    return error instanceof Error && error.message !== "" ? error.message : fallback;
  }
  /** Load (or reload) the whole snapshot. */
  async load() {
    try {
      const snapshot = await this.api.state();
      this.set({ snapshot, loading: false, error: void 0 });
    } catch (error) {
      this.set({ loading: false, error: this.describe(error, "load") });
    }
  }
  /** Patch preferences; a successful write returns the fresh snapshot. */
  async patch(patch) {
    this.set({ busy: true });
    try {
      const snapshot = await this.api.preferences({ patch });
      this.set({ snapshot, busy: false, error: void 0 });
      return true;
    } catch (error) {
      this.set({ busy: false, error: this.describe(error, "save") });
      return false;
    }
  }
  /** Save one document. Returns 'saved', 'conflict' or 'failed'. */
  async save(path, text, revision) {
    this.set({ busy: true });
    try {
      const result = await this.api.save(path, text, revision);
      if (result.ok) {
        this.set({ snapshot: result.snapshot, busy: false, conflict: void 0, error: void 0 });
        return "saved";
      }
      if ("path" in result) {
        this.set({
          busy: false,
          conflict: { path: result.path, theirs: result.text, revision: result.revision, mine: text }
        });
        return "conflict";
      }
      this.set({ busy: false, error: result.error });
      return "failed";
    } catch (error) {
      this.set({ busy: false, error: this.describe(error, "save") });
      return "failed";
    }
  }
  /** Accept the on-disk version of a conflicted document. */
  resolveConflictWithTheirs() {
    const conflict = this.view.conflict;
    if (conflict === void 0) return;
    this.set({ conflict: void 0 });
  }
  /** Retry the save with the freshly-read revision (overwrite with mine). */
  async resolveConflictWithMine() {
    const conflict = this.view.conflict;
    if (conflict === void 0) return "failed";
    this.set({ conflict: void 0 });
    const outcome = await this.save(conflict.path, conflict.mine, conflict.revision);
    return outcome === "saved" ? "saved" : "failed";
  }
  /** Dismiss a conflict without saving. */
  dismissConflict() {
    this.set({ conflict: void 0 });
  }
  /** Run a host action and adopt the snapshot it returns. */
  async act(action) {
    this.set({ busy: true });
    try {
      const snapshot = await this.api.action(action);
      this.set({ snapshot, busy: false, error: void 0 });
      return true;
    } catch (error) {
      this.set({ busy: false, error: this.describe(error, "save") });
      return false;
    }
  }
  /**
   * Ask for a consolidation pass and then poll for its result.
   *
   * The host answers the request immediately (a model-stage pass can outlive the
   * browser's 15 s timeout), so the panel cannot learn the outcome from the
   * response. It re-reads the snapshot a few times instead, which is enough for
   * the deterministic stage the plugin ships today and honest about the rest.
   */
  async consolidate() {
    this.set({ busy: true });
    let started = false;
    let reason;
    try {
      const outcome = await this.api.consolidate();
      this.set({ snapshot: outcome.snapshot, busy: false, error: void 0 });
      started = outcome.started;
      reason = outcome.reason;
    } catch (error) {
      this.set({ busy: false, error: this.describe(error, "save") });
      return { started: false };
    }
    if (!started) return reason === void 0 ? { started: false } : { started: false, reason };
    this.armPoll();
    return { started: true };
  }
  /** Re-read the snapshot until the pass stops changing it, or give up. */
  armPoll() {
    if (this.pollTimer !== void 0) globalThis.clearTimeout(this.pollTimer);
    let rounds = 0;
    const tick = async () => {
      if (this.disposed) return;
      rounds += 1;
      await this.load();
      if (this.disposed || rounds >= 6) {
        this.pollTimer = void 0;
        return;
      }
      this.pollTimer = globalThis.setTimeout(() => void tick(), 2e3);
    };
    this.pollTimer = globalThis.setTimeout(() => void tick(), 1500);
  }
  /** Read one journal day (log text plus the files its backup can restore). */
  async journal(date) {
    try {
      return await this.api.journal(date);
    } catch (error) {
      this.set({ error: this.describe(error, "load") });
      return void 0;
    }
  }
  /** Clear a transient error once the panel has shown it. */
  clearError() {
    this.set({ error: void 0 });
  }
  /** The preferences of the current snapshot, if any. */
  preferences() {
    return this.view.snapshot?.preferences;
  }
};
function useMemoryView(controller) {
  const subscribe = React.useCallback((notify) => controller.subscribe(notify), [controller]);
  const getSnapshot = React.useCallback(() => controller.get(), [controller]);
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// src/client/panel.tsx
var React5 = __toESM(require("react"), 1);
var import_dsh_client_ui_primitives4 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/memory.tsx
var React3 = __toESM(require("react"), 1);
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/cards.tsx
var React2 = __toESM(require("react"), 1);
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/styles.ts
var PACKAGE_NAME = "dsh-memorybuddy";
function injectStyle(tagId, css) {
  if (typeof document === "undefined") return;
  const selector = `style[data-plugin-css=${JSON.stringify(tagId)}]`;
  if (document.querySelector(selector) !== null) return;
  const tag = document.createElement("style");
  tag.dataset.plugin = PACKAGE_NAME;
  tag.dataset.pluginCss = tagId;
  tag.textContent = css;
  document.head.appendChild(tag);
}
var PANEL_CSS = [
  /* Root: the panel owns the full center column; the shell already scrolled. */
  ".mbRoot{box-sizing:border-box;display:flex;flex:1;min-height:0;min-width:0;flex-direction:row;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);font-size:14px;line-height:22px}",
  /* Left nav: identical geometry to the Settings dialog's own nav column. */
  ".mbNav{box-sizing:border-box;flex:none;display:flex;flex-direction:column;gap:18px;width:188px;padding:22px 12px 0}",
  ".mbSearch{box-sizing:border-box;width:100%}",
  ".mbSearch input{width:100%}",
  ".mbNavList{display:flex;flex-direction:column;gap:4px;overflow-y:auto}",
  ".mbNavCell{box-sizing:border-box;display:flex;align-items:center;gap:8px;height:40px;padding:9px 16px 9px 12px;border:none;border-radius:var(--dsw-radius-md);background:0 0;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:14px;font-weight:400;line-height:22px;text-align:left;cursor:pointer}",
  ".mbNavCell:hover{background:var(--dsw-specific-sidebar-nav-item-hover)}",
  ".mbNavCell:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-alias-state-business-primary);outline-offset:-1px}",
  ".mbNavCellActive{background:var(--dsw-specific-sidebar-nav-item-active)}",
  ".mbNavIcon{flex:none}",
  ".mbNavLabel{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  /* Red dot for pending skill drafts (memory-plan §6.2). */
  ".mbDot{flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-error-primary)}",
  /* Right content column: 24px side padding, no inner scroller of its own. */
  ".mbContent{box-sizing:border-box;flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;gap:12px;padding:22px 24px 24px;overflow-y:auto}",
  ".mbTitle{font-size:16px;font-weight:500;line-height:24px}",
  ".mbSubtitle{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;margin-top:4px}",
  /* A settings.section page: the shell already supplies the 24px options
     padding and the scrolling, so this is only the card stack. */
  ".mbSection{display:flex;flex-direction:column;gap:12px;min-width:0}",
  /* One card per setting group. */
  ".mbCard{box-sizing:border-box;display:flex;flex-direction:column;gap:12px;padding:16px;border:.5px solid var(--dsw-alias-settings-card-stroke,var(--dsw-alias-border-l2));border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-settings-card-fill,var(--dsw-alias-bg-layer-1))}",
  ".mbCardHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}",
  ".mbCardText{min-width:0;flex:1}",
  ".mbCardTitle{font-size:14px;line-height:20px}",
  ".mbCardDesc{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;margin-top:2px}",
  ".mbCardActions{display:flex;flex:none;align-items:center;gap:4px}",
  ".mbRow{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:0}",
  ".mbRow + .mbRow{padding-top:12px;border-top:.5px solid var(--dsw-alias-border-l2)}",
  /* The markdown body view: the shell scrolls the page, so this is only a cap. */
  ".mbProse{box-sizing:border-box;max-height:420px;overflow-y:auto;padding:2px;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary)}",
  ".mbProseEmpty{color:var(--dsw-alias-label-tertiary);font-size:13px}",
  /* No Textarea primitive exists, so the editor is a styled <textarea>. */
  ".mbEditor{box-sizing:border-box;width:100%;min-height:96px;max-height:420px;resize:vertical;padding:8px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-family:var(--ds-font-family-code);font-size:13px;line-height:20px;outline:none}",
  ".mbEditor:focus{border-color:var(--dsw-alias-state-business-primary)}",
  ".mbEditorTall{min-height:180px}",
  ".mbEditor::placeholder{color:var(--dsw-alias-label-dimmed)}",
  /* Entry list on the memory page (search results highlight the match). */
  ".mbEntries{display:flex;flex-direction:column;gap:8px}",
  ".mbEntry{display:flex;align-items:flex-start;gap:8px;padding:8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md)}",
  ".mbEntryBody{flex:1;min-width:0}",
  ".mbEntryText{font-size:13px;line-height:20px;word-break:break-word}",
  ".mbEntryMeta{display:flex;align-items:center;gap:6px;margin-top:4px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}",
  ".mbEntryActions{display:flex;flex:none;gap:2px}",
  ".mbMark{background:var(--dsw-alias-state-warn-label,var(--dsw-alias-interactive-bg-active));border-radius:2px}",
  ".mbConflict{color:var(--dsw-alias-state-warn-primary)}",
  /* Pending-approval banner and cards. */
  ".mbBanner{box-sizing:border-box;display:flex;align-items:center;gap:8px;padding:10px 12px;border:.5px solid var(--dsw-alias-state-warn-primary);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2);font-size:13px;line-height:20px}",
  ".mbDraft{display:flex;flex-direction:column;gap:6px;padding:12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2)}",
  ".mbDraftBody{max-height:180px;overflow-y:auto;font-family:var(--ds-font-family-code);font-size:12px;line-height:18px;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-secondary)}",
  /* A journal day's log: same monospace body, taller, since a busy day is long. */
  ".mbJournalBody{max-height:280px;overflow-y:auto;padding:8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2);font-family:var(--ds-font-family-code);font-size:12px;line-height:18px;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-secondary)}",
  ".mbFooter{display:flex;align-items:center;gap:12px;justify-content:space-between;flex-wrap:wrap;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}",
  /* Reference footer: one centred muted line with 隐私政策 as an inline link. */
  ".mbFooterCenter{display:block;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}",
  ".mbFooterLink{padding:0;border:0;background:none;color:inherit;font:inherit;text-decoration:underline;cursor:pointer}",
  ".mbFooterLink:hover{color:var(--dsw-alias-label-secondary)}",
  ".mbFooterLinks{display:flex;align-items:center;gap:8px}",
  /*
    The reference draws 重置 as an outlined button whose LABEL is red. There is
    no danger Button variant in the primitives, so the tint is a wrapper class
    that recolours the label through currentColor.
  */
  ".mbDanger{color:var(--dsw-alias-state-error-primary)}",
  ".mbNote{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}",
  ".mbError{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-state-error-primary);font-size:13px;line-height:20px}",
  ".mbLoading{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}",
  ".mbHidden{display:none}"
].join("\n");
var PANEL_TAG = `${PACKAGE_NAME}/panel.module.css`;
var panelCss = {
  root: "mbRoot",
  nav: "mbNav",
  search: "mbSearch",
  navList: "mbNavList",
  navCell: "mbNavCell",
  navCellActive: "mbNavCellActive",
  navIcon: "mbNavIcon",
  navLabel: "mbNavLabel",
  dot: "mbDot",
  content: "mbContent",
  section: "mbSection",
  title: "mbTitle",
  subtitle: "mbSubtitle",
  card: "mbCard",
  cardHead: "mbCardHead",
  cardText: "mbCardText",
  cardTitle: "mbCardTitle",
  cardDesc: "mbCardDesc",
  cardActions: "mbCardActions",
  row: "mbRow",
  prose: "mbProse",
  proseEmpty: "mbProseEmpty",
  editor: "mbEditor",
  editorTall: "mbEditorTall",
  entries: "mbEntries",
  entry: "mbEntry",
  entryBody: "mbEntryBody",
  entryText: "mbEntryText",
  entryMeta: "mbEntryMeta",
  entryActions: "mbEntryActions",
  mark: "mbMark",
  conflict: "mbConflict",
  banner: "mbBanner",
  draft: "mbDraft",
  draftBody: "mbDraftBody",
  journalBody: "mbJournalBody",
  footer: "mbFooter",
  footerCenter: "mbFooterCenter",
  footerLink: "mbFooterLink",
  footerLinks: "mbFooterLinks",
  danger: "mbDanger",
  note: "mbNote",
  error: "mbError",
  loading: "mbLoading",
  hidden: "mbHidden"
};
function installPanelStyles() {
  injectStyle(PANEL_TAG, PANEL_CSS);
}
function cx(...values) {
  let out = "";
  for (const value of values) {
    if (value === void 0 || value === null || value === false || value === "") continue;
    out = out === "" ? value : `${out} ${value}`;
  }
  return out;
}

// src/client/cards.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function Card({ title, description, actions, children }) {
  const heading = title !== void 0 && title !== "" || actions !== void 0;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: panelCss.card, children: [
    heading && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: panelCss.cardHead, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: panelCss.cardText, children: [
        title !== void 0 && title !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: panelCss.cardTitle, children: title }),
        description !== void 0 && description !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: panelCss.cardDesc, children: description })
      ] }),
      actions !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: panelCss.cardActions, children: actions })
    ] }),
    children
  ] });
}
function Row({ children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: panelCss.row, children });
}
function stripLeadingTitle(text, bodyTitle) {
  if (bodyTitle === void 0 || bodyTitle === "") return text;
  const lines = text.split("\n");
  let index = 0;
  while (index < lines.length && lines[index].trim() === "") index += 1;
  const first = lines[index];
  if (first === void 0 || !first.startsWith("# ")) return text;
  const heading = first.slice(2).trim();
  if (heading === "") return text;
  if (!heading.includes(bodyTitle) && !bodyTitle.includes(heading)) return text;
  return lines.slice(index + 1).join("\n");
}
function DocumentBody({
  t: t2,
  value,
  draft,
  onDraft,
  editing,
  loading = false,
  renderPreview = false,
  placeholder,
  tall = false,
  ariaLabel,
  bodyTitle,
  onKeyDown
}) {
  if (editing) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "textarea",
      {
        className: cx(panelCss.editor, tall && panelCss.editorTall),
        value: draft,
        placeholder,
        spellCheck: false,
        onChange: (event) => onDraft(event.currentTarget.value),
        ...onKeyDown === void 0 ? {} : { onKeyDown },
        "aria-label": ariaLabel
      }
    );
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: panelCss.prose, children: loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: panelCss.loading, children: t2("loading") }) : value.trim() === "" ? (
    // An empty document shows its placeholder when it has one: the reference
    // draws 「给 MemoryBuddy 的指令」 as a box whose only text is the example.
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: panelCss.proseEmpty, children: placeholder === void 0 || placeholder === "" ? t2("empty") : placeholder })
  ) : renderPreview ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.MarkdownText, { text: stripLeadingTitle(value, bodyTitle) }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { className: panelCss.draftBody, children: value }) });
}
function EditableCard({
  title,
  description,
  t: t2,
  value,
  loading = false,
  renderPreview = false,
  placeholder,
  tall = false,
  onSave,
  extraAction,
  extraActionEnd,
  editing: editingProp,
  onEditingChange
}) {
  const [selfEditing, setSelfEditing] = React2.useState(false);
  const editing = editingProp ?? selfEditing;
  const [draft, setDraft] = React2.useState(value);
  const [saving, setSaving] = React2.useState(false);
  const setEditing = React2.useCallback(
    (next) => {
      setSelfEditing(next);
      onEditingChange?.(next);
    },
    [onEditingChange]
  );
  React2.useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);
  const save = React2.useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const ok = await onSave(draft);
      if (ok) setEditing(false);
    } finally {
      setSaving(false);
    }
  }, [draft, onSave, saving]);
  const cancel = React2.useCallback(() => {
    setDraft(value);
    setEditing(false);
  }, [value]);
  const onKeyDown = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void save();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    Card,
    {
      title,
      description,
      actions: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        extraAction,
        editing ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { size: "sm", variant: "primary", disabled: saving, onClick: () => void save(), children: t2("action.save") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { size: "sm", variant: "outline", disabled: saving, onClick: cancel, children: t2("action.cancel") })
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { size: "sm", variant: "outline", onClick: () => setEditing(true), children: t2("action.edit") }),
        extraActionEnd
      ] }),
      children: editing ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        DocumentBody,
        {
          t: t2,
          value,
          draft,
          onDraft: setDraft,
          editing: true,
          tall,
          ariaLabel: title,
          bodyTitle: title,
          ...placeholder === void 0 ? {} : { placeholder },
          onKeyDown
        }
      ) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        DocumentBody,
        {
          t: t2,
          value,
          draft,
          onDraft: setDraft,
          editing: false,
          loading,
          renderPreview,
          tall,
          ariaLabel: title,
          bodyTitle: title,
          ...placeholder === void 0 ? {} : { placeholder }
        }
      )
    }
  );
}
function TextField({
  value,
  placeholder,
  disabled = false,
  ariaLabel,
  onCommit,
  icon
}) {
  const [draft, setDraft] = React2.useState(value);
  React2.useEffect(() => {
    setDraft(value);
  }, [value]);
  const commit = () => {
    if (draft === value) return;
    onCommit(draft);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    import_dsh_client_ui_primitives.Input,
    {
      icon,
      value: draft,
      placeholder,
      disabled,
      "aria-label": ariaLabel,
      onChange: (event) => setDraft(event.currentTarget.value),
      onBlur: commit,
      onKeyDown: (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          setDraft(value);
          event.currentTarget.blur();
        }
      }
    }
  );
}
function ChoiceMenu({
  value,
  options,
  disabled = false,
  ariaLabel,
  onSelect
}) {
  const [open, setOpen] = React2.useState(false);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    import_dsh_client_ui_primitives.Menu,
    {
      open,
      align: "end",
      selectedId: value,
      items: options.map((option) => ({ id: option, label: option })),
      onSelect: (next) => {
        setOpen(false);
        if (next !== value) onSelect(next);
      },
      onClose: () => setOpen(false),
      anchor: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        import_dsh_client_ui_primitives.Button,
        {
          size: "sm",
          variant: "outline",
          disabled,
          "aria-label": ariaLabel,
          "aria-haspopup": "menu",
          "aria-expanded": open,
          icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconChevronDownOutlineMedium, { size: 14 }),
          onClick: () => setOpen((current) => !current),
          children: value
        }
      )
    }
  );
}
function highlight(text, query) {
  const needle = (query ?? "").trim();
  if (needle === "") return text;
  const lower = text.toLowerCase();
  const target = needle.toLowerCase();
  const parts = [];
  let index = 0;
  let key = 0;
  for (; ; ) {
    const hit = lower.indexOf(target, index);
    if (hit < 0) break;
    if (hit > index) parts.push(text.slice(index, hit));
    parts.push(
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("mark", { className: panelCss.mark, children: text.slice(hit, hit + target.length) }, key++)
    );
    index = hit + target.length;
  }
  if (parts.length === 0) return text;
  if (index < text.length) parts.push(text.slice(index));
  return parts;
}
function EntryList({
  entries,
  topicTitle: topicTitle2,
  t: t2,
  query,
  onForget,
  onPin
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: panelCss.entries, children: entries.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: panelCss.entry, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: panelCss.entryBody, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: panelCss.entryText, children: highlight(entry.text, query) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: panelCss.entryMeta, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Tag, { tone: "quiet", children: topicTitle2 }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Tag, { tone: entry.confidence === "\u9AD8" ? "success" : "outline", children: entry.confidence }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
          entry.days,
          " \u5929 \xB7 ",
          entry.last
        ] }),
        entry.pinned && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Tag, { tone: "info", children: "pinned" }),
        entry.conflict && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: panelCss.conflict, title: t2("conflict.title"), children: "\u26A0 \u51B2\u7A81" })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: panelCss.entryActions, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        import_dsh_client_ui_primitives.Button,
        {
          size: "sm",
          variant: "ghost",
          "aria-label": entry.pinned ? t2("action.unpin") : t2("action.pin"),
          title: entry.pinned ? t2("action.unpin") : t2("action.pin"),
          icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconPinOutlineMedium, { size: 14 }),
          onClick: () => onPin(entry.id, !entry.pinned)
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        import_dsh_client_ui_primitives.Button,
        {
          size: "sm",
          variant: "ghost",
          "aria-label": t2("action.forget"),
          title: t2("action.forget"),
          icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconTrashOutlineMedium, { size: 14 }),
          onClick: () => onForget(entry.id)
        }
      )
    ] })
  ] }, entry.id)) });
}
function Confirm({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    import_dsh_client_ui_primitives.Modal,
    {
      open,
      onClose: onCancel,
      title,
      closeLabel: cancelLabel,
      footer: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "outline", onClick: onCancel, children: cancelLabel }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "primary", onClick: onConfirm, "data-modal-autofocus": "", children: confirmLabel })
      ] }),
      children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: panelCss.cardDesc, children: body })
    }
  );
}
function ToastHost({ token, text, tone, onDone }) {
  if (text === "") return null;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    import_dsh_client_ui_primitives.Toast,
    {
      text,
      ...tone === void 0 ? {} : { tone },
      onDone
    },
    token
  );
}
function Banner({ text, action }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: panelCss.banner, role: "status", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: text }),
    action
  ] });
}

// src/client/memory.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function topicTitle(t2, key) {
  return t2(`topic.${key}`);
}
function scheduleLine(t2, snapshot) {
  const mode = snapshot?.preferences.consolidateOn ?? "startup-idle";
  const known = CONSOLIDATE_MODES.includes(mode);
  const base = t2(`schedule.${known ? mode : "startup-idle"}`);
  if (mode === "fixed" && snapshot !== void 0) {
    return `${base} ${snapshot.preferences.consolidateFixedTime}`;
  }
  if (mode === "idle" && snapshot !== void 0) {
    return `${base}\uFF08${snapshot.preferences.consolidateIdleMinutes} \u5206\u949F\uFF09`;
  }
  return base;
}
function DraftCards({
  t: t2,
  drafts,
  busy,
  onApprove,
  onDiscard
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_jsx_runtime2.Fragment, { children: drafts.map((draft) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    Card,
    {
      title: draft.title,
      description: `${t2("draft.source")} \xB7 ${t2("draft.repeats", { count: String(draft.repeats) })}`,
      actions: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { size: "sm", variant: "primary", disabled: busy, onClick: () => onApprove(draft.name), children: t2("action.approve") }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { size: "sm", variant: "outline", disabled: busy, onClick: () => onDiscard(draft.name), children: t2("action.discard") })
      ] }),
      children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: panelCss.note, children: draft.path })
    },
    draft.name
  )) });
}
function MemoryPage({
  t: t2,
  snapshot,
  loading,
  busy,
  query,
  onPatch,
  onSaveDocument,
  onAction,
  onConsolidate,
  onJournal,
  heading = true,
  bare = false
}) {
  const [toast, setToast] = React3.useState({
    token: 0,
    text: ""
  });
  const [resetOpen, setResetOpen] = React3.useState(false);
  const [forget, setForget] = React3.useState(void 0);
  const [indexEditing, setIndexEditing] = React3.useState(false);
  const [indexDraft, setIndexDraft] = React3.useState("");
  const [rollbackDate, setRollbackDate] = React3.useState(void 0);
  const [journalDate, setJournalDate] = React3.useState("");
  const [journal, setJournal] = React3.useState(void 0);
  const fileRef = React3.useRef(null);
  const say = React3.useCallback(
    (text, tone) => {
      setToast((current) => ({ token: current.token + 1, text, ...tone === void 0 ? {} : { tone } }));
    },
    []
  );
  const preferences = snapshot?.preferences;
  const index = snapshot?.index;
  const needle = query.trim().toLowerCase();
  const entriesOf = React3.useCallback(
    (key) => {
      const all = snapshot?.entries[key] ?? [];
      if (needle === "") return all;
      return all.filter((entry) => entry.text.toLowerCase().includes(needle));
    },
    [needle, snapshot]
  );
  const matched = React3.useMemo(() => {
    const grouped = [];
    for (const topic of TOPICS) {
      const items = entriesOf(topic.key);
      if (items.length > 0) grouped.push({ key: topic.key, items });
    }
    return grouped;
  }, [entriesOf]);
  const hitCount = matched.reduce((total, group) => total + group.items.length, 0);
  const sessions = React3.useMemo(() => {
    const items = snapshot?.sessions.items ?? [];
    if (needle === "") return items;
    return items.filter(
      (item) => item.id.toLowerCase().includes(needle) || item.title.toLowerCase().includes(needle)
    );
  }, [needle, snapshot]);
  const drafts = snapshot?.drafts ?? [];
  const questions = snapshot?.questions ?? [];
  const history = snapshot?.history ?? [];
  const patchPreference = React3.useCallback(
    (key, value) => {
      onPatch({ [key]: value });
    },
    [onPatch]
  );
  const consolidate = React3.useCallback(async () => {
    const outcome = await onConsolidate();
    if (!outcome.started) {
      say(outcome.reason ?? t2("toast.failed"), "danger");
      return;
    }
    say(t2("toast.consolidating"), "success");
  }, [onConsolidate, say, t2]);
  const doReset = React3.useCallback(async () => {
    setResetOpen(false);
    const ok = await onAction({ kind: "reset-all" });
    say(ok ? t2("toast.resetAll") : t2("toast.failed"), ok ? "success" : "danger");
  }, [onAction, say, t2]);
  const dismissQuestion = React3.useCallback(
    async (index2) => {
      const ok = await onAction({ kind: "dismiss-question", index: index2 });
      say(ok ? t2("toast.dismissed") : t2("toast.failed"), ok ? "success" : "danger");
    },
    [onAction, say, t2]
  );
  const openJournal = React3.useCallback(
    async (date) => {
      setJournalDate(date);
      setJournal(await onJournal(date));
    },
    [onJournal]
  );
  const doRollback = React3.useCallback(async () => {
    const date = rollbackDate;
    setRollbackDate(void 0);
    if (date === void 0) return;
    const ok = await onAction({ kind: "rollback", date });
    say(ok ? t2("toast.rolledBack") : t2("toast.failed"), ok ? "success" : "danger");
    if (ok) setJournal(await onJournal(date));
  }, [onJournal, onAction, rollbackDate, say, t2]);
  const doForget = React3.useCallback(async () => {
    const target = forget;
    setForget(void 0);
    if (target === void 0) return;
    const ok = await onAction({ kind: "forget-entry", topic: target.topic, id: target.id });
    say(ok ? t2("toast.forgotten") : t2("toast.failed"), ok ? "success" : "danger");
  }, [forget, onAction, say, t2]);
  const doPin = React3.useCallback(
    async (topic, id, pinned) => {
      const ok = await onAction({ kind: "pin-entry", topic, id, pinned });
      if (!ok) say(t2("toast.failed"), "danger");
    },
    [onAction, say, t2]
  );
  const onFilePicked = React3.useCallback(
    async (event) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = "";
      if (file === void 0) return;
      let picked = "";
      try {
        picked = await file.text();
      } catch {
        say(t2("toast.failed"), "danger");
        return;
      }
      if (picked.trim() === "") {
        say(t2("toast.failed"), "danger");
        return;
      }
      const stamp = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const current = index?.text ?? "";
      const merged = `${current.trimEnd()}

## \u5BFC\u5165 ${stamp} \xB7 ${file.name}

${picked.trim()}
`;
      const ok = await onSaveDocument("memory/index.md", merged, index?.revision ?? "");
      say(ok ? t2("toast.imported") : t2("toast.failed"), ok ? "success" : "danger");
    },
    [index, onSaveDocument, say, t2]
  );
  const saveIndex = React3.useCallback(async () => {
    const ok = await onSaveDocument("memory/index.md", indexDraft, index?.revision ?? "");
    say(ok ? t2("toast.saved") : t2("toast.failed"), ok ? "success" : "danger");
    if (ok) setIndexEditing(false);
  }, [index, indexDraft, onSaveDocument, say, t2]);
  const cancelIndex = React3.useCallback(() => {
    setIndexDraft(index?.text ?? "");
    setIndexEditing(false);
  }, [index]);
  const copyRoot = React3.useCallback(async () => {
    const root = snapshot?.root ?? "";
    try {
      await navigator.clipboard.writeText(root);
      say(t2("toast.pathCopied"), "success");
    } catch {
      say(root === "" ? t2("toast.failed") : root);
    }
  }, [say, snapshot, t2]);
  const openPrivacy = React3.useCallback(() => {
    say(`${t2("memory.footerLead")}${t2("memory.privacyPolicy")}${t2("memory.footerTail")}`);
  }, [say, t2]);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: bare ? panelCss.section : panelCss.content, children: [
    drafts.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      Banner,
      {
        text: t2("draft.banner", { count: String(drafts.length) }),
        action: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { size: "sm", variant: "outline", disabled: busy, onClick: () => void consolidate(), children: t2("action.consolidate") })
      }
    ),
    questions.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Card, { title: t2("memory.questions"), description: t2("memory.questionsHint"), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: cx(panelCss.entries), children: questions.map((question, index2) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: panelCss.entry, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: panelCss.entryBody, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: panelCss.entryText, children: question }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: panelCss.entryActions, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { size: "sm", variant: "outline", disabled: busy, onClick: () => void dismissQuestion(index2), children: t2("action.dismiss") }) })
    ] }, `${index2}-${question}`)) }) }),
    heading && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: panelCss.title, children: t2("memory.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: panelCss.subtitle, children: [
        t2("memory.subtitle"),
        " \xB7 ",
        t2("memory.last"),
        "\uFF1A",
        snapshot?.consolidation.lastAt ?? t2("memory.never"),
        " \xB7 ",
        t2("memory.next"),
        "\uFF1A",
        scheduleLine(t2, snapshot),
        snapshot !== void 0 && snapshot.sessions.pending > 0 ? ` \xB7 ${t2("memory.pending", { count: String(snapshot.sessions.pending) })}` : ""
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(Card, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(Row, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: panelCss.cardText, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: panelCss.cardTitle, children: t2("card.conversationMemory.title") }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: panelCss.cardDesc, children: t2("card.conversationMemory.desc") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          import_dsh_client_ui_primitives2.Switch,
          {
            label: t2("card.conversationMemory.title"),
            checked: preferences?.conversationMemory ?? true,
            disabled: busy || loading,
            onChange: (next) => patchPreference("conversationMemory", next)
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(Row, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: panelCss.cardText, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: panelCss.cardTitle, children: t2("card.localMemorySkills.title") }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: panelCss.cardDesc, children: t2("card.localMemorySkills.desc") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          import_dsh_client_ui_primitives2.Switch,
          {
            label: t2("card.localMemorySkills.title"),
            checked: preferences?.localMemorySkills ?? true,
            disabled: busy || loading,
            onChange: (next) => patchPreference("localMemorySkills", next)
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
      Card,
      {
        title: t2("card.manage.title"),
        description: t2("card.manage.desc"),
        actions: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            import_dsh_client_ui_primitives2.Button,
            {
              size: "sm",
              variant: "outline",
              className: panelCss.danger,
              disabled: busy,
              onClick: () => setResetOpen(true),
              children: t2("action.reset")
            }
          ),
          indexEditing ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { size: "sm", variant: "primary", disabled: busy, onClick: () => void saveIndex(), children: t2("action.save") }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { size: "sm", variant: "outline", disabled: busy, onClick: cancelIndex, children: t2("action.cancel") })
          ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            import_dsh_client_ui_primitives2.Button,
            {
              size: "sm",
              variant: "outline",
              disabled: busy,
              onClick: () => {
                setIndexDraft(index?.text ?? "");
                setIndexEditing(true);
              },
              children: t2("action.edit")
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { size: "sm", variant: "outline", disabled: busy, onClick: () => fileRef.current?.click(), children: t2("action.import") }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            import_dsh_client_ui_primitives2.Button,
            {
              size: "sm",
              variant: "outline",
              disabled: busy || history.length === 0,
              onClick: () => void openJournal(journalDate === "" ? history[0] ?? "" : journalDate),
              children: t2("action.history")
            }
          )
        ] }),
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "input",
            {
              ref: fileRef,
              className: panelCss.hidden,
              type: "file",
              accept: ".md,.markdown,text/markdown,text/plain",
              "aria-label": t2("action.import"),
              onChange: (event) => void onFilePicked(event)
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            DocumentBody,
            {
              t: t2,
              value: index?.text ?? "",
              draft: indexDraft,
              onDraft: setIndexDraft,
              editing: indexEditing,
              loading,
              renderPreview: true,
              tall: true,
              ariaLabel: t2("card.manage.title"),
              bodyTitle: t2("card.longTerm.title"),
              onKeyDown: (event) => {
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                  event.preventDefault();
                  void saveIndex();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelIndex();
                }
              }
            }
          ),
          !bare && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: panelCss.note, children: snapshot?.root ?? "" })
        ]
      }
    ),
    !bare && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(Card, { title: t2("memory.schedule"), children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(Row, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: panelCss.cardText, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: panelCss.cardTitle, children: t2("memory.last") }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: panelCss.cardDesc, children: [
            snapshot?.consolidation.lastAt ?? t2("memory.never"),
            " \xB7 ",
            t2("memory.next"),
            "\uFF1A",
            scheduleLine(t2, snapshot)
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { size: "sm", variant: "outline", disabled: busy, onClick: () => void consolidate(), children: t2("action.consolidate") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(Row, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: panelCss.cardText, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: panelCss.cardTitle, children: t2("card.consolidateQuiet.title") }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: panelCss.cardDesc, children: t2("card.consolidateQuiet.desc") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          import_dsh_client_ui_primitives2.Switch,
          {
            label: t2("card.consolidateQuiet.title"),
            checked: preferences?.consolidateQuiet ?? true,
            disabled: busy || loading,
            onChange: (next) => patchPreference("consolidateQuiet", next)
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: panelCss.note, children: snapshot?.consolidation.modelNote ?? t2("memory.modelStage") })
    ] }),
    !bare && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Card, { title: t2("memory.history"), description: t2("memory.historyHint"), children: history.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: panelCss.proseEmpty, children: t2("memory.historyEmpty") }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: cx(panelCss.entries), children: history.map((date) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: panelCss.entry, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: panelCss.entryBody, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: panelCss.entryText, children: date }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: panelCss.entryActions, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            import_dsh_client_ui_primitives2.Button,
            {
              size: "sm",
              variant: "outline",
              disabled: busy,
              onClick: () => void openJournal(date),
              children: journalDate === date ? t2("memory.rollbackOpen") : t2("action.history")
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            import_dsh_client_ui_primitives2.Button,
            {
              size: "sm",
              variant: "outline",
              className: panelCss.danger,
              disabled: busy,
              onClick: () => setRollbackDate(date),
              children: t2("memory.rollback")
            }
          )
        ] })
      ] }, date)) }),
      journal !== void 0 && journalDate !== "" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: panelCss.prose, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: panelCss.note, children: [
          journalDate,
          " \xB7 ",
          t2("memory.historyBackups", { count: String(journal.backups.length) })
        ] }),
        journal.backups.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: panelCss.note, children: journal.backups.join(" \xB7 ") }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: panelCss.journalBody, children: journal.text.trim() === "" ? t2("empty") : journal.text })
      ] })
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      DraftCards,
      {
        t: t2,
        drafts,
        busy,
        onApprove: (name) => {
          void onAction({ kind: "approve-draft", name }).then(
            (ok) => say(ok ? t2("toast.approved") : t2("toast.failed"), ok ? "success" : "danger")
          );
        },
        onDiscard: (name) => {
          void onAction({ kind: "discard-draft", name }).then(
            (ok) => say(ok ? t2("toast.discarded") : t2("toast.failed"), ok ? "success" : "danger")
          );
        }
      }
    ),
    !bare && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: panelCss.cardTitle, children: t2("memory.entries") }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: panelCss.subtitle, children: [
          needle === "" ? "" : `${t2("memory.hits", { count: String(hitCount) })} \xB7 `,
          t2("memory.entriesHint")
        ] })
      ] }),
      matched.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: panelCss.proseEmpty, children: t2("memory.entriesEmpty") }) : matched.map((group) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Card, { title: topicTitle(t2, group.key), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        EntryList,
        {
          entries: group.items,
          topicTitle: topicTitle(t2, group.key),
          t: t2,
          query,
          onForget: (id) => setForget({ topic: group.key, id }),
          onPin: (id, pinned) => void doPin(group.key, id, pinned)
        }
      ) }, group.key)),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Card, { title: t2("memory.sessions"), children: sessions.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: panelCss.proseEmpty, children: t2("memory.sessionsEmpty") }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: cx(panelCss.entries), children: sessions.map((item) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: panelCss.entry, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: panelCss.entryBody, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: panelCss.entryText, children: item.title === "" ? item.id : item.title }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: panelCss.entryMeta, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: item.date }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: t2("memory.sessionEvents", { count: String(item.events) }) }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: item.consolidated ? t2("memory.sessionDone") : t2("memory.sessionPending") })
        ] })
      ] }) }, item.path)) }) })
    ] }),
    bare ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: panelCss.footerCenter, children: [
      t2("memory.footerLead"),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { className: panelCss.footerLink, onClick: openPrivacy, children: t2("memory.privacyPolicy") }),
      t2("memory.footerTail")
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: panelCss.footer, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
        t2("memory.footerLead"),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { className: panelCss.footerLink, onClick: openPrivacy, children: t2("memory.privacyPolicy") }),
        t2("memory.footerTail")
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: panelCss.footerLinks, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { size: "sm", variant: "outline", onClick: () => void copyRoot(), children: t2("action.copyPath") }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      Confirm,
      {
        open: resetOpen,
        title: t2("confirm.reset.title"),
        body: t2("confirm.reset.body"),
        confirmLabel: t2("confirm.reset.ok"),
        cancelLabel: t2("action.cancel"),
        onConfirm: () => void doReset(),
        onCancel: () => setResetOpen(false)
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      Confirm,
      {
        open: forget !== void 0,
        title: t2("confirm.forget.title"),
        body: t2("confirm.forget.body"),
        confirmLabel: t2("confirm.forget.ok"),
        cancelLabel: t2("action.cancel"),
        onConfirm: () => void doForget(),
        onCancel: () => setForget(void 0)
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      Confirm,
      {
        open: rollbackDate !== void 0,
        title: t2("confirm.rollback.title"),
        body: `${t2("confirm.rollback.body")}\uFF08${rollbackDate ?? ""}\uFF09`,
        confirmLabel: t2("confirm.rollback.ok"),
        cancelLabel: t2("action.cancel"),
        onConfirm: () => void doRollback(),
        onCancel: () => setRollbackDate(void 0)
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      ToastHost,
      {
        token: toast.token,
        text: toast.text,
        ...toast.tone === void 0 ? {} : { tone: toast.tone },
        onDone: () => setToast((current) => ({ ...current, text: "" }))
      }
    )
  ] });
}

// src/client/personalize.tsx
var React4 = __toESM(require("react"), 1);
var import_dsh_client_ui_primitives3 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime3 = require("react/jsx-runtime");
function matches(query, title, description) {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  return `${title} ${description}`.toLowerCase().includes(needle);
}
function PersonalizePage({
  t: t2,
  snapshot,
  loading,
  busy,
  query,
  onPatch,
  onSaveDocument
}) {
  const preferences = snapshot?.preferences;
  const documents = snapshot?.documents ?? {};
  const index = snapshot?.index;
  const saveAt = React4.useCallback(
    (path) => async (text) => {
      const current = documents[path];
      return await onSaveDocument(path, text, current?.revision ?? "");
    },
    [documents, onSaveDocument]
  );
  const profile = documents["profile.md"];
  const instructions = documents["instructions.md"];
  const cards = [];
  if (matches(query, t2("card.userName.title"), "") || matches(query, t2("card.agentName.title"), "")) {
    cards.push(
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(Card, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(Row, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: panelCss.cardText, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: panelCss.cardTitle, children: t2("card.userName.title") }) }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            TextField,
            {
              ariaLabel: t2("card.userName.title"),
              value: preferences?.userName ?? "",
              disabled: busy || preferences === void 0,
              onCommit: (next) => onPatch({ userName: next })
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(Row, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: panelCss.cardText, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: panelCss.cardTitle, children: t2("card.agentName.title") }) }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            TextField,
            {
              ariaLabel: t2("card.agentName.title"),
              value: preferences?.agentName ?? "",
              disabled: busy || preferences === void 0,
              onCommit: (next) => onPatch({ agentName: next })
            }
          )
        ] })
      ] }, "identity")
    );
  }
  if (matches(query, t2("card.replyStyle.title"), t2("card.replyStyle.desc")) || matches(query, t2("card.welcome.title"), t2("card.welcome.desc")) || matches(query, t2("card.showFileChanges.title"), t2("card.showFileChanges.desc"))) {
    cards.push(
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(Card, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(Row, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: panelCss.cardText, children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: panelCss.cardTitle, children: t2("card.replyStyle.title") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: panelCss.cardDesc, children: t2("card.replyStyle.desc") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            ChoiceMenu,
            {
              ariaLabel: t2("card.replyStyle.title"),
              value: preferences?.replyStyle ?? REPLY_STYLES[0],
              options: REPLY_STYLES,
              disabled: busy || preferences === void 0,
              onSelect: (next) => onPatch({ replyStyle: next })
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(Row, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: panelCss.cardText, children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: panelCss.cardTitle, children: t2("card.welcome.title") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: panelCss.cardDesc, children: t2("card.welcome.desc") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            import_dsh_client_ui_primitives3.Switch,
            {
              label: t2("card.welcome.title"),
              checked: preferences?.welcome ?? true,
              disabled: busy || preferences === void 0,
              onChange: (next) => onPatch({ welcome: next })
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(Row, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: panelCss.cardText, children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: panelCss.cardTitle, children: t2("card.showFileChanges.title") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: panelCss.cardDesc, children: t2("card.showFileChanges.desc") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            import_dsh_client_ui_primitives3.Switch,
            {
              label: t2("card.showFileChanges.title"),
              checked: preferences?.showFileChanges ?? false,
              disabled: busy || preferences === void 0,
              onChange: (next) => onPatch({ showFileChanges: next })
            }
          )
        ] })
      ] }, "behaviour")
    );
  }
  if (matches(query, t2("card.instructions.title"), t2("card.instructions.desc"))) {
    cards.push(
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        EditableCard,
        {
          t: t2,
          title: t2("card.instructions.title"),
          description: t2("card.instructions.desc"),
          value: instructions?.text ?? "",
          loading,
          placeholder: t2("card.instructions.placeholder"),
          tall: true,
          onSave: saveAt("instructions.md")
        },
        "instructions"
      )
    );
  }
  if (matches(query, t2("card.persona.title"), t2("card.persona.desc"))) {
    cards.push(
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        EditableCard,
        {
          t: t2,
          title: t2("card.persona.title"),
          description: t2("card.persona.desc"),
          value: profile?.text ?? "",
          loading,
          tall: true,
          renderPreview: true,
          onSave: saveAt("profile.md")
        },
        "persona"
      )
    );
  }
  if (matches(query, t2("card.longTerm.title"), t2("card.longTerm.desc"))) {
    cards.push(
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        LongTermCard,
        {
          t: t2,
          loading,
          value: index?.text ?? "",
          onSave: (text) => onSaveDocument("memory/index.md", text, index?.revision ?? "")
        },
        "long-term"
      )
    );
  }
  if (cards.length === 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: panelCss.loading, children: t2("memory.noHits", { query }) });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_jsx_runtime3.Fragment, { children: cards });
}
function LongTermCard({
  t: t2,
  value,
  loading,
  onSave
}) {
  const [editing, setEditing] = React4.useState(false);
  const [preview, setPreview] = React4.useState(true);
  const [draft, setDraft] = React4.useState(value);
  const [saving, setSaving] = React4.useState(false);
  React4.useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);
  const save = React4.useCallback(async () => {
    setSaving(true);
    try {
      if (await onSave(draft)) setEditing(false);
    } finally {
      setSaving(false);
    }
  }, [draft, onSave]);
  const cancel = React4.useCallback(() => {
    setDraft(value);
    setEditing(false);
  }, [value]);
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
    Card,
    {
      title: t2("card.longTerm.title"),
      description: t2("card.longTerm.desc"),
      actions: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_jsx_runtime3.Fragment, { children: editing ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button, { size: "sm", variant: "primary", disabled: saving, onClick: () => void save(), children: t2("action.save") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button, { size: "sm", variant: "outline", disabled: saving, onClick: cancel, children: t2("action.cancel") })
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          import_dsh_client_ui_primitives3.Button,
          {
            size: "sm",
            variant: "ghost",
            "aria-pressed": preview,
            onClick: () => setPreview((current) => !current),
            children: preview ? t2("action.preview") : t2("action.raw")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          import_dsh_client_ui_primitives3.Button,
          {
            size: "sm",
            variant: "outline",
            onClick: () => {
              setPreview(false);
              setEditing(true);
            },
            children: t2("action.edit")
          }
        )
      ] }) }),
      children: editing ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        DocumentBody,
        {
          t: t2,
          value,
          draft,
          onDraft: setDraft,
          editing: true,
          tall: true,
          ariaLabel: t2("card.longTerm.title"),
          onKeyDown: (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
              event.preventDefault();
              void save();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              cancel();
            }
          }
        }
      ) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        DocumentBody,
        {
          t: t2,
          value,
          draft,
          onDraft: setDraft,
          editing: false,
          loading,
          renderPreview: preview,
          tall: true,
          ariaLabel: t2("card.longTerm.title"),
          bodyTitle: t2("card.longTerm.title")
        }
      )
    }
  );
}

// src/client/icons.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
var PANEL_ID = "memorybuddy";
function MemoryBuddyPanelIcon({ size }) {
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
    "svg",
    {
      "data-dsh-panel-entry": PANEL_ID,
      viewBox: "0 0 16 16",
      width: size,
      height: size,
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.3",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("rect", { x: "2.2", y: "2.2", width: "11.6", height: "11.6", rx: "3.2" }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { d: "M8 5.1l.95 1.95L10.9 8l-1.95.95L8 10.9l-.95-1.95L5.1 8l1.95-.95z" })
      ]
    }
  );
}

// src/client/t.ts
var runtime;
var active = "zh";
function setActiveLocale(locale) {
  active = typeof locale === "string" && locale !== "" ? locale : "zh";
}
function setRuntimeTranslate(next) {
  runtime = next;
}
function t(key, params) {
  if (runtime !== void 0) {
    try {
      return runtime(key, params);
    } catch {
    }
  }
  return translate(DICTIONARIES, active, key, params);
}

// src/client/panel.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
var PANEL_ORDER = 30;
function MemoryBuddyPanel({ face }) {
  const view = face.useView();
  const snapshot = view.snapshot;
  const [page, setPage] = React5.useState("personalize");
  const [query, setQuery] = React5.useState("");
  const hasDrafts = (snapshot?.drafts.length ?? 0) > 0;
  const rows = [
    {
      id: "personalize",
      label: t("nav.personalize"),
      icon: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives4.IconPersonalizationOutlineMedium, { size: 16, className: panelCss.navIcon })
    },
    {
      id: "memory",
      label: t("nav.memory"),
      icon: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives4.IconLightOutlineMedium, { size: 16, className: panelCss.navIcon })
    }
  ];
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: panelCss.root, "data-dsh-plugin": "memorybuddy", "data-dsh-memorybuddy-view": page, children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("nav", { className: panelCss.nav, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        import_dsh_client_ui_primitives4.Input,
        {
          className: panelCss.search,
          icon: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives4.IconSearchOutlineMedium, { size: 14 }),
          value: query,
          placeholder: t("nav.search"),
          "aria-label": t("nav.search"),
          onChange: (event) => setQuery(event.currentTarget.value)
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: panelCss.navList, children: rows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
        "button",
        {
          type: "button",
          className: cx(panelCss.navCell, page === row.id && panelCss.navCellActive),
          "aria-current": page === row.id ? "page" : void 0,
          onClick: () => setPage(row.id),
          children: [
            row.icon,
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: panelCss.navLabel, children: row.label }),
            row.id === "memory" && hasDrafts && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: panelCss.dot, "aria-hidden": "true" })
          ]
        },
        row.id
      )) })
    ] }),
    page === "personalize" ? (
      /* The memory page carries its own scrolling column; the personalize
         page is a bare card list, so the panel supplies the column here. */
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: panelCss.content, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        PersonalizePage,
        {
          t,
          snapshot,
          loading: view.loading,
          busy: view.busy,
          query,
          onPatch: face.onPatch,
          onSaveDocument: face.onSaveDocument
        }
      ) })
    ) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      MemoryPage,
      {
        t,
        snapshot,
        loading: view.loading,
        busy: view.busy,
        query,
        onPatch: face.onPatch,
        onSaveDocument: face.onSaveDocument,
        onAction: face.onAction,
        onConsolidate: face.onConsolidate,
        onJournal: face.onJournal
      }
    )
  ] });
}
function registerMemoryBuddyPanel(ctx, face) {
  const slots = ctx.slots;
  const disposers = [];
  disposers.push(
    slots.inject(
      "sidebar.panellist",
      () => slots.register(
        {
          name: "sidebar.panellist",
          id: PANEL_ID,
          order: PANEL_ORDER,
          // The shell resolves this through resolveSlotLabel on every locale
          // change, so the module-level translate reads the active language at
          // call time.
          label: () => t("entry.label")
        },
        MemoryBuddyPanelIcon
      )
    )
  );
  disposers.push(
    slots.inject(
      "main",
      () => slots.register(
        {
          name: "main",
          key: PANEL_ID,
          inject: () => ({ face })
        },
        MemoryBuddyPanel
      )
    )
  );
  return () => {
    for (const dispose of disposers.splice(0)) dispose();
  };
}

// src/client/sections.tsx
var import_jsx_runtime6 = require("react/jsx-runtime");
var PERSONALIZE_SECTION_ID = "memorybuddy-personalize";
var MEMORY_SECTION_ID = "memorybuddy-memory";
function PersonalizeSettingsSection(props) {
  const { face } = props;
  const view = face.useView();
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: panelCss.section, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
    PersonalizePage,
    {
      t,
      snapshot: view.snapshot,
      loading: view.loading,
      busy: view.busy,
      query: "",
      onPatch: face.onPatch,
      onSaveDocument: face.onSaveDocument
    }
  ) });
}
function MemorySettingsSection(props) {
  const { face } = props;
  const view = face.useView();
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
    MemoryPage,
    {
      t,
      snapshot: view.snapshot,
      loading: view.loading,
      busy: view.busy,
      query: "",
      onPatch: face.onPatch,
      onSaveDocument: face.onSaveDocument,
      onAction: face.onAction,
      onConsolidate: face.onConsolidate,
      onJournal: face.onJournal,
      heading: false,
      bare: true
    }
  );
}
function registerSettingsSections(ctx, face) {
  const slots = ctx.slots;
  const disposers = [];
  const register = (id, order, label, component) => {
    disposers.push(
      slots.inject("settings.section", () => {
        const off = slots.register(
          { name: "settings.section", id, order, label: () => t(label), inject: () => ({ face }) },
          component
        );
        return typeof off === "function" ? off : () => {
        };
      })
    );
  };
  register(PERSONALIZE_SECTION_ID, 30, "nav.personalize", PersonalizeSettingsSection);
  register(MEMORY_SECTION_ID, 31, "nav.memory", MemorySettingsSection);
  return () => {
    for (const dispose of disposers.splice(0)) dispose();
  };
}

// src/client/index.ts
var inject = ["slots", "locale"];
var PAGE_FLAG = "__dshMemoryBuddyMounted";
function apply(ctx) {
  try {
    applyInner(ctx);
  } catch (error) {
    console.error("memorybuddy: \u9762\u677F\u6302\u8F7D\u5931\u8D25\uFF0C\u63D2\u4EF6\u5DF2\u8DF3\u8FC7\uFF1A", error);
  }
}
function applyInner(ctx) {
  const page = globalThis;
  if (page[PAGE_FLAG] === true) return;
  page[PAGE_FLAG] = true;
  const effect = (callback, label) => {
    try {
      ctx.effect?.(callback, label);
    } catch (error) {
      console.error(`memorybuddy: ctx.effect(${label}) \u5931\u8D25\uFF1A`, error);
    }
  };
  effect(() => () => {
    page[PAGE_FLAG] = false;
  }, "memorybuddy: mount claim");
  installPanelStyles();
  effect(() => {
    const locale = ctx.locale;
    if (locale === void 0) return () => {
    };
    let dispose;
    try {
      const handle = locale.register(NS, DICTIONARIES);
      if (typeof handle === "function") dispose = handle;
    } catch {
    }
    try {
      setRuntimeTranslate(locale.bind(NS));
    } catch {
    }
    const sync = () => {
      try {
        const active2 = locale.getSnapshot?.().active;
        if (typeof active2 === "string") setActiveLocale(active2);
      } catch {
      }
    };
    sync();
    const off = ctx.on?.("locale/change", sync);
    return () => {
      dispose?.();
      setRuntimeTranslate(void 0);
      if (typeof off === "function") off();
    };
  }, "memorybuddy: dictionaries");
  const controller = new MemoryController();
  effect(() => {
    void controller.load();
    return () => controller.dispose();
  }, "memorybuddy: controller");
  const face = {
    useView: () => useMemoryView(controller),
    onPatch: (patch) => {
      void controller.patch(patch);
    },
    onSaveDocument: (path, text, revision) => controller.save(path, text, revision).then((outcome) => outcome === "saved"),
    onAction: (action) => controller.act(action),
    onConsolidate: () => controller.consolidate(),
    onJournal: (date) => controller.journal(date)
  };
  registerMemoryBuddyPanel(ctx, face);
  registerSettingsSections(ctx, face);
}
    // esbuild's CommonJS output ends with a reassignment of module.exports to
    // its __toCommonJS wrapper, which REPLACES the object exports started as -
    // so the module tag has to be stamped on whatever module.exports finally
    // points at, not on the original export object.
    Object.defineProperty(module.exports, Symbol.toStringTag, { value: "Module" });
    return module.exports;
  }
});
//# sourceMappingURL=client.js.map
