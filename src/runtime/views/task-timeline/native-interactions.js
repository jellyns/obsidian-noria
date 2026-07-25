(function () {
  const root = globalThis.noriaTaskTimeline || (globalThis.noriaTaskTimeline = {});
  const viewportApi = root.nativeViewport;
  if (!viewportApi || typeof viewportApi.pxToDateMs !== "function") {
    throw new Error("Noria native viewport must load before native interactions");
  }

  const MINUTE = 60_000;
  const ACTIVATION_ROLES = new Set(["primary-title", "primary-range-title", "point", "duration-rail"]);
  const pendingTaskCommits = new Set();

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function finite(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function snapTime(timeMs, minutes) {
    const step = Math.max(1, finite(minutes, 5)) * MINUTE;
    return Math.round(finite(timeMs, 0) / step) * step;
  }

  function taskTimeIntent(input) {
    const task = input?.task || {};
    const viewport = input?.viewport;
    const startMs = finite(task.startMs, NaN);
    if (!viewport || !Number.isFinite(startMs)) return null;
    const parsedEnd = finite(task.endMs, NaN);
    const isDuration = task.isInstant !== true && Number.isFinite(parsedEnd) && parsedEnd > startMs;
    const roleInput = text(input.role).toLowerCase();
    const role = roleInput === "instant" ? "move" : roleInput || "move";
    const minDurationMs = Math.max(1, finite(input.minDurationMinutes, 5)) * MINUTE;
    const currentPx = finite(input.currentPx, finite(input.pointerPx, viewport.widthPx / 2));
    const originPx = finite(input.originPx, currentPx);
    const currentMs = viewportApi.pxToDateMs(viewport, currentPx);
    const originMs = viewportApi.pxToDateMs(viewport, originPx);
    let nextStart = startMs;
    let nextEnd = isDuration ? parsedEnd : null;

    if (role === "start" && isDuration) {
      nextStart = Math.min(snapTime(currentMs, input.snapMinutes), parsedEnd - minDurationMs);
    } else if (role === "end" && isDuration) {
      nextEnd = Math.max(snapTime(currentMs, input.snapMinutes), startMs + minDurationMs);
    } else {
      const unsnappedStart = startMs + (currentMs - originMs);
      nextStart = snapTime(unsnappedStart, input.snapMinutes);
      if (isDuration) nextEnd = parsedEnd + (nextStart - startMs);
    }

    return {
      type: "task-time",
      phase: text(input.phase) || "preview",
      taskKey: text(task.taskKey || task.id),
      role,
      startMs: nextStart,
      endMs: nextEnd,
      sourceVersion: task.sourceVersion == null ? "" : String(task.sourceVersion)
    };
  }

  function pointerToTimelineIntent(input = {}) {
    const action = text(input.action).toLowerCase();
    if (action === "open-source") {
      return { type: "open-source", taskKey: text(input.taskKey), reason: "pointer" };
    }
    if (action === "pan" && input.viewport) {
      const deltaPx = finite(input.currentPx, 0) - finite(input.originPx, 0);
      return { type: "viewport-pan", deltaPx, viewport: viewportApi.panByPx(input.viewport, deltaPx) };
    }
    if (action === "zoom" && input.viewport) {
      const deltaY = finite(input.deltaY, 0);
      const factor = finite(input.factor, deltaY < 0 ? 0.5 : deltaY > 0 ? 2 : 1);
      const pointerPx = finite(input.pointerPx, input.viewport.widthPx / 2);
      return { type: "viewport-zoom", factor, pointerPx, viewport: viewportApi.zoomAtPx(input.viewport, pointerPx, factor) };
    }
    if (action === "today") {
      return { type: "viewport-center", centerMs: finite(input.nowMs, Date.now()), reason: "today" };
    }
    if (action === "overview-navigate" && input.viewport) {
      return {
        type: "viewport-center",
        centerMs: viewportApi.pxToDateMs(input.viewport, finite(input.pointerPx, input.viewport.widthPx / 2)),
        reason: "overview"
      };
    }
    if (action === "select-range" && input.viewport) {
      const first = viewportApi.pxToDateMs(input.viewport, finite(input.originPx, 0));
      const second = viewportApi.pxToDateMs(input.viewport, finite(input.currentPx, 0));
      return { type: "select-range", startMs: Math.min(first, second), endMs: Math.max(first, second) };
    }
    if (action === "task-drag") return taskTimeIntent(input);
    return null;
  }

  function keyboardToTimelineIntent(input = {}) {
    const key = String(input.key == null ? "" : input.key);
    const taskKey = text(input.taskKey);
    if (taskKey && (key === "Enter" || key === " " || key === "Spacebar")) {
      return { type: "open-source", taskKey, reason: "keyboard" };
    }
    if (key === "Escape") return { type: "cancel" };
    if (key === "Home" || key.toLowerCase() === "t") {
      return { type: "viewport-center", centerMs: finite(input.nowMs, Date.now()), reason: "today" };
    }
    const viewport = input.viewport;
    if (!viewport) return null;
    if (key === "+" || key === "=" || key === "Add") {
      return pointerToTimelineIntent({ action: "zoom", viewport, factor: 0.5, pointerPx: viewport.widthPx / 2 });
    }
    if (key === "-" || key === "_" || key === "Subtract") {
      return pointerToTimelineIntent({ action: "zoom", viewport, factor: 2, pointerPx: viewport.widthPx / 2 });
    }
    const stepPx = Math.max(24, viewport.widthPx * 0.1);
    if (key === "ArrowLeft") {
      return pointerToTimelineIntent({ action: "pan", viewport, originPx: 0, currentPx: stepPx });
    }
    if (key === "ArrowRight") {
      return pointerToTimelineIntent({ action: "pan", viewport, originPx: 0, currentPx: -stepPx });
    }
    return null;
  }

  function attr(node, name) {
    try { return text(node?.getAttribute?.(name)); } catch (_) { return ""; }
  }

  function ancestor(target, predicate) {
    let node = target || null;
    while (node) {
      if (predicate(node)) return node;
      node = node.parentElement || null;
    }
    return null;
  }

  function taskKeyFromTarget(target) {
    return attr(ancestor(target, (node) => !!attr(node, "data-noria-task-unit-key")), "data-noria-task-unit-key");
  }

  function taskOwnerFromTarget(target, taskKey) {
    let fallback = null;
    let node = target || null;
    while (node) {
      if (attr(node, "data-noria-task-group-key") === taskKey) return node;
      if (!attr(node, "data-noria-task-handle-role") && attr(node, "data-noria-task-unit-key") === taskKey) fallback = node;
      node = node.parentElement || null;
    }
    return fallback || target || null;
  }

  function eventX(host, event) {
    let left = 0;
    try { left = finite(host?.getBoundingClientRect?.().left, 0); } catch (_) {}
    return finite(event?.clientX, left) - left;
  }

  function isEditableTarget(target) {
    const tagName = text(target?.tagName).toLowerCase();
    if (tagName === "input" || tagName === "textarea" || tagName === "select") return true;
    if (target?.isContentEditable === true) return true;
    let contentEditable = null;
    try { contentEditable = target?.getAttribute?.("contenteditable"); } catch (_) {}
    return contentEditable != null && String(contentEditable).toLowerCase() !== "false";
  }

  function clearTaskPreviewAttributes(owner) {
    owner?.removeAttribute?.("data-noria-drag-preview-state");
    owner?.removeAttribute?.("data-noria-drag-preview-start");
    owner?.removeAttribute?.("data-noria-drag-preview-end");
  }

  function setState(node, name, state, error) {
    if (!node?.setAttribute) return;
    node.setAttribute(name, text(state) || "idle");
    const errorName = name.endsWith("-state")
      ? `${name.slice(0, -"-state".length)}-error`
      : `${name}-error`;
    if (error) node.setAttribute(errorName, String(error?.message || error));
    else node.removeAttribute?.(errorName);
  }

  function applyViewportIntent(options, intent, event) {
    if (!intent) return;
    if (intent.type === "viewport-center") {
      if (typeof options.centerOn === "function") {
        options.centerOn(intent.centerMs, intent, event);
        return;
      }
      const current = typeof options.getViewport === "function" ? options.getViewport() : null;
      if (current && typeof options.updateViewport === "function") {
        options.updateViewport(viewportApi.createViewport({ ...current, centerMs: intent.centerMs }), intent, event);
      }
      return;
    }
    if (intent.viewport && typeof options.updateViewport === "function") {
      options.updateViewport(intent.viewport, intent, event);
    }
  }

  function activateSource(options, node, taskKey, event, reason) {
    if (!taskKey || typeof options.openSource !== "function") return;
    setState(node, "data-noria-action-state", "pending");
    try {
      const result = options.openSource({ type: "open-source", taskKey, reason, node, originalEvent: event });
      Promise.resolve(result).then((ok) => {
        setState(node, "data-noria-action-state", ok === false ? "failed" : "ok", ok === false ? "source open returned false" : "");
      }).catch((error) => setState(node, "data-noria-action-state", "failed", error));
    } catch (error) {
      setState(node, "data-noria-action-state", "failed", error);
    }
  }

  function attachTimelineInteractions(host, options = {}) {
    if (!host?.addEventListener) return () => {};
    disposeTimelineInteractions(host);
    const documentRef = options.document || host.ownerDocument || globalThis.document;
    const state = {
      host,
      options,
      document: documentRef,
      active: null,
      disposed: false,
      listeners: [],
      suppressedClickTaskKey: "",
      suppressedClickTimer: null
    };
    const listen = (target, type, listener, config) => {
      if (!target?.addEventListener) return;
      target.addEventListener(type, listener, config);
      state.listeners.push(() => {
        try { target.removeEventListener(type, listener, config); } catch (_) {}
      });
    };
    const getViewport = () => typeof options.getViewport === "function" ? options.getViewport() : options.viewport || null;
    const getOverviewViewport = () => typeof options.getOverviewViewport === "function" ? options.getOverviewViewport() : options.overviewViewport || null;
    const deadzone = Math.max(0, finite(options.dragDeadzonePx, 4));
    const ownsPointer = (session, event) => (
      session?.pointerId == null || event?.pointerId == null || session.pointerId === event.pointerId
    );
    const clearSuppressedClick = () => {
      state.suppressedClickTaskKey = "";
      if (state.suppressedClickTimer != null && typeof globalThis.clearTimeout === "function") {
        try { globalThis.clearTimeout(state.suppressedClickTimer); } catch (_) {}
      }
      state.suppressedClickTimer = null;
    };
    const suppressNextTaskClick = (taskKey) => {
      clearSuppressedClick();
      state.suppressedClickTaskKey = text(taskKey);
      if (typeof globalThis.setTimeout === "function") {
        state.suppressedClickTimer = globalThis.setTimeout(clearSuppressedClick, 0);
      }
    };

    const releasePreview = (session, reason, event) => {
      if (!session) return;
      if (session.kind === "task") {
        clearTaskPreviewAttributes(session.owner);
        if (reason !== "ok" && session.intent && typeof options.cancelTaskPreview === "function") {
          try {
            options.cancelTaskPreview({ ...session.intent, phase: "cancel", reason }, event);
          } catch (_) {}
        }
      } else if (session.kind === "select" && session.intent && typeof options.cancelRangePreview === "function") {
        try {
          options.cancelRangePreview({ ...session.intent, phase: "cancel", reason }, event);
        } catch (_) {}
      }
    };

    const cancelActive = (reason, event) => {
      const session = state.active;
      state.active = null;
      if (!session) return;
      if (session.kind === "pan") host.removeAttribute?.("data-noria-pan-state");
      releasePreview(session, reason || "cancelled", event);
      if (session.owner) {
        session.owner.removeAttribute?.("data-noria-drag-state");
        if (session.kind === "task") setState(session.owner, "data-noria-drag-commit-state", reason || "cancelled");
      }
    };

    const onClick = (event) => {
      const actionNode = ancestor(event.target, (node) => !!attr(node, "data-noria-timeline-action"));
      const action = attr(actionNode, "data-noria-timeline-action");
      if (action === "today") {
        applyViewportIntent(options, pointerToTimelineIntent({ action: "today", nowMs: typeof options.now === "function" ? options.now() : options.now }), event);
        event.preventDefault?.();
        return;
      }
      const bandNode = ancestor(event.target, (node) => !!attr(node, "data-noria-timeline-band"));
      if (attr(bandNode, "data-noria-timeline-band") === "overview") {
        const viewport = getOverviewViewport();
        if (viewport) applyViewportIntent(options, pointerToTimelineIntent({ action: "overview-navigate", viewport, pointerPx: eventX(host, event) }), event);
        event.preventDefault?.();
        return;
      }
      const localTaskControl = ancestor(event.target, (node) => (
        !!attr(node, "data-noria-task-handle-role") || !!attr(node, "data-noria-task-handle-zone")
      ));
      const localTaskKey = taskKeyFromTarget(localTaskControl);
      if (localTaskControl && localTaskKey) {
        if (state.suppressedClickTaskKey === localTaskKey) {
          clearSuppressedClick();
          event.preventDefault?.();
          event.stopPropagation?.();
          return;
        }
        activateSource(options, taskOwnerFromTarget(localTaskControl, localTaskKey), localTaskKey, event, "pointer");
        event.preventDefault?.();
        return;
      }
      const roleNode = ancestor(event.target, (node) => ACTIVATION_ROLES.has(attr(node, "data-noria-task-visual-role")));
      const taskKey = taskKeyFromTarget(roleNode || event.target);
      if (roleNode && taskKey && !attr(event.target, "data-noria-task-handle-role")) {
        activateSource(options, roleNode, taskKey, event, "pointer");
        event.preventDefault?.();
      }
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape" && state.active) {
        cancelActive("cancelled", event);
        event.preventDefault?.();
        return;
      }
      if (state.active || event.ctrlKey || event.metaKey || event.altKey || isEditableTarget(event.target)) return;
      const roleNode = ancestor(event.target, (node) => ACTIVATION_ROLES.has(attr(node, "data-noria-task-visual-role")));
      const taskKey = taskKeyFromTarget(roleNode || event.target);
      const intent = keyboardToTimelineIntent({
        key: event.key,
        taskKey,
        viewport: getViewport(),
        nowMs: typeof options.now === "function" ? options.now() : options.now
      });
      if (!intent) return;
      if (intent.type === "open-source") activateSource(options, roleNode || event.target, taskKey, event, "keyboard");
      else if (intent.type === "cancel") cancelActive("cancelled");
      else applyViewportIntent(options, intent, event);
      event.preventDefault?.();
      event.stopPropagation?.();
    };

    const onWheel = (event) => {
      if (state.active) return;
      const viewport = getViewport();
      if (!viewport) return;
      let intent = null;
      if (event.ctrlKey || event.metaKey) {
        intent = pointerToTimelineIntent({
          action: "zoom",
          viewport,
          pointerPx: eventX(host, event),
          deltaY: finite(event.deltaY, -finite(event.wheelDelta, 0))
        });
      } else {
        const deltaX = finite(event.deltaX, 0);
        const deltaY = finite(event.deltaY, -finite(event.wheelDelta, 0));
        const rawDelta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
        if (!rawDelta) return;
        const deltaMode = finite(event.deltaMode, 0);
        const unitPx = deltaMode === 1 ? 16 : deltaMode === 2 ? Math.max(1, viewport.widthPx) : 1;
        const deltaPx = clamp(-rawDelta * unitPx, -viewport.widthPx, viewport.widthPx);
        intent = pointerToTimelineIntent({ action: "pan", viewport, originPx: 0, currentPx: deltaPx });
      }
      applyViewportIntent(options, intent, event);
      event.preventDefault?.();
      event.stopPropagation?.();
    };

    const onPointerDown = (event) => {
      if (event.button != null && event.button !== 0) return;
      if (state.active) {
        event.preventDefault?.();
        event.stopPropagation?.();
        return;
      }
      const handle = ancestor(event.target, (node) => !!attr(node, "data-noria-task-handle-role"));
      const taskKey = taskKeyFromTarget(handle || event.target);
      if (handle && taskKey && typeof options.getTask === "function") {
        const owner = taskOwnerFromTarget(handle, taskKey);
        if (pendingTaskCommits.has(taskKey)) {
          setState(owner, "data-noria-drag-commit-state", "pending");
          event.preventDefault?.();
          event.stopPropagation?.();
          return;
        }
        const sourceTask = options.getTask(taskKey);
        const task = sourceTask ? { ...sourceTask, taskKey: text(sourceTask.taskKey) || taskKey } : null;
        if (!task) return;
        owner?.setAttribute?.("data-noria-drag-state", "active");
        state.active = {
          kind: "task",
          taskKey,
          owner,
          handle,
          task,
          role: attr(handle, "data-noria-task-handle-role"),
          pointerId: event.pointerId == null ? null : event.pointerId,
          originPx: eventX(host, event),
          viewport: getViewport(),
          moved: false,
          intent: null,
          committed: false
        };
        event.preventDefault?.();
        event.stopPropagation?.();
        return;
      }
      const taskSurface = ancestor(event.target, (node) => (
        ACTIVATION_ROLES.has(attr(node, "data-noria-task-visual-role")) ||
        !!attr(node, "data-noria-task-handle-zone")
      ));
      if (taskSurface) return;
      const band = ancestor(event.target, (node) => !!attr(node, "data-noria-timeline-band"));
      if (attr(band, "data-noria-timeline-band") !== "main") return;
      const viewport = getViewport();
      if (!viewport) return;
      state.active = {
        kind: event.shiftKey || options.markMode === true ? "select" : "pan",
        owner: band,
        pointerId: event.pointerId == null ? null : event.pointerId,
        originPx: eventX(host, event),
        viewport,
        moved: false,
        intent: null
      };
      if (state.active.kind === "pan") host.setAttribute?.("data-noria-pan-state", "active");
      event.preventDefault?.();
    };

    const buildTaskIntent = (session, currentPx, phase) => pointerToTimelineIntent({
          action: "task-drag",
          phase,
          role: session.role,
          task: session.task,
          viewport: session.viewport,
          originPx: session.originPx,
          currentPx,
          snapMinutes: options.snapMinutes,
          minDurationMinutes: options.minDurationMinutes
        });

    const taskIntentChanged = (session, intent) => {
      if (!intent) return false;
      const baseStart = finite(session.task?.startMs, NaN);
      const rawEnd = session.task?.endMs;
      const parsedEnd = rawEnd == null ? NaN : finite(rawEnd, NaN);
      const baseEnd = Number.isFinite(parsedEnd) ? parsedEnd : null;
      return intent.startMs !== baseStart || (intent.endMs == null ? null : intent.endMs) !== baseEnd;
    };

    const exposeTaskPreview = (session, intent, event) => {
      if (!intent) return;
      setState(session.owner, "data-noria-drag-preview-state", "active");
      session.owner?.setAttribute?.("data-noria-drag-preview-start", String(intent.startMs));
      session.owner?.setAttribute?.("data-noria-drag-preview-end", intent.endMs == null ? "" : String(intent.endMs));
      try { options.previewTaskTime?.(intent, event); } catch (_) {}
    };

    const onPointerMove = (event) => {
      const session = state.active;
      if (!session || !ownsPointer(session, event)) return;
      const currentPx = eventX(host, event);
      if (!session.moved && Math.abs(currentPx - session.originPx) < deadzone) return;
      session.moved = true;
      if (session.kind === "task") {
        session.intent = buildTaskIntent(session, currentPx, "preview");
        if (session.intent) {
          exposeTaskPreview(session, session.intent, event);
        }
      } else if (session.kind === "pan") {
        session.intent = pointerToTimelineIntent({ action: "pan", viewport: session.viewport, originPx: session.originPx, currentPx });
        applyViewportIntent(options, session.intent, event);
      } else {
        session.intent = pointerToTimelineIntent({ action: "select-range", viewport: session.viewport, originPx: session.originPx, currentPx });
        try { options.previewRange?.(session.intent, event); } catch (_) {}
      }
      event.preventDefault?.();
      event.stopPropagation?.();
    };

    const finishTask = async (session, event) => {
      if (!session.moved || !session.intent || session.committed || !taskIntentChanged(session, session.intent)) {
        releasePreview(session, "cancelled", event);
        return;
      }
      session.committed = true;
      const intent = { ...session.intent, phase: "commit" };
      const taskKey = text(session.taskKey || intent.taskKey);
      if (!taskKey || pendingTaskCommits.has(taskKey)) {
        setState(session.owner, "data-noria-drag-commit-state", "pending");
        releasePreview(session, "pending", event);
        return;
      }
      pendingTaskCommits.add(taskKey);
      setState(session.owner, "data-noria-drag-commit-state", "pending");
      try {
        if (typeof options.isSourceCurrent === "function") {
          const current = await options.isSourceCurrent(intent, event);
          if (current === false) {
            setState(session.owner, "data-noria-drag-commit-state", "stale-source");
            releasePreview(session, "stale-source", event);
            return;
          }
        }
        if (typeof options.commitTaskTime !== "function") {
          setState(session.owner, "data-noria-drag-commit-state", "failed", "task commit service unavailable");
          releasePreview(session, "failed", event);
          return;
        }
        const result = await options.commitTaskTime(intent, event);
        setState(session.owner, "data-noria-drag-commit-state", result === false ? "failed" : "ok", result === false ? "task commit returned false" : "");
        releasePreview(session, result === false ? "failed" : "ok", event);
      } catch (error) {
        setState(session.owner, "data-noria-drag-commit-state", "failed", error);
        releasePreview(session, "failed", event);
      } finally {
        pendingTaskCommits.delete(taskKey);
      }
    };

    const onPointerUp = (event) => {
      const session = state.active;
      if (!session || !ownsPointer(session, event)) return;
      const currentPx = eventX(host, event);
      if (session.moved || Math.abs(currentPx - session.originPx) >= deadzone) {
        session.moved = true;
        if (session.kind === "task") {
          session.intent = buildTaskIntent(session, currentPx, "preview");
        } else if (session.kind === "pan") {
          session.intent = pointerToTimelineIntent({ action: "pan", viewport: session.viewport, originPx: session.originPx, currentPx });
          applyViewportIntent(options, session.intent, event);
        } else {
          session.intent = pointerToTimelineIntent({ action: "select-range", viewport: session.viewport, originPx: session.originPx, currentPx });
        }
      }
      state.active = null;
      if (session.kind === "pan") host.removeAttribute?.("data-noria-pan-state");
      session.owner?.removeAttribute?.("data-noria-drag-state");
      if (session.kind === "task") {
        if (session.moved) suppressNextTaskClick(session.taskKey);
        void finishTask(session, event);
      }
      else if (session.kind === "select" && session.moved && session.intent) {
        try { options.selectRange?.(session.intent, event); } catch (_) {}
      }
      event.preventDefault?.();
      event.stopPropagation?.();
    };

    const onPointerCancel = (event) => {
      if (!state.active || !ownsPointer(state.active, event)) return;
      cancelActive("cancelled", event);
      event.preventDefault?.();
    };

    listen(host, "click", onClick);
    listen(host, "keydown", onKeyDown);
    listen(host, "wheel", onWheel, { passive: false });
    listen(host, "pointerdown", onPointerDown, true);
    listen(documentRef, "pointermove", onPointerMove, true);
    listen(documentRef, "pointerup", onPointerUp, true);
    listen(documentRef, "pointercancel", onPointerCancel, true);

    state.cleanup = () => {
      if (state.disposed) return;
      state.disposed = true;
      cancelActive("cancelled");
      clearSuppressedClick();
      state.listeners.splice(0).reverse().forEach((remove) => remove());
      if (host.__noriaNativeTimelineInteractions === state) host.__noriaNativeTimelineInteractions = null;
    };
    host.__noriaNativeTimelineInteractions = state;
    return state.cleanup;
  }

  function disposeTimelineInteractions(host) {
    const state = host?.__noriaNativeTimelineInteractions;
    if (state && typeof state.cleanup === "function") state.cleanup();
    if (host) host.__noriaNativeTimelineInteractions = null;
  }

  root.nativeInteractions = {
    attachTimelineInteractions,
    pointerToTimelineIntent,
    keyboardToTimelineIntent,
    disposeTimelineInteractions
  };

  if (globalThis.__NORIA_TASK_TIMELINE_TEST__) {
    globalThis.__noriaTaskTimelineInteractionsTestHooks = root.nativeInteractions;
  }
})();
