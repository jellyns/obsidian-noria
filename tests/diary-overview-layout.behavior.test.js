const test=require('node:test'),assert=require('node:assert/strict');
const {normalizeDiaryCards,normalizePeriodLayouts,migrateDiaryLayouts,overviewDiaryLayout,changeDiaryCardLayout}=require('../src/card-layout-model.js');

test('all diary periods share a tasks and overview starting layout',()=>{
 const layouts=migrateDiaryLayouts({});
 assert.equal(layouts.periods.daily.widgets.length,1);assert.equal(layouts.periods.daily.cards.tasks.hidden,false);
 for(const mode of ['daily','weekly','monthly','yearly']){
  const layout=layouts.periods[mode],widget=layout.widgets[0];
  assert.equal(widget.source,'noria:period-overview');assert.equal(widget.props.scope,'follow');
  assert.deepEqual(layout.order.slice(0,4),['tasks',widget.id,'habits','record']);
  assert.equal(layout.cards[widget.id].size,'medium');assert.equal(layout.cards.tasks.hidden,false);
 }
});

test('existing and inherited layouts are preserved without silent adoption',()=>{
 const layout=normalizeDiaryCards({order:['habits','tasks','record','review','focus'],cards:{habits:{span:7.2,height:420}}});
 const existing=migrateDiaryLayouts({periods:{weekly:layout}});
 assert.deepEqual(existing.periods.weekly,layout);
 const legacy=migrateDiaryLayouts({},[{id:'old',layout}]);
 assert.deepEqual(legacy.periods.monthly,layout);
});

test('adopting reuses the matching overview and preserves custom settings and removable cards',()=>{
 const source=normalizeDiaryCards({widgets:[{id:'custom-overview',source:'noria:period-overview',title:'我的节奏',props:{scope:'follow',row1:'notes',row2:'none'}},{id:'other',source:'noria:note',props:{path:'Notes/a.md'}}],cards:{record:{title:'片段',sections:['想法'],height:380,span:6},tasks:{height:420,span:3}}});
 const layout=overviewDiaryLayout(source);
 assert.equal(layout.widgets.length,2);assert.equal(layout.order[1],'custom-overview');
 assert.deepEqual(layout.widgets[0].props,source.widgets[0].props);assert.equal(layout.cards.record.title,'片段');
 assert.deepEqual(layout.cards.record.sections,['想法']);assert.equal(layout.cards.record.height,380);assert.equal(layout.cards.record.span,6);
 assert.equal(layout.cards.tasks.hidden,false);assert.equal(layout.cards.tasks.height,420);assert.equal(layout.cards.tasks.span,3);
 assert.equal(layout.cards.other.hidden,false);assert.equal(source.cards.tasks.hidden,false);
 assert.deepEqual(overviewDiaryLayout(layout),layout);
});

test('a fixed-range custom overview is not repurposed and conflicting ids remain intact',()=>{
 const source=normalizeDiaryCards({widgets:[{id:'period-overview',source:'noria:period-overview',props:{scope:'fixed',start:'2025-01-01',end:'2025-12-31'}}]});
 const layout=overviewDiaryLayout(source);
 assert.equal(layout.widgets.length,2);assert.equal(layout.order[1],'period-overview-2');
 assert.deepEqual(layout.widgets[0],source.widgets[0]);assert.equal(layout.cards['period-overview'].hidden,false);
});

test('the retired focus card merges into tasks without losing task dimensions or custom widgets',()=>{
 const source={order:['focus','tasks','habits','extra'],cards:{focus:{span:3,height:210,hidden:false},tasks:{span:5,height:360,hidden:true}},widgets:[{id:'extra',source:'noria:note',props:{path:'Note.md'}}]};
 const next=normalizeDiaryCards(source);
 assert.equal(next.order.includes('focus'),false);assert.equal(next.cards.focus,undefined);
 assert.equal(next.cards.tasks.span,5);assert.equal(next.cards.tasks.height,360);assert.equal(next.cards.tasks.hidden,false);
 assert.equal(next.widgets[0].props.path,'Note.md');assert.equal(source.cards.tasks.hidden,true);
 assert.deepEqual(normalizeDiaryCards(next),next);
});

test('date-dependent overview settings migrate once to a normal stable arrangement',()=>{
 const source=overviewDiaryLayout(),id=source.widgets[0].id;
 source.overview={id,width:true,position:true};source.cards[id].size='full';source.order=[id,...source.order.filter(key=>key!==id)];
 const next=normalizeDiaryCards(source);
 assert.equal(next.overview,undefined);assert.equal(next.order[1],id);assert.equal(next.cards[id].size,'medium');
 const resized=changeDiaryCardLayout(next,id,'width',5),moved=changeDiaryCardLayout(resized,id,'reorder',{target:'review',after:true});
 assert.equal(moved.order.at(-1),id);assert.equal(moved.cards[id].span,5);
 assert.deepEqual(normalizeDiaryCards(JSON.parse(JSON.stringify(moved))),moved);
});

test('retiring automatic placement preserves later manual width, height, order and hidden state',()=>{
 const source=overviewDiaryLayout(),id=source.widgets[0].id;
 source.overview={id,width:false,position:false};source.cards[id]={...source.cards[id],span:5,height:365};
 source.cards.habits.hidden=true;source.order=['habits','tasks',id,'record','review'];
 const next=normalizeDiaryCards(source);
 assert.deepEqual(next.order,source.order);assert.equal(next.cards[id].span,5);assert.equal(next.cards[id].height,365);
 assert.equal(next.cards.habits.hidden,true);assert.equal(next.overview,undefined);
});
