const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const model=require('../src/diary-cards-document.js');
const {normalizeDiaryCards,changeDiaryCardLayout}=require('../src/card-layout-model.js');
const {presentation,applyPresentation}=require('../src/diary-note-layout.js');
const widget={title:'本期概览',source:'noria:period-overview',size:'medium',props:{scope:'follow'}};
const fixture=(raw,items,mode)=>raw+'\r\n## 卡片\r\n\r\n```noria-view\r\n'+JSON.stringify({view:'diary-cards',props:{mode,cards:items.map(model.cardDefinition)}})+'\r\n```\r\n';
const initial='---\r\ntags: [diary]\r\n---\r\n## 记录\r\n原有内容\r\n\r\n## 复盘\r\n今天的体会。\r\n';

test('note cards round trip in ordinary Markdown without copying shared layouts or fixing a template date',()=>{
 const items=model.addNoteCard([],widget),raw=fixture(initial,items,'daily');
 assert.ok(raw.startsWith(initial));assert.equal(raw.includes('\n')&&/[^\r]\n/.test(raw),false);
 assert.equal(items[0].id,'本期概览');assert.deepEqual(model.readNoteCards(raw).items,items.map(model.cardDefinition));
 assert.doesNotMatch(raw,/"(?:layout|size|span|height|collapsed|order|enabled)"/);
 assert.doesNotMatch(raw,/UUID|anchorDate|cardLayouts|"period"/);
 const layout=model.noteCardsLayout({},items);assert.equal(layout.widgets.length,1);assert.equal(layout.order[1],'note:本期概览');
 assert.equal(model.readNoteCards(raw).props.mode,'daily');
});
test('a note-specific resize and movement leave another date and shared cards unchanged',()=>{
 const shared=normalizeDiaryCards({cards:{tasks:{span:4}},widgets:[{id:'common',...widget}]}),original=JSON.stringify(shared);
 const items=model.addNoteCard([],widget),raw=fixture(initial,items,'daily');
 let changed=changeDiaryCardLayout(model.noteCardsLayout(shared,items),'note:本期概览','width',7);
 changed=changeDiaryCardLayout(changed,'note:本期概览','reorder',{target:'tasks',after:false});
 const current=applyPresentation(model.noteCardsLayout(shared,items),presentation(changed)),other=model.noteCardsLayout(shared,[]);
 assert.equal(fixture(initial,items,'daily'),raw);
 assert.equal(current.order[0],'note:本期概览');assert.equal(current.cards['note:本期概览'].span,7);
 assert.deepEqual(other,shared);assert.equal(JSON.stringify(shared),original);
 const revised=normalizeDiaryCards({...shared,widgets:[...shared.widgets,{id:'new-shared',...widget}]});
 assert.ok(model.noteCardsLayout(revised,items).widgets.some(w=>w.id==='new-shared'));
});
test('copy, hide and restore keep source properties and affect only the note instance',()=>{
 let items=model.addNoteCard([],widget);items=model.addNoteCard(items,widget);assert.equal(items[1].id,'本期概览-2');
 const base=model.noteCardsLayout({},items),hidden=changeDiaryCardLayout(base,'note:本期概览','hidden',true);
 assert.equal(hidden.cards['note:本期概览'].hidden,true);assert.equal(hidden.cards['note:本期概览-2'].hidden,false);
 assert.equal(changeDiaryCardLayout(hidden,'note:本期概览','hidden',false).cards['note:本期概览'].hidden,false);assert.deepEqual(items[0].props,{scope:'follow'});
 const layout=model.noteCardsLayout({},items);assert.equal(layout.order.indexOf('note:本期概览-2'),layout.order.indexOf('note:本期概览')+1);
});
test('settings cannot overwrite a note card edited externally since the dialog opened',()=>{
 const items=model.addNoteCard([],widget),expected=items[0],changed=JSON.parse(JSON.stringify(items));changed[0].title='外部修改';
 assert.throws(()=>model.editNoteCard(changed,{id:'note:本期概览',...widget,title:'对话框草稿'},expected),/changed/);
 assert.equal(changed[0].title,'外部修改');
 assert.throws(()=>model.editNoteCard([],{id:'note:本期概览',...widget}),/removed/);
});
test('malformed, duplicate and unfinished managed blocks refuse writes; nested examples are untouched',()=>{
 const raw=fixture('',model.addNoteCard([],widget),'daily');
 assert.throws(()=>model.readNoteCards(raw+raw),/one diary-cards/);
 assert.throws(()=>model.readNoteCards('```noria-view\n{"view":"diary-cards","props": }\n```'),/Invalid/);
 assert.throws(()=>model.readNoteCards(raw.replace(/```\r?\n?$/,'')),/Unclosed/);
 const quoted='````md\n'+raw+'\n````';assert.deepEqual(model.readNoteCards(quoted).items,[]);
 assert.equal(model.withoutNoteCards(quoted),quoted);
});
test('reading hides only managed cards and their empty heading while preserving task source line numbers',()=>{
 const raw=fixture(initial,model.addNoteCard([],widget),'daily')+'\r\n## 计划\r\n- [ ] 原任务 [scheduled:: 2026-10-10]\r\n';
 const projected=require('../src/diary-prose.js').projectDiaryRecord(raw);
 assert.doesNotMatch(projected.markdown,/diary-cards|## 卡片/);
 assert.match(projected.markdown,/今天的体会/);
 const expected=raw.split('\n').findIndex(line=>line.startsWith('- [ ]'));
 assert.equal(projected.tasks[0].line,expected);
 const {readReviewDocument}=require('../src/review-document.js');assert.doesNotMatch(readReviewDocument(raw,['复盘']).markdown,/diary-cards/);
});

test('adding a chart does not count its configuration as diary writing',()=>{
 const {withoutDiaryCardViews}=require('../src/runtime/views/dashboard/core/utils/diary-day-blocks.js');
 const raw=fixture(initial,model.addNoteCard([],widget),'daily');
 const count=text=>text.replace(/\s+/g,'').length;
 assert.equal(count(withoutDiaryCardViews(raw)),count(initial));
 assert.equal(withoutDiaryCardViews('```noria-view\n{"view":"other"}\n```'),'```noria-view\n{"view":"other"}\n```');
});

function controller(raw){
 const mod={exports:{}};const actual=require('node:module').createRequire(require('node:path').resolve('src/diary-card-layout.js'));
 vm.runInNewContext(fs.readFileSync('src/diary-card-layout.js','utf8'),{module:mod,require:id=>id==='obsidian'?{}:id==='./card-controls.js'?{}:actual(id)});
 let items=[],writes=0;
 const session={body:raw,model:{exists:true,path:'Diary/2026-10-10.md',selection:{mode:'daily'}}};
 const diary={session,async prepareLayoutConceal(){return true;}};
 const view=Object.create(mod.exports.DiaryCardLayout.prototype);
 Object.assign(view,{workbench:{diary},mode:'daily',system:{text:(_zh,en)=>en,async updateNoteCards(path,mode,legacy,change){items=change(items.length?items:legacy);writes++;}},plugin:{processTextAtVaultPath(){assert.fail('Card configuration must not write Markdown');}},readLayout(){},apply(){},async renderExtras(){}});
 return {view,diary,session,get items(){return items;},get writes(){return writes;}};
}
test('adding and editing a card preserves ordinary Markdown exactly',async()=>{
 const c=controller(initial);
 await c.view.updateNoteCards(items=>model.addNoteCard(items,widget),c.session);
 await c.view.updateNoteCards(items=>model.editNoteCard(items,{id:'note:本期概览',...widget,title:'我的统计'},items[0]),c.session);
 assert.equal(c.session.body,initial);assert.equal(c.items[0].title,'我的统计');assert.equal(c.writes,2);
});
test('switching the diary or having unsaved/conflicted edits prevents a note-card save',async()=>{
 const c=controller(initial);c.diary.session={};
 await assert.rejects(()=>c.view.updateNoteCards(items=>model.addNoteCard(items,widget),c.session),/Save current/);
 assert.equal(c.writes,0);c.diary.session=c.session;c.diary.prepareLayoutConceal=async()=>false;
 await assert.rejects(()=>c.view.updateNoteCards(items=>items,c.session),/Save current/);assert.equal(c.session.body,initial);
});

test('switching dates during the editor flush cannot save the old card context',async()=>{
 const c=controller(initial);c.diary.prepareLayoutConceal=async()=>{c.diary.session={model:{path:'Diary/next.md'}};return true;};
 await assert.rejects(c.view.updateNoteCards(items=>model.addNoteCard(items,widget),c.session),/Diary changed/);
 assert.equal(c.writes,0);assert.equal(c.session.body,initial);
});

test('an open card catalog keeps its original note selection and layout when the diary changes',()=>{
 const c=controller(initial);c.session.model.selection={mode:'daily',period:'2026-10-10',anchorDate:'2026-10-10'};
 c.view.layout={cards:{tasks:{title:'原日期待办'}},widgets:[]};c.view.noteItems=[{id:'本篇统计',source:'noria:statistics'}];
 const context=c.view.catalogContext();c.view.layout={cards:{tasks:{title:'另一天待办'}},widgets:[]};c.view.noteItems=[];c.diary.session={};
 assert.equal(context.selection.period,'2026-10-10');assert.equal(context.noteCards.layout().cards.tasks.title,'原日期待办');assert.equal(context.noteCards.items().length,1);
});
