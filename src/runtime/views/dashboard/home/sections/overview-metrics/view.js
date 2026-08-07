(async () => {
const container = input?.mount || ((typeof this !== "undefined" && this && this.container) ? this.container : (ctx.container || null));
const metricsBridge = input?.noriaBridge || globalThis.__noriaRuntimeBridge || {};
const metricsT = (key, params = {}) => {
  try {
    if (metricsBridge && typeof metricsBridge.t === "function") return metricsBridge.t(key, params);
    const messages = metricsBridge?.i18n?.messages || {};
    const fallback = metricsBridge?.i18n?.fallback || {};
    let template = messages[key] || fallback[key] || key;
    Object.entries(params || {}).forEach(([k, v]) => {
      template = String(template).replace(new RegExp(`\\{${k}\\}`, "g"), String(v ?? ""));
    });
    return String(template);
  } catch (_) {
    return String(key || "");
  }
};
if (!container || typeof container.createDiv !== "function") {
  ctx.paragraph(metricsT("runtime.home.noContainer"));
  return;
}
const noriaBridge = input?.noriaBridge || globalThis.__noriaRuntimeBridge || {};
const noriaPagesForScope = (scopeId) => {
  try { return noriaBridge.runtime?.pagesForScope?.(scopeId, ctx) || []; } catch (_) { return []; }
};
const isHero = input?.metricsLayout === "hero";
const host = container.createDiv();
host.addClass("dashboard-metrics-host");
if (isHero) host.addClass("dashboard-metrics-host--hero");
host.style.cssText = isHero
  ? "display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;overflow:visible;padding:0;width:100%;max-width:100%;box-sizing:border-box;min-width:0;height:100%;align-items:stretch;align-content:stretch;justify-items:stretch;"
  : "display:grid;grid-auto-flow:column;grid-auto-columns:minmax(148px,1fr);gap:10px;margin-bottom:4px;overflow-x:auto;padding-bottom:2px;";

const pagesFromRuntime = noriaPagesForScope("notes").filter((p) => p.file && (p.file.extension === "md" || !p.file.extension));
const pages = pagesFromRuntime;
const isIgnoredPath = (path) => {
  const p = String(path || "");
  return p.startsWith(".obsidian/")
    || p.startsWith(".cursor/")
    || p.startsWith("assets/")
    || p.includes("00_Templates/")
    || p.includes("/.specstory/")
    || p.includes("/.history/")
    || p.includes("/.github/")
    || p.endsWith("/README.md")
    || p === "README.md";
};
const isMetricExcludedPath = (path) => {
  const p = String(path || "").replace(/\\/g, "/");
  return isIgnoredPath(p) || p.startsWith("03_Resources/");
};
const metricPages = pages.filter((p) => !isMetricExcludedPath(p?.file?.path || ""));
const METRICS_CACHE_KEY = "__noria_home_overview_metrics_cache_v1";
const getMetricsCacheState = () => {
  try {
    const g = globalThis;
    if (!g[METRICS_CACHE_KEY]) g[METRICS_CACHE_KEY] = {};
    return g[METRICS_CACHE_KEY];
  } catch (_) {
    return {};
  }
};
async function runOverviewMetricReadQueue(queue, limit = 8) {
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
const now = new Date();
const todayStr = now.toISOString().slice(0, 10);
const toDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const normalizeDiary = (n) => (/^\d{8}$/.test(n) ? `${n.slice(0,4)}-${n.slice(4,6)}-${n.slice(6,8)}` : n);

const diaryPagesFromRuntime = noriaBridge.runtime?.pagesForManagedPath?.("diaryRoot", ctx) || [];
const diaryPagesForDates = (diaryPagesFromRuntime && diaryPagesFromRuntime.length > 0)
  ? diaryPagesFromRuntime
  : pages.filter((p) => String(p?.file?.path || "").replace(/\\/g, "/").startsWith("06_Diary/"));
const diaryDates = diaryPagesForDates
  .map((p) => (p.file.name || "").replace(".md", ""))
  .map((n) => (/^\d{4}-\d{2}-\d{2}$/.test(n) ? n : (/^\d{8}$/.test(n) ? normalizeDiary(n) : null)))
  .filter(Boolean);

let firstTs = Infinity;
if (diaryDates.length) firstTs = new Date([...diaryDates].sort()[0]).getTime();
else pages.forEach((p) => {
  const t = p.file.ctime;
  if (!t) return;
  const ts = new Date(t).getTime();
  if (!isNaN(ts) && ts < firstTs) firstTs = ts;
});
const daysUsed = firstTs !== Infinity ? Math.max(1, Math.floor((now.getTime() - firstTs) / 86400000)) : 1;

const diarySet = new Set(diaryDates);
const pageDateSet = new Set(pages.filter((p) => p.file.ctime).map((p) => String(p.file.ctime).slice(0, 10)));
let streak = 0;
for (let i = 0; i < 365; i++) {
  const d = new Date(now); d.setDate(now.getDate() - i);
  const ds = toDateStr(d);
  if (diarySet.has(ds) || pageDateSet.has(ds)) streak++; else break;
}

const createdToday = metricPages.filter((p) => String(p.file.ctime || "").slice(0, 10) === todayStr).length;

const metricsCache = getMetricsCacheState();
if (!metricsCache.byPath || typeof metricsCache.byPath !== "object" || Array.isArray(metricsCache.byPath)) {
  metricsCache.byPath = {};
}
let charCount = 0;
const seenMetricPaths = new Set();
const overviewMetricReadJobs = [];
for (const p of metricPages) {
  const pathText = String(p?.file?.path || "").replace(/\\/g, "/");
  if (!pathText) continue;
  seenMetricPaths.add(pathText);
  const mtime = String(p?.file?.mtime || "");
  const cached = metricsCache.byPath[pathText];
  if (cached && cached.mtime === mtime && Number.isFinite(Number(cached.length))) {
    charCount += Number(cached.length);
    continue;
  }
  overviewMetricReadJobs.push(async () => {
    let length = 0;
    try {
      const c = await ctx.io.load(pathText);
      if (c) length = String(c).length;
    } catch (_) {}
    metricsCache.byPath[pathText] = { mtime, length };
    charCount += length;
  });
}
await runOverviewMetricReadQueue(overviewMetricReadJobs);
for (const pathText of Object.keys(metricsCache.byPath)) {
  if (!seenMetricPaths.has(pathText)) delete metricsCache.byPath[pathText];
}
metricsCache.charCount = charCount;
const metricsLocale = String(metricsBridge?.locale || metricsBridge?.i18n?.locale || "en").trim() || "en";
const charStr = charCount >= 1000
  ? new Intl.NumberFormat(metricsLocale, { notation: "compact", maximumFractionDigits: 2 }).format(charCount)
  : new Intl.NumberFormat(metricsLocale).format(charCount);

let completedTaskCount = 0;
for (const p of pages) {
  const tasks = p.file.tasks || [];
  for (let ti = 0; ti < tasks.length; ti++) {
    if (tasks[ti].completed) completedTaskCount++;
  }
}

const allPages = pages.filter((p) => !isIgnoredPath(p.file.path || ""));
const tagMissing = allPages.filter((p) => (p.tags || []).length === 0).length;
const unresolved = app.metadataCache.unresolvedLinks ?? {};
let unresolvedCount = 0;
for (const [src, targets] of Object.entries(unresolved)) {
  if (isIgnoredPath(src)) continue;
  for (const [target] of Object.entries(targets || {})) {
    const t = String(target || "").trim();
    if (!t) continue;
    if (t.startsWith("memory:") || t.startsWith("http")) continue;
    if (t.includes("{{") || t.includes("}}") || t.includes("`")) continue;
    if (/\.(png|jpg|jpeg|gif|webp|svg|pdf|mp4|mov)$/i.test(t)) continue;
    unresolvedCount++;
  }
}

const themeOv = globalThis.dashboardCore?.theme?.home?.overview || {};
/** 顶栏用：纯色 surface + 低饱和数字，避免装饰渐变抢占信息层级 */
const defaultHeroMetricStyles = [
  {
    background: "var(--dash-surface-raised, color-mix(in srgb,var(--background-primary) 98%,var(--background-secondary)))",
    accent: "var(--noria-module-home,var(--interactive-accent))",
    labelColor: "var(--text-muted)"
  },
  {
    background: "var(--dash-surface-raised, color-mix(in srgb,var(--background-primary) 98%,var(--background-secondary)))",
    accent: "var(--noria-module-tasks,#6366f1)",
    labelColor: "var(--text-muted)"
  },
  {
    background: "var(--dash-surface-raised, color-mix(in srgb,var(--background-primary) 98%,var(--background-secondary)))",
    accent: "var(--noria-module-review,#f59e0b)",
    labelColor: "var(--text-muted)"
  },
  {
    background: "var(--dash-surface-raised, color-mix(in srgb,var(--background-primary) 98%,var(--background-secondary)))",
    accent: "var(--noria-module-timeline,#06b6d4)",
    labelColor: "var(--text-muted)"
  }
];
const defaultClassicMetricStyles = [
  { background: "var(--dash-surface-raised, color-mix(in srgb,var(--background-primary) 98%,var(--background-secondary)))", accent: "var(--noria-module-home,var(--interactive-accent))", labelColor: "var(--text-muted)" },
  { background: "var(--dash-surface-raised, color-mix(in srgb,var(--background-primary) 98%,var(--background-secondary)))", accent: "var(--noria-module-tasks,#6366f1)", labelColor: "var(--text-muted)" },
  { background: "var(--dash-surface-raised, color-mix(in srgb,var(--background-primary) 98%,var(--background-secondary)))", accent: "var(--noria-module-review,#f59e0b)", labelColor: "var(--text-muted)" },
  { background: "var(--dash-surface-raised, color-mix(in srgb,var(--background-primary) 98%,var(--background-secondary)))", accent: "var(--noria-module-timeline,#06b6d4)", labelColor: "var(--text-muted)" }
];
const metricStyles = isHero
  ? Array.isArray(themeOv.metricCardStylesHero) && themeOv.metricCardStylesHero.length >= 4
    ? themeOv.metricCardStylesHero
    : defaultHeroMetricStyles
  : Array.isArray(themeOv.metricCardStyles) && themeOv.metricCardStyles.length >= 4
    ? themeOv.metricCardStyles
    : defaultClassicMetricStyles;
const metricsShadow = isHero
  ? (themeOv.metricsCardShadowHero || "0 1px 2px rgba(15,23,42,.03)")
  : (themeOv.metricsCardShadow || "0 6px 16px rgba(15,23,42,.11)");

const fallbackStyle = (isHero ? defaultHeroMetricStyles : defaultClassicMetricStyles)[0];
const renderMetricRows = (rows, style) => {
  const surface = style?.background || style?.gradient || fallbackStyle.background || fallbackStyle.gradient || "var(--dash-surface-raised, var(--background-primary))";
  const accent = style?.accent || (isHero ? "var(--noria-module-home,var(--interactive-accent))" : "#f8fafc");
  const labelColor = style?.labelColor || (isHero ? "rgba(51,65,85,.8)" : "rgba(248,250,252,.93)");
  const minH = isHero ? (rows.length < 2 ? 72 : 88) : rows.length < 2 ? 74 : 86;
  const pad = isHero ? "11px 11px" : "11px 13px";
  const r = isHero ? "12px" : "13px";
  const border = isHero
    ? "1px solid color-mix(in srgb,var(--background-modifier-border) 91%,rgba(99,102,241,.035))"
    : "1px solid rgba(255,255,255,.12)";
  const card = host.createDiv();
  card.addClass("dashboard-metric-card");
  if (isHero) card.addClass("dashboard-metric-card--hero");
  const stretch = isHero ? "align-self:stretch;height:100%;" : "";
  card.style.cssText = `position:relative;overflow:hidden;border-radius:${r};padding:${pad};min-height:${minH}px;${stretch}background:${surface};box-shadow:${metricsShadow};border:${border};`;
  const body = card.createDiv();
  body.style.cssText =
    "position:relative;display:flex;flex-direction:column;gap:" +
    (isHero ? "6px" : "6px") +
    ";" +
    (isHero ? "justify-content:center;flex:1;min-height:0;" : "justify-content:center;height:100%;");
  const labelFs = isHero ? "11px" : "12px";
  const bigFs = isHero ? "clamp(21px,2.35vw,28px)" : "34px";
  const smFs = isHero ? "clamp(17px,1.9vw,22px)" : "26px";
  rows.forEach((rowSpec) => {
    const row = body.createDiv();
    row.style.cssText = "display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;";
    const labelSh = isHero ? "none" : "0 1px 2px rgba(15,23,42,.22)";
    const valSh = isHero ? "none" : "0 1px 6px rgba(2,6,23,.22)";
    row.createEl("small", { text: rowSpec.label }).style.cssText =
      `font-size:${labelFs};font-weight:700;opacity:.95;color:${labelColor};letter-spacing:${isHero ? ".12px" : ".22px"};text-align:center;text-shadow:${labelSh};`;
    const n = row.createEl("b", { text: String(rowSpec.value) });
    const valWt = isHero ? "700" : "800";
    const wrapGuard = isHero ? "white-space:nowrap;max-width:100%;overflow:visible;text-overflow:clip;" : "";
    n.style.cssText = `font-size:${rowSpec.big ? bigFs : smFs};line-height:1.06;color:${accent};text-shadow:${valSh};text-align:center;font-weight:${valWt};${wrapGuard}`;
  });
};

const metricRowsSpec = [
  [{ label: metricsT("runtime.home.metrics.daysUsed"), value: daysUsed, big: true }, { label: metricsT("runtime.home.metrics.usageStreak"), value: streak, big: true }],
  [{ label: metricsT("runtime.home.metrics.totalNotes"), value: metricPages.length, big: true }, { label: metricsT("runtime.home.metrics.todayNotes"), value: `+${createdToday}`, big: true }],
  [{ label: metricsT("runtime.home.metrics.totalWords"), value: charStr, big: true }, { label: metricsT("runtime.home.metrics.completedTasks"), value: completedTaskCount, big: true }],
  [{ label: metricsT("runtime.home.metrics.missingTags"), value: tagMissing, big: true }, { label: metricsT("runtime.home.metrics.brokenLinks"), value: unresolvedCount, big: true }]
];
/* 第三张卡（累计字数）：与第一张「OB天数」同色阶，避免紫色强调单独跳脱 */
metricRowsSpec.forEach((rows, i) => {
  const stylePick = i === 2 ? (metricStyles[0] || fallbackStyle) : (metricStyles[i] || metricStyles[0] || fallbackStyle);
  renderMetricRows(rows, stylePick);
});
})();
