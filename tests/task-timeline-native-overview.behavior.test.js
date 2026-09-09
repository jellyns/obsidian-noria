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

test("unified footer follows the main hour scale and retains the midnight date", () => {
  const { viewport, overview } = loadOverviewHooks();
  const centerMs = new Date(2026, 8, 9, 0).getTime();
  const main = viewport.createViewport({ centerMs, msPerPx: 3_600_000 / 70, widthPx: 840 });
  const map = viewport.createViewport({ centerMs, msPerPx: 86_400_000 / 40, widthPx: 840 });
  const plan = overview.buildOverviewPlan({ mainViewport: main, overviewViewport: map, heightPx: 56, locale: "en", measureText: label => label.length * 6 });
  assert.ok(plan.dateTicks.length >= 5);
  assert.ok(plan.dateTicks.every(tick => tick.timeMs >= new Date(2026, 8, 8, 18).getTime() && tick.timeMs <= new Date(2026, 8, 9, 6).getTime()));
  assert.ok(plan.dateTicks.every(tick => /\d{2}:\d{2}/.test(tick.label)));
  assert.ok(plan.dateTicks.some(tick => /Sep 8/.test(tick.label)));
  assert.ok(plan.dateTicks.some(tick => /Sep 9.*00:00/.test(tick.label)));
  const host = fakeDocument().createElement("div");
  overview.renderOverview(host, plan);
  assert.equal(byAttribute(host, "data-noria-overview-window").length, 0);
  assert.equal(byAttribute(host, "data-noria-overview-label-role").length, 0);
});

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
  assert.equal(plan.todayMarker?.label, undefined);
  assert.ok(Number.isFinite(plan.todayMarker?.x));
  assert.ok(plan.dateTicks.length >= 2);
  assert.ok(plan.eventItems.some((item) => item.layer === "task" && item.type === "tick"));
  assert.ok(plan.eventItems.some((item) => item.layer === "task" && item.type === "segment"));
  assert.ok(plan.eventItems.some((item) => item.layer === "annotation"));
  assert.ok(plan.eventItems.some((item) => item.layer === "git"));
  assert.ok(plan.eventItems.some(item => item.activeBounds));
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
  assert.equal(english.todayMarker?.label, undefined);
  assert.ok(chinese.dateTicks.some((item) => /7月\d+日/.test(item.label)));
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

test("native overview separates overlapping duration segments below the single date axis", () => {
  const { viewport, overview } = loadOverviewHooks();
  const states = viewports(viewport);
  const plan = overview.buildOverviewPlan({
    events: [{
      id: "duration",
      layer: "task",
      start: "2026-07-11T09:00:00+08:00",
      end: "2026-07-11T10:00:00+08:00"
    }, {
      id: "overlap", layer: "task", start: "2026-07-11T09:30:00+08:00", end: "2026-07-11T11:00:00+08:00"
    }],
    mainViewport: states.main,
    overviewViewport: states.overview,
    widthPx: 278,
    heightPx: 72,
    now: "2026-07-11T12:30:00+08:00"
  });

  assert.notEqual(plan.eventItems[0].bounds.top, plan.eventItems[1].bounds.top);
  assert.ok(plan.eventItems.every((item) => item.bounds.top > plan.axisHeightPx && item.bounds.top + item.bounds.height < plan.heightPx));
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
  assert.ok(Number.isFinite(plan.todayMarker?.x));
});

test("overview emphasizes only the visible portion of each task after pan and resize", () => {
  const { viewport, overview } = loadOverviewHooks();
  const centerMs = new Date(2026, 8, 8, 12).getTime();
  const main = viewport.createViewport({ centerMs, widthPx: 120, msPerPx: 60_000 });
  const map = viewport.createViewport({ centerMs, widthPx: 120, msPerPx: 720_000 });
  const events = [{ id: "range", layer: "task", start: new Date(2026, 8, 8, 10).toISOString(), end: new Date(2026, 8, 8, 14).toISOString() }];
  const build = (mainViewport, overviewViewport = map) => overview.buildOverviewPlan({ events, mainViewport, overviewViewport, heightPx: 56 }).eventItems[0];
  assert.equal(build(main).bounds.width, 20);
  assert.equal(build(main).activeBounds.left, 55);
  assert.equal(build(main).activeBounds.width, 10);
  const panned = build(viewport.panByPx(main, 40));
  assert.ok(Math.abs(panned.activeBounds.left - 51.6666666667) < 0.001);
  assert.equal(panned.activeBounds.width, 10);
  assert.equal(build(viewport.resizeViewport(main, 240), viewport.resizeViewport(map, 240)).activeBounds.width, 20);
  assert.equal(build(viewport.createViewport({ ...main, centerMs: centerMs + 6 * 3_600_000 })).activeBounds, undefined);
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
  assert.equal(byAttribute(host, "data-noria-overview-window").length, 0);
  assert.ok(byAttribute(host, "data-noria-overview-event-id", "annotation:one").length >= 1);
  assert.ok(byAttribute(host, "data-noria-tick-date").length >= 2);
});

test("three-hour and daily ticks remain aligned to local midnight", () => {
  const { viewport, overview } = loadOverviewHooks();
  for (const hours of [3, 24]) {
    const main = viewport.createViewport({ centerMs: new Date(2026, 8, 9, 0).getTime(), msPerPx: hours * 3_600_000 / 56, widthPx: 560 });
    const plan = overview.buildOverviewPlan({ mainViewport: main, overviewViewport: main, heightPx: 56 });
    assert.ok(plan.dateTicks.some(tick => new Date(tick.timeMs).getHours() === 0));
    assert.ok(plan.dateTicks.every(tick => new Date(tick.timeMs).getHours() % hours === 0));
  }
});

test("overview distinguishes hours within one day instead of repeating a date", () => {
  const { viewport, overview } = loadOverviewHooks();
  const centerMs = Date.parse("2026-09-12T12:00:00+08:00");
  const state = viewport.createViewport({ centerMs, msPerPx: 3_600_000 / 100, widthPx: 800 });
  const plan = overview.buildOverviewPlan({ mainViewport: state, overviewViewport: state, heightPx: 80, locale: "en" });
  const labels = Array.from(plan.dateTicks, (tick) => tick.label);
  assert.ok(labels.length >= 3);
  assert.equal(new Set(labels).size, labels.length);
  assert.ok(labels.every((label) => /\d{2}:\d{2}/.test(label)));
});

test("overview long-range ticks include years so different years are distinguishable", () => {
  const { viewport, overview } = loadOverviewHooks();
  const centerMs = Date.parse("2026-07-01T00:00:00Z");
  const state = viewport.createViewport({ centerMs, msPerPx: 365 * 86_400_000 / 120, widthPx: 800 });
  const plan = overview.buildOverviewPlan({ mainViewport: state, overviewViewport: state, heightPx: 80, locale: "en" });
  const labels = Array.from(plan.dateTicks, (tick) => tick.label);
  assert.ok(labels.length >= 3);
  assert.ok(labels.every((label) => /20\d{2}/.test(label)));
  assert.equal(new Set(labels).size, labels.length);
});

test("overview labels remain inside narrow panes and do not overlap near magnified boundaries", () => {
  const { viewport, overview } = loadOverviewHooks();
  for (const widthPx of [220, 278, 900]) {
    const centerMs = Date.parse("2026-09-01T00:00:00+08:00");
    const state = viewport.createViewport({ centerMs, msPerPx: 86_400_000 / 58, widthPx,
      zones: [{ startMs: centerMs - 86_400_000, endMs: centerMs + 2 * 86_400_000, magnify: 2 }] });
    const plan = overview.buildOverviewPlan({ mainViewport: state, overviewViewport: state, heightPx: 80,
      locale: "zh-CN", measureText: (label) => label.length * 10 });
    assert.ok(plan.dateTicks.length > 0);
    let previousRight = 0;
    for (const tick of plan.dateTicks) {
      assert.ok(tick.labelLeftPx >= previousRight, "visible date labels must not collide");
      assert.ok(tick.labelLeftPx + tick.labelWidthPx <= widthPx, "a complete label must fit the pane");
      previousRight = tick.labelLeftPx + tick.labelWidthPx;
    }
  }
});

test("month ticks follow calendar boundaries instead of showing July twice", () => {
  const { viewport, overview } = loadOverviewHooks();
  const state = viewport.createViewport({ centerMs: Date.parse("2027-07-01T00:00:00+08:00"),
    msPerPx: 30 * 86_400_000 / 100, widthPx: 1400 });
  const plan = overview.buildOverviewPlan({ mainViewport: state, overviewViewport: state, heightPx: 80, locale: "en" });
  const labels = Array.from(plan.dateTicks, (tick) => tick.label);
  assert.ok(labels.includes("Jul 2027"));
  assert.equal(new Set(labels).size, labels.length);
  assert.ok(plan.dateTicks.every((tick) => new Date(tick.timeMs).getDate() === 1));
});
