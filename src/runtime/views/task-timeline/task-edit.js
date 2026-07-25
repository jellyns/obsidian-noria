(function () {
  const root = globalThis.noriaTaskTimeline || (globalThis.noriaTaskTimeline = {});
  const MINUTE = 60 * 1000;

  function escapeRegExp(text) {
    return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function stripInlineField(line, key) {
    const re = new RegExp(`\\s*\\[\\s*${escapeRegExp(key)}\\s*::\\s*[^\\]]*\\]`, "gi");
    return String(line || "").replace(re, " ");
  }

  function upsertInlineField(line, key, value) {
    const normalized = String(line || "").replace(/\s{2,}/g, " ").trimEnd();
    const field = `[${key}:: ${String(value || "").trim()}]`;
    if (!normalized) return field;
    return `${normalized} ${field}`.replace(/\s{2,}/g, " ").trimEnd();
  }

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
    const startText = formatDateTime(dates.start);
    const endText = formatDateTime(dates.end);
    if (!startText) return String(line || "");

    if (eventIsDuration(event)) {
      let next = stripInlineField(line, "start");
      next = stripInlineField(next, "due");
      next = upsertInlineField(next, "start", startText);
      next = upsertInlineField(next, "due", endText || formatDateTime(addMinutes(dates.start, options.minDurationMin || 5)));
      return next.replace(/\s{2,}/g, " ").trimEnd();
    }

    const key = instantFieldForEvent(event);
    let next = stripInlineField(line, key);
    next = upsertInlineField(next, key, startText);
    return next.replace(/\s{2,}/g, " ").trimEnd();
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
