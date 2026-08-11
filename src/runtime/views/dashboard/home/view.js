const opts = input || {};
const homeBridge = opts.noriaBridge || globalThis.__noriaRuntimeBridge || {};
const homeRuntimeBuildId = String(
  opts?.noriaBridge?.runtimeBuildId ||
  globalThis.__noriaRuntimeBuildId ||
  globalThis.__noriaRuntimeBridge?.runtimeBuildId ||
  "dev"
);
function homeRuntimeT(key, params = {}) {
  try {
    if (homeBridge && typeof homeBridge.t === "function") {
      const direct = homeBridge.t(key, params);
      if (direct && direct !== key) return String(direct);
    }
  } catch (_) {}
  try {
    const i18n = homeBridge && homeBridge.i18n ? homeBridge.i18n : null;
    const raw = (i18n?.messages && i18n.messages[key]) || (i18n?.fallback && i18n.fallback[key]) || key;
    return String(raw).replace(/\{([^}]+)\}/g, (_, name) => params[name] == null ? "" : String(params[name]));
  } catch (_) {
    return String(key || "");
  }
}

const HOME_PERF_LAST_KEY = "__noriaHomePerformanceLast";
const HOME_PERF_CURRENT_KEY = "__noriaHomePerformanceCurrent";
const HOME_PERF_SAMPLES_KEY = "__noriaHomePerformanceSamples";
const HOME_PERF_SUMMARY_KEY = "__noriaHomePerformanceSummary";

function homePerformanceNow() {
  try {
    if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now();
  } catch (_) {}
  return Date.now();
}

function roundHomeMs(value) {
  return Number(Math.max(0, Number(value || 0)).toFixed(2));
}

function homePercentile(values, pct) {
  const sorted = (Array.isArray(values) ? values : [])
    .map((value) => Number(value || 0))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((Number(pct || 0) / 100) * sorted.length) - 1));
  return roundHomeMs(sorted[rank]);
}

function summarizeHomePerformanceGroup(samples) {
  const totals = samples.map((sample) => sample.totalMs);
  return {
    count: samples.length,
    p50Ms: homePercentile(totals, 50),
    p95Ms: homePercentile(totals, 95),
    minMs: homePercentile(totals, 0),
    maxMs: homePercentile(totals, 100)
  };
}

function averageHomeMetric(samples, reader) {
  if (!samples.length || typeof reader !== "function") return 0;
  const sum = samples.reduce((total, sample) => total + Number(reader(sample) || 0), 0);
  return roundHomeMs(sum / samples.length);
}

function summarizeHomePerformanceEntries(samples, key, limit = 8) {
  const groups = new Map();
  (Array.isArray(samples) ? samples : []).forEach((sample) => {
    const entries = Array.isArray(sample?.[key]) ? sample[key] : [];
    entries.forEach((entry) => {
      const id = String(entry?.id || "").trim();
      const ms = Number(entry?.ms || 0);
      if (!id || !Number.isFinite(ms)) return;
      if (!groups.has(id)) groups.set(id, { id, values: [], lastMs: 0 });
      const group = groups.get(id);
      group.values.push(ms);
      group.lastMs = roundHomeMs(ms);
    });
  });
  return Array.from(groups.values())
    .map((group) => ({
      id: group.id,
      count: group.values.length,
      avgMs: averageHomeMetric(group.values.map((value) => ({ value })), (entry) => entry.value),
      p95Ms: homePercentile(group.values, 95),
      maxMs: homePercentile(group.values, 100),
      lastMs: group.lastMs
    }))
    .sort((a, b) => (
      Number(b.p95Ms || 0) - Number(a.p95Ms || 0) ||
      Number(b.maxMs || 0) - Number(a.maxMs || 0) ||
      Number(b.avgMs || 0) - Number(a.avgMs || 0) ||
      String(a.id).localeCompare(String(b.id))
    ))
    .slice(0, Math.max(1, Math.min(20, Number(limit || 8))));
}

function classifyHomePerformanceSample(sample) {
  const io = sample?.io || {};
  const snapshots = Array.isArray(sample?.snapshots) ? sample.snapshots : [];
  return Number(io.cacheHit || 0) > 0 || snapshots.some((entry) => entry?.cached) ? "hot" : "cold";
}

function createHomePerformanceSummary(samples, buildId) {
  const list = (Array.isArray(samples) ? samples : []).filter((sample) => sample && sample.type === "home-dashboard");
  const cold = list.filter((sample) => classifyHomePerformanceSample(sample) === "cold");
  const hot = list.filter((sample) => classifyHomePerformanceSample(sample) === "hot");
  const snapshotCalls = list.reduce((total, sample) => total + (Array.isArray(sample.snapshots) ? sample.snapshots.length : 0), 0);
  const cachedSnapshots = list.reduce(
    (total, sample) => total + (Array.isArray(sample.snapshots) ? sample.snapshots.filter((entry) => entry?.cached).length : 0),
    0
  );
  const last = list[list.length - 1] || {};
  return {
    type: "home-dashboard-summary",
    buildId,
    sampleCount: list.length,
    total: summarizeHomePerformanceGroup(list),
    cold: summarizeHomePerformanceGroup(cold),
    hot: summarizeHomePerformanceGroup(hot),
    io: {
      avgCtxLoad: averageHomeMetric(list, (sample) => sample.io?.ctxLoad),
      avgAdapterRead: averageHomeMetric(list, (sample) => sample.io?.adapterRead),
      avgCacheHit: averageHomeMetric(list, (sample) => sample.io?.cacheHit),
      avgCacheWrite: averageHomeMetric(list, (sample) => sample.io?.cacheWrite)
    },
    snapshots: {
      totalCalls: snapshotCalls,
      cachedCalls: cachedSnapshots,
      avgCalls: averageHomeMetric(list, (sample) => Array.isArray(sample.snapshots) ? sample.snapshots.length : 0)
    },
    slowest: {
      widgets: summarizeHomePerformanceEntries(list, "widgets"),
      sections: summarizeHomePerformanceEntries(list, "sections")
    },
    last: {
      status: String(last.status || ""),
      totalMs: roundHomeMs(last.totalMs),
      cacheState: classifyHomePerformanceSample(last)
    },
    updatedAt: new Date().toISOString()
  };
}

function updateHomePerformanceSamples(sample, sampleLimit) {
  try {
    const limit = Math.max(2, Math.min(120, Number(sampleLimit || 40)));
    const current = Array.isArray(globalThis[HOME_PERF_SAMPLES_KEY]) ? globalThis[HOME_PERF_SAMPLES_KEY] : [];
    const samples = current
      .filter((entry) => entry && entry.type === "home-dashboard" && entry.buildId === homeRuntimeBuildId)
      .concat([sample])
      .slice(-limit);
    globalThis[HOME_PERF_SAMPLES_KEY] = samples;
    globalThis[HOME_PERF_SUMMARY_KEY] = createHomePerformanceSummary(samples, homeRuntimeBuildId);
  } catch (_) {}
}

function createHomePerformanceRecorder() {
  const perfConfig = opts?.noriaBridge?.performance || globalThis.__noriaRuntimeBridge?.performance || {};
  const enabled = perfConfig.homeDashboardBaseline !== false;
  const limit = Math.max(20, Math.min(300, Number(perfConfig.homeDashboardBaselineLimit || 160)));
  const sampleLimit = Math.max(2, Math.min(120, Number(perfConfig.homeDashboardBaselineSampleLimit || 40)));
  const startedAt = homePerformanceNow();
  const state = {
    type: "home-dashboard",
    buildId: homeRuntimeBuildId,
    status: "running",
    totalMs: 0,
    io: {
      ctxLoad: 0,
      adapterRead: 0,
      cacheHit: 0,
      cacheWrite: 0
    },
    sections: [],
    widgets: [],
    snapshots: [],
    truncated: false
  };
  const pushLimited = (list, item) => {
    if (!enabled || !Array.isArray(list)) return;
    if (list.length < limit) list.push(item);
    else state.truncated = true;
  };
  const recorder = {
    state,
    markIo(kind, path) {
      if (!enabled) return;
      const key = String(kind || "");
      if (!Object.prototype.hasOwnProperty.call(state.io, key)) state.io[key] = 0;
      state.io[key] += 1;
      if (path && !state.firstIoPath) state.firstIoPath = String(path);
    },
    markSnapshot(info = {}) {
      if (!enabled) return;
      const request = info.request || {};
      pushLimited(state.snapshots, {
        preset: String(request.preset || ""),
        views: Array.isArray(request.views) ? request.views.slice(0, 8) : [],
        range: request.range ? { ...request.range } : undefined,
        cached: !!info.cached,
        ms: roundHomeMs(info.ms)
      });
    },
    async measure(kind, id, fn) {
      if (!enabled || typeof fn !== "function") return fn();
      const started = homePerformanceNow();
      try {
        return await fn();
      } finally {
        const list = kind === "widget" ? state.widgets : state.sections;
        pushLimited(list, {
          id: String(id || ""),
          ms: roundHomeMs(homePerformanceNow() - started)
        });
      }
    },
    finish(status = "ok") {
      if (!enabled) return;
      state.status = status;
      state.totalMs = roundHomeMs(homePerformanceNow() - startedAt);
      try {
        const sample = JSON.parse(JSON.stringify(state));
        globalThis[HOME_PERF_LAST_KEY] = sample;
        updateHomePerformanceSamples(sample, sampleLimit);
        if (globalThis[HOME_PERF_CURRENT_KEY] === recorder) delete globalThis[HOME_PERF_CURRENT_KEY];
      } catch (_) {}
    }
  };
  try {
    if (enabled) globalThis[HOME_PERF_CURRENT_KEY] = recorder;
  } catch (_) {}
  return recorder;
}

const homePerf = createHomePerformanceRecorder();

async function loadTextResult(path) {
  const normalized = String(path || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const perf = opts?.noriaBridge?.performance || globalThis.__noriaRuntimeBridge?.performance || {};
  const cacheEnabled = perf.viewSourceCache !== false;
  const cacheKey = `${homeRuntimeBuildId}:${normalized}`;
  const cache = (() => {
    if (!cacheEnabled) return null;
    try {
      if (globalThis.__noriaHomeViewSourceTextCacheBuildId !== homeRuntimeBuildId) {
        globalThis.__noriaHomeViewSourceTextCache = new Map();
        globalThis.__noriaHomeViewSourceTextCacheBuildId = homeRuntimeBuildId;
      }
      if (!globalThis.__noriaHomeViewSourceTextCache) {
        globalThis.__noriaHomeViewSourceTextCache = new Map();
      }
      return globalThis.__noriaHomeViewSourceTextCache;
    } catch (_) {
      return null;
    }
  })();
  if (cache && cache.has(cacheKey)) {
    homePerf.markIo("cacheHit", normalized);
    return { ok: true, text: String(cache.get(cacheKey) || ""), path: normalized };
  }
  const pending = (() => {
    if (!cacheEnabled) return null;
    try {
      if (globalThis.__noriaHomeViewSourceTextPendingBuildId !== homeRuntimeBuildId) {
        globalThis.__noriaHomeViewSourceTextPending = new Map();
        globalThis.__noriaHomeViewSourceTextPendingBuildId = homeRuntimeBuildId;
      }
      if (!globalThis.__noriaHomeViewSourceTextPending) {
        globalThis.__noriaHomeViewSourceTextPending = new Map();
      }
      return globalThis.__noriaHomeViewSourceTextPending;
    } catch (_) {
      return null;
    }
  })();
  if (pending && pending.has(cacheKey)) {
    homePerf.markIo("pendingHit", normalized);
    return pending.get(cacheKey);
  }
  const readTask = (async () => {
    let text = "";
    let readError = null;
    try {
      homePerf.markIo("ctxLoad", normalized || path);
      const txt = await ctx.io.load(normalized || path);
      if (txt != null) text = String(txt);
    } catch (e) {
      readError = e;
    }
    if (!text) {
      try {
        homePerf.markIo("adapterRead", normalized || path);
        const fallbackText = await app.vault.adapter.read(normalized);
        text = fallbackText != null ? String(fallbackText) : "";
        readError = null;
      } catch (e) {
        readError = readError || e;
      }
    }
    if (text && cache) {
      cache.set(cacheKey, text);
      homePerf.markIo("cacheWrite", normalized);
      if (cache.size > 128) {
        const firstKey = cache.keys().next().value;
        if (firstKey) cache.delete(firstKey);
      }
    }
    if (!text && readError) return { ok: false, text: "", path: normalized, error: readError };
    return { ok: true, text, path: normalized };
  })();
  if (pending) pending.set(cacheKey, readTask);
  try {
    return await readTask;
  } finally {
    try {
      if (pending?.get(cacheKey) === readTask) pending.delete(cacheKey);
    } catch (_) {}
  }
}

async function loadText(path) {
  const result = await loadTextResult(path);
  return result.text;
}

function markdownLoadErrorMessage(result) {
  return String(result?.error?.message || result?.error || "source unavailable");
}

function markdownSourceLoadFailedText(result) {
  return homeRuntimeT("runtime.home.markdown.loadFailed", { message: markdownLoadErrorMessage(result) });
}

function padHomeMarkdownDatePart(value) {
  return String(Math.max(0, Number(value) || 0)).padStart(2, "0");
}

function formatHomeMarkdownSourceMtime(value) {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const date = new Date(ms);
  if (!Number.isFinite(date.getTime())) return "";
  const month = padHomeMarkdownDatePart(date.getMonth() + 1);
  const day = padHomeMarkdownDatePart(date.getDate());
  const hours = padHomeMarkdownDatePart(date.getHours());
  const minutes = padHomeMarkdownDatePart(date.getMinutes());
  return `${month}-${day} ${hours}:${minutes}`;
}

function countHomeMarkdownSourceWords(markdown) {
  const text = String(markdown || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[[^\]]+\]\([^)]+\)/g, " ")
    .replace(/[#>*_\-\[\]()`~|:]/g, " ");
  const cjk = text.match(/[\u3400-\u9fff]/g)?.length || 0;
  const latin = text.replace(/[\u3400-\u9fff]/g, " ").match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g)?.length || 0;
  return cjk + latin;
}

function homeMarkdownPlainWikiLink(target, label) {
  const display = String(label || "").trim();
  if (display) return display;
  const raw = String(target || "").split("#")[0].split("/").filter(Boolean).pop() || "";
  return raw.replace(/\.[a-z0-9]+$/i, "").trim();
}

function normalizeHomeMarkdownExcerptCompare(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cleanHomeMarkdownExcerptLine(line) {
  let text = String(line || "").trim();
  if (!text) return "";
  if (/^<!--/.test(text)) return "";
  if (/^>\s*\[![^\]]+\]/.test(text)) return "";
  if (/^(\|?\s*:?-{3,}:?\s*)+\|?$/.test(text)) return "";
  if (/^[-*_]{3,}$/.test(text)) return "";
  text = text
    .replace(/^>\s?/, "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\s*[-*+]\s+\[[ xX-]\]\s+/, "")
    .replace(/^\s*[-*+]\s+/, "")
    .replace(/^\s*\d+[.)]\s+/, "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (_m, target, label) => homeMarkdownPlainWikiLink(target, label))
    .replace(/\[\[([^\]]+)\]\]/g, (_m, target) => homeMarkdownPlainWikiLink(target, ""))
    .replace(/<[^>]+>/g, " ")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}

function truncateHomeMarkdownExcerpt(value, maxLength = 96) {
  const chars = Array.from(String(value || "").trim());
  if (chars.length <= maxLength) return chars.join("");
  return `${chars.slice(0, Math.max(0, maxLength - 3)).join("").trimEnd()}...`;
}

function extractHomeMarkdownSourceExcerpt(markdown, source = {}) {
  const withoutFrontmatter = String(markdown || "").replace(/^---\s*[\r\n][\s\S]*?[\r\n]---\s*(?:[\r\n]|$)/, "");
  const skipValues = new Set(
    [source.label, source.title, source.description]
      .map((value) => normalizeHomeMarkdownExcerptCompare(value))
      .filter(Boolean)
  );
  let inFence = false;
  for (const rawLine of withoutFrontmatter.split(/\r?\n/)) {
    const trimmed = String(rawLine || "").trim();
    if (/^(```|~~~)/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const cleaned = cleanHomeMarkdownExcerptLine(rawLine);
    if (!cleaned) continue;
    if (skipValues.has(normalizeHomeMarkdownExcerptCompare(cleaned))) continue;
    return truncateHomeMarkdownExcerpt(cleaned);
  }
  return "";
}

function updateMarkdownSourceExcerpt(item, excerptEl, source, markdown) {
  const excerpt = extractHomeMarkdownSourceExcerpt(markdown, source);
  item?.setAttribute?.("data-noria-markdown-source-excerpt", excerpt);
  if (!excerptEl) return;
  excerptEl.textContent = excerpt;
  excerptEl.setAttribute?.("data-noria-markdown-source-excerpt", excerpt);
  if (!excerpt) {
    excerptEl.setAttribute?.("hidden", "true");
    excerptEl.hidden = true;
  } else {
    delete excerptEl.attrs?.hidden;
    excerptEl.hidden = false;
  }
  return excerpt;
}

function isHomeMarkdownUncheckedTaskLine(line) {
  return /^\s*[-*+]\s+\[(?:\s|-|\/)\]\s+/.test(String(line || ""));
}

function isHomeMarkdownActionLikeLine(line, role) {
  const text = String(line || "").trim();
  if (!text) return false;
  if (/^\s*(?:建议|下一步|行动|待办|确认|需确认|待确认|需要确认|TODO|Action|Next|Confirm)\s*[:：]/i.test(text)) return true;
  if (role === "note") return false;
  return /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(text);
}

function extractHomeMarkdownSourceActionSummary(markdown, source = {}) {
  const rawMarkdown = String(markdown || "");
  const frontmatterMatch = rawMarkdown.match(/^---\s*[\r\n][\s\S]*?[\r\n]---\s*(?:[\r\n]|$)/);
  const lineOffset = frontmatterMatch ? Math.max(0, frontmatterMatch[0].split(/\r?\n/).length - 1) : 0;
  const withoutFrontmatter = frontmatterMatch ? rawMarkdown.slice(frontmatterMatch[0].length) : rawMarkdown;
  const role = inferHomeMarkdownSourceRole(source);
  const skipValues = new Set(
    [source.label, source.title, source.description]
      .map((value) => normalizeHomeMarkdownExcerptCompare(value))
      .filter(Boolean)
  );
  const taskItems = [];
  const actionItems = [];
  let inFence = false;
  const lines = withoutFrontmatter.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const trimmed = String(rawLine || "").trim();
    if (/^(```|~~~)/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const isTask = isHomeMarkdownUncheckedTaskLine(rawLine);
    if (!isTask && /^\s*[-*+]\s+\[[xX]\]\s+/.test(String(rawLine || ""))) continue;
    if (!isTask && !isHomeMarkdownActionLikeLine(rawLine, role)) continue;
    const cleaned = cleanHomeMarkdownExcerptLine(rawLine);
    if (!cleaned) continue;
    if (skipValues.has(normalizeHomeMarkdownExcerptCompare(cleaned))) continue;
    if (/^(暂无|无|none|nothing)\b/i.test(cleaned)) continue;
    (isTask ? taskItems : actionItems).push({
      text: cleaned,
      line: lineOffset + index + 1
    });
  }
  const chosen = taskItems.length ? taskItems : actionItems;
  const first = chosen[0] ? truncateHomeMarkdownExcerpt(chosen[0].text, 84) : "";
  return { count: chosen.length, first, line: chosen[0]?.line || 0, role };
}

function extractHomeMarkdownSourceSections(markdown, source = {}) {
  const rawMarkdown = String(markdown || "");
  const frontmatterMatch = rawMarkdown.match(/^---\s*[\r\n][\s\S]*?[\r\n]---\s*(?:[\r\n]|$)/);
  const lineOffset = frontmatterMatch ? Math.max(0, frontmatterMatch[0].split(/\r?\n/).length - 1) : 0;
  const withoutFrontmatter = frontmatterMatch ? rawMarkdown.slice(frontmatterMatch[0].length) : rawMarkdown;
  const skipValues = new Set(
    [source.label, source.title, source.description]
      .map((value) => normalizeHomeMarkdownExcerptCompare(value))
      .filter(Boolean)
  );
  const sections = [];
  const seen = new Set();
  let inFence = false;
  const lines = withoutFrontmatter.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const trimmed = String(rawLine || "").trim();
    if (/^(```|~~~)/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!/^#{1,4}\s+/.test(trimmed)) continue;
    const cleaned = cleanHomeMarkdownExcerptLine(rawLine);
    if (!cleaned) continue;
    const normalized = normalizeHomeMarkdownExcerptCompare(cleaned);
    if (!normalized || skipValues.has(normalized) || seen.has(normalized)) continue;
    if (/^(目录|table of contents|toc)$/i.test(cleaned)) continue;
    seen.add(normalized);
    sections.push({ text: truncateHomeMarkdownExcerpt(cleaned, 42), line: lineOffset + index + 1 });
  }
  const visible = sections.slice(0, 3);
  const trail = visible.map((entry) => entry.text).filter(Boolean).join(" / ");
  return {
    count: sections.length,
    trail: truncateHomeMarkdownExcerpt(trail, 96),
    primary: sections[0]?.text || "",
    primaryLine: sections[0]?.line || 0
  };
}

function updateMarkdownSourceSections(item, sectionsEl, source, markdown) {
  const summary = extractHomeMarkdownSourceSections(markdown, source);
  item?.setAttribute?.("data-noria-markdown-source-section-count", String(summary.count || 0));
  item?.setAttribute?.("data-noria-markdown-source-sections", summary.trail || "");
  item?.setAttribute?.("data-noria-markdown-source-primary-section", summary.primary || "");
  if (summary.primaryLine > 0) item?.setAttribute?.("data-noria-markdown-source-primary-section-line", String(summary.primaryLine));
  if (!sectionsEl) return summary;
  sectionsEl.setAttribute?.("data-noria-markdown-source-section-count", String(summary.count || 0));
  sectionsEl.setAttribute?.("data-noria-markdown-source-sections", summary.trail || "");
  sectionsEl.setAttribute?.("data-noria-markdown-source-primary-section", summary.primary || "");
  sectionsEl.setAttribute?.("data-noria-markdown-source-primary-section-line", summary.primaryLine > 0 ? String(summary.primaryLine) : "");
  if (!summary.trail) {
    sectionsEl.textContent = "";
    sectionsEl.setAttribute?.("hidden", "true");
    sectionsEl.hidden = true;
    return summary;
  }
  bindHomeMarkdownSourceLineAction(sectionsEl, source, summary.primaryLine, {
    source: "home-markdown-briefing-section",
    kind: "open-markdown-section-source"
  });
  sectionsEl.textContent = homeRuntimeT("runtime.home.markdown.sourceSectionTrail", { text: summary.trail });
  delete sectionsEl.attrs?.hidden;
  sectionsEl.hidden = false;
  return summary;
}

function bindHomeMarkdownSourceLineAction(element, source, line, options = {}) {
  if (!element) return false;
  const sourcePath = homeActionPath(source?.path || source?.source || source?.file || source?.note);
  const targetLine = Number(line);
  if (!sourcePath || !Number.isFinite(targetLine) || targetLine <= 0) return false;
  element.setAttribute?.("role", "button");
  element.setAttribute?.("tabindex", "0");
  element.setAttribute?.("title", `${sourcePath}:${targetLine}`);
  element.setAttribute?.("data-noria-action-source", options.source || "home-markdown-briefing-source-line");
  element.setAttribute?.("data-noria-action-kind", options.kind || "open-markdown-source-line");
  element.setAttribute?.("data-noria-action-target-path", sourcePath);
  element.setAttribute?.("data-noria-action-target-line", String(targetLine));
  setHomeActionButtonState(element, "idle");
  const openSourceLine = async (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setHomeActionButtonState(element, "pending");
    try {
      await openHomeActionFile(sourcePath, { ...source, line: targetLine, newLeaf: false });
      setHomeActionButtonState(element, "ok");
    } catch (e) {
      const message = String(e?.message || e);
      setHomeActionButtonState(element, "failed", message);
      try {
        homeBridge?.runtime?.notice?.("runtime.home.action.failed", { label: source?.label || sourcePath, message });
      } catch (_) {}
    }
  };
  element.addEventListener?.("click", openSourceLine);
  element.addEventListener?.("keydown", (event) => {
    if (event?.key === "Enter" || event?.key === " ") {
      void openSourceLine(event);
    }
  });
  return true;
}

function updateMarkdownSourceActionHint(item, actionEl, source, markdown, excerpt = "") {
  const summary = extractHomeMarkdownSourceActionSummary(markdown, source);
  item?.setAttribute?.("data-noria-markdown-source-action-count", String(summary.count || 0));
  item?.setAttribute?.("data-noria-markdown-source-action", summary.first || "");
  item?.setAttribute?.("data-noria-markdown-source-action-line", summary.line > 0 ? String(summary.line) : "");
  if (!actionEl) return summary;
  actionEl.setAttribute?.("data-noria-markdown-source-action-count", String(summary.count || 0));
  actionEl.setAttribute?.("data-noria-markdown-source-action", summary.first || "");
  actionEl.setAttribute?.("data-noria-markdown-source-action-line", summary.line > 0 ? String(summary.line) : "");
  const duplicateExcerpt = summary.first && normalizeHomeMarkdownExcerptCompare(summary.first) === normalizeHomeMarkdownExcerptCompare(excerpt);
  if (!summary.first || duplicateExcerpt) {
    actionEl.textContent = "";
    actionEl.setAttribute?.("hidden", "true");
    actionEl.hidden = true;
    return summary;
  }
  bindHomeMarkdownSourceLineAction(actionEl, source, summary.line, {
    source: "home-markdown-briefing-action",
    kind: "open-markdown-action-source"
  });
  actionEl.textContent = homeRuntimeT("runtime.home.markdown.sourceActionHint", { text: summary.first });
  delete actionEl.attrs?.hidden;
  actionEl.hidden = false;
  return summary;
}

function suppressHomeMarkdownSourceActionHintForWorkbench(actionEl, hasActionWorkbench) {
  if (!actionEl?.setAttribute) return;
  actionEl.setAttribute("data-noria-markdown-source-action-workbench", hasActionWorkbench ? "true" : "false");
  if (!hasActionWorkbench) return;
  actionEl.setAttribute("data-noria-markdown-source-action-visibility", "workbench");
  actionEl.setAttribute("hidden", "true");
  actionEl.hidden = true;
}

async function getHomeMarkdownSourceMtime(pathText) {
  const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized) return 0;
  try {
    const file =
      app?.vault?.getAbstractFileByPath?.(normalized) ||
      app?.vault?.getFileByPath?.(normalized);
    const mtime = Number(file?.stat?.mtime);
    if (Number.isFinite(mtime) && mtime > 0) return mtime;
  } catch (_) {}
  try {
    const stat = await app?.vault?.adapter?.stat?.(normalized);
    const mtime = Number(stat?.mtime);
    if (Number.isFinite(mtime) && mtime > 0) return mtime;
  } catch (_) {}
  return 0;
}

const HOME_MARKDOWN_SOURCE_ROLE_META = {
  daily: { labelKey: "runtime.home.markdown.roleDaily", freshHours: 36 },
  current: { labelKey: "runtime.home.markdown.roleCurrent", freshHours: 72 },
  weekly: { labelKey: "runtime.home.markdown.roleWeekly", freshHours: 240 },
  project: { labelKey: "runtime.home.markdown.roleProject", freshHours: 168 },
  note: { labelKey: "runtime.home.markdown.roleNote", freshHours: 0 }
};

function normalizeHomeMarkdownSourceRole(value) {
  const raw = homeActionText(value).trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (!raw) return "";
  if (["daily", "day", "daily-brief", "daily-briefing"].includes(raw)) return "daily";
  if (["current", "advice", "suggestion", "suggestions", "now"].includes(raw)) return "current";
  if (["weekly", "week", "weekly-review", "week-review"].includes(raw)) return "weekly";
  if (["project", "projects", "monitor", "radar", "project-monitor"].includes(raw)) return "project";
  if (["note", "md", "markdown"].includes(raw)) return "note";
  return "";
}

function inferHomeMarkdownSourceRole(source = {}) {
  const explicit = normalizeHomeMarkdownSourceRole(source.role || source.kind || source.type || source.category);
  if (explicit) return explicit;
  const haystack = [source.label, source.title, source.name, source.description, source.path, source.source, source.file, source.note]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
  if (/(每日|日简报|日报|daily|today)/i.test(haystack)) return "daily";
  if (/(当前|建议|current|advice|suggestion)/i.test(haystack)) return "current";
  if (/(周报|周回顾|周复盘|weekly|week)/i.test(haystack)) return "weekly";
  if (/(项目|监控|雷达|project|monitor|radar|github)/i.test(haystack)) return "project";
  return "note";
}

function normalizeHomeMarkdownFreshHours(value, fallback = 0) {
  if (value == null || value === "") return fallback;
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return fallback;
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|d|day|days)?$/);
  if (!match) return fallback;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return fallback;
  const unit = match[2] || "h";
  const hours = /^d/.test(unit) ? amount * 24 : amount;
  return Math.max(0, Math.round(hours));
}

function getHomeMarkdownSourceRoleMeta(source = {}) {
  const role = inferHomeMarkdownSourceRole(source);
  const base = HOME_MARKDOWN_SOURCE_ROLE_META[role] || HOME_MARKDOWN_SOURCE_ROLE_META.note;
  const freshHours = normalizeHomeMarkdownFreshHours(
    source.maxAgeHours ?? source.freshHours ?? source.staleAfterHours ?? source.maxAge,
    base.freshHours
  );
  return {
    role,
    labelKey: base.labelKey,
    freshHours
  };
}

function getHomeMarkdownFreshnessStatus(mtime, freshHours) {
  const hours = Number(freshHours);
  if (!Number.isFinite(hours) || hours <= 0) return "";
  if (!mtime) return "unknown";
  const ageHours = Math.max(0, (Date.now() - Number(mtime)) / 3600000);
  return ageHours <= hours ? "fresh" : "stale";
}

function homeMarkdownFreshnessLabelKey(status) {
  if (status === "fresh") return "runtime.home.markdown.sourceFresh";
  if (status === "stale") return "runtime.home.markdown.sourceStale";
  return "runtime.home.markdown.sourceUnknownFreshness";
}

function createHomeMarkdownBriefingStats(total = 0) {
  return {
    total: Math.max(0, Number(total) || 0),
    ready: 0,
    empty: 0,
    failed: 0,
    fresh: 0,
    stale: 0,
    unknown: 0,
    actions: 0,
    words: 0,
    actionCandidates: [],
    sourcePriority: [],
    priority: null
  };
}

function homeMarkdownBriefingState(stats = {}) {
  if ((Number(stats.failed) || 0) > 0) return "failed";
  if ((Number(stats.stale) || 0) > 0) return "stale";
  const total = Number(stats.total) || 0;
  const settled = (Number(stats.ready) || 0) + (Number(stats.empty) || 0) + (Number(stats.failed) || 0);
  return total > 0 && settled >= total ? "ready" : "loading";
}

function homeMarkdownPriorityReasonLabelKey(reason) {
  if (reason === "failed") return "runtime.home.markdown.priorityFailed";
  if (reason === "stale") return "runtime.home.markdown.priorityStale";
  if (reason === "action") return "runtime.home.markdown.priorityAction";
  if (reason === "ready") return "runtime.home.markdown.priorityReady";
  return "runtime.home.markdown.priorityPending";
}

function createHomeMarkdownBriefingPriority(record = {}) {
  const source = record.source && typeof record.source === "object" ? record.source : {};
  const label = homeActionText(record.label || source.label || source.title || source.name || source.path);
  const path = homeActionPath(record.path || source.path || source.source || source.file || source.note);
  const state = homeActionText(record.state || "loading").toLowerCase();
  const freshness = homeActionText(record.freshness || "").toLowerCase();
  const actionCount = Math.max(0, Number(record.actionCount || 0) || 0);
  const actionLine = Math.max(0, Number(record.actionLine || 0) || 0);
  let priorityReason = "";
  let score = 0;
  if (state === "failed") {
    priorityReason = "failed";
    score = 500;
  } else if (freshness === "stale") {
    priorityReason = "stale";
    score = 400;
  } else if (actionCount > 0) {
    priorityReason = "action";
    score = 300;
  } else if (state === "ready") {
    priorityReason = "ready";
    score = 100;
  } else {
    priorityReason = "pending";
    score = 10;
  }
  return {
    index: Math.max(0, Number(record.index || 0) || 0),
    item: record.item || null,
    label,
    path,
    state,
    freshness,
    actionCount,
    actionLine,
    targetLine: priorityReason === "action" && actionLine > 0 ? actionLine : 0,
    priorityReason,
    reasonLabel: homeRuntimeT(homeMarkdownPriorityReasonLabelKey(priorityReason)),
    score
  };
}

function setHomeMarkdownBriefingPriorityAttrs(el, priority) {
  if (!el?.setAttribute) return;
  const hasPriority = priority && priority.path;
  const attrs = {
    "data-noria-markdown-briefing-priority-path": hasPriority ? priority.path : "",
    "data-noria-markdown-briefing-priority-label": hasPriority ? priority.label : "",
    "data-noria-markdown-briefing-priority-state": hasPriority ? priority.state : "",
    "data-noria-markdown-briefing-priority-reason": hasPriority ? priority.priorityReason : "",
    "data-noria-markdown-briefing-priority-line": hasPriority && priority.targetLine > 0 ? priority.targetLine : ""
  };
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value || ""));
}

function appendHomeMarkdownBriefingPriority(overview, priority) {
  if (!overview || !priority?.path) return null;
  const targetLine = Math.max(0, Number(priority.targetLine || 0) || 0);
  const actionKind = targetLine > 0 ? "open-markdown-action-source" : "open-markdown-source";
  const text = homeRuntimeT("runtime.home.markdown.prioritySource", {
    label: priority.label || priority.path,
    reason: priority.reasonLabel || priority.priorityReason
  });
  const cue = overview.createEl("span", {
    cls: "dashboard-home-markdown-briefing-priority",
    text
  });
  cue.setAttribute?.("data-noria-markdown-briefing-priority-path", priority.path);
  cue.setAttribute?.("data-noria-markdown-briefing-priority-label", priority.label || "");
  cue.setAttribute?.("data-noria-markdown-briefing-priority-state", priority.state || "");
  cue.setAttribute?.("data-noria-markdown-briefing-priority-reason", priority.priorityReason || "");
  cue.setAttribute?.("data-noria-markdown-briefing-priority-line", targetLine > 0 ? String(targetLine) : "");
  cue.setAttribute?.("role", "button");
  cue.setAttribute?.("tabindex", "0");
  cue.setAttribute?.("title", targetLine > 0 ? `${priority.path}:${targetLine}` : priority.path);
  cue.setAttribute?.("data-noria-action-source", "home-markdown-briefing-priority");
  cue.setAttribute?.("data-noria-action-kind", actionKind);
  cue.setAttribute?.("data-noria-action-target-path", priority.path);
  if (targetLine > 0) cue.setAttribute?.("data-noria-action-target-line", String(targetLine));
  setHomeActionButtonState(cue, "idle");
  const openPrioritySource = async (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (!priority.path) return;
    setHomeActionButtonState(cue, "pending");
    try {
      await openHomeActionFile(priority.path, { newLeaf: false, line: targetLine > 0 ? targetLine : undefined });
      setHomeActionButtonState(cue, "ok");
    } catch (e) {
      const message = String(e?.message || e);
      setHomeActionButtonState(cue, "failed", message);
      try {
        homeBridge?.runtime?.notice?.("runtime.home.action.failed", { label: priority.label || priority.path, message });
      } catch (_) {}
    }
  };
  cue.addEventListener?.("click", openPrioritySource);
  cue.addEventListener?.("keydown", (event) => {
    if (event?.key === "Enter" || event?.key === " ") {
      void openPrioritySource(event);
    }
  });
  return cue;
}

function updateHomeMarkdownBriefingSourcePriority(stats, item, record = {}) {
  if (!stats || !Array.isArray(stats.sourcePriority)) return null;
  const priority = createHomeMarkdownBriefingPriority({ ...record, item });
  stats.sourcePriority[priority.index] = priority;
  const ranked = stats.sourcePriority
    .filter((entry) => entry && entry.path)
    .sort((a, b) => (b.score - a.score) || (a.index - b.index));
  ranked.forEach((entry, rank) => {
    entry.item?.setAttribute?.("data-noria-markdown-source-priority-rank", String(rank + 1));
    entry.item?.setAttribute?.("data-noria-markdown-source-priority-reason", entry.priorityReason || "");
  });
  stats.priority = ranked[0] || null;
  return stats.priority;
}

function updateHomeMarkdownBriefingActionCandidate(stats, record = {}) {
  if (!stats || !Array.isArray(stats.actionCandidates)) return null;
  const source = record.source && typeof record.source === "object" ? record.source : {};
  const summary = record.actionSummary && typeof record.actionSummary === "object" ? record.actionSummary : {};
  const path = homeActionPath(source.path || source.source || source.file || source.note || record.path);
  const line = Math.max(0, Number(summary.line || record.line || 0) || 0);
  const text = homeActionText(summary.first || record.text || "");
  const index = Math.max(0, Number(record.index || 0) || 0);
  if (!path || !line || !text) {
    stats.actionCandidates[index] = null;
    return null;
  }
  const priority = createHomeMarkdownBriefingPriority({
    source,
    index,
    state: record.state || "ready",
    freshness: record.freshness || "",
    actionCount: summary.count || record.count || 0,
    actionLine: line
  });
  const candidate = {
    index,
    label: homeActionText(source.label || source.title || source.name || path),
    path,
    line,
    text,
    count: Math.max(0, Number(summary.count || record.count || 0) || 0),
    role: inferHomeMarkdownSourceRole(source),
    freshness: homeActionText(record.freshness || ""),
    priorityReason: priority.priorityReason || "action",
    score: priority.score || 0
  };
  stats.actionCandidates[index] = candidate;
  return candidate;
}

const HOME_MARKDOWN_ACTION_LANES = [
  { id: "today", labelKey: "runtime.home.markdown.actionLaneToday" },
  { id: "confirm", labelKey: "runtime.home.markdown.actionLaneConfirm" },
  { id: "monitor", labelKey: "runtime.home.markdown.actionLaneMonitor" },
  { id: "later", labelKey: "runtime.home.markdown.actionLaneLater" }
];

function classifyHomeMarkdownBriefingActionLane(candidate = {}) {
  const role = homeActionText(candidate.role || "").toLowerCase();
  const text = `${candidate.text || ""} ${candidate.label || ""}`.toLowerCase();
  if (/(确认|核对|决定|决策|审阅|检查|confirm|verify|decide|review)/i.test(text)) return "confirm";
  if (role === "project" || /(项目|监控|风险|阻塞|里程碑|project|monitor|risk|blocked|milestone)/i.test(text)) return "monitor";
  if (role === "weekly" || /(稍后|回顾|周报|周回顾|later|weekly)/i.test(text)) return "later";
  return "today";
}

function getHomeMarkdownBriefingActionLaneMeta(laneId) {
  return HOME_MARKDOWN_ACTION_LANES.find((entry) => entry.id === laneId) || HOME_MARKDOWN_ACTION_LANES[0];
}

function getHomeMarkdownBriefingActionCandidates(stats = {}) {
  return Array.isArray(stats.actionCandidates)
    ? stats.actionCandidates
      .filter((entry) => entry && entry.path && entry.line > 0 && entry.text)
      .sort((a, b) => ((Number(b.score) || 0) - (Number(a.score) || 0)) || (a.index - b.index))
      .slice(0, 4)
      .map((entry, idx) => ({
        ...entry,
        rank: idx + 1,
        lane: classifyHomeMarkdownBriefingActionLane(entry)
      }))
    : [];
}

function setHomeMarkdownBriefingStatsAttrs(el, stats = {}) {
  if (!el?.setAttribute) return;
  const attrs = {
    "data-noria-markdown-briefing-state": homeMarkdownBriefingState(stats),
    "data-noria-markdown-briefing-total": stats.total || 0,
    "data-noria-markdown-briefing-ready": stats.ready || 0,
    "data-noria-markdown-briefing-empty": stats.empty || 0,
    "data-noria-markdown-briefing-failed": stats.failed || 0,
    "data-noria-markdown-briefing-fresh": stats.fresh || 0,
    "data-noria-markdown-briefing-stale": stats.stale || 0,
    "data-noria-markdown-briefing-unknown": stats.unknown || 0,
    "data-noria-markdown-briefing-actions": stats.actions || 0,
    "data-noria-markdown-briefing-words": stats.words || 0
  };
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, String(value));
  }
}

function appendHomeMarkdownBriefingOverviewFact(overview, kind, labelKey, count) {
  if (!overview || count == null) return null;
  const fact = overview.createEl("span", {
    cls: "dashboard-home-markdown-briefing-overview-fact",
    text: homeRuntimeT(labelKey, { count: String(count) })
  });
  fact.addClass?.(`dashboard-home-markdown-briefing-overview-${kind}`);
  fact.setAttribute?.("data-noria-markdown-briefing-fact", kind);
  fact.setAttribute?.("data-noria-markdown-briefing-count", String(count));
  return fact;
}

function appendHomeMarkdownBriefingActionCandidates(overview, stats = {}) {
  const candidates = getHomeMarkdownBriefingActionCandidates(stats);
  if (!overview || !candidates.length) return null;
  const list = overview.createEl("span", {
    cls: "dashboard-home-markdown-briefing-action-list"
  });
  list.addClass?.("dashboard-home-markdown-briefing-action-workbench");
  list.setAttribute?.("data-noria-markdown-briefing-workbench", "action-first");
  list.setAttribute?.("data-noria-markdown-briefing-action-count", String(candidates.length));
  list.setAttribute?.("data-noria-markdown-briefing-action-total", String((stats.actions || 0)));
  const laneGroups = [];
  const laneById = new Map();
  candidates.forEach((candidate) => {
    const laneId = candidate.lane || "today";
    if (!laneById.has(laneId)) {
      const group = { id: laneId, items: [], firstRank: candidate.rank || laneGroups.length + 1 };
      laneById.set(laneId, group);
      laneGroups.push(group);
    }
    laneById.get(laneId).items.push(candidate);
  });
  laneGroups.sort((a, b) => (a.firstRank - b.firstRank));
  list.setAttribute?.("data-noria-markdown-briefing-action-lanes", laneGroups.map((group) => group.id).join(" "));
  laneGroups.forEach((group) => {
    const meta = getHomeMarkdownBriefingActionLaneMeta(group.id);
    const lane = list.createEl("span", {
      cls: "dashboard-home-markdown-briefing-action-lane"
    });
    lane.setAttribute?.("data-noria-markdown-briefing-action-lane", group.id);
    lane.setAttribute?.("data-noria-markdown-briefing-action-lane-count", String(group.items.length));
    lane.createEl("span", {
      cls: "dashboard-home-markdown-briefing-action-lane-label",
      text: homeRuntimeT(meta.labelKey)
    });
    const items = lane.createEl("span", {
      cls: "dashboard-home-markdown-briefing-action-lane-items"
    });
    group.items.forEach((candidate) => {
      const action = items.createEl("span", {
      cls: "dashboard-home-markdown-briefing-action-candidate",
      text: homeRuntimeT("runtime.home.markdown.actionCandidate", {
        label: candidate.label || candidate.path,
        text: candidate.text
      })
    });
      action.setAttribute?.("data-noria-markdown-briefing-action-rank", String(candidate.rank || 0));
      action.setAttribute?.("data-noria-markdown-briefing-action-lane", group.id);
      action.setAttribute?.("data-noria-markdown-briefing-action-source-label", candidate.label || "");
      action.setAttribute?.("data-noria-markdown-briefing-action-source-role", candidate.role || "");
      action.setAttribute?.("data-noria-markdown-briefing-action-text", candidate.text || "");
      action.setAttribute?.("data-noria-markdown-briefing-action-count", String(candidate.count || 0));
      action.setAttribute?.("data-noria-markdown-briefing-action-priority-reason", candidate.priorityReason || "");
      action.setAttribute?.("data-noria-markdown-briefing-action-score", String(candidate.score || 0));
      action.setAttribute?.("data-noria-markdown-briefing-action-freshness", candidate.freshness || "");
      bindHomeMarkdownSourceLineAction(action, { path: candidate.path, label: candidate.label }, candidate.line, {
        source: "home-markdown-briefing-overview-action",
        kind: "open-markdown-action-source"
      });
    });
  });
  return list;
}

function updateHomeMarkdownBriefingOverview(body, overview, stats = {}) {
  setHomeMarkdownBriefingStatsAttrs(body, stats);
  setHomeMarkdownBriefingStatsAttrs(overview, stats);
  if (!overview?.empty) return;
  overview.empty();
  setHomeMarkdownBriefingPriorityAttrs(body, stats.priority);
  setHomeMarkdownBriefingPriorityAttrs(overview, stats.priority);
  const hasActionWorkbench = getHomeMarkdownBriefingActionCandidates(stats).length > 0;
  body?.setAttribute?.("data-noria-markdown-briefing-has-action-workbench", hasActionWorkbench ? "true" : "false");
  overview?.setAttribute?.("data-noria-markdown-briefing-has-action-workbench", hasActionWorkbench ? "true" : "false");
  if (!hasActionWorkbench) appendHomeMarkdownBriefingPriority(overview, stats.priority);
  const loaded = (Number(stats.ready) || 0) + (Number(stats.empty) || 0);
  if (!hasActionWorkbench) {
    appendHomeMarkdownBriefingOverviewFact(overview, "sources", "runtime.home.markdown.groupSources", stats.total || 0);
    if (loaded > 0) appendHomeMarkdownBriefingOverviewFact(overview, "ready", "runtime.home.markdown.groupReady", loaded);
  }
  if ((Number(stats.failed) || 0) > 0) appendHomeMarkdownBriefingOverviewFact(overview, "failed", "runtime.home.markdown.groupFailed", stats.failed);
  if ((Number(stats.stale) || 0) > 0) appendHomeMarkdownBriefingOverviewFact(overview, "stale", "runtime.home.markdown.groupStale", stats.stale);
  if (!hasActionWorkbench && (Number(stats.actions) || 0) > 0) appendHomeMarkdownBriefingOverviewFact(overview, "actions", "runtime.home.markdown.groupActions", stats.actions);
  appendHomeMarkdownBriefingActionCandidates(overview, stats);
}

async function updateMarkdownSourceFacts(item, factsEl, source, markdown, actionSummary = {}) {
  const emptyResult = { words: 0, freshness: "", actionCount: Number(actionSummary?.count || 0) || 0, mtime: 0, role: "" };
  if (!factsEl) return emptyResult;
  const sourceInfo = source && typeof source === "object" ? source : { path: source };
  const sourcePath = sourceInfo.path || source;
  const roleMeta = getHomeMarkdownSourceRoleMeta(sourceInfo);
  const words = countHomeMarkdownSourceWords(markdown);
  item?.setAttribute?.("data-noria-markdown-source-words", String(words));
  item?.setAttribute?.("data-noria-markdown-source-role", roleMeta.role);
  if (roleMeta.freshHours > 0) item?.setAttribute?.("data-noria-markdown-source-fresh-hours", String(roleMeta.freshHours));
  const mtime = await getHomeMarkdownSourceMtime(sourcePath);
  if (mtime) {
    item?.setAttribute?.("data-noria-markdown-source-mtime", String(mtime));
    const updated = factsEl.createEl("span", {
      cls: "dashboard-home-markdown-source-updated",
      text: homeRuntimeT("runtime.home.markdown.sourceUpdated", { date: formatHomeMarkdownSourceMtime(mtime) })
    });
    updated.setAttribute?.("data-noria-markdown-source-fact", "updated");
  }
  const freshness = getHomeMarkdownFreshnessStatus(mtime, roleMeta.freshHours);
  if (freshness) {
    item?.setAttribute?.("data-noria-markdown-source-freshness", freshness);
    const fresh = factsEl.createEl("span", {
      cls: "dashboard-home-markdown-source-freshness",
      text: homeRuntimeT(homeMarkdownFreshnessLabelKey(freshness))
    });
    fresh.setAttribute?.("data-noria-markdown-source-fact", "freshness");
    fresh.setAttribute?.("data-noria-markdown-source-freshness", freshness);
  }
  const size = factsEl.createEl("span", {
    cls: "dashboard-home-markdown-source-size",
    text: homeRuntimeT("runtime.home.markdown.sourceWords", { count: String(words) })
  });
  size.setAttribute?.("data-noria-markdown-source-fact", "words");
  const actionCount = Number(actionSummary?.count || 0);
  if (actionCount > 0) {
    const action = factsEl.createEl("span", {
      cls: "dashboard-home-markdown-source-action-count",
      text: homeRuntimeT("runtime.home.markdown.sourceActions", { count: String(actionCount) })
    });
    action.setAttribute?.("data-noria-markdown-source-fact", "actions");
    action.setAttribute?.("data-noria-markdown-source-action-count", String(actionCount));
  }
  return { words, freshness, actionCount, mtime, role: roleMeta.role };
}

function hashViewSource(value) {
  const text = String(value || "");
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}

function getHomeViewExecutionContract(viewPath) {
  const raw = String(viewPath || "").trim();
  const normalized = raw.replace(/\\/g, "/").replace(/\/+$/, "");
  const lower = normalized.toLowerCase();
  const fail = (reason) => ({ raw, normalized, allowed: false, reason, kind: "blocked", buildId: homeRuntimeBuildId });
  if (!normalized) return fail("empty");
  if (/[\u0000-\u001f]/.test(normalized)) return fail("control-character");
  if (/^[a-z][a-z0-9+.-]*:/i.test(normalized)) return fail("protocol");
  if (/^[a-z]:\//i.test(normalized) || normalized.startsWith("/") || normalized.startsWith("//")) return fail("absolute-path");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.includes("..")) return fail("path-traversal");
  const kind = lower.startsWith(".obsidian/plugins/noria/views/") || lower.startsWith("views/")
    ? "builtin"
    : "custom-vault";
  if (kind === "custom-vault" && homeBridge.allowCustomJsViews !== true) {
    return fail("custom-js-disabled");
  }
  return { raw, normalized, allowed: true, reason: "", kind, buildId: homeRuntimeBuildId };
}

function recordHomeViewExecution(contract, patch = {}) {
  try {
    globalThis.__noriaHomeViewExecutionLast = {
      ...contract,
      ...patch,
      buildId: homeRuntimeBuildId,
      ts: Date.now()
    };
  } catch (_) {}
}

function getCachedViewRunner(sourcePath, sourceCode) {
  const perf = input?.noriaBridge?.performance || globalThis.__noriaRuntimeBridge?.performance || {};
  const cacheEnabled = perf.viewSourceCache !== false;
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  if (!cacheEnabled) {
    return new AsyncFunction("ctx", "input", "app", "moment", "window", "document", "globalThis", String(sourceCode));
  }
  const g = globalThis;
  if (g.__noriaHomeViewRunCacheBuildId !== homeRuntimeBuildId) {
    g.__noriaHomeViewRunCache = new Map();
    g.__noriaHomeViewRunCacheBuildId = homeRuntimeBuildId;
  }
  if (!g.__noriaHomeViewRunCache) g.__noriaHomeViewRunCache = new Map();
  const cache = g.__noriaHomeViewRunCache;
  const key = `${homeRuntimeBuildId}:${sourcePath}:${hashViewSource(sourceCode)}`;
  let run = cache.get(key);
  if (!run) {
    run = new AsyncFunction("ctx", "input", "app", "moment", "window", "document", "globalThis", String(sourceCode));
    cache.set(key, run);
    if (cache.size > 64) {
      const firstKey = cache.keys().next().value;
      if (firstKey) cache.delete(firstKey);
    }
  }
  return run;
}

async function runCustomViewByPath(viewPath, viewInput) {
  const contract = getHomeViewExecutionContract(viewPath);
  recordHomeViewExecution(contract, { status: contract.allowed ? "accepted" : "blocked" });
  const normalized = contract.normalized;
  if (!contract.allowed) throw new Error(`blocked custom view path: ${contract.reason}`);
  const candidates = normalized.toLowerCase().endsWith(".js")
    ? [normalized]
    : [`${normalized}.js`, `${normalized}/view.js`];
  let sourcePath = "";
  let sourceCode = "";
  for (const candidate of candidates) {
    sourceCode = await loadText(candidate);
    if (sourceCode) {
      sourcePath = candidate;
      break;
    }
  }
  if (!sourceCode) throw new Error(`自定义视图加载失败：${normalized}`);
  const run = getCachedViewRunner(sourcePath, sourceCode);
  recordHomeViewExecution(contract, {
    status: "running",
    sourcePath,
    sourceHash: hashViewSource(sourceCode)
  });
  try {
    await run(ctx, viewInput || {}, app, window.moment, window, document, globalThis);
    recordHomeViewExecution(contract, {
      status: "ok",
      sourcePath,
      sourceHash: hashViewSource(sourceCode)
    });
  } catch (error) {
    recordHomeViewExecution(contract, {
      status: "failed",
      sourcePath,
      sourceHash: hashViewSource(sourceCode),
      error: String(error?.message || error)
    });
    throw error;
  }
}

function attachDomHelpers(el) {
  if (!el) return el;
  if (typeof el.addClass !== "function") {
    el.addClass = function (...names) {
      names.filter(Boolean).forEach((n) => this.classList?.add?.(n));
      return this;
    };
  }
  if (typeof el.setAttr !== "function") {
    el.setAttr = function (name, value) {
      this.setAttribute?.(name, String(value));
      return this;
    };
  }
  if (typeof el.empty !== "function") {
    el.empty = function () {
      this.innerHTML = "";
      return this;
    };
  }
  if (typeof el.createEl !== "function") {
    el.createEl = function (tag, attrs = {}) {
      const child = document.createElement(tag);
      if (attrs?.text != null) child.textContent = String(attrs.text);
      if (attrs?.cls) child.className = String(attrs.cls);
      this.appendChild(child);
      return attachDomHelpers(child);
    };
  }
  if (typeof el.createDiv !== "function") {
    el.createDiv = function (attrs = {}) {
      return this.createEl("div", attrs);
    };
  }
  return el;
}

const hostContainerRaw = (typeof this !== "undefined" && this && this.container) ? this.container : (ctx.container || null);
const hostContainer = attachDomHelpers(hostContainerRaw);
if (!hostContainer) {
  ctx.paragraph(homeRuntimeT("runtime.home.facade.missingContainer"));
  homePerf.finish("missing-container");
  return;
}

function runHomeWidgetCleanup(target) {
  try {
    const cleanup = target?.__noriaHomeCleanup;
    if (typeof cleanup === "function") cleanup();
  } catch (e) {
    try { console.warn("Noria Home cleanup failed", e); } catch (_) {}
  }
}

function createHomeWidgetCleanupRegistry(target) {
  runHomeWidgetCleanup(target);
  const cleanups = [];
  const cleanup = () => {
    while (cleanups.length) {
      const fn = cleanups.pop();
      try {
        if (typeof fn === "function") fn();
      } catch (e) {
        try { console.warn("Noria Home widget cleanup failed", e); } catch (_) {}
      }
    }
    try {
      if (target?.__noriaHomeCleanup === cleanup) delete target.__noriaHomeCleanup;
    } catch (_) {}
  };
  try {
    if (target) target.__noriaHomeCleanup = cleanup;
  } catch (_) {}
  return {
    add(fn) {
      if (typeof fn === "function") cleanups.push(fn);
      return fn;
    },
    cleanup
  };
}

const homeWidgetCleanup = createHomeWidgetCleanupRegistry(hostContainer);

const coreFiles = [
  ".obsidian/plugins/noria/views/dashboard/core/theme/dashboard-theme.js",
  ".obsidian/plugins/noria/views/dashboard/core/utils/dashboard-lucide-inline.js",
  ".obsidian/plugins/noria/views/dashboard/core/components/ui/manager-panel.js",
  ".obsidian/plugins/noria/views/dashboard/core/utils/diary-day-blocks.js",
  ".obsidian/plugins/noria/views/dashboard/core/data/data-service.js",
  ".obsidian/plugins/noria/views/dashboard/core/utils/habit-parsing.js",
  ".obsidian/plugins/noria/views/dashboard/core/utils/task-display.js",
  ".obsidian/plugins/noria/views/dashboard/core/components/cards/metric-chips.js"
];
const CORE_BOOT_KEY = "__noria_home_core_boot_v1";
const CORE_BOOT_BUILD_KEY = "__noriaHomeCoreBootBuildId";
const coreBootState = (() => {
  try {
    const g = globalThis;
    if (g[CORE_BOOT_BUILD_KEY] !== homeRuntimeBuildId) {
      delete g.dashboardCore;
      delete g.__noriaManagerUiKit;
      g[CORE_BOOT_KEY] = { buildId: homeRuntimeBuildId, loaded: new Set() };
      g[CORE_BOOT_BUILD_KEY] = homeRuntimeBuildId;
    }
    if (!g[CORE_BOOT_KEY] || !(g[CORE_BOOT_KEY].loaded instanceof Set)) {
      g[CORE_BOOT_KEY] = { buildId: homeRuntimeBuildId, loaded: new Set() };
    }
    return g[CORE_BOOT_KEY];
  } catch (_) {
    return { buildId: homeRuntimeBuildId, loaded: new Set() };
  }
})();
const missingCoreFiles = coreFiles.filter((path) => !coreBootState.loaded.has(path));
const missingCoreSources = await Promise.all(missingCoreFiles.map(async (path) => {
  try {
    return { path, code: await loadText(path) };
  } catch (_) {
    return { path, code: "" };
  }
}));
for (const item of missingCoreSources) {
  try {
    const path = item?.path;
    const code = item?.code;
    if (!path || coreBootState.loaded.has(path)) continue;
    if (code) {
      (0, eval)(String(code));
      coreBootState.loaded.add(path);
    }
  } catch (_) {}
}

function createCallout(parent, type, title, metadata = "") {
  const callout = parent.createDiv();
  callout.addClass("callout");
  /** 仅作分区语义容器：不显式画「第二层大卡片」；卡片由各 section 内 .dashboard-guide-card 等承担 */
  callout.addClass("dashboard-callout-section-wrap");
  callout.setAttr("data-callout", type);
  if (metadata) callout.setAttr("data-callout-metadata", metadata);
  const titleEl = callout.createDiv();
  titleEl.addClass("callout-title");
  titleEl.createDiv().addClass("callout-icon");
  const titleInner = titleEl.createDiv();
  titleInner.addClass("callout-title-inner");
  const titleActions = titleEl.createDiv();
  titleActions.addClass("dashboard-home-widget-title-actions");
  titleActions.style.cssText = "margin-left:auto;display:flex;align-items:center;justify-content:flex-end;gap:6px;min-width:0;position:relative;z-index:1;";
  if (String(title || "").trim()) {
    titleInner.textContent = title;
  } else {
    titleEl.style.display = "none";
    callout.addClass("dashboard-callout-notitle");
  }
  const contentEl = callout.createDiv();
  contentEl.addClass("callout-content");
  return { content: contentEl, titleActions };
}

function createFlatSection(parent, title) {
  const section = parent.createDiv();
  section.addClass("dashboard-flat-section");
  const titleEl = section.createDiv();
  titleEl.addClass("dashboard-section-title");
  titleEl.textContent = title;
  const contentEl = section.createDiv();
  contentEl.addClass("dashboard-section-content");
  return { content: contentEl };
}

async function renderSection(path, mount, options = {}) {
  await homePerf.measure("section", path, async () => {
    try {
      await runCustomViewByPath(path, {
        ...opts,
        ...options,
        mount: attachDomHelpers(mount),
        registerCleanup: homeWidgetCleanup.add
      });
    } catch (e) {
      const msg = mount?.createDiv?.();
      const text = homeRuntimeT("runtime.home.facade.sectionFailed", {
        path,
        message: String(e?.message || e)
      });
      if (msg) {
        msg.textContent = text;
        msg.style.cssText =
          "padding:8px 10px;border-radius:10px;font-size:.84em;color:var(--text-muted);background:color-mix(in srgb,var(--background-primary) 94%,rgba(99,102,241,.08));border:1px dashed color-mix(in srgb,var(--background-modifier-border) 75%,rgba(99,102,241,.22));";
      } else {
        ctx.paragraph(text);
      }
    }
  });
}

function setHomeDeferredSlotState(slot, state, detail = "") {
  try {
    if (!slot) return;
    const text = String(state || "");
    if (typeof slot.setAttr === "function") slot.setAttr("data-noria-home-deferred", text);
    else if (typeof slot.setAttribute === "function") slot.setAttribute("data-noria-home-deferred", text);
    if (detail) {
      if (typeof slot.setAttr === "function") slot.setAttr("data-noria-home-deferred-detail", String(detail));
      else if (typeof slot.setAttribute === "function") slot.setAttribute("data-noria-home-deferred-detail", String(detail));
    }
  } catch (_) {}
}

function nextHomeDeferredFrame() {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    const host = typeof window !== "undefined" ? window : globalThis;
    const delay = typeof host?.setTimeout === "function" ? host.setTimeout.bind(host) : (typeof setTimeout === "function" ? setTimeout : null);
    const frame = typeof host?.requestAnimationFrame === "function"
      ? host.requestAnimationFrame.bind(host)
      : (typeof requestAnimationFrame === "function" ? requestAnimationFrame : null);
    const afterFrame = () => {
      if (delay) {
        try {
          delay(finish, 0);
          return;
        } catch (_) {}
      }
      finish();
    };
    if (delay) {
      try { delay(finish, 120); } catch (_) {}
    }
    if (frame) {
      try {
        frame(afterFrame);
        return;
      } catch (_) {}
    }
    afterFrame();
  });
}

async function renderLazySection(path, mount, options = {}) {
  const perf = opts?.noriaBridge?.performance || globalThis.__noriaRuntimeBridge?.performance || {};
  if (perf.homeLazySections === false) {
    await renderSection(path, mount, options);
    return;
  }
  const stableMount = mount?.createDiv?.({ cls: "dashboard-home-deferred-slot" }) || mount;
  if (stableMount && stableMount !== mount) {
    stableMount.setAttr?.("data-noria-home-deferred", "queued");
    stableMount.style.minHeight = "1px";
    stableMount.style.width = "100%";
  }
  const task = (async () => {
    try {
      await nextHomeDeferredFrame();
      if (stableMount && stableMount.isConnected === false) {
        setHomeDeferredSlotState(stableMount, "cancelled", path);
        return;
      }
      setHomeDeferredSlotState(stableMount, "loading", path);
      await renderSection(path, stableMount, options);
      setHomeDeferredSlotState(stableMount, "ready", path);
    } catch (e) {
      setHomeDeferredSlotState(stableMount, "failed", String(e?.message || e || path));
      try { console.warn("[noria] deferred Home section failed", path, e); } catch (_) {}
    }
  })();
  void task;
}

function hideHomeInlineTitle() {
  try {
    const rootEl = hostContainer?.closest?.(".markdown-reading-view, .markdown-source-view.mod-cm6, .workspace-leaf-content");
    const titleEl = rootEl?.querySelector?.(".inline-title");
    if (titleEl) titleEl.style.display = "none";
  } catch (_) {}
}

function isHomeBootstrapStyleCurrent() {
  try {
    const style = document?.getElementById?.("dashboard-compact-spacing");
    if (!style) return false;
    const existingBuildId = String(
      style?.getAttribute?.("data-noria-runtime-build-id") ||
      style?.attrs?.["data-noria-runtime-build-id"] ||
      ""
    );
    const text = String(style.textContent || "");
    return existingBuildId === homeRuntimeBuildId
      && text.includes("--dash-radius")
      && text.includes("dashboard-countdown-hero-days-v2");
  } catch (_) {
    return false;
  }
}

async function ensureHomeBootstrapStyle() {
  hideHomeInlineTitle();
}

await ensureHomeBootstrapStyle();

const root = hostContainer.createDiv();
root.addClass("dashboard-home-root");
const homeEditMode = homeBridge.homeEditMode === true;
root.setAttr?.("data-noria-home-edit-mode", homeEditMode ? "true" : "false");
root.setAttribute?.("data-noria-home-edit-mode", homeEditMode ? "true" : "false");

function cloneHomeWidgetDefaults(raw) {
  if (!Array.isArray(raw)) return [];
  try {
    return JSON.parse(JSON.stringify(raw));
  } catch (_) {
    return raw.map((widget) => ({ ...widget, props: { ...(widget?.props || {}) } }));
  }
}

const HOME_WIDGET_DEFAULT_SOURCE = homeBridge.homeWidgetDefaults || homeBridge.homeSettings?.widgets || [];
const DEFAULT_HOME_WIDGETS = cloneHomeWidgetDefaults(HOME_WIDGET_DEFAULT_SOURCE);
const HOME_WIDGET_REGISTRY = {
  identity: { path: ".obsidian/plugins/noria/views/dashboard/home/sections/home-identity", title: "", shell: "hero" },
  metrics: { path: ".obsidian/plugins/noria/views/dashboard/home/sections/overview-metrics", title: "", shell: "hero", props: { metricsLayout: "hero" } },
  "today-actions": { title: "", shell: "inline" },
  "today-tasks-card": { path: ".obsidian/plugins/noria/views/dashboard/home/sections/overview-columns", title: "", shell: "native" },
  "inbox-card": { path: ".obsidian/plugins/noria/views/dashboard/home/sections/overview-columns", title: "", shell: "native" },
  "countdown-card": { path: ".obsidian/plugins/noria/views/dashboard/home/sections/overview-columns", title: "", shell: "native" },
  "projects-card": { path: ".obsidian/plugins/noria/views/dashboard/home/sections/guide-panels", title: "", shell: "native", lazy: true },
  "moc-strip": { path: ".obsidian/plugins/noria/views/dashboard/home/sections/guide-panels", title: "", shell: "native", lazy: true },
  "review-focus": { path: ".obsidian/plugins/noria/views/dashboard/home/sections/guide-panels", title: "", shell: "native", lazy: true },
  "trends-range": { path: ".obsidian/plugins/noria/views/dashboard/home/sections/trends-and-stats", title: "", titleKey: "runtime.home.facade.trends", shell: "native" },
  "note-trend-card": { path: ".obsidian/plugins/noria/views/dashboard/home/sections/trends-and-stats", title: "", shell: "native", lazy: true },
  "task-trend-card": { path: ".obsidian/plugins/noria/views/dashboard/home/sections/trends-and-stats", title: "", shell: "native", lazy: true },
  "habit-history-card": { path: ".obsidian/plugins/noria/views/dashboard/home/sections/trends-and-stats", title: "", shell: "native", lazy: true },
  "habit-heatmap-card": { path: ".obsidian/plugins/noria/views/dashboard/home/sections/trends-and-stats", title: "", shell: "native", lazy: true },
  "workload-heatmap-card": { path: ".obsidian/plugins/noria/views/dashboard/home/sections/trends-and-stats", title: "", shell: "native", lazy: true },
  "tag-distribution-card": { path: ".obsidian/plugins/noria/views/dashboard/home/sections/trends-and-stats", title: "", shell: "native", lazy: true },
  "daily-state-card": { path: ".obsidian/plugins/noria/views/dashboard/home/sections/trends-and-stats", title: "", shell: "native", lazy: true }
};
const HOME_WIDGET_EDIT_TITLE_KEYS = {
  identity: "runtime.home.layoutEdit.widget.identity",
  metrics: "runtime.home.layoutEdit.widget.metrics",
  "today-actions": "runtime.home.layoutEdit.widget.todayActions",
  "daily-advice": "runtime.home.layoutEdit.widget.dailyAdvice",
  "today-tasks-card": "runtime.home.layoutEdit.widget.todayTasks",
  "inbox-card": "runtime.home.layoutEdit.widget.inbox",
  "countdown-card": "runtime.home.layoutEdit.widget.countdown",
  "projects-card": "runtime.home.layoutEdit.widget.projects",
  "moc-strip": "runtime.home.layoutEdit.widget.moc",
  "review-focus": "runtime.home.layoutEdit.widget.review",
  "trends-range": "runtime.home.layoutEdit.widget.trendsRange",
  "note-trend-card": "runtime.home.layoutEdit.widget.noteTrend",
  "task-trend-card": "runtime.home.layoutEdit.widget.taskTrend",
  "habit-history-card": "runtime.home.layoutEdit.widget.habitHistory",
  "habit-heatmap-card": "runtime.home.layoutEdit.widget.habitHeatmap",
  "workload-heatmap-card": "runtime.home.layoutEdit.widget.workloadHeatmap",
  "tag-distribution-card": "runtime.home.layoutEdit.widget.tagDistribution",
  "daily-state-card": "runtime.home.layoutEdit.widget.dailyState"
};
const HOME_WIDGET_SCHEMA_VERSION = 3;
const HOME_ACTION_VIEW_COMMANDS = {
  home: "open-home-tab",
  daily: "open-daily-note",
  diary: "open-daily-note",
  day: "open-today-day-board",
  today: "open-today-day-board",
  tasks: "open-tasks-plugin-tab",
  task: "open-tasks-plugin-tab",
  timeline: "open-task-timeline-tab",
  stats: "open-stats-tab",
  calendar: "open-calendar",
  review: "open-review-center"
};
const HOME_TODAY_DEFAULT_ACTIONS = [
  { id: "daily-note", labelKey: "runtime.home.todayActions.openDaily", kind: "view", view: "daily", commandId: "open-daily-note", source: "home-today-actions" },
  { id: "today-board", labelKey: "runtime.home.todayActions.todayBoard", kind: "view", view: "day", commandId: "open-today-day-board", source: "home-today-actions" },
  { id: "calendar", labelKey: "runtime.home.todayActions.calendar", kind: "view", view: "calendar", source: "home-today-actions" },
  { id: "review", labelKey: "runtime.home.todayActions.review", kind: "view", view: "review", source: "home-today-actions" }
];
const HOME_STAT_METRIC_REGISTRY = {
  "tasks.completed": { labelKey: "runtime.home.stat.tasksCompleted", path: "domains.tasks.completion.completed" },
  "tasks.open": { labelKey: "runtime.home.stat.tasksOpen", path: "domains.tasks.completion.open" },
  "tasks.completionRate": { labelKey: "runtime.home.stat.completionRate", path: "domains.tasks.completion.completionRate", suffix: "%" },
  "notes.created": { labelKey: "runtime.home.stat.notesCreated", path: "domains.notes.trend.totalCreated" },
  "diary.words": { labelKey: "runtime.home.stat.diaryWords", path: "domains.notes.diaryWords.total", format: "compact" },
  "daily.validDays": { labelKey: "runtime.home.stat.dailyValidDays", path: "domains.dailyState.summary.validDays" },
  "inbox.total": { labelKey: "runtime.home.stat.inboxTotal", path: "domains.inbox.summary.total", include: ["inbox"] },
  "inbox.stale": { labelKey: "runtime.home.stat.inboxStale", path: "domains.inbox.summary.staleCount", include: ["inbox"] },
  "projects.active": { labelKey: "runtime.home.stat.projectsActive", path: "domains.projects.summary.activeCount", include: ["projects"] },
  "projects.open": { labelKey: "runtime.home.stat.projectsOpen", path: "domains.projects.summary.taskOpen", include: ["projects"] },
  "projects.completionRate": { labelKey: "runtime.home.stat.projectsCompletionRate", path: "domains.projects.summary.completionRate", suffix: "%", include: ["projects"] },
  "projects.stale": { labelKey: "runtime.home.stat.projectsStale", path: "domains.projects.summary.staleProjectCount", include: ["projects"] },
  "habits.active": { labelKey: "runtime.home.stat.habitsActive", path: "domains.habits.summary.activeCount", include: ["habits"] },
  "habits.checked": { labelKey: "runtime.home.stat.habitsChecked", path: "domains.habits.summary.checked", include: ["habits"] },
  "habits.completionRate": { labelKey: "runtime.home.stat.habitsCompletionRate", path: "domains.habits.summary.completionRate", suffix: "%", include: ["habits"] },
  "habits.streak": { labelKey: "runtime.home.stat.habitsStreak", path: "domains.habits.summary.currentStreak", include: ["habits"] },
  "vault.markdownFiles": { labelKey: "runtime.home.stat.vaultMarkdownFiles", path: "domains.vaultHealth.summary.markdownFiles", include: ["vaultHealth"] },
  "vault.missingTags": { labelKey: "runtime.home.stat.vaultMissingTags", path: "domains.vaultHealth.summary.missingTags", include: ["vaultHealth"] },
  "vault.brokenLinks": { labelKey: "runtime.home.stat.vaultBrokenLinks", path: "domains.vaultHealth.summary.brokenLinks", include: ["vaultHealth"] },
  "vault.tagCoverage": { labelKey: "runtime.home.stat.vaultTagCoverage", path: "domains.vaultHealth.summary.tagCoverage", suffix: "%", include: ["vaultHealth"] }
};
const HOME_STAT_DEFAULT_INCLUDE = ["notes", "tasks", "dailyState", "habits", "workload"];
const HOME_WIDGET_SIZE_SPANS = {
  small: 3,
  medium: 4,
  wide: 6,
  full: 12
};

function cloneWidgetExtensionValue(raw) {
  if (raw == null || typeof raw !== "object") return raw;
  try {
    return JSON.parse(JSON.stringify(raw));
  } catch (_) {
    return raw;
  }
}

function copyWidgetExtensionFields(widget) {
  const known = new Set(["id", "type", "schemaVersion", "enabled", "order", "size", "title", "titleKey", "source", "props"]);
  const out = {};
  if (!widget || typeof widget !== "object" || Array.isArray(widget)) return out;
  Object.entries(widget).forEach(([key, val]) => {
    if (!known.has(key)) out[key] = cloneWidgetExtensionValue(val);
  });
  return out;
}

function normalizeWidgetList(rawWidgets, options = {}) {
  const list = Array.isArray(rawWidgets) && rawWidgets.length ? rawWidgets : DEFAULT_HOME_WIDGETS;
  const includeDisabled = options.includeDisabled === true;
  const widgets = list
    .filter((widget) => widget && (includeDisabled || widget.enabled !== false))
    .map((widget, idx) => {
      const id = String(widget.id || `widget-${idx}`).trim();
      const fallback = DEFAULT_HOME_WIDGETS.find((item) => item.id === id) || {};
      let title = String(widget.title || "").trim();
      if (id === "trends" && title === "Trends") title = "";
      if (id === "guide" && title === "Guide") title = "";
      const rawSchemaVersion = Number(widget.schemaVersion);
      return {
        ...copyWidgetExtensionFields(widget),
        id,
        type: ["builtin", "markdown", "view", "action", "stat", "base", "list"].includes(String(widget.type || "builtin")) ? String(widget.type || "builtin") : "builtin",
        schemaVersion: Number.isFinite(rawSchemaVersion) ? Math.max(HOME_WIDGET_SCHEMA_VERSION, rawSchemaVersion) : HOME_WIDGET_SCHEMA_VERSION,
        enabled: widget.enabled !== false,
        order: Number.isFinite(Number(widget.order)) ? Number(widget.order) : idx * 10,
        size: ["small", "medium", "wide", "full"].includes(String(widget.size || "")) ? String(widget.size) : "medium",
        title,
        titleKey: String(widget.titleKey || fallback.titleKey || "").trim(),
        source: String(widget.source || "").trim().replace(/\\/g, "/").replace(/^\/+/, ""),
        props: widget.props && typeof widget.props === "object" && !Array.isArray(widget.props) ? { ...widget.props } : {}
      };
    })
    .filter((widget) => widget.type !== "builtin" || !!HOME_WIDGET_REGISTRY[widget.id]);
  return widgets.sort((a, b) => a.order - b.order);
}

function resolveWidgetTitle(widget, entry = {}) {
  const explicit = String(widget?.title || "").trim();
  if (explicit) return explicit;
  const key = String(widget?.titleKey || entry?.titleKey || "").trim();
  if (key) return homeRuntimeT(key);
  return String(entry?.title || "").trim();
}

function resolveWidgetEditTitle(widget, entry = {}) {
  const regular = resolveWidgetTitle(widget, entry);
  if (regular) return regular;
  const key = HOME_WIDGET_EDIT_TITLE_KEYS[String(widget?.id || "")];
  if (key) return homeRuntimeT(key);
  return String(widget?.source || widget?.id || homeRuntimeT("runtime.home.layoutEdit.title")).trim();
}

function clampHomeWidgetSpan(value, fallback = 12) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(12, Math.round(n)));
}

function getHomeWidgetSpan(widget) {
  const layout = widget?.layout && typeof widget.layout === "object" && !Array.isArray(widget.layout) ? widget.layout : {};
  const fallback = HOME_WIDGET_SIZE_SPANS[String(widget?.size || "medium")] || HOME_WIDGET_SIZE_SPANS.medium;
  return clampHomeWidgetSpan(layout.span ?? widget?.span, fallback);
}

function getHomeWidgetShellDataset(widget, title = "") {
  const src = widget && typeof widget === "object" ? widget : {};
  const props = src.props && typeof src.props === "object" && !Array.isArray(src.props) ? src.props : {};
  const type = String(src.type || "builtin").trim().toLowerCase() || "builtin";
  const size = ["small", "medium", "wide", "full"].includes(String(src.size || "")) ? String(src.size) : "medium";
  const source = String(src.source || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  const order = Number(src.order);
  const schemaVersion = Number(src.schemaVersion);
  const rawKind = props.mode || src.kind || src.id || type;
  const kind = String(rawKind || type).trim().toLowerCase().replace(/\s+/g, "-") || type;
  const dataset = {
    id: String(src.id || "").trim(),
    type,
    kind,
    size,
    enabled: src.enabled === false ? "false" : "true",
    order: String(Number.isFinite(order) ? Math.floor(order) : ""),
    collapsed: src.collapsed === true ? "true" : "false",
    "schema-version": String(Number.isFinite(schemaVersion) ? Math.floor(schemaVersion) : HOME_WIDGET_SCHEMA_VERSION),
    title: String(title || "").trim(),
    span: String(getHomeWidgetSpan(src))
  };
  if (source) dataset.source = source;
  return dataset;
}

function applyHomeWidgetShellDataset(widget, host, title = "") {
  if (!host) return;
  const dataset = getHomeWidgetShellDataset(widget, title);
  const attrs = {
    id: "data-noria-widget-id",
    type: "data-noria-widget-type",
    kind: "data-noria-widget-kind",
    size: "data-noria-widget-size",
    enabled: "data-noria-widget-enabled",
    order: "data-noria-widget-order",
    source: "data-noria-widget-source",
    collapsed: "data-noria-widget-collapsed",
    "schema-version": "data-noria-widget-schema-version",
    title: "data-noria-widget-title",
    span: "data-noria-widget-span"
  };
  Object.entries(attrs).forEach(([key, attr]) => {
    const value = dataset[key];
    if (value == null || value === "") return;
    host.setAttr?.(attr, String(value));
    host.setAttribute?.(attr, String(value));
  });
}

function applyHomeWidgetLayout(widget, el) {
  if (!el) return;
  const span = getHomeWidgetSpan(widget);
  el.setAttr?.("data-noria-widget-span", String(span));
  el.setAttribute?.("data-noria-widget-span", String(span));
  try {
    el.style?.setProperty?.("--noria-home-widget-span", String(span));
    el.style.gridColumn = `span ${span}`;
  } catch (_) {}
}

function hasHomeWidgetLayoutOverride(widget) {
  const layout = widget?.layout;
  if (layout && typeof layout === "object" && !Array.isArray(layout) && Object.keys(layout).length) return true;
  if (widget?.span != null) return true;
  return false;
}

function shouldUseHomeHeroStrip(identity, metrics, options = {}) {
  if (options.editMode === true) return false;
  if (!identity || !metrics) return false;
  if (identity.collapsed === true || metrics.collapsed === true) return false;
  if (hasHomeWidgetLayoutOverride(identity) || hasHomeWidgetLayoutOverride(metrics)) return false;
  if (String(identity.size || "") !== "wide" || String(metrics.size || "") !== "wide") return false;
  const metricsLayout = String(metrics.props?.metricsLayout || "hero");
  return metricsLayout === "hero";
}

function getHomeWidgetCollapsedTitle(widget, title) {
  const explicit = String(title || "").trim();
  if (explicit) return explicit;
  const editKey = HOME_WIDGET_EDIT_TITLE_KEYS[String(widget?.id || "")];
  if (editKey) {
    const translated = homeRuntimeT(editKey);
    if (translated && translated !== editKey) return translated;
  }
  return String(widget?.source || widget?.id || "").trim();
}

function applyHomeWidgetCollapsedState(widget, shell) {
  const host = shell?.content?.parentElement || null;
  const collapsed = widget?.collapsed === true;
  host?.setAttr?.("data-noria-widget-collapsed", collapsed ? "true" : "false");
  host?.setAttribute?.("data-noria-widget-collapsed", collapsed ? "true" : "false");
  if (!collapsed) return;
  host?.addClass?.("dashboard-home-widget-shell-collapsed");
  shell.content.hidden = true;
  shell.content.setAttr?.("aria-hidden", "true");
  shell.content.setAttribute?.("aria-hidden", "true");
  const label = shell.titleActions?.createSpan?.({ cls: "dashboard-home-widget-collapsed-label", text: homeRuntimeT("runtime.home.facade.collapsed") });
  label?.setAttr?.("data-noria-widget-collapsed-label", "true");
  label?.setAttribute?.("data-noria-widget-collapsed-label", "true");
}

function applyHomeWidgetShellActionIcon(button, iconId, fallback) {
  try {
    const applyIcon = globalThis.dashboardCore?.utils?.applyLucideIcon;
    if (typeof applyIcon === "function") {
      applyIcon(button, iconId, { size: 14, strokeWidth: 1.8 });
      return;
    }
  } catch (_) {}
  button.textContent = fallback;
}

function createHomeWidgetShellActionButton(actions, widget, action, label, iconId, fallback, onActivate) {
  const button = actions.createEl("button", {
    cls: "dashboard-home-widget-shell-action",
    attr: {
      type: "button",
      "aria-label": label,
      title: label,
      "data-noria-widget-id": String(widget?.id || ""),
      "data-noria-widget-shell-action": action
    }
  });
  applyHomeWidgetShellActionIcon(button, iconId, fallback);
  button.addEventListener("click", async (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (button.disabled) return;
    button.disabled = true;
    button.setAttr?.("data-noria-action-state", "pending");
    button.setAttribute?.("data-noria-action-state", "pending");
    try {
      const result = await onActivate();
      if (result?.ok === false) throw new Error(String(result.error || "action-failed"));
      button.setAttr?.("data-noria-action-state", "done");
      button.setAttribute?.("data-noria-action-state", "done");
    } catch (_) {
      button.disabled = false;
      button.setAttr?.("data-noria-action-state", "failed");
      button.setAttribute?.("data-noria-action-state", "failed");
    }
  });
  return button;
}

function createHomeWidgetEditActionButton(actions, widget, action, label, iconId, fallback, onActivate, disabled = false) {
  const button = createHomeWidgetShellActionButton(
    actions,
    widget,
    action,
    label,
    iconId,
    fallback,
    onActivate
  );
  button.setAttr?.("data-noria-widget-edit-action", action);
  button.setAttribute?.("data-noria-widget-edit-action", action);
  button.disabled = disabled === true;
  return button;
}

function createHomeWidgetSizeSelect(actions, widget) {
  const label = homeRuntimeT("runtime.home.layoutEdit.size");
  const select = actions.createEl("select", {
    cls: "dashboard-home-widget-edit-size",
    attr: {
      "aria-label": label,
      title: label,
      "data-noria-widget-id": String(widget?.id || ""),
      "data-noria-widget-edit-action": "size",
      "data-noria-widget-edit-size": String(widget?.size || "medium")
    }
  });
  [
    ["small", "runtime.home.layoutEdit.sizeSmall"],
    ["medium", "runtime.home.layoutEdit.sizeMedium"],
    ["wide", "runtime.home.layoutEdit.sizeWide"],
    ["full", "runtime.home.layoutEdit.sizeFull"]
  ].forEach(([value, key]) => {
    const option = select.createEl("option", { text: homeRuntimeT(key), attr: { value } });
    option.selected = String(widget?.size || "medium") === value;
  });
  select.value = String(widget?.size || "medium");
  select.addEventListener?.("change", async (event) => {
    event?.stopPropagation?.();
    if (select.disabled) return;
    select.disabled = true;
    const value = String(select.value || "medium");
    select.setAttr?.("data-noria-widget-edit-size", value);
    select.setAttribute?.("data-noria-widget-edit-size", value);
    try {
      const result = await homeBridge.runtime?.editHomeWidget({ widgetId: widget.id, action: "size", value });
      if (result?.ok === false) throw new Error(String(result.error || "action-failed"));
    } catch (_) {
      select.disabled = false;
    }
  });
  return select;
}

function createHomeWidgetShellActions(widget, shell, visibleTitle, editContext = {}) {
  const runtime = homeBridge.runtime || {};
  const canConfigure = typeof runtime.openHomeWidgetSettings === "function";
  const canCollapse = typeof runtime.setHomeWidgetCollapsed === "function";
  const canEdit = homeEditMode && typeof runtime.editHomeWidget === "function";
  if (!canConfigure && !canCollapse && !canEdit) return null;
  const host = shell?.content?.parentElement || null;
  const overlay = !String(visibleTitle || "").trim();
  const actionsParent = overlay ? host : shell?.titleActions;
  const actions = actionsParent?.createDiv?.({ cls: "dashboard-home-widget-shell-actions" });
  if (!actions) return null;
  if (overlay) actions.addClass?.("dashboard-home-widget-shell-actions--overlay");
  actions.setAttr?.("data-noria-widget-shell-actions", String(widget?.id || ""));
  actions.setAttribute?.("data-noria-widget-shell-actions", String(widget?.id || ""));
  if (canEdit) {
    const index = Number(editContext.index);
    const total = Number(editContext.total);
    createHomeWidgetEditActionButton(
      actions,
      widget,
      "move-up",
      homeRuntimeT("runtime.home.layoutEdit.moveUp"),
      "arrow-up",
      "^",
      () => homeBridge.runtime?.editHomeWidget({ widgetId: widget.id, action: "move", value: "up" }),
      Number.isFinite(index) && index <= 0
    );
    createHomeWidgetEditActionButton(
      actions,
      widget,
      "move-down",
      homeRuntimeT("runtime.home.layoutEdit.moveDown"),
      "arrow-down",
      "v",
      () => homeBridge.runtime?.editHomeWidget({ widgetId: widget.id, action: "move", value: "down" }),
      Number.isFinite(index) && Number.isFinite(total) && index >= total - 1
    );
    createHomeWidgetSizeSelect(actions, widget);
    const enabled = widget?.enabled !== false;
    createHomeWidgetEditActionButton(
      actions,
      widget,
      enabled ? "hide" : "show",
      homeRuntimeT(enabled ? "runtime.home.layoutEdit.hide" : "runtime.home.layoutEdit.show"),
      enabled ? "eye-off" : "eye",
      enabled ? "-" : "+",
      () => homeBridge.runtime?.editHomeWidget({ widgetId: widget.id, action: "enabled", value: !enabled })
    );
  }
  if (canConfigure) {
    createHomeWidgetShellActionButton(
      actions,
      widget,
      "configure",
      homeRuntimeT("runtime.home.facade.configure"),
      "settings-2",
      "...",
      () => homeBridge.runtime?.openHomeWidgetSettings(widget.id)
    );
  }
  if (canCollapse && widget?.enabled !== false) {
    const collapsed = widget?.collapsed === true;
    createHomeWidgetShellActionButton(
      actions,
      widget,
      collapsed ? "expand" : "collapse",
      homeRuntimeT(collapsed ? "runtime.home.facade.expand" : "runtime.home.facade.collapse"),
      collapsed ? "chevron-down" : "chevron-up",
      collapsed ? "v" : "^",
      () => homeBridge.runtime?.setHomeWidgetCollapsed(widget.id, !collapsed)
    );
  }
  return actions;
}

function createWidgetShell(widget, title, editContext = {}, entry = {}) {
  const visibleTitle = widget?.collapsed === true ? getHomeWidgetCollapsedTitle(widget, title) : title;
  const nativeShell = entry?.shell === "native";
  const shell = nativeShell
    ? (() => {
        const host = root.createDiv({ cls: "dashboard-home-widget-shell dashboard-home-widget-shell-native" });
        const titleActions = host.createDiv({ cls: "dashboard-home-widget-native-title-actions" });
        const content = host.createDiv({ cls: "dashboard-home-widget-native-content" });
        return { content, titleActions };
      })()
    : createCallout(root, "info", visibleTitle || "");
  const host = shell.content?.parentElement;
  host?.addClass?.("dashboard-home-widget-shell");
  if (nativeShell) host?.setAttribute?.("data-noria-widget-shell", "native");
  applyHomeWidgetShellDataset(widget, host, visibleTitle);
  applyHomeWidgetLayout(widget, host);
  if (widget?.enabled === false) {
    host?.addClass?.("dashboard-home-widget-shell-hidden");
    if (!homeEditMode) {
      shell.content.hidden = true;
      shell.content.setAttr?.("aria-hidden", "true");
      shell.content.setAttribute?.("aria-hidden", "true");
    }
  }
  applyHomeWidgetCollapsedState(widget, shell);
  createHomeWidgetShellActions(widget, shell, visibleTitle, editContext);
  return shell;
}

function renderHomeLayoutEditBar() {
  const bar = root.createDiv({ cls: "dashboard-home-layout-edit-bar" });
  bar.setAttr?.("data-noria-home-layout-edit-bar", "true");
  bar.setAttribute?.("data-noria-home-layout-edit-bar", "true");
  bar.createSpan?.({ cls: "dashboard-home-layout-edit-label", text: homeRuntimeT("runtime.home.layoutEdit.title") });
  const label = homeRuntimeT("runtime.home.layoutEdit.done");
  const done = bar.createEl("button", {
    cls: "dashboard-home-layout-edit-done",
    attr: {
      type: "button",
      "aria-label": label,
      title: label,
      "data-noria-home-layout-edit-toggle": "close"
    }
  });
  applyHomeWidgetShellActionIcon(done, "check", "Done");
  done.addEventListener?.("click", async (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (done.disabled) return;
    done.disabled = true;
    try {
      const result = await homeBridge.runtime?.setHomeEditMode(false);
      if (result?.ok === false) throw new Error(String(result.error || "action-failed"));
    } catch (_) {
      done.disabled = false;
    }
  });
  return bar;
}

function createHomeLayoutEditToggle(parent, extraClass = "") {
  if (homeEditMode || typeof homeBridge.runtime?.setHomeEditMode !== "function") return null;
  const label = homeRuntimeT("runtime.home.layoutEdit.open");
  const edit = parent.createEl("button", { cls: "dashboard-home-layout-edit-toggle" });
  String(extraClass || "")
    .split(/\s+/)
    .filter(Boolean)
    .forEach((className) => edit.addClass?.(className));
  edit.type = "button";
  edit.setAttr?.("aria-label", label);
  edit.setAttr?.("title", label);
  edit.setAttr?.("data-noria-home-layout-edit-toggle", "open");
  edit.setAttribute?.("aria-label", label);
  edit.setAttribute?.("title", label);
  edit.setAttribute?.("data-noria-home-layout-edit-toggle", "open");
  applyHomeWidgetShellActionIcon(edit, "layout-dashboard", "Layout");
  edit.addEventListener?.("click", async (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (edit.disabled) return;
    edit.disabled = true;
    try {
      const result = await homeBridge.runtime?.setHomeEditMode(true);
      if (result?.ok === false) throw new Error(String(result.error || "action-failed"));
    } catch (_) {
      edit.disabled = false;
    }
  });
  return edit;
}

function renderHomeLayoutRecoveryEntry() {
  if (homeEditMode || typeof homeBridge.runtime?.setHomeEditMode !== "function") return null;
  const configuredWidgets = Array.isArray(homeBridge.homeSettings?.widgets)
    ? homeBridge.homeSettings.widgets
    : [];
  const todayActions = configuredWidgets.find((widget) => String(widget?.id || "") === "today-actions");
  if (!todayActions || todayActions.enabled !== false) return null;
  const entry = root.createDiv({ cls: "dashboard-home-layout-recovery-entry" });
  entry.setAttr?.("data-noria-home-layout-recovery", "true");
  entry.setAttribute?.("data-noria-home-layout-recovery", "true");
  createHomeLayoutEditToggle(entry, "dashboard-home-layout-recovery-button");
  return entry;
}

function normalizeHomeMarkdownSources(widget) {
  const props = widget?.props && typeof widget.props === "object" && !Array.isArray(widget.props) ? widget.props : {};
  const rawSources = Array.isArray(props.sources) && props.sources.length
    ? props.sources
    : (Array.isArray(props.entries) && props.entries.length ? props.entries : []);
  const items = rawSources
    .map((raw, index) => {
      const item = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : { path: raw };
      const path = homeActionPath(item.path || item.file || item.note || item.source || item.href);
      if (!path) return null;
      const normalized = {
        ...item,
        path,
        label: getHomeEntryLabel({ ...item, path }, index),
        description: getHomeEntryDescription(item),
        newLeaf: item.newLeaf === true || props.newLeaf === true,
        open: homeActionBoolean(item.open)
      };
      const roleMeta = getHomeMarkdownSourceRoleMeta(normalized);
      return {
        ...normalized,
        role: roleMeta.role,
        freshHours: roleMeta.freshHours
      };
    })
    .filter(Boolean);
  if (items.length) return items;
  const source = homeActionPath(widget?.source);
  if (!source) return [];
  const single = {
    path: source,
    label: resolveWidgetTitle(widget) || getHomeEntryLabel({ path: source }, 0),
    description: "",
    newLeaf: props.newLeaf === true,
    open: true
  };
  const roleMeta = getHomeMarkdownSourceRoleMeta(single);
  return [{ ...single, role: roleMeta.role, freshHours: roleMeta.freshHours }];
}

function normalizeHomeMarkdownHeading(value) {
  return homeActionText(value)
    .replace(/^#+\s*/, "")
    .replace(/\s+#+\s*$/, "")
    .trim();
}

function getHomeDailySectionSource(widget) {
  const props = widget?.props && typeof widget.props === "object" && !Array.isArray(widget.props) ? widget.props : {};
  if (homeActionText(props.sourceMode).toLowerCase() !== "daily-section") return null;
  const heading = normalizeHomeMarkdownHeading(props.heading);
  const date = formatHomeDate(props.date || homeBridge?.today || homeBridge?.now || opts?.now || new Date());
  const diaryRoot = homeActionPath(props.diaryRoot || homeBridge?.paths?.diaryRoot || "").replace(/\/+$/, "");
  if (!heading || !date || !diaryRoot) return null;
  return {
    heading,
    path: `${diaryRoot}/${date.slice(0, 4)}/${date}.md`,
    label: resolveWidgetTitle(widget) || heading,
    description: "",
    newLeaf: false,
    open: true,
    role: "daily-section",
    freshHours: 0
  };
}

function extractHomeMarkdownH2Section(markdown, heading) {
  const target = normalizeHomeMarkdownHeading(heading).toLowerCase();
  if (!target) return { found: false, text: "", line: 0 };
  const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
  let start = -1;
  let end = lines.length;
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^##(?!#)\s+(.+?)\s*$/);
    if (!match) continue;
    if (start >= 0) {
      end = index;
      break;
    }
    if (normalizeHomeMarkdownHeading(match[1]).toLowerCase() === target) start = index;
  }
  if (start < 0) return { found: false, text: "", line: 0 };
  return {
    found: true,
    text: lines.slice(start + 1, end).join("\n").trim(),
    line: start + 1
  };
}

function normalizeHomeMarkdownSourceDomId(value) {
  return homeActionText(value)
    .toLowerCase()
    .replace(/[^\w\u3400-\u9fff-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function getHomeMarkdownSourceDomId(source = {}, index = 0) {
  const explicit = normalizeHomeMarkdownSourceDomId(source.id || source.key || source.sourceId);
  if (explicit) return explicit;
  const role = normalizeHomeMarkdownSourceDomId(source.role || source.kind || "source") || "source";
  const pathHash = hashViewSource(homeActionPath(source.path || source.source || source.file || source.note)).slice(0, 8);
  return `${role}-${pathHash || index + 1}`;
}

async function renderMarkdownContent(markdown, body, sourcePath) {
  const text = String(markdown || "");
  if (!text.trim()) return { state: "empty", rendered: false, error: null };
  let childComponent = null;
  try {
    const windowRef = (typeof window !== "undefined") ? window : {};
    const obsidianApi =
      globalThis?.obsidian ||
      windowRef.obsidian ||
      ((typeof windowRef.require === "function") ? windowRef.require("obsidian") : null);
    const MarkdownRenderer = obsidianApi?.MarkdownRenderer || globalThis?.MarkdownRenderer || windowRef.MarkdownRenderer;
    const CompCtor = obsidianApi?.Component || globalThis?.Component || windowRef.Component;
    if (!MarkdownRenderer) throw new Error("MarkdownRenderer unavailable");
    childComponent = CompCtor ? new CompCtor() : null;
    if (childComponent && typeof childComponent.load === "function") childComponent.load();
    if (typeof MarkdownRenderer.render === "function") {
      await MarkdownRenderer.render(app, text, body, sourcePath, childComponent || undefined);
    } else if (typeof MarkdownRenderer.renderMarkdown === "function") {
      await MarkdownRenderer.renderMarkdown(text, body, sourcePath, childComponent || undefined);
    } else {
      throw new Error("MarkdownRenderer render function unavailable");
    }
    if (childComponent) {
      const componentToUnload = childComponent;
      homeWidgetCleanup.add(() => {
        try { componentToUnload.unload?.(); } catch (_) {}
      });
    }
    return { state: "ready", rendered: true, error: null };
  } catch (error) {
    try { childComponent?.unload?.(); } catch (_) {}
    try { body.empty?.(); } catch (_) {}
    body.textContent = text;
    return { state: "failed", rendered: true, error };
  }
}

function createHomeMarkdownSingleState(widget, body, options = {}) {
  const state = homeActionText(options.state || "empty") || "empty";
  const source = options.source && typeof options.source === "object" ? options.source : null;
  const action = homeActionText(options.action || "");
  const row = body.createDiv();
  row.addClass("dashboard-home-markdown-single-state");
  row.setAttribute?.("data-noria-markdown-source-state", state);
  row.textContent = homeActionText(options.text);
  body.setAttribute?.("data-noria-markdown-source-state", state);

  const canConfigure = action === "configure" && typeof homeBridge?.runtime?.openHomeWidgetSettings === "function";
  const canOpen = action === "open" && !!source?.path;
  if (!canConfigure && !canOpen) return row;

  const button = row.createEl("button", {
    cls: "dashboard-home-markdown-single-state-action",
    text: homeRuntimeT(canConfigure ? "runtime.home.markdown.configure" : "runtime.home.markdown.open")
  });
  button.type = "button";
  button.setAttribute?.("data-noria-markdown-source-action", canConfigure ? "configure" : "open");
  applyHomeActionDataAttributes(button, canConfigure
    ? {
        id: `markdown-source-configure-${homeActionText(widget?.id) || "widget"}`,
        kind: "settings",
        source: "home-markdown-single"
      }
    : {
        id: `markdown-source-open-${getHomeMarkdownSourceDomId(source, 0)}`,
        kind: "file",
        path: source.path,
        source: "home-markdown-single"
      });
  setHomeActionButtonState(button, "idle");
  button.addEventListener?.("click", async (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    button.disabled = true;
    setHomeActionButtonState(button, "pending");
    try {
      if (canConfigure) {
        await homeBridge.runtime.openHomeWidgetSettings(widget?.id);
      } else {
        await openHomeActionFile(source.path, source);
      }
      setHomeActionButtonState(button, "ok");
    } catch (error) {
      setHomeActionButtonState(button, "failed", String(error?.message || error));
    } finally {
      button.disabled = false;
    }
  });
  return row;
}

async function renderMarkdownWidget(widget, mount) {
  const props = widget?.props && typeof widget.props === "object" && !Array.isArray(widget.props) ? widget.props : {};
  const dailySectionSource = getHomeDailySectionSource(widget);
  const dailySectionMode = homeActionText(props.sourceMode).toLowerCase() === "daily-section";
  const sources = dailySectionSource ? [dailySectionSource] : normalizeHomeMarkdownSources(widget);
  const body = mount.createDiv();
  body.addClass("dashboard-home-markdown-widget");
  body.addClass("markdown-preview-view");
  body.addClass("markdown-rendered");
  if (dailySectionMode) {
    body.addClass("dashboard-home-markdown-daily-section");
    if (homeActionText(props.renderMode).toLowerCase() === "compact") {
      body.addClass("dashboard-home-markdown-daily-section--compact");
    }
    body.setAttribute?.("data-noria-markdown-source-mode", "daily-section");
    body.setAttribute?.("data-noria-markdown-section-heading", normalizeHomeMarkdownHeading(props.heading));
    if (!dailySectionSource) {
      if (homeEditMode) {
        createHomeMarkdownSingleState(widget, body, {
          state: "empty",
          text: homeRuntimeT("runtime.home.markdown.empty"),
          action: "configure"
        });
      }
      return { state: "empty", hidden: !homeEditMode };
    }
    body.setAttribute?.("data-noria-markdown-source-path", dailySectionSource.path);
    const loaded = await loadTextResult(dailySectionSource.path);
    const section = loaded.ok
      ? extractHomeMarkdownH2Section(loaded.text, dailySectionSource.heading)
      : { found: false, text: "", line: 0 };
    if (!loaded.ok || !section.found || !section.text) {
      if (homeEditMode) {
        createHomeMarkdownSingleState(widget, body, {
          state: loaded.ok ? "empty" : "failed",
          text: loaded.ok ? homeRuntimeT("runtime.home.markdown.sourceEmpty") : markdownSourceLoadFailedText(loaded),
          source: dailySectionSource,
          action: "configure"
        });
      }
      return { state: "empty", hidden: !homeEditMode, sourcePath: dailySectionSource.path };
    }
    const content = body.createDiv();
    content.addClass("dashboard-home-markdown-daily-section-content");
    content.addClass("markdown-preview-view");
    content.addClass("markdown-rendered");
    const rendered = await renderMarkdownContent(section.text, content, dailySectionSource.path);
    body.setAttribute?.("data-noria-markdown-source-state", rendered.state);
    return { ...rendered, hidden: false, sourcePath: dailySectionSource.path, heading: dailySectionSource.heading };
  }
  const multiSource = sources.length > 1
    || Array.isArray(props.sources)
    || Array.isArray(props.entries)
    || String(props.mode || "").trim().toLowerCase() === "briefing";
  if (!sources.length) {
    createHomeMarkdownSingleState(widget, body, {
      state: "empty",
      text: homeRuntimeT("runtime.home.markdown.empty"),
      action: "configure"
    });
    return { state: "empty", hidden: false };
  }
  if (!multiSource) {
    const source = sources[0];
    body.addClass("dashboard-home-markdown-single");
    const loaded = await loadTextResult(source.path);
    if (!loaded.ok) {
      createHomeMarkdownSingleState(widget, body, {
        state: "failed",
        text: markdownSourceLoadFailedText(loaded),
        source,
        action: "configure"
      });
      return { state: "failed", hidden: false };
    }
    const content = body.createDiv();
    content.addClass("dashboard-home-markdown-single-content");
    content.addClass("markdown-preview-view");
    content.addClass("markdown-rendered");
    const rendered = await renderMarkdownContent(loaded.text, content, source.path);
    if (rendered.state === "empty") {
      createHomeMarkdownSingleState(widget, body, {
        state: "empty",
        text: homeRuntimeT("runtime.home.markdown.sourceEmpty"),
        source,
        action: "open"
      });
    } else if (rendered.state === "failed") {
      createHomeMarkdownSingleState(widget, body, {
        state: "failed",
        text: markdownSourceLoadFailedText(rendered),
        source,
        action: "open"
      });
    } else {
      body.setAttribute?.("data-noria-markdown-source-state", "ready");
    }
    return { state: rendered.state, hidden: false };
  }
  body.addClass("dashboard-home-markdown-briefing");
  body.setAttribute?.("data-noria-markdown-source-count", String(sources.length));
  const openFirst = homeActionBoolean(props.openFirst);
  body.setAttribute?.("data-noria-markdown-open-default", openFirst ? "first" : "manual");
  const briefingStats = createHomeMarkdownBriefingStats(sources.length);
  const overview = body.createDiv();
  overview.addClass("dashboard-home-markdown-briefing-overview");
  overview.setAttribute?.("aria-live", "polite");
  updateHomeMarkdownBriefingOverview(body, overview, briefingStats);
  const sourceLoadResults = sources.map((source) => loadTextResult(source.path));
  for (const [index, source] of sources.entries()) {
    const item = body.createEl("details");
    const roleMeta = getHomeMarkdownSourceRoleMeta(source);
    const sourceId = getHomeMarkdownSourceDomId(source, index);
    item.addClass("dashboard-home-markdown-briefing-item");
    item.setAttribute?.("data-noria-markdown-source", source.path);
    item.setAttribute?.("data-noria-markdown-source-id", sourceId);
    item.setAttribute?.("data-noria-markdown-source-index", String(index));
    item.setAttribute?.("data-noria-markdown-source-path", source.path);
    item.setAttribute?.("data-noria-markdown-source-label", source.label);
    item.setAttribute?.("data-noria-markdown-source-role", roleMeta.role);
    if (roleMeta.freshHours > 0) item.setAttribute?.("data-noria-markdown-source-fresh-hours", String(roleMeta.freshHours));
    item.open = homeActionBoolean(source.open) || (openFirst && index === 0);
    item.setAttribute?.("data-noria-markdown-source-open", item.open ? "true" : "false");
    const summary = item.createEl("summary");
    summary.addClass("dashboard-home-markdown-briefing-summary");
    summary.setAttribute?.("data-noria-markdown-source-summary", sourceId);
    const titleWrap = summary.createDiv();
    titleWrap.addClass("dashboard-home-markdown-source-title");
    if (roleMeta.role !== "note") {
      const roleEl = titleWrap.createEl("span", { cls: "dashboard-home-markdown-source-role", text: homeRuntimeT(roleMeta.labelKey) });
      roleEl.setAttribute?.("data-noria-markdown-source-role", roleMeta.role);
    }
    titleWrap.createEl("span", { cls: "dashboard-home-markdown-source-label", text: source.label });
    if (source.description) {
      titleWrap.createEl("span", { cls: "dashboard-home-markdown-source-desc", text: source.description });
    }
    const excerpt = titleWrap.createEl("span", { cls: "dashboard-home-markdown-source-excerpt", text: "" });
    excerpt.setAttribute?.("hidden", "true");
    excerpt.hidden = true;
    const actionHint = titleWrap.createEl("span", { cls: "dashboard-home-markdown-source-action-hint", text: "" });
    actionHint.setAttribute?.("hidden", "true");
    actionHint.hidden = true;
    const sectionTrail = titleWrap.createEl("span", { cls: "dashboard-home-markdown-source-section-trail", text: "" });
    sectionTrail.setAttribute?.("hidden", "true");
    sectionTrail.hidden = true;
    const meta = summary.createDiv();
    meta.addClass("dashboard-home-markdown-source-meta");
    meta.createEl("span", { cls: "dashboard-home-markdown-source-path", text: source.path });
    const facts = meta.createDiv();
    facts.addClass("dashboard-home-markdown-source-facts");
    const state = meta.createEl("span", { cls: "dashboard-home-markdown-source-state", text: "" });
    const setSourceState = (status, text) => {
      const normalized = homeActionText(status || "ready") || "ready";
      item.setAttribute?.("data-noria-markdown-source-state", normalized);
      state.setAttribute?.("data-noria-markdown-source-state", normalized);
      state.textContent = text || normalized;
    };
    const openButton = meta.createEl("button", { text: homeRuntimeT("runtime.home.markdown.open"), cls: "dashboard-home-markdown-source-open" });
    openButton.type = "button";
    openButton.title = source.path;
    openButton.setAttribute?.("data-noria-markdown-source-action", "open");
    openButton.setAttribute?.("data-noria-markdown-source-id", sourceId);
    openButton.setAttribute?.("data-noria-markdown-source-path", source.path);
    applyHomeActionDataAttributes(openButton, {
      id: `markdown-source-open-${sourceId}`,
      kind: "file",
      path: source.path,
      source: "home-markdown-briefing"
    });
    setHomeActionButtonState(openButton, "idle");
    openButton.addEventListener?.("click", async (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      openButton.disabled = true;
      setHomeActionButtonState(openButton, "pending");
      try {
        await openHomeActionFile(source.path, source);
        setHomeActionButtonState(openButton, "ok");
      } catch (e) {
        const message = String(e?.message || e);
        setHomeActionButtonState(openButton, "failed", message);
        try {
          homeBridge?.runtime?.notice?.("runtime.home.action.failed", { label: source.label, message });
        } catch (_) {}
      } finally {
        openButton.disabled = false;
      }
    });
    const content = item.createDiv();
    content.addClass("dashboard-home-markdown-briefing-content");
    content.setAttribute?.("data-noria-markdown-source-content", sourceId);
    content.addClass("markdown-preview-view");
    content.addClass("markdown-rendered");
    try {
      const loaded = await sourceLoadResults[index];
      if (!loaded.ok) {
        const statusText = markdownSourceLoadFailedText(loaded);
        setSourceState("failed", statusText);
        briefingStats.failed += 1;
        updateHomeMarkdownBriefingSourcePriority(briefingStats, item, {
          source,
          index,
          state: "failed",
          priorityReason: "failed"
        });
        updateHomeMarkdownBriefingOverview(body, overview, briefingStats);
        const empty = content.createDiv();
        empty.addClass("dashboard-home-widget-empty");
        empty.textContent = statusText;
        continue;
      }
      const sourceExcerpt = updateMarkdownSourceExcerpt(item, excerpt, source, loaded.text);
      updateMarkdownSourceSections(item, sectionTrail, source, loaded.text);
      const actionSummary = updateMarkdownSourceActionHint(item, actionHint, source, loaded.text, sourceExcerpt);
      const sourceFacts = await updateMarkdownSourceFacts(item, facts, source, loaded.text, actionSummary);
      const rendered = await renderMarkdownContent(loaded.text, content, source.path);
      updateHomeMarkdownBriefingActionCandidate(briefingStats, {
        source,
        index,
        actionSummary,
        state: rendered.state,
        freshness: sourceFacts.freshness,
        count: sourceFacts.actionCount
      });
      suppressHomeMarkdownSourceActionHintForWorkbench(
        actionHint,
        getHomeMarkdownBriefingActionCandidates(briefingStats).length > 0
      );
      briefingStats.actions += Number(sourceFacts.actionCount || 0);
      briefingStats.words += Number(sourceFacts.words || 0);
      if (sourceFacts.freshness === "fresh") briefingStats.fresh += 1;
      if (sourceFacts.freshness === "stale") briefingStats.stale += 1;
      if (sourceFacts.freshness === "unknown") briefingStats.unknown += 1;
      if (rendered.state === "empty") {
        setSourceState("empty", homeRuntimeT("runtime.home.markdown.sourceEmpty"));
        briefingStats.empty += 1;
        const empty = content.createDiv();
        empty.addClass("dashboard-home-widget-empty");
        empty.textContent = homeRuntimeT("runtime.home.markdown.sourceEmpty");
      } else if (rendered.state === "failed") {
        setSourceState("failed", markdownSourceLoadFailedText(rendered));
        briefingStats.failed += 1;
      } else {
        setSourceState("ready", homeRuntimeT("runtime.home.markdown.sourceReady"));
        briefingStats.ready += 1;
      }
      updateHomeMarkdownBriefingSourcePriority(briefingStats, item, {
        source,
        index,
        state: rendered.state,
        freshness: sourceFacts.freshness,
        actionCount: sourceFacts.actionCount,
        actionLine: actionSummary.line
      });
      updateHomeMarkdownBriefingOverview(body, overview, briefingStats);
    } catch (e) {
      const statusText = markdownSourceLoadFailedText({ error: e });
      setSourceState("failed", statusText);
      briefingStats.failed += 1;
      updateHomeMarkdownBriefingSourcePriority(briefingStats, item, {
        source,
        index,
        state: "failed",
        priorityReason: "failed"
      });
      updateHomeMarkdownBriefingOverview(body, overview, briefingStats);
      const empty = content.createDiv();
      empty.addClass("dashboard-home-widget-empty");
      empty.textContent = statusText;
    }
  }
  return { state: homeMarkdownBriefingState(briefingStats), hidden: false };
}

function renderHomeWidgetFailure(widget, mount, error) {
  const message = String(error?.message || error || "unknown");
  const source = String(widget?.source || widget?.id || "").trim();
  const host = mount?.parentElement || null;
  try {
    host?.setAttr?.("data-noria-widget-state", "failed");
    host?.setAttribute?.("data-noria-widget-state", "failed");
    host?.setAttr?.("data-noria-widget-error", message);
    host?.setAttribute?.("data-noria-widget-error", message);
  } catch (_) {}
  const empty = mount?.createDiv?.({ cls: "dashboard-home-widget-empty" });
  if (empty) {
    empty.textContent = homeRuntimeT("runtime.home.facade.widgetFailed", { path: source, message });
    empty.setAttr?.("data-noria-widget-failure", "true");
    empty.setAttribute?.("data-noria-widget-failure", "true");
  } else {
    ctx.paragraph(homeRuntimeT("runtime.home.facade.widgetFailed", { path: source, message }));
  }
  try {
    const verbose = !!(homeBridge?.diagnostics?.verbose || homeBridge?.performance?.verboseDiagnostics);
    if (verbose) console.warn("Noria Home widget failed", { source, message });
  } catch (_) {}
}

async function renderCustomViewWidget(widget, mount) {
  try {
    await runCustomViewByPath(widget.source, { ...opts, ...(widget.props || {}), mount: attachDomHelpers(mount) });
  } catch (e) {
    renderHomeWidgetFailure(widget, mount, e);
  }
}

function homeReadPath(obj, pathText) {
  const parts = String(pathText || "").split(".").map((part) => part.trim()).filter(Boolean);
  let cursor = obj;
  for (const part of parts) {
    if (cursor == null || typeof cursor !== "object") return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

function normalizeHomeStatMetric(raw, index) {
  const metric = typeof raw === "string" ? { id: raw } : (raw && typeof raw === "object" ? raw : {});
  const id = homeActionText(metric.id || metric.key || `metric-${index + 1}`);
  const base = HOME_STAT_METRIC_REGISTRY[id] || {};
  const valuePath = homeActionText(metric.valuePath || metric.path || base.path);
  if (!valuePath) return null;
  const label = homeActionText(metric.label || metric.title)
    || (metric.labelKey ? homeRuntimeT(metric.labelKey) : "")
    || (base.labelKey ? homeRuntimeT(base.labelKey) : "")
    || id;
  return {
    id,
    label,
    valuePath,
    suffix: homeActionText(metric.suffix != null ? metric.suffix : base.suffix),
    format: homeActionText(metric.format || base.format || "number"),
    include: normalizeHomeStatInclude(metric.include || base.include)
  };
}

function normalizeHomeStatInclude(raw) {
  const values = Array.isArray(raw) ? raw : (typeof raw === "string" ? raw.split(/[\s,]+/) : []);
  const out = [];
  values.forEach((item) => {
    const id = homeActionText(item);
    if (id && !out.includes(id)) out.push(id);
  });
  return out;
}

function formatHomeStatValue(value, metric) {
  if (value == null || value === "") return "0";
  const n = Number(value);
  if (Number.isFinite(n)) {
    const abs = Math.abs(n);
    const formatted = metric.format === "compact" && abs >= 1000
      ? n.toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 1 })
      : n.toLocaleString(undefined, { maximumFractionDigits: metric.suffix === "%" ? 1 : 0 });
    return `${formatted}${metric.suffix || ""}`;
  }
  return `${String(value)}${metric.suffix || ""}`;
}

async function getHomeStatSnapshot(widget, metrics = []) {
  const props = widget.props && typeof widget.props === "object" ? widget.props : {};
  const request = {
    preset: homeActionText(props.preset || "home") || "home",
    range: props.range && typeof props.range === "object" ? { ...props.range } : { mode: "homeCurrent" },
    granularity: homeActionText(props.granularity || "")
  };
  const extraInclude = normalizeHomeStatInclude(props.include);
  metrics.forEach((metric) => {
    (Array.isArray(metric?.include) ? metric.include : []).forEach((item) => {
      if (item && !extraInclude.includes(item)) extraInclude.push(item);
    });
  });
  if (extraInclude.length) {
    request.include = [...HOME_STAT_DEFAULT_INCLUDE];
    extraInclude.forEach((item) => {
      if (!request.include.includes(item)) request.include.push(item);
    });
  }
  if (typeof homeBridge?.data?.getSnapshot === "function") {
    return homeBridge.data.getSnapshot(request, { ctx });
  }
  const factory = globalThis.dashboardCore?.data?.dataService?.createDataService;
  if (typeof factory === "function") {
    const service = factory({ bridge: homeBridge, ctx, app, momentApi: window?.moment });
    return service.getSnapshot(request);
  }
  return null;
}

async function renderHomeStatHeatmap(widget, mount) {
  const props = widget.props && typeof widget.props === "object" ? widget.props : {};
  const snapshot = await getHomeStatSnapshot(widget, []);
  const root = mount.createDiv();
  root.addClass("dashboard-home-stat-heatmap");
  if (!snapshot) {
    const empty = root.createDiv();
    empty.addClass("dashboard-home-widget-empty");
    empty.textContent = homeRuntimeT("runtime.home.stat.unavailable");
    return;
  }

  const domains = snapshot.domains || {};
  const domainId = props.domain === "workload" ? "workload" : "habits";
  const domain = domains[domainId] || {};
  const habitItems = domains.habits && Array.isArray(domains.habits.items) ? domains.habits.items : [];
  const overviewLabel = homeRuntimeT("runtime.home.trends.overview");
  const checkinsLabel = homeRuntimeT("runtime.home.trends.checkins");
  const workloadLabel = homeRuntimeT("runtime.home.trends.workHeatmap");
  const controls = root.createDiv();
  controls.addClass("dashboard-home-stat-heatmap-controls");
  const chart = root.createDiv();
  chart.addClass("dashboard-home-stat-heatmap-chart");
  const renderYearHeatmapCalendar = globalThis.dashboardCore?.components?.charts?.yearHeatmapCalendar?.renderYearHeatmapCalendar;

  const subjects = domainId === "habits"
    ? [{ id: "", label: overviewLabel, series: domain?.heatmap?.series || [] }, ...habitItems.map((item) => ({
        id: String(item?.name || ""),
        label: String(item?.name || ""),
        series: item?.heatmap?.series || []
      })).filter((item) => item.id)]
    : [{ id: "", label: workloadLabel, series: domain?.heatmap?.series || [] }];
  let activeSubject = subjects.some((item) => item.id === String(props.subject || "")) ? String(props.subject || "") : "";
  const buttons = [];

  const draw = (subjectId) => {
    activeSubject = subjectId;
    if (typeof chart.empty === "function") chart.empty();
    else chart.textContent = "";
    buttons.forEach(({ button, id }) => {
      const active = id === activeSubject;
      button.classList?.toggle?.("is-active", active);
      button.setAttribute?.("aria-pressed", active ? "true" : "false");
    });
    const subject = subjects.find((item) => item.id === activeSubject) || subjects[0];
    const rows = Array.isArray(subject?.series) ? subject.series : [];
    if (typeof renderYearHeatmapCalendar !== "function" || !rows.length) {
      const empty = chart.createDiv();
      empty.addClass("dashboard-home-widget-empty");
      empty.textContent = homeRuntimeT(typeof renderYearHeatmapCalendar === "function" ? "runtime.home.stat.empty" : "runtime.home.trends.heatmapMissing");
      return;
    }
    const rawValues = rows.map((row) => Number(row?.value ?? row?.checked ?? 0) || 0);
    const maxValue = Math.max(1, ...rawValues);
    const entries = rows.map((row, index) => {
      const date = String(row?.date || row?.key || "").slice(0, 10);
      const rawValue = rawValues[index];
      const intensity = rawValue > 0 ? Math.max(1, Math.ceil((rawValue / maxValue) * 6)) : 0;
      const noun = domainId === "habits" ? checkinsLabel : workloadLabel;
      const valueLabel = `${noun} ${rawValue}`;
      const tooltip = `${date} · ${valueLabel}`;
      return { date, intensity, rawValue, valueLabel, tooltip, ariaLabel: tooltip };
    }).filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry.date));
    const year = Number(String(entries.at(-1)?.date || entries[0]?.date || "").slice(0, 4)) || new Date().getFullYear();
    renderYearHeatmapCalendar(chart, {
      year,
      entries,
      weekStartDay: 1,
      levels: 6,
      paletteKey: domainId === "habits" ? "habit" : "work",
      showYearLabel: false
    });
  };

  subjects.forEach((subject) => {
    const button = controls.createEl("button", { text: subject.label });
    button.type = "button";
    button.addClass?.("dashboard-home-stat-heatmap-subject");
    button.setAttribute?.("data-noria-heatmap-subject", subject.id || "overview");
    button.addEventListener?.("click", () => draw(subject.id));
    buttons.push({ button, id: subject.id });
  });
  draw(activeSubject);
}

async function renderStatWidget(widget, mount) {
  const props = widget.props && typeof widget.props === "object" ? widget.props : {};
  if (props.presentation === "heatmap") return renderHomeStatHeatmap(widget, mount);
  const metricsRaw = Array.isArray(props.metrics) && props.metrics.length
    ? props.metrics
    : ["tasks.completed", "tasks.open", "tasks.completionRate", "notes.created"];
  const metrics = metricsRaw.map((metric, index) => normalizeHomeStatMetric(metric, index)).filter(Boolean);
  const wrap = mount.createDiv();
  wrap.addClass("dashboard-home-stat-widget");
  if (!metrics.length) {
    const empty = wrap.createDiv();
    empty.addClass("dashboard-home-widget-empty");
    empty.textContent = homeRuntimeT("runtime.home.stat.empty");
    return;
  }
  const snapshot = await getHomeStatSnapshot(widget, metrics);
  if (!snapshot) {
    const empty = wrap.createDiv();
    empty.addClass("dashboard-home-widget-empty");
    empty.textContent = homeRuntimeT("runtime.home.stat.unavailable");
    return;
  }
  metrics.forEach((metric) => {
    const card = wrap.createDiv();
    card.addClass("dashboard-home-stat-card");
    card.setAttr?.("data-noria-stat-id", metric.id);
    const valueEl = card.createDiv();
    valueEl.addClass("dashboard-home-stat-value");
    valueEl.textContent = formatHomeStatValue(homeReadPath(snapshot, metric.valuePath), metric);
    const labelEl = card.createDiv();
    labelEl.addClass("dashboard-home-stat-label");
    labelEl.textContent = metric.label;
  });
}

function homeActionText(value) {
  return String(value || "").trim();
}

function homeActionBoolean(value) {
  if (value === true) return true;
  if (value === false || value == null) return false;
  const text = String(value).trim().toLowerCase();
  return text === "true" || text === "1" || text === "yes" || text === "on";
}

function homeActionPath(value) {
  return homeActionText(value).replace(/\\/g, "/").replace(/^\/+/, "");
}

function getHomeActionLabel(action, index) {
  const key = homeActionText(action?.labelKey || action?.titleKey);
  if (key) return homeRuntimeT(key);
  return homeActionText(action?.label || action?.title || action?.name) || `Action ${index + 1}`;
}

function getHomeActionKind(action) {
  return homeActionText(action?.kind || action?.type).toLowerCase();
}

function isHomeQuickCaptureKind(kind) {
  const k = homeActionText(kind).toLowerCase();
  return k === "quickcapture" || k === "quick-capture" || k === "capture";
}

function getHomeActionCommand(action) {
  const view = homeActionText(action?.view || action?.target).toLowerCase();
  if (view && HOME_ACTION_VIEW_COMMANDS[view]) return HOME_ACTION_VIEW_COMMANDS[view];
  return homeActionText(action?.commandId || action?.command);
}

function qualifyHomeCommandId(commandId) {
  const id = homeActionText(commandId);
  if (!id || id.includes(":")) return id;
  const pluginId = homeActionText(homeBridge?.pluginId) || "noria";
  return `${pluginId}:${id}`;
}

function isTodayActionStripSuppressedAction(action) {
  const id = homeActionText(action?.id || action?.actionId).toLowerCase();
  const view = homeActionText(action?.view || action?.target).toLowerCase();
  const command = getHomeActionCommand(action);
  return command === HOME_ACTION_VIEW_COMMANDS.timeline
    || view === "timeline"
    || id === "timeline"
    || id === "task-timeline"
    || id === "tasks-timeline"
    || id === "legacy-timeline";
}

function getHomeActionFile(action) {
  return homeActionPath(action?.path || action?.file || action?.note);
}

function getHomeEntryPath(entry) {
  return homeActionPath(entry?.path || entry?.file || entry?.note || entry?.base || entry?.source);
}

function getHomeEntryLabel(entry, index) {
  const key = homeActionText(entry?.labelKey || entry?.titleKey);
  if (key) return homeRuntimeT(key);
  const explicit = homeActionText(entry?.label || entry?.title || entry?.name);
  if (explicit) return explicit;
  const pathText = getHomeEntryPath(entry);
  const tail = pathText.split("/").filter(Boolean).pop() || "";
  return tail.replace(/\.(md|base)$/i, "") || `Entry ${index + 1}`;
}

function getHomeEntryDescription(entry) {
  return homeActionText(entry?.description || entry?.desc || entry?.summary);
}

function normalizeHomeEntryItems(widget) {
  const props = widget.props && typeof widget.props === "object" ? widget.props : {};
  const raw = Array.isArray(props.entries) && props.entries.length
    ? props.entries
    : (widget.source ? [{ label: widget.title, path: widget.source, kind: widget.type }] : []);
  return raw
    .map((entry, index) => {
      const item = entry && typeof entry === "object" && !Array.isArray(entry) ? entry : { path: entry };
      const pathText = getHomeEntryPath(item);
      return {
        ...item,
        path: pathText,
        label: getHomeEntryLabel(item, index),
        description: getHomeEntryDescription(item),
        newLeaf: item.newLeaf === true || props.newLeaf === true
      };
    })
    .filter((entry) => entry.path);
}

function getHomeQuickCaptureText(action) {
  return homeActionText(action?.text || action?.value || action?.content || action?.line);
}

function getHomeQuickCaptureTarget(action) {
  return homeActionText(action?.target || action?.captureTarget || action?.to || "diary-inbox") || "diary-inbox";
}

function getHomeActionDescriptor(action) {
  const kind = getHomeActionKind(action)
    || (getHomeActionFile(action) ? "file" : (getHomeActionCommand(action) ? "command" : "auto"));
  const view = homeActionText(action?.view || action?.target).toLowerCase();
  const file = getHomeActionFile(action);
  const command = getHomeActionCommand(action);
  const quickCapture = isHomeQuickCaptureKind(kind);
  return {
    id: homeActionText(action?.id || action?.actionId),
    kind,
    target: quickCapture ? getHomeQuickCaptureTarget(action) : (view || file || command),
    command,
    source: homeActionText(action?.source || action?.id || "home-action")
  };
}

function applyHomeActionDataAttributes(button, action) {
  if (!button) return;
  const descriptor = getHomeActionDescriptor(action);
  const set = (name, value) => {
    const text = homeActionText(value);
    if (!text) return;
    button.setAttribute?.(name, text);
    button.setAttr?.(name, text);
  };
  set("data-noria-action-id", descriptor.id);
  set("data-noria-action-kind", descriptor.kind);
  set("data-noria-action-target", descriptor.target);
  set("data-noria-action-command", descriptor.command);
  set("data-noria-action-source", descriptor.source);
  set("data-noria-home-action", descriptor.kind || "auto");
  set("data-noria-widget-kind", descriptor.kind || "auto");
}

function clearHomeActionButtonError(button) {
  try {
    button?.removeAttribute?.("data-noria-action-error");
  } catch (_) {}
  try {
    if (button?.attrs && Object.prototype.hasOwnProperty.call(button.attrs, "data-noria-action-error")) {
      delete button.attrs["data-noria-action-error"];
    }
  } catch (_) {}
}

function setHomeActionButtonState(button, state = "idle", error = "") {
  if (!button) return;
  const nextState = homeActionText(state) || "idle";
  button.setAttribute?.("data-noria-action-state", nextState);
  button.setAttr?.("data-noria-action-state", nextState);
  const message = homeActionText(error);
  if (message) {
    button.setAttribute?.("data-noria-action-error", message);
    button.setAttr?.("data-noria-action-error", message);
  } else {
    clearHomeActionButtonError(button);
  }
}

function canRunHomeAction(action) {
  const kind = getHomeActionKind(action);
  if (isHomeQuickCaptureKind(kind)) {
    return !!getHomeQuickCaptureText(action) && typeof homeBridge?.quickCapture?.append === "function";
  }
  if (kind === "view" || homeActionText(action?.view || action?.target)) return !!getHomeActionCommand(action);
  if (kind === "file" || kind === "note") return !!getHomeActionFile(action);
  if (kind === "command") return !!getHomeActionCommand(action);
  return !!(getHomeActionFile(action) || getHomeActionCommand(action));
}

async function runHomeCommand(commandId, request = {}) {
  const id = homeActionText(commandId);
  if (!id) throw new Error("missing command id");
  const commandRequest = request && typeof request === "object" && !Array.isArray(request)
    ? { ...request }
    : {};
  if (id === HOME_ACTION_VIEW_COMMANDS.tasks && typeof homeBridge.openTasksBoard === "function") {
    return homeBridge.openTasksBoard(commandRequest);
  }
  if (id === HOME_ACTION_VIEW_COMMANDS.daily && typeof homeBridge.openDailyNote === "function") {
    return homeBridge.openDailyNote(commandRequest);
  }
  if (id === HOME_ACTION_VIEW_COMMANDS.day && typeof homeBridge.openTaskBoardDay === "function") {
    return homeBridge.openTaskBoardDay(commandRequest.date || "");
  }
  if (id === HOME_ACTION_VIEW_COMMANDS.timeline && typeof homeBridge.openTasksTimeline === "function") {
    return homeBridge.openTasksTimeline(commandRequest);
  }
  if (id === HOME_ACTION_VIEW_COMMANDS.calendar && typeof homeBridge.openCalendar === "function") {
    return homeBridge.openCalendar(commandRequest);
  }
  if (id === HOME_ACTION_VIEW_COMMANDS.review && typeof homeBridge.openReviewCenter === "function") {
    return homeBridge.openReviewCenter({ source: commandRequest.source || "home-action" });
  }
  if (typeof app?.commands?.executeCommandById === "function") {
    return app.commands.executeCommandById(qualifyHomeCommandId(id));
  }
  if (typeof homeBridge?.commands?.execute === "function") {
    return homeBridge.commands.execute(id);
  }
  if (typeof homeBridge?.runCommand === "function") {
    return homeBridge.runCommand(id);
  }
  throw new Error(`command unavailable: ${id}`);
}

async function openHomeActionFile(pathText, action) {
  const path = homeActionPath(pathText);
  if (!path) throw new Error("missing file path");
  const requestedLine = Number(action?.line ?? action?.targetLine ?? action?.sourceLine);
  const targetLine = Number.isFinite(requestedLine) && requestedLine > 0 ? Math.max(0, Math.floor(requestedLine) - 1) : -1;
  if (targetLine < 0 && typeof app?.workspace?.openLinkText === "function") {
    return app.workspace.openLinkText(path.replace(/\.md$/i, ""), "", !!action?.newLeaf);
  }
  const file = app?.vault?.getAbstractFileByPath?.(path);
  const leaf = app?.workspace?.getLeaf?.(action?.newLeaf ? "tab" : false);
  if (file && leaf && typeof leaf.openFile === "function") {
    await leaf.openFile(file, { active: true });
    try {
      app?.workspace?.revealLeaf?.(leaf);
    } catch (_) {}
    if (targetLine >= 0) {
      try {
        leaf.view?.setEphemeralState?.({ line: targetLine });
      } catch (_) {}
      try {
        const editor = leaf.view?.editor;
        editor?.setCursor?.({ line: targetLine, ch: 0 });
        editor?.scrollIntoView?.({ from: { line: targetLine, ch: 0 }, to: { line: targetLine, ch: 0 } }, true);
      } catch (_) {}
    }
    return true;
  }
  if (typeof app?.workspace?.openLinkText === "function") {
    return app.workspace.openLinkText(path.replace(/\.md$/i, ""), "", !!action?.newLeaf);
  }
  throw new Error(`file unavailable: ${path}`);
}

async function runHomeQuickCapture(action) {
  const append = homeBridge?.quickCapture?.append;
  if (typeof append !== "function") throw new Error("quick capture unavailable");
  const text = getHomeQuickCaptureText(action);
  if (!text) throw new Error("missing capture text");
  const request = {
    source: "home-action",
    target: getHomeQuickCaptureTarget(action),
    text
  };
  const actionId = homeActionText(action?.id || action?.actionId);
  if (actionId) request.actionId = actionId;
  const copyOptional = (key, sourceKey = key) => {
    const value = action?.[sourceKey];
    if (value == null) return;
    const textValue = typeof value === "string" ? homeActionText(value) : value;
    if (textValue === "") return;
    request[key] = textValue;
  };
  copyOptional("date");
  copyOptional("now");
  copyOptional("path");
  copyOptional("heading");
  copyOptional("open");
  const result = await append(request);
  if (result?.ok !== false) {
    try {
      homeBridge?.runtime?.notice?.("runtime.home.action.captured", { path: result?.path || "" }, 2600);
    } catch (_) {}
  }
  return result;
}

async function runHomeAction(action) {
  const kind = getHomeActionKind(action);
  if (isHomeQuickCaptureKind(kind)) return runHomeQuickCapture(action);
  if (kind === "file" || kind === "note") return openHomeActionFile(getHomeActionFile(action), action);
  const commandRequest = {
    source: homeActionText(action?.source || action?.id || "home-action")
  };
  if (action?.date != null) commandRequest.date = homeActionText(action.date);
  if (kind === "view" || kind === "command") return runHomeCommand(getHomeActionCommand(action), commandRequest);
  const file = getHomeActionFile(action);
  if (file) return openHomeActionFile(file, action);
  return runHomeCommand(getHomeActionCommand(action), commandRequest);
}

async function renderActionWidget(widget, mount) {
  const actions = Array.isArray(widget.props?.actions) ? widget.props.actions.filter((action) => action && typeof action === "object") : [];
  const wrap = mount.createDiv();
  wrap.addClass("dashboard-home-action-widget");
  if (!actions.length) {
    const empty = wrap.createDiv();
    empty.addClass("dashboard-home-widget-empty");
    empty.textContent = homeRuntimeT("runtime.home.action.empty");
    return;
  }

  actions.forEach((action, index) => {
    const label = getHomeActionLabel(action, index);
    const button = wrap.createEl("button", { text: label, cls: "dashboard-home-action-button" });
    button.type = "button";
    button.disabled = action.disabled === true || !canRunHomeAction(action);
    applyHomeActionDataAttributes(button, action);
    setHomeActionButtonState(button, "idle");
    button.setAttribute?.("aria-label", label);
    button.title = homeActionText(action.tooltip || action.title || label);
    button.addEventListener?.("click", async (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      if (button.disabled) return;
      button.disabled = true;
      setHomeActionButtonState(button, "pending");
      try {
        await runHomeAction(action);
        setHomeActionButtonState(button, "ok");
      } catch (e) {
        const message = String(e?.message || e);
        setHomeActionButtonState(button, "failed", message);
        try {
          homeBridge?.runtime?.notice?.("runtime.home.action.failed", { label, message });
        } catch (_) {}
        try {
          console.warn("Noria Home action failed", e);
        } catch (_) {}
      } finally {
        button.disabled = action.disabled === true || !canRunHomeAction(action);
      }
    });
  });
}

function normalizeTodayActionStripActions(widget) {
  const actions = Array.isArray(widget.props?.actions) && widget.props.actions.length
    ? widget.props.actions
    : HOME_TODAY_DEFAULT_ACTIONS;
  return actions.filter((action) => action && typeof action === "object" && !isTodayActionStripSuppressedAction(action));
}

async function renderTodayActionStrip(widget, mount) {
  const wrap = mount.createDiv();
  wrap.addClass("dashboard-home-today-actions");
  wrap.setAttr?.("data-noria-home-today-actions", "1");

  const capture = wrap.createDiv();
  capture.addClass("dashboard-home-today-capture");

  const defaultCaptureTarget = homeActionText(widget.props?.captureTarget || widget.props?.target || "diary-inbox") || "diary-inbox";
  const normalizedDefaultTarget = homeActionText(defaultCaptureTarget).trim().replace(/[_\s]+/g, "-").toLowerCase();
  let captureMode = normalizedDefaultTarget === "today-task" || normalizedDefaultTarget === "todaytask" || normalizedDefaultTarget === "task"
    ? "task"
    : "inbox";
  const captureModes = [
    {
      key: "inbox",
      label: homeRuntimeT("runtime.home.todayActions.captureModeInbox"),
      placeholder: homeRuntimeT("runtime.home.todayActions.capturePlaceholder"),
      submit: homeRuntimeT("runtime.home.todayActions.capture"),
      target: defaultCaptureTarget
    },
    {
      key: "task",
      label: homeRuntimeT("runtime.home.todayActions.captureModeTask"),
      placeholder: homeRuntimeT("runtime.home.todayActions.taskPlaceholder"),
      submit: homeRuntimeT("runtime.home.todayActions.addTask"),
      target: "today-task"
    }
  ];
  const captureModeGroup = capture.createDiv();
  captureModeGroup.addClass("dashboard-home-today-capture-modes");

  const captureInput = capture.createEl("textarea", { cls: "dashboard-home-today-capture-input" });
  captureInput.rows = 1;
  captureInput.value = "";
  captureInput.setAttribute?.("spellcheck", "true");

  const captureButton = capture.createEl("button", { text: homeRuntimeT("runtime.home.todayActions.capture"), cls: "dashboard-home-today-capture-button" });
  captureButton.type = "button";
  captureButton.setAttribute?.("data-noria-home-action", "quickcapture");
  captureButton.setAttribute?.("data-noria-widget-kind", "quickcapture");
  captureButton.setAttribute?.("data-noria-capture-submit", "1");

  const getCaptureModeSpec = () => captureModes.find((mode) => mode.key === captureMode) || captureModes[0];
  const modeButtons = captureModes.map((mode) => {
    const btn = captureModeGroup.createEl("button", { text: mode.label, cls: "dashboard-home-today-capture-mode" });
    btn.type = "button";
    btn.setAttribute?.("data-noria-capture-mode", mode.key);
    btn.setAttribute?.("aria-label", mode.label);
    btn.addEventListener?.("click", (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      captureMode = mode.key;
      updateCaptureState();
      try { captureInput.focus?.(); } catch (_) {}
    });
    return btn;
  });

  const canCapture = () => !!homeActionText(captureInput.value) && typeof homeBridge?.quickCapture?.append === "function";
  const updateCaptureState = () => {
    const spec = getCaptureModeSpec();
    capture.setAttribute?.("data-noria-home-capture-mode", spec.key);
    captureInput.placeholder = spec.placeholder;
    captureInput.setAttribute?.("aria-label", spec.placeholder);
    captureButton.textContent = spec.submit;
    captureButton.setAttribute?.("data-noria-capture-target", spec.target);
    applyHomeActionDataAttributes(captureButton, {
      id: spec.key === "task" ? "today-action-task" : "today-action-capture",
      kind: "quickCapture",
      target: spec.target,
      source: "home-action"
    });
    if (!captureButton.attrs?.["data-noria-action-state"] && !captureButton.getAttribute?.("data-noria-action-state")) {
      setHomeActionButtonState(captureButton, "idle");
    }
    captureButton.disabled = !canCapture();
    modeButtons.forEach((btn) => {
      const buttonMode = btn.getAttribute?.("data-noria-capture-mode") || btn.attrs?.["data-noria-capture-mode"];
      const active = buttonMode === spec.key;
      if (active) btn.classList?.add?.("is-active");
      else btn.classList?.remove?.("is-active");
      btn.setAttribute?.("aria-pressed", active ? "true" : "false");
    });
  };
  const runCapture = async () => {
    if (!canCapture() || captureButton.disabled) return;
    const text = homeActionText(captureInput.value);
    const spec = getCaptureModeSpec();
    captureButton.disabled = true;
    setHomeActionButtonState(captureButton, "pending");
    try {
      await runHomeAction({
        id: spec.key === "task" ? "today-action-task" : "today-action-capture",
        kind: "quickCapture",
        target: spec.target,
        text
      });
      captureInput.value = "";
      setHomeActionButtonState(captureButton, "ok");
    } catch (e) {
      const message = String(e?.message || e);
      setHomeActionButtonState(captureButton, "failed", message);
      try {
        homeBridge?.runtime?.notice?.("runtime.home.action.failed", { label: homeRuntimeT("runtime.home.todayActions.capture"), message });
      } catch (_) {}
      try {
        console.warn("Noria Home today capture failed", e);
      } catch (_) {}
    } finally {
      updateCaptureState();
    }
  };
  captureInput.addEventListener?.("input", updateCaptureState);
  captureInput.addEventListener?.("keydown", async (event) => {
    const isEnter = String(event?.key || "").toLowerCase() === "enter";
    const isSubmitChord = isEnter && (event?.ctrlKey || event?.metaKey);
    const isPlainSubmit = isEnter && !event?.shiftKey && !event?.altKey && !event?.ctrlKey && !event?.metaKey;
    if (!event?.isComposing && (isSubmitChord || isPlainSubmit)) {
      event?.preventDefault?.();
      await runCapture();
    }
  });
  captureButton.addEventListener?.("click", async (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    await runCapture();
  });
  updateCaptureState();

  const actions = wrap.createDiv();
  actions.addClass("dashboard-home-today-action-row");
  normalizeTodayActionStripActions(widget).forEach((action, index) => {
    const label = getHomeActionLabel(action, index);
    const button = actions.createEl("button", { text: label, cls: "dashboard-home-today-action-button" });
    button.type = "button";
    button.disabled = action.disabled === true || !canRunHomeAction(action);
    applyHomeActionDataAttributes(button, action);
    setHomeActionButtonState(button, "idle");
    button.setAttribute?.("aria-label", label);
    button.title = homeActionText(action.tooltip || action.title || label);
    button.addEventListener?.("click", async (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      if (button.disabled) return;
      button.disabled = true;
      setHomeActionButtonState(button, "pending");
      try {
        await runHomeAction(action);
        setHomeActionButtonState(button, "ok");
      } catch (e) {
        const message = String(e?.message || e);
        setHomeActionButtonState(button, "failed", message);
        try {
          homeBridge?.runtime?.notice?.("runtime.home.action.failed", { label, message });
        } catch (_) {}
        try {
          console.warn("Noria Home today action failed", e);
        } catch (_) {}
      } finally {
        button.disabled = action.disabled === true || !canRunHomeAction(action);
      }
    });
  });
  createHomeLayoutEditToggle(actions, "dashboard-home-today-action-button");
}

function formatHomeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const raw = String(value || "").trim();
  const match = raw.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : "";
}

async function renderEntryWidget(widget, mount) {
  const props = widget.props && typeof widget.props === "object" ? widget.props : {};
  const entries = normalizeHomeEntryItems(widget);
  const wrap = mount.createDiv();
  wrap.addClass("dashboard-home-entry-widget");
  wrap.setAttr?.("data-noria-entry-widget-type", widget.type || "list");
  const description = homeActionText(props.description || props.desc || props.summary);
  if (description) {
    const desc = wrap.createDiv();
    desc.addClass("dashboard-home-entry-widget__description");
    desc.textContent = description;
  }
  if (!entries.length) {
    const empty = wrap.createDiv();
    empty.addClass("dashboard-home-widget-empty");
    empty.textContent = homeRuntimeT("runtime.home.entry.empty");
    return;
  }
  entries.forEach((entry) => {
    const row = wrap.createDiv();
    row.addClass("dashboard-home-entry-row");
    row.setAttr?.("data-noria-entry-path", entry.path);
    const button = row.createEl("button", { text: entry.label, cls: "dashboard-home-entry-button" });
    button.type = "button";
    button.disabled = !entry.path;
    button.title = entry.path;
    button.setAttribute?.("data-noria-entry-kind", homeActionText(entry.kind || widget.type || "file"));
    const meta = row.createDiv();
    meta.addClass("dashboard-home-entry-meta");
    meta.textContent = entry.path;
    if (entry.description) {
      const desc = row.createDiv();
      desc.addClass("dashboard-home-entry-description");
      desc.textContent = entry.description;
    }
    button.addEventListener?.("click", async (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      if (button.disabled) return;
      button.disabled = true;
      try {
        await openHomeActionFile(entry.path, entry);
      } catch (e) {
        try {
          homeBridge?.runtime?.notice?.("runtime.home.action.failed", { label: entry.label, message: String(e?.message || e) });
        } catch (_) {}
        try {
          console.warn("Noria Home entry failed", e);
        } catch (_) {}
      } finally {
        button.disabled = !entry.path;
      }
    });
  });
}

async function renderBuiltinWidget(widget, mount, shell = {}) {
  const entry = HOME_WIDGET_REGISTRY[widget.id];
  if (!entry) return;
  const viewInput = { ...opts, ...(entry.props || {}), ...(widget.props || {}) };
  if (shell.titleActions) viewInput.titleActionsHost = attachDomHelpers(shell.titleActions);
  if (widget.id === "trends" && shell.titleActions) viewInput.controlsHost = attachDomHelpers(shell.titleActions);
  if (widget.id === "today-actions") return renderTodayActionStrip(widget, mount);
  const shouldLazy = (entry.lazy && widget.props?.lazy !== false) || widget.props?.lazy === true;
  if (shouldLazy) await renderLazySection(entry.path, mount, viewInput);
  else await renderSection(entry.path, mount, viewInput);
}

async function renderWidget(widget, mount, shell = {}) {
  return homePerf.measure("widget", `${widget.type}:${widget.id || widget.source || ""}`, async () => {
        if (widget.type === "markdown") return renderMarkdownWidget(widget, mount);
        if (widget.type === "view") return renderCustomViewWidget(widget, mount);
        if (widget.type === "action") return renderActionWidget(widget, mount);
        if (widget.type === "stat") return renderStatWidget(widget, mount);
        if (widget.type === "base" || widget.type === "list") return renderEntryWidget(widget, mount);
        return renderBuiltinWidget(widget, mount, shell);
      });
}

function applyHomeWidgetRenderResult(shell, result = {}) {
  const host = shell?.content?.parentElement || null;
  const state = homeActionText(result?.state || "ready") || "ready";
  host?.setAttr?.("data-noria-widget-state", state);
  host?.setAttribute?.("data-noria-widget-state", state);
  if (result?.hidden !== true || homeEditMode) return;
  host.hidden = true;
  host?.setAttr?.("aria-hidden", "true");
  host?.setAttribute?.("aria-hidden", "true");
  host?.remove?.();
}

async function renderConfiguredWidgets() {
  if (homeEditMode) renderHomeLayoutEditBar();
  else renderHomeLayoutRecoveryEntry();
  const widgets = normalizeWidgetList(homeBridge.homeSettings?.widgets, { includeDisabled: homeEditMode });
  const consumed = new Set();
  const identity = widgets.find((w) => w.id === "identity" && w.type === "builtin");
  const metrics = widgets.find((w) => w.id === "metrics" && w.type === "builtin");
  const identityIndex = widgets.indexOf(identity);
  const metricsIndex = widgets.indexOf(metrics);
  const heroStartIndex = shouldUseHomeHeroStrip(identity, metrics, { editMode: homeEditMode })
    && identityIndex >= 0
    && metricsIndex === identityIndex + 1
    ? identityIndex
    : -1;
  const widgetJobs = [];
  for (const [index, widget] of widgets.entries()) {
    if (index === heroStartIndex) {
      const heroStrip = root.createDiv();
      heroStrip.addClass("dashboard-hero-strip");
      heroStrip.setAttr("data-noria-widget-id", "identity+metrics");
      heroStrip.setAttr("data-noria-widget-size", "full");
      heroStrip.setAttr("data-noria-widget-order", String(identity.order));
      applyHomeWidgetLayout({ size: "full" }, heroStrip);
      const heroInner = heroStrip.createDiv();
      heroInner.addClass("dashboard-hero-strip__inner");
      const heroWelcome = heroInner.createDiv();
      heroWelcome.addClass("dashboard-hero-strip__welcome");
      const heroMetrics = heroInner.createDiv();
      heroMetrics.addClass("dashboard-hero-strip__metrics");
      consumed.add(identity.id);
      consumed.add(metrics.id);
      widgetJobs.push(Promise.all([
        renderWidget(identity, attachDomHelpers(heroWelcome)),
        renderWidget(metrics, attachDomHelpers(heroMetrics))
      ]));
      continue;
    }
    if (consumed.has(widget.id)) continue;
    const entry = HOME_WIDGET_REGISTRY[widget.id] || {};
    const title = homeEditMode ? resolveWidgetEditTitle(widget, entry) : resolveWidgetTitle(widget, entry);
    const shell = createWidgetShell(widget, title, { index, total: widgets.length }, entry);
    if (widget.enabled === false) continue;
    if (widget.collapsed === true) continue;
    widgetJobs.push((async () => {
      const result = await renderWidget(widget, attachDomHelpers(shell.content), shell);
      applyHomeWidgetRenderResult(shell, result || {});
    })());
  }
  await Promise.all(widgetJobs);
}

try {
  await renderConfiguredWidgets();
  homePerf.finish("ok");
} catch (e) {
  homePerf.finish("error");
  throw e;
}
