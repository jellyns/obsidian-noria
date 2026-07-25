(function () {
  const root = globalThis.noriaTaskTimeline || (globalThis.noriaTaskTimeline = {});
  const viewportApi = root.nativeViewport;
  const eventIndexApi = root.nativeEventIndex;
  if (!viewportApi || typeof viewportApi.syncOverviewWindow !== "function") {
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
  const LAYER_Z = Object.freeze({ grid: 10, events: 100, window: 112, info: 118 });
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

  function formatDateTick(timeMs, locale) {
    const date = new Date(timeMs);
    if (normalizeLocale(locale) === "zh-CN") return `${date.getMonth() + 1}月${date.getDate()}日`;
    return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
  }

  function formatMonthLabel(timeMs, locale) {
    const date = new Date(timeMs);
    return normalizeLocale(locale) === "zh-CN"
      ? `${date.getMonth() + 1}月`
      : MONTHS[date.getMonth()];
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

  function clippedWindow(mainViewport, overviewViewport, widthPx, heightPx) {
    const raw = viewportApi.syncOverviewWindow(mainViewport, overviewViewport);
    const leftPx = clamp(Math.min(raw.leftPx, raw.rightPx), 0, widthPx);
    const rightPx = clamp(Math.max(raw.leftPx, raw.rightPx), 0, widthPx);
    return {
      ...raw,
      rawLeftPx: raw.leftPx,
      rawRightPx: raw.rightPx,
      leftPx,
      rightPx,
      widthPx: Math.max(0, rightPx - leftPx),
      topPx: 0,
      heightPx: Math.max(0, finite(heightPx, 0) - 4)
    };
  }

  function buildDateTicks(overviewViewport, locale) {
    return viewportApi.buildTimeTicks(overviewViewport, { minSpacingPx: 72 }).map((tick) => ({
      ...tick,
      date: isoLocal(tick.timeMs),
      label: formatDateTick(tick.timeMs, locale)
    }));
  }

  function resolveVisibleRange(overviewViewport, input) {
    const fallback = viewportApi.visibleRange(overviewViewport);
    const startMs = finite(input && input.startMs, fallback.startMs);
    const endMs = finite(input && input.endMs, fallback.endMs);
    return endMs > startMs ? { startMs, endMs } : fallback;
  }

  function addContextLabel(labels, keys, overviewViewport, range, role, timeMs, label) {
    if (!Number.isFinite(timeMs) || timeMs < range.startMs || timeMs > range.endMs || !text(label)) return;
    const key = `${role}:${label}:${timeMs}`;
    if (keys.has(key)) return;
    keys.add(key);
    labels.push({ role, timeMs, label, x: viewportApi.dateMsToPx(overviewViewport, timeMs) });
  }

  function buildContextLabels(overviewViewport, visibleRange, locale) {
    const range = resolveVisibleRange(overviewViewport, visibleRange);
    const labels = [];
    const keys = new Set();
    const start = new Date(range.startMs);
    addContextLabel(labels, keys, overviewViewport, range, "month", range.startMs, formatMonthLabel(range.startMs, locale));

    const month = new Date(start.getFullYear(), start.getMonth() + 1, 1, 0, 0, 0, 0);
    while (month.getTime() <= range.endMs) {
      addContextLabel(labels, keys, overviewViewport, range, "month", month.getTime(), formatMonthLabel(month.getTime(), locale));
      month.setMonth(month.getMonth() + 1);
    }

    const spanDays = Math.max(0, (range.endMs - range.startMs) / DAY);
    if (spanDays >= 180 || start.getFullYear() !== new Date(range.endMs).getFullYear()) {
      addContextLabel(labels, keys, overviewViewport, range, "year", range.startMs, String(start.getFullYear()));
      const year = new Date(start.getFullYear() + 1, 0, 1, 0, 0, 0, 0);
      while (year.getTime() <= range.endMs) {
        addContextLabel(labels, keys, overviewViewport, range, "year", year.getTime(), String(year.getFullYear()));
        year.setFullYear(year.getFullYear() + 1);
      }
    }

    if (spanDays <= 2) {
      const stepHours = spanDays <= 0.75 ? 3 : 6;
      const cursor = new Date(range.startMs);
      cursor.setMinutes(0, 0, 0);
      if (cursor.getTime() < range.startMs) cursor.setHours(cursor.getHours() + 1);
      while (cursor.getTime() <= range.endMs) {
        if (cursor.getHours() % stepHours === 0) {
          addContextLabel(labels, keys, overviewViewport, range, "time", cursor.getTime(), formatTimeLabel(cursor.getTime()));
        }
        cursor.setHours(cursor.getHours() + 1);
      }
    }

    return labels.sort((a, b) => a.timeMs - b.timeMs || a.role.localeCompare(b.role));
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

  function buildEventItems(events, overviewViewport, heightPx, maxEvents, visibleRange) {
    const range = resolveVisibleRange(overviewViewport, visibleRange);
    const index = eventIndexApi.createEventIndex(Array.isArray(events) ? events : [], { dateOnlyMode: "utc" });
    const visible = eventIndexApi.queryEventRange(index, range.startMs, range.endMs);
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
        return {
          ...base,
          type: "segment",
          bounds: {
            left: Math.min(startX, endX),
            top: 20,
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
          top: role === "fallback" ? 7 : 6,
          width: 1,
          height: role === "fallback" ? 5 : 8
        }
      };
    }).sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));

    const limit = Math.max(24, Math.min(240, finite(maxEvents, 160)));
    const stride = Math.max(1, Math.ceil(items.length / limit));
    return items.filter((item, index) => index % stride === 0 || index === items.length - 1);
  }

  function buildOverviewPlan(options = {}) {
    if (!options.mainViewport || !options.overviewViewport) {
      throw new Error("Native overview requires mainViewport and overviewViewport");
    }
    const widthPx = Math.max(0, finite(options.widthPx, options.overviewViewport.widthPx || 0));
    const heightPx = resolveHeight(options);
    const visibleRange = resolveVisibleRange(options.overviewViewport, options.visibleRange);
    const locale = normalizeLocale(options.locale);
    return {
      widthPx,
      heightPx,
      locale,
      zIndex: { ...LAYER_Z },
      visibleRange,
      dateTicks: buildDateTicks(options.overviewViewport, locale),
      contextLabels: buildContextLabels(options.overviewViewport, visibleRange, locale),
      todayMarker: buildTodayMarker(options.overviewViewport, options.now, visibleRange),
      eventItems: buildEventItems(options.events, options.overviewViewport, heightPx, options.maxEvents, visibleRange),
      viewportWindow: clippedWindow(options.mainViewport, options.overviewViewport, widthPx, heightPx)
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

  function setWindowElement(windowNode, projected) {
    if (!windowNode || !projected) return;
    setStyles(windowNode, {
      left: `${projected.leftPx}px`,
      width: `${projected.widthPx}px`,
      top: `${finite(projected.topPx, 0)}px`,
      height: `${Math.max(0, finite(projected.heightPx, 0))}px`
    });
    windowNode.setAttribute("data-noria-overview-range-start", String(projected.startMs));
    windowNode.setAttribute("data-noria-overview-range-end", String(projected.endMs));
  }

  function renderOverview(host, plan) {
    if (!host || !plan) return null;
    const documentRef = host.ownerDocument || globalThis.document;
    if (!documentRef || typeof documentRef.createElement !== "function") return null;
    if (typeof host.replaceChildren === "function") host.replaceChildren();
    else while (host.firstChild) host.removeChild(host.firstChild);
    host.setAttribute("data-noria-timeline-band", "overview");
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
      setStyles(node, { position: "absolute", left: `${tick.px}px`, bottom: "4px" });
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
    });

    const windowNode = createElement(documentRef, host, "timeline-highlight-decorator noria-task-timeline-native-overview-window", {
      "data-noria-overview-window": "main-viewport"
    });
    setStyles(windowNode, { position: "absolute", zIndex: plan.zIndex.window, pointerEvents: "none" });
    setWindowElement(windowNode, plan.viewportWindow);
    host.__noriaOverviewWindowEl = windowNode;

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
        top: "0",
        width: "1px",
        height: `${Math.max(0, finite(plan.heightPx, 0))}px`
      });
    }
    plan.contextLabels.forEach((item) => {
      const attributes = {
        "data-noria-overview-label-role": item.role,
        "data-noria-overview-label-date": isoLocal(item.timeMs)
      };
      const node = createElement(
        documentRef,
        info,
        `noria-task-timeline-overview-info-label noria-task-timeline-overview-info-label--${item.role}`,
        attributes
      );
      node.textContent = item.label;
      setStyles(node, { position: "absolute", left: `${item.x}px` });
    });
    return host;
  }

  function updateOverviewWindow(host, mainViewport, overviewViewport) {
    if (!host || !mainViewport || !overviewViewport) return null;
    const bounds = typeof host.getBoundingClientRect === "function" ? host.getBoundingClientRect() : {};
    const hostHeight = finite(bounds.height, parseFloat(host.style && host.style.height) || 0);
    const projected = clippedWindow(mainViewport, overviewViewport, overviewViewport.widthPx, hostHeight);
    const windowNode = host.__noriaOverviewWindowEl || (typeof host.querySelector === "function"
      ? host.querySelector("[data-noria-overview-window]")
      : null);
    setWindowElement(windowNode, projected);
    return projected;
  }

  function readOverviewNavigationIntent(event, host, overviewViewport) {
    if (!host || !overviewViewport || !event) return null;
    const bounds = typeof host.getBoundingClientRect === "function" ? host.getBoundingClientRect() : {};
    const renderedWidth = Math.max(1, finite(bounds.width, overviewViewport.widthPx || 1));
    const localX = clamp(finite(event.clientX, finite(bounds.left, 0)) - finite(bounds.left, 0), 0, renderedWidth);
    const viewportX = localX * overviewViewport.widthPx / renderedWidth;
    return {
      type: "center-main-viewport",
      dateMs: viewportApi.pxToDateMs(overviewViewport, viewportX),
      xPx: localX
    };
  }

  root.nativeOverview = {
    buildOverviewPlan,
    renderOverview,
    updateOverviewWindow,
    readOverviewNavigationIntent
  };

  if (globalThis.__NORIA_TASK_TIMELINE_TEST__) {
    globalThis.__noriaTaskTimelineOverviewTestHooks = root.nativeOverview;
  }
})();
