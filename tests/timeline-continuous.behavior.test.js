const test=require('node:test'),assert=require('node:assert/strict');
const {dateFromPattern,dailyDates,ContinuousTimeline}=require('../src/timeline-continuous.js');
const {dateKey}=require('../src/timeline-stream-model.js');
function fixture(){
  const files=new Map(),reads=[];for(let i=0;i<100;i++){const date=dateKey(+new Date(2025,10,1+i*7));files.set(`Diary/${date.slice(0,4)}/${date}.md`,'## Inbox\n- [09:00] Example '+date);}
  const plugin={getLocalYmd:d=>d?dateKey(+d):'2026-09-27',getCalendarSettings:()=>({calendarRootFolder:'Diary'}),getCalendarPatternForPeriod:()=> 'YYYY/YYYY-MM-DD',resolveCalendarNoteSpec:(_,d)=>({path:`Diary/${d.slice(0,4)}/${d}.md`}),filesUnderRoots:()=>[...files.keys()].map(path=>({path})),app:{vault:{getAbstractFileByPath:path=>files.has(path)?{path}:null}},loadTextFromVault:async path=>{reads.push(path);return files.get(path);},getReviewFinalSectionHeading:()=> '复盘'};
  return {plugin,files,reads};
}
test('configured daily paths parse numeric and literal tokens without false date matches',()=>{
  assert.equal(dateFromPattern('YYYY/YYYY-MM-DD','2026/2026-09-26'),'2026-09-26');
  assert.equal(dateFromPattern('YYYY/YYYY-MM-DD','2025/2026-09-26'),'');
  assert.equal(dateFromPattern('YYYY/M/D [entry]','2024/2/29 entry'),'2024-02-29');
  assert.equal(dateFromPattern('YYYY/MM/DD','2026/02/30'),'');
  assert.equal(dateFromPattern('YY-MM-DD','26-09-26'),'2026-09-26');
});
test('root-level Daily Notes includes configured files but rejects unrelated date-like names',async()=>{
  const files=[{path:'2026-09-26.md'},{path:'Other/2026-09-25.md'}],plugin={getCalendarSettings:()=>({calendarIntegrationMode:'daily-notes'}),readDailyNotesPluginConfig:async()=>({folder:'',format:'YYYY-MM-DD'}),app:{vault:{getRoot:()=>({children:[files[0],{path:'Other',children:[files[1]]}]})}},filesUnderRoots:()=>[files[1]],resolveCalendarNoteSpec:(_,d)=>({path:d+'.md'})};
  assert.deepEqual((await dailyDates(plugin)).dates,['2026-09-26']);
});
test('hidden or nonmatching tasks do not add empty source dates',async()=>{
  const {plugin}=fixture(),e={id:'done',title:'Done',start:'2020-01-01',source:{path:'tasks.md',line:1},payload:{task:{text:'Done',completed:true},noria:{startYmd:'2020-01-01'}}};
  const reader=await new ContinuousTimeline(plugin,{events:[e]},{showDone:false,records:false}).init('2026-09-27');assert.deepEqual(reader.dates,['2026-09-27']);
});
test('continuous reading centers an empty today, skips sparse gaps and reads bounded pages in both directions',async()=>{
  const {plugin,reads}=fixture(),reader=await new ContinuousTimeline(plugin,{events:[]},{}).init('2026-09-27');
  assert.equal(reads.length,14);assert.ok(reader.snapshot().dates.includes('2026-09-27'));
  const first=reader.snapshot().dates[0],last=reader.snapshot().dates.at(-1);
  await reader.load(-1);assert.ok(reader.snapshot().dates[0]<first);assert.equal(reader.snapshot().dates.at(-1),last);
  await reader.load(1);assert.ok(reader.snapshot().dates.at(-1)>last);assert.equal(new Set(reads).size,reads.length);
  for(let i=0;i<8;i++)await reader.load(-1);assert.ok(reader.snapshot().dates.length<=35);assert.ok(reader.cache.size<=49);
  assert.ok(reader.snapshot().dates[0].startsWith('2025'));assert.ok(reader.snapshot().later);
});
test('failed boundary load retains entries and cursor then retries the same page',async()=>{
  const {plugin}=fixture(),reader=await new ContinuousTimeline(plugin,{events:[]},{}).init('2026-09-27'),before=JSON.stringify(reader.snapshot()),read=plugin.loadTextFromVault;
  plugin.loadTextFromVault=async()=>{throw Error('disk');};await assert.rejects(reader.load(-1),/disk/);assert.equal(JSON.stringify(reader.snapshot()),before);
  plugin.loadTextFromVault=read;await reader.load(-1);assert.notEqual(JSON.stringify(reader.snapshot()),before);
});
test('rapid requests share a page and disposed readers cannot commit stale results',async()=>{
  const {plugin,reads}=fixture(),reader=await new ContinuousTimeline(plugin,{events:[]},{}).init('2026-09-27'),before=reads.length;
  await Promise.all([reader.load(-1),reader.load(-1)]);assert.equal(reads.length-before,7);
  let release,started;const ready=new Promise(r=>started=r),gate=new Promise(r=>release=r),read=plugin.loadTextFromVault;
  plugin.loadTextFromVault=async p=>{started();await gate;return read(p);};const pending=reader.load(-1);await ready;const start=reader.start;reader.dispose();release();await assert.rejects(pending,{name:'AbortError'});assert.equal(reader.start,start);
});
test('long tasks stay unique across pages, completed items filter in place and unscheduled tasks retain no date',async()=>{
  const {plugin}=fixture(),task={id:'long',start:'2026-01-01T09:00:00',end:'2027-11-01T18:00:00',title:'Long',source:{path:'tasks.md',line:0},payload:{task:{path:'tasks.md',line:0,text:'Long',completed:true},noria:{startYmd:'2026-01-01',startTime:'09:00',endYmd:'2027-11-01',endTime:'18:00'}}};
  const model={events:[task,task],unplaced:[{id:'u',task:{path:'tasks.md',line:1,text:'Unscheduled'}}]},r=await new ContinuousTimeline(plugin,model,{}).init('2026-09-27');
  await r.load(-1);await r.load(1);assert.equal(r.snapshot().items.filter(i=>i.id==='long').length,1);assert.equal(r.snapshot().unscheduled[0].date,undefined);
  const filtered=await new ContinuousTimeline(plugin,model,{showDone:false}).init('2026-09-27');assert.equal(filtered.snapshot().items.filter(i=>i.kind==='task').length,0);
});
