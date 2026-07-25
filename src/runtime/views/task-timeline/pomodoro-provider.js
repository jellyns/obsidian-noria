(function () {
  const root = globalThis.noriaTaskTimeline || (globalThis.noriaTaskTimeline = {});

  function text(raw) {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      return text(raw.clean || raw.title || raw.raw || raw.text || "");
    }
    return String(raw == null ? "" : raw).trim();
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

  function dateMs(raw) {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? NaN : date.getTime();
  }

  function addMinutesIso(start, minutes) {
    const ms = dateMs(start);
    if (!Number.isFinite(ms)) return "";
    const duration = Math.max(1, Math.round(Number(minutes) || 25));
    return new Date(ms + duration * 60 * 1000).toISOString();
  }

  function recordsFromState(state) {
    const tasks = state && state.tasks && typeof state.tasks === "object" && !Array.isArray(state.tasks)
      ? state.tasks
      : {};
    return Object.keys(tasks).map((taskKey) => {
      const record = tasks[taskKey] && typeof tasks[taskKey] === "object" ? tasks[taskKey] : {};
      return { taskKey, record };
    });
  }

  function cleanTaskTitle(raw) {
    return text(raw)
      .replace(/^\s*[-*]\s+\[[ xX/-]\]\s*/, "")
      .replace(/^\s*Pomodoro\s*[:：-]\s*/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function taskTitle(taskKey, record) {
    return cleanTaskTitle(record.titleSnapshot || record.title || record.text || taskKey) || taskKey || "Pomodoro";
  }

  function taskSource(record) {
    const source = record && typeof record === "object" ? record : {};
    const out = { type: "noria" };
    const path = text(source.path);
    const line = Number(source.lineHint != null ? source.lineHint : source.line);
    if (path) out.path = path.replace(/\\/g, "/").replace(/^\/+/, "");
    if (Number.isFinite(line) && line >= 0) out.line = Math.floor(line);
    return out;
  }

  function sessionMode(raw) {
    return text(raw).toUpperCase() === "BREAK" ? "break" : "work";
  }

  function durationMinutes(start, end, fallback) {
    const startMs = dateMs(start);
    const endMs = dateMs(end);
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
      return Math.max(1, Math.round((endMs - startMs) / (60 * 1000)));
    }
    const minutes = Number(fallback);
    return Number.isFinite(minutes) && minutes > 0 ? Math.max(1, Math.round(minutes)) : 0;
  }

  function sessionTitle(kind, start, end, session) {
    const prefix = kind === "break" ? "Break" : "Pomo";
    const minutes = durationMinutes(start, end, session && session.durationMin);
    return minutes ? `${prefix} ${minutes}m` : prefix;
  }

  function sessionColor(kind, active) {
    if (active) return kind === "break" ? "#16a34a" : "#ef4444";
    return kind === "break" ? "#22c55e" : "#f97316";
  }

  function sessionOutcome(session) {
    const outcome = text(session && session.outcome).toLowerCase();
    if (outcome === "completed" || outcome === "abandoned") return outcome;
    if (session && session.completed === true) return "completed";
    return "";
  }

  function sessionStatus(session) {
    return sessionOutcome(session) || "open";
  }

  function sessionClassname(kind, active, session) {
    const parts = ["noria-task-timeline-pomodoro", `noria-task-timeline-pomodoro--${kind}`];
    if (active) parts.push("noria-task-timeline-pomodoro--active");
    if (!active && sessionOutcome(session) === "abandoned") parts.push("noria-task-timeline-pomodoro--abandoned");
    return parts.join(" ");
  }

  function hoverText(kind, label, title, start, end, record, session) {
    const rows = [
      `Title: ${label}`,
      `Time: ${start}${end ? ` - ${end}` : ""}`,
      `Mode: ${kind === "break" ? "Break" : "Work"}`
    ];
    if (title && !(session && session.unassigned)) rows.push(`Task: ${title}`);
    const outcome = sessionOutcome(session);
    if (outcome) rows.push(`Status: ${outcome}`);
    if (record && record.path) rows.push(`Source: ${record.path}${Number(record.lineHint) >= 0 ? `:${record.lineHint}` : ""}`);
    else if (session && session.unassigned) rows.push("Source: unassigned");
    return rows.join("\n");
  }

  function buildSessionEvent(taskKey, record, session, index) {
    const start = text(session && session.start);
    if (!start) return null;
    const kind = sessionMode(session && session.mode);
    const end = text(session && session.end) || addMinutesIso(start, session && session.durationMin);
    const title = taskTitle(taskKey, record);
    const label = sessionTitle(kind, start, end, session);
    const durationEvent = !!end && Number.isFinite(dateMs(start)) && Number.isFinite(dateMs(end)) && dateMs(end) > dateMs(start);
    const id = `pomodoro-${taskKey}-${index}-${hashText(`${start}|${end}|${kind}`)}`;
    return {
      id,
      layer: "pomodoro",
      provider: "pomodoro",
      kind,
      title: label,
      start,
      ...(durationEvent ? { end } : {}),
      isInstant: !durationEvent,
      status: sessionStatus(session),
      color: sessionColor(kind, false),
      source: taskSource(record),
      tags: ["#pomodoro"],
      payload: {
        pomodoro: {
          taskKey,
          sessionIndex: index,
          mode: session && session.mode || "WORK",
          active: false,
          taskTitle: title,
          session: { ...(session || {}) }
        }
      },
      presentation: {
        classname: sessionClassname(kind, false, session),
        hoverText: hoverText(kind, label, title, start, end, record, session)
      }
    };
  }

  function activeEnd(active, options) {
    const now = options && options.now != null ? text(options.now) : "";
    if (active && active.status === "running" && now && Number.isFinite(dateMs(now))) return now;
    if (active && Number(active.elapsedMs) > 0) {
      const startMs = dateMs(active.startedAt);
      if (Number.isFinite(startMs)) return new Date(startMs + Number(active.elapsedMs)).toISOString();
    }
    return addMinutesIso(active && active.startedAt, active && active.durationMin);
  }

  function buildActiveEvent(state, options) {
    const active = state && state.active && typeof state.active === "object" ? state.active : null;
    if (!active || !text(active.startedAt)) return null;
    const activeTaskKey = text(active.taskKey);
    const record = activeTaskKey && state.tasks && state.tasks[activeTaskKey] && typeof state.tasks[activeTaskKey] === "object"
      ? state.tasks[activeTaskKey]
      : null;
    const mode = sessionMode(active.mode);
    const end = activeEnd(active, options || {});
    const title = record ? taskTitle(activeTaskKey, record) : text(active.titleSnapshot || active.title) || "Unassigned";
    const label = sessionTitle(mode, text(active.startedAt), end, active);
    const durationEvent = !!end && Number.isFinite(dateMs(active.startedAt)) && Number.isFinite(dateMs(end)) && dateMs(end) > dateMs(active.startedAt);
    const eventTaskKey = activeTaskKey || "unassigned";
    return {
      id: `pomodoro-active-${eventTaskKey}`,
      layer: "pomodoro",
      provider: "pomodoro",
      kind: `active-${mode}`,
      title: label,
      start: text(active.startedAt),
      ...(durationEvent ? { end } : {}),
      isInstant: !durationEvent,
      status: text(active.status || "running"),
      color: sessionColor(mode, true),
      source: taskSource(record),
      tags: ["#pomodoro"],
      payload: {
        pomodoro: {
          taskKey: activeTaskKey,
          mode: active.mode || "WORK",
          active: true,
          unassigned: !activeTaskKey || !record,
          taskTitle: title,
          timer: { ...active }
        }
      },
      presentation: {
        classname: sessionClassname(mode, true, active),
        hoverText: hoverText(mode, label, title, text(active.startedAt), end, record, { completed: false, unassigned: !activeTaskKey || !record })
      }
    };
  }

  function sortEvents(events) {
    return events.sort((a, b) => {
      const am = dateMs(a.start);
      const bm = dateMs(b.start);
      if (Number.isFinite(am) && Number.isFinite(bm) && am !== bm) return am - bm;
      return String(a.title || "").localeCompare(String(b.title || ""));
    });
  }

  function pomodoroStateToTimelineEvents(state, options = {}) {
    const source = state && typeof state === "object" ? state : {};
    const events = [];
    recordsFromState(source).forEach(({ taskKey, record }) => {
      const sessions = Array.isArray(record.sessions) ? record.sessions : [];
      sessions.forEach((session, index) => {
        const active = source.active && source.active.taskKey === taskKey ? source.active : null;
        if (active && !text(session && session.end) && text(session && session.start) === text(active.startedAt)) return;
        const event = buildSessionEvent(taskKey, record, session, index);
        if (event) events.push(event);
      });
    });
    const activeEvent = buildActiveEvent(source, options);
    if (activeEvent) events.push(activeEvent);
    return { dateTimeFormat: "iso8601", events: sortEvents(events), unplaced: [] };
  }

  root.pomodoroProvider = {
    pomodoroStateToTimelineEvents,
    buildSessionEvent,
    buildActiveEvent
  };

  if (globalThis.__NORIA_TASK_TIMELINE_TEST__) {
    globalThis.__noriaTaskTimelinePomodoroProviderTestHooks = root.pomodoroProvider;
  }
})();
