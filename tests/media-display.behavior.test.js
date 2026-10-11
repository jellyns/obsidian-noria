const test=require('node:test'),assert=require('node:assert/strict');
const {displayPreferences,displayKey,readDisplay,saveDisplay,bookProgress}=require('../src/media-display.js');
test('cover defaults stay quiet while detailed fields and size survive view changes',()=>{
  const start=displayPreferences();assert.deepEqual(start.covers,{creator:false,progress:false,summary:false});
  assert.deepEqual(start.details,{creator:true,progress:true,summary:true});
  const changed=displayPreferences({...start,view:'details',covers:{progress:true},details:{summary:false},size:999});
  assert.equal(changed.covers.progress,true);assert.equal(changed.details.summary,false);assert.equal(changed.size,220);
  assert.equal(displayPreferences(null).view,'covers');
});
test('preferences survive reload independently per category and preserve parallel field edits',async()=>{
  const events=[],plugin={settings:{},saveSettings:async()=>{},app:{workspace:{trigger:(...v)=>events.push(v)}}};
  const book=displayKey({pageId:'media:book'},'library','book'),music=displayKey({pageId:'media:music'},'library','music');
  await Promise.all([saveDisplay(plugin,book,{view:'details'}),saveDisplay(plugin,book,{covers:{progress:true}}),saveDisplay(plugin,music,{size:200})]);
  const restored={settings:JSON.parse(JSON.stringify(plugin.settings))};
  assert.equal(readDisplay(restored,book).view,'details');assert.equal(readDisplay(restored,book).covers.progress,true);
  assert.equal(readDisplay(restored,music).view,'covers');assert.equal(readDisplay(restored,music).size,200);assert.equal(events.length,3);
  const before=JSON.stringify(plugin.settings);plugin.saveSettings=async()=>{throw Error('disk full');};
  await assert.rejects(saveDisplay(plugin,book,{view:'covers'}),/disk full/);assert.equal(JSON.stringify(plugin.settings),before);assert.equal(events.length,3);
});
test('progress distinguishes missing, zero, unknown totals and inconsistent page counts',()=>{
  const book=p=>bookProgress({kinds:['book'],properties:p});
  assert.equal(book({}),null);assert.equal(book({pageprogress:-1}),null);assert.equal(book({pageprogress:'12'}),null);
  assert.deepEqual(book({pageprogress:0,pagecount:300}),{page:0,total:300,ratio:0});
  assert.deepEqual(book({pageprogress:86}),{page:86,total:null,ratio:null});
  assert.equal(book({pageprogress:400,pagecount:300}).ratio,null);
  assert.equal(bookProgress({kinds:['game'],properties:{playtime:80,pageprogress:10,pagecount:100}}),null);
});
