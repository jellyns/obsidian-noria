const test=require('node:test'),assert=require('node:assert/strict');
const {schedulePatch}=require('../src/task-schedule-editor.js');
const {parseTaskLine,editTaskDocument}=require('../src/task-document.js');
const {saveTaskEditor}=require('../src/task-editor-writeback.js');
const fs=require('node:fs'),vm=require('node:vm');
const a='[schedule:: 2026-10-08 14:00 / 2026-10-08 15:00]',b='[schedule:: 2026-10-09]',c='[schedule:: 2026-10-10]';
test('one editor save removes, updates and adds arrangements using original selectors',()=>{
 const raw=`- [ ] Read ${a} ${b} ${c} 📅 2026-10-11 ^read`,initial=parseTaskLine(raw).schedules;
 const patch=schedulePatch(initial,[{index:1,start:'2026-10-12',end:''},{index:2,start:'2026-10-10',end:''},{start:'2026-10-13',end:''}]);
 const result=editTaskDocument(raw,{rawText:raw},{schedule:patch},'2026-10-07').rawText;
 assert.equal(result,raw.replace(a,'').replace(b,'[schedule:: 2026-10-12]').replace(' ^read',' [schedule:: 2026-10-13] ^read'));
});
test('an unchanged or empty new row generates no operation; invalid source is retained',()=>{
 const initial=parseTaskLine(`- [ ] Read ${a} [schedule:: someday]`).schedules;
 assert.deepEqual(schedulePatch(initial,[{index:0,start:initial[0].start,end:initial[0].end},{index:1,start:'',end:''},{start:'',end:''}]),[]);
 assert.deepEqual(schedulePatch(initial,[{index:0,start:initial[0].start,end:initial[0].end}]),[{action:'remove',index:1}]);
});
test('clearing all fields cancels only that arrangement',()=>{
 const initial=parseTaskLine(`- [ ] Read ${a} ${b}`).schedules;
 assert.deepEqual(schedulePatch(initial,[{index:0,start:'',end:''},{index:1,start:'2026-10-09',end:''}]),[{action:'remove',index:0}]);
});
test('duplicate or invalid batch selectors fail before any document is written',async()=>{
 const raw=`- [ ] Read ${a} ${b}`;
 for(const schedule of [[{action:'remove',index:0},{action:'update',index:0,start:'2026-10-11'}],[{action:'remove',index:1},{action:'remove',index:7}],[{action:'remove',index:0},{action:'add',start:'2026-02-30'}]]){
  let writes=0;
  await assert.rejects(saveTaskEditor({identity:{path:'a.md',rawText:raw},patch:{schedule},today:'2026-10-07',read:async()=>raw,process:async()=>{writes++;}}),/invalid-schedule/);
  assert.equal(writes,0);
 }
});

function editorFields(initial,rows){
 const field=value=>({value,readDateTimeString(){return this.value;},dateInput:{value:value.slice(0,10)},timeInput:{value:value.slice(11)}});
 const source=fs.readFileSync(require.resolve('../src/runtime/views/tasks-calendar/runtime-core.js'),'utf8');
 const from=source.indexOf('\tvar workbenchSaving=false'),to=source.indexOf('\tvar close = function',from);
 const ctx=vm.createContext({workbench:{},startParts:field(''),endParts:field('2026-10-11'),scheduledParts:field('2026-10-08'),createdParts:field(''),doneParts:field(''),cancelledParts:field(''),
  inTitle:{value:'Read'},inTags:{value:''},taskPriority:'normal',repeatInput:{value:''},taskAdvanced:{status:'todo'},selectedBeforeRefs:[],selectedAfterRefs:[],originalAfterRefs:[],taskDependencyRefKey:r=>r.path,getKnownTaskIds:()=>[]});
 vm.runInContext(source.slice(from,to),ctx);
 ctx.scheduleEditor={snapshot:()=>rows,patch:()=>schedulePatch(initial,rows),dateParts:()=>[field('2026-10-08'),field('')]};
 ctx.workbenchInitialFields=ctx.readWorkbenchInputs();return ctx;
}
test('the real editor collector sends arrangements and deadline in one save without the legacy scheduled field',async()=>{
 const raw=`- [ ] Read ${a} ${b} [due:: 2026-10-11]`,initial=parseTaskLine(raw).schedules;
 const ctx=editorFields(initial,[{index:1,start:'2026-10-12',end:''}]);ctx.endParts.value='2026-10-15';
 const value=ctx.readWorkbenchFields();
 assert.deepEqual(JSON.parse(JSON.stringify(value.patch)),{due:'2026-10-15',schedule:[{action:'update',index:1,start:'2026-10-12',end:''},{action:'remove',index:0}]});
 let content=raw;
 await saveTaskEditor({identity:{path:'a.md',rawText:raw},patch:value.patch,today:'2026-10-07',read:async()=>content,process:async(p,fn)=>{content=fn(content);}});
 assert.equal(content,raw.replace(a,'').replace(b,'[schedule:: 2026-10-12]').replace('due:: 2026-10-11','due:: 2026-10-15'));
 assert.equal(ctx.allEditorDateParts().length,7);
});
test('the editor draft collector keeps incomplete schedule input and does not write an unchanged legacy date',()=>{
 const initial=parseTaskLine('- [ ] Read [scheduled:: 2026-10-08]').schedules;
 const rows=[{index:0,start:'2026-10-08',end:'',startDate:'2026-10-08',startTime:'',endDate:'',endTime:''},{start:'',end:'',startDate:'',startTime:'14:00',endDate:'',endTime:''}];
 const ctx=editorFields(initial,rows),draft=ctx.readWorkbenchFields();
 assert.deepEqual(JSON.parse(JSON.stringify(draft.patch)),{});
 assert.equal(draft.scheduleDraft[1].startTime,'14:00');
 assert.equal(Object.hasOwn(draft.dateInputs,'scheduled'),false);
});
