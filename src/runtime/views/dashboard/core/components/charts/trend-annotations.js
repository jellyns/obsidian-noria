(() => {
  const root = globalThis.dashboardCore || (globalThis.dashboardCore = {});
  root.components = root.components || {};
  root.components.charts = root.components.charts || {};

  // Only absolute maxima; one label for a flat summit, and no labels for missing values.
  function peakIndexes(values) {
    const peaks = [];
    const maximum = Math.max(0, ...values.filter(v => v != null).map(Number).filter(Number.isFinite));
    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      if (value == null || !Number.isFinite(Number(value)) || Number(value) <= 0 || Number(value) !== maximum) continue;
      let end = i;
      while (end + 1 < values.length && values[end + 1] != null && Number(values[end + 1]) === Number(value)) end++;
      const before = i > 0 && values[i - 1] != null ? Number(values[i - 1]) : -Infinity;
      const after = end + 1 < values.length && values[end + 1] != null ? Number(values[end + 1]) : -Infinity;
      if (Number(value) > before && Number(value) > after) peaks.push(Math.floor((i + end) / 2));
      i = end;
    }
    return peaks;
  }

  function overlaps(a, b) {
    return a.x < b.x + b.width + 4 && a.x + a.width + 4 > b.x && a.y < b.y + b.height + 3 && a.y + a.height + 3 > b.y;
  }

  // Selected values win, followed by absolute maxima. Positions stay local to
  // their point; a crowded repeat is omitted instead of obscuring another value.
  function placeLabels(candidates, bounds) {
    const placed = [];
    for (const item of [...candidates].sort((a, b) => b.priority - a.priority)) {
      const width = item.width, height = 14;
      if (width > bounds.right - bounds.left) continue;
      const offsets = [[0, -18], [0, 10], [width / 2 + 9, -7], [-width / 2 - 9, -7], [0, -36], [0, 28], [width / 2 + 9, -25], [-width / 2 - 9, 21]];
      for (const [dx, dy] of offsets) {
        const box = {
          ...item,
          x: Math.max(bounds.left, Math.min(item.px + dx - width / 2, bounds.right - width)),
          y: Math.max(bounds.top, Math.min(item.py + dy, bounds.bottom - height)),
          width, height
        };
        if (placed.some(other => overlaps(box, other))) continue;
        placed.push(box);
        break;
      }
    }
    return placed;
  }

  function createTrendAnnotations(svg, {series, bounds}) {
    const el = (name, attrs = {}) => {
      const node = document.createElementNS('http://www.w3.org/2000/svg', name);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
      return node;
    };
    const layer = el('g', {class: 'noria-trend-annotations', 'pointer-events': 'none', 'aria-hidden': 'true'});
    svg.appendChild(layer);
    const update = active => {
      layer.textContent = '';
      const candidates = [];
      series.forEach((s, seriesIndex) => {
        const peaks = peakIndexes(s.values);
        const max = Math.max(0, ...s.values.map(Number).filter(Number.isFinite));
        const indices = new Set(peaks);
        if (Number.isInteger(active) && active >= 0 && active < s.values.length) indices.add(active);
        for (const index of indices) {
          const value = s.values[index];
          if (value == null || !Number.isFinite(Number(value))) continue;
          const selected = index === active;
          const text = (s.format || String)(value);
          const node = el('text', {'font-size': 11, 'font-weight': selected ? 650 : 500});
          node.textContent = text;
          layer.appendChild(node);
          const width = Math.max(8, node.getComputedTextLength?.() || String(text).length * 7) + 4;
          candidates.push({node, text, width, px: s.xAt(index), py: s.yAt(value), color: s.color,
            seriesIndex, index, selected, peak: peaks.includes(index),
            priority: selected ? 3 : Number(value) === max ? 2 : 1 + Number(value) / Math.max(1, max) * .5});
        }
      });
      const placed = placeLabels(candidates, bounds);
      layer.textContent = '';
      for (const item of placed) {
        const centerX = item.x + item.width / 2;
        const closestY = Math.max(item.y, Math.min(item.py, item.y + item.height));
        if (Math.abs(centerX - item.px) > 9 || Math.abs(closestY - item.py) > 22) {
          layer.appendChild(el('line', {x1: item.px, y1: item.py, x2: centerX, y2: closestY,
            stroke: item.color, 'stroke-opacity': .4, 'stroke-width': 1}));
        }
        for (const [key, value] of Object.entries({x: centerX, y: item.y + 11, 'text-anchor': 'middle', fill: item.color,
          stroke: 'var(--background-primary)', 'stroke-width': 3, 'stroke-linejoin': 'round', 'paint-order': 'stroke',
          'data-series': item.seriesIndex, 'data-index': item.index, 'data-selected': item.selected, 'data-peak': item.peak})) item.node.setAttribute(key, String(value));
        layer.appendChild(item.node);
      }
      return placed;
    };
    update(null);
    return {update};
  }

  const api = {peakIndexes, placeLabels, createTrendAnnotations};
  root.components.charts.trendAnnotations = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
