(() => {
  const root = globalThis.dashboardCore || (globalThis.dashboardCore = {});
  root.components = root.components || {};
  root.components.charts = root.components.charts || {};

  function chartT(key, params = {}, fallback = key) {
    try {
      const bridge = globalThis.__noriaRuntimeBridge || {};
      if (typeof bridge.t === "function") return bridge.t(key, params);
    } catch (_) {}
    return String(fallback).replace(/\{(\w+)\}/g, (_, name) => String(params?.[name] ?? ""));
  }

  function displayLabel(domain, value, fallback = value) {
    try {
      const fn = globalThis.__noriaRuntimeBridge?.runtime?.displayLabel;
      if (typeof fn === "function") return fn(domain, value, fallback);
    } catch (_) {}
    return fallback == null ? "" : String(fallback);
  }

  function makeCard(parent, title) {
    const card = parent.createDiv();
    card.style.cssText = "padding:12px;border-radius:14px;background:linear-gradient(180deg,color-mix(in srgb,var(--background-primary) 94%,rgba(59,130,246,.05)),color-mix(in srgb,var(--background-secondary) 88%,rgba(59,130,246,.05)));border:1px solid color-mix(in srgb,var(--background-modifier-border) 74%,rgba(59,130,246,.18));box-shadow:0 2px 10px rgba(15,23,42,.05),inset 0 1px 0 color-mix(in srgb,var(--background-primary) 74%,transparent);";
    const head = card.createDiv();
    head.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;";
    head.createDiv({ text: title }).style.cssText = "font-weight:760;letter-spacing:.2px;color:var(--text-normal);";
    return { card, head };
  }

  function seriesStats(arr) {
    const nums = (arr || []).map((x) => Number(x || 0));
    const total = nums.reduce((a, b) => a + b, 0);
    const peak = Math.max(0, ...nums);
    const avg = nums.length ? (total / nums.length) : 0;
    return { total, peak, avg };
  }

  function renderStripHeatSeries(parent, config) {
    const {
      title = chartT("runtime.chart.stripTrend", {}, "Trend strip"),
      series = [],
      maxValue = 1,
      unit = "",
      statOptions = null,
      showStats = true,
      showAxis = false,
      labels = [],
      headRightText = ""
    } = config || {};

    const chipsRenderer = root.components?.cards?.metricChips?.renderMetricChips;
    const { card, head } = makeCard(parent, title);

    const st = statOptions?.stats || seriesStats(series);
    const totalUnit = statOptions?.totalUnit ?? unit;
    const avgUnit = statOptions?.avgUnit ?? unit;
    const peakUnit = statOptions?.peakUnit ?? unit;
    const totalDigits = Number.isInteger(statOptions?.totalDigits) ? statOptions.totalDigits : 1;
    const avgDigits = Number.isInteger(statOptions?.avgDigits) ? statOptions.avgDigits : 1;
    const peakDigits = Number.isInteger(statOptions?.peakDigits) ? statOptions.peakDigits : 1;
    if (showStats && typeof chipsRenderer === "function") {
      const totalLabel = displayLabel("metric", "总量", chartT("runtime.chart.metricTotal", {}, "Total"));
      const avgLabel = displayLabel("metric", "均值", chartT("runtime.chart.metricAverage", {}, "Average"));
      const peakLabel = displayLabel("metric", "峰值", chartT("runtime.chart.metricPeak", {}, "Peak"));
      chipsRenderer(head, [
        `${totalLabel} ${Number(st.total || 0).toFixed(totalDigits)}${totalUnit}`,
        `${avgLabel} ${Number(st.avg || 0).toFixed(avgDigits)}${avgUnit}`,
        `${peakLabel} ${Number(st.peak || 0).toFixed(peakDigits)}${peakUnit}`
      ]);
    } else if (headRightText) {
      head.createEl("span", { text: headRightText }).style.cssText = "font-size:.85em;color:var(--text-muted);";
    }

    const strip = card.createDiv();
    strip.style.cssText = `display:grid;grid-template-columns:repeat(${Math.max(1, series.length)},minmax(0,1fr));gap:3px;padding:8px;border-radius:10px;background:color-mix(in srgb,var(--background-primary) 88%,rgba(99,102,241,.06));border:1px solid color-mix(in srgb,rgba(59,130,246,.16),var(--background-modifier-border));`;
    const maxV = Math.max(1, maxValue, ...series.map((x) => Number(x || 0)));
    const cp = root.components?.charts?.chartPalette;
    const emptyFill =
      typeof cp?.stripEmptyFill === "function" ? cp.stripEmptyFill() : "rgba(148,163,184,.12)";
    const emptyBorder =
      typeof cp?.stripEmptyBorder === "function" ? cp.stripEmptyBorder() : "rgba(100,116,139,.34)";
    const glowRgb = typeof cp?.stripGlowRgb === "function" ? cp.stripGlowRgb() : "80, 96, 170";
    const glows =
      typeof cp?.stripGlowAlphas === "function" ? cp.stripGlowAlphas() : [0.05, 0.09, 0.13, 0.17, 0.21, 0.24];

    series.forEach((v, i) => {
      const val = Number(v || 0);
      const ratio = Math.max(0, Math.min(1, val / maxV));
      const cell = strip.createDiv();
      if (val <= 0) {
        cell.style.cssText = `height:15px;border-radius:5px;background:${emptyFill};border:1px solid ${emptyBorder};`;
      } else {
        const level = Math.max(1, Math.min(6, Math.ceil(ratio * 6)));
        const fill = typeof cp?.stripFill === "function" ? cp.stripFill(level) : "#d2d9f5";
        const border = typeof cp?.stripBorder === "function" ? cp.stripBorder(level) : "#bcc5e6";
        const glow = glows[level - 1] ?? 0.2;
        cell.style.cssText = `height:15px;border-radius:5px;background:${fill};border:1px solid ${border};box-shadow:0 0 0 1px color-mix(in srgb,var(--background-primary) 58%,transparent) inset,0 1px 5px rgba(${glowRgb},${glow});`;
      }
      cell.title = `${i + 1}: ${val}${unit}`;
    });

    if (showAxis) {
      const axis = card.createDiv();
      axis.style.cssText = "display:flex;justify-content:space-between;margin-top:5px;color:var(--text-muted);font-size:.75em;";
      const startLabel = labels.length ? String(labels[0] || "") : "1";
      const endLabel = labels.length ? String(labels[labels.length - 1] || "") : String(Math.max(1, series.length));
      axis.createEl("span", { text: startLabel });
      axis.createEl("span", { text: endLabel });
    }

    return card;
  }

  root.components.charts.stripHeatSeries = {
    renderStripHeatSeries
  };
})();
