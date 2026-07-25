/**
 * Noria 图表色板：与 bootstrap-style :root 中 --dash-chart-* 对齐。
 * 主页 core 会先加载本文件；读 CSS 变量失败时用 FALLBACK（与默认值一致）。
 */
(() => {
  const root = globalThis.dashboardCore || (globalThis.dashboardCore = {});
  root.components = root.components || {};
  root.components.charts = root.components.charts || {};

  const WEATHER_SLUG = {
    晴: "clear",
    暴晒: "scorch",
    多云: "cloudy",
    阴: "overcast",
    雨: "rain",
    风: "wind",
    雪: "snow"
  };
  const MOOD_SLUG = {
    很好: "great",
    稳定: "stable",
    一般: "ok",
    偏低: "low",
    很差: "bad"
  };

  const DIST_FALLBACK = {
    weather: {
      clear: "#e8c47a",
      scorch: "#f0b8a0",
      cloudy: "#8eb8ea",
      overcast: "#aeb6ce",
      rain: "#7fa8df",
      wind: "#8fd4c2",
      snow: "#c0e4f2"
    },
    mood: {
      great: "#8fc9a0",
      stable: "#9eb4e8",
      ok: "#dfd19a",
      low: "#e8b896",
      bad: "#e0a0ad"
    }
  };

  const STRIP_FILL_FB = ["#e7ebfb", "#d2d9f5", "#b8c4ec", "#9aaee0", "#7f96d4", "#677fc4"];
  const STRIP_BORDER_FB = ["#cfd5ee", "#bcc5e6", "#a5b1dc", "#8e9cd0", "#7a89c2", "#6676b0"];
  const HEATMAP_GREEN_FB = ["#dff7ee", "#c4f0df", "#9ee4ca", "#74d5b4", "#42bd95", "#14916c"];
  const HEATMAP_FB = {
    habit: HEATMAP_GREEN_FB,
    work: HEATMAP_GREEN_FB
  };

  const FALLBACK = {
    seriesBars: "var(--dash-chart-series-bars, color-mix(in srgb, rgb(8 126 164) 88%, var(--text-normal) 12%))",
    seriesLine: "var(--dash-chart-series-line, color-mix(in srgb, rgb(79 70 229) 90%, var(--text-normal) 10%))",
    seriesGrid: "var(--dash-chart-series-grid, color-mix(in srgb, var(--text-muted) 64%, var(--background-modifier-border) 36%))",
    seriesLeft: "var(--dash-chart-series-left, var(--dash-chart-series-line, rgb(79 70 229)))",
    seriesRight: "var(--dash-chart-series-right, var(--dash-chart-series-bars, rgb(8 126 164)))",
    barFill: "color-mix(in srgb, var(--dash-chart-series-bars, rgb(8 126 164)) 82%, transparent)",
    barStroke: "color-mix(in srgb, var(--dash-chart-series-bars, rgb(8 126 164)) 72%, var(--text-normal))",
    lineStroke: "var(--dash-chart-series-line, rgb(79 70 229))",
    lineMarkerFill: "var(--noria-chart-marker-fill, var(--dash-surface, var(--background-primary)))",
    lineMarkerStroke: "var(--dash-chart-series-line, rgb(79 70 229))",
    gridStroke: "var(--dash-chart-series-grid, color-mix(in srgb, var(--text-muted) 64%, var(--background-modifier-border) 36%))",
    gridOpacity: "0.32",
    axisLeft: "color-mix(in srgb, var(--dash-chart-series-left, rgb(79 70 229)) 58%, transparent)",
    axisRight: "color-mix(in srgb, var(--dash-chart-series-right, rgb(8 126 164)) 58%, transparent)",
    tickLeft: "var(--dash-chart-series-left, rgb(79 70 229))",
    tickRight: "var(--dash-chart-series-right, rgb(8 126 164))",
    tickX: "color-mix(in srgb, var(--text-muted) 86%, var(--dash-chart-series-grid, rgb(100 116 139)) 14%)",
    areaStopTop: "color-mix(in srgb, var(--dash-chart-series-line, rgb(79 70 229)) 18%, transparent)",
    areaStopMid: "color-mix(in srgb, var(--dash-chart-series-line, rgb(79 70 229)) 7%, transparent)",
    areaStopBottom: "color-mix(in srgb, var(--dash-chart-series-line, rgb(79 70 229)) 0%, transparent)"
  };

  const VAR = {
    seriesBars: "--dash-chart-series-bars",
    seriesLine: "--dash-chart-series-line",
    seriesGrid: "--dash-chart-series-grid",
    seriesLeft: "--dash-chart-series-left",
    seriesRight: "--dash-chart-series-right",
    barFill: "--dash-chart-bar-fill",
    barStroke: "--dash-chart-bar-stroke",
    lineStroke: "--dash-chart-line-stroke",
    lineMarkerFill: "--dash-chart-line-marker-fill",
    lineMarkerStroke: "--dash-chart-line-marker-stroke",
    gridStroke: "--dash-chart-grid-stroke",
    gridOpacity: "--dash-chart-grid-opacity",
    axisLeft: "--dash-chart-axis-left",
    axisRight: "--dash-chart-axis-right",
    tickLeft: "--dash-chart-tick-left",
    tickRight: "--dash-chart-tick-right",
    tickX: "--dash-chart-tick-x",
    areaStopTop: "--dash-chart-area-stop-top",
    areaStopMid: "--dash-chart-area-stop-mid",
    areaStopBottom: "--dash-chart-area-stop-bottom"
  };

  function readCssVar(name, fallback) {
    try {
      let v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      if (!v && typeof document !== "undefined" && document.body) {
        v = getComputedStyle(document.body).getPropertyValue(name).trim();
      }
      return v || fallback || "";
    } catch (_) {
      return fallback || "";
    }
  }

  function chartColor(key) {
    const cssVar = VAR[key];
    const fb = FALLBACK[key];
    if (!cssVar) return fb || "";
    const v = readCssVar(cssVar, fb);
    return v || fb || "";
  }

  /** 日态天气 / 心情：按选项 key 取色，与图例、堆叠条一致 */
  function distColor(domain, key) {
    const map = domain === "weather" ? WEATHER_SLUG : domain === "mood" ? MOOD_SLUG : null;
    if (!map || key == null || key === "") return "";
    const slug = map[key];
    if (!slug) return "";
    const varName = `--dash-chart-${domain}-${slug}`;
    const fb = DIST_FALLBACK[domain]?.[slug];
    return readCssVar(varName, fb);
  }

  function stripEmptyFill() {
    return readCssVar("--dash-chart-strip-empty-fill", "rgba(148,163,184,.12)");
  }

  function stripEmptyBorder() {
    return readCssVar("--dash-chart-strip-empty-border", "rgba(100,116,139,.34)");
  }

  function stripFill(level) {
    const L = Math.max(1, Math.min(6, Number(level) || 1));
    return readCssVar(`--dash-chart-strip-fill-${L}`, STRIP_FILL_FB[L - 1]);
  }

  function stripBorder(level) {
    const L = Math.max(1, Math.min(6, Number(level) || 1));
    return readCssVar(`--dash-chart-strip-border-${L}`, STRIP_BORDER_FB[L - 1]);
  }

  function stripGlowRgb() {
    return readCssVar("--dash-chart-strip-glow-rgb", "80, 96, 170").replace(/\s+/g, " ");
  }

  function stripGlowMax() {
    const v = readCssVar("--dash-chart-strip-glow-max", "0.24");
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0.24;
  }

  /** 6 档光晕透明度（低档更轻） */
  function stripGlowAlphas() {
    const gMax = stripGlowMax();
    const g0 = Math.min(0.06, gMax * 0.25);
    return [1, 2, 3, 4, 5, 6].map((k) => g0 + ((gMax - g0) * (k - 1)) / 5);
  }

  function heatmapColor(paletteKey, level) {
    const key = String(paletteKey || "work").trim() || "work";
    const L = Math.max(1, Math.min(6, Number(level) || 1));
    const fb = (HEATMAP_FB[key] || HEATMAP_FB.work)[L - 1];
    return readCssVar(`--dash-heatmap-${key}-level-${L}`, fb);
  }

  function heatmapEmptyFill() {
    return readCssVar("--dash-heatmap-empty-fill", "color-mix(in srgb,var(--background-primary) 82%,rgb(226 232 240))");
  }

  function heatmapEmptyBorder() {
    return readCssVar("--dash-heatmap-empty-border", "transparent");
  }

  function heatmapTodayBorder() {
    return readCssVar("--dash-heatmap-today-border", "color-mix(in srgb,var(--interactive-accent) 72%,var(--text-normal))");
  }

  function heatmapHoverBorder() {
    return readCssVar("--dash-heatmap-hover-border", "color-mix(in srgb,var(--interactive-accent) 55%,var(--background-modifier-border))");
  }

  function heatmapLabelColor() {
    return readCssVar("--dash-heatmap-label-color", "var(--text-muted)");
  }

  root.components.charts.chartPalette = {
    chartColor,
    distColor,
    stripEmptyFill,
    stripEmptyBorder,
    stripFill,
    stripBorder,
    stripGlowRgb,
    stripGlowMax,
    stripGlowAlphas,
    heatmapColor,
    heatmapEmptyFill,
    heatmapEmptyBorder,
    heatmapTodayBorder,
    heatmapHoverBorder,
    heatmapLabelColor,
    FALLBACK,
    VAR,
    DIST_FALLBACK,
    HEATMAP_FB,
    WEATHER_SLUG,
    MOOD_SLUG
  };
})();
