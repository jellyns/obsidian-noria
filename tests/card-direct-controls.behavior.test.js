const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {insertCard,changeDiaryCardLayout,normalizeDiaryCards}=require('../src/card-layout-model.js');
const mod={exports:{}};
vm.runInNewContext(fs.readFileSync(require.resolve('../src/card-direct-controls.js'),'utf8'),{module:mod,require:()=>({})});
const {nearestSpan,cardSpan}=require('../src/card-width.js');
test('width drag reaches intermediate widths, includes gaps and clamps at the edges',()=>{
 for(const [pixels,span] of [[291,3],[392,4],[493,5],[594,6],[695,7],[796,8],[897,9],[998,10],[1099,11],[1200,12],[-50,3],[2000,12]])assert.equal(nearestSpan(pixels,1200,12),span);
});
test('a diary intermediate width survives reload, reorder and collapse without changing its old preset',()=>{
 let layout=changeDiaryCardLayout(normalizeDiaryCards(),'record','width',7);
 layout=changeDiaryCardLayout(layout,'record','collapsed',true);
 layout=normalizeDiaryCards(JSON.parse(JSON.stringify(layout)));
 assert.equal(layout.cards.record.span,7);assert.equal(layout.cards.record.size,'full');
 assert.equal(cardSpan(layout.cards.record),7);
 const reset=changeDiaryCardLayout(layout,'record','size','medium');assert.equal(reset.cards.record.span,undefined);assert.equal(cardSpan(reset.cards.record),4);
});
test('drag insertion moves one card and preserves intervening and hidden cards',()=>{
 const original=['a','hidden','b','c','d'];
 assert.deepEqual(insertCard(original,'a','c',true),['hidden','b','c','a','d']);
 assert.deepEqual(insertCard(original,'d','b',false),['a','hidden','d','b','c']);
 assert.deepEqual(original,['a','hidden','b','c','d']);
 assert.deepEqual(insertCard(original,'a','missing'),original);
 assert.deepEqual(insertCard(original,'b','b'),original);
});
test('diary drag is restricted to available target cards and persists across normalization',()=>{
 const layout=normalizeDiaryCards({order:['tasks','focus','habits'],cards:{focus:{hidden:true}}});
 const next=changeDiaryCardLayout(layout,'habits','reorder',{target:'tasks',after:false},['tasks','habits']);
 assert.deepEqual(next.order,['habits','tasks','record','review']);
 assert.deepEqual(normalizeDiaryCards(JSON.parse(JSON.stringify(next))),next);
 assert.deepEqual(changeDiaryCardLayout(layout,'habits','reorder',{target:'focus'},['tasks','habits']),layout);
});
test('a failed Home reorder restores the saved layout rather than leaving a phantom order',async()=>{
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/card-system.js'),'utf8'),{module,require:id=>id==='./card-layout-model.js'?require('../src/card-layout-model.js'):{}});
 const cards=Object.create(module.exports.CardSystem.prototype),widgets=[{id:'a',order:10},{id:'hidden',order:20,enabled:false},{id:'b',order:30}];
 cards.queue=Promise.resolve();cards.plugin={settings:{home:{widgets}},saveSettings:async()=>{throw Error('disk unavailable');},requestNoriaRefresh:()=>assert.fail('must not refresh failed save')};
 await assert.rejects(cards.reorderHome('b','a',false),/disk unavailable/);
 assert.deepEqual(JSON.parse(JSON.stringify(cards.plugin.settings.home.widgets)),widgets);
});
test('card sorting starts only from header space, leaving text, links, and controls usable',()=>{
 const {isHeaderBlank}=mod.exports,header={contains:t=>t.inside};
 const target=(blocked,text='')=>({inside:true,closest:()=>blocked,childNodes:[{nodeType:3,textContent:text}]});
 assert.equal(isHeaderBlank(header,target(false)),true);
 assert.equal(isHeaderBlank(header,target(false,'待办')),false);
 assert.equal(isHeaderBlank(header,target(true)),false);
 assert.equal(isHeaderBlank(header,{inside:false}),false);
});
