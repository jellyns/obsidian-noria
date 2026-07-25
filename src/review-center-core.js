"use strict";

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
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function normalizeReviewSelection(input = {}, options = {}) {
  const source = input && typeof input === "object" ? input : {};
  const mode = REVIEW_MODES.has(source.mode) ? source.mode : "daily";
  const fallbackDate = isDateId(options.today) ? options.today : localDateId();
  const anchorDate = isDateId(source.anchorDate) ? source.anchorDate : fallbackDate;
  let period = anchorDate;

  if (mode === "weekly") {
    period = /^\d{4}-W\d{2}$/.test(String(source.period || ""))
      ? String(source.period)
      : isoWeekId(anchorDate);
  } else if (mode === "monthly") {
    period = /^\d{4}-\d{2}$/.test(String(source.period || ""))
      ? String(source.period)
      : anchorDate.slice(0, 7);
  } else if (mode === "yearly") {
    period = /^\d{4}$/.test(String(source.period || ""))
      ? String(source.period)
      : anchorDate.slice(0, 4);
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
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""));
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
  return `review-v1-${hash.toString(16).padStart(8, "0")}`;
}

function parseHeading(line) {
  const match = /^##[ \t]+(.+?)[ \t]*$/.exec(String(line || ""));
  return match ? match[1] : "";
}

function findSection(markdown, heading) {
  const normalizedMarkdown = String(markdown || "").replace(/\r\n?/g, "\n");
  const lines = normalizedMarkdown.split("\n");
  const requestedHeading = String(heading || "").trim();
  const startLine = lines.findIndex((line) => parseHeading(line) === requestedHeading);
  if (startLine < 0) {
    return { normalizedMarkdown, lines, startLine: -1, endLine: -1 };
  }

  let endLine = lines.length;
  for (let index = startLine + 1; index < lines.length; index += 1) {
    if (parseHeading(lines[index])) {
      endLine = index;
      break;
    }
  }
  return { normalizedMarkdown, lines, startLine, endLine };
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

  if (section.startLine < 0) {
    const base = section.normalizedMarkdown.replace(/\n+$/g, "");
    const block = [`## ${requestedHeading}`, "", nextBody].filter((line, index) => index < 2 || line !== "").join("\n");
    return {
      markdown: `${base}${base ? "\n\n" : ""}${block}\n`,
      previousBody: "",
      existed: false,
      heading: requestedHeading
    };
  }

  const previousBody = normalizeSectionBody(
    section.lines.slice(section.startLine + 1, section.endLine).join("\n")
  );
  const before = section.lines.slice(0, section.startLine);
  const after = section.lines.slice(section.endLine);
  const replacement = [`## ${requestedHeading}`];
  if (nextBody) replacement.push("", ...nextBody.split("\n"));
  if (after.length && after[0] !== "") replacement.push("");
  const nextLines = [...before, ...replacement, ...after];
  const nextMarkdown = nextLines.join("\n").replace(/\n*$/g, "\n");

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
    payload: { ...value.payload },
    updatedAt
  };
}

module.exports = {
  normalizeReviewSelection,
  reviewTargetKey,
  createReviewGenerationGate,
  fingerprintReviewSection,
  extractReviewSection,
  upsertReviewSection,
  normalizeRecoveryEntry
};
