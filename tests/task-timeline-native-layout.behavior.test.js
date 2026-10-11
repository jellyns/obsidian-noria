const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { sourcePath } = require("./source-paths.cjs");

test("project overview keeps unscheduled tasks in its header and only allocates visible rows", () => {
  const {viewport,layout}=loadLayoutHooks();
  const state=viewport.createViewport({centerMs:Date.parse('2026-09-12T12:00:00+08:00'),msPerPx:3600000/30,widthPx:600});
  const options={viewport:state,widthPx:600,heightPx:120,groupBy:'projects',locale:'zh-CN',measureText:()=>60,
    projects:[{root:'Projects/A',name:'A',targetPath:'Projects/A/A.md'},{root:'Projects/A/sub',name:'Sub'},{root:'Projects/Empty.md',name:'Empty'}],
    events:[{id:'scheduled:1',taskKey:'scheduled',layer:'task',title:'第一段',start:'2026-09-12T09:00:00+08:00',end:'2026-09-12T10:00:00+08:00',source:{path:'Projects/A/A.md',line:8}},
      {id:'scheduled:2',taskKey:'scheduled',layer:'task',title:'第二段',start:'2026-09-12T14:00:00+08:00',end:'2026-09-12T15:00:00+08:00',source:{path:'Projects/A/A.md',line:8}},
      {id:'nested',taskKey:'nested',layer:'task',title:'子项目',start:'2026-09-12T13:00:00+08:00',source:{path:'Projects/A/sub/Note.md',line:1}}],
    unplaced:[{id:'unscheduled',title:'未安排',layer:'task',source:{path:'Projects/A/A.md',line:3}}]};
  const collapsed=layout.buildRenderPlan(options);
  assert.equal(collapsed.projectRows.length,2);
  assert.equal(collapsed.taskUnits.length,0);
  assert.equal(collapsed.projectRows[0].count,2);
  assert.equal(collapsed.projectRows[1].count,1);
  assert.equal(collapsed.projectSummaries.length,2);
  assert.equal(collapsed.projectSummaries[0].startMs,Date.parse('2026-09-12T09:00:00+08:00'));
  const expanded=layout.buildRenderPlan({...options,expandedProjects:['Projects/A']});
  assert.deepEqual(plain(expanded.projectRows[0].unplacedTasks.map(t=>t.id)),['unscheduled']);
  assert.equal(expanded.projectRows.filter(r=>!r.project).length,2);
  assert.equal(expanded.taskUnits.length,2);
  assert.ok(expanded.taskUnits[0].title.bounds.bottom<expanded.taskUnits[1].title.bounds.top);
  assert.equal(layout.findLayoutCollisions(expanded).length,0);
  assert.deepEqual(plain(expanded.taskUnits.map(u=>u.title.text)),["第一段","第二段"]);
  assert.notEqual(expanded.taskUnits[0].taskKey,expanded.taskUnits[1].taskKey);
  assert.ok(expanded.contentHeightPx>expanded.heightPx);
  const panned=layout.buildRenderPlan({...options,expandedProjects:['Projects/A'],viewport:viewport.createViewport({...state,centerMs:Date.parse('2026-10-12')})});
  assert.deepEqual(plain(panned.projectRows.map(r=>r.key)),plain(expanded.projectRows.filter(r=>r.project).map(r=>r.key)));
  assert.equal(panned.projectRows[1].top,64); // one compact dated navigation row
  assert.equal(expanded.projectRows.find(row=>row.key==='Projects/A/sub').top-panned.projectRows[1].top,54);
  assert.equal(panned.contentHeightPx,options.heightPx);
  assert.equal(panned.projectRows[0].unplacedTasks[0].id,'unscheduled');
  assert.equal(panned.taskUnits.length,0);
  assert.equal(panned.projectRows[0].visibleTaskCount,0);
  assert.equal(panned.projectRows[0].outsideDirection,'earlier');
  assert.equal(expanded.projectRows[0].visibleTaskCount,1);
  assert.deepEqual(plain(expanded.projectRows[0].scheduledEventIds),['scheduled:1','scheduled:2']);
  assert.equal(expanded.projectRows.find(row=>row.key==='Projects/Empty.md'),undefined);
  const selected=layout.buildRenderPlan({...options,projectRoot:'Projects/Empty.md'});
  assert.equal(selected.projectRows.find(row=>row.key==='Projects/Empty.md').schedule,null);
});

test('project schedule on both sides of a window is not mistaken for visible work',()=>{
 const {viewport,layout}=loadLayoutHooks(),center=Date.parse('2026-09-12T12:00:00Z');
 const view=viewport.createViewport({centerMs:center,msPerPx:60000,widthPx:600});
 const events=[-86400000,86400000].map((offset,i)=>({id:'date'+i,taskKey:'task'+i,layer:'task',title:'Task',source:{path:'P.md'},start:new Date(center+offset).toISOString()}));
 const plan=layout.buildRenderPlan({viewport:view,widthPx:600,heightPx:200,events,groupBy:'projects',projects:[{root:'P.md',name:'Project'}],expandedProjects:['P.md']});
 assert.equal(plan.projectRows[0].visibleTaskCount,0);assert.equal(plan.projectRows[0].outsideDirection,'both');assert.equal(plan.taskUnits.length,0);
});

test("project view keeps unmatched sources separate instead of guessing membership",()=>{
  const {viewport,layout}=loadLayoutHooks();
  const plan=layout.buildRenderPlan({viewport:viewportFor(viewport),widthPx:278,heightPx:200,groupBy:'projects',projects:[{root:'Projects/One.md',name:'One'}],unplaced:[{id:'x',title:'外部',source:{path:'Projects/One-more.md',line:0}}]});
  assert.equal(plan.projectRows.length,1);
  assert.equal(plan.projectRows[0].key,'__other__');
  assert.equal(plan.projectRows[0].count,1);
  assert.equal(plan.projectSummaries.length,0);
});

test("short project intervals keep true endpoints inside an accessible click target",()=>{
  const {viewport,layout}=loadLayoutHooks();
  const centerMs=Date.parse('2026-09-12T12:00:00Z');
  const view=viewport.createViewport({centerMs,msPerPx:3600000,widthPx:600});
  const plan=layout.buildRenderPlan({viewport:view,widthPx:600,heightPx:200,groupBy:'projects',
    projects:[{root:'P.md',name:'Project'}],expandedProjects:['P.md'],
    events:[{id:'short',taskKey:'short',layer:'task',title:'A short task',source:{path:'P.md'},start:new Date(centerMs).toISOString(),end:new Date(centerMs+1800000).toISOString()}]});
  const unit=plan.taskUnits[0];
  assert.ok(unit.title.bounds.width>=80);
  assert.equal(unit.title.text,"A short task");
  assert.equal(unit.title.visible,true);
  assert.equal(unit.rail.bounds.left+unit.rail.bounds.width/2,300.25);
  assert.equal(unit.handles.end.bounds.left,300.5);
  assert.equal(unit.handles.start.bounds.right,300);
  assert.equal(unit.endMs-unit.startMs,1800000);
  assert.ok(unit.title.bounds.left>=300 && unit.title.bounds.right<=600);
  assert.ok(unit.title.bounds.bottom<=unit.rail.bounds.top);
});

test("project names remain readable inside long bars and at both clipped edges",()=>{
  const {viewport,layout}=loadLayoutHooks(),centerMs=Date.parse('2026-09-12T12:00:00Z');
  for(const widthPx of [280,1100]){
    const view=viewport.createViewport({centerMs,msPerPx:3600000/30,widthPx});
    const events=[[-50,50],[-50,0],[0,50]].map(([start,end],i)=>({id:'edge'+i,taskKey:'edge'+i,layer:'task',title:'A task with a readable title',source:{path:'P.md'},start:new Date(centerMs+start*3600000).toISOString(),end:new Date(centerMs+end*3600000).toISOString()}));
    const plan=layout.buildRenderPlan({viewport:view,widthPx,heightPx:300,groupBy:'projects',projects:[{root:'P.md',name:'Project'}],expandedProjects:['P.md'],events});
    assert.equal(plan.taskUnits.length,3);
    assert.equal(layout.findLayoutCollisions(plan).length,0);
    assert.equal(plan.taskUnits[0].inlineTitle,widthPx>480);
    for(const u of plan.taskUnits){
      assert.equal(u.title.text,events[0].title);
      assert.ok(u.title.visible && u.title.bounds.width>=100);
      assert.ok(u.title.bounds.left>=0 && u.title.bounds.right<=widthPx);
      assert.ok(u.handleZoneBounds.left<=u.title.bounds.left && u.handleZoneBounds.right>=u.title.bounds.right);
    }
  }
});

test('compact project titles share an origin, wrap long text and retain exact time coordinates',()=>{
 const {viewport,layout}=loadLayoutHooks(),centerMs=Date.parse('2026-10-10T12:00:00Z');
 const view=viewport.createViewport({centerMs,msPerPx:3600000,widthPx:400});
 const events=['Short','A long name that needs a second line'].map((title,i)=>({id:String(i),taskKey:String(i),layer:'task',title,source:{path:'P.md'},start:new Date(centerMs+i*86400000).toISOString(),end:new Date(centerMs+i*86400000+1800000).toISOString()}));
 const plan=layout.buildRenderPlan({viewport:view,widthPx:400,heightPx:260,groupBy:'projects',projects:[{root:'P.md',name:'P'}],expandedProjects:['P.md'],events,measureText:text=>text==='Short'?40:450});
 const [short,long]=plan.taskUnits;
 assert.equal(short.title.bounds.left,long.title.bounds.left);
 assert.ok(long.title.bounds.height>short.title.bounds.height);
 assert.ok(long.title.bounds.top>short.rail.bounds.bottom);
 assert.equal(short.handles.start.bounds.right,200);assert.equal(long.handles.start.bounds.right,224);
 assert.equal(short.handles.end.visible,false);assert.equal(long.inlineTitle,false);
 assert.ok(long.title.bounds.bottom<long.rail.bounds.top);
});

test('right-edge titles stay readable while their date marker remains at the actual date',()=>{
 const {viewport,layout}=loadLayoutHooks(),centerMs=Date.parse('2026-10-10T12:00:00Z');
 const view=viewport.createViewport({centerMs,msPerPx:3600000,widthPx:400});
 const plan=layout.buildRenderPlan({viewport:view,widthPx:400,heightPx:200,measureText:()=>120,events:[{id:'edge',taskKey:'edge',layer:'task',title:'A readable task name',start:new Date(centerMs+190*3600000).toISOString()}]});
 const unit=plan.taskUnits[0];assert.ok(unit.title.bounds.width>=120);assert.ok(unit.title.bounds.right<unit.point.bounds.left);assert.equal(unit.point.bounds.left+unit.point.bounds.width/2,390);assert.equal(unit.title.visible,true);
});

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

test("saturated mixed-source lanes remain named in scrollable content", () => {
  const { viewport, layout } = loadLayoutHooks();
  const state = viewport.createViewport({ centerMs: Date.parse("2026-09-12T12:00:00+08:00"),
    msPerPx: 3_600_000 / 50, widthPx: 1000 });
  const plan = layout.buildRenderPlan({ viewport: state, widthPx: 1000, heightPx: 160,
    measureText: () => 100,
    events: Array.from({ length: 12 }, (_, i) => ({ id: `range-${i}`, taskKey: `range-${i}`, layer: ["task","pomodoro","note"][i%3],
      title: `Garden task ${i}`, start: "2026-09-12T09:00:00+08:00", end: "2026-09-12T17:00:00+08:00" })) });
  const hidden = plan.taskUnits.filter((unit) => !unit.title.visible);
  assert.equal(hidden.length, 0);
  assert.equal(plan.hiddenTaskCount, 0);
  assert.ok(plan.contentHeightPx > plan.heightPx);
  assert.equal(layout.findLayoutCollisions(plan).length, 0);
  assert.equal(plan.taskUnits.filter(unit=>unit.readOnly).length, 8);
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

test('same task names show the shortest distinct source without repeating it on ordinary tasks',()=>{
  const {viewport,layout}=loadLayoutHooks();
  const events=['Projects/论文/材料.md','Projects/工作区/材料.md','Projects/工作区/计划.md'].map((path,i)=>({id:'same-'+i,layer:'task',title:i===2?'准备提纲':'整理材料',source:{path,line:5},start:'2026-07-11T12:00:00+08:00'}));
  const plan=layout.buildRenderPlan({events,viewport:viewportFor(viewport,400),widthPx:400,heightPx:200,locale:'zh',measureText});
  const labels=Object.fromEntries(plan.taskUnits.map(u=>[u.sourcePath,u.title.sourceLabel]));
  assert.equal(labels[events[0].source.path],'论文');
  assert.equal(labels[events[1].source.path],'工作区');
  assert.equal(labels[events[2].source.path],'');
  assert.equal(layout.findLayoutCollisions(plan).length,0);
});

test('long names and their source captions reserve collision-free space while rails retain actual dates',()=>{
  const {viewport,layout}=loadLayoutHooks(),view=viewportFor(viewport,320);
  const events=Array.from({length:12},(_,i)=>({id:'long-'+i,layer:'task',title:'核对本周论文材料并补充所有图表和参考文献的来源说明',source:{path:`P/项目${i}.md`,line:i},start:'2026-07-11T12:00:00+08:00',end:'2026-07-11T13:00:00+08:00'}));
  const plan=layout.buildRenderPlan({events,viewport:view,widthPx:320,heightPx:160,measureText});
  assert.equal(plan.taskUnits.length,12);
  assert.equal(layout.findLayoutCollisions(plan).length,0);
  assert.ok(plan.contentHeightPx>160);
  for(const u of plan.taskUnits){assert.equal(u.title.lines,2);assert.equal(u.title.bounds.height,48);assert.equal(u.rail.bounds.left,160);assert.equal(u.rail.bounds.width,12);}
});

test('multiple occurrences of one task do not create a duplicate-source caption',()=>{
  const {viewport,layout}=loadLayoutHooks();
  const events=[0,1].map(i=>({id:'part'+i,taskKey:'one-task',layer:'task',title:'阅读材料',source:{path:'P.md',line:3},start:`2026-07-11T${12+i}:00:00+08:00`}));
  const plan=layout.buildRenderPlan({events,viewport:viewportFor(viewport),widthPx:278,heightPx:160,measureText});
  assert.equal(plan.taskUnits.length,1);assert.equal(plan.taskUnits[0].title.sourceLabel,'');
});

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
    assert.equal(typography.fontWeight, 400);
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
  assert.equal(plan.taskUnits.find((unit) => unit.taskKey === "todo").title.fontWeight, 400);
  assert.equal(plan.taskUnits.find((unit) => unit.taskKey === "done").title.fontWeight, 400);
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
    if(unit.taskKey==='edge')assert.equal(unit.title.bounds.right+plan.metrics.markerGapPx,unit.point.bounds.left);
    else assert.equal(unit.title.bounds.left, unit.point.bounds.right + plan.metrics.markerGapPx);
    assert.ok(unit.point.bounds.left >= 0);
    assert.ok(unit.title.bounds.right <= 600, "edge titles must stay readable inside the pane without moving the date marker");
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

 test('project task titles use their own row width instead of the free-layout label cap',()=>{
 const {viewport,layout}=loadLayoutHooks();
 const view=viewport.createViewport({centerMs:Date.parse('2026-10-10T12:00:00Z'),msPerPx:60000,widthPx:800});
 const plan=layout.buildRenderPlan({viewport:view,widthPx:800,heightPx:200,groupBy:'projects',projects:[{root:'P.md',name:'P'}],expandedProjects:['P.md'],measureText:()=>480,
 events:[{id:'a',layer:'task',title:'An intentionally long task name',source:{path:'P.md'},start:'2026-10-10T12:00:00Z',end:'2026-10-10T12:30:00Z'}]});
 assert.ok(plan.taskUnits[0].title.bounds.width>=480);
 assert.ok(plan.taskUnits[0].title.bounds.right<=800);
 assert.equal(layout.findLayoutCollisions(plan).length,0);
 });


test('same-time tasks keep their numeric Markdown line order',()=>{
 const {viewport,layout}=loadLayoutHooks();
 const events=[12,3,20,2].map(line=>({id:'task:'+line,layer:'task',title:'Task '+line,start:'2026-07-11T12:00:00+08:00',source:{path:'Project.md',line}}));
 const plan=layout.buildRenderPlan({events,viewport:viewportFor(viewport),widthPx:278,heightPx:315,measureText});
 assert.deepEqual(Array.from(plan.taskUnits,u=>u.title.text),['Task 2','Task 3','Task 12','Task 20']);
});
