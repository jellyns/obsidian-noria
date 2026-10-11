const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/runtime/views/tasks-calendar/runtime-core.js'), 'utf8');
function fixture() {
  let pathReads = 0;
  const tasks = Array.from({ length: 300 }, (_, line) => ({ line, text: 'task ' + line, get path() { pathReads++; return 'Project/list.md'; } }));
  const rows = tasks.map((_, line) => ({ line }));
  const root = { querySelectorAll: () => rows };
  const seen = [];
  const c = vm.createContext({
    tasks, normalizeVaultRelPath: p => p.replaceAll('\\', '/'),
    collectTaskMeta: row => ({ filePath: 'Project/list.md', lineIndex: row.line }),
    isMonthTaskRowElement: el => el !== root, tcInferTypeClsFromCalItemEl: () => '',
    normalizeMonthTaskRowDom: (el, task) => seen.push(task)
  });
  for (const name of ['taskLineMetaMatches', 'taskCalendarRowLocation', 'buildCalendarTaskRowIndex', 'findTaskRowForSaveMeta', 'tcTaskRowFromCalItemEl', 'normalizeMonthTaskRows']) {
    const start = source.indexOf('function ' + name + '(');
    if (start >= 0) vm.runInContext(source.slice(start, source.indexOf('\nfunction ', start + 10)), c);
  }
  return { c, tasks, rows, seen, reads: () => pathReads, run: () => c.normalizeMonthTaskRows(root) };
}
test('normalizing many rows resolves each source without rescanning all source paths per row', () => {
  const f = fixture(); f.run();
  assert.deepEqual(f.seen, f.tasks);
  assert.ok(f.reads() <= f.tasks.length * 4, `source path reads: ${f.reads()}`);
});
test('each normalization sees the current source and duplicate locations keep existing first-match behavior', () => {
  const f = fixture(); f.run(); f.seen.length = 0;
  const replacement = { path: 'Project/list.md', line: 4, text: 'updated' };
  f.c.tasks = f.tasks.map((t, i) => i === 4 ? replacement : t);
  f.c.tasks.push({ path: 'Project/list.md', line: 4, text: 'duplicate' });
  f.run(); assert.equal(f.seen[4], replacement);
});
