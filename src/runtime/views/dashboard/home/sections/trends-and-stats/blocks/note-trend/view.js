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
  pal?.VAR?.[k] && k !== "gridOpacity" ? `var(${pal.VAR[k]}, ${pal.FALLBACK[k]})` : typeof pal?.chartColor === "function"
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

const panel = root.createDiv();
panel.style.cssText = `padding:12px;border-radius:${topPanelRadius};background:${topPanelBg};border:${topPanelBorder};box-shadow:${topPanelShadow};width:100%;min-width:0;min-height:0;height:100%;display:flex;flex-direction:column;`;
if (input?.cardContent) Object.assign(panel.style, {padding:"0",border:"0",boxShadow:"none",background:"transparent"});
const head = panel.createDiv();
head.addClass("noria-card-heading");
head.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;min-width:0;flex-shrink:0;";
const titleRow = head.createDiv();
titleRow.style.cssText = "display:flex;align-items:center;min-width:0;flex:1;";
const titleMain = titleRow.createDiv({ text: noteTrendT("runtime.home.trends.noteTrendTitle") });
titleMain.className = "dashboard-panel-title";
titleMain.style.cssText = "font-weight:800;font-size:1.02em;color:var(--dash-heading-text,var(--text-normal));letter-spacing:0.01em;line-height:1.25;";

if (input?.cardContent) { head.remove(); }


const compactText=(zh,en)=>/^zh/.test(noriaBridge.locale||noriaBridge.i18n?.locale||'')?zh:en;
const rangeStart=input?.statsSnapshot?.range?.start||dayList[0],rangeEnd=input?.statsSnapshot?.range?.end||dayList.at(-1);
const rangeDescription=rangeStart&&rangeEnd?rangeStart+' — '+rangeEnd:'';
const explanation=panel.createDiv({attr:{'data-noria-card-explanation':compactText('汇总与口径','Summary and definitions')}});
explanation.hidden=true;

const noteName=compactText('笔记数','Notes'),wordName=compactText('码字数','Characters');
explanation.textContent = [
  rangeDescription,
  noteName+' · '+compactText('总计','Total')+': '+noteTotal+' · '+compactText('每个时段平均','Average per bucket')+': '+noteAvg,
  wordName+' · '+compactText('总计','Total')+': '+wordTotal.toLocaleString()+' · '+compactText('每个时段平均','Average per bucket')+': '+wordAvg.toLocaleString(),
  compactText('笔记数按新建日期统计；日记字符为对应日期日记当前去除空白后的字符数，包含 Markdown 标记。点击图形可查看该时段来源。','Notes are counted by creation date; diary characters are current non-whitespace characters in dated diaries, including Markdown markup. Activate a point to view its sources.')
].join('\n');

const headerTools=!input?.cardContent?head:root.closest?.('.noria-diary-card')?.querySelector('.noria-diary-card-tools')||input?.titleActionsHost;
if(headerTools&&rangeDescription&&input?.statsRange?.mode&&input.statsRange.mode!=='homeCurrent'&&input?.independentRange){
  const rangeLabel=headerTools.createSpan({cls:'noria-card-secondary noria-trend-range',attr:{title:rangeDescription}});
  const showYear=rangeStart.slice(0,4)!==rangeEnd.slice(0,4)||rangeEnd.slice(0,4)!==String(new Date().getFullYear());
  const date=new Intl.DateTimeFormat(noriaBridge.locale||'en',{...(showYear?{year:'numeric'}:{}),month:'numeric',day:'numeric'});
  rangeLabel.textContent=date.format(new Date(rangeStart+'T12:00:00'))+'–'+date.format(new Date(rangeEnd+'T12:00:00'));
  const menu=headerTools.querySelector?.('.noria-diary-card-menu,.noria-card-more');if(menu)headerTools.insertBefore(rangeLabel,menu);
  input?.registerCleanup?.(()=>rangeLabel.remove());
}

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
let selectedIndex = Math.max(0,dayList.findLastIndex((_,i)=>noteData[i]||wordData[i]));
chartWrap.classList.add("noria-trend-interactive");
if(noriaBridge.runtime?.openTrendSources&&snapshotRows.some(row=>row.sources))chartWrap.dataset.sourceDetails='true';
chartWrap.setAttribute("tabindex","0");chartWrap.setAttribute("role","group");
chartWrap.setAttribute("aria-label",/^zh/.test(noriaBridge.locale||"")?"趋势图：左右键选择日期，Home／End 到首尾，点击或 Enter 查看来源。":"Trend: arrow keys select dates; Home / End select first / last. Click or Enter to inspect sources.");

let renderedSize = "";
const renderChart = () => {
  const chartW = Math.max(240, Math.round(measure(chartWrap, 760)));
  const chartH = Math.max(232, Math.round(measureH(chartWrap, 252)));
  const size = `${chartW}x${chartH}`;
  if (size === renderedSize) return;
  renderedSize = size;
  const padL = chartW < 520 ? 36 : 42;
  const padR = chartW < 520 ? 38 : 44;
  const padT = 42;
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
  const barGradient = setAttrs(svgEl("linearGradient"), {id: `${uid}-bars`, x1: 0, y1: 0, x2: 0, y2: 1});
  barGradient.appendChild(setAttrs(svgEl("stop"), {offset: "0%", "stop-color": chartColor("barFill")}));
  barGradient.appendChild(setAttrs(svgEl("stop"), {offset: "100%", "stop-color": chartColor("barFill"), "stop-opacity": .68}));
  defs.appendChild(barGradient);
  svg.appendChild(defs);

  [...new Set([0, Math.ceil(noteMax / 2), noteMax])].forEach((value) => {
    const y = yLeft(value);
    const grid = svgEl("line");
    setAttrs(grid, {
      x1: padL,
      y1: y,
      x2: padL + plotW,
      y2: y,
      stroke: chartColor("gridStroke"),
      "stroke-opacity": Math.min(0.2, Number(chartColor("gridOpacity")) || 0.2),
      "stroke-width": .8,
      "stroke-dasharray": value ? "2 6" : "none"
    });
    svg.appendChild(grid);
  });

  const axisFill = "var(--text-muted)";
  const leftTitle = svgEl("text");
  leftTitle.classList.add("noria-note-trend-axis-title");
  setAttrs(leftTitle, { x: padL + 19, y: 16, "text-anchor": "start", fill: "var(--text-muted)", "font-size": "11", "font-weight": "500" });
  leftTitle.textContent = noteName;
  svg.appendChild(leftTitle);
  const rightTitle = svgEl("text");
  rightTitle.classList.add("noria-note-trend-axis-title");
  setAttrs(rightTitle, { x: padL + plotW - 15, y: 16, "text-anchor": "end", fill: "var(--text-muted)", "font-size": "11", "font-weight": "500" });
  rightTitle.textContent = wordName;
  svg.appendChild(rightTitle);
  const lineKey=setAttrs(svgEl('line'),{x1:padL,x2:padL+12,y1:12,y2:12,stroke:chartColor('lineStroke'),'stroke-width':2});
  svg.appendChild(lineKey);
  svg.appendChild(setAttrs(svgEl('rect'),{x:padL+plotW-8,y:7,width:8,height:9,rx:2,fill:chartColor('barFill')}));
  const tickNote = [...new Set([0, Math.ceil(noteMax / 2), noteMax])];
  tickNote.forEach((val) => {
    const tx = svgEl("text");
    setAttrs(tx, { x: padL - 8, y: yLeft(val) + 4, "text-anchor": "end", fill: chartColor("tickLeft"), "font-size": "10.5", "font-weight": "400" });
    tx.textContent = String(val);
    svg.appendChild(tx);
  });
  const tickWord = [...new Set([0, Math.ceil(wordMax / 2), wordMax])];
  tickWord.forEach((val) => {
    const tx = svgEl("text");
    setAttrs(tx, { x: padL + plotW + 8, y: yRight(val) + 4, "text-anchor": "start", fill: chartColor("tickRight"), "font-size": "10.5", "font-weight": "400" });
    tx.textContent = fmtSmall(val);
    svg.appendChild(tx);
  });

  const bars = [];
  const markers = [];
  const barW = Math.min(16, (plotW / days) * 0.56);
  wordData.forEach((v, i) => {
    const baseY = padT + plotH;
    const x = xAt(i) - barW / 2;
    const yTop = yRight(v);
    const h = Math.max(0, baseY - yTop);
    const bar = svgEl("rect");
    bar.classList.add("noria-trend-bar");
    setAttrs(bar, {
      x: x.toFixed(1),
      y: yTop.toFixed(1),
      width: barW,
      height: h.toFixed(1),
      rx: Math.min(4, barW / 2),
      ry: Math.min(4, barW / 2),
      fill: `url(#${uid}-bars)`,
      stroke: chartColor("barStroke"),
      "stroke-width": 0,
      opacity: "0.9"
    });
    const tip = svgEl("title");
    tip.textContent = noteTrendT("runtime.home.trends.diaryWordsTooltip", { date: dayList[i], value: v });
    bar.appendChild(tip);
    svg.appendChild(bar);
    bars[i] = bar;
  });

  const linePoints = noteData.map((v, i) => [xAt(i), yLeft(v)]);
  const linePath = countLinePath(linePoints);
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
    c.classList.add("noria-trend-marker");
    setAttrs(c, { cx: xAt(i).toFixed(1), cy: yLeft(v).toFixed(1), r: !v || days > plotW / 12 ? "0" : "2.3", fill: chartColor("lineMarkerFill"), stroke: chartColor("lineMarkerStroke"), "stroke-width": "1.25" });
    svg.appendChild(c);
    markers[i] = c;
  });

  const labelIndexes = (() => {
    const out = new Set();
    const count = chartW < 520 ? 3 : 5;
    for (let i = 0; i < count; i += 1) {
      out.add(Math.round((i / Math.max(1, count - 1)) * (days - 1)));
    }
    return Array.from(out).sort((a, b) => a - b);
  })();
  const dateTicks = [];
  labelIndexes.forEach((i) => {
    const tx = svgEl("text");
    setAttrs(tx, { x: xAt(i).toFixed(1), y: chartH - 7, "text-anchor": "middle", fill: axisFill, "font-size": "10.5", "font-weight": "400" });
    tx.textContent = xLabels[i] || "";
    dateTicks.push(tx);
    svg.appendChild(tx);
  });

  const hoverLine = svgEl("line");
  hoverLine.classList.add("noria-note-trend-hover-line");
  setAttrs(hoverLine, { x1: padL, y1: padT, x2: padL, y2: padT + plotH, stroke: "color-mix(in srgb,var(--text-muted) 42%,transparent)", "stroke-width": "1", "stroke-dasharray": "3 5", opacity: "0" });
  svg.appendChild(hoverLine);
  const annotations = globalThis.dashboardCore?.components?.charts?.trendAnnotations?.createTrendAnnotations(svg, {
    bounds: {left:padL+2,right:padL+plotW-2,top:padT-18,bottom:padT+plotH-3},
    series: [
      {values:noteData,xAt,yAt:yLeft,color:chartColor("lineStroke")},
      {values:wordData,xAt,yAt:yRight,color:chartColor("barStroke")}
    ]
  });
  const dateLabel = svgEl("text");
  setAttrs(dateLabel, {y:chartH-7,"text-anchor":"middle",fill:"var(--text-normal)","font-size":10.5,
    stroke:"var(--background-primary)","stroke-width":5,"paint-order":"stroke",opacity:0,"pointer-events":"none"});
  svg.appendChild(dateLabel);

  const showHover = (i) => {
    const x = xAt(i);
    hoverLine.setAttribute("x1", x.toFixed(1));
    hoverLine.setAttribute("x2", x.toFixed(1));
    hoverLine.setAttribute("opacity", "1");
    bars[i]?.setAttribute("opacity", "1");
    bars[i]?.setAttribute("stroke-width", wordData[i]>0?".7":"0");
    markers[i]?.setAttribute("r", "4");
    annotations?.update(i);
    const sameYear = dayList[0]?.slice(0,4) === dayList.at(-1)?.slice(0,4);
    dateLabel.textContent = sameYear ? (xLabels[i] || dayList[i]) : dayList[i];
    const halfLabel = Math.max(18, dateLabel.textContent.length * 3);
    dateLabel.setAttribute("x",Math.max(padL+halfLabel,Math.min(x,padL+plotW-halfLabel)));
    dateLabel.setAttribute("opacity",1);
    const dateX=Number(dateLabel.getAttribute("x"));
    dateTicks.forEach(node=>node.style.opacity=Math.abs(Number(node.getAttribute('x'))-dateX)<halfLabel+24?'0':'1');
    announcement.setText(`${dayList[i]} · ${noteName} ${noteData[i]} · ${wordName} ${wordData[i]}`);
  };
  const hideHover = (i) => {
    hoverLine.setAttribute("opacity", "0");
    annotations?.update(null);
    dateLabel.setAttribute("opacity",0);
    dateTicks.forEach(node=>node.style.opacity="1");
    bars[i]?.setAttribute("opacity", "0.9");
    bars[i]?.setAttribute("stroke-width", "0");
    markers[i]?.setAttribute("r", !noteData[i]||days>plotW/12?"0":"2.3");
  };
  const select=i=>{hideHover(selectedIndex);selectedIndex=Math.max(0,Math.min(days-1,i));chartWrap.dataset.index=String(selectedIndex);showHover(selectedIndex);};
  chartWrap.onpointermove=event=>{const r=svg.getBoundingClientRect();if(!r.width)return;const i=Math.max(0,Math.min(days-1,Math.floor(((event.clientX-r.left)*chartW/r.width-padL)/plotW*days)));if(i!==selectedIndex)select(i);};
  chartWrap.onpointerdown=chartWrap.onpointermove;
  const openSources=()=>noriaBridge.runtime?.openTrendSources?.("notes",snapshotRows[selectedIndex]);
  chartWrap.onclick=event=>{if(event.detail)chartWrap.onpointermove(event);openSources();};
  chartWrap.onfocus=()=>select(selectedIndex);
  chartWrap.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openSources();return;}if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();select(event.key==='Home'?0:event.key==='End'?days-1:selectedIndex+(event.key==='ArrowLeft'?-1:1));};
  chartWrap.dataset.index=String(selectedIndex);showHover(selectedIndex);
};

renderChart();
try {
  if (typeof ResizeObserver !== "undefined") {
    let frame = 0;
    const ro = new ResizeObserver(() => {
      if (chartWrap.isConnected === false) {
        ro.disconnect();
        return;
      }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(renderChart);
    });
    ro.observe(chartWrap);
    input?.registerCleanup?.(() => { ro.disconnect(); cancelAnimationFrame(frame); });
  }
} catch (_) {}
})();
