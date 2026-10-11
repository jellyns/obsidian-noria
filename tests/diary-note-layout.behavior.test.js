const test=require('node:test'),assert=require('node:assert/strict');
const {normalizeDiaryCards,normalizePeriodLayouts,changeDiaryCardLayout}=require('../src/card-layout-model.js');
const {presentation,applyPresentation,renamedNotes}=require('../src/diary-note-layout.js');
const {noteCardsLayout,cardDefinition,readNoteCards}=require('../src/diary-cards-document.js');

test('core and extension presentation is local, contains no source definitions, and survives settings normalization',()=>{
 const base=noteCardsLayout({},[{id:'时间',source:'noria:period-overview',props:{metric:'focus'}}]);
 let local=changeDiaryCardLayout(base,'tasks','width',4);
 local=changeDiaryCardLayout(local,'note:时间','height',320);
 local=changeDiaryCardLayout(local,'review','reorder',{target:'tasks',after:false});
 const saved=presentation(local),settings=normalizePeriodLayouts({periods:{daily:base},notes:{'Diary/a.md':saved}});
 assert.doesNotMatch(JSON.stringify(saved),/source|metric|widgets/);
 assert.equal(applyPresentation(base,settings.notes['Diary/a.md']).cards.tasks.span,4);
 assert.equal(applyPresentation(base,settings.notes['Diary/a.md']).order[0],'review');
 assert.equal(applyPresentation(base,settings.notes['Diary/b.md']).cards.tasks.span,undefined);
 assert.equal(base.cards['note:时间'].height,null);
});
test('renaming a note or folder moves its layout without changing unrelated entries',()=>{
 const state={order:['tasks'],cards:{tasks:{span:4}}};
 const notes={'Diary/a.md':state,'Diary/sub/b.md':state,'Diary2/c.md':state};
 const moved=renamedNotes(notes,'Diary','Journal');
 assert.deepEqual(Object.keys(moved),['Journal/a.md','Journal/sub/b.md','Diary2/c.md']);
 assert.deepEqual(Object.keys(renamedNotes(moved,'Journal/a.md','Journal/new.md')),['Journal/new.md','Journal/sub/b.md','Diary2/c.md']);
 assert.ok(notes['Diary/a.md']);
});
test('legacy geometry can transfer into settings without duplicating it in card definitions',()=>{
 const items=[{id:'时间',source:'noria:period-overview',size:'wide',layout:{span:7,height:300,after:null}}];
 const base=noteCardsLayout({},items),saved=presentation(base);
 const raw='```noria-view\n'+JSON.stringify({view:'diary-cards',props:{cards:items.map(cardDefinition)}})+'\n```';
 assert.doesNotMatch(raw,/"layout"|"span"|"size"|"height"/);
 const restored=applyPresentation(noteCardsLayout({},readNoteCards(raw).items),saved);
 assert.equal(restored.cards['note:时间'].span,7);assert.equal(restored.cards['note:时间'].height,300);
 assert.equal(restored.order[0],'note:时间');
});
test('customizing a default chart displays only its local definition without changing another diary',()=>{
 const shared=normalizeDiaryCards({widgets:[{id:'overview',source:'noria:period-overview',props:{scope:'follow'}}]});
 const saved=presentation(shared),items=[{id:'时间',source:'noria:period-overview',replaces:'overview',props:{metric:'focus'}}];
 const local=applyPresentation(noteCardsLayout(shared,items),saved);
 assert.equal(local.cards.overview.hidden,true);assert.equal(local.cards['note:时间'].hidden,false);
 assert.equal(local.order.indexOf('note:时间'),local.order.indexOf('overview')+1);
 assert.equal(shared.cards.overview.hidden,false);assert.equal(shared.widgets.length,1);
});

test('presentation save is serialized, never writes Markdown, and restores settings after failure',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),actual=require('node:module').createRequire(require('node:path').resolve('src/card-system.js'));
 const box={exports:{}};
 vm.runInNewContext(fs.readFileSync('src/card-system.js','utf8'),{module:box,require:id=>id==='obsidian'?{}:id==='./card-controls.js'?{}:actual(id)});
 const system=Object.create(box.exports.CardSystem.prototype),base=normalizeDiaryCards();let fail=false,writes=0;
 system.queue=Promise.resolve();system.emit=()=>{};system.plugin={settings:{cardLayouts:{periods:{daily:base}}},async saveSettings(){writes++;if(fail)throw Error('disk full');}};
 await Promise.all([
  system.updateNoteLayout('Diary/a.md',base,l=>changeDiaryCardLayout(l,'tasks','width',4)),
  system.updateNoteLayout('Diary/a.md',base,l=>changeDiaryCardLayout(l,'habits','hidden',true))
 ]);
 assert.equal(writes,2);assert.equal(system.noteLayout('Diary/a.md',base).cards.tasks.span,4);
 assert.equal(system.noteLayout('Diary/a.md',base).cards.habits.hidden,true);
 assert.equal(system.noteLayout('Diary/b.md',base).cards.habits.hidden,false);
 const before=JSON.stringify(system.plugin.settings);fail=true;
 await assert.rejects(system.updateNoteLayout('Diary/a.md',base,l=>changeDiaryCardLayout(l,'tasks','width',8)),/disk full/);
 assert.equal(JSON.stringify(system.plugin.settings),before);
 fail=false;await system.renameNoteLayouts('Diary/a.md','Diary/renamed.md');
 assert.equal(system.noteLayout('Diary/renamed.md',base).cards.tasks.span,4);
 assert.equal(system.plugin.settings.cardLayouts.notes['Diary/a.md'],undefined);
 await system.updateNoteLayout('Diary/renamed.md',base,null);
 assert.equal(system.noteLayout('Diary/renamed.md',base).cards.tasks.span,undefined);
 await system.updateNoteCards('Diary/renamed.md','daily',[],items=>[...items,{id:'阅读',source:'noria:statistics',props:{metric:'words'}}]);
 await system.updateNoteLayout('Diary/renamed.md',base,l=>changeDiaryCardLayout(l,'tasks','width',5));
 assert.equal(system.noteItems('Diary/renamed.md')[0].props.metric,'words');
 await system.updateNoteLayout('Diary/renamed.md',base,null);
 assert.equal(system.noteItems('Diary/renamed.md').length,1);
 assert.equal(system.noteItems('Diary/other.md').length,0);
 const snapshot=JSON.stringify(system.plugin.settings);fail=true;
 await assert.rejects(system.updateNoteCards('Diary/renamed.md','daily',[],()=>[]),/disk full/);
 assert.equal(JSON.stringify(system.plugin.settings),snapshot);
});
