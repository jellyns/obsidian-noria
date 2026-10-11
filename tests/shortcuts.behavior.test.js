const test=require('node:test'),assert=require('node:assert/strict');
const {Shortcuts,key,migrate,normalize,renameEntries}=require('../src/shortcuts.js');
test('legacy works migrate once with all card placements and user configuration preserved',()=>{
 const s={mediaShelf:['Books/A.md','Books/B.md'],home:{widgets:[{id:'first',order:0},{id:'moc-strip',order:10},{id:'old',type:'extension',source:'noria:media-shortcuts',order:90,title:'My choice',layout:{colSpan:8}}]},workbenchPages:{pages:[{widgets:[{source:'noria:media-shortcuts'}]}]}};
 migrate(s);assert.equal(Object.hasOwn(s,'mediaShelf'),false);assert.deepEqual(s.shortcuts,[{kind:'media',target:'Books/A.md'},{kind:'media',target:'Books/B.md'}]);
 assert.deepEqual([...s.home.widgets].sort((a,b)=>a.order-b.order).map(w=>w.id),['first','old','moc-strip']);assert.equal(s.home.widgets[2].title,'My choice');assert.equal(s.home.widgets[2].layout.colSpan,8);assert.equal(s.workbenchPages.pages[0].widgets[0].source,'noria:shortcuts');
 s.home.widgets[2].order=100;const before=JSON.stringify(s);migrate(s);assert.equal(JSON.stringify(s),before);
});
test('new shortcut area starts immediately before MOC, no-MOC layouts append safely',()=>{
 const s={home:{widgets:[{id:'a',order:10},{id:'moc-copy',builtinId:'moc-strip',order:20},{id:'b',order:30}]}};migrate(s);
 assert.deepEqual([...s.home.widgets].sort((a,b)=>a.order-b.order).map(w=>w.id),['a','quick-access','moc-copy','b']);assert.equal(s.home.widgets.find(w=>w.id==='quick-access').layout.colSpan,12);
 const other={home:{widgets:[]}};migrate(other);assert.equal(other.home.widgets.length,1);migrate(other);assert.equal(other.home.widgets.length,1);
});
test('mixed entries retain identities and rename only affected local files, including locations',()=>{
 const entries=[{kind:'media',target:'Books/A.md',title:'Reading'},{kind:'file',target:'Books/A.md'},{kind:'file',target:'Books/B.pdf#page=7'},{kind:'url',target:'https://example.org/Books/A.md'},{kind:'page',target:'media'}];
 assert.equal(normalize(entries).length,4);const renamed=renameEntries(normalize(entries),'Books','Moved');
 assert.equal(renamed[0].target,'Moved/A.md');assert.equal(renamed[0].title,'Reading');assert.equal(renamed[1].target,'Moved/B.pdf#page=7');assert.equal(renamed[2].target,entries[3].target);
});
test('concurrent additions, edits, ordering and removal preserve sources; failed saves roll back',async()=>{
 const plugin={settings:{home:{widgets:[]}},registerEvent(){},app:{vault:{on(){}}},saveSettings:async()=>{}};const store=new Shortcuts(plugin);await store.initialize();
 await Promise.all([store.toggleMedia('A.md'),store.put({kind:'page',target:'diary'})]);assert.equal(store.entries().length,2);assert.equal(store.hasMedia('A.md'),true);
 await assert.rejects(store.put({kind:'file',target:'A.md'}),/Already added/);await assert.rejects(store.put({kind:'url',target:'javascript:alert(1)'}));
 await store.put({kind:'url',target:'https://example.org',title:'Website'},'page:diary');await store.move('url:https://example.org','file:A.md');assert.equal(store.entries()[0].title,'Website');
 plugin.saveSettings=async()=>{throw Error('disk full');};await assert.rejects(store.remove('file:A.md'),/disk full/);assert.equal(store.entries().length,2);
 plugin.saveSettings=async()=>{};await store.remove('file:A.md');assert.equal(store.entries().length,1);assert.equal(key(store.entries()[0]),'url:https://example.org');
});
