const coreFiles = [
  ".obsidian/plugins/noria/views/dashboard/core/theme/dashboard-theme.js",
  ".obsidian/plugins/noria/views/dashboard/core/utils/date-range.js",
  ".obsidian/plugins/noria/views/dashboard/core/utils/formatters.js",
  ".obsidian/plugins/noria/views/dashboard/core/utils/habit-parsing.js",
  ".obsidian/plugins/noria/views/dashboard/core/utils/task-display.js",
  ".obsidian/plugins/noria/views/dashboard/core/utils/chart-adapter.js",
  ".obsidian/plugins/noria/views/dashboard/core/data/data-service.js",
  ".obsidian/plugins/noria/views/dashboard/core/components/cards/metric-chips.js",
  ".obsidian/plugins/noria/views/dashboard/core/components/charts/chart-palette.js",
  ".obsidian/plugins/noria/views/dashboard/core/components/charts/dual-axis-svg-chart.js",
  ".obsidian/plugins/noria/views/dashboard/core/components/charts/strip-heat-series.js",
  ".obsidian/plugins/noria/views/dashboard/core/components/charts/stacked-distribution-bar.js",
  ".obsidian/plugins/noria/views/dashboard/core/components/charts/year-heatmap-calendar.js",
  ".obsidian/plugins/noria/views/dashboard/core/components/boards/workload-week-rings.js"
];

const statsRuntimeBuildId = String(
  input?.noriaBridge?.runtimeBuildId ||
  globalThis.__noriaRuntimeBridge?.runtimeBuildId ||
  globalThis.__noriaRuntimeBuildId ||
  ""
);

async function loadText(path) {
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

async function runCustomViewByPath(viewPath, viewInput) {
  const normalized = String(viewPath || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (!normalized) throw new Error("empty custom view path");
  const candidates = normalized.toLowerCase().endsWith(".js")
    ? [normalized]
    : [`${normalized}.js`, `${normalized}/view.js`];
  let sourceCode = "";
  for (const candidate of candidates) {
    sourceCode = await loadText(candidate);
    if (sourceCode) break;
  }
  if (!sourceCode) throw new Error(`自定义视图加载失败：${normalized}`);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const cache = (() => {
    try {
      const key = "__noria_periodic_stats_view_run_cache_v1";
      const buildKey = "__noria_periodic_stats_view_run_cache_build_v1";
      if (globalThis[buildKey] !== statsRuntimeBuildId) {
        globalThis[key] = new Map();
        globalThis[buildKey] = statsRuntimeBuildId;
      }
      if (!globalThis[key]) globalThis[key] = new Map();
      return globalThis[key];
    } catch (_) {
      return null;
    }
  })();
  const cacheKey = `${normalized}:${sourceCode.length}:${sourceCode.slice(0, 96)}`;
  let run = cache?.get?.(cacheKey);
  if (!run) {
    run = new AsyncFunction("ctx", "input", "app", "moment", "window", "document", "globalThis", String(sourceCode));
    cache?.set?.(cacheKey, run);
  }
  await run(ctx, viewInput || {}, app, window.moment, window, document, globalThis);
}

async function ensureCoreLoaded() {
  const state = (() => {
    try {
      const key = "__noria_periodic_stats_core_boot_v1";
      const buildKey = "__noria_periodic_stats_core_boot_build_v1";
      if (globalThis[buildKey] !== statsRuntimeBuildId) {
        globalThis[key] = { loaded: new Set() };
        globalThis[buildKey] = statsRuntimeBuildId;
      }
      if (!globalThis[key]) globalThis[key] = { loaded: new Set() };
      return globalThis[key];
    } catch (_) {
      return { loaded: new Set() };
    }
  })();
  const missingCoreFiles = coreFiles.filter((filePath) => !state.loaded.has(filePath));
  const missingCoreSources = await Promise.all(missingCoreFiles.map(async (filePath) => {
    try {
      return { filePath, code: await loadText(filePath) };
    } catch (_) {
      return { filePath, code: "" };
    }
  }));
  for (const item of missingCoreSources) {
    try {
      const filePath = item?.filePath;
      const code = item?.code;
      if (!filePath || state.loaded.has(filePath)) continue;
      if (code) {
        (0, eval)(String(code));
        state.loaded.add(filePath);
      }
    } catch (_) {
      // Keep rendering path resilient; fallback handled below.
    }
  }
}

await ensureCoreLoaded();
const statsBridge = input?.noriaBridge || globalThis.__noriaRuntimeBridge || {};
const statsT = (key, params = {}) => {
  try {
    if (statsBridge && typeof statsBridge.t === "function") return statsBridge.t(key, params);
    const messages = statsBridge?.i18n?.messages || {};
    const fallback = statsBridge?.i18n?.fallback || {};
    let template = messages[key] || fallback[key] || key;
    Object.entries(params || {}).forEach(([k, v]) => {
      template = String(template).replace(new RegExp(`\\{${k}\\}`, "g"), String(v ?? ""));
    });
    return String(template);
  } catch (_) {
    return String(key || "");
  }
};

// Real implementation entry in dashboard namespace.
// Legacy logic has been migrated to impl-legacy under this folder.
try {
  await runCustomViewByPath(".obsidian/plugins/noria/views/dashboard/periodic-stats/impl-legacy", input || {});
} catch (err) {
  const mount = input?.mount || ctx.container;
  const box = mount?.createDiv?.() || ctx.el("div", "");
  box.style.cssText = "padding:10px 12px;border-radius:10px;border:1px solid rgba(239,68,68,.28);background:rgba(254,242,242,.8);color:#7f1d1d;";
  box.textContent = statsT("runtime.stats.loadFailed", { message: String(err?.message || err) });
}
