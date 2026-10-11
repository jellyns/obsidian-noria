"use strict";
const { Notice, Scope, Menu, setIcon } = require("obsidian");
const { FIELD, parseWork, updateWork } = require("./inbox-work.js");
const { ACTIONS, selectItems, actionCount, sectors, preview } = require("./inbox-card-model.js");
const { createInboxReader } = require("./inbox-reading.js");
const { loadEntries, assignEntry, editEntry, appendEntry, moveWithEntry, undoWithEntry } = require("./inbox-entries.js");

async function renderInboxCard(plugin, host, { actionsHost } = {}) {
  host.__noriaInboxCleanup?.();
  host.empty();
  const app = plugin.app, doc = host.ownerDocument, win = doc.defaultView;
  const zh = plugin.getNoriaLocale() === "zh", t = (cn, en) => zh ? cn : en;
  const labels = { "阅读": "Read", "整理": "Organize", "提炼": "Distill", "自定义": "Custom" };
  const word = value => zh ? value : labels[value] || value;
  const actorName = actor => actor === "我" ? t("我", "Me") : actor;
  const rootPath = plugin.getManagedPath("inboxRoot").replace(/\/+$/, "") + "/";
  const card = host.closest(".dashboard-guide-inbox") || host;
  const viewport = card.closest(".dashboard-home-widget-native-content");
  card.classList.add("noria-inbox-card");
  const abort = new win.AbortController(), options = { signal: abort.signal };
  const on = (el, event, fn) => el.addEventListener(event, fn, options);
  let disposed = false, actorFilter = "", actionFilter = "", limit = 10, active = null, press = null;
  let items = [], ignoreClick = 0, busy = false, undo = null, scope = null, lastHit = null;
  let entries = [], storeFile = null, refreshVersion = 0, readingEntry = null, showStore = false, loadError = "";
  const rows = new Map();
  const reader = createInboxReader(plugin, host);
  function syncReading() {
    const path = reader.currentPath();
    for (const [key, row] of rows) {
      if (key === path || (row.item.entry && row.item.sourcePath === path && row.item.entry.line === readingEntry)) row.title.setAttribute("aria-current", "true");
      else row.title.removeAttribute("aria-current");
    }
  }
  const button = (parent, text, cls, run) => {
    const el = parent.createEl("button", { text, cls, type: "button" });
    el.type = "button";
    if (run) on(el, "click", run);
    return el;
  };
  const tools = (actionsHost || host).createDiv({ cls: "noria-inbox-filters" });
  if (actionsHost) actionsHost.prepend(tools);
  const actors = tools.createDiv({ cls: "noria-inbox-actors", attr: { role: "group", "aria-label": t("处理者", "Assigned to") } });
  for (const actor of ["", "我", "SI"]) {
    const control = button(actors, actor ? actorName(actor) : t("全部", "All"), "noria-inbox-filter", () => {
      actorFilter = actor; limit = 10; renderList(true);
    });
    control.dataset.actorFilter = actor;
  }
  let actionMenu = null;
  const actionSelect = button(tools, "", "clickable-icon noria-inbox-action-filter", () => {
    actionMenu?.hide();
    const menu = actionMenu = new Menu();
    const values = [...new Set([...items.map(item => parseWork(item.work).action).filter(Boolean), ...(actionFilter ? [actionFilter] : [])])];
    for (const value of ["", ...values]) menu.addItem(item => item.setTitle(value ? word(value) : t("全部", "All")).setChecked(value === actionFilter).onClick(() => {
      actionFilter = value; limit = 10; renderList(true);
    }));
    actionSelect.setAttribute("aria-expanded", "true");
    menu.onHide(() => { actionSelect.setAttribute("aria-expanded", "false"); actionMenu = null; actionSelect.focus({preventScroll:true}); });
    const rect = actionSelect.getBoundingClientRect(); menu.showAtPosition({x:rect.left,y:rect.bottom});
  });
  setIcon(actionSelect, "filter"); actionSelect.setAttribute("aria-haspopup", "menu");
  const list = host.createDiv({ cls: "noria-inbox-list" });
  let position = { top: 0, anchors: [] }, restorePending = false;
  function rememberPosition() {
    if (!list.clientHeight || restorePending) return;
    const top = list.getBoundingClientRect().top;
    position = { top: list.scrollTop, anchors: [...rows].map(([path, { row }]) => ({ path, offset: row.getBoundingClientRect().top - top, bottom: row.getBoundingClientRect().bottom - top })).filter(row => row.bottom > 0) };
  }
  function restorePosition() {
    if (!list.clientHeight) { restorePending = true; return; }
    list.scrollTop = position.top;
    const anchor = position.anchors.find(row => rows.has(row.path));
    if (anchor) list.scrollTop += rows.get(anchor.path).row.getBoundingClientRect().top - list.getBoundingClientRect().top - anchor.offset;
    restorePending = false; rememberPosition();
  }
  on(list, "scroll", rememberPosition);
  const form = host.createDiv({ cls: "noria-inbox-form" }); form.hidden = true;
  const notice = host.createDiv({ cls: "noria-inbox-receipt", attr: { role: "status", "aria-live": "polite" } }); notice.hidden = true;
  const layer = card.createDiv({ cls: "noria-inbox-layer", attr: { role: "dialog", "aria-label": t("安排处理", "Assign work"), "aria-modal": "true" } }); layer.hidden = true;
  const wheel = layer.createDiv({ cls: "noria-inbox-wheel" });

  function collect() {
    const previous = new Map(items.map(item => [item.path, item]));
    items = plugin.filesUnderRoots([rootPath], [".md"]).filter(file => file !== storeFile || showStore).map(file => ({
      path: file.path, name: file.basename, mtime: file.stat.mtime,
      work: parseWork(app.metadataCache.getFileCache(file)?.frontmatter?.[FIELD]).value,
      preview: previous.get(file.path)?.preview ?? null
    })).concat(entries.map(entry => ({
      path: storeFile.path+"#"+entry.line, sourcePath: storeFile.path, entry,
      name: entry.name, work: entry.work, mtime: storeFile.stat.mtime,
      preview: preview(entry.raw.replace(/\[inbox-work::[^\]]*\]/g,"").replace(/^[-*+] /,""), entry.name.replace(/[`*_~]/g,""))
    }))).sort((a, b) => b.mtime - a.mtime || a.path.localeCompare(b.path));
  }
  async function refreshEntries() {
    const version = ++refreshVersion;
    try {
      const result = await loadEntries(plugin);
      if (disposed || version !== refreshVersion) return;
      storeFile = result.file; entries = result.entries; showStore = result.showFile; loadError = "";
    } catch (error) {
      if (disposed || version !== refreshVersion) return;
      entries = []; storeFile = null;
      if (error.message !== loadError) new Notice(error.message);
      loadError = error.message;
    }
    collect(); renderList();
  }
  function workLabel(work) {
    const parsed = parseWork(work);
    return parsed.actor ? `${actorName(parsed.actor)} · ${word(parsed.action)}` : parsed.value;
  }
  function updateRow(item) {
    const row = rows.get(item.path); if (!row) return;
    row.marker.hidden = !item.work;
    row.marker.textContent = workLabel(item.work);
    row.marker.title = workLabel(item.work);
    row.marker.dataset.inboxWork = item.work;
    row.excerpt.textContent = item.preview || "";
    row.excerpt.hidden = !item.preview;
  }
  function syncFilters() {
    actors.querySelectorAll("button").forEach(el => el.setAttribute("aria-pressed", String(el.dataset.actorFilter === actorFilter)));
    const label = t("筛选动作", "Filter actions") + " · " + (actionFilter ? word(actionFilter) : t("全部", "All"));
    actionSelect.title = label; actionSelect.setAttribute("aria-label", label);
    actionSelect.setAttribute("aria-pressed", String(!!actionFilter));
  }
  async function fillPreviews(visible) {
    const pending = visible.filter(item => item.preview === null);
    await Promise.all(Array.from({ length: Math.min(6, pending.length) }, async () => {
      while (pending.length && !disposed) {
        const item = pending.shift(), file = app.vault.getAbstractFileByPath(item.path);
        if (!file) continue;
        try { const text = await app.vault.cachedRead(file); if (item.preview === null) item.preview = preview(text, item.name); updateRow(item); }
        catch (_) { /* The title remains usable when a source cannot be previewed. */ }
      }
    }));
  }
  function renderList(resetPosition = false) {
    rememberPosition();
    if (resetPosition) position = { top: 0, anchors: [] };
    const focusedPath = doc.activeElement?.closest("[data-inbox-path]")?.dataset.inboxPath;
    list.empty(); rows.clear(); syncFilters();
    const matches = selectItems(items, actorFilter, actionFilter), visible = matches.slice(0, limit);
    if (!matches.length) list.createDiv({ cls: "noria-inbox-empty", text: t("这里暂时没有内容。", "Nothing here yet.") });
    for (const item of visible) {
      const row = list.createDiv({ cls: "noria-inbox-item", attr: { "data-inbox-path": item.path } });
      const title = button(row, "", "noria-inbox-title", event => {
        if (Date.now() < ignoreClick || active || busy) return;
        void openSource(item, event);
      });
      title.setAttribute("aria-label", t(`打开${item.name}，按住可安排处理`, `Open ${item.name}; hold to assign work`));
      title.createEl("span", { text: item.name, cls: "noria-inbox-name" });
      const excerpt = title.createEl("span", { cls: "noria-inbox-excerpt" });
      const marker = button(row, "", "noria-inbox-mark", () => { if (Date.now() >= ignoreClick) showWheel(item, true); });
      marker.setAttribute("aria-label", t(`安排${item.name}`, `Assign ${item.name}`));
      marker.setAttribute("aria-haspopup", "dialog");
      on(title, "keydown", event => {
        if (["ArrowUp", "ArrowDown"].includes(event.key) && !event.altKey && !event.ctrlKey && !event.metaKey && !active) {
          event.preventDefault();
          const paths = [...rows.keys()], index = paths.indexOf(item.path);
          const next = rows.get(paths[index + (event.key === "ArrowDown" ? 1 : -1)]);
          if (next) { next.title.focus({ preventScroll: true }); next.row.scrollIntoView({ block: "nearest" }); next.title.click(); }
          return;
        }
        if ((event.altKey && event.key === "Enter") || event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
          event.preventDefault(); showWheel(item, true);
        }
      });
      on(title, "contextmenu", event => { event.preventDefault(); showWheel(item, true); });
      rows.set(item.path, { row, title, marker, excerpt, item }); updateRow(item);
    }
    if (matches.length > limit) button(list, t(`再显示 ${Math.min(20, matches.length - limit)} 项`, "Show more"), "noria-inbox-more", () => { limit += 20; renderList(); });
    void fillPreviews(visible);
    syncReading();
    restorePosition();
    if (focusedPath) rows.get(focusedPath)?.title.focus({ preventScroll: true });
  }
  async function openSource(item, event) {
    try {
      rememberPosition();
      readingEntry = item.entry?.line ?? null;
      const result = await reader.open(item.sourcePath || item.path, event, item.entry ? { line: item.entry.line } : {});
      if (result?.cancelled || disposed) return;
      if (result?.ok === false) throw Error(t("笔记已移动或不存在。", "The note was moved or is missing."));
      syncReading();
    } catch (error) { new Notice(error.message); }
  }
  function closeWheel(focus = true) {
    const item = active?.item; active = null; lastHit = null; layer.hidden = true;
    card.classList.remove("is-inbox-choosing");
    if (scope) { app.keymap.popScope(scope); scope = null; }
    if (focus && item) rows.get(item.path)?.title.focus({ preventScroll: true });
  }
  function showWheel(item, keyboard = false) {
    if (busy) return;
    if (active) closeWheel(false);
    form.hidden = true; active = { item, expected: item.work };
    card.classList.add("is-inbox-choosing"); layer.hidden = false;
    paintWheel();
    scope = new Scope(app.scope); scope.register([], "Escape", () => { closeWheel(); return false; }); app.keymap.pushScope(scope);
    if (keyboard) wheel.querySelector("[data-actor]")?.focus();
  }
  function paintWheel() {
    if (!active) return;
    const rect = card.getBoundingClientRect(), visible = viewport?.getBoundingClientRect() || rect;
    const top = Math.max(rect.top, visible.top), bottom = Math.min(rect.bottom, visible.bottom);
    layer.style.top = `${Math.max(0, top - rect.top)}px`;
    layer.style.height = `${Math.max(0, bottom - top - 2)}px`;
    const width = layer.clientWidth, height = Math.min(390, layer.clientHeight - 16);
    wheel.style.height = `${height}px`;
    wheel.style.top = `${(layer.clientHeight - height) / 2}px`;
    wheel.style.setProperty("--inbox-exit-y", `${height * 300 / 390 - 22}px`);
    wheel.empty();
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("noria-inbox-flow"); svg.setAttribute("viewBox", `0 0 ${width} ${height}`); svg.setAttribute("aria-hidden", "true");
    for (const tag of ["path", "circle"]) svg.appendChild(doc.createElementNS(svg.namespaceURI, tag));
    svg.querySelector("path").setAttribute("pathLength", "1"); svg.querySelector("circle").setAttribute("r", "3"); svg.style.display = "none";
    wheel.appendChild(svg);
    for (const actor of ["我", "SI"]) for (const sector of sectors(actor, width, height)) {
      const count = actionCount(items, actor, sector.action);
      const control = button(wheel, "", "noria-inbox-sector", () => { if (Date.now() >= ignoreClick) void choose(actor, sector.action); });
      control.dataset.actor = actor; control.dataset.action = sector.action;
      control.dataset.endX = sector.endX; control.dataset.endY = sector.y;
      control.style.clipPath = sector.polygon;
      control.setAttribute("aria-label", `${actorName(actor)} · ${word(sector.action)} · ${count}`);
      const label = control.createEl("span", { cls: "noria-inbox-sector-label" }); label.style.left = `${sector.x}px`; label.style.top = `${sector.y}px`;
      label.createEl("span", { text: word(sector.action) }); label.createEl("small", { text: String(count), cls: "noria-inbox-count" });
    }
    const owners = wheel.createDiv({ cls: "noria-inbox-owners" }); owners.createEl("span", { text: actorName("我") }); owners.createEl("span", { text: "SI" });
    const center = wheel.createDiv({ cls: "noria-inbox-center" });
    center.createDiv({ text: active.item.name, cls: "noria-inbox-origin" });
    button(wheel, t("取消", "Cancel"), "noria-inbox-cancel", () => closeWheel());
    const exit = button(wheel, active.item.entry ? t("完成", "Done") : t("移出 Inbox", "Move out"), "noria-inbox-exit", () => { if (Date.now() >= ignoreClick) moveForm(); }); exit.dataset.exit = "true";
  }
  function targetAt(x, y) {
    const hit = doc.elementFromPoint(x, y)?.closest(".noria-inbox-sector,.noria-inbox-exit");
    return hit && wheel.contains(hit) ? hit : null;
  }
  function connect(hit, x, y) {
    if (!active) return;
    wheel.querySelectorAll(".noria-inbox-sector,.noria-inbox-exit").forEach(el => el.classList.toggle("is-hot", el === hit));
    const svg = wheel.querySelector("svg"), r = wheel.getBoundingClientRect(), origin = wheel.querySelector(".noria-inbox-origin").getBoundingClientRect();
    if (!hit && x == null) { svg.style.display = "none"; lastHit = null; return; }
    svg.style.display = "";
    const exit = hit?.dataset.exit, ex = hit ? (exit ? r.width / 2 : +hit.dataset.endX) : x - r.left;
    const ey = hit ? (exit ? hit.getBoundingClientRect().top - r.top - 4 : +hit.dataset.endY) : y - r.top;
    const sx = exit ? origin.left + origin.width / 2 - r.left : (ex < r.width / 2 ? origin.left - r.left : origin.right - r.left);
    const sy = exit ? origin.bottom - r.top : origin.top + origin.height / 2 - r.top;
    svg.querySelector("path").setAttribute("d", exit ? `M ${sx} ${sy} C ${sx} ${sy + 48},${ex} ${ey - 48},${ex} ${ey}` : `M ${sx} ${sy} C ${sx + (ex-sx)*.48} ${sy},${sx+(ex-sx)*.65} ${ey},${ex} ${ey}`);
    svg.querySelector("circle").setAttribute("cx", ex); svg.querySelector("circle").setAttribute("cy", ey);
    if (hit !== lastHit) { svg.classList.remove("is-new"); void svg.getBoundingClientRect(); svg.classList.add("is-new"); lastHit = hit; }
  }
  function showReceipt(message, undoAction, path) {
    notice.empty(); notice.hidden = false; undo = undoAction;
    notice.createEl("span", { text: message });
    if (path) button(notice, t("查看笔记", "Open note"), "", () => void openSource({ path }));
    if (undo) button(notice, t("撤销", "Undo"), "", async event => {
      if (busy) return; busy = true; const control = event.currentTarget; control.disabled = true;
      try { await undo(); undo = null; notice.hidden = true; await refreshEntries(); }
      catch (error) { new Notice(error.message); control.disabled = false; }
      finally { busy = false; }
    });
  }
  async function save(item, expected, value) {
    if (busy) return false;
    if (value === expected) { closeWheel(); return true; }
    busy = true; layer.setAttribute("aria-busy", "true");
    try {
      const file = item.entry && app.vault.getAbstractFileByPath(item.sourcePath);
      const updated = item.entry && await editEntry(plugin, file, item.entry, assignEntry(item.entry, value));
      const result = item.entry ? { ok: true, work: updated.work, previousWork: expected }
        : await updateWork(plugin, { path: item.path, currentWork: expected, work: value });
      if (!result.ok) throw Error(result.reason === "conflict" ? t("安排已变化，请重新选择。", "Assignment changed. Choose again.") : t("笔记已移动，请重新打开。", "The note moved. Reopen it."));
      item.work = result.work; closeWheel(false); form.hidden = true; await refreshEntries();
      showReceipt(workLabel(result.work) || t("已清除安排", "Assignment cleared"), async () => {
        if (item.entry) { await editEntry(plugin, file, updated, item.entry.raw); return; }
        const restored = await updateWork(plugin, { path: item.path, currentWork: result.work, work: result.previousWork });
        if (!restored.ok) throw Error(t("安排已被修改，未覆盖新内容。", "Assignment changed; it was not overwritten."));
      });
      rows.get(item.path)?.title.focus({ preventScroll: true }); return true;
    } catch (error) { new Notice(error.message); return false; }
    finally { busy = false; layer.removeAttribute("aria-busy"); }
  }
  async function choose(actor, action) {
    if (!active || busy) return;
    const { item, expected } = active;
    if (action !== "自定义") return save(item, expected, `${actor}：${action}`);
    closeWheel(false); form.empty(); form.hidden = false;
    const editor = form.createEl("form");
    editor.createEl("label", { text: actorName(actor), cls: "noria-inbox-custom-owner" });
    const input = editor.createEl("input", { type: "text", attr: { "aria-label": t("处理内容", "Action"), placeholder: t("要做什么", "Action"), required: "" } });
    input.value = parseWork(item.work).action;
    const controls = editor.createDiv({ cls: "noria-inbox-form-actions" });
    button(controls, t("取消", "Cancel"), "", () => { form.hidden = true; rows.get(item.path)?.title.focus(); });
    if (item.work) button(controls, t("清除安排", "Clear assignment"), "", () => void save(item, expected, ""));
    const submit = button(controls, t("保存", "Save"), "mod-cta"); submit.type = "submit";
    on(editor, "submit", async event => { event.preventDefault(); if (!input.value.trim()) return; submit.disabled = true; await save(item, expected, `${actor}：${input.value.trim()}`); submit.disabled = false; });
    input.focus(); input.select();
  }
  function moveForm() {
    if (!active || busy) return;
    const item = active.item;
    if (item.entry) { void finishEntry(item); return; }
    closeWheel(false); form.empty(); form.hidden = false;
    const editor = form.createEl("form"); editor.createEl("label", { text: t(`将“${item.name}”移到`, `Move “${item.name}” to`) });
    const select = editor.createEl("select", { attr: { "aria-label": t("目标目录", "Destination folder"), required: "" } });
    select.createEl("option", { text: t("选择目录", "Choose folder") }).value = "";
    const folders = app.vault.getAllLoadedFiles().filter(file => Array.isArray(file.children) && file.path !== "/" && !file.path.startsWith(rootPath) && file.path + "/" !== rootPath && !file.path.split("/").some(part => part.startsWith(".")));
    folders.sort((a, b) => a.path.localeCompare(b.path)).forEach(folder => { select.createEl("option", { text: folder.path }).value = folder.path; });
    const controls = editor.createDiv({ cls: "noria-inbox-form-actions" });
    button(controls, t("取消", "Cancel"), "", () => { form.hidden = true; });
    const keepLabel = editor.createEl("label", { cls: "noria-inbox-keep" });
    const keep = keepLabel.createEl("input", { type: "checkbox" }); keep.checked = false;
    keepLabel.createSpan({ text: t("留在 Inbox", "Keep in Inbox") });
    editor.insertBefore(keepLabel, controls);
    const submit = button(controls, t("移出", "Move"), "mod-cta"); submit.type = "submit";
    on(editor, "submit", async event => {
      event.preventDefault(); if (!select.value || busy) return;
      busy = true; submit.disabled = true;
      try {
        const receipt = await moveWithEntry(plugin, item.path, select.value, { keep: keep.checked });
        form.hidden = true; await refreshEntries();
        showReceipt(t("已移出 Inbox", "Moved out of Inbox"), () => undoWithEntry(plugin, receipt), receipt.target);
      } catch (error) { new Notice(error.message); }
      finally { busy = false; submit.disabled = false; }
    });
    select.focus();
  }
  async function finishEntry(item) {
    busy = true; closeWheel(false);
    try {
      const file = app.vault.getAbstractFileByPath(item.sourcePath);
      await editEntry(plugin, file, item.entry, "");
      await refreshEntries();
      showReceipt(t("已完成，资料保留", "Done; sources kept"), () => appendEntry(plugin, file, item.entry.raw));
    } catch (error) { new Notice(error.message); }
    finally { busy = false; }
  }
  on(card, "pointerdown", event => {
    if (event.button !== 0 || active || busy) return;
    const title = event.target.closest(".noria-inbox-title"); if (!title || !list.contains(title)) return;
    const item = items.find(item => item.path === title.closest("[data-inbox-path]").dataset.inboxPath);
    press = { item, x: event.clientX, y: event.clientY, id: event.pointerId, type: event.pointerType, shown: false, moved: false };
    press.timer = win.setTimeout(() => { if (!press) return; press.shown = true; showWheel(item); card.setPointerCapture(press.id); }, event.pointerType === "touch" ? 380 : 240);
  });
  on(card, "pointermove", event => {
    if (!press) return;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) {
      press.moved = true;
      if (!press.shown && press.type === "touch") { win.clearTimeout(press.timer); press = null; return; }
      if (!press.shown) { win.clearTimeout(press.timer); press.shown = true; showWheel(press.item); card.setPointerCapture(event.pointerId); }
    }
    if (press?.shown) { event.preventDefault(); connect(targetAt(event.clientX, event.clientY), event.clientX, event.clientY); }
  });
  on(win, "pointerup", event => {
    if (!press) return;
    const held = press; win.clearTimeout(held.timer); press = null;
    if (held.shown) {
      ignoreClick = Date.now() + 400;
      const hit = held.moved ? targetAt(event.clientX, event.clientY) : null;
      if (hit?.dataset.exit) moveForm(); else if (hit) void choose(hit.dataset.actor, hit.dataset.action); else if (held.moved) closeWheel();
      if (card.hasPointerCapture(event.pointerId)) card.releasePointerCapture(event.pointerId);
    }
  });
  on(win, "pointercancel", () => { if (press) win.clearTimeout(press.timer); press = null; closeWheel(); });
  on(layer, "click", event => { if (event.target === layer) closeWheel(); });
  on(layer, "wheel", event => event.preventDefault());
  on(layer, "pointerover", event => { if (!press) connect(event.target.closest(".noria-inbox-sector,.noria-inbox-exit")); });
  on(layer, "focusin", event => connect(event.target.closest(".noria-inbox-sector,.noria-inbox-exit")));
  on(layer, "keydown", event => {
    if (event.key !== "Tab") return;
    const focusable = [...wheel.querySelectorAll("button")];
    if (event.shiftKey && doc.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1).focus(); }
    else if (!event.shiftKey && doc.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
  });
  await refreshEntries();
  const refs = [
    [app.workspace, app.workspace.on("layout-change", syncReading)],
    [app.workspace, app.workspace.on("active-leaf-change", syncReading)],
    [app.metadataCache, app.metadataCache.on("changed", (file, text, metadata) => {
      if (!file.path.startsWith(rootPath)) return;
      if (file === storeFile || file.path === rootPath+"Inbox.md") { void refreshEntries(); return; }
      let item = items.find(item => item.path === file.path);
      if (!item) { void refreshEntries(); return; }
      const previous = item.work;
      item.work = parseWork(metadata?.frontmatter?.[FIELD]).value; item.preview = preview(text, item.name);
      if (previous !== item.work && (actorFilter || actionFilter)) renderList(); else { updateRow(item); syncFilters(); }
      if (active && !busy) paintWheel();
    })],
    ...["delete", "rename"].map(event => [app.vault, app.vault.on(event, (file, oldPath) => {
      if (!file.path.startsWith(rootPath) && !oldPath?.startsWith(rootPath)) return;
      if (active?.item.path === (oldPath || file.path)) closeWheel(false);
      void refreshEntries();
    })])
  ];
  const resize = new win.ResizeObserver(() => { if (restorePending) restorePosition(); if (active) paintWheel(); }); resize.observe(card); if (viewport) resize.observe(viewport);
  const observer = new win.MutationObserver(() => { if (!host.isConnected) cleanup(); });
  observer.observe(doc.body, { childList: true, subtree: true });
  function cleanup() {
    if (disposed) return; disposed = true;
    reader.dispose();
    if (press) win.clearTimeout(press.timer);
    actionMenu?.hide(); closeWheel(false); abort.abort(); refs.forEach(([events, ref]) => events.offref(ref));
    observer.disconnect(); resize.disconnect(); tools.remove(); layer.remove(); card.classList.remove("noria-inbox-card");
    if (host.__noriaInboxCleanup === cleanup) delete host.__noriaInboxCleanup;
  }
  host.__noriaInboxCleanup = cleanup;
}
module.exports = { renderInboxCard };
