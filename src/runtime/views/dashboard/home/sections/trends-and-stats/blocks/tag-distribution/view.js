/**
 * Top-level directory share Top 5; statistics still exclude templates and hidden paths.
 */
const root = input?.mount || ((typeof this !== "undefined" && this && this.container) ? this.container : (ctx.container || null));
const t = globalThis.dashboardCore?.theme?.home?.trends || {};
const topPanelBg = "transparent";
const topPanelBorder =
  t.dirTopPanelBorder ||
  "1px solid color-mix(in srgb,var(--background-modifier-border) 74%,rgba(59,130,246,.2))";
const topPanelShadow = t.topPanelShadow || "0 1px 0 color-mix(in srgb,var(--background-primary) 86%,white) inset";
const topPanelRadius = t.topPanelRadius || "14px";

const TOP_N = 5;
const noriaBridge = input?.noriaBridge || globalThis.__noriaRuntimeBridge || {};
const statsSnapshot = input?.statsSnapshot || null;
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
const tagDistributionT = (key, params = {}) => {
  try {
    if (noriaBridge && typeof noriaBridge.t === "function") return noriaBridge.t(key, params);
    const messages = noriaBridge?.i18n?.messages || {};
    const fallback = noriaBridge?.i18n?.fallback || {};
    let template = messages[key] || fallback[key] || key;
    Object.entries(params || {}).forEach(([k, v]) => {
      template = String(template).replace(new RegExp(`\\{${k}\\}`, "g"), String(v ?? ""));
    });
    return String(template);
  } catch (_) {
    return String(key || "");
  }
};
const noriaNotePages = () => {
  try {
    const scoped = noriaBridge.runtime?.pagesForScope?.("notes", ctx);
    if (scoped) return scoped;
    return typeof noriaBridge.runtime?.pagesForScope === "function"
      ? noriaBridge.runtime.pagesForScope("notes", ctx)
      : [];
  } catch (_) { return []; }
};

const isSkippedPath = (path) => {
  const p = String(path || "").replace(/\\/g, "/");
  if (!p) return true;
  if (p.startsWith(".obsidian/")) return true;
  if (p.startsWith(".cursor/")) return true;
  if (p.startsWith("assets/")) return true;
  if (p.includes("00_Templates/")) return true;
  if (p.includes("/.specstory/")) return true;
  if (p.includes("/.history/")) return true;
  return false;
};

const snapshotDistribution = statsSnapshot?.domains?.notes?.distribution
  || statsSnapshot?.views?.home?.noteDistribution
  || null;
let totalMd = Number(snapshotDistribution?.total || 0) || 0;
let sortedAll = [];
if (Array.isArray(snapshotDistribution?.items) && snapshotDistribution.items.length) {
  sortedAll = snapshotDistribution.items
    .map((item) => [
      String(item?.label || item?.key || tagDistributionT("runtime.home.trends.rootVault")),
      Number(item?.count ?? item?.value ?? 0) || 0
    ])
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
  if (!totalMd) totalMd = sortedAll.reduce((sum, [, count]) => sum + count, 0);
} else {
  const dirCount = {};
  noriaNotePages().forEach((p) => {
    if (!p.file || (p.file.extension && p.file.extension !== "md")) return;
    const path = p.file.path || "";
    if (isSkippedPath(path)) return;
    if (statsRange && !inStatsRange(noteCreatedValue(p))) return;
    totalMd++;
    const seg = path.split("/");
    const top = seg.length >= 2 ? seg[0] : tagDistributionT("runtime.home.trends.rootVault");
    dirCount[top] = (dirCount[top] || 0) + 1;
  });
  sortedAll = Object.entries(dirCount).sort((a, b) => b[1] - a[1]);
}

const baseColors =
  t.dirTopPalette ||
  t.tagPalette || [
      "#e72929",
      "#9b59b6",
      "#ff8c1a",
      "#377eb8",
      "#4daf4a",
      "#b8aa4a"
    ];

const card = root.createDiv();
card.style.cssText = `padding:8px;border-radius:${topPanelRadius};background:${topPanelBg};border:${topPanelBorder};box-shadow:${topPanelShadow};width:100%;min-width:0;min-height:0;height:100%;box-sizing:border-box;display:flex;flex-direction:column;`;

const head = card.createDiv();
head.style.cssText = "margin-bottom:4px;flex-shrink:0;display:flex;align-items:center;gap:8px;";
const titleEl = head.createDiv({ text: tagDistributionT("runtime.home.trends.noteShareTitle") });
titleEl.className = "dashboard-panel-title";
titleEl.style.cssText = "font-weight:800;font-size:1.02em;color:var(--dash-heading-text,var(--text-normal));letter-spacing:0.01em;line-height:1.25;";

const body = card.createDiv();
body.style.cssText = "flex:1 1 auto;min-height:0;width:100%;display:flex;flex-direction:column;justify-content:center;";

if (sortedAll.length === 0 || totalMd === 0) {
  body.createDiv({ text: tagDistributionT("runtime.home.trends.noMarkdownPaths") }).style.cssText =
    "padding:8px 4px;color:var(--text-muted);font-size:.86em;line-height:1.45;";
} else {

  const sorted = sortedAll.slice(0, TOP_N);
  const topSum = sorted.reduce((s, [, v]) => s + v, 0);
  const othersCount = Math.max(0, totalMd - topSum);
  const slices = othersCount > 0 ? [...sorted, [tagDistributionT("runtime.home.trends.other"), othersCount]] : [...sorted];
  const renderLeaderDonutChart =
    globalThis.dashboardCore?.components?.charts?.leaderDonutChart?.renderLeaderDonutChart;

  const wrap = body.createDiv();
  wrap.style.cssText =
    "min-height:0;display:flex;align-items:center;justify-content:center;width:100%;";
  const items = slices.map(([label, value], i) => ({
    label,
    value,
    color: baseColors[i % baseColors.length]
  }));
  if (typeof renderLeaderDonutChart === "function") {
    renderLeaderDonutChart(wrap, {
      items,
      total: totalMd,
      palette: baseColors,
      width: 360,
      height: 218,
      labelMinGap: 22,
      labelColumnMin: 92,
      labelColumnMax: 140,
      innerRadiusRatio: 0.6,
      labelBalance: "balanced",
      ariaLabel: tagDistributionT("runtime.home.trends.noteShareTitle")
    });
  } else {
    wrap.createDiv({ text: tagDistributionT("runtime.home.trends.pieMissing") }).style.cssText =
      "padding:8px;color:var(--text-muted);font-size:.86em;line-height:1.45;";
  }
}
