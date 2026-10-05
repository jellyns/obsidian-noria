(async () => {
  const bridgeRoot = input?.noriaBridge || globalThis.__noriaRuntimeBridge || {};
  const homeMocT = (key, params = {}) => {
    try {
      if (bridgeRoot && typeof bridgeRoot.t === "function") return bridgeRoot.t(key, params);
      const messages = bridgeRoot?.i18n?.messages || {};
      const fallback = bridgeRoot?.i18n?.fallback || {};
      let template = messages[key] || fallback[key] || key;
      Object.entries(params || {}).forEach(([k, v]) => {
        template = String(template).replace(new RegExp(`\\{${k}\\}`, "g"), String(v ?? ""));
      });
      return String(template);
    } catch (_) {
      return String(key || "");
    }
  };
  const container = input?.mount || ((typeof this !== "undefined" && this && this.container) ? this.container : (ctx.container || null));
  if (!container || typeof container.createDiv !== "function") {
    ctx.paragraph(homeMocT("runtime.home.noContainer"));
    return;
  }

  function setSafeIcon(el, iconId) {
    if (typeof bridgeRoot.runtime?.setIcon === "function") {
      bridgeRoot.runtime.setIcon(el, iconId);
      return true;
    }
    return false;
  }

  function notify(key, params = {}) {
    bridgeRoot.runtime?.notice?.(key, params, 3200);
  }

  const bridgeHome = bridgeRoot.homeDashboard || {};
  const normalizePath = (p) => String(p || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  const sanitizeColor = (v) => /^#([0-9a-fA-F]{6})$/.test(String(v || "").trim()) ? String(v).toLowerCase() : "";
  const getEntriesFn = typeof bridgeHome.getMocEntries === "function"
    ? bridgeHome.getMocEntries.bind(bridgeHome)
    : (typeof bridgeRoot.getMocEntries === "function" ? bridgeRoot.getMocEntries.bind(bridgeRoot) : null);
  const rawEntries = typeof getEntriesFn === "function"
    ? getEntriesFn()
    : (Array.isArray(bridgeHome.mocEntries) ? bridgeHome.mocEntries : (Array.isArray(bridgeRoot.mocEntries) ? bridgeRoot.mocEntries : []));
  const entries = (Array.isArray(rawEntries) && rawEntries.length
    ? rawEntries
    : (
      Array.isArray(bridgeHome.mocEntryPaths)
        ? bridgeHome.mocEntryPaths.map((p) => ({ path: p, color: "" }))
        : (Array.isArray(bridgeRoot.mocEntryPaths) ? bridgeRoot.mocEntryPaths.map((p) => ({ path: p, color: "" })) : [])
    )
  )
    .map((item) => ({
      path: normalizePath(item?.path ?? item),
      color: sanitizeColor(item?.color)
    }))
    .filter((x) => x.path);

  const norm = (p) => String(p || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const resolveMocTarget = (p) => {
    const lp = norm(p);
    const direct = app.vault.getAbstractFileByPath(lp);
    const visualPath = /\.md$/i.test(lp) ? lp.replace(/\.md$/i, ".canvas") : "";
    const visualFile = visualPath ? app.vault.getAbstractFileByPath(visualPath) : null;
    return {
      lp,
      targetPath: lp,
      file: direct || null,
      exists: !!direct,
      visualPath,
      visualFile: visualFile || null
    };
  };
  const openMocTarget = async (p, event, anchor) => {
    const target = resolveMocTarget(p);
    if (!target.file) {
      notify("runtime.home.moc.noticeMissing", { path: target.lp });
      await bridgeRoot.runtime?.pickMocEntry?.({ replacePath: target.lp });
      return;
    }
    try {
      const result = await bridgeRoot.runtime.openHomeSource(p, { event, anchor });
      if (!result.ok) notify("runtime.home.moc.noticeMissing", { path: p });
    } catch (error) {
      notify("runtime.home.moc.openFailed");
    }
  };
  const labelFromPath = (p) => {
    const base = norm(p).split("/").pop() || p;
    const name = base.replace(/\.(?:md|canvas)$/i, "");
    return name.replace(/·MOC$/i, "") || name;
  };

  const row = container.createDiv();
  row.addClass("dashboard-moc-strip");
  if (input?.bareStrip) row.addClass("dashboard-moc-strip--bare");

  const heading = row.createDiv({ cls: "dashboard-moc-heading" });
  const lead = heading.createDiv();
  lead.addClass("dashboard-moc-strip__lead");
  const icWrap = lead.createDiv();
  icWrap.addClass("dashboard-moc-strip__lead-icon");
  if (!setSafeIcon(icWrap, "map")) icWrap.textContent = "◇";
  const lab = lead.createDiv();
  lab.addClass("dashboard-moc-strip__label");
  lab.textContent = "MOC";

  if (typeof input?.onAddMoc === "function") {
    const tb = heading.createDiv({ cls: "dashboard-moc-strip__toolbar" });
    const addBtn = tb.createEl("button", { cls: "clickable-icon dashboard-guide-icon-btn" });
    addBtn.type = "button";
    addBtn.setAttr("title", homeMocT("runtime.home.moc.chooseExisting"));
    addBtn.setAttr("aria-label", homeMocT("runtime.home.moc.add"));
    if (!setSafeIcon(addBtn, "plus")) addBtn.textContent = "+";
    addBtn.onclick = () => { void input.onAddMoc(); };
  }
  const grid = row.createDiv({ cls: "dashboard-moc-grid" });
  if (!entries.length) {
    grid.createDiv({ cls: "dashboard-moc-empty", text: homeMocT("runtime.home.moc.emptyInline") });
    return;
  }
  const labelCounts = new Map();
  entries.forEach((entry) => { const label=labelFromPath(entry.path); labelCounts.set(label,(labelCounts.get(label)||0)+1); });

  for (const item of entries) {
    const target = resolveMocTarget(item.path);
    const { lp, targetPath, exists } = target;
    const entry = grid.createDiv();
    entry.addClass("dashboard-moc-entry");
    const a = entry.createEl("a", { text: labelFromPath(lp) });
    a.addClass("internal-link");
    a.addClass("dashboard-moc-chip");
    if (!exists) a.addClass("dashboard-moc-chip--missing");
    a.setAttr("data-href", targetPath);
    a.setAttr("href", targetPath);
    a.setAttr("title", exists ? targetPath : homeMocT("runtime.home.moc.missing", { path: lp }));
    if (labelCounts.get(labelFromPath(lp)) > 1) {
      const detail = entry.createSpan({ cls: "dashboard-moc-entry-path", text: lp.split("/").slice(0,-1).join("/") || lp });
      a.setAttr("aria-label", `${labelFromPath(lp)} · ${detail.textContent}`);
    }
    a.onclick = async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      await openMocTarget(lp, ev, a);
    };
    a.onauxclick = async (ev) => { if (ev.button === 1) { ev.preventDefault(); ev.stopPropagation(); await openMocTarget(lp, ev, a); } };
    a.onmouseenter = (ev) => { if (exists) bridgeRoot.runtime?.previewHomeSource?.(lp, ev, a); };
    if (item.color) a.style.setProperty("--moc-chip-accent", item.color);
    if (target.visualFile) {
      const visual = entry.createEl("button");
      visual.type = "button";
      visual.addClass("clickable-icon");
      visual.addClass("dashboard-moc-visual-action");
      visual.setAttr("data-noria-moc-role", "visual");
      visual.setAttr("data-href", target.visualPath);
      visual.setAttr("title", homeMocT("runtime.home.moc.openVisual"));
      visual.setAttr("aria-label", homeMocT("runtime.home.moc.openVisual"));
      if (!setSafeIcon(visual, "map")) visual.textContent = "◇";
      visual.onclick = async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        await openMocTarget(target.visualPath, ev, visual);
      };
      visual.onauxclick = async (ev) => { if (ev.button === 1) { ev.preventDefault(); ev.stopPropagation(); await openMocTarget(target.visualPath, ev, visual); } };
    }
  }

})();
