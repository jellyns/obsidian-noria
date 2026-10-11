(() => {
  const root = globalThis.dashboardCore || (globalThis.dashboardCore = {});
  root.components = root.components || {};
  root.components.charts = root.components.charts || {};

  const SVG_NS = "http://www.w3.org/2000/svg";
  const DEFAULT_PALETTE = ["#e72929", "#9b59b6", "#ff8c1a", "#377eb8", "#4daf4a", "#b8aa4a"];

  function chartT(key, params = {}, fallback = key) {
    try {
      const bridge = globalThis.__noriaRuntimeBridge || {};
      if (typeof bridge.t === "function") return bridge.t(key, params);
    } catch (_) {}
    return String(fallback).replace(/\{(\w+)\}/g, (_, name) => String(params?.[name] ?? ""));
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, Number(n) || 0));
  }

  function polar(cx, cy, radius, angleDeg) {
    const a = ((angleDeg - 90) * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(a),
      y: cy + radius * Math.sin(a)
    };
  }

  function leaderPoints(outer, elbow, end, cx, cy, radius, right) {
    const clearsRing = (a, b) => {
      const dx = b.x - a.x, dy = b.y - a.y;
      const t = clamp(((cx - a.x) * dx + (cy - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
      return Math.hypot(a.x + t * dx - cx, a.y + t * dy - cy) >= radius;
    };
    if (clearsRing(elbow, end)) return [outer, elbow, end];
    const railX = cx + (right ? 1 : -1) * (radius + 4);
    const bend = { x: railX, y: elbow.y };
    // Balancing can place a label on the opposite side. Escape above/below
    // the ring before crossing it, rather than cutting through the slices.
    const approach = clearsRing(elbow, bend) ? [elbow, bend] : [
      elbow,
      { x: elbow.x, y: cy + (elbow.y <= cy ? -1 : 1) * (radius + 4) },
      { x: railX, y: cy + (elbow.y <= cy ? -1 : 1) * (radius + 4) }
    ];
    return [outer, ...approach, { x: railX, y: end.y }, end];
  }

  function arcPath(cx, cy, outerR, innerR, startAngle, endAngle) {
    const span = Math.max(0, endAngle - startAngle);
    const end = startAngle + Math.min(359.99, span);
    const large = end - startAngle > 180 ? 1 : 0;
    const o0 = polar(cx, cy, outerR, startAngle);
    const o1 = polar(cx, cy, outerR, end);
    const i1 = polar(cx, cy, innerR, end);
    const i0 = polar(cx, cy, innerR, startAngle);
    return [
      `M ${o0.x.toFixed(2)} ${o0.y.toFixed(2)}`,
      `A ${outerR} ${outerR} 0 ${large} 1 ${o1.x.toFixed(2)} ${o1.y.toFixed(2)}`,
      `L ${i1.x.toFixed(2)} ${i1.y.toFixed(2)}`,
      `A ${innerR} ${innerR} 0 ${large} 0 ${i0.x.toFixed(2)} ${i0.y.toFixed(2)}`,
      "Z"
    ].join(" ");
  }

  function normalizeItems(items, total, palette) {
    const source = Array.isArray(items) ? items : [];
    const values = source
      .map((item, index) => ({
        key: item?.key ?? index,
        label: String(item?.label || "").trim() || `项目 ${index + 1}`,
        value: Number(item?.value || 0),
        color: item?.color || palette[index % palette.length]
      }))
      .filter((item) => Number.isFinite(item.value) && item.value > 0);
    const sum = Number(total || 0) > 0 ? Number(total || 0) : values.reduce((acc, item) => acc + item.value, 0);
    let angle = 0;
    return values.map((item) => {
      const pct = sum > 0 ? item.value / sum : 0;
      const startAngle = angle;
      const endAngle = angle + pct * 360;
      angle = endAngle;
      return { ...item, pct, startAngle, endAngle, midAngle: (startAngle + endAngle) / 2 };
    });
  }

  function distributeLabels(labels, minY, maxY, gap) {
    const sorted = labels.slice().sort((a, b) => a.targetY - b.targetY);
    sorted.forEach((label, index) => {
      label.y = index === 0 ? clamp(label.targetY, minY, maxY) : Math.max(clamp(label.targetY, minY, maxY), sorted[index - 1].y + gap);
    });
    for (let i = sorted.length - 1; i >= 0; i--) {
      const limit = i === sorted.length - 1 ? maxY : sorted[i + 1].y - gap;
      sorted[i].y = Math.min(sorted[i].y, limit);
    }
    sorted.forEach((label) => {
      label.y = clamp(label.y, minY, maxY);
    });
    return sorted;
  }

  function balanceLabelSides(labels, labelBalance = "natural") {
    const balanced = (Array.isArray(labels) ? labels : []).map((label) => ({ ...label }));
    if (labelBalance !== "balanced" || balanced.length < 3) return balanced;
    const targetRight = Math.ceil(balanced.length / 2);
    const targetLeft = balanced.length - targetRight;
    let rightCount = balanced.filter((label) => label.isRight).length;
    let leftCount = balanced.length - rightCount;
    const move = (fromRight) => {
      const candidates = balanced
        .filter((label) => label.isRight === fromRight)
        .sort((a, b) =>
          Math.abs(Number(a.sideConfidence || 0)) - Math.abs(Number(b.sideConfidence || 0)) ||
          Number(a.slice?.pct || 0) - Number(b.slice?.pct || 0)
        );
      const picked = candidates[0];
      if (!picked) return false;
      picked.isRight = !fromRight;
      if (fromRight) {
        rightCount -= 1;
        leftCount += 1;
      } else {
        leftCount -= 1;
        rightCount += 1;
      }
      return true;
    };
    while (rightCount > targetRight && move(true)) {}
    while (leftCount > targetLeft && move(false)) {}
    return balanced;
  }

  function createSvgEl(tag) {
    return document.createElementNS(SVG_NS, tag);
  }

  function setAttrs(el, attrs) {
    Object.entries(attrs || {}).forEach(([key, value]) => el.setAttribute(key, String(value)));
    return el;
  }

  function clearEl(el) {
    if (typeof el?.empty === "function") {
      el.empty();
      return;
    }
    while (el?.firstChild) el.removeChild(el.firstChild);
  }

  function measureWidth(el, fallback) {
    try {
      const rect = el?.getBoundingClientRect?.();
      const w = Number(rect?.width || el?.clientWidth || 0);
      if (w > 0) return w;
    } catch (_) {}
    return fallback;
  }

  function computeLayout(parent, options) {
    const fallbackW = clamp(options.width || options.size || 420, 300, 560);
    const width = clamp(measureWidth(parent, fallbackW), 300, 560);
    const labelMinGap = clamp(options.labelMinGap ?? (width < 360 ? 24 : 26), 24, 34);
    const slices = normalizeItems(options.items, options.total, DEFAULT_PALETTE);
    const sides = balanceLabelSides(slices.map(slice => {
      const sideVector = Math.cos(((slice.midAngle - 90) * Math.PI) / 180);
      return { slice, isRight: sideVector >= 0, sideConfidence: Math.abs(sideVector) };
    }), options.labelBalance || 'natural');
    const sideCount = Math.max(sides.filter(s => s.isRight).length, sides.filter(s => !s.isRight).length);
    const height = Math.max(clamp(options.height || Math.round(width * 0.62), 220, 340), (sideCount - 1) * labelMinGap + 48);
    const labelColumnMin = clamp(options.labelColumnMin ?? (width < 360 ? 76 : 92), 62, 150);
    const labelColumnMax = clamp(options.labelColumnMax ?? 142, labelColumnMin, 170);
    const labelColumn = clamp(width * 0.25, labelColumnMin, labelColumnMax);
    const cx = width / 2;
    const cy = height / 2 + 6;
    const outerR = clamp(Math.min(height * 0.405, (width - labelColumn * 2 - 8) / 2), 44, 124);
    const innerR = outerR * clamp(options.innerRadiusRatio ?? 0.58, 0.35, 0.78);
    const lineR = outerR + clamp(width * 0.008, 3, 5);
    const minY = Math.max(18, labelMinGap * 0.8);
    const maxY = height - Math.max(18, labelMinGap * 0.8);
    return {
      width,
      height,
      cx,
      cy,
      outerR,
      innerR,
      lineR,
      minY,
      maxY,
      labelFont: width < 360 ? 10.5 : 12,
      percentFont: width < 360 ? 10.5 : 12,
      labelGap: labelMinGap,
      leftLabelX: Math.max(8, labelColumn - 4),
      rightLabelX: Math.min(width - 8, width - labelColumn + 4),
      leftTextMax: labelColumn - 8,
      rightTextMax: labelColumn - 8
    };
  }

  function fitLabel(label, name, suffix, maxWidth) {
    const chars = Array.from(name);
    label.textContent = name + suffix;
    for (let keep = chars.length - 1; keep > 0 && label.getComputedTextLength() > maxWidth; keep--) {
      const left = Math.ceil(keep / 2), right = Math.floor(keep / 2);
      label.textContent = (name.includes('/') ? '…' + chars.slice(-keep).join('') : chars.slice(0, left).join('') + '…' + (right ? chars.slice(-right).join('') : '')) + suffix;
    }
  }

  function renderLeaderDonutChart(parent, options = {}) {
    if (!parent) return null;
    const palette = Array.isArray(options.palette) && options.palette.length ? options.palette : DEFAULT_PALETTE;
    const host = parent.createDiv();
    host.className = "noria-leader-donut";
    host.style.cssText = "position:relative;width:100%;min-width:0;display:flex;align-items:center;justify-content:center;";

    let renderedWidth;
    const render = () => {
      const focusedKey = host.contains(document.activeElement) ? document.activeElement?.getAttribute('data-category-key') : null;
      clearEl(host);
      const layout = computeLayout(parent, options);
      renderedWidth = layout.width;
      const { width, height, cx, cy, outerR, innerR, lineR, minY, maxY } = layout;
      const total = Number(options.total || 0);
      const slices = normalizeItems(options.items, total, palette);
      const totalValue = total > 0 ? total : slices.reduce((acc, item) => acc + item.value, 0);
  const uid = `noriaDonut${Math.random().toString(36).slice(2, 9)}`;

      const svg = createSvgEl("svg");
      setAttrs(svg, {
        viewBox: `0 0 ${width} ${height}`,
        role: typeof options.onSelect === 'function' ? 'group' : 'img',
        "aria-labelledby": `${uid}-title`
      });
      svg.style.cssText = "width:100%;max-width:100%;height:auto;display:block;overflow:hidden;";
      host.appendChild(svg);

      // Obsidian's aria-label tooltip handler only supports HTML elements.
      const chartTitle = setAttrs(createSvgEl("title"), { id: `${uid}-title` });
      chartTitle.textContent = options.ariaLabel || chartT("runtime.chart.donutAria", {}, "Note share");
      svg.appendChild(chartTitle);

      const defs = createSvgEl("defs");
      const shadow = createSvgEl("filter");
      setAttrs(shadow, { id: `${uid}-shadow`, x: "-16%", y: "-16%", width: "132%", height: "132%" });
      const drop = createSvgEl("feDropShadow");
      setAttrs(drop, { dx: "0", dy: "1.6", stdDeviation: "1.8", "flood-color": "rgba(15,23,42,.16)" });
      shadow.appendChild(drop);
      defs.appendChild(shadow);
      svg.appendChild(defs);

      const lineColor = "color-mix(in srgb,var(--text-muted) 58%,transparent)";
      const labelColor = "var(--text-normal)";
      const mutedColor = "var(--text-muted)";
      const groups = [];
      const labelInfos = [];

      slices.forEach((slice, index) => {
        const g = createSvgEl("g");
        g.classList.add("noria-leader-donut__slice");
        setAttrs(g, { role: typeof options.onSelect === 'function' ? 'button' : 'img', tabindex: 0,
          'data-category-key': slice.key, 'aria-labelledby': `${uid}-slice-${index}` });
        if (typeof options.onSelect === 'function') {
          g.addEventListener('click', () => options.onSelect(slice.key, g));
          g.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            options.onSelect(slice.key, g);
          });
        }
        const path = createSvgEl("path");
        setAttrs(path, {
          d: arcPath(cx, cy, outerR, innerR, slice.startAngle, slice.endAngle),
          fill: slice.color,
          stroke: "color-mix(in srgb,var(--background-primary) 88%,white)",
          "stroke-width": "1.25"
        });
        path.style.cssText = `filter:url(#${uid}-shadow);transition:opacity .12s ease,stroke-width .12s ease;`;
        const title = createSvgEl("desc");
        title.setAttribute('id', `${uid}-slice-${index}`);
        title.textContent = `${slice.label} · ${slice.value} · ${(slice.pct * 100).toFixed(1)}%`;
        path.appendChild(title);
        g.appendChild(path);
        svg.appendChild(g);
        groups[index] = { g, path };

        const mid = slice.midAngle;
        const sideVector = Math.cos(((mid - 90) * Math.PI) / 180);
        const isRight = sideVector >= 0;
        labelInfos.push({
          index,
          slice,
          isRight,
          sideConfidence: Math.abs(sideVector),
          pointOuter: polar(cx, cy, outerR, mid),
          pointElbow: polar(cx, cy, lineR, mid),
          targetY: polar(cx, cy, lineR, mid).y
        });

        if (slice.pct >= 0.075) {
          const midText = polar(cx, cy, (outerR + innerR) / 2, mid);
          const txt = createSvgEl("text");
          setAttrs(txt, {
            x: midText.x.toFixed(1),
            y: midText.y.toFixed(1),
            "text-anchor": "middle",
            "dominant-baseline": "middle"
          });
          txt.textContent = `${(slice.pct * 100).toFixed(1)}%`;
          txt.style.cssText = `fill:white;stroke:none;font-size:${layout.percentFont}px;font-weight:760;paint-order:stroke;filter:drop-shadow(0 1px 1px rgba(0,0,0,.32));pointer-events:none;`;
          g.appendChild(txt);
        }
      });

      const balancedLabelInfos = balanceLabelSides(labelInfos, options.labelBalance || "natural");
      const leftLabels = distributeLabels(balancedLabelInfos.filter((x) => !x.isRight), minY, maxY, layout.labelGap);
      const rightLabels = distributeLabels(balancedLabelInfos.filter((x) => x.isRight), minY, maxY, layout.labelGap);
      [...leftLabels, ...rightLabels].forEach((info) => {
        const labelX = info.isRight ? layout.rightLabelX : layout.leftLabelX;
        const anchor = info.isRight ? "start" : "end";
        const endX = info.isRight ? labelX - 5 : labelX + 5;
        const poly = createSvgEl("polyline");
        setAttrs(poly, {
          points: leaderPoints(info.pointOuter, info.pointElbow, { x: endX, y: info.y }, cx, cy, outerR, info.isRight).map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
          fill: "none",
          stroke: lineColor,
          "stroke-width": "1.15",
          "stroke-linecap": "round",
          "stroke-linejoin": "round"
        });
        poly.style.cssText = "pointer-events:none;transition:stroke .12s ease,stroke-width .12s ease;";
        groups[info.index].g.appendChild(poly);

        const dot = createSvgEl("circle");
        setAttrs(dot, { cx: info.pointOuter.x.toFixed(1), cy: info.pointOuter.y.toFixed(1), r: "2", fill: info.slice.color });
        groups[info.index].g.appendChild(dot);

        const suffix = "";
        const fullLabel = info.slice.label + suffix;
        const label = createSvgEl("text");
        setAttrs(label, {
          x: labelX,
          y: info.y.toFixed(1),
          "text-anchor": anchor,
          "dominant-baseline": "middle"
        });
        label.textContent = fullLabel;
        label.style.cssText = `fill:${labelColor};font-size:${layout.labelFont}px;font-weight:700;letter-spacing:0;transition:fill .12s ease,font-weight .12s ease;`;
        const item = groups[info.index];
        item.g.appendChild(label);
        // Measure actual glyphs: CJK labels are wider than a Latin character estimate.
        const textMax = info.isRight ? layout.rightTextMax : layout.leftTextMax;
        fitLabel(label, info.slice.label, suffix, textMax);
        if (typeof options.onSelect === 'function') {
          const hit = setAttrs(createSvgEl('rect'), {
            x: info.isRight ? labelX : labelX - textMax, y: info.y - 12,
            width: textMax, height: 24, fill: 'transparent', 'aria-hidden': 'true'
          });
          item.g.insertBefore(hit, label);
        }

        item.poly = poly;
        item.label = label;
        item.dot = dot;
      });

      const trace = setAttrs(createSvgEl('g'), { 'aria-hidden': 'true' });
      trace.style.cssText = 'pointer-events:none;display:none;';
      const traceBack = setAttrs(createSvgEl('polyline'), { fill: 'none', stroke: 'var(--background-primary)', 'stroke-width': 4.5, 'stroke-linejoin': 'round' });
      const traceFront = setAttrs(createSvgEl('polyline'), { fill: 'none', 'stroke-width': 1.8, 'stroke-linejoin': 'round' });
      trace.appendChild(traceBack); trace.appendChild(traceFront); svg.appendChild(trace);
      const hint = host.createDiv({ cls: 'noria-donut-inspection', attr: { 'aria-hidden': 'true' } });
      hint.hidden = true;
      let hovered = null, focused = null;
      const inspect = () => {
        const index = hovered ?? focused;
        groups.forEach((item, i) => {
          const active = i === index;
          item.path.setAttribute('stroke-width', active ? '2.3' : '1.25');
          item.poly.style.opacity = index === null || active ? '1' : '.18';
          item.dot.style.opacity = index === null || active ? '1' : '.18';
        });
        trace.style.display = index === null ? 'none' : '';
        hint.hidden = index === null;
        if (index === null) return;
        const item = groups[index], slice = slices[index];
        traceBack.setAttribute('points', item.poly.getAttribute('points'));
        traceFront.setAttribute('points', item.poly.getAttribute('points'));
        traceFront.setAttribute('stroke', slice.color);
        hint.textContent = `${slice.label} · ${slice.value} · ${(slice.pct * 100).toFixed(1)}%`;
        const box = host.getBoundingClientRect(), anchor = item.label.getBoundingClientRect();
        hint.style.left = `${Math.max(0, Math.min(anchor.left - box.left, box.width - hint.offsetWidth))}px`;
        const above = anchor.top - box.top - hint.offsetHeight - 6;
        hint.style.top = `${Math.max(0, Math.min(above >= 0 ? above : anchor.bottom - box.top + 6, box.height - hint.offsetHeight))}px`;
      };
      groups.forEach((item, index) => {
        item.g.addEventListener('mouseenter', () => { hovered = index; inspect(); });
        item.g.addEventListener('mouseleave', () => { hovered = null; inspect(); });
        item.g.addEventListener('focus', () => { focused = index; inspect(); });
        item.g.addEventListener('blur', () => { focused = null; inspect(); });
      });

      const centerValue = createSvgEl("text");
      setAttrs(centerValue, { x: cx, y: cy - 4, "text-anchor": "middle", "dominant-baseline": "middle" });
      centerValue.textContent = totalValue > 0 ? totalValue.toLocaleString() : "0";
      centerValue.style.cssText = "fill:var(--text-normal);font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:0;";
      centerValue.classList.add("noria-leader-donut__center-value");
      svg.appendChild(centerValue);

      const centerLabel = createSvgEl("text");
      setAttrs(centerLabel, { x: cx, y: cy + 15, "text-anchor": "middle", "dominant-baseline": "middle" });
      centerLabel.textContent = options.centerLabel || chartT("runtime.chart.totalNotes", {}, "Total notes");
      centerLabel.style.cssText = `fill:${mutedColor};font-size:11px;font-weight:640;letter-spacing:0;`;
      centerLabel.classList.add("noria-leader-donut__center-label");
      svg.appendChild(centerLabel);

      if (slices.length === 0 || totalValue <= 0) {
        const empty = createSvgEl("text");
        setAttrs(empty, { x: cx, y: cy + 36, "text-anchor": "middle", "dominant-baseline": "middle" });
        empty.textContent = chartT("runtime.chart.empty", {}, "No data");
        empty.style.cssText = `fill:${mutedColor};font-size:13px;font-weight:620;`;
        svg.appendChild(empty);
      }
      if (focusedKey !== null) groups.find(item => item.g.getAttribute('data-category-key') === focusedKey)?.g.focus();
    };

    render();
    try {
      if (typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(() => {
          if (host.isConnected === false) {
            ro.disconnect();
            return;
          }
          if (computeLayout(parent, options).width !== renderedWidth) render();
        });
        ro.observe(parent);
        host.__noriaChartCleanup = () => ro.disconnect();
      }
    } catch (_) {}

    return host;
  }

  root.components.charts.leaderDonutChart = {
    renderLeaderDonutChart,
    _test: { arcPath, normalizeItems, distributeLabels, balanceLabelSides, polar, computeLayout, leaderPoints, fitLabel }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.components.charts.leaderDonutChart;
})();
