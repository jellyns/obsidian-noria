const test=require('node:test'),assert=require('node:assert/strict');
const {restoreTaskMove}=require('../src/task-move-undo.js');
test('timeline undo restores only the moved task across inserted lines and preserves CRLF and code copies',async()=>{
 const before='  - [ ] Read [schedule:: 2026-10-08 23:30 / 2026-10-09 00:30] [due:: 2026-10-12]';
 const after=before.replace('23:30','23:45').replace('00:30','00:45');
 let text='Header\r\n```md\r\n'+after+'\r\n```\r\nNew paragraph\r\n'+after+'\r\n    child\r\n';
 const original=text;await restoreTaskMove({path:'P.md',before,after},async(path,fn)=>{assert.equal(path,'P.md');text=fn(text)});
 const at=original.lastIndexOf(after);assert.equal(text,original.slice(0,at)+before+original.slice(at+after.length));
});
test('timeline undo refuses later modifications and ambiguous copies',async()=>{
 const before='- [ ] Read [schedule:: 2026-10-08]',after='- [ ] Read [schedule:: 2026-10-09]';
 for(const original of [after.replace('[ ]','[x]'),after.replace('10-09','10-10'),after+'\n'+after]){
  let text=original;await assert.rejects(restoreTaskMove({path:'P.md',before,after},async(path,fn)=>{text=fn(text)}),/task-changed|task-not-found|ambiguous/);assert.equal(text,original);
 }
});
