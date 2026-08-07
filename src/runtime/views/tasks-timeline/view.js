/**
 * Noria 任务时间轴 · 纵向日期桶（Tasks-Timeline 心智）
 * 与 tasks-calendar runtime 共用 metadata 任务源与桥接配置；本视图不再承载嵌入日表面板。
 */
let { pages, dailyNoteFormat, noriaBridge, requestToggleTodayFocus, noriaHideTimelineTopToolbar } =
  (typeof input !== "undefined" && input) || {};

const m = moment;
const bridge = noriaBridge && typeof noriaBridge === "object" ? noriaBridge : {};
function noriaTlRuntimeT(key, params = {}) {
  try {
    if (bridge && typeof bridge.t === "function") {
      const direct = bridge.t(key, params);
      if (direct && direct !== key) return String(direct);
    }
  } catch (_) {}
  try {
    const i18n = bridge && bridge.i18n ? bridge.i18n : null;
    const raw = (i18n?.messages && i18n.messages[key]) || (i18n?.fallback && i18n.fallback[key]) || key;
    return String(raw).replace(/\{([^}]+)\}/g, (_, name) => params[name] == null ? "" : String(params[name]));
  } catch (_) {
    return String(key || "");
  }
}
const wtc =
  bridge.wrapperTimelineCompat && typeof bridge.wrapperTimelineCompat === "object"
    ? bridge.wrapperTimelineCompat
    : {};
const forwardDays = toBool(wtc.forward, true) ? 56 : 14;
const filterEmpty = toBool(wtc.filterEmpty, true);
const useCounters = toBool(wtc.useCounters, true);
const defaultTodayFocus = toBool(wtc.defaultTodayFocus, false);
let todayFocusState = defaultTodayFocus;
const counterBehavior = String(wtc.counterBehavior || "Filter").trim().toLowerCase();
const useFilterCounters = counterBehavior !== "highlight";

function noriaTlIsPomodoroEnabled() {
  return !(
    bridge &&
    (
      bridge.pomodoroEnabled === false ||
      (bridge.features && bridge.features.modules && bridge.features.modules.pomodoro === false)
    )
  );
}

const resolvedPages = pages != null && String(pages).trim() !== "" ? pages : "";
const resolvedDnf = dailyNoteFormat || "YYYY-MM-DD";
let noriaTlPlannerLabControls = null;
let noriaTlPlannerLabSaveTimer = null;
let noriaTlLocalRefreshTimer = null;
let noriaTlNowMarkerRefreshTimer = null;
let noriaTlPomodoroRefreshTimer = null;
let noriaTlPomodoroSaveTimer = null;
let noriaTlPomodoroLocalState = null;
let noriaTlPomodoroPersistSeq = 0;
const NORIA_TL_TIMER_ATTACH_TOKEN = "noria/timeline-timer-attach";
const NORIA_TL_TIMER_ATTACH_MIME = "application/x-noria-timer-attach";
const NORIA_TL_POMODORO_EMOJI = "\u{1F345}";
const noriaTlTimerAttachedKeys =
  globalThis.__noriaTimelineTimerAttachedKeys instanceof Set
    ? globalThis.__noriaTimelineTimerAttachedKeys
    : new Set();
globalThis.__noriaTimelineTimerAttachedKeys = noriaTlTimerAttachedKeys;
const noriaTlRenderedTaskByAttachKey =
  globalThis.__noriaTimelineRenderedTaskByAttachKey instanceof Map
    ? globalThis.__noriaTimelineRenderedTaskByAttachKey
    : new Map();
globalThis.__noriaTimelineRenderedTaskByAttachKey = noriaTlRenderedTaskByAttachKey;
/* 迁移兜底：旧版本可能残留“全量附着”缓存，首次进入 runtime 时清空一次，避免计时按钮满屏出现。 */
if (!globalThis.__noriaTimelineTimerAttachInitV2) {
  try { noriaTlTimerAttachedKeys.clear(); } catch (_) {}
  globalThis.__noriaTimelineTimerAttachInitV2 = true;
}

function noriaTlDefaultPlannerLabControls() {
  return {
    version: 2,
    global: { circleSize: 13, titleGap: 3, timeBadgeMinWidth: 42, timeBadgeMaxWidth: 64, taskRadius: 10, borderAlpha: 0.58, shadowAlpha: 0.12 },
    weekDay: {
      singleHeightThreshold: 30,
      hiddenThreshold: 92,
      startOnlyThreshold: 112,
      overlayHeightThreshold: 22,
      timeFontSize: 9,
      modeLockMs: 760,
      widthBucketStep: 4,
      heightBucketStep: 2,
      keepBias: 1
    },
    timeline: {
      timeColWidth: 34,
      axisColWidth: 10,
      timeColInset: 0,
      timeToAxisGap: -2,
      axisToCardGap: 2,
  axisLineOffset: 0,
      taskGapY: 8,
      cardPaddingX: 8,
      cardPaddingY: 6,

      timeFontSize: 11,
      secondaryFontSize: 10,
      twoLineTimeGap: 2,
      timeMainWeight: 640,
      timeMinorOpacity: 0.78,
      timeColAlign: "left",
      emptyTimeOpacity: 0.25,

      nodeSize: 8,
      nodeBorderWidth: 0,
      nodeBorderAlpha: 0.46,
      nodeFillAlpha: 1,
      lineWidth: 1.5,
      lineAlpha: 0.32,
      lineTopOffset: 1,
      lineBottomScale: 0.8,
      timerBtnSize: 14,
      durationLabelGap: 3,
      durationLabelFontSize: 9.5,
      durationLabelShiftX: -6,

      cardRadius: 10,
      cardBorderAlpha: 0.58,
      cardShadowAlpha: 0.08,
      cardShadowY: 1,
      cardShadowBlur: 2,
      titleFontSize: 13,
      titleLineClamp: 2,
      titleGap: 10,
      metaOpacity: 0.92,

      sortPolicy: "time-priority",
      timeReadPriority: "inline-first",
      inlineStartDueFirst: true,
      fallbackStartDueTime: true,
      unplannedSortMode: "line",
      writebackDateTimeFormat: "YYYY-MM-DD HH:mm",

      dragStepMin: 5,
      defaultDurationMin: 30,
      dragDeadzonePx: 4,
      durationDragStepMin: 15,
      durationDragDeadzonePx: 4,
      snapMinutes: 5,
      dragCommitPolicy: "pointer-up",
      labPanelDock: "detached-right",
      showEndTimeInTimeColumn: false,
      hideNoTimeLabel: true,
      showDayEmptyPlaceholder: false,
      showDurationUnderTimer: true,
      hideControlTagsInTitle: true,
      localRefreshDelay: 50,
      layoutTransitionMs: 120,
      disableTransitionDuringDrag: true,
      rerenderDebounceMs: 80,
      stabilityKeepBias: 1
    },
    presets: {
      compact: {
        timeline: {
          timeColWidth: 34,
          axisColWidth: 10,
          timeColInset: 0,
          timeToAxisGap: -2,
          axisToCardGap: 2,
          cardPaddingX: 6,
          cardPaddingY: 5,
          taskGapY: 6
        }
      },
      balanced: { timeline: {} },
      relaxed: {
        timeline: {
          timeColWidth: 36,
          axisColWidth: 10,
          timeColInset: 0,
          timeToAxisGap: -1,
          axisToCardGap: 4,
          cardPaddingX: 10,
          cardPaddingY: 7,
          taskGapY: 10
        }
      }
    },
    activePresetByScope: {
      timeline: "balanced"
    }
  };
}

function noriaTlMergePlannerLabControls(raw) {
  const base = noriaTlDefaultPlannerLabControls();
  const src = raw && typeof raw === "object" ? raw : {};
  const out = {
    version: Number(src.version) >= 2 ? 2 : 2,
    global: { ...base.global, ...((src.global && typeof src.global === "object") ? src.global : {}) },
    weekDay: { ...base.weekDay, ...((src.weekDay && typeof src.weekDay === "object") ? src.weekDay : {}) },
    timeline: { ...base.timeline, ...((src.timeline && typeof src.timeline === "object") ? src.timeline : {}) },
    presets: { ...base.presets, ...((src.presets && typeof src.presets === "object") ? src.presets : {}) },
    activePresetByScope: { ...base.activePresetByScope, ...((src.activePresetByScope && typeof src.activePresetByScope === "object") ? src.activePresetByScope : {}) }
  };
  const clamp = (value, fallback, min, max) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  };
  const enumOf = (value, fallback, options) => options.indexOf(String(value || "")) >= 0 ? String(value) : fallback;
  out.timeline.timeColWidth = clamp(out.timeline.timeColWidth, base.timeline.timeColWidth, 34, 120);
  out.timeline.axisColWidth = clamp(out.timeline.axisColWidth, base.timeline.axisColWidth, 10, 60);
  out.timeline.timeColInset = clamp(out.timeline.timeColInset, base.timeline.timeColInset, 0, 24);
  out.timeline.timeToAxisGap = clamp(out.timeline.timeToAxisGap, base.timeline.timeToAxisGap, -12, 24);
  out.timeline.axisToCardGap = clamp(out.timeline.axisToCardGap, base.timeline.axisToCardGap, -12, 28);
  out.timeline.axisLineOffset = clamp(out.timeline.axisLineOffset, base.timeline.axisLineOffset, -16, 16);
  out.timeline.taskGapY = clamp(out.timeline.taskGapY, base.timeline.taskGapY, 0, 30);
  out.timeline.cardPaddingX = clamp(out.timeline.cardPaddingX, base.timeline.cardPaddingX, 2, 24);
  out.timeline.cardPaddingY = clamp(out.timeline.cardPaddingY, base.timeline.cardPaddingY, 2, 20);
  out.timeline.timeFontSize = clamp(out.timeline.timeFontSize, base.timeline.timeFontSize, 8, 18);
  out.timeline.secondaryFontSize = clamp(out.timeline.secondaryFontSize, base.timeline.secondaryFontSize, 7, 16);
  out.timeline.twoLineTimeGap = clamp(out.timeline.twoLineTimeGap, base.timeline.twoLineTimeGap, 0, 12);
  out.timeline.timeMainWeight = clamp(out.timeline.timeMainWeight, base.timeline.timeMainWeight, 400, 800);
  out.timeline.timeMinorOpacity = clamp(out.timeline.timeMinorOpacity, base.timeline.timeMinorOpacity, 0.2, 1);
  out.timeline.timeColAlign = enumOf(out.timeline.timeColAlign, base.timeline.timeColAlign, ["left", "center", "right"]);
  out.timeline.emptyTimeOpacity = clamp(out.timeline.emptyTimeOpacity, base.timeline.emptyTimeOpacity, 0, 1);
  out.timeline.nodeSize = clamp(out.timeline.nodeSize, base.timeline.nodeSize, 7, 28);
  out.timeline.nodeBorderWidth = clamp(out.timeline.nodeBorderWidth, base.timeline.nodeBorderWidth, 0, 4);
  out.timeline.nodeBorderAlpha = clamp(out.timeline.nodeBorderAlpha, base.timeline.nodeBorderAlpha, 0, 1);
  out.timeline.nodeFillAlpha = clamp(out.timeline.nodeFillAlpha, base.timeline.nodeFillAlpha, 0, 1);
  out.timeline.lineWidth = clamp(out.timeline.lineWidth, base.timeline.lineWidth, 1, 4);
  out.timeline.lineAlpha = clamp(out.timeline.lineAlpha, base.timeline.lineAlpha, 0, 1);
  out.timeline.lineTopOffset = clamp(out.timeline.lineTopOffset, base.timeline.lineTopOffset, -12, 24);
  out.timeline.lineBottomScale = clamp(out.timeline.lineBottomScale, base.timeline.lineBottomScale, 0.2, 1.6);
  out.timeline.timerBtnSize = clamp(out.timeline.timerBtnSize, base.timeline.timerBtnSize, 10, 24);
  out.timeline.durationLabelGap = clamp(out.timeline.durationLabelGap, base.timeline.durationLabelGap, 0, 14);
  out.timeline.durationLabelFontSize = clamp(out.timeline.durationLabelFontSize, base.timeline.durationLabelFontSize, 7, 16);
  out.timeline.durationLabelShiftX = clamp(out.timeline.durationLabelShiftX, base.timeline.durationLabelShiftX, -18, 12);
  out.timeline.cardRadius = clamp(out.timeline.cardRadius, base.timeline.cardRadius, 4, 24);
  out.timeline.cardBorderAlpha = clamp(out.timeline.cardBorderAlpha, base.timeline.cardBorderAlpha, 0, 1);
  out.timeline.cardShadowAlpha = clamp(out.timeline.cardShadowAlpha, base.timeline.cardShadowAlpha, 0, 1);
  out.timeline.cardShadowY = clamp(out.timeline.cardShadowY, base.timeline.cardShadowY, -2, 10);
  out.timeline.cardShadowBlur = clamp(out.timeline.cardShadowBlur, base.timeline.cardShadowBlur, 0, 24);
  out.timeline.titleFontSize = clamp(out.timeline.titleFontSize, base.timeline.titleFontSize, 10, 18);
  out.timeline.titleLineClamp = clamp(out.timeline.titleLineClamp, base.timeline.titleLineClamp, 1, 4);
  out.timeline.titleGap = clamp(out.timeline.titleGap, base.timeline.titleGap, 2, 18);
  out.timeline.metaOpacity = clamp(out.timeline.metaOpacity, base.timeline.metaOpacity, 0.2, 1);
  out.timeline.sortPolicy = enumOf(out.timeline.sortPolicy, base.timeline.sortPolicy, ["time-priority", "line-first", "created-first"]);
  out.timeline.timeReadPriority = enumOf(out.timeline.timeReadPriority, base.timeline.timeReadPriority, ["inline-first", "legacy-first"]);
  out.timeline.inlineStartDueFirst = !!out.timeline.inlineStartDueFirst;
  out.timeline.fallbackStartDueTime = !!out.timeline.fallbackStartDueTime;
  out.timeline.unplannedSortMode = enumOf(out.timeline.unplannedSortMode, base.timeline.unplannedSortMode, ["line", "created"]);
  out.timeline.writebackDateTimeFormat = String(out.timeline.writebackDateTimeFormat || base.timeline.writebackDateTimeFormat);
  out.timeline.dragStepMin = clamp(out.timeline.dragStepMin, base.timeline.dragStepMin, 1, 60);
  out.timeline.defaultDurationMin = clamp(out.timeline.defaultDurationMin, base.timeline.defaultDurationMin, 5, 240);
  out.timeline.dragDeadzonePx = clamp(out.timeline.dragDeadzonePx, base.timeline.dragDeadzonePx, 0, 24);
  out.timeline.durationDragStepMin = clamp(out.timeline.durationDragStepMin, base.timeline.durationDragStepMin, 5, 120);
  out.timeline.durationDragDeadzonePx = clamp(out.timeline.durationDragDeadzonePx, base.timeline.durationDragDeadzonePx, 0, 24);
  out.timeline.snapMinutes = clamp(out.timeline.snapMinutes, base.timeline.snapMinutes, 1, 60);
  out.timeline.dragCommitPolicy = enumOf(out.timeline.dragCommitPolicy, base.timeline.dragCommitPolicy, ["pointer-up", "debounced"]);
  out.timeline.labPanelDock = enumOf(out.timeline.labPanelDock, base.timeline.labPanelDock, ["detached-right"]);
  out.timeline.hideNoTimeLabel = !!out.timeline.hideNoTimeLabel;
  out.timeline.showDayEmptyPlaceholder = !!out.timeline.showDayEmptyPlaceholder;
  out.timeline.showDurationUnderTimer = !!out.timeline.showDurationUnderTimer;
  out.timeline.hideControlTagsInTitle = out.timeline.hideControlTagsInTitle !== false;
  out.timeline.showEndTimeInTimeColumn = out.timeline.showEndTimeInTimeColumn === true;
  out.timeline.localRefreshDelay = clamp(out.timeline.localRefreshDelay, base.timeline.localRefreshDelay, 10, 800);
  out.timeline.layoutTransitionMs = clamp(out.timeline.layoutTransitionMs, base.timeline.layoutTransitionMs, 0, 500);
  out.timeline.disableTransitionDuringDrag = !!out.timeline.disableTransitionDuringDrag;
  out.timeline.rerenderDebounceMs = clamp(out.timeline.rerenderDebounceMs, base.timeline.rerenderDebounceMs, 10, 1200);
  out.timeline.stabilityKeepBias = clamp(out.timeline.stabilityKeepBias, base.timeline.stabilityKeepBias, 0, 4);
  out.timeline.hideNoTimeLabel = !!out.timeline.hideNoTimeLabel;
  return out;
}

function noriaTlReadPlannerLabControls() {
  if (!noriaTlPlannerLabControls) {
    let raw = bridge && bridge.plannerLabControls;
    if (bridge && typeof bridge.getPlannerLabControls === "function") {
      try {
        raw = bridge.getPlannerLabControls();
      } catch (_) {}
    }
    noriaTlPlannerLabControls = noriaTlMergePlannerLabControls(raw);
  }
  return noriaTlPlannerLabControls;
}

function noriaTlApplyPlannerLabVars(root) {
  if (!root || !root.style) return;
  const cfg = noriaTlReadPlannerLabControls();
  const timelineCfg = cfg.timeline || {};
  const num = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const txt = (value, fallback) => {
    const s = String(value == null ? "" : value).trim();
    return s || fallback;
  };
  try {
    root.style.setProperty("--noria-tl-time-col-width", `${num(timelineCfg.timeColWidth, 34)}px`);
    root.style.setProperty("--noria-tl-axis-col-width", `${num(timelineCfg.axisColWidth, 10)}px`);
    root.style.setProperty("--noria-tl-time-col-inset", `${num(timelineCfg.timeColInset, 0)}px`);
    root.style.setProperty("--noria-tl-time-to-axis-gap", `${num(timelineCfg.timeToAxisGap, -2)}px`);
    root.style.setProperty("--noria-tl-axis-to-card-gap", `${num(timelineCfg.axisToCardGap, 2)}px`);
    root.style.setProperty("--noria-tl-card-radius", `${num(timelineCfg.cardRadius, 10)}px`);
    root.style.setProperty("--noria-tl-axis-line-offset", `${num(timelineCfg.axisLineOffset, 0)}px`);
    root.style.setProperty("--noria-tl-task-gap-y", `${num(timelineCfg.taskGapY, 8)}px`);
    root.style.setProperty("--noria-tl-card-pad-x", `${num(timelineCfg.cardPaddingX, 8)}px`);
    root.style.setProperty("--noria-tl-card-pad-y", `${num(timelineCfg.cardPaddingY, 6)}px`);
    root.style.setProperty("--noria-tl-card-border-alpha", `${num(timelineCfg.cardBorderAlpha, 0.58)}`);
    root.style.setProperty("--noria-tl-card-shadow-alpha", `${num(timelineCfg.cardShadowAlpha, 0.08)}`);
    root.style.setProperty("--noria-tl-card-shadow-y", `${num(timelineCfg.cardShadowY, 1)}px`);
    root.style.setProperty("--noria-tl-card-shadow-blur", `${num(timelineCfg.cardShadowBlur, 2)}px`);
    root.style.setProperty("--noria-tl-time-font-size", `${num(timelineCfg.timeFontSize, 11)}px`);
    root.style.setProperty("--noria-tl-secondary-font-size", `${num(timelineCfg.secondaryFontSize, 10)}px`);
    root.style.setProperty("--noria-tl-time-main-weight", `${num(timelineCfg.timeMainWeight, 640)}`);
    root.style.setProperty("--noria-tl-time-minor-opacity", `${num(timelineCfg.timeMinorOpacity, 0.78)}`);
    root.style.setProperty("--noria-tl-empty-time-opacity", `${num(timelineCfg.emptyTimeOpacity, 0.25)}`);
    const timeAlign = txt(timelineCfg.timeColAlign, "left");
    const alignItems = timeAlign === "right" ? "flex-end" : (timeAlign === "center" ? "center" : "flex-start");
    root.style.setProperty("--noria-tl-time-col-align", timeAlign);
    root.style.setProperty("--noria-tl-time-align-items", alignItems);
    root.style.setProperty("--noria-tl-node-size", `${num(timelineCfg.nodeSize, 8)}px`);
    root.style.setProperty("--noria-tl-node-border-width", `${num(timelineCfg.nodeBorderWidth, 0)}px`);
    root.style.setProperty("--noria-tl-node-border-alpha", `${num(timelineCfg.nodeBorderAlpha, 0.46)}`);
    root.style.setProperty("--noria-tl-node-fill-alpha", `${num(timelineCfg.nodeFillAlpha, 1)}`);
    root.style.setProperty("--noria-tl-line-width", `${num(timelineCfg.lineWidth, 2)}px`);
    root.style.setProperty("--noria-tl-line-alpha", `${num(timelineCfg.lineAlpha, 0.32)}`);
    root.style.setProperty("--noria-tl-line-top-offset", `${num(timelineCfg.lineTopOffset, 1)}px`);
    root.style.setProperty("--noria-tl-line-bottom-scale", `${num(timelineCfg.lineBottomScale, 0.8)}`);
    root.style.setProperty("--noria-tl-timer-size", `${num(timelineCfg.timerBtnSize, 16)}px`);
    root.style.setProperty("--noria-tl-two-line-gap", `${num(timelineCfg.twoLineTimeGap, 2)}px`);
    root.style.setProperty("--noria-tl-duration-gap", `${num(timelineCfg.durationLabelGap, 3)}px`);
    root.style.setProperty("--noria-tl-duration-font-size", `${num(timelineCfg.durationLabelFontSize, 9.5)}px`);
    root.style.setProperty("--noria-tl-duration-shift-x", `${num(timelineCfg.durationLabelShiftX, -6)}px`);
    root.style.setProperty("--noria-tl-title-font-size", `${num(timelineCfg.titleFontSize, 13)}px`);
    root.style.setProperty("--noria-tl-title-clamp", `${num(timelineCfg.titleLineClamp, 2)}`);
    root.style.setProperty("--noria-tl-title-gap", `${num(timelineCfg.titleGap, 10)}px`);
    root.style.setProperty("--noria-tl-meta-opacity", `${num(timelineCfg.metaOpacity, 0.92)}`);
    root.style.setProperty("--noria-tl-layout-transition-ms", `${num(timelineCfg.layoutTransitionMs, 120)}ms`);
  } catch (_) {}
}

function noriaTlSchedulePlannerLabSave() {
  if (noriaTlPlannerLabSaveTimer) clearTimeout(noriaTlPlannerLabSaveTimer);
  noriaTlPlannerLabSaveTimer = window.setTimeout(() => {
    noriaTlPlannerLabSaveTimer = null;
    if (!bridge || typeof bridge.savePlannerLabControls !== "function") return;
    try {
      bridge.savePlannerLabControls(JSON.parse(JSON.stringify(noriaTlReadPlannerLabControls())));
    } catch (_) {}
  }, 90);
}

async function noriaTlRefreshFromFreshSource() {
  const host = ctx && ctx.container ? ctx.container : null;
  let oldScroll = 0;
  try { oldScroll = host && typeof host.scrollTop === "number" ? host.scrollTop : 0; } catch (_) {}
  try {
    const oldRoot = host && host.querySelector ? host.querySelector(".noria-tl-root") : null;
    if (oldRoot) todayFocusState = oldRoot.classList.contains("noria-tl-today-focus");
  } catch (_) {}
  await render();
  try {
    if (host && typeof host.querySelectorAll === "function") {
      const roots = Array.from(host.querySelectorAll(".noria-tl-root"));
      for (let i = 0; i < roots.length - 1; i++) roots[i].remove();
    }
    if (host && typeof host.scrollTop === "number") host.scrollTop = oldScroll;
  } catch (_) {}
}

function noriaTlBindFreshTaskInvalidationEvent() {
  try {
    if (!app || !app.workspace || typeof app.workspace.on !== "function") return;
    const key = "__noriaTasksTimelineInvalidationRef";
    if (globalThis[key] && typeof app.workspace.offref === "function") {
      try { app.workspace.offref(globalThis[key]); } catch (_) {}
    }
    globalThis[key] = app.workspace.on("noria:tasks-invalidated", () => {
      try { void noriaTlRefreshFromFreshSource(); } catch (_) {}
    });
  } catch (_) {}
}

function noriaTlQueueLocalRefresh(delayOverrideMs) {
  if (noriaTlLocalRefreshTimer) return;
  const cfg = noriaTlReadPlannerLabControls();
  const tlCfg = cfg.timeline || {};
  const requestedDelay = Number(delayOverrideMs);
  const delay = Math.max(10, Math.min(1200, Number.isFinite(requestedDelay) ? requestedDelay : Number(tlCfg.rerenderDebounceMs || tlCfg.localRefreshDelay || 80)));
  noriaTlLocalRefreshTimer = window.setTimeout(() => {
    noriaTlLocalRefreshTimer = null;
    try {
      void noriaTlRefreshFromFreshSource();
    } catch (_) {}
  }, delay);
}

function toBool(v, def) {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = String(v || "").trim().toLowerCase();
  if (!s) return !!def;
  if (s === "true" || s === "1" || s === "yes" || s === "on") return true;
  if (s === "false" || s === "0" || s === "no" || s === "off") return false;
  return !!def;
}

const hideTimelineTopToolbar = toBool(noriaHideTimelineTopToolbar, false);

function runtimeRowsToArray(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  let best = [];
  function consider(candidate) {
    if (!Array.isArray(candidate) || candidate.length === 0) return;
    const filtered = candidate.filter((x) => x != null);
    if (filtered.length > best.length) best = filtered;
  }
  try {
    if (typeof raw.array === "function") consider(raw.array());
  } catch (_) {}
  try {
    if (typeof raw.length === "number" && raw.length > 0) {
      const accL = [];
      for (let li = 0; li < raw.length; li++) {
        if (raw[li] !== undefined) accL.push(raw[li]);
      }
      consider(accL);
    }
  } catch (_) {}
  try {
    consider(Array.from(raw));
  } catch (_) {}
  return best;
}

function tasksFromPageFile(pg) {
  if (!pg || !pg.file) return [];
  const ft = pg.file.tasks;
  const out = runtimeRowsToArray(ft);
  if (out.length > 0) return out;
  const lists = pg.file.lists;
  const listArr = runtimeRowsToArray(lists);
  const acc = [];
  for (let li = 0; li < listArr.length; li++) {
    const item = listArr[li];
    if (item && item.task === true) acc.push(item);
  }
  return acc;
}

function parseNoriaTlCtxPagesExpression(pagesSpec) {
  const source = String(pagesSpec || "").trim().replace(/;+\s*$/, "");
  const match = source.match(/^ctx\.pages\s*\(\s*(["'])([\s\S]*?)\1\s*\)\s*(?:\.file\.tasks)?\s*$/);
  if (!match) return null;
  const spec = String(match[2] || "")
    .replace(/\\(["'\\])/g, "$1")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t");
  return {
    spec,
    directTasks: /\.file\.tasks\s*$/.test(source)
  };
}

function collectTasksFromNoriaTlCtxPagesExpression(pagesSpec) {
  const parsed = parseNoriaTlCtxPagesExpression(pagesSpec);
  if (!parsed) return null;
  const pagesResult = noriaTlPagesFromDynamicSpec(parsed.spec);
  if (!pagesResult) return [];
  const direct = pagesResult && pagesResult.file && pagesResult.file.tasks;
  const flat = runtimeRowsToArray(direct);
  if (flat.length > 0) return flat;
  const pageArr = runtimeRowsToArray(pagesResult);
  const acc = [];
  for (let pi = 0; pi < pageArr.length; pi++) {
    acc.push(...tasksFromPageFile(pageArr[pi]));
  }
  return acc;
}

function noriaTlAdaptDataTaskToRuntimeTask(item) {
  item = item || {};
  const dates = item.dates || {};
  const source = item.source || {};
  const identity = item.identity || {};
  const checkbox = item.checkbox || {};
  const rawText = String((item.text && (item.text.raw || item.text.clean)) || item.title || "");
  const pathText = String(source.path || identity.sourcePath || "").replace(/\\/g, "/").replace(/^\/+/, "");
  return {
    text: rawText,
    rawText,
    rawLine: String(source.rawLine || rawText),
    path: pathText,
    line: Number(identity.line != null ? identity.line : source.line) || 0,
    completed: item.completed === true,
    checked: item.checked === true,
    status: checkbox.state || item.status || "",
    checkbox: { mark: checkbox.mark || "", state: checkbox.state || "" },
    start: dates.start || "",
    due: dates.due || "",
    scheduled: dates.scheduled || "",
    completion: dates.completion || "",
    created: dates.created || "",
    startTime: item.time && item.time.start ? String(item.time.start) : "",
    dueTime: item.time && item.time.end ? String(item.time.end) : "",
    link: { path: pathText },
    __noriaSource: "data"
  };
}

async function noriaTlCollectFreshTasksForCalendar(pagesSpec) {
  try {
    if (!bridge.data || typeof bridge.data.getTasks !== "function") return [];
    const anchor = m().format("YYYY-MM-DD");
    const result = await bridge.data.getTasks({
      range: { mode: "custom", start: anchor, end: anchor },
      bucketBy: "timeline",
      status: "all",
      rangePolicy: "allFacts",
      source: { pages: String(pagesSpec == null ? "" : pagesSpec) }
    });
    const items = result && Array.isArray(result.items) ? result.items : [];
    return items.map(noriaTlAdaptDataTaskToRuntimeTask);
  } catch (err) {
    try { console.warn("[noria tasksTimeline] fresh task source failed", err); } catch (_) {}
    return [];
  }
}

function collectTasksForCalendar(pagesSpec) {
  if (pagesSpec === "") {
    const pagesForScope = runtimeRowsToArray(
      bridge.runtime && typeof bridge.runtime.pagesForScope === "function"
        ? bridge.runtime.pagesForScope("tasks", ctx)
        : []
    );
    const accScoped = [];
    for (let si = 0; si < pagesForScope.length; si++) {
      accScoped.push(...tasksFromPageFile(pagesForScope[si]));
    }
    return accScoped;
  }
  if (typeof pagesSpec === "string" && pagesSpec.startsWith("ctx.pages")) {
    const fromExpression = collectTasksFromNoriaTlCtxPagesExpression(pagesSpec);
    return fromExpression || [];
  }
  const pagesResult = noriaTlPagesFromDynamicSpec(pagesSpec);
  if (!pagesResult) return [];
  const direct = pagesResult && pagesResult.file && pagesResult.file.tasks;
  const flat = runtimeRowsToArray(direct);
  if (flat.length > 0) return flat;
  const pageArr = runtimeRowsToArray(pagesResult);
  const acc = [];
  for (let pi = 0; pi < pageArr.length; pi++) {
    acc = acc.concat(tasksFromPageFile(pageArr[pi]));
  }
  if (acc.length > 0) return acc;
  if (typeof pagesSpec === "string") {
    const bare = String(pagesSpec).trim().replace(/^["']+|["']+$/g, "");
    if (bare && bare !== String(pagesSpec).trim()) {
      try {
        const pr2 = noriaTlPagesFromDynamicSpec(bare);
        if (!pr2) return acc;
        const d2 = pr2 && pr2.file && pr2.file.tasks;
        const f2 = runtimeRowsToArray(d2);
        if (f2.length > 0) return f2;
        const arr2 = runtimeRowsToArray(pr2);
        const acc2 = [];
        for (let j = 0; j < arr2.length; j++) {
          acc2 = acc2.concat(tasksFromPageFile(arr2[j]));
        }
        if (acc2.length > 0) return acc2;
      } catch (_) {}
    }
  }
  return [];
}

function noriaTlPagesFromDynamicSpec(spec) {
  try {
    return ctx.pages(spec);
  } catch (err) {
    console.error("[noria tasksTimeline] dynamic metadata pages failed:", spec, err);
    return null;
  }
}

function luxonOrDateToYmd(v) {
  if (v == null) return "";
  try {
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    if (v.toISODate && typeof v.toISODate === "function") {
      const iso = v.toISODate();
      return iso ? String(iso).slice(0, 10) : "";
    }
    if (v.toFormat && typeof v.toFormat === "function") {
      const s = v.toFormat("yyyy-MM-dd");
      return s || "";
    }
    const mm = m(v);
    if (mm && mm.isValid && mm.isValid()) return mm.format("YYYY-MM-DD");
  } catch (_) {}
  return "";
}

function luxonOrDateToHm(v) {
  if (v == null) return "";
  try {
    if (typeof v === "string") {
      const m0 = v.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
      if (m0) return `${String(m0[1]).padStart(2, "0")}:${m0[2]}`;
    }
    if (v.toFormat && typeof v.toFormat === "function") {
      const s = v.toFormat("HH:mm");
      return s || "";
    }
    const mm = m(v);
    if (mm && mm.isValid && mm.isValid()) return mm.format("HH:mm");
  } catch (_) {}
  return "";
}

function lastMatchAll(text, re) {
  let last = null;
  try {
    for (const x of String(text || "").matchAll(re)) last = x;
  } catch (_) {}
  return last;
}

/** 去掉不成对 UTF-16 代理，避免标题出现「」替换符 */
function noriaTlStripLoneSurrogates(str) {
  const s = String(str || "");
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += s.slice(i, i + 2);
        i++;
      }
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      continue;
    } else {
      out += s[i];
    }
  }
  return out;
}

/** Tasks / metadata 行内：📅📆🗓⏳🛫✅ 等 + 日期（可选时间） */
const NORIA_TL_EMOJI_DATE_RE =
  /(?:\uD83D\uDCC5|\uD83D\uDCC6|\uD83D\uDCC3|\uD83D\uDDD3\uFE0F?|\u23F3|\uD83D\uDEEB|\u2705)\s*(\d{4}-\d{2}-\d{2})(?:[ T]\d{1,2}:\d{2})?/g;

/** 轻量日期：优先 metadata/Tasks 字段，再扫 emoji 元数据 */
function primaryYmdForTask(task) {
  const t = task;
  const tlCfg = (noriaTlReadPlannerLabControls().timeline || {});
  const preferInline = tlCfg.timeReadPriority !== "legacy-first" && tlCfg.inlineStartDueFirst !== false;
  const legacyStartYmd = luxonOrDateToYmd(t.start);
  const legacyDueYmd = luxonOrDateToYmd(t.due);
  const legacyScheduledYmd = luxonOrDateToYmd(t.scheduled);
  const inlineStart = noriaTlReadTaskDateTimeField(t, "start");
  const inlineDue = noriaTlReadTaskDateTimeField(t, "due");
  const inlineScheduled = noriaTlReadTaskDateTimeField(t, "scheduled");
  const isTimelineControl = noriaTlIsTimelineControlTask(t);
  if (preferInline) {
    if (isTimelineControl) {
      if (inlineStart && inlineStart.ymd) return inlineStart.ymd;
      if (legacyStartYmd) return legacyStartYmd;
      if (inlineDue && inlineDue.ymd) return inlineDue.ymd;
      if (legacyDueYmd) return legacyDueYmd;
    } else {
      if (inlineDue && inlineDue.ymd) return inlineDue.ymd;
      if (legacyDueYmd) return legacyDueYmd;
      if (inlineScheduled && inlineScheduled.ymd) return inlineScheduled.ymd;
      if (legacyScheduledYmd) return legacyScheduledYmd;
      if (inlineStart && inlineStart.ymd) return inlineStart.ymd;
      if (legacyStartYmd) return legacyStartYmd;
    }
  } else {
    if (isTimelineControl) {
      if (legacyStartYmd) return legacyStartYmd;
      if (inlineStart && inlineStart.ymd) return inlineStart.ymd;
      if (legacyDueYmd) return legacyDueYmd;
      if (inlineDue && inlineDue.ymd) return inlineDue.ymd;
    } else {
      if (legacyDueYmd) return legacyDueYmd;
      if (inlineDue && inlineDue.ymd) return inlineDue.ymd;
      if (legacyScheduledYmd) return legacyScheduledYmd;
      if (inlineScheduled && inlineScheduled.ymd) return inlineScheduled.ymd;
      if (legacyStartYmd) return legacyStartYmd;
      if (inlineStart && inlineStart.ymd) return inlineStart.ymd;
    }
  }
  const line = String(t.text != null ? t.text : t.visual || "");
  let dueM = lastMatchAll(line, NORIA_TL_EMOJI_DATE_RE);
  if (dueM && dueM[1]) return dueM[1];
  dueM =
    lastMatchAll(line, /\uD83D\uDCC5\W(\d{4}-\d{2}-\d{2})/g) ||
    lastMatchAll(line, /\uD83D\uDDD3\uFE0F?\s*(\d{4}-\d{2}-\d{2})/g);
  if (dueM && dueM[1]) return dueM[1];
  const schM = lastMatchAll(line, /\u23F3\W(\d{4}-\d{2}-\d{2})/g);
  if (schM && schM[1]) return schM[1];
  const startM = lastMatchAll(line, /\uD83D\uDEEB\W(\d{4}-\d{2}-\d{2})/g);
  if (startM && startM[1]) return startM[1];
  const path = String(t.path || (t.link && t.link.path) || "");
  const fn = path.split(/[/\\]/).pop() || "";
  const dn = fn.replace(/\.md$/i, "");
  const strict = m(dn, resolvedDnf, true);
  if (strict.isValid()) return strict.format("YYYY-MM-DD");
  return "";
}

function stripForDisplay(text) {
  let s = String(text || "");
  const tlCfg = (noriaTlReadPlannerLabControls().timeline || {});
  if (tlCfg.hideControlTagsInTitle !== false) {
    s = s.replace(/(^|\s)#(?:tl(?:\/[^\s#]+)?|habit(?:-(?:active|paused|done))?|active|paused|done)(?=\s|$)/gi, " ");
  }
  s = s.replace(/(^|\s)[#＃][^\s#＃]+/g, " ");
  s = s.replace(/\s*🔁[^\n]*/g, " ");
  s = s.replace(/\s*➕\s*\d{4}-\d{2}-\d{2}(?:\s+[0-2]?\d:[0-5]\d)?/g, " ");
  try {
    NORIA_TL_EMOJI_DATE_RE.lastIndex = 0;
  } catch (_) {}
  s = s.replace(NORIA_TL_EMOJI_DATE_RE, " ");
  s = s.replace(
    /\s*[\uD83D\uDCC5\uD83D\uDCC6\uD83D\uDCC3\uD83D\uDDD3\uFE0F?\u23F3\uD83D\uDEEB\u2705\u2795]\s*\d{4}-\d{2}-\d{2}(?:[ T][0-2]?\d:[0-5]\d)?/g,
    " "
  );
  s = s.replace(/\s*[\u23F0]\s*[0-2]?\d:[0-5]\d/g, " ");
  s = s.replace(/\s*[\[(]\s*🍅::\s*[^\])]*[\])]/gu, " ");
  s = s.replace(
    /\s*\[+(?:due|scheduled|start|completion|done|created|id|priority|dependsOn|repeat|recurrence|every|before|after|duration_min|startTime|dueTime|timeLog|timer_running|target|type|value|unit)::[^\]]+\]/gi,
    " "
  );
  s = s.replace(/\s+\^[A-Za-z0-9-]+\s*$/u, " ");
  s = s.replace(/\s+/g, " ").trim();
  return noriaTlStripLoneSurrogates(s);
}

function noriaTlIsHiddenControlTag(tag) {
  const key = String(tag || "").replace(/^#/, "").trim();
  return /^(?:tl(?:\/.*)?|habit(?:-(?:active|paused|done))?|active|paused|done)$/i.test(key);
}

function noriaTlHasMeaningfulValue(v) {
  if (v == null) return false;
  if (v === false) return false;
  const s = String(v).trim();
  if (!s) return false;
  return !/^(false|no|null|undefined|0)$/i.test(s);
}

function taskCompleted(tk) {
  if (!tk) return false;
  const isTimelineControl = noriaTlIsTimelineControlTask(tk);
  if (tk.completed === true || tk.fullyCompleted === true) return true;
  const status = String(tk.status == null ? "" : tk.status).trim().toLowerCase();
  if (status === "x" || status === "done" || status === "completed") return true;
  if (tk.checked === true && (!status || status === "x")) return true;
  if (!isTimelineControl && (noriaTlHasMeaningfulValue(tk.completion) || noriaTlHasMeaningfulValue(tk.done))) return true;
  const line = String(tk.text != null ? tk.text : tk.visual || "");
  if (/^\s*[-*]\s*\[[xX]\]/.test(line)) return true;
  if (!isTimelineControl && /\[(?:completion|done)::\s*(?!\s*(?:false|no|null|undefined|0)\s*\])([^\]]+)\]/i.test(line)) return true;
  return false;
}

function taskCancelled(tk) {
  if (!tk) return false;
  const status = String(tk.status == null ? "" : tk.status).trim().toLowerCase();
  if (status === "-" || status === "cancelled" || status === "canceled") return true;
  const checkboxState = String(tk.checkbox && tk.checkbox.state || "").trim().toLowerCase();
  if (checkboxState === "cancelled" || checkboxState === "canceled") return true;
  const line = String(tk.rawLine || tk.text || tk.visual || "");
  return /^\s*[-*]\s*\[-\]/.test(line);
}

function taskIncomplete(tk) {
  return !taskCompleted(tk) && !taskCancelled(tk);
}

function noriaTlNormalizeTimeStr(v) {
  const s = String(v == null ? "" : v).trim();
  const m0 = s.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!m0) return "";
  return `${String(m0[1]).padStart(2, "0")}:${m0[2]}`;
}

function noriaTlToMinutes(hhmm) {
  const s = noriaTlNormalizeTimeStr(hhmm);
  if (!s) return null;
  const p = s.split(":");
  return Number(p[0]) * 60 + Number(p[1]);
}

function noriaTlFromMinutes(totalMin) {
  let m0 = Number(totalMin);
  if (!Number.isFinite(m0)) m0 = 0;
  while (m0 < 0) m0 += 24 * 60;
  while (m0 >= 24 * 60) m0 -= 24 * 60;
  const h = Math.floor(m0 / 60);
  const mm = m0 % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function noriaTlFormatDurationCompact(totalMin) {
  const mins = Math.max(0, Math.round(Number(totalMin) || 0));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m0 = mins % 60;
  return m0 ? `${h}h${m0}m` : `${h}h`;
}

function noriaTlExtractInlineField(line, key) {
  if (!line) return "";
  const re = new RegExp(`\\[\\s*${key}\\s*::\\s*([^\\]]*)\\]`, "i");
  const m0 = String(line).match(re);
  return m0 && m0[1] != null ? String(m0[1]).trim() : "";
}

function noriaTlReadTaskDateTimeField(tk, key) {
  const line = String(tk && (tk.text != null ? tk.text : tk.visual || "") || "");
  const rawInline = noriaTlExtractInlineField(line, key);
  const raw = rawInline || (tk && tk[key] != null ? tk[key] : "");
  const ymd = luxonOrDateToYmd(raw);
  const hhmm = noriaTlNormalizeTimeStr(luxonOrDateToHm(raw));
  if (!ymd && !hhmm) return null;
  return { raw, ymd, hhmm };
}

function noriaTlStripInlineField(line, key) {
  return String(line || "").replace(new RegExp(`\\s*\\[\\s*${key}\\s*::\\s*[^\\]]*\\]`, "ig"), "");
}

function noriaTlUpsertInlineField(line, key, value) {
  let next = noriaTlStripInlineField(line, key).trimEnd();
  const val = String(value == null ? "" : value).trim();
  if (!val) return next;
  next += ` [${key}:: ${val}]`;
  return next;
}

function noriaTlPickTaskLineIndex(lines, lineIdx, tk) {
  if (!Array.isArray(lines) || !lines.length) return -1;
  const taskLineRe = /^\s*[-*]\s*\[[^\]\r\n]?\]\s*/;
  const comparableTitle = (value) => stripForDisplay(value).replace(taskLineRe, "").trim();
  const titleNeedle = comparableTitle(tk && (tk.rawText != null ? tk.rawText : (tk.text != null ? tk.text : tk.visual || "")));
  if (!titleNeedle) return -1;
  const matches = [];
  for (let i = 0; i < lines.length; i++) {
    const li = String(lines[i] || "");
    if (!taskLineRe.test(li)) continue;
    if (comparableTitle(li) === titleNeedle) matches.push(i);
  }
  return matches.length === 1 ? matches[0] : -1;
}

async function noriaTlMutateTaskLine(tk, mutator) {
  if (!app || !app.vault) return false;
  const rawPath = String((tk && (tk.path || (tk.link && tk.link.path))) || "").replace(/\\/g, "/");
  if (!rawPath) return false;
  const lineIdx = taskLineIndex(tk);
  const file = app.vault.getAbstractFileByPath(rawPath);
  if (!file || file.extension !== "md") return false;
  let changed = false;
  const applyMutation = (current) => {
    changed = false;
    const source = String(current || "");
    const lines = source.split(/\r?\n/);
    const idx = noriaTlPickTaskLineIndex(lines, lineIdx, tk);
    if (idx < 0 || idx >= lines.length) return source;
    const oldLine = String(lines[idx] || "");
    const newLineRaw = mutator(oldLine, { file, filePath: rawPath, lineIndex: idx });
    const newLine = typeof newLineRaw === "string" ? newLineRaw.trimEnd() : "";
    if (!newLine || newLine === oldLine) return source;
    lines[idx] = newLine;
    changed = true;
    return lines.join("\n");
  };
  if (typeof app.vault.process === "function") {
    await app.vault.process(file, applyMutation);
  } else {
    const text = await app.vault.read(file);
    const next = applyMutation(text);
    if (changed) await app.vault.modify(file, next);
  }
  if (!changed) return false;
  try {
    globalThis.__noriaRuntimeBridge?.refresh?.requestRefresh?.("timeline", "timeline-task-line-write");
  } catch (_) {}
  try {
    noriaTlQueueLocalRefresh();
  } catch (_) {}
  return true;
}

function noriaTlTaskCreatedMinute(tk, ymd) {
  const c0 = tk && (tk.created || tk.ctime || tk.fileCtime || tk.file && tk.file.ctime);
  if (!c0) return null;
  try {
    const cm = c0.toISO ? m(c0.toISO()) : m(c0);
    if (!cm.isValid()) return null;
    if (ymd && cm.format("YYYY-MM-DD") !== ymd) return null;
    return cm.hours() * 60 + cm.minutes();
  } catch (_) {}
  return null;
}

function noriaTlReadTaskTimeMeta(tk, ymd) {
  const tlCfg = (noriaTlReadPlannerLabControls().timeline || {});
  const preferInline = tlCfg.timeReadPriority !== "legacy-first" && tlCfg.inlineStartDueFirst !== false;
  const allowFallbackLegacy = tlCfg.fallbackStartDueTime !== false;
  const startMeta = noriaTlReadTaskDateTimeField(tk, "start");
  const dueMeta = noriaTlReadTaskDateTimeField(tk, "due");
  const inlineStartRaw = noriaTlNormalizeTimeStr((startMeta && startMeta.hhmm) || "");
  const inlineDueRaw = noriaTlNormalizeTimeStr((dueMeta && dueMeta.hhmm) || "");
  const legacyStartRaw = noriaTlNormalizeTimeStr(tk && (tk.startTime != null ? tk.startTime : noriaTlExtractInlineField(tk && (tk.text || tk.visual || ""), "startTime")));
  const legacyDueRaw = noriaTlNormalizeTimeStr(tk && (tk.dueTime != null ? tk.dueTime : noriaTlExtractInlineField(tk && (tk.text || tk.visual || ""), "dueTime")));
  let startRaw = "";
  let dueRaw = "";
  if (preferInline) {
    startRaw = inlineStartRaw || (allowFallbackLegacy ? legacyStartRaw : "");
    dueRaw = inlineDueRaw || (allowFallbackLegacy ? legacyDueRaw : "");
  } else {
    startRaw = legacyStartRaw || inlineStartRaw;
    dueRaw = legacyDueRaw || inlineDueRaw;
  }
  const startMin = noriaTlToMinutes(startRaw);
  const dueMin = noriaTlToMinutes(dueRaw);
  const hasTime = startMin != null || dueMin != null;
  let timeSortMin = null;
  let timeLabel = "";
  let timeMainLabel = "";
  let timeSecondaryLabel = "";
  let durationLabel = "";
  let durationMin = null;
  if (hasTime) {
    const st = startMin != null ? startMin : dueMin;
    const et = dueMin != null ? dueMin : (startMin != null ? Math.min(startMin + 30, 24 * 60 - 1) : null);
    timeSortMin = st;
    if (st != null && et != null) {
      timeMainLabel = noriaTlFromMinutes(st);
      timeSecondaryLabel = noriaTlFromMinutes(et);
      timeLabel = `${timeMainLabel}-${timeSecondaryLabel}`;
      durationMin = et >= st ? (et - st) : (24 * 60 - st + et);
    } else if (st != null) {
      timeMainLabel = noriaTlFromMinutes(st);
      timeLabel = timeMainLabel;
    }
  } else {
    const ideaMin = noriaTlTaskCreatedMinute(tk, ymd);
    if (ideaMin != null) {
      timeSortMin = ideaMin;
    }
  }
  if (durationMin != null && durationMin > 0) {
    durationLabel = noriaTlFormatDurationCompact(durationMin);
  } else {
    const dField = Number(tk && (tk.duration_min || tk.durationMin || noriaTlExtractInlineField(tk && (tk.text || tk.visual || ""), "duration_min")));
    if (Number.isFinite(dField) && dField > 0) {
      durationLabel = noriaTlFormatDurationCompact(dField);
      durationMin = dField;
    }
  }
  let sortRank = 2;
  if (hasTime) sortRank = 0;
  else if (timeSortMin != null) sortRank = 1;
  return {
    sortRank,
    timeSortMin: timeSortMin != null ? timeSortMin : 0,
    timeLabel,
    timeMainLabel,
    timeSecondaryLabel,
    durationLabel,
    hasTime,
    showNoTimeLabel: false,
    startMin: startMin != null ? startMin : null,
    endMin: dueMin != null ? dueMin : null
  };
}

function noriaTlNowMinutes(dateObj) {
  const d = dateObj instanceof Date ? dateObj : new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function noriaTlClampDayMinute(totalMin) {
  const n = Number(totalMin);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(24 * 60 - 1, Math.round(n)));
}

function noriaTlSnapCreateMinute(totalMin, snapMinutes, mode) {
  const step = Math.max(1, Math.min(60, Number(snapMinutes) || 5));
  const n = noriaTlClampDayMinute(totalMin);
  let snapped;
  if (mode === "ceil") snapped = Math.ceil(n / step) * step;
  else snapped = Math.round(n / step) * step;
  return noriaTlClampDayMinute(snapped);
}

function noriaTlMetaStartForInsert(meta) {
  if (!meta || meta.hasTime !== true) return null;
  if (meta.startMin != null) return Number(meta.startMin);
  if (meta.timeSortMin != null) return Number(meta.timeSortMin);
  return null;
}

function noriaTlMetaEndForInsert(meta, defaultDurationMin) {
  if (!meta || meta.hasTime !== true) return null;
  const start = noriaTlMetaStartForInsert(meta);
  if (start == null || !Number.isFinite(start)) return null;
  const rawEnd = meta.endMin != null ? Number(meta.endMin) : null;
  if (Number.isFinite(rawEnd) && rawEnd >= start) return rawEnd;
  return Math.min(24 * 60 - 1, start + Math.max(5, Number(defaultDurationMin) || 30));
}

function noriaTlPickNowMarkerIndex(metas, nowMin) {
  if (!Array.isArray(metas) || !metas.length) return -1;
  const n = noriaTlClampDayMinute(nowMin);
  let lastTimedIndex = -1;
  for (let i = 0; i < metas.length; i++) {
    const start = noriaTlMetaStartForInsert(metas[i]);
    if (start == null || !Number.isFinite(start)) continue;
    if (n < start) return i;
    lastTimedIndex = i;
  }
  return lastTimedIndex >= 0 ? lastTimedIndex + 1 : -1;
}

function noriaTlInferBlankCreateStartMin({ prevMeta, nextMeta, nowMin, fallbackMin, snapMinutes, defaultDurationMin } = {}) {
  const prevEnd = noriaTlMetaEndForInsert(prevMeta, defaultDurationMin);
  const nextStart = noriaTlMetaStartForInsert(nextMeta);
  let candidate = null;
  let snapMode = "nearest";
  if (prevEnd != null && Number.isFinite(prevEnd) && nextStart != null && Number.isFinite(nextStart) && nextStart >= prevEnd) {
    candidate = (prevEnd + nextStart) / 2;
  } else if (prevEnd != null && Number.isFinite(prevEnd)) {
    candidate = prevEnd;
  } else if (nextStart != null && Number.isFinite(nextStart)) {
    candidate = Math.max(0, nextStart - Math.max(5, Number(defaultDurationMin) || 30));
  } else if (nowMin != null && Number.isFinite(Number(nowMin))) {
    candidate = Number(nowMin);
    snapMode = "ceil";
  } else {
    candidate = Number(fallbackMin);
    snapMode = "ceil";
  }
  if (!Number.isFinite(candidate)) candidate = 9 * 60;
  return noriaTlSnapCreateMinute(candidate, snapMinutes, snapMode);
}

function noriaTlScheduleNowMarkerRefresh(rerender, enabled) {
  try {
    if (noriaTlNowMarkerRefreshTimer) {
      clearTimeout(noriaTlNowMarkerRefreshTimer);
      noriaTlNowMarkerRefreshTimer = null;
    }
    if (!enabled || typeof rerender !== "function") return;
    const now = new Date();
    const delay = Math.max(1000, 60000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 80);
    noriaTlNowMarkerRefreshTimer = setTimeout(() => {
      noriaTlNowMarkerRefreshTimer = null;
      rerender();
    }, delay);
  } catch (_) {}
}

function noriaTlCompareTasksForDay(a, b, ymd) {
  const tlCfg = (noriaTlReadPlannerLabControls().timeline || {});
  const policy = String(tlCfg.sortPolicy || "time-priority");
  const ma = noriaTlReadTaskTimeMeta(a, ymd);
  const mb = noriaTlReadTaskTimeMeta(b, ymd);
  if (policy === "line-first") {
    const la0 = taskLineIndex(a);
    const lb0 = taskLineIndex(b);
    if (la0 >= 0 && lb0 >= 0 && la0 !== lb0) return la0 - lb0;
  }
  if (policy === "created-first") {
    const ca = noriaTlTaskCreatedMinute(a, ymd);
    const cb = noriaTlTaskCreatedMinute(b, ymd);
    if (ca != null && cb != null && ca !== cb) return ca - cb;
  }
  if (ma.sortRank !== mb.sortRank) return ma.sortRank - mb.sortRank;
  if (ma.timeSortMin !== mb.timeSortMin) return ma.timeSortMin - mb.timeSortMin;
  if (String(tlCfg.unplannedSortMode || "line") === "created") {
    const ca2 = noriaTlTaskCreatedMinute(a, ymd);
    const cb2 = noriaTlTaskCreatedMinute(b, ymd);
    if (ca2 != null && cb2 != null && ca2 !== cb2) return ca2 - cb2;
  }
  const la = taskLineIndex(a);
  const lb = taskLineIndex(b);
  if (la < 0 && lb < 0) return 0;
  if (la < 0) return 1;
  if (lb < 0) return -1;
  return la - lb;
}

function noriaTlParseTimeLog(raw) {
  const text = String(raw || "").trim();
  if (!text) return [];
  const parts = text.split(";").map((x) => String(x || "").trim()).filter(Boolean);
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i].split(">");
    const s = String(seg[0] || "").trim();
    const e = String(seg[1] || "").trim();
    if (!s) continue;
    out.push({ start: s, end: e || "" });
  }
  return out;
}

function noriaTlNormalizeTaskLineSpaces(line) {
  return String(line || "").replace(/\s{2,}/g, " ").trimEnd();
}

function noriaTlCloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return null;
  }
}

function noriaTlStableHash(value) {
  const text = String(value || "");
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}

function noriaTlCreatePomodoroTaskKey(seed) {
  const s = String(seed || "").trim();
  if (s) return `zp_${noriaTlStableHash(s)}`;
  return `zp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function noriaTlPomodoroInternalKeyForLegacyKey(key) {
  const k = String(key || "").trim();
  if (!k) return "";
  if (/^zp_[a-z0-9]+$/i.test(k)) return k;
  return noriaTlCreatePomodoroTaskKey(`legacy:${k}`);
}

function noriaTlDefaultPomodoroState() {
  return {
    version: 2,
    workLen: 25,
    breakLen: 5,
    autostartBreak: false,
    active: null,
    activeAttachTaskKey: "",
    tasks: {}
  };
}

function noriaTlNormalizePomodoroState(raw) {
  const base = noriaTlDefaultPomodoroState();
  const src = raw && typeof raw === "object" ? raw : {};
  const workLen = Number(src.workLen);
  const breakLen = Number(src.breakLen);
  const out = {
    ...base,
    ...src,
    version: 2,
    workLen: Number.isFinite(workLen) && workLen > 0 ? Math.max(1, Math.min(240, Math.round(workLen))) : base.workLen,
    breakLen: Number.isFinite(breakLen) && breakLen >= 0 ? Math.max(0, Math.min(120, Math.round(breakLen))) : base.breakLen,
    autostartBreak: src.autostartBreak === true,
    active: src.active && typeof src.active === "object" ? { ...src.active } : null,
    activeAttachTaskKey: "",
    tasks: {}
  };
  const tasks = src.tasks && typeof src.tasks === "object" && !Array.isArray(src.tasks) ? src.tasks : {};
  const keyMap = {};
  Object.keys(tasks).forEach((key) => {
    const rec = tasks[key] && typeof tasks[key] === "object" ? tasks[key] : {};
    const actual = Number(rec.actual);
    const expected = Number(rec.expected);
    const nextKey = noriaTlPomodoroInternalKeyForLegacyKey(key);
    keyMap[key] = nextKey;
    const lineHint = Number(rec.lineHint != null ? rec.lineHint : rec.line);
    out.tasks[nextKey] = {
      path: String(rec.path || ""),
      lineHint: Number.isFinite(lineHint) && lineHint >= 0 ? Math.floor(lineHint) : -1,
      textFingerprint: String(rec.textFingerprint || ""),
      titleSnapshot: String(rec.titleSnapshot || ""),
      actual: Number.isFinite(actual) && actual > 0 ? Math.floor(actual) : 0,
      expected: Number.isFinite(expected) && expected > 0 ? Math.floor(expected) : 0,
      sessions: Array.isArray(rec.sessions)
        ? rec.sessions.map((seg) => ({
          mode: String(seg && seg.mode || "WORK").toUpperCase() === "BREAK" ? "BREAK" : "WORK",
          start: String(seg && seg.start || ""),
          end: String(seg && seg.end || ""),
          durationMin: Math.max(0, Math.floor(Number(seg && seg.durationMin) || 0)),
          completed: (seg && seg.completed) === true
        })).filter((seg) => seg.start)
        : []
    };
  });
  const rawAttachKey = String(src.activeAttachTaskKey || "").trim();
  out.activeAttachTaskKey = rawAttachKey ? (keyMap[rawAttachKey] || noriaTlPomodoroInternalKeyForLegacyKey(rawAttachKey)) : "";
  if (out.activeAttachTaskKey && !out.tasks[out.activeAttachTaskKey]) out.activeAttachTaskKey = "";
  if (out.active) {
    const rawTaskKey = String(out.active.taskKey || "").trim();
    const taskKey = keyMap[rawTaskKey] || noriaTlPomodoroInternalKeyForLegacyKey(rawTaskKey);
    if (!taskKey || !out.tasks[taskKey]) {
      out.active = null;
    } else {
      const elapsedMs = Number(out.active.elapsedMs);
      const durationMin = Number(out.active.durationMin);
      out.active = {
        taskKey,
        mode: String(out.active.mode || "WORK").toUpperCase() === "BREAK" ? "BREAK" : "WORK",
        status: String(out.active.status || "running").toLowerCase() === "paused" ? "paused" : "running",
        startedAt: String(out.active.startedAt || ""),
        elapsedMs: Number.isFinite(elapsedMs) && elapsedMs > 0 ? Math.floor(elapsedMs) : 0,
        durationMin: Number.isFinite(durationMin) && durationMin > 0 ? Math.round(durationMin) : (String(out.active.mode || "").toUpperCase() === "BREAK" ? out.breakLen : out.workLen)
      };
    }
  }
  return out;
}

function noriaTlExtractTaskBlockId(line) {
  const m0 = String(line || "").match(/\s(\^[A-Za-z0-9-]+)\s*$/u);
  return m0 && m0[1] ? String(m0[1]) : "";
}

function noriaTlParsePomodoroShort(line) {
  const m0 = String(line || "").match(/[\[(]\s*🍅::\s*(\d*)\s*(?:\/\s*(\d+))?\s*[\])]/u);
  if (!m0) return { actual: 0, expected: 0, found: false };
  const actual = Number(m0[1]);
  const expected = Number(m0[2]);
  return {
    actual: Number.isFinite(actual) && actual > 0 ? Math.floor(actual) : 0,
    expected: Number.isFinite(expected) && expected > 0 ? Math.floor(expected) : 0,
    found: true
  };
}

function noriaTlStripPomodoroShort(line) {
  return String(line || "").replace(/\s*[\[(]\s*🍅::\s*[^\])]*[\])]/gu, "");
}

function noriaTlStripPomodoroNoiseFromLine(line) {
  let next = noriaTlStripInlineField(line, "timeLog");
  next = noriaTlStripInlineField(next, "timer_running");
  next = noriaTlStripPomodoroShort(next);
  next = String(next || "").replace(/\s+\^noria[A-Za-z0-9-]+\s*$/u, "");
  return noriaTlNormalizeTaskLineSpaces(next);
}

function noriaTlStripLegacyPomodoroFields(line) {
  return noriaTlStripPomodoroNoiseFromLine(line);
}

function noriaTlFingerprintSourceFromLine(line) {
  return noriaTlStripPomodoroNoiseFromLine(line)
    .replace(/^\s*[-*+]\s+\[[^\]]\]\s*/u, "")
    .replace(/^\s*\d+\.\s+\[[^\]]\]\s*/u, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function noriaTlBuildTaskFingerprint(value) {
  const raw = typeof value === "string"
    ? value
    : String(value && (value.text != null ? value.text : value.visual || value.line || "") || "");
  return `fp_${noriaTlStableHash(noriaTlFingerprintSourceFromLine(raw))}`;
}

function noriaTlPomodoroMetaFromTask(tk, opts) {
  const options = opts && typeof opts === "object" ? opts : {};
  const line = String(options.line != null ? options.line : (tk && (tk.text != null ? tk.text : tk.visual || "")) || "");
  const path = String(options.path || (tk && (tk.path || (tk.link && tk.link.path))) || "").replace(/\\/g, "/");
  const rawLineHint = options.lineHint != null ? options.lineHint : taskLineIndex(tk);
  const lineHint = Number(rawLineHint);
  const short = noriaTlParsePomodoroShort(line);
  return {
    taskKey: String(options.taskKey || "").trim(),
    path,
    lineHint: Number.isFinite(lineHint) && lineHint >= 0 ? Math.floor(lineHint) : -1,
    textFingerprint: noriaTlBuildTaskFingerprint(line),
    actual: short.actual,
    expected: short.expected,
    title: String(options.title || stripForDisplay(line) || "")
  };
}

function noriaTlTaskKeyForPomodoro(path, blockId) {
  const p = String(path || "").replace(/\\/g, "/").trim();
  const b = String(blockId || "").trim();
  return p && b ? noriaTlPomodoroInternalKeyForLegacyKey(`${p}#${b}`) : "";
}

function noriaTlDurationBetweenIsoMin(startIso, endIso) {
  const s = Date.parse(String(startIso || ""));
  const e = Date.parse(String(endIso || ""));
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 0;
  return Math.max(0, Math.floor((e - s) / 60000));
}

function noriaTlResolvePomodoroTaskRecord(tkOrMeta, state) {
  const s = noriaTlNormalizePomodoroState(state);
  const meta = tkOrMeta && (tkOrMeta.textFingerprint || tkOrMeta.lineHint != null || tkOrMeta.title)
    ? {
      taskKey: String(tkOrMeta.taskKey || "").trim(),
      path: String(tkOrMeta.path || "").replace(/\\/g, "/"),
      lineHint: Number.isFinite(Number(tkOrMeta.lineHint)) ? Math.floor(Number(tkOrMeta.lineHint)) : -1,
      textFingerprint: String(tkOrMeta.textFingerprint || ""),
      title: String(tkOrMeta.title || "")
    }
    : noriaTlPomodoroMetaFromTask(tkOrMeta);
  if (meta.taskKey && s.tasks[meta.taskKey]) return { taskKey: meta.taskKey, record: s.tasks[meta.taskKey], meta };
  const keys = Object.keys(s.tasks);
  let fingerprintMatch = null;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const rec = s.tasks[key];
    if (!rec || String(rec.path || "").replace(/\\/g, "/") !== meta.path) continue;
    if (Number(rec.lineHint) === meta.lineHint && rec.textFingerprint && rec.textFingerprint === meta.textFingerprint) {
      return { taskKey: key, record: rec, meta };
    }
    if (rec.textFingerprint && rec.textFingerprint === meta.textFingerprint) {
      if (fingerprintMatch) return { taskKey: "", record: null, meta };
      fingerprintMatch = { taskKey: key, record: rec, meta };
    }
  }
  return fingerprintMatch || { taskKey: "", record: null, meta };
}

function noriaTlEnsurePomodoroRecord(state, meta) {
  const s = noriaTlNormalizePomodoroState(state);
  const resolved = noriaTlResolvePomodoroTaskRecord(meta, s);
  const taskKey = String((meta && meta.taskKey) || (resolved && resolved.taskKey) || noriaTlCreatePomodoroTaskKey(`${meta && meta.path || ""}:${meta && meta.lineHint != null ? meta.lineHint : ""}:${meta && meta.textFingerprint || ""}`)).trim();
  if (!taskKey) return { state: s, record: null };
  const prev = s.tasks[taskKey] && typeof s.tasks[taskKey] === "object" ? s.tasks[taskKey] : {};
  const parsedActual = Number(meta && meta.actual);
  const parsedExpected = Number(meta && meta.expected);
  s.tasks[taskKey] = {
    path: String(meta && meta.path || prev.path || ""),
    lineHint: Number.isFinite(Number(meta && meta.lineHint)) && Number(meta.lineHint) >= 0 ? Math.floor(Number(meta.lineHint)) : (Number.isFinite(Number(prev.lineHint)) ? Math.floor(Number(prev.lineHint)) : -1),
    textFingerprint: String(meta && meta.textFingerprint || prev.textFingerprint || ""),
    titleSnapshot: String(meta && meta.title || prev.titleSnapshot || ""),
    actual: Math.max(Number.isFinite(parsedActual) ? Math.floor(parsedActual) : 0, Number(prev.actual) || 0),
    expected: Number.isFinite(parsedExpected) && parsedExpected > 0 ? Math.floor(parsedExpected) : Math.max(0, Number(prev.expected) || 0),
    sessions: Array.isArray(prev.sessions) ? prev.sessions.slice() : []
  };
  return { state: s, record: s.tasks[taskKey] };
}

function noriaTlMigrateLegacyPomodoroLine(line, opts) {
  const options = opts && typeof opts === "object" ? opts : {};
  const path = String(options.path || "").replace(/\\/g, "/");
  const lineHint = Number(options.lineHint);
  const cleanLine = noriaTlStripPomodoroNoiseFromLine(line);
  const textFingerprint = noriaTlBuildTaskFingerprint(cleanLine);
  const legacyKey = options.blockId ? `${path}#${String(options.blockId).trim()}` : "";
  const taskKey = String(options.taskKey || (legacyKey ? noriaTlPomodoroInternalKeyForLegacyKey(legacyKey) : noriaTlCreatePomodoroTaskKey(`${path}:${Number.isFinite(lineHint) ? Math.floor(lineHint) : ""}:${textFingerprint}`)));
  const workLen = Math.max(1, Math.floor(Number(options.workLen) || 25));
  const parsedShort = noriaTlParsePomodoroShort(line);
  const segments = noriaTlParseTimeLog(noriaTlExtractInlineField(line, "timeLog"));
  const runningStart = String(noriaTlExtractInlineField(line, "timer_running") || "").trim();
  const migrationEnd = String(options.nowIso || "").trim();
  let closedTotal = 0;
  const sessions = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const end = String(seg.end || "").trim();
    if (!end) continue;
    const durationMin = noriaTlDurationBetweenIsoMin(seg.start, end);
    closedTotal += durationMin;
    sessions.push({
      mode: "WORK",
      start: String(seg.start || ""),
      end,
      durationMin,
      completed: durationMin >= workLen
    });
  }
  if (runningStart) {
    const durationMin = migrationEnd ? noriaTlDurationBetweenIsoMin(runningStart, migrationEnd) : 0;
    sessions.push({
      mode: "WORK",
      start: runningStart,
      end: migrationEnd,
      durationMin,
      completed: false
    });
  }
  const actual = Math.max(parsedShort.actual, Math.floor(closedTotal / workLen));
  const expected = parsedShort.expected || Math.max(0, Number(options.expected) || 0);
  const task = {
    path,
    lineHint: Number.isFinite(lineHint) && lineHint >= 0 ? Math.floor(lineHint) : -1,
    textFingerprint,
    titleSnapshot: String(options.title || stripForDisplay(cleanLine) || ""),
    actual,
    expected,
    sessions
  };
  return { line: cleanLine, taskKey, task };
}

function noriaTlActiveElapsedMs(active, nowIso) {
  if (!active) return 0;
  let elapsed = Math.max(0, Math.floor(Number(active.elapsedMs) || 0));
  if (String(active.status || "") === "running") {
    const start = Date.parse(String(active.startedAt || ""));
    const now = Date.parse(String(nowIso || new Date().toISOString()));
    if (Number.isFinite(start) && Number.isFinite(now)) elapsed += Math.max(0, now - start);
  }
  return elapsed;
}

function noriaTlCloseActivePomodoroSession(state, nowIso, completed) {
  const s = noriaTlNormalizePomodoroState(state);
  const active = s.active;
  if (!active || !s.tasks[active.taskKey]) return s;
  const rec = s.tasks[active.taskKey];
  const sessions = Array.isArray(rec.sessions) ? rec.sessions : [];
  const last = sessions.length ? sessions[sessions.length - 1] : null;
  const elapsedMs = noriaTlActiveElapsedMs(active, nowIso);
  const durationMin = Math.max(0, Math.floor(elapsedMs / 60000));
  if (last && !last.end && last.mode === active.mode) {
    last.end = String(nowIso || new Date().toISOString());
    last.durationMin = completed ? Math.max(last.durationMin || 0, Math.round(Number(active.durationMin) || durationMin)) : durationMin;
    last.completed = completed === true;
  }
  if (completed === true && active.mode === "WORK") {
    rec.actual = Math.max(0, Math.floor(Number(rec.actual) || 0)) + 1;
  }
  s.activeAttachTaskKey = active.taskKey;
  s.active = null;
  return s;
}

function noriaTlStartPomodoroWork(state, meta, nowIso) {
  const iso = String(nowIso || new Date().toISOString());
  let s = noriaTlNormalizePomodoroState(state);
  if (s.active) s = noriaTlCloseActivePomodoroSession(s, iso, false);
  const ensured = noriaTlEnsurePomodoroRecord(s, meta);
  s = ensured.state;
  const rec = ensured.record;
  if (!rec) return s;
  rec.sessions.push({ mode: "WORK", start: iso, end: "", durationMin: 0, completed: false });
  const ensuredKey = Object.keys(s.tasks).find((key) => s.tasks[key] === rec) || String(meta.taskKey || "");
  s.active = {
    taskKey: ensuredKey,
    mode: "WORK",
    status: "running",
    startedAt: iso,
    elapsedMs: 0,
    durationMin: s.workLen
  };
  s.activeAttachTaskKey = ensuredKey;
  return s;
}

function noriaTlPausePomodoro(state, nowIso) {
  const s = noriaTlNormalizePomodoroState(state);
  if (!s.active || s.active.status !== "running") return s;
  s.active.elapsedMs = noriaTlActiveElapsedMs(s.active, nowIso);
  s.active.status = "paused";
  s.active.startedAt = "";
  return s;
}

function noriaTlResumePomodoro(state, nowIso) {
  const s = noriaTlNormalizePomodoroState(state);
  if (!s.active || s.active.status !== "paused") return s;
  s.active.status = "running";
  s.active.startedAt = String(nowIso || new Date().toISOString());
  return s;
}

function noriaTlTickPomodoro(state, nowIso) {
  let s = noriaTlNormalizePomodoroState(state);
  const active = s.active;
  if (!active || active.status !== "running") return s;
  const targetMs = Math.max(1, Math.round(Number(active.durationMin) || (active.mode === "BREAK" ? s.breakLen : s.workLen))) * 60000;
  if (noriaTlActiveElapsedMs(active, nowIso) < targetMs) return s;
  const completedMode = active.mode;
  const taskKey = active.taskKey;
  s = noriaTlCloseActivePomodoroSession(s, nowIso, true);
  if (completedMode === "WORK" && s.breakLen > 0 && s.tasks[taskKey]) {
    const rec = s.tasks[taskKey];
    rec.sessions.push({ mode: "BREAK", start: String(nowIso || new Date().toISOString()), end: "", durationMin: 0, completed: false });
    s.active = {
      taskKey,
      mode: "BREAK",
      status: s.autostartBreak ? "running" : "paused",
      startedAt: s.autostartBreak ? String(nowIso || new Date().toISOString()) : "",
      elapsedMs: 0,
      durationMin: s.breakLen
    };
    s.activeAttachTaskKey = taskKey;
  }
  return s;
}

function noriaTlStopPomodoro(state, nowIso) {
  return noriaTlCloseActivePomodoroSession(state, nowIso || new Date().toISOString(), false);
}

function noriaTlTransferPomodoroTask(state, meta, nowIso) {
  const iso = String(nowIso || new Date().toISOString());
  let s = noriaTlNormalizePomodoroState(state);
  if (s.active) s = noriaTlCloseActivePomodoroSession(s, iso, false);
  return noriaTlStartPomodoroWork(s, meta, iso);
}

function noriaTlFormatPomodoroCountdown(ms) {
  const safe = Math.max(0, Math.ceil(Number(ms) || 0));
  const totalSec = Math.ceil(safe / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function noriaTlBuildTaskPomodoroSummary(state, taskKey, opts) {
  const s = noriaTlNormalizePomodoroState(state);
  const key = String(taskKey || "").trim();
  const rec = key ? s.tasks[key] : null;
  const active = s.active && s.active.taskKey === key ? s.active : null;
  const attached = !!(key && s.activeAttachTaskKey === key);
  const nowIso = opts && opts.nowIso ? String(opts.nowIso) : new Date().toISOString();
  if (active) {
    const targetMs = Math.max(1, Number(active.durationMin) || (active.mode === "BREAK" ? s.breakLen : s.workLen)) * 60000;
    const remaining = Math.max(0, targetMs - noriaTlActiveElapsedMs(active, nowIso));
    const label = active.mode === "BREAK" ? "BREAK" : (active.status === "paused" ? "PAUSED" : "WORK");
    return {
      visible: true,
      active: true,
      attached: true,
      running: active.status === "running",
      mode: active.mode,
      status: active.status,
      primaryText: `${label} ${noriaTlFormatPomodoroCountdown(remaining)}`,
      progressText: `${NORIA_TL_POMODORO_EMOJI} ${Math.max(0, Number(rec && rec.actual) || 0)}${rec && rec.expected ? `/${rec.expected}` : ""}`,
      titleText: `${label} ${noriaTlFormatPomodoroCountdown(remaining)}`
    };
  }
  if (rec && attached) {
    const hasProgress = Number(rec.actual) > 0 || Number(rec.expected) > 0;
    return {
      visible: true,
      active: false,
      attached,
      running: false,
      mode: "",
      status: "",
      primaryText: hasProgress ? `${NORIA_TL_POMODORO_EMOJI} ${Math.max(0, Number(rec.actual) || 0)}${rec.expected ? `/${rec.expected}` : ""}` : "",
      progressText: "",
      titleText: hasProgress
        ? `${noriaTlRuntimeT("runtime.timeline.pomodoro.title")} ${Math.max(0, Number(rec.actual) || 0)}${rec.expected ? `/${rec.expected}` : ""}`
        : noriaTlRuntimeT("runtime.timeline.pomodoro.attached")
    };
  }
  return { visible: false, active: false, attached: false, running: false, mode: "", status: "", primaryText: "", progressText: "", titleText: noriaTlRuntimeT("runtime.timeline.pomodoro.title") };
}

function noriaTlPomodoroRecordHasHistory(rec) {
  return !!(rec && (Number(rec.actual) > 0 || Number(rec.expected) > 0 || (Array.isArray(rec.sessions) && rec.sessions.length > 0)));
}

function noriaTlBuildPomodoroAttachKeySet(keys) {
  const out = new Set();
  const list = Array.isArray(keys) ? keys : [keys];
  list.forEach((value) => {
    const raw = String(value || "").trim();
    if (!raw) return;
    out.add(raw);
    try {
      const canonical = noriaTlPomodoroInternalKeyForLegacyKey(raw);
      if (canonical) out.add(canonical);
    } catch (_) {}
  });
  return out;
}

function noriaTlDetachPomodoroState(rawState, keys, nowIso) {
  let state = noriaTlNormalizePomodoroState(rawState);
  const detachKeys = noriaTlBuildPomodoroAttachKeySet(keys);
  if (!detachKeys.size) return state;
  if (state.active && detachKeys.has(state.active.taskKey)) {
    state = noriaTlStopPomodoro(state, nowIso || new Date().toISOString());
  }
  if (state.activeAttachTaskKey && detachKeys.has(state.activeAttachTaskKey)) {
    state.activeAttachTaskKey = "";
  }
  Object.keys(state.tasks).forEach((taskKey) => {
    if (!detachKeys.has(taskKey)) return;
    if (!noriaTlPomodoroRecordHasHistory(state.tasks[taskKey])) delete state.tasks[taskKey];
  });
  return noriaTlNormalizePomodoroState(state);
}

function noriaTlSetElText(el, text) {
  if (!el) return;
  if (typeof el.setText === "function") el.setText(String(text || ""));
  else el.textContent = String(text || "");
}

function noriaTlCssEscape(value) {
  const s = String(value || "");
  try {
    if (typeof CSS !== "undefined" && CSS && typeof CSS.escape === "function") return CSS.escape(s);
  } catch (_) {}
  return s.replace(/["\\]/g, "\\$&");
}

function noriaTlTaskCardFromPomodoroDock(dock) {
  try {
    return dock && typeof dock.closest === "function" ? dock.closest(".noria-tl-col-card") : null;
  } catch (_) {
    return null;
  }
}

function noriaTlApplyPomodoroDockSummary(dock, summary) {
  if (!dock) return;
  const s = summary || { visible: false, running: false, primaryText: "", progressText: "", titleText: noriaTlRuntimeT("runtime.timeline.pomodoro.title") };
  dock.classList.toggle("is-running", !!s.running);
  dock.classList.toggle("is-paused", s.status === "paused");
  dock.classList.toggle("is-break", s.mode === "BREAK");
  dock.classList.toggle("is-empty", !s.visible);
  dock.classList.toggle("is-attached", !!s.attached);
  const stats = dock.querySelector(".noria-tl-pomodoro-stats");
  const minEl = dock.querySelector(".noria-tl-pomodoro-min");
  const rangeEl = dock.querySelector(".noria-tl-pomodoro-range");
  const toggleBtn = dock.querySelector(".noria-tl-pomodoro-toggle");
  const pomodoroBtn = dock.querySelector(".noria-tl-pomodoro-btn");
  if (minEl) noriaTlSetElText(minEl, s.visible ? s.primaryText : "");
  if (rangeEl) noriaTlSetElText(rangeEl, s.progressText || "");
  if (stats) stats.classList.toggle("is-empty", !s.visible);
  if (toggleBtn) noriaTlSetElText(toggleBtn, s.running ? "Ⅱ" : "▶");
  if (pomodoroBtn) {
    pomodoroBtn.setAttribute("aria-label", s.running ? noriaTlRuntimeT("runtime.timeline.pomodoro.pause") : noriaTlRuntimeT("runtime.timeline.pomodoro.startOrResume"));
    pomodoroBtn.setAttribute("title", s.visible ? s.titleText : noriaTlRuntimeT("runtime.timeline.pomodoro.startOrResume"));
  }
}

function noriaTlPatchExistingPomodoroDocksForKey(taskKey, state) {
  const key = String(taskKey || "").trim();
  if (!key || typeof document === "undefined") return;
  const s = state ? noriaTlNormalizePomodoroState(state) : noriaTlReadPomodoroState();
  const summary = noriaTlBuildTaskPomodoroSummary(s, key);
  let docks = [];
  try {
    docks = Array.from(document.querySelectorAll(`.noria-tl-pomodoro-dock[data-pomodoro-key="${noriaTlCssEscape(key)}"]`));
  } catch (_) {
    docks = [];
  }
  for (let i = 0; i < docks.length; i++) {
    const dock = docks[i];
    if (!summary.visible) {
      const card = noriaTlTaskCardFromPomodoroDock(dock);
      try { dock.remove(); } catch (_) {}
      if (card && !card.querySelector(".noria-tl-pomodoro-dock")) card.classList.remove("noria-tl-has-pomodoro");
      continue;
    }
    noriaTlApplyPomodoroDockSummary(dock, summary);
  }
}

function noriaTlRefreshVisiblePomodoroDocks(state) {
  if (typeof document === "undefined") return;
  const s = state ? noriaTlNormalizePomodoroState(state) : noriaTlReadPomodoroState();
  let docks = [];
  try {
    docks = Array.from(document.querySelectorAll(".noria-tl-pomodoro-dock[data-pomodoro-key]"));
  } catch (_) {
    docks = [];
  }
  for (let i = 0; i < docks.length; i++) {
    const key = String(docks[i].getAttribute("data-pomodoro-key") || "");
    if (key) noriaTlPatchExistingPomodoroDocksForKey(key, s);
  }
}

function noriaTlEnsurePomodoroDock(card, tk, taskKey, state, timeMeta) {
  const key = String(taskKey || "").trim();
  if (!card || !tk || !key) return null;
  const s = state ? noriaTlNormalizePomodoroState(state) : noriaTlReadPomodoroState();
  const summary = noriaTlBuildTaskPomodoroSummary(s, key);
  if (!summary.visible) {
    noriaTlPatchExistingPomodoroDocksForKey(key, s);
    return null;
  }
  card.classList.add("noria-tl-has-pomodoro");
  let pomodoroDock = null;
  try { pomodoroDock = card.querySelector(".noria-tl-pomodoro-dock"); } catch (_) {}
  if (!pomodoroDock) {
    pomodoroDock = card.createDiv({ cls: "noria-tl-pomodoro-dock" });
    pomodoroDock.setAttribute("draggable", "true");
    pomodoroDock.addEventListener("dragstart", (ev) => {
      try {
        if (ev && ev.dataTransfer) {
          ev.dataTransfer.effectAllowed = "move";
          const dragSourceKey = String(globalThis.__noriaTimelineActiveTimerAttachKey || pomodoroDock.getAttribute("data-pomodoro-key") || "");
          ev.dataTransfer.setData("text/plain", NORIA_TL_TIMER_ATTACH_TOKEN);
          ev.dataTransfer.setData(NORIA_TL_TIMER_ATTACH_MIME, JSON.stringify({ sourceKey: dragSourceKey }));
        }
      } catch (_) {}
      pomodoroDock.classList.add("is-dragging");
    });
    pomodoroDock.addEventListener("dragend", () => {
      pomodoroDock.classList.remove("is-dragging");
    });
    const pomodoroBtn = pomodoroDock.createEl("button", {
      cls: "noria-tl-pomodoro-btn",
      text: NORIA_TL_POMODORO_EMOJI,
      type: "button",
      attr: { "aria-label": noriaTlRuntimeT("runtime.timeline.pomodoro.startOrResume"), title: noriaTlRuntimeT("runtime.timeline.pomodoro.startOrResume") }
    });
    const stats = pomodoroDock.createDiv({ cls: "noria-tl-pomodoro-stats" });
    stats.createSpan({ cls: "noria-tl-pomodoro-min" });
    stats.createSpan({ cls: "noria-tl-pomodoro-range" });
    const controls = pomodoroDock.createDiv({ cls: "noria-tl-pomodoro-controls" });
    const toggleBtn = controls.createEl("button", {
      cls: "noria-tl-pomodoro-action noria-tl-pomodoro-toggle",
      text: "▶",
      type: "button",
      attr: { "aria-label": noriaTlRuntimeT("runtime.timeline.pomodoro.startOrResume"), title: noriaTlRuntimeT("runtime.timeline.pomodoro.startOrResume") }
    });
    const stopBtn = controls.createEl("button", {
      cls: "noria-tl-pomodoro-action noria-tl-pomodoro-stop",
      text: "■",
      type: "button",
      attr: { "aria-label": noriaTlRuntimeT("runtime.timeline.pomodoro.stop"), title: noriaTlRuntimeT("runtime.timeline.pomodoro.stop") }
    });
    const closeBtn = pomodoroDock.createEl("button", {
      cls: "noria-tl-pomodoro-close",
      text: "×",
      type: "button",
      attr: { "aria-label": noriaTlRuntimeT("runtime.timeline.pomodoro.detach"), title: noriaTlRuntimeT("runtime.timeline.pomodoro.detach") }
    });
    const doToggle = async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const res = await noriaTlStartOrTogglePomodoro(tk);
      if (!res || !res.ok) return;
      const nextKey = res.meta && res.meta.taskKey ? res.meta.taskKey : String(pomodoroDock.getAttribute("data-pomodoro-key") || "");
      if (res.previousKey && res.previousKey !== nextKey) noriaTlPatchExistingPomodoroDocksForKey(res.previousKey, res.state);
      noriaTlEnsurePomodoroDock(card, tk, nextKey, res.state, timeMeta);
      try {
        const N = window.Notice;
        if (N) new N(res.summary && res.summary.running ? noriaTlRuntimeT("runtime.timeline.pomodoro.started") : noriaTlRuntimeT("runtime.timeline.pomodoro.paused"), 1400);
      } catch (_) {}
    };
    pomodoroBtn.addEventListener("click", doToggle);
    toggleBtn.addEventListener("click", doToggle);
    stopBtn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const res = await noriaTlStopPomodoroForTask(tk);
      if (!res || !res.ok) return;
      noriaTlEnsurePomodoroDock(card, tk, res.meta.taskKey, res.state, timeMeta);
      try {
        const N = window.Notice;
        if (N) new N(noriaTlRuntimeT("runtime.timeline.pomodoro.stopped"), 1400);
      } catch (_) {}
    });
    pomodoroBtn.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      noriaTlShowTimerMenu(ev, tk, pomodoroDock, null, !!(timeMeta && timeMeta.durationLabel), key);
    });
    closeBtn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const before = noriaTlReadPomodoroState();
      const closeKey = String(pomodoroDock.getAttribute("data-pomodoro-key") || key);
      const closeKeys = [closeKey, key, noriaTlTaskPomodoroKey(tk), noriaTlTaskAttachKey(tk)].filter(Boolean);
      noriaTlClearTimerAttachKeys(closeKeys);
      try { pomodoroDock.remove(); } catch (_) {}
      if (!card.querySelector(".noria-tl-pomodoro-dock")) card.classList.remove("noria-tl-has-pomodoro");
      try {
        const res = await noriaTlDetachPomodoroForTask(tk, {
          attachKey: closeKey,
          onError: (err) => {
            noriaTlSetLocalPomodoroState(before);
            noriaTlEnsurePomodoroDock(card, tk, closeKey, before, timeMeta);
            noriaTlNotice(noriaTlRuntimeT("runtime.timeline.pomodoro.detachFailed", { message: err && err.message ? err.message : err }), 3200);
          }
        });
        const nextState = res && res.state ? res.state : noriaTlReadPomodoroState();
        closeKeys.concat(res && res.key ? [res.key] : []).forEach((patchKey) => {
          noriaTlPatchExistingPomodoroDocksForKey(patchKey, nextState);
        });
      } catch (err) {
        noriaTlSetLocalPomodoroState(before);
        noriaTlEnsurePomodoroDock(card, tk, closeKey, before, timeMeta);
        console.warn("[noria tasksTimeline] pomodoro detach failed", err);
        noriaTlNotice(noriaTlRuntimeT("runtime.timeline.pomodoro.detachFailed", { message: err && err.message ? err.message : err }), 3200);
      }
    });
  }
  pomodoroDock.setAttribute("data-pomodoro-key", key);
  noriaTlApplyPomodoroDockSummary(pomodoroDock, summary);
  return pomodoroDock;
}

function noriaTlReadPomodoroState() {
  if (noriaTlPomodoroLocalState) return noriaTlNormalizePomodoroState(noriaTlPomodoroLocalState);
  try {
    if (bridge && typeof bridge.getPomodoroState === "function") {
      return noriaTlNormalizePomodoroState(bridge.getPomodoroState());
    }
  } catch (_) {}
  return noriaTlNormalizePomodoroState(bridge && bridge.pomodoro);
}

function noriaTlSetLocalPomodoroState(nextState) {
  const state = noriaTlNormalizePomodoroState(nextState);
  noriaTlPomodoroLocalState = state;
  try { bridge.pomodoro = state; } catch (_) {}
  return state;
}

function noriaTlSchedulePomodoroPersist(state, options) {
  const opts = options && typeof options === "object" ? options : {};
  const delay = Math.max(30, Math.min(1200, Number(opts.delayMs) || 260));
  const seq = ++noriaTlPomodoroPersistSeq;
  if (noriaTlPomodoroSaveTimer) {
    try { clearTimeout(noriaTlPomodoroSaveTimer); } catch (_) {}
    noriaTlPomodoroSaveTimer = null;
  }
  const run = async () => {
    if (seq !== noriaTlPomodoroPersistSeq) return;
    noriaTlPomodoroSaveTimer = null;
    try {
      if (bridge && typeof bridge.savePomodoroState === "function") {
        const res = await bridge.savePomodoroState(state, { refreshRuntime: opts.refreshRuntime === true });
        const saved = res && res.pomodoro ? res.pomodoro : state;
        noriaTlSetLocalPomodoroState(saved);
      }
    } catch (err) {
      console.warn("[noria tasksTimeline] save pomodoro state failed", err);
      if (typeof opts.onError === "function") {
        try { opts.onError(err); } catch (_) {}
      } else {
        noriaTlNotice(noriaTlRuntimeT("runtime.timeline.pomodoro.saveFailed", { message: err && err.message ? err.message : err }), 3200);
      }
    }
  };
  const timerHost = (typeof window !== "undefined" && window.setTimeout) ? window : globalThis;
  noriaTlPomodoroSaveTimer = timerHost.setTimeout(run, delay);
}

async function noriaTlSavePomodoroState(nextState, options) {
  const opts = options && typeof options === "object" ? options : {};
  const state = noriaTlSetLocalPomodoroState(nextState);
  try {
    if (bridge && typeof bridge.savePomodoroState === "function") {
      if (opts.flush !== "immediate") {
        noriaTlSchedulePomodoroPersist(state, opts);
        return state;
      }
      noriaTlPomodoroPersistSeq++;
      if (noriaTlPomodoroSaveTimer) {
        try { clearTimeout(noriaTlPomodoroSaveTimer); } catch (_) {}
        noriaTlPomodoroSaveTimer = null;
      }
      const res = await bridge.savePomodoroState(state, { refreshRuntime: opts.refreshRuntime === true });
      const saved = res && res.pomodoro ? res.pomodoro : state;
      return noriaTlSetLocalPomodoroState(saved);
    }
  } catch (err) {
    console.warn("[noria tasksTimeline] save pomodoro state failed", err);
    throw err;
  }
  return state;
}

function noriaTlPomodoroMetaFromLine(line, path, titleFallback) {
  return noriaTlPomodoroMetaFromTask({ path, line: -1, text: line }, { path, line, title: titleFallback });
}

function noriaTlTaskPomodoroKey(tk) {
  return noriaTlResolvePomodoroTaskRecord(tk, noriaTlReadPomodoroState()).taskKey;
}

async function noriaTlEnsureTaskPomodoroMeta(tk) {
  const ctx = await noriaTlReadTaskLineContext(tk);
  if (!ctx) return null;
  const state = noriaTlReadPomodoroState();
  const meta = noriaTlPomodoroMetaFromTask(tk, { path: ctx.filePath, line: ctx.line, lineHint: ctx.idx, title: stripForDisplay(ctx.line) });
  const resolved = noriaTlResolvePomodoroTaskRecord(meta, state);
  return { ...meta, taskKey: resolved.taskKey || meta.taskKey, lineContext: ctx };
}

async function noriaTlMigrateTaskLegacyPomodoro(tk) {
  const raw = String(tk && (tk.text != null ? tk.text : tk.visual || "") || "");
  if (!/\[(?:timeLog|timer_running)\s*::|\[\s*🍅::|\s\^noria[A-Za-z0-9-]+\s*$/iu.test(raw)) return false;
  const state0 = noriaTlReadPomodoroState();
  let migrated = null;
  await noriaTlMutateTaskLine(tk, (line, context) => {
    if (!/\[(?:timeLog|timer_running)\s*::|\[\s*🍅::|\s\^noria[A-Za-z0-9-]+\s*$/iu.test(line)) return line;
    migrated = noriaTlMigrateLegacyPomodoroLine(line, {
      path: context.filePath,
      lineHint: context.lineIndex,
      blockId: noriaTlExtractTaskBlockId(line) || "",
      title: stripForDisplay(line),
      workLen: state0.workLen,
      nowIso: new Date().toISOString()
    });
    return migrated.line;
  });
  if (!migrated) return false;
  const state = noriaTlNormalizePomodoroState(state0);
  if (migrated.taskKey) {
    const prev = state.tasks[migrated.taskKey] || {};
    state.tasks[migrated.taskKey] = {
      ...migrated.task,
      actual: Math.max(Number(prev.actual) || 0, migrated.task.actual),
      expected: migrated.task.expected || Number(prev.expected) || 0,
      sessions: [...(Array.isArray(prev.sessions) ? prev.sessions : []), ...migrated.task.sessions]
    };
  }
  await noriaTlSavePomodoroState(state, { flush: "immediate" });
  return true;
}

function noriaTlScheduleLegacyPomodoroMigration(tasks) {
  if (!Array.isArray(tasks) || !tasks.length || !app || !app.vault) return;
  const candidates = tasks.filter((tk) => /\[(?:timeLog|timer_running)\s*::|\[\s*🍅::|\s\^noria[A-Za-z0-9-]+\s*$/iu.test(String(tk && (tk.text != null ? tk.text : tk.visual || "") || "")));
  if (!candidates.length) return;
  const sig = candidates.map((tk) => `${tk.path || tk.link && tk.link.path || ""}:${taskLineIndex(tk)}`).join("|");
  if (globalThis.__noriaTimelinePomodoroMigrationSig === sig) return;
  globalThis.__noriaTimelinePomodoroMigrationSig = sig;
  setTimeout(() => {
    (async () => {
      let changed = false;
      for (let i = 0; i < candidates.length; i++) {
        try {
          changed = (await noriaTlMigrateTaskLegacyPomodoro(candidates[i])) || changed;
        } catch (err) {
          console.warn("[noria tasksTimeline] pomodoro migration failed", err);
        }
      }
      if (changed) {
        try { globalThis.__noriaRuntimeBridge?.refresh?.requestRefresh?.("timeline", "timeline-pomodoro-migration"); } catch (_) {}
        try { noriaTlQueueLocalRefresh(160); } catch (_) {}
      }
    })();
  }, 0);
}

async function noriaTlStartOrTogglePomodoro(tk) {
  const meta = await noriaTlEnsureTaskPomodoroMeta(tk);
  if (!meta) return { ok: false };
  const before = noriaTlReadPomodoroState();
  const previousKey = before.active && before.active.taskKey ? before.active.taskKey : "";
  let state = noriaTlTickPomodoro(before, new Date().toISOString());
  const active = state.active;
  if (active && active.taskKey === meta.taskKey) {
    state = active.status === "running" ? noriaTlPausePomodoro(state, new Date().toISOString()) : noriaTlResumePomodoro(state, new Date().toISOString());
  } else {
    state = noriaTlStartPomodoroWork(state, meta, new Date().toISOString());
  }
  state = await noriaTlSavePomodoroState(state);
  const activeKey = state.active ? state.active.taskKey : state.activeAttachTaskKey;
  const rec = state.tasks[activeKey];
  noriaTlSetSingleTimerAttachKey(activeKey);
  try { noriaTlSchedulePomodoroRefresh(); } catch (_) {}
  const summary = noriaTlBuildTaskPomodoroSummary(state, activeKey);
  return { ok: true, state, previousKey, meta: { ...meta, taskKey: activeKey }, record: rec, summary };
}

async function noriaTlStopPomodoroForTask(tk) {
  const meta = await noriaTlEnsureTaskPomodoroMeta(tk);
  if (!meta || !meta.taskKey) return { ok: false };
  let state = noriaTlStopPomodoro(noriaTlReadPomodoroState(), new Date().toISOString());
  state = await noriaTlSavePomodoroState(state);
  try { noriaTlSchedulePomodoroRefresh(); } catch (_) {}
  const rec = state.tasks[meta.taskKey];
  const summary = noriaTlBuildTaskPomodoroSummary(state, meta.taskKey);
  return { ok: true, state, meta, record: rec, summary };
}

async function noriaTlDetachPomodoroForTask(tk, saveOptions) {
  const opts = saveOptions && typeof saveOptions === "object" ? saveOptions : {};
  const state0 = noriaTlReadPomodoroState();
  const key = String(opts.attachKey || noriaTlTaskPomodoroKey(tk) || noriaTlTaskAttachKey(tk) || "").trim();
  const initialKeys = [key, noriaTlTaskPomodoroKey(tk), noriaTlTaskAttachKey(tk)].filter(Boolean);
  const initialKeySet = noriaTlBuildPomodoroAttachKeySet(initialKeys);
  const detachKeys = initialKeys.slice();
  if (state0.active && initialKeySet.has(state0.active.taskKey)) detachKeys.push(state0.active.taskKey);
  if (state0.activeAttachTaskKey && initialKeySet.has(state0.activeAttachTaskKey)) detachKeys.push(state0.activeAttachTaskKey);
  noriaTlClearTimerAttachKeys(detachKeys);
  let state = noriaTlReadPomodoroState();
  state = noriaTlDetachPomodoroState(state, detachKeys, new Date().toISOString());
  state = await noriaTlSavePomodoroState(state, { ...opts, flush: "immediate" });
  noriaTlClearTimerAttachKeys(detachKeys);
  try { noriaTlSchedulePomodoroRefresh(); } catch (_) {}
  return { ok: true, state, key };
}

async function noriaTlTransferPomodoroToTask(sourceKey, toTk, nowIso, saveOptions) {
  const meta = await noriaTlEnsureTaskPomodoroMeta(toTk);
  if (!meta) return false;
  let state = noriaTlReadPomodoroState();
  if (state.active && (!sourceKey || state.active.taskKey === sourceKey || sourceKey !== meta.taskKey)) {
    state = noriaTlTransferPomodoroTask(state, meta, nowIso || new Date().toISOString());
    state = await noriaTlSavePomodoroState(state, saveOptions);
  } else {
    const ensured = noriaTlEnsurePomodoroRecord(state, meta);
    state = ensured.state;
    const key = Object.keys(state.tasks).find((k) => state.tasks[k] === ensured.record) || meta.taskKey;
    if (sourceKey && sourceKey !== key && state.tasks[sourceKey] && !noriaTlPomodoroRecordHasHistory(state.tasks[sourceKey])) {
      delete state.tasks[sourceKey];
    }
    state.activeAttachTaskKey = key;
    state = await noriaTlSavePomodoroState(state, saveOptions);
  }
  noriaTlSetSingleTimerAttachKey(state.active ? state.active.taskKey : state.activeAttachTaskKey);
  try { noriaTlSchedulePomodoroRefresh(); } catch (_) {}
  return { ok: true, state, meta: { ...meta, taskKey: state.active ? state.active.taskKey : state.activeAttachTaskKey }, sourceKey: String(sourceKey || "") };
}

async function noriaTlAutoTickPomodoroIfDue() {
  const before = noriaTlReadPomodoroState();
  if (!before.active || before.active.status !== "running") return false;
  const after = noriaTlTickPomodoro(before, new Date().toISOString());
  if (JSON.stringify(after.active) === JSON.stringify(before.active)) return false;
  const saved = await noriaTlSavePomodoroState(after);
  noriaTlRefreshVisiblePomodoroDocks(saved);
  return true;
}

function noriaTlSchedulePomodoroRefresh(rerender) {
  try {
    if (noriaTlPomodoroRefreshTimer) clearTimeout(noriaTlPomodoroRefreshTimer);
    const state = noriaTlReadPomodoroState();
    if (!state.active) return;
    noriaTlPomodoroRefreshTimer = setTimeout(() => {
      noriaTlPomodoroRefreshTimer = null;
      (async () => {
        try { await noriaTlAutoTickPomodoroIfDue(); } catch (err) { console.warn("[noria tasksTimeline] pomodoro tick failed", err); }
        try { noriaTlRefreshVisiblePomodoroDocks(); } catch (_) {}
        try { noriaTlSchedulePomodoroRefresh(rerender); } catch (_) {}
      })();
    }, state.active.status === "running" ? 1000 : 30000);
  } catch (_) {}
}

function noriaTlCompletionCounterDelta(dataset, nextDone) {
  if (!nextDone || !dataset || String(dataset.todo || "") !== "1") {
    return { todo: 0, overdue: 0, unplanned: 0 };
  }
  if (String(dataset.overdue || "") === "1") return { todo: 0, overdue: -1, unplanned: 0 };
  if (String(dataset.unplanned || "") === "1") return { todo: 0, overdue: 0, unplanned: -1 };
  if (String(dataset.todoDated || "") === "1") return { todo: -1, overdue: 0, unplanned: 0 };
  return { todo: 0, overdue: 0, unplanned: 0 };
}

/** 自今日起向前展示；历史日期桶不再单独列出，逾期并入「今天」末尾 */
function buildDateRange() {
  const today = m().startOf("day");
  const end = today.clone().add(forwardDays, "days");
  const keys = [];
  const cur = today.clone();
  while (cur.isSameOrBefore(end, "day")) {
    keys.push(cur.format("YYYY-MM-DD"));
    cur.add(1, "day");
  }
  return { todayYmd: today.format("YYYY-MM-DD"), keys, todayM: today };
}

function noriaTlWeekdayKey(dayIndex) {
  return [
    "runtime.label.weekday.sun",
    "runtime.label.weekday.mon",
    "runtime.label.weekday.tue",
    "runtime.label.weekday.wed",
    "runtime.label.weekday.thu",
    "runtime.label.weekday.fri",
    "runtime.label.weekday.sat"
  ][Number(dayIndex) || 0] || "runtime.label.weekday.sun";
}

function formatTimelineDayTitle(ymdStr, todayM) {
  const d = m(ymdStr, "YYYY-MM-DD", true);
  if (!d.isValid()) return ymdStr;
  const y = d.year();
  const cy = todayM && typeof todayM.year === "function" ? todayM.year() : m().year();
  const yearPart = y !== cy ? noriaTlRuntimeT("runtime.timeline.dateYearSuffix", { year: y }) : "";
  return noriaTlRuntimeT("runtime.timeline.dateTitle", {
    month: d.month() + 1,
    day: d.date(),
    weekday: noriaTlRuntimeT(noriaTlWeekdayKey(d.day())),
    year: yearPart
  });
}

function noriaTlBuildDayHeadMeta(ymdStr, todayM, count) {
  const d = m(ymdStr, "YYYY-MM-DD", true);
  if (!d.isValid()) {
    return {
      dayNum: "--",
      monthTag: ymdStr,
      weekTag: "",
      countTag: noriaTlRuntimeT("runtime.timeline.countTag", { count: Math.max(0, Number(count) || 0) }),
      isToday: false
    };
  }
  const isToday = !!(todayM && d.isSame(todayM, "day"));
  const monthKey = isToday ? "runtime.timeline.monthTagToday" : "runtime.timeline.monthTag";
  return {
    dayNum: String(d.date()),
    monthTag: noriaTlRuntimeT(monthKey, { month: d.month() + 1 }),
    weekTag: noriaTlRuntimeT(noriaTlWeekdayKey(d.day())),
    countTag: noriaTlRuntimeT("runtime.timeline.countTag", { count: Math.max(0, Number(count) || 0) }),
    isToday
  };
}

function extractHashTags(text) {
  const out = [];
  const re = /#([^\s#]+)/g;
  let mm;
  const s = String(text || "");
  while ((mm = re.exec(s))) {
    const tag = mm[1].replace(/[.,;:!?]+$/, "");
    if (tag && out.indexOf(tag) === -1) out.push(tag);
  }
  return out;
}

/** 逾期：24h 内优先「N 小时前」，否则「N 天前」 */
function relativeOverduePhrase(tk) {
  const ymd = primaryYmdForTask(tk);
  if (!ymd) return "";
  let refM = m(ymd, "YYYY-MM-DD", true);
  if (!refM.isValid()) return "";
  const dueRaw = tk.due;
  if (dueRaw != null) {
    try {
      if (dueRaw.toMillis && typeof dueRaw.toMillis === "function") {
        const mm = m(dueRaw.toMillis());
        if (mm.isValid()) refM = mm;
      } else {
        const mm = m(dueRaw);
        if (mm.isValid()) refM = mm;
      }
    } catch (_) {}
  }
  const now = m();
  const hours = now.diff(refM, "hours", true);
  if (hours > 0 && hours < 24) {
    return noriaTlRuntimeT("runtime.timeline.relative.hoursAgo", { count: Math.max(1, Math.floor(hours)) });
  }
  const dayDiff = now
    .clone()
    .startOf("day")
    .diff(m(ymd, "YYYY-MM-DD", true).startOf("day"), "days");
  if (dayDiff <= 0) return noriaTlRuntimeT("runtime.timeline.relative.today");
  return noriaTlRuntimeT("runtime.timeline.relative.daysAgo", { count: dayDiff });
}

function relativeFuturePhrase(tk, todayM) {
  const ymd = primaryYmdForTask(tk);
  if (!ymd) return "";
  const dayM = m(ymd, "YYYY-MM-DD", true);
  if (!dayM.isValid() || !dayM.isAfter(todayM, "day")) return "";
  let refM = dayM.clone().startOf("day");
  const dueRaw = tk.due;
  if (dueRaw != null) {
    try {
      if (dueRaw.toMillis && typeof dueRaw.toMillis === "function") {
        const mm = m(dueRaw.toMillis());
        if (mm.isValid()) refM = mm;
      } else {
        const mm = m(dueRaw);
        if (mm.isValid()) refM = mm;
      }
    } catch (_) {}
  }
  const now = m();
  const hours = refM.diff(now, "hours", true);
  if (hours > 0 && hours < 24) {
    return noriaTlRuntimeT("runtime.timeline.relative.hoursLater", { count: Math.max(1, Math.ceil(hours)) });
  }
  const days = dayM.clone().startOf("day").diff(todayM.clone().startOf("day"), "days");
  return noriaTlRuntimeT("runtime.timeline.relative.daysLater", { count: days });
}

function taskLineIndex(tk) {
  if (typeof tk.line === "number" && tk.line >= 0) return tk.line;
  if (tk.position && tk.position.start && typeof tk.position.start.line === "number") {
    return tk.position.start.line;
  }
  return -1;
}

function noriaTlTaskAttachKey(tk) {
  const resolved = noriaTlResolvePomodoroTaskRecord(tk, noriaTlReadPomodoroState());
  if (resolved.taskKey) return resolved.taskKey;
  const path = String((tk && (tk.path || (tk.link && tk.link.path))) || "").replace(/\\/g, "/");
  const line = taskLineIndex(tk);
  if (!path || line < 0) return "";
  return `${path}::${line}`;
}

function noriaTlSetSingleTimerAttachKey(key) {
  try { noriaTlTimerAttachedKeys.clear(); } catch (_) {}
  const k = String(key || "").trim();
  if (k) {
    try { noriaTlTimerAttachedKeys.add(k); } catch (_) {}
  }
  globalThis.__noriaTimelineActiveTimerAttachKey = k;
}

function noriaTlClearTimerAttachKeys(keys) {
  const keySet = noriaTlBuildPomodoroAttachKeySet(keys);
  if (!keySet.size) {
    try { noriaTlTimerAttachedKeys.clear(); } catch (_) {}
    globalThis.__noriaTimelineActiveTimerAttachKey = "";
    return;
  }
  try {
    keySet.forEach((k) => noriaTlTimerAttachedKeys.delete(k));
  } catch (_) {}
  const activeKey = String(globalThis.__noriaTimelineActiveTimerAttachKey || "").trim();
  if (activeKey && (keySet.has(activeKey) || keySet.has(noriaTlPomodoroInternalKeyForLegacyKey(activeKey)))) {
    globalThis.__noriaTimelineActiveTimerAttachKey = "";
  }
}

function noriaTlClearTimerAttachKey(key) {
  noriaTlClearTimerAttachKeys([key]);
}

function noriaTlIsTimerAttachedKey(key) {
  const k = String(key || "").trim();
  if (!k) return false;
  let state = null;
  try { state = noriaTlReadPomodoroState(); } catch (_) { state = null; }
  const keySet = noriaTlBuildPomodoroAttachKeySet([k]);
  const stateAttachKey = String(state && state.activeAttachTaskKey || "").trim();
  const stateActiveKey = String(state && state.active && state.active.taskKey || "").trim();
  return !!((stateAttachKey && keySet.has(stateAttachKey)) || (stateActiveKey && keySet.has(stateActiveKey)));
}

function noriaTlReadTimerAttachPayload(ev) {
  const out = { ok: false, sourceKey: "" };
  if (!ev || !ev.dataTransfer) return out;
  try {
    const custom = String(ev.dataTransfer.getData(NORIA_TL_TIMER_ATTACH_MIME) || "").trim();
    if (custom) {
      if (custom === "1") return { ok: true, sourceKey: "" };
      try {
        const parsed = JSON.parse(custom);
        return { ok: true, sourceKey: String(parsed && parsed.sourceKey ? parsed.sourceKey : "").trim() };
      } catch (_) {
        return { ok: true, sourceKey: custom === NORIA_TL_TIMER_ATTACH_TOKEN ? "" : custom };
      }
    }
    const plain = String(ev.dataTransfer.getData("text/plain") || "").trim();
    if (plain === NORIA_TL_TIMER_ATTACH_TOKEN) return { ok: true, sourceKey: "" };
  } catch (_) {}
  return out;
}

function noriaTlHasTimerAttachPayload(ev) {
  if (!ev || !ev.dataTransfer) return false;
  try {
    if (ev.dataTransfer.types && Array.from(ev.dataTransfer.types).indexOf(NORIA_TL_TIMER_ATTACH_MIME) >= 0) {
      return true;
    }
    const custom = String(ev.dataTransfer.getData(NORIA_TL_TIMER_ATTACH_MIME) || "").trim();
    if (custom) return true;
    const plain = String(ev.dataTransfer.getData("text/plain") || "").trim();
    return plain === NORIA_TL_TIMER_ATTACH_TOKEN;
  } catch (_) {
    return false;
  }
}

/**
 * 仅任务自身标签：metadata/Tasks 的 `tk.tags` + 该行文本内 `#tag`。
 * 不使用 `file.tags`：后者为整篇笔记聚合标签，会导致同日所有任务「误显」相同标签。
 */
function tagsForTaskRich(tk) {
  const seen = [];
  const push = (arr) => {
    for (let i = 0; i < arr.length; i++) {
      const t = String(arr[i] || "")
        .replace(/^#/, "")
        .trim();
      if (t && seen.indexOf(t) === -1) seen.push(t);
    }
  };
  if (Array.isArray(tk.tags)) {
    push(tk.tags.map((x) => String(x)));
  }
  push(extractHashTags(tk.text != null ? tk.text : tk.visual || ""));
  return seen;
}

function scheduleHintForTask(tk, todayM) {
  if (!taskIncomplete(tk)) return null;
  const ymd = primaryYmdForTask(tk);
  if (!ymd) return null;
  const d = m(ymd, "YYYY-MM-DD", true);
  if (!d.isValid()) return null;
  if (d.isSame(todayM, "day")) return null;
  if (d.isBefore(todayM, "day")) {
    const t = relativeOverduePhrase(tk);
    return t ? { text: t, cls: "noria-tl-hint-overdue" } : null;
  }
  const t = relativeFuturePhrase(tk, todayM);
  return t ? { text: t, cls: "noria-tl-hint-future" } : null;
}

/**
 * 点击圆圈：与 Markdown 行 `- [ ]` / `- [x]` 同步（由 Obsidian 读盘刷新 metadata）。
 * `app` 由 runmetadataView 注入。
 */
async function noriaTlInvokeOpenTaskDateTimeEditor(taskEl, opts) {
  const b = bridge;
  try {
    if (b && typeof b.ensureTaskDateTimeEditorApi === "function") {
      await b.ensureTaskDateTimeEditorApi();
    }
  } catch (err) {
    console.warn("[noria tasksTimeline] ensureTaskDateTimeEditorApi", err);
  }
  const fn =
    globalThis.__noriaTasksCalendarApi && globalThis.__noriaTasksCalendarApi.openTaskDateTimeEditor;
  if (typeof fn !== "function") {
    try {
      const N = window.Notice;
      if (N) {
        new N(noriaTlRuntimeT("runtime.timeline.editorApiMissing"), 4200);
      }
    } catch (_) {}
    return;
  }
  try {
    fn(taskEl, opts || {});
  } catch (e) {
    console.warn("[noria tasksTimeline] openTaskDateTimeEditor", e);
  }
}

function noriaTlFillEditorTemporalDataset(el, tk) {
  const startMeta = noriaTlReadTaskDateTimeField(tk, "start");
  const dueMeta = noriaTlReadTaskDateTimeField(tk, "due");
  let startY = (startMeta && startMeta.ymd) || luxonOrDateToYmd(tk.start) || luxonOrDateToYmd(tk.scheduled) || "";
  let dueY = (dueMeta && dueMeta.ymd) || luxonOrDateToYmd(tk.due) || "";
  const primary = primaryYmdForTask(tk);
  if (!startY) startY = primary;
  if (!dueY) dueY = startY || primary;
  if (!startY) startY = dueY;
  const st = noriaTlNormalizeTimeStr(
    (startMeta && startMeta.hhmm)
    || String(tk.startTime != null ? tk.startTime : "").trim()
    || noriaTlExtractInlineField(tk && (tk.text || tk.visual || ""), "startTime")
  );
  const dt = noriaTlNormalizeTimeStr(
    (dueMeta && dueMeta.hhmm)
    || String(tk.dueTime != null ? tk.dueTime : "").trim()
    || noriaTlExtractInlineField(tk && (tk.text || tk.visual || ""), "dueTime")
  );
  el.setAttribute("data-start-date", startY || "");
  el.setAttribute("data-due-date", (dueY || startY) || "");
  if (st) el.setAttribute("data-start-time", st);
  if (dt) el.setAttribute("data-due-time", dt);
}

function noriaTlBuildSyntheticTaskElForTimeEditor(tk, ownerDoc) {
  const doc = ownerDoc && ownerDoc.createElement ? ownerDoc : document;
  const rawPath = String(tk.path || (tk.link && tk.link.path) || "").replace(/\\/g, "/");
  const lineIdx = taskLineIndex(tk);
  const taskPath = rawPath;
  const navHref = taskPath.replace(/\.md$/i, "");
  let taskSig = "";
  try {
    const rawSig = String(tk.rawText || tk.text || tk.visual || "");
    const clipped = rawSig.length > 1200 ? rawSig.slice(0, 1200) : rawSig;
    taskSig = encodeURIComponent(clipped);
    if (taskSig.length > 1800) taskSig = taskSig.slice(0, 1800);
  } catch (_) {
    taskSig = "";
  }
  const wrap = doc.createElement("span");
  wrap.className = "tc-cal-item noria-tl-te-proxy noNoteIcon";
  wrap.setAttribute("data-tc-cal-item", "1");
  wrap.setAttribute("data-nav-href", navHref);
  wrap.setAttribute("data-tc-path", taskPath);
  wrap.setAttribute("data-tc-line", lineIdx >= 0 ? String(lineIdx) : "");
  wrap.setAttribute("data-tc-sig", taskSig);
  noriaTlFillEditorTemporalDataset(wrap, tk);
  const titleText = stripForDisplay(tk.text != null ? tk.text : tk.visual || "") || "任务";
  const desc = doc.createElement("span");
  desc.className = "description";
  desc.textContent = titleText;
  wrap.appendChild(desc);
  wrap.setAttribute("data-full-text", titleText);
  return wrap;
}

function noriaTlNotice(message, ms) {
  try {
    const N = window.Notice;
    if (N) new N(String(message || ""), Number(ms) || 2400);
  } catch (_) {}
}

function noriaTlApplyNodeDoneState(node, done) {
  if (!node) return;
  const completed = !!done;
  node.classList.toggle("noria-tl-check-done", completed);
  node.classList.remove("noria-tl-check-overdue", "noria-tl-check-unplanned");
  node.setAttribute("aria-label", completed ? noriaTlRuntimeT("runtime.timeline.task.toggleOpen") : noriaTlRuntimeT("runtime.timeline.task.toggleDone"));
  node.setAttribute("aria-pressed", completed ? "true" : "false");
}

function noriaTlCounterValueEl(root, key) {
  try {
    return root ? root.querySelector(`.noria-tl-counter-card[data-counter="${key}"] .noria-tl-counter-num`) : null;
  } catch (_) {
    return null;
  }
}

function noriaTlReadCounterSnapshot(root) {
  const out = {};
  ["todo", "overdue", "unplanned"].forEach((key) => {
    const el = noriaTlCounterValueEl(root, key);
    if (el) out[key] = String(el.textContent || "0");
  });
  return out;
}

function noriaTlRestoreCounterSnapshot(root, snap) {
  if (!snap || !root) return;
  Object.keys(snap).forEach((key) => {
    const el = noriaTlCounterValueEl(root, key);
    if (el) el.textContent = String(snap[key]);
  });
}

function noriaTlApplyCounterDelta(root, delta) {
  if (!root || !delta) return;
  ["todo", "overdue", "unplanned"].forEach((key) => {
    const d = Number(delta[key] || 0);
    if (!d) return;
    const el = noriaTlCounterValueEl(root, key);
    if (!el) return;
    const prev = Number(String(el.textContent || "0").trim());
    const next = Math.max(0, (Number.isFinite(prev) ? prev : 0) + d);
    el.textContent = String(next);
  });
}

function noriaTlApplyTaskCompletionLocal(node, nextDone) {
  const li = node && node.closest ? node.closest(".noria-tl-task") : null;
  const root = li && li.closest ? li.closest(".noria-tl-root") : null;
  const counterSnap = noriaTlReadCounterSnapshot(root);
  const attrSnap = li ? {
    todo: li.getAttribute("data-todo"),
    todoDated: li.getAttribute("data-todo-dated"),
    overdue: li.getAttribute("data-overdue"),
    unplanned: li.getAttribute("data-unplanned"),
    hidden: !!li.hidden
  } : null;
  const delta = li ? noriaTlCompletionCounterDelta(li.dataset || {}, !!nextDone) : null;
  let hideTimer = null;
  noriaTlApplyNodeDoneState(node, nextDone);
  if (li && nextDone) {
    noriaTlApplyCounterDelta(root, delta);
    li.setAttribute("data-todo", "0");
    li.setAttribute("data-todo-dated", "0");
    li.setAttribute("data-overdue", "0");
    li.setAttribute("data-unplanned", "0");
    li.classList.add("noria-tl-task-done-local");
    try {
      hideTimer = window.setTimeout(() => {
        if (li.classList.contains("noria-tl-task-done-local")) li.hidden = true;
      }, 140);
    } catch (_) {}
  }
  return () => {
    if (hideTimer) {
      try { clearTimeout(hideTimer); } catch (_) {}
    }
    noriaTlApplyNodeDoneState(node, !nextDone);
    noriaTlRestoreCounterSnapshot(root, counterSnap);
    if (li && attrSnap) {
      li.classList.remove("noria-tl-task-done-local");
      li.hidden = attrSnap.hidden;
      if (attrSnap.todo == null) li.removeAttribute("data-todo"); else li.setAttribute("data-todo", attrSnap.todo);
      if (attrSnap.todoDated == null) li.removeAttribute("data-todo-dated"); else li.setAttribute("data-todo-dated", attrSnap.todoDated);
      if (attrSnap.overdue == null) li.removeAttribute("data-overdue"); else li.setAttribute("data-overdue", attrSnap.overdue);
      if (attrSnap.unplanned == null) li.removeAttribute("data-unplanned"); else li.setAttribute("data-unplanned", attrSnap.unplanned);
    }
  };
}

function noriaTlIsTimelineControlTask(tk) {
  const raw = [
    tk && tk.rawText,
    tk && tk.text,
    tk && tk.visual,
    tk && tk.summary,
    tk && tk.timelineTag
  ].map((v) => String(v || "")).join(" ");
  if (/(^|\s)#(?:tl|timeline)(?:\/[^\s#]+)?(?=\s|$)/i.test(raw)) return true;
  const tags = Array.isArray(tk && tk.tags) ? tk.tags : [];
  return tags.some((tag) => /^(?:#)?(?:tl|timeline)(?:\/.*)?$/i.test(String(tag || "").trim()));
}

async function noriaTlFallbackSetTaskCompletion(tk, nextDone) {
  const completionValue = nextDone ? m().format("YYYY-MM-DD HH:mm") : "";
  const skipCompletionField = noriaTlIsTimelineControlTask(tk);
  return noriaTlMutateTaskLine(tk, (line) => {
    let next = String(line || "").replace(/^(\s*[-*]\s*\[)([^\]]*)(\]\s*)/, (_m, a, _inner, c) => {
      return a + (nextDone ? "x" : " ") + c;
    });
    next = noriaTlStripInlineField(next, "done");
    next = noriaTlStripInlineField(next, "completion");
    if (nextDone && !skipCompletionField) {
      next = noriaTlUpsertInlineField(next, "completion", completionValue);
    }
    return next.replace(/\s{2,}/g, " ").trimEnd();
  });
}

async function toggleTimelineTaskLine(tk, node) {
  if (node && node._noriaTlToggleInflight) return false;
  if (node) {
    node._noriaTlToggleInflight = true;
    node.setAttribute("aria-busy", "true");
  }
  try {
    const proxy = noriaTlBuildSyntheticTaskElForTimeEditor(tk, document);
    const b = bridge;
    try {
      if (b && typeof b.ensureTaskDateTimeEditorApi === "function") {
        await b.ensureTaskDateTimeEditorApi();
      }
    } catch (err) {
      console.warn("[noria tasksTimeline] ensure completion api", err);
    }
    const api = globalThis.__noriaTasksCalendarApi || {};
    const nextDone = taskIncomplete(tk);
    const skipCompletionField = noriaTlIsTimelineControlTask(tk);
    const rollbackLocal = noriaTlApplyTaskCompletionLocal(node, nextDone);
    if (proxy && typeof api.setTaskCompletionState === "function") {
      try {
        await api.setTaskCompletionState(proxy, nextDone, {
          silentNotice: true,
          suppressRefresh: true,
          completionValue: (nextDone && !skipCompletionField) ? m().format("YYYY-MM-DD HH:mm") : "",
          skipCompletionField
        });
        try { globalThis.__noriaRuntimeBridge?.refresh?.requestRefresh?.("timeline", "timeline-task-complete"); } catch (_) {}
        try { noriaTlQueueLocalRefresh(520); } catch (_) {}
        return true;
      } catch (err) {
        try { rollbackLocal(); } catch (_) {}
        throw err;
      }
    }
    let ok = false;
    try {
      ok = await noriaTlFallbackSetTaskCompletion(tk, nextDone);
    } catch (err) {
      try { rollbackLocal(); } catch (_) {}
      throw err;
    }
    if (ok) return true;
    try { rollbackLocal(); } catch (_) {}
    noriaTlNotice(noriaTlRuntimeT("runtime.timeline.notice.toggleLineMissing"), 3000);
    return false;
  } catch (err) {
    console.warn("[noria tasksTimeline] toggle line", err);
    noriaTlNotice(noriaTlRuntimeT("runtime.timeline.notice.toggleFailed", { message: err && err.message ? err.message : err }), 3200);
    return false;
  } finally {
    if (node) {
      node._noriaTlToggleInflight = false;
      node.removeAttribute("aria-busy");
    }
  }
}

function noriaTlBuildDateTimeText(ymd, minute) {
  return `${String(ymd || "").trim()} ${noriaTlFromMinutes(minute)}`.trim();
}

async function noriaTlApplyTaskTimeRange(tk, ymd, startMin, endMin) {
  const d = String(ymd || "").trim();
  if (!d || !m(d, "YYYY-MM-DD", true).isValid()) return false;
  const s0 = Math.max(0, Math.min(24 * 60 - 1, Math.round(Number(startMin) || 0)));
  const e0 = Math.max(s0 + 5, Math.min(24 * 60 - 1, Math.round(Number(endMin) || (s0 + 30))));
  return noriaTlMutateTaskLine(tk, (line) => {
    let next = String(line || "");
    next = noriaTlStripInlineField(next, "start");
    next = noriaTlStripInlineField(next, "due");
    next = noriaTlUpsertInlineField(next, "start", noriaTlBuildDateTimeText(d, s0));
    next = noriaTlUpsertInlineField(next, "due", noriaTlBuildDateTimeText(d, e0));
    return next.replace(/\s{2,}/g, " ").trimEnd();
  });
}

async function noriaTlToggleTaskTimer(tk) {
  const res = await noriaTlStartOrTogglePomodoro(tk);
  if (!res || !res.ok) return { ok: false, running: false, totalText: "", action: "noop" };
  return {
    ok: true,
    running: !!(res.summary && res.summary.running),
    totalText: res.summary ? res.summary.primaryText : "",
    action: res.summary && res.summary.running ? "start" : "pause",
    summary: res.summary
  };
}

async function noriaTlResetTaskTimer(tk) {
  const meta = await noriaTlEnsureTaskPomodoroMeta(tk);
  if (!meta || !meta.taskKey) return false;
  const state = noriaTlReadPomodoroState();
  delete state.tasks[meta.taskKey];
  if (state.active && state.active.taskKey === meta.taskKey) state.active = null;
  if (state.activeAttachTaskKey === meta.taskKey) state.activeAttachTaskKey = "";
  await noriaTlSavePomodoroState(state);
  try {
    await noriaTlMutateTaskLine(tk, (line) => noriaTlStripPomodoroNoiseFromLine(line));
  } catch (_) {}
  noriaTlClearTimerAttachKey(meta.taskKey);
  return true;
}

async function noriaTlStopTaskTimer(tk) {
  const res = await noriaTlStopPomodoroForTask(tk);
  return {
    ok: !!(res && res.ok),
    running: false,
    totalText: res && res.summary ? res.summary.primaryText : ""
  };
}

async function noriaTlReadTaskLineContext(tk) {
  if (!app || !app.vault) return null;
  const rawPath = String((tk && (tk.path || (tk.link && tk.link.path))) || "").replace(/\\/g, "/");
  if (!rawPath) return null;
  const file = app.vault.getAbstractFileByPath(rawPath);
  if (!file || file.extension !== "md") return null;
  const text = await app.vault.read(file);
  const lines = text.split(/\r?\n/);
  const idx = noriaTlPickTaskLineIndex(lines, taskLineIndex(tk), tk);
  if (idx < 0 || idx >= lines.length) return null;
  return { file, filePath: rawPath, lines, idx, line: String(lines[idx] || "") };
}

async function noriaTlTransferRunningPomodoro(fromTk, toTk, nowIso) {
  const sourceKey = noriaTlTaskPomodoroKey(fromTk) || noriaTlTaskAttachKey(fromTk);
  const res = await noriaTlTransferPomodoroToTask(sourceKey, toTk, nowIso);
  if (sourceKey) noriaTlPatchExistingPomodoroDocksForKey(sourceKey, res && res.state);
  return !!(res && res.ok);
}

function noriaTlShowTimerMenu(ev, tk, timerBtn, timeMinor, hasFixedDuration, attachKey) {
  function applyTimerBtnState(res) {
    if (!timerBtn || !res || !res.ok) return;
    timerBtn.classList.toggle("is-running", !!res.running);
    timerBtn.setAttribute("title", res.running
      ? noriaTlRuntimeT("runtime.timeline.pomodoro.runningTitle", { total: res.totalText })
      : noriaTlRuntimeT("runtime.timeline.pomodoro.totalTitle", { total: res.totalText }));
    if (attachKey) {
      noriaTlSetSingleTimerAttachKey(attachKey);
    }
    if (timeMinor && !hasFixedDuration) {
      timeMinor.classList.remove("is-empty");
      timeMinor.setText(`${noriaTlRuntimeT("runtime.timeline.pomodoro.title")} ${res.totalText}`);
    }
  }
  const tryMenuCtor = typeof Menu !== "undefined" ? Menu : null;
  const openSummary = () => {
    const key = noriaTlTaskPomodoroKey(tk) || attachKey || "";
    const s = noriaTlBuildTaskPomodoroSummary(noriaTlReadPomodoroState(), key);
    try {
      const N = window.Notice;
      if (N) new N(s.visible ? s.titleText : noriaTlRuntimeT("runtime.timeline.pomodoro.noRecord"), 2800);
    } catch (_) {}
  };
  if (tryMenuCtor) {
    try {
      const menu = new tryMenuCtor();
      menu.addItem((it) => it.setTitle(noriaTlRuntimeT("runtime.timeline.pomodoro.startOrResume")).onClick(async () => {
        if (attachKey) noriaTlSetSingleTimerAttachKey(attachKey);
        const res = await noriaTlToggleTaskTimer(tk);
        if (!res.ok) return;
        applyTimerBtnState(res);
        try {
          const N = window.Notice;
          if (N) new N(res.running ? noriaTlRuntimeT("runtime.timeline.pomodoro.started") : noriaTlRuntimeT("runtime.timeline.pomodoro.paused"), 2200);
        } catch (_) {}
      }));
      menu.addItem((it) => it.setTitle(noriaTlRuntimeT("runtime.timeline.pomodoro.reset")).onClick(async () => {
        const ok = await noriaTlResetTaskTimer(tk);
        if (!ok) return;
        if (attachKey) {
          noriaTlClearTimerAttachKey(attachKey);
          noriaTlPatchExistingPomodoroDocksForKey(attachKey);
        }
        if (timerBtn) {
          timerBtn.classList.remove("is-running");
          timerBtn.setAttribute("title", noriaTlRuntimeT("runtime.timeline.pomodoro.title"));
        }
        if (timeMinor && !hasFixedDuration) {
          timeMinor.classList.add("is-empty");
          timeMinor.setText("");
        }
        try {
          const N = window.Notice;
          if (N) new N(noriaTlRuntimeT("runtime.timeline.pomodoro.resetDone"), 2200);
        } catch (_) {}
      }));
      menu.addItem((it) => it.setTitle(noriaTlRuntimeT("runtime.timeline.pomodoro.summary")).onClick(openSummary));
      if (typeof menu.showAtMouseEvent === "function") {
        menu.showAtMouseEvent(ev);
      } else if (typeof menu.showAtPosition === "function") {
        menu.showAtPosition({ x: ev.clientX || 0, y: ev.clientY || 0 });
      }
      return;
    } catch (_) {}
  }
  const action = String(window.prompt(noriaTlRuntimeT("runtime.timeline.pomodoro.summary") + ": start / reset / show", "show") || "").trim().toLowerCase();
  if (action === "start" || action === "stop") {
    if (attachKey) noriaTlSetSingleTimerAttachKey(attachKey);
    void noriaTlToggleTaskTimer(tk).then((res) => applyTimerBtnState(res));
  } else if (action === "reset") {
    void noriaTlResetTaskTimer(tk).then((ok) => {
      if (!ok) return;
      if (attachKey) {
        noriaTlClearTimerAttachKey(attachKey);
        noriaTlPatchExistingPomodoroDocksForKey(attachKey);
      }
      if (timerBtn) {
        timerBtn.classList.remove("is-running");
        timerBtn.setAttribute("title", noriaTlRuntimeT("runtime.timeline.pomodoro.title"));
      }
      if (timeMinor && !hasFixedDuration) {
        timeMinor.classList.add("is-empty");
        timeMinor.setText("");
      }
    });
  } else {
    openSummary();
  }
}

function noteBasenameForPath(p) {
  const s = String(p || "").replace(/\\/g, "/");
  const fn = s.split("/").pop() || s;
  return fn.replace(/\.md$/i, "");
}

/** Cmd/Ctrl/中键等：交给 Obsidian 默认（新窗格等），不拦截 */
function noriaTlIsModifiedClick(ev) {
  return !!(ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0);
}

/** Timeline 在侧栏时 `getLeaf(false)` 会落在侧栏，笔记不应在侧栏打开 */
function noriaTlLeafIsInSidePanel(leaf) {
  if (!leaf || typeof leaf.getRoot !== "function") return true;
  try {
    const r = leaf.getRoot();
    const ws = app.workspace;
    if (ws.leftSplit && r === ws.leftSplit) return true;
    if (ws.rightSplit && r === ws.rightSplit) return true;
  } catch (_) {}
  return false;
}

/**
 * 优先用当前主区 Markdown 叶；若焦点在侧栏或非 md，则 `getLeaf("tab")` 在主区新开标签。
 */
function noriaTlPickLeafForMarkdownOpen() {
  const ws = app.workspace;
  if (!ws) return null;
  try {
    const al = ws.activeLeaf;
    if (al && !noriaTlLeafIsInSidePanel(al)) {
      const vt = al.view && typeof al.view.getViewType === "function" ? al.view.getViewType() : "";
      if (vt === "markdown") {
        return al;
      }
    }
  } catch (_) {}
  try {
    return ws.getLeaf("tab");
  } catch (_) {
    try {
      return ws.getLeaf(false);
    } catch (e2) {
      return null;
    }
  }
}

/**
 * 打开库内 Markdown 并滚到指定行（0-based，与 metadata task.line / CM 一致）。
 * 与 `dashboardTodayTasks.js` 的 openTaskAtLine 同思路。
 */
async function openVaultMarkdownAtLine(pathNorm, line0) {
  if (!app || !app.vault || !app.workspace) return;
  const path = String(pathNorm || "").replace(/\\/g, "/");
  if (!path) return;
  const file = app.vault.getAbstractFileByPath(path);
  if (!file || file.extension !== "md") return;
  const leaf = noriaTlPickLeafForMarkdownOpen();
  if (!leaf) return;
  await leaf.openFile(file, { active: true });
  const ln = Math.max(0, Number(line0) | 0);
  await new Promise((r) => requestAnimationFrame(r));
  const view = leaf.view;
  try {
    if (view && typeof view.setEphemeralState === "function") {
      view.setEphemeralState({ line: ln });
    }
  } catch (_) {}
  try {
    const ed = view && view.editor;
    if (ed && typeof ed.setCursor === "function") {
      ed.setCursor({ line: ln, ch: 0 });
      if (typeof ed.scrollIntoView === "function") {
        ed.scrollIntoView({ from: { line: ln, ch: 0 }, to: { line: ln, ch: 0 } }, true);
      }
    }
  } catch (_) {}
}

function noriaTlBindAxisDrag(axisBtn, tk, dayYmd, timeMainEl, timeEndEl, durationEl, onTap) {
  if (!axisBtn || !tk) return;
  axisBtn.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0 || noriaTlIsModifiedClick(ev)) return;
    const ymd = String(dayYmd || "").trim();
    if (!ymd || !m(ymd, "YYYY-MM-DD", true).isValid()) return;
    const plannerLab = noriaTlReadPlannerLabControls();
    const tlCfg = plannerLab.timeline || {};
    const baseMeta = noriaTlReadTaskTimeMeta(tk, ymd);
    const baseStart = baseMeta.startMin != null ? baseMeta.startMin : 9 * 60;
    const defaultDurationMin = Math.max(15, Number(tlCfg.defaultDurationMin || 30));
    const baseEnd = baseMeta.endMin != null ? baseMeta.endMin : Math.min(baseStart + defaultDurationMin, 24 * 60 - 1);
    const dragStepMin = Math.max(5, Number(tlCfg.dragStepMin || 5));
    const snapMinutes = Math.max(1, Number(tlCfg.snapMinutes || dragStepMin));
    const dragDeadzonePx = Math.max(0, Number(tlCfg.dragDeadzonePx || 4));
    const dragCommitPolicy = String(tlCfg.dragCommitPolicy || "pointer-up");
    const pxPerStep = 3;
    let moved = false;
    let previewStart = baseStart;
    let previewEnd = baseEnd;
    const startY = ev.clientY;
    axisBtn._noriaTlDragLock = true;
    axisBtn.classList.add("is-dragging");
    ev.preventDefault();
    ev.stopPropagation();
    function updatePreview(nextStart, nextEnd) {
      previewStart = Math.max(0, Math.min(24 * 60 - 6, nextStart));
      previewEnd = Math.max(previewStart + 5, Math.min(24 * 60 - 1, nextEnd));
      if (timeMainEl) {
        timeMainEl.textContent = noriaTlFromMinutes(previewStart);
        timeMainEl.classList.add("noria-tl-time-preview");
      }
      if (timeEndEl) {
        timeEndEl.textContent = noriaTlFromMinutes(previewEnd);
        timeEndEl.classList.remove("is-empty");
      }
      if (durationEl) {
        durationEl.textContent = noriaTlFormatDurationCompact(Math.max(5, previewEnd - previewStart));
        durationEl.classList.remove("is-empty");
      }
    }
    function onMove(mev) {
      const deltaPx = mev.clientY - startY;
      if (Math.abs(deltaPx) < dragDeadzonePx) return;
      const step = Math.round(deltaPx / pxPerStep);
      const deltaMin = step * dragStepMin;
      moved = moved || Math.abs(deltaMin) >= dragStepMin;
      const snappedStart = Math.round((baseStart + deltaMin) / snapMinutes) * snapMinutes;
      const snappedEnd = Math.round((baseEnd + deltaMin) / snapMinutes) * snapMinutes;
      updatePreview(snappedStart, snappedEnd);
      mev.preventDefault();
    }
    async function onUp(uev) {
      document.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("pointerup", onUp, true);
      document.removeEventListener("pointercancel", onUp, true);
      axisBtn.classList.remove("is-dragging");
      setTimeout(() => {
        axisBtn._noriaTlDragLock = false;
      }, 0);
      if (!moved) {
        if (timeMainEl) timeMainEl.classList.remove("noria-tl-time-preview");
        try {
          axisBtn._noriaTlPointerToggleTs = Date.now();
          if (typeof onTap === "function") onTap();
        } catch (_) {}
        return;
      }
      const commit = async () => noriaTlApplyTaskTimeRange(tk, ymd, previewStart, previewEnd);
      let ok = false;
      if (dragCommitPolicy === "debounced") {
        const commitDelay = Math.max(20, Number(tlCfg.localRefreshDelay || 50));
        await new Promise((resolve) => setTimeout(resolve, commitDelay));
        ok = await commit();
      } else {
        ok = await commit();
      }
      if (timeMainEl) {
        timeMainEl.classList.remove("noria-tl-time-preview");
        if (!ok) {
          const restore = noriaTlReadTaskTimeMeta(tk, ymd);
          timeMainEl.textContent = restore.timeMainLabel || "";
        }
      }
      if (timeEndEl && !ok) {
        const restoreEnd = noriaTlReadTaskTimeMeta(tk, ymd);
        timeEndEl.textContent = restoreEnd.timeSecondaryLabel || "";
        timeEndEl.classList.toggle("is-empty", !restoreEnd.timeSecondaryLabel);
      }
      if (durationEl && !ok) {
        const restoreDuration = noriaTlReadTaskTimeMeta(tk, ymd);
        durationEl.textContent = restoreDuration.durationLabel || "";
        durationEl.classList.toggle("is-empty", !restoreDuration.durationLabel);
      }
      try {
        const N = window.Notice;
        if (N && ok) new N(noriaTlRuntimeT("runtime.timeline.notice.timeAdjusted", {
          start: noriaTlFromMinutes(previewStart),
          end: noriaTlFromMinutes(previewEnd)
        }), 2200);
      } catch (_) {}
      uev.preventDefault();
      uev.stopPropagation();
    }
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("pointerup", onUp, true);
    document.addEventListener("pointercancel", onUp, true);
  });
}

function noriaTlBindDurationDrag(durationEl, tk, dayYmd, timeMainEl, timeEndEl) {
  if (!durationEl || !tk) return;
  durationEl.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0 || noriaTlIsModifiedClick(ev)) return;
    const ymd = String(dayYmd || "").trim();
    if (!ymd || !m(ymd, "YYYY-MM-DD", true).isValid()) return;
    const plannerLab = noriaTlReadPlannerLabControls();
    const tlCfg = plannerLab.timeline || {};
    const baseMeta = noriaTlReadTaskTimeMeta(tk, ymd);
    const baseStart = baseMeta.startMin != null ? baseMeta.startMin : null;
    if (baseStart == null) return;
    const defaultDurationMin = Math.max(15, Number(tlCfg.defaultDurationMin || 30));
    const stepMin = Math.max(5, Number(tlCfg.durationDragStepMin || 15));
    const deadzonePx = Math.max(0, Number(tlCfg.durationDragDeadzonePx || 4));
    const pxPerStep = 3;
    const baseEnd = baseMeta.endMin != null ? baseMeta.endMin : Math.min(baseStart + defaultDurationMin, 24 * 60 - 1);
    const baseDuration = Math.max(stepMin, baseEnd - baseStart);
    let moved = false;
    let previewDuration = baseDuration;
    let previewEnd = baseEnd;
    const originY = ev.clientY;
    durationEl.classList.add("is-dragging");
    try { durationEl.setPointerCapture(ev.pointerId); } catch (_) {}
    const applyPreview = function () {
      durationEl.textContent = noriaTlFormatDurationCompact(previewDuration);
      durationEl.classList.toggle("is-empty", !previewDuration);
      if (timeEndEl && tlCfg.showEndTimeInTimeColumn === true) {
        timeEndEl.textContent = noriaTlFromMinutes(previewEnd);
        timeEndEl.classList.remove("is-empty");
      }
    };
    const restorePreview = function () {
      const meta = noriaTlReadTaskTimeMeta(tk, ymd);
      durationEl.textContent = meta.durationLabel || "";
      durationEl.classList.toggle("is-empty", !meta.durationLabel);
      if (timeEndEl) {
        const showEnd = tlCfg.showEndTimeInTimeColumn === true;
        const nextText = showEnd ? (meta.timeSecondaryLabel || "") : "";
        timeEndEl.textContent = nextText;
        timeEndEl.classList.toggle("is-empty", !nextText);
      }
    };
    const onMove = function (mev) {
      const dy = mev.clientY - originY;
      const abs = Math.abs(dy);
      if (!moved && abs < deadzonePx) return;
      moved = true;
      const rawSteps = Math.round(dy / pxPerStep);
      const nextDuration = Math.max(stepMin, Math.min((24 * 60) - baseStart, baseDuration + rawSteps * stepMin));
      if (nextDuration === previewDuration) return;
      previewDuration = nextDuration;
      previewEnd = Math.min(baseStart + previewDuration, 24 * 60 - 1);
      applyPreview();
      mev.preventDefault();
      mev.stopPropagation();
    };
    const onUp = function (uev) {
      try { document.removeEventListener("pointermove", onMove, true); } catch (_) {}
      try { document.removeEventListener("pointerup", onUp, true); } catch (_) {}
      try { document.removeEventListener("pointercancel", onUp, true); } catch (_) {}
      try { durationEl.releasePointerCapture(uev.pointerId); } catch (_) {}
      durationEl.classList.remove("is-dragging");
      if (!moved) {
        restorePreview();
        return;
      }
      const startMeta = noriaTlReadTaskDateTimeField(tk, "start");
      const startYmd = (startMeta && startMeta.ymd) || primaryYmdForTask(tk) || ymd;
      const fmt = String(tlCfg.writebackDateTimeFormat || "YYYY-MM-DD HH:mm");
      const startText = noriaTlFromMinutes(baseStart);
      const dueText = noriaTlFromMinutes(previewEnd);
      const startValue = m(`${startYmd} ${startText}`, "YYYY-MM-DD HH:mm").format(fmt);
      const dueValue = m(`${startYmd} ${dueText}`, "YYYY-MM-DD HH:mm").format(fmt);
      void noriaTlMutateTaskLine(tk, (line) => {
        let next = noriaTlUpsertInlineField(line, "start", startValue);
        next = noriaTlUpsertInlineField(next, "due", dueValue);
        return next;
      }).then((ok) => {
        if (!ok) {
          restorePreview();
          return;
        }
        try {
          const N = window.Notice;
          if (N) new N(noriaTlRuntimeT("runtime.timeline.notice.durationAdjusted", {
            duration: noriaTlFormatDurationCompact(previewDuration)
          }), 2200);
        } catch (_) {}
      });
      uev.preventDefault();
      uev.stopPropagation();
    };
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("pointerup", onUp, true);
    document.addEventListener("pointercancel", onUp, true);
    ev.preventDefault();
    ev.stopPropagation();
  });
}

function noriaTlBindLabPanelDismissOnce(panel) {
  if (!panel || panel._noriaTlDismissBound === "1") return;
  panel._noriaTlDismissBound = "1";
  const clear = () => {
    try { document.removeEventListener("pointerdown", onDocPointerDown, true); } catch (_) {}
    try { document.removeEventListener("keydown", onDocKeyDown, true); } catch (_) {}
    try { panel._noriaTlDismissBound = "0"; } catch (_) {}
  };
  const onDocPointerDown = (ev) => {
    if (!panel || panel.hidden) {
      clear();
      return;
    }
    const target = ev && ev.target ? ev.target : null;
    if (!target) return;
    try {
      if (panel.contains(target)) return;
      if (target.closest && target.closest(".noria-tl-toolbar-link--lab")) return;
    } catch (_) {}
    if (typeof panel._noriaTlSetOpenState === "function") {
      panel._noriaTlSetOpenState(false);
    } else {
      panel.hidden = true;
    }
    clear();
  };
  const onDocKeyDown = (ev) => {
    if (!panel || panel.hidden) {
      clear();
      return;
    }
    if (!ev || ev.key !== "Escape") return;
    if (typeof panel._noriaTlSetOpenState === "function") {
      panel._noriaTlSetOpenState(false);
    } else {
      panel.hidden = true;
    }
    clear();
  };
  setTimeout(() => {
    try { document.addEventListener("pointerdown", onDocPointerDown, true); } catch (_) {}
    try { document.addEventListener("keydown", onDocKeyDown, true); } catch (_) {}
  }, 0);
}

function noriaTlAppendNowMarker(parent, nowMin) {
  if (!parent || typeof parent.createEl !== "function") return null;
  const li = parent.createEl("li", { cls: "noria-tl-now-marker" });
  li.setAttribute("aria-label", noriaTlRuntimeT("runtime.timeline.now", { time: noriaTlFromMinutes(nowMin) }));
  li.createDiv({ cls: "noria-tl-now-time", text: noriaTlFromMinutes(nowMin) });
  const axis = li.createDiv({ cls: "noria-tl-now-axis" });
  axis.createDiv({ cls: "noria-tl-now-pin" });
  const hand = li.createDiv({ cls: "noria-tl-now-hand" });
  hand.createDiv({ cls: "noria-tl-now-line" });
  return li;
}

function noriaTlClosestTaskIndexByClick(list, ev) {
  if (!list || !ev) return null;
  const taskEls = Array.from(list.querySelectorAll(":scope > .noria-tl-task")).filter((el) => {
    try { return el.offsetParent !== null; } catch (_) { return true; }
  });
  if (!taskEls.length) return { prevIndex: -1, nextIndex: -1 };
  const taskIndex = (el, fallback) => {
    const n = Number(el && el.getAttribute && el.getAttribute("data-day-task-index"));
    return Number.isFinite(n) ? n : fallback;
  };
  const y = Number(ev.clientY);
  if (!Number.isFinite(y)) return null;
  for (let i = 0; i < taskEls.length; i++) {
    const rect = taskEls[i].getBoundingClientRect();
    if (y < rect.top) return { prevIndex: i > 0 ? taskIndex(taskEls[i - 1], i - 1) : -1, nextIndex: taskIndex(taskEls[i], i) };
    if (y <= rect.bottom) {
      const gapPx = Math.max(6, Number((noriaTlReadPlannerLabControls().timeline || {}).taskGapY) || 8);
      if (y >= rect.bottom - gapPx) {
        return {
          prevIndex: taskIndex(taskEls[i], i),
          nextIndex: i + 1 < taskEls.length ? taskIndex(taskEls[i + 1], i + 1) : taskIndex(taskEls[i], i) + 1
        };
      }
      return null;
    }
  }
  const lastIdx = taskIndex(taskEls[taskEls.length - 1], taskEls.length - 1);
  return { prevIndex: lastIdx, nextIndex: lastIdx + 1 };
}

function noriaTlBindTodayBlankCreate(list, dayTasks, ymd, todayYmd, root, tlCfg) {
  if (!list || ymd !== todayYmd) return;
  list.addEventListener("click", (ev) => {
    try {
      if (!root || !root.classList || !root.classList.contains("noria-tl-today-focus")) return;
      const target = ev.target;
      if (target && target.closest && target.closest("a,button,.noria-tl-col-card,.noria-tl-task-title,.noria-tl-task-meta-row,.noria-tl-now-marker")) return;
      const hit = noriaTlClosestTaskIndexByClick(list, ev);
      if (!hit) return;
      const tasks = Array.isArray(dayTasks) ? dayTasks : [];
      const prev = hit.prevIndex >= 0 && hit.prevIndex < tasks.length ? tasks[hit.prevIndex] : null;
      const next = hit.nextIndex >= 0 && hit.nextIndex < tasks.length ? tasks[hit.nextIndex] : null;
      const startMin = noriaTlInferBlankCreateStartMin({
        prevMeta: prev ? noriaTlReadTaskTimeMeta(prev, ymd) : null,
        nextMeta: next ? noriaTlReadTaskTimeMeta(next, ymd) : null,
        nowMin: noriaTlNowMinutes(),
        fallbackMin: 9 * 60,
        snapMinutes: tlCfg && tlCfg.snapMinutes,
        defaultDurationMin: tlCfg && tlCfg.defaultDurationMin
      });
      ev.preventDefault();
      ev.stopPropagation();
      void noriaTlInvokeOpenTaskDateTimeEditor(null, {
        dateStr: ymd,
        startMin,
        returnFocusEl: list
      });
    } catch (_) {}
  });
}

function appendTaskLine(parent, tk, opts) {
  opts = opts || {};
  const tlCfg = (noriaTlReadPlannerLabControls().timeline || {});
  const todayM = opts.todayM || m().startOf("day");
  const dayYmd = String(opts.dayYmd || primaryYmdForTask(tk) || todayM.format("YYYY-MM-DD")).trim();
  const path = String(tk.path || (tk.link && tk.link.path) || "").replace(/\\/g, "/");
  const text = stripForDisplay(tk.text != null ? tk.text : tk.visual || "") || noriaTlRuntimeT("runtime.timeline.task.noDescription");
  const inc = taskIncomplete(tk);
  const ymdP = primaryYmdForTask(tk);
  const t0 = m().startOf("day");
  const overdue = !!(
    inc &&
    ymdP &&
    m(ymdP, "YYYY-MM-DD", true).isValid() &&
    m(ymdP, "YYYY-MM-DD").isBefore(t0, "day")
  );
  const unplanned = !!(inc && !ymdP);
  const todoDated = !!(inc && ymdP && !overdue);
  const timeMeta = noriaTlReadTaskTimeMeta(tk, dayYmd);

  const li = parent.createEl("li", { cls: "noria-tl-task" });
  li.setAttribute("data-todo-dated", todoDated ? "1" : "0");
  li.setAttribute("data-overdue", overdue ? "1" : "0");
  li.setAttribute("data-unplanned", unplanned ? "1" : "0");
  li.setAttribute("data-todo", inc ? "1" : "0");
  li.setAttribute("data-has-time", timeMeta.hasTime ? "1" : "0");
  li.setAttribute("data-time-rank", String(timeMeta.sortRank));
  li.setAttribute("data-date", dayYmd);

  const canToggle = taskLineIndex(tk) >= 0 && !!path;
  const pomodoroState0 = noriaTlReadPomodoroState();
  const stablePomodoroKey0 = canToggle ? noriaTlTaskPomodoroKey(tk) : "";
  const attachKey = canToggle ? (stablePomodoroKey0 || noriaTlTaskAttachKey(tk)) : "";
  if (attachKey) {
    try { noriaTlRenderedTaskByAttachKey.set(attachKey, tk); } catch (_) {}
    if (stablePomodoroKey0 && stablePomodoroKey0 !== attachKey) {
      try { noriaTlRenderedTaskByAttachKey.set(stablePomodoroKey0, tk); } catch (_) {}
    }
  }
  const pomodoroSummary0 = noriaTlBuildTaskPomodoroSummary(pomodoroState0, stablePomodoroKey0 || attachKey);
  const pomodoroAttached0 = !!(attachKey && noriaTlIsTimerAttachedKey(attachKey));
  const shouldShowPomodoro = !!(noriaTlIsPomodoroEnabled() && canToggle && (pomodoroAttached0 || pomodoroSummary0.visible));
  const colTime = li.createDiv({ cls: "noria-tl-col-time" });
  const timeMain = colTime.createDiv({ cls: "noria-tl-time-main", text: timeMeta.timeMainLabel || "" });
  const timeMinorText = tlCfg.showEndTimeInTimeColumn === true ? (timeMeta.timeSecondaryLabel || "") : "";
  const timeMinor = colTime.createDiv({ cls: "noria-tl-time-minor", text: timeMinorText || "" });
  if (!timeMain.textContent && !timeMinorText) {
    colTime.classList.add("is-empty");
  }
  if (!timeMinorText) {
    timeMinor.classList.add("is-empty");
    timeMinor.setText("");
  }

  const colAxis = li.createDiv({ cls: "noria-tl-col-axis" });
  const node = colAxis.createEl("button", {
    cls: "noria-tl-check noria-tl-node",
    type: "button",
    attr: {
      "aria-label": inc ? noriaTlRuntimeT("runtime.timeline.task.toggleDone") : noriaTlRuntimeT("runtime.timeline.task.toggleOpen"),
      "aria-pressed": inc ? "false" : "true"
    }
  });
  if (!inc) {
    node.classList.add("noria-tl-check-done");
  }
  if (overdue && inc) {
    node.classList.add("noria-tl-check-overdue");
  }
  if (unplanned && inc) {
    node.classList.add("noria-tl-check-unplanned");
  }
  if (!canToggle) {
    node.classList.add("noria-tl-check-locked");
    node.disabled = true;
    node.setAttribute("aria-label", noriaTlRuntimeT("runtime.timeline.task.lineMissing"));
  } else {
    node.addEventListener("click", (ev) => {
      try {
        const lastPointerToggle = Number(node._noriaTlPointerToggleTs || 0);
        if (lastPointerToggle > 0 && Date.now() - lastPointerToggle < 360) {
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
      } catch (_) {}
      if (node._noriaTlDragLock) {
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();
      void toggleTimelineTaskLine(tk, node);
    });
  }

  let durationLabelEl = null;
  if (canToggle) {
    if (tlCfg.showDurationUnderTimer !== false) {
      const durationText = timeMeta.durationLabel || "";
      durationLabelEl = colAxis.createDiv({ cls: "noria-tl-duration-label", text: durationText });
      durationLabelEl.classList.toggle("is-empty", !durationText);
      durationLabelEl.setAttribute("role", "button");
      durationLabelEl.setAttribute("tabindex", "0");
      durationLabelEl.setAttribute("title", noriaTlRuntimeT("runtime.timeline.task.durationDrag"));
      noriaTlBindDurationDrag(durationLabelEl, tk, dayYmd, timeMain, timeMinor);
    }
    noriaTlBindAxisDrag(node, tk, dayYmd, timeMain, timeMinor, durationLabelEl, () => {
      void toggleTimelineTaskLine(tk, node);
    });
  }

  const card = li.createDiv({ cls: "noria-tl-col-card noria-tl-task-track" });
  if (shouldShowPomodoro) card.classList.add("noria-tl-has-pomodoro");
  if (canToggle) {
    const bindTimerAttachDrop = (dropEl) => {
      if (!noriaTlIsPomodoroEnabled()) return;
      if (!dropEl) return;
      let cachedDropRect = null;
      let hoverRaf = 0;
      const setDropHover = (on) => {
        const next = !!on;
        if (hoverRaf) return;
        const rafHost = (typeof window !== "undefined" && window.requestAnimationFrame) ? window : null;
        const apply = () => {
          hoverRaf = 0;
          li.classList.toggle("noria-tl-timer-drop-hover", next);
        };
        if (rafHost) hoverRaf = rafHost.requestAnimationFrame(apply);
        else apply();
      };
      const resetDropHover = () => {
        cachedDropRect = null;
        if (hoverRaf) {
          try { cancelAnimationFrame(hoverRaf); } catch (_) {}
          hoverRaf = 0;
        }
        li.classList.remove("noria-tl-timer-drop-hover");
      };
      const isRightDropZone = (ev) => {
        try {
          if (!cachedDropRect) cachedDropRect = dropEl.getBoundingClientRect();
          const rect = cachedDropRect;
          return !(rect && Number.isFinite(rect.width) && ev.clientX < rect.left + rect.width * 0.46);
        } catch (_) {
          return true;
        }
      };
      dropEl.addEventListener("dragover", (ev) => {
        if (!noriaTlHasTimerAttachPayload(ev)) return;
        if (!isRightDropZone(ev)) {
          setDropHover(false);
          return;
        }
        ev.preventDefault();
        ev.stopPropagation();
        try { ev.dataTransfer.dropEffect = "copy"; } catch (_) {}
        setDropHover(true);
      });
      dropEl.addEventListener("dragleave", () => {
        resetDropHover();
      });
      dropEl.addEventListener("drop", async (ev) => {
        const payload = noriaTlReadTimerAttachPayload(ev);
        if (!payload.ok) return;
        if (!isRightDropZone(ev)) {
          resetDropHover();
          return;
        }
        ev.preventDefault();
        ev.stopPropagation();
        resetDropHover();
        const previousKey = String(globalThis.__noriaTimelineActiveTimerAttachKey || "");
        const previousState = noriaTlReadPomodoroState();
        try {
          const sourceKey = String(payload.sourceKey || "").trim();
          let droppedKey = "";
          const res = await noriaTlTransferPomodoroToTask(sourceKey, tk, null, {
            onError: (err) => {
              noriaTlSetLocalPomodoroState(previousState);
              noriaTlSetSingleTimerAttachKey(previousKey);
              if (sourceKey) noriaTlPatchExistingPomodoroDocksForKey(sourceKey, previousState);
              if (droppedKey) noriaTlPatchExistingPomodoroDocksForKey(droppedKey, previousState);
              noriaTlNotice(noriaTlRuntimeT("runtime.timeline.pomodoro.taskSwitchSaveFailed", { message: err && err.message ? err.message : err }), 3200);
            }
          });
          if (!res || !res.ok) return;
          const nextKey = res.meta && res.meta.taskKey ? res.meta.taskKey : (res.state && res.state.activeAttachTaskKey) || "";
          droppedKey = nextKey;
          if (sourceKey && sourceKey !== nextKey) noriaTlPatchExistingPomodoroDocksForKey(sourceKey, res.state);
          noriaTlEnsurePomodoroDock(card, tk, nextKey, res.state, timeMeta);
        } catch (err) {
          noriaTlSetLocalPomodoroState(previousState);
          noriaTlSetSingleTimerAttachKey(previousKey);
          console.warn("[noria tasksTimeline] pomodoro transfer failed", err);
          noriaTlNotice(noriaTlRuntimeT("runtime.timeline.pomodoro.taskSwitchFailed", { message: err && err.message ? err.message : err }), 3200);
          try { noriaTlRefreshVisiblePomodoroDocks(previousState); } catch (_) {}
          return;
        }
        try {
          const N = window.Notice;
          if (N) new N(noriaTlRuntimeT("runtime.timeline.pomodoro.attachDone"), 1800);
        } catch (_) {}
      });
    };
    bindTimerAttachDrop(card);
    card.addEventListener("contextmenu", (ev) => {
      if (ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
      ev.preventDefault();
      ev.stopPropagation();
      const proxy = noriaTlBuildSyntheticTaskElForTimeEditor(tk, card.ownerDocument || document);
      void noriaTlInvokeOpenTaskDateTimeEditor(proxy, { returnFocusEl: card });
    });
  }
  const body = card.createDiv({ cls: "noria-tl-task-body" });
  const titleRow = body.createDiv({ cls: "noria-tl-task-title noria-tl-task-title-main" });
  const titleStart = titleRow.createDiv({ cls: "noria-tl-task-title-start" });
  const href = path ? path.replace(/\.md$/i, "") : "";
  if (path) {
    const a = titleStart.createEl("a", {
      cls: "internal-link noria-tl-task-title-link",
      href,
      attr: {
        "data-href": href,
        title: noriaTlRuntimeT("runtime.timeline.task.openLine")
      }
    });
    a.setText(text);
    a.addEventListener("click", (ev) => {
      if (noriaTlIsModifiedClick(ev)) return;
      ev.preventDefault();
      ev.stopPropagation();
      const li = taskLineIndex(tk);
      void openVaultMarkdownAtLine(path, li >= 0 ? li : 0);
    });
  } else {
    titleStart.createSpan({ cls: "noria-tl-task-title-plain", text });
  }

  const hint = scheduleHintForTask(tk, todayM);
  if (hint && hint.text) {
    const hSpan = titleRow.createSpan({ cls: `noria-tl-title-hint ${hint.cls}` });
    hSpan.setText(hint.text);
  }

  if (shouldShowPomodoro) {
    noriaTlEnsurePomodoroDock(card, tk, stablePomodoroKey0 || attachKey, pomodoroState0, timeMeta);
  }

  let tagList = tagsForTaskRich(tk);
  if ((tlCfg.hideControlTagsInTitle !== false) && Array.isArray(tagList)) {
    tagList = tagList.filter((tag) => !noriaTlIsHiddenControlTag(tag));
  }
  if (path || tagList.length) {
    const metaRow = card.createDiv({ cls: "noria-tl-task-meta-row" });
    if (path) {
      const noteWrap = metaRow.createSpan({ cls: "noria-tl-meta-note" });
      const iconHost = noteWrap.createSpan({ cls: "noria-tl-note-icon" });
      if (typeof setIcon === "function") {
        try {
          setIcon(iconHost, "file-text");
        } catch (_) {}
      }
      const nhref = path.replace(/\.md$/i, "");
      const noteLink = noteWrap.createEl("a", {
        cls: "internal-link noria-tl-meta-note-link",
        href: nhref,
        attr: {
          "data-href": nhref,
          title: noriaTlRuntimeT("runtime.timeline.task.openNote")
        }
      });
      noteLink.setText(noteBasenameForPath(path));
      noteLink.addEventListener("click", (ev) => {
        if (noriaTlIsModifiedClick(ev)) return;
        ev.preventDefault();
        ev.stopPropagation();
        void openVaultMarkdownAtLine(path, 0);
      });
    }
    for (let ti = 0; ti < tagList.length; ti++) {
      metaRow.createSpan({ cls: "noria-tl-tag-chip", text: tagList[ti] });
    }
  }
  return li;
}

const NORIA_TL_LAB_GROUPS = [
  { id: "layout", label: noriaTlRuntimeT("runtime.timeline.lab.layout"), keys: ["timeColWidth", "timeColInset", "timeToAxisGap", "axisColWidth", "axisToCardGap", "axisLineOffset", "taskGapY", "cardPaddingX", "cardPaddingY"] },
  { id: "time", label: noriaTlRuntimeT("runtime.timeline.lab.time"), keys: ["timeFontSize", "secondaryFontSize", "twoLineTimeGap", "timeMainWeight", "timeMinorOpacity", "timeColAlign", "emptyTimeOpacity"] },
  { id: "axis", label: noriaTlRuntimeT("runtime.timeline.lab.axis"), keys: ["nodeSize", "nodeBorderWidth", "nodeBorderAlpha", "nodeFillAlpha", "lineWidth", "lineAlpha", "lineTopOffset", "lineBottomScale", "timerBtnSize", "durationLabelGap", "durationLabelFontSize", "durationLabelShiftX"] },
  { id: "card", label: noriaTlRuntimeT("runtime.timeline.lab.card"), keys: ["cardRadius", "cardBorderAlpha", "cardShadowAlpha", "cardShadowY", "cardShadowBlur", "titleFontSize", "titleLineClamp", "titleGap", "metaOpacity"] },
  { id: "sort", label: noriaTlRuntimeT("runtime.timeline.lab.sort"), keys: ["sortPolicy", "timeReadPriority", "inlineStartDueFirst", "fallbackStartDueTime", "unplannedSortMode", "writebackDateTimeFormat"] },
  { id: "drag", label: noriaTlRuntimeT("runtime.timeline.lab.drag"), keys: ["dragStepMin", "defaultDurationMin", "dragDeadzonePx", "durationDragStepMin", "durationDragDeadzonePx", "snapMinutes", "localRefreshDelay", "dragCommitPolicy"] },
  { id: "motion", label: noriaTlRuntimeT("runtime.timeline.lab.motion"), keys: ["layoutTransitionMs", "disableTransitionDuringDrag", "rerenderDebounceMs", "stabilityKeepBias"] },
  { id: "switch", label: noriaTlRuntimeT("runtime.timeline.lab.switch"), keys: ["hideNoTimeLabel", "showDayEmptyPlaceholder", "showDurationUnderTimer", "hideControlTagsInTitle", "showEndTimeInTimeColumn", "labPanelDock"] }
];

function noriaTlLabText(key, fallback) {
  const value = noriaTlRuntimeT(key);
  return value && value !== key ? value : String(fallback || key || "");
}

function noriaTlLabOptionKeys(field, entries) {
  const out = {};
  (entries || []).forEach((value) => {
    out[value] = `runtime.timeline.lab.option.${field}.${value}`;
  });
  return out;
}

const noriaTlField = (key, spec) => ({
  labelKey: `runtime.timeline.lab.field.${key}`,
  ...(spec || {})
});

const NORIA_TL_LAB_FIELDS = {
  timeColWidth: noriaTlField("timeColWidth", { label: "Time column width", type: "number", min: 34, max: 120, step: 1, suffix: "px" }),
  timeColInset: noriaTlField("timeColInset", { label: "Time column inset", type: "number", min: 0, max: 24, step: 1, suffix: "px" }),
  timeToAxisGap: noriaTlField("timeToAxisGap", { label: "Time-to-axis gap", type: "number", min: -12, max: 24, step: 1, suffix: "px" }),
  axisColWidth: noriaTlField("axisColWidth", { label: "Axis column width", type: "number", min: 10, max: 60, step: 1, suffix: "px" }),
  axisToCardGap: noriaTlField("axisToCardGap", { label: "Axis-to-card gap", type: "number", min: -12, max: 28, step: 1, suffix: "px" }),
  axisLineOffset: noriaTlField("axisLineOffset", { label: "Axis line offset", type: "number", min: -16, max: 16, step: 1, suffix: "px" }),
  taskGapY: noriaTlField("taskGapY", { label: "Task vertical gap", type: "number", min: 0, max: 30, step: 1, suffix: "px" }),
  cardPaddingX: noriaTlField("cardPaddingX", { label: "Card horizontal padding", type: "number", min: 2, max: 24, step: 1, suffix: "px" }),
  cardPaddingY: noriaTlField("cardPaddingY", { label: "Card vertical padding", type: "number", min: 2, max: 20, step: 1, suffix: "px" }),
  timeFontSize: noriaTlField("timeFontSize", { label: "Primary time size", type: "number", min: 8, max: 18, step: 0.5, suffix: "px" }),
  secondaryFontSize: noriaTlField("secondaryFontSize", { label: "Secondary text size", type: "number", min: 7, max: 16, step: 0.5, suffix: "px" }),
  twoLineTimeGap: noriaTlField("twoLineTimeGap", { label: "Two-line time gap", type: "number", min: 0, max: 12, step: 1, suffix: "px" }),
  timeMainWeight: noriaTlField("timeMainWeight", { label: "Primary time weight", type: "number", min: 400, max: 800, step: 10, suffix: "" }),
  timeMinorOpacity: noriaTlField("timeMinorOpacity", { label: "Secondary time opacity", type: "number", min: 0.2, max: 1, step: 0.02, suffix: "" }),
  timeColAlign: noriaTlField("timeColAlign", { label: "Time column alignment", type: "enum", options: ["left", "center", "right"], optionLabels: { left: "Left", center: "Center", right: "Right" }, optionLabelKeys: noriaTlLabOptionKeys("timeColAlign", ["left", "center", "right"]) }),
  emptyTimeOpacity: noriaTlField("emptyTimeOpacity", { label: "Empty time opacity", type: "number", min: 0, max: 1, step: 0.02, suffix: "" }),
  nodeSize: noriaTlField("nodeSize", { label: "Node size", type: "number", min: 7, max: 28, step: 1, suffix: "px" }),
  nodeBorderWidth: noriaTlField("nodeBorderWidth", { label: "Node border width", type: "number", min: 0, max: 4, step: 0.5, suffix: "px" }),
  nodeBorderAlpha: noriaTlField("nodeBorderAlpha", { label: "Node border strength", type: "number", min: 0, max: 1, step: 0.02, suffix: "" }),
  nodeFillAlpha: noriaTlField("nodeFillAlpha", { label: "Node fill strength", type: "number", min: 0, max: 1, step: 0.02, suffix: "" }),
  lineWidth: noriaTlField("lineWidth", { label: "Axis width", type: "number", min: 1, max: 4, step: 0.5, suffix: "px" }),
  lineAlpha: noriaTlField("lineAlpha", { label: "Axis strength", type: "number", min: 0, max: 1, step: 0.02, suffix: "" }),
  lineTopOffset: noriaTlField("lineTopOffset", { label: "Axis top offset", type: "number", min: -12, max: 24, step: 1, suffix: "px" }),
  lineBottomScale: noriaTlField("lineBottomScale", { label: "Axis lower extension", type: "number", min: 0.2, max: 1.6, step: 0.05, suffix: "" }),
  timerBtnSize: noriaTlField("timerBtnSize", { label: "Pomodoro button size", type: "number", min: 10, max: 24, step: 1, suffix: "px" }),
  durationLabelGap: noriaTlField("durationLabelGap", { label: "Duration label gap", type: "number", min: 0, max: 14, step: 1, suffix: "px" }),
  durationLabelFontSize: noriaTlField("durationLabelFontSize", { label: "Duration label size", type: "number", min: 7, max: 16, step: 0.5, suffix: "px" }),
  durationLabelShiftX: noriaTlField("durationLabelShiftX", { label: "Duration label shift", type: "number", min: -18, max: 12, step: 1, suffix: "px" }),
  cardRadius: noriaTlField("cardRadius", { label: "Card radius", type: "number", min: 4, max: 24, step: 1, suffix: "px" }),
  cardBorderAlpha: noriaTlField("cardBorderAlpha", { label: "Card border strength", type: "number", min: 0, max: 1, step: 0.02, suffix: "" }),
  cardShadowAlpha: noriaTlField("cardShadowAlpha", { label: "Card shadow strength", type: "number", min: 0, max: 1, step: 0.02, suffix: "" }),
  cardShadowY: noriaTlField("cardShadowY", { label: "Card shadow Y offset", type: "number", min: -2, max: 10, step: 1, suffix: "px" }),
  cardShadowBlur: noriaTlField("cardShadowBlur", { label: "Card shadow blur", type: "number", min: 0, max: 24, step: 1, suffix: "px" }),
  titleFontSize: noriaTlField("titleFontSize", { label: "Title size", type: "number", min: 10, max: 18, step: 0.5, suffix: "px" }),
  titleLineClamp: noriaTlField("titleLineClamp", { label: "Title line limit", type: "number", min: 1, max: 4, step: 1, suffix: "", suffixKey: "runtime.timeline.lab.suffix.lines" }),
  titleGap: noriaTlField("titleGap", { label: "Title hint gap", type: "number", min: 2, max: 18, step: 1, suffix: "px" }),
  metaOpacity: noriaTlField("metaOpacity", { label: "Metadata opacity", type: "number", min: 0.2, max: 1, step: 0.02, suffix: "" }),
  sortPolicy: noriaTlField("sortPolicy", { label: "Sort policy", type: "enum", options: ["time-priority", "line-first", "created-first"], optionLabels: { "time-priority": "Time priority", "line-first": "Line first", "created-first": "Created first" }, optionLabelKeys: noriaTlLabOptionKeys("sortPolicy", ["time-priority", "line-first", "created-first"]) }),
  timeReadPriority: noriaTlField("timeReadPriority", { label: "Time read priority", type: "enum", options: ["inline-first", "legacy-first"], optionLabels: { "inline-first": "Inline fields first", "legacy-first": "Legacy fields first" }, optionLabelKeys: noriaTlLabOptionKeys("timeReadPriority", ["inline-first", "legacy-first"]) }),
  inlineStartDueFirst: noriaTlField("inlineStartDueFirst", { label: "Prefer [start::] / [due::]", type: "boolean" }),
  fallbackStartDueTime: noriaTlField("fallbackStartDueTime", { label: "Fallback startTime / dueTime", type: "boolean" }),
  unplannedSortMode: noriaTlField("unplannedSortMode", { label: "Unplanned sort", type: "enum", options: ["line", "created"], optionLabels: { line: "By line", created: "By created time" }, optionLabelKeys: noriaTlLabOptionKeys("unplannedSortMode", ["line", "created"]) }),
  writebackDateTimeFormat: noriaTlField("writebackDateTimeFormat", { label: "Writeback format", type: "enum", options: ["YYYY-MM-DD HH:mm"], optionLabels: { "YYYY-MM-DD HH:mm": "YYYY-MM-DD HH:mm" } }),
  dragStepMin: noriaTlField("dragStepMin", { label: "Drag granularity", type: "number", min: 1, max: 60, step: 1, suffix: "m" }),
  defaultDurationMin: noriaTlField("defaultDurationMin", { label: "Default duration", type: "number", min: 5, max: 240, step: 5, suffix: "m" }),
  dragDeadzonePx: noriaTlField("dragDeadzonePx", { label: "Drag deadzone", type: "number", min: 0, max: 24, step: 1, suffix: "px" }),
  durationDragStepMin: noriaTlField("durationDragStepMin", { label: "Duration drag granularity", type: "number", min: 5, max: 120, step: 5, suffix: "m" }),
  durationDragDeadzonePx: noriaTlField("durationDragDeadzonePx", { label: "Duration drag deadzone", type: "number", min: 0, max: 24, step: 1, suffix: "px" }),
  snapMinutes: noriaTlField("snapMinutes", { label: "Snap minutes", type: "number", min: 1, max: 60, step: 1, suffix: "m" }),
  localRefreshDelay: noriaTlField("localRefreshDelay", { label: "Local refresh delay", type: "number", min: 10, max: 800, step: 10, suffix: "ms" }),
  dragCommitPolicy: noriaTlField("dragCommitPolicy", { label: "Drag commit policy", type: "enum", options: ["pointer-up", "debounced"], optionLabels: { "pointer-up": "Commit on release", debounced: "Debounced commit" }, optionLabelKeys: noriaTlLabOptionKeys("dragCommitPolicy", ["pointer-up", "debounced"]) }),
  layoutTransitionMs: noriaTlField("layoutTransitionMs", { label: "Layout transition", type: "number", min: 0, max: 500, step: 10, suffix: "ms" }),
  disableTransitionDuringDrag: noriaTlField("disableTransitionDuringDrag", { label: "Disable transition while dragging", type: "boolean" }),
  rerenderDebounceMs: noriaTlField("rerenderDebounceMs", { label: "Rerender debounce", type: "number", min: 10, max: 1200, step: 10, suffix: "ms" }),
  stabilityKeepBias: noriaTlField("stabilityKeepBias", { label: "Stability keep bias", type: "number", min: 0, max: 4, step: 1, suffix: "" }),
  hideNoTimeLabel: noriaTlField("hideNoTimeLabel", { label: "Hide no-time label", type: "boolean" }),
  showDayEmptyPlaceholder: noriaTlField("showDayEmptyPlaceholder", { label: "Show empty-day placeholder", type: "boolean" }),
  showDurationUnderTimer: noriaTlField("showDurationUnderTimer", { label: "Show duration under axis", type: "boolean" }),
  hideControlTagsInTitle: noriaTlField("hideControlTagsInTitle", { label: "Hide control tags in title", type: "boolean" }),
  showEndTimeInTimeColumn: noriaTlField("showEndTimeInTimeColumn", { label: "Show end time in time column", type: "boolean" }),
  labPanelDock: noriaTlField("labPanelDock", { label: "Lab panel dock", type: "enum", options: ["detached-right"], optionLabels: { "detached-right": "Detached right panel" }, optionLabelKeys: noriaTlLabOptionKeys("labPanelDock", ["detached-right"]) })
};

function noriaTlLabTimelineFieldSpecMap() {
  const out = { ...NORIA_TL_LAB_FIELDS };
  if (bridge && typeof bridge.getPlannerLabControlsMeta === "function") {
    try {
      const meta = bridge.getPlannerLabControlsMeta();
      const remoteFields = meta && meta.timeline && meta.timeline.fields;
      if (remoteFields && typeof remoteFields === "object") {
        Object.keys(remoteFields).forEach((k) => {
          out[k] = { ...(out[k] || {}), ...(remoteFields[k] || {}) };
        });
      }
    } catch (_) {}
  }
  return out;
}

function noriaTlApplyPreset(cfg, presetName) {
  const next = noriaTlMergePlannerLabControls(cfg);
  const name = String(presetName || "").trim();
  const preset = next.presets && next.presets[name] && next.presets[name].timeline;
  if (!preset || typeof preset !== "object") return next;
  next.timeline = { ...next.timeline, ...preset };
  next.activePresetByScope = { ...(next.activePresetByScope || {}), timeline: name };
  return noriaTlMergePlannerLabControls(next);
}

function noriaTlLabApplyCfg(nextCfg, root, rerender) {
  noriaTlPlannerLabControls = noriaTlMergePlannerLabControls(nextCfg);
  noriaTlApplyPlannerLabVars(root);
  if (typeof rerender === "function") noriaTlQueueLocalRefresh();
  noriaTlSchedulePlannerLabSave();
}

function noriaTlBuildLabControl(panel, specMap, key, root, rerender) {
  const spec = specMap[key];
  if (!spec) return;
  const cfg = noriaTlReadPlannerLabControls();
  const row = panel.createDiv({ cls: "noria-tl-lab-row" });
  row.createSpan({ cls: "noria-tl-lab-row-label", text: noriaTlLabText(spec.labelKey, spec.label || key) });
  const valueEl = row.createSpan({ cls: "noria-tl-lab-row-value" });
  const suffix = () => spec.suffixKey ? noriaTlLabText(spec.suffixKey, spec.suffix || "") : (spec.suffix || "");
  const optionLabel = (value) => {
    const raw = String(value);
    const keyForOption = spec.optionLabelKeys && spec.optionLabelKeys[raw];
    return keyForOption ? noriaTlLabText(keyForOption, (spec.optionLabels && spec.optionLabels[raw]) || raw) : ((spec.optionLabels && spec.optionLabels[raw]) || raw);
  };
  const updateValue = (v) => valueEl.setText(`${v}${suffix()}`);
  if (spec.type === "boolean") {
    const input = row.createEl("input", { type: "checkbox" });
    input.checked = !!cfg.timeline[key];
    updateValue(input.checked ? noriaTlRuntimeT("runtime.timeline.lab.booleanOn") : noriaTlRuntimeT("runtime.timeline.lab.booleanOff"));
    input.addEventListener("change", () => {
      const next = noriaTlReadPlannerLabControls();
      next.timeline[key] = !!input.checked;
      updateValue(input.checked ? noriaTlRuntimeT("runtime.timeline.lab.booleanOn") : noriaTlRuntimeT("runtime.timeline.lab.booleanOff"));
      noriaTlLabApplyCfg(next, root, rerender);
    });
    return;
  }
  if (spec.type === "enum") {
    const sel = row.createEl("select");
    const options = Array.isArray(spec.options) ? spec.options : [];
    options.forEach((val) => {
      const opt = sel.createEl("option", { value: String(val) });
      opt.textContent = optionLabel(val);
    });
    sel.value = String(cfg.timeline[key]);
    updateValue(optionLabel(sel.value));
    sel.addEventListener("change", () => {
      const next = noriaTlReadPlannerLabControls();
      next.timeline[key] = sel.value;
      updateValue(optionLabel(sel.value));
      noriaTlLabApplyCfg(next, root, rerender);
    });
    return;
  }
  const input = row.createEl("input", {
    type: "range",
    attr: { min: String(spec.min), max: String(spec.max), step: String(spec.step || 1), value: String(cfg.timeline[key]) }
  });
  updateValue(input.value);
  input.addEventListener("input", () => {
    const next = noriaTlReadPlannerLabControls();
    next.timeline[key] = Number(input.value);
    updateValue(input.value);
    noriaTlLabApplyCfg(next, root, rerender);
  });
}

function noriaTlBuildLabPanel(parent, root, rerender) {
  const panel = parent.createDiv({ cls: "noria-tl-lab-panel" });
  panel.hidden = true;
  panel._noriaTlSetOpenState = (open) => {
    const isOpen = !!open;
    panel.hidden = !isOpen;
    try {
      if (parent && parent.setAttribute) {
        parent.setAttribute("data-open", isOpen ? "1" : "0");
      }
    } catch (_) {}
    try {
      root.querySelectorAll(".noria-tl-toolbar-link--lab").forEach((el) => {
        el.classList.toggle("noria-tl-toolbar-link--on", isOpen);
      });
    } catch (_) {}
    if (isOpen) {
      noriaTlBindLabPanelDismissOnce(panel);
    }
  };
  panel._noriaTlSetOpenState(false);
  const head = panel.createDiv({ cls: "noria-tl-lab-head" });
  head.createDiv({ cls: "noria-tl-lab-heading", text: noriaTlRuntimeT("runtime.timeline.lab.title") });
  const closeBtn = head.createEl("button", { cls: "noria-tl-lab-close", type: "button", text: noriaTlRuntimeT("runtime.manager.close") });
  closeBtn.addEventListener("click", () => panel._noriaTlSetOpenState(false));
  panel.createDiv({ cls: "noria-tl-lab-scope", text: noriaTlRuntimeT("runtime.timeline.lab.scope") });
  const specMap = noriaTlLabTimelineFieldSpecMap();
  NORIA_TL_LAB_GROUPS.forEach((grp) => {
    const groupWrap = panel.createDiv({ cls: "noria-tl-lab-grid" });
    groupWrap.createDiv({ cls: "noria-tl-lab-heading", text: grp.label });
    grp.keys.forEach((key) => noriaTlBuildLabControl(groupWrap, specMap, key, root, rerender));
  });
  const presetBar = panel.createDiv({ cls: "noria-tl-lab-actions" });
  const presetSel = presetBar.createEl("select");
  [
    ["compact", noriaTlRuntimeT("runtime.timeline.lab.presetCompact")],
    ["balanced", noriaTlRuntimeT("runtime.timeline.lab.presetBalanced")],
    ["relaxed", noriaTlRuntimeT("runtime.timeline.lab.presetRelaxed")]
  ].forEach(([v, label]) => {
    const opt = presetSel.createEl("option", { value: v });
    opt.textContent = label;
  });
  try {
    presetSel.value = String((noriaTlReadPlannerLabControls().activePresetByScope || {}).timeline || "balanced");
  } catch (_) {}
  const presetApply = presetBar.createEl("button", { cls: "noria-tl-lab-btn", text: noriaTlRuntimeT("runtime.timeline.lab.applyPreset"), type: "button" });
  presetApply.addEventListener("click", () => {
    const cfg = noriaTlReadPlannerLabControls();
    const next = noriaTlApplyPreset(cfg, presetSel.value);
    noriaTlLabApplyCfg(next, root, rerender);
  });
  const presetSave = presetBar.createEl("button", { cls: "noria-tl-lab-btn", text: noriaTlRuntimeT("runtime.timeline.lab.savePreset"), type: "button" });
  presetSave.addEventListener("click", () => {
    const cfg = noriaTlReadPlannerLabControls();
    const name = String(presetSel.value || "balanced");
    cfg.presets = cfg.presets || {};
    cfg.presets[name] = { ...(cfg.presets[name] || {}), timeline: { ...(cfg.timeline || {}) } };
    cfg.activePresetByScope = { ...(cfg.activePresetByScope || {}), timeline: name };
    noriaTlLabApplyCfg(cfg, root, rerender);
  });
  const actions = panel.createDiv({ cls: "noria-tl-lab-actions" });
  const resetScope = actions.createEl("button", { cls: "noria-tl-lab-btn", text: noriaTlRuntimeT("runtime.timeline.lab.resetScope"), type: "button" });
  resetScope.addEventListener("click", () => {
    if (!bridge || typeof bridge.resetPlannerLabControls !== "function") return;
    Promise.resolve(bridge.resetPlannerLabControls("timeline")).then((res) => {
      noriaTlPlannerLabControls = noriaTlMergePlannerLabControls((res && res.plannerLabControls) || noriaTlDefaultPlannerLabControls());
      if (typeof rerender === "function") rerender();
    });
  });
  const resetAll = actions.createEl("button", { cls: "noria-tl-lab-btn", text: noriaTlRuntimeT("runtime.timeline.lab.resetAll"), type: "button" });
  resetAll.addEventListener("click", () => {
    if (!bridge || typeof bridge.resetPlannerLabControls !== "function") return;
    Promise.resolve(bridge.resetPlannerLabControls("all")).then((res) => {
      noriaTlPlannerLabControls = noriaTlMergePlannerLabControls((res && res.plannerLabControls) || noriaTlDefaultPlannerLabControls());
      if (typeof rerender === "function") rerender();
    });
  });
  return panel;
}

function noriaTlNormPath(path) {
  return String(path || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
}

async function noriaTlLoadText(path) {
  const p = noriaTlNormPath(path);
  if (!p) return "";
  try {
    const txt = await ctx.io.load(p);
    if (txt) return String(txt);
  } catch (_) {}
  try {
    return String(await app.vault.adapter.read(p) || "");
  } catch (_) {
    return "";
  }
}

function noriaTlAttachDomHelpers(el) {
  if (!el) return el;
  if (typeof el.addClass !== "function") {
    el.addClass = function (...names) {
      names.filter(Boolean).forEach((n) => this.classList?.add?.(n));
      return this;
    };
  }
  if (typeof el.setAttr !== "function") {
    el.setAttr = function (name, value) {
      this.setAttribute?.(name, String(value));
      return this;
    };
  }
  if (typeof el.empty !== "function") {
    el.empty = function () {
      this.innerHTML = "";
      return this;
    };
  }
  if (typeof el.createEl !== "function") {
    el.createEl = function (tag, attrs = {}) {
      const child = document.createElement(tag);
      if (attrs?.text != null) child.textContent = String(attrs.text);
      if (attrs?.cls) child.className = String(attrs.cls);
      if (attrs?.attr && typeof attrs.attr === "object") {
        Object.entries(attrs.attr).forEach(([k, v]) => child.setAttribute(k, String(v)));
      }
      this.appendChild(child);
      return noriaTlAttachDomHelpers(child);
    };
  }
  if (typeof el.createDiv !== "function") {
    el.createDiv = function (attrs = {}) {
      return this.createEl("div", attrs);
    };
  }
  if (typeof el.createSpan !== "function") {
    el.createSpan = function (attrs = {}) {
      return this.createEl("span", attrs);
    };
  }
  return el;
}

async function noriaTlRunCustomViewByPath(viewPath, viewInput) {
  const normalized = noriaTlNormPath(viewPath).replace(/\/+$/, "");
  if (!normalized) throw new Error("empty custom view path");
  const candidates = normalized.toLowerCase().endsWith(".js")
    ? [normalized]
    : [`${normalized}.js`, `${normalized}/view.js`];
  let sourceCode = "";
  for (const candidate of candidates) {
    sourceCode = await noriaTlLoadText(candidate);
    if (sourceCode) break;
  }
  if (!sourceCode) throw new Error(`自定义视图加载失败：${normalized}`);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const run = new AsyncFunction("ctx", "input", "app", "moment", "window", "document", "globalThis", String(sourceCode));
  await run(ctx, viewInput || {}, app, moment, window, document, globalThis);
}

function noriaTlSetIcon(el, iconId, fallback) {
  if (!el) return;
  try {
    if (typeof setIcon === "function") {
      setIcon(el, iconId);
      return;
    }
  } catch (_) {}
  try {
    const api = globalThis?.obsidian || window?.obsidian || ((typeof window?.require === "function") ? window.require("obsidian") : null);
    if (api && typeof api.setIcon === "function") {
      api.setIcon(el, iconId);
      return;
    }
  } catch (_) {}
  if (typeof el.setText === "function") el.setText(fallback || "");
  else el.textContent = fallback || "";
}

async function render() {
  const styleId = "noria-tasks-timeline-style-v24";
  if (!document.getElementById(styleId)) {
    const st = document.createElement("style");
    st.id = styleId;
    st.textContent = `
.noria-tl-root{--noria-tl-time-col-width:34px;--noria-tl-axis-col-width:10px;--noria-tl-time-col-inset:0px;--noria-tl-time-to-axis-gap:-2px;--noria-tl-axis-to-card-gap:2px;--noria-tl-axis-line-offset:0px;--noria-tl-card-radius:10px;--noria-tl-line-width:1.5px;--noria-tl-line-alpha:.32;--noria-tl-line-top-offset:1px;--noria-tl-line-bottom-scale:.8;display:flex;flex-direction:column;gap:4px;min-height:120px;padding:0 0 8px;box-sizing:border-box}
.noria-tl-shell{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:start;min-height:0;flex:1 1 auto}
.noria-tl-main{min-width:0;min-height:0;display:flex;flex-direction:column}
.noria-tl-side{width:min(380px,42vw);max-width:100%;min-width:0;display:none}
.noria-tl-side[data-open="1"]{display:block}
.noria-tl-chrome-panel{border:none;background:transparent;padding:0;margin:0;box-shadow:none}
.noria-tl-toolbar{display:flex;flex-direction:row;flex-wrap:nowrap;align-items:center;gap:0;margin:0;padding:0 0 4px;border-bottom:none;box-sizing:border-box;width:100%}
.noria-tl-toolbar-lead{flex:1 1 0;min-width:0;display:flex;justify-content:flex-start;align-items:center}
.noria-tl-toolbar-center{flex:0 0 auto;display:inline-flex;flex-direction:row;align-items:center;justify-content:center;gap:3px;padding:0 6px}
.noria-tl-toolbar-trail{flex:1 1 0;min-width:0;display:flex;justify-content:flex-end;align-items:center}
.noria-tl-toolbar .noria-tl-toolbar-add,.noria-tl-toolbar .noria-tl-toolbar-icon-btn{margin:0;padding:0;border:none;background:transparent;color:var(--text-muted);opacity:.52;border-radius:8px;cursor:pointer;width:28px;height:28px;min-width:28px;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;flex-shrink:0;transition:opacity .12s ease,color .12s ease,background .12s ease}
.noria-tl-toolbar .noria-tl-toolbar-add:hover,.noria-tl-toolbar .noria-tl-toolbar-icon-btn:hover{opacity:1;color:var(--text-normal);background:color-mix(in srgb,var(--interactive-accent) 8%,transparent)}
.noria-tl-toolbar .noria-tl-toolbar-add svg,.noria-tl-toolbar .noria-tl-toolbar-icon-btn svg{width:16px;height:16px;stroke-width:2px}
.noria-tl-toolbar .noria-tl-toolbar-link{margin:0;border:none;background:transparent;color:color-mix(in srgb,var(--text-normal) 82%,var(--text-muted));font-size:12.5px;font-weight:520;letter-spacing:0;padding:4px 10px;border-radius:var(--clickable-icon-radius,var(--radius-s,4px));cursor:pointer;line-height:1.25;box-shadow:none;-webkit-font-smoothing:antialiased;transition:background .14s ease,color .14s ease,box-shadow .14s ease}
.noria-tl-toolbar .noria-tl-toolbar-link--diary-inbox{color:color-mix(in srgb,var(--text-normal) 70%,var(--text-muted));opacity:.66;background:transparent;border-color:transparent;box-shadow:none}
.noria-tl-toolbar .noria-tl-toolbar-link--diary-inbox:hover{opacity:1;color:var(--interactive-accent);background:var(--background-modifier-hover)}
.noria-tl-toolbar .noria-tl-toolbar-link--timer-attach{cursor:grab;color:color-mix(in srgb,var(--text-normal) 76%,var(--text-muted));background:transparent;box-shadow:none;border:none}
.noria-tl-toolbar .noria-tl-toolbar-link--timer-attach.is-dragging{cursor:grabbing;color:var(--interactive-accent);background:color-mix(in srgb,var(--interactive-accent) 8%,transparent);box-shadow:none}
.noria-tl-toolbar .noria-tl-toolbar-link:hover{color:var(--text-normal);background:var(--background-modifier-hover)}
.noria-tl-toolbar .noria-tl-toolbar-link:active{background:var(--background-modifier-hover)}
.noria-tl-root.noria-tl-today-focus .noria-tl-toolbar .noria-tl-btn-today{background:var(--background-modifier-hover);color:var(--interactive-accent);font-weight:580;box-shadow:none}
.noria-tl-toolbar .noria-tl-toolbar-icon-btn.noria-tl-toolbar-link--on,.noria-tl-toolbar .noria-tl-toolbar-link.noria-tl-toolbar-link--on{opacity:1;color:var(--interactive-accent);background:color-mix(in srgb,var(--interactive-accent) 8%,transparent);box-shadow:none}
.noria-tl-counter-row{display:flex;flex-direction:row;flex-wrap:nowrap;align-items:stretch;gap:5px;justify-content:space-between;margin:7px 0 6px;padding:0;width:100%;box-sizing:border-box}
.noria-tl-counter-card{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;min-height:44px;max-height:50px;margin:0;padding:6px 5px 7px;border-radius:8px;border:1px solid color-mix(in srgb,var(--background-modifier-border) 34%,transparent);background:transparent;background-image:none;-webkit-appearance:none;appearance:none;cursor:pointer;font:inherit;color:inherit;text-align:center;transition:background .12s ease,color .12s ease;box-shadow:none;outline:0;filter:none;box-sizing:border-box;overflow:hidden}
.noria-tl-counter-card[data-counter="todo"]{background:transparent}
.noria-tl-counter-card[data-counter="overdue"]{background:transparent}
.noria-tl-counter-card[data-counter="unplanned"]{background:transparent}
.noria-tl-counter-card:hover{background:color-mix(in srgb,var(--interactive-accent) 3%,transparent)}
.noria-tl-counter-card[data-active="1"]{background:color-mix(in srgb,var(--interactive-accent) 5%,transparent);color:var(--text-normal)}
.noria-tl-counter-card:focus,.noria-tl-counter-card:focus-visible{outline:0;box-shadow:none}
.noria-tl-counter-card[data-active="1"] .noria-tl-counter-num{font-weight:680}
.noria-tl-counter-card[data-active="1"] .noria-tl-counter-label{color:var(--text-normal);opacity:.82}
.noria-tl-counter-num{font-size:17px;font-weight:620;font-variant-numeric:tabular-nums;line-height:1.15;color:var(--text-normal);flex-shrink:0}
.noria-tl-counter-label{font-size:11.2px;font-weight:610;color:var(--text-muted);margin-top:1px;letter-spacing:0;text-transform:none;opacity:.9;line-height:1.2;text-align:center;max-width:100%;padding:0 2px 1px;box-sizing:border-box;word-break:break-word}
.noria-tl-scroll{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;border-radius:0;border:none;background:transparent;box-shadow:none;box-sizing:border-box;padding:0}
.theme-dark .noria-tl-scroll{background:transparent}
.noria-tl-unplanned{margin:0;padding:10px 0 12px;border-bottom:none;background:transparent}
.noria-tl-unplanned h3{margin:0 0 8px;font-size:11px;font-weight:650;color:var(--text-muted);letter-spacing:0;text-transform:none;padding-left:2px}
.noria-tl-day{border-bottom:none;padding:10px 0 12px;margin:0;box-sizing:border-box;width:100%;background:transparent}
.noria-tl-day[data-today="1"]{background:transparent}
.noria-tl-dayHead{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin:0 0 9px;padding:0 2px;border-bottom:none}
.noria-tl-dayHead-main{display:flex;align-items:flex-start;gap:10px;min-width:0}
.noria-tl-dayNum{font-size:24px;line-height:1;font-weight:720;color:color-mix(in srgb,var(--text-normal) 90%,var(--interactive-accent));min-width:1.8em;text-align:center;letter-spacing:0}
.noria-tl-dayMeta{display:flex;flex-direction:column;gap:2px;min-width:0;padding-top:2px}
.noria-tl-dayMonthTag{font-size:10.5px;line-height:1.2;color:color-mix(in srgb,var(--interactive-accent) 74%,var(--text-muted));font-weight:620;white-space:nowrap}
.noria-tl-dayWeekTag{font-size:12px;line-height:1.25;color:var(--text-normal);font-weight:560;white-space:nowrap}
.noria-tl-dayCountTag{font-size:11px;line-height:1.3;font-weight:620;color:var(--text-muted);padding:3px 8px;border-radius:999px;background:color-mix(in srgb,var(--background-secondary) 76%,var(--background-primary));border:1px solid color-mix(in srgb,var(--background-modifier-border) 76%,transparent)}
.noria-tl-timeline{list-style:none;margin:0;padding:0;border-left:none;position:relative}
.noria-tl-timeline .noria-tl-empty-li{margin:0;padding:4px 0 8px 2px;color:var(--text-muted);font-size:12px;list-style:none}
.noria-tl-task{display:grid;grid-template-columns:var(--noria-tl-time-col-width,30px) var(--noria-tl-axis-col-width,14px) minmax(0,1fr);gap:0;align-items:flex-start;margin:0;padding:0 0 var(--noria-tl-task-gap-y,8px) 0;font-size:13px;line-height:1.4;position:relative;z-index:1;transition:transform var(--noria-tl-layout-transition-ms,120ms) ease}
.noria-tl-task.noria-tl-task-done-local{opacity:0;transform:translateX(-4px);transition:opacity .14s ease,transform .14s ease}
.noria-tl-col-time{display:flex;flex-direction:column;align-items:var(--noria-tl-time-align-items,flex-start);text-align:var(--noria-tl-time-col-align,left);justify-content:flex-start;gap:var(--noria-tl-two-line-gap,2px);width:var(--noria-tl-time-col-width,34px);min-width:var(--noria-tl-time-col-width,34px);max-width:var(--noria-tl-time-col-width,34px);box-sizing:border-box;padding-top:1px;padding-right:2px;margin-left:var(--noria-tl-time-col-inset,0px);margin-right:var(--noria-tl-time-to-axis-gap,0px);overflow:visible}
.noria-tl-col-time.is-empty{opacity:var(--noria-tl-empty-time-opacity,.25)}
.noria-tl-time-main{font-size:var(--noria-tl-time-font-size,11px);font-weight:var(--noria-tl-time-main-weight,640);line-height:1.2;color:var(--text-normal);font-variant-numeric:tabular-nums;white-space:nowrap}
.noria-tl-time-main.noria-tl-time-preview{color:var(--interactive-accent);text-shadow:0 0 .01px currentColor}
.noria-tl-time-minor{font-size:var(--noria-tl-secondary-font-size,10px);line-height:1.2;color:var(--text-muted);font-variant-numeric:tabular-nums;white-space:nowrap;opacity:var(--noria-tl-time-minor-opacity,.78)}
.noria-tl-time-minor.is-empty{opacity:.55}
.noria-tl-col-axis{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:3px;position:relative;z-index:2;min-height:100%;margin-right:var(--noria-tl-axis-to-card-gap,0px)}
.noria-tl-col-axis::after{content:"";position:absolute;left:calc(50% + var(--noria-tl-axis-line-offset,0px));transform:translateX(-50%);top:calc((var(--noria-tl-node-size,14px) / 2) + var(--noria-tl-line-top-offset,2px));bottom:calc(var(--noria-tl-task-gap-y,8px) * -1 * var(--noria-tl-line-bottom-scale,.8));width:var(--noria-tl-line-width,2px);background:color-mix(in srgb,var(--background-modifier-border) calc(var(--noria-tl-line-alpha,.32) * 100%),transparent);border-radius:999px;z-index:1;pointer-events:none}
.noria-tl-timeline .noria-tl-task:last-child .noria-tl-col-axis::after{display:none}
.noria-tl-check{flex:0 0 auto;width:var(--noria-tl-node-size,8px);height:var(--noria-tl-node-size,8px);min-width:var(--noria-tl-node-size,8px);min-height:var(--noria-tl-node-size,8px);margin:3px 0 0;padding:0;border-radius:50%;border:var(--noria-tl-node-border-width,0px) solid transparent;background:color-mix(in srgb,var(--text-muted) 52%,transparent);cursor:pointer;box-sizing:border-box;align-self:center;transition:background .12s ease,box-shadow .12s ease,transform .12s ease;position:relative;z-index:3;box-shadow:0 0 0 1px color-mix(in srgb,var(--background-primary) 82%,transparent)}
.noria-tl-check:hover:not(:disabled){background:color-mix(in srgb,var(--interactive-accent) 72%,var(--text-muted));transform:scale(1.18);box-shadow:0 0 0 3px color-mix(in srgb,var(--interactive-accent) 16%,transparent)}
.noria-tl-check-overdue{border-color:transparent;background:var(--noria-status-overdue-rail,#dc2626)}
.noria-tl-check-unplanned{border-color:transparent;background:color-mix(in srgb,var(--text-muted) 44%,transparent)}
.noria-tl-check-done{border-color:transparent;background:#22c55e;position:relative;box-shadow:0 0 0 2px color-mix(in srgb,#22c55e 18%,transparent)}
.noria-tl-check-done::after{display:none}
.theme-dark .noria-tl-check-done{background:#22c55e}
.noria-tl-check-locked{opacity:.42;cursor:not-allowed;border-style:dashed}
.noria-tl-check:focus-visible{outline:2px solid color-mix(in srgb,var(--interactive-accent) 45%,transparent);outline-offset:2px}
.noria-tl-node.is-dragging{transform:scale(1.03);box-shadow:0 0 0 2px color-mix(in srgb,var(--interactive-accent) 22%,transparent)}
.noria-tl-duration-label{margin-top:var(--noria-tl-duration-gap,3px);font-size:var(--noria-tl-duration-font-size,9.5px);line-height:1.15;color:var(--text-muted);font-variant-numeric:tabular-nums;white-space:nowrap;cursor:ns-resize;user-select:none;transform:translateX(var(--noria-tl-duration-shift-x,-6px))}
.noria-tl-duration-label.is-empty{opacity:0}
.noria-tl-duration-label:hover{color:var(--interactive-accent)}
.noria-tl-duration-label:focus-visible{outline:2px solid color-mix(in srgb,var(--interactive-accent) 36%,transparent);outline-offset:2px;border-radius:6px}
.noria-tl-duration-label.is-dragging{color:var(--interactive-accent);text-shadow:0 0 .01px currentColor}
.noria-tl-now-marker{display:grid;grid-template-columns:var(--noria-tl-time-col-width,34px) var(--noria-tl-axis-col-width,10px) minmax(0,1fr);gap:0;align-items:center;margin:-1px 0 6px;padding:0;min-height:16px;pointer-events:none;position:relative;z-index:2}
.noria-tl-now-time{font-size:10px;font-weight:650;line-height:1;color:var(--interactive-accent);font-variant-numeric:tabular-nums;text-align:left;margin-left:var(--noria-tl-time-col-inset,0px);margin-right:var(--noria-tl-time-to-axis-gap,-2px);white-space:nowrap}
.noria-tl-now-axis{position:relative;height:16px;margin-right:var(--noria-tl-axis-to-card-gap,2px)}
.noria-tl-now-pin{position:absolute;left:calc(50% + var(--noria-tl-axis-line-offset,0px));top:50%;width:8px;height:8px;border-radius:50%;background:var(--interactive-accent);transform:translate(-50%,-50%);box-shadow:0 0 0 2px color-mix(in srgb,var(--interactive-accent) 12%,transparent);z-index:4}
.noria-tl-now-hand{height:16px;display:flex;align-items:center;min-width:0;margin-left:calc(var(--noria-tl-axis-line-offset,0px) - 5px)}
.noria-tl-now-line{height:1.5px;width:min(46px,42%);border-radius:999px;background:linear-gradient(90deg,var(--interactive-accent),color-mix(in srgb,var(--interactive-accent) 0%,transparent))}
.noria-tl-task-track{min-width:0;border-left:none;padding:1px 0 2px 0;position:relative;z-index:1}
.noria-tl-task.noria-tl-timer-drop-hover .noria-tl-col-card{box-shadow:0 0 0 1px color-mix(in srgb,#ef4444 28%,transparent) inset}
.noria-tl-task.noria-tl-timer-drop-hover .noria-tl-col-card::after{content:"";position:absolute;top:3px;right:3px;bottom:3px;width:48%;border-radius:calc(var(--noria-tl-card-radius,10px) - 3px);background:color-mix(in srgb,#ef4444 8%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,#ef4444 18%,transparent);pointer-events:none}
.noria-tl-col-card{border:1px solid rgb(148 163 184 / var(--noria-tl-card-border-alpha,0.58));background:color-mix(in srgb,var(--background-primary) 92%,var(--background-secondary));border-radius:var(--noria-tl-card-radius,10px);padding:var(--noria-tl-card-pad-y,6px) var(--noria-tl-card-pad-x,8px);box-shadow:0 var(--noria-tl-card-shadow-y,1px) var(--noria-tl-card-shadow-blur,2px) rgb(15 23 42 / var(--noria-tl-card-shadow-alpha,0.08));position:relative;overflow:visible}
.noria-tl-col-card.noria-tl-has-pomodoro{padding-right:max(56px,var(--noria-tl-card-pad-x,8px))}
.noria-tl-pomodoro-dock{position:absolute;right:7px;top:50%;transform:translateY(-50%);display:flex;flex-direction:row;align-items:center;gap:5px;z-index:5;cursor:grab;max-width:min(48%,132px)}
.noria-tl-pomodoro-dock.is-dragging{cursor:grabbing;opacity:.72}
.noria-tl-pomodoro-btn{position:relative;width:27px;height:27px;min-width:27px;min-height:27px;display:inline-flex;align-items:center;justify-content:center;padding:0;border-radius:999px;border:1px solid color-mix(in srgb,#ef4444 18%,transparent);background:color-mix(in srgb,#ef4444 8%,var(--background-primary));font-size:18px;line-height:1;box-shadow:0 1px 4px rgb(127 29 29 / .12);cursor:pointer}
.noria-tl-pomodoro-dock.is-running .noria-tl-pomodoro-btn{background:color-mix(in srgb,#ef4444 14%,var(--background-primary));box-shadow:0 0 0 3px color-mix(in srgb,#ef4444 14%,transparent),0 2px 8px rgb(127 29 29 / .18)}
.noria-tl-pomodoro-dock.is-paused .noria-tl-pomodoro-btn{filter:saturate(.82);opacity:.9}
.noria-tl-pomodoro-dock.is-break .noria-tl-pomodoro-btn{background:color-mix(in srgb,#22c55e 12%,var(--background-primary));border-color:color-mix(in srgb,#22c55e 20%,transparent)}
.noria-tl-pomodoro-stats{order:-1;display:flex;flex-direction:column;align-items:flex-end;justify-content:center;gap:1px;min-width:0;max-width:78px;pointer-events:none}
.noria-tl-pomodoro-stats.is-empty{display:none}
.noria-tl-pomodoro-min{font-size:10.5px;font-weight:720;line-height:1.1;color:color-mix(in srgb,#dc2626 82%,var(--text-normal));font-variant-numeric:tabular-nums;white-space:nowrap}
.noria-tl-pomodoro-range{display:none;font-size:8.8px;font-weight:560;line-height:1.1;color:var(--text-muted);font-variant-numeric:tabular-nums;white-space:nowrap;max-width:78px;overflow:hidden;text-overflow:ellipsis}
.noria-tl-pomodoro-dock:hover .noria-tl-pomodoro-range,.noria-tl-pomodoro-dock:focus-within .noria-tl-pomodoro-range{display:inline}
.noria-tl-pomodoro-controls{position:absolute;right:12px;top:-20px;display:flex;align-items:center;gap:4px;opacity:0;transform:translateY(3px);pointer-events:none;transition:opacity .12s ease,transform .12s ease}
.noria-tl-pomodoro-dock:hover .noria-tl-pomodoro-controls,.noria-tl-pomodoro-dock:focus-within .noria-tl-pomodoro-controls{opacity:1;transform:translateY(0);pointer-events:auto}
.noria-tl-pomodoro-action{width:17px;height:17px;min-width:17px;min-height:17px;display:inline-flex;align-items:center;justify-content:center;padding:0;border-radius:999px;border:1px solid color-mix(in srgb,var(--background-modifier-border) 82%,transparent);background:var(--background-primary);color:var(--text-muted);font-size:9.5px;line-height:1;cursor:pointer;box-shadow:0 1px 3px rgb(15 23 42 / .08)}
.noria-tl-pomodoro-action:hover{color:var(--text-normal);background:color-mix(in srgb,#ef4444 7%,var(--background-primary))}
.noria-tl-pomodoro-close{position:absolute;top:-7px;right:-7px;width:16px;height:16px;min-width:16px;min-height:16px;display:inline-flex;align-items:center;justify-content:center;padding:0;border-radius:999px;border:1px solid color-mix(in srgb,var(--background-modifier-border) 82%,transparent);background:var(--background-primary);color:var(--text-muted);font-size:11px;line-height:1;opacity:0;transform:scale(.88);cursor:pointer;transition:opacity .12s ease,transform .12s ease,color .12s ease,background .12s ease}
.noria-tl-pomodoro-dock:hover .noria-tl-pomodoro-close,.noria-tl-pomodoro-dock:focus-within .noria-tl-pomodoro-close{opacity:1;transform:scale(1)}
.noria-tl-pomodoro-close:hover{color:#dc2626;background:color-mix(in srgb,#ef4444 8%,var(--background-primary))}
.noria-tl-task-body{display:flex;flex-direction:column;gap:2px;min-width:0}
.noria-tl-task-title{font-weight:540;color:var(--text-normal);word-break:break-word;line-height:1.45;font-size:var(--noria-tl-title-font-size,13px)}
.noria-tl-task-title-main{display:flex;flex-direction:row;flex-wrap:nowrap;align-items:flex-start;justify-content:space-between;gap:var(--noria-tl-title-gap,10px);width:100%;box-sizing:border-box}
.noria-tl-task-title-start{min-width:0;flex:1 1 auto;overflow:hidden}
.noria-tl-task-title-start .noria-tl-task-title-link,.noria-tl-task-title-start .noria-tl-task-title-plain{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:var(--noria-tl-title-clamp,2);overflow:hidden;word-break:break-word;white-space:normal}
.noria-tl-task-title-link,.noria-tl-task-title-plain{color:var(--text-normal);font-weight:inherit}
.noria-tl-task-title-link{font-weight:540}
.noria-tl-task-title-link:hover{color:var(--text-accent)}
.noria-tl-title-hint{flex:0 0 auto;font-size:9px;font-weight:500;font-variant-numeric:tabular-nums;line-height:1.35;white-space:nowrap;max-width:42%;text-align:right;margin-top:1px}
.noria-tl-title-hint.noria-tl-hint-overdue{color:var(--text-normal);opacity:.88}
.theme-dark .noria-tl-title-hint.noria-tl-hint-overdue{opacity:.9}
.noria-tl-title-hint.noria-tl-hint-future{color:var(--text-normal);opacity:.4}
.theme-dark .noria-tl-title-hint.noria-tl-hint-future{opacity:.46}
.noria-tl-task-meta-row{display:flex;flex-wrap:wrap;align-items:center;gap:5px 8px;margin-top:5px;padding-top:1px;min-width:0;opacity:var(--noria-tl-meta-opacity,.92)}
.noria-tl-meta-note{display:inline-flex;align-items:center;gap:4px;min-width:0;max-width:100%}
.noria-tl-note-icon{display:flex;align-items:center;justify-content:center;flex-shrink:0;width:14px;height:14px;color:var(--text-muted)}
.noria-tl-note-icon svg{width:13px;height:13px}
.noria-tl-meta-note-link{color:var(--text-muted);font-size:10.5px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:min(100%,220px)}
.noria-tl-meta-note-link:hover{color:var(--text-accent)}
.noria-tl-tag-chip{display:inline-flex;align-items:center;padding:1px 7px;border-radius:999px;border:1px solid color-mix(in srgb,var(--background-modifier-border) 80%,transparent);font-size:10px;color:var(--text-muted);background:color-mix(in srgb,var(--background-secondary) 70%,var(--background-primary))}
.noria-tl-lab-panel{position:sticky;top:0;margin:0;padding:12px 12px 14px;border-radius:16px;border:1px solid color-mix(in srgb,var(--background-modifier-border) 72%,transparent);background:color-mix(in srgb,var(--background-primary) 96%,var(--background-secondary));max-height:calc(100vh - 28px);overflow:auto;box-sizing:border-box}
.noria-tl-lab-panel[hidden]{display:none}
.noria-tl-lab-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:2px}
.noria-tl-lab-heading{font-size:13px;font-weight:700;color:var(--text-normal)}
.noria-tl-lab-scope{margin:2px 0 10px;font-size:11px;color:var(--text-muted)}
.noria-tl-lab-close{border:1px solid color-mix(in srgb,var(--background-modifier-border) 78%,transparent);background:color-mix(in srgb,var(--background-secondary) 72%,var(--background-primary));color:var(--text-muted);border-radius:999px;padding:4px 10px;font-size:11px;cursor:pointer}
.noria-tl-lab-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}
.noria-tl-lab-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 8px;align-items:center}
.noria-tl-lab-row input[type="range"]{grid-column:1/-1;width:100%;margin:0}
.noria-tl-lab-row-label{font-size:11.5px;color:var(--text-normal)}
.noria-tl-lab-row-value{font-size:11px;color:var(--text-muted);font-variant-numeric:tabular-nums}
.noria-tl-lab-actions{display:flex;gap:8px;margin-top:2px}
.noria-tl-lab-btn{border:1px solid color-mix(in srgb,var(--background-modifier-border) 78%,transparent);background:color-mix(in srgb,var(--background-secondary) 72%,var(--background-primary));color:var(--text-normal);border-radius:999px;padding:5px 10px;font-size:11px;cursor:pointer}
@media (max-width: 520px){
  .noria-tl-shell{grid-template-columns:minmax(0,1fr)}
  .noria-tl-side[data-open="1"]{display:block;width:100%}
  .noria-tl-task{grid-template-columns:var(--noria-tl-time-col-width,34px) var(--noria-tl-axis-col-width,10px) minmax(0,1fr)}
  .noria-tl-now-marker{grid-template-columns:var(--noria-tl-time-col-width,34px) var(--noria-tl-axis-col-width,10px) minmax(0,1fr)}
  .noria-tl-dayNum{font-size:21px;min-width:1.65em}
  .noria-tl-dayHead{gap:8px}
  .noria-tl-col-card{padding:6px 7px}
  .noria-tl-col-card.noria-tl-has-pomodoro{padding-right:42px}
  .noria-tl-pomodoro-dock{right:6px;max-width:38px}
  .noria-tl-pomodoro-stats{max-width:28px}
  .noria-tl-pomodoro-range{display:none}
  .noria-tl-pomodoro-min{font-size:9.8px}
}
.noria-tl-root.noria-tl-today-focus .noria-tl-day:not([data-today="1"]){display:none}
.noria-tl-root.noria-tl-today-focus .noria-tl-unplanned{display:none}
.noria-tl-unplanned.noria-tl-unplanned-empty{display:none}
.noria-tl-root:not(.noria-tl-counter-highlight)[data-noria-tl-filter="todo"] .noria-tl-task[data-todo-dated="0"],
.noria-tl-root:not(.noria-tl-counter-highlight)[data-noria-tl-filter="overdue"] .noria-tl-task[data-overdue="0"],
.noria-tl-root:not(.noria-tl-counter-highlight)[data-noria-tl-filter="unplanned"] .noria-tl-scroll .noria-tl-day{display:none}
.noria-tl-root:not(.noria-tl-counter-highlight)[data-noria-tl-filter="unplanned"] .noria-tl-unplanned{display:block}
.noria-tl-root:not(.noria-tl-counter-highlight)[data-noria-tl-filter="unplanned"] .noria-tl-scroll{border-top:none}
.noria-tl-root:not(.noria-tl-counter-highlight)[data-noria-tl-filter="todo"] .noria-tl-unplanned,
.noria-tl-root:not(.noria-tl-counter-highlight)[data-noria-tl-filter="overdue"] .noria-tl-unplanned{display:none}
.noria-tl-root:not(.noria-tl-counter-highlight)[data-noria-tl-filter="todo"] .noria-tl-day:not([data-noria-has-todo-dated="1"]),
.noria-tl-root:not(.noria-tl-counter-highlight)[data-noria-tl-filter="overdue"] .noria-tl-day:not([data-noria-has-overdue="1"]){display:none}
.noria-tl-root.noria-tl-counter-highlight[data-noria-tl-filter="todo"] .noria-tl-unplanned,
.noria-tl-root.noria-tl-counter-highlight[data-noria-tl-filter="overdue"] .noria-tl-unplanned{display:none}
.noria-tl-root.noria-tl-counter-highlight[data-noria-tl-filter="todo"] .noria-tl-task[data-todo-dated="0"]{opacity:.28}
.noria-tl-root.noria-tl-counter-highlight[data-noria-tl-filter="overdue"] .noria-tl-task[data-overdue="0"]{opacity:.28}
.noria-tl-root.noria-tl-counter-highlight[data-noria-tl-filter="unplanned"] .noria-tl-scroll .noria-tl-day{opacity:.35}
.noria-tl-chrome-panel.noria-tl-chrome-panel--external-toolbar-only{padding-top:0}
.noria-tl-chrome-panel.noria-tl-chrome-panel--external-toolbar-only .noria-tl-counter-row{padding-top:0}
`;
    document.head.appendChild(st);
  }

  const freshTasks = await noriaTlCollectFreshTasksForCalendar(resolvedPages);
  const tasks = freshTasks.length ? freshTasks : collectTasksForCalendar(resolvedPages);
  try { noriaTlRenderedTaskByAttachKey.clear(); } catch (_) {}
  noriaTlScheduleLegacyPomodoroMigration(tasks);
  const tlCfg = (noriaTlReadPlannerLabControls().timeline || {});
  const { todayYmd, keys, todayM } = buildDateRange();
  const byDay = {};
  const overdueList = [];
  for (let i = 0; i < tasks.length; i++) {
    const tk = tasks[i];
    if (!taskIncomplete(tk)) continue;
    const ymd = primaryYmdForTask(tk);
    if (!ymd) continue;
    if (m(ymd, "YYYY-MM-DD", true).isBefore(todayM, "day")) {
      overdueList.push(tk);
      continue;
    }
    if (!byDay[ymd]) byDay[ymd] = [];
    byDay[ymd].push(tk);
  }
  overdueList.sort((a, b) => primaryYmdForTask(a).localeCompare(primaryYmdForTask(b)));
  Object.keys(byDay).forEach((k) => {
    if (byDay[k] && byDay[k].length > 1) {
      byDay[k].sort((a, b) => noriaTlCompareTasksForDay(a, b, k));
    }
  });

  let displayKeys = keys.filter((k) => {
    const hasNormal = byDay[k] && byDay[k].length > 0;
    const hasOverdueToday = k === todayYmd && overdueList.length > 0;
    const hasBucket = hasNormal || hasOverdueToday;
    if (filterEmpty && !hasBucket) return false;
    return true;
  });
  if (displayKeys.length === 0 && !filterEmpty) {
    displayKeys = keys;
  }

  let overdueCount = 0;
  let todoDatedCount = 0;
  let unplanned = 0;
  const t0 = m(todayYmd, "YYYY-MM-DD", true);
  const unplannedList = [];
  for (let i = 0; i < tasks.length; i++) {
    const tk = tasks[i];
    if (!taskIncomplete(tk)) continue;
    const ymd = primaryYmdForTask(tk);
    if (!ymd) {
      unplanned++;
      unplannedList.push(tk);
    } else if (t0.isValid() && m(ymd, "YYYY-MM-DD", true).isBefore(t0, "day")) {
      overdueCount++;
    } else {
      todoDatedCount++;
    }
  }
  if (unplannedList.length > 1) {
    unplannedList.sort((a, b) => noriaTlCompareTasksForDay(a, b, todayYmd));
  }

  const root = ctx.el("div", "", { cls: "noria-tl-root" });
  const rerender = () => {
    try {
      void noriaTlRefreshFromFreshSource();
    } catch (_) {}
  };
  noriaTlApplyPlannerLabVars(root);
  root.setAttribute("data-noria-tl-filter", "none");
  if (!useFilterCounters) {
    root.classList.add("noria-tl-counter-highlight");
  }
  if (todayFocusState) {
    root.classList.add("noria-tl-today-focus");
  }

  const chromePanelCls = hideTimelineTopToolbar
    ? "noria-tl-chrome-panel noria-tl-chrome-panel--external-toolbar-only"
    : "noria-tl-chrome-panel";
  const shell = root.createDiv({ cls: "noria-tl-shell" });
  const mainCol = shell.createDiv({ cls: "noria-tl-main" });
  const sideCol = shell.createDiv({ cls: "noria-tl-side", attr: { "data-open": "0" } });
  const chromePanel = mainCol.createDiv({ cls: chromePanelCls });
  if (!hideTimelineTopToolbar) {
    const toolbar = chromePanel.createDiv({ cls: "noria-tl-toolbar" });
    toolbar.createDiv({ cls: "noria-tl-toolbar-lead" });
    const center = toolbar.createDiv({ cls: "noria-tl-toolbar-center" });
    const trail = toolbar.createDiv({ cls: "noria-tl-toolbar-trail" });
    const focusBtn = center.createEl("button", {
      cls: "noria-tl-btn-today noria-tl-toolbar-link",
      text: "Today",
      type: "button",
      attr: {
        title: "Today",
        "aria-label": noriaTlRuntimeT("runtime.timeline.onlyToday")
      }
    });
    focusBtn.addEventListener("click", () => {
      root.classList.toggle("noria-tl-today-focus");
      todayFocusState = root.classList.contains("noria-tl-today-focus");
      if (typeof requestToggleTodayFocus === "function") {
        try {
          requestToggleTodayFocus(todayFocusState);
        } catch (_) {}
      }
      rerender();
    });
    if (noriaTlIsPomodoroEnabled()) {
      const timerAttachBtn = center.createEl("button", {
        cls: "noria-tl-toolbar-icon-btn noria-tl-toolbar-link--timer-attach",
        type: "button",
        attr: {
          title: noriaTlRuntimeT("runtime.timeline.dragAttachPomodoro"),
          "aria-label": noriaTlRuntimeT("runtime.timeline.dragAttachPomodoro")
        }
      });
      timerAttachBtn.setText(NORIA_TL_POMODORO_EMOJI);
      timerAttachBtn.setAttribute("draggable", "true");
      timerAttachBtn.addEventListener("dragstart", (ev) => {
        try {
          if (ev && ev.dataTransfer) {
            ev.dataTransfer.effectAllowed = "copy";
            ev.dataTransfer.setData("text/plain", NORIA_TL_TIMER_ATTACH_TOKEN);
            ev.dataTransfer.setData(NORIA_TL_TIMER_ATTACH_MIME, "1");
          }
        } catch (_) {}
        timerAttachBtn.classList.add("is-dragging");
      });
      timerAttachBtn.addEventListener("dragend", () => {
        timerAttachBtn.classList.remove("is-dragging");
      });
    }
    const addBtn = trail.createEl("button", {
      cls: "noria-tl-toolbar-add",
      type: "button",
      attr: {
        title: noriaTlRuntimeT("runtime.timeline.addTodayTask"),
        "aria-label": noriaTlRuntimeT("runtime.timeline.addTodayTask")
      }
    });
    if (typeof setIcon === "function") {
      try {
        setIcon(addBtn, "plus");
      } catch (_) {
        addBtn.setText("+");
      }
    } else {
      addBtn.setText("+");
    }
    addBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      void noriaTlInvokeOpenTaskDateTimeEditor(null, {
        dateStr: todayYmd,
        startMin: 9 * 60,
        returnFocusEl: addBtn
      });
    });
  }

  let activeFilter = "none";
  const cardRow = chromePanel.createDiv({ cls: "noria-tl-counter-row" });
  const mkCard = (key, n, label) => {
    const b = cardRow.createEl("button", { cls: "noria-tl-counter-card", type: "button" });
    b.setAttribute("data-counter", key);
    b.createSpan({ cls: "noria-tl-counter-num", text: String(n) });
    b.createSpan({ cls: "noria-tl-counter-label", text: label });
    b.addEventListener("click", () => {
      activeFilter = activeFilter === key ? "none" : key;
      root.setAttribute("data-noria-tl-filter", activeFilter);
      cardRow.querySelectorAll(".noria-tl-counter-card").forEach((el) => {
        el.setAttribute("data-active", el.getAttribute("data-counter") === activeFilter && activeFilter !== "none" ? "1" : "0");
      });
    });
  };
  if (useCounters) {
    mkCard("todo", todoDatedCount, "Todo");
    mkCard("overdue", overdueCount, "Overdue");
    mkCard("unplanned", unplanned, "Unplanned");
  }

  const scroll = mainCol.createDiv({ cls: "noria-tl-scroll" });
  const todayNowMin = todayFocusState ? noriaTlNowMinutes() : null;

  const unplannedWrap = scroll.createDiv({ cls: "noria-tl-unplanned" });
  unplannedWrap.createEl("h3", { text: noriaTlRuntimeT("runtime.timeline.unplanned") });
  const upList = unplannedWrap.createEl("ul", { cls: "noria-tl-timeline" });
  if (unplannedList.length === 0) {
    unplannedWrap.classList.add("noria-tl-unplanned-empty");
  } else {
    for (let ui = 0; ui < unplannedList.length; ui++) {
      appendTaskLine(upList, unplannedList[ui], { todayM });
    }
  }

  for (let di = 0; di < displayKeys.length; di++) {
    const ymd = displayKeys[di];
    const dayEl = scroll.createDiv({
      cls: "noria-tl-day",
      attr: { "data-date": ymd, "data-today": ymd === todayYmd ? "1" : "0" }
    });
    const list = dayEl.createEl("ul", { cls: "noria-tl-timeline" });
    const arr = byDay[ymd] || [];
    noriaTlBindTodayBlankCreate(list, arr, ymd, todayYmd, root, tlCfg);
    let hasTodoDated = false;
    let hasOverdue = false;
    const overdueForToday = ymd === todayYmd ? overdueList : [];
    const dayMeta = noriaTlBuildDayHeadMeta(ymd, todayM, arr.length + overdueForToday.length);
    const head = dayEl.createDiv({ cls: "noria-tl-dayHead" });
    const headMain = head.createDiv({ cls: "noria-tl-dayHead-main" });
    headMain.createDiv({ cls: "noria-tl-dayNum", text: dayMeta.dayNum });
    const headMeta = headMain.createDiv({ cls: "noria-tl-dayMeta" });
    headMeta.createDiv({ cls: "noria-tl-dayMonthTag", text: dayMeta.monthTag });
    headMeta.createDiv({ cls: "noria-tl-dayWeekTag", text: dayMeta.weekTag });
    head.createDiv({ cls: "noria-tl-dayCountTag", text: dayMeta.countTag });
    if (overdueForToday.length > 0) {
      hasOverdue = true;
    }
    if (arr.length === 0 && overdueForToday.length === 0) {
      dayEl.classList.add("noria-tl-day-empty");
      if (tlCfg.showDayEmptyPlaceholder) {
        list.createEl("li", {
          cls: "noria-tl-empty-li",
          text: dayMeta.isToday ? noriaTlRuntimeT("runtime.timeline.emptyToday") : noriaTlRuntimeT("runtime.timeline.emptyDay")
        });
      }
    } else {
      const shouldShowNowMarker = todayFocusState && ymd === todayYmd && arr.length > 0;
      const nowInsertIndex = shouldShowNowMarker
        ? noriaTlPickNowMarkerIndex(arr.map((tk) => noriaTlReadTaskTimeMeta(tk, ymd)), todayNowMin)
        : -1;
      let nowMarkerInserted = false;
      for (let ti = 0; ti < arr.length; ti++) {
        if (!nowMarkerInserted && nowInsertIndex === ti) {
          noriaTlAppendNowMarker(list, todayNowMin);
          nowMarkerInserted = true;
        }
        const tk = arr[ti];
        const taskEl = appendTaskLine(list, tk, { todayM, dayYmd: ymd });
        if (taskEl) taskEl.setAttribute("data-day-task-index", String(ti));
        if (taskIncomplete(tk)) {
          const yp = primaryYmdForTask(tk);
          if (yp && !m(yp, "YYYY-MM-DD", true).isBefore(todayM, "day")) {
            hasTodoDated = true;
          }
        }
      }
      if (!nowMarkerInserted && nowInsertIndex === arr.length) {
        noriaTlAppendNowMarker(list, todayNowMin);
      }
      for (let oi = 0; oi < overdueForToday.length; oi++) {
        appendTaskLine(list, overdueForToday[oi], { todayM, dayYmd: ymd });
      }
    }
    dayEl.setAttribute("data-noria-has-todo-dated", hasTodoDated ? "1" : "0");
    dayEl.setAttribute("data-noria-has-overdue", hasOverdue ? "1" : "0");
  }

  if (displayKeys.length === 0) {
    scroll.createDiv({
      cls: "noria-tl-day",
      text: filterEmpty
        ? noriaTlRuntimeT("runtime.timeline.emptyFiltered")
        : noriaTlRuntimeT("runtime.timeline.emptyNoDates")
    });
  }

  noriaTlScheduleNowMarkerRefresh(rerender, todayFocusState);
  noriaTlSchedulePomodoroRefresh(rerender);
  return root;
}

if (typeof globalThis !== "undefined" && globalThis.__NORIA_TL_TEST__) {
  globalThis.__noriaTimelineTestHooks = {
    stripForDisplay,
    primaryYmdForTask,
    pickNowMarkerIndex: noriaTlPickNowMarkerIndex,
    inferBlankCreateStartMin: noriaTlInferBlankCreateStartMin,
    snapCreateMinute: noriaTlSnapCreateMinute,
    defaultPlannerLabControls: noriaTlDefaultPlannerLabControls,
    mergePlannerLabControls: noriaTlMergePlannerLabControls,
    normalizePomodoroState: noriaTlNormalizePomodoroState,
    buildTaskFingerprint: noriaTlBuildTaskFingerprint,
    stripPomodoroNoiseFromLine: noriaTlStripPomodoroNoiseFromLine,
    pomodoroMetaFromTask: noriaTlPomodoroMetaFromTask,
    resolvePomodoroTaskRecord: noriaTlResolvePomodoroTaskRecord,
    buildTaskPomodoroSummary: noriaTlBuildTaskPomodoroSummary,
    taskKeyForPomodoro: noriaTlTaskKeyForPomodoro,
    readPomodoroState: noriaTlReadPomodoroState,
    setLocalPomodoroState: noriaTlSetLocalPomodoroState,
    setSingleTimerAttachKey: noriaTlSetSingleTimerAttachKey,
    clearTimerAttachKey: noriaTlClearTimerAttachKey,
    clearTimerAttachKeys: noriaTlClearTimerAttachKeys,
    isTimerAttachedKey: noriaTlIsTimerAttachedKey,
    detachPomodoroState: noriaTlDetachPomodoroState,
    migrateLegacyPomodoroLine: noriaTlMigrateLegacyPomodoroLine,
    startPomodoroWork: noriaTlStartPomodoroWork,
    pausePomodoro: noriaTlPausePomodoro,
    resumePomodoro: noriaTlResumePomodoro,
    tickPomodoro: noriaTlTickPomodoro,
    transferPomodoroTask: noriaTlTransferPomodoroTask,
    completionCounterDelta: noriaTlCompletionCounterDelta,
    pickTaskLineIndex: noriaTlPickTaskLineIndex
  };
} else {
  noriaTlBindFreshTaskInvalidationEvent();
  void render();
}
