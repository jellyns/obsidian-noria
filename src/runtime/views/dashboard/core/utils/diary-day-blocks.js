/**
 * 当日日记正文块：解析/拼接的单一事实源（SSOT）。
 * 供 statusSelector、dashboardDailyRecap、及未来脚本共用；勿在多处复制正则。
 * 挂载：globalThis.dashboardCore.utils.diaryDayBlocks
 */
((createUtils) => {
  // Obsidian also exposes an ambient module; only export from a CommonJS wrapper.
  if (typeof module === "object" && module.exports && module !== globalThis.module) {
    module.exports = createUtils();
  } else {
    const root = globalThis.dashboardCore || (globalThis.dashboardCore = {});
    root.utils = root.utils || {};
    root.utils.diaryDayBlocks = createUtils();
  }
})(() => {

  // Shared lexical boundaries for headings and managed review ranges.
  const scanMarkdownLines = (text, options = {}) => {
    const lines = [];
    let fence = null;
    let frontmatter = false;
    let comment = "";
    let lineNumber = 0;
    const listIndents = [];
    for (const match of String(text || "").matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g)) {
      if (!match[0]) continue;
      const line = match[0].replace(/[\r\n]+$/, "");
      const currentLine = lineNumber++;
      const row = { text: line, visible: line, line: currentLine, start: match.index, end: match.index + match[0].length, eligible: false };
      lines.push(row);
      if (currentLine === 0 && /^\uFEFF?---[ \t]*$/.test(line)) {
        frontmatter = true;
        continue;
      }
      if (frontmatter) {
        if (/^(?:---|\.\.\.)[ \t]*$/.test(line)) frontmatter = false;
        continue;
      }
      // Task edits also need real nested lists. Keep source offsets intact and
      // interpret indentation relative to the parent list, not a code block.
      let blockLine = line;
      if (options.listContent && !comment) {
        const expanded = line.replace(/^\t+/, tabs => "    ".repeat(tabs.length));
        const indent = /^ */.exec(expanded)[0].length;
        if (expanded.trim() && !fence) {
          while (listIndents.length && indent < listIndents[listIndents.length - 1]) listIndents.pop();
        }
        const base = listIndents[listIndents.length - 1] || 0;
        blockLine = expanded.slice(Math.min(indent, base));
        const item = !fence && /^ {0,3}(?:[-+*]|\d+[.)])[ \t]+/.exec(blockLine);
        if (item) {
          listIndents.push(base + item[0].length);
          blockLine = blockLine.slice(item[0].length);
        }
      }
      const marker = !comment && /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(blockLine);
      if (fence) {
        if (marker && marker[1][0] === fence[0]
          && marker[1].length >= fence.length && !marker[2].trim()) { fence = null; row.fenceEnd = true; }
        continue;
      }
      if (marker && (marker[1][0] !== "`" || !marker[2].includes("`"))) {
        fence = marker[1];
        row.fenceLanguage = marker[2].trim().split(/\s/)[0];
        row.fenceStart = true;
        continue;
      }
      if (/^(?: {4}|\t)/.test(blockLine) && !comment) continue;
      row.eligible = !comment;
      let visible = "";
      let inlineCode = 0;
      for (let i = 0; i < line.length;) {
        if (comment) {
          const closing = comment === "percent" ? "%%" : "-->";
          if (line.startsWith(closing, i)) { visible += " ".repeat(closing.length); i += closing.length; comment = ""; }
          else { visible += " "; i++; }
        } else if (line[i] === "`") {
          const run = /^`+/.exec(line.slice(i))[0];
          if (!inlineCode) inlineCode = run.length;
          else if (inlineCode === run.length) inlineCode = 0;
          visible += run; i += run.length;
        } else if (!inlineCode && (line.startsWith("%%", i) || line.startsWith("<!--", i))) {
          comment = line.startsWith("%%", i) ? "percent" : "html";
          const size = comment === "percent" ? 2 : 4;
          visible += " ".repeat(size); i += size;
        } else { visible += line[i++]; }
      }
      row.visible = visible;
    }
    return lines;
  };

  const scanAtxHeadings = (text) => {
    const headings = [];
    for (const row of scanMarkdownLines(text)) {
      if (!row.eligible) continue;
      const heading = /^ {0,3}(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/.exec(row.visible);
      if (!heading) continue;
      headings.push({
        level: heading[1].length,
        title: String(heading[2] || "").replace(/[ \t]+#+[ \t]*$/, "").trim(),
        line: row.line,
        start: row.start,
        end: row.end
      });
    }
    return headings;
  };

  const blockEnd = "(?=^(?:###|##)\\s|^```|$(?![\\s\\S]))";

  const DIARY_STRUCTURES = {
    zh: {
      review: "复盘",
      tasks: "待办",
      todayTasks: "今日任务",
      summary: "总结",
      gratitude: "今日感恩",
      thought: "感想（自由写）",
      gdd: { hi: "亮点", dev: "偏差", blk: "阻塞" }
    },
    en: {
      review: "Review",
      tasks: "Tasks",
      todayTasks: "Today tasks",
      summary: "Summary",
      gratitude: "Gratitude",
      thought: "Free writing",
      gdd: { hi: "Highlight", dev: "Deviation", blk: "Blocker" }
    }
  };

  const normalizeDiaryLanguage = (language) => /^zh(?:-|$)/i.test(String(language || "")) ? "zh" : "en";

  const runtimeDiaryLanguage = () => {
    const bridge = globalThis.__noriaRuntimeBridge || {};
    const locale = bridge.locale || bridge.i18n?.locale;
    return locale ? normalizeDiaryLanguage(locale) : "zh";
  };

  const headingDiaryLanguage = (heading) => /[\u3400-\u9fff]/.test(String(heading || "")) ? "zh" : "en";

  const inferDiaryLanguage = (text, fallback = "") => {
    const raw = String(text || "");
    const structuralHeading = raw.match(
      /^(?:##|###)\s*(复盘|Review|待办|Tasks|今日任务|Today tasks|总结|Summary|今日感恩|Gratitude|感想[^\n]*|Free writing)\s*$/mi
    );
    if (structuralHeading) return headingDiaryLanguage(structuralHeading[1]);
    return fallback ? normalizeDiaryLanguage(fallback) : runtimeDiaryLanguage();
  };

  const diaryStructure = (language) => DIARY_STRUCTURES[normalizeDiaryLanguage(language)];

  const isDateLike = (input) =>
    Object.prototype.toString.call(input) === "[object Date]" &&
    typeof input?.getTime === "function";

  const normalizeYmd = (input) => {
    if (isDateLike(input) && !Number.isNaN(input.getTime())) {
      const y = input.getFullYear();
      const mm = String(input.getMonth() + 1).padStart(2, "0");
      const dd = String(input.getDate()).padStart(2, "0");
      return `${y}-${mm}-${dd}`;
    }
    const raw = String(input || "").trim();
    const dashed = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dashed) return `${dashed[1]}-${dashed[2]}-${dashed[3]}`;
    const compact = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
    const n = new Date();
    const y = n.getFullYear();
    const mm = String(n.getMonth() + 1).padStart(2, "0");
    const dd = String(n.getDate()).padStart(2, "0");
    return `${y}-${mm}-${dd}`;
  };

  const normalizeDiaryRoot = (options = {}) => {
    const fromOptions = typeof options === "string" ? options : options?.diaryRoot;
    const fromBridge = globalThis.__noriaRuntimeBridge?.paths?.diaryRoot;
    const raw = String(fromOptions || fromBridge || "06_Diary")
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");
    return raw || "06_Diary";
  };

  const getDiaryPathForDate = (input, options = {}) => {
    const ymd = normalizeYmd(input);
    const y = ymd.slice(0, 4);
    return `${normalizeDiaryRoot(options)}/${y}/${ymd}.md`;
  };

  const getTodayDiaryPath = (now = new Date(), options = {}) => {
    return getDiaryPathForDate(now, options);
  };

  /** --- 日态 ### 日态 --- */
  const DAILY_STATE_KEYS = [
    "weather",
    "weather_status",
    "weather_temp",
    "weather_humidity",
    "weather_aqi",
    "weather_ip",
    "weather_city",
    "weather_source",
    "mood",
    "energy",
    "focus"
  ];

  const dailyStateSectionRe = () =>
    new RegExp(`^###\\s+日态\\s*(?:\\r?\\n)+([\\s\\S]*?)${blockEnd}`, "gm");

  const emptyDailyState = () => ({
    weather: "",
    weather_status: "",
    weather_temp: "",
    weather_humidity: "",
    weather_aqi: "",
    weather_ip: "",
    weather_city: "",
    weather_source: "",
    mood: "",
    energy: "",
    focus: ""
  });

  const splitFrontmatter = (text) => {
    const raw = String(text || "");
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!m) return { has: false, frontmatter: "", body: raw };
    return {
      has: true,
      frontmatter: m[1],
      body: raw.slice(m[0].length)
    };
  };

  const unquoteYamlScalar = (value) => {
    const s = String(value ?? "").trim();
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      return s.slice(1, -1).replace(/\\"/g, '"').replace(/''/g, "'");
    }
    return s;
  };

  const yamlScalar = (value) => {
    const s = String(value ?? "").trim();
    if (!s) return '""';
    if (/^[^\r\n:#\[\]\{\},&*!|>'"%@`]+$/.test(s) && !/^\s|^-|^\?|^\d{4}-\d{2}-\d{2}$/.test(s)) {
      return s;
    }
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  };

  const parseDailyStateFromFrontmatter = (textOrFrontmatter) => {
    const out = emptyDailyState();
    const source = typeof textOrFrontmatter === "string"
      ? splitFrontmatter(textOrFrontmatter).frontmatter
      : "";
    if (!source) return out;
    for (const line of source.split(/\r?\n/)) {
      const mm = line.match(/^\s*([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*?)\s*$/);
      if (!mm) continue;
      const key = mm[1];
      if (!DAILY_STATE_KEYS.includes(key)) continue;
      out[key] = unquoteYamlScalar(mm[2]);
    }
    return out;
  };

  const parseDailyStateInlineBlock = (text) => {
    const out = {
      weather: "",
      weather_status: "",
      weather_temp: "",
      weather_humidity: "",
      weather_aqi: "",
      weather_ip: "",
      weather_city: "",
      weather_source: "",
      mood: "",
      energy: "",
      focus: ""
    };
    const raw = String(text || "");
    const cnKey = { 天气: "weather", 心情: "mood", 能量: "energy", 专注: "focus" };
    const re = dailyStateSectionRe();
    let m;
    while ((m = re.exec(raw))) {
      for (const line of String(m[1] || "").split(/\r?\n/)) {
        const mm = line.match(/^\s*(?:[-*]\s*)?(weather|weather_status|weather_temp|weather_humidity|weather_aqi|weather_ip|weather_city|weather_source|mood|energy|focus)\s*::\s*(.+?)\s*$/i);
        if (mm) {
          const key = mm[1].toLowerCase();
          if (!out[key]) out[key] = mm[2].trim();
          continue;
        }
        const mmCn = line.match(/^\s*(?:[-*]\s*)?(天气|心情|能量|专注)\s*[：:]\s*(.+?)\s*$/);
        if (mmCn) {
          const k = cnKey[mmCn[1]];
          if (k && !out[k]) out[k] = mmCn[2].trim();
        }
      }
    }
    return out;
  };

  const parseDailyState = (text, frontmatter) => {
    const body = parseDailyStateInlineBlock(text);
    const fm = frontmatter && typeof frontmatter === "object"
      ? Object.fromEntries(DAILY_STATE_KEYS.map((k) => [k, String(frontmatter[k] ?? "").trim()]))
      : parseDailyStateFromFrontmatter(text);
    const out = emptyDailyState();
    for (const key of DAILY_STATE_KEYS) {
      out[key] = String(fm[key] ?? "").trim() || String(body[key] ?? "").trim();
    }
    return out;
  };

  const parseDailyStateFromBody = (text) => parseDailyState(text);

  const formatDailyStateSection = (state) => {
    return ["### 日态", ""].join("\n");
  };

  const dailyStateLineRe = new RegExp(`^\\s*(?:[-*]\\s*)?(?:${DAILY_STATE_KEYS.join("|")})\\s*::\\s*.*$`, "i");

  const stripVisibleDailyStateFields = (text) => {
    const raw = String(text || "");
    const next = raw.replace(dailyStateSectionRe(), (section, body) => {
      const headMatch = section.match(/^###\s+日态\s*/);
      const head = headMatch ? headMatch[0].trimEnd() : "### 日态";
      const kept = String(body || "")
        .split(/\r?\n/)
        .filter((line) => !dailyStateLineRe.test(line))
        .join("\n")
        .replace(/^\s+/, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/\s*$/, "");
      return kept ? `${head}\n\n${kept}\n` : `${head}\n\n`;
    });
    return next.replace(/(^###\s+日态\s*\n+)(?:###\s+日态\s*\n+)*/gm, "$1");
  };

  const getVisibleDailyStateFieldLines = (text) => {
    const out = [];
    const raw = String(text || "");
    const re = dailyStateSectionRe();
    let m;
    while ((m = re.exec(raw))) {
      String(m[1] || "")
        .split(/\r?\n/)
        .filter((line) => dailyStateLineRe.test(line))
        .forEach((line) => out.push(line));
    }
    return out;
  };

  const hasVisibleDailyStateFields = (text) => getVisibleDailyStateFieldLines(text).length > 0;

  const upsertDailyStateMetadata = (text, state) => {
    const raw = String(text || "");
    const split = splitFrontmatter(raw);
    const values = {};
    for (const key of DAILY_STATE_KEYS) {
      const value = String(state?.[key] ?? "").trim();
      if (value) values[key] = value;
    }
    if (Object.keys(values).length === 0) return raw;

    const lines = split.has ? split.frontmatter.split(/\r?\n/) : [];
    const seen = new Set();
    const nextLines = [];
    for (const line of lines) {
      const mm = line.match(/^\s*([A-Za-z_][A-Za-z0-9_-]*)\s*:/);
      const key = mm ? mm[1] : "";
      if (DAILY_STATE_KEYS.includes(key)) {
        if (Object.prototype.hasOwnProperty.call(values, key)) {
          nextLines.push(`${key}: ${yamlScalar(values[key])}`);
          seen.add(key);
        }
        continue;
      }
      nextLines.push(line);
    }
    for (const key of DAILY_STATE_KEYS) {
      if (!seen.has(key) && Object.prototype.hasOwnProperty.call(values, key)) {
        nextLines.push(`${key}: ${yamlScalar(values[key])}`);
      }
    }
    const frontmatter = nextLines.join("\n").replace(/\s+$/, "");
    const body = split.has ? split.body.replace(/^\n+/, "") : raw.replace(/^\n+/, "");
    return `---\n${frontmatter}\n---\n\n${body}`;
  };

  const upsertDailyStateSection = (text, state) => {
    const old = parseDailyState(text);
    const merged = { ...old, ...(state || {}) };
    const withMeta = upsertDailyStateMetadata(text, merged);
    return stripVisibleDailyStateFields(withMeta);
  };

  const migrateVisibleDailyStateToFrontmatter = (text) => {
    const raw = String(text || "");
    const state = parseDailyState(raw);
    if (!hasVisibleDailyStateFields(raw)) {
      return { text: raw, changed: false, state };
    }
    const next = stripVisibleDailyStateFields(upsertDailyStateMetadata(raw, state));
    return {
      text: next,
      changed: next !== raw,
      state: parseDailyState(next)
    };
  };

  const pickField = (bodyVal, fmVal) => {
    const b = String(bodyVal ?? "").trim();
    if (b) return b;
    return String(fmVal ?? "").trim();
  };

  /** --- GDD --- */
  const trimReviewBoundaryLines = (value) => String(value || "").replace(/\r\n?/g, "\n").replace(/^\n+|\n+$/g, "");

  const readReviewChildBody = (text, matchesTitle) => {
    const raw = String(text || "");
    const headings = scanAtxHeadings(raw);
    const rows = scanMarkdownLines(raw);
    const starts = rows.filter(row => row.eligible && row.text.trim() === "%% noria:review:start %%");
    const ends = rows.filter(row => row.eligible && row.text.trim() === "%% noria:review:end %%");
    if ((starts.length || ends.length) && (starts.length !== 1 || ends.length !== 1 || starts[0].start >= ends[0].start)) return "";
    const recapIndex = headings.findIndex((entry) => entry.level === 2 && /^(复盘|Review)$/i.test(entry.title));
    const recap = headings[recapIndex];
    const from = starts[0]?.end ?? recap?.end ?? 0;
    const end = ends[0]?.start ?? (recap ? headings.slice(recapIndex + 1).find((entry) => entry.level <= 2)?.start ?? raw.length : raw.length);
    const candidates = headings.filter((entry) => entry.start >= from && entry.start < end);
    const index = candidates.findIndex((entry) => entry.level === 3 && matchesTitle(entry.title));
    if (index < 0) return "";
    const next = candidates.slice(index + 1).find((entry) => entry.level <= 3);
    return trimReviewBoundaryLines(raw.slice(candidates[index].end, next ? next.start : end));
  };

  const parseGdd = (text) => {
    const out = { hi: "", dev: "", blk: "" };
    const block = readReviewChildBody(text, (title) => /^GDD$/i.test(title));
    const keys = { "亮点": "hi", highlight: "hi", "偏差": "dev", deviation: "dev", "阻塞": "blk", blocker: "blk" };
    let active = "";
    let fence = null;
    for (const line of block.split("\n")) {
      const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      const wasFenced = !!fence;
      if (fence && marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      else if (!fence && marker && (marker[1][0] !== "`" || !marker[2].includes("`"))) fence = marker[1];
      const match = !wasFenced && !marker && /^[ \t]*[-*]?[ \t]*(亮点|Highlight|偏差|Deviation|阻塞|Blocker)[ \t]*([：:])(.*)$/i.exec(line);
      if (match) {
        active = keys[match[1].toLowerCase()];
        out[active] = match[2] === ":" && match[3].startsWith(" ") ? match[3].slice(1) : match[3];
      } else if (active) out[active] += `\n${line}`;
    }
    for (const key of Object.keys(out)) out[key] = trimReviewBoundaryLines(out[key]);
    return out;
  };

  const isThoughtHeading = (title) => /^(?:感想(?:[（(].*)?|Free writing)$/i.test(title);
  const parseThought = (text) => readReviewChildBody(text, isThoughtHeading);

  const parseGratitude = (text) => {
    return readReviewChildBody(text, (title) => /^(?:今日感恩|Gratitude)$/i.test(title));
  };

  /** --- 最终复盘归档：写回 总结 / GDD / 今日感恩 / 感想 --- */
  const parseSummary = (text) => {
    return readReviewChildBody(text, (title) => /^(?:总结|Summary)$/i.test(title));
  };


  /** --- 今日任务：在 ### 今日任务 下追加一行 --- */
  const appendTodayTaskLine = (text, lineRaw) => {
    const taskText = String(lineRaw || "").trim();
    if (!taskText) return text;
    const raw = String(text || "");
    const line = `- [ ] ${taskText.replace(/\n/g, " ")}`;
    const re = new RegExp(`^(###\\s*(今日任务|Today tasks)\\s*(?:\\r?\\n)+)([\\s\\S]*?)${blockEnd}`, "mi");
    if (re.test(raw)) {
      return raw.replace(re, (_, head, _heading, body) => {
        const existing = String(body || "").trimEnd();
        return `${head}${existing ? `${existing}\n` : ""}${line}\n`;
      });
    }
    const tasks = /^(##\s*(待办|Tasks)\s*(?:\r?\n)+)/mi;
    if (tasks.test(raw)) {
      return raw.replace(tasks, (_, head, heading) => {
        const language = headingDiaryLanguage(heading);
        return `${head}\n### ${diaryStructure(language).todayTasks}\n\n${line}\n\n`;
      });
    }
    const structure = diaryStructure(inferDiaryLanguage(raw));
    return raw.trimEnd() + `\n\n## ${structure.tasks}\n\n### ${structure.todayTasks}\n\n${line}\n`;
  };

  /** --- 日记内 ## Inbox --- */
  const formatInboxMinute = (input) => {
    const d = input && typeof input.getHours === "function" ? input : new Date();
    const hh = String(Math.max(0, Math.min(23, Number(d.getHours()) || 0))).padStart(2, "0");
    const mm = String(Math.max(0, Math.min(59, Number(d.getMinutes()) || 0))).padStart(2, "0");
    return `${hh}:${mm}`;
  };

  const readDiaryInboxSection = (text) => {
    const raw = String(text || ""), headings = scanAtxHeadings(raw);
    const matches = headings.filter(h => h.level === 2 && h.title.toLowerCase() === "inbox");
    if (matches.length !== 1) return null;
    const heading = matches[0];
    const end = headings.find(h => h.start > heading.start && h.level <= 2)?.start ?? raw.length;
    const entryEnd = headings.find(h => h.start > heading.start && h.start < end)?.start ?? end;
    return { start: heading.start, contentStart: heading.end, end, entryEnd, body: raw.slice(heading.end, entryEnd) };
  };

  const parseDiaryInboxEntryLine = (line, index) => {
    const m = String(line || "").match(/^[-*][ \t](?:\[(\d{2}):(\d{2})\][ \t])?(.+)$/);
    if (!m) return null;
    const hh = m[1] != null ? Number(m[1]) : null;
    const mm = m[2] != null ? Number(m[2]) : null;
    const hasTime = Number.isInteger(hh) && Number.isInteger(mm) && hh >= 0 && hh < 24 && mm >= 0 && mm < 60;
    const time = hasTime ? `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}` : "";
    return {
      index,
      line: String(line || "").trim(),
      text: (m[1] != null && !hasTime ? `[${m[1]}:${m[2]}] ` : "") + String(m[3] || ""),
      time,
      hasTime,
      minute: hasTime ? hh * 60 + mm : Number.POSITIVE_INFINITY
    };
  };

  const sortDiaryInboxEntries = (entries) => {
    return entries.slice().sort((a, b) => {
      if (a.hasTime !== b.hasTime) return a.hasTime ? -1 : 1;
      if (a.minute !== b.minute) return a.minute - b.minute;
      return a.index - b.index;
    });
  };

  const parseDiaryInboxEntries = (text) => {
    const raw = String(text || "");
    const section = readDiaryInboxSection(raw);
    if (!section) return [];
    const rows = scanMarkdownLines(section.body, {listContent:true}), entries = [];
    for (let i=0; i<rows.length; i++) {
      const row=rows[i];
      if (!row.eligible || !/^[-*]\s+/.test(row.text)) continue;
      const entry=parseDiaryInboxEntryLine(row.text,row.line);
      if (!entry) continue;
      let end=row.end, blank=false;
      for (let j=i+1; j<rows.length; j++) {
        const next=rows[j];
        if (next.eligible && /^(?:[-*]\s+|#{1,6}\s+)/.test(next.text)) break;
        if (next.text.trim() && !/^(?: {2}|\t)/.test(next.text) && (blank || next.fenceStart)) break;
        end=next.end; blank=!next.text.trim(); i=j;
      }
      const block=section.body.slice(row.start,end).replace(/(?:\r?\n[ \t]*)+$/, "");
      const continuation=block.slice(row.text.length).replace(/\r\n?/g,"\n").replace(/^ {2}/gm,"");
      entries.push({...entry, line:block, text:entry.text+continuation,
        start:section.contentStart+row.start, end:section.contentStart+end});
    }
    return sortDiaryInboxEntries(entries);
  };

  const buildDiaryInboxLine = (lineRaw, options = {}) => {
    const raw = String(lineRaw || "").replace(/\r\n?/g,"\n").replace(/^(?:[ \t]*\n)+|(?:\n[ \t]*)+$/g,"");
    if (!raw.trim()) return "";
    const hasExplicitTime=/^\[(?:[01]\d|2[0-3]):[0-5]\d\]\s+\S/.test(raw);
    const prefix=hasExplicitTime || options.includeTime === false ? "" : `[${formatInboxMinute(options.now)}] `;
    return `- ${prefix}${raw.split("\n").join("\n  ")}`;
  };

  const appendDiaryInboxLine = (text, lineRaw, options = {}) => {
    const line = buildDiaryInboxLine(lineRaw, options);
    if (!line) return text;
    const raw = String(text || "");
    const section=readDiaryInboxSection(raw), eol=/\r\n|\n|\r/.exec(raw)?.[0] || "\n";
    const entry=line.replace(/\n/g,eol);
    if (section) {
      const prefix=raw.slice(0,section.entryEnd), suffix=raw.slice(section.entryEnd);
      const gap=prefix.endsWith(eol+eol)?"":prefix.endsWith(eol)?eol:eol+eol;
      return prefix+gap+entry+eol+(suffix?eol:"")+suffix;
    }
    if (scanAtxHeadings(raw).some(h=>h.level===2 && h.title.toLowerCase()==="inbox")) throw new Error("Multiple Inbox sections; choose one in the source note before capturing.");
    return raw+(raw?eol+eol:"")+`## Inbox${eol}${eol}${entry}${eol}`;
  };

  /** 各步是否有内容（轻量圆点用） */
  const getRecapFillFlags = (text) => {
    const raw = String(text || "");
    const todayTasksRe = new RegExp(
      `^###\\s*(?:今日任务|Today tasks)\\s*(?:\\r?\\n)+([\\s\\S]*?)${blockEnd}`,
      "mi"
    );
    const todayTasksMatch = raw.match(todayTasksRe);
    const hasTodayTasks = !!(todayTasksMatch && /^\s*-\s*\[[ xX]\]/m.test(todayTasksMatch[1]));
    const hasInbox = parseDiaryInboxEntries(raw).length > 0;
    const st = parseDailyStateFromBody(raw);
    const hasState = DAILY_STATE_KEYS.some((k) => String(st[k] || "").trim());
    const g = parseGdd(raw);
    const hasGdd = !!(g.hi || g.dev || g.blk);
    const th = parseThought(raw);
    const hasThought = th.length > 0;
    const hasGratitude = parseGratitude(raw).length > 0;
    return { hasTodayTasks, hasInbox, hasState, hasGdd, hasThought, hasGratitude };
  };

  return {
    scanMarkdownLines,
    scanAtxHeadings,
    readDiaryInboxSection,
    DAILY_STATE_KEYS: DAILY_STATE_KEYS.slice(),
    normalizeYmd,
    getDiaryPathForDate,
    getTodayDiaryPath,
    parseDailyStateFromBody,
    parseDailyState,
    formatDailyStateSection,
    upsertDailyStateMetadata,
    stripVisibleDailyStateFields,
    hasVisibleDailyStateFields,
    migrateVisibleDailyStateToFrontmatter,
    upsertDailyStateSection,
    pickField,
    parseGdd,
    parseSummary,
    parseGratitude,
    parseThought,
    parseDiaryInboxEntries,
    appendTodayTaskLine,
    appendDiaryInboxLine,
    getRecapFillFlags
  };
});
