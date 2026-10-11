const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const M=require('../src/periodic-stat-model.js');
const {periodicTemplates}=require('../src/periodic-stat-cards.js');
const {templateFromWidget,widgetFromTemplate}=require('../src/statistic-templates.js');

test('periodic templates preserve their provider, grouping and date context when saved and reused',()=>{
 for(const template of periodicTemplates((zh,en)=>en)){
  const card=widgetFromTemplate(template);card.props.granularity='week';card.props.scope='fixed';card.props.start='2026-09-28';card.props.end='2026-10-04';
  const saved=templateFromWidget(card,card.title),copy=widgetFromTemplate(saved);
  assert.equal(copy.source,'noria:periodic-statistics');assert.notEqual(copy.id,card.id);assert.deepEqual(copy.props,card.props);assert.equal(saved.kind,'periodic');
 }
 assert.equal(M.granularity({granularity:'auto'},{start:'2026-01-01',end:'2026-12-31'}),'month');
 assert.equal(M.granularity({granularity:'day'},{start:'2026-01-01',end:'2026-12-31'}),'day');
});

test('shared data service aggregates cross-month task counts before computing completion rate',async()=>{
 const context={console,Date,globalThis:null};context.globalThis=context;vm.createContext(context);
 vm.runInContext(fs.readFileSync(require.resolve('../src/runtime/views/dashboard/core/data/data-service.js'),'utf8'),context);
 const tasks=[{path:'Tasks/a.md',line:0,text:'Done [completion:: 2026-09-28]',completed:true},...Array.from({length:9},(_,i)=>({path:'Tasks/a.md',line:i+1,text:'Open [due:: 2026-09-29]',completed:false})),{path:'Tasks/a.md',line:11,text:'October [completion:: 2026-10-01]',completed:true}];
 const bridge={runtimeBuildId:'periodic-test',paths:{diaryRoot:'Diary'},runtime:{toArray:x=>Array.from(x||[]),pagesForScope:()=>[],pagesForManagedPath:()=>[],filesForScope:()=>[],filesForManagedPath:()=>[],tasksForScope:()=>tasks}};
 bridge.tasks=require('../src/task-document.js');
 const service=context.dashboardCore.data.dataService.createDataService({bridge,now:'2026-10-02'});
 const range={mode:'custom',start:'2026-09-28',end:'2026-10-11'};
 const daily=M.series(await service.getSnapshot({preset:'periodic',range,granularity:'day'}),'tasks');
 const weekly=M.series(await service.getSnapshot({preset:'periodic',range,granularity:'week'}),'tasks');
 const monthly=M.series(await service.getSnapshot({preset:'periodic',range,granularity:'month'}),'tasks');
 assert.equal(daily[0].line,100);assert.equal(daily[1].line,0);assert.equal(daily[2].line,null);
 assert.equal(weekly[0].bar,11);assert.ok(Math.abs(weekly[0].line-200/11)<1e-9);assert.equal(weekly[1].line,null);
 assert.equal(monthly[0].bar,10);assert.equal(monthly[0].line,10);assert.equal(monthly[1].line,100);
 assert.equal(weekly[0].source.sources.done.length,2);assert.equal(weekly[0].source.sources.open.length,9);
 assert.deepEqual(Array.from(monthly[0].source.sources.done,row=>row.date),['2026-09-28']);
 assert.deepEqual(Array.from(monthly[1].source.sources.done,row=>row.date),['2026-10-01']);
 assert.equal(weekly[1].source.sources.done.length+weekly[1].source.sources.open.length,0);
 assert.equal(weekly.reduce((sum,r)=>sum+r.bar,0),daily.reduce((sum,r)=>sum+r.bar,0));
});


// Run the legacy view through the real task data service, capturing the chart boundary.
async function legacyTaskHeatmap({failure,tasks:providedTasks,dateRange={start:'2026-10-01',end:'2026-10-03'}}={}) {
 const runtime={console,Date};runtime.globalThis=runtime;vm.createContext(runtime);
 vm.runInContext(fs.readFileSync(require.resolve('../src/runtime/views/dashboard/core/data/data-service.js'),'utf8'),runtime);
 const tasks=providedTasks||[
  {path:'Projects/work.md',line:0,text:'Done [start:: 2026-10-01] [completion:: 2026-10-03]',completed:true},
  {path:'Projects/work.md',line:1,text:'Still open [due:: 2026-10-02]',completed:false},
  {path:'Projects/work.md',line:2,text:'No completion date',completed:true},
  {path:'Projects/work.md',line:3,text:'Outside [completion:: 2026-09-30]',completed:true}
 ];
 let diaryReads=0,heat;const heats=[],trends=[];
 const bridge={runtimeBuildId:'legacy-heat-test',paths:{diaryRoot:'Diary'},tasks:require('../src/task-document.js'),
  t:key=>key,runtime:{toArray:x=>Array.from(x||[]),pagesForScope:()=>[],pagesForManagedPath:()=>{diaryReads++;return [];},filesForScope:()=>[],filesForManagedPath:()=>[],tasksForScope:()=>tasks}};
 if(failure)runtime.dashboardCore.data.dataService.createDataService=()=>({getSnapshot:async()=>{throw failure;}});
 runtime.__noriaPeriodicStatsFallbackBuild='legacy-heat-test';
 runtime.dashboardPeriodicStatsFallbackChartsFactory=()=>({renderDualAxis(_p,_title,bar,line,labels,_b,_l,options){trends.push({bar,line,labels,options});},renderDistCard(){}});
 runtime.dashboardPeriodicStatsFallbackBoardsFactory=()=>({renderHeatmap:async(_,title,year,values)=>{heat={title,year,values};heats.push(heat);}});
 // Only date enumeration is adapted; task parsing, date bucketing and view code are real.
 function moment(value) {
  let date=new Date(`${value}T00:00:00Z`);
  return {startOf(){return this;},isValid(){return Number.isFinite(+date);},year(){return date.getUTCFullYear();},
   valueOf(){return +date;},isBefore(other){return +date<+other;},isAfter(other){return +date>+other;},
   clone(){return moment(this.format());},format(){return date.toISOString().slice(0,10);},add(n){date.setUTCDate(date.getUTCDate()+n);return this;}};
 }
 const element=()=>({style:{},classList:{add(){}},clientWidth:1000,createDiv:element});
 const input={scope:'monthly',mount:element(),noriaBridge:bridge,dateRange};
 const run=new (Object.getPrototypeOf(async()=>{}).constructor)('ctx','input','app','window','globalThis',fs.readFileSync(require.resolve('../src/runtime/views/dashboard/periodic-stats/impl-legacy/view.js'),'utf8'));
 await run({current:()=>null},input,{}, {moment},runtime);
 return {heat,heats,trends,diaryReads};
}

test('legacy task heatmap counts project tasks only on their actual completion dates',async()=>{
 const {heat}=await legacyTaskHeatmap();
 assert.deepEqual(heat.values,{'2026-10-01':0,'2026-10-02':0,'2026-10-03':1});
 assert.equal(heat.title,'runtime.stats.taskCompletionHeatmap');
});

test('legacy statistics propagates source failure instead of substituting diary-only counts',async()=>{
 await assert.rejects(legacyTaskHeatmap({failure:new Error('source unavailable')}),/source unavailable/);
});

test('period labels and source ranges clip partial weeks and months to the actual query',()=>{
 const range={start:'2026-09-06',end:'2026-10-06'};
 const weekly=[{start:'2026-08-31'},{start:'2026-09-07'},{start:'2026-09-14'}];
 assert.deepEqual(M.periodRange(weekly,0,range),{start:'2026-09-06',end:'2026-09-06'});
 const monthly=[{start:'2026-09-01'},{start:'2026-10-01'}];
 assert.deepEqual(M.periodRange(monthly,0,range),{start:'2026-09-06',end:'2026-09-30'});
 assert.deepEqual(M.periodRange(monthly,1,range),{start:'2026-10-01',end:'2026-10-06'});
 assert.equal(M.periodRange(monthly,-1,range),null);
});


test('legacy rates keep missing denominators distinct from zero completions',async()=>{
 const {trends}=await legacyTaskHeatmap();assert.deepEqual(Array.from(trends[1].line),[null,0,100]);assert.equal(trends[1].options.completionRate,50);assert.deepEqual(Array.from(trends[1].labels),['2026-10-01','2026-10-02','2026-10-03']);
 const empty=await legacyTaskHeatmap({tasks:[]});assert.deepEqual(Array.from(empty.trends[1].line),[null,null,null]);assert.equal(empty.trends[1].options.completionRate,null);
});
test('period completion rate is a ratio of counts, not an average of daily percentages',async()=>{
 const tasks=[{path:'project.md',line:0,text:'Done [completion:: 2026-10-01]',completed:true},...Array.from({length:9},(_,i)=>({path:'project.md',line:i+1,text:'Open [due:: 2026-10-02]',completed:false}))];
 const {trends}=await legacyTaskHeatmap({tasks});assert.deepEqual(Array.from(trends[1].line),[100,0,null]);assert.equal(trends[1].options.completionRate,10);
});
test('cross-year heatmaps retain both years and never duplicate a completion',async()=>{
 const tasks=[{path:'project.md',line:0,text:'Old year [completion:: 2026-12-31]',completed:true},{path:'project.md',line:1,text:'New year [completion:: 2027-01-02]',completed:true}];
 const {heats,trends}=await legacyTaskHeatmap({tasks,dateRange:{start:'2026-12-28',end:'2027-01-03'}});assert.deepEqual(heats.map(h=>h.year),[2026,2027]);assert.equal(heats[0].values['2026-12-31'],1);assert.equal(heats[1].values['2027-01-02'],1);assert.equal(heats.reduce((sum,h)=>sum+Object.values(h.values).reduce((a,b)=>a+b,0),0),2);assert.equal(trends[1].labels.at(-1),'2027-01-03');
});
