(function () {
  const root = globalThis.noriaTaskTimeline || (globalThis.noriaTaskTimeline = {});
  const TIMER_ATTACH_TOKEN = "noria/timeline-timer-attach";
  const TIMER_ATTACH_MIME = "application/x-noria-timer-attach";

  function text(raw) {
    return String(raw == null ? "" : raw).trim();
  }

  function valueText(raw) {
    if (raw == null || raw === "") return "";
    if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") return String(raw).trim();
    if (Array.isArray(raw)) return raw.map(valueText).filter(Boolean).join(" ").trim();
    if (typeof raw === "object") {
      const keys = ["rawLine", "lineText", "raw", "text", "visual", "title", "clean", "display", "name", "value"];
      for (let i = 0; i < keys.length; i += 1) {
        const value = valueText(raw[keys[i]]);
        if (value) return value;
      }
    }
    return "";
  }

  function normalizePath(raw) {
    return text(raw).replace(/\\/g, "/").replace(/^\/+/, "");
  }

  function hashText(raw) {
    let h = 2166136261;
    const s = String(raw || "");
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(36);
  }

  function stripPomodoroNoiseFromLine(raw) {
    let out = String(raw || "");
    out = out.replace(/\s*\[\s*(?:timeLog|timer_running|\uD83C\uDF45)\s*::\s*[^\]]*\]/giu, " ");
    out = out.replace(/\s+\^noria[A-Za-z0-9_-]+\s*$/g, " ");
    out = out.replace(/\s{2,}/g, " ").trim();
    return out;
  }

  function titleFromLine(raw) {
    let out = stripPomodoroNoiseFromLine(raw);
    out = out.replace(/^\s*[-*]\s*\[[^\]]*\]\s*/g, "");
    out = out.replace(/\s*\[[a-zA-Z_][a-zA-Z0-9_-]*::\s*[^\]]*\]/g, " ");
    out = out.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2");
    out = out.replace(/\[\[([^\]]+)\]\]/g, (_, p1) => String(p1 || "").split("/").pop());
    out = out.replace(/\s\^[A-Za-z0-9_-]+\s*$/g, " ");
    out = out.replace(/(?:^|\s)[#\uFF03][^\s#\uFF03]+/g, " ");
    out = out.replace(/\s{2,}/g, " ").trim();
    return out;
  }

  function eventNoria(event) {
    return event && event.noria && typeof event.noria === "object" ? event.noria : {};
  }

  function taskRawText(event) {
    const noria = eventNoria(event);
    const task = noria.task && typeof noria.task === "object" ? noria.task : {};
    return valueText(task.rawLine) ||
      valueText(task.lineText) ||
      valueText(task.source && task.source.rawLine) ||
      valueText(task.text) ||
      valueText(task.visual) ||
      valueText(event && event.title);
  }

  function taskPomodoroMeta(event) {
    const noria = eventNoria(event);
    if (noria.layer && noria.layer !== "task") return null;
    const path = normalizePath(noria.path || noria.source && noria.source.path);
    const line = Number(noria.line != null ? noria.line : noria.source && noria.source.line);
    const rawLine = taskRawText(event);
    const stripped = stripPomodoroNoiseFromLine(rawLine);
    const fingerprintSource = (stripped || text(event && event.title)).replace(/\s+/g, " ").trim().toLowerCase();
    if (!path && !fingerprintSource) return null;
    const textFingerprint = hashText(fingerprintSource);
    const taskKey = `zp_${hashText(`${path}|${textFingerprint}`)}`;
    const title = titleFromLine(rawLine) || text(event && event.title) || "Task";
    return {
      taskKey,
      path,
      lineHint: Number.isFinite(line) && line >= 0 ? Math.floor(line) : -1,
      textFingerprint,
      title
    };
  }

  function normalizeRecord(raw, fallback) {
    const source = raw && typeof raw === "object" ? raw : {};
    return {
      ...source,
      path: normalizePath(source.path || fallback && fallback.path),
      lineHint: Number.isFinite(Number(source.lineHint)) ? Math.floor(Number(source.lineHint)) : Number(fallback && fallback.lineHint) || -1,
      textFingerprint: text(source.textFingerprint || fallback && fallback.textFingerprint),
      titleSnapshot: text(source.titleSnapshot || source.title || fallback && fallback.title),
      actual: Math.max(0, Number(source.actual) || 0),
      expected: Math.max(0, Number(source.expected) || 0),
      sessions: Array.isArray(source.sessions) ? source.sessions.slice() : []
    };
  }

  function normalizePomodoroState(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const tasks = {};
    const rawTasks = source.tasks && typeof source.tasks === "object" && !Array.isArray(source.tasks) ? source.tasks : {};
    Object.keys(rawTasks).forEach((key) => {
      const normalizedKey = text(key);
      if (normalizedKey) tasks[normalizedKey] = normalizeRecord(rawTasks[key], null);
    });
    return {
      ...source,
      version: 2,
      workLen: Math.max(1, Number(source.workLen) || 25),
      breakLen: Math.max(1, Number(source.breakLen) || 5),
      activeAttachTaskKey: text(source.activeAttachTaskKey),
      active: source.active && typeof source.active === "object" ? { ...source.active } : null,
      tasks
    };
  }

  function resolvePomodoroTaskKey(state, meta) {
    if (!meta) return "";
    const wantedPath = normalizePath(meta.path);
    const wantedFingerprint = text(meta.textFingerprint);
    const tasks = state && state.tasks ? state.tasks : {};
    const found = Object.keys(tasks).find((key) => {
      const record = tasks[key] || {};
      return normalizePath(record.path) === wantedPath && text(record.textFingerprint) === wantedFingerprint;
    });
    return found || text(meta.taskKey);
  }

  function attachPomodoroState(rawState, meta, sourceKey) {
    const state = normalizePomodoroState(rawState);
    if (!meta) return state;
    const taskKey = resolvePomodoroTaskKey(state, meta);
    if (!taskKey) return state;
    const previous = state.tasks[taskKey] || {};
    state.tasks[taskKey] = normalizeRecord({
      ...previous,
      path: meta.path,
      lineHint: meta.lineHint,
      textFingerprint: meta.textFingerprint,
      titleSnapshot: meta.title || previous.titleSnapshot
    }, meta);
    const source = text(sourceKey);
    if (source && source !== "1" && source !== TIMER_ATTACH_TOKEN && source !== taskKey) {
      if (state.active && state.active.taskKey === source) state.active.taskKey = taskKey;
      if (state.activeAttachTaskKey === source) state.activeAttachTaskKey = taskKey;
    }
    if (!state.activeAttachTaskKey || state.activeAttachTaskKey === source || source === "1" || source === TIMER_ATTACH_TOKEN) {
      state.activeAttachTaskKey = taskKey;
    }
    return normalizePomodoroState(state);
  }

  function dateMs(raw) {
    const ms = Date.parse(String(raw || ""));
    return Number.isFinite(ms) ? ms : NaN;
  }

  function activeElapsedMs(active, nowIso) {
    if (!active) return 0;
    let elapsed = Math.max(0, Math.floor(Number(active.elapsedMs) || 0));
    if (String(active.status || "") === "running") {
      const start = dateMs(active.startedAt);
      const now = dateMs(nowIso || new Date().toISOString());
      if (Number.isFinite(start) && Number.isFinite(now)) elapsed += Math.max(0, now - start);
    }
    return elapsed;
  }

  function closeActivePomodoroSession(rawState, nowIso, completed) {
    const state = normalizePomodoroState(rawState);
    const active = state.active;
    if (!active || !state.tasks[active.taskKey]) return state;
    const record = state.tasks[active.taskKey];
    const sessions = Array.isArray(record.sessions) ? record.sessions : [];
    record.sessions = sessions;
    const last = sessions.length ? sessions[sessions.length - 1] : null;
    const elapsedMs = activeElapsedMs(active, nowIso);
    const durationMin = Math.max(0, Math.floor(elapsedMs / 60000));
    if (last && !text(last.end) && last.mode === active.mode) {
      last.end = text(nowIso) || new Date().toISOString();
      last.durationMin = completed ? Math.max(last.durationMin || 0, Math.round(Number(active.durationMin) || durationMin)) : durationMin;
      last.completed = completed === true;
      last.outcome = completed === true ? "completed" : "abandoned";
    }
    if (completed === true && active.mode === "WORK") {
      record.actual = Math.max(0, Math.floor(Number(record.actual) || 0)) + 1;
    }
    state.activeAttachTaskKey = active.taskKey;
    state.active = null;
    return normalizePomodoroState(state);
  }

  function startPomodoroBreakState(rawState, taskKey, nowIso) {
    const iso = text(nowIso) || new Date().toISOString();
    let state = normalizePomodoroState(rawState);
    const key = text(taskKey);
    if (!key || !state.tasks[key]) return state;
    if (state.active) {
      state = closeActivePomodoroSession(state, iso, false);
      if (state.active) state.active = null;
    }
    const record = state.tasks[key];
    record.sessions = Array.isArray(record.sessions) ? record.sessions : [];
    record.sessions.push({ mode: "BREAK", start: iso, end: "", durationMin: 0, completed: false });
    state.active = {
      taskKey: key,
      mode: "BREAK",
      status: "running",
      startedAt: iso,
      elapsedMs: 0,
      durationMin: state.breakLen
    };
    state.activeAttachTaskKey = key;
    return normalizePomodoroState(state);
  }

  function startPomodoroWorkState(rawState, meta, nowIso) {
    const iso = text(nowIso) || new Date().toISOString();
    let state = attachPomodoroState(rawState, meta);
    const taskKey = resolvePomodoroTaskKey(state, meta);
    if (!taskKey || !state.tasks[taskKey]) return state;
    if (state.active) state = closeActivePomodoroSession(state, iso, false);
    const record = state.tasks[taskKey];
    record.sessions = Array.isArray(record.sessions) ? record.sessions : [];
    record.sessions.push({ mode: "WORK", start: iso, end: "", durationMin: 0, completed: false });
    state.active = {
      taskKey,
      mode: "WORK",
      status: "running",
      startedAt: iso,
      elapsedMs: 0,
      durationMin: state.workLen
    };
    state.activeAttachTaskKey = taskKey;
    return normalizePomodoroState(state);
  }

  function activeTargetMs(state, active) {
    if (!active) return 0;
    const fallback = active.mode === "BREAK" ? state.breakLen : state.workLen;
    return Math.max(1, Number(active.durationMin) || fallback) * 60000;
  }

  function activeFinishIso(active, targetMs) {
    const start = dateMs(active && active.startedAt);
    if (!Number.isFinite(start)) return new Date().toISOString();
    const elapsedBeforeStart = Math.max(0, Math.floor(Number(active.elapsedMs) || 0));
    return new Date(start + Math.max(0, targetMs - elapsedBeforeStart)).toISOString();
  }

  function advancePomodoroState(rawState, nowIso) {
    const now = text(nowIso) || new Date().toISOString();
    let state = normalizePomodoroState(rawState);
    let guard = 0;
    while (state.active && state.active.status === "running" && guard < 4) {
      guard += 1;
      const active = state.active;
      const targetMs = activeTargetMs(state, active);
      if (activeElapsedMs(active, now) < targetMs) break;
      const finishedAt = activeFinishIso(active, targetMs);
      const taskKey = text(active.taskKey);
      const mode = text(active.mode).toUpperCase();
      state = closeActivePomodoroSession(state, finishedAt, true);
      if (mode === "WORK" && taskKey && state.tasks[taskKey]) {
        state = startPomodoroBreakState(state, taskKey, finishedAt);
        continue;
      }
      break;
    }
    return normalizePomodoroState(state);
  }

  function pausePomodoroState(rawState, nowIso) {
    const state = normalizePomodoroState(rawState);
    if (!state.active || state.active.status !== "running") return state;
    state.active.elapsedMs = activeElapsedMs(state.active, nowIso);
    state.active.status = "paused";
    state.active.startedAt = "";
    return normalizePomodoroState(state);
  }

  function resumePomodoroState(rawState, nowIso) {
    const state = normalizePomodoroState(rawState);
    if (!state.active || state.active.status !== "paused") return state;
    state.active.status = "running";
    state.active.startedAt = text(nowIso) || new Date().toISOString();
    return normalizePomodoroState(state);
  }

  function startOrTogglePomodoroState(rawState, meta, nowIso) {
    let state = attachPomodoroState(rawState, meta);
    const taskKey = resolvePomodoroTaskKey(state, meta);
    if (state.active && state.active.taskKey === taskKey) {
      if (state.active.status === "running") return pausePomodoroState(state, nowIso);
      if (state.active.status === "paused") return resumePomodoroState(state, nowIso);
    }
    return startPomodoroWorkState(state, { ...meta, taskKey }, nowIso);
  }

  function stopPomodoroState(rawState, nowIso) {
    return closeActivePomodoroSession(rawState, text(nowIso) || new Date().toISOString(), false);
  }

  function detachPomodoroState(rawState, keys, nowIso) {
    let state = normalizePomodoroState(rawState);
    const list = Array.isArray(keys) ? keys : [keys];
    const detachKeys = new Set(list.map((item) => text(item)).filter(Boolean));
    if (!detachKeys.size) return state;
    if (state.active && detachKeys.has(state.active.taskKey)) {
      state = stopPomodoroState(state, nowIso);
    }
    if (detachKeys.has(state.activeAttachTaskKey)) state.activeAttachTaskKey = "";
    Object.keys(state.tasks).forEach((taskKey) => {
      if (!detachKeys.has(taskKey)) return;
      if (!recordHasHistory(state.tasks[taskKey])) delete state.tasks[taskKey];
    });
    return normalizePomodoroState(state);
  }

  function recordHasHistory(record) {
    return !!(record && (Number(record.actual) > 0 || Number(record.expected) > 0 || (Array.isArray(record.sessions) && record.sessions.length)));
  }

  function latestPomodoroSession(record) {
    const sessions = Array.isArray(record && record.sessions) ? record.sessions : [];
    return sessions.length ? sessions[sessions.length - 1] : null;
  }

  function sessionOutcome(session) {
    const outcome = text(session && session.outcome).toLowerCase();
    if (outcome === "completed" || outcome === "abandoned") return outcome;
    if (session && session.completed === true) return "completed";
    return "";
  }

  function formatCountdown(ms) {
    const totalSec = Math.ceil(Math.max(0, Number(ms) || 0) / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = Math.floor(totalSec % 60);
    return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  function buildTaskPomodoroSummary(rawState, taskKey, options = {}) {
    const state = normalizePomodoroState(rawState);
    const key = text(taskKey);
    const record = key ? state.tasks[key] : null;
    const activeTimer = state.active && state.active.taskKey === key ? state.active : null;
    const active = !!activeTimer;
    const attached = !!(key && state.activeAttachTaskKey === key);
    const visible = !!(record && (attached || active || recordHasHistory(record)));
    const actual = Math.max(0, Number(record && record.actual) || 0);
    const expected = Math.max(0, Number(record && record.expected) || 0);
    const lastSession = latestPomodoroSession(record);
    const lastOutcome = sessionOutcome(lastSession);
    const lastMode = text(lastSession && lastSession.mode).toUpperCase();
    const lastEndedAt = text(lastSession && lastSession.end);
    let primaryText = actual || expected ? `${actual}${expected ? `/${expected}` : ""}` : "";
    let titleText = record && record.titleSnapshot ? `Pomodoro: ${record.titleSnapshot}` : "Pomodoro";
    let targetMs = 0;
    let elapsedMs = 0;
    let remainingMs = 0;
    if (activeTimer) {
      targetMs = activeTargetMs(state, activeTimer);
      elapsedMs = activeElapsedMs(activeTimer, currentIso(options));
      remainingMs = Math.max(0, targetMs - elapsedMs);
      const label = activeTimer.mode === "BREAK" ? "BREAK" : activeTimer.status === "paused" ? "PAUSED" : "WORK";
      primaryText = `${label} ${formatCountdown(remainingMs)}`;
      titleText = primaryText;
    } else if (lastOutcome) {
      titleText = `${titleText} (${lastOutcome})`;
    }
    return {
      visible,
      active,
      attached,
      running: !!(activeTimer && activeTimer.status === "running"),
      paused: !!(activeTimer && activeTimer.status === "paused"),
      mode: text(activeTimer && activeTimer.mode).toUpperCase(),
      targetMs,
      elapsedMs,
      remainingMs,
      lastOutcome,
      lastMode,
      lastEndedAt,
      primaryText,
      titleText
    };
  }

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
    try {
      if (typeof opts.readPomodoroState === "function") return opts.readPomodoroState();
    } catch (_) {}
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
    try {
      const bridge = globalThis.__noriaRuntimeBridge || {};
      if (typeof bridge.savePomodoroState === "function") {
        const result = await bridge.savePomodoroState(state, { refreshRuntime: false });
        return syncRuntimePomodoroState(result && result.pomodoro ? result.pomodoro : state);
      }
    } catch (_) {}
    return syncRuntimePomodoroState(state);
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
