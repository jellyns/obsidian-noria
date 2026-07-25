const RUNTIME_CORE_PATH = ".obsidian/plugins/noria/views/tasks-calendar/runtime-core.js";
const RUNTIME_UI_COMPONENTS_PATH = ".obsidian/plugins/noria/views/tasks-calendar/runtime-ui-components.js";

function createRuntimeExecutor(sourceCode, sourcePath) {
  if (!sourceCode) {
    throw new Error("tasks-calendar runtime load failed: " + sourcePath);
  }
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  return new AsyncFunction(
    "ctx",
    "input",
    "app",
    "moment",
    "window",
    "document",
    "globalThis",
    String(sourceCode)
  );
}

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

const runtimeInput = input || {};
const [runtimeCoreSource, runtimeUiSource] = await Promise.all([
  loadText(RUNTIME_CORE_PATH),
  loadText(RUNTIME_UI_COMPONENTS_PATH)
]);
const runRuntimeCore = createRuntimeExecutor(runtimeCoreSource, RUNTIME_CORE_PATH);
await runRuntimeCore(ctx, runtimeInput, app, window.moment, window, document, globalThis);

if (runtimeUiSource) {
  const runRuntimeUiComponents = createRuntimeExecutor(runtimeUiSource, RUNTIME_UI_COMPONENTS_PATH);
  await runRuntimeUiComponents(ctx, runtimeInput, app, window.moment, window, document, globalThis);
}
