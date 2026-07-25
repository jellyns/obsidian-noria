"use strict";

/**
 * 注意：`main.js` 已内联 `getTaskQueryContext`（含 NORIA_DEFAULT_TASK_QUERY_POLICY 同义常量）。
 * 修改查询上下文时请同步更新 `main.js` 内联段。
 */

const DEFAULT_TASK_QUERY_POLICY = {
  includeTimelineInMonth: false,
  includeCancelled: true,
  excludeOverdueTimeline: true
};
const DEFAULT_TASK_EXCLUDE_TAGS = ["#habit"];

function normalizeTaskFilterTag(raw) {
  let tag = String(raw || "").trim();
  if (!tag) return "";
  if (!tag.startsWith("#")) tag = `#${tag.replace(/^#+/, "")}`;
  return tag;
}

function normalizeTaskFilterTagList(raw) {
  const source = Array.isArray(raw) ? raw : (typeof raw === "string" ? raw.split(",") : []);
  const out = [];
  for (const item of source) {
    const tag = normalizeTaskFilterTag(item);
    if (!tag) continue;
    if (!out.some((x) => x.toLowerCase() === tag.toLowerCase())) out.push(tag);
  }
  return out;
}

/**
 * 任务过滤 / 查询策略单一事实源（供 runtime bridge、统计模块等读取同一口径）。
 * @param {Record<string, any>} settings - Noria 插件 settings（含 taskTagFilter、taskQueryPolicy 等）
 */
function getTaskQueryContext(settings) {
  const s = settings && typeof settings === "object" ? settings : {};
  const taskTagFilter = s.taskTagFilter && typeof s.taskTagFilter === "object"
    ? s.taskTagFilter
    : { includeTags: [], excludeTags: DEFAULT_TASK_EXCLUDE_TAGS };
  const includeTags = normalizeTaskFilterTagList(taskTagFilter.includeTags);
  const excludeTags = normalizeTaskFilterTagList(taskTagFilter.excludeTags);

  const taskQueryPolicy = {
    ...DEFAULT_TASK_QUERY_POLICY,
    ...(s.taskQueryPolicy && typeof s.taskQueryPolicy === "object" ? s.taskQueryPolicy : {})
  };

  const taskTypeFilter = {
    showDone: true,
    showOverdue: true,
    showRecurring: true,
    showScheduled: true,
    ...(s.taskTypeFilter && typeof s.taskTypeFilter === "object" ? s.taskTypeFilter : {})
  };

  const wrapperTaskFilter =
    s.wrapperTaskFilter && typeof s.wrapperTaskFilter === "object" ? { ...s.wrapperTaskFilter } : {};

  return {
    taskTagFilter: { includeTags, excludeTags },
    taskQueryPolicy,
    taskTypeFilter,
    wrapperTaskFilter
  };
}

module.exports = { getTaskQueryContext, DEFAULT_TASK_QUERY_POLICY, DEFAULT_TASK_EXCLUDE_TAGS };
