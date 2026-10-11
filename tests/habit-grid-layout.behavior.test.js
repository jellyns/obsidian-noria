const test=require('node:test'),assert=require('node:assert/strict');
const {fitHabitGrid}=require('../src/habit-grid-layout.js');

test('short names release room for recent dates even beyond a seven-day history choice',()=>{
  const grid=fitHabitGrid(552,110);
  assert.equal(grid.nameWidth,110);
  assert.equal(grid.days,18);
  assert.ok(Math.abs(grid.nameWidth+grid.days*grid.dayWidth-552)<.001);
});

test('long names cannot consume the date region on a narrow card',()=>{
  const grid=fitHabitGrid(248,640);
  assert.ok(grid.nameWidth<=248*.36);
  assert.ok(grid.days>=6);
  assert.ok(grid.dayWidth>=24);
});

test('a short history spreads its actual dates across the available width',()=>{
  for(const width of [280,552,900]){
    const grid=fitHabitGrid(width,110,7);
    assert.ok(grid.days<=7);
    assert.ok(grid.dayWidth>=24);
    assert.ok(Math.abs(grid.nameWidth+grid.days*grid.dayWidth-width)<.001);
  }
  assert.equal(fitHabitGrid(900,110,7).days,7);
  assert.ok(fitHabitGrid(900,110).days>7);
});

test('continuous resizing fills the card with readable aligned date lanes',()=>{
  for(const name of [60,110,150,420])for(let width=220;width<=1600;width++){
    const grid=fitHabitGrid(width,name);
    assert.ok(grid.dayWidth>=24&&grid.dayWidth<=29);
    assert.ok(Math.abs(grid.nameWidth+grid.days*grid.dayWidth-width)<.001);
    assert.ok(grid.days>=fitHabitGrid(width-1,name).days);
  }
});
