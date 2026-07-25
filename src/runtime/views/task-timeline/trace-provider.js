(function () {
  const root = globalThis.noriaTaskTimeline || (globalThis.noriaTaskTimeline = {});
  const TRACE_BURST_WINDOW_MS = 45 * 60 * 1000;
  const TRACE_BURST_MIN_COUNT = 2;

  function text(raw) {
    return String(raw == null ? "" : raw).trim();
  }

  function asArray(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw.items)) return raw.items;
    if (Array.isArray(raw.events)) return raw.events;
    if (Array.isArray(raw.rows)) return raw.rows;
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

  function dateMs(raw) {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? NaN : date.getTime();
  }

  function normalizePath(raw) {
    return text(raw).replace(/\\/g, "/").replace(/^\/+/, "");
  }

  function normalizeTags(raw, base) {
    const tags = [];
    if (base) tags.push(base);
    const items = Array.isArray(raw) ? raw : String(raw || "").split(/[\s,]+/);
    items.map((item) => text(item)).filter(Boolean).forEach((tag) => {
      if (!tags.includes(tag)) tags.push(tag);
    });
    return tags;
  }

  function basename(path) {
    const clean = normalizePath(path);
    return clean.split("/").filter(Boolean).pop() || clean || "Note";
  }

  function noteDisplayTitle(note) {
    return text(note.title || note.name || note.basename) || basename(note.path || note.file && note.file.path);
  }

  function noteDate(note, kind) {
    if (kind === "created") return text(note.created || note.ctime || note.birthtime || note.file && note.file.ctime);
    return text(note.modified || note.updated || note.mtime || note.file && note.file.mtime);
  }

  function noteEvent(note, kind, index) {
    const start = noteDate(note, kind);
    if (!start) return null;
    const path = normalizePath(note.path || note.sourcePath || note.file && note.file.path);
    const title = `${kind === "created" ? "Created" : "Modified"}: ${noteDisplayTitle({ ...note, path })}`;
    return {
      id: `note-${kind}-${index}-${hashText(`${path}|${start}`)}`,
      layer: "note",
      provider: "traces",
      kind,
      title,
      start,
      isInstant: true,
      status: text(note.status),
      color: kind === "created" ? "#0ea5e9" : "#64748b",
      source: { type: "filesystem", ...(path ? { path } : {}) },
      tags: normalizeTags(note.tags, "#note"),
      payload: { note: { ...note, path } },
      presentation: {
        classname: `noria-task-timeline-note noria-task-timeline-note--${kind}`,
        hoverText: [`Title: ${title}`, `Time: ${start}`, path ? `Source: ${path}` : "", `Kind: ${kind}`].filter(Boolean).join("\n")
      }
    };
  }

  function noteTracesToEvents(notes) {
    const events = [];
    asArray(notes).forEach((note, index) => {
      const source = note && typeof note === "object" ? note : {};
      const created = noteEvent(source, "created", index);
      const modified = noteEvent(source, "modified", index);
      if (created) events.push(created);
      if (modified && (!created || dateMs(modified.start) !== dateMs(created.start))) events.push(modified);
    });
    return events;
  }

  function gitCommitDate(commit) {
    return text(commit.date || commit.time || commit.authorDate || commit.committedAt || commit.timestamp);
  }

  function gitCommitEvent(commit, index) {
    const source = commit && typeof commit === "object" ? commit : {};
    const start = gitCommitDate(source);
    if (!start) return null;
    const hash = text(source.hash || source.commit || source.sha || source.id);
    const title = text(source.subject || source.title || source.message) || (hash ? `Commit ${hash.slice(0, 7)}` : "Git commit");
    return {
      id: `git-commit-${index}-${hashText(`${hash}|${start}|${title}`)}`,
      layer: "git",
      provider: "traces",
      kind: "commit",
      title,
      start,
      isInstant: true,
      status: text(source.status),
      color: "#8b5cf6",
      source: { type: "git", ...(hash ? { hash } : {}), ...(source.repo ? { repo: text(source.repo) } : {}) },
      tags: normalizeTags(source.tags, "#git"),
      payload: { git: { ...source, hash } },
      presentation: {
        classname: "noria-task-timeline-git noria-task-timeline-git--commit",
        hoverText: [`Title: ${title}`, `Time: ${start}`, hash ? `Commit: ${hash}` : "", source.repo ? `Repo: ${source.repo}` : ""].filter(Boolean).join("\n")
      }
    };
  }

  function gitTracesToEvents(git) {
    const commits = Array.isArray(git)
      ? git
      : asArray(git && (git.commits || git.items || git.evidence && git.evidence.commits));
    return commits.map((commit, index) => gitCommitEvent(commit, index)).filter(Boolean);
  }

  function noriaCacheTime(item) {
    return text(item.time || item.exportedAt || item.created || item.modified || item.mtime || item.timestamp);
  }

  function noriaCacheEvent(item, index) {
    const source = item && typeof item === "object" ? item : {};
    const start = noriaCacheTime(source);
    if (!start) return null;
    const path = normalizePath(source.path || source.sourcePath || source.cachePath);
    const kind = text(source.kind || source.type) || "cache";
    const mode = text(source.mode);
    const period = text(source.period || source.date);
    const title = text(source.title) || (kind === "review-evidence"
      ? `Review evidence${mode ? `: ${mode}` : ""}${period ? ` ${period}` : ""}`
      : "Noria cache");
    const artifactPath = normalizePath(source.artifactPath || source.artifact || source.reviewPath);
    return {
      id: `noria-cache-${index}-${hashText(`${path}|${start}|${title}`)}`,
      layer: "noria",
      provider: "traces",
      kind,
      title,
      start,
      isInstant: true,
      status: text(source.status),
      color: "#14b8a6",
      source: { type: "noria-cache", ...(path ? { path } : {}) },
      tags: normalizeTags(source.tags, "#noria-cache"),
      payload: { noria: { ...source, path, artifactPath } },
      presentation: {
        classname: `noria-task-timeline-noria noria-task-timeline-noria-cache noria-task-timeline-noria--${kind}`,
        hoverText: [
          `Title: ${title}`,
          `Time: ${start}`,
          path ? `Cache: ${path}` : "",
          artifactPath ? `Artifact: ${artifactPath}` : "",
          source.evidenceHash ? `Evidence: ${source.evidenceHash}` : ""
        ].filter(Boolean).join("\n")
      }
    };
  }

  function noriaCacheTracesToEvents(cache) {
    const events = Array.isArray(cache)
      ? cache
      : asArray(cache && (cache.events || cache.items || cache.noria || cache.reviewEvidence));
    return events.map((event, index) => noriaCacheEvent(event, index)).filter(Boolean);
  }

  function sortEvents(events) {
    return events.sort((a, b) => {
      const am = dateMs(a.start);
      const bm = dateMs(b.start);
      if (Number.isFinite(am) && Number.isFinite(bm) && am !== bm) return am - bm;
      return String(a.title || "").localeCompare(String(b.title || ""));
    });
  }

  function traceEventBurstEligible(event) {
    const layer = text(event && event.layer);
    const kind = text(event && event.kind);
    return (layer === "note" && (kind === "created" || kind === "modified")) ||
      (layer === "git" && kind === "commit");
  }

  function traceEventKey(event) {
    return `${text(event && event.layer)}|${text(event && event.kind)}`;
  }

  function unique(items) {
    const out = [];
    asArray(items).forEach((item) => {
      const value = text(item);
      if (value && !out.includes(value)) out.push(value);
    });
    return out;
  }

  function traceBurstTitle(layer, kind, count) {
    if (layer === "note" && kind === "created") return `${count} note creations`;
    if (layer === "note" && kind === "modified") return `${count} note modifications`;
    if (layer === "git" && kind === "commit") return `${count} Git commits`;
    return `${count} trace events`;
  }

  function traceEventSummary(event) {
    const source = event && typeof event.source === "object" ? event.source : {};
    return {
      id: text(event.id),
      layer: text(event.layer),
      kind: text(event.kind),
      title: text(event.title),
      start: text(event.start),
      ...(source.path ? { path: text(source.path) } : {}),
      ...(source.hash ? { hash: text(source.hash) } : {})
    };
  }

  function traceBurstEvent(group) {
    const events = asArray(group).filter(Boolean);
    if (events.length < TRACE_BURST_MIN_COUNT) return null;
    const first = events[0];
    const last = events[events.length - 1];
    const layer = text(first.layer);
    const originalKind = text(first.kind);
    const kind = `${originalKind}-burst`;
    const start = text(first.start);
    const lastStart = text(last.start);
    const startMs = dateMs(start);
    const endMs = dateMs(lastStart);
    const end = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs ? lastStart : "";
    const paths = unique(events.map((event) => event?.source?.path || event?.payload?.note?.path));
    const hashes = unique(events.map((event) => event?.source?.hash || event?.payload?.git?.hash));
    const title = traceBurstTitle(layer, originalKind, events.length);
    const sampleLines = events.slice(0, 5).map((event) => `- ${text(event.title)}${event?.source?.path ? ` (${event.source.path})` : ""}`);
    const hiddenCount = Math.max(0, events.length - sampleLines.length);
    return {
      id: `trace-burst-${layer}-${originalKind}-${hashText(events.map((event) => `${event.id}|${event.start}`).join("|"))}`,
      layer,
      provider: "traces",
      kind,
      title,
      start,
      ...(end ? { end } : {}),
      isInstant: !end,
      status: text(first.status),
      color: first.color,
      source: {
        type: `${layer}-trace-burst`,
        ...(paths.length ? { path: paths[0], paths } : {}),
        ...(hashes.length ? { hash: hashes[0], hashes } : {})
      },
      tags: normalizeTags(["#trace-burst"], layer === "git" ? "#git" : "#note"),
      payload: {
        burst: {
          layer,
          kind: originalKind,
          count: events.length,
          start,
          end: end || start,
          paths,
          hashes,
          events: events.map(traceEventSummary)
        }
      },
      presentation: {
        classname: `noria-task-timeline-${layer} noria-task-timeline-${layer}--${kind} noria-task-timeline-trace-burst`,
        hoverText: [
          title,
          `Window: ${start}${end ? ` -> ${end}` : ""}`,
          ...sampleLines,
          hiddenCount ? `+ ${hiddenCount} more` : ""
        ].filter(Boolean).join("\n")
      }
    };
  }

  function aggregateTraceBursts(events, options = {}) {
    const windowMs = Number(options.windowMs || TRACE_BURST_WINDOW_MS);
    const minCount = Number(options.minCount || TRACE_BURST_MIN_COUNT);
    const sorted = sortEvents(asArray(events).slice());
    const out = [];
    let group = [];
    const flush = () => {
      if (!group.length) return;
      if (group.length >= minCount) {
        const burst = traceBurstEvent(group);
        if (burst) out.push(burst);
        else out.push(...group);
      } else {
        out.push(...group);
      }
      group = [];
    };
    sorted.forEach((event) => {
      const ms = dateMs(event && event.start);
      if (!traceEventBurstEligible(event) || !Number.isFinite(ms)) {
        flush();
        out.push(event);
        return;
      }
      const previous = group[group.length - 1];
      const previousMs = dateMs(previous && previous.start);
      const sameGroup = previous &&
        traceEventKey(previous) === traceEventKey(event) &&
        Number.isFinite(previousMs) &&
        ms - previousMs <= windowMs;
      if (!group.length || sameGroup) {
        group.push(event);
        return;
      }
      flush();
      group.push(event);
    });
    flush();
    return out;
  }

  function timelineTracesToEvents(traces) {
    const source = traces && typeof traces === "object" ? traces : {};
    const events = [
      ...noteTracesToEvents(source.notes || source.noteTraces),
      ...gitTracesToEvents(source.git || source.commits || source.gitCommits),
      ...noriaCacheTracesToEvents(source.cache || source.noria || source.noriaCache)
    ];
    return { dateTimeFormat: "iso8601", events: sortEvents(aggregateTraceBursts(events)), unplaced: [] };
  }

  root.traceProvider = {
    timelineTracesToEvents,
    noteTracesToEvents,
    gitTracesToEvents,
    noriaCacheTracesToEvents,
    aggregateTraceBursts
  };

  if (globalThis.__NORIA_TASK_TIMELINE_TEST__) {
    globalThis.__noriaTaskTimelineTraceProviderTestHooks = root.traceProvider;
  }
})();
