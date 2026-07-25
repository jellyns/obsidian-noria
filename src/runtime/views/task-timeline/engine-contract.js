(function () {
  const root = globalThis.noriaTaskTimeline || (globalThis.noriaTaskTimeline = {});
  const backends = root.timelineBackends instanceof Map ? root.timelineBackends : new Map();
  root.timelineBackends = backends;

  function normalizeId(value) {
    return String(value == null ? "" : value).trim().toLowerCase();
  }

  function createTimelineBackend(definition = {}) {
    const id = normalizeId(definition.id);
    if (!id) throw new Error("Timeline backend id is required");
    if (typeof definition.mount !== "function") {
      throw new Error(`Timeline backend ${id} must define mount(context)`);
    }
    return Object.freeze({ ...definition, id, mount: definition.mount });
  }

  function registerTimelineBackend(definition) {
    const backend = definition && typeof definition.mount === "function" && definition.id
      ? createTimelineBackend(definition)
      : createTimelineBackend(definition || {});
    backends.set(backend.id, backend);
    return backend;
  }

  function getTimelineBackend(id) {
    return backends.get(normalizeId(id)) || null;
  }

  async function mountTimelineBackend(id, context = {}) {
    const backend = getTimelineBackend(id);
    if (!backend) throw new Error(`Timeline backend not registered: ${normalizeId(id) || "unknown"}`);
    const instance = await backend.mount(context);
    if (!instance || typeof instance.dispose !== "function") {
      throw new Error(`Timeline backend ${backend.id} must return an instance with dispose()`);
    }
    return instance;
  }

  root.engine = {
    createTimelineBackend,
    registerTimelineBackend,
    getTimelineBackend,
    mountTimelineBackend
  };

  if (globalThis.__NORIA_TASK_TIMELINE_TEST__) {
    globalThis.__noriaTaskTimelineEngineTestHooks = root.engine;
  }
})();
