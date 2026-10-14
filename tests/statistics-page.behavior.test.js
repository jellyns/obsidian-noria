const test=require('node:test'),assert=require('node:assert/strict');
const {defaultStatisticsView,normalizeStatisticsView,statisticPlacements}=require('../src/statistic-topics.js');
const {normalizePages}=require('../src/workbench-pages.js');
const stat=(id,display,props={})=>({id,type:'extension',source:'noria:statistics',props:{source:'notes',scope:'all',calculate:'count',group:'folder',display,...props}});

test('old topic collapse is replaced without changing cards, periods or pins',()=>{
 const page={id:'page-stats',title:'Stats',widgets:[stat('a','bars'),stat('b','donut')],trendsRange:{mode:'rolling',days:30},statisticsView:{version:1,pinned:['a'],collapsed:{pinned:true,notes:true,habits:true}}};
 const before=structuredClone(page),updated=normalizePages({version:1,pages:[page]}).pages.find(p=>p.id===page.id);
 assert.deepEqual(updated.widgets,page.widgets);assert.deepEqual(updated.trendsRange,page.trendsRange);
 assert.deepEqual(updated.statisticsView,{version:2,pinned:['a'],placement:{},expanded:[]});assert.deepEqual(page,before);
 assert.deepEqual(normalizePages({version:1,pages:[updated]}).pages.find(p=>p.id===page.id),updated);
 assert.deepEqual(defaultStatisticsView(page.widgets).expanded,[]);
 assert.deepEqual([...statisticPlacements(page.widgets,updated.statisticsView)],[['a','main'],['b','alternative']]);
});

test('only another style with the same query and purpose is an alternative',()=>{
 const cards=[stat('folders','bars'),stat('donut','donut',{appearance:{density:'compact'},cardHeight:300}),
  stat('another-folder','donut',{folder:'Projects'}),stat('past-month','donut',{scope:'fixed',start:'2026-09-01',end:'2026-09-30'}),
  stat('total','metric'),stat('comparison','comparison'),stat('filtered','donut',{filterProperty:'type',filterValue:'research'}),
  stat('numeric','donut',{calculate:'sum',property:'cost'})];
 const result=statisticPlacements(cards,{});
 assert.equal(result.get('donut'),'alternative');
 for(const id of ['folders','another-folder','past-month','total','comparison','filtered','numeric'])assert.equal(result.get(id),'main',id);
});

test('a distribution is not the same purpose as the sequence of daily states',()=>{
 const props={source:'diary',group:'',calculate:'distribution',property:'mood',scope:'follow'};
 const result=statisticPlacements([stat('share','composition',props),stat('strip','strip',props),stat('calendar','calendar',props)],{});
 assert.equal(result.get('share'),'main');assert.equal(result.get('strip'),'main');assert.equal(result.get('calendar'),'alternative');
});

test('pins and explicit placement persist; disabled cards never hide the remaining chart',()=>{
 const cards=[{...stat('first','bars'),enabled:false},stat('second','donut'),stat('third','composition')];
 assert.equal(statisticPlacements(cards,{}).get('second'),'main');
 const config=normalizeStatisticsView({version:2,pinned:['third'],placement:{second:'main'},expanded:['notes']});
 const reloaded=normalizeStatisticsView(JSON.parse(JSON.stringify(config)));
 assert.deepEqual(reloaded,config);assert.deepEqual([...statisticPlacements(cards,reloaded).values()],['main','main']);
 config.pinned=[];config.placement={second:'alternative'};
 assert.equal(statisticPlacements(cards,config).get('third'),'main');
});

test('unfamiliar providers and builtin renderers remain visible even when their options resemble one another',()=>{
 const cards=[{id:'a',source:'noria:health-overview',props:{}},{id:'b',source:'noria:health-overview',props:{}},
  {id:'trend',type:'builtin',builtinId:'note-trend-card',props:{}},{id:'periodic',source:'noria:periodic-statistics',props:{metric:'notes'}}];
 assert.deepEqual([...statisticPlacements(cards,{}).values()],['main','main','main','main']);
});
