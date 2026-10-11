const test = require("node:test"), assert = require("node:assert/strict");
const vm = require("node:vm"), fs = require("node:fs"), path = require("node:path");
const {normalizeDiaryCards,changeDiaryCardLayout} = require("../src/card-layout-model.js");
const plain = value => JSON.parse(JSON.stringify(value));

test('legacy prose becomes movable before supplementary cards without changing sources or preferences',()=>{
  const input={order:['tasks','habits','focus','dates'],cards:{tasks:{size:'wide'},dates:{size:'full'}},widgets:[{id:'dates',source:'noria:note',props:{path:'Dates.base'}}]};
  const layout=normalizeDiaryCards(input);
  assert.deepEqual(layout.order,['tasks','habits','record','review','dates']);
  assert.equal(layout.cards.record.size,'full');assert.equal(layout.cards.review.size,'full');
  assert.equal(layout.cards.tasks.size,'wide');assert.deepEqual(layout.widgets,input.widgets.map(w=>({...w,size:'full'})));
  const moved=changeDiaryCardLayout(layout,'review','reorder',{target:'tasks',after:false});
  assert.deepEqual(normalizeDiaryCards(moved).order,['review','tasks','habits','record','dates']);
  const hidden=changeDiaryCardLayout(moved,'record','hidden',true);
  assert.equal(normalizeDiaryCards(hidden).cards.record.hidden,true);
  assert.equal(changeDiaryCardLayout(hidden,'record','hidden',false).cards.record.hidden,false);
  assert.deepEqual(input.order,['tasks','habits','focus','dates']);
});

test('diary card removal and undo preserve its configuration and later changes to other cards',async()=>{
  const original={id:'reading',type:'extension',source:'noria:media',props:{filter:'book'},size:'wide'};
  let layout=normalizeDiaryCards({widgets:[original],order:['focus','reading','tasks','habits'],cards:{reading:{size:'wide',height:220}}}),menu,undo;
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/diary-card-layout.js'),'utf8'),{module,exports:module.exports,require(id){
    if(id==='obsidian')return {setIcon(){}};
    if(id==='./card-layout-model.js')return {normalizeDiaryCards,changeDiaryCardLayout};
    if(id==='./diary-cards-document.js')return require('../src/diary-cards-document.js');
    if(id==='./card-controls.js')return {openCardMenu:options=>{menu=options;}};
    if(id==='./card-direct-controls.js')return {notifyHidden:(_doc,_message,restore)=>{undo=restore;}};
    throw Error(id);
  }});
  const view=Object.create(module.exports.DiaryCardLayout.prototype);
  Object.assign(view,{workbench:{diary:{}},mode:'daily',layout,cards:new Map([['reading',{title:'Reading',host:{}}]]),async updatePresentation(change){layout=normalizeDiaryCards(change(layout));this.layout=layout;},system:{text:zh=>zh,t:key=>key,layout:()=>layout},plugin:{}});
  const before=plain(layout.cards.reading);view.openMenu('reading',{ownerDocument:{}});await menu.remove();
  assert.equal(layout.widgets.length,1);assert.equal(layout.order.includes('reading'),true);
  assert.deepEqual(plain(layout.cards.reading),{...before,hidden:true});
  assert.deepEqual(plain(normalizeDiaryCards(JSON.parse(JSON.stringify(layout))).widgets[0]),original);
  layout.cards.tasks.size='full';await undo();
  assert.deepEqual(plain(layout.widgets[0]),original);assert.deepEqual(plain(layout.cards.reading),before);
  assert.deepEqual(plain(layout.order),['tasks','reading','habits','record','review']);assert.equal(layout.cards.tasks.size,'full');
});

test("extension configuration and duplicates retain the width selected in the layout", () => {
  const original={id:"sleep-card",size:"medium",source:"noria:statistics",props:{property:"sleep_hours"}};
  const layout=normalizeDiaryCards({widgets:[original],cards:{"sleep-card":{size:"wide"}}});
  assert.equal(layout.widgets[0].size,"wide");
  assert.equal(original.size,"medium");
  layout.widgets.push({...layout.widgets[0],id:"sleep-copy"});
  const restored=normalizeDiaryCards(JSON.parse(JSON.stringify(layout)));
  assert.equal(restored.cards["sleep-copy"].size,"wide");
  const resized=normalizeDiaryCards(changeDiaryCardLayout(restored,"sleep-copy","size","small"));
  assert.equal(resized.widgets.find(w=>w.id==="sleep-copy").size,"small");
  assert.equal(resized.widgets.find(w=>w.id==="sleep-card").size,"wide");
});

test("restored card layout retains known preferences and supplies newly available cards", () => {
  const input={order:["habits","habits","removed"],cards:{habits:{size:"wide",collapsed:true},focus:{size:"invalid"}}};
  const restored=normalizeDiaryCards(input);
  assert.deepEqual(plain(restored.order),["habits","tasks","record","review"]);
  assert.deepEqual(plain(restored.cards.habits),{size:"wide",collapsed:true,hidden:false,height:null});
  assert.equal(restored.cards.tasks.size,"medium");
  restored.cards.habits.size="full";
  assert.equal(input.cards.habits.size,"wide");
  assert.equal(normalizeDiaryCards(null).order.length,4);
});

test("moving visible cards survives migration and a round trip", () => {
  const layout=normalizeDiaryCards({order:["tasks","focus","habits"]});
  const moved=changeDiaryCardLayout(layout,"habits","move","up",["tasks","habits"]);
  assert.deepEqual(plain(moved.order),["habits","tasks","record","review"]);
  assert.deepEqual(plain(normalizeDiaryCards(JSON.parse(JSON.stringify(moved)))),plain(moved));
  assert.deepEqual(plain(changeDiaryCardLayout(moved,"habits","move","up",["habits","tasks"])),plain(moved));
  assert.deepEqual(plain(layout.order),["tasks","habits","record","review"]);
});

test("width and collapse updates are independent and reset restores the original layout", () => {
  const resized=changeDiaryCardLayout({},"tasks","size","full");
  const folded=changeDiaryCardLayout(resized,"habits","collapsed",true);
  assert.equal(folded.cards.tasks.size,"full");
  assert.equal(folded.cards.habits.collapsed,true);
  assert.equal(folded.cards.tasks.collapsed,false);
  assert.deepEqual(plain(changeDiaryCardLayout(folded,"missing","size","wide")),plain(folded));
  assert.deepEqual(plain(changeDiaryCardLayout(folded,"tasks","reset")),plain(normalizeDiaryCards()));
});

test("Obsidian's late setState restores cards in an already mounted workbench", async () => {
  const source=fs.readFileSync(path.join(__dirname,"../src/main.js"),"utf8");
  const start=source.indexOf("class NoriaHomeView"), end=source.indexOf("class NoriaStatsView",start);
  const calls=[];
  const HomeView=vm.runInNewContext(source.slice(start,end)+"; NoriaHomeView",{NoriaPaneView:class {async setState(){calls.push("parent");}}});
  const view=Object.create(HomeView.prototype), layout=changeDiaryCardLayout({},"tasks","size","full");
  view.workbench={diary:{cards:{restore(value){calls.push("restore");assert.equal(value,layout);}}},async show(){calls.push("show");}};
  await view.setState({page:"diary",diaryCards:layout},{});
  assert.deepEqual(calls,["restore","show","parent"]);
  assert.equal(view.workbench.diaryCards,layout);
  calls.length=0;
  await view.setState({page:"home"},{});
  assert.deepEqual(calls,["show","parent"]);
  assert.equal(view.workbench.diaryCards,layout);
});
