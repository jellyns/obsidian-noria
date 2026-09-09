(function () {
  const root = globalThis.noriaTaskTimeline || (globalThis.noriaTaskTimeline = {});
  const viewportApi = root.nativeViewport;
  const eventIndexApi = root.nativeEventIndex;
  if (!viewportApi || typeof viewportApi.visibleRange !== "function") {
    throw new Error("Noria native viewport must load before native overview");
  }
  if (!eventIndexApi || typeof eventIndexApi.createEventIndex !== "function") {
    throw new Error("Noria native event index must load before native overview");
  }

  const DAY = 24 * 60 * 60 * 1000;
  const EVENT_COLORS = Object.freeze({
    task: "var(--noria-task-timeline-task-blue)",
    annotation: "var(--noria-task-timeline-mark-amber)",
    pomodoro: "var(--noria-task-timeline-pomo-red)",
    note: "var(--noria-task-timeline-note-cyan)",
    git: "var(--noria-task-timeline-git-violet)",
    noria: "var(--noria-task-timeline-noria-teal)"
  });
  const LAYER_Z = Object.freeze({ grid: 10, events: 100, info: 118 });
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

  function dateMs(value) {
    if (value instanceof Date) return value.getTime();
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const parsed = Date.parse(String(value == null ? "" : value));
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function isoLocal(timeMs) {
    const date = new Date(timeMs);
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function normalizeLocale(value) {
    return /^zh(?:-|$)/i.test(text(value)) ? "zh-CN" : "en";
  }

  function formatDateTick(timeMs, intervalMs, locale, showDate, showYear) {
    const date = new Date(timeMs);
    if (intervalMs >= 365 * DAY) return String(date.getFullYear());
    if (intervalMs >= 30 * DAY) {
      return normalizeLocale(locale) === "zh-CN"
        ? `${date.getFullYear()}年${date.getMonth() + 1}月`
        : `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
    }
    const dateText = normalizeLocale(locale) === "zh-CN"
      ? `${showYear ? `${date.getFullYear()}年` : ""}${date.getMonth() + 1}月${date.getDate()}日`
      : `${MONTHS[date.getMonth()]} ${date.getDate()}${showYear ? `, ${date.getFullYear()}` : ""}`;
    if (intervalMs < DAY) return `${showDate ? `${dateText} · ` : ""}${formatTimeLabel(timeMs)}`;
    return showDate ? dateText : String(date.getDate());
  }

  function formatTimeLabel(timeMs) {
    const date = new Date(timeMs);
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  }

  function normalizeLayer(event) {
    const source = event && typeof event.source === "object" ? event.source : {};
    const noria = event && typeof event === "object"
      ? ((event.payload && event.payload.noria) || event.noria || {})
      : {};
    const raw = text(event && (event.layer || event.type || event.kind) || "task").toLowerCase();
    const className = text(event && (event.classname || event.presentation && event.presentation.classname)).toLowerCase();
    if (raw.includes("annotation") || raw.includes("mark")) return "annotation";
    if (raw.includes("pomo")) return "pomodoro";
    if (
      raw.includes("noria") ||
      text(source.type).toLowerCase().includes("noria") ||
      text(noria.sourceType).toLowerCase().includes("noria") ||
      className.includes("noria-cache") ||
      className.includes("noria-task-timeline-noria")
    ) return "noria";
    if (raw.includes("note")) return "note";
    if (raw.includes("git") || raw.includes("commit")) return "git";
    return "task";
  }

  function eventRole(event) {
    const noria = event && ((event.payload && event.payload.noria) || event.noria) || {};
    const kind = text(event && (event.kind || noria.kind)).toLowerCase();
    const className = text(event && (event.classname || event.presentation && event.presentation.classname)).toLowerCase();
    return kind === "fallback" || noria.fallbackDateSource || className.includes("fallback-date") || className.includes("no-explicit-date")
      ? "fallback"
      : "";
  }

  function safeColor(value) {
    const color = text(value);
    if (!color || /[;{}]/.test(color)) return "";
    return /^(#[0-9a-f]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|var\(--[a-z0-9_-]+\))$/i.test(color)
      ? color
      : "";
  }

  function eventColor(event, layer) {
    return safeColor(event && (event.color || event.backgroundColor || event.borderColor)) || EVENT_COLORS[layer] || EVENT_COLORS.task;
  }

  function resolveHeight(options) {
    const explicit = finite(options.heightPx, NaN);
    if (Number.isFinite(explicit)) return Math.max(0, explicit);
    return Math.max(0, finite(options.totalHeightPx, 312.5) * 0.24);
  }

  function buildDateTicks(mainViewport, locale, measureText) {
    const range = viewportApi.visibleRange(mainViewport);
    const showYear = new Date(range.startMs).getFullYear() !== new Date(range.endMs).getFullYear();
    let previousDate = "";
    let previousMonth = "";
    const ticks = viewportApi.buildTimeTicks(mainViewport, { minSpacingPx: 56 }).map((tick, index) => {
      const date = isoLocal(tick.timeMs);
      const changed = tick.intervalMs < DAY ? date !== previousDate : date.slice(0, 7) !== previousMonth;
      const first = index === 0;
      previousDate = date;
      previousMonth = date.slice(0, 7);
      return { ...tick, date, priority: changed && !first ? 3 : first ? 2 : 0,
        label: formatDateTick(tick.timeMs, tick.intervalMs, locale, changed || first, showYear) };
    });
    return viewportApi.placeTickLabels(ticks, mainViewport.widthPx, measureText);
  }

  function resolveVisibleRange(overviewViewport, input) {
    const fallback = viewportApi.visibleRange(overviewViewport);
    const startMs = finite(input && input.startMs, fallback.startMs);
    const endMs = finite(input && input.endMs, fallback.endMs);
    return endMs > startMs ? { startMs, endMs } : fallback;
  }

  function buildTodayMarker(overviewViewport, nowInput, visibleRange) {
    const range = resolveVisibleRange(overviewViewport, visibleRange);
    const timeMs = dateMs(nowInput == null ? Date.now() : nowInput);
    if (!Number.isFinite(timeMs) || timeMs < range.startMs || timeMs > range.endMs) return null;
    return {
      timeMs,
      date: isoLocal(timeMs),
      x: viewportApi.dateMsToPx(overviewViewport, timeMs)
    };
  }

  function buildEventItems(events, overviewViewport, heightPx, maxEvents, visibleRange, mainRange, axisHeightPx) {
    const range = resolveVisibleRange(overviewViewport, visibleRange);
    const index = eventIndexApi.createEventIndex(Array.isArray(events) ? events : [], { dateOnlyMode: "utc" });
    const visible = eventIndexApi.queryEventRange(index, range.startMs, range.endMs);
    const laneEnds = [];
    const eventTop = axisHeightPx + 3;
    const laneCount = Math.max(1, Math.floor((heightPx - eventTop - 4) / 4));
    const items = visible.map((event) => {
      const layer = normalizeLayer(event);
      const role = eventRole(event);
      const startMs = clamp(event.startMs, range.startMs, range.endMs);
      const endMs = clamp(event.endMs, range.startMs, range.endMs);
      const startX = viewportApi.dateMsToPx(overviewViewport, startMs);
      const endX = viewportApi.dateMsToPx(overviewViewport, endMs);
      const duration = event.endMs - event.startMs;
      const base = {
        id: text(event.id),
        taskKey: text(event.taskKey),
        title: text(event.title || event.text),
        layer,
        role,
        color: eventColor(event, layer),
        startMs: event.startMs,
        endMs: event.endMs
      };
      if (duration >= 10 * 60 * 1000) {
        const left = Math.min(startX, endX);
        const right = Math.max(startX, endX);
        let lane = laneEnds.findIndex((end) => end + 3 < left);
        if (lane < 0) lane = laneEnds.length;
        laneEnds[lane] = right;
        return {
          ...base,
          type: "segment",
          bounds: {
            left,
            top: eventTop + (lane % laneCount) * 4,
            width: Math.max(3, Math.abs(endX - startX)),
            height: 2
          }
        };
      }
      return {
        ...base,
        type: "tick",
        bounds: {
          left: startX,
          top: eventTop,
          width: 1,
          height: role === "fallback" ? 5 : 8
        }
      };
    }).sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));

    const limit = Math.max(24, Math.min(240, finite(maxEvents, 160)));
    const stride = Math.max(1, Math.ceil(items.length / limit));
    return items.filter((item, index) => index % stride === 0 || index === items.length - 1).map((item) => {
      const from = Math.max(item.startMs, mainRange.startMs, range.startMs);
      const to = Math.min(item.endMs, mainRange.endMs, range.endMs);
      if (to < from) return item;
      const left = viewportApi.dateMsToPx(overviewViewport, from);
      const right = viewportApi.dateMsToPx(overviewViewport, to);
      return { ...item, activeBounds: { ...item.bounds, left, width: Math.max(1, right - left) } };
    });
  }

  function buildOverviewPlan(options = {}) {
    if (!options.mainViewport || !options.overviewViewport) {
      throw new Error("Native overview requires mainViewport and overviewViewport");
    }
    const widthPx = Math.max(0, finite(options.widthPx, options.overviewViewport.widthPx || 0));
    const heightPx = resolveHeight(options);
    const visibleRange = resolveVisibleRange(options.overviewViewport, options.visibleRange);
    const locale = normalizeLocale(options.locale);
    const axisHeightPx = Math.min(26, heightPx * 0.5);
    const mainRange = viewportApi.visibleRange(options.mainViewport);
    return {
      widthPx,
      heightPx,
      axisHeightPx,
      locale,
      zIndex: { ...LAYER_Z },
      visibleRange,
      dateTicks: buildDateTicks(options.mainViewport, locale, options.measureText),
      todayMarker: buildTodayMarker(options.overviewViewport, options.now, visibleRange),
      eventItems: buildEventItems(options.events, options.overviewViewport, heightPx, options.maxEvents, visibleRange, mainRange, axisHeightPx)
    };
  }

  function setStyles(node, styles) {
    if (!node || !node.style) return;
    Object.entries(styles).forEach(([name, value]) => {
      node.style[name] = String(value);
    });
  }

  function createElement(documentRef, parent, className, attributes = {}) {
    const node = documentRef.createElement("div");
    node.className = className;
    Object.entries(attributes).forEach(([name, value]) => {
      if (value != null && value !== "") node.setAttribute(name, value);
    });
    parent.appendChild(node);
    return node;
  }

  function renderOverview(host, plan) {
    if (!host || !plan) return null;
    const documentRef = host.ownerDocument || globalThis.document;
    if (!documentRef || typeof documentRef.createElement !== "function") return null;
    if (typeof host.replaceChildren === "function") host.replaceChildren();
    else while (host.firstChild) host.removeChild(host.firstChild);
    host.setAttribute("data-noria-timeline-band", "overview");
    host.setAttribute("tabindex", "0");
    host.setAttribute("role", "group");
    host.setAttribute("aria-label", plan.locale === "zh-CN"
      ? "时间导航：拖动或方向键平移，加减号缩放"
      : "Time navigation: drag or use arrow keys to pan, plus and minus to zoom");
    host.setAttribute("data-noria-overview-event-count", String(plan.eventItems.length));
    host.setAttribute("data-noria-overview-tick-count", String(plan.dateTicks.length));
    host.className = `${text(host.className)} noria-task-timeline-native-overview`.trim();
    setStyles(host, {
      position: "relative",
      width: `${plan.widthPx}px`,
      height: `${plan.heightPx}px`,
      overflow: "hidden"
    });

    const grid = createElement(documentRef, host, "noria-task-timeline-native-overview-grid", {
      "data-noria-overview-layer": "grid"
    });
    setStyles(grid, { position: "absolute", inset: "0", zIndex: plan.zIndex.grid });
    plan.dateTicks.forEach((tick) => {
      const node = createElement(documentRef, grid, "timeline-date-label noria-task-timeline-native-overview-date", {
        "data-noria-tick-date": tick.date
      });
      node.textContent = tick.label;
      setStyles(node, { position: "absolute", left: `${tick.labelLeftPx}px`, width: `${tick.labelWidthPx}px`,
        top: `${Math.max(1, (plan.axisHeightPx - 14) / 2)}px` });
    });

    const eventsLayer = createElement(documentRef, host, "noria-task-timeline-overview-info-layer noria-task-timeline-native-overview-events", {
      "data-noria-overview-layer": "events"
    });
    setStyles(eventsLayer, { position: "absolute", inset: "0", zIndex: plan.zIndex.events, pointerEvents: "none" });
    plan.eventItems.forEach((item) => {
      const node = createElement(
        documentRef,
        eventsLayer,
        [
          item.type === "segment" ? "noria-task-timeline-overview-info-segment" : "noria-task-timeline-overview-info-tick",
          `noria-task-timeline-overview-info--${item.layer}`,
          item.role ? `noria-task-timeline-overview-info--${item.role}` : ""
        ].filter(Boolean).join(" "),
        {
          "data-noria-overview-event-id": item.id,
          "data-noria-overview-layer": item.layer,
          "data-noria-overview-placement": item.role,
          "data-noria-task-key": item.taskKey,
          title: item.title
        }
      );
      setStyles(node, {
        position: "absolute",
        left: `${item.bounds.left}px`,
        top: `${item.bounds.top}px`,
        width: `${item.bounds.width}px`,
        height: `${item.bounds.height}px`,
        backgroundColor: item.color,
        borderColor: item.color
      });
      if (item.activeBounds) {
        const active = createElement(documentRef, eventsLayer,
          "noria-task-timeline-native-overview-active", { "aria-hidden": "true" });
        setStyles(active, { position: "absolute", left: `${item.activeBounds.left}px`, top: `${item.activeBounds.top}px`,
          width: `${item.activeBounds.width}px`, height: `${item.activeBounds.height}px`, backgroundColor: item.color });
      }
    });

    const info = createElement(documentRef, host, "noria-task-timeline-overview-info-layer noria-task-timeline-native-overview-info", {
      "data-noria-overview-layer": "info"
    });
    setStyles(info, { position: "absolute", inset: "0", zIndex: plan.zIndex.info, pointerEvents: "none" });
    if (plan.todayMarker) {
      const marker = createElement(
        documentRef,
        info,
        "noria-task-timeline-native-overview-today-marker",
        {
          "data-noria-timeline-marker": "today",
          "data-noria-overview-marker-date": plan.todayMarker.date,
          "aria-hidden": "true"
        }
      );
      setStyles(marker, {
        position: "absolute",
        left: `${plan.todayMarker.x}px`,
        top: `${plan.axisHeightPx}px`,
        width: "1px",
        height: `${Math.max(0, finite(plan.heightPx, 0) - plan.axisHeightPx)}px`
      });
    }
    return host;
  }

  root.nativeOverview = {
    buildOverviewPlan,
    renderOverview
  };

  if (globalThis.__NORIA_TASK_TIMELINE_TEST__) {
    globalThis.__noriaTaskTimelineOverviewTestHooks = root.nativeOverview;
  }
})();
