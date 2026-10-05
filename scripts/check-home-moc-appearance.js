// Scoped native screenshots of the installed build, using synthetic NoriaTest notes.
(async () => {
  if (app.vault.getName() !== "NoriaTest") throw Error("Use NoriaTest only");
  const q = globalThis.__noriaMocChecks;
  if (!q || q.visual) throw Error("Start or resume the runtime acceptance first");
  const v = q.visual = { images: [], locale: q.p.getNoriaLocale, dark: document.body.classList.contains("theme-dark") };
  const topics = {
    zh: ["阅读与写作", "城市漫步", "摄影与观察", "工具与工作流", "知识管理", "生活记录", "研究方法", "运动与健康"],
    en: ["Reading and writing", "City walks", "Photography", "Tools and workflows", "Knowledge management", "Life notes", "Research methods", "Health and movement"]
  };
  const colors = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#6366f1", "#f43f5e", "#0ea5e9", "#10b981"];
  v.entries = {};
  for (const [locale, names] of Object.entries(topics)) {
    v.entries[locale] = [];
    for (let i = 0; i < names.length; i++) {
      const path = q.initial.folder + "/" + locale + "/" + names[i] + "·MOC.md";
      await q.seed(path, "---\ntest_fixture: moc-appearance\n---\n\n## " + names[i] + "\n\n" + (locale === "zh" ? "隔离体验示例，用于核对主页入口。" : "Isolated example for checking Home entries.") + "\n");
      v.entries[locale].push({ path, color: colors[i] });
      if (i === 0 || i === 4) await q.seed(path.replace(/\.md$/, ".canvas"), JSON.stringify({ nodes: [{ id: "topic", type: "text", text: names[i], x: 0, y: 0, width: 260, height: 100 }], edges: [] }));
    }
  }
  v.capture = async ({ locale = "zh", dark = false, width = 980, name = "moc" } = {}) => {
    q.p.getNoriaLocale = () => locale; q.p.syncRuntimeBridgeConfig();
    document.body.classList.toggle("theme-dark", dark); document.body.classList.toggle("theme-light", !dark);
    await q.p.setMocEntries(v.entries[locale], { refresh: false });
    await q.home(); await q.leaf.view.reload(); await q.home();
    const card = q.host().querySelector('.dashboard-moc-host').closest('[data-noria-widget-id="moc-strip"]');
    card.style.width = width + "px"; card.style.maxWidth = "100%";
    card.scrollIntoView({ block: "center" }); await new Promise(r => setTimeout(r, 250));
    const rect = card.getBoundingClientRect(), grid = card.querySelector('.dashboard-moc-grid');
    const controls = [...card.querySelectorAll('a,button')].filter(el => el.checkVisibility());
    const plus = card.querySelector('.dashboard-moc-strip__toolbar button').getBoundingClientRect();
    const menu = card.querySelector('[data-noria-widget-shell-action="menu"]').getBoundingClientRect();
    const result = { locale, dark, width, rect: rect.toJSON(), columns: getComputedStyle(grid).gridTemplateColumns,
      fits: card.scrollWidth <= card.clientWidth + 1 && rect.top >= 0 && rect.bottom <= innerHeight,
      controlsFit: controls.every(el => { const r = el.getBoundingClientRect(); return r.left >= rect.left - 1 && r.right <= rect.right + 1; }),
      toolbarSeparated: plus.right <= menu.left + 1,
      visualIcons: card.querySelectorAll('[data-noria-moc-role="visual"] svg').length,
      entryHeights: [...card.querySelectorAll('.dashboard-moc-entry')].map(el => el.getBoundingClientRect().height) };
    if (!result.fits || !result.controlsFit || !result.toolbarSeparated || result.visualIcons !== 2) throw Error("MOC layout failed: " + JSON.stringify(result));
    const clip = { x: Math.max(0, Math.floor(rect.left - 4)), y: Math.max(0, Math.floor(rect.top - 4)), width: Math.ceil(rect.width + 8), height: Math.ceil(rect.height + 8) };
    result.name = name + "-" + locale + "-" + (dark ? "dark" : "light") + "-" + width + ".png";
    q.fs.writeFileSync(q.root + "/" + result.name, (await q.win.webContents.capturePage(clip)).toPNG());
    v.images.push(result); q.fs.writeFileSync(q.root + "/appearance-results.json", JSON.stringify(v.images, null, 2));
    return result;
  };
  v.restore = async () => {
    q.p.getNoriaLocale = v.locale; q.p.syncRuntimeBridgeConfig();
    document.body.classList.toggle("theme-dark", v.dark); document.body.classList.toggle("theme-light", !v.dark);
    await q.p.setMocEntries(q.initial.entries); await q.flush();
    q.p.requestNoriaRefresh("home", "moc-appearance-restored");
  };
  return { ready: true };
})()
