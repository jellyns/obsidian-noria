"use strict";

// Reserve a readable name, then give each date a compact, equally sized lane.
// Capacity includes today; the history preference never limits recent mode.
function fitHabitGrid(width, nameWidth, historyDays) {
  width = Math.max(128, Number(width) || 320);
  const name = Math.min(160, width * .36, Math.max(84, Math.ceil(Number(nameWidth) || 84)));
  const capacity = Math.max(2, Math.floor((width - name) / 24));
  const days = historyDays ? Math.min(capacity, Math.max(2, Math.round(historyDays))) : capacity;
  return {nameWidth:name, days, dayWidth:(width - name) / days};
}

module.exports = {fitHabitGrid};
