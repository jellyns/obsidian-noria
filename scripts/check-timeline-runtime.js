// Run through Obsidian CLI in an explicitly named isolated vault. See docs/TESTING.md.
// Host setup uses plugin APIs; user actions use Electron input, not onclick().
const fs = require('node:fs');
const path = require('node:path');
const {setTimeout: delay} = require('node:timers/promises');

module.exports = async function checkTimeline(app, options) {
  const vault = path.resolve(app.vault.adapter.basePath);
  if (!options?.vaultPath || vault.toLowerCase() !== path.resolve(options.vaultPath).toLowerCase() || app.vault.getName() !== 'NoriaTest') {
    throw Error('Use the explicitly configured NoriaTest vault only');
  }
  const relativeOutput = path.relative(vault, path.resolve(options.outputDir));
  if (!relativeOutput || relativeOutput.startsWith('..') || path.isAbsolute(relativeOutput) || relativeOutput.startsWith('.obsidian')) throw Error('Output must be inside the test vault, outside .obsidian');
  const p = app.plugins.plugins.noria;
  const v = app.workspace.getLeavesOfType('noria-task-timeline')[0]?.view;
  if (!p || !v?.timelineWorkspace?.stream) throw Error('Open the installed Noria Task Timeline first');
  const taskFolder = options.taskFolder || 'Noria/Projects';
  if (taskFolder.includes('..') || path.isAbsolute(taskFolder) || !app.vault.getAbstractFileByPath(taskFolder)?.children) throw Error('Use an existing managed task folder in NoriaTest');

  const run = 'timeline-' + Date.now(), dir = path.join(options.outputDir, run);
  fs.mkdirSync(dir, {recursive: true});
  const root = path.relative(vault, path.join(dir, 'fixtures')).replace(/\\/g, '/');
  const taskPath = taskFolder + '/' + run + '.md';
  const t = v.timelineWorkspace, el = v.containerEl, doc = el.ownerDocument;
  const win = doc.defaultView.require('@electron/remote').getCurrentWindow();
  const raw = await app.vault.adapter.read('.obsidian/plugins/noria/data.json');
  const saved = {settings: structuredClone(p.settings), state: v.getState(), calendar: p.getCalendarSettings,
    parent: el.parentElement, next: el.nextSibling, style: el.style.cssText, throttle: win.webContents.getBackgroundThrottling()};
  const report = {run, kind: 'installed-plugin native input smoke', status: 'running', steps: [], cleanupErrors: []};
  const created = [], sources = new Map();
  let phase = 'setup';
  const requireResult = (value, message) => {if (!value) throw Error(message);};
  const waitFor = async (label, predicate) => {
    const deadline = Date.now() + 8000;
    let stable = 0;
    while (Date.now() < deadline) {
      if (await predicate()) {if (++stable === 2) return;} else stable = 0;
      await delay(40);
    }
    throw Error('Timed out: ' + label);
  };
  const ready = () => t.vertical() && t.stream?.isConnected && !t.stream.hidden && !t.painting && !t.loading && t.stream.getAttribute('aria-busy') !== 'true';
  const step = async (name, action) => {phase = name; await action(); report.steps.push({name, pass: true});};
  const pointer = async find => {
    let element;
    win.focus();
    await waitFor('unobscured action target', () => {
      const current = find();
      if (!current?.isConnected || current.disabled) return false;
      if (current !== element) {element = current; element.scrollIntoView({block: 'center'});}
      const r = element.getBoundingClientRect();
      return element.contains(doc.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    });
    const r = element.getBoundingClientRect(), point = {x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2)};
    win.webContents.sendInputEvent({type: 'mouseDown', ...point, button: 'left', clickCount: 1});
    win.webContents.sendInputEvent({type: 'mouseUp', ...point, button: 'left', clickCount: 1});
  };
  const screenshot = async name => {
    const r = el.getBoundingClientRect();
    let timer;
    try {
      const capture = win.webContents.capturePage({x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height)});
      const timeout = new Promise((_, reject) => {timer = setTimeout(() => reject(Error('Screenshot timeout')), 8000);});
      fs.writeFileSync(path.join(dir, name + '.png'), (await Promise.race([capture, timeout])).toPNG());
    } finally {clearTimeout(timer);}
  };
  const today = p.getLocalYmd(), day = offset => {const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() + offset); return p.getLocalYmd(d);};
  const record = () => t.stream.querySelector('[data-kind="record"][data-date="' + today + '"]');
  const toggle = () => record()?.querySelector('.noria-tl-record-toggle');
  const task = () => t.stream.querySelector('[data-source-path="' + taskPath + '"][data-source-line="0"]');
  const checkbox = () => task()?.querySelector('input[type="checkbox"]');
  try {
    win.webContents.setBackgroundThrottling(false);
    win.moveTop(); win.focus();
    await app.vault.createFolder(root);
    // Two files are enough for this host smoke. Detailed diary paging belongs
    // to the fast reader tests; avoid indexing seventeen disposable notes here.
    const file = root + '/' + today + '.md';
    const source = '## Inbox\n- [08:10] ' + run + ' capture\n\n## ' + run + ' record\n\n' +
      Array.from({length: 25}, (_, i) => 'Paragraph ' + i + ': ' + run + ' isolated reading fixture.').join('\n\n') + '\n';
    await app.vault.create(file, source); created.push(file); sources.set(file, source);
    const neighbors = Array.from({length: 17}, (_, i) => i - 8).filter(offset => offset !== 0);
    const taskSource = '- [ ] ' + run + ' task [due:: ' + today + ']\n' +
      neighbors.map(offset => '- [ ] ' + run + ' neighbor [due:: ' + day(offset) + ']').join('\n') + '\n';
    await app.vault.create(taskPath, taskSource); created.push(taskPath);
    (await p.createDataService()).invalidate('timeline-smoke-setup', 'tasks');
    p.invalidateTaskSnapshots('tasks');
    p.getCalendarSettings = function() {return {...saved.calendar.call(this), calendarIntegrationMode: 'custom', calendarRootFolder: root, calendarCustomFilePattern: 'YYYY-MM-DD'};};
    p.settings.timelineView.orientation = 'vertical';
    p.settings.timelineView.verticalFilter = {tasks: true, records: true, showDone: true, ctime: false, mtime: false, query: run};
    await p.saveSettings(); p.syncRuntimeBridgeConfig();
    doc.body.append(el);
    el.style.cssText = 'position:fixed;left:20px;top:20px;width:430px;height:650px;z-index:100;background:var(--background-primary)';
    await v.refreshTimelineRuntimeFromChrome();
    await t.jumpToDate(day(-1));
    await waitFor('fixture index and view', () => ready() && checkbox());
    await step('Today locates today without clipping neighboring dates', async () => {
      await pointer(() => el.querySelector('[data-noria-action-kind="jump-today"]'));
      await waitFor('today anchor', () => ready() && t.captureAnchor()?.date === today);
      requireResult(t.stream.querySelector('[data-date="' + day(-1) + '"]'), 'Today removed neighboring entries');
    });
    await step('Scrolling upward loads earlier entries', async () => {
      const first = t.stream.querySelector('h3[data-date]').dataset.date;
      t.stream.scrollTop = 0;
      const r = t.stream.getBoundingClientRect();
      // Electron input uses positive wheel delta for upward movement.
      win.webContents.sendInputEvent({type: 'mouseWheel', x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), deltaX: 0, deltaY: 300});
      await waitFor('earlier source date', () => ready() && t.stream.querySelector('h3[data-date]').dataset.date < first);
    });
    await pointer(() => el.querySelector('[data-noria-action-kind="jump-today"]'));
    await waitFor('return to today', () => ready() && t.captureAnchor()?.date === today);
    await step('Pointer expansion and collapse preserve the source and visible preview', async () => {
      requireResult(toggle()?.getAttribute('aria-expanded') === 'false', 'Missing collapsed preview');
      await pointer(toggle);
      await waitFor('full record', () => toggle()?.getAttribute('aria-expanded') === 'true' && record().textContent.includes('Paragraph 24'));
      await pointer(toggle);
      await waitFor('collapsed preview', () => toggle()?.getAttribute('aria-expanded') === 'false' && !record().textContent.includes('Paragraph 24'));
      const r = record().getBoundingClientRect(), viewport = t.stream.getBoundingClientRect();
      requireResult(r.bottom > viewport.top && r.top < viewport.bottom, 'Collapsed preview is outside view');
      for (const [file, source] of sources) requireResult(await app.vault.adapter.read(file) === source, 'Read flow modified ' + file);
    });
    await step('Pointer completion writes Markdown and keyboard undo restores it', async () => {
      await pointer(checkbox);
      await waitFor('completed source and rendered state', async () => ready() && checkbox()?.checked && !checkbox().disabled && task().classList.contains('is-completed') && (await app.vault.adapter.read(taskPath)).startsWith('- [x]'));
      requireResult(doc.activeElement === checkbox(), 'Completion lost keyboard focus');
      win.webContents.sendInputEvent({type: 'keyDown', keyCode: 'Space'});
      win.webContents.sendInputEvent({type: 'keyUp', keyCode: 'Space'});
      await waitFor('keyboard undo source and rendered state', async () => ready() && !checkbox()?.checked && (await app.vault.adapter.read(taskPath)) === taskSource);
    });
    await screenshot('timeline');
    report.status = 'passed';
  } catch (error) {
    report.status = phase === 'setup' ? 'setup-failed' : 'failed';
    report.steps.push({name: phase, pass: false, error: error.stack || String(error)});
    report.diagnostics = {ready: ready(), checked: checkbox()?.checked, disabled: checkbox()?.disabled,
      focusedControl: doc.activeElement?.dataset?.tlFocus, windowFocused: win.isFocused(),
      fixtureText: app.vault.getAbstractFileByPath(taskPath) ? await app.vault.adapter.read(taskPath) : null};
    try {await screenshot('failure');} catch (e) {report.screenshotError = e.message;}
  } finally {
    const cleanup = async (name, action) => {try {await action();} catch (e) {report.cleanupErrors.push({name, error: e.message});}};
    p.getCalendarSettings = saved.calendar;
    await cleanup('fixture files', async () => {for (const file of created) {const f = app.vault.getAbstractFileByPath(file); if (f) await app.vault.delete(f);}});
    await cleanup('view', async () => {
      p.settings = structuredClone(saved.settings); p.syncRuntimeBridgeConfig();
      saved.parent.insertBefore(el, saved.next?.parentElement === saved.parent ? saved.next : null); el.style.cssText = saved.style;
      await v.refreshTimelineRuntimeFromChrome(); await v.setState(saved.state, {});
      t.backend.setWindow(saved.settings.timelineView.timeWindow); t.backend.flushWindow?.();
    });
    await cleanup('configuration', async () => {
      p.settings = structuredClone(saved.settings); await p.saveSettings();
      await app.vault.adapter.write('.obsidian/plugins/noria/data.json', raw);
      requireResult(await app.vault.adapter.read('.obsidian/plugins/noria/data.json') === raw, 'Configuration restoration mismatch');
    });
    await cleanup('window throttling', () => win.webContents.setBackgroundThrottling(saved.throttle));
    if (report.cleanupErrors.length) report.status = 'cleanup-failed';
    fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(report, null, 2));
  }
  return {...report, evidence: dir};
};
