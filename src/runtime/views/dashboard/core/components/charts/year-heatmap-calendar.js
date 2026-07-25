(() => {
  const root = globalThis.dashboardCore || (globalThis.dashboardCore = {});
  root.components = root.components || {};
  root.components.charts = root.components.charts || {};

  const MONTH_LABELS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

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

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function dateKey(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function parseDateKey(value) {
    const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    d.setHours(0, 0, 0, 0);
    if (dateKey(d) !== `${m[1]}-${m[2]}-${m[3]}`) return null;
    return d;
  }

  function daysInYear(year) {
    return new Date(Number(year), 1, 29).getMonth() === 1 ? 366 : 365;
  }

  function daysInMonth(year, month) {
    return new Date(Number(year), Number(month) + 1, 0).getDate();
  }

  function dayOfYear(d) {
    const start = new Date(d.getFullYear(), 0, 1);
    start.setHours(0, 0, 0, 0);
    return Math.floor((d.getTime() - start.getTime()) / 86400000) + 1;
  }

  function weekdayIndex(d, weekStartDay) {
    return (d.getDay() - weekStartDay + 7) % 7;
  }

  function monthStartColumn(year, month, weekStartDay) {
    const firstDay = new Date(Number(year), 0, 1);
    const leading = weekdayIndex(firstDay, weekStartDay);
    const firstOfMonth = new Date(Number(year), Number(month), 1);
    return Math.floor((leading + dayOfYear(firstOfMonth) - 1) / 7) + 1;
  }

  function alignMonthLabel(label, column = 1) {
    if (!label) return;
    label.style.gridColumn = String(column);
    label.style.justifySelf = "start";
    label.style.textAlign = "left";
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, Number(n) || 0));
  }

  function mapLevel(value, minValue, maxValue, levels) {
    const v = Number(value || 0);
    if (v <= 0) return 0;
    const min = Number.isFinite(Number(minValue)) ? Number(minValue) : 1;
    const max = Number.isFinite(Number(maxValue)) ? Number(maxValue) : levels;
    if (max <= min) return levels;
    return clamp(Math.round(((v - min) / (max - min)) * (levels - 1) + 1), 1, levels);
  }

  function measureWidth(el, fallback) {
    try {
      const rect = el?.getBoundingClientRect?.();
      const w = Number(rect?.width || el?.clientWidth || 0);
      if (w > 0) return w;
    } catch (_) {}
    return fallback;
  }

  function layoutSpec(width, totalWeeks, showYearLabel) {
    const w = Math.max(1, Number(width || 0));
    const yearReserve = showYearLabel ? 14 : 0;
    const showWeekdays = w >= 390;
    const weekdayReserve = showWeekdays ? 12 : 0;
    const gap = w < 180 ? 0 : w < 280 ? 0.5 : 1;
    const usable = Math.max(1, w - yearReserve - weekdayReserve - 2 - (totalWeeks - 1) * gap);
    const cell = clamp(Math.floor(usable / totalWeeks), w < 140 ? 1 : 2, 17);
    return {
      gap,
      cell,
      showWeekdays,
      weekdayOffset: showWeekdays ? 12 : 0,
      showAllMonths: w >= 500,
      showQuarterMonths: w >= 360,
      monthFont: w < 430 ? ".58em" : ".68em"
    };
  }

  function separatedLayoutSpec(width, showWeekNumbers) {
    const w = Math.max(320, Number(width || 0));
    const showWeekdays = w >= 440;
    const gap = w < 560 ? 1 : 2;
    const monthGap = w < 520 ? 5 : w < 760 ? 7 : 9;
    const monthWidth = (w - (showWeekdays ? 17 : 0) - monthGap * 11 - 8) / 12;
    const cell = clamp(Math.floor((monthWidth - gap * 5) / 6), 4, 10);
    return {
      gap,
      monthGap,
      cell,
      showWeekdays,
      showWeekNumbers: showWeekNumbers !== false && w >= 560 && cell >= 5,
      monthFont: w < 520 ? ".56em" : ".64em",
      weekFont: w < 620 ? ".5em" : ".56em"
    };
  }

  function readPalette(paletteKey, level) {
    const cp = root.components?.charts?.chartPalette;
    if (typeof cp?.heatmapColor === "function") return cp.heatmapColor(paletteKey, level);
    const cssName = `--dash-heatmap-${paletteKey || "work"}-level-${level}`;
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(cssName).trim();
      if (v) return v;
    } catch (_) {}
    return ["#d7f4ea", "#b5ead9", "#8edfc7", "#62d0b2", "#39b993", "#148766"][level - 1] || "#8edfc7";
  }

  function paletteValue(name, fallback) {
    const cp = root.components?.charts?.chartPalette;
    const fn = cp && cp[name];
    if (typeof fn === "function") return fn();
    return fallback;
  }

  function normalizeEntries(entries, year, levels, minValue, maxValue) {
    const byDate = new Map();
    const source = Array.isArray(entries) ? entries : [];
    for (const raw of source) {
      const d = parseDateKey(raw?.date);
      if (!d || d.getFullYear() !== Number(year)) continue;
      const key = dateKey(d);
      const level = mapLevel(raw?.intensity, minValue, maxValue, levels);
      if (level <= 0) continue;
      const existing = byDate.get(key);
      if (!existing || level >= existing.level) {
        const rawValue = raw?.rawValue ?? raw?.value ?? raw?.intensity;
        const valueLabel = raw?.valueLabel == null ? "" : String(raw.valueLabel || "");
        const tooltip = raw?.tooltip == null ? "" : String(raw.tooltip || "");
        const ariaLabel = raw?.ariaLabel == null ? "" : String(raw.ariaLabel || "");
        byDate.set(key, {
          date: key,
          level,
          rawIntensity: Number(raw?.intensity || 0),
          rawValue,
          valueLabel,
          tooltip,
          ariaLabel,
          content: raw?.content == null ? "" : String(raw.content || "")
        });
      }
    }
    return byDate;
  }

  function isoWeekNumber(d) {
    const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    dt.setHours(0, 0, 0, 0);
    dt.setDate(dt.getDate() + 3 - ((dt.getDay() + 6) % 7));
    const week1 = new Date(dt.getFullYear(), 0, 4);
    return 1 + Math.round(((dt.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  }

  function renderSeparatedMonthHeatmap(parent, context) {
    const {
      year,
      weekStartDay,
      paletteKey,
      entriesByDate,
      todayKey,
      emptyFill,
      emptyBorder,
      todayBorder,
      hoverBorder,
      labelColor,
      showWeekNumbers
    } = context;
    const rootEl = parent.createDiv();
    rootEl.className = `noria-year-heatmap noria-year-heatmap--${paletteKey} noria-year-heatmap--separated-months`;
    rootEl.style.cssText =
      "width:100%;min-width:0;overflow:hidden;padding-bottom:2px;display:grid;grid-template-columns:minmax(0,1fr);row-gap:4px;align-items:start;";

    const body = rootEl.createDiv();
    body.style.cssText = "display:grid;align-items:start;min-width:0;";
    const weekdays = body.createDiv();
    weekdays.style.cssText = "display:grid;align-items:center;color:var(--text-muted);font-size:.58em;font-weight:600;opacity:.68;";
    [
      displayLabel("weekday", "一", "Mon"),
      displayLabel("weekday", "二", "Tue"),
      displayLabel("weekday", "三", "Wed"),
      displayLabel("weekday", "四", "Thu"),
      displayLabel("weekday", "五", "Fri"),
      displayLabel("weekday", "六", "Sat"),
      displayLabel("weekday", "日", "Sun")
    ].forEach((label) => {
      weekdays.createDiv({ text: label }).style.cssText = "height:10px;line-height:10px;text-align:right;";
    });

    const monthsGrid = body.createDiv();
    monthsGrid.style.cssText = "display:grid;grid-template-columns:repeat(12,minmax(0,1fr));align-items:start;min-width:0;width:100%;";
    const monthGroups = [];
    const monthCells = [];
    for (let month = 0; month < 12; month++) {
      const first = new Date(year, month, 1);
      const leading = weekdayIndex(first, weekStartDay);
      const monthDays = daysInMonth(year, month);
      const weekCount = Math.ceil((leading + monthDays) / 7);
      const group = monthsGrid.createDiv();
      group.style.cssText = "display:grid;grid-template-rows:auto auto auto;align-items:start;justify-items:start;min-width:0;";
      const label = group.createDiv({ text: MONTH_LABELS[month] });
      label.style.cssText = `color:${labelColor};font-weight:620;line-height:1.1;opacity:.72;white-space:nowrap;`;
      alignMonthLabel(label, 1);
      const grid = group.createDiv();
      grid.style.cssText = `display:grid;grid-template-columns:repeat(${weekCount},minmax(0,1fr));min-width:0;`;
      const weekRow = group.createDiv();
      weekRow.style.cssText = `display:grid;grid-template-columns:repeat(${weekCount},minmax(0,1fr));color:${labelColor};opacity:.58;font-weight:600;line-height:1.1;`;
      for (let w = 0; w < weekCount; w++) {
        const weekStart = new Date(year, month, 1 - leading + w * 7);
        weekRow.createDiv({ text: String(isoWeekNumber(weekStart)) }).style.cssText = "text-align:center;min-width:0;";
      }
      monthGroups.push({ group, label, grid, weekRow, weekCount });
      for (let day = 1; day <= monthDays; day++) {
        const d = new Date(year, month, day);
        const key = dateKey(d);
        const entry = entriesByDate.get(key);
        const row = weekdayIndex(d, weekStartDay) + 1;
        const col = Math.floor((leading + day - 1) / 7) + 1;
        const cell = grid.createDiv();
        const hasData = !!entry;
        const fill = hasData ? readPalette(paletteKey, entry.level) : emptyFill;
        const border = hasData ? `color-mix(in srgb,${fill} 74%,var(--background-modifier-border))` : emptyBorder;
        const recordedLabel = displayLabel("metric", "有记录", chartT("runtime.chart.recorded", {}, "Recorded"));
        const noRecordLabel = displayLabel("metric", "无记录", chartT("runtime.chart.noRecord", {}, "No record"));
        const defaultLabel = hasData
          ? `${key} · ${entry.valueLabel || entry.content || (entry.rawValue == null ? recordedLabel : String(entry.rawValue))}`
          : `${key} · ${noRecordLabel}`;
        const titleText = hasData ? (entry.tooltip || defaultLabel) : defaultLabel;
        const ariaText = hasData ? (entry.ariaLabel || entry.tooltip || defaultLabel) : defaultLabel;
        cell.className = `noria-year-heatmap__cell${hasData ? " has-data" : " is-empty"}${key === todayKey ? " is-today" : ""}`;
        cell.setAttr("role", "img");
        cell.setAttr("aria-label", ariaText);
        cell.style.cssText =
          `grid-column:${col};grid-row:${row};width:10px;height:10px;min-width:0;border-radius:3px;background:${fill};border:1px solid ${hasData && key === todayKey ? todayBorder : border};box-sizing:border-box;box-shadow:${hasData ? "0 1px 0 color-mix(in srgb,var(--background-primary) 44%,transparent) inset" : "none"};transition:transform .12s ease,border-color .12s ease,box-shadow .12s ease;`;
        cell.title = titleText;
        monthCells.push({ cell, key, border, hasData });
        cell.onmouseenter = () => {
          cell.style.borderColor = hoverBorder;
          cell.style.boxShadow = "0 0 0 1px color-mix(in srgb,var(--background-primary) 72%,transparent) inset,0 1px 4px rgba(15,23,42,.12)";
          cell.style.transform = "translateY(-1px)";
        };
        cell.onmouseleave = () => {
          cell.style.borderColor = hasData && key === todayKey ? todayBorder : border;
          cell.style.boxShadow = hasData ? "0 1px 0 color-mix(in srgb,var(--background-primary) 44%,transparent) inset" : "none";
          cell.style.transform = "";
        };
      }
    }

    const applyLayout = () => {
      const width = measureWidth(parent, 640);
      const spec = separatedLayoutSpec(width, showWeekNumbers);
      body.style.gridTemplateColumns = spec.showWeekdays ? "auto minmax(0,1fr)" : "minmax(0,1fr)";
      body.style.gap = spec.showWeekdays ? "5px" : "0";
      weekdays.style.display = spec.showWeekdays ? "grid" : "none";
      weekdays.style.gridTemplateRows = `repeat(7,${spec.cell}px)`;
      weekdays.style.gap = `${spec.gap}px`;
      Array.from(weekdays.children || []).forEach((node) => {
        node.style.height = `${spec.cell}px`;
        node.style.lineHeight = `${spec.cell}px`;
      });
      monthsGrid.style.gap = `${spec.monthGap}px`;
      monthGroups.forEach(({ label, grid, weekRow, weekCount }) => {
        label.style.fontSize = spec.monthFont;
        label.style.marginBottom = `${Math.max(2, spec.gap)}px`;
        grid.style.gap = `${spec.gap}px`;
        grid.style.gridTemplateColumns = `repeat(${weekCount},${spec.cell}px)`;
        grid.style.gridTemplateRows = `repeat(7,${spec.cell}px)`;
        weekRow.style.display = spec.showWeekNumbers ? "grid" : "none";
        weekRow.style.gap = `${spec.gap}px`;
        weekRow.style.gridTemplateColumns = `repeat(${weekCount},${spec.cell}px)`;
        weekRow.style.fontSize = spec.weekFont;
        weekRow.style.marginTop = `${Math.max(2, spec.gap)}px`;
      });
      monthCells.forEach(({ cell }) => {
        cell.style.width = `${spec.cell}px`;
        cell.style.height = `${spec.cell}px`;
        cell.style.borderRadius = `${spec.cell <= 5 ? 2 : 3}px`;
      });
    };

    applyLayout();
    try {
      if (typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(() => {
          if (rootEl.isConnected === false) {
            ro.disconnect();
            return;
          }
          applyLayout();
        });
        ro.observe(parent);
        ro.observe(rootEl);
      }
    } catch (_) {}

    return rootEl;
  }

  function renderYearHeatmapCalendar(parent, config = {}) {
    if (!parent) return null;
    const year = Number(config.year || new Date().getFullYear());
    const weekStartDay = clamp(config.weekStartDay ?? 1, 0, 6);
    const levels = clamp(config.levels ?? 6, 2, 6);
    const paletteKey = String(config.paletteKey || "work").trim() || "work";
    const showYearLabel = config.showYearLabel === true;
    const layout = String(config.layout || "continuous") === "separated-months" ? "separated-months" : "continuous";
    const firstDay = new Date(year, 0, 1);
    const leading = weekdayIndex(firstDay, weekStartDay);
    const totalDays = daysInYear(year);
    const totalWeeks = Math.ceil((leading + totalDays) / 7);
    const sourceEntries = Array.isArray(config.entries) ? config.entries : [];
    const sourceIntensities = sourceEntries.map((x) => Number(x?.intensity || 0)).filter((x) => x > 0);
    const minValue = config.intensityScaleStart ?? (sourceIntensities.length ? Math.min(...sourceIntensities) : 1);
    const maxValue = config.intensityScaleEnd ?? (sourceIntensities.length ? Math.max(...sourceIntensities) : levels);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayKey = today.getFullYear() === year ? dateKey(today) : "";
    const entriesByDate = normalizeEntries(sourceEntries, year, levels, minValue, maxValue);

    const emptyFill = paletteValue("heatmapEmptyFill", "color-mix(in srgb,var(--background-primary) 82%,rgb(226 232 240))");
    const emptyBorder = paletteValue("heatmapEmptyBorder", "transparent");
    const todayBorder = paletteValue("heatmapTodayBorder", "color-mix(in srgb,var(--interactive-accent) 72%,var(--text-normal))");
    const hoverBorder = paletteValue("heatmapHoverBorder", "color-mix(in srgb,var(--interactive-accent) 55%,var(--background-modifier-border))");
    const labelColor = paletteValue("heatmapLabelColor", "var(--text-muted)");

    if (layout === "separated-months") {
      return renderSeparatedMonthHeatmap(parent, {
        year,
        weekStartDay,
        paletteKey,
        entriesByDate,
        todayKey,
        emptyFill,
        emptyBorder,
        todayBorder,
        hoverBorder,
        labelColor,
        showWeekNumbers: config.showWeekNumbers
      });
    }

    const rootEl = parent.createDiv();
    rootEl.className = `noria-year-heatmap noria-year-heatmap--${paletteKey}`;
    rootEl.style.cssText =
      "width:100%;min-width:0;overflow:hidden;padding-bottom:2px;display:grid;grid-template-rows:auto auto;row-gap:4px;align-items:start;";

    let yearEl = null;
    if (showYearLabel) {
      yearEl = rootEl.createDiv({ text: String(year).slice(2) });
      yearEl.style.cssText =
        `grid-column:1;grid-row:1 / span 2;color:${labelColor};font-size:.68em;font-weight:700;line-height:1;writing-mode:vertical-rl;letter-spacing:.04em;padding-top:18px;opacity:.68;`;
    }

    const monthRow = rootEl.createDiv();
    monthRow.style.cssText = `grid-row:1;display:grid;grid-template-columns:repeat(${totalWeeks},minmax(0,1fr));color:${labelColor};font-weight:620;line-height:1.1;min-width:0;`;
    const monthLabels = [];
    for (let month = 0; month < 12; month++) {
      const col = monthStartColumn(year, month, weekStartDay);
      const label = monthRow.createDiv({ text: MONTH_LABELS[month] });
      label.style.cssText = `grid-column:${col};white-space:nowrap;opacity:.72;`;
      alignMonthLabel(label, col);
      monthLabels.push({ month, label });
    }

    const body = rootEl.createDiv();
    body.style.cssText = "grid-row:2;display:grid;align-items:start;min-width:0;";
    const weekdays = body.createDiv();
    weekdays.style.cssText = "display:grid;align-items:center;color:var(--text-muted);font-size:.62em;font-weight:600;opacity:.68;";
    ["", displayLabel("weekday", "一", "Mon"), "", displayLabel("weekday", "三", "Wed"), "", displayLabel("weekday", "五", "Fri"), ""].forEach((label) => {
      weekdays.createDiv({ text: label }).style.cssText = "height:11px;line-height:11px;text-align:right;";
    });

    const grid = body.createDiv();
    grid.style.cssText = `display:grid;grid-template-columns:repeat(${totalWeeks},minmax(0,1fr));min-width:0;width:100%;`;
    const cells = [];
    for (let day = 1; day <= totalDays; day++) {
      const d = new Date(year, 0, day);
      const key = dateKey(d);
      const entry = entriesByDate.get(key);
      const row = weekdayIndex(d, weekStartDay) + 1;
      const col = Math.floor((leading + day - 1) / 7) + 1;
      const cell = grid.createDiv();
      const hasData = !!entry;
      const fill = hasData ? readPalette(paletteKey, entry.level) : emptyFill;
      const border = hasData ? `color-mix(in srgb,${fill} 74%,var(--background-modifier-border))` : emptyBorder;
      const recordedLabel = displayLabel("metric", "有记录", chartT("runtime.chart.recorded", {}, "Recorded"));
      const noRecordLabel = displayLabel("metric", "无记录", chartT("runtime.chart.noRecord", {}, "No record"));
      const defaultLabel = hasData
        ? `${key} · ${entry.valueLabel || entry.content || (entry.rawValue == null ? recordedLabel : String(entry.rawValue))}`
        : `${key} · ${noRecordLabel}`;
      const titleText = hasData ? (entry.tooltip || defaultLabel) : defaultLabel;
      const ariaText = hasData ? (entry.ariaLabel || entry.tooltip || defaultLabel) : defaultLabel;
      cell.className = `noria-year-heatmap__cell${hasData ? " has-data" : " is-empty"}${key === todayKey ? " is-today" : ""}`;
      cell.setAttr("role", "img");
      cell.setAttr("aria-label", ariaText);
      cell.style.cssText =
        `grid-column:${col};grid-row:${row};width:11px;height:11px;min-width:0;border-radius:3px;background:${fill};border:1px solid ${hasData && key === todayKey ? todayBorder : border};box-sizing:border-box;box-shadow:${hasData ? "0 1px 0 color-mix(in srgb,var(--background-primary) 44%,transparent) inset" : "none"};transition:transform .12s ease,border-color .12s ease,box-shadow .12s ease;`;
      cell.title = titleText;
      cells.push({ cell, key, border, hasData });
      cell.onmouseenter = () => {
        cell.style.borderColor = hoverBorder;
        cell.style.boxShadow = "0 0 0 1px color-mix(in srgb,var(--background-primary) 72%,transparent) inset,0 1px 4px rgba(15,23,42,.12)";
        cell.style.transform = "translateY(-1px)";
      };
      cell.onmouseleave = () => {
        cell.style.borderColor = hasData && key === todayKey ? todayBorder : border;
        cell.style.boxShadow = hasData ? "0 1px 0 color-mix(in srgb,var(--background-primary) 44%,transparent) inset" : "none";
        cell.style.transform = "";
      };
    }

    const applyLayout = () => {
      const width = measureWidth(parent, 640);
      const spec = layoutSpec(width, totalWeeks, showYearLabel);
      rootEl.style.gridTemplateColumns = showYearLabel ? "auto minmax(0,1fr)" : "minmax(0,1fr)";
      rootEl.style.columnGap = showYearLabel ? "7px" : "0";
      if (yearEl) {
        yearEl.style.display = "block";
      }
      monthRow.style.gridColumn = showYearLabel ? "2" : "1";
      monthRow.style.marginLeft = `${spec.weekdayOffset}px`;
      monthRow.style.gridTemplateColumns = `repeat(${totalWeeks},${spec.cell}px)`;
      monthRow.style.justifyContent = "start";
      monthRow.style.gap = `${spec.gap}px`;
      monthRow.style.fontSize = spec.monthFont;
      body.style.gridColumn = showYearLabel ? "2" : "1";
      body.style.gridTemplateColumns = spec.showWeekdays ? "auto max-content" : "max-content";
      body.style.justifyContent = "start";
      body.style.gap = spec.showWeekdays ? "3px" : "0";
      weekdays.style.display = spec.showWeekdays ? "grid" : "none";
      weekdays.style.gridTemplateRows = `repeat(7,${spec.cell}px)`;
      weekdays.style.gap = `${spec.gap}px`;
      Array.from(weekdays.children || []).forEach((node) => {
        node.style.height = `${spec.cell}px`;
        node.style.lineHeight = `${spec.cell}px`;
      });
      grid.style.gap = `${spec.gap}px`;
      grid.style.gridTemplateColumns = `repeat(${totalWeeks},${spec.cell}px)`;
      grid.style.gridTemplateRows = `repeat(7,${spec.cell}px)`;
      monthLabels.forEach(({ month, label }) => {
        const show = spec.showAllMonths || (spec.showQuarterMonths && [0, 3, 6, 9, 11].includes(month)) || [0, 6, 11].includes(month);
        label.style.visibility = show ? "visible" : "hidden";
      });
      cells.forEach(({ cell }) => {
        cell.style.width = `${spec.cell}px`;
        cell.style.height = `${spec.cell}px`;
        cell.style.minWidth = "0";
        cell.style.borderRadius = `${spec.cell <= 5 ? 2 : 3}px`;
      });
    };

    applyLayout();
    try {
      if (typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(() => {
          if (rootEl.isConnected === false) {
            ro.disconnect();
            return;
          }
          applyLayout();
        });
        ro.observe(parent);
        ro.observe(rootEl);
      }
    } catch (_) {}

    return rootEl;
  }

  root.components.charts.yearHeatmapCalendar = {
    renderYearHeatmapCalendar,
    _test: { parseDateKey, dateKey, daysInYear, daysInMonth, dayOfYear, weekdayIndex, normalizeEntries, mapLevel, monthStartColumn, layoutSpec, separatedLayoutSpec, isoWeekNumber }
  };
})();
