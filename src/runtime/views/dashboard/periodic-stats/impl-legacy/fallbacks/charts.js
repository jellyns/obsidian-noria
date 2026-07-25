(() => {
  let svgIdSeq = 0;
  function nextSvgId(prefix) {
    svgIdSeq += 1;
    return `${prefix}-${svgIdSeq}`;
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

  globalThis.dashboardPeriodicStatsFallbackChartsFactory = function createFallbackCharts(ctx) {
    const makeCard = ctx?.makeCard;
    const addStatChips = ctx?.addStatChips;
    const seriesStats = ctx?.seriesStats;
    const chartAdapter = ctx?.chartAdapter || {};
    const bridge = ctx?.bridge || globalThis.__noriaRuntimeBridge || {};
    const chartT = (key, params = {}) => {
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

    function renderDistCard(parent, title, defs, countMap) {
      const card = makeCard(parent, title);
      const total = Math.max(1, Object.values(countMap).reduce((a, b) => a + Number(b || 0), 0));
      const palette = ["#6366f1", "#3b82f6", "#06b6d4", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#0ea5e9"];
      const hasData = defs.some((d) => Number(countMap[d.key] || 0) > 0);
      if (!hasData) {
        card.createDiv({ text: chartT("runtime.chart.noRecords") }).style.cssText = "color:var(--text-muted);font-size:.88em;";
        return;
      }

      const rail = card.createDiv();
      rail.style.cssText = "position:relative;height:16px;border-radius:999px;background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.14);overflow:visible;margin-top:2px;";
      const track = rail.createDiv();
      track.style.cssText = "position:absolute;inset:0;border-radius:999px;overflow:hidden;";
      let leftPct = 0;
      defs.forEach((d, i) => {
        const count = Number(countMap[d.key] || 0);
        if (count <= 0) return;
        const pct = Math.max(0, Math.min(100, (count / total) * 100));
        const seg = track.createDiv();
        seg.style.cssText = `position:absolute;left:${leftPct}%;width:${pct}%;top:0;bottom:0;background:linear-gradient(90deg, ${palette[i % palette.length]}cc, ${palette[i % palette.length]}99);`;
        seg.title = `${d.emoji || "•"} ${d.key}: ${count} (${pct.toFixed(1)}%)`;
        const marker = rail.createDiv({ text: d.emoji || "•" });
        marker.style.cssText = `position:absolute;left:${leftPct + pct / 2}%;top:-13px;transform:translateX(-50%);font-size:.76em;line-height:1;pointer-events:none;`;
        leftPct += pct;
      });

      const legend = card.createDiv();
      legend.style.cssText = "display:flex;flex-wrap:wrap;gap:6px 10px;margin-top:8px;";
      defs.forEach((d, i) => {
        const count = Number(countMap[d.key] || 0);
        if (count <= 0) return;
        const pct = count > 0 ? (count / total) * 100 : 0;
        const row = legend.createDiv();
        row.style.cssText = "display:flex;align-items:center;gap:6px;padding:2px 6px;border-radius:999px;background:color-mix(in srgb,var(--background-primary) 88%,rgba(59,130,246,.04));border:1px solid rgba(59,130,246,.12);";
        const dot = row.createEl("span");
        dot.style.cssText = `display:inline-block;width:8px;height:8px;border-radius:999px;background:${palette[i % palette.length]};`;
        row.createEl("span", { text: `${d.emoji || "•"} ${d.key} ${pct.toFixed(1)}%` }).style.cssText = "font-size:.78em;color:var(--text-muted);";
      });
    }

    function renderSimpleSeries(parent, title, series, maxValue, unit, statOptions = null) {
      const card = parent.createDiv();
      card.style.cssText = "padding:12px;border-radius:14px;background:linear-gradient(180deg,color-mix(in srgb,var(--background-primary) 94%,rgba(59,130,246,.05)),color-mix(in srgb,var(--background-secondary) 88%,rgba(59,130,246,.05)));border:1px solid color-mix(in srgb,var(--background-modifier-border) 74%,rgba(59,130,246,.2));box-shadow:0 2px 10px rgba(15,23,42,.05),inset 0 1px 0 color-mix(in srgb,var(--background-primary) 72%,transparent);";
      const head = card.createDiv();
      head.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;";
      head.createDiv({ text: title }).style.cssText = "font-weight:760;letter-spacing:.2px;color:var(--text-normal);";
      const st = statOptions?.stats || seriesStats(series);
      const totalUnit = statOptions?.totalUnit ?? unit;
      const avgUnit = statOptions?.avgUnit ?? unit;
      const peakUnit = statOptions?.peakUnit ?? unit;
      const totalDigits = Number.isInteger(statOptions?.totalDigits) ? statOptions.totalDigits : 1;
      const avgDigits = Number.isInteger(statOptions?.avgDigits) ? statOptions.avgDigits : 1;
      const peakDigits = Number.isInteger(statOptions?.peakDigits) ? statOptions.peakDigits : 1;
      addStatChips(head, [
        `${chartT("runtime.chart.metricTotal")} ${Number(st.total || 0).toFixed(totalDigits)}${totalUnit}`,
        `${chartT("runtime.chart.metricAverage")} ${Number(st.avg || 0).toFixed(avgDigits)}${avgUnit}`,
        `${chartT("runtime.chart.metricPeak")} ${Number(st.peak || 0).toFixed(peakDigits)}${peakUnit}`
      ]);
      const strip = card.createDiv();
      strip.style.cssText = `display:grid;grid-template-columns:repeat(${Math.max(1, series.length)},minmax(0,1fr));gap:2px;padding:8px;border-radius:10px;background:color-mix(in srgb,var(--background-primary) 88%,rgba(59,130,246,.05));border:1px solid rgba(59,130,246,.14);`;
      const maxV = Math.max(1, maxValue, ...series.map((x) => Number(x || 0)));
      series.forEach((v, i) => {
        const val = Number(v || 0);
        const ratio = Math.max(0, Math.min(1, val / maxV));
        const cell = strip.createDiv();
        if (val <= 0) {
          cell.style.cssText = "height:14px;border-radius:4px;background:rgba(148,163,184,.12);border:1px solid rgba(148,163,184,.2);";
        } else {
          const level = Math.max(1, Math.min(6, Math.ceil(ratio * 6)));
          const fills = ["#e0e7ff", "#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#1d4ed8"];
          const borders = ["#93c5fd", "#60a5fa", "#3b82f6", "#2563eb", "#1d4ed8", "#1e40af"];
          const glows = [0.08, 0.12, 0.18, 0.24, 0.30, 0.36];
          const fill = fills[level - 1];
          const border = borders[level - 1];
          const glow = glows[level - 1];
          cell.style.cssText = `height:14px;border-radius:4px;background:${fill};border:1px solid ${border};box-shadow:0 0 0 1px color-mix(in srgb,var(--background-primary) 58%,transparent) inset, 0 1px 7px rgba(37,99,235,${glow}), 0 0 10px rgba(79,70,229,${Math.max(0, glow - 0.08)});`;
        }
        cell.title = `${i + 1}: ${val}${unit}`;
      });
    }

    function renderDualAxis(parent, title, barSeries, lineSeries, labels, barName, lineName, statOptions = null) {
      if (typeof chartAdapter.renderDualAxis === "function") {
        const rendered = chartAdapter.renderDualAxis(parent, {
          title,
          barSeries,
          lineSeries,
          labels,
          barName,
          lineName,
          statOptions: statOptions || {}
        });
        if (rendered) return rendered;
      }
      const card = makeCard(parent, title);
      const barStats = seriesStats(barSeries);
      const lineStats = seriesStats(lineSeries);
      const lineHideTotal = !!statOptions?.lineHideTotal;
      const barHideTotal = !!statOptions?.barHideTotal;
      const formatStatChip = (name, st, hideTotal = false) => {
        if (hideTotal) return `${name} ${chartT("runtime.chart.metricAverage")} ${st.avg.toFixed(1)} · ${chartT("runtime.chart.metricPeak")} ${st.peak.toFixed(0)}`;
        return `${name} ${chartT("runtime.chart.metricTotal")} ${st.total.toFixed(0)} · ${chartT("runtime.chart.metricAverage")} ${st.avg.toFixed(1)} · ${chartT("runtime.chart.metricPeak")} ${st.peak.toFixed(0)}`;
      };
      const head = card.createDiv();
      head.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;";
      addStatChips(head, [
        { text: formatStatChip(barName, barStats, barHideTotal), tone: "cyan" },
        { text: formatStatChip(lineName, lineStats, lineHideTotal), tone: "purple" }
      ]);
      const n = Math.max(1, barSeries.length);
      const chartW = 900;
      const chartH = 280;
      const padL = 58, padR = 56, padT = 16, padB = 36;
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
      svg.style.cssText = "display:block;width:100%;height:280px;background:color-mix(in srgb,var(--background-primary) 88%,rgba(59,130,246,.04));border-radius:10px;border:1px solid rgba(59,130,246,.14);";

      [0, 0.25, 0.5, 0.75, 1].forEach((r) => {
        const y = padT + plotH - r * plotH;
        const g = document.createElementNS("http://www.w3.org/2000/svg", "line");
        g.setAttribute("x1", padL); g.setAttribute("y1", y); g.setAttribute("x2", padL + plotW); g.setAttribute("y2", y);
        g.setAttribute("stroke", "rgba(71,85,105,.24)"); g.setAttribute("stroke-dasharray", "4 6");
        svg.appendChild(g);
      });

      const leftAxis = document.createElementNS("http://www.w3.org/2000/svg", "line");
      leftAxis.setAttribute("x1", padL); leftAxis.setAttribute("y1", padT); leftAxis.setAttribute("x2", padL); leftAxis.setAttribute("y2", padT + plotH);
      leftAxis.setAttribute("stroke", "rgba(99,102,241,.62)");
      svg.appendChild(leftAxis);
      const rightAxis = document.createElementNS("http://www.w3.org/2000/svg", "line");
      rightAxis.setAttribute("x1", padL + plotW); rightAxis.setAttribute("y1", padT); rightAxis.setAttribute("x2", padL + plotW); rightAxis.setAttribute("y2", padT + plotH);
      rightAxis.setAttribute("stroke", "rgba(14,165,233,.52)");
      svg.appendChild(rightAxis);

      [0, Math.ceil(maxLine / 2), maxLine].forEach((val) => {
        const y = yLeft(val);
        const tx = document.createElementNS("http://www.w3.org/2000/svg", "text");
        tx.setAttribute("x", padL - 8); tx.setAttribute("y", y + 4); tx.setAttribute("text-anchor", "end");
        tx.setAttribute("fill", "rgba(67,56,202,.92)"); tx.setAttribute("font-size", "11");
        tx.textContent = String(val);
        svg.appendChild(tx);
      });
      [0, Math.ceil(maxBar / 2), maxBar].forEach((val) => {
        const y = yRight(val);
        const tx = document.createElementNS("http://www.w3.org/2000/svg", "text");
        tx.setAttribute("x", padL + plotW + 8); tx.setAttribute("y", y + 4); tx.setAttribute("text-anchor", "start");
        tx.setAttribute("fill", "rgba(3,105,161,.92)"); tx.setAttribute("font-size", "11");
        tx.textContent = String(val);
        svg.appendChild(tx);
      });

      const gradId = nextSvgId("barGrad");
      const glowId = nextSvgId("lineGlow");
      const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      const barGrad = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
      barGrad.setAttribute("id", gradId);
      barGrad.setAttribute("x1", "0"); barGrad.setAttribute("y1", "1"); barGrad.setAttribute("x2", "0"); barGrad.setAttribute("y2", "0");
      barGrad.innerHTML = `<stop offset="0%" stop-color="#60a5fa" stop-opacity=".36"/><stop offset="100%" stop-color="#38bdf8" stop-opacity=".95"/>`;
      defs.appendChild(barGrad);
      const glow = document.createElementNS("http://www.w3.org/2000/svg", "filter");
      glow.setAttribute("id", glowId);
      glow.innerHTML = '<feGaussianBlur in="SourceGraphic" stdDeviation="1.4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>';
      defs.appendChild(glow);
      svg.appendChild(defs);

      const barW = Math.max(4, Math.floor((plotW / n) * 0.58));
      barSeries.forEach((v, i) => {
        const x = xAt(i) - barW / 2;
        const y = yRight(v);
        const bar = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        bar.setAttribute("x", x); bar.setAttribute("y", y);
        bar.setAttribute("width", barW); bar.setAttribute("height", Math.max(1, padT + plotH - y));
        bar.setAttribute("rx", "4");
        bar.setAttribute("fill", `url(#${gradId})`);
        bar.setAttribute("fill-opacity", "0.78");
        bar.setAttribute("stroke", "rgba(56,189,248,.38)");
        bar.setAttribute("stroke-width", ".5");
        bar.setAttribute("title", `${labels[i] || i + 1} ${barName} ${v || 0}`);
        svg.appendChild(bar);
      });

      const points = lineSeries.map((v, i) => [xAt(i), yLeft(v)]);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
      line.setAttribute("d", smoothPath(points));
      line.setAttribute("fill", "none");
      line.setAttribute("stroke", "#6366f1");
      line.setAttribute("stroke-width", "2.8");
      line.setAttribute("stroke-linecap", "round");
      line.setAttribute("stroke-linejoin", "round");
      line.setAttribute("filter", `url(#${glowId})`);
      svg.appendChild(line);
      lineSeries.forEach((v, i) => {
        const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        c.setAttribute("cx", xAt(i)); c.setAttribute("cy", yLeft(v)); c.setAttribute("r", "2.7");
        c.setAttribute("fill", "var(--background-primary)"); c.setAttribute("stroke", "#6366f1"); c.setAttribute("stroke-width", "1.2");
        c.setAttribute("title", `${labels[i] || i + 1} ${lineName} ${v || 0}`);
        svg.appendChild(c);
      });

      const tickIdx = Array.from(new Set([0, Math.floor((n - 1) / 3), Math.floor(((n - 1) * 2) / 3), n - 1])).filter((i) => i >= 0 && i < n);
      tickIdx.forEach((i) => {
        const tx = document.createElementNS("http://www.w3.org/2000/svg", "text");
        tx.setAttribute("x", xAt(i)); tx.setAttribute("y", chartH - 9); tx.setAttribute("text-anchor", "middle");
        tx.setAttribute("fill", "rgba(71,85,105,.9)"); tx.setAttribute("font-size", "10.5");
        tx.textContent = labels[i] || String(i + 1);
        svg.appendChild(tx);
      });

      card.appendChild(svg);
    }

    function renderDualAxisSwitchable(parent, config) {
      const wrap = parent.createDiv();
      wrap.style.cssText = "display:flex;flex-direction:column;gap:6px;";
      const bar = wrap.createDiv();
      bar.style.cssText = "display:flex;justify-content:flex-end;gap:2px;";
      const btnWeek = bar.createEl("button", { text: chartT("runtime.stats.groupByWeek") });
      const btnMonth = bar.createEl("button", { text: chartT("runtime.stats.groupByMonth") });
      const setBtn = (btn, active) => {
        try { btn.classList.add("dashboard-heatmap-mode-button"); } catch (_) {}
        try { btn.classList.toggle("is-active", !!active); } catch (_) {}
        try { btn.setAttribute("aria-pressed", active ? "true" : "false"); } catch (_) {}
        btn.style.cssText = active
          ? "height:28px;min-height:28px;padding:0 9px;border-radius:8px;border:0;box-shadow:none;background:color-mix(in srgb,var(--interactive-accent) 14%,var(--background-primary));color:var(--text-normal);font-size:13px;font-weight:720;line-height:1;letter-spacing:0;"
          : "height:28px;min-height:28px;padding:0 9px;border-radius:8px;border:0;box-shadow:none;background:transparent;color:var(--text-muted);font-size:13px;font-weight:650;line-height:1;letter-spacing:0;";
      };
      const host = wrap.createDiv();
      const draw = (mode) => {
        host.empty();
        const s = mode === "month" ? config.month : config.week;
        renderDualAxis(host, s.title, s.bar, s.line, s.labels, s.barName, s.lineName, s.statOptions || null);
        setBtn(btnWeek, mode === "week");
        setBtn(btnMonth, mode === "month");
      };
      btnWeek.onclick = () => draw("week");
      btnMonth.onclick = () => draw("month");
      draw("week");
    }

    return {
      renderDistCard,
      renderSimpleSeries,
      renderDualAxis,
      renderDualAxisSwitchable
    };
  };
})();
