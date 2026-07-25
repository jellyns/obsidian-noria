(function () {
  const root = globalThis.noriaTaskTimeline || (globalThis.noriaTaskTimeline = {});

  function text(raw) {
    return String(raw == null ? "" : raw).trim();
  }

  function asArray(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw.items)) return raw.items;
    if (Array.isArray(raw.annotations)) return raw.annotations;
    if (typeof raw[Symbol.iterator] === "function") {
      try { return Array.from(raw); } catch (_) {}
    }
    return [];
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

  function normalizeTags(raw) {
    if (raw == null || raw === "") return [];
    return (Array.isArray(raw) ? raw : String(raw).split(/\s+/))
      .map((item) => text(item))
      .filter(Boolean);
  }

  function normalizeOpacity(raw, fallback) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(8, Math.min(70, Math.round(n)));
  }

  function normalizeAnnotation(annotation, index) {
    const source = annotation && typeof annotation === "object" ? annotation : {};
    const start = text(source.start || source.date || source.time);
    if (!start) return null;
    const end = text(source.end || source.until);
    const kind = text(source.type || source.kind || (end ? "span" : "point")).toLowerCase() === "point" ? "point" : "span";
    const title = text(source.title || source.label || source.name || (kind === "span" ? "Annotation" : "Marker"));
    const id = text(source.id) || `annotation-${index}-${hashText(`${title}|${start}|${end}`)}`;
    const isInstant = kind === "point" || !end;
    const opacity = normalizeOpacity(source.opacity, isInstant ? 55 : 34);
    const description = text(source.description || source.note || "");
    return {
      id,
      layer: "annotation",
      provider: "annotations",
      kind: isInstant ? "point" : "span",
      title,
      start,
      ...(isInstant ? {} : { end }),
      isInstant,
      color: text(source.color) || "#f6c77a",
      opacity,
      source: { type: "noria" },
      tags: normalizeTags(source.tags),
      payload: { annotation: { ...source, id, type: isInstant ? "point" : "span", opacity, description } },
      presentation: {
        classname: `noria-task-timeline-annotation noria-task-timeline-annotation--${isInstant ? "point" : "span"}`,
        hoverText: description || title
      }
    };
  }

  function annotationsToTimelineEvents(annotations) {
    const events = asArray(annotations)
      .map((annotation, index) => normalizeAnnotation(annotation, index))
      .filter(Boolean);
    return { events, unplaced: [] };
  }

  root.annotationProvider = {
    annotationsToTimelineEvents,
    normalizeAnnotation
  };

  if (globalThis.__NORIA_TASK_TIMELINE_TEST__) {
    globalThis.__noriaTaskTimelineAnnotationProviderTestHooks = root.annotationProvider;
  }
})();
