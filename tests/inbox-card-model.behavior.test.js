const test = require('node:test');
const assert = require('node:assert/strict');
const { selectItems, actionCount, sectors, preview } = require('../src/inbox-card-model.js');

test('actor and action filters include unassigned notes in All; custom counts are actor-specific', () => {
  const items = [{work:''},{work:'我：阅读'},{work:'我：整理'},{work:'SI：整理'},{work:'SI：比较结论'}];
  assert.equal(selectItems(items).length, 5);
  assert.deepEqual(selectItems(items,'SI','整理'), [items[3]]);
  assert.equal(actionCount(items,'我','自定义'), 0);
  assert.equal(actionCount(items,'SI','自定义'), 1);
  assert.equal(actionCount(items,'SI','整理'), 1);
});
test('independent mirrored sectors share their bottom action baseline at narrow widths', () => {
  const left = sectors('我',320), right = sectors('SI',320);
  assert.equal(left.length,4); assert.equal(right.length,3);
  assert.equal(left.at(-1).y,300); assert.equal(right.at(-1).y,300);
  assert.equal(left.at(-1).x + right.at(-1).x,320);
  assert.ok(left.every(x=>x.x<94)); assert.ok(right.every(x=>x.x>226));
});
test('preview keeps source text readable without repeating metadata, code or the note title', () => {
  assert.equal(preview('---\ninbox-work: SI：整理\n---\n## 标题\n```\ncode\n```\n- [[方法|原方法]] 值得比较。','标题'),'原方法 值得比较。');
});
