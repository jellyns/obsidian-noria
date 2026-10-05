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
 const service=context.dashboardCore.data.dataService.createDataService({bridge,now:'2026-10-02'});
 const range={mode:'custom',start:'2026-09-28',end:'2026-10-11'};
 const daily=M.series(await service.getSnapshot({preset:'periodic',range,granularity:'day'}),'tasks');
 const weekly=M.series(await service.getSnapshot({preset:'periodic',range,granularity:'week'}),'tasks');
 const monthly=M.series(await service.getSnapshot({preset:'periodic',range,granularity:'month'}),'tasks');
 assert.equal(daily[0].line,100);assert.equal(daily[1].line,0);assert.equal(daily[2].line,null);
 assert.equal(weekly[0].bar,11);assert.ok(Math.abs(weekly[0].line-200/11)<1e-9);assert.equal(weekly[1].line,null);
 assert.equal(monthly[0].bar,10);assert.equal(monthly[0].line,10);assert.equal(monthly[1].line,100);
 assert.equal(weekly.reduce((sum,r)=>sum+r.bar,0),daily.reduce((sum,r)=>sum+r.bar,0));
});
