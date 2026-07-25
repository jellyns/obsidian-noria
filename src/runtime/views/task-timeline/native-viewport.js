(function () {
  const root = globalThis.noriaTaskTimeline || (globalThis.noriaTaskTimeline = {});
  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  const TICK_INTERVALS = [
    MINUTE,
    5 * MINUTE,
    15 * MINUTE,
    30 * MINUTE,
    HOUR,
    3 * HOUR,
    6 * HOUR,
    12 * HOUR,
    DAY,
    2 * DAY,
    7 * DAY,
    14 * DAY,
    30 * DAY,
    90 * DAY,
    180 * DAY,
    365 * DAY
  ];

  function finite(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function timeMs(value) {
    if (value instanceof Date) return value.getTime();
    const number = Number(value);
    if (Number.isFinite(number)) return number;
    const parsed = Date.parse(String(value == null ? "" : value));
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function normalizeZones(zones) {
    const raw = (Array.isArray(zones) ? zones : []).map((zone) => {
      const startMs = timeMs(zone && (zone.startMs != null ? zone.startMs : zone.start));
      const endMs = timeMs(zone && (zone.endMs != null ? zone.endMs : zone.end));
      const magnify = Math.max(1, finite(zone && zone.magnify, 1));
      return Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs && magnify > 1
        ? { startMs, endMs, magnify }
        : null;
    }).filter(Boolean);
    if (!raw.length) return [];
    const boundaries = Array.from(new Set(raw.flatMap((zone) => [zone.startMs, zone.endMs]))).sort((a, b) => a - b);
    const normalized = [];
    for (let index = 0; index < boundaries.length - 1; index += 1) {
      const startMs = boundaries[index];
      const endMs = boundaries[index + 1];
      const magnify = raw.reduce((product, zone) => {
        return zone.startMs < endMs && zone.endMs > startMs ? product * zone.magnify : product;
      }, 1);
      if (magnify <= 1) continue;
      const previous = normalized[normalized.length - 1];
      if (previous && previous.endMs === startMs && previous.magnify === magnify) previous.endMs = endMs;
      else normalized.push({ startMs, endMs, magnify });
    }
    return normalized;
  }

  function timeDiffToPx(viewport, fromMs, toMs) {
    if (toMs === fromMs) return 0;
    if (!viewport.zones.length) return (toMs - fromMs) / viewport.msPerPx;
    const direction = toMs > fromMs ? 1 : -1;
    const lower = Math.min(fromMs, toMs);
    const upper = Math.max(fromMs, toMs);
    let pixels = (upper - lower) / viewport.msPerPx;
    viewport.zones.forEach((zone) => {
      const overlap = Math.max(0, Math.min(upper, zone.endMs) - Math.max(lower, zone.startMs));
      if (overlap > 0) pixels += overlap * (zone.magnify - 1) / viewport.msPerPx;
    });
    return direction * pixels;
  }

  function pixelDiffToDate(viewport, deltaPx, fromMs) {
    if (deltaPx === 0) return fromMs;
    if (!viewport.zones.length) return fromMs + deltaPx * viewport.msPerPx;
    const distanceMs = Math.abs(deltaPx) * viewport.msPerPx;
    let lower = deltaPx > 0 ? fromMs : fromMs - distanceMs;
    let upper = deltaPx > 0 ? fromMs + distanceMs : fromMs;
    for (let iteration = 0; iteration < 60; iteration += 1) {
      const middle = lower + (upper - lower) / 2;
      if (timeDiffToPx(viewport, fromMs, middle) < deltaPx) lower = middle;
      else upper = middle;
    }
    return lower + (upper - lower) / 2;
  }

  function createViewport(options = {}) {
    const minMsPerPx = Math.max(0.001, finite(options.minMsPerPx, 1_000));
    const maxMsPerPx = Math.max(minMsPerPx, finite(options.maxMsPerPx, 10 * 365 * DAY));
    return {
      centerMs: finite(options.centerMs, Date.now()),
      msPerPx: clamp(Math.max(0.001, finite(options.msPerPx, HOUR)), minMsPerPx, maxMsPerPx),
      widthPx: Math.max(0, finite(options.widthPx, 0)),
      minMsPerPx,
      maxMsPerPx,
      zones: normalizeZones(options.zones)
    };
  }

  function dateMsToPx(viewport, dateMs) {
    return viewport.widthPx / 2 + timeDiffToPx(viewport, viewport.centerMs, finite(dateMs, viewport.centerMs));
  }

  function pxToDateMs(viewport, px) {
    return pixelDiffToDate(viewport, finite(px, viewport.widthPx / 2) - viewport.widthPx / 2, viewport.centerMs);
  }

  function visibleRange(viewport) {
    return {
      startMs: pxToDateMs(viewport, 0),
      endMs: pxToDateMs(viewport, viewport.widthPx)
    };
  }

  function panByPx(viewport, deltaPx) {
    return createViewport({
      ...viewport,
      centerMs: pxToDateMs(viewport, viewport.widthPx / 2 - finite(deltaPx, 0))
    });
  }

  function zoomAtPx(viewport, anchorPx, factor) {
    const px = finite(anchorPx, viewport.widthPx / 2);
    const anchorMs = pxToDateMs(viewport, px);
    const nextMsPerPx = clamp(
      viewport.msPerPx * Math.max(0.000001, finite(factor, 1)),
      viewport.minMsPerPx,
      viewport.maxMsPerPx
    );
    const provisional = createViewport({ ...viewport, centerMs: anchorMs, msPerPx: nextMsPerPx });
    const nextCenterMs = pixelDiffToDate(provisional, viewport.widthPx / 2 - px, anchorMs);
    return createViewport({ ...provisional, centerMs: nextCenterMs });
  }

  function resizeViewport(viewport, widthPx) {
    return createViewport({ ...viewport, widthPx });
  }

  function chooseTickInterval(viewport, minSpacingPx) {
    const minimumMs = viewport.msPerPx * Math.max(1, finite(minSpacingPx, 72));
    return TICK_INTERVALS.find((interval) => interval >= minimumMs) || TICK_INTERVALS[TICK_INTERVALS.length - 1];
  }

  function buildTimeTicks(viewport, options = {}) {
    if (!viewport || viewport.widthPx <= 0) return [];
    const intervalMs = chooseTickInterval(viewport, options.minSpacingPx);
    const range = visibleRange(viewport);
    const firstMs = Math.floor(range.startMs / intervalMs) * intervalMs;
    const ticks = [];
    const limit = 2_000;
    for (let timeMs = firstMs, count = 0; timeMs <= range.endMs && count < limit; timeMs += intervalMs, count += 1) {
      if (timeMs < range.startMs) continue;
      ticks.push({ timeMs, intervalMs, px: dateMsToPx(viewport, timeMs) });
    }
    return ticks;
  }

  function syncOverviewWindow(mainViewport, overviewViewport) {
    const range = visibleRange(mainViewport);
    const leftPx = dateMsToPx(overviewViewport, range.startMs);
    const rightPx = dateMsToPx(overviewViewport, range.endMs);
    return { leftPx, rightPx, widthPx: Math.max(0, rightPx - leftPx), startMs: range.startMs, endMs: range.endMs };
  }

  root.nativeViewport = {
    createViewport,
    dateMsToPx,
    pxToDateMs,
    visibleRange,
    panByPx,
    zoomAtPx,
    resizeViewport,
    buildTimeTicks,
    syncOverviewWindow,
    normalizeZones
  };

  if (globalThis.__NORIA_TASK_TIMELINE_TEST__) {
    globalThis.__noriaTaskTimelineViewportTestHooks = root.nativeViewport;
  }
})();
