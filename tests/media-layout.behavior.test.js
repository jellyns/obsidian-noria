const test=require('node:test'),assert=require('node:assert/strict');
const {libraryWidgets,libraryView}=require('../src/media-workspace-model.js');
const {normalizePages,WorkbenchPages}=require('../src/workbench-pages.js');
const old=()=>libraryWidgets().filter(w=>w.source!=='noria:media-distribution').map(w=>({...w,size:'full',layout:{colSpan:12}}));

test('default hierarchy is full-width works followed by two adjacent statistics; music has classification without completions',()=>{
 for(const kind of ['', 'book','movie','game']){
  const cards=libraryWidgets(kind);
  assert.deepEqual(cards.map(w=>[w.source,w.layout.colSpan]),[['noria:media-library',12],['noria:media-summary',6],['noria:media-distribution',6]]);
  assert.ok(cards.every(w=>w.enabled));
  assert.equal(cards.at(-1).props.dimension,'tag');
 }
 assert.deepEqual(libraryWidgets('music').map(w=>[w.source,w.layout.colSpan]),[['noria:media-library',12],['noria:media-distribution',12]]);
});

test('old untouched layout gains distribution once while retaining the actual library folder',()=>{
 const saved={widgets:old()};saved.widgets[0].props.folder='Books';const before=JSON.stringify(saved),next=libraryView(saved);
 assert.equal(next.widgets[0].props.folder,'Books');assert.equal(next.widgets[1].layout.colSpan,6);assert.equal(next.widgets.length,3);
 assert.deepEqual(libraryView(next),next);assert.equal(JSON.stringify(saved),before);
});

test('custom sizes, placement, filters and removed cards survive normalization and unrelated saves',async()=>{
 const widgets=old();widgets[1]={...widgets[1],order:5,size:'small',layout:{colSpan:3},props:{months:12},enabled:false};
 const settings={workbenchPages:{version:1,pages:[{id:'media',title:'  藏馆  ',widgets,mediaViews:{book:{widgets:[]},music:{widgets:[{...libraryWidgets('music')[0],size:'medium'}]}}}]}};
 const plugin={settings,getNoriaLocale:()=> 'zh',saveSettings:async()=>{}},store=new WorkbenchPages(plugin);
 assert.deepEqual(store.get('media').widgets.slice(0,2),widgets);assert.equal(store.get('media').title,'藏馆');
 assert.deepEqual(store.get('media:book').widgets,[]);assert.equal(store.get('media:music').widgets[0].size,'medium');
 await store.removeCard('media','media-distribution');await store.editCard('media:music','media-library',{title:'音乐作品'});
 const fresh=new WorkbenchPages({...plugin,settings:JSON.parse(JSON.stringify(plugin.settings))});
 assert.equal(fresh.get('media').widgets.filter(w=>w.source==='noria:media-distribution').length,1);
 assert.equal(fresh.get('media').widgets.find(w=>w.source==='noria:media-distribution').enabled,false);
 assert.deepEqual(fresh.get('media').widgets.slice(0,2),widgets);
 assert.deepEqual(normalizePages(fresh.read()),fresh.read());
});

test('existing distribution instances and fully hidden layouts are not populated again; ids cannot collide',()=>{
 const widgets=old(),custom={id:'mine',source:'noria:media-distribution',enabled:false,props:{dimension:'tag',tagPrefix:'topic'}};
 assert.deepEqual(libraryView({widgets:[...widgets,custom]}).widgets,[...widgets,custom]);
 const hidden=widgets.map(w=>({...w,enabled:false}));assert.deepEqual(libraryView({widgets:hidden}).widgets,hidden);
 widgets.push({id:'media-distribution',source:'noria:note',enabled:true});
 const result=libraryView({widgets}).widgets;assert.equal(new Set(result.map(w=>w.id)).size,result.length);
});

test('saved genre distribution remains a deliberate configuration when defaults switch to tags',()=>{
 const widgets=libraryWidgets();widgets.at(-1).props={dimension:'genre'};
 assert.deepEqual(libraryView({widgets}).widgets,widgets);
});
