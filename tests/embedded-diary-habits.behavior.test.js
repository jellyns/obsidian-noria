const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const {createRequire}=require("node:module"),path=require("node:path");
const {normalizeReviewSelection}=require("../src/review-center-core.js");
const {DiaryHabitStore}=require("../src/diary-habits.js");
class Element {
  constructor(tag="div",opts={}){this.tag=tag;this.className=opts.cls||"";this.children=[];this.events={};this.style={setProperty(){}};this.dataset={};this.text=opts.text||"";this.attrs=opts.attr||{};}
  createEl(tag,opts){const el=new Element(tag,opts);this.children.push(el);return el;}
  createDiv(opts){return this.createEl("div",opts);}createSpan(opts){return this.createEl("span",opts);}
  addEventListener(name,fn){this.events[name]=fn;}setAttribute(key,value){this.attrs[key]=value;}
  setText(value){this.text=value;}empty(){this.children=[];}focus(){}reportValidity(){return true;}
  all(tag){return this.children.flatMap(el=>[...(el.tag===tag?[el]:[]),...el.all(tag)]);}
}
let lastPopover,closed;
function controls(){
  const filename=path.resolve(__dirname,"../src/diary-habit-view.js"),localRequire=createRequire(filename),module={exports:{}};
  vm.runInNewContext(fs.readFileSync(filename,"utf8"),{module,require:id=>id==="./picture-picker.js"?{renderPicture(){}}:id==="obsidian"?{Notice:class{},Menu:class{},setIcon(){}}:id==="./record-popover.js"?{recordPopover:(anchor,title,build)=>{lastPopover=new Element();closed=false;build(lastPopover,()=>closed=true);}}:localRequire(id)});
  return module.exports;
}
test("embedded noria-view preserves its explicit data source and separately supplies its origin",async()=>{
  const main=fs.readFileSync(path.resolve(__dirname,"../src/main.js"),"utf8");
  const start=main.indexOf('this.registerMarkdownCodeBlockProcessor("noria-view",');
  let callback,called;
  const plugin={registerMarkdownCodeBlockProcessor(_,fn){callback=fn;},runNoriaView:async(...args)=>{called=args;}};
  vm.runInNewContext("(function(){"+main.slice(start,main.indexOf("\n    this.addSettingTab",start))+"}).call(plugin)",{plugin});
  const el={};await callback('{"view":"habitCheckin","props":{"sourcePath":"Custom/Habits.md"}}',el,{sourcePath:"Diary/2026-09-14.md"});
  assert.equal(called[1].sourcePath,"Custom/Habits.md");assert.equal(called[3],"Diary/2026-09-14.md");
});
test("both legacy habit entry points use the viewed date and explicit registry",async()=>{
  for(const view of ["focusPanel","habitCheckin"]){
    const source=fs.readFileSync(path.resolve(__dirname,"../src/runtime/views/periodic/"+view+".js"),"utf8");
    for(const name of ["20260912","2026-09-12","ordinary-note"]){
      let request;
      const bridge={diaryHabits:{render:async r=>{request=r;}},paths:{habitRegistryPath:"Default.md"}};
      const ctx={current:()=>({file:{name,path:"Diary/"+name+".md"}}),el:()=>new Element()};
      const document={getElementById:()=>null,createElement:()=>new Element(),head:{appendChild(){}}};
      await vm.runInNewContext("(async()=>{"+source+"})()",{input:{noriaBridge:bridge,sourcePath:"Custom.md"},ctx,document});
      assert.equal(request.date,name==="ordinary-note"?"":"2026-09-12");assert.equal(request.registryPath,"Custom.md");
    }
  }
});
test("dated records override legacy history including a withdrawal, and custom registries supply definitions",async()=>{
  const files={"Custom.md":"## Active habits\n- 阅读 [type::number] [target::20]\n## Daily recurring task source\n- [x] 阅读 #habit [due::2026-09-14]\n",
    "Diary.md":"- [ ] 阅读 #habit [due::2026-09-14]\n"};
  const p={resolveCalendarNoteSpecAsync:async()=>({path:"Diary.md"}),loadTextFromVault:async path=>files[path]||"",buildRuntimeBridgeConfig:()=>({paths:{habitRegistryPath:"Wrong.md"}})};
  const data=await new DiaryHabitStore(p).load("2026-09-14",{registryPath:"Custom.md"});
  assert.equal(data.active[0].name,"阅读");assert.equal(data.records.length,1);assert.equal(data.records[0].done,false);assert.equal(data.records[0].path,"Diary.md");
});
test("habit controls retain zero, leave unknown actual values blank, and keep failed input",async()=>{
  const {renderDiaryHabitRow}=controls(),plugin={t:key=>key,getNoriaLocale:()=>"zh"},config={name:"阅读",type:"number",target:"20",unit:"分钟"};
  for(const compact of [false,true])for(const value of [0,"",undefined]){
    const host=new Element();let request;
    const row=renderDiaryHabitRow({parent:host,plugin,config,record:{done:true,value},compact,showValue:compact,onSave:async(done,value)=>{request={done,value};return false;}});
    assert.equal(row.all("span").find(el=>el.className===(compact?"noria-habit-status":"noria-diary-habit-value")).text,value===0?(compact?"0":"0分钟"):(compact?"✓":"—"));
    await row.all("button")[0].onclick();
    const input=lastPopover.all("input")[0];assert.equal(input.value,value===0?"0":"");
    input.value="7";await lastPopover.all("form")[0].onsubmit({preventDefault(){}});
    assert.equal(request.value,"7");assert.equal(request.done,false);assert.equal(input.value,"7");
    assert.equal(closed,false);await lastPopover.all("button").at(-1).onclick();assert.equal(request.value,"");assert.equal(request.done,false);
  }
});
test("unknown and future dates cannot load or write a habit record",async()=>{
  const {renderEmbeddedDiaryHabits}=controls();
  const plugin={resolveReviewSelection:normalizeReviewSelection,getLocalYmd:()=>"2026-09-14",t:key=>key};
  for(const date of ["","invalid","2026-02-30","2026-09-15"]){
    const container=new Element();await renderEmbeddedDiaryHabits(plugin,{container,date});
    assert.equal(container.all("input").length,0);assert.equal(container.all("button").length,0);
  }
});
