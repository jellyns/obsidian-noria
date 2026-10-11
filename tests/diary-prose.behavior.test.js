const test=require('node:test'),assert=require('node:assert/strict');
const {projectDiaryProse}=require('../src/diary-prose.js');
test('diary reading conceals supported fields and retains complete writeback identity',()=>{
  const raw='- [ ] Review **model** [[Paper|source]] [scheduled:: 2026-10-06] [created:: 2026-10-01] [id:: abc]';
  const source='## Plan\r\n\r\n'+raw+'\r\n  - [x] Nested ✅ 2026-10-05\r\n';
  const result=projectDiaryProse(source);
  assert.equal(result.tasks.length,2);assert.equal(result.tasks[0].rawText,raw);assert.equal(result.tasks[0].line,2);
  assert.match(result.markdown,/Review \*\*model\*\* \[\[Paper\|source\]\]/);
  assert.doesNotMatch(result.markdown,/scheduled::|created::|id::|✅ 2026/);
  assert.match(result.markdown,/\r\n  - \[x\] Nested/);
});
test('ordinary properties, inline literals, links, custom fields and escaped examples remain readable',()=>{
  const source=['[scheduled:: not a task]','- [ ] Read `[id:: code]` [[Note]] [custom:: idea] \\[due:: example] [id:: link][ref] [created:: 2026-10-01]','[ref]: https://example.com'].join('\n');
  const result=projectDiaryProse(source);
  assert.match(result.markdown,/\[scheduled:: not a task\]/);assert.match(result.markdown,/`\[id:: code\]`/);
  assert.match(result.markdown,/\[custom:: idea\]/);assert.match(result.markdown,/\\\[due:: example\]/);
  assert.match(result.markdown,/\[id:: link\]\[ref\]/);assert.doesNotMatch(result.markdown,/created::/);
});
test('code fences, indented examples and comments are never promoted to editable tasks',()=>{
  for(const source of ['```md\n- [ ] Example [id:: code]\n```','    - [ ] Example [id:: code]','%%\n- [ ] Example [id:: hidden]\n%%','<!--\n- [ ] Example [id:: hidden]\n-->']){
    assert.deepEqual(projectDiaryProse(source),{markdown:source,tasks:[]});
  }
});
