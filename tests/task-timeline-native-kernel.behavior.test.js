const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { sourcePath } = require("./source-paths.cjs");

function loadNativeKernel() {
  const context = { globalThis: null, __NORIA_TASK_TIMELINE_TEST__: true };
  context.globalThis = context;
  vm.createContext(context);
  ["native-viewport.js", "native-event-index.js"].forEach((name) => {
    const code = fs.readFileSync(sourcePath(`views/task-timeline/${name}`), "utf8");
    vm.runInContext(code, context, { filename: `views/task-timeline/${name}` });
  });
  return {
    viewport: context.__noriaTaskTimelineViewportTestHooks,
    eventIndex: context.__noriaTaskTimelineEventIndexTestHooks
  };
}

test("native viewport preserves date/pixel round trips and center across resize", () => {
  const { viewport: hooks } = loadNativeKernel();
  const centerMs = Date.parse("2026-07-11T12:00:00+08:00");
  const targetMs = Date.parse("2026-07-13T18:30:00+08:00");
  const state = hooks.createViewport({ centerMs, msPerPx: 86_400_000 / 96, widthPx: 288 });
  const px = hooks.dateMsToPx(state, targetMs);
  assert.ok(Math.abs(hooks.pxToDateMs(state, px) - targetMs) <= 1);
  assert.equal(hooks.dateMsToPx(state, centerMs), 144);

  const resized = hooks.resizeViewport(state, 560);
  assert.equal(resized.centerMs, centerMs);
  assert.equal(hooks.dateMsToPx(resized, centerMs), 280);
});

test("native viewport keeps the pointer date fixed while zooming and clamps scale", () => {
  const { viewport: hooks } = loadNativeKernel();
  const state = hooks.createViewport({
    centerMs: Date.parse("2026-07-11T12:00:00+08:00"),
    msPerPx: 900_000,
    widthPx: 300,
    minMsPerPx: 60_000,
    maxMsPerPx: 86_400_000
  });
  const anchorPx = 72;
  const anchorDate = hooks.pxToDateMs(state, anchorPx);
  const zoomed = hooks.zoomAtPx(state, anchorPx, 0.5);
  assert.ok(Math.abs(hooks.pxToDateMs(zoomed, anchorPx) - anchorDate) <= 1);
  assert.equal(zoomed.msPerPx, 450_000);
  assert.equal(hooks.zoomAtPx(state, anchorPx, 0.00001).msPerPx, 60_000);
  assert.equal(hooks.zoomAtPx(state, anchorPx, 1_000_000).msPerPx, 86_400_000);
});

test("native viewport pans deterministically and builds stable visible ticks", () => {
  const { viewport: hooks } = loadNativeKernel();
  const state = hooks.createViewport({
    centerMs: Date.parse("2026-07-11T12:00:00+08:00"),
    msPerPx: 3_600_000 / 12,
    widthPx: 288
  });
  const panned = hooks.panByPx(state, 24);
  assert.equal(panned.centerMs, state.centerMs - 24 * state.msPerPx);
  const ticksA = hooks.buildTimeTicks(state, { minSpacingPx: 72 });
  const ticksB = hooks.buildTimeTicks(state, { minSpacingPx: 72 });
  assert.ok(ticksA.length >= 2);
  assert.deepEqual(JSON.parse(JSON.stringify(ticksA)), JSON.parse(JSON.stringify(ticksB)));
  assert.ok(ticksA.every((tick, index) => index === 0 || tick.px > ticksA[index - 1].px));
});

test("native viewport stays monotonic across explicit DST offsets", () => {
  const { viewport: hooks } = loadNativeKernel();
  const before = Date.parse("2026-03-08T01:30:00-05:00");
  const after = Date.parse("2026-03-08T03:30:00-04:00");
  const state = hooks.createViewport({ centerMs: before, msPerPx: 60_000, widthPx: 300 });
  assert.equal(after - before, 3_600_000);
  assert.equal(hooks.dateMsToPx(state, after) - hooks.dateMsToPx(state, before), 60);
});

test("native viewport reproduces piecewise hot-zone magnification and inverse mapping", () => {
  const { viewport: hooks } = loadNativeKernel();
  const state = hooks.createViewport({
    centerMs: 0,
    msPerPx: 10,
    widthPx: 200,
    minMsPerPx: 1,
    zones: [{ startMs: -100, endMs: 100, magnify: 2 }]
  });

  assert.equal(hooks.dateMsToPx(state, 100), 120);
  assert.equal(hooks.dateMsToPx(state, 200), 130);
  assert.equal(hooks.dateMsToPx(state, -200), 70);
  assert.ok(Math.abs(hooks.pxToDateMs(state, 130) - 200) <= 1);
  assert.ok(Math.abs(hooks.pxToDateMs(state, 70) + 200) <= 1);
  assert.deepEqual(JSON.parse(JSON.stringify(hooks.visibleRange(state))), { startMs: -900, endMs: 900 });
});

test("native viewport multiplies overlapping hot zones deterministically", () => {
  const { viewport: hooks } = loadNativeKernel();
  const state = hooks.createViewport({
    centerMs: 0,
    msPerPx: 10,
    widthPx: 200,
    minMsPerPx: 1,
    zones: [
      { startMs: 0, endMs: 100, magnify: 2 },
      { startMs: 50, endMs: 150, magnify: 3 }
    ]
  });

  assert.equal(hooks.dateMsToPx(state, 50), 110);
  assert.equal(hooks.dateMsToPx(state, 100), 140);
  assert.equal(hooks.dateMsToPx(state, 150), 155);
  assert.ok(Math.abs(hooks.pxToDateMs(state, 155) - 150) <= 1);
});

test("native overview window derives from the same main viewport", () => {
  const { viewport: hooks } = loadNativeKernel();
  const main = hooks.createViewport({ centerMs: 10_000, msPerPx: 10, widthPx: 200, minMsPerPx: 1 });
  const overview = hooks.createViewport({ centerMs: 10_000, msPerPx: 50, widthPx: 200, minMsPerPx: 1 });
  const window = hooks.syncOverviewWindow(main, overview);
  assert.equal(window.leftPx, 80);
  assert.equal(window.rightPx, 120);
  assert.equal(window.widthPx, 40);
});

test("native event index deduplicates, sorts, partitions, and range-queries without mutation", () => {
  const { eventIndex: hooks } = loadNativeKernel();
  const input = [
    { id: "late", layer: "task", start: "2026-07-12T10:00:00Z", title: "Late" },
    { id: "span", taskKey: "task:span", layer: "task", start: "2026-07-10T00:00:00Z", end: "2026-07-13T00:00:00Z", title: "Span" },
    { id: "early", layer: "annotation", start: "2026-07-11T08:00:00Z", title: "Early" },
    { id: "early", layer: "annotation", start: "2026-07-11T08:00:00Z", title: "Duplicate" },
    { id: "invalid", layer: "task", start: "not-a-date", title: "Invalid" }
  ];
  const before = JSON.stringify(input);
  const index = hooks.createEventIndex(input);
  assert.equal(index.events.length, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(index.events.map((event) => event.id))), ["span", "early", "late"]);
  assert.equal(JSON.stringify(input), before);

  const range = hooks.queryEventRange(
    index,
    Date.parse("2026-07-11T00:00:00Z"),
    Date.parse("2026-07-11T23:59:59Z")
  );
  assert.deepEqual(JSON.parse(JSON.stringify(range.map((event) => event.id))), ["span", "early"]);
  const parts = hooks.partitionEvents(range);
  assert.deepEqual(JSON.parse(JSON.stringify(parts.points.map((event) => event.id))), ["early"]);
  assert.deepEqual(JSON.parse(JSON.stringify(parts.spans.map((event) => event.id))), ["span"]);
});

test("native event index preserves local calendar dates while respecting explicit offsets", () => {
  const { eventIndex: hooks } = loadNativeKernel();
  const index = hooks.createEventIndex([
    { id: "date-only", layer: "task", start: "2026-07-10", end: "2026-07-11" },
    { id: "offset", layer: "task", start: "2026-07-10T00:00:00+08:00" }
  ]);
  const byId = new Map(index.events.map((event) => [event.id, event]));

  assert.equal(byId.get("date-only").startMs, new Date(2026, 6, 10).getTime());
  assert.equal(byId.get("date-only").endMs, new Date(2026, 6, 11).getTime());
  assert.equal(byId.get("offset").startMs, Date.parse("2026-07-10T00:00:00+08:00"));

  const utcIndex = hooks.createEventIndex(
    [{ id: "date-only", layer: "task", start: "2026-07-10" }],
    { dateOnlyMode: "utc" }
  );
  assert.equal(utcIndex.events[0].startMs, Date.UTC(2026, 6, 10));
});
