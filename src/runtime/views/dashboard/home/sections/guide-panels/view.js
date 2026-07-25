(async () => {
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

  const norm = (p) => String(p || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const runtimeBridge = input?.noriaBridge || globalThis.__noriaRuntimeBridge || {};
  function homeRuntimeT(key, params = {}) {
    try {
      if (runtimeBridge && typeof runtimeBridge.t === "function") {
        const direct = runtimeBridge.t(key, params);
        if (direct && direct !== key) return String(direct);
      }
    } catch (_) {}
    try {
      const i18n = runtimeBridge && runtimeBridge.i18n ? runtimeBridge.i18n : null;
      const messages = (i18n && i18n.messages) || {};
      const fallback = (i18n && i18n.fallback) || {};
      const raw = messages[key] || fallback[key] || key;
      return String(raw).replace(/\{([^}]+)\}/g, (_, name) => (params[name] == null ? "" : String(params[name])));
    } catch (_) {
      return String(key || "");
    }
  }
  const projectListPath = String(runtimeBridge.paths?.projectRegistryPath || "Noria/Projects.md");
  const projectsRoot = norm(runtimeBridge.paths?.projectsRoot || "01_Projects").replace(/\/+$/, "");
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const HOME_REFRESH_BUS_KEY = "__noriaHomeRefreshBus";

  function getHomeRefreshBus() {
    const g = globalThis;
    if (g[HOME_REFRESH_BUS_KEY]) return g[HOME_REFRESH_BUS_KEY];
    const listeners = new Map();
    const pending = new Map();
    const bus = {
      on(section, fn) {
        if (!section || typeof fn !== "function") return () => {};
        const set = listeners.get(section) || new Set();
        set.add(fn);
        listeners.set(section, set);
        return () => {
          const cur = listeners.get(section);
          if (!cur) return;
          cur.delete(fn);
          if (cur.size === 0) listeners.delete(section);
        };
      },
      emit(section, delay = 40) {
        if (!section) return;
        const wait = Math.max(0, Number(delay) || 0);
        const old = pending.get(section);
        if (old) clearTimeout(old);
        const t = setTimeout(async () => {
          pending.delete(section);
          const set = listeners.get(section);
          if (!set || set.size === 0) return;
          for (const fn of [...set]) {
            try {
              await fn();
            } catch (_) {}
          }
        }, wait);
        pending.set(section, t);
      }
    };
    g[HOME_REFRESH_BUS_KEY] = bus;
    return bus;
  }

  function createManagerUiKit() {
    const shared = globalThis.dashboardCore?.components?.ui?.managerPanel || globalThis.__noriaManagerUiKit;
    if (shared) return shared;
    const styles = {
      overlay:
        "position:fixed;inset:0;background:rgba(15,23,42,.32);z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px;",
      panel:
    "background:var(--dash-surface,color-mix(in srgb,var(--background-primary) 99%,var(--background-secondary)));border:1px solid color-mix(in srgb,var(--background-modifier-border) 86%,rgba(148,163,184,.14));border-radius:16px;box-shadow:0 8px 24px rgba(15,23,42,.16);",
      input:
    "height:28px;border-radius:8px;border:1px solid rgba(99,102,241,.2);padding:0 8px;background:color-mix(in srgb,var(--background-primary) 92%,var(--background-secondary));color:var(--text-normal);font-size:.82em;outline:none;box-sizing:border-box;",
      btn: {
        neutral:
          "height:26px;padding:0 10px;border-radius:8px;border:1px solid rgba(148,163,184,.24);background:color-mix(in srgb,var(--background-primary) 90%, rgba(241,245,249,.85));color:var(--text-muted);font-size:.75em;font-weight:620;cursor:pointer;",
        primary:
          "height:26px;padding:0 10px;border-radius:8px;border:1px solid rgba(67,56,202,.3);background:color-mix(in srgb,var(--background-primary) 84%, rgba(224,231,255,.92));color:#3730a3;font-size:.75em;font-weight:700;cursor:pointer;",
        danger:
          "height:26px;padding:0 9px;border-radius:8px;border:1px solid rgba(148,163,184,.28);background:color-mix(in srgb,var(--background-primary) 88%, rgba(226,232,240,.9));color:color-mix(in srgb,var(--text-normal) 72%, rgba(71,85,105,.82));font-size:.75em;font-weight:700;cursor:pointer;"
      }
    };
    const mkBtn = (txt, variant = "neutral") => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = txt;
      b.style.cssText = styles.btn[variant] || styles.btn.neutral;
      b.onmouseenter = () => { b.style.filter = "brightness(1.03)"; };
      b.onmouseleave = () => { b.style.filter = ""; };
      b.onfocus = () => { b.style.boxShadow = "0 0 0 2px rgba(99,102,241,.22)"; };
      b.onblur = () => { b.style.boxShadow = ""; };
      return b;
    };
    const enhanceInput = (el) => {
      el.style.cssText = styles.input;
      el.onfocus = () => { el.style.boxShadow = "0 0 0 2px rgba(99,102,241,.16)"; };
      el.onblur = () => { el.style.boxShadow = ""; };
      return el;
    };
    const kit = { styles, mkBtn, enhanceInput };
    globalThis.__noriaManagerUiKit = kit;
    return kit;
  }

  function paintIcon(el, iconId) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
    el.textContent = "";
    try {
      if (typeof setIcon === "function") {
        setIcon(el, iconId);
        if (!el.querySelector || el.querySelector("svg")) return;
      }
    } catch (_) {}
    try {
      const api = globalThis?.obsidian || window?.obsidian || ((typeof window?.require === "function") ? window.require("obsidian") : null);
      if (api && typeof api.setIcon === "function") {
        api.setIcon(el, iconId);
        if (!el.querySelector || el.querySelector("svg")) return;
      }
    } catch (_) {}
    const fn = globalThis.dashboardCore?.utils?.applyLucideIcon;
    if (typeof fn === "function") {
      fn(el, iconId);
      return;
    }
    const fallback = {
      search: "⌕",
      "arrow-up": "↑",
      "arrow-down": "↓",
      "trash-2": "×",
      x: "×"
    };
    el.textContent = fallback[iconId] || "";
  }

  async function openFilePath(path) {
    const p = norm(path);
    const f = app.vault.getAbstractFileByPath(p);
    if (!f) {
      new Notice(homeRuntimeT("runtime.home.notice.missingPath", { path: p }), 4500);
      return;
    }
    await app.workspace.getLeaf(false).openFile(f);
  }

  async function pickVaultPathWithSuggest(initialQuery = "") {
    let obsidian = null;
    try {
      if (typeof require !== "undefined") obsidian = require("obsidian");
    } catch (_) {}
    const FuzzySuggestModal = obsidian?.FuzzySuggestModal;
    if (typeof FuzzySuggestModal !== "function") return "";
    const files = (app.vault.getFiles?.() || []).filter((f) => {
      const p = String(f?.path || "").toLowerCase();
      return p.endsWith(".md") || p.endsWith(".canvas");
    });
    const preferred = normalizePath(initialQuery || "");
    return await new Promise((resolve) => {
      let done = false;
      const finish = (val) => {
        if (done) return;
        done = true;
        resolve(String(val || ""));
      };
      class VaultFileSuggestModal extends FuzzySuggestModal {
        constructor() {
          super(app);
          this.setPlaceholder(homeRuntimeT("runtime.home.moc.pathPicker"));
          if (preferred) this.inputEl.value = preferred;
        }
        getItems() {
          return files;
        }
        getItemText(file) {
          return String(file?.path || "");
        }
        onChooseItem(file) {
          finish(String(file?.path || ""));
        }
        onClose() {
          super.onClose();
          finish("");
        }
      }
      new VaultFileSuggestModal().open();
    });
  }

  function openAddMocPanel(onSaved) {
    const ui = createManagerUiKit();
    const MOC_COLOR_PRESETS = [
      { hex: "#6366f1", label: homeRuntimeT("runtime.home.moc.color.indigo") },
      { hex: "#0ea5e9", label: homeRuntimeT("runtime.home.moc.color.sky") },
      { hex: "#10b981", label: homeRuntimeT("runtime.home.moc.color.teal") },
      { hex: "#f59e0b", label: homeRuntimeT("runtime.home.moc.color.amber") },
      { hex: "#f43f5e", label: homeRuntimeT("runtime.home.moc.color.rose") }
    ];
    const bridge = globalThis.__noriaRuntimeBridge;
    if (!bridge || typeof bridge.getMocEntries !== "function" || typeof bridge.setMocEntries !== "function") {
      new Notice(homeRuntimeT("runtime.home.moc.bridgeNotReady"), 5200);
      return;
    }
    const normalizeMocPath = (v) => String(v || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
    const colorOrEmpty = (v) => /^#([0-9a-fA-F]{6})$/.test(String(v || "").trim()) ? String(v).toLowerCase() : "";
    const iconBtn = (icon, title) => {
      const b = ui.iconButton ? ui.iconButton(icon, title) : document.createElement("button");
      b.type = "button";
      b.setAttribute("title", title);
      b.setAttribute("aria-label", title);
      if (!ui.iconButton) {
        b.style.cssText =
          "width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;padding:0;border-radius:8px;border:1px solid rgba(99,102,241,.18);background:color-mix(in srgb,var(--background-primary) 92%,rgba(99,102,241,.08));color:var(--text-muted);cursor:pointer;";
      }
      paintIcon(b, icon);
      b.onmouseenter = () => {
        if (b.disabled) return;
        b.style.background = "color-mix(in srgb,var(--background-primary) 86%,rgba(99,102,241,.12))";
        b.style.color = "var(--text-normal)";
      };
      b.onmouseleave = () => {
        b.style.background = "color-mix(in srgb,var(--background-primary) 92%,rgba(99,102,241,.08))";
        b.style.color = "var(--text-muted)";
      };
      return b;
    };
    const createPalette = (getColor, setColor) => {
      const palette = document.createElement("div");
      palette.style.cssText =
        "height:28px;display:inline-flex;align-items:center;gap:4px;padding:0 5px;border-radius:8px;border:1px solid rgba(99,102,241,.14);background:color-mix(in srgb,var(--background-primary) 94%,rgba(99,102,241,.04));box-sizing:border-box;";
      const buttons = MOC_COLOR_PRESETS.map((c) => {
        const b = document.createElement("button");
        b.type = "button";
        b.setAttribute("title", c.label);
        b.style.cssText = `width:17px;height:17px;border-radius:999px;border:1px solid rgba(99,102,241,.22);background:${c.hex};padding:0;cursor:pointer;`;
        b.onclick = (ev) => {
          ev.preventDefault();
          setColor(c.hex);
          paint();
        };
        palette.appendChild(b);
        return { btn: b, hex: c.hex };
      });
      const custom = document.createElement("input");
      custom.type = "color";
      custom.style.cssText = "width:18px;height:18px;padding:0;border-radius:999px;border:1px dashed rgba(99,102,241,.4);background:transparent;cursor:pointer;";
      custom.oninput = () => {
        setColor(custom.value);
        paint();
      };
      palette.appendChild(custom);
      const paint = () => {
        const current = colorOrEmpty(getColor()) || MOC_COLOR_PRESETS[0].hex;
        buttons.forEach(({ btn, hex }) => {
          btn.style.boxShadow = hex === current ? "0 0 0 2px rgba(99,102,241,.32)" : "none";
        });
        custom.value = current;
      };
      paint();
      return palette;
    };
    const createPathField = (value, onChange) => {
      const wrap = document.createElement("div");
      wrap.style.cssText = "display:flex;align-items:center;min-width:0;height:30px;border-radius:9px;border:1px solid rgba(99,102,241,.18);background:var(--background-primary);overflow:hidden;";
      const inputEl = document.createElement("input");
      inputEl.type = "text";
      inputEl.value = value || "";
      inputEl.placeholder = homeRuntimeT("runtime.home.moc.pathPlaceholder");
      inputEl.style.cssText = "flex:1 1 auto;min-width:0;height:100%;border:0;background:transparent;color:var(--text-normal);font-size:.82em;padding:0 8px;outline:none;box-sizing:border-box;";
      const pickBtn = document.createElement("button");
      pickBtn.type = "button";
      pickBtn.setAttribute("title", homeRuntimeT("runtime.home.path.choose"));
      pickBtn.setAttribute("aria-label", homeRuntimeT("runtime.home.path.choose"));
      pickBtn.style.cssText = "width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;flex:0 0 30px;padding:0;border:0;border-left:1px solid rgba(99,102,241,.12);background:color-mix(in srgb,var(--background-primary) 90%,rgba(99,102,241,.08));color:var(--text-muted);cursor:pointer;";
      paintIcon(pickBtn, "search");
      inputEl.oninput = () => onChange(inputEl.value);
      inputEl.onkeydown = async (ev) => {
        if ((ev.ctrlKey || ev.metaKey) && String(ev.key || "").toLowerCase() === "k") {
          ev.preventDefault();
          const picked = await pickVaultPathWithSuggest(inputEl.value);
          if (picked) {
            inputEl.value = picked;
            onChange(picked);
          }
        }
      };
      pickBtn.onclick = async () => {
        const picked = await pickVaultPathWithSuggest(inputEl.value);
        if (picked) {
          inputEl.value = picked;
          onChange(picked);
        }
      };
      wrap.append(inputEl, pickBtn);
      return { wrap, inputEl };
    };

    const overlay = document.createElement("div");
    overlay.style.cssText = ui.styles.overlay;
    const panel = document.createElement("div");
    const mocNarrow = window.innerWidth < 720;
    panel.style.cssText =
      `width:min(820px, calc(100vw - 28px));max-height:min(84vh,820px);display:flex;flex-direction:column;padding:14px 15px 12px;${ui.styles.panel}`;
    const head = document.createElement("div");
    head.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 10px 0;";
    const title = document.createElement("div");
    title.textContent = homeRuntimeT("runtime.home.moc.managerTitle");
    title.style.cssText = "font-size:1.01em;font-weight:800;color:var(--text-normal);";
    const closeBtn = iconBtn("x", homeRuntimeT("runtime.common.close"));
    head.append(title, closeBtn);
    const listHead = document.createElement("div");
    listHead.style.cssText = mocNarrow
      ? "display:none;"
      : "display:grid;grid-template-columns:minmax(0,1fr) 132px 66px 38px;gap:8px;padding:0 1px 6px;color:var(--text-muted);font-size:.72em;font-weight:650;letter-spacing:.02em;";
    [homeRuntimeT("runtime.home.moc.path"), homeRuntimeT("runtime.home.moc.color"), homeRuntimeT("runtime.home.moc.sort"), ""].forEach((txt) => {
      const h = document.createElement("div");
      h.textContent = txt;
      if (txt === homeRuntimeT("runtime.home.moc.sort") || !txt) h.style.textAlign = "center";
      listHead.appendChild(h);
    });
    const listWrap = document.createElement("div");
    listWrap.style.cssText = "display:flex;flex-direction:column;gap:0;overflow:auto;max-height:min(56vh,520px);padding-right:2px;min-height:0;";
    let addColor = MOC_COLOR_PRESETS[0].hex;
    let addPath = "";
    const addRow = document.createElement("div");
    addRow.style.cssText = mocNarrow
      ? "display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;margin-top:10px;"
      : "display:grid;grid-template-columns:minmax(0,1fr) 132px 58px;gap:8px;align-items:center;margin-top:10px;";
    const addField = createPathField("", (v) => { addPath = v; });
    const addPalette = createPalette(() => addColor, (v) => { addColor = v; });
    const addBtn = ui.mkBtn(homeRuntimeT("runtime.home.project.add"), "primary");
    addBtn.style.height = "30px";
    if (mocNarrow) {
      addPalette.style.justifySelf = "end";
      addBtn.style.justifySelf = "end";
    }
    addRow.append(addField.wrap, addPalette, addBtn);
    const footer = document.createElement("div");
    footer.style.cssText = "display:flex;justify-content:flex-end;gap:6px;margin-top:10px;";
    const cancelBtn = ui.mkBtn(homeRuntimeT("runtime.common.cancel"), "neutral");
    const saveBtn = ui.mkBtn(homeRuntimeT("runtime.common.save"), "primary");
    footer.append(cancelBtn, saveBtn);
    panel.append(head, listHead, listWrap, addRow, footer);
    overlay.appendChild(panel);

    let entries = [];
    const moveAt = (idx, nextIdx) => {
      if (idx < 0 || nextIdx < 0 || idx >= entries.length || nextIdx >= entries.length || idx === nextIdx) return;
      const [item] = entries.splice(idx, 1);
      entries.splice(nextIdx, 0, item);
      renderRows();
    };
    const renderRows = () => {
      listWrap.innerHTML = "";
      if (!entries.length) {
        const empty = document.createElement("div");
        empty.textContent = homeRuntimeT("runtime.home.moc.empty");
        empty.style.cssText = "font-size:.82em;color:var(--text-muted);padding:7px 2px;";
        listWrap.appendChild(empty);
        return;
      }
      entries.forEach((item, idx) => {
        const row = document.createElement("div");
        row.style.cssText = mocNarrow
          ? "display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px 1px;border-bottom:1px solid color-mix(in srgb,var(--background-modifier-border) 58%, transparent);background:transparent;"
          : "display:grid;grid-template-columns:minmax(0,1fr) 132px 66px 38px;gap:8px;align-items:center;padding:8px 1px;border-bottom:1px solid color-mix(in srgb,var(--background-modifier-border) 58%, transparent);background:transparent;";
        const pathField = createPathField(item.path || "", (v) => { item.path = v; });
        const palette = createPalette(() => item.color || MOC_COLOR_PRESETS[0].hex, (v) => { item.color = v; });
        const sortBox = document.createElement("div");
        sortBox.style.cssText = "display:inline-flex;align-items:center;justify-content:center;gap:5px;";
        const upBtn = iconBtn("arrow-up", homeRuntimeT("runtime.home.moc.moveUp"));
        const downBtn = iconBtn("arrow-down", homeRuntimeT("runtime.home.moc.moveDown"));
        upBtn.disabled = idx === 0;
        downBtn.disabled = idx === entries.length - 1;
        [upBtn, downBtn].forEach((b) => {
          if (!b.disabled) return;
          b.style.opacity = ".38";
          b.style.cursor = "default";
        });
        upBtn.onclick = () => moveAt(idx, idx - 1);
        downBtn.onclick = () => moveAt(idx, idx + 1);
        sortBox.append(upBtn, downBtn);
        const delBtn = iconBtn("trash-2", homeRuntimeT("runtime.common.delete"));
        delBtn.style.color = "color-mix(in srgb,var(--text-normal) 70%,#9f1239)";
        delBtn.onclick = () => {
          entries.splice(idx, 1);
          renderRows();
        };
        row.append(pathField.wrap, palette, sortBox, delBtn);
        listWrap.appendChild(row);
      });
    };
    const close = () => overlay.remove();
    closeBtn.onclick = close;
    overlay.onclick = (ev) => {
      if (ev.target === overlay) close();
    };
    addBtn.onclick = () => {
      const p = normalizeMocPath(addPath);
      if (!p) return;
      if (entries.some((x) => normalizeMocPath(x.path) === p)) {
        new Notice(homeRuntimeT("runtime.home.moc.duplicate"), 2400);
        return;
      }
      entries.push({ path: p, color: colorOrEmpty(addColor) || MOC_COLOR_PRESETS[0].hex });
      addPath = "";
      addField.inputEl.value = "";
      renderRows();
    };
    addField.inputEl.onkeydown = async (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        addBtn.click();
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && String(ev.key || "").toLowerCase() === "k") {
        ev.preventDefault();
        const picked = await pickVaultPathWithSuggest(addField.inputEl.value);
        if (picked) {
          addField.inputEl.value = picked;
          addPath = picked;
        }
      }
    };
    cancelBtn.onclick = close;
    saveBtn.onclick = async () => {
      const normalized = entries
        .map((x) => ({ path: normalizeMocPath(x.path), color: colorOrEmpty(x.color) }))
        .filter((x) => x.path);
      const dedup = [];
      const seen = new Set();
      normalized.forEach((x) => {
        if (seen.has(x.path)) return;
        seen.add(x.path);
        dedup.push(x);
      });
      await bridge.setMocEntries(dedup);
      try { getHomeRefreshBus().emit("moc", 20); } catch (_) {}
      if (typeof onSaved === "function") {
        try {
          await onSaved();
        } catch (_) {}
      }
      new Notice(homeRuntimeT("runtime.home.moc.saved"), 2200);
      close();
    };
    document.body.appendChild(overlay);
    try {
      const loaded = bridge.getMocEntries();
      entries = Array.isArray(loaded) ? loaded.map((x) => ({ path: normalizeMocPath(x.path), color: colorOrEmpty(x.color) })) : [];
    } catch (_) {
      entries = [];
    }
    renderRows();
    setTimeout(() => addField.inputEl.focus(), 0);
  }

  const PROJECT_LIST_PATH = projectListPath;
  const projectsUseChinese = /^zh(?:-|$)/i.test(String(runtimeBridge.locale || runtimeBridge.i18n?.locale || "en"));
  const PROJECT_SECTION_ALIASES = {
    hidden: ["项目隐藏清单", "Hidden projects"],
    active: ["进行中的项目", "Active projects"],
    planned: ["计划中的项目", "Planned projects"],
    done: ["已完成的项目", "Completed projects"]
  };
  const PROJECT_SECTIONS = {
    hidden: PROJECT_SECTION_ALIASES.hidden[projectsUseChinese ? 0 : 1],
    active: PROJECT_SECTION_ALIASES.active[projectsUseChinese ? 0 : 1],
    planned: PROJECT_SECTION_ALIASES.planned[projectsUseChinese ? 0 : 1],
    done: PROJECT_SECTION_ALIASES.done[projectsUseChinese ? 0 : 1]
  };
  const projectSectionAliases = (title) => {
    const raw = String(title || "").trim();
    return Object.values(PROJECT_SECTION_ALIASES).find((group) => group.includes(raw)) || [raw];
  };
  const DEFAULT_PROJECT_FRONT = [
    "---",
    "tags:",
    "  - dashboard",
    "  - projects",
    "  - moc",
    "related:",
    "  - \"[[0_看板-主页]]\"",
    "---"
  ].join("\n");
  const normalizeName = (txt) => String(txt || "").trim();
  const normalizePath = (txt) => String(txt || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  const isPlaceholderName = (name) => {
    const n = normalizeName(name);
    if (!n) return true;
    if (n === "（空）" || n === "(空)" || /^\(?\s*empty\s*\)?$/i.test(n)) return true;
    if (/^[（(]?\s*空\s*[)）]?$/u.test(n)) return true;
    return false;
  };
  const parseProjectItem = (line) => {
    const raw = String(line || "").replace(/^-+\s*/, "").trim();
    const m = raw.match(/^\[\[([^|\]]+)(?:\|([^\]]+))?\]\]$/);
    if (m) {
      const path = normalizePath(m[1] || "");
      const projSeg = path.match(new RegExp(`${projectsRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/([^/]+)`));
      if (projSeg) return { name: normalizeName(projSeg[1]), targetPath: path };
      const alias = normalizeName(m[2] || "");
      if (alias) return { name: alias, targetPath: path };
      return { name: normalizeName(path.split("/").pop()), targetPath: path };
    }
    return { name: normalizeName(raw), targetPath: "" };
  };
  const stripFrontmatter = (text) => {
    const s = String(text || "").trimStart();
    if (!s.startsWith("---")) return { front: "", body: s };
    const end = s.indexOf("\n---", 3);
    if (end === -1) return { front: "", body: s };
    return { front: s.slice(0, end + 4).trimEnd(), body: s.slice(end + 4).replace(/^\s+/, "") };
  };
  const toEntryMap = (items) => {
    const map = new Map();
    (items || []).forEach((item) => {
      const name = normalizeName(item?.name || "");
      if (!name || isPlaceholderName(name)) return;
      map.set(name, { name, targetPath: normalizePath(item?.targetPath || "") });
    });
    return map;
  };
  const getSectionItemMap = (content, title) => {
    let block = "";
    for (const candidate of projectSectionAliases(title)) {
      const escaped = String(candidate || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      block = (String(content || "").match(new RegExp(`##\\s*${escaped}[\\s\\S]*?(?=\\n##\\s|$)`)) || [])[0] || "";
      if (block) break;
    }
    const items = block
      .split("\n")
      .map((x) => x.trim())
      .filter((x) => /^-\s+/.test(x))
      .map(parseProjectItem);
    return toEntryMap(items);
  };
  const cloneRegistry = (reg) => ({
    hidden: new Map(reg.hidden),
    active: new Map(reg.active),
    planned: new Map(reg.planned),
    done: new Map(reg.done)
  });
  const getRegistryEntry = (registry, name) => {
    const n = normalizeName(name);
    return registry.active.get(n) || registry.planned.get(n) || registry.hidden.get(n) || registry.done.get(n) || null;
  };
  const setStageEntry = (registry, stage, entry) => {
    const n = normalizeName(entry?.name || "");
    if (!n) return;
    const payload = { name: n, targetPath: normalizePath(entry?.targetPath || "") };
    registry.hidden.delete(n);
    registry.active.delete(n);
    registry.planned.delete(n);
    registry.done.delete(n);
    if (stage === "hidden") registry.hidden.set(n, payload);
    else if (stage === "done") registry.done.set(n, payload);
    else if (stage === "planned") registry.planned.set(n, payload);
    else registry.active.set(n, payload);
  };
  const parseProjectRegistry = (raw) => {
    const { body } = stripFrontmatter(raw);
    const content = body || raw;
    return {
      hidden: getSectionItemMap(content, PROJECT_SECTIONS.hidden),
      active: getSectionItemMap(content, PROJECT_SECTIONS.active),
      planned: getSectionItemMap(content, PROJECT_SECTIONS.planned),
      done: getSectionItemMap(content, PROJECT_SECTIONS.done)
    };
  };
  const readProjectRegistry = async () => {
    const file = app.vault.getAbstractFileByPath(PROJECT_LIST_PATH);
    const raw = file ? await app.vault.read(file) : "";
    return { file, registry: parseProjectRegistry(raw) };
  };
  const buildProjectBody = (reg) => {
    const rows = (map) => [...(map || new Map()).values()]
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
      .map((x) => {
        const name = normalizeName(x?.name || "");
        if (!name) return "";
        const targetPath = normalizePath(x?.targetPath || "");
        return targetPath ? `- [[${targetPath}|${name}]]` : `- ${name}`;
      })
      .filter(Boolean)
      .join("\n");
    return [
      "# Projects",
      "",
      projectsUseChinese
        ? "> 用于主页看板：分组维护项目；点「+」在项目管理里添加、隐藏或从清单移除。"
        : "> Organize Home projects by stage. Use + to add, hide, or remove projects from the registry.",
      "",
      `## ${PROJECT_SECTIONS.hidden}`,
      "",
      rows(reg.hidden) || (projectsUseChinese ? "- （空）" : "- (empty)"),
      "",
      `## ${PROJECT_SECTIONS.active}`,
      "",
      rows(reg.active) || (projectsUseChinese ? "- （空）" : "- (empty)"),
      "",
      `## ${PROJECT_SECTIONS.planned}`,
      "",
      rows(reg.planned) || (projectsUseChinese ? "- （空）" : "- (empty)"),
      "",
      `## ${PROJECT_SECTIONS.done}`,
      "",
      rows(reg.done) || (projectsUseChinese ? "- （空）" : "- (empty)"),
      ""
    ].join("\n");
  };
  const processProjectRegistry = async (mutator) => {
    let changed = false;
    const apply = (current) => {
      const source = String(current || "");
      const registry = parseProjectRegistry(source);
      const result = typeof mutator === "function" ? mutator(registry) : true;
      if (result === false) return source;
      changed = true;
      const { front } = stripFrontmatter(source);
      const fm = front || DEFAULT_PROJECT_FRONT;
      return `${fm}\n\n${buildProjectBody(registry)}`;
    };

    let file = app.vault.getAbstractFileByPath(PROJECT_LIST_PATH);
    let created = false;
    if (!file) {
      const initial = apply("");
      if (!changed) return false;
      try {
        file = await app.vault.create(PROJECT_LIST_PATH, initial);
        created = true;
      } catch (error) {
        const message = String(error?.message || error || "");
        file = app.vault.getAbstractFileByPath(PROJECT_LIST_PATH);
        if (!file && !/File already exists|already exists/i.test(message)) throw error;
        if (!file) throw error;
      }
    }
    if (!created) {
      if (typeof app.vault.process === "function") {
        await app.vault.process(file, apply);
      } else {
        const current = String(await app.vault.read(file) || "");
        const next = apply(current);
        if (next !== current) await app.vault.modify(file, next);
      }
    }
    if (!changed) return false;
    try { getHomeRefreshBus().emit("projects", 20); } catch (_) {}
    try {
      globalThis.__noriaRuntimeBridge?.refresh?.requestRefresh?.("home", "project-registry-write");
    } catch (_) {}
    return true;
  };
  const appendProjectEntry = async (name, stage) => {
    const n = normalizeName(name);
    if (!n) return { ok: false, reason: "empty" };
    await processProjectRegistry((registry) => {
      const prev = getRegistryEntry(registry, n);
      setStageEntry(registry, stage, { name: n, targetPath: prev?.targetPath || "" });
      return true;
    });
    return { ok: true };
  };
  const updateProjectTargetPath = async (name, targetPath) => {
    const n = normalizeName(name);
    if (!n) return false;
    return processProjectRegistry((registry) => {
      const prev = getRegistryEntry(registry, n);
      if (!prev) return false;
      const stage = registry.active.has(n)
        ? "active"
        : registry.planned.has(n)
          ? "planned"
          : registry.hidden.has(n)
            ? "hidden"
            : "done";
      setStageEntry(registry, stage, { name: n, targetPath });
      return true;
    });
  };
  const hideProjectEntry = async (name) => {
    const n = normalizeName(name);
    if (!n) return false;
    return processProjectRegistry((registry) => {
      if (!registry.active.has(n) && !registry.planned.has(n)) return false;
      const prev = getRegistryEntry(registry, n);
      setStageEntry(registry, "hidden", { name: n, targetPath: prev?.targetPath || "" });
      return true;
    });
  };
  const deleteProjectEntry = async (name) => {
    const n = normalizeName(name);
    if (!n) return false;
    return processProjectRegistry((registry) => {
      if (!getRegistryEntry(registry, n)) return false;
      registry.hidden.delete(n);
      registry.active.delete(n);
      registry.planned.delete(n);
      registry.done.delete(n);
      return true;
    });
  };
  const resumeProjectFromHidden = async (name) => {
    const n = normalizeName(name);
    if (!n) return false;
    return processProjectRegistry((registry) => {
      if (!registry.hidden.has(n)) return false;
      const prev = getRegistryEntry(registry, n);
      setStageEntry(registry, "planned", { name: n, targetPath: prev?.targetPath || "" });
      return true;
    });
  };
  function openManageProjectPanel() {
    const ui = createManagerUiKit();
    const BTN = {
      neutral:
        ui.styles.btn.neutral,
      primary:
        ui.styles.btn.primary,
      warn:
        ui.styles.btn.warn || "height:28px;padding:0 10px;border-radius:9px;border:1px solid transparent;background:color-mix(in srgb,var(--background-primary) 84%, rgba(254,243,199,.9));color:#92400e;font-size:.78em;font-weight:740;cursor:pointer;",
      danger:
        ui.styles.btn.danger,
      info:
        ui.styles.btn.info || "height:28px;padding:0 10px;border-radius:9px;border:1px solid transparent;background:color-mix(in srgb,var(--background-primary) 84%, rgba(219,234,254,.85));color:var(--dash-heading-text,var(--text-normal));font-size:.78em;font-weight:740;cursor:pointer;",
      stageOn:
        ui.styles.btn.stageOn || "height:28px;padding:0 10px;border-radius:9px;border:1px solid rgba(59,130,246,.52);background:rgba(219,234,254,.8);color:var(--dash-heading-text,var(--text-normal));font-size:.78em;font-weight:760;cursor:pointer;",
      stageOff:
        ui.styles.btn.stageOff || "height:28px;padding:0 10px;border-radius:9px;border:1px solid transparent;background:color-mix(in srgb,var(--background-primary) 91%, rgba(148,163,184,.18));color:var(--text-muted);font-size:.78em;font-weight:700;cursor:pointer;"
    };
    const mkPanelBtn = (text, variant = "neutral") => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      b.style.cssText = BTN[variant] || BTN.neutral;
      b.onmouseenter = () => { b.style.filter = "brightness(1.03)"; };
      b.onmouseleave = () => { b.style.filter = ""; };
      b.onfocus = () => { b.style.boxShadow = "0 0 0 2px rgba(99,102,241,.22)"; };
      b.onblur = () => { b.style.boxShadow = ""; };
      return b;
    };
    const createPathPickerField = (value = "") => {
      const wrap = document.createElement("div");
      wrap.style.cssText = "position:relative;display:flex;align-items:center;min-width:0;width:100%;";
      const inputEl = document.createElement("input");
      inputEl.type = "text";
      inputEl.value = normalizePath(value);
      inputEl.placeholder = homeRuntimeT("runtime.home.path.placeholder");
      ui.enhanceInput(inputEl);
      inputEl.style.width = "100%";
      inputEl.style.minWidth = "0";
      inputEl.style.height = "26px";
      inputEl.style.fontSize = ".76em";
      inputEl.style.padding = "0 32px 0 8px";
      const pickBtn = document.createElement("button");
      pickBtn.type = "button";
      pickBtn.setAttribute("aria-label", homeRuntimeT("runtime.home.path.choose"));
      pickBtn.setAttribute("title", homeRuntimeT("runtime.home.path.choose"));
      pickBtn.style.cssText = [
        "position:absolute",
        "right:3px",
        "top:50%",
        "transform:translateY(-50%)",
        "width:22px",
        "height:22px",
        "display:inline-flex",
        "align-items:center",
        "justify-content:center",
        "border:1px solid transparent",
        "border-radius:6px",
        "background:transparent",
        "color:var(--text-muted)",
        "padding:0",
        "cursor:pointer"
      ].join(";");
      paintIcon(pickBtn, "search");
      pickBtn.onmouseenter = () => {
        pickBtn.style.background = "color-mix(in srgb,var(--background-primary) 84%, rgba(59,130,246,.14))";
        pickBtn.style.borderColor = "rgba(59,130,246,.22)";
        pickBtn.style.color = "var(--dash-heading-text,var(--text-normal))";
      };
      pickBtn.onmouseleave = () => {
        pickBtn.style.background = "transparent";
        pickBtn.style.borderColor = "transparent";
        pickBtn.style.color = "var(--text-muted)";
      };
      pickBtn.onfocus = () => { pickBtn.style.boxShadow = "0 0 0 2px rgba(99,102,241,.18)"; };
      pickBtn.onblur = () => { pickBtn.style.boxShadow = ""; };
      pickBtn.onclick = async () => {
        const chosen = await pickVaultPathWithSuggest(inputEl.value);
        if (!chosen) return;
        inputEl.value = chosen;
        inputEl.focus();
      };
      inputEl.addEventListener("keydown", async (ev) => {
        if (ev.key === "k" && (ev.ctrlKey || ev.metaKey)) {
          ev.preventDefault();
          pickBtn.click();
        }
      });
      wrap.append(inputEl, pickBtn);
      return { wrap, input: inputEl, button: pickBtn };
    };
    const overlay = document.createElement("div");
    overlay.style.cssText = ui.styles.overlay;
    const panel = document.createElement("div");
    panel.style.cssText =
      `width:min(760px, calc(100vw - 28px));max-height:min(84vh,820px);padding:14px 15px 12px;display:flex;flex-direction:column;${ui.styles.panel}`;
    overlay.appendChild(panel);
    const head = document.createElement("div");
    head.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 8px 0;";
    const title = document.createElement("div");
    title.textContent = homeRuntimeT("runtime.home.project.managerTitle");
    title.style.cssText = "font-size:1.01em;font-weight:800;color:var(--text-normal);";
    const closeBtn = ui.iconButton ? ui.iconButton("x", homeRuntimeT("runtime.common.close")) : mkPanelBtn("×", "neutral");
    closeBtn.style.width = "28px";
    closeBtn.style.height = "28px";
    closeBtn.style.padding = "0";
    closeBtn.style.lineHeight = "1";
    const close = () => {
      document.removeEventListener("keydown", onEsc, true);
      overlay.remove();
    };
    const onEsc = (ev) => {
      if (ev.key === "Escape") close();
    };
    document.addEventListener("keydown", onEsc, true);
    closeBtn.onclick = close;
    head.append(title, closeBtn);
    panel.appendChild(head);
    const tabs = document.createElement("div");
    tabs.style.cssText = "display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;";
    const listBody = document.createElement("div");
    listBody.style.cssText =
      "display:flex;flex-direction:column;gap:0;max-height:min(56vh,520px);overflow:auto;padding-right:2px;margin-bottom:8px;min-height:0;";
    const makeTabBtn = (txt) => {
      if (ui.button) return ui.button(txt, "stageOff");
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = txt;
      b.style.cssText =
        "height:28px;padding:0 10px;border-radius:9px;border:1px solid rgba(99,102,241,.22);background:color-mix(in srgb,var(--background-primary) 88%, rgba(99,102,241,.08));cursor:pointer;font-size:.8em;color:var(--text-muted);";
      b.onmouseenter = () => { b.style.filter = "brightness(1.03)"; };
      b.onmouseleave = () => { b.style.filter = ""; };
      b.onfocus = () => { b.style.boxShadow = "0 0 0 2px rgba(99,102,241,.2)"; };
      b.onblur = () => { b.style.boxShadow = ""; };
      return b;
    };
    const isNarrowProjectManager = () => window.innerWidth < 760;
    const applyCompactLayout = () => {
      const narrow = isNarrowProjectManager();
      if (narrow) {
        panel.style.width = "min(560px, calc(100vw - 28px))";
        listBody.style.maxHeight = "min(52vh,480px)";
      } else {
        panel.style.width = "min(760px, calc(100vw - 28px))";
        listBody.style.maxHeight = "min(56vh,520px)";
      }
    };
    const tabActive = makeTabBtn(homeRuntimeT("runtime.home.project.active"));
    const tabPlanned = makeTabBtn(homeRuntimeT("runtime.home.project.planned"));
    const tabHidden = makeTabBtn(homeRuntimeT("runtime.home.project.hidden"));
    const tabDone = makeTabBtn(homeRuntimeT("runtime.home.project.done"));
    tabs.append(tabActive, tabPlanned, tabHidden, tabDone);
    panel.append(tabs, listBody);
    let currentTab = "active";
    let regSnapshot = { active: [], planned: [], hidden: [], done: [] };
    const paintTab = (which) => {
      currentTab = which;
      [tabActive, tabPlanned, tabHidden, tabDone].forEach((b) => {
        b.style.cssText = BTN.stageOff;
      });
      const mapBtn = { active: tabActive, planned: tabPlanned, hidden: tabHidden, done: tabDone }[which];
      if (mapBtn) {
        mapBtn.style.cssText = BTN.stageOn;
      }
    };
    const renderList = () => {
      listBody.innerHTML = "";
      const key = currentTab === "active" ? "active"
        : currentTab === "planned" ? "planned"
        : currentTab === "hidden" ? "hidden"
        : "done";
      const list = regSnapshot[key] || [];
      if (!list.length) {
        const empty = document.createElement("div");
        empty.textContent = key === "hidden"
          ? homeRuntimeT("runtime.home.project.hiddenEmpty")
          : key === "done"
            ? homeRuntimeT("runtime.home.project.doneEmpty")
            : homeRuntimeT("runtime.home.project.empty");
        empty.style.cssText = "font-size:.84em;color:var(--text-muted);padding:6px 2px;";
        listBody.appendChild(empty);
        return;
      }
      list.forEach((entry) => {
        const narrow = isNarrowProjectManager();
        const name = normalizeName(entry?.name || "");
        const targetPathRaw = normalizePath(entry?.targetPath || "");
        const row = document.createElement("div");
        row.style.cssText = narrow
          ? "display:flex;flex-direction:column;align-items:stretch;gap:7px;padding:8px 1px;border-bottom:1px solid color-mix(in srgb,var(--background-modifier-border) 58%, transparent);background:transparent;"
          : "display:grid;grid-template-columns:minmax(120px,.34fr) minmax(260px,1fr) auto;gap:8px;align-items:center;padding:8px 1px;border-bottom:1px solid color-mix(in srgb,var(--background-modifier-border) 58%, transparent);background:transparent;";
        const nm = document.createElement("div");
        nm.textContent = name;
        nm.style.cssText = "font-size:.86em;font-weight:620;color:var(--text-normal);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
        const pathField = createPathPickerField(targetPathRaw);
        const pathInput = pathField.input;
        const act = document.createElement("div");
        act.style.cssText = narrow
          ? "display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end;width:100%;"
          : "display:flex;gap:5px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;max-width:220px;";
        const savePath = mkPanelBtn(homeRuntimeT("runtime.home.project.savePath"), "primary");
        savePath.style.height = "25px";
        savePath.style.padding = "0 8px";
        savePath.onclick = async () => {
          const ok = await updateProjectTargetPath(name, pathInput.value);
          if (!ok) {
            new Notice(homeRuntimeT("runtime.home.project.noticeSavePathFailed"), 2200);
            return;
          }
          new Notice(homeRuntimeT("runtime.home.project.noticePathSaved"), 1600);
          await refreshPanel();
        };
        if (key === "hidden") {
          const resumeBtn = mkPanelBtn(homeRuntimeT("runtime.home.project.restore"), "info");
          resumeBtn.style.height = "25px";
          resumeBtn.style.padding = "0 8px";
          resumeBtn.onclick = async () => {
            const ok = await resumeProjectFromHidden(name);
            if (!ok) new Notice(homeRuntimeT("runtime.home.project.noticeRestoreFailed"), 2200);
            else new Notice(homeRuntimeT("runtime.home.project.noticeRestoredToPlanned"), 1800);
            await refreshPanel();
          };
          const delBtn = mkPanelBtn(homeRuntimeT("runtime.home.project.delete"), "danger");
          delBtn.style.height = "25px";
          delBtn.style.padding = "0 8px";
          delBtn.onclick = async () => {
            await deleteProjectEntry(name);
            new Notice(homeRuntimeT("runtime.home.project.noticeRemoved"), 1800);
            await refreshPanel();
          };
          act.append(savePath, resumeBtn, delBtn);
        } else if (key === "done") {
          const resumeBtn = mkPanelBtn(homeRuntimeT("runtime.home.project.restore"), "info");
          resumeBtn.style.height = "25px";
          resumeBtn.style.padding = "0 8px";
          resumeBtn.onclick = async () => {
            const ok = await appendProjectEntry(name, "planned");
            if (!ok?.ok) new Notice(homeRuntimeT("runtime.home.project.noticeRestoreFailed"), 2200);
            else new Notice(homeRuntimeT("runtime.home.project.noticeRestoredToPlanned"), 1800);
            await refreshPanel();
          };
          const delBtn = mkPanelBtn(homeRuntimeT("runtime.home.project.delete"), "danger");
          delBtn.style.height = "25px";
          delBtn.style.padding = "0 8px";
          delBtn.onclick = async () => {
            await deleteProjectEntry(name);
            new Notice(homeRuntimeT("runtime.home.project.noticeRemoved"), 1800);
            await refreshPanel();
          };
          act.append(savePath, resumeBtn, delBtn);
        } else {
          const hideBtn = mkPanelBtn(homeRuntimeT("runtime.home.project.hide"), "warn");
          hideBtn.style.height = "25px";
          hideBtn.style.padding = "0 8px";
          hideBtn.onclick = async () => {
            const ok = await hideProjectEntry(name);
            if (!ok) new Notice(homeRuntimeT("runtime.home.project.noticeActionFailed"), 2200);
            else new Notice(homeRuntimeT("runtime.home.project.noticeMovedToHidden"), 1800);
            await refreshPanel();
          };
          const delBtn = mkPanelBtn(homeRuntimeT("runtime.home.project.delete"), "danger");
          delBtn.style.height = "25px";
          delBtn.style.padding = "0 8px";
          delBtn.onclick = async () => {
            await deleteProjectEntry(name);
            new Notice(homeRuntimeT("runtime.home.project.noticeRemoved"), 1800);
            await refreshPanel();
          };
          act.append(savePath, hideBtn, delBtn);
        }
        row.append(nm, pathField.wrap, act);
        listBody.appendChild(row);
      });
    };
    const refreshPanel = async () => {
      const { registry } = await readProjectRegistry();
      const sortEntries = (map) => [...(map || new Map()).values()]
        .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
      regSnapshot = {
        active: sortEntries(registry.active),
        planned: sortEntries(registry.planned),
        hidden: sortEntries(registry.hidden),
        done: sortEntries(registry.done)
      };
      paintTab(currentTab);
      renderList();
    };
    tabActive.onclick = async () => {
      currentTab = "active";
      await refreshPanel();
    };
    tabPlanned.onclick = async () => {
      currentTab = "planned";
      await refreshPanel();
    };
    tabHidden.onclick = async () => {
      currentTab = "hidden";
      await refreshPanel();
    };
    tabDone.onclick = async () => {
      currentTab = "done";
      await refreshPanel();
    };
    const addBlock = document.createElement("div");
    addBlock.style.cssText =
      "border-top:1px solid color-mix(in srgb,var(--background-modifier-border) 58%, transparent);padding-top:10px;display:flex;flex-direction:column;gap:6px;";
    const addRow = document.createElement("div");
    const addNarrow = isNarrowProjectManager();
    addRow.style.cssText = addNarrow
      ? "display:flex;flex-direction:column;gap:6px;align-items:stretch;"
      : "display:grid;grid-template-columns:minmax(120px,.34fr) minmax(260px,1fr) auto auto;gap:6px;align-items:center;";
    const addInput = document.createElement("input");
    addInput.type = "text";
    addInput.placeholder = homeRuntimeT("runtime.home.project.namePlaceholder");
    ui.enhanceInput(addInput);
    addInput.style.height = "28px";
    addInput.style.width = "100%";
    addInput.style.minWidth = "0";
    const addPathField = createPathPickerField("");
    const addTargetInput = addPathField.input;
    let addStage = "active";
    const stageWrap = document.createElement("div");
    stageWrap.style.cssText = addNarrow
      ? "display:flex;gap:4px;justify-content:flex-start;"
      : "display:flex;gap:4px;justify-content:flex-end;";
    const selActive = document.createElement("button");
    selActive.type = "button";
    selActive.textContent = homeRuntimeT("runtime.home.project.active");
    const selPlanned = document.createElement("button");
    selPlanned.type = "button";
    selPlanned.textContent = homeRuntimeT("runtime.home.project.planned");
    const paintStage = () => {
      if (addStage === "active") {
        selActive.style.cssText = BTN.stageOn;
        selPlanned.style.cssText = BTN.stageOff;
      } else {
        selActive.style.cssText = BTN.stageOff;
        selPlanned.style.cssText = BTN.stageOn;
      }
    };
    selActive.onclick = () => {
      addStage = "active";
      paintStage();
    };
    selPlanned.onclick = () => {
      addStage = "planned";
      paintStage();
    };
    paintStage();
    const addSave = mkPanelBtn(homeRuntimeT("runtime.home.project.add"), "primary");
    addSave.onclick = async () => {
      const r = await appendProjectEntry(addInput.value, addStage);
      if (!r.ok) {
        new Notice(homeRuntimeT("runtime.home.project.noticeInvalidName"), 2000);
        return;
      }
      if (normalizePath(addTargetInput.value)) {
        await updateProjectTargetPath(addInput.value, addTargetInput.value);
      }
      addInput.value = "";
      addTargetInput.value = "";
      new Notice(homeRuntimeT("runtime.home.project.noticeAdded"), 1600);
      await refreshPanel();
    };
    addInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        addSave.click();
      }
    });
    stageWrap.append(selActive, selPlanned);
    if (addNarrow) addSave.style.alignSelf = "flex-end";
    addRow.append(addInput, addPathField.wrap, stageWrap, addSave);
    addBlock.append(addRow);
    panel.appendChild(addBlock);
    overlay.onclick = (ev) => {
      if (ev.target === overlay) close();
    };
    document.body.appendChild(overlay);
    applyCompactLayout();
    refreshPanel();
    setTimeout(() => addInput.focus(), 0);
  }

  function setGuideToolbarActionState(control, state, error = "") {
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

  function bindGuideToolbarAction(control, actionKind, run, opts = {}) {
    const kind = String(actionKind || "guide-toolbar-action");
    control.setAttribute("data-noria-action-source", "home-guide-toolbar");
    control.setAttribute("data-noria-action-kind", kind);
    if (opts?.target) control.setAttribute("data-noria-action-target", String(opts.target));
    setGuideToolbarActionState(control, "idle");
    control.onclick = async (ev) => {
      ev.preventDefault();
      control.disabled = true;
      setGuideToolbarActionState(control, "pending");
      try {
        const result = await run();
        if (result === false) {
          setGuideToolbarActionState(control, "failed", "action returned false");
          return false;
        }
        setGuideToolbarActionState(control, "ok");
        return true;
      } catch (error) {
        const message = String(error?.message || error || "failed");
        setGuideToolbarActionState(control, "failed", message);
        try { runtimeBridge?.runtime?.notice?.("runtime.home.notice.createFailed", { message }, 4500); } catch (_) {}
        return false;
      } finally {
        control.disabled = false;
      }
    };
  }

  /** @param {{ variant?: "governance", actionKind?: string, target?: string }} [opts] governance=琥珀 emphasis，与 Inbox 流水操作（冷紫）区分 */
  function addIconBtn(parent, iconId, tooltip, run, opts = {}) {
    const b = parent.createEl("button");
    b.type = "button";
    b.setAttribute("aria-label", tooltip);
    b.setAttribute("title", tooltip);
    b.addClass("dashboard-guide-icon-btn");
    if (opts?.variant === "governance") b.addClass("dashboard-guide-icon-btn--governance");
    paintIcon(b, iconId);
    bindGuideToolbarAction(b, opts?.actionKind || iconId, run, opts);
    return b;
  }

  /**
   * 导引「+」：与习惯/倒计时列工具栏同款粗体「+」（非 Lucide），改样式见 bootstrap `.dashboard-guide-toolbar-plus`。
   */
  const GUIDE_TOOLBAR_PRIMARY_ADD_ICON = "plus";
  try {
    globalThis.__noriaGuideToolbar = Object.assign({}, globalThis.__noriaGuideToolbar || {}, {
      primaryAddIcon: GUIDE_TOOLBAR_PRIMARY_ADD_ICON,
      primaryAddUseTextPlus: true
    });
  } catch (_) {}
  function addGuidePrimaryAddBtn(parent, tooltip, run, opts = {}) {
    const b = parent.createEl("button");
    b.type = "button";
    b.textContent = "+";
    b.setAttribute("aria-label", tooltip);
    b.setAttribute("title", tooltip);
    b.addClass("dashboard-guide-icon-btn");
    b.addClass("dashboard-guide-toolbar-plus");
    bindGuideToolbarAction(b, opts?.actionKind || "guide-primary-add", run, opts);
    return b;
  }

  function attachLinkedResizer(cards, options) {
    const targets = Array.isArray(cards) ? cards.filter(Boolean) : [];
    if (targets.length === 0) return;
    const key = String(options?.storageKey || "");
    const minH = Number(options?.minHeight || 160);
    const maxH = Number(options?.maxHeight || 760);
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
      handle.setAttr("title", homeRuntimeT("runtime.home.overview.trayResize"));
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
    ctx.paragraph(homeRuntimeT("runtime.home.noContainer"));
    return;
  }
  const themeHome = globalThis.dashboardCore?.theme?.home?.overview || {};
  const guideMax = themeHome.guidePanelScrollMax || "min(36vh, 320px)";
  const sectionMode = ["projects", "moc", "review"].includes(String(input?.sectionMode || ""))
    ? String(input.sectionMode)
    : "all";
  const showProjects = sectionMode === "all" || sectionMode === "projects";
  const showMoc = sectionMode === "all" || sectionMode === "moc";
  const showReview = sectionMode === "all" || sectionMode === "review";

  const wrap = container.createDiv();
  wrap.addClass("dashboard-guide-panels-stack");
  wrap.setAttribute("data-noria-guide-section-mode", sectionMode);
  /* gap 内联：不依赖 .dashboard-home-root 祖先，避免落在其它容器时间距为 0 */
  /* 略加大与 MOC 的纵向分离，避免 chip 行紧贴 Inbox/项目卡底 */
  wrap.style.cssText = "display:flex;flex-direction:column;gap:16px;width:100%;min-width:0;";
  const root = showProjects ? wrap.createDiv() : null;
  if (root) root.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:stretch;";
  const w = container?.clientWidth || 0;
  if (root && w > 0 && w < 1100) root.style.gridTemplateColumns = "1fr";

  const makePanel = (title, renderToolbar) => {
    const card = root.createDiv();
    card.addClass("dashboard-guide-card");
    card.style.cssText = `padding:12px 13px 13px;border-radius:12px;min-width:0;min-height:min(32vh,300px);display:flex;flex-direction:column;max-height:${guideMax};`;

    const headRow = card.createDiv();
    headRow.addClass("dashboard-guide-card__head");
    headRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;flex-shrink:0;margin-bottom:8px;min-height:30px;";
    const titleEl = headRow.createDiv();
    titleEl.addClass("dashboard-guide-card__title");
    const titleDot = titleEl.createEl("span");
    titleDot.addClass("dashboard-guide-card__title-dot");
    titleDot.setAttr("aria-hidden", "true");
    titleEl.createEl("span", { text: title, cls: "dashboard-guide-card__title-text" });
    if (renderToolbar) {
      const tool = headRow.createDiv();
      tool.addClass("dashboard-guide-card__tools");
      tool.style.cssText = "display:flex;align-items:center;gap:3px;flex-shrink:0;";
      renderToolbar(tool);
    }

    const body = card.createDiv();
    body.addClass("dashboard-guide-card__body");
    body.style.cssText = "min-width:0;flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;";
    return { card, body };
  };

  if (showProjects) {
  const projectPanel = makePanel(homeRuntimeT("runtime.home.project.title"), (tool) => {
    addIconBtn(tool, "folder-kanban", homeRuntimeT("runtime.home.project.openRegistry"), () => openFilePath(projectListPath), { actionKind: "open-project-registry", target: projectListPath });
    addGuidePrimaryAddBtn(tool, homeRuntimeT("runtime.home.project.manage"), () => openManageProjectPanel(), { actionKind: "manage-projects", target: projectsRoot });
  });
  projectPanel.card.addClass("dashboard-guide-projects");
  projectPanel.card.style.gridColumn = "1 / -1";
  let projectRenderSeq = 0;
  const rerenderProjectPanel = async () => {
    const seq = ++projectRenderSeq;
    projectPanel.body.empty?.();
    const loading = projectPanel.body.createDiv?.({ text: homeRuntimeT("runtime.home.project.loading") });
    if (loading) {
      loading.style.cssText = "padding:8px 10px;color:var(--text-muted);font-size:.86em;";
    }
    try {
      await runCustomViewByPath(".obsidian/plugins/noria/views/periodic/dashboardGuideProjects", { mount: projectPanel.body, noriaBridge: runtimeBridge });
      if (seq !== projectRenderSeq) return;
      try { loading?.remove?.(); } catch (_) {}
    } catch (err) {
      if (seq !== projectRenderSeq) return;
      projectPanel.body.empty?.();
      const msg = projectPanel.body.createDiv?.({ text: homeRuntimeT("runtime.home.project.refreshLater") });
      if (msg) {
        msg.style.cssText = "padding:8px 10px;border-radius:10px;color:var(--text-muted);font-size:.86em;background:color-mix(in srgb,var(--background-primary) 94%,rgba(99,102,241,.08));border:1px dashed color-mix(in srgb,var(--background-modifier-border) 80%,rgba(99,102,241,.18));";
      }
      try { console.warn("[noria] guide project panel render skipped", err); } catch (_) {}
    }
  };
  await rerenderProjectPanel();
  try {
    const unsubscribe = getHomeRefreshBus().on("projects", rerenderProjectPanel);
    if (typeof input?.registerCleanup === "function" && typeof unsubscribe === "function") input.registerCleanup(unsubscribe);
  } catch (_) {}

  attachLinkedResizer([projectPanel.card].filter(Boolean), {
    storageKey: "noria.tray.guide.entries.height",
    minHeight: 160,
    maxHeight: 760,
    onResize: () => {
      projectPanel.body.style.maxHeight = "none";
    }
  });
  }

  if (showMoc) {
  const mocPanel = wrap.createDiv();
  /* MOC 仅一行 chip 导航：不再套「导引白卡」，避免与分区底色双重视觉托盘；高度仍可拖拽（dashboard-moc-host） */
  mocPanel.addClass("dashboard-moc-host");
  mocPanel.style.cssText = `min-width:0;min-height:56px;display:flex;flex-direction:column;max-height:${guideMax};position:relative;padding:0 0 var(--dash-home-section-gap);overflow:visible;`;
  const mocBody = mocPanel.createDiv();
  mocBody.style.cssText = "min-width:0;flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;padding-bottom:6px;";
  const rerenderMocStrip = async () => {
    mocBody.empty?.();
    await runCustomViewByPath(".obsidian/plugins/noria/views/dashboard/home/sections/moc-chips", {
      mount: mocBody,
      onAddMoc: () => openAddMocPanel(rerenderMocStrip),
      bareStrip: true
    });
  };
  await rerenderMocStrip();
  try {
    const unsubscribe = getHomeRefreshBus().on("moc", rerenderMocStrip);
    if (typeof input?.registerCleanup === "function" && typeof unsubscribe === "function") input.registerCleanup(unsubscribe);
  } catch (_) {}

  attachLinkedResizer([mocPanel], {
    storageKey: "noria.tray.guide.moc.chips.height",
    minHeight: 56,
    maxHeight: 320,
    onResize: () => { mocBody.style.maxHeight = "none"; }
  });
  }

  if (showReview && (sectionMode === "review" || runtimeBridge?.homeSettings?.guidePanels?.reviewCenter !== false)) {
    const reviewPanel = wrap.createDiv();
    reviewPanel.addClass("dashboard-review-center-host");
    reviewPanel.setAttribute("data-noria-review-focus", "closed");
    const card = reviewPanel.createEl("button", {
      cls: "dashboard-review-center-card dashboard-review-center-open",
      type: "button"
    });
    card.setAttribute("data-noria-review-home-summary", "1");
    card.setAttribute("aria-expanded", "false");
    card.setAttribute("hidden", "true");
    const summary = card.createEl("span", { cls: "dashboard-review-center-summary" });
    const marker = summary.createEl("span", { cls: "dashboard-review-center-marker" });
    marker.setAttribute("aria-hidden", "true");
    const summaryCopy = summary.createEl("span", { cls: "dashboard-review-center-summary-copy" });
    const titleRow = summaryCopy.createEl("span", { cls: "dashboard-review-center-title-row" });
    titleRow.createEl("span", { cls: "dashboard-review-center-summary-title", text: homeRuntimeT("review.title") });
    const meta = titleRow.createEl("span", { cls: "dashboard-review-center-meta" });
    meta.createSpan({ text: homeRuntimeT("review.home.diary", { date: "" }) });
    const actionRow = card.createEl("span", { cls: "dashboard-review-center-action-row" });
    const toggleLabel = actionRow.createEl("span", { cls: "dashboard-review-center-toggle-label" });
    const chevron = actionRow.createEl("span", { cls: "dashboard-review-center-chevron", text: "⌄" });
    chevron.setAttribute("aria-hidden", "true");
    const openButton = card;
    const setReviewToggleState = (expanded) => {
      const isExpanded = expanded === true;
      openButton.setAttribute("aria-expanded", isExpanded ? "true" : "false");
      toggleLabel.setText(homeRuntimeT(isExpanded ? "review.home.collapse" : "review.home.open"));
    };
    setReviewToggleState(false);
    const focusPanel = reviewPanel.createDiv({ cls: "dashboard-review-focus-panel" });
    const focusHead = focusPanel.createDiv({ cls: "dashboard-review-focus-head" });
    focusHead.setAttribute("hidden", "true");
    const controlsHost = focusHead.createDiv({ cls: "dashboard-review-focus-controls" });
    const focusBody = focusPanel.createDiv({ cls: "dashboard-review-focus-body" });
    let reviewRenderer = null;
    let reviewRendererPromise = null;
    let focusRenderSeq = 0;
    let defaultReviewFocusSeq = 0;
    function nowHomeReviewFocusMs() {
      try {
        const perf = globalThis?.performance || window?.performance;
        if (perf && typeof perf.now === "function") return Math.round(perf.now());
      } catch (_) {}
      return Date.now();
    }
    function setHomeReviewFocusDiagnostics(state, detail = {}) {
      const nextState = String(state || "idle");
      const targets = [reviewPanel, focusBody].filter(Boolean);
      const phaseAttributes = {
        modelMs: "data-noria-review-focus-model-ms",
        renderMs: "data-noria-review-focus-render-ms",
        evidenceMs: "data-noria-review-focus-evidence-ms",
        tasksMs: "data-noria-review-focus-tasks-ms",
        gitMs: "data-noria-review-focus-git-ms",
        statsMs: "data-noria-review-focus-stats-ms",
        excerptsMs: "data-noria-review-focus-excerpts-ms"
      };
      targets.forEach((target) => {
        target.setAttribute("data-noria-review-focus-state", nextState);
        if (detail.source) target.setAttribute("data-noria-review-focus-source", String(detail.source));
        if (Number.isFinite(Number(detail.startedAt))) target.setAttribute("data-noria-review-focus-started-at", String(Math.round(Number(detail.startedAt))));
        if (Number.isFinite(Number(detail.mountedAt))) target.setAttribute("data-noria-review-focus-mounted-at", String(Math.round(Number(detail.mountedAt))));
        if (Number.isFinite(Number(detail.mountMs))) target.setAttribute("data-noria-review-focus-mount-ms", String(Math.max(0, Math.round(Number(detail.mountMs)))));
        Object.entries(phaseAttributes).forEach(([key, attribute]) => {
          if (Number.isFinite(Number(detail[key]))) target.setAttribute(attribute, String(Math.max(0, Number(detail[key]))));
          else if (nextState === "ready" || nextState === "error") target.removeAttribute?.(attribute);
        });
        if (detail.error) target.setAttribute("data-noria-review-focus-error", String(detail.error));
        else if (nextState !== "error") target.removeAttribute?.("data-noria-review-focus-error");
      });
    }
    const nextReviewFocusFrame = () => new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      if (typeof setTimeout === "function") setTimeout(finish, 120);
      const frame =
        typeof requestAnimationFrame === "function"
          ? requestAnimationFrame
          : (typeof window?.requestAnimationFrame === "function" ? window.requestAnimationFrame.bind(window) : null);
      if (frame) {
        try {
          frame(finish);
          return;
        } catch (_) {}
      }
      if (typeof setTimeout === "function") setTimeout(finish, 0);
      else finish();
    });
    const nextReviewFocusIdle = () => new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      if (typeof setTimeout === "function") setTimeout(finish, 1000);
      const idle =
        typeof requestIdleCallback === "function"
          ? requestIdleCallback
          : (typeof window?.requestIdleCallback === "function" ? window.requestIdleCallback.bind(window) : null);
      if (idle) {
        try {
          idle(finish, { timeout: 900 });
          return;
        } catch (_) {}
      }
      if (typeof setTimeout === "function") setTimeout(finish, 120);
      else finish();
    });
    const renderReviewFocusFallback = (state, detail = "") => {
      focusBody.empty?.();
      focusBody.setAttribute("data-noria-review-focus-state", state || "error");
      const fallback = focusBody.createDiv({ cls: "dashboard-review-focus-fallback" });
      const stateRow = fallback.createDiv({ cls: "dashboard-review-focus-fallback-state" });
      stateRow.createSpan({
        cls: "dashboard-review-focus-fallback-state-title",
        text: homeRuntimeT("review.home.focusError")
      });
      stateRow.createSpan({
        cls: "dashboard-review-focus-fallback-state-hint",
        text: homeRuntimeT("review.home.fallback.errorHint")
      });
      if (detail) stateRow.title = String(detail);
      const stages = [
        {
          key: "evidence",
          title: "review.home.fallback.evidence.title",
          body: "review.home.fallback.evidence.body"
        },
        {
          key: "draft",
          title: "review.home.fallback.draft.title",
          body: "review.home.fallback.draft.body"
        },
        {
          key: "final",
          title: "review.home.fallback.final.title",
          body: "review.home.fallback.final.body"
        }
      ];
      const stageGrid = fallback.createDiv({ cls: "dashboard-review-focus-fallback-stages" });
      stages.forEach((stage, index) => {
        const row = stageGrid.createDiv({ cls: "dashboard-review-focus-fallback-stage" });
        row.setAttribute("data-noria-review-stage", stage.key);
        row.createSpan({ cls: "dashboard-review-focus-fallback-index", text: String(index + 1) });
        const copy = row.createSpan({ cls: "dashboard-review-focus-fallback-copy" });
        copy.createSpan({ cls: "dashboard-review-focus-fallback-title", text: homeRuntimeT(stage.title) });
        copy.createSpan({ cls: "dashboard-review-focus-fallback-body", text: homeRuntimeT(stage.body) });
      });
    };
    const ensureHomeReviewRenderer = () => {
      if (reviewRendererPromise) return reviewRendererPromise;
      reviewRendererPromise = (async () => {
        if (typeof runtimeBridge.renderReviewCenter !== "function") throw new Error("renderReviewCenter bridge missing");
        const renderer = await runtimeBridge.renderReviewCenter(focusBody, {
          expanded: false,
          mode: "home-focus"
        });
        reviewRenderer = renderer;
        return renderer;
      })().catch((error) => {
        reviewRendererPromise = null;
        throw error;
      });
      return reviewRendererPromise;
    };
    const clearHomeReviewRenderer = (options = {}) => {
      defaultReviewFocusSeq++;
      focusRenderSeq++;
      try { reviewRenderer?.unload?.(); } catch (_) {}
      reviewRenderer = null;
      reviewRendererPromise = null;
      controlsHost.empty?.();
      focusBody.empty?.();
      focusBody.removeAttribute?.("data-noria-review-focus-state");
      focusBody.removeAttribute?.("data-noria-review-focus-error");
      if (options.hide !== false) {
        focusPanel.setAttribute("hidden", "true");
        reviewPanel.setAttribute("data-noria-review-focus", "closed");
        setHomeReviewFocusDiagnostics("closed");
        setReviewToggleState(false);
      }
      openButton.disabled = false;
    };
    const collapseReviewFocusPanel = async () => {
      await reviewRenderer?.setExpanded?.(false);
      reviewPanel.setAttribute("data-noria-review-focus", "closed");
      setHomeReviewFocusDiagnostics("closed");
    };
    const mountHomeReviewFocusPanel = async (seq, request = {}, loading = null) => {
      try {
        await nextReviewFocusFrame();
        if (seq !== focusRenderSeq) return;
        const startedAt = Number(request?.__startedAt || nowHomeReviewFocusMs());
        const source = String(request?.__source || request?.source || "manual");
        setHomeReviewFocusDiagnostics("loading", { source, startedAt });
        const nextRenderer = await ensureHomeReviewRenderer();
        const mountedAt = nowHomeReviewFocusMs();
        if (seq !== focusRenderSeq) return;
        reviewRenderer = nextRenderer;
        const requestedSelection = request?.selection || (
          request?.activePeriod || request?.mode || request?.selectedDate || request?.date || request?.period || request?.yearlyVariant || request?.variant
            ? {
              mode: request?.activePeriod || request?.mode || "daily",
              anchorDate: request?.selectedDate || request?.date || undefined,
              period: request?.period,
              yearlyVariant: request?.yearlyVariant || request?.variant
            }
            : null
        );
        if (requestedSelection) await reviewRenderer?.setSelection?.(requestedSelection);
        await reviewRenderer?.setExpanded?.(true);
        try { loading.remove?.(); } catch (_) {}
        const reviewPerformance = nextRenderer?.performance || {};
        setHomeReviewFocusDiagnostics("ready", {
          source,
          startedAt,
          mountedAt,
          mountMs: mountedAt - startedAt,
          modelMs: reviewPerformance.modelMs,
          renderMs: reviewPerformance.renderMs,
          evidenceMs: reviewPerformance.evidenceMs,
          tasksMs: reviewPerformance.tasksMs,
          gitMs: reviewPerformance.gitMs,
          statsMs: reviewPerformance.statsMs,
          excerptsMs: reviewPerformance.excerptsMs
        });
      } catch (err) {
        if (seq !== focusRenderSeq) return;
        const startedAt = Number(request?.__startedAt || nowHomeReviewFocusMs());
        const failedAt = nowHomeReviewFocusMs();
        const message = String(err?.message || err || "");
        controlsHost.empty?.();
        setHomeReviewFocusDiagnostics("error", {
          source: String(request?.__source || request?.source || "manual"),
          startedAt,
          mountedAt: failedAt,
          mountMs: failedAt - startedAt,
          error: message
        });
        renderReviewFocusFallback("error", message);
      }
    };
    const renderHomeReviewFocusPanel = (request = {}) => {
      defaultReviewFocusSeq++;
      const seq = ++focusRenderSeq;
      reviewPanel.setAttribute("data-noria-review-focus", "open");
      focusPanel.removeAttribute("hidden");
      setReviewToggleState(true);
      openButton.disabled = false;
      controlsHost.empty?.();
      const startedAt = nowHomeReviewFocusMs();
      const source = String(request?.source || "manual");
      setHomeReviewFocusDiagnostics("opening", { source, startedAt });
      void mountHomeReviewFocusPanel(seq, { ...(request || {}), __source: source, __startedAt: startedAt }, null);
    };
    const openHomeReviewFocusPanel = async (request = {}) => {
      renderHomeReviewFocusPanel(request || {});
      try { focusPanel.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (_) {}
    };
    const scheduleDefaultReviewFocusOpen = (request = {}) => {
      const scheduleSeq = ++defaultReviewFocusSeq;
      const startedAt = nowHomeReviewFocusMs();
      const source = String(request?.source || "home-default");
      setHomeReviewFocusDiagnostics("scheduled", { source, startedAt });
      void (async () => {
        await nextReviewFocusIdle();
        if (scheduleSeq !== defaultReviewFocusSeq) return;
        if (!reviewPanel.isConnected) return;
        if (reviewPanel.getAttribute("data-noria-review-focus") !== "closed") return;
        await openHomeReviewFocusPanel({ ...(request || {}), source: "home-default" });
      })();
    };
    openButton.addEventListener("click", async (ev) => {
      ev.preventDefault();
      if (reviewPanel.getAttribute("data-noria-review-focus") === "open") {
        await collapseReviewFocusPanel();
        return;
      }
      await openHomeReviewFocusPanel({});
    });
    try {
      const homeHost = container.closest?.(".noria-home-host") || container.closest?.(".noria-itemview-host") || container;
      if (homeHost) {
        homeHost.__noriaOpenReviewFocusPanel = openHomeReviewFocusPanel;
        if (typeof input?.registerCleanup === "function") {
          input.registerCleanup(() => {
            if (homeHost.__noriaOpenReviewFocusPanel === openHomeReviewFocusPanel) delete homeHost.__noriaOpenReviewFocusPanel;
          });
        }
      }
    } catch (_) {}
    if (typeof input?.registerCleanup === "function") {
      input.registerCleanup(() => clearHomeReviewRenderer({ hide: true }));
    }
    void ensureHomeReviewRenderer().catch((error) => {
      const message = String(error?.message || error || "");
      setHomeReviewFocusDiagnostics("error", { error: message });
      renderReviewFocusFallback("error", message);
    });
    const defaultExpanded = typeof input?.defaultExpanded === "boolean"
      ? input.defaultExpanded
      : runtimeBridge?.homeSettings?.guidePanels?.reviewCenterExpanded === true;
    const defaultReviewFocusRequest = defaultExpanded
      ? { source: "home-default" }
      : null;
    const pendingReviewFocus = typeof runtimeBridge.consumeHomeReviewFocusRequest === "function"
      ? runtimeBridge.consumeHomeReviewFocusRequest()
      : null;
    if (pendingReviewFocus) void openHomeReviewFocusPanel(pendingReviewFocus);
    else if (defaultReviewFocusRequest) scheduleDefaultReviewFocusOpen(defaultReviewFocusRequest);
  }
})();
