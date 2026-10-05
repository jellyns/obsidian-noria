const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),path=require("node:path"),{createRequire}=require("node:module");
class Element{
  constructor(tag="div",options={}){this.tag=tag;this.children=[];this.classes=new Set((options.cls||"").split(" "));this.attrs={...options.attr};this.text=options.text||"";this.style={};this.dataset={};this.isConnected=true;}
  createEl(tag,options={}){const child=new Element(tag,options);this.children.push(child);return child;}
  createDiv(options={}){return this.createEl("div",options);}
  createSpan(options={}){return this.createEl("span",options);}
  addClass(cls){this.classes.add(cls);}
  setText(text){this.text=text;}
  setAttribute(key,value){this.attrs[key]=value;}
  removeAttribute(key){delete this.attrs[key];}
  focus(){this.focused=true;}
  addEventListener(type,fn){this["on"+type]=fn;}
  empty(){this.children=[];}
  closest(){return null;}
  append(node){this.children.push(node);}
  remove(){this.isConnected=false;}
  all(){return this.children.flatMap(child=>[child,...child.all()]);}
  byClass(cls){return this.all().find(child=>child.classes.has(cls));}
  byTag(tag){return this.all().find(child=>child.tag===tag);}
}
function setup(){
  let editor,closed=0;
  const filename=path.resolve(__dirname,"../src/countdown-cards.js"),local=createRequire(filename),module={exports:{}};
  vm.runInNewContext(fs.readFileSync(filename,"utf8"),{module,setTimeout,clearTimeout,require:id=>{
    if(id==="obsidian")return {setTooltip(){},Notice:class{}};
    if(id==="./record-manager.js")return {};
    if(id==="./card-controls.js")return {iconButton:(host,_icon,_label,action)=>{const b=host.createEl("button");b.onclick=action;return b;}};
    return local(id);
  }});
  const cards=Object.create(module.exports.CountdownCards.prototype),writes=[],tasks=[];
  cards.plugin={getNoriaLocale:()=>"zh",getLocalYmd:()=>"2026-09-22",getRuntimeTaskRows:async()=>[],editTaskFields:async(task,patch)=>tasks.push({task,patch}),requestNoriaRefresh(){}};
  cards.views=new Set();cards.schedule=()=>{};cards.write=async(row,patch)=>writes.push({row,patch});
  const row={id:"review",name:"月度复盘",start:"2026-09-01",date:"2026-09-30"};cards.records=async()=>[row];
  return {cards,row,writes,tasks,get editor(){return editor;},get closed(){return closed;}};
}

test("countdown face keeps real progress and opens its full editor without date controls",()=>{
  const s=setup(),host=new Element();let opened;s.cards.manager=id=>opened=id;
  s.cards.row(host,s.row,"2026-09-22");
  assert.ok(parseFloat(host.byClass("noria-countdown-fill").style.width)>0);
  assert.equal(host.byClass("noria-countdown-dates"),undefined);
  assert.equal(host.byClass("noria-countdown-track").all().some(el=>el.tag==="button"),false);
  host.byClass("noria-countdown-main").onclick();assert.equal(opened,s.row.id);
});
test("legacy countdown without a start date has no invented progress or setup footer",()=>{
  const s=setup(),host=new Element();s.cards.row(host,{...s.row,start:""},"2026-09-22");
  assert.equal(host.byClass("noria-countdown-track").dataset.progress,"unknown");assert.equal(host.byClass("noria-countdown-fill").style.width,"0%");
  assert.equal(host.byClass("noria-countdown-start"),undefined);
});
test("task countdown opens original task details with its source identity",()=>{
  const s=setup(),host=new Element();let request;const task={from:"Tasks.md",line:4,rawLine:"- [ ] read"};s.cards.plugin.openTaskDetails=r=>request=r;
  s.cards.row(host,{...s.row,task},"2026-09-22");host.byClass("noria-countdown-main").onclick();
  assert.equal(request.path,"Tasks.md");assert.equal(request.line,4);assert.equal(request.rawText,task.rawLine);
});
test("main cards omit expired and archived records but still show today's deadline",async()=>{
  const s=setup(),host=new Element();s.cards.records=async()=>[{...s.row,date:"2026-09-21"},{...s.row,date:"2026-10-02",archived:true},{...s.row,date:"2026-09-22"}];
  const dispose=await s.cards.render(host);assert.equal(host.all().filter(el=>el.classes.has("noria-countdown")).length,1);assert.equal(host.byClass("noria-countdown").attrs["data-countdown-date"],"2026-09-22");dispose();assert.equal(s.cards.views.size,0);
});
test("disposed countdown views ignore a pending metadata refresh",async()=>{
  const s=setup(),host=new Element(),dispose=await s.cards.render(host);let finish;s.cards.records=()=>new Promise(r=>finish=r);
  const pending=[...s.cards.views][0].refresh();dispose();host.empty();finish([s.row]);await pending;assert.equal(host.children.length,0);
});
