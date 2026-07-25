(function () {
  const root = globalThis.noriaTaskTimeline || (globalThis.noriaTaskTimeline = {});

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function dateMs(value, options = {}) {
    if (value instanceof Date) return value.getTime();
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const source = String(value == null ? "" : value).trim();
    const calendarDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(source);
    if (calendarDate) {
      const year = Number(calendarDate[1]);
      const monthIndex = Number(calendarDate[2]) - 1;
      const day = Number(calendarDate[3]);
      if (text(options.dateOnlyMode).toLowerCase() === "utc") {
        const utcMs = Date.UTC(year, monthIndex, day);
        const utc = new Date(utcMs);
        if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== monthIndex || utc.getUTCDate() !== day) return NaN;
        return utcMs;
      }
      const local = new Date(year, monthIndex, day);
      if (local.getFullYear() !== year || local.getMonth() !== monthIndex || local.getDate() !== day) return NaN;
      return local.getTime();
    }
    const parsed = Date.parse(source);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function eventKey(event, index) {
    return text(event && (event.id || event.taskKey)) || `event:${index}`;
  }

  function normalizeEvent(event, index, options) {
    if (!event || typeof event !== "object") return null;
    const startMs = dateMs(event.start, options);
    if (!Number.isFinite(startMs)) return null;
    const parsedEnd = dateMs(event.end, options);
    const endMs = Number.isFinite(parsedEnd) && parsedEnd >= startMs ? parsedEnd : startMs;
    return {
      ...event,
      id: text(event.id) || eventKey(event, index),
      taskKey: text(event.taskKey),
      layer: text(event.layer),
      startMs,
      endMs,
      isInstant: event.isInstant === true || endMs === startMs,
      __indexKey: eventKey(event, index)
    };
  }

  function compareEvents(a, b) {
    return a.startMs - b.startMs ||
      a.endMs - b.endMs ||
      a.layer.localeCompare(b.layer) ||
      a.id.localeCompare(b.id) ||
      a.__indexKey.localeCompare(b.__indexKey);
  }

  function createEventIndex(events, options = {}) {
    const seen = new Set();
    const normalized = [];
    (Array.isArray(events) ? events : []).forEach((event, index) => {
      const item = normalizeEvent(event, index, options);
      if (!item || seen.has(item.__indexKey)) return;
      seen.add(item.__indexKey);
      normalized.push(item);
    });
    normalized.sort(compareEvents);
    return { events: normalized, byKey: new Map(normalized.map((event) => [event.__indexKey, event])) };
  }

  function queryEventRange(index, startMs, endMs) {
    const lower = Math.min(Number(startMs), Number(endMs));
    const upper = Math.max(Number(startMs), Number(endMs));
    if (!Number.isFinite(lower) || !Number.isFinite(upper)) return [];
    return (index && Array.isArray(index.events) ? index.events : []).filter((event) => {
      return event.endMs >= lower && event.startMs <= upper;
    });
  }

  function partitionEvents(events) {
    const points = [];
    const spans = [];
    (Array.isArray(events) ? events : []).forEach((event) => {
      if (event && (event.isInstant || event.endMs === event.startMs)) points.push(event);
      else if (event) spans.push(event);
    });
    return { points, spans };
  }

  root.nativeEventIndex = {
    createEventIndex,
    queryEventRange,
    partitionEvents
  };

  if (globalThis.__NORIA_TASK_TIMELINE_TEST__) {
    globalThis.__noriaTaskTimelineEventIndexTestHooks = root.nativeEventIndex;
  }
})();
