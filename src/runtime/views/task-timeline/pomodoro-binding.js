(function () {
  const root = globalThis.noriaTaskTimeline || (globalThis.noriaTaskTimeline = {});
  const TIMER_ATTACH_TOKEN = "noria/timeline-timer-attach";
  const TIMER_ATTACH_MIME = "application/x-noria-timer-attach";

  const { text, normalizePath, stripPomodoroNoiseFromLine, taskPomodoroMeta, normalizePomodoroState, resolvePomodoroTaskKey, attachPomodoroState, startPomodoroWorkState, startPomodoroBreakState, pausePomodoroState, resumePomodoroState, closeActivePomodoroSession, startOrTogglePomodoroState, stopPomodoroState, detachPomodoroState, advancePomodoroState, buildTaskPomodoroSummary, activeElapsedMs, formatCountdown } = root.pomodoroState || globalThis.__noriaRuntimeBridge?.pomodoroEngine;

  function dataTypes(ev) {
    const types = ev && ev.dataTransfer && ev.dataTransfer.types;
    try { return Array.from(types || []); } catch (_) { return []; }
  }

  function getTransferText(ev, type) {
    try {
      return ev && ev.dataTransfer && typeof ev.dataTransfer.getData === "function"
        ? text(ev.dataTransfer.getData(type))
        : "";
    } catch (_) {
      return "";
    }
  }

  function parseTimerDrop(ev) {
    const types = dataTypes(ev);
    const hasCustom = types.includes(TIMER_ATTACH_MIME);
    const custom = getTransferText(ev, TIMER_ATTACH_MIME);
    const plain = getTransferText(ev, "text/plain");
    if (!hasCustom && plain !== TIMER_ATTACH_TOKEN) return { ok: false, sourceKey: "" };
    let sourceKey = "";
    if (custom && custom !== "1" && custom !== TIMER_ATTACH_TOKEN) {
      try {
        const parsed = JSON.parse(custom);
        sourceKey = text(parsed && parsed.sourceKey);
      } catch (_) {
        sourceKey = custom;
      }
    }
    return { ok: true, sourceKey };
  }

  function eventHasTimerDrop(ev) {
    const types = dataTypes(ev);
    if (types.includes(TIMER_ATTACH_MIME)) return true;
    return getTransferText(ev, "text/plain") === TIMER_ATTACH_TOKEN;
  }

  function createChild(parent, tag, cls, childText) {
    if (!parent) return null;
    if (typeof parent.createEl === "function") {
      return parent.createEl(tag, { cls, text: childText || "" });
    }
    const doc = parent.ownerDocument || (typeof document !== "undefined" ? document : null);
    if (!doc || typeof doc.createElement !== "function") return null;
    const el = doc.createElement(tag);
    el.className = cls || "";
    el.textContent = childText || "";
    if (typeof parent.appendChild === "function") parent.appendChild(el);
    return el;
  }

  function toggleClass(node, name, value) {
    if (!node || !node.classList) return;
    if (typeof node.classList.toggle === "function") {
      node.classList.toggle(name, !!value);
    } else if (value && typeof node.classList.add === "function") {
      node.classList.add(name);
    } else if (!value && typeof node.classList.remove === "function") {
      node.classList.remove(name);
    }
  }

  function buttonTextForSummary(summary) {
    return summary && summary.running ? "||" : ">";
  }

  function stopDockChromeEvent(ev) {
    if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
    if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
  }

  function stopDockPointerEvent(ev) {
    if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
  }

  function setDockExpanded(dock, expanded) {
    if (!dock || !dock.classList) return;
    if (expanded) dock.classList.add("is-expanded");
    else dock.classList.remove("is-expanded");
    const menu = dock.querySelector && dock.querySelector(".noria-task-timeline-pomodoro-menu");
    if (menu && typeof menu.setAttribute === "function") {
      menu.setAttribute("aria-expanded", expanded ? "true" : "false");
    }
  }

  function toggleDockExpanded(dock, ev) {
    stopDockChromeEvent(ev);
    const expanded = !!(dock && dock.classList && dock.classList.contains("is-expanded"));
    setDockExpanded(dock, !expanded);
  }

  function currentIso(options) {
    const opts = options && typeof options === "object" ? options : {};
    try {
      if (typeof opts.now === "function") return text(opts.now());
    } catch (_) {}
    return text(opts.now) || new Date().toISOString();
  }

  async function runDockAction(dock, action, ev) {
    if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
    if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
    const owner = dock && dock.__noriaTaskTimelinePomodoroOwner;
    const ctx = owner && owner.__noriaTaskTimelinePomodoroContext ? owner.__noriaTaskTimelinePomodoroContext : {};
    const options = ctx.options || {};
    const meta = ctx.meta || null;
    if (!owner || !meta) return;
    const nowIso = currentIso(options);
    const key = text(dock.getAttribute && dock.getAttribute("data-noria-pomodoro-key")) || meta.taskKey;
    let next;
    let reason = "task-timeline-pomodoro-toggle";
    if (action === "stop") {
      next = stopPomodoroState(readState(options), nowIso);
      reason = "task-timeline-pomodoro-stop";
    } else if (action === "detach") {
      next = detachPomodoroState(readState(options), [key, meta.taskKey], nowIso);
      reason = "task-timeline-pomodoro-detach";
    } else {
      next = startOrTogglePomodoroState(readState(options), { ...meta, taskKey: key }, nowIso);
    }
    const saved = normalizePomodoroState(await saveState(options, next));
    options.pomodoroState = saved;
    const nextKey = resolvePomodoroTaskKey(saved, meta) || key || meta.taskKey;
    syncDock(owner, nextKey, buildTaskPomodoroSummary(saved, nextKey, { now: nowIso }));
    if (typeof options.requestRefresh === "function") {
      try { options.requestRefresh(reason, saved); } catch (_) {}
    }
  }

  function createDockButton(parent, dock, cls, textValue, title, action) {
    const button = createChild(parent, "button", cls, textValue);
    if (!button) return null;
    button.setAttribute("type", "button");
    button.setAttribute("title", title);
    button.setAttribute("aria-label", title);
    button.addEventListener("click", (ev) => {
      return runDockAction(dock, action, ev);
    });
    return button;
  }

  function createDockMenuButton(parent, dock) {
    const button = createChild(parent, "button", "noria-task-timeline-pomodoro-menu", "...");
    if (!button) return null;
    button.setAttribute("type", "button");
    button.setAttribute("title", "Pomodoro controls");
    button.setAttribute("aria-label", "Pomodoro controls");
    button.setAttribute("aria-expanded", "false");
    button.addEventListener("click", (ev) => {
      toggleDockExpanded(dock, ev);
    });
    return button;
  }

  function removeDock(node) {
    if (!node) return;
    try {
      const dock = typeof node.querySelector === "function" ? node.querySelector(".noria-task-timeline-pomodoro-dock") : null;
      if (dock && typeof dock.remove === "function") dock.remove();
    } catch (_) {}
    if (node.classList && typeof node.classList.remove === "function") node.classList.remove("noria-task-timeline-has-pomodoro");
  }

  function syncDock(node, taskKey, summary) {
    if (!summary || !summary.visible) {
      removeDock(node);
      return null;
    }
    return ensureDock(node, taskKey, summary);
  }

  function ensureDock(node, taskKey, summary) {
    if (!node || !summary || !summary.visible) return null;
    if (node.classList && typeof node.classList.add === "function") node.classList.add("noria-task-timeline-has-pomodoro");
    let dock = null;
    try { dock = typeof node.querySelector === "function" ? node.querySelector(".noria-task-timeline-pomodoro-dock") : null; } catch (_) {}
    if (!dock) {
      dock = createChild(node, "span", "noria-task-timeline-pomodoro-dock", "");
      if (!dock) return null;
      dock.setAttribute("draggable", "false");
      dock.addEventListener("click", (ev) => {
        stopDockChromeEvent(ev);
      });
      dock.addEventListener("mousedown", stopDockPointerEvent);
      dock.addEventListener("pointerdown", stopDockPointerEvent);
      const dot = createChild(dock, "span", "noria-task-timeline-pomodoro-dot", "P");
      if (dot) dot.setAttribute("draggable", "true");
      if (dot) dot.addEventListener("dragstart", (ev) => {
        try {
          if (ev && ev.dataTransfer) {
            ev.dataTransfer.effectAllowed = "move";
            ev.dataTransfer.setData("text/plain", TIMER_ATTACH_TOKEN);
            ev.dataTransfer.setData(TIMER_ATTACH_MIME, JSON.stringify({ sourceKey: dock.getAttribute("data-noria-pomodoro-key") || "" }));
          }
        } catch (_) {}
      });
      createChild(dock, "span", "noria-task-timeline-pomodoro-text", "");
      createDockMenuButton(dock, dock);
      const controls = createChild(dock, "span", "noria-task-timeline-pomodoro-controls", "");
      createDockButton(controls, dock, "noria-task-timeline-pomodoro-action noria-task-timeline-pomodoro-toggle", ">", "Start or pause Pomodoro", "toggle");
      createDockButton(controls, dock, "noria-task-timeline-pomodoro-action noria-task-timeline-pomodoro-stop", "S", "Stop Pomodoro", "stop");
      createDockButton(controls, dock, "noria-task-timeline-pomodoro-detach", "x", "Detach Pomodoro", "detach");
    }
    dock.setAttribute("data-noria-task-timeline-layer-role", "pomodoro-dock");
    dock.setAttribute("data-noria-task-timeline-layer-z", "95");
    dock.__noriaTaskTimelinePomodoroOwner = node;
    dock.setAttribute("data-noria-pomodoro-key", taskKey);
    dock.setAttribute("data-noria-pomodoro-mode", summary.mode || "");
    dock.setAttribute("data-noria-pomodoro-running", summary.running ? "1" : "0");
    dock.setAttribute("data-noria-pomodoro-paused", summary.paused ? "1" : "0");
    dock.setAttribute("data-noria-pomodoro-remaining-ms", String(Math.max(0, Number(summary.remainingMs) || 0)));
    dock.setAttribute("data-noria-pomodoro-primary", summary.primaryText || "");
    dock.setAttribute("data-noria-pomodoro-last-outcome", summary.lastOutcome || "");
    dock.setAttribute("data-noria-pomodoro-last-mode", summary.lastMode || "");
    dock.setAttribute("data-noria-pomodoro-last-ended-at", summary.lastEndedAt || "");
    dock.setAttribute("title", summary.titleText || "Pomodoro");
    toggleClass(dock, "is-running", !!summary.running);
    toggleClass(dock, "is-paused", !!summary.paused);
    toggleClass(dock, "is-break", summary.mode === "BREAK");
    const textEl = dock.querySelector && dock.querySelector(".noria-task-timeline-pomodoro-text");
    if (textEl) textEl.textContent = summary.primaryText || "";
    const toggle = dock.querySelector && dock.querySelector(".noria-task-timeline-pomodoro-toggle");
    if (toggle) toggle.textContent = buttonTextForSummary(summary);
    return dock;
  }

  function removeHover(node) {
    if (node && node.classList && typeof node.classList.remove === "function") {
      node.classList.remove("noria-task-timeline-pomodoro-drop-hover");
    }
  }

  function readState(options) {
    const opts = options && typeof options === "object" ? options : {};
    if (typeof opts.readPomodoroState === "function") return opts.readPomodoroState();
    if (typeof globalThis.__noriaRuntimeBridge?.getPomodoroState === "function") return globalThis.__noriaRuntimeBridge.getPomodoroState();
    return opts.pomodoroState || {};
  }

  function syncRuntimePomodoroState(saved) {
    if (!saved || typeof saved !== "object") return saved;
    try {
      const bridge = globalThis.__noriaRuntimeBridge;
      if (bridge && typeof bridge === "object") bridge.pomodoro = saved;
    } catch (_) {}
    return saved;
  }

  async function saveState(options, state) {
    const opts = options && typeof options === "object" ? options : {};
    if (typeof opts.savePomodoroState === "function") {
      const result = await opts.savePomodoroState(state, { refreshRuntime: false });
      return syncRuntimePomodoroState(result && result.pomodoro ? result.pomodoro : state);
    }
    const bridge = globalThis.__noriaRuntimeBridge || {};
    if (typeof bridge.savePomodoroState !== "function") throw Error("Timer storage is unavailable");
    const result = await bridge.savePomodoroState(state, { refreshRuntime: false });
    return syncRuntimePomodoroState(result && result.pomodoro ? result.pomodoro : state);
  }

  function pomodoroStateSignature(rawState) {
    try { return JSON.stringify(normalizePomodoroState(rawState)); } catch (_) { return ""; }
  }

  function setRootPomodoroTickDiagnostics(rootNode, payload = {}) {
    if (!rootNode || typeof rootNode.setAttribute !== "function") return;
    const set = (name, value) => {
      try { rootNode.setAttribute(name, String(value == null ? "" : value)); } catch (_) {}
    };
    set("data-noria-last-pomodoro-tick-state", payload.state || "");
    set("data-noria-last-pomodoro-tick-updated", Number.isFinite(Number(payload.updated)) ? Math.max(0, Math.floor(Number(payload.updated))) : "");
    set("data-noria-last-pomodoro-tick-advanced", payload.advanced ? "1" : "0");
    set("data-noria-last-pomodoro-tick-at", payload.at || "");
    set("data-noria-last-pomodoro-tick-task", payload.taskKey || "");
    set("data-noria-last-pomodoro-tick-source-path", payload.sourcePath || "");
    set("data-noria-last-pomodoro-tick-source-line", payload.sourceLine || "");
    set("data-noria-last-pomodoro-tick-mode", payload.mode || "");
    set("data-noria-last-pomodoro-tick-running", payload.running ? "1" : "0");
    set("data-noria-last-pomodoro-tick-paused", payload.paused ? "1" : "0");
    set("data-noria-last-pomodoro-tick-remaining-ms", Math.max(0, Number(payload.remainingMs) || 0));
    set("data-noria-last-pomodoro-tick-primary", payload.primaryText || "");
  }

  async function tickPomodoroDocks(rootNode, options = {}) {
    if (!rootNode || typeof rootNode.querySelectorAll !== "function") {
      return { updated: 0, advanced: false, state: normalizePomodoroState(readState(options)) };
    }
    const nodes = Array.from(rootNode.querySelectorAll(".noria-task-timeline-has-pomodoro"));
    if (!nodes.length) {
      setRootPomodoroTickDiagnostics(rootNode, { state: "empty", updated: 0, advanced: false });
      return { updated: 0, advanced: false, state: normalizePomodoroState(readState(options)) };
    }
    const nowIso = currentIso(options);
    const before = normalizePomodoroState(readState(options));
    const advanced = advancePomodoroState(before, nowIso);
    let state = advanced;
    const didAdvance = pomodoroStateSignature(before) !== pomodoroStateSignature(advanced);
    if (didAdvance) {
      state = normalizePomodoroState(await saveState(options, advanced));
      options.pomodoroState = state;
      if (typeof options.requestRefresh === "function") {
        try { options.requestRefresh("task-timeline-pomodoro-auto-transition", state); } catch (_) {}
      }
    }
    let lastTick = null;
    nodes.forEach((node) => {
      const ctx = node && node.__noriaTaskTimelinePomodoroContext ? node.__noriaTaskTimelinePomodoroContext : {};
      const meta = ctx.meta || null;
      const attrKey = text(node && node.getAttribute && node.getAttribute("data-noria-pomodoro-key"));
      const taskKey = resolvePomodoroTaskKey(state, meta) || attrKey || text(meta && meta.taskKey);
      if (!taskKey) return;
      const summary = buildTaskPomodoroSummary(state, taskKey, { now: nowIso });
      syncDock(node, taskKey, summary);
      const payload = {
        state: "updated",
        updated: nodes.length,
        advanced: didAdvance,
        at: nowIso,
        taskKey,
        sourcePath: normalizePath(meta && meta.path),
        sourceLine: Number.isFinite(Number(meta && meta.lineHint)) && Number(meta.lineHint) >= 0 ? String(Math.floor(Number(meta.lineHint)) + 1) : "",
        mode: summary.mode || "",
        running: !!summary.running,
        paused: !!summary.paused,
        remainingMs: summary.remainingMs,
        primaryText: summary.primaryText || ""
      };
      if (!lastTick || summary.running || (summary.active && !lastTick.running)) lastTick = payload;
    });
    setRootPomodoroTickDiagnostics(rootNode, lastTick || { state: "empty", updated: nodes.length, advanced: didAdvance, at: nowIso });
    return { updated: nodes.length, advanced: didAdvance, state };
  }

  function installPomodoroDockTicker(rootNode, options = {}) {
    const timerHost = options.timerHost ||
      (typeof window !== "undefined" && window && typeof window.setInterval === "function" ? window : globalThis);
    if (!timerHost || typeof timerHost.setInterval !== "function" || typeof timerHost.clearInterval !== "function") {
      return () => {};
    }
    const intervalMs = Math.max(1000, Number(options.tickMs) || 1000);
    let disposed = false;
    let inFlight = false;
    const run = () => {
      if (disposed || inFlight) return;
      inFlight = true;
      Promise.resolve(tickPomodoroDocks(rootNode, options))
        .catch(() => {})
        .finally(() => { inFlight = false; });
    };
    run();
    const id = timerHost.setInterval(run, intervalMs);
    return () => {
      disposed = true;
      try { timerHost.clearInterval(id); } catch (_) {}
    };
  }

  function decorateTaskPomodoroDropTargets(nodes, event, options = {}) {
    const meta = taskPomodoroMeta(event);
    if (!meta) return null;
    const state = normalizePomodoroState(readState(options));
    const taskKey = resolvePomodoroTaskKey(state, meta) || meta.taskKey;
    const summary = buildTaskPomodoroSummary(state, taskKey, options);
    const items = Array.isArray(nodes) ? nodes : Array.from(nodes || []);
    items.forEach((node) => {
      if (!node || !node.classList) return;
      node.setAttribute("data-noria-pomodoro-key", taskKey);
      node.__noriaTaskTimelinePomodoroContext = { event, meta: { ...meta, taskKey }, options };
      syncDock(node, taskKey, summary);
      if (node.getAttribute && node.getAttribute("data-noria-pomodoro-drop-bound") === "1") return;
      node.setAttribute("data-noria-pomodoro-drop-bound", "1");
      node.addEventListener("dragover", (ev) => {
        if (!eventHasTimerDrop(ev)) return;
        if (ev && ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
        if (node.classList && typeof node.classList.add === "function") node.classList.add("noria-task-timeline-pomodoro-drop-hover");
        if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
        if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
      });
      node.addEventListener("dragleave", () => removeHover(node));
      node.addEventListener("drop", async (ev) => {
        const drop = parseTimerDrop(ev);
        if (!drop.ok) return;
        if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
        if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
        removeHover(node);
        const ctx = node.__noriaTaskTimelinePomodoroContext || {};
        const next = attachPomodoroState(readState(ctx.options), ctx.meta, drop.sourceKey);
        const saved = normalizePomodoroState(await saveState(ctx.options, next));
        ctx.options.pomodoroState = saved;
        const nextKey = resolvePomodoroTaskKey(saved, ctx.meta) || ctx.meta.taskKey;
        syncDock(node, nextKey, buildTaskPomodoroSummary(saved, nextKey, { now: currentIso(ctx.options) }));
        if (typeof ctx.options.requestRefresh === "function") {
          try { ctx.options.requestRefresh("task-timeline-pomodoro-attach", saved); } catch (_) {}
        }
      });
    });
    return { taskKey, meta, summary };
  }

  root.pomodoroBinding = {
    TIMER_ATTACH_TOKEN,
    TIMER_ATTACH_MIME,
    stripPomodoroNoiseFromLine,
    taskPomodoroMeta,
    normalizePomodoroState,
    attachPomodoroState,
    startPomodoroBreakState,
    startOrTogglePomodoroState,
    stopPomodoroState,
    detachPomodoroState,
    advancePomodoroState,
    buildTaskPomodoroSummary,
    parseTimerDrop,
    eventHasTimerDrop,
    tickPomodoroDocks,
    installPomodoroDockTicker,
    decorateTaskPomodoroDropTargets
  };

  if (globalThis.__NORIA_TASK_TIMELINE_TEST__) {
    globalThis.__noriaTaskTimelinePomodoroBindingTestHooks = root.pomodoroBinding;
  }
})();
