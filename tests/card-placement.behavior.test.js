const test=require('node:test'),assert=require('node:assert/strict');
const {homeCopy,homeMatch,forgetWidget}=require('../src/card-placement.js');
const {migrateStatisticCalendars}=require('../src/card-statistics-migration.js');
const {applyPresentation,presentation}=require('../src/diary-note-layout.js');
test('Home copies use the original renderer and query, with independent placement',()=>{
 const original={id:'note-trend-card',type:'builtin',source:'trends-and-stats',title:'Notes',layout:{span:7,stack:'other'},props:{block:'note-trend',statsRange:{mode:'custom',start:'2026-01-01',end:'2026-01-31'}}};
 const copied=homeCopy(original);assert.notEqual(copied.id,original.id);assert.equal(copied.builtinId,'note-trend-card');assert.equal(copied.layout.span,7);assert.equal(copied.layout.stack,undefined);assert.deepEqual(copied.props,original.props);
 copied.layout.span=4;copied.props.statsRange.start='2025-01-01';assert.equal(original.layout.span,7);assert.equal(original.props.statsRange.start,'2026-01-01');
});
test('matching ignores independent sizing but distinguishes filters, date modes and bound source notes',()=>{
 const card={id:'a',type:'extension',source:'noria:statistics',title:'Activity',props:{display:'line',scope:'follow',source:'tasks'},layout:{span:4}};
 const saved=homeCopy(card);saved.props.cardHeight=600;saved.layout.span=10;saved.enabled=false;
 assert.equal(homeMatch([saved],card),saved);assert.equal(homeMatch([saved],{...card,props:{...card.props,scope:'fixed'}}),undefined);
 assert.equal(homeMatch([{...saved,enabled:true},saved],card).enabled,true);
});
test('forgetting a placement leaves records and other pages untouched and clears its view preferences',()=>{
 const card={id:'a',props:{path:'Original.md'}},other={widgets:[structuredClone(card)]},page={widgets:[card,{id:'b'}],statisticsView:{pinned:['a'],placement:{a:'alternative',b:'main'}}};
 forgetWidget(page,'a');assert.deepEqual(page.widgets,[{id:'b'}]);assert.deepEqual(page.statisticsView,{pinned:[],placement:{b:'main'}});assert.deepEqual(other.widgets,[card]);
});
test('retired calendar configurations migrate once without losing query, appearance or domain renderer',()=>{
 const props={display:'states',source:'diary',property:'mood',scope:'fixed',start:'2026-01-01',appearance:{palette:'warm'}};
 const settings={home:{widgets:[{source:'noria:statistics',props:structuredClone(props)}]},statisticTemplates:{items:[{props:{display:'heatmap',source:'habits'}}]},workbenchPages:{pages:[{widgets:[{source:'noria:health-calendar',props:{display:'heatmap'}}]}]}};
 assert.equal(migrateStatisticCalendars(settings),true);assert.deepEqual(settings.home.widgets[0].props,{...props,display:'calendar'});assert.equal(settings.statisticTemplates.items[0].props.display,'calendar');assert.equal(settings.workbenchPages.pages[0].widgets[0].props.display,'heatmap');assert.equal(migrateStatisticCalendars(settings),false);
});
test('deleting an inherited diary placement applies to this note only and survives later layout edits',()=>{
 const shared={widgets:[{id:'chart',source:'noria:statistics',props:{source:'tasks'}}],cards:{record:{title:'My record'}},order:['tasks','chart','record','review','habits']};
 const one=applyPresentation(shared,{deleted:['chart','record']});assert.equal(one.widgets.length,0);assert.equal(one.cards.record.hidden,true);assert.equal(one.cards.record.title,undefined);
 const saved=presentation(one),again=applyPresentation(shared,saved);assert.equal(again.cards.record.hidden,true);assert.deepEqual(again.deleted,['chart','record']);assert.equal(applyPresentation(shared,null),shared);
});
