const test = require("node:test"), assert = require("node:assert/strict");
const vm = require("node:vm"), fs = require("node:fs"), path = require("node:path");
const {normalizeDiaryCards,changeDiaryCardLayout} = require("../src/card-layout-model.js");
const plain = value => JSON.parse(JSON.stringify(value));

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
  assert.deepEqual(plain(restored.order),["habits","focus","tasks"]);
  assert.deepEqual(plain(restored.cards.habits),{size:"wide",collapsed:true,hidden:false,height:null});
  assert.equal(restored.cards.focus.size,"medium");
  restored.cards.habits.size="full";
  assert.equal(input.cards.habits.size,"wide");
  assert.equal(normalizeDiaryCards(null).order.length,3);
});

test("moving visible cards skips a period's absent focus card and survives a round trip", () => {
  const layout=normalizeDiaryCards({order:["tasks","focus","habits"]});
  const moved=changeDiaryCardLayout(layout,"habits","move","up",["tasks","habits"]);
  assert.deepEqual(plain(moved.order),["habits","focus","tasks"]);
  assert.deepEqual(plain(normalizeDiaryCards(JSON.parse(JSON.stringify(moved)))),plain(moved));
  assert.deepEqual(plain(changeDiaryCardLayout(moved,"habits","move","up",["habits","tasks"])),plain(moved));
  assert.deepEqual(plain(layout.order),["tasks","focus","habits"]);
});

test("width and collapse updates are independent and reset restores the original layout", () => {
  const resized=changeDiaryCardLayout({},"tasks","size","full");
  const folded=changeDiaryCardLayout(resized,"habits","collapsed",true);
  assert.equal(folded.cards.tasks.size,"full");
  assert.equal(folded.cards.habits.collapsed,true);
  assert.equal(folded.cards.focus.collapsed,false);
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
