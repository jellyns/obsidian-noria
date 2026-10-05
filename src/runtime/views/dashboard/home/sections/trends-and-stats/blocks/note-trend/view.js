(async () => {
const root = input?.mount || ((typeof this !== "undefined" && this && this.container) ? this.container : (ctx.container || null));
const t = globalThis.dashboardCore?.theme?.home?.trends || {};
const topPanelBg = "transparent";
const topPanelBorder =
  t.noteTrendPanelBorder ||
  "1px solid color-mix(in srgb,var(--background-modifier-border) 74%,rgba(59,130,246,.2))";
const topPanelShadow = t.topPanelShadow || "0 1px 0 color-mix(in srgb,var(--background-primary) 86%,white) inset";
const topPanelRadius = t.topPanelRadius || "14px";

const pal = globalThis.dashboardCore?.components?.charts?.chartPalette;
const chartColor = (k) =>
  typeof pal?.chartColor === "function"
    ? pal.chartColor(k)
    : pal?.FALLBACK?.[k] ?? "";
const noriaBridge = input?.noriaBridge || globalThis.__noriaRuntimeBridge || {};
const noteTrendT = (key, params = {}) => {
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

let days = 30;
const today = new Date();
today.setHours(0, 0, 0, 0);
const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const normalizeFileDate = (value) => {
  if (!value) return "";
  if (value instanceof Date) return fmt(value);
  if (typeof value === "number" && Number.isFinite(value)) return fmt(new Date(value));
  try {
    if (typeof value.toISODate === "function") return String(value.toISODate()).slice(0, 10);
    if (typeof value.toFormat === "function") return String(value.toFormat("yyyy-MM-dd")).slice(0, 10);
    if (typeof value.format === "function") return String(value.format("YYYY-MM-DD")).slice(0, 10);
  } catch (_) {}
  const raw = String(value || "").trim();
  if (/^\d{12,}$/.test(raw)) return fmt(new Date(Number(raw)));
  const m = raw.match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : "";
};
const noteCreatedValue = (page) => page?.created || page?.file?.ctime;
let dayList = [];
for (let i = days - 1; i >= 0; i--) {
  const d = new Date(today);
  d.setDate(today.getDate() - i);
  dayList.push(fmt(d));
}
let xLabels = dayList.map((ds) => ds.slice(5));
let noteData = [];
let wordData = [];
const snapshotNoteTrend = input?.statsSnapshot?.domains?.notes?.trend
  || input?.statsSnapshot?.views?.home?.noteTrend
  || null;
const snapshotRows = Array.isArray(snapshotNoteTrend?.series) ? snapshotNoteTrend.series : [];
const NOTE_TREND_CACHE_KEY = "__noria_home_note_trend_cache_v1";
const getNoteTrendCacheState = () => {
  try {
    const g = globalThis;
    if (!g[NOTE_TREND_CACHE_KEY]) g[NOTE_TREND_CACHE_KEY] = {};
    return g[NOTE_TREND_CACHE_KEY];
  } catch (_) {
    return {};
  }
};
const buildNoteTrendCacheKey = (pagesForKey) => {
  let maxMtime = "";
  for (const p of pagesForKey) {
    const mt = String(p?.file?.mtime || "");
    if (mt && mt > maxMtime) maxMtime = mt;
  }
  return `${pagesForKey.length}|${maxMtime}|${dayList[0]}|${dayList[dayList.length - 1]}`;
};
async function runNoteTrendDiaryReadQueue(queue, limit = 8) {
  if (!Array.isArray(queue) || queue.length === 0) return;
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (index < queue.length) {
      const job = queue[index++];
      if (typeof job === "function") await job();
    }
  });
  await Promise.all(workers);
}
const normDate = (name) => (/^\d{8}$/.test(name) ? `${name.slice(0, 4)}-${name.slice(4, 6)}-${name.slice(6, 8)}` : name);
if (snapshotRows.length) {
  dayList = snapshotRows.map((row) => row.key || "");
  days = Math.max(1, snapshotRows.length);
  xLabels = snapshotRows.map((row) => row.label || String(row.key || "").slice(5));
  noteData = snapshotRows.map((row) => Number(row.notes || 0));
  wordData = snapshotRows.map((row) => Number(row.words || 0));
} else {
  const daySet = new Set(dayList);
  const noteCountMap = {};
  noriaNotePages().forEach((p) => {
    const ds = normalizeFileDate(noteCreatedValue(p));
    if (daySet.has(ds)) noteCountMap[ds] = (noteCountMap[ds] || 0) + 1;
  });
  const diaryPages = (noriaBridge.runtime?.pagesForManagedPath?.("diaryRoot", ctx) || []).filter((p) => {
    const raw = (p.file.name || "").replace(".md", "");
    const ds = normDate(raw);
    return /^\d{4}-\d{2}-\d{2}$/.test(ds) && daySet.has(ds);
  });
  const wordCountMap = {};
  const noteTrendCache = getNoteTrendCacheState();
  const noteTrendCacheKey = buildNoteTrendCacheKey(diaryPages);
  if (noteTrendCache.key === noteTrendCacheKey && noteTrendCache.wordCountMap) {
    Object.assign(wordCountMap, noteTrendCache.wordCountMap);
  } else {
    const noteTrendDiaryWordReads = [];
    for (const p of diaryPages) {
      noteTrendDiaryWordReads.push(async () => {
        try {
          const raw = (p.file.name || "").replace(".md", "");
          const ds = normDate(raw);
          const content = await ctx.io.load(p.file.path);
          wordCountMap[ds] = (wordCountMap[ds] || 0) + String(content || "").replace(/\s+/g, "").length;
        } catch (_) {}
      });
    }
    await runNoteTrendDiaryReadQueue(noteTrendDiaryWordReads);
    noteTrendCache.key = noteTrendCacheKey;
    noteTrendCache.wordCountMap = { ...wordCountMap };
  }
  noteData = dayList.map((ds) => noteCountMap[ds] || 0);
  wordData = dayList.map((ds) => wordCountMap[ds] || 0);
}
const noteMax = Math.max(1, ...noteData);
const wordMax = Math.max(1, ...wordData);
const noteTotal = noteData.reduce((a, b) => a + b, 0);
const wordTotal = wordData.reduce((a, b) => a + b, 0);
const noteAvg = (noteTotal / days).toFixed(1);
const wordAvg = Math.round(wordTotal / days);
const notePeak = Math.max(0, ...noteData);
const wordPeak = Math.max(0, ...wordData);

const panel = root.createDiv();
panel.style.cssText = `padding:12px;border-radius:${topPanelRadius};background:${topPanelBg};border:${topPanelBorder};box-shadow:${topPanelShadow};width:100%;min-width:0;min-height:0;height:100%;display:flex;flex-direction:column;`;
if (input?.cardContent) Object.assign(panel.style, {padding:"0",border:"0",boxShadow:"none",background:"transparent"});
const isNarrow = (root?.clientWidth || 0) > 0 && (root?.clientWidth || 0) < 760;
const head = panel.createDiv();
head.addClass("noria-card-heading");
head.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;min-width:0;flex-shrink:0;";
const titleRow = head.createDiv();
titleRow.style.cssText = "display:flex;align-items:center;min-width:0;";
const titleMain = titleRow.createDiv({ text: noteTrendT("runtime.home.trends.noteTrendTitle") });
titleMain.className = "dashboard-panel-title";
titleMain.style.cssText = "font-weight:800;font-size:1.02em;color:var(--dash-heading-text,var(--text-normal));letter-spacing:0.01em;line-height:1.25;";

if (input?.cardContent) { head.remove(); }

const chartWrap = panel.createDiv();
/* 仅保留外层 panel 一道描边：内层不再叠 border/内阴影/高白渐变，避免「双线夹白条」噪声 */
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
const countLinePath = (pts) => {
  if(!pts.length)return "";
  const slopes=pts.slice(1).map((p,i)=>(p[1]-pts[i][1])/(p[0]-pts[i][0]));
  const tangent=i=>i===0?slopes[0]:i===pts.length-1?slopes.at(-1):slopes[i-1]*slopes[i]<=0?0:2*slopes[i-1]*slopes[i]/(slopes[i-1]+slopes[i]);
  let path=`M ${pts[0][0]} ${pts[0][1]}`;
  for(let i=0;i<pts.length-1;i++){
    const a=pts[i],b=pts[i+1],dx=(b[0]-a[0])/3;
    path+=` C ${a[0]+dx} ${a[1]+tangent(i)*dx}, ${b[0]-dx} ${b[1]-tangent(i+1)*dx}, ${b[0]} ${b[1]}`;
  }
  return path;
};

const svg = svgEl("svg");
svg.setAttribute("width", "100%");
svg.setAttribute("height", "100%");
svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
svg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;overflow:hidden;";
chartWrap.appendChild(svg);

const announcement=chartWrap.createDiv({cls:"noria-trend-announcement",attr:{role:"status","aria-live":"polite"}});
let inspecting=false;
let selectedIndex = Math.max(0,dayList.findLastIndex((_,i)=>noteData[i]||wordData[i]));
chartWrap.classList.add("noria-trend-interactive");
if(noriaBridge.runtime?.openTrendSources&&snapshotRows.some(row=>row.sources))chartWrap.dataset.sourceDetails='true';
chartWrap.setAttribute("tabindex","0");chartWrap.setAttribute("role","group");
chartWrap.setAttribute("aria-label",/^zh/.test(noriaBridge.locale||"")?"趋势图：左右键选择日期，Home／End 到首尾，点击或 Enter 查看来源。":"Trend: arrow keys select dates; Home / End select first / last. Click or Enter to inspect sources.");

const renderChart = () => {
  const chartW = Math.max(240, Math.round(measure(chartWrap, 760)));
  const chartH = Math.max(232, Math.round(measureH(chartWrap, 252)));
  const padL = chartW < 520 ? 40 : 46;
  const padR = chartW < 520 ? 42 : 48;
  const padT = chartH < 235 ? 46 : 54;
  const padB = 28;
  const plotW = Math.max(120, chartW - padL - padR);
  const plotH = Math.max(120, chartH - padT - padB);
  const xAt = (i) => padL + (i + .5) / days * plotW;
  const yLeft = (v) => padT + plotH - (Number(v || 0) / noteMax) * plotH;
  const yRight = (v) => padT + plotH - (Number(v || 0) / wordMax) * plotH;
  const uid = `nt${Math.random().toString(36).slice(2, 9)}`;
  clearEl(svg);
  svg.setAttribute("viewBox", `0 0 ${chartW} ${chartH}`);
  svg.setAttribute("role", "img");
  // Obsidian's aria-label tooltip handler only supports HTML elements.
  svg.setAttribute("aria-labelledby", `${uid}-title`);
  const chartTitle = setAttrs(svgEl("title"), { id: `${uid}-title` });
  chartTitle.textContent = noteTrendT("runtime.home.trends.noteTrendAria", { days });
  svg.appendChild(chartTitle);

  const defs = svgEl("defs");
  const lineAreaGrad = svgEl("linearGradient");
  setAttrs(lineAreaGrad, { id: `lineArea-${uid}`, x1: "0", y1: "0", x2: "0", y2: "1" });
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
    totalText.classList.add("noria-note-trend-axis-stat", anchor === "end" ? "is-right" : "is-left");
    setAttrs(totalText, { x, y: 11, "text-anchor": anchor, fill: color, "font-size": "12", "font-weight": "650" });
    totalText.textContent = `${/^zh/.test(String(noriaBridge.locale || "")) ? "总计" : "Total"}: ${total}`;
    svg.appendChild(totalText);
    const avgText = svgEl("text");
    avgText.classList.add("noria-note-trend-axis-stat", anchor === "end" ? "is-right" : "is-left");
    setAttrs(avgText, { x, y: 25, "text-anchor": anchor, fill: color, "font-size": "12", "font-weight": "760" });
    avgText.textContent = `${/^zh/.test(String(noriaBridge.locale || "")) ? "平均" : "Average"}: ${avg}`;
    svg.appendChild(avgText);
  };
  renderAxisStats(padL, "start", chartColor("tickLeft"), noteTotal, noteAvg);
  renderAxisStats(padL + plotW, "end", chartColor("tickRight"), wordTotal.toLocaleString(), wordAvg.toLocaleString());

  const axisFill = chartColor("tickX");
  const leftTitle = svgEl("text");
  leftTitle.classList.add("noria-note-trend-axis-title");
  setAttrs(leftTitle, { x: padL, y: padT - 8, "text-anchor": "start", fill: chartColor("tickLeft"), "font-size": "12", "font-weight": "760" });
  leftTitle.textContent = noteTrendT("runtime.home.trends.newNotes");
  svg.appendChild(leftTitle);
  const rightTitle = svgEl("text");
  rightTitle.classList.add("noria-note-trend-axis-title");
  setAttrs(rightTitle, { x: padL + plotW, y: padT - 8, "text-anchor": "end", fill: chartColor("tickRight"), "font-size": "12", "font-weight": "760" });
  rightTitle.textContent = noteTrendT("runtime.home.trends.words");
  svg.appendChild(rightTitle);
  const tickNote = [...new Set([0, Math.ceil(noteMax / 2), noteMax])];
  tickNote.forEach((val) => {
    const tx = svgEl("text");
    setAttrs(tx, { x: padL - 8, y: yLeft(val) + 4, "text-anchor": "end", fill: chartColor("tickLeft"), "font-size": "10.5", "font-weight": "620" });
    tx.textContent = String(val);
    svg.appendChild(tx);
  });
  const tickWord = [...new Set([0, Math.ceil(wordMax / 2), wordMax])];
  tickWord.forEach((val) => {
    const tx = svgEl("text");
    setAttrs(tx, { x: padL + plotW + 8, y: yRight(val) + 4, "text-anchor": "start", fill: chartColor("tickRight"), "font-size": "10.5", "font-weight": "620" });
    tx.textContent = fmtSmall(val);
    svg.appendChild(tx);
  });

  const bars = [];
  const markers = [];
  const barW = Math.min(13, (plotW / days) * 0.54);
  wordData.forEach((v, i) => {
    const baseY = padT + plotH;
    const x = xAt(i) - barW / 2;
    const yTop = yRight(v);
    const h = Math.max(0, baseY - yTop);
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
      "stroke-width": v > 0 ? Math.min(.7, barW / 4) : 0,
      opacity: "0.82"
    });
    const tip = svgEl("title");
    tip.textContent = noteTrendT("runtime.home.trends.diaryWordsTooltip", { date: dayList[i], value: v });
    bar.appendChild(tip);
    svg.appendChild(bar);
    bars[i] = bar;
  });

  const linePoints = noteData.map((v, i) => [xAt(i), yLeft(v)]);
  const linePath = countLinePath(linePoints);
  const area = svgEl("path");
  setAttrs(area, { d: `${linePath} L ${xAt(days - 1).toFixed(1)} ${padT + plotH} L ${xAt(0).toFixed(1)} ${padT + plotH} Z`, fill: `url(#lineArea-${uid})`, opacity: "0.76" });
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

  noteData.forEach((v, i) => {
    const c = svgEl("circle");
    setAttrs(c, { cx: xAt(i).toFixed(1), cy: yLeft(v).toFixed(1), r: days > plotW / 8 ? "0" : "2.6", fill: chartColor("lineMarkerFill"), stroke: chartColor("lineMarkerStroke"), "stroke-width": "1.25" });
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
  const labelBoxes=[];
  const renderKeyLabels = (indexes, data, yFn, color, className, preferRight) => {
    indexes.sort((a,b)=>Number(data[b])-Number(data[a])).forEach((i) => {
      const v = Number(data[i] || 0);
      if (v <= 0) return;
      const label = svgEl("text");
      label.classList.add("noria-note-trend-key-label", className);
      const valueText=fmtSmall(v),width=valueText.length*6.5;
      const candidates=[[7,-8],[7,15],[-width-7,-8],[-width-7,15]].map(([dx,dy])=>({x:Math.max(padL+3,Math.min(padL+plotW-width-3,xAt(i)+dx)),y:yFn(v)+dy}));
      const position=candidates.find(({x,y})=>y>=padT+10&&y<=padT+plotH-3&&!labelBoxes.some(b=>x<b.x+b.width+4&&x+width+4>b.x&&y-11<b.y+4&&y+4>b.y-11));
      if(!position)return;
      const {x,y}=position;labelBoxes.push({x,y,width});
      setAttrs(label, {
        x: x.toFixed(1),
        y: y.toFixed(1),
        "text-anchor": "start",
        fill: color,
        "font-size": "10.5",
        "font-weight": "760"
      });
      label.textContent = fmtSmall(v);
      svg.appendChild(label);
    });
  };
  renderKeyLabels(keyIndexes(noteData, notePeak, noteAvg), noteData, yLeft, chartColor("tickLeft"), "noria-note-trend-note-key-label", false);
  renderKeyLabels(keyIndexes(wordData, wordPeak, wordAvg), wordData, yRight, chartColor("tickRight"), "noria-note-trend-word-key-label", true);

  const labelIndexes = (() => {
    const out = new Set();
    const count = chartW < 520 ? 3 : 5;
    for (let i = 0; i < count; i += 1) {
      out.add(Math.round((i / Math.max(1, count - 1)) * (days - 1)));
    }
    return Array.from(out).sort((a, b) => a - b);
  })();
  labelIndexes.forEach((i) => {
    const tx = svgEl("text");
    setAttrs(tx, { x: xAt(i).toFixed(1), y: chartH - 7, "text-anchor": "middle", fill: axisFill, "font-size": "10.5", "font-weight": "620" });
    tx.textContent = xLabels[i] || "";
    svg.appendChild(tx);
  });

  const hoverLine = svgEl("line");
  hoverLine.classList.add("noria-note-trend-hover-line");
  setAttrs(hoverLine, { x1: padL, y1: padT, x2: padL, y2: padT + plotH, stroke: "color-mix(in srgb,var(--text-muted) 42%,transparent)", "stroke-width": "1", "stroke-dasharray": "3 5", opacity: "0" });
  svg.appendChild(hoverLine);
  const tooltip = svgEl("g");
  tooltip.classList.add("noria-note-trend-tooltip");
  tooltip.classList.add("noria-trend-tooltip");
  tooltip.style.pointerEvents="none";
  tooltip.style.opacity = "0";
  const tipRect = svgEl("rect");
  setAttrs(tipRect, { width: "142", height: "42", rx: "8", fill: "color-mix(in srgb,var(--background-primary) 96%,rgba(255,255,255,.52))", stroke: "color-mix(in srgb,var(--background-modifier-border) 78%,rgba(99,102,241,.22))" });
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
    bars[i]?.setAttribute("stroke-width", wordData[i]>0?"1.25":"0");
    markers[i]?.setAttribute("r", "4");
    tipDate.textContent = dayList[i];
    tipValue.textContent = `${noteTrendT("runtime.home.trends.newNotes")} ${noteData[i]} · ${noteTrendT("runtime.home.trends.words")} ${wordData[i]}`;
    const tipW=Math.min(chartW-12,Math.max(142,tipValue.getComputedTextLength()+18));
    tipRect.setAttribute("width",tipW);
    const tx=Math.max(6,Math.min(x+10,chartW-tipW-6));
    const ty = Math.max(padT + 4, Math.min(Math.min(yLeft(noteData[i]), yRight(wordData[i])) - 52, padT + plotH - 48));
    tooltip.setAttribute("transform", `translate(${tx.toFixed(1)},${ty.toFixed(1)})`);
    tooltip.style.opacity = "1";
    announcement.setText(tipDate.textContent+" · "+tipValue.textContent);
  };
  const hideHover = (i) => {
    hoverLine.setAttribute("opacity", "0");
    tooltip.style.opacity = "0";
    bars[i]?.setAttribute("opacity", "0.82");
    bars[i]?.setAttribute("stroke-width", wordData[i]>0?String(Math.min(.7,barW/4)):"0");
    markers[i]?.setAttribute("r", days>plotW/8?"0":"2.6");
  };
  const select=i=>{hideHover(selectedIndex);selectedIndex=Math.max(0,Math.min(days-1,i));chartWrap.dataset.index=String(selectedIndex);inspecting=true;showHover(selectedIndex);};
  chartWrap.onpointermove=event=>{const r=svg.getBoundingClientRect();if(!r.width)return;const i=Math.max(0,Math.min(days-1,Math.floor(((event.clientX-r.left)*chartW/r.width-padL)/plotW*days)));if(i!==selectedIndex||!inspecting)select(i);};
  chartWrap.onpointerdown=chartWrap.onpointermove;
  const openSources=()=>noriaBridge.runtime?.openTrendSources?.("notes",snapshotRows[selectedIndex]);
  chartWrap.onclick=event=>{if(event.detail)chartWrap.onpointermove(event);openSources();};
  chartWrap.onpointerleave=()=>{if(chartWrap.ownerDocument.activeElement!==chartWrap){hideHover(selectedIndex);inspecting=false;}};
  chartWrap.onfocus=()=>select(selectedIndex);
  chartWrap.onblur=()=>{hideHover(selectedIndex);inspecting=false;};
  chartWrap.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openSources();return;}if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();select(event.key==='Home'?0:event.key==='End'?days-1:selectedIndex+(event.key==='ArrowLeft'?-1:1));};
  chartWrap.dataset.index=String(selectedIndex);if(inspecting)showHover(selectedIndex);
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
    input?.registerCleanup?.(() => ro.disconnect());
  }
} catch (_) {}
})();
