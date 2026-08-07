const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { sourcePath } = require("./source-paths.cjs");

class FakeNode {
  constructor(ownerDocument, tagName = "div", fragment = false) {
    this.ownerDocument = ownerDocument;
    this.tagName = fragment ? "#FRAGMENT" : String(tagName).toUpperCase();
    this.isFragment = fragment;
    this.children = [];
    this.attributes = new Map();
    this.style = {};
    this.className = "";
    this.textContent = "";
    this.parentElement = null;
    this.replaceCount = 0;
  }

  appendChild(node) {
    if (node && node.isFragment) {
      node.children.slice().forEach((child) => this.appendChild(child));
      node.children = [];
      return node;
    }
    this.children.push(node);
    node.parentElement = this;
    return node;
  }

  removeChild(node) {
    const index = this.children.indexOf(node);
    if (index >= 0) this.children.splice(index, 1);
    node.parentElement = null;
    return node;
  }

  remove() {
    if (this.parentElement) this.parentElement.removeChild(this);
  }

  replaceChildren(...nodes) {
    this.replaceCount += 1;
    this.children.forEach((node) => { node.parentElement = null; });
    this.children = [];
    nodes.forEach((node) => this.appendChild(node));
  }

  setAttribute(name, value) {
    this.attributes.set(String(name), String(value));
  }

  getAttribute(name) {
    return this.attributes.has(String(name)) ? this.attributes.get(String(name)) : null;
  }

  removeAttribute(name) {
    this.attributes.delete(String(name));
  }
}

function fakeDocument() {
  const document = {
    createElement(tagName) {
      return new FakeNode(document, tagName);
    },
    createDocumentFragment() {
      return new FakeNode(document, "fragment", true);
    }
  };
  return document;
}

function descendants(node) {
  return (node.children || []).flatMap((child) => [child, ...descendants(child)]);
}

function byAttribute(node, name, value) {
  return descendants(node).filter((child) => {
    const actual = child.getAttribute && child.getAttribute(name);
    return value == null ? actual != null : actual === String(value);
  });
}

function byClass(node, className) {
  return descendants(node).filter((child) => String(child.className || "").split(/\s+/).includes(className));
}

function loadRendererHooks() {
  const context = { globalThis: null, __NORIA_TASK_TIMELINE_TEST__: true };
  context.globalThis = context;
  vm.createContext(context);
  ["native-viewport.js", "native-event-index.js", "native-layout.js", "native-overview.js", "native-renderer.js"].forEach((name) => {
    const code = fs.readFileSync(sourcePath(`views/task-timeline/${name}`), "utf8");
    vm.runInContext(code, context, { filename: `views/task-timeline/${name}` });
  });
  return {
    viewport: context.__noriaTaskTimelineViewportTestHooks,
    layout: context.__noriaTaskTimelineLayoutTestHooks,
    overview: context.__noriaTaskTimelineOverviewTestHooks,
    renderer: context.__noriaTaskTimelineRendererTestHooks
  };
}

function plans(hooks, events) {
  const widthPx = 278;
  const centerMs = Date.parse("2026-07-11T12:00:00+08:00");
  const mainViewport = hooks.viewport.createViewport({ centerMs, msPerPx: 3_600_000 / 12, widthPx });
  const overviewViewport = hooks.viewport.createViewport({ centerMs, msPerPx: 86_400_000 / 20, widthPx });
  const mainPlan = hooks.layout.buildRenderPlan({
    events,
    viewport: mainViewport,
    widthPx,
    heightPx: 285,
    measureText: (text) => String(text || "").length * 8
  });
  mainPlan.dateTicks = [
    { date: "2026-07-11", label: "Jul 11", px: 90 },
    { date: "2026-07-12", label: "Jul 12", px: 210 }
  ];
  mainPlan.weekendWashes = [{ key: "2026-07-11", bounds: { left: 80, top: 0, width: 60, height: 285 } }];
  mainPlan.markers = [
    { kind: "today", text: "", bounds: { left: 80, top: 0, width: 60, height: 281 } },
    { kind: "now", text: "", bounds: { left: 138, top: 0, width: 2, height: 285 } }
  ];
  const overviewPlan = hooks.overview.buildOverviewPlan({
    events,
    mainViewport,
    overviewViewport,
    widthPx,
    heightPx: 75,
    now: "2026-07-11T12:30:00+08:00"
  });
  return { mainPlan, overviewPlan };
}

function taskEvents() {
  return [
    { id: "task:point", taskKey: "task:point", layer: "task", title: "AMR 三维欧拉", start: "2026-07-11T11:00:00+08:00", isInstant: true, status: "todo" },
    { id: "task:range", taskKey: "task:range", layer: "task", title: "完成二阶分析", start: "2026-07-11T12:00:00+08:00", end: "2026-07-11T14:00:00+08:00", isInstant: false, status: "done" }
  ];
}

test("native renderer emits the accepted two-band compatibility DOM", () => {
  const hooks = loadRendererHooks();
  const document = fakeDocument();
  const container = document.createElement("div");
  const host = hooks.renderer.createNativeTimelineHost(container);
  const model = plans(hooks, taskEvents());

  hooks.renderer.renderNativeTimeline(host, { ...model, state: "ready" });

  assert.equal(host.getAttribute("data-noria-timeline-backend"), "native");
  assert.equal(byAttribute(host, "data-noria-timeline-band", "main").length, 1);
  assert.equal(byAttribute(host, "data-noria-timeline-band", "overview").length, 1);
  assert.equal(byClass(host, "timeline-event-label").length, 2);
  assert.equal(byClass(host, "timeline-event-icon").length, 1);
  assert.equal(byClass(host, "timeline-event-tape").length, 1);
  assert.equal(byAttribute(host, "data-noria-task-visual-role", "primary-title").length, 1);
  assert.equal(byAttribute(host, "data-noria-task-visual-role", "primary-range-title").length, 1);
  assert.equal(byAttribute(host, "data-noria-task-handle-role", "start").length, 1);
  assert.equal(byAttribute(host, "data-noria-task-handle-role", "end").length, 1);
  assert.equal(byAttribute(host, "data-noria-task-handle-zone", "local-title").length, 1);
  assert.equal(byAttribute(host, "data-noria-tick-date").length >= 2, true);
  assert.equal(byAttribute(host, "data-noria-timeline-marker", "today").length, 2);
  assert.equal(byAttribute(host, "data-noria-timeline-marker", "now").length, 1);
  assert.equal(byClass(host, "noria-task-timeline-native-weekend").length, 1);
  assert.equal(byAttribute(host, "role", "button").length, 2);
  assert.equal(byAttribute(host, "tabindex", "0").length, 2);
  const point = byClass(host, "noria-task-timeline-native-point")[0];
  const rangeTitle = byAttribute(host, "data-noria-task-visual-role", "primary-range-title")[0];
  const rangeRail = byAttribute(host, "data-noria-task-visual-role", "duration-rail")[0];
  const handleZone = byAttribute(host, "data-noria-task-handle-zone", "local-title")[0];
  const rangeMoveHandle = handleZone.parentElement.children.find((node) => node.getAttribute("data-noria-task-handle-role") === "move");
  assert.equal(point.getAttribute("aria-hidden"), "true");
  assert.equal(point.getAttribute("role"), null);
  assert.equal(point.getAttribute("tabindex"), null);
  assert.equal(point.getAttribute("aria-label"), null);
  assert.equal(rangeTitle.style.height, "16px");
  assert.equal(rangeTitle.style.transform || "", "");
  assert.equal(rangeRail.style.height, "2px");
  assert.equal(rangeRail.getAttribute("data-noria-source-action"), null);
  assert.equal(handleZone.getAttribute("aria-hidden"), "true");
  assert.equal(handleZone.style.top, rangeTitle.style.top);
  assert.equal(handleZone.style.height, rangeTitle.style.height);
  assert.equal(rangeMoveHandle.style.top, rangeTitle.style.top);
  assert.equal(rangeMoveHandle.style.height, rangeTitle.style.height);
});

test("native renderer builds the initial surface through one fragment commit", () => {
  const hooks = loadRendererHooks();
  const document = fakeDocument();
  const container = document.createElement("div");
  const host = hooks.renderer.createNativeTimelineHost(container);

  hooks.renderer.renderNativeTimeline(host, { ...plans(hooks, taskEvents()), state: "ready" });

  assert.equal(host.replaceCount, 1);
  assert.equal(host.children.length, 2);
});

test("native renderer consumes range title rail and handle bounds only from layout", () => {
  const hooks = loadRendererHooks();
  const document = fakeDocument();
  const host = hooks.renderer.createNativeTimelineHost(document.createElement("div"));
  const model = plans(hooks, [taskEvents()[1]]);
  const unit = model.mainPlan.taskUnits[0];
  model.mainPlan.densityWidthPx = 586;
  model.mainPlan.heightPx = 717;

  hooks.renderer.renderNativeTimeline(host, { ...model, state: "ready" });

  const rangeTitle = byAttribute(host, "data-noria-task-visual-role", "primary-range-title")[0];
  const rangeRail = byAttribute(host, "data-noria-task-visual-role", "duration-rail")[0];
  const handleZone = byAttribute(host, "data-noria-task-handle-zone", "local-title")[0];
  assert.equal(host.getAttribute("data-noria-timeline-density"), "wide");
  assert.equal(rangeTitle.style.left, `${unit.title.bounds.left}px`);
  assert.equal(rangeTitle.style.top, `${unit.title.bounds.top}px`);
  assert.equal(rangeTitle.style.width, `${unit.title.bounds.width}px`);
  assert.equal(rangeTitle.style.height, `${unit.title.bounds.height}px`);
  assert.equal(rangeRail.style.left, `${unit.rail.bounds.left}px`);
  assert.equal(rangeRail.style.top, `${unit.rail.bounds.top}px`);
  assert.equal(rangeRail.style.width, `${unit.rail.bounds.width}px`);
  assert.equal(rangeRail.style.height, `${unit.rail.bounds.height}px`);
  assert.equal(handleZone.style.left, `${unit.title.bounds.left}px`);
  assert.equal(handleZone.style.top, `${unit.title.bounds.top}px`);
  assert.equal(handleZone.style.width, `${unit.title.bounds.width}px`);
  assert.equal(handleZone.style.height, `${unit.title.bounds.height}px`);
});

test("native layout degrades saturated 280 and 320px lanes without overlapping visible titles", () => {
  const hooks = loadRendererHooks();
  const centerMs = Date.parse("2026-07-11T12:00:00+08:00");
  for (const widthPx of [280, 320]) {
    const viewport = hooks.viewport.createViewport({ centerMs, msPerPx: 3_600_000 / 12, widthPx });
    const heightPx = 96;
    const metrics = { safeTopPx: 24, safeBottomPx: 10, titleHeightPx: 16, laneStepPx: 22 };
    const maxLane = Math.floor((heightPx - metrics.safeBottomPx - metrics.safeTopPx - metrics.titleHeightPx) / metrics.laneStepPx);
    const events = Array.from({ length: maxLane + 2 }, (_, index) => ({
      id: `task:dense:${index}`,
      taskKey: `task:dense:${index}`,
      layer: "task",
      title: `Dense task ${index}`,
      start: "2026-07-11T12:00:00+08:00",
      isInstant: true,
      status: "todo"
    }));
    const build = () => hooks.layout.buildRenderPlan({
      events,
      viewport,
      widthPx,
      heightPx,
      measureText: () => 96
    });
    const plan = build();
    const repeated = build();
    const visible = plan.taskUnits.filter((unit) => unit.title.visible !== false);
    const hidden = plan.taskUnits.filter((unit) => unit.title.visible === false);

    assert.equal(plan.taskUnits.length, events.length);
    assert.equal(visible.length, maxLane + 1);
    assert.equal(hidden.length, 1);
    assert.equal(plan.taskUnits.filter((unit) => unit.point.visible).length, events.length);
    assert.equal(hooks.layout.findLayoutCollisions(plan).length, 0);
    assert.deepEqual(
      Array.from(plan.taskUnits, (unit) => [unit.taskKey, unit.title.visible]),
      Array.from(repeated.taskUnits, (unit) => [unit.taskKey, unit.title.visible])
    );
  }
});

test("native timeline typography grows in discrete normal and wide density steps", () => {
  const css = fs.readFileSync(sourcePath("src/runtime/views/task-timeline/native.css"), "utf8");

  assert.match(css, /--noria-task-timeline-title-size:\s*11px/);
  assert.match(css, /data-noria-timeline-density="normal"[\s\S]{0,220}--noria-task-timeline-title-size:\s*12px/);
  assert.match(css, /data-noria-timeline-density="wide"[\s\S]{0,220}--noria-task-timeline-title-size:\s*12px/);
  assert.match(css, /--noria-task-timeline-range-title-size:\s*11px/);
  assert.match(css, /font-size:\s*var\(--noria-task-timeline-title-size\)/);
  assert.match(css, /font-size:\s*var\(--noria-task-timeline-range-title-size\)/);
});

test("native hidden titles use the standard hidden-state display rule", () => {
  const css = fs.readFileSync(sourcePath("src/runtime/views/task-timeline/native.css"), "utf8");

  assert.match(
    css,
    /\.noria-task-timeline-native-title\[hidden\]\s*\{[\s\S]{0,80}display:\s*none\s*;/
  );
});

test("native renderer updates keyed task nodes without replacing the bands", () => {
  const hooks = loadRendererHooks();
  const document = fakeDocument();
  const host = hooks.renderer.createNativeTimelineHost(document.createElement("div"));
  hooks.renderer.renderNativeTimeline(host, { ...plans(hooks, taskEvents()), state: "ready" });
  const mainBand = byAttribute(host, "data-noria-timeline-band", "main")[0];
  const pointTitle = byAttribute(host, "data-noria-task-unit-key", "task:point")
    .find((node) => node.getAttribute("data-noria-task-visual-role") === "primary-title");
  const nextEvents = [
    { ...taskEvents()[0], title: "AMR 三维欧拉更新" },
    { id: "task:new", taskKey: "task:new", layer: "task", title: "新任务", start: "2026-07-11T13:00:00+08:00", isInstant: true, status: "todo" }
  ];

  hooks.renderer.updateNativeTimeline(host, { ...plans(hooks, nextEvents), state: "ready" });

  const updatedTitle = byAttribute(host, "data-noria-task-unit-key", "task:point")
    .find((node) => node.getAttribute("data-noria-task-visual-role") === "primary-title");
  assert.equal(byAttribute(host, "data-noria-timeline-band", "main")[0], mainBand);
  assert.equal(updatedTitle, pointTitle);
  assert.equal(updatedTitle.textContent, "AMR 三维欧拉更新");
  assert.equal(byAttribute(host, "data-noria-task-unit-key", "task:range").length, 0);
  assert.ok(byAttribute(host, "data-noria-task-unit-key", "task:new").length > 0);
});

test("native renderer owns quiet loading empty and error state surfaces", () => {
  const hooks = loadRendererHooks();
  const document = fakeDocument();
  const host = hooks.renderer.createNativeTimelineHost(document.createElement("div"));
  const model = plans(hooks, []);

  hooks.renderer.renderNativeTimeline(host, { ...model, state: "loading", message: "Loading timeline" });
  assert.equal(byAttribute(host, "data-noria-timeline-state", "loading").length, 1);
  hooks.renderer.updateNativeTimeline(host, { ...model, state: "empty", message: "No timeline events" });
  assert.equal(byAttribute(host, "data-noria-timeline-state", "empty").length, 1);
  hooks.renderer.updateNativeTimeline(host, { ...model, state: "error", message: "Timeline unavailable" });
  assert.equal(byAttribute(host, "data-noria-timeline-state", "error").length, 1);
});

test("native renderer can defer visible state messaging to the existing timeline shell", () => {
  const hooks = loadRendererHooks();
  const document = fakeDocument();
  const host = hooks.renderer.createNativeTimelineHost(document.createElement("div"));
  const model = plans(hooks, []);

  hooks.renderer.renderNativeTimeline(host, {
    ...model,
    state: "empty",
    message: "No timeline events",
    showStateMessage: false
  });

  assert.equal(host.getAttribute("data-noria-timeline-state"), "empty");
  assert.equal(byAttribute(host, "data-noria-timeline-state", "empty").length, 0);
});

test("native renderer disposes idempotently and releases keyed state", () => {
  const hooks = loadRendererHooks();
  const document = fakeDocument();
  const host = hooks.renderer.createNativeTimelineHost(document.createElement("div"));
  hooks.renderer.renderNativeTimeline(host, { ...plans(hooks, taskEvents()), state: "ready" });

  hooks.renderer.disposeNativeTimeline(host);
  hooks.renderer.disposeNativeTimeline(host);

  assert.equal(host.children.length, 0);
  assert.equal(host.getAttribute("data-noria-timeline-disposed"), "true");
  assert.equal(host.__noriaNativeTimelineState, null);
});

test("native renderer stylesheet reuses accepted Noria timeline tokens", () => {
  const css = fs.readFileSync(sourcePath("views/task-timeline/native.css"), "utf8");
  assert.match(css, /\.noria-task-timeline-native-root/);
  assert.match(css, /--noria-task-timeline-time-band/);
  assert.match(css, /--noria-task-timeline-overview-band/);
  assert.match(css, /--noria-task-timeline-task-blue/);
  assert.match(css, /--noria-task-timeline-now-cursor/);
  assert.doesNotMatch(css, /linear-gradient|radial-gradient|box-shadow:\s*0\s+[2-9]px/i);
});
