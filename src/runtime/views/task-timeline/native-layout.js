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
    safeTopPx: 12,
    safeBottomPx: 24,
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
        fontWeight: 600
      }), 0);
    } catch (_) {}
    if (!(measured > 0)) measured = Math.max(1, text(title).length) * 7;
    return clamp(Math.ceil(measured) + 2, metrics.minTitleWidthPx, metrics.maxTitleWidthPx);
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
    const anchorX = clamp(rawStartX, metrics.horizontalPaddingPx + metrics.markerSizePx / 2,
      Math.max(metrics.horizontalPaddingPx + metrics.markerSizePx / 2, widthPx - metrics.markerSizePx / 2));
    const title = text(event.title || event.text || group.taskKey);
    const titleLeft = anchorX + metrics.markerSizePx / 2 + metrics.markerGapPx;
    const titleWidth = Math.min(measureTitleWidth(title, measureText, metrics, widthPx),
      Math.max(0, widthPx - metrics.horizontalPaddingPx - titleLeft));

    return {
      taskKey: group.taskKey,
      eventId: text(event.id),
      sourcePath: text(event.source?.path),
      title,
      status: isDone(event) ? "done" : normalizedStatus(event),
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
      const occupiedBounds = () => {
        const left = Math.min(bounds.left - metrics.markerGapPx - metrics.markerSizePx, draft.visibleStartX);
        const right = Math.max(bounds.right, draft.visibleEndX);
        return rect(left, bounds.top, right - left, bounds.height);
      };
      const conflicts = () => placed.some((item) => item.titleVisible !== false && collides(item.occupiedBounds, occupiedBounds(), metrics.laneGapPx, 1));
      while (lane < maxLane && conflicts()) {
        lane += 1;
        bounds = rect(draft.titleLeft, metrics.safeTopPx + lane * metrics.laneStepPx, draft.titleWidth, metrics.titleHeightPx);
      }
      placed.push({ ...draft, lane, titleBounds: bounds, occupiedBounds: occupiedBounds(), titleVisible: !conflicts() });
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
    const railBounds = rect(railLeft, titleBounds.bottom + 2, railWidth, metrics.railHeightPx);
    return {
      taskKey: item.taskKey,
      eventId: item.eventId,
      sourcePath: item.sourcePath,
      status: item.status,
      startMs: item.startMs,
      endMs: item.endMs,
      isInstant: item.isInstant,
      anchorX: item.anchorX,
      lane: item.lane,
      clippedStart: item.clippedStart,
      clippedEnd: item.clippedEnd,
      title: {
        role: "primary-title",
        text: item.title,
        visible: item.titleVisible !== false,
        fontWeight: 600,
        bounds: titleBounds
      },
      point: {
        role: "point",
        visible: item.titleVisible !== false,
        bounds: pointBounds
      },
      rail: {
        role: item.isInstant ? "instant-anchor" : "duration-rail",
        visible: !item.isInstant && item.titleVisible !== false,
        bounds: railBounds
      },
      handles: buildHandles(item.taskKey, titleBounds, metrics, item.isInstant)
    };
  }

  function layoutAnnotations(events, viewport, widthPx, heightPx, selectedId) {
    const range = viewportApi.visibleRange(viewport);
    const laneCount = heightPx < 190 ? 1 : 2;
    const units = [];
    const hidden = [];
    const candidates = events.filter(event => text(event.layer) === "annotation" &&
      event.startMs <= range.endMs && event.endMs >= range.startMs)
      .sort((a, b) => Number(b.id === selectedId) - Number(a.id === selectedId) ||
        a.startMs - b.startMs || text(a.id).localeCompare(text(b.id)));
    candidates.forEach(event => {
      const annotation = event.payload?.annotation || event;
      const projectPath = text(annotation.projectPath);
      const projectName = text(annotation.projectName) || projectPath.split("/").pop()?.replace(/\.md$/i, "");
      const label = projectPath ? `${projectName} · ${text(event.title)}` : text(event.title);
      const left = clamp(viewportApi.dateMsToPx(viewport, event.startMs), 8, Math.max(8, widthPx - 10));
      const right = clamp(viewportApi.dateMsToPx(viewport, event.endMs), left + 2, Math.max(left + 2, widthPx - 8));
      let lane = 0;
      while (lane < laneCount && units.some(unit => unit.lane === lane && left < unit.bounds.right + 6 && right + 6 > unit.bounds.left)) lane += 1;
      const unit = {
        id: event.id, label, annotation, lane, selected: event.id === selectedId,
        startMs: event.startMs, endMs: event.endMs, isInstant: event.isInstant,
        color: /^#[\da-f]{6}$/i.test(event.color) ? event.color : "#8ab4f8",
        clippedStart: event.startMs < range.startMs, clippedEnd: event.endMs > range.endMs,
        bounds: rect(left, 8 + lane * 25, right - left, 21)
      };
      if (lane < laneCount) units.push(unit);
      else hidden.push(unit);
    });
    const usedLanes = units.length ? Math.max(...units.map(unit => unit.lane)) + 1 : 0;
    const height = usedLanes ? 8 + usedLanes * 25 + (hidden.length ? 20 : 0) : 0;
    return {
      annotationUnits: units,
      hiddenAnnotations: hidden,
      annotationHeightPx: height,
      annotationOverflowBounds: hidden.length ? rect(8, 8 + usedLanes * 25, Math.max(0, widthPx - 16), 20) : null
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
    const annotations = layoutAnnotations(index.events, viewport, widthPx, heightPx, options.selectedAnnotationId);
    metrics.safeTopPx += annotations.annotationHeightPx;
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
      ...annotations,
      taskUnits,
      hiddenTaskCount: taskUnits.filter((unit) => !unit.title.visible).length
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
