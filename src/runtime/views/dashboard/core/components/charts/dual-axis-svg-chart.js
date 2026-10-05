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
    const nums = (arr || []).filter(x => x != null && Number.isFinite(Number(x))).map(Number);
    const total = nums.reduce((a, b) => a + b, 0);
    const peak = Math.max(0, ...nums);
    const avg = nums.length ? (total / nums.length) : 0;
    return { total, peak, avg };
  }

  function countLinePath(points) {
    let previous=false;return points.map(p=>{if(!p){previous=false;return "";}const command=previous?"L":"M";previous=true;return `${command} ${p[0]} ${p[1]}`;}).join(" ");
  }

  function renderDualAxisSvg(parent, config) {
    const {
      title = chartT("runtime.chart.dualAxisTitle", {}, "Dual-axis trend"),
      barSeries = [],
      lineSeries = [],
      labels = [],
      barName = "Bar",
      lineName = "Line",
      statOptions = {}, bare = false, lineMax, lineUnit = "",
      tickLabels = labels, formatValue = String, onInspect, selectedIndex = 0, keyboardLabel = title
    } = config || {};

    const pal = root.components?.charts?.chartPalette;
    const chartColor = (k) =>
      bare ? ({lineStroke:"var(--color-purple)",lineMarkerFill:"var(--color-purple)",lineMarkerStroke:"var(--background-primary)",barFill:"var(--color-blue)",barStroke:"var(--color-blue)",tickLeft:"var(--text-muted)",tickRight:"var(--text-muted)",gridStroke:"var(--background-modifier-border)",gridOpacity:".5",axisLeft:"var(--background-modifier-border)",axisRight:"var(--background-modifier-border)"}[k] || "var(--text-muted)") : typeof pal?.chartColor === "function"
        ? pal.chartColor(k)
        : pal?.FALLBACK?.[k] ?? ({lineStroke:"var(--color-purple)",lineMarkerFill:"var(--color-purple)",lineMarkerStroke:"var(--background-primary)",barFill:"var(--color-blue)",barStroke:"var(--color-blue)",gridLine:"var(--background-modifier-border)"}[k] || "var(--text-muted)");

    const chipsRenderer = root.components?.cards?.metricChips?.renderMetricChips;
    const card = bare ? parent : makeCard(parent, title);
    const head = bare ? null : card.createDiv();
    if(head)head.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;";

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
    if (!bare && typeof chipsRenderer === "function") chipsRenderer(head, chips);

    const n = Math.max(1, barSeries.length, lineSeries.length);
    const chartW = bare ? Math.max(240,parent.clientWidth || 600) : 900;
    const chartH = bare ? (chartW < 420 ? 210 : 240) : 280;
    const padL = bare ? 44 : 58;
    const padR = bare ? 44 : 56;
    const padT = 16;
    const padB = 36;
    const plotW = chartW - padL - padR;
    const plotH = chartH - padT - padB;
    const xAt = (i) => bare ? padL + (i + .5) / n * plotW : n <= 1 ? (padL + plotW / 2) : padL + (i / (n - 1)) * plotW;
    const scaleMax = value => {
      if(!bare)return value;
      const power=10**Math.floor(Math.log10(value)),fraction=value/power;
      return (fraction<=1?1:fraction<=2?2:fraction<=4?4:fraction<=6?6:10)*power;
    };
    const maxLine = scaleMax(Math.max(1, Number(lineMax) || 0, ...lineSeries.map((x) => Number(x || 0))));
    const maxBar = scaleMax(Math.max(1, ...barSeries.map((x) => Number(x || 0))));
    const yLeft = (v) => padT + plotH - (Number(v || 0) / maxLine) * plotH;
    const yRight = (v) => padT + plotH - (Number(v || 0) / maxBar) * plotH;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${chartW} ${chartH}`);
    svg.setAttribute("width", "100%");
    svg.setAttribute("role","img");svg.setAttribute("aria-label",`${title}: ${barName} / ${lineName}`);
    svg.setAttribute("height", String(chartH));
    svg.style.cssText = `display:block;width:100%;height:${chartH}px;background:transparent;border-radius:0;border:none;`;

    [0, 0.25, 0.5, 0.75, 1].forEach((r) => {
      const y = padT + plotH - r * plotH;
      const g = document.createElementNS("http://www.w3.org/2000/svg", "line");
      g.setAttribute("x1", padL);
      g.setAttribute("y1", y);
      g.setAttribute("x2", padL + plotW);
      g.setAttribute("y2", y);
      g.setAttribute("stroke", chartColor("gridStroke"));
      g.setAttribute("stroke-opacity", chartColor("gridOpacity"));
      if(!bare)g.setAttribute("stroke-dasharray", "4 6");
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

    [...new Set([0, Math.ceil(maxLine / 2), maxLine])].forEach((val) => {
      const y = yLeft(val);
      const tx = document.createElementNS("http://www.w3.org/2000/svg", "text");
      tx.setAttribute("x", padL - 8);
      tx.setAttribute("y", y + 4);
      tx.setAttribute("text-anchor", "end");
      tx.setAttribute("fill", chartColor("tickLeft"));
      tx.setAttribute("font-size", "11");
      tx.textContent = formatValue(val) + lineUnit;
      svg.appendChild(tx);
    });
    [...new Set([0, Math.ceil(maxBar / 2), maxBar])].forEach((val) => {
      const y = yRight(val);
      const tx = document.createElementNS("http://www.w3.org/2000/svg", "text");
      tx.setAttribute("x", padL + plotW + 8);
      tx.setAttribute("y", y + 4);
      tx.setAttribute("text-anchor", "start");
      tx.setAttribute("fill", chartColor("tickRight"));
      tx.setAttribute("font-size", "11");
      tx.textContent = formatValue(val);
      svg.appendChild(tx);
    });

    const glowId = `lineGlow-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const glow = document.createElementNS("http://www.w3.org/2000/svg", "filter");
    glow.setAttribute("id", glowId);
    glow.innerHTML = "<feGaussianBlur in=\"SourceGraphic\" stdDeviation=\"1.4\" result=\"blur\"/><feMerge><feMergeNode in=\"blur\"/><feMergeNode in=\"SourceGraphic\"/></feMerge>";
    defs.appendChild(glow);
    svg.appendChild(defs);

    const barW = Math.min(28, Math.max(.5,(plotW / n) * .58));
    barSeries.forEach((v, i) => {
      const x = xAt(i) - barW / 2;
      const y = yRight(v);
      const bar = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bar.setAttribute("x", x);
      bar.setAttribute("y", y);
      bar.setAttribute("width", barW);
      bar.setAttribute("height", Math.max(0, padT + plotH - y));
      bar.setAttribute("rx", "4");
      bar.setAttribute("fill", chartColor("barFill"));
      bar.setAttribute("stroke", chartColor("barStroke"));
      bar.setAttribute("stroke-width", ".5");
      const tip = document.createElementNS(svg.namespaceURI,"title");tip.textContent=`${labels[i] || i + 1} ${barName} ${formatValue(v || 0)}`;bar.appendChild(tip);
      svg.appendChild(bar);
    });

    const points = lineSeries.map((v, i) => v == null ? null : [xAt(i), yLeft(v)]);
    const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
    line.setAttribute("d", countLinePath(points));
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", chartColor("lineStroke"));
    line.setAttribute("stroke-width", "2.8");
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("stroke-linejoin", "round");
    if(!bare)line.setAttribute("filter", `url(#${glowId})`);
    svg.appendChild(line);

    lineSeries.forEach((v, i) => {
      if(v == null)return;
      if(bare&&n>14&&i>0&&i<n-1&&lineSeries[i-1]!=null&&lineSeries[i+1]!=null)return;
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", xAt(i));
      c.setAttribute("cy", yLeft(v));
      c.setAttribute("r", "2.7");
      c.setAttribute("fill", chartColor("lineMarkerFill"));
      c.setAttribute("stroke", chartColor("lineMarkerStroke"));
      c.setAttribute("stroke-width", "1.2");
      const tip = document.createElementNS(svg.namespaceURI,"title");tip.textContent=`${labels[i] || i + 1} ${lineName} ${formatValue(v)}${lineUnit}`;c.appendChild(tip);
      svg.appendChild(c);
    });

    const tickCount=bare?Math.max(2,Math.min(6,Math.floor(plotW/70))):4;
    const tickIdx = Array.from(new Set(Array.from({length:tickCount},(_,i)=>Math.round((n-1)*i/(tickCount-1)))));
    tickIdx.forEach((i) => {
      const tx = document.createElementNS("http://www.w3.org/2000/svg", "text");
      tx.setAttribute("x", xAt(i));
      tx.setAttribute("y", chartH - 9);
      tx.setAttribute("text-anchor", "middle");
      tx.setAttribute("fill", chartColor("tickX"));
      tx.setAttribute("font-size", "10.5");
      tx.textContent = tickLabels[i] || String(i + 1);
      svg.appendChild(tx);
    });

    if(bare&&typeof onInspect==='function'){
      const cursor=document.createElementNS(svg.namespaceURI,'line');
      for(const [key,value] of Object.entries({y1:padT,y2:padT+plotH,stroke:'var(--text-faint)','stroke-width':1,'pointer-events':'none'}))cursor.setAttribute(key,String(value));
      svg.appendChild(cursor);
      const marker=document.createElementNS(svg.namespaceURI,'circle');
      for(const [key,value] of Object.entries({r:4,fill:chartColor('lineStroke'),stroke:'var(--background-primary)','stroke-width':1.5,'pointer-events':'none'}))marker.setAttribute(key,String(value));
      svg.appendChild(marker);
      const plot=card.createDiv({cls:'noria-periodic-plot',attr:{tabindex:'0',role:'group','aria-label':keyboardLabel}});
      let active=-1;
      const select=index=>{
        const next=Math.max(0,Math.min(n-1,index));if(next===active)return;active=next;
        cursor.setAttribute('x1',xAt(active));cursor.setAttribute('x2',xAt(active));
        marker.setAttribute('visibility',lineSeries[active]==null?'hidden':'visible');marker.setAttribute('cx',xAt(active));marker.setAttribute('cy',yLeft(lineSeries[active]));
        plot.setAttribute('data-index',String(active));onInspect(active);
      };
      plot.appendChild(svg);
      plot.onpointermove=event=>{const rect=svg.getBoundingClientRect();if(rect.width)select(Math.floor(((event.clientX-rect.left)*chartW/rect.width-padL)/plotW*n));};
      plot.onpointerdown=plot.onpointermove;
      plot.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();select(event.key==='Home'?0:event.key==='End'?n-1:active+(event.key==='ArrowLeft'?-1:1));};
      select(selectedIndex);
    }else card.appendChild(svg);
    return card;
  }

  if(typeof module !== "undefined" && module.exports)module.exports={renderDualAxisSvg};
  root.components.charts.dualAxisSvgChart = {
    renderDualAxisSvg
  };
})();
