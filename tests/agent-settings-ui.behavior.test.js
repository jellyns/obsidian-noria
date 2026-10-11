const test=require('node:test'),assert=require('node:assert/strict');
const {renderAgentSettings}=require('../src/agent-settings-ui.js');
function fixture(){
 const document={activeElement:null},nodes=[],rows=[],saved=[];let status={state:'stopped',enabled:false,port:32101,available:true,canCopy:false},notify=()=>{};
 const element=()=>{const el={ownerDocument:document,attrs:{},events:{},classList:{toggle(){}},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,v){this.events[k]=v;},setText(v){this.text=v;}};
  el.createEl=(tag,options={})=>{const next=element();Object.assign(next,{tag,text:options.text,cls:options.cls});nodes.push(next);return next;};el.createDiv=o=>el.createEl('div',o);el.createSpan=o=>el.createEl('span',o);return el;};
 const control=()=>{const c={inputEl:element(),buttonEl:element(),selectEl:element(),setDisabled(v){this.disabled=v;return this;},setValue(v){this.value=v;return this;},getValue(){return this.value;},onChange(fn){this.change=fn;return this;},onClick(fn){this.click=fn;this.buttonEl.click=()=>{document.activeElement=this.buttonEl;fn();};return this;},setButtonText(v){this.label=v;return this;},addOption(){return this;}};return c;};
 class Setting{constructor(){this.controls=[];rows.push(this);}setName(v){this.name=v;return this;}setDesc(v){this.description=v;return this;}addToggle(fn){return this.add(fn);}addDropdown(fn){return this.add(fn);}addButton(fn){return this.add(fn);}addText(fn){return this.add(fn);}add(fn){const c=control();this.controls.push(c);fn(c);return this;}}
 const service={ready:Promise.resolve(),status:()=>status,subscribe(fn){notify=fn;return()=>{};},async setPort(value){if(!Number.isInteger(value)||value<0||value>65535)throw Object.assign(Error('invalid-port'),{code:'invalid-port'});saved.push(value);status={...status,port:value};notify();}};
 renderAgentSettings({plugin:{agentIntegration:service,getNoriaLocale:()=> 'zh'},decorateSettingsTarget(){}},element(),{Setting,Notice:class{},setIcon(){}});
 const row=rows.find(row=>row.name==='本机端口');return {document,nodes,saved,port:row.controls[0],save:row.controls[1],notify:()=>notify()};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('clicking port Save uses the entered number instead of a status repaint, and invalid drafts remain editable',async()=>{
 const f=fixture();await settle();
 const input=value=>{f.document.activeElement=f.port.inputEl;f.port.setValue(value);f.port.change?.(value);};
 input('32102');f.save.buttonEl.click();await settle();assert.deepEqual(f.saved,[32102]);assert.equal(f.port.getValue(),'32102');
 input('');f.save.buttonEl.click();await settle();assert.deepEqual(f.saved,[32102]);assert.equal(f.port.getValue(),'');
 assert.ok(f.nodes.some(el=>el.text==='端口应为 0–65535 的整数。'));
 input('70000');f.notify();f.save.buttonEl.click();await settle();assert.deepEqual(f.saved,[32102]);assert.equal(f.port.getValue(),'70000');
 input('0');f.save.buttonEl.click();await settle();assert.deepEqual(f.saved,[32102,0]);assert.equal(f.port.getValue(),'0');
});
