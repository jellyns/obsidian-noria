(function () {
  const root = globalThis.noriaTaskTimeline || (globalThis.noriaTaskTimeline = {});

  const LAYER_SOURCE_TYPES = {
    task: "markdown",
    annotation: "noria",
    pomodoro: "noria",
    note: "filesystem",
    git: "git"
  };

  function text(raw) {
    return String(raw == null ? "" : raw).trim();
  }

  function normalizeDateValue(raw) {
    if (raw == null || raw === "") return "";
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString();
    if (raw && typeof raw.toISO === "function") return text(raw.toISO());
    return text(raw);
  }

  function dateMs(raw) {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? NaN : date.getTime();
  }

  function normalizeTags(raw) {
    if (raw == null || raw === "") return [];
    const items = Array.isArray(raw) ? raw : String(raw).split(/\s+/);
    return items.map((item) => text(item)).filter(Boolean);
  }

  function normalizeSource(raw, layer) {
    const source = raw && typeof raw === "object" ? raw : {};
    const type = text(source.type) || LAYER_SOURCE_TYPES[layer] || "noria";
    const out = { type };
    const path = text(source.path);
    const hash = text(source.hash);
    const repo = text(source.repo);
    const line = Number(source.line);
    if (path) out.path = path.replace(/\\/g, "/").replace(/^\/+/, "");
    if (Number.isFinite(line) && line >= 0) out.line = line;
    if (hash) out.hash = hash;
    if (repo) out.repo = repo;
    return out;
  }

  function normalizeClassName(event) {
    const presentation = event.presentation && typeof event.presentation === "object" ? event.presentation : {};
    const classes = [
      "noria-task-timeline-event",
      `noria-task-timeline-event--${event.layer}`,
      `noria-task-timeline-event--${event.kind}`
    ];
    if (event.status) classes.push(`noria-task-timeline-event--${event.status}`);
    const extra = text(event.classname || event.className || presentation.classname || presentation.className);
    if (extra) classes.push(extra);
    return classes.join(" ");
  }

  function normalizeTimelineEvent(raw, index) {
    if (!raw || typeof raw !== "object") return null;
    const layer = text(raw.layer || "task").toLowerCase();
    const kind = text(raw.kind || raw.type || "event").toLowerCase();
    const start = normalizeDateValue(raw.start);
    if (!start) return null;
    const end = normalizeDateValue(raw.end);
    const startMs = dateMs(start);
    const endMs = dateMs(end);
    const hasDuration = !!end && Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs;
    const isInstant = raw.isInstant != null ? !!raw.isInstant : !hasDuration;
    const id = text(raw.id || raw.eventID || `${layer}-${kind}-${index}`);
    const source = normalizeSource(raw.source, layer);
    const payload = raw.payload && typeof raw.payload === "object" ? raw.payload : {};
    const provider = text(raw.provider || raw.providerKey || payload.provider || (layer === "task" ? "tasks" : ""));
    const normalized = {
      id,
      layer,
      provider,
      kind,
      title: text(raw.title || raw.text || id || "Untitled event"),
      start,
      isInstant,
      status: text(raw.status).toLowerCase(),
      color: text(raw.color),
      textColor: text(raw.textColor),
      source,
      tags: normalizeTags(raw.tags),
      payload,
      presentation: raw.presentation && typeof raw.presentation === "object" ? raw.presentation : {}
    };
    if (!isInstant && end) normalized.end = end;
    return normalized;
  }

  function normalizeTimelineEvents(events) {
    const items = Array.isArray(events) ? events : Array.from(events || []);
    return items
      .map((event, index) => normalizeTimelineEvent(event, index))
      .filter(Boolean);
  }

  function normalizeList(raw) {
    if (raw == null || raw === "") return [];
    return (Array.isArray(raw) ? raw : String(raw).split(/\s+/))
      .map((item) => text(item).toLowerCase())
      .filter(Boolean);
  }

  function splitQueryText(raw) {
    const tokens = [];
    const source = text(raw);
    const pattern = /"([^"]+)"|'([^']+)'|(\S+)/g;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      tokens.push(text(match[1] || match[2] || match[3]));
    }
    return tokens;
  }

  function parseTimelineFilterQuery(raw) {
    const parsed = {
      layers: [],
      excludedLayers: [],
      statuses: [],
      excludedStatuses: [],
      tags: [],
      excludedTags: [],
      kinds: [],
      excludedKinds: [],
      providers: [],
      sources: [],
      text: ""
    };
    const free = [];
    splitQueryText(raw).forEach((token) => {
      let item = token;
      let excluded = false;
      if (/^[-!]/.test(item)) {
        excluded = true;
        item = item.slice(1);
      }
      const match = item.match(/^([a-z][a-z0-9_-]*):(.*)$/i);
      if (!match || !text(match[2])) {
        if (token) free.push(token);
        return;
      }
      const key = match[1].toLowerCase();
      const value = text(match[2]).toLowerCase();
      if (key === "layer" || key === "l") (excluded ? parsed.excludedLayers : parsed.layers).push(value);
      else if (key === "status" || key === "state") (excluded ? parsed.excludedStatuses : parsed.statuses).push(value);
      else if (key === "tag" || key === "tags") (excluded ? parsed.excludedTags : parsed.tags).push(value);
      else if (key === "kind" || key === "type") (excluded ? parsed.excludedKinds : parsed.kinds).push(value);
      else if (key === "provider") parsed.providers.push(value);
      else if (key === "source" || key === "path") parsed.sources.push(value);
      else free.push(token);
    });
    parsed.text = free.join(" ").trim().toLowerCase();
    return parsed;
  }

  function eventSearchText(event) {
    return [
      event.id,
      event.layer,
      event.provider,
      event.kind,
      event.title,
      event.status,
      event.source && event.source.path,
      event.source && event.source.hash,
      ...(event.tags || [])
    ].map((item) => text(item).toLowerCase()).filter(Boolean).join(" ");
  }

  function eventSourceText(event) {
    const source = event && event.source && typeof event.source === "object" ? event.source : {};
    return [source.type, source.path, source.repo, source.hash]
      .map((item) => text(item).toLowerCase())
      .filter(Boolean)
      .join(" ");
  }

  function filterTimelineEvents(events, query = {}) {
    const normalized = normalizeTimelineEvents(events);
    const parsed = parseTimelineFilterQuery(query.text || query.query || "");
    const layers = normalizeList(query.layers || query.layer);
    const statuses = normalizeList(query.statuses || query.status);
    const excludedStatuses = normalizeList(query.excludeStatuses || query.excludeStatus);
    const tags = normalizeList(query.includeTags || query.tags || query.tag);
    const excludedTags = normalizeList(query.excludeTags || query.excludedTags);
    const needle = parsed.text;
    return normalized.filter((event) => {
      if (layers.length && !layers.includes(event.layer)) return false;
      if (parsed.layers.length && !parsed.layers.includes(event.layer)) return false;
      if (parsed.excludedLayers.length && parsed.excludedLayers.includes(event.layer)) return false;
      if (statuses.length && !statuses.includes(event.status)) return false;
      if (parsed.statuses.length && !parsed.statuses.includes(event.status)) return false;
      if (excludedStatuses.length && excludedStatuses.includes(event.status)) return false;
      if (parsed.excludedStatuses.length && parsed.excludedStatuses.includes(event.status)) return false;
      if (parsed.kinds.length && !parsed.kinds.includes(event.kind)) return false;
      if (parsed.excludedKinds.length && parsed.excludedKinds.includes(event.kind)) return false;
      if (parsed.providers.length && !parsed.providers.includes(event.provider)) return false;
      if (parsed.sources.length) {
        const sourceText = eventSourceText(event);
        if (!parsed.sources.every((source) => sourceText.includes(source))) return false;
      }
      if (tags.length || excludedTags.length) {
        const eventTags = normalizeList(event.tags);
        if (!tags.every((tag) => eventTags.includes(tag))) return false;
        if (excludedTags.some((tag) => eventTags.includes(tag))) return false;
      }
      if (parsed.tags.length || parsed.excludedTags.length) {
        const eventTags = normalizeList(event.tags);
        if (parsed.tags.length && !parsed.tags.every((tag) => eventTags.includes(tag))) return false;
        if (parsed.excludedTags.length && parsed.excludedTags.some((tag) => eventTags.includes(tag))) return false;
      }
      if (needle && !eventSearchText(event).includes(needle)) return false;
      return true;
    });
  }

  function providerResultEvents(result) {
    if (!result) return [];
    if (Array.isArray(result)) return result;
    if (Array.isArray(result.events)) return result.events;
    if (typeof result[Symbol.iterator] === "function") {
      try { return Array.from(result); } catch (_) {}
    }
    return [];
  }

  function sortTimelineEvents(events) {
    return normalizeTimelineEvents(events).sort((a, b) => {
      const am = dateMs(a.start);
      const bm = dateMs(b.start);
      if (Number.isFinite(am) && Number.isFinite(bm) && am !== bm) return am - bm;
      return String(a.title || "").localeCompare(String(b.title || ""));
    });
  }

  async function collectProviderEvents(providers, context = {}) {
    const items = Array.isArray(providers) ? providers : Array.from(providers || []);
    const events = [];
    const errors = [];
    for (let i = 0; i < items.length; i += 1) {
      const provider = items[i] || {};
      const providerId = text(provider.id || provider.key || `provider-${i}`);
      const providerLayer = text(provider.layer || provider.type || "task").toLowerCase();
      try {
        if (typeof provider.collect !== "function") continue;
        const result = await provider.collect(context);
        const rawEvents = providerResultEvents(result);
        for (let j = 0; j < rawEvents.length; j += 1) {
          const event = rawEvents[j] || {};
          const normalized = normalizeTimelineEvent({
            ...event,
            layer: event.layer || providerLayer,
            provider: event.provider || providerId
          }, events.length);
          if (normalized) events.push(normalized);
        }
      } catch (err) {
        errors.push({
          provider: providerId,
          layer: providerLayer,
          message: err && err.message ? String(err.message) : String(err || "provider failed")
        });
      }
    }
    return { events: sortTimelineEvents(events), errors };
  }

  function timelineEventToJsonEvent(event) {
    const normalized = normalizeTimelineEvent(event, 0);
    if (!normalized) return null;
    const presentation = normalized.presentation || {};
    const noriaPayload = normalized.payload && normalized.payload.noria && typeof normalized.payload.noria === "object"
      ? normalized.payload.noria
      : {};
    const noria = {
      ...noriaPayload,
      id: noriaPayload.id || normalized.id,
      layer: normalized.layer,
      provider: normalized.provider,
      kind: noriaPayload.kind || normalized.kind,
      status: noriaPayload.status || normalized.status,
      source: normalized.source,
      tags: normalized.tags
    };
    const out = {
      id: normalized.id,
      eventID: text(presentation.eventID || normalized.id),
      start: normalized.start,
      durationEvent: !normalized.isInstant,
      title: normalized.title,
      classname: normalizeClassName(normalized),
      noria
    };
    if (!normalized.isInstant && normalized.end) out.end = normalized.end;
    if (normalized.color) out.color = normalized.color;
    if (normalized.textColor) out.textColor = normalized.textColor;
    if (presentation.hoverText || normalized.hoverText) out.hoverText = text(presentation.hoverText || normalized.hoverText);
    if (presentation.description || normalized.description) out.description = text(presentation.description || normalized.description);
    if (presentation.caption) out.caption = text(presentation.caption);
    if (presentation.icon) out.icon = text(presentation.icon);
    if (presentation.image) out.image = text(presentation.image);
    if (presentation.link) out.link = text(presentation.link);
    if (presentation.tapeImage) out.tapeImage = text(presentation.tapeImage);
    if (presentation.tapeRepeat) out.tapeRepeat = text(presentation.tapeRepeat);
    return out;
  }

  function timelineEventsToJson(events, options = {}) {
    return {
      dateTimeFormat: "iso8601",
      events: normalizeTimelineEvents(events)
        .map(timelineEventToJsonEvent)
        .filter(Boolean),
      unplaced: Array.isArray(options.unplaced) ? options.unplaced : []
    };
  }

  root.eventModel = {
    normalizeTimelineEvent,
    normalizeTimelineEvents,
    parseTimelineFilterQuery,
    filterTimelineEvents,
    collectProviderEvents,
    timelineEventToJsonEvent,
    timelineEventsToJson
  };

  if (globalThis.__NORIA_TASK_TIMELINE_TEST__) {
    globalThis.__noriaTaskTimelineEventModelTestHooks = root.eventModel;
  }
})();
