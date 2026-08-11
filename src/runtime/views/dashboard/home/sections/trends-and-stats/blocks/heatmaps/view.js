(async () => {
const root = input?.mount || ((typeof this !== "undefined" && this && this.container) ? this.container : (ctx.container || null));
const tTheme = globalThis.dashboardCore?.theme?.home?.trends || {};
const statsSnapshot = input?.statsSnapshot || null;
const topPanelBg = "transparent";
const topPanelBorder =
  tTheme.noteTrendPanelBorder ||
  "1px solid color-mix(in srgb,var(--background-modifier-border) 74%,rgba(59,130,246,.2))";
const topPanelShadow = tTheme.topPanelShadow || "0 1px 0 color-mix(in srgb,var(--background-primary) 86%,white) inset";
const topPanelRadius = tTheme.topPanelRadius || "14px";
const bridge = input?.noriaBridge || globalThis.__noriaRuntimeBridge || {};
const heatmapMode = ["habit", "workload"].includes(String(input?.heatmapMode || "")) ? String(input.heatmapMode) : "all";
const showHabit = heatmapMode === "all" || heatmapMode === "habit";
const showWorkload = heatmapMode === "all" || heatmapMode === "workload";
const sharedHabitDomain = statsSnapshot?.domains?.habits || null;
const heatmapT = (key, params = {}) => {
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
const habitParsing = globalThis.dashboardCore?.utils?.habitParsing || {};
const habitSectionAliases = (title) => {
  const groups = [
    ["打卡中的习惯", "Active habits"],
    ["暂停的习惯", "Paused habits"],
    ["已养成习惯", "Established habits"],
    ["循环任务源（每日）", "Daily recurring task source"]
  ];
  const raw = String(title || "").trim();
  return groups.find((group) => group.includes(raw)) || [raw];
};
const fallbackHabitSectionBlock = (content, title) => {
  const source = String(content || "");
  for (const candidate of habitSectionAliases(title)) {
    const escaped = String(candidate || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const block = (source.match(new RegExp(`##\\s*${escaped}[\\s\\S]*?(?=\\n##\\s|$)`)) || [])[0] || "";
    if (block) return block;
  }
  return "";
};
const getSectionItems = habitParsing.getSectionItems || ((content, title) => {
  const block = fallbackHabitSectionBlock(content, title);
  return [
    ...new Set(
      block
        .split("\n")
        .map((x) => x.trim())
        .filter((x) => /^-\s+/.test(x))
        .map((x) => x.replace(/^-+\s*/, "").trim())
        .filter((x) => x && x !== "（空）" && !/^\(?\s*empty\s*\)?$/i.test(x))
    )
  ];
});
const getSectionTaskEntries = habitParsing.getSectionTaskEntries || ((content, title) => {
  const block = fallbackHabitSectionBlock(content, title);
  return block
    .split("\n")
    .map((x) => x.trim())
    .filter((x) => /^-\s+\[[ xX]\]\s+/.test(x))
    .map((x) => ({ completed: /^-\s+\[[xX]\]\s+/.test(x), text: x.replace(/^-\s+\[[ xX]\]\s+/, "").trim() }))
    .filter((x) => !!x.text);
});
const baseCleanHabit = habitParsing.canonicalHabitName || habitParsing.normalizeHabit || ((text) =>
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
    .trim()
);
const cleanHabit = (text) => {
  const name = baseCleanHabit(text);
  let m = String(name || "").match(/^喝\s*(\d+(?:\.\d+)?)\s*杯水$/);
  if (m) return "喝水";
  m = String(name || "").match(/^运动\s*(\d+(?:\.\d+)?)\s*(大卡|千卡|kcal|卡)$/i);
  if (m) return "运动";
  return name;
};
const statsRange = input?.statsRange || null;
const formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const normalizeFileDate = (value) => {
  if (!value) return "";
  if (value instanceof Date) return formatDate(value);
  if (typeof value === "number" && Number.isFinite(value)) return formatDate(new Date(value));
  try {
    if (typeof value.toISODate === "function") return String(value.toISODate()).slice(0, 10);
    if (typeof value.toFormat === "function") return String(value.toFormat("yyyy-MM-dd")).slice(0, 10);
    if (typeof value.format === "function") return String(value.format("YYYY-MM-DD")).slice(0, 10);
  } catch (_) {}
  const raw = String(value || "").trim();
  if (/^\d{12,}$/.test(raw)) return formatDate(new Date(Number(raw)));
  const m = raw.match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : "";
};
const noteCreatedValue = (page) => page?.created || page?.file?.ctime;
const inStatsRange = (date) => {
  const ds = normalizeFileDate(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) return false;
  if (statsRange?.start && ds < String(statsRange.start).slice(0, 10)) return false;
  if (statsRange?.end && ds > String(statsRange.end).slice(0, 10)) return false;
  return true;
};
const year = Number(String(statsRange?.end || statsRange?.start || "").slice(0, 4)) || new Date().getFullYear();
const renderYearHeatmapCalendar =
  globalThis.dashboardCore?.components?.charts?.yearHeatmapCalendar?.renderYearHeatmapCalendar;
const renderNativeHeatmap = (host, map, paletteKey, entryOptions = {}) => {
  if (typeof renderYearHeatmapCalendar !== "function") {
    host.createDiv({ text: heatmapT("runtime.home.trends.heatmapMissing") }).style.cssText =
      "padding:8px;color:var(--text-muted);font-size:.86em;line-height:1.45;";
    return null;
  }
  return renderYearHeatmapCalendar(host, {
    year,
    entries: toEntries(map, entryOptions),
    weekStartDay: 1,
    levels: 6,
    paletteKey
  });
};
const noriaPagesForScope = (scopeId) => {
  try { return bridge.runtime?.pagesForScope?.(scopeId, ctx) || []; } catch (_) { return []; }
};
const habitRegistryPath = String(bridge.paths?.habitRegistryPath || "Noria/Habits.md");
const contentRaw = showHabit && !sharedHabitDomain ? await ctx.io.load(habitRegistryPath) : "";
const content = typeof habitParsing.migrateHabitStatusTags === "function" ? habitParsing.migrateHabitStatusTags(contentRaw || "") : contentRaw;
const sourceRows = content ? getSectionTaskEntries(content, "循环任务源（每日）") : [];
const activeFromSource = new Set(sourceRows.filter((x) => /(^|\s)#habit\b/i.test(x.text) && /#active\b/i.test(x.text) && !/#paused\b/i.test(x.text)).map((x) => cleanHabit(x.text)).filter(Boolean));
const pausedFromSource = new Set(sourceRows.filter((x) => /(^|\s)#habit\b/i.test(x.text) && /#paused\b/i.test(x.text)).map((x) => cleanHabit(x.text)).filter(Boolean));
const inferHabitConfig = habitParsing.inferLegacyHabitConfig || ((text) => ({ name: cleanHabit(text) }));
const activeHabitConfigs = content ? getSectionItems(content, "打卡中的习惯").map(inferHabitConfig).filter((x) => x.name) : [];
const registry = content
  ? {
      active: new Set([...activeHabitConfigs.map((x) => cleanHabit(x.name)).filter(Boolean), ...activeFromSource]),
      mastered: new Set(getSectionItems(content, "已养成习惯").map(cleanHabit).filter(Boolean)),
      paused: new Set([...getSectionItems(content, "暂停的习惯").map(cleanHabit).filter(Boolean), ...pausedFromSource])
    }
  : { active: new Set(), mastered: new Set(), paused: new Set() };
const normDate = (name) => (/^\d{8}$/.test(name) ? `${name.slice(0, 4)}-${name.slice(4, 6)}-${name.slice(6, 8)}` : name);
const habitTotalMap = {},
  byHabit = {},
  taskCountMap = {},
  wordCountMap = {};
const addHabitHit = (habitName, date) => {
  if (!habitName || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return;
  if (!inStatsRange(date)) return;
  byHabit[habitName] = byHabit[habitName] || {};
  if (byHabit[habitName][date]) return;
  byHabit[habitName][date] = 1;
  habitTotalMap[date] = (habitTotalMap[date] || 0) + 1;
};
const getInlineDate = (text, key) => {
  const m = String(text || "").match(new RegExp(`\\[${key}::\\s*(\\d{4}-\\d{2}-\\d{2})\\]`, "i"));
  return m ? m[1] : null;
};
const getInlineField = habitParsing.extractInlineField || ((text, key) => {
  const m = String(text || "").match(new RegExp(`\\[${key}::\\s*([^\\]]*)\\]`, "i"));
  return m ? String(m[1] || "").trim() : "";
});
const getSleepHabitDate = habitParsing.getSleepHabitDate || (() => "");
const isSleepBeforeTarget = habitParsing.isSleepBeforeTarget || (() => false);
const dateTimeToText = (value) => {
  if (!value) return "";
  try {
    if (typeof value.toFormat === "function") return value.toFormat("yyyy-MM-dd HH:mm");
  } catch (_) {}
  return String(value || "");
};
const clockFromDateTime = (value) => {
  const m = String(value || "").match(/(?:^|\s)(\d{1,2}:\d{2})(?:\s|$)/);
  return m ? m[1] : String(value || "");
};
const getEmojiDate = (text, regex) => {
  const m = String(text || "").match(regex);
  return m ? m[1] : null;
};
const getTaskDate = (t, key) => {
  const txt = String(t?.text || "");
  if (key === "due") return String(t?.due || "").slice(0, 10) || getInlineDate(txt, "due") || getEmojiDate(txt, /[📅📆🗓]\s*(\d{4}-\d{2}-\d{2})/);
  if (key === "done") return String(t?.completion || "").slice(0, 10) || getInlineDate(txt, "completion") || getInlineDate(txt, "done") || getEmojiDate(txt, /✅\s*(\d{4}-\d{2}-\d{2})/);
  return "";
};
async function runHeatmapDiaryReadQueue(queue, limit = 8) {
  if (!Array.isArray(queue) || queue.length === 0) return;
  let cursor = 0;
  const workerCount = Math.min(limit, queue.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < queue.length) {
      const index = cursor++;
      const job = queue[index];
      if (typeof job !== "function") continue;
      await job();
    }
  });
  await Promise.all(workers);
}
for (const e of sourceRows) {
  if (!e.completed) continue;
  const txt = String(e.text || "");
  const hasHabitTag = /(^|\s)#habit\b/i.test(txt);
  if (!hasHabitTag) continue;
  const h = cleanHabit(txt) || "Unnamed habit";
  if (registry.active.size > 0 && !registry.active.has(h)) continue;
  if (registry.mastered.has(h) || registry.paused.has(h)) continue;
  const ds = getTaskDate({ text: txt }, "due") || getTaskDate({ text: txt }, "done");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ds || ""))) continue;
  addHabitHit(h, ds);
}
const diaryPages = (showWorkload || (showHabit && !sharedHabitDomain)
  ? (bridge.runtime?.pagesForManagedPath?.("diaryRoot", ctx) || [])
  : []).filter((p) => {
  const n = (p.file.name || "").replace(".md", "");
  return /^\d{8}$/.test(n) || /^\d{4}-\d{2}-\d{2}$/.test(n);
});
const sleepConfig = activeHabitConfigs.find((x) => x.type === "sleep" || /睡/.test(x.name));
const sleepHabitName = sleepConfig ? cleanHabit(sleepConfig.name) : "";
const heatmapDiaryWordReads = [];
for (const p of diaryPages) {
  const raw = (p.file.name || "").replace(".md", "");
  const ds = normDate(raw);
  if (!inStatsRange(ds)) continue;
  const tasks = p.file.tasks || [];
  let doneCount = 0;
  for (const t of tasks) {
    if (!t.text) continue;
    const isHabit = String(t.text).includes("#habit");
    if (showWorkload && !isHabit && t.completed) doneCount++;
    if (showHabit && !sharedHabitDomain && sleepHabitName && /#tl\/sleep\b/i.test(String(t.text || ""))) {
      const txt = String(t.text || "");
      const rawStart = getInlineField(txt, "start") || dateTimeToText(t.start);
      const habitDate = getSleepHabitDate(rawStart);
      const target = getInlineField(txt, "target") || sleepConfig.target || "00:30";
      if (registry.active.has(sleepHabitName) && !registry.mastered.has(sleepHabitName) && !registry.paused.has(sleepHabitName) && isSleepBeforeTarget(clockFromDateTime(rawStart), target)) {
        addHabitHit(sleepHabitName, habitDate);
      }
    }
  }
  if (showWorkload) {
    taskCountMap[ds] = (taskCountMap[ds] || 0) + doneCount;
    heatmapDiaryWordReads.push(async () => {
      try {
        const c = await ctx.io.load(p.file.path);
        wordCountMap[ds] = (wordCountMap[ds] || 0) + String(c || "").replace(/\s+/g, "").length;
      } catch (e) {}
    });
  }
}
await runHeatmapDiaryReadQueue(heatmapDiaryWordReads);
if (showHabit && sharedHabitDomain) {
  (Array.isArray(sharedHabitDomain?.heatmap?.series) ? sharedHabitDomain.heatmap.series : []).forEach((row) => {
    const date = normalizeFileDate(row?.date || row?.key);
    if (!inStatsRange(date)) return;
    habitTotalMap[date] = Number(row?.value ?? row?.checked ?? 0) || 0;
  });
  (Array.isArray(sharedHabitDomain?.items) ? sharedHabitDomain.items : []).forEach((item) => {
    const name = String(item?.name || "").trim();
    if (!name) return;
    byHabit[name] = {};
    (Array.isArray(item?.heatmap?.series) ? item.heatmap.series : []).forEach((row) => {
      const date = normalizeFileDate(row?.date || row?.key);
      if (!inStatsRange(date)) return;
      byHabit[name][date] = Number(row?.value ?? row?.checked ?? 0) || 0;
    });
  });
}
const noteCountMap = {};
const noteTrendRows = Array.isArray(statsSnapshot?.domains?.notes?.trend?.series)
  ? statsSnapshot.domains.notes.trend.series
  : (Array.isArray(statsSnapshot?.views?.home?.noteTrend?.series) ? statsSnapshot.views.home.noteTrend.series : []);
if (showWorkload && noteTrendRows.length) {
  noteTrendRows.forEach((row) => {
    const ds = normalizeFileDate(row?.start || row?.date || row?.key);
    const count = Number(row?.notes || row?.value || 0) || 0;
    if (/^\d{4}-\d{2}-\d{2}$/.test(ds) && inStatsRange(ds) && count > 0) {
      noteCountMap[ds] = (noteCountMap[ds] || 0) + count;
    }
  });
} else if (showWorkload) {
  noriaPagesForScope("notes").forEach((p) => {
    const ds = normalizeFileDate(noteCreatedValue(p));
    if (/^\d{4}-\d{2}-\d{2}$/.test(ds) && inStatsRange(ds)) noteCountMap[ds] = (noteCountMap[ds] || 0) + 1;
  });
}
const maxOf = (m) => Math.max(1, ...Object.values(m).map(Number), 1);
const maxTask = maxOf(taskCountMap),
  maxNote = maxOf(noteCountMap),
  maxWord = maxOf(wordCountMap);
const toScaledMap = (m, maxV) => {
  const out = {};
  Object.entries(m).forEach(([d, v]) => {
    if (v > 0) out[d] = Math.max(1, Math.round((v / maxV) * 10));
  });
  return out;
};
const overviewMap = {},
  allDates = new Set([...Object.keys(taskCountMap), ...Object.keys(noteCountMap), ...Object.keys(wordCountMap)]);
allDates.forEach((d) => {
  const s = 0.35 * ((taskCountMap[d] || 0) / maxTask) + 0.35 * ((noteCountMap[d] || 0) / maxNote) + 0.3 * ((wordCountMap[d] || 0) / maxWord);
  if (s > 0) overviewMap[d] = Math.max(1, Math.round(s * 10));
});
const MODE_OVERVIEW = heatmapT("runtime.home.trends.overview");
const MODE_NEW_NOTES = heatmapT("runtime.home.trends.newNotes");
const MODE_TASKS = heatmapT("runtime.home.trends.tasks");
const MODE_WORDS = heatmapT("runtime.home.trends.words");
const MODE_CHECKINS = heatmapT("runtime.home.trends.checkins");
const maps = {
  [MODE_OVERVIEW]: overviewMap,
  [MODE_NEW_NOTES]: toScaledMap(noteCountMap, maxNote),
  [MODE_TASKS]: toScaledMap(taskCountMap, maxTask),
  [MODE_WORDS]: toScaledMap(wordCountMap, maxWord)
};
const totals = {
  [MODE_NEW_NOTES]: Object.values(noteCountMap).reduce((a, b) => a + Number(b || 0), 0),
  [MODE_TASKS]: Object.values(taskCountMap).reduce((a, b) => a + Number(b || 0), 0),
  [MODE_WORDS]: Object.values(wordCountMap).reduce((a, b) => a + Number(b || 0), 0)
};
const workEntryOptions = {
  [MODE_OVERVIEW]: {
    tooltip: (date) => `${date} · ${MODE_OVERVIEW} · ${MODE_TASKS} ${taskCountMap[date] || 0} · ${MODE_NEW_NOTES} ${noteCountMap[date] || 0} · ${MODE_WORDS} ${wordCountMap[date] || 0}`,
    valueLabel: (date) => `${MODE_TASKS} ${taskCountMap[date] || 0} / ${MODE_NEW_NOTES} ${noteCountMap[date] || 0} / ${MODE_WORDS} ${wordCountMap[date] || 0}`
  },
  [MODE_NEW_NOTES]: {
    rawMap: noteCountMap,
    unit: "",
    noun: MODE_NEW_NOTES
  },
  [MODE_TASKS]: {
    rawMap: taskCountMap,
    unit: "",
    noun: MODE_TASKS
  },
  [MODE_WORDS]: {
    rawMap: wordCountMap,
    unit: "",
    noun: MODE_WORDS
  }
};
function toEntries(m, options = {}) {
  return Object.entries(m || {}).map(([date, intensity]) => {
    const rawValue = options.rawMap ? Number(options.rawMap[date] || 0) : Number(intensity || 0);
    const valueLabel = typeof options.valueLabel === "function"
      ? options.valueLabel(date, rawValue, intensity)
      : options.noun
        ? `${options.noun} ${rawValue} ${options.unit || ""}`.trim()
        : `${rawValue}`;
    const tooltip = typeof options.tooltip === "function"
      ? options.tooltip(date, rawValue, intensity)
      : options.noun
        ? `${date} · ${options.noun} ${rawValue} ${options.unit || ""}`.trim()
        : `${date} · ${valueLabel}`;
    return { date, intensity, rawValue, valueLabel, tooltip, ariaLabel: tooltip };
  });
}
const dayStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const calcStreak = (m) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  let s = 0;
  while ((m[dayStr(d)] || 0) > 0) {
    s++;
    d.setDate(d.getDate() - 1);
  }
  return s;
};
const sumMap = (m) => Object.values(m || {}).reduce((a, b) => a + Number(b || 0), 0);
const monthLabel = (ym) => {
  const m = String(ym || "").match(/^(\d{4})-(\d{2})$/);
  return m ? heatmapT("runtime.home.trends.monthLabel", { month: Number(m[2]) }) : heatmapT("runtime.home.trends.none");
};
const activeMonth = (m) => {
  const sums = {};
  Object.entries(m || {}).forEach(([date, value]) => {
    const v = Number(value || 0);
    if (v <= 0) return;
    const ym = String(date).slice(0, 7);
    sums[ym] = (sums[ym] || 0) + v;
  });
  let best = "";
  let bestValue = 0;
  Object.entries(sums).forEach(([ym, value]) => {
    if (value > bestValue || (value === bestValue && ym > best)) {
      best = ym;
      bestValue = value;
    }
  });
  return best ? { main: monthLabel(best), metric: String(Math.round(bestValue)), unit: "" } : { main: heatmapT("runtime.home.trends.none"), metric: "", unit: "" };
};
const activeDay = (m) => {
  let best = "";
  let bestValue = 0;
  Object.entries(m || {}).forEach(([date, value]) => {
    const v = Number(value || 0);
    if (v > bestValue || (v === bestValue && date > best)) {
      best = date;
      bestValue = v;
    }
  });
  return bestValue > 0 ? { main: best.slice(5), metric: String(Math.round(bestValue)), unit: "" } : { main: heatmapT("runtime.home.trends.none"), metric: "", unit: "" };
};
const longestStreak = (m) => {
  const d = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  let cur = 0;
  let max = 0;
  while (d <= end) {
    if ((m[dayStr(d)] || 0) > 0) {
      cur++;
      max = Math.max(max, cur);
    } else {
      cur = 0;
    }
    d.setDate(d.getDate() + 1);
  }
  return max;
};
const renderBottomStats = (parent, m) => {
  parent.empty();
  parent.className = "dashboard-heatmap-bottom-stats";
  parent.style.cssText = "display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:auto auto;gap:3px 8px;align-items:baseline;margin-top:7px;padding:6px 2px 0;min-width:0;";
  const statAccent = "color-mix(in srgb,var(--dash-heatmap-habit-level-5,#42bd95) 78%,var(--interactive-accent,#2563eb) 22%)";
  const formatStatParts = (value) => {
    if (value && typeof value === "object") return value;
    const raw = String(value || heatmapT("runtime.home.trends.none"));
    const streakMatch = raw.match(new RegExp("^(\\d+)\\s*(" + heatmapT("runtime.home.trends.dayUnit").replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")$"));
    if (streakMatch) return { main: "", metric: streakMatch[1], unit: streakMatch[2] };
    return { main: raw, metric: "", unit: "" };
  };
  const items = [
    [heatmapT("runtime.home.trends.activeMonth"), activeMonth(m)],
    [heatmapT("runtime.home.trends.activeDay"), activeDay(m)],
    [heatmapT("runtime.home.trends.longestStreak"), `${longestStreak(m)} ${heatmapT("runtime.home.trends.dayUnit")}`],
    [heatmapT("runtime.home.trends.currentStreak"), `${calcStreak(m)} ${heatmapT("runtime.home.trends.dayUnit")}`]
  ];
  items.forEach(([label], index) => {
    const labelEl = parent.createDiv({ text: label });
    labelEl.style.cssText = `grid-column:${index + 1};grid-row:1;text-align:center;font-size:.72em;font-weight:650;color:var(--text-muted);white-space:nowrap;min-width:0;overflow:hidden;text-overflow:ellipsis;`;
  });
  items.forEach(([label, value], index) => {
    const valueEl = parent.createDiv();
    valueEl.style.cssText = `grid-column:${index + 1};grid-row:2;display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:baseline;gap:3px;text-align:center;font-size:.8em;font-weight:760;font-variant-numeric:tabular-nums;white-space:nowrap;min-width:0;overflow:visible;color:var(--text-normal);`;
    const parts = formatStatParts(value);
    if (parts.main && parts.metric) {
      valueEl.createEl("span", { text: parts.main }).style.cssText = "grid-column:2;color:var(--text-normal);min-width:0;text-align:center;";
      const metricGroup = valueEl.createEl("span");
      metricGroup.style.cssText = "grid-column:3;justify-self:start;display:inline-flex;align-items:baseline;gap:3px;min-width:0;";
      metricGroup.createEl("span", { text: "·" }).style.cssText = "color:var(--text-faint);font-weight:650;";
      metricGroup.createEl("span", { text: parts.metric }).style.cssText = `color:${statAccent};font-weight:820;`;
      if (parts.unit) metricGroup.createEl("span", { text: parts.unit }).style.cssText = "color:var(--text-muted);font-weight:650;";
    } else if (parts.metric) {
      const centered = valueEl.createEl("span");
      centered.style.cssText = "grid-column:1 / span 3;justify-self:center;display:inline-flex;align-items:baseline;gap:3px;";
      centered.createEl("span", { text: parts.metric }).style.cssText = "color:var(--text-normal);font-weight:820;";
      if (parts.unit) centered.createEl("span", { text: parts.unit }).style.cssText = "color:var(--text-muted);font-weight:650;";
    } else {
      valueEl.createEl("span", { text: parts.main || heatmapT("runtime.home.trends.none") }).style.cssText = "grid-column:1 / span 3;justify-self:center;min-width:0;overflow:hidden;text-overflow:ellipsis;";
    }
  });
};
const createChartRow = (parent) => {
  const row = parent.createDiv();
  row.style.cssText = "display:block;";
  const host = row.createDiv();
  host.style.cssText =
    "flex:1;min-width:0;padding:5px 4px;border-radius:12px;overflow:hidden;background:transparent;border:0;box-shadow:none;";
  return { host };
};
const wrap = root.createDiv();
wrap.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(min(520px,100%),1fr));gap:10px;width:100%;margin-bottom:8px;";
const heatmapModeButtonBase =
  "appearance:none;-webkit-appearance:none;min-height:28px;height:28px;padding:0 9px;border:0;border-radius:8px;box-shadow:none;outline:none;font-size:13px;line-height:1;letter-spacing:0;";
const setHeatmapModeButton = (b, active) => {
  const isActive = active === true;
  try { b.setAttribute("aria-pressed", isActive ? "true" : "false"); } catch (_) {}
  try { b.classList.add("dashboard-heatmap-mode-button"); } catch (_) {}
  try { b.classList.toggle("is-active", isActive); } catch (_) {}
  b.style.cssText = isActive
    ? `${heatmapModeButtonBase}background:color-mix(in srgb,var(--interactive-accent) 14%,var(--background-primary));color:var(--text-normal);font-weight:720;`
    : `${heatmapModeButtonBase}background:transparent;color:var(--text-muted);font-weight:650;`;
};
if (showHabit) {
const habitCard = wrap.createDiv();
habitCard.style.cssText = `padding:8px;border-radius:${topPanelRadius};background:${topPanelBg};border:${topPanelBorder};box-shadow:${topPanelShadow};align-self:start;width:100%;display:flex;flex-direction:column;min-width:0;min-height:0;`;
const habitHead = habitCard.createDiv();
habitHead.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px;min-width:0;flex-wrap:wrap;";
const habitHeadLeft = habitHead.createDiv();
habitHeadLeft.style.cssText = "display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex:1 1 100%;min-width:0;width:100%;";
const habitTitle = habitHeadLeft.createDiv({ text: heatmapT("runtime.home.trends.habitHeatmap") });
habitTitle.className = "dashboard-panel-title";
habitTitle.style.cssText = "font-weight:800;font-size:1.02em;color:var(--dash-heading-text,var(--text-normal));letter-spacing:0.01em;line-height:1.25;white-space:nowrap;";
const habitBar = habitHeadLeft.createDiv();
habitBar.style.cssText = "display:flex;gap:4px;flex-wrap:wrap;align-items:center;justify-content:flex-end;margin-left:auto;flex:1 1 260px;min-width:0;";
const { host: habitChart } = createChartRow(habitCard);
const habitBottomStats = habitCard.createDiv();
const habitNames = Object.keys(byHabit).sort((a, b) => a.localeCompare(b, "zh-CN")),
  habitBtnRefs = [];
const drawHabit = (mode) => {
  habitChart.empty();
  const map = mode === MODE_OVERVIEW ? habitTotalMap : byHabit[mode] || {};
  renderNativeHeatmap(habitChart, map, "habit", {
    rawMap: map,
    tooltip: (date, rawValue) => `${date} · ${MODE_CHECKINS} ${rawValue}`,
    valueLabel: (_date, rawValue) => `${MODE_CHECKINS} ${rawValue}`
  });
  renderBottomStats(habitBottomStats, map);
  habitBtnRefs.forEach((x) => setHeatmapModeButton(x.btn, x.mode === mode));
};
const mkHabitBtn = (mode, active) => {
  const b = habitBar.createEl("button", { text: mode });
  b.type = "button";
  b.onclick = () => drawHabit(mode);
  habitBtnRefs.push({ mode, btn: b });
  setHeatmapModeButton(b, !!active);
};
mkHabitBtn(MODE_OVERVIEW, true);
habitNames.forEach((h) => mkHabitBtn(h, false));
drawHabit(MODE_OVERVIEW);
}

if (showWorkload) {
const workCard = wrap.createDiv();
workCard.style.cssText = `padding:8px;border-radius:${topPanelRadius};background:${topPanelBg};border:${topPanelBorder};box-shadow:${topPanelShadow};align-self:start;width:100%;display:flex;flex-direction:column;min-width:0;min-height:0;`;
const workHead = workCard.createDiv();
workHead.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px;min-width:0;flex-wrap:wrap;";
const workHeadLeft = workHead.createDiv();
workHeadLeft.style.cssText = "display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex:1 1 100%;min-width:0;width:100%;";
const workTitle = workHeadLeft.createDiv({ text: heatmapT("runtime.home.trends.workHeatmap") });
workTitle.className = "dashboard-panel-title";
workTitle.style.cssText = "font-weight:800;font-size:1.02em;color:var(--dash-heading-text,var(--text-normal));letter-spacing:0.01em;line-height:1.25;white-space:nowrap;";
const bar = workHeadLeft.createDiv();
bar.style.cssText = "display:flex;gap:4px;flex-wrap:wrap;align-items:center;justify-content:flex-end;margin-left:auto;flex:1 1 260px;min-width:0;";
const { host: chart } = createChartRow(workCard);
const workBottomStats = workCard.createDiv();
const btnRefs = [];
const workStatMap = (mode) => mode === MODE_OVERVIEW ? maps[mode] || {} : workEntryOptions[mode]?.rawMap || maps[mode] || {};
const draw = (mode) => {
  chart.empty();
  renderNativeHeatmap(chart, maps[mode] || {}, "work", workEntryOptions[mode] || {});
  renderBottomStats(workBottomStats, workStatMap(mode));
  btnRefs.forEach((x) => setHeatmapModeButton(x.btn, x.mode === mode));
};
[MODE_OVERVIEW, MODE_NEW_NOTES, MODE_TASKS, MODE_WORDS].forEach((mode, i) => {
  const b = bar.createEl("button", { text: mode });
  b.type = "button";
  b.onclick = () => draw(mode);
  btnRefs.push({ mode, btn: b });
  setHeatmapModeButton(b, i === 0);
});
draw(MODE_OVERVIEW);
}
})();
