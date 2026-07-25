const host = (input && input.mount) ? input.mount : this.container;
const bridge = input?.noriaBridge || globalThis.__noriaRuntimeBridge || {};
const habitRegistryPath = String(bridge.paths?.habitRegistryPath || "Noria/Habits.md");
const diaryRoot = String(bridge.paths?.diaryRoot || "Noria/Diary").replace(/[\\]+/g, "/").replace(/^\/+|\/+$/g, "") || "Noria/Diary";
const habitWeekToArray = (value) => {
  if (bridge.runtime && typeof bridge.runtime.toArray === "function") return bridge.runtime.toArray(value);
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    if (typeof value.array === "function") return value.array();
  } catch (_) {}
  try {
    return Array.from(value || []);
  } catch (_) {
    return [];
  }
};
const runtimeFallbackMessages = {
  "runtime.common.cancel": "Cancel",
  "runtime.common.save": "Save",
  "runtime.common.add": "Add",
  "runtime.common.restore": "Restore",
  "runtime.common.pause": "Pause",
  "runtime.habits.managerTitle": "Habit manager",
  "runtime.habits.managerSubtitle": "Edit type, target, and unit. Sleep targets only affect newly created records.",
  "runtime.habits.empty": "No habits yet.",
  "runtime.habits.name": "Habit name",
  "runtime.habits.type": "Type",
  "runtime.habits.target": "Target",
  "runtime.habits.unit": "Unit",
  "runtime.habits.normal": "Normal",
  "runtime.habits.active": "Active ({count})",
  "runtime.habits.paused": "Paused ({count})",
  "runtime.habits.done": "Built ({count})",
  "runtime.habits.noticeInvalidName": "Enter a valid habit name.",
  "runtime.habits.noticeRestoreFailed": "Restore failed.",
  "runtime.habits.noticeSaveFailed": "Save failed.",
  "runtime.habits.noticePauseFailed": "Pause failed.",
  "runtime.habits.noticeDoneFailed": "Mark failed.",
  "runtime.habits.noticeAddFailed": "Add failed.",
  "runtime.habits.noticeHabitSaveFailed": "Could not save habit.",
  "runtime.habits.noticeSleepSaveFailed": "Could not save sleep.",
  "runtime.habits.noticeSleepSyncRequested": "Requested sleep habits refresh from #tl/sleep.",
  "runtime.habits.editParams": "Edit habit parameters",
  "runtime.habits.syncSleep": "Refresh sleep habits from timeline",
  "runtime.habits.addHabit": "Add habit",
  "runtime.habits.noRegistry": "Habit registry not found.",
  "runtime.habits.noActive": "No active habits.",
  "runtime.habits.noActiveAction": "Open habit registry",
  "runtime.habits.initializeRegistry": "Create habit registry",
  "runtime.habits.noticeRegistryInitFailed": "Could not create the habit registry.",
  "runtime.habits.markDone": "Built",
  "runtime.habits.sleepStart": "Sleep start",
  "runtime.habits.sleepEnd": "Wake time",
  "runtime.habits.sleepTarget": "Target time",
  "runtime.habits.recordSleepTitle": "Record sleep",
  "runtime.habits.record": "Record {date}",
  "runtime.habits.recordSleep": "Record {date} sleep",
  "runtime.habits.toggleRecord": "Toggle {name} on {date}",
  "runtime.habits.recordValueForDate": "Record {name} on {date}",
  "runtime.habits.recordSleepForDate": "Record {name} sleep on {date}"
};
const runtimeBridgeMessages = bridge.i18n?.messages || {};
const runtimeBridgeFallback = bridge.i18n?.fallback || {};
const runtimeT = (key, params = {}) => {
  const fromBridge = typeof bridge.t === "function" ? String(bridge.t(key, params) || "") : "";
  const raw = fromBridge && fromBridge !== key
    ? fromBridge
    : runtimeBridgeMessages[key] || runtimeBridgeFallback[key] || runtimeFallbackMessages[key] || String(key || "");
  return String(raw).replace(/\{([^}]+)\}/g, (_, name) => {
    const value = params && Object.prototype.hasOwnProperty.call(params, name) ? params[name] : "";
    return String(value == null ? "" : value);
  });
};
const habitSectionsUseChinese = /^zh(?:-|$)/i.test(String(bridge.locale || bridge.i18n?.locale || "en"));
const HABIT_SECTION_ALIASES = [
  ["打卡中的习惯", "Active habits"],
  ["暂停的习惯", "Paused habits"],
  ["已养成习惯", "Established habits"],
  ["循环任务源（每日）", "Daily recurring task source"]
];
const habitSectionAliases = (title) => {
  const raw = String(title || "").trim();
  return HABIT_SECTION_ALIASES.find((group) => group.includes(raw)) || [raw];
};
const preferredHabitSectionTitle = (title) => {
  const aliases = habitSectionAliases(title);
  return aliases[habitSectionsUseChinese ? 0 : Math.min(1, aliases.length - 1)] || aliases[0] || String(title || "");
};
const existingHabitSectionTitle = (content, title) => {
  const source = String(content || "");
  for (const candidate of habitSectionAliases(title)) {
    const escaped = String(candidate || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`^##\\s*${escaped}\\s*$`, "m").test(source)) return candidate;
  }
  return preferredHabitSectionTitle(title);
};
const getHabitSectionBlock = (content, title) => {
  const source = String(content || "");
  for (const candidate of habitSectionAliases(title)) {
    const escaped = String(candidate || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const block = (source.match(new RegExp(`##\\s*${escaped}[\\s\\S]*?(?=\\n##\\s|$)`)) || [])[0] || "";
    if (block) return block;
  }
  return "";
};
const habitRegistryTemplate = () => {
  const titles = HABIT_SECTION_ALIASES.map((group) => group[habitSectionsUseChinese ? 0 : 1]);
  return titles.map((title) => `## ${title}\n`).join("\n");
};
const now = new Date();
const HABIT_WINDOW_DAYS = 22;
const HABIT_COMPACT_FIRST_LINE_DAYS = 11;

const toDateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayKey = toDateStr(now);
const fromDateStr = (ds) => {
  const m = String(ds || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};
const buildRecentDates = (today, count = HABIT_WINDOW_DAYS) => {
  const end = new Date(today);
  end.setHours(0, 0, 0, 0);
  const total = Math.max(1, Number(count) || HABIT_WINDOW_DAYS);
  return Array.from({ length: total }, (_, idx) => {
    const d = new Date(end);
    d.setDate(end.getDate() - (total - 1 - idx));
    return toDateStr(d);
  });
};
const dates = buildRecentDates(now, HABIT_WINDOW_DAYS);
const rangeStartKey = dates[0] || todayKey;
const rangeEndKey = dates[dates.length - 1] || todayKey;
const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];
const getWeekdayIndex = (ds) => {
  const d = fromDateStr(ds);
  return d ? d.getDay() : -1;
};
const getDayNumber = (ds) => {
  const d = fromDateStr(ds);
  return d ? String(d.getDate()) : "";
};
const isWeekendDate = (ds) => {
  const day = getWeekdayIndex(ds);
  return day === 0 || day === 6;
};
const isMonthStartDate = (ds) => {
  const d = fromDateStr(ds);
  return !!(d && d.getDate() === 1);
};

const getSectionTaskEntries = (content, title) => {
  const block = getHabitSectionBlock(content, title);
  return block
    .split("\n")
    .map((x) => x.trim())
    .filter((x) => /^-\s+\[[ xX]\]\s+/.test(x))
    .map((x) => ({ completed: /^-\s+\[[xX]\]\s+/.test(x), text: x.replace(/^-\s+\[[ xX]\]\s+/, "").trim() }))
    .filter((x) => !!x.text);
};
const getSectionBullets = (content, title) => {
  const block = getHabitSectionBlock(content, title);
  return block
    .split("\n")
    .map((x) => x.trim())
    .filter((x) => /^-\s+(?!\[[ xX]\])/.test(x) && x !== "- （空）" && !/^-\s*\(?\s*empty\s*\)?$/i.test(x))
    .map((x) => normalizeHabit(x.replace(/^-\s+/, "")))
    .filter(Boolean);
};
const getSectionRawBullets = (content, title) => {
  const block = getHabitSectionBlock(content, title);
  return block
    .split("\n")
    .map((x) => x.trim())
    .filter((x) => /^-\s+(?!\[[ xX]\])/.test(x) && x !== "- （空）" && !/^-\s*\(?\s*empty\s*\)?$/i.test(x))
    .map((x) => x.replace(/^-\s+/, "").trim())
    .filter(Boolean);
};
const normalizeHabit = (text) =>
  String(text || "")
    .replace(/#habit-active\b/gi, "")
    .replace(/#habit-paused\b/gi, "")
    .replace(/#habit-done\b/gi, "")
    .replace(/#active\b/gi, "")
    .replace(/#paused\b/gi, "")
    .replace(/#done\b/gi, "")
    .replace(/#habit\b/gi, "")
    .replace(/#[一-龥\w/-]+/g, "")
    .replace(/(?:📅|⏳|🛫|✅)\s*\d{4}-\d{2}-\d{2}/g, "")
    .replace(/🔁\s*[^#\[\]\n]+/g, "")
    .replace(/\[[a-zA-Z_][a-zA-Z0-9_-]*::\s*[^\]]*\]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
const migrateHabitStatusTags = (text) => {
  return String(text || "")
    .split("\n")
    .map((line) => {
      const seen = new Set();
      return String(line || "")
        .replace(/#habit-active\b/gi, "#habit #active")
        .replace(/#habit-paused\b/gi, "#habit #paused")
        .replace(/#habit-done\b/gi, "#habit #paused #done")
        .replace(/(^|[ \t]+)(#(?:habit|active|paused|done))\b/gi, (_, gap, tag) => {
          const key = String(tag || "").toLowerCase();
          if (seen.has(key)) return "";
          seen.add(key);
          return `${gap}${key}`;
        })
        .replace(/[ \t]{2,}/g, " ")
        .trimEnd();
    })
    .join("\n");
};
const parseInlineFields = (text) => {
  const fields = {};
  String(text || "").replace(/\[([a-zA-Z_][a-zA-Z0-9_-]*)::\s*([^\]]*)\]/g, (_, key, value) => {
    fields[String(key || "").trim()] = String(value || "").trim();
    return "";
  });
  return fields;
};
const getInlineField = (text, key) => {
  const m = String(text || "").match(new RegExp(`\\[${key}::\\s*([^\\]]*)\\]`, "i"));
  return m ? String(m[1] || "").trim() : "";
};
const inferHabitConfig = (text) => {
  const name = normalizeHabit(text);
  const fields = parseInlineFields(text);
  const base = { name };
  ["type", "target", "value", "unit"].forEach((key) => {
    if (fields[key] != null && String(fields[key]).trim() !== "") base[key] = String(fields[key]).trim();
  });
  if (base.type || base.target || base.unit) {
    if (!base.type && base.target) base.type = /^\d+(?:\.\d+)?$/.test(base.target) ? "number" : "text";
    return base;
  }
  let m = name.match(/^喝\s*(\d+(?:\.\d+)?)\s*杯水$/);
  if (m) return { name: "喝水", type: "number", target: m[1], unit: "杯" };
  m = name.match(/^运动\s*(\d+(?:\.\d+)?)\s*(大卡|千卡|kcal|卡)$/i);
  if (m) return { name: "运动", type: "number", target: m[1], unit: m[2] };
  if (/睡/.test(name) && /12[:：]30/.test(name)) return { name, type: "sleep", target: "00:30" };
  return base;
};
const canonicalHabitName = (text) => inferHabitConfig(text).name || normalizeHabit(text);
const formatHabitTodayLabel = (cfg, record) => {
  const name = normalizeHabit(cfg?.name || "");
  if (!name) return "";
  const type = String(record?.type || cfg?.type || "").trim();
  const value = record?.value != null ? String(record.value).trim() : "";
  const target = cfg?.target != null ? String(cfg.target).trim() : "";
  const unit = String(record?.unit || cfg?.unit || "").trim();
  if (type === "number") {
    const amount = value || target;
    if (amount) return `${name}${amount}${unit}`;
  }
  return name;
};
const serializeHabitConfig = (cfg) => {
  const name = normalizeHabit(cfg?.name || "");
  if (!name) return "";
  const type = String(cfg?.type || "").trim();
  const target = String(cfg?.target || "").trim() || (type === "sleep" ? "00:30" : "");
  const unit = String(cfg?.unit || "").trim();
  const parts = [name];
  if (type) parts.push(`[type:: ${type}]`);
  if (target) parts.push(`[target:: ${target}]`);
  if (unit) parts.push(`[unit:: ${unit}]`);
  return parts.join(" ");
};
const getSectionHabitConfigs = (content, title) =>
  getSectionRawBullets(content, title)
    .map(inferHabitConfig)
    .filter((x) => x.name);
const getInlineDate = (text, key) => {
  const m = String(text || "").match(new RegExp(`\\[${key}::\\s*(\\d{4}-\\d{2}-\\d{2})\\]`, "i"));
  return m ? m[1] : "";
};
const getEmojiDate = (text, regex) => {
  const m = String(text || "").match(regex);
  return m ? m[1] : "";
};
const getTaskDate = (t, key) => {
  const txt = String(t?.text || "");
  if (key === "due") return String(t?.due || "").slice(0, 10) || getInlineDate(txt, "due") || getEmojiDate(txt, /[📅📆🗓]\s*(\d{4}-\d{2}-\d{2})/);
  if (key === "scheduled") return String(t?.scheduled || "").slice(0, 10) || getInlineDate(txt, "scheduled") || getEmojiDate(txt, /[⏳⌛]\s*(\d{4}-\d{2}-\d{2})/);
  if (key === "start") return String(t?.start || "").slice(0, 10) || getInlineDate(txt, "start") || getEmojiDate(txt, /🛫\s*(\d{4}-\d{2}-\d{2})/);
  if (key === "done") return String(t?.completion || "").slice(0, 10) || getInlineDate(txt, "completion") || getInlineDate(txt, "done") || getEmojiDate(txt, /✅\s*(\d{4}-\d{2}-\d{2})/);
  return "";
};
const getHabitRecordDate = (t) => getTaskDate(t, "due") || getTaskDate(t, "scheduled") || getTaskDate(t, "start") || getTaskDate(t, "done");
const inRange = (ds) => !!ds && ds >= rangeStartKey && ds <= rangeEndKey;
const fillMissingRecordFields = (primary, secondary) => {
  const next = { ...(primary || {}) };
  const fallback = secondary || {};
  ["value", "target", "unit", "type", "end", "source", "task"].forEach((key) => {
    const cur = next[key];
    const fallbackValue = fallback[key];
    const hasCur = cur != null && String(cur).trim() !== "";
    const hasFallback = fallbackValue != null && String(fallbackValue).trim() !== "";
    if (!hasCur && hasFallback) next[key] = fallbackValue;
  });
  next.done = !!primary?.done || !!secondary?.done;
  return next;
};
const mergeHabitRecord = (existing, incoming) => {
  if (!incoming) return existing || null;
  if (!existing) return incoming;
  if (existing.done && !incoming.done) return fillMissingRecordFields(existing, incoming);
  if (!existing.done && incoming.done) return fillMissingRecordFields(incoming, existing);
  return fillMissingRecordFields(incoming, existing);
};
const setHabitRecord = (map, habitName, date, record) => {
  if (!map.has(habitName) || !inRange(date)) return false;
  const byDate = map.get(habitName);
  byDate[date] = mergeHabitRecord(byDate[date] || null, record || null);
  return true;
};
const computeStreakCells = (recordsByDate, dateKeys) => {
  const cells = (dateKeys || []).map((date) => ({
    date,
    done: !!recordsByDate?.[date]?.done,
    streakStart: false,
    streakMiddle: false,
    streakEnd: false,
    streakCount: 0
  }));
  let startIdx = -1;
  for (let i = 0; i <= cells.length; i++) {
    const inStreak = i < cells.length && cells[i].done;
    if (inStreak && startIdx === -1) {
      startIdx = i;
    } else if (!inStreak && startIdx !== -1) {
      const endIdx = i - 1;
      const count = endIdx - startIdx + 1;
      for (let j = startIdx; j <= endIdx; j++) {
        cells[j].streakStart = j === startIdx;
        cells[j].streakEnd = j === endIdx;
        cells[j].streakMiddle = count > 1 && j > startIdx && j < endIdx;
      }
      cells[endIdx].streakCount = count;
      startIdx = -1;
    }
  }
  return cells;
};
const toggleClass = (el, cls, enabled) => {
  if (el?.classList) el.classList.toggle(cls, !!enabled);
};
const setHabitAttr = (el, name, value = "") => {
  if (!el) return;
  const next = String(value == null ? "" : value);
  if (typeof el.setAttr === "function") el.setAttr(name, next);
  else if (typeof el.setAttribute === "function") el.setAttribute(name, next);
  else {
    el.attrs = { ...(el.attrs || {}), [name]: next };
    el[name] = next;
  }
};
const removeHabitAttr = (el, name) => {
  if (!el) return;
  if (typeof el.removeAttribute === "function") el.removeAttribute(name);
  else if (el.attrs) delete el.attrs[name];
  try { delete el[name]; } catch (_) {}
};
let habitActionMirror = null;
const mirrorHabitAction = ({ state = "idle", kind = "", habit = "", date = "", path = "", error = "" } = {}) => {
  const root = habitActionMirror;
  if (!root) return;
  setHabitAttr(root, "data-noria-last-habit-checkin-action-state", state || "idle");
  setHabitAttr(root, "data-noria-last-habit-checkin-action-kind", kind || "");
  setHabitAttr(root, "data-noria-last-habit-checkin-action-habit", habit || "");
  setHabitAttr(root, "data-noria-last-habit-checkin-action-date", date || "");
  setHabitAttr(root, "data-noria-last-habit-checkin-action-path", path || "");
  setHabitAttr(root, "data-noria-last-habit-checkin-action-error", error || "");
};
const setHabitActionState = (el, state = "idle", error = "") => {
  const next = state || "idle";
  setHabitAttr(el, "data-noria-action-state", next);
  setHabitAttr(el, "aria-busy", next === "pending" ? "true" : "false");
  if (error) setHabitAttr(el, "data-noria-action-error", error);
  else removeHabitAttr(el, "data-noria-action-error");
};
const markHabitActionTarget = (el, { kind = "", name = "", date = "", type = "", path = habitRegistryPath } = {}) => {
  setHabitAttr(el, "data-noria-action-source", "home-habit-checkin");
  setHabitAttr(el, "data-noria-action-kind", kind || "");
  setHabitAttr(el, "data-noria-action-target", name || "");
  setHabitAttr(el, "data-noria-action-target-path", path || "");
  setHabitAttr(el, "data-noria-action-target-date", date || "");
  setHabitAttr(el, "data-noria-habit-name", name || "");
  setHabitAttr(el, "data-noria-habit-date", date || "");
  setHabitAttr(el, "data-noria-habit-type", type || "");
  setHabitActionState(el, "idle");
};
const applyHabitCellState = (cell, token, state) => {
  const st = state || {};
  const done = !!st.done;
  const partial = !!st.partial && !done;
  [
    "is-done",
    "has-partial",
    "is-streak-start",
    "is-streak-middle",
    "is-streak-end",
    "is-today",
    "is-weekend",
    "has-streak-count"
  ].forEach((cls) => {
    toggleClass(cell, cls, false);
    toggleClass(token, cls, false);
  });
  toggleClass(cell, "is-done", done);
  toggleClass(cell, "has-partial", partial);
  toggleClass(cell, "is-streak-start", done && st.streakStart);
  toggleClass(cell, "is-streak-middle", done && st.streakMiddle);
  toggleClass(cell, "is-streak-end", done && st.streakEnd);
  toggleClass(cell, "is-today", !!st.today);
  toggleClass(cell, "is-weekend", !!st.weekend);
  toggleClass(token, "is-done", done);
  toggleClass(token, "has-partial", partial);
};
const habitTokenText = (streak, done) => {
  if (!done || !streak?.streakEnd || Number(streak?.streakCount || 0) < 2) return "";
  return String(streak.streakCount);
};
const setHabitTokenMeta = (token, cfg, date, key) => {
  if (!token) return "";
  const name = normalizeHabit(cfg?.name || "");
  const type = String(cfg?.type || "").trim() || "check";
  const label = runtimeT(key, { name, date });
  const actionKind = type === "number" ? "record-habit-value" : (type === "sleep" ? "record-habit-sleep" : "toggle-habit-checkin");
  if (typeof token.addClass === "function") token.addClass("is-editable");
  setHabitAttr(token, "data-habit-name", name);
  setHabitAttr(token, "data-habit-date", date);
  setHabitAttr(token, "data-habit-type", type);
  setHabitAttr(token, "aria-label", label);
  markHabitActionTarget(token, { kind: actionKind, name, date, type });
  token.dataset = { ...(token.dataset || {}), habitName: name, habitDate: date, habitType: type };
  return label;
};
const escapeRegExp = (s) => String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normPath = (p) => String(p || "").replace(/\\/g, "/").replace(/^\/+/, "");
const openFilePath = async (path) => {
  const p = normPath(path);
  const f = app.vault.getAbstractFileByPath(p);
  if (!f) return false;
  await app.workspace.getLeaf(false).openFile(f);
  return true;
};
const renderHabitEmptyAction = (key, actionKey, pathText, options = {}) => {
  const empty = host.createDiv();
  empty.style.cssText = "display:flex;flex-direction:column;align-items:flex-start;gap:7px;color:var(--text-muted);font-size:.86em;line-height:1.35;padding:4px 1px;";
  empty.createDiv({ text: runtimeT(key) });
  const action = empty.createEl("button", { text: runtimeT(actionKey) });
  action.type = "button";
  action.style.cssText = "height:27px;padding:0 9px;border-radius:8px;border:1px solid color-mix(in srgb,var(--background-modifier-border) 80%,rgba(99,102,241,.22));background:color-mix(in srgb,var(--background-primary) 92%,rgba(99,102,241,.08));color:var(--text-muted);font-size:.82em;font-weight:650;cursor:pointer;";
  const targetPath = pathText || habitRegistryPath;
  const actionKind = String(options.kind || "open-habit-registry");
  markHabitActionTarget(action, { kind: actionKind, path: targetPath });
  action.onclick = async () => {
    action.disabled = true;
    setHabitActionState(action, "pending");
    try {
      const result = typeof options.run === "function"
        ? await options.run(targetPath)
        : await openFilePath(targetPath);
      if (result === false) throw new Error(`Habit registry unavailable: ${targetPath}`);
      setHabitActionState(action, "ok");
      return true;
    } catch (error) {
      const message = String(error?.message || error);
      setHabitActionState(action, "failed", message);
      if (options.failureKey) {
        try { new Notice(runtimeT(options.failureKey), 2600); } catch (_) {}
      }
      return false;
    } finally {
      action.disabled = false;
    }
  };
  return empty;
};
const previousDateStr = (ds) => {
  const m = String(ds || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() - 1);
  return toDateStr(d);
};
const normalizeClockValue = (value) => {
  const m = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "";
  const h = Math.max(0, Math.min(23, Number(m[1])));
  const mm = Math.max(0, Math.min(59, Number(m[2])));
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};
const getSleepStartParts = (value) => {
  const m = String(value || "").trim().match(/^(\d{4}-\d{2}-\d{2})(?:[ T]+(\d{1,2}):(\d{2}))?/);
  if (!m || m[2] == null) return null;
  return { date: m[1], time: normalizeClockValue(`${m[2]}:${m[3]}`), minutes: Number(m[2]) * 60 + Number(m[3]) };
};
const dateTimeToText = (value) => {
  if (!value) return "";
  try {
    if (typeof value.toFormat === "function") return value.toFormat("yyyy-MM-dd HH:mm");
  } catch (_) {}
  return String(value || "");
};
const getSleepHabitDate = (startValue) => {
  const p = getSleepStartParts(startValue);
  if (!p) return "";
  if (p.minutes >= 18 * 60) return p.date;
  if (p.minutes <= 12 * 60) return previousDateStr(p.date);
  return "";
};
const eveningMinutes = (clock) => {
  const t = normalizeClockValue(clock);
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  const minutes = h * 60 + m;
  return minutes <= 12 * 60 ? minutes + 24 * 60 : minutes;
};
const clockMinutes = (clock) => {
  const t = normalizeClockValue(clock);
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const isSleepBeforeTarget = (value, target = "00:30") => {
  const actual = eveningMinutes(value);
  const limit = eveningMinutes(target || "00:30");
  return actual != null && limit != null && actual <= limit;
};
const addDays = (dateStr, days) => {
  const m = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() + Number(days || 0));
  return toDateStr(d);
};
const minutesBetween = (startClock, endClock) => {
  const start = eveningMinutes(startClock);
  const endRaw = eveningMinutes(endClock);
  if (start == null || endRaw == null) return 0;
  let end = endRaw;
  if (end <= start) end += 24 * 60;
  return Math.max(0, end - start);
};
const buildSleepTimelineLine = ({ date, start = "23:30", end = "07:00", target = "00:30", completed = false } = {}) => {
  const d = String(date || "").trim();
  const startClock = normalizeClockValue(start) || "23:30";
  const endClock = normalizeClockValue(end) || "07:00";
  const startRaw = clockMinutes(startClock);
  const endRaw = clockMinutes(endClock);
  const startDate = startRaw != null && startRaw <= 12 * 60 ? addDays(d, 1) : d;
  const dueDate = endRaw != null && startRaw != null && endRaw <= startRaw ? addDays(startDate, 1) : startDate;
  const duration = minutesBetween(startClock, endClock) || 450;
  return `- [${completed ? "x" : " "}] 睡眠 [start:: ${startDate} ${startClock}] [due:: ${dueDate} ${endClock}] [duration_min:: ${duration}] #tl/sleep`;
};
const getDailyNotePath = (dateStr) => `${diaryRoot}/${String(dateStr || "").slice(0, 4)}/${dateStr}.md`;
const ensureParentFolder = async (path) => {
  const normalized = normPath(path);
  const slash = normalized.lastIndexOf("/");
  if (slash <= 0) return;
  const parts = normalized.slice(0, slash).split("/").filter(Boolean);
  let cursor = "";
  for (const part of parts) {
    cursor = cursor ? `${cursor}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(cursor)) {
      try {
        await app.vault.createFolder(cursor);
      } catch (_) {}
    }
  }
};
const ensureHabitFileWithSeed = async (path, seed) => {
  const normalized = String(path || "").replace(/[\\]+/g, "/").replace(/^\/+/, "").trim();
  let file = app.vault.getAbstractFileByPath(normalized);
  if (file) return file;
  await ensureParentFolder(normalized);
  try {
    return await app.vault.create(normalized, String(seed || ""));
  } catch (error) {
    const message = String(error?.message || error || "");
    if (!/File already exists|already exists/i.test(message)) throw error;
    file = app.vault.getAbstractFileByPath(normalized);
    if (!file) {
      await Promise.resolve();
      file = app.vault.getAbstractFileByPath(normalized);
    }
    if (!file) throw new Error(`Habit file unavailable after concurrent create: ${normalized}`);
    return file;
  }
};
const insertLineIntoTodayTasks = (content, line) => {
  const text = String(content || "");
  const lines = text.split("\n");
  let heading = lines.findIndex((ln) => /^###\s*今日任务\s*$/.test(String(ln || "").trim()));
  if (heading < 0) {
    const todoIdx = lines.findIndex((ln) => /^##\s*待办\s*$/.test(String(ln || "").trim()));
    if (todoIdx >= 0) {
      lines.splice(todoIdx + 1, 0, "", "### 今日任务", "", line);
      return lines.join("\n").replace(/\n{3,}/g, "\n\n");
    }
    return `${text.trimEnd()}\n\n## 待办\n\n### 今日任务\n\n${line}\n`;
  }
  let insertAt = lines.length;
  for (let i = heading + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      insertAt = i;
      break;
    }
  }
  while (insertAt > heading + 1 && String(lines[insertAt - 1] || "").trim() === "") insertAt--;
  lines.splice(insertAt, 0, line);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
};
const upsertSleepTimelineTask = async ({ date, start, end, target, pathHint = "" }) => {
  const path = normPath(pathHint || getDailyNotePath(date));
  const line = buildSleepTimelineLine({ date, start, end, target });
  const file = await ensureHabitFileWithSeed(path, `## 待办\n\n### 今日任务\n\n${line}\n`);
  const transform = (raw) => {
    const lines = String(raw || "").split("\n");
    let updated = false;
    for (let i = 0; i < lines.length; i++) {
      const src = String(lines[i] || "");
      if (!/#tl\/sleep\b/i.test(src)) continue;
      const rawStart = getInlineField(src, "start");
      const sleepDate = getSleepHabitDate(rawStart);
      if (sleepDate !== date) continue;
      const completed = /^\s*-\s+\[[xX]\]/.test(src);
      lines[i] = buildSleepTimelineLine({ date, start, end, target, completed });
      updated = true;
      break;
    }
    return updated ? lines.join("\n") : insertLineIntoTodayTasks(raw, line);
  };
  if (typeof app.vault.process === "function") {
    await app.vault.process(file, transform);
  } else {
    const raw = await app.vault.read(file);
    const next = transform(raw);
    if (next !== raw) await app.vault.modify(file, next);
  }
  scheduleRefresh();
  return true;
};
const REFRESH_KEY = "__dashboard_refresh_timer_habit";
const scheduleRefresh = (delay = 140) => {
  try {
    if (bridge.refresh?.requestRefresh) {
      bridge.refresh.requestRefresh("home", "habit-registry-write");
      return;
    }
    const g = globalThis;
    if (g[REFRESH_KEY]) clearTimeout(g[REFRESH_KEY]);
    g[REFRESH_KEY] = setTimeout(() => {
      g[REFRESH_KEY] = null;
      try { globalThis.__noriaHomeRefreshBus?.emit?.("habits", 20); } catch (_) {}
    }, delay);
  } catch (_) {}
};

const getManagerUiKit = () => globalThis?.dashboardCore?.components?.ui?.managerPanel || globalThis?.__noriaManagerUiKit || null;

const makeOverlayForm = (title, fields, onSubmit) => {
  const ui = getManagerUiKit();
  if (ui?.openPanel) {
    const inputs = {};
    let firstInput = null;
    ui.openPanel({
      title,
      size: "sm",
      render: ({ body, footer, close }) => {
        fields.forEach((f) => {
          const row = body.appendChild(document.createElement("label"));
          row.style.cssText = "display:flex;flex-direction:column;gap:5px;margin:0 0 9px 0;";
          const lb = row.appendChild(document.createElement("span"));
          lb.textContent = f.label;
          lb.style.cssText = "font-size:.78em;color:var(--text-muted);";
          const ip = ui.input({ value: f.value || "", placeholder: f.placeholder || "" });
          ip.style.width = "100%";
          row.appendChild(ip);
          inputs[f.key] = ip;
          if (!firstInput) firstInput = ip;
        });
        const cancel = ui.button(runtimeT("runtime.common.cancel"), "neutral");
        const ok = ui.button(runtimeT("runtime.common.save"), "primary");
        footer.append(cancel, ok);
        cancel.onclick = close;
        const runSubmit = async () => {
          const data = Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, String(v.value || "").trim()]));
          const done = await onSubmit(data);
          if (done) close();
        };
        ok.onclick = () => runSubmit();
        Object.values(inputs).forEach((ip) => {
          ip.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter") {
              ev.preventDefault();
              runSubmit();
            }
          });
        });
      }
    });
    setTimeout(() => firstInput?.focus(), 0);
    return;
  }
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(15,23,42,.35);z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px;";
  const panel = document.createElement("div");
  panel.style.cssText =
    "width:min(420px,92vw);background:var(--background-primary);border:1px solid rgba(99,102,241,.24);border-radius:12px;box-shadow:0 12px 34px rgba(15,23,42,.3);padding:12px 12px 10px;";
  overlay.appendChild(panel);
  const h = document.createElement("div");
  h.textContent = title;
  h.style.cssText = "font-size:.95em;font-weight:760;color:var(--text-normal);margin:0 0 10px 0;";
  panel.appendChild(h);
  const inputs = {};
  fields.forEach((f) => {
    const row = document.createElement("label");
    row.style.cssText = "display:flex;flex-direction:column;gap:4px;margin:0 0 8px 0;";
    const lb = document.createElement("span");
    lb.textContent = f.label;
    lb.style.cssText = "font-size:.78em;color:var(--text-muted);";
    const ip = document.createElement("input");
    ip.type = "text";
    ip.value = f.value || "";
    ip.placeholder = f.placeholder || "";
    ip.style.cssText =
      "height:30px;border-radius:8px;border:1px solid rgba(99,102,241,.26);background:var(--background-primary);color:var(--text-normal);padding:0 8px;font-size:.86em;outline:none;";
    row.append(lb, ip);
    panel.appendChild(row);
    inputs[f.key] = ip;
  });
  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;justify-content:flex-end;gap:8px;margin-top:8px;";
  const cancel = document.createElement("button");
  cancel.textContent = runtimeT("runtime.common.cancel");
  cancel.style.cssText = "height:30px;padding:0 12px;border-radius:8px;border:1px solid rgba(99,102,241,.22);background:transparent;cursor:pointer;";
  const ok = document.createElement("button");
  ok.textContent = runtimeT("runtime.common.save");
  ok.style.cssText =
    "height:30px;padding:0 14px;border-radius:8px;border:1px solid rgba(67,56,202,.35);background:rgba(99,102,241,.14);cursor:pointer;";
  actions.append(cancel, ok);
  panel.appendChild(actions);
  const close = () => overlay.remove();
  cancel.onclick = close;
  overlay.onclick = (ev) => { if (ev.target === overlay) close(); };
  const runSubmit = async () => {
    const data = Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, String(v.value || "").trim()]));
    const done = await onSubmit(data);
    if (done) close();
  };
  ok.onclick = () => runSubmit();
  Object.values(inputs).forEach((ip) => {
    ip.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        runSubmit();
      }
    });
  });
  document.body.appendChild(overlay);
  const first = fields[0]?.key;
  if (first && inputs[first]) setTimeout(() => inputs[first].focus(), 0);
};

const updateBulletSection = (text, title, updater) => {
  const resolvedTitle = existingHabitSectionTitle(text, title);
  const escaped = String(resolvedTitle || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(##\\s*${escaped}\\s*\\n)([\\s\\S]*?)(?=\\n##\\s|$)`);
  return String(text || "").replace(re, (_, head, body) => {
    const items = String(body || "")
      .split("\n")
      .map((x) => x.trim())
      .filter((x) => /^-\s+(?!\[[ xX]\])/.test(x) && x !== "- （空）" && !/^-\s*\(?\s*empty\s*\)?$/i.test(x))
      .map((x) => x.replace(/^-\s+/, "").trim())
      .filter(Boolean);
    const next = updater(items) || [];
    const rows = next.length ? next.map((x) => `- ${x}`) : [habitSectionsUseChinese ? "- （空）" : "- (empty)"];
    return `${head}\n${rows.join("\n")}\n`;
  });
};

const updateCycleTaskSection = (text, updaterLines) => {
  const src = String(text || "");
  const title = existingHabitSectionTitle(src, "循环任务源（每日）");
  const escaped = String(title || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(##\\s*${escaped}\\s*\\n)([\\s\\S]*?)(?=\\n##\\s|$)`);
  if (re.test(src)) {
    return src.replace(re, (_, head, body) => {
      const lines = String(body || "").split("\n");
      const next = updaterLines(lines) || lines;
      return `${head}${next.join("\n")}`;
    });
  }
  const next = updaterLines([]) || [];
  const block = [`## ${title}`, ...next].join("\n").replace(/\n{3,}/g, "\n\n");
  return `${src.replace(/\s*$/, "")}\n\n${block}\n`;
};

const sanitizeHabitRegistry = (src) => {
  let text = migrateHabitStatusTags(String(src || ""));
  text = updateBulletSection(text, "打卡中的习惯", (items) => {
    const seen = new Set();
    const next = [];
    for (const item of items) {
      const cfg = inferHabitConfig(item);
      if (!cfg.name || seen.has(cfg.name)) continue;
      seen.add(cfg.name);
      next.push(serializeHabitConfig(cfg) || cfg.name);
    }
    return next;
  });
  const pausedTitle = "暂停的习惯";
  const resolvedPausedTitle = existingHabitSectionTitle(text, pausedTitle);
  const escapedPausedTitle = String(resolvedPausedTitle || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pausedRe = new RegExp(`(##\\s*${escapedPausedTitle}\\s*\\n)([\\s\\S]*?)(?=\\n##\\s|$)`);
  const m = text.match(pausedRe);
  if (!m) return text;
  const body = String(m[2] || "");
  const rawLines = body.split("\n").map((x) => x.trim()).filter(Boolean);
  const pausedBullets = rawLines
    .filter((x) => /^-\s+(?!\[[ xX]\])/.test(x) && x !== "- （空）" && !/^-\s*\(?\s*empty\s*\)?$/i.test(x))
    .map((x) => serializeHabitConfig(inferHabitConfig(x.replace(/^-\s+/, ""))))
    .filter(Boolean);
  const misplacedTasks = rawLines.filter((x) => /^-\s+\[[ xX]\]\s+/.test(x));
  const pausedRows = pausedBullets.length ? pausedBullets.map((x) => `- ${x}`) : [habitSectionsUseChinese ? "- （空）" : "- (empty)"];
  text = text.replace(pausedRe, (_, head) => `${head}\n${pausedRows.join("\n")}\n`);
  if (misplacedTasks.length) {
    text = updateCycleTaskSection(text, (lines) => {
      const kept = (lines || []).filter((ln) => String(ln || "").trim() !== "");
      const exists = new Set(kept.map((ln) => String(ln || "").trim()));
      const toAdd = misplacedTasks.filter((ln) => !exists.has(ln));
      return [...kept, ...toAdd, ""];
    });
  }
  return text;
};

const modifyHabitRegistry = async (mutator) => {
  const normalized = normPath(habitRegistryPath);
  const f = await ensureHabitFileWithSeed(normalized, habitRegistryTemplate());
  let changed = false;
  const transform = (raw) => {
    const source = String(raw || "");
    const next = String(mutator(source) ?? source);
    changed = next !== source;
    return next;
  };
  if (typeof app.vault.process === "function") {
    await app.vault.process(f, transform);
  } else {
    const raw = await app.vault.read(f);
    const next = transform(raw);
    if (changed) await app.vault.modify(f, next);
  }
  if (changed) scheduleRefresh();
  return true;
};

const findHabitConfigInRegistry = (src, habitName) => {
  const key = canonicalHabitName(habitName);
  const sections = ["打卡中的习惯", "暂停的习惯", "已养成习惯"];
  for (const title of sections) {
    const hit = getSectionHabitConfigs(src, title).find((cfg) => cfg.name === key);
    if (hit) return hit;
  }
  return inferHabitConfig(habitName);
};

const sameHabit = (lineOrName, key) => canonicalHabitName(lineOrName) === key;

const buildHabitTaskLine = ({ config, date, done = false, value = "", target = "", unit = "" }) => {
  const cfg = inferHabitConfig(config?.name ? serializeHabitConfig(config) : config || "");
  const name = cfg.name || normalizeHabit(config?.name || "");
  const type = String(cfg.type || "").trim();
  const unitVal = String(unit || cfg.unit || "").trim();
  const valueVal = String(value || "").trim();
  const parts = [`- [${done ? "x" : " "}] ${name} #habit #active`, `[due:: ${date}]`];
  if (done) parts.push(`[completion:: ${date}]`);
  if (type) parts.push(`[type:: ${type}]`);
  if (valueVal) parts.push(`[value:: ${valueVal}]`);
  if (unitVal) parts.push(`[unit:: ${unitVal}]`);
  return parts.join(" ");
};

const findHabitRecordInLines = (lines, name, date) => {
  const key = canonicalHabitName(name);
  for (let i = 0; i < lines.length; i++) {
    const line = String(lines[i] || "");
    if (!/^\s*-\s+\[[ xX]\]\s+/.test(line)) continue;
    if (!/(^|\s)#habit\b/i.test(line)) continue;
    if (canonicalHabitName(line) !== key) continue;
    const ds = getHabitRecordDate({ text: line.replace(/^\s*-\s+\[[ xX]\]\s+/, "") });
    if (ds === date) {
      return {
        index: i,
        line,
        completed: /^\s*-\s+\[[xX]\]\s+/.test(line),
        fields: parseInlineFields(line)
      };
    }
  }
  return null;
};

const writeHabitRecord = async ({ config, date, done, value = "", target = "", unit = "" }) => {
  const cfg = inferHabitConfig(config?.name ? serializeHabitConfig(config) : config || "");
  if (!cfg.name || !date) return false;
  return modifyHabitRegistry((src) =>
    updateCycleTaskSection(src, (lines) => {
      const kept = [...lines];
      const hit = findHabitRecordInLines(kept, cfg.name, date);
      const nextLine = buildHabitTaskLine({ config: cfg, date, done, value, target, unit });
      if (hit) {
        kept[hit.index] = nextLine;
        return kept;
      }
      return [...kept.filter((ln, i, arr) => !(i === arr.length - 1 && String(ln || "").trim() === "")), nextLine, ""];
    })
  );
};

const deleteHabitRecord = async ({ config, date }) => {
  const cfg = inferHabitConfig(config?.name ? serializeHabitConfig(config) : config || "");
  if (!cfg.name || !date) return false;
  return modifyHabitRegistry((src) =>
    updateCycleTaskSection(src, (lines) => {
      const hit = findHabitRecordInLines(lines, cfg.name, date);
      if (!hit) return lines;
      return lines.filter((_, idx) => idx !== hit.index);
    })
  );
};

const saveHabitConfig = async (originalName, nextConfig) => {
  const key = canonicalHabitName(originalName);
  const cfg = inferHabitConfig(serializeHabitConfig(nextConfig));
  if (!key || !cfg.name) return false;
  return modifyHabitRegistry((src) =>
    updateBulletSection(src, "打卡中的习惯", (items) => {
      let replaced = false;
      const next = items.map((item) => {
        if (!sameHabit(item, key)) return item;
        replaced = true;
        return serializeHabitConfig(cfg);
      });
      return replaced ? next : [...next, serializeHabitConfig(cfg)];
    })
  );
};

const pauseHabit = async (habitName) => {
  const key = canonicalHabitName(habitName);
  if (!key) return false;
  return modifyHabitRegistry((src) => {
    let t = src;
    const cfg = findHabitConfigInRegistry(src, key);
    const serialized = serializeHabitConfig(cfg) || key;
    t = updateBulletSection(t, "打卡中的习惯", (items) => items.filter((x) => !sameHabit(x, key)));
    t = updateBulletSection(t, "已养成习惯", (items) => items.filter((x) => !sameHabit(x, key)));
    t = updateBulletSection(t, "暂停的习惯", (items) => {
      const kept = items.filter((x) => !sameHabit(x, key));
      return [...kept, serialized];
    });
    t = updateCycleTaskSection(t, (lines) =>
      lines.map((ln) => {
        if (!/^\s*-\s+\[[ xX]\]\s+/.test(ln)) return ln;
        if (!sameHabit(ln, key)) return ln;
        let out = migrateHabitStatusTags(ln).replace(/#active\b/gi, "").replace(/#paused\b/gi, "");
        out = `${out} #paused`.replace(/\s{2,}/g, " ").trim();
        return out;
      })
    );
    return t;
  });
};

const finishHabit = async (habitName) => {
  const key = canonicalHabitName(habitName);
  if (!key) return false;
  return modifyHabitRegistry((src) => {
    let t = src;
    const cfg = findHabitConfigInRegistry(src, key);
    const serialized = serializeHabitConfig(cfg) || key;
    t = updateBulletSection(t, "打卡中的习惯", (items) => items.filter((x) => !sameHabit(x, key)));
    t = updateBulletSection(t, "暂停的习惯", (items) => items.filter((x) => !sameHabit(x, key)));
    t = updateBulletSection(t, "已养成习惯", (items) => {
      const kept = items.filter((x) => !sameHabit(x, key));
      return [...kept, serialized];
    });
    t = updateCycleTaskSection(t, (lines) =>
      lines.map((ln) => {
        if (!/^\s*-\s+\[[ xX]\]\s+/.test(ln)) return ln;
        if (!sameHabit(ln, key)) return ln;
        let out = ln
          .replace(/#active\b/gi, "")
          .replace(/#paused\b/gi, "")
          .replace(/#done\b/gi, "");
        out = `${out} #paused #done`.replace(/\s{2,}/g, " ").trim();
        return out;
      })
    );
    return t;
  });
};

const resumeHabit = async (habitName) => {
  const key = canonicalHabitName(habitName);
  if (!key) return false;
  return modifyHabitRegistry((src) => {
    let t = src;
    const cfg = findHabitConfigInRegistry(src, key);
    const serialized = serializeHabitConfig(cfg) || key;
    t = updateBulletSection(t, "暂停的习惯", (items) => items.filter((x) => !sameHabit(x, key)));
    t = updateBulletSection(t, "已养成习惯", (items) => items.filter((x) => !sameHabit(x, key)));
    t = updateBulletSection(t, "打卡中的习惯", (items) => {
      const kept = items.filter((x) => !sameHabit(x, key));
      return [...kept, serialized];
    });
    let found = false;
    t = updateCycleTaskSection(t, (lines) =>
      lines.map((ln) => {
        if (!/^\s*-\s+\[[ xX]\]\s+/.test(ln)) return ln;
        if (!sameHabit(ln, key)) return ln;
        found = true;
        let out = ln
          .replace(/#active\b/gi, "")
          .replace(/#paused\b/gi, "")
          .replace(/#done\b/gi, "");
        out = `${out} #active`.replace(/\s{2,}/g, " ").trim();
        return out;
      })
    );
    if (!found) {
      t = updateCycleTaskSection(t, (lines) => {
        const taskLine = buildHabitTaskLine({ config: cfg, date: todayKey, done: false });
        return [...lines.filter((ln, i, arr) => !(i === arr.length - 1 && ln.trim() === "")), taskLine, ""];
      });
    }
    return t;
  });
};

const openHabitStatusPanel = async () => {
  const ui = getManagerUiKit();
  const mkPanelBtn = (text, variant = "neutral") => {
    if (ui?.button) return ui.button(text, variant);
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    const styles = {
      neutral: "height:24px;padding:0 9px;border-radius:8px;border:1px solid rgba(148,163,184,.28);background:rgba(241,245,249,.72);color:var(--text-muted);font-size:.75em;cursor:pointer;",
      primary: "height:24px;padding:0 10px;border-radius:8px;border:1px solid rgba(67,56,202,.3);background:rgba(224,231,255,.76);color:#3730a3;font-size:.75em;cursor:pointer;",
      pause: "height:24px;padding:0 10px;border-radius:8px;border:1px solid rgba(217,119,6,.35);background:rgba(254,243,199,.78);color:#92400e;font-size:.75em;cursor:pointer;",
      success: "height:24px;padding:0 10px;border-radius:8px;border:1px solid rgba(5,150,105,.35);background:rgba(209,250,229,.82);color:#065f46;font-size:.75em;cursor:pointer;",
      info: "height:24px;padding:0 10px;border-radius:8px;border:1px solid rgba(59,130,246,.3);background:rgba(219,234,254,.75);color:var(--dash-heading-text,var(--text-normal));font-size:.75em;cursor:pointer;"
    };
    b.style.cssText = styles[variant] || styles.neutral;
    return b;
  };
  const overlay = document.createElement("div");
  overlay.style.cssText = ui?.styles?.overlay ||
    "position:fixed;inset:0;background:rgba(15,23,42,.35);z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px;";
  const panel = document.createElement("div");
  panel.className = "dashboard-habit-status-panel";
  panel.style.cssText =
    `width:min(760px, calc(100vw - 28px));max-height:min(84vh,820px);display:flex;flex-direction:column;padding:14px 15px 12px;${ui?.styles?.panel || "background:var(--background-primary);border:1px solid rgba(99,102,241,.22);border-radius:14px;box-shadow:0 12px 34px rgba(15,23,42,.28);"}`;
  overlay.appendChild(panel);
  const head = document.createElement("div");
  head.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 8px 0;";
  const title = document.createElement("div");
  title.textContent = runtimeT("runtime.habits.managerTitle");
  title.style.cssText = "font-size:1.01em;font-weight:800;color:var(--text-normal);";
  const closeBtn = ui?.iconButton ? ui.iconButton("x", "关闭") : mkPanelBtn("×", "neutral");
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
  closeBtn.onclick = close;
  head.append(title, closeBtn);
  panel.appendChild(head);
  const subtitle = document.createElement("div");
  subtitle.textContent = runtimeT("runtime.habits.managerSubtitle");
  subtitle.style.cssText = "font-size:.78em;color:var(--text-muted);margin:0 0 10px 0;line-height:1.38;";
  panel.appendChild(subtitle);
  const tabs = document.createElement("div");
  tabs.style.cssText = "display:flex;gap:6px;margin-bottom:10px;";
  const body = document.createElement("div");
  body.style.cssText = "display:flex;flex-direction:column;gap:0;max-height:min(56vh,520px);overflow:auto;padding-right:2px;min-height:0;";
  panel.append(tabs, body);
  let activeList = [];
  let pausedList = [];
  let doneList = [];
  let currentTab = "active";

  const makeTabBtn = (txt) => {
    if (ui?.button) return ui.button(txt, "stageOff");
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = txt;
    b.style.cssText =
      "height:28px;padding:0 10px;border-radius:9px;border:1px solid rgba(99,102,241,.22);background:color-mix(in srgb,var(--background-primary) 88%, rgba(99,102,241,.08));cursor:pointer;font-size:.8em;color:var(--text-muted);";
    return b;
  };
  const activeTab = makeTabBtn(runtimeT("runtime.habits.active", { count: 0 }));
  const pausedTab = makeTabBtn(runtimeT("runtime.habits.paused", { count: 0 }));
  const doneTab = makeTabBtn(runtimeT("runtime.habits.done", { count: 0 }));
  tabs.append(activeTab, pausedTab, doneTab);

  const renderList = (kind) => {
    body.innerHTML = "";
    const list = kind === "active" ? activeList : kind === "paused" ? pausedList : doneList;
    if (!list.length) {
      const empty = document.createElement("div");
      empty.textContent = runtimeT("runtime.habits.empty");
      empty.style.cssText = "font-size:.84em;color:var(--text-muted);padding:6px 2px;";
      body.appendChild(empty);
      return;
    }
    list.forEach((cfgRaw) => {
      const cfg = typeof cfgRaw === "string" ? inferHabitConfig(cfgRaw) : cfgRaw;
      const name = cfg.name;
      const row = document.createElement("div");
      const narrow = window.innerWidth < 680;
      row.style.cssText = narrow
        ? "display:flex;flex-direction:column;align-items:stretch;gap:8px;padding:8px 1px;border-bottom:1px solid color-mix(in srgb,var(--background-modifier-border) 58%, transparent);background:transparent;min-width:0;"
        : "display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px 1px;border-bottom:1px solid color-mix(in srgb,var(--background-modifier-border) 58%, transparent);background:transparent;min-width:0;";
      const edit = document.createElement("div");
      edit.style.cssText = narrow
        ? "display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;align-items:center;min-width:0;"
        : "display:grid;grid-template-columns:minmax(150px,1fr) 86px 82px 70px;gap:6px;align-items:center;min-width:0;";
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.value = name;
      nameInput.title = runtimeT("runtime.habits.name");
      const typeSelect = document.createElement("select");
      ["", "number", "sleep"].forEach((value) => {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = value || runtimeT("runtime.habits.normal");
        typeSelect.appendChild(opt);
      });
      typeSelect.value = cfg.type || "";
      typeSelect.title = runtimeT("runtime.habits.type");
      const targetInput = document.createElement("input");
      targetInput.type = "text";
      targetInput.value = cfg.target || "";
      targetInput.placeholder = cfg.type === "sleep" ? "00:30" : runtimeT("runtime.habits.target");
      targetInput.title = runtimeT("runtime.habits.target");
      const unitInput = document.createElement("input");
      unitInput.type = "text";
      unitInput.value = cfg.unit || "";
      unitInput.placeholder = runtimeT("runtime.habits.unit");
      unitInput.title = runtimeT("runtime.habits.unit");
      [nameInput, typeSelect, targetInput, unitInput].forEach((el) => {
        if (ui?.enhanceInput) ui.enhanceInput(el);
        else {
          el.style.cssText =
            "height:26px;border-radius:8px;border:1px solid rgba(99,102,241,.22);background:var(--background-primary);color:var(--text-normal);padding:0 7px;font-size:.78em;min-width:0;box-sizing:border-box;";
        }
        el.style.height = "28px";
        el.style.fontSize = ".8em";
      });
      if (kind !== "active") {
        [nameInput, typeSelect, targetInput, unitInput].forEach((el) => {
          el.disabled = true;
          el.style.opacity = ".72";
        });
      }
      edit.append(nameInput, typeSelect, targetInput, unitInput);
      row.appendChild(edit);
      const act = document.createElement("div");
      act.style.cssText = narrow
        ? "display:flex;gap:6px;align-items:center;justify-content:flex-end;flex-wrap:wrap;"
        : "display:flex;gap:6px;align-items:center;justify-content:flex-end;flex-shrink:0;";
      if (kind === "paused" || kind === "done") {
        const resumeBtn = mkPanelBtn(runtimeT("runtime.common.restore"), "info");
        resumeBtn.onclick = async () => {
          const ok = await resumeHabit(name);
          if (!ok) return new Notice(runtimeT("runtime.habits.noticeRestoreFailed"), 2200);
          await refreshPanel();
        };
        act.appendChild(resumeBtn);
      } else {
        const saveBtn = mkPanelBtn(runtimeT("runtime.common.save"), "primary");
        const pauseBtn = mkPanelBtn(runtimeT("runtime.common.pause"), "pause");
        const doneBtn = mkPanelBtn(runtimeT("runtime.habits.markDone"), "success");
        saveBtn.onclick = async () => {
          const nextCfg = {
            name: nameInput.value,
            type: typeSelect.value,
            target: targetInput.value,
            unit: unitInput.value
          };
          const ok = await saveHabitConfig(name, nextCfg);
          if (!ok) return new Notice(runtimeT("runtime.habits.noticeSaveFailed"), 2200);
          await refreshPanel();
        };
        pauseBtn.onclick = async () => {
          const ok = await pauseHabit(name);
          if (!ok) return new Notice(runtimeT("runtime.habits.noticePauseFailed"), 2200);
          await refreshPanel();
        };
        doneBtn.onclick = async () => {
          const ok = await finishHabit(name);
          if (!ok) return new Notice(runtimeT("runtime.habits.noticeDoneFailed"), 2200);
          await refreshPanel();
        };
        act.append(saveBtn, pauseBtn, doneBtn);
      }
      row.appendChild(act);
      body.appendChild(row);
    });
  };

  const addRow = document.createElement("div");
  const addNarrow = window.innerWidth < 680;
  addRow.style.cssText = addNarrow
    ? "display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-bottom:10px;align-items:center;"
    : "display:grid;grid-template-columns:minmax(150px,1fr) 88px 82px 70px auto;gap:6px;margin-bottom:10px;align-items:center;";
  const addInput = document.createElement("input");
  addInput.type = "text";
  addInput.placeholder = runtimeT("runtime.habits.name");
  if (ui?.enhanceInput) ui.enhanceInput(addInput);
  else addInput.style.cssText =
    "height:28px;border-radius:8px;border:1px solid rgba(99,102,241,.24);padding:0 8px;background:var(--background-primary);color:var(--text-normal);font-size:.82em;outline:none;min-width:0;";
  const addType = document.createElement("select");
  ["", "number", "sleep"].forEach((value) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value || runtimeT("runtime.habits.normal");
    addType.appendChild(opt);
  });
  if (ui?.enhanceInput) ui.enhanceInput(addType);
  else addType.style.cssText = "height:28px;border-radius:8px;border:1px solid rgba(99,102,241,.24);padding:0 6px;background:var(--background-primary);color:var(--text-normal);font-size:.8em;min-width:0;";
  const addTarget = document.createElement("input");
  addTarget.type = "text";
  addTarget.placeholder = runtimeT("runtime.habits.target");
  if (ui?.enhanceInput) ui.enhanceInput(addTarget);
  else addTarget.style.cssText = "height:28px;border-radius:8px;border:1px solid rgba(99,102,241,.24);padding:0 8px;background:var(--background-primary);color:var(--text-normal);font-size:.82em;outline:none;min-width:0;";
  const addUnit = document.createElement("input");
  addUnit.type = "text";
  addUnit.placeholder = runtimeT("runtime.habits.unit");
  if (ui?.enhanceInput) ui.enhanceInput(addUnit);
  else addUnit.style.cssText = addTarget.style.cssText;
  const addSave = mkPanelBtn(runtimeT("runtime.common.add"), "primary");
  const runAdd = async () => {
    const cfg = {
      name: addInput.value,
      type: addType.value,
      target: addTarget.value,
      unit: addUnit.value
    };
    const nm = normalizeHabit(cfg.name);
    if (!nm) return new Notice(runtimeT("runtime.habits.noticeInvalidName"), 2200);
    const ok = await addNewHabit(cfg);
    if (!ok) return new Notice(runtimeT("runtime.habits.noticeAddFailed"), 2200);
    addInput.value = "";
    addTarget.value = "";
    addUnit.value = "";
    await refreshPanel();
  };
  addSave.onclick = runAdd;
  addInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      runAdd();
    }
  });
  addRow.append(addInput, addType, addTarget, addUnit, addSave);
  panel.insertBefore(addRow, tabs);
  const selectTab = (k) => {
    currentTab = k;
    [activeTab, pausedTab, doneTab].forEach((b) => {
      if (ui?.styles?.btn?.stageOff) b.style.cssText = ui.styles.btn.stageOff;
      else {
        b.style.background = "color-mix(in srgb,var(--background-primary) 88%, rgba(99,102,241,.08))";
        b.style.color = "var(--text-muted)";
        b.style.borderColor = "rgba(99,102,241,.22)";
      }
    });
    const cur = k === "active" ? activeTab : k === "paused" ? pausedTab : doneTab;
    if (ui?.styles?.btn?.stageOn) cur.style.cssText = ui.styles.btn.stageOn;
    else {
      cur.style.background = "rgba(99,102,241,.16)";
      cur.style.color = "var(--text-normal)";
      cur.style.borderColor = "rgba(99,102,241,.34)";
    }
    renderList(k);
  };
  const refreshPanel = async () => {
    const latest = await ctx.io.load(habitRegistryPath);
    const safe = sanitizeHabitRegistry(latest || "");
    activeList = getSectionHabitConfigs(safe, "打卡中的习惯");
    pausedList = getSectionHabitConfigs(safe, "暂停的习惯");
    doneList = getSectionHabitConfigs(safe, "已养成习惯");
    activeTab.textContent = runtimeT("runtime.habits.active", { count: activeList.length });
    pausedTab.textContent = runtimeT("runtime.habits.paused", { count: pausedList.length });
    doneTab.textContent = runtimeT("runtime.habits.done", { count: doneList.length });
    if (currentTab === "paused" && !pausedList.length) currentTab = "active";
    if (currentTab === "done" && !doneList.length) currentTab = "active";
    selectTab(currentTab);
  };
  activeTab.onclick = () => selectTab("active");
  pausedTab.onclick = () => selectTab("paused");
  doneTab.onclick = () => selectTab("done");
  await refreshPanel();

  overlay.onclick = (ev) => {
    if (ev.target === overlay) close();
  };
  document.body.appendChild(overlay);
  document.addEventListener("keydown", onEsc, true);
  setTimeout(() => addInput.focus(), 0);
};

const addNewHabit = async (habitInput) => {
  const cfg = inferHabitConfig(typeof habitInput === "string" ? habitInput : serializeHabitConfig(habitInput));
  const key = cfg.name;
  if (!key) return false;
  return modifyHabitRegistry((src) => {
    let t = src;
    let exists = false;
    t = updateBulletSection(t, "打卡中的习惯", (items) => {
      exists = items.some((x) => sameHabit(x, key));
      if (exists) return items;
      return [...items, serializeHabitConfig(cfg) || key];
    });
    if (!exists) {
      t = updateCycleTaskSection(t, (lines) => {
        const taskLine = buildHabitTaskLine({ config: cfg, date: todayKey, done: false });
        return [...lines.filter((ln, i, arr) => !(i === arr.length - 1 && ln.trim() === "")), taskLine, ""];
      });
    }
    return t;
  });
};

const openHabitInlineEditor = (cfg) => {
  const current = inferHabitConfig(serializeHabitConfig(cfg));
  makeOverlayForm(runtimeT("runtime.habits.editParams"), [
    { key: "name", label: runtimeT("runtime.habits.name"), value: current.name || "", placeholder: runtimeT("runtime.habits.name") },
    { key: "type", label: runtimeT("runtime.habits.type"), value: current.type || "", placeholder: "number / sleep / -" },
    { key: "target", label: runtimeT("runtime.habits.target"), value: current.target || "", placeholder: current.type === "sleep" ? "00:30" : "5" },
    { key: "unit", label: runtimeT("runtime.habits.unit"), value: current.unit || "", placeholder: "cups / kcal" }
  ], async (data) => {
    const ok = await saveHabitConfig(current.name, {
      name: data.name,
      type: data.type,
      target: data.target,
      unit: data.unit
    });
    if (!ok) {
      new Notice(runtimeT("runtime.habits.noticeHabitSaveFailed"), 2200);
      return false;
    }
    return true;
  });
};

const openSleepRecordEditor = ({ date, cfg, record, onSaved }) => {
  makeOverlayForm(runtimeT("runtime.habits.recordSleepTitle"), [
    { key: "start", label: runtimeT("runtime.habits.sleepStart"), value: record?.value || "23:30", placeholder: "23:30" },
    { key: "end", label: runtimeT("runtime.habits.sleepEnd"), value: record?.end || "07:00", placeholder: "07:00" },
    { key: "target", label: runtimeT("runtime.habits.sleepTarget"), value: record?.target || cfg?.target || "00:30", placeholder: "00:30" }
  ], async (data) => {
    const start = normalizeClockValue(data.start) || "23:30";
    const end = normalizeClockValue(data.end) || "07:00";
    const target = normalizeClockValue(data.target) || "00:30";
    const ok = await upsertSleepTimelineTask({ date, start, end, target, pathHint: record?.task?._path || "" });
    if (!ok) {
      new Notice(runtimeT("runtime.habits.noticeSleepSaveFailed"), 2200);
      return false;
    }
    if (typeof onSaved === "function") onSaved({ start, end, target });
    return true;
  });
};

const markTaskStatus = async (task, done = true) => {
  try {
    const path = String(task?.path || task?._path || "");
    if (!path) return false;
    const file = app.vault.getAbstractFileByPath(path);
    if (!file) return false;
    const lineNo = Number(task?.line);
    const expectedRaw = String(task?.rawText || task?._rawText || "").replace(/\s+/g, " ").trim();
    const expectedText = String(task?.text || "").replace(/\s+/g, " ").trim();
    let updated = false;
    const applyMutation = (raw) => {
      const source = String(raw || "");
      const lines = source.split("\n");
      const statusMatches = (line) => done
        ? /^\s*[-*]\s*\[\s\]/.test(line)
        : /^\s*[-*]\s*\[[xX]\]/.test(line);
      const taskMatches = (line) => {
        const normalized = String(line || "").replace(/\s+/g, " ").trim();
        if (expectedRaw && normalized === expectedRaw) return true;
        if (!expectedText) return false;
        const body = normalized.replace(/^[-*]\s*\[[^\]]*\]\s*/, "").trim();
        return body === expectedText || body.includes(expectedText);
      };
      const candidates = [];
      for (let i = 0; i < lines.length; i++) {
        if (statusMatches(lines[i]) && taskMatches(lines[i])) candidates.push(i);
      }
      let idx = -1;
      if (!Number.isNaN(lineNo)) {
        const preferred = [lineNo, lineNo - 1].filter((value, index, values) => value >= 0 && values.indexOf(value) === index && candidates.includes(value));
        if (preferred.length === 1) idx = preferred[0];
      }
      if (idx < 0 && candidates.length === 1) idx = candidates[0];
      if (idx < 0) {
        updated = false;
        return source;
      }
      lines[idx] = done
        ? lines[idx].replace(/^(\s*[-*]\s*)\[\s\]/, "$1[x]")
        : lines[idx].replace(/^(\s*[-*]\s*)\[[xX]\]/, "$1[ ]");
      updated = true;
      return lines.join("\n");
    };
    if (typeof app.vault.process === "function") {
      await app.vault.process(file, applyMutation);
    } else {
      const raw = await app.vault.read(file);
      const next = applyMutation(raw);
      if (updated) await app.vault.modify(file, next);
    }
    if (!updated) return false;
    scheduleRefresh();
    return true;
  } catch (e) {
    return false;
  }
};

const contentRaw = await ctx.io.load(habitRegistryPath);
let content = migrateHabitStatusTags(contentRaw || "");
if (!content) {
  renderHabitEmptyAction("runtime.habits.noRegistry", "runtime.habits.initializeRegistry", habitRegistryPath, {
    kind: "initialize-habit-registry",
    failureKey: "runtime.habits.noticeRegistryInitFailed",
    run: async (targetPath) => {
      await ensureHabitFileWithSeed(targetPath, habitRegistryTemplate());
      scheduleRefresh();
      return openFilePath(targetPath);
    }
  });
  return;
}
const entries = getSectionTaskEntries(content, "循环任务源（每日）");
const activeHabitConfigs = getSectionHabitConfigs(content, "打卡中的习惯");
const sourcePage = ctx.page(habitRegistryPath);
const sourceTasks = sourcePage ? (sourcePage.file.tasks || []) : [];

const habitMap = new Map();
const habitConfigMap = new Map();
for (const cfg of activeHabitConfigs) {
  habitConfigMap.set(cfg.name, cfg);
  habitMap.set(cfg.name, {});
}
for (const e of entries) {
  if (!/(^|\s)#habit\b/i.test(String(e.text || ""))) continue;
  if (/#paused\b/i.test(String(e.text || ""))) continue;
  const name = canonicalHabitName(e.text);
  if (!name) continue;
  if (!habitMap.has(name)) continue;
  const fields = parseInlineFields(e.text);
  const recordDate = getHabitRecordDate({ text: e.text });
  if (!inRange(recordDate)) continue;
  const record = {
    done: !!e.completed,
    value: fields.value || "",
    target: fields.target || habitConfigMap.get(name)?.target || "",
    unit: fields.unit || habitConfigMap.get(name)?.unit || "",
    type: fields.type || habitConfigMap.get(name)?.type || ""
  };
  if (record.value || record.target || record.type || record.done) setHabitRecord(habitMap, name, recordDate, record);
  if (e.completed) {
    const doneDate = recordDate || getTaskDate({ text: e.text }, "done") || todayKey;
    setHabitRecord(habitMap, name, doneDate, { ...record, done: true });
  }
}

for (const t of sourceTasks) {
  const txt = String(t?.text || "");
  if (!/(^|\s)#habit\b/i.test(txt)) continue;
  if (/#paused\b/i.test(txt)) continue;
  const name = canonicalHabitName(txt);
  if (!name || !habitMap.has(name)) continue;
  const ds = getHabitRecordDate(t);
  if (!ds) continue;
  const fields = parseInlineFields(txt);
  const cfg = habitConfigMap.get(name) || {};
  const record = {
    done: !!t.completed,
    value: fields.value || (t?.value != null ? String(t.value) : ""),
    target: fields.target || (t?.target != null ? String(t.target) : "") || cfg.target || "",
    unit: fields.unit || (t?.unit != null ? String(t.unit) : "") || cfg.unit || "",
    type: fields.type || (t?.type != null ? String(t.type) : "") || cfg.type || "",
    task: { ...t, _path: habitRegistryPath }
  };
  setHabitRecord(habitMap, name, ds, record);
}

const sleepCfg = activeHabitConfigs.find((x) => x.type === "sleep" || /睡/.test(x.name));
if (sleepCfg && habitMap.has(sleepCfg.name)) {
  const diaryPages = habitWeekToArray(bridge.runtime?.pagesForManagedPath?.("diaryRoot", ctx)).filter((p) => {
    const n = String(p.file?.name || "").replace(".md", "");
    return /^\d{4}-\d{2}-\d{2}$/.test(n) || /^\d{8}$/.test(n);
  });
  for (const p of diaryPages) {
    for (const t of p.file?.tasks || []) {
      const txt = String(t?.text || "");
      if (!/#tl\/sleep\b/i.test(txt)) continue;
      const rawStart = getInlineField(txt, "start") || dateTimeToText(t?.start);
      const rawDue = getInlineField(txt, "due") || dateTimeToText(t?.due);
      const startParts = getSleepStartParts(rawStart);
      const dueParts = getSleepStartParts(rawDue);
      const habitDate = getSleepHabitDate(rawStart);
      if (!startParts || !habitDate || !inRange(habitDate)) continue;
      const fields = parseInlineFields(txt);
      const target = fields.target || sleepCfg.target || "00:30";
      habitMap.get(sleepCfg.name)[habitDate] = {
        done: isSleepBeforeTarget(startParts.time, target),
        value: startParts.time,
        end: dueParts?.time || "",
        target,
        type: "sleep",
        source: "tl",
        task: { ...t, _path: p.file?.path || "" }
      };
    }
  }
}

const habits = [...habitMap.keys()].sort((a, b) => a.localeCompare(b, "zh-CN"));
if (habits.length === 0) {
  renderHabitEmptyAction("runtime.habits.noActive", "runtime.habits.noActiveAction", habitRegistryPath);
  return;
}

const syncSleepHabitsFromTimeline = async () => {
  scheduleRefresh(20);
  new Notice(runtimeT("runtime.habits.noticeSleepSyncRequested"), 1600);
  return true;
};

const wrap = host.createDiv();
wrap.addClass("dashboard-habit-21-shell");
wrap.style.cssText =
  "height:100%;display:flex;flex-direction:column;overflow:visible;padding:0;border:0;background:transparent;box-shadow:none;box-sizing:border-box;";
habitActionMirror = wrap;
setHabitAttr(wrap, "data-noria-action-source", "home-habit-checkin");
mirrorHabitAction();

const todayTokenByHabit = new Map();
const todayChipByHabit = new Map();
const todayItems = habits.map((name) => ({
  name,
  cfg: habitConfigMap.get(name) || { name },
  records: habitMap.get(name) || {}
}));
const todayStrip = wrap.createDiv();
todayStrip.addClass("dashboard-habit-today-strip");
const todayHead = todayStrip.createDiv();
todayHead.addClass("dashboard-habit-today-head");
const todayTitle = todayHead.createDiv({ text: runtimeT("runtime.home.habits.todayTitle") });
todayTitle.addClass("dashboard-habit-today-title");
const todaySummary = todayHead.createDiv();
todaySummary.addClass("dashboard-habit-today-summary");
const todayList = todayStrip.createDiv();
todayList.addClass("dashboard-habit-today-list");
const syncTodayStrip = () => {
  let doneCount = 0;
  todayItems.forEach((item) => {
    const rec = item.records[todayKey] || null;
    const isDone = !!rec?.done;
    const label = formatHabitTodayLabel(item.cfg, rec) || item.name;
    const chip = todayChipByHabit.get(item.name);
    if (!chip) return;
    if (isDone) doneCount += 1;
    chip.textContent = label;
    toggleClass(chip, "is-done", isDone);
    setHabitAttr(chip, "aria-pressed", isDone ? "true" : "false");
    setHabitAttr(chip, "data-noria-habit-today-state", isDone ? "done" : "pending");
    setHabitAttr(chip, "data-noria-habit-today-label", label);
    setHabitAttr(chip, "title", runtimeT(
      item.cfg.type === "number"
        ? "runtime.habits.recordValueForDate"
        : (item.cfg.type === "sleep" ? "runtime.habits.recordSleepForDate" : "runtime.habits.toggleRecord"),
      { name: item.name, date: todayKey }
    ));
  });
  const total = todayItems.length;
  const pending = Math.max(0, total - doneCount);
  setHabitAttr(todayStrip, "data-noria-habit-today-total", String(total));
  setHabitAttr(todayStrip, "data-noria-habit-today-done", String(doneCount));
  setHabitAttr(todayStrip, "data-noria-habit-today-pending", String(pending));
  todaySummary.setText(pending === 0
    ? runtimeT("runtime.home.habits.todayAllDone")
    : runtimeT("runtime.home.habits.todayPending", { count: pending }));
};
todayItems.forEach((item) => {
  const chip = todayList.createEl("button");
  chip.type = "button";
  chip.addClass("dashboard-habit-today-chip");
  setHabitAttr(chip, "data-noria-action-source", "home-habit-today-strip");
  setHabitAttr(chip, "data-noria-action-kind", "focus-habit-today-token");
  setHabitAttr(chip, "data-noria-action-target", item.name);
  setHabitAttr(chip, "data-noria-action-target-date", todayKey);
  setHabitAttr(chip, "data-noria-action-target-path", habitRegistryPath);
  setHabitAttr(chip, "data-noria-habit-name", item.name);
  setHabitAttr(chip, "data-noria-habit-date", todayKey);
  setHabitAttr(chip, "data-noria-habit-type", item.cfg.type || "check");
  chip.onclick = async (ev) => {
    ev.preventDefault();
    const token = todayTokenByHabit.get(item.name);
    if (!token || typeof token.onclick !== "function") return;
    const result = token.onclick();
    if (result && typeof result.then === "function") await result;
    setTimeout(syncTodayStrip, 0);
  };
  todayChipByHabit.set(item.name, chip);
});
const grid = wrap.createDiv();
grid.addClass("dashboard-habit-21-grid");
grid.style.setProperty("--habit-days", String(dates.length));
grid.style.setProperty("--habit-today-index", String(Math.max(0, dates.indexOf(todayKey))));

const headerRow = grid.createDiv();
headerRow.addClass("dashboard-habit-21-row");
headerRow.addClass("dashboard-habit-21-header");
const nameHead = headerRow.createDiv();
nameHead.addClass("dashboard-habit-21-name");
nameHead.addClass("dashboard-habit-21-head-cell");
const headerTrack = headerRow.createDiv();
headerTrack.addClass("dashboard-habit-21-track");
headerTrack.addClass("dashboard-habit-21-head-track");
const headerLineEarly = headerTrack.createDiv();
headerLineEarly.addClass("dashboard-habit-21-line");
headerLineEarly.addClass("dashboard-habit-21-line--early");
const headerLineRecent = headerTrack.createDiv();
headerLineRecent.addClass("dashboard-habit-21-line");
headerLineRecent.addClass("dashboard-habit-21-line--recent");
dates.forEach((ds, idx) => {
  const line = idx < HABIT_COMPACT_FIRST_LINE_DAYS ? headerLineEarly : headerLineRecent;
  const head = line.createDiv({ text: getDayNumber(ds) });
  head.addClass("dashboard-habit-21-head-cell");
  head.addClass("dashboard-habit-21-date-head");
  if (idx === 0 || idx === HABIT_COMPACT_FIRST_LINE_DAYS) head.addClass("is-visual-line-start");
  if (idx === HABIT_COMPACT_FIRST_LINE_DAYS - 1 || idx === dates.length - 1) head.addClass("is-visual-line-end");
  if (isMonthStartDate(ds)) head.addClass("is-month-start");
  if (isWeekendDate(ds)) head.addClass("is-weekend");
  if (ds === todayKey) head.addClass("is-today");
  const wdRaw = weekdayLabels[getWeekdayIndex(ds)] || "";
  const wd = wdRaw && bridge.runtime && typeof bridge.runtime.displayLabel === "function"
    ? bridge.runtime.displayLabel("weekday", wdRaw, wdRaw)
    : wdRaw;
  head.setAttr("title", wd ? runtimeT("runtime.periodic.habits.weekdayTitle", { date: ds, weekday: wd }) : ds);
});

habits.forEach((h) => {
  const row = grid.createDiv();
  row.addClass("dashboard-habit-21-row");
  const cfgForRow = habitConfigMap.get(h) || { name: h };
  const recordMap = habitMap.get(h) || {};
  const streakByDate = new Map(computeStreakCells(recordMap, dates).map((x) => [x.date, x]));
  const nameCell = row.createDiv();
  nameCell.addClass("dashboard-habit-21-name");
  nameCell.addClass("dashboard-habit-21-cell");
  const nameWrap = nameCell.createDiv();
  nameWrap.addClass("dashboard-habit-21-name-wrap");
  const nameEl = document.createElement("button");
  nameEl.type = "button";
  nameEl.className = "dashboard-task-title dashboard-task-title--one-line";
  const refreshNameLabel = () => {
    nameEl.textContent = formatHabitTodayLabel(cfgForRow, recordMap[todayKey] || null);
  };
  refreshNameLabel();
  nameEl.title = runtimeT("runtime.habits.editParams");
  nameEl.style.cssText =
    "border:0;background:transparent;box-shadow:none;padding:0;margin:0;text-align:left;cursor:pointer;min-width:0;font-size:var(--dash-text-row-size,.86em);line-height:var(--dash-text-row-line,1.25);font-weight:var(--habit-name-weight,620);color:var(--habit-name-color);";
  nameEl.onclick = (ev) => {
    ev.preventDefault();
    openHabitInlineEditor(cfgForRow);
  };
  nameWrap.appendChild(nameEl);
  const track = row.createDiv();
  track.addClass("dashboard-habit-21-track");
  const lineEarly = track.createDiv();
  lineEarly.addClass("dashboard-habit-21-line");
  lineEarly.addClass("dashboard-habit-21-line--early");
  const lineRecent = track.createDiv();
  lineRecent.addClass("dashboard-habit-21-line");
  lineRecent.addClass("dashboard-habit-21-line--recent");
  dates.forEach((ds, idx) => {
    const cfg = habitConfigMap.get(h) || { name: h };
    const record = recordMap[ds] || null;
    const type = String(record?.type || cfg.type || "").trim();
    const done = !!record?.done;
    const streak = streakByDate.get(ds) || { date: ds, done, streakStart: done, streakEnd: done, streakCount: done ? 1 : 0 };
    const line = idx < HABIT_COMPACT_FIRST_LINE_DAYS ? lineEarly : lineRecent;
    const cell = line.createDiv();
    cell.addClass("dashboard-habit-21-cell");
    if (idx === 0 || idx === HABIT_COMPACT_FIRST_LINE_DAYS) cell.addClass("is-visual-line-start");
    if (idx === HABIT_COMPACT_FIRST_LINE_DAYS - 1 || idx === dates.length - 1) cell.addClass("is-visual-line-end");
    if (isMonthStartDate(ds)) cell.addClass("is-month-start");
    if (isWeekendDate(ds)) cell.addClass("is-weekend");
    if (ds === todayKey) cell.addClass("is-today");
    const slot = cell.createDiv();
    slot.addClass("dashboard-habit-21-slot");
    const paintStreak = (isDone) => {
      if (!isDone) return { ...streak, done: false, streakStart: false, streakMiddle: false, streakEnd: false, streakCount: 0 };
      return streak.done ? streak : { ...streak, done: true, streakStart: true, streakMiddle: false, streakEnd: true, streakCount: 1 };
    };
    const paintToken = (token, cur, isDone) => {
      const paintedStreak = paintStreak(isDone);
      const hasRecordedValue = !!String(cur?.value || cur?.end || "").trim();
      applyHabitCellState(cell, token, {
        ...paintedStreak,
        done: isDone,
        partial: hasRecordedValue && !isDone,
        today: ds === todayKey,
        weekend: isWeekendDate(ds)
      });
      const text = habitTokenText(paintedStreak, isDone);
      token.textContent = text;
      toggleClass(token, "has-streak-count", !!text);
      if (String(token?.tagName || "").toLowerCase() === "button" && typeof token.setAttr === "function") {
        token.setAttr("aria-pressed", isDone ? "true" : "false");
      }
    };
    const canEdit = ds <= todayKey;
    if (type === "number" && canEdit) {
      const btn = slot.createEl("button");
      btn.type = "button";
      btn.addClass("dashboard-habit-21-token");
      if (ds === todayKey) todayTokenByHabit.set(h, btn);
      const actionLabel = setHabitTokenMeta(btn, { ...cfg, type: "number" }, ds, "runtime.habits.recordValueForDate");
      const applyNumber = () => {
        const cur = recordMap[ds] || null;
        const value = String(cur?.value || "").trim();
        const target = String(cur?.target || cfg.target || "").trim();
        const isDone = !!cur?.done;
        btn.title = value ? `${h}: ${value}${cfg.unit || ""}${target ? ` / ${target}${cfg.unit || ""}` : ""}` : actionLabel;
        paintToken(btn, cur, isDone);
      };
      applyNumber();
      btn.onclick = () => {
        setHabitActionState(btn, "editing");
        mirrorHabitAction({ state: "editing", kind: "record-habit-value", habit: h, date: ds, path: habitRegistryPath });
        slot.innerHTML = "";
        const inputEl = slot.createEl("input");
        inputEl.type = "text";
        inputEl.value = String(recordMap[ds]?.value || cfg.target || "");
        inputEl.addClass("dashboard-habit-21-input");
        let saved = false;
        const finish = async (save) => {
          if (saved) return;
          saved = true;
          const raw = String(inputEl.value || "").trim();
          if (!save) {
            slot.innerHTML = "";
            slot.appendChild(btn);
            applyNumber();
            setHabitActionState(btn, "idle");
            mirrorHabitAction({ state: "idle", kind: "record-habit-value", habit: h, date: ds, path: habitRegistryPath });
            return;
          }
          setHabitActionState(btn, "pending");
          mirrorHabitAction({ state: "pending", kind: "record-habit-value", habit: h, date: ds, path: habitRegistryPath });
          try {
            if (!raw) {
              const ok = await deleteHabitRecord({ config: cfg, date: ds });
              if (!ok) throw new Error("habit record delete failed");
              delete recordMap[ds];
            } else {
              const valueNum = Number(raw);
              const targetVal = String(cfg.target || recordMap[ds]?.target || "").trim();
              const targetNum = Number(targetVal);
              const nextDone = Number.isFinite(valueNum) && Number.isFinite(targetNum) ? valueNum >= targetNum : true;
              const ok = await writeHabitRecord({ config: cfg, date: ds, done: nextDone, value: raw, target: targetVal, unit: cfg.unit || recordMap[ds]?.unit || "" });
              if (!ok) throw new Error("habit record write failed");
              recordMap[ds] = { done: nextDone, value: raw, target: targetVal, unit: cfg.unit || recordMap[ds]?.unit || "", type: "number" };
            }
            setHabitActionState(btn, "ok");
            mirrorHabitAction({ state: "ok", kind: "record-habit-value", habit: h, date: ds, path: habitRegistryPath });
          } catch (error) {
            const message = error?.message || String(error || "habit record save failed");
            setHabitActionState(btn, "failed", message);
            mirrorHabitAction({ state: "failed", kind: "record-habit-value", habit: h, date: ds, path: habitRegistryPath, error: message });
          }
          if (ds === todayKey) {
            refreshNameLabel();
            syncTodayStrip();
          }
          slot.innerHTML = "";
          slot.appendChild(btn);
          applyNumber();
        };
        inputEl.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") {
            ev.preventDefault();
            finish(true);
          } else if (ev.key === "Escape") {
            ev.preventDefault();
            finish(false);
          }
        });
        inputEl.addEventListener("blur", () => finish(true));
        setTimeout(() => inputEl.select(), 0);
      };
    } else if (type === "sleep" && canEdit) {
      const btn = slot.createEl("button");
      btn.type = "button";
      btn.addClass("dashboard-habit-21-token");
      if (ds === todayKey) todayTokenByHabit.set(h, btn);
      const actionLabel = setHabitTokenMeta(btn, { ...cfg, type: "sleep" }, ds, "runtime.habits.recordSleepForDate");
      const applySleep = () => {
        const cur = recordMap[ds] || record || {};
        const hasValue = !!cur.value;
        const isDone = !!cur.done;
        btn.title = hasValue ? `${h}: ${cur.value}${cur.end ? `-${cur.end}` : ""} / ${cur.target || cfg.target || "00:30"}` : actionLabel;
        paintToken(btn, cur, isDone);
      };
      applySleep();
      btn.onclick = () => {
        setHabitActionState(btn, "editing");
        mirrorHabitAction({ state: "editing", kind: "record-habit-sleep", habit: h, date: ds, path: habitRegistryPath });
        try {
          openSleepRecordEditor({
            date: ds,
            cfg,
            record: recordMap[ds] || record || null,
            onSaved: ({ start, end, target }) => {
              recordMap[ds] = {
                done: isSleepBeforeTarget(start, target),
                value: start,
                end,
                target,
                type: "sleep",
                source: "tl"
              };
              applySleep();
              if (ds === todayKey) syncTodayStrip();
              setHabitActionState(btn, "ok");
              mirrorHabitAction({ state: "ok", kind: "record-habit-sleep", habit: h, date: ds, path: habitRegistryPath });
            }
          });
        } catch (error) {
          const message = error?.message || String(error || "habit sleep editor failed");
          setHabitActionState(btn, "failed", message);
          mirrorHabitAction({ state: "failed", kind: "record-habit-sleep", habit: h, date: ds, path: habitRegistryPath, error: message });
        }
      };
    } else if (canEdit) {
      let currentDone = done;
      const btn = slot.createEl("button");
      btn.type = "button";
      btn.addClass("dashboard-habit-21-token");
      if (ds === todayKey) todayTokenByHabit.set(h, btn);
      const actionLabel = setHabitTokenMeta(btn, cfg, ds, "runtime.habits.toggleRecord");
      const applyBtn = () => {
        const cur = recordMap[ds] || record || {};
        const valueText = type === "sleep" && cur.value ? String(cur.value) : "";
        btn.title = valueText ? `${h}: ${valueText} / ${cur.target || cfg.target || "00:30"}` : actionLabel;
        paintToken(btn, cur, currentDone);
      };
      applyBtn();
      btn.onclick = async () => {
        btn.disabled = true;
        btn.textContent = "…";
        const nextDone = !currentDone;
        const targetVal = String(recordMap[ds]?.target || cfg.target || "").trim();
        const valueVal = String(recordMap[ds]?.value || "").trim();
        setHabitActionState(btn, "pending");
        mirrorHabitAction({ state: "pending", kind: "toggle-habit-checkin", habit: h, date: ds, path: habitRegistryPath });
        try {
          const ok = await writeHabitRecord({ config: cfg, date: ds, done: nextDone, value: valueVal, target: targetVal, unit: cfg.unit || recordMap[ds]?.unit || "" });
          if (!ok) throw new Error("habit record write failed");
          currentDone = nextDone;
          recordMap[ds] = { done: currentDone, value: valueVal, target: targetVal, unit: cfg.unit || recordMap[ds]?.unit || "", type: type || cfg.type || "" };
          setHabitActionState(btn, "ok");
          mirrorHabitAction({ state: "ok", kind: "toggle-habit-checkin", habit: h, date: ds, path: habitRegistryPath });
        } catch (error) {
          const message = error?.message || String(error || "habit record write failed");
          setHabitActionState(btn, "failed", message);
          mirrorHabitAction({ state: "failed", kind: "toggle-habit-checkin", habit: h, date: ds, path: habitRegistryPath, error: message });
        }
        applyBtn();
        if (ds === todayKey) syncTodayStrip();
        btn.disabled = false;
      };
    } else {
      const dot = slot.createEl("span");
      dot.addClass("dashboard-habit-21-token");
      paintToken(dot, record, done);
    }
  });
});

syncTodayStrip();

const actionsHost = input?.actionsHost && typeof input.actionsHost.createEl === "function" ? input.actionsHost : null;
const setToolbarIcon = (el, icon, fallback) => {
  el.textContent = fallback;
  try {
    const setter = app?.setIcon || globalThis?.setIcon || (typeof window !== "undefined" ? window.setIcon : null);
    if (typeof setter === "function") {
      el.textContent = "";
      setter(el, icon);
    }
  } catch (_) {}
};
const syncBtn = (actionsHost || wrap).createEl("button");
syncBtn.type = "button";
syncBtn.setAttr("title", runtimeT("runtime.habits.syncSleep"));
syncBtn.setAttr("aria-label", runtimeT("runtime.habits.syncSleep"));
syncBtn.addClass("dashboard-guide-icon-btn");
setToolbarIcon(syncBtn, "refresh-cw", "↻");
if (!actionsHost) {
  syncBtn.style.marginTop = "6px";
  syncBtn.style.alignSelf = "flex-end";
}
syncBtn.onclick = async () => {
  syncBtn.disabled = true;
  const old = syncBtn.innerHTML;
  syncBtn.textContent = "…";
  await syncSleepHabitsFromTimeline();
  syncBtn.innerHTML = old;
  syncBtn.disabled = false;
};
const addBtn = (actionsHost || wrap).createEl("button", { text: "+" });
addBtn.type = "button";
addBtn.setAttr("title", runtimeT("runtime.habits.addHabit"));
addBtn.addClass("dashboard-guide-icon-btn");
addBtn.addClass("dashboard-guide-toolbar-plus");
if (!actionsHost) {
  addBtn.style.marginTop = "6px";
  addBtn.style.alignSelf = "flex-end";
}
addBtn.onclick = () => {
  openHabitStatusPanel();
};
