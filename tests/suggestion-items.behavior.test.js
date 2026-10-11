const test=require('node:test'),assert=require('node:assert/strict');
const {suggestionItems,replaceSuggestionItem,appendSuggestionItem}=require('../src/suggestion-items.js');
const {suggestionEdit}=require('../src/suggestion-edit.js');
const {createPublicApi}=require('../src/public-api.js');

test('suggestion ranges keep nested lists, continuation and fenced examples with their parent',()=>{
 const raw='- 核对 [[项目]]\n  先读原文。\n  - 子项\n\n  ```md\n  - 只是例子\n  ```\n\n- 调整安排\n';
 const items=suggestionItems(raw);assert.equal(items.length,2);assert.match(items[0].markdown,/只是例子/);assert.equal(items[1].markdown,'- 调整安排');
 assert.equal(replaceSuggestionItem(raw,items[1],'- 明天再安排'),raw.trimEnd().replace('- 调整安排','- 明天再安排'));
 assert.match(replaceSuggestionItem(raw,items[0],''),/^- 调整安排$/);
});
test('paragraphs and ordered items retain their Markdown and source order',()=>{
 const raw='先核对材料。\n\n1. 阅读论文\n2. 调整安排\n\n最后回看。';
 assert.deepEqual(suggestionItems(raw).map(x=>x.markdown),['先核对材料。','1. 阅读论文','2. 调整安排','最后回看。']);
 assert.equal(appendSuggestionItem(raw,'- 补充来源'),raw+'\n\n- 补充来源');
});
test('heading-led advice stays together and reference documents are not split unsafely',()=>{
 assert.deepEqual(suggestionItems('### 阅读\n\n- 先看原文\n- 再看笔记\n\n### 安排\n\n明天再做').map(x=>x.markdown),['### 阅读\n\n- 先看原文\n- 再看笔记','### 安排\n\n明天再做']);
 const raw='- 看 [来源][ref]\n- 再考虑\n\n[ref]: https://example.com';assert.equal(suggestionItems(raw).length,1);
 assert.equal(suggestionItems('<!--\n- 隐藏说明\n-->\n\n- 阅读').length,1);
});
test('exact ranges reject different text and deleting the last item leaves an empty section body',()=>{
 const raw='- 重复\n- 重复',item=suggestionItems(raw)[1];assert.equal(replaceSuggestionItem(raw,item,''),'- 重复');
 assert.throws(()=>replaceSuggestionItem('- 重复\n- 已变化',item,''),e=>e.code==='conflict');
 assert.equal(replaceSuggestionItem('- 唯一',suggestionItems('- 唯一')[0],''),'');
});
test('item edits and undo use section conflict checks without touching neighboring diary sections',async()=>{
 const path='Diary/2026-10-11.md';let raw='## 记录\n原记录\n\n## 建议\n\n- 第一条\n- 第二条\n\n## 复盘\n原复盘\n';
 const refreshes=[];
 const plugin={app:{vault:{getAbstractFileByPath:()=>({path})}},normalizePath:p=>p,loadTextFromVault:async()=>raw,resolveCalendarNoteSpecAsync:async()=>({path}),requestNoriaRefresh(scope,reason){refreshes.push(reason);},async processTextAtVaultPath(p,fn){raw=fn(raw);}};
 const api=createPublicApi(plugin),source=await api.suggestions.read({date:'2026-10-11'}),item=suggestionItems(source.markdown)[1];
 raw=raw.replace('原记录','新增记录');const change=await suggestionEdit(api,source).save(replaceSuggestionItem(source.markdown,item,''));assert.match(raw,/新增记录/);assert.match(raw,/原复盘/);assert.doesNotMatch(raw,/第二条/);
 await change.undo();assert.match(raw,/- 第一条\n- 第二条/);
 assert.equal(refreshes.length,2);assert.notEqual(refreshes[0],refreshes[1],'rapid undo must not be deduplicated against the deletion refresh');
 const latest=await api.suggestions.read({date:source.date});raw=raw.replace('第一条','外部修改');
 await assert.rejects(suggestionEdit(api,latest).save(replaceSuggestionItem(latest.markdown,suggestionItems(latest.markdown)[1],'- 更新第二条')),e=>e.code==='conflict');assert.match(raw,/外部修改/);
});
