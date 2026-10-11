const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');

function editor(update,onSaved){
 const nodes=[],notices=[];
 class Element {
  constructor(tag,options={}){this.tag=tag;this.options=options;this.value='';this.children=[];this.isConnected=true;nodes.push(this);}
  createEl(tag,options){const child=new Element(tag,options);this.children.push(child);return child;}
  createDiv(options){return this.createEl('div',options);}
  createSpan(options){return this.createEl('span',options);}
  addClass(){} setText(text){this.text=text;} reportValidity(){return true;}
 }
 const host=new Element('div'),module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/media-editor.js'),'utf8'),{module,crypto:require('node:crypto'),require:id=>{
  if(id==='./record-popover.js')return {recordPopover:(_anchor,_title,build)=>build(host,()=>{host.isConnected=false;})};
  if(id==='./media-record.js')return {updateMedia:update};
  if(id==='obsidian')return {Notice:class{constructor(text){notices.push(text);}}};
  throw Error(id);
 }});
 module.exports.mediaEditor({getNoriaLocale:()=> 'zh'},{},{path:'原子习惯.md',title:'原子习惯',kinds:['book'],revision:'r1',properties:{status:'进行中',pageprogress:20,pagecount:320}},{onSaved});
 return {host,nodes,notices,input:label=>nodes.find(n=>n.options.attr?.['aria-label']===label),submit:()=>nodes.find(n=>n.tag==='form').onsubmit({preventDefault(){}})};
}

test('progress save freezes all edit actions, writes the captured values once and awaits the refresh',async()=>{
 let resolveWrite,resolveRefresh,request,refreshDone=false,calls=0,entered;
 const refreshing=new Promise(r=>entered=r);
 const f=editor((_plugin,value)=>{calls++;request=value;return new Promise(r=>resolveWrite=r);},async()=>{const wait=new Promise(r=>resolveRefresh=r);entered();await wait;refreshDone=true;});
 f.input('读到第几页').value='80';const saving=f.submit();
 for(const el of f.nodes.filter(n=>['input','button'].includes(n.tag)))assert.equal(el.disabled,true);
 await f.submit();assert.equal(calls,1);assert.equal(request.patch.pageprogress,80);assert.equal(request.patch.finishedAt,undefined);
 resolveWrite({changed:true});await refreshing;assert.equal(refreshDone,false);assert.equal(f.host.isConnected,true);
 resolveRefresh();await saving;assert.equal(refreshDone,true);assert.equal(f.host.isConnected,false);assert.equal(f.notices.length,0);
});

test('conflicting progress save retains typed input and re-enables editing',async()=>{
 const f=editor(async()=>{throw Object.assign(Error('conflict'),{code:'conflict'});});
 f.input('状态').value='已完成';await f.submit();
 assert.equal(f.host.isConnected,true);assert.equal(f.input('状态').value,'已完成');
 assert.match(f.nodes.find(n=>n.options.attr?.role==='alert').text,/当前输入未保存/);
 for(const el of f.nodes.filter(n=>['input','button'].includes(n.tag)))assert.equal(el.disabled,false);
});

test('a refresh error is handled and a dismissed save reports completion without requesting focus',async()=>{
 let release,reveal;
 const f=editor(()=>new Promise(r=>release=r),async(_result,visible)=>{reveal=visible;});
 f.input('读到第几页').value='40';const saving=f.submit();f.host.isConnected=false;release({changed:true});await saving;
 assert.equal(reveal,false);assert.deepEqual(f.notices,['作品记录已保存']);
 const broken=editor(async()=>({changed:true}),async()=>{throw Error('refresh failed');});
 broken.input('读到第几页').value='40';await broken.submit();assert.match(broken.nodes.find(n=>n.options.attr?.role==='alert').text,/refresh failed/);
});
