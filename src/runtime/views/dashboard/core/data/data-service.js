(() => {
  const root = globalThis.dashboardCore || (globalThis.dashboardCore = {});
  root.data = root.data || {};

  const DAY_MS = 86400000;
  const RANGE_STORAGE_KEY = "noria.home.trends.range.v2";
  const CACHE_KEY = "__noria_data_service_cache_v1";
  const REVIEW_CACHE_ROOT = ".obsidian/plugins/noria/cache/stats/review";
  const SNAPSHOT_CACHE_ROOT = ".obsidian/plugins/noria/cache/stats/snapshots";
  const TASK_CACHE_ROOT = ".obsidian/plugins/noria/cache/stats/tasks";
  const SCHEMA_VERSION = 1;
  const EXPORT_VERSION = 1;

  const DOMAIN_REGISTRY = {
    notes: true,
    tasks: true,
    dailyState: true,
    habits: true,
    workload: true,
    inbox: true,
    projects: true,
    vaultHealth: true,
    focus: true,
    pomodoro: true,
    git: true
  };

  const PRESETS = {
    home: {
      include: ["notes", "tasks", "dailyState", "habits", "workload"],
      views: ["home"],
      detail: "summary"
    },
    review: {
      include: ["notes", "tasks", "dailyState", "habits", "workload", "inbox", "projects", "vaultHealth", "focus", "pomodoro", "git"],
      views: ["review"],
      detail: "evidence"
    },
    board: {
      include: ["tasks"],
      views: ["board"],
      detail: "summary"
    },
    timeline: {
      include: ["tasks", "focus"],
      views: ["timeline"],
      detail: "summary"
    },
    periodic: {
      include: ["notes", "tasks", "dailyState", "habits", "workload"],
      views: ["periodic"],
      detail: "summary"
    },
    exportAll: {
      include: ["all"],
      views: ["home", "board", "timeline", "review"],
      detail: "evidence"
    }
  };

  function dataServicePerfNow() {
    try {
      if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now();
    } catch (_) {}
    return Date.now();
  }

  function roundPerfMs(value) {
    return Number(Math.max(0, Number(value || 0)).toFixed(2));
  }

  function readHomePerformanceRecorder() {
    try {
      const recorder = globalThis.__noriaHomePerformanceCurrent;
      return recorder && typeof recorder.markSnapshot === "function" ? recorder : null;
    } catch (_) {
      return null;
    }
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function toDate(value) {
    if (value && value._d instanceof Date) return new Date(value._d.getTime());
    if (value instanceof Date) return new Date(value.getTime());
    const raw = String(value || "").trim().slice(0, 10);
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    d.setHours(0, 0, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatDate(date) {
    const d = toDate(date);
    if (!d) return "";
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function addDays(date, days) {
    const d = toDate(date) || new Date();
    d.setDate(d.getDate() + Number(days || 0));
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function startOfWeek(date) {
    const d = toDate(date) || new Date();
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function startOfMonth(date) {
    const d = toDate(date) || new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  function endOfMonth(date) {
    const d = toDate(date) || new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 0);
  }

  function startOfYear(date) {
    const d = toDate(date) || new Date();
    return new Date(d.getFullYear(), 0, 1);
  }

  function endOfYear(date) {
    const d = toDate(date) || new Date();
    return new Date(d.getFullYear(), 11, 31);
  }

  function isoWeek(date) {
    const d = toDate(date);
    if (!d) return { year: 0, week: 0 };
    const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = utc.getUTCDay() || 7;
    utc.setUTCDate(utc.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((utc - yearStart) / DAY_MS) + 1) / 7);
    return { year: utc.getUTCFullYear(), week };
  }

  function weekStartFromIso(year, week) {
    const simple = new Date(Date.UTC(Number(year), 0, 1 + (Number(week) - 1) * 7));
    const day = simple.getUTCDay() || 7;
    if (day <= 4) simple.setUTCDate(simple.getUTCDate() - day + 1);
    else simple.setUTCDate(simple.getUTCDate() + 8 - day);
    return new Date(simple.getUTCFullYear(), simple.getUTCMonth(), simple.getUTCDate());
  }

  function enumerateDates(start, end) {
    const out = [];
    const s = toDate(start);
    const e = toDate(end);
    if (!s || !e || s.getTime() > e.getTime()) return out;
    for (let d = new Date(s.getTime()); d.getTime() <= e.getTime(); d = addDays(d, 1)) {
      out.push(formatDate(d));
    }
    return out;
  }

  function normalizePath(raw) {
    return String(raw || "").trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
  }

  function normalizeDiaryName(raw) {
    const text = String(raw || "").replace(/\.md$/i, "");
    if (/^\d{8}$/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
    return text;
  }

  function diaryDateFromPath(pathText) {
    const normalized = normalizePath(pathText);
    const name = normalized.split("/").pop() || "";
    const ds = normalizeDiaryName(name);
    return /^\d{4}-\d{2}-\d{2}$/.test(ds) ? ds : "";
  }

  function toPlainArray(value, bridge) {
    try {
      if (typeof bridge?.runtime?.toArray === "function") return bridge.runtime.toArray(value);
    } catch (_) {}
    if (!value) return [];
    if (Array.isArray(value)) return value;
    try {
      if (typeof value.array === "function") return value.array();
    } catch (_) {}
    try {
      return Array.from(value || []);
    } catch (_) {
      return [];
    }
  }

  function normalizeDateValue(value) {
    if (!value) return "";
    if (value instanceof Date) return formatDate(value);
    if (typeof value === "number" && Number.isFinite(value)) return formatDate(new Date(value));
    if (value._d instanceof Date) return formatDate(value._d);
    try {
      if (typeof value.toISODate === "function") return String(value.toISODate()).slice(0, 10);
      if (typeof value.toFormat === "function") return String(value.toFormat("yyyy-MM-dd")).slice(0, 10);
      if (typeof value.format === "function") return String(value.format("YYYY-MM-DD")).slice(0, 10);
    } catch (_) {}
    const raw = String(value || "").trim();
    if (/^\d{12,}$/.test(raw)) return formatDate(new Date(Number(raw)));
    const m = raw.match(/\d{4}-\d{2}-\d{2}/);
    return m ? m[0] : "";
  }

  function parseTaskCompletionDate(task) {
    const direct = normalizeDateValue(task?.completion)
      || normalizeDateValue(task?.done)
      || normalizeDateValue(task?.completedDate);
    if (direct) return direct;
    const text = taskText(task);
    const inline = text.match(/\[(?:completion|done)::\s*(\d{4}-\d{2}-\d{2})[^\]]*\]/i);
    if (inline) return inline[1];
    const tasksPlugin = text.match(/✅\s*(\d{4}-\d{2}-\d{2})/);
    if (tasksPlugin) return tasksPlugin[1];
    if (task?.completed) {
      const diaryDate = diaryDateFromPath(task?.path || task?.file?.path || task?.sourcePath || "");
      if (diaryDate) return diaryDate;
    }
    return "";
  }

  function parseTaskPlanDate(task) {
    for (const key of ["due", "scheduled", "start"]) {
      const direct = normalizeDateValue(task?.[key]);
      if (direct) return direct;
    }
    const text = taskText(task);
    const inline = text.match(/\[(?:due|scheduled|start)::\s*(\d{4}-\d{2}-\d{2})[^\]]*\]/i)
      || text.match(/📅\s*(\d{4}-\d{2}-\d{2})/);
    return inline ? inline[1] : "";
  }

  function parseTaskDateRoles(task) {
    return {
      completion: parseTaskCompletionDate(task),
      due: normalizeDateValue(task?.due) || inlineDate(task, "due") || emojiDate(task, "📅"),
      scheduled: normalizeDateValue(task?.scheduled) || inlineDate(task, "scheduled") || emojiDate(task, "⏳"),
      start: normalizeDateValue(task?.start) || inlineDate(task, "start") || emojiDate(task, "🛫"),
      created: normalizeDateValue(task?.created) || normalizeDateValue(task?.ctime),
      diaryFallback: diaryDateFromPath(task?.path || task?.file?.path || task?.sourcePath || "")
    };
  }

  function inlineDate(task, key) {
    const text = taskText(task);
    const match = text.match(new RegExp(`\\[${key}::\\s*(\\d{4}-\\d{2}-\\d{2})[^\\]]*\\]`, "i"));
    return match ? match[1] : "";
  }

  function emojiDate(task, emoji) {
    const text = String(task?.text || task?.line || "");
    const match = text.match(new RegExp(`${emoji}\\s*(\\d{4}-\\d{2}-\\d{2})`));
    return match ? match[1] : "";
  }

  function bucketForDate(dateText, granularity) {
    const d = toDate(dateText);
    if (!d) return "";
    if (granularity === "month") return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    if (granularity === "week") {
      const wk = isoWeek(d);
      return `${wk.year}-W${pad2(wk.week)}`;
    }
    return formatDate(d);
  }

  function labelForBucket(bucket, granularity) {
    if (granularity === "month") return String(bucket || "").slice(5) || bucket;
    if (granularity === "week") return `W${String(bucket || "").split("-W").pop() || ""}`;
    return String(bucket || "").slice(5) || bucket;
  }

  function buildEmptyBuckets(dates, granularity) {
    const map = new Map();
    dates.forEach((ds) => {
      const key = bucketForDate(ds, granularity);
      if (!key || map.has(key)) return;
      map.set(key, { key, label: labelForBucket(key, granularity), start: ds });
    });
    return map;
  }

  function inRange(dateText, start, end) {
    return !!dateText && dateText >= start && dateText <= end;
  }

  function getCacheStore() {
    const g = globalThis;
    if (!g[CACHE_KEY]) g[CACHE_KEY] = { token: 0, buildId: "", entries: new Map() };
    if (!(g[CACHE_KEY].entries instanceof Map)) g[CACHE_KEY].entries = new Map();
    if (!(g[CACHE_KEY].pending instanceof Map)) g[CACHE_KEY].pending = new Map();
    if (!(g[CACHE_KEY].taskFiles instanceof Map)) g[CACHE_KEY].taskFiles = new Map();
    if (!(g[CACHE_KEY].taskSources instanceof Map)) g[CACHE_KEY].taskSources = new Map();
    if (!(g[CACHE_KEY].taskSourcePending instanceof Map)) g[CACHE_KEY].taskSourcePending = new Map();
    if (!(g[CACHE_KEY].notesDaily instanceof Map)) g[CACHE_KEY].notesDaily = new Map();
    if (!(g[CACHE_KEY].notesDailyPending instanceof Map)) g[CACHE_KEY].notesDailyPending = new Map();
    if (!(g[CACHE_KEY].habitDomains instanceof Map)) g[CACHE_KEY].habitDomains = new Map();
    if (!(g[CACHE_KEY].habitDomainPending instanceof Map)) g[CACHE_KEY].habitDomainPending = new Map();
    return g[CACHE_KEY];
  }

  function clearCacheStore(cache, options = {}) {
    if (!cache) return;
    if (options.bumpToken) cache.token = Number(cache.token || 0) + 1;
    cache.entries?.clear?.();
    cache.pending?.clear?.();
    cache.taskFiles?.clear?.();
    cache.taskSources?.clear?.();
    cache.taskSourcePending?.clear?.();
    cache.notesDaily?.clear?.();
    cache.notesDailyPending?.clear?.();
    cache.habitDomains?.clear?.();
    cache.habitDomainPending?.clear?.();
  }

  function ensureCacheStoreBuild(buildId) {
    const cache = getCacheStore();
    const nextBuildId = String(buildId || "dev");
    if (cache.buildId && cache.buildId !== nextBuildId) {
      clearCacheStore(cache, { bumpToken: true });
    }
    cache.buildId = nextBuildId;
    return cache;
  }

  function cloneTaskSourceRows(rows) {
    const list = Array.isArray(rows) ? rows : Array.from(rows || []);
    return list.map((task) => ({
      ...task,
      checkbox: task?.checkbox && typeof task.checkbox === "object" ? { ...task.checkbox } : task?.checkbox
    }));
  }

  function clonePlainData(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return value;
    }
  }

  async function mapWithConcurrency(items, limit, mapper) {
    const list = Array.from(items || []);
    if (!list.length) return [];
    const results = new Array(list.length);
    let cursor = 0;
    const workerCount = Math.max(1, Math.min(list.length, Number(limit) || 1));
    const workers = Array.from({ length: workerCount }, async () => {
      while (cursor < list.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await mapper(list[index], index);
      }
    });
    await Promise.all(workers);
    return results;
  }

  function normalizeHomeRangeState(raw) {
    const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const mode = ["last30", "week", "month", "year", "custom"].includes(source.mode) ? source.mode : "last30";
    return { mode, start: source.start || "", end: source.end || "", yearGranularity: source.yearGranularity === "month" ? "month" : "week" };
  }

  function readHomeRangeState(bridge) {
    const settingsRange = bridge?.homeSettings?.trendsRange;
    if (settingsRange && typeof settingsRange === "object" && !Array.isArray(settingsRange)) {
      return normalizeHomeRangeState(settingsRange);
    }
    try {
      const bridgeRange = typeof bridge?.getHomeTrendsRange === "function" ? bridge.getHomeTrendsRange() : null;
      if (bridgeRange && typeof bridgeRange === "object" && !Array.isArray(bridgeRange)) {
        return normalizeHomeRangeState(bridgeRange);
      }
    } catch (_) {}
    try {
      const raw = JSON.parse(globalThis.localStorage?.getItem?.(RANGE_STORAGE_KEY) || "{}");
      return normalizeHomeRangeState(raw);
    } catch (_) {
      return { mode: "last30", start: "", end: "", yearGranularity: "week" };
    }
  }

  function resolveRange(input = {}, options = {}) {
    const request = input.range || input || {};
    const bridge = options.bridge || globalThis.__noriaRuntimeBridge || {};
    let mode = String(request.mode || input.mode || "last30").trim() || "last30";
    if (mode === "homeCurrent") {
      const home = readHomeRangeState(bridge);
      mode = home.mode || "last30";
      if (home.start && home.end) {
        request.start = home.start;
        request.end = home.end;
      }
      if (!input.granularity && home.yearGranularity && mode === "year") {
        input.granularity = home.yearGranularity;
      }
    }
    const lowerMode = mode.toLowerCase();
    const today = toDate(request.today || input.today || options.now) || new Date();
    today.setHours(0, 0, 0, 0);
    let start = toDate(request.start);
    let end = toDate(request.end);
    let resolvedMode = ["last30", "week", "month", "year", "custom"].includes(lowerMode) ? lowerMode : "last30";
    const anchor = toDate(request.anchor || input.anchor) || today;
    if (!start || !end) {
      if (resolvedMode === "last30") {
        end = anchor;
        start = addDays(end, -29);
      } else if (resolvedMode === "week") {
        start = startOfWeek(anchor);
        end = addDays(start, 6);
      } else if (resolvedMode === "month") {
        start = startOfMonth(anchor);
        end = endOfMonth(anchor);
      } else if (resolvedMode === "year") {
        start = startOfYear(anchor);
        end = endOfYear(anchor);
      } else {
        start = startOfMonth(anchor);
        end = endOfMonth(anchor);
      }
    }
    if (start.getTime() > end.getTime()) {
      const tmp = start;
      start = end;
      end = tmp;
    }
    const requestedGranularity = String(input.granularity || request.granularity || "").toLowerCase();
    const granularity = ["day", "week", "month"].includes(requestedGranularity)
      ? requestedGranularity
      : (resolvedMode === "year" ? "week" : "day");
    return {
      mode: resolvedMode,
      sourceMode: mode === "homeCurrent" ? "homeCurrent" : resolvedMode,
      start: formatDate(start),
      end: formatDate(end),
      granularity,
      dates: enumerateDates(start, end)
    };
  }

  function normalizeInclude(include) {
    const raw = Array.isArray(include) && include.length ? include.map(String) : ["notes", "tasks", "dailyState"];
    const expanded = raw.includes("all") ? Object.keys(DOMAIN_REGISTRY) : raw;
    return expanded.filter((name, index, arr) => DOMAIN_REGISTRY[name] && arr.indexOf(name) === index);
  }

  function applyPreset(request = {}) {
    const presetName = String(request.preset || "").trim();
    const preset = PRESETS[presetName] || {};
    return {
      preset: presetName || "",
      include: normalizeInclude(request.include || preset.include),
      views: Array.isArray(request.views) ? request.views.map(String) : (preset.views || []),
      detail: String(request.detail || preset.detail || "summary"),
      limits: { evidenceItems: 20, excerpts: 8, series: 400, ...(request.limits || {}) }
    };
  }

  function hashString(value) {
    const s = String(value || "");
    let h = 2166136261;
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  function cleanTaskText(text) {
    return String(text || "")
      .replace(/^\s*[-*]\s*\[[^\]]\]\s*/, "")
      .replace(/\s*\[[A-Za-z0-9_-]+::\s*[^\]]+\]/g, "")
      .replace(/\s*[📅🛫⏳✅➕❌]\s*\d{4}-\d{2}-\d{2}(?:[ T]\d{1,2}:\d{2})?/g, "")
      .replace(/\s*#[^\s#]+/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function sourceInfo(pathText) {
    const p = normalizePath(pathText);
    const base = p.split("/").pop() || p;
    const basename = base.replace(/\.md$/i, "");
    return { path: p, basename, displayName: basename };
  }

  function isReviewNotePath(pathText) {
    const p = normalizePath(pathText).replace(/^\/+/, "");
    return /(?:^|\/)\d{4}-\d{2}-\d{2}-review\.md$/i.test(p);
  }

  function taskText(task) {
    for (const value of [task?.text, task?.task, task?.visual, task?.rawLine]) {
      const text = String(value == null ? "" : value).trim();
      if (text) return text;
    }
    return typeof task?.line === "string" ? String(task.line).trim() : "";
  }

  function checkboxStateFromMark(mark) {
    const m = String(mark == null ? " " : mark).trim().toLowerCase();
    if (m === "x" || m === "done" || m === "completed" || m === "true") return "done";
    if (m === "/" || m === "in_progress" || m === "doing") return "in_progress";
    if (m === "-" || m === "cancelled" || m === "canceled") return "cancelled";
    return "todo";
  }

  function normalizeTaskCheckbox(task) {
    const explicit = task?.checkbox && typeof task.checkbox === "object" ? task.checkbox : null;
    let mark = explicit?.mark;
    let state = explicit?.state;
    const rawLine = String(task?.rawLine || task?.line || "");
    const lineMatch = rawLine.match(/^\s*[-*]\s*\[([^\]])\]/);
    if (mark == null && lineMatch) mark = lineMatch[1];
    if (mark == null && task?.status != null) mark = task.status;
    if (state == null && mark != null) state = checkboxStateFromMark(mark);
    if (task?.completed === true) state = "done";
    if (!state && task?.checked === true) state = "done";
    state = checkboxStateFromMark(state || " ");
    const normalizedMark = state === "done" ? "x" : (state === "in_progress" ? "/" : (state === "cancelled" ? "-" : " "));
    return { mark: String(mark == null ? normalizedMark : mark), state };
  }

  function normalizeTagToken(raw) {
    let tag = String(raw || "").trim().toLowerCase();
    if (!tag) return "";
    if (!tag.startsWith("#")) tag = `#${tag.replace(/^#+/, "")}`;
    return tag;
  }

  function taskPassesTagPolicy(text, bridge) {
    const policy = bridge?.taskQueryContext?.taskTagFilter || bridge?.taskTagFilter || {};
    const includeTags = (Array.isArray(policy.includeTags) ? policy.includeTags : []).map(normalizeTagToken).filter(Boolean);
    const excludeTags = (Array.isArray(policy.excludeTags) ? policy.excludeTags : []).map(normalizeTagToken).filter(Boolean);
    const body = String(text || "").toLowerCase();
    const hasTag = (tag) => tag.endsWith("/")
      ? body.includes(tag)
      : new RegExp(`(^|\\s)${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`, "i").test(body);
    if (excludeTags.some(hasTag)) return false;
    if (includeTags.length && !includeTags.some(hasTag)) return false;
    return true;
  }

  function createDataService({ bridge, ctx, app, now } = {}) {
    const runtimeBridge = bridge || globalThis.__noriaRuntimeBridge || {};
    ensureCacheStoreBuild(runtimeBridge.runtimeBuildId || "dev");
    const storagePaths = runtimeBridge.storagePaths && typeof runtimeBridge.storagePaths === "object"
      ? runtimeBridge.storagePaths
      : {};
    const reviewCacheRoot = normalizePath(storagePaths.reviewEvidenceRoot || REVIEW_CACHE_ROOT).replace(/\/+$/, "") || REVIEW_CACHE_ROOT;
    const snapshotCacheRoot = normalizePath(storagePaths.snapshotRoot || SNAPSHOT_CACHE_ROOT).replace(/\/+$/, "") || SNAPSHOT_CACHE_ROOT;
    const toArray = (value) => toPlainArray(value, runtimeBridge);
    const readText = async (pathText, file) => {
      try {
        if (ctx?.readText) return String(await ctx.readText(pathText) || "");
      } catch (_) {}
      try {
        if (file && typeof app?.vault?.cachedRead === "function") return String(await app.vault.cachedRead(file) || "");
      } catch (_) {}
      try {
        const normalized = normalizePath(pathText);
        return String(await app?.vault?.adapter?.read?.(normalized) || "");
      } catch (_) {
        return "";
      }
    };
    const writeText = async (pathText, text) => {
      const normalized = normalizePath(pathText);
      if (typeof app?.vault?.adapter?.write === "function") {
        await app.vault.adapter.write(normalized, String(text || ""));
        return { path: normalized };
      }
      throw new Error("Noria data export requires vault adapter write support");
    };
    const fileName = (pathText) => normalizePath(pathText).split("/").pop() || "";
    const isUnderRoot = (pathText, root) => {
      const p = normalizePath(pathText).replace(/^\/+/, "");
      const r = normalizePath(root).replace(/^\/+/, "").replace(/\/+$/, "");
      return !!p && !!r && (p === r || p.startsWith(`${r}/`));
    };
    const fileFrontmatter = (file) => {
      try {
        const cache = app?.metadataCache?.getFileCache?.(file);
        return cache?.frontmatter && typeof cache.frontmatter === "object" ? cache.frontmatter : {};
      } catch (_) {
        return {};
      }
    };
    const pageFromFile = (file) => {
      const pathText = normalizePath(file?.path || "");
      const fm = fileFrontmatter(file);
      return {
        ...fm,
        path: pathText,
        file: {
          path: pathText,
          name: fileName(pathText),
          ctime: file?.stat?.ctime ? new Date(Number(file.stat.ctime)) : undefined,
          mtime: file?.stat?.mtime ? new Date(Number(file.stat.mtime)) : undefined,
          tasks: []
        },
        __noriaSource: "vault"
      };
    };
    const allMarkdownFiles = () => {
      try {
        const files = typeof app?.vault?.getMarkdownFiles === "function" ? app.vault.getMarkdownFiles() : [];
        return toArray(files).filter((file) => normalizePath(file?.path || "").toLowerCase().endsWith(".md"));
      } catch (_) {
        return [];
      }
    };
    const scopeSpec = (scopeId) => {
      try {
        if (runtimeBridge.runtime?.scopeFor) return runtimeBridge.runtime.scopeFor(scopeId);
      } catch (_) {}
      const scopes = runtimeBridge.queryScopes || {};
      const cfg = scopes?.[scopeId] || {};
      const mode = String(cfg.mode || (scopeId === "notes" ? "all" : "managed"));
      const paths = runtimeBridge.paths || {};
      const roots = mode === "custom" && Array.isArray(cfg.customRoots)
        ? cfg.customRoots
        : [paths.diaryRoot, paths.projectsRoot, paths.inboxRoot].filter(Boolean);
      return { scopeId, mode, roots: roots.map(normalizePath).filter(Boolean), isAllVault: mode === "all", isEmpty: mode !== "all" && !roots.length };
    };
    const filesForScope = (scopeId) => {
      try {
        const native = runtimeBridge.runtime?.filesForScope?.(scopeId);
        if (native && toArray(native).length) return toArray(native);
      } catch (_) {}
      const spec = scopeSpec(scopeId);
      if (spec.isEmpty) return [];
      const files = allMarkdownFiles().filter((file) => !isReviewNotePath(file?.path || ""));
      if (spec.isAllVault) return files;
      const roots = Array.isArray(spec.roots) ? spec.roots : [];
      return files.filter((file) => roots.some((root) => isUnderRoot(file?.path || "", root)));
    };
    const filesForManagedPath = (pathKey) => {
      try {
        const native = runtimeBridge.runtime?.filesForManagedPath?.(pathKey);
        if (native && toArray(native).length) return toArray(native);
      } catch (_) {}
      const rootPath = normalizePath(runtimeBridge.paths?.[pathKey] || "");
      if (!rootPath) return [];
      return allMarkdownFiles().filter((file) => !isReviewNotePath(file?.path || "") && isUnderRoot(file?.path || "", rootPath));
    };
    const getPagesForScope = (scopeId) => {
      const files = filesForScope(scopeId);
      if (files.length) return files.map(pageFromFile);
      try {
        return toArray(runtimeBridge.runtime?.pagesForScope?.(scopeId));
      } catch (_) {
        return [];
      }
    };
    const getDiaryPages = () => {
      const files = filesForManagedPath("diaryRoot");
      if (files.length) return files.map(pageFromFile);
      try {
        return toArray(runtimeBridge.runtime?.pagesForManagedPath?.("diaryRoot"));
      } catch (_) {
        return [];
      }
    };
    const taskScopeRoots = () => {
      try {
        const spec = scopeSpec("tasks");
        if (spec?.isAllVault) return [];
        if (Array.isArray(spec?.roots) && spec.roots.length) return spec.roots.map(normalizePath).filter(Boolean);
      } catch (_) {}
      const paths = runtimeBridge.paths || {};
      return [paths.diaryRoot, paths.projectsRoot, paths.inboxRoot].map(normalizePath).filter(Boolean);
    };
    const isUnderTaskRoot = (pathText, roots) => {
      const p = normalizePath(pathText).replace(/^\/+/, "");
      if (!p || isReviewNotePath(p)) return false;
      if (!Array.isArray(roots) || roots.length === 0) return true;
      return roots.some((root) => {
        const r = normalizePath(root).replace(/^\/+/, "").replace(/\/+$/, "");
        return !!r && (p === r || p.startsWith(`${r}/`));
      });
    };
    const markdownFilesForTaskScope = () => {
      try {
        const files = typeof app?.vault?.getMarkdownFiles === "function" ? app.vault.getMarkdownFiles() : [];
        const roots = taskScopeRoots();
        return toArray(files).filter((file) => isUnderTaskRoot(file?.path || "", roots));
      } catch (_) {
        return [];
      }
    };
    const indexedTaskFilesForScope = (scopeFiles) => {
      const files = Array.from(scopeFiles || []);
      const metadataCache = app?.metadataCache;
      if (!metadataCache || metadataCache.initialized !== true || typeof metadataCache.getFileCache !== "function") {
        return { files, indexState: "fallback" };
      }
      const cached = files.map((file) => ({ file, cache: metadataCache.getFileCache(file) }));
      if (cached.some((entry) => !entry.cache || typeof entry.cache !== "object")) {
        return { files, indexState: "fallback" };
      }
      return {
        files: cached
          .filter((entry) => Array.isArray(entry.cache.listItems) && entry.cache.listItems.some((item) => item && item.task != null))
          .map((entry) => entry.file),
        indexState: "metadata-cache"
      };
    };
    const taskQueryContextHash = () => {
      try {
        return hashString(JSON.stringify(runtimeBridge.taskQueryContext || runtimeBridge.taskTagFilter || {}));
      } catch (_) {
        return "default";
      }
    };
    const parseRawMarkdownTasks = (pathText, markdown) => {
      const out = [];
      let inFence = false;
      String(markdown || "").split(/\r?\n/).forEach((lineText, index) => {
        if (/^\s*(```|~~~)/.test(lineText)) {
          inFence = !inFence;
          return;
        }
        if (inFence) return;
        const match = String(lineText || "").match(/^\s*[-*]\s*\[([ xX\/-])\]\s+(.+)$/);
        if (!match) return;
        const text = String(match[2] || "").trim();
        if (!text || !taskPassesTagPolicy(text, runtimeBridge)) return;
        const checkbox = { mark: match[1], state: checkboxStateFromMark(match[1]) };
        const completed = checkbox.state === "done";
        out.push({
          text,
          task: text,
          rawLine: String(lineText || ""),
          completed,
          checked: checkbox.state === "done" || checkbox.state === "cancelled",
          status: checkbox.state,
          checkbox,
          path: normalizePath(pathText),
          sourcePath: normalizePath(pathText),
          line: index,
          __noriaSource: "vault"
        });
      });
      return out;
    };
    const collectRawMarkdownTasksFromFile = async (file) => {
      const pathText = normalizePath(file?.path || "");
      if (!pathText) return [];
      const stat = file?.stat || {};
      const token = stat.mtime ?? stat.mtimeMs ?? file?.mtime ?? getCacheStore().token ?? 0;
      const key = `${runtimeBridge.runtimeBuildId || "dev"}|${pathText}|${String(token)}|${taskQueryContextHash()}`;
      const cache = getCacheStore().taskFiles;
      if (cache.has(key)) return cache.get(key).map((task) => ({ ...task, checkbox: { ...(task.checkbox || {}) } }));
      const text = await readText(pathText, file);
      const parsed = parseRawMarkdownTasks(pathText, text);
      cache.set(key, parsed.map((task) => ({ ...task, checkbox: { ...(task.checkbox || {}) } })));
      if (cache.size > 240) cache.delete(cache.keys().next().value);
      return parsed;
    };
    const collectRawMarkdownTasksForScope = async () => {
      const startedAt = dataServicePerfNow();
      const enumerateStartedAt = dataServicePerfNow();
      const scopeFiles = markdownFilesForTaskScope();
      const indexed = indexedTaskFilesForScope(scopeFiles);
      const files = indexed.files;
      const enumerateMs = roundPerfMs(dataServicePerfNow() - enumerateStartedAt);
      if (!files.length) {
        return {
          rows: [],
          performance: {
            indexState: indexed.indexState,
            scopeFileCount: scopeFiles.length,
            fileCount: 0,
            enumerateMs,
            readMs: 0,
            totalMs: roundPerfMs(dataServicePerfNow() - startedAt)
          }
        };
      }
      const readStartedAt = dataServicePerfNow();
      const results = await mapWithConcurrency(files, 8, (file) => collectRawMarkdownTasksFromFile(file));
      return {
        rows: results.flat(),
        performance: {
          indexState: indexed.indexState,
          scopeFileCount: scopeFiles.length,
          fileCount: files.length,
          enumerateMs,
          readMs: roundPerfMs(dataServicePerfNow() - readStartedAt),
          totalMs: roundPerfMs(dataServicePerfNow() - startedAt)
        }
      };
    };
    const taskSourceCacheKey = () => JSON.stringify({
      build: runtimeBridge.runtimeBuildId || "dev",
      token: getCacheStore().token || 0,
      roots: taskScopeRoots(),
      policy: taskQueryContextHash()
    });
    const collectTaskSources = async () => {
      const startedAt = dataServicePerfNow();
      const cache = getCacheStore();
      const key = taskSourceCacheKey();
      const cloneResult = (result, sourceState) => {
        const source = result && typeof result === "object" && !Array.isArray(result)
          ? result
          : { rows: result, performance: {} };
        return {
          rows: cloneTaskSourceRows(source.rows),
          performance: {
            ...(source.performance || {}),
            sourceState,
            sourceMs: roundPerfMs(dataServicePerfNow() - startedAt)
          }
        };
      };
      if (cache.taskSources.has(key)) return cloneResult(cache.taskSources.get(key), "hit");
      if (cache.taskSourcePending.has(key)) return cloneResult(await cache.taskSourcePending.get(key), "pending");
      const pending = (async () => {
        const rawResult = await collectRawMarkdownTasksForScope();
        const raw = rawResult.rows;
        const rows = raw.length
          ? raw
          : (() => {
              try {
                return toArray(runtimeBridge.runtime?.tasksForScope?.("tasks"))
                  .filter((task) => taskPassesTagPolicy(taskText(task), runtimeBridge));
              } catch (_) {
                return [];
              }
            })();
        const cached = cloneTaskSourceRows(rows);
        const result = {
          rows: cached,
          performance: {
            ...(rawResult.performance || {}),
            sourceState: "cold"
          }
        };
        cache.taskSources.set(key, result);
        if (cache.taskSources.size > 24) cache.taskSources.delete(cache.taskSources.keys().next().value);
        return result;
      })();
      cache.taskSourcePending.set(key, pending);
      try {
        return cloneResult(await pending, "cold");
      } finally {
        if (cache.taskSourcePending.get(key) === pending) cache.taskSourcePending.delete(key);
      }
    };

    function notesDailyCacheKey(resolved) {
      return JSON.stringify({
        build: runtimeBridge.runtimeBuildId || "dev",
        token: getCacheStore().token || 0,
        range: {
          start: resolved?.start || "",
          end: resolved?.end || "",
          mode: resolved?.mode || "",
          granularity: resolved?.granularity || "day"
        },
        paths: {
          diaryRoot: normalizePath(runtimeBridge.paths?.diaryRoot || ""),
          projectsRoot: normalizePath(runtimeBridge.paths?.projectsRoot || ""),
          inboxRoot: normalizePath(runtimeBridge.paths?.inboxRoot || "")
        }
      });
    }

    async function buildNotesAndDailyState(resolved) {
      const buckets = buildEmptyBuckets(resolved.dates, resolved.granularity);
      const daySet = new Set(resolved.dates);
      const trend = {
        totalCreated: 0,
        totalDiaryWords: 0,
        series: Array.from(buckets.values()).map((b) => ({ ...b, notes: 0, words: 0 }))
      };
      const distribution = { total: 0, items: [] };
      const byFolder = new Map();
      const dailyState = {
        summary: { validDays: 0, averageEnergy: 0, averageFocus: 0 },
        distribution: { weather: {}, mood: {} },
        series: Array.from(buckets.values()).map((b) => ({ ...b, energy: 0, focus: 0, weather: "", mood: "", validDays: 0 }))
      };
      const noteByBucket = new Map(trend.series.map((row) => [row.key, row]));
      const stateByBucket = new Map(dailyState.series.map((row) => [row.key, row]));
      getPagesForScope("notes").forEach((p) => {
        const ds = normalizeDateValue(p?.file?.ctime);
        if (!inRange(ds, resolved.start, resolved.end)) return;
        const bucket = bucketForDate(ds, resolved.granularity);
        const row = noteByBucket.get(bucket);
        if (row) {
          row.notes += 1;
          trend.totalCreated += 1;
        }
        const pathText = normalizePath(p?.file?.path || "");
        const folder = pathText.split("/")[0] || "root";
        byFolder.set(folder, (byFolder.get(folder) || 0) + 1);
      });
      let energyTotal = 0;
      let focusTotal = 0;
      const focusScore = { "很专注": 4, "基本专注": 3, "易分心": 2, "难进入状态": 1 };
      const diaryEntries = await mapWithConcurrency(
        getDiaryPages().filter((page) => daySet.has(normalizeDiaryName(page?.file?.name || ""))),
        8,
        async (page) => ({
          page,
          content: await readText(page?.file?.path || "")
        })
      );
      for (const entry of diaryEntries) {
        const p = entry.page;
        const ds = normalizeDiaryName(p?.file?.name || "");
        const bucket = bucketForDate(ds, resolved.granularity);
        const noteRow = noteByBucket.get(bucket);
        const stateRow = stateByBucket.get(bucket);
        const content = entry.content;
        const words = String(content || "").replace(/\s+/g, "").length;
        if (noteRow) {
          noteRow.words += words;
          trend.totalDiaryWords += words;
        }
        const weather = String(p?.weather || "").trim();
        const mood = String(p?.mood || "").trim();
        const energy = Math.max(0, Math.min(5, Number(p?.energy) || 0));
        const focusRaw = String(p?.focus || "").trim();
        const focus = Number(focusScore[focusRaw] || 0);
        if (!(weather || mood || energy || focus)) continue;
        dailyState.summary.validDays += 1;
        if (weather) {
          dailyState.distribution.weather[weather] = dailyState.distribution.weather[weather] || { count: 0, pct: 0 };
          dailyState.distribution.weather[weather].count += 1;
        }
        if (mood) {
          dailyState.distribution.mood[mood] = dailyState.distribution.mood[mood] || { count: 0, pct: 0 };
          dailyState.distribution.mood[mood].count += 1;
        }
        if (energy) energyTotal += energy;
        if (focus) focusTotal += focus;
        if (stateRow) {
          stateRow.energy += energy;
          stateRow.focus += focus;
          if (weather && !stateRow.weather) stateRow.weather = weather;
          if (mood && !stateRow.mood) stateRow.mood = mood;
          stateRow.validDays += 1;
        }
      }
      const valid = dailyState.summary.validDays;
      if (valid) {
        dailyState.summary.averageEnergy = Number((energyTotal / valid).toFixed(2));
        dailyState.summary.averageFocus = Number((focusTotal / valid).toFixed(2));
      }
      for (const map of [dailyState.distribution.weather, dailyState.distribution.mood]) {
        Object.keys(map).forEach((key) => {
          map[key].pct = valid ? Number(((map[key].count / valid) * 100).toFixed(1)) : 0;
        });
      }
      dailyState.series.forEach((row) => {
        if (row.validDays) {
          row.energy = Number((row.energy / row.validDays).toFixed(2));
          row.focus = Number((row.focus / row.validDays).toFixed(2));
        }
      });
      distribution.total = trend.totalCreated;
      distribution.items = Array.from(byFolder.entries()).map(([key, count]) => ({
        key,
        count,
        pct: trend.totalCreated ? Number(((count / trend.totalCreated) * 100).toFixed(1)) : 0
      })).sort((a, b) => b.count - a.count);
      return {
        notes: {
          trend,
          distribution,
          diaryWords: { total: trend.totalDiaryWords }
        },
        dailyState
      };
    }

    async function collectNotesAndDailyState(resolved) {
      const cache = getCacheStore();
      const key = notesDailyCacheKey(resolved);
      if (cache.notesDaily.has(key)) return clonePlainData(cache.notesDaily.get(key));
      if (cache.notesDailyPending.has(key)) return clonePlainData(await cache.notesDailyPending.get(key));
      const pending = (async () => {
        const result = await buildNotesAndDailyState(resolved);
        const cached = clonePlainData(result);
        cache.notesDaily.set(key, cached);
        if (cache.notesDaily.size > 24) cache.notesDaily.delete(cache.notesDaily.keys().next().value);
        return cached;
      })();
      cache.notesDailyPending.set(key, pending);
      try {
        return clonePlainData(await pending);
      } finally {
        if (cache.notesDailyPending.get(key) === pending) cache.notesDailyPending.delete(key);
      }
    }

    function normalizeTask(task) {
      const pathText = normalizePath(task?.path || task?.file?.path || task?.sourcePath || task?._page?.file?.path || task?.link?.path || "");
      const line = Number(task?.line ?? task?.lineNumber ?? task?.position?.start?.line ?? task?.position?.start?.lineNumber ?? 0) || 0;
      const rawText = taskText(task);
      const clean = cleanTaskText(rawText);
      const fingerprint = hashString(`${pathText}|${line}|${clean}`);
      const dates = parseTaskDateRoles(task);
      const checkbox = normalizeTaskCheckbox(task);
      const completed = checkbox.state === "done";
      const status = checkbox.state === "done" ? "done" : (checkbox.state === "cancelled" ? "cancelled" : "open");
      return {
        id: `${pathText}|${line}|${fingerprint}`,
        identity: { sourcePath: pathText, line, blockId: String(task?.blockId || ""), fingerprint, identityKind: "source-location", stability: "contextual" },
        title: clean,
        status,
        completed,
        checked: checkbox.state === "done" || checkbox.state === "cancelled",
        checkbox,
        source: { ...sourceInfo(pathText), line, rawLine: String(task?.rawLine || "") },
        dates,
        time: {
          start: String(task?.startTime || ""),
          end: String(task?.endTime || ""),
          durationMinutes: Number(task?.durationMinutes || 0) || 0,
          isComplete: !!(task?.startTime && task?.endTime)
        },
        classification: {
          isHabit: /(^|\s)#habit(\s|$)/i.test(rawText),
          isTimeline: /(^|\s)#(?:tl|timeline)\//i.test(rawText),
          isRecurring: /🔁/.test(rawText),
          priority: String(task?.priority || "normal"),
          projectPath: pathText.startsWith("01_Projects/") ? pathText.split("/").slice(0, 2).join("/") : ""
        },
        text: { clean, raw: rawText }
      };
    }

    function bucketDateForTask(item, bucketBy) {
      const b = String(bucketBy || "active");
      if (b === "completion") return item.dates.completion;
      if (b === "due") return item.dates.due;
      if (b === "scheduled") return item.dates.scheduled;
      if (b === "start") return item.dates.start;
      if (b === "timeline") return item.dates.start || item.dates.scheduled || item.dates.due || item.dates.completion;
      if (b === "board") return item.completed ? item.dates.completion : (item.dates.due || item.dates.scheduled || item.dates.start || item.dates.diaryFallback);
      return item.completed ? item.dates.completion : (item.dates.due || item.dates.scheduled || item.dates.start || item.dates.diaryFallback);
    }

    async function getTasks(request = {}) {
      const startedAt = dataServicePerfNow();
      const resolved = resolveRange(request, { now, bridge: runtimeBridge });
      const bucketBy = String(request.bucketBy || "active");
      const status = String(request.status || "all");
      const includeAllFacts = String(request.rangePolicy || "").trim() === "allFacts";
      const sourceResult = await collectTaskSources();
      const normalizeStartedAt = dataServicePerfNow();
      const source = sourceResult.rows.map(normalizeTask);
      const normalizeMs = roundPerfMs(dataServicePerfNow() - normalizeStartedAt);
      const filterStartedAt = dataServicePerfNow();
      const seen = new Set();
      const items = [];
      const undated = { completed: [], open: [] };
      for (const item of source) {
        const key = `${item.identity.sourcePath}|${item.identity.line}|${item.identity.fingerprint}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (status === "done" && !item.completed) continue;
        if (status === "open" && item.status !== "open") continue;
        if (status === "cancelled" && item.status !== "cancelled") continue;
        const ds = bucketDateForTask(item, bucketBy);
        if (ds && inRange(ds, resolved.start, resolved.end)) {
          item.bucketDate = ds;
          items.push(item);
        } else if (ds && includeAllFacts) {
          item.bucketDate = ds;
          items.push(item);
        } else if (!ds) {
          if (item.completed) undated.completed.push(item);
          else undated.open.push(item);
          if (includeAllFacts) items.push(item);
        }
      }
      const bucketMap = new Map(resolved.dates.map((ds) => [ds, { key: ds, items: [] }]));
      items.forEach((item) => {
        if (!item.bucketDate || !inRange(item.bucketDate, resolved.start, resolved.end)) return;
        const key = bucketForDate(item.bucketDate, "day");
        if (!bucketMap.has(key)) bucketMap.set(key, { key, items: [] });
        bucketMap.get(key).items.push(item);
      });
      const done = items.filter((x) => x.completed).length;
      const cancelled = items.filter((x) => x.status === "cancelled").length;
      const open = items.filter((x) => x.status === "open").length;
      return {
        meta: {
          schemaVersion: SCHEMA_VERSION,
          performance: {
            sourceState: String(sourceResult.performance?.sourceState || "unknown"),
            indexState: String(sourceResult.performance?.indexState || "fallback"),
            scopeFileCount: Number(sourceResult.performance?.scopeFileCount || 0),
            fileCount: Number(sourceResult.performance?.fileCount || 0),
            enumerateMs: roundPerfMs(sourceResult.performance?.enumerateMs),
            readMs: roundPerfMs(sourceResult.performance?.readMs),
            sourceMs: roundPerfMs(sourceResult.performance?.sourceMs),
            normalizeMs,
            filterMs: roundPerfMs(dataServicePerfNow() - filterStartedAt),
            totalMs: roundPerfMs(dataServicePerfNow() - startedAt)
          }
        },
        range: { start: resolved.start, end: resolved.end, mode: resolved.mode },
        bucketBy,
        rangePolicy: includeAllFacts ? "allFacts" : "range",
        items,
        buckets: Array.from(bucketMap.values()),
        undated,
        summary: {
          total: items.length,
          done,
          open,
          cancelled,
          undatedCompleted: undated.completed.length
        }
      };
    }

    async function collectTaskCompletionDomain(resolved) {
      const buckets = buildEmptyBuckets(resolved.dates, resolved.granularity);
      const rows = Array.from(buckets.values()).map((b) => ({ ...b, done: 0, planned: 0, open: 0, rate: 0 }));
      const byBucket = new Map(rows.map((row) => [row.key, row]));
      const tasks = await getTasks({ range: resolved, bucketBy: "active", status: "all" });
      const completedItems = [];
      const openItems = [];
      for (const item of tasks.items) {
        if (item.completed) {
          const ds = item.dates.completion;
          const row = byBucket.get(bucketForDate(ds, resolved.granularity));
          if (row) {
            row.done += 1;
            row.planned += 1;
          }
          completedItems.push(item);
        } else if (item.status !== "cancelled") {
          const ds = bucketDateForTask(item, "active");
          const row = byBucket.get(bucketForDate(ds, resolved.granularity));
          if (row) {
            row.open += 1;
            row.planned += 1;
          }
          openItems.push(item);
        }
      }
      rows.forEach((row) => {
        row.rate = row.planned ? Math.min(100, Number(((row.done / row.planned) * 100).toFixed(1))) : 0;
      });
      const activityTotal = completedItems.length + openItems.length;
      return {
        completion: {
          completed: completedItems.length,
          open: openItems.length,
          planned: activityTotal,
          activityTotal,
          completionRate: activityTotal ? Math.min(100, Number(((completedItems.length / activityTotal) * 100).toFixed(1))) : 0,
          undatedCompleted: tasks.undated.completed.length,
          series: rows,
          completedItems: completedItems.slice(0, 80),
          openItems: openItems.slice(0, 80)
        },
        board: { summary: tasks.summary, series: rows },
        timeline: { summary: tasks.summary, series: rows }
      };
    }

    function inboxPages() {
      const files = filesForManagedPath("inboxRoot");
      if (files.length) return files.map(pageFromFile);
      try {
        return toArray(runtimeBridge.runtime?.pagesForManagedPath?.("inboxRoot"));
      } catch (_) {
        return [];
      }
    }

    function inboxField(page, key) {
      for (const source of [page, page?.frontmatter, page?.file?.frontmatter]) {
        if (!source || typeof source !== "object") continue;
        if (Object.prototype.hasOwnProperty.call(source, key)) return source[key];
      }
      return "";
    }

    function normalizeInboxWorkflowId(value, fallback = "") {
      const raw = String(value || "").trim().toLowerCase();
      const id = raw.replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
      return id || String(fallback || "").trim();
    }

    function inboxWorkflowConfig() {
      const raw = runtimeBridge.inboxWorkflow && typeof runtimeBridge.inboxWorkflow === "object" ? runtimeBridge.inboxWorkflow : {};
      const statuses = Array.isArray(raw.statuses) ? raw.statuses : [];
      const normalized = statuses
        .map((status) => {
          const id = normalizeInboxWorkflowId(status?.id || status?.label);
          if (!id) return null;
          return {
            id,
            aliases: Array.isArray(status?.aliases) ? status.aliases.map((alias) => String(alias || "").trim()).filter(Boolean) : [],
            terminal: status?.terminal === true
          };
        })
        .filter(Boolean);
      const statusIds = new Set(normalized.map((status) => status.id));
      const defaultStatusId = statusIds.has(normalizeInboxWorkflowId(raw.defaultStatusId))
        ? normalizeInboxWorkflowId(raw.defaultStatusId)
        : (normalized[0]?.id || "triage");
      return { statuses: normalized, defaultStatusId };
    }

    function resolveInboxStatusId(value, workflow) {
      const raw = String(value || "").trim();
      const normalized = normalizeInboxWorkflowId(raw);
      for (const status of workflow.statuses || []) {
        if (status.id === normalized) return status.id;
        if ((status.aliases || []).some((alias) => {
          const aliasNorm = normalizeInboxWorkflowId(alias);
          return alias === raw || (!!aliasNorm && aliasNorm === normalized);
        })) return status.id;
      }
      if (normalized) return normalized;
      return workflow.defaultStatusId || "triage";
    }

    function compactInboxItem(page, status, action) {
      const pathText = normalizePath(page?.file?.path || page?.path || "");
      const name = String(page?.file?.name || (pathText.split("/").pop() || "")).replace(/\.md$/i, "");
      return {
        path: pathText,
        name,
        status,
        action,
        reviewDate: normalizeDateValue(inboxField(page, "inbox-review")),
        next: String(inboxField(page, "inbox-next") || "").trim(),
        created: normalizeDateValue(page?.file?.ctime || inboxField(page, "created") || inboxField(page, "date")),
        modified: normalizeDateValue(page?.file?.mtime || inboxField(page, "modified"))
      };
    }

    async function collectInboxDomain(resolved) {
      const workflow = inboxWorkflowConfig();
      const terminalStatuses = new Set((workflow.statuses || []).filter((status) => status.terminal).map((status) => status.id));
      const summary = { total: 0, byStatus: {}, byAction: {}, staleCount: 0, processedInRange: 0, createdInRange: 0 };
      const queues = {};
      const staleItems = [];
      const recentProcessed = [];

      for (const page of inboxPages()) {
        const pathText = normalizePath(page?.file?.path || page?.path || "");
        if (!pathText || isReviewNotePath(pathText)) continue;
        const status = resolveInboxStatusId(inboxField(page, "inbox-status"), workflow);
        const action = normalizeInboxWorkflowId(inboxField(page, "inbox-action"));
        const item = compactInboxItem(page, status, action);
        summary.total += 1;
        summary.byStatus[status] = (summary.byStatus[status] || 0) + 1;
        if (action) summary.byAction[action] = (summary.byAction[action] || 0) + 1;
        if (!queues[status]) queues[status] = [];
        queues[status].push(item);

        if (item.created && inRange(item.created, resolved.start, resolved.end)) summary.createdInRange += 1;
        if (terminalStatuses.has(status) && item.modified && inRange(item.modified, resolved.start, resolved.end)) {
          summary.processedInRange += 1;
          recentProcessed.push(item);
        }
        if (!terminalStatuses.has(status) && item.reviewDate && item.reviewDate <= resolved.end) {
          summary.staleCount += 1;
          staleItems.push(item);
        }
      }

      Object.keys(queues).forEach((key) => {
        queues[key].sort((a, b) => String(a.created || "").localeCompare(String(b.created || "")));
        queues[key] = queues[key].slice(0, 80);
      });
      staleItems.sort((a, b) => String(a.reviewDate || "").localeCompare(String(b.reviewDate || "")));
      recentProcessed.sort((a, b) => String(b.modified || "").localeCompare(String(a.modified || "")));

      return {
        summary,
        queues,
        evidence: {
          staleItems: staleItems.slice(0, 20),
          recentProcessed: recentProcessed.slice(0, 20)
        }
      };
    }

    function projectRoot() {
      return normalizePath(runtimeBridge.paths?.projectsRoot || "01_Projects").replace(/\/+$/, "");
    }

    function normalizeProjectName(value) {
      return String(value || "").trim();
    }

    function stripProjectFileName(value) {
      return normalizeProjectName(String(value || "").split("/").pop() || "")
        .replace(/\.(md|canvas)$/i, "")
        .replace(/[·\-\s]*MOC$/i, "");
    }

    function canonicalProjectKey(value) {
      return stripProjectFileName(value).replace(/\s+/g, "").toLowerCase();
    }

    const MARKDOWN_SECTION_ALIAS_GROUPS = [
      ["进行中的项目", "Active projects"],
      ["计划中的项目", "Planned projects"],
      ["已完成的项目", "Completed projects"],
      ["项目隐藏清单", "Hidden projects"],
      ["打卡中的习惯", "Active habits"],
      ["暂停的习惯", "Paused habits"],
      ["已养成习惯", "Established habits"],
      ["循环任务源（每日）", "Daily recurring task source"]
    ];

    function markdownSectionAliases(title) {
      const raw = String(title || "").trim();
      return MARKDOWN_SECTION_ALIAS_GROUPS.find((group) => group.includes(raw)) || [raw];
    }

    function markdownSectionBlock(content, title) {
      const source = String(content || "");
      for (const candidate of markdownSectionAliases(title)) {
        const escaped = String(candidate || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const block = (source.match(new RegExp(`##\\s*${escaped}[\\s\\S]*?(?=\\n##\\s|$)`)) || [])[0] || "";
        if (block) return block;
      }
      return "";
    }

    function isPlaceholderProjectName(value) {
      const name = normalizeProjectName(value);
      return !name || name === "（空）" || name === "(空)" || /^\(?\s*empty\s*\)?$/i.test(name) || /^[（(]?\s*空\s*[)）]?$/u.test(name);
    }

    function projectInfoFromPath(pathText) {
      const rootPath = projectRoot();
      const filePath = normalizePath(pathText);
      if (!filePath || !rootPath || !filePath.startsWith(`${rootPath}/`)) return null;
      const rel = filePath.slice(rootPath.length + 1);
      const parts = rel.split("/").filter(Boolean);
      if (parts.length >= 2) {
        return { name: parts[0], root: `${rootPath}/${parts[0]}`, singleFile: false };
      }
      if (parts.length === 1 && /\.md$/i.test(parts[0] || "")) {
        return { name: String(parts[0] || "").replace(/\.md$/i, ""), root: `${rootPath}/${parts[0]}`, singleFile: true };
      }
      return null;
    }

    function projectEntryFromLine(lineText) {
      const raw = String(lineText || "").replace(/^-+\s*/, "").trim();
      if (!raw) return null;
      const link = raw.match(/^\[\[([^|\]]+)(?:\|([^\]]+))?\]\]$/);
      let name = "";
      let targetPath = "";
      let info = null;
      if (link) {
        targetPath = normalizePath(link[1] || "");
        info = projectInfoFromPath(targetPath);
        name = normalizeProjectName(link[2] || info?.name || stripProjectFileName(targetPath));
      } else {
        name = normalizeProjectName(raw);
      }
      if (isPlaceholderProjectName(name)) return null;
      const rootPath = info?.root || (targetPath ? normalizePath(targetPath) : `${projectRoot()}/${name}`);
      return {
        name,
        targetPath,
        root: rootPath,
        singleFile: !!info?.singleFile,
        key: canonicalProjectKey(targetPath || name)
      };
    }

    function getProjectSectionItems(content, title, stage) {
      const block = markdownSectionBlock(content, title);
      return block
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => /^-\s+/.test(line))
        .map(projectEntryFromLine)
        .filter(Boolean)
        .map((entry) => ({ ...entry, stage }));
    }

    async function collectProjectRegistryItems() {
      const registryPath = normalizePath(runtimeBridge.paths?.projectRegistryPath || "");
      const content = registryPath ? await readText(registryPath) : "";
      const sections = [
        ["active", "进行中的项目"],
        ["planned", "计划中的项目"],
        ["done", "已完成的项目"],
        ["hidden", "项目隐藏清单"]
      ];
      const seen = new Set();
      const items = [];
      sections.forEach(([stage, title]) => {
        getProjectSectionItems(content, title, stage).forEach((entry) => {
          const key = entry.key || canonicalProjectKey(entry.root || entry.name);
          if (!key || seen.has(`${stage}:${key}`)) return;
          seen.add(`${stage}:${key}`);
          items.push({ ...entry, key });
        });
      });
      return items;
    }

    function taskSourcePath(item) {
      return normalizePath(item?.source?.path || item?.identity?.sourcePath || "");
    }

    function taskProjectPath(item) {
      return normalizePath(item?.classification?.projectPath || "");
    }

    function taskMatchesProject(item, project) {
      const rootPath = normalizePath(project?.root || "");
      if (!rootPath) return false;
      const sourcePath = taskSourcePath(item);
      const projectPath = taskProjectPath(item);
      if (project?.singleFile) return sourcePath === rootPath || projectPath === rootPath;
      if (sourcePath === rootPath || sourcePath.startsWith(`${rootPath}/`)) return true;
      if (projectPath === rootPath || projectPath.startsWith(`${rootPath}/`)) return true;
      return !!projectPath && canonicalProjectKey(projectPath) === canonicalProjectKey(project?.name);
    }

    function taskHasRangeActivity(item, resolved) {
      const dates = item?.dates || {};
      return [dates.completion, dates.due, dates.scheduled, dates.start, dates.diaryFallback]
        .some((ds) => inRange(ds, resolved.start, resolved.end));
    }

    function summarizeProject(project, tasks, resolved) {
      const projectTasks = tasks.filter((task) => task.status !== "cancelled" && !task.classification?.isHabit && taskMatchesProject(task, project));
      const taskDone = projectTasks.filter((task) => task.completed).length;
      const taskOpen = projectTasks.filter((task) => task.status === "open").length;
      const taskTotal = taskDone + taskOpen;
      const recentActivity = projectTasks.some((task) => taskHasRangeActivity(task, resolved));
      return {
        name: project.name,
        stage: project.stage,
        root: project.root,
        targetPath: project.targetPath,
        taskTotal,
        taskDone,
        taskOpen,
        completionRate: taskTotal ? Number(((taskDone / taskTotal) * 100).toFixed(1)) : 0,
        recentActivity,
        stale: project.stage === "active" && !recentActivity
      };
    }

    async function collectProjectsDomain(resolved) {
      const registryItems = await collectProjectRegistryItems();
      const taskFacts = await getTasks({ range: resolved, bucketBy: "active", status: "all", rangePolicy: "allFacts" });
      const items = registryItems.map((project) => summarizeProject(project, taskFacts.items || [], resolved));
      const activeItems = items.filter((item) => item.stage === "active");
      const taskTotal = activeItems.reduce((sum, item) => sum + Number(item.taskTotal || 0), 0);
      const taskDone = activeItems.reduce((sum, item) => sum + Number(item.taskDone || 0), 0);
      const taskOpen = activeItems.reduce((sum, item) => sum + Number(item.taskOpen || 0), 0);
      const staleProjects = activeItems.filter((item) => item.stale);
      return {
        summary: {
          activeCount: activeItems.length,
          plannedCount: items.filter((item) => item.stage === "planned").length,
          doneCount: items.filter((item) => item.stage === "done").length,
          hiddenCount: items.filter((item) => item.stage === "hidden").length,
          taskTotal,
          taskDone,
          taskOpen,
          completionRate: taskTotal ? Number(((taskDone / taskTotal) * 100).toFixed(1)) : 0,
          staleProjectCount: staleProjects.length
        },
        items,
        evidence: {
          staleProjects: staleProjects.slice(0, 20)
        }
      };
    }

    function habitSectionBlock(content, title) {
      return markdownSectionBlock(content, title);
    }

    function habitSectionItems(content, title) {
      return [
        ...new Set(
          habitSectionBlock(content, title)
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => /^-\s+/.test(line))
            .map((line) => line.replace(/^-+\s*/, "").trim())
            .filter((line) => line && line !== "（空）" && !/^\(?\s*empty\s*\)?$/i.test(line))
        )
      ];
    }

    function habitSectionTaskEntries(content, title) {
      return habitSectionBlock(content, title)
        .split(/\r?\n/)
        .map((line, index) => ({ rawLine: line.trim(), line: index }))
        .filter((entry) => /^-\s+\[[ xX\/-]\]\s+/.test(entry.rawLine))
        .map((entry) => {
          const mark = (entry.rawLine.match(/^-\s+\[([ xX\/-])\]\s+/) || [])[1] || " ";
          const checkbox = { mark, state: checkboxStateFromMark(mark) };
          const text = entry.rawLine.replace(/^-\s+\[[ xX\/-]\]\s+/, "").trim();
          return { ...entry, text, task: text, completed: checkbox.state === "done", checkbox };
        })
        .filter((entry) => !!entry.text);
    }

    function migrateHabitStatusTags(text) {
      return String(text || "")
        .split(/\r?\n/)
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

    function cleanHabitName(text) {
      return String(text || "")
        .replace(/^\s*[-*]\s*\[[^\]]\]\s*/, "")
        .replace(/#habit-active\b/gi, "")
        .replace(/#habit-paused\b/gi, "")
        .replace(/#habit-done\b/gi, "")
        .replace(/#active\b/gi, "")
        .replace(/#paused\b/gi, "")
        .replace(/#done\b/gi, "")
        .replace(/#habit\b/gi, "")
        .replace(/#[一-龥\w/-]+/g, "")
        .replace(/(?:📅|📆|🗓|⏳|⌛|🛫|✅)\s*\d{4}-\d{2}-\d{2}/g, "")
        .replace(/🔁\s*[^#\[\]\n]+/g, "")
        .replace(/\[[a-zA-Z_][a-zA-Z0-9_-]*::\s*[^\]]*\]/g, "")
        .replace(/\s{2,}/g, " ")
        .trim();
    }

    function canonicalHabitName(text) {
      const name = cleanHabitName(text);
      let m = name.match(/^喝\s*(\d+(?:\.\d+)?)\s*杯水$/);
      if (m) return "喝水";
      m = name.match(/^运动\s*(\d+(?:\.\d+)?)\s*(大卡|千卡|kcal|卡)$/i);
      if (m) return "运动";
      return name;
    }

    function hasHabitTag(text, tag) {
      return new RegExp(`(^|\\s)#${String(tag || "").replace(/^#/, "")}\\b`, "i").test(String(text || ""));
    }

    function parseRawHabitTasks(pathText, markdown) {
      const out = [];
      let inFence = false;
      String(markdown || "").split(/\r?\n/).forEach((lineText, index) => {
        if (/^\s*(```|~~~)/.test(lineText)) {
          inFence = !inFence;
          return;
        }
        if (inFence) return;
        const match = String(lineText || "").match(/^\s*[-*]\s*\[([ xX\/-])\]\s+(.+)$/);
        if (!match) return;
        const text = String(match[2] || "").trim();
        if (!hasHabitTag(text, "habit")) return;
        const checkbox = { mark: match[1], state: checkboxStateFromMark(match[1]) };
        out.push({
          text,
          task: text,
          rawLine: String(lineText || ""),
          completed: checkbox.state === "done",
          checked: checkbox.state === "done" || checkbox.state === "cancelled",
          status: checkbox.state,
          checkbox,
          path: normalizePath(pathText),
          sourcePath: normalizePath(pathText),
          line: index,
          __noriaSource: "vault"
        });
      });
      return out;
    }

    async function collectRawHabitSources(registry) {
      const rows = [];
      const registryPath = registry?.registryPath || "";
      (registry?.sourceRows || []).forEach((entry) => {
        rows.push({ ...entry, path: registryPath, sourcePath: registryPath, __noriaSource: "habit-registry" });
      });
      const files = filesForManagedPath("diaryRoot");
      for (const file of files) {
        const pathText = normalizePath(file?.path || "");
        const content = await readText(pathText, file);
        rows.push(...parseRawHabitTasks(pathText, content));
      }
      try {
        getDiaryPages().forEach((page) => {
          const pathText = normalizePath(page?.file?.path || "");
          toArray(page?.file?.tasks || []).forEach((task, index) => {
            rows.push({ ...task, path: normalizePath(task?.path || task?.sourcePath || pathText), sourcePath: pathText, line: task?.line ?? index, __noriaSource: "diary-page" });
          });
        });
      } catch (_) {}
      try {
        toArray(runtimeBridge.runtime?.tasksForScope?.("tasks")).forEach((task, index) => {
          rows.push({ ...task, line: task?.line ?? index, __noriaSource: task?.__noriaSource || "task-scope" });
        });
      } catch (_) {}
      return rows;
    }

    async function collectHabitRegistryState() {
      const registryPath = normalizePath(runtimeBridge.paths?.habitRegistryPath || "");
      const content = registryPath ? migrateHabitStatusTags(await readText(registryPath)) : "";
      const sourceRows = content ? habitSectionTaskEntries(content, "循环任务源（每日）") : [];
      const activeFromSource = new Set(
        sourceRows
          .filter((row) => hasHabitTag(row.text, "habit") && hasHabitTag(row.text, "active") && !hasHabitTag(row.text, "paused"))
          .map((row) => canonicalHabitName(row.text))
          .filter(Boolean)
      );
      const pausedFromSource = new Set(
        sourceRows
          .filter((row) => hasHabitTag(row.text, "paused"))
          .map((row) => canonicalHabitName(row.text))
          .filter(Boolean)
      );
      const activeFromSection = new Set(habitSectionItems(content, "打卡中的习惯").map(canonicalHabitName).filter(Boolean));
      const masteredSet = new Set(habitSectionItems(content, "已养成习惯").map(canonicalHabitName).filter(Boolean));
      const pausedSet = new Set([...habitSectionItems(content, "暂停的习惯").map(canonicalHabitName).filter(Boolean), ...pausedFromSource]);
      const activeNames = [...new Set([...activeFromSection, ...activeFromSource])]
        .filter((name) => name && !masteredSet.has(name) && !pausedSet.has(name))
        .sort((a, b) => a.localeCompare(b, "zh-CN"));
      return {
        registryPath,
        sourceRows,
        activeNames,
        activeSet: new Set(activeNames),
        pausedSet,
        masteredSet
      };
    }

    function habitRecordDate(task) {
      const dates = parseTaskDateRoles(task);
      return dates.due || dates.scheduled || dates.start || dates.completion || dates.diaryFallback || "";
    }

    function habitRecordFromTask(task) {
      const text = taskText(task);
      if (!hasHabitTag(text, "habit")) return null;
      const name = canonicalHabitName(text);
      if (!name) return null;
      const checkbox = normalizeTaskCheckbox(task);
      const done = checkbox.state === "done";
      const date = habitRecordDate(task);
      if (!date) return null;
      return {
        name,
        date,
        done,
        text,
        sourcePath: normalizePath(task?.path || task?.sourcePath || task?.file?.path || ""),
        line: Number(task?.line ?? task?.lineNumber ?? 0) || 0
      };
    }

    function habitStreakForName(name, recordMap, dates) {
      let current = 0;
      for (let i = dates.length - 1; i >= 0; i -= 1) {
        if (recordMap.get(`${name}|${dates[i]}`) === true) current += 1;
        else break;
      }
      let longest = 0;
      let run = 0;
      dates.forEach((ds) => {
        if (recordMap.get(`${name}|${ds}`) === true) {
          run += 1;
          longest = Math.max(longest, run);
        } else {
          run = 0;
        }
      });
      return { current, longest };
    }

    function habitDomainCacheKey(resolved) {
      return JSON.stringify({
        build: runtimeBridge.runtimeBuildId || "dev",
        token: getCacheStore().token || 0,
        range: {
          start: resolved?.start || "",
          end: resolved?.end || "",
          mode: resolved?.mode || "",
          granularity: resolved?.granularity || "day"
        },
        paths: {
          diaryRoot: normalizePath(runtimeBridge.paths?.diaryRoot || ""),
          habitRegistryPath: normalizePath(runtimeBridge.paths?.habitRegistryPath || "")
        },
        policy: taskQueryContextHash()
      });
    }

    async function buildHabitsDomain(resolved) {
      const registry = await collectHabitRegistryState();
      const rawRows = await collectRawHabitSources(registry);
      const recordMap = new Map();
      rawRows.forEach((task) => {
        const record = habitRecordFromTask(task);
        if (!record) return;
        if (!inRange(record.date, resolved.start, resolved.end)) return;
        if (registry.pausedSet.has(record.name) || registry.masteredSet.has(record.name)) return;
        if (registry.activeSet.size && !registry.activeSet.has(record.name)) return;
        const key = `${record.name}|${record.date}`;
        recordMap.set(key, record.done || recordMap.get(key) === true);
      });
      const activeNames = registry.activeNames.length
        ? registry.activeNames
        : [...new Set([...recordMap.keys()].map((key) => key.split("|")[0]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
      const activeSet = new Set(activeNames);
      const series = resolved.dates.map((date) => {
        let checked = 0;
        activeNames.forEach((name) => {
          if (recordMap.get(`${name}|${date}`) === true) checked += 1;
        });
        const scheduled = activeNames.length;
        return {
          key: date,
          date,
          checked,
          scheduled,
          completionRate: scheduled ? Number(((checked / scheduled) * 100).toFixed(1)) : 0,
          value: checked
        };
      });
      const scheduled = activeNames.length * resolved.dates.length;
      const checked = series.reduce((sum, row) => sum + Number(row.checked || 0), 0);
      let currentStreak = 0;
      for (let i = series.length - 1; i >= 0; i -= 1) {
        if (Number(series[i].checked || 0) > 0) currentStreak += 1;
        else break;
      }
      let streak = 0;
      let run = 0;
      series.forEach((row) => {
        if (Number(row.checked || 0) > 0) {
          run += 1;
          streak = Math.max(streak, run);
        } else {
          run = 0;
        }
      });
      const items = activeNames.map((name) => {
        let habitChecked = 0;
        const habitSeries = resolved.dates.map((date) => {
          const checked = recordMap.get(`${name}|${date}`) === true ? 1 : 0;
          habitChecked += checked;
          return {
            key: date,
            date,
            checked,
            scheduled: 1,
            completionRate: checked ? 100 : 0,
            value: checked
          };
        });
        const habitStreak = habitStreakForName(name, recordMap, resolved.dates);
        return {
          name,
          checked: habitChecked,
          scheduled: resolved.dates.length,
          completionRate: resolved.dates.length ? Number(((habitChecked / resolved.dates.length) * 100).toFixed(1)) : 0,
          currentStreak: habitStreak.current,
          longestStreak: habitStreak.longest,
          active: activeSet.has(name),
          heatmap: { series: habitSeries }
        };
      });
      return {
        heatmap: { series },
        summary: {
          activeCount: activeNames.length,
          scheduled,
          checked,
          completionRate: scheduled ? Number(((checked / scheduled) * 100).toFixed(1)) : 0,
          currentStreak,
          streak
        },
        items,
        evidence: {
          source: registry.registryPath ? "habit-registry" : "derived",
          registryPath: registry.registryPath
        }
      };
    }

    async function collectHabitsDomain(resolved) {
      const cache = getCacheStore();
      const key = habitDomainCacheKey(resolved);
      if (cache.habitDomains.has(key)) return clonePlainData(cache.habitDomains.get(key));
      if (cache.habitDomainPending.has(key)) return clonePlainData(await cache.habitDomainPending.get(key));
      const pending = (async () => {
        const result = await buildHabitsDomain(resolved);
        const cached = clonePlainData(result);
        cache.habitDomains.set(key, cached);
        if (cache.habitDomains.size > 24) cache.habitDomains.delete(cache.habitDomains.keys().next().value);
        return cached;
      })();
      cache.habitDomainPending.set(key, pending);
      try {
        return clonePlainData(await pending);
      } finally {
        if (cache.habitDomainPending.get(key) === pending) cache.habitDomainPending.delete(key);
      }
    }

    function isVaultHealthIgnoredPath(pathText) {
      const p = normalizePath(pathText);
      return p.startsWith(".obsidian/")
        || p.startsWith(".cursor/")
        || p.startsWith("assets/")
        || p.includes("00_Templates/")
        || p.includes("/.specstory/")
        || p.includes("/.history/")
        || p.includes("/.github/")
        || p.endsWith("/README.md")
        || p === "README.md";
    }

    function normalizeVaultHealthTags(value) {
      const out = [];
      const push = (item) => {
        const raw = typeof item === "object" && item ? (item.tag || item.name || item.value || "") : item;
        String(raw || "")
          .split(/[\s,]+/)
          .map((tag) => tag.trim())
          .filter(Boolean)
          .forEach((tag) => out.push(tag.startsWith("#") ? tag : `#${tag}`));
      };
      if (Array.isArray(value)) value.forEach(push);
      else if (value != null) push(value);
      return [...new Set(out.map((tag) => tag.toLowerCase()))];
    }

    function vaultHealthTagsFor(file, page = {}) {
      const cache = file ? fileFrontmatter(file) : {};
      let fullCache = {};
      try {
        fullCache = file ? (app?.metadataCache?.getFileCache?.(file) || {}) : {};
      } catch (_) {
        fullCache = {};
      }
      return [
        ...normalizeVaultHealthTags(page?.tags),
        ...normalizeVaultHealthTags(page?.file?.tags),
        ...normalizeVaultHealthTags(page?.frontmatter?.tags),
        ...normalizeVaultHealthTags(cache?.tags),
        ...normalizeVaultHealthTags(fullCache?.frontmatter?.tags),
        ...normalizeVaultHealthTags(fullCache?.tags)
      ].filter((tag, index, arr) => arr.indexOf(tag) === index);
    }

    function collectVaultHealthPages() {
      const files = allMarkdownFiles();
      if (files.length) {
        return files
          .map((file) => ({
            path: normalizePath(file?.path || ""),
            name: fileName(file?.path || ""),
            tags: vaultHealthTagsFor(file)
          }))
          .filter((item) => item.path && !isVaultHealthIgnoredPath(item.path));
      }
      return getPagesForScope("notes")
        .map((page) => ({
          path: normalizePath(page?.file?.path || page?.path || ""),
          name: fileName(page?.file?.path || page?.path || ""),
          tags: vaultHealthTagsFor(null, page)
        }))
        .filter((item) => item.path && !isVaultHealthIgnoredPath(item.path));
    }

    function isVaultHealthIgnoredLinkTarget(target) {
      const t = String(target || "").trim();
      if (!t) return true;
      if (/^(?:https?:|mailto:|memory:)/i.test(t)) return true;
      if (t.includes("{{") || t.includes("}}") || t.includes("`")) return true;
      if (/\.(png|jpg|jpeg|gif|webp|svg|pdf|mp4|mov)$/i.test(t)) return true;
      return false;
    }

    function collectBrokenLinkEvidence() {
      const unresolved = app?.metadataCache?.unresolvedLinks || {};
      const brokenLinks = [];
      Object.entries(unresolved || {}).forEach(([source, targets]) => {
        const sourcePath = normalizePath(source);
        if (!sourcePath || isVaultHealthIgnoredPath(sourcePath)) return;
        Object.keys(targets || {}).forEach((target) => {
          if (isVaultHealthIgnoredLinkTarget(target)) return;
          brokenLinks.push({ source: sourcePath, target: String(target || "").trim() });
        });
      });
      return brokenLinks.sort((a, b) => `${a.source}\u0000${a.target}`.localeCompare(`${b.source}\u0000${b.target}`));
    }

    function collectVaultHealthDomain() {
      const pages = collectVaultHealthPages();
      const missingTagFiles = pages
        .filter((page) => !page.tags.length)
        .map((page) => ({ path: page.path, name: page.name }));
      const brokenLinks = collectBrokenLinkEvidence();
      const brokenLinkSources = new Set(brokenLinks.map((item) => item.source));
      const taggedFiles = pages.length - missingTagFiles.length;
      return {
        summary: {
          markdownFiles: pages.length,
          taggedFiles,
          missingTags: missingTagFiles.length,
          tagCoverage: pages.length ? Number(((taggedFiles / pages.length) * 100).toFixed(1)) : 0,
          brokenLinks: brokenLinks.length,
          brokenLinkSources: brokenLinkSources.size
        },
        evidence: {
          missingTagFiles: missingTagFiles.slice(0, 40),
          brokenLinks: brokenLinks.slice(0, 80)
        }
      };
    }

    async function getSnapshot(request = {}) {
      const snapshotPerf = readHomePerformanceRecorder();
      const snapshotStarted = dataServicePerfNow();
      const preset = applyPreset(request);
      const resolved = resolveRange(request, { now, bridge: runtimeBridge });
      const normalizedRequest = {
        preset: preset.preset,
        include: preset.include,
        views: preset.views,
        detail: preset.detail,
        range: { start: resolved.start, end: resolved.end, mode: resolved.mode },
        granularity: resolved.granularity
      };
      const key = JSON.stringify({ build: runtimeBridge.runtimeBuildId || "dev", token: getCacheStore().token || 0, normalizedRequest });
      const cache = getCacheStore();
      if (cache.entries.has(key)) {
        const cached = cache.entries.get(key);
        snapshotPerf?.markSnapshot?.({
          request: normalizedRequest,
          cached: true,
          ms: roundPerfMs(dataServicePerfNow() - snapshotStarted)
        });
        return cached;
      }
      if (cache.pending.has(key)) {
        const pendingSnapshot = await cache.pending.get(key);
        snapshotPerf?.markSnapshot?.({
          request: normalizedRequest,
          cached: true,
          ms: roundPerfMs(dataServicePerfNow() - snapshotStarted)
        });
        return pendingSnapshot;
      }
      const pending = (async () => {
        const domains = {};
        const warnings = [];
        const sourceCompleteness = {};
        const needsNotesDaily = preset.include.includes("notes") || preset.include.includes("dailyState") || preset.include.includes("workload") || preset.include.includes("focus");
        const needsTasks = preset.include.includes("tasks") || preset.include.includes("workload");
        const notesDailyPromise = needsNotesDaily ? collectNotesAndDailyState(resolved) : null;
        const tasksPromise = needsTasks ? collectTaskCompletionDomain(resolved) : null;
        const habitsPromise = preset.include.includes("habits") ? collectHabitsDomain(resolved) : null;
        const inboxPromise = preset.include.includes("inbox") ? collectInboxDomain(resolved) : null;
        const projectsPromise = preset.include.includes("projects") ? collectProjectsDomain(resolved) : null;
        const vaultHealthPromise = preset.include.includes("vaultHealth") ? Promise.resolve().then(() => collectVaultHealthDomain()) : null;
        const [notesDaily, tasksDomain, habitsDomain, inboxDomain, projectsDomain, vaultHealthDomain] = await Promise.all([
          notesDailyPromise,
          tasksPromise,
          habitsPromise,
          inboxPromise,
          projectsPromise,
          vaultHealthPromise
        ]);

        if (notesDaily) {
          if (preset.include.includes("notes")) domains.notes = notesDaily.notes;
          if (preset.include.includes("dailyState")) domains.dailyState = notesDaily.dailyState;
        }
        if (tasksDomain && preset.include.includes("tasks")) domains.tasks = tasksDomain;
        if (habitsDomain) domains.habits = habitsDomain;
        if (preset.include.includes("workload")) {
          const notesTrend = notesDaily?.notes?.trend || domains.notes?.trend;
          const tasksCompletion = tasksDomain?.completion || domains.tasks?.completion;
          domains.workload = {
            heatmap: { series: (notesTrend?.series || []).map((row) => ({ key: row.key, value: (row.notes || 0) + (tasksCompletion?.series?.find((x) => x.key === row.key)?.planned || 0) })) },
            summary: { notes: notesTrend?.totalCreated || 0, tasks: tasksCompletion?.activityTotal || 0, words: notesTrend?.totalDiaryWords || 0 }
          };
        }
        if (inboxDomain) domains.inbox = inboxDomain;
        if (projectsDomain) domains.projects = projectsDomain;
        if (vaultHealthDomain) domains.vaultHealth = vaultHealthDomain;
        if (preset.include.includes("focus")) domains.focus = { role: "supporting", summary: { subjectiveFocusAvg: notesDaily?.dailyState?.summary?.averageFocus || domains.dailyState?.summary?.averageFocus || 0, trackedWorkMinutes: 0, confidence: "optional" } };
        if (preset.include.includes("pomodoro")) domains.pomodoro = { sourceRole: "auxiliary-focus-timer", summary: { sessions: 0, focusMinutes: 0 } };
        if (preset.include.includes("git")) domains.git = { summary: { available: false, commitCount: 0, committedMarkdownFiles: 0, workingMarkdownFiles: 0, diffAdded: 0, diffDeleted: 0, diffNet: 0 }, evidence: { commits: [], changedFiles: [] }, meta: { scope: "markdown-only", noiseFiltered: true } };

      Object.keys(DOMAIN_REGISTRY).forEach((name) => {
        sourceCompleteness[name] = { available: !!domains[name] };
      });
      const snapshot = {
        meta: {
          schemaVersion: SCHEMA_VERSION,
          generatedAt: new Date().toISOString(),
          noriaVersion: runtimeBridge.pluginVersion || "",
          runtimeBuildId: runtimeBridge.runtimeBuildId || "",
          request,
          resolvedRequest: normalizedRequest,
          policy: {
            metricsAsEvidenceNotJudgment: true,
            noProductivityScore: true,
            taskCompletionDatePriority: ["[completion::]", "[done::]", "frontmatter completion", "Tasks ✅ YYYY-MM-DD", "diary date fallback"],
            undatedCompleted: "summary-only",
            yearDefaultGranularity: { home: "week", review: "month" }
          }
        },
        range: { mode: resolved.mode, sourceMode: resolved.sourceMode, start: resolved.start, end: resolved.end },
        granularity: resolved.granularity,
        domains,
        views: {},
        warnings,
        sourceCompleteness
      };
      if (preset.views.includes("home")) {
        snapshot.views.home = {
          noteTrend: domains.notes?.trend || null,
          taskTrend: domains.tasks?.completion || null,
          dailyState: domains.dailyState || null,
          habitHeatmap: domains.habits?.heatmap || null,
          workloadHeatmap: domains.workload?.heatmap || null,
          noteDistribution: domains.notes?.distribution || null
        };
      }
      if (preset.views.includes("board")) snapshot.views.board = { tasks: domains.tasks?.board || domains.tasks?.completion || null };
      if (preset.views.includes("timeline")) snapshot.views.timeline = { tasks: domains.tasks?.timeline || null, focus: domains.focus || null };
      if (preset.views.includes("periodic")) snapshot.views.periodic = { notes: domains.notes || null, tasks: domains.tasks || null, dailyState: domains.dailyState || null };
      if (preset.views.includes("review")) {
        const reviewDomains = Object.keys(domains);
        snapshot.views.review = {
          range: { ...snapshot.range },
          granularity: snapshot.granularity,
          domains: reviewDomains,
          evidence: {
            domains: reviewDomains,
            sourceCompleteness: Object.fromEntries(
              reviewDomains.map((name) => [name, sourceCompleteness[name] || { available: false }])
            )
          }
        };
      }
      cache.entries.set(key, snapshot);
      if (cache.entries.size > 80) cache.entries.delete(cache.entries.keys().next().value);
      snapshotPerf?.markSnapshot?.({
        request: normalizedRequest,
        cached: false,
        ms: roundPerfMs(dataServicePerfNow() - snapshotStarted)
      });
      return snapshot;
      })();
      cache.pending.set(key, pending);
      try {
        return await pending;
      } finally {
        if (cache.pending.get(key) === pending) cache.pending.delete(key);
      }
    }

    function periodInfo(mode, period, granularity) {
      const m = String(mode || "daily");
      const p = String(period || "").trim();
      if (m === "weekly" || /^(\d{4})-W(\d{1,2})$/i.test(p)) {
        const match = p.match(/^(\d{4})-W(\d{1,2})$/i);
        const year = match ? match[1] : formatDate(new Date()).slice(0, 4);
        const week = match ? match[2] : pad2(isoWeek(new Date()).week);
        const start = weekStartFromIso(year, week);
        const end = addDays(start, 6);
        return { mode: "weekly", period: `${year}-W${pad2(week)}`, year, start: formatDate(start), end: formatDate(end), granularity: "day" };
      }
      if (m === "monthly" || /^\d{4}-\d{2}$/.test(p)) {
        const year = p.slice(0, 4) || formatDate(new Date()).slice(0, 4);
        const month = p.slice(5, 7) || "01";
        const start = new Date(Number(year), Number(month) - 1, 1);
        return { mode: "monthly", period: `${year}-${month}`, year, start: formatDate(start), end: formatDate(endOfMonth(start)), granularity: "day" };
      }
      if (m === "yearly" || /^\d{4}$/.test(p)) {
        const year = /^\d{4}$/.test(p) ? p : formatDate(new Date()).slice(0, 4);
        return { mode: "yearly", period: year, year, start: `${year}-01-01`, end: `${year}-12-31`, granularity: granularity === "week" ? "week" : "month" };
      }
      const date = normalizeDateValue(p) || formatDate(new Date());
      return { mode: "daily", period: date, year: date.slice(0, 4), start: date, end: date, granularity: "day" };
    }

    function artifactPathForPeriod(info) {
      const root = normalizePath(runtimeBridge.paths?.diaryRoot || "06_Diary");
      if (info.mode === "yearly") return `${root}/${info.year}/${info.period}-review-${info.granularity}.md`;
      return `${root}/${info.year}/${info.period}-review.md`;
    }

    function notePathForPeriod(info) {
      const root = normalizePath(runtimeBridge.paths?.diaryRoot || "06_Diary");
      return `${root}/${info.year}/${info.period}.md`;
    }

    function dailyNotePathForDate(date) {
      const ymd = normalizeDateValue(date);
      const root = normalizePath(runtimeBridge.paths?.diaryRoot || "06_Diary");
      return ymd ? `${root}/${ymd.slice(0, 4)}/${ymd}.md` : "";
    }

    async function markdownPathExists(pathText, knownMarkdownPaths = null) {
      const normalized = normalizePath(pathText);
      if (!normalized) return false;
      try {
        if (typeof app?.vault?.getAbstractFileByPath === "function" && app.vault.getAbstractFileByPath(normalized)) return true;
      } catch (_) {}
      try {
        if (knownMarkdownPaths && knownMarkdownPaths.has(normalized)) return true;
      } catch (_) {}
      try {
        if (typeof app?.vault?.adapter?.exists === "function") return !!(await app.vault.adapter.exists(normalized));
      } catch (_) {}
      return false;
    }

    function knownMarkdownPathSet() {
      try {
        return new Set(allMarkdownFiles().map((file) => normalizePath(file?.path || "")).filter(Boolean));
      } catch (_) {
        return new Set();
      }
    }

    function evidencePathForPeriod(info) {
      if (info.mode === "yearly") return `${reviewCacheRoot}/${info.year}/${info.period}.${info.granularity}.json`;
      return `${reviewCacheRoot}/${info.year}/${info.period}.json`;
    }

    async function getPeriods(request = {}) {
      const mode = String(request.mode || "daily");
      const year = String(request.year || (request.range?.start || formatDate(new Date())).slice(0, 4));
      const range = request.range || { start: `${year}-01-01`, end: `${year}-12-31` };
      const items = [];
      if (mode === "weekly") {
        const start = startOfWeek(toDate(range.start) || new Date());
        const end = toDate(range.end) || addDays(start, 6);
        for (let d = start; d.getTime() <= end.getTime(); d = addDays(d, 7)) {
          const wk = isoWeek(d);
          const info = periodInfo("weekly", `${wk.year}-W${pad2(wk.week)}`);
          const notePath = notePathForPeriod(info);
          items.push({ ...info, range: { start: info.start, end: info.end }, note: { path: notePath, exists: !!app?.vault?.getAbstractFileByPath?.(notePath) }, review: { artifactPath: artifactPathForPeriod(info), exists: !!app?.vault?.getAbstractFileByPath?.(artifactPathForPeriod(info)), evidencePath: evidencePathForPeriod(info), stale: true } });
        }
      } else {
        const info = periodInfo(mode, request.period || year, request.granularity);
        const notePath = notePathForPeriod(info);
        items.push({ ...info, range: { start: info.start, end: info.end }, note: { path: notePath, exists: !!app?.vault?.getAbstractFileByPath?.(notePath) }, review: { artifactPath: artifactPathForPeriod(info), exists: !!app?.vault?.getAbstractFileByPath?.(artifactPathForPeriod(info)), evidencePath: evidencePathForPeriod(info), stale: true } });
      }
      return { items };
    }

    async function getReviewEvidence(request = {}) {
      const info = periodInfo(request.mode, request.period || request.date, request.granularity);
      const snapshot = await getSnapshot({
        preset: "review",
        range: { mode: "custom", start: info.start, end: info.end },
        granularity: info.granularity
      });
      const rangeDates = enumerateDates(info.start, info.end);
      const primaryNotePath = notePathForPeriod(info);
      const knownPaths = knownMarkdownPathSet();
      const taskSeries = new Map((snapshot.domains.tasks?.completion?.series || []).map((row) => [row.key, row]));
      const noteSeries = new Map((snapshot.domains.notes?.trend?.series || []).map((row) => [row.key, row]));
      const stateSeries = new Map((snapshot.domains.dailyState?.series || []).map((row) => [row.key, row]));
      const dayGranularity = String(snapshot.granularity || info.granularity || "day") === "day";
      const dailyNotes = [];
      for (const date of rangeDates) {
        const path = dailyNotePathForDate(date);
        if (!path) continue;
        const bucketKey = bucketForDate(date, snapshot.granularity || info.granularity || "day");
        const taskRow = taskSeries.get(bucketKey) || {};
        const noteRow = noteSeries.get(bucketKey) || {};
        const stateRow = stateSeries.get(bucketKey) || {};
        const tasksDone = dayGranularity ? Number(taskRow.done || 0) : 0;
        const tasksOpen = dayGranularity ? Number(taskRow.open || 0) : 0;
        const diaryWords = dayGranularity ? Number(noteRow.words || 0) : 0;
        const notesCreated = dayGranularity ? Number(noteRow.notes || 0) : 0;
        const dailyStateDays = dayGranularity ? Number(stateRow.validDays || 0) : 0;
        dailyNotes.push({
          date,
          path,
          role: "daily-note",
          reason: "within review range",
          exists: await markdownPathExists(path, knownPaths),
          bucketKey,
          bucketGranularity: snapshot.granularity || info.granularity || "day",
          tasksDone,
          tasksOpen,
          tasksPlanned: dayGranularity ? Number(taskRow.planned || 0) : 0,
          diaryWords,
          notesCreated,
          dailyStateRecorded: dailyStateDays > 0,
          dailyStateDays
        });
      }
      const missingDailyNotes = dailyNotes
        .filter((item) => !item.exists)
        .map((item) => ({ date: item.date, path: item.path, reason: "daily-note-not-found" }));
      const taskSourceMap = new Map();
      const collectTaskSource = (item, done) => {
        const path = normalizePath(item?.source?.path || item?.identity?.sourcePath || "");
        if (!path) return;
        const current = taskSourceMap.get(path) || {
          path,
          role: "task-source-note",
          reason: "task evidence within review range",
          tasksDone: 0,
          tasksOpen: 0,
          tasksTotal: 0,
          firstLine: Number(item?.source?.line ?? item?.identity?.line ?? 0) || 0
        };
        if (done) current.tasksDone += 1;
        else current.tasksOpen += 1;
        current.tasksTotal += 1;
        const line = Number(item?.source?.line ?? item?.identity?.line ?? 0) || 0;
        if (!current.firstLine || (line && line < current.firstLine)) current.firstLine = line;
        taskSourceMap.set(path, current);
      };
      (snapshot.domains.tasks?.completion?.completedItems || []).forEach((item) => collectTaskSource(item, true));
      (snapshot.domains.tasks?.completion?.openItems || []).forEach((item) => collectTaskSource(item, false));
      const taskSourceNotes = Array.from(taskSourceMap.values())
        .sort((a, b) => (b.tasksTotal - a.tasksTotal) || a.path.localeCompare(b.path))
        .slice(0, 80);
      const suggestedReadOrder = [];
      [primaryNotePath, ...dailyNotes.map((item) => item.path), ...taskSourceNotes.map((item) => item.path)].forEach((pathText) => {
        if (pathText && !suggestedReadOrder.includes(pathText)) suggestedReadOrder.push(pathText);
      });
      const dailyEvidenceTotals = {
        tasksDone: Number(snapshot.domains.tasks?.completion?.completed || 0),
        tasksOpen: Number(snapshot.domains.tasks?.completion?.open || 0),
        diaryWords: Number(snapshot.domains.notes?.diaryWords?.total || 0),
        notesCreated: Number(snapshot.domains.notes?.trend?.totalCreated || 0),
        dailyStateDays: Number(snapshot.domains.dailyState?.summary?.validDays || 0)
      };
      const primaryNoteExists = await markdownPathExists(primaryNotePath, knownPaths);
      const payload = {
        mode: info.mode,
        period: info.period,
        year: info.year,
        range: { mode: "custom", start: info.start, end: info.end, dayCount: rangeDates.length },
        granularity: info.granularity,
        artifactPath: artifactPathForPeriod(info),
        evidencePath: evidencePathForPeriod(info),
        writeback: {
          targetPath: notePathForPeriod(info),
          sectionHeading: info.mode === "weekly" ? "周复盘" : (info.mode === "monthly" ? "月复盘" : (info.mode === "yearly" ? "年复盘" : "日复盘")),
          headingLevel: 2,
          replacePolicy: "confirm-if-nonempty"
        },
        evidenceHash: hashString(JSON.stringify({ range: snapshot.range, domains: snapshot.domains })),
        snapshot,
        sourceTrace: {
          generatedFrom: "data-service.reviewEvidence",
          periodMode: info.mode,
          period: info.period,
          granularity: info.granularity,
          rangeStart: info.start,
          rangeEnd: info.end,
          dayCount: rangeDates.length,
          primaryNotePath,
          primaryNoteExists,
          dailyNoteCount: dailyNotes.length,
          existingDailyNoteCount: dailyNotes.filter((item) => item.exists).length,
          missingDailyNoteCount: missingDailyNotes.length,
          missingDailyNotes,
          taskSourceNoteCount: taskSourceNotes.length,
          dailyEvidenceTotals,
          suggestedReadOrder,
          snapshotDomains: Object.keys(snapshot.domains || {})
        },
        evidence: {
          primaryNotes: [{ path: primaryNotePath, role: "period-note", reason: "target period note", exists: primaryNoteExists }],
          dailyNotes,
          changedNotes: [],
          taskSourceNotes,
          suggestedReadOrder
        },
        aiGuidance: {
          principles: ["agency-first", "low-burden", "flow-friendly", "metrics-as-evidence-not-judgment", "no-productivity-score"],
          preferredReviewStyle: "concise-actionable-reflection",
          avoid: ["time-tracking pressure", "streak pressure", "productivity scoring", "fabricated causality"]
        }
      };
      return payload;
    }

    function exportEnvelope(kind, payload) {
      return {
        exportKind: `noria.${kind}`,
        exportVersion: EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        noriaVersion: runtimeBridge.pluginVersion || "",
        payload
      };
    }

    function sanitizeForJson(value) {
      const seen = new WeakSet();
      return JSON.parse(JSON.stringify(value, (key, val) => {
        if (val && typeof val === "object") {
          if (seen.has(val)) return undefined;
          seen.add(val);
        }
        return val;
      }));
    }

    async function exportData(request = {}) {
      const kind = String(request.kind || "snapshot");
      let payload;
      if (kind === "tasks") payload = await getTasks(request.request || {});
      else if (kind === "reviewEvidence") payload = await getReviewEvidence(request.request || {});
      else payload = await getSnapshot(request.request || {});
      const envelope = exportEnvelope(kind === "reviewEvidence" ? "reviewEvidence" : kind, sanitizeForJson(payload));
      const outputPath = normalizePath(request.outputPath || payload.evidencePath || `${snapshotCacheRoot}/${formatDate(new Date()).replace(/-/g, "")}.json`);
      if (outputPath) await writeText(outputPath, `${JSON.stringify(envelope, null, 2)}\n`);
      return envelope;
    }

    function invalidate() {
      const cache = getCacheStore();
      clearCacheStore(cache, { bumpToken: true });
    }

    return {
      resolveRange: (request) => resolveRange(request, { now, bridge: runtimeBridge }),
      getSnapshot,
      getTasks,
      getPeriods,
      getReviewEvidence,
      export: exportData,
      invalidate,
      parseTaskCompletionDate,
      parseTaskPlanDate
    };
  }

  root.data.dataService = {
    createDataService,
    resolveRange,
    parseTaskCompletionDate,
    parseTaskPlanDate,
    enumerateDates,
    bucketForDate,
    PRESETS,
    DOMAIN_REGISTRY
  };
})();
