let {
  pages,
  dailyNoteFormat,
  noriaBridge,
  timelineAnnotations,
  timelineTraces,
  timelineFilter,
  timelineSettings,
  onTimelineManualScaleState,
  onTimelineFocusTodayReady,
  isTimelineRuntimeCurrent
} = (typeof input !== "undefined" && input) || {};

const TASK_TIMELINE_SHELL_CSS_PATH = ".obsidian/plugins/noria/views/task-timeline/shell.css";
const TASK_TIMELINE_EVENT_MODEL_PATH = ".obsidian/plugins/noria/views/task-timeline/event-model.js";
const TASK_TIMELINE_TASK_ADAPTER_PATH = ".obsidian/plugins/noria/views/task-timeline/task-adapter.js";
const TASK_TIMELINE_TASK_EDIT_PATH = ".obsidian/plugins/noria/views/task-timeline/task-edit.js";
const TASK_TIMELINE_ANNOTATION_PROVIDER_PATH = ".obsidian/plugins/noria/views/task-timeline/annotation-provider.js";
const TASK_TIMELINE_POMODORO_PROVIDER_PATH = ".obsidian/plugins/noria/views/task-timeline/pomodoro-provider.js";
const TASK_TIMELINE_TRACE_PROVIDER_PATH = ".obsidian/plugins/noria/views/task-timeline/trace-provider.js";
const TASK_TIMELINE_ENGINE_CONTRACT_PATH = ".obsidian/plugins/noria/views/task-timeline/engine-contract.js";
const TASK_TIMELINE_NATIVE_VIEWPORT_PATH = ".obsidian/plugins/noria/views/task-timeline/native-viewport.js";
const TASK_TIMELINE_NATIVE_EVENT_INDEX_PATH = ".obsidian/plugins/noria/views/task-timeline/native-event-index.js";
const TASK_TIMELINE_NATIVE_OVERVIEW_PATH = ".obsidian/plugins/noria/views/task-timeline/native-overview.js";
const TASK_TIMELINE_NATIVE_LAYOUT_PATH = ".obsidian/plugins/noria/views/task-timeline/native-layout.js";
const TASK_TIMELINE_NATIVE_RENDERER_PATH = ".obsidian/plugins/noria/views/task-timeline/native-renderer.js";
const TASK_TIMELINE_NATIVE_INTERACTIONS_PATH = ".obsidian/plugins/noria/views/task-timeline/native-interactions.js";
const TASK_TIMELINE_NATIVE_BACKEND_PATH = ".obsidian/plugins/noria/views/task-timeline/native-backend.js";
const TASK_TIMELINE_NATIVE_CSS_PATH = ".obsidian/plugins/noria/views/task-timeline/native.css";
const TASK_TIMELINE_SHELL_STYLE_ID = "noria-task-timeline-shell-style";
const TASK_TIMELINE_NATIVE_STYLE_ID = "noria-task-timeline-native-style";
const TASK_TIMELINE_ANNOTATION_COLORS = ["#f6c77a", "#8ab4f8", "#86efac", "#c4b5fd", "#fb923c", "#94a3b8"];

const taskTimelineBridge = noriaBridge && typeof noriaBridge === "object" ? noriaBridge : {};
const taskTimelinePages = pages == null ? "" : String(pages);
const taskTimelineDailyNoteFormat = dailyNoteFormat || "YYYY-MM-DD";
const taskTimelineSettingsInput = timelineSettings || taskTimelineBridge.timelineViewSettings || taskTimelineBridge.timelineView || {};
const taskTimelineBuildId = String(
  taskTimelineBridge.runtimeBuildId ||
  globalThis.__noriaRuntimeBuildId ||
  globalThis.__noriaRuntimeBridge?.runtimeBuildId ||
  "dev"
);

function taskTimelineRuntimeLocale() {
  return String(
    taskTimelineBridge.locale ||
    taskTimelineBridge.i18n?.locale ||
    "en"
  ).trim() || "en";
}

function taskTimelineRuntimeMessage(key, fallback) {
  const message = taskTimelineBridge.i18n?.messages?.[key];
  if (message != null && String(message).trim()) return String(message);
  const fallbackMessage = taskTimelineBridge.i18n?.fallback?.[key];
  return fallbackMessage != null && String(fallbackMessage).trim()
    ? String(fallbackMessage)
    : String(fallback || "");
}

function taskTimelinePerfNow() {
  try {
    if (globalThis.performance && typeof globalThis.performance.now === "function") return globalThis.performance.now();
  } catch (_) {}
  return Date.now();
}

function taskTimelineRoundMs(value) {
  return Math.max(0, Math.round(Number(value || 0) * 10) / 10);
}

function taskTimelineCreate(parent, tag, options = {}) {
  if (parent && typeof parent.createEl === "function") return parent.createEl(tag, options);
  const node = document.createElement(tag);
  if (options.cls) node.className = String(options.cls);
  if (options.text != null) node.textContent = String(options.text);
  Object.entries(options.attr || {}).forEach(([key, value]) => node.setAttribute(key, String(value)));
  parent?.appendChild?.(node);
  return node;
}

function taskTimelineCleanupExisting(root) {
  if (!root || typeof root.querySelectorAll !== "function") return;
  const selector = ".noria-task-timeline-surface";
  const nodes = Array.from(root.querySelectorAll(selector));
  if (typeof root.matches === "function" && root.matches(selector)) nodes.unshift(root);
  const seen = new Set();
  nodes.forEach((node) => {
    if (!node || seen.has(node)) return;
    seen.add(node);
    const cleanup = node.__noriaTaskTimelineCleanup;
    if (typeof cleanup === "function") {
      try { cleanup(); } catch (_) {}
    }
    node.__noriaTaskTimelineCleanup = null;
  });
}

function taskTimelineRunIsCurrent() {
  if (typeof isTimelineRuntimeCurrent !== "function") return true;
  try { return isTimelineRuntimeCurrent() !== false; } catch (_) { return false; }
}

function taskTimelineSourceCache() {
  try {
    if (globalThis.__noriaTaskTimelineSourceCacheBuildId !== taskTimelineBuildId) {
      globalThis.__noriaTaskTimelineSourceCache = new Map();
      globalThis.__noriaTaskTimelineSourceCacheBuildId = taskTimelineBuildId;
    }
    if (!(globalThis.__noriaTaskTimelineSourceCache instanceof Map)) {
      globalThis.__noriaTaskTimelineSourceCache = new Map();
    }
    return globalThis.__noriaTaskTimelineSourceCache;
  } catch (_) {
    return null;
  }
}

async function taskTimelineLoadText(path) {
  const normalized = String(path || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const cache = taskTimelineSourceCache();
  if (cache?.has(normalized)) return cache.get(normalized);
  let value = "";
  try { value = String(await ctx.io.load(normalized) || ""); } catch (_) {}
  if (!value) {
    try { value = String(await app.vault.adapter.read(normalized) || ""); } catch (_) {}
  }
  cache?.set(normalized, value);
  return value;
}

async function taskTimelineEnsureStyle(styleId, path) {
  if (!document?.head) return;
  let style = document.getElementById(styleId);
  if (style?.getAttribute("data-build-id") === taskTimelineBuildId) return;
  const css = await taskTimelineLoadText(path);
  if (!css) throw new Error(`Noria task timeline style missing: ${path}`);
  if (!style) {
    style = document.createElement("style");
    style.id = styleId;
    document.head.appendChild(style);
  }
  style.setAttribute("data-build-id", taskTimelineBuildId);
  style.textContent = css;
}

function taskTimelineRunModuleOnce(id, code) {
  const registry = globalThis.__noriaTaskTimelineModules && typeof globalThis.__noriaTaskTimelineModules === "object"
    ? globalThis.__noriaTaskTimelineModules
    : {};
  globalThis.__noriaTaskTimelineModules = registry;
  const signature = `${taskTimelineBuildId}:${String(code || "").length}`;
  if (registry[id] === signature) return;
  const run = new Function("globalThis", String(code || ""));
  run(globalThis);
  registry[id] = signature;
}

function taskTimelineRequireModule(key, method) {
  const module = globalThis.noriaTaskTimeline?.[key];
  if (!module || typeof module[method] !== "function") {
    throw new Error(`Noria task timeline module did not expose ${key}.${method}`);
  }
  return module;
}

async function taskTimelineEnsureRuntime(options = {}) {
  const sharedSpecs = [
    ["event-model", TASK_TIMELINE_EVENT_MODEL_PATH],
    ["task-adapter", TASK_TIMELINE_TASK_ADAPTER_PATH],
    ["task-edit", TASK_TIMELINE_TASK_EDIT_PATH],
    ["annotation-provider", TASK_TIMELINE_ANNOTATION_PROVIDER_PATH],
    options.pomodoroLayerActive ? ["pomodoro-provider", TASK_TIMELINE_POMODORO_PROVIDER_PATH] : null,
    ["trace-provider", TASK_TIMELINE_TRACE_PROVIDER_PATH]
  ].filter(Boolean);
  const nativeSpecs = [
    ["engine-contract", TASK_TIMELINE_ENGINE_CONTRACT_PATH],
    ["native-viewport", TASK_TIMELINE_NATIVE_VIEWPORT_PATH],
    ["native-event-index", TASK_TIMELINE_NATIVE_EVENT_INDEX_PATH],
    ["native-overview", TASK_TIMELINE_NATIVE_OVERVIEW_PATH],
    ["native-layout", TASK_TIMELINE_NATIVE_LAYOUT_PATH],
    ["native-renderer", TASK_TIMELINE_NATIVE_RENDERER_PATH],
    ["native-interactions", TASK_TIMELINE_NATIVE_INTERACTIONS_PATH],
    ["native-backend", TASK_TIMELINE_NATIVE_BACKEND_PATH]
  ];
  const specs = [...sharedSpecs, ...nativeSpecs];
  const codes = await Promise.all(specs.map(([, path]) => taskTimelineLoadText(path)));
  specs.forEach(([id, path], index) => {
    if (!codes[index]) throw new Error(`Noria task timeline module missing: ${path}`);
    taskTimelineRunModuleOnce(id, codes[index]);
  });
  await Promise.all([
    taskTimelineEnsureStyle(TASK_TIMELINE_SHELL_STYLE_ID, TASK_TIMELINE_SHELL_CSS_PATH),
    taskTimelineEnsureStyle(TASK_TIMELINE_NATIVE_STYLE_ID, TASK_TIMELINE_NATIVE_CSS_PATH)
  ]);
  const engine = globalThis.noriaTaskTimeline?.engine;
  if (!engine || typeof engine.mountTimelineBackend !== "function" || !engine.getTimelineBackend?.("native")) {
    throw new Error("Noria native task timeline backend is unavailable");
  }
  return {
    engine,
    eventModel: taskTimelineRequireModule("eventModel", "collectProviderEvents"),
    adapter: taskTimelineRequireModule("taskAdapter", "tasksToTimelineEvents"),
    taskEdit: taskTimelineRequireModule("taskEdit", "buildDraggedTaskLine"),
    annotationProvider: taskTimelineRequireModule("annotationProvider", "annotationsToTimelineEvents"),
    pomodoroProvider: options.pomodoroLayerActive
      ? taskTimelineRequireModule("pomodoroProvider", "pomodoroStateToTimelineEvents")
      : null,
    traceProvider: taskTimelineRequireModule("traceProvider", "timelineTracesToEvents")
  };
}

function taskTimelineRows(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw.array === "function") {
    try { return Array.from(raw.array() || []); } catch (_) { return []; }
  }
  if (typeof raw.values === "function") {
    try { return Array.from(raw.values() || []); } catch (_) {}
  }
  if (typeof raw[Symbol.iterator] === "function") {
    try { return Array.from(raw); } catch (_) {}
  }
  return [];
}

function taskTimelineTodayYmd() {
  const date = new Date();
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

async function taskTimelineCollectFreshTasks() {
  if (typeof taskTimelineBridge.data?.getTasks !== "function") return { items: [], performance: {} };
  const anchor = taskTimelineTodayYmd();
  try {
    const result = await taskTimelineBridge.data.getTasks({
      range: { mode: "custom", start: anchor, end: anchor },
      includeDone: true,
      status: "all",
      rangePolicy: "allFacts",
      source: { pages: taskTimelinePages }
    });
    return {
      items: Array.isArray(result?.items) ? result.items : [],
      performance: result?.meta?.performance && typeof result.meta.performance === "object" ? result.meta.performance : {}
    };
  } catch (error) {
    try { console.warn("[noria taskTimeline] fresh task source failed", error); } catch (_) {}
    return { items: [], performance: {} };
  }
}

function taskTimelinePagesFromSpec(spec) {
  if (spec === "") return taskTimelineRows(taskTimelineBridge.runtime?.pagesForScope?.("tasks", ctx));
  const source = String(spec || "").trim().replace(/;+\s*$/, "");
  const expression = source.match(/^ctx\.pages\s*\(\s*(["'])([\s\S]*?)\1\s*\)\s*(?:\.file\.tasks)?\s*$/);
  const query = expression ? String(expression[2] || "").replace(/\\(["'\\])/g, "$1") : spec;
  try { return taskTimelineRows(ctx.pages(query)); } catch (_) { return []; }
}

function taskTimelineCollectFallbackTasks() {
  const pagesResult = taskTimelinePagesFromSpec(taskTimelinePages);
  const direct = taskTimelineRows(pagesResult?.file?.tasks);
  if (direct.length) return direct;
  const tasks = [];
  pagesResult.forEach((page) => tasks.push(...taskTimelineRows(page?.file?.tasks)));
  return tasks;
}

async function taskTimelineCollectAnnotations() {
  const direct = taskTimelineRows(timelineAnnotations);
  if (direct.length) return direct;
  const bridgeItems = taskTimelineRows(taskTimelineBridge.timeline?.annotations || taskTimelineBridge.timelineAnnotations);
  if (bridgeItems.length) return bridgeItems;
  try {
    if (typeof taskTimelineBridge.data?.getTimelineAnnotations === "function") {
      return taskTimelineRows(await taskTimelineBridge.data.getTimelineAnnotations());
    }
  } catch (_) {}
  return [];
}

async function taskTimelineCollectPomodoro() {
  if (taskTimelineBridge.pomodoroEnabled === false) return null;
  try {
    if (typeof taskTimelineBridge.getPomodoroState === "function") return await taskTimelineBridge.getPomodoroState();
  } catch (_) {}
  return taskTimelineBridge.pomodoro || globalThis.__noriaRuntimeBridge?.pomodoro || null;
}

async function taskTimelineCollectTraces(events) {
  if (timelineTraces && typeof timelineTraces === "object") return timelineTraces;
  if (taskTimelineBridge.timeline?.traces && typeof taskTimelineBridge.timeline.traces === "object") {
    return taskTimelineBridge.timeline.traces;
  }
  try {
    if (typeof taskTimelineBridge.data?.getTimelineTraces === "function") {
      const starts = (events || []).map((event) => Date.parse(event?.start)).filter(Number.isFinite);
      const ends = (events || []).map((event) => Date.parse(event?.end || event?.start)).filter(Number.isFinite);
      return await taskTimelineBridge.data.getTimelineTraces({
        range: {
          start: starts.length ? new Date(Math.min(...starts)).toISOString() : "",
          end: ends.length ? new Date(Math.max(...ends)).toISOString() : ""
        },
        source: { pages: taskTimelinePages }
      });
    }
  } catch (error) {
    try { console.warn("[noria taskTimeline] trace provider failed", error); } catch (_) {}
  }
  return {};
}

function taskTimelineNormalizeTagList(raw) {
  const source = Array.isArray(raw) ? raw : String(raw || "").split(/[\s,]+/);
  const out = [];
  source.forEach((item) => {
    let tag = String(item || "").trim();
    if (!tag) return;
    if (!tag.startsWith("#")) tag = `#${tag.replace(/^#+/, "")}`;
    if (!out.some((value) => value.toLowerCase() === tag.toLowerCase())) out.push(tag);
  });
  return out;
}

function taskTimelineNormalizeFilter(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const layerInput = Array.isArray(source.layers)
    ? source.layers
    : String(source.layers || source.layer || "task annotation").split(/[\s,]+/);
  const layers = layerInput.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean);
  return {
    layers: layers.length ? Array.from(new Set(layers)) : ["task", "annotation"],
    showDone: source.showDone !== false,
    query: String(source.query || source.text || "").trim(),
    includeTags: taskTimelineNormalizeTagList(source.includeTags || source.tags),
    excludeTags: taskTimelineNormalizeTagList(source.excludeTags),
    markMode: source.markMode === true,
    scaleMode: ["auto", "today", "manual"].includes(String(source.scaleMode || "").toLowerCase())
      ? String(source.scaleMode).toLowerCase()
      : "auto",
    manualCenter: String(source.manualCenter || source.manualCenterIso || source.center || "").trim(),
    manualZoomIndex: Number.isFinite(Number(source.manualZoomIndex)) ? Math.round(Number(source.manualZoomIndex)) : null,
    manualOverviewZoomIndex: Number.isFinite(Number(source.manualOverviewZoomIndex))
      ? Math.round(Number(source.manualOverviewZoomIndex))
      : null
  };
}

function taskTimelineFilterQuery(state) {
  return {
    layers: state.layers,
    excludeStatus: state.showDone ? [] : ["done"],
    tags: state.includeTags,
    excludeTags: state.excludeTags,
    text: state.query
  };
}

function taskTimelineEventNoria(event) {
  if (event?.noria && typeof event.noria === "object") return event.noria;
  if (event?.payload?.noria && typeof event.payload.noria === "object") return event.payload.noria;
  return {};
}

function taskTimelineEventPath(event) {
  const noria = taskTimelineEventNoria(event);
  return String(event?.source?.path || noria.path || noria.source?.path || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function taskTimelineEventLine(event) {
  const noria = taskTimelineEventNoria(event);
  const value = Number(event?.source?.line != null ? event.source.line : noria.line);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : -1;
}

function taskTimelineEventRawLine(event) {
  const noria = taskTimelineEventNoria(event);
  const task = noria.task || event?.payload?.task || {};
  return String(task.rawLine || task.lineText || task.text || task.visual || event?.title || "");
}

function taskTimelineNormalizeTaskLine(line) {
  return String(line || "")
    .replace(/^\s*[-*]\s*\[[^\]]*\]\s*/, "")
    .replace(/\s*\[[a-zA-Z_][a-zA-Z0-9_-]*::\s*[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function taskTimelineFindLine(lines, event) {
  const hint = taskTimelineEventLine(event);
  if (hint >= 0 && hint < lines.length && /^\s*[-*]\s*\[[^\]]*\]/.test(lines[hint])) return hint;
  const wanted = taskTimelineNormalizeTaskLine(taskTimelineEventRawLine(event));
  if (!wanted) return -1;
  return lines.findIndex((line) => /^\s*[-*]\s*\[[^\]]*\]/.test(line) && taskTimelineNormalizeTaskLine(line).includes(wanted));
}

function taskTimelinePickMarkdownLeaf() {
  try { return app?.workspace?.getLeaf?.("tab") || app?.workspace?.getLeaf?.(false) || null; } catch (_) { return null; }
}

function taskTimelineWaitForEditorReady(leaf, timeoutMs = 96) {
  return new Promise((resolve) => {
    let settled = false;
    let frameId = null;
    let pollId = null;
    let timeoutId = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timeoutId != null) clearTimeout(timeoutId);
      if (pollId != null) clearTimeout(pollId);
      if (frameId != null && typeof cancelAnimationFrame === "function") {
        try { cancelAnimationFrame(frameId); } catch (_) {}
      }
      resolve(leaf?.view?.editor || null);
    };
    const probe = () => {
      if (leaf?.view?.editor) {
        finish();
        return;
      }
      if (typeof requestAnimationFrame === "function") {
        try {
          frameId = requestAnimationFrame(probe);
          return;
        } catch (_) {}
      }
      pollId = setTimeout(probe, 16);
    };
    timeoutId = setTimeout(finish, Math.max(16, Number(timeoutMs || 0)));
    if (typeof requestAnimationFrame === "function") {
      try {
        frameId = requestAnimationFrame(probe);
        return;
      } catch (_) {}
    }
    pollId = setTimeout(probe, 0);
  });
}

async function taskTimelineOpenSource(event) {
  const path = taskTimelineEventPath(event);
  const file = path ? app?.vault?.getAbstractFileByPath?.(path) : null;
  const leaf = file?.extension === "md" ? taskTimelinePickMarkdownLeaf() : null;
  if (!leaf?.openFile) return false;
  await leaf.openFile(file, { active: true });
  const line = Math.max(0, taskTimelineEventLine(event));
  await taskTimelineWaitForEditorReady(leaf);
  try { leaf.view?.setEphemeralState?.({ line }); } catch (_) {}
  try {
    leaf.view?.editor?.setCursor?.({ line, ch: 0 });
    leaf.view?.editor?.scrollIntoView?.({ from: { line, ch: 0 }, to: { line, ch: 0 } }, true);
  } catch (_) {}
  return true;
}

function taskTimelineNotifyFailure(message) {
  try { taskTimelineBridge.runtime?.notice?.("runtime.timeline.taskActionFailed", { message: String(message || "") }, 2600); } catch (_) {}
}

async function taskTimelineCommitDrag(taskEdit, payload) {
  const event = payload?.event;
  const path = taskTimelineEventPath(event);
  const file = path ? app?.vault?.getAbstractFileByPath?.(path) : null;
  if (!file || file.extension !== "md") return false;
  let outcome = "unchanged";
  let fallbackText = "";
  const applyDrag = (current) => {
    const source = String(current || "");
    const lines = source.split(/\r?\n/);
    const index = taskTimelineFindLine(lines, event);
    if (index < 0) {
      outcome = "missing";
      return source;
    }
    const oldLine = String(lines[index] || "");
    const snapshot = taskTimelineEventRawLine(event);
    if (/^\s*[-*]\s*\[[^\]]*\]/.test(snapshot) && snapshot.replace(/\s+/g, " ").trim() !== oldLine.replace(/\s+/g, " ").trim()) {
      outcome = "conflict";
      return source;
    }
    const compatibleEvent = { ...event, noria: taskTimelineEventNoria(event) };
    const nextLine = taskEdit.buildDraggedTaskLine(oldLine, compatibleEvent, {
      role: payload.role,
      start: payload?.dates?.start,
      end: payload?.dates?.end,
      snapMinutes: 5,
      minDurationMin: 5
    }).trimEnd();
    if (!nextLine || nextLine === oldLine) {
      outcome = "unchanged";
      return source;
    }
    lines[index] = nextLine;
    outcome = "changed";
    return lines.join("\n");
  };
  if (typeof app.vault.process === "function") {
    await app.vault.process(file, applyDrag);
  } else {
    const current = await app.vault.read(file);
    fallbackText = applyDrag(current);
  }
  if (outcome === "conflict") {
    payload?.node?.setAttribute?.("data-noria-drag-conflict-state", "stale-source");
    payload?.timelineEl?.setAttribute?.("data-noria-last-drag-conflict-state", "stale-source");
    taskTimelineNotifyFailure("source line changed before drag write");
    taskTimelineBridge.refresh?.requestRefresh?.("timeline", "task-timeline-drag-conflict");
    return false;
  }
  if (outcome !== "changed") return false;
  if (typeof app.vault.process !== "function") {
    await app.vault.modify(file, fallbackText);
  }
  taskTimelineBridge.refresh?.requestRefresh?.("timeline", "task-timeline-drag-write");
  return true;
}

function taskTimelineNormalizeRange(startValue, endValue) {
  let start = new Date(startValue);
  let end = new Date(endValue);
  if (Number.isNaN(start.getTime())) start = new Date();
  if (Number.isNaN(end.getTime())) end = new Date(start.getTime() + 5 * 60 * 1000);
  if (end < start) [start, end] = [end, start];
  if (end.getTime() - start.getTime() < 5 * 60 * 1000) end = new Date(start.getTime() + 5 * 60 * 1000);
  return { start, end };
}

async function taskTimelineSaveRange(range, color) {
  const api = typeof taskTimelineBridge.timeline?.saveAnnotation === "function"
    ? taskTimelineBridge.timeline
    : globalThis.__noriaRuntimeBridge?.timeline;
  if (!api?.saveAnnotation) return false;
  const result = await api.saveAnnotation({
    type: "span",
    title: "Annotation",
    start: range.start.toISOString(),
    end: range.end.toISOString(),
    color
  });
  taskTimelineBridge.refresh?.requestRefresh?.("timeline", "task-timeline-annotation-range", { reloadViews: true });
  return result?.ok !== false;
}

function taskTimelineOpenRangeMenu(intent, pointerEvent, timelineEl) {
  if (!document?.body) return;
  const range = taskTimelineNormalizeRange(intent?.startMs, intent?.endMs);
  const menu = taskTimelineCreate(document.body, "div", {
    cls: "noria-task-timeline-context-menu noria-task-timeline-range-menu",
    attr: { role: "menu", "data-noria-timeline-range-action": "create" }
  });
  menu.style.left = `${Math.max(4, Number(pointerEvent?.clientX || 0))}px`;
  menu.style.top = `${Math.max(4, Number(pointerEvent?.clientY || 0))}px`;
  menu.style.zIndex = "9999";
  taskTimelineCreate(menu, "div", {
    cls: "noria-task-timeline-context-label",
    text: `${range.start.toLocaleString()} - ${range.end.toLocaleString()}`
  });
  const colors = taskTimelineCreate(menu, "div", { cls: "noria-task-timeline-context-colors" });
  TASK_TIMELINE_ANNOTATION_COLORS.forEach((color) => {
    const button = taskTimelineCreate(colors, "button", {
      cls: "noria-task-timeline-color-swatch",
      attr: { type: "button", "aria-label": `Create mark ${color}` }
    });
    button.style.backgroundColor = color;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      menu.remove();
      void taskTimelineSaveRange(range, color).then((ok) => {
        timelineEl?.setAttribute?.("data-noria-last-range-action-state", ok ? "ok" : "failed");
      });
    });
  });
  const close = () => menu.remove();
  window.setTimeout(() => {
    document.addEventListener("pointerdown", close, { once: true, capture: true });
    document.addEventListener("keydown", close, { once: true, capture: true });
  }, 0);
}

function taskTimelineTextMeasurer(timelineEl) {
  let context = null;
  try {
    const canvas = document.createElement("canvas");
    context = canvas.getContext?.("2d");
  } catch (_) {}
  return (value, _kind, typography = {}) => {
    const label = String(value || "");
    const fontSizePx = Math.max(1, Number(typography.fontSizePx) || 11);
    const fontWeight = Math.max(100, Number(typography.fontWeight) || 600);
    const fontFamily = String(typography.fontFamily || "Arial, Helvetica, sans-serif");
    if (!context?.measureText) return label.length * fontSizePx * 0.64;
    try {
      context.font = `${fontWeight} ${fontSizePx}px ${fontFamily}`;
      return context.measureText(label).width;
    } catch (_) {
      return label.length * fontSizePx * 0.64;
    }
  };
}

const TASK_TIMELINE_TIMING_ATTRS = {
  totalMs: "total-ms",
  modulesMs: "modules-ms",
  taskSourceMs: "task-source-ms",
  taskQueryMs: "task-query-ms",
  taskFallbackMs: "task-fallback-ms",
  taskDataSourceMs: "task-data-source-ms",
  taskDataEnumerateMs: "task-data-enumerate-ms",
  taskDataReadMs: "task-data-read-ms",
  taskDataNormalizeMs: "task-data-normalize-ms",
  taskDataFilterMs: "task-data-filter-ms",
  taskModelMs: "task-model-ms",
  providerSourceMs: "provider-source-ms",
  annotationSourceMs: "annotation-source-ms",
  pomodoroSourceMs: "pomodoro-source-ms",
  traceSourceMs: "trace-source-ms",
  traceGitMs: "trace-git-ms",
  traceCacheMs: "trace-cache-ms",
  providerModelMs: "provider-model-ms",
  providerCollectMs: "provider-collect-ms",
  providerFilterMs: "provider-filter-ms",
  providerJsonMs: "provider-json-ms",
  mountMs: "mount-ms"
};

function taskTimelineSetLoadDiagnostics(timelineEl, state, timing = {}, counts = {}) {
  timelineEl.setAttribute("data-noria-timeline-load-state", String(state || "unknown"));
  Object.entries(TASK_TIMELINE_TIMING_ATTRS).forEach(([key, suffix]) => {
    if (Number.isFinite(Number(timing[key]))) timelineEl.setAttribute(`data-noria-timeline-load-${suffix}`, String(timing[key]));
  });
  ["tasks", "events", "visibleEvents", "unplaced", "providerErrors"].forEach((key) => {
    if (Number.isFinite(Number(counts[key]))) {
      const suffix = key === "visibleEvents" ? "visible-events" : key === "providerErrors" ? "provider-errors" : key;
      timelineEl.setAttribute(`data-noria-timeline-load-${suffix}`, String(counts[key]));
    }
  });
  if (counts.taskCacheState) timelineEl.setAttribute("data-noria-timeline-load-task-cache-state", String(counts.taskCacheState));
  if (Number.isFinite(Number(counts.taskFiles))) timelineEl.setAttribute("data-noria-timeline-load-task-files", String(counts.taskFiles));
  if (Number.isFinite(Number(counts.taskScopeFiles))) timelineEl.setAttribute("data-noria-timeline-load-task-scope-files", String(counts.taskScopeFiles));
  if (counts.taskIndexState) timelineEl.setAttribute("data-noria-timeline-load-task-index-state", String(counts.taskIndexState));
  if (counts.error) timelineEl.setAttribute("data-noria-timeline-load-error", String(counts.error));
  else timelineEl.removeAttribute("data-noria-timeline-load-error");
}

function taskTimelineSetState(root, stage, state, message, counts = {}) {
  root.setAttribute("data-noria-timeline-render-state", state);
  root.removeAttribute("data-noria-timeline-render-error");
  stage.setAttribute("data-noria-timeline-events", String(Number(counts.events || 0)));
  stage.setAttribute("data-noria-timeline-unplaced", String(Number(counts.unplaced || 0)));
  stage.setAttribute("data-noria-timeline-provider-errors", String(Number(counts.providerErrors || 0)));
  Array.from(stage.children || []).forEach((node) => {
    if (node.classList?.contains("noria-task-timeline-state")) node.remove();
  });
  if (state === "ready" && Number(counts.events || 0) > 0) return;
  const stateEl = taskTimelineCreate(stage, "div", {
    cls: "noria-task-timeline-state noria-task-timeline-empty",
    text: message || (state === "failed" ? "Timeline unavailable" : "No timeline events"),
    attr: {
      "data-noria-timeline-state": state,
      "data-noria-timeline-state-events": String(Number(counts.events || 0)),
      "data-noria-timeline-state-unplaced": String(Number(counts.unplaced || 0)),
      "data-noria-timeline-state-provider-errors": String(Number(counts.providerErrors || 0))
    }
  });
  stateEl.setAttribute("aria-live", state === "failed" ? "assertive" : "polite");
}

function taskTimelineInstallDensity(root) {
  const apply = () => {
    const width = Number(root.getBoundingClientRect?.().width || root.clientWidth || 0);
    const density = width > 560 ? "wide" : width < 240 ? "compact" : "normal";
    root.setAttribute("data-noria-timeline-density", density);
    root.setAttribute("data-noria-task-timeline-density", density);
  };
  apply();
  if (typeof ResizeObserver !== "function") return () => {};
  const observer = new ResizeObserver(apply);
  observer.observe(root);
  return () => observer.disconnect();
}

async function taskTimelineRender() {
  const mount = ctx.container || ctx.mount;
  if (!mount) return;
  taskTimelineCleanupExisting(mount);
  if (typeof mount.empty === "function") mount.empty();
  else mount.replaceChildren();

  const root = taskTimelineCreate(mount, "div", {
    cls: "noria-task-timeline-root noria-task-timeline-root--tasks-timeline"
  });
  const stage = taskTimelineCreate(root, "div", {
    cls: "noria-task-timeline-stage"
  });
  const timelineEl = taskTimelineCreate(stage, "div", {
    cls: "noria-task-timeline-surface",
    attr: { "data-noria-timeline-source": "tasks" }
  });
  const status = taskTimelineCreate(root, "div", {
    cls: "noria-task-timeline-status",
    attr: { hidden: "", "aria-hidden": "true" }
  });
  status.hidden = true;
  taskTimelineSetState(root, stage, "loading", "Loading timeline");
  const loadStartedAt = taskTimelinePerfNow();
  const timing = {};
  taskTimelineSetLoadDiagnostics(timelineEl, "loading", timing);
  let disposeDensity = () => {};
  let backendInstance = null;

  try {
    const filterState = taskTimelineNormalizeFilter(timelineFilter);
    const annotationLayerActive = filterState.layers.includes("annotation");
    const pomodoroLayerActive = filterState.layers.includes("pomodoro");
    const traceLayerActive = filterState.layers.some((layer) => ["note", "git", "noria"].includes(layer));
    let phase = taskTimelinePerfNow();
    const runtime = await taskTimelineEnsureRuntime({ pomodoroLayerActive });
    timing.modulesMs = taskTimelineRoundMs(taskTimelinePerfNow() - phase);

    phase = taskTimelinePerfNow();
    const fresh = await taskTimelineCollectFreshTasks();
    timing.taskQueryMs = taskTimelineRoundMs(taskTimelinePerfNow() - phase);
    const taskPerformance = fresh.performance || {};
    const performanceMap = {
      sourceMs: "taskDataSourceMs",
      enumerateMs: "taskDataEnumerateMs",
      readMs: "taskDataReadMs",
      normalizeMs: "taskDataNormalizeMs",
      filterMs: "taskDataFilterMs"
    };
    Object.entries(performanceMap).forEach(([sourceKey, targetKey]) => {
      if (Number.isFinite(Number(taskPerformance[sourceKey]))) timing[targetKey] = taskTimelineRoundMs(taskPerformance[sourceKey]);
    });
    phase = taskTimelinePerfNow();
    const tasks = fresh.items.length ? fresh.items : taskTimelineCollectFallbackTasks();
    timing.taskFallbackMs = fresh.items.length ? 0 : taskTimelineRoundMs(taskTimelinePerfNow() - phase);
    timing.taskSourceMs = taskTimelineRoundMs(timing.taskQueryMs + timing.taskFallbackMs);

    phase = taskTimelinePerfNow();
    const taskModel = runtime.adapter.tasksToTimelineEvents(tasks, {
      dailyNoteFormat: taskTimelineDailyNoteFormat,
      pages: taskTimelinePages,
      timelineTagPlacement: taskTimelineSettingsInput.timelineTagPlacement
    });
    timing.taskModelMs = taskTimelineRoundMs(taskTimelinePerfNow() - phase);

    phase = taskTimelinePerfNow();
    const [annotations, pomodoroState, traceData] = await Promise.all([
      annotationLayerActive ? taskTimelineCollectAnnotations() : [],
      pomodoroLayerActive ? taskTimelineCollectPomodoro() : null,
      traceLayerActive ? taskTimelineCollectTraces(taskModel.events) : {}
    ]);
    timing.providerSourceMs = taskTimelineRoundMs(taskTimelinePerfNow() - phase);
    timing.annotationSourceMs = annotationLayerActive ? timing.providerSourceMs : 0;
    timing.pomodoroSourceMs = pomodoroLayerActive ? timing.providerSourceMs : 0;
    timing.traceSourceMs = traceLayerActive ? timing.providerSourceMs : 0;
    timing.traceGitMs = Number.isFinite(Number(traceData?.meta?.performance?.gitMs)) ? taskTimelineRoundMs(traceData.meta.performance.gitMs) : 0;
    timing.traceCacheMs = Number.isFinite(Number(traceData?.meta?.performance?.cacheMs)) ? taskTimelineRoundMs(traceData.meta.performance.cacheMs) : 0;

    phase = taskTimelinePerfNow();
    const providerResult = await runtime.eventModel.collectProviderEvents([
      { id: "tasks", layer: "task", collect: () => taskModel.events },
      annotationLayerActive
        ? { id: "annotations", layer: "annotation", collect: () => runtime.annotationProvider.annotationsToTimelineEvents(annotations).events }
        : null,
      pomodoroLayerActive && runtime.pomodoroProvider
        ? { id: "pomodoro", layer: "pomodoro", collect: () => runtime.pomodoroProvider.pomodoroStateToTimelineEvents(pomodoroState, { now: new Date().toISOString() }).events }
        : null,
      traceLayerActive
        ? { id: "traces", layer: "trace", collect: () => runtime.traceProvider.timelineTracesToEvents(traceData).events }
        : null
    ].filter(Boolean), { sourceMode: "tasks", pages: taskTimelinePages });
    timing.providerCollectMs = taskTimelineRoundMs(taskTimelinePerfNow() - phase);

    phase = taskTimelinePerfNow();
    const filteredEvents = runtime.eventModel.filterTimelineEvents(providerResult.events, taskTimelineFilterQuery(filterState));
    timing.providerFilterMs = taskTimelineRoundMs(taskTimelinePerfNow() - phase);
    timing.providerJsonMs = 0;
    timing.providerModelMs = taskTimelineRoundMs(timing.providerCollectMs + timing.providerFilterMs);

    const settings = {
      ...taskTimelineSettingsInput,
      locale: taskTimelineRuntimeLocale(),
      todayLabel: taskTimelineRuntimeMessage("runtime.timeline.relative.today", "Today"),
      scaleMode: filterState.scaleMode,
      markMode: filterState.markMode,
      manualCenter: filterState.manualCenter || taskTimelineSettingsInput.manualCenter,
      manualZoomIndex: filterState.manualZoomIndex != null ? filterState.manualZoomIndex : taskTimelineSettingsInput.manualZoomIndex,
      manualOverviewZoomIndex: filterState.manualOverviewZoomIndex != null
        ? filterState.manualOverviewZoomIndex
        : taskTimelineSettingsInput.manualOverviewZoomIndex
    };
    timelineEl.setAttribute("data-noria-task-scale-mode", settings.scaleMode || "auto");
    timelineEl.setAttribute("data-noria-timeline-internal-engine", "native");
    disposeDensity = taskTimelineInstallDensity(root);
    const counts = {
      tasks: tasks.length,
      events: providerResult.events.length,
      visibleEvents: filteredEvents.length,
      unplaced: taskModel.unplaced.length,
      providerErrors: providerResult.errors.length,
      taskCacheState: String(taskPerformance.sourceState || "unknown"),
      taskFiles: Number(taskPerformance.fileCount || 0),
      taskScopeFiles: Number(taskPerformance.scopeFileCount || 0),
      taskIndexState: String(taskPerformance.indexState || "fallback")
    };

    if (!taskTimelineRunIsCurrent()) {
      try { disposeDensity(); } catch (_) {}
      try { root.remove?.(); } catch (_) {}
      return;
    }

    phase = taskTimelinePerfNow();
    backendInstance = await runtime.engine.mountTimelineBackend("native", {
      timelineEl,
      container: timelineEl,
      resizeTarget: stage,
      getRect: () => timelineEl.getBoundingClientRect?.() || stage.getBoundingClientRect?.() || {},
      measureText: taskTimelineTextMeasurer(timelineEl),
      externalStateLayer: true,
      events: filteredEvents,
      settings,
      onRender: () => taskTimelineSetState(root, stage, "ready", "", counts),
      onManualScaleState: typeof onTimelineManualScaleState === "function" ? onTimelineManualScaleState : null,
      services: {
        openSource: taskTimelineOpenSource,
        commitDrag: (payload) => taskTimelineCommitDrag(runtime.taskEdit, payload)
      },
      selectRange: (intent, pointerEvent) => taskTimelineOpenRangeMenu(intent, pointerEvent, timelineEl)
    });
    if (!taskTimelineRunIsCurrent()) {
      try { backendInstance.dispose(); } catch (_) {}
      try { disposeDensity(); } catch (_) {}
      try { root.remove?.(); } catch (_) {}
      return;
    }
    timing.mountMs = taskTimelineRoundMs(taskTimelinePerfNow() - phase);
    const focusToday = () => {
      backendInstance.centerOn(new Date());
      return true;
    };
    if (typeof onTimelineFocusTodayReady === "function") onTimelineFocusTodayReady(focusToday);
    let disposed = false;
    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      try { backendInstance.dispose(); } catch (_) {}
      try { disposeDensity(); } catch (_) {}
      if (typeof onTimelineFocusTodayReady === "function") onTimelineFocusTodayReady(null);
    };
    timelineEl.__noriaTaskTimelineCleanup = cleanup;
    timelineEl.__noriaTaskTimelineBackend = backendInstance;

    timing.totalMs = taskTimelineRoundMs(taskTimelinePerfNow() - loadStartedAt);
    taskTimelineSetLoadDiagnostics(timelineEl, "ready", timing, counts);
    status.textContent = `Noria tasks loaded: ${filteredEvents.length}/${providerResult.events.length} events, ${taskModel.unplaced.length} unplaced.`;
  } catch (error) {
    if (!taskTimelineRunIsCurrent()) {
      try { backendInstance?.dispose?.(); } catch (_) {}
      try { disposeDensity(); } catch (_) {}
      try { root.remove?.(); } catch (_) {}
      return;
    }
    const message = String(error?.message || error || "timeline render failed");
    timing.totalMs = taskTimelineRoundMs(taskTimelinePerfNow() - loadStartedAt);
    taskTimelineSetLoadDiagnostics(timelineEl, "failed", timing, { error: message });
    taskTimelineSetState(root, stage, "failed", "Timeline unavailable");
    root.setAttribute("data-noria-timeline-render-error", message);
    status.textContent = `Timeline unavailable: ${message}`;
    try { console.warn("[noria taskTimeline] render failed", error); } catch (_) {}
  }
}

await taskTimelineRender();
