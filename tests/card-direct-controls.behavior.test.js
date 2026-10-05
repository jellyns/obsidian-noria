const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {insertCard,changeDiaryCardLayout,normalizeDiaryCards}=require('../src/card-layout-model.js');
const mod={exports:{}};
vm.runInNewContext(fs.readFileSync(require.resolve('../src/card-direct-controls.js'),'utf8'),{module:mod,require:()=>({})});
const {nearestSize}=mod.exports;
test('width snapping includes grid gaps and chooses exact preset boundaries',()=>{
  assert.equal(nearestSize(291,1200,12),'small');
  assert.equal(nearestSize(392,1200,12),'medium');
  assert.equal(nearestSize(594,1200,12),'wide');
  assert.equal(nearestSize(1200,1200,12),'full');
  assert.equal(nearestSize(-50,1200,12),'small');
  assert.equal(nearestSize(2000,1200,12),'full');
});
test('diary preview uses its effective medium span',()=>{
  assert.equal(nearestSize(594,1200,12,[3,6,6,12]),'medium');
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
 assert.deepEqual(next.order,['habits','tasks','focus']);
 assert.deepEqual(normalizeDiaryCards(JSON.parse(JSON.stringify(next))),next);
 assert.deepEqual(changeDiaryCardLayout(layout,'habits','reorder',{target:'focus'},['tasks','habits']),layout);
});
test('responsive snapping keeps the chosen preset when several sizes share a visible width',()=>{
 assert.equal(nearestSize(594,1200,12,[6,6,6,12],'wide'),'wide');
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
