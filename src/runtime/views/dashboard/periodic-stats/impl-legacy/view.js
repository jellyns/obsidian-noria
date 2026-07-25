let { preset, scope } = input || {};
/** 插件 Tab：显式 statsItemView，或 mount 与 ctx.container 为同一宿主（避免仅依赖顶层解构、引用不一致） */
function isStatsPluginHostContext() {
  try {
    const inj = input || {};
    if (inj.statsItemView) return true;
    const m = inj.mount;
    const c = ctx && ctx.container;
    return !!(m && c && m === c);
  } catch (_) {
    return false;
  }
}

const bridge = input?.noriaBridge || globalThis.__noriaRuntimeBridge || {};
function statsT(key, params = {}) {
  try {
    if (bridge && typeof bridge.t === "function") {
      const direct = bridge.t(key, params);
      if (direct && direct !== key) return String(direct);
    }
  } catch (_) {}
  try {
    const raw = bridge.i18n?.messages?.[key] || bridge.i18n?.fallback?.[key] || key;
    return String(raw).replace(/\{([^}]+)\}/g, (_, name) => params[name] == null ? "" : String(params[name]));
  } catch (_) {
    return String(key || "");
  }
}
const diaryRoot = `"${String(bridge.paths?.diaryRoot || "06_Diary").replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "")}"`;
const habitRegistryPath = String(bridge.paths?.habitRegistryPath || "Noria/Habits.md");

function toPlainArray(value) {
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
}

const weatherDefs = [
  { key: "晴", emoji: "☀️" },
  { key: "暴晒", emoji: "🌞" },
  { key: "多云", emoji: "⛅" },
  { key: "阴", emoji: "☁️" },
  { key: "雨", emoji: "🌧️" },
  { key: "风", emoji: "🌬️" },
  { key: "雪", emoji: "❄️" }
];
const moodDefs = [
  { key: "很好", emoji: "😄", score: 5 },
  { key: "稳定", emoji: "🙂", score: 4 },
  { key: "一般", emoji: "😐", score: 3 },
  { key: "偏低", emoji: "😞", score: 2 },
  { key: "很差", emoji: "😫", score: 1 }
];
const focusDefs = [
  { key: "很专注", emoji: "🎯", score: 4 },
  { key: "基本专注", emoji: "🟢", score: 3 },
  { key: "易分心", emoji: "🟡", score: 2 },
  { key: "难进入状态", emoji: "🔴", score: 1 }
];
const moodScoreMap = Object.fromEntries(moodDefs.map((x) => [x.key, x.score]));
const focusScoreMap = Object.fromEntries(focusDefs.map((x) => [x.key, x.score]));

function inferScope() {
  if (scope) return String(scope);
  if (preset === "weekly") return "weekly";
  if (preset === "monthly") return "monthly";
  if (preset === "yearly") return "yearly";
  if (isStatsPluginHostContext()) return "monthly";
  const file = ctx.current()?.file;
  const name = String(file?.name || "").replace(".md", "");
  if (/^\d{4}-W\d{1,2}$/i.test(name)) return "weekly";
  if (/^\d{4}-\d{2}$/.test(name)) return "monthly";
  if (/^\d{4}$/.test(name)) return "yearly";
  return "monthly";
}

function getDateRange(resolvedScope) {
  const file = ctx.current()?.file;
  const name = String(file?.name || "").replace(".md", "");
  const path = String(file?.path || "");
  const yearMatch = path.match(/(?:^|\/|\\)06_Diary(?:\/|\\)(\d{4})(?:\/|\\)/);
  const yearFromPath = yearMatch ? yearMatch[1] : "";
  const today = window.moment().startOf("day");

  if (resolvedScope === "weekly") {
    const wk = name.match(/^(\d{4})-W(\d{1,2})$/i);
    if (!wk) {
      if (isStatsPluginHostContext()) {
        const start = window.moment().startOf("isoWeek");
        return { scope: "weekly", year: start.isoWeekYear(), start, end: start.clone().add(6, "days") };
      }
      return null;
    }
    const weekYear = Number(wk[1]);
    const weekNum = Number(wk[2]);
    const start = window.moment().isoWeekYear(weekYear).isoWeek(weekNum).startOf("isoWeek");
    return { scope: "weekly", year: weekYear, start, end: start.clone().add(6, "days") };
  }
  if (resolvedScope === "monthly") {
    const m = name.match(/^(\d{4})-(\d{2})$/);
    if (!m) {
      if (isStatsPluginHostContext()) {
        const start = window.moment().startOf("month");
        return { scope: "monthly", year: start.year(), start, end: start.clone().endOf("month").startOf("day") };
      }
      return null;
    }
    const start = window.moment(`${m[1]}-${m[2]}-01`, "YYYY-MM-DD").startOf("day");
    return { scope: "monthly", year: Number(m[1]), start, end: start.clone().endOf("month").startOf("day") };
  }
  const yearName = /^\d{4}$/.test(name) ? name : yearFromPath;
  if (!yearName) {
    if (isStatsPluginHostContext()) {
      const y = today.format("YYYY");
      const start = window.moment(`${y}-01-01`, "YYYY-MM-DD");
      return { scope: "yearly", year: Number(y), start, end: start.clone().endOf("year").startOf("day") };
    }
    return null;
  }
  const start = window.moment(`${yearName}-01-01`, "YYYY-MM-DD");
  return { scope: "yearly", year: Number(yearName), start, end: start.clone().endOf("year").startOf("day") };
}

function enumerateDates(start, end) {
  const out = [];
  const d = start.clone();
  while (!d.isAfter(end, "day")) {
    out.push(d.format("YYYY-MM-DD"));
    d.add(1, "day");
  }
  return out;
}

function normalizeDiaryName(raw) {
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  return raw;
}

/** 与任务看板 bridge 的 taskTagFilter 对齐：统计日记内 `- [ ]` 行时应用相同包含/排除规则 */
function escapeRegexZb(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function normalizeTagTokenZb(raw) {
  let t = String(raw || "").trim().toLowerCase();
  if (!t) return "";
  if (!t.startsWith("#")) t = `#${t.replace(/^#+/, "")}`;
  return t;
}
function getBridgeTaskTagContextForStats() {
  const b = globalThis.__noriaRuntimeBridge;
  let includeTags = [];
  let excludeTags = [];
  const tq = b && b.taskQueryContext && typeof b.taskQueryContext === "object" ? b.taskQueryContext.taskTagFilter : null;
  if (tq && Array.isArray(tq.includeTags) && Array.isArray(tq.excludeTags)) {
    includeTags = tq.includeTags.map(normalizeTagTokenZb).filter(Boolean);
    excludeTags = tq.excludeTags.map(normalizeTagTokenZb).filter(Boolean);
  } else {
    const tf = b && b.taskTagFilter ? b.taskTagFilter : {};
    includeTags = (Array.isArray(tf.includeTags) ? tf.includeTags : []).map(normalizeTagTokenZb).filter(Boolean);
    excludeTags = (Array.isArray(tf.excludeTags) ? tf.excludeTags : []).map(normalizeTagTokenZb).filter(Boolean);
  }
  /* 与 tasks-calendar runtime：主过滤器为空时继承 wrapperTaskFilter */
  const wf = b && b.wrapperTaskFilter && typeof b.wrapperTaskFilter === "object" ? b.wrapperTaskFilter : null;
  if (!includeTags.length && !excludeTags.length && wf) {
    if (wf.useIncludeTags && Array.isArray(wf.taskIncludeTags)) {
      includeTags = wf.taskIncludeTags.map(normalizeTagTokenZb).filter(Boolean);
    }
    if (wf.useExcludeTags && Array.isArray(wf.taskExcludeTags)) {
      excludeTags = wf.taskExcludeTags.map(normalizeTagTokenZb).filter(Boolean);
    }
  }
  return { includeTags, excludeTags };
}
function diaryTaskLinePassesBridgeTagPolicy(line) {
  const { includeTags, excludeTags } = getBridgeTaskTagContextForStats();
  const text = String(line || "").toLowerCase();
  for (const tag of excludeTags) {
    if (!tag) continue;
    if (tag.endsWith("/")) {
      if (text.includes(tag)) return false;
    } else {
      const re = new RegExp(`(^|\\s)${escapeRegexZb(tag)}(\\s|$)`, "i");
      if (re.test(text)) return false;
    }
  }
  if (includeTags.length) {
    let ok = false;
    for (const tag of includeTags) {
      if (!tag) continue;
      if (tag.endsWith("/")) {
        if (text.includes(tag)) {
          ok = true;
          break;
        }
      } else {
        const re = new RegExp(`(^|\\s)${escapeRegexZb(tag)}(\\s|$)`, "i");
        if (re.test(text)) {
          ok = true;
          break;
        }
      }
    }
    if (!ok) return false;
  }
  return true;
}

const chartAdapter = globalThis.dashboardCore?.utils?.chartAdapter || {};
const sharedDualAxisRenderer = chartAdapter.renderDualAxis;
const habitParsing = globalThis.dashboardCore?.utils?.habitParsing || {};

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

async function runPeriodicStatsDiaryReadQueue(queue, limit = 8) {
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

async function ensureFallbackFactories() {
  if (!globalThis.dashboardPeriodicStatsFallbackChartsFactory) {
    const code = await loadText(".obsidian/plugins/noria/views/dashboard/periodic-stats/impl-legacy/fallbacks/charts.js");
    if (code) (0, eval)(String(code));
  }
  if (!globalThis.dashboardPeriodicStatsFallbackBoardsFactory) {
    const code = await loadText(".obsidian/plugins/noria/views/dashboard/periodic-stats/impl-legacy/fallbacks/boards.js");
    if (code) (0, eval)(String(code));
  }
}

function makeCard(parent, title) {
  const card = parent.createDiv();
  card.style.cssText = "padding:12px;border-radius:14px;background:linear-gradient(180deg,color-mix(in srgb,var(--background-primary) 94%,rgba(59,130,246,.05)),color-mix(in srgb,var(--background-secondary) 88%,rgba(59,130,246,.05)));border:1px solid color-mix(in srgb,var(--background-modifier-border) 74%,rgba(59,130,246,.18));box-shadow:0 2px 10px rgba(15,23,42,.05),inset 0 1px 0 color-mix(in srgb,var(--background-primary) 74%,transparent);";
  card.createDiv({ text: title }).style.cssText = "font-weight:760;letter-spacing:.2px;color:var(--text-normal);margin-bottom:8px;";
  return card;
}

function addStatChips(parent, labels) {
  const row = parent.createDiv();
  row.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;";
  (labels || []).forEach((label) => {
    const isObj = label && typeof label === "object";
    const text = String(isObj ? (label.text ?? "") : (label ?? ""));
    if (!text) return;
    const tone = String(isObj ? (label.tone || "") : "");
    let bg = "rgba(59,130,246,.10)";
    let bd = "rgba(59,130,246,.2)";
    let fg = "var(--text-muted)";
    if (tone === "purple") {
      bg = "rgba(99,102,241,.12)";
      bd = "rgba(99,102,241,.26)";
      fg = "rgba(67,56,202,.95)";
    } else if (tone === "cyan") {
      bg = "rgba(14,165,233,.12)";
      bd = "rgba(14,165,233,.24)";
      fg = "rgba(3,105,161,.95)";
    }
    row.createDiv({ text }).style.cssText = `padding:2px 8px;border-radius:999px;background:${bg};border:1px solid ${bd};font-size:.78em;color:${fg};`;
  });
}

function seriesStats(series) {
  const vals = (series || []).map((x) => {
    if (typeof x === "number") return Number(x);
    if (x && typeof x === "object") return Number(x.value ?? 0);
    return Number(x || 0);
  }).filter((v) => Number.isFinite(v));
  const total = vals.reduce((a, b) => a + b, 0);
  return { total, avg: vals.length ? total / vals.length : 0, peak: vals.length ? Math.max(...vals) : 0 };
}

function aggregateMetrics(dates, metrics, mode) {
  const bucketMap = new Map();
  dates.forEach((d) => {
    const m = metrics[d] || {};
    const mm = window.moment(d, "YYYY-MM-DD", true);
    if (!mm.isValid()) return;
    const key = mode === "month" ? mm.format("YYYY-MM") : `${mm.isoWeekYear()}-W${String(mm.isoWeek()).padStart(2, "0")}`;
    const label = mode === "month" ? mm.format("MM") : `W${String(mm.isoWeek()).padStart(2, "0")}`;
    if (!bucketMap.has(key)) {
      bucketMap.set(key, { key, label, notes: 0, words: 0, taskTotal: 0, taskDone: 0 });
    }
    const row = bucketMap.get(key);
    row.notes += Number(m.notes || 0);
    row.words += Number(m.words || 0);
    row.taskTotal += Number(m.taskTotal || 0);
    row.taskDone += Number(m.taskDone || 0);
  });
  return [...bucketMap.values()];
}

function parseTaskDateFromText(text) {
  const t = String(text || "");
  const m = t.match(/\[(?:completion|done|date|start|due)::\s*(\d{4}-\d{2}-\d{2})/i) || t.match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

function getSectionTaskEntries(markdown, sectionTitle) {
  if (typeof habitParsing.getSectionTaskEntries === "function") return habitParsing.getSectionTaskEntries(markdown, sectionTitle);
  const lines = String(markdown || "").split(/\r?\n/);
  const out = [];
  let inSection = false;
  for (const line of lines) {
    if (/^##\s+/.test(line)) inSection = false;
    if (new RegExp(`^##\\s+${sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`).test(line)) {
      inSection = true;
      continue;
    }
    if (!inSection) continue;
    const m = line.match(/^\s*-\s*\[( |x|X)\]\s+(.*)$/);
    if (!m) continue;
    out.push({ completed: m[1].toLowerCase() === "x", text: m[2] });
  }
  return out;
}

function getSectionItems(markdown, sectionTitle) {
  if (typeof habitParsing.getSectionItems === "function") return habitParsing.getSectionItems(markdown, sectionTitle);
  const lines = String(markdown || "").split(/\r?\n/);
  const out = [];
  let inSection = false;
  for (const line of lines) {
    if (/^##\s+/.test(line)) inSection = false;
    if (new RegExp(`^##\\s+${sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`).test(line)) {
      inSection = true;
      continue;
    }
    if (!inSection) continue;
    const m = line.match(/^\s*-\s+(.+)$/);
    if (!m) continue;
    out.push(String(m[1]).trim());
  }
  return out;
}

function normalizeHabit(raw) {
  if (typeof habitParsing.normalizeHabit === "function") return habitParsing.normalizeHabit(raw);
  return String(raw || "").replace(/[#\[\]].*$/g, "").trim();
}

async function collectMetrics(dates) {
  try {
    const dataService = globalThis.dashboardCore?.data?.dataService;
    const service = typeof dataService?.createDataService === "function"
      ? dataService.createDataService({ bridge, ctx, app, momentApi: window.moment })
      : null;
    if (service) {
      const snapshot = await service.getSnapshot({
        preset: "periodic",
        range: { mode: resolvedScope === "weekly" ? "week" : resolvedScope === "yearly" ? "year" : "month", start: dates[0], end: dates[dates.length - 1] },
        granularity: "day"
      });
      const stats = snapshot?.domains || {};
      const next = Object.fromEntries(dates.map((d) => [d, { notes: 0, words: 0, taskTotal: 0, taskDone: 0, weather: "", mood: "", energy: 0, focus: "" }]));
      const noteRows = Array.isArray(stats?.notes?.series) ? stats.notes.series : [];
      const taskRows = Array.isArray(stats?.tasks?.completion?.series) ? stats.tasks.completion.series : [];
      const stateRows = Array.isArray(stats?.dailyState?.series) ? stats.dailyState.series : [];
      dates.forEach((d, idx) => {
        if (!next[d]) return;
        next[d].notes = Number(noteRows[idx]?.notes || 0);
        next[d].words = Number(noteRows[idx]?.words || 0);
        next[d].taskTotal = Number(taskRows[idx]?.planned || 0);
        next[d].taskDone = Number(taskRows[idx]?.done || 0);
        next[d].energy = Number(stateRows[idx]?.energy || 0);
        next[d].focus = Number(stateRows[idx]?.focus || 0) ? String(stateRows[idx].focus) : "";
        next[d].weather = String(stateRows[idx]?.weather || "");
        next[d].mood = String(stateRows[idx]?.mood || "");
      });
      return next;
    }
  } catch (_) {}
  const ttl = Math.max(0, Number(bridge.performance?.taskSnapshotTtlMs || 0));
  const policy = getBridgeTaskTagContextForStats();
  const cacheKey = JSON.stringify({
    scope: resolvedScope,
    start: dates[0] || "",
    end: dates[dates.length - 1] || "",
    diaryRoot,
    include: policy.includeTags,
    exclude: policy.excludeTags
  });
  const cacheState = (() => {
    try {
      const key = "__noria_periodic_stats_metrics_cache_v1";
      if (!globalThis[key]) globalThis[key] = {};
      return globalThis[key];
    } catch (_) {
      return {};
    }
  })();
  const cached = cacheState[cacheKey];
  if (ttl > 0 && cached && Date.now() - Number(cached.at || 0) < ttl && cached.metrics) {
    return cached.metrics;
  }
  const metrics = Object.fromEntries(dates.map((d) => [d, { notes: 0, words: 0, taskTotal: 0, taskDone: 0, weather: "", mood: "", energy: 0, focus: "" }]));
  const pageRows = bridge.runtime?.pagesForManagedPath?.("diaryRoot", ctx) || [];
  const pages = toPlainArray(pageRows).filter((p) => p?.file?.name);
  const periodicStatsDiaryReadJobs = [];
  const periodicStatsDiaryRows = [];
  for (const p of pages) {
    const name = normalizeDiaryName(String(p.file.name || "").replace(".md", ""));
    if (!metrics[name]) continue;
    const row = { p, name, content: "" };
    periodicStatsDiaryRows.push(row);
    periodicStatsDiaryReadJobs.push(async () => {
      let content = "";
      try {
        content = String(await ctx.io.load(p.file.path) || "");
      } catch (_) {
        content = String(p.file?.content || "");
      }
      row.content = content;
    });
  }
  await runPeriodicStatsDiaryReadQueue(periodicStatsDiaryReadJobs);
  for (const row of periodicStatsDiaryRows) {
    const { p, name, content } = row;
    metrics[name].notes += 1;
    metrics[name].words += content.replace(/\s+/g, "").length;
    const rawTaskLines = content.match(/^\s*-\s*\[[ xX]\]\s+.*$/gm) || [];
    const taskLines = rawTaskLines.filter(diaryTaskLinePassesBridgeTagPolicy);
    metrics[name].taskTotal += taskLines.length;
    metrics[name].taskDone += taskLines.filter((ln) => /^\s*-\s*\[[xX]\]\s+/.test(ln)).length;
    if (p.weather) metrics[name].weather = String(p.weather);
    if (p.mood) metrics[name].mood = String(p.mood);
    if (p.energy != null) metrics[name].energy = Number(p.energy) || 0;
    if (p.focus) metrics[name].focus = String(p.focus);
  }
  cacheState[cacheKey] = { at: Date.now(), metrics };
  return metrics;
}

function buildDailySeries(dates, metrics, key) {
  return dates.map((d, i) => ({ x: i + 1, date: d, value: Number(metrics[d]?.[key] || 0) }));
}

const resolvedScope = inferScope();
let range = getDateRange(resolvedScope);
/* 任意仍无法解析时回退当前自然月，避免 ItemView/嵌套 ctx 上下文下误报「无法推断」 */
if (!range) {
  const t = window.moment().startOf("month");
  range = { scope: "monthly", year: t.year(), start: t.clone(), end: t.clone().endOf("month").startOf("day") };
}
const dates = enumerateDates(range.start, range.end);
const metrics = await collectMetrics(dates);

await ensureFallbackFactories();
const createFallbackCharts = globalThis.dashboardPeriodicStatsFallbackChartsFactory;
const createFallbackBoards = globalThis.dashboardPeriodicStatsFallbackBoardsFactory;
if (!createFallbackCharts || !createFallbackBoards) {
  ctx.paragraph(statsT("runtime.stats.loadFailed", { message: "fallback dependencies unavailable" }));
  return;
}

const chartKit = createFallbackCharts({ makeCard, addStatChips, seriesStats, chartAdapter, sharedDualAxisRenderer });
const boardKit = createFallbackBoards({
  ctx,
  bridge,
  makeCard,
  diaryRoot,
  habitRegistryPath,
  getSectionTaskEntries,
  getSectionItems,
  normalizeHabit,
  extractTaskDate: parseTaskDateFromText
});

const root = (input && input.mount) ? input.mount : ctx.el("div", "");
root.style.cssText = "display:grid;grid-template-columns:1fr;gap:10px;";

const dailyWordSeries = dates.map((d) => Number(metrics[d]?.words || 0));
const dailyNoteCountSeries = dates.map((d) => Number(metrics[d]?.notes || 0));
const dailyTaskTotalSeries = dates.map((d) => Number(metrics[d]?.taskTotal || 0));
const dailyDoneRateSeries = dates.map((d) => {
  const total = Number(metrics[d]?.taskTotal || 0);
  const done = Number(metrics[d]?.taskDone || 0);
  return total > 0 ? (done * 100) / total : 0;
});
const dailyLabels = dates.map((d) => d.slice(5));
const weatherCount = Object.fromEntries(weatherDefs.map((x) => [x.key, 0]));
const moodCount = Object.fromEntries(moodDefs.map((x) => [x.key, 0]));
dates.forEach((d) => {
  const w = String(metrics[d].weather || "");
  const m = String(metrics[d].mood || "");
  if (weatherCount[w] != null) weatherCount[w] += 1;
  if (moodCount[m] != null) moodCount[m] += 1;
});

const trendGrid = root.createDiv();
trendGrid.style.cssText = "display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;";
if ((root.clientWidth || 0) < 900) trendGrid.style.gridTemplateColumns = "1fr";

if (resolvedScope === "yearly") {
  const weekRows = aggregateMetrics(dates, metrics, "week");
  const monthRows = aggregateMetrics(dates, metrics, "month");
  chartKit.renderDualAxisSwitchable(trendGrid, {
    week: {
      title: statsT("runtime.stats.noteTrendWeek"),
      bar: weekRows.map((x) => Number(x.words || 0)),
      line: weekRows.map((x) => Number(x.notes || 0)),
      labels: weekRows.map((x) => x.label),
      barName: statsT("runtime.stats.words"),
      lineName: statsT("runtime.stats.noteCount"),
      statOptions: { lineHideTotal: false, barHideTotal: false }
    },
    month: {
      title: statsT("runtime.stats.noteTrendMonth"),
      bar: monthRows.map((x) => Number(x.words || 0)),
      line: monthRows.map((x) => Number(x.notes || 0)),
      labels: monthRows.map((x) => x.label),
      barName: statsT("runtime.stats.words"),
      lineName: statsT("runtime.stats.noteCount"),
      statOptions: { lineHideTotal: false, barHideTotal: false }
    }
  });
  chartKit.renderDualAxisSwitchable(trendGrid, {
    week: {
      title: statsT("runtime.stats.taskTrendWeek"),
      bar: weekRows.map((x) => Number(x.taskTotal || 0)),
      line: weekRows.map((x) => {
        const total = Number(x.taskTotal || 0);
        const done = Number(x.taskDone || 0);
        return total > 0 ? (done * 100) / total : 0;
      }),
      labels: weekRows.map((x) => x.label),
      barName: statsT("runtime.stats.taskCount"),
      lineName: statsT("runtime.stats.completionRate"),
      statOptions: { lineHideTotal: true, barHideTotal: false }
    },
    month: {
      title: statsT("runtime.stats.taskTrendMonth"),
      bar: monthRows.map((x) => Number(x.taskTotal || 0)),
      line: monthRows.map((x) => {
        const total = Number(x.taskTotal || 0);
        const done = Number(x.taskDone || 0);
        return total > 0 ? (done * 100) / total : 0;
      }),
      labels: monthRows.map((x) => x.label),
      barName: statsT("runtime.stats.taskCount"),
      lineName: statsT("runtime.stats.completionRate"),
      statOptions: { lineHideTotal: true, barHideTotal: false }
    }
  });
} else {
  chartKit.renderDualAxis(
    trendGrid,
    statsT("runtime.stats.noteTrend"),
    dailyWordSeries,
    dailyNoteCountSeries,
    dailyLabels,
    statsT("runtime.stats.words"),
    statsT("runtime.stats.noteCount"),
    { lineHideTotal: false, barHideTotal: false }
  );
  chartKit.renderDualAxis(
    trendGrid,
    statsT("runtime.stats.taskTrend"),
    dailyTaskTotalSeries,
    dailyDoneRateSeries,
    dailyLabels,
    statsT("runtime.stats.taskCount"),
    statsT("runtime.stats.completionRate"),
    { lineHideTotal: true, barHideTotal: false }
  );
}

const stateGrid = root.createDiv();
stateGrid.style.cssText = "display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;";
if ((root.clientWidth || 0) < 900) stateGrid.style.gridTemplateColumns = "1fr";
chartKit.renderDistCard(stateGrid, statsT("runtime.stats.weatherDistribution"), weatherDefs, weatherCount);
chartKit.renderDistCard(stateGrid, statsT("runtime.stats.moodDistribution"), moodDefs, moodCount);

const taskHeat = Object.fromEntries(dates.map((d) => [d, Number(metrics[d].taskTotal || 0)]));
const heatGrid = root.createDiv();
heatGrid.style.cssText = "display:grid;grid-template-columns:1fr;gap:10px;";
if ((root.clientWidth || 0) < 980) heatGrid.style.gridTemplateColumns = "1fr";
await boardKit.renderHeatmap(
  heatGrid,
  resolvedScope === "yearly" ? statsT("runtime.stats.taskActivityHeatmapYear") : statsT("runtime.stats.taskActivityHeatmap"),
  range.year,
  taskHeat
);
