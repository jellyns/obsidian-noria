const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{createRequire}=require('node:module');
const file=require.resolve('../src/focus-card.js'),local=createRequire(file),loaded={exports:{}};
vm.runInNewContext(fs.readFileSync(file,'utf8'),{module:loaded,require:id=>id==='obsidian'?{SuggestModal:class {}}:id==='./card-controls.js'?{}:local(id)});
const {todayFocusMs}=loaded.exports;
const at=time=>new Date('2026-10-10T'+time+':00').toISOString();
const session=(start,end)=>({start:at(start),end:at(end),mode:'WORK',segments:[{start:at(start),end:at(end)}]});

test('today summary counts elapsed time once across overlapping task records',()=>{
 const state={tasks:{a:{sessions:[session('09:00','10:00')]},b:{sessions:[session('09:30','11:00')]}}};
 assert.equal(todayFocusMs(state,at('12:00')),120*60000);
 const M=require('../src/time-ring-model.js');
 assert.equal(todayFocusMs(state,at('12:00')),M.dayModel(M.focusSegments(state,at('12:00')).rows,'2026-10-10').totalMs);
});
test('today summary preserves pauses, clips midnight and includes only the running work segment',()=>{
 const midnight={start:new Date('2026-10-09T23:50:00').toISOString(),end:at('00:10'),segments:[{start:new Date('2026-10-09T23:50:00').toISOString(),end:at('00:10')}]};
 const ongoing={start:at('09:00'),segments:[{start:at('09:00'),end:at('09:10')}]};
 const state={tasks:{a:{sessions:[midnight,ongoing,{...session('10:00','10:30'),mode:'BREAK'},{start:at('08:00'),end:at('08:30')}]}},active:{taskKey:'a',mode:'WORK',status:'running',startedAt:at('11:00')}};
 assert.equal(todayFocusMs(state,at('11:15')),35*60000);
 state.active.status='paused';assert.equal(todayFocusMs(state,at('11:20')),20*60000);
 assert.equal(todayFocusMs({tasks:{}},at('11:20')),0);
});
test('the same Markdown segment referenced twice does not inflate today summary',()=>{
 const s={...session('09:00','09:20'),recordRef:{path:'Diary.md',id:'focus-0900'}};
 assert.equal(todayFocusMs({tasks:{a:{sessions:[s]},b:{sessions:[s]}}},at('12:00')),20*60000);
});
test('today total follows the selected board date instead of the device date',()=>{
 const state={tasks:{a:{sessions:[{start:'2026-10-10T14:30:00Z',end:'2026-10-10T16:00:00Z',segments:[{start:'2026-10-10T14:30:00Z',end:'2026-10-10T16:00:00Z'}]}]}}};
 assert.equal(todayFocusMs(state,'2026-10-10T16:00:00Z','Asia/Tokyo'),60*60000);
 assert.equal(todayFocusMs(state,'2026-10-10T16:00:00Z','Asia/Shanghai'),0);
});
