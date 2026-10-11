const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/runtime/views/tasks-calendar/runtime-core.js'), 'utf8');
const start = source.indexOf('function getMetaFromNote(');
function fixture() {
  let reads = 0, page = { color: '#123456', textColor: ['#234567'], icon: { toArray: () => ['book'] } };
  const c = vm.createContext({ ctx: { page: () => { reads++; return page; } } });
  vm.runInContext(source.slice(start, source.indexOf('\nfunction ',start+10)),c);
  return { c, reads: () => reads, update: value => page = value };
}
test('a render pass reads each note once for all task colors and icons', () => {
  const f = fixture(), pages = new Map();
  for (let i=0;i<100;i++) {
    const task = { path: 'Project/list.md' };
    assert.equal(f.c.getMetaFromNote(task,'color',pages),'#123456');
    assert.equal(f.c.getMetaFromNote(task,'textColor',pages),'#234567');
    assert.equal(f.c.getMetaFromNote(task,'icon',pages),'book');
  }
  assert.equal(f.reads(),1);
});
test('the next render reads changed properties and missing notes do not leak across passes', () => {
  const f=fixture(),task={path:'Project/list.md'};
  assert.equal(f.c.getMetaFromNote(task,'color',new Map()),'#123456');
  f.update(null); const missing=new Map();
  assert.equal(f.c.getMetaFromNote(task,'color',missing),'');
  assert.equal(f.c.getMetaFromNote(task,'icon',missing),'');
  assert.equal(f.reads(),2);
  f.update({color:'#abcdef'});
  assert.equal(f.c.getMetaFromNote(task,'color',new Map()),'#abcdef');
  assert.equal(f.reads(),3);
});
