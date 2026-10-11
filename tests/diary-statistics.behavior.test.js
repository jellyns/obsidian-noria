const test=require('node:test'),assert=require('node:assert/strict');
const {diaryStatisticInput,renderDiaryStatistic}=require('../src/diary-statistic-card.js');
const {widgetFromTemplate}=require('../src/statistic-templates.js');

test('diary defaults follow the actual selected day, cross-month week, leap month and year without mutating the card',()=>{
 const widget={id:'overview',type:'builtin',builtinId:'metrics',props:{overviewFields:['totalWords','todayNotes']}};
 const cases=[['daily','2024-02-29','2024-02-29','2024-02-29'],['weekly','2026-10-02','2026-09-28','2026-10-04'],['monthly','2024-02-29','2024-02-01','2024-02-29'],['yearly','2024-02-29','2024-01-01','2024-12-31']];
 for(const [mode,anchorDate,start,end] of cases){const value=diaryStatisticInput(widget,{mode,anchorDate});assert.equal(value.follow,true);assert.deepEqual(value.widget.props.statsRange,{mode:'custom',start,end});}
 assert.equal(widget.props.statsRange,undefined);assert.deepEqual(widget.props.overviewFields,['totalWords','todayNotes']);
});

test('independent card ranges and saved template scopes survive diary changes',()=>{
 const widget={id:'trend',builtinId:'task-trend-card',props:{statsRange:{mode:'custom',start:'2020-01-01',end:'2020-01-31'}}};
 assert.deepEqual(diaryStatisticInput(widget,{mode:'yearly',anchorDate:'2024-01-01'}).widget.props.statsRange,widget.props.statsRange);
 const template={title:'Saved trend',props:{scope:'fixed',start:'2020-01-01',end:'2020-01-31'}};
 assert.equal(widgetFromTemplate(template).props.scope,'fixed');
 assert.equal(widgetFromTemplate({...template,props:{source:'tasks',scope:'rolling',days:30}},null,true).props.scope,'follow');
 assert.equal(widgetFromTemplate({title:'Current folders',props:{source:'notes',scope:'all'}},null,true).props.scope,'all');
 assert.equal(widgetFromTemplate({title:'Overview',kind:'dashboard',builtinId:'metrics',props:{}},null,true).props.statsRange.mode,'homeCurrent');
});

test('diary renderer isolates page identity, groups long periods and cleans up late completion',async()=>{
 let finish,cleanup,disposed=0,removed=0,input;
 const mount={dataset:{},__noriaHomeCleanup:()=>disposed++,remove:()=>removed++};
 const container={createDiv:()=>mount};
 const plugin={buildRuntimeBridgeConfig:()=>({runtime:{},homeEditMode:true,homeSettings:{trendsRange:{mode:'last30'}}}),createDataService:async()=>({resolveRange:r=>r}),runNoriaView:async(path,value)=>{input=value;await new Promise(r=>finish=r);}};
 const job=renderDiaryStatistic(plugin,{id:'a',builtinId:'note-trend-card',props:{}},container,{mode:'yearly',anchorDate:'2024-02-29'},{register:fn=>cleanup=fn});
 await new Promise(r=>setImmediate(r));assert.equal(input.previewWidget.props.statsGranularity,'month');assert.equal(input.noriaBridge.homeEditMode,false);assert.match(input.noriaBridge.statisticsPageId,/^diary:/);assert.equal(input.noriaBridge.homeSettings.trendsRange.mode,'last30');
 cleanup();finish();await job;assert.equal(removed,1);assert.equal(disposed,2);
});

test('embedded diary record controls read and update their own period layout',async()=>{
 const widget={id:'records',builtinId:'daily-state-card',props:{}},layout={widgets:[widget]},selection={mode:'daily',anchorDate:'2026-10-06'};
 let bridge,received,savedMode;
 const plugin={buildRuntimeBridgeConfig:()=>({runtime:{}}),createDataService:async()=>({resolveRange:r=>r}),
  runNoriaView:async(_,input)=>{bridge=input.noriaBridge;},
  propertyStats:{renderDailySummary:async(_,__,options)=>{received=options;}},
  cards:{layout:()=>layout,updateLayout:async(mode,change)=>{savedMode=mode;change(layout);}}};
 await renderDiaryStatistic(plugin,widget,{createDiv:()=>({dataset:{}})},selection,{register(){}});
 await bridge.runtime.renderDailyRecordSummary({closest:()=>null},null,{widgetId:widget.id});
 assert.deepEqual(received.context,{page:'diary',mode:'daily',selection});assert.equal(received.getWidget(widget.id),widget);
 await received.saveWidget({...widget,props:{dailyRecordFields:['sleep']}});assert.equal(savedMode,'daily');assert.deepEqual(layout.widgets[0].props.dailyRecordFields,['sleep']);
});

test('independent diary trends and daily records leave range rendering to their own header',async()=>{
 for(const builtinId of ['note-trend-card','task-trend-card','daily-state-card']){
  const created=[],container={createDiv:options=>{created.push(options);return {dataset:{}};}};
  const plugin={buildRuntimeBridgeConfig:()=>({runtime:{}}),createDataService:async()=>({resolveRange:r=>r}),runNoriaView:async()=>{}};
  await renderDiaryStatistic(plugin,{id:'a',builtinId,props:{statsRange:{mode:'custom',start:'2026-09-01',end:'2026-09-30'}}},container,{mode:'daily',anchorDate:'2026-10-06'},{register(){}});
  assert.deepEqual(created,[{cls:'noria-diary-statistic'}]);
 }
});

test('independent diary heatmaps show their range once in header and remove it on disposal',async()=>{
 let label,disposed,position;const menu={};
 const tools={createSpan:options=>(label={...options,remove(){disposed=true;}}),querySelector:()=>menu,insertBefore:(el,before)=>position=[el,before]};
 const container={closest:()=>({querySelector:()=>tools}),createDiv:()=>({dataset:{}})},cleanups=[];
 const plugin={buildRuntimeBridgeConfig:()=>({runtime:{}}),createDataService:async()=>({resolveRange:r=>r}),getNoriaLocale:()=> 'zh-CN',runNoriaView:async()=>{}};
 await renderDiaryStatistic(plugin,{id:'heat',builtinId:'habit-heatmap-card',props:{statsRange:{mode:'custom',start:'2026-09-01',end:'2026-09-30'}}},container,{mode:'daily',anchorDate:'2026-10-06'},{register:fn=>cleanups.push(fn)});
 assert.equal(label.attr.title,'2026-09-01 — 2026-09-30');assert.deepEqual(position,[label,menu]);
 cleanups.forEach(fn=>fn());assert.equal(disposed,true);
});
