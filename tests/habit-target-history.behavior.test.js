const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../src/habit-plan.js');
const D=require('../src/habit-definition.js');
const {writeHabitMarkdown,habitRecords}=require('../src/diary-habits.js');

function changed(){
 let raw=D.writeHabitDefinition('',null,{name:'阅读',type:'number',target:'30',unit:'分钟',startedOn:'2026-10-01'},{id:'read',today:'2026-10-01'});
 const old=D.readHabitDefinitions(raw)[0];
 raw=D.writeHabitDefinition(raw,old,{...old,target:'45',effective:'2026-10-08'},{today:'2026-10-07'});
 return D.readHabitDefinitions(raw)[0];
}
test('a future numeric target preserves earlier dated targets through Markdown round trips',()=>{
 const config=changed();
 assert.equal(P.targetAt(config,'2026-10-07'),'30');
 assert.equal(P.targetAt(config,'2026-10-08'),'45');
 const renamed=P.evolve(config,{...config,name:'读书'},'2026-10-07');
 assert.equal(renamed.targetPlan,config.targetPlan);
});
test('backfill uses the dated goal and preserves an existing record snapshot',()=>{
 const config=changed(),date='2026-10-05';
 let raw=writeHabitMarkdown('',{config,date,done:false,value:'35'});
 let row=habitRecords(raw,date,'')[0];assert.equal(row.target,'30');assert.equal(row.done,true);
 raw=raw.replace('[target:: 30]','[target:: 20]');
 row=habitRecords(writeHabitMarkdown(raw,{config,date,done:false,value:'25'}),date,'')[0];
 assert.equal(row.target,'20');assert.equal(row.done,true);
});
test('legacy unknown dates are not invented; invalid and duplicate history is rejected',()=>{
 const old={name:'阅读',type:'number',target:'30',unit:'分钟'};
 const config=P.evolve(old,{...old,target:'45',effective:'2026-10-08'},'2026-10-07');
 assert.equal(P.targetAt(config,'2026-10-06'),'');
 assert.equal(P.targetAt(config,'2026-10-07'),'30');
 assert.throws(()=>writeHabitMarkdown('',{config,date:'2026-10-06',done:true,value:'35'}),/目标|target/i);
 const explicit=habitRecords(writeHabitMarkdown('',{config,date:'2026-10-06',done:false,value:'35',historicalTarget:'25'}),'2026-10-06','')[0];
 assert.equal(explicit.target,'25');assert.equal(explicit.done,true);
 assert.equal(P.targetAt(config,'2026-10-06'),'','one explicit record does not invent a past plan');
 for(const targetPlan of ['2026-02-30=30','2026-10-07=0','2026-10-07=30;2026-10-07=45'])assert.throws(()=>P.targetAt({...old,targetPlan},'2026-10-07'));
 assert.throws(()=>P.evolve(old,{...old,target:'45',effective:'2026-10-06'},'2026-10-07'));
});
test('bound daily loading exposes the same dated target used for its completion',async()=>{
 const {DiaryHabitStore}=require('../src/diary-habits.js');
 const config=changed(),registry='## Active habits\n- 阅读 [type:: number] [target:: 45] [record-field:: minutes] [target-plan:: '+config.targetPlan+']\n';
 const p={getLocalYmd:()=> '2026-10-07',buildRuntimeBridgeConfig:()=>({paths:{habitRegistryPath:'Habits.md'}}),resolveCalendarNoteSpecAsync:async()=>({path:'day.md'}),loadTextFromVault:async path=>path==='Habits.md'?registry:'minutes: 35',records:{definitions:()=>[{property:'minutes'}],read:()=>35}};
 const row=(await new DiaryHabitStore(p).load('2026-10-07')).records[0];
 assert.equal(row.target,'30');assert.equal(row.value,35);assert.equal(row.done,true);
});
