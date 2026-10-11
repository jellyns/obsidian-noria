const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');

function editor({read=async()=>({value:'https://example.org/work'}),save=async()=>{},onSaved}={}) {
 const nodes=[],notices=[];
 class Element {
  constructor(tag,options={}){this.tag=tag;this.options=options;this.isConnected=true;nodes.push(this);}
  createEl(tag,options){return new Element(tag,options);}
  createDiv(options){return this.createEl('div',options);}
  setText(value){this.text=value;}
  focus(){this.focused=true;}
 }
 const host=new Element('div'),module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/media-workspace.js'),'utf8')+'\nmodule.exports.editAccess=editAccess;',{
  module,require:id=>{
   if(id==='obsidian')return {FuzzySuggestModal:class{},Notice:class{constructor(value){notices.push(value);}}};
   if(id==='./record-popover.js')return {recordPopover:(_anchor,title,build)=>{host.title=title;build(host,()=>{host.isConnected=false;});}};
   if(id==='./media-access.js')return {readAccess:read,saveAccess:save};
   if(id==='./card-controls.js')return {iconButton:(parent,_icon,label)=>parent.createEl('button',{attr:{'aria-label':label}})};
   return {};
  }
 });
 module.exports.editAccess({getNoriaLocale:()=> 'zh'},{},'One Day.md',onSaved);
 return {host,nodes,notices,input:nodes.find(n=>n.tag==='input'),submit:()=>nodes.find(n=>n.tag==='form').onsubmit({preventDefault(){}})};
}

test('destination editor freezes edits during save and waits for detail refresh',async()=>{
 let releaseWrite,releaseRefresh,written,calls=0,entered;
 const refreshing=new Promise(r=>entered=r);
 const f=editor({save:(_plugin,_state,value)=>{written=value;calls++;return new Promise(r=>releaseWrite=r);},onSaved:()=>{const wait=new Promise(r=>releaseRefresh=r);entered();return wait;}});
 await Promise.resolve();f.input.value='https://example.org/listen';const pending=f.submit();
 assert.equal(f.host.title,'作品入口');assert.equal(written,f.input.value);
 assert.ok(f.nodes.filter(n=>['input','button'].includes(n.tag)).every(n=>n.disabled));
 await f.submit();assert.equal(calls,1);releaseWrite();await refreshing;
 assert.equal(f.host.isConnected,true);releaseRefresh();await pending;assert.equal(f.host.isConnected,false);
});

test('destination save failure preserves draft, while dismissed completion does not request focus',async()=>{
 const f=editor({save:async()=>{throw Error('原笔记已经变化');}});await Promise.resolve();
 f.input.value='[[My song.mp3]]';await f.submit();
 assert.equal(f.host.isConnected,true);assert.equal(f.input.value,'[[My song.mp3]]');assert.equal(f.input.disabled,false);
 assert.equal(f.nodes.find(n=>n.options.attr?.role==='alert').text,'原笔记已经变化');
 let release,reveal;
 const dismissed=editor({save:()=>new Promise(r=>release=r),onSaved:visible=>{reveal=visible;}});await Promise.resolve();
 const saving=dismissed.submit();dismissed.host.isConnected=false;release();await saving;
 assert.equal(reveal,false);assert.deepEqual(dismissed.notices,['作品入口已保存']);
});

test('a closed destination editor ignores its late initial read',async()=>{
 let release;const f=editor({read:()=>new Promise(r=>release=r)});
 f.host.isConnected=false;release({value:'https://example.org'});await Promise.resolve();
 assert.equal(f.input.focused,undefined);assert.equal(f.input.disabled,true);
});
