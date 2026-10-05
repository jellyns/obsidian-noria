const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {commitSettingsChange,bindSettingToggle}=require('../src/settings-change.js');
function fixture(){
 const source=fs.readFileSync(require('node:path').join(__dirname,'../src/main.js'),'utf8'),rows=[];
 class Setting {
  constructor(){this.descEl={querySelector:()=>this.feedback,createDiv:()=>this.feedback={textContent:''}};rows.push(this)}
  setName(name){this.name=name;return this}setDesc(){return this}
  addText(fn){fn(this.control=control());return this}addToggle(fn){fn(this.control=control());return this}
 }
 function control(){const input={value:'',checked:false,attrs:{},listeners:{},addEventListener(k,fn){this.listeners[k]=fn},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]}};return {inputEl:input,toggleEl:{querySelector:()=>input},setPlaceholder(){return this},setValue(v){input.value=String(v);this.value=v;return this},onChange(fn){this.callback=fn;return this}}}
 const a=source.indexOf('  renderPerformanceSettings(containerEl) {'),b=source.indexOf('\n  async persistQueryScopeChange',a);
 const tab=vm.runInNewContext('({'+source.slice(a,b)+'})',{obsidian:{Setting},NORIA_DEFAULT_PERFORMANCE:{taskSnapshotTtlMs:1200,refreshDebounceMs:160},require:()=>({bindSettingToggle})});
 let fail=true,writes=0;
 const plugin={settings:{performance:{viewSourceCache:true,taskSnapshotTtlMs:1200,refreshDebounceMs:160}},getNoriaLocale:()=> 'zh',async saveSettings(){writes++;if(fail)throw Error('disk')}};
 Object.assign(tab,{plugin,t:k=>k,addSettingHeading(){},decorateSettingsTarget(){},renderQueryScopeSettings(){},async saveSettingChange(row,keys,change){try{await commitSettingsChange(plugin,keys,change);row.error='';return true}catch(e){row.error=e.message;return false}}});
 tab.renderPerformanceSettings({});
 const change=async(row,value)=>{row.control.inputEl.value=value;return row.control.inputEl.listeners.change?row.control.inputEl.listeners.change():row.control.callback(value)};
 return {rows,plugin,change,accept:()=>{fail=false},writes:()=>writes};
}
test('performance numeric save failure preserves the draft and old setting, then retries successfully',async()=>{
 const f=fixture(),row=f.rows[1];await f.change(row,'1800');
 assert.equal(f.plugin.settings.performance.taskSnapshotTtlMs,1200);assert.equal(row.control.inputEl.value,'1800');assert.equal(row.error,'disk');
 f.accept();await f.change(row,'1800');assert.equal(f.plugin.settings.performance.taskSnapshotTtlMs,1800);assert.equal(row.error,'');assert.equal(f.writes(),2);
});
test('performance input rejects incomplete/out-of-range values without saving; failed toggle rolls back',async()=>{
 const f=fixture(),row=f.rows[2];
 for(const value of ['', '12x','1.5','19','2001']){await f.change(row,value);assert.equal(f.writes(),0);assert.equal(row.control.inputEl.attrs['aria-invalid'],'true');}
 await f.rows[0].control.callback(false);assert.equal(f.plugin.settings.performance.viewSourceCache,true);assert.equal(f.rows[0].control.value,true);
});
