/**
 * 当日日记正文块：解析/拼接的单一事实源（SSOT）。
 * 供 statusSelector、dashboardDailyRecap、及未来脚本共用；勿在多处复制正则。
 * 挂载：globalThis.dashboardCore.utils.diaryDayBlocks
 */
(() => {
  const root = globalThis.dashboardCore || (globalThis.dashboardCore = {});
  root.utils = root.utils || {};

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
  const parseGdd = (text) => {
    const out = { hi: "", dev: "", blk: "" };
    const m = String(text || "").match(new RegExp(`^###\\s*GDD\\s*(?:\\r?\\n)+([\\s\\S]*?)${blockEnd}`, "m"));
    if (!m) return out;
    const block = m[1];
    const pick = (labels) => {
      const lines = block.split(/\r?\n/);
      const re1 = new RegExp(`^\\s*[-*]?\\s*(?:${labels.join("|")})\\s*[：:]\\s*(.*)$`, "i");
      for (const line of lines) {
        const mm = line.match(re1);
        if (mm) return String(mm[1] || "").trim();
      }
      return "";
    };
    out.hi = pick(["亮点", "Highlight"]);
    out.dev = pick(["偏差", "Deviation"]);
    out.blk = pick(["阻塞", "Blocker"]);
    return out;
  };

  const inferGddLanguage = (text) => {
    const raw = String(text || "");
    if (/^\s*[-*]?\s*(?:亮点|偏差|阻塞)\s*[：:]/m.test(raw)) return "zh";
    if (/^\s*[-*]?\s*(?:Highlight|Deviation|Blocker)\s*:/mi.test(raw)) return "en";
    return inferDiaryLanguage(raw);
  };

  const formatGddSection = (s, language = runtimeDiaryLanguage()) => {
    const labels = diaryStructure(language).gdd;
    const colon = normalizeDiaryLanguage(language) === "zh" ? "：" : ": ";
    return [
      "### GDD",
      "",
      `- ${labels.hi}${colon}${s.hi}`,
      `- ${labels.dev}${colon}${s.dev}`,
      `- ${labels.blk}${colon}${s.blk}`,
      ""
    ].join("\n");
  };

  const upsertGdd = (text, s) => {
    const raw = String(text || "");
    const language = inferGddLanguage(raw);
    const block = formatGddSection(s, language);
    const gddSection = new RegExp(`^###\\s*GDD\\s*(?:\\r?\\n)+[\\s\\S]*?${blockEnd}`, "m");
    if (gddSection.test(raw)) {
      return raw.replace(gddSection, block);
    }
    const afterState = new RegExp(`(^###\\s+(?:日态|Daily state)\\s*(?:\\r?\\n)+[\\s\\S]*?${blockEnd})`, "mi");
    if (afterState.test(raw)) return raw.replace(afterState, `$1\n${block}\n`);
    const recap = /(^##\s+(?:复盘|Review)\s*(?:\r?\n)+)/mi;
    if (recap.test(raw)) return raw.replace(recap, `$1${block}\n`);
    return raw.replace(/\s*$/, "") + "\n\n" + block;
  };

  /** --- 感想 ### 感想… --- */
  const upsertThoughtSection = (text, body) => {
    const raw = String(text || "");
    const inner = String(body || "").trim();
    const language = inferDiaryLanguage(raw);
    const block = `### ${diaryStructure(language).thought}\n\n${inner}\n`;
    const re = new RegExp(`^###\\s*(?:感想[^\\n]*|Free writing)\\s*(?:\\r?\\n)+[\\s\\S]*?${blockEnd}`, "mi");
    if (re.test(raw)) return raw.replace(re, block);
    const afterGdd = new RegExp(`(^###\\s*GDD\\s*(?:\\r?\\n)+[\\s\\S]*?${blockEnd})`, "m");
    if (afterGdd.test(raw)) return raw.replace(afterGdd, `$1\n${block}\n`);
    const recap = /(^##\s+(?:复盘|Review)\s*(?:\r?\n)+)/mi;
    if (recap.test(raw)) return raw.replace(recap, `$1${block}\n`);
    return raw.replace(/\s*$/, "") + "\n\n" + block;
  };

  const parseThought = (text) => {
    const re = new RegExp(`^###\\s*(?:感想[^\\n]*|Free writing)\\s*(?:\\r?\\n)+([\\s\\S]*?)${blockEnd}`, "mi");
    const m = String(text || "").match(re);
    return m ? m[1].trim() : "";
  };

  const parseGratitude = (text) => {
    const re = new RegExp(`^###\\s*(?:今日感恩|Gratitude)\\s*(?:\\r?\\n)+([\\s\\S]*?)${blockEnd}`, "mi");
    const m = String(text || "").match(re);
    return m ? m[1].trim() : "";
  };

  /** --- 最终复盘归档：写回 总结 / GDD / 今日感恩 / 感想 --- */
  const parseSummary = (text) => {
    const re = new RegExp(`^###\\s*(?:总结|Summary)\\s*(?:\\r?\\n)+([\\s\\S]*?)${blockEnd}`, "mi");
    const m = String(text || "").match(re);
    return m ? m[1].trim() : "";
  };

  const formatSummarySection = (body, language = runtimeDiaryLanguage()) =>
    `### ${diaryStructure(language).summary}\n\n${String(body || "").trim()}\n`;

  const isPlaceholderBody = (body) => {
    const s = String(body || "").trim();
    return !s || s === "-" || s === "TODO" || s === "TBD" || /^待补/.test(s);
  };

  const mergeSectionBody = (existing, incoming) => {
    const oldBody = String(existing || "").trim();
    const newBody = String(incoming || "").trim();
    if (isPlaceholderBody(oldBody)) return newBody;
    if (isPlaceholderBody(newBody)) return oldBody;
    if (oldBody.includes(newBody)) return oldBody;
    if (newBody.includes(oldBody)) return newBody;
    return `${oldBody}\n\n${newBody}`;
  };

  const extractRecapBlock = (text) => {
    const raw = String(text || "");
    const match = raw.match(/^##\s+(复盘|Review)\s*$/mi);
    if (!match) {
      return {
        found: false,
        before: raw.replace(/\s*$/, ""),
        body: "",
        after: "",
        language: inferDiaryLanguage(raw)
      };
    }
    const start = match.index;
    const afterHead = start + match[0].length;
    const rest = raw.slice(afterHead);
    const nextSection = rest.search(/\n##\s+/);
    const end = nextSection === -1 ? raw.length : afterHead + nextSection + 1;
    return {
      found: true,
      before: raw.slice(0, start).replace(/\s*$/, ""),
      body: raw.slice(afterHead, end).replace(/^\s+/, "").replace(/\s+$/, ""),
      after: raw.slice(end).replace(/^\s*/, ""),
      language: headingDiaryLanguage(match[1])
    };
  };

  const stripChildSections = (body, headings) => {
    const escaped = headings.map((h) => String(h).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    if (!escaped) return String(body || "");
    const re = new RegExp(`^###\\s*(?:${escaped})[^\\n]*(?:\\r?\\n)+[\\s\\S]*?(?=^###\\s+|^##\\s+|$(?![\\s\\S]))`, "gm");
    return String(body || "").replace(re, "").replace(/\n{3,}/g, "\n\n").trim();
  };

  const buildFinalReviewBlock = (payload, language = runtimeDiaryLanguage()) => {
    const p = payload || {};
    const structure = diaryStructure(language);
    return [
      `## ${structure.review}`,
      "",
      formatSummarySection(p.summary || "", language).trimEnd(),
      "",
      formatGddSection(p.gdd || { hi: "", dev: "", blk: "" }, language).trimEnd(),
      "",
      `### ${structure.gratitude}\n\n${String(p.gratitude || "").trim()}`,
      "",
      `### ${structure.thought}\n\n${String(p.thought || "").trim()}`,
      ""
    ].join("\n");
  };

  const writeFinalReviewSections = (text, payload) => {
    const p = payload || {};
    const raw = stripVisibleDailyStateFields(String(text || ""));
    const recap = extractRecapBlock(raw);
    const existingBody = recap.body || "";
    const preserved = stripChildSections(existingBody, [
      "日态",
      "总结",
      "GDD",
      "今日感恩",
      "感想",
      "综合总结",
      "内容变化分析",
      "建议",
      "GDD 建议",
      "证据引用",
      "输入摘要",
      "证据引用/输入摘要",
      "Daily state",
      "Summary",
      "Gratitude",
      "Free writing",
      "Comprehensive summary",
      "Content change analysis",
      "Recommendations",
      "GDD recommendations",
      "Evidence references",
      "Input summary",
      "Evidence references/Input summary"
    ]);
    const finalBlock = buildFinalReviewBlock(p, recap.language).trimEnd();
    const blockWithPreserved = preserved ? `${finalBlock}\n\n${preserved}\n` : `${finalBlock}\n`;
    if (!recap.found) {
      return `${recap.before}\n\n${blockWithPreserved}`;
    }
    return `${recap.before ? `${recap.before}\n\n` : ""}${blockWithPreserved}${recap.after ? `\n${recap.after}` : ""}`;
  };

  const replaceFinalReviewSections = (text, payload) => {
    const p = payload || {};
    return writeFinalReviewSections(text, {
      ...p,
      summary: String(p.summary || ""),
      gdd: {
        hi: String(p.gdd?.hi || ""),
        dev: String(p.gdd?.dev || ""),
        blk: String(p.gdd?.blk || "")
      },
      gratitude: String(p.gratitude || ""),
      thought: String(p.thought || "")
    });
  };

  const upsertFinalReviewSections = (text, payload) => {
    const p = payload || {};
    const recap = extractRecapBlock(stripVisibleDailyStateFields(String(text || "")));
    const existingBody = recap.body || "";
    const oldGdd = parseGdd(existingBody);
    return writeFinalReviewSections(text, {
      ...p,
      summary: mergeSectionBody(parseSummary(existingBody), p.summary),
      gdd: {
        hi: mergeSectionBody(oldGdd.hi, p.gdd?.hi),
        dev: mergeSectionBody(oldGdd.dev, p.gdd?.dev),
        blk: mergeSectionBody(oldGdd.blk, p.gdd?.blk)
      },
      gratitude: mergeSectionBody(parseGratitude(existingBody), p.gratitude),
      thought: mergeSectionBody(parseThought(existingBody), p.thought)
    });
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

  const diaryInboxSectionRe = () => /^(##\s*Inbox\s*)(?:\r?\n)*([\s\S]*?)(?=^##\s|^###\s|^```|$(?![\s\S]))/m;

  const parseDiaryInboxEntryLine = (line, index) => {
    const m = String(line || "").match(/^\s*[-*]\s+(?:\[(\d{2}):(\d{2})\]\s*)?(.+?)\s*$/);
    if (!m) return null;
    const hh = m[1] != null ? Number(m[1]) : null;
    const mm = m[2] != null ? Number(m[2]) : null;
    const hasTime = Number.isInteger(hh) && Number.isInteger(mm) && hh >= 0 && hh < 24 && mm >= 0 && mm < 60;
    const time = hasTime ? `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}` : "";
    return {
      index,
      line: String(line || "").trim(),
      text: String(m[3] || "").trim(),
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
    const m = raw.match(diaryInboxSectionRe());
    if (!m) return [];
    return sortDiaryInboxEntries(
      String(m[2] || "")
        .split(/\r?\n/)
        .map((line, index) => parseDiaryInboxEntryLine(line, index))
        .filter(Boolean)
    );
  };

  const buildDiaryInboxLine = (lineRaw, options = {}) => {
    const raw = String(lineRaw || "").trim().replace(/\s*\n+\s*/g, " ");
    if (!raw) return "";
    if (/^\[\d{2}:\d{2}\]\s+\S/.test(raw)) return `- ${raw}`;
    return `- [${formatInboxMinute(options.now)}] ${raw}`;
  };

  const renderDiaryInboxBody = (body, extraLine = "") => {
    const existing = [];
    const preserved = [];
    String(body || "").split(/\r?\n/).forEach((line, index) => {
      const entry = parseDiaryInboxEntryLine(line, index);
      if (entry) {
        existing.push(entry);
        return;
      }
      if (String(line || "").trim()) preserved.push({ index, line: String(line || "").trim() });
    });
    const added = extraLine ? parseDiaryInboxEntryLine(extraLine, existing.length + preserved.length) : null;
    const sorted = sortDiaryInboxEntries(added ? existing.concat(added) : existing);
    return sorted.map((entry) => entry.line).concat(preserved.map((entry) => entry.line)).join("\n");
  };

  const appendDiaryInboxLine = (text, lineRaw, options = {}) => {
    const line = buildDiaryInboxLine(lineRaw, options);
    if (!line) return text;
    const raw = String(text || "");
    const re = diaryInboxSectionRe();
    if (re.test(raw)) {
      return raw.replace(re, (_, head, body) => {
        const rendered = renderDiaryInboxBody(body, line);
        return `${String(head || "## Inbox").trimEnd()}\n\n${rendered ? `${rendered}\n` : ""}`;
      });
    }
    return raw.trimEnd() + `\n\n## Inbox\n\n${line}\n`;
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
    const inboxM = raw.match(/^##\s*Inbox\s*(?:\r?\n)+([\s\S]*?)(?=^##\s|^###\s|^```)/m);
    const hasInbox = !!(inboxM && /^\s*[-*]\s+\S/m.test(inboxM[1]));
    const st = parseDailyStateFromBody(raw);
    const hasState = DAILY_STATE_KEYS.some((k) => String(st[k] || "").trim());
    const g = parseGdd(raw);
    const hasGdd = !!(g.hi || g.dev || g.blk);
    const th = parseThought(raw);
    const hasThought = th.length > 0;
    const hasGratitude = parseGratitude(raw).length > 0;
    return { hasTodayTasks, hasInbox, hasState, hasGdd, hasThought, hasGratitude };
  };

  root.utils.diaryDayBlocks = {
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
    formatGddSection,
    upsertGdd,
    parseSummary,
    formatSummarySection,
    upsertFinalReviewSections,
    replaceFinalReviewSections,
    parseGratitude,
    parseThought,
    upsertThoughtSection,
    parseDiaryInboxEntries,
    appendTodayTaskLine,
    appendDiaryInboxLine,
    getRecapFillFlags
  };
})();
