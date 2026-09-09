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
    const weekends = createElement(documentRef, "div", "timeline-band-layer noria-task-timeline-native-weekends");
    const markers = createElement(documentRef, "div", "timeline-band-layer noria-task-timeline-native-markers");
    const events = createElement(documentRef, "div", "timeline-band-layer timeline-band-events noria-task-timeline-native-events");
    const annotations = createElement(documentRef, "div", "timeline-band-layer noria-task-timeline-native-annotations");
    const rangePreview = createElement(documentRef, "div", "timeline-band-layer noria-task-timeline-native-range-preview");
    const stateLayer = createElement(documentRef, "div", "timeline-band-layer noria-task-timeline-native-state-layer");
    [background, weekends, markers, events, annotations, rangePreview, stateLayer].forEach((node) => band.appendChild(node));
    return { band, background, weekends, markers, events, annotations, rangePreview, stateLayer };
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

  function renderAnnotations(state, plan) {
    const fragment = state.document.createDocumentFragment();
    (plan.annotationUnits || []).forEach(unit => {
      const wrapper = createElement(state.document, "div", "noria-task-timeline-native-annotation", {
        "data-noria-annotation-id": unit.id, "data-noria-annotation-selected": unit.selected ? "true" : "false"
      });
      applyBounds(wrapper, unit.bounds);
      wrapper.style.setProperty?.("--noria-annotation-color", unit.color);
      const button = createElement(state.document, "button", "noria-task-timeline-native-annotation-label", {
        type: "button", "data-noria-annotation-id": unit.id, "aria-label": unit.label, title: unit.label
      });
      button.textContent = unit.label;
      wrapper.appendChild(button);
      if (unit.selected && !unit.isInstant) {
        ["start", "end"].forEach(role => {
          if ((role === "start" && unit.clippedStart) || (role === "end" && unit.clippedEnd)) return;
          const handle = createElement(state.document, "div", `noria-task-timeline-native-annotation-handle is-${role}`, {
            "data-noria-annotation-id": unit.id, "data-noria-annotation-handle": role, "aria-hidden": "true"
          });
          wrapper.appendChild(handle);
        });
      }
      fragment.appendChild(wrapper);
    });
    if (plan.hiddenAnnotations?.length) {
      const more = createElement(state.document, "button", "noria-task-timeline-native-annotation-more", {
        type: "button", "data-noria-timeline-action": "more-annotations"
      });
      more.textContent = plan.locale === "zh-CN" ? `另有 ${plan.hiddenAnnotations.length} 个阶段…` : `${plan.hiddenAnnotations.length} more phases…`;
      applyBounds(more, plan.annotationOverflowBounds);
      fragment.appendChild(more);
    }
    state.main.annotations.replaceChildren(fragment);
    state.main.rangePreview.replaceChildren();
    if (plan.rangePreview) {
      const preview = createElement(state.document, "div", "noria-task-timeline-native-selection", { "data-noria-range-preview": "active" });
      applyBounds(preview, plan.rangePreview.bounds);
      const label = createElement(state.document, "div", "noria-task-timeline-native-selection-label");
      const format = value => new Date(value).toLocaleString(plan.locale || "en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
      label.textContent = `${format(plan.rangePreview.startMs)} → ${format(plan.rangePreview.endMs)}`;
      preview.appendChild(label);
      state.main.rangePreview.appendChild(preview);
    }
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
      const pointOwnsSourceAction = unit.title?.visible === false || unit.title?.bounds?.width < 16;
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
      setAttribute(refs.rail, "aria-hidden", "true");
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
    refs.unit = unit;
    const titleVisible = unit.title?.visible !== false;
    setAttribute(refs.wrapper, "data-noria-task-group-key", unit.taskKey);
    setAttribute(refs.wrapper, "data-noria-task-title-visible", titleVisible ? "true" : "false");
    refs.wrapper.className = `noria-task-timeline-native-task-unit ${unit.status === "done" ? "is-done" : "is-open"}`;
    setAttribute(refs.title, "data-noria-task-unit-key", unit.taskKey);
    setAttribute(refs.title, "data-noria-task-visual-role", unit.title?.role || "primary-title");
    setAttribute(refs.title, "data-noria-source-action", "");
    setAttribute(refs.title, "role", titleVisible ? "button" : "");
    setAttribute(refs.title, "tabindex", titleVisible ? "0" : "");
    const statusText = state.mainPlan?.locale === "zh-CN" ? (unit.status === "done" ? "已完成" : "未完成") : (unit.status === "done" ? "Completed" : "Open");
    setAttribute(refs.title, "aria-label", titleVisible ? `${unit.title?.text || unit.taskKey} · ${statusText}` : "");
    setAttribute(refs.title, "aria-hidden", titleVisible ? "" : "true");
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
    if (mode === "ready") {
      const count = finite(model?.mainPlan?.hiddenTaskCount, 0);
      if (count > 0) {
        const node = createElement(state.document, "div", "noria-task-timeline-native-overflow", { role: "status" });
        node.textContent = model.mainPlan.locale === "zh-CN"
          ? `还有 ${count} 条任务 · 放大时间轴或增大视图查看`
          : `${count} more tasks · zoom in or enlarge this view`;
        state.main.stateLayer.appendChild(node);
      }
      return;
    }
    if (model?.showStateMessage === false) return;
    const node = createElement(
      state.document,
      "div",
      `noria-task-timeline-diagnostic-pill noria-task-timeline-native-state noria-task-timeline-native-state--${mode}`,
      { "data-noria-timeline-state": mode, role: mode === "error" ? "alert" : "status" }
    );
    node.textContent = text(model?.message || mode);
    state.main.stateLayer.appendChild(node);
  }

  let detailsId = 0;

  function showTaskDetails(state, taskKey) {
    const refs = state.taskNodes.get(taskKey);
    const unit = refs?.unit;
    const visible = unit && unit.title?.visible !== false;
    state.detailsKey = visible ? taskKey : "";
    state.taskNodes.forEach((item, key) => {
      setAttribute(item.wrapper, "data-noria-task-details", visible && key === taskKey ? "active" : "");
      setAttribute(item.title, "aria-describedby", visible && key === taskKey ? state.detailsTooltipId : "");
    });
    if (!visible) {
      if (state.detailsTooltip) state.detailsTooltip.hidden = true;
      return;
    }
    if (!state.detailsTooltip) {
      state.detailsTooltip = createElement(state.document, "div", "noria-task-timeline-native-tooltip", {
        role: "tooltip", id: state.detailsTooltipId
      });
      state.detailsTitle = createElement(state.document, "div", "noria-task-timeline-native-tooltip-title");
      state.detailsTime = createElement(state.document, "div", "noria-task-timeline-native-tooltip-time");
      state.detailsSource = createElement(state.document, "div", "noria-task-timeline-native-tooltip-source");
      state.detailsStatus = createElement(state.document, "div", "noria-task-timeline-native-tooltip-status");
      [state.detailsTitle, state.detailsTime, state.detailsStatus, state.detailsSource].forEach(node => state.detailsTooltip.appendChild(node));
      state.host.appendChild(state.detailsTooltip);
    }
    const locale = state.mainPlan?.locale === "zh-CN" ? "zh-CN" : "en";
    const dateOptions = { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
    const format = value => new Date(value).toLocaleString(locale, dateOptions);
    state.detailsTitle.textContent = text(unit.title.text);
    state.detailsTime.textContent = unit.isInstant ? format(unit.startMs) : `${format(unit.startMs)} → ${format(unit.endMs)}`;
    state.detailsStatus.textContent = locale === "zh-CN" ? (unit.status === "done" ? "已完成" : "未完成") : (unit.status === "done" ? "Completed" : "Open");
    state.detailsSource.textContent = text(unit.sourcePath);
    state.detailsSource.hidden = !unit.sourcePath;
    const tooltip = state.detailsTooltip;
    tooltip.hidden = false;
    tooltip.style.width = `${Math.min(320, Math.max(80, state.mainPlan.widthPx - 16))}px`;
    const width = tooltip.offsetWidth;
    const height = tooltip.offsetHeight;
    const below = unit.title.bounds.bottom + 10;
    setStyles(tooltip, {
      left: `${Math.max(8, Math.min(unit.title.bounds.left, state.mainPlan.widthPx - width - 8))}px`,
      top: `${below + height <= state.mainPlan.heightPx - 4 ? below : Math.max(4, unit.title.bounds.top - height - 8)}px`
    });
  }

  function attachTaskDetails(state) {
    if (!state.host.addEventListener) return;
    state.detailsTooltipId = `noria-timeline-details-${++detailsId}`;
    const taskKey = target => {
      for (let node = target; node && node !== state.host; node = node.parentElement) {
        const key = node.getAttribute?.("data-noria-task-group-key");
        if (key) return key;
      }
      return "";
    };
    const clearTimer = () => { globalThis.clearTimeout(state.detailsTimer); state.detailsTimer = null; };
    const handlers = {
      pointerover: event => {
        const key = taskKey(event.target);
        if (!key || key === taskKey(event.relatedTarget)) return;
        state.hoverKey = key;
        clearTimer();
        state.detailsTimer = globalThis.setTimeout(() => showTaskDetails(state, key), 140);
      },
      pointerout: event => {
        if (taskKey(event.target) === taskKey(event.relatedTarget)) return;
        state.hoverKey = "";
        clearTimer();
        showTaskDetails(state, state.focusedKey || "");
      },
      focusin: event => { state.focusedKey = taskKey(event.target); clearTimer(); showTaskDetails(state, state.focusedKey); },
      focusout: event => { state.focusedKey = taskKey(event.relatedTarget); showTaskDetails(state, state.focusedKey || state.hoverKey || ""); },
      keydown: event => {
        if (event.key !== "Escape") return;
        clearTimer(); state.hoverKey = ""; state.focusedKey = ""; showTaskDetails(state, "");
      }
    };
    Object.entries(handlers).forEach(([type, handler]) => state.host.addEventListener(type, handler));
    state.disposeDetails = () => {
      clearTimer();
      Object.entries(handlers).forEach(([type, handler]) => state.host.removeEventListener(type, handler));
    };
  }

  function updateSurface(state, model) {
    const mainPlan = model?.mainPlan || {};
    const overviewPlan = model?.overviewPlan || {};
    const densityWidthPx = finite(mainPlan?.densityWidthPx, mainPlan?.widthPx || 0);
    const density = densityWidthPx > 560 ? "wide" : (densityWidthPx > 320 ? "normal" : "compact");
    setAttribute(state.host, "data-noria-timeline-density", density);
    updateBandGeometry(state, mainPlan, overviewPlan);
    renderWeekendWashes(state, mainPlan);
    renderMarkers(state, mainPlan);
    renderAnnotations(state, mainPlan);
    reconcileTaskNodes(state, mainPlan);
    overviewApi.renderOverview(state.overviewBand, overviewPlan);
    renderState(state, model);
    state.model = model;
    if (state.detailsKey) showTaskDetails(state, state.detailsKey);
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
    attachTaskDetails(state);
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
      state.disposeDetails?.();
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
