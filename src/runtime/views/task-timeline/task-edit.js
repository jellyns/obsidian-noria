(function () {
  const root = globalThis.noriaTaskTimeline || (globalThis.noriaTaskTimeline = {});
  const MINUTE = 60 * 1000;

  function coerceDate(raw) {
    if (!raw) return null;
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatDateTime(raw) {
    const d = coerceDate(raw);
    if (!d) return "";
    const ymd = [
      String(d.getFullYear()).padStart(4, "0"),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0")
    ].join("-");
    const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return `${ymd} ${hhmm}`;
  }

  function snapDate(raw, snapMinutes) {
    const d = coerceDate(raw);
    if (!d) return null;
    const step = Math.max(1, Number(snapMinutes) || 1) * MINUTE;
    return new Date(Math.round(d.getTime() / step) * step);
  }

  function addMinutes(raw, minutes) {
    const d = coerceDate(raw);
    if (!d) return null;
    return new Date(d.getTime() + Math.round(Number(minutes) || 0) * MINUTE);
  }

  function addMs(raw, ms) {
    const d = coerceDate(raw);
    if (!d) return null;
    return new Date(d.getTime() + Math.round(Number(ms) || 0));
  }

  function ensureMinEnd(start, end, minMinutes) {
    const s = coerceDate(start);
    const e = coerceDate(end);
    if (!s) return { start: null, end: e };
    const minMs = Math.max(1, Number(minMinutes) || 5) * MINUTE;
    if (!e || e.getTime() < s.getTime() + minMs) {
      return { start: s, end: new Date(s.getTime() + minMs) };
    }
    return { start: s, end: e };
  }

  function eventIsDuration(event) {
    return !!(event && (event.durationEvent === true || event.end));
  }

  function normalizeDragDates(event, drag, options = {}) {
    const role = String((drag && drag.role) || "").toLowerCase();
    const snapMinutes = Math.max(1, Number(options.snapMinutes || (drag && drag.snapMinutes) || 5));
    const minDurationMin = Math.max(1, Number(options.minDurationMin || (drag && drag.minDurationMin) || 5));
    const baseStart = coerceDate(event && event.start);
    const baseEnd = coerceDate(event && event.end);
    let start = coerceDate(drag && drag.start);
    let end = coerceDate(drag && drag.end);

    if (role === "start") {
      start = snapDate(start || baseStart, snapMinutes);
      end = snapDate(baseEnd || end, snapMinutes);
      return ensureMinEnd(start, end, minDurationMin);
    }
    if (role === "end") {
      start = snapDate(baseStart || start, snapMinutes);
      end = snapDate(end || drag && drag.start || baseEnd, snapMinutes);
      return ensureMinEnd(start, end, minDurationMin);
    }
    if (role === "move") {
      if ((!start || !end) && Number.isFinite(Number(drag && drag.deltaMs)) && baseStart) {
        start = addMs(baseStart, Number(drag.deltaMs));
        end = baseEnd ? addMs(baseEnd, Number(drag.deltaMs)) : null;
      }
      start = snapDate(start || baseStart, snapMinutes);
      if (eventIsDuration(event)) {
        const durationMin = baseStart && baseEnd
          ? Math.max(minDurationMin, Math.round((baseEnd.getTime() - baseStart.getTime()) / MINUTE))
          : minDurationMin;
        end = snapDate(end || addMinutes(start, durationMin), snapMinutes);
        return ensureMinEnd(start, end, minDurationMin);
      }
      return { start, end: null };
    }
    start = snapDate(start || baseStart, snapMinutes);
    if (eventIsDuration(event)) {
      end = snapDate(end || baseEnd, snapMinutes);
      return ensureMinEnd(start, end, minDurationMin);
    }
    return { start, end: null };
  }

  function instantFieldForEvent(event) {
    const noria = event && event.noria ? event.noria : {};
    const kind = String(noria.kind || "").toLowerCase();
    if (kind === "due") return "due";
    if (kind === "scheduled") return "scheduled";
    return "start";
  }

  function buildDraggedTaskLine(line, event, drag, options = {}) {
    const dates = normalizeDragDates(event, drag, options);
    const format = options.formatDateTime || formatDateTime;
    const startText = format(dates.start);
    const endText = format(dates.end);
    if (!startText) return String(line || "");

    const meta = event && (event.noria || event.payload?.noria);
    if (Number.isInteger(meta?.scheduleIndex)) {
      const schedule = root.taskDocument.parseTaskLine(line).schedules[meta.scheduleIndex];
      if (!schedule || schedule.error || schedule.start !== meta.scheduleStart || schedule.end !== meta.scheduleEnd) throw new Error("task-changed");
      const dateOnly = schedule.start.length === 10;
      const value = text => dateOnly ? text.slice(0,10) : text;
      return root.taskDocument.patchTaskLine(line, {schedule:{
        action:"update",index:meta.scheduleIndex,start:value(startText),
        end:schedule.end ? value(endText || format(addMinutes(dates.start, options.minDurationMin || 5))) : ""
      }});
    }

    if (eventIsDuration(event)) {
      return root.taskDocument.patchTaskDates(line, {
        start: startText,
        due: endText || format(addMinutes(dates.start, options.minDurationMin || 5))
      });
    }

    const key = instantFieldForEvent(event);
    return root.taskDocument.patchTaskDates(line, { [key]: startText });
  }

  root.taskEdit = {
    buildDraggedTaskLine,
    normalizeDragDates,
    formatDateTime,
    snapDate
  };

  if (globalThis.__NORIA_TASK_TIMELINE_TEST__) {
    globalThis.__noriaTaskTimelineTaskEditTestHooks = root.taskEdit;
  }
})();
