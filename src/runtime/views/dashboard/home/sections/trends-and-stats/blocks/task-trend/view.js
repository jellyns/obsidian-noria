(async () => {
const root = input?.mount || ((typeof this !== "undefined" && this && this.container) ? this.container : (ctx.container || null));
const tTheme = globalThis.dashboardCore?.theme?.home?.trends || {};
const topPanelBg = "transparent";
const topPanelBorder =
  tTheme.noteTrendPanelBorder ||
  "1px solid color-mix(in srgb,var(--background-modifier-border) 74%,rgba(59,130,246,.2))";
const topPanelShadow = tTheme.topPanelShadow || "0 1px 0 color-mix(in srgb,var(--background-primary) 86%,white) inset";
const topPanelRadius = tTheme.topPanelRadius || "14px";
const pal = globalThis.dashboardCore?.components?.charts?.chartPalette;
const chartColor = (k) =>
  typeof pal?.chartColor === "function"
    ? pal.chartColor(k)
    : pal?.FALLBACK?.[k] ?? "";
const noriaBridge = input?.noriaBridge || globalThis.__noriaRuntimeBridge || {};
const taskTrendT = (key, params = {}, fallback = key) => {
  try {
    if (noriaBridge && typeof noriaBridge.t === "function") {
      const direct = noriaBridge.t(key, params);
      if (direct && direct !== key) return String(direct);
    }
    const messages = noriaBridge?.i18n?.messages || {};
    const fallbackMessages = noriaBridge?.i18n?.fallback || {};
    let template = messages[key] || fallbackMessages[key] || fallback || key;
    Object.entries(params || {}).forEach(([k, v]) => {
      template = String(template).replace(new RegExp(`\\{${k}\\}`, "g"), String(v ?? ""));
    });
    return String(template);
  } catch (_) {
    return String(fallback || key || "");
  }
};

const panel = root.createDiv();
panel.style.cssText = `padding:8px;border-radius:${topPanelRadius};background:${topPanelBg};border:${topPanelBorder};box-shadow:${topPanelShadow};width:100%;min-width:0;min-height:0;height:100%;display:flex;flex-direction:column;`;
const stats = input?.statsSnapshot?.domains || {};
const taskCompletion = stats?.tasks?.completion || {};
const series = Array.isArray(stats?.tasks?.completion?.series) && stats.tasks.completion.series.length
  ? stats.tasks.completion.series
  : [{ key: "", label: "", done: 0, planned: 0, open: 0 }];
const days = Math.max(1, series.length);
const dayList = series.map((row) => row.key || "");
const xLabels = series.map((row) => row.label || String(row.key || "").slice(5));
const activityData = series.map((row) => Number(row.planned || 0));
const doneData = series.map((row) => Number(row.done || 0));
const activityMax = Math.max(1, ...activityData);
const doneMax = Math.max(1, ...doneData);
const activityTotal = Number(stats?.tasks?.completion?.activityTotal ?? taskCompletion.planned ?? 0);
const doneTotal = Number(taskCompletion.completed || 0);
const activityAvg = (activityTotal / days).toFixed(1);
const doneAvg = (doneTotal / days).toFixed(1);
const donePeak = Math.max(0, ...doneData);
const activityPeak = Math.max(0, ...activityData);
const rate = Math.min(100, Number(taskCompletion.completionRate || 0));
const undatedCompleted = Number(taskCompletion.undatedCompleted || 0);

const head = panel.createDiv();
head.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;min-width:0;flex-shrink:0;";
const titleMain = head.createDiv({ text: taskTrendT("runtime.home.trends.taskTrendTitle") });
titleMain.className = "dashboard-panel-title";
titleMain.style.cssText = "font-weight:800;font-size:1.02em;color:var(--dash-heading-text,var(--text-normal));letter-spacing:0.01em;line-height:1.25;";
const chips = head.createDiv();
chips.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;min-width:0;";
[
  `${taskTrendT("runtime.home.trends.completionRate")} ${rate}%`,
  `${taskTrendT("runtime.home.trends.undatedCompleted")} ${undatedCompleted}`
].forEach((text) => {
  chips.createDiv({ text }).style.cssText = "padding:2px 8px;border-radius:999px;background:color-mix(in srgb,var(--background-primary) 88%,rgba(99,102,241,.08));border:1px solid color-mix(in srgb,var(--background-modifier-border) 78%,rgba(99,102,241,.16));font-size:.76em;color:var(--text-muted);line-height:1.35;";
});

const chartWrap = panel.createDiv();
chartWrap.style.cssText =
  "flex:1 1 auto;min-height:232px;width:100%;position:relative;border-radius:12px;border:none;overflow:hidden;background:transparent;box-shadow:none;";

const SVG_NS = "http://www.w3.org/2000/svg";
const svgEl = (tag) => document.createElementNS(SVG_NS, tag);
const setAttrs = (el, attrs) => {
  Object.entries(attrs || {}).forEach(([k, v]) => el.setAttribute(k, String(v)));
  return el;
};
const clearEl = (el) => {
  while (el.firstChild) el.removeChild(el.firstChild);
};
const measure = (el, fallback) => {
  try {
    const rect = el?.getBoundingClientRect?.();
    const v = Number(rect?.width || el?.clientWidth || 0);
    if (v > 0) return v;
  } catch (_) {}
  return fallback;
};
const measureH = (el, fallback) => {
  try {
    const rect = el?.getBoundingClientRect?.();
    const v = Number(rect?.height || el?.clientHeight || 0);
    if (v > 0) return v;
  } catch (_) {}
  return fallback;
};
const fmtSmall = (v) => {
  const n = Number(v || 0);
  if (n >= 10000) return `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)}w`;
  return String(n);
};
const smoothPath = (pts) => {
  if (!pts.length) return "";
  if (pts.length < 3) return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ");
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
};

const svg = svgEl("svg");
svg.setAttribute("width", "100%");
svg.setAttribute("height", "100%");
svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
svg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;overflow:hidden;";
chartWrap.appendChild(svg);

const renderChart = () => {
  const chartW = Math.max(360, Math.round(measure(chartWrap, 760)));
  const chartH = Math.max(232, Math.round(measureH(chartWrap, 252)));
  const padL = chartW < 520 ? 40 : 46;
  const padR = chartW < 520 ? 42 : 48;
  const padT = chartH < 235 ? 46 : 54;
  const padB = 28;
  const plotW = Math.max(120, chartW - padL - padR);
  const plotH = Math.max(120, chartH - padT - padB);
  const xAt = (i) => padL + (days <= 1 ? plotW / 2 : (i / (days - 1)) * plotW);
  const yLeft = (v) => padT + plotH - (Number(v || 0) / activityMax) * plotH;
  const yRight = (v) => padT + plotH - (Number(v || 0) / doneMax) * plotH;
  const uid = `tt${Math.random().toString(36).slice(2, 9)}`;
  clearEl(svg);
  svg.setAttribute("viewBox", `0 0 ${chartW} ${chartH}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", taskTrendT("runtime.home.trends.taskTrendTitle"));

  const defs = svgEl("defs");
  const lineAreaGrad = svgEl("linearGradient");
  setAttrs(lineAreaGrad, { id: `taskLineArea-${uid}`, x1: "0", y1: "0", x2: "0", y2: "1" });
  lineAreaGrad.innerHTML = `<stop offset="0%" stop-color="${chartColor("areaStopTop")}"/><stop offset="72%" stop-color="${chartColor("areaStopMid")}"/><stop offset="100%" stop-color="${chartColor("areaStopBottom")}"/>`;
  defs.appendChild(lineAreaGrad);
  svg.appendChild(defs);

  [0, 0.25, 0.5, 0.75, 1].forEach((r) => {
    const y = padT + plotH - r * plotH;
    const grid = svgEl("line");
    setAttrs(grid, {
      x1: padL,
      y1: y,
      x2: padL + plotW,
      y2: y,
      stroke: chartColor("gridStroke"),
      "stroke-opacity": Math.min(0.24, Number(chartColor("gridOpacity")) || 0.22),
      "stroke-dasharray": "3 7"
    });
    svg.appendChild(grid);
  });

  const leftAxis = svgEl("line");
  setAttrs(leftAxis, { x1: padL, y1: padT, x2: padL, y2: padT + plotH, stroke: chartColor("axisLeft"), "stroke-width": "1.8" });
  svg.appendChild(leftAxis);
  const rightAxis = svgEl("line");
  setAttrs(rightAxis, { x1: padL + plotW, y1: padT, x2: padL + plotW, y2: padT + plotH, stroke: chartColor("axisRight"), "stroke-width": "1.8" });
  svg.appendChild(rightAxis);

  const renderAxisStats = (x, anchor, color, total, avg) => {
    const totalText = svgEl("text");
    totalText.classList.add("noria-task-trend-axis-stat", anchor === "end" ? "is-right" : "is-left");
    setAttrs(totalText, { x, y: 11, "text-anchor": anchor, fill: color, "font-size": "10.5", "font-weight": "650" });
    totalText.textContent = `Total: ${total}`;
    svg.appendChild(totalText);
    const avgText = svgEl("text");
    avgText.classList.add("noria-task-trend-axis-stat", anchor === "end" ? "is-right" : "is-left");
    setAttrs(avgText, { x, y: 25, "text-anchor": anchor, fill: color, "font-size": "10.5", "font-weight": "760" });
    avgText.textContent = `Average: ${avg}`;
    svg.appendChild(avgText);
  };
  renderAxisStats(padL, "start", chartColor("tickLeft"), activityTotal, activityAvg);
  renderAxisStats(padL + plotW, "end", chartColor("tickRight"), doneTotal, doneAvg);

  const leftTitle = svgEl("text");
  setAttrs(leftTitle, { x: padL, y: padT - 8, "text-anchor": "start", fill: chartColor("tickLeft"), "font-size": "11", "font-weight": "760" });
  leftTitle.textContent = taskTrendT("runtime.home.trends.activityTotal");
  svg.appendChild(leftTitle);
  const rightTitle = svgEl("text");
  setAttrs(rightTitle, { x: padL + plotW, y: padT - 8, "text-anchor": "end", fill: chartColor("tickRight"), "font-size": "11", "font-weight": "760" });
  rightTitle.textContent = taskTrendT("runtime.home.trends.completedTasks");
  svg.appendChild(rightTitle);

  [0, Math.ceil(activityMax / 2), activityMax].forEach((val) => {
    const tx = svgEl("text");
    setAttrs(tx, { x: padL - 8, y: yLeft(val) + 4, "text-anchor": "end", fill: chartColor("tickLeft"), "font-size": "10.5", "font-weight": "620" });
    tx.textContent = fmtSmall(val);
    svg.appendChild(tx);
  });
  [0, Math.ceil(doneMax / 2), doneMax].forEach((val) => {
    const tx = svgEl("text");
    setAttrs(tx, { x: padL + plotW + 8, y: yRight(val) + 4, "text-anchor": "start", fill: chartColor("tickRight"), "font-size": "10.5", "font-weight": "620" });
    tx.textContent = fmtSmall(val);
    svg.appendChild(tx);
  });

  const bars = [];
  const markers = [];
  const barW = Math.max(4, Math.min(13, Math.floor((plotW / days) * 0.54)));
  activityData.forEach((v, i) => {
    const baseY = padT + plotH;
    const x = xAt(i) - barW / 2;
    const yTop = yLeft(v);
    const h = Math.max(2, baseY - yTop);
    const bar = svgEl("rect");
    setAttrs(bar, {
      x: x.toFixed(1),
      y: yTop.toFixed(1),
      width: barW,
      height: h.toFixed(1),
      rx: Math.min(4, barW / 2),
      ry: Math.min(4, barW / 2),
      fill: chartColor("barFill"),
      stroke: chartColor("barStroke"),
      "stroke-width": "0.7",
      opacity: "0.82"
    });
    svg.appendChild(bar);
    bars[i] = bar;
  });

  const linePoints = doneData.map((v, i) => [xAt(i), yRight(v)]);
  const linePath = smoothPath(linePoints);
  if (linePath) {
    const area = svgEl("path");
    setAttrs(area, { d: `${linePath} L ${xAt(days - 1).toFixed(1)} ${padT + plotH} L ${xAt(0).toFixed(1)} ${padT + plotH} Z`, fill: `url(#taskLineArea-${uid})`, opacity: "0.76" });
    svg.appendChild(area);
    const line = svgEl("path");
    setAttrs(line, {
      d: linePath,
      fill: "none",
      stroke: chartColor("lineStroke"),
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    });
    svg.appendChild(line);
  }

  doneData.forEach((v, i) => {
    const c = svgEl("circle");
    setAttrs(c, { cx: xAt(i).toFixed(1), cy: yRight(v).toFixed(1), r: "2.6", fill: chartColor("lineMarkerFill"), stroke: chartColor("lineMarkerStroke"), "stroke-width": "1.25" });
    svg.appendChild(c);
    markers[i] = c;
  });

  const lastNonZeroIndex = (arr) => {
    for (let i = arr.length - 1; i >= 0; i--) {
      if (Number(arr[i] || 0) > 0) return i;
    }
    return -1;
  };
  const keyIndexes = (arr, peak, avg) => {
    const out = new Set();
    const last = lastNonZeroIndex(arr);
    if (last >= 0) out.add(last);
    arr.forEach((v, i) => {
      const n = Number(v || 0);
      if (n <= 0) return;
      if (n === peak) out.add(i);
      if (n >= Math.max(2, Math.ceil(Number(avg || 0) * 1.8))) out.add(i);
    });
    return Array.from(out).sort((a, b) => a - b);
  };
  const labelRows = [];
  const fitLabelY = (targetY) => {
    let y = Math.max(padT + 10, Math.min(padT + plotH - 6, targetY));
    for (let guard = 0; guard < 10; guard++) {
      const hit = labelRows.some((old) => Math.abs(old - y) < 12);
      if (!hit) break;
      y += 12;
      if (y > padT + plotH - 6) y = Math.max(padT + 10, targetY - 12);
    }
    labelRows.push(y);
    return y;
  };
  const renderKeyLabels = (indexes, data, yFn, color, className, preferRight) => {
    indexes.forEach((i) => {
      const v = Number(data[i] || 0);
      if (v <= 0) return;
      const label = svgEl("text");
      label.classList.add("noria-task-trend-key-label", className);
      const rawX = xAt(i) + (preferRight ? 7 : 6);
      const x = Math.min(Math.max(rawX, padL + 5), padL + plotW - 5);
      const y = fitLabelY(yFn(v) - 8);
      setAttrs(label, {
        x: x.toFixed(1),
        y: y.toFixed(1),
        "text-anchor": x > padL + plotW - 40 ? "end" : "start",
        fill: color,
        "font-size": "10.5",
        "font-weight": "760"
      });
      label.textContent = fmtSmall(v);
      svg.appendChild(label);
    });
  };
  renderKeyLabels(keyIndexes(activityData, activityPeak, activityAvg), activityData, yLeft, chartColor("tickLeft"), "noria-task-trend-activity-key-label", false);
  renderKeyLabels(keyIndexes(doneData, donePeak, doneAvg), doneData, yRight, chartColor("tickRight"), "noria-task-trend-done-key-label", true);

  const labelIndexSet = new Set();
  if (days > 0) {
    const count = chartW < 520 ? 3 : 5;
    for (let i = 0; i < count; i += 1) {
      labelIndexSet.add(Math.round((i / Math.max(1, count - 1)) * (days - 1)));
    }
  }
  Array.from(labelIndexSet).sort((a, b) => a - b).forEach((i) => {
    const tx = svgEl("text");
    setAttrs(tx, { x: xAt(i).toFixed(1), y: chartH - 7, "text-anchor": "middle", fill: chartColor("tickX"), "font-size": "10.5", "font-weight": "620" });
    tx.textContent = xLabels[i] || "";
    svg.appendChild(tx);
  });

  const hoverLine = svgEl("line");
  setAttrs(hoverLine, { x1: padL, y1: padT, x2: padL, y2: padT + plotH, stroke: "color-mix(in srgb,var(--text-muted) 42%,transparent)", "stroke-width": "1", "stroke-dasharray": "3 5", opacity: "0" });
  svg.appendChild(hoverLine);
  const tooltip = svgEl("g");
  tooltip.style.opacity = "0";
  const tipRect = svgEl("rect");
  setAttrs(tipRect, { width: "158", height: "42", rx: "8", fill: "color-mix(in srgb,var(--background-primary) 96%,rgba(255,255,255,.52))", stroke: "color-mix(in srgb,var(--background-modifier-border) 78%,rgba(99,102,241,.22))" });
  tooltip.appendChild(tipRect);
  const tipDate = svgEl("text");
  setAttrs(tipDate, { x: "9", y: "16", fill: "var(--text-normal)", "font-size": "10.5", "font-weight": "720" });
  tooltip.appendChild(tipDate);
  const tipValue = svgEl("text");
  setAttrs(tipValue, { x: "9", y: "32", fill: "var(--text-muted)", "font-size": "10.5", "font-weight": "620" });
  tooltip.appendChild(tipValue);
  svg.appendChild(tooltip);

  const showHover = (i) => {
    const x = xAt(i);
    hoverLine.setAttribute("x1", x.toFixed(1));
    hoverLine.setAttribute("x2", x.toFixed(1));
    hoverLine.setAttribute("opacity", "1");
    bars[i]?.setAttribute("opacity", "1");
    bars[i]?.setAttribute("stroke-width", "1.25");
    markers[i]?.setAttribute("r", "4");
    tipDate.textContent = dayList[i] || xLabels[i] || "";
    tipValue.textContent = `${taskTrendT("runtime.home.trends.activityTotal")} ${activityData[i]} · ${taskTrendT("runtime.home.trends.completedTasks")} ${doneData[i]}`;
    const tx = Math.min(Math.max(x + 10, padL + 4), padL + plotW - 162);
    const ty = Math.max(padT + 4, Math.min(Math.min(yLeft(activityData[i]), yRight(doneData[i])) - 52, padT + plotH - 48));
    tooltip.setAttribute("transform", `translate(${tx.toFixed(1)},${ty.toFixed(1)})`);
    tooltip.style.opacity = "1";
  };
  const hideHover = (i) => {
    hoverLine.setAttribute("opacity", "0");
    tooltip.style.opacity = "0";
    bars[i]?.setAttribute("opacity", "0.82");
    bars[i]?.setAttribute("stroke-width", "0.7");
    markers[i]?.setAttribute("r", "2.6");
  };
  const hitW = Math.max(8, plotW / days);
  series.forEach((_, i) => {
    const hit = svgEl("rect");
    setAttrs(hit, {
      x: (xAt(i) - hitW / 2).toFixed(1),
      y: padT,
      width: hitW.toFixed(1),
      height: plotH,
      fill: "transparent"
    });
    hit.addEventListener("mouseenter", () => showHover(i));
    hit.addEventListener("mouseleave", () => hideHover(i));
    svg.appendChild(hit);
  });
};

renderChart();
try {
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => {
      if (chartWrap.isConnected === false) {
        ro.disconnect();
        return;
      }
      renderChart();
    });
    ro.observe(chartWrap);
  }
} catch (_) {}
})();
