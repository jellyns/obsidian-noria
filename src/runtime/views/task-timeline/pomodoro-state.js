// Pure timer transitions shared by plugin lifecycle and all task views.
(function (factory) {
  const api = factory();
  if (typeof module === "object" && module.exports && module !== globalThis.module) module.exports = api;
  else (globalThis.noriaTaskTimeline || (globalThis.noriaTaskTimeline = {})).pomodoroState = api;
})(function () {
  const TIMER_ATTACH_TOKEN = "noria/timeline-timer-attach";
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
    const title = titleFromLine(rawLine) || text(event && event.title) || "Task";
    const taskId = rawLine.match(/\[id::\s*([^\]]+)\]/i)?.[1]?.trim() || rawLine.match(/\s\^([A-Za-z0-9_-]+)\s*$/)?.[1] || "";
    const fingerprintSource = title.replace(/\s+/g, " ").trim().toLowerCase();
    if (!path && !fingerprintSource) return null;
    const textFingerprint = hashText(fingerprintSource);
    const taskKey = `zp_${hashText(`${path}|${taskId || `${textFingerprint}|${line}`}`)}`;
    return {
      taskKey,
      path,
      lineHint: Number.isFinite(line) && line >= 0 ? Math.floor(line) : -1,
      textFingerprint,
      taskId,
      legacyTextFingerprint: hashText((stripped || text(event && event.title)).replace(/\s+/g, " ").trim().toLowerCase()),
      title
    };
  }

  function normalizeRecord(raw, fallback) {
    const source = raw && typeof raw === "object" ? raw : {};
    const lineHint = source.lineHint ?? fallback?.lineHint;
    return {
      ...source,
      path: normalizePath(source.path || fallback && fallback.path),
      lineHint: lineHint != null && Number.isFinite(Number(lineHint)) ? Math.floor(Number(lineHint)) : -1,
      textFingerprint: text(source.textFingerprint || fallback && fallback.textFingerprint),
      taskId: text(source.taskId || fallback && fallback.taskId),
      titleSnapshot: text(source.titleSnapshot || source.title || fallback && fallback.title),
      actual: Math.max(0, Number(source.actual) || 0),
      expected: Math.max(0, Number(source.expected) || 0),
      sessions: Array.isArray(source.sessions) ? source.sessions.map(session => ({
        ...session,
        ...(Array.isArray(session && session.segments) ? { segments: session.segments.map(segment => ({ ...segment })) } : {})
      })) : []
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
      breakLen: Number.isFinite(Number(source.breakLen)) && source.breakLen != null ? Math.max(0, Number(source.breakLen)) : 5,
      autostartBreak: source.autostartBreak === true,
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
    if (tasks[meta.taskKey]?.path === wantedPath && (!meta.taskId || tasks[meta.taskKey].taskId === meta.taskId)) return meta.taskKey;
    const candidates = Object.keys(tasks).filter((key) => {
      const record = tasks[key] || {};
      if (normalizePath(record.path) !== wantedPath) return false;
      if (meta.taskId && record.taskId) return meta.taskId === record.taskId;
      return Number(record.lineHint) === Number(meta.lineHint) && [wantedFingerprint,meta.legacyTextFingerprint].filter(Boolean).includes(text(record.textFingerprint));
    });
    return candidates.length === 1 ? candidates[0] : text(meta.taskKey);
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
      taskId: meta.taskId || previous.taskId,
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
      appendActiveSegment(last, active, nowIso);
      last.end = text(nowIso) || new Date().toISOString();
      last.durationMs = elapsedMs;
      last.durationMin = completed ? Math.max(last.durationMin || 0, Math.round(Number(active.durationMin) || durationMin)) : durationMin;
      last.completed = completed === true;
      last.outcome = completed === true ? "completed" : "stopped";
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
    record.sessions.push({ mode: "BREAK", recording: true, start: iso, end: "", durationMin: 0, durationMs: 0, segments: [], completed: false });
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
    const timerMode = meta.timerMode === "stopwatch" ? "stopwatch" : "pomodoro";
    record.sessions.push({ mode: "WORK", timerMode, recording: true, start: iso, end: "", durationMin: 0, durationMs: 0, segments: [], completed: false });
    state.active = {
      taskKey,
      mode: "WORK",
      timerMode,
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
    if (active.timerMode === "stopwatch") return Infinity;
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
      if (mode === "WORK" && state.breakLen > 0 && taskKey && state.tasks[taskKey]) {
        state = startPomodoroBreakState(state, taskKey, finishedAt);
        if (!state.autostartBreak) state = pausePomodoroState(state, finishedAt);
        continue;
      }
      break;
    }
    return normalizePomodoroState(state);
  }

  // Only new sessions have exact spans. Never reconstruct missing legacy pauses.
  function appendActiveSegment(session, active, nowIso) {
    if (!session || !Array.isArray(session.segments) || !active || active.status !== "running") return;
    const start = text(active.startedAt), end = text(nowIso) || new Date().toISOString();
    if (dateMs(end) > dateMs(start)) session.segments.push({ start, end });
  }

  function pausePomodoroState(rawState, nowIso) {
    const state = normalizePomodoroState(rawState);
    if (!state.active || state.active.status !== "running") return state;
    const record = state.tasks[state.active.taskKey];
    const session = record && record.sessions[record.sessions.length - 1];
    if (session && !session.end) appendActiveSegment(session, state.active, nowIso);
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
    if (["completed", "stopped", "abandoned"].includes(outcome)) return outcome;
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
      primaryText = `${label} ${formatCountdown(activeTimer.timerMode === "stopwatch" ? elapsedMs : remainingMs)}`;
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

  function currentIso(options) {
    const opts = options && typeof options === "object" ? options : {};
    try {
      if (typeof opts.now === "function") return text(opts.now());
    } catch (_) {}
    return text(opts.now) || new Date().toISOString();
  }

  return { text, normalizePath, stripPomodoroNoiseFromLine, taskPomodoroMeta, normalizePomodoroState, resolvePomodoroTaskKey, attachPomodoroState, startPomodoroWorkState, startPomodoroBreakState, pausePomodoroState, resumePomodoroState, closeActivePomodoroSession, startOrTogglePomodoroState, stopPomodoroState, detachPomodoroState, advancePomodoroState, buildTaskPomodoroSummary, activeElapsedMs, formatCountdown };
});
