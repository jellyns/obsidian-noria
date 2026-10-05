"use strict";
const {normalizeReviewSelection} = require("./review-center-core.js");
const {cleanTaskTitle, getTaskDate} = require("./runtime/views/dashboard/core/utils/task-display.js");

function shiftDate(value, days) {
  const date = new Date(value + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function diaryRange(input) {
  const s = normalizeReviewSelection(input), date = new Date(s.anchorDate + "T12:00:00Z");
  if (s.mode === "daily") return {start:s.anchorDate, end:s.anchorDate};
  if (s.mode === "weekly") {
    const start = shiftDate(s.anchorDate, -((date.getUTCDay() + 6) % 7));
    return {start, end:shiftDate(start, 6)};
  }
  if (s.mode === "yearly") return {start:s.period + "-01-01", end:s.period + "-12-31"};
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return {start:s.period + "-01", end:date.toISOString().slice(0, 10)};
}
function shiftPeriod(selection, amount) {
  const s = normalizeReviewSelection(selection);
  if (s.mode === "daily" || s.mode === "weekly") return {mode:s.mode, anchorDate:shiftDate(s.anchorDate, amount * (s.mode === "weekly" ? 7 : 1))};
  const date = new Date(s.anchorDate + "T12:00:00Z"), day = date.getUTCDate();
  date.setUTCDate(1);
  if (s.mode === "monthly") date.setUTCMonth(date.getUTCMonth() + amount);
  else date.setUTCFullYear(date.getUTCFullYear() + amount);
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, end));
  return {mode:s.mode, anchorDate:date.toISOString().slice(0, 10)};
}
function projectDiaryTasks(tasks, selection, notePath, today) {
  const s = normalizeReviewSelection(selection), range = diaryRange(s), seen = new Set();
  const current = s.period === normalizeReviewSelection({mode:s.mode, anchorDate:today}).period;
  const rows = [];
  for (const task of tasks) {
    if (!task?.path || /(^|\s)#habit\b/i.test(task.text || "") || ["cancelled","canceled"].includes(task.status)) continue;
    const key = `${task.path}:${task.line}`, own = task.path === notePath;
    if (seen.has(key)) continue;
    const dates = ["start","scheduled","due"].map(k => getTaskDate(task,k)).filter(Boolean).sort();
    const completion = getTaskDate(task,"done");
    const dated = dates.some(d => d <= range.end);
    const completed = task.completed === true;
    const included = completed
      ? completion ? completion >= range.start && completion <= range.end : own || (s.mode === "daily" && dated)
      : own || dated;
    if (!included) continue;
    seen.add(key);
    const priorities={highest:5,high:4,medium:3,low:2,lowest:1};
    const inlinePriority=/\[priority::\s*(highest|high|medium|low|lowest)\]/i.exec(task.text||"")?.[1]?.toLowerCase();
    const priority = priorities[String(task.priority||"").toLowerCase()] || priorities[inlinePriority] || 0;
    rows.push({task,key,title:cleanTaskTitle(task.text),priority,completed,completion,
      date:getTaskDate(task,"due") || getTaskDate(task,"scheduled") || getTaskDate(task,"start"),
      due:getTaskDate(task,"due"),carry:!completed && !!dates[0] && dates[0] < range.start});
  }
  const compare = (a,b) => b.priority-a.priority || (a.date || "9999").localeCompare(b.date || "9999") || a.title.localeCompare(b.title);
  const pending = rows.filter(r => !r.completed).sort(compare), done = rows.filter(r => r.completed).sort(compare);
  const focus = current ? pending.slice(0,3) : [];
  return {current, range, focus, pending:pending.filter(r => !focus.includes(r)), done, total:rows.length};
}
function diaryNavigationItems(selection) {
  const s=normalizeReviewSelection(selection);
  if(s.mode==="daily"){
    const weekday=new Date(s.anchorDate+"T12:00:00Z").getUTCDay();
    const monday=shiftDate(s.anchorDate,-((weekday+6)%7));
    return Array.from({length:7},(_,i)=>normalizeReviewSelection({mode:s.mode,anchorDate:shiftDate(monday,i)}));
  }
  if(s.mode==="monthly")return Array.from({length:12},(_,i)=>normalizeReviewSelection({mode:s.mode,anchorDate:`${s.anchorDate.slice(0,4)}-${String(i+1).padStart(2,"0")}-01`}));
  return Array.from({length:7},(_,i)=>normalizeReviewSelection(shiftPeriod(s,i-3)));
}
module.exports = {diaryRange, shiftDate, shiftPeriod, projectDiaryTasks, diaryNavigationItems};
