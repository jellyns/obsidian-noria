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
const requestedHistoryDays = Number(input?.historyDays || bridge.homeSettings?.widgets?.find(widget => widget.id === "habit-history-card")?.props?.historyDays || 21);
const HABIT_WINDOW_DAYS = Math.max(7, Math.min(90, Math.round(requestedHistoryDays) || 21));

const toDateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayKey = bridge.diaryHabits.today();
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
const dates = buildRecentDates(fromDateStr(todayKey), HABIT_WINDOW_DAYS);
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
  const base = { name, id: fields["habit-id"] || "", aliases: fields.aliases || "", recordField: fields["record-field"] || "" };
  for(const key of ["icon","color","weekdays","plan"])if(fields[key])base[key]=fields[key];
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
  if(cfg.id)parts.push(`[habit-id:: ${cfg.id}]`);
  if(cfg.aliases)parts.push(`[aliases:: ${cfg.aliases}]`);
  if(cfg.recordField)parts.push(`[record-field:: ${cfg.recordField}]`);
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

const writeHabitRecord = async ({ config, date, done, value = "", target = "", unit = "", expectedToday = "" }) => {
  const cfg = inferHabitConfig(config?.name ? serializeHabitConfig(config) : config || "");
  if (!cfg.name || !date) return false;
  const result=await bridge.diaryHabits.write({config:{...cfg,target:target || cfg.target,unit:unit || cfg.unit},date,done,value,expectedToday,refresh:false});
  return !!result?.ok;
};

const deleteHabitRecord = async ({ config, date }) => {
  const cfg = inferHabitConfig(config?.name ? serializeHabitConfig(config) : config || "");
  if (!cfg.name || !date) return false;
  return writeHabitRecord({config:cfg,date,done:false});
};

const openHabitStatusPanel = (initial=false) => bridge.diaryHabits.manage(initial);

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

const sleepCfg = activeHabitConfigs.find((x) => x.type === "sleep");
// Date-note records override legacy registry rows, including an explicit withdrawal.
const datedRecords=new Set();
if(bridge.diaryHabits?.load) {
  const days=await Promise.all(dates.map(date=>bridge.diaryHabits.load(date,{registryText:content})));
  for(const day of days) for(const record of day.records) {
    if(!habitMap.has(record.name)) continue;
    habitMap.get(record.name)[record.date]={...record,type:record.type || habitConfigMap.get(record.name)?.type || ""};
    if(record.path !== habitRegistryPath) datedRecords.add(`${record.name}|${record.date}`);
  }
}
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
      if(datedRecords.has(`${sleepCfg.name}|${habitDate}`)) continue;
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

const wrap = host.createDiv({cls:"noria-habit-history"});
const viewKey=String(input?.widgetInstanceId||"habit-history");
const viewState=bridge.diaryHabits.historyViewState?.get(viewKey)||{expanded:false,atRecentEdge:true,scrollLeft:0};
bridge.diaryHabits.historyViewState?.set(viewKey,viewState);
wrap.dataset.expanded=String(viewState.expanded);
const historicalDates=dates.filter(date=>date!==todayKey),decorators=[];
const completeHistory=bridge.diaryHabits.history?await bridge.diaryHabits.history(activeHabitConfigs):{};
const plan=bridge.diaryHabits.plan;
habitActionMirror=wrap;setHabitAttr(wrap,"data-noria-action-source","home-habit-checkin");mirrorHabitAction();
const namesColumn=wrap.createDiv({cls:"noria-habit-names"});
const summary=namesColumn.createDiv({cls:"noria-habit-column-head"});
const scroll=wrap.createDiv({cls:"noria-habit-scroll",attr:{tabindex:"0",role:"region","aria-label":runtimeT("runtime.home.habits.historyRange")}});
const history=scroll.createDiv({cls:"noria-habit-history-grid"});history.style.setProperty("--habit-days",String(dates.length-1));
const historyHeader=history.createDiv({cls:"noria-habit-history-row noria-habit-column-head"});
for(const date of historicalDates)historyHeader.createSpan({text:getDayNumber(date),attr:{title:date}});
const todayColumn=wrap.createDiv({cls:"noria-habit-today"});todayColumn.createDiv({cls:"noria-habit-column-head",text:habitSectionsUseChinese?"今天":"Today"});
const syncSummary=()=>{const scheduled=habits.filter(name=>!plan||plan.due(habitConfigMap.get(name)||{},todayKey));summary.setText(scheduled.length?runtimeT("runtime.home.habits.todayProgress",{done:scheduled.filter(name=>habitMap.get(name)?.[todayKey]?.done).length,total:scheduled.length}):(habitSectionsUseChinese?"今天休息":"Rest day"));};
for(const name of habits){
  const cfg=habitConfigMap.get(name)||{name},visual=plan?.visual(cfg),label=namesColumn.createDiv({cls:"noria-habit-name-cell",attr:{title:name}});
  if(visual)label.style.setProperty("--noria-habit-color",visual.color);
  const picture=label.createSpan({cls:"noria-habit-picture"});bridge.diaryHabits.renderPicture(picture,visual?.icon||"sparkles");
  const words=label.createDiv({cls:"noria-habit-label"});words.createSpan({text:name});const detail=words.createSpan({cls:"noria-habit-streak"});
  const syncDetail=()=>{if(!plan)return;const records={...completeHistory[name],...habitMap.get(name)},s=plan.summary(cfg,records,todayKey);detail.setText(plan.summaryText(s,habitSectionsUseChinese));detail.title=plan.summaryDetail(s,habitSectionsUseChinese);};syncDetail();
  label.setAttribute("role","button");label.tabIndex=0;label.title=habitSectionsUseChinese?`${name} · 编辑习惯`:`${name} · Edit habit`;
  label.onclick=()=>bridge.diaryHabits.manage(cfg.id||name);label.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();label.click();}};
  const historical=history.createDiv({cls:"noria-habit-history-row"}),cells=[];
  const decorate=()=>bridge.diaryHabits.decorateHistory(cells,cfg,{...completeHistory[name],...habitMap.get(name)},todayKey,viewState.expanded);decorators.push(decorate);
  for(const date of dates){
    const recordMap=habitMap.get(name)||{},config=habitConfigMap.get(name)||{name},record=recordMap[date]||null;
    const parent=date===todayKey?todayColumn.createDiv({cls:"noria-habit-today-cell"}):historical.createDiv();
    cells.push({date,parent});
    const render=()=>{parent.empty();bridge.diaryHabits.renderRow({parent,config,record:recordMap[date]||null,compact:true,showValue:date===todayKey,date,
      beforeAct:()=>{if(date===todayKey)bridge.diaryHabits.assertToday(todayKey);},
      onSave:async(done,value)=>{
        setHabitActionState(parent,"pending");mirrorHabitAction({state:"pending",kind:"toggle-habit-checkin",habit:name,date,path:habitRegistryPath});
        try{const current=recordMap[date]||{};const ok=await writeHabitRecord({config:{...config,...(current.type?{type:current.type}:{} )},date,done,value,target:current.target,unit:current.unit,expectedToday:date===todayKey?todayKey:""});
          if(!ok)throw Error(runtimeT("runtime.habits.noticeHabitSaveFailed"));recordMap[date]={...current,done,value};syncSummary();syncDetail();setTimeout(decorate,0);
          bridge.refresh?.requestRefresh?.('tasks','habit-checkin-saved');
          setHabitActionState(parent,"ok");mirrorHabitAction({state:"ok",kind:"toggle-habit-checkin",habit:name,date,path:habitRegistryPath});return true;
        }catch(e){new Notice(e.message);setHabitActionState(parent,"failed",e.message);mirrorHabitAction({state:"failed",kind:"toggle-habit-checkin",habit:name,date,error:e.message});return false;}
      },
      onSleep:record?.source==="tl"?()=>openSleepRecordEditor({date,cfg:config,record:recordMap[date],onSaved:({start,end,target})=>{recordMap[date]={...recordMap[date],value:start,end,target,done:isSleepBeforeTarget(start,target)};render();syncSummary();syncDetail();}}):undefined
    });};render();
  }
  decorate();
}
const syncRange=()=>{
  const recentCount=Math.min(6,Math.max(1,Math.floor((scroll.clientWidth||192)/32)));
  const count=viewState.expanded?historicalDates.length:Math.min(recentCount,historicalDates.length);
  wrap.dataset.expanded=String(viewState.expanded);history.style.setProperty("--habit-days",String(count));
  for(const row of history.children)for(let i=0;i<row.children.length;i++)row.children[i].hidden=i<historicalDates.length-count;
  if(viewState.atRecentEdge)scroll.scrollLeft=scroll.scrollWidth;else scroll.scrollLeft=viewState.scrollLeft;
};
syncSummary();syncRange();requestAnimationFrame(()=>{if(scroll.isConnected)syncRange();});
// Keep the inspected range across refreshes; resizing recent mode only adjusts its visible days.
if(typeof input?.registerCleanup==='function'){
  const trackPosition=()=>{viewState.atRecentEdge=scroll.scrollWidth-scroll.clientWidth-scroll.scrollLeft<2;viewState.scrollLeft=scroll.scrollLeft;};
  scroll.addEventListener('scroll',trackPosition);
  const resize=new scroll.ownerDocument.defaultView.ResizeObserver(syncRange);resize.observe(scroll);
  input.registerCleanup(()=>{resize.disconnect();scroll.removeEventListener('scroll',trackPosition);});
}
const actionsHost=input?.actionsHost||wrap;
const setIcon=globalThis.dashboardCore?.utils?.applyLucideIcon;
const rangeBtn=actionsHost.createEl('button',{cls:'clickable-icon dashboard-guide-icon-btn noria-habit-history-toggle',attr:{type:'button'}});
const syncRangeButton=()=>{const label=viewState.expanded?(habitSectionsUseChinese?"收起历史":"Show recent days"):(habitSectionsUseChinese?`查看近 ${dates.length} 天`:`Show ${dates.length} days`);rangeBtn.title=label;rangeBtn.setAttribute('aria-label',label);rangeBtn.setAttribute('aria-expanded',String(viewState.expanded));};
if(setIcon)setIcon(rangeBtn,'history');else rangeBtn.setText('↶');syncRangeButton();
rangeBtn.onclick=()=>{viewState.expanded=!viewState.expanded;viewState.atRecentEdge=true;syncRange();syncRangeButton();decorators.forEach(decorate=>decorate());};
const sourceBtn=actionsHost.createEl('button',{cls:'clickable-icon dashboard-guide-icon-btn',attr:{type:'button','aria-label':runtimeT('runtime.habits.noActiveAction'),title:runtimeT('runtime.habits.noActiveAction')}});
if(setIcon)setIcon(sourceBtn,'file-text');else sourceBtn.setText('↗');sourceBtn.onclick=()=>openFilePath(habitRegistryPath);
const addBtn=actionsHost.createEl("button",{cls:"clickable-icon dashboard-guide-icon-btn dashboard-guide-toolbar-plus",attr:{type:"button",title:runtimeT("runtime.habits.addHabit"),"aria-label":runtimeT("runtime.habits.addHabit")}});
if(setIcon)setIcon(addBtn,"plus");else addBtn.setText("+");addBtn.onclick=()=>openHabitStatusPanel(true);
const habitShell=host.closest?.(".dashboard-home-widget-shell");if(habitShell)habitShell._noriaConfigureWidget=()=>openHabitStatusPanel();
