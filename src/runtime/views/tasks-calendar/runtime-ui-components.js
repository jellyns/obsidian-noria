// Optional extension hook. Runtime core is fully functional without extra UI module.
if (!globalThis.__noriaTaskCalendarUi || typeof globalThis.__noriaTaskCalendarUi !== "object") {
  globalThis.__noriaTaskCalendarUi = {};
}

function noriaTaskCalendarUiT(key, params) {
  params = params || {};
  var bridge = globalThis.__noriaRuntimeBridge || {};
  try {
    if (bridge && typeof bridge.t === "function") return bridge.t(key, params);
    var messages = bridge && bridge.i18n && bridge.i18n.messages ? bridge.i18n.messages : {};
    var fallback = bridge && bridge.i18n && bridge.i18n.fallback ? bridge.i18n.fallback : {};
    var template = messages[key] || fallback[key] || key;
    Object.keys(params).forEach(function (k) {
      template = String(template).replace(new RegExp("\\{" + k + "\\}", "g"), String(params[k] == null ? "" : params[k]));
    });
    return String(template);
  } catch (_) {
    return String(key || "");
  }
}

if (typeof globalThis.__noriaTaskCalendarUi.renderStatisticButton !== "function") {
  globalThis.__noriaTaskCalendarUi.renderStatisticButton = function renderStatisticButton(statBtn, options) {
    if (!statBtn || !options) return;
    var glyph = String(options.glyph || "");
    var percentage = options.percentage;
    var pctText = Number.isFinite(percentage) ? (percentage + "%") : "—";
    statBtn.innerHTML = "<span class='tc-stat-glyph'>" + glyph + "</span><span class='tc-stat-pct'>" + pctText + "</span>";
  };
}

if (typeof globalThis.__noriaTaskCalendarUi.renderStatisticLine !== "function") {
  globalThis.__noriaTaskCalendarUi.renderStatisticLine = function renderStatisticLine(node, options) {
    if (!node || !options) return;
    var icon = String(options.icon || "");
    var label = String(options.label || "");
    var value = String(options.value || "");
    var tone = String(options.tone || "");
    node.classList.remove("tone-success", "tone-primary", "tone-warning", "tone-info", "tone-muted");
    node.classList.add("statLine");
    if (tone) {
      node.classList.add(tone);
    }
    node.innerHTML =
      "<span class='metricLabel'><span class='metricIcon'>" +
      icon +
      "</span><span class='metricText'>" +
      label +
      "</span></span><span class='metricValue'>" +
      value +
      "</span>";
  };
}

if (typeof globalThis.__noriaTaskCalendarUi.createToolbarButton !== "function") {
  globalThis.__noriaTaskCalendarUi.createToolbarButton = function createToolbarButton(options) {
    var opts = options || {};
    var doc = opts.doc || globalThis.document;
    if (!doc || typeof doc.createElement !== "function") return null;
    var btn = doc.createElement("button");
    btn.type = "button";
    btn.className = String(opts.className || "");
    if (opts.title) btn.setAttribute("title", String(opts.title));
    if (opts.iconHtml) btn.innerHTML = String(opts.iconHtml);
    if (opts.labelText) {
      var span = doc.createElement("span");
      span.className = "tc-btn-label";
      span.textContent = String(opts.labelText);
      btn.appendChild(span);
    }
    return btn;
  };
}

if (typeof globalThis.__noriaTaskCalendarUi.createSegmentedContainer !== "function") {
  globalThis.__noriaTaskCalendarUi.createSegmentedContainer = function createSegmentedContainer(options) {
    var opts = options || {};
    var doc = opts.doc || globalThis.document;
    if (!doc || typeof doc.createElement !== "function") return null;
    var el = doc.createElement("div");
    el.className = String(opts.className || "tc-segmented");
    el.setAttribute("role", "tablist");
    if (opts.ariaLabel) el.setAttribute("aria-label", String(opts.ariaLabel));
    return el;
  };
}

if (typeof globalThis.__noriaTaskCalendarUi.createButtonGroup !== "function") {
  globalThis.__noriaTaskCalendarUi.createButtonGroup = function createButtonGroup(options) {
    var opts = options || {};
    var doc = opts.doc || globalThis.document;
    if (!doc || typeof doc.createElement !== "function") return null;
    var el = doc.createElement("div");
    el.className = String(opts.className || "");
    return el;
  };
}

if (typeof globalThis.__noriaTaskCalendarUi.createNavArrowsGroup !== "function") {
  globalThis.__noriaTaskCalendarUi.createNavArrowsGroup = function createNavArrowsGroup(options) {
    var opts = options || {};
    var doc = opts.doc || globalThis.document;
    var mkBtn = opts.mkBtn;
    if (!doc || typeof doc.createElement !== "function" || typeof mkBtn !== "function") return null;
    var navArrows = doc.createElement("div");
    navArrows.className = "tc-nav-arrows";
    navArrows.setAttribute("role", "group");
    navArrows.setAttribute("aria-label", noriaTaskCalendarUiT("runtime.tasksCalendar.nav.group"));
    navArrows.appendChild(mkBtn("previous", noriaTaskCalendarUiT("runtime.tasksCalendar.nav.previous"), String(opts.leftIcon || ""), ""));
    navArrows.appendChild(mkBtn("tcNavToday", noriaTaskCalendarUiT("runtime.tasksCalendar.nav.todayTitle"), "", noriaTaskCalendarUiT("runtime.tasksCalendar.nav.today")));
    navArrows.appendChild(mkBtn("next", noriaTaskCalendarUiT("runtime.tasksCalendar.nav.next"), String(opts.rightIcon || ""), ""));
    return navArrows;
  };
}

if (typeof globalThis.__noriaTaskCalendarUi.createStatisticButton !== "function") {
  globalThis.__noriaTaskCalendarUi.createStatisticButton = function createStatisticButton(options) {
    var opts = options || {};
    var mkBtn = opts.mkBtn;
    if (typeof mkBtn !== "function") return null;
    var stat = mkBtn("statistic", noriaTaskCalendarUiT("runtime.tasksCalendar.nav.stats"), "", "");
    if (!stat) return null;
    stat.setAttribute("percentage", "");
    stat.setAttribute("data-total", "0");
    stat.innerHTML = "<span class='tc-stat-glyph'>" + String(opts.glyph || "") + "</span><span class='tc-stat-pct'>—</span>";
    return stat;
  };
}
