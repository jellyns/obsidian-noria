(async () => {
  const bridge = input?.noriaBridge || globalThis.__noriaRuntimeBridge || {};
  const homeOverviewT = (key, params = {}) => {
    try {
      if (bridge && typeof bridge.t === "function") return bridge.t(key, params);
      const messages = bridge?.i18n?.messages || {};
      const fallback = bridge?.i18n?.fallback || {};
      let template = messages[key] || fallback[key] || key;
      Object.entries(params || {}).forEach(([k, v]) => {
        template = String(template).replace(new RegExp(`\\{${k}\\}`, "g"), String(v ?? ""));
      });
      return String(template);
    } catch (_) {
      return String(key || "");
    }
  };
  const habitRegistryPath = String(bridge.paths?.habitRegistryPath || "Noria/Habits.md");
  const importantDatesPath = String(bridge.paths?.importantDatesPath || "Noria/Countdowns.md");
  const inboxRoot = normPathLocal(bridge.paths?.inboxRoot || "00_Inbox").replace(/\/+$/, "");
  const inboxWorkflowPath = normPathLocal(bridge.paths?.inboxWorkflowPath || "Noria/Inbox workflow.md");
  const inboxQueuePath = normPathLocal(bridge.paths?.inboxQueuePath || "Noria/Inbox queue.base");
  function normPathLocal(path) {
    return String(path || "").replace(/\\/g, "/").replace(/^\/+/, "");
  }
  async function loadText(path) {
    try {
      const txt = await ctx.io.load(path);
      if (txt) return String(txt);
    } catch (_) {}
    try {
      const normalized = String(path || "").replace(/\\/g, "/").replace(/^\/+/, "");
      return String(await app.vault.adapter.read(normalized) || "");
    } catch (_) {
      return "";
    }
  }

  function getHomeChildViewRuntimeBuildId() {
    return String(
      input?.noriaBridge?.runtimeBuildId ||
      globalThis.__noriaRuntimeBridge?.runtimeBuildId ||
      globalThis.__noriaRuntimeBuildId ||
      ""
    );
  }

  function getHomeChildViewLoaderState() {
    const runtimeBuildId = getHomeChildViewRuntimeBuildId();
    try {
      const key = "__noriaHomeChildViewLoaderV1";
      const current = globalThis[key];
      if (!current || current.runtimeBuildId !== runtimeBuildId) {
        globalThis[key] = {
          runtimeBuildId,
          sourceTextCache: new Map(),
          sourceTextPending: new Map(),
          runnerCache: new Map()
        };
      }
      return globalThis[key];
    } catch (_) {
      return {
        runtimeBuildId,
        sourceTextCache: new Map(),
        sourceTextPending: new Map(),
        runnerCache: new Map()
      };
    }
  }

  function hashHomeChildViewSource(value) {
    const text = String(value || "");
    let h = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(36);
  }

  async function loadHomeChildViewSource(path) {
    const normalized = String(path || "").replace(/\\/g, "/").replace(/^\/+/, "");
    const perf = input?.noriaBridge?.performance || globalThis.__noriaRuntimeBridge?.performance || {};
    if (perf.viewSourceCache === false) return loadText(normalized);
    const state = getHomeChildViewLoaderState();
    if (state.sourceTextCache?.has?.(normalized)) return state.sourceTextCache.get(normalized);
    if (state.sourceTextPending?.has?.(normalized)) return await state.sourceTextPending.get(normalized);
    const pending = loadText(normalized)
      .then((code) => {
        const text = String(code || "");
        if (text) state.sourceTextCache.set(normalized, text);
        return text;
      })
      .finally(() => {
        try { state.sourceTextPending.delete(normalized); } catch (_) {}
      });
    state.sourceTextPending.set(normalized, pending);
    return await pending;
  }

  function getHomeChildViewRunner(sourcePath, sourceCode) {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const perf = input?.noriaBridge?.performance || globalThis.__noriaRuntimeBridge?.performance || {};
    if (perf.viewSourceCache === false) {
      return new AsyncFunction("ctx", "input", "app", "moment", "window", "document", "globalThis", String(sourceCode));
    }
    const state = getHomeChildViewLoaderState();
    const key = `${String(sourcePath || "")}:${hashHomeChildViewSource(sourceCode)}`;
    let run = state.runnerCache?.get?.(key);
    if (!run) {
      run = new AsyncFunction("ctx", "input", "app", "moment", "window", "document", "globalThis", String(sourceCode));
      state.runnerCache.set(key, run);
      if (state.runnerCache.size > 64) {
        const firstKey = state.runnerCache.keys().next().value;
        if (firstKey) state.runnerCache.delete(firstKey);
      }
    }
    return run;
  }

  async function runCustomViewByPath(viewPath, viewInput) {
    const normalized = String(viewPath || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    if (!normalized) throw new Error("empty custom view path");
    const candidates = normalized.toLowerCase().endsWith(".js")
      ? [normalized]
      : [`${normalized}.js`, `${normalized}/view.js`];
    let sourcePath = "";
    let loadedSourceCode = "";
    for (const candidate of candidates) {
      const sourceCode = await loadHomeChildViewSource(candidate);
      if (sourceCode) {
        sourcePath = candidate;
        loadedSourceCode = sourceCode;
        break;
      }
    }
    if (!loadedSourceCode) throw new Error(`Custom view failed to load: ${normalized}`);
    const run = getHomeChildViewRunner(sourcePath, loadedSourceCode);
    await run(ctx, viewInput || {}, app, window.moment, window, document, globalThis);
  }

  function renderSectionError(mount, title, error) {
    try {
      mount?.empty?.();
    } catch (_) {}
    const box = mount.createDiv();
    box.addClass("dashboard-overview-section-error");
    box.style.cssText =
      "padding:8px 9px;border-radius:10px;border:1px dashed color-mix(in srgb,var(--background-modifier-border) 82%,rgba(239,68,68,.22));background:var(--dash-surface-muted,color-mix(in srgb,var(--background-primary) 94%,rgba(239,68,68,.06)));color:var(--text-muted);font-size:.84em;line-height:1.4;";
    box.setText(homeOverviewT("runtime.home.overview.sectionLoadFailed", { section: title }));
    const detail = String(error?.message || error || "").trim();
    if (detail) box.setAttr("title", detail);
  }

  async function runWorkbenchView(title, viewPath, viewInput, mount) {
    try {
      await runCustomViewByPath(viewPath, viewInput);
      return true;
    } catch (error) {
      try { console.warn("[noria] home overview child view failed", viewPath, error); } catch (_) {}
      renderSectionError(mount, title, error);
      return false;
    }
  }

  const norm = (p) => normPathLocal(p);
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  function paintIcon(el, iconId) {
    const fn = globalThis.dashboardCore?.utils?.applyLucideIcon;
    if (typeof fn === "function") {
      fn(el, iconId);
      return;
    }
    el.textContent = "↗";
  }

  async function openFilePath(path) {
    const p = norm(path);
    const f = app.vault.getAbstractFileByPath(p);
    if (!f) {
      bridge.runtime?.notice?.("runtime.home.notice.missingPath", { path: p }, 4500)
        || new Notice(homeOverviewT("runtime.home.notice.missingPath", { path: p }), 4500);
      return false;
    }
    await app.workspace.getLeaf(false).openFile(f);
    return true;
  }

  async function openTasksBoard() {
    try {
      if (typeof bridge.openTasksBoard === "function") {
        await bridge.openTasksBoard();
        return true;
      }
      if (typeof bridge.runtime?.openTasksBoard === "function") {
        await bridge.runtime.openTasksBoard();
        return true;
      }
      if (typeof app?.commands?.executeCommandById === "function") {
        const pluginId = String(bridge.pluginId || "noria").trim() || "noria";
        return app.commands.executeCommandById(`${pluginId}:open-tasks-plugin-tab`) !== false;
      }
    } catch (e) {
      bridge.runtime?.notice?.("runtime.home.notice.createFailed", { message: e?.message || e }, 4500)
        || new Notice(homeOverviewT("runtime.home.notice.createFailed", { message: e?.message || e }), 4500);
      return false;
    }
    return false;
  }

  async function openInboxWorkflow() {
    return openFilePath(inboxWorkflowPath);
  }

  async function openInboxQueue() {
    return openFilePath(inboxQueuePath);
  }

  async function newInboxScratch() {
    const moment = window.moment;
    const now = new Date();
    const stamp = moment
      ? moment().format("YYYY-MM-DD-HHmm")
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-${Date.now() % 100000}`;
    const p = norm(`${inboxRoot}/速记-${stamp}.md`);
    try {
      await app.vault.create(p, `# 速记 ${stamp}\n\n- `);
      const f = app.vault.getAbstractFileByPath(p);
      if (f) await app.workspace.getLeaf(false).openFile(f);
      return true;
    } catch (e) {
      bridge.runtime?.notice?.("runtime.home.notice.createFailed", { message: e?.message || e }, 5000)
        || new Notice(homeOverviewT("runtime.home.notice.createFailed", { message: e?.message || e }), 5000);
      return false;
    }
  }

  function setWorkbenchToolbarActionState(control, state, error = "") {
    const next = String(state || "idle");
    control.setAttribute("data-noria-action-state", next);
    control.toggleClass?.("is-pending", next === "pending");
    control.toggleClass?.("is-failed", next === "failed");
    control.toggleClass?.("is-ok", next === "ok");
    if (next === "pending") control.setAttribute("aria-busy", "true");
    else control.removeAttribute("aria-busy");
    if (error) control.setAttribute("data-noria-action-error", String(error));
    else control.removeAttribute("data-noria-action-error");
  }

  function bindWorkbenchToolbarAction(control, actionKind, run, opts = {}) {
    const kind = String(actionKind || "toolbar-action");
    control.setAttribute("data-noria-action-source", "home-workbench-toolbar");
    control.setAttribute("data-noria-action-kind", kind);
    if (opts?.target) control.setAttribute("data-noria-action-target", String(opts.target));
    setWorkbenchToolbarActionState(control, "idle");
    control.onclick = async (ev) => {
      ev.preventDefault();
      control.disabled = true;
      setWorkbenchToolbarActionState(control, "pending");
      try {
        const result = await run();
        if (result === false) {
          setWorkbenchToolbarActionState(control, "failed", "action returned false");
          return false;
        }
        setWorkbenchToolbarActionState(control, "ok");
        return true;
      } catch (error) {
        const message = String(error?.message || error || "failed");
        setWorkbenchToolbarActionState(control, "failed", message);
        bridge.runtime?.notice?.("runtime.home.notice.createFailed", { message }, 4500)
          || new Notice(homeOverviewT("runtime.home.notice.createFailed", { message }), 4500);
        return false;
      } finally {
        control.disabled = false;
      }
    };
  }

  function addIconBtn(parent, iconId, tooltip, run, opts = {}) {
    const b = parent.createEl("button");
    b.type = "button";
    b.setAttribute("aria-label", tooltip);
    b.setAttribute("title", tooltip);
    b.addClass("dashboard-guide-icon-btn");
    if (opts?.variant === "governance") b.addClass("dashboard-guide-icon-btn--governance");
    paintIcon(b, iconId);
    bindWorkbenchToolbarAction(b, opts?.actionKind || iconId, run, opts);
  }

  function addToolbarPlusBtn(parent, tooltip, run, opts = {}) {
    const b = parent.createEl("button");
    b.type = "button";
    b.textContent = "+";
    b.setAttribute("aria-label", tooltip);
    b.setAttribute("title", tooltip);
    b.addClass("dashboard-guide-icon-btn");
    b.addClass("dashboard-guide-toolbar-plus");
    bindWorkbenchToolbarAction(b, opts?.actionKind || "new-item", run, opts);
  }

  function attachLinkedResizer(cards, options) {
    const targets = Array.isArray(cards) ? cards.filter(Boolean) : [];
    if (targets.length === 0) return;
    const key = String(options?.storageKey || "");
    const minH = Number(options?.minHeight || 220);
    const maxH = Number(options?.maxHeight || 980);
    const onResize = typeof options?.onResize === "function" ? options.onResize : null;
    const setResizeAttr = (el, name, value) => {
      try {
        if (typeof el?.setAttr === "function") el.setAttr(name, String(value));
        else if (typeof el?.setAttribute === "function") el.setAttribute(name, String(value));
      } catch (_) {}
    };

    const apply = (h, persist) => {
      const next = clamp(Number(h) || minH, minH, maxH);
      targets.forEach((card) => {
        card.style.minHeight = `${next}px`;
        card.style.height = `${next}px`;
        setResizeAttr(card, "data-noria-tray-resize-scope", "local-transient");
        if (key) setResizeAttr(card, "data-noria-tray-resize-key", key);
        setResizeAttr(card, "data-noria-tray-resize-height", next);
        setResizeAttr(card, "data-noria-tray-resize-persisted", persist ? "1" : "0");
      });
      if (onResize) onResize(next);
      if (persist && key) {
        try { localStorage.setItem(key, String(next)); } catch (_) {}
      }
      return next;
    };

    if (key) {
      try {
        const raw = Number(localStorage.getItem(key) || "");
        if (Number.isFinite(raw) && raw > 0) apply(raw, false);
      } catch (_) {}
    }

    targets.forEach((card) => {
      card.style.position = "relative";
      const handle = card.createDiv();
      handle.addClass("dashboard-tray-resize-handle");
      handle.setAttr("title", homeOverviewT("runtime.home.overview.trayResizeLinked"));
      handle.setAttr("aria-label", homeOverviewT("runtime.home.overview.trayResize"));
      handle.setAttr("role", "separator");
      handle.setAttr("aria-orientation", "horizontal");
      handle.setAttr("data-noria-tray-resize-scope", "local-transient");
      if (key) handle.setAttr("data-noria-tray-resize-key", key);
      handle.setAttr("data-noria-tray-resize-min", String(minH));
      handle.setAttr("data-noria-tray-resize-max", String(maxH));
      let startY = 0;
      let startH = 0;
      const onMove = (ev) => {
        const dy = Number(ev.clientY) - startY;
        apply(startH + dy, false);
      };
      const onUp = (ev) => {
        const dy = Number(ev.clientY) - startY;
        apply(startH + dy, true);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      handle.onpointerdown = (ev) => {
        ev.preventDefault();
        startY = Number(ev.clientY);
        startH = targets[0].getBoundingClientRect().height;
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      };
    });
  }

  const container = input?.mount || ((typeof this !== "undefined" && this && this.container) ? this.container : (ctx.container || null));
  if (!container || typeof container.createDiv !== "function") {
    ctx.paragraph(homeOverviewT("runtime.home.noContainer"));
    return;
  }
  const themeHome = globalThis.dashboardCore?.theme?.home?.overview || {};
  const colMax = themeHome.columnScrollMax || "min(42vh, 380px)";
  /** 习惯+复盘列略高于其它列（约多一行复盘区），可用 theme.home.overview.habitRecapColumnScrollMax 覆盖。 */
  const habitRecapColMax = themeHome.habitRecapColumnScrollMax || "min(47vh, 445px)";

  const DEFAULT_WORKBENCH_PANELS = {
    leftPanels: ["tasks"],
    middlePanels: ["inbox", "habit-today"],
    rightPanels: ["countdown"],
    hiddenPanels: []
  };
  const WORKBENCH_PANEL_IDS = ["tasks", "inbox", "habit-today", "countdown"];
  const WORKBENCH_PANEL_GROUPS = [
    ["left", "leftPanels"],
    ["middle", "middlePanels"],
    ["right", "rightPanels"]
  ];
  const WORKBENCH_PANEL_META = {
    tasks: {
      titleKey: "runtime.home.overview.tasksTitle",
      path: ".obsidian/plugins/noria/views/periodic/dashboardTodayTasks",
      accent: "rgb(14 165 233)",
      bodyMode: "flexScroll",
      toolbar: "tasks"
    },
    inbox: {
      titleKey: "runtime.home.overview.inboxTitle",
      path: ".obsidian/plugins/noria/views/periodic/dashboardGuideInbox",
      accent: "rgb(245 158 11)",
      bodyMode: "flexCol",
      cardClass: "dashboard-guide-inbox"
    },
    "habit-today": {
      titleKey: "runtime.home.overview.habitsTitle",
      path: ".obsidian/plugins/noria/views/periodic/dashboardHabitWeek",
      accent: "rgb(34 197 94)",
      bodyMode: "scroll"
    },
    countdown: {
      titleKey: "runtime.home.overview.countdownTitle",
      path: ".obsidian/plugins/noria/views/periodic/dashboardCountdown",
      accent: "rgb(245 158 11)",
      bodyMode: "scroll",
      toolbar: "countdown"
    }
  };

  function normalizeOverviewPanelList(raw) {
    const out = [];
    (Array.isArray(raw) ? raw : []).forEach((item) => {
      const id = String(item || "").trim();
      if (!id || out.includes(id)) return;
      out.push(id);
    });
    return out;
  }

  function getOverviewWorkbenchPanelLayout(source = {}) {
    const props = source && typeof source === "object" && !Array.isArray(source) ? source : {};
    const hiddenSet = new Set(normalizeOverviewPanelList(props.hiddenPanels));
    if (props.cardMode === true) {
      const panels = normalizeOverviewPanelList(props.panels)
        .filter((panelId) => WORKBENCH_PANEL_IDS.includes(panelId) && !hiddenSet.has(panelId));
      return {
        leftPanels: panels,
        middlePanels: [],
        rightPanels: [],
        hiddenPanels: WORKBENCH_PANEL_IDS.filter((panelId) => !panels.includes(panelId))
      };
    }
    const layout = {
      leftPanels: [],
      middlePanels: [],
      rightPanels: [],
      hiddenPanels: []
    };
    const seen = new Set();
    const addPanel = (key, panelId) => {
      const id = String(panelId || "").trim();
      if (!id || seen.has(id) || hiddenSet.has(id)) return;
      layout[key].push(id);
      seen.add(id);
    };
    WORKBENCH_PANEL_GROUPS.forEach(([group, key]) => {
      const rawList = Array.isArray(props[key]) ? props[key] : DEFAULT_WORKBENCH_PANELS[key];
      normalizeOverviewPanelList(rawList).forEach((panelId) => addPanel(key, panelId));
    });
    WORKBENCH_PANEL_GROUPS.forEach(([, key]) => {
      DEFAULT_WORKBENCH_PANELS[key].forEach((panelId) => addPanel(key, panelId));
    });
    WORKBENCH_PANEL_IDS.forEach((panelId) => {
      if (hiddenSet.has(panelId) && !layout.hiddenPanels.includes(panelId)) layout.hiddenPanels.push(panelId);
    });
    return layout;
  }

  container.addClass("dashboard-workbench-container");
  const root = container.createDiv();
  root.addClass("dashboard-workbench-grid");
  const cardMode = input?.cardMode === true;
  root.style.cssText = cardMode
    ? "display:grid;grid-template-columns:minmax(0,1fr);gap:var(--dash-workbench-gap,12px);align-items:stretch;"
    : "display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--dash-workbench-gap,12px);align-items:stretch;";
  if (cardMode) {
    root.addClass("dashboard-workbench-grid--card");
  }

  const makeCol = (title, bodyMode, renderToolbar, colOpts = {}) => {
    const colMaxLocal = (colOpts && colOpts.scrollMax) || colMax;
    const cardMinLocal = colOpts && colOpts.cardMinHeight;
    const card = root.createDiv();
    card.addClass("dashboard-guide-card");
    card.addClass("dashboard-workbench-panel");
    card.style.cssText = "min-width:0;display:flex;flex-direction:column;";
    if (colOpts.panel) card.setAttr("data-noria-workbench-panel", String(colOpts.panel));
    if (colOpts.panelIds) card.setAttr("data-noria-overview-panel-id", String(colOpts.panelIds));
    if (colOpts.panelGroup) card.setAttr("data-noria-overview-panel-group", String(colOpts.panelGroup));
    if (colOpts.accent) card.style.setProperty("--dash-workbench-accent", String(colOpts.accent));
    card.style.minHeight = cardMinLocal || "min(42vh,380px)";

    const headRow = card.createDiv();
    headRow.addClass("dashboard-workbench-panel__head");
    headRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px;flex-shrink:0;min-height:28px;";
    const titleEl = headRow.createDiv({ text: title });
    titleEl.addClass("dashboard-workbench-panel__title");
    titleEl.style.cssText = "font-weight:760;font-size:0.96em;color:var(--dash-heading-text,var(--text-normal));letter-spacing:0.01em;";
    if (renderToolbar) {
      const tool = headRow.createDiv();
      tool.addClass("dashboard-workbench-panel__tools");
      tool.style.cssText = "display:flex;align-items:center;gap:3px;flex-shrink:0;";
      renderToolbar(tool);
    }

    const body = card.createDiv();
    body.addClass("dashboard-workbench-panel__body");
    body.addClass(`dashboard-workbench-panel__body--${bodyMode}`);
    if (bodyMode === "flexScroll") {
      body.style.cssText = `min-width:0;flex:1;min-height:0;max-height:${colMaxLocal};display:flex;flex-direction:column;overflow:hidden;`;
    } else if (bodyMode === "flexCol") {
      body.style.cssText = `min-width:0;flex:1;min-height:0;max-height:${colMaxLocal};display:flex;flex-direction:column;overflow:hidden;gap:0;`;
    } else {
      body.style.cssText = `min-width:0;flex:1;min-height:0;max-height:${colMaxLocal};overflow-y:auto;overflow-x:hidden;`;
    }
    return { card, body };
  };

  function getPanelTitle(panelId) {
    const key = WORKBENCH_PANEL_META[panelId]?.titleKey || "";
    return homeOverviewT(key || panelId);
  }

  function getPanelBodyMode(panelIds) {
    if (panelIds.includes("inbox")) return "flexCol";
    if (panelIds.length === 1) return WORKBENCH_PANEL_META[panelIds[0]]?.bodyMode || "scroll";
    return "scroll";
  }

  function getPanelAccent(panelIds) {
    return WORKBENCH_PANEL_META[panelIds[0]]?.accent || "rgb(99 102 241)";
  }

  function addToolbarActions(tool, panelIds) {
    if (panelIds.includes("tasks")) {
      addIconBtn(tool, "layout-dashboard", homeOverviewT("runtime.home.overview.openTasks"), () => openTasksBoard(), { actionKind: "open-tasks-board" });
    }
    if (panelIds.includes("inbox")) {
      addIconBtn(tool, "library", homeOverviewT("runtime.home.overview.openInboxWorkflow"), () => openInboxWorkflow(), { actionKind: "open-inbox-workflow", target: inboxWorkflowPath, variant: "governance" });
      addIconBtn(tool, "clipboard-list", homeOverviewT("runtime.home.overview.openInboxQueue"), () => openInboxQueue(), { actionKind: "open-inbox-queue", target: inboxQueuePath });
      addToolbarPlusBtn(tool, homeOverviewT("runtime.home.overview.newInboxScratch"), () => newInboxScratch(), { actionKind: "new-inbox-scratch", target: inboxRoot });
    }
    if (panelIds.includes("countdown")) {
      addIconBtn(tool, "calendar", homeOverviewT("runtime.home.overview.openImportantDates"), () => openFilePath(importantDatesPath), { actionKind: "open-countdowns", target: importantDatesPath });
    }
  }

  function createPanelMount(body, panelId, panelIds) {
    const only = panelIds.length === 1;
    const mount = only ? body : body.createDiv();
    mount.setAttr?.("data-noria-overview-panel-id", panelId);
    mount.setAttr?.("data-noria-overview-panel-group", String(body?.parentElement?.getAttribute?.("data-noria-overview-panel-group") || ""));
    if (panelId === "inbox") {
      mount.addClass("dashboard-overview-inbox-mount");
      mount.style.cssText = "flex:1 1 auto;min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden;";
      return mount;
    }
    if (panelId === "habit-today") {
      mount.addClass("dashboard-overview-habit-context");
      mount.style.cssText = only
        ? "min-width:0;max-height:210px;overflow:auto;"
        : "flex:0 0 auto;min-width:0;margin-top:10px;padding-top:10px;border-top:1px solid color-mix(in srgb,var(--background-modifier-border) 54%,transparent);max-height:210px;overflow:auto;";
      return mount;
    }
    if (!only) {
      mount.addClass("dashboard-overview-panel-mount");
      mount.style.cssText = "min-width:0;min-height:0;";
    }
    return mount;
  }

  async function renderOverviewPanelById(panelId, mount, actionsHost, colInput) {
    const meta = WORKBENCH_PANEL_META[panelId];
    if (!meta) return false;
    const title = getPanelTitle(panelId);
    const payload = { ...colInput, mount };
    if (panelId === "tasks") {
      payload.actionsHost = actionsHost;
      payload.periodHost = actionsHost;
    } else if (panelId === "countdown") {
      payload.actionsHost = actionsHost;
    }
    return runWorkbenchView(title, meta.path, payload, mount);
  }

  function setOverviewPanelState(mount, state, detail = "") {
    try {
      if (!mount) return;
      mount.setAttr?.("data-noria-overview-panel-state", String(state || ""));
      if (detail) mount.setAttr?.("data-noria-overview-panel-state-detail", String(detail));
    } catch (_) {}
  }

  function nextOverviewDeferredFrame() {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      const host = typeof window !== "undefined" ? window : globalThis;
      const delay = typeof host?.setTimeout === "function" ? host.setTimeout.bind(host) : (typeof setTimeout === "function" ? setTimeout : null);
      const frame = typeof host?.requestAnimationFrame === "function"
        ? host.requestAnimationFrame.bind(host)
        : (typeof requestAnimationFrame === "function" ? requestAnimationFrame : null);
      const afterFrame = () => {
        if (delay) {
          try {
            delay(finish, 0);
            return;
          } catch (_) {}
        }
        finish();
      };
      if (frame) {
        try {
          frame(afterFrame);
          return;
        } catch (_) {}
      }
      afterFrame();
    });
  }

  async function hydrateOverviewPanels(panelJobs) {
    const jobs = Array.isArray(panelJobs) ? panelJobs : [];
    if (!jobs.length) return;
    await nextOverviewDeferredFrame();
    await Promise.all(panelJobs.map(async (job) => {
      const mount = job?.panelMount;
      const panelId = String(job?.panelId || "");
      if (!mount || mount.isConnected === false) {
        setOverviewPanelState(mount, "cancelled", panelId);
        return false;
      }
      setOverviewPanelState(mount, "loading", panelId);
      const ok = await renderOverviewPanelById(panelId, mount, job?.actionsHost || null, job?.colInput || {});
      setOverviewPanelState(mount, ok ? "ready" : "failed", panelId);
      return ok;
    }));
  }

  const layout = getOverviewWorkbenchPanelLayout(input || {});
  const columnWraps = [];
  const bodyEls = [];
  const panelJobs = [];
  const { mount: _omitMount, ...colInput } = input || {};

  for (const [group, key] of WORKBENCH_PANEL_GROUPS) {
    const panelIds = normalizeOverviewPanelList(layout[key]).filter((panelId) => WORKBENCH_PANEL_META[panelId]);
    if (!panelIds.length) continue;
    const primary = panelIds[0];
    const colOpts = {
      panel: panelIds.join(","),
      panelIds: panelIds.join(","),
      panelGroup: group,
      accent: getPanelAccent(panelIds),
      scrollMax: panelIds.includes("inbox") || panelIds.includes("habit-today") ? habitRecapColMax : colMax,
      cardMinHeight: panelIds.includes("inbox") || panelIds.includes("habit-today") ? habitRecapColMax : undefined
    };
    const wrap = makeCol(getPanelTitle(primary), getPanelBodyMode(panelIds), (tool) => addToolbarActions(tool, panelIds), colOpts);
    if (panelIds.includes("inbox")) wrap.card.addClass("dashboard-guide-inbox");
    if (panelIds.includes("inbox") || panelIds.includes("habit-today")) {
      wrap.body.style.maxHeight = "none";
      wrap.body.style.overflow = "visible";
    }
    columnWraps.push(wrap);
    bodyEls.push(wrap.body);
    for (const panelId of panelIds) {
      const panelMount = createPanelMount(wrap.body, panelId, panelIds);
      setOverviewPanelState(panelMount, "queued", panelId);
      panelJobs.push({
        panelId,
        panelMount,
        actionsHost: wrap.card.querySelector?.(".dashboard-workbench-panel__tools") || null,
        colInput
      });
    }
  }

  if (!columnWraps.length) {
    const empty = root.createDiv();
    empty.addClass("dashboard-home-widget-empty");
    empty.setText(homeOverviewT("runtime.home.overview.sectionLoadFailed", { section: "Workbench" }));
    return;
  }

  const cardModeStorageSuffix = normalizeOverviewPanelList(input?.panels).join("-") || "card";
  attachLinkedResizer(columnWraps.map((wrap) => wrap.card), {
    storageKey: input?.cardMode === true ? `noria.tray.workbench.${cardModeStorageSuffix}.height` : "noria.tray.workbench.height",
    minHeight: 240,
    maxHeight: 980,
    onResize: () => {
      bodyEls.forEach((body) => {
        body.style.maxHeight = "none";
      });
    }
  });
  void hydrateOverviewPanels(panelJobs).catch((error) => {
    try { console.warn("[noria] home overview panels hydration failed", error); } catch (_) {}
  });
})();
