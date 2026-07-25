(function () {
  const root = globalThis.noriaTaskTimeline || (globalThis.noriaTaskTimeline = {});
  const overviewApi = root.nativeOverview;
  if (!overviewApi || typeof overviewApi.renderOverview !== "function") {
    throw new Error("Noria native overview must load before native renderer");
  }

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function finite(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function setAttribute(node, name, value) {
    if (!node || typeof node.setAttribute !== "function") return;
    if (value == null || value === "") node.removeAttribute?.(name);
    else node.setAttribute(name, String(value));
  }

  function setStyles(node, styles) {
    if (!node || !node.style) return;
    Object.entries(styles).forEach(([name, value]) => {
      node.style[name] = String(value);
    });
  }

  function applyBounds(node, bounds) {
    const rect = bounds || {};
    setStyles(node, {
      position: "absolute",
      left: `${finite(rect.left, 0)}px`,
      top: `${finite(rect.top, 0)}px`,
      width: `${Math.max(0, finite(rect.width, 0))}px`,
      height: `${Math.max(0, finite(rect.height, 0))}px`
    });
  }

  function createElement(documentRef, tagName, className, attributes = {}) {
    const node = documentRef.createElement(tagName || "div");
    node.className = className || "";
    Object.entries(attributes).forEach(([name, value]) => setAttribute(node, name, value));
    return node;
  }

  function createNativeTimelineHost(container, options = {}) {
    const documentRef = options.document || container?.ownerDocument || globalThis.document;
    if (!documentRef || typeof documentRef.createElement !== "function") {
      throw new Error("Native task timeline renderer requires a document");
    }
    const host = createElement(
      documentRef,
      "div",
      "timeline-default timeline-container timeline-horizontal noria-task-timeline-native-root",
      {
        "data-noria-task-timeline-source": "tasks",
        "data-noria-timeline-backend": "native",
        "data-noria-timeline-state": "idle"
      }
    );
    host.__noriaNativeTimelineState = null;
    container?.appendChild?.(host);
    return host;
  }

  function createMainBand(documentRef, plan) {
    const band = createElement(documentRef, "div", "timeline-band timeline-band-0 noria-task-timeline-native-main", {
      "data-noria-timeline-band": "main"
    });
    setStyles(band, {
      position: "relative",
      width: `${Math.max(0, finite(plan?.widthPx, 0))}px`,
      height: `${Math.max(0, finite(plan?.heightPx, 0))}px`,
      overflow: "hidden"
    });
    const background = createElement(documentRef, "div", "timeline-ether-bg noria-task-timeline-native-background");
    const grid = createElement(documentRef, "div", "timeline-band-layer noria-task-timeline-native-grid");
    const weekends = createElement(documentRef, "div", "timeline-band-layer noria-task-timeline-native-weekends");
    const markers = createElement(documentRef, "div", "timeline-band-layer noria-task-timeline-native-markers");
    const events = createElement(documentRef, "div", "timeline-band-layer timeline-band-events noria-task-timeline-native-events");
    const stateLayer = createElement(documentRef, "div", "timeline-band-layer noria-task-timeline-native-state-layer");
    [background, grid, weekends, markers, events, stateLayer].forEach((node) => band.appendChild(node));
    return { band, background, grid, weekends, markers, events, stateLayer };
  }

  function updateBandGeometry(state, mainPlan, overviewPlan) {
    const widthPx = Math.max(0, finite(mainPlan?.widthPx, overviewPlan?.widthPx || 0));
    const mainHeight = Math.max(0, finite(mainPlan?.heightPx, 0));
    const overviewHeight = Math.max(0, finite(overviewPlan?.heightPx, 0));
    setStyles(state.host, {
      position: "relative",
      width: `${widthPx}px`,
      height: `${mainHeight + overviewHeight}px`,
      overflow: "hidden"
    });
    setStyles(state.main.band, { width: `${widthPx}px`, height: `${mainHeight}px` });
    setStyles(state.overviewBand, { width: `${widthPx}px`, height: `${overviewHeight}px` });
  }

  function renderDateTicks(state, plan) {
    const fragment = state.document.createDocumentFragment();
    (Array.isArray(plan?.dateTicks) ? plan.dateTicks : []).forEach((tick) => {
      const node = createElement(state.document, "div", "timeline-date-label noria-task-timeline-native-date", {
        "data-noria-tick-date": tick.date
      });
      node.textContent = text(tick.label);
      setStyles(node, { position: "absolute", left: `${finite(tick.px, 0)}px`, bottom: "0" });
      fragment.appendChild(node);
    });
    state.main.grid.replaceChildren(fragment);
  }

  function renderWeekendWashes(state, plan) {
    const fragment = state.document.createDocumentFragment();
    (Array.isArray(plan?.weekendWashes) ? plan.weekendWashes : []).forEach((wash) => {
      const node = createElement(state.document, "div", "timeline-ether-weekends noria-task-timeline-native-weekend", {
        "data-noria-weekend-key": wash.key
      });
      applyBounds(node, wash.bounds);
      fragment.appendChild(node);
    });
    state.main.weekends.replaceChildren(fragment);
  }

  function renderMarkers(state, plan) {
    const fragment = state.document.createDocumentFragment();
    (Array.isArray(plan?.markers) ? plan.markers : []).forEach((marker) => {
      const className = marker.kind === "now"
        ? "timeline-highlight-point-decorator noria-task-timeline-now-cursor noria-task-timeline-native-marker"
        : "timeline-highlight-decorator noria-task-timeline-native-today noria-task-timeline-native-marker";
      const node = createElement(state.document, "div", className, {
        "data-noria-timeline-marker": marker.kind,
        "aria-hidden": "true"
      });
      node.textContent = text(marker.text);
      applyBounds(node, marker.bounds);
      fragment.appendChild(node);
    });
    state.main.markers.replaceChildren(fragment);
  }

  function createTaskNode(state, unit) {
    const wrapper = createElement(state.document, "div", "noria-task-timeline-native-task-unit", {
      "data-noria-task-group-key": unit.taskKey
    });
    setStyles(wrapper, { position: "absolute", inset: "0", pointerEvents: "none" });
    const title = createElement(state.document, "div", "timeline-event-label noria-task-timeline-editable noria-task-timeline-native-title");
    wrapper.appendChild(title);
    const refs = { wrapper, title, point: null, rail: null, handleZone: null, handles: [] };
    wrapper.__noriaTaskRefs = refs;
    state.main.events.appendChild(wrapper);
    return refs;
  }

  function reconcilePointAndRail(state, refs, unit) {
    if (unit.point?.visible) {
      if (!refs.point) {
        refs.point = createElement(state.document, "div", "timeline-event-icon noria-task-timeline-native-point", { "aria-hidden": "true" });
        refs.wrapper.appendChild(refs.point);
      }
      setAttribute(refs.point, "data-noria-task-unit-key", unit.taskKey);
      setAttribute(refs.point, "data-noria-task-visual-role", unit.point.role || "point");
      const pointOwnsSourceAction = unit.isInstant && unit.title?.visible === false;
      setAttribute(refs.point, "aria-hidden", pointOwnsSourceAction ? "false" : "true");
      setAttribute(refs.point, "role", pointOwnsSourceAction ? "button" : "");
      setAttribute(refs.point, "tabindex", pointOwnsSourceAction ? "0" : "");
      setAttribute(refs.point, "aria-label", pointOwnsSourceAction ? (unit.title?.text || unit.taskKey) : "");
      applyBounds(refs.point, unit.point.bounds);
    } else if (refs.point) {
      refs.point.remove?.();
      refs.point = null;
    }

    if (unit.rail?.visible) {
      if (!refs.rail) {
        refs.rail = createElement(state.document, "div", "timeline-event-tape noria-task-timeline-native-rail");
        refs.wrapper.appendChild(refs.rail);
      }
      setAttribute(refs.rail, "data-noria-task-unit-key", unit.taskKey);
      setAttribute(refs.rail, "data-noria-task-visual-role", unit.rail.role || "duration-rail");
      setAttribute(refs.rail, "data-noria-source-action", "");
      setAttribute(refs.rail, "role", "button");
      setAttribute(refs.rail, "tabindex", "0");
      setAttribute(refs.rail, "aria-label", unit.title?.text || unit.taskKey);
      applyBounds(refs.rail, unit.rail.bounds);
    } else if (refs.rail) {
      refs.rail.remove?.();
      refs.rail = null;
    }
  }

  function reconcileHandleZone(state, refs, unit) {
    if (unit.isInstant || unit.title?.visible === false) {
      refs.handleZone?.remove?.();
      refs.handleZone = null;
      return;
    }
    if (!refs.handleZone) {
      refs.handleZone = createElement(
        state.document,
        "div",
        "noria-task-timeline-native-handle-zone",
        { "data-noria-task-handle-zone": "local-title", "aria-hidden": "true" }
      );
      refs.wrapper.appendChild(refs.handleZone);
    }
    setAttribute(refs.handleZone, "data-noria-task-unit-key", unit.taskKey);
    applyBounds(refs.handleZone, unit.title?.bounds);
  }

  function renderHandles(state, refs, unit) {
    refs.handles.forEach((node) => node.remove?.());
    refs.handles = [];
    if (unit.title?.visible === false) return;
    const definitions = unit.isInstant
      ? [["move", unit.handles?.move?.bounds]]
      : [
          ["start", unit.handles?.start?.bounds],
          ["move", unit.handles?.move?.bounds],
          ["end", unit.handles?.end?.bounds]
        ];
    definitions.forEach(([role, handleBounds]) => {
      const node = createElement(
        state.document,
        "div",
        `noria-task-timeline-native-handle noria-task-timeline-native-handle--${role}`,
        {
          "data-noria-task-unit-key": unit.taskKey,
          "data-noria-task-visual-role": `handle-${role}`,
          "data-noria-task-handle-role": role,
          "aria-hidden": "true"
        }
      );
      applyBounds(node, handleBounds);
      refs.wrapper.appendChild(node);
      refs.handles.push(node);
    });
  }

  function updateTaskNode(state, refs, unit) {
    const titleVisible = unit.title?.visible !== false;
    setAttribute(refs.wrapper, "data-noria-task-group-key", unit.taskKey);
    setAttribute(refs.wrapper, "data-noria-task-title-visible", titleVisible ? "true" : "false");
    refs.wrapper.className = `noria-task-timeline-native-task-unit ${unit.status === "done" ? "is-done" : "is-open"}`;
    setAttribute(refs.title, "data-noria-task-unit-key", unit.taskKey);
    setAttribute(refs.title, "data-noria-task-visual-role", unit.title?.role || "primary-title");
    setAttribute(refs.title, "data-noria-source-action", "");
    setAttribute(refs.title, "role", titleVisible && unit.isInstant ? "button" : "");
    setAttribute(refs.title, "tabindex", titleVisible && unit.isInstant ? "0" : "");
    setAttribute(refs.title, "aria-label", titleVisible && unit.isInstant ? (unit.title?.text || unit.taskKey) : "");
    setAttribute(refs.title, "aria-hidden", titleVisible && unit.isInstant ? "" : "true");
    refs.title.hidden = !titleVisible;
    refs.title.textContent = text(unit.title?.text);
    applyBounds(refs.title, unit.title?.bounds);
    refs.title.style.fontWeight = "";
    reconcilePointAndRail(state, refs, unit);
    reconcileHandleZone(state, refs, unit);
    renderHandles(state, refs, unit);
  }

  function reconcileTaskNodes(state, plan) {
    state.mainPlan = plan || {};
    const incoming = new Set();
    (Array.isArray(plan?.taskUnits) ? plan.taskUnits : []).forEach((unit) => {
      const taskKey = text(unit?.taskKey);
      if (!taskKey) return;
      incoming.add(taskKey);
      let refs = state.taskNodes.get(taskKey);
      if (!refs) {
        refs = createTaskNode(state, unit);
        state.taskNodes.set(taskKey, refs);
      }
      updateTaskNode(state, refs, unit);
    });
    Array.from(state.taskNodes.entries()).forEach(([taskKey, refs]) => {
      if (incoming.has(taskKey)) return;
      refs.wrapper.remove?.();
      state.taskNodes.delete(taskKey);
    });
  }

  function renderState(state, model) {
    const mode = text(model?.state || "ready") || "ready";
    setAttribute(state.host, "data-noria-timeline-state", mode);
    state.main.stateLayer.replaceChildren();
    if (mode === "ready" || model?.showStateMessage === false) return;
    const node = createElement(
      state.document,
      "div",
      `noria-task-timeline-diagnostic-pill noria-task-timeline-native-state noria-task-timeline-native-state--${mode}`,
      { "data-noria-timeline-state": mode, role: mode === "error" ? "alert" : "status" }
    );
    node.textContent = text(model?.message || mode);
    state.main.stateLayer.appendChild(node);
  }

  function updateSurface(state, model) {
    const mainPlan = model?.mainPlan || {};
    const overviewPlan = model?.overviewPlan || {};
    const densityWidthPx = finite(mainPlan?.densityWidthPx, mainPlan?.widthPx || 0);
    const density = densityWidthPx > 560 ? "wide" : (densityWidthPx > 320 ? "normal" : "compact");
    setAttribute(state.host, "data-noria-timeline-density", density);
    updateBandGeometry(state, mainPlan, overviewPlan);
    renderDateTicks(state, mainPlan);
    renderWeekendWashes(state, mainPlan);
    renderMarkers(state, mainPlan);
    reconcileTaskNodes(state, mainPlan);
    overviewApi.renderOverview(state.overviewBand, overviewPlan);
    renderState(state, model);
    state.model = model;
    return state.host;
  }

  function renderNativeTimeline(host, model = {}) {
    if (!host) return null;
    if (host.__noriaNativeTimelineState) return updateNativeTimeline(host, model);
    const documentRef = host.ownerDocument || globalThis.document;
    const main = createMainBand(documentRef, model.mainPlan || {});
    const overviewBand = createElement(documentRef, "div", "timeline-band timeline-band-1 noria-task-timeline-native-overview-band", {
      "data-noria-timeline-band": "overview"
    });
    const fragment = documentRef.createDocumentFragment();
    fragment.appendChild(main.band);
    fragment.appendChild(overviewBand);
    host.replaceChildren(fragment);
    const state = {
      host,
      document: documentRef,
      main,
      overviewBand,
      taskNodes: new Map(),
      model: null,
      disposed: false
    };
    host.__noriaNativeTimelineState = state;
    host.removeAttribute?.("data-noria-timeline-disposed");
    return updateSurface(state, model);
  }

  function updateNativeTimeline(host, model = {}) {
    const state = host && host.__noriaNativeTimelineState;
    if (!state || state.disposed) return renderNativeTimeline(host, model);
    return updateSurface(state, model);
  }

  function disposeNativeTimeline(host) {
    if (!host) return;
    const state = host.__noriaNativeTimelineState;
    if (state && !state.disposed) {
      state.disposed = true;
      state.taskNodes.clear();
    }
    host.replaceChildren?.();
    host.__noriaNativeTimelineState = null;
    host.setAttribute?.("data-noria-timeline-disposed", "true");
  }

  root.nativeRenderer = {
    createNativeTimelineHost,
    renderNativeTimeline,
    updateNativeTimeline,
    disposeNativeTimeline
  };

  if (globalThis.__NORIA_TASK_TIMELINE_TEST__) {
    globalThis.__noriaTaskTimelineRendererTestHooks = root.nativeRenderer;
  }
})();
