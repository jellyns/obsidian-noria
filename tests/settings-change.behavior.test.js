const test=require('node:test'),assert=require('node:assert/strict');
const {commitSettingsChange}=require('../src/settings-change.js');
test('toggle initialization and rollback are silent and synchronize the native checkbox',async()=>{
  const {bindSettingToggle}=require('../src/settings-change.js'),input={checked:false};let value=true,calls=0,accept=false;
  const toggle={on:false,toggleEl:{querySelector:()=>input},setValue(v){if(this.on!==v){this.on=v;this.pending=this.callback?.(v);}return this;},onChange(fn){this.callback=fn;return this;}};
  bindSettingToggle(toggle,()=>value,async next=>{calls++;if(!accept)return false;value=next;return true;});
  assert.equal(calls,0);assert.equal(input.checked,true);
  input.checked=false;toggle.setValue(false);await toggle.pending;
  assert.equal(calls,1);assert.equal(toggle.on,true);assert.equal(input.checked,true);
  accept=true;input.checked=false;toggle.setValue(false);await toggle.pending;assert.equal(calls,2);assert.equal(value,false);assert.equal(input.checked,false);
});
test('failed persistence restores owned settings after normalization, preserving unrelated work',async()=>{
  const p={settings:{appearance:{accent:'old'},other:1},async saveSettings(){this.settings=structuredClone(this.settings);this.settings.other=2;throw Error('disk');}};
  await assert.rejects(commitSettingsChange(p,['appearance','newKey'],()=>{p.settings.appearance.accent='new';p.settings.newKey=true;}),/disk/);
  assert.deepEqual(p.settings,{appearance:{accent:'old'},other:2});
});
test('queued changes wait for rollback and still save successfully after a failure',async()=>{
  let release;const gate=new Promise(r=>release=r),writes=[];
  const p={settings:{timeline:{tasks:true,query:''}},async saveSettings(){writes.push(structuredClone(this.settings));if(writes.length===1){await gate;throw Error('disk');}}};
  const first=commitSettingsChange(p,['timeline'],()=>{p.settings.timeline.tasks=false;});
  const rejected=assert.rejects(first,/disk/);
  const second=commitSettingsChange(p,['timeline'],()=>{p.settings.timeline.query='new';});
  await Promise.resolve();assert.equal(writes.length,1);release();await rejected;await second;
  assert.deepEqual(writes[1],{timeline:{tasks:true,query:'new'}});
});
test('repeated successful changes preserve preceding fields',async()=>{
  const p={settings:{appearance:{accent:'old',density:'normal'}},async saveSettings(){this.saved=structuredClone(this.settings);}};
  await Promise.all([commitSettingsChange(p,['appearance'],()=>{p.settings.appearance.accent='blue';}),commitSettingsChange(p,['appearance'],()=>{p.settings.appearance.density='compact';})]);
  assert.deepEqual(p.saved.appearance,{accent:'blue',density:'compact'});
});
test('invalid input can skip persistence',async()=>{
  const p={settings:{appearance:{}},async saveSettings(){throw Error('must not save');}};
  assert.equal(await commitSettingsChange(p,['appearance'],()=>false),false);
});
