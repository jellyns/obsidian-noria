const test = require("node:test"), assert = require("node:assert/strict");
const vm = require("node:vm"), fs = require("node:fs"), path = require("node:path");
const moduleContext = {exports: {}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../src/diary-workspace.js"),"utf8"), {
  module: moduleContext, require: id => id==="./diary-navigation.js"?require("../src/diary-navigation.js"):({}), clearTimeout, setTimeout
});
const {DiaryWorkspace} = moduleContext.exports;

test('changing reading scope preserves an active full-note editor and only refreshes reading content',async()=>{
 const d=Object.create(DiaryWorkspace.prototype),editor={draft:'完整草稿'};let renders=0;
 d.session={editing:true};d.editor=editor;d.content={scrollTop:80};
 d.renderContent=()=>{renders++;d.content.scrollTop=0;d.contentReady=Promise.resolve();};
 d.refreshReadingScope();assert.equal(renders,0);assert.equal(d.editor,editor);assert.equal(editor.draft,'完整草稿');
 d.session.editing=false;d.refreshReadingScope();await d.contentReady;
 assert.equal(renders,1);assert.equal(d.content.scrollTop,80);
});
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
  d.reviewMenuButton={hidden:false};d.reviewSection={dataset:{}};
  await d.renderIntent();assert.equal(d.reviewMenuButton.hidden,true);assert.equal(typeof d.review.moduleMenuItems,"function");assert.equal(d.article.hidden,false);assert.equal(d.reviewHost.hidden,false);assert.equal(typeof calls[0].beforeEdit,"function");
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
  const area={createDiv:()=>area,createEl:()=>area,createSpan:()=>area,insertBefore(){}};
  d.session={};d.root={dataset:{},querySelectorAll:()=>[]};d.taskHost={querySelector:()=>null};d.plugin={t:k=>k};
  d.tasks={current:false,focus:[],pending:[1,2,3,4,5],done:[]};
  d.t=k=>k;d.cards={system:{text:zh=>zh},section:()=>({body:area,tools:area}),setAvailable(){}};
  d.renderTaskRow=(_,row)=>rendered.push(row);d.button=(_,label,fn)=>{if(label==='allTasks')buttons.push(fn);return{remove(){},addClass(){}};};
  d.renderTasks();assert.equal(rendered.length,3);buttons[0]();assert.equal(rendered.length,5);
  rendered.length=0;buttons.length=0;d.renderTasks();assert.equal(rendered.length,5);assert.equal(buttons.length,0);
});

test('priorities, other tasks and visible completions render once inside the same task card',()=>{
 const d=Object.create(DiaryWorkspace.prototype),rendered=[],sections=[],groups=[];
 const area={createDiv:options=>{if(options?.attr?.['data-task-group'])groups.push(options.attr['data-task-group']);return area;},createEl:()=>area,createSpan:()=>area,insertBefore(){}};
 Object.assign(d,{session:{model:{selection:{mode:'daily'}}},root:{dataset:{},querySelectorAll:()=>[]},taskHost:{querySelector:()=>null},plugin:{t:k=>k},
   tasks:{current:true,focus:[1,2,3],pending:[4,5,6,7],done:[8,9,10,11]},t:k=>k,
   cards:{system:{text:zh=>zh},section:(id,title)=>{sections.push([id,title]);return{body:area,tools:area};},setAvailable(){}},
   renderTaskRow:(_,row)=>rendered.push(row),button:()=>({addClass(){}})});
 d.renderTasks();
 assert.deepEqual(sections,[['tasks','待办']]);assert.deepEqual(groups,['focus','tasks']);
 assert.deepEqual(rendered,[1,2,3,4,5,6,8,9,10]);assert.equal(area.open,true);
});

test('collapsed review retains a single visible menu route back to its content',()=>{
  const d=Object.create(DiaryWorkspace.prototype);
  Object.assign(d,{review:{},reviewHost:{hidden:false},reviewTools:{hidden:false},reviewSection:{dataset:{}},reviewMenuButton:{hidden:true}});
  d.setModuleCollapsed('review',true);
  assert.equal(d.reviewHost.hidden,true);assert.equal(d.reviewTools.hidden,true);assert.equal(d.reviewMenuButton.hidden,false);
  d.setModuleCollapsed('review',false);
  assert.equal(d.reviewHost.hidden,false);assert.equal(d.reviewTools.hidden,false);assert.equal(d.reviewMenuButton.hidden,true);
});

test('external prose refresh replaces a clean reading model without reselecting the page',async()=>{
 const d=Object.create(DiaryWorkspace.prototype),selection={mode:'daily',anchorDate:'2085-06-12'},old={selection,path:'day.md',raw:'old',body:'old',exists:true},latest={...old,raw:'new',body:'new'};
 d.session={model:old,body:'old',dirty:false};d.store={load:async()=>latest};d.host={scrollTop:50};let renders=0;
 d.renderContent=()=>renders++;d.select=()=>assert.fail('Refresh must not rebuild the period or card layout');
 await d.refreshDocument();assert.equal(d.session.body,'new');assert.equal(d.session.model,latest);assert.equal(renders,1);assert.equal(d.host.scrollTop,50);
});

test('clean editor refresh keeps its instance and selection',async()=>{
 const d=Object.create(DiaryWorkspace.prototype),model={selection:{},path:'day.md',raw:'old',body:'old',exists:true};
 d.session={model,body:'old',dirty:false,editing:true};d.store={load:async()=>({...model,raw:'new',body:'new'})};d.host={scrollTop:25};d.plugin={app:{vault:{getAbstractFileByPath:()=>({path:'day.md'})}}};
 const position={anchor:{line:0,ch:1},head:{line:0,ch:2}},calls=[];
 const editor=d.editor={isComposing:()=>false,getPosition:()=>position,setValue:value=>calls.push(value),setFile:file=>calls.push(file.path),editor:{getValue:()=>d.session.body,setSelection:(a,b)=>calls.push([a,b])}};
 d.renderActions=()=>{};d.renderDailyState=()=>{};d.renderDrafts=()=>{};d.renderContent=()=>assert.fail('Do not replace the editor');d.select=()=>assert.fail('Do not reselect');
 await d.refreshDocument();assert.equal(d.editor,editor);assert.deepEqual(calls,['new',[position.anchor,position.head],'day.md']);assert.equal(d.session.body,'new');
});

test('automatic refresh leaves dirty, blocked, recovery and composing sessions untouched',async()=>{
 for(const flag of ['dirty','blocked','needsAdoption','composing']){
  const d=Object.create(DiaryWorkspace.prototype);d.session={model:{body:flag==='dirty'?'old':'draft'},body:'draft',[flag]:true};d.editor={isComposing:()=>flag==='composing',getPosition:()=>({}),editor:{getValue:()=>d.session.body}};d.store={load:()=>assert.fail('Protected content must not reload')};
  await d.refreshDocument();assert.equal(d.session.body,'draft');
 }
});

test('an external refresh result cannot overwrite a newer draft or a changed session',async()=>{
 for(const change of ['draft','session','baseline']){
  const d=Object.create(DiaryWorkspace.prototype),model={selection:{},path:'day.md',raw:'old',body:'old',exists:true};d.session={model,body:'old',dirty:false};let resolve;
  d.store={load:()=>new Promise(r=>resolve=r)};d.select=d.renderContent=()=>assert.fail('Stale load must not render');
  const pending=d.refreshDocument();if(change==='draft'){d.session.body='typing';d.session.dirty=true;}else if(change==='session')d.session={...d.session};else d.session.model={...model,raw:'own write'};
  const current=d.session;resolve({...model,raw:'external',body:'external'});await pending;assert.equal(d.session,current);assert.notEqual(d.session.body,'external');
 }
});
