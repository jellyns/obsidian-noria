const bridge = input?.noriaBridge || globalThis.__noriaRuntimeBridge || {};
const api = bridge.calendar || {};
const mount = input?.mount || ctx.container;

function t(key, params = {}) {
  try {
    if (bridge && typeof bridge.t === "function") return bridge.t(key, params);
  } catch (_) {}
  const messages = bridge?.i18n?.messages || {};
  const fallback = bridge?.i18n?.fallback || {};
  let template = messages[key] || fallback[key] || key;
  return String(template).replace(/\{([^}]+)\}/g, (_, name) => params[name] == null ? "" : String(params[name]));
}

function empty(el) {
  if (el && typeof el.empty === "function") el.empty();
  else if (el) el.textContent = "";
}

function el(parent, tag, options = {}) {
  const node = parent.createEl ? parent.createEl(tag, options) : document.createElement(tag);
  if (!parent.createEl) {
    if (options.cls) node.className = options.cls;
    if (options.text != null) node.textContent = options.text;
    if (options.attr) Object.entries(options.attr).forEach(([k, v]) => node.setAttribute(k, String(v)));
    parent.appendChild(node);
  }
  return node;
}

function addClass(node, cls, yes) {
  try {
    node.classList.toggle(cls, !!yes);
  } catch (_) {}
}

function injectStyle() {
  const id = "noria-calendar-style";
  if (!document) return;
  let style = document.getElementById(id);
  const shouldAppend = !style;
  if (!style) {
    style = document.createElement("style");
    style.id = id;
  }
  style.textContent = `
.noria-calendar-root {
  --noria-calendar-today-bg: color-mix(in srgb, rgb(147 197 253) 34%, var(--background-primary));
  --noria-calendar-week-separator: color-mix(in srgb, var(--background-modifier-border) 64%, transparent);
  --noria-calendar-weekend: color-mix(in srgb, var(--background-modifier-hover) 46%, transparent);
  --noria-calendar-hover: color-mix(in srgb, var(--background-modifier-hover) 70%, transparent);
  --noria-calendar-hover-ring: color-mix(in srgb, var(--text-muted) 32%, transparent);
  --noria-calendar-selected: color-mix(in srgb, var(--background-modifier-hover) 54%, transparent);
  --noria-calendar-selected-ring: color-mix(in srgb, var(--text-muted) 28%, transparent);
  --noria-calendar-note-dot: color-mix(in srgb, var(--text-muted) 84%, var(--text-normal));
  --noria-calendar-task-dot: color-mix(in srgb, var(--text-muted) 68%, transparent);
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  width: 100%;
  padding: 6px 4px 8px 6px;
  box-sizing: border-box;
  color: var(--text-normal);
  font-family: var(--font-interface);
}
.noria-calendar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  padding: 0;
}
.noria-calendar-title {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  min-width: 0;
  font-size: 14px;
  font-weight: 650;
  line-height: 1;
}
.noria-calendar-root .noria-calendar-title button,
.noria-calendar-root .noria-calendar-nav button,
.noria-calendar-root button.noria-calendar-week-number,
.noria-calendar-root button.noria-calendar-day {
  appearance: none;
  -webkit-appearance: none;
  margin: 0;
  min-height: 0;
  border: 0;
  box-shadow: none;
  background: transparent;
  font-family: inherit;
}
.noria-calendar-title button {
  position: relative;
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 0 2px;
  box-sizing: border-box;
  color: var(--text-normal);
  font-weight: inherit;
  line-height: 1;
  cursor: pointer;
}
.noria-calendar-title button:hover {
  color: var(--text-normal);
}
.noria-calendar-title button.has-period-note::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 1px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text-muted) 72%, transparent);
  pointer-events: none;
}
.noria-calendar-title button.has-period-note:hover::after {
  background: color-mix(in srgb, var(--text-normal) 78%, transparent);
}
.noria-calendar-year {
  font-weight: 560;
}
.noria-calendar-nav {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
}
.noria-calendar-nav button {
  min-width: 18px;
  height: 22px;
  border-radius: 5px;
  padding: 0 3px;
  color: var(--text-muted);
  cursor: pointer;
  line-height: 1;
}
.noria-calendar-nav button:hover {
  background: transparent;
  color: var(--text-normal);
}
.noria-calendar-today {
  min-width: 30px;
  font-size: 12px;
  font-weight: 600;
}
.noria-calendar-grid {
  position: relative;
  display: grid;
  grid-template-columns: 24px repeat(7, minmax(0, 1fr));
  align-items: center;
  gap: 0;
  width: 100%;
  min-width: 0;
}
.noria-calendar-grid:not(.has-week-number) {
  grid-template-columns: repeat(7, minmax(0, 1fr));
}
.noria-calendar-grid.has-week-number::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 24px;
  width: 1px;
  background: var(--noria-calendar-week-separator);
  pointer-events: none;
}
.noria-calendar-weekday,
.noria-calendar-week-number {
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
}
.noria-calendar-week-number {
  border-radius: 0;
  opacity: .6;
  cursor: pointer;
  font-size: 11.5px;
  font-weight: 450;
}
.noria-calendar-week-number:hover {
  background: transparent;
  color: var(--text-normal);
  opacity: .9;
}
.noria-calendar-day {
  position: relative;
  display: inline-flex;
  align-items: flex-start;
  justify-content: center;
  height: 31px;
  min-width: 0;
  border-radius: 0;
  padding: 6px 0 0;
  color: var(--text-normal);
  font-size: 12.5px;
  font-weight: 520;
  line-height: 1;
  cursor: pointer;
  outline: 0;
  transition: background-color 120ms ease, box-shadow 120ms ease, color 120ms ease;
}
.noria-calendar-day.is-weekend {
  background: var(--noria-calendar-weekend);
  border-radius: 0;
}
.noria-calendar-day.is-weekend.is-weekend-start {
  border-radius: 0;
}
.noria-calendar-day.is-weekend.is-weekend-end {
  border-radius: 0;
}
.noria-calendar-day.is-outside {
  color: color-mix(in srgb, var(--text-muted) 56%, transparent);
}
.noria-calendar-day:hover {
  z-index: 2;
  background: var(--noria-calendar-hover);
  color: var(--text-normal);
  border-radius: 7px;
  box-shadow: inset 0 0 0 1px var(--noria-calendar-hover-ring);
}
.noria-calendar-day.is-weekend:hover {
  background: var(--noria-calendar-hover);
  border-radius: 7px;
  box-shadow: inset 0 0 0 1px var(--noria-calendar-hover-ring);
}
.noria-calendar-day.is-selected:not(.is-today) {
  background: var(--noria-calendar-selected);
  border-radius: 7px;
  box-shadow: inset 0 0 0 1px var(--noria-calendar-selected-ring);
}
.noria-calendar-day.is-today {
  color: var(--text-normal);
  font-weight: 700;
  background: var(--noria-calendar-today-bg);
  border-radius: 7px;
  box-shadow: none;
}
.noria-calendar-day.is-weekend.is-today,
.noria-calendar-day.is-weekend.is-weekend-start.is-today,
.noria-calendar-day.is-weekend.is-weekend-end.is-today {
  border-radius: 7px;
}
.noria-calendar-day.is-today::before {
  content: none;
}
.noria-calendar-day.has-note::after,
.noria-calendar-day.has-open-task::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: 5px;
  transform: translateX(-50%);
  width: 4.5px;
  height: 4.5px;
  border-radius: 999px;
}
.noria-calendar-day.has-note::after {
  background: var(--noria-calendar-note-dot);
}
.noria-calendar-day.has-open-task::after {
  background: var(--noria-calendar-task-dot);
  opacity: .72;
}
.noria-calendar-picker {
  display: grid;
  gap: 4px;
  width: 100%;
  min-width: 0;
}
.noria-calendar-picker--months {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.noria-calendar-picker--years {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.noria-calendar-root button.noria-calendar-period-cell {
  position: relative;
  appearance: none;
  -webkit-appearance: none;
  border: 0;
  box-shadow: none;
  background: transparent;
  min-width: 0;
  height: 42px;
  border-radius: 8px;
  padding: 0 2px 6px;
  color: var(--text-normal);
  font-family: inherit;
  font-size: 12px;
  font-weight: 520;
  line-height: 1;
  cursor: pointer;
  transition: background-color 120ms ease, box-shadow 120ms ease, color 120ms ease;
}
.noria-calendar-period-cell:hover {
  background: var(--noria-calendar-hover);
  box-shadow: inset 0 0 0 1px var(--noria-calendar-hover-ring);
}
.noria-calendar-period-cell.is-current,
.noria-calendar-period-cell.is-selected {
  background: var(--noria-calendar-today-bg);
  color: var(--text-normal);
  font-weight: 650;
}
.noria-calendar-period-cell.has-note::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: 7px;
  transform: translateX(-50%);
  width: 4.5px;
  height: 4.5px;
  border-radius: 999px;
  background: var(--noria-calendar-note-dot);
}
.noria-calendar-task-panel {
  display: grid;
  gap: 7px;
  border-top: 1px solid color-mix(in srgb, var(--background-modifier-border) 56%, transparent);
  padding-top: 8px;
}
.noria-calendar-task-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(72px, auto) auto;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--text-muted);
  font-size: 11.5px;
  font-weight: 560;
}
.noria-calendar-task-date {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-normal);
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.2;
}
.noria-calendar-root button.noria-calendar-task-close,
.noria-calendar-root button.noria-calendar-task-add,
.noria-calendar-root button.noria-calendar-task-time-toggle,
.noria-calendar-root button.noria-calendar-task-clear,
.noria-calendar-root button.noria-calendar-time-wheel-btn {
  appearance: none;
  -webkit-appearance: none;
  margin: 0;
  min-height: 0;
  border: 0;
  box-shadow: none;
  font-family: inherit;
}
.noria-calendar-task-close {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.noria-calendar-task-close:hover {
  background: var(--noria-calendar-hover);
  color: var(--text-normal);
}
.noria-calendar-task-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;
}
.noria-calendar-task-input {
  width: 100%;
  min-width: 0;
  height: 28px;
  border-radius: 7px;
  border: 1px solid color-mix(in srgb, var(--background-modifier-border) 76%, transparent);
  background: var(--background-primary);
  color: var(--text-normal);
  font-family: inherit;
  font-size: 12px;
  padding: 0 8px;
  box-sizing: border-box;
}
.noria-calendar-task-input:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--interactive-accent) 54%, var(--background-modifier-border));
}
.noria-calendar-task-add {
  min-width: 42px;
  height: 28px;
  border-radius: 7px;
  background: color-mix(in srgb, var(--interactive-accent) 12%, transparent);
  color: var(--text-normal);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.noria-calendar-task-add:hover {
  background: color-mix(in srgb, var(--interactive-accent) 18%, transparent);
}
.noria-calendar-task-time-toggle,
.noria-calendar-task-clear {
  height: 24px;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  font-size: 11.5px;
  cursor: pointer;
}
.noria-calendar-task-time-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  justify-self: end;
  min-width: 64px;
  padding: 0 8px;
  background: color-mix(in srgb, var(--background-modifier-hover) 52%, transparent);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  pointer-events: auto;
  touch-action: manipulation;
}
.noria-calendar-task-time-toggle:hover {
  background: color-mix(in srgb, var(--background-modifier-hover) 76%, transparent);
  color: var(--text-normal);
}
.noria-calendar-task-time-toggle.has-time {
  background: color-mix(in srgb, var(--interactive-accent) 11%, var(--background-modifier-hover));
  color: var(--text-normal);
  font-weight: 600;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--interactive-accent) 28%, transparent);
}
.noria-calendar-task-time-toggle.is-open {
  background: color-mix(in srgb, var(--interactive-accent) 16%, var(--background-modifier-hover));
  color: var(--text-normal);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--interactive-accent) 34%, transparent);
}
.noria-calendar-task-clear {
  padding: 0 4px;
}
.noria-calendar-task-clear:disabled {
  opacity: .38;
  cursor: default;
}
.noria-calendar-task-time-picker {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 6px;
}
.noria-calendar-task-time-tools {
  display: flex;
  justify-content: flex-end;
  margin-top: -2px;
}
.noria-calendar-time-wheel {
  display: grid;
  grid-auto-rows: 22px;
  max-height: 112px;
  overflow-y: auto;
  overscroll-behavior: contain;
  border-radius: 7px;
  background: color-mix(in srgb, var(--background-modifier-hover) 34%, transparent);
  padding: 3px;
}
.noria-calendar-time-wheel-btn {
  height: 22px;
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted);
  font-size: 11.5px;
  cursor: pointer;
}
.noria-calendar-time-wheel-btn:hover,
.noria-calendar-time-wheel-btn.is-active {
  background: var(--noria-calendar-hover);
  color: var(--text-normal);
}
`;
  if (shouldAppend) document.head.appendChild(style);
}

function setIconButton(button, iconName, fallbackText) {
  const slot = el(button, "span", { cls: "noria-calendar-icon-slot" });
  try {
    if (typeof setIcon === "function") setIcon(slot, iconName);
    else slot.textContent = fallbackText || "";
  } catch (_) {
    slot.textContent = fallbackText || "";
  }
}

function monthShift(anchor, delta) {
  const raw = String(anchor || "").match(/^(\d{4})-(\d{2})/);
  const y = raw ? Number(raw[1]) : new Date().getFullYear();
  const m = raw ? Number(raw[2]) - 1 : new Date().getMonth();
  const d = new Date(y, m + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function dateFromMonth(anchor) {
  const raw = String(anchor || "").match(/^(\d{4})-(\d{2})/);
  if (!raw) return "";
  return `${raw[1]}-${raw[2]}-01`;
}

function yearShift(anchor, deltaYears) {
  return monthShift(anchor, Number(deltaYears || 0) * 12);
}

function yearStartFor(year) {
  const n = Number(year);
  return Number.isFinite(n) ? Math.round(n) - 8 : new Date().getFullYear() - 8;
}

function pad2(value) {
  return String(Math.max(0, Math.min(99, parseInt(value, 10) || 0))).padStart(2, "0");
}

function parseTimeParts(timeText) {
  const match = String(timeText || "").trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    const now = new Date();
    const rounded = Math.max(0, Math.min(23 * 60 + 55, Math.round((now.getHours() * 60 + now.getMinutes()) / 5) * 5));
    return {
      hour: pad2(Math.floor(rounded / 60)),
      minute: pad2(rounded % 60),
      hasTime: false
    };
  }
  return { hour: pad2(match[1]), minute: pad2(match[2]), hasTime: true };
}

function formatTaskTimeRange(timeText) {
  const seed = parseTimeParts(timeText);
  if (!seed.hasTime) return t("runtime.calendar.noTime");
  const startMin = (parseInt(seed.hour, 10) || 0) * 60 + (parseInt(seed.minute, 10) || 0);
  const endMin = startMin + 30;
  const endDayOffset = Math.floor(endMin / 1440);
  const endClock = endMin % 1440;
  const endHour = Math.floor(endClock / 60);
  const endMinute = endClock % 60;
  const endLabel = `${endDayOffset > 0 ? "+" + endDayOffset + " " : ""}${pad2(endHour)}:${pad2(endMinute)}`;
  return `${seed.hour}:${seed.minute} - ${endLabel}`;
}

function getCalendarLocaleHint() {
  const raw = String(bridge?.calendarSettings?.calendarLocale || "").trim();
  if (raw && raw !== "system-default") return raw;
  const locale = String(bridge?.i18n?.locale || bridge?.locale || "").toLowerCase();
  return locale.startsWith("zh") ? "zh-CN" : undefined;
}

function formatTaskDateHeading(dateText) {
  const match = String(dateText || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(dateText || "");
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const locale = getCalendarLocaleHint();
  const localeText = String(locale || "").toLowerCase();
  if (localeText.startsWith("zh")) {
    const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
    return `${Number(match[2])}月${Number(match[3])}日, 星期${weekdays[date.getDay()]}`;
  }
  try {
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      weekday: "long"
    }).format(date);
  } catch (_) {
    return `${match[2]}-${match[3]}`;
  }
}

const MIN_VISIBLE_WEEKS = 2;
const MAX_VISIBLE_WEEKS = 6;
const WEEK_ROW_HEIGHT = 31;
const STATIC_CALENDAR_HEIGHT = 66;

injectStyle();
empty(mount);

const stateKey = "__noriaCalendarState";
const state = globalThis[stateKey] && typeof globalThis[stateKey] === "object"
  ? globalThis[stateKey]
  : { anchor: "", selectedDate: "", mode: "days" };
globalThis[stateKey] = state;
state.mode = ["days", "months", "years"].includes(String(state.mode || "")) ? state.mode : "days";

const root = el(mount, "div", { cls: "noria-calendar-root" });
let currentModel = null;
let renderSerial = 0;
let resizeTimer = null;

function clampInt(value, min, max) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function readHeight(node) {
  try {
    const rect = node && typeof node.getBoundingClientRect === "function" ? node.getBoundingClientRect() : null;
    return rect && Number(rect.height) > 0 ? Number(rect.height) : 0;
  } catch (_) {
    return 0;
  }
}

function measureVisibleWeeks() {
  const viewContent = typeof mount?.closest === "function" ? mount.closest(".view-content") : null;
  const height = readHeight(mount) || readHeight(mount?.parentElement) || readHeight(viewContent);
  const fallback = clampInt(state.visibleWeeks || MAX_VISIBLE_WEEKS, MIN_VISIBLE_WEEKS, MAX_VISIBLE_WEEKS);
  if (!height || height < STATIC_CALENDAR_HEIGHT + MIN_VISIBLE_WEEKS * WEEK_ROW_HEIGHT) return fallback;
  return clampInt(Math.floor((height - STATIC_CALENDAR_HEIGHT) / WEEK_ROW_HEIGHT), MIN_VISIBLE_WEEKS, MAX_VISIBLE_WEEKS);
}

function setAnchorMonth(anchor, offset, weekOffset = null) {
  state.anchor = monthShift(anchor, offset);
  state.weekOffset = weekOffset;
}

function handleCalendarWheel(event) {
  const target = event?.target || null;
  if (target && typeof target.closest === "function" && target.closest(".noria-calendar-task-panel")) return;
  if (!currentModel || event?.ctrlKey) return;
  const deltaY = Number(event?.deltaY || 0);
  if (Math.abs(deltaY) < 4) return;
  event.preventDefault?.();
  event.stopPropagation?.();
  const now = Date.now();
  if (now - Number(state.lastWheelAt || 0) < 140) return;
  state.lastWheelAt = now;
  const direction = deltaY > 0 ? 1 : -1;
  if (state.mode === "months") {
    state.anchor = yearShift(currentModel.anchor, direction);
    state.weekOffset = null;
    void render();
    return;
  }
  if (state.mode === "years") {
    state.yearStart = Math.round(Number(state.yearStart || yearStartFor(currentModel.year))) + direction * 16;
    void render();
    return;
  }
  const visibleWeeks = Number(currentModel.visibleWeeks || MAX_VISIBLE_WEEKS);
  const fullWeeks = Number(currentModel.fullWeeks || visibleWeeks);
  if (visibleWeeks < fullWeeks) {
    const maxOffset = Math.max(0, Number(currentModel.maxWeekOffset || 0));
    const currentOffset = Math.max(0, Number(currentModel.weekOffset || 0));
    const nextOffset = currentOffset + direction;
    if (nextOffset >= 0 && nextOffset <= maxOffset) {
      state.weekOffset = nextOffset;
    } else {
      setAnchorMonth(currentModel.anchor, direction, direction > 0 ? 0 : 999);
    }
  } else {
    setAnchorMonth(currentModel.anchor, direction, null);
  }
  void render();
}

root.addEventListener("wheel", handleCalendarWheel, { passive: false });

function handleCalendarKeydown(event) {
  if (event?.key !== "Escape") return;
  if (state.timeOpen) {
    state.timeOpen = false;
    event.preventDefault?.();
    void render();
    return;
  }
  if (state.taskDate) {
    state.taskDate = "";
    state.taskDraft = "";
    event.preventDefault?.();
    void render();
    return;
  }
  if (state.mode !== "days") {
    state.mode = "days";
    event.preventDefault?.();
    void render();
  }
}

try {
  if (mount.__noriaCalendarKeydown && typeof document?.removeEventListener === "function") {
    document.removeEventListener("keydown", mount.__noriaCalendarKeydown);
  }
  if (typeof document?.addEventListener === "function") {
    document.addEventListener("keydown", handleCalendarKeydown);
    mount.__noriaCalendarKeydown = handleCalendarKeydown;
  }
} catch (_) {}

async function openPeriod(period, date, event) {
  if (!api || typeof api.openPeriodNote !== "function") return;
  try {
    await api.openPeriodNote({
      period,
      date,
      newLeaf: !!(event && (event.ctrlKey || event.metaKey))
    });
  } catch (error) {
    try {
      bridge.runtime?.notice?.("calendar.notice.openFailed", { message: String(error?.message || error) });
    } catch (_) {}
    console.warn("[noria calendar] open failed", error);
  }
}

function setMode(mode) {
  state.mode = ["days", "months", "years"].includes(String(mode || "")) ? mode : "days";
  if (state.mode !== "days") {
    state.taskDate = "";
    state.timeOpen = false;
  }
}

function renderMonthPicker(picker) {
  const wrap = el(root, "div", { cls: "noria-calendar-picker noria-calendar-picker--months" });
  (picker?.months || []).forEach((month) => {
    const button = el(wrap, "button", {
      cls: "noria-calendar-period-cell noria-calendar-month-cell",
      text: month.label || String(month.month || ""),
      attr: { type: "button", title: month.path || "" }
    });
    addClass(button, "is-current", month.current);
    addClass(button, "is-selected", month.selected);
    addClass(button, "has-note", month.exists);
    button.addEventListener("click", () => {
      state.anchor = month.anchor || String(month.date || "").slice(0, 7);
      state.selectedDate = month.date || dateFromMonth(state.anchor);
      state.weekOffset = null;
      setMode("days");
      void render();
    });
  });
}

function renderYearPicker(picker, model) {
  const wrap = el(root, "div", { cls: "noria-calendar-picker noria-calendar-picker--years" });
  (picker?.years || []).forEach((year) => {
    const button = el(wrap, "button", {
      cls: "noria-calendar-period-cell noria-calendar-year-cell",
      text: year.label || String(year.year || ""),
      attr: { type: "button", title: year.path || "" }
    });
    addClass(button, "is-current", year.current);
    addClass(button, "is-selected", year.selected);
    addClass(button, "has-note", year.exists);
    button.addEventListener("click", () => {
      const monthPart = String(model?.anchor || state.anchor || "").slice(5, 7) || "01";
      state.anchor = `${year.year}-${monthPart}`;
      state.yearStart = yearStartFor(year.year);
      setMode("months");
      void render();
    });
  });
}

function applyTaskTime(hour, minute) {
  state.taskTime = `${pad2(hour)}:${pad2(minute)}`;
  state.taskTimeTouched = true;
}

function adjustTaskTime(part, direction) {
  const seed = parseTimeParts(state.taskTimeTouched ? state.taskTime : "");
  let hour = parseInt(seed.hour, 10) || 0;
  let minute = parseInt(seed.minute, 10) || 0;
  if (part === "hour") hour = (hour + direction + 24) % 24;
  else minute = (minute + direction * 5 + 60) % 60;
  applyTaskTime(hour, minute);
}

function toggleTaskTimePicker(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  state.timeOpen = !state.timeOpen;
  void render();
}

function wheelTaskTime(event) {
  const deltaY = Number(event?.deltaY || 0);
  if (Math.abs(deltaY) < 2) return;
  event?.preventDefault?.();
  event?.stopPropagation?.();
  adjustTaskTime(event?.shiftKey ? "hour" : "minute", deltaY > 0 ? 1 : -1);
  state.timeOpen = false;
  void render();
}

function renderTimeWheel(parent, part, activeValue) {
  const wheel = el(parent, "div", {
    cls: "noria-calendar-time-wheel",
    attr: { role: "listbox", "aria-label": t(part === "hour" ? "runtime.calendar.hour" : "runtime.calendar.minute") }
  });
  wheel.addEventListener("wheel", (event) => {
    const deltaY = Number(event?.deltaY || 0);
    if (Math.abs(deltaY) < 2) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    adjustTaskTime(part, deltaY > 0 ? 1 : -1);
    void render();
  }, { passive: false });
  const count = part === "hour" ? 24 : 60;
  for (let i = 0; i < count; i++) {
    const value = pad2(i);
    const button = el(wheel, "button", {
      cls: "noria-calendar-time-wheel-btn",
      text: value,
      attr: { type: "button", role: "option", "aria-selected": value === activeValue ? "true" : "false" }
    });
    addClass(button, "is-active", value === activeValue);
    button.addEventListener("click", () => {
      const seed = parseTimeParts(state.taskTimeTouched ? state.taskTime : "");
      if (part === "hour") applyTaskTime(value, seed.minute);
      else applyTaskTime(seed.hour, value);
      void render();
    });
  }
}

function renderTaskPanel() {
  if (!state.taskDate) return;
  const panel = el(root, "div", { cls: "noria-calendar-task-panel" });
  const head = el(panel, "div", { cls: "noria-calendar-task-head" });
  el(head, "div", { cls: "noria-calendar-task-date", text: formatTaskDateHeading(state.taskDate) });
  const timeButton = el(head, "button", {
    cls: "noria-calendar-task-time-toggle",
    text: formatTaskTimeRange(state.taskTimeTouched ? state.taskTime : ""),
    attr: {
      type: "button",
      "aria-expanded": state.timeOpen ? "true" : "false",
      title: t("runtime.calendar.timeRange")
    }
  });
  addClass(timeButton, "has-time", state.taskTimeTouched && state.taskTime);
  addClass(timeButton, "is-open", state.timeOpen);
  timeButton.addEventListener("mousedown", (event) => {
    if (event && event.button !== 0) return;
    toggleTaskTimePicker(event);
  });
  timeButton.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      toggleTaskTimePicker(event);
    } else if (event.key === "ArrowUp") {
      event.preventDefault?.();
      adjustTaskTime(event.shiftKey ? "hour" : "minute", -1);
      void render();
    } else if (event.key === "ArrowDown") {
      event.preventDefault?.();
      adjustTaskTime(event.shiftKey ? "hour" : "minute", 1);
      void render();
    }
  });
  timeButton.addEventListener("wheel", wheelTaskTime, { passive: false });
  const close = el(head, "button", { cls: "noria-calendar-task-close", text: "×", attr: { type: "button" } });
  close.addEventListener("click", () => {
    state.taskDate = "";
    state.taskDraft = "";
    state.timeOpen = false;
    void render();
  });

  const form = el(panel, "form", { cls: "noria-calendar-task-form" });
  const inputEl = el(form, "input", {
    cls: "noria-calendar-task-input",
    attr: { type: "text", placeholder: t("runtime.calendar.taskPlaceholder"), value: state.taskDraft || "" }
  });
  inputEl.value = state.taskDraft || "";
  inputEl.addEventListener("input", () => {
    state.taskDraft = inputEl.value;
  });
  const add = el(form, "button", {
    cls: "noria-calendar-task-add",
    text: t("runtime.calendar.addTask"),
    attr: { type: "submit" }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault?.();
    const title = String(inputEl.value || "").replace(/\s+/g, " ").trim();
    state.taskDraft = title;
    if (!title) {
      try { bridge.runtime?.notice?.("runtime.calendar.taskTitleRequired", {}, 1200); } catch (_) {}
      inputEl.focus?.();
      return;
    }
    add.disabled = true;
    try {
      if (typeof api.addDateTask !== "function") throw new Error("Calendar writeback bridge unavailable");
      await api.addDateTask({
        date: state.taskDate,
        title,
        time: state.taskTimeTouched ? state.taskTime : ""
      });
      try { bridge.runtime?.notice?.("runtime.calendar.taskAdded", { date: state.taskDate }, 1200); } catch (_) {}
      state.taskDraft = "";
      state.timeOpen = false;
      await render();
    } catch (error) {
      add.disabled = false;
      try { bridge.runtime?.notice?.("runtime.calendar.taskAddFailed", { message: String(error?.message || error) }, 1800); } catch (_) {}
      console.warn("[noria calendar] add task failed", error);
    }
  });

  if (state.timeOpen) {
    const picker = el(panel, "div", { cls: "noria-calendar-task-time-picker" });
    const seed = parseTimeParts(state.taskTimeTouched ? state.taskTime : "");
    renderTimeWheel(picker, "hour", seed.hasTime ? seed.hour : "");
    renderTimeWheel(picker, "minute", seed.hasTime ? seed.minute : "");
    const tools = el(panel, "div", { cls: "noria-calendar-task-time-tools" });
    const clear = el(tools, "button", {
      cls: "noria-calendar-task-clear",
      text: t("runtime.calendar.clearTime"),
      attr: { type: "button" }
    });
    clear.disabled = !(state.taskTimeTouched && state.taskTime);
    clear.addEventListener("click", () => {
      state.taskTime = "";
      state.taskTimeTouched = false;
      state.timeOpen = false;
      void render();
    });
  }
}

async function render() {
  const token = ++renderSerial;
  if (!api || typeof api.getMonthModel !== "function") {
    empty(root);
    el(root, "div", { cls: "noria-itemview-error", text: "Calendar bridge is unavailable." });
    return;
  }
  state.visibleWeeks = measureVisibleWeeks();
  const model = await api.getMonthModel({
    anchor: state.anchor || "",
    selectedDate: state.selectedDate || "",
    focusDate: state.selectedDate || "",
    visibleWeeks: state.visibleWeeks,
    weekOffset: state.weekOffset
  });
  if (token !== renderSerial) return;
  currentModel = model;
  state.anchor = model.anchor;
  state.weekOffset = model.weekOffset;
  state.visibleWeeks = model.visibleWeeks || state.visibleWeeks;
  state.selectedDate = state.selectedDate || model.selectedDate || model.today;

  empty(root);
  addClass(root, "is-compact", Number(model.visibleWeeks || 0) < Number(model.fullWeeks || 0));
  try {
    root.setAttribute("data-visible-weeks", String(model.visibleWeeks || ""));
    root.setAttribute("data-mode", state.mode || "days");
  } catch (_) {}

  const header = el(root, "div", { cls: "noria-calendar-header" });
  const title = el(header, "div", { cls: "noria-calendar-title" });
  const monthButton = el(title, "button", {
    cls: "noria-calendar-month",
    text: model.monthTitle || String(model.monthLabel || model.anchor).split(/\s+/)[0],
    attr: { type: "button", title: t("calendar.period.monthly") }
  });
  addClass(monthButton, "has-period-note", !!model.titlePeriods?.monthly?.exists);
  monthButton.addEventListener("click", (event) => openPeriod("monthly", dateFromMonth(model.anchor), event));
  monthButton.addEventListener("contextmenu", (event) => {
    event.preventDefault?.();
    event.stopPropagation?.();
    setMode("months");
    state.weekOffset = null;
    void render();
  });
  const yearButton = el(title, "button", {
    cls: "noria-calendar-year",
    text: model.yearTitle || String(model.year || ""),
    attr: { type: "button", title: t("calendar.period.yearly") }
  });
  addClass(yearButton, "has-period-note", !!model.titlePeriods?.yearly?.exists);
  yearButton.addEventListener("click", (event) => openPeriod("yearly", `${model.year || String(model.anchor || "").slice(0, 4)}-01-01`, event));
  yearButton.addEventListener("contextmenu", (event) => {
    event.preventDefault?.();
    event.stopPropagation?.();
    setMode("years");
    state.yearStart = yearStartFor(model.year);
    void render();
  });

  const nav = el(header, "div", { cls: "noria-calendar-nav" });
  const prevTitle = state.mode === "years"
    ? t("runtime.calendar.previousYears")
    : (state.mode === "months" ? t("runtime.calendar.previousYear") : t("runtime.calendar.previousMonth"));
  const prev = el(nav, "button", { attr: { type: "button", title: prevTitle } });
  setIconButton(prev, "chevron-left", "<");
  prev.addEventListener("click", () => {
    if (state.mode === "years") {
      state.yearStart = Math.round(Number(state.yearStart || yearStartFor(model.year))) - 16;
    } else if (state.mode === "months") {
      state.anchor = yearShift(model.anchor, -1);
      state.weekOffset = null;
    } else {
      setAnchorMonth(model.anchor, -1, 0);
    }
    void render();
  });
  const today = el(nav, "button", {
    cls: "noria-calendar-today",
    text: t("runtime.calendar.today"),
    attr: { type: "button" }
  });
  today.addEventListener("click", () => {
    setMode("days");
    state.anchor = String(model.today || "").slice(0, 7);
    state.selectedDate = model.today;
    state.weekOffset = null;
    state.taskDate = "";
    void render();
  });
  const nextTitle = state.mode === "years"
    ? t("runtime.calendar.nextYears")
    : (state.mode === "months" ? t("runtime.calendar.nextYear") : t("runtime.calendar.nextMonth"));
  const next = el(nav, "button", { attr: { type: "button", title: nextTitle } });
  setIconButton(next, "chevron-right", ">");
  next.addEventListener("click", () => {
    if (state.mode === "years") {
      state.yearStart = Math.round(Number(state.yearStart || yearStartFor(model.year))) + 16;
    } else if (state.mode === "months") {
      state.anchor = yearShift(model.anchor, 1);
      state.weekOffset = null;
    } else {
      setAnchorMonth(model.anchor, 1, 0);
    }
    void render();
  });

  if (state.mode === "months") {
    const picker = typeof api.getPickerModel === "function"
      ? await api.getPickerModel({ mode: "months", anchor: model.anchor, year: model.year })
      : null;
    if (token !== renderSerial) return;
    renderMonthPicker(picker);
    return;
  }
  if (state.mode === "years") {
    if (!Number.isFinite(Number(state.yearStart))) state.yearStart = yearStartFor(model.year);
    const picker = typeof api.getPickerModel === "function"
      ? await api.getPickerModel({ mode: "years", anchor: model.anchor, year: model.year, yearStart: state.yearStart })
      : null;
    if (token !== renderSerial) return;
    if (picker && Number.isFinite(Number(picker.startYear))) state.yearStart = picker.startYear;
    renderYearPicker(picker, model);
    return;
  }

  const grid = el(root, "div", { cls: "noria-calendar-grid" });
  addClass(grid, "has-week-number", model.showWeekNumber);
  if (model.showWeekNumber) el(grid, "div", { cls: "noria-calendar-weekday noria-calendar-week-spacer", text: "" });
  for (const dayName of model.weekdays || []) {
    el(grid, "div", { cls: "noria-calendar-weekday", text: String(dayName || "").slice(0, 2) });
  }

  (model.days || []).forEach((day, index) => {
    if (model.showWeekNumber && index % 7 === 0) {
      const week = el(grid, "button", {
        cls: "noria-calendar-week-number",
        text: String(day.weekNumber || ""),
        attr: { type: "button", title: t("calendar.period.weekly") }
      });
      week.addEventListener("click", (event) => openPeriod("weekly", day.date, event));
    }
    const btn = el(grid, "button", {
      cls: "noria-calendar-day",
      text: String(day.day || ""),
      attr: {
        type: "button",
        title: `${day.date}${day.path ? `\n${day.path}` : ""}`
      }
    });
    const weekday = Number(day.weekday);
    addClass(btn, "is-outside", !day.inMonth);
    addClass(btn, "is-weekend", day.weekend);
    addClass(btn, "is-weekend-start", day.weekend && weekday === 6);
    addClass(btn, "is-weekend-end", day.weekend && weekday === 0);
    addClass(btn, "is-today", day.today);
    addClass(btn, "is-selected", day.date === state.selectedDate);
    addClass(btn, "has-note", day.exists);
    addClass(btn, "has-open-task", !day.exists && Number(day.openTaskCount || 0) > 0);
    btn.addEventListener("click", (event) => {
      state.selectedDate = day.date;
      void render().then(() => openPeriod("daily", day.date, event));
    });
  });
  renderTaskPanel();
}

function scheduleResizeRender() {
  const nextVisibleWeeks = measureVisibleWeeks();
  if (nextVisibleWeeks === state.visibleWeeks) return;
  state.visibleWeeks = nextVisibleWeeks;
  if (resizeTimer) window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    resizeTimer = null;
    void render();
  }, 80);
}

try {
  const target = typeof mount?.closest === "function" ? (mount.closest(".view-content") || mount) : mount;
  if (mount.__noriaCalendarResizeObserver && typeof mount.__noriaCalendarResizeObserver.disconnect === "function") {
    mount.__noriaCalendarResizeObserver.disconnect();
  }
  const ResizeObserverCtor = window?.ResizeObserver || globalThis.ResizeObserver;
  if (ResizeObserverCtor && target) {
    const observer = new ResizeObserverCtor(scheduleResizeRender);
    observer.observe(target);
    mount.__noriaCalendarResizeObserver = observer;
  }
} catch (_) {}

await render();
