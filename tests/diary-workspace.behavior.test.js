const test = require("node:test"), assert = require("node:assert/strict");
const vm = require("node:vm"), fs = require("node:fs"), path = require("node:path");
const moduleContext = {exports: {}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../src/diary-workspace.js"),"utf8"), {
  module: moduleContext, require: id => id==="./diary-navigation.js"?require("../src/diary-navigation.js"):({}), clearTimeout, setTimeout
});
const {DiaryWorkspace} = moduleContext.exports;
test("folding a diary module cannot conceal a failed save or a newly selected date",async()=>{
  const d=Object.create(DiaryWorkspace.prototype),folds=[];
  d.recordBody={hidden:false};d.session={dirty:true};
  d.setModuleCollapsed=(kind,value)=>folds.push([kind,value]);
  d.flush=async()=>{};
  await d.toggleModule("record");assert.equal(folds.length,0);
  d.session.dirty=false;d.review={state:{final:{dirty:true}}};
  await d.toggleModule("record");assert.equal(folds.length,0);
  d.review.state.final.dirty=false;
  d.flush=async()=>{d.session={dirty:false};};
  await d.toggleModule("record");assert.equal(folds.length,0);
  d.flush=async()=>{};await d.toggleModule("record");
  assert.deepEqual(folds,[["record",true]]);
  d.recordBody.hidden=true;d.flush=()=>assert.fail("expansion must not trigger a save");
  await d.toggleModule("record");assert.deepEqual(folds.at(-1),["record",false]);
});
test("record and review stay visible together and share the selected period",async()=>{
  const d=Object.create(DiaryWorkspace.prototype),calls=[];d.article={hidden:true};d.reviewHost={hidden:true};d.root={dataset:{}};
  d.session={model:{selection:{mode:"daily",period:"2026-09-22",anchorDate:"2026-09-22"}}};d.intent="record";
  d.plugin={renderReviewCenterInHost:async(_host,options)=>{calls.push(options);return {selection:options.selection,reload:async()=>calls.push("reload")};}};
  await d.renderIntent();assert.equal(d.article.hidden,false);assert.equal(d.reviewHost.hidden,false);assert.equal(typeof calls[0].beforeEdit,"function");
  d.intent="review";await d.renderIntent();assert.equal(d.article.hidden,false);assert.equal(d.reviewHost.hidden,false);assert.equal(calls[1],"reload");
});
test("review editing waits for diary save and does not proceed through conflicts",async()=>{
  const d=Object.create(DiaryWorkspace.prototype),calls=[];d.session={editing:true,dirty:true};d.editor={isComposing:()=>false};
  d.flush=async()=>calls.push("flush");d.renderContent=()=>calls.push("preview");d.review={reload:async()=>calls.push("reload")};
  assert.equal(await d.prepareReviewEdit(),false);assert.equal(d.session.editing,true);
  d.flush=async()=>{calls.push("save");d.session.dirty=false;};assert.equal(await d.prepareReviewEdit(),true);
  assert.deepEqual(calls,["flush","save","preview","reload"]);assert.equal(d.session.editing,false);
});
test("diary editing first saves review and refreshes its source baseline",async()=>{
  const d=Object.create(DiaryWorkspace.prototype),calls=[];const selection={mode:"daily",period:"2026-09-22"};d.session={model:{selection},editing:false};
  d.review={state:{final:{dirty:false}},flushReviewEdits:async()=>calls.push("save review"),reviewWorkspace:{showOverview:async()=>calls.push("preview review")}};
  d.refreshDocument=async()=>calls.push("reload diary");d.renderContent=()=>calls.push("edit diary");await d.startEditing();
  assert.deepEqual(calls,["save review","preview review","reload diary","edit diary"]);assert.equal(d.session.editing,true);
  d.session.editing=false;d.review.state.final.dirty=true;await d.startEditing();assert.equal(d.session.editing,false);
});

test("task refresh preserves the Home shell and diary document", async()=>{
  const mod={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../src/workbench.js"),"utf8"),{module:mod,require:()=>({})});
  const w=Object.create(mod.exports.NoriaWorkbench.prototype),calls=[];
  const panel={scrollTop:137,__noriaHomeTaskRefresh:async()=>calls.push("home tasks"),empty:()=>assert.fail("Home must stay mounted")};
  w.loads=new Map([["home",Promise.resolve()]]);w.pages=new Map([["home",{panel}]]);w.active="diary";
  const custom={scrollTop:82,__noriaHomeTaskRefresh:async()=>calls.push("custom tasks"),empty:()=>assert.fail("Custom page must stay mounted")};
  w.store={read:()=>({pages:[{id:'page-reading',widgets:[]}]})};w.loads.set('page-reading',Promise.resolve());w.pages.set('page-reading',{panel:custom});
  w.diary={refreshTasks:async()=>calls.push("diary tasks"),refresh:()=>assert.fail("Do not remount the document")};
  await w.refreshTasks();
  assert.deepEqual(calls,["home tasks","diary tasks","custom tasks"]);assert.equal(panel.scrollTop,137);assert.equal(custom.scrollTop,82);
});

test("refresh cannot replace input that arrives while the date document is loading", async () => {
  const d = Object.create(DiaryWorkspace.prototype), preserved = [];
  const selection = {mode:"daily",period:"2099-01-01",anchorDate:"2099-01-01"};
  const model = {selection,raw:"Saved text",body:"Saved text",exists:true};
  let resolveLoad, started;
  const loading = new Promise(resolve => {started = resolve;});
  d.plugin = {resolveReviewSelection: () => selection};
  d.store = {preserve: async (_,body) => preserved.push(body),save:async(model,body)=>({...model,raw:body,body}),load: () => {started(); return new Promise(resolve => {resolveLoad=resolve;});}};
  d.session = {model,body:model.body,dirty:false,editing:true};
  d.sessions = new Map([["daily:2099-01-01",d.session]]);
  d.generation=0; d.root={}; d.calendarState={}; d.cards={setSelection:async()=>{}};
  d.capture=()=>{}; d.renderToolbar=()=>{}; d.renderContent=()=>{}; d.renderCalendar=async()=>{};
  d.renderActions=()=>{};d.feedback={setText(){}};
  const change = d.select(selection);
  await loading;
  assert.equal(d.root.inert,true);
  d.session.body="Saved text + typed during refresh"; d.session.dirty=true;
  resolveLoad({...model}); await change;
  assert.equal(d.session.body,"Saved text + typed during refresh");
  assert.equal(preserved.at(-1),d.session.body);
  assert.equal(d.root.inert,false);
});

test("unrelated data refresh leaves the current document and calendar DOM intact", async () => {
  const d = Object.create(DiaryWorkspace.prototype);
  const model = {selection:{mode:"daily",anchorDate:"2099-01-01"},path:"2099-01-01.md",raw:"Unchanged",exists:true};
  d.session = {model,dirty:false};
  d.store = {load:async()=>({...model})};
  d.select = async()=>{assert.fail("An unchanged document must not remount its editor or calendar");};
  await d.refresh();
});

test("the expanded diary task list stays expanded after a task refresh",()=>{
  const d=Object.create(DiaryWorkspace.prototype),rendered=[],buttons=[];
  const area={createDiv:()=>area,createEl:()=>area};
  d.session={};d.root={dataset:{},querySelectorAll:()=>[]};d.taskHost={querySelector:()=>null};d.focusHost={};
  d.tasks={current:false,focus:[],pending:[1,2,3,4,5],done:[]};
  d.t=k=>k;d.cards={section:()=>({body:area}),setAvailable(){}};
  d.renderTaskRow=(_,row)=>rendered.push(row);d.button=(_,label,fn)=>{buttons.push(fn);return{remove(){}};};
  d.renderTasks();assert.equal(rendered.length,3);buttons[0]();assert.equal(rendered.length,5);
  rendered.length=0;buttons.length=0;d.renderTasks();assert.equal(rendered.length,5);assert.equal(buttons.length,0);
});
