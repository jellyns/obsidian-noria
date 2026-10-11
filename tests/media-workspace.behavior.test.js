const test=require('node:test'),assert=require('node:assert/strict');
const {readingTarget,completionGroups,completionScope}=require('../src/media-workspace-model.js');
const {normalizePages,WorkbenchPages}=require('../src/workbench-pages.js');

test('initial library selection continues standard English or Chinese statuses without translating source values',()=>{
 const {initialMediaStatus}=require('../src/media-workspace-model.js');
 const items=statuses=>statuses.map(status=>({properties:{status}}));
 for(const locale of ['zh','en']){
  assert.equal(initialMediaStatus(items(['Planned','In progress','Finished']),locale),'In progress');
  assert.equal(initialMediaStatus(items(['计划中','进行中']),locale),'进行中');
  assert.equal(initialMediaStatus(items(['想读','重读',undefined]),locale),'');
  assert.equal(initialMediaStatus([],locale),'');
 }
 const mixed=items(['进行中','In progress']),before=JSON.stringify(mixed);
 assert.equal(initialMediaStatus(mixed,'en'),'In progress');assert.equal(initialMediaStatus(mixed,'zh'),'进行中');
 assert.equal(JSON.stringify(mixed),before);
});

test('reading entry retains document locations and rejects executable schemes and credentials',()=>{
  assert.deepEqual(readingTarget('[[Books/原子习惯.pdf#page=12|阅读]]'),{type:'file',value:'Books/原子习惯.pdf#page=12'});
  assert.deepEqual(readingTarget('https://example.org/read#chapter-3'),{type:'url',value:'https://example.org/read#chapter-3'});
  assert.equal(readingTarget('  '),null);
  for(const url of ['javascript:alert(1)','file:///C:/a.exe','data:text/html,x','https://user:secret@example.org','C:\\a.exe','/etc/passwd'])assert.throws(()=>readingTarget(url));
});
test('completion trend crosses a year without inferring dates from status or excluding repeat reading',()=>{
  const work=(title,properties)=>({path:title+'.md',title,properties});
  const items=[work('A',{finishedAt:'2025-12-31',status:'重读'}),work('B',{finishedAt:'2026-01-03'}),work('C',{status:'已读'}),work('D',{finishedAt:'2026-02-30'}),work('E',{finishedAt:'2026-03-01'}),work('F',{finishedAt:'2026-02-05'})];
  const groups=completionGroups(items,'2026-02-06',3);
  assert.deepEqual(groups.map(g=>[g.key,g.value]),[['2025-12',1],['2026-01',1],['2026-02',1]]);
  assert.deepEqual(groups.flatMap(g=>g.rows.map(r=>r.title)),['A','B','F']);
});

test('completion sources show latest explicit dates first without mutating the library order',()=>{
 const work=(path,date)=>({path,title:path,properties:{finishedAt:date}});
 const items=[work('First.md','2026-10-01'),work('Z.md','2026-10-05'),work('A.md','2026-10-05'),work('Unknown.md',null)];
 assert.deepEqual(completionGroups(items,'2026-10-09',3).at(-1).rows.map(i=>i.path),['A.md','Z.md','First.md']);
 assert.deepEqual(items.map(i=>i.path),['First.md','Z.md','A.md','Unknown.md']);
});
test('media page is available in existing navigation and keeps its editable shared cards',async()=>{
  const plugin={settings:{workbenchPages:{version:1,defaultPage:'diary',pages:[{id:'home',hidden:true},{id:'diary'}]}},getNoriaLocale:()=> 'zh',saveSettings:async()=>{}};
  const store=new WorkbenchPages(plugin);assert.equal(store.read().defaultPage,'diary');assert.equal(store.get('home').hidden,true);
  assert.equal(store.label(store.get('media')),'藏馆');assert.equal(store.get('media').widgets.length,3);
  assert.ok(store.get('media').widgets.every(w=>w.type==='extension'));
  await store.editCard('media','media-library',{props:{folder:'Books'}});
  assert.equal(normalizePages(plugin.settings.workbenchPages).pages.find(p=>p.id==='media').widgets[0].props.folder,'Books');
  const undo=await store.removeCard('media','media-completions');assert.equal(store.get('media').widgets[1].enabled,false);
  await undo();assert.equal(store.get('media').widgets[1].enabled,true);
});

test('library sections reuse card operations but keep layouts independent and survive reload',async()=>{
 const plugin={settings:{},getNoriaLocale:()=> 'zh',saveSettings:async()=>{}};
 const store=new WorkbenchPages(plugin),allBefore=store.get('media').widgets;
 await store.editCard('media:book','media-completions',{props:{months:12},size:'medium'});
 await store.saveCard('media:music',{id:'my-music-stat',type:'extension',source:'noria:media-summary',props:{months:3}});
 await store.reorder('media:book','media-completions','media-library',false);
 const undo=await store.removeCard('media:movie','media-completions');
 const fresh=new WorkbenchPages({...plugin,settings:JSON.parse(JSON.stringify(plugin.settings))});
 assert.equal(fresh.get('media:book').widgets.find(w=>w.id==='media-completions').props.months,12);
 assert.equal(fresh.get('media:book').widgets.find(w=>w.id==='media-completions').order,0);
 assert.equal(fresh.get('media:movie').widgets.find(w=>w.id==='media-completions').enabled,false);
 assert.equal(fresh.get('media:game').widgets.find(w=>w.id==='media-completions').props.months,6);
 assert.equal(fresh.get('media:music').widgets.find(w=>w.id==='my-music-stat').props.months,3);
 assert.deepEqual(store.get('media').widgets,allBefore);
 assert.equal(store.read().pages.filter(p=>p.id.startsWith('media')).length,1);
 await undo();assert.equal(store.get('media:movie').widgets.find(w=>w.id==='media-completions').enabled,true);
 const before=JSON.stringify(plugin.settings);plugin.saveSettings=async()=>{throw Error('disk full');};
 await assert.rejects(store.editCard('media:game','media-library',{size:'small'}),/disk full/);
 assert.equal(JSON.stringify(plugin.settings),before);
});

test('music starts with browsing and classification while explicit completion statistics survive unrelated edits',async()=>{
 const plugin={settings:{},getNoriaLocale:()=> 'zh',saveSettings:async()=>{}},store=new WorkbenchPages(plugin);
 assert.deepEqual(store.get('media:music').widgets.map(w=>w.source),['noria:media-library','noria:media-distribution']);
 await store.editCard('media:music','media-library',{size:'wide'});
 assert.deepEqual(store.get('media:music').widgets.map(w=>w.source),['noria:media-library','noria:media-distribution']);
 const saved={id:'media-completions',source:'noria:media-summary',type:'extension',enabled:false,size:'medium',props:{months:12,folder:'Music'}};
 await store.saveCard('media:music',saved);await store.editCard('media:book','media-library',{size:'wide'});
 const reload=new WorkbenchPages({...plugin,settings:JSON.parse(JSON.stringify(plugin.settings))});
 assert.deepEqual(reload.get('media:music').widgets.find(w=>w.id===saved.id),saved);
 assert.equal(reload.get('media:book').widgets.find(w=>w.id==='media-completions').source,'noria:media-summary');
});

test('all-media completion scope picks a dated category and preserves explicit choices without mixing music',()=>{
 const item=(path,kinds,finishedAt)=>({path,kinds,properties:{finishedAt}});
 const items=[item('Book.md',['book'],null),item('Film.md',['movie'],'2026-09-20'),item('Song.md',['music'],'2026-10-01'),item('Game.md',['game'],'2026-10-02')];
 assert.equal(completionScope(items,'','','2026-10-09',6),'movie');
 assert.equal(completionScope(items,'','book','2026-10-09',6),'book');
 assert.equal(completionScope(items,'game','movie','2026-10-09',6),'game');
 assert.equal(completionScope(items,'music','','2026-10-09',6),'music');
 assert.equal(completionScope([items[2]],'','','2026-10-09',6),'book');
 assert.equal(completionScope([], '','game','2026-10-09',6),'game');
});
