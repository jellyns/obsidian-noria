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
  pal?.VAR?.[k] && k !== "gridOpacity" ? `var(${pal.VAR[k]}, ${pal.FALLBACK[k]})` : typeof pal?.chartColor === "function"
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
panel.style.cssText = `padding:12px;border-radius:${topPanelRadius};background:${topPanelBg};border:${topPanelBorder};box-shadow:${topPanelShadow};width:100%;min-width:0;min-height:0;height:100%;display:flex;flex-direction:column;`;
if (input?.cardContent) Object.assign(panel.style, {padding:"0",border:"0",boxShadow:"none",background:"transparent"});
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
const doneMax = activityMax;
const activityTotal = Number(stats?.tasks?.completion?.activityTotal ?? taskCompletion.planned ?? 0);
const doneTotal = Number(taskCompletion.completed || 0);
const activityAvg = (activityTotal / days).toFixed(1);
const doneAvg = (doneTotal / days).toFixed(1);
const rate = Math.min(100, Number(taskCompletion.completionRate || 0));
const undatedCompleted = Number(taskCompletion.undatedCompleted || 0);

const head = panel.createDiv();
head.addClass("noria-card-heading");
head.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;min-width:0;flex-shrink:0;";
const titleMain = head.createDiv({ text: taskTrendT("runtime.home.trends.taskTrendTitle") });
titleMain.className = "dashboard-panel-title";
titleMain.style.cssText = "font-weight:800;font-size:1.02em;color:var(--dash-heading-text,var(--text-normal));letter-spacing:0.01em;line-height:1.25;";
if (input?.cardContent) head.remove();


const compactText=(zh,en)=>/^zh/.test(noriaBridge.locale||noriaBridge.i18n?.locale||'')?zh:en;
const rangeStart=input?.statsSnapshot?.range?.start||dayList[0],rangeEnd=input?.statsSnapshot?.range?.end||dayList.at(-1);
const rangeDescription=rangeStart&&rangeEnd?rangeStart+' — '+rangeEnd:'';
const explanation=panel.createDiv({attr:{'data-noria-card-explanation':compactText('汇总与口径','Summary and definitions')}});
explanation.hidden=true;

const activityName=compactText('任务数','Tasks'),doneName=compactText('完成数','Completed');
explanation.textContent = [
  rangeDescription,
  activityName+' · '+compactText('总计','Total')+': '+activityTotal+' · '+compactText('每个时段平均','Average per bucket')+': '+activityAvg,
  doneName+' · '+compactText('总计','Total')+': '+doneTotal+' · '+compactText('每个时段平均','Average per bucket')+': '+doneAvg,
  taskTrendT('runtime.home.trends.completionRate')+': '+(activityTotal?rate+'%':'—'),
  ...(undatedCompleted?[taskTrendT('runtime.home.trends.undatedCompleted')+': '+undatedCompleted]:[]),
  compactText('完成任务按完成日计入；活动任务包括本期完成和按截止、安排、开始或所在日记日期计入的未完成任务。点击图形可查看该时段来源。','Completed tasks use completion dates; activity includes completions and open tasks dated by due, scheduled, start or diary dates. Activate a point to view its sources.')
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
let selectedIndex = Math.max(0,dayList.findLastIndex((_,i)=>activityData[i]||doneData[i]));
chartWrap.classList.add("noria-trend-interactive");
if(noriaBridge.runtime?.openTrendSources&&series.some(row=>row.sources))chartWrap.dataset.sourceDetails='true';
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
  const padR = 16;
  const padT = 42;
  const padB = 28;
  const plotW = Math.max(120, chartW - padL - padR);
  const plotH = Math.max(120, chartH - padT - padB);
  const xAt = (i) => padL + (i + .5) / days * plotW;
  const yLeft = (v) => padT + plotH - (Number(v || 0) / activityMax) * plotH;
  const yRight = (v) => padT + plotH - (Number(v || 0) / doneMax) * plotH;
  const uid = `tt${Math.random().toString(36).slice(2, 9)}`;
  clearEl(svg);
  svg.setAttribute("viewBox", `0 0 ${chartW} ${chartH}`);
  svg.setAttribute("role", "img");
  // Obsidian's aria-label tooltip handler only supports HTML elements.
  svg.setAttribute("aria-labelledby", `${uid}-title`);
  const chartTitle = setAttrs(svgEl("title"), { id: `${uid}-title` });
  chartTitle.textContent = taskTrendT("runtime.home.trends.taskTrendTitle");
  svg.appendChild(chartTitle);
  const defs = svgEl("defs");
  const barGradient = setAttrs(svgEl("linearGradient"), {id: `${uid}-bars`, x1: 0, y1: 0, x2: 0, y2: 1});
  barGradient.appendChild(setAttrs(svgEl("stop"), {offset: "0%", "stop-color": chartColor("barFill")}));
  barGradient.appendChild(setAttrs(svgEl("stop"), {offset: "100%", "stop-color": chartColor("barFill"), "stop-opacity": .68}));
  defs.appendChild(barGradient);
  svg.appendChild(defs);

  [...new Set([0, Math.ceil(activityMax / 2), activityMax])].forEach((value) => {
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

  const leftTitle = svgEl("text");
  setAttrs(leftTitle, { x: padL + 19, y: 16, "text-anchor": "start", fill: "var(--text-muted)", "font-size": "11", "font-weight": "500" });
  leftTitle.textContent = activityName;
  svg.appendChild(leftTitle);
  const rightTitle = svgEl("text");
  setAttrs(rightTitle, { x: padL + plotW - 15, y: 16, "text-anchor": "end", fill: "var(--text-muted)", "font-size": "11", "font-weight": "500" });
  rightTitle.textContent = doneName;
  svg.appendChild(rightTitle);
  const lineKey=setAttrs(svgEl('line'),{x1:padL+plotW-11,x2:padL+plotW,y1:12,y2:12,stroke:chartColor('lineStroke'),'stroke-width':2});
  svg.appendChild(lineKey);
  svg.appendChild(setAttrs(svgEl('rect'),{x:padL,y:7,width:8,height:9,rx:2,fill:chartColor('barFill')}));

  [...new Set([0, Math.ceil(activityMax / 2), activityMax])].forEach((val) => {
    const tx = svgEl("text");
    setAttrs(tx, { x: padL - 8, y: yLeft(val) + 4, "text-anchor": "end", fill: "var(--text-muted)", "font-size": "10.5", "font-weight": "400" });
    tx.textContent = fmtSmall(val);
    svg.appendChild(tx);
  });
  const bars = [];
  const markers = [];
  const barW = Math.min(16, (plotW / days) * 0.56);
  activityData.forEach((v, i) => {
    const baseY = padT + plotH;
    const x = xAt(i) - barW / 2;
    const yTop = yLeft(v);
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
    svg.appendChild(bar);
    bars[i] = bar;
  });

  const linePoints = doneData.map((v, i) => [xAt(i), yRight(v)]);
  const linePath = countLinePath(linePoints);
  if (linePath) {
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
    c.classList.add("noria-trend-marker");
    setAttrs(c, { cx: xAt(i).toFixed(1), cy: yRight(v).toFixed(1), r: !v || days > plotW / 12 ? "0" : "2.3", fill: chartColor("lineMarkerFill"), stroke: chartColor("lineMarkerStroke"), "stroke-width": "1.25" });
    svg.appendChild(c);
    markers[i] = c;
  });

  const labelIndexSet = new Set();
  if (days > 0) {
    const count = chartW < 520 ? 3 : 5;
    for (let i = 0; i < count; i += 1) {
      labelIndexSet.add(Math.round((i / Math.max(1, count - 1)) * (days - 1)));
    }
  }
  const dateTicks = [];
  Array.from(labelIndexSet).sort((a, b) => a - b).forEach((i) => {
    const tx = svgEl("text");
    setAttrs(tx, { x: xAt(i).toFixed(1), y: chartH - 7, "text-anchor": "middle", fill: "var(--text-muted)", "font-size": "10.5", "font-weight": "400" });
    tx.textContent = xLabels[i] || "";
    dateTicks.push(tx);
    svg.appendChild(tx);
  });

  const hoverLine = svgEl("line");
  setAttrs(hoverLine, { x1: padL, y1: padT, x2: padL, y2: padT + plotH, stroke: "color-mix(in srgb,var(--text-muted) 42%,transparent)", "stroke-width": "1", "stroke-dasharray": "3 5", opacity: "0" });
  svg.appendChild(hoverLine);
  const annotations = globalThis.dashboardCore?.components?.charts?.trendAnnotations?.createTrendAnnotations(svg, {
    bounds: {left:padL+2,right:padL+plotW-2,top:padT-18,bottom:padT+plotH-3},
    series: [
      {values:doneData,xAt,yAt:yRight,color:chartColor("lineStroke")},
      {values:activityData,xAt,yAt:yLeft,color:chartColor("barStroke")}
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
    bars[i]?.setAttribute("stroke-width", activityData[i]>0?".7":"0");
    markers[i]?.setAttribute("r", "4");
    annotations?.update(i);
    const sameYear = dayList[0]?.slice(0,4) === dayList.at(-1)?.slice(0,4);
    dateLabel.textContent = sameYear ? (xLabels[i] || dayList[i]) : dayList[i];
    const halfLabel = Math.max(18, dateLabel.textContent.length * 3);
    dateLabel.setAttribute("x",Math.max(padL+halfLabel,Math.min(x,padL+plotW-halfLabel)));
    dateLabel.setAttribute("opacity",1);
    const dateX=Number(dateLabel.getAttribute("x"));
    dateTicks.forEach(node=>node.style.opacity=Math.abs(Number(node.getAttribute('x'))-dateX)<halfLabel+24?'0':'1');
    announcement.setText(`${dayList[i]} · ${doneName} ${doneData[i]} · ${activityName} ${activityData[i]}`);
  };
  const hideHover = (i) => {
    hoverLine.setAttribute("opacity", "0");
    annotations?.update(null);
    dateLabel.setAttribute("opacity",0);
    dateTicks.forEach(node=>node.style.opacity="1");
    bars[i]?.setAttribute("opacity", "0.9");
    bars[i]?.setAttribute("stroke-width", "0");
    markers[i]?.setAttribute("r", !doneData[i]||days>plotW/12?"0":"2.3");
  };
  const select=i=>{hideHover(selectedIndex);selectedIndex=Math.max(0,Math.min(days-1,i));chartWrap.dataset.index=String(selectedIndex);showHover(selectedIndex);};
  chartWrap.onpointermove=event=>{const r=svg.getBoundingClientRect();if(!r.width)return;const i=Math.max(0,Math.min(days-1,Math.floor(((event.clientX-r.left)*chartW/r.width-padL)/plotW*days)));if(i!==selectedIndex)select(i);};
  chartWrap.onpointerdown=chartWrap.onpointermove;
  const openSources=()=>noriaBridge.runtime?.openTrendSources?.("tasks",series[selectedIndex]);
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
