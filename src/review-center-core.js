"use strict";

const { scanAtxHeadings } = require("./runtime/views/dashboard/core/utils/diary-day-blocks.js");

const REVIEW_MODES = new Set(["daily", "weekly", "monthly", "yearly"]);

function isDateId(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return false;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
  return Number.isFinite(date.getTime())
    && date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() + 1 === Number(match[2])
    && date.getUTCDate() === Number(match[3]);
}

function localDateId(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isoWeekId(dateId) {
  const date = new Date(`${dateId}T00:00:00Z`);
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const yearStart = new Date(`${String(date.getUTCFullYear()).padStart(4, "0")}-01-01T00:00:00Z`);
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function normalizeReviewSelection(input = {}, options = {}) {
  const source = input && typeof input === "object" ? input : {};
  const mode = REVIEW_MODES.has(source.mode) ? source.mode : "daily";
  const fallbackDate = isDateId(options.today) ? options.today : localDateId();
  if (source.anchorDate && !isDateId(source.anchorDate)) {
    throw new RangeError(`Invalid review date: ${source.anchorDate}`);
  }
  const anchorDate = isDateId(source.anchorDate) ? source.anchorDate : fallbackDate;
  let period = anchorDate;

  if (mode === "weekly") {
    period = isoWeekId(anchorDate);
  } else if (mode === "monthly") {
    period = anchorDate.slice(0, 7);
  } else if (mode === "yearly") {
    period = anchorDate.slice(0, 4);
  }
  const requestedPeriod = String(source.period || "").trim();
  if (REVIEW_MODES.has(source.mode) && requestedPeriod && requestedPeriod !== period) {
    throw new RangeError(`Review period ${requestedPeriod} does not match ${anchorDate} (${period})`);
  }

  const rawGeneration = Number(source.generation);
  const generation = Number.isFinite(rawGeneration) && rawGeneration >= 0
    ? Math.trunc(rawGeneration)
    : 0;

  return {
    mode,
    anchorDate,
    period,
    yearlyVariant: source.yearlyVariant === "week" ? "week" : "month",
    generation
  };
}

function reviewTargetKey(selection) {
  const normalized = normalizeReviewSelection(selection);
  return `${normalized.mode}:${normalized.period}`;
}

function createReviewGenerationGate(initialGeneration = 0) {
  let generation = Number.isFinite(Number(initialGeneration))
    ? Math.max(0, Math.trunc(Number(initialGeneration)))
    : 0;

  return {
    issue() {
      generation += 1;
      return generation;
    },
    invalidate() {
      generation += 1;
      return generation;
    },
    isCurrent(token) {
      return Number(token) === generation;
    },
    current() {
      return generation;
    }
  };
}

function normalizeSectionBody(value) {
  const lines = String(value || "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  while (lines.length && lines[0] === "") lines.shift();
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

function fingerprintReviewSection(value) {
  const normalized = normalizeSectionBody(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `review-v2-${hash.toString(16).padStart(8, "0")}`;
}

function findSection(markdown, heading) {
  const rawMarkdown = String(markdown || "");
  const normalizedMarkdown = rawMarkdown.replace(/\r\n?/g, "\n");
  const lines = normalizedMarkdown.split("\n");
  const requestedHeading = String(heading || "").trim();
  const headings = scanAtxHeadings(rawMarkdown);
  const startIndex = headings.findIndex((entry) => entry.level === 2 && entry.title === requestedHeading);
  const startLine = startIndex < 0 ? -1 : headings[startIndex].line;
  if (startLine < 0) {
    return { rawMarkdown, lines, startLine: -1, endLine: -1 };
  }

  const next = headings.slice(startIndex + 1).find((entry) => entry.level <= 2);
  const endLine = next ? next.line : lines.length;
  return { rawMarkdown, lines, startLine, endLine, start: headings[startIndex].start, end: next ? next.start : rawMarkdown.length };
}

function extractReviewSection(markdown, heading) {
  const requestedHeading = String(heading || "").trim();
  const section = findSection(markdown, requestedHeading);
  if (section.startLine < 0) {
    return {
      exists: false,
      heading: requestedHeading,
      body: "",
      startLine: -1,
      endLine: -1
    };
  }

  return {
    exists: true,
    heading: requestedHeading,
    body: normalizeSectionBody(section.lines.slice(section.startLine + 1, section.endLine).join("\n")),
    startLine: section.startLine,
    endLine: section.endLine
  };
}

function upsertReviewSection(markdown, heading, body) {
  const requestedHeading = String(heading || "").trim();
  const nextBody = normalizeSectionBody(body);
  const section = findSection(markdown, requestedHeading);
  const eol = /\r\n|\r|\n/.exec(section.rawMarkdown)?.[0] || "\n";

  if (section.startLine < 0) {
    const base = section.rawMarkdown;
    const block = [`## ${requestedHeading}`, "", nextBody].filter((line, index) => index < 2 || line !== "").join("\n");
    return {
      markdown: `${base}${base ? (base.endsWith(eol + eol) ? "" : base.endsWith(eol) ? eol : eol + eol) : ""}${block.replace(/\n/g, eol)}${eol}`,
      previousBody: "",
      existed: false,
      heading: requestedHeading
    };
  }

  const previousBody = normalizeSectionBody(
    section.lines.slice(section.startLine + 1, section.endLine).join("\n")
  );
  const before = section.rawMarkdown.slice(0, section.start);
  const after = section.rawMarkdown.slice(section.end);
  const replacement = [`## ${requestedHeading}`];
  if (nextBody) replacement.push("", ...nextBody.split("\n"));
  const nextMarkdown = `${before}${replacement.join(eol)}${eol}${after ? eol + after : ""}`;

  return {
    markdown: nextMarkdown,
    previousBody,
    existed: true,
    heading: requestedHeading
  };
}

function isPlainObject(value) {
  return !!value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.prototype.toString.call(value) === "[object Object]";
}

function normalizeRecoveryEntry(value, expectedTargetKey = "") {
  if (!isPlainObject(value) || value.schemaVersion !== 1) return null;
  const targetKey = String(value.targetKey || "").trim();
  const targetPath = String(value.targetPath || "").trim();
  const baseFingerprint = String(value.baseFingerprint || "").trim();
  const requiredTargetKey = String(expectedTargetKey || "").trim();
  const updatedAt = Number(value.updatedAt);
  if (!targetKey || !targetPath || !baseFingerprint || !isPlainObject(value.payload)) return null;
  if (requiredTargetKey && targetKey !== requiredTargetKey) return null;
  if (!Number.isFinite(updatedAt) || updatedAt < 0) return null;

  return {
    schemaVersion: 1,
    targetKey,
    targetPath,
    baseFingerprint,
    payload: JSON.parse(JSON.stringify(value.payload)),
    updatedAt,
    ...(value.draftId ? { draftId: String(value.draftId) } : {})
  };
}

function recoveryEntryMatches(entry, expected) {
  if (!entry || !expected?.draftId || entry.draftId !== expected.draftId) return false;
  return (!expected.targetPath || entry.targetPath === expected.targetPath)
    && (!expected.baseFingerprint || entry.baseFingerprint === expected.baseFingerprint)
    && (!expected.payload || JSON.stringify(entry.payload) === JSON.stringify(expected.payload));
}

function createReviewDraftId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

module.exports = {
  normalizeReviewSelection,
  reviewTargetKey,
  createReviewGenerationGate,
  fingerprintReviewSection,
  extractReviewSection,
  upsertReviewSection,
  normalizeRecoveryEntry,
  recoveryEntryMatches,
  createReviewDraftId
};
