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
      .replace(/\s*\[[a-zA-Z_][a-zA-Z0-9_-]*::[^\]]*\]/g, " ")
      .replace(/(?:^|\s)#[^\s#]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function taskTitle(taskKey, record) {
    return cleanTaskTitle(record.titleSnapshot || record.title || record.text);
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

  function sessionTitle(kind, start, end, session, title, options={}) {
    const zh=/^zh/.test(options.locale||''),prefix=kind==='break'?(zh?'休息':'Break'):(title||(zh?'自由专注':'Free focus'));
    return prefix;
  }
  function durationLabel(start,end,options={}) {
    const zh=/^zh/.test(options.locale||'');
    const seconds=Math.max(0,Math.floor((dateMs(end)-dateMs(start))/1000));
    const duration=seconds<60?`${seconds}${zh?'秒':'s'}`:`${Math.floor(seconds/60)}${zh?'分钟':'m'}`;
    return Number.isFinite(seconds)?duration:'';
  }

  function sessionColor(kind, active) {
    return "";
  }

  function sessionOutcome(session) {
    const outcome = text(session && session.outcome).toLowerCase();
    if (["completed", "stopped", "abandoned"].includes(outcome)) return outcome;
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

  function buildSessionEvent(taskKey, record, session, index, options={}) {
    const start = text(session && session.start);
    if (!start) return null;
    const kind = sessionMode(session && session.mode);
    const end = text(session && session.end) || addMinutesIso(start, session && session.durationMin);
    const title = cleanTaskTitle(session?.title) || taskTitle(taskKey, record);
    const label = sessionTitle(kind, start, end, session, title, options);
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
      source: session.recordRef ? {type:'markdown',path:session.recordRef.path,line:session.line,anchor:session.recordRef.id} : taskSource(record),
      tags: ["#pomodoro"],
      payload: {
        pomodoro: {
          taskKey,
          taskPath: taskSource(record).path || "",
          sessionIndex: index,
          mode: session && session.mode || "WORK",
          active: false,
          taskTitle: title,
          session: { ...(session || {}) }
        }
      },
      presentation: {
        durationLabel: durationLabel(start,end,options),
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
    const title = record ? taskTitle(activeTaskKey, record) : text(active.titleSnapshot || active.title);
    const label = sessionTitle(mode, text(active.startedAt), end, active, title, options);
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
          taskPath: taskSource(record).path || "",
          mode: active.mode || "WORK",
          active: true,
          unassigned: !activeTaskKey || !record,
          taskTitle: title,
          timer: { ...active }
        }
      },
      presentation: {
        durationLabel: durationLabel(text(active.startedAt),end,options),
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
        if (Array.isArray(session && session.segments)) {
          session.segments.forEach((segment, segmentIndex) => {
            if (!(dateMs(segment.end) > dateMs(segment.start))) return;
            const event = buildSessionEvent(taskKey, record, { ...session, start: segment.start, end: segment.end }, index, options);
            if (!event) return;
            event.id += `-segment-${segmentIndex}`;
            event.payload.pomodoro.session = { ...session };
            event.payload.pomodoro.segmentIndex = segmentIndex;
            if (active && !session.end) event.status = text(active.status);
            events.push(event);
          });
          return;
        }
        if (active && !text(session && session.end) && index === sessions.length - 1) return;
        const event = buildSessionEvent(taskKey, record, session, index, options);
        if (event) events.push(event);
      });
    });
    const activeEvent = buildActiveEvent(source, options);
    if (activeEvent && source.active.status === "running" && dateMs(activeEvent.end) > dateMs(activeEvent.start)) events.push(activeEvent);
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
