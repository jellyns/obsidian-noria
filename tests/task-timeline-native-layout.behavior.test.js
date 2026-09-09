const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { sourcePath } = require("./source-paths.cjs");

test("overlapping durations occupy separate lanes even when their titles do not overlap", () => {
  const { viewport, layout } = loadLayoutHooks();
  const centerMs = Date.parse("2026-09-12T12:00:00+08:00");
  const state = viewport.createViewport({ centerMs, msPerPx: 3_600_000 / 50, widthPx: 1000 });
  const plan = layout.buildRenderPlan({ viewport: state, widthPx: 1000, heightPx: 320,
    measureText: () => 45,
    events: [
      { id: "field-notes", taskKey: "field-notes", layer: "task", title: "Field notes",
        start: "2026-09-12T09:00:00+08:00", end: "2026-09-12T17:00:00+08:00" },
      { id: "photo-edit", taskKey: "photo-edit", layer: "task", title: "Photo edit",
        start: "2026-09-12T13:00:00+08:00", end: "2026-09-12T21:00:00+08:00" }
    ] });
  assert.equal(plan.taskUnits.length, 2);
  assert.notEqual(plan.taskUnits[0].lane, plan.taskUnits[1].lane);
  assert.ok(plan.taskUnits.every((unit) => unit.title.visible));
});

test("saturated duration lanes report overflow without drawing anonymous overlapping rails", () => {
  const { viewport, layout } = loadLayoutHooks();
  const state = viewport.createViewport({ centerMs: Date.parse("2026-09-12T12:00:00+08:00"),
    msPerPx: 3_600_000 / 50, widthPx: 1000 });
  const plan = layout.buildRenderPlan({ viewport: state, widthPx: 1000, heightPx: 160,
    measureText: () => 100,
    events: Array.from({ length: 12 }, (_, i) => ({ id: `range-${i}`, taskKey: `range-${i}`, layer: "task",
      title: `Garden task ${i}`, start: "2026-09-12T09:00:00+08:00", end: "2026-09-12T17:00:00+08:00" })) });
  const hidden = plan.taskUnits.filter((unit) => !unit.title.visible);
  assert.ok(hidden.length > 0);
  assert.equal(plan.hiddenTaskCount, hidden.length);
  assert.ok(hidden.every((unit) => !unit.rail.visible && !unit.point.visible));
});

function loadLayoutHooks() {
  const context = { globalThis: null, __NORIA_TASK_TIMELINE_TEST__: true };
  context.globalThis = context;
  vm.createContext(context);
  ["native-viewport.js", "native-event-index.js", "native-layout.js"].forEach((name) => {
    const code = fs.readFileSync(sourcePath(`views/task-timeline/${name}`), "utf8");
    vm.runInContext(code, context, { filename: `views/task-timeline/${name}` });
  });
  return {
    viewport: context.__noriaTaskTimelineViewportTestHooks,
    layout: context.__noriaTaskTimelineLayoutTestHooks
  };
}

function fixture() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "task-timeline-native-events.json"), "utf8"));
}

function measureText(text) {
  return String(text || "").length * 8;
}

function viewportFor(hooks, widthPx = 278) {
  return hooks.createViewport({
    centerMs: Date.parse("2026-07-11T12:00:00+08:00"),
    msPerPx: 3_600_000 / 12,
    widthPx
  });
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("native layout creates one cohesive visual unit per task", () => {
  const { viewport, layout } = loadLayoutHooks();
  const events = [
    {
      id: "task:a:start",
      taskKey: "task:a",
      layer: "task",
      title: "AMR 三维欧拉",
      start: "2026-07-11T12:00:00+08:00",
      isInstant: true,
      status: "todo"
    },
    {
      id: "task:a:duplicate",
      taskKey: "task:a",
      layer: "task",
      title: "AMR 三维欧拉",
      start: "2026-07-11T12:00:00+08:00",
      isInstant: true,
      status: "todo"
    }
  ];
  const plan = layout.buildRenderPlan({
    events,
    viewport: viewportFor(viewport),
    widthPx: 278,
    heightPx: 315,
    measureText
  });

  assert.equal(plan.taskUnits.filter((unit) => unit.taskKey === "task:a").length, 1);
  const unit = plan.taskUnits[0];
  assert.equal(unit.title.role, "primary-title");
  assert.equal(unit.point.role, "point");
  assert.equal(unit.handles.parentTaskKey, "task:a");
  assert.equal(unit.point.bounds.right + plan.metrics.markerGapPx, unit.title.bounds.left);
  assert.equal(unit.point.bounds.top + unit.point.bounds.height / 2, unit.title.bounds.top + unit.title.bounds.height / 2);
  assert.equal(layout.findLayoutCollisions(plan).length, 0);
});

test("native layout matches the frozen narrow instant-task geometry", () => {
  const { viewport, layout } = loadLayoutHooks();
  const baseline = fixture().layoutBaselines.narrow;
  const state = viewportFor(viewport, baseline.widthPx);
  const plan = layout.buildRenderPlan({
    events: [{
      id: "task:center",
      taskKey: "task:center",
      layer: "task",
      title: "AMR 三维欧拉",
      start: "2026-07-11T12:00:00+08:00",
      isInstant: true,
      status: "todo"
    }],
    viewport: state,
    widthPx: baseline.widthPx,
    heightPx: baseline.heightPx,
    measureText
  });
  const unit = plan.taskUnits[0];
  const anchorX = baseline.widthPx / 2;
  assert.ok(Math.abs(unit.anchorX - anchorX) <= 1);
  assert.ok(Math.abs(unit.title.bounds.top - baseline.safeTopPx) <= 1);
  assert.ok(Math.abs(unit.title.bounds.height - baseline.titleHeightPx) <= 1);
  assert.ok(Math.abs(unit.point.bounds.width - baseline.markerSizePx) <= 1);
  assert.ok(Math.abs(unit.rail.bounds.height - baseline.railHeightPx) <= 1);
  assert.ok(unit.title.bounds.width <= baseline.maxTitleWidthPx + 1);
});

test("native layout measures titles with rendered side-pane typography and uses available width", () => {
  const { viewport, layout } = loadLayoutHooks();
  const cases = [
    { widthPx: 268, fontSizePx: 11, measuredWidth: 185 },
    { widthPx: 388, fontSizePx: 12, measuredWidth: 202 }
  ];

  for (const sample of cases) {
    const state = viewportFor(viewport, sample.widthPx);
    const startMs = viewport.pxToDateMs(state, 70);
    let typography = null;
    const plan = layout.buildRenderPlan({
      events: [{
        id: `task:full-title:${sample.widthPx}`,
        taskKey: `task:full-title:${sample.widthPx}`,
        layer: "task",
        title: "熟悉主页、项目、Inbox 和 MOC 区块",
        start: new Date(startMs).toISOString(),
        isInstant: true,
        status: "todo"
      }],
      viewport: state,
      widthPx: sample.widthPx,
      heightPx: 315,
      measureText: (_text, _kind, options) => {
        typography = options;
        return sample.measuredWidth;
      }
    });
    const unit = plan.taskUnits[0];

    assert.equal(typography.widthPx, sample.widthPx);
    assert.equal(typography.fontSizePx, sample.fontSizePx);
    assert.equal(typography.fontWeight, 600);
    assert.ok(unit.title.bounds.width > 180, "free pane width should not retain the legacy 180px cap");
    assert.equal(unit.point.bounds.right + plan.metrics.markerGapPx, unit.title.bounds.left);
    assert.ok(unit.title.bounds.right <= sample.widthPx - plan.metrics.horizontalPaddingPx + 1);
  }
});

test("duration title uses free band space while rail and local handles remain attached", () => {
  const { viewport, layout } = loadLayoutHooks();
  const state = viewportFor(viewport);
  const plan = layout.buildRenderPlan({
    events: [{
      id: "task:range",
      taskKey: "task:range",
      layer: "task",
      title: "完成自由条件的二阶导分析",
      start: "2026-07-11T10:00:00+08:00",
      end: "2026-07-11T14:00:00+08:00",
      isInstant: false,
      status: "todo"
    }],
    viewport: state,
    widthPx: 278,
    heightPx: 315,
    measureText
  });
  const unit = plan.taskUnits[0];
  assert.equal(unit.title.role, "primary-title");
  assert.equal(unit.rail.role, "duration-rail");
  assert.ok(unit.title.bounds.width > unit.rail.bounds.width, "empty band space should help show the full title");
  assert.equal(unit.handles.start.bounds.right, unit.title.bounds.left);
  assert.equal(unit.handles.end.bounds.left, unit.title.bounds.right);
  assert.equal(unit.handles.move.bounds.left, unit.title.bounds.left);
  assert.equal(unit.handles.move.bounds.right, unit.title.bounds.right);
  assert.ok(unit.rail.bounds.top > unit.title.bounds.bottom);
  assert.ok(unit.rail.bounds.bottom < unit.title.bounds.top + plan.metrics.laneStepPx);
});

test("completed and unfinished task titles retain the same readable weight", () => {
  const { viewport, layout } = loadLayoutHooks();
  const state = viewportFor(viewport);
  const plan = layout.buildRenderPlan({
    events: [
      { id: "todo", taskKey: "todo", layer: "task", title: "未完成", start: "2026-07-11T11:00:00+08:00", status: "todo", isInstant: true },
      { id: "done", taskKey: "done", layer: "task", title: "已完成", start: "2026-07-11T13:00:00+08:00", status: "done", isInstant: true }
    ],
    viewport: state,
    widthPx: 278,
    heightPx: 315,
    measureText
  });
  assert.equal(plan.taskUnits.find((unit) => unit.taskKey === "todo").title.fontWeight, 600);
  assert.equal(plan.taskUnits.find((unit) => unit.taskKey === "done").title.fontWeight, 600);
});

test("point and interval titles follow their start marker, including pinned and right-edge tasks", () => {
  const { viewport, layout } = loadLayoutHooks();
  const state = viewport.createViewport({ centerMs: Date.parse("2026-09-08T12:00:00Z"),
    msPerPx: 60_000, widthPx: 600 });
  const plan = layout.buildRenderPlan({ viewport: state, widthPx: 600, heightPx: 315,
    measureText: () => 100, events: [
      { id: "point", layer: "task", title: "Point", start: "2026-09-08T10:00:00Z" },
      { id: "interval", layer: "task", title: "Interval", start: "2026-09-08T12:00:00Z", end: "2026-09-08T14:00:00Z" },
      { id: "pinned", layer: "task", title: "Already started", start: "2026-09-07T12:00:00Z", end: "2026-09-09T12:00:00Z" },
      { id: "edge", layer: "task", title: "At the right edge", start: "2026-09-08T16:45:00Z", end: "2026-09-08T18:00:00Z" }
    ] });
  for (const unit of plan.taskUnits) {
    assert.equal(unit.point.visible, true, unit.taskKey);
    assert.equal(unit.title.bounds.left, unit.point.bounds.right + plan.metrics.markerGapPx);
    assert.ok(unit.point.bounds.left >= 0);
    assert.ok(unit.title.bounds.right <= 600, "edge titles must clip on the right, without shifting before the marker");
  }
  const center = key => { const point = plan.taskUnits.find(u => u.taskKey === key).point.bounds; return point.left + point.width / 2; };
  assert.equal(center("point"), 180);
  assert.equal(center("interval"), 300);
  assert.equal(center("edge"), 585);
  assert.ok(center("pinned") < 20, "a spanning task stays at the left edge instead of appearing at noon");
});

test("project phases occupy at most two visible lanes above mixed tasks, with retrievable overflow", () => {
  const { viewport, layout } = loadLayoutHooks();
  const state = viewport.createViewport({ centerMs: Date.parse("2026-09-08T12:00:00Z"), msPerPx: 60_000, widthPx: 600 });
  const phases = ["a", "b", "c"].map(id => ({ id, layer: "annotation", title: `Phase ${id}`,
    start: "2026-09-08T09:00:00Z", end: "2026-09-08T15:00:00Z",
    payload: { annotation: { projectPath: `Projects/${id}.md`, projectName: `Project ${id}` } } }));
  const task = { id: "task", layer: "task", title: "Mixed task", start: "2026-09-08T12:00:00Z" };
  const build = events => layout.buildRenderPlan({ events, viewport: state, widthPx: 600, heightPx: 315, measureText: () => 80 });
  const plan = build([...phases, task]);
  assert.equal(plan.annotationUnits.length, 2);
  assert.equal(plan.hiddenAnnotations.length, 1);
  assert.equal(plan.annotationUnits[0].label, "Project a · Phase a");
  assert.ok(plan.taskUnits[0].title.bounds.top >= plan.annotationHeightPx);
  assert.ok(plan.annotationUnits.every(u => u.bounds.bottom < plan.taskUnits[0].title.bounds.top));
  const empty = build([task]);
  assert.equal(empty.annotationHeightPx, 0);
  assert.equal(empty.taskUnits[0].title.bounds.top, 12);
  const selected = layout.buildRenderPlan({ events: [...phases, task], viewport: state, widthPx: 600,
    heightPx: 315, selectedAnnotationId: "c" });
  assert.ok(selected.annotationUnits.some(u => u.id === "c" && u.selected));
});

test("crowded titles use stable vertical lanes without collisions", () => {
  const { viewport, layout } = loadLayoutHooks();
  const state = viewportFor(viewport);
  const events = ["00", "02", "04", "06"].map((minute, index) => ({
    id: `task:${index}`,
    taskKey: `task:${index}`,
    layer: "task",
    title: `拥挤任务 ${index}`,
    start: `2026-07-11T12:${minute}:00+08:00`,
    status: "todo",
    isInstant: true
  }));
  const forward = layout.buildRenderPlan({ events, viewport: state, widthPx: 278, heightPx: 315, measureText });
  const reverse = layout.buildRenderPlan({ events: [...events].reverse(), viewport: state, widthPx: 278, heightPx: 315, measureText });
  assert.equal(layout.findLayoutCollisions(forward).length, 0);
  assert.deepEqual(
    plain(forward.taskUnits.map((unit) => [unit.taskKey, unit.lane, unit.title.bounds.top])),
    plain(reverse.taskUnits.map((unit) => [unit.taskKey, unit.lane, unit.title.bounds.top]))
  );
  assert.ok(new Set(forward.taskUnits.map((unit) => unit.lane)).size > 1);
});

test("native layout clips ranges and excludes point tasks outside the viewport", () => {
  const { viewport, layout } = loadLayoutHooks();
  const state = viewportFor(viewport);
  const plan = layout.buildRenderPlan({
    events: [
      { id: "off", taskKey: "off", layer: "task", title: "视口外", start: "2026-08-11T12:00:00+08:00", isInstant: true },
      { id: "clip", taskKey: "clip", layer: "task", title: "跨越视口", start: "2026-07-10T00:00:00+08:00", end: "2026-07-11T13:00:00+08:00", isInstant: false }
    ],
    viewport: state,
    widthPx: 278,
    heightPx: 315,
    measureText
  });
  assert.equal(plan.taskUnits.some((unit) => unit.taskKey === "off"), false);
  const clipped = plan.taskUnits.find((unit) => unit.taskKey === "clip");
  assert.equal(clipped.clippedStart, true);
  assert.equal(clipped.rail.bounds.left, 0);
  assert.ok(clipped.rail.bounds.right <= 278);
});
