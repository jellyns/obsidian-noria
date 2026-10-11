const test=require('node:test'),assert=require('node:assert/strict');
const {bindFocusTaskDrag,hasFocusTaskDrag,takeFocusTaskDrag,resolveFocusTask}=require('../src/focus-task-drag.js');
test('only an internal drag from the same plugin instance can be consumed once',()=>{
  const plugin={},handlers={},handle={addEventListener:(name,fn)=>handlers[name]=fn};
  const dt={types:[],setData(type){this.types.push(type);}};
  bindFocusTaskDrag(plugin,handle,()=>({path:'Tasks.md',text:'Read',line:2}));
  assert.equal(hasFocusTaskDrag(plugin,dt),false);handlers.dragstart({dataTransfer:dt});
  assert.equal(hasFocusTaskDrag({},dt),false);assert.equal(hasFocusTaskDrag(plugin,dt),true);
  assert.equal(takeFocusTaskDrag(plugin,dt).path,'Tasks.md');assert.equal(takeFocusTaskDrag(plugin,dt),null);
  handlers.dragstart({dataTransfer:dt});handlers.dragend();assert.equal(hasFocusTaskDrag(plugin,dt),false);
});
test('drop resolves an unchanged moved source line and rejects completed, changed or ambiguous sources',async()=>{
  let contents='\n\n- [ ] Read';
  const plugin={getNoriaLocale:()=> 'en',app:{vault:{getAbstractFileByPath:path=>({path}),read:async()=>contents}}};
  const source={path:'Tasks.md',rawText:'- [ ] Read',line:0};
  const meta=await resolveFocusTask(plugin,source);assert.equal(meta.lineHint,2);assert.equal(meta.title,'Read');
  contents='- [x] Read';await assert.rejects(resolveFocusTask(plugin,source),/changed/);
  contents='- [ ] New title';await assert.rejects(resolveFocusTask(plugin,source),/changed/);
  contents='- [ ] Read\n- [ ] Read';await assert.rejects(resolveFocusTask(plugin,source),/ambiguous/);
});
