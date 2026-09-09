const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { sourcePath } = require("./source-paths.cjs");
const vm = require("node:vm");

const pluginRoot = path.resolve(__dirname, "..");

function pluginPath(...parts) {
  return sourcePath(path.join(...parts).replace(/\\/g, "/"));
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function createMomentStub() {
  const api = {
    startOf() { return api; },
    format(fmt) {
      if (fmt === "YYYY-MM-DD") return "2026-05-01";
      return "2026-05-01";
    },
    isValid() { return true; },
    isBefore() { return false; },
    hours() { return 12; },
    minutes() { return 0; }
  };
  return api;
}

function loadTimelineHooks() {
  const code = fs.readFileSync(pluginPath("views/tasks-timeline/view.js"), "utf8");
  const context = {
    console,
    moment: createMomentStub,
    globalThis: null,
    __NORIA_TL_TEST__: true
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context, { filename: "views/tasks-timeline/view.js" });
  return context.__noriaTimelineTestHooks;
}

function loadHabitParsingUtils() {
  const code = fs.readFileSync(pluginPath("views/dashboard/core/utils/habit-parsing.js"), "utf8");
  const context = { globalThis: null };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context, { filename: "views/dashboard/core/utils/habit-parsing.js" });
  return context.dashboardCore.utils.habitParsing;
}

function loadTaskDisplayUtils() {
  const code = fs.readFileSync(pluginPath("views/dashboard/core/utils/task-display.js"), "utf8");
  const context = { globalThis: null };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context, { filename: "views/dashboard/core/utils/task-display.js" });
  return context.dashboardCore.utils.taskDisplay;
}

function loadTimelineActionsAdapter() {
  const code = fs.readFileSync(pluginPath("core/adapters/timeline-actions-adapter.js"), "utf8");
  const context = { globalThis: null };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context, { filename: "core/adapters/timeline-actions-adapter.js" });
  return context.dashboardCore.adapters.timelineActionsAdapter;
}

function loadTaskTimelineEventModel() {
  const code = fs.readFileSync(pluginPath("views/task-timeline/event-model.js"), "utf8");
  const context = {
    globalThis: null,
    __NORIA_TASK_TIMELINE_TEST__: true
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context, { filename: "views/task-timeline/event-model.js" });
  return context.__noriaTaskTimelineEventModelTestHooks;
}

function loadTaskTimelineTaskAdapter() {
  const code = fs.readFileSync(pluginPath("views/task-timeline/task-adapter.js"), "utf8");
  const context = {
    globalThis: null,
    __NORIA_TASK_TIMELINE_TEST__: true
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context, { filename: "views/task-timeline/task-adapter.js" });
  return context.__noriaTaskTimelineTaskAdapterTestHooks;
}

function loadTaskTimelineTaskPipeline() {
  const eventModelCode = fs.readFileSync(pluginPath("views/task-timeline/event-model.js"), "utf8");
  const taskAdapterCode = fs.readFileSync(pluginPath("views/task-timeline/task-adapter.js"), "utf8");
  const context = {
    globalThis: null,
    __NORIA_TASK_TIMELINE_TEST__: true
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(eventModelCode, context, { filename: "views/task-timeline/event-model.js" });
  vm.runInContext(taskAdapterCode, context, { filename: "views/task-timeline/task-adapter.js" });
  return {
    eventModel: context.__noriaTaskTimelineEventModelTestHooks,
    taskAdapter: context.__noriaTaskTimelineTaskAdapterTestHooks
  };
}

function loadTaskTimelineAnnotationProvider() {
  const eventModelCode = fs.readFileSync(pluginPath("views/task-timeline/event-model.js"), "utf8");
  const annotationCode = fs.readFileSync(pluginPath("views/task-timeline/annotation-provider.js"), "utf8");
  const context = {
    globalThis: null,
    __NORIA_TASK_TIMELINE_TEST__: true
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(eventModelCode, context, { filename: "views/task-timeline/event-model.js" });
  vm.runInContext(annotationCode, context, { filename: "views/task-timeline/annotation-provider.js" });
  return context.__noriaTaskTimelineAnnotationProviderTestHooks;
}

function loadTaskTimelinePomodoroProvider() {
  const eventModelCode = fs.readFileSync(pluginPath("views/task-timeline/event-model.js"), "utf8");
  const pomodoroCode = fs.readFileSync(pluginPath("views/task-timeline/pomodoro-provider.js"), "utf8");
  const context = {
    globalThis: null,
    __NORIA_TASK_TIMELINE_TEST__: true
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(eventModelCode, context, { filename: "views/task-timeline/event-model.js" });
  vm.runInContext(pomodoroCode, context, { filename: "views/task-timeline/pomodoro-provider.js" });
  return context.__noriaTaskTimelinePomodoroProviderTestHooks;
}

function loadTaskTimelinePomodoroBinding() {
  const code = fs.readFileSync(pluginPath("views/task-timeline/pomodoro-binding.js"), "utf8");
  const context = {
    console,
    globalThis: null,
    __NORIA_TASK_TIMELINE_TEST__: true
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context, { filename: "views/task-timeline/pomodoro-binding.js" });
  const hooks = context.__noriaTaskTimelinePomodoroBindingTestHooks;
  Object.defineProperty(hooks, "__context", { value: context });
  return hooks;
}

function loadTaskTimelineTraceProvider() {
  const eventModelCode = fs.readFileSync(pluginPath("views/task-timeline/event-model.js"), "utf8");
  const traceCode = fs.readFileSync(pluginPath("views/task-timeline/trace-provider.js"), "utf8");
  const context = {
    globalThis: null,
    __NORIA_TASK_TIMELINE_TEST__: true
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(eventModelCode, context, { filename: "views/task-timeline/event-model.js" });
  vm.runInContext(traceCode, context, { filename: "views/task-timeline/trace-provider.js" });
  return context.__noriaTaskTimelineTraceProviderTestHooks;
}

function loadTaskTimelineTaskEdit() {
  const code = fs.readFileSync(pluginPath("views/task-timeline/task-edit.js"), "utf8");
  const context = {
    globalThis: null,
    __NORIA_TASK_TIMELINE_TEST__: true
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context, { filename: "views/task-timeline/task-edit.js" });
  return context.__noriaTaskTimelineTaskEditTestHooks;
}

function createFakeElement(tag = "div", attrs = {}) {
  const classes = new Set(String(attrs.cls || "").split(/\s+/).filter(Boolean));
  let ownTextContent = attrs.text != null ? String(attrs.text) : "";
  const el = {
    tag,
    children: [],
    attrs: {},
    style: {},
    disabled: false,
    _listeners: {},
    classList: {
      add(...names) {
        names.filter(Boolean).forEach((name) => classes.add(String(name)));
      },
      remove(...names) {
        names.filter(Boolean).forEach((name) => classes.delete(String(name)));
      },
      contains(name) {
        return classes.has(String(name));
      }
    },
    createEl(childTag, childAttrs = {}) {
      const child = createFakeElement(childTag, childAttrs);
      this.children.push(child);
      child.parentElement = this;
      return child;
    },
    createDiv(childAttrs = {}) {
      return this.createEl("div", childAttrs);
    },
    appendChild(child) {
      this.children.push(child);
      child.parentElement = this;
      return child;
    },
    insertBefore(child, reference) {
      if (!reference) return this.appendChild(child);
      this.children = this.children.filter((item) => item !== child);
      const index = this.children.indexOf(reference);
      if (index < 0) return this.appendChild(child);
      this.children.splice(index, 0, child);
      child.parentElement = this;
      return child;
    },
    removeChild(child) {
      this.children = this.children.filter((item) => item !== child);
      if (child) child.parentElement = null;
      return child;
    },
    addEventListener(type, listener) {
      const key = String(type || "");
      if (!this._listeners[key]) this._listeners[key] = [];
      this._listeners[key].push(listener);
    },
    removeEventListener(type, listener) {
      const key = String(type || "");
      this._listeners[key] = (this._listeners[key] || []).filter((item) => item !== listener);
    },
    dispatchEvent(event) {
      const ev = event || {};
      ev.type = ev.type || "";
      ev.target = ev.target || this;
      (this._listeners[ev.type] || []).slice().forEach((listener) => listener(ev));
      return true;
    },
    setAttribute(key, value) {
      this.attrs[String(key)] = String(value);
      if (String(key) === "id") this.id = String(value);
      if (String(key) === "class") this.className = String(value);
    },
    getAttribute(key) {
      return this.attrs[String(key)];
    },
    hasAttribute(key) {
      return Object.prototype.hasOwnProperty.call(this.attrs, String(key));
    },
    removeAttribute(key) {
      delete this.attrs[String(key)];
    },
    querySelector(selector) {
      if (!String(selector || "").startsWith(".")) return null;
      const cls = String(selector).slice(1);
      const stack = [...this.children];
      while (stack.length) {
        const cur = stack.shift();
        if (cur.classList?.contains(cls)) return cur;
        stack.push(...(cur.children || []));
      }
      return null;
    },
    querySelectorAll(selector) {
      const selectors = String(selector || "").split(",").map((item) => item.trim()).filter(Boolean);
      const classSelectors = selectors
        .filter((item) => item.startsWith("."))
        .map((item) => item.slice(1));
      const out = [];
      const stack = [...this.children];
      while (stack.length) {
        const cur = stack.shift();
        if (classSelectors.some((cls) => cur.classList?.contains(cls))) out.push(cur);
        stack.push(...(cur.children || []));
      }
      return out;
    }
  };
  Object.defineProperty(el, "className", {
    get() {
      return Array.from(classes).join(" ");
    },
    set(value) {
      classes.clear();
      String(value || "").split(/\s+/).filter(Boolean).forEach((name) => classes.add(name));
    }
  });
  Object.defineProperty(el, "textContent", {
    get() {
      return ownTextContent;
    },
    set(value) {
      ownTextContent = String(value == null ? "" : value);
      if (ownTextContent !== "") return;
      this.children.slice().forEach((child) => this.removeChild(child));
    }
  });
  if (attrs.cls) el.className = attrs.cls;
  return el;
}

function collectText(el) {
  const out = [];
  const walk = (node) => {
    if (!node) return;
    if (node.textContent) out.push(node.textContent);
    (node.children || []).forEach(walk);
  };
  walk(el);
  return out.join(" ");
}

test("timeline title display strips habit target metadata and control tags", () => {
  const hooks = loadTimelineHooks();
  assert.ok(hooks, "timeline test hooks should be exposed");

  const text = hooks.stripForDisplay(
    "喝水 [target:: 5] [type:: number] [value:: 2] [unit:: 杯] [🍅:: 2/4] #habit #active #tl/water ^noria12"
  );

  assert.equal(text, "喝水");
});

test("timeline title display strips regular markdown tags from title", () => {
  const hooks = loadTimelineHooks();
  assert.ok(hooks, "timeline test hooks should be exposed");

  const text = hooks.stripForDisplay(
    "定义主结果清单（图、表、章节映射） #proj-equation #paper/weno [due:: 2026-05-14]"
  );

  assert.equal(text, "定义主结果清单（图、表、章节映射）");
});

test("timeline task line resolver uses only a unique exact title fallback", () => {
  const hooks = loadTimelineHooks();
  const duplicated = [
    "- [ ] 同名任务 [due:: 2026-05-01]",
    "- [ ] 并发插入任务",
    "- [ ] 同名任务 [due:: 2026-05-03]"
  ];
  const unique = [
    "- [ ] 其他任务",
    "- [ ] 并发插入任务",
    "- [ ] 目标任务 [due:: 2026-05-03]"
  ];

  assert.equal(hooks.pickTaskLineIndex(duplicated, 1, { text: "同名任务" }), -1);
  assert.equal(hooks.pickTaskLineIndex(duplicated, 0, { text: "同名任务" }), -1);
  assert.equal(hooks.pickTaskLineIndex(unique, 1, { text: "目标任务" }), 2);
});

test("timeline task mutations re-resolve the target inside vault.process", () => {
  const runtime = fs.readFileSync(pluginPath("views/tasks-timeline/view.js"), "utf8");
  const start = runtime.indexOf("async function noriaTlMutateTaskLine(tk, mutator)");
  const end = runtime.indexOf("\nfunction noriaTlTaskCreatedMinute", start);

  assert.ok(start >= 0, "timeline task mutation helper should exist");
  assert.ok(end > start, "timeline task mutation helper boundary should be found");
  const method = runtime.slice(start, end);
  assert.match(method, /app\.vault\.process/);
  assert.match(method, /noriaTlPickTaskLineIndex/);
});

test("timeline pomodoro metadata cleanup reuses the guarded task mutation helper", () => {
  const runtime = fs.readFileSync(pluginPath("views/tasks-timeline/view.js"), "utf8");
  const migrateStart = runtime.indexOf("async function noriaTlMigrateTaskLegacyPomodoro(tk)");
  const migrateEnd = runtime.indexOf("\nfunction noriaTlScheduleLegacyPomodoroMigration", migrateStart);
  const resetStart = runtime.indexOf("async function noriaTlResetTaskTimer(tk)");
  const resetEnd = runtime.indexOf("\nasync function noriaTlStopTaskTimer", resetStart);

  assert.ok(migrateStart >= 0 && migrateEnd > migrateStart);
  assert.ok(resetStart >= 0 && resetEnd > resetStart);
  const methods = `${runtime.slice(migrateStart, migrateEnd)}\n${runtime.slice(resetStart, resetEnd)}`;
  assert.match(methods, /noriaTlMutateTaskLine/);
  assert.doesNotMatch(methods, /app\.vault\.modify/);
});

test("shared task display cleans overdue warnings, dates, metadata, and control tags", () => {
  const taskDisplay = loadTaskDisplayUtils();

  const title = taskDisplay.cleanTaskTitle(
    "⚠️ ! 写周报 📅 2026-04-30 [due:: 2026-04-30] [priority:: high] #active #habit #project/a ❗"
  );

  assert.equal(title, "写周报");
});

test("shared task display derives overdue state without appending warning text", () => {
  const taskDisplay = loadTaskDisplayUtils();

  const state = taskDisplay.getTaskVisualState(
    { completed: false, text: "写周报 [due:: 2026-04-30]" },
    "2026-05-02"
  );

  assert.equal(state, "overdue");
  assert.doesNotMatch(taskDisplay.cleanTaskTitle("写周报 ⚠️"), /⚠|!/);
});

test("shared task row uses circle state only and hides overdue badge by default", () => {
  const taskDisplay = loadTaskDisplayUtils();
  const root = createFakeElement("div");

  const row = taskDisplay.renderTaskRow(
    root,
    { completed: false, text: "写周报 [due:: 2026-04-30]" },
    { anchorDate: "2026-05-02" }
  );

  assert.ok(row.classList.contains("noria-periodic-task-row--overdue"));
  assert.equal(root.querySelector(".noria-periodic-task-badge"), null);
  assert.doesNotMatch(collectText(root), /逾期/);
});

test("timeline event library parser reads checked template rows and legacy tables", () => {
  const adapter = loadTimelineActionsAdapter();
  assert.equal(typeof adapter.parseEventTemplateLibrary, "function");
  assert.equal(typeof adapter.getEnabledEventTemplates, "function");

  const canonical = [
    "# 事件库",
    "",
    "- [x] 深度工作 [default_tag:: #tl/focus] [default_start::09:00] [default_duration_min::90] #tl/template",
    "- [ ] 暂停事件 [default_tag:: #tl/paused] [default_start::15:00] [default_duration_min::20] #tl/template",
    "- [x] 睡眠 [default_tag:: #tl/sleep] [default_start::23:30] [default_duration_min::450] [default_cross_day:: true] #tl/template",
    ""
  ].join("\n");

  const parsed = adapter.parseEventTemplateLibrary(canonical);
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].label, "深度工作");
  assert.equal(parsed[0].timelineTag, "#tl/focus");
  assert.equal(parsed[0].startTime, "09:00");
  assert.equal(parsed[0].durationMin, 90);
  assert.equal(parsed[1].enabled, false);
  assert.equal(parsed[2].crossDay, true);

  const enabled = adapter.getEnabledEventTemplates(canonical);
  assert.deepEqual(Array.from(enabled, (item) => item.label), ["深度工作", "睡眠"]);

  const legacy = [
    "## Event library",
    "",
    "| Name | Start | Duration | Tag |",
    "| --- | --- | --- | --- |",
    "| Deep work | 09:00 | 90 | #tl/focus |",
    "| Evening review | 21:30 | 20 | #tl/review |",
    ""
  ].join("\n");

  const legacyParsed = adapter.parseEventTemplateLibrary(legacy);
  assert.equal(legacyParsed.length, 2);
  assert.equal(legacyParsed[0].label, "Deep work");
  assert.equal(legacyParsed[0].timelineTag, "#tl/focus");
  assert.equal(legacyParsed[0].enabled, true);
});

test("now marker insertion uses timed task order and ignores untimed lists", () => {
  const hooks = loadTimelineHooks();

  assert.equal(
    hooks.pickNowMarkerIndex(
      [
        { hasTime: true, startMin: 9 * 60, endMin: 10 * 60 },
        { hasTime: true, startMin: 13 * 60, endMin: 14 * 60 }
      ],
      11 * 60
    ),
    1
  );
  assert.equal(hooks.pickNowMarkerIndex([{ hasTime: false, startMin: null }], 11 * 60), -1);
});

test("blank timeline gap creation snaps to the inferred neighboring interval", () => {
  const hooks = loadTimelineHooks();

  assert.equal(
    hooks.inferBlankCreateStartMin({
      prevMeta: { hasTime: true, startMin: 9 * 60, endMin: 10 * 60 },
      nextMeta: { hasTime: true, startMin: 11 * 60, endMin: 12 * 60 },
      nowMin: 15 * 60 + 2,
      fallbackMin: 9 * 60,
      snapMinutes: 5,
      defaultDurationMin: 30
    }),
    10 * 60 + 30
  );

  assert.equal(
    hooks.inferBlankCreateStartMin({
      nowMin: 15 * 60 + 2,
      fallbackMin: 9 * 60,
      snapMinutes: 5,
      defaultDurationMin: 30
    }),
    15 * 60 + 5
  );
});

test("timeline layout normalization prevents clipped left time labels", () => {
  const hooks = loadTimelineHooks();
  const defaults = hooks.defaultPlannerLabControls();
  const merged = hooks.mergePlannerLabControls({
    timeline: {
      timeColWidth: 24,
      timeColInset: -8,
      axisToCardGap: 6
    }
  });

  assert.equal(defaults.timeline.timeColWidth, 34);
  assert.equal(defaults.timeline.timeColInset, 0);
  assert.equal(defaults.timeline.axisToCardGap, 2);
  assert.equal(merged.timeline.timeColWidth, 34);
  assert.equal(merged.timeline.timeColInset, 0);
});

test("timeline task date bucketing uses due date before start date for normal tasks", () => {
  const hooks = loadTimelineHooks();

  assert.equal(
    hooks.primaryYmdForTask({
      text: "- [ ] Future due [start:: 2026-05-01 09:00] [due:: 2026-05-10 10:00]"
    }),
    "2026-05-10"
  );
});

test("timeline control tasks keep start date as bucket for cross-day ranges", () => {
  const hooks = loadTimelineHooks();

  assert.equal(
    hooks.primaryYmdForTask({
      text: "- [ ] 睡眠 #tl/sleep [start:: 2026-05-01 23:30] [due:: 2026-05-02 07:00]"
    }),
    "2026-05-01"
  );
});

test("task timeline unified event model normalizes provider events and maps them to timeline JSON", () => {
  const model = loadTaskTimelineEventModel();
  const events = model.normalizeTimelineEvents([
    {
      id: "ann-focus",
      layer: "annotation",
      kind: "span",
      title: "Focus block",
      start: "2026-06-01T09:00:00+08:00",
      end: "2026-06-01T11:00:00+08:00",
      color: "#f6c77a",
      source: { type: "noria" },
      tags: ["#noria"],
      payload: { annotationId: "ann-focus" }
    }
  ]);
  const json = model.timelineEventsToJson(events);

  assert.equal(events.length, 1);
  assert.equal(events[0].layer, "annotation");
  assert.equal(events[0].isInstant, false);
  assert.equal(events[0].source.type, "noria");
  assert.deepEqual(events[0].tags, ["#noria"]);
  assert.equal(json.dateTimeFormat, "iso8601");
  assert.equal(json.events.length, 1);
  assert.equal(json.events[0].durationEvent, true);
  assert.equal(json.events[0].noria.layer, "annotation");
  assert.equal(json.events[0].noria.kind, "span");
  assert.match(json.events[0].classname, /noria-task-timeline-event--annotation/);
  assert.match(json.events[0].classname, /noria-task-timeline-event--span/);
});

test("task timeline task adapter emits unified task events before timeline JSON", () => {
  const { taskAdapter } = loadTaskTimelineTaskPipeline();
  const timeline = taskAdapter.tasksToTimelineEvents([
    {
      text: "- [ ] 睡眠 #tl/sleep [start:: 2026-05-01 23:30] [due:: 2026-05-02 07:00]",
      path: "06_Diary/2026-05-01.md",
      line: 4
    }
  ]);
  const json = taskAdapter.tasksToTimelineJson([
    {
      text: "- [ ] 睡眠 #tl/sleep [start:: 2026-05-01 23:30] [due:: 2026-05-02 07:00]",
      path: "06_Diary/2026-05-01.md",
      line: 4
    }
  ]);

  assert.equal(timeline.events.length, 1);
  assert.equal(timeline.events[0].layer, "task");
  assert.equal(timeline.events[0].kind, "duration");
  assert.equal(timeline.events[0].source.type, "markdown");
  assert.equal(timeline.events[0].source.path, "06_Diary/2026-05-01.md");
  assert.equal(timeline.events[0].payload.noria.primaryYmd, "2026-05-01");
  assert.equal(json.events.length, 1);
  assert.equal(json.events[0].noria.layer, "task");
  assert.equal(json.events[0].noria.provider, "tasks");
  assert.equal(json.events[0].noria.kind, "duration");
  assert.equal(json.events[0].durationEvent, true);
});

test("task timeline unified event model filters by layer, status, tags, and text", () => {
  const model = loadTaskTimelineEventModel();
  const events = model.normalizeTimelineEvents([
    {
      id: "task-1",
      layer: "task",
      kind: "duration",
      title: "Launch Noria timeline",
      start: "2026-06-01T09:00:00+08:00",
      end: "2026-06-01T10:00:00+08:00",
      status: "open",
      tags: ["#noria"]
    },
    {
      id: "task-2",
      layer: "task",
      kind: "due",
      title: "Archive report",
      start: "2026-06-01T11:00:00+08:00",
      status: "done",
      tags: ["#report"]
    },
    {
      id: "git-1",
      layer: "git",
      kind: "commit",
      title: "Launch cleanup commit",
      start: "2026-06-01T12:00:00+08:00",
      tags: ["#noria"]
    }
  ]);
  const filtered = model.filterTimelineEvents(events, {
    layers: ["task"],
    status: ["open"],
    tags: ["#noria"],
    text: "launch"
  });

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, "task-1");
});

test("task timeline unified event model parses filter query tokens for project-style timeline views", () => {
  const model = loadTaskTimelineEventModel();
  const events = model.normalizeTimelineEvents([
    {
      id: "task-a",
      layer: "task",
      kind: "duration",
      title: "Write Noria plan",
      start: "2026-06-01T08:00:00+08:00",
      end: "2026-06-01T09:00:00+08:00",
      status: "open",
      source: { path: "06_Diary/2026-06-01.md", type: "markdown" },
      tags: ["#proj/noria", "#writing"]
    },
    {
      id: "task-b",
      layer: "task",
      kind: "deadline",
      title: "Done Noria task",
      start: "2026-06-01T11:00:00+08:00",
      status: "done",
      source: { path: "01_Projects/Noria.md", type: "markdown" },
      tags: ["#proj/noria"]
    },
    {
      id: "pomo-a",
      layer: "pomodoro",
      kind: "active-work",
      title: "Pomodoro: Write Noria plan",
      start: "2026-06-01T09:30:00+08:00",
      end: "2026-06-01T09:40:00+08:00",
      status: "running",
      source: { path: "06_Diary/2026-06-01.md", type: "noria" },
      tags: ["#pomodoro"]
    },
    {
      id: "mark-a",
      layer: "annotation",
      kind: "span",
      title: "Shot",
      start: "2026-06-01T10:00:00+08:00",
      end: "2026-06-01T10:30:00+08:00"
    }
  ]);

  assert.deepEqual(
    model.filterTimelineEvents(events, { layers: ["task", "annotation", "pomodoro"], query: "layer:task tag:#proj/noria source:06_Diary -status:done Noria" }).map((event) => event.id),
    ["task-a"]
  );
  assert.deepEqual(
    model.filterTimelineEvents(events, { query: "layer:pomodoro kind:active-work" }).map((event) => event.id),
    ["pomo-a"]
  );
  assert.deepEqual(
    model.filterTimelineEvents(events, { query: "layer:task -tag:#writing" }).map((event) => event.id),
    ["task-b"]
  );
});

test("task timeline unified event model supports explicit include and exclude tag lists", () => {
  const model = loadTaskTimelineEventModel();
  const events = model.normalizeTimelineEvents([
    {
      id: "research-write",
      layer: "task",
      title: "Write results",
      start: "2026-06-01T08:00:00+08:00",
      tags: ["#research", "#writing"]
    },
    {
      id: "research-admin",
      layer: "task",
      title: "Prepare paperwork",
      start: "2026-06-01T09:00:00+08:00",
      tags: ["#research", "#admin"]
    },
    {
      id: "personal-write",
      layer: "task",
      title: "Write journal",
      start: "2026-06-01T10:00:00+08:00",
      tags: ["#personal", "#writing"]
    }
  ]);

  assert.deepEqual(
    model.filterTimelineEvents(events, { includeTags: ["#research"], excludeTags: ["#admin"] }).map((event) => event.id),
    ["research-write"]
  );
});

test("task timeline unified event model can exclude completed task statuses without hiding annotations", () => {
  const model = loadTaskTimelineEventModel();
  const events = model.normalizeTimelineEvents([
    {
      id: "task-open",
      layer: "task",
      kind: "due",
      title: "Open work",
      start: "2026-06-01T09:00:00+08:00",
      status: "open"
    },
    {
      id: "task-done",
      layer: "task",
      kind: "due",
      title: "Done work",
      start: "2026-06-01T10:00:00+08:00",
      status: "done"
    },
    {
      id: "annotation-1",
      layer: "annotation",
      kind: "span",
      title: "Planning block",
      start: "2026-06-01T08:00:00+08:00",
      end: "2026-06-01T09:00:00+08:00"
    }
  ]);
  const filtered = model.filterTimelineEvents(events, {
    layers: ["task", "annotation"],
    excludeStatus: ["done"]
  });

  assert.deepEqual(filtered.map((event) => event.id), ["task-open", "annotation-1"]);
});

test("task timeline unified event model collects provider events and isolates provider failures", async () => {
  const model = loadTaskTimelineEventModel();
  const result = await model.collectProviderEvents([
    {
      id: "tasks",
      layer: "task",
      collect() {
        return [
          {
            id: "task-1",
            kind: "due",
            title: "Submit report",
            start: "2026-06-01T09:00:00+08:00"
          }
        ];
      }
    },
    {
      id: "git",
      layer: "git",
      collect() {
        throw new Error("git unavailable");
      }
    }
  ], { range: "today" });

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].layer, "task");
  assert.equal(result.events[0].provider, "tasks");
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].provider, "git");
  assert.match(result.errors[0].message, /git unavailable/);
});

test("presentation annotation provider maps point and span annotations to unified events", () => {
  const provider = loadTaskTimelineAnnotationProvider();
  const timeline = provider.annotationsToTimelineEvents([
    {
      id: "ann-focus",
      type: "span",
      title: "Focus block",
      start: "2026-06-01T09:00:00+08:00",
      end: "2026-06-01T11:00:00+08:00",
      color: "#f6c77a",
      tags: ["#noria"]
    },
    {
      id: "ann-point",
      type: "point",
      title: "Review marker",
      start: "2026-06-01T12:00:00+08:00",
      color: "#8ab4f8"
    }
  ]);

  assert.equal(timeline.events.length, 2);
  assert.equal(timeline.events[0].layer, "annotation");
  assert.equal(timeline.events[0].kind, "span");
  assert.equal(timeline.events[0].isInstant, false);
  assert.equal(timeline.events[0].color, "#f6c77a");
  assert.equal(timeline.events[0].payload.annotation.id, "ann-focus");
  assert.equal(timeline.events[1].kind, "point");
  assert.equal(timeline.events[1].isInstant, true);
  assert.match(timeline.events[0].presentation.classname, /noria-task-timeline-annotation--span/);
});

test("presentation pomodoro provider maps stored and active sessions to unified events", () => {
  const provider = loadTaskTimelinePomodoroProvider();
  const timeline = provider.pomodoroStateToTimelineEvents({
    version: 2,
    active: {
      taskKey: "zp_a",
      mode: "WORK",
      status: "running",
      startedAt: "2026-06-01T09:30:00+08:00",
      elapsedMs: 10 * 60 * 1000,
      durationMin: 25
    },
    tasks: {
      zp_a: {
        path: "06_Diary/2026-06-01.md",
        lineHint: 4,
        titleSnapshot: "Write Noria plan",
        sessions: [
          {
            mode: "WORK",
            start: "2026-06-01T08:00:00+08:00",
            end: "2026-06-01T08:25:00+08:00",
            durationMin: 25,
            completed: true
          }
        ]
      }
    }
  }, { now: "2026-06-01T09:40:00+08:00" });

  assert.equal(timeline.events.length, 2);
  assert.equal(timeline.events[0].layer, "pomodoro");
  assert.equal(timeline.events[0].kind, "work");
  assert.equal(timeline.events[0].title, "Pomo 25m");
  assert.match(timeline.events[0].presentation.hoverText, /^Task: Write Noria plan/m);
  assert.equal(timeline.events[0].source.path, "06_Diary/2026-06-01.md");
  assert.equal(timeline.events[0].source.line, 4);
  assert.equal(timeline.events[1].kind, "active-work");
  assert.equal(timeline.events[1].title, "Pomo 10m");
  assert.equal(timeline.events[1].end, "2026-06-01T09:40:00+08:00");
  assert.match(timeline.events[1].presentation.classname, /noria-task-timeline-pomodoro--active/);
});

test("presentation pomodoro provider keeps raw task markdown out of event labels", () => {
  const provider = loadTaskTimelinePomodoroProvider();
  const timeline = provider.pomodoroStateToTimelineEvents({
    version: 2,
    tasks: {
      zp_raw: {
        path: "06_Diary/2026-06-01.md",
        lineHint: 7,
        titleSnapshot: "- [x] 与讨论这种问题一句话版本 #proj/noria",
        sessions: [
          {
            mode: "WORK",
            start: "2026-06-01T08:00:00+08:00",
            end: "2026-06-01T08:25:00+08:00",
            durationMin: 25,
            completed: true
          }
        ]
      }
    }
  });

  assert.equal(timeline.events.length, 1);
  assert.equal(timeline.events[0].title, "Pomo 25m");
  assert.doesNotMatch(timeline.events[0].title, /\[[ xX]\]/);
  assert.doesNotMatch(timeline.events[0].title, /与讨论这种问题/);
  assert.match(timeline.events[0].presentation.hoverText, /^Task: 与讨论这种问题一句话版本 #proj\/noria/m);
});

test("presentation pomodoro provider renders unassigned active timers as standalone traces", () => {
  const provider = loadTaskTimelinePomodoroProvider();
  const timeline = provider.pomodoroStateToTimelineEvents({
    version: 2,
    workLen: 25,
    active: {
      mode: "WORK",
      status: "running",
      startedAt: "2026-06-01T10:00:00+08:00",
      elapsedMs: 0,
      durationMin: 25
    },
    tasks: {}
  }, { now: "2026-06-01T10:12:00+08:00" });

  assert.equal(timeline.events.length, 1);
  assert.equal(timeline.events[0].id, "pomodoro-active-unassigned");
  assert.equal(timeline.events[0].layer, "pomodoro");
  assert.equal(timeline.events[0].kind, "active-work");
  assert.equal(timeline.events[0].title, "Pomo 12m");
  assert.equal(timeline.events[0].start, "2026-06-01T10:00:00+08:00");
  assert.equal(timeline.events[0].end, "2026-06-01T10:12:00+08:00");
  assert.equal(timeline.events[0].payload.pomodoro.taskKey, "");
  assert.match(timeline.events[0].presentation.hoverText, /Source: unassigned/);
});

test("presentation pomodoro binding derives stable task metadata without inline timer noise", () => {
  const binding = loadTaskTimelinePomodoroBinding();
  const event = {
    id: "06_Diary/2026-06-01.md#12",
    title: "写 Noria 时间轴",
    noria: {
      path: "06_Diary/2026-06-01.md",
      line: 12,
      task: {
        text: { raw: "- [ ] 写 Noria 时间轴 [🍅:: 1] [timer_running:: 2026-06-01T10:00:00] #proj/noria ^noria99" }
      }
    }
  };

  const meta = binding.taskPomodoroMeta(event);

  assert.equal(meta.path, "06_Diary/2026-06-01.md");
  assert.equal(meta.lineHint, 12);
  assert.equal(meta.title, "写 Noria 时间轴");
  assert.ok(meta.taskKey.startsWith("zp_"));
  assert.doesNotMatch(meta.textFingerprint, /\[🍅::|\[timer_running::|\^noria99/);
});

test("presentation pomodoro binding attaches a toolbar timer drop to the target task", async () => {
  const binding = loadTaskTimelinePomodoroBinding();
  const node = createFakeElement("div", { cls: "timeline-event-label noria-task-timeline-editable" });
  const event = {
    id: "06_Diary/2026-06-01.md#12",
    title: "写 Noria 时间轴",
    noria: {
      path: "06_Diary/2026-06-01.md",
      line: 12,
      task: { text: "- [ ] 写 Noria 时间轴 #proj/noria" }
    }
  };
  let saved = null;
  let refreshReason = "";

  binding.decorateTaskPomodoroDropTargets([node], event, {
    pomodoroState: { version: 2, workLen: 25, breakLen: 5, tasks: {} },
    savePomodoroState: async (nextState) => {
      saved = nextState;
      return { ok: true, pomodoro: nextState };
    },
    requestRefresh: (reason) => {
      refreshReason = reason;
    }
  });

  const dragOver = {
    dataTransfer: { types: [binding.TIMER_ATTACH_MIME], dropEffect: "" },
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.stopped = true; }
  };
  node._listeners.dragover[0](dragOver);
  assert.equal(dragOver.defaultPrevented, true);
  assert.equal(node.classList.contains("noria-task-timeline-pomodoro-drop-hover"), true);

  const drop = {
    dataTransfer: {
      types: [binding.TIMER_ATTACH_MIME, "text/plain"],
      getData(type) {
        return type === "text/plain" ? binding.TIMER_ATTACH_TOKEN : "1";
      }
    },
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.stopped = true; }
  };
  await node._listeners.drop[0](drop);

  assert.equal(drop.defaultPrevented, true);
  assert.ok(saved.activeAttachTaskKey);
  assert.ok(saved.tasks[saved.activeAttachTaskKey]);
  assert.equal(saved.tasks[saved.activeAttachTaskKey].path, "06_Diary/2026-06-01.md");
  assert.equal(saved.tasks[saved.activeAttachTaskKey].lineHint, 12);
  assert.equal(node.classList.contains("noria-task-timeline-has-pomodoro"), true);
  assert.ok(node.querySelector(".noria-task-timeline-pomodoro-dock"));
  assert.equal(refreshReason, "task-timeline-pomodoro-attach");
});

test("presentation pomodoro binding controls start, pause, resume, stop, and detach state", () => {
  const binding = loadTaskTimelinePomodoroBinding();
  const meta = {
    taskKey: "zp_a",
    path: "06_Diary/2026-06-01.md",
    lineHint: 12,
    textFingerprint: "fp_a",
    title: "写 Noria 时间轴"
  };

  let state = binding.startOrTogglePomodoroState({ version: 2, workLen: 25, breakLen: 5, tasks: {} }, meta, "2026-06-01T10:00:00+08:00");
  assert.equal(state.active.taskKey, "zp_a");
  assert.equal(state.active.status, "running");
  assert.equal(state.tasks.zp_a.sessions.length, 1);

  state = binding.startOrTogglePomodoroState(state, meta, "2026-06-01T10:10:00+08:00");
  assert.equal(state.active.status, "paused");
  assert.equal(state.active.elapsedMs, 10 * 60 * 1000);

  state = binding.startOrTogglePomodoroState(state, meta, "2026-06-01T10:12:00+08:00");
  assert.equal(state.active.status, "running");
  assert.equal(state.active.startedAt, "2026-06-01T10:12:00+08:00");

  state = binding.stopPomodoroState(state, "2026-06-01T10:20:00+08:00");
  assert.equal(state.active, null);
  assert.equal(state.tasks.zp_a.sessions[0].end, "2026-06-01T10:20:00+08:00");
  assert.equal(state.tasks.zp_a.sessions[0].durationMin, 18);
  assert.equal(state.tasks.zp_a.sessions[0].completed, false);
  assert.equal(state.tasks.zp_a.sessions[0].outcome, "abandoned");

  const detached = binding.detachPomodoroState(state, ["zp_a"], "2026-06-01T10:21:00+08:00");
  assert.equal(detached.activeAttachTaskKey, "");
  assert.ok(detached.tasks.zp_a, "history should be preserved after detach");

  const emptyDetached = binding.detachPomodoroState({
    version: 2,
    activeAttachTaskKey: "zp_empty",
    tasks: {
      zp_empty: { path: "a.md", lineHint: 1, textFingerprint: "fp", titleSnapshot: "A", actual: 0, expected: 0, sessions: [] }
    }
  }, ["zp_empty"], "2026-06-01T10:21:00+08:00");
  assert.equal(emptyDetached.tasks.zp_empty, undefined);
});

test("presentation pomodoro dock buttons save start and detach actions from task events", async () => {
  const binding = loadTaskTimelinePomodoroBinding();
  const node = createFakeElement("div", { cls: "timeline-event-label noria-task-timeline-editable" });
  const event = {
    id: "06_Diary/2026-06-01.md#12",
    title: "写 Noria 时间轴",
    noria: {
      path: "06_Diary/2026-06-01.md",
      line: 12,
      task: { text: "- [ ] 写 Noria 时间轴 #proj/noria" }
    }
  };
  const meta = binding.taskPomodoroMeta(event);
  let current = binding.attachPomodoroState({ version: 2, workLen: 25, breakLen: 5, tasks: {} }, meta);
  const savedStates = [];
  const refreshReasons = [];

  binding.decorateTaskPomodoroDropTargets([node], event, {
    pomodoroState: current,
    now: () => "2026-06-01T10:00:00+08:00",
    savePomodoroState: async (nextState) => {
      current = nextState;
      savedStates.push(nextState);
      return { ok: true, pomodoro: nextState };
    },
    requestRefresh: (reason) => refreshReasons.push(reason)
  });

  const startBtn = node.querySelector(".noria-task-timeline-pomodoro-toggle");
  assert.ok(startBtn, "bound task should render a Pomodoro toggle control");
  await startBtn._listeners.click[0]({
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.stopped = true; }
  });

  assert.equal(savedStates.at(-1).active.status, "running");
  assert.equal(refreshReasons.at(-1), "task-timeline-pomodoro-toggle");

  const closeBtn = node.querySelector(".noria-task-timeline-pomodoro-detach");
  assert.ok(closeBtn, "bound task should render a detach control");
  await closeBtn._listeners.click[0]({
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.stopped = true; }
  });

  assert.equal(savedStates.at(-1).activeAttachTaskKey, "");
  assert.equal(refreshReasons.at(-1), "task-timeline-pomodoro-detach");
});

test("presentation pomodoro dock keeps controls collapsed until menu click and limits drag handle to the dot", () => {
  const binding = loadTaskTimelinePomodoroBinding();
  const node = createFakeElement("div", { cls: "timeline-event-label noria-task-timeline-editable" });
  const event = {
    id: "06_Diary/2026-06-01.md#12",
    title: "写 Noria 时间轴",
    noria: {
      path: "06_Diary/2026-06-01.md",
      line: 12,
      task: { text: "- [ ] 写 Noria 时间轴 #proj/noria" }
    }
  };
  const meta = binding.taskPomodoroMeta(event);
  const state = {
    version: 2,
    activeAttachTaskKey: "zp_known",
    tasks: {
      zp_known: {
        path: "06_Diary/2026-06-01.md",
        lineHint: 12,
        textFingerprint: meta.textFingerprint,
        titleSnapshot: "写 Noria 时间轴",
        sessions: []
      }
    }
  };

  binding.decorateTaskPomodoroDropTargets([node], event, { pomodoroState: state });

  const dock = node.querySelector(".noria-task-timeline-pomodoro-dock");
  const dot = node.querySelector(".noria-task-timeline-pomodoro-dot");
  const menu = node.querySelector(".noria-task-timeline-pomodoro-menu");
  const controls = node.querySelector(".noria-task-timeline-pomodoro-controls");

  assert.ok(dock);
  assert.ok(dot);
  assert.ok(menu);
  assert.ok(controls);
  assert.equal(dock.getAttribute("draggable"), "false");
  assert.equal(dot.getAttribute("draggable"), "true");
  assert.equal(menu.getAttribute("aria-expanded"), "false");
  assert.ok(!dock.classList.contains("is-expanded"));

  let pointerPrevented = false;
  let pointerStopped = false;
  dock.dispatchEvent({
    type: "pointerdown",
    preventDefault: () => { pointerPrevented = true; },
    stopPropagation: () => { pointerStopped = true; }
  });
  assert.equal(pointerStopped, true);
  assert.equal(pointerPrevented, false);

  let prevented = false;
  let stopped = false;
  menu.dispatchEvent({
    type: "click",
    preventDefault: () => { prevented = true; },
    stopPropagation: () => { stopped = true; }
  });

  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(menu.getAttribute("aria-expanded"), "true");
  assert.ok(dock.classList.contains("is-expanded"));

  menu.dispatchEvent({ type: "click", preventDefault() {}, stopPropagation() {} });
  assert.equal(menu.getAttribute("aria-expanded"), "false");
  assert.ok(!dock.classList.contains("is-expanded"));
});

test("presentation pomodoro summary uses injected countdown time and exposes dock metadata", () => {
  const binding = loadTaskTimelinePomodoroBinding();
  const node = createFakeElement("div", { cls: "timeline-event-label noria-task-timeline-editable" });
  const event = {
    id: "06_Diary/2026-06-01.md#12",
    title: "写 Noria 时间轴",
    noria: {
      path: "06_Diary/2026-06-01.md",
      line: 12,
      task: { text: "- [ ] 写 Noria 时间轴 #proj/noria" }
    }
  };
  const meta = binding.taskPomodoroMeta(event);
  const state = binding.startOrTogglePomodoroState(
    { version: 2, workLen: 25, breakLen: 5, tasks: {} },
    meta,
    "2026-06-01T10:00:00+08:00"
  );

  const bound = binding.decorateTaskPomodoroDropTargets([node], event, {
    pomodoroState: state,
    now: () => "2026-06-01T10:10:00+08:00"
  });
  const dock = node.querySelector(".noria-task-timeline-pomodoro-dock");
  const textEl = node.querySelector(".noria-task-timeline-pomodoro-text");

  assert.equal(bound.summary.primaryText, "WORK 15:00");
  assert.equal(bound.summary.remainingMs, 15 * 60 * 1000);
  assert.equal(textEl.textContent, "WORK 15:00");
  assert.equal(dock.getAttribute("data-noria-pomodoro-mode"), "WORK");
  assert.equal(dock.getAttribute("data-noria-pomodoro-running"), "1");
  assert.equal(dock.getAttribute("data-noria-pomodoro-remaining-ms"), String(15 * 60 * 1000));
});

test("presentation pomodoro state advances work into break and completes elapsed break", () => {
  const binding = loadTaskTimelinePomodoroBinding();
  const meta = {
    taskKey: "zp_a",
    path: "06_Diary/2026-06-01.md",
    lineHint: 12,
    textFingerprint: "fp_a",
    title: "写 Noria 时间轴"
  };
  let state = binding.startOrTogglePomodoroState(
    { version: 2, workLen: 25, breakLen: 5, tasks: {} },
    meta,
    "2026-06-01T10:00:00+08:00"
  );

  state = binding.advancePomodoroState(state, "2026-06-01T10:26:00+08:00");
  assert.equal(state.tasks.zp_a.actual, 1);
  assert.equal(state.tasks.zp_a.sessions[0].completed, true);
  assert.equal(Date.parse(state.tasks.zp_a.sessions[0].end), Date.parse("2026-06-01T10:25:00+08:00"));
  assert.equal(state.active.mode, "BREAK");
  assert.equal(Date.parse(state.active.startedAt), Date.parse("2026-06-01T10:25:00+08:00"));

  state = binding.advancePomodoroState(state, "2026-06-01T10:31:00+08:00");
  assert.equal(state.active, null);
  assert.equal(state.tasks.zp_a.sessions.length, 2);
  assert.equal(state.tasks.zp_a.sessions[1].mode, "BREAK");
  assert.equal(state.tasks.zp_a.sessions[1].completed, true);
  assert.equal(Date.parse(state.tasks.zp_a.sessions[1].end), Date.parse("2026-06-01T10:30:00+08:00"));
  assert.equal(state.tasks.zp_a.actual, 1);
});

test("presentation pomodoro provider exposes abandoned sessions distinctly", () => {
  const provider = loadTaskTimelinePomodoroProvider();
  const timeline = provider.pomodoroStateToTimelineEvents({
    version: 2,
    tasks: {
      zp_a: {
        path: "06_Diary/2026-06-01.md",
        lineHint: 12,
        titleSnapshot: "写 Noria 时间轴",
        sessions: [
          {
            mode: "WORK",
            start: "2026-06-01T10:00:00+08:00",
            end: "2026-06-01T10:18:00+08:00",
            durationMin: 18,
            completed: false,
            outcome: "abandoned"
          }
        ]
      }
    }
  });

  assert.equal(timeline.events.length, 1);
  assert.equal(timeline.events[0].status, "abandoned");
  assert.equal(timeline.events[0].payload.pomodoro.session.outcome, "abandoned");
  assert.match(timeline.events[0].presentation.classname, /noria-task-timeline-pomodoro--abandoned/);
  assert.match(timeline.events[0].presentation.hoverText, /Status: abandoned/);
});

test("presentation pomodoro dock exposes abandoned history as diagnostics", () => {
  const binding = loadTaskTimelinePomodoroBinding();
  const node = createFakeElement("div", { cls: "timeline-event-label noria-task-timeline-editable" });
  const event = {
    id: "06_Diary/2026-06-01.md#12",
    title: "写 Noria 时间轴",
    noria: {
      path: "06_Diary/2026-06-01.md",
      line: 12,
      task: { text: "- [ ] 写 Noria 时间轴 #proj/noria" }
    }
  };
  const meta = binding.taskPomodoroMeta(event);
  let state = binding.startOrTogglePomodoroState(
    { version: 2, workLen: 25, breakLen: 5, tasks: {} },
    meta,
    "2026-06-01T10:00:00+08:00"
  );
  state = binding.stopPomodoroState(state, "2026-06-01T10:18:00+08:00");

  const bound = binding.decorateTaskPomodoroDropTargets([node], event, { pomodoroState: state });
  const dock = node.querySelector(".noria-task-timeline-pomodoro-dock");

  assert.equal(bound.summary.lastOutcome, "abandoned");
  assert.equal(dock.getAttribute("data-noria-pomodoro-last-outcome"), "abandoned");
  assert.equal(dock.getAttribute("data-noria-pomodoro-last-mode"), "WORK");
  assert.equal(dock.getAttribute("data-noria-pomodoro-last-ended-at"), "2026-06-01T10:18:00+08:00");
});

test("presentation pomodoro dock tick refreshes countdown and saves only auto transitions", async () => {
  const binding = loadTaskTimelinePomodoroBinding();
  const root = createFakeElement("div", { cls: "noria-task-timeline-root" });
  const node = createFakeElement("div", { cls: "timeline-event-label noria-task-timeline-editable" });
  root.appendChild(node);
  const event = {
    id: "06_Diary/2026-06-01.md#12",
    title: "写 Noria 时间轴",
    noria: {
      path: "06_Diary/2026-06-01.md",
      line: 12,
      task: { text: "- [ ] 写 Noria 时间轴 #proj/noria" }
    }
  };
  const meta = binding.taskPomodoroMeta(event);
  let now = "2026-06-01T10:10:00+08:00";
  let current = binding.startOrTogglePomodoroState(
    { version: 2, workLen: 25, breakLen: 5, tasks: {} },
    meta,
    "2026-06-01T10:00:00+08:00"
  );
  const bindingContext = binding.__context;
  const previousRuntimeBridge = bindingContext.__noriaRuntimeBridge;
  const runtimeBridge = { pomodoro: null };
  bindingContext.__noriaRuntimeBridge = runtimeBridge;
  const savedStates = [];
  const refreshReasons = [];
  const options = {
    pomodoroState: current,
    now: () => now,
    readPomodoroState: () => current,
    savePomodoroState: async (nextState) => {
      current = nextState;
      savedStates.push(nextState);
      return { ok: true, pomodoro: nextState };
    },
    requestRefresh: (reason) => refreshReasons.push(reason)
  };
  binding.decorateTaskPomodoroDropTargets([node], event, options);

  try {
    await binding.tickPomodoroDocks(root, options);
    assert.equal(savedStates.length, 0);
    assert.equal(node.querySelector(".noria-task-timeline-pomodoro-text").textContent, "WORK 15:00");
    assert.equal(root.getAttribute("data-noria-last-pomodoro-tick-state"), "updated");
    assert.equal(root.getAttribute("data-noria-last-pomodoro-tick-updated"), "1");
    assert.equal(root.getAttribute("data-noria-last-pomodoro-tick-advanced"), "0");
    assert.equal(root.getAttribute("data-noria-last-pomodoro-tick-at"), "2026-06-01T10:10:00+08:00");
    assert.equal(root.getAttribute("data-noria-last-pomodoro-tick-task"), meta.taskKey);
    assert.equal(root.getAttribute("data-noria-last-pomodoro-tick-mode"), "WORK");
    assert.equal(root.getAttribute("data-noria-last-pomodoro-tick-running"), "1");
    assert.equal(root.getAttribute("data-noria-last-pomodoro-tick-remaining-ms"), String(15 * 60 * 1000));

    now = "2026-06-01T10:26:00+08:00";
    await binding.tickPomodoroDocks(root, options);

    const dock = node.querySelector(".noria-task-timeline-pomodoro-dock");
    assert.equal(savedStates.length, 1);
    assert.equal(current.active.mode, "BREAK");
    assert.equal(runtimeBridge.pomodoro.active.mode, "BREAK");
    assert.equal(refreshReasons.at(-1), "task-timeline-pomodoro-auto-transition");
    assert.equal(node.querySelector(".noria-task-timeline-pomodoro-text").textContent, "BREAK 04:00");
    assert.equal(dock.getAttribute("data-noria-pomodoro-mode"), "BREAK");
    assert.equal(dock.getAttribute("data-noria-pomodoro-running"), "1");
    assert.equal(dock.classList.contains("is-break"), true);
    assert.equal(dock.getAttribute("data-noria-pomodoro-remaining-ms"), String(4 * 60 * 1000));
    assert.equal(root.getAttribute("data-noria-last-pomodoro-tick-state"), "updated");
    assert.equal(root.getAttribute("data-noria-last-pomodoro-tick-advanced"), "1");
    assert.equal(root.getAttribute("data-noria-last-pomodoro-tick-at"), "2026-06-01T10:26:00+08:00");
    assert.equal(root.getAttribute("data-noria-last-pomodoro-tick-mode"), "BREAK");
    assert.equal(root.getAttribute("data-noria-last-pomodoro-tick-running"), "1");
    assert.equal(root.getAttribute("data-noria-last-pomodoro-tick-remaining-ms"), String(4 * 60 * 1000));
  } finally {
    if (previousRuntimeBridge === undefined) delete bindingContext.__noriaRuntimeBridge;
    else bindingContext.__noriaRuntimeBridge = previousRuntimeBridge;
  }
});

test("presentation trace provider maps note and git traces to unified events", () => {
  const provider = loadTaskTimelineTraceProvider();
  const timeline = provider.timelineTracesToEvents({
    notes: [
      {
        path: "06_Diary/2026-06-01.md",
        title: "2026-06-01",
        ctime: "2026-06-01T08:10:00+08:00",
        mtime: "2026-06-01T09:20:00+08:00",
        tags: ["#daily"]
      }
    ],
    git: [
      {
        hash: "abc1234",
        subject: "Refine Noria timeline",
        date: "2026-06-01T10:30:00+08:00",
        repo: "F:/Library/.obsidian/plugins/noria"
      }
    ]
  });

  assert.equal(timeline.events.length, 3);
  assert.deepEqual(Array.from(timeline.events.map((event) => event.layer)), ["note", "note", "git"]);
  assert.equal(timeline.events[0].kind, "created");
  assert.equal(timeline.events[1].kind, "modified");
  assert.equal(timeline.events[1].source.path, "06_Diary/2026-06-01.md");
  assert.equal(timeline.events[2].title, "Refine Noria timeline");
  assert.equal(timeline.events[2].source.hash, "abc1234");
  assert.match(timeline.events[2].presentation.classname, /noria-task-timeline-git--commit/);
});

test("presentation trace provider maps Noria cache traces to source-aware events", () => {
  const provider = loadTaskTimelineTraceProvider();
  const timeline = provider.timelineTracesToEvents({
    cache: {
      events: [
        {
          kind: "review-evidence",
          title: "Review evidence: daily 2026-06-12",
          time: "2026-06-12T21:30:00+08:00",
          path: ".obsidian/plugins/noria/cache/stats/review/2026/2026-06-12.json",
          mode: "daily",
          period: "2026-06-12",
          artifactPath: "06_Diary/2026/2026-06-12-review.md",
          evidenceHash: "hash-a"
        }
      ]
    }
  });

  assert.equal(timeline.events.length, 1);
  assert.equal(timeline.events[0].layer, "noria");
  assert.equal(timeline.events[0].provider, "traces");
  assert.equal(timeline.events[0].kind, "review-evidence");
  assert.equal(timeline.events[0].start, "2026-06-12T21:30:00+08:00");
  assert.equal(timeline.events[0].source.type, "noria-cache");
  assert.equal(timeline.events[0].source.path, ".obsidian/plugins/noria/cache/stats/review/2026/2026-06-12.json");
  assert.equal(timeline.events[0].payload.noria.evidenceHash, "hash-a");
  assert.match(timeline.events[0].presentation.classname, /noria-task-timeline-noria-cache/);
  assert.match(timeline.events[0].presentation.hoverText, /06_Diary\/2026\/2026-06-12-review\.md/);
});

test("presentation trace provider aggregates short note and git bursts without mixing trace kinds", () => {
  const provider = loadTaskTimelineTraceProvider();
  const timeline = provider.timelineTracesToEvents({
    notes: [
      { path: "06_Diary/2026-06-01.md", title: "2026-06-01", mtime: "2026-06-01T09:00:00+08:00" },
      { path: "06_Diary/2026-06-02.md", title: "2026-06-02", mtime: "2026-06-01T09:18:00+08:00" },
      { path: "06_Diary/2026-06-03.md", title: "2026-06-03", mtime: "2026-06-01T09:37:00+08:00" },
      { path: "06_Diary/2026-06-04.md", title: "2026-06-04", ctime: "2026-06-01T09:42:00+08:00" }
    ],
    git: [
      { hash: "aaa1111", subject: "update daily brief", date: "2026-06-01T10:00:00+08:00" },
      { hash: "bbb2222", subject: "update project monitor", date: "2026-06-01T10:26:00+08:00" },
      { hash: "ccc3333", subject: "late standalone commit", date: "2026-06-01T12:00:00+08:00" }
    ]
  });

  assert.deepEqual(Array.from(timeline.events.map((event) => [event.layer, event.kind, event.title])), [
    ["note", "modified-burst", "3 note modifications"],
    ["note", "created", "Created: 2026-06-04"],
    ["git", "commit-burst", "2 Git commits"],
    ["git", "commit", "late standalone commit"]
  ]);
  const noteBurst = timeline.events[0];
  assert.equal(noteBurst.isInstant, false);
  assert.equal(noteBurst.start, "2026-06-01T09:00:00+08:00");
  assert.equal(noteBurst.end, "2026-06-01T09:37:00+08:00");
  assert.equal(noteBurst.payload.burst.count, 3);
  assert.deepEqual(plain(noteBurst.payload.burst.paths), [
    "06_Diary/2026-06-01.md",
    "06_Diary/2026-06-02.md",
    "06_Diary/2026-06-03.md"
  ]);
  assert.match(noteBurst.presentation.classname, /noria-task-timeline-trace-burst/);
  assert.match(noteBurst.presentation.hoverText, /2026-06-01/);

  const gitBurst = timeline.events[2];
  assert.equal(gitBurst.payload.burst.count, 2);
  assert.deepEqual(plain(gitBurst.payload.burst.hashes), ["aaa1111", "bbb2222"]);
  assert.match(gitBurst.presentation.classname, /noria-task-timeline-git--commit-burst/);
});

test("task timeline task adapter maps start and due tasks to duration events", () => {
  const adapter = loadTaskTimelineTaskAdapter();
  const json = adapter.tasksToTimelineJson([
    {
      text: "- [ ] 睡眠 #tl/sleep [start:: 2026-05-01 23:30] [due:: 2026-05-02 07:00]",
      path: "06_Diary/2026-05-01.md",
      line: 4
    }
  ]);

  assert.equal(json.dateTimeFormat, "iso8601");
  assert.equal(json.events.length, 1);
  assert.equal(json.unplaced.length, 0);
  assert.match(json.events[0].start, /^2026-05-01T23:30:00(?:Z|[+-]\d{2}:\d{2})$/);
  assert.match(json.events[0].end, /^2026-05-02T07:00:00(?:Z|[+-]\d{2}:\d{2})$/);
  assert.equal(json.events[0].durationEvent, true);
  assert.equal(json.events[0].noria.kind, "duration");
  assert.equal(json.events[0].noria.primaryYmd, "2026-05-01");
  assert.match(json.events[0].classname, /noria-task-timeline-task--duration/);
});

test("task timeline task adapter exposes a first-class taskKey through timeline and timeline payloads", () => {
  const adapter = loadTaskTimelineTaskAdapter();
  const task = {
    text: "- [ ] 统一任务视觉单元 [due:: 2026-07-10 09:00]",
    path: "01_Projects/Noria.md",
    line: 12
  };
  const timeline = adapter.tasksToTimelineEvents([task]);
  const json = adapter.tasksToTimelineJson([task]);
  const taskKey = "01_Projects/Noria.md#12";

  assert.equal(timeline.events[0].id, taskKey);
  assert.equal(timeline.events[0].payload.taskKey, taskKey);
  assert.equal(timeline.events[0].payload.noria.id, taskKey);
  assert.equal(timeline.events[0].payload.noria.taskKey, taskKey);
  assert.equal(json.events[0].id, taskKey);
  assert.equal(json.events[0].noria.taskKey, taskKey);
});

test("task timeline task adapter keeps fallback taskKey stable when task input order changes", () => {
  const adapter = loadTaskTimelineTaskAdapter();
  const alpha = { text: "- [ ] Alpha fallback task [due:: 2026-07-10 09:00]" };
  const beta = { text: "- [ ] Beta fallback task [due:: 2026-07-11 10:00]" };

  const first = adapter.tasksToTimelineEvents([alpha, beta]);
  const second = adapter.tasksToTimelineEvents([beta, alpha]);
  const keyForTitle = (timeline, title) => timeline.events.find((event) => event.title === title)?.payload.taskKey;

  assert.equal(keyForTitle(first, "Alpha fallback task"), keyForTitle(second, "Alpha fallback task"));
  assert.equal(keyForTitle(first, "Beta fallback task"), keyForTitle(second, "Beta fallback task"));
  assert.doesNotMatch(keyForTitle(first, "Alpha fallback task"), /noria-task-\d+-/);
});

test("task timeline task adapter keeps due-only tasks as deadline instants", () => {
  const adapter = loadTaskTimelineTaskAdapter();
  const json = adapter.tasksToTimelineJson([
    { text: "- [ ] Submit report [due:: 2026-05-10 10:00]", status: " " }
  ]);

  assert.equal(json.events.length, 1);
  assert.match(json.events[0].start, /^2026-05-10T10:00:00(?:Z|[+-]\d{2}:\d{2})$/);
  assert.equal(json.events[0].end, undefined);
  assert.equal(json.events[0].durationEvent, false);
  assert.equal(json.events[0].noria.kind, "due");
  assert.match(json.events[0].classname, /noria-task-timeline-task--due/);
  assert.match(json.events[0].classname, /noria-task-timeline-task--instant/);
});

test("task timeline task adapter places no-date tasks by modified time when available", () => {
  const adapter = loadTaskTimelineTaskAdapter();
  const json = adapter.tasksToTimelineJson([
    {
      text: "- [ ] Inbox thought #capture",
      source: { path: "00_Inbox/Idea.md", mtime: "2026-05-03T14:25:00" },
      line: 0
    }
  ]);

  assert.equal(json.events.length, 1);
  assert.equal(json.unplaced.length, 0);
  assert.match(json.events[0].start, /^2026-05-03T14:25:00(?:Z|[+-]\d{2}:\d{2})$/);
  assert.equal(json.events[0].noria.kind, "fallback");
  assert.equal(json.events[0].noria.fallbackDateSource, "modified");
  assert.match(json.events[0].classname, /noria-task-timeline-task--no-explicit-date/);
});

test("task timeline task adapter does not invent dates for no-date tasks without modified time", () => {
  const adapter = loadTaskTimelineTaskAdapter();
  const json = adapter.tasksToTimelineJson([{ text: "- [ ] Floating task" }]);

  assert.equal(json.events.length, 0);
  assert.equal(json.unplaced.length, 1);
  assert.equal(json.unplaced[0].reason, "missing-date-and-modified-time");
});

test("task timeline task adapter emits lightweight Noria bubble actions with escaped metadata", () => {
  const adapter = loadTaskTimelineTaskAdapter();
  const json = adapter.tasksToTimelineJson([
    {
      text: "- [ ] Review <danger> [due:: 2026-05-10 10:00] #project/x",
      path: "01_Projects/<Report>.md",
      line: 8
    }
  ]);
  const desc = json.events[0].description;

  assert.match(desc, /noria-task-timeline-bubble/);
  assert.match(desc, /data-noria-task-timeline-action="open-note"/);
  assert.match(desc, /data-noria-task-timeline-action="edit-time"/);
  assert.match(desc, /data-noria-task-timeline-action="toggle-done"/);
  assert.match(desc, /data-noria-action-source="task-timeline-bubble"/);
  assert.match(desc, /data-noria-action-kind="open-task-source"/);
  assert.match(desc, /data-noria-action-kind="edit-task-time"/);
  assert.match(desc, /data-noria-action-kind="toggle-task-done"/);
  assert.match(desc, /data-noria-action-target-path="01_Projects\/&#60;Report&#62;\.md"/);
  assert.match(desc, /data-noria-action-target-line="8"/);
  assert.match(desc, /01_Projects\/&#60;Report&#62;\.md/);
  assert.doesNotMatch(desc, /01_Projects\/<Report>\.md/);
});

test("task timeline task adapter exposes structured multiline hover text for dense task labels", () => {
  const adapter = loadTaskTimelineTaskAdapter();
  const json = adapter.tasksToTimelineJson([
    {
      text: "- [ ] Review launch checklist [due:: 2026-05-10 10:00] #project/x",
      path: "01_Projects/Launch.md",
      line: 8,
      status: "done"
    },
    {
      text: "- [ ] Inbox thought #capture",
      source: { path: "00_Inbox/Idea.md", mtime: "2026-05-03T14:25:00" },
      line: 0
    }
  ]);
  const launchEvent = json.events.find((event) => event.title === "Review launch checklist");
  const fallbackEvent = json.events.find((event) => event.noria && event.noria.kind === "fallback");

  assert.ok(launchEvent);
  assert.ok(fallbackEvent);
  assert.match(launchEvent.hoverText, /^Title: Review launch checklist/m);
  assert.match(launchEvent.hoverText, /^Time: Due 2026-05-10 10:00/m);
  assert.match(launchEvent.hoverText, /^Status: done/m);
  assert.match(launchEvent.hoverText, /^Tags: #project\/x/m);
  assert.match(launchEvent.hoverText, /^Source: 01_Projects\/Launch\.md:9/m);
  assert.doesNotMatch(launchEvent.hoverText, / · /);
  assert.match(fallbackEvent.hoverText, /^Time: Modified 2026-05-03 14:25/m);
  assert.match(fallbackEvent.hoverText, /^Placed by: modified/m);
});

test("task timeline task adapter strips Tasks control emojis from task titles", () => {
  const adapter = loadTaskTimelineTaskAdapter();
  const title = adapter.cleanTaskTitle(
    "- [ ] 🔺 Ship plan ⏫ 📅 2026-06-01 ⏳ 2026-06-02 🛫 2026-05-31 ✅ 2026-06-03 🔁 every week 🆔 abc123 ⛔ blocked #project/x [due:: 2026-06-01]"
  );

  assert.equal(title, "Ship plan");
});

test("task timeline task adapter strips replacement glyphs left by unsupported task icons", () => {
  const adapter = loadTaskTimelineTaskAdapter();

  assert.equal(adapter.cleanTaskTitle("- [ ] 定义主轴兼容清单（图、表、章节映射） �"), "定义主轴兼容清单（图、表、章节映射）");
  assert.equal(adapter.cleanTaskTitle("- [ ] 写出论文核心问题一句话版本 � #project/weno"), "写出论文核心问题一句话版本");
  assert.equal(adapter.cleanTaskTitle("- [ ] 写出论文核心问题一句话版本 ? #project/weno"), "写出论文核心问题一句话版本");
  assert.equal(adapter.cleanTaskTitle("- [ ] 完成论文修改 ?#project/weno"), "完成论文修改");
  assert.equal(adapter.cleanTaskTitle("- [ ] 完成论文修改 ?2026-06-01"), "完成论文修改");
  assert.equal(adapter.cleanTaskTitle("- [ ] 完成论文修改 ? [start:: 2026-06-01 09:00]"), "完成论文修改");
  assert.equal(adapter.cleanTaskTitle("- [ ] 定义主轴兼容清单 ❓ [due:: 2026-06-01]"), "定义主轴兼容清单");
  assert.equal(adapter.cleanTaskTitle("- [ ] 为什么要保留这个问题? [due:: 2026-06-01]"), "为什么要保留这个问题?");
});

test("task timeline task adapter keeps #tl placement strict to start and due by default", () => {
  const adapter = loadTaskTimelineTaskAdapter();

  const timeline = adapter.tasksToTimelineEvents([
    {
      text: "- [x] 完成旧时间块 #tl/focus [scheduled:: 2026-06-01] [done:: 2026-06-02]",
      source: { path: "06_Diary/2026-06-01.md", mtime: "2026-06-03T12:00:00" },
      line: 2,
      status: "done"
    },
    {
      text: "- [x] 明确时间块 #tl/focus [start:: 2026-06-01 09:00] [due:: 2026-06-01 10:00] [done:: 2026-06-02]",
      source: { path: "06_Diary/2026-06-01.md", mtime: "2026-06-03T12:00:00" },
      line: 3,
      status: "done"
    }
  ]);

  assert.equal(timeline.events.length, 1);
  assert.equal(timeline.events[0].title, "明确时间块");
  assert.equal(timeline.events[0].kind, "duration");
  assert.equal(timeline.events[0].status, "done");
  assert.equal(timeline.unplaced.length, 1);
  assert.equal(timeline.unplaced[0].reason, "timeline-tag-missing-start-or-due");

  const configured = adapter.tasksToTimelineEvents([
    {
      text: "- [x] 完成旧时间块 #tl/focus [scheduled:: 2026-06-01]",
      source: { path: "06_Diary/2026-06-01.md", mtime: "2026-06-03T12:00:00" },
      line: 4,
      status: "done"
    }
  ], { timelineTagPlacement: "any-date" });
  assert.equal(configured.events.length, 1);
  assert.equal(configured.events[0].kind, "scheduled");
});

test("task timeline task adapter renders Data API text objects as task titles", () => {
  const adapter = loadTaskTimelineTaskAdapter();
  const json = adapter.tasksToTimelineJson([
    {
      title: "Submit report",
      text: {
        clean: "Submit report",
        raw: "- [ ] Submit report [due:: 2026-05-03 10:00]"
      },
      source: {
        path: "06_Diary/2026-05-03.md",
        line: 12,
        rawLine: "- [ ] Submit report [due:: 2026-05-03 10:00]"
      },
      identity: { sourcePath: "06_Diary/2026-05-03.md", line: 12 },
      dates: { due: "2026-05-03 10:00" },
      checkbox: { state: "open" },
      status: "open"
    }
  ]);

  assert.equal(json.events.length, 1);
  assert.equal(json.events[0].title, "Submit report");
  assert.doesNotMatch(json.events[0].title, /\[object Object\]/);
  assert.equal(json.events[0].noria.path, "06_Diary/2026-05-03.md");
  assert.equal(json.events[0].noria.line, 12);
  assert.match(json.events[0].description, /06_Diary\/2026-05-03\.md:13/);
});

test("presentation task edit updates duration start and due from drag result", () => {
  const edit = loadTaskTimelineTaskEdit();
  const line = "- [ ] 睡眠 #tl/sleep [start:: 2026-05-01 23:30] [due:: 2026-05-02 07:00]";

  const moved = edit.buildDraggedTaskLine(line, {
    noria: { kind: "duration" },
    start: "2026-05-01T23:30:00",
    end: "2026-05-02T07:00:00"
  }, {
    role: "move",
    start: new Date("2026-05-02T00:00:00"),
    end: new Date("2026-05-02T07:30:00")
  });

  assert.match(moved, /\[start:: 2026-05-02 00:00\]/);
  assert.match(moved, /\[due:: 2026-05-02 07:30\]/);
  assert.equal((moved.match(/\[start::/g) || []).length, 1);
  assert.equal((moved.match(/\[due::/g) || []).length, 1);
});

test("presentation task edit moves due-only instants without adding start", () => {
  const edit = loadTaskTimelineTaskEdit();
  const line = "- [ ] Submit report [due:: 2026-05-03 10:00]";

  const moved = edit.buildDraggedTaskLine(line, {
    noria: { kind: "due" },
    start: "2026-05-03T10:00:00",
    durationEvent: false
  }, {
    role: "instant",
    start: new Date("2026-05-04T11:15:00")
  });

  assert.match(moved, /\[due:: 2026-05-04 11:15\]/);
  assert.doesNotMatch(moved, /\[start::/);
});

test("presentation task edit turns fallback instants into explicit start times", () => {
  const edit = loadTaskTimelineTaskEdit();
  const line = "- [ ] Inbox thought #capture";

  const moved = edit.buildDraggedTaskLine(line, {
    noria: { kind: "fallback", fallbackDateSource: "modified" },
    start: "2026-05-03T14:25:00",
    durationEvent: false
  }, {
    role: "instant",
    start: new Date("2026-05-04T09:30:00")
  });

  assert.match(moved, /\[start:: 2026-05-04 09:30\]/);
  assert.doesNotMatch(moved, /\[due::/);
});

test("formal native task timeline cleanup is pane-owned and released before remounting", () => {
  const view = fs.readFileSync(pluginPath("views/task-timeline/view.js"), "utf8");
  const main = fs.readFileSync(path.join(pluginRoot, "src/main.js"), "utf8");

  assert.match(view, /timelineEl\.__noriaTaskTimelineCleanup\s*=\s*cleanup/);
  assert.match(view, /if \(disposed\) return;[\s\S]{0,100}backendInstance\.dispose\(\)/);
  assert.match(view, /onTimelineFocusTodayReady\(null\)/);
  assert.match(main, /const selector = "\.noria-task-timeline-surface"/);
  assert.match(main, /const cleanup = timelineEl && timelineEl\.__noriaTaskTimelineCleanup/);
});

test("noria runtime bridge persists timeline annotations as plugin-owned data", () => {
  const main = fs.readFileSync(path.join(pluginRoot, "src/main.js"), "utf8");
  const runtimeCore = fs.readFileSync(pluginPath("views/tasks-calendar/runtime-core.js"), "utf8");

  assert.match(main, /timelineAnnotations:\s*\[/);
  assert.match(main, /normalizeTimelineAnnotations/);
  assert.match(main, /getTimelineAnnotations/);
  assert.match(main, /upsertTimelineAnnotation/);
  assert.match(main, /timeline:\s*\{[\s\S]*saveAnnotation/);
  assert.match(main, /data:\s*\{[\s\S]*getTimelineAnnotations/);
  assert.match(runtimeCore, /seedDurationMin/);
  assert.match(runtimeCore, /opts\.durationMin/);
});

test("formal tasksTimeline entry mounts the Noria-owned native task timeline", () => {
  const main = fs.readFileSync(path.join(pluginRoot, "src/main.js"), "utf8");
  const buildScript = fs.readFileSync(path.join(pluginRoot, "scripts/build-embedded-runtime.mjs"), "utf8");
  const formalView = fs.readFileSync(pluginPath("views/task-timeline/view.js"), "utf8");

  assert.match(main, /tasksTimeline:\s*"\.obsidian\/plugins\/noria\/views\/task-timeline\/view\.js"/);
  assert.doesNotMatch(main, /legacyTasksTimeline:\s*"\.obsidian\/plugins\/noria\/views\/tasks-timeline\/view\.js"/);
  assert.match(buildScript, /retiredEmbeddedKeys[\s\S]*views\/tasks-timeline\/view\.js/);
  assert.match(formalView, /mountTimelineBackend\("native"/);
  [
    ["presentation", "EnsureVendorRuntime"].join(""),
    ["TimelineRef", "create"].join("."),
    ["Si", "mile", "Ajax"].join(""),
    ["Default", "EventSource"].join(""),
    ["createHotZone", "BandInfo"].join("")
  ].forEach((token) => assert.equal(formalView.includes(token), false));
  assert.match(main, /sourceMode:\s*"tasks"/);
  assert.match(main, /noriaSurface:\s*"tasksTimeline"/);
  assert.match(main, /noriaHideTimelineStatus:\s*true/);
  assert.match(main, /viewKey === "tasksTimeline"[\s\S]{0,260}merged\.sourceMode = merged\.sourceMode \|\| "tasks"/);
});

test("formal task timeline startup health recognizes a ready backend-neutral task timeline", () => {
  const main = fs.readFileSync(path.join(pluginRoot, "src/main.js"), "utf8");
  const healthStart = main.indexOf("function noriaTimelineViewLooksHealthy(view)");
  const healthEnd = main.indexOf("class NoriaHomeView", healthStart);
  assert.ok(healthStart > 0 && healthEnd > healthStart, "timeline health helper should be found");
  const body = main.slice(healthStart, healthEnd);

  assert.match(body, /noria-task-timeline-root/);
  assert.match(body, /data-noria-timeline-render-state/);
  assert.match(body, /noria-task-timeline-surface/);
  assert.match(body, /data-noria-timeline-events/);
  assert.match(body, /data-noria-timeline-backend/);
  assert.match(body, /ready/);
  assert.match(body, /noriaTimelineViewIsVisibleEnough\(view\)/);
});

test("formal task timeline startup health rejects failed native renders", () => {
  const main = fs.readFileSync(path.join(pluginRoot, "src/main.js"), "utf8");
  const healthStart = main.indexOf("function noriaTimelineViewLooksHealthy(view)");
  const healthEnd = main.indexOf("class NoriaHomeView", healthStart);
  const body = main.slice(healthStart, healthEnd);

  assert.match(body, /if \(state === "failed"\) return false;/);
  assert.doesNotMatch(body, /if \(state === "failed"\) return true;/);
});

test("formal task timeline startup recovery waits for visible leaves and retries on workspace activation", () => {
  const main = fs.readFileSync(path.join(pluginRoot, "src/main.js"), "utf8");
  const recoveryStart = main.indexOf("async runTimelineLeavesStartupRecovery()");
  const recoveryEnd = main.indexOf("async runTimelineLeavesColdBootRefresh()", recoveryStart);
  assert.ok(recoveryStart > 0 && recoveryEnd > recoveryStart, "timeline startup recovery helper should be found");
  const recovery = main.slice(recoveryStart, recoveryEnd);
  const layoutStart = main.indexOf("this.app.workspace.onLayoutReady(() => {");
  const layoutEnd = main.indexOf("  onunload()", layoutStart);
  assert.ok(layoutStart > 0 && layoutEnd > layoutStart, "layout ready startup block should be found");
  const layout = main.slice(layoutStart, layoutEnd);

  assert.match(recovery, /noriaTimelineViewIsVisibleEnough\(view\)/);
  assert.match(recovery, /waiting-for-visible/);
  assert.doesNotMatch(recovery, /await view\.reload\(\)[\s\S]{0,120}waiting-for-visible/);
  assert.match(layout, /active-leaf-change/);
  assert.match(layout, /layout-change/);
  assert.match(layout, /scheduleTimelineRecoveryTick/);
});

test("formal task timeline waits for a stable visible host before mounting the native runtime", () => {
  const main = fs.readFileSync(path.join(pluginRoot, "src/main.js"), "utf8");
  const classStart = main.indexOf("class NoriaTaskTimelineView");
  const classEnd = main.indexOf("function noriaElementIsVisibleEnough", classStart);
  assert.ok(classStart > 0 && classEnd > classStart, "task timeline class should be found");
  const body = main.slice(classStart, classEnd);
  const mountStart = body.indexOf("async mountTimelineRuntime(");
  const mountEnd = body.indexOf("async reload()", mountStart);
  assert.ok(mountStart > 0 && mountEnd > mountStart, "mountTimelineRuntime body should be found");
  const mountBody = body.slice(mountStart, mountEnd);

  assert.match(body, /async waitForTimelineHostReady\(/);
  assert.match(body, /renderTimelineRuntimeDeferredState/);
  assert.match(mountBody, /await this\.waitForTimelineHostReady\(/);
  assert.match(
    mountBody,
    /await this\.waitForTimelineHostReady\(\{[\s\S]*?generation[\s\S]*?\}\)[\s\S]*?await this\.runTimelineRuntimeBucket\(\{[\s\S]*?generation[\s\S]*?\}\)/,
    "native runtime should only mount after the host is visible enough"
  );
});

test("formal task timeline measures host wait and waits for first paint before completing mount", () => {
  const main = fs.readFileSync(path.join(pluginRoot, "src/main.js"), "utf8");
  const classStart = main.indexOf("class NoriaTaskTimelineView");
  const classEnd = main.indexOf("function noriaElementIsVisibleEnough", classStart);
  assert.ok(classStart > 0 && classEnd > classStart, "task timeline class should be found");
  const body = main.slice(classStart, classEnd);
  const mountStart = body.indexOf("async mountTimelineRuntime(");
  const mountEnd = body.indexOf("async reload()", mountStart);
  const mountBody = body.slice(mountStart, mountEnd);

  assert.match(body, /async waitForTimelineRenderReady\(/);
  assert.match(mountBody, /await this\.runTimelineRuntimeBucket\([\s\S]*?await this\.waitForTimelineRenderReady\(/);
  assert.match(mountBody, /data-noria-timeline-host-wait-ms/);
  assert.match(mountBody, /data-noria-timeline-render-wait-ms/);
  assert.match(mountBody, /data-noria-timeline-item-mount-ms/);
  assert.match(mountBody, /this\.setTimelineRuntimeMountState\("waiting-for-render"\)/);
});

test("formal task timeline health rejects ready native roots without paint evidence", () => {
  const main = fs.readFileSync(path.join(pluginRoot, "src/main.js"), "utf8");
  const healthStart = main.indexOf("function noriaTimelineViewLooksHealthy(view)");
  const healthEnd = main.indexOf("class NoriaHomeView", healthStart);
  assert.ok(healthStart > 0 && healthEnd > healthStart, "timeline health helper should be found");
  const body = main.slice(healthStart, healthEnd);

  assert.match(body, /data-noria-timeline-events/);
  assert.match(body, /noria-task-timeline-native-title/);
  assert.match(body, /data-noria-task-unit-key/);
  assert.match(body, /data-noria-overview-event-id/);
  assert.match(body, /noria-task-timeline-state/);
});

test("formal task timeline cold boot refresh retries until a visible restored leaf is processed", () => {
  const main = fs.readFileSync(path.join(pluginRoot, "src/main.js"), "utf8");
  const coldStart = main.indexOf("async runTimelineLeavesColdBootRefresh()");
  const coldEnd = main.indexOf("async openTasksTimelineLeaf()", coldStart);
  assert.ok(coldStart > 0 && coldEnd > coldStart, "cold boot refresh helper should be found");
  const body = main.slice(coldStart, coldEnd);
  const layoutStart = main.indexOf("this.app.workspace.onLayoutReady(() => {");
  const layoutEnd = main.indexOf("  onunload()", layoutStart);
  assert.ok(layoutStart > 0 && layoutEnd > layoutStart, "layout ready startup block should be found");
  const layout = main.slice(layoutStart, layoutEnd);

  assert.match(body, /visibleProcessedCount/);
  assert.doesNotMatch(body, /this\._timelineColdBootRefreshDone\s*=\s*true;\s*const seen/);
  assert.match(body, /if\s*\(visibleProcessedCount\s*>\s*0\)\s*this\._timelineColdBootRefreshDone\s*=\s*true/);
  assert.match(layout, /scheduleTimelineColdBootRefresh/);
  assert.match(layout, /active-leaf-change[\s\S]{0,220}scheduleTimelineColdBootRefresh/);
  assert.match(layout, /layout-change[\s\S]{0,220}scheduleTimelineColdBootRefresh/);
});

test("formal task timeline recovery does not interrupt healthy or pending native mounts", () => {
  const main = fs.readFileSync(path.join(pluginRoot, "src/main.js"), "utf8");
  const pendingStart = main.indexOf("function noriaTimelineViewIsPending(view)");
  const pendingEnd = main.indexOf("function noriaTimelineViewLooksHealthy(view)", pendingStart);
  assert.ok(pendingStart > 0 && pendingEnd > pendingStart, "pending helper should be defined before health helper");
  const pending = main.slice(pendingStart, pendingEnd);
  assert.match(pending, /_timelineRuntimeMountInFlight/);
  assert.match(pending, /data-noria-timeline-render-state/);
  assert.match(pending, /loading/);
  assert.match(pending, /noria-timeline-deferred-state/);

  const coldStart = main.indexOf("async runTimelineLeavesColdBootRefresh()");
  const coldEnd = main.indexOf("async openTasksTimelineLeaf()", coldStart);
  assert.ok(coldStart > 0 && coldEnd > coldStart, "cold boot refresh helper should be found");
  const cold = main.slice(coldStart, coldEnd);
  assert.match(cold, /noriaTimelineViewLooksHealthy\(view\)[\s\S]{0,180}cold-boot-healthy/);
  assert.match(cold, /noriaTimelineViewIsPending\(view\)[\s\S]{0,180}cold-boot-pending/);
  assert.match(cold, /visibleProcessedCount/);
  assert.match(cold, /if\s*\(visibleProcessedCount\s*>\s*0\)\s*this\._timelineColdBootRefreshDone\s*=\s*true/);
  assert.doesNotMatch(cold, /visibleReloadCount\s*\+=\s*1;[\s\S]{0,80}await view\.reload\(\)/);

  const openStart = main.indexOf("async openTasksTimelineLeaf()");
  const openEnd = main.indexOf("async openTaskBoardDay(", openStart);
  assert.ok(openStart > 0 && openEnd > openStart, "task timeline open helper should be found");
  const open = main.slice(openStart, openEnd);
  assert.doesNotMatch(open, /shouldForceReloadOnFirstOpenAfterBoot/);
  assert.match(open, /!noriaTimelineViewIsPending\(view\)/);
});

test("formal task timeline keeps distinct recovery boundaries without retired boot state", () => {
  const main = fs.readFileSync(path.join(pluginRoot, "src/main.js"), "utf8");
  const viewStart = main.indexOf("class NoriaTaskTimelineView");
  const viewEnd = main.indexOf("class NoriaHomeView", viewStart);
  const view = main.slice(viewStart, viewEnd);
  const layoutStart = main.indexOf("this.app.workspace.onLayoutReady(() => {");
  const layoutEnd = main.indexOf("  isNoriaRecoveryOwnerActive(", layoutStart);
  const layout = main.slice(layoutStart, layoutEnd);

  assert.ok(viewStart > 0 && viewEnd > viewStart);
  assert.ok(layoutStart > 0 && layoutEnd > layoutStart);
  assert.doesNotMatch(main, /_timelineBootReloadDone/);
  assert.match(view, /waitForTimelineHostReady[\s\S]*?timeoutMs[\s\S]*?2400/);
  assert.match(view, /waitForTimelineRenderReady[\s\S]*?timeoutMs[\s\S]*?2400/);
  assert.match(main, /pendingIsFresh\s*=\s*!started\s*\|\|\s*ageMs\s*<\s*30000/);
  assert.match(layout, /scheduleTimelineRecoveryTick\(400\)[\s\S]*scheduleTimelineColdBootRefresh\(1100\)[\s\S]*scheduleTimelineRecoveryTick\(2400\)[\s\S]*scheduleTimelineColdBootRefresh\(2600\)/);
});

test("open native timeline refreshes changed tasks and releases its event subscription on close", async () => {
  const main = fs.readFileSync(path.join(pluginRoot, "src/main.js"), "utf8");
  const start = main.indexOf("class NoriaTaskTimelineView");
  const end = main.indexOf("function noriaElementIsVisibleEnough", start);
  const listeners = new Set();
  const app = { workspace: {
    on(name, callback) {
      const ref = { name, callback };
      listeners.add(ref);
      return ref;
    },
    offref(ref) { listeners.delete(ref); }
  } };
  const host = () => ({ isConnected: true, setAttribute() {}, removeAttribute() {}, querySelectorAll: () => [] });
  const View = vm.runInNewContext(`${main.slice(start, end)}; NoriaTaskTimelineView`, {
    console, setTimeout, clearTimeout,
    NoriaPaneView: class {
      constructor(_leaf, plugin) {
        this.app = app;
        this.plugin = plugin;
        this.containerEl = { empty() {}, createDiv: host };
      }
      cleanupNoriaTaskTimeline() {}
    }
  });
  const view = new View({}, { isModuleEnabled: () => true });
  let completed = false;
  const rendered = [];
  view.mountTimelineRuntime = async () => { view.bucketHostEl = host(); };
  view.runTimelineRuntimeBucket = async () => { rendered.push(completed); };
  view.renderTimelineAppChrome = () => {};
  const filter = { query: "launch", manualCenter: "2026-09-09T05:30:00Z", manualZoomIndex: 5 };
  view._timelineFilterState = filter;
  const notify = async () => {
    for (const ref of listeners) if (ref.name === "noria:tasks-invalidated") ref.callback();
    await new Promise((resolve) => setImmediate(resolve));
  };

  await view.onOpen();
  completed = true;
  await notify();
  assert.deepEqual(rendered, [true]);
  assert.equal(view._timelineFilterState, filter, "source changes must keep the user's viewport and filters");
  await view.onClose();
  assert.equal(listeners.size, 0);
  completed = false;
  await notify();
  assert.deepEqual(rendered, [true]);
  await view.onOpen();
  await notify();
  assert.deepEqual(rendered, [true, false]);
  await view.onClose();
});

test("formal task timeline mount state is observable to startup recovery", () => {
  const main = fs.readFileSync(path.join(pluginRoot, "src/main.js"), "utf8");
  const classStart = main.indexOf("class NoriaTaskTimelineView");
  const classEnd = main.indexOf("function noriaElementIsVisibleEnough", classStart);
  assert.ok(classStart > 0 && classEnd > classStart, "task timeline class should be found");
  const body = main.slice(classStart, classEnd);
  const mountStart = body.indexOf("async mountTimelineRuntime(");
  const mountEnd = body.indexOf("async reload()", mountStart);
  assert.ok(mountStart > 0 && mountEnd > mountStart, "mountTimelineRuntime body should be found");
  const mountBody = body.slice(mountStart, mountEnd);

  assert.match(body, /_timelineRuntimeMountInFlight\s*=\s*false/);
  assert.match(body, /_timelineRuntimeMountState\s*=\s*"idle"/);
  assert.match(body, /setTimelineRuntimeMountState\(state/);
  assert.match(mountBody, /this\.setTimelineRuntimeMountState\("waiting-for-host"/);
  assert.match(mountBody, /this\._timelineRuntimeMountInFlight\s*=\s*true/);
  assert.match(mountBody, /this\.setTimelineRuntimeMountState\("mounting"/);
  assert.match(mountBody, /this\.setTimelineRuntimeMountState\("mounted"/);
  assert.match(mountBody, /finally[\s\S]{0,220}this\._timelineRuntimeMountInFlight\s*=\s*false/);
});

test("formal task timeline coalesces duplicate mount requests while its runtime is in flight", () => {
  const main = fs.readFileSync(path.join(pluginRoot, "src/main.js"), "utf8");
  const classStart = main.indexOf("class NoriaTaskTimelineView");
  const classEnd = main.indexOf("function noriaElementIsVisibleEnough", classStart);
  assert.ok(classStart > 0 && classEnd > classStart, "task timeline class should be found");
  const body = main.slice(classStart, classEnd);
  const mountStart = body.indexOf("async mountTimelineRuntime(");
  const mountEnd = body.indexOf("async reload()", mountStart);
  assert.ok(mountStart > 0 && mountEnd > mountStart, "mountTimelineRuntime body should be found");
  const mountBody = body.slice(mountStart, mountEnd);

  assert.match(body, /_timelineRuntimeMountPromise\s*=\s*null/);
  assert.match(mountBody, /if\s*\(this\._timelineRuntimeMountInFlight\s*&&\s*this\._timelineRuntimeMountPromise\)\s*\{/);
  assert.match(mountBody, /return\s+this\._timelineRuntimeMountPromise/);
  assert.match(mountBody, /const mountPromise\s*=\s*\(async\s*\(\)\s*=>\s*\{/);
  assert.match(mountBody, /this\._timelineRuntimeMountPromise\s*=\s*mountPromise/);
  assert.match(mountBody, /this\._timelineRuntimeMountPromise\s*===\s*mountPromise[\s\S]{0,120}this\._timelineRuntimeMountPromise\s*=\s*null/);
});

test("formal task timeline invalidates superseded async mounts and guards pane-local callbacks", () => {
  const main = fs.readFileSync(path.join(pluginRoot, "src/main.js"), "utf8");
  const classStart = main.indexOf("class NoriaTaskTimelineView");
  const classEnd = main.indexOf("function noriaElementIsVisibleEnough", classStart);
  assert.ok(classStart > 0 && classEnd > classStart, "task timeline class should be found");
  const body = main.slice(classStart, classEnd);
  const runStart = body.indexOf("async runTimelineRuntimeBucket(");
  const runEnd = body.indexOf("async mountTimelineRuntime(", runStart);
  const mountStart = runEnd;
  const mountEnd = body.indexOf("async reload()", mountStart);
  const reloadStart = mountEnd;
  const reloadEnd = body.indexOf("async onOpen()", reloadStart);
  const closeStart = body.indexOf("async onClose()");
  const runBody = body.slice(runStart, runEnd);
  const mountBody = body.slice(mountStart, mountEnd);
  const reloadBody = body.slice(reloadStart, reloadEnd);
  const closeBody = body.slice(closeStart);

  assert.match(body, /_timelineRuntimeGeneration\s*=\s*0/);
  assert.match(body, /invalidateTimelineRuntimeMount\(cleanupRoot/);
  assert.match(runBody, /generation\s*!==\s*self\._timelineRuntimeGeneration\s*\|\|\s*bucketHostEl\s*!==\s*self\.bucketHostEl/);
  assert.match(runBody, /isTimelineRuntimeCurrent:\s*\(\)\s*=>/);
  assert.match(mountBody, /const generation\s*=\s*this\._timelineRuntimeGeneration/);
  assert.match(mountBody, /generation\s*!==\s*this\._timelineRuntimeGeneration/);
  assert.match(mountBody, /if\s*\(generation\s*===\s*this\._timelineRuntimeGeneration\)[\s\S]{0,220}_timelineRuntimeMountInFlight\s*=\s*false/);
  assert.match(reloadBody, /const generation\s*=\s*this\.invalidateTimelineRuntimeMount/);
  assert.match(reloadBody, /mountTimelineRuntime\(generation\)/);
  assert.match(closeBody, /invalidateTimelineRuntimeMount/);
});

test("formal task timeline Today chrome jumps its own pane-local viewport instead of toggling a filter", () => {
  const main = fs.readFileSync(path.join(pluginRoot, "src/main.js"), "utf8");
  const view = fs.readFileSync(pluginPath("views/task-timeline/view.js"), "utf8");
  const toolbarStart = main.indexOf("const focusBtn = center.createEl(\"button\"");
  const toolbarEnd = main.indexOf("const filterActive =", toolbarStart);
  assert.ok(toolbarStart > 0 && toolbarEnd > toolbarStart, "formal timeline toolbar body should be found");
  const toolbar = main.slice(toolbarStart, toolbarEnd);

  assert.match(main, /"timeline\.chrome\.todayOnly":\s*"Jump to today"/);
  assert.match(main, /"timeline\.chrome\.todayOnly":\s*"跳转到今天"/);
  assert.match(main, /"timeline\.chrome\.today":\s*"Today"/);
  assert.match(main, /"timeline\.chrome\.today":\s*"今天"/);
  assert.match(toolbar, /text:\s*this\.plugin\.t\("timeline\.chrome\.today"\)/);
  assert.doesNotMatch(toolbar, /text:\s*"Today"/);
  assert.match(toolbar, /this\._timelineFocusToday/);
  assert.doesNotMatch(toolbar, /__noriaTaskTimelineFocusToday/);
  assert.doesNotMatch(view, /__noriaTaskTimelineFocusToday/);
  assert.match(main, /onTimelineFocusTodayReady:\s*\(focusToday\)\s*=>/);
  assert.match(main, /self\._timelineFocusToday\s*=\s*typeof focusToday === "function" \? focusToday : null/);
  assert.match(toolbar, /focusBtn\.classList\.add\("noria-tl-toolbar-link--pulse"\)/);
  assert.doesNotMatch(toolbar, /classList\.toggle\("noria-tl-today-focus"\)/);
  assert.doesNotMatch(toolbar, /_requestToggleTodayFocus/);
});

test("task timeline source jumps cannot hang on a throttled animation frame", () => {
  const view = fs.readFileSync(pluginPath("views/task-timeline/view.js"), "utf8");
  const waitStart = view.indexOf("function taskTimelineWaitForEditorReady(");
  const waitEnd = view.indexOf("async function taskTimelineOpenSource(", waitStart);
  assert.ok(waitStart > 0 && waitEnd > waitStart, "bounded editor wait helper should be found");
  const waitBody = view.slice(waitStart, waitEnd);
  const openEnd = view.indexOf("function taskTimelineNotifyFailure(", waitEnd);
  const openBody = view.slice(waitEnd, openEnd);

  assert.match(waitBody, /requestAnimationFrame/);
  assert.match(waitBody, /setTimeout/);
  assert.match(waitBody, /clearTimeout/);
  assert.match(openBody, /await taskTimelineWaitForEditorReady\(leaf\)/);
  assert.doesNotMatch(openBody, /await new Promise\([\s\S]*requestAnimationFrame/);
});

test("formal task timeline toolbar actions expose stable diagnostics metadata", () => {
  const main = fs.readFileSync(path.join(pluginRoot, "src/main.js"), "utf8");
  const toolbarStart = main.indexOf("  renderTimelineAppChrome() {");
  const toolbarEnd = main.indexOf("  async toggleTimelineInlinePanel", toolbarStart);
  const toolbarBody = main.slice(toolbarStart, toolbarEnd);
  assert.ok(toolbarStart > 0 && toolbarEnd > toolbarStart && toolbarBody.length > 0, "formal timeline toolbar body should be found");

  for (const [buttonName, actionKind] of [
    ["diaryInboxBtn", "toggle-diary-inbox"],
    ["focusBtn", "jump-today"],
    ["filterBtn", "toggle-filter-panel"],
    ["timerAttachBtn", "drag-attach-pomodoro"],
    ["addBtn", "add-today-task"]
  ]) {
    assert.match(
      toolbarBody,
      new RegExp(`${buttonName}[\\s\\S]*"data-noria-action-source":\\s*"tasks-timeline-toolbar"`),
      `${buttonName} should expose a shared toolbar action source`
    );
    assert.match(
      toolbarBody,
      new RegExp(`${buttonName}[\\s\\S]*"data-noria-action-kind":\\s*"${actionKind}"`),
      `${buttonName} should expose action kind ${actionKind}`
    );
    assert.match(
      toolbarBody,
      new RegExp(`${buttonName}[\\s\\S]*"data-noria-action-state"`),
      `${buttonName} should expose an inspectable action state`
    );
  }

  assert.match(toolbarBody, /focusBtn\.setAttribute\("data-noria-action-state",\s*didJump \? "ok" : "unavailable"\)/);
  assert.match(toolbarBody, /const pomodoroLayerActive = currentFilterState\.layers\.includes\("pomodoro"\)/);
  assert.match(toolbarBody, /if \(this\.plugin\.isPomodoroModuleEnabled\(\) && pomodoroLayerActive\)/);
  assert.match(toolbarBody, /timerAttachBtn\.setAttribute\("data-noria-action-state",\s*"dragging"\)/);
  assert.match(toolbarBody, /timerAttachBtn\.setAttribute\("data-noria-action-state",\s*"idle"\)/);
});

test("formal task timeline hides upstream website copyright badge", () => {
  const css = fs.readFileSync(pluginPath("views/task-timeline/shell.css"), "utf8");

  assert.match(css, /\.noria-task-timeline-root--tasks-timeline\s+\.timeline-copyright\s*\{/);
  assert.match(css, /\.noria-task-timeline-root--tasks-timeline\s+\.timeline-copyright\s*\{[\s\S]*display:\s*none/);
});

test("presentation task event node action states use low-noise visual feedback", () => {
  const css = fs.readFileSync(pluginPath("views/task-timeline/shell.css"), "utf8");

  assert.match(css, /\.noria-task-timeline-root--tasks-timeline \.noria-task-timeline-editable\[data-noria-action-state="pending"\]/);
  assert.match(css, /\.noria-task-timeline-root--tasks-timeline \.noria-task-timeline-editable\[data-noria-action-state="failed"\]/);
  assert.doesNotMatch(css, /\.noria-task-timeline-root--tasks-timeline \.noria-task-timeline-editable\[data-noria-action-state="failed"\][\s\S]{0,180}(?:box-shadow|border|outline):/);
});

test("formal task timeline exposes mode presets through the same filter popover", () => {
  const main = fs.readFileSync(path.join(pluginRoot, "src/main.js"), "utf8");

  assert.match(main, /getTimelineModePresetList/);
  assert.match(main, /detectTimelineModePreset/);
  assert.match(main, /applyTimelineModePreset/);
  assert.match(main, /data-noria-timeline-mode-preset/);
  assert.match(main, /data-noria-timeline-mode-preset-state/);
  assert.match(main, /const allowed = \["task", "annotation", "pomodoro", "note", "git", "noria"\]/);
  assert.match(main, /\{\s*id:\s*"task",\s*label:\s*this\.plugin\.t\("timeline\.filter\.mode\.task"\),\s*layers:\s*\["task", "annotation"\],\s*showDone:\s*false,\s*query:\s*""\s*\}/);
  assert.match(main, /\{\s*id:\s*"record",\s*label:\s*this\.plugin\.t\("timeline\.filter\.mode\.record"\),\s*layers:\s*\["note", "git", "noria"\],\s*showDone:\s*true,\s*query:\s*""\s*\}/);
  assert.match(main, /\{\s*id:\s*"combined",\s*label:\s*this\.plugin\.t\("timeline\.filter\.mode\.combined"\),\s*layers:\s*\["task", "annotation", "pomodoro", "note", "git", "noria"\],\s*showDone:\s*true,\s*query:\s*""\s*\}/);
  assert.doesNotMatch(main, /\{\s*id:\s*"project",\s*label:\s*this\.plugin\.t\("timeline\.filter\.mode\.project"\)/);
  const filterStart = main.indexOf("renderTimelineFilterPanel(anchorEl)");
  const filterBody = main.slice(filterStart, main.indexOf("const search = panel.createEl", filterStart));
  assert.ok(
    filterBody.indexOf("noria-tl-filter-saved-views") < filterBody.indexOf("data-noria-timeline-mode-preset"),
    "named saved views should be the first section inside the existing filter popover"
  );
  assert.doesNotMatch(main, /noria-tl-mode-strip/);
});

test("formal task timeline manages named saved views without adding another toolbar button", () => {
  const main = fs.readFileSync(path.join(pluginRoot, "src/main.js"), "utf8");
  const panelStart = main.indexOf("  renderTimelineFilterPanel(anchorEl) {");
  const panelEnd = main.indexOf("  /** ItemView", panelStart);
  const panel = main.slice(panelStart, panelEnd);
  assert.ok(panelStart > 0 && panelEnd > panelStart, "timeline filter panel should be found");

  assert.match(main, /this\._timelineActivePresetId/);
  assert.match(main, /timelinePresetIsModified/);
  assert.match(main, /saveTimelineNamedView/);
  assert.match(main, /updateTimelineActivePreset/);
  assert.match(main, /renameTimelineActivePreset/);
  assert.match(panel, /const presetList = this\.getTimelinePresetList\(\);/);
  assert.match(panel, /data-noria-timeline-saved-view-state/);
  assert.match(panel, /data-noria-timeline-saved-view-name/);
  assert.match(panel, /data-noria-timeline-preset-action": "save-new"/);
  assert.match(panel, /data-noria-timeline-preset-action": "update-active"/);
  assert.match(panel, /data-noria-timeline-preset-action": "rename-active"/);
  assert.match(panel, /data-noria-timeline-preset-action": "delete-active"/);
  assert.match(panel, /noria-tl-filter-saved-view-editor/);
  assert.match(panel, /timeline\.filter\.manageViews/);
  const toolbarStart = main.indexOf("  renderTimelineAppChrome() {");
  const toolbarEnd = main.indexOf("\n  async toggleTimelineInlinePanel", toolbarStart);
  const toolbar = main.slice(toolbarStart, toolbarEnd);
  assert.doesNotMatch(toolbar, /saved-view|preset-save|bookmark/);
});

test("formal task timeline exposes explicit include and exclude tag controls", () => {
  const main = fs.readFileSync(path.join(pluginRoot, "src/main.js"), "utf8");
  const view = fs.readFileSync(pluginPath("views/task-timeline/view.js"), "utf8");
  const styles = fs.readFileSync(path.join(pluginRoot, "styles.css"), "utf8");
  const panelStart = main.indexOf("  renderTimelineFilterPanel(anchorEl) {");
  const panelEnd = main.indexOf("  /** ItemView", panelStart);
  const panel = main.slice(panelStart, panelEnd);

  assert.match(main, /includeTags:\s*normalizeTaskFilterTagList/);
  assert.match(main, /excludeTags:\s*normalizeTaskFilterTagList/);
  assert.match(main, /includeTags:\s*\[\.\.\.state\.includeTags\]/);
  assert.match(main, /excludeTags:\s*\[\.\.\.state\.excludeTags\]/);
  assert.match(panel, /noria-tl-filter-tag-input--include/);
  assert.match(panel, /noria-tl-filter-tag-input--exclude/);
  assert.match(panel, /timeline\.filter\.includeTagsPlaceholder/);
  assert.match(panel, /timeline\.filter\.excludeTagsPlaceholder/);
  assert.match(view, /includeTags:\s*taskTimelineNormalizeTagList/);
  assert.match(view, /excludeTags:\s*taskTimelineNormalizeTagList/);
  assert.match(view, /tags:\s*state\.includeTags/);
  assert.match(view, /excludeTags:\s*state\.excludeTags/);
  assert.match(main, /"timeline\.filter\.includeTagsPlaceholder": "Only tags/);
  assert.match(main, /"timeline\.filter\.excludeTagsPlaceholder": "Exclude tags/);
  assert.match(main, /"timeline\.filter\.includeTagsPlaceholder": "仅显示标签/);
  assert.match(main, /"timeline\.filter\.excludeTagsPlaceholder": "排除标签/);
  assert.match(main, /timeline\.filter\.summaryIncludeTags/);
  assert.match(main, /timeline\.filter\.summaryExcludeTags/);
  assert.match(main, /includeTags:\s*\[\.\.\.state\.includeTags\]/);
  assert.match(main, /excludeTags:\s*\[\.\.\.state\.excludeTags\]/);
  assert.match(styles, /\.noria-tl-filter-tag-inputs\s*\{/);
  assert.match(styles, /\.noria-tl-filter-tag-input\s*\{/);
});

test("formal task timeline exposes localized named-view controls and settings editors", () => {
  const main = fs.readFileSync(path.join(pluginRoot, "src/main.js"), "utf8");
  const styles = fs.readFileSync(path.join(pluginRoot, "styles.css"), "utf8");

  assert.match(main, /"timeline\.filter\.savedViews": "Saved views"/);
  assert.match(main, /"timeline\.filter\.saveAsView": "Save as view"/);
  assert.match(main, /"timeline\.filter\.savedViews": "已保存视图"/);
  assert.match(main, /"timeline\.filter\.saveAsView": "保存为视图"/);
  assert.match(main, /"settings\.timeline\.presetIncludeTags": "Only tags"/);
  assert.match(main, /"settings\.timeline\.presetExcludeTags": "Exclude tags"/);
  assert.match(main, /setName\(this\.t\("settings\.timeline\.presetIncludeTags"\)\)/);
  assert.match(main, /setName\(this\.t\("settings\.timeline\.presetExcludeTags"\)\)/);
  assert.match(styles, /\.noria-tl-filter-saved-views\s*\{/);
  assert.match(styles, /\.noria-tl-filter-saved-view-actions\s*\{/);
  assert.match(styles, /\.noria-tl-filter-saved-view-name/);
});

test("formal task timeline hides inert reset action from the filter popover", () => {
  const main = fs.readFileSync(path.join(pluginRoot, "src/main.js"), "utf8");
  const panelStart = main.indexOf("  renderTimelineFilterPanel(anchorEl) {");
  const panelEnd = main.indexOf("  /** ItemView", panelStart);
  const panel = main.slice(panelStart, panelEnd);
  assert.ok(panelStart > 0 && panelEnd > panelStart, "timeline filter panel should be found");

  assert.match(panel, /const filterActiveForTools = this\.timelineChromeFilterIsActive\(state\);/);
  assert.match(panel, /if \(filterActiveForTools\) \{[\s\S]*noria-tl-filter-reset/);
  const toolsIndex = panel.indexOf('const tools = panel.createDiv({ cls: "noria-tl-filter-tools" });');
  const resetIndex = panel.indexOf('const reset = tools.createEl("button"', toolsIndex);
  const guardIndex = panel.lastIndexOf("if (filterActiveForTools) {", resetIndex);
  assert.ok(toolsIndex > 0 && guardIndex > toolsIndex && guardIndex < resetIndex, "reset should be guarded inside the tools row by active filter state");
});

test("formal task timeline filter popover controls expose action diagnostics", () => {
  const main = fs.readFileSync(path.join(pluginRoot, "src/main.js"), "utf8");
  const panelStart = main.indexOf("  renderTimelineFilterPanel(anchorEl) {");
  const panelEnd = main.indexOf("  /** ItemView", panelStart);
  const panel = main.slice(panelStart, panelEnd);
  assert.ok(panelStart > 0 && panelEnd > panelStart, "timeline filter panel should be found");

  assert.match(panel, /"data-noria-action-source": "timeline-filter-popover"/);
  assert.match(panel, /"data-noria-action-kind": key/);
  assert.match(panel, /"data-noria-action-state": pressed \? "active" : "idle"/);
  assert.match(panel, /cls: "noria-tl-filter-search"[\s\S]*"data-noria-action-source": "timeline-filter-popover"[\s\S]*"data-noria-action-kind": "filter-query"[\s\S]*"data-noria-action-state": state\.query \? "active" : "idle"/);
  assert.match(panel, /cls: "noria-tl-filter-reset"[\s\S]*"data-noria-action-source": "timeline-filter-popover"[\s\S]*"data-noria-action-kind": "reset-filter"[\s\S]*"data-noria-action-state": "idle"/);
});

test("formal task timeline summarizes active filters on the existing filter control", () => {
  const main = fs.readFileSync(path.join(pluginRoot, "src/main.js"), "utf8");
  const styles = fs.readFileSync(path.join(pluginRoot, "styles.css"), "utf8");
  const toolbarStart = main.indexOf("renderTimelineAppChrome()");
  const toolbarBody = main.slice(toolbarStart, main.indexOf("\n  }\n\n  async toggleTimelineInlinePanel", toolbarStart));
  const filterStart = main.indexOf("renderTimelineFilterPanel(anchorEl)");
  const filterBody = main.slice(filterStart, main.indexOf("const search = panel.createEl", filterStart));

  assert.match(main, /getTimelineChromeFilterSummary/);
  assert.match(toolbarBody, /const filterSummary = this\.getTimelineChromeFilterSummary\(currentFilterState\)/);
  assert.match(toolbarBody, /"data-noria-timeline-filter-mode": filterSummary\.modeId/);
  assert.match(toolbarBody, /"data-noria-timeline-filter-summary": filterSummary\.summary/);
  assert.match(toolbarBody, /"data-noria-timeline-filter-layer-count": String\(filterSummary\.layerCount\)/);
  assert.match(toolbarBody, /"data-noria-timeline-filter-query": filterSummary\.query/);
  assert.match(toolbarBody, /"data-noria-timeline-filter-show-done": filterSummary\.showDone \? "1" : "0"/);
  assert.match(filterBody, /noria-tl-filter-summary/);
  assert.match(filterBody, /text: filterSummary\.summary/);
  assert.doesNotMatch(filterBody, /noria-tl-filter-summary[\\s\\S]{0,240}createEl\("button"/);
  assert.match(styles, /\.noria-tl-filter-summary\s*\{/);
});

test("formal task timeline keeps filter popover visually lightweight", () => {
  const styles = fs.readFileSync(path.join(pluginRoot, "styles.css"), "utf8");
  const popoverBlock = styles.match(/\.noria-tl-filter-popover\s*\{[\s\S]*?\n\}/)?.[0] || "";

  assert.ok(popoverBlock, "filter popover style should exist");
  assert.match(popoverBlock, /background:\s*color-mix/);
  assert.match(popoverBlock, /box-shadow:\s*none/);
  assert.doesNotMatch(popoverBlock, /background:\s*var\(--noria-surface-raised\)/);
  assert.doesNotMatch(popoverBlock, /box-shadow:\s*var\(--shadow-s\)/);
  assert.match(styles, /\.noria-tl-filter-mode-row\s*\{[\s\S]*?\n\}/);
  assert.match(styles, /\.noria-tl-filter-mode-row\s+\.noria-tl-filter-chip\s*\{[\s\S]*?font-weight:\s*640/);
  assert.match(styles, /\.noria-tl-filter-preset-row,\s*\n\.noria-tl-filter-tools\s*\{[\s\S]*?opacity:\s*0\.72/);
});

test("formal task timeline cancels deferred filter listeners when the pane closes", () => {
  const main = fs.readFileSync(path.join(pluginRoot, "src/main.js"), "utf8");
  const viewStart = main.indexOf("class NoriaTaskTimelineView extends NoriaPaneView");
  const viewEnd = main.indexOf("function noriaElementIsVisibleEnough", viewStart);
  const view = main.slice(viewStart, viewEnd);
  const closeStart = view.indexOf("  closeTimelineFilterPanel(options = {}) {");
  const closeEnd = view.indexOf("  async refreshTimelineRuntimeFromChrome()", closeStart);
  const closePanel = view.slice(closeStart, closeEnd);
  const renderStart = view.indexOf("  renderTimelineFilterPanel(anchorEl) {");
  const renderEnd = view.indexOf("  /** ItemView", renderStart);
  const renderPanel = view.slice(renderStart, renderEnd);
  const onCloseStart = view.indexOf("  async onClose() {");
  const onCloseEnd = view.indexOf("\n  }", onCloseStart) + 4;
  const onClose = view.slice(onCloseStart, onCloseEnd);

  assert.ok(viewStart > 0 && viewEnd > viewStart, "task timeline view should be found");
  assert.match(view, /this\._timelineFilterListenerTimer = null;/);
  assert.match(closePanel, /if \(this\._timelineFilterListenerTimer != null\)/);
  assert.match(closePanel, /window\.clearTimeout\(this\._timelineFilterListenerTimer\)/);
  assert.match(renderPanel, /this\._timelineFilterListenerTimer = window\.setTimeout\(\(\) => \{/);
  assert.match(renderPanel, /this\._timelineFilterListenerTimer = null;[\s\S]*this\._timelineFilterPopoverEl !== panel/);
  assert.match(renderPanel, /!this\.hostEl\?\.isConnected/);
  assert.match(onClose, /this\.closeTimelineFilterPanel\(\);/);
});

test("formal task timeline keeps the runtime bucket from scrolling over band drag", () => {
  const styles = fs.readFileSync(path.join(pluginRoot, "styles.css"), "utf8");
  const shellCss = fs.readFileSync(pluginPath("views/task-timeline/shell.css"), "utf8");
  const bucketBlock = styles.match(/\.noria-timeline-bucket-host\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const timelineBlock = shellCss.match(/\.noria-task-timeline-root--tasks-timeline \.timeline-default\s*\{[\s\S]*?\n\}/)?.[0] || "";

  assert.ok(bucketBlock, "task timeline bucket host style should exist");
  assert.match(bucketBlock, /overflow:\s*hidden/);
  assert.ok(timelineBlock, "formal task timeline block should exist");
  assert.match(timelineBlock, /touch-action:\s*none/);
});

test("formal task timeline constrains non-wide labels to avoid sidebar collisions", () => {
  const css = fs.readFileSync(pluginPath("views/task-timeline/shell.css"), "utf8");
  const nonWideLabelBlock = css.match(/\.noria-task-timeline-root--tasks-timeline:not\(\[data-noria-task-timeline-density="wide"\]\)\s+\.timeline-band-0\s+\.timeline-event-label:not\(\.noria-task-timeline-native-title\)\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const nonWideEditableBlock = css.match(/\.noria-task-timeline-root--tasks-timeline:not\(\[data-noria-task-timeline-density="wide"\]\)\s+\.timeline-band-0\s+\.timeline-event-label\.noria-task-timeline-editable:not\(\.noria-task-timeline-native-title\)\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const nonWideHoverBlock = css.match(/\.noria-task-timeline-root--tasks-timeline:not\(\[data-noria-task-timeline-density="wide"\]\)\s+\.timeline-band-0\s+\.timeline-event-label\.noria-task-timeline-editable:not\(\.noria-task-timeline-native-title\):hover\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const compactLabelBlock = css.match(/\.noria-task-timeline-root--tasks-timeline\[data-noria-task-timeline-density="compact"\]\s+\.timeline-band-0\s+\.timeline-event-label:not\(\.noria-task-timeline-native-title\)\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const compactEditableBlock = css.match(/\.noria-task-timeline-root--tasks-timeline\[data-noria-task-timeline-density="compact"\]\s+\.timeline-band-0\s+\.timeline-event-label\.noria-task-timeline-editable:not\(\.noria-task-timeline-native-title\)\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const instantPointBlock = css.match(/\.noria-task-timeline-root--tasks-timeline\s+\.timeline-event-icon\.noria-task-timeline-instant-point\s*\{[\s\S]*?\n\}/)?.[0] || "";

  assert.ok(nonWideLabelBlock, "ordinary side panes should constrain non-native labels without overriding native layout bounds");
  assert.match(nonWideLabelBlock, /display:\s*inline-block/);
  assert.match(nonWideLabelBlock, /box-sizing:\s*border-box/);
  assert.match(nonWideLabelBlock, /max-width:\s*var\(--noria-event-label-max,\s*min\(160px,\s*54cqw\)\)/);
  assert.doesNotMatch(nonWideLabelBlock, /max-width:\s*min\(72px,\s*24cqw\)/);
  assert.match(nonWideLabelBlock, /overflow:\s*hidden/);
  assert.match(nonWideLabelBlock, /text-overflow:\s*ellipsis/);
  assert.match(nonWideLabelBlock, /white-space:\s*nowrap/);
  assert.ok(nonWideEditableBlock, "non-native editable labels should keep inline-flex layout while still using the short sidebar label width");
  assert.match(nonWideEditableBlock, /display:\s*inline-flex/);
  assert.match(nonWideEditableBlock, /max-width:\s*var\(--noria-event-label-max,\s*min\(160px,\s*54cqw\)\)/);
  assert.match(css, /\.noria-task-timeline-root--tasks-timeline\s+\.timeline-band-0\s+\.timeline-event-label\s*\{[\s\S]*transform:\s*translateX\(var\(--noria-event-label-offset-x,\s*0px\)\)\s+translateY\(var\(--noria-event-label-offset-y,\s*0px\)\)/);
  assert.ok(nonWideHoverBlock, "ordinary side panes should not expand task labels into neighboring date lanes on hover");
  assert.match(nonWideHoverBlock, /max-width:\s*var\(--noria-event-label-max,\s*min\(160px,\s*54cqw\)\)/);
  assert.doesNotMatch(nonWideHoverBlock, /420px/);
  assert.ok(compactLabelBlock && compactEditableBlock, "compact caps should also leave native title width under layout ownership");
  assert.match(compactLabelBlock, /width:\s*auto/);
  assert.match(compactEditableBlock, /width:\s*auto/);
  assert.ok(instantPointBlock, "instant markers should stay visually aligned with their shifted labels");
  assert.match(instantPointBlock, /transform:\s*translateX\(var\(--noria-event-marker-offset-x,\s*0px\)\)\s+translateY\(var\(--noria-event-marker-offset-y,\s*0px\)\)/);
  assert.doesNotMatch(instantPointBlock, /radial-gradient/);
  assert.match(instantPointBlock, /background-image:\s*none/);
  assert.match(instantPointBlock, /background-color:\s*color-mix\(in srgb,\s*var\(--noria-task-timeline-task-blue\)\s+58%,\s*var\(--background-primary\)\)/);
  assert.match(instantPointBlock, /box-shadow:\s*none/);
  assert.match(instantPointBlock, /filter:\s*none/);
});

test("formal task timeline keeps sidebar task units visually cohesive", () => {
  const css = fs.readFileSync(pluginPath("views/task-timeline/shell.css"), "utf8");
  const labelBlock = css.match(/\.noria-task-timeline-root--tasks-timeline\s+\.timeline-event-label\.noria-task-timeline-editable\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const labelMarkerBlock = css.match(/\.noria-task-timeline-root--tasks-timeline\s+\.timeline-event-label\.noria-task-timeline-editable::before\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const instantPointBlock = css.match(/\.noria-task-timeline-root--tasks-timeline\s+\.timeline-event-icon\.noria-task-timeline-instant-point\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const instantPointNativeImageBlock = css.match(/\.noria-task-timeline-root--tasks-timeline\s+\.timeline-event-icon\.noria-task-timeline-instant-point\s*>\s*img\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const instantHandleBlock = css.match(/\.noria-task-timeline-drag-handle--instant\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const tickBlock = css.match(/\.noria-task-timeline-root--tasks-timeline\s+\.noria-task-timeline-overview-info-tick\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const segmentBlock = css.match(/\.noria-task-timeline-root--tasks-timeline\s+\.noria-task-timeline-overview-info-segment\s*\{[\s\S]*?\n\}/)?.[0] || "";

  assert.ok(labelBlock, "task labels should own the readable task unit styling");
  assert.match(labelBlock, /color:\s*color-mix\(in srgb,\s*var\(--noria-task-timeline-task-blue-deep\)\s+32%,\s*var\(--noria-task-timeline-time-ink\)\)/);
  assert.match(labelBlock, /letter-spacing:\s*0/);
  assert.ok(labelMarkerBlock, "task labels should not add a second local dot beside the timeline event point");
  assert.match(labelMarkerBlock, /display:\s*none/);
  assert.doesNotMatch(labelMarkerBlock, /width:\s*4px[\s\S]*height:\s*4px/);
  assert.ok(instantPointBlock, "instant markers should be flat anchors, not detached glossy dots");
  assert.doesNotMatch(instantPointBlock, /radial-gradient/);
  assert.match(instantPointBlock, /background-image:\s*none/);
  assert.match(instantPointBlock, /background-color:\s*color-mix\(in srgb,\s*var\(--noria-task-timeline-task-blue\)\s+58%,\s*var\(--background-primary\)\)/);
  assert.match(instantPointBlock, /box-shadow:\s*none/);
  assert.ok(instantPointNativeImageBlock, "native timeline icon image should be hidden so the Noria point is not duplicated");
  assert.match(instantPointNativeImageBlock, /display:\s*none/);
  assert.ok(instantHandleBlock, "instant drag hit target should reuse the visible point instead of drawing a second circle");
  assert.match(instantHandleBlock, /inset:\s*-8px/);
  assert.match(instantHandleBlock, /border:\s*0/);
  assert.match(instantHandleBlock, /background:\s*transparent/);
  assert.match(instantHandleBlock, /box-shadow:\s*none/);
  assert.doesNotMatch(instantHandleBlock, /border:\s*1px/);
  assert.ok(tickBlock && segmentBlock, "overview should remain visible but read as secondary density context");
  assert.match(tickBlock, /height:\s*8px/);
  assert.match(tickBlock, /opacity:\s*0\.28/);
  assert.match(segmentBlock, /opacity:\s*0\.26/);
  assert.doesNotMatch(tickBlock, /opacity:\s*0\.7/);
  assert.doesNotMatch(segmentBlock, /opacity:\s*0\.68/);
});

test("formal task timeline uses expressive layered color tokens", () => {
  const css = fs.readFileSync(pluginPath("views/task-timeline/shell.css"), "utf8");

  assert.match(css, /--noria-task-timeline-task-blue:\s*#2563eb/);
  assert.match(css, /--noria-task-timeline-today-wash:/);
  assert.match(css, /--noria-task-timeline-pomo-red:\s*#ef4444/);
  assert.match(css, /--noria-task-timeline-mark-amber:\s*#f59e0b/);
  assert.match(css, /\.noria-task-timeline-root--tasks-timeline\s+\.timeline-band-0\s*\{[\s\S]*background:/);
  assert.match(css, /\.noria-task-timeline-root--tasks-timeline\s+\.timeline-event-tape\.noria-task-timeline-editable[\s\S]*border-color:\s*transparent/);
  assert.match(css, /\.noria-task-timeline-root--tasks-timeline\s+\.timeline-event-tape\.noria-task-timeline-editable[\s\S]*box-shadow:\s*inset 0 -1px 0/);
  assert.match(css, /\.noria-task-timeline-root--tasks-timeline\s+\.noria-task-timeline-date-label--day-only/);
});

test("formal task timeline keeps its native bands visually quiet", () => {
  const css = fs.readFileSync(pluginPath("views/task-timeline/shell.css"), "utf8");
  const nativeCss = fs.readFileSync(pluginPath("views/task-timeline/native.css"), "utf8");
  const backend = fs.readFileSync(pluginPath("views/task-timeline/native-backend.js"), "utf8");
  const rootBlock = css.match(/\.noria-task-timeline-root--tasks-timeline\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const stageBlock = css.match(/\.noria-task-timeline-root--tasks-timeline \.noria-task-timeline-stage\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const band0Block = css.match(/\.noria-task-timeline-root--tasks-timeline \.timeline-band-0\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const band1Block = css.match(/\.noria-task-timeline-root--tasks-timeline \.timeline-band-1\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const labelBlock = css.match(/\.noria-task-timeline-root--tasks-timeline \.timeline-event-label\.noria-task-timeline-editable\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const nowBlock = css.match(/\.noria-task-timeline-root--tasks-timeline \.timeline-highlight-point-decorator\.noria-task-timeline-now-cursor\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const nativeNowBlock = nativeCss.match(/\.noria-task-timeline-native-marker\.noria-task-timeline-now-cursor\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const tickBlock = css.match(/\.noria-task-timeline-root--tasks-timeline \.noria-task-timeline-overview-info-tick\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const segmentBlock = css.match(/\.noria-task-timeline-root--tasks-timeline \.noria-task-timeline-overview-info-segment\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const etherBlock = css.match(/\.noria-task-timeline-root--tasks-timeline \.timeline-band-1 \.timeline-ether-lines\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const darkBand0EtherBlock = css.match(/\.theme-dark \.noria-task-timeline-root--tasks-timeline \.timeline-band-0 \.timeline-ether-bg\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const darkBand1EtherBlock = css.match(/\.theme-dark \.noria-task-timeline-root--tasks-timeline \.timeline-band-1 \.timeline-ether-bg\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const darkWeekendBlock = css.match(/\.theme-dark \.noria-task-timeline-root--tasks-timeline \.timeline-ether-weekends\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const darkHighlightBlock = css.match(/\.theme-dark \.noria-task-timeline-root--tasks-timeline \.timeline-ether-highlight\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const darkEtherLinesBlock = css.match(/\.theme-dark \.noria-task-timeline-root--tasks-timeline \.timeline-ether-lines\s*\{[\s\S]*?\n\}/)?.[0] || "";

  assert.match(rootBlock, /--noria-task-timeline-time-surface:\s*color-mix\(in srgb,\s*var\(--background-primary\)\s+96%,\s*#eff6ff\)/);
  assert.match(rootBlock, /--noria-task-timeline-time-band:\s*color-mix\(in srgb,\s*var\(--background-primary\)\s+91%,\s*#eef2ff\)/);
  assert.match(rootBlock, /--noria-task-timeline-overview-band:\s*color-mix\(in srgb,\s*var\(--background-primary\)\s+88%,\s*#dbeafe\)/);
  assert.match(stageBlock, /var\(--background-primary\)\s+78%\)/);
  assert.match(band0Block, /linear-gradient\(180deg/);
  assert.match(band1Block, /linear-gradient\(180deg/);
  assert.doesNotMatch(`${band0Block}\n${band1Block}`, /#fef3c7|#fef08a/);
  assert.match(labelBlock, /text-shadow:\s*none/);
  assert.match(backend, /bounds:\s*\{\s*left:\s*nowLeft\s*-\s*0\.5,\s*top:\s*0,\s*width:\s*1,\s*height:\s*heightPx\s*\}/);
  assert.match(nativeNowBlock, /opacity:\s*0\.58/);
  assert.match(nowBlock, /box-shadow:\s*none/);
  assert.doesNotMatch(nowBlock, /0 0 4px/);
  assert.match(tickBlock, /opacity:\s*0\.28/);
  assert.match(segmentBlock, /opacity:\s*0\.26/);
  assert.match(etherBlock, /opacity:\s*0\.5/);
  assert.match(darkBand0EtherBlock, /background-color:\s*var\(--noria-task-timeline-time-band\)/);
  assert.match(darkBand1EtherBlock, /background-color:\s*var\(--noria-task-timeline-overview-band\)/);
  assert.match(darkWeekendBlock, /background-color:\s*color-mix\(in srgb,\s*var\(--interactive-accent\)\s+4%,\s*transparent\)/);
  assert.match(darkHighlightBlock, /background-color:\s*color-mix\(in srgb,\s*var\(--background-primary\)\s+76%,\s*var\(--interactive-accent\)\s+24%\)/);
  assert.match(darkEtherLinesBlock, /border-color:\s*color-mix\(in srgb,\s*var\(--background-modifier-border\)\s+68%,\s*transparent\)/);
});

test("formal task timeline shows hover details from existing task metadata without new controls", () => {
  const css = fs.readFileSync(pluginPath("views/task-timeline/shell.css"), "utf8");
  const hoverBlock = css.match(/\.noria-task-timeline-root--tasks-timeline \.timeline-event-label\.noria-task-timeline-editable\[data-noria-task-hover-state="ready"\]:hover::after,[\s\S]*?\n\}/)?.[0] || "";
  const unitLabelBlock = css.match(/\.noria-task-timeline-root--tasks-timeline \.timeline-event-label\.noria-task-timeline-editable\[data-noria-task-unit-hover="active"\]\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const unitTapeBlock = css.match(/\.noria-task-timeline-root--tasks-timeline \.timeline-event-tape\.noria-task-timeline-editable\[data-noria-task-unit-hover="active"\]\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const unitIconBlock = css.match(/\.noria-task-timeline-root--tasks-timeline \.timeline-event-icon\.noria-task-timeline-editable\[data-noria-task-unit-hover="active"\]\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const unitRangeTitleBlock = css.match(/\.noria-task-timeline-root--tasks-timeline \.noria-task-timeline-duration-tape-title\[data-noria-task-unit-hover="active"\]\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const unitHandleBlock = css.match(/\.noria-task-timeline-root--tasks-timeline \.noria-task-timeline-editable\[data-noria-task-unit-hover="active"\]\s*>\s*\.noria-task-timeline-drag-handle\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(hoverBlock, "task label hover detail CSS should exist");
  assert.match(hoverBlock, /content:\s*attr\(data-noria-task-hover-text\)/);
  assert.match(hoverBlock, /white-space:\s*pre-line/);
  assert.match(hoverBlock, /pointer-events:\s*none/);
  assert.match(hoverBlock, /max-width:\s*min\(280px,\s*calc\(100vw - 32px\)\)/);
  assert.match(hoverBlock, /background:\s*color-mix\(in srgb,\s*var\(--background-primary\)\s+96%,\s*var\(--background-secondary\)\)/);
  assert.ok(unitLabelBlock, "task unit hover should lightly highlight the title surface");
  assert.match(unitLabelBlock, /color:\s*color-mix\(in srgb,\s*var\(--interactive-accent\)\s+34%,\s*var\(--noria-task-timeline-time-ink\)\)/);
  assert.ok(unitTapeBlock, "task unit hover should keep the full range rail secondary to the local title rail");
  assert.match(unitTapeBlock, /box-shadow:\s*inset 0 -1px 0/);
  assert.match(unitTapeBlock, /color-mix\(in srgb,\s*var\(--noria-task-timeline-task-blue\)\s+12%,\s*transparent\)/);
  assert.doesNotMatch(unitTapeBlock, /opacity:\s*0\./);
  assert.ok(unitIconBlock, "task unit hover should lightly lift the point marker");
  assert.match(unitIconBlock, /background-color:\s*color-mix\(in srgb,\s*var\(--interactive-accent\)\s+56%,\s*var\(--background-primary\)\)/);
  assert.match(unitIconBlock, /box-shadow:\s*none/);
  assert.match(unitIconBlock, /filter:\s*none/);
  assert.match(unitIconBlock, /opacity:\s*1/);
  assert.ok(unitRangeTitleBlock, "task unit hover should keep the rail-owned title visually attached");
  assert.match(unitRangeTitleBlock, /background:\s*color-mix\(in srgb,\s*var\(--background-primary\)\s+60%,\s*var\(--interactive-accent\)\)/);
  assert.ok(unitHandleBlock, "task unit hover should reveal existing edit handles without new controls");
  assert.match(unitHandleBlock, /opacity:\s*0\.78/);
  assert.doesNotMatch(hoverBlock, /button|toolbar|rail/);
  assert.doesNotMatch(`${unitLabelBlock}\n${unitTapeBlock}\n${unitIconBlock}\n${unitRangeTitleBlock}\n${unitHandleBlock}`, /button|toolbar|panel/);
});

test("formal task timeline gives drag states quiet in-place feedback", () => {
  const css = fs.readFileSync(pluginPath("views/task-timeline/shell.css"), "utf8");
  const affordanceBlock = css.match(/\.noria-task-timeline-root--tasks-timeline \.noria-task-timeline-editable\[data-noria-drag-role\]:hover,[\s\S]*?\n\}/)?.[0] || "";
  const activeBlock = css.match(/\.noria-task-timeline-root--tasks-timeline \.noria-task-timeline-editable\[data-noria-drag-preview-state="active"\]\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const pendingBlock = css.match(/\.noria-task-timeline-root--tasks-timeline \.noria-task-timeline-editable\[data-noria-drag-commit-state="pending"\]\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const failedBlock = css.match(/\.noria-task-timeline-root--tasks-timeline \.noria-task-timeline-editable\[data-noria-drag-commit-state="failed"\]\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const conflictBlock = css.match(/\.noria-task-timeline-root--tasks-timeline \.noria-task-timeline-editable\[data-noria-drag-conflict-state="stale-source"\]\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const handleBlock = css.match(/\.noria-task-timeline-root--tasks-timeline \.noria-task-timeline-drag-handle\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const edgeHandleBlock = css.match(/\.noria-task-timeline-drag-handle--start,\s*\n\.noria-task-timeline-drag-handle--end\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const edgeRailBlock = css.match(/\.noria-task-timeline-drag-handle--start::after,\s*\n\.noria-task-timeline-drag-handle--end::after\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const moveHandleBlock = css.match(/\.noria-task-timeline-drag-handle--move\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const instantHandleBlock = css.match(/\.noria-task-timeline-drag-handle--instant\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const durationDragStateBlock = css.match(/\.noria-task-timeline-root--tasks-timeline \.timeline-event-tape\.noria-task-timeline-editable\.is-dragging,[\s\S]*?data-noria-drag-conflict-state="stale-source"\]\s*\{[\s\S]*?\n\}/)?.[0] || "";

  assert.ok(affordanceBlock, "editable task nodes should show a quiet drag affordance on hover/focus");
  assert.match(affordanceBlock, /outline:\s*1px solid color-mix\(in srgb,\s*var\(--interactive-accent\)\s+26%,\s*transparent\)/);
  assert.ok(activeBlock, "active drag preview should style the existing moved task node");
  assert.match(activeBlock, /outline:\s*1px dashed/);
  assert.ok(pendingBlock, "pending drag commit should stay visible on the existing task node");
  assert.match(pendingBlock, /cursor:\s*progress/);
  assert.ok(failedBlock, "failed drag commit should show an in-place warning state");
  assert.match(failedBlock, /#ef4444/);
  assert.ok(conflictBlock, "stale-source drag conflicts should have a distinct conflict state");
  assert.match(conflictBlock, /#f59e0b/);
  assert.match(handleBlock, /box-shadow:\s*none/);
  assert.match(edgeHandleBlock, /width:\s*12px/);
  assert.match(edgeHandleBlock, /background:\s*transparent/);
  assert.match(edgeHandleBlock, /border:\s*0/);
  assert.match(edgeRailBlock, /width:\s*2px/);
  assert.match(edgeRailBlock, /background:\s*color-mix\(in srgb,\s*var\(--interactive-accent\)\s+70%,\s*var\(--background-primary\)\)/);
  assert.match(moveHandleBlock, /inset:\s*-5px 12px/);
  assert.ok(instantHandleBlock, "instant drag target should stay large but invisible, using the point itself as the visible handle");
  assert.match(instantHandleBlock, /inset:\s*-8px/);
  assert.match(instantHandleBlock, /border:\s*0/);
  assert.match(instantHandleBlock, /background:\s*transparent/);
  assert.match(instantHandleBlock, /box-shadow:\s*none/);
  assert.ok(durationDragStateBlock, "duration drag states should not outline the full time-span rail");
  assert.match(durationDragStateBlock, /outline:\s*none/);
  assert.match(durationDragStateBlock, /outline-offset:\s*0/);
  assert.doesNotMatch(edgeHandleBlock, /var\(--background-primary\).*border|border:\s*1px/);
  assert.doesNotMatch(instantHandleBlock, /border:\s*1px/);
  assert.doesNotMatch(`${affordanceBlock}\n${activeBlock}\n${pendingBlock}\n${failedBlock}\n${conflictBlock}`, /button|toolbar|rail/);
});

test("formal task timeline annotation context menu uses quiet menu and editor chrome", () => {
  const css = fs.readFileSync(pluginPath("views/task-timeline/shell.css"), "utf8");
  const menuBlock = css.match(/\.noria-task-timeline-context-menu\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const actionBlock = css.match(/\.noria-task-timeline-context-action\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const inputBlock = css.match(/\.noria-task-timeline-annotation-editor input,[\s\S]*?\.noria-task-timeline-annotation-editor textarea\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const inputFocusBlock = css.match(/\.noria-task-timeline-annotation-editor input:focus-visible,[\s\S]*?\.noria-task-timeline-annotation-editor textarea:focus-visible\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const swatchBlock = css.match(/\.noria-task-timeline-color-swatch\s*\{[\s\S]*?\n\}/)?.[0] || "";

  assert.match(menuBlock, /border:\s*1px solid color-mix\(in srgb,\s*var\(--background-modifier-border\)\s+76%,\s*transparent\)/);
  assert.match(menuBlock, /box-shadow:\s*0 10px 26px color-mix\(in srgb,\s*var\(--background-primary\)\s+58%,\s*transparent\)/);
  assert.match(actionBlock, /appearance:\s*none/);
  assert.match(actionBlock, /display:\s*flex/);
  assert.match(actionBlock, /font-weight:\s*520/);
  assert.match(inputBlock, /background:\s*color-mix\(in srgb,\s*var\(--background-primary\)\s+96%,\s*var\(--background-secondary\)\)/);
  assert.match(inputFocusBlock, /outline:\s*1px solid color-mix\(in srgb,\s*var\(--interactive-accent\)\s+44%,\s*transparent\)/);
  assert.doesNotMatch(swatchBlock, /255 255 255/);
  assert.doesNotMatch(`${menuBlock}\n${actionBlock}`, /button-rail|toolbar|card-wall/);
});

test("pomodoro task identity uses internal fingerprint without task-line ids", () => {
  const hooks = loadTimelineHooks();

  const meta = hooks.pomodoroMetaFromTask({
    path: "06_Diary/2026-05-01.md",
    line: 12,
    text: "- [ ] A [🍅:: 1] ^noria99"
  });

  assert.equal(meta.path, "06_Diary/2026-05-01.md");
  assert.equal(meta.lineHint, 12);
  assert.ok(meta.textFingerprint);
  assert.doesNotMatch(meta.textFingerprint, /\^noria99|\[🍅::/);
  assert.equal(hooks.stripPomodoroNoiseFromLine("- [ ] A [🍅:: 1] ^noria99"), "- [ ] A");
  assert.equal(hooks.stripPomodoroNoiseFromLine("- [ ] A [🍅:: 1] ^manual"), "- [ ] A ^manual");
});

test("legacy inline pomodoro fields migrate to internal store and clean task line", () => {
  const hooks = loadTimelineHooks();

  const migrated = hooks.migrateLegacyPomodoroLine(
    "- [ ] A [timeLog:: 2026-05-01T10:00:00>2026-05-01T10:25:00;2026-05-01T11:00:00>2026-05-01T11:20:00] [timer_running:: 2026-05-01T11:00:00]",
    { path: "06_Diary/2026-05-01.md", lineHint: 7, blockId: "^noria12", title: "A", workLen: 25, nowIso: "2026-05-01T11:08:00" }
  );

  assert.doesNotMatch(migrated.line, /\[timeLog::/);
  assert.doesNotMatch(migrated.line, /\[timer_running::/);
  assert.doesNotMatch(migrated.line, /\[🍅::/);
  assert.doesNotMatch(migrated.line, /\^noria12$/);
  assert.doesNotMatch(migrated.taskKey, /#\^noria12$/);
  assert.equal(migrated.task.path, "06_Diary/2026-05-01.md");
  assert.equal(migrated.task.lineHint, 7);
  assert.ok(migrated.task.textFingerprint);
  assert.equal(migrated.task.actual, 1);
  assert.equal(migrated.task.sessions.length, 3);
  assert.equal(migrated.task.sessions[0].durationMin, 25);
  assert.equal(migrated.task.sessions[2].completed, false);
  assert.equal(migrated.task.sessions[2].durationMin, 8);
});

test("legacy pomodoro store keys normalize to v2 internal keys", () => {
  const hooks = loadTimelineHooks();

  const state = hooks.normalizePomodoroState({
    version: 1,
    activeAttachTaskKey: "a.md#^noriaence12",
    active: { taskKey: "a.md#^noriaence12", mode: "WORK", status: "paused", elapsedMs: 60000, durationMin: 25 },
    tasks: {
      "a.md#^noriaence12": {
        path: "a.md",
        blockId: "^noria12",
        titleSnapshot: "A",
        actual: 2,
        sessions: [{ mode: "WORK", start: "2026-05-01T10:00:00", end: "2026-05-01T10:25:00", durationMin: 25, completed: true }]
      }
    }
  });

  const keys = Object.keys(state.tasks);
  assert.equal(state.version, 2);
  assert.equal(keys.length, 1);
  assert.notEqual(keys[0], "a.md#^noriaence12");
  assert.equal(state.active.taskKey, keys[0]);
  assert.equal(state.activeAttachTaskKey, keys[0]);
  assert.equal(state.tasks[keys[0]].actual, 2);
});

test("pomodoro records resolve by fingerprint after line movement", () => {
  const hooks = loadTimelineHooks();
  const fp = hooks.buildTaskFingerprint("- [ ] A");
  const state = hooks.normalizePomodoroState({
    version: 2,
    tasks: {
      zp_a: { path: "a.md", lineHint: 1, textFingerprint: fp, titleSnapshot: "A", actual: 1, sessions: [] }
    }
  });

  const resolved = hooks.resolvePomodoroTaskRecord({ path: "a.md", line: 8, text: "- [ ] A" }, state);
  assert.equal(resolved.taskKey, "zp_a");
  assert.equal(resolved.record.actual, 1);
});

test("attached pomodoro with no sessions is visible", () => {
  const hooks = loadTimelineHooks();
  const state = hooks.normalizePomodoroState({
    version: 2,
    activeAttachTaskKey: "zp_a",
    tasks: {
      zp_a: { path: "a.md", lineHint: 1, textFingerprint: hooks.buildTaskFingerprint("- [ ] A"), titleSnapshot: "A", actual: 0, expected: 0, sessions: [] }
    }
  });

  const summary = hooks.buildTaskPomodoroSummary(state, "zp_a");
  assert.equal(summary.visible, true);
  assert.equal(summary.attached, true);
  assert.equal(summary.primaryText, "");
});

test("stale timer attach globals do not make detached pomodoro visible", () => {
  const hooks = loadTimelineHooks();
  const state = hooks.normalizePomodoroState({
    version: 2,
    tasks: {
      zp_a: { path: "a.md", lineHint: 1, textFingerprint: hooks.buildTaskFingerprint("- [ ] A"), titleSnapshot: "A", actual: 0, expected: 0, sessions: [] }
    }
  });

  hooks.setLocalPomodoroState(state);
  hooks.setSingleTimerAttachKey("zp_a");

  assert.equal(hooks.isTimerAttachedKey("zp_a"), false);
  assert.equal(hooks.buildTaskPomodoroSummary(hooks.readPomodoroState(), "zp_a").visible, false);
});

test("detaching pomodoro clears attachment and removes empty records", () => {
  const hooks = loadTimelineHooks();
  const state = hooks.normalizePomodoroState({
    version: 2,
    activeAttachTaskKey: "zp_a",
    tasks: {
      zp_a: { path: "a.md", lineHint: 1, textFingerprint: hooks.buildTaskFingerprint("- [ ] A"), titleSnapshot: "A", actual: 0, expected: 0, sessions: [] }
    }
  });

  hooks.setLocalPomodoroState(state);
  hooks.setSingleTimerAttachKey("zp_a");
  const next = hooks.detachPomodoroState(state, ["zp_a"], "2026-05-01T10:00:00");
  hooks.setLocalPomodoroState(next);
  hooks.clearTimerAttachKeys(["zp_a"]);

  assert.equal(next.activeAttachTaskKey, "");
  assert.equal(next.tasks.zp_a, undefined);
  assert.equal(hooks.isTimerAttachedKey("zp_a"), false);
  assert.equal(hooks.buildTaskPomodoroSummary(hooks.readPomodoroState(), "zp_a").visible, false);
});

test("detaching pomodoro preserves history without attached state", () => {
  const hooks = loadTimelineHooks();
  const state = hooks.normalizePomodoroState({
    version: 2,
    activeAttachTaskKey: "zp_a",
    tasks: {
      zp_a: { path: "a.md", lineHint: 1, textFingerprint: hooks.buildTaskFingerprint("- [ ] A"), titleSnapshot: "A", actual: 1, expected: 2, sessions: [] }
    }
  });

  const next = hooks.detachPomodoroState(state, ["zp_a"], "2026-05-01T10:00:00");
  const summary = hooks.buildTaskPomodoroSummary(next, "zp_a");

  assert.equal(next.activeAttachTaskKey, "");
  assert.ok(next.tasks.zp_a);
  assert.equal(summary.visible, false);
  assert.equal(summary.attached, false);
  assert.equal(summary.primaryText, "");
});

test("pomodoro work session completes only after accumulated work time", () => {
  const hooks = loadTimelineHooks();

  let state = hooks.normalizePomodoroState({});
  state = hooks.startPomodoroWork(state, { taskKey: "zp_a", path: "a.md", lineHint: 1, textFingerprint: hooks.buildTaskFingerprint("- [ ] A"), title: "A" }, "2026-05-01T10:00:00");
  state = hooks.pausePomodoro(state, "2026-05-01T10:10:00");
  state = hooks.resumePomodoro(state, "2026-05-01T10:15:00");
  state = hooks.tickPomodoro(state, "2026-05-01T10:30:00");

  assert.equal(state.tasks.zp_a.actual, 1);
  assert.equal(state.tasks.zp_a.sessions[0].completed, true);
  assert.equal(state.tasks.zp_a.sessions[1].mode, "BREAK");
  assert.equal(state.active.mode, "BREAK");
  assert.equal(state.active.status, "paused");
});

test("running pomodoro transfer closes source unfinished session and opens target", () => {
  const hooks = loadTimelineHooks();

  let state = hooks.normalizePomodoroState({});
  state = hooks.startPomodoroWork(state, { taskKey: "zp_a", path: "a.md", lineHint: 1, textFingerprint: hooks.buildTaskFingerprint("- [ ] A"), title: "A" }, "2026-05-01T10:00:00");
  state = hooks.transferPomodoroTask(state, { taskKey: "zp_b", path: "b.md", lineHint: 2, textFingerprint: hooks.buildTaskFingerprint("- [ ] B"), title: "B" }, "2026-05-01T10:10:00");

  assert.equal(state.tasks.zp_a.sessions[0].end, "2026-05-01T10:10:00");
  assert.equal(state.tasks.zp_a.sessions[0].completed, false);
  assert.equal(state.active.taskKey, "zp_b");
  assert.equal(state.tasks.zp_b.sessions[0].start, "2026-05-01T10:10:00");
  assert.equal(state.tasks.zp_b.actual, 0);
});

test("completion counter delta decrements the matching active bucket", () => {
  const hooks = loadTimelineHooks();

  const delta = hooks.completionCounterDelta({
    todo: "1",
    todoDated: "1",
    overdue: "0",
    unplanned: "0"
  }, true);

  assert.equal(delta.todo, -1);
  assert.equal(delta.overdue, 0);
  assert.equal(delta.unplanned, 0);
});

test("pomodoro settings save is silent and does not trigger external index refresh", () => {
  const code = fs.readFileSync(pluginPath("main.js"), "utf8");
  const start = code.indexOf("async savePomodoroState(nextState)");
  const end = code.indexOf("getPlannerLabControlsMeta()", start);

  assert.ok(start > 0, "plugin savePomodoroState should exist");
  assert.ok(end > start, "plugin savePomodoroState method boundary should be found");
  assert.doesNotMatch(code.slice(start, end), /dataview:refresh-views/);
});

test("timeline inline capture mutates the latest diary text through the shared transaction helper", () => {
  const code = fs.readFileSync(pluginPath("main.js"), "utf8");
  const start = code.indexOf("async modifyTimelineDiary(U, mutate)");
  const end = code.indexOf("\n  setTimelineInlineStatus(", start);

  assert.ok(start > 0, "timeline diary mutator should exist");
  assert.ok(end > start, "timeline diary mutator boundary should be found");
  const method = code.slice(start, end);
  assert.match(method, /this\.plugin\.processTextAtVaultPath/);
  assert.doesNotMatch(method, /this\.app\.vault\.(?:modify|create)/);
});

test("sleep timeline generation omits repeated target fields", () => {
  const habitParsing = loadHabitParsingUtils();
  const line = habitParsing.buildSleepTimelineLine({
    date: "2026-05-01",
    start: "23:30",
    end: "07:00",
    target: "00:30"
  });

  assert.match(line, /\[start:: 2026-05-01 23:30\]/);
  assert.match(line, /\[due:: 2026-05-02 07:00\]/);
  assert.doesNotMatch(line, /\[target::/);
});

test("task calendar uses planner-chrome naming and no retired naming surface", () => {
  const runtime = fs.readFileSync(pluginPath("views/tasks-calendar/runtime-core.js"), "utf8");
  const css = fs.readFileSync(pluginPath("views/tasks-calendar/default.css"), "utf8");
  const wrapper = fs.readFileSync(pluginPath("views/tasks-calendar/view.js"), "utf8");
  const main = fs.readFileSync(pluginPath("main.js"), "utf8");
  const dashboardHome = fs.readFileSync(pluginPath("views/dashboard/home/sections/bootstrap-style/view.js"), "utf8");
  const combined = [runtime, css, wrapper, main, dashboardHome].join("\n");
  const legacyStyleToken = ["style", "4"].join("");
  const legacyClassToken = ["tc", "s4"].join("-");
  const legacyPattern = new RegExp([
    legacyStyleToken,
    "Style" + "4",
    "STYLE" + "4",
    legacyClassToken,
    "\\." + legacyStyleToken,
    "--" + legacyClassToken
  ].join("|"));

  assert.doesNotMatch(combined, legacyPattern);
  assert.match(wrapper, /planner-chrome noFilename lineClamp1 noWeekNr noLayer/);
  assert.match(runtime, /optionsTokens\.indexOf\("planner-chrome"\)/);
  assert.match(css, /\.tasksCalendar\.planner-chrome/);
});

test("task calendar view dispatch avoids string eval for built-in views", () => {
  const runtime = fs.readFileSync(pluginPath("views/tasks-calendar/runtime-core.js"), "utf8");

  assert.match(runtime, /function getTaskCalendarViewHandlers\(\)/);
  assert.match(runtime, /function renderTaskCalendarViewNow\(/);
  assert.match(runtime, /function resolveInitialTaskCalendarSelectedDate\(/);
  assert.doesNotMatch(runtime, /eval\("get"\+capitalize\(view\)\)/);
  assert.doesNotMatch(runtime, /eval\("selected"\+capitalize\(view\)\)/);
});

test("task calendar adapter loader scopes globals by runtime build and records diagnostics", () => {
  const runtime = fs.readFileSync(pluginPath("views/tasks-calendar/runtime-core.js"), "utf8");

  assert.match(runtime, /var tasksCalendarRuntimeBuildId = String\(/);
  assert.match(runtime, /function getTaskCalendarAdapterLoadState\(/);
  assert.match(runtime, /__noriaTaskCalendarAdapterLoadState/);
  assert.match(runtime, /delete globalThis\.dashboardCore\.adapters\[globalAdapterKey\]/);
  assert.match(runtime, /adapterMeta\.status = "loading"/);
  assert.match(runtime, /adapterMeta\.status = "ready"/);
  assert.match(runtime, /adapterMeta\.status = "failed"/);
});

test("task calendar runtime stores local preferences through bridge before localStorage fallback", () => {
  const runtime = fs.readFileSync(pluginPath("views/tasks-calendar/runtime-core.js"), "utf8");
  const main = fs.readFileSync(path.join(pluginRoot, "src/main.js"), "utf8");

  assert.match(runtime, /function getTasksCalendarRuntimeSettings\(\)/);
  assert.match(runtime, /function getTasksCalendarGranularityPreference\(/);
  assert.match(runtime, /function getTasksCalendarBooleanPreference\(/);
  assert.match(runtime, /function saveTasksCalendarRuntimePreference\(/);
  assert.match(runtime, /getTasksCalendarGranularityPreference\("eisenhowerGranularity",\s*"week",\s*"noria\.eisen\.granularity"\)/);
  assert.match(runtime, /getTasksCalendarBooleanPreference\("showEarlyHours",\s*false,\s*"noria-tc-show-early-hours"\)/);

  const granStart = runtime.indexOf('["day", tcRuntimeT("runtime.tasksCalendar.view.shortDay")]');
  const granEnd = runtime.indexOf("setQuickTimelinePanel", granStart);
  assert.ok(granStart > 0 && granEnd > granStart, "quadrant granularity button setup should be found");
  const granBody = runtime.slice(granStart, granEnd);
  assert.match(granBody, /saveTasksCalendarRuntimePreference\("eisenhowerGranularity",\s*ek,\s*"noria\.eisen\.granularity"\)/);
  assert.doesNotMatch(granBody, /localStorage\.setItem\("noria\.eisen\.granularity"/);

  const earlyStart = runtime.indexOf("function ensurePlannerChromeToolbarChromeButtonsExist");
  const earlyEnd = runtime.indexOf("function ensurePlannerChromePlannerLabPanel", earlyStart);
  assert.ok(earlyStart > 0 && earlyEnd > earlyStart, "planner chrome toolbar setup should be found");
  const earlyBody = runtime.slice(earlyStart, earlyEnd);
  assert.match(earlyBody, /saveTasksCalendarRuntimePreference\("showEarlyHours",\s*showEarlyHours,\s*"noria-tc-show-early-hours"\)/);
  assert.doesNotMatch(earlyBody, /localStorage\.setItem\("noria-tc-show-early-hours"/);

  assert.match(main, /async saveTasksCalendarPreference\(/);
  assert.match(main, /tasksCalendar:\s*\{[\s\S]*savePreference\(key,\s*value\)/);
});

test("task calendar quadrant treats normalized low priorities as not important", () => {
  const runtime = fs.readFileSync(pluginPath("views/tasks-calendar/runtime-core.js"), "utf8");
  const start = runtime.indexOf("function taskIsLowPriorityForEisen");
  const end = runtime.indexOf("function classifyEisenhowerBucket", start);
  assert.ok(start > 0 && end > start, "quadrant priority classifier should be found");

  const context = { globalThis: null };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${runtime.slice(start, end)}\nglobalThis.isLow = taskIsLowPriorityForEisen;`, context);

  assert.equal(context.isLow({ priority: "low" }), true);
  assert.equal(context.isLow({ priority: "lowest" }), true);
  assert.equal(context.isLow({ priority: "D" }), true);
  assert.equal(context.isLow({ priority: "normal" }), false);
  assert.equal(context.isLow({ priority: "high" }), false);
});

test("task calendar quadrant urgency stays relative to today across aggregated ranges", () => {
  const runtime = fs.readFileSync(pluginPath("views/tasks-calendar/runtime-core.js"), "utf8");
  const start = runtime.indexOf("function taskIsLowPriorityForEisen");
  const end = runtime.indexOf("for (let i = 0; i < eisenDayList.length; i++)", start);
  assert.ok(start > 0 && end > start, "quadrant classifiers should be found");

  const momentStub = (value) => ({
    value: String(value || ""),
    isValid() { return /^\d{4}-\d{2}-\d{2}$/.test(this.value); },
    diff(other, unit) {
      assert.equal(unit, "days");
      return Math.round((Date.parse(`${this.value}T00:00:00Z`) - Date.parse(`${other.value}T00:00:00Z`)) / 86400000);
    }
  });
  const context = {
    globalThis: null,
    moment: momentStub,
    todayStr: "2026-08-05",
    TC_EISEN_URGENT_WITHIN_DAYS: 3,
    coerceTemporalToYmd(value) { return String(value || "").slice(0, 10); },
    getTaskEisenhowerBucketOverride() { return ""; },
    isTimelineTaggedTask() { return false; }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${runtime.slice(start, end)}\nglobalThis.classify = classifyEisenhowerBucket;`, context);

  assert.equal(context.classify({ typ: "overdue", task: { priority: "high", due: "2026-08-20" } }), "q2");
  assert.equal(context.classify({ typ: "overdue", task: { priority: "low", due: "2026-08-28" } }), "q4");
  assert.equal(context.classify({ typ: "overdue", task: { priority: "normal", due: "2026-08-04" } }), "q1");
  assert.equal(context.classify({ typ: "overdue", task: { priority: "low", due: "2026-08-04" } }), "q3");
});

test("formal task timeline keeps filter hierarchy focused and moves annotation selection to the toolbar", () => {
  const main = fs.readFileSync(path.join(pluginRoot, "src/main.js"), "utf8");
  const panelStart = main.indexOf("  renderTimelineFilterPanel(anchorEl) {");
  const panelEnd = main.indexOf("  /** ItemView", panelStart);
  const panel = main.slice(panelStart, panelEnd);
  const toolbarStart = main.indexOf("  renderTimelineAppChrome() {");
  const toolbarEnd = main.indexOf("\n  async toggleTimelineInlinePanel", toolbarStart);
  const toolbar = main.slice(toolbarStart, toolbarEnd);

  assert.match(panel, /noria-tl-filter-completion-row/);
  assert.match(panel, /timeline\.filter\.openOnly/);
  assert.match(panel, /timeline\.filter\.includeDone/);
  assert.match(panel, /noria-tl-filter-advanced/);
  assert.match(panel, /timeline\.filter\.moreFilters/);
  assert.doesNotMatch(panel, /noria-tl-filter-scale-row/);
  assert.doesNotMatch(panel, /"mode-mark"/);
  assert.match(toolbar, /data-noria-action-kind": "toggle-annotation-select"/);
  assert.match(toolbar, /timeline\.chrome\.annotationSelect/);
});

test("task calendar quadrant drag keeps dates intact and persists an explicit manual bucket", () => {
  const runtime = fs.readFileSync(pluginPath("views/tasks-calendar/runtime-core.js"), "utf8");
  const css = fs.readFileSync(pluginPath("views/tasks-calendar/default.css"), "utf8");

  const helperStart = runtime.indexOf("function normalizeEisenhowerBucketOverride");
  const helperEnd = runtime.indexOf("async function saveTaskEisenhowerBucket", helperStart);
  assert.ok(helperStart > 0 && helperEnd > helperStart, "quadrant override helpers should exist");
  const context = {
    globalThis: null,
    getInlineFieldValue(text, field) {
      const match = String(text || "").match(new RegExp(`\\[${field}::\\s*([^\\]]+)\\]`, "i"));
      return match ? match[1].trim() : "";
    },
    normalizePriorityValue(value) { return String(value || "normal").toLowerCase(); }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${runtime.slice(helperStart, helperEnd)}\nglobalThis.readBucket = getTaskEisenhowerBucketOverride;\nglobalThis.dropPriority = getPriorityForEisenhowerBucket;`, context);

  assert.equal(context.readBucket({ rawText: "- [ ] Draft [noria-quadrant:: q2]" }), "q2");
  assert.equal(context.readBucket({ rawText: "- [ ] Draft [noria-quadrant:: invalid]" }), "");
  assert.equal(context.dropPriority({ priority: "high" }, "q1"), "high");
  assert.equal(context.dropPriority({ priority: "low" }, "q2"), "normal");
  assert.equal(context.dropPriority({ priority: "high" }, "q3"), "low");
  assert.equal(context.dropPriority({ priority: "lowest" }, "q4"), "lowest");

  const saveStart = runtime.indexOf("async function saveTaskEisenhowerBucket");
  const saveEnd = runtime.indexOf("async function saveTaskDateTime", saveStart);
  assert.ok(saveStart > 0 && saveEnd > saveStart, "quadrant writeback should be isolated from date-time saves");
  const saveBody = runtime.slice(saveStart, saveEnd);
  assert.match(saveBody, /upsertInlineField\(line,\s*"noria-quadrant",\s*bucket\)/);
  assert.match(saveBody, /applyTaskPriorityMarker\(lines\[idx\],\s*nextPriority\)/);
  assert.doesNotMatch(saveBody, /upsertInlineField\(line,\s*"(?:start|due)"/);

  assert.match(runtime, /node\.draggable\s*=\s*true/);
  assert.match(runtime, /addEventListener\("dragstart"/);
  assert.match(runtime, /addEventListener\("dragover"/);
  assert.match(runtime, /addEventListener\("drop"/);
  assert.match(runtime, /function moveEisenhowerTaskOptimistically/);
  assert.match(runtime, /function restoreEisenhowerTaskOptimistically/);
  const dropStart = runtime.indexOf('host.addEventListener("drop", async function (event) {');
  const dropEnd = runtime.indexOf("\n\t\t});", dropStart);
  const dropBody = runtime.slice(dropStart, dropEnd);
  assert.ok(
    dropBody.indexOf("moveEisenhowerTaskOptimistically") < dropBody.indexOf("await saveTaskEisenhowerBucket"),
    "quadrant task should move before persistence begins"
  );
  assert.match(dropBody, /restoreEisenhowerTaskOptimistically/);
  assert.doesNotMatch(dropBody, /getList\(tasks, focus\)/);
  assert.match(css, /\.tasksCalendar\[view='list'\]\s+\.quadrant\s+\.qContent\.is-drop-target/);
});

test("task calendar fresh data adapter preserves task priority", () => {
  const runtime = fs.readFileSync(pluginPath("views/tasks-calendar/runtime-core.js"), "utf8");
  const start = runtime.indexOf("function resolveDataTaskPriority");
  const end = runtime.indexOf("async function collectFreshTasksForCalendar", start);
  assert.ok(start > 0 && end > start, "fresh task adapter should be found");

  const context = {
    globalThis: null,
    normalizeVaultRelPath(value) { return String(value || ""); }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${runtime.slice(start, end)}\nglobalThis.adapt = adaptDataTaskToRuntimeTask;`, context);

  const row = context.adapt({
    classification: { priority: "low" },
    source: { path: "Noria/Projects/Example.md", line: 4, rawLine: "- [ ] Example" },
    text: { raw: "Example" }
  });
  assert.equal(row.priority, "low");

  const emojiRow = context.adapt({
    classification: { priority: "normal" },
    source: { path: "Noria/Projects/Example.md", line: 5, rawLine: "- [ ] Low priority task 🔽" },
    text: { raw: "Low priority task" }
  });
  assert.equal(emojiRow.priority, "low");

  const inlineRow = context.adapt({
    source: { path: "Noria/Projects/Example.md", line: 6, rawLine: "- [ ] Planned task [priority:: low]" },
    text: { raw: "Planned task" }
  });
  assert.equal(inlineRow.priority, "low");
});

test("task calendar creates diary notes under the configured diary root", () => {
  const runtime = fs.readFileSync(pluginPath("views/tasks-calendar/runtime-core.js"), "utf8");
  const wrapper = fs.readFileSync(pluginPath("views/tasks-calendar/view.js"), "utf8");
  const homeTasks = fs.readFileSync(pluginPath("views/periodic/dashboardTodayTasks.js"), "utf8");
  const weather = fs.readFileSync(pluginPath("views/dashboard/core/utils/weather-service.js"), "utf8");

  const buildStart = runtime.indexOf("function buildDailyNotePath");
  const buildEnd = runtime.indexOf("function calendarDaySpanBetweenStartDays", buildStart);
  assert.ok(buildStart > 0 && buildEnd > buildStart, "periodic path builders should be found");
  const buildBody = runtime.slice(buildStart, buildEnd);

  assert.match(buildBody, /function getConfiguredDiaryRoot\(\)/);
  assert.match(buildBody, /noriaBridge && noriaBridge\.paths \? noriaBridge\.paths\.diaryRoot/);
  assert.match(buildBody, /getConfiguredDiaryRoot\(\) \+ "\/" \+ m\.format\("YYYY"\) \+ "\/" \+ noteName/);
  assert.match(buildBody, /getConfiguredDiaryRoot\(\) \+ "\/" \+ isoY \+ "\/" \+ noteName/);
  assert.match(buildBody, /getConfiguredDiaryRoot\(\) \+ "\/" \+ y \+ "\/" \+ noteName/);
  assert.doesNotMatch(buildBody, /return\s+"06_Diary\//);

  assert.match(wrapper, /configuredDiaryRoot/);
  assert.match(wrapper, /pages:\s*quoteNoriaSourcePath\(configuredDiaryRoot\)/);
  assert.match(wrapper, /isUnderVaultRoot\(currentFilePathForEmbed,\s*configuredDiaryRoot\)/);
  assert.doesNotMatch(wrapper, /\^06_Diary\\\//);

  assert.match(homeTasks, /const getConfiguredDiaryRoot = \(\) =>/);
  assert.match(homeTasks, /\$\{root\}\/\$\{y\}\/\$\{todayStr\}\.md/);
  assert.doesNotMatch(homeTasks, /06_Diary\/\$\{y\}\/\$\{y\}\$\{pad2/);
  assert.match(weather, /__noriaRuntimeBridge\?\.paths\?\.diaryRoot/);
});

test("task calendar renders waiting rows as fixed in-flow hosts without waiting toolbar UI", () => {
  const runtime = fs.readFileSync(pluginPath("views/tasks-calendar/runtime-core.js"), "utf8");
  const css = fs.readFileSync(pluginPath("views/tasks-calendar/default.css"), "utf8");

  assert.ok(runtime.includes("function renderPlannerChromeWaitingHostForDate"), "in-flow waiting host renderer should exist");
  assert.ok(runtime.includes("PLANNER_WAITING_ROWS_ENABLED = true"), "visible waiting rows should be enabled for week/day planner views");
  assert.match(runtime, /function arePlannerChromeWaitingRowsEnabled/);
  assert.ok(runtime.includes("PLANNER_WAITING_VISIBLE_LIMIT = 2"), "waiting band limit should stay at 2 visible rows");
  const legacyPopoverPattern = new RegExp(["daybucket", "popover"].join("-"), "i");
  assert.doesNotMatch(runtime, legacyPopoverPattern);
  assert.doesNotMatch(css, legacyPopoverPattern);
  assert.doesNotMatch(runtime, /tc-planner-daybucket-toggle/);
  assert.doesNotMatch(css, /tc-planner-daybucket-toggle/);
  assert.doesNotMatch(runtime, /closePlannerChromeWaitingLayer/);
  assert.doesNotMatch(runtime, /togglePlannerChromeWaiting(?:Layer|Strips)|setPlannerChromeWaitingStripExpanded/);
  assert.doesNotMatch(runtime, /tc-planner-waiting-expanded|tc-planner-waiting-more/);
  assert.doesNotMatch(css, /tc-planner-waiting-expanded|tc-planner-waiting-more|is-expanded|is-collapsed/);

  const renderStart = runtime.indexOf("function renderPlannerChromeWaitingHostForDate");
  const renderEnd = runtime.indexOf("function countPlannerChromeWaitingLayerTasks", renderStart);
  assert.ok(renderStart > 0 && renderEnd > renderStart, "waiting host render body should be found");
  const renderBody = runtime.slice(renderStart, renderEnd);
  assert.match(renderBody, /arePlannerChromeWaitingRowsEnabled\(\)/);
  assert.doesNotMatch(renderBody, /ensurePlannerChromeWaitingLayer|positionPlannerChromeWaitingLayer/);
  assert.match(renderBody, /ensurePlannerChromeWaitingHost\(cellContent,\s*currentDate\)/);
  assert.match(renderBody, /renderPlannerChromeWaitingStrip\(strip,\s*entries,\s*fallbackBucket,\s*currentDate\)/);
  assert.doesNotMatch(renderBody, /host\.hidden\s*=\s*true/);
  assert.match(renderBody, /host\.setAttribute\("data-empty",\s*count <= 0 \? "1" : "0"\)/);

  const syncStart = runtime.indexOf("function syncPlannerChromeDayBucketPeekVar");
  const syncEnd = runtime.indexOf("function computePlannerChromeWaitingPeek", syncStart);
  assert.ok(syncStart > 0 && syncEnd > syncStart, "waiting sync helper should be found");
  const syncBody = runtime.slice(syncStart, syncEnd);
  assert.doesNotMatch(syncBody, /!arePlannerChromeWaitingRowsEnabled\(\)[\s\S]{0,220}clearPlannerChromeWaitingLayer/);
  assert.match(syncBody, /computePlannerChromeWaitingPeek\(r\)/);

  assert.doesNotMatch(css, /\.grid > \.tc-planner-waiting-layer \{/);
  assert.doesNotMatch(css, /tc-planner-waiting-day/);
  assert.match(css, /\.cellContent > \.tc-planner-waiting-host \{/);
  assert.doesNotMatch(css, /\.cellContent > \.tc-planner-waiting-host\[hidden\]/);
});

test("task calendar keeps waiting source snapshots separate from visible host count", () => {
  const runtime = fs.readFileSync(pluginPath("views/tasks-calendar/runtime-core.js"), "utf8");

  assert.match(runtime, /function countPlannerChromeWaitingLayerTasks/);
  assert.match(runtime, /function countPlannerChromeWaitingSourceTasks/);
  assert.match(runtime, /function rememberPlannerChromeWaitingEntriesForDate/);
  assert.match(runtime, /function rebuildPlannerChromeWaitingHostsFromSnapshots/);

  const renderStart = runtime.indexOf("function renderPlannerChromeWaitingHostForDate");
  const renderEnd = runtime.indexOf("function countPlannerChromeWaitingLayerTasks", renderStart);
  assert.ok(renderStart > 0 && renderEnd > renderStart, "waiting host render body should be found");
  const renderBody = runtime.slice(renderStart, renderEnd);
  assert.match(renderBody, /arePlannerChromeWaitingRowsEnabled\(\)/);
  assert.doesNotMatch(renderBody, /countPlannerChromeWaitingTasksInRoot\(rootNode\)/);
  assert.doesNotMatch(runtime, /function updatePlannerChromeDayBucketToggleLabel/);
});

test("task calendar rebuilds visible waiting rows with the canonical task row", () => {
  const runtime = fs.readFileSync(pluginPath("views/tasks-calendar/runtime-core.js"), "utf8");

  assert.match(runtime, /function buildPlannerChromeWaitingItemFromEntry/);
  const buildStart = runtime.indexOf("function buildPlannerChromeWaitingItemFromEntry");
  const buildEnd = runtime.indexOf("function renderPlannerChromeWaitingStrip", buildStart);
  assert.ok(buildStart > 0 && buildEnd > buildStart, "waiting item rebuild body should be found");
  const buildBody = runtime.slice(buildStart, buildEnd);
  assert.match(buildBody, /buildTaskElement\(task,\s*typ,\s*currentDate,\s*doc\)/);
  assert.doesNotMatch(buildBody, /build(?:RuntimeCalItemRow|BareCalItem|LinkOnlyCalItem|MinimalTaskElement)/);
  assert.match(runtime, /function hasPlannerChromeWaitingStandardStructure/);
  assert.match(buildBody, /hasPlannerChromeWaitingStandardStructure\(item\)/);

  const stripStart = runtime.indexOf("function renderPlannerChromeWaitingStrip");
  const stripEnd = runtime.indexOf("function renderPlannerChromeWaitingHostForDate", stripStart);
  assert.ok(stripStart > 0 && stripEnd > stripStart, "waiting strip render body should be found");
  const stripBody = runtime.slice(stripStart, stripEnd);
  assert.match(stripBody, /buildPlannerChromeWaitingItemFromEntry\(ent,\s*currentDate,\s*doc\)/);
  assert.match(stripBody, /hasPlannerChromeWaitingStandardStructure\(node\)/);
  assert.doesNotMatch(stripBody, /var node = ent\.node \|\| ent;\s*if \(!node \|\| node\.nodeType !== 1\) \{ continue; \}/);
});

test("task calendar uses one canonical task row builder without recursive fallback modes", () => {
  const runtime = fs.readFileSync(pluginPath("views/tasks-calendar/runtime-core.js"), "utf8");
  const css = fs.readFileSync(pluginPath("views/tasks-calendar/default.css"), "utf8");
  const timelineView = fs.readFileSync(pluginPath("views/tasks-timeline/view.js"), "utf8");

  assert.doesNotMatch(runtime, /function build(?:RuntimeCalItemRow|BareCalItem|LinkOnlyCalItem|MinimalTaskElement)/);
  assert.doesNotMatch(runtime, /\bruntimeOnly\b|\bbareOnly\b/);
  assert.doesNotMatch(runtime, /data-tc-(?:bare|runtime)|tc-cal-item--(?:minimal|link|runtime)|tc-title-text/);
  assert.doesNotMatch(css, /data-tc-(?:bare|runtime)|tc-cal-item--(?:minimal|link|runtime)|tc-title-text/);
  assert.doesNotMatch(timelineView, /tc-cal-item--link/);

  const showStart = runtime.indexOf("function showTasks(tasksToShow, typ)");
  const nodeDecl = runtime.indexOf("var node = buildTaskElement(", showStart);
  assert.ok(showStart > 0 && nodeDecl > showStart, "showTasks pre-node branch should be found");
  const preNode = runtime.slice(showStart, nodeDecl);
  const fastPath = preNode.match(/if \(plannerChromeWeek && \(slotEarly\.slotType == "none" \|\| routeEarlyToWaiting\)\) \{[\s\S]*?continue;\s*\n\t\t\t\}/)?.[0] || "";
  assert.ok(fastPath, "planner waiting fast path should exist before task DOM builders");
  assert.match(fastPath, /dayBucketPlan\.push\(\{ task: sorted\[t\], node: null, typ: typ, preAxis: routeEarlyToWaiting \}\)/);
  assert.match(fastPath, /renderedTaskKeys\.add\(taskKey\)/);
  assert.doesNotMatch(fastPath, /arePlannerChromeWaitingRowsEnabled/);
  assert.doesNotMatch(fastPath, /buildTaskElement|appendedRows\+\+/);

  const canonicalEnd = runtime.indexOf("if (!node) continue;", nodeDecl);
  assert.ok(canonicalEnd > nodeDecl, "canonical task row branch should be found");
  const canonicalBody = runtime.slice(nodeDecl, canonicalEnd);
  assert.match(canonicalBody, /buildTaskElement\(\s*sorted\[t\],\s*typ,\s*currentDate,\s*doc/);
  assert.doesNotMatch(canonicalBody, /build(?:RuntimeCalItemRow|BareCalItem|LinkOnlyCalItem|MinimalTaskElement)/);

  const rawStart = runtime.indexOf("if (plannerChromeWeek && rawExpect > 0", canonicalEnd);
  const rawEnd = runtime.indexOf("actual = countCalItemsInHost(hostEl);", rawStart);
  assert.ok(rawStart > 0 && rawEnd > rawStart, "render verification branch should be found");
  const fallbackBody = runtime.slice(rawStart, rawEnd);
  assert.match(fallbackBody, /if \(plannerChromeWeek && rawExpect > 0 && actual === 0\) \{\s*return;\s*\}/);
  assert.doesNotMatch(fallbackBody, /renderTasksIntoHost\(/);
});

test("task calendar quadrant uses the canonical task row only", () => {
  const runtime = fs.readFileSync(pluginPath("views/tasks-calendar/runtime-core.js"), "utf8");

  const fillStart = runtime.indexOf("function fillBucket(q, maxCount)");
  const fillEnd = runtime.indexOf('fillBucket("q1"', fillStart);
  assert.ok(fillStart > 0 && fillEnd > fillStart, "quadrant fill body should be found");
  const fillBody = runtime.slice(fillStart, fillEnd);
  assert.match(fillBody, /buildTaskElement\(items\[i\]\.task,\s*items\[i\]\.typ,\s*items\[i\]\.dateStr,\s*listNode\.ownerDocument,\s*\{ eisenContentOnly: true \}\)/);
  assert.doesNotMatch(fillBody, /build(?:RuntimeCalItemRow|BareCalItem|LinkOnlyCalItem|MinimalTaskElement)/);
});

test("task calendar waiting hosts are in cellContent before timeLane and never in the axis or lane", () => {
  const runtime = fs.readFileSync(pluginPath("views/tasks-calendar/runtime-core.js"), "utf8");
  const css = fs.readFileSync(pluginPath("views/tasks-calendar/default.css"), "utf8");

  assert.match(runtime, /function ensurePlannerChromeWaitingHost/);
  const ensureStart = runtime.indexOf("function ensurePlannerChromeWaitingHost");
  const ensureEnd = runtime.indexOf("function renderPlannerChromeWaitingHostForDate", ensureStart);
  assert.ok(ensureStart > 0 && ensureEnd > ensureStart, "waiting host ensure body should be found");
  const ensureBody = runtime.slice(ensureStart, ensureEnd);
  assert.match(ensureBody, /cellContent\.insertBefore\(host,\s*timeLane\)/);
  assert.doesNotMatch(ensureBody, /grid\.appendChild|grid\.insertBefore|position:\s*"absolute"/);

  assert.doesNotMatch(css, /\.timeAxisGlobal[\s\S]{0,180}tc-planner-waiting-host/);
  assert.match(css, /\.timeLane \[data-slot='waiting'\]\s*\{[\s\S]*display:\s*none/);
  assert.match(css, /\.cellContent > \.tc-planner-waiting-host \{[\s\S]*position:\s*relative/);
  const hostBlock = css.match(/\.cellContent > \.tc-planner-waiting-host \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(hostBlock, "waiting host css block should be found");
  assert.doesNotMatch(hostBlock, /position:\s*absolute/);
});

test("task calendar waiting rows inherit normal task title structure and bounded height", () => {
  const runtime = fs.readFileSync(pluginPath("views/tasks-calendar/runtime-core.js"), "utf8");
  const css = fs.readFileSync(pluginPath("views/tasks-calendar/default.css"), "utf8");

  assert.match(runtime, /function normalizePlannerChromeWaitingItem/);
  assert.match(runtime, /normalizePlannerChromeWaitingItem\(item/);
  assert.match(runtime, /item\.setAttribute\("data-slot",\s*"waiting"\)/);
  assert.match(runtime, /tcEnsureStatusCircle\(item/);

  assert.match(css, /--tc-planner-waiting-row-h:\s*20px/);
  assert.match(css, /--tc-planner-waiting-band-h:\s*calc\(var\(--tc-planner-waiting-row-h\) \* 2 \+ var\(--tc-planner-waiting-row-gap\)\)/);
  assert.doesNotMatch(css, /\.tc-planner-waiting-strip\s*\{[\s\S]*?max-height:\s*20px/);
  assert.match(css, /\.tc-planner-waiting-strip \[data-tc-waiting-item='1'\] \.note,/);
  assert.match(css, /\.tc-planner-waiting-strip \[data-tc-waiting-item='1'\] \.icon \{[\s\S]*display:\s*none/);

  const waitingTitleRules = css.match(/tc-planner-waiting[^\n{]*(?:description|tc-title|internal-link)[\s\S]*?\{[\s\S]*?\}/g) || [];
  assert.equal(waitingTitleRules.length, 0, "waiting layer should not define separate title typography rules");
  assert.doesNotMatch(css, /\.tc-cal-item\[data-slot='waiting'\] \.inner/);
  assert.doesNotMatch(css, /tc-cal-item\[data-slot='waiting'\][^\n{]*\.tc-title-row \.description/);
  assert.doesNotMatch(css, /tc-cal-item\[data-slot='waiting'\][\s\S]{0,220}font-size:/);
  assert.doesNotMatch(css, /tc-cal-item\[data-slot='waiting'\][\s\S]{0,220}font-weight:/);
});

test("task calendar waiting band is bounded and internally scrollable without expanded state", () => {
  const runtime = fs.readFileSync(pluginPath("views/tasks-calendar/runtime-core.js"), "utf8");
  const css = fs.readFileSync(pluginPath("views/tasks-calendar/default.css"), "utf8");

  const peekStart = runtime.indexOf("function computePlannerChromeWaitingPeek");
  const peekEnd = runtime.indexOf("function ensurePlannerChromeWaitingHost", peekStart);
  assert.ok(peekStart > 0 && peekEnd > peekStart, "waiting peek helper should be found");
  const peekBody = runtime.slice(peekStart, peekEnd);

  assert.doesNotMatch(peekBody, /return\s+64/);
  assert.doesNotMatch(peekBody, /return\s+96/);
  assert.doesNotMatch(peekBody, /tc-planner-waiting-all-expanded[\s\S]{0,120}return/);
  assert.match(peekBody, /if \(maxCount <= 1\) \{ return 24; \}/);
  assert.match(peekBody, /return 46;/);

  const syncStart = runtime.indexOf("function syncPlannerChromeDayBucketPeekVar");
  const syncEnd = runtime.indexOf("function computePlannerChromeWaitingPeek", syncStart);
  assert.ok(syncStart > 0 && syncEnd > syncStart, "waiting sync helper should be found");
  const syncBody = runtime.slice(syncStart, syncEnd);
  assert.doesNotMatch(syncBody, /tc-planner-waiting-all-expanded[\s\S]{0,120}96/);
  assert.doesNotMatch(syncBody, /tc-planner-waiting-expanded[\s\S]{0,120}--tc-planner-waiting-peek/);
  assert.doesNotMatch(syncBody, /tc-planner-waiting-expanded[\s\S]{0,160}180/);
  assert.doesNotMatch(syncBody, /!arePlannerChromeWaitingRowsEnabled\(\)[\s\S]{0,220}--tc-planner-waiting-peek",\s*"0px"/);
  assert.doesNotMatch(syncBody, /--tc-planner-waiting-layer-max-h/);
  assert.doesNotMatch(syncBody, /tc-planner-waiting-expanded/);
  assert.doesNotMatch(css, /--tc-planner-waiting-expanded-h/);
  assert.doesNotMatch(css, /min\(180px,\s*42vh\)/);
  assert.doesNotMatch(css, /\.tc-planner-waiting-strip\.is-expanded/);
  const waitingStripScrollBlock = css.match(/\.tc-planner-waiting-strip \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(waitingStripScrollBlock, "waiting strip scroll block should be present");
  assert.match(waitingStripScrollBlock, /height:\s*var\(--tc-planner-waiting-band-h\)/);
  assert.match(waitingStripScrollBlock, /max-height:\s*var\(--tc-planner-waiting-band-h\)/);
  assert.match(waitingStripScrollBlock, /overflow-y:\s*hidden/);
  assert.match(waitingStripScrollBlock, /overflow-x:\s*hidden/);
  assert.match(waitingStripScrollBlock, /overscroll-behavior:\s*contain/);
  assert.match(waitingStripScrollBlock, /touch-action:\s*pan-y/);
  const waitingStripScrollableBlock = css.match(/\.tc-planner-waiting-strip\[data-scrollable='1'\] \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(waitingStripScrollableBlock, "waiting strip scrollable state block should be present");
  assert.match(waitingStripScrollableBlock, /overflow-y:\s*auto/);
  assert.doesNotMatch(css, /scrollbar-[a-z-]+\s*:/);
  assert.doesNotMatch(css, /::-webkit-scrollbar/);
  assert.doesNotMatch(css, /is-collapsed \[data-tc-waiting-overflow/);
  assert.doesNotMatch(css, /\.grid > \.tc-planner-waiting-layer \{/);
  const waitingHostBlock = css.match(/\.cellContent > \.tc-planner-waiting-host \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(waitingHostBlock, "waiting host should be styled as an in-flow cellContent child");
  assert.match(waitingHostBlock, /overflow(?:-[xy])?:\s*hidden/);
  const waitingItemBlock = css.match(/\.tc-planner-waiting-strip \[data-tc-waiting-item='1'\] \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(waitingItemBlock, "waiting item block should be present");
  assert.match(waitingItemBlock, /cursor:\s*default/);
  assert.match(waitingItemBlock, /touch-action:\s*pan-y/);
  const waitingListBlock = css.match(/\.tc-planner-waiting-strip-list \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(waitingListBlock, "waiting list block should be present");
  assert.match(waitingListBlock, /flex:\s*0 0 auto/);
  assert.match(waitingListBlock, /height:\s*auto/);
  assert.match(waitingListBlock, /min-height:\s*max-content/);
  assert.match(waitingListBlock, /overflow:\s*visible/);
  assert.doesNotMatch(waitingListBlock, /flex-shrink:\s*1/);
  assert.match(css, /--noria-task-time-weight:\s*500;/);
  const finalTimeWeightBlock = css.match(/\.tasksCalendar:is\(\[view='week'\],\[view='day'\]\)\.planner-chrome \.tc-cal-item\[data-has-time='true'\] \.time,\s*\n\.tasksCalendar:is\(\[view='week'\],\[view='day'\]\)\.planner-chrome \.tc-cal-item\[data-has-time='true'\] \.time \.tline \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(finalTimeWeightBlock, "week/day final timed task weight block should be present");
  assert.match(finalTimeWeightBlock, /font-weight:\s*var\(--noria-task-time-weight,\s*500\)/);
  const dayTimeBlock = css.match(/\.tasksCalendar\[view='day'\]\.planner-chrome \.tc-cal-item\[data-has-time='true'\] \.time \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(dayTimeBlock, "day timed task block should be present");
  assert.doesNotMatch(dayTimeBlock, /font-weight:\s*700/);
  assert.match(css, /\.tc-planner-waiting-strip \[data-tc-waiting-item='1'\] \.resize-handle \{[\s\S]*?display:\s*none/);
  const timeLaneBlocks = Array.from(css.matchAll(/\.tasksCalendar\[view='week'\]\.planner-chrome \.timeLane,\s*\n\.tasksCalendar\[view='day'\]\.planner-chrome \.timeLane \{[\s\S]*?\n\}/g)).map((m) => m[0]);
  assert.ok(timeLaneBlocks.length >= 1, "week/day timeLane blocks should be present");
  assert.ok(
    timeLaneBlocks.some((block) => /max-height:\s*calc\(var\(--time-lane-height, 1080px\) \+ var\(--tc-planner-lane-bottom-safe, 24px\)\)/.test(block)),
    "timeLane max-height should include the bottom safe area"
  );
  for (const block of timeLaneBlocks) {
    assert.doesNotMatch(block, /max-height:\s*var\(--time-lane-height/);
  }
  const adaptiveStart = runtime.indexOf("function applyPlannerChromeAdaptiveSizing");
  const adaptiveEnd = runtime.indexOf("function enforcePlannerChromeWeekGridLayout", adaptiveStart);
  assert.ok(adaptiveStart > 0 && adaptiveEnd > adaptiveStart, "planner adaptive sizing body should be found");
  const adaptiveBody = runtime.slice(adaptiveStart, adaptiveEnd);
  assert.match(adaptiveBody, /var bottomPadding = 24;/);
  assert.match(adaptiveBody, /return d === "comfortable" \? 28 : \(d === "tight" \? 24 : 20\);/);
});

test("task calendar week timed lane width is isolated from waiting rows", () => {
  const runtime = fs.readFileSync(pluginPath("views/tasks-calendar/runtime-core.js"), "utf8");
  const css = fs.readFileSync(pluginPath("views/tasks-calendar/default.css"), "utf8");

  const plannerGridEdgeBlock = css.match(/\.tasksCalendar\.planner-chrome:is\(\[view='month'\],\[view='week'\],\[view='day'\]\) > \.grid \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(plannerGridEdgeBlock, "planner grid edge block should be found");
  assert.match(plannerGridEdgeBlock, /width:\s*calc\(100% \+ 8px\)/);
  assert.match(plannerGridEdgeBlock, /box-sizing:\s*border-box/);

  const fitGridBlock = css.match(/\.tasksCalendar:is\(\[view='week'\], \[view='day'\]\)\.planner-chrome\.tc-planner-no-scroll-fit > \.grid \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(fitGridBlock, "no-scroll-fit grid edge block should be found");
  assert.match(fitGridBlock, /width:\s*calc\(100% \+ 8px\)/);
  assert.match(fitGridBlock, /max-width:\s*calc\(100% \+ 8px\)/);

  const weekTodayBlocks = Array.from(css.matchAll(/\.tasksCalendar\[view='week'\]\.planner-chrome \.cell\.today \.cellName \{[\s\S]*?\n\}/g)).map((m) => m[0]);
  const weekTodayBlock = weekTodayBlocks.find((block) => /var\(--text-normal\)/.test(block)) || "";
  assert.ok(weekTodayBlock, "light week today header block should be found");
  assert.match(weekTodayBlock, /color:\s*color-mix\(in srgb,\s*var\(--text-normal\) 78%,\s*var\(--interactive-accent\) 22%\)/);
  for (const block of weekTodayBlocks) {
    assert.match(block, /background:\s*var\(--tc-planner-table-surface-muted\)/);
    assert.match(block, /box-shadow:\s*none/);
    assert.doesNotMatch(block, /inset\s+0\s+2px/);
  }

  const laneBaseBlock = css.match(/\.tasksCalendar\[view='week'\]\.planner-chrome \.timeLane,\s*\n\.tasksCalendar\[view='day'\]\.planner-chrome \.timeLane \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(laneBaseBlock, "week/day timeLane block should be found");
  assert.match(laneBaseBlock, /width:\s*100%/);
  assert.match(laneBaseBlock, /min-width:\s*0/);
  assert.match(laneBaseBlock, /max-width:\s*100%/);
  assert.match(laneBaseBlock, /box-sizing:\s*border-box/);

  const laneOverflowBlock = css.match(/\.tasksCalendar:is\(\[view='week'\],\[view='day'\]\)\.planner-chrome \.timeLane \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(laneOverflowBlock, "week/day timeLane overflow block should be found");
  assert.match(laneOverflowBlock, /overflow-x:\s*clip/);
  assert.match(laneOverflowBlock, /overflow-y:\s*visible/);
  assert.doesNotMatch(laneOverflowBlock, /overflow:\s*visible/);
  const fitOverflowBlock = css.match(/\.tasksCalendar:is\(\[view='week'\], \[view='day'\]\)\.planner-chrome\.tc-planner-no-scroll-fit \.cell,\s*\n\.tasksCalendar:is\(\[view='week'\], \[view='day'\]\)\.planner-chrome\.tc-planner-no-scroll-fit \.cellContent,\s*\n\.tasksCalendar:is\(\[view='week'\], \[view='day'\]\)\.planner-chrome\.tc-planner-no-scroll-fit \.timeLane \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(fitOverflowBlock, "no-scroll-fit overflow block should be found");
  assert.match(fitOverflowBlock, /overflow-x:\s*clip/);
  assert.match(fitOverflowBlock, /overflow-y:\s*visible/);
  assert.doesNotMatch(fitOverflowBlock, /overflow:\s*visible/);

  const timedBlock = css.match(/\.tasksCalendar:is\(\[view='week'\],\[view='day'\]\)\.planner-chrome \.tc-cal-item\[data-slot='range'\],\s*\n\.tasksCalendar:is\(\[view='week'\],\[view='day'\]\)\.planner-chrome \.tc-cal-item\[data-slot='point'\] \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(timedBlock, "timed task width block should be found");
  assert.match(timedBlock, /--tc-planner-task-edge-gap:\s*4px/);
  assert.match(timedBlock, /width:\s*calc\(var\(--ov-width,\s*100%\) - var\(--tc-planner-task-edge-gap\)\)/);
  assert.match(timedBlock, /max-width:\s*calc\(100% - var\(--tc-planner-task-edge-gap\)\)/);
  assert.match(timedBlock, /box-sizing:\s*border-box/);
  assert.doesNotMatch(timedBlock, /width:\s*var\(--ov-width,\s*100%\)\s*;/);

  const waitingHostBlock = css.match(/\.cellContent > \.tc-planner-waiting-host \{[\s\S]*?\n\}/)?.[0] || "";
  const waitingStripBlock = css.match(/\.tc-planner-waiting-strip \{[\s\S]*?\n\}/)?.[0] || "";
  const waitingListBlock = css.match(/\.tc-planner-waiting-strip-list \{[\s\S]*?\n\}/)?.[0] || "";
  for (const [name, block] of [["waiting host", waitingHostBlock], ["waiting strip", waitingStripBlock], ["waiting list", waitingListBlock]]) {
    assert.ok(block, `${name} block should be found`);
    assert.match(block, /width:\s*100%/);
    assert.match(block, /min-width:\s*0/);
    assert.match(block, /max-width:\s*100%/);
    assert.match(block, /box-sizing:\s*border-box/);
  }

  const overlapStart = runtime.indexOf("function applyPlannerChromeOverlapLayout");
  const overlapEnd = runtime.indexOf("var tcWeekAdaptiveStableState", overlapStart);
  assert.ok(overlapStart > 0 && overlapEnd > overlapStart, "overlap layout body should be found");
  const overlapBody = runtime.slice(overlapStart, overlapEnd);
  assert.match(overlapBody, /:scope > \[data-tc-cal-item='1'\]\[data-slot='range'\]/);
  assert.doesNotMatch(overlapBody, /lane\.querySelectorAll\("\[data-tc-cal-item='1'\]\[data-slot='range'\]/);
  assert.doesNotMatch(overlapBody, /\[data-slot='waiting'\]|\[data-slot='none'\]/);
  const singleGroupBranch = overlapBody.match(/if \(group\.length === 1\) \{[\s\S]*?return;\s*\n\t\t\t\}/)?.[0] || "";
  assert.ok(singleGroupBranch, "single overlap group branch should be found");
  assert.doesNotMatch(singleGroupBranch, /--ov-width|--ov-left|data-overlap-cols|data-overlap-col/);

  const normalizeStart = runtime.indexOf("function normalizePlannerChromeWaitingItem");
  const normalizeEnd = runtime.indexOf("function hasPlannerChromeWaitingStandardStructure", normalizeStart);
  assert.ok(normalizeStart > 0 && normalizeEnd > normalizeStart, "waiting normalize body should be found");
  const normalizeBody = runtime.slice(normalizeStart, normalizeEnd);
  assert.match(normalizeBody, /item\.style\.removeProperty\("--ov-left"\)/);
  assert.match(normalizeBody, /item\.style\.removeProperty\("--ov-width"\)/);
  assert.match(normalizeBody, /item\.style\.removeProperty\("left"\)/);
  assert.match(normalizeBody, /item\.style\.removeProperty\("touch-action"\)/);
  assert.match(normalizeBody, /item\.removeAttribute\("draggable"\)/);
  assert.match(normalizeBody, /item\.removeAttribute\("data-drag-bound"\)/);
  assert.match(normalizeBody, /item\.removeAttribute\("data-planner-pointerdown-bound"\)/);
  assert.match(normalizeBody, /item\.querySelectorAll\("\.resize-handle"\)/);

  const pointerStart = runtime.indexOf("function onTaskPointerDown");
  const pointerEnd = runtime.indexOf("function getMetaFromNote", pointerStart);
  assert.ok(pointerStart > 0 && pointerEnd > pointerStart, "pointerdown body should be found");
  const pointerBody = runtime.slice(pointerStart, pointerEnd);
  const waitingSkipIndex = pointerBody.search(/data-slot"\)\s*==\s*"waiting"|data-lane"\)\s*==\s*"waiting"|closest\("\.tc-planner-waiting-strip"\)/);
  const preventIndex = pointerBody.indexOf("ev.preventDefault()");
  assert.ok(waitingSkipIndex >= 0, "pointerdown should skip waiting strip/items");
  assert.ok(preventIndex >= 0 && waitingSkipIndex < preventIndex, "waiting skip should run before preventDefault");

  assert.match(runtime, /function syncPlannerChromeWaitingStripScrollableState/);
  const syncScrollableStart = runtime.indexOf("function syncPlannerChromeWaitingStripScrollableState");
  const syncScrollableEnd = runtime.indexOf("function bindPlannerChromeWaitingStripScrollGuard", syncScrollableStart);
  assert.ok(syncScrollableStart > 0 && syncScrollableEnd > syncScrollableStart, "waiting strip scrollable sync body should be found");
  const syncScrollableBody = runtime.slice(syncScrollableStart, syncScrollableEnd);
  assert.match(syncScrollableBody, /scrollHeight/);
  assert.match(syncScrollableBody, /clientHeight/);
  assert.match(syncScrollableBody, /PLANNER_WAITING_VISIBLE_LIMIT/);
  assert.match(syncScrollableBody, /data-scroll-count/);
  assert.match(syncScrollableBody, /data-scroll-range/);
  assert.match(syncScrollableBody, /itemCount\s*>\s*PLANNER_WAITING_VISIBLE_LIMIT/);
  assert.match(syncScrollableBody, /setAttribute\("data-scrollable",\s*"1"\)/);
  assert.match(syncScrollableBody, /removeAttribute\("data-scrollable"\)/);
  assert.match(syncScrollableBody, /scrollTop\s*=\s*0/);
  assert.match(syncScrollableBody, /itemCount\s*<=\s*PLANNER_WAITING_VISIBLE_LIMIT/);
  assert.doesNotMatch(syncScrollableBody, /maxScroll\s*<=\s*1[\s\S]{0,140}scrollTop\s*=\s*0/);

  const stripStart = runtime.indexOf("function renderPlannerChromeWaitingStrip");
  const stripEnd = runtime.indexOf("function syncPlannerChromeWaitingStripScrollableState", stripStart);
  assert.ok(stripStart > 0 && stripEnd > stripStart, "waiting strip render body should be found");
  const stripBody = runtime.slice(stripStart, stripEnd);
  assert.match(stripBody, /priorScrollState\s*=\s*currentDateKey\s*\?\s*plannerChromeWaitingScrollStateByDate\[currentDateKey\]\s*:\s*null/);
  assert.match(stripBody, /hasExistingWaitingScrollSurface\s*=\s*getPlannerChromeWaitingStripItemCount\(strip\)\s*>\s*0\s*\|\|\s*Number\(strip\.scrollTop \|\| 0\)\s*>\s*0/);
  assert.match(stripBody, /hasExistingWaitingScrollSurface\s*\?\s*\(capturePlannerChromeWaitingStripScroll\(strip\) \|\| priorScrollState\)\s*:\s*priorScrollState/);
  assert.ok(
    stripBody.indexOf("priorScrollState") < stripBody.indexOf("capturePlannerChromeWaitingStripScroll(strip)"),
    "waiting strip should read the date-level scroll cache before capturing an existing DOM surface"
  );
  assert.match(stripBody, /capturePlannerChromeWaitingStripScroll\(strip\)/);
  assert.match(stripBody, /strip\.appendChild\(list\)/);
  assert.match(stripBody, /syncPlannerChromeWaitingStripScrollableState\(strip\)/);
  assert.match(stripBody, /restorePlannerChromeWaitingStripScroll\(strip/);
  assert.match(stripBody, /requestAnimationFrame/);
  assert.doesNotMatch(stripBody, /valid\.length\s*>\s*PLANNER_WAITING_VISIBLE_LIMIT[\s\S]{0,160}data-scrollable/);

  assert.match(runtime, /function bindPlannerChromeWaitingStripScrollGuard/);
  const guardStart = runtime.indexOf("function bindPlannerChromeWaitingStripScrollGuard");
  const guardEnd = runtime.indexOf("function renderPlannerChromeWaitingHostForDate", guardStart);
  assert.ok(guardStart > 0 && guardEnd > guardStart, "waiting strip scroll guard body should be found");
  const guardBody = runtime.slice(guardStart, guardEnd);
  assert.match(guardBody, /WAITING_STRIP_SCROLL_GUARD_VERSION/);
  assert.doesNotMatch(guardBody, /data-tc-waiting-scroll-bound"\)\s*===\s*"1"[\s\S]{0,80}return/);
  assert.match(guardBody, /addEventListener\("wheel"/);
  assert.match(guardBody, /addEventListener\("pointerdown"/);
  assert.match(guardBody, /addEventListener\("mousedown"/);
  assert.match(guardBody, /addEventListener\("touchstart"/);
  assert.match(guardBody, /stopPropagation\(\)/);
  assert.match(guardBody, /syncPlannerChromeWaitingStripScrollableState\(strip\)/);
  assert.match(guardBody, /data-scrollable/);
  assert.match(guardBody, /scrollTop/);
  assert.match(guardBody, /scrollHeight/);
  assert.match(guardBody, /clientHeight/);
  assert.match(guardBody, /deltaY/);
  assert.match(guardBody, /scrollTop\s*=/);
  assert.match(guardBody, /markPlannerChromeWaitingStripUserScrolling\(strip\)/);
  assert.match(guardBody, /capturePlannerChromeWaitingStripScroll\(strip\)/);
  assert.match(guardBody, /addEventListener\("scroll"/);
  assert.match(guardBody, /preventDefault\(\)/);
  const startGuard = guardBody.match(/var onScrollStart = function \(ev\) \{[\s\S]*?\n\t\};/)?.[0] || "";
  assert.ok(startGuard, "waiting scroll start guard should be found");
  assert.match(startGuard, /stopPropagation\(\)/);
  assert.doesNotMatch(startGuard, /preventDefault\(\)/);
  assert.match(normalizeBody, /item\.removeAttribute\("data-overlap-cols"\)/);
  assert.match(normalizeBody, /item\.removeAttribute\("data-overlap-col"\)/);

  assert.match(runtime, /function capturePlannerChromeWaitingScrollState/);
  assert.match(runtime, /function schedulePlannerChromeWaitingRebuildAfterScroll/);
  const rebuildStart = runtime.indexOf("function rebuildPlannerChromeWaitingHostsFromSnapshots");
  const rebuildEnd = runtime.indexOf("function rebuildPlannerChromeWaitingLayerFromSnapshots", rebuildStart);
  assert.ok(rebuildStart > 0 && rebuildEnd > rebuildStart, "waiting host rebuild body should be found");
  const rebuildBody = runtime.slice(rebuildStart, rebuildEnd);
  assert.match(rebuildBody, /capturePlannerChromeWaitingScrollState\(root\)/);
  assert.match(rebuildBody, /hasPlannerChromeWaitingUserScrolling\(root\)/);
  assert.match(rebuildBody, /schedulePlannerChromeWaitingRebuildAfterScroll\(root\)/);
  assert.match(rebuildBody, /return countPlannerChromeWaitingLayerTasks\(root\)/);
  assert.ok(
    rebuildBody.indexOf("hasPlannerChromeWaitingUserScrolling(root)") < rebuildBody.indexOf("host.remove()"),
    "waiting rebuild should skip destructive host removal while the user is scrolling"
  );
});

test("task calendar waiting scroll diagnostics expose cache key and restore outcome", () => {
  const runtime = fs.readFileSync(pluginPath("views/tasks-calendar/runtime-core.js"), "utf8");

  const helperStart = runtime.indexOf("function setPlannerChromeWaitingScrollRestoreState");
  const helperEnd = runtime.indexOf("function capturePlannerChromeWaitingStripScroll", helperStart);
  assert.ok(helperStart > 0 && helperEnd > helperStart, "waiting scroll restore-state helper should be found");
  const helperBody = runtime.slice(helperStart, helperEnd);
  assert.match(helperBody, /data-scroll-restore-state/);
  assert.match(helperBody, /data-scroll-restore-reason/);
  assert.match(helperBody, /data-scroll-restore-top/);

  const captureStart = runtime.indexOf("function capturePlannerChromeWaitingStripScroll");
  const captureEnd = runtime.indexOf("function capturePlannerChromeWaitingScrollState", captureStart);
  assert.ok(captureStart > 0 && captureEnd > captureStart, "waiting scroll capture body should be found");
  const captureBody = runtime.slice(captureStart, captureEnd);
  assert.match(captureBody, /data-scroll-key/);
  assert.match(captureBody, /data-scroll-cache-state/);
  assert.match(captureBody, /data-scroll-cache-top/);
  assert.match(captureBody, /data-scroll-cache-count/);
  assert.match(captureBody, /data-scroll-cache-range/);

  const restoreStart = runtime.indexOf("function restorePlannerChromeWaitingStripScroll");
  const restoreEnd = runtime.indexOf("function markPlannerChromeWaitingStripUserScrolling", restoreStart);
  assert.ok(restoreStart > 0 && restoreEnd > restoreStart, "waiting scroll restore body should be found");
  const restoreBody = runtime.slice(restoreStart, restoreEnd);
  assert.match(restoreBody, /setPlannerChromeWaitingScrollRestoreState\(strip,\s*"missing-cache"/);
  assert.match(restoreBody, /setPlannerChromeWaitingScrollRestoreState\(strip,\s*"pending-geometry"/);
  assert.match(restoreBody, /setPlannerChromeWaitingScrollRestoreState\(strip,\s*"not-scrollable"/);
  assert.match(restoreBody, /setPlannerChromeWaitingScrollRestoreState\(strip,\s*"applied"/);
  assert.match(restoreBody, /data-scroll-restore-source/);
  assert.ok(
    restoreBody.indexOf("pending-geometry") < restoreBody.indexOf("not-scrollable"),
    "first-frame geometry should be diagnosed before generic not-scrollable state"
  );
});

test("week planner routes tasks before the visible axis into the waiting strip before overlap layout", () => {
  const runtime = fs.readFileSync(pluginPath("views/tasks-calendar/runtime-core.js"), "utf8");

  assert.match(runtime, /function shouldRoutePlannerChromeSlotToWaiting\(slot,\s*visibleStartMin\)/);
  const helperStart = runtime.indexOf("function shouldRoutePlannerChromeSlotToWaiting(slot, visibleStartMin)");
  const helperEnd = runtime.indexOf("\nfunction ", helperStart + 10);
  assert.ok(helperStart > 0 && helperEnd > helperStart, "pre-axis routing helper should be found");
  const helperBody = runtime.slice(helperStart, helperEnd);
  assert.match(helperBody, /slot\.slotType\s*===\s*"point"[\s\S]*startMin\s*<\s*dayStart/);
  assert.match(helperBody, /slot\.slotType\s*===\s*"range"[\s\S]*endMin\s*<=\s*dayStart/);

  const renderStart = runtime.indexOf("function renderTasksIntoHost");
  const renderEnd = runtime.indexOf("\nfunction ", renderStart + 10);
  const renderBody = runtime.slice(renderStart, renderEnd);
  assert.match(renderBody, /routeEarlyToWaiting\s*=\s*plannerChromeWeek\s*&&\s*shouldRoutePlannerChromeSlotToWaiting/);
  assert.match(renderBody, /slotEarly\.slotType\s*==\s*"none"\s*\|\|\s*routeEarlyToWaiting/);
  assert.match(renderBody, /dayBucketPlan\.push\(\{\s*task:\s*sorted\[t\],\s*node:\s*null,\s*typ:\s*typ/);
  assert.ok(
    renderBody.indexOf("routeEarlyToWaiting") < renderBody.indexOf("var node = buildTaskElement("),
    "pre-axis tasks should be classified before a timed card is built"
  );
});

test("task calendar day planner axis is an absolute overlay sourced from the time lane", () => {
  const runtime = fs.readFileSync(pluginPath("views/tasks-calendar/runtime-core.js"), "utf8");
  const css = fs.readFileSync(pluginPath("views/tasks-calendar/default.css"), "utf8");

  const axisStart = runtime.indexOf("function applyPlannerChromeTimelineAxis");
  const axisEnd = runtime.indexOf("function applyPlannerChromeAdaptiveSizing", axisStart);
  assert.ok(axisStart > 0 && axisEnd > axisStart, "timeline axis body should be found");
  const axisBody = runtime.slice(axisStart, axisEnd);
  assert.match(axisBody, /firstLane = rootNode\.querySelector\("\.cell \.timeLane"\)/);
  assert.match(axisBody, /rootNode\.style\.setProperty\("--time-axis-top",\s*String\(laneTop\) \+ "px"\)/);
  assert.doesNotMatch(axisBody, /tc-sticky-ruler/);

  const layoutStart = runtime.indexOf("function enforcePlannerChromeWeekGridLayout");
  const layoutEnd = runtime.indexOf("function applyPlannerChromeOverlapLayout", layoutStart);
  assert.ok(layoutStart > 0 && layoutEnd > layoutStart, "planner grid layout body should be found");
  const layoutBody = runtime.slice(layoutStart, layoutEnd);
  assert.match(layoutBody, /cell\.style\.gridColumn = "2"/);
  assert.doesNotMatch(layoutBody, /axis\.style\.(?:gridColumn|gridRow|position|alignSelf|justifySelf)\s*=/);

  const dayGridBlocks = Array.from(css.matchAll(/\.tasksCalendar\[view='day'\]\.planner-chrome \.grid \{[\s\S]*?\n\}/g)).map((m) => m[0]);
  assert.ok(dayGridBlocks.length > 0, "day planner grid CSS blocks should be found");
  assert.ok(
    dayGridBlocks.some((block) => /grid-template-columns:\s*var\(--tc-planner-axis-col\) minmax\(0, 1fr\)/.test(block)),
    "day planner grid should define an axis column and task column"
  );
  for (const block of dayGridBlocks) {
    assert.doesNotMatch(block, /minmax\(280px,\s*1fr\)/);
  }

  const dayAxisBlocks = Array.from(css.matchAll(/\.tasksCalendar\[view='day'\]\.planner-chrome \.grid > \.timeAxisGlobal \{[\s\S]*?\n\}/g)).map((m) => m[0]).join("\n");
  assert.ok(dayAxisBlocks, "day planner axis CSS blocks should be found");
  assert.match(dayAxisBlocks, /position:\s*absolute/);
  assert.match(dayAxisBlocks, /left:\s*0/);
  assert.match(dayAxisBlocks, /top:\s*var\(--time-axis-top,\s*18px\)/);
  assert.match(dayAxisBlocks, /width:\s*var\(--tc-planner-axis-col\)/);
  assert.match(dayAxisBlocks, /height:\s*var\(--tc-planner-lane-visual-height,\s*calc\(var\(--time-lane-height,\s*1080px\) \+ var\(--tc-planner-lane-bottom-safe,\s*24px\)\)\)/);
  assert.doesNotMatch(dayAxisBlocks, /position:\s*sticky|position:\s*relative|max-width:/);
  assert.doesNotMatch(css, /tc-sticky-ruler/);
});

test("task calendar planner finalizer orders waiting, axis, overlap, and now marker reflow", () => {
  const runtime = fs.readFileSync(pluginPath("views/tasks-calendar/runtime-core.js"), "utf8");

  const finalizeStart = runtime.indexOf("function runPlannerChromeWeekLanesFinalize");
  const finalizeEnd = runtime.indexOf("var weekLanesFinalizeForcePending", finalizeStart);
  assert.ok(finalizeStart > 0 && finalizeEnd > finalizeStart, "planner finalizer body should be found");
  const body = runtime.slice(finalizeStart, finalizeEnd);
  const steps = [
    ["waiting host rebuild", body.indexOf("rebuildPlannerChromeWaitingHostsFromSnapshots(rootNode)")],
    ["waiting peek sync", body.indexOf("syncPlannerChromeDayBucketPeekVar(rootNode)")],
    ["grid layout", body.indexOf("enforcePlannerChromeWeekGridLayout()")],
    ["timeline axis", body.indexOf("applyPlannerChromeTimelineAxis()")],
    ["geometry", body.indexOf("normalizePlannerChromeWeekTaskGeometry()")],
    ["overlap", body.indexOf("applyPlannerChromeOverlapLayout()")],
    ["time badge", body.indexOf("syncPlannerChromeWeekTimeBadgeVisibility()")],
    ["now marker", body.indexOf("refreshPlannerChromeNowNeedle()")]
  ];
  for (const [name, idx] of steps) {
    assert.ok(idx >= 0, `${name} step should be present`);
  }
  for (let i = 1; i < steps.length; i++) {
    assert.ok(steps[i - 1][1] < steps[i][1], `${steps[i - 1][0]} should run before ${steps[i][0]}`);
  }
});

test("task calendar drag refresh stays local and item view reload preserves current view anchor", () => {
  const runtime = fs.readFileSync(pluginPath("views/tasks-calendar/runtime-core.js"), "utf8");
  const main = fs.readFileSync(pluginPath("main.js"), "utf8");

  const triggerStart = runtime.indexOf("function triggerTaskFreshRefresh");
  const triggerEnd = runtime.indexOf("/** 拖拽/弹窗保存后延迟合并刷新", triggerStart);
  assert.ok(triggerStart > 0 && triggerEnd > triggerStart, "triggerTaskFreshRefresh body should be found");
  const triggerBody = runtime.slice(triggerStart, triggerEnd);
  assert.doesNotMatch(triggerBody, /requestRefresh\(\s*["']tasks["']/);
  assert.match(triggerBody, /refreshTasksFromFreshSource\("tasks-calendar-write"\)/);
  assert.doesNotMatch(triggerBody, /refreshTasksFromFallbackSource\("tasks-calendar-write"\)/);
  assert.match(triggerBody, /hydrateGridTaskCells\(g\)/);

  const storeStart = runtime.indexOf("function setTaskStoreView");
  const storeEnd = runtime.indexOf("function setTaskStoreEditMode", storeStart);
  assert.ok(storeStart > 0 && storeEnd > storeStart, "task store view body should be found");
  const storeBody = runtime.slice(storeStart, storeEnd);
  assert.match(storeBody, /rootNode\.setAttribute\("data-noria-current-view",\s*taskStore\.view\.mode\)/);
  assert.match(storeBody, /rootNode\.setAttribute\("data-noria-current-anchor",\s*taskStore\.view\.anchorDate\)/);

  assert.match(main, /captureCurrentTasksRuntimeInput\(\)/);
  assert.match(main, /async mountTasksRuntime\(fallbackInput = \{\}\)/);
  assert.match(main, /const input = \{ \.\.\.fallbackInput, \.\.\.this\.plugin\.consumeTasksItemViewInput\(\) \}/);
  assert.match(main, /const fallbackInput = this\.captureCurrentTasksRuntimeInput\(\);[\s\S]*await this\.mountTasksRuntime\(fallbackInput\)/);
});

test("task calendar and timeline use fresh task source for local status refreshes", () => {
  const calendar = fs.readFileSync(pluginPath("views/tasks-calendar/runtime-core.js"), "utf8");
  const timeline = fs.readFileSync(pluginPath("views/tasks-timeline/view.js"), "utf8");

  assert.match(calendar, /function collectFreshTasksForCalendar/);
  assert.match(calendar, /noriaBridge\.data\.getTasks\(/);
  assert.match(calendar, /rangePolicy:\s*["']allFacts["']/);
  assert.match(calendar, /function adaptDataTaskToRuntimeTask/);

  const timelineRefreshStart = timeline.indexOf("function noriaTlQueueLocalRefresh");
  const timelineRefreshEnd = timeline.indexOf("function toBool", timelineRefreshStart);
  assert.ok(timelineRefreshStart > 0 && timelineRefreshEnd > timelineRefreshStart, "timeline local refresh body should be found");
  const timelineRefreshBody = timeline.slice(timelineRefreshStart, timelineRefreshEnd);
  assert.doesNotMatch(timelineRefreshBody, /replaceChildren\(\)/);
  assert.match(timelineRefreshBody, /noriaTlRefreshFromFreshSource/);
  assert.match(timeline, /bridge\.data\.getTasks\(/);
  assert.match(timeline, /rangePolicy:\s*["']allFacts["']/);
});

test("task calendar waiting overdue items do not render legacy warning badges", () => {
  const runtime = fs.readFileSync(pluginPath("views/tasks-calendar/runtime-core.js"), "utf8");
  const css = fs.readFileSync(pluginPath("views/tasks-calendar/default.css"), "utf8");

  assert.match(css, /\.tc-planner-waiting-host[\s\S]{0,120}\.tc-cal-item\.overdue::after/);
  assert.match(css, /\.tc-planner-waiting-host[\s\S]{0,180}\[data-progress-alert='true'\]::after/);
  assert.doesNotMatch(runtime, /taskOverdueIcon/);
  assert.doesNotMatch(runtime, /tasksRemaining\s*>\s*99\)\s*\{[^}]*⚠/);
  assert.doesNotMatch(runtime, /taskOverdueIcon\s*=\s*["'][^"']*[⚠❗!逾期]/);
  assert.doesNotMatch(css, /\.tc-planner-waiting-host[\s\S]{0,240}content:\s*["'][^"']*[⚠❗!逾期]/);
});

test("task calendar filters blank task rows before rendering", () => {
  const runtime = fs.readFileSync(pluginPath("views/tasks-calendar/runtime-core.js"), "utf8");

  assert.match(runtime, /function isRenderableTaskRow/);
  assert.match(runtime, /if \(!isRenderableTaskRow\(sorted\[t\], typ\)\) \{\s*continue;\s*\}/);
  assert.doesNotMatch(runtime, /taskTextPlain = "任务"/);
  assert.doesNotMatch(runtime, /textContent = "任务"/);
  assert.match(runtime, /if \(txt === "任务"\) \{ return true; \}/);
  assert.doesNotMatch(runtime, /[⚠❗]\s*<\/span>|!\s*<\/span>|逾期<\/span>/);
});

test("task calendar month rows share themed checkbox geometry and span alignment", () => {
  const css = fs.readFileSync(pluginPath("views/tasks-calendar/default.css"), "utf8");
  const runtime = fs.readFileSync(pluginPath("views/tasks-calendar/runtime-core.js"), "utf8");
  const monthCellContentBlocks = Array.from(css.matchAll(/\.tasksCalendar\[view='month'\] \.cellContent \{[\s\S]*?\n\}/g)).map((m) => m[0]);
  const monthCellNameBlocks = Array.from(css.matchAll(/\.tasksCalendar\[view='month'\] \.cellName \{[\s\S]*?\n\}/g)).map((m) => m[0]);
  const monthReserveSpacerBlocks = Array.from(css.matchAll(/\.tasksCalendar\[view='month'\] \.cellContent > \.tc-month-reserve-spacer \{[\s\S]*?\n\}/g)).map((m) => m[0]);
  const monthTaskBlocks = Array.from(css.matchAll(/([^{}]+)\{([^{}]+)\}/g))
    .map((match) => ({ selector: match[1].trim(), body: match[2] }))
    .filter(({ selector }) => selector.includes(".tasksCalendar[view='month']"))
    .filter(({ selector }) => /(?:\.tc-cal-item|\[data-tc-cal-item|tc-cal-item--month-compact|tc-month-span-overlay-item)/.test(selector))
    .filter(({ selector }) => !/\.cellName|::-webkit-scrollbar|\.tc-month-dot/.test(selector));
  const timedTaskBlocks = Array.from(css.matchAll(/([^{}]+)\{([^{}]+)\}/g))
    .map((match) => ({ selector: match[1].trim(), body: match[2] }))
    .filter(({ selector }) => selector.includes(".tasksCalendar:is([view='week'],[view='day']).planner-chrome"))
    .filter(({ selector }) => selector.includes("[data-slot='range']"));
  const monthCompactStart = runtime.indexOf("if (monthView && !eisenContentOnly && !spanMultiDay && !isCrossDayRange)");
  const monthCompactEnd = runtime.indexOf("if (monthView && spanMultiDay", monthCompactStart);
  const monthCompactBody = runtime.slice(monthCompactStart, monthCompactEnd);
  const geometryContractStart = css.indexOf("/* Final task-row geometry contract");
  const geometryContractEnd = css.indexOf(".tasksCalendar .tc-cal-item .inner", geometryContractStart);
  const geometryContractBody = css.slice(geometryContractStart, geometryContractEnd);
  const monthTaskCss = monthTaskBlocks.map(({ selector, body }) => `${selector} {${body}}`).join("\n");

  assert.ok(monthCellNameBlocks.length > 0, "month day header blocks should be found");
  assert.ok(
    monthCellNameBlocks.some((block) => (
      /position:\s*absolute/.test(block)
      && /top:\s*2px/.test(block)
      && /z-index:\s*4/.test(block)
    )),
    "month day header should remain an absolute fixed header"
  );
  assert.ok(
    monthCellContentBlocks.some((block) => (
      /position:\s*absolute/.test(block)
      && /top:\s*var\(--tc-month-cell-top-base,\s*24px\)/.test(block)
      && /left:\s*0/.test(block)
      && /right:\s*0/.test(block)
      && /bottom:\s*0/.test(block)
      && /height:\s*auto/.test(block)
      && /min-height:\s*0/.test(block)
      && /max-height:\s*none/.test(block)
    )),
    "month cellContent should be the task scrollport below the fixed day header"
  );
  assert.ok(monthReserveSpacerBlocks.length > 0, "month reserve spacer blocks should be found");
  for (const block of monthReserveSpacerBlocks) {
    assert.doesNotMatch(block, /--tc-month-cell-top-base/);
  }
  assert.ok(
    monthReserveSpacerBlocks.some((block) => (
      /min-height:\s*var\(--tc-month-overlay-reserve-col,\s*var\(--tc-month-overlay-reserve,\s*0px\)\)/.test(block)
      && /height:\s*var\(--tc-month-overlay-reserve-col,\s*var\(--tc-month-overlay-reserve,\s*0px\)\)/.test(block)
    )),
    "month reserve spacer should reserve only cross-day overlay lanes"
  );
  assert.match(css, /--tc-month-row-pad-left:\s*2px/);
  assert.match(css, /--tc-month-row-status-col:\s*14px/);
  assert.match(css, /--tc-month-row-status-size:\s*12px/);
  assert.match(css, /--tc-month-row-status-inset:\s*0px/);
  assert.match(css, /place-items:\s*center/);
  assert.match(css, /place-self:\s*center/);
  assert.match(css, /--tc-month-row-radius:\s*2px/);
  assert.match(css, /--tc-task-row-radius:\s*2px/);
  assert.match(css, /--tc-timed-task-radius:\s*4px/);
  assert.doesNotMatch(css, /--tc-task-row-radius:\s*[6-9]px/);
  assert.doesNotMatch(css, /--tc-month-row-radius:\s*[6-9]px/);
  assert.ok(geometryContractStart > 0 && geometryContractEnd > geometryContractStart, "final task geometry contract should be found");
  assert.match(geometryContractBody, /\.tasksCalendar\[view='week'\]\.planner-chrome \.tc-cal-item:not\(\[data-slot='range'\]\):not\(\[data-slot='point'\]\)/);
  assert.doesNotMatch(geometryContractBody, /\.tasksCalendar\[view='week'\]\.planner-chrome \.tc-cal-item\s*,/);
  assert.ok(monthCompactStart > 0 && monthCompactEnd > monthCompactStart, "month compact task builder should be found");
  assert.match(monthCompactBody, /createElement\("span"\)/);
  assert.match(monthCompactBody, /className = "description tc-month-task-title"/);
  assert.match(monthCompactBody, /setAttribute\("role", "link"\)/);
  assert.doesNotMatch(monthCompactBody, /createElement\("a"\)/);
  assert.doesNotMatch(css, /text-decoration\s*:/);
  assert.ok(
    timedTaskBlocks.some(({ body }) => /border-radius:\s*var\(--tc-timed-task-radius,\s*4px\)/.test(body)),
    "week/day timed task blocks should use the dedicated 4px radius token"
  );
  assert.doesNotMatch(css, /--noria-lab-task-radius/);
  assert.doesNotMatch(runtime, /--noria-lab-task-radius/);
  assert.doesNotMatch(css, /\.tasksCalendar\[view='month'\] \.cellContent > \.tc-cal-item:not\(\[data-tc-month-span="1"\]\),[\s\S]{0,600}?border-radius:\s*[6-9]px/);
  assert.doesNotMatch(css, /\.tasksCalendar\[view='month'\] \.wrappers > \.wrapper \.tc-month-span-overlay \.tc-month-span-overlay-item \{[\s\S]{0,400}?border-radius:\s*[6-9]px/);
  assert.doesNotMatch(css, /width:\s*calc\(100% - 1px\)/);
  assert.doesNotMatch(css, /max-width:\s*calc\(100% - 1px\)/);
  assert.match(css, /--tc-month-row-right-inset:\s*4px/);
  assert.match(css, /width:\s*calc\(100% - var\(--tc-month-row-right-inset, 0px\)\)/);
  assert.ok(monthTaskBlocks.length > 0, "month task CSS blocks should be found");
  assert.doesNotMatch(monthTaskCss, /border-radius:\s*(?:6px|7px|8px)/);
  assert.doesNotMatch(monthTaskCss, /(?:width|max-width):\s*calc\(100% - (?:1px|8px|10px)\)/);
  assert.doesNotMatch(monthTaskCss, /align-items:\s*baseline/);
  assert.match(runtime, /overlayEdgeInset:\s*0/);
  assert.doesNotMatch(runtime, /var defaults = \{[^}]*overlayEdgeInset:\s*8/);
  const insetStart = runtime.indexOf("function getMonthOverlayEndInsetPx");
  const insetEnd = runtime.indexOf("function measureMonthCellVisualRect", insetStart);
  const insetBody = runtime.slice(insetStart, insetEnd);
  assert.ok(insetStart > 0 && insetEnd > insetStart, "month overlay inset helper should be found");
  assert.doesNotMatch(insetBody, /--tc-scrollbar-rail-width|railWidthToken/);
  assert.match(insetBody, /--tc-month-row-right-inset/);
  const geometryStart = runtime.indexOf("function buildMonthSpanGeometry");
  const geometryEnd = runtime.indexOf("function refreshMonthSpanOverlayInPlace", geometryStart);
  const geometryBody = runtime.slice(geometryStart, geometryEnd);
  assert.ok(geometryStart > 0 && geometryEnd > geometryStart, "month span geometry body should be found");
  assert.match(geometryBody, /firstBox\.offsetTop/);
  const measureStart = runtime.indexOf("function measureMonthCellVisualRect");
  const measureEnd = runtime.indexOf("function applyMonthReserveByCol", measureStart);
  const measureBody = runtime.slice(measureStart, measureEnd);
  assert.match(measureBody, /clientWidth/);
  assert.doesNotMatch(runtime, /overlayEdgeInset\) \? metrics\.overlayEdgeInset : 2/);
});

test("task calendar quadrant statistics use the shared range model", () => {
  const runtime = fs.readFileSync(pluginPath("views/tasks-calendar/runtime-core.js"), "utf8");

  assert.match(runtime, /function createTaskCalendarRangeModel/);
  assert.match(runtime, /function createTaskCalendarRangeStats/);
  assert.match(runtime, /function accumulateCurrentTaskRangeStats/);
  assert.match(runtime, /function setStatisticValuesFromRangeStats/);
  assert.match(runtime, /function requestSharedTaskBoardRangeStats/);
  assert.match(runtime, /function inheritEisenhowerGranularityFromView/);
  assert.match(runtime, /var eisenhowerFocusDate = null/);
  assert.match(runtime, /function getEisenhowerFocusDate/);
  assert.match(runtime, /function initializeEisenhowerFocusDateFromView/);
  assert.match(runtime, /function shiftEisenhowerFocusDate/);

  const listStart = runtime.indexOf("function getList");
  const listEnd = runtime.indexOf("\n};", listStart);
  assert.ok(listStart > 0 && listEnd > listStart, "quadrant getList body should be found");
  const listBody = runtime.slice(listStart, listEnd);
  assert.match(listBody, /var focus = getEisenhowerFocusDate\(focusDate/);
  assert.match(listBody, /var rangeModel = createTaskCalendarRangeModel\(focus,\s*eisenhowerGranularity\)/);
  assert.match(listBody, /var rangeStats = createTaskCalendarRangeStats\(\)/);
  assert.match(listBody, /var eisenDayList = rangeModel\.days/);
  assert.match(listBody, /accumulateCurrentTaskRangeStats\(rangeStats,\s*currentDate\)/);
  assert.match(listBody, /setStatisticValuesFromRangeStats\(rangeStats\)/);
  assert.match(listBody, /requestSharedTaskBoardRangeStats\(rangeModel,\s*rangeStats\)/);
  assert.doesNotMatch(listBody, /var dueCounter = 0/);
  assert.doesNotMatch(listBody, /setStatisticValues\(dueCounter/);

  const buttonStart = runtime.indexOf("function setButtonEvents");
  const buttonEnd = runtime.indexOf('rootNode.addEventListener("pointerdown"', buttonStart);
  assert.ok(buttonStart > 0 && buttonEnd > buttonStart, "toolbar event body should be found");
  const buttonBody = runtime.slice(buttonStart, buttonEnd);
  assert.match(buttonBody, /inheritEisenhowerGranularityFromView\(activeView\)/);
  assert.match(buttonBody, /initializeEisenhowerFocusDateFromView\(activeView\)/);
  assert.match(buttonBody, /shiftEisenhowerFocusDate\(-1\)/);
  assert.match(buttonBody, /shiftEisenhowerFocusDate\(1\)/);
  assert.match(buttonBody, /getList\(tasks,\s*getEisenhowerFocusDate\(\)\)/);
  assert.doesNotMatch(buttonBody, /selectedDate = snapSelectedDateToEisenAnchor\(selectedDate\);\s*getList\(tasks,\s*selectedDate\)/);

  const granStart = runtime.indexOf("[\"day\", tcRuntimeT(\"runtime.tasksCalendar.view.shortDay\")]");
  const granEnd = runtime.indexOf("setQuickTimelinePanel", granStart);
  assert.ok(granStart > 0 && granEnd > granStart, "quadrant granularity button setup should be found");
  const granBody = runtime.slice(granStart, granEnd);
  assert.match(granBody, /getList\(tasks,\s*getEisenhowerFocusDate\(\)\)/);
  assert.doesNotMatch(granBody, /selectedDate = snapSelectedDateToEisenAnchor\(selectedDate\)/);
});

test("task calendar now marker uses a grid-level accent clock hand for day and week", () => {
  const runtime = fs.readFileSync(pluginPath("views/tasks-calendar/runtime-core.js"), "utf8");
  const css = fs.readFileSync(pluginPath("views/tasks-calendar/default.css"), "utf8");
  const nowCssStart = css.indexOf("/* 日/周表：当前时刻线");
  const nowCssEnd = css.indexOf("@media (prefers-reduced-motion: reduce)", nowCssStart);
  assert.ok(nowCssStart > 0 && nowCssEnd > nowCssStart, "now marker css body should be found");
  const nowCss = css.slice(nowCssStart, nowCssEnd);

  const needleStart = runtime.indexOf("function refreshPlannerChromeNowNeedle");
  const needleEnd = runtime.indexOf("function renderDayClockOverlay", needleStart);
  assert.ok(needleStart > 0 && needleEnd > needleStart, "now needle render body should be found");
  const needleBody = runtime.slice(needleStart, needleEnd);
  assert.match(needleBody, /data-noria-now-layer", "planner-grid"/);
  assert.match(needleBody, /mount = grid/);
  assert.match(needleBody, /tc-now-needle-dot/);
  assert.match(needleBody, /tc-now-needle-hand/);
  assert.match(needleBody, /tc-now-needle-line/);
  assert.doesNotMatch(needleBody, /tc-now-needle-microclock/);
  assert.doesNotMatch(needleBody, /tc-now-needle-label/);

  const posStart = runtime.indexOf("function refreshPlannerChromeNowOnlyPosition");
  const posEnd = runtime.indexOf("function bindPlannerChromeNowNeedleListeners", posStart);
  assert.ok(posStart > 0 && posEnd > posStart, "now needle position body should be found");
  const posBody = runtime.slice(posStart, posEnd);
  assert.match(posBody, /par\.classList\.contains\("grid"\)/);
  assert.match(posBody, /getPlannerChromeNowTimelinePosition/);
  assert.match(posBody, /needle\.style\.display = "none"/);
  assert.doesNotMatch(posBody, /querySelector\("\.tc-now-needle-label"\)/);
  assert.match(runtime, /function getPlannerChromeNowTimelinePosition/);
  assert.match(runtime, /--time-axis-top/);
  assert.match(runtime, /--time-lane-height/);
  assert.match(runtime, /nowMin < dayStart \|\| nowMin > dayEnd/);

  assert.match(css, /\.tasksCalendar:is\(\[view='week'\], \[view='day'\]\)\.planner-chrome \.grid > \.tc-now-needle \{[\s\S]*z-index:\s*44;/);
  assert.match(css, /\.tasksCalendar\[view='week'\]\.planner-chrome \.grid > \.tc-now-needle \{[\s\S]*--tc-now-needle-left:\s*var\(--tc-planner-week-grid-pad-left\)/);
  assert.match(css, /\.tasksCalendar\[view='day'\]\.planner-chrome \.grid > \.tc-now-needle \{[\s\S]*--tc-now-needle-left:\s*calc\(var\(--tc-planner-axis-col\) \+ var\(--tc-planner-axis-gap\)\)/);
  assert.match(css, /\.tasksCalendar:is\(\[view='week'\], \[view='day'\]\)\.planner-chrome \.grid > \.tc-now-needle \{[\s\S]*left:\s*var\(--tc-now-needle-left\)/);
  assert.match(css, /\.tasksCalendar:is\(\[view='week'\], \[view='day'\]\)\.planner-chrome \.grid > \.tc-now-needle \{[\s\S]*--tc-now-needle-dot-size:\s*8px/);
  assert.match(css, /\.tasksCalendar:is\(\[view='week'\], \[view='day'\]\)\.planner-chrome \.grid > \.tc-now-needle \.tc-now-needle-inner \{[\s\S]*display:\s*flex/);
  assert.match(css, /\.tasksCalendar:is\(\[view='week'\], \[view='day'\]\)\.planner-chrome \.grid > \.tc-now-needle \.tc-now-needle-hand \{[\s\S]*display:\s*flex/);
  assert.match(css, /\.tasksCalendar:is\(\[view='week'\], \[view='day'\]\)\.planner-chrome \.grid > \.tc-now-needle \.tc-now-needle-hand \{[\s\S]*margin-left:\s*calc\(0px - var\(--tc-now-needle-dot-size,\s*8px\)\)/);
  assert.match(css, /\.tasksCalendar:is\(\[view='week'\], \[view='day'\]\)\.planner-chrome \.grid > \.tc-now-needle \.tc-now-needle-line \{[\s\S]*height:\s*1\.5px/);
  assert.match(css, /\.tasksCalendar:is\(\[view='week'\], \[view='day'\]\)\.planner-chrome \.grid > \.tc-now-needle \.tc-now-needle-line \{[\s\S]*background:\s*linear-gradient\(90deg,\s*var\(--interactive-accent\)/);
  assert.match(css, /\.tasksCalendar:is\(\[view='week'\], \[view='day'\]\)\.planner-chrome \.grid > \.tc-now-needle \.tc-now-needle-dot \{[\s\S]*border-radius:\s*50%/);
  assert.match(css, /\.tasksCalendar:is\(\[view='week'\], \[view='day'\]\)\.planner-chrome \.grid > \.tc-now-needle \.tc-now-needle-dot \{[\s\S]*width:\s*8px;[\s\S]*height:\s*8px;/);
  assert.match(css, /\.tasksCalendar:is\(\[view='week'\], \[view='day'\]\)\.planner-chrome \.grid > \.tc-now-needle \.tc-now-needle-dot \{[\s\S]*background:\s*var\(--interactive-accent\)/);
  assert.match(css, /\.tasksCalendar:is\(\[view='week'\], \[view='day'\]\)\.planner-chrome \.grid > \.tc-now-needle \.tc-now-needle-dot \{[\s\S]*box-shadow:\s*0 0 0 2px color-mix\(in srgb,\s*var\(--interactive-accent\) 12%, transparent\)/);
  assert.doesNotMatch(nowCss, /#ef4444/);
  assert.doesNotMatch(nowCss, /#fb7185/);
  assert.doesNotMatch(css, /\.grid > \.tc-now-needle-line/);
  assert.doesNotMatch(css, /\.grid > \.tc-now-needle-dot/);
  assert.doesNotMatch(css, /tc-now-needle-microclock/);
  assert.doesNotMatch(css, /\.timeLane \.tc-now-needle/);
});

test("task calendar period controls use compact borderless mode buttons", () => {
  const runtime = fs.readFileSync(pluginPath("views/tasks-calendar/runtime-core.js"), "utf8");
  const css = fs.readFileSync(pluginPath("views/tasks-calendar/default.css"), "utf8");

  assert.match(runtime, /className:\s*"tc-segmented tc-panel-segment-group"/);
  assert.match(runtime, /eb\.className = "tc-eisen-gran-btn tc-panel-segment-button"/);
  const segmentBlock = css.match(/\.tasksCalendar \.tc-segmented\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(segmentBlock, "task calendar segmented style should exist");
  assert.match(segmentBlock, /background:\s*transparent/);
  assert.match(segmentBlock, /border:\s*0/);
  assert.match(segmentBlock, /box-shadow:\s*none/);
  const buttonBlock = css.match(/\.tasksCalendar \.tc-segmented button\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(buttonBlock, "task calendar segmented button style should exist");
  assert.match(buttonBlock, /border:\s*0/);
  assert.match(buttonBlock, /background:\s*transparent/);
  assert.match(buttonBlock, /background-image:\s*none/);
  assert.match(buttonBlock, /height:\s*var\(--noria-panel-segment-height,\s*28px\)/);
  assert.match(buttonBlock, /font-size:\s*var\(--noria-panel-segment-font-size,\s*13px\)/);
  assert.match(buttonBlock, /font-weight:\s*(?:var\(--noria-panel-segment-weight,\s*)?650/);
  assert.doesNotMatch(buttonBlock, /border-right/);
  const labelBlock = css.match(/\.tasksCalendar \.tc-segmented button \.tc-btn-label\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(labelBlock, "segmented button label should inherit panel-level typography");
  assert.match(labelBlock, /font-size:\s*inherit/);
  assert.match(labelBlock, /font-weight:\s*inherit/);
  const activeBlock = css.match(/\.tasksCalendar\[view='month'\] \.tc-segmented button\.monthView,[\s\S]*?\.tasksCalendar\[view='list'\] \.tc-segmented button\.listView\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(activeBlock, "task calendar active segmented style should exist");
  assert.match(activeBlock, /font-weight:\s*(?:var\(--noria-panel-segment-active-weight,\s*)?720/);
  const eisenBlock = css.match(/\.tasksCalendar \.tc-eisen-granularity\.tc-segmented \.tc-eisen-gran-btn\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(eisenBlock, "Eisenhower segmented button style should exist");
  assert.match(eisenBlock, /font-weight:\s*(?:var\(--noria-panel-segment-weight,\s*)?650/);
  const eisenListButtonBlocks = Array.from(css.matchAll(
    /\.tasksCalendar\[view='list'\] \.eisenMatrixTopBar \.tc-eisen-granularity\.tc-segmented button\s*\{[\s\S]*?\n\}/g
  ), (match) => match[0]);
  assert.ok(eisenListButtonBlocks.length > 0, "list-view Eisenhower button styles should exist");
  eisenListButtonBlocks.forEach((block) => {
    assert.match(block, /height:\s*(?:var\(--noria-panel-segment-height,\s*)?28px/);
    assert.doesNotMatch(block, /height:\s*32px/);
  });
  const plannerButtonBlock = css.match(/\.tasksCalendar \.buttons button\.tc-toolbar-planner,\s*\n\.tasksCalendar \.tc-planner-axis-toggle\.tc-toolbar-planner\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(plannerButtonBlock, "planner toolbar auxiliary button style should exist");
  assert.match(plannerButtonBlock, /height:\s*var\(--noria-panel-segment-height,\s*28px\)/);
  assert.match(plannerButtonBlock, /font-size:\s*var\(--noria-panel-segment-aux-font-size,\s*12\.5px\)/);
  assert.match(plannerButtonBlock, /font-weight:\s*var\(--noria-panel-segment-aux-weight,\s*620\)/);
  assert.match(plannerButtonBlock, /background:\s*transparent/);
});

test("task calendar toolbar actions expose stable diagnostics metadata", () => {
  const runtime = fs.readFileSync(pluginPath("views/tasks-calendar/runtime-core.js"), "utf8");
  const css = fs.readFileSync(pluginPath("views/tasks-calendar/default.css"), "utf8");
  const buttonsStart = runtime.indexOf("function setButtons()");
  const buttonsEnd = runtime.indexOf("function setButtonEvents()", buttonsStart);
  const buttonsBody = runtime.slice(buttonsStart, buttonsEnd);
  const eventsStart = runtime.indexOf("function setButtonEvents()");
  const eventsEnd = runtime.indexOf("rootNode.addEventListener(\"pointerdown\"", eventsStart);
  const eventsBody = runtime.slice(eventsStart, eventsEnd);

  assert.ok(buttonsStart > 0 && buttonsEnd > buttonsStart, "task calendar button creation body should be found");
  assert.ok(eventsStart > 0 && eventsEnd > eventsStart, "task calendar button event body should be found");
  assert.match(runtime, /function setTaskCalendarActionState/);
  assert.match(runtime, /function getTaskCalendarToolbarActionKind/);
  assert.match(runtime, /function decorateTaskCalendarToolbarAction/);
  assert.match(buttonsBody, /decorateTaskCalendarToolbarAction\(viaUi\)/);
  assert.match(buttonsBody, /decorateTaskCalendarToolbarAction\(b\)/);
  assert.match(runtime, /"data-noria-action-source",\s*"tasks-calendar-toolbar"/);
  assert.match(runtime, /"data-noria-action-target-view"/);

  for (const actionKind of [
    "switch-view-month",
    "switch-view-week",
    "switch-view-day",
    "switch-view-list",
    "navigate-previous",
    "navigate-today",
    "navigate-next",
    "open-date-picker",
    "toggle-statistics"
  ]) {
    assert.match(runtime, new RegExp(`"${actionKind}"`), `${actionKind} should be exposed`);
  }

  assert.match(eventsBody, /setTaskCalendarActionState\(btn,\s*"pending"\)/);
  assert.match(eventsBody, /setTaskCalendarActionState\(btn,\s*"ok"\)/);
  assert.match(eventsBody, /setTaskCalendarActionState\(btn,\s*"failed"/);
  assert.match(eventsBody, /setTaskCalendarActionState\(btn,\s*"unavailable"/);
  assert.match(css, /\.tasksCalendar \.buttons button\[data-noria-action-state="pending"\]/);
  assert.match(css, /\.tasksCalendar \.buttons button\[data-noria-action-state="failed"\]/);
  assert.match(css, /\.theme-dark \.tasksCalendar \.buttons button\[data-noria-action-state="failed"\]/);
});

test("task board week navigation follows firstDayOfWeek independently of Moment locale", () => {
  const runtime = fs.readFileSync(pluginPath("views/tasks-calendar/runtime-core.js"), "utf8");
  const todayStart = runtime.indexOf("function navigatePeriodToToday()");
  const todayEnd = runtime.indexOf("function noriaTcMoreCompositeForCal", todayStart);
  const todayBlock = runtime.slice(todayStart, todayEnd);

  assert.match(runtime, /function taskCalendarConfiguredWeekStart\(value\)/);
  assert.match(runtime, /var delta = \(anchor\.day\(\) - firstDay \+ 7\) % 7/);
  assert.match(todayBlock, /selectedDate = taskCalendarConfiguredWeekStart\(moment\(\)\)/);
  assert.doesNotMatch(todayBlock, /startOf\("isoWeek"\)|startOf\("week"\)/);
  assert.match(runtime, /selectedWeek = taskCalendarConfiguredWeekStart\(moment\(\)\)/);
});

test("task board period titles follow the Noria runtime locale", () => {
  const runtime = fs.readFileSync(pluginPath("views/tasks-calendar/runtime-core.js"), "utf8");
  const weekStart = runtime.indexOf("function applyWeekCurrentTitle(week)");
  const weekEnd = runtime.indexOf("function applyDayCurrentTitle(day)", weekStart);
  const weekBlock = runtime.slice(weekStart, weekEnd);
  const dayEnd = runtime.indexOf("function unbindPlannerChromeNowNeedleListeners", weekEnd);
  const dayBlock = runtime.slice(weekEnd, dayEnd);
  const monthStart = runtime.indexOf("function getMonth(tasks, month)");
  const monthEnd = runtime.indexOf("function ", monthStart + 30);
  const monthBlock = runtime.slice(monthStart, monthEnd);

  assert.match(runtime, /function tasksCalendarRuntimeLocale\(\)/);
  assert.match(runtime, /bridgeCfg\.locale[\s\S]*bridgeCfg\.i18n\.locale/);
  assert.match(runtime, /function formatTasksCalendarWeekTitle\(week\)/);
  assert.match(runtime, /wb\.start\.clone\(\)\.add\(3,\s*"days"\)\.isoWeek\(\)/);
  assert.match(runtime, /function formatTasksCalendarDayTitle\(day\)/);
  assert.match(runtime, /function formatTasksCalendarMonthTitle\(month\)/);
  assert.match(weekBlock, /formatTasksCalendarWeekTitle\(week\)/);
  assert.match(dayBlock, /formatTasksCalendarDayTitle\(day\)/);
  assert.match(monthBlock, /formatTasksCalendarMonthTitle\(month\)/);
  assert.match(runtime, /locale === "zh-CN"/);
  assert.match(runtime, /enMonthName/);
  const titleFormatterStart = runtime.indexOf("function formatTasksCalendarWeekTitle(week)");
  const titleFormatterEnd = runtime.indexOf("function formatTasksCalendarDayTitle(day)", titleFormatterStart);
  assert.doesNotMatch(runtime.slice(titleFormatterStart, titleFormatterEnd), /format\("\[W\]w"\)/);
});

test("task board deferred title work cannot overwrite a newer view", () => {
  const runtime = fs.readFileSync(pluginPath("views/tasks-calendar/runtime-core.js"), "utf8");
  const weekStart = runtime.indexOf("function getWeek(tasks, week)");
  const weekEnd = runtime.indexOf("function getDay(tasks, dayAnchor)", weekStart);
  const weekBlock = runtime.slice(weekStart, weekEnd);
  const dayStart = weekEnd;
  const dayEnd = runtime.indexOf("function getList(tasks", dayStart);
  const dayBlock = runtime.slice(dayStart, dayEnd);

  assert.match(
    weekBlock,
    /requestAnimationFrame\(\(\) => \{\s*if \(!rootNode \|\| rootNode\.getAttribute\("view"\) !== "week"\) \{ return; \}/
  );
  assert.match(
    dayBlock,
    /requestAnimationFrame\(function \(\) \{\s*if \(!rootNode \|\| rootNode\.getAttribute\("view"\) !== "day"\) \{ return; \}/
  );
});

test("formal task timeline forwards the Noria locale to its native axis labels", () => {
  const view = fs.readFileSync(pluginPath("views/task-timeline/view.js"), "utf8");

  assert.match(view, /function taskTimelineRuntimeLocale\(\)/);
  assert.match(view, /taskTimelineBridge\.locale[\s\S]*taskTimelineBridge\.i18n\?\.locale/);
  assert.match(view, /function taskTimelineRuntimeMessage\(key, fallback\)/);
  assert.match(view, /runtime\.timeline\.relative\.today/);
  assert.match(view, /locale:\s*taskTimelineRuntimeLocale\(\)/);
  assert.match(view, /todayLabel:\s*taskTimelineRuntimeMessage\(/);
});

test("side task timeline now marker uses the same compact accent pin", () => {
  const timelineView = fs.readFileSync(pluginPath("views/tasks-timeline/view.js"), "utf8");

  assert.match(timelineView, /axis\.createDiv\(\{ cls: "noria-tl-now-pin" \}\)/);
  assert.match(timelineView, /hand\.createDiv\(\{ cls: "noria-tl-now-line" \}\)/);
  assert.match(timelineView, /\.noria-tl-now-pin\{[^}]*width:8px;height:8px;[^}]*background:var\(--interactive-accent\);[^}]*box-shadow:0 0 0 2px color-mix\(in srgb,var\(--interactive-accent\) 12%,transparent\)/);
  assert.match(timelineView, /\.noria-tl-now-hand\{[^}]*margin-left:calc\(var\(--noria-tl-axis-line-offset,0px\) - 5px\)/);
  assert.match(timelineView, /\.noria-tl-now-line\{[^}]*height:1\.5px;[^}]*background:linear-gradient\(90deg,var\(--interactive-accent\),color-mix\(in srgb,var\(--interactive-accent\) 0%,transparent\)\)/);
  assert.doesNotMatch(timelineView, /\.noria-tl-now-pin\{[^}]*width:10px;height:10px/);
});

test("checkbox styling is scoped between diary home and task calendar", () => {
  const globalCss = fs.readFileSync(pluginPath("styles.css"), "utf8");
  const calendarCss = fs.readFileSync(pluginPath("views/tasks-calendar/default.css"), "utf8");
  const calendarRuntime = fs.readFileSync(pluginPath("views/tasks-calendar/runtime-core.js"), "utf8");
  const timelineView = fs.readFileSync(pluginPath("views/tasks-timeline/view.js"), "utf8");
  const homeBootstrap = fs.readFileSync(pluginPath("views/dashboard/home/sections/bootstrap-style/view.js"), "utf8");
  const todayTasks = fs.readFileSync(pluginPath("views/periodic/dashboardTodayTasks.js"), "utf8");
  const projects = fs.readFileSync(pluginPath("views/periodic/dashboardGuideProjects.js"), "utf8");
  const focusPanel = fs.readFileSync(pluginPath("views/periodic/focusPanel.js"), "utf8");
  const habitCheckin = fs.readFileSync(pluginPath("views/periodic/habitCheckin.js"), "utf8");
  const periodicTaskDisplay = fs.readFileSync(pluginPath("views/dashboard/core/utils/task-display.js"), "utf8");

  assert.match(periodicTaskDisplay, /noria-periodic-task-check-slot[\s\S]*task-list-item-checkbox noria-periodic-task-check/);
  assert.match(globalCss, /grid-template-columns:\s*24px minmax\(0, 1fr\)/);
  const periodicSlotBlock = globalCss.match(/\.noria-periodic-task-check-slot\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(periodicSlotBlock, /display:\s*grid/);
  assert.match(periodicSlotBlock, /place-items:\s*center/);
  assert.match(periodicSlotBlock, /overflow:\s*visible/);
  assert.match(periodicSlotBlock, /line-height:\s*0/);
  const periodicCheckBlock = globalCss.match(/\.noria-periodic-task-check\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(periodicCheckBlock, /margin:\s*0/);
  assert.match(periodicCheckBlock, /margin-inline-start:\s*0/);
  assert.match(periodicCheckBlock, /margin-inline-end:\s*0/);
  assert.doesNotMatch(periodicCheckBlock, /appearance\s*:/);
  assert.doesNotMatch(periodicCheckBlock, /\b(?:width|height|inline-size|block-size)\s*:/);
  assert.doesNotMatch(periodicCheckBlock, /\bborder(?:-radius)?\s*:/);
  assert.doesNotMatch(periodicCheckBlock, /accent-color\s*:/);
  assert.doesNotMatch(periodicCheckBlock, /--checkbox/);
  assert.match(globalCss, /\.noria-periodic-task-row\s*\{[\s\S]*overflow:\s*visible/);
  assert.doesNotMatch(homeBootstrap, /--dash-task-check-size|--dash-task-check-border|--dash-task-check-mark-size/);
  assert.doesNotMatch(homeBootstrap, /\.dashboard-task-check \{[\s\S]*inline-size:/);
  assert.doesNotMatch(homeBootstrap, /\.dashboard-task-check \{[\s\S]*border-color:/);
  assert.doesNotMatch([focusPanel, habitCheckin].join("\n"), /dashboard-task-check/);
  assert.doesNotMatch([focusPanel, habitCheckin].join("\n"), /noria-native-checkbox/);
  assert.doesNotMatch(habitCheckin, /width:14px;height:14px/);
  assert.match([homeBootstrap, focusPanel, habitCheckin].join("\n"), /task-list-item-checkbox/);
  assert.doesNotMatch([homeBootstrap, focusPanel, habitCheckin].join("\n"), /width:18px;height:18px/);
  assert.doesNotMatch([homeBootstrap, focusPanel, habitCheckin].join("\n"), /border:2px solid/);
  assert.match([todayTasks, projects].join("\n"), /noria-themed-checkbox/);
  assert.match([todayTasks, projects].join("\n"), /data-state/);
  assert.match(calendarCss, /--tc-board-circle-size:\s*10px/);
  assert.match(calendarRuntime, /function tcMakeNativeTaskCheckbox/);
  assert.match(calendarRuntime, /type = "checkbox"/);
  assert.match(calendarRuntime, /task-list-item-checkbox noria-themed-checkbox noria-themed-checkbox--board tc-compact-checkbox/);
  assert.match(calendarRuntime, /data-tc-compact-checkbox/);
  assert.doesNotMatch(calendarRuntime, /task-list-item-checkbox noria-native-checkbox tc-native-task-checkbox/);
  assert.doesNotMatch(calendarRuntime, /noria-native-checkbox/);
  assert.match(calendarRuntime, /function tcMakeStatusCircle/);
  assert.match(globalCss, /\.noria-themed-checkbox\s*\{[\s\S]*--checkbox-size:\s*14px/);
  assert.match(calendarCss, /\.tasksCalendar \.tc-compact-checkbox\s*\{[\s\S]*--checkbox-size:\s*12px/);
  const compactBlock = calendarCss.match(/\.tasksCalendar \.tc-compact-checkbox\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const checkedBlock = calendarCss.match(/\.tasksCalendar \.tc-compact-checkbox:checked,[\s\S]*?\.tasksCalendar \.tc-compact-checkbox\[data-state="done"\]\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(compactBlock, "task calendar compact checkbox block should exist");
  assert.ok(checkedBlock, "task calendar compact checked block should exist");
  assert.doesNotMatch(compactBlock, /appearance:\s*none/);
  assert.doesNotMatch(compactBlock, /border-radius:/);
  assert.doesNotMatch(compactBlock, /background:/);
  assert.doesNotMatch(checkedBlock, /box-shadow/);
  assert.doesNotMatch(calendarCss, /\.tasksCalendar \.tc-native-task-checkbox\.noria-native-checkbox \{/);
  assert.doesNotMatch(calendarCss, /noria-native-checkbox/);
  assert.match(calendarCss, /\.tasksCalendar:is\(\[view='week'\],\[view='day'\]\)\.planner-chrome \.noria-status-circle \{[\s\S]*width:\s*13px/);
  assert.match(globalCss, /\.noria-tl-toolbar-link--diary-inbox \{[\s\S]*background:\s*transparent/);
  assert.match(globalCss, /border-radius:\s*var\(--clickable-icon-radius, var\(--radius-s, 4px\)\)/);
  const toolbarLinkStart = timelineView.indexOf(".noria-tl-toolbar .noria-tl-toolbar-link{");
  const toolbarLinkEnd = timelineView.indexOf(".noria-tl-toolbar .noria-tl-toolbar-link--diary-inbox", toolbarLinkStart);
  assert.ok(toolbarLinkStart > 0 && toolbarLinkEnd > toolbarLinkStart, "toolbar link style boundary should be found");
  assert.doesNotMatch(timelineView.slice(toolbarLinkStart, toolbarLinkEnd), /border-radius:999px/);
  assert.match(timelineView, /var\(--clickable-icon-radius,var\(--radius-s,4px\)\)/);
});

test("side timeline counter cards use quiet border-only emphasis", () => {
  const timelineView = fs.readFileSync(pluginPath("views/tasks-timeline/view.js"), "utf8");
  const counterBlock = timelineView.match(/\.noria-tl-counter-card\{[^\n]*\}/)?.[0] || "";
  const todoBlock = timelineView.match(/\.noria-tl-counter-card\[data-counter="todo"\]\{[^\n]*\}/)?.[0] || "";
  const overdueBlock = timelineView.match(/\.noria-tl-counter-card\[data-counter="overdue"\]\{[^\n]*\}/)?.[0] || "";
  const unplannedBlock = timelineView.match(/\.noria-tl-counter-card\[data-counter="unplanned"\]\{[^\n]*\}/)?.[0] || "";
  const hoverBlock = timelineView.match(/\.noria-tl-counter-card:hover\{[^\n]*\}/)?.[0] || "";
  const activeBlock = timelineView.match(/\.noria-tl-counter-card\[data-active="1"\]\{[^\n]*\}/)?.[0] || "";
  const focusBlock = timelineView.match(/\.noria-tl-counter-card:focus,[^\n]*\.noria-tl-counter-card:focus-visible\{[^\n]*\}/)?.[0] || "";

  assert.ok(counterBlock, "counter card base style should be found");
  assert.match(counterBlock, /-webkit-appearance:none/);
  assert.match(counterBlock, /appearance:none/);
  assert.match(counterBlock, /border:1px solid color-mix\(in srgb,var\(--background-modifier-border\) 34%,transparent\)/);
  assert.match(counterBlock, /background:transparent/);
  assert.match(counterBlock, /background-image:none/);
  assert.match(counterBlock, /box-shadow:none/);
  assert.match(counterBlock, /outline:0/);
  assert.match(counterBlock, /filter:none/);
  for (const block of [todoBlock, overdueBlock, unplannedBlock]) {
    assert.ok(block, "counter-specific block should be found");
    assert.doesNotMatch(block, /border-color:/);
    assert.doesNotMatch(block, /box-shadow:/);
    assert.doesNotMatch(block, /outline:/);
    assert.doesNotMatch(block, /transform:/);
    assert.doesNotMatch(block, /filter:/);
  }
  assert.ok(hoverBlock, "counter card hover style should be found");
  assert.doesNotMatch(hoverBlock, /transform:/);
  assert.doesNotMatch(hoverBlock, /box-shadow:/);
  assert.doesNotMatch(hoverBlock, /border-color:/);
  assert.doesNotMatch(hoverBlock, /outline:/);
  assert.doesNotMatch(hoverBlock, /filter:/);
  assert.ok(activeBlock, "counter card active style should be found");
  assert.doesNotMatch(activeBlock, /box-shadow:/);
  assert.doesNotMatch(activeBlock, /border-color:/);
  assert.doesNotMatch(activeBlock, /outline:/);
  assert.doesNotMatch(activeBlock, /transform:/);
  assert.doesNotMatch(activeBlock, /filter:/);
  assert.ok(focusBlock, "counter focus override should be found");
  assert.match(focusBlock, /outline:0/);
  assert.match(focusBlock, /box-shadow:none/);
  assert.match(timelineView, /\.noria-tl-counter-card\[data-active="1"\] \.noria-tl-counter-num\{[^\n]*font-weight:680/);
  assert.match(timelineView, /\.noria-tl-counter-card\[data-active="1"\] \.noria-tl-counter-label\{[^\n]*color:var\(--text-normal\)/);
});

test("timeline inbox capture panel is border-light and renders today's inbox list", () => {
  const styles = fs.readFileSync(path.join(pluginRoot, "styles.css"), "utf8");
  const main = fs.readFileSync(path.join(pluginRoot, "src/main.js"), "utf8");
  const panelBlock = styles.match(/\.noria-tl-inline-panel\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const headBlock = styles.match(/\.noria-tl-inline-head\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const headActionsBlock = styles.match(/\.noria-tl-inline-head-actions\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const footerBlock = styles.match(/\.noria-tl-inline-footer\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const focusBlock = styles.match(/\.noria-tl-inline-textarea:focus\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const capturePanelStart = main.indexOf("renderTimelineCapturePanel(body, U");
  const capturePanelEnd = main.indexOf("createTimelineInlineSection", capturePanelStart);
  const capturePanelBody = main.slice(capturePanelStart, capturePanelEnd);

  assert.ok(panelBlock, "inline panel style should exist");
  assert.match(panelBlock, /border:\s*0/);
  assert.match(panelBlock, /background:\s*transparent/);
  assert.ok(headBlock, "inline panel head style should exist");
  assert.match(headBlock, /border-bottom:\s*0/);
  assert.ok(headActionsBlock, "inline panel head action style should exist");
  assert.match(headActionsBlock, /justify-content:\s*flex-end/);
  assert.ok(footerBlock, "inline footer style should exist");
  assert.doesNotMatch(capturePanelBody, /noria-tl-inline-close/);
  assert.match(main, /noria-tl-inline-head-actions/);
  assert.match(capturePanelBody, /options\s*=\s*\{\}/);
  assert.match(capturePanelBody, /const actionHost = options\.actionHost/);
  assert.match(capturePanelBody, /const saveBtn = actionHost\.createEl\("button"/);
  assert.doesNotMatch(capturePanelBody, /footer\.createEl\("button"[\s\S]*noria-tl-inline-primary-btn/);
  assert.match(capturePanelBody, /footer\.createDiv\(\{ cls: "noria-tl-inline-status is-muted" \}\)/);
  assert.ok(focusBlock, "inline textarea focus style should exist");
  assert.doesNotMatch(focusBlock, /box-shadow/);
  assert.match(styles, /\.noria-tl-inline-inbox-list/);
  assert.match(styles, /\.noria-tl-inline-inbox-time/);
  assert.match(main, /renderTimelineTodayInboxList/);
  assert.match(main, /parseDiaryInboxEntries/);
  assert.match(main, /timeline\.inline\.todayInboxEmpty/);
});
