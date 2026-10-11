const test=require('node:test'),assert=require('node:assert/strict'),A=require('../src/statistic-appearance.js');
test('appearance presets preserve all data and reference settings and do not share mutable state',()=>{
 const props={source:'notes',property:'hours',filterProperty:'project',filterValue:'A',scope:'fixed',start:'2026-09-01',end:'2026-09-29',referenceValue:20,target:50,appearance:{color:'blue'}};
 const look={appearance:{color:'custom',customColor:'#238a61',density:'compact',axis:'fixed',min:0,max:5,source:'tasks',referenceValue:3}};
 const applied=A.applyLook(props,look);assert.deepEqual({...applied,appearance:props.appearance},props);assert.equal(applied.appearance.source,undefined);assert.equal(applied.appearance.referenceValue,undefined);
 applied.appearance.min=-5;assert.equal(look.appearance.min,0);assert.equal(props.appearance.color,'blue');
});
test('domains preserve signed data, zero-based columns, isolated values and reference lines without clipping',()=>{
 assert.deepEqual(A.axisDomain([2,4],{axis:'fixed',min:0,max:5},'line',8),{min:0,max:8,expanded:true});
 assert.deepEqual(A.axisDomain([-3,4],{axis:'fixed',min:0,max:5}),{min:-3,max:5,expanded:true});
 assert.deepEqual(A.axisDomain([4,5],{axis:'auto'},'columns'),{min:0,max:5,expanded:false});
 assert.deepEqual(A.axisDomain([4,5],{axis:'auto'},'line'),{min:4,max:5,expanded:false});
 assert.equal(A.axisDomain([],{}),null);const only=A.axisDomain([0],{axis:'auto'});assert.ok(only.min<only.max);
 assert.throws(()=>A.validateAppearance({axis:'fixed',min:5,max:5}),/maximum/);assert.throws(()=>A.validateAppearance({color:'custom',customColor:'url(example)'}),/hexadecimal/);
});
test('category identity is independent of rank or other categories and honors configured record colors',()=>{
 const first=['work','life','reading'],second=['new',...first].reverse();
 const colors=new Map(first.map(k=>[k,A.categoryColor(k)]));for(const key of second)if(colors.has(key))assert.equal(A.categoryColor(key),colors.get(key));
 assert.equal(A.categoryColor('work',{},'#aabbcc'),'#aabbcc');assert.notEqual(A.categoryColor('work',{color:'blue'},'#aabbcc'),'#aabbcc');assert.notEqual(A.categoryColor('read'),A.categoryColor('false'));
});
test('appearance presets persist independently, retain existing applied copies and roll back on failure',async()=>{
 let disk,fail=false;const plugin={settings:{statisticTemplates:{version:1,items:[]}},async saveSettings(){if(fail)throw Error('disk failure');disk=structuredClone(this.settings);}},store=new A.StatisticLooks(plugin);
 const look=await store.save('Quiet blue',{color:'blue',axis:'zero',density:'compact'}),card=A.applyLook({source:'tasks',scope:'rolling',days:7},look);
 assert.equal(new A.StatisticLooks({settings:disk}).read()[0].id,look.id);fail=true;await assert.rejects(store.remove(look.id),/disk failure/);assert.equal(store.read().length,1);
 fail=false;await store.remove(look.id);assert.equal(store.read().length,0);assert.equal(card.appearance.color,'blue');assert.deepEqual(plugin.settings.statisticTemplates.items,[]);
});

test('count ticks are distinct integers without rounding or changing the data domain',()=>{
 for(const domain of [{min:0,max:1},{min:0,max:3},{min:-1.4,max:2.6},{min:1,max:1.1}]){
  const before={...domain},ticks=A.axisTicks(domain,true);assert.ok(ticks.every(Number.isInteger));assert.equal(new Set(ticks).size,ticks.length);assert.ok(ticks.every(v=>v>=domain.min&&v<=domain.max));assert.deepEqual(domain,before);
 }
 assert.deepEqual(A.axisTicks({min:0,max:1},true),[1,0]);
 assert.deepEqual(A.axisTicks({min:0,max:5}),[5,2.5,0]);
});
