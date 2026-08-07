(() => {
  const root = globalThis.dashboardCore || (globalThis.dashboardCore = {});
  root.components = root.components || {};
  root.components.ui = root.components.ui || {};

  const STYLE_ID = "noria-manager-panel-style";

  function managerT(key, params = {}, fallback = key) {
    try {
      const bridge = globalThis.__noriaRuntimeBridge || {};
      if (typeof bridge.t === "function") return bridge.t(key, params);
    } catch (_) {}
    return String(fallback).replace(/\{(\w+)\}/g, (_, name) => String(params?.[name] ?? ""));
  }

  function installStyle() {
    if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .noria-manager-overlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px;
        background: rgba(15, 23, 42, .24);
        backdrop-filter: blur(2px);
        box-sizing: border-box;
      }
      .noria-manager-panel {
        width: min(720px, calc(100vw - 28px));
        max-height: min(84vh, 820px);
        display: flex;
        flex-direction: column;
        min-width: 0;
        overflow: hidden;
        border-radius: 16px;
        border: 1px solid color-mix(in srgb, var(--background-modifier-border) 76%, rgba(99,102,241,.22));
        background: linear-gradient(
          180deg,
          color-mix(in srgb, var(--background-primary) 98%, var(--background-secondary)),
          color-mix(in srgb, var(--background-primary) 99%, rgba(226,232,240,.08))
        );
        box-shadow: 0 16px 36px rgba(15, 23, 42, .22);
        color: var(--text-normal);
        box-sizing: border-box;
      }
      .theme-dark .noria-manager-panel {
        background: linear-gradient(
          180deg,
          color-mix(in srgb, var(--background-primary) 94%, rgba(30,41,59,.36)),
          color-mix(in srgb, var(--background-primary) 98%, rgba(15,23,42,.28))
        );
        box-shadow: 0 18px 44px rgba(0, 0, 0, .42);
      }
      .noria-manager-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 15px 9px;
        flex: 0 0 auto;
      }
      .noria-manager-title {
        font-size: 1.01em;
        line-height: 1.25;
        font-weight: 800;
        letter-spacing: .01em;
        color: var(--text-normal);
      }
      .noria-manager-subtitle {
        margin-top: 5px;
        font-size: .78em;
        line-height: 1.38;
        color: var(--text-muted);
      }
      .noria-manager-body {
        min-width: 0;
        min-height: 0;
        overflow: auto;
        padding: 0 15px 12px;
      }
      .noria-manager-footer {
        display: flex;
        justify-content: flex-end;
        gap: 7px;
        flex-wrap: wrap;
        padding: 10px 15px 14px;
        border-top: 1px solid color-mix(in srgb, var(--background-modifier-border) 62%, transparent);
      }
      .noria-manager-input,
      .noria-manager-select {
        height: 30px;
        min-width: 0;
        border-radius: 9px;
        border: 1px solid color-mix(in srgb, var(--background-modifier-border) 74%, rgba(99,102,241,.18));
        background: color-mix(in srgb, var(--background-primary) 98%, var(--background-secondary));
        color: var(--text-normal);
        padding: 0 9px;
        font-size: .84em;
        outline: none;
        box-sizing: border-box;
      }
      .noria-manager-input:focus,
      .noria-manager-select:focus {
        border-color: color-mix(in srgb, var(--interactive-accent) 48%, var(--background-modifier-border));
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--interactive-accent) 18%, transparent);
      }
      .noria-manager-btn {
        height: 28px;
        padding: 0 11px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        border-radius: 9px;
        border: 1px solid transparent;
        font-size: .78em;
        font-weight: 700;
        line-height: 1;
        cursor: pointer;
        color: var(--text-muted);
        background: color-mix(in srgb, var(--background-primary) 91%, rgba(148,163,184,.18));
        box-shadow: 0 1px 3px rgba(15,23,42,.08);
        transition: background .12s ease, border-color .12s ease, color .12s ease, box-shadow .12s ease, transform .12s ease;
      }
      .noria-manager-btn:hover {
        color: var(--text-normal);
        background: color-mix(in srgb, var(--background-primary) 86%, rgba(99,102,241,.12));
      }
      .noria-manager-btn:focus-visible {
        outline: none;
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--interactive-accent) 22%, transparent);
      }
      .noria-manager-btn.is-primary {
        color: #3730a3;
        background: color-mix(in srgb, var(--background-primary) 80%, rgba(224,231,255,.96));
        border-color: color-mix(in srgb, var(--interactive-accent) 30%, transparent);
      }
      .noria-manager-btn.is-danger {
        color: color-mix(in srgb, var(--text-normal) 70%, #9f1239);
        background: color-mix(in srgb, var(--background-primary) 88%, rgba(226,232,240,.92));
        border-color: color-mix(in srgb, var(--background-modifier-border) 70%, rgba(148,163,184,.24));
      }
      .noria-manager-btn.is-state {
        color: #1e3a8a;
        background: color-mix(in srgb, var(--background-primary) 84%, rgba(219,234,254,.85));
      }
      .noria-manager-btn.is-warn {
        color: #92400e;
        background: color-mix(in srgb, var(--background-primary) 84%, rgba(254,243,199,.9));
      }
      .noria-manager-icon-btn {
        width: 28px;
        height: 28px;
        padding: 0;
        border-radius: 9px;
        flex: 0 0 28px;
      }
      .noria-manager-row {
        display: grid;
        gap: 8px;
        align-items: center;
        padding: 8px 1px;
        border-bottom: 1px solid color-mix(in srgb, var(--background-modifier-border) 58%, transparent);
      }
      .noria-manager-row:hover {
        background: color-mix(in srgb, var(--background-primary) 92%, rgba(99,102,241,.055));
      }
      .noria-manager-muted {
        color: var(--text-muted);
        font-size: .76em;
        line-height: 1.35;
      }
      .noria-manager-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin: 0 0 10px;
      }
      .noria-manager-tabs .noria-manager-btn.is-active {
        color: #1e3a8a;
        background: color-mix(in srgb, var(--background-primary) 76%, rgba(219,234,254,.9));
        border-color: color-mix(in srgb, var(--interactive-accent) 40%, transparent);
      }
      @media (max-width: 640px) {
        .noria-manager-overlay { padding: 12px; align-items: flex-start; }
        .noria-manager-panel { width: calc(100vw - 24px); max-height: calc(100vh - 24px); }
        .noria-manager-head { padding: 12px 12px 8px; }
        .noria-manager-body { padding: 0 12px 10px; }
        .noria-manager-footer { padding: 9px 12px 12px; }
      }
    `;
    document.head.appendChild(style);
  }

  function applyIcon(el, iconId) {
    const fn = root?.utils?.applyLucideIcon;
    if (typeof fn === "function") {
      fn(el, iconId);
      return;
    }
    el.textContent = iconId === "x" ? "×" : "";
  }

  const styles = {
    overlay:
      "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(15,23,42,.24);backdrop-filter:blur(2px);box-sizing:border-box;",
    panel:
      "background:linear-gradient(180deg,color-mix(in srgb,var(--background-primary) 98%, var(--background-secondary)),color-mix(in srgb,var(--background-primary) 99%, rgba(226,232,240,.08)));border:1px solid color-mix(in srgb,var(--background-modifier-border) 76%, rgba(99,102,241,.22));border-radius:16px;box-shadow:0 16px 36px rgba(15,23,42,.22);color:var(--text-normal);box-sizing:border-box;overflow:hidden;",
    input:
      "height:30px;border-radius:9px;border:1px solid color-mix(in srgb,var(--background-modifier-border) 74%, rgba(99,102,241,.18));padding:0 9px;background:color-mix(in srgb,var(--background-primary) 98%, var(--background-secondary));color:var(--text-normal);font-size:.84em;outline:none;box-sizing:border-box;min-width:0;",
    row:
      "display:grid;gap:8px;align-items:center;padding:8px 1px;border-bottom:1px solid color-mix(in srgb,var(--background-modifier-border) 58%, transparent);background:transparent;",
    btn: {
      neutral:
        "height:28px;padding:0 11px;border-radius:9px;border:1px solid transparent;background:color-mix(in srgb,var(--background-primary) 91%, rgba(148,163,184,.18));color:var(--text-muted);font-size:.78em;font-weight:700;cursor:pointer;box-shadow:0 1px 3px rgba(15,23,42,.08);",
      primary:
        "height:28px;padding:0 11px;border-radius:9px;border:1px solid color-mix(in srgb,var(--interactive-accent) 30%, transparent);background:color-mix(in srgb,var(--background-primary) 80%, rgba(224,231,255,.96));color:#3730a3;font-size:.78em;font-weight:760;cursor:pointer;box-shadow:0 1px 3px rgba(15,23,42,.08);",
      danger:
        "height:28px;padding:0 10px;border-radius:9px;border:1px solid color-mix(in srgb,var(--background-modifier-border) 70%, rgba(148,163,184,.24));background:color-mix(in srgb,var(--background-primary) 88%, rgba(226,232,240,.92));color:color-mix(in srgb,var(--text-normal) 70%, #9f1239);font-size:.78em;font-weight:740;cursor:pointer;box-shadow:0 1px 3px rgba(15,23,42,.08);",
      warn:
        "height:28px;padding:0 10px;border-radius:9px;border:1px solid transparent;background:color-mix(in srgb,var(--background-primary) 84%, rgba(254,243,199,.9));color:#92400e;font-size:.78em;font-weight:740;cursor:pointer;box-shadow:0 1px 3px rgba(15,23,42,.08);",
      info:
        "height:28px;padding:0 10px;border-radius:9px;border:1px solid transparent;background:color-mix(in srgb,var(--background-primary) 84%, rgba(219,234,254,.85));color:#1e3a8a;font-size:.78em;font-weight:740;cursor:pointer;box-shadow:0 1px 3px rgba(15,23,42,.08);",
      pause:
        "height:28px;padding:0 10px;border-radius:9px;border:1px solid transparent;background:color-mix(in srgb,var(--background-primary) 84%, rgba(254,243,199,.9));color:#92400e;font-size:.78em;font-weight:740;cursor:pointer;box-shadow:0 1px 3px rgba(15,23,42,.08);",
      success:
        "height:28px;padding:0 10px;border-radius:9px;border:1px solid transparent;background:color-mix(in srgb,var(--background-primary) 82%, rgba(209,250,229,.9));color:#065f46;font-size:.78em;font-weight:740;cursor:pointer;box-shadow:0 1px 3px rgba(15,23,42,.08);",
      state:
        "height:28px;padding:0 10px;border-radius:9px;border:1px solid transparent;background:color-mix(in srgb,var(--background-primary) 84%, rgba(219,234,254,.85));color:#1e3a8a;font-size:.78em;font-weight:740;cursor:pointer;box-shadow:0 1px 3px rgba(15,23,42,.08);",
      stageOn:
        "height:28px;padding:0 10px;border-radius:9px;border:1px solid color-mix(in srgb,var(--interactive-accent) 38%, transparent);background:color-mix(in srgb,var(--background-primary) 76%, rgba(219,234,254,.9));color:#1e3a8a;font-size:.78em;font-weight:780;cursor:pointer;box-shadow:0 1px 3px rgba(15,23,42,.08);",
      stageOff:
        "height:28px;padding:0 10px;border-radius:9px;border:1px solid transparent;background:color-mix(in srgb,var(--background-primary) 91%, rgba(148,163,184,.18));color:var(--text-muted);font-size:.78em;font-weight:700;cursor:pointer;box-shadow:0 1px 3px rgba(15,23,42,.08);"
    }
  };

  function button(text, variant = "neutral") {
    installStyle();
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.className = `noria-manager-btn is-${variant === "primary" ? "primary" : variant === "danger" ? "danger" : variant === "warn" || variant === "pause" ? "warn" : variant === "info" || variant === "state" || variant === "success" ? "state" : "neutral"}`;
    b.style.cssText = styles.btn[variant] || styles.btn.neutral;
    b.onmouseenter = () => { if (!b.disabled) b.style.filter = "brightness(1.03)"; };
    b.onmouseleave = () => { b.style.filter = ""; };
    b.onfocus = () => { b.style.boxShadow = "0 0 0 2px color-mix(in srgb,var(--interactive-accent) 22%, transparent)"; };
    b.onblur = () => { b.style.boxShadow = ""; };
    return b;
  }

  function iconButton(iconId = "x", title = "") {
    const b = button("", "neutral");
    b.classList.add("noria-manager-icon-btn");
    b.style.width = "28px";
    b.style.height = "28px";
    b.style.padding = "0";
    b.setAttribute("aria-label", title || iconId);
    if (title) b.setAttribute("title", title);
    applyIcon(b, iconId);
    return b;
  }

  function enhanceInput(el) {
    installStyle();
    if (!el) return el;
    el.classList?.add(el.tagName === "SELECT" ? "noria-manager-select" : "noria-manager-input");
    el.style.cssText = styles.input;
    el.onfocus = () => { el.style.boxShadow = "0 0 0 2px color-mix(in srgb,var(--interactive-accent) 18%, transparent)"; };
    el.onblur = () => { el.style.boxShadow = ""; };
    return el;
  }

  function input(options = {}) {
    const el = document.createElement(options.select ? "select" : "input");
    if (!options.select) el.type = options.type || "text";
    if (options.placeholder) el.placeholder = options.placeholder;
    if (options.value != null) el.value = String(options.value);
    return enhanceInput(el);
  }

  function fieldGrid(parent, columns, gap = 8) {
    const grid = parent.appendChild(document.createElement("div"));
    grid.style.cssText = `display:grid;grid-template-columns:${columns};gap:${gap}px;align-items:center;min-width:0;`;
    return grid;
  }

  function segmentedTabs(parent, tabs, options = {}) {
    const wrap = parent.appendChild(document.createElement("div"));
    wrap.className = "noria-manager-tabs";
    let current = options.active || tabs?.[0]?.key || "";
    const buttons = new Map();
    const paint = () => {
      buttons.forEach((btn, key) => {
        const on = key === current;
        btn.classList.toggle("is-active", on);
        btn.style.cssText = on ? styles.btn.stageOn : styles.btn.stageOff;
      });
    };
    (tabs || []).forEach((tab) => {
      const btn = button(tab.label || tab.key, "stageOff");
      btn.onclick = () => {
        current = tab.key;
        paint();
        if (typeof options.onChange === "function") options.onChange(tab.key, btn);
      };
      buttons.set(tab.key, btn);
      wrap.appendChild(btn);
    });
    paint();
    return { wrap, buttons, setActive: (key) => { current = key; paint(); }, getActive: () => current };
  }

  function rowList(parent, options = {}) {
    const list = parent.appendChild(document.createElement("div"));
    list.style.cssText = `display:flex;flex-direction:column;gap:${Number(options.gap ?? 0)}px;max-height:${options.maxHeight || "min(56vh,520px)"};overflow:auto;min-width:0;`;
    return list;
  }

  function openPanel(options = {}) {
    installStyle();
    const overlay = document.createElement("div");
    overlay.className = "noria-manager-overlay";
    overlay.style.cssText = styles.overlay;
    const panel = document.createElement("div");
    panel.className = "noria-manager-panel";
    panel.style.width = options.width || (options.size === "sm" ? "min(440px, calc(100vw - 28px))" : options.size === "lg" ? "min(820px, calc(100vw - 28px))" : "min(760px, calc(100vw - 28px))");
    panel.style.maxHeight = options.maxHeight || "min(84vh, 820px)";
    const head = document.createElement("div");
    head.className = "noria-manager-head";
    const titleBox = document.createElement("div");
    titleBox.style.minWidth = "0";
    const title = document.createElement("div");
    title.className = "noria-manager-title";
    title.textContent = options.title || "";
    titleBox.appendChild(title);
    if (options.subtitle) {
      const subtitle = document.createElement("div");
      subtitle.className = "noria-manager-subtitle";
      subtitle.textContent = options.subtitle;
      titleBox.appendChild(subtitle);
    }
    const closeBtn = iconButton("x", managerT("runtime.manager.close", {}, "Close"));
    head.append(titleBox, closeBtn);
    const body = document.createElement("div");
    body.className = "noria-manager-body";
    const footer = document.createElement("div");
    footer.className = "noria-manager-footer";
    if (options.hideFooter) footer.style.display = "none";
    panel.append(head, body, footer);
    overlay.appendChild(panel);
    const close = () => {
      document.removeEventListener("keydown", onEsc, true);
      overlay.remove();
      if (typeof options.onClose === "function") options.onClose();
    };
    const onEsc = (ev) => {
      if (ev.key === "Escape") close();
    };
    closeBtn.onclick = close;
    overlay.onclick = (ev) => {
      if (ev.target === overlay && options.closeOnOverlay !== false) close();
    };
    document.addEventListener("keydown", onEsc, true);
    document.body.appendChild(overlay);
    const api = { overlay, panel, head, body, footer, close, ui: kit };
    if (typeof options.render === "function") options.render(api);
    return api;
  }

  const kit = {
    styles,
    openPanel,
    button,
    mkBtn: button,
    iconButton,
    input,
    enhanceInput,
    fieldGrid,
    segmentedTabs,
    rowList,
    installStyle,
    isNarrow: (width = 640) => (typeof window !== "undefined" ? window.innerWidth : 9999) < width
  };

  root.components.ui.managerPanel = kit;
  globalThis.__noriaManagerUiKit = kit;
})();
