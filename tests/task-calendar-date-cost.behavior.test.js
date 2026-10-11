const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/runtime/views/tasks-calendar/runtime-core.js'), 'utf8');
const doc = require('../src/task-document.js');
function load(c, name) {
  const start = source.indexOf('function ' + name + '(');
  if (start >= 0) vm.runInContext(source.slice(start, source.indexOf('\nfunction ', start + 10)), c);
}
function fixture() {
  let parses = 0;
  const c = vm.createContext({ moment() { parses++; throw Error('calendar date should not need general parsing'); } });
  for (const name of ['calendarIsoDay', 'coerceTemporalToYmd', 'taskDateSameDay', 'taskDateBeforeDay', 'taskDateAfterDay']) load(c, name);
  return { c, parses: () => parses };
}
test('canonical calendar days compare without repeatedly invoking the general date parser', () => {
  const { c, parses } = fixture();
  for (let i = 0; i < 100; i++) {
    assert.equal(c.taskDateSameDay('2028-02-29', '2028-02-29'), true);
    assert.equal(c.taskDateBeforeDay('2028-02-29', '2028-03-01'), true);
    assert.equal(c.taskDateAfterDay('2031-01-01', '2030-12-31'), true);
    assert.equal(c.taskDateBeforeDay('2031-01-01', '2031-01-01'), false);
  }
  assert.equal(parses(), 0);
});
test('impossible days and invalid query dates do not become valid comparisons', () => {
  const { c } = fixture();
  for (const day of ['2027-02-29', '2100-02-29', '2031-04-31', '2031-00-10', '2031-13-01']) {
    assert.equal(c.coerceTemporalToYmd(day), '');
    assert.equal(c.taskDateBeforeDay(day, '2032-01-01'), false);
    assert.equal(c.taskDateAfterDay('2032-01-01', day), false);
  }
  assert.equal(c.taskDateSameDay('2000-02-29', '2000-02-29'), true);
  assert.equal(c.taskDateSameDay('2031-01-01', '2031-01-01 08:00'), false);
});
test('noncanonical source values keep their existing date-library conversion', () => {
  const { c } = fixture();
  const calls = [];
  c.moment = (...args) => { calls.push(args); return { isValid: () => args.length === 1, format: () => '2031-01-02' }; };
  assert.equal(c.coerceTemporalToYmd('2031-01-01T20:00:00-05:00'), '2031-01-02');
  assert.equal(calls.length, 2);
});
test('validated arrangements use normalized dates and reflect later source edits without a cache', () => {
  const task = doc.parseTaskLine('- [ ] Read [schedule:: 2031-01-02T23:00 / 2031-01-03T07:00] [schedule:: 2031-01-05] [schedule:: bad]');
  const c = vm.createContext({ tasks: [task], parseDateTimeValue() { throw Error('already validated'); }, timeToMinutes: () => 1380 });
  load(c, 'getCalendarTaskEntries');
  let entries = c.getCalendarTaskEntries();
  assert.equal(entries.length, 2);
  assert.equal(entries[0].start, '2031-01-02'); assert.equal(entries[0].dueTime, '07:00');
  assert.equal(entries[1].scheduled, '2031-01-05');
  task.schedules = doc.parseTaskLine('- [ ] Read [schedule:: 2031-02-06]').schedules;
  entries = c.getCalendarTaskEntries();
  assert.equal(entries.length, 1); assert.equal(entries[0].scheduled, '2031-02-06');
});

test('ISO day validation does not allocate Date objects or parse timestamps', () => {
  const c = vm.createContext({ Date: class { constructor() { throw Error('unnecessary Date allocation'); } static parse() { throw Error('unnecessary timestamp parse'); } } });
  load(c, 'calendarIsoDay');
  for (const day of ['0000-01-01', '2000-02-29', '2028-02-29', '9999-12-31']) assert.equal(c.calendarIsoDay(day), day);
  for (const day of ['1900-02-29', '2031-04-31', '2031-13-01', '2031-01-00']) assert.equal(c.calendarIsoDay(day), '');
});

test('ISO day validation matches the Gregorian calendar over a full 400-year cycle', () => {
  const { c } = fixture();
  for (let year = 2000; year < 2400; year++) {
    for (let month = 1; month <= 12; month++) {
      for (let day = 28; day <= 32; day++) {
        const value = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const expected = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0,10) === value ? value : '';
        assert.equal(c.calendarIsoDay(value), expected, value);
      }
    }
  }
});
