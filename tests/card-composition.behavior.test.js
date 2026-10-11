const test=require('node:test'),assert=require('node:assert/strict');
const {changeComposition,normalizeComposition,composeWidgets,widgetComposition}=require('../src/card-composition.js');
const base=()=>({order:['tasks','focus','habits','notes'],cards:{tasks:{span:6,height:600},focus:{span:4,height:250},habits:{span:3,height:240},notes:{span:6,hidden:true}}});
test('stack shares the destination width while each card keeps its own height and contents',()=>{
 const original=base(),next=changeComposition(original,'habits','stack',{target:'focus',after:true});
 assert.deepEqual(next.order,original.order);assert.equal(next.cards.habits.stack,'focus');assert.equal(next.cards.focus.stack,'focus');
 assert.equal(next.cards.habits.span,4);assert.equal(next.cards.habits.height,240);assert.equal(next.cards.focus.height,250);
 assert.equal(original.cards.habits.stack,undefined);
 assert.deepEqual(normalizeComposition(next.order,JSON.parse(JSON.stringify(next.cards))),next);
});
test('insertion above and within an existing stack keeps a single flat group and reading order',()=>{
 let next=changeComposition(base(),'habits','stack',{target:'focus',after:false});
 assert.deepEqual(next.order,['tasks','habits','focus','notes']);
 next=changeComposition(next,'notes','stack',{target:'habits',after:true});
 assert.deepEqual(next.order,['tasks','habits','notes','focus']);
 for(const id of ['habits','focus','notes'])assert.equal(next.cards[id].stack,'habits');
 assert.equal(next.cards.notes.hidden,true);
 next=changeComposition(next,'focus','reorder',{target:'notes',after:false,keepStack:true});
 assert.deepEqual(next.order,['tasks','habits','focus','notes']);
});
test('detaching the original anchor retains the remaining stack; the last single member unwraps',()=>{
 let next=changeComposition(base(),'habits','stack',{target:'focus',after:true});
 next=changeComposition(next,'notes','stack',{target:'habits',after:true});
 next=changeComposition(next,'focus','unstack');
 assert.deepEqual(next.order,['tasks','habits','notes','focus']);
 assert.equal(next.cards.focus.stack,undefined);assert.equal(next.cards.notes.stack,'habits');
 next=changeComposition(next,'notes','reorder',{target:'tasks',after:false});
 assert.deepEqual(next.order,['notes','tasks','habits','focus']);
 assert.equal(next.cards.habits.stack,undefined);assert.equal(next.cards.notes.stack,undefined);
});
test('width changes all group members including hidden ones; an adjacent card remains independent',()=>{
 let next=changeComposition(base(),'notes','stack',{target:'focus',after:true});
 next=changeComposition(next,'notes','width',7);
 assert.equal(next.cards.focus.span,7);assert.equal(next.cards.notes.span,7);assert.equal(next.cards.tasks.span,6);
});
test('home and custom widget round trips retain props, hide state and independent order',()=>{
 const widgets=[{id:'tasks',order:0,size:'wide',props:{path:'Tasks.md'}},{id:'focus',order:10,size:'medium',props:{cardHeight:250}},{id:'habits',order:20,size:'small',enabled:false}];
 let next=composeWidgets(widgets,'habits','stack',{target:'focus',after:true});
 assert.equal(next[2].layout.stack,'focus');assert.equal(next[2].enabled,false);assert.deepEqual(next[1].props,{cardHeight:250});
 next=composeWidgets(JSON.parse(JSON.stringify(next)),'habits','unstack');
 assert.equal(next[1].layout.stack,undefined);assert.equal(next[2].layout.stack,undefined);
 assert.deepEqual(widgetComposition(next).order,['tasks','focus','habits']);
});
test('note-specific groups remain plugin settings and do not change the shared template',()=>{
 const {normalizeDiaryCards,changeDiaryCardLayout}=require('../src/card-layout-model.js'),{presentation,applyPresentation}=require('../src/diary-note-layout.js');
 const shared=normalizeDiaryCards(),note=changeDiaryCardLayout(shared,'habits','stack',{target:'tasks',after:true});
 const saved=JSON.parse(JSON.stringify(presentation(note))),restored=applyPresentation(shared,saved);
 assert.equal(restored.cards.habits.stack,'tasks');assert.equal(shared.cards.habits.stack,undefined);
 assert.equal(applyPresentation(shared,null).cards.habits.stack,undefined);
});

test('removing a stack anchor retains the remaining pair and unwraps only a singleton',()=>{
 const next=normalizeComposition(['b','c','d'],{b:{stack:'a'},c:{stack:'a'},d:{}});
 assert.equal(next.cards.b.stack,'b');assert.equal(next.cards.c.stack,'b');assert.equal(next.cards.d.stack,undefined);
 assert.equal(normalizeComposition(['c','d'],{c:{stack:'a'},d:{}}).cards.c.stack,undefined);
});

test('placement uses the nearest card edge; the centre has no drop action',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),mod={exports:{}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/card-direct-controls.js'),'utf8'),{module:mod,require:()=>({})});
 const rect={left:100,right:500,top:100,bottom:400,width:400,height:300},drop=(x,y)=>JSON.parse(JSON.stringify(mod.exports.cardDrop(rect,x,y)));
 assert.equal(drop(300,250),null);
 assert.deepEqual(drop(300,105),{kind:'stack',after:false,edge:'top'});
 assert.deepEqual(drop(300,395),{kind:'stack',after:true,edge:'bottom'});
 assert.deepEqual(drop(102,250),{kind:'reorder',after:false,edge:'left'});
 assert.deepEqual(drop(495,250),{kind:'reorder',after:true,edge:'right'});
});

test('layout notifications acknowledge rendered versions without rebuilding custom editors',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),mod={exports:{}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/workbench.js'),'utf8'),{module:mod,require:()=>({})});
 const board=Object.create(mod.exports.NoriaWorkbench.prototype);
 const previousPage={id:'page-reading',widgets:[{id:'book',props:{path:'Book.md'}}]},page=structuredClone(previousPage);
 page.widgets[0].layout={span:6};
 board.store={get:()=>page};board.loads=new Map([['page-reading',Promise.resolve()]]);
 board.customVersions=new Map([['page-reading',board.cardVersion(previousPage)]]);
 await board.syncPages({layoutOnly:true,pageId:page.id,previousPage});
 assert.equal(board.customVersions.get(page.id),board.cardVersion(page));
});
