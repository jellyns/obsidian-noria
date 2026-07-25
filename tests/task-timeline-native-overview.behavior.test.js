const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { sourcePath } = require("./source-paths.cjs");

class FakeNode {
  constructor(ownerDocument, tagName = "div") {
    this.ownerDocument = ownerDocument;
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.attributes = new Map();
    this.style = {};
    this.className = "";
    this.textContent = "";
    this.hidden = false;
    this._rect = { left: 0, top: 0, width: 0, height: 0 };
  }

  appendChild(node) {
    this.children.push(node);
    node.parentElement = this;
    return node;
  }

  replaceChildren(...nodes) {
    this.children = [];
    nodes.forEach((node) => this.appendChild(node));
  }

  setAttribute(name, value) {
    this.attributes.set(String(name), String(value));
  }

  getAttribute(name) {
    return this.attributes.has(String(name)) ? this.attributes.get(String(name)) : null;
  }

  getBoundingClientRect() {
    return {
      ...this._rect,
      right: this._rect.left + this._rect.width,
      bottom: this._rect.top + this._rect.height
    };
  }
}

function fakeDocument() {
  const document = {
    createElement(tagName) {
      return new FakeNode(document, tagName);
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

function loadOverviewHooks() {
  const context = { globalThis: null, __NORIA_TASK_TIMELINE_TEST__: true };
  context.globalThis = context;
  vm.createContext(context);
  ["native-viewport.js", "native-event-index.js", "native-overview.js"].forEach((name) => {
    const code = fs.readFileSync(sourcePath(`views/task-timeline/${name}`), "utf8");
    vm.runInContext(code, context, { filename: `views/task-timeline/${name}` });
  });
  return {
    viewport: context.__noriaTaskTimelineViewportTestHooks,
    overview: context.__noriaTaskTimelineOverviewTestHooks
  };
}

function fixture() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "task-timeline-native-events.json"), "utf8"));
}

function viewports(viewport, widthPx = 278) {
  const centerMs = Date.parse("2026-07-11T12:00:00+08:00");
  return {
    main: viewport.createViewport({ centerMs, msPerPx: 3_600_000 / 12, widthPx }),
    overview: viewport.createViewport({ centerMs, msPerPx: 86_400_000 / 20, widthPx })
  };
}

test("native overview reproduces the accepted bottom-band dimensions and semantic layers", () => {
  const { viewport, overview } = loadOverviewHooks();
  const states = viewports(viewport);
  const plan = overview.buildOverviewPlan({
    events: fixture().events,
    mainViewport: states.main,
    overviewViewport: states.overview,
    widthPx: 278,
    totalHeightPx: 360,
    now: "2026-07-11T12:30:00+08:00"
  });

  assert.equal(plan.widthPx, 278);
  assert.ok(Math.abs(plan.heightPx - 86.4) <= 0.01);
  assert.equal(plan.zIndex.info, 118);
  assert.equal(plan.contextLabels.filter((item) => item.role === "today").length, 0);
  assert.equal(plan.todayMarker?.label, undefined);
  assert.ok(Number.isFinite(plan.todayMarker?.x));
  assert.ok(plan.dateTicks.length >= 2);
  assert.ok(plan.eventItems.some((item) => item.layer === "task" && item.type === "tick"));
  assert.ok(plan.eventItems.some((item) => item.layer === "task" && item.type === "segment"));
  assert.ok(plan.eventItems.some((item) => item.layer === "annotation"));
  assert.ok(plan.eventItems.some((item) => item.layer === "git"));
  assert.ok(plan.viewportWindow.widthPx > 0);
  assert.ok(plan.viewportWindow.leftPx < plan.viewportWindow.rightPx);
  assert.equal(plan.viewportWindow.heightPx, plan.heightPx - 4);
});

test("native overview localizes date and month labels while keeping Today marker text-free", () => {
  const { viewport, overview } = loadOverviewHooks();
  const states = viewports(viewport);
  const common = {
    events: [],
    mainViewport: states.main,
    overviewViewport: states.overview,
    widthPx: 278,
    heightPx: 75,
    now: "2026-07-11T12:30:00+08:00"
  };

  const english = overview.buildOverviewPlan({ ...common, locale: "en", todayLabel: "Today" });
  const chinese = overview.buildOverviewPlan({ ...common, locale: "zh-CN", todayLabel: "今日" });

  assert.ok(english.dateTicks.some((item) => /Jul\s+\d+/.test(item.label)));
  assert.ok(english.contextLabels.some((item) => item.role === "month" && item.label === "Jul"));
  assert.equal(english.contextLabels.some((item) => item.role === "today"), false);
  assert.equal(english.todayMarker?.label, undefined);
  assert.ok(chinese.dateTicks.some((item) => /7月\d+日/.test(item.label)));
  assert.ok(chinese.contextLabels.some((item) => item.role === "month" && item.label === "7月"));
  assert.equal(chinese.contextLabels.some((item) => item.role === "today"), false);
  assert.equal(chinese.todayMarker?.label, undefined);
  assert.equal(chinese.todayMarker?.x, english.todayMarker?.x);
});

test("native overview consumes only the already-filtered event array", () => {
  const { viewport, overview } = loadOverviewHooks();
  const states = viewports(viewport);
  const filtered = fixture().events.filter((event) => event.layer === "annotation");
  const plan = overview.buildOverviewPlan({
    events: filtered,
    mainViewport: states.main,
    overviewViewport: states.overview,
    widthPx: 278,
    heightPx: 75,
    now: "2026-07-11T12:30:00+08:00"
  });

  assert.equal(plan.heightPx, 75);
  assert.deepEqual(Array.from(new Set(plan.eventItems.map((item) => item.layer))), ["annotation"]);
  assert.equal(plan.eventItems.some((item) => item.layer === "task"), false);
});

test("native overview keeps duration segments on the accepted 20px information lane", () => {
  const { viewport, overview } = loadOverviewHooks();
  const states = viewports(viewport);
  const plan = overview.buildOverviewPlan({
    events: [{
      id: "duration",
      layer: "task",
      start: "2026-07-11T09:00:00+08:00",
      end: "2026-07-11T10:00:00+08:00"
    }],
    mainViewport: states.main,
    overviewViewport: states.overview,
    widthPx: 278,
    heightPx: 72,
    now: "2026-07-11T12:30:00+08:00"
  });

  assert.equal(plan.eventItems[0].bounds.top, 20);
});

test("native overview can render a buffered coordinate surface from a narrower visible range", () => {
  const { viewport, overview } = loadOverviewHooks();
  const states = viewports(viewport);
  const visibleRange = {
    startMs: Date.parse("2026-07-11T00:00:00+08:00"),
    endMs: Date.parse("2026-07-12T00:00:00+08:00")
  };
  const plan = overview.buildOverviewPlan({
    events: [
      { id: "inside", layer: "task", start: "2026-07-11T12:00:00+08:00", isInstant: true },
      { id: "buffer-only", layer: "task", start: "2026-07-06T12:00:00+08:00", isInstant: true }
    ],
    mainViewport: states.main,
    overviewViewport: states.overview,
    visibleRange,
    widthPx: 278,
    heightPx: 75,
    now: "2026-07-11T12:30:00+08:00"
  });

  assert.deepEqual(JSON.parse(JSON.stringify(plan.visibleRange)), visibleRange);
  assert.deepEqual(Array.from(plan.eventItems, (item) => item.id), ["inside"]);
  assert.equal(plan.contextLabels.filter((item) => item.role === "today").length, 0);
  assert.ok(Number.isFinite(plan.todayMarker?.x));
});

test("overview window remains synchronized after main and overview resize", () => {
  const { viewport, overview } = loadOverviewHooks();
  const states = viewports(viewport);
  const initial = overview.buildOverviewPlan({
    events: [],
    mainViewport: states.main,
    overviewViewport: states.overview,
    widthPx: 278,
    heightPx: 75
  });
  const resizedMain = viewport.resizeViewport(states.main, 420);
  const resizedOverview = viewport.resizeViewport(states.overview, 420);
  const resized = overview.buildOverviewPlan({
    events: [],
    mainViewport: resizedMain,
    overviewViewport: resizedOverview,
    widthPx: 420,
    heightPx: 75
  });

  assert.notEqual(initial.viewportWindow.widthPx, resized.viewportWindow.widthPx);
  assert.equal(resized.viewportWindow.leftPx + resized.viewportWindow.widthPx / 2, 210);
});

test("overview renderer owns exactly one text-free Today marker and exposes parity attributes", () => {
  const { viewport, overview } = loadOverviewHooks();
  const states = viewports(viewport);
  const plan = overview.buildOverviewPlan({
    events: fixture().events,
    mainViewport: states.main,
    overviewViewport: states.overview,
    widthPx: 278,
    heightPx: 75,
    now: "2026-07-11T12:30:00+08:00"
  });
  const document = fakeDocument();
  const host = document.createElement("div");
  host._rect = { left: 10, top: 20, width: 278, height: 75 };

  overview.renderOverview(host, plan);

  assert.equal(host.getAttribute("data-noria-timeline-band"), "overview");
  const todayMarkers = byAttribute(host, "data-noria-timeline-marker", "today");
  assert.equal(todayMarkers.length, 1);
  assert.equal(todayMarkers[0].textContent, "");
  assert.equal(byAttribute(host, "data-noria-overview-label-role", "today").length, 0);
  assert.equal(byAttribute(host, "data-noria-overview-window").length, 1);
  assert.ok(byAttribute(host, "data-noria-overview-event-id", "annotation:one").length >= 1);
  assert.ok(byAttribute(host, "data-noria-tick-date").length >= 2);
});

test("overview window updates in place without rebuilding event ticks", () => {
  const { viewport, overview } = loadOverviewHooks();
  const states = viewports(viewport);
  const plan = overview.buildOverviewPlan({
    events: fixture().events,
    mainViewport: states.main,
    overviewViewport: states.overview,
    widthPx: 278,
    heightPx: 75
  });
  const document = fakeDocument();
  const host = document.createElement("div");
  overview.renderOverview(host, plan);
  const beforeItems = byAttribute(host, "data-noria-overview-event-id").length;
  const pannedMain = viewport.panByPx(states.main, 24);

  const updated = overview.updateOverviewWindow(host, pannedMain, states.overview);

  assert.equal(updated.startMs, viewport.visibleRange(pannedMain).startMs);
  assert.equal(byAttribute(host, "data-noria-overview-event-id").length, beforeItems);
  assert.equal(byAttribute(host, "data-noria-overview-window")[0].style.left, `${updated.leftPx}px`);
});

test("overview navigation intent maps pointer position to an overview date", () => {
  const { viewport, overview } = loadOverviewHooks();
  const states = viewports(viewport);
  const document = fakeDocument();
  const host = document.createElement("div");
  host._rect = { left: 40, top: 20, width: 278, height: 75 };

  const intent = overview.readOverviewNavigationIntent({ clientX: 179 }, host, states.overview);

  assert.equal(intent.type, "center-main-viewport");
  assert.equal(intent.dateMs, states.overview.centerMs);
  assert.equal(intent.xPx, 139);
});
