(async () => {
const root = input?.mount || ((typeof this !== "undefined" && this && this.container) ? this.container : (ctx.container || null));
const dailyStateBridge = input?.noriaBridge || globalThis.__noriaRuntimeBridge || {};
const statsSnapshot = input?.statsSnapshot || null;
const dailyStateT = (key, params = {}) => {
  try {
    if (dailyStateBridge && typeof dailyStateBridge.t === "function") return dailyStateBridge.t(key, params);
    const messages = dailyStateBridge?.i18n?.messages || {};
    const fallback = dailyStateBridge?.i18n?.fallback || {};
    let template = messages[key] || fallback[key] || key;
    Object.entries(params || {}).forEach(([k, v]) => {
      template = String(template).replace(new RegExp(`\\{${k}\\}`, "g"), String(v ?? ""));
    });
    return String(template);
  } catch (_) {
    return String(key || "");
  }
};
const dailyStateLabel = (domain, value, fallback = value) => {
  try {
    const fn = dailyStateBridge?.runtime?.displayLabel;
    if (typeof fn === "function") return fn(domain, value, fallback);
  } catch (_) {}
  return fallback == null ? "" : String(fallback);
};
const t = globalThis.dashboardCore?.theme?.home?.trends || {};
const stateCardBg = "transparent";
const stateCardBorder =
  t.stateCardBorder ||
  "1px solid color-mix(in srgb,var(--background-modifier-border) 88%,rgba(99,102,241,.1))";
const stateCardRadius = t.stateCardRadius || "12px";
const STORAGE_KEY = "noria.dailyState.range";
const RANGE_OPTIONS = [14, 30, 60, 90];
const today = new Date();
today.setHours(0, 0, 0, 0);
const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayKey = fmt(today);
const normDate = (name) => (/^\d{8}$/.test(name) ? `${name.slice(0, 4)}-${name.slice(4, 6)}-${name.slice(6, 8)}` : name);
const parseDate = (ds) => {
  const m = String(ds || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setHours(0, 0, 0, 0);
  return d;
};
const addDays = (ds, delta) => {
  const d = parseDate(ds) || new Date(today);
  d.setDate(d.getDate() + Number(delta || 0));
  return fmt(d);
};
const buildDayList = (days, endDate) => {
  const end = parseDate(endDate) || new Date(today);
  const list = [];
  for (let i = Number(days || 30) - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    list.push(fmt(d));
  }
  return list;
};
const usingGlobalRange = !!(input?.statsRange?.start && input?.statsRange?.end);
const dayListFromStatsRange = (range) => {
  const start = parseDate(range?.start);
  const end = parseDate(range?.end);
  const list = [];
  if (!start || !end) return list;
  const cursor = new Date(start);
  while (cursor <= end) {
    list.push(fmt(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return list;
};
const defaultRangeDays = () => {
  const raw = Number(dailyStateBridge?.homeSettings?.defaults?.dailyStateRangeDays);
  return RANGE_OPTIONS.includes(raw) ? raw : 30;
};
const shouldRememberBlockSelections = () => dailyStateBridge?.homeSettings?.defaults?.rememberBlockSelections !== false;
const normalizeStoredState = (raw) => {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const days = RANGE_OPTIONS.includes(Number(source.days)) ? Number(source.days) : defaultRangeDays();
  const endDate = parseDate(source.endDate) ? source.endDate : todayKey;
  return { days, endDate };
};
const safeState = () => {
  if (!shouldRememberBlockSelections()) return { days: defaultRangeDays(), endDate: todayKey };
  try {
    const bridgeState = typeof dailyStateBridge?.getHomeDailyStateRange === "function"
      ? dailyStateBridge.getHomeDailyStateRange()
      : null;
    if (bridgeState && typeof bridgeState === "object" && !Array.isArray(bridgeState)) {
      return normalizeStoredState(bridgeState);
    }
  } catch (_) {}
  try {
    const settingsState = dailyStateBridge?.homeSettings?.dailyStateRange;
    if (settingsState && typeof settingsState === "object" && !Array.isArray(settingsState)) {
      return normalizeStoredState(settingsState);
    }
  } catch (_) {}
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return normalizeStoredState(raw);
  } catch (_) {
    return { days: defaultRangeDays(), endDate: todayKey };
  }
};
const saveState = (state) => {
  if (!shouldRememberBlockSelections()) return null;
  const next = normalizeStoredState(state);
  try {
    if (dailyStateBridge?.homeSettings && typeof dailyStateBridge.homeSettings === "object") {
      dailyStateBridge.homeSettings.dailyStateRange = { ...next };
    }
  } catch (_) {}
  try {
    if (typeof dailyStateBridge?.saveHomeDailyStateRange === "function") {
      const saved = dailyStateBridge.saveHomeDailyStateRange(next);
      if (saved && typeof saved.then === "function") {
        saved.then((result) => {
          const range = result?.range || result;
          if (range && typeof range === "object" && !Array.isArray(range) && dailyStateBridge?.homeSettings) {
            dailyStateBridge.homeSettings.dailyStateRange = { ...normalizeStoredState(range) };
          }
        }).catch((e) => {
          try { console.warn("Noria daily-state range save failed", e); } catch (_) {}
        });
      }
      return saved;
    }
  } catch (e) {
    try { console.warn("Noria daily-state range save failed", e); } catch (_) {}
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (_) {}
  return null;
};
const toPlainArray = (value) => {
  if (dailyStateBridge.runtime && typeof dailyStateBridge.runtime.toArray === "function") return dailyStateBridge.runtime.toArray(value);
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value.array === "function") {
    try {
      return value.array();
    } catch (_) {}
  }
  try {
    return Array.from(value);
  } catch (_) {
    return [];
  }
};
const setDailyStateAttr = (el, name, value = "") => {
  if (!el || !name) return;
  const next = value == null ? "" : String(value);
  if (typeof el.setAttr === "function") el.setAttr(name, next);
  else if (typeof el.setAttribute === "function") el.setAttribute(name, next);
};
const removeDailyStateAttr = (el, name) => {
  try { el?.removeAttribute?.(name); } catch (_) {}
};

/** 兼容旧「### 日态」内联字段；优先使用 diary-day-blocks 的 frontmatter-first 解析。 */
function parseDailyStateFromBody(text) {
  const out = { weather: "", mood: "", energy: "", focus: "" };
  const m = String(text || "").match(/^###\s+日态\s*(?:\r?\n)+([\s\S]*?)(?=^(?:###|##)\s|^```)/m);
  if (!m) return out;
  for (const line of m[1].split(/\r?\n/)) {
    const mm = line.match(/^\s*(?:[-*]\s*)?(weather|mood|energy|focus)\s*::\s*(.+?)\s*$/i);
    if (mm) out[mm[1].toLowerCase()] = String(mm[2] || "").trim();
  }
  return out;
}

const weatherDef = [
  { key: "晴", emoji: "☀️" },
  { key: "暴晒", emoji: "🥵" },
  { key: "多云", emoji: "⛅" },
  { key: "阴", emoji: "☁️" },
  { key: "雨", emoji: "🌧️" },
  { key: "风", emoji: "🌬️" },
  { key: "雪", emoji: "❄️" }
];
const moodDef = [
  { key: "很好", emoji: "😀", score: 5 },
  { key: "稳定", emoji: "🙂", score: 4 },
  { key: "一般", emoji: "😐", score: 3 },
  { key: "偏低", emoji: "😣", score: 2 },
  { key: "很差", emoji: "😫", score: 1 }
];
const focusDef = [
  { key: "很专注", emoji: "🟢", score: 4 },
  { key: "基本专注", emoji: "🟡", score: 3 },
  { key: "易分心", emoji: "🟠", score: 2 },
  { key: "难进入状态", emoji: "🔴", score: 1 }
];
const weatherEmoji = Object.fromEntries(weatherDef.map((x) => [x.key, x.emoji]));
const moodEmoji = Object.fromEntries(moodDef.map((x) => [x.key, x.emoji]));
const focusScoreMap = Object.fromEntries(focusDef.map((x) => [x.key, x.score]));
const focusByScore = Object.fromEntries(focusDef.map((x) => [String(x.score), x.key]));
const cp = globalThis.dashboardCore?.components?.charts?.chartPalette;
const distColor = (domain, key, fallback) =>
  typeof cp?.distColor === "function" ? (cp.distColor(domain, key) || fallback) : fallback;
const weatherColor = (key) => distColor("weather", key, "#9fb7e8");
const moodColor = (key) => distColor("mood", key, "#9eb4e8");

const card = root.createDiv();
card.className = "dashboard-daily-state-card";
card.style.cssText = `padding:9px;border-radius:${stateCardRadius};background:${stateCardBg};border:${stateCardBorder};width:100%;min-width:0;height:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:8px;box-shadow:0 1px 0 color-mix(in srgb,var(--background-primary) 86%,transparent) inset;`;
setDailyStateAttr(card, "data-noria-action-source", "home-daily-state-card");
setDailyStateAttr(card, "data-noria-last-daily-state-action-state", "idle");
setDailyStateAttr(card, "data-noria-last-daily-state-action-error", "");
setDailyStateAttr(card, "data-noria-last-daily-state-action-date", "");
setDailyStateAttr(card, "data-noria-last-daily-state-action-field", "");
setDailyStateAttr(card, "data-noria-last-daily-state-action-value", "");
setDailyStateAttr(card, "data-noria-last-daily-state-action-path", "");
const setDailyStateActionState = (el, stateValue = "idle", error = "") => {
  const nextState = stateValue || "idle";
  setDailyStateAttr(el, "data-noria-action-state", nextState);
  if (nextState === "pending") setDailyStateAttr(el, "aria-busy", "true");
  else setDailyStateAttr(el, "aria-busy", "false");
  if (error) setDailyStateAttr(el, "data-noria-action-error", error);
  else removeDailyStateAttr(el, "data-noria-action-error");
};
const mirrorDailyStateAction = ({ actionState = "idle", date = "", field = "", value = "", path = "", error = "" } = {}) => {
  setDailyStateAttr(card, "data-noria-last-daily-state-action-state", actionState || "idle");
  setDailyStateAttr(card, "data-noria-last-daily-state-action-error", error || "");
  setDailyStateAttr(card, "data-noria-last-daily-state-action-date", date || "");
  setDailyStateAttr(card, "data-noria-last-daily-state-action-field", field || "");
  setDailyStateAttr(card, "data-noria-last-daily-state-action-value", value || "");
  setDailyStateAttr(card, "data-noria-last-daily-state-action-path", path || "");
};
const markDailyStateActionTarget = (el, { source, action, date = "", field = "", value = "" } = {}) => {
  setDailyStateAttr(el, "data-noria-action-source", source || "home-daily-state");
  setDailyStateAttr(el, "data-noria-action-kind", action || "");
  setDailyStateAttr(el, "data-noria-daily-state-date", date || "");
  setDailyStateAttr(el, "data-noria-daily-state-field", field || "");
  setDailyStateAttr(el, "data-noria-daily-state-value", value || "");
  setDailyStateActionState(el, "idle");
};
const head = card.createDiv();
head.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;";
const dailyTitle = head.createDiv({ text: dailyStateT("runtime.home.trends.dailyStateTitle") });
dailyTitle.className = "dashboard-panel-title";
dailyTitle.style.cssText = "font-weight:800;font-size:1.02em;color:var(--dash-title-color,color-mix(in srgb,var(--text-normal) 78%,var(--noria-module-home,var(--interactive-accent)) 22%));letter-spacing:.12px;line-height:1.25;";
const controls = head.createDiv();
controls.className = "dashboard-daily-state-controls";
controls.style.cssText = "display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap;min-width:0;";
const chevronLeftSvg = '<svg class="tc-nav-chevron-svg" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
const chevronRightSvg = '<svg class="tc-nav-chevron-svg" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
const mkBtn = (text, title) => {
  const b = controls.createEl("button", { text });
  b.type = "button";
  b.setAttr("title", title || text);
  b.style.cssText = "height:28px;padding:0 9px;border-radius:8px;border:1px solid color-mix(in srgb,var(--background-modifier-border) 88%,rgba(99,102,241,.14));background:var(--background-primary);color:var(--text-muted);font-size:.78em;font-weight:620;cursor:pointer;";
  return b;
};
const mkNavBtn = (title, svg) => {
  const b = controls.createEl("button");
  b.type = "button";
  b.className = "dashboard-daily-state-nav-btn";
  b.setAttr("title", title);
  b.setAttr("aria-label", title);
  b.innerHTML = svg;
  const restStyle = "width:32px;min-width:32px;height:32px;min-height:32px;padding:0;border:0;border-radius:10px;background:color-mix(in srgb,var(--background-primary) 78%,rgb(248 250 252));color:var(--text-muted);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:none;";
  b.style.cssText = restStyle;
  b.onmouseenter = () => {
    b.style.background = "linear-gradient(180deg,color-mix(in srgb,var(--background-primary) 84%,rgb(239 246 255)),color-mix(in srgb,var(--background-primary) 76%,rgb(224 235 253)))";
    b.style.color = "var(--interactive-accent)";
  };
  b.onmouseleave = () => {
    b.style.cssText = restStyle;
  };
  return b;
};
const prevBtn = mkNavBtn(dailyStateT("runtime.home.trends.previousRange"), chevronLeftSvg);
const rangeWrap = controls.createDiv();
rangeWrap.className = "dashboard-daily-state-range-wrap";
rangeWrap.style.cssText = "position:relative;display:inline-flex;align-items:center;";
const rangeBtn = rangeWrap.createEl("button", { text: `${dailyStateT("runtime.home.trends.days", { count: 30 })} ▾` });
rangeBtn.type = "button";
rangeBtn.className = "dashboard-daily-state-range-button";
rangeBtn.setAttr("title", dailyStateT("runtime.home.trends.rangeToggle"));
rangeBtn.setAttr("aria-haspopup", "listbox");
rangeBtn.setAttr("aria-expanded", "false");
rangeBtn.style.cssText = "height:28px;min-width:62px;padding:0 9px;border-radius:8px;border:1px solid color-mix(in srgb,var(--background-modifier-border) 88%,rgba(99,102,241,.14));background:var(--background-primary);color:var(--text-muted);font-size:.78em;font-weight:650;cursor:pointer;";
const rangeMenu = rangeWrap.createDiv();
rangeMenu.className = "dashboard-daily-state-range-menu";
rangeMenu.setAttr("role", "listbox");
rangeMenu.style.cssText = "position:absolute;right:0;top:32px;z-index:20;display:none;min-width:92px;padding:4px;border-radius:10px;border:1px solid color-mix(in srgb,var(--background-modifier-border) 82%,rgba(99,102,241,.18));background:var(--background-primary);box-shadow:0 8px 24px rgba(15,23,42,.14);";
const rangeOptionBtns = new Map();
let rangeMenuOpen = false;
const closeRangeMenu = () => {
  rangeMenuOpen = false;
  rangeMenu.style.display = "none";
  rangeBtn.setAttr("aria-expanded", "false");
};
const openRangeMenu = () => {
  rangeMenuOpen = true;
  rangeMenu.style.display = "grid";
  rangeMenu.style.gap = "2px";
  rangeBtn.setAttr("aria-expanded", "true");
};
const toggleRangeMenu = () => {
  if (rangeMenuOpen) closeRangeMenu();
  else openRangeMenu();
};
rangeBtn.onclick = (ev) => {
  ev.stopPropagation();
  toggleRangeMenu();
};
rangeMenu.onclick = (ev) => ev.stopPropagation();
const onRangeMenuKeydown = (ev) => {
  if (ev.key === "Escape") closeRangeMenu();
};
document.addEventListener("click", closeRangeMenu);
document.addEventListener("keydown", onRangeMenuKeydown);
for (const days of RANGE_OPTIONS) {
  const b = rangeMenu.createEl("button", { text: dailyStateT("runtime.home.trends.days", { count: days }) });
  b.type = "button";
  b.setAttr("role", "option");
  b.style.cssText = "height:26px;padding:0 8px;border:0;border-radius:7px;background:transparent;color:var(--text-muted);font-size:.78em;font-weight:620;text-align:left;cursor:pointer;";
  rangeOptionBtns.set(days, b);
}
const nextBtn = mkNavBtn(dailyStateT("runtime.home.trends.nextRange"), chevronRightSvg);
const dateSegment = controls.createDiv();
dateSegment.className = "dashboard-daily-state-date-segment";
dateSegment.style.cssText = "height:28px;width:142px;min-width:142px;display:inline-flex;align-items:center;border-radius:8px;border:1px solid color-mix(in srgb,var(--background-modifier-border) 88%,rgba(99,102,241,.14));background:var(--background-primary);box-sizing:border-box;overflow:hidden;";
const datePickBtn = dateSegment.createEl("button");
datePickBtn.type = "button";
datePickBtn.className = "dashboard-daily-state-date-button";
datePickBtn.setAttr("title", dailyStateT("runtime.home.trends.pickEndDate"));
datePickBtn.setAttr("aria-label", dailyStateT("runtime.home.trends.pickEndDate"));
datePickBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>';
datePickBtn.style.cssText = "width:28px;height:26px;min-width:28px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:0;border-right:1px solid color-mix(in srgb,var(--background-modifier-border) 82%,rgba(99,102,241,.12));background:transparent;color:var(--text-muted);cursor:pointer;";
const endInput = dateSegment.createEl("input");
endInput.type = "date";
endInput.className = "dashboard-daily-state-date";
endInput.style.cssText = "height:26px;width:112px;min-width:112px;border:0;background:transparent;color:var(--text-normal);font-size:.78em;font-weight:580;padding:0 7px;box-sizing:border-box;outline:none;";
datePickBtn.onclick = () => {
  try {
    if (typeof endInput.showPicker === "function") {
      endInput.showPicker();
      return;
    }
  } catch (_) {}
  endInput.focus();
  try { endInput.click(); } catch (_) {}
};
const todayBtn = mkBtn(dailyStateT("runtime.home.trends.today"), dailyStateT("runtime.home.trends.today"));
if (usingGlobalRange) {
  try { controls.remove(); } catch (_) {}
}

const stats = card.createDiv();
stats.style.cssText = "display:flex;align-items:center;gap:5px 6px;flex-wrap:wrap;min-height:24px;";
const chartScroller = card.createDiv();
chartScroller.style.cssText = "overflow:hidden;border-radius:10px;border:0;background:transparent;padding:10px 10px 8px;min-width:0;flex:1 1 auto;display:flex;flex-direction:column;justify-content:center;";
let activeStatePicker = null;
const closeStatePicker = () => {
  try { activeStatePicker?.remove?.(); } catch (_) {}
  activeStatePicker = null;
};
const saveStatePatch = async (date, kind, value, options = {}) => {
  const fn = dailyStateBridge?.saveDailyStateForDate;
  if (typeof fn !== "function") return { ok: false, reason: "bridge-missing" };
  return await fn(date, { [kind]: value }, options);
};
const findScrollContainer = () => {
  const candidates = [];
  let cur = root;
  while (cur && cur !== document.body && cur !== document.documentElement) {
    candidates.push(cur);
    cur = cur.parentElement;
  }
  const selectorCandidates = [
    root?.closest?.(".markdown-preview-view"),
    root?.closest?.(".markdown-source-view"),
    root?.closest?.(".workspace-leaf-content"),
    root?.closest?.(".view-content"),
    document.scrollingElement,
    document.documentElement,
    document.body
  ];
  candidates.push(...selectorCandidates.filter(Boolean));
  return candidates.find((el) => Number(el?.scrollHeight || 0) > Number(el?.clientHeight || 0)) || document.scrollingElement || document.documentElement || document.body || null;
};
const captureScrollPosition = () => {
  const el = findScrollContainer();
  return {
    el,
    top: Number(el?.scrollTop || 0),
    left: Number(el?.scrollLeft || 0),
    windowX: Number(window.scrollX || 0),
    windowY: Number(window.scrollY || 0)
  };
};
const restoreScrollPosition = (snapshot) => {
  if (!snapshot) return;
  const apply = () => {
    try {
      if (snapshot.el) {
        snapshot.el.scrollTop = snapshot.top;
        snapshot.el.scrollLeft = snapshot.left;
      }
    } catch (_) {}
    try {
      if (typeof window.scrollTo === "function") window.scrollTo(snapshot.windowX, snapshot.windowY);
    } catch (_) {}
  };
  apply();
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(apply);
  else if (typeof setTimeout === "function") setTimeout(apply, 0);
};
const openStatePicker = (anchor, date, kind, currentValue = "") => {
  if (!anchor || !["mood", "energy", "focus"].includes(kind)) return;
  closeStatePicker();
  const options = kind === "mood"
    ? moodDef.map((x) => ({ value: x.key, label: x.emoji, title: dailyStateLabel("mood", x.key, x.key) }))
    : kind === "energy"
      ? [1, 2, 3, 4, 5].map((x) => ({ value: String(x), label: x === 1 ? "🪫" : "🔋", title: dailyStateT("runtime.periodic.energyValue", { value: x }), energyLevel: String(x) }))
      : focusDef.map((x) => ({ value: x.key, label: x.emoji, title: dailyStateLabel("focus", x.key, x.key) }));
  const menu = document.createElement("div");
  activeStatePicker = menu;
  menu.className = `dashboard-daily-state-picker dashboard-daily-state-picker--${kind}`;
  menu.style.cssText = "position:fixed;left:0;top:0;z-index:9999;display:flex;align-items:center;gap:5px;min-width:0;padding:6px;border-radius:10px;border:1px solid color-mix(in srgb,var(--background-modifier-border) 82%,rgba(99,102,241,.18));background:var(--background-primary);box-shadow:0 10px 28px rgba(15,23,42,.16);visibility:hidden;";
  markDailyStateActionTarget(menu, {
    source: "home-daily-state-picker",
    action: "choose-daily-state",
    date,
    field: kind,
    value: currentValue || ""
  });
  options.forEach((op) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = kind === "energy"
      ? "dashboard-daily-state-picker-button dashboard-daily-state-picker-button--energy"
      : kind === "focus"
        ? "dashboard-daily-state-picker-button dashboard-daily-state-picker-button--focus"
        : "dashboard-daily-state-picker-button dashboard-daily-state-picker-button--mood";
    btn.title = op.title || op.label;
    btn.setAttribute("aria-label", op.title || op.label);
    markDailyStateActionTarget(btn, {
      source: "home-daily-state-picker",
      action: "save-daily-state",
      date,
      field: kind,
      value: op.value
    });
    if (op.energyLevel) btn.setAttribute("data-energy-level", op.energyLevel);
    if (kind === "energy") {
      const icon = document.createElement("span");
      icon.className = "dashboard-recap-energy-icon";
      icon.textContent = op.label;
      icon.setAttribute("aria-hidden", "true");
      btn.appendChild(icon);
    } else {
      btn.textContent = op.label;
    }
    const active = String(currentValue || "") === String(op.value || "");
    if (active) btn.classList.add(kind === "energy" ? "is-on" : "is-active");
    btn.style.cssText = kind === "energy"
      ? "width:30px;height:28px;min-width:30px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:0;box-shadow:none;background:transparent;border-radius:9px;cursor:pointer;"
      : `width:30px;height:28px;min-width:30px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:0;box-shadow:none;background:transparent;border-radius:999px;cursor:pointer;font-size:${kind === "focus" ? "1em" : ".95em"};`;
    btn.onclick = async (ev) => {
      ev.stopPropagation();
      btn.disabled = true;
      setDailyStateActionState(btn, "pending");
      mirrorDailyStateAction({ actionState: "pending", date, field: kind, value: op.value });
      try {
        const scrollSnapshot = captureScrollPosition();
        const result = await saveStatePatch(date, kind, op.value, { refresh: false });
        if (result && result.ok === false) {
          throw new Error(result.reason || result.error || "daily-state-save-failed");
        }
        setDailyStateActionState(btn, "ok");
        mirrorDailyStateAction({ actionState: "ok", date, field: kind, value: op.value, path: result?.path || "" });
        closeStatePicker();
        await renderWindow(state);
        restoreScrollPosition(scrollSnapshot);
      } catch (err) {
        btn.disabled = false;
        const message = err?.message || String(err || "daily-state-save-failed");
        setDailyStateActionState(btn, "failed", message);
        mirrorDailyStateAction({ actionState: "failed", date, field: kind, value: op.value, error: message });
        try { new Notice(dailyStateT("runtime.home.notice.createFailed", { message: err?.message || err }), 4200); } catch (_) {}
      }
    };
    menu.appendChild(btn);
  });
  menu.onclick = (ev) => ev.stopPropagation();
  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect?.() || { left: 0, top: 0, bottom: 0 };
  const menuRect = menu.getBoundingClientRect?.() || { width: 150, height: 48 };
  const viewportWidth = Math.max(0, window.innerWidth || 0);
  const viewportHeight = Math.max(0, window.innerHeight || 0);
  const left = Math.max(8, Math.min(rect.left, viewportWidth - menuRect.width - 8));
  const top = Math.max(8, Math.min(rect.bottom + 6, viewportHeight - menuRect.height - 8));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.visibility = "";
};
const onStatePickerKeydown = (ev) => {
  if (ev.key === "Escape") closeStatePicker();
};
document.addEventListener("click", closeStatePicker);
document.addEventListener("keydown", onStatePickerKeydown);
const cleanupDailyStateMenus = () => {
  closeRangeMenu();
  closeStatePicker();
  document.removeEventListener("click", closeRangeMenu);
  document.removeEventListener("keydown", onRangeMenuKeydown);
  document.removeEventListener("click", closeStatePicker);
  document.removeEventListener("keydown", onStatePickerKeydown);
};
if (typeof input?.registerCleanup === "function") {
  input.registerCleanup(cleanupDailyStateMenus);
}

const setButtonActive = (state) => {
  if (usingGlobalRange) return;
  rangeBtn.textContent = `${dailyStateT("runtime.home.trends.days", { count: state.days })} ▾`;
  rangeOptionBtns.forEach((b, days) => {
    const active = Number(days) === Number(state.days);
    b.setAttr("aria-selected", active ? "true" : "false");
    b.style.background = active ? "color-mix(in srgb,var(--interactive-accent) 13%,var(--background-primary))" : "transparent";
    b.style.color = active ? "var(--text-normal)" : "var(--text-muted)";
    b.style.fontWeight = active ? "740" : "620";
  });
  endInput.value = state.endDate;
  nextBtn.disabled = state.endDate >= todayKey;
  nextBtn.style.opacity = nextBtn.disabled ? ".45" : "";
};

const statPill = (text, toneColor = "", extraStyle = "") => {
  const p = stats.createEl("span", { text });
  p.style.cssText = `display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:999px;border:1px solid color-mix(in srgb,var(--background-modifier-border) 86%,rgba(99,102,241,.12));background:color-mix(in srgb,var(--background-primary) 94%,rgba(99,102,241,.04));font-size:.76em;font-weight:600;color:${toneColor || "var(--text-muted)"};${extraStyle}`;
  return p;
};
const nonZeroAvg = (arr) => {
  const vals = arr.filter((v) => Number(v) > 0);
  if (vals.length === 0) return "0.0";
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
};
const pct = (count, total) => total > 0 ? `${((count / total) * 100).toFixed(1)}%` : "0.0%";
const ENERGY_FILL = "var(--dash-daily-energy-fill, #14b8a6)";
const ENERGY_BORDER = "var(--dash-daily-energy-border, #0f9488)";
const ENERGY_TEXT = "var(--dash-daily-energy-text, color-mix(in srgb,#0f9488 76%,var(--text-normal)))";
const METRIC_FALLBACK = {
  energy: ["#dff7ee", "#c4f0df", "#9ee4ca", "#74d5b4", "#42bd95", "#14916c"]
};
const readMetricVar = (name, fallback) => {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (v) return v;
  } catch (_) {}
  return fallback || "";
};
const valueLevel = (value, maxValue) => {
  const v = Number(value || 0);
  const max = Number(maxValue || 1);
  if (v <= 0) return 0;
  if (max <= 1) return 6;
  return Math.max(1, Math.min(6, Math.round(((v - 1) / (max - 1)) * 5 + 1)));
};
const dailyHeatmapFill = (kind, value, maxValue) => {
  const level = valueLevel(value, maxValue);
  if (!level) return typeof cp?.heatmapEmptyFill === "function" ? cp.heatmapEmptyFill() : "color-mix(in srgb,var(--background-primary) 82%,rgb(226 232 240))";
  const fallback = METRIC_FALLBACK.energy[level - 1];
  if (typeof cp?.heatmapColor === "function") return cp.heatmapColor("habit", level);
  const fromToken = readMetricVar(`--dash-daily-energy-level-${level}`, fallback);
  if (fromToken) return fromToken;
  return ENERGY_FILL;
};
const dailyHeatmapBorder = (kind, value, maxValue) => {
  const level = valueLevel(value, maxValue);
  if (!level) return typeof cp?.heatmapEmptyBorder === "function" ? cp.heatmapEmptyBorder() : "transparent";
  const fill = dailyHeatmapFill(kind, value, maxValue);
  return `color-mix(in srgb,${fill} 72%,var(--background-modifier-border))`;
};
const cellMetrics = (days, width) => {
  const n = Number(days) || 30;
  const w = Math.max(260, Number(width || 0));
  const col = w / n;
  const gap = col < 7 ? 1 : col < 12 ? 2 : 4;
  const box = Math.max(4, Math.min(16, Math.floor(col - gap)));
  const dateEvery = n <= 14 ? 1 : n <= 30 ? (col >= 18 ? 1 : 2) : n <= 60 ? 7 : 14;
  return {
    gap,
    box,
    cellH: Math.max(6, Math.min(14, box)),
    rowGap: col < 8 ? 3 : 5,
    dateEvery,
    showEmoji: col >= 12,
    fontSize: col < 8 ? ".54em" : ".66em"
  };
};
const canonicalDailyPriority = (name) => (/^\d{4}-\d{2}-\d{2}$/.test(String(name || "")) ? 2 : 1);
const pickDailyField = (current, incoming, key) => {
  const currentValue = String(current?.[key] || "").trim();
  const incomingValue = String(incoming?.[key] || "").trim();
  if (!incomingValue) return currentValue;
  if (!currentValue) return incomingValue;
  return Number(incoming?._priority || 0) >= Number(current?._priority || 0) ? incomingValue : currentValue;
};
const mergeDailyState = (current, incoming) => {
  if (!current) return { ...incoming };
  const currentHasEnergy = Number(current._hasEnergy || 0) > 0;
  const incomingHasEnergy = Number(incoming._hasEnergy || 0) > 0;
  const useIncomingEnergy =
    incomingHasEnergy && (!currentHasEnergy || Number(incoming._priority || 0) >= Number(current._energyPriority || current._priority || 0));
  return {
    weather: pickDailyField(current, incoming, "weather"),
    mood: pickDailyField(current, incoming, "mood"),
    focus: pickDailyField(current, incoming, "focus"),
    energy: useIncomingEnergy ? Number(incoming.energy || 0) : Number(current.energy || 0),
    _hasEnergy: useIncomingEnergy ? 1 : (currentHasEnergy ? 1 : 0),
    _energyPriority: useIncomingEnergy ? Number(incoming._priority || 0) : Number(current._energyPriority || current._priority || 0),
    _priority: Math.max(Number(current._priority || 0), Number(incoming._priority || 0))
  };
};

async function runDailyStateDiaryReadQueue(queue, limit = 8) {
  if (!Array.isArray(queue) || queue.length === 0) return;
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (index < queue.length) {
      const job = queue[index++];
      if (typeof job === "function") await job();
    }
  });
  await Promise.all(workers);
}

async function loadWindowState(dayList) {
  const daySet = new Set(dayList);
  const diaryPages = toPlainArray(dailyStateBridge.runtime?.pagesForManagedPath?.("diaryRoot", ctx)).filter((p) => {
    const raw = (p.file.name || "").replace(".md", "");
    const ds = normDate(raw);
    return /^\d{4}-\d{2}-\d{2}$/.test(ds) && daySet.has(ds);
  });
  const stateMap = {};
  const dailyStateDiaryReadJobs = [];
  const dailyStateDiaryRows = [];
  for (const p of toPlainArray(diaryPages)) {
    const raw = (p.file.name || "").replace(".md", "");
    const ds = normDate(raw);
    const row = {
      p,
      raw,
      ds,
      parsed: { weather: "", mood: "", energy: "", focus: "" }
    };
    dailyStateDiaryRows.push(row);
    dailyStateDiaryReadJobs.push(async () => {
      try {
        const rawText = await ctx.io.load(p.file.path);
        const sharedParser = globalThis.dashboardCore?.utils?.diaryDayBlocks?.parseDailyState;
        row.parsed = typeof sharedParser === "function" ? sharedParser(rawText, p) : parseDailyStateFromBody(rawText);
      } catch (_) {}
    });
  }
  await runDailyStateDiaryReadQueue(dailyStateDiaryReadJobs);
  for (const row of dailyStateDiaryRows) {
    const { p, raw, ds } = row;
    const parsed = row.parsed || {};
    const weather = parsed.weather ? String(parsed.weather).trim() : String(p.weather || "").trim();
    const mood = parsed.mood ? String(parsed.mood).trim() : String(p.mood || "").trim();
    const focus = parsed.focus ? String(parsed.focus).trim() : String(p.focus || "").trim();
    const energyRaw = parsed.energy !== "" && parsed.energy != null ? parsed.energy : p.energy;
    const hasEnergy = energyRaw !== "" && energyRaw != null && Number.isFinite(Number(energyRaw));
    const energy = hasEnergy ? Math.max(0, Math.min(5, Number(energyRaw) || 0)) : 0;
    const incoming = {
      weather,
      mood,
      focus,
      energy,
      _hasEnergy: hasEnergy ? 1 : 0,
      _energyPriority: canonicalDailyPriority(raw),
      _priority: canonicalDailyPriority(raw)
    };
    stateMap[ds] = mergeDailyState(stateMap[ds], incoming);
  }
  return stateMap;
}

async function renderWindow(state) {
  if (!usingGlobalRange) {
    setButtonActive(state);
    saveState(state);
  }
  stats.empty();
  chartScroller.empty();
  const dayList = Array.isArray(state.dayList) && state.dayList.length
    ? state.dayList
    : buildDayList(state.days, state.endDate);
  const denominator = Math.max(1, dayList.length);
  const stateMap = await loadWindowState(dayList);
  const weatherCount = Object.fromEntries(weatherDef.map((x) => [x.key, 0]));
  const moodCount = Object.fromEntries(moodDef.map((x) => [x.key, 0]));
  const energySeries = [];
  const focusSeries = [];
  let validDays = 0;
  for (const ds of dayList) {
    const st = stateMap[ds] || {};
    if (weatherCount[st.weather] != null) weatherCount[st.weather] += 1;
    if (moodCount[st.mood] != null) moodCount[st.mood] += 1;
    const energy = Number(st.energy) || 0;
    const focus = Number(focusScoreMap[st.focus] || 0);
    if (st.weather || st.mood || energy || focus) validDays += 1;
    energySeries.push(energy);
    focusSeries.push(focus);
  }
  const energyAvg = nonZeroAvg(energySeries);
  const focusAvg = nonZeroAvg(focusSeries);
  statPill(`${dailyStateT("runtime.home.trends.validDays")} ${validDays}`);
  statPill(`${dailyStateT("runtime.home.trends.averageEnergy")} ${energyAvg}`);
  statPill(`${dailyStateT("runtime.home.trends.averageFocus")} ${focusAvg}`);
  weatherDef.forEach((d) => {
    const n = Number(weatherCount[d.key] || 0);
    if (n > 0) statPill(`${d.emoji} ${dailyStateLabel("weather", d.key, d.key)} ${pct(n, denominator)}`);
  });
  let firstMood = true;
  moodDef.forEach((d) => {
    const n = Number(moodCount[d.key] || 0);
    if (n > 0) {
      statPill(`${d.emoji} ${dailyStateLabel("mood", d.key, d.key)} ${pct(n, denominator)}`, "", firstMood ? "margin-left:8px;" : "");
      firstMood = false;
    }
  });

  const scrollerWidth = chartScroller.getBoundingClientRect?.().width || chartScroller.clientWidth || 0;
  const metrics = cellMetrics(dayList.length, scrollerWidth - 20);
  const chartArea = chartScroller.createDiv();
  chartArea.style.cssText = "display:grid;grid-template-columns:minmax(54px,auto) minmax(0,1fr);gap:6px;align-items:start;width:100%;min-width:0;";
  const rowLabels = chartArea.createDiv();
  rowLabels.style.cssText = `display:grid;grid-template-rows:18px 16px 16px ${metrics.cellH}px ${metrics.cellH}px;gap:${metrics.rowGap}px;align-items:center;min-width:0;color:var(--text-muted);`;
  [
    { label: "", value: "" },
    { label: dailyStateT("runtime.home.trends.mood"), value: "" },
    { label: dailyStateT("runtime.home.trends.weather"), value: "" },
    { label: dailyStateT("runtime.home.trends.energy"), value: `${energyAvg}/5` },
    { label: dailyStateT("runtime.home.trends.focus"), value: `${focusAvg}/4` }
  ].forEach((item, rowIndex) => {
    const labelEl = rowLabels.createDiv();
    labelEl.className = "dashboard-daily-state-row-label";
    labelEl.style.cssText = `grid-row:${rowIndex + 1};font-size:${rowIndex >= 3 ? ".66em" : ".62em"};font-weight:${rowIndex >= 3 ? "760" : "650"};line-height:1;text-align:left;white-space:nowrap;min-width:0;color:${rowIndex >= 3 ? ENERGY_TEXT : "var(--text-muted)"};font-variant-numeric:tabular-nums;`;
    labelEl.createEl("span", { text: item.label }).style.cssText = rowIndex >= 3 ? "color:var(--text-muted);font-weight:650;" : "";
    if (item.value) {
      labelEl.createEl("span", { text: ` ${item.value}` }).style.cssText = `color:${ENERGY_TEXT};font-weight:780;`;
    }
  });
  const grid = chartArea.createDiv();
  grid.className = "dashboard-daily-state-grid";
  grid.style.cssText = `display:grid;grid-template-columns:repeat(${dayList.length},minmax(0,1fr));grid-template-rows:18px 16px 16px ${metrics.cellH}px ${metrics.cellH}px;gap:${metrics.rowGap}px ${metrics.gap}px;align-items:center;width:100%;min-width:0;position:relative;`;
  const renderDotOrEmoji = (idx, row, value, emoji, color, label, kind = "", ds = "") => {
    const node = grid.createDiv({ text: metrics.showEmoji ? (emoji || "") : "" });
    node.style.cssText = `grid-column:${idx + 1};grid-row:${row};display:flex;align-items:center;justify-content:center;text-align:center;font-size:${metrics.showEmoji ? ".9em" : ".6em"};line-height:1;color:${color || "var(--text-muted)"};min-width:0;min-height:12px;overflow:hidden;`;
    node.title = label;
    if (!metrics.showEmoji && value) {
      const dot = node.createEl("span");
      dot.style.cssText = `display:inline-block;width:${Math.max(3, Math.min(6, metrics.box - 1))}px;height:${Math.max(3, Math.min(6, metrics.box - 1))}px;border-radius:999px;background:${color || "var(--text-muted)"};vertical-align:middle;`;
    }
    if (kind === "mood") {
      node.classList.add("dashboard-daily-state-cell", "is-editable", "dashboard-daily-state-cell--mood");
      markDailyStateActionTarget(node, {
        source: "home-daily-state-cell",
        action: "open-daily-state-picker",
        date: ds,
        field: kind,
        value: value || ""
      });
      if (!value) {
        node.classList.add("dashboard-daily-state-cell--empty");
        const placeholder = node.createEl("span");
        placeholder.setAttr("aria-hidden", "true");
        placeholder.style.cssText = `display:inline-block;width:${Math.max(5, Math.min(8, metrics.box))}px;height:${Math.max(5, Math.min(8, metrics.box))}px;border-radius:999px;border:1px dashed color-mix(in srgb,var(--text-muted) 38%,transparent);background:color-mix(in srgb,var(--background-primary) 72%,var(--text-muted) 8%);box-sizing:border-box;`;
      }
      node.setAttr("role", "button");
      node.setAttr("tabindex", "0");
      node.style.cursor = "pointer";
      node.onclick = (ev) => {
        ev.stopPropagation();
        setDailyStateActionState(node, "ok");
        mirrorDailyStateAction({ actionState: "ok", date: ds, field: kind, value: value || "" });
        openStatePicker(node, ds, kind, value);
      };
      node.onkeydown = (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          setDailyStateActionState(node, "ok");
          mirrorDailyStateAction({ actionState: "ok", date: ds, field: kind, value: value || "" });
          openStatePicker(node, ds, kind, value);
        }
      };
    }
  };
  const renderMetricCell = (idx, row, value, maxValue, label, kind, ds = "") => {
    const v = Number(value || 0);
    const hasValue = v > 0;
    const cell = grid.createDiv();
    cell.className = `dashboard-daily-state-metric${hasValue ? " has-value" : " is-empty"}`;
    const fill = dailyHeatmapFill(kind, v, maxValue);
    const border = dailyHeatmapBorder(kind, v, maxValue);
    const hoverBorder = typeof cp?.heatmapHoverBorder === "function" ? cp.heatmapHoverBorder() : "color-mix(in srgb,var(--interactive-accent) 55%,var(--background-modifier-border))";
    cell.style.cssText = `grid-column:${idx + 1};grid-row:${row};width:min(${metrics.box}px,100%);height:${metrics.cellH}px;border-radius:${metrics.cellH <= 7 ? 2 : 3}px;justify-self:center;background:${fill};border:1px solid ${border};box-shadow:${hasValue ? "0 1px 0 color-mix(in srgb,var(--background-primary) 42%,transparent) inset" : "none"};box-sizing:border-box;opacity:${hasValue ? "1" : ".86"};transition:transform .12s ease,border-color .12s ease,box-shadow .12s ease;`;
    cell.title = hasValue ? `${label} ${v}/${maxValue}` : `${label} ${dailyStateT("runtime.home.trends.unrecorded")}`;
    cell.setAttr("aria-label", cell.title);
    cell.onmouseenter = () => {
      cell.style.borderColor = hoverBorder;
      cell.style.boxShadow = "0 0 0 1px color-mix(in srgb,var(--background-primary) 72%,transparent) inset,0 1px 4px rgba(15,23,42,.12)";
      cell.style.transform = "translateY(-1px)";
    };
    cell.onmouseleave = () => {
      cell.style.borderColor = border;
      cell.style.boxShadow = hasValue ? "0 1px 0 color-mix(in srgb,var(--background-primary) 42%,transparent) inset" : "none";
      cell.style.transform = "";
    };
    if (["energy", "focus"].includes(kind)) {
      cell.classList.add("is-editable", `dashboard-daily-state-cell--${kind}`);
      const current = kind === "focus" ? (focusByScore[String(v)] || "") : (hasValue ? String(v) : "");
      markDailyStateActionTarget(cell, {
        source: "home-daily-state-cell",
        action: "open-daily-state-picker",
        date: ds,
        field: kind,
        value: current
      });
      cell.setAttr("role", "button");
      cell.setAttr("tabindex", "0");
      cell.style.cursor = "pointer";
      cell.onclick = (ev) => {
        ev.stopPropagation();
        setDailyStateActionState(cell, "ok");
        mirrorDailyStateAction({ actionState: "ok", date: ds, field: kind, value: current });
        openStatePicker(cell, ds, kind, current);
      };
      cell.onkeydown = (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          setDailyStateActionState(cell, "ok");
          mirrorDailyStateAction({ actionState: "ok", date: ds, field: kind, value: current });
          openStatePicker(cell, ds, kind, current);
        }
      };
    }
  };
  dayList.forEach((ds, idx) => {
    const st = stateMap[ds] || {};
    const focus = Number(focusScoreMap[st.focus] || 0);
    const energy = Number(st.energy || 0);
    const monthStart = ds.slice(8) === "01";
    const showDate = idx === 0 || idx === dayList.length - 1 || monthStart || (idx % metrics.dateEvery === 0);
    const dateNode = grid.createDiv({ text: showDate ? ds.slice(8) : "" });
    dateNode.style.cssText = `grid-column:${idx + 1};grid-row:1;text-align:center;font-size:${metrics.fontSize};color:var(--text-muted);font-weight:560;font-variant-numeric:tabular-nums;min-width:0;overflow:hidden;`;
    renderDotOrEmoji(idx, 2, st.mood, moodEmoji[st.mood], moodColor(st.mood), `${ds} ${dailyStateT("runtime.home.trends.mood")} ${st.mood ? dailyStateLabel("mood", st.mood, st.mood) : dailyStateT("runtime.home.trends.unrecorded")}`, "mood", ds);
    renderDotOrEmoji(idx, 3, st.weather, weatherEmoji[st.weather], weatherColor(st.weather), `${ds} ${dailyStateT("runtime.home.trends.weather")} ${st.weather ? dailyStateLabel("weather", st.weather, st.weather) : dailyStateT("runtime.home.trends.unrecorded")}`);
    renderMetricCell(idx, 4, energy, 5, `${ds} ${dailyStateT("runtime.home.trends.energy")}`, "energy", ds);
    renderMetricCell(idx, 5, focus, 4, `${ds} ${dailyStateT("runtime.home.trends.focus")}`, "focus", ds);
  });
  const axis = chartScroller.createDiv();
  axis.style.cssText = "display:flex;justify-content:space-between;margin-top:6px;margin-left:60px;color:var(--text-muted);font-size:.72em;";
  axis.createEl("span", { text: dayList[0].slice(5) });
  axis.createEl("span", { text: dayList[dayList.length - 1].slice(5) });
}

const globalDayList = usingGlobalRange ? dayListFromStatsRange(input.statsRange) : [];
let state = usingGlobalRange && globalDayList.length
  ? { days: globalDayList.length, endDate: globalDayList[globalDayList.length - 1], dayList: globalDayList }
  : safeState();
prevBtn.onclick = () => {
  state = { ...state, endDate: addDays(state.endDate, -state.days) };
  void renderWindow(state);
};
nextBtn.onclick = () => {
  const next = addDays(state.endDate, state.days);
  state = { ...state, endDate: next > todayKey ? todayKey : next };
  void renderWindow(state);
};
todayBtn.onclick = () => {
  state = { ...state, endDate: todayKey };
  void renderWindow(state);
};
endInput.onchange = () => {
  const v = parseDate(endInput.value) ? endInput.value : todayKey;
  state = { ...state, endDate: v > todayKey ? todayKey : v };
  void renderWindow(state);
};
rangeOptionBtns.forEach((btn, days) => {
  btn.onclick = () => {
    state = { ...state, days };
    closeRangeMenu();
    void renderWindow(state);
  };
});

await renderWindow(state);
})();
