/**
 * Noria 复盘中心核心工具：路径、LLM 产物解析、prompt、Git 输出解析。
 * 挂载：globalThis.dashboardCore.utils.reviewCenter
 */
(() => {
  const root = globalThis.dashboardCore || (globalThis.dashboardCore = {});
  root.utils = root.utils || {};

  const normalizePath = (raw) =>
    String(raw || "")
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\/+/, "");

  const normalizeYmd = (input) => {
    if (input instanceof Date && !Number.isNaN(input.getTime())) {
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

  const normalizeDiaryRoot = (settings) => {
    const raw = String(settings?.managedPaths?.diaryRoot || globalThis.__noriaRuntimeBridge?.paths?.diaryRoot || "Noria/Diary")
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");
    return raw || "Noria/Diary";
  };

  const resolveDailyArtifactPath = (settings, dateInput) => {
    const ymd = normalizeYmd(dateInput);
    return `${normalizeDiaryRoot(settings)}/${ymd.slice(0, 4)}/${ymd}-review.md`;
  };

  const resolveReviewNotePathFromDailyPath = (dailyPath) =>
    normalizePath(dailyPath).replace(/\.md$/i, "-review.md");

  const isReviewNotePath = (pathText) =>
    /(?:^|\/)\d{4}-\d{2}-\d{2}-review\.md$/i.test(normalizePath(pathText));

  const isDailyNotePath = (pathText) =>
    /(?:^|\/)\d{4}-\d{2}-\d{2}\.md$/i.test(normalizePath(pathText)) && !isReviewNotePath(pathText);

  const parseFrontmatter = (markdown) => {
    const raw = String(markdown || "");
    const m = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
    if (!m) return { meta: {}, body: raw };
    const meta = {};
    for (const line of m[1].split(/\r?\n/)) {
      const mm = line.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/);
      if (mm) meta[mm[1]] = mm[2].replace(/^["']|["']$/g, "");
    }
    return { meta, body: raw.slice(m[0].length) };
  };

  const splitSecondLevelSections = (body) => {
    const sections = {};
    const lines = String(body || "").split(/\r?\n/);
    let current = null;
    let buffer = [];
    const flush = () => {
      if (!current) return;
      sections[current] = buffer.join("\n").trim();
    };
    for (const line of lines) {
      const m = line.match(/^##\s+(.+?)\s*$/);
      if (m) {
        flush();
        current = m[1].trim();
        buffer = [];
        continue;
      }
      if (current) buffer.push(line);
    }
    flush();
    return sections;
  };

  const extractHeading = (body, heading) => {
    const sections = splitSecondLevelSections(body);
    return String(sections[String(heading || "").trim()] || "").trim();
  };

  const parseGddSuggestion = (text) => {
    const block = String(text || "");
    const pick = (label) => {
      const re = new RegExp(`^\\s*(?:[-*]\\s*)?${label}\\s*[：:]\\s*(.*?)\\s*$`, "m");
      const m = block.match(re);
      return m ? m[1].trim() : "";
    };
    return { hi: pick("亮点"), dev: pick("偏差"), blk: pick("阻塞") };
  };

  const parseReviewArtifact = (markdown) => {
    const { meta, body } = parseFrontmatter(markdown);
    const gddRaw = extractHeading(body, "GDD 建议");
    return {
      meta,
      sections: {
        summary: extractHeading(body, "综合总结"),
        analysis: extractHeading(body, "内容变化分析"),
        advice: extractHeading(body, "建议"),
        gdd: gddRaw,
        evidence: extractHeading(body, "证据引用")
          || extractHeading(body, "输入摘要")
          || extractHeading(body, "证据引用/输入摘要")
      },
      gddSuggestion: parseGddSuggestion(gddRaw),
      raw: String(markdown || "")
    };
  };

  const stripFrontmatterMarkdown = (markdown) => parseFrontmatter(markdown).body.trim();

  const stripReviewPlaceholders = (text) =>
    String(text || "")
      .replace(/^\s*[-*]\s*(亮点|偏差|阻塞)\s*[：:]\s*$/gmi, "")
      .replace(/^\s*(综合总结|内容变化分析|建议|GDD 建议|证据引用|输入摘要|证据引用\/输入摘要)\s*$/gmi, "")
      .replace(/\s+/g, " ")
      .trim();

  const hasGeneratedReviewContent = (parsed) => {
    if (!parsed) return false;
    const sections = parsed.sections || {};
    const gdd = parsed.gddSuggestion || {};
    return [
      sections.summary,
      sections.analysis,
      sections.advice,
      sections.evidence,
      gdd.hi,
      gdd.dev,
      gdd.blk
    ].some((value) => stripReviewPlaceholders(value));
  };

  const isArtifactStale = (parsed, evidenceHash) => {
    if (!hasGeneratedReviewContent(parsed)) return true;
    const current = String(evidenceHash || "").trim();
    const recorded = String(parsed?.meta?.evidence_hash || "").trim();
    if (!current || !recorded) return true;
    return current !== recorded;
  };

  const buildArtifactPreviewMarkdown = (markdownOrParsed) => {
    const raw = typeof markdownOrParsed === "string"
      ? markdownOrParsed
      : String(markdownOrParsed?.raw || "");
    if (!raw.trim()) return "";
    const parsed = typeof markdownOrParsed === "string" ? parseReviewArtifact(raw) : markdownOrParsed;
    if (!hasGeneratedReviewContent(parsed)) return "";
    return `${stripFrontmatterMarkdown(raw).replace(/\s+$/g, "")}\n`;
  };

  const stableJson = (value, seen = new WeakSet()) => {
    if (Array.isArray(value)) return `[${value.map((item) => stableJson(item, seen)).join(",")}]`;
    if (value && typeof value === "object") {
      if (seen.has(value)) return JSON.stringify("[Circular]");
      seen.add(value);
      const out = `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableJson(value[k], seen)}`).join(",")}}`;
      seen.delete(value);
      return out;
    }
    return JSON.stringify(value);
  };

  const hashString = (value) => {
    const s = String(value || "");
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  };

  const createEvidenceHash = (evidence) => hashString(stableJson(evidence || {}));

  const countWords = (text) => {
    const raw = String(text || "");
    const cjk = raw.match(/[\u3400-\u9fff]/g) || [];
    const latin = raw.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g) || [];
    return cjk.length + latin.length;
  };

  const isReviewNoisePath = (pathText) => {
    const p = normalizePath(pathText);
    if (!p) return true;
    if (/^\./.test(p) || /(^|\/)\.[^/]+(\/|$)/.test(p)) return true;
    if (/^99_Attachment\//i.test(p)) return true;
    if (/(^|\/)node_modules\//i.test(p)) return true;
    if (/(^|\/)(\.git|dist|build|coverage)\//i.test(p)) return true;
    if (isReviewNotePath(p)) return true;
    if (/\.map$/i.test(p)) return true;
    return false;
  };

  const filterReviewRecords = (records) =>
    (Array.isArray(records) ? records : []).filter((x) => !isReviewNoisePath(x?.path || x));

  const sanitizeReviewExcerptText = (text) => {
    const raw = String(text || "");
    const withoutFencedWidgets = raw.replace(/```([^\n`]*)\n([\s\S]*?)```/g, (match, lang, body) => {
      const language = String(lang || "").trim().toLowerCase();
      const content = String(body || "");
      if (/^(dataviewjs|dataview|query)$/.test(language)) return "";
      if (/noriaView\s*\(|focusPanel|statusSelector|dailyOtherToday|habitCheckin|dashboardHabitWeek/i.test(content)) return "";
      return match;
    });
    return withoutFencedWidgets
      .replace(/^\s*await\s+noriaView\s*\([\s\S]*?\);\s*$/gmi, "")
      .split(/\r?\n/)
      .filter((line) => !/(noriaView|focusPanel|statusSelector|dailyOtherToday|habitCheckin|dashboardHabitWeek|Habit[s]?\.md)/i.test(line))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };

  const filterReviewExcerpts = (records) =>
    (Array.isArray(records) ? records : [])
      .filter((x) => !isReviewNoisePath(x?.path || ""))
      .map((x) => ({ ...x, text: sanitizeReviewExcerptText(x?.text || "") }))
      .filter((x) => String(x.text || "").trim());

  const cleanReviewExcerptHeading = (heading) =>
    String(heading || "")
      .replace(/^#+\s*/, "")
      .replace(/\s+#+\s*$/, "")
      .replace(/\s+/g, " ")
      .trim();

  const reviewExcerptFallbackHeading = (pathText) => {
    const name = normalizePath(pathText).split("/").pop() || "";
    return name.replace(/\.md$/i, "") || "摘录";
  };

  const splitReviewExcerptBlocks = (record, options = {}) => {
    const path = normalizePath(record?.path || "");
    const maxChars = Math.max(80, Math.min(3000, Number(options.maxChars || 900)));
    const raw = sanitizeReviewExcerptText(record?.text || "");
    const blocks = [];
    let current = { heading: "", lines: [], line: 0 };
    const flush = () => {
      const text = current.lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
      if (!text) return;
      blocks.push({
        path,
        heading: cleanReviewExcerptHeading(current.heading) || reviewExcerptFallbackHeading(path),
        line: current.line || 0,
        text: text.slice(0, maxChars).trim()
      });
    };
    const lines = raw.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;
      const heading = String(line || "").match(/^\s{0,3}(#{1,4})\s+(.+?)\s*#*\s*$/);
      if (heading) {
        flush();
        current = { heading: heading[2], lines: [], line: lineNumber };
        continue;
      }
      if (!current.line && String(line || "").trim()) current.line = lineNumber;
      current.lines.push(line);
    }
    flush();
    if (!blocks.length && raw.trim()) {
      blocks.push({
        path,
        heading: reviewExcerptFallbackHeading(path),
        line: 1,
        text: raw.trim().slice(0, maxChars).trim()
      });
    }
    return blocks.filter((x) => x.text);
  };

  const groupReviewExcerpts = (records, options = {}) => {
    const maxGroups = Math.max(1, Math.min(20, Number(options.maxGroups || 8)));
    const maxBlocksPerGroup = Math.max(1, Math.min(20, Number(options.maxBlocksPerGroup || 8)));
    return filterReviewExcerpts(records)
      .slice(0, maxGroups)
      .map((record) => {
        const path = normalizePath(record?.path || "");
        const blocks = splitReviewExcerptBlocks(record, options).slice(0, maxBlocksPerGroup);
        return { path, blocks };
      })
      .filter((group) => group.path && group.blocks.length);
  };

  const countReviewExcerptBlocks = (records, options = {}) =>
    groupReviewExcerpts(records, options).reduce((sum, group) => sum + group.blocks.length, 0);

  const formatTaskEvidenceItem = (item) => {
    const source = item && typeof item === "object" ? item : { label: item };
    const label = String(source.label || source.text || source.title || item || "").trim();
    const path = normalizePath(source.path || source.source?.path || "");
    const line = Number(source.line || source.source?.line || 0);
    const location = path ? `（${path}${line > 0 ? `:${line}` : ""}）` : "";
    return `${label || "Untitled task"}${location}`;
  };

  const summarizeFilteredFiles = (summary) => {
    const files = filterReviewRecords(summary?.files || []);
    const out = { added: 0, modified: 0, deleted: 0, renamed: 0, files };
    for (const f of files) {
      const kind = out[f.kind] == null ? "modified" : f.kind;
      out[kind] += 1;
    }
    return out;
  };

  const parsePorcelainStatus = (text) => {
    const rows = [];
    for (const rawLine of String(text || "").split(/\r?\n/)) {
      const line = rawLine.trimEnd();
      if (!line) continue;
      const xy = line.slice(0, 2);
      let p = line.slice(3).trim();
      if (!p) continue;
      const renamed = /\s+->\s+/.test(p);
      if (renamed) p = p.split(/\s+->\s+/).pop();
      let kind = "modified";
      if (renamed || xy.includes("R")) kind = "renamed";
      else if (xy.includes("D")) kind = "deleted";
      else if (xy.includes("A") || xy === "??") kind = "added";
      rows.push({ kind, path: normalizePath(p), raw: line, approximate: false });
    }
    return rows;
  };

  const parseNameStatusLine = (line) => {
    const parts = String(line || "").trim().split(/\t+/).filter(Boolean);
    if (parts.length < 2) return null;
    const status = parts[0].slice(0, 1);
    const target = parts.length > 2 ? parts[parts.length - 1] : parts[1];
    let kind = "modified";
    if (status === "A") kind = "added";
    else if (status === "D") kind = "deleted";
    else if (status === "R") kind = "renamed";
    return { kind, path: normalizePath(target), raw: String(line || "").trim(), approximate: false };
  };

  const parseNameStatus = (text) => {
    const rows = [];
    for (const rawLine of String(text || "").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("@@COMMIT@@")) continue;
      const rec = parseNameStatusLine(line);
      if (rec) rows.push(rec);
    }
    return rows;
  };

  const summarizeChangeCounts = (files) => {
    const counts = { added: 0, modified: 0, deleted: 0, renamed: 0 };
    for (const file of Array.isArray(files) ? files : []) {
      const kind = counts[file.kind] == null ? "modified" : file.kind;
      counts[kind] += 1;
    }
    return counts;
  };

  const getCommitTime = (dateText) => {
    const raw = String(dateText || "").trim();
    const m = raw.match(/T(\d{2}:\d{2})/);
    if (m) return m[1];
    const alt = raw.match(/\b(\d{2}:\d{2})\b/);
    return alt ? alt[1] : "";
  };

  const parseCommitLog = (text, keepPath = (p) => !isReviewNoisePath(p)) => {
    const commits = [];
    let current = null;
    const pushCurrent = () => {
      if (!current) return;
      current.files = current.files.filter((x) => {
        try {
          return keepPath(x.path) !== false;
        } catch (_) {
          return false;
        }
      });
      if (!current.files.length) {
        current = null;
        return;
      }
      current.fileCount = current.files.length;
      current.counts = summarizeChangeCounts(current.files);
      commits.push(current);
      current = null;
    };
    for (const rawLine of String(text || "").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith("@@COMMIT@@")) {
        pushCurrent();
        const parts = line.replace(/^@@COMMIT@@/, "").split(/\t/);
        const hash = normalizePath(parts[0] || "").replace(/\//g, "");
        const date = String(parts[1] || "").trim();
        current = {
          hash,
          shortHash: hash.slice(0, 7),
          date,
          time: getCommitTime(date),
          message: parts.slice(2).join("\t").trim() || "(no message)",
          files: [],
          fileCount: 0,
          counts: { added: 0, modified: 0, deleted: 0, renamed: 0 }
        };
        continue;
      }
      if (!current) continue;
      const rec = parseNameStatusLine(line);
      if (rec) current.files.push(rec);
    }
    pushCurrent();
    return commits;
  };

  const parseNumstat = (text) => {
    let added = 0;
    let deleted = 0;
    const files = [];
    for (const rawLine of String(text || "").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      const parts = line.split(/\t+/);
      if (parts.length < 3) continue;
      const a = Number(parts[0]);
      const d = Number(parts[1]);
      const path = normalizePath(parts.slice(2).join("\t"));
      if (Number.isFinite(a)) added += a;
      if (Number.isFinite(d)) deleted += d;
      files.push({ path, added: Number.isFinite(a) ? a : 0, deleted: Number.isFinite(d) ? d : 0 });
    }
    return { added, deleted, net: added - deleted, files };
  };

  const summarizeFileChanges = (records) => {
    const out = { added: 0, modified: 0, deleted: 0, renamed: 0, files: [] };
    for (const rec of Array.isArray(records) ? records : []) {
      const kind = out[rec.kind] == null ? "modified" : rec.kind;
      out[kind] += 1;
      out.files.push({ kind, path: rec.path, approximate: rec.approximate === true });
    }
    return out;
  };

  const filterReviewCommits = (commits) => (Array.isArray(commits) ? commits : [])
    .map((commit) => {
      const files = filterReviewRecords(commit?.files || []);
      if (!files.length) return null;
      return {
        ...commit,
        hash: String(commit?.hash || ""),
        shortHash: String(commit?.shortHash || commit?.hash || "").slice(0, 7),
        time: String(commit?.time || getCommitTime(commit?.date || "")),
        message: String(commit?.message || "").trim() || "(no message)",
        files,
        fileCount: files.length,
        counts: summarizeChangeCounts(files)
      };
    })
    .filter(Boolean);

  const buildDailyReviewPrompt = ({ date, artifactPath, evidenceHash, evidenceMarkdown }) => {
    const ymd = normalizeYmd(date);
    return [
      "请基于下面证据，为 Noria 每日复盘生成一份可直接保存到复盘笔记的 Markdown。",
      "",
      `日期：${ymd}`,
      `复盘笔记：${normalizePath(artifactPath)}`,
      `evidence_hash：${String(evidenceHash || "").trim()}`,
      "",
      "要求：",
      "- 只输出复盘笔记 Markdown，不要解释你的生成过程，不要写入主日记，也不要创建任务。",
      "- 证据包括任务清单、已过滤的知识库或项目材料变化、日记摘录和日态草稿。",
      "- 分析时请区分：关键任务 / 日常时间线任务 / 知识库或项目材料变化；生活打卡不要与真正推进混为一谈。",
      "- 习惯打卡（#habit、喝水、锻炼等例行项）不计入任务叙事，不出现在综合总结与建议中；最多在 GDD 或证据摘要里一句话聚合提及。",
      "- 写作目标：先判断，再用必要证据支撑。不要做“证据复读机”，不要把五段都填成长报告。",
      "- 正文（不含 frontmatter 与证据引用/输入摘要）不超过 500 字；同一个统计数字全文最多出现一次，正文用过的数字不要在证据引用节复述。",
      "- 禁止填充语：整体上、总的来说、可以看出、值得注意的是。语言要像人写的复盘，不像工作报告。",
      "- 综合总结不超过 150 字，第一句必须定性今天（值不值、失衡在哪、主线是什么），并回答：今天真正推进了什么、偏离了什么、明天最小下一步是什么。",
      "- 内容变化分析不超过 2 段，回答“变化意味着什么”，不要抄文件数、增删行数或路径清单。",
      "- 忽略 .codex、.obsidian、node_modules、插件文档、依赖文档、附件和构建产物；这些不是复盘对象。",
      "- 忽略渲染出来的仪表盘、习惯矩阵、状态控件、插件 UI 配置和旧视图代码；除非它们以用户手写复盘内容出现。",
      "- 不要把文件路径清单当作复盘正文；路径只能在证据引用/输入摘要中少量出现，用来支撑判断。",
      "- 如果证据不足，请明确写“证据不足”，不要补造不存在的任务、情绪、天气、结论或产出。",
      "- 建议区最多 3 条，每条动词开头、具体可执行、可验证；其中一条必须显式标注“明天最重要的一件事：”。禁止泛泛的“继续优化”“保持节奏”。",
      "- AI 建议自然融合进最终总结正文，不要单独设计写回主日记的小节。",
      "- 输出结构固定为 frontmatter 加以下二级标题：综合总结、内容变化分析、建议、GDD 建议、证据引用/输入摘要。",
      "- frontmatter 只写 date、generated_at、evidence_hash。",
      "- GDD 建议使用三行：亮点、偏差、阻塞。每行只写一句判断；没有真实阻塞就写“无明确阻塞”，不要拿风险凑数。",
      "- 证据引用/输入摘要只写证据来源路径、evidence_hash 和一行统计口径说明，不超过 5 行。",
      "- 不要输出代码围栏，不要输出额外标题，不要添加未在证据中出现的链接。",
      "",
      "## 证据",
      "",
      String(evidenceMarkdown || "").trim() || "（当前没有可用证据）"
    ].join("\n");
  };

  const buildClaudianReviewPrompt = ({ template, skillName, date, mode, period, artifactPath, evidenceFile }) => {
    const reviewMode = String(mode || "daily").trim() || "daily";
    const reviewPeriod = String(period || normalizeYmd(date)).trim() || normalizeYmd(date);
    const fallback = [
      "${skill}",
      "",
      "mode: {mode}",
      "period: {period}",
      "review_note: {review_note}",
      "evidence_file: {evidence_file}",
      "请生成复盘笔记。"
    ].join("\n");
    const values = {
      skill: String(skillName || "noria-review").trim() || "noria-review",
      date: normalizeYmd(date),
      mode: reviewMode,
      period: reviewPeriod,
      review_note: normalizePath(artifactPath),
      evidence_file: normalizePath(evidenceFile)
    };
    return String(template || fallback).replace(/\{(skill|date|mode|period|review_note|evidence_file)\}/g, (_, key) => values[key] || "");
  };

  const buildDailyEvidenceMarkdown = ({ date, diaryPath, artifactPath, evidenceHash, evidence }) => {
    const e = evidence || {};
    const tasks = e.tasks || {};
    const rawGit = e.git || {};
    const committed = summarizeFilteredFiles(rawGit.committed || {});
    const working = summarizeFilteredFiles(rawGit.working || {});
    const commits = filterReviewCommits(rawGit.commits || []);
    const diffFiles = filterReviewRecords(rawGit.diff?.files || []);
    const diffFromFiles = diffFiles.length
      ? {
          added: diffFiles.reduce((sum, f) => sum + (Number(f.added) || 0), 0),
          deleted: diffFiles.reduce((sum, f) => sum + (Number(f.deleted) || 0), 0),
          files: diffFiles
        }
      : {
          added: rawGit.diff?.added || 0,
          deleted: rawGit.diff?.deleted || 0,
          files: []
        };
    const git = {
      ...rawGit,
      commits,
      committed,
      working,
      diff: {
        ...diffFromFiles,
        net: (Number(diffFromFiles.added) || 0) - (Number(diffFromFiles.deleted) || 0)
      }
    };
    const excerptGroups = groupReviewExcerpts(e.excerpts || [], { maxChars: 1200, maxGroups: 8, maxBlocksPerGroup: 8 });
    const lines = [
      "---",
      `date: ${normalizeYmd(date)}`,
      `diary_path: ${normalizePath(diaryPath)}`,
      `artifact_path: ${normalizePath(artifactPath)}`,
      `evidence_hash: ${String(evidenceHash || "")}`,
      "---",
      "",
      "# Noria Daily Review Evidence",
      "",
      "## 任务统计",
      "",
      `- 完成：${tasks.done || 0}`,
      `- 未完成：${tasks.open || 0}`,
      `- 总数：${tasks.total || 0}`,
      "",
      "## 写作与日记",
      "",
      `- 日记字数：${e.diaryWords || 0}`,
      "",
      "## 笔记变化摘要（已过滤工具与依赖噪声）",
      "",
      `- 已提交笔记：${git.committed?.files?.length || 0}`,
      `- 未提交笔记：${git.working?.files?.length || 0}`,
      `- Diff 增加：${git.diff?.added || 0}`,
      `- Diff 删除：${git.diff?.deleted || 0}`,
      `- Diff 净变化：${git.diff?.net || 0}`,
      ...(commits.length
        ? [
            "",
            "## 今日提交",
            "",
            ...commits.map((x) => {
              const c = x.counts || {};
              const changed = [
                c.added ? `新增 ${c.added}` : "",
                c.modified ? `修改 ${c.modified}` : "",
                c.deleted ? `删除 ${c.deleted}` : "",
                c.renamed ? `重命名 ${c.renamed}` : ""
              ].filter(Boolean).join("，") || `${x.fileCount || 0} 个文件`;
              return `- ${x.time ? `${x.time} ` : ""}${x.shortHash || ""} ${x.message}（${changed}）`;
            })
          ]
        : []),
      "",
      "## 完成任务清单",
      "",
      ...(tasks.doneItems || []).map((x) => `- ${formatTaskEvidenceItem(x)}`),
      "",
      "## 未完成任务清单",
      "",
      ...(tasks.openItems || []).map((x) => `- ${formatTaskEvidenceItem(x)}`),
      "",
      "## 笔记增删改",
      "",
      ...(git.committed?.files || []).map((x) => `- committed ${x.kind}: ${x.path}`),
      ...(git.working?.files || []).map((x) => `- working ${x.kind}${x.approximate ? " (mtime approximate)" : ""}: ${x.path}`),
      "",
      "## 相关摘录",
      "",
      ...excerptGroups.flatMap((group) => [
        `### ${group.path}`,
        "",
        ...group.blocks.flatMap((block) => [
          `#### ${block.heading}`,
          "",
          String(block.text || "").trim(),
          ""
        ])
      ])
    ];
    return lines.join("\n").replace(/\n{4,}/g, "\n\n\n").trimEnd() + "\n";
  };

  root.utils.reviewCenter = {
    normalizePath,
    normalizeYmd,
    resolveDailyArtifactPath,
    resolveReviewNotePathFromDailyPath,
    isDailyNotePath,
    isReviewNotePath,
    parseReviewArtifact,
    hasGeneratedReviewContent,
    isArtifactStale,
    buildArtifactPreviewMarkdown,
    stableJson,
    hashString,
    createEvidenceHash,
    countWords,
    isReviewNoisePath,
    sanitizeReviewExcerptText,
    filterReviewRecords,
    filterReviewExcerpts,
    splitReviewExcerptBlocks,
    groupReviewExcerpts,
    countReviewExcerptBlocks,
    formatTaskEvidenceItem,
    parsePorcelainStatus,
    parseNameStatus,
    parseCommitLog,
    parseNumstat,
    summarizeFileChanges,
    buildDailyReviewPrompt,
    buildClaudianReviewPrompt,
    buildDailyEvidenceMarkdown
  };
})();
