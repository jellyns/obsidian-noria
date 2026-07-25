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

  function makeCard(parent, title) {
    const card = parent.createDiv();
    card.style.cssText = "padding:12px;border-radius:14px;background:linear-gradient(180deg,color-mix(in srgb,var(--background-primary) 94%,rgba(59,130,246,.05)),color-mix(in srgb,var(--background-secondary) 88%,rgba(59,130,246,.05)));border:1px solid color-mix(in srgb,var(--background-modifier-border) 74%,rgba(59,130,246,.18));box-shadow:0 2px 10px rgba(15,23,42,.05),inset 0 1px 0 color-mix(in srgb,var(--background-primary) 74%,transparent);";
    card.createDiv({ text: title }).style.cssText = "font-weight:760;margin-bottom:8px;letter-spacing:.2px;color:var(--text-normal);";
    return card;
  }

  function renderStackedDistributionBar(parent, config) {
    const {
      title = chartT("runtime.chart.distribution", {}, "Distribution"),
      defs = [],
      countMap = {},
      showLegend = true,
      semanticDomain = null
    } = config || {};

    const card = makeCard(parent, title);
    const palette = root.theme?.chart?.distributionSegments
      || ["#aeb8e8", "#c4b5f0", "#9ec5ef", "#98dce8", "#9fd4b8", "#f0c9a0", "#ecbdc8", "#b8c8e8"];
    const cp = root.components?.charts?.chartPalette;
    const colorOf = (d, i) => {
      if (semanticDomain && typeof cp?.distColor === "function") {
        const c = cp.distColor(semanticDomain, d.key);
        if (c) return c;
      }
      return palette[i % palette.length];
    };
    const total = Math.max(1, Object.values(countMap).reduce((a, b) => a + Number(b || 0), 0));
    const hasData = defs.some((d) => Number(countMap[d.key] || 0) > 0);
    if (!hasData) {
      card.createDiv({ text: chartT("runtime.chart.noRecords", {}, "No records") }).style.cssText = "color:var(--text-muted);font-size:.88em;";
      return card;
    }

    const rail = card.createDiv();
    rail.style.cssText =
      "position:relative;height:18px;border-radius:999px;background:color-mix(in srgb,rgba(59,130,246,.1),rgba(148,163,184,.06));border:1px solid color-mix(in srgb,rgba(59,130,246,.22),var(--background-modifier-border));overflow:visible;margin-top:4px;";
    const track = rail.createDiv();
    track.style.cssText = "position:absolute;inset:0;border-radius:999px;overflow:hidden;";
    let leftPct = 0;
    defs.forEach((d, i) => {
      const count = Number(countMap[d.key] || 0);
      if (count <= 0) return;
      const pct = Math.max(0, Math.min(100, (count / total) * 100));
      const seg = track.createDiv();
      const c = colorOf(d, i);
      seg.style.cssText = `position:absolute;left:${leftPct}%;width:${pct}%;top:0;bottom:0;background:linear-gradient(180deg,color-mix(in srgb,var(--background-primary) 32%,transparent) 0%,transparent 48%),linear-gradient(180deg,${c} 0%,${c} 100%);box-shadow:inset 0 1px 0 color-mix(in srgb,var(--background-primary) 44%,transparent),inset -1px 0 0 rgba(15,23,42,.12);`;
      seg.title = `${d.emoji || "•"} ${d.key}: ${count} (${pct.toFixed(1)}%)`;
      const marker = rail.createDiv({ text: d.emoji || "•" });
      marker.style.cssText = `position:absolute;left:${leftPct + pct / 2}%;top:-15px;transform:translateX(-50%);font-size:.84em;line-height:1;pointer-events:none;filter:drop-shadow(0 1px 1px color-mix(in srgb,var(--background-primary) 86%,transparent));`;
      leftPct += pct;
    });

    if (showLegend) {
      const legend = card.createDiv();
      legend.style.cssText = "display:flex;flex-wrap:wrap;gap:6px 10px;margin-top:10px;";
      defs.forEach((d, i) => {
        const count = Number(countMap[d.key] || 0);
        if (count <= 0) return;
        const pct = (count / total) * 100;
        const row = legend.createDiv();
        row.style.cssText =
          "display:flex;align-items:center;gap:6px;padding:3px 8px;border-radius:999px;background:color-mix(in srgb,var(--background-primary) 94%,rgba(59,130,246,.04));border:1px solid color-mix(in srgb,rgba(59,130,246,.14),var(--background-modifier-border));";
        const dot = row.createEl("span");
        const dotC = colorOf(d, i);
        dot.style.cssText = `display:inline-block;width:9px;height:9px;border-radius:999px;background:${dotC};box-shadow:inset 0 0 0 1px rgba(15,23,42,.08);flex-shrink:0;`;
        row.createEl("span", { text: `${d.emoji || "•"} ${d.key} ${pct.toFixed(1)}%` }).style.cssText =
          "font-size:.8em;color:var(--text-muted);";
      });
    }

    return card;
  }

  root.components.charts.stackedDistributionBar = {
    renderStackedDistributionBar
  };
})();
