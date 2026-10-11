const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/runtime/views/tasks-calendar/runtime-core.js'), 'utf8');

test('month span layout reads every week style before changing reserves in any week', () => {
  const weeks = [{ id: 1 }, { id: 2 }, { id: 3 }], events = [];
  const c = vm.createContext({
    rootNode: { getAttribute: () => 'month' },
    getMonthSpanMetrics: w => { events.push('read:' + w.id); return { barHeight: 16 + w.id }; },
    collectMonthSpanSegments: w => ({ cells: [w], segments: [], oldBars: [] }),
    refreshMonthSpanOverlayInPlace: (w, bars, cells, metrics) => {
      assert.equal(metrics.barHeight, 16 + w.id); events.push('write:' + w.id);
    }
  });
  const start = source.indexOf('function syncMonthSpanOverlay(');
  vm.runInContext(source.slice(start, source.indexOf('\nvar tcMonthLayoutRo', start)), c);
  c.syncMonthSpanOverlay({ querySelectorAll: () => weeks });
  assert.deepEqual(events, ['read:1', 'read:2', 'read:3', 'write:1', 'write:2', 'write:3']);
});
