"use strict";

const { scanMarkdownLines, scanAtxHeadings } = require("./runtime/views/dashboard/core/utils/diary-day-blocks.js");
const REVIEW_START = "%% noria:review:start %%";
const REVIEW_END = "%% noria:review:end %%";
const clean = value => String(value ?? "").replace(/\r\n?/g, "\n").replace(/^\n+|\n+$/g, "");

function rangeError(code = "review-range") {
  const error = new Error(code === "review-conflict" ? "The review changed outside this editor" : "The review range is missing or ambiguous");
  error.code = code;
  return error;
}

function fingerprintDocument(kind, markdown) {
  let hash = 2166136261;
  const input = `${kind}\n${clean(markdown)}`;
  for (let i = 0; i < input.length; i++) { hash ^= input.charCodeAt(i); hash = Math.imul(hash, 16777619) >>> 0; }
  return `review-doc-v1-${hash.toString(16).padStart(8, "0")}`;
}

function readReviewDocument(markdown, candidates = []) {
  const raw = String(markdown || "");
  const rows = scanMarkdownLines(raw);
  const starts = rows.filter(row => row.eligible && row.text.trim() === REVIEW_START);
  const ends = rows.filter(row => row.eligible && row.text.trim() === REVIEW_END);
  const suspicious = rows.some(row => row.eligible && /^ {0,3}%%\s*noria:review:(?:start|end)\b/.test(row.text)
    && row.text.trim() !== REVIEW_START && row.text.trim() !== REVIEW_END);
  if (suspicious || (starts.length + ends.length && (starts.length !== 1 || ends.length !== 1 || starts[0].start >= ends[0].start))) throw rangeError();
  const headings = scanAtxHeadings(raw);
  const titles = Array.isArray(candidates) ? candidates : [String(candidates)];
  let start = raw.length, end = raw.length, contentStart = raw.length, contentEnd = raw.length, kind = "absent";
  if (starts.length) {
    kind = "marked";
    start = starts[0].start; end = ends[0].end;
    contentStart = starts[0].end; contentEnd = ends[0].start;
  } else {
    const matches = headings.filter(h => h.level === 2 && titles.includes(h.title));
    if (matches.length > 1) throw rangeError();
    if (matches.length) {
      kind = "heading";
      const heading = matches[0];
      start = contentStart = heading.start;
      end = contentEnd = headings.find(h => h.start > heading.start && h.level <= heading.level)?.start ?? raw.length;
    }
  }
  const content = clean(raw.slice(contentStart, contentEnd));
  const first = scanAtxHeadings(content)[0];
  return {
    kind, exists: kind !== "absent", start, end, contentStart, contentEnd,
    startLine: rows.find(row => row.start === start)?.line ?? -1,
    heading: first?.start === 0 ? first.title : (titles[0] || ""),
    markdown: content, candidates: titles,
    fingerprint: fingerprintDocument(kind, content)
  };
}

function writeReviewDocument(markdown, binding, content) {
  const raw = String(markdown || "");
  const current = readReviewDocument(raw, binding.candidates || []);
  if (current.kind !== binding.kind) throw rangeError();
  if (current.fingerprint !== binding.fingerprint) throw rangeError("review-conflict");
  // Reserved boundaries in user input are never allowed to change the write range.
  const body = clean(content);
  if (scanMarkdownLines(body).some(row => row.eligible && /^ {0,3}%%\s*noria:review:(?:start|end)\b/.test(row.text))) throw rangeError();
  const eol = /\r\n|\n|\r/.exec(raw)?.[0] || "\n";
  const block = `${REVIEW_START}\n${body}${body ? "\n" : ""}${REVIEW_END}`.replace(/\n/g, eol);
  // An unfinished code fence or comment must not consume our closing boundary.
  const checked = readReviewDocument(block, []);
  if (checked.kind !== "marked" || checked.markdown !== body) throw rangeError();
  if (!current.exists) {
    const separator = !raw || raw.endsWith(eol + eol) ? "" : raw.endsWith(eol) ? eol : eol + eol;
    return raw + separator + block + eol;
  }
  const before = raw.slice(0, current.start), after = raw.slice(current.end);
  const ending = current.kind === "marked" ? (/[\r\n]$/.test(raw.slice(current.start, current.end)) ? eol : "") : eol + (after ? eol : "");
  return before + block + ending + after;
}

function splitReviewSections(markdown) {
  const raw = String(markdown || "");
  let headings = scanAtxHeadings(raw);
  let from = 0;
  if (headings[0]?.start === 0 && headings[0].level <= 2) { from = headings[0].end; headings = headings.slice(1); }
  const level = headings.length ? Math.min(...headings.map(h => h.level)) : 0;
  const top = headings.filter(h => h.level === level);
  const sections = [];
  const add = (start, end, heading) => {
    const text = raw.slice(start, end);
    if (!heading && !text.trim() && top.length) return;
    sections.push({ id: `part-${start}`, start, end, title: heading?.title || "", level: heading?.level || 0,
      markdown: text, content: clean(raw.slice(heading?.end ?? start, end)) });
  };
  if (!top.length) add(from, raw.length, null);
  else {
    if (raw.slice(from, top[0].start).trim()) add(from, top[0].start, null);
    top.forEach((heading, index) => add(heading.start, top[index + 1]?.start ?? raw.length, heading));
  }
  return sections;
}

function replaceReviewPart(markdown, part, nextText) {
  const raw = String(markdown || "");
  if (!part || raw.slice(part.start, part.end) !== part.markdown) throw rangeError("review-conflict");
  return raw.slice(0, part.start) + clean(nextText) + (part.end < raw.length ? "\n\n" : "") + raw.slice(part.end);
}

function previewReviewPart(markdown, limit = 480) {
  const raw = clean(markdown);
  if (raw.length <= limit) return { markdown: raw, truncated: false };
  const boundaries = scanMarkdownLines(raw).filter(row => row.eligible && !row.text.trim()).map(row => row.start);
  let stop = boundaries.filter(index => index <= limit).pop();
  // An oversized first block opens as a whole rather than being pixel-clipped.
  // This includes long paragraphs, tables, and code fences without blank lines.
  if (!stop) return { markdown: "", truncated: true };
  return { markdown: clean(raw.slice(0, stop)), truncated: stop < raw.length || raw.length > limit };
}

function legacyFieldText(payload, heading = "Review") {
  const zh = /[\u3400-\u9fff]/.test(heading);
  const labels = zh ? ["总结", "亮点", "偏差", "阻塞", "今日感恩", "感想（自由写）"] : ["Summary", "Highlight", "Deviation", "Blocker", "Gratitude", "Free writing"];
  const gdd = ["hi", "dev", "blk"].map((key, i) => payload.gdd?.[key] ? `- ${labels[i + 1]}${zh ? "：" : ": "}${payload.gdd[key]}` : "").filter(Boolean).join("\n");
  return [
    { titles: ["Summary", "总结"], title: labels[0], value: payload.summary },
    { titles: ["GDD"], title: "GDD", value: gdd },
    { titles: ["Gratitude", "今日感恩"], title: labels[4], value: payload.gratitude },
    { titles: ["Free writing", "感想", "感想（自由写）", "感想(自由写)"], title: labels[5], value: payload.thought }
  ].filter((_, index) => Object.hasOwn(payload, ["summary", "gdd", "gratitude", "thought"][index]));
}

// Older recovery files stored daily fields or an outer-heading-free period body.
// Convert them once at the read boundary; new editors only store Markdown.
function normalizeReviewPayload(payload, heading = "Review", savedMarkdown = "") {
  if (payload?.format === "markdown") return { format: "markdown", body: String(payload.body ?? "") };
  if (payload && typeof payload === "object" && !Object.hasOwn(payload, "body")) {
    let result = savedMarkdown || `## ${heading}\n\n`;
    for (const field of legacyFieldText(payload, heading)) {
      const headings = scanAtxHeadings(result);
      const matches = headings.filter(h => h.level === 3 && field.titles.includes(h.title));
      const value = clean(field.value);
      if (matches.length === 1) {
        const section = matches[0];
        const end = headings.find(h => h.start > section.start && h.level <= 3)?.start ?? result.length;
        const original = result.slice(section.end, end);
        const embedded = [...original.matchAll(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm)]
          .map(m => m[0]).filter(block => !value.includes(block));
        const retained = [value, ...embedded].filter(Boolean).join("\n\n");
        result = result.slice(0, section.start) + (retained ? `### ${section.title}\n\n${retained}\n\n` : "") + result.slice(end);
      } else if (value) result = clean(result) + `\n\n### ${field.title}\n\n${value}`;
    }
    return { format: "markdown", body: clean(result) };
  }
  const body = String(payload?.body ?? payload ?? "");
  return { format: "markdown", body: `## ${heading}${body ? "\n\n" + clean(body) : ""}` };
}

function hasReviewContent(markdown) {
  const body = prepareReviewPreview(markdown, { hideViews: true });
  return splitReviewSections(body).some(part => {
    const text = part.content.replace(/^ {0,3}#{1,6}\s.*$/gm, "").replace(/^\s*[-*]\s*(?:(?:亮点|偏差|阻塞|Highlight|Deviation|Blocker)\s*[：:])?\s*$/gmi, "");
    return !!text.trim();
  });
}

// Older captures could land inside a review marker before its explicit heading.
// Split only the presentation; the saved binding and its original text stay intact.
function reviewPresentation(markdown, heading) {
  const body=String(markdown || ""),matches=scanAtxHeadings(body).filter(h=>h.level===2 && h.title===heading);
  const start=matches.length===1?matches[0].start:0;
  return {leading:body.slice(0,start),review:body.slice(start),start};
}

function getReviewAnalysisSections(markdown) {
  const raw = clean(markdown).replace(/^---\n[\s\S]*?\n(?:---|\.\.\.)\s*\n/, "");
  return splitReviewSections(raw).filter(part => part.content.trim());
}

function appendReviewAnalysis(markdown, part) {
  let addition = clean(part.markdown);
  const depth = part.level ? Math.max(0, 3 - part.level) : 0;
  // Demote real headings only. Fenced examples retain their original text.
  for (const heading of scanAtxHeadings(addition).reverse()) {
    addition = addition.slice(0, heading.start) + addition.slice(heading.start).replace(/^( {0,3})#{1,6}/,
      (_, indent) => indent + "#".repeat(Math.min(6, heading.level + depth)));
  }
  return String(markdown || "") + (markdown ? "\n\n" : "") + addition;
}

function prepareReviewPreview(markdown, options = {}) {
  // Fragment line offsets are not vault-file offsets. Suppress code processors
  // and note transclusions that could expose a write control for the wrong line.
  let source = String(markdown || "");
  let opening;
  const replacements = [];
  for (const row of scanMarkdownLines(source)) {
    if (row.fenceStart) opening = row;
    if (row.fenceEnd && opening && /^(noria(?:-view)?|dataviewjs|dataview)$/.test(opening.fenceLanguage) && (options.sourcePath || options.hideViews)) replacements.push({ start: opening.start, end: row.end });
  }
  for (const range of replacements.reverse()) source = source.slice(0, range.start) + (options.hideViews ? "" : `[[${options.sourcePath}|${options.viewLabel || options.sourcePath}]]\n`) + source.slice(range.end);
  return source
    .replace(/^([ \t>]*(?:(?:[-+*]|\d+[.)])\s+)?)(`{3,}|~{3,})[^\r\n]*$/gm, "$1$2")
    .replace(/!\[\[([^\]\n]+)\]\]/g, (all, target) => /\.(?:png|jpe?g|gif|webp|svg|avif|bmp|pdf|mp3|wav|ogg|m4a|mp4|webm)(?:[|#]|$)/i.test(target) ? all : `[[${target}]]`);
}

module.exports = { REVIEW_START, REVIEW_END, readReviewDocument, writeReviewDocument, splitReviewSections, replaceReviewPart, previewReviewPart, normalizeReviewPayload, hasReviewContent, getReviewAnalysisSections, appendReviewAnalysis, prepareReviewPreview, reviewPresentation };
