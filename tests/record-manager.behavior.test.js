const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const mod={exports:{}};class Modal{close(){this.closed=true;}}
vm.runInNewContext(fs.readFileSync(require.resolve('../src/record-manager.js'),'utf8'),{module:mod,require:id=>id==='obsidian'?{Modal,Menu:class{}}:{iconButton:(p,_i,_l,run)=>{const b=p.createEl('button');b.onclick=run;return b;}}});
const {RecordManager}=mod.exports;
function node(opts={},all=[]){const e={children:[],text:opts.text,cls:opts.cls,addEventListener(){},focus(){},setText(t){this.text=t;},empty(){this.children=[];},createDiv(o){return this.createEl('div',o);},createSpan(o){return this.createEl('span',o);},createEl(_tag,o={}){const c=node(o,all);this.children.push(c);return c;}};all.push(e);return e;}
function setup(save){const all=[],m=Object.create(RecordManager.prototype);Object.assign(m,{contentEl:node({},all),plugin:{getNoriaLocale:()=> 'zh'},options:{save,defaults:()=>({name:'draft'})},renderFields(){},load:async()=>{},list(){this.listed=true;},error(e){this.lastError=e.message;}});m.edit(null);return {m,button:all.find(e=>e.cls==='mod-cta')};}
test('record save blocks duplicate submission, returning, and dismissal until the write finishes',async()=>{
 let release,writes=0;const pending=new Promise(r=>release=r);const {m,button}=setup(async()=>{writes++;await pending;});
 const save=button.onclick();await button.onclick();let returned=false;m.discard(()=>returned=true);m.close();
 assert.equal(writes,1);assert.equal(returned,false);assert.equal(m.closed,undefined);assert.equal(m.contentEl.inert,true);
 release();await save;assert.equal(m.listed,true);assert.equal(m.contentEl.inert,false);assert.equal(m.saving,false);
});
test('failed record save keeps the draft and enables a retry',async()=>{
 let writes=0;const {m,button}=setup(async()=>{if(++writes===1)throw Error('disk unavailable');});
 await button.onclick();assert.equal(m.draft.name,'draft');assert.equal(m.lastError,'disk unavailable');assert.equal(button.disabled,false);assert.equal(m.contentEl.inert,false);
 await button.onclick();assert.equal(writes,2);assert.equal(m.listed,true);
});
test('project suggested name follows the source until the user supplies a different name',()=>{
 const source=fs.readFileSync(require.resolve('../src/runtime/views/dashboard/home/sections/guide-panels/view.js'),'utf8').replace(/\r\n/g,'\n');
 const start=source.indexOf('onChange:(draft,inputs,previousPath)=>'),end=source.indexOf('},\n',start);
 const update=vm.runInNewContext('('+source.slice(start+'onChange:'.length,end)+')');
 const draft={name:'',targetPath:'N'},field={value:''},inputs=new Map([['name',field]]);update(draft,inputs,'');assert.equal(draft.name,'N');
 draft.targetPath='Noria/项目说明.md';update(draft,inputs,'N');assert.equal(draft.name,'项目说明');
 draft.name='我命名的项目';draft.targetPath='Noria/另一份.md';update(draft,inputs,'Noria/项目说明.md');assert.equal(draft.name,'我命名的项目');
});
