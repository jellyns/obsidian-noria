const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { sourcePath } = require("./source-paths.cjs");

class FakeNode {
  constructor(documentRef, rect = {}) {
    this.ownerDocument = documentRef;
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.style = {};
    this.rect = { left: 0, top: 0, width: 0, height: 0, ...rect };
  }

  appendChild(node) {
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
    this.parentElement?.removeChild(this);
  }

  replaceChildren(...nodes) {
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

  getBoundingClientRect() {
    return {
      ...this.rect,
      right: this.rect.left + this.rect.width,
      bottom: this.rect.top + this.rect.height
    };
  }
}

function fixtureEvents() {
  return [
    {
      id: "task:a",
      taskKey: "task:a",
      layer: "task",
      title: "Task A",
      start: "2026-07-11T09:00:00+08:00",
      end: "2026-07-11T10:00:00+08:00",
      sourceVersion: "v1"
    },
    {
      id: "annotation:a",
      layer: "annotation",
      title: "Annotation A",
      start: "2026-07-11T11:00:00+08:00"
    }
  ];
}

function createHarness(options = {}) {
  const frames = [];
  const resizeCallbacks = [];
  const calls = {
    viewportInputs: [],
    indexInputs: [],
    layoutInputs: [],
    overviewInputs: [],
    renders: [],
    updates: [],
    interactionOptions: [],
    interactionCleanups: 0,
    rendererDisposals: 0,
    resizeCleanups: 0
  };
  const document = {
    createElement() {
      return new FakeNode(document);
    }
  };
  const context = {
    globalThis: null,
    __NORIA_TASK_TIMELINE_TEST__: true,
    Date,
    Promise,
    Map,
    Set,
    console,
    setTimeout,
    clearTimeout
  };
  context.globalThis = context;
  vm.createContext(context);
  const run = (name) => {
    const code = fs.readFileSync(sourcePath(`views/task-timeline/${name}`), "utf8");
    vm.runInContext(code, context, { filename: `views/task-timeline/${name}` });
  };
  run("engine-contract.js");
  run("native-viewport.js");
  const root = context.noriaTaskTimeline;
  root.nativeViewport = {
    placeTickLabels: root.nativeViewport.placeTickLabels,
    createViewport(input = {}) {
      calls.viewportInputs.push(input);
      return { ...input };
    },
    resizeViewport(viewport, widthPx) { return { ...viewport, widthPx }; },
    visibleRange(viewport) {
      const span = viewport.msPerPx * viewport.widthPx;
      return { startMs: viewport.centerMs - span / 2, endMs: viewport.centerMs + span / 2 };
    },
    dateMsToPx(viewport, value) {
      return viewport.widthPx / 2 + (Number(value) - viewport.centerMs) / viewport.msPerPx;
    },
    buildTimeTicks(viewport) {
      return [{ timeMs: viewport.centerMs, px: viewport.widthPx / 2 }];
    }
  };
  root.nativeEventIndex = {
    createEventIndex(events) {
      calls.indexInputs.push(events);
      const normalized = events.map((event, index) => {
        const parseEventDate = (value) => {
          const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
          return match
            ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime()
            : Date.parse(value);
        };
        const startMs = parseEventDate(event.start);
        const parsedEnd = parseEventDate(event.end);
        return {
          ...event,
          id: event.id || `event:${index}`,
          startMs,
          endMs: Number.isFinite(parsedEnd) ? parsedEnd : startMs,
          isInstant: !Number.isFinite(parsedEnd) || parsedEnd === startMs,
          __indexKey: event.id || `event:${index}`
        };
      });
      return { events: normalized, byKey: new Map(normalized.map((event) => [event.__indexKey, event])) };
    }
  };
  root.nativeLayout = {
    buildRenderPlan(input) {
      calls.layoutInputs.push(input);
      return { widthPx: input.widthPx, heightPx: input.heightPx, taskUnits: [], metrics: {} };
    }
  };
  root.nativeOverview = {
    buildOverviewPlan(input) {
      calls.overviewInputs.push(input);
      return { widthPx: input.widthPx, heightPx: input.heightPx, eventItems: [], dateTicks: [] };
    }
  };
  root.nativeRenderer = {
    createNativeTimelineHost(container) {
      const host = new FakeNode(document, container.getBoundingClientRect());
      container.appendChild(host);
      return host;
    },
    renderNativeTimeline(host, model) {
      calls.renders.push({ host, model });
      host.__rendered = true;
      return host;
    },
    updateNativeTimeline(host, model) {
      calls.updates.push({ host, model });
      return host;
    },
    disposeNativeTimeline(host) {
      calls.rendererDisposals += 1;
      host.__disposed = true;
    }
  };
  root.nativeInteractions = {
    attachTimelineInteractions(host, interactionOptions) {
      calls.interactionOptions.push(interactionOptions);
      host.__interactionOptions = interactionOptions;
      return () => { calls.interactionCleanups += 1; };
    }
  };
  run("native-backend.js");
  const engine = context.__noriaTaskTimelineEngineTestHooks;
  const timelineEl = new FakeNode(document, options.rect || { width: 320, height: 360 });
  const backendContext = {
    timelineEl,
    container: timelineEl,
    events: options.events || fixtureEvents(),
    settings: options.settings || {},
    services: options.services || {},
    document,
    now: () => Date.parse("2026-07-11T12:00:00+08:00"),
    requestFrame(callback) {
      frames.push(callback);
      return frames.length;
    },
    cancelFrame() {},
    observeResize(_target, callback) {
      resizeCallbacks.push(callback);
      return () => { calls.resizeCleanups += 1; };
    },
    ...options.context
  };
  return {
    calls,
    context,
    engine,
    frames,
    resizeCallbacks,
    timelineEl,
    backendContext,
    flushFrame() {
      const callback = frames.shift();
      if (callback) callback(16);
    }
  };
}

test("native backend is the sole renderer and consumes one already-filtered event model", async () => {
  const harness = createHarness({
    context: {
      collectProviderEvents() {
        throw new Error("backend must not collect providers");
      }
    }
  });
  assert.equal(harness.engine.getTimelineBackend("legacy"), null);
  assert.ok(harness.engine.getTimelineBackend("native"));
  assert.equal(harness.engine.getTimelineBackend("compare"), null);

  const instance = await harness.engine.mountTimelineBackend("native", harness.backendContext);
  assert.equal(harness.frames.length, 1);
  instance.refresh("first");
  instance.refresh("second");
  assert.equal(harness.frames.length, 1);
  harness.flushFrame();

  assert.equal(harness.calls.indexInputs.length, 1);
  assert.equal(harness.calls.indexInputs[0], harness.backendContext.events);
  assert.equal(harness.calls.renders.length, 1);
  assert.equal(harness.calls.layoutInputs[0].eventIndex.events.length, 2);
  assert.equal(harness.calls.overviewInputs[0].events.length, 2);
  assert.equal(harness.calls.interactionOptions.length, 1);
  assert.equal(harness.timelineEl.getAttribute("data-noria-timeline-backend"), "native");
  assert.deepEqual(Object.keys(instance).sort(), ["centerOn", "clearAnnotationPreview", "dispose", "getDiagnostics", "host", "previewAnnotation", "refresh", "resize", "selectAnnotation", "setMarkMode"]);
  assert.equal(instance.getDiagnostics().eventCount, 2);
  assert.equal(instance.getDiagnostics().renderCount, 1);

  const currentMs = Date.parse("2026-07-11T12:00:00+08:00");
  const dayStart = new Date(currentMs);
  dayStart.setHours(0, 0, 0, 0);
  assert.equal(harness.calls.viewportInputs.length, 2);
  harness.calls.viewportInputs.forEach((input) => {
    assert.equal(JSON.stringify(input.zones), JSON.stringify([{
      startMs: dayStart.getTime() - 24 * 60 * 60 * 1000,
      endMs: dayStart.getTime() + 2 * 24 * 60 * 60 * 1000,
      magnify: 2
    }]));
  });
  const mainMarkers = harness.calls.renders[0].model.mainPlan.markers;
  assert.equal(mainMarkers.find((marker) => marker.kind === "today").bounds.height, 360 - 56);
  assert.equal(mainMarkers.find((marker) => marker.kind === "now").bounds.width, 1);

  harness.resizeCallbacks[0]();
  assert.equal(harness.frames.length, 0);
  assert.equal(instance.getDiagnostics().renderCount, 1);
});

test("native backend preserves the legacy date-string center for date-only tasks", async () => {
  const harness = createHarness({
    events: [{
      id: "task:date-only",
      taskKey: "task:date-only",
      layer: "task",
      title: "Date only",
      start: "2026-07-10",
      end: "2026-07-11"
    }]
  });
  const instance = await harness.engine.mountTimelineBackend("native", harness.backendContext);
  harness.flushFrame();

  assert.notEqual(harness.calls.layoutInputs[0].eventIndex.events[0].startMs, Date.parse("2026-07-10"));
  assert.equal(harness.calls.viewportInputs[0].centerMs, Date.parse("2026-07-10"));
  instance.dispose();
});

test("native overview uses the legacy calendar-month scale around its chosen center", async () => {
  const harness = createHarness({
    events: [
      { id: "task:early", taskKey: "task:early", layer: "task", title: "Early", start: "2026-01-10" },
      { id: "task:near", taskKey: "task:near", layer: "task", title: "Near", start: "2026-07-10" },
      { id: "task:late", taskKey: "task:late", layer: "task", title: "Late", start: "2026-11-20" }
    ]
  });
  const instance = await harness.engine.mountTimelineBackend("native", harness.backendContext);
  harness.flushFrame();

  const center = new Date(Date.parse("2026-07-10"));
  const monthStart = new Date(center.getFullYear(), center.getMonth(), 1);
  const nextMonth = new Date(center.getFullYear(), center.getMonth() + 1, 1);
  assert.equal(harness.calls.viewportInputs[1].msPerPx, (nextMonth.getTime() - monthStart.getTime()) / 102);
  instance.dispose();
});

test("native backend applies one runtime locale to the main axis and overview", async () => {
  const harness = createHarness({
    settings: { locale: "zh-CN", todayLabel: "今日" }
  });
  const instance = await harness.engine.mountTimelineBackend("native", harness.backendContext);
  harness.flushFrame();

  assert.equal(harness.calls.renders[0].model.mainPlan.locale, "zh-CN");
  assert.equal(harness.calls.overviewInputs[0].locale, "zh-CN");
  assert.equal(harness.calls.overviewInputs[0].todayLabel, "今日");
  instance.dispose();
});

test("task timeline view measures native geometry from the timeline surface while observing its stable stage", () => {
  const view = fs.readFileSync(sourcePath("views/task-timeline/view.js"), "utf8");
  assert.match(
    view,
    /resizeTarget:\s*stage,[\s\S]*?getRect:\s*\(\)\s*=>\s*timelineEl\.getBoundingClientRect\?\.\(\)\s*\|\|\s*stage\.getBoundingClientRect\?\.\(\)/
  );
  assert.match(view, /measureText:\s*taskTimelineTextMeasurer\(timelineEl\)/);
  assert.match(view, /externalStateLayer:\s*true/);
  assert.match(view, /onRender:\s*\(\)\s*=>\s*taskTimelineSetState\(root,\s*stage,\s*"ready"/);
  assert.doesNotMatch(view, /taskTimelineSetLoadDiagnostics\(timelineEl,\s*"ready"[\s\S]{0,180}taskTimelineSetState\(root,\s*stage,\s*"ready"/);
});

test("task timeline text measurement uses the native title typography supplied by layout", () => {
  const view = fs.readFileSync(sourcePath("views/task-timeline/view.js"), "utf8");
  const start = view.indexOf("function taskTimelineTextMeasurer");
  const end = view.indexOf("\n}\n\nconst TASK_TIMELINE_TIMING_ATTRS", start) + 2;
  const functionSource = view.slice(start, end);
  const canvasContext = {
    font: "",
    measureText() {
      return { width: this.font.includes("12px") ? 120 : 150 };
    }
  };
  const context = {
    document: { createElement: () => ({ getContext: () => canvasContext }) },
    window: { getComputedStyle: () => ({ fontWeight: "400", fontSize: "15px", fontFamily: "Inherited UI" }) }
  };
  vm.createContext(context);
  vm.runInContext(`${functionSource}\nglobalThis.measureNativeTitle = taskTimelineTextMeasurer({});`, context);

  const measured = context.measureNativeTitle("完整标题", "task-title", {
    widthPx: 388,
    fontSizePx: 12,
    fontWeight: 600,
    fontFamily: "Arial"
  });

  assert.equal(measured, 120, "measurement must follow the rendered 12px native title, not the inherited 15px surface font");
  assert.equal(canvasContext.font, "600 12px Arial");
  context.measureNativeTitle("Publish the field guide", "task-title", { fontSizePx: 12, fontWeight: 600 });
  assert.equal(canvasContext.font, "600 12px Inherited UI", "theme fonts must be measured when no font override is supplied");
});

test("formal task timeline disposes an existing native mount before replacing its container", () => {
  const view = fs.readFileSync(sourcePath("views/task-timeline/view.js"), "utf8");
  const renderStart = view.indexOf("async function taskTimelineRender()");
  const renderBody = view.slice(renderStart, view.indexOf("\n}\n\nawait taskTimelineRender", renderStart));

  assert.match(view, /function taskTimelineCleanupExisting\(root\)/);
  assert.match(view, /const cleanup = node\.__noriaTaskTimelineCleanup/);
  assert.ok(
    renderBody.indexOf("taskTimelineCleanupExisting(mount)") < renderBody.indexOf("mount.empty()"),
    "the previous backend must be disposed before its DOM is removed"
  );
  assert.match(view, /function taskTimelineRunIsCurrent\(\)[\s\S]{0,220}isTimelineRuntimeCurrent/);
  assert.match(renderBody, /taskTimelineRunIsCurrent\(\)/);
  assert.match(renderBody, /backendInstance\.dispose\(\)[\s\S]{0,180}root\.remove\?\.\(\)/);
});

test("zero-size native panes resume through one resize observer without rebuilding the model", async () => {
  const harness = createHarness({ rect: { width: 0, height: 0 } });
  const instance = await harness.engine.mountTimelineBackend("native", harness.backendContext);
  harness.flushFrame();

  assert.equal(harness.calls.renders.length, 0);
  assert.equal(instance.getDiagnostics().state, "waiting-size");
  assert.equal(harness.calls.indexInputs.length, 1);

  harness.timelineEl.rect = { left: 0, top: 0, width: 278, height: 360 };
  harness.resizeCallbacks[0]();
  assert.equal(harness.frames.length, 1);
  harness.flushFrame();

  assert.equal(harness.calls.renders.length, 1);
  assert.equal(harness.calls.indexInputs.length, 1);
  assert.equal(instance.getDiagnostics().state, "ready");
  instance.dispose();
  instance.dispose();
  assert.equal(harness.calls.interactionCleanups, 1);
  assert.equal(harness.calls.rendererDisposals, 1);
  assert.equal(harness.calls.resizeCleanups, 1);
});

test("native interactions adapt task keys to source-open and existing task-edit services", async () => {
  const opened = [];
  const committed = [];
  const harness = createHarness({
    services: {
      openSource(event) {
        opened.push(event);
        return true;
      },
      commitDrag(payload) {
        committed.push(payload);
        return true;
      }
    }
  });
  const instance = await harness.engine.mountTimelineBackend("native", harness.backendContext);
  harness.flushFrame();
  const interactions = harness.calls.interactionOptions[0];
  const task = interactions.getTask("task:a");
  assert.equal(task.title, "Task A");

  interactions.openSource({ taskKey: "task:a" });
  assert.equal(opened[0].id, "task:a");

  const previewStart = Date.parse("2026-07-11T10:00:00+08:00");
  const previewEnd = Date.parse("2026-07-11T11:00:00+08:00");
  interactions.previewTaskTime({ taskKey: "task:a", startMs: previewStart, endMs: previewEnd });
  harness.flushFrame();
  assert.equal(harness.calls.layoutInputs.at(-1).eventIndex.events[0].startMs, previewStart);
  interactions.cancelTaskPreview({ taskKey: "task:a" });
  harness.flushFrame();
  assert.equal(harness.calls.layoutInputs.at(-1).eventIndex.events[0].startMs, task.startMs);

  await interactions.commitTaskTime({
    taskKey: "task:a",
    role: "end",
    startMs: previewStart,
    endMs: previewEnd
  }, { target: { id: "pointer-target" } });
  assert.equal(committed.length, 1);
  assert.equal(committed[0].event.id, "task:a");
  assert.equal(committed[0].role, "end");
  assert.equal(committed[0].dates.start.getTime(), previewStart);
  assert.equal(committed[0].dates.end.getTime(), previewEnd);
  assert.equal(committed[0].timelineEl, harness.timelineEl);
  instance.dispose();
});

test("native pan and zoom report backend-neutral manual scale state", async () => {
  const manualStates = [];
  const harness = createHarness({
    context: {
      manualScaleDebounceMs: 0,
      onManualScaleState(state) {
        manualStates.push(state);
      }
    }
  });
  const instance = await harness.engine.mountTimelineBackend("native", harness.backendContext);
  harness.flushFrame();
  const interactions = harness.calls.interactionOptions[0];
  const current = interactions.getViewport();
  interactions.updateViewport({
    ...current,
    centerMs: current.centerMs + 24 * 60 * 60 * 1000,
    msPerPx: current.msPerPx * 2
  });

  assert.equal(manualStates.length, 1);
  assert.match(manualStates[0].manualCenter, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(Number.isInteger(manualStates[0].manualZoomIndex), true);
  assert.equal(Number.isInteger(manualStates[0].manualOverviewZoomIndex), true);
  instance.dispose();
});

test("native centerOn updates the rendered main viewport without rebuilding events", async () => {
  const harness = createHarness();
  const instance = await harness.engine.mountTimelineBackend("native", harness.backendContext);
  harness.flushFrame();
  const indexBuilds = harness.calls.indexInputs.length;
  const target = Date.parse("2026-07-11T16:00:00+08:00");

  instance.centerOn(target);
  harness.flushFrame();

  assert.equal(harness.calls.layoutInputs.at(-1).viewport.centerMs, target);
  assert.equal(instance.getDiagnostics().mainCenterMs, target);
  assert.equal(harness.calls.indexInputs.length, indexBuilds);
  instance.dispose();
});

test("native rendering falls back once when a background-pane animation frame is suspended", async () => {
  const stalledFrames = [];
  const fallbackTimers = [];
  const harness = createHarness({
    context: {
      requestFrame(callback) {
        stalledFrames.push(callback);
        return stalledFrames.length;
      },
      cancelFrame() {},
      setFrameFallback(callback) {
        fallbackTimers.push(callback);
        return fallbackTimers.length;
      },
      clearFrameFallback() {},
      frameFallbackMs: 40
    }
  });

  const instance = await harness.engine.mountTimelineBackend("native", harness.backendContext);
  assert.equal(harness.calls.renders.length, 0);
  assert.equal(fallbackTimers.length, 1);
  fallbackTimers[0]();
  assert.equal(harness.calls.renders.length, 1);
  assert.equal(instance.getDiagnostics().framePending, false);

  stalledFrames[0]();
  assert.equal(harness.calls.renders.length, 1, "a late animation frame must not repaint the same batch");
  instance.dispose();
});

test("formal task timeline loads provider modules before mounting the native backend", () => {
  const view = fs.readFileSync(sourcePath("views/task-timeline/view.js"), "utf8");
  const ensureStart = view.indexOf("async function taskTimelineEnsureRuntime");
  const ensureEnd = view.indexOf("\n}\n\nfunction taskTimelineRows", ensureStart);
  const ensureBody = view.slice(ensureStart, ensureEnd);
  const expectedOrder = [
    "TASK_TIMELINE_EVENT_MODEL_PATH",
    "TASK_TIMELINE_TASK_ADAPTER_PATH",
    "TASK_TIMELINE_TASK_EDIT_PATH",
    "TASK_TIMELINE_ANNOTATION_PROVIDER_PATH",
    "TASK_TIMELINE_POMODORO_PROVIDER_PATH",
    "TASK_TIMELINE_TRACE_PROVIDER_PATH",
    "TASK_TIMELINE_ENGINE_CONTRACT_PATH",
    "TASK_TIMELINE_NATIVE_VIEWPORT_PATH",
    "TASK_TIMELINE_NATIVE_EVENT_INDEX_PATH",
    "TASK_TIMELINE_NATIVE_OVERVIEW_PATH",
    "TASK_TIMELINE_NATIVE_LAYOUT_PATH",
    "TASK_TIMELINE_NATIVE_RENDERER_PATH",
    "TASK_TIMELINE_NATIVE_INTERACTIONS_PATH",
    "TASK_TIMELINE_NATIVE_BACKEND_PATH"
  ];

  let previous = -1;
  expectedOrder.forEach((token) => {
    const current = ensureBody.indexOf(token);
    assert.ok(current > previous, `${token} must keep its runtime dependency order`);
    previous = current;
  });
  assert.ok(
    view.indexOf("await taskTimelineEnsureRuntime") < view.indexOf('mountTimelineBackend("native"'),
    "the provider runtime must be ready before the native backend mounts"
  );
});

test("formal task timeline derives trace range from the current event extent", () => {
  const view = fs.readFileSync(sourcePath("views/task-timeline/view.js"), "utf8");
  const start = view.indexOf("async function taskTimelineCollectTraces");
  const end = view.indexOf("\n}\n\nfunction taskTimelineNormalizeFilter", start);
  const body = view.slice(start, end);

  assert.match(body, /Date\.parse\(event\?\.start\)/);
  assert.match(body, /Date\.parse\(event\?\.end \|\| event\?\.start\)/);
  assert.match(body, /start:\s*starts\.length \? new Date\(Math\.min\(\.\.\.starts\)\)\.toISOString\(\) : ""/);
  assert.match(body, /end:\s*ends\.length \? new Date\(Math\.max\(\.\.\.ends\)\)\.toISOString\(\) : ""/);
  assert.match(body, /getTimelineTraces\(\{[\s\S]*source:\s*\{ pages: taskTimelinePages \}/);
});

test("formal task timeline rejects stale Markdown before drag writeback", () => {
  const view = fs.readFileSync(sourcePath("views/task-timeline/view.js"), "utf8");
  const start = view.indexOf("async function taskTimelineCommitDrag");
  const end = view.indexOf("\n}\n\nfunction taskTimelineNormalizeRange", start);
  const body = view.slice(start, end);
  const staleCheck = body.indexOf("snapshot.replace");
  const conflictState = body.indexOf('"stale-source"');
  const writeback = body.indexOf("app.vault.modify");

  assert.ok(staleCheck >= 0 && conflictState > staleCheck, "source identity must be checked before conflict feedback");
  assert.ok(writeback > conflictState, "a stale source must be rejected before vault.modify");
  assert.match(body, /if \(typeof app\.vault\.process === "function"\)/);
  assert.match(body, /await app\.vault\.process\(file, applyDrag\)/);
  assert.doesNotMatch(body, /const text = await app\.vault\.read\(file\)/);
  assert.match(body, /requestRefresh\?\.\("timeline", "task-timeline-drag-conflict"\)/);
});

test("native range previews and annotation drafts cancel without changing canonical events", async () => {
  const modes = [];
  const harness = createHarness({ settings: { markMode: true }, context: { onMarkModeChange: value => modes.push(value) } });
  const instance = await harness.engine.mountTimelineBackend("native", harness.backendContext);
  harness.flushFrame();
  const interactions = harness.calls.interactionOptions[0];
  interactions.previewRange({ startMs: Date.parse("2026-07-11T09:02:00+08:00"), endMs: Date.parse("2026-07-11T10:01:00+08:00") });
  harness.flushFrame();
  assert.equal(harness.calls.updates.at(-1).model.mainPlan.rangePreview.startMs, Date.parse("2026-07-11T09:00:00+08:00"));
  instance.previewAnnotation({ id: "draft", layer: "annotation", title: "Draft phase", start: "2026-07-11T09:00:00+08:00", end: "2026-07-11T10:00:00+08:00" });
  harness.flushFrame();
  assert.equal(harness.calls.layoutInputs.at(-1).events.length, 3);
  assert.equal(instance.getDiagnostics().eventCount, 2);
  instance.clearAnnotationPreview();
  interactions.cancelRangePreview();
  harness.flushFrame();
  assert.equal(harness.calls.layoutInputs.at(-1).events.length, 2);
  assert.equal(harness.calls.updates.at(-1).model.mainPlan.rangePreview, undefined);
  assert.equal(interactions.markMode, false);
  assert.equal(modes.at(-1), false);
  instance.dispose();
});
