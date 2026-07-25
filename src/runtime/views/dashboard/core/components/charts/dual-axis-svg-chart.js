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
    card.createDiv({ text: title }).style.cssText = "font-weight:760;margin-bottom:8px;letter-spacing:.2px;color:var(--text-normal);";
    return card;
  }

  function seriesStats(arr) {
    const nums = (arr || []).map((x) => Number(x || 0));
    const total = nums.reduce((a, b) => a + b, 0);
    const peak = Math.max(0, ...nums);
    const avg = nums.length ? (total / nums.length) : 0;
    return { total, peak, avg };
  }

  function smoothPath(points) {
    if (!points.length) return "";
    if (points.length < 3) return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ");
    let d = `M ${points[0][0]} ${points[0][1]}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;
      const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
      const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
      const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
      const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`;
    }
    return d;
  }

  function renderDualAxisSvg(parent, config) {
    const {
      title = chartT("runtime.chart.dualAxisTitle", {}, "Dual-axis trend"),
      barSeries = [],
      lineSeries = [],
      labels = [],
      barName = "Bar",
      lineName = "Line",
      statOptions = {}
    } = config || {};

    const pal = root.components?.charts?.chartPalette;
    const chartColor = (k) =>
      typeof pal?.chartColor === "function"
        ? pal.chartColor(k)
        : pal?.FALLBACK?.[k] ?? "";

    const chipsRenderer = root.components?.cards?.metricChips?.renderMetricChips;
    const card = makeCard(parent, title);
    const head = card.createDiv();
    head.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;";

    const barStats = seriesStats(barSeries);
    const lineStats = seriesStats(lineSeries);
    const totalLabel = displayLabel("metric", "总量", chartT("runtime.chart.metricTotal", {}, "Total"));
    const avgLabel = displayLabel("metric", "均值", chartT("runtime.chart.metricAverage", {}, "Average"));
    const peakLabel = displayLabel("metric", "峰值", chartT("runtime.chart.metricPeak", {}, "Peak"));
    const chipText = (name, st, hideTotal) => hideTotal
      ? `${name} ${avgLabel} ${st.avg.toFixed(1)} · ${peakLabel} ${st.peak.toFixed(0)}`
      : `${name} ${totalLabel} ${st.total.toFixed(0)} · ${avgLabel} ${st.avg.toFixed(1)} · ${peakLabel} ${st.peak.toFixed(0)}`;
    const chips = [
      { text: chipText(barName, barStats, !!statOptions.barHideTotal), tone: "cyan" },
      { text: chipText(lineName, lineStats, !!statOptions.lineHideTotal), tone: "purple" }
    ];
    if (typeof chipsRenderer === "function") chipsRenderer(head, chips);

    const n = Math.max(1, barSeries.length);
    const chartW = 900;
    const chartH = 280;
    const padL = 58;
    const padR = 56;
    const padT = 16;
    const padB = 36;
    const plotW = chartW - padL - padR;
    const plotH = chartH - padT - padB;
    const xAt = (i) => n <= 1 ? (padL + plotW / 2) : padL + (i / (n - 1)) * plotW;
    const maxLine = Math.max(1, ...lineSeries.map((x) => Number(x || 0)));
    const maxBar = Math.max(1, ...barSeries.map((x) => Number(x || 0)));
    const yLeft = (v) => padT + plotH - (Number(v || 0) / maxLine) * plotH;
    const yRight = (v) => padT + plotH - (Number(v || 0) / maxBar) * plotH;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${chartW} ${chartH}`);
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "280");
    svg.style.cssText = "display:block;width:100%;height:280px;background:transparent;border-radius:0;border:none;";

    [0, 0.25, 0.5, 0.75, 1].forEach((r) => {
      const y = padT + plotH - r * plotH;
      const g = document.createElementNS("http://www.w3.org/2000/svg", "line");
      g.setAttribute("x1", padL);
      g.setAttribute("y1", y);
      g.setAttribute("x2", padL + plotW);
      g.setAttribute("y2", y);
      g.setAttribute("stroke", chartColor("gridStroke"));
      g.setAttribute("stroke-opacity", chartColor("gridOpacity"));
      g.setAttribute("stroke-dasharray", "4 6");
      svg.appendChild(g);
    });

    const leftAxis = document.createElementNS("http://www.w3.org/2000/svg", "line");
    leftAxis.setAttribute("x1", padL);
    leftAxis.setAttribute("y1", padT);
    leftAxis.setAttribute("x2", padL);
    leftAxis.setAttribute("y2", padT + plotH);
    leftAxis.setAttribute("stroke", chartColor("axisLeft"));
    svg.appendChild(leftAxis);

    const rightAxis = document.createElementNS("http://www.w3.org/2000/svg", "line");
    rightAxis.setAttribute("x1", padL + plotW);
    rightAxis.setAttribute("y1", padT);
    rightAxis.setAttribute("x2", padL + plotW);
    rightAxis.setAttribute("y2", padT + plotH);
    rightAxis.setAttribute("stroke", chartColor("axisRight"));
    svg.appendChild(rightAxis);

    [0, Math.ceil(maxLine / 2), maxLine].forEach((val) => {
      const y = yLeft(val);
      const tx = document.createElementNS("http://www.w3.org/2000/svg", "text");
      tx.setAttribute("x", padL - 8);
      tx.setAttribute("y", y + 4);
      tx.setAttribute("text-anchor", "end");
      tx.setAttribute("fill", chartColor("tickLeft"));
      tx.setAttribute("font-size", "11");
      tx.textContent = String(val);
      svg.appendChild(tx);
    });
    [0, Math.ceil(maxBar / 2), maxBar].forEach((val) => {
      const y = yRight(val);
      const tx = document.createElementNS("http://www.w3.org/2000/svg", "text");
      tx.setAttribute("x", padL + plotW + 8);
      tx.setAttribute("y", y + 4);
      tx.setAttribute("text-anchor", "start");
      tx.setAttribute("fill", chartColor("tickRight"));
      tx.setAttribute("font-size", "11");
      tx.textContent = String(val);
      svg.appendChild(tx);
    });

    const glowId = `lineGlow-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const glow = document.createElementNS("http://www.w3.org/2000/svg", "filter");
    glow.setAttribute("id", glowId);
    glow.innerHTML = "<feGaussianBlur in=\"SourceGraphic\" stdDeviation=\"1.4\" result=\"blur\"/><feMerge><feMergeNode in=\"blur\"/><feMergeNode in=\"SourceGraphic\"/></feMerge>";
    defs.appendChild(glow);
    svg.appendChild(defs);

    const barW = Math.max(4, Math.floor((plotW / n) * 0.58));
    barSeries.forEach((v, i) => {
      const x = xAt(i) - barW / 2;
      const y = yRight(v);
      const bar = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bar.setAttribute("x", x);
      bar.setAttribute("y", y);
      bar.setAttribute("width", barW);
      bar.setAttribute("height", Math.max(1, padT + plotH - y));
      bar.setAttribute("rx", "4");
      bar.setAttribute("fill", chartColor("barFill"));
      bar.setAttribute("stroke", chartColor("barStroke"));
      bar.setAttribute("stroke-width", ".5");
      bar.setAttribute("title", `${labels[i] || i + 1} ${barName} ${v || 0}`);
      svg.appendChild(bar);
    });

    const points = lineSeries.map((v, i) => [xAt(i), yLeft(v)]);
    const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
    line.setAttribute("d", smoothPath(points));
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", chartColor("lineStroke"));
    line.setAttribute("stroke-width", "2.8");
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("stroke-linejoin", "round");
    line.setAttribute("filter", `url(#${glowId})`);
    svg.appendChild(line);

    lineSeries.forEach((v, i) => {
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", xAt(i));
      c.setAttribute("cy", yLeft(v));
      c.setAttribute("r", "2.7");
      c.setAttribute("fill", chartColor("lineMarkerFill"));
      c.setAttribute("stroke", chartColor("lineMarkerStroke"));
      c.setAttribute("stroke-width", "1.2");
      c.setAttribute("title", `${labels[i] || i + 1} ${lineName} ${v || 0}`);
      svg.appendChild(c);
    });

    const tickIdx = Array.from(new Set([0, Math.floor((n - 1) / 3), Math.floor(((n - 1) * 2) / 3), n - 1])).filter((i) => i >= 0 && i < n);
    tickIdx.forEach((i) => {
      const tx = document.createElementNS("http://www.w3.org/2000/svg", "text");
      tx.setAttribute("x", xAt(i));
      tx.setAttribute("y", chartH - 9);
      tx.setAttribute("text-anchor", "middle");
      tx.setAttribute("fill", chartColor("tickX"));
      tx.setAttribute("font-size", "10.5");
      tx.textContent = labels[i] || String(i + 1);
      svg.appendChild(tx);
    });

    card.appendChild(svg);
    return card;
  }

  root.components.charts.dualAxisSvgChart = {
    renderDualAxisSvg
  };
})();
