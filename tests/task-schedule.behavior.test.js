const test=require('node:test'),assert=require('node:assert/strict');
const {parseTaskLine,patchTaskDates,editTaskDocument}=require('../src/task-document.js');
const {saveTaskEditor}=require('../src/task-editor-writeback.js');
const today='2026-10-07';
const edit=(raw,schedule,extra={})=>editTaskDocument(raw,{rawText:raw},{...extra,schedule},today);
const first='[schedule:: 2026-10-08 14:00 / 2026-10-08 15:00]';
const second='[schedule:: 2026-10-09 09:00 / 2026-10-09 10:00]';

test('an arrangement adds no deadline and retains the original note text and block ID',()=>{
 const raw='  - [ ] Read `a  b` [[Book]] #work [custom:: keep] ^read  ';
 const source='## Work\r\n'+raw+'\r\n  detail\r\n';
 const result=editTaskDocument(source,{rawText:raw},{schedule:{action:'add',start:'2026-10-08 14:00',end:'2026-10-08 15:00'}},today);
 assert.equal(result.text,source.replace(' ^read',` ${first} ^read`));
 assert.equal(parseTaskLine(result.rawText).due,'');
});

test('moving or resizing one arrangement preserves the deadline and other arrangements',()=>{
 const raw=`- [ ] Draft ${first} ${second} 📅 2026-10-10 ^draft`;
 const result=edit(raw,{action:'update',index:0,start:'2026-10-11 14:00',end:'2026-10-11 15:30'});
 assert.equal(result.text,raw.replace(first,'[schedule:: 2026-10-11 14:00 / 2026-10-11 15:30]'));
 assert.equal(parseTaskLine(result.rawText).due,'2026-10-10');
 assert.equal(parseTaskLine(result.rawText).schedules.length,2);
});

test('removing the last arrangement preserves deadline, status and task identity',()=>{
 const raw=`- [/] Draft ${first} [due:: 2026-10-10] [id:: draft] ^draft`;
 assert.equal(edit(raw,{action:'remove',index:0}).text,raw.replace(first,''));
});

test('date-only and cross-midnight arrangements round-trip without invented times',()=>{
 const day=edit('- [ ] Read',{action:'add',start:'2026-10-08'}).rawText;
 assert.equal(day,'- [ ] Read [schedule:: 2026-10-08]');
 const night=edit(day,{action:'add',start:'2026-10-08T23:30',end:'2026-10-09T07:00'}).rawText;
 assert.deepEqual(parseTaskLine(night).schedules.map(({start,end,error})=>({start,end,error})),[
  {start:'2026-10-08',end:'',error:''},{start:'2026-10-08 23:30',end:'2026-10-09 07:00',error:''}
 ]);
});

test('existing scheduled dates are read as arrangements without reinterpreting start and due',()=>{
 const raw='- [ ] Draft 🛫 2026-10-01 📅 2026-10-10 ⏳ 2026-10-08';
 const p=parseTaskLine(raw);
 assert.equal(p.schedules.length,1);assert.equal(p.schedules[0].start,'2026-10-08');
 assert.equal(editTaskDocument(raw,{rawText:raw},{title:'Draft again'},today).text,raw.replace('Draft','Draft again'));
 const replaced=edit(raw,{action:'update',index:0,start:'2026-10-08 14:00',end:'2026-10-08 15:00'}).text;
 assert.equal(replaced,raw.replace('⏳ 2026-10-08',first));
 assert.deepEqual(parseTaskLine('- [ ] Old 🛫 2026-10-01 📅 2026-10-10').schedules,[]);
});

test('literal examples, comments and linked dates never become arrangements',()=>{
 const raw='- [ ] Read `[schedule:: 2026-10-01]` [[X|[schedule:: 2026-10-02]]] <!-- [schedule:: 2026-10-03] --> '+first;
 const p=parseTaskLine(raw);assert.equal(p.schedules.length,1);
 assert.equal(edit(raw,{action:'remove',index:0}).text,raw.replace(first,''));
});

test('invalid arrangements remain editable and unrelated edits preserve the exact source',()=>{
 const raw='- [ ] Read [schedule:: sometime] '+first;
 const p=parseTaskLine(raw);assert.equal(p.schedules.length,2);assert.ok(p.schedules[0].error);
 assert.equal(editTaskDocument(raw,{rawText:raw},{title:'Read more'},today).text,raw.replace('Read','Read more'));
 assert.equal(edit(raw,{action:'update',index:0,start:'2026-10-08'}).text,raw.replace('[schedule:: sometime]','[schedule:: 2026-10-08]'));
});

test('invalid ranges and invalid selectors fail instead of changing another arrangement',()=>{
 const raw=`- [ ] Read ${first} ${second}`;
 for(const schedule of [
  {action:'add',start:'2026-02-30'},
  {action:'add',start:'2026-10-08 24:00'},
  {action:'add',start:'2026-10-08 15:00',end:'2026-10-08 14:00'},
  {action:'add',start:'2026-10-08 15:00',end:'2026-10-08 15:00'},
  {action:'add',start:'2026-10-08',end:'2026-10-08 15:00'},
  {action:'add',end:'2026-10-08'},
  {action:'update',index:5,start:'2026-10-08'},
  {action:'remove',index:-1},
  {action:'remove',index:'0'},
  {action:'move',index:0,start:'2026-10-08'},
  null
 ]) assert.throws(()=>edit(raw,schedule),/invalid-schedule/);
});

test('a no-op preserves field spacing and date-only scheduled emoji syntax',()=>{
 const raw='- [ ] Read [SCHEDULE:: 2026-10-08T14:00 / 2026-10-08T15:00  ] ^id';
 const result=edit(raw,{action:'update',index:0,start:'2026-10-08 14:00',end:'2026-10-08 15:00'});
 assert.equal(result.changed,false);assert.equal(result.rawText,raw);
 assert.equal(edit('- [ ] Read ⏳ 2026-10-08',{action:'update',index:0,start:'2026-10-09'}).text,'- [ ] Read ⏳ 2026-10-09');
});

test('older single-date operations cannot collapse or silently ignore explicit arrangements',()=>{
 const raw=`- [ ] Read ${first} ${second} [due:: 2026-10-10]`;
 assert.throws(()=>patchTaskDates(raw,{scheduled:'2026-10-11'}),/schedule-update-required/);
 assert.throws(()=>editTaskDocument(raw,{rawText:raw},{scheduled:''},today),/schedule-update-required/);
 assert.throws(()=>edit(raw,{action:'remove',index:0},{scheduled:'2026-10-11'}),/conflicting-schedule-patch/);
 assert.equal(patchTaskDates(raw,{due:'2026-10-12'}),raw.replace('due:: 2026-10-10','due:: 2026-10-12'));
});

test('task completion is shared by its arrangements and does not record actual duration',()=>{
 const raw=`- [ ] Read ${first} ${second} [due:: 2026-10-10]`;
 const done=editTaskDocument(raw,{rawText:raw},{status:'done'},today).rawText;
 assert.equal(done,raw.replace('- [ ]','- [x]')+' [completion:: 2026-10-07]');
 assert.equal(parseTaskLine(done).schedules.length,2);
});

test('source-based writeback applies to the original file and rejects external changes',async()=>{
 const raw=`  - [ ] Read ${first} 📅 2026-10-10 ^read`;
 let content='## Reading\r\n'+raw+'\r\n  notes\r\n',writes=0;
 const options={identity:{path:'Projects/Reading.md',rawText:raw},patch:{schedule:{action:'update',index:0,start:'2026-10-09 14:00',end:'2026-10-09 15:00'}},today,
  read:async()=>content,process:async(p,fn)=>{assert.equal(p,'Projects/Reading.md');content=fn(content);writes++;}};
 const before=content,result=await saveTaskEditor(options);
 assert.equal(content,before.replace(first,'[schedule:: 2026-10-09 14:00 / 2026-10-09 15:00]'));
 assert.equal(result.previousText,before);assert.equal(writes,1);
 content=before;
 await assert.rejects(saveTaskEditor({...options,process:async(p,fn)=>{content=content.replace('notes','changed notes');content=fn(content);}}),/task-changed/);
 assert.equal(content,before.replace('notes','changed notes'));
});

test('a stale arrangement index cannot overwrite changed source through task writeback',async()=>{
 const raw=`- [ ] Read ${first} ${second}`;
 let writes=0;
 await assert.rejects(saveTaskEditor({identity:{path:'a.md',rawText:raw},patch:{schedule:{action:'remove',index:0}},today,
  read:async()=>raw.replace(first,''),process:async()=>{writes++;}}),/task-not-found/);
 assert.equal(writes,0);
});

test('an arrangement selector refers to the original source when a title also changes',()=>{
 const raw=`- [ ] Read ${first} ${second}`;
 const result=edit(raw,{action:'remove',index:1},{title:'Read [schedule:: 2026-10-12]'});
 assert.equal(result.text,raw.replace('Read','Read [schedule:: 2026-10-12]').replace(second,''));
});

test('single-day and multi-day date ranges retain date precision and no invented cutoff',()=>{
 const raw='- [ ] Field work 📅 2026-10-15';
 const result=edit(raw,{action:'add',start:'2026-10-08',end:'2026-10-10'}).rawText;
 assert.equal(result,raw+' [schedule:: 2026-10-08 / 2026-10-10]');
 assert.equal(edit(result,{action:'update',index:0,start:'2026-10-08',end:'2026-10-08'}).rawText,raw+' [schedule:: 2026-10-08 / 2026-10-08]');
 assert.throws(()=>edit(raw,{action:'add',start:'2026-10-10',end:'2026-10-08'}),/invalid-schedule/);
});

test('legacy scheduled fields remain single dates, and invalid range data is not silently reinterpreted',()=>{
 const raw='- [ ] Read [scheduled:: 2026-10-08 / 2026-10-09]';
 assert.equal(parseTaskLine(raw).schedules[0].error,'invalid-schedule');
 assert.equal(editTaskDocument(raw,{rawText:raw},{title:'Read more'},today).text,raw.replace('Read','Read more'));
});

test('an invalid schedule aborts before any dependency document is written',async()=>{
 const files={'a.md':'- [ ] Draft','b.md':'- [ ] Prepare'},writes=[];
 await assert.rejects(saveTaskEditor({identity:{path:'a.md',rawText:files['a.md']},today,
  patch:{schedule:{action:'add',start:'2026-02-30'}},dependencies:{before:[{path:'b.md',rawText:files['b.md']}]},createId:()=> 'before1',
  read:async p=>files[p],process:async(p,fn)=>{files[p]=fn(files[p]);writes.push(p);}}),/invalid-schedule/);
 assert.deepEqual(writes,[]);assert.deepEqual(files,{'a.md':'- [ ] Draft','b.md':'- [ ] Prepare'});
});
