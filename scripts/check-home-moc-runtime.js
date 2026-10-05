// Run through Obsidian eval in NoriaTest. Each stage leaves failures inspectable.
(async () => {
  if (app.vault.getName() !== "NoriaTest") throw Error("Use NoriaTest only");
  if (globalThis.__noriaMocChecks) throw Error("Resume the existing acceptance session");
  const fs = require("fs"), win = require("@electron/remote").getCurrentWindow();
  const q = { fs, win, root: "F:/NoriaTest/_acceptance-c-moc-20260915", checks: [], owned: new Map(),
    initial: globalThis.__noriaMocAcceptance, bounds: win.getBounds(), throttling: win.webContents.getBackgroundThrottling() };
  if (!q.initial) throw Error("Missing pre-change snapshot");
  globalThis.__noriaMocChecks = q;
  Object.defineProperty(q, "p", { get: () => app.plugins.plugins.noria });
  q.wait = async (fn, label = "view") => {
    const until = Date.now() + 10000;
    while (Date.now() < until) { if (await fn()) return; await new Promise(r => setTimeout(r, 40)); }
    throw Error("Timed out: " + label);
  };
  q.check = (name, ok) => {
    q.checks.push({ name, ok: !!ok });
    fs.writeFileSync(q.root + "/runtime-results.json", JSON.stringify(q.checks, null, 2));
    if (!ok) throw Error(name);
  };
  q.flush = async () => { await q.p._mocSettingsWrite; await new Promise(r => setTimeout(r, 400)); };
  q.home = async () => {
    q.leaf = app.workspace.getLeavesOfType("noria-dashboard-home")[0];
    await app.workspace.revealLeaf(q.leaf); app.workspace.setActiveLeaf(q.leaf, { focus: true });
    await q.wait(() => q.leaf.view.containerEl.querySelector(".dashboard-moc-grid"));
    return q.leaf.view.containerEl;
  };
  q.host = () => q.leaf.view.containerEl;
  q.link = path => [...q.host().querySelectorAll(".dashboard-moc-chip")].find(el => el.dataset.href === path);
  q.leaves = path => { const out = []; app.workspace.iterateAllLeaves(l => { if (["markdown", "canvas"].includes(l.view?.getViewType()) && l.view.file?.path === path) out.push(l); }); return out; };
  q.seed = async (path, text) => {
    const file = app.vault.getAbstractFileByPath(path);
    if (file) { if (await app.vault.read(file) !== text) throw Error("Fixture differs: " + path); }
    else { await q.p.ensureVaultParent(path); await app.vault.create(path, text); }
    q.owned.set(path, text); fs.writeFileSync(q.root + "/fixtures.json", JSON.stringify([...q.owned], null, 2));
  };
  q.pick = async query => {
    await q.wait(() => document.querySelector(".prompt-input"), "native picker");
    const input = document.querySelector(".prompt-input"); input.value = query; input.dispatchEvent(new Event("input", { bubbles: true }));
    await q.wait(() => [...document.querySelectorAll(".suggestion-item")].some(el => el.textContent.includes(query)), "picker match");
    [...document.querySelectorAll(".suggestion-item")].find(el => el.textContent.includes(query)).click();
    await q.wait(() => !document.querySelector(".prompt-input"), "picker closes"); await q.flush();
  };
  q.menu = async () => {
    await q.home(); const button = q.host().querySelector('[data-noria-widget-id="moc-strip"][data-noria-widget-shell-action="menu"]');
    if (!button) throw Error("Missing shared MOC menu"); button.click();
    await q.wait(() => document.querySelector(".menu")); return document.querySelector(".menu");
  };
  q.manager = async () => {
    const menu = await q.menu(); [...menu.querySelectorAll(".menu-item")].find(el => el.textContent.includes(q.p.t("runtime.home.moc.managerTitle"))).click();
    await q.wait(() => [...document.querySelectorAll("button")].some(el => el.textContent === q.p.t("runtime.common.save")));
    q.panel = [...document.querySelectorAll("button")].find(el => el.textContent === q.p.t("runtime.common.save")).parentElement.parentElement;
    return q.panel;
  };
  q.closeManager = () => [...q.panel.querySelectorAll("button")].find(el => el.textContent === q.p.t("runtime.common.cancel")).click();
  q.originalPath = q.initial.folder + "/Original·MOC.md";
  q.canvasPath = q.initial.folder + "/Original·MOC.canvas";
  await q.seed(q.originalPath, "## Reference\n\nMOC acceptance fixture.\n");
  await q.seed(q.canvasPath, '{"nodes":[],"edges":[]}');
  win.webContents.setBackgroundThrottling(false);
  q.add = async () => {
    await q.home(); let result; const original = q.p.pickMocEntry;
    q.p.pickMocEntry = function (...args) { const pending = original.apply(this, args); pending.then(r => { result = r; }); return pending; };
    try {
      q.host().querySelector('.dashboard-moc-strip__toolbar button').click(); await q.pick("Original·MOC.md");
      q.check("Quick add finds an existing MOC outside the task and diary roots", q.p.getMocEntriesForDashboard().some(e => e.path === q.originalPath));
      q.check("Native picker selection resolves as saved", result?.ok === true && !result.cancelled);
      await q.home(); q.host().querySelector('.dashboard-moc-strip__toolbar button').click(); await q.pick("Original·MOC.md");
      q.check("Adding an existing entry does not duplicate it", q.p.getMocEntriesForDashboard().filter(e => e.path === q.originalPath).length === 1);
      await q.home(); q.check("MOC and project icons use the native SVGs", !!q.host().querySelector('.dashboard-moc-strip__lead-icon svg') && !!q.host().querySelector('.noria-project-source svg'));
    } finally { q.p.pickMocEntry = original; }
    return { passed: q.checks.length };
  };
  q.navigation = async () => {
    await q.home(); await q.link(q.originalPath).onclick(new MouseEvent("click"));
    q.check("MOC opens the source in a separate tab and keeps Home", app.workspace.activeLeaf.view.file?.path === q.originalPath && q.leaves(q.originalPath).length === 1 && app.workspace.getLeavesOfType("noria-dashboard-home").length === 1);
    const id = app.workspace.activeLeaf.id; await q.home(); await q.link(q.originalPath).onclick(new MouseEvent("click"));
    q.check("Repeated source lookup reuses its open tab", app.workspace.activeLeaf.id === id && q.leaves(q.originalPath).length === 1);
    await q.home(); let visual = q.link(q.originalPath).parentElement.querySelector('[data-noria-moc-role="visual"]');
    await visual.onclick(new MouseEvent("click"));
    q.check("Canvas icon opens the actual paired Canvas", app.workspace.activeLeaf.view.getViewType() === "canvas" && app.workspace.activeLeaf.view.file?.path === q.canvasPath);
    const canvasId = app.workspace.activeLeaf.id; await q.home(); visual = q.link(q.originalPath).parentElement.querySelector('[data-noria-moc-role="visual"]'); await visual.onclick(new MouseEvent("click"));
    q.check("Repeated Canvas lookup reuses its tab", app.workspace.activeLeaf.id === canvasId && q.leaves(q.canvasPath).length === 1);
    await q.home(); await q.link(q.originalPath).onauxclick(new MouseEvent("auxclick", { button: 1 }));
    q.check("Middle click requests an additional source tab", q.leaves(q.originalPath).length === 2);
    app.workspace.activeLeaf.detach(); await q.home();
    const before = q.leaf.parent; await q.link(q.originalPath).onclick(new MouseEvent("click", { ctrlKey: true, altKey: true }));
    q.check("Native modifier opens a split", app.workspace.activeLeaf.parent !== before && app.workspace.activeLeaf.view.file?.path === q.originalPath);
    app.workspace.activeLeaf.detach(); await q.home();
    const headingPath = q.initial.folder + "/Heading targets.md";
    await q.seed(headingPath, "## Opening\n\nStart here.\n\n## Reference\n\nFind this section.\n");
    await q.wait(() => app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(headingPath))?.headings?.length === 2);
    await q.p.openHomeSource(headingPath + "#Reference", { event: new MouseEvent("click") });
    await q.wait(() => app.workspace.activeLeaf.view.editor?.getCursor().line === 4, "heading location");
    q.check("Heading links retain native location state", app.workspace.activeLeaf.view.editor.getCursor().line === 4 && app.workspace.activeLeaf.view.file?.path === headingPath);
    await q.home(); const selected = q.host().querySelector('.dashboard-project-chip[aria-pressed="true"]');
    const input = q.host().querySelector('.dashboard-project-next-input'), initialInput = input.value; input.value = "Unsubmitted next-step acceptance draft"; input.dispatchEvent(new Event("input", { bubbles: true }));
    q.projectBefore = { selected: selected?.textContent, input: input.value };
    const source = q.host().querySelector('.noria-project-source'); await source.onclick(new MouseEvent("click"));
    q.check("Project source opens a real main note", app.workspace.activeLeaf.view.getViewType() === "markdown");
    await q.home(); q.check("Source lookup preserves selected project and unsubmitted input", q.host().querySelector('.dashboard-project-chip[aria-pressed="true"]')?.textContent === q.projectBefore.selected && q.host().querySelector('.dashboard-project-next-input').value === q.projectBefore.input);
    const restoreInput = q.host().querySelector('.dashboard-project-next-input'); restoreInput.value = initialInput; restoreInput.dispatchEvent(new Event("input", { bubbles: true }));
    return { passed: q.checks.length };
  };
  q.renameAndManager = async () => {
    await q.home(); const original = q.p.getMocEntriesForDashboard(); await q.manager();
    const input = q.panel.querySelector('input[type="text"]'); const oldDraft = input.value; input.value = oldDraft + "-draft"; input.dispatchEvent(new Event("input", { bubbles: true })); q.closeManager();
    q.check("Canceling the existing full manager does not write changes", JSON.stringify(q.p.getMocEntriesForDashboard()) === JSON.stringify(original));
    const file = app.vault.getAbstractFileByPath(q.originalPath), renamed = q.initial.folder + "/Renamed·MOC.md";
    await q.manager(); const draftInput = q.panel.querySelector('input[type="text"]'); draftInput.value = oldDraft + "-draft"; draftInput.dispatchEvent(new Event("input", { bubbles: true }));
    await app.vault.rename(file, renamed); await q.flush();
    q.check("Vault file rename updates the saved MOC path", q.p.getMocEntriesForDashboard().some(e => e.path === renamed) && !q.p.getMocEntriesForDashboard().some(e => e.path === q.originalPath));
    [...q.panel.querySelectorAll("button")].find(el => el.textContent === q.p.t("runtime.common.save")).click(); await new Promise(r => setTimeout(r, 150));
    q.check("Stale manager keeps its draft without undoing the rename", q.panel.isConnected && draftInput.value.endsWith("-draft") && q.p.getMocEntriesForDashboard().some(e => e.path === renamed)); q.closeManager();
    await app.vault.rename(file, q.originalPath); await q.flush();
    const folder = app.vault.getAbstractFileByPath(q.initial.folder), moved = q.initial.folder + " moved";
    await app.vault.rename(folder, moved); await q.flush();
    q.check("Folder rename follows its MOC descendants", q.p.getMocEntriesForDashboard().some(e => e.path === moved + "/Original·MOC.md"));
    await app.vault.rename(folder, q.initial.folder); await q.flush();
    await q.home(); q.check("Paired Canvas remains available after a folder rename", !!q.link(q.originalPath).parentElement.querySelector('[data-noria-moc-role="visual"]'));
    const missing = q.initial.folder + "/Missing.md";
    await q.p.updateMocEntries(entries => [...entries, { path: missing, color: "#f59e0b" }]); await q.flush(); await q.home();
    const pending = q.link(missing).onclick(new MouseEvent("click")); await q.pick("Original·MOC.canvas"); await pending;
    q.check("Missing entry can select a replacement without creating a note", !app.vault.getAbstractFileByPath(missing) && !q.p.getMocEntriesForDashboard().some(e => e.path === missing) && q.p.getMocEntriesForDashboard().some(e => e.path === q.canvasPath && e.color === "#f59e0b"));
    await q.p.setMocEntries(original); await q.flush();
    return { passed: q.checks.length };
  };
  return { ready: true, entries: q.p.getMocEntriesForDashboard().length };
})()
