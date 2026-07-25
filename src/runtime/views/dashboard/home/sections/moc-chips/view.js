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
    try {
      if (typeof require !== "undefined") {
        const { setIcon } = require("obsidian");
        if (typeof setIcon === "function") {
          setIcon(el, iconId);
          return true;
        }
      }
    } catch (_) {}
    return false;
  }

  function notify(message, timeout = 3200) {
    try {
      if (typeof Notice !== "undefined") {
        new Notice(message, timeout);
        return;
      }
    } catch (_) {}
    try {
      if (typeof require !== "undefined") {
        const { Notice } = require("obsidian");
        if (typeof Notice === "function") new Notice(message, timeout);
      }
    } catch (_) {}
  }

  const useTextPlus = !!globalThis.__noriaGuideToolbar?.primaryAddUseTextPlus;

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

  if (entries.length === 0) {
    const hint = container.createDiv();
    hint.addClass("dashboard-moc-empty");
    if (input?.bareStrip) hint.addClass("dashboard-moc-empty--bare");
    hint.style.whiteSpace = "normal";
    hint.textContent = homeMocT("runtime.home.moc.emptyInline");
    if (typeof input?.onAddMoc === "function") {
      const bar = container.createDiv();
      bar.style.cssText = "display:flex;justify-content:flex-end;margin-top:8px;";
      const addBtn = bar.createEl("button");
      addBtn.type = "button";
      addBtn.addClass("dashboard-guide-icon-btn");
      if (useTextPlus) addBtn.addClass("dashboard-guide-toolbar-plus");
      addBtn.setAttr("title", homeMocT("runtime.home.moc.addTitle"));
      addBtn.setAttr("aria-label", homeMocT("runtime.home.moc.add"));
      if (useTextPlus) {
        addBtn.textContent = "+";
      } else if (!setSafeIcon(addBtn, "plus")) addBtn.textContent = "+";
      addBtn.onclick = () => {
        try {
          input.onAddMoc();
        } catch (_) {}
      };
    }
    return;
  }

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
  const openMocTarget = async (p) => {
    const target = resolveMocTarget(p);
    if (!target.file) {
      notify(homeMocT("runtime.home.moc.noticeMissing", { path: target.lp }));
      return;
    }
    await app.workspace.getLeaf(false).openFile(target.file);
  };
  const labelFromPath = (p) => {
    const base = norm(p).split("/").pop() || p;
    return base.replace(/\.(?:md|canvas)$/i, "") || base;
  };

  const row = container.createDiv();
  row.addClass("dashboard-moc-strip");
  if (input?.bareStrip) row.addClass("dashboard-moc-strip--bare");

  const lead = row.createDiv();
  lead.addClass("dashboard-moc-strip__lead");
  const icWrap = lead.createDiv();
  icWrap.addClass("dashboard-moc-strip__lead-icon");
  if (!setSafeIcon(icWrap, "map")) icWrap.textContent = "◇";
  const lab = lead.createDiv();
  lab.addClass("dashboard-moc-strip__label");
  lab.textContent = "MOC";

  for (const item of entries) {
    const target = resolveMocTarget(item.path);
    const { lp, targetPath, exists } = target;
    const entry = row.createDiv();
    entry.addClass("dashboard-moc-entry");
    const a = entry.createEl("a", { text: labelFromPath(lp) });
    a.addClass("internal-link");
    a.addClass("dashboard-moc-chip");
    if (!exists) a.addClass("dashboard-moc-chip--missing");
    a.setAttr("data-href", targetPath);
    a.setAttr("href", targetPath);
    a.setAttr("title", exists ? targetPath : homeMocT("runtime.home.moc.missing", { path: lp }));
    a.onclick = async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      await openMocTarget(lp);
    };
    if (item.color) a.style.setProperty("--moc-chip-accent", item.color);
    if (target.visualFile) {
      const visual = entry.createEl("button");
      visual.type = "button";
      visual.addClass("dashboard-moc-visual-action");
      visual.setAttr("data-noria-moc-role", "visual");
      visual.setAttr("data-href", target.visualPath);
      visual.setAttr("title", homeMocT("runtime.home.moc.openVisual"));
      visual.setAttr("aria-label", homeMocT("runtime.home.moc.openVisual"));
      if (!setSafeIcon(visual, "map")) visual.textContent = "◇";
      visual.onclick = async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        await app.workspace.getLeaf(false).openFile(target.visualFile);
      };
    }
  }

  if (typeof input?.onAddMoc === "function") {
    const tb = row.createDiv();
    tb.addClass("dashboard-moc-strip__toolbar");
    const addBtn = tb.createEl("button");
    addBtn.type = "button";
    addBtn.addClass("dashboard-guide-icon-btn");
    if (useTextPlus) addBtn.addClass("dashboard-guide-toolbar-plus");
    addBtn.setAttr("title", homeMocT("runtime.home.moc.addTitle"));
    addBtn.setAttr("aria-label", homeMocT("runtime.home.moc.add"));
    if (useTextPlus) {
      addBtn.textContent = "+";
    } else if (!setSafeIcon(addBtn, "plus")) addBtn.textContent = "+";
    addBtn.onclick = () => {
      try {
        input.onAddMoc();
      } catch (_) {}
    };
  }
})();
