"use strict";

const {createHash} = require("crypto");
const hash = text => createHash("sha256").update(text).digest("hex");
const object = value => value && typeof value === "object" && !Array.isArray(value);
const copy = value => JSON.parse(JSON.stringify(value));

// Import only once, before normalization can discard retired keys. Original
// documents and a verified receipt retain custom fields; neither is read at runtime.
async function migrate(plugin, input, parseYaml) {
  if (input.migrations?.timelineInbox === 1) return {settings: input, changed: false};
  const settings = copy(input), adapter = plugin.app.vault.adapter;
  const configured = Object.hasOwn(input.managedPaths || {}, "timelineSettings")
    ? input.managedPaths.timelineSettings : input.timelineSettingsPath;
  const sourcePath = String(configured ?? ".obsidian/plugins/noria/config/timeline-settings.md").trim().replace(/\\/g, "/");
  let source = null, imported = {};
  if (sourcePath) {
    if (/^[\/]|^[A-Za-z]:|(^|\/)\.\.?($|\/)/.test(sourcePath)) throw Error("旧时间轴配置路径无效，未保存迁移。");
    if (await adapter.exists(sourcePath)) {
      source = await adapter.read(sourcePath);
      const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
      const fm = match ? parseYaml(match[1]) : {};
      if (fm?.timeline_settings != null && !object(fm.timeline_settings)) throw Error("旧时间轴配置格式无效，原文件未修改。");
      imported = fm?.timeline_settings || {};
    }
  }
  // The former file adapter ran after the bridge and therefore won these fields.
  const strategy = String(imported.defaultStrategy || "").trim();
  if (["daily", "daily-only", "weekly", "weekly-all", "mixed"].includes(strategy)) {
    settings.defaultStrategy = {"daily-only":"daily", "weekly-all":"weekly"}[strategy] || strategy;
  }
  for (const [key, min, fallback] of [["dayBucketHeight",32,84], ["laneHeight",360,1080]]) {
    if (!Object.hasOwn(imported, key)) continue;
    const value = parseInt(imported[key], 10);
    settings.sizing = {...settings.sizing, [key]: Number.isFinite(value) && value >= min ? value : fallback};
  }
  const quick = settings.timelineQuickSettings = {...settings.timelineQuickSettings};
  for (const key of ["pregenSpanDays", "pregenItems"]) if (Object.hasOwn(imported, key)) quick[key] = copy(imported[key]);
  if (object(imported.items)) {
    quick.items = {...quick.items};
    for (const [key, item] of Object.entries(imported.items)) {
      if (["__proto__", "prototype", "constructor"].includes(key)) continue;
      quick.items[key] = object(item) ? {...quick.items[key], ...copy(item)} : item;
    }
  }
  // A due-review metric cannot be relabelled as unassigned: their meanings differ.
  const retiredMetrics = [];
  const retireMetric = (value, path = []) => {
    if (!object(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "metrics" && Array.isArray(child)) {
        if (child.includes("inbox.stale")) retiredMetrics.push({path:[...path,key], metrics:[...child]});
        value[key] = child.filter(id => id !== "inbox.stale");
      } else if (Array.isArray(child)) child.forEach((item,index)=>retireMetric(item,[...path,key,index]));
      else retireMetric(child,[...path,key]);
    }
  };
  retireMetric(settings);
  const receipt = {schema: 1, sourcePath, source, sourceHash: source === null ? null : hash(source),
    previous: {defaultStrategy: input.defaultStrategy, sizing: input.sizing, timelineQuickSettings: input.timelineQuickSettings,
      inboxWorkflow: input.inboxWorkflow, managedPaths: input.managedPaths, home: input.home},
    imported, retiredMetrics, completedAt: new Date().toISOString()};
  const hasLegacy = source !== null || !!input.inboxWorkflow || !!configured || !!input.managedPaths?.inboxWorkflow || retiredMetrics.length > 0;
  if (hasLegacy) {
    const dir = `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}/migrations`;
    if (!await adapter.exists(dir)) await adapter.mkdir(dir);
    // Content-addressed receipts cannot overwrite an earlier recovery point.
    const body = JSON.stringify(receipt, null, 2) + "\n";
    const path = `${dir}/timeline-inbox-${hash(body).slice(0,16)}.json`;
    await adapter.write(path, body);
    if (await adapter.read(path) !== body) throw Error("迁移恢复记录校验失败，未保存新配置。");
    if (source !== null && await adapter.read(sourcePath) !== source) throw Error("旧时间轴配置在迁移期间发生变化，请重新加载；未保存新配置。");
  }
  delete settings.inboxWorkflow;
  delete settings.timelineSettingsPath;
  if (settings.managedPaths) { delete settings.managedPaths.timelineSettings; delete settings.managedPaths.inboxWorkflow; }
  settings.migrations = {...settings.migrations, timelineInbox: 1};
  return {settings, changed: true};
}

module.exports = {migrate};
