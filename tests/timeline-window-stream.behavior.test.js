const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const w=require("../src/runtime/views/task-timeline/time-window.js");
const {buildStream,splitRecord,normalizeFilter}=require("../src/timeline-stream-model.js");
const d=value=>+new Date(value),at=(value,amount,unit)=>w.at(d(value),{amount,unit});
test("calendar navigation returns to its original day across short months and JSON reload",()=>{
  const first=at("2026-01-31T13:20:00",1,"month"),feb=w.shift(first,1),march=w.shift(JSON.parse(JSON.stringify(feb)),1);
  assert.equal(new Date(feb.startMs).getDate(),28);assert.equal(new Date(march.startMs).getDate(),31);
  assert.equal(feb.endMs,march.startMs);assert.equal(w.shift(feb,-1).startMs,first.startMs);
  const leap=at("2024-02-29T10:00:00",1,"year"),next=w.shift(leap,1);
  assert.equal(w.shift(next,-1).startMs,leap.startMs);
  assert.equal(new Date(w.shift(leap,4).startMs).getDate(),29);
});
test("rescaling retains the chosen focus and rejects stale or forged calendar anchors",()=>{
  const focus=d("2026-09-24T14:35:00"),hour=w.around(focus,{amount:18,unit:"hour"}),month=w.around(focus,{amount:1,unit:"month"});
  assert.equal(hour.focusMs,focus);assert.equal(month.focusMs,focus);
  assert.ok(Math.abs((month.startMs+month.endMs)/2-focus)<=1);
  assert.equal(w.normalize(JSON.parse(JSON.stringify(month))).focusMs,focus);
  const forged=w.normalize({...month,calendarAnchor:{originMs:1,step:999},focusMs:month.endMs+1});
  assert.equal(forged.calendarAnchor,undefined);assert.equal(forged.focusMs,undefined);
});
test("calendar month and year windows clamp end dates and retain local time",()=>{
  const month=at("2024-01-31T13:20:00",1,"month"),end=new Date(month.endMs);
  assert.equal(end.getMonth(),1);assert.equal(end.getDate(),29);assert.equal(end.getHours(),13);
  const year=at("2024-02-29T13:20:00",1,"year");assert.equal(new Date(year.endMs).getDate(),28);
  assert.equal(w.normalize(JSON.parse(JSON.stringify(month))).scale.unit,"month");
});
test("calendar days follow DST while hour scales represent exact elapsed hours",()=>{
  const {execFileSync}=require("node:child_process"),script=`const w=require(${JSON.stringify(require.resolve('../src/runtime/views/task-timeline/time-window.js'))});const s=+new Date('2026-03-08T00:00:00');console.log(JSON.stringify([w.add(s,{amount:1,unit:'day'})-s,w.add(s,{amount:24,unit:'hour'})-s]));`;
  assert.deepEqual(JSON.parse(execFileSync(process.execPath,["-e",script],{env:{...process.env,TZ:"America/New_York"},encoding:"utf8"})),[23*3600000,24*3600000]);
});
test("temporary spans and favorite removal do not corrupt current range",()=>{
  const window=at("2026-09-23T07:00:00",18,"hour"),next=w.shift(window,1);
  assert.equal(next.startMs,window.endMs);assert.equal(next.endMs-next.startMs,18*3600000);
  assert.deepEqual(w.favorites([]),[]);assert.equal(w.favorites([{amount:1,unit:"day"},{amount:1,unit:"day"},{amount:0,unit:"year"}]).length,1);
  assert.equal(w.normalize({...window,endMs:window.endMs+60000}).scale,null);
});
test("actual window fits compressed and magnified zones at several widths",()=>{
  const context={globalThis:null};context.globalThis=context;vm.runInNewContext(fs.readFileSync(require.resolve("../src/runtime/views/task-timeline/native-viewport.js"),"utf8"),context);
  const api=context.noriaTaskTimeline.nativeViewport,start=d("2026-09-23T00:00:00"),end=start+18*3600000;
  let vp=api.createViewport({widthPx:960,zones:[{startMs:start+3600000,endMs:start+9*3600000,magnify:4},{startMs:start+11*3600000,endMs:end,magnify:.2}]});
  for(const width of [960,360,1440]){vp=api.fitRange(vp,start,end,width);const range=api.visibleRange(vp);assert.ok(Math.abs(range.startMs-start)<2);assert.ok(Math.abs(range.endMs-end)<2);}
});
test("runtime module does not replace Obsidian ambient exports",()=>{
  const context={globalThis:null,module:{exports:{keep:true}}};context.globalThis=context;vm.runInNewContext(fs.readFileSync(require.resolve("../src/runtime/views/task-timeline/time-window.js"),"utf8"),context);assert.equal(context.module.exports.keep,true);assert.equal(typeof context.noriaTaskTimeline.timeWindow.at,"function");
});
function event(id,time,done=false){return {id,layer:"task",title:id,start:`2026-09-23T${time}:00`,source:{path:"tasks.md",line:id},payload:{task:{path:"tasks.md",line:id,text:id,completed:done},noria:{startYmd:"2026-09-23",startTime:time}}};}
test("overnight tasks show continuation at the window boundary with original times intact",()=>{
  const overnight=event("night","23:00",true);overnight.end="2026-09-24T02:00:00";overnight.payload.noria.endYmd="2026-09-24";overnight.payload.noria.endTime="02:00";
  const morning=event("morning","01:00");morning.start="2026-09-24T01:00:00";morning.payload.noria.startYmd="2026-09-24";
  const window=at("2026-09-24T00:00:00",3,"hour"),items=buildStream({events:[morning,overnight]},[],window,{}).items;
  assert.deepEqual(items.map(i=>i.id),["night","morning"]);assert.equal(items[0].date,"2026-09-24");assert.equal(items[0].time,"");assert.equal(items[0].continuation,true);
  assert.equal(items[0].start,"2026-09-23T23:00:00");assert.equal(items[0].payload.noria.startYmd,"2026-09-23");
  assert.equal(buildStream({events:[overnight]},[],window,{showDone:false}).items.length,0);
  assert.equal(buildStream({events:[overnight]},[],at("2026-09-23T22:00:00",5,"hour"),{}).items[0].time,"23:00");
  assert.equal(buildStream({events:[overnight]},[],at("2026-09-24T02:00:00",3,"hour"),{}).items.length,0);
  const inside=buildStream({events:[overnight]},[],at("2026-09-23T23:30:00",1,"hour"),{}).items[0];assert.equal(inside.continuation,true);assert.equal(inside.time,"");
});
test("tasks and timestamped captures interleave without moving completed tasks",()=>{
  const model={events:[event("a","09:00",true),event("b","11:00")]},record={id:"note",kind:"record",path:"diary.md",date:"2026-09-23",markdown:"## Inbox\n- [10:00] A thought\n"},window=at("2026-09-23T08:00:00",6,"hour");
  const all=buildStream(model,[record],window,{}).items;assert.deepEqual(all.map(i=>i.kind),["task","capture","task"]);assert.equal(all[0].time,"09:00");assert.equal(all[1].markdown,"A thought");
  assert.equal(buildStream(model,[record],window,{showDone:false}).items[0].kind,"capture");
});
test("no fake time for undated tasks or untimed diary text and no duplicate tasks",()=>{
  const e=event("a","09:00");e.payload.noria.fallbackDateSource="modified";
  const result=buildStream({events:[e,e]},[{kind:"record",id:"r",date:"2026-09-23",markdown:"An untimed paragraph"}],at("2026-09-23T00:00:00",1,"day"),{});
  assert.equal(result.unscheduled.length,1);assert.equal(result.items.length,1);assert.equal(result.items[0].time,undefined);
});
test("capture extraction respects code fences and retains attachments and nesting",()=>{
  const parts=splitRecord({id:"r",markdown:"## Inbox\n- [09:00] first\n  ![[photo.png]]\n- [10:00] next\n\n```md\n- [11:00] code, not a capture\n```\n"});
  assert.equal(parts.filter(x=>x.kind==="capture").length,2);assert.match(parts[0].markdown,/photo.png/);assert.match(parts.at(-1).markdown,/11:00/);
});
test("vertical source filters are independent and note timestamps default off",()=>{assert.equal(normalizeFilter().ctime,false);assert.equal(normalizeFilter().mtime,false);assert.equal(normalizeFilter().records,true);assert.equal(normalizeFilter({tasks:false}).records,true);});
test("native task DTO retains editable source identity and readable raw text",()=>{
  const {taskRequest}=require("../src/timeline-stream-model.js");const dto={source:{path:"tasks.md",line:8,rawLine:"- [ ] Task [start:: 2026-09-23]"},text:{clean:"Task",raw:"Task [start:: 2026-09-23]"},completed:false};
  const req=taskRequest(dto);assert.equal(req.path,"tasks.md");assert.equal(req.line,8);assert.equal(req.text,"Task [start:: 2026-09-23]");assert.equal(req.rawText,dto.source.rawLine);
});
