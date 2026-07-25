/**
 * 兼容旧路径：逻辑已并入 dashboardDailyRecap（分步复盘 + diary-day-blocks SSOT）。
 */
(async () => {
  const mount = (input && input.mount) ? input.mount : (typeof this !== "undefined" && this && this.container) ? this.container : (ctx.container || null);
  const bridge = input?.noriaBridge || globalThis.__noriaRuntimeBridge || {};
  const gddRecapT = (key, params = {}) => {
    try {
      if (bridge && typeof bridge.t === "function") return bridge.t(key, params);
      const messages = bridge?.i18n?.messages || {};
      const fallback = bridge?.i18n?.fallback || {};
      let template = messages[key] || fallback[key] || key;
      Object.entries(params || {}).forEach(([k, v]) => {
        template = String(template).replace(new RegExp(`\\{${k}\\}`, "g"), String(v ?? ""));
      });
      return String(template);
    } catch (_) {
      return String(key || "");
    }
  };
  async function loadText(path) {
    const p = String(path || "").replace(/\\/g, "/").replace(/^\/+/, "");
    try {
      const t = await ctx.io.load(p);
      if (t) return String(t);
    } catch (_) {}
    try {
      return String(await app.vault.adapter.read(p) || "");
    } catch (_) {
      return "";
    }
  }
  const rel = ".obsidian/plugins/noria/views/periodic/dashboardDailyRecap.js";
  const runtimeBuildId = String(
    bridge?.runtimeBuildId ||
    globalThis.__noriaRuntimeBuildId ||
    ""
  );
  const getCompatState = () => {
    try {
      const key = "__noria_gdd_recap_compat_v1";
      const state = globalThis[key];
      if (!state || state.runtimeBuildId !== runtimeBuildId) {
        globalThis[key] = { runtimeBuildId, runner: null, pending: null, status: "idle" };
      }
      return globalThis[key];
    } catch (_) {
      return { runtimeBuildId, runner: null, pending: null, status: "idle" };
    }
  };
  const loadDailyRecapRunner = async () => {
    const state = getCompatState();
    if (state.runner) return state.runner;
    if (state.pending) return await state.pending;
    state.status = "loading";
    state.pending = (async () => {
      const code = await loadText(rel);
      if (!code) {
        state.status = "missing";
        state.runner = null;
        return null;
      }
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      const run = new AsyncFunction("ctx", "input", "app", "moment", "window", "document", "globalThis", code);
      state.runner = run;
      state.status = "ready";
      state.error = "";
      return run;
    })().catch((err) => {
      state.status = "failed";
      state.error = String(err?.message || err || "");
      state.runner = null;
      throw err;
    }).finally(() => {
      state.pending = null;
    });
    return await state.pending;
  };
  const run = await loadDailyRecapRunner();
  if (!run) {
    const message = gddRecapT("runtime.periodic.gddRecap.missingFile", { path: rel });
    if (mount?.createEl) mount.createEl("p", { text: message });
    else ctx.paragraph(message);
    return;
  }
  await run(ctx, { ...(input || {}), mount }, app, window.moment, window, document, globalThis);
})();
