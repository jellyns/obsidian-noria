const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{createRequire}=require('node:module');
function element(){return {children:[],hidden:false,isConnected:true,createDiv(options={}){const e=element();e.text=options.text;e.cls=options.cls;this.children.push(e);return e;},createEl(tag,options={}){const e=this.createDiv(options);e.tag=tag;return e;},setText(text){this.text=text;},remove(){this.isConnected=false;},focus(){this.focused=true;},querySelectorAll(){return [];}};}
function setup(read,render=async()=>{}){
 const file=path.resolve('src/statistic-source-reader.js'),module={exports:{}},local=createRequire(file),components=[];
 class Component{constructor(){components.push(this);}load(){}unload(){this.unloaded=true;}registerDomEvent(){}}
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,require:id=>id==='obsidian'?{Component,MarkdownRenderer:{render},parseYaml:()=>({value:7}),parseLinktext:()=>({})}:local(id)});
 const app={vault:{getAbstractFileByPath:p=>({path:p,basename:p,extension:'md'}),read}},modal={contentEl:element(),setTitle(title){this.title=title;}},list=element(),reader=new module.exports.StatisticSourceReader({app,getNoriaLocale:()=> 'en'},modal,list,'Sources');
 return {reader,modal,list,components};
}
test('preview reader shows source properties and safe Markdown, then restores its original list and focus',async()=>{
 let rendered;const s=setup(async()=> '---\nvalue: 7\n---\n## Original\n- [ ] Keep\n```dataviewjs\nwrite()\n```',async(app,body)=>{rendered=body;}),anchor=element();
 await s.reader.show({path:'A.md'},anchor);assert.equal(s.list.hidden,true);assert.equal(s.modal.title,'A.md');assert.match(rendered,/## Original/);assert.doesNotMatch(rendered,/write\(\)|dataviewjs/);
 const properties=s.reader.host.children.find(e=>e.cls==='noria-stat-source-properties');assert.equal(properties.children[1].children[0].children[1].text,'7');
 s.reader.back();assert.equal(s.list.hidden,false);assert.equal(s.modal.title,'Sources');assert.equal(anchor.focused,true);assert.equal(s.components[0].unloaded,true);
});
test('closing a reader during a pending read or render cannot reopen it or retain its component',async()=>{
 let release;const wait=new Promise(r=>release=r),reading=setup(()=>wait),pending=reading.reader.show({path:'A.md'},element());reading.reader.dispose();release('Body');await pending;
 assert.equal(reading.components.length,0);assert.equal(reading.modal.contentEl.children.length,0);
 let finish;const rendering=setup(async()=> 'Body',()=>new Promise(r=>finish=r)),painting=rendering.reader.show({path:'B.md'},element());await new Promise(r=>setImmediate(r));rendering.reader.dispose();finish();await painting;
 assert.equal(rendering.components[0].unloaded,true);assert.equal(rendering.reader.host,null);
});
