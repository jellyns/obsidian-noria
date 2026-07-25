(() => {
  const root = globalThis.dashboardCore || (globalThis.dashboardCore = {});
  root.adapters = root.adapters || {};

  function mergeObjects(base, extra) {
    const out = Array.isArray(base) ? [...base] : { ...base };
    Object.keys(extra || {}).forEach((k) => {
      const v = extra[k];
      if (v && typeof v === "object" && !Array.isArray(v) && typeof out[k] === "object" && out[k] !== null && !Array.isArray(out[k])) {
        out[k] = mergeObjects(out[k], v);
      } else {
        out[k] = v;
      }
    });
    return out;
  }

  function loadTimelineSettings({ app, targetPath, defaultSettings, defaultStrategy }) {
    let settings = defaultSettings;
    let strategy = defaultStrategy;
    try {
      const file = app.vault.getAbstractFileByPath(String(targetPath || ""));
      if (!file) return { settings, strategy };
      const cache = app.metadataCache.getFileCache(file);
      const fm = cache && cache.frontmatter ? cache.frontmatter : null;
      if (!fm || !fm.timeline_settings) return { settings, strategy };
      settings = mergeObjects(defaultSettings, fm.timeline_settings);
      if (typeof fm.timeline_settings.defaultStrategy === "string" && fm.timeline_settings.defaultStrategy.trim()) {
        strategy = fm.timeline_settings.defaultStrategy.trim();
      }
    } catch (err) {
      console.error("[timeline-settings-adapter] load failed:", err);
    }
    return { settings, strategy };
  }

  function applyTimelineSettingsToRoot({ rootNode, timelineSettings }) {
    let bucket = parseInt(timelineSettings.dayBucketHeight, 10);
    let lane = parseInt(timelineSettings.laneHeight, 10);
    if (!Number.isFinite(bucket) || bucket < 32) bucket = 84;
    if (!Number.isFinite(lane) || lane < 360) lane = 1080;
    rootNode.style.setProperty("--day-bucket-height", `${bucket}px`);
    rootNode.style.setProperty("--time-lane-height", `${lane}px`);
  }

  root.adapters.timelineSettingsAdapter = {
    mergeObjects,
    loadTimelineSettings,
    applyTimelineSettingsToRoot
  };
})();
