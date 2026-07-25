(function () {
  const root = globalThis.noriaTaskTimeline || (globalThis.noriaTaskTimeline = {});
  const engine = root.engine;
  if (!engine || typeof engine.registerTimelineBackend !== "function") {
    throw new Error("Noria task timeline engine contract must load before native backend");
  }

  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  const MAIN_HEIGHT_RATIO = 0.76;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeLocale(value) {
    return /^zh(?:-|$)/i.test(text(value)) ? "zh-CN" : "en";
  }

  function finite(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function dateMs(value) {
    if (value instanceof Date) return value.getTime();
    const number = Number(value);
    if (Number.isFinite(number)) return number;
    const parsed = Date.parse(String(value == null ? "" : value));
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function runtimeApis() {
    const apis = {
      viewport: root.nativeViewport,
      eventIndex: root.nativeEventIndex,
      layout: root.nativeLayout,
      overview: root.nativeOverview,
      renderer: root.nativeRenderer,
      interactions: root.nativeInteractions
    };
    const required = [
      [apis.viewport, "createViewport", "viewport"],
      [apis.eventIndex, "createEventIndex", "event index"],
      [apis.layout, "buildRenderPlan", "layout"],
      [apis.overview, "buildOverviewPlan", "overview"],
      [apis.renderer, "createNativeTimelineHost", "renderer"],
      [apis.interactions, "attachTimelineInteractions", "interactions"]
    ];
    required.forEach(([api, method, label]) => {
      if (!api || typeof api[method] !== "function") {
        throw new Error(`Noria native task timeline ${label} must load before native backend`);
      }
    });
    return apis;
  }

  function nowMs(context) {
    const value = typeof context.now === "function" ? context.now() : context.now;
    return finite(value, Date.now());
  }

  function eventRange(events) {
    let startMs = Infinity;
    let endMs = -Infinity;
    (Array.isArray(events) ? events : []).forEach((event) => {
      const start = finite(event?.startMs, dateMs(event?.start));
      const end = finite(event?.endMs, dateMs(event?.end));
      if (Number.isFinite(start)) startMs = Math.min(startMs, start);
      if (Number.isFinite(end)) endMs = Math.max(endMs, end);
      else if (Number.isFinite(start)) endMs = Math.max(endMs, start);
    });
    return Number.isFinite(startMs) && Number.isFinite(endMs)
      ? { startMs, endMs, spanMs: Math.max(0, endMs - startMs) }
      : null;
  }

  function chooseCenter(events, settings, currentMs) {
    const manual = dateMs(settings?.manualCenter);
    if (text(settings?.scaleMode).toLowerCase() === "manual" && Number.isFinite(manual)) return manual;
    if (text(settings?.scaleMode).toLowerCase() === "today") return currentMs;
    const starts = (Array.isArray(events) ? events : [])
      .map((event) => finite(dateMs(event?.start), event?.startMs))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    if (!starts.length) return currentMs;
    const near = starts
      .map((value) => ({ value, distance: Math.abs(value - currentMs) }))
      .filter((item) => item.distance <= 14 * DAY)
      .sort((a, b) => a.distance - b.distance)[0];
    if (near) return near.value;
    if (currentMs >= starts[0] && currentMs <= starts[starts.length - 1]) return currentMs;
    return starts[Math.floor(starts.length / 2)];
  }

  function zoomIndex(settings, key, steps) {
    const value = Number(settings?.[key]);
    return Number.isFinite(value) ? clamp(Math.round(value), 0, steps.length - 1) : null;
  }

  function nearestZoomIndex(value, steps) {
    const scale = finite(value, NaN);
    if (!(scale > 0) || !Array.isArray(steps) || !steps.length) return 0;
    let bestIndex = 0;
    let bestDistance = Infinity;
    steps.forEach((step, index) => {
      const candidate = finite(step, NaN);
      if (!(candidate > 0)) return;
      const distance = Math.abs(Math.log(scale / candidate));
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    return bestIndex;
  }

  function calendarIntervalMs(centerMs, unit) {
    const center = new Date(centerMs);
    const year = center.getFullYear();
    const month = center.getMonth();
    const start = unit === "year" ? new Date(year, 0, 1) : new Date(year, month, 1);
    const end = unit === "year" ? new Date(year + 1, 0, 1) : new Date(year, month + 1, 1);
    return Math.max(DAY, end.getTime() - start.getTime());
  }

  function zoomSteps(overview, centerMs) {
    const month = calendarIntervalMs(centerMs, "month");
    const year = calendarIntervalMs(centerMs, "year");
    return overview
      ? [MINUTE / 42, HOUR / 64, DAY / 58, 7 * DAY / 84, month / 102, year / 92]
      : [MINUTE / 48, HOUR / 72, DAY / 96, 7 * DAY / 150, month / 175, year / 135];
  }

  function scaleFor(events, settings, overview, centerMs) {
    const steps = zoomSteps(overview, centerMs);
    const mode = text(settings?.scaleMode || "auto").toLowerCase();
    const manualIndex = zoomIndex(settings, overview ? "manualOverviewZoomIndex" : "manualZoomIndex", steps);
    if (mode === "manual" && manualIndex != null) return steps[manualIndex];
    if (mode === "today") return steps[1];
    const days = Math.max(1, finite(eventRange(events)?.spanMs, 14 * DAY) / DAY);
    if (overview) {
      if (days <= 2) return steps[1];
      if (days <= 90) return steps[2];
      if (days <= 1095) return steps[4];
      return steps[5];
    }
    if (days <= 2) return steps[1];
    if (days <= 21) return steps[2];
    if (days <= 180) return steps[3];
    if (days <= 1095) return steps[4];
    return steps[5];
  }

  function readRect(context, target, explicitSize) {
    const supplied = typeof context.getRect === "function" ? context.getRect() : context.rect;
    const measured = supplied || target?.getBoundingClientRect?.() || {};
    return {
      left: finite(measured.left, 0),
      top: finite(measured.top, 0),
      width: Math.max(0, finite(explicitSize?.width, finite(measured.width, 0))),
      height: Math.max(0, finite(explicitSize?.height, finite(measured.height, 0)))
    };
  }

  function startOfLocalDay(value) {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }

  function buildFocusHotZones(centerMs) {
    const dayStart = startOfLocalDay(centerMs);
    return [{
      startMs: dayStart - DAY,
      endMs: dayStart + 2 * DAY,
      magnify: 2
    }];
  }

  function dateLabel(value, locale) {
    const date = new Date(value);
    if (normalizeLocale(locale) === "zh-CN") return `${date.getMonth() + 1}月${date.getDate()}日`;
    return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
  }

  function timeLabel(value) {
    const date = new Date(value);
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  function formatMainTickLabel(value, intervalMs, locale) {
    const date = new Date(value);
    const interval = finite(intervalMs, DAY);
    if (interval < DAY) {
      const time = timeLabel(value);
      return date.getHours() === 0 && date.getMinutes() === 0
        ? `${dateLabel(value, locale)} ${time}`
        : time;
    }
    if (interval >= 365 * DAY) return String(date.getFullYear());
    if (interval >= 30 * DAY) {
      return normalizeLocale(locale) === "zh-CN"
        ? `${date.getFullYear()}年${date.getMonth() + 1}月`
        : `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
    }
    return dateLabel(value, locale);
  }

  function decorateMainPlan(plan, viewport, viewportApi, currentMs, locale) {
    const widthPx = Math.max(0, finite(plan?.widthPx, viewport.widthPx));
    const heightPx = Math.max(0, finite(plan?.heightPx, 0));
    plan.densityWidthPx = widthPx;
    plan.dateTicks = viewportApi.buildTimeTicks(viewport, { minSpacingPx: 72 }).map((tick) => ({
      date: new Date(tick.timeMs).toISOString().slice(0, 10),
      label: formatMainTickLabel(tick.timeMs, tick.intervalMs, locale),
      px: tick.px
    }));
    const range = viewportApi.visibleRange(viewport);
    const weekendWashes = [];
    let cursor = startOfLocalDay(range.startMs) - DAY;
    for (let count = 0; cursor <= range.endMs + DAY && count < 500; count += 1, cursor += DAY) {
      const date = new Date(cursor);
      if (date.getDay() !== 0 && date.getDay() !== 6) continue;
      const left = viewportApi.dateMsToPx(viewport, cursor);
      const right = viewportApi.dateMsToPx(viewport, cursor + DAY);
      weekendWashes.push({
        key: new Date(cursor).toISOString().slice(0, 10),
        bounds: { left, top: 0, width: Math.max(0, right - left), height: heightPx }
      });
    }
    plan.weekendWashes = weekendWashes;
    const todayStart = startOfLocalDay(currentMs);
    const todayLeft = viewportApi.dateMsToPx(viewport, todayStart);
    const todayRight = viewportApi.dateMsToPx(viewport, todayStart + DAY);
    const nowLeft = viewportApi.dateMsToPx(viewport, currentMs);
    plan.markers = [
      {
        kind: "today",
        text: "",
        bounds: { left: todayLeft, top: 0, width: Math.max(0, todayRight - todayLeft), height: heightPx }
      },
      {
        kind: "now",
        text: "",
        bounds: { left: nowLeft - 0.5, top: 0, width: 1, height: heightPx }
      }
    ];
    return plan;
  }

  function createFrameScheduler(context, render) {
    const request = typeof context.requestFrame === "function"
      ? context.requestFrame
      : typeof globalThis.requestAnimationFrame === "function"
        ? globalThis.requestAnimationFrame.bind(globalThis)
        : (callback) => globalThis.setTimeout(callback, 16);
    const cancel = typeof context.cancelFrame === "function"
      ? context.cancelFrame
      : typeof globalThis.cancelAnimationFrame === "function"
        ? globalThis.cancelAnimationFrame.bind(globalThis)
        : (id) => globalThis.clearTimeout?.(id);
    const requestFallback = typeof context.setFrameFallback === "function"
      ? context.setFrameFallback
      : typeof globalThis.setTimeout === "function"
        ? globalThis.setTimeout.bind(globalThis)
        : null;
    const cancelFallback = typeof context.clearFrameFallback === "function"
      ? context.clearFrameFallback
      : typeof globalThis.clearTimeout === "function"
        ? globalThis.clearTimeout.bind(globalThis)
        : () => {};
    const fallbackMs = Math.max(16, finite(context.frameFallbackMs, 96));
    let frameId = null;
    let fallbackId = null;
    let scheduled = false;
    let disposed = false;
    const reasons = new Set();
    const flush = (source) => {
      if (disposed || !scheduled) return false;
      scheduled = false;
      if (source === "fallback" && frameId != null) {
        try { cancel(frameId); } catch (_) {}
      }
      if (source === "frame" && fallbackId != null) {
        try { cancelFallback(fallbackId); } catch (_) {}
      }
      frameId = null;
      fallbackId = null;
      const batch = Array.from(reasons);
      reasons.clear();
      render(batch);
      return true;
    };
    return {
      schedule(reason) {
        if (disposed) return false;
        reasons.add(text(reason) || "refresh");
        if (scheduled) return false;
        scheduled = true;
        frameId = request(() => flush("frame"));
        if (requestFallback) fallbackId = requestFallback(() => flush("fallback"), fallbackMs);
        return true;
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        scheduled = false;
        reasons.clear();
        if (frameId != null) {
          try { cancel(frameId); } catch (_) {}
          frameId = null;
        }
        if (fallbackId != null) {
          try { cancelFallback(fallbackId); } catch (_) {}
          fallbackId = null;
        }
      },
      pending() {
        return scheduled;
      }
    };
  }

  function installResizeObserver(context, target, callback) {
    if (typeof context.observeResize === "function") {
      const cleanup = context.observeResize(target, callback);
      return typeof cleanup === "function" ? cleanup : () => {};
    }
    if (typeof globalThis.ResizeObserver === "function") {
      const observer = new globalThis.ResizeObserver(callback);
      observer.observe(target);
      return () => observer.disconnect();
    }
    if (globalThis.window?.addEventListener) {
      globalThis.window.addEventListener("resize", callback);
      return () => globalThis.window.removeEventListener?.("resize", callback);
    }
    return () => {};
  }

  function buildTaskMap(index) {
    const map = new Map();
    (Array.isArray(index?.events) ? index.events : []).forEach((event) => {
      if (text(event?.layer) !== "task") return;
      const key = text(event.taskKey || event.id);
      if (key && !map.has(key)) map.set(key, event);
    });
    return map;
  }

  async function mountNativeBackend(context = {}) {
    const apis = runtimeApis();
    const timelineEl = context.timelineEl || context.container;
    const container = context.container || timelineEl;
    if (!container) throw new Error("Native timeline backend requires a container");
    const serviceTimelineEl = context.serviceTimelineEl || timelineEl || container;
    const settings = context.settings && typeof context.settings === "object" ? context.settings : {};
    const services = context.services && typeof context.services === "object" ? context.services : {};
    const locale = normalizeLocale(settings.locale || context.locale);
    const todayLabel = text(settings.todayLabel || context.todayLabel) || (locale === "zh-CN" ? "今日" : "Today");
    const documentRef = context.document || container.ownerDocument || globalThis.document;
    const host = apis.renderer.createNativeTimelineHost(container, { document: documentRef });
    timelineEl?.setAttribute?.("data-noria-timeline-backend", "native");
    let events = Array.isArray(context.events) ? context.events : [];
    let canonicalIndex = apis.eventIndex.createEventIndex(events);
    let taskMap = buildTaskMap(canonicalIndex);
    const previews = new Map();
    let mainViewport = null;
    let overviewViewport = null;
    let rendered = false;
    let disposed = false;
    let explicitSize = null;
    let renderCount = 0;
    let state = "scheduled";
    let lastReasons = [];
    let lastMeasuredWidth = NaN;
    let lastMeasuredHeight = NaN;
    let manualScaleTimer = null;

    const emitManualScaleState = () => {
      manualScaleTimer = null;
      if (!mainViewport || typeof context.onManualScaleState !== "function") return;
      const centerMs = finite(mainViewport.centerMs, nowMs(context));
      try {
        context.onManualScaleState({
          manualCenter: new Date(centerMs).toISOString(),
          manualZoomIndex: nearestZoomIndex(mainViewport.msPerPx, zoomSteps(false, centerMs)),
          manualOverviewZoomIndex: nearestZoomIndex(overviewViewport?.msPerPx, zoomSteps(true, centerMs))
        });
      } catch (_) {}
    };

    const scheduleManualScaleState = () => {
      if (typeof context.onManualScaleState !== "function") return;
      if (manualScaleTimer != null) {
        try { globalThis.clearTimeout?.(manualScaleTimer); } catch (_) {}
        manualScaleTimer = null;
      }
      const delay = Math.max(0, finite(context.manualScaleDebounceMs, 120));
      if (delay === 0 || typeof globalThis.setTimeout !== "function") {
        emitManualScaleState();
        return;
      }
      manualScaleTimer = globalThis.setTimeout(emitManualScaleState, delay);
    };

    const effectiveIndex = () => {
      if (!previews.size) return canonicalIndex;
      const next = canonicalIndex.events.map((event) => previews.get(text(event.taskKey || event.id)) || event);
      return apis.eventIndex.createEventIndex(next);
    };

    const initializeViewports = (widthPx) => {
      if (mainViewport && overviewViewport) {
        mainViewport = apis.viewport.resizeViewport(mainViewport, widthPx);
        overviewViewport = apis.viewport.resizeViewport(overviewViewport, widthPx);
        return;
      }
      const currentMs = nowMs(context);
      const centerMs = chooseCenter(canonicalIndex.events, settings, currentMs);
      const zones = buildFocusHotZones(centerMs);
      mainViewport = apis.viewport.createViewport({
        centerMs,
        msPerPx: scaleFor(canonicalIndex.events, settings, false, centerMs),
        widthPx,
        zones
      });
      overviewViewport = apis.viewport.createViewport({
        centerMs,
        msPerPx: scaleFor(canonicalIndex.events, settings, true, centerMs),
        widthPx,
        zones
      });
    };

    const render = (reasons) => {
      if (disposed) return false;
      lastReasons = reasons;
      const rect = readRect(context, timelineEl || container, explicitSize);
      lastMeasuredWidth = rect.width;
      lastMeasuredHeight = rect.height;
      if (!(rect.width > 0) || !(rect.height > 0)) {
        state = "waiting-size";
        host.setAttribute?.("data-noria-timeline-state", state);
        return false;
      }
      initializeViewports(rect.width);
      const index = effectiveIndex();
      const mainHeight = Math.max(1, rect.height * MAIN_HEIGHT_RATIO);
      const overviewHeight = Math.max(1, rect.height - mainHeight);
      const mainPlan = decorateMainPlan(
        apis.layout.buildRenderPlan({
          eventIndex: index,
          events: index.events,
          viewport: mainViewport,
          widthPx: rect.width,
          heightPx: mainHeight,
          measureText: context.measureText
        }),
        mainViewport,
        apis.viewport,
        nowMs(context),
        locale
      );
      const overviewPlan = apis.overview.buildOverviewPlan({
        events: index.events,
        mainViewport,
        overviewViewport,
        widthPx: rect.width,
        heightPx: overviewHeight,
        totalHeightPx: rect.height,
        now: new Date(nowMs(context)).toISOString(),
        locale,
        todayLabel
      });
      const model = {
        mainPlan,
        overviewPlan,
        state: index.events.length ? "ready" : "empty",
        message: index.events.length ? "" : "No timeline events",
        showStateMessage: context.externalStateLayer !== true
      };
      if (rendered) apis.renderer.updateNativeTimeline(host, model);
      else {
        apis.renderer.renderNativeTimeline(host, model);
        rendered = true;
      }
      renderCount += 1;
      state = model.state;
      host.setAttribute?.("data-noria-native-render-count", String(renderCount));
      if (typeof context.onRender === "function") {
        try {
          context.onRender({ host, model, mainViewport, overviewViewport, reasons: lastReasons.slice() });
        } catch (_) {}
      }
      return true;
    };

    const scheduler = createFrameScheduler(context, render);
    const schedule = (reason) => scheduler.schedule(reason);
    const interactionOptions = {
      document: documentRef,
      getViewport: () => mainViewport,
      getOverviewViewport: () => overviewViewport,
      getTask: (taskKey) => taskMap.get(text(taskKey)) || null,
      updateViewport: (viewport) => {
        if (!viewport) return;
        mainViewport = viewport;
        schedule("viewport");
        scheduleManualScaleState();
      },
      centerOn: (centerMs) => {
        if (!mainViewport) initializeViewports(readRect(context, timelineEl || container, explicitSize).width);
        mainViewport = apis.viewport.createViewport({ ...mainViewport, centerMs: finite(centerMs, nowMs(context)) });
        schedule("center");
      },
      now: () => nowMs(context),
      markMode: settings.markMode === true,
      snapMinutes: finite(settings.snapMinutes, 5),
      minDurationMinutes: finite(settings.minDurationMinutes, 5),
      openSource: (intent) => {
        const event = taskMap.get(text(intent?.taskKey));
        return event && typeof services.openSource === "function" ? services.openSource(event) : false;
      },
      previewTaskTime: (intent) => {
        const key = text(intent?.taskKey);
        const event = taskMap.get(key);
        if (!event) return false;
        const endMs = intent.endMs == null ? null : finite(intent.endMs, event.endMs);
        previews.set(key, {
          ...event,
          start: new Date(finite(intent.startMs, event.startMs)).toISOString(),
          end: endMs == null ? null : new Date(endMs).toISOString(),
          startMs: finite(intent.startMs, event.startMs),
          endMs: endMs == null ? finite(intent.startMs, event.startMs) : endMs,
          isInstant: endMs == null
        });
        schedule("task-preview");
        return true;
      },
      cancelTaskPreview: (intent) => {
        const removed = previews.delete(text(intent?.taskKey));
        if (removed) schedule("task-preview-cancel");
        return removed;
      },
      commitTaskTime: async (intent, originalEvent) => {
        const key = text(intent?.taskKey);
        const event = taskMap.get(key);
        if (!event || typeof services.commitDrag !== "function") return false;
        const result = await services.commitDrag({
          event,
          role: text(intent.role) || "move",
          dates: {
            start: new Date(finite(intent.startMs, event.startMs)),
            end: intent.endMs == null ? null : new Date(finite(intent.endMs, event.endMs))
          },
          node: originalEvent?.target || null,
          timelineEl: serviceTimelineEl,
          pointerEvent: originalEvent || null
        });
        previews.delete(key);
        schedule(result === false ? "task-commit-failed" : "task-commit");
        return result;
      },
      previewRange: context.previewRange,
      cancelRangePreview: context.cancelRangePreview,
      selectRange: context.selectRange
    };
    const detachInteractions = context.interactive === false
      ? () => {}
      : apis.interactions.attachTimelineInteractions(host, interactionOptions);
    const resizeTarget = context.resizeTarget || timelineEl || container;
    const detachResize = installResizeObserver(context, resizeTarget, () => {
      const rect = readRect(context, timelineEl || container, explicitSize);
      if (rect.width === lastMeasuredWidth && rect.height === lastMeasuredHeight) return;
      schedule("resize-observer");
    });
    schedule("mount");

    const instance = {
      host,
      refresh(input) {
        if (input && typeof input === "object" && Array.isArray(input.events)) {
          events = input.events;
          canonicalIndex = apis.eventIndex.createEventIndex(events);
          taskMap = buildTaskMap(canonicalIndex);
          previews.clear();
        }
        schedule(typeof input === "string" ? input : input?.reason || "refresh");
      },
      centerOn(value) {
        interactionOptions.centerOn(dateMs(value));
      },
      resize(width, height) {
        explicitSize = {
          width: Math.max(0, finite(width?.width, width)),
          height: Math.max(0, finite(width?.height, height))
        };
        schedule("resize");
      },
      getDiagnostics() {
        return {
          backend: "native",
          state,
          eventCount: canonicalIndex.events.length,
          taskCount: taskMap.size,
          previewCount: previews.size,
          renderCount,
          framePending: scheduler.pending(),
          interactive: context.interactive !== false,
          mainCenterMs: mainViewport ? mainViewport.centerMs : null,
          mainMsPerPx: mainViewport ? mainViewport.msPerPx : null,
          overviewCenterMs: overviewViewport ? overviewViewport.centerMs : null,
          overviewMsPerPx: overviewViewport ? overviewViewport.msPerPx : null,
          lastReasons: lastReasons.slice()
        };
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        scheduler.dispose();
        try { detachResize(); } catch (_) {}
        try { detachInteractions(); } catch (_) {}
        try { apis.interactions.disposeTimelineInteractions?.(host); } catch (_) {}
        try { apis.renderer.disposeNativeTimeline(host); } catch (_) {}
        if (manualScaleTimer != null) {
          try { globalThis.clearTimeout?.(manualScaleTimer); } catch (_) {}
          manualScaleTimer = null;
        }
        previews.clear();
      }
    };
    return instance;
  }

  engine.registerTimelineBackend({ id: "native", mount: mountNativeBackend });
  root.nativeBackend = { mountNativeBackend, formatMainTickLabel };

  if (globalThis.__NORIA_TASK_TIMELINE_TEST__) {
    globalThis.__noriaTaskTimelineNativeBackendTestHooks = root.nativeBackend;
  }
})();
