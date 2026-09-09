const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { sourcePath } = require("./source-paths.cjs");

function loadInteractionHooks() {
  const context = { globalThis: null, __NORIA_TASK_TIMELINE_TEST__: true, setTimeout, clearTimeout };
  context.globalThis = context;
  vm.createContext(context);
  ["native-viewport.js", "native-interactions.js"].forEach((name) => {
    const code = fs.readFileSync(sourcePath(`views/task-timeline/${name}`), "utf8");
    vm.runInContext(code, context, { filename: `views/task-timeline/${name}` });
  });
  return {
    viewport: context.__noriaTaskTimelineViewportTestHooks,
    interactions: context.__noriaTaskTimelineInteractionsTestHooks
  };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

class FakeNode {
  constructor(attrs = {}, parent = null) {
    this.attrs = new Map(Object.entries(attrs).map(([key, value]) => [key, String(value)]));
    this.parentElement = parent;
    this.listeners = new Map();
    this.style = {};
    this.className = "";
  }

  getAttribute(name) {
    return this.attrs.has(name) ? this.attrs.get(name) : null;
  }

  setAttribute(name, value) {
    this.attrs.set(name, String(value));
  }

  removeAttribute(name) {
    this.attrs.delete(name);
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type, event = {}) {
    const payload = {
      type,
      target: event.target || this,
      currentTarget: this,
      button: event.button == null ? 0 : event.button,
      clientX: event.clientX == null ? 0 : event.clientX,
      clientY: event.clientY == null ? 0 : event.clientY,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped = true; },
      ...event
    };
    Array.from(this.listeners.get(type) || []).forEach((listener) => listener(payload));
    return payload;
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, right: 300, bottom: 300, width: 300, height: 300 };
  }
}

function viewportState(viewport, options = {}) {
  return viewport.createViewport({
    centerMs: options.centerMs || Date.parse("2026-07-11T12:00:00+08:00"),
    msPerPx: options.msPerPx || 60_000,
    widthPx: options.widthPx || 300,
    minMsPerPx: 1_000,
    maxMsPerPx: 86_400_000,
    zones: options.zones || []
  });
}

function taskFixture(overrides = {}) {
  const startMs = Date.parse("2026-07-11T10:00:00+08:00");
  return {
    taskKey: "task:a",
    startMs,
    endMs: startMs + 2 * 60 * 60 * 1000,
    isInstant: false,
    sourceVersion: "v1",
    ...overrides
  };
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("pointer intents cover pan zoom Today and range selection", () => {
  const { viewport, interactions } = loadInteractionHooks();
  const main = viewportState(viewport);

  const pan = interactions.pointerToTimelineIntent({ action: "pan", viewport: main, originPx: 100, currentPx: 130 });
  assert.equal(pan.type, "viewport-pan");
  assert.ok(pan.viewport.centerMs < main.centerMs);

  const zoom = interactions.pointerToTimelineIntent({ action: "zoom", viewport: main, pointerPx: 72, deltaY: -1 });
  assert.equal(zoom.type, "viewport-zoom");
  assert.equal(zoom.viewport.msPerPx, main.msPerPx / 2);
  assert.ok(Math.abs(viewport.pxToDateMs(zoom.viewport, 72) - viewport.pxToDateMs(main, 72)) <= 1);

  const todayMs = Date.parse("2026-07-12T08:00:00+08:00");
  assert.deepEqual(plain(interactions.pointerToTimelineIntent({ action: "today", nowMs: todayMs })), {
    type: "viewport-center",
    centerMs: todayMs,
    reason: "today"
  });

  const range = interactions.pointerToTimelineIntent({ action: "select-range", viewport: main, originPx: 210, currentPx: 90 });
  assert.equal(range.type, "select-range");
  assert.ok(range.startMs < range.endMs);
});

test("task drag intents snap point and duration moves across days", () => {
  const { viewport, interactions } = loadInteractionHooks();
  const main = viewportState(viewport, { msPerPx: 60_000 });
  const point = taskFixture({ isInstant: true, endMs: null, startMs: Date.parse("2026-07-11T23:40:00+08:00") });
  const movedPoint = interactions.pointerToTimelineIntent({
    action: "task-drag",
    role: "instant",
    task: point,
    viewport: main,
    originPx: 150,
    currentPx: 180,
    snapMinutes: 5
  });
  assert.equal(movedPoint.startMs, Date.parse("2026-07-12T00:10:00+08:00"));
  assert.equal(movedPoint.endMs, null);

  const duration = taskFixture();
  const movedRange = interactions.pointerToTimelineIntent({
    action: "task-drag",
    role: "move",
    task: duration,
    viewport: main,
    originPx: 150,
    currentPx: 225,
    snapMinutes: 5
  });
  assert.equal(movedRange.endMs - movedRange.startMs, duration.endMs - duration.startMs);
  assert.equal(movedRange.startMs, duration.startMs + 75 * 60_000);
});

test("task resize intents enforce snap and minimum duration", () => {
  const { viewport, interactions } = loadInteractionHooks();
  const main = viewportState(viewport, { msPerPx: 60_000 });
  const task = taskFixture();
  const endPx = viewport.dateMsToPx(main, task.endMs);
  const startPx = viewport.dateMsToPx(main, task.startMs);

  const start = interactions.pointerToTimelineIntent({
    action: "task-drag",
    role: "start",
    task,
    viewport: main,
    currentPx: endPx - 2,
    snapMinutes: 5,
    minDurationMinutes: 5
  });
  assert.equal(start.endMs - start.startMs, 5 * 60_000);

  const end = interactions.pointerToTimelineIntent({
    action: "task-drag",
    role: "end",
    task,
    viewport: main,
    currentPx: startPx + 1,
    snapMinutes: 5,
    minDurationMinutes: 5
  });
  assert.equal(end.endMs - end.startMs, 5 * 60_000);
});

test("keyboard intents cover source open pan zoom Today and cancel", () => {
  const { viewport, interactions } = loadInteractionHooks();
  const main = viewportState(viewport);
  assert.equal(interactions.keyboardToTimelineIntent({ key: "Enter", taskKey: "task:a" }).type, "open-source");
  assert.equal(interactions.keyboardToTimelineIntent({ key: " ", taskKey: "task:a" }).type, "open-source");
  assert.equal(interactions.keyboardToTimelineIntent({ key: "+", viewport: main }).type, "viewport-zoom");
  assert.equal(interactions.keyboardToTimelineIntent({ key: "-", viewport: main }).type, "viewport-zoom");
  assert.equal(interactions.keyboardToTimelineIntent({ key: "ArrowLeft", viewport: main }).type, "viewport-pan");
  assert.equal(interactions.keyboardToTimelineIntent({ key: "Home", nowMs: 42 }).centerMs, 42);
  assert.equal(interactions.keyboardToTimelineIntent({ key: "Escape" }).type, "cancel");
});

test("attached controller opens sources by click and keyboard", () => {
  const { viewport, interactions } = loadInteractionHooks();
  const document = new FakeNode();
  const host = new FakeNode();
  host.ownerDocument = document;
  const mainBand = new FakeNode({ "data-noria-timeline-band": "main" }, host);
  const title = new FakeNode({
    "data-noria-task-unit-key": "task:a",
    "data-noria-task-visual-role": "primary-title"
  }, mainBand);
  const opened = [];
  interactions.attachTimelineInteractions(host, {
    document,
    getViewport: () => viewportState(viewport),
    openSource: (intent) => opened.push(intent.taskKey)
  });

  host.emit("click", { target: title });
  host.emit("keydown", { target: title, key: "Enter" });

  assert.deepEqual(opened, ["task:a", "task:a"]);
  interactions.disposeTimelineInteractions(host);
});

test("plain wheel pans the timeline while Ctrl wheel keeps pointer-centered zoom", () => {
  const { viewport, interactions } = loadInteractionHooks();
  const document = new FakeNode();
  const host = new FakeNode();
  host.ownerDocument = document;
  let current = viewportState(viewport);
  const updates = [];
  interactions.attachTimelineInteractions(host, {
    document,
    getViewport: () => current,
    updateViewport: (next, intent) => {
      current = next;
      updates.push(intent);
    }
  });

  const initialCenter = current.centerMs;
  const panEvent = host.emit("wheel", { target: host, deltaY: 96, clientX: 150 });
  assert.equal(updates[0]?.type, "viewport-pan");
  assert.ok(current.centerMs > initialCenter, "scrolling down should browse toward later time");
  assert.equal(panEvent.defaultPrevented, true);
  assert.equal(panEvent.propagationStopped, true);

  const anchorBefore = viewport.pxToDateMs(current, 90);
  const zoomEvent = host.emit("wheel", { target: host, ctrlKey: true, deltaY: -1, clientX: 90 });
  assert.equal(updates[1]?.type, "viewport-zoom");
  assert.ok(Math.abs(viewport.pxToDateMs(current, 90) - anchorBefore) <= 1);
  assert.equal(zoomEvent.defaultPrevented, true);
  assert.equal(zoomEvent.propagationStopped, true);
});

test("unified footer drag pans at the main scale without click recentering or selecting annotations", () => {
  const { viewport, interactions } = loadInteractionHooks();
  const document = new FakeNode();
  const host = new FakeNode();
  const band = new FakeNode({ "data-noria-timeline-band": "overview" }, host);
  const date = new FakeNode({}, band);
  const original = viewportState(viewport);
  let current = original;
  let selections = 0;
  let centers = 0;
  interactions.attachTimelineInteractions(host, {
    document, markMode: true,
    getViewport: () => current,
    getOverviewViewport: () => viewportState(viewport, { msPerPx: 86_400_000 }),
    updateViewport: next => { current = next; },
    centerOn: () => { centers += 1; },
    selectRange: () => { selections += 1; }
  });
  host.emit("pointerdown", { target: date, clientX: 150, pointerId: 1, shiftKey: true });
  document.emit("pointermove", { target: date, clientX: 190, pointerId: 1 });
  document.emit("pointerup", { target: date, clientX: 190, pointerId: 1 });
  host.emit("click", { target: date, clientX: 190 });
  assert.equal(current.centerMs, original.centerMs - 40 * 60_000);
  assert.equal(centers, 0);
  assert.equal(selections, 0);
});

test("background drag exposes one grab state and clears it after panning", () => {
  const { viewport, interactions } = loadInteractionHooks();
  const document = new FakeNode();
  const host = new FakeNode();
  host.ownerDocument = document;
  const band = new FakeNode({ "data-noria-timeline-band": "main" }, host);
  let viewportUpdates = 0;
  interactions.attachTimelineInteractions(host, {
    document,
    getViewport: () => viewportState(viewport),
    updateViewport: () => { viewportUpdates += 1; }
  });

  host.emit("pointerdown", { target: band, clientX: 140, pointerId: 1 });
  assert.equal(host.getAttribute("data-noria-pan-state"), "active");
  document.emit("pointermove", { target: band, clientX: 180, pointerId: 1 });
  document.emit("pointerup", { target: band, clientX: 180, pointerId: 1 });
  assert.ok(viewportUpdates > 0);
  assert.equal(host.getAttribute("data-noria-pan-state"), null);

  const css = fs.readFileSync(sourcePath("views/task-timeline/native.css"), "utf8");
  assert.match(css, /\.noria-task-timeline-native-main\s*\{[^}]*cursor:\s*grab;/s);
  assert.match(css, /\[data-noria-pan-state="active"\][^{]*\.noria-task-timeline-native-main\s*\{[^}]*cursor:\s*grabbing;/s);
});

test("task drag commits exactly once on pointer-up and reports success", async () => {
  const { viewport, interactions } = loadInteractionHooks();
  const document = new FakeNode();
  const host = new FakeNode();
  host.ownerDocument = document;
  const mainBand = new FakeNode({ "data-noria-timeline-band": "main" }, host);
  const taskNode = new FakeNode({ "data-noria-task-unit-key": "task:a" }, mainBand);
  const handle = new FakeNode({
    "data-noria-task-unit-key": "task:a",
    "data-noria-task-handle-role": "move"
  }, taskNode);
  const commits = [];
  const previews = [];
  const rollbacks = [];
  interactions.attachTimelineInteractions(host, {
    document,
    getViewport: () => viewportState(viewport),
    getTask: () => taskFixture(),
    previewTaskTime: (intent) => previews.push(intent),
    cancelTaskPreview: (intent) => rollbacks.push(intent),
    commitTaskTime: async (intent) => { commits.push(intent); return true; }
  });

  host.emit("pointerdown", { target: handle, clientX: 150, pointerId: 1 });
  document.emit("pointermove", { target: handle, clientX: 180, pointerId: 1 });
  document.emit("pointerup", { target: handle, clientX: 210, pointerId: 1 });
  document.emit("pointerup", { target: handle, clientX: 210, pointerId: 1 });
  await flush();

  assert.equal(previews.length, 1);
  assert.equal(commits.length, 1);
  assert.equal(commits[0].startMs, Date.parse("2026-07-11T11:00:00+08:00"));
  assert.equal(taskNode.getAttribute("data-noria-drag-commit-state"), "ok");
  assert.equal(taskNode.getAttribute("data-noria-drag-preview-state"), null);
  assert.equal(rollbacks.length, 0);
});

test("task drag ignores move and release events from another pointer", async () => {
  const { viewport, interactions } = loadInteractionHooks();
  const document = new FakeNode();
  const host = new FakeNode();
  host.ownerDocument = document;
  const band = new FakeNode({ "data-noria-timeline-band": "main" }, host);
  const taskNode = new FakeNode({ "data-noria-task-unit-key": "task:a" }, band);
  const handle = new FakeNode({ "data-noria-task-unit-key": "task:a", "data-noria-task-handle-role": "move" }, taskNode);
  let commits = 0;

  interactions.attachTimelineInteractions(host, {
    document,
    getViewport: () => viewportState(viewport),
    getTask: () => taskFixture(),
    commitTaskTime: () => { commits += 1; }
  });

  host.emit("pointerdown", { target: handle, clientX: 150, pointerId: 7 });
  document.emit("pointermove", { target: handle, clientX: 220, pointerId: 8 });
  document.emit("pointerup", { target: handle, clientX: 220, pointerId: 8 });
  assert.equal(commits, 0);
  assert.equal(taskNode.getAttribute("data-noria-drag-state"), "active");

  document.emit("pointermove", { target: handle, clientX: 220, pointerId: 7 });
  document.emit("pointerup", { target: handle, clientX: 220, pointerId: 7 });
  await flush();
  assert.equal(commits, 1);
});

test("an active pointer session cannot be replaced by another pointerdown", async () => {
  const { viewport, interactions } = loadInteractionHooks();
  const document = new FakeNode();
  const host = new FakeNode();
  host.ownerDocument = document;
  const band = new FakeNode({ "data-noria-timeline-band": "main" }, host);
  const ownerA = new FakeNode({ "data-noria-task-unit-key": "task:a" }, band);
  const ownerB = new FakeNode({ "data-noria-task-unit-key": "task:b" }, band);
  const handleA = new FakeNode({ "data-noria-task-unit-key": "task:a", "data-noria-task-handle-role": "move" }, ownerA);
  const handleB = new FakeNode({ "data-noria-task-unit-key": "task:b", "data-noria-task-handle-role": "move" }, ownerB);
  const commits = [];

  interactions.attachTimelineInteractions(host, {
    document,
    getViewport: () => viewportState(viewport),
    getTask: (taskKey) => taskFixture({ taskKey }),
    commitTaskTime: (intent) => commits.push(intent.taskKey)
  });

  host.emit("pointerdown", { target: handleA, clientX: 150, pointerId: 1 });
  host.emit("pointerdown", { target: handleB, clientX: 160, pointerId: 2 });
  assert.equal(ownerA.getAttribute("data-noria-drag-state"), "active");
  assert.equal(ownerB.getAttribute("data-noria-drag-state"), null);

  document.emit("pointermove", { target: handleA, clientX: 190, pointerId: 1 });
  document.emit("pointerup", { target: handleA, clientX: 190, pointerId: 1 });
  await flush();
  assert.deepEqual(commits, ["task:a"]);
});

test("pending writes serialize another drag of the same task", async () => {
  const { viewport, interactions } = loadInteractionHooks();
  const document = new FakeNode();
  const host = new FakeNode();
  host.ownerDocument = document;
  const band = new FakeNode({ "data-noria-timeline-band": "main" }, host);
  const owner = new FakeNode({ "data-noria-task-unit-key": "task:a" }, band);
  const handle = new FakeNode({ "data-noria-task-unit-key": "task:a", "data-noria-task-handle-role": "move" }, owner);
  const first = deferred();
  let commits = 0;
  interactions.attachTimelineInteractions(host, {
    document,
    getViewport: () => viewportState(viewport),
    getTask: () => taskFixture(),
    commitTaskTime: () => {
      commits += 1;
      return commits === 1 ? first.promise : true;
    }
  });

  host.emit("pointerdown", { target: handle, clientX: 150, pointerId: 1 });
  document.emit("pointermove", { target: handle, clientX: 180, pointerId: 1 });
  document.emit("pointerup", { target: handle, clientX: 180, pointerId: 1 });
  host.emit("pointerdown", { target: handle, clientX: 150, pointerId: 2 });
  document.emit("pointermove", { target: handle, clientX: 200, pointerId: 2 });
  document.emit("pointerup", { target: handle, clientX: 200, pointerId: 2 });
  assert.equal(commits, 1);

  first.resolve(true);
  await flush();
  host.emit("pointerdown", { target: handle, clientX: 150, pointerId: 3 });
  document.emit("pointermove", { target: handle, clientX: 200, pointerId: 3 });
  document.emit("pointerup", { target: handle, clientX: 200, pointerId: 3 });
  await flush();
  assert.equal(commits, 2);
});

test("task drag cancellation stale source and failed commit stay local", async () => {
  const { viewport, interactions } = loadInteractionHooks();
  const run = async ({ cancel = false, stale = false, fail = false }) => {
    const document = new FakeNode();
    const host = new FakeNode();
    host.ownerDocument = document;
    const band = new FakeNode({ "data-noria-timeline-band": "main" }, host);
    const taskNode = new FakeNode({ "data-noria-task-unit-key": "task:a" }, band);
    const handle = new FakeNode({ "data-noria-task-unit-key": "task:a", "data-noria-task-handle-role": "end" }, taskNode);
    let commits = 0;
    const rollbacks = [];
    interactions.attachTimelineInteractions(host, {
      document,
      getViewport: () => viewportState(viewport),
      getTask: () => taskFixture(),
      previewTaskTime: () => {},
      cancelTaskPreview: (intent) => rollbacks.push(intent.reason),
      isSourceCurrent: () => !stale,
      commitTaskTime: () => {
        commits += 1;
        if (fail) throw new Error("write failed");
        return true;
      }
    });
    host.emit("pointerdown", { target: handle, clientX: 150 });
    document.emit("pointermove", { target: handle, clientX: 190 });
    document.emit(cancel ? "pointercancel" : "pointerup", { target: handle, clientX: 190 });
    await flush();
    return { taskNode, commits, rollbacks };
  };

  const cancelled = await run({ cancel: true });
  assert.equal(cancelled.commits, 0);
  assert.equal(cancelled.taskNode.getAttribute("data-noria-drag-commit-state"), "cancelled");
  assert.equal(cancelled.taskNode.getAttribute("data-noria-drag-preview-state"), null);
  assert.deepEqual(cancelled.rollbacks, ["cancelled"]);

  const stale = await run({ stale: true });
  assert.equal(stale.commits, 0);
  assert.equal(stale.taskNode.getAttribute("data-noria-drag-commit-state"), "stale-source");
  assert.equal(stale.taskNode.getAttribute("data-noria-drag-preview-state"), null);
  assert.deepEqual(stale.rollbacks, ["stale-source"]);

  const failed = await run({ fail: true });
  assert.equal(failed.commits, 1);
  assert.equal(failed.taskNode.getAttribute("data-noria-drag-commit-state"), "failed");
  assert.match(failed.taskNode.getAttribute("data-noria-drag-commit-error"), /write failed/);
  assert.equal(failed.taskNode.getAttribute("data-noria-drag-preview-state"), null);
  assert.deepEqual(failed.rollbacks, ["failed"]);
});

test("task surfaces open sources without starting background pan", () => {
  const { viewport, interactions } = loadInteractionHooks();
  const document = new FakeNode();
  const host = new FakeNode();
  host.ownerDocument = document;
  const band = new FakeNode({ "data-noria-timeline-band": "main" }, host);
  const title = new FakeNode({
    "data-noria-task-unit-key": "task:a",
    "data-noria-task-visual-role": "primary-title"
  }, band);
  let pans = 0;
  let opens = 0;
  interactions.attachTimelineInteractions(host, {
    document,
    getViewport: () => viewportState(viewport),
    updateViewport: () => { pans += 1; },
    openSource: () => { opens += 1; }
  });

  host.emit("pointerdown", { target: title, clientX: 120, pointerId: 1 });
  document.emit("pointermove", { target: title, clientX: 180, pointerId: 1 });
  document.emit("pointerup", { target: title, clientX: 180, pointerId: 1 });
  host.emit("click", { target: title });
  assert.equal(pans, 0);
  assert.equal(opens, 1);
});

test("local duration handles open on click but suppress source opening after drag", async () => {
  const { viewport, interactions } = loadInteractionHooks();
  const document = new FakeNode();
  const host = new FakeNode();
  host.ownerDocument = document;
  const band = new FakeNode({ "data-noria-timeline-band": "main" }, host);
  const owner = new FakeNode({ "data-noria-task-group-key": "task:a" }, band);
  const zone = new FakeNode({
    "data-noria-task-unit-key": "task:a",
    "data-noria-task-handle-zone": "local-title"
  }, owner);
  const handle = new FakeNode({
    "data-noria-task-unit-key": "task:a",
    "data-noria-task-handle-role": "move"
  }, owner);
  let opens = 0;
  let commits = 0;
  interactions.attachTimelineInteractions(host, {
    document,
    getViewport: () => viewportState(viewport),
    getTask: () => taskFixture(),
    openSource: () => { opens += 1; },
    commitTaskTime: () => { commits += 1; }
  });

  host.emit("pointerdown", { target: handle, clientX: 150, pointerId: 1 });
  document.emit("pointerup", { target: handle, clientX: 150, pointerId: 1 });
  host.emit("click", { target: handle });
  assert.equal(opens, 1);
  assert.equal(commits, 0);

  host.emit("pointerdown", { target: handle, clientX: 150, pointerId: 2 });
  document.emit("pointermove", { target: handle, clientX: 190, pointerId: 2 });
  document.emit("pointerup", { target: handle, clientX: 190, pointerId: 2 });
  host.emit("click", { target: handle });
  await flush();
  assert.equal(opens, 1);
  assert.equal(commits, 1);

  host.emit("click", { target: zone });
  assert.equal(opens, 2);
});

test("keyboard shortcuts ignore editable targets modifiers and active drags", () => {
  const { viewport, interactions } = loadInteractionHooks();
  const document = new FakeNode();
  const host = new FakeNode();
  host.ownerDocument = document;
  const band = new FakeNode({ "data-noria-timeline-band": "main" }, host);
  const owner = new FakeNode({ "data-noria-task-unit-key": "task:a" }, band);
  const handle = new FakeNode({ "data-noria-task-unit-key": "task:a", "data-noria-task-handle-role": "move" }, owner);
  const input = new FakeNode({}, host);
  input.tagName = "INPUT";
  let viewportUpdates = 0;
  interactions.attachTimelineInteractions(host, {
    document,
    getViewport: () => viewportState(viewport),
    getTask: () => taskFixture(),
    updateViewport: () => { viewportUpdates += 1; }
  });

  const editableKey = host.emit("keydown", { target: input, key: "t" });
  const modifiedKey = host.emit("keydown", { target: host, key: "t", ctrlKey: true });
  host.emit("pointerdown", { target: handle, clientX: 150, pointerId: 1 });
  const dragKey = host.emit("keydown", { target: host, key: "=" });
  const dragWheel = host.emit("wheel", { target: host, ctrlKey: true, deltaY: -1, clientX: 150 });

  assert.equal(viewportUpdates, 0);
  assert.equal(editableKey.defaultPrevented, undefined);
  assert.equal(modifiedKey.defaultPrevented, undefined);
  assert.equal(dragKey.defaultPrevented, undefined);
  assert.equal(dragWheel.defaultPrevented, undefined);
});

test("range selection cancellation removes its preview through the injected service", () => {
  const { viewport, interactions } = loadInteractionHooks();
  const document = new FakeNode();
  const host = new FakeNode();
  host.ownerDocument = document;
  const band = new FakeNode({ "data-noria-timeline-band": "main" }, host);
  const previews = [];
  const cancellations = [];
  interactions.attachTimelineInteractions(host, {
    document,
    getViewport: () => viewportState(viewport),
    previewRange: (intent) => previews.push(intent),
    cancelRangePreview: (intent) => cancellations.push(intent)
  });

  host.emit("pointerdown", { target: band, clientX: 90, pointerId: 1, shiftKey: true });
  document.emit("pointermove", { target: band, clientX: 180, pointerId: 1 });
  document.emit("pointercancel", { target: band, clientX: 180, pointerId: 1 });

  assert.equal(previews.length, 1);
  assert.equal(cancellations.length, 1);
  assert.equal(cancellations[0].phase, "cancel");
  assert.equal(cancellations[0].reason, "cancelled");
});

test("controller disposal is idempotent and removes host listeners", () => {
  const { interactions } = loadInteractionHooks();
  const document = new FakeNode();
  const host = new FakeNode();
  host.ownerDocument = document;
  interactions.attachTimelineInteractions(host, { document });
  interactions.disposeTimelineInteractions(host);
  interactions.disposeTimelineInteractions(host);
  assert.equal(host.__noriaNativeTimelineInteractions, null);
  assert.equal(Array.from(host.listeners.values()).every((listeners) => listeners.size === 0), true);
});

test("phase label activation and endpoint adjustment do not open or move a task", () => {
  const { viewport, interactions } = loadInteractionHooks();
  const document = new FakeNode();
  const host = new FakeNode();
  host.ownerDocument = document;
  const band = new FakeNode({ "data-noria-timeline-band": "main" }, host);
  const label = new FakeNode({ "data-noria-annotation-id": "phase" }, band);
  const handle = new FakeNode({ "data-noria-annotation-id": "phase", "data-noria-annotation-handle": "end" }, label);
  const opened = [], previews = [], cancelled = [];
  interactions.attachTimelineInteractions(host, {
    document, getViewport: () => viewportState(viewport), getAnnotation: () => taskFixture({ id: "phase" }),
    openAnnotation: id => opened.push(id), previewAnnotationRange: intent => previews.push(intent),
    cancelAnnotationRange: intent => cancelled.push(intent),
    openSource() { throw Error("phase interaction must not open a task"); },
    commitTaskTime() { throw Error("phase interaction must not write task dates"); },
    updateViewport() { throw Error("phase interaction must not pan"); }
  });
  host.emit("pointerdown", { target: label, clientX: 150, pointerId: 1 });
  host.emit("click", { target: label });
  host.emit("keydown", { target: label, key: "Enter" });
  assert.deepEqual(opened, ["phase", "phase"]);
  host.emit("pointerdown", { target: handle, clientX: 150, pointerId: 1 });
  document.emit("pointermove", { target: handle, clientX: 180, pointerId: 1 });
  assert.equal(previews[0].annotationId, "phase");
  assert.equal(previews[0].endMs, Date.parse("2026-07-11T12:30:00+08:00"));
  host.emit("keydown", { target: handle, key: "Escape" });
  assert.equal(cancelled[0].endMs, Date.parse("2026-07-11T12:00:00+08:00"));
  interactions.disposeTimelineInteractions(host);
});

test("native interactions remain intent-only and do not write vault files", () => {
  const source = fs.readFileSync(sourcePath("views/task-timeline/native-interactions.js"), "utf8");
  assert.doesNotMatch(source, /vault\.(?:modify|create|delete|rename)|adapter\.write|processFrontMatter/);
});

test("Escape from an editor input cancels the active phase drag before pointer release", () => {
  const { viewport, interactions } = loadInteractionHooks();
  const document = new FakeNode();
  const host = new FakeNode();
  host.ownerDocument = document;
  const band = new FakeNode({ "data-noria-timeline-band": "main" }, host);
  const handle = new FakeNode({ "data-noria-annotation-id": "phase", "data-noria-annotation-handle": "end" }, band);
  const input = new FakeNode({}, document);
  input.tagName = "INPUT";
  const previews = [], cancelled = [];
  interactions.attachTimelineInteractions(host, {
    document, getViewport: () => viewportState(viewport), getAnnotation: () => taskFixture({ id: "phase" }),
    previewAnnotationRange: intent => previews.push(intent), cancelAnnotationRange: intent => cancelled.push(intent)
  });
  host.emit("pointerdown", { target: handle, clientX: 150, pointerId: 1 });
  document.emit("pointermove", { target: handle, clientX: 180, pointerId: 1 });
  const escape = document.emit("keydown", { target: input, key: "Escape" });
  assert.equal(cancelled.length, 1);
  assert.equal(cancelled[0].endMs, Date.parse("2026-07-11T12:00:00+08:00"));
  assert.equal(escape.defaultPrevented, true);
  document.emit("pointerup", { target: handle, clientX: 180, pointerId: 1 });
  assert.equal(previews.length, 1, "pointer release must not reapply a cancelled draft");
  interactions.disposeTimelineInteractions(host);
});

test("native drag handles only capture pointers while their task is active", () => {
  const css = fs.readFileSync(sourcePath("views/task-timeline/native.css"), "utf8");
  assert.match(
    css,
    /\.noria-task-timeline-native-handle\s*\{[^}]*pointer-events:\s*none;/s
  );
  assert.match(
    css,
    /\[data-noria-drag-state="active"\][^{]*\.noria-task-timeline-native-handle\s*\{[^}]*pointer-events:\s*auto;/s
  );
  assert.doesNotMatch(css, /\.noria-task-timeline-native-task-unit:hover\s+\.noria-task-timeline-native-handle/);
  assert.match(css, /\.noria-task-timeline-native-handle-zone:hover\s*~\s*\.noria-task-timeline-native-handle/);
});
