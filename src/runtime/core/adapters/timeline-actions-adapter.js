(() => {

  function toSlug(raw) {
    return String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]+/g, "_")
      .replace(/^_+|_+$/g, "") || "custom";
  }

  function normalizeMinutes(durationMin) {
    const n = parseInt(String(durationMin || ""), 10);
    return Number.isFinite(n) && n > 0 ? n : 30;
  }

  function normalizeTime(raw) {
    const text = String(raw || "").trim();
    if (!text) return "";
    const m = text.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return "";
    const hour = parseInt(m[1], 10);
    const minute = parseInt(m[2], 10);
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return "";
    }
    return String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
  }

  function parseBool(raw) {
    const text = String(raw || "").trim().toLowerCase();
    return text === "true" || text === "yes" || text === "1";
  }

  function parseInlineFields(text) {
    const fields = {};
    String(text || "").replace(/\[([A-Za-z0-9_-]+)::\s*([^\]]*)\]/g, (_, key, value) => {
      fields[String(key || "").trim()] = String(value || "").trim();
      return "";
    });
    return fields;
  }

  function normalizeTimelineTag(raw, fallbackKey) {
    let tag = String(raw || "").trim();
    if (!tag && fallbackKey) tag = "#tl/" + toSlug(fallbackKey);
    if (!tag) tag = "#tl/custom";
    if (!tag.startsWith("#")) tag = "#" + tag.replace(/^#+/, "");
    return tag;
  }

  function inferCrossDay(startTime, durationMin) {
    const t = normalizeTime(startTime);
    if (!t) return false;
    const parts = t.split(":").map((n) => parseInt(n, 10));
    const start = parts[0] * 60 + parts[1];
    return start + normalizeMinutes(durationMin) >= 24 * 60;
  }

  function cleanEventTemplateLabel(body) {
    return String(body || "")
      .replace(/\[(?:default_tag|default_start|default_due|default_duration_min|default_cross_day|duration_min|duration|tag|start)::\s*[^\]]*\]/ig, " ")
      .replace(/#tl\/template\b/ig, " ")
      .replace(/#(?:tl|timeline)\/[^\s#|]+/ig, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeEventTemplate(raw, index) {
    const label = String(raw?.label || raw?.name || "").trim();
    if (!label) return null;
    const timelineTag = normalizeTimelineTag(raw.timelineTag || raw.tag || raw.defaultTag, label);
    const startTime = normalizeTime(raw.startTime || raw.start || raw.defaultStart);
    const durationMin = normalizeMinutes(raw.durationMin || raw.duration || raw.defaultDuration || raw.defaultDurationMin || 30);
    const crossDay = raw.crossDay === true || parseBool(raw.defaultCrossDay) || inferCrossDay(startTime, durationMin);
    return {
      key: String(raw.key || toSlug(timelineTag.replace(/^#(?:tl|timeline)\//i, "")) || toSlug(label) || `event_${index || 0}`),
      label,
      timelineTag,
      startTime,
      durationMin,
      crossDay,
      enabled: raw.enabled !== false
    };
  }

  function parseCanonicalEventLine(line, index) {
    const m = String(line || "").match(/^\s*-\s+\[([ xX])\]\s+(.+)$/);
    if (!m) return null;
    const body = m[2] || "";
    if (!/#tl\/template\b/i.test(body) && !/\[default_tag::/i.test(body)) return null;
    const fields = parseInlineFields(body);
    const label = cleanEventTemplateLabel(body);
    if (!label) return null;
    return normalizeEventTemplate({
      key: fields.default_tag || label,
      label,
      timelineTag: fields.default_tag || fields.tag,
      startTime: fields.default_start || fields.start,
      durationMin: fields.default_duration_min || fields.duration_min || fields.duration,
      defaultCrossDay: fields.default_cross_day,
      enabled: String(m[1] || "").toLowerCase() === "x"
    }, index);
  }

  function parseMarkdownTableRows(text) {
    const rows = [];
    const lines = String(text || "").split(/\r?\n/);
    let header = null;
    let idx = {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) continue;
      const cells = trimmed.slice(1, -1).split("|").map((cell) => cell.trim());
      if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
      const normalized = cells.map((cell) => cell.toLowerCase());
      const nameIndex = normalized.findIndex((cell) => cell === "name" || cell === "名称");
      const startIndex = normalized.findIndex((cell) => cell === "start" || cell === "开始");
      const durationIndex = normalized.findIndex((cell) => cell === "duration" || cell === "时长");
      const tagIndex = normalized.findIndex((cell) => cell === "tag" || cell === "标签");
      if (nameIndex >= 0 && startIndex >= 0 && durationIndex >= 0 && tagIndex >= 0) {
        header = cells;
        idx = { name: nameIndex, start: startIndex, duration: durationIndex, tag: tagIndex };
        continue;
      }
      if (!header) continue;
      const label = cells[idx.name] || "";
      if (!label) continue;
      rows.push(normalizeEventTemplate({
        label,
        timelineTag: cells[idx.tag],
        startTime: cells[idx.start],
        durationMin: cells[idx.duration],
        enabled: true
      }, rows.length));
    }
    return rows.filter(Boolean);
  }

  function parseEventTemplateLibrary(text) {
    const raw = String(text || "");
    const canonical = raw
      .split(/\r?\n/)
      .map((line, index) => parseCanonicalEventLine(line, index))
      .filter(Boolean);
    return canonical.concat(parseMarkdownTableRows(raw));
  }

  function buildEventTemplateLine(templateObj, enabled = true) {
    const normalized = normalizeEventTemplate({
      ...templateObj,
      enabled
    });
    if (!normalized) return "";
    return "- [" + (enabled ? "x" : " ") + "] " + normalized.label
      + " [default_tag:: " + normalized.timelineTag + "]"
      + " [default_start::" + normalized.startTime + "]"
      + " [default_duration_min::" + String(normalized.durationMin) + "]"
      + (normalized.crossDay ? " [default_cross_day:: true]" : "")
      + " #tl/template";
  }

  function addMinutesToTime(timeStr, mins) {
    let mm = moment("2000-01-01 " + String(timeStr || "00:00"), "YYYY-MM-DD HH:mm", true);
    if (!mm.isValid()) mm = moment("2000-01-01 00:00", "YYYY-MM-DD HH:mm", true);
    return mm.add(normalizeMinutes(mins), "minutes").format("HH:mm");
  }

  function getVisibleWeekDates(selectedDate, firstDayOfWeek) {
    const base = moment(selectedDate);
    const first = Number(firstDayOfWeek) || 0;
    const offset = (Number(base.format("d")) - first + 7) % 7;
    const dates = [];
    for (let i=0; i<7; i++) dates.push(base.clone().add(i-offset,"days").format("YYYY-MM-DD"));
    return dates;
  }

  function getPregenDates({ selectedDate, firstDayOfWeek, spanDays, strategy }) {
    const weekDates = getVisibleWeekDates(selectedDate, firstDayOfWeek);
    let span = parseInt(spanDays, 10);
    if (!Number.isFinite(span) || span <= 0) span = weekDates.length || 7;
    if (strategy === 'weekly-all') span = 7;
    if (strategy === 'daily-only') return [moment(selectedDate).format('YYYY-MM-DD')];
    const start = strategy === 'mixed' ? moment(selectedDate).format('YYYY-MM-DD') : weekDates[0] || moment().format("YYYY-MM-DD");
    const out = [];
    for (let i = 0; i < span; i++) {
      out.push(moment(start, "YYYY-MM-DD", true).add(i, "days").format("YYYY-MM-DD"));
    }
    return out;
  }

  function buildTimelineTaskLine(cfg) {
    const label = cfg.label;
    const startDate = cfg.startDate;
    const startTime = cfg.startTime || "";
    const dueDate = cfg.dueDate || startDate;
    const dueTime = cfg.dueTime || "";
    const timelineTag = String(cfg.timelineTag || "").trim() || "#tl/custom";
    if (cfg.timelineDay === true) {
      return "- [ ] " + label + " [schedule:: " + startDate + "] #tl/day";
    }
    const start = startDate + (startTime ? " " + startTime : "");
    const due = dueDate + (dueTime ? " " + dueTime : "");
    return "- [ ] " + label
      + " [schedule:: " + start + (due !== start ? " / " + due : "") + "] "
      + timelineTag;
  }

  const api = {
    toSlug,
    normalizeMinutes,
    addMinutesToTime,
    getVisibleWeekDates,
    getPregenDates,
    buildTimelineTaskLine,
    parseEventTemplateLibrary,
    buildEventTemplateLine,
    normalizeTime,
    normalizeEventTemplate
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    const root = globalThis.dashboardCore || (globalThis.dashboardCore = {});
    root.adapters = root.adapters || {};
    root.adapters.timelineActionsAdapter = api;
  }
})();
