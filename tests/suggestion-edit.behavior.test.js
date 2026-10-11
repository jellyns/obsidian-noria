const test=require('node:test'),assert=require('node:assert/strict');
const {createPublicApi}=require('../src/public-api.js'),{suggestionEdit}=require('../src/suggestion-edit.js');
function fixture(){
 const path='Diary/2026-10-11.md';let raw='---\nkeep: true\n---\n## 记录\n保留记录\n\n## 建议\n\n- 核对来源\n- 调整安排\n\n## 复盘\n保留复盘\n',queue=Promise.resolve();
 const plugin={app:{vault:{getAbstractFileByPath:p=>p===path?{path}:null}},normalizePath:p=>p,loadTextFromVault:async()=>raw,resolveCalendarNoteSpecAsync:async()=>({path}),requestNoriaRefresh:()=>{},processTextAtVaultPath(p,fn){assert.equal(p,path);const op=queue.catch(()=>{}).then(()=>{raw=fn(raw);});queue=op;return op;}};
 return {api:createPublicApi(plugin),read:()=>raw,external:text=>{raw=text;}};
}
test('editing advice reuses ordinary Markdown and preserves unrelated concurrent diary changes',async()=>{
 const f=fixture(),source=await f.api.suggestions.read({date:'2026-10-11'}),edit=suggestionEdit(f.api,source);
 f.external(f.read().replace('保留记录','用户新加的记录'));
 await edit.save('- 先核对原文\n- 周末再安排');
 assert.match(f.read(),/用户新加的记录/);assert.match(f.read(),/## 复盘\n保留复盘/);assert.match(f.read(),/keep: true/);assert.equal(edit.snapshot().markdown,'- 先核对原文\n- 周末再安排');
});
test('remove then undo restores just the advice and preserves later edits outside it',async()=>{
 const f=fixture(),source=await f.api.suggestions.read({date:'2026-10-11'}),change=await suggestionEdit(f.api,source).save('');
 assert.equal((await f.api.suggestions.read({date:source.date})).markdown,'');
 f.external(f.read().replace('保留复盘','补充复盘'));
 await change.undo();assert.equal((await f.api.suggestions.read({date:source.date})).markdown,source.markdown);assert.match(f.read(),/补充复盘/);
 const restored=f.read();await change.undo();assert.equal(f.read(),restored);
});
test('stale edit and stale undo cannot overwrite new advice',async()=>{
 const f=fixture(),source=await f.api.suggestions.read({date:'2026-10-11'}),edit=suggestionEdit(f.api,source);
 f.external(f.read().replace('核对来源','用户改过的建议'));
 await assert.rejects(edit.save('- 旧草稿'),e=>e.code==='conflict');assert.match(f.read(),/用户改过的建议/);
 const fresh=await f.api.suggestions.read({date:source.date}),change=await suggestionEdit(f.api,fresh).save('');
 await f.api.suggestions.update({...change.after,markdown:'- Agent 刚写的新建议'});
 await assert.rejects(change.undo(),e=>e.code==='conflict');assert.match(f.read(),/Agent 刚写的新建议/);
});
