(function () {
  const root = globalThis.noriaTaskTimeline || (globalThis.noriaTaskTimeline = {});

  function normalizePathText(raw) {
    return String(raw || "").replace(/\\/g, "/").replace(/^\/+/, "");
  }

  function valueText(raw, mode) {
    if (raw == null || raw === "") return "";
    if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
      return String(raw).trim();
    }
    if (Array.isArray(raw)) {
      return raw.map((item) => valueText(item, mode)).filter(Boolean).join(" ").trim();
    }
    if (typeof raw === "object") {
      const displayKeys = ["clean", "title", "text", "visual", "display", "name", "raw", "rawLine", "lineText", "value"];
      const rawKeys = ["rawLine", "lineText", "raw", "text", "visual", "title", "clean", "display", "name", "value"];
      const keys = mode === "raw" ? rawKeys : displayKeys;
      for (let i = 0; i < keys.length; i += 1) {
        const text = valueText(raw[keys[i]], mode);
        if (text) return text;
      }
    }
    return "";
  }

  function taskText(task) {
    const candidates = [
      task && task.title,
      task && task.text,
      task && task.rawText,
      task && task.task,
      task && task.visual,
      task && task.rawLine,
      task && task.source && task.source.rawLine
    ];
    for (let i = 0; i < candidates.length; i += 1) {
      const text = valueText(candidates[i], "display");
      if (text) return text;
    }
    return "";
  }

  function taskRawLine(task) {
    const candidates = [
      task && task.rawLine,
      task && task.lineText,
      task && task.source && task.source.rawLine,
      task && task.text,
      task && task.visual,
      task && task.title
    ];
    for (let i = 0; i < candidates.length; i += 1) {
      const text = valueText(candidates[i], "raw");
      if (text) return text;
    }
    return "";
  }

  function extractInlineField(line, key) {
    const re = new RegExp(`\\[\\s*${key}\\s*::\\s*([^\\]]*)\\]`, "i");
    const match = String(line || "").match(re);
    return match && match[1] != null ? String(match[1]).trim() : "";
  }

  function normalizeTimeStr(raw) {
    const match = String(raw == null ? "" : raw).trim().match(/(?:^|[^\d])([01]?\d|2[0-3]):([0-5]\d)(?!\d)/);
    return match ? `${String(match[1]).padStart(2, "0")}:${match[2]}` : "";
  }

  function parseDateTimeValue(raw) {
    if (raw == null || raw === "") return null;
    try {
      if (raw && typeof raw.toISO === "function") {
        const iso = String(raw.toISO() || "");
        const ymd = iso.match(/\d{4}-\d{2}-\d{2}/)?.[0] || "";
        const hhmm = normalizeTimeStr(iso);
        return ymd ? { ymd, hhmm, raw } : null;
      }
      if (raw && typeof raw.toISODate === "function") {
        const ymd = String(raw.toISODate() || "").slice(0, 10);
        return ymd ? { ymd, hhmm: "", raw } : null;
      }
      if (raw && typeof raw.toFormat === "function") {
        const ymd = String(raw.toFormat("yyyy-MM-dd") || "");
        const hhmm = normalizeTimeStr(raw.toFormat("HH:mm"));
        return ymd ? { ymd, hhmm, raw } : null;
      }
    } catch (_) {}
    if (typeof raw === "number" && Number.isFinite(raw)) {
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) return dateToMeta(d, raw);
    }
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) return dateToMeta(raw, raw);
    const text = String(raw || "").trim();
    const ymd = text.match(/(?:^|[^\d])(\d{4}-\d{2}-\d{2})(?!\d)/)?.[1] || "";
    const hhmm = normalizeTimeStr(text);
    if (ymd) return { ymd, hhmm, raw };
    return null;
  }

  function dateToMeta(date, raw) {
    const ymd = [
      String(date.getFullYear()).padStart(4, "0"),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
    const hhmm = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    return { ymd, hhmm, raw };
  }

  function readTaskField(task, key) {
    const line = taskRawLine(task);
    const inline = extractInlineField(line, key);
    if (inline) return inline;
    if (task && task[key] != null && task[key] !== "") return task[key];
    if (task && task.dates && task.dates[key] != null && task.dates[key] !== "") return task.dates[key];
    return "";
  }

  function readDateTimeField(task, key) {
    return parseDateTimeValue(readTaskField(task, key));
  }

  function readDurationMin(task) {
    const inline = extractInlineField(taskRawLine(task), "duration_min");
    const raw =
      inline ||
      (task && (task.duration_min != null ? task.duration_min : task.durationMin != null ? task.durationMin : ""));
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }

  function mergeLegacyTime(task, meta, legacyValue) {
    if (!meta || meta.hhmm) return meta;
    const hhmm = normalizeTimeStr(legacyValue);
    return hhmm ? { ...meta, hhmm } : meta;
  }

  function readStartMeta(task) {
    const meta = readDateTimeField(task, "start");
    const legacy = task && (task.startTime || (task.time && task.time.start) || extractInlineField(taskRawLine(task), "startTime"));
    return mergeLegacyTime(task, meta, legacy);
  }

  function readDueMeta(task) {
    const meta = readDateTimeField(task, "due");
    const legacy = task && (task.dueTime || (task.time && task.time.end) || extractInlineField(taskRawLine(task), "dueTime"));
    return mergeLegacyTime(task, meta, legacy);
  }

  function readScheduledMeta(task) {
    return readDateTimeField(task, "scheduled");
  }

  function readModifiedMeta(task) {
    const candidates = [
      task && task.modified,
      task && task.mtime,
      task && task.fileMtime,
      task && task.file && task.file.mtime,
      task && task.source && task.source.mtime,
      task && task.identity && task.identity.mtime
    ];
    for (const item of candidates) {
      const meta = parseDateTimeValue(item);
      if (meta && meta.ymd) return meta;
    }
    return null;
  }

  function isTimelineControlTask(task) {
    const line = taskRawLine(task);
    return /(^|\s)#tl(?:\/[^\s#]+)?(?=\s|$)/i.test(line);
  }

  function normalizeTimelineTagPlacement(raw) {
    const value = String(raw || "start-due-only").trim().toLowerCase();
    return value === "any-date" ? "any-date" : "start-due-only";
  }

  function primaryYmdForTask(task) {
    const start = readStartMeta(task);
    const due = readDueMeta(task);
    const scheduled = readScheduledMeta(task);
    if (isTimelineControlTask(task)) {
      return (start && start.ymd) || (due && due.ymd) || (scheduled && scheduled.ymd) || "";
    }
    return (due && due.ymd) || (scheduled && scheduled.ymd) || (start && start.ymd) || "";
  }

  function cleanTaskTitle(raw) {
    let out = String(raw || "");
    out = out.replace(/^\s*[-*]\s*\[[^\]]*\]\s*/g, "");
    out = out.replace(/[\uFFFD\uFE0E\uFE0F]/g, " ");
    out = out.replace(/^[\s\uFEFF]*(?:⚠️|⚠|❗|!)+\s*/u, "");
    out = out.replace(/\s*(?:⚠️|⚠|❗|!)+[\s\uFEFF]*$/u, "");
    out = out.replace(/(?:📅|📆|🗓|⏳|⌛|🛫|➕|✅|❌)\s*\d{4}-\d{2}-\d{2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?/gu, " ");
    out = out.replace(/(?:^|\s)(?:🔺|⏫|🔼|🔽|⏬)(?=\s|$)/gu, " ");
    out = out.replace(/(?:🆔|⛔)\s*[^\s#\[\]\n]+/gu, " ");
    out = out.replace(/🔁\s*[^#\[\]\n]+/gu, " ");
    out = out.replace(/\s*\[[a-zA-Z_][a-zA-Z0-9_-]*::\s*[^\]]*\]/g, " ");
    out = out.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2");
    out = out.replace(/\[\[([^\]]+)\]\]/g, (_, p1) => String(p1 || "").split("/").pop());
    out = out.replace(/\s\^[A-Za-z0-9_-]+\s*$/g, " ");
    out = out.replace(/(?:^|\s)[?❓❔]\s*\d{4}-\d{2}-\d{2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?/gu, " ");
    out = out.replace(/(?:^|\s)[?❓❔]\s*(?=(?:[#＃]|\[|\d{4}-\d{2}-\d{2}))/gu, " ");
    out = out.replace(/(?:^|\s)[#＃][^\s#＃]+/g, " ");
    out = out.replace(/(?:^|\s)[?❓❔](?=\s|$)/gu, " ");
    out = out.replace(/\s{2,}/g, " ").trim();
    return out || "Untitled task";
  }

  function taskStatus(task) {
    const status = String(task && task.status != null ? task.status : "").trim().toLowerCase();
    const checkboxState = String(task && task.checkbox && task.checkbox.state || "").trim().toLowerCase();
    const line = taskRawLine(task);
    if (task && (task.completed === true || task.fullyCompleted === true)) return "done";
    if (status === "x" || status === "done" || status === "completed") return "done";
    if (/^\s*[-*]\s*\[[xX]\]/.test(line)) return "done";
    if (status === "-" || status === "cancelled" || status === "canceled") return "cancelled";
    if (checkboxState === "cancelled" || checkboxState === "canceled") return "cancelled";
    if (/^\s*[-*]\s*\[-\]/.test(line)) return "cancelled";
    return "open";
  }

  function taskTags(task) {
    const line = taskRawLine(task);
    const found = line.match(/(^|\s)(#[^\s#]+)/g) || [];
    return found.map((item) => item.trim()).filter(Boolean);
  }

  function taskPath(task) {
    return normalizePathText(
      task && (
        task.path ||
        (task.link && task.link.path) ||
        (task.source && task.source.path) ||
        (task.identity && task.identity.sourcePath)
      )
    );
  }

  function taskLine(task) {
    const n = Number(task && (task.line != null ? task.line : task.identity && task.identity.line));
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  function taskIdentityText(task) {
    const candidates = [
      task && task.id,
      task && task.taskId,
      task && task.blockId,
      task && task.source && task.source.id,
      task && task.source && task.source.taskId,
      task && task.source && task.source.blockId,
      task && task.identity && task.identity.id,
      task && task.identity && task.identity.taskId,
      task && task.identity && task.identity.blockId
    ];
    for (let i = 0; i < candidates.length; i += 1) {
      const text = valueText(candidates[i], "display");
      if (text) return text.replace(/\s+/g, " ").trim();
    }
    return "";
  }

  function taskFingerprint(task) {
    const start = readStartMeta(task);
    const due = readDueMeta(task);
    const scheduled = readScheduledMeta(task);
    const modified = readModifiedMeta(task);
    const raw = taskRawLine(task).replace(/\s+/g, " ").trim();
    const title = cleanTaskTitle(taskText(task) || raw);
    return [
      title,
      raw,
      taskStatus(task),
      taskTags(task).join(" "),
      start && `${start.ymd || ""} ${start.hhmm || ""}`,
      due && `${due.ymd || ""} ${due.hhmm || ""}`,
      scheduled && `${scheduled.ymd || ""} ${scheduled.hhmm || ""}`,
      modified && `${modified.ymd || ""} ${modified.hhmm || ""}`,
      readDurationMin(task) || ""
    ].filter(Boolean).join("|");
  }

  function disambiguateTaskId(base, seen) {
    if (!seen) return base;
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    return count > 0 ? `${base}~${count + 1}` : base;
  }

  function buildTaskId(task, index, seen) {
    const path = taskPath(task);
    const line = taskLine(task);
    if (path && line != null) return disambiguateTaskId(`${path}#${line}`, seen);
    const identity = taskIdentityText(task);
    if (path && identity) return disambiguateTaskId(`${path}#${identity}`, seen);
    if (identity) return disambiguateTaskId(`noria-task-id-${hashText(identity)}`, seen);
    return disambiguateTaskId(`noria-task-${hashText(taskFingerprint(task))}`, seen);
  }

  function hashText(text) {
    let h = 2166136261;
    const s = String(text || "");
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(36);
  }

  function localTimezoneSuffix() {
    const offsetMin = -new Date().getTimezoneOffset();
    if (offsetMin === 0) return "Z";
    const sign = offsetMin >= 0 ? "+" : "-";
    const abs = Math.abs(offsetMin);
    const hh = String(Math.floor(abs / 60)).padStart(2, "0");
    const mm = String(abs % 60).padStart(2, "0");
    return `${sign}${hh}:${mm}`;
  }

  function metaToIso(meta) {
    if (!meta || !meta.ymd) return "";
    return meta.hhmm ? `${meta.ymd}T${meta.hhmm}:00${localTimezoneSuffix()}` : `${meta.ymd}`;
  }

  function metaToUtcMs(meta) {
    if (!meta || !meta.ymd) return NaN;
    const parts = meta.ymd.split("-").map(Number);
    const hm = normalizeTimeStr(meta.hhmm || "00:00").split(":").map(Number);
    return Date.UTC(parts[0], parts[1] - 1, parts[2], hm[0] || 0, hm[1] || 0, 0);
  }

  function utcMsToMeta(ms) {
    const d = new Date(ms);
    const ymd = [
      String(d.getUTCFullYear()).padStart(4, "0"),
      String(d.getUTCMonth() + 1).padStart(2, "0"),
      String(d.getUTCDate()).padStart(2, "0")
    ].join("-");
    const hhmm = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
    return { ymd, hhmm, raw: ms };
  }

  function normalizeEndMeta(start, end) {
    if (!start || !end) return end;
    const startMs = metaToUtcMs(start);
    let endMs = metaToUtcMs(end);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return end;
    if (endMs <= startMs && start.ymd === end.ymd && start.hhmm && end.hhmm) {
      endMs += 24 * 60 * 60 * 1000;
      return utcMsToMeta(endMs);
    }
    return end;
  }

  function formatMetaDateTime(meta) {
    if (!meta || !meta.ymd) return "";
    return meta.hhmm ? `${meta.ymd} ${meta.hhmm}` : meta.ymd;
  }

  function formatTaskTimeLabel(meta) {
    const startText = formatMetaDateTime(meta.start);
    const endText = formatMetaDateTime(meta.end);
    if (startText && endText) return `${startText} - ${endText}`;
    if (!startText) return "";
    if (meta.kind === "due") return `Due ${startText}`;
    if (meta.kind === "scheduled") return `Scheduled ${startText}`;
    if (meta.kind === "start") return `Start ${startText}`;
    if (meta.kind === "fallback") {
      const label = meta.fallbackDateSource === "modified" ? "Modified" : "Placed";
      return `${label} ${startText}`;
    }
    return startText;
  }

  function describeTask(task, meta) {
    const rows = [];
    if (meta.title) rows.push(`Title: ${meta.title}`);
    const time = formatTaskTimeLabel(meta);
    if (time) rows.push(`Time: ${time}`);
    if (meta.status && meta.status !== "open") rows.push(`Status: ${meta.status}`);
    if (Array.isArray(meta.tags) && meta.tags.length) rows.push(`Tags: ${meta.tags.join(" ")}`);
    if (meta.path) rows.push(`Source: ${meta.path}${meta.line != null ? `:${meta.line + 1}` : ""}`);
    if (meta.fallbackDateSource) rows.push(`Placed by: ${meta.fallbackDateSource}`);
    return rows.join("\n");
  }

  function escapeHtmlText(raw) {
    return String(raw == null ? "" : raw)
      .replace(/&/g, "&#38;")
      .replace(/</g, "&#60;")
      .replace(/>/g, "&#62;")
      .replace(/"/g, "&#34;")
      .replace(/'/g, "&#39;");
  }

  function htmlAttr(name, value) {
    if (value == null || value === "") return "";
    return ` ${name}="${escapeHtmlText(value)}"`;
  }

  function bubbleActionKind(action) {
    if (action === "open-note") return "open-task-source";
    if (action === "edit-time") return "edit-task-time";
    if (action === "toggle-done") return "toggle-task-done";
    return action || "task-action";
  }

  function bubbleButton(action, meta, text) {
    const id = meta && meta.id || "";
    const path = meta && meta.path || "";
    const line = meta && meta.line != null ? String(meta.line) : "";
    return [
      `<button type="button" class="noria-task-timeline-bubble-action"`,
      htmlAttr("data-noria-task-timeline-action", action),
      htmlAttr("data-noria-task-id", id),
      htmlAttr("data-noria-action-source", "task-timeline-bubble"),
      htmlAttr("data-noria-action-kind", bubbleActionKind(action)),
      htmlAttr("data-noria-action-target-path", path),
      htmlAttr("data-noria-action-target-line", line),
      `>${escapeHtmlText(text)}</button>`
    ].join("");
  }

  function buildBubbleDescription(task, meta) {
    const id = meta.id || "";
    const rows = [];
    if (meta.title) {
      rows.push(`<div class="noria-task-timeline-bubble-row"><span class="noria-task-timeline-bubble-k">Title</span><span class="noria-task-timeline-bubble-v">${escapeHtmlText(meta.title)}</span></div>`);
    }
    const time = formatTaskTimeLabel(meta);
    if (time) {
      rows.push(`<div class="noria-task-timeline-bubble-row"><span class="noria-task-timeline-bubble-k">Time</span><span class="noria-task-timeline-bubble-v">${escapeHtmlText(time)}</span></div>`);
    }
    if (meta.path) {
      rows.push(`<div class="noria-task-timeline-bubble-row"><span class="noria-task-timeline-bubble-k">Source</span><span class="noria-task-timeline-bubble-v">${escapeHtmlText(meta.path)}${meta.line != null ? `:${meta.line + 1}` : ""}</span></div>`);
    }
    if (meta.status) {
      rows.push(`<div class="noria-task-timeline-bubble-row"><span class="noria-task-timeline-bubble-k">Status</span><span class="noria-task-timeline-bubble-v">${escapeHtmlText(meta.status)}</span></div>`);
    }
    if (meta.tags && meta.tags.length) {
      rows.push(`<div class="noria-task-timeline-bubble-row"><span class="noria-task-timeline-bubble-k">Tags</span><span class="noria-task-timeline-bubble-v">${escapeHtmlText(meta.tags.join(" "))}</span></div>`);
    }
    if (meta.fallbackDateSource) {
      rows.push(`<div class="noria-task-timeline-bubble-row"><span class="noria-task-timeline-bubble-k">Placed by</span><span class="noria-task-timeline-bubble-v">${escapeHtmlText(meta.fallbackDateSource)}</span></div>`);
    }
    return [
      `<div class="noria-task-timeline-bubble" data-noria-task-id="${escapeHtmlText(id)}">`,
      rows.join(""),
      `<div class="noria-task-timeline-bubble-actions">`,
      bubbleButton("open-note", meta, "Open"),
      bubbleButton("edit-time", meta, "Edit time"),
      bubbleButton("toggle-done", meta, meta.status === "done" ? "Reopen" : "Done"),
      `</div>`,
      `</div>`
    ].join("");
  }

  function buildEvent(task, index, options, seenTaskIds) {
    const start = readStartMeta(task);
    const due = readDueMeta(task);
    const scheduled = readScheduledMeta(task);
    const modified = readModifiedMeta(task);
    const durationMin = readDurationMin(task);
    const title = cleanTaskTitle(taskText(task) || taskRawLine(task));
    const status = taskStatus(task);
    const path = taskPath(task);
    const line = taskLine(task);
    const tags = taskTags(task);
    const id = buildTaskId(task, index, seenTaskIds);
    const taskKey = id;
    const timelineControlTask = isTimelineControlTask(task);
    const timelineTagPlacement = normalizeTimelineTagPlacement(options && options.timelineTagPlacement);
    const strictTimelineTagPlacement = timelineControlTask && timelineTagPlacement === "start-due-only";
    let eventStart = null;
    let eventEnd = null;
    let kind = "";
    let fallbackDateSource = "";

    if (start && start.ymd) {
      eventStart = start;
      if (due && due.ymd) {
        eventEnd = normalizeEndMeta(start, due);
        kind = eventEnd && metaToUtcMs(eventEnd) > metaToUtcMs(eventStart) ? "duration" : "start";
      } else if (durationMin && start.hhmm) {
        eventEnd = utcMsToMeta(metaToUtcMs(start) + durationMin * 60 * 1000);
        kind = "duration";
      } else {
        kind = "start";
      }
    } else if (due && due.ymd) {
      eventStart = due;
      kind = "due";
    } else if (!strictTimelineTagPlacement && scheduled && scheduled.ymd) {
      eventStart = scheduled;
      kind = "scheduled";
    } else if (!strictTimelineTagPlacement && modified && modified.ymd) {
      eventStart = modified;
      kind = "fallback";
      fallbackDateSource = "modified";
    }

    if (!eventStart || !eventStart.ymd) {
      return {
        event: null,
        unplaced: {
          task,
          reason: strictTimelineTagPlacement ? "timeline-tag-missing-start-or-due" : "missing-date-and-modified-time",
          id,
          title
        }
      };
    }

    const isDuration = kind === "duration" && eventEnd && eventEnd.ymd && metaToUtcMs(eventEnd) > metaToUtcMs(eventStart);
    const classes = [
      "noria-task-timeline-task",
      `noria-task-timeline-task--${kind}`,
      `noria-task-timeline-task--${status}`
    ];
    if (fallbackDateSource) classes.push("noria-task-timeline-task--fallback-date", "noria-task-timeline-task--no-explicit-date");
    if (!eventStart.hhmm) classes.push("noria-task-timeline-task--date-only");
    if (isDuration) classes.push("noria-task-timeline-task--duration");
    else classes.push("noria-task-timeline-task--instant");

    const noria = {
      task,
      id,
      taskKey,
      kind,
      status,
      path,
      line,
      tags,
      primaryYmd: primaryYmdForTask(task) || eventStart.ymd,
      fallbackDateSource,
      startYmd: eventStart.ymd,
      startTime: eventStart.hhmm || "",
      endYmd: isDuration ? eventEnd.ymd : "",
      endTime: isDuration ? eventEnd.hhmm || "" : "",
      durationMin: isDuration ? Math.max(1, Math.round((metaToUtcMs(eventEnd) - metaToUtcMs(eventStart)) / 60000)) : null
    };
    const meta = {
      id,
      title,
      kind,
      start: eventStart,
      end: isDuration ? eventEnd : null,
      path,
      line,
      status,
      tags,
      fallbackDateSource
    };

    return {
      event: {
        id,
        layer: "task",
        provider: "tasks",
        kind,
        title,
        start: metaToIso(eventStart),
        ...(isDuration ? { end: metaToIso(eventEnd) } : {}),
        isInstant: !isDuration,
        status,
        source: { type: "markdown", path, line },
        tags,
        payload: { task, taskKey, noria },
        presentation: {
          eventID: id,
          // The event model treats durationEvent=false as an instant event.
          durationEvent: isDuration,
          hoverText: describeTask(task, meta),
          description: buildBubbleDescription(task, meta),
          classname: classes.join(" ")
        }
      },
      unplaced: null
    };
  }

  function sortTimelineEvents(events) {
    events.sort((a, b) => {
      const am = metaToUtcMs(parseDateTimeValue(a.start));
      const bm = metaToUtcMs(parseDateTimeValue(b.start));
      if (Number.isFinite(am) && Number.isFinite(bm) && am !== bm) return am - bm;
      return String(a.title || "").localeCompare(String(b.title || ""));
    });
    return events;
  }

  function tasksToTimelineEvents(tasks, options = {}) {
    const items = Array.isArray(tasks) ? tasks : Array.from(tasks || []);
    const events = [];
    const unplaced = [];
    const seenTaskIds = new Map();
    for (let i = 0; i < items.length; i += 1) {
      const built = buildEvent(items[i], i, options, seenTaskIds);
      if (built.event) events.push(built.event);
      if (built.unplaced) unplaced.push(built.unplaced);
    }
    return {
      dateTimeFormat: "iso8601",
      events: sortTimelineEvents(events),
      unplaced
    };
  }

  function fallbackTimelineEventsToJson(events, options = {}) {
    const out = sortTimelineEvents((Array.isArray(events) ? events : Array.from(events || [])).slice()).map((event) => {
      const presentation = event.presentation || {};
      const noria = event.payload && event.payload.noria ? { ...event.payload.noria } : {};
      noria.layer = event.layer || "task";
      noria.provider = event.provider || "tasks";
      noria.kind = noria.kind || event.kind || "";
      noria.status = noria.status || event.status || "";
      noria.source = event.source || {};
      noria.tags = event.tags || [];
      return {
        id: event.id,
        eventID: presentation.eventID || event.id,
        start: event.start,
        ...(event.isInstant ? { durationEvent: false } : { end: event.end, durationEvent: true }),
        title: event.title,
        hoverText: presentation.hoverText,
        description: presentation.description,
        classname: presentation.classname || "",
        noria
      };
    });
    return {
      dateTimeFormat: "iso8601",
      events: out,
      unplaced: Array.isArray(options.unplaced) ? options.unplaced : []
    };
  }

  function tasksToTimelineJson(tasks, options = {}) {
    const timeline = tasksToTimelineEvents(tasks, options);
    const eventModel = root.eventModel;
    if (eventModel && typeof eventModel.timelineEventsToJson === "function") {
      return eventModel.timelineEventsToJson(timeline.events, { unplaced: timeline.unplaced });
    }
    return fallbackTimelineEventsToJson(timeline.events, { unplaced: timeline.unplaced });
  }

  root.taskAdapter = {
    tasksToTimelineJson,
    tasksToTimelineEvents,
    primaryYmdForTask,
    cleanTaskTitle,
    buildBubbleDescription,
    readStartMeta,
    readDueMeta,
    readScheduledMeta,
    readModifiedMeta
  };

  if (globalThis.__NORIA_TASK_TIMELINE_TEST__) {
    globalThis.__noriaTaskTimelineTaskAdapterTestHooks = root.taskAdapter;
  }
})();
