let {
  preset,
  pages,
  view,
  firstDayOfWeek,
  dailyNoteFormat,
  startPosition,
  options,
  css,
  cssSourcePath,
  noriaPluginTabRole
} = input || {};

const DEFAULT_RUNTIME_VIEW_PATH = ".obsidian/plugins/noria/views/tasks-calendar/runtime";
const DEFAULT_RUNTIME_CSS_PATH = ".obsidian/plugins/noria/views/tasks-calendar/default.css";

function readRuntimeBridgeConfig() {
  try {
    if (globalThis.__noriaRuntimeBridge && typeof globalThis.__noriaRuntimeBridge === "object") {
      return globalThis.__noriaRuntimeBridge;
    }
    const plugin = app?.plugins?.plugins?.["noria"];
    if (plugin && typeof plugin.buildRuntimeBridgeConfig === "function") {
      return plugin.buildRuntimeBridgeConfig();
    }
    return plugin?.settings || {};
  } catch (_) {
    return {};
  }
}

function normalizeNoriaPath(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  return s;
}

const bridgeConfig = readRuntimeBridgeConfig();
const bridgeRuntimePaths = bridgeConfig.runtimePaths || {};
function normalizeRootPath(raw, fallback = "06_Diary") {
  const normalized = String(raw || fallback || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  return normalized || fallback;
}
function quoteNoriaSourcePath(path) {
  return `"${String(path || "").replace(/\\/g, "/").replace(/"/g, '\\"')}"`;
}
function isUnderVaultRoot(filePath, rootPath) {
  const p = String(filePath || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const root = normalizeRootPath(rootPath);
  return p === root || p.startsWith(`${root}/`);
}
function yearSegmentUnderRoot(filePath, rootPath) {
  const p = String(filePath || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const root = normalizeRootPath(rootPath);
  const prefix = `${root}/`;
  if (!p.startsWith(prefix)) return "";
  const first = p.slice(prefix.length).split("/").filter(Boolean)[0] || "";
  return /^\d{4}$/.test(first) ? first : "";
}
const configuredDiaryRoot = normalizeRootPath(
  bridgeConfig?.paths?.diaryRoot || bridgeConfig?.settings?.managedPaths?.diaryRoot || "06_Diary"
);
const currentFilePathForEmbed = String(ctx.current()?.file?.path || "").replace(/\\/g, "/");
const suppressPeriodicEmbeddedBoard =
  isUnderVaultRoot(currentFilePathForEmbed, configuredDiaryRoot) &&
  ["weekly", "monthly", "yearly"].includes(String(preset || "").toLowerCase()) &&
  !noriaPluginTabRole &&
  !input?.statsItemView;
if (suppressPeriodicEmbeddedBoard) {
  return;
}

function normalizeRuntimeViewPath(rawPath) {
  const normalized = normalizeNoriaPath(rawPath);
  if (!normalized) return "";
  if (/\/runtime(?:-v\d+)?$/i.test(normalized)) {
    return normalized.replace(/\/runtime(?:-v\d+)?$/i, "/runtime");
  }
  return normalized;
}

async function loadCustomViewText(path) {
  try {
    const txt = await ctx.io.load(path);
    if (txt) return String(txt);
  } catch (_) {}
  try {
    const normalized = String(path || "").replace(/\\/g, "/").replace(/^\/+/, "");
    return String(await app.vault.adapter.read(normalized) || "");
  } catch (_) {
    return "";
  }
}

async function loadCustomViewSource(viewPath) {
  const normalized = String(viewPath || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (!normalized) throw new Error("empty custom view path");
  const candidates = normalized.toLowerCase().endsWith(".js")
    ? [normalized]
    : [`${normalized}.js`, `${normalized}/view.js`];
  let sourceCode = "";
  let sourcePath = candidates[0];
  for (const candidate of candidates) {
    sourceCode = await loadCustomViewText(candidate);
    if (sourceCode) {
      sourcePath = candidate;
      break;
    }
  }
  if (!sourceCode) {
    throw new Error(`自定义视图加载失败：${normalized}`);
  }
  return { sourceCode, sourcePath };
}

async function runCustomViewSource(viewSource, viewInput) {
  const sourceCode = String(viewSource?.sourceCode || "");
  const sourcePath = String(viewSource?.sourcePath || "");
  if (!sourceCode) {
    throw new Error(`自定义视图加载失败：${sourcePath || "unknown"}`);
  }
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const run = new AsyncFunction("ctx", "input", "app", "moment", "window", "document", "globalThis", String(sourceCode));
  await run(ctx, viewInput || {}, app, window.moment, window, document, globalThis);
  return sourcePath;
}

async function runCustomViewByPath(viewPath, viewInput) {
  return await runCustomViewSource(await loadCustomViewSource(viewPath), viewInput);
}

const resolvedRuntimeViewPath = normalizeRuntimeViewPath(bridgeRuntimePaths.tasksCalendarRuntimePath) || DEFAULT_RUNTIME_VIEW_PATH;
const resolvedBridgeCssPath = cssSourcePath || normalizeNoriaPath(bridgeRuntimePaths.tasksCalendarCssPath) || DEFAULT_RUNTIME_CSS_PATH;

const BASE_PRESET_DEFAULTS = {
  pages: quoteNoriaSourcePath(configuredDiaryRoot),
  firstDayOfWeek: "0",
  dailyNoteFormat: "YYYY-MM-DD",
  options: "planner-chrome noFilename lineClamp1 noWeekNr noLayer"
};

const PRESET_DEFAULTS = {
  board: {
    ...BASE_PRESET_DEFAULTS,
    view: "week",
    cssSourcePath: DEFAULT_RUNTIME_CSS_PATH
  },
  weekly: {
    ...BASE_PRESET_DEFAULTS,
    view: "week"
  },
  monthly: {
    ...BASE_PRESET_DEFAULTS,
    view: "month"
  }
};

function inferStartPositionFromCurrentFile(targetView) {
  const current = ctx.current();
  const file = current?.file;
  const fileName = String(file?.name || "").replace(".md", "");
  const filePath = String(file?.path || "");

  if (targetView === "week") {
    const yearFromPath = yearSegmentUnderRoot(filePath, configuredDiaryRoot);
    const weekMatch = fileName.match(/^(\d{4})-W(\d{1,2})$/i);
    const year = weekMatch ? weekMatch[1] : yearFromPath;
    const week = weekMatch ? String(Number(weekMatch[2])).padStart(2, "0") : "";
    return year && week ? `${year}-${week}` : "";
  }

  if (targetView === "month") {
    const monthMatch = fileName.match(/^(\d{4})-(\d{2})$/);
    return monthMatch ? `${monthMatch[1]}-${monthMatch[2]}` : "";
  }

  return "";
}

async function loadCssText(path) {
  let content = "";
  try {
    content = await ctx.io.load(path);
  } catch (_) {
    content = "";
  }
  if (!content) {
    const normalized = String(path || "").replace(/\\/g, "/").replace(/^\/+/, "");
    try {
      content = await app.vault.adapter.read(normalized);
    } catch (_) {
      content = "";
    }
  }
  const raw = String(content || "");
  if (path.endsWith(".css")) return raw;
  const match = raw.match(/const\s+customCss\s*=\s*`([\s\S]*?)`;\s*await\s+ctx\.view/s)
    || raw.match(/const\s+customCss\s*=\s*`([\s\S]*?)`;/s);
  return match ? match[1] : raw;
}

const presetKey = String(preset || "").trim();
const presetDefaults = PRESET_DEFAULTS[presetKey] || {};

const resolvedView = view || presetDefaults.view || "week";
const resolvedPages = pages || presetDefaults.pages || '"06_Diary"';
const resolvedFirstDayOfWeek = firstDayOfWeek || presetDefaults.firstDayOfWeek || "0";
const resolvedDailyNoteFormat = dailyNoteFormat || presetDefaults.dailyNoteFormat || "YYYY-MM-DD";
const resolvedOptions = options || presetDefaults.options || "planner-chrome noFilename lineClamp1 noWeekNr noLayer";
const resolvedCssSourcePath = cssSourcePath || presetDefaults.cssSourcePath || resolvedBridgeCssPath;

let resolvedStartPosition = startPosition || inferStartPositionFromCurrentFile(resolvedView);
let resolvedCss = "";

const runtimeViewSourcePromise = loadCustomViewSource(resolvedRuntimeViewPath)
  .catch((error) => ({ error }));
const cssTextPromise = (async () => {
  if (css) return String(css || "");
  try {
    return await loadCssText(resolvedCssSourcePath);
  } catch (_) {
    try {
      return await loadCssText(DEFAULT_RUNTIME_CSS_PATH);
    } catch (_) {
      return "";
    }
  }
})();

const [runtimeViewSourceResult, cssTextResult] = await Promise.all([
  runtimeViewSourcePromise,
  cssTextPromise
]);
resolvedCss = String(cssTextResult || "");

const payload = {
  pages: resolvedPages,
  view: resolvedView,
  firstDayOfWeek: resolvedFirstDayOfWeek,
  dailyNoteFormat: resolvedDailyNoteFormat,
  options: resolvedOptions,
  noriaBridge: bridgeConfig
};

if (noriaPluginTabRole) payload.noriaPluginTabRole = noriaPluginTabRole;
if (resolvedStartPosition) payload.startPosition = resolvedStartPosition;
if (!payload.timelineConfigPath && bridgeConfig.timelineSettingsPath) payload.timelineConfigPath = normalizeNoriaPath(bridgeConfig.timelineSettingsPath);
if (!payload.templateLibraryPath && bridgeConfig.templateLibraryPath) payload.templateLibraryPath = normalizeNoriaPath(bridgeConfig.templateLibraryPath);
if (resolvedCss) payload.css = resolvedCss;

try {
  if (runtimeViewSourceResult?.error) throw runtimeViewSourceResult.error;
  await runCustomViewSource(runtimeViewSourceResult, payload);
} catch (err) {
  // Fallback for stale bridge paths / cache inconsistencies.
  if (resolvedRuntimeViewPath !== DEFAULT_RUNTIME_VIEW_PATH) {
    await runCustomViewByPath(DEFAULT_RUNTIME_VIEW_PATH, payload);
  } else {
    throw err;
  }
}
