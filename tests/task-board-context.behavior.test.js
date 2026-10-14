const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../src/runtime/views/tasks-calendar/runtime-core.js'),'utf8');
const section=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
function quick({view='day',date='2026-09-26',chosen='',context=''}={}){
 const ctx={rootNode:{getAttribute:()=>view},selectedDate:date,timelineQuickTargetDate:chosen,timelineQuickTargetContext:context,
 getVisibleWeekDates:()=>['2026-09-20','2026-09-21','2026-09-22','2026-09-23','2026-09-24','2026-09-25','2026-09-26'],
 moment:d=>({format:()=>d||'2026-10-07'})};
 const start=source.includes('function getQuickTimelineContext()')?'function getQuickTimelineContext()':'function getFallbackDateInView()';
 return vm.runInNewContext(section(start,'function getTimelineStrategyLabel')+';getFallbackDateInView()',ctx);
}
test('quick event defaults to the historical day being viewed, not the beginning of that week',()=>assert.equal(quick(),'2026-09-26'));
test('explicit quick date survives within the same view and date',()=>assert.equal(quick({chosen:'2026-09-23',context:'day|2026-09-26'}),'2026-09-23'));
test('moving to another day does not inherit a stale quick target in the same week',()=>assert.equal(quick({date:'2026-09-25',chosen:'2026-09-23',context:'day|2026-09-26'}),'2026-09-25'));
test('switching from week to day follows the day rather than the prior quick target',()=>assert.equal(quick({chosen:'2026-09-20',context:'week|2026-09-20'}),'2026-09-26'));

test('quadrant counters count the same unique open tasks as its buckets and unique completed tasks',()=>{
 const stats=vm.runInNewContext(section('function createTaskCalendarRangeStats(', 'function setStatisticValuesFromRangeStats(')+';createTaskCalendarRangeStats',{});
 const open=new Map([
  ['old',{typ:'overdue',task:{}}],['start',{typ:'start',task:{}}],['span',{typ:'process',task:{}}],
  ['scheduled',{typ:'scheduled',task:{}}],['recur',{typ:'recurrence',task:{}}],['note',{typ:'dailyNote',task:{}}]
 ]);
 const completed=new Map([['finished',{}]]);
 const s=stats(open,completed);
 assert.deepEqual(JSON.parse(JSON.stringify(s)),{due:5,done:1,overdue:1,start:1,scheduled:1,recurrence:1,dailyNote:1});
 assert.equal(s.due+s.overdue,open.size);
});

test('an empty task range renders a dash, while actual incomplete and completed ranges remain 0 and 100 percent',()=>{
 const attrs={},values=[];
 const button={setAttribute:(k,v)=>attrs[k]=String(v)};
 const ctx={getStatisticPopupEl:()=>null,rootNode:{querySelector:s=>s==='button.statistic'?button:null},tcStatisticGlyphIcon:'',__noriaTaskCalendarUi:{renderStatisticButton:(_b,v)=>values.push(v.percentage)}};
 const set=vm.runInNewContext(section('function setStatisticValues(', 'function cleanupTasksCalendarRuntime(')+';setStatisticValues',ctx);
 set(0,0,0,0,0,0,0);assert.ok(Number.isNaN(values.at(-1)));assert.equal(attrs['data-percentage'],'');
 set(4,0,0,0,0,0,0);assert.equal(values.at(-1),0);assert.equal(attrs['data-total'],'4');
 set(0,4,0,0,0,0,0);assert.equal(values.at(-1),100);
});

test('timeline labeling does not demote a task; explicit priority and manual quadrant still apply',()=>{
 const begin=source.indexOf('function taskIsLowPriorityForEisen('),end=source.indexOf('\n\tfor (let i = 0; i < eisenDayList.length;',begin);
 const classify=vm.runInNewContext(source.slice(begin,end)+';classifyEisenhowerBucket',{
  getTaskEisenhowerBucketOverride:t=>t.quadrant||'',isTimelineTaggedTask:t=>!!t.timeline,coerceTemporalToYmd:()=>''
 });
 assert.equal(classify({task:{priority:'normal',timeline:true}}),'q2');
 assert.equal(classify({task:{priority:'normal'}}),'q2');
 assert.equal(classify({task:{priority:'low',timeline:true}}),'q4');
 assert.equal(classify({task:{priority:'low',timeline:true,quadrant:'q1'}}),'q1');
});

test('calendar counters include a spanning task and deduplicate its date roles across days',()=>{
 const ctx={due:[],start:[],process:[],scheduled:[],recurrence:[],dailyNote:[],overdue:[],done:[],calendarNow:()=>({format:()=> '2026-10-07'}),moment:()=>({format:()=> '2026-10-07'}),getTaskKey:t=>t.id};
 const run=vm.runInNewContext(section('function collectCalendarRangeTasks(', 'function inheritEisenhowerGranularityFromView(')+';collectCalendarRangeTasks',ctx);
 const stats=vm.runInNewContext(section('function createTaskCalendarRangeStats(', 'function setStatisticValuesFromRangeStats(')+';createTaskCalendarRangeStats',{});
 const open=new Map(),completed=new Map(),span={id:'span'},scheduled={id:'scheduled'},finished={id:'finished'};
 ctx.start=[span];ctx.scheduled=[scheduled];ctx.done=[finished];run(open,completed,'2026-12-28');
 ctx.start=[];ctx.process=[span];ctx.due=[scheduled];run(open,completed,'2026-12-29');
 ctx.process=[];ctx.due=[span];run(open,completed,'2026-12-30');
 const s=stats(open,completed);assert.equal(s.due,2);assert.equal(s.done,1);assert.equal(s.start,1);assert.equal(s.scheduled,1);
});

test('calendar carry-over reminders count only on today, and are not counted twice as a dated task',()=>{
 const task={id:'one'},ctx={due:[task],start:[],process:[],scheduled:[],recurrence:[],dailyNote:[],overdue:[task],done:[],calendarNow:()=>({format:()=> '2026-10-07'}),moment:()=>({format:()=> '2026-10-07'}),getTaskKey:t=>t.id};
 const run=vm.runInNewContext(section('function collectCalendarRangeTasks(', 'function inheritEisenhowerGranularityFromView(')+';collectCalendarRangeTasks',ctx);
 const open=new Map(),completed=new Map();run(open,completed,'2026-10-06');assert.equal(open.size,1);assert.equal(open.get('one').typ,'due');
 run(open,completed,'2026-10-07');assert.equal(open.size,1);assert.equal(open.get('one').typ,'overdue');
});

test('soft refresh updates the current calendar population without rebuilding its layout',()=>{
 const ctx={rootNode:{getAttribute:()=> 'day',querySelectorAll:()=>[{getAttribute:()=> '2026-12-29'}]},Map,
  getTasksViaAdapter:()=>{},collectCalendarRangeTasks:(open)=>open.set('new-task',{}),
  createTaskCalendarRangeStats:open=>({total:open.size}),setStatisticValuesFromRangeStats:s=>ctx.result=s};
 const refresh=vm.runInNewContext(section('function refreshCalendarRangeStatistics()', 'function getFallbackDateInView()')+';refreshCalendarRangeStatistics',ctx);
 refresh();assert.equal(ctx.result.total,1);
 const soft=section('async function triggerTaskFreshRefresh()', '/** 拖拽/弹窗保存后');
 assert.match(soft,/refreshCalendarRangeStatistics\(\)/);
 assert.match(soft,/getList\(tasks, selectedDate\)/);
});


test('month scope explains timeline exclusion while day and week retain timeline events',()=>{
 const tags={includeTags:[],excludeTags:[]},policy={includeTimelineInMonth:false,includeCancelled:true,excludeOverdueTimeline:true};
 const rows=vm.runInNewContext(section('function statisticScopeRows(', 'function renderStatisticScope(')+';statisticScopeRows',{});
 const day='2026-12-29',tasks=[{id:'task',due:day},{id:'timeline',due:day,timeline:true}];
 const c={tasks,getCalendarTaskEntries:()=>tasks,runtimeTaskQueryPolicy:policy,getTaskKey:t=>t.id,sortTasksByYmdField:t=>t,taskIsOpenForCalendar:t=>!t.completed,
  isTimelineTaggedTask:t=>!!t.timeline,coerceTemporalToYmd:v=>v||'',taskDateSameDay:(a,b)=>a===b,taskDateBeforeDay:(a,b)=>a<b,taskDateAfterDay:(a,b)=>a>b,taskUsesDiaryDate:()=>false};
 for(const view of ['month','week','day']){
  c.rootNode={getAttribute:()=>view};
  const adapter=vm.runInNewContext(section('var taskQueryAdapter =', '\nawait initialize();')+';taskQueryAdapter',c);
  assert.deepEqual(Array.from(adapter.collectForDate(day).due,t=>t.id),view==='month'?['task']:['task','timeline']);
  assert.equal(rows(view,policy,tags).some(r=>r[0]==='timeline'&&r[1]==='hidden'),view==='month');
 }
 policy.includeTimelineInMonth=true;c.rootNode={getAttribute:()=> 'month'};
 const adapter=vm.runInNewContext(section('var taskQueryAdapter =', '\nawait initialize();')+';taskQueryAdapter',c);
 assert.deepEqual(Array.from(adapter.collectForDate(day).due,t=>t.id),['task','timeline']);
 assert.equal(rows('month',policy,tags)[0][1],'shown');
});

test('scope reflects configured tags and cancelled/carry-over policies without changing them',()=>{
 const rows=vm.runInNewContext(section('function statisticScopeRows(', 'function renderStatisticScope(')+';statisticScopeRows',{});
 const tags={includeTags:['#research','#noria'],excludeTags:['#later']},policy={includeCancelled:false,excludeOverdueTimeline:false};
 const before=JSON.stringify({tags,policy});
 assert.deepEqual(JSON.parse(JSON.stringify(rows('week',policy,tags))),[['cancelled','hidden'],['overdueTimeline','carried'],['includeTags','#research, #noria',true],['excludeTags','#later',true]]);
 assert.equal(JSON.stringify({tags,policy}),before);
});
