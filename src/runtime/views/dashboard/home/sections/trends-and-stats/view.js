const root = input?.mount || ((typeof this !== "undefined" && this && this.container) ? this.container : (ctx.container || null));
const noriaTrendsBridge = input?.noriaBridge || globalThis.__noriaRuntimeBridge || {};
const trendsT = (key, params = {}, fallback = key) => {
  try {
    if (typeof noriaTrendsBridge.t === "function") return noriaTrendsBridge.t(key, params);
  } catch (_) {}
  return String(fallback).replace(/\{(\w+)\}/g, (_, name) => String(params?.[name] ?? ""));
};
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

function hashViewSource(value) {
  const text = String(value || "");
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}

function getTrendsViewRuntimeBuildId() {
  return String(input?.noriaBridge?.runtimeBuildId || globalThis.__noriaRuntimeBridge?.runtimeBuildId || "");
}

function getTrendsViewSourceState() {
  const runtimeBuildId = getTrendsViewRuntimeBuildId();
  try {
    const g = globalThis;
    if (!g.__noriaHomeTrendsSourceState || g.__noriaHomeTrendsSourceState.runtimeBuildId !== runtimeBuildId) {
      g.__noriaHomeTrendsSourceState = {
        runtimeBuildId,
        sourceTextCache: new Map(),
        sourceTextPending: new Map()
      };
    }
    return g.__noriaHomeTrendsSourceState;
  } catch (_) {
    return {
      runtimeBuildId,
      sourceTextCache: new Map(),
      sourceTextPending: new Map()
    };
  }
}

async function loadCachedViewSource(path) {
  const normalized = String(path || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const perf = input?.noriaBridge?.performance || globalThis.__noriaRuntimeBridge?.performance || {};
  if (perf.viewSourceCache === false) return loadText(normalized);
  const state = getTrendsViewSourceState();
  if (state.sourceTextCache.has(normalized)) return state.sourceTextCache.get(normalized);
  if (state.sourceTextPending.has(normalized)) return await state.sourceTextPending.get(normalized);
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

const TRENDS_CHART_CORE_FILES = [
  ".obsidian/plugins/noria/views/dashboard/core/components/charts/chart-palette.js",
  ".obsidian/plugins/noria/views/dashboard/core/components/charts/leader-donut-chart.js",
  ".obsidian/plugins/noria/views/dashboard/core/components/charts/year-heatmap-calendar.js"
];

async function ensureTrendsChartCoreLoaded() {
  const runtimeBuildId = getTrendsViewRuntimeBuildId();
  const state = (() => {
    try {
      const key = "__noria_home_trends_chart_core_boot_v1";
      const buildKey = "__noria_home_trends_chart_core_boot_build_v1";
      if (globalThis[buildKey] !== runtimeBuildId) {
        globalThis[key] = { loaded: new Set() };
        globalThis[buildKey] = runtimeBuildId;
      }
      if (!globalThis[key] || !(globalThis[key].loaded instanceof Set)) {
        globalThis[key] = { loaded: new Set() };
      }
      return globalThis[key];
    } catch (_) {
      return { loaded: new Set() };
    }
  })();
  const missing = TRENDS_CHART_CORE_FILES.filter((filePath) => !state.loaded.has(filePath));
  const sources = await Promise.all(missing.map(async (filePath) => {
    try {
      return { filePath, code: await loadCachedViewSource(filePath) };
    } catch (_) {
      return { filePath, code: "" };
    }
  }));
  for (const item of sources) {
    const filePath = item?.filePath;
    const code = item?.code;
    if (!filePath || state.loaded.has(filePath) || !code) continue;
    try {
      (0, eval)(String(code));
      state.loaded.add(filePath);
    } catch (_) {}
  }
}

function getCachedViewRunner(sourcePath, sourceCode) {
  const perf = input?.noriaBridge?.performance || globalThis.__noriaRuntimeBridge?.performance || {};
  const cacheEnabled = perf.viewSourceCache !== false;
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  if (!cacheEnabled) {
    return new AsyncFunction("ctx", "input", "app", "moment", "window", "document", "globalThis", String(sourceCode));
  }
  const g = globalThis;
  const runtimeBuildId = getTrendsViewRuntimeBuildId();
  if (!g.__noriaHomeTrendsRunCache || g.__noriaHomeTrendsRunCacheBuildId !== runtimeBuildId) {
    g.__noriaHomeTrendsRunCache = new Map();
    g.__noriaHomeTrendsRunCacheBuildId = runtimeBuildId;
  }
  const cache = g.__noriaHomeTrendsRunCache;
  const key = `${sourcePath}:${hashViewSource(sourceCode)}`;
  let run = cache.get(key);
  if (!run) {
    run = new AsyncFunction("ctx", "input", "app", "moment", "window", "document", "globalThis", String(sourceCode));
    cache.set(key, run);
    if (cache.size > 48) {
      const firstKey = cache.keys().next().value;
      if (firstKey) cache.delete(firstKey);
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
  let sourceCode = "";
  for (const candidate of candidates) {
    sourceCode = await loadCachedViewSource(candidate);
    if (sourceCode) {
      sourcePath = candidate;
      break;
    }
  }
  if (!sourceCode) throw new Error(trendsT("runtime.home.trends.customViewFailed", { path: normalized }, "Custom view failed to load: {path}"));
  const run = getCachedViewRunner(sourcePath, sourceCode);
  await run(ctx, viewInput || {}, app, window.moment, window, document, globalThis);
}
const DEFAULT_TOP_BLOCKS = ["note-trend", "task-trend"];
const DEFAULT_MIDDLE_BLOCKS = ["habit-history", "heatmaps"];
const DEFAULT_BOTTOM_BLOCKS = ["tag-distribution", "daily-state"];
const ALLOWED_BLOCK_IDS = new Set([
  "note-trend",
  "task-trend",
  "habit-history",
  "heatmaps",
  "tag-distribution",
  "daily-state"
]);
const BLOCK_VIEW_PATHS = {
  "note-trend": ".obsidian/plugins/noria/views/dashboard/home/sections/trends-and-stats/blocks/note-trend",
  "task-trend": ".obsidian/plugins/noria/views/dashboard/home/sections/trends-and-stats/blocks/task-trend",
  "habit-history": ".obsidian/plugins/noria/views/periodic/dashboardHabitWeek",
  heatmaps: ".obsidian/plugins/noria/views/dashboard/home/sections/trends-and-stats/blocks/heatmaps",
  "tag-distribution": ".obsidian/plugins/noria/views/dashboard/home/sections/trends-and-stats/blocks/tag-distribution",
  "daily-state": ".obsidian/plugins/noria/views/dashboard/home/sections/trends-and-stats/blocks/daily-state"
};
function normalizeBlockId(value) {
  const normalized = String(value || "").trim();
  return ALLOWED_BLOCK_IDS.has(normalized) ? normalized : "";
}
function normalizeBlockList(values, fallback) {
  const source = Array.isArray(values) && values.length ? values : fallback;
  return source.map(normalizeBlockId).filter(Boolean);
}
const RANGE_STORAGE_KEY = "noria.home.trends.range.v2";
const pad2 = (n) => String(n).padStart(2, "0");
const formatDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseDate = (value) => {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setHours(0, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
};
const naturalRange = (mode) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (mode === "last30") {
    const start = new Date(today);
    start.setDate(today.getDate() - 29);
    return { start: formatDate(start), end: formatDate(today) };
  }
  if (mode === "week") {
    const start = new Date(today);
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: formatDate(start), end: formatDate(end) };
  }
  if (mode === "year") {
    return { start: `${today.getFullYear()}-01-01`, end: `${today.getFullYear()}-12-31` };
  }
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return { start: formatDate(start), end: formatDate(end) };
};
function readRangeState() {
  const settingsRange = noriaTrendsBridge?.homeSettings?.trendsRange;
  if (settingsRange && typeof settingsRange === "object" && !Array.isArray(settingsRange)) {
    const mode = ["last30", "week", "month", "year", "custom"].includes(settingsRange.mode) ? settingsRange.mode : "last30";
    const base = mode === "custom" && parseDate(settingsRange.start) && parseDate(settingsRange.end)
      ? { start: settingsRange.start, end: settingsRange.end }
      : naturalRange(mode);
    return {
      mode,
      start: base.start,
      end: base.end,
      yearGranularity: settingsRange.yearGranularity === "month" ? "month" : "week"
    };
  }
  try {
    const bridgeRange = typeof noriaTrendsBridge?.getHomeTrendsRange === "function" ? noriaTrendsBridge.getHomeTrendsRange() : null;
    if (bridgeRange && typeof bridgeRange === "object" && !Array.isArray(bridgeRange)) {
      const mode = ["last30", "week", "month", "year", "custom"].includes(bridgeRange.mode) ? bridgeRange.mode : "last30";
      const base = mode === "custom" && parseDate(bridgeRange.start) && parseDate(bridgeRange.end)
        ? { start: bridgeRange.start, end: bridgeRange.end }
        : naturalRange(mode);
      return {
        mode,
        start: base.start,
        end: base.end,
        yearGranularity: bridgeRange.yearGranularity === "month" ? "month" : "week"
      };
    }
  } catch (_) {}
  try {
    const raw = JSON.parse(localStorage.getItem(RANGE_STORAGE_KEY) || "{}");
    const mode = ["last30", "week", "month", "year", "custom"].includes(raw.mode) ? raw.mode : "last30";
    const base = mode === "custom" && parseDate(raw.start) && parseDate(raw.end)
      ? { start: raw.start, end: raw.end }
      : naturalRange(mode);
    return {
      mode,
      start: base.start,
      end: base.end,
      yearGranularity: raw.yearGranularity === "month" ? "month" : "week"
    };
  } catch (_) {
    return { mode: "last30", ...naturalRange("last30"), yearGranularity: "week" };
  }
}
function saveRangeState(next) {
  try {
    if (noriaTrendsBridge?.homeSettings && typeof noriaTrendsBridge.homeSettings === "object") {
      noriaTrendsBridge.homeSettings.trendsRange = { ...next };
    }
  } catch (_) {}
  try {
    if (typeof noriaTrendsBridge?.saveHomeTrendsRange === "function") {
      const saved = noriaTrendsBridge.saveHomeTrendsRange(next);
      if (saved && typeof saved.then === "function") {
        saved.then((result) => {
          const range = result?.range || result;
          if (range && typeof range === "object" && !Array.isArray(range) && noriaTrendsBridge?.homeSettings) {
            noriaTrendsBridge.homeSettings.trendsRange = { ...range };
          }
        }).catch((e) => {
          try { noriaTrendsBridge?.runtime?.notice?.("runtime.home.action.failed", { label: trendsT("runtime.home.facade.trends", {}, "Trends"), message: String(e?.message || e) }); } catch (_) {}
          try { console.warn("Noria Home trends range save failed", e); } catch (_) {}
        });
      }
      return saved;
    }
  } catch (e) {
    try { console.warn("Noria Home trends range save failed", e); } catch (_) {}
  }
  try { localStorage.setItem(RANGE_STORAGE_KEY, JSON.stringify(next)); } catch (_) {}
  return null;
}

function readSavedCustomRange(fallback) {
  try {
    const settingsRange = noriaTrendsBridge?.homeSettings?.trendsRange;
    if (settingsRange?.mode === "custom" && parseDate(settingsRange.start) && parseDate(settingsRange.end)) {
      return { start: settingsRange.start, end: settingsRange.end };
    }
  } catch (_) {}
  try {
    const bridgeRange = typeof noriaTrendsBridge?.getHomeTrendsRange === "function" ? noriaTrendsBridge.getHomeTrendsRange() : null;
    if (bridgeRange?.mode === "custom" && parseDate(bridgeRange.start) && parseDate(bridgeRange.end)) {
      return { start: bridgeRange.start, end: bridgeRange.end };
    }
  } catch (_) {}
  try {
    const raw = JSON.parse(localStorage.getItem(RANGE_STORAGE_KEY) || "{}");
    if (parseDate(raw.start) && parseDate(raw.end)) {
      return { start: raw.start, end: raw.end };
    }
  } catch (_) {}
  return fallback;
}

function getHomeTrendsRangeBus() {
  const key = "__noriaHomeTrendsRangeBus";
  const current = globalThis[key];
  if (current && typeof current.emit === "function" && typeof current.on === "function") return current;
  const listeners = new Set();
  const bus = {
    emit(rangeContext) {
      listeners.forEach((listener) => {
        try { listener(rangeContext); } catch (_) {}
      });
    },
    on(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
  globalThis[key] = bus;
  return bus;
}

function clearElement(el) {
  if (typeof el?.empty === "function") {
    el.empty();
    return;
  }
  while (el?.firstChild) el.removeChild(el.firstChild);
}

function rangeContextFromState(state) {
  return {
    range: { mode: state.mode, start: state.start, end: state.end },
    granularity: state.mode === "year" ? state.yearGranularity : "day"
  };
}

async function getHomeSnapshot(rangeContext) {
  const dataService = globalThis.dashboardCore?.data?.dataService;
  const factory = typeof dataService?.createDataService === "function" ? dataService.createDataService : null;
  if (factory) {
    const service = factory({ bridge: noriaTrendsBridge, ctx, app, momentApi: window.moment });
    return service.getSnapshot({
      preset: "home",
      range: rangeContext?.range || { mode: "last30" },
      granularity: rangeContext?.granularity || ""
    });
  }
  if (typeof noriaTrendsBridge?.data?.getSnapshot === "function") {
    return noriaTrendsBridge.data.getSnapshot({
      preset: "home",
      range: rangeContext?.range || { mode: "last30" },
      granularity: rangeContext?.granularity || ""
    }, { ctx });
  }
  return null;
}

function setModeButton(button, active) {
  button.classList?.toggle("is-active", active);
  button.style.background = active ? "var(--dash-panel-segment-active-bg, color-mix(in srgb,var(--interactive-accent) 14%,var(--background-primary)))" : "transparent";
  button.style.color = active ? "var(--text-normal)" : "var(--text-muted)";
  button.style.fontWeight = active ? "720" : "650";
  button.setAttribute("aria-pressed", active ? "true" : "false");
}

function findScrollContainer(start) {
  try {
    let cur = start;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      const style = typeof getComputedStyle === "function" ? getComputedStyle(cur) : null;
      const overflow = `${style?.overflowY || ""} ${style?.overflow || ""}`;
      if (/(auto|scroll)/.test(overflow) && cur.scrollHeight > cur.clientHeight) return cur;
      cur = cur.parentElement;
    }
  } catch (_) {}
  try { return document.scrollingElement || document.documentElement; } catch (_) { return null; }
}

async function preserveScrollAnchor(anchorEl, fn) {
  const scrollEl = findScrollContainer(anchorEl);
  let beforeTop = 0;
  try { beforeTop = Number(anchorEl?.getBoundingClientRect?.().top || 0); } catch (_) {}
  const beforeScroll = Number(scrollEl?.scrollTop || 0);
  const result = await fn();
  try {
    const afterTop = Number(anchorEl?.getBoundingClientRect?.().top || 0);
    const delta = afterTop - beforeTop;
    if (scrollEl && Math.abs(delta) > 1) scrollEl.scrollTop = beforeScroll + delta;
  } catch (_) {}
  return result;
}

function createStatsRangeController(parent, onChange) {
  let state = readRangeState();
  const controlsParent = parent || root;
  const controls = controlsParent.createDiv();
  controls.className = "dashboard-home-trends-range-controls";
  controls.style.cssText = "display:flex;align-items:center;justify-content:flex-end;gap:5px;flex-wrap:wrap;margin:0 0 0 auto;min-width:0;";
  const commit = (next) => {
    state = next;
    saveRangeState(state);
    renderControls();
    if (typeof onChange === "function") {
      onChange(rangeContextFromState(state));
    }
  };
  const makeButton = (label, active, onClick) => {
    const btn = controls.createEl("button", { text: label });
    btn.type = "button";
    btn.classList.add("dashboard-heatmap-mode-button", "dashboard-home-trends-range-button");
    btn.style.cssText = "appearance:none;-webkit-appearance:none;min-height:28px;height:28px;padding:0 9px;border:0;border-radius:8px;box-shadow:none;outline:none;font-size:13px;line-height:1;cursor:pointer;white-space:nowrap;letter-spacing:0;";
    setModeButton(btn, active);
    btn.addEventListener("click", onClick);
    return btn;
  };
  const createDateField = (key) => {
    const field = controls.createDiv();
    field.className = "dashboard-home-trends-date-field";
    field.setAttr("role", "button");
    field.setAttr("tabindex", "0");
    field.style.cssText = "position:relative;height:24px;min-width:126px;display:inline-flex;align-items:center;gap:6px;padding:0 8px;border-radius:8px;background:color-mix(in srgb,var(--background-primary) 88%,rgba(99,102,241,.06));color:var(--text-muted);font-size:.82em;line-height:1.4;box-sizing:border-box;cursor:pointer;overflow:hidden;";
    const icon = field.createSpan();
    icon.className = "dashboard-home-trends-date-field__icon";
    icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>';
    icon.style.cssText = "display:inline-flex;align-items:center;justify-content:center;width:14px;min-width:14px;opacity:.78;";
    const label = field.createSpan();
    label.className = "dashboard-home-trends-date-field__label";
    label.style.cssText = "font-variant-numeric:tabular-nums;white-space:nowrap;min-width:0;";
    const inputEl = field.createEl("input");
    inputEl.type = "date";
    inputEl.value = state[key];
    inputEl.setAttr("aria-label", key === "start" ? trendsT("runtime.home.trends.rangeStart", {}, "Start date") : trendsT("runtime.home.trends.rangeEnd", {}, "End date"));
    inputEl.style.cssText = "position:absolute;inset:0;width:100%;height:100%;opacity:0;border:0;padding:0;pointer-events:none;";
    const setLabel = () => {
      label.textContent = String(inputEl.value || state[key] || "").replace(/-/g, "/");
    };
    const openPicker = () => {
      try {
        if (typeof inputEl.showPicker === "function") {
          inputEl.showPicker();
          return;
        }
      } catch (_) {}
      inputEl.focus();
      try { inputEl.click(); } catch (_) {}
    };
    field.addEventListener("click", openPicker);
    field.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        openPicker();
      }
    });
    inputEl.addEventListener("change", () => {
      const next = { ...state, mode: "custom", [key]: inputEl.value };
      state = next;
      saveRangeState(next);
      setLabel();
      if (parseDate(next.start) && parseDate(next.end) && typeof onChange === "function") {
        onChange(rangeContextFromState(next));
      }
    });
    setLabel();
    return field;
  };
  function renderControls() {
    clearElement(controls);
    const modes = [
      ["last30", trendsT("runtime.home.trends.rangeLast30", {}, "Last 30 days")],
      ["week", trendsT("runtime.home.trends.rangeWeek", {}, "Week")],
      ["month", trendsT("runtime.home.trends.rangeMonth", {}, "Month")],
      ["year", trendsT("runtime.home.trends.rangeYear", {}, "Year")],
      ["custom", trendsT("runtime.home.trends.rangeCustom", {}, "Custom")]
    ];
    for (const [mode, label] of modes) {
      makeButton(label, state.mode === mode, () => {
        const nextRange = mode === "custom"
          ? readSavedCustomRange({ start: state.start, end: state.end })
          : naturalRange(mode);
        commit({ ...state, mode, ...nextRange });
      });
    }
    if (state.mode === "year") {
      for (const [granularity, label] of [["week", trendsT("runtime.stats.groupByWeek")], ["month", trendsT("runtime.stats.groupByMonth")]]) {
        makeButton(label, state.yearGranularity === granularity, () => {
          commit({ ...state, yearGranularity: granularity });
        });
      }
    }
    if (state.mode === "custom") {
      for (const key of ["start", "end"]) {
        createDateField(key);
      }
    }
  }
  renderControls();
  return {
    controls,
    getRangeContext: () => rangeContextFromState(state)
  };
}

const renderMode = ["range", "block"].includes(String(input?.renderMode || "")) ? String(input.renderMode) : "legacy";
const controlsHost = renderMode === "legacy" ? (input?.controlsHost || input?.titleActionsHost || null) : null;
if (controlsHost && controlsHost !== root) clearElement(controlsHost);
const contentHost = renderMode === "range" ? null : root.createDiv();
if (contentHost) {
  contentHost.className = "dashboard-home-trends-content";
  contentHost.style.cssText = renderMode === "block"
    ? "width:100%;min-width:0;height:100%;flex:1 1 auto;display:flex;flex-direction:column;"
    : "width:100%;min-width:0;";
}
let renderToken = 0;

const renderFallback = (mount, name, e) => {
  const fallback = mount.createDiv();
  fallback.style.cssText =
    "padding:10px;border-radius:12px;background:color-mix(in srgb,var(--background-primary) 94%,rgba(99,102,241,.06));border:1px dashed color-mix(in srgb,var(--background-modifier-border) 78%,rgba(99,102,241,.22));color:var(--text-muted);font-size:.86em;margin-bottom:8px;";
  fallback.textContent = trendsT("runtime.home.trends.blockFailed", { name }, "Stats block failed to load: {name}");
  try { console.warn("[noria home trends] block failed:", name, e); } catch (_) {}
};

const activeBlockCleanups = new Set();
let trendsDisposed = false;

function runTrendsBlockCleanup(target) {
  const cleanup = target?.__noriaTrendsBlockCleanup;
  if (typeof cleanup !== "function") return;
  try { cleanup(); } catch (_) {}
}

function createTrendsBlockCleanupRegistry(target) {
  const cleanups = [];
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    activeBlockCleanups.delete(cleanup);
    while (cleanups.length) {
      const fn = cleanups.pop();
      try { fn?.(); } catch (_) {}
    }
    try {
      if (target?.__noriaTrendsBlockCleanup === cleanup) delete target.__noriaTrendsBlockCleanup;
    } catch (_) {}
  };
  activeBlockCleanups.add(cleanup);
  return {
    add(fn) {
      if (typeof fn !== "function") return fn;
      if (cleaned || trendsDisposed) {
        try { fn(); } catch (_) {}
      } else {
        cleanups.push(fn);
      }
      return fn;
    },
    cleanup
  };
}

const cleanupAllTrendsBlocks = () => {
  trendsDisposed = true;
  for (const cleanup of Array.from(activeBlockCleanups)) {
    try { cleanup(); } catch (_) {}
  }
  activeBlockCleanups.clear();
};
if (typeof input?.registerCleanup === "function") {
  input.registerCleanup(cleanupAllTrendsBlocks);
}

function createHabitHistoryShell(mount) {
  const shell = mount.createDiv();
  shell.className = "dashboard-home-trends-habit-history";
  shell.style.cssText =
    "height:100%;min-height:188px;width:100%;min-width:0;display:flex;flex-direction:column;gap:8px;padding:12px 13px;border-radius:14px;border:1px solid color-mix(in srgb,var(--background-modifier-border) 74%,rgba(99,102,241,.2));background:transparent;box-shadow:0 1px 0 color-mix(in srgb,var(--background-primary) 86%,white) inset;box-sizing:border-box;";
  const head = shell.createDiv();
  head.className = "dashboard-home-trends-habit-history__head";
  head.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0;";
  const titleWrap = head.createDiv();
  titleWrap.className = "dashboard-home-trends-habit-history__title-wrap";
  titleWrap.style.cssText = "display:flex;align-items:center;gap:7px;min-width:0;";
  const dot = titleWrap.createSpan();
  dot.className = "dashboard-home-trends-habit-history__dot";
  dot.style.cssText = "width:6px;height:6px;border-radius:999px;background:color-mix(in srgb,var(--interactive-accent) 70%,rgba(16,185,129,.45));flex:0 0 auto;";
  const title = titleWrap.createDiv({ text: trendsT("runtime.home.overview.habitsTitle", {}, "Habit check-ins") });
  title.className = "dashboard-home-trends-habit-history__title";
  title.style.cssText = "font-weight:740;font-size:.96em;line-height:1.2;color:var(--text-normal);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
  const actionsHost = head.createDiv();
  actionsHost.className = "dashboard-home-trends-habit-history__tools";
  actionsHost.style.cssText = "display:flex;align-items:center;gap:4px;flex:0 0 auto;";
  const body = shell.createDiv();
  body.className = "dashboard-home-trends-habit-history__body";
  body.style.cssText = "min-width:0;display:flex;flex-direction:column;overflow:visible;";
  return { shell, body, actionsHost };
}

const runBlock = async (name, mount, rangeContext, statsSnapshot, blockCleanup) => {
  try {
    const blockId = normalizeBlockId(name);
    if (!blockId) throw new Error("unsupported stats block");
    const blockViewPath = BLOCK_VIEW_PATHS[blockId];
    if (blockId === "habit-history") {
      const habitShell = createHabitHistoryShell(mount);
      await runCustomViewByPath(blockViewPath, { ...(input || {}), statsRange: rangeContext.range, statsGranularity: rangeContext.granularity, statsSnapshot, mount: habitShell.body, actionsHost: habitShell.actionsHost, registerCleanup: blockCleanup.add });
      return;
    }
    await runCustomViewByPath(blockViewPath, { ...(input || {}), statsRange: rangeContext.range, statsGranularity: rangeContext.granularity, statsSnapshot, mount, registerCleanup: blockCleanup.add });
  } catch (e) {
    renderFallback(mount, name, e);
  }
};

function createBlockSlot(row, name) {
  const blockId = normalizeBlockId(name);
  if (!blockId) return null;
  const slot = row.createDiv();
  slot.className = `dashboard-home-trends-block-slot dashboard-home-trends-block-slot--${blockId}`;
  slot.setAttr("data-noria-trends-slot", blockId);
  slot.style.cssText = "position:relative;width:100%;min-width:0;height:100%;min-height:1px;";
  return { name: blockId, slot };
}

function createTrendsLayout(parent) {
  const hostW = root?.clientWidth || root?.parentElement?.clientWidth || 0;
  const topBlocks = normalizeBlockList(input?.topBlocks, DEFAULT_TOP_BLOCKS);
  const middleBlocks = normalizeBlockList(input?.middleBlocks, DEFAULT_MIDDLE_BLOCKS);
  const bottomBlocks = normalizeBlockList(
    input?.bottomBlocks,
    Array.isArray(input?.lowerBlocks) && input.lowerBlocks.length ? input.lowerBlocks : DEFAULT_BOTTOM_BLOCKS
  );

  const topChartsRow = parent.createDiv();
  topChartsRow.className = "dashboard-home-trends-row dashboard-home-trends-row--top";
  topChartsRow.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:12px;width:100%;margin-bottom:10px;align-items:stretch;";
  if (hostW > 0 && hostW < 1060) topChartsRow.style.gridTemplateColumns = "1fr";

  const middleRow = parent.createDiv();
  middleRow.className = "dashboard-home-trends-row dashboard-home-trends-row--middle";
  middleRow.style.cssText = "display:block;width:100%;margin-bottom:10px;";

  const bottomRow = parent.createDiv();
  bottomRow.className = "dashboard-home-trends-row dashboard-home-trends-row--bottom";
  bottomRow.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:12px;width:100%;align-items:stretch;";
  if (hostW > 0 && hostW < 1060) bottomRow.style.gridTemplateColumns = "1fr";

  const entries = [];
  topBlocks.forEach((name) => entries.push(createBlockSlot(topChartsRow, name)));
  middleBlocks.forEach((name) => entries.push(createBlockSlot(middleRow, name)));
  bottomBlocks.forEach((name) => entries.push(createBlockSlot(bottomRow, name)));
  return { entries };
}

async function renderBlockIntoSlot(name, slot, rangeContext, statsSnapshot, token) {
  if (token !== renderToken || trendsDisposed || !slot) return;
  const hadContent = !!slot.firstChild;
  const measuredHeight = Number(slot.getBoundingClientRect?.().height || slot.offsetHeight || 0);
  if (measuredHeight > 0) slot.style.minHeight = `${Math.ceil(measuredHeight)}px`;
  const blockCleanup = createTrendsBlockCleanupRegistry(slot);
  const stage = slot.createDiv();
  stage.className = "dashboard-home-trends-block-stage";
  stage.style.cssText = hadContent
    ? "position:absolute;inset:0;width:100%;min-width:0;height:100%;visibility:hidden;pointer-events:none;"
    : "width:100%;min-width:0;height:100%;";
  await runBlock(name, stage, rangeContext, statsSnapshot, blockCleanup);
  if (token !== renderToken || trendsDisposed) {
    blockCleanup.cleanup();
    try { stage.remove(); } catch (_) {}
    return;
  }
  stage.style.cssText = "width:100%;min-width:0;height:100%;";
  runTrendsBlockCleanup(slot);
  try {
    slot.replaceChildren(stage);
  } catch (_) {
    clearElement(slot);
    slot.appendChild(stage);
  }
  slot.__noriaTrendsBlockCleanup = blockCleanup.cleanup;
}

if (renderMode === "range") {
  root.addClass?.("dashboard-home-trends-range-root");
  const controller = createStatsRangeController(root, (nextRangeContext) => {
    getHomeTrendsRangeBus().emit(nextRangeContext);
  });
  root.setAttribute?.("data-noria-trends-range-mode", String(controller.getRangeContext()?.range?.mode || "last30"));
  return;
}

const selectedBlockId = normalizeBlockId(input?.block);
const trendsLayout = renderMode === "block"
  ? { entries: [createBlockSlot(contentHost, selectedBlockId)].filter(Boolean) }
  : createTrendsLayout(contentHost);

const renderTrendsContent = async (rangeContext) => {
  const token = ++renderToken;
  const chartCoreReady = ensureTrendsChartCoreLoaded();
  const statsSnapshot = await getHomeSnapshot(rangeContext);
  await chartCoreReady;
  if (token !== renderToken) return;
  for (const { name, slot } of trendsLayout.entries) {
    if (token !== renderToken) return;
    await renderBlockIntoSlot(name, slot, rangeContext, statsSnapshot, token);
  }
};

if (renderMode === "block") {
  root.setAttribute?.("data-noria-trends-block", selectedBlockId);
  await renderTrendsContent(rangeContextFromState(readRangeState()));
  const unsubscribe = getHomeTrendsRangeBus().on((nextRangeContext) => {
    void preserveScrollAnchor(root, () => renderTrendsContent(nextRangeContext));
  });
  if (typeof input?.registerCleanup === "function") input.registerCleanup(unsubscribe);
} else {
  const controller = createStatsRangeController(controlsHost || root, (nextRangeContext) => {
    void preserveScrollAnchor(root, () => renderTrendsContent(nextRangeContext));
  });
  if (!controlsHost && controller.controls?.parentNode === root && contentHost.parentNode === root) {
    root.insertBefore(controller.controls, contentHost);
  }
  await renderTrendsContent(controller.getRangeContext());
}
