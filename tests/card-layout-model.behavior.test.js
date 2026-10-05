const test = require("node:test"), assert = require("node:assert/strict");
const {normalizeDiaryCards, normalizePeriodLayouts, changeDiaryCardLayout, migrateDiaryLayouts, chooseLegacyLayout} = require("../src/card-layout-model.js");

test("one old workspace layout is preserved in independent day, week, month and year layouts", () => {
  const old = {order:["habits","tasks","focus"],cards:{tasks:{size:"full",collapsed:true}}};
  const result = migrateDiaryLayouts({},[{id:"window-1",layout:old}]);
  for (const mode of ["daily","weekly","monthly","yearly"]) {
    assert.equal(result.periods[mode].cards.tasks.size,"full");
    assert.deepEqual(result.periods[mode].order,["habits","tasks","focus"]);
  }
  result.periods.daily.cards.tasks.size="small";
  assert.equal(result.periods.weekly.cards.tasks.size,"full");
  assert.equal(old.cards.tasks.size,"full");
});

test("conflicting old windows are retained until an explicit selection, without resetting existing periods", () => {
  const result=migrateDiaryLayouts({periods:{monthly:{cards:{tasks:{size:"wide"}}}}},[
    {id:"a",layout:{cards:{tasks:{size:"small"}}}},{id:"b",layout:{cards:{tasks:{size:"full"}}}}
  ]);
  assert.equal(result.periods.daily,undefined);
  assert.equal(result.legacy.length,2);
  const chosen=chooseLegacyLayout(result,"b");
  assert.equal(chosen.periods.daily.cards.tasks.size,"full");
  assert.equal(chosen.periods.monthly.cards.tasks.size,"wide");
  assert.equal(chosen.previousLayouts.length,2);
  assert.deepEqual(normalizePeriodLayouts(JSON.parse(JSON.stringify(chosen))).previousLayouts,chosen.previousLayouts);
  assert.throws(()=>chooseLegacyLayout(result,"missing"));
});

test("hidden cards and independent extension instances survive date-layout serialization", () => {
  const a={id:"card-a",type:"extension",source:"dataview",props:{path:"Notes/a.md"}};
  const b={id:"card-b",type:"extension",source:"dataview",props:{path:"Notes/b.md"}};
  const layout=normalizeDiaryCards({widgets:[a,b]});
  const changed=changeDiaryCardLayout(layout,"card-a","hidden",true);
  const roundtrip=normalizeDiaryCards(JSON.parse(JSON.stringify(changed)));
  assert.equal(roundtrip.cards["card-a"].hidden,true);
  assert.equal(roundtrip.cards["card-b"].hidden,false);
  assert.equal(roundtrip.widgets[1].props.path,"Notes/b.md");
  roundtrip.widgets[0].props.path="Notes/c.md";
  assert.equal(a.props.path,"Notes/a.md");
  assert.equal(changeDiaryCardLayout(roundtrip,"card-a","hidden",false).cards["card-a"].hidden,false);
});

test("a completed migration does not get overwritten by stale leaf state on reopen", () => {
  const current=migrateDiaryLayouts({});
  current.periods.weekly.cards.habits.hidden=true;
  const reopened=migrateDiaryLayouts(current,[{id:"stale",layout:{cards:{habits:{size:"full"}}}}]);
  assert.equal(reopened.periods.weekly.cards.habits.hidden,true);
  assert.equal(reopened.periods.weekly.cards.habits.size,"medium");
  assert.deepEqual(reopened.legacy,[]);
});
