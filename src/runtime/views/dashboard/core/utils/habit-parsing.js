(() => {
  const root = globalThis.dashboardCore || (globalThis.dashboardCore = {});
  root.utils = root.utils || {};

  const SECTION_ALIASES = [
    ["打卡中的习惯", "Active habits"],
    ["暂停的习惯", "Paused habits"],
    ["已养成习惯", "Established habits"],
    ["循环任务源（每日）", "Daily recurring task source"]
  ];

  function sectionBlock(content, title) {
    const source = String(content || "");
    const raw = String(title || "").trim();
    const aliases = SECTION_ALIASES.find((group) => group.includes(raw)) || [raw];
    for (const candidate of aliases) {
      const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const block = (source.match(new RegExp(`##\\s*${escaped}[\\s\\S]*?(?=\\n##\\s|$)`)) || [])[0] || "";
      if (block) return block;
    }
    return "";
  }

  function getSectionItems(content, title) {
    const block = sectionBlock(content, title);
    return [
      ...new Set(
        block
          .split("\n")
          .map((x) => x.trim())
          .filter((x) => /^-\s+/.test(x))
          .map((x) => x.replace(/^-+\s*/, "").trim())
          .filter((x) => x && x !== "（空）" && !/^\(?\s*empty\s*\)?$/i.test(x))
      )
    ];
  }

  function getSectionTaskEntries(content, title) {
    const block = sectionBlock(content, title);
    return block
      .split("\n")
      .map((x) => x.trim())
      .filter((x) => /^-\s+\[[ xX]\]\s+/.test(x))
      .map((x) => ({ completed: /^-\s+\[[xX]\]\s+/.test(x), text: x.replace(/^-\s+\[[ xX]\]\s+/, "").trim() }))
      .filter((x) => !!x.text);
  }

  function normalizeHabit(text) {
    return String(text || "")
      .replace(/#habit-active\b/gi, "")
      .replace(/#habit-paused\b/gi, "")
      .replace(/#habit-done\b/gi, "")
      .replace(/#active\b/gi, "")
      .replace(/#paused\b/gi, "")
      .replace(/#done\b/gi, "")
      .replace(/#habit\b/gi, "")
      .replace(/#[一-龥\w/-]+/g, "")
      .replace(/(?:📅|⏳|🛫|✅)\s*\d{4}-\d{2}-\d{2}/g, "")
      .replace(/🔁\s*[^#\[\]\n]+/g, "")
      .replace(/\[[a-zA-Z_][a-zA-Z0-9_-]*::\s*[^\]]*\]/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function migrateHabitStatusTags(text) {
    return String(text || "")
      .split("\n")
      .map((line) => {
        const seen = new Set();
        return String(line || "")
          .replace(/#habit-active\b/gi, "#habit #active")
          .replace(/#habit-paused\b/gi, "#habit #paused")
          .replace(/#habit-done\b/gi, "#habit #paused #done")
          .replace(/(^|[ \t]+)(#(?:habit|active|paused|done))\b/gi, (_, gap, tag) => {
            const key = String(tag || "").toLowerCase();
            if (seen.has(key)) return "";
            seen.add(key);
            return `${gap}${key}`;
          })
          .replace(/[ \t]{2,}/g, " ")
          .trimEnd();
      })
      .join("\n");
  }

  function extractInlineField(text, key) {
    const re = new RegExp(`\\[${key}::\\s*([^\\]]*)\\]`, "i");
    const m = String(text || "").match(re);
    return m ? String(m[1] || "").trim() : "";
  }

  function parseInlineFields(text) {
    const fields = {};
    String(text || "").replace(/\[([a-zA-Z_][a-zA-Z0-9_-]*)::\s*([^\]]*)\]/g, (_, key, value) => {
      fields[String(key || "").trim()] = String(value || "").trim();
      return "";
    });
    return fields;
  }

  function parseHabitMeta(text) {
    const fields = parseInlineFields(text);
    const out = {};
    ["type", "target", "value", "unit"].forEach((key) => {
      if (fields[key] != null && String(fields[key]).trim() !== "") out[key] = String(fields[key]).trim();
    });
    return out;
  }

  function inferLegacyHabitConfig(text) {
    const name = normalizeHabit(text);
    const meta = parseHabitMeta(text);
    if (meta.type || meta.target || meta.unit) return { name, ...meta };

    let m = name.match(/^喝\s*(\d+(?:\.\d+)?)\s*杯水$/);
    if (m) return { name: "喝水", type: "number", target: m[1], unit: "杯" };

    m = name.match(/^运动\s*(\d+(?:\.\d+)?)\s*(大卡|千卡|kcal|卡)$/i);
    if (m) return { name: "运动", type: "number", target: m[1], unit: m[2] };

    if (/睡/.test(name) && /12[:：]30/.test(name)) return { name, type: "sleep", target: "00:30" };

    return { name, ...meta };
  }

  function serializeHabitConfig(config) {
    const name = normalizeHabit(config?.name || config?.text || "");
    if (!name) return "";
    const parts = [name];
    const type = String(config?.type || "").trim();
    const target = String(config?.target || "").trim() || (type === "sleep" ? "00:30" : "");
    const unit = String(config?.unit || "").trim();
    if (type) parts.push(`[type:: ${type}]`);
    if (target) parts.push(`[target:: ${target}]`);
    if (unit) parts.push(`[unit:: ${unit}]`);
    return parts.join(" ");
  }

  function canonicalHabitName(text) {
    return inferLegacyHabitConfig(text).name || normalizeHabit(text);
  }

  function formatHabitTodayLabel(config, record) {
    const cfg = config || {};
    const name = normalizeHabit(cfg.name || cfg.text || "");
    if (!name) return "";
    const type = String(record?.type || cfg.type || "").trim();
    const value = record?.value != null ? String(record.value).trim() : "";
    const target = cfg.target != null ? String(cfg.target).trim() : "";
    const unit = String(record?.unit || cfg.unit || "").trim();
    if (type === "number") {
      const amount = value || target;
      if (amount) return `${name}${amount}${unit}`;
    }
    return name;
  }

  function extractTaskDate(text) {
    const s = String(text || "");
    const pick = (re) => {
      const m = s.match(re);
      return m ? m[1] : "";
    };
    return pick(/\[due::\s*(\d{4}-\d{2}-\d{2})\]/i)
      || pick(/[📅📆🗓]\s*(\d{4}-\d{2}-\d{2})/)
      || pick(/\[scheduled::\s*(\d{4}-\d{2}-\d{2})\]/i)
      || pick(/[⏳⌛]\s*(\d{4}-\d{2}-\d{2})/)
      || pick(/\[start::\s*(\d{4}-\d{2}-\d{2})\]/i)
      || pick(/🛫\s*(\d{4}-\d{2}-\d{2})/)
      || pick(/\[completion::\s*(\d{4}-\d{2}-\d{2})\]/i)
      || pick(/\[done::\s*(\d{4}-\d{2}-\d{2})\]/i)
      || pick(/✅\s*(\d{4}-\d{2}-\d{2})/);
  }

  function toDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function previousDateStr(dateStr) {
    const m = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return "";
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    d.setDate(d.getDate() - 1);
    return toDateStr(d);
  }

  function parseDateTimeParts(value) {
    const m = String(value || "").trim().match(/^(\d{4}-\d{2}-\d{2})(?:[ T]+(\d{1,2}):(\d{2}))?/);
    if (!m) return null;
    return {
      date: m[1],
      hour: m[2] == null ? null : Number(m[2]),
      minute: m[3] == null ? null : Number(m[3])
    };
  }

  function getSleepHabitDate(startValue) {
    const p = parseDateTimeParts(startValue);
    if (!p || p.hour == null || p.minute == null) return "";
    const minutes = p.hour * 60 + p.minute;
    if (minutes >= 18 * 60) return p.date;
    if (minutes <= 12 * 60) return previousDateStr(p.date);
    return "";
  }

  function normalizeClockValue(value) {
    const m = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return "";
    const h = Math.max(0, Math.min(23, Number(m[1])));
    const mm = Math.max(0, Math.min(59, Number(m[2])));
    return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }

  function eveningMinutes(clock) {
    const t = normalizeClockValue(clock);
    if (!t) return null;
    const [h, m] = t.split(":").map(Number);
    const minutes = h * 60 + m;
    return minutes <= 12 * 60 ? minutes + 24 * 60 : minutes;
  }

  function clockMinutes(clock) {
    const t = normalizeClockValue(clock);
    if (!t) return null;
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  }

  function isSleepBeforeTarget(value, target) {
    const actual = eveningMinutes(value);
    const limit = eveningMinutes(target || "00:30");
    if (actual == null || limit == null) return false;
    return actual <= limit;
  }

  function minutesBetween(startClock, endClock) {
    const start = eveningMinutes(startClock);
    const endRaw = eveningMinutes(endClock);
    if (start == null || endRaw == null) return 0;
    let end = endRaw;
    if (end <= start) end += 24 * 60;
    return Math.max(0, end - start);
  }

  function addDays(dateStr, days) {
    const m = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return "";
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    d.setDate(d.getDate() + Number(days || 0));
    return toDateStr(d);
  }

  function buildSleepTimelineLine({ date, start = "23:30", end = "07:00", target = "00:30", completed = false } = {}) {
    const d = String(date || "").trim();
    const startClock = normalizeClockValue(start) || "23:30";
    const endClock = normalizeClockValue(end) || "07:00";
    const startRaw = clockMinutes(startClock);
    const endRaw = clockMinutes(endClock);
    const startDate = startRaw != null && startRaw <= 12 * 60 ? addDays(d, 1) : d;
    const dueDate = endRaw != null && startRaw != null && endRaw <= startRaw ? addDays(startDate, 1) : startDate;
    const duration = minutesBetween(startClock, endClock) || 450;
    return `- [${completed ? "x" : " "}] 睡眠 [start:: ${startDate} ${startClock}] [due:: ${dueDate} ${endClock}] [duration_min:: ${duration}] #tl/sleep`;
  }

  root.utils.habitParsing = {
    getSectionItems,
    getSectionTaskEntries,
    normalizeHabit,
    extractInlineField,
    parseInlineFields,
    parseHabitMeta,
    migrateHabitStatusTags,
    inferLegacyHabitConfig,
    serializeHabitConfig,
    canonicalHabitName,
    formatHabitTodayLabel,
    extractTaskDate,
    getSleepHabitDate,
    normalizeClockValue,
    isSleepBeforeTarget,
    minutesBetween,
    buildSleepTimelineLine
  };
})();
