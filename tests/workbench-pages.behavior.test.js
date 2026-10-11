const test=require('node:test'),assert=require('node:assert/strict');
const {WorkbenchPages,normalizePages}=require('../src/workbench-pages.js');
const fixture=()=>{
  const disk={};
  const plugin={settings:{home:{widgets:[{id:'existing',props:{cardHeight:190}}]},cardLayouts:{periods:{daily:{order:['tasks','habits','focus']}}}},getNoriaLocale:()=> 'en',async saveSettings(){disk.settings=structuredClone(this.settings);}};
  return {plugin,disk,store:new WorkbenchPages(plugin)};
};

test('removed custom cards survive reload with configuration and undo preserves subsequent edits',async()=>{
 const {plugin,disk,store}=fixture();
 const card={id:'card-reading',title:'Reading',source:'noria:note',props:{path:'Reading.base',cardHeight:240},size:'wide',order:20,enabled:true};
 await store.update(config=>config.pages.push({id:'page-reading',title:'Reading',widgets:[card]}));
 const undo=await store.removeCard('page-reading',card.id);plugin.settings=structuredClone(disk.settings);
 assert.deepEqual(store.get('page-reading').widgets,[{...card,enabled:false}]);
 await store.editCard('page-reading',card.id,{title:'Books'});await undo();
 assert.deepEqual(store.get('page-reading').widgets,[{...card,title:'Books'}]);
 const save=plugin.saveSettings;plugin.saveSettings=async()=>{throw Error('disk full');};
 await assert.rejects(store.removeCard('page-reading',card.id),/disk full/);
 assert.equal(store.get('page-reading').widgets[0].enabled,true);plugin.saveSettings=save;
});
test('navigation configuration survives reload without changing legacy layouts',async()=>{
 const {plugin,disk,store}=fixture(),before=structuredClone(plugin.settings),base=store.read(),draft=structuredClone(base);
 draft.pages.find(p=>p.id==='home').title='Start';draft.pages.find(p=>p.id==='calendar').hidden=true;
 draft.pages.unshift({id:'page-reading',title:'Reading',widgets:[],hidden:false});draft.defaultPage='page-reading';
 await store.configure(draft,base);plugin.settings=structuredClone(disk.settings);
 assert.equal(store.read().defaultPage,'page-reading');assert.equal(store.read().pages[0].title,'Reading');assert.equal(store.get('calendar').hidden,true);
 assert.deepEqual(plugin.settings.home,before.home);assert.deepEqual(plugin.settings.cardLayouts,before.cardLayouts);
});
test('custom cards keep independent configuration and shared sources through copy and page removal',async()=>{
 const {store}=fixture();await store.update(config=>config.pages.push({id:'page-reading',title:'Reading',widgets:[]}));
 const a={id:'card-a',source:'noria:note',props:{path:'Reading.md'},size:'medium',order:0};
 await store.saveCard('page-reading',a);await store.saveCard('page-reading',{...a,id:'card-b',order:10});
 await store.editCard('page-reading','card-a',{size:'full'});
 assert.equal(store.get('page-reading').widgets[1].size,'medium');assert.equal(store.get('page-reading').widgets[1].props.path,'Reading.md');
 await store.reorder('page-reading','card-b','card-a',false);assert.equal([...store.get('page-reading').widgets].sort((a,b)=>a.order-b.order)[0].id,'card-b');
 await store.update(config=>config.pages=config.pages.filter(p=>p.id!=='page-reading'));assert.equal(store.get('page-reading'),undefined);
 // This fixture exposes no vault write/delete API: configuring pages must not need one.
});
test('failed persistence rolls back navigation and does not notify mounted pages; retry succeeds',async()=>{
 const {plugin,store}=fixture();let notices=0;store.subscribe(()=>notices++);
 const save=plugin.saveSettings;plugin.saveSettings=async()=>{throw Error('disk full');};
 await assert.rejects(store.update(config=>config.pages.push({id:'page-new',title:'New',widgets:[]})),/disk full/);
 assert.equal(plugin.settings.workbenchPages,undefined);assert.equal(notices,0);
 plugin.saveSettings=save;await store.update(config=>config.pages.push({id:'page-new',title:'New',widgets:[]}));assert.equal(notices,1);
});
test('stale settings cannot overwrite concurrent card changes and the last content entry stays reachable',async()=>{
 const {store}=fixture(),base=store.read();await store.update(config=>config.pages.push({id:'page-new',title:'New',widgets:[]}));
 await assert.rejects(store.configure(base,base),/changed elsewhere/);
 const current=store.read(),draft=structuredClone(current);draft.pages.forEach(p=>p.hidden=true);
 await assert.rejects(store.configure(draft,current),/at least one/);
 assert.equal(store.get('home').hidden,false);
 const restored=normalizePages({version:1,defaultPage:'missing',pages:[{id:'home',hidden:true},{id:'diary',hidden:true}]});assert.equal(restored.defaultPage,'home');
});
test('queued edits retain both independent cards',async()=>{
 const {store}=fixture();await store.update(config=>config.pages.push({id:'page-new',title:'New',widgets:[]}));
 await Promise.all([store.saveCard('page-new',{id:'a',props:{path:'A.md'}}),store.saveCard('page-new',{id:'b',props:{path:'B.md'}})]);
 assert.deepEqual(store.get('page-new').widgets.map(w=>w.id),['a','b']);
});

test('composition events carry the previous page and a failed save never mutates the live layout',async()=>{
 const {plugin,store}=fixture();plugin.app={workspace:{iterateAllLeaves(){}}};
 await store.update(config=>config.pages.push({id:'page-new',title:'New',widgets:[{id:'a',order:0},{id:'b',order:10}]}));
 const previous=store.get('page-new'),events=[];store.subscribe(event=>events.push(event));
 await store.compose('page-new','b','stack',{target:'a',after:true});
 assert.equal(events[0].layoutOnly,true);assert.equal(events[0].pageId,'page-new');assert.deepEqual(events[0].previousPage,previous);
 const saved=store.get('page-new');plugin.saveSettings=async()=>{throw Error('disk full');};
 await assert.rejects(store.compose('page-new','b','unstack'),/disk full/);
 assert.deepEqual(store.get('page-new'),saved);assert.equal(events.length,1);
});
