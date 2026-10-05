"use strict";

const OVERVIEW_FIELDS = [
  ["daysUsed", "记录跨度", "Record span"], ["usageStreak", "连续有记录", "Record streak"],
  ["totalNotes", "当前笔记数", "Current notes"], ["todayNotes", "新增笔记", "New notes"],
  ["totalWords", "当前字符量", "Current characters"], ["completedTasks", "完成事项", "Completed tasks"],
  ["missingTags", "无标签笔记", "Notes without tags"], ["brokenLinks", "未解析链接", "Unresolved links"]
];
const RANGE_CARDS = new Set(["metrics", "note-trend-card", "task-trend-card", "habit-heatmap-card", "workload-heatmap-card", "daily-state-card"]);
const supportsRange = widget => RANGE_CARDS.has(widget.builtinId || widget.id);

function dashboardStatisticSettings(editor, form) {
  const widget = editor.draft, id = widget.builtinId || widget.id;
  if (!supportsRange(widget)) return;
  widget.props ||= {};
  const text = (zh, en) => editor.text(zh, en);
  const diary = editor.context?.page === "diary";
  const defaultMode = id === "metrics" && !diary ? "all" : "homeCurrent";
  const range = widget.props.statsRange || { mode: defaultMode };
  const choices = [
    ...(id === "metrics" ? [{ value: "all", label: text("原有总览（今日新增与累计完成）", "Original overview (today and all-time)") }] : []),
    { value: "homeCurrent", label: diary ? text("跟随日记周期", "Follow diary period") : text("跟随所在页面", "Follow this page") },
    { value: "last30", label: text("近 30 天", "Last 30 days") },
    { value: "week", label: text("本周", "This week") },
    { value: "month", label: text("本月", "This month") },
    { value: "year", label: text("本年", "This year") },
    { value: "custom", label: text("自定义区间", "Custom dates") }
  ];
  const picker = editor.field(form, text("统计时间", "Statistics period"), "select", range.mode, mode => {
    widget.props.statsRange = { mode };
    if (mode === "custom") {
      const current = diary ? require('./diary-tasks.js').diaryRange(editor.context.selection) : {start:editor.plugin.getLocalYmd(),end:editor.plugin.getLocalYmd()};
      widget.props.statsRange.start = range.start || current.start;
      widget.props.statsRange.end = range.end || current.end;
    }
    const top = editor.contentEl.scrollTop;
    queueMicrotask(() => {
      editor.edit(widget); editor.dirty = true; editor.contentEl.scrollTop = top;
      editor.contentEl.querySelector('[data-card-field="statsRange"]')?.focus({ preventScroll: true });
    });
  }, choices);
  picker.dataset.cardField = "statsRange";
  if (range.mode === "custom") for (const key of ["start", "end"]) {
    const input = editor.field(form, key === "start" ? text("开始日期", "Start date") : text("结束日期", "End date"), "date", range[key], value => {
      widget.props.statsRange = { ...widget.props.statsRange, [key]: value };
    });
    input.dataset.cardField = `statsRange.${key}`;
  }
  if (id !== "metrics") return;
  form.createDiv({ cls: "noria-card-secondary", text: text("时间区间作用于新增笔记和完成事项；当前总量与记录跨度保持原含义。", "The period filters new notes and completed tasks; current totals and record span keep their meaning.") });
  const group = form.createEl("fieldset", { cls: "noria-overview-fields" });
  group.createEl("legend", { text: text("显示项目", "Visible metrics") });
  const selected = new Set(Array.isArray(widget.props.overviewFields) ? widget.props.overviewFields : OVERVIEW_FIELDS.map(([key]) => key));
  for (const [key, zh, en] of OVERVIEW_FIELDS) {
    const label = group.createEl("label");
    const check = label.createEl("input", { attr: { type: "checkbox", "data-overview-field": key } });
    check.checked = selected.has(key);
    label.createSpan({ text: text(zh, en) });
    check.onchange = () => {
      check.checked ? selected.add(key) : selected.delete(key);
      widget.props.overviewFields = OVERVIEW_FIELDS.map(([key]) => key).filter(key => selected.has(key));
      editor.dirty = true; editor.schedulePreview();
    };
  }
}

function validateDashboardStatistic(widget, plugin, text) {
  if (!supportsRange(widget)) return;
  const range = widget.props?.statsRange;
  if (range?.mode === "custom" && (!plugin.isIsoDateText(range.start) || !plugin.isIsoDateText(range.end) || range.start > range.end)) {
    throw Error(text("请选择有效的起止日期，开始日期不能晚于结束日期。", "Choose valid dates; start must not be after end."));
  }
  if ((widget.builtinId || widget.id) === "metrics" && Array.isArray(widget.props?.overviewFields) && !widget.props.overviewFields.some(key => OVERVIEW_FIELDS.some(([id]) => key === id))) {
    throw Error(text("至少保留一个统计项目。", "Keep at least one metric."));
  }
}
module.exports = { OVERVIEW_FIELDS, supportsRange, dashboardStatisticSettings, validateDashboardStatistic };
