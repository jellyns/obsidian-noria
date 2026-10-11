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
    buildDateTicks() { return []; },
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
  if(options.exact){run("native-viewport.js");run("time-window.js");}
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
  assert.deepEqual(Object.keys(instance).sort(), ["canFitTasks", "captureViewState", "centerOn", "clearAnnotationPreview", "dispose", "fitTasks", "flushWindow", "getDiagnostics", "getFocus", "getFocusMagnification", "getWindow", "host", "previewAnnotation", "refresh", "resize", "restoreViewState", "selectAnnotation", "setFocusMagnification", "setMarkMode", "setOverviewVisibility", "setWindow"]);
  assert.equal(instance.getDiagnostics().eventCount, 2);
  assert.equal(instance.getDiagnostics().renderCount, 1);

  const dayStart = new Date("2026-07-11T09:00:00+08:00");
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
  assert.equal(mainMarkers.find((marker) => marker.kind === "today").bounds.height, 360 - 28);
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

  assert.equal(harness.calls.layoutInputs[0].eventIndex.events[0].startMs, new Date(2026, 6, 10).getTime());
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
  assert.match(view, /onRender:\s*\(\)\s*=>\s*\{\s*taskTimelineSetState\(root,\s*stage,\s*"ready"/);
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

test("new project views fit the complete schedule and keep the range when resized",async()=>{
  const events=[{id:"a",layer:"task",start:"2026-09-23T08:00:00+08:00",end:"2026-09-23T09:00:00+08:00"},{id:"b",layer:"task",start:"2026-10-03T08:00:00+08:00"}];
  const h=createHarness({exact:true,events,settings:{groupBy:"projects",focusMagnification:false}});
  const b=await h.engine.mountTimelineBackend("native",h.backendContext);h.flushFrame();
  const window=JSON.parse(JSON.stringify(b.getWindow()));
  assert.ok(window.startMs<Date.parse(events[0].start));
  assert.ok(window.endMs>Date.parse(events[1].start));
  b.resize(430,540);h.flushFrame();
  assert.deepEqual(JSON.parse(JSON.stringify(b.getWindow())),window);
  assert.equal(h.calls.layoutInputs.at(-1).widthPx,430);
  b.setWindow({startMs:Date.parse('2027-01-01'),endMs:Date.parse('2027-02-01')});h.flushFrame();
  assert.equal(b.canFitTasks(),true);assert.equal(b.fitTasks(),true);h.flushFrame();
  assert.deepEqual(JSON.parse(JSON.stringify(b.getWindow())),window);
  b.dispose();
});

test("fit scheduled tasks ignores activity dates and leaves an empty task window unchanged",async()=>{
  const events=[{id:'note',layer:'note',start:'2020-01-01'},{id:'task',layer:'task',start:'2026-09-23T08:00:00+08:00'}];
  const h=createHarness({exact:true,events}),b=await h.engine.mountTimelineBackend('native',h.backendContext);h.flushFrame();
  assert.equal(b.fitTasks(),true);h.flushFrame();
  const range=JSON.parse(JSON.stringify(b.getWindow()));assert.ok(range.startMs>Date.parse('2026-09-22'));
  b.refresh({events:events.slice(0,1)});h.flushFrame();
  assert.equal(b.canFitTasks(),false);assert.equal(b.fitTasks(),false);
  assert.deepEqual(JSON.parse(JSON.stringify(b.getWindow())),range);b.dispose();
});

test('view restoration survives another refresh before its first visible paint',async()=>{
 const h=createHarness({exact:true,settings:{groupBy:'projects'}}),b=await h.engine.mountTimelineBackend('native',h.backendContext);
 assert.equal(b.captureViewState(),null);
 const pending={scrollTop:120,projectKey:'P.md',projectOffset:-10,previousProjectWindow:null};
 b.restoreViewState(pending);
 assert.equal(JSON.stringify(b.captureViewState()),JSON.stringify(pending));
 h.flushFrame();assert.equal(JSON.stringify(b.captureViewState()),JSON.stringify(pending));
 b.dispose();assert.equal(b.captureViewState(),null);
});

test('overview visibility changes available height without changing the chosen date window',async()=>{
 const h=createHarness({exact:true,settings:{overviewVisibility:'auto'}}),b=await h.engine.mountTimelineBackend('native',h.backendContext);h.flushFrame();
 const original=JSON.stringify(b.getWindow());
 assert.equal(h.calls.renders.at(-1).model.overviewPlan.heightPx,0);
 b.setOverviewVisibility('show');h.flushFrame();
 const model=h.calls.updates.at(-1).model;
 assert.equal(model.overviewPlan.heightPx,24);assert.equal(model.mainPlan.axisHeightPx,28);
 assert.equal(JSON.stringify(b.getWindow()),original);
 b.setOverviewVisibility('hide');h.flushFrame();assert.equal(h.calls.updates.at(-1).model.overviewPlan.heightPx,0);b.dispose();
});

test('project reveal fits only assigned canonical events and cannot change a disposed timeline',async()=>{
 const events=[{id:'parent',layer:'task',start:'2026-05-01T00:00:00Z'},{id:'child',layer:'task',start:'2026-10-01T00:00:00Z'},{id:'note',layer:'note',start:'2020-01-01T00:00:00Z'}];
 const h=createHarness({exact:true,events,settings:{groupBy:'projects'}}),b=await h.engine.mountTimelineBackend('native',h.backendContext);h.flushFrame();
 const reveal=h.calls.renders[0].model.mainPlan.onProjectFit;
 assert.equal(reveal({scheduledEventIds:['parent']}),true);h.flushFrame();
 const range=JSON.parse(JSON.stringify(b.getWindow()));
 assert.ok(range.startMs<Date.parse('2026-05-01')&&range.startMs>Date.parse('2026-04-30'));
 assert.ok(range.endMs>Date.parse('2026-05-01')&&range.endMs<Date.parse('2026-05-02'));
 assert.equal(reveal({scheduledEventIds:['missing']}),false);
 b.dispose();assert.equal(reveal({scheduledEventIds:['child']}),false);assert.deepEqual(JSON.parse(JSON.stringify(b.getWindow())),range);
});

test("exact windows survive backend resize and reload, while free zoom clears the preset",async()=>{
  const w=require("../src/runtime/views/task-timeline/time-window.js"),selected=w.at(+new Date("2026-09-23T07:00:00"),{amount:18,unit:"hour"});
  const h=createHarness({exact:true,settings:{timeWindow:selected}}),b=await h.engine.mountTimelineBackend("native",h.backendContext);h.flushFrame();
  assert.deepEqual(JSON.parse(JSON.stringify(b.getWindow())),selected);b.resize(900,400);h.flushFrame();
  const v=h.calls.interactionOptions[0].getViewport(),actual=h.context?.noriaTaskTimeline?.nativeViewport?.visibleRange(v);
  assert.equal(v.widthPx,900);assert.deepEqual(JSON.parse(JSON.stringify(b.getWindow())),selected);
  h.calls.interactionOptions[0].updateViewport({...v,msPerPx:v.msPerPx*1.5});h.flushFrame();assert.equal(b.getWindow().scale,null);
  const saved=JSON.parse(JSON.stringify(b.getWindow()));b.dispose();
  const h2=createHarness({exact:true,settings:{timeWindow:saved}}),b2=await h2.engine.mountTimelineBackend("native",h2.backendContext);h2.flushFrame();assert.deepEqual(JSON.parse(JSON.stringify(b2.getWindow())),saved);b2.dispose();
});

test("focus magnification changes local spacing while retaining exact endpoints and saved preference",async()=>{
  const w=require("../src/runtime/views/task-timeline/time-window.js"),focus=+new Date("2026-09-24T12:00:00"),selected=w.around(focus,{amount:1,unit:"month"}),states=[];
  const h=createHarness({exact:true,settings:{timeWindow:selected,focusMagnification:false},context:{manualScaleDebounceMs:0,onManualScaleState:s=>states.push(s)}});
  const b=await h.engine.mountTimelineBackend("native",h.backendContext);h.flushFrame();
  assert.equal(b.getFocusMagnification(),false);assert.equal(b.getFocus(),focus);
  const v=h.context.noriaTaskTimeline.nativeViewport,get=()=>h.calls.interactionOptions[0].getViewport();
  const before=v.dateMsToPx(get(),focus+3600000)-v.dateMsToPx(get(),focus);
  b.setFocusMagnification(true);h.flushFrame();const range=v.visibleRange(get());
  assert.ok(v.dateMsToPx(get(),focus+3600000)-v.dateMsToPx(get(),focus)>before);
  assert.ok(Math.abs(range.startMs-selected.startMs)<2&&Math.abs(range.endMs-selected.endMs)<2);
  assert.equal(b.getFocus(),focus);assert.equal(states.at(-1).focusMagnification,true);
  b.setFocusMagnification(false);b.flushWindow();assert.equal(states.at(-1).focusMagnification,false);
  const saved=states.at(-1);b.dispose();
  const next=createHarness({exact:true,settings:{timeWindow:saved.timeWindow,focusMagnification:saved.focusMagnification}}),reopened=await next.engine.mountTimelineBackend("native",next.backendContext);
  next.flushFrame();assert.equal(reopened.getFocus(),focus);assert.equal(reopened.getFocusMagnification(),false);reopened.dispose();
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

test("note-only timeline does not restrict file activity to unrelated task dates", async () => {
  const view = fs.readFileSync(sourcePath("views/task-timeline/view.js"), "utf8");
  const start = view.indexOf("async function taskTimelineCollectTraces");
  const end = view.indexOf("\nfunction taskTimelineNormalizeTagList", start);
  let request;
  const context = { timelineTraces:null, timelineFilter:{layers:["note"]}, taskTimelinePages:'"Noria/Projects"', taskTimelineNormalizeFilter:raw=>raw, taskTimelineBridge:{data:{getTimelineTraces:async input=>{request=input;return {notes:[{path:"Noria/Projects/Today.md"}]};}}} };
  vm.runInNewContext(view.slice(start,end),context);
  const result = await context.taskTimelineCollectTraces([{start:"2020-01-01",end:"2020-01-02"}]);
  assert.equal(request.range,undefined);
  assert.deepEqual(Array.from(request.layers),["note"]);
  assert.equal(result.notes[0].path,"Noria/Projects/Today.md");
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
