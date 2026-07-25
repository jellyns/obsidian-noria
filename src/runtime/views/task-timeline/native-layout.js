(function () {
  const root = globalThis.noriaTaskTimeline || (globalThis.noriaTaskTimeline = {});
  const viewportApi = root.nativeViewport;
  const eventIndexApi = root.nativeEventIndex;
  if (!viewportApi || typeof viewportApi.dateMsToPx !== "function") {
    throw new Error("Noria native viewport must load before native layout");
  }
  if (!eventIndexApi || typeof eventIndexApi.createEventIndex !== "function") {
    throw new Error("Noria native event index must load before native layout");
  }

  const DEFAULT_METRICS = Object.freeze({
    safeTopPx: 24,
    safeBottomPx: 10,
    horizontalPaddingPx: 8,
    titleHeightPx: 16,
    laneGapPx: 6,
    laneStepPx: 22,
    markerSizePx: 7,
    markerGapPx: 3,
    railHeightPx: 2,
    handleWidthPx: 3,
    minTitleWidthPx: 44,
    maxTitleWidthPx: 220
  });

  function finite(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function rect(left, top, width, height) {
    const safeWidth = Math.max(0, finite(width, 0));
    const safeHeight = Math.max(0, finite(height, 0));
    return {
      left,
      top,
      right: left + safeWidth,
      bottom: top + safeHeight,
      width: safeWidth,
      height: safeHeight
    };
  }

  function titleMaxWidth(widthPx) {
    if (widthPx < 240) return 140;
    return 220;
  }

  function titleFontSizePx(widthPx) {
    return widthPx > 320 ? 12 : 11;
  }

  function resolveMetrics(widthPx, overrides = {}) {
    return {
      ...DEFAULT_METRICS,
      ...overrides,
      maxTitleWidthPx: finite(overrides.maxTitleWidthPx, titleMaxWidth(widthPx))
    };
  }

  function normalizedStatus(event) {
    return text(event && event.status).toLowerCase();
  }

  function isDone(event) {
    return ["done", "completed", "complete", "x"].includes(normalizedStatus(event));
  }

  function groupTaskEvents(events) {
    const groups = new Map();
    events.forEach((event) => {
      if (!event || text(event.layer) !== "task") return;
      const taskKey = text(event.taskKey || event.id);
      if (!taskKey) return;
      if (!groups.has(taskKey)) groups.set(taskKey, []);
      groups.get(taskKey).push(event);
    });
    return Array.from(groups.entries()).map(([taskKey, items]) => {
      const sorted = items.slice().sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs || text(a.id).localeCompare(text(b.id)));
      const duration = sorted.find((event) => !event.isInstant && event.endMs > event.startMs);
      const primary = duration || sorted[0];
      return { taskKey, events: sorted, primary };
    }).sort((a, b) => a.primary.startMs - b.primary.startMs || a.taskKey.localeCompare(b.taskKey));
  }

  function measureTitleWidth(title, measureText, metrics, widthPx) {
    let measured = 0;
    try {
      measured = finite(measureText(title, "task-title", {
        widthPx,
        fontSizePx: titleFontSizePx(widthPx),
        fontWeight: 600,
        fontFamily: "Arial, Helvetica, sans-serif"
      }), 0);
    } catch (_) {}
    if (!(measured > 0)) measured = Math.max(1, text(title).length) * 7;
    return clamp(measured + 1, metrics.minTitleWidthPx, metrics.maxTitleWidthPx);
  }

  function visibleDraft(group, viewport, widthPx, heightPx, measureText, metrics) {
    const event = group.primary;
    const range = viewportApi.visibleRange(viewport);
    const instant = event.isInstant || event.endMs === event.startMs;
    if (instant && (event.startMs < range.startMs || event.startMs > range.endMs)) return null;
    if (!instant && (event.endMs < range.startMs || event.startMs > range.endMs)) return null;

    const rawStartX = viewportApi.dateMsToPx(viewport, event.startMs);
    const rawEndX = instant ? rawStartX : viewportApi.dateMsToPx(viewport, event.endMs);
    const visibleStartX = clamp(Math.min(rawStartX, rawEndX), 0, widthPx);
    const visibleEndX = clamp(Math.max(rawStartX, rawEndX), 0, widthPx);
    const anchorX = instant ? rawStartX : visibleStartX + (visibleEndX - visibleStartX) / 2;
    const title = text(event.title || event.text || group.taskKey);
    const titleWidth = measureTitleWidth(title, measureText, metrics, widthPx);
    const preferredLeft = instant
      ? anchorX + metrics.markerSizePx / 2 + metrics.markerGapPx
      : anchorX - titleWidth / 2;
    const minLeft = metrics.horizontalPaddingPx;
    const maxLeft = Math.max(minLeft, widthPx - metrics.horizontalPaddingPx - titleWidth);
    const titleLeft = clamp(preferredLeft, minLeft, maxLeft);

    return {
      taskKey: group.taskKey,
      eventId: text(event.id),
      title,
      status: normalizedStatus(event),
      startMs: event.startMs,
      endMs: event.endMs,
      isInstant: instant,
      anchorX,
      rawStartX,
      rawEndX,
      visibleStartX,
      visibleEndX,
      titleWidth,
      titleLeft,
      baseTop: metrics.safeTopPx,
      heightPx,
      clippedStart: rawStartX < 0,
      clippedEnd: rawEndX > widthPx
    };
  }

  function collides(a, b, gapX = 0, gapY = 0) {
    if (!a || !b) return false;
    return a.left < b.right + gapX &&
      a.right + gapX > b.left &&
      a.top < b.bottom + gapY &&
      a.bottom + gapY > b.top;
  }

  function placeTaskTitles(drafts, heightPx, metrics) {
    const placed = [];
    const maxLane = Math.max(0, Math.floor((heightPx - metrics.safeBottomPx - metrics.safeTopPx - metrics.titleHeightPx) / metrics.laneStepPx));
    drafts.forEach((draft) => {
      let lane = 0;
      let bounds = rect(draft.titleLeft, metrics.safeTopPx, draft.titleWidth, metrics.titleHeightPx);
      const conflicts = () => placed.some((item) => item.titleVisible !== false && collides(item.titleBounds, bounds, metrics.laneGapPx, 1));
      while (lane < maxLane && conflicts()) {
        lane += 1;
        bounds = rect(draft.titleLeft, metrics.safeTopPx + lane * metrics.laneStepPx, draft.titleWidth, metrics.titleHeightPx);
      }
      placed.push({ ...draft, lane, titleBounds: bounds, titleVisible: !conflicts() });
    });
    return placed;
  }

  function assignEventTracks(items, options = {}) {
    const metrics = { ...DEFAULT_METRICS, ...options };
    return placeTaskTitles(items.slice(), finite(options.heightPx, 315), metrics);
  }

  function buildHandles(taskKey, titleBounds, metrics, instant) {
    const start = rect(titleBounds.left - metrics.handleWidthPx, titleBounds.top, metrics.handleWidthPx, titleBounds.height);
    const end = rect(titleBounds.right, titleBounds.top, metrics.handleWidthPx, titleBounds.height);
    const move = rect(titleBounds.left, titleBounds.top, titleBounds.width, titleBounds.height);
    return {
      parentTaskKey: taskKey,
      instant,
      start: { role: instant ? "instant" : "start", bounds: start },
      move: { role: "move", bounds: move },
      end: { role: instant ? "instant" : "end", bounds: end }
    };
  }

  function buildTaskUnit(item, metrics) {
    const titleBounds = item.titleBounds;
    const centerY = titleBounds.top + titleBounds.height / 2;
    const pointLeft = titleBounds.left - metrics.markerGapPx - metrics.markerSizePx;
    const pointBounds = rect(pointLeft, centerY - metrics.markerSizePx / 2, metrics.markerSizePx, metrics.markerSizePx);
    const railLeft = item.isInstant ? item.anchorX : item.visibleStartX;
    const railWidth = item.isInstant ? 0 : Math.max(0, item.visibleEndX - item.visibleStartX);
    const railBounds = rect(railLeft, centerY - metrics.railHeightPx / 2, railWidth, metrics.railHeightPx);
    return {
      taskKey: item.taskKey,
      eventId: item.eventId,
      status: item.status,
      startMs: item.startMs,
      endMs: item.endMs,
      isInstant: item.isInstant,
      anchorX: item.anchorX,
      lane: item.lane,
      clippedStart: item.clippedStart,
      clippedEnd: item.clippedEnd,
      title: {
        role: item.isInstant ? "primary-title" : "primary-range-title",
        text: item.title,
        visible: item.titleVisible !== false,
        fontWeight: isDone({ status: item.status }) ? 400 : 600,
        bounds: titleBounds
      },
      point: {
        role: "point",
        visible: item.isInstant,
        bounds: pointBounds
      },
      rail: {
        role: item.isInstant ? "instant-anchor" : "duration-rail",
        visible: !item.isInstant,
        bounds: railBounds
      },
      handles: buildHandles(item.taskKey, titleBounds, metrics, item.isInstant)
    };
  }

  function buildRenderPlan(options = {}) {
    const widthPx = Math.max(0, finite(options.widthPx, options.viewport && options.viewport.widthPx || 0));
    const heightPx = Math.max(0, finite(options.heightPx, 315));
    const viewport = options.viewport;
    if (!viewport) throw new Error("Native task timeline layout requires viewport");
    const metrics = resolveMetrics(widthPx, options.metrics);
    const index = options.eventIndex && Array.isArray(options.eventIndex.events)
      ? options.eventIndex
      : eventIndexApi.createEventIndex(Array.isArray(options.events) ? options.events : []);
    const groups = groupTaskEvents(index.events);
    const drafts = groups
      .map((group) => visibleDraft(group, viewport, widthPx, heightPx, options.measureText, metrics))
      .filter(Boolean);
    const placed = placeTaskTitles(drafts, heightPx, metrics);
    const taskUnits = placed.map((item) => buildTaskUnit(item, metrics));
    return {
      widthPx,
      heightPx,
      visibleRange: viewportApi.visibleRange(viewport),
      metrics,
      taskUnits
    };
  }

  function findLayoutCollisions(plan) {
    const units = plan && Array.isArray(plan.taskUnits)
      ? plan.taskUnits.filter((unit) => unit.title?.visible !== false)
      : [];
    const collisions = [];
    for (let i = 0; i < units.length; i += 1) {
      for (let j = i + 1; j < units.length; j += 1) {
        if (collides(units[i].title.bounds, units[j].title.bounds, 0, 0)) {
          collisions.push({ firstTaskKey: units[i].taskKey, secondTaskKey: units[j].taskKey });
        }
      }
    }
    return collisions;
  }

  root.nativeLayout = {
    buildRenderPlan,
    assignEventTracks,
    placeTaskTitles,
    buildTaskUnit,
    findLayoutCollisions
  };

  if (globalThis.__NORIA_TASK_TIMELINE_TEST__) {
    globalThis.__noriaTaskTimelineLayoutTestHooks = root.nativeLayout;
  }
})();
