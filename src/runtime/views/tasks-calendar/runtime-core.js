let {pages, view, firstDayOfWeek, globalTaskFilter, dailyNoteFolder, dailyNoteFormat, startPosition, upcomingDays, css, options, templateLibraryPath, noriaBridge, noriaPluginTabRole} = input || {};
var bridgeCfg = (noriaBridge && typeof noriaBridge === "object") ? noriaBridge : {};
var bridge = bridgeCfg;
var taskCalendarZone = !resolveTimelineModeContract().isTimelineMode && bridgeCfg.tasksCalendar?.zone
 ? bridgeCfg.tasksCalendar.zoneAdapter(bridgeCfg.tasksCalendar.zone) : null;
if(taskCalendarZone){
 var sourceTaskBridge=bridgeCfg.tasks,sourceRuntimeBridge=bridgeCfg.runtime;
 noriaBridge=bridgeCfg=bridge={...bridgeCfg,tasks:{...sourceTaskBridge,
  parseTaskLine:taskCalendarZone.parseTaskLine,patchTaskDates:taskCalendarZone.patchTaskDates,patchTaskLine:taskCalendarZone.patchTaskLine,
  openDetails:(task,options)=>sourceTaskBridge.openDetails(task,{...options,calendarZone:{source:taskCalendarZone.source,display:taskCalendarZone.display}})
 },runtime:{...sourceRuntimeBridge,openPeriodTaskCreate:options=>sourceRuntimeBridge.openPeriodTaskCreate({...options,calendarZone:{source:taskCalendarZone.source,display:taskCalendarZone.display}})}};
}
function calendarNow(){return taskCalendarZone?moment(taskCalendarZone.now(),"YYYY-MM-DD HH:mm",true):moment();}

var tasksCalendarRuntimeBuildId = String(
	bridgeCfg.runtimeBuildId ||
	(typeof globalThis !== "undefined" ? globalThis.__noriaRuntimeBuildId : "") ||
	"dev"
);

function getTaskCalendarAdapterLoadState() {
	try {
		var g = globalThis;
		if (!g.__noriaTaskCalendarAdapterLoadState || g.__noriaTaskCalendarAdapterLoadState.buildId !== tasksCalendarRuntimeBuildId) {
			g.__noriaTaskCalendarAdapterLoadState = {
				buildId: tasksCalendarRuntimeBuildId,
				adapters: {},
				updatedAt: Date.now()
			};
		}
		if (!g.__noriaTaskCalendarAdapterLoadState.adapters) {
			g.__noriaTaskCalendarAdapterLoadState.adapters = {};
		}
		return g.__noriaTaskCalendarAdapterLoadState;
	} catch (_) {
		return { buildId: tasksCalendarRuntimeBuildId, adapters: {} };
	}
}

function tcRuntimeT(key, params) {
	params = params || {};
	try {
		if (noriaBridge && typeof noriaBridge.t === "function") {
			var direct = noriaBridge.t(key, params);
			if (direct && direct !== key) { return String(direct); }
		}
	} catch (_) {}
	try {
		var i18n = noriaBridge && noriaBridge.i18n ? noriaBridge.i18n : null;
		var messages = (i18n && i18n.messages) || {};
		var fallback = (i18n && i18n.fallback) || {};
		var raw = messages[key] || fallback[key] || key;
		return String(raw).replace(/\{([^}]+)\}/g, function (_, name) {
			return params[name] == null ? "" : String(params[name]);
		});
	} catch (_) {
		return String(key || "");
	}
}

var TASKS_CALENDAR_EN_MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var TASKS_CALENDAR_EN_MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function tasksCalendarRuntimeLocale() {
	var raw = String(
		bridgeCfg.locale ||
		(bridgeCfg.i18n && bridgeCfg.i18n.locale) ||
		"en"
	).trim();
	return /^zh(?:-|$)/i.test(raw) ? "zh-CN" : "en";
}

function enMonthName(value, longName) {
	var m = moment(value);
	var index = m.isValid() ? m.month() : -1;
	var names = longName ? TASKS_CALENDAR_EN_MONTHS_LONG : TASKS_CALENDAR_EN_MONTHS_SHORT;
	return index >= 0 && index < names.length ? names[index] : "";
}

function formatTasksCalendarWeekTitle(week) {
	var wb = weekBoundsFromFirstDaySetting(week);
	var s0 = wb.start;
	var s1 = wb.end;
	var y0 = s0.year();
	var m0 = s0.month() + 1;
	var d0 = s0.date();
	var y1 = s1.year();
	var m1 = s1.month() + 1;
	var d1 = s1.date();
	var wk = "W" + wb.start.clone().add(3, "days").isoWeek();
	var locale = tasksCalendarRuntimeLocale();
	if (locale === "zh-CN") {
		if (y0 === y1) {
			var zhDatePart = m0 === m1
				? m0 + "月" + d0 + "日 – " + d1 + "日"
				: m0 + "月" + d0 + "日 – " + m1 + "月" + d1 + "日";
			return wk ? zhDatePart + " · " + wk + " " + y0 + "年" : zhDatePart + " " + y0 + "年";
		}
		var zhMain = y0 + "年" + m0 + "月" + d0 + "日 – " + y1 + "年" + m1 + "月" + d1 + "日";
		return wk ? zhMain + " · " + wk : zhMain;
	}
	var startName = enMonthName(s0, false);
	var endName = enMonthName(s1, false);
	if (y0 === y1) {
		var enDatePart = m0 === m1
			? startName + " " + d0 + " – " + d1
			: startName + " " + d0 + " – " + endName + " " + d1;
		return wk ? enDatePart + " · " + wk + " " + y0 : enDatePart + " " + y0;
	}
	var enMain = startName + " " + d0 + ", " + y0 + " – " + endName + " " + d1 + ", " + y1;
	return wk ? enMain + " · " + wk : enMain;
}

function formatTasksCalendarDayTitle(day) {
	var m = moment(day);
	var y = m.year();
	var mo = m.month() + 1;
	var d = m.date();
	if (tasksCalendarRuntimeLocale() === "zh-CN") {
		var zhLine = mo + "月" + d + "日";
		return zhLine + " " + y + "年";
	}
	var enLine = enMonthName(m, false) + " " + d;
	return enLine + " " + y;
}

function formatTasksCalendarMonthTitle(month) {
	var m = moment(month);
	if (tasksCalendarRuntimeLocale() === "zh-CN") {
		return (m.month() + 1) + "月 " + m.year() + "年";
	}
	return enMonthName(m, true) + " " + m.year();
}

function getTasksCalendarRuntimeSettings() {
	try {
		if (bridgeCfg.tasksCalendar && typeof bridgeCfg.tasksCalendar.getSettings === "function") {
			var fromGetter = bridgeCfg.tasksCalendar.getSettings();
			if (fromGetter && typeof fromGetter === "object") return fromGetter;
		}
	} catch (_) {}
	try {
		var direct = bridgeCfg.tasksCalendarSettings;
		return (direct && typeof direct === "object") ? direct : {};
	} catch (_) {
		return {};
	}
}

function normalizeTasksCalendarGranularity(raw, fallback) {
	var value = String(raw || "").trim();
	return /^(day|week|month|year)$/.test(value) ? value : (fallback || "week");
}

function readTasksCalendarLegacyPreference(legacyKey, fallback, type) {
	if (!legacyKey) return fallback;
	try {
		if (type === "boolean") return localStorage.getItem(legacyKey) === "1";
		var saved = localStorage.getItem(legacyKey);
		return saved || fallback;
	} catch (_) {
		return fallback;
	}
}

function getTasksCalendarGranularityPreference(key, fallback, legacyKey) {
	var settings = getTasksCalendarRuntimeSettings();
	if (settings && Object.prototype.hasOwnProperty.call(settings, key)) {
		return normalizeTasksCalendarGranularity(settings[key], fallback);
	}
	return normalizeTasksCalendarGranularity(readTasksCalendarLegacyPreference(legacyKey, fallback, "string"), fallback);
}

function getTasksCalendarBooleanPreference(key, fallback, legacyKey) {
	var settings = getTasksCalendarRuntimeSettings();
	if (settings && Object.prototype.hasOwnProperty.call(settings, key)) {
		return settings[key] === true;
	}
	return readTasksCalendarLegacyPreference(legacyKey, !!fallback, "boolean") === true;
}

function saveTasksCalendarRuntimePreference(key, value, legacyKey) {
	try {
		if (!bridgeCfg.tasksCalendarSettings || typeof bridgeCfg.tasksCalendarSettings !== "object") {
			bridgeCfg.tasksCalendarSettings = {};
		}
		bridgeCfg.tasksCalendarSettings[key] = value;
	} catch (_) {}
	try {
		var api = bridgeCfg.tasksCalendar;
		if (api && typeof api.savePreference === "function") {
			var result = api.savePreference(key, value);
			if (result && typeof result.then === "function") {
				result.then(function (saved) {
					try {
						if (saved && saved.settings && typeof saved.settings === "object") {
							bridgeCfg.tasksCalendarSettings = saved.settings;
						}
					} catch (_) {}
				}).catch(function () {
					try { if (legacyKey) localStorage.setItem(legacyKey, value === true ? "1" : String(value || "")); } catch (_) {}
				});
			}
			return true;
		}
	} catch (_) {}
	try {
		if (legacyKey) localStorage.setItem(legacyKey, value === true ? "1" : String(value || ""));
	} catch (_) {}
	return false;
}

// Error Handling
if (!pages && pages!="") { ctx.span('> [!ERROR] Missing pages parameter\n> \n> Please set the pages parameter like\n> \n> `pages: ""`'); return false };
if (!options || typeof options !== "string") { options = "planner-chrome"; }
var optionsTokens = String(options || "").split(/\s+/).filter(Boolean).filter(function (t) { return !/^style\d+$/i.test(t); });
if (optionsTokens.indexOf("planner-chrome") < 0) { optionsTokens.unshift("planner-chrome"); }
options = optionsTokens.join(" ");
if (!view) { ctx.span('> [!ERROR] Missing view parameter\n> \n> Please set a default view inside view parameter like\n> \n> `view: "month"`'); return false };
if (firstDayOfWeek) {
	if (firstDayOfWeek.match(/[|\\0123456]/g) == null) {
		ctx.span('> [!ERROR] Wrong value inside firstDayOfWeek parameter\n> \n> Please choose a number between 0 and 6');
		return false
	};
} else {
	ctx.span(tcRuntimeT("runtime.tasksCalendar.error.missingFirstDayOfWeek"));
	return false
};

function taskCalendarConfiguredWeekStart(value) {
	var anchor = moment(value || calendarNow()).startOf("day");
	var firstDay = parseInt(String(firstDayOfWeek), 10);
	if (!Number.isFinite(firstDay) || firstDay < 0 || firstDay > 6) { firstDay = 0; }
	var delta = (anchor.day() - firstDay + 7) % 7;
	return anchor.subtract(delta, "days");
}

if (startPosition) { if (!startPosition.match(/\d{4}\-\d{1,2}/gm)) { ctx.span('> [!ERROR] Wrong startPosition format\n> \n> Please set a startPosition with the following format\n> \n> Month: `YYYY-MM` | Week: `YYYY-ww`'); return false }};
if (dailyNoteFormat) { var __dnf = dailyNoteFormat.match(/[|\\YMDWwd.,-: \[\]]/g); if (!__dnf || __dnf.length != dailyNoteFormat.length) { ctx.span('> [!ERROR] The `dailyNoteFormat` contains invalid characters'); return false }};

function runtimeRowsToArray(raw) {
	if (raw == null) return [];
	if (Array.isArray(raw)) return raw;
	var best = [];
	function consider(candidate) {
		if (!Array.isArray(candidate) || candidate.length === 0) return;
		var filtered = candidate.filter(function (x) { return x != null; });
		if (filtered.length > best.length) best = filtered;
	}
	try {
		if (typeof raw.array === "function") consider(raw.array());
	} catch (_) {}
	try {
		if (typeof raw.length === "number" && raw.length > 0) {
			var accL = [];
			for (var li = 0; li < raw.length; li++) {
				if (raw[li] !== undefined) accL.push(raw[li]);
			}
			consider(accL);
		}
	} catch (_) {}
	try {
		consider(Array.from(raw));
	} catch (_) {}
	return best;
}

function tasksFromPageFile(pg) {
	if (!pg || !pg.file) return [];
	var ft = pg.file.tasks;
	var out = runtimeRowsToArray(ft);
	if (out.length > 0) return out;
	var lists = pg.file.lists;
	var listArr = runtimeRowsToArray(lists);
	var acc = [];
	for (var li = 0; li < listArr.length; li++) {
		var item = listArr[li];
		if (item && item.task === true) acc.push(item);
	}
	return acc;
}

function parseTaskCalendarCtxPagesExpression(pagesSpec) {
	var source = String(pagesSpec || "").trim().replace(/;+\s*$/, "");
	var match = source.match(/^ctx\.pages\s*\(\s*(["'])([\s\S]*?)\1\s*\)\s*(?:\.file\.tasks)?\s*$/);
	if (!match) return null;
	var spec = String(match[2] || "")
		.replace(/\\(["'\\])/g, "$1")
		.replace(/\\n/g, "\n")
		.replace(/\\t/g, "\t");
	return {
		spec: spec,
		directTasks: /\.file\.tasks\s*$/.test(source)
	};
}

function collectTasksFromTaskCalendarCtxPagesExpression(pagesSpec) {
	var parsed = parseTaskCalendarCtxPagesExpression(pagesSpec);
	if (!parsed) return null;
	var pagesResult = collectPagesFromDynamicSpec(parsed.spec);
	if (!pagesResult) return [];
	var direct = pagesResult && pagesResult.file && pagesResult.file.tasks;
	var flat = runtimeRowsToArray(direct);
	if (flat.length > 0) return flat;
	var pageArr = runtimeRowsToArray(pagesResult);
	var acc = [];
	for (var pi = 0; pi < pageArr.length; pi++) {
		acc = acc.concat(tasksFromPageFile(pageArr[pi]));
	}
	return acc;
}

function getTaskSnapshotCacheKey(pagesSpec) {
	try {
		var snapshots = noriaBridge && noriaBridge.taskSnapshots ? noriaBridge.taskSnapshots : null;
		if (!snapshots || typeof snapshots.key !== "function") return "";
		return snapshots.key({
			pages: String(pagesSpec == null ? "" : pagesSpec),
			scopeId: "tasks",
			view: String(view || ""),
			scope: String(noriaPluginTabRole || "tasksCalendar"),
			taskQueryContext: noriaBridge && noriaBridge.taskQueryContext ? noriaBridge.taskQueryContext : null
		});
	} catch (_) {
		return "";
	}
}

function collectTasksForCalendarCached(pagesSpec, collector) {
	var snapshots = null;
	var key = "";
	try {
		snapshots = noriaBridge && noriaBridge.taskSnapshots ? noriaBridge.taskSnapshots : null;
		key = getTaskSnapshotCacheKey(pagesSpec);
		if (snapshots && key && typeof snapshots.get === "function") {
			var cached = snapshots.get(key);
			if (Array.isArray(cached)) return cached;
		}
	} catch (_) {}
	var next = collector();
	try {
		if (snapshots && key && typeof snapshots.set === "function" && Array.isArray(next)) {
			snapshots.set(key, next);
		}
	} catch (_) {}
	return next;
}

function collectTasksByPathPrefix(folderPrefix) {
	var norm = String(folderPrefix || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
	if (!norm) return [];
	var acc = [];
	try {
		var allPages = ctx.pages('"' + norm.replace(/"/g, '\\"') + '"');
		var plist = runtimeRowsToArray(allPages);
		if (plist.length === 0) return [];
		for (var i = 0; i < plist.length; i++) {
			var pg = plist[i];
			var path = (pg && pg.file && pg.file.path) ? String(pg.file.path).replace(/\\/g, "/") : "";
			if (path !== norm && path.indexOf(norm + "/") !== 0) continue;
			acc = acc.concat(tasksFromPageFile(pg));
		}
	} catch (err) {
		console.error("[noria tasksCalendar] collectTasksByPathPrefix failed:", norm, err);
	}
	return acc;
}

function resolveDataTaskPriority(item, rawText) {
	item = item || {};
	var classification = item.classification || {};
	var explicit = String(classification.priority || item.priority || "").trim().toLowerCase();
	var text = String(rawText || "");
	if (text.indexOf("🔺") >= 0) return "highest";
	if (text.indexOf("⏫") >= 0) return "high";
	if (text.indexOf("🔼") >= 0) return "medium";
	if (text.indexOf("🔽") >= 0) return "low";
	if (text.indexOf("⏬") >= 0) return "lowest";
	var inline = text.match(/\[priority::\s*([^\]]+)\]/i);
	var value = String(inline ? inline[1] : explicit).trim().toLowerCase();
	if (value === "0" || value === "highest") return "highest";
	if (value === "a" || value === "1" || value === "high") return "high";
	if (value === "b" || value === "2" || value === "medium" || value === "normal-high") return "medium";
	if (value === "d" || value === "4" || value === "low") return "low";
	if (value === "5" || value === "lowest") return "lowest";
	return "normal";
}

function adaptDataTaskToRuntimeTask(item) {
	item = item || {};
	var dates = item.dates || {};
	var source = item.source || {};
	var identity = item.identity || {};
	var checkbox = item.checkbox || {};
	var rawText = String((item.text && (item.text.raw || item.text.clean)) || item.title || "");
	var row = {
		text: rawText,
		rawText: rawText,
		rawLine: String(source.rawLine || rawText),
		path: normalizeVaultRelPath(source.path || identity.sourcePath || ""),
		line: Number(identity.line != null ? identity.line : source.line) || 0,
		completed: item.completed === true,
		checked: item.checked === true,
		status: checkbox.state || item.status || "",
		checkbox: { mark: checkbox.mark || "", state: checkbox.state || "" },
		priority: resolveDataTaskPriority(item, String(source.rawLine || rawText)),
		start: dates.start || "",
		due: dates.due || "",
		scheduled: dates.scheduled || "",
		completion: dates.completion || "",
		created: dates.created || "",
		link: { path: normalizeVaultRelPath(source.path || identity.sourcePath || "") },
		__noriaSource: "data"
	};
	return row;
}

async function collectFreshTasksForCalendar(pagesSpec) {
	try {
		if (!noriaBridge || !noriaBridge.data || typeof noriaBridge.data.getTasks !== "function") return [];
		var anchor = calendarNow().format("YYYY-MM-DD");
		var result = await noriaBridge.data.getTasks({
			range: { mode: "custom", start: anchor, end: anchor },
			bucketBy: "board",
			status: "all",
			rangePolicy: "allFacts",
			source: { pages: String(pagesSpec == null ? "" : pagesSpec) }
		});
		var items = result && Array.isArray(result.items) ? result.items : [];
		return items.map(adaptDataTaskToRuntimeTask);
	} catch (err) {
		try { console.warn("[noria tasksCalendar] fresh task source failed:", err); } catch (_) {}
		return [];
	}
}

function collectFallbackTasksForCalendar(pagesSpec) {
	return collectTasksForCalendarCached(pagesSpec, function () {
		return collectTasksForCalendarUncached(pagesSpec);
	});
}

function collectTasksForCalendarUncached(pagesSpec) {
	if (pagesSpec == "") {
		var accAll = [];
		var allP = runtimeRowsToArray(
			noriaBridge && noriaBridge.runtime && typeof noriaBridge.runtime.pagesForScope === "function"
				? noriaBridge.runtime.pagesForScope("tasks", ctx)
				: []
		);
		for (var ai = 0; ai < allP.length; ai++) {
			accAll = accAll.concat(tasksFromPageFile(allP[ai]));
		}
		return accAll;
	}
	if (typeof pagesSpec === "string" && pagesSpec.startsWith("ctx.pages")) {
		var fromExpression = collectTasksFromTaskCalendarCtxPagesExpression(pagesSpec);
		return fromExpression || [];
	}
	if (pagesSpec && typeof pagesSpec.every === "function" && pagesSpec.every(function (p) { return p.task; })) {
		return runtimeRowsToArray(pagesSpec);
	}
	var pagesResult = collectPagesFromDynamicSpec(pagesSpec);
	if (!pagesResult) return [];
	var direct = pagesResult && pagesResult.file && pagesResult.file.tasks;
	var flat = runtimeRowsToArray(direct);
	if (flat.length > 0) return flat;
	var pageArr = runtimeRowsToArray(pagesResult);
	var acc = [];
	for (var pi = 0; pi < pageArr.length; pi++) {
		acc = acc.concat(tasksFromPageFile(pageArr[pi]));
	}
	if (acc.length > 0) return acc;
	if (typeof pagesSpec === "string") {
		var bare = String(pagesSpec).trim().replace(/^["']+|["']+$/g, "");
		if (bare && bare !== String(pagesSpec).trim()) {
			try {
				var pr2 = collectPagesFromDynamicSpec(bare);
				if (!pr2) return acc;
				var d2 = pr2 && pr2.file && pr2.file.tasks;
				var f2 = runtimeRowsToArray(d2);
				if (f2.length > 0) return f2;
				var arr2 = runtimeRowsToArray(pr2);
				var acc2 = [];
				for (var j = 0; j < arr2.length; j++) {
					acc2 = acc2.concat(tasksFromPageFile(arr2[j]));
				}
				if (acc2.length > 0) return acc2;
			} catch (_) {}
		}
	}
	if (typeof pagesSpec === "string") {
		var folderGuess = String(pagesSpec).trim().replace(/^["']+|["']+$/g, "");
		if (folderGuess) {
			var byPrefix = collectTasksByPathPrefix(folderGuess);
			if (byPrefix.length > 0) return byPrefix;
		}
	}
	return acc;
}

function collectPagesFromDynamicSpec(spec) {
	try {
		return ctx.pages(spec);
	} catch (err) {
		console.error("[noria tasksCalendar] dynamic metadata pages failed:", spec, err);
		return null;
	}
}

// Get, Set, Eval Pages（扁平化 DataArray，并在 .file.tasks 为空时逐页回退收集）
var tasks = await collectFreshTasksForCalendar(pages);
if (!tasks.length) {
	tasks = collectFallbackTasksForCalendar(pages);
}
if (!tasks.length) {
	console.warn("[noria tasksCalendar] 0 tasks after collectFreshTasksForCalendar, pages=", pages);
}

var tcStartupRecoverTimers = [];
var tcStartupRecoverStopped = false;
var tcRuntimeDisposed = false;
var tcFreshTaskInvalidationRef = null;

function clearStartupTaskRecoveryTimers() {
	if (!tcStartupRecoverTimers || !tcStartupRecoverTimers.length) { return; }
	for (var i = 0; i < tcStartupRecoverTimers.length; i++) {
		try { clearTimeout(tcStartupRecoverTimers[i]); } catch (_) {}
	}
	tcStartupRecoverTimers = [];
}

function clearFreshTaskInvalidationEvent() {
	var ref = tcFreshTaskInvalidationRef;
	tcFreshTaskInvalidationRef = null;
	try {
		if (ref && app && app.workspace && typeof app.workspace.offref === "function") {
			app.workspace.offref(ref);
		}
	} catch (_) {}
}

var tcTaskSourceRevision = 0;
var tcTaskSourceRequest = 0;
async function refreshTasksFromFreshSource(reason) {
	var revision = tcTaskSourceRevision;
	var request = ++tcTaskSourceRequest;
	var raw = [];
	try {
		raw = await collectFreshTasksForCalendar(pages);
		if (!raw.length) raw = collectFallbackTasksForCalendar(pages);
	} catch (e0) {
		try { console.warn("[noria tasksCalendar] refresh collect failed:", reason || "", e0); } catch (_) {}
		raw = [];
	}
	var next = [];
	try {
		next = getMeta(raw);
	} catch (e1) {
		try { console.warn("[noria tasksCalendar] refresh getMeta failed:", reason || "", e1); } catch (_) {}
		next = [];
	}
	// A read started before a local write must not replace its committed preview.
	if (request !== tcTaskSourceRequest || revision !== tcTaskSourceRevision || plannerChromeInteractionActive || editModeActive) {
		tcRefreshDeferredByInteraction = true;
		return -1;
	}
	tasks = next;
	return next.length;
}

function refreshTasksFromFallbackSource(reason) {
	var raw = [];
	try {
		raw = collectFallbackTasksForCalendar(pages);
	} catch (e0) {
		try { console.warn("[noria tasksCalendar] metadata refresh collect failed:", reason || "", e0); } catch (_) {}
		raw = [];
	}
	var next = [];
	try {
		next = getMeta(raw);
	} catch (e1) {
		try { console.warn("[noria tasksCalendar] metadata refresh getMeta failed:", reason || "", e1); } catch (_) {}
		next = [];
	}
	tasks = next;
	return next.length;
}

function rerenderCalendarAfterTaskRefresh(reason) {
	Promise.resolve(refreshTasksFromFreshSource(reason || "manual")).then(function (n) {
		if (n <= 0) { return false; }
		try {
			rerenderCalendarViewNow();
		} catch (_) {
			try { renderTaskCalendarViewNow(view, selectedDate); } catch (_) {}
		}
		return true;
	}).catch(function () {});
	return true;
}

function bindFreshTaskInvalidationEvent() {
	try {
		if (tcRuntimeDisposed) return;
		if (!app || !app.workspace || typeof app.workspace.on !== "function") return;
		clearFreshTaskInvalidationEvent();
		tcFreshTaskInvalidationRef = app.workspace.on("noria:tasks-invalidated", function (payload) {
			if (tcRuntimeDisposed) return;
			if (plannerChromeInteractionActive || editModeActive) {
				tcRefreshDeferredByInteraction = true;
				return;
			}
			scheduleTasksCalendarSoftRefresh(180);
		});
	} catch (_) {}
}

function scheduleStartupTaskRecovery() {
	if (tcRuntimeDisposed || tcStartupRecoverStopped) { return; }
	tcStartupRecoverStopped = false;
	clearStartupTaskRecoveryTimers();
	var plan = [500, 1200, 2200, 3600, 5600, 9000, 14000];
	for (var i = 0; i < plan.length; i++) {
		(function (idx) {
			var tid = setTimeout(function () {
				if (tcStartupRecoverStopped) { return; }
				if (!rootNode || !rootNode.isConnected) { return; }
				var ok = rerenderCalendarAfterTaskRefresh("startup-recover#" + String(idx + 1));
				if (ok) {
					tcStartupRecoverStopped = true;
					clearStartupTaskRecoveryTimers();
				}
			}, plan[idx]);
			tcStartupRecoverTimers.push(tid);
		})(i);
	}
}

// Variables
var done, doneWithoutCompletionDate, due, recurrence, overdue, start, scheduled, process, cancelled, dailyNote;
var timelineQuickStrategy = "daily-only";
var timelineQuickTargetDate = "";
var timelineQuickTargetContext = "";
var quickActionBusy = false;
/** 四象限数据范围：日 / 周 / 月 / 年（默认周）；持久化便于下次打开 */
var eisenhowerGranularity = getTasksCalendarGranularityPreference("eisenhowerGranularity", "week", "noria.eisen.granularity");
var eisenhowerFocusDate = null;
var editModeActive = false;
var pendingDeleteMode = false;
var pendingTaskChanges = new Map();
/* v0.4: 先在同文件内落地最小 store，后续再拆模块 */
var tcFeatureFlags = {
	storeWeek: true,
	dayView: true,
	clockOverlay: false,
	wrapperBridge: true,
	tasksNative: true
};
var taskStore = {
	view: { mode: "week", anchorDate: calendarNow().format("YYYY-MM-DD") },
	edit: { mode: "idle", deleteMarking: false, frozen: false },
	interaction: { active: false, draggingTaskId: "" },
	tasks: new Map(),
	pending: pendingTaskChanges
};
function setTaskStoreView(mode, anchorDate) {
	taskStore.view.mode = String(mode || taskStore.view.mode || "week");
	taskStore.view.anchorDate = String(anchorDate || taskStore.view.anchorDate || calendarNow().format("YYYY-MM-DD"));
	try {
		if (rootNode && rootNode.setAttribute) {
			rootNode.setAttribute("data-noria-current-view", taskStore.view.mode);
			rootNode.setAttribute("data-noria-current-anchor", taskStore.view.anchorDate);
			var itemHost = rootNode.closest(".noria-tasks-host");
			if (itemHost) { itemHost.setAttribute("data-noria-calendar-view", taskStore.view.mode); }
		}
	} catch (_) {}
}
function setTaskStoreEditMode(mode) {
	taskStore.edit.mode = String(mode || "idle");
	taskStore.edit.deleteMarking = !!pendingDeleteMode;
	taskStore.edit.frozen = !!(editModeActive || plannerChromeInteractionActive);
}
function getPendingPatches() {
	return Array.from(taskStore.pending.values());
}
var customInlineOpen = false;
var customInlineDraft = {
	label: "",
	tagSuffix: "",
	startTime: "",
	durationMin: "30",
	saveToLibrary: false
};
var DEFAULT_TEMPLATE_LIBRARY_PATH = ".obsidian/plugins/noria/config/template-library.md";
var TIMELINE_IO_ADAPTER_PATH = ".obsidian/plugins/noria/core/adapters/timeline-io-adapter.js";
var TIMELINE_ACTIONS_ADAPTER_PATH = ".obsidian/plugins/noria/core/adapters/timeline-actions-adapter.js";
var adapterCache = {};
var quickEventLibraryCache = {
	path: "",
	mtime: null,
	signature: "",
	templates: [],
	all: [],
	source: "loading",
	promise: null
};
var timelineSettings = Object.assign({}, bridgeCfg.timelineQuickSettings || {});
function normalizeRuntimeStrategy(raw) {
	var v = String(raw || "").trim().toLowerCase();
	if (v == "daily") return "daily-only";
	if (v == "weekly") return "weekly-all";
	if (v == "mixed") return "mixed";
	if (v == "daily-only" || v == "weekly-all") return v;
	return "";
}
function normalizeNoriaPath(raw) {
	var s = String(raw || "").trim();
	if (!s) return "";
	return s;
}
function getWrapperTimelineCompat() {
	try {
		var o = bridgeCfg && bridgeCfg.wrapperTimelineCompat;
		return (o && typeof o === "object") ? o : {};
	} catch (_) {
		return {};
	}
}
var showEarlyHours = getTasksCalendarBooleanPreference("showEarlyHours", false, "noria-tc-show-early-hours");
var plannerActiveHours = getTasksCalendarRuntimeSettings().activeHours || { start: 360, end: 1440 };
var plannerHoursExpanded = false;
var plannerHoursEntries = new Map();
var bridgePaths = (bridgeCfg.runtimePaths && typeof bridgeCfg.runtimePaths === "object") ? bridgeCfg.runtimePaths : {};
var bridgeSizing = (bridgeCfg.sizing && typeof bridgeCfg.sizing === "object") ? bridgeCfg.sizing : {};
var tcPlannerLabControls = null;
var tcPlannerLabSaveTimer = null;
function tcCloneJson(v) {
	try {
		return JSON.parse(JSON.stringify(v || {}));
	} catch (_) {
		return {};
	}
}
function tcDefaultPlannerLabControls() {
	return {
		global: {
			circleSize: 13,
			titleGap: 3,
			timeBadgeMinWidth: 42,
			timeBadgeMaxWidth: 64,
			borderAlpha: 0.58,
			shadowAlpha: 0.12
		},
		weekDay: {
			singleHeightThreshold: 30,
			hiddenThreshold: 92,
			startOnlyThreshold: 112,
			overlayHeightThreshold: 22,
			timeFontSize: 9,
			modeLockMs: 760,
			widthBucketStep: 4,
			heightBucketStep: 2,
			keepBias: 1
		},
		timeline: {
			timeColWidth: 62,
			axisColWidth: 28,
			timeColInset: 0,
			timeToAxisGap: 3,
			axisToCardGap: 5,
			cardRadius: 10,
			dragStepMin: 5,
			defaultDurationMin: 30,
			axisLineOffset: 3,
			taskGapY: 10,
			cardPaddingX: 8,
			cardPaddingY: 6,
			cardBorderAlpha: 0.58,
			cardShadowAlpha: 0.08,
			timeFontSize: 11.5,
			secondaryFontSize: 10,
			nodeSize: 18,
			timerBtnSize: 16,
			twoLineTimeGap: 2,
			durationLabelGap: 3,
			durationLabelFontSize: 9.5,
			hideNoTimeLabel: true,
			localRefreshDelay: 50
		}
	};
}
function tcMergePlannerLabControls(raw) {
	var base = tcDefaultPlannerLabControls();
	var src = (raw && typeof raw === "object") ? raw : {};
	var out = {
		global: Object.assign({}, base.global, src.global || {}),
		weekDay: Object.assign({}, base.weekDay, src.weekDay || {}),
		timeline: Object.assign({}, base.timeline, src.timeline || {})
	};
	function clampNum(v, fallback, min, max) {
		var n = Number(v);
		if (!Number.isFinite(n)) { return fallback; }
		return Math.max(min, Math.min(max, n));
	}
	out.global.circleSize = clampNum(out.global.circleSize, base.global.circleSize, 10, 22);
	out.global.titleGap = clampNum(out.global.titleGap, base.global.titleGap, 0, 12);
	out.global.timeBadgeMinWidth = clampNum(out.global.timeBadgeMinWidth, base.global.timeBadgeMinWidth, 24, 90);
	out.global.timeBadgeMaxWidth = clampNum(out.global.timeBadgeMaxWidth, base.global.timeBadgeMaxWidth, 32, 120);
	delete out.global.taskRadius;
	out.global.borderAlpha = clampNum(out.global.borderAlpha, base.global.borderAlpha, 0.1, 1);
	out.global.shadowAlpha = clampNum(out.global.shadowAlpha, base.global.shadowAlpha, 0, 0.5);
	if (out.global.timeBadgeMaxWidth < out.global.timeBadgeMinWidth) {
		out.global.timeBadgeMaxWidth = out.global.timeBadgeMinWidth;
	}
	out.weekDay.singleHeightThreshold = clampNum(out.weekDay.singleHeightThreshold, base.weekDay.singleHeightThreshold, 20, 42);
	out.weekDay.hiddenThreshold = clampNum(out.weekDay.hiddenThreshold, base.weekDay.hiddenThreshold, 64, 140);
	out.weekDay.startOnlyThreshold = clampNum(out.weekDay.startOnlyThreshold, base.weekDay.startOnlyThreshold, 80, 170);
	out.weekDay.overlayHeightThreshold = clampNum(out.weekDay.overlayHeightThreshold, base.weekDay.overlayHeightThreshold, 16, 34);
	out.weekDay.timeFontSize = clampNum(out.weekDay.timeFontSize, base.weekDay.timeFontSize, 7.5, 14);
	out.weekDay.modeLockMs = clampNum(out.weekDay.modeLockMs, base.weekDay.modeLockMs, 120, 1200);
	out.weekDay.widthBucketStep = clampNum(out.weekDay.widthBucketStep, base.weekDay.widthBucketStep, 2, 12);
	out.weekDay.heightBucketStep = clampNum(out.weekDay.heightBucketStep, base.weekDay.heightBucketStep, 1, 8);
	out.weekDay.keepBias = clampNum(out.weekDay.keepBias, base.weekDay.keepBias, 0, 4);
	if (out.weekDay.startOnlyThreshold < out.weekDay.hiddenThreshold + 8) {
		out.weekDay.startOnlyThreshold = out.weekDay.hiddenThreshold + 8;
	}
	out.timeline.timeColWidth = clampNum(out.timeline.timeColWidth, base.timeline.timeColWidth, 40, 96);
	out.timeline.axisColWidth = clampNum(out.timeline.axisColWidth, base.timeline.axisColWidth, 20, 48);
	out.timeline.timeColInset = clampNum(out.timeline.timeColInset, base.timeline.timeColInset, -12, 20);
	out.timeline.timeToAxisGap = clampNum(out.timeline.timeToAxisGap, base.timeline.timeToAxisGap, 0, 18);
	out.timeline.axisToCardGap = clampNum(out.timeline.axisToCardGap, base.timeline.axisToCardGap, 0, 20);
	out.timeline.cardRadius = clampNum(out.timeline.cardRadius, base.timeline.cardRadius, 6, 24);
	out.timeline.dragStepMin = clampNum(out.timeline.dragStepMin, base.timeline.dragStepMin, 5, 30);
	out.timeline.defaultDurationMin = clampNum(out.timeline.defaultDurationMin, base.timeline.defaultDurationMin, 15, 180);
	out.timeline.axisLineOffset = clampNum(out.timeline.axisLineOffset, base.timeline.axisLineOffset, -8, 18);
	out.timeline.taskGapY = clampNum(out.timeline.taskGapY, base.timeline.taskGapY, 2, 24);
	out.timeline.cardPaddingX = clampNum(out.timeline.cardPaddingX, base.timeline.cardPaddingX, 4, 20);
	out.timeline.cardPaddingY = clampNum(out.timeline.cardPaddingY, base.timeline.cardPaddingY, 4, 18);
	out.timeline.cardBorderAlpha = clampNum(out.timeline.cardBorderAlpha, base.timeline.cardBorderAlpha, 0.1, 1);
	out.timeline.cardShadowAlpha = clampNum(out.timeline.cardShadowAlpha, base.timeline.cardShadowAlpha, 0, 0.5);
	out.timeline.timeFontSize = clampNum(out.timeline.timeFontSize, base.timeline.timeFontSize, 9, 16);
	out.timeline.secondaryFontSize = clampNum(out.timeline.secondaryFontSize, base.timeline.secondaryFontSize, 8, 14);
	out.timeline.nodeSize = clampNum(out.timeline.nodeSize, base.timeline.nodeSize, 14, 26);
	out.timeline.timerBtnSize = clampNum(out.timeline.timerBtnSize, base.timeline.timerBtnSize, 12, 22);
	out.timeline.twoLineTimeGap = clampNum(out.timeline.twoLineTimeGap, base.timeline.twoLineTimeGap, 0, 10);
	out.timeline.durationLabelGap = clampNum(out.timeline.durationLabelGap, base.timeline.durationLabelGap, 0, 10);
	out.timeline.durationLabelFontSize = clampNum(out.timeline.durationLabelFontSize, base.timeline.durationLabelFontSize, 8, 14);
	out.timeline.localRefreshDelay = clampNum(out.timeline.localRefreshDelay, base.timeline.localRefreshDelay, 10, 500);
	out.timeline.hideNoTimeLabel = !!out.timeline.hideNoTimeLabel;
	return out;
}
function tcReadPlannerLabControls() {
	if (!tcPlannerLabControls) {
		var raw = bridgeCfg && bridgeCfg.plannerLabControls;
		if (bridgeCfg && typeof bridgeCfg.getPlannerLabControls === "function") {
			try { raw = bridgeCfg.getPlannerLabControls(); } catch (_) {}
		}
		tcPlannerLabControls = tcMergePlannerLabControls(raw);
	}
	return tcPlannerLabControls;
}
function tcApplyPlannerLabCssVars(target) {
	var host = target || rootNode;
	if (!host || !host.style) { return; }
	var cfg = tcReadPlannerLabControls();
	var globalCfg = cfg.global || {};
	try {
		host.style.setProperty("--noria-lab-circle-size", String(globalCfg.circleSize || 13) + "px");
		host.style.setProperty("--noria-lab-title-gap", String(globalCfg.titleGap || 3) + "px");
		host.style.setProperty("--noria-lab-time-badge-min-px", String(globalCfg.timeBadgeMinWidth || 42) + "px");
		host.style.setProperty("--noria-lab-time-badge-max-px", String(globalCfg.timeBadgeMaxWidth || 64) + "px");
		host.style.setProperty("--noria-lab-border-alpha", String(globalCfg.borderAlpha || 0.58));
		host.style.setProperty("--noria-lab-shadow-alpha", String(globalCfg.shadowAlpha || 0.12));
		host.style.setProperty("--noria-lab-weekday-time-size", String((cfg.weekDay && cfg.weekDay.timeFontSize) || 9) + "px");
	} catch (_) {}
}
function tcPersistPlannerLabControls() {
	if (!bridgeCfg || typeof bridgeCfg.savePlannerLabControls !== "function") { return; }
	try {
		bridgeCfg.savePlannerLabControls(tcCloneJson(tcReadPlannerLabControls()));
	} catch (_) {}
}
function tcFlushPlannerLabControlsSave() {
	if (!tcPlannerLabSaveTimer) { return; }
	try { clearTimeout(tcPlannerLabSaveTimer); } catch (_) {}
	tcPlannerLabSaveTimer = null;
	tcPersistPlannerLabControls();
}
function tcSchedulePlannerLabControlsSave() {
	if (tcPlannerLabSaveTimer) {
		try { clearTimeout(tcPlannerLabSaveTimer); } catch (_) {}
	}
	tcPlannerLabSaveTimer = setTimeout(function () {
		tcPlannerLabSaveTimer = null;
		tcPersistPlannerLabControls();
	}, 90);
}
if (bridgeCfg.features && typeof bridgeCfg.features === "object") {
	tcFeatureFlags.storeWeek = toBoolOr(bridgeCfg.features.storeWeek, tcFeatureFlags.storeWeek);
	tcFeatureFlags.dayView = toBoolOr(bridgeCfg.features.dayView, tcFeatureFlags.dayView);
	tcFeatureFlags.clockOverlay = toBoolOr(bridgeCfg.features.clockOverlay, tcFeatureFlags.clockOverlay);
	tcFeatureFlags.wrapperBridge = toBoolOr(bridgeCfg.features.wrapperBridge, tcFeatureFlags.wrapperBridge);
	tcFeatureFlags.tasksNative = toBoolOr(bridgeCfg.features.tasksNative, tcFeatureFlags.tasksNative);
}
if (typeof bridgeCfg.templateLibraryPath === "string" && bridgeCfg.templateLibraryPath.trim()) {
	DEFAULT_TEMPLATE_LIBRARY_PATH = normalizeNoriaPath(bridgeCfg.templateLibraryPath) || DEFAULT_TEMPLATE_LIBRARY_PATH;
}
if (typeof templateLibraryPath === "string" && templateLibraryPath.trim()) {
	DEFAULT_TEMPLATE_LIBRARY_PATH = normalizeNoriaPath(templateLibraryPath) || DEFAULT_TEMPLATE_LIBRARY_PATH;
}
if (typeof bridgePaths.timelineIoAdapterPath === "string" && bridgePaths.timelineIoAdapterPath.trim()) {
	TIMELINE_IO_ADAPTER_PATH = normalizeNoriaPath(bridgePaths.timelineIoAdapterPath) || TIMELINE_IO_ADAPTER_PATH;
}
if (typeof bridgePaths.timelineActionsAdapterPath === "string" && bridgePaths.timelineActionsAdapterPath.trim()) {
	TIMELINE_ACTIONS_ADAPTER_PATH = normalizeNoriaPath(bridgePaths.timelineActionsAdapterPath) || TIMELINE_ACTIONS_ADAPTER_PATH;
}
var bridgeStrategy = normalizeRuntimeStrategy(bridgeCfg.defaultStrategy);
if (bridgeStrategy) timelineQuickStrategy = bridgeStrategy;
if (bridgeCfg.sizing && typeof bridgeCfg.sizing === "object") {
	var bridgeBucket = parseInt(bridgeCfg.sizing.dayBucketHeight, 10);
	var bridgeLane = parseInt(bridgeCfg.sizing.laneHeight, 10);
	if (Number.isFinite(bridgeBucket) && bridgeBucket >= 32) timelineSettings.dayBucketHeight = bridgeBucket;
	if (Number.isFinite(bridgeLane) && bridgeLane >= 360) timelineSettings.laneHeight = bridgeLane;
}
function normalizeFilterTag(rawTag) {
	var tag = String(rawTag || "").trim().toLowerCase();
	if (!tag) return "";
	if (tag.startsWith("＃")) tag = "#" + tag.slice(1);
	if (!tag.startsWith("#")) tag = "#" + tag;
	return tag;
}
function parseFilterTagList(rawList) {
	if (Array.isArray(rawList)) {
		return rawList.map(normalizeFilterTag).filter(Boolean);
	}
	if (typeof rawList === "string") {
		return rawList.split(",").map(normalizeFilterTag).filter(Boolean);
	}
	return [];
}
function toBoolOr(raw, fallback) {
	if (typeof raw === "boolean") { return raw; }
	if (typeof raw === "number") { return raw !== 0; }
	var s = String(raw || "").trim().toLowerCase();
	if (!s) { return !!fallback; }
	if (s === "true" || s === "1" || s === "yes" || s === "on") { return true; }
	if (s === "false" || s === "0" || s === "no" || s === "off") { return false; }
	return !!fallback;
}
function escapeRegexLiteral(s) {
	return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function textHasTimelineControlTag(rawText) {
	return /(^|\s)#(?:timeline|tl)(?:\/[^\s#\]\),.;:!?，。；：！？、]+)?(?=\s|$|[\]\),.;:!?，。；：！？、])/i.test(String(rawText || ""));
}
function isTimelineTaskLike(source) {
	if (!source) { return false; }
	if (typeof source === "string") { return textHasTimelineControlTag(source); }
	try {
		if (source.nodeType === 1 && source.getAttribute) {
			var visual = String(source.getAttribute("data-task-visual") || source.getAttribute("data-tone") || "").toLowerCase();
			if (visual === "timeline") { return true; }
			if (source.getAttribute("data-timeline-tagged") === "1") { return true; }
			var attrText = "";
			["data-full-text", "data-nav-href", "title", "aria-label"].forEach(function (name) {
				try { attrText += " " + String(source.getAttribute(name) || ""); } catch (_) {}
			});
			["data-tc-sig", "data-task-sig"].forEach(function (name) {
				try {
					var raw = String(source.getAttribute(name) || "");
					if (raw) { attrText += " " + decodeURIComponent(raw); }
				} catch (_) {
					try { attrText += " " + String(source.getAttribute(name) || ""); } catch (_2) {}
				}
			});
			try { attrText += " " + String(source.textContent || ""); } catch (_) {}
			return textHasTimelineControlTag(attrText);
		}
	} catch (_) {}
	try {
		if (typeof source === "object") {
			if (source.isTimelineDay || source.isTimelineInstant) { return true; }
			var timelineTag = String(source.timelineTag || "");
			if (/^#?(?:timeline|tl)(?:\/[^\s#]+)?$/i.test(timelineTag)) { return true; }
			var texts = [
				source.rawText,
				source.text,
				source.line,
				source.title,
				source.name
			];
			for (var ti = 0; ti < texts.length; ti++) {
				if (textHasTimelineControlTag(texts[ti])) { return true; }
			}
			var tags = Array.isArray(source.tags) ? source.tags : [];
			for (var i = 0; i < tags.length; i++) {
				if (/^#?(?:timeline|tl)(?:\/.*)?$/i.test(String(tags[i] || "").trim())) { return true; }
			}
		}
	} catch (_) {}
	return false;
}
function taskHasTagMatch(taskObj, normalizedTag) {
	var rawText = String(taskObj?.rawText || taskObj?.text || "").toLowerCase();
	if (!normalizedTag) return false;
	// Prefix tag support: #tl/ matches #tl/sleep, #tl/lunch, etc.
	if (normalizedTag.endsWith("/")) {
		return rawText.indexOf(normalizedTag) >= 0;
	}
	var re = new RegExp("(^|\\s)" + escapeRegexLiteral(normalizedTag) + "(\\s|$)", "i");
	return re.test(rawText);
}
var runtimeTaskTagFilter = {
	includeTags: [],
	excludeTags: []
};
if (bridgeCfg.taskTagFilter && typeof bridgeCfg.taskTagFilter === "object") {
	runtimeTaskTagFilter.includeTags = parseFilterTagList(bridgeCfg.taskTagFilter.includeTags);
	runtimeTaskTagFilter.excludeTags = parseFilterTagList(bridgeCfg.taskTagFilter.excludeTags);
}
/* 兼容 tasks-calendar-wrapper 风格配置（主过滤器未设置时继承） */
if ((!runtimeTaskTagFilter.includeTags.length && !runtimeTaskTagFilter.excludeTags.length) && bridgeCfg.wrapperTaskFilter && typeof bridgeCfg.wrapperTaskFilter === "object") {
	var wf = bridgeCfg.wrapperTaskFilter;
	if (toBoolOr(wf.useIncludeTags, false)) {
		runtimeTaskTagFilter.includeTags = parseFilterTagList(wf.taskIncludeTags);
	}
	if (toBoolOr(wf.useExcludeTags, false)) {
		runtimeTaskTagFilter.excludeTags = parseFilterTagList(wf.taskExcludeTags);
	}
}
var runtimeTaskQueryPolicy = {
	includeTimelineInMonth: false,
	includeCancelled: true,
	excludeOverdueTimeline: true
};
if (bridgeCfg.taskQueryPolicy && typeof bridgeCfg.taskQueryPolicy === "object") {
	runtimeTaskQueryPolicy.includeTimelineInMonth = toBoolOr(bridgeCfg.taskQueryPolicy.includeTimelineInMonth, runtimeTaskQueryPolicy.includeTimelineInMonth);
	runtimeTaskQueryPolicy.includeCancelled = toBoolOr(bridgeCfg.taskQueryPolicy.includeCancelled, runtimeTaskQueryPolicy.includeCancelled);
	runtimeTaskQueryPolicy.excludeOverdueTimeline = toBoolOr(bridgeCfg.taskQueryPolicy.excludeOverdueTimeline, runtimeTaskQueryPolicy.excludeOverdueTimeline);
}
/** Day Planner 借鉴：可配置 UX（与 bridgeCfg.plannerUxPolicy / 设置页一致） */
var tcPlannerUx = {
	showNowNeedle: true,
	showNowNeedleInWeekView: true,
	showNowNeedleInDayView: true,
	stickyRuler: true,
	showMiniTimeline: false,
	enableUndoBar: false
};
if (bridgeCfg.plannerUxPolicy && typeof bridgeCfg.plannerUxPolicy === "object") {
	var pu = bridgeCfg.plannerUxPolicy;
	tcPlannerUx.showNowNeedle = toBoolOr(pu.showNowNeedle, tcPlannerUx.showNowNeedle);
	tcPlannerUx.showNowNeedleInWeekView = toBoolOr(pu.showNowNeedleInWeekView, tcPlannerUx.showNowNeedleInWeekView);
	tcPlannerUx.showNowNeedleInDayView = toBoolOr(pu.showNowNeedleInDayView, tcPlannerUx.showNowNeedleInDayView);
	tcPlannerUx.stickyRuler = toBoolOr(pu.stickyRuler, tcPlannerUx.stickyRuler);
	tcPlannerUx.showMiniTimeline = toBoolOr(pu.showMiniTimeline, tcPlannerUx.showMiniTimeline);
	tcPlannerUx.enableUndoBar = toBoolOr(pu.enableUndoBar, tcPlannerUx.enableUndoBar);
}
function shouldShowPlannerChromeNowNeedleForActiveView() {
	if (!tcPlannerUx.showNowNeedle || !rootNode) { return false; }
	var v = rootNode.getAttribute("view");
	if (v === "week") { return toBoolOr(tcPlannerUx.showNowNeedleInWeekView, false); }
	if (v === "day") { return toBoolOr(tcPlannerUx.showNowNeedleInDayView, true); }
	return false;
}
function taskPassesRuntimeTagFilter(taskObj) {
	var includeList = runtimeTaskTagFilter.includeTags;
	var excludeList = runtimeTaskTagFilter.excludeTags;
	if (includeList.length) {
		var includeMatched = includeList.some((tag) => taskHasTagMatch(taskObj, tag));
		if (!includeMatched) return false;
	}
	if (excludeList.length) {
		var excludeMatched = excludeList.some((tag) => taskHasTagMatch(taskObj, tag));
		/* 时段轴 #tl/… 常被放进 exclude 以减轻「无时段」桶噪音；周/日时间轴仍应展示这些条 */
		if (excludeMatched && !isTimelineTaggedTask(taskObj)) return false;
	}
	return true;
}
if (!dailyNoteFormat) { dailyNoteFormat = "YYYY-MM-DD" };
var tToday = calendarNow().format("YYYY-MM-DD");
var tMonth = calendarNow().format("M");
var tDay = calendarNow().format("d");
var tYear = calendarNow().format("YYYY");
var tid = (new Date()).getTime();
if (startPosition) {
	var sp = String(startPosition).trim();
	var selectedMonth;
	var selectedList;
	var selectedDay;
	var selectedWeek;
	var spDayStrict = moment(sp, "YYYY-MM-DD", true);
	if (spDayStrict.isValid()) {
		selectedDay = spDayStrict.clone().startOf("day");
		selectedWeek = taskCalendarConfiguredWeekStart(selectedDay);
		selectedMonth = selectedDay.clone().startOf("month").date(1);
		selectedList = selectedMonth.clone();
	} else {
		selectedMonth = moment(sp, "YYYY-MM", true);
	if (!selectedMonth.isValid()) { selectedMonth = calendarNow().startOf("month"); }
	selectedMonth = selectedMonth.clone().date(1);
		selectedList = selectedMonth.clone();
		selectedDay = selectedMonth.clone().startOf("day");
		selectedWeek = undefined;
	var spParts = sp.match(/^(\d{4})-(\d{1,2})$/);
	if (spParts) {
		var py = parseInt(spParts[1], 10);
		var p2 = parseInt(spParts[2], 10);
		selectedWeek = calendarNow().isoWeekYear(py).isoWeek(p2).startOf("isoWeek");
	}
	if (!selectedWeek || !selectedWeek.isValid()) {
		selectedWeek = taskCalendarConfiguredWeekStart(moment(sp, "YYYY-ww", true));
	}
	if (!selectedWeek.isValid()) {
		selectedWeek = taskCalendarConfiguredWeekStart(calendarNow());
		}
	}
} else {
	var selectedMonth = calendarNow().date(1);
	var selectedWeek = taskCalendarConfiguredWeekStart(calendarNow());
	var selectedDay = calendarNow().startOf("day");
	var selectedList = calendarNow().date(1);
}
/* 插件「任务时间轴」Tab：与任务看板共用 runtime，仅周 time-lane + 极简工具栏 */
function resolveTimelineModeContract() {
	var role = String(noriaPluginTabRole || "").trim().toLowerCase();
	var mode = String(input?.noriaViewMode || "").trim().toLowerCase();
	var toolbarMode = String(input?.noriaToolbarMode || "").trim().toLowerCase();
	var bridgeMode = String(bridgeCfg?.taskTimelineMode || "").trim().toLowerCase();
	var isTimelineMode = (
		role === "weektimeline"
		|| mode === "tasktimeline"
		|| toolbarMode === "minimal"
		|| bridgeMode === "tasktimeline"
	);
	return {
		isTimelineMode: !!isTimelineMode,
		role: role,
		mode: mode,
		toolbarMode: toolbarMode
	};
}
var tcTimelineContract = resolveTimelineModeContract();
var tcTaskTimelineMode = !!tcTimelineContract.isTimelineMode;
if (tcTaskTimelineMode && !tcTimelineContract.role) {
	try {
		console.warn("[noria tasksCalendar] timeline mode fallback activated without noriaPluginTabRole; please align TimelineModeContract at entry.");
	} catch (_) {}
}
if (tcTaskTimelineMode) {
	view = "week";
}
function getTaskCalendarViewHandlers() {
	return {
		month: getMonth,
		week: getWeek,
		day: getDay,
		list: getList
	};
}
function resolveInitialTaskCalendarSelectedDate(activeView) {
	var selectedByView = {
		month: selectedMonth,
		week: selectedWeek,
		day: selectedDay,
		list: selectedList
	};
	var normalized = String(activeView || "").trim().toLowerCase();
	return selectedByView[normalized] || selectedMonth || selectedWeek || selectedDay || selectedList || calendarNow().startOf("month");
}
function renderTaskCalendarViewNow(activeView, dateAnchor) {
	var normalized = String(activeView || view || "month").trim().toLowerCase();
	var handlers = getTaskCalendarViewHandlers();
	var handler = handlers[normalized] || handlers.month;
	if (normalized === "list") {
		return handler(tasks, getEisenhowerFocusDate(dateAnchor || selectedDate));
	}
	return handler(tasks, dateAnchor || selectedDate);
}
var selectedDate = resolveInitialTaskCalendarSelectedDate(view);
if (selectedDate && typeof selectedDate.isValid === "function" && !selectedDate.isValid()) {
	if (view == "week") {
		selectedDate = taskCalendarConfiguredWeekStart(calendarNow());
	} else if (view == "day") {
		selectedDate = calendarNow().startOf("day");
	} else {
		selectedDate = calendarNow().startOf("month");
	}
}
var arrowLeftIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>';
var arrowRightIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>';
/* 工具栏上一段/下一段：单角标、无横线，贴近系统日历导航 */
var tcNavChevronLeftSvg = '<svg class="tc-nav-chevron-svg" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
var tcNavChevronRightSvg = '<svg class="tc-nav-chevron-svg" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
var filterIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>';
var monthIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><path d="M8 14h.01"></path><path d="M12 14h.01"></path><path d="M16 14h.01"></path><path d="M8 18h.01"></path><path d="M12 18h.01"></path><path d="M16 18h.01"></path></svg>';
var weekIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><path d="M17 14h-6"></path><path d="M13 18H7"></path><path d="M7 14h.01"></path><path d="M17 18h.01"></path></svg>';
var dayIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="3" y1="10" x2="21" y2="10"></line><circle cx="12" cy="16" r="3"></circle></svg>';
var styleIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="18" x2="20" y2="18"></line><circle cx="9" cy="6" r="2"></circle><circle cx="15" cy="12" r="2"></circle><circle cx="11" cy="18" r="2"></circle></svg>';
/* 四象限/艾森豪威尔矩阵：工具栏用 2×2 格网，而非列表 icon */
var eisenhowerMatrixIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"></path><path d="M3 12h18"></path><rect x="3" y="3" width="8" height="8" rx="1.5" opacity=".35"></rect><rect x="13" y="3" width="8" height="8" rx="1.5"></rect><rect x="3" y="13" width="8" height="8" rx="1.5" opacity=".35"></rect><rect x="13" y="13" width="8" height="8" rx="1.5" opacity=".35"></rect></svg>';
var listIcon = eisenhowerMatrixIcon;
/* 统计/待办明细：饼图语义（完成占比），避免与时间轴 Ribbon / 清单类图标撞脸 */
var tcStatisticGlyphIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>';
var calendarCheckIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><path d="m9 16 2 2 4-4"></path></svg>';
var calendarHeartIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h7"></path><path d="M16 2v4"></path><path d="M8 2v4"></path><path d="M3 10h18"></path><path d="M21.29 14.7a2.43 2.43 0 0 0-2.65-.52c-.3.12-.57.3-.8.53l-.34.34-.35-.34a2.43 2.43 0 0 0-2.65-.53c-.3.12-.56.3-.79.53-.95.94-1 2.53.2 3.74L17.5 22l3.6-3.55c1.2-1.21 1.14-2.8.19-3.74Z"></path></svg>';
/* cellContent 内保留零宽占位，降低 LP/消毒器把「空 div」摘掉导致无法挂载任务的风险 */
var cellTemplate = "<div class='cell {{class}}' data-weekday='{{weekday}}' data-date='{{date}}'><a class='internal-link cellName' data-href='{{dailyNote}}' href='{{dailyNote}}'>{{cellName}}</a><div class='cellContent'><span class='tc-cell-ph' aria-hidden='true'>&#8203;</span></div></div>";
/* 任务条用 buildTaskElement 在挂载后 appendChild：避免 metadata/Live Preview 对 innerHTML 里的 <a class="internal-link"> 消毒导致整格任务消失 */
const rootNode = ctx.el("div", "", {cls: "tasksCalendar "+options, attr: {id: "tasksCalendar"+tid, view: view, style: 'position:relative;-webkit-user-select:none'}});
rootNode.__noriaTasksCalendarCleanup = cleanupTasksCalendarRuntime;
if (tcTaskTimelineMode) {
	rootNode.classList.add("tc-mode-task-timeline");
	rootNode.setAttribute("data-tc-mode", "task-timeline");
}
if (css) { var style = getTasksCalendarDocument().createElement("style"); style.innerHTML = css; rootNode.append(style) };
function normalizeHexColor(raw) {
	var s = String(raw || "").trim();
	if (!s) return "";
	if (!s.startsWith("#")) s = "#" + s;
	if (/^#[0-9a-fA-F]{3}$/.test(s)) {
		return "#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
	}
	return /^#[0-9a-fA-F]{6}$/.test(s) ? s : "";
}
function hexToRgba(hex, alpha) {
	var h = normalizeHexColor(hex);
	if (!h) return "";
	var n = parseInt(h.slice(1), 16);
	var r = (n >> 16) & 255;
	var g = (n >> 8) & 255;
	var b = n & 255;
	var a = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
	return "rgba(" + r + "," + g + "," + b + "," + a + ")";
}
function buildPlannerChromeTonePaletteCss(rootId, tones) {
	if (!rootId || !Array.isArray(tones) || !tones.length) return "";
	var out = [];
	for (var i = 0; i < tones.length; i++) {
		var c = normalizeHexColor(tones[i]);
		if (!c) continue;
		var idx = i + 1;
		var top = hexToRgba(c, 0.86);
		var bottom = hexToRgba(c, 0.56);
		var border = hexToRgba(c, 0.28);
		var text = "#0f172a";
		out.push("#" + rootId + ".tasksCalendar[view='week'].planner-chrome .tc-cal-item[data-tone='" + idx + "'], #" + rootId + ".tasksCalendar[view='week'].planner-chrome [data-tc-cal-item='1'][data-tone='" + idx + "'] { --planner-bg-top: " + top + "; --planner-bg-bottom: " + bottom + "; --planner-border: " + border + "; --planner-text: " + text + "; }");
	}
	return out.join("\n");
}
if (bridgeCfg.colorPalette && typeof bridgeCfg.colorPalette === "object") {
	var pA = Array.isArray(bridgeCfg.colorPalette.groupA) ? bridgeCfg.colorPalette.groupA.map(normalizeHexColor).filter(Boolean) : [];
	var pB = Array.isArray(bridgeCfg.colorPalette.groupB) ? bridgeCfg.colorPalette.groupB.map(normalizeHexColor).filter(Boolean) : [];
	var pTone = Array.isArray(bridgeCfg.colorPalette.tonePalette) ? bridgeCfg.colorPalette.tonePalette.map(normalizeHexColor).filter(Boolean) : [];
	var a0 = pA[0] || "";
	var a1 = pA[1] || a0;
	var a2 = pA[2] || a1 || a0;
	var b0 = pB[0] || "";
	var b1 = pB[1] || b0;
	var b2 = pB[2] || b1 || b0;
	/* 正文色与主题 accent 解耦：accent 只驱动条带底/边/强调，避免 transColor(a0) 把整页任务字染成蓝（与主页近黑一致） */
	var taskBodyFg = "#0f172a";
	if (a0) {
		rootNode.style.setProperty("--blue-6", a0);
		rootNode.style.setProperty("--blue-5", transColor(a0, 12));
		rootNode.style.setProperty("--blue-7", transColor(a0, -18));
		rootNode.style.setProperty("--task-default-bg", hexToRgba(a0, 0.13));
		rootNode.style.setProperty("--task-default-bd", hexToRgba(a0, 0.28));
		rootNode.style.setProperty("--task-default-fg", taskBodyFg);
	}
	if (a1) {
		rootNode.style.setProperty("--task-process-bg", hexToRgba(a1, 0.13));
		rootNode.style.setProperty("--task-process-bd", hexToRgba(a1, 0.28));
		rootNode.style.setProperty("--task-process-fg", "#166534");
		rootNode.style.setProperty("--task-done-bg", hexToRgba(a1, 0.12));
		rootNode.style.setProperty("--task-done-bd", hexToRgba(a1, 0.26));
		rootNode.style.setProperty("--task-done-fg", "#166534");
		rootNode.style.setProperty("--task-done-chip", a1);
	}
	if (a2) {
		rootNode.style.setProperty("--task-start-bg", hexToRgba(a2, 0.13));
		rootNode.style.setProperty("--task-start-bd", hexToRgba(a2, 0.28));
		rootNode.style.setProperty("--task-start-fg", taskBodyFg);
	}
	if (b0) {
		rootNode.style.setProperty("--task-overdue-chip", b0);
		rootNode.style.setProperty("--task-overdue-bg", hexToRgba(b0, 0.12));
		rootNode.style.setProperty("--task-overdue-bd", hexToRgba(b0, 0.30));
		rootNode.style.setProperty("--task-overdue-fg", taskBodyFg);
	}
	if (b1) {
		rootNode.style.setProperty("--task-progress-chip-high", b1);
	}
	if (b2) {
		rootNode.style.setProperty("--task-progress-chip-medium", b2);
		rootNode.style.setProperty("--task-progress-chip-low", transColor(b2, 10));
		rootNode.style.setProperty("--task-due-bg", hexToRgba(b2, 0.12));
		rootNode.style.setProperty("--task-due-bd", hexToRgba(b2, 0.28));
		rootNode.style.setProperty("--task-due-fg", taskBodyFg);
	}
	var tone7 = normalizeHexColor(transColor(a0 || a1 || b0 || "#3b82f6", -10));
	var toneSeeds = (pTone.length >= 7) ? pTone.slice(0, 7) : [
		a0 || "#3b82f6",
		a1 || "#22c55e",
		b1 || "#ef4444",
		b0 || "#f97316",
		a2 || "#8b5cf6",
		b2 || "#0ea5e9",
		tone7 || "#6366f1"
	];
	var dynamicToneCss = buildPlannerChromeTonePaletteCss("tasksCalendar" + tid, toneSeeds);
	if (dynamicToneCss) {
		var toneStyle = document.createElement("style");
		toneStyle.textContent = dynamicToneCss;
		rootNode.append(toneStyle);
	}
	var monthTagPalette = Array.isArray(bridgeCfg.colorPalette.tagBucketPalette)
		? bridgeCfg.colorPalette.tagBucketPalette.map(normalizeHexColor).filter(Boolean)
		: [];
	for (var pi = 0; pi < monthTagPalette.length && pi < 8; pi++) {
		rootNode.style.setProperty("--tc-tag-bucket-" + String(pi + 1), monthTagPalette[pi]);
	}
}
var taskDoneIcon = "✅";
var taskDueIcon = "📅";
var taskScheduledIcon = "⏳";
var taskRecurrenceIcon = "🔁";
var taskProcessIcon = "⏺️";
var taskCancelledIcon = "🚫";
var taskStartIcon = "🛫";
var taskDailyNoteIcon = "📄";
var trayToggleIcon = "<svg viewBox='0 0 24 24' width='14' height='14' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M3 7h18'/><path d='M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7'/><path d='M9 12h6'/></svg>";

var TASK_ICON_BY_CLASS = {
	due: taskDueIcon,
	overdue: "",
	recurrence: taskRecurrenceIcon,
	start: taskStartIcon,
	scheduled: taskScheduledIcon,
	process: taskProcessIcon,
	dailyNote: taskDailyNoteIcon,
	done: taskDoneIcon,
	cancelled: taskCancelledIcon
};
function taskIconForClass(cls) {
	var k = String(cls || "").trim();
	return TASK_ICON_BY_CLASS[k] || taskDueIcon;
}

/**
 * 必须在 await initialize() 之前完成赋值：initialize → getWeek/getMonth → getTasksViaAdapter 会立刻调用 collectForDate；
 * var 仅提升声明不提升赋值，若放在文件后部则运行时仍为 undefined（tasksNative 路径报错 reading 'collectForDate'）。
 */
var taskQueryAdapter = {
	collectForDate: function (date) {
		var tasks = getCalendarTaskEntries();
		var isMonthView = rootNode && rootNode.getAttribute("view") == "month";
		var queryPolicy = runtimeTaskQueryPolicy;
		function dedupByTaskKey(list) {
			var out = [];
			var seen = new Set();
			for (var i = 0; i < list.length; i++) {
				var item = list[i];
				var key = getTaskKey(item);
				if (seen.has(key)) { continue; }
				seen.add(key);
				out.push(item);
			}
			return out;
		}
		function includeInCurrentView(taskObj) {
			if (taskObj.calendarDeadlineMerged && !taskObj.completed && taskDateSameDay(taskObj.due,date)) return false;
			if (!isMonthView) { return true; }
			if (!queryPolicy.includeTimelineInMonth && isTimelineTaggedTask(taskObj)) { return false; }
			return true;
		}
		var doneSameDay = sortTasksByYmdField(tasks.filter(t=>includeInCurrentView(t) && t.completed === true && (t.calendarSchedule
			? (t.scheduled ? taskDateSameDay(t.scheduled,date) : !taskDateAfterDay(t.start,date) && !taskDateBeforeDay(t.due,date))
			: t.completion && taskDateSameDay(t.completion, date))), "completion");
		var doneWithoutCompletionDate = sortTasksByYmdField(tasks.filter(t=>includeInCurrentView(t) && !t.calendarSchedule && t.completed === true && !t.completion && t.due && taskDateSameDay(t.due, date)), "due");
		var doneSpanInMonth = [];
		if (isMonthView) {
			doneSpanInMonth = tasks.filter(function (t) {
				if (!includeInCurrentView(t) || t.completed !== true) { return false; }
				var sy = coerceTemporalToYmd(t.start) || "";
				var ey = coerceTemporalToYmd(t.due) || "";
				if (!sy || !ey || sy === ey) { return false; }
				return !taskDateAfterDay(t.start, date) && !taskDateBeforeDay(t.due, date);
			});
		}
		var openSpanInMonth = [];
		if (isMonthView) {
			openSpanInMonth = tasks.filter(function (t) {
				if (!includeInCurrentView(t) || !taskIsOpenForCalendar(t)) { return false; }
				var sy = coerceTemporalToYmd(t.start) || "";
				var ey = coerceTemporalToYmd(t.due) || "";
				if (!sy || !ey || sy === ey) { return false; }
				if (taskDateSameDay(t.start, date)) { return false; }
				return !taskDateAfterDay(t.start, date) && !taskDateBeforeDay(t.due, date);
			});
		}
		var doneMerged = doneSameDay.concat(doneWithoutCompletionDate).concat(doneSpanInMonth);
		var doneDedup = dedupByTaskKey(doneMerged);
		var dueMerged = sortTasksByYmdField(tasks.filter(t=>includeInCurrentView(t) && taskIsOpenForCalendar(t) && !t.recurrence && t.due && taskDateSameDay(t.due, date)), "due").concat(openSpanInMonth);
		var dueDedup = dedupByTaskKey(dueMerged);
		return {
			done: sortTasksByYmdField(doneDedup, "due"),
			doneWithoutCompletionDate: doneWithoutCompletionDate,
			due: sortTasksByYmdField(dueDedup, "due"),
			recurrence: sortTasksByYmdField(tasks.filter(t=>includeInCurrentView(t) && taskIsOpenForCalendar(t) && t.recurrence && t.due && taskDateSameDay(t.due, date)), "due"),
			overdue: sortTasksByYmdField(tasks
				.filter(t=>includeInCurrentView(t) && !t.calendarSchedule && taskIsOpenForCalendar(t) && t.due && taskDateBeforeDay(t.due, date))
				.filter(t => queryPolicy.excludeOverdueTimeline ? !isTimelineTaggedTask(t) : true), "due"),
			start: sortTasksByYmdField(tasks.filter(t=>includeInCurrentView(t) && taskIsOpenForCalendar(t) && t.start && taskDateSameDay(t.start, date)), "start"),
			scheduled: sortTasksByYmdField(tasks.filter(t=>includeInCurrentView(t) && taskIsOpenForCalendar(t) && t.scheduled && taskDateSameDay(t.scheduled, date)), "scheduled"),
			process: tasks.filter(t=>includeInCurrentView(t) && taskIsOpenForCalendar(t) && t.due && t.start && taskDateAfterDay(t.due, date) && taskDateBeforeDay(t.start, date)),
			cancelled: queryPolicy.includeCancelled
				? sortTasksByYmdField(tasks.filter(t=>includeInCurrentView(t) && !t.completed && t.checked && t.due && taskDateSameDay(t.due, date)), "due")
				: [],
			dailyNote: sortTasksByYmdField(tasks.filter(t=>includeInCurrentView(t) && taskIsOpenForCalendar(t) && taskUsesDiaryDate(t) && t.dailyNote && taskDateSameDay(t.dailyNote, date)), "dailyNote")
		};
	}
};

await initialize();
bindFreshTaskInvalidationEvent();

async function ensureAdapterLoaded(cacheKey, globalAdapterKey, adapterPath, logPrefix) {
  if (adapterCache.__buildId !== tasksCalendarRuntimeBuildId) {
    adapterCache = { __buildId: tasksCalendarRuntimeBuildId };
  }
  var loadState = getTaskCalendarAdapterLoadState();
  var adapterMeta = loadState.adapters[cacheKey] || (loadState.adapters[cacheKey] = {
    buildId: tasksCalendarRuntimeBuildId,
    key: cacheKey,
    globalKey: globalAdapterKey,
    status: "idle",
    path: "",
    error: ""
  });
  adapterMeta.buildId = tasksCalendarRuntimeBuildId;
  adapterMeta.key = cacheKey;
  adapterMeta.globalKey = globalAdapterKey;
  var existingAdapter = globalThis.dashboardCore && globalThis.dashboardCore.adapters
    ? globalThis.dashboardCore.adapters[globalAdapterKey]
    : null;
  if (existingAdapter && adapterMeta.status === "ready" && adapterMeta.buildId === tasksCalendarRuntimeBuildId) {
    return existingAdapter;
  }
  if (existingAdapter && adapterMeta.status !== "ready" && globalThis.dashboardCore && globalThis.dashboardCore.adapters) {
    try { delete globalThis.dashboardCore.adapters[globalAdapterKey]; } catch (_) {}
  }
  var state = adapterCache[cacheKey] || (adapterCache[cacheKey] = { instance: null, promise: null });
  if (state.instance) { return state.instance; }
  if (state.promise) { return state.promise; }
  state.promise = (async () => {
    try {
      adapterMeta.status = "loading";
      adapterMeta.error = "";
      adapterMeta.updatedAt = Date.now();
      if (!globalThis.dashboardCore?.adapters?.[globalAdapterKey]) {
        var normalizedPath = String(adapterPath || "").replace(/[\\]+/g, "/").replace(/^\/+/, "");
        adapterMeta.path = normalizedPath;
        var source = "";
        const adapterFile = app.vault.getAbstractFileByPath(normalizedPath);
        if (adapterFile) {
          source = await app.vault.cachedRead(adapterFile);
        } else if (app?.vault?.adapter?.read) {
          try {
            source = await app.vault.adapter.read(normalizedPath);
          } catch (_) {
            source = "";
          }
        }
        if (!source) {
          adapterMeta.status = "missing";
          adapterMeta.updatedAt = Date.now();
          return null;
        }
        eval(source);
      }
      state.instance = globalThis.dashboardCore?.adapters?.[globalAdapterKey] || null;
      if (state.instance) {
        adapterMeta.status = "ready";
      } else {
        adapterMeta.status = "missing";
      }
      adapterMeta.hasInstance = !!state.instance;
      adapterMeta.updatedAt = Date.now();
    } catch (err) {
      console.error(logPrefix, err);
      state.instance = null;
      adapterMeta.status = "failed";
      adapterMeta.error = String((err && err.message) || err || "");
      adapterMeta.updatedAt = Date.now();
    } finally {
      if (!state.instance) {
        state.promise = null;
      }
    }
    return state.instance;
  })();
  return state.promise;
}

async function ensureTimelineIoAdapterLoaded() {
  return ensureAdapterLoaded(
    "timelineIo",
    "timelineIoAdapter",
    TIMELINE_IO_ADAPTER_PATH,
    "[tasksCalendar] load timeline io adapter failed:"
  );
};

async function ensureTimelineActionsAdapterLoaded() {
  return ensureAdapterLoaded(
    "timelineActions",
    "timelineActionsAdapter",
    TIMELINE_ACTIONS_ADAPTER_PATH,
    "[tasksCalendar] load timeline actions adapter failed:"
  );
};

async function initialize() {
	try {

  applyTimelineSettingsToRoot();
  tasks = getMeta(tasks);
		if (!tasks.length) {
			console.warn("[noria tasksCalendar] 0 tasks after getMeta; check metadata index & task format");
		}
  setButtons();
  setStatisticPopUp();
		ensureTasksCalendarNavBound();
  renderTaskCalendarViewNow(view, selectedDate);
		try {
			var wtc0 = getWrapperTimelineCompat();
			if (rootNode && rootNode.getAttribute("view") === "week" && toBoolOr(wtc0.defaultTodayFocus, false)) {
				rootNode.classList.add("todayFocus");
			}
		} catch (_) {}
		if (!tasks.length) {
			scheduleStartupTaskRecovery();
		} else {
			tcStartupRecoverStopped = true;
			clearStartupTaskRecoveryTimers();
		}
	} catch (err) {
		console.error("[noria tasksCalendar] initialize failed:", err);
	}
}

function applyTimelineSettingsToRoot() {
	var bucket = parseInt(timelineSettings.dayBucketHeight, 10);
	var lane = parseInt(timelineSettings.laneHeight, 10);
	if (!Number.isFinite(bucket) || bucket < 32) { bucket = 84; }
	if (!Number.isFinite(lane) || lane < 360) { lane = 1080; }
	rootNode.style.setProperty("--day-bucket-height", String(bucket) + "px");
	rootNode.style.setProperty("--time-lane-height", String(lane) + "px");
	var monthMin = parseInt(bridgeSizing.monthGridMinHeight, 10);
	var monthMax = parseInt(bridgeSizing.monthGridMaxHeight, 10);
	var monthVh = parseInt(bridgeSizing.monthGridVh, 10);
	var dayFont = parseFloat(bridgeSizing.monthCellFontSize);
	var taskFont = parseFloat(bridgeSizing.monthTaskFontSize);
	var taskLine = parseFloat(bridgeSizing.monthTaskLineHeight);
	if (!Number.isFinite(monthMin) || monthMin < 300) { monthMin = 520; }
	if (!Number.isFinite(monthMax) || monthMax < monthMin) { monthMax = 820; }
	if (!Number.isFinite(monthVh) || monthVh < 40 || monthVh > 95) { monthVh = 74; }
	if (!Number.isFinite(dayFont) || dayFont < 8) { dayFont = 10; }
	if (!Number.isFinite(taskFont) || taskFont < 9) { taskFont = 12; }
	if (!Number.isFinite(taskLine) || taskLine < 0.9) { taskLine = 1.18; }
	rootNode.style.setProperty("--month-grid-min-height", String(monthMin) + "px");
	rootNode.style.setProperty("--month-grid-max-height", String(monthMax) + "px");
	rootNode.style.setProperty("--month-grid-height", String(monthVh) + "vh");
	rootNode.style.setProperty("--month-day-font-size", String(dayFont) + "px");
	rootNode.style.setProperty("--month-task-font-size", String(taskFont) + "px");
	rootNode.style.setProperty("--month-task-line-height", String(taskLine));
};

	function stripTaskMetadataEmojis(text) {
		return String(text || "")
			// Tasks plugin date metadata emojis.
			.replace(/\s*[📅🛫⏳✅➕❌]\s*\d{4}-\d{2}-\d{2}(?:[ T][0-2]?\d:[0-5]\d)?/gu, " ")
			// Inline time metadata emoji.
			.replace(/\s*⏰\s*[0-2]?\d:[0-5]\d/g, " ")
			// Recurrence marker and common trailing phrase.
			.replace(/\s*🔁(?:\s+[^\s].*)?$/g, " ")
			// Priority markers.
			.replace(/\s*[🔺⏫🔼🔽⏬]/gu, " ");
	}

	var TASKS_PRIORITY_ORDER = ["highest", "high", "medium", "normal", "low", "lowest"];
	var TASKS_STATUS_OPTIONS = [
		{ value: "todo", labelKey: "runtime.tasksCalendar.status.todo", mark: " " },
		{ value: "in_progress", labelKey: "runtime.tasksCalendar.status.inProgress", mark: "/" },
		{ value: "done", labelKey: "runtime.tasksCalendar.status.done", mark: "x" },
		{ value: "cancelled", labelKey: "runtime.tasksCalendar.status.cancelled", mark: "-" }
	];

	function normalizePriorityValue(value) {
		var v = String(value || "").trim().toLowerCase();
		if (!v) return "normal";
		if (v === "0" || v === "highest" || v === "🔺") return "highest";
		if (v === "a" || v === "1" || v === "high" || v === "⏫") return "high";
		if (v === "b" || v === "2" || v === "medium" || v === "normal-high" || v === "🔼") return "medium";
		if (v === "d" || v === "4" || v === "low" || v === "🔽") return "low";
		if (v === "5" || v === "lowest" || v === "⏬") return "lowest";
		if (v === "c" || v === "3" || v === "none" || v === "normal" || v === "普通") return "normal";
		return "normal";
	}

	function priorityMarkerFor(value) {
		var p = normalizePriorityValue(value);
		return p === "normal" ? "" : p;
	}

	function stripTaskPriorityMarkers(lineText) {
		return String(lineText || "")
			.replace(/\s*[🔺⏫🔼🔽⏬]/gu, " ")
			.replace(/\s*\[priority::\s*[^\]]+\]/ig, " ")
			.replace(/\s{2,}/g, " ")
			.trimEnd();
	}

	function getPriorityFromText(lineText, fallback) {
		var text = String(lineText || "");
		if (text.indexOf("🔺") >= 0) return "highest";
		if (text.indexOf("⏫") >= 0) return "high";
		if (text.indexOf("🔼") >= 0) return "medium";
		if (text.indexOf("🔽") >= 0) return "low";
		if (text.indexOf("⏬") >= 0) return "lowest";
		var m = text.match(/\[priority::\s*([^\]]+)\]/i);
		return normalizePriorityValue(m ? m[1] : fallback);
	}

	function applyTaskPriorityMarker(lineText, priority) {
		var line = stripTaskPriorityMarkers(lineText);
		var marker = priorityMarkerFor(priority);
		if (marker) line = upsertInlineField(line, "priority", marker).replace(/\s{2,}/g, " ").trimEnd();
		return line;
	}

	function normalizeEisenhowerBucketOverride(value) {
		var bucket = String(value || "").trim().toLowerCase();
		return ["q1", "q2", "q3", "q4"].indexOf(bucket) >= 0 ? bucket : "";
	}

	function getTaskEisenhowerBucketOverride(task) {
		var raw = String((task && (task.rawText || task.sourceRawLine)) || "");
		return normalizeEisenhowerBucketOverride(
			(task && task.noriaQuadrant) || getInlineFieldValue(raw, "noria-quadrant")
		);
	}

	function getPriorityForEisenhowerBucket(task, targetBucket) {
		var bucket = normalizeEisenhowerBucketOverride(targetBucket);
		var current = normalizePriorityValue(task && task.priority);
		var low = current === "low" || current === "lowest";
		if (bucket === "q1" || bucket === "q2") return low ? "normal" : current;
		if (bucket === "q3" || bucket === "q4") return low ? current : "low";
		return current;
	}

function getMeta(tasks) {
	function getLastRegexMatch(text, regexWithGlobal) {
		var last = null;
		for (const m of String(text || "").matchAll(regexWithGlobal)) {
			last = m;
		}
		return last;
	}
	for (var i = 0; i < tasks.length; i++) {
		try {
		var lineText = String(tasks[i].text != null ? tasks[i].text : (tasks[i].visual || ""));
		tasks[i].rawText = lineText;
		tasks[i].timelineTag = extractTimelineTag(tasks[i].rawText);
		tasks[i].isTimelineDay = /(^|\s)#tl\/day(?:\s|$)/i.test(tasks[i].rawText) || /(^|\s)#timeline\/day(?:\s|$)/i.test(tasks[i].rawText);
		tasks[i].isTimelineInstant = (!tasks[i].isTimelineDay && /(^|\s)#tl\/[^\s#]+/i.test(tasks[i].rawText))
			|| /(^|\s)#timeline\/instant(?:\s|$)/i.test(tasks[i].rawText);
		normalizeTaskTemporal(tasks[i], "start", "startTime");
		normalizeTaskTemporal(tasks[i], "due", "dueTime");
		normalizeTaskTemporal(tasks[i], "scheduled", "scheduledTime");
		normalizeTaskTemporal(tasks[i], "completion", "completionTime");
		var taskPathForMeta = tasks[i].path || (tasks[i].link && tasks[i].link.path) || "";
		var diaryDate = taskDiaryDateFromPath(taskPathForMeta);
		if (diaryDate) tasks[i].dailyNote = diaryDate;
		var dateSource = /^[ \t]*[-*+]\s+\[[^\]]\]/.test(lineText) ? lineText : "- [ ] "+lineText;
		var parsedDates = noriaBridge.tasks.parseTaskLine(dateSource);
		tasks[i].schedules = parsedDates.schedules;
		["start", "due", "scheduled", "completion", "created", "cancelled"].forEach(function(key) {
			var value = parseDateTimeValue(parsedDates[key]);
			if (value.date || ["start", "due", "scheduled"].includes(key)) {
				tasks[i][key] = value.date || "";
				tasks[i][key+"Time"] = value.time || "";
			}
		});
		lineText = parsedDates.body;
		parsedDates.tokens.filter(function(token) { return ["start","due","date","scheduled","schedule","completion","done","created","cancelled"].includes(token.key); }).reverse().forEach(function(token) {
			lineText = lineText.slice(0,token.start)+lineText.slice(token.end);
		});
		if (parsedDates.tokens.some(function (token) { return token.key === "extra" && /^\^[A-Za-z0-9-]+$/.test(token.value); })) {
			lineText = lineText.replace(/\s*\^[A-Za-z0-9-]+\s*$/, "");
		}
		var inlineRepeatMatch = getLastRegexMatch(lineText, /\[(?:repeat|recurrence|every)::\s*([^\]]+)\]/ig);
		if (inlineRepeatMatch) {
			tasks[i].recurrence = true;
			tasks[i].recurrenceText = String(inlineRepeatMatch[1] || "").trim();
			lineText = lineText.replace(inlineRepeatMatch[0], "");
		}
		var inlineOnCompletionMatch = getLastRegexMatch(lineText, /\[onCompletion::\s*([^\]]+)\]/ig);
		if (inlineOnCompletionMatch) {
			tasks[i].onCompletion = String(inlineOnCompletionMatch[1] || "").trim();
			lineText = lineText.replace(inlineOnCompletionMatch[0], "");
		}
		var inlineIdMatch = getLastRegexMatch(lineText, /\[id::\s*([^\]]+)\]/ig);
		if (inlineIdMatch) {
			tasks[i].id = String(inlineIdMatch[1] || "").trim();
			lineText = lineText.replace(inlineIdMatch[0], "");
		}
		var inlineDependsMatch = getLastRegexMatch(lineText, /\[dependsOn::\s*([^\]]+)\]/ig);
		if (inlineDependsMatch) {
			tasks[i].dependsOn = normalizeTaskIdList(inlineDependsMatch[1]);
			lineText = lineText.replace(inlineDependsMatch[0], "");
		} else if (!Array.isArray(tasks[i].dependsOn)) {
			tasks[i].dependsOn = [];
		}
		normalizeTaskTemporal(tasks[i], "start", "startTime");
		normalizeTaskTemporal(tasks[i], "due", "dueTime");
		normalizeTaskTemporal(tasks[i], "scheduled", "scheduledTime");
		normalizeTaskTemporal(tasks[i], "completion", "completionTime");
		if (isTimelineTaggedTask(tasks[i])) {
			try {
				delete tasks[i].completion;
				delete tasks[i].completionTime;
			} catch (_) {
				tasks[i].completion = undefined;
				tasks[i].completionTime = undefined;
			}
		}
		var clockMatch = lineText.match(/\⏰\W?([0-2]?\d:[0-5]\d)/);
		if (clockMatch) {
			tasks[i].clockTime = normalizeTimeStr(clockMatch[1]);
			lineText = lineText.replace(clockMatch[0], "");
		};
		var repeatEmojiMatch = getLastRegexMatch(lineText, /🔁\s*([^\[]*)/g);
		var repeatMatch = !!repeatEmojiMatch;
		if (repeatMatch) {
			tasks[i].recurrence = true;
			if (!tasks[i].recurrenceText && repeatEmojiMatch && repeatEmojiMatch[1]) {
				tasks[i].recurrenceText = String(repeatEmojiMatch[1] || "").trim();
			}
		};
		var inlinePriorityMatch = getLastRegexMatch(lineText, /\[priority::\s*([^\]]+)\]/ig);
		var inlinePriority = inlinePriorityMatch ? normalizePriorityValue(inlinePriorityMatch[1]) : "";
		if (inlinePriorityMatch) {
			lineText = lineText.replace(inlinePriorityMatch[0], "");
		}
		tasks[i].priority = getPriorityFromText(lineText, inlinePriority || tasks[i].priority || "normal");
		if (globalTaskFilter) {
			lineText = lineText.replaceAll(globalTaskFilter, "");
		}
		/* 任务不必依赖 #task；不设「无 filter 时专门剥 #task」以免暗示工作流必须写该标签。行内 #tag 由后续通用规则清理 */
		lineText = stripTaskMetadataEmojis(lineText);
		lineText = lineText.replace(/(^|\s)[#＃][^\s#＃]+/g, " ");
		lineText = lineText.replaceAll("[[","");
		lineText = lineText.replaceAll("]]","");
		lineText = lineText.replace(/\[.*?\]/gm,"");
		lineText = lineText.replace(/\s{2,}/g, " ").trim();
		tasks[i].text = lineText;
		tasks[i].displayTime = tasks[i].clockTime || tasks[i].dueTime || tasks[i].scheduledTime || tasks[i].startTime || "";
		tasks[i].timeSort = timeToMinutes(tasks[i].displayTime);
		} catch (metaErr) {
			console.error("[noria tasksCalendar] getMeta task skipped, index=" + i, metaErr);
		}
	};
	return tasks.filter(function (t) {
		if (!taskPassesRuntimeTagFilter(t)) return false;
		var plain = String(t.text || "")
			.replace(/[#＃][^\s#＃]+/g, "")
			.replace(/[|·•,:：，。.!?！？"'`~\-_/\\\s]/g, "")
			.trim();
		if (plain.length > 0) return true;
		return !!(coerceTemporalToYmd(t.due) || coerceTemporalToYmd(t.start) || coerceTemporalToYmd(t.scheduled) || coerceTemporalToYmd(t.completion) || coerceTemporalToYmd(t.dailyNote));
	});
};

function getFilename(path) {
	if (path == null || path === "") return "";
	var m = String(path).match(/^(?:.*\/)?([^\/]+?|)(?=(?:\.[^\/.]*)?$)/);
	return m ? (m[1] || "") : "";
};

function capitalize(str) {
	return str[0].toUpperCase() + str.slice(1);
};

function normalizeTimeStr(rawTime) {
	if (!rawTime) { return ""; };
	var s = String(rawTime).trim();
	if (!s) { return ""; }
	var match = s.match(/([0-2]?\d)\s*:\s*([0-5]?\d)(?::([0-5]?\d))?/);
	if (!match) { return ""; };
	var h = parseInt(match[1], 10);
	var m = parseInt(match[2], 10);
	if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) { return ""; };
	return String(h).padStart(2, "0")+":"+String(m).padStart(2, "0");
};

function parseDateTimeValue(rawValue) {
	var value = String(rawValue || "").trim();
	if (!value) { return {date: "", time: ""}; };
	var hasTime = /([0-2]?\d:[0-5]\d)/.test(value);
	var parsed = moment(value, ["YYYY-MM-DD HH:mm", "YYYY-MM-DD", "YYYY/M/D HH:mm", "YYYY/M/D"], true);
	if (!parsed.isValid()) { return {date: "", time: ""}; };
	return {
		date: parsed.format("YYYY-MM-DD"),
		time: hasTime ? parsed.format("HH:mm") : ""
	};
};

function taskDiaryDateFromPath(path) {
	var format = String(dailyNoteFormat || "YYYY-MM-DD").replace(/\\/g, "/");
	var parts = String(path || "").replace(/\\/g, "/").replace(/\.md$/i, "").split("/");
	var candidate = parts.slice(-format.split("/").length).join("/");
	var parsed = moment(candidate, format, true);
	return parsed.isValid() ? parsed.format("YYYY-MM-DD") : "";
}

function taskUsesDiaryDate(task) {
	return !(task.schedules && task.schedules.length) && !["start", "due", "scheduled"].some(function(key) { return coerceTemporalToYmd(task[key]); });
}

// Calendar entries are projections only. The source store keeps one task row
// for completion, dependency editing and statistics, however many slots it has.
function getCalendarTaskEntries() {
	var entries = [];
	tasks.forEach(function(task) {
		if (!task.schedules || !task.schedules.length) { entries.push(!task.start && task.due ? {...task,calendarDeadline:true} : task); return; }
		var dueCovered=task.due && task.schedules.some(function(s) { return !s.error && s.start.slice(0,10)<=task.due && (s.end.endsWith(" 00:00") ? s.end.slice(0,10)>task.due : (s.end||s.start).slice(0,10)>=task.due); });
		if (task.start || task.due || task.completion) entries.push({...task,scheduled:"",scheduledTime:"",calendarDeadline:!task.start&&!!task.due,calendarDeadlineMerged:!task.start&&dueCovered});
		task.schedules.forEach(function(schedule) {
			if (schedule.error) return;
			// parseTaskLine has already validated and normalized these values.
			var first={date:schedule.start.slice(0,10),time:schedule.start.slice(11,16)};
			var end=schedule.end||"",last={date:end.slice(0,10),time:end.slice(11,16)};
			entries.push({...task, calendarSource:task, calendarSchedule:schedule,
				start:last.date?first.date:"",startTime:last.date?first.time:"",
				due:last.date||"",dueTime:last.time||"",
				scheduled:last.date?"":first.date,scheduledTime:last.date?"":first.time,
				completion:"",completionTime:"",dailyNote:"",recurrence:false,
				displayTime:first.time,timeSort:timeToMinutes(first.time)});
		});
	});
	return entries;
}

function calendarIsoDay(value) {
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
	var year = Number(value.slice(0,4)), month = Number(value.slice(5,7)), day = Number(value.slice(8,10));
	if (month < 1 || month > 12 || day < 1) return "";
	var days = month === 2 ? (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28)
		: (month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31);
	return day <= days ? value : "";
}

function coerceTemporalToYmd(v) {
	if (v == null || v === "") return "";
	if (typeof v === "string") {
		if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return calendarIsoDay(v);
		var sStrict = moment(v, "YYYY-MM-DD", true);
		if (sStrict.isValid()) return sStrict.format("YYYY-MM-DD");
		var sLoose = moment(v);
		return sLoose.isValid() ? sLoose.format("YYYY-MM-DD") : "";
	}
	if (typeof v === "number" && isFinite(v)) {
		var mn = moment(v);
		return mn.isValid() ? mn.format("YYYY-MM-DD") : "";
	}
	try {
		if (typeof v.toISODate === "function") {
			var isoD = v.toISODate();
			if (isoD && typeof isoD === "string" && /^\d{4}-\d{2}-\d{2}/.test(isoD)) {
				return isoD.slice(0, 10);
			}
		}
	} catch (_) {}
	try {
		if (typeof v.toFormat === "function") {
			var lux = v.toFormat("yyyy-MM-dd");
			if (lux && /^\d{4}-\d{2}-\d{2}$/.test(lux)) return lux;
		}
	} catch (_) {}
	if (v instanceof Date && !isNaN(v.getTime())) {
		return moment(v).format("YYYY-MM-DD");
	}
	try {
		if (typeof v.toJSDate === "function") {
			var jd = v.toJSDate();
			if (jd && !isNaN(jd.getTime())) return moment(jd).format("YYYY-MM-DD");
		}
	} catch (_) {}
	if (typeof v.ts === "number" && isFinite(v.ts)) {
		return moment(v.ts).format("YYYY-MM-DD");
	}
	var s = String(v);
	var m = moment(s);
	return m.isValid() ? m.format("YYYY-MM-DD") : "";
}

function taskDateSameDay(temporalVal, dateInput) {
	var ymd = coerceTemporalToYmd(temporalVal);
	if (!ymd) return false;
	if (typeof dateInput === "string") return ymd === calendarIsoDay(dateInput);
	var d = moment(dateInput, "YYYY-MM-DD", true);
	return d.isValid() && ymd === d.format("YYYY-MM-DD");
}

function taskDateBeforeDay(temporalVal, dateInput) {
	var ymd = coerceTemporalToYmd(temporalVal);
	if (!ymd) return false;
	if (typeof dateInput === "string") {
		var day = calendarIsoDay(dateInput);
		return !!day && !!calendarIsoDay(ymd) && ymd < day;
	}
	var t = moment(ymd, "YYYY-MM-DD", true);
	var d = moment(dateInput, "YYYY-MM-DD", true);
	return t.isValid() && d.isValid() && t.isBefore(d, "day");
}

function taskDateAfterDay(temporalVal, dateInput) {
	var ymd = coerceTemporalToYmd(temporalVal);
	if (!ymd) return false;
	if (typeof dateInput === "string") {
		var day = calendarIsoDay(dateInput);
		return !!day && !!calendarIsoDay(ymd) && ymd > day;
	}
	var t = moment(ymd, "YYYY-MM-DD", true);
	var d = moment(dateInput, "YYYY-MM-DD", true);
	return t.isValid() && d.isValid() && t.isAfter(d, "day");
}

function taskIsOpenForCalendar(t) {
	if (!t) return false;
	if (t.completed === true) return false;
	if (t.fullyCompleted === true) return false;
	var st = t.status;
	if (st === "x" || st === "X") return false;
	if (st === "-") return false;
	return true;
}

function getInlineFieldValue(rawText, fieldName) {
	var re = new RegExp("\\["+fieldName+"::\\s*([^\\]]+)\\]", "i");
	var match = String(rawText || "").match(re);
	var value=match ? String(match[1] || "").trim() : "";return taskCalendarZone?taskCalendarZone.fieldTo(fieldName,value):value;
};

/**
 * 与 `views/periodic/dashboardTodayTasks.js` 中 getDueInstantFromTask / isOverdueOpenTask / isYellowStatus
 * 保持同一套「逾期 / 临期(黄) / 正常」判定，供月表小方块等着色复用（主页待办圆环 class 仅映射色相）。
 * periodKey：日/周/月/年 与待办分段一致；月表小点默认按 "day"（与主页默认「日」一致）。
 */
function tcAddCalendarDaysStr(dateStr, days) {
	var parts = String(dateStr || "").split("-").map(Number);
	if (!parts[0] || !parts[1] || !parts[2]) return "";
	var dt = new Date(parts[0], parts[1] - 1, parts[2]);
	dt.setDate(dt.getDate() + (Number(days) || 0));
	var pad2 = function (n) { return String(n).padStart(2, "0"); };
	return dt.getFullYear() + "-" + pad2(dt.getMonth() + 1) + "-" + pad2(dt.getDate());
}
function tcTaskDueYmdForDashboardUrgency(obj) {
	obj = obj && obj.calendarSource || obj;
	var y = coerceTemporalToYmd(obj && obj.due);
	if (y) return y;
	var raw = String((obj && obj.rawText) || (obj && obj.text) || "");
	var inline = getInlineFieldValue(raw, "due");
	if (!inline) return "";
	var head = String(inline).slice(0, 10);
	return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : "";
}
function tcGetDueInstantMsFromTaskObj(obj) {
	obj = obj && obj.calendarSource || obj;
	var txt = String((obj && obj.rawText) || (obj && obj.text) || "");
	var m = txt.match(/\[due::\s*(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?\]/i);
	if (m) {
		var y = +m[1].slice(0, 4);
		var mo = +m[1].slice(5, 7) - 1;
		var da = +m[1].slice(8, 10);
		if (m[2] != null) {
			var h = +m[2];
			var mi = +(m[3] || 0);
			var se = +(m[4] || 0);
			return new Date(y, mo, da, h, mi, se, 0).getTime();
		}
		return null;
	}
	var ymd = coerceTemporalToYmd(obj && obj.due);
	var tm = normalizeTimeStr(obj && obj.dueTime || "");
	if (ymd && tm) {
		var p = tm.split(":");
		return new Date(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10), +p[0], +p[1], 0, 0).getTime();
	}
	return null;
}
function tcIsOverdueOpenTaskCal(obj) {
	if (!obj || !taskIsOpenForCalendar(obj)) return false;
	var dDue = tcTaskDueYmdForDashboardUrgency(obj);
	if (!dDue) return false;
	var inst = tcGetDueInstantMsFromTaskObj(obj);
	if (inst != null) return inst < Date.now();
	return dDue < tToday;
}
function tcIsYellowSoonCal(obj, periodKey) {
	if (!obj || !taskIsOpenForCalendar(obj)) return false;
	var dDue = tcTaskDueYmdForDashboardUrgency(obj);
	if (!dDue) return false;
	if (tcIsOverdueOpenTaskCal(obj)) return false;
	var pk = String(periodKey || "day");
	if (pk === "day") {
		var inst = tcGetDueInstantMsFromTaskObj(obj);
		var t = Date.now();
		var fourH = 4 * 3600 * 1000;
		if (inst != null) return inst >= t && inst <= t + fourH;
		return dDue === tToday;
	}
	if (pk === "week") return dDue === tToday;
	if (pk === "month" || pk === "year") {
		var end3 = tcAddCalendarDaysStr(tToday, 2);
		return !!(end3 && dDue >= tToday && dDue <= end3);
	}
	return false;
}
/** @returns {"normal"|"soon"|"overdue"} */
function tcResolveMonthDotUrgency(obj, typeCls, periodKey) {
	if (!obj || !taskIsOpenForCalendar(obj)) return "normal";
	var cls = String(typeCls || "");
	if (cls.indexOf("overdue") === 0 || tcIsOverdueOpenTaskCal(obj)) return "overdue";
	if (tcIsYellowSoonCal(obj, periodKey != null ? periodKey : "day")) return "soon";
	return "normal";
}
try {
	if (typeof globalThis !== "undefined") {
		globalThis.__noriaTaskDueUrgency = {
			resolveMonthDot: tcResolveMonthDotUrgency,
			isOverdue: tcIsOverdueOpenTaskCal,
			isSoon: function (o, p) { return tcIsYellowSoonCal(o, p || "day"); },
			addCalendarDaysStr: tcAddCalendarDaysStr,
			dueYmd: tcTaskDueYmdForDashboardUrgency,
			ref: "tasks-calendar compact checkbox urgency"
		};
	}
} catch (_tcUrg) {}

function extractTimelineTag(rawText) {
	var text = String(rawText || "");
	var bare = text.match(/(^|\s)(#tl|#timeline)(?=\s|$)/i);
	if (bare && bare[2]) { return bare[2].trim().toLowerCase(); }
	var m1 = text.match(/(^|\s)(#tl\/[^\s#]+)/i);
	if (m1 && m1[2]) { return m1[2].trim().toLowerCase(); }
	var m2 = text.match(/(^|\s)(#timeline\/[^\s#]+)/i);
	if (m2 && m2[2]) { return m2[2].trim().toLowerCase(); }
	return "";
};

function normalizeTaskTemporal(task, dateKey, timeKey) {
	if (!task || task[dateKey] == null || task[dateKey] === "") return;
	var raw = task[dateKey];
	var ymd = coerceTemporalToYmd(raw);
	if (ymd) {
		task[dateKey] = ymd;
		try {
			if (!task[timeKey] && typeof raw.toFormat === "function") {
				var hm = raw.toFormat("HH:mm");
				if (hm && hm !== "00:00") {
					var nt = normalizeTimeStr(hm);
					if (nt) task[timeKey] = nt;
				}
			}
		} catch (_) {}
		return;
	}
	var parsed = parseDateTimeValue(typeof raw === "string" ? raw : String(raw));
	if (!parsed.date) {
		var fallback = moment(String(raw));
		if (fallback.isValid()) parsed.date = fallback.format("YYYY-MM-DD");
	}
	if (parsed.date) task[dateKey] = parsed.date;
	if (parsed.time && !task[timeKey]) task[timeKey] = parsed.time;
};

function timeToMinutes(rawTime) {
	var normalized = normalizeTimeStr(rawTime);
	if (!normalized) { return Number.POSITIVE_INFINITY; };
	var parts = normalized.split(":");
	return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
};

function getTimeForClass(obj, cls) {
	if (cls == "overdue" || cls == "due" || cls == "recurrence") { return obj.dueTime || obj.clockTime || ""; };
	if (cls == "scheduled") { return obj.scheduledTime || obj.clockTime || ""; };
	if (cls == "start") { return obj.startTime || obj.clockTime || ""; };
	if (cls == "process") { return obj.clockTime || obj.startTime || obj.dueTime || ""; };
	if (cls == "done") { return obj.completionTime || obj.clockTime || obj.dueTime || ""; };
	return obj.clockTime || obj.displayTime || "";
};

function hashTaskSnippet(s) {
	var str = String(s || "");
	var h = 0;
	var L = Math.min(str.length, 65536);
	for (var i = 0; i < L; i++) {
		h = ((h << 5) - h) + str.charCodeAt(i);
		h |= 0;
	}
	return String(h);
}
function normalizeTaskIdentitySnippet(rawText) {
	return String(rawText || "")
			.replace(/\[(?:start|due|scheduled|completion|done|created|cancelled)::\s*[^\]]*\]/ig, "")
			.replace(/\[(?:priority|repeat|recurrence|every|onCompletion|id|dependsOn)::\s*[^\]]*\]/ig, "")
		.replace(/\[(?:duration_min|default_tag|default_start|default_due|default_duration_min)::\s*[^\]]*\]/ig, "")
		.replace(/\s{2,}/g, " ")
		.trim();
}

function getTaskKey(task) {
	var path = (task && task.link && task.link.path) ? String(task.link.path) : String((task && task.path) || "");
	var header = (task && task.header && task.header.subpath) ? String(task.header.subpath) : "";
	var line = "";
	if (task && typeof task.line !== "undefined") {
		line = String(task.line);
	} else if (task && task.position && task.position.start && typeof task.position.start.line !== "undefined") {
		line = String(task.position.start.line) + ":" + String(task.position.start.col != null ? task.position.start.col : 0);
	}
	var rawSnippet = normalizeTaskIdentitySnippet((task && task.rawText != null) ? task.rawText : (task && task.text != null ? task.text : ""));
	/* Previously appended full rawSnippet：极长任务行会使 getTaskTone 整串哈希 O(n) 超时/卡死，并放大属性体积；改为长度+哈希保持去重稳定 */
	var tail = rawSnippet;
	if (rawSnippet.length > 480) {
		tail = String(rawSnippet.length) + "×" + hashTaskSnippet(rawSnippet);
	}
	return path + "::" + header + "::" + line + "::" + tail + (task && task.calendarSchedule ? "::schedule:"+task.calendarSchedule.index : "");
};

function getTaskTimeSlot(obj, cls, currentDate) {
	var min = Number.POSITIVE_INFINITY;
	var startMin = "";
	var endMin = "";
	var slotType = "none";
	var defaultDuration = 45;
	// A reminder carries its original dates; it is not a new booking today.
	if (cls === "overdue" || obj.calendarDeadline) { return {slotType, startMin, endMin}; }
	if (!currentDate) { return {slotType, startMin, endMin}; };
	var day = moment(currentDate, "YYYY-MM-DD", true);
	if (!day.isValid()) { return {slotType, startMin, endMin}; };
	var onStartDay = obj.start && taskDateSameDay(obj.start, currentDate);
	var onDueDay = obj.due && taskDateSameDay(obj.due, currentDate);
	var onScheduledDay = obj.scheduled && taskDateSameDay(obj.scheduled, currentDate);
	if (onStartDay && onDueDay && obj.startTime && obj.dueTime) {
		var s = timeToMinutes(obj.startTime);
		var e = timeToMinutes(obj.dueTime);
		if (Number.isFinite(s) && Number.isFinite(e)) {
			if (e > s) {
			startMin = String(s);
			endMin = String(e);
				slotType = "range";
				return {slotType, startMin, endMin};
			}
			/* 同日结束不晚于开始（数据倒置或相等）：统一一段，避免 due/start 桶走 point 时用不同时刻导致 plannerChrome 重复条 */
			var endFix = Math.min(s + defaultDuration, 24 * 60);
			if (endFix <= s) {
				endFix = Math.min(s + 15, 24 * 60);
			}
			startMin = String(s);
			endMin = String(endFix);
			slotType = "range";
			return {slotType, startMin, endMin};
		}
	}
	// Cross-day event from single record: render start-day and due-day segments separately.
	if (obj.start && obj.due && obj.startTime && obj.dueTime && onStartDay && !onDueDay) {
		var startOnlyCross = timeToMinutes(obj.startTime);
		if (Number.isFinite(startOnlyCross)) {
			startMin = String(startOnlyCross);
			endMin = String(24 * 60);
			slotType = "range";
			return {slotType, startMin, endMin};
		}
	}
	if (obj.start && obj.due && obj.startTime && obj.dueTime && !onStartDay && onDueDay) {
		var dueOnlyCross = timeToMinutes(obj.dueTime);
		if (Number.isFinite(dueOnlyCross)) {
			startMin = "0";
			endMin = String(dueOnlyCross);
			slotType = "range";
			return {slotType, startMin, endMin};
		}
	}
	if (obj.start && obj.due && obj.startTime && obj.dueTime) {
		var startDayM = moment(coerceTemporalToYmd(obj.start), "YYYY-MM-DD", true);
		var dueDayM = moment(coerceTemporalToYmd(obj.due), "YYYY-MM-DD", true);
		var betweenDays = startDayM.isValid() && dueDayM.isValid() && day.isAfter(startDayM, "day") && day.isBefore(dueDayM, "day");
		if (betweenDays) {
			startMin = "0";
			endMin = String(24 * 60);
			slotType = "range";
			return {slotType, startMin, endMin};
		}
	}
	// If only start-time exists on this day (e.g. sleep), render till end-of-day.
	if (onStartDay && obj.startTime && !obj.dueTime) {
		var startOnly = timeToMinutes(obj.startTime);
		if (Number.isFinite(startOnly)) {
			startMin = String(startOnly);
			endMin = String(24 * 60);
			slotType = "range";
			return {slotType, startMin, endMin};
		}
	}
	/* 同日仅有 due 时刻、无 start 时刻：与桶无关，避免 due 用 dueTime、start 用空链出两个 point */
	if (onStartDay && onDueDay && obj.dueTime && !obj.startTime) {
		var dueOnlyMin = timeToMinutes(obj.dueTime);
		if (Number.isFinite(dueOnlyMin)) {
			startMin = String(dueOnlyMin);
			endMin = String(dueOnlyMin + defaultDuration);
			slotType = "point";
			return {slotType, startMin, endMin};
		}
	}
	var clsTime = getTimeForClass(obj, cls);
	min = timeToMinutes(clsTime);
	if (Number.isFinite(min)) {
		startMin = String(min);
		endMin = String(min + defaultDuration);
		slotType = "point";
	}
	return {slotType, startMin, endMin};
};

/** #proj / project* 开头的着色标签：参与项目分色；其余无映射标签不触发随机分桶 */
function isProjectColorTagKey(key) {
	var k = String(key || "").trim().toLowerCase();
	if (!k) {
		return false;
	}
	return k === "proj" || k.indexOf("proj/") === 0 || k.indexOf("project") === 0;
}
/**
 * 无 #proj、无显式 tagColorMap、非逾期、非 #tl 时间轴任务：使用统一默认色相（data-tone=0），避免「待办彩虹」噪声
 */
function shouldUseDefaultTaskChroma(task, typeCls) {
	var tc = String(typeCls || "");
	if (tc === "overdue") {
		return false;
	}
	try {
		if (task && isTimelineTaggedTask(task)) {
			return false;
		}
	} catch (_) {}
	if (normalizeHexColor(getTaskMappedColor(task))) {
		return false;
	}
	if (isProjectColorTagKey(getTaskColorTagKey(task))) {
		return false;
	}
	return true;
}
function getTaskTone(task, typeCls) {
	try {
		if (task && isTimelineTaggedTask(task)) {
			return "timeline";
		}
	} catch (_) {}
	if (shouldUseDefaultTaskChroma(task, typeCls)) {
		return "0";
	}
	var key = getTaskKey(task);
	var hash = 0;
	var cap = Math.min(key.length, 2400);
	for (var i = 0; i < cap; i++) {
		hash = ((hash << 5) - hash) + key.charCodeAt(i);
		hash |= 0;
	}
	var tone = Math.abs(hash % 7) + 1;
	return String(tone);
};

function getTaskColorTagKey(task) {
 return bridgeCfg.runtime.resolveTaskCategory(task).tag;
}
function getTaskTagBucket(task) {
 return bridgeCfg.runtime.resolveTaskCategory(task).bucket;
}
function getTaskMappedColor(task) {
 return bridgeCfg.runtime.resolveTaskCategory(task).mappedColor;
}

function applyTaskTagColorMeta(el, taskObj, optTypeCls) {
	if (!el) return;
	if (isTimelineTaskLike(taskObj) || isTimelineTaskLike(el)) {
		el.setAttribute("data-timeline-tagged", "1");
		el.setAttribute("data-task-visual", "timeline");
		el.setAttribute("data-tone", "timeline");
		try {
			el.removeAttribute("data-tag-bucket");
			el.removeAttribute("data-tag-color");
			el.style.removeProperty("--tc-tag-color");
		} catch (_) {}
		return;
	}
	try {
		if (el.getAttribute("data-task-visual") === "timeline") { el.removeAttribute("data-task-visual"); }
	} catch (_) {}
	if (shouldUseDefaultTaskChroma(taskObj, optTypeCls)) {
		el.setAttribute("data-tone", "0");
		try {
			el.removeAttribute("data-tag-bucket");
		} catch (_) {}
		try {
			el.removeAttribute("data-tag-color");
			el.style.removeProperty("--tc-tag-color");
		} catch (_) {}
		return;
	}
	var tagBucket = getTaskTagBucket(taskObj);
	if (tagBucket) { el.setAttribute("data-tag-bucket", tagBucket); }
	var mapped = bridgeCfg.runtime.resolveTaskCategory(taskObj).color;
	if (mapped) {
		el.setAttribute("data-tone", "category");
		el.setAttribute("data-tag-color", mapped);
		try { el.style.setProperty("--tc-tag-color", mapped); } catch (_) {}
	} else {
		el.removeAttribute("data-tag-color");
		el.style.removeProperty("--tc-tag-color");
	}
}

/** plannerChrome 周视图时间轴：0:00–24:00（与左侧刻度一致） */
var PLANNER_CHROME_TIMELINE_START_MIN = 0;
var PLANNER_CHROME_TIMELINE_END_MIN = 24 * 60;
function getPlannerChromeTimelineStartMin() {
	return showEarlyHours || plannerHoursExpanded ? PLANNER_CHROME_TIMELINE_START_MIN : plannerActiveHours.start;
}
function getPlannerChromeTimelineEndMin() {
	return showEarlyHours || plannerHoursExpanded ? PLANNER_CHROME_TIMELINE_END_MIN : plannerActiveHours.end;
}

function classifyPlannerHoursSlot(slot, start, end) {
	if (!slot || slot.slotType === "none") return { before: false, after: false, outside: false };
	var s = Number(slot.startMin), e = Number(slot.endMin);
	if (!Number.isFinite(s)) return { before: false, after: false, outside: false };
	if (slot.slotType === "point") return { before: s < start, after: s >= end, outside: s < start || s >= end };
	return { before: s < start, after: e > end, outside: e <= start || s >= end };
}
/** 跨度 ≤ 此分钟数视为短条：仅展示开始时刻（右侧单行），标题省略以防挤压 */
var PLANNER_CHROME_COMPACT_MAX_MIN = 52;
/** 时间轴上「条」的最短视觉时长（分钟）：低于此值的 range/point 仍按该时长画高，避免字被压扁（约 45min 刻度高） */
var PLANNER_CHROME_MIN_VISUAL_RANGE_MIN = 45;

/**
 * 与 slotToCssVars 一致：把原始 start/end（分钟）扩到至少 PLANNER_CHROME_MIN_VISUAL_RANGE_MIN，
 * 供内联 top/height 覆盖层与并列检测共用，避免 normalizePlannerChromeWeekTaskGeometry 把条压回真实时长。
 */
function computePlannerChromeExpandedSlotBounds(dayStart, dayEnd, sRaw, eRaw) {
	var span = Math.max(1, dayEnd - dayStart);
	if (!Number.isFinite(sRaw) || !Number.isFinite(eRaw)) {
		return { s: dayStart, e: dayStart + PLANNER_CHROME_MIN_VISUAL_RANGE_MIN, span: span };
	}
	var visualEnd = dayEnd - 1;
	var minDur = PLANNER_CHROME_MIN_VISUAL_RANGE_MIN;
	var s = Math.max(dayStart, Math.min(sRaw, visualEnd - 1));
	var e = Math.min(Math.max(eRaw, s), visualEnd);
	if (e <= s) {
		e = Math.min(visualEnd, s + minDur);
	}
	if (e - s < minDur) {
		e = Math.min(visualEnd, s + minDur);
		if (e - s < minDur) {
			s = Math.max(dayStart, e - minDur);
		}
	}
	return { s: s, e: e, span: span };
}

function slotToCssVars(slot) {
	if (!slot || !slot.slotType || slot.slotType == "none") { return ""; };
	var dayStart = getPlannerChromeTimelineStartMin();
	var dayEnd = getPlannerChromeTimelineEndMin();
	var sRaw = parseInt(slot.startMin, 10);
	var eRaw = parseInt(slot.endMin, 10);
	if (!Number.isFinite(sRaw) || !Number.isFinite(eRaw)) { return ""; };
	var b = computePlannerChromeExpandedSlotBounds(dayStart, dayEnd, sRaw, eRaw);
	var s = b.s;
	var e = b.e;
	var span = b.span;
	var top = ((s - dayStart) / span) * 100;
	var height = ((e - s) / span) * 100;
	var minPct = (PLANNER_CHROME_MIN_VISUAL_RANGE_MIN / span) * 100;
	if (slot.slotType == "point") {
		height = Math.max(height, minPct, 2.1);
	} else {
		height = Math.max(height, minPct, 2.5);
	}
	return ";--slot-top:"+top.toFixed(3)+"%;--slot-height:"+height.toFixed(3)+"%";
};

function minutesToTimeStr(totalMinutes) {
	var safe = Math.max(0, Math.floor(totalMinutes));
	if (safe >= 24 * 60) { return "24:00"; }
	var h = Math.floor(safe / 60);
	var m = safe % 60;
	return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
};

function roundMinutesToStep(mins, step) {
	var s = step || 15;
	return Math.round(mins / s) * s;
};

function formatDateTime(m) {
	return moment(m).format("YYYY-MM-DD HH:mm");
};

function toDayMoment(dayStr, mins) {
	var m = Math.max(0, Math.floor(Number(mins) || 0));
	if (m >= 24 * 60) {
		return moment(dayStr + " 23:59", "YYYY-MM-DD HH:mm", true);
	}
	return moment(dayStr, "YYYY-MM-DD", true).startOf("day").add(m, "minutes");
};

function upsertInlineField(lineText, fieldName, value) {
 if(taskCalendarZone)value=taskCalendarZone.fieldFrom(fieldName,value);
	var re = new RegExp("\\["+fieldName+"::\\s*[^\\]]*\\]", "ig");
	var block = "["+fieldName+":: "+value+"]";
	if (re.test(lineText)) {
		var replaced = false;
		return lineText.replace(re, function () { if (replaced) return ""; replaced = true; return block; });
	}
	var reference = String(lineText).match(/([ \t]+\^[A-Za-z0-9-]+)[ \t]*$/);
	return (reference ? lineText.slice(0, reference.index) : lineText) + "  " + block + (reference ? reference[0] : "");
};

function stripInlineField(lineText, fieldName) {
	var re = new RegExp("\\s*\\["+fieldName+"::\\s*[^\\]]*\\]", "ig");
	return String(lineText || "").replace(re, "");
};
function getInlineFieldValue(lineText, fieldName) {
	var re = new RegExp("\\["+fieldName+"::\\s*([^\\]]*)\\]", "i");
	var m = String(lineText || "").match(re);
	var value=m ? String(m[1] || "").trim() : "";return taskCalendarZone?taskCalendarZone.fieldTo(fieldName,value):value;
}
function stripTaskAdvancedFields(lineText) {
	var line = String(lineText || "");
	[
		"priority",
		"repeat",
		"recurrence",
		"every",
		"onCompletion",
		"id",
		"dependsOn",
		"cancelled"
	].forEach(function (f) {
		line = stripInlineField(line, f);
	});
	return line;
}
function normalizeTaskStatusValue(value) {
	var v = String(value || "").trim().toLowerCase();
	if (v === "/" || v === "in progress" || v === "in_progress" || v === "progress" || v === "process") return "in_progress";
	if (v === "x" || v === "done" || v === "completed" || v === "complete") return "done";
	if (v === "-" || v === "cancelled" || v === "canceled" || v === "cancel") return "cancelled";
	return "todo";
}
function getTaskStatusFromText(lineText, fallback) {
	var m = String(lineText || "").match(/^\s*-\s*\[([^\]]*)\]/);
	if (m) return normalizeTaskStatusValue(m[1]);
	return normalizeTaskStatusValue(fallback);
}
function taskStatusMark(status) {
	var s = normalizeTaskStatusValue(status);
	if (s === "in_progress") return "/";
	if (s === "done") return "x";
	if (s === "cancelled") return "-";
	return " ";
}
function applyTaskStatusToLine(lineText, status) {
	var mark = taskStatusMark(status);
	return String(lineText || "").replace(/^(\s*-\s*\[)([^\]]*)(\]\s*)/, function (_m, a, _inner, c) {
		return a + mark + c;
	});
}
function normalizeTaskIdList(raw) {
	var seen = Object.create(null);
	var out = [];
	String(raw || "")
		.split(/[,\s，、]+/)
		.map(function (x) { return String(x || "").trim(); })
		.filter(Boolean)
		.forEach(function (id) {
			if (/^[A-Za-z0-9_-]+$/.test(id) && !seen[id]) {
				seen[id] = true;
				out.push(id);
			}
		});
	return out;
}
function formatTaskDateOnly(value) {
	var raw = String(value || "").trim();
	if (!raw) return "";
	var m = moment(raw, ["YYYY-MM-DD", "YYYY-MM-DD HH:mm", "YYYY-MM-DDTHH:mm"], true);
	return m.isValid() ? m.format("YYYY-MM-DD") : "";
}
function formatTaskDateTimeField(value) {
	var raw = String(value || "").trim().replace("T", " ");
	if (!raw) return "";
	var parsed = parseDateTimeValue(raw);
	if (!parsed.date) return "";
	return parsed.date + (parsed.time ? (" " + parsed.time) : "");
}
function formatTaskDateTimeFromParts(dateValue, timeValue) {
	var date = formatTaskDateOnly(dateValue);
	var time = normalizeTimeStr(timeValue || "");
	return date ? (date + (time ? (" " + time) : "")) : "";
}
function taskRowDateTimeValue(row, dateField, timeField) {
	if (!row) return "";
	return formatTaskDateTimeFromParts(row[dateField], row[timeField]);
}
function formatTaskDateTimeForSave(momentValue, explicitValue) {
	var explicit = formatTaskDateTimeField(explicitValue);
	return explicit || formatDateTime(momentValue);
}
function upsertOrStripInlineField(lineText, fieldName, value) {
	var v = String(value || "").trim();
	return v ? upsertInlineField(lineText, fieldName, v) : stripInlineField(lineText, fieldName);
}
function createTasksCompatibleId(existingIds) {
	var used = Object.create(null);
	(existingIds || []).forEach(function (id) {
		if (id) used[String(id)] = true;
	});
	var id = "";
	do {
		id = Math.random().toString(36).slice(2, 8);
	} while (!id || used[id]);
	return id;
}
function stripTaskTemplateOnlyFields(lineText) {
	var line = String(lineText || "");
	[
		"default_tag",
		"default_start",
		"default_due",
		"default_duration_min",
		"duration_min"
	].forEach(function (f) {
		line = stripInlineField(line, f);
	});
	return line;
}

function normalizeTaskTagsInput(rawTags) {
	var seen = Object.create(null);
	var out = [];
	String(rawTags || "")
		.split(/[\s,，;；]+/)
		.map(function (x) { return String(x || "").trim(); })
		.filter(Boolean)
		.forEach(function (tag) {
			var t = tag.replace(/^＃/, "#");
			if (!t.startsWith("#")) { t = "#" + t; }
			if (/^#[^\s#]+$/.test(t) && !seen[t]) {
				seen[t] = true;
				out.push(t);
			}
		});
	return out.join(" ");
}
function splitTaskTitleAndTagsFromRaw(rawLine, fallbackTitle) {
	var body = String(rawLine || "").replace(/^\s*-\s*\[[^\]]*\]\s*/, "");
	body = stripInlineField(body, "start");
	body = stripInlineField(body, "due");
	body = stripInlineField(body, "scheduled");
	body = stripInlineField(body, "completion");
	body = stripInlineField(body, "created");
	body = stripInlineField(body, "cancelled");
	body = stripTaskTemplateOnlyFields(body);
	body = stripTaskAdvancedFields(body);
	body = stripTaskPriorityMarkers(body);
	var tagMatches = body.match(/(^|\s)#[^\s#]+/g) || [];
	var tags = normalizeTaskTagsInput(tagMatches.join(" "));
	var title = body.replace(/(^|\s)#[^\s#]+/g, " ").replace(/\s{2,}/g, " ").trim();
	if (!title) { title = String(fallbackTitle || tcRuntimeT("runtime.tasksCalendar.editor.task")).trim() || tcRuntimeT("runtime.tasksCalendar.editor.task"); }
	return { title: title, tags: tags };
}
function rebuildTaskLineMainText(lineText, taskTitle, taskTags) {
	var line = String(lineText || "");
	var prefixMatch = line.match(/^(\s*-\s*\[[^\]]*\]\s*)/);
	var prefix = prefixMatch ? prefixMatch[1] : "- [ ] ";
	var title = String(taskTitle || "").replace(/\s+/g, " ").trim();
	if (!title) { title = tcRuntimeT("runtime.tasksCalendar.editor.task"); }
	var tags = normalizeTaskTagsInput(taskTags || "");
	return prefix + title + (tags ? (" " + tags) : "");
}

function isTaskLine(line) {
	/* 兼容 Tasks / 全角括号 / Unicode 勾号等：任意 `- [ … ]` 形态均视为任务行 */
	return /^\s*-\s*\[[^\]]*\]/.test(line);
};

function normalizeMarkdownLineTextForTask(rawLine, fallbackTitle) {
	var text = String(rawLine || "").trim();
	if (!text) { return String(fallbackTitle || tcRuntimeT("runtime.tasksCalendar.editor.task")).trim() || tcRuntimeT("runtime.tasksCalendar.editor.task"); }
	text = text
		.replace(/^\s*[-*+]\s+/, "")
		.replace(/^\s*\d+[.)]\s+/, "")
		.replace(/^\s*>\s?/, "")
		.replace(/\s+/g, " ")
		.trim();
	return text || String(fallbackTitle || tcRuntimeT("runtime.tasksCalendar.editor.task")).trim() || tcRuntimeT("runtime.tasksCalendar.editor.task");
}

function normalizeMarkdownLineToTaskDraft(rawLine, fallbackTitle) {
	var source = String(rawLine == null ? "" : rawLine);
	var sourceWasTask = isTaskLine(source);
	if (sourceWasTask) {
		return {
			sourceWasTask: true,
			sourceRawLine: source,
			syntheticLine: source,
			titleInfo: splitTaskTitleAndTagsFromRaw(source, fallbackTitle)
		};
	}
	var indentMatch = source.match(/^\s*/);
	var indent = indentMatch ? indentMatch[0] : "";
	var title = normalizeMarkdownLineTextForTask(source, fallbackTitle);
	var syntheticLine = indent + "- [ ] " + title;
	return {
		sourceWasTask: false,
		sourceRawLine: source,
		syntheticLine: syntheticLine,
		titleInfo: splitTaskTitleAndTagsFromRaw(syntheticLine, fallbackTitle)
	};
}

function normalizeMarkdownSourceForConversion(rawLine) {
	return String(rawLine == null ? "" : rawLine).replace(/\s+/g, " ").trim();
}

function markdownLineMatchesConversionSource(lineText, sourceRawLine) {
	var line = String(lineText == null ? "" : lineText);
	var source = String(sourceRawLine == null ? "" : sourceRawLine);
	if (line === source) { return true; }
	var sourceNorm = normalizeMarkdownSourceForConversion(source);
	if (!sourceNorm) { return normalizeMarkdownSourceForConversion(line) === ""; }
	return normalizeMarkdownSourceForConversion(line) === sourceNorm;
}

function pickMarkdownLineIndexForConversion(lines, preferredLine, sourceRawLine) {
	var idx = parseInt(preferredLine, 10);
	var candidates = [];
	if (Number.isFinite(idx)) { candidates.push(idx, idx-1, idx+1, idx-2, idx+2); }
	for (var c=0; c<candidates.length; c++) {
		var i = candidates[c];
		if (i >= 0 && i < lines.length && markdownLineMatchesConversionSource(lines[i], sourceRawLine)) { return i; }
	}
	return -1;
}

function buildTaskLineFromMarkdownConversion(lineText, status) {
	var source = String(lineText == null ? "" : lineText);
	var indentMatch = source.match(/^\s*/);
	var indent = indentMatch ? indentMatch[0] : "";
	return indent + "- [" + taskStatusMark(status || "todo") + "] " + normalizeMarkdownLineTextForTask(source, tcRuntimeT("runtime.tasksCalendar.editor.task"));
}

function normalizeForMatch(text) {
	return String(text || "")
		.replace(/\[start::\s*[^\]]*\]/ig, "")
		.replace(/\[due::\s*[^\]]*\]/ig, "")
		.replace(/\[scheduled::\s*[^\]]*\]/ig, "")
		.replace(/\[(?:completion|done)::\s*[^\]]*\]/ig, "")
		.replace(/\[created::\s*[^\]]*\]/ig, "")
		.replace(/\[cancelled::\s*[^\]]*\]/ig, "")
		.replace(/\[(?:priority|repeat|recurrence|every|onCompletion|id|dependsOn)::\s*[^\]]*\]/ig, "")
		.replace(/\[duration_min::\s*[^\]]*\]/ig, "")
		.replace(/\[default_(?:tag|start|due|duration_min)::\s*[^\]]*\]/ig, "")
		.replace(/\s{2,}/g, " ")
		.trim();
};

function isMatchingTaskLine(line, rawText, rawSig, oldStartNeedle, oldDueNeedle) {
	if (oldStartNeedle && !line.includes(oldStartNeedle)) { return false; }
	if (oldDueNeedle && !line.includes(oldDueNeedle)) { return false; }
	var sig = "";
	try { sig = decodeURIComponent(String(rawSig || "")); } catch (_) { sig = ""; }
	if (sig.length > 0 && line.includes(sig)) { return true; }
	var needle = normalizeForMatch(rawText);
	if (needle.length > 0 && normalizeForMatch(line).includes(needle)) { return true; }
	return false;
};

function pickTaskLineIndex(lines, preferredLine, rawText, rawSig, oldStartNeedle, oldDueNeedle) {
	var idx = parseInt(preferredLine, 10);
	if (
		Number.isFinite(idx)
		&& idx >= 0
		&& idx < lines.length
		&& isTaskLine(lines[idx])
		&& isMatchingTaskLine(lines[idx], rawText, rawSig, oldStartNeedle, oldDueNeedle)
	) {
		return idx;
	}
	var strictMatches = [];
	for (var j=0;j<lines.length;j++) {
		if (!isTaskLine(lines[j])) { continue; }
		if (isMatchingTaskLine(lines[j], rawText, rawSig, oldStartNeedle, oldDueNeedle)) { strictMatches.push(j); }
	}
	if (strictMatches.length === 1) { return strictMatches[0]; }
	if (strictMatches.length > 1) { return -1; }
	// Relaxed fallback: ignore old temporal needles and match by signature/text only.
	var relaxedMatches = [];
	for (var r=0;r<lines.length;r++) {
		if (!isTaskLine(lines[r])) { continue; }
		if (isMatchingTaskLine(lines[r], rawText, rawSig, "", "")) { relaxedMatches.push(r); }
	}
	return relaxedMatches.length === 1 ? relaxedMatches[0] : -1;
};

function showDebugNotice(message) {
	try {
		var NoticeClass = (typeof window !== "undefined" && window.Notice) ? window.Notice : (typeof Notice !== "undefined" ? Notice : null);
		if (NoticeClass) { new NoticeClass(message, 2500); }
	} catch (_) {}
};
/** 拖拽写回成功等：短 Toast，避免与 Debug 长提示抢注意 */
function showBriefNotice(message, ms) {
	var dur = Number.isFinite(ms) ? Math.max(380, ms) : 1100;
	try {
		var NoticeClass = (typeof window !== "undefined" && window.Notice) ? window.Notice : (typeof Notice !== "undefined" ? Notice : null);
		if (NoticeClass) { new NoticeClass(String(message || ""), dur); return; }
	} catch (_) {}
	showDebugNotice(message);
};

async function triggerTaskFreshRefresh() {
	if (plannerChromeInteractionActive || editModeActive) {
		tcRefreshDeferredByInteraction = true;
		return;
	}
	try {
		if (await refreshTasksFromFreshSource("tasks-calendar-write") < 0 || tcRuntimeDisposed) return;
	} catch (_) { return; }
	if (rootNode.getAttribute("view") === "list") {
		getList(tasks, selectedDate);
		return;
	}
	try {
		var g = rootNode && rootNode.querySelector ? (rootNode.querySelector(":scope > .grid") || rootNode.querySelector(".grid")) : null;
		if (g) { hydrateGridTaskCells(g); }
	} catch (_) {}
	refreshCalendarRangeStatistics();
	try { schedulePlannerChromeWeekLanesFinalizePost(true); } catch (_) {}
	try { schedulePlannerChromeOverlapLayout(); } catch (_) {}
};

/** 拖拽/弹窗保存后延迟合并刷新：先局部更新，稍后再一次 fresh source 刷新，减少抖动与抢焦点感 */
var tcSoftRefreshTimer = null;
var tcRefreshDeferredByInteraction = false;
var tcHydrationDeferredByInteraction = false;
var tcDeferredHydrationGrid = null;
function flushDeferredTaskFreshRefresh(delayMs) {
	if (!tcRefreshDeferredByInteraction) { return; }
	tcRefreshDeferredByInteraction = false;
	scheduleTasksCalendarSoftRefresh(Number.isFinite(delayMs) ? delayMs : 180);
}
function deferHydrationIfInteracting(gridEl) {
	if (!plannerChromeInteractionActive && !editModeActive) { return false; }
	tcHydrationDeferredByInteraction = true;
	try {
		var g = resolveHydrationGrid(gridEl);
		if (g) { tcDeferredHydrationGrid = g; }
	} catch (_) {}
	return true;
}
/** 待排区和时间轴交互前需立即有 .dayBucket/.timeLane，不能等 setTimeout 再灌格子 */
function flushDeferredHydrationSync() {
	if (!tcHydrationDeferredByInteraction) { return; }
	tcHydrationDeferredByInteraction = false;
	var g = tcDeferredHydrationGrid;
	tcDeferredHydrationGrid = null;
	try {
		if (!g && rootNode && rootNode.querySelector) {
			g = rootNode.querySelector(":scope > .grid") || rootNode.querySelector(".grid");
		}
	} catch (_) {}
	if (!g) { return; }
	try { hydrateGridTaskCells(g); } catch (_) {}
}
function flushDeferredHydration(delayMs) {
	if (!tcHydrationDeferredByInteraction) { return; }
	var g = tcDeferredHydrationGrid;
	tcDeferredHydrationGrid = null;
	tcHydrationDeferredByInteraction = false;
	try {
		if (!g && rootNode && rootNode.querySelector) {
			g = rootNode.querySelector(":scope > .grid") || rootNode.querySelector(".grid");
		}
	} catch (_) {}
	if (!g) { return; }
	setTimeout(function () {
		try { hydrateGridTaskCells(g); } catch (_) {}
	}, Number.isFinite(delayMs) ? Math.max(0, delayMs) : 60);
}
function setEditModeRenderFreezeUi(on) {
	try {
		if (!rootNode || !rootNode.classList) { return; }
		rootNode.classList.toggle("tc-edit-freeze", !!on);
	} catch (_) {}
}
function scheduleTasksCalendarSoftRefresh(delayMs) {
	var delay = Number.isFinite(delayMs) ? Math.max(120, delayMs) : 520;
	if (tcSoftRefreshTimer) { clearTimeout(tcSoftRefreshTimer); }
	tcSoftRefreshTimer = setTimeout(function () {
		tcSoftRefreshTimer = null;
		triggerTaskFreshRefresh();
	}, delay);
};

function getTaskIdentityKey(taskEl) {
	if (!taskEl) { return ""; }
	var p = String(taskEl.getAttribute("data-tc-path") || taskEl.getAttribute("data-task-path") || "");
	var l = String(taskEl.getAttribute("data-tc-line") || taskEl.getAttribute("data-task-line") || "");
	var s = String(taskEl.getAttribute("data-tc-sig") || taskEl.getAttribute("data-task-sig") || "");
	var schedule = taskEl.getAttribute("data-schedule-index");
	return [p, l, s].join("::") + (schedule != null && schedule !== "" ? "::schedule:"+schedule : "");
};

function collectTaskMeta(taskEl) {
	var rawText = "";
	var descNode = taskEl ? taskEl.querySelector(".description") : null;
	if (!descNode && taskEl) {
		descNode = taskEl.querySelector("a.internal-link");
	}
	if (!descNode && taskEl) {
		descNode = taskEl.querySelector(".tc-title-row .internal-link");
	}
	if (descNode) { rawText = String(descNode.textContent || "").trim(); }
	var sourceWasTask = true;
	var sourceWasTaskAttr = taskEl ? taskEl.getAttribute("data-noria-source-was-task") : null;
	if (sourceWasTaskAttr === "0" || sourceWasTaskAttr === "false") { sourceWasTask = false; }
	var sourceRawLine = "";
	try {
		if (taskEl && taskEl.getAttribute("data-noria-source-raw-line")) {
			sourceRawLine = decodeURIComponent(String(taskEl.getAttribute("data-noria-source-raw-line") || ""));
		}
	} catch (_) {
		sourceRawLine = "";
	}
	return {
		taskEl,
		scheduleIndex: taskEl && taskEl.hasAttribute("data-schedule-index") ? Number(taskEl.getAttribute("data-schedule-index")) : undefined,
		filePath: taskEl ? (taskEl.getAttribute("data-tc-path") || taskEl.getAttribute("data-task-path")) : "",
		lineIndex: taskEl ? (taskEl.getAttribute("data-tc-line") || taskEl.getAttribute("data-task-line")) : "",
		rawSig: taskEl ? (taskEl.getAttribute("data-tc-sig") || taskEl.getAttribute("data-task-sig")) : "",
		oldStartDate: taskEl ? taskEl.getAttribute("data-start-date") : "",
		oldStartTime: taskEl ? normalizeTimeStr(taskEl.getAttribute("data-start-time")) : "",
		oldDueDate: taskEl ? taskEl.getAttribute("data-due-date") : "",
		oldDueTime: taskEl ? normalizeTimeStr(taskEl.getAttribute("data-due-time")) : "",
		rawText,
		sourceWasTask: sourceWasTask,
		sourceRawLine: sourceRawLine
	};
};

/**
 * `renderTasksIntoHost` / hydrate 从全局 `tasks` 快照取数；写盘后因 metadata 尚未重索引，快照仍是旧时段，
 * 会在 `flushDeferredHydration` 时把条画回旧位。保存成功后按 path/行号/签名命中行并就地更新 start/due。
 */
function taskLineMetaMatches(liRaw, tl) {
	if (liRaw === "" || tl === "") { return false; }
	if (liRaw === tl) { return true; }
	var a = parseInt(liRaw, 10);
	var b = parseInt(tl, 10);
	return Number.isFinite(a) && Number.isFinite(b) && a === b;
}
function taskCalendarRowLocation(path, line) {
	var filePath = normalizeVaultRelPath(path || "");
	var raw = line == null ? "" : String(line).trim();
	if (!filePath || !raw) return "";
	var numeric = parseInt(raw,10);
	return filePath + "\u0000" + (Number.isFinite(numeric) ? numeric : raw);
}
function buildCalendarTaskRowIndex() {
	var index = new Map();
	tasks.forEach(function (task) {
		var line = task.position?.start?.line !== undefined ? task.position.start.line : task.line;
		var key = taskCalendarRowLocation(task.path || task.link?.path, line);
		if (key && !index.has(key)) index.set(key,task);
	});
	return index;
}
function findTaskRowForSaveMeta(meta, rowIndex) {
	if (rowIndex) {
		var indexed = rowIndex.get(taskCalendarRowLocation(meta.filePath, meta.lineIndex));
		if (indexed) return indexed;
	}
	var fp = normalizeVaultRelPath(meta.filePath || "");
	if (!fp || !tasks || !tasks.length) { return null; }
	var liRaw = meta.lineIndex != null ? String(meta.lineIndex).trim() : "";
	var decodedSig = "";
	try {
		if (meta.rawSig) { decodedSig = decodeURIComponent(String(meta.rawSig)); }
	} catch (_) {
		decodedSig = "";
	}
	var candidates = [];
	for (var i = 0; i < tasks.length; i++) {
		var t = tasks[i];
		var tp = normalizeVaultRelPath(t.path || (t.link && t.link.path) || "");
		if (tp === fp) { candidates.push(t); }
	}
	if (candidates.length === 0) { return null; }
	if (candidates.length === 1) { return candidates[0]; }
	for (var j = 0; j < candidates.length; j++) {
		var c = candidates[j];
		var tl = "";
		if (c.position && c.position.start && typeof c.position.start.line !== "undefined") {
			tl = String(c.position.start.line);
		} else if (typeof c.line !== "undefined") {
			tl = String(c.line);
		}
		if (liRaw !== "" && taskLineMetaMatches(liRaw, tl)) { return c; }
	}
	if (decodedSig) {
		var snip = decodedSig.slice(0, 240);
		for (var k = 0; k < candidates.length; k++) {
			if (snip && String(candidates[k].rawText || "").indexOf(snip) >= 0) { return candidates[k]; }
		}
	}
	/* 同文件多条且行号与缓存不一致时：用 collectTaskMeta 的 description 文本与 rawText 尾部对齐，避免 patch 落空、源日格幽灵条 */
	var descNeedle = "";
	try {
		descNeedle = normalizeForMatch(String((meta && meta.rawText) || ""));
	} catch (_) {
		descNeedle = "";
	}
	if (descNeedle && descNeedle.length >= 8) {
		for (var q = 0; q < candidates.length; q++) {
			var rt = String(candidates[q].rawText || "");
			if (normalizeForMatch(rt).indexOf(descNeedle) >= 0) { return candidates[q]; }
		}
	}
	return null;
}
function patchGlobalTasksFromSavedLine(meta, savedLine) {
	tcTaskSourceRevision++;
	var row = findTaskRowForSaveMeta(meta);
	if (!row) { return; }
	if (savedLine) {
		row.rawText = String(savedLine || "");
		row.rawLine = row.rawText;
		row.schedules = noriaBridge.tasks.parseTaskLine(row.rawText).schedules;
		var savedStart = readTaskCalendarDate(row.rawText, "start");
		var savedDue = readTaskCalendarDate(row.rawText, "due");
		// The committed line is authoritative, including fields removed by Undo.
		row.start = savedStart.date || "";
		row.startTime = savedStart.time || "";
		row.due = savedDue.date || "";
		row.dueTime = savedDue.time || "";
		row.status = getTaskStatusFromText(row.rawText, row.status || "");
		row.completed = row.status === "done";
		row.checked = row.status === "done" || row.status === "cancelled";
		row.priority = getPriorityFromText(row.rawText, row.priority || "normal");
		row.id = getInlineFieldValue(row.rawText, "id");
		row.dependsOn = normalizeTaskIdList(getInlineFieldValue(row.rawText, "dependsOn"));
		row.recurrenceText = getInlineFieldValue(row.rawText, "repeat") || getInlineFieldValue(row.rawText, "recurrence") || "";
		row.recurrence = !!row.recurrenceText || /🔁/.test(row.rawText);
		row.created = formatTaskDateOnly(getInlineFieldValue(row.rawText, "created"));
		row.createdTime = parseDateTimeValue(getInlineFieldValue(row.rawText, "created")).time || "";
		row.cancelled = formatTaskDateOnly(getInlineFieldValue(row.rawText, "cancelled"));
		row.cancelledTime = parseDateTimeValue(getInlineFieldValue(row.rawText, "cancelled")).time || "";
		row.completion = formatTaskDateOnly(getInlineFieldValue(row.rawText, "completion") || getInlineFieldValue(row.rawText, "done"));
		row.completionTime = parseDateTimeValue(getInlineFieldValue(row.rawText, "completion") || getInlineFieldValue(row.rawText, "done")).time || "";
		row.timelineTag = extractTimelineTag(row.rawText);
		row.isTimelineDay = /(^|\s)#tl\/day(?:\s|$)/i.test(row.rawText) || /(^|\s)#timeline\/day(?:\s|$)/i.test(row.rawText);
		row.isTimelineInstant = (!row.isTimelineDay && /(^|\s)#tl\/[^\s#]+/i.test(row.rawText))
			|| /(^|\s)#timeline\/instant(?:\s|$)/i.test(row.rawText);
		var plain = row.rawText
			.replace(/^\s*-\s*\[[^\]]*\]\s*/, "")
			.replace(/\[(?:start|due|scheduled|schedule|completion|created|cancelled)::\s*[^\]]*\]/ig, " ")
			.replace(/\[(?:priority|repeat|recurrence|every|onCompletion|id|dependsOn)::\s*[^\]]*\]/ig, " ")
			.replace(/\[(?:duration_min|default_tag|default_start|default_due|default_duration_min)::\s*[^\]]*\]/ig, " ")
			.replace(/(^|\s)#[^\s#]+/g, " ")
			.replace(/\s{2,}/g, " ")
			.trim();
		if (plain) { row.text = plain; }
	}
	patchGlobalSyncInlineScheduledFromRawText(row);
	row.displayTime = row.clockTime || row.dueTime || row.scheduledTime || row.startTime || "";
	row.timeSort = timeToMinutes(row.displayTime);
}

/** 按当前 rawText 同步或清除 [scheduled::]，避免改期后仍挂在旧日格 */
function patchGlobalSyncInlineScheduledFromRawText(row) {
	if (!row) return;
	var txt = String(row.rawText || "");
	var parsed = readTaskCalendarDate(txt,"scheduled");
	if (parsed.date) {
		if (parsed.date) {
			row.scheduled = parsed.date;
			row.scheduledTime = parsed.time || "";
			normalizeTaskTemporal(row, "scheduled", "scheduledTime");
			return;
		}
	}
	try {
		delete row.scheduled;
		delete row.scheduledTime;
	} catch (_) {
		row.scheduled = undefined;
		row.scheduledTime = undefined;
	}
}

function removeTaskFromRuntimeByMeta(meta) {
	if (!Array.isArray(tasks) || !tasks.length) { return false; }
	var row = findTaskRowForSaveMeta(meta || {});
	if (row) {
	var idx = tasks.indexOf(row);
		if (idx >= 0) {
	tasks.splice(idx, 1);
	return true;
		}
	}
	var fp = normalizeVaultRelPath((meta && meta.filePath) || "");
	var needle = normalizeForMatch(String((meta && meta.rawText) || ""));
	for (var i = 0; i < tasks.length; i++) {
		var t = tasks[i];
		var tp = normalizeVaultRelPath(t.path || (t.link && t.link.path) || "");
		if (fp && tp !== fp) { continue; }
		if (!needle || normalizeForMatch(String(t.rawText || t.text || "")).indexOf(needle) >= 0) {
			tasks.splice(i, 1);
			return true;
		}
	}
	return false;
}

/* Tasks 能力原生化：Markdown 持久化适配层（保持 .md 单一事实源） */
var mdTaskAdapter = {
	collectMetaFromEl: function (taskEl) {
		return collectTaskMeta(taskEl);
	},
	saveDateTime: async function (taskEl, newStartMoment, newEndMoment, options) {
		return saveTaskDateTime(taskEl, newStartMoment, newEndMoment, options || {});
	},
	removeTask: async function (taskEl, options) {
		return removeTaskLine(taskEl, options || {});
	}
};

function getTaskRowPath(row) {
	return normalizeVaultRelPath(row && (row.path || (row.link && row.link.path) || ""));
}
function getTaskRowLine(row) {
	if (row && row.position && row.position.start && typeof row.position.start.line !== "undefined") {
		return String(row.position.start.line);
	}
	if (row && typeof row.line !== "undefined") return String(row.line);
	return "";
}
function getTaskRowTitle(row) {
	return String((row && (row.text || row.visual || row.rawText)) || "").replace(/\s+/g, " ").trim() || "任务";
}
function buildTaskDependencyRef(row) {
	var raw = String((row && row.rawText) || (row && row.text) || "");
	var id = String((row && row.id) || getInlineFieldValue(raw, "id") || "").trim();
	var dependsOn = Array.isArray(row && row.dependsOn)
		? row.dependsOn.slice()
		: normalizeTaskIdList(getInlineFieldValue(raw, "dependsOn"));
	return {
		path: getTaskRowPath(row),
		line: getTaskRowLine(row),
		rawText: raw,
		title: getTaskRowTitle(row),
		id: id,
		dependsOn: dependsOn
	};
}
function taskDependencyRefKey(ref) {
	return [normalizeVaultRelPath(ref && ref.path), String(ref && ref.line || ""), String(ref && ref.rawText || "").slice(0, 80)].join("::");
}
function getTaskByDependencyId(id) {
	var needle = String(id || "").trim();
	if (!needle || !Array.isArray(tasks)) return null;
	for (var i = 0; i < tasks.length; i++) {
		var row = tasks[i];
		var rowId = String((row && row.id) || getInlineFieldValue((row && row.rawText) || "", "id") || "").trim();
		if (rowId && rowId === needle) return row;
	}
	return null;
}
function taskDependencyIsSatisfied(row) {
	if (!row) return false;
	var status = normalizeTaskStatusValue((row && row.status) || getTaskStatusFromText((row && row.rawText) || "", ""));
	return status === "done" || row.completed === true;
}
function getTaskDependencyBlockInfo(row) {
	var ids = Array.isArray(row && row.dependsOn)
		? row.dependsOn.slice()
		: normalizeTaskIdList(getInlineFieldValue((row && row.rawText) || "", "dependsOn"));
	var blocked = [];
	ids.forEach(function (id) {
		var dep = getTaskByDependencyId(id);
		if (dep && taskDependencyIsSatisfied(dep)) return;
		blocked.push(dep ? getTaskRowTitle(dep) : id);
	});
	return { blocked: blocked.length > 0, labels: blocked };
}
function applyTaskDependencyStateToEl(el, row) {
	if (!el || !el.setAttribute) return;
	var info = getTaskDependencyBlockInfo(row);
	var baseTitle = el.getAttribute("data-dependency-base-title");
	if (baseTitle == null) {
		baseTitle = String(el.title || "").trim();
		el.setAttribute("data-dependency-base-title", baseTitle);
	}
	el.classList.toggle("tc-cal-item--blocked", !!info.blocked);
	el.setAttribute("data-dependency-blocked", info.blocked ? "true" : "false");
	if (info.blocked) {
		var suffix = "等待依赖：" + info.labels.slice(0, 3).join("、") + (info.labels.length > 3 ? "…" : "");
		el.setAttribute("data-dependency-title", suffix);
		el.title = baseTitle
			? (baseTitle + " · " + suffix)
			: suffix;
	} else {
		el.removeAttribute("data-dependency-title");
		el.title = baseTitle;
	}
}
function patchTaskDependencyRefInMemory(ref, nextLine) {
	if (!Array.isArray(tasks)) return false;
	var path = normalizeVaultRelPath(ref && ref.path);
	var line = String((ref && ref.line) || "");
	var rawNeedle = normalizeForMatch((ref && ref.rawText) || "");
	for (var i = 0; i < tasks.length; i++) {
		var row = tasks[i];
		var rowPath = getTaskRowPath(row);
		var rowLine = getTaskRowLine(row);
		var rowRaw = String((row && row.rawText) || (row && row.text) || "");
		if (path && rowPath !== path) continue;
		if (line !== "" && rowLine !== "" && line !== rowLine) continue;
		if (rawNeedle && normalizeForMatch(rowRaw).indexOf(rawNeedle) < 0 && normalizeForMatch(nextLine).indexOf(normalizeForMatch(rowRaw)) < 0) continue;
		row.rawText = String(nextLine || "");
		row.status = getTaskStatusFromText(row.rawText, row.status || "todo");
		row.completed = row.status === "done";
		row.checked = row.status === "done" || row.status === "cancelled";
		row.priority = getPriorityFromText(row.rawText, row.priority || "normal");
		row.id = getInlineFieldValue(row.rawText, "id");
		row.dependsOn = normalizeTaskIdList(getInlineFieldValue(row.rawText, "dependsOn"));
		row.recurrenceText = getInlineFieldValue(row.rawText, "repeat") || getInlineFieldValue(row.rawText, "recurrence") || "";
		row.recurrence = !!row.recurrenceText || /🔁/.test(row.rawText);
		row.created = formatTaskDateOnly(getInlineFieldValue(row.rawText, "created"));
		row.createdTime = parseDateTimeValue(getInlineFieldValue(row.rawText, "created")).time || "";
		row.cancelled = formatTaskDateOnly(getInlineFieldValue(row.rawText, "cancelled"));
		row.cancelledTime = parseDateTimeValue(getInlineFieldValue(row.rawText, "cancelled")).time || "";
		row.completion = formatTaskDateOnly(getInlineFieldValue(row.rawText, "completion") || getInlineFieldValue(row.rawText, "done"));
		row.completionTime = parseDateTimeValue(getInlineFieldValue(row.rawText, "completion") || getInlineFieldValue(row.rawText, "done")).time || "";
		var split = splitTaskTitleAndTagsFromRaw(row.rawText, row.text || "");
		if (split.title) row.text = split.title;
		return true;
	}
	return false;
}
function listTaskDependencyRefs(currentMeta) {
	var currentPath = normalizeVaultRelPath(currentMeta && currentMeta.filePath);
	var currentLine = String((currentMeta && currentMeta.lineIndex) || "");
	var out = [];
	var seen = Object.create(null);
	if (!Array.isArray(tasks)) return out;
	for (var i = 0; i < tasks.length; i++) {
		var ref = buildTaskDependencyRef(tasks[i]);
		if (!ref.path) continue;
		if (currentPath && ref.path === currentPath && currentLine !== "" && String(ref.line) === currentLine) continue;
		var key = taskDependencyRefKey(ref);
		if (seen[key]) continue;
		seen[key] = true;
		out.push(ref);
	}
	return out;
}
function getKnownTaskIds() {
	var ids = [];
	if (!Array.isArray(tasks)) return ids;
	for (var i = 0; i < tasks.length; i++) {
		var id = String((tasks[i] && tasks[i].id) || getInlineFieldValue((tasks[i] && tasks[i].rawText) || "", "id") || "").trim();
		if (id) ids.push(id);
	}
	return ids;
}
async function processTaskMarkdownFile(filePath, transform) {
	var normalized = String(filePath || "").replace(/\\/g, "/").replace(/^\/+/, "").trim();
	if (!normalized) throw new Error("missing task path");
	var file = app.vault.getAbstractFileByPath(normalized);
	if (!file) throw new Error("file not found: " + normalized);
	var currentText = "";
	var nextText = "";
	var applyTransform = function (current) {
		currentText = String(current || "");
		var transformed = typeof transform === "function" ? transform(currentText) : currentText;
		nextText = transformed == null ? currentText : String(transformed);
		return nextText;
	};
	if (typeof app.vault.process === "function") {
		await app.vault.process(file, applyTransform);
	} else {
		var current = await app.vault.cachedRead(file);
		applyTransform(current);
		if (nextText !== currentText) await app.vault.modify(file, nextText);
	}
	return { file: file, text: nextText, changed: nextText !== currentText };
}
async function modifyTaskLineByRef(ref, transform) {
	var filePath = normalizeVaultRelPath(ref && ref.path);
	if (!filePath) throw new Error("missing dependency task path");
	var nextLine = "";
	var changed = false;
	await processTaskMarkdownFile(filePath, function (content) {
		var lines = content.split(/\r?\n/);
		var idx = pickTaskLineIndex(lines, ref.line, ref.rawText, "", "", "");
		if (idx < 0) throw new Error("dependency task line not found: " + filePath);
		var oldLine = String(lines[idx] || "");
		nextLine = String(transform(oldLine, idx) || oldLine).replace(/\s{2,}/g, " ").trimEnd();
		changed = nextLine !== oldLine;
		if (!changed) return content;
		lines[idx] = nextLine;
		return lines.join("\n");
	});
	if (changed) {
		try { patchTaskDependencyRefInMemory(ref, nextLine); } catch (_) {}
	}
	return nextLine;
}
async function ensureDependencyRefId(ref, usedIds) {
	var id = String(ref && ref.id || "").trim();
	if (id) return id;
	id = createTasksCompatibleId(usedIds);
	usedIds.push(id);
	ref.id = id;
	await modifyTaskLineByRef(ref, function (line) {
		return upsertInlineField(line, "id", id);
	});
	return id;
}
function applyTaskEditorMetadataToLine(lineText, advanced) {
	var line = stripTaskMetadataEmojis(String(lineText || ""));
	var meta = advanced || {};
	if (meta.status) line = applyTaskStatusToLine(line, meta.status);
	if (typeof meta.scheduledDate === "string") line = upsertOrStripInlineField(line, "scheduled", formatTaskDateTimeField(meta.scheduledDate));
	if (typeof meta.createdDate === "string") line = upsertOrStripInlineField(line, "created", formatTaskDateTimeField(meta.createdDate));
	line = stripInlineField(line, "done");
	var timelineLike = isTimelineTaskLike(lineText) || isTimelineTaskLike(line);
	if (meta.status === "done") {
		line = stripInlineField(line, "completion");
		if (!timelineLike) {
			line = upsertInlineField(line, "completion", formatTaskDateTimeField(meta.doneDate) || calendarNow().format("YYYY-MM-DD HH:mm"));
		}
		line = stripInlineField(line, "cancelled");
	} else if (meta.status === "cancelled") {
		line = upsertInlineField(line, "cancelled", formatTaskDateTimeField(meta.cancelledDate) || calendarNow().format("YYYY-MM-DD HH:mm"));
		line = stripInlineField(line, "completion");
	} else {
		line = stripInlineField(line, "completion");
		line = stripInlineField(line, "cancelled");
	}
	line = stripInlineField(line, "recurrence");
	line = stripInlineField(line, "every");
	if (typeof meta.repeat === "string") line = upsertOrStripInlineField(line, "repeat", meta.repeat.replace(/\s+/g, " ").trim());
	if (typeof meta.onCompletion === "string") line = upsertOrStripInlineField(line, "onCompletion", meta.onCompletion.replace(/\s+/g, " ").trim());
	if (typeof meta.id === "string") line = upsertOrStripInlineField(line, "id", meta.id);
	if (Array.isArray(meta.dependsOnIds)) {
		line = upsertOrStripInlineField(line, "dependsOn", meta.dependsOnIds.join(","));
	}
	return line.replace(/\s{2,}/g, " ").trimEnd();
}
function extractTaskEditorMetadata(lineText, rowState, createMode) {
	var raw = String(lineText || "");
	var repeat = getInlineFieldValue(raw, "repeat") || getInlineFieldValue(raw, "recurrence") || getInlineFieldValue(raw, "every");
	if (!repeat) {
		var rm = raw.match(/🔁\s*([^\[]*)/);
		if (rm) repeat = String(rm[1] || "").trim();
	}
	var status = createMode
		? "todo"
		: getTaskStatusFromText(raw, rowState && rowState.completed ? "done" : (rowState && rowState.checked ? "cancelled" : "todo"));
	return {
		status: status,
		scheduledDate: formatTaskDateTimeField(getInlineFieldValue(raw, "scheduled") || taskRowDateTimeValue(rowState, "scheduled", "scheduledTime") || ""),
		createdDate: formatTaskDateTimeField(getInlineFieldValue(raw, "created") || taskRowDateTimeValue(rowState, "created", "createdTime") || (createMode ? calendarNow().format("YYYY-MM-DD HH:mm") : "")),
		doneDate: formatTaskDateTimeField(getInlineFieldValue(raw, "completion") || getInlineFieldValue(raw, "done") || taskRowDateTimeValue(rowState, "completion", "completionTime") || ""),
		cancelledDate: formatTaskDateTimeField(getInlineFieldValue(raw, "cancelled") || taskRowDateTimeValue(rowState, "cancelled", "cancelledTime") || ""),
		repeat: repeat,
		onCompletion: getInlineFieldValue(raw, "onCompletion"),
		id: getInlineFieldValue(raw, "id") || (rowState && rowState.id) || "",
		dependsOnIds: normalizeTaskIdList(getInlineFieldValue(raw, "dependsOn") || ((rowState && Array.isArray(rowState.dependsOn)) ? rowState.dependsOn.join(",") : ""))
	};
}
async function syncTaskEditorDependencies(currentMeta, currentId, beforeRefs, afterRefs, originalAfterRefs) {
	var usedIds = getKnownTaskIds();
	if (currentId && usedIds.indexOf(currentId) < 0) usedIds.push(currentId);
	var beforeIds = [];
	for (var i = 0; i < beforeRefs.length; i++) {
		var bid = await ensureDependencyRefId(beforeRefs[i], usedIds);
		if (bid && beforeIds.indexOf(bid) < 0) beforeIds.push(bid);
	}
	var afterKeys = Object.create(null);
	(afterRefs || []).forEach(function (ref) { afterKeys[taskDependencyRefKey(ref)] = true; });
	var currentIdNeeded = currentId || ((afterRefs && afterRefs.length) ? createTasksCompatibleId(usedIds) : "");
	if (currentIdNeeded && usedIds.indexOf(currentIdNeeded) < 0) usedIds.push(currentIdNeeded);
	var afterMap = Object.create(null);
	(originalAfterRefs || []).concat(afterRefs || []).forEach(function (ref) {
		afterMap[taskDependencyRefKey(ref)] = ref;
	});
	if (currentIdNeeded) {
		for (var key in afterMap) {
			if (!Object.prototype.hasOwnProperty.call(afterMap, key)) continue;
			(function (ref, shouldHave) {
				ref._zShouldDependOnCurrent = shouldHave;
			})(afterMap[key], !!afterKeys[key]);
		}
		for (var k in afterMap) {
			if (!Object.prototype.hasOwnProperty.call(afterMap, k)) continue;
			var ref = afterMap[k];
			await modifyTaskLineByRef(ref, function (line) {
				var ids = normalizeTaskIdList(getInlineFieldValue(line, "dependsOn"));
				var has = ids.indexOf(currentIdNeeded) >= 0;
				if (ref._zShouldDependOnCurrent && !has) ids.push(currentIdNeeded);
				if (!ref._zShouldDependOnCurrent && has) ids = ids.filter(function (x) { return x !== currentIdNeeded; });
				return upsertOrStripInlineField(line, "dependsOn", ids.join(","));
			});
		}
	}
	try { triggerTaskFreshRefresh(); } catch (_) {}
	try { scheduleTasksCalendarSoftRefresh(320); } catch (_) {}
	return { currentId: currentIdNeeded, beforeIds: beforeIds };
}

async function saveTaskEisenhowerBucket(taskEl, targetBucket) {
	var bucket = normalizeEisenhowerBucketOverride(targetBucket);
	if (!bucket) throw new Error("invalid quadrant");
	var meta = collectTaskMeta(taskEl);
	if (!meta.filePath) throw new Error("missing task path");
	var currentTask = findTaskRowForSaveMeta(meta) || {
		priority: taskEl ? taskEl.getAttribute("data-priority") : "normal"
	};
	var nextPriority = getPriorityForEisenhowerBucket(currentTask, bucket);
	var nextLine = "";
	await processTaskMarkdownFile(meta.filePath, function (content) {
		var lines = content.split(/\r?\n/);
		var idx = pickTaskLineIndex(lines, meta.lineIndex, meta.rawText, meta.rawSig, "", "");
		if (idx < 0) throw new Error("task line not found: " + meta.filePath + " @" + meta.lineIndex);
		var line = applyTaskPriorityMarker(lines[idx], nextPriority);
		line = stripInlineField(line, "noria-quadrant");
		line = upsertInlineField(line, "noria-quadrant", bucket).replace(/\s{2,}/g, " ").trimEnd();
		nextLine = line;
		lines[idx] = line;
		return lines.join("\n");
	});
	if (currentTask) {
		currentTask.priority = nextPriority;
		currentTask.noriaQuadrant = bucket;
		currentTask.rawText = nextLine;
	}
	if (taskEl) {
		taskEl.setAttribute("data-priority", nextPriority);
		taskEl.setAttribute("data-eisen-bucket", bucket);
	}
	triggerTaskFreshRefresh();
	return { bucket: bucket, priority: nextPriority };
}

async function saveTaskDateTime(taskEl, newStartMoment, newEndMoment, options) {
	var meta = collectTaskMeta(taskEl);
	if (!meta.filePath) { throw new Error("missing task path"); }
	return saveTaskDateTimeLines(meta, newStartMoment, newEndMoment, options || {});
};

/** 与 buildDailyNotePath 一致的路径规范化，用于跨文件比对 */
function normalizeVaultRelPath(p) {
	return String(p || "").replace(/\\/g, "/").replace(/^\/+/, "").trim();
}

async function saveTaskDateTimeLines(meta, newStartMoment, newEndMoment, options) {
	options = options || {};
	var filePath = meta.filePath;
	var lineIndex = meta.lineIndex;
	var rawSig = meta.rawSig;
	var oldStartDate = meta.oldStartDate;
	var oldStartTime = meta.oldStartTime;
	var oldDueDate = meta.oldDueDate;
	var oldDueTime = meta.oldDueTime;
	var rawText = meta.rawText;
	var oldStartNeedle = oldStartDate ? "[start:: "+oldStartDate+(oldStartTime ? " "+oldStartTime : "")+"]" : "";
	var oldDueNeedle = oldDueDate ? "[due:: "+oldDueDate+(oldDueTime ? " "+oldDueTime : "")+"]" : "";
	var sourceWasTask = meta.sourceWasTask !== false;
	var idx = -1;
	var line = "", beforeLine = "";
	await processTaskMarkdownFile(filePath, function (content) {
		var lines = content.split(/\r?\n/);
		idx = (Number.isInteger(meta.scheduleIndex) || options.addSchedule)
			? noriaBridge.tasks.locateSource(content, {rawText:meta.rawSig ? decodeURIComponent(meta.rawSig) : rawText}).line
			: sourceWasTask
			? pickTaskLineIndex(lines, lineIndex, rawText, rawSig, oldStartNeedle, oldDueNeedle)
			: pickMarkdownLineIndexForConversion(lines, lineIndex, meta.sourceRawLine);
		if (idx < 0) {
			throw new Error((sourceWasTask ? "task line not found: " : "source line not found: ")+filePath+" @"+lineIndex);
		}
		line = lines[idx];beforeLine=line;
		if (!sourceWasTask) {
			var conversionStatus = options && options.taskAdvanced ? options.taskAdvanced.status : "todo";
			line = buildTaskLineFromMarkdownConversion(line, conversionStatus);
		}
		// Calendar moves retain the source fields and surrounding task text.
		if (options.addSchedule) {
			line = noriaBridge.tasks.patchTaskLine(line, {schedule:{action:"add",start:moment(newStartMoment).format("YYYY-MM-DD HH:mm"),end:moment(newEndMoment).format("YYYY-MM-DD HH:mm")}});
		} else if (Number.isInteger(meta.scheduleIndex)) {
			var scheduleMoves=options.scheduleMoves||[{index:meta.scheduleIndex,start:newStartMoment,end:newEndMoment,options:options}];
			var usedIndices=new Set();
			scheduleMoves.forEach(function(move) {
				if (!Number.isInteger(move.index)||usedIndices.has(move.index)) throw Error("invalid-schedule-index");
				usedIndices.add(move.index);
				line=patchCalendarSchedule(line,move.index,move.start,move.end,move.options||{});
			});
		} else if (Number.isFinite(options.calendarDayShift)) {
			line = shiftTaskCalendarDates(line, options.calendarDayShift, moment(newStartMoment).format("YYYY-MM-DD"));
		} else if (options.calendarResize) {
			line=resizeTaskCalendarDate(line,options.calendarResize.key,options.calendarResize.date);
		} else {
		line = stripTaskTemplateOnlyFields(line);
		if (options && (typeof options.taskTitle === "string" || typeof options.taskTags === "string")) {
			line = rebuildTaskLineMainText(line, options.taskTitle, options.taskTags);
		}
		if (options && typeof options.taskPriority === "string") {
			line = applyTaskPriorityMarker(line, options.taskPriority);
		}
		line = line.trimEnd();
	var hasIndependentDeadline = noriaBridge.tasks.parseTaskLine(line).schedules.length && !readTaskCalendarDate(line,"start").date;
	line = noriaBridge.tasks.patchTaskDates(line, hasIndependentDeadline ? {
		due: formatTaskDateTimeForSave(newStartMoment, options && options.startDateTimeString)
	} : {
		start: formatTaskDateTimeForSave(newStartMoment, options && options.startDateTimeString),
		due: formatTaskDateTimeForSave(newEndMoment, options && options.dueDateTimeString)
	});
		}
		if (options && options.taskAdvanced && typeof options.taskAdvanced === "object") {
			line = applyTaskEditorMetadataToLine(line, options.taskAdvanced);
		}
		lines[idx] = line;
		return lines.join(content.includes("\r\n") ? "\r\n" : "\n");
	});
	patchGlobalTasksFromSavedLine(meta, line);
	// A vault event may arrive after the next paint. Refresh from this write.
	if (noriaBridge && noriaBridge.taskSnapshots) noriaBridge.taskSnapshots.invalidate("tasks");
	if (noriaBridge && noriaBridge.data) await noriaBridge.data.invalidate("calendar-write:" + filePath, "tasks");
	if (typeof app !== "undefined") app.workspace?.trigger?.("noria:tasks-invalidated", { path: filePath, reason: "calendar-write", scope: "tasks" });
	var elOut = meta.taskEl;
	if (elOut) {
		var savedStartParts = parseDateTimeValue(formatTaskDateTimeForSave(newStartMoment, options && options.startDateTimeString));
		var savedDueParts = parseDateTimeValue(formatTaskDateTimeForSave(newEndMoment, options && options.dueDateTimeString));
		elOut.setAttribute("data-start-date", moment(newStartMoment).format("YYYY-MM-DD"));
		elOut.setAttribute("data-start-time", savedStartParts.time || "");
		elOut.setAttribute("data-due-date", moment(newEndMoment).format("YYYY-MM-DD"));
		elOut.setAttribute("data-due-time", savedDueParts.time || "");
		if (Number.isFinite(options.calendarDayShift) || options.calendarResize) {
			["start","due"].forEach(function(key) { var part=readTaskCalendarDate(line,key);elOut.setAttribute("data-"+key+"-date",part.date||"");elOut.setAttribute("data-"+key+"-time",part.time||""); });
		}
		if (options.addSchedule) {
			meta.scheduleIndex=noriaBridge.tasks.parseTaskLine(line).schedules.length-1;
			elOut.setAttribute("data-schedule-index",String(meta.scheduleIndex));
		}
		if (Number.isInteger(meta.scheduleIndex)) {
			var savedSchedule=noriaBridge.tasks.parseTaskLine(line).schedules[meta.scheduleIndex];
			[["start",savedSchedule.start],["due",savedSchedule.end||savedSchedule.start]].forEach(function(pair) {
				var part=parseDateTimeValue(pair[1]);elOut.setAttribute("data-"+pair[0]+"-date",part.date);elOut.setAttribute("data-"+pair[0]+"-time",part.time);
			});
			elOut.setAttribute("data-tc-sig",encodeURIComponent(line));
		}
		try {
			var cell = elOut.closest(".cell[data-date]");
			var d = cell ? cell.getAttribute("data-date") : "";
			var sd = moment(newStartMoment).format("YYYY-MM-DD");
			var ed = moment(newEndMoment).format("YYYY-MM-DD");
			if (d && sd === d) {
				elOut.setAttribute("data-start-min", String(moment(newStartMoment).hours() * 60 + moment(newStartMoment).minutes()));
			}
			if (d && ed === d) {
				elOut.setAttribute("data-end-min", String(moment(newEndMoment).hours() * 60 + moment(newEndMoment).minutes()));
			}
		} catch (_) {}
	}
	if (!options.silentNotice) {
		showDebugNotice(tcRuntimeT("runtime.tasksCalendar.notice.savedLine", { file: filePath.split("/").pop(), line: idx + 1 }));
	}
	if (!options.suppressRefresh) { triggerTaskFreshRefresh(); }
	return {path:filePath,index:idx,before:beforeLine,after:line};
};

function isPlannerChromeActive(targetRoot, views) {
	var rn = targetRoot || rootNode;
	if (!rn || !rn.classList) { return false; }
	if (views && views.length) {
		var viewName = "";
		try { viewName = String(rn.getAttribute("view") || ""); } catch (_) { viewName = ""; }
		if (views.indexOf(viewName) === -1) { return false; }
	}
	return rn.classList.contains("planner-chrome") || rn.classList.contains("planner-chrome");
}
function isPlannerChromeTimelineView(targetRoot, views) {
	if (!isTimelineCalendarView()) { return false; }
	if (isPlannerChromeActive(targetRoot, views)) { return true; }
	/* 冷启动首帧兜底：class 未就绪时，仍按 storeWeek 主链运行，避免先走 legacy 链后再二次回跳。 */
	var rn = targetRoot || rootNode;
	if (views && views.length) {
		var viewName = "";
		try { viewName = String(rn && rn.getAttribute ? (rn.getAttribute("view") || "") : ""); } catch (_) { viewName = ""; }
		if (views.indexOf(viewName) === -1) { return false; }
	}
	return !!(tcFeatureFlags && tcFeatureFlags.storeWeek);
}

/** 写入 start/due 后：优先局部更新；必要时才重灌网格；最后延迟软刷新兜底 */
function afterTaskDateTimeEditorSave(taskEl) {
	var viewName = "";
	var isWeekPlannerChrome = false;
	var lane = null;
	var hostCellDate = "";
	var startDate = "";
	var dueDate = "";
	try {
		viewName = rootNode && rootNode.getAttribute ? rootNode.getAttribute("view") : "";
		isWeekPlannerChrome = isPlannerChromeActive(rootNode, ["week", "day"]);
		lane = taskEl && taskEl.closest ? taskEl.closest(".timeLane") : null;
		var hostCell = taskEl && taskEl.closest ? taskEl.closest(".cell[data-date]") : null;
		hostCellDate = hostCell ? String(hostCell.getAttribute("data-date") || "") : "";
		startDate = taskEl ? String(taskEl.getAttribute("data-start-date") || "") : "";
		dueDate = taskEl ? String(taskEl.getAttribute("data-due-date") || "") : "";
	} catch (_) {}
	try {
		if (lane) { schedulePlannerChromeOverlapLayout([lane]); }
		normalizePlannerChromeWeekTaskGeometry();
	} catch (_) {}
	try {
		var shouldHydrateGrid = false;
		var monthRevision = 0;
		if (viewName === "month") {
			monthRevision = ++tcMonthCommitRevision;
			/* 月表：整表 hydrate 易与 LP/metadata 异步改写竞态，且循环末尾全局桶停在「最后一格」；改为只重灌与本条相关的日期格（含源格 hostCellDate） */
			var datesMonth = [];
			if (hostCellDate) { datesMonth.push(hostCellDate); }
			if (startDate) { datesMonth.push(startDate); }
			if (dueDate) { datesMonth.push(dueDate); }
			try {
				if (startDate && dueDate && moment && moment(startDate, "YYYY-MM-DD", true).isValid() && moment(dueDate, "YYYY-MM-DD", true).isValid()) {
					var lo = moment.min(moment(startDate, "YYYY-MM-DD"), moment(dueDate, "YYYY-MM-DD")).startOf("day");
					var hi = moment.max(moment(startDate, "YYYY-MM-DD"), moment(dueDate, "YYYY-MM-DD")).startOf("day");
					var spanDays = hi.diff(lo, "days");
					if (spanDays > 0 && spanDays <= 62) {
						for (var di = 0; di <= spanDays; di++) {
							datesMonth.push(lo.clone().add(di, "days").format("YYYY-MM-DD"));
						}
					}
				}
			} catch (_) {}
			if (datesMonth.length) {
				try {
					tcHydrateMonthCellsForDates(datesMonth, { revision: monthRevision });
				} catch (_mh) {}
			} else {
			shouldHydrateGrid = true;
			}
		} else if (viewName === "week" || viewName === "day") {
			/* 周 plannerChrome 时间轴编辑后通常可局部更新；仅跨到别日（当前格不再承载）时重灌 */
			if (!isWeekPlannerChrome) {
				shouldHydrateGrid = true;
			} else if (hostCellDate && startDate && dueDate && startDate !== hostCellDate && dueDate !== hostCellDate) {
				shouldHydrateGrid = true;
			}
		}
		if (shouldHydrateGrid) {
			var g = null;
			try {
				g = rootNode.querySelector(":scope > .grid");
			} catch (_) {
				g = rootNode.querySelector(".grid");
			}
			if (g) { hydrateGridTaskCells(g); }
		}
	} catch (_) {}
	scheduleTasksCalendarSoftRefresh(isWeekPlannerChrome ? 640 : 420);
}

function isTimelineCalendarView() {
	var v = rootNode && rootNode.getAttribute ? rootNode.getAttribute("view") : "";
	return v === "week" || v === "day";
}

function getCellFromPoint(x, y) {
	var el = document.elementFromPoint(x, y);
	if (!el) { return null; }
	return el.closest(".tasksCalendar[view='week']:is(.planner-chrome, .planner-chrome) .cell, .tasksCalendar[view='day']:is(.planner-chrome, .planner-chrome) .cell");
};

var calendarDragCancel = null;
var calendarUndoClose = null;

function calendarEdgeScroll(doc, x, y) {
	var win=doc.defaultView, node=doc.elementFromPoint(x,y);
	for (;node && node!==doc.body;node=node.parentElement) {
		if (node.scrollHeight<=node.clientHeight+1 || !/auto|scroll/.test(win.getComputedStyle(node).overflowY)) continue;
		var rect=node.getBoundingClientRect(),top=Math.max(0,rect.top),bottom=Math.min(win.innerHeight,rect.bottom);
		var step=y<top+36?-Math.ceil(10*Math.max(0,(top+36-y)/36)):y>bottom-36?Math.ceil(10*Math.max(0,(y-bottom+36)/36)):0;
		if (!step) continue;
		var before=node.scrollTop;node.scrollTop+=Math.max(-12,Math.min(12,step));
		if (node.scrollTop!==before) return true;
	}
	return false;
}

function createCalendarDragFeedback(taskEl, onScroll) {
	var doc=taskEl.ownerDocument,win=doc.defaultView,hint=doc.createElement("div"),raf=null,point=null,closed=false;
	hint.className="noria-calendar-drag-hint";hint.hidden=true;doc.body.appendChild(hint);
	var tick=function(){raf=null;if(closed)return;if(!taskEl.isConnected){if(calendarDragCancel)calendarDragCancel();return;}
		if(point&&rootNode.contains(doc.elementFromPoint(point.x,point.y))&&calendarEdgeScroll(doc,point.x,point.y))onScroll(point);
		if(raf===null)raf=win.requestAnimationFrame(tick);
	};
	return {
		update:function(x,y,label){if(closed)return;point={x,y};hint.hidden=false;hint.textContent=label;
			var rect=hint.getBoundingClientRect();hint.style.left=Math.max(8,Math.min(x+18,win.innerWidth-rect.width-8))+"px";
			hint.style.top=Math.max(8,y-rect.height-24)+"px";if(raf===null)raf=win.requestAnimationFrame(tick);},
		close:function(){closed=true;if(raf!==null)win.cancelAnimationFrame(raf);hint.remove();}
	};
}

async function restoreCalendarDragLine(receipt) {
	await processTaskMarkdownFile(receipt.path,function(raw){
		var lines=raw.split(/\r?\n/),index=receipt.index;
		if(lines[index]!==receipt.after){var hits=lines.map((line,i)=>line===receipt.after?i:-1).filter(i=>i>=0);if(hits.length!==1)throw Error(tasksCalendarRuntimeLocale()==="zh-CN"?"任务已再次修改，未覆盖新内容。":"The task changed again; newer edits were kept.");index=hits[0];}
		lines[index]=receipt.before;return lines.join(raw.includes("\r\n")?"\r\n":"\n");
	});
	var signature = receipt.after.replace(/^\s*-\s*\[[^\]]*\]\s*/, "");
	patchGlobalTasksFromSavedLine({filePath: receipt.path, rawSig: encodeURIComponent(signature), rawText: signature}, receipt.before);
	// A quick undo may precede (or receive no) vault change notification.
	// Invalidate both shared sources before a refresh can reapply the saved dates.
	if (noriaBridge && noriaBridge.taskSnapshots) noriaBridge.taskSnapshots.invalidate("tasks");
	if (noriaBridge && noriaBridge.data) await noriaBridge.data.invalidate("calendar-undo:" + receipt.path, "tasks");
	if (typeof app !== "undefined") app.workspace?.trigger?.("noria:tasks-invalidated", { path: receipt.path, reason: "calendar-undo", scope: "tasks" });
	// Repaint this view from the restored model; later reads now use fresh sources.
	var grid = rootNode && (rootNode.querySelector(":scope > .grid") || rootNode.querySelector(".grid"));
	if (grid) hydrateGridTaskCells(grid);
	scheduleTasksCalendarSoftRefresh(180);
}

function showCalendarDragUndo(receipt) {
	if(calendarUndoClose)calendarUndoClose();if(!receipt || tcRuntimeDisposed || !rootNode.isConnected)return;
	var doc=rootNode.ownerDocument,bar=doc.createElement("div"),button=doc.createElement("button"),zh=tasksCalendarRuntimeLocale()==="zh-CN";
	bar.className="noria-calendar-drag-undo";bar.setAttribute("role","status");bar.appendChild(doc.createTextNode(zh?"已调整时间":"Rescheduled"));
	button.textContent=tcRuntimeT("runtime.tasksCalendar.common.undo");button.type="button";bar.appendChild(button);doc.body.appendChild(bar);
	var r=rootNode.getBoundingClientRect();bar.style.left=Math.max(8,Math.min(r.left+r.width/2-90,doc.defaultView.innerWidth-200))+"px";bar.style.bottom="24px";
	var timer;var close=function(){clearTimeout(timer);bar.remove();if(calendarUndoClose===close)calendarUndoClose=null;};calendarUndoClose=close;
	var expire=function(){if(bar.contains(doc.activeElement)||bar.matches(":hover")){timer=setTimeout(expire,1000);return;}close();};timer=setTimeout(expire,12000);
	button.onclick=async function(){clearTimeout(timer);button.disabled=true;try{await restoreCalendarDragLine(receipt);close();}catch(error){bar.firstChild.textContent=error.message;button.disabled=false;timer=setTimeout(expire,12000);}};
}

function resizeTaskCalendarDate(line, key, date) {
	if (!readTaskCalendarDate(line,key).date) throw Error("The task has no "+key+" date to resize");
	return noriaBridge.tasks.patchTaskDates(line, { [key]: value => date + value.slice(10) });
}

function patchCalendarSchedule(line, index, start, end, options) {
	var schedule=noriaBridge.tasks.parseTaskLine(line).schedules[index];
	if (!schedule || schedule.error) throw Error("invalid-schedule");
	var first=schedule.start,last=schedule.end;
	if (Number.isFinite(options.calendarDayShift)) {
		var shift=function(value) { return value ? moment(value.slice(0,10),"YYYY-MM-DD",true).add(options.calendarDayShift,"days").format("YYYY-MM-DD")+value.slice(10) : ""; };
		first=shift(first);last=shift(last);
	} else if (options.calendarResize) {
		if (options.calendarResize.key === "start") first=options.calendarResize.date+first.slice(10);
		else if (last) last=options.calendarResize.date+last.slice(10);
		else throw Error("invalid-schedule");
	} else {
		var format=first.length===10 && !options.scheduleTimed ? "YYYY-MM-DD" : "YYYY-MM-DD HH:mm";
		first=moment(start).format(format);last=(last||options.scheduleTimed)?moment(end).format(format):"";
	}
	return noriaBridge.tasks.patchTaskLine(line,{schedule:{action:"update",index:index,start:first,end:last}});
}

function getMonthGridCellFromPoint(clientX, clientY) {
	if (!rootNode || rootNode.getAttribute("view") !== "month") { return null; }
	var doc = rootNode.ownerDocument || document;
	var el = null;
	try {
		el = doc.elementFromPoint(clientX, clientY);
	} catch (_) { return null; }
	if (!el || !rootNode.contains(el)) { return null; }
	var cell = el.closest(".cell[data-date]");
	if (cell && rootNode.contains(cell)) { return cell; }
	// Continuous bars live above the cells. Resolve the grabbed column using
	// viewport coordinates, including after the containing week has scrolled.
	var wrapper = el.closest(".wrapper");
	if (!wrapper || !el.closest(".tc-month-span-overlay-item")) { return null; }
	var bounds = wrapper.getBoundingClientRect();
	if (clientY < bounds.top || clientY >= bounds.bottom) { return null; }
	return Array.from(wrapper.querySelectorAll(".cell[data-date]")).find(function (candidate) {
		var rect = candidate.getBoundingClientRect();
		return clientX >= rect.left && clientX < rect.right;
	}) || null;
}

function shiftTaskCalendarDates(line, deltaDays, fallbackDate) {
	if (fallbackDate && !["start", "due", "scheduled"].some(function(key) { return readTaskCalendarDate(line,key).date; })) {
		return upsertInlineField(line, "scheduled", fallbackDate);
	}
	var shift = function(raw) {
		var value=moment(raw.slice(0,10),"YYYY-MM-DD",true);
		if (!value.isValid()) throw new Error("Invalid task date: "+raw);
		return value.add(deltaDays,"days").format("YYYY-MM-DD")+raw.slice(10);
	};
	var parsed=noriaBridge.tasks.parseTaskLine(line);
	return noriaBridge.tasks.patchTaskDates(line, parsed.schedules.length && (parsed.start || parsed.due)
		? {start:shift,due:shift} : {start:shift,due:shift,scheduled:shift});
}

function readTaskCalendarDate(line, key) {
	var raw = String(line || "");
	var parsed = noriaBridge.tasks.parseTaskLine(/^[ \t]*[-*+]\s+\[[^\]]\]/.test(raw) ? raw : "- [ ] "+raw);
	return parseDateTimeValue(parsed[key]);
}

function buildTaskTemporalMomentsFromEl(taskEl, fallbackDateStr) {
	var sD = String(taskEl.getAttribute("data-start-date") || "").trim();
	var sT = normalizeTimeStr(taskEl.getAttribute("data-start-time"));
	var dD = String(taskEl.getAttribute("data-due-date") || "").trim();
	var dT = normalizeTimeStr(taskEl.getAttribute("data-due-time"));
	var fb = String(fallbackDateStr || "").trim();
	if (!sD && dD) {
		sD = dD;
		if (!sT) { sT = dT || "09:00"; }
	}
	if (!dD && sD) {
		dD = sD;
		if (!dT) { dT = sT || "10:00"; }
	}
	if (!sD && fb) {
		sD = fb;
		sT = sT || "09:00";
	}
	if (!dD && fb) {
		dD = fb;
		dT = dT || sT || "10:00";
	}
	if (!sD || !dD) { return null; }
	var startM = moment(sD + " " + (sT || "09:00"), "YYYY-MM-DD HH:mm", true);
	var endM = moment(dD + " " + (dT || sT || "10:00"), "YYYY-MM-DD HH:mm", true);
	if (!startM.isValid()) { startM = moment(sD + " 09:00", "YYYY-MM-DD HH:mm", true); }
	if (!endM.isValid()) { endM = moment(dD + " " + (dT || "18:00"), "YYYY-MM-DD HH:mm", true); }
	if (!endM.isValid()) { endM = moment(startM).add(60, "minutes"); }
	if (!endM.isAfter(startM)) { endM = moment(startM).add(60, "minutes"); }
	var raw = decodeURIComponent(taskEl.getAttribute("data-tc-sig") || "");
	var scheduleAttr=taskEl.getAttribute("data-schedule-index");
	var schedule=scheduleAttr!=null && scheduleAttr!=="" ? noriaBridge.tasks.parseTaskLine(/^[ \t]*[-*+]\s+\[[^\]]\]/.test(raw)?raw:"- [ ] "+raw).schedules[Number(scheduleAttr)] : null;
	return { startM: startM, endM: endM,
		hasStart: schedule ? !!schedule.start : !!readTaskCalendarDate(raw, "start").date,
		hasDue: schedule ? !!schedule.end : !!readTaskCalendarDate(raw, "due").date };
}

function clearMonthDropTargetHighlight() {
	if (!rootNode || !rootNode.querySelectorAll) { return; }
	try {
		rootNode.querySelectorAll(".cell.tc-month-drop-target").forEach(function (c) {
			c.classList.remove("tc-month-drop-target");
		});
	} catch (_) {}
}

function calendarMonthDrop(temporal, targetDate, srcDate, edge) {
	var start=temporal.startM.clone(),end=temporal.endM.clone();
	if(edge){
		var value=edge==="start"?start:end;
		value.add(moment(targetDate,"YYYY-MM-DD",true).diff(moment(value.format("YYYY-MM-DD"),"YYYY-MM-DD",true),"days"),"days");
		if (edge === "due" && temporal.hasStart === false) start = end.clone();
		if (edge === "start" && temporal.hasDue === false) end = start.clone();
		if(end.isBefore(start))return null;
		return {start,end,options:{calendarResize:{key:edge,date:targetDate}}};
	}
	var delta=moment(targetDate,"YYYY-MM-DD",true).diff(moment(srcDate,"YYYY-MM-DD",true),"days");
	return {start:start.add(delta,"days"),end:end.add(delta,"days"),options:{calendarDayShift:delta}};
}

function onMonthTaskPointerDown(ev) {
	var taskEl = ev.currentTarget;
	if (ev.button !== 0) { return; }
	if (!rootNode || rootNode.getAttribute("view") !== "month") { return; }
	if (taskEl.closest(".timeLane")) { return; }
	if (plannerChromeInteractionActive) { return; }
	/* 与 onTaskPointerDown 对齐：点在 status-circle 上勿启动月表拖改期，避免 pointerdown 抢占 click/完成切换 */
	if (typeof ev.target.closest === "function" && ev.target.closest(".noria-status-circle,[data-noria-status-circle='1'],.tc-compact-checkbox,[data-tc-compact-checkbox='1']")) { return; }
	var srcCell = taskEl.closest(".cell[data-date]") || getMonthGridCellFromPoint(ev.clientX, ev.clientY);
	if (!srcCell) { return; }
	var srcDate = srcCell.getAttribute("data-date");
	if (!srcDate) { return; }
	var temporal = buildTaskTemporalMomentsFromEl(taskEl, srcDate);
	if (!temporal) { return; }
	ev.preventDefault();
	ev.stopPropagation();
	var ox = ev.clientX;
	var oy = ev.clientY;
	var moved = false;
	var handle=ev.target.closest(".tc-month-date-handle"),edge=handle?handle.getAttribute("data-edge"):"";
	var pointer={clientX:ox,clientY:oy,preventDefault:function(){}};
	var feedback=createCalendarDragFeedback(taskEl,function(){onMove(pointer);});
	var lastDropCell = null;
	plannerChromeInteractionActive = true;
	taskEl.classList.add("dragging");
	try { taskEl.setPointerCapture(ev.pointerId); } catch (_) {}
	var onMove = function (e) {
		e.preventDefault();
		pointer={clientX:e.clientX,clientY:e.clientY,preventDefault:function(){}};
		if (Math.hypot(e.clientX - ox, e.clientY - oy) > 5) { moved = true; }
		var nc = getMonthGridCellFromPoint(e.clientX, e.clientY);
		if(moved){var drop=nc?calendarMonthDrop(temporal,nc.getAttribute("data-date"),srcDate,edge):null;feedback.update(e.clientX,e.clientY,drop?drop.start.format("MM-DD")+" → "+drop.end.format("MM-DD"):tasksCalendarRuntimeLocale()==="zh-CN"?"无效落点，松开取消":"Invalid drop; release to cancel");}
		if (nc !== lastDropCell) {
			clearMonthDropTargetHighlight();
			lastDropCell = nc;
			if (nc && nc !== srcCell) { nc.classList.add("tc-month-drop-target"); }
		}
	};
	var finish = function (pev) {
		feedback.close();calendarDragCancel=null;
		document.removeEventListener("keydown", onKeyDown);
		clearMonthDropTargetHighlight();
		try {
			if (pev && typeof pev.pointerId !== "undefined") {
				taskEl.releasePointerCapture(pev.pointerId);
			}
		} catch (_) {}
		taskEl.classList.remove("dragging");
	};
	var onCancel = function (e) {
		document.removeEventListener("pointermove", onMove);
		document.removeEventListener("pointerup", onUp);
		document.removeEventListener("pointercancel", onCancel);
		finish(e);
		plannerChromeInteractionActive = false;
		flushDeferredHydration(40);
		flushDeferredTaskFreshRefresh(180);
	};
	var onUp = async function (e) {
		document.removeEventListener("pointermove", onMove);
		document.removeEventListener("pointerup", onUp);
		document.removeEventListener("pointercancel", onCancel);
		var targetCell = getMonthGridCellFromPoint(e.clientX, e.clientY);
		var targetDate = targetCell ? targetCell.getAttribute("data-date") : "";
		finish(e);
		if (moved) {
			// The browser's click follows pointer-up, before the save promise resolves.
			taskEl.setAttribute("data-suppress-click", "true");
			setTimeout(function () { taskEl.removeAttribute("data-suppress-click"); }, 250);
		}
		if (!moved || !targetDate || targetDate === srcDate) {
			plannerChromeInteractionActive = false;
			flushDeferredHydration(40);
			flushDeferredTaskFreshRefresh(180);
			return;
		}
		var drop=calendarMonthDrop(temporal,targetDate,srcDate,edge);
		if(!drop){plannerChromeInteractionActive=false;flushDeferredHydration(40);flushDeferredTaskFreshRefresh(180);return;}
		var newStart=drop.start,newEnd=drop.end;
		if (editModeActive) {
			plannerChromeInteractionActive = false;
			stageTaskMove(taskEl, newStart, newEnd, drop.options);
			showBriefNotice(tcRuntimeT("runtime.tasksCalendar.notice.rescheduleStaged"), 1200);
			return;
		}
		try {
			var receipt = await mdTaskAdapter.saveDateTime(taskEl, newStart, newEnd, {
				...drop.options, suppressRefresh: true, silentNotice: true
			});
			showCalendarDragUndo(receipt);
			if (!receipt) showBriefNotice(tcRuntimeT("runtime.tasksCalendar.notice.rescheduled"), 900);
		} catch (err) {
			console.error("[tasksCalendar] month drag save failed", err);
			showDebugNotice(tcRuntimeT("runtime.tasksCalendar.notice.rescheduleFailed", { message: err && err.message ? err.message : err }));
		} finally {
			plannerChromeInteractionActive = false;
			// Consume write notifications and deferred layout in one fresh-data render.
			tcHydrationDeferredByInteraction = false;
			tcDeferredHydrationGrid = null;
			tcRefreshDeferredByInteraction = false;
			scheduleTasksCalendarSoftRefresh(180);
		}
	};
	var onKeyDown = e => { if(e.key === "Escape") {e.preventDefault();e.stopPropagation();onCancel(e);} };
	calendarDragCancel=()=>onCancel({});
	document.addEventListener("keydown", onKeyDown);
	document.addEventListener("pointermove", onMove);
	document.addEventListener("pointerup", onUp);
	document.addEventListener("pointercancel", onCancel);
}

function syncMonthTaskDateHandles(taskEl, position) {
	var raw = decodeURIComponent(taskEl.getAttribute("data-tc-sig") || "");
	var scheduleAttr=taskEl.getAttribute("data-schedule-index");
	var schedule=scheduleAttr!=null && scheduleAttr!=="" ? noriaBridge.tasks.parseTaskLine(/^[ \t]*[-*+]\s+\[[^\]]\]/.test(raw)?raw:"- [ ] "+raw).schedules[Number(scheduleAttr)] : null;
	var doc = taskEl.ownerDocument;
	taskEl.querySelectorAll(".tc-month-date-handle").forEach(el => el.remove());
	["start", "due"].forEach(function (key) {
		var visible = position === "single" || position === (key === "start" ? "start" : "end");
		// Displayed dates can be inferred from scheduled dates; only resize real fields.
		var resizable = !!(visible && (schedule ? (key==="start"?schedule.start:schedule.end) : readTaskCalendarDate(raw, key).date));
		taskEl.classList.toggle("tc-month-resizable-" + key, resizable);
		if (!resizable) return;
		var handle = doc.createElement("span");
		handle.className = "tc-month-date-handle";
		handle.setAttribute("data-edge", key);
		handle.setAttribute("aria-hidden", "true");
		handle.title = tasksCalendarRuntimeLocale() === "zh-CN"
			? (key === "start" ? "调整开始日期" : schedule ? "调整结束日期" : "调整截止日期")
			: (key === "start" ? "Resize start date" : schedule ? "Resize end date" : "Resize due date");
		taskEl.appendChild(handle);
	});
}

function setupMonthTaskDrag() {
	if (!rootNode || rootNode.getAttribute("view") !== "month") { return; }
	var sel = ".cell .cellContent [data-tc-cal-item='1'], .cell .cellContent .tc-cal-item, .tc-month-span-overlay-item";
	rootNode.querySelectorAll(sel).forEach(function (taskEl) {
		if (!taskEl.classList.contains("tc-month-span-overlay-item") && (!taskEl.closest(".cell") || !taskEl.closest(".cellContent"))) { return; }
		if (taskEl.getAttribute("data-month-drag-bound") === "1") { return; }
		taskEl.setAttribute("data-month-drag-bound", "1");
		taskEl.style.touchAction = "none";
		taskEl.setAttribute("draggable", "false");
		try {
			taskEl.addEventListener("dragstart", function (e) { e.preventDefault(); });
		} catch (_) {}
		taskEl.addEventListener("pointerdown", onMonthTaskPointerDown);
		var clickSurface = taskEl.closest("a.internal-link") || taskEl;
		if (clickSurface && !clickSurface.hasAttribute("data-month-drag-click-bound")) {
			clickSurface.setAttribute("data-month-drag-click-bound", "true");
			clickSurface.addEventListener("click", function (e) {
				var t = resolveTaskSuppressionTarget(clickSurface);
				if (t && t.getAttribute("data-suppress-click") === "true") {
					e.preventDefault();
					e.stopPropagation();
				}
			});
		}
	});
}

function scheduleMonthTaskDragBind() {
	if (!rootNode || rootNode.getAttribute("view") !== "month") { return; }
	var run = function () {
		try { setupMonthTaskDrag(); } catch (e0) {
			try { console.warn("[tasksCalendar] setupMonthTaskDrag", e0); } catch (_) {}
		}
	};
	requestAnimationFrame(run);
	setTimeout(run, 0);
	setTimeout(run, 120);
	setTimeout(run, 400);
}

/**
 * 时段条必须挂在 .cellContent > .timeLane（position:relative）下。
 * 若误挂到 .cellContent 根层，absolute+width:100% 的包含块会变成 .grid，出现「横跨整周」。
 */
function tcEnsureTimeLaneHost(targetCell) {
	if (!targetCell || !targetCell.querySelector) { return null; }
	var host = targetCell.querySelector(".cellContent");
	if (!host) { return null; }
	var lane = null;
	try {
		lane = host.querySelector(":scope > .timeLane");
	} catch (_) {
		lane = host.querySelector(".timeLane");
	}
	if (lane) { return lane; }
	var doc = (host.ownerDocument && host.ownerDocument.createElement) ? host.ownerDocument : document;
	try {
		lane = doc.createElement("div");
		lane.className = "timeLane";
		host.appendChild(lane);
	} catch (_) {
		return null;
	}
	return lane;
}

/** 将误挂在 .cellContent 根下的时段条收回 .timeLane，避免 absolute 以 .grid 为参照横跨整周 */
function tcReparentStrayTimeLaneItems() {
	if (!rootNode || !rootNode.querySelectorAll) { return; }
	if (!isTimelineCalendarView() || !rootNode.classList.contains("planner-chrome")) { return; }
	try {
		var cells = rootNode.querySelectorAll(".cell[data-date]");
		for (var ci = 0; ci < cells.length; ci++) {
			var cell = cells[ci];
			var host = cell.querySelector(".cellContent");
			if (!host) { continue; }
			var lane = tcEnsureTimeLaneHost(cell);
			if (!lane) { continue; }
			var sel = ":scope > [data-tc-cal-item='1'][data-slot='range'], :scope > [data-tc-cal-item='1'][data-slot='point'], :scope > .tc-cal-item[data-slot='range'], :scope > .tc-cal-item[data-slot='point']";
			var stray;
			try {
				stray = host.querySelectorAll(sel);
			} catch (_) {
				stray = host.querySelectorAll("[data-tc-cal-item='1'][data-slot='range'], [data-tc-cal-item='1'][data-slot='point'], .tc-cal-item[data-slot='range'], .tc-cal-item[data-slot='point']");
			}
			for (var si = 0; si < stray.length; si++) {
				var el = stray[si];
				if (!el || el.parentElement === lane) { continue; }
				if (el.parentElement !== host) { continue; }
				try { lane.appendChild(el); } catch (_) {}
			}
		}
	} catch (_) {}
}

function setupPlannerChromeDragAndResize() {
	if (!isTimelineCalendarView() || !rootNode.classList.contains("planner-chrome")) { return; }
	/* Bind both timed blocks and waiting rows; normalization retains the listener marker. */
	rootNode.querySelectorAll(".timeLane [data-tc-cal-item='1'], .timeLane .tc-cal-item, .timeLane .task, .tc-planner-waiting-strip .tc-cal-item").forEach((taskEl) => {
		taskEl.style.touchAction = "none";
		if (!taskEl.hasAttribute("data-planner-link-guard")) {
			taskEl.setAttribute("data-planner-link-guard", "true");
			taskEl.setAttribute("draggable", "false");
			taskEl.addEventListener("dragstart", (e) => e.preventDefault());
		}
		taskEl.setAttribute("data-drag-bound", "true");
		if (taskEl.getAttribute("data-planner-pointerdown-bound") !== "1") {
			try {
				taskEl.addEventListener("pointerdown", onTaskPointerDown, { capture: true });
			} catch (_) {
				taskEl.addEventListener("pointerdown", onTaskPointerDown, true);
			}
			taskEl.setAttribute("data-planner-pointerdown-bound", "1");
		}
		var timeHint = taskEl.querySelector(".time");
		if (timeHint && (taskEl.getAttribute("data-slot") === "range" || taskEl.getAttribute("data-slot") === "point")) {
			timeHint.setAttribute(
				"title",
				"右键此处编辑开始/结束；Shift+左键任务条亦可；拖拽移动；上下沿为拉伸把手"
			);
		}
	});
};

function isTimelineTaskElement(taskEl) {
	return isTimelineTaskLike(taskEl);
};

function isTimelineTaggedTask(taskObj) {
	return isTimelineTaskLike(taskObj);
};

async function removeTaskLine(taskEl, options) {
	options = options || {};
	var meta = collectTaskMeta(taskEl);
	var filePath = meta.filePath;
	var lineIndex = meta.lineIndex;
	var rawSig = meta.rawSig;
	var rawText = meta.rawText;
	if (!filePath) { throw new Error("missing task path"); }
	await processTaskMarkdownFile(filePath, function (content) {
		var lines = content.split(/\r?\n/);
		var idx = pickTaskLineIndex(lines, lineIndex, rawText, rawSig, "", "");
		if (idx < 0) { throw new Error("task line not found"); }
		lines.splice(idx, 1);
		return lines.join("\n").replace(/\n{3,}/g, "\n\n");
	});
	try { removeTaskFromRuntimeByMeta(meta); } catch (_) {}
	if (!options.silentNotice) { showDebugNotice(tcRuntimeT("runtime.tasksCalendar.notice.deletedItem")); }
	if (!options.suppressRefresh) { triggerTaskFreshRefresh(); }
};

function patchGlobalTaskCompletionFromSave(meta, completed, savedLine, completionValue, options) {
	options = options || {};
	var row = findTaskRowForSaveMeta(meta || {});
	if (!row) { return; }
	row.completed = !!completed;
	row.checked = !!completed;
	if (completed && !options.skipCompletionField) {
		var completionText = String(completionValue || "").trim();
		var cm = completionText ? moment(completionText, ["YYYY-MM-DD HH:mm", "YYYY-MM-DD"], true) : null;
		if (cm && cm.isValid()) {
			row.completion = cm.format("YYYY-MM-DD");
			row.completionTime = completionText.indexOf(":") >= 0 ? cm.format("HH:mm") : "";
			try { normalizeTaskTemporal(row, "completion", "completionTime"); } catch (_) {}
		} else {
			row.completion = calendarNow().format("YYYY-MM-DD");
			row.completionTime = calendarNow().format("HH:mm");
		}
	} else {
		try {
			delete row.completion;
			delete row.completionTime;
		} catch (_) {
			row.completion = undefined;
			row.completionTime = undefined;
		}
	}
	if (savedLine) {
		row.rawText = String(savedLine || "");
		row.timelineTag = extractTimelineTag(row.rawText);
		row.isTimelineDay = /(^|\s)#tl\/day(?:\s|$)/i.test(row.rawText) || /(^|\s)#timeline\/day(?:\s|$)/i.test(row.rawText);
		row.isTimelineInstant = (!row.isTimelineDay && /(^|\s)#tl\/[^\s#]+/i.test(row.rawText))
			|| /(^|\s)#timeline\/instant(?:\s|$)/i.test(row.rawText);
		var plain = row.rawText
			.replace(/^\s*-\s*\[[^\]]*\]\s*/, "")
			.replace(/\[(?:start|due|scheduled|completion|done|created|cancelled)::\s*[^\]]*\]/ig, " ")
			.replace(/\[(?:priority|repeat|recurrence|every|onCompletion|id|dependsOn)::\s*[^\]]*\]/ig, " ")
			.replace(/\[(?:duration_min|default_tag|default_start|default_due|default_duration_min)::\s*[^\]]*\]/ig, " ")
			.replace(/(^|\s)#[^\s#]+/g, " ")
			.replace(/\s{2,}/g, " ")
			.trim();
		if (plain) { row.text = plain; }
	}
}

async function setTaskCompletionState(taskEl, completed, options) {
	options = options || {};
	var meta = collectTaskMeta(taskEl);
	var filePath = meta.filePath;
	var lineIndex = meta.lineIndex;
	var rawSig = meta.rawSig;
	var rawText = meta.rawText;
	if (!filePath) { throw new Error("missing task path"); }
	var line = "";
	var skipCompletionField = false;
	var completionValue = "";
	await processTaskMarkdownFile(filePath, function (content) {
		var lines = content.split(/\r?\n/);
		var idx = pickTaskLineIndex(lines, lineIndex, rawText, rawSig, "", "");
		if (idx < 0) {
			throw new Error("task line not found (path=" + String(filePath || "") + ", line=" + String(lineIndex || "") + ", sig=" + String(rawSig || "").slice(0, 48) + ")");
		}
		line = String(lines[idx] || "");
		if (!isTaskLine(line)) { throw new Error("not a task line (path=" + String(filePath || "") + ", idx=" + String(idx) + ")"); }
		/* 统一写回：方括号内无论 x/X/✓/空格 一律改为 `x` 或空格，避免变体导致「撤销完成」无效 */
		line = line.replace(/^(\s*-\s*\[)([^\]]*)(\]\s*)/, function (_m, a, _inner, c) {
			return a + (completed ? "x" : " ") + c;
		});
		line = stripInlineField(line, "done");
		line = stripInlineField(line, "completion");
		skipCompletionField = options.skipCompletionField === true || isTimelineTaskLike(taskEl) || isTimelineTaskLike(line) || isTimelineTaskLike(meta.rawText) || isTimelineTaskLike(meta.rawSig);
		if (completed && !skipCompletionField) {
			completionValue = String(options.completionValue || "").trim();
			if (!completionValue) {
				completionValue = calendarNow().format("YYYY-MM-DD HH:mm");
			}
			line = upsertInlineField(line, "completion", completionValue);
		}
		lines[idx] = line;
		return lines.join("\n").replace(/\n{3,}/g, "\n\n");
	});
	try { patchGlobalTaskCompletionFromSave(meta, completed, line, completionValue, { skipCompletionField: skipCompletionField }); } catch (_) {}
	if (!options.silentNotice) { showDebugNotice(completed ? tcRuntimeT("runtime.tasksCalendar.notice.completed") : tcRuntimeT("runtime.tasksCalendar.notice.incomplete")); }
	if (!options.suppressRefresh) { triggerTaskFreshRefresh(); }
}

function getPendingEditCount() {
	return pendingTaskChanges.size;
};

function stageTaskMove(taskEl, newStartMoment, newEndMoment, saveOptions) {
	var key = getTaskIdentityKey(taskEl);
	if (!key) { return; }
	var prev = pendingTaskChanges.get(key) || {};
	pendingTaskChanges.set(key, {
		key,
		taskEl,
		type: prev.type === "delete" ? "delete" : "update",
		newStart: moment(newStartMoment).format("YYYY-MM-DD HH:mm"),
		newEnd: moment(newEndMoment).format("YYYY-MM-DD HH:mm"),
		saveOptions: {...(prev.saveOptions || {}), ...(saveOptions || {})}
	});
	taskEl.classList.add("pending-edit");
};

function toggleTaskPendingDelete(taskEl) {
	var key = getTaskIdentityKey(taskEl);
	if (!key) { return false; }
	var prev = pendingTaskChanges.get(key);
	var willDelete = !(prev && prev.type === "delete");
	if (willDelete) {
		pendingTaskChanges.set(key, { key, taskEl, type: "delete" });
		taskEl.classList.add("pending-delete");
		taskEl.setAttribute("data-delete-label", tcRuntimeT("runtime.tasksCalendar.css.pendingDelete"));
		taskEl.classList.remove("pending-edit");
		return true;
	}
	pendingTaskChanges.delete(key);
	taskEl.classList.remove("pending-delete");
	taskEl.removeAttribute("data-delete-label");
	taskEl.classList.remove("pending-edit");
	return false;
};

function clearPendingTaskChanges() {
	pendingTaskChanges.forEach((item) => {
		if (item?.taskEl) {
			item.taskEl.classList.remove("pending-delete");
			item.taskEl.removeAttribute("data-delete-label");
			item.taskEl.classList.remove("pending-edit");
		}
	});
	pendingTaskChanges.clear();
};

async function applyPendingTaskChanges() {
	var changes = getPendingPatches();
	if (changes.length === 0) {
		showDebugNotice(tcRuntimeT("runtime.tasksCalendar.notice.noPendingEdits"));
		return;
	}
	setTaskStoreEditMode("committing");
	var result = await applyPendingPatches(changes);
	var affectedDates = [];
	for (var ci = 0; ci < changes.length; ci++) {
		var c = changes[ci];
		if (c && c.type === "update") {
			var sU = moment(c.newStart, "YYYY-MM-DD HH:mm", true);
			var eU = moment(c.newEnd, "YYYY-MM-DD HH:mm", true);
			if (sU.isValid()) { affectedDates.push(sU.format("YYYY-MM-DD")); }
			if (eU.isValid()) { affectedDates.push(eU.format("YYYY-MM-DD")); }
		}
		if (c && c.type === "delete" && c.taskEl) {
			var sD = String(c.taskEl.getAttribute("data-start-date") || "");
			var eD = String(c.taskEl.getAttribute("data-due-date") || "");
			if (sD) { affectedDates.push(sD); }
			if (eD) { affectedDates.push(eD); }
		}
	}
	clearPendingTaskChanges();
	pendingDeleteMode = false;
	editModeActive = false;
	setEditModeRenderFreezeUi(false);
	setTaskStoreEditMode("idle");
	forceImmediateTimelineVisibility(affectedDates, "apply-pending");
	showDebugNotice(tcRuntimeT("runtime.tasksCalendar.notice.commitSummary", {
		updated: result.okUpdate,
		deleted: result.okDelete,
		failedText: result.failCount > 0 ? tcRuntimeT("runtime.tasksCalendar.notice.commitFailedPart", { count: result.failCount }) : ""
	}));
};

async function applyPendingPatches(changes) {
	var sourceKey=function(op) { var meta=collectTaskMeta(op.taskEl);return meta.filePath+"\n"+meta.rawSig; };
	var deleteBySource=new Map();
	changes.filter(x=>x.type==="delete").forEach(function(op) { deleteBySource.set(sourceKey(op),op); });
	var deleteOps=Array.from(deleteBySource.values());
	var updatesBySource=new Map();
	changes.filter(x=>x.type==="update").forEach(function(op) {
		var key=sourceKey(op);if(deleteBySource.has(key))return;
		if(!updatesBySource.has(key))updatesBySource.set(key,[]);updatesBySource.get(key).push(op);
	});
	var updateGroups=Array.from(updatesBySource.values());
	var okDelete = 0;
	var okUpdate = 0;
	var failCount = 0;
	for (var i=0; i<deleteOps.length; i++) {
		try {
			await mdTaskAdapter.removeTask(deleteOps[i].taskEl, { suppressRefresh: true, silentNotice: true });
			okDelete++;
		} catch (err) {
			console.error("[tasksCalendar] delete pending failed:", err);
			failCount++;
		}
	}
	for (var j=0; j<updateGroups.length; j++) {
		var group=updateGroups[j];
		try {
			var moves=group.map(function(op) {
				var start=moment(op.newStart,"YYYY-MM-DD HH:mm",true),end=moment(op.newEnd,"YYYY-MM-DD HH:mm",true),meta=collectTaskMeta(op.taskEl);
				if(!start.isValid()||!end.isValid()||!end.isAfter(start))throw Error("invalid-schedule");
				return {index:meta.scheduleIndex,start:start,end:end,options:op.saveOptions||{}};
			});
			if(group.length>1&&!moves.every(move=>Number.isInteger(move.index)))throw Error("conflicting-schedule-batch");
			await mdTaskAdapter.saveDateTime(group[0].taskEl,moves[0].start,moves[0].end,{
				...group[0].saveOptions,...(group.length>1?{scheduleMoves:moves}:{}),suppressRefresh:true,silentNotice:true
			});
			okUpdate+=group.length;
		} catch (err2) {
			console.error("[tasksCalendar] update pending failed:", err2);
			failCount+=group.length;
		}
	}
	return { okDelete, okUpdate, failCount };
}

function bindWeekCellInlineActions() {
	if (!isTimelineCalendarView() || !rootNode.classList.contains("planner-chrome")) { return; }
	rootNode.querySelectorAll(".cell:not([data-inline-bound='true'])").forEach((cell) => {
		cell.setAttribute("data-inline-bound", "true");
		cell.addEventListener("click", async (ev) => {
			var targetTask = ev.target.closest("[data-tc-cal-item='1'], .tc-cal-item, .task");
			if (editModeActive && pendingDeleteMode && targetTask) {
				ev.preventDefault();
				ev.stopPropagation();
				return;
			}
		});
	});
};

function onTaskPointerDown(ev) {
	var taskEl = ev.currentTarget;
	if (plannerChromeInteractionActive) { return; }
	if (ev.button !== 0) { return; }
	if (!isTimelineCalendarView() || !rootNode.classList.contains("planner-chrome")) { return; }
	// Dismiss only this task's readout before the drag preview takes over.
	taskEl.ownerDocument.querySelectorAll(".tooltip").forEach(function (tooltip) {
		if (tooltip.textContent === taskEl.getAttribute("aria-label")) { tooltip.remove(); }
	});
	var fromWaiting = taskEl.getAttribute("data-slot") === "waiting" || taskEl.getAttribute("data-lane") === "waiting";
	var saveOptions = fromWaiting ? (taskEl.hasAttribute("data-schedule-index") ? {scheduleTimed:true} : {addSchedule:true}) : {};
	if (editModeActive && pendingDeleteMode) {
		ev.preventDefault();
		ev.stopPropagation();
		if (!isTimelineTaskElement(taskEl)) {
			showDebugNotice(tcRuntimeT("runtime.tasksCalendar.notice.timelineDeleteOnly"));
			return;
		}
		var marked = toggleTaskPendingDelete(taskEl);
		showDebugNotice(marked ? tcRuntimeT("runtime.tasksCalendar.notice.deleteMarked") : tcRuntimeT("runtime.tasksCalendar.notice.deleteUnmarked"));
		setQuickTimelinePanel();
		taskEl.setAttribute("data-suppress-click", "true");
		setTimeout(() => taskEl.removeAttribute("data-suppress-click"), 200);
		return;
	}
	/* dayBucket（data-lane=day）：无明确时段列表区，不参与 time-lane 拖拽；timeLane + data-lane=time 走下方逻辑（与 §2.4 P2 一致） */
	if (!fromWaiting && taskEl.getAttribute("data-lane") == "day") { return; }
	/* status-circle：capture 阶段若不与 internal-link 同级短路，会在子元素 button 之前启动拖拽，吞掉点击/切换完成 */
	if (typeof ev.target.closest === "function" && ev.target.closest(".noria-status-circle,[data-noria-status-circle='1'],.tc-compact-checkbox,[data-tc-compact-checkbox='1']")) { return; }
	/* 标题链接触发导航，勿抢 pointer 启动拖拽 */
	if (!fromWaiting && typeof ev.target.closest === "function" && ev.target.closest("a.internal-link")) { return; }
	ev.preventDefault();
	ev.stopPropagation();
	/* 上下窄边缘用于拉伸，中央内容区域用于移动。 */
	var mode = "move";
	var handle = ev.target.closest(".resize-handle");
	if (handle && handle.classList.contains("top")) { mode = "resize-start"; }
	else if (handle && handle.classList.contains("bottom")) { mode = "resize-end"; }
	var srcCell = taskEl.closest(".cell");
	if (!srcCell) { return; }
	var srcDate = srcCell.getAttribute("data-date");
	var dayStart = getPlannerChromeTimelineStartMin();
	var dayEnd = getPlannerChromeTimelineEndMin();
	var startDate = fromWaiting ? srcDate : taskEl.getAttribute("data-start-date") || srcDate;
	var startTime = fromWaiting ? "09:00" : normalizeTimeStr(taskEl.getAttribute("data-start-time")) || normalizeTimeStr(taskEl.getAttribute("data-time")) || "09:00";
	var dueDate = taskEl.getAttribute("data-due-date") || startDate;
	var dueTime = fromWaiting ? "" : normalizeTimeStr(taskEl.getAttribute("data-due-time"));
	var startMoment = moment(startDate+" "+startTime, "YYYY-MM-DD HH:mm", true);
	var endMoment = dueTime ? moment(dueDate+" "+dueTime, "YYYY-MM-DD HH:mm", true) : moment(startMoment).add(60, "minutes");
	if (!startMoment.isValid()) { startMoment = moment(srcDate+" 09:00", "YYYY-MM-DD HH:mm", true); }
	if (!endMoment.isValid() || !endMoment.isAfter(startMoment)) { endMoment = moment(startMoment).add(60, "minutes"); }
	var durationMins = endMoment.diff(startMoment, "minutes");
	var initialLane = tcEnsureTimeLaneHost(srcCell), initialRect = initialLane.getBoundingClientRect();
	// The visible segment may belong to a later day than the task start.
	var grabbedMoment = toDayMoment(srcDate, dayStart + ((ev.clientY - initialRect.top) / initialRect.height) * (dayEnd-dayStart));
	var grabOffset = fromWaiting ? 0 : grabbedMoment.diff(startMoment, "minutes", true);
	var original = { parent: taskEl.parentElement, top: taskEl.style.top, height: taskEl.style.height, attrs: {} };
	["data-slot","data-lane","data-start-min","data-end-min","data-compact"].forEach(name=>original.attrs[name]=taskEl.getAttribute(name));
	var restorePosition = function () {
		if (taskEl.parentElement !== original.parent) original.parent.appendChild(taskEl);
		taskEl.style.top=original.top; taskEl.style.height=original.height;
		Object.keys(original.attrs).forEach(name=>original.attrs[name]==null?taskEl.removeAttribute(name):taskEl.setAttribute(name,original.attrs[name]));
		if (cachedTimeNode) cachedTimeNode.innerHTML=original.timeHtml;
	};
	var cachedTimeNode = taskEl.querySelector(".time");
	var cachedStartLine = cachedTimeNode ? cachedTimeNode.querySelector(".tline.start") : null;
	var cachedEndLine = cachedTimeNode ? cachedTimeNode.querySelector(".tline.end") : null;
	original.timeHtml = cachedTimeNode ? cachedTimeNode.innerHTML : "";
	var pointerState = {
		taskEl, mode, srcCell, srcDate, currentCell: srcCell,
		startMoment, endMoment, durationMins,
		startTs: +startMoment,
		endTs: +endMoment,
		dayStart, dayEnd,
		moved: false,
		ox: ev.clientX,
		oy: ev.clientY,
		moveRaf: null,
		lastPX: ev.clientX,
		lastPY: ev.clientY,
		shiftSnap: !!ev.shiftKey,
		timeNode: cachedTimeNode,
		startLineNode: cachedStartLine,
		endLineNode: cachedEndLine,
		lastRenderStartMin: null,
		lastRenderEndMin: null,
		lastTargetCell: null,
		lastLaneContent: null,
		lastLaneRect: null
	};
	var feedback=createCalendarDragFeedback(taskEl,function(){if(pointerState.moved)flushPlannerChromeDragMove();});
	plannerChromeInteractionActive = true;
	taskEl.classList.add("dragging");
	try { taskEl.setPointerCapture(ev.pointerId); } catch (_) {}

	var flushPlannerChromeDragMove = function () {
		pointerState.moveRaf = null;
		var clientX = pointerState.lastPX;
		var clientY = pointerState.lastPY;
		var targetCell = getCellFromPoint(clientX, clientY);
		if (!targetCell) { feedback.update(clientX,clientY,tasksCalendarRuntimeLocale()==="zh-CN"?"松开取消":"Release to cancel");return; }
		var laneContent = pointerState.lastTargetCell === targetCell
			? pointerState.lastLaneContent
			: tcEnsureTimeLaneHost(targetCell);
		if (!laneContent) { return; }
		var cRect = laneContent.getBoundingClientRect();
		if (fromWaiting && (clientY < cRect.top || clientY >= cRect.top+cRect.height)) { feedback.update(clientX,clientY,tasksCalendarRuntimeLocale()==="zh-CN"?"松开取消":"Release to cancel");return; }
		var y = Math.max(0, Math.min(clientY - cRect.top, cRect.height));
		var snap = pointerState.shiftSnap ? 5 : 15;
		var rawMinute = pointerState.dayStart + (y / cRect.height) * (pointerState.dayEnd - pointerState.dayStart);
		var minute = roundMinutesToStep(rawMinute - (pointerState.mode === "move" ? grabOffset : 0), snap);
		if (pointerState.mode !== "move") minute = Math.max(pointerState.dayStart, Math.min(minute, pointerState.dayEnd - 1));
		var targetDate = targetCell.getAttribute("data-date") || pointerState.srcDate;
		var newStart = moment(pointerState.startMoment);
		var newEnd = moment(pointerState.endMoment);
		if (pointerState.mode == "move") {
			newStart = toDayMoment(targetDate, minute);
			newEnd = moment(newStart).add(pointerState.durationMins, "minutes");
		} else if (pointerState.mode == "resize-start") {
			newStart = toDayMoment(targetDate, minute);
			if (!newStart.isBefore(newEnd)) { newStart = moment(newEnd).subtract(snap, "minutes"); }
		} else if (pointerState.mode == "resize-end") {
			newEnd = toDayMoment(targetDate, minute);
			if (!newEnd.isAfter(newStart)) { newEnd = moment(newStart).add(snap, "minutes"); }
		}
		feedback.update(clientX,clientY,newStart.format("MM-DD HH:mm")+" → "+newEnd.format(newStart.format("YYYY-MM-DD")===newEnd.format("YYYY-MM-DD")?"HH:mm":"MM-DD HH:mm"));
		pointerState.previewStart = newStart;
		pointerState.previewEnd = newEnd;
		pointerState.currentCell = targetCell;
		pointerState.lastTargetCell = targetCell;
		pointerState.lastLaneContent = laneContent;
		pointerState.lastLaneRect = cRect;
		var timeOrDayChanged = (+newStart !== pointerState.startTs) || (+newEnd !== pointerState.endTs) || targetDate !== pointerState.srcDate;
		var draggedPx = Math.hypot(clientX - pointerState.ox, clientY - pointerState.oy);
		if (timeOrDayChanged || draggedPx > 6) {
			pointerState.moved = true;
		}
		var startMinute = newStart.format("YYYY-MM-DD") < targetDate ? pointerState.dayStart : newStart.hours()*60 + newStart.minutes();
		var localStart = Math.max(pointerState.dayStart, Math.min(startMinute, pointerState.dayEnd-1));
		var endMinute = newEnd.format("YYYY-MM-DD") > targetDate ? pointerState.dayEnd : newEnd.hours()*60 + newEnd.minutes();
		var localEnd = Math.max(localStart + 1, Math.min(endMinute, pointerState.dayEnd));
		pointerState.previewLocalStart = localStart;
		pointerState.previewLocalEnd = localEnd;
		var spanDrag = Math.max(1, pointerState.dayEnd - pointerState.dayStart);
		var visDrag = computePlannerChromeExpandedSlotBounds(pointerState.dayStart, pointerState.dayEnd, localStart, localEnd);
		var top = ((visDrag.s - pointerState.dayStart) / spanDrag) * 100;
		var height = ((visDrag.e - visDrag.s) / spanDrag) * 100;
		var minPctDrag = (PLANNER_CHROME_MIN_VISUAL_RANGE_MIN / spanDrag) * 100;
		var heightPct = Math.max(height, minPctDrag, 2.5);
		if (taskEl.parentElement !== laneContent) { laneContent.appendChild(taskEl); }
		taskEl.style.top = top.toFixed(3)+"%";
		taskEl.style.height = heightPct.toFixed(3)+"%";
		taskEl.setAttribute("data-slot", "range");
		taskEl.setAttribute("data-lane", "time");
		taskEl.setAttribute("data-start-min", String(localStart));
		taskEl.setAttribute("data-end-min", String(localEnd));
		var compact = (localEnd - localStart) <= PLANNER_CHROME_COMPACT_MAX_MIN;
		taskEl.setAttribute("data-compact", compact ? "true" : "false");
		var timeNode = pointerState.timeNode;
		if (timeNode && (pointerState.lastRenderStartMin !== localStart || pointerState.lastRenderEndMin !== localEnd)) {
			var startLabel = minutesToTimeStr(localStart);
			var endLabel = minutesToTimeStr(localEnd);
			var startLine = pointerState.startLineNode;
			var endLine = pointerState.endLineNode;
			if (startLine || endLine) {
				if (startLine) { startLine.textContent = startLabel; }
				if (endLine) { endLine.textContent = compact ? "" : endLabel; }
			} else {
				timeNode.textContent = startLabel;
			}
			pointerState.lastRenderStartMin = localStart;
			pointerState.lastRenderEndMin = localEnd;
		}
	};

	var onMove = (e) => {
		e.preventDefault();
		if (!pointerState.moved && Math.hypot(e.clientX-pointerState.ox,e.clientY-pointerState.oy)<=6) return;
		pointerState.moved=true;
		pointerState.shiftSnap = !!e.shiftKey;
		pointerState.lastPX = e.clientX;
		pointerState.lastPY = e.clientY;
		if (pointerState.moveRaf == null) {
			pointerState.moveRaf = requestAnimationFrame(flushPlannerChromeDragMove);
		}
	};

	var onUp = async (e) => {
		var dropCell=getCellFromPoint(e.clientX,e.clientY);
		if (!dropCell) { onCancel(e); return; }
		if (fromWaiting) {
			var dropRect=tcEnsureTimeLaneHost(dropCell).getBoundingClientRect();
			if(e.clientY<dropRect.top || e.clientY>=dropRect.top+dropRect.height) { onCancel(e);return; }
		}
		pointerState.lastPX=e.clientX; pointerState.lastPY=e.clientY;
		if (pointerState.moveRaf != null) {
			cancelAnimationFrame(pointerState.moveRaf);
			pointerState.moveRaf = null;
			flushPlannerChromeDragMove();
		}
		feedback.close();calendarDragCancel=null;
		document.removeEventListener("keydown", onKeyDown);
		try { taskEl.releasePointerCapture(e.pointerId); } catch (_) {}
		taskEl.classList.remove("dragging");
		document.removeEventListener("pointermove", onMove);
		document.removeEventListener("pointerup", onUp);
		document.removeEventListener("pointercancel", onCancel);
		/* 拖动后即将写盘时，勿先 hydrate/refresh：否则 40ms 内用旧任务模型重灌 DOM，出现「松手又回到原位」 */
		var deferFlushUntilAfterSave = pointerState.moved && !editModeActive;
		if (!deferFlushUntilAfterSave) {
			plannerChromeInteractionActive = false;
			flushDeferredHydration(40);
			flushDeferredTaskFreshRefresh(180);
		}
		var srcLane = pointerState.srcCell ? tcEnsureTimeLaneHost(pointerState.srcCell) : null;
		var currentLane = pointerState.currentCell ? tcEnsureTimeLaneHost(pointerState.currentCell) : null;
		var affectedLanes = [srcLane, currentLane].filter(Boolean);
		var finalStart = pointerState.previewStart || pointerState.startMoment;
		var finalEnd = pointerState.previewEnd || pointerState.endMoment;
		if (currentLane && taskEl.parentElement !== currentLane) { currentLane.appendChild(taskEl); }
		if (Number.isFinite(pointerState.previewLocalStart) && Number.isFinite(pointerState.previewLocalEnd)) {
			var spanUp = Math.max(1, pointerState.dayEnd - pointerState.dayStart);
			var visUp = computePlannerChromeExpandedSlotBounds(pointerState.dayStart, pointerState.dayEnd, pointerState.previewLocalStart, pointerState.previewLocalEnd);
			var topPct = ((visUp.s - pointerState.dayStart) / spanUp) * 100;
			var hPct = ((visUp.e - visUp.s) / spanUp) * 100;
			var minPctUp = (PLANNER_CHROME_MIN_VISUAL_RANGE_MIN / spanUp) * 100;
			taskEl.style.top = topPct.toFixed(3) + "%";
			taskEl.style.height = Math.max(hPct, minPctUp, 2.5).toFixed(3) + "%";
		}
		if (pointerState.moved) {
			taskEl.setAttribute("data-suppress-click", "true");
			setTimeout(() => taskEl.removeAttribute("data-suppress-click"), 250);
		}
		if (!pointerState.moved || (!fromWaiting && +finalStart === pointerState.startTs && +finalEnd === pointerState.endTs)) {
			plannerChromeInteractionActive = false;
			flushDeferredHydration(40);
			flushDeferredTaskFreshRefresh(180);
			restorePosition();
			schedulePlannerChromeOverlapLayout(affectedLanes);
			return;
		}
		if (editModeActive) {
			stageTaskMove(taskEl, finalStart, finalEnd, saveOptions);
			schedulePlannerChromeOverlapLayout(affectedLanes);
			setQuickTimelinePanel();
			showDebugNotice(tcRuntimeT("runtime.tasksCalendar.notice.dragStaged"));
			return;
		}
		try {
			var receipt=await mdTaskAdapter.saveDateTime(taskEl, finalStart, finalEnd, { ...saveOptions, suppressRefresh: true, silentNotice: true });
			showCalendarDragUndo(receipt);

		} catch (err) {
			restorePosition();
			schedulePlannerChromeOverlapLayout(affectedLanes);
			console.error("[tasksCalendar] save failed:", err);
			showDebugNotice(tcRuntimeT("runtime.tasksCalendar.notice.taskSaveFailed", { message: err?.message || err }));
		} finally {
			plannerChromeInteractionActive = false;
			// The fresh pass consumes deferred hydration too; never hydrate stale data first.
			tcHydrationDeferredByInteraction = false;
			tcDeferredHydrationGrid = null;
			tcRefreshDeferredByInteraction = false;
			schedulePlannerChromeWeekLanesFinalize(true);
			scheduleTasksCalendarSoftRefresh(180);
		}
	};

	var onCancel = (e) => {
		if (pointerState.moveRaf != null) {
			cancelAnimationFrame(pointerState.moveRaf);
			pointerState.moveRaf = null;
		}
		feedback.close();calendarDragCancel=null;
		document.removeEventListener("keydown", onKeyDown);
		try { taskEl.releasePointerCapture(e.pointerId); } catch (_) {}
		taskEl.classList.remove("dragging");
		document.removeEventListener("pointermove", onMove);
		document.removeEventListener("pointerup", onUp);
		document.removeEventListener("pointercancel", onCancel);
		restorePosition();
		plannerChromeInteractionActive = false;
		flushDeferredHydration(40);
		flushDeferredTaskFreshRefresh(220);
		var srcLane = pointerState.srcCell ? tcEnsureTimeLaneHost(pointerState.srcCell) : null;
		var currentLane = pointerState.currentCell ? tcEnsureTimeLaneHost(pointerState.currentCell) : null;
		schedulePlannerChromeOverlapLayout([srcLane, currentLane].filter(Boolean));
	};

	var onKeyDown = e => { if(e.key === "Escape") {e.preventDefault();e.stopPropagation();onCancel(e);} };
	calendarDragCancel=()=>onCancel({});
	document.addEventListener("keydown", onKeyDown);
	document.addEventListener("pointermove", onMove);
	document.addEventListener("pointerup", onUp);
	document.addEventListener("pointercancel", onCancel);
	var clickSurface = taskEl.closest("a.internal-link") || taskEl;
	if (clickSurface && !clickSurface.hasAttribute("data-drag-click-bound")) {
		clickSurface.setAttribute("data-drag-click-bound", "true");
		clickSurface.addEventListener("click", (e) => {
			var t = resolveTaskSuppressionTarget(clickSurface);
			if (t && t.getAttribute("data-suppress-click") === "true") {
				e.preventDefault();
				e.stopPropagation();
			}
		});
	}
};

function getMetaFromNote(task, metaName, notePages) {
	try {
		if (!task) return "";
		var p = "";
		if (task.link && task.link.path) p = String(task.link.path).replace(/\\/g, "/");
		else if (task.path) p = String(task.path).replace(/\\/g, "/");
		if (!p) return "";
		// metadata：用 ctx.page(路径) 取单页 frontmatter，避免 ctx.pages 返回结构上 [meta][0] 对 undefined 取址崩溃
		if (typeof ctx.page !== "function") return "";
		var page = notePages && notePages.has(p) ? notePages.get(p) : ctx.page(p);
		if (notePages) notePages.set(p,page);
		if (!page) return "";
		var v = page[metaName];
		if (v === undefined || v === null) return "";
		if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
		if (typeof v.toArray === "function") {
			var arr = v.toArray();
			return arr && arr.length && arr[0] != null ? arr[0] : "";
		}
		if (Array.isArray(v)) return v.length && v[0] != null ? v[0] : "";
		return "";
	} catch (_) {
		return "";
	}
}

function transColor(color, percent) {
	var c = normalizeHexColor(String(color || ""));
	if (!c) c = "#7D7D7D";
	var num = parseInt(c.slice(1), 16);
	if (!Number.isFinite(num)) num = 0x7d7d7d;
	var amt = Math.round(2.55 * percent);
	var R = (num >> 16) + amt;
	var B = (num >> 8 & 0x00ff) + amt;
	var G = (num & 0x0000ff) + amt;
	function clampCh(v) {
		if (!Number.isFinite(v)) return 255;
		if (v < 1) return 0;
		if (v > 255) return 255;
		return v;
	}
	R = clampCh(R);
	B = clampCh(B);
	G = clampCh(G);
	return "#" + (0x1000000 + R * 0x10000 + B * 0x100 + G).toString(16).slice(1);
}

function buildDailyNotePath(dateStr) {
	var m = moment(dateStr, "YYYY-MM-DD", true);
	if (!m.isValid()) return dateStr;
	var noteName = m.format(dailyNoteFormat || "YYYY-MM-DD") + ".md";
	if (dailyNoteFolder) {
		return String(dailyNoteFolder).replace(/[\\]+/g, "/").replace(/\/$/, "") + "/" + noteName;
	}
	return getConfiguredDiaryRoot() + "/" + m.format("YYYY") + "/" + noteName;
};

function getConfiguredDiaryRoot() {
	var raw = "";
	try {
		raw = noriaBridge && noriaBridge.paths ? noriaBridge.paths.diaryRoot : "";
	} catch (_) {
		raw = "";
	}
	try {
		if (!raw && noriaBridge && noriaBridge.settings && noriaBridge.settings.managedPaths) {
			raw = noriaBridge.settings.managedPaths.diaryRoot;
		}
	} catch (_) {}
	var normalized = normalizeVaultRelPath(raw || "06_Diary").replace(/\/+$/, "");
	return normalized || "06_Diary";
}

/** 与 `weeklyOtherTasks` 一致：`<Diary 根目录>/<isoWeekYear>/<isoWeekYear>-Www.md`（ISO 周序号两位） */
function buildWeeklyNotePath(dateStr) {
	var m = moment(dateStr, "YYYY-MM-DD", true);
	if (!m.isValid()) return dateStr;
	var isoY = m.isoWeekYear();
	var isoW = m.isoWeek();
	var noteName = String(isoY) + "-W" + String(isoW).padStart(2, "0") + ".md";
	if (dailyNoteFolder) {
		return String(dailyNoteFolder).replace(/[\\]+/g, "/").replace(/\/$/, "") + "/" + noteName;
	}
	return getConfiguredDiaryRoot() + "/" + isoY + "/" + noteName;
}

/** 与 `monthlyOtherTasks` 一致：`<Diary 根目录>/<YYYY>/<YYYY-MM>.md` */
function buildMonthlyNotePath(dateStr) {
	var m = moment(dateStr, "YYYY-MM-DD", true);
	if (!m.isValid()) return dateStr;
	var y = m.format("YYYY");
	var ym = m.format("YYYY-MM");
	var noteName = ym + ".md";
	if (dailyNoteFolder) {
		return String(dailyNoteFolder).replace(/[\\]+/g, "/").replace(/\/$/, "") + "/" + noteName;
	}
	return getConfiguredDiaryRoot() + "/" + y + "/" + noteName;
}

/** 开始日 00:00 至结束日 00:00 的日历日差（同日为 0，次日为 1） */
function calendarDaySpanBetweenStartDays(startM, endM) {
	var a = moment(startM).startOf("day");
	var b = moment(endM).startOf("day");
	if (!a.isValid() || !b.isValid()) return 0;
	return Math.max(0, b.diff(a, "days"));
}

/**
 * 新建任务写入位置：按 start/due 跨度路由（与库内周记、月记章节标题对齐）。
 * - 跨度 ≤1 日：当日日记 `### 今日任务`
 * - 2–7 日：开始日所在 ISO 周记 `### 本周任务清单（可执行）`
 * - ≥8 日且 <30 日：开始日所在自然月月记 `### 本月任务清单（按优先级）`
 * - ≥30 日：同上本月记（长周期统一进月规划）
 */
function resolveNewTaskAppendTarget(startMoment, endMoment) {
	var start = moment(startMoment).startOf("day");
	var end = moment(endMoment).startOf("day");
	if (!start.isValid()) start = calendarNow().startOf("day");
	if (!end.isValid()) end = start.clone();
	var d = calendarDaySpanBetweenStartDays(start, end);
	if (d <= 1) {
		return {
			filePath: buildDailyNotePath(start.format("YYYY-MM-DD")),
			sectionHeading: "### 今日任务"
		};
	}
	if (d <= 7) {
		return {
			filePath: buildWeeklyNotePath(start.format("YYYY-MM-DD")),
			sectionHeading: "### 本周任务清单（可执行）"
		};
	}
	if (d < 30) {
		return {
			filePath: buildMonthlyNotePath(start.format("YYYY-MM-DD")),
			sectionHeading: "### 本月任务清单（按优先级）"
		};
	}
	return {
		filePath: buildMonthlyNotePath(start.format("YYYY-MM-DD")),
		sectionHeading: "### 本月任务清单（按优先级）"
	};
}

/** 成功提示用：简述新建任务写入的周期性笔记（日记 / 周记 / 月记 + 文件名） */
function describePeriodicDestForNotice(filePath) {
	var p = String(filePath || "").replace(/\\/g, "/").trim();
	if (!p) {
		return "笔记";
	}
	var name = p.split("/").pop() || p;
	if (/^\d{4}-W\d{1,2}\.md$/i.test(name)) {
		return "周记 " + name.replace(/\.md$/i, "");
	}
	if (/^\d{4}-\d{2}\.md$/.test(name)) {
		return "月记 " + name.replace(/\.md$/i, "");
	}
	if (/^\d{4}-\d{2}-\d{2}\.md$/.test(name)) {
		return "日记 " + name.replace(/\.md$/i, "");
	}
	return name;
}

function inferTemplateByPeriodicNotePath(notePath) {
	var p = String(notePath || "").replace(/\\/g, "/");
	var name = p.split("/").pop() || "";
	if (/^\d{4}-W\d{1,2}\.md$/i.test(name)) {
		return bridge.paths?.weeklyTemplatePath || "02_Areas/知识库管理/Obsidian/Templates/Weekly Template.md";
	}
	if (/^\d{4}-\d{2}\.md$/.test(name)) {
		return bridge.paths?.monthlyTemplatePath || "02_Areas/知识库管理/Obsidian/Templates/Monthly Template.md";
	}
	if (/^\d{4}\.md$/.test(name)) {
		return bridge.paths?.yearlyTemplatePath || "02_Areas/知识库管理/Obsidian/Templates/Yearly Template.md";
	}
	if (/^\d{4}-\d{2}-\d{2}\.md$/.test(name)) {
		return bridge.paths?.dailyTemplatePath || "02_Areas/知识库管理/Obsidian/Templates/Daily Template.md";
	}
	return "";
}
async function ensurePeriodicNoteFromTemplate(notePath) {
	var normalized = String(notePath || "").replace(/\\/g, "/").replace(/^\/+/, "");
	if (!normalized) { return; }
	if (app.vault.getAbstractFileByPath(normalized)) { return; }
	var io = await ensureTimelineIoAdapterLoaded();
	if (!io || typeof io.ensureParentFolder !== "function") {
		throw new Error("timeline io adapter unavailable");
	}
	await io.ensureParentFolder(app, normalized);
	var templatePath = inferTemplateByPeriodicNotePath(normalized);
	var content = "";
	if (templatePath) {
		try {
			var tplFile = app.vault.getAbstractFileByPath(templatePath);
			if (tplFile) {
				content = String(await app.vault.cachedRead(tplFile) || "");
			}
		} catch (_) {
			content = "";
		}
	}
	if (!content) {
		content = "# " + (normalized.split("/").pop() || "新建笔记").replace(/\.md$/i, "") + "\n\n";
	}
	await app.vault.create(normalized, content);
}

function sortTasksByYmdField(taskArr, fieldName) {
	return taskArr.slice().sort(function (a, b) {
		var da = coerceTemporalToYmd(a[fieldName]);
		var db = coerceTemporalToYmd(b[fieldName]);
		if (da === db) return 0;
		return da < db ? -1 : 1;
	});
}

function getTasks(date) {
	var tasks = getCalendarTaskEntries();
	var isMonthView = rootNode && rootNode.getAttribute("view") == "month";
	function dedupByTaskKey(list) {
		var out = [];
		var seen = new Set();
		for (var i = 0; i < list.length; i++) {
			var item = list[i];
			var key = getTaskKey(item);
			if (seen.has(key)) { continue; }
			seen.add(key);
			out.push(item);
		}
		return out;
	}
	function includeInCurrentView(taskObj) {
		if (taskObj.calendarDeadlineMerged && !taskObj.completed && taskDateSameDay(taskObj.due,date)) return false;
		if (!isMonthView) { return true; }
		return !isTimelineTaggedTask(taskObj);
	}
	var doneSameDay = sortTasksByYmdField(tasks.filter(t=>includeInCurrentView(t) && t.completed === true && (t.calendarSchedule
		? (t.scheduled ? taskDateSameDay(t.scheduled,date) : !taskDateAfterDay(t.start,date) && !taskDateBeforeDay(t.due,date))
		: t.completion && taskDateSameDay(t.completion, date))), "completion");
	doneWithoutCompletionDate = sortTasksByYmdField(tasks.filter(t=>includeInCurrentView(t) && !t.calendarSchedule && t.completed === true && !t.completion && t.due && taskDateSameDay(t.due, date)), "due");
	var doneSpanInMonth = [];
	if (isMonthView) {
		doneSpanInMonth = tasks.filter(function (t) {
			if (!includeInCurrentView(t) || t.completed !== true) { return false; }
			var sy = coerceTemporalToYmd(t.start) || "";
			var ey = coerceTemporalToYmd(t.due) || "";
			if (!sy || !ey || sy === ey) { return false; }
			return !taskDateAfterDay(t.start, date) && !taskDateBeforeDay(t.due, date);
		});
	}
	var openSpanInMonth = [];
	if (isMonthView) {
		openSpanInMonth = tasks.filter(function (t) {
			if (!includeInCurrentView(t) || !taskIsOpenForCalendar(t)) { return false; }
			var sy = coerceTemporalToYmd(t.start) || "";
			var ey = coerceTemporalToYmd(t.due) || "";
			if (!sy || !ey || sy === ey) { return false; }
			if (taskDateSameDay(t.start, date)) { return false; }
			return !taskDateAfterDay(t.start, date) && !taskDateBeforeDay(t.due, date);
		});
	}
	var doneMerged = doneSameDay.concat(doneWithoutCompletionDate).concat(doneSpanInMonth);
	done = dedupByTaskKey(doneMerged);
	done = sortTasksByYmdField(done, "due");
	due = sortTasksByYmdField(dedupByTaskKey(
		sortTasksByYmdField(tasks.filter(t=>includeInCurrentView(t) && taskIsOpenForCalendar(t) && !t.recurrence && t.due && taskDateSameDay(t.due, date)), "due")
			.concat(openSpanInMonth)
	), "due");
	recurrence = sortTasksByYmdField(tasks.filter(t=>includeInCurrentView(t) && taskIsOpenForCalendar(t) && t.recurrence && t.due && taskDateSameDay(t.due, date)), "due");
	overdue = sortTasksByYmdField(tasks
		.filter(t=>includeInCurrentView(t) && !t.calendarSchedule && taskIsOpenForCalendar(t) && t.due && taskDateBeforeDay(t.due, date))
		.filter(t => !isTimelineTaggedTask(t)), "due");
	start = sortTasksByYmdField(tasks.filter(t=>includeInCurrentView(t) && taskIsOpenForCalendar(t) && t.start && taskDateSameDay(t.start, date)), "start");
	scheduled = sortTasksByYmdField(tasks.filter(t=>includeInCurrentView(t) && taskIsOpenForCalendar(t) && t.scheduled && taskDateSameDay(t.scheduled, date)), "scheduled");
	process = tasks.filter(t=>includeInCurrentView(t) && taskIsOpenForCalendar(t) && t.due && t.start && taskDateAfterDay(t.due, date) && taskDateBeforeDay(t.start, date) );
	cancelled = sortTasksByYmdField(tasks.filter(t=>includeInCurrentView(t) && !t.completed && t.checked && t.due && taskDateSameDay(t.due, date)), "due");
	dailyNote = sortTasksByYmdField(tasks.filter(t=>includeInCurrentView(t) && taskIsOpenForCalendar(t) && taskUsesDiaryDate(t) && t.dailyNote && taskDateSameDay(t.dailyNote, date)), "dailyNote");
}

function getTasksViaAdapter(date) {
	if (!tcFeatureFlags.tasksNative) {
		getTasks(date);
		return;
	}
	var rs = taskQueryAdapter.collectForDate(date);
	done = rs.done.concat(rs.doneWithoutCompletionDate || []);
	doneWithoutCompletionDate = rs.doneWithoutCompletionDate || [];
	due = rs.due || [];
	recurrence = rs.recurrence || [];
	overdue = rs.overdue || [];
	start = rs.start || [];
	scheduled = rs.scheduled || [];
	process = rs.process || [];
	cancelled = rs.cancelled || [];
	dailyNote = rs.dailyNote || [];
}

/** 与 renderTasksIntoHost 末尾 rawExpect 规则一致（先 getTasks） */
function sumBucketExpectForDate(dateStr) {
	getTasksViaAdapter(dateStr);
	var r = 0;
	if (tToday == dateStr) r += overdue.length;
	r += due.length + recurrence.length + start.length + scheduled.length + process.length + dailyNote.length + done.length + cancelled.length;
	return r;
}

function normalizeDisplayTaskText(rawText, cls) {
	var text = stripTaskMetadataEmojis(String(rawText || "").trim());
	/* v0.5 Phase C 第三轮：与 getMeta 在 L1063 的「[.*?] 一并剥」语义对齐
	 * 部分 builder 直接消费 obj.text；当上游 getMeta 失败回退或 metadata 把半行 markdown
	 * 留在 text 里时，会出现「[task title]」「[[note|alias]]」「- [ ] xxx」等噪声。
	 * 这里在显示层补一层兜底净化，所有 builder 共享同一份 SSOT，避免链路漂移。 */
	text = text.replace(/^\s*-\s*\[[ xX\-\/]\]\s*/, "");
	text = text.replace(/\[\[([^\[\]|]+?)(?:\|([^\[\]]+?))?\]\]/g, function (_m, target, alias) {
		if (alias) { return String(alias).trim(); }
		var s = String(target || "").trim();
		var lastSlash = s.lastIndexOf("/");
		if (lastSlash >= 0) { s = s.slice(lastSlash + 1); }
		var lastDot = s.lastIndexOf(".");
		if (lastDot > 0) { s = s.slice(0, lastDot); }
		return s;
	});
	text = text.replace(/\[\^[^\]]*\]/g, "");
	/* Markdown 外链 [label](url) → label（与 getMeta 剥 inline 语义对齐，减轻端日幽灵条括号噪声） */
	text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, function (_m, lab) { return String(lab || "").trim(); });
	/* 残余成对方括号（半截 wikilink / LP 消毒残留） */
	text = text.replace(/\[[^\]]*\]/g, "");
	text = text.replace(/\s{2,}/g, " ").trim();
	if (cls != "overdue") { return text; }
	// Overdue cards already have visual warning styles; avoid duplicating warning/date prefixes in title.
	text = text.replace(/^[\s\uFEFF]*(?:\u26A0\uFE0F|\u26A0|\u2757|!)+\s*/u, "");
	text = text.replace(/^[\s\uFEFF]*(?:📅\s*)?(?:\d{4}[-./]\d{1,2}[-./]\d{1,2}|\d{4}年\d{1,2}月\d{1,2}日?)\s*/u, "");
	return text.trim();
}

/** 月表 overlay 第三轨去重：与 `normalizeDisplayTaskText` 同向再压一层，专供标题键比对（不写回笔记） */
function normalizeMonthTitleDedupeKey(rawText) {
	var t = normalizeDisplayTaskText(rawText, "due");
	t = String(t || "")
		.replace(/[\u200B-\u200D\uFEFF]/g, "")
		.replace(/\s+/g, " ")
		.trim();
	return t;
}

/** 从任务条 DOM 取可见标题文本（overlay / cell 条目共用） */
function getMonthTaskVisibleTitleFromNode(node) {
	if (!node || !node.querySelector) { return ""; }
	try {
		var d = node.querySelector(".description, a.internal-link, .internal-link");
		var raw = d ? String(d.textContent || "") : String(node.textContent || "");
		return normalizeMonthTitleDedupeKey(raw);
	} catch (_) {
		return "";
	}
}

function isVisualEmptyTaskTitle(text) {
	var t = String(text || "")
		.replace(/[\u200B-\u200D\uFEFF]/g, "")
		.replace(/\s+/g, " ")
		.trim();
	if (!t) { return true; }
	// Only placeholder brackets/punctuation should not render as a standalone monthly card.
	var stripped = t.replace(/[\[\]\(\)（）【】「」『』《》<>〔〕{}\-–—·•,.;:!?，。；：！？、\s]/g, "");
	return !stripped;
}

function shouldSkipMonthTaskRender(taskObj, cls) {
	var title = normalizeDisplayTaskText(taskObj && taskObj.text, cls);
	return isVisualEmptyTaskTitle(title);
}

function isRenderableTaskRow(taskObj, cls) {
	var title = normalizeDisplayTaskText(taskObj && taskObj.text, cls);
	if (isVisualEmptyTaskTitle(title)) { return false; }
	var compact = String(title || "")
		.replace(/[\u200B-\u200D\uFEFF]/g, "")
		.replace(/\s+/g, " ")
		.trim();
	if (!compact) { return false; }
	/* "任务" is an editor placeholder, not a renderable task title. */
	if (compact === "任务") { return false; }
	return true;
}

function normalizeMonthTaskRole(taskObj, currentDate) {
	var d = String(currentDate || "");
	if (!taskObj || !d) { return "none"; }
	var sy = coerceTemporalToYmd(taskObj.start) || "";
	var ey = coerceTemporalToYmd(taskObj.due) || "";
	if (!sy || !ey) { return "single"; }
	if (sy === ey) { return taskDateSameDay(taskObj.start, d) ? "single" : "none"; }
	if (taskDateSameDay(taskObj.start, d)) { return "start"; }
	if (taskDateSameDay(taskObj.due, d)) { return "end"; }
	if (!taskDateAfterDay(taskObj.start, d) && !taskDateBeforeDay(taskObj.due, d)) { return "middle"; }
	return "none";
}

function getMonthTaskDomKey(node) {
	if (!node || !node.getAttribute) { return ""; }
	var p = String(node.getAttribute("data-tc-path") || "");
	var l = String(node.getAttribute("data-tc-line") || "");
	var s = String(node.getAttribute("data-tc-sig") || "");
	return p + "\u0001" + l + "\u0001" + s + "\u0001" + (node.getAttribute("data-schedule-index") ?? "");
}

/* path+line 是任务的稳定身份；这里给月表清理提供一个不依赖文本签名的副键。 */
function getMonthTaskDomKeyShort(node) {
	if (!node || !node.getAttribute) { return ""; }
	var p = String(node.getAttribute("data-tc-path") || "");
	var l = String(node.getAttribute("data-tc-line") || "");
	if (!p && !l) { return ""; }
	return p + "\u0001" + l + "\u0001" + (node.getAttribute("data-schedule-index") ?? "");
}

/* overlay 应用并提交后，再按日期、行级身份和可见标题清除异步重复节点。
 *
 * 注意：seg.sample 在 applyMonthSpanOverlay 已被 cloneNode + 源节点 remove，但 sample 自身 detached 后
 * 仍可读 attribute（DOM 节点未销毁），无需提前缓存。getMonthTaskDomKeyShort(sample) 即 path+line 串。 */
function finalSweepDuplicatesAfterOverlayByDate(wrapper, model) {
	if (!wrapper || !model || !model.bars || !model.bars.length) { return; }
	var cells = [];
	try { cells = wrapper.querySelectorAll(".cell[data-date]"); } catch (_) { cells = []; }
	if (!cells.length) { return; }
	for (var i = 0; i < model.bars.length; i++) {
		var seg = model.bars[i];
		if (!seg || !seg.sample || !seg.sample.getAttribute) { continue; }
		var sampleStart = String(seg.sample.getAttribute("data-start-date") || "");
		var sampleDue = String(seg.sample.getAttribute("data-due-date") || "");
		var sampleShort = getMonthTaskDomKeyShort(seg.sample);
		var sampleTitleKey = getMonthTaskVisibleTitleFromNode(seg.sample);
		var hasDatePair = !!(sampleStart && sampleDue && sampleStart !== sampleDue);
		var hasShort = !!sampleShort;
		var hasTitleKey = !!(sampleTitleKey && sampleTitleKey.length >= 2);
		if (!hasDatePair && !hasShort && !hasTitleKey) { continue; }
		var startCol = Math.max(0, Math.min(cells.length - 1, seg.startCol));
		var endCol = Math.max(startCol, Math.min(cells.length - 1, seg.endCol));
		for (var c = startCol; c <= endCol; c++) {
			var cell = cells[c];
			if (!cell) { continue; }
			var box = null;
			try { box = cell.querySelector(".cellContent"); } catch (_) { box = null; }
			if (!box) { continue; }
			var nodes = [];
			try { nodes = box.querySelectorAll(".tc-cal-item, [data-tc-cal-item='1']"); } catch (_) { nodes = []; }
			for (var k = 0; k < nodes.length; k++) {
				var nd = nodes[k];
				if (!nd || (nd.classList && nd.classList.contains("tc-month-reserve-spacer"))) { continue; }
				var nStart = String(nd.getAttribute && nd.getAttribute("data-start-date") || "");
				var nDue = String(nd.getAttribute && nd.getAttribute("data-due-date") || "");
				var nShort = getMonthTaskDomKeyShort(nd);
				var matchByDate = hasDatePair && !nShort && !hasShort && nStart === sampleStart && nDue === sampleDue;
				var matchByShort = hasShort && nShort === sampleShort
					&& nd.getAttribute("data-tc-month-span") !== "1";
				/* 轨 3：path/line 缺失的幽灵条仍可能与 overlay 同源标题一致，按归一化标题键移除 */
				var matchByTitle = hasTitleKey && !nShort
					&& nd.getAttribute("data-tc-month-span") !== "1"
					&& getMonthTaskVisibleTitleFromNode(nd) === sampleTitleKey;
				if (matchByDate || matchByShort || matchByTitle) {
					try { nd.remove(); } catch (_) {}
				}
			}
		}
	}
}

/* 同 cellContent 内按 path+line 去重，处理 metadata 异步重灌同一任务的情况。
 * 选择保留策略：优先保留结构完整的节点。
 * 不影响 overlay 跨天源条（overlay item 居于 .tc-month-span-overlay 之下，不在 cellContent）。 */
function dedupeMonthCellTasks(box) {
	if (!box || !box.querySelectorAll) { return 0; }
	var nodes = [];
	try { nodes = box.querySelectorAll(".tc-cal-item, [data-tc-cal-item='1']"); } catch (_) { return 0; }
	if (nodes.length < 2) { return 0; }
	var seen = Object.create(null);
	var removed = 0;
	for (var i = 0; i < nodes.length; i++) {
		var n = nodes[i];
		if (!n || !n.getAttribute) { continue; }
		if (n.classList && n.classList.contains("tc-month-reserve-spacer")) { continue; }
		var key = getMonthTaskDomKeyShort(n);
		if (!key) { continue; }
		var prev = seen[key];
		if (!prev) { seen[key] = n; continue; }
		var prevRich = !!(prev.querySelector && prev.querySelector(".description, .internal-link"));
		var curRich = !!(n.querySelector && n.querySelector(".description, .internal-link"));
		var loser = (curRich && !prevRich) ? prev : n;
		if (loser === prev) { seen[key] = n; }
		try { loser.remove(); removed++; } catch (_) {}
	}
	return removed;
}

function clearMonthRelocatedFallbacks(gridEl) {
	if (!gridEl) { return; }
	try {
		gridEl.querySelectorAll(".cellContent[data-tc-span-relocated='1']").forEach(function (host) {
			if (!host || !host.querySelectorAll) { return; }
			host.querySelectorAll(".tc-cell-render-fallback").forEach(function (fb) {
				try { fb.remove(); } catch (_) {}
			});
		});
	} catch (_) {}
}

/** 从月格 .cellContent 的 CSS 变量读取跨天轨道几何，避免与 default.css 旋钮硬编码双漂移 */
function getMonthSpanMetrics(wrapperOrNull) {
	var defaults = { barHeight: 16, laneGap: 2, laneStride: 18, minTaskStartY: 18, overlayEdgeInset: 0 };
	var box = null;
	try {
		if (wrapperOrNull && wrapperOrNull.querySelector) {
			box = wrapperOrNull.querySelector(".cell[data-date] .cellContent");
		}
		if (!box && rootNode && rootNode.querySelector) {
			box = rootNode.querySelector(".tasksCalendar[view='month'] .cell[data-date] .cellContent")
				|| rootNode.querySelector(".cell[data-date] .cellContent");
		}
	} catch (_) {
		box = null;
	}
	if (!box || !box.ownerDocument || !box.ownerDocument.defaultView) {
		return defaults;
	}
	try {
		var cs = box.ownerDocument.defaultView.getComputedStyle(box);
		var parsePx = function (name, fallback) {
			var n = parseMonthCssPx(cs.getPropertyValue(name));
			return Number.isFinite(n) && n > 0 ? n : fallback;
		};
		var topBase = parsePx("--tc-month-cell-top-base", defaults.minTaskStartY);
		var barH = parsePx("--tc-month-span-bar-height", defaults.barHeight);
		var gap = parsePx("--tc-month-span-lane-gap", defaults.laneGap);
		var stride = Math.max(barH + gap, parsePx("--tc-month-span-lane-stride", 0));
		var minY = parsePx("--tc-month-span-min-task-start-y", topBase);
		if (!Number.isFinite(stride) || stride <= 0) {
			stride = Math.max(12, barH + gap);
		}
		var edge = parsePx("--tc-month-overlay-edge-inset", defaults.overlayEdgeInset);
		return {
			barHeight: barH,
			laneGap: gap,
			laneStride: stride,
			minTaskStartY: Math.max(minY, topBase),
			overlayEdgeInset: edge
		};
	} catch (_) {
		return defaults;
	}
}

function parseMonthCssPx(val) {
	var n = parseFloat(String(val || "").replace("px", "").trim());
	return Number.isFinite(n) ? n : 0;
}

function getMonthOverlayEndInsetPx(cellContent, metrics) {
	var fallback = Number.isFinite(metrics && metrics.overlayEdgeInset) ? metrics.overlayEdgeInset : 0;
	if (!cellContent || !cellContent.ownerDocument) { return fallback; }
	try {
		var cs = cellContent.ownerDocument.defaultView ? cellContent.ownerDocument.defaultView.getComputedStyle(cellContent) : null;
		var padRight = cs ? parseMonthCssPx(cs.paddingRight) : 0;
		var tokenEnd = cs ? parseMonthCssPx(cs.getPropertyValue("--tc-month-overlay-safe-end")) : 0;
		var rowRightInset = cs ? parseMonthCssPx(cs.getPropertyValue("--tc-month-row-right-inset")) : 0;
		var inset = Math.max(fallback, tokenEnd, padRight + rowRightInset);
		return inset;
	} catch (_) {
		return fallback;
	}
}

function measureMonthCellVisualRect(wrapper, cell, metrics) {
	if (!wrapper || !cell) { return null; }
	var box = null;
	try { box = cell.querySelector(".cellContent"); } catch (_) { box = null; }
	if (!box || !box.getBoundingClientRect || !wrapper.getBoundingClientRect) { return null; }
	try {
		var wr = wrapper.getBoundingClientRect();
		var br = box.getBoundingClientRect();
		var cs = box.ownerDocument && box.ownerDocument.defaultView ? box.ownerDocument.defaultView.getComputedStyle(box) : null;
		var borderLeft = cs ? parseMonthCssPx(cs.borderLeftWidth) : 0;
		var startInset = borderLeft + (cs ? parseMonthCssPx(cs.paddingLeft) : 0);
		var endInset = getMonthOverlayEndInsetPx(box, metrics);
		var left = (br.left - wr.left) + startInset;
		var contentWidth = Number.isFinite(box.clientWidth) && box.clientWidth > 0 ? box.clientWidth : br.width;
		var right = (br.left - wr.left) + borderLeft + contentWidth - endInset;
		if (!Number.isFinite(left) || !Number.isFinite(right) || right <= left) { return null; }
		return { left: left, right: right };
	} catch (_) {
		return null;
	}
}

function applyMonthReserveByCol(wrapper, cells, reserveByColPx) {
	if (!wrapper || !cells || !cells.length) { return; }
	var maxReserve = 0;
	for (var ci = 0; ci < cells.length; ci++) {
		var cell = cells[ci];
		var box = null;
		try { box = cell ? cell.querySelector(".cellContent") : null; } catch (_) { box = null; }
		if (!box) { continue; }
		var reservePx = Number.isFinite(reserveByColPx && reserveByColPx[ci]) ? reserveByColPx[ci] : 0;
		maxReserve = Math.max(maxReserve, reservePx);
		try {
			box.style.setProperty("--tc-month-overlay-reserve-col", String(reservePx) + "px");
			box.setAttribute("data-tc-month-overlay-reserve-col", String(reservePx));
		} catch (_) {}
	}
	try {
		wrapper.style.setProperty("--tc-month-overlay-reserve", String(maxReserve) + "px");
		wrapper.setAttribute("data-tc-month-has-span", maxReserve > 0 ? "1" : "0");
	} catch (_) {}
}

function cleanupMonthSourceRowsByModel(wrapper, model) {
	if (!wrapper || !model || !model.bars || !model.bars.length) { return; }
	/* 双键识别 overlay 源节点：
	 *  - fullKeySet：path+line+sig
	 *  - shortKeySet：path+line
	 *  - alreadyKeptSamples：本轮 model.bars 中"被认领的源节点 DOM"集合，确保我们不会再删除自己 */
	var fullByDate = Object.create(null);
	var shortByDate = Object.create(null);
	var alreadyKeptSamples = new Set();
	for (var i = 0; i < model.bars.length; i++) {
		var seg = model.bars[i];
		if (!seg) { continue; }
		var fullK = getMonthTaskDomKey(seg.sample);
		var shortK = getMonthTaskDomKeyShort(seg.sample);
		if (!fullK && !shortK) { continue; }
		if (seg.nodes && seg.nodes.length) {
			for (var nx = 0; nx < seg.nodes.length; nx++) { try { alreadyKeptSamples.add(seg.nodes[nx]); } catch (_) {} }
		}
		try { alreadyKeptSamples.add(seg.sample); } catch (_) {}
		for (var col = seg.startCol; col <= seg.endCol; col++) {
			var key = String(col);
			if (fullK) {
				if (!fullByDate[key]) { fullByDate[key] = new Set(); }
				fullByDate[key].add(fullK);
			}
			if (shortK) {
				if (!shortByDate[key]) { shortByDate[key] = new Set(); }
				shortByDate[key].add(shortK);
			}
		}
	}
	var cells = [];
	try { cells = wrapper.querySelectorAll(".cell[data-date]"); } catch (_) { cells = []; }
	for (var ci = 0; ci < cells.length; ci++) {
		var fullKeys = fullByDate[String(ci)];
		var shortKeys = shortByDate[String(ci)];
		if ((!fullKeys || !fullKeys.size) && (!shortKeys || !shortKeys.size)) { continue; }
		var box = null;
		try { box = cells[ci].querySelector(".cellContent"); } catch (_) { box = null; }
		if (!box) { continue; }
		var nodes = [];
		try { nodes = box.querySelectorAll(".tc-cal-item[data-tc-cal-item='1'], [data-tc-cal-item='1'], .tc-cal-item"); } catch (_) { nodes = []; }
		for (var ni = 0; ni < nodes.length; ni++) {
			var n = nodes[ni];
			if (!n || (n.classList && n.classList.contains("tc-month-reserve-spacer"))) { continue; }
			/* 已在本轮 model.bars 里被 two-phase 处理过（remove 或留作 sample）→ 不再触碰 */
			if (alreadyKeptSamples.has(n)) { continue; }
			var nFull = getMonthTaskDomKey(n);
			var nShort = getMonthTaskDomKeyShort(n);
			var hit = (nFull && fullKeys && fullKeys.has(nFull))
				|| (nShort && shortKeys && shortKeys.has(nShort));
			if (!hit) { continue; }
			/* v0.4.6 旧逻辑只清理"无 span 标记"的同身份残留，但端日 fallback 节点
			 * 经 Phase C post-processor 后也会带 span=1，需要一同清理；
			 * 它们若真该保留，必然进了 alreadyKeptSamples，已被上面提前 continue。 */
			try { n.remove(); } catch (_) {}
		}
	}
}

function collectMonthSpanSegments(wrapper) {
	var cells = [];
	try { cells = wrapper.querySelectorAll(".cell[data-date]"); } catch (_) { cells = []; }
	var oldOverlay = null;
	var oldBars = [];
	try {
		oldOverlay = wrapper.querySelector(".tc-month-span-overlay");
		oldBars = oldOverlay ? Array.prototype.slice.call(oldOverlay.querySelectorAll(".tc-month-span-overlay-item")) : [];
	} catch (_) {
		oldOverlay = null;
		oldBars = [];
	}
	var segments = [];
	for (var ci = 0; ci < cells.length; ci++) {
		var cell = cells[ci];
		if (!cell) { continue; }
		var cellDate = String(cell.getAttribute("data-date") || "");
		var spanNodes = [];
		try {
			spanNodes = cell.querySelectorAll(".cellContent .tc-cal-item[data-tc-month-span='1'], .cellContent [data-tc-cal-item='1'][data-tc-month-span='1']");
		} catch (_) {
			spanNodes = [];
		}
		for (var si = 0; si < spanNodes.length; si++) {
			var node = spanNodes[si];
			if (!node) { continue; }
			var host = null;
			try { host = node.closest ? node.closest(".cellContent") : null; } catch (_) { host = null; }
			if (!host) { continue; }
			var ownerCell = null;
			try { ownerCell = host.closest ? host.closest(".cell[data-date]") : null; } catch (_) { ownerCell = null; }
			if (ownerCell && ownerCell !== cell) { continue; }
			segments.push({
				node: node,
				cellIndex: ci,
				cellDate: cellDate,
				path: String(node.getAttribute("data-tc-path") || ""),
				line: String(node.getAttribute("data-tc-line") || ""),
				sig: String(node.getAttribute("data-tc-sig") || ""),
				scheduleIndex: node.getAttribute("data-schedule-index"),
				role: String(node.getAttribute("data-tc-month-role") || ""),
				pos: String(node.getAttribute("data-tc-month-span-pos") || "")
			});
		}
	}
	return { cells: cells, oldOverlay: oldOverlay, oldBars: oldBars, segments: segments };
}

function groupMonthSpanSegments(segments) {
	var groupsByKey = Object.create(null);
	for (var i = 0; i < segments.length; i++) {
		var seg = segments[i];
		var keyCore = seg.path + "\u0001" + seg.line + "\u0001" + seg.sig + "\u0001" + (seg.scheduleIndex ?? "");
		var key = keyCore;
		// 对无法稳定识别的匿名 segment，避免误合并导致 laneCount 被低估（宁可多 lane，不可重叠）
		if (!seg.path && !seg.line && !seg.sig) {
			key = "__anon__\u0001" + String(seg.cellIndex) + "\u0001" + String(i);
		}
		if (!groupsByKey[key]) {
			groupsByKey[key] = {
				key: key,
				nodes: [],
				startCol: seg.cellIndex,
				endCol: seg.cellIndex,
				sourceLine: parseInt(String(seg.line || ""), 10),
				hasStart: false,
				hasEnd: false,
				sample: seg.node
			};
		}
		var g = groupsByKey[key];
		g.nodes.push(seg.node);
		g.startCol = Math.min(g.startCol, seg.cellIndex);
		g.endCol = Math.max(g.endCol, seg.cellIndex);
		var segLine = parseInt(String(seg.line || ""), 10);
		if (Number.isFinite(segLine)) {
			if (!Number.isFinite(g.sourceLine)) { g.sourceLine = segLine; }
			else { g.sourceLine = Math.min(g.sourceLine, segLine); }
		}
		if (seg.pos === "start" || seg.pos === "single") { g.hasStart = true; }
		if (seg.pos === "end" || seg.pos === "single") { g.hasEnd = true; }
	}
	return Object.keys(groupsByKey).map(function (k) { return groupsByKey[k]; });
}

function layoutMonthSpanLanes(groups) {
	groups.sort(function (a, b) {
		if (a.startCol !== b.startCol) { return a.startCol - b.startCol; }
		if (a.endCol !== b.endCol) { return a.endCol - b.endCol; }
		if (a.key !== b.key) { return a.key < b.key ? -1 : 1; }
		var al = Number.isFinite(a.sourceLine) ? a.sourceLine : Number.POSITIVE_INFINITY;
		var bl = Number.isFinite(b.sourceLine) ? b.sourceLine : Number.POSITIVE_INFINITY;
		return al - bl;
	});
	var laneEnds = [];
	for (var gi = 0; gi < groups.length; gi++) {
		var lane = 0;
		while (lane < laneEnds.length && laneEnds[lane] >= groups[gi].startCol) { lane++; }
		if (lane >= laneEnds.length) { laneEnds.push(groups[gi].endCol); } else { laneEnds[lane] = groups[gi].endCol; }
		groups[gi].lane = lane;
	}
	return { groups: groups, laneCount: Math.max(0, laneEnds.length) };
}

function buildMonthSpanGeometry(layout, cells, metrics, wrapper) {
	var firstCell = cells[0];
	var firstBox = firstCell ? firstCell.querySelector(".cellContent") : null;
	var taskStartY = Number.isFinite(metrics && metrics.minTaskStartY) ? metrics.minTaskStartY : 18;
	if (firstBox && firstBox.ownerDocument && firstBox.ownerDocument.defaultView) {
		try {
			var cs0 = firstBox.ownerDocument.defaultView.getComputedStyle(firstBox);
			var tb = parseMonthCssPx(cs0.getPropertyValue("--tc-month-cell-top-base"));
			if (tb > 0) { taskStartY = Math.max(taskStartY, tb); }
		} catch (_) {}
	}
	if (firstBox) {
		var ot = parseInt(String(firstBox.offsetTop || "0"), 10) || 0;
		if (ot > 0) { taskStartY = Math.max(taskStartY, ot); }
	}
	var bars = [];
	var reserveByColDepth = new Array(cells.length);
	for (var ri = 0; ri < reserveByColDepth.length; ri++) { reserveByColDepth[ri] = 0; }
	for (var i = 0; i < layout.groups.length; i++) {
		var g = layout.groups[i];
		var sCell = cells[g.startCol];
		var eCell = cells[g.endCol];
		if (!sCell || !eCell) { continue; }
		var startRect = measureMonthCellVisualRect(wrapper, sCell, metrics);
		var endRect = measureMonthCellVisualRect(wrapper, eCell, metrics);
		var left = startRect ? startRect.left : (sCell.offsetLeft + 2);
		var right = endRect ? endRect.right : (eCell.offsetLeft + eCell.offsetWidth - (Number.isFinite(metrics.overlayEdgeInset) ? metrics.overlayEdgeInset : 0));
		var width = Math.max(12, right - left);
		var top = g.lane * metrics.laneStride;
		var pos = "middle";
		if (g.hasStart && g.hasEnd) pos = "single";
		else if (g.hasStart) pos = "start";
		else if (g.hasEnd) pos = "end";
		bars.push({
			left: left, width: width, top: top, startCol: g.startCol, endCol: g.endCol, lane: g.lane,
			pos: pos, sample: g.sample, nodes: g.nodes
		});
		for (var col = Math.max(0, g.startCol); col <= Math.min(cells.length - 1, g.endCol); col++) {
			reserveByColDepth[col] = Math.max(reserveByColDepth[col], g.lane + 1);
		}
	}
	var reserveByColPx = reserveByColDepth.map(function (depth) { return Math.max(0, depth) * metrics.laneStride; });
	var reservePx = 0;
	for (var rj = 0; rj < reserveByColPx.length; rj++) { reservePx = Math.max(reservePx, reserveByColPx[rj]); }
	return {
		taskStartY: taskStartY,
		bars: bars,
		laneCount: Math.max(layout.laneCount, bars.length ? 1 : 0),
		reservePx: reservePx,
		reserveByColPx: reserveByColPx
	};
}

function refreshMonthSpanOverlayInPlace(wrapper, oldBars, cells, metrics) {
	if (!oldBars || !oldBars.length) {
		applyMonthReserveByCol(wrapper, cells, []);
		return;
	}
	var reserveByColDepth = new Array(cells.length);
	for (var ri = 0; ri < reserveByColDepth.length; ri++) { reserveByColDepth[ri] = 0; }
	for (var i = 0; i < oldBars.length; i++) {
		var laneMeta = parseInt(String(oldBars[i].getAttribute("data-span-lane") || "0"), 10);
		var sMeta = parseInt(String(oldBars[i].getAttribute("data-span-start-col") || "-1"), 10);
		var eMeta = parseInt(String(oldBars[i].getAttribute("data-span-end-col") || "-1"), 10);
		if (Number.isFinite(laneMeta) && Number.isFinite(sMeta) && Number.isFinite(eMeta)) {
			for (var col = Math.max(0, sMeta); col <= Math.min(cells.length - 1, eMeta); col++) {
				reserveByColDepth[col] = Math.max(reserveByColDepth[col], laneMeta + 1);
			}
		}
	}
	var reserveByColPx = reserveByColDepth.map(function (depth) { return Math.max(0, depth) * metrics.laneStride; });
	applyMonthReserveByCol(wrapper, cells, reserveByColPx);
	for (var bi = 0; bi < oldBars.length; bi++) {
		var ob = oldBars[bi];
		if (!ob) { continue; }
		var sCol = parseInt(String(ob.getAttribute("data-span-start-col") || "-1"), 10);
		var eCol = parseInt(String(ob.getAttribute("data-span-end-col") || "-1"), 10);
		var lane = parseInt(String(ob.getAttribute("data-span-lane") || "0"), 10);
		if (!Number.isFinite(sCol) || !Number.isFinite(eCol) || sCol < 0 || eCol < 0 || sCol >= cells.length || eCol >= cells.length) { continue; }
		var sCell = cells[sCol];
		var eCell = cells[eCol];
		if (!sCell || !eCell) { continue; }
		var startRect = measureMonthCellVisualRect(wrapper, sCell, metrics);
		var endRect = measureMonthCellVisualRect(wrapper, eCell, metrics);
		var l = startRect ? startRect.left : (sCell.offsetLeft + 2);
		var r = endRect ? endRect.right : (eCell.offsetLeft + eCell.offsetWidth - (Number.isFinite(metrics.overlayEdgeInset) ? metrics.overlayEdgeInset : 0));
		ob.style.left = String(l) + "px";
		ob.style.width = String(Math.max(12, r - l)) + "px";
		ob.style.top = String((Number.isFinite(lane) ? lane : 0) * metrics.laneStride) + "px";
	}
}

function applyMonthSpanOverlay(wrapper, model, metrics, oldOverlay) {
	if (!model.bars.length) {
		var noCells = [];
		try { noCells = wrapper.querySelectorAll(".cell[data-date]"); } catch (_) { noCells = []; }
		applyMonthReserveByCol(wrapper, noCells, []);
		return false;
	}
	if (oldOverlay) {
		try { oldOverlay.remove(); } catch (_) {}
	}
	var overlay = document.createElement("div");
	overlay.className = "tc-month-span-overlay";
	overlay.style.setProperty("--tc-month-span-lanes", String(model.laneCount));
	overlay.style.top = String(model.taskStartY) + "px";
	var hostSet = new Set();
	for (var i = 0; i < model.bars.length; i++) {
		var seg = model.bars[i];
		var bar = seg.sample.cloneNode(true);
		// cloneNode copies binding markers, but not the event listeners.
		bar.removeAttribute("data-month-drag-bound");
		bar.removeAttribute("data-month-drag-click-bound");
		bar.classList.add("tc-month-span-overlay-item");
		bar.setAttribute("data-tc-month-row", "span");
		try {
			bar.querySelectorAll(".resize-handle").forEach(function (h) {
				try { h.remove(); } catch (_) {}
			});
			bar.querySelectorAll(".note, .icon").forEach(function (n) {
				try { n.style.display = "none"; } catch (_) {}
			});
		} catch (_norm) {}
		bar.style.left = String(seg.left) + "px";
		bar.style.width = String(seg.width) + "px";
		bar.style.top = String(seg.top) + "px";
		bar.setAttribute("data-span-start-col", String(seg.startCol));
		bar.setAttribute("data-span-end-col", String(seg.endCol));
		bar.setAttribute("data-span-lane", String(seg.lane));
		bar.setAttribute("data-tc-month-span-pos", seg.pos);
		overlay.appendChild(bar);
		try {
			var trOv = tcTaskRowFromCalItemEl(seg.sample);
			var tclsOv = tcInferTypeClsFromCalItemEl(seg.sample);
			try {
				bar.querySelectorAll(".noria-status-circle[data-noria-status-circle='1']").forEach(function (oldC) {
					try { oldC.remove(); } catch (_) {}
				});
			} catch (_) {}
			try {
				bar.setAttribute("data-state", tcResolveCircleStateByType(tclsOv, !!(trOv && trOv.completed)));
			} catch (_) {}
			try { applyTaskTagColorMeta(bar, trOv, tclsOv); } catch (_) {}
			try { normalizeMonthTaskRowDom(bar, trOv, tclsOv); } catch (_) {}
			try {
				var mountedCircle = null;
				var mountedSlot = bar.querySelector(".tc-status-slot");
				if (mountedSlot) { mountedCircle = mountedSlot.querySelector(".noria-status-circle[data-noria-status-circle='1']"); }
				if (!mountedCircle) { mountedCircle = bar.querySelector(".noria-status-circle[data-noria-status-circle='1']"); }
				if (!mountedCircle) {
					tcEnsureStatusCircle(bar, trOv, tclsOv);
					mountedSlot = bar.querySelector(".tc-status-slot");
					if (mountedSlot) { mountedCircle = mountedSlot.querySelector(".noria-status-circle[data-noria-status-circle='1']"); }
					if (!mountedCircle) { mountedCircle = bar.querySelector(".noria-status-circle[data-noria-status-circle='1']"); }
				}
				if (mountedCircle) {
					bar.setAttribute("data-circle-mounted", "1");
				} else {
					bar.setAttribute("data-circle-mounted", "0");
				}
			} catch (_) {}
		} catch (_ovc) {}
		syncMonthTaskDateHandles(bar, seg.pos);
		for (var ni = 0; ni < seg.nodes.length; ni++) {
			try {
				var host = seg.nodes[ni] && seg.nodes[ni].closest ? seg.nodes[ni].closest(".cellContent") : null;
				if (host) { hostSet.add(host); }
			} catch (_) {}
		}
	}
	try { wrapper.style.position = "relative"; } catch (_) {}
	var inserted = false;
	try {
		if (overlay.childElementCount > 0) {
			wrapper.appendChild(overlay);
			inserted = true;
			var cells = [];
			try { cells = wrapper.querySelectorAll(".cell[data-date]"); } catch (_) { cells = []; }
			applyMonthReserveByCol(wrapper, cells, model.reserveByColPx || []);
		}
	} catch (_) {
		inserted = false;
	}
	if (!inserted) { return false; }
	// two-phase commit: overlay inserted -> remove sources
	for (var bj = 0; bj < model.bars.length; bj++) {
		var nodes = model.bars[bj].nodes || [];
		for (var nk = 0; nk < nodes.length; nk++) {
			try { nodes[nk].remove(); } catch (_) {}
		}
	}
	cleanupMonthSourceRowsByModel(wrapper, model);
	/* v0.5 Phase C：基于"任务身份卡"做终局清扫，不再依赖 sig 比对 */
	finalSweepDuplicatesAfterOverlayByDate(wrapper, model);
	/* v0.5 Phase C 第三轮：再对每个 overlay 覆盖列做同 cellContent 内 path+line 去重，
	 * 兜住 metadata 二次注入与同源 fallback 重叠（端日重复条 v3 的最后一道闸）。 */
	try {
		var sweepCells = wrapper.querySelectorAll(".cell[data-date]");
		if (sweepCells && sweepCells.length) {
			var visited = Object.create(null);
			for (var bsi = 0; bsi < model.bars.length; bsi++) {
				var sBar = model.bars[bsi];
				if (!sBar) { continue; }
				var sStart = Math.max(0, Math.min(sweepCells.length - 1, sBar.startCol));
				var sEnd = Math.max(sStart, Math.min(sweepCells.length - 1, sBar.endCol));
				for (var sc = sStart; sc <= sEnd; sc++) {
					if (visited[sc]) { continue; }
					visited[sc] = true;
					var sBox = null;
					try { sBox = sweepCells[sc].querySelector(".cellContent"); } catch (_) { sBox = null; }
					if (sBox) { dedupeMonthCellTasks(sBox); }
				}
			}
		}
	} catch (_) {}
	hostSet.forEach(function (hostEl) {
		try {
			hostEl.setAttribute("data-tc-span-relocated", "1");
			hostEl.querySelectorAll(".tc-cell-render-fallback").forEach(function (fb) {
				try { fb.remove(); } catch (_) {}
			});
		} catch (_) {}
	});
	return true;
}

function syncMonthSpanOverlay(gridEl) {
	if (!gridEl || !rootNode || rootNode.getAttribute("view") !== "month") { return; }
	var wrappers = [];
	try { wrappers = gridEl.querySelectorAll(".wrappers > .wrapper"); } catch (_) { wrappers = []; }
	// Read inherited CSS sizes before any week writes its overlay/reserve.
	var metricsByWeek = Array.from(wrappers, getMonthSpanMetrics);
	for (var wi = 0; wi < wrappers.length; wi++) {
		var wrapper = wrappers[wi];
		if (!wrapper) { continue; }
		var metrics = metricsByWeek[wi];
		var collected = collectMonthSpanSegments(wrapper);
		var cells = collected.cells || [];
		if (!cells.length) { continue; }
		// idempotent guard: no source segments -> refresh existing overlay geometry and reserve
		if (!collected.segments.length) {
			refreshMonthSpanOverlayInPlace(wrapper, collected.oldBars, cells, metrics);
			continue;
		}
		var grouped = groupMonthSpanSegments(collected.segments);
		if (!grouped.length) {
			applyMonthReserveByCol(wrapper, cells, []);
			continue;
		}
		var layout = layoutMonthSpanLanes(grouped);
		var model = buildMonthSpanGeometry(layout, cells, metrics, wrapper);
		applyMonthSpanOverlay(wrapper, model, metrics, collected.oldOverlay);
	}
}

var tcMonthLayoutRo = null;
var tcMonthLayoutRoTimer = null;
var tcMonthLayoutRoGrid = null;
var tcMonthLayoutRoTargets = new Set();
var tcMonthLayoutRoSuspendedUntil = 0;
var tcMonthCommitRevision = 0;
var tcMonthAppliedRevision = 0;

// Keep one scroll position per week, including a visible task anchor when rows change.
var tcMonthWeekScrollState = new Map(Array.isArray(input?.monthWeekScrollState) ? input.monthWeekScrollState : []);
rootNode.__noriaCaptureMonthScrollState = function () {
	if (rootNode.getAttribute("view") === "month") {
		rootNode.querySelectorAll(".wrappers > .wrapper").forEach(captureMonthWeekScroll);
	}
	return Array.from(tcMonthWeekScrollState.entries());
};
function monthWeekScrollKey(wrapper) {
	return String(wrapper.querySelector(".cell[data-date]")?.getAttribute("data-date") || "");
}
function monthScrollTaskKey(item) {
	var date = item.closest(".cell[data-date]")?.getAttribute("data-date") || item.getAttribute("data-span-start-col") || "";
	return getMonthTaskDomKeyShort(item) + "\u0001" + date;
}
function captureMonthWeekScroll(wrapper) {
	if (!wrapper || !wrapper.isConnected) { return; }
	var key = monthWeekScrollKey(wrapper);
	if (!key) { return; }
	var top = Math.max(0, wrapper.scrollTop || 0);
	wrapper._noriaMonthScrollTop = top;
	var bounds = wrapper.getBoundingClientRect();
	var headerHeight = wrapper.querySelector(".tc-month-date-header")?.offsetHeight || 24;
	var anchors = [];
	wrapper.querySelectorAll(".tc-cal-item").forEach(function (item) {
		var rect = item.getBoundingClientRect();
		if (rect.height > 0 && rect.bottom > bounds.top + headerHeight && rect.top < bounds.bottom) {
			anchors.push({ key: monthScrollTaskKey(item), offset: rect.top - bounds.top - headerHeight });
		}
	});
	anchors.sort(function (a, b) { return Math.abs(a.offset) - Math.abs(b.offset); });
	tcMonthWeekScrollState.set(key, { top: top, anchors: anchors.slice(0, 4) });
	if (tcMonthWeekScrollState.size > 60) { tcMonthWeekScrollState.delete(tcMonthWeekScrollState.keys().next().value); }
}
function prepareMonthWeekScroll(grid) {
	grid.querySelectorAll(".wrappers > .wrapper").forEach(function (wrapper) {
		wrapper.querySelectorAll(".cell[data-date]").forEach(function (cell) {
			var name = cell.querySelector(".cellName");
			if (!name || name.parentElement?.classList.contains("tc-month-date-header")) { return; }
			var header = getTasksCalendarDocument().createElement("div");
			header.className = "tc-month-date-header";
			cell.insertBefore(header, cell.firstChild);
			header.appendChild(name);
		});
		if (!wrapper._noriaMonthScrollBound) {
			wrapper._noriaMonthScrollBound = true;
			wrapper.tabIndex = 0;
			var dates = wrapper.querySelectorAll(".cell[data-date]");
			wrapper.setAttribute("aria-label", monthWeekScrollKey(wrapper) + " – " + (dates[dates.length - 1]?.getAttribute("data-date") || ""));
			wrapper.addEventListener("scroll", function () { captureMonthWeekScroll(wrapper); }, { passive: true });
		}
	});
}
function restoreMonthWeekScroll(grid) {
	grid.querySelectorAll(".wrappers > .wrapper").forEach(function (wrapper) {
		// Native scroll events can arrive after a mutation/resize commit. Do not undo
		// a wheel, keyboard or scrollbar move while its event is still queued.
		if (Number.isFinite(wrapper._noriaMonthScrollTop) && Math.abs(wrapper.scrollTop - wrapper._noriaMonthScrollTop) > 1) {
			captureMonthWeekScroll(wrapper);
			return;
		}
		var state = tcMonthWeekScrollState.get(monthWeekScrollKey(wrapper));
		if (!state) { return; }
		var nextTop = state.top;
		if (state.top > 0 && state.anchors.length) {
			var items = new Map();
			wrapper.querySelectorAll(".tc-cal-item").forEach(function (item) { items.set(monthScrollTaskKey(item), item); });
			for (var anchor of state.anchors) {
				var item = items.get(anchor.key);
				if (!item) { continue; }
				var headerHeight = wrapper.querySelector(".tc-month-date-header")?.offsetHeight || 24;
				nextTop = wrapper.scrollTop + item.getBoundingClientRect().top - wrapper.getBoundingClientRect().top - headerHeight - anchor.offset;
				break;
			}
		}
		wrapper.scrollTop = Math.max(0, Math.min(wrapper.scrollHeight - wrapper.clientHeight, nextTop));
		wrapper._noriaMonthScrollTop = wrapper.scrollTop;
	});
}

function bindMonthLayoutResizeObserver(gridEl) {
	if (!gridEl || typeof ResizeObserver === "undefined") { return; }
	if (!tcMonthLayoutRo) {
		tcMonthLayoutRo = new ResizeObserver(function () {
			if (!rootNode || rootNode.getAttribute("view") !== "month") { return; }
			if (Date.now() < tcMonthLayoutRoSuspendedUntil) { return; }
			if (tcMonthLayoutRoTimer) { clearTimeout(tcMonthLayoutRoTimer); }
			tcMonthLayoutRoTimer = setTimeout(function () {
				tcMonthLayoutRoTimer = null;
				if (!rootNode || rootNode.getAttribute("view") !== "month") { return; }
				var g = tcMonthLayoutRoGrid;
				if (!g || !g.isConnected) { return; }
				commitMonthLayout(g, "monthResizeObserver");
			}, 80);
		});
	}
	tcMonthLayoutRoGrid = gridEl;
	// Re-observing unchanged nodes emits another initial notification, even
	// without a resize. Reconcile hosts instead of restarting that cycle.
	var targets = new Set([gridEl]);
	gridEl.querySelectorAll(".wrappers > .wrapper").forEach(function (node) { targets.add(node); });
	gridEl.querySelectorAll(".cell[data-date] .cellContent").forEach(function (node) { targets.add(node); });
	tcMonthLayoutRoTargets.forEach(function (node) {
		if (!targets.has(node)) { tcMonthLayoutRo.unobserve(node); }
	});
	targets.forEach(function (node) {
		if (!tcMonthLayoutRoTargets.has(node)) { tcMonthLayoutRo.observe(node); }
	});
	tcMonthLayoutRoTargets = targets;
}

function commitMonthLayout(gridEl, reasonOrMeta) {
	if (!rootNode || rootNode.getAttribute("view") !== "month") { return; }
	if (deferHydrationIfInteracting(gridEl)) { return; }
	var meta = (reasonOrMeta && typeof reasonOrMeta === "object") ? reasonOrMeta : { reason: reasonOrMeta };
	var reason = String(meta.reason || "");
	var revision = Number(meta.revision || 0);
	if (!Number.isFinite(revision) || revision <= 0) {
		revision = ++tcMonthCommitRevision;
	}
	if (revision < tcMonthAppliedRevision) { return; }
	tcMonthAppliedRevision = revision;
	var g = gridEl || null;
	if (!g) {
		try { g = rootNode.querySelector(":scope > .grid"); } catch (_) { g = null; }
		if (!g) {
			try { g = rootNode.querySelector(".grid"); } catch (_) { g = null; }
		}
	}
	if (!g) { return; }
	tcMonthLayoutRoSuspendedUntil = Date.now() + 140;
	try { prepareMonthWeekScroll(g); } catch (_) {}
	try { scheduleMonthTaskDragBind(); } catch (_) {}
	try { syncMonthSpanOverlay(g); } catch (_) {}
	try { clearMonthRelocatedFallbacks(g); } catch (_) {}
	try { normalizeMonthTaskRows(g); } catch (_) {}
	try { restoreMonthWeekScroll(g); } catch (_) {}
	try { bindMonthLayoutResizeObserver(g); } catch (_) {}
	try {
		if (reason) { rootNode.setAttribute("data-tc-month-commit-reason", String(reason)); }
		rootNode.setAttribute("data-tc-month-commit-revision", String(revision));
	} catch (_) {}
}

function getTasksCalendarDocument() {
	try {
		return (rootNode && rootNode.ownerDocument) ? rootNode.ownerDocument : document;
	} catch (_) {
		return document;
	}
}

function eisenhowerFirstDayOfWeekNum() {
	var fd = parseInt(String(firstDayOfWeek), 10);
	if (!Number.isFinite(fd) || fd < 0 || fd > 6) {
		return 0;
	}
	return fd;
}
function eisenhowerRangeDayStrings(anchor, granularity) {
	var g = String(granularity || "week");
	var fd = eisenhowerFirstDayOfWeekNum();
	var a = moment(anchor).clone().startOf("day");
	var list = [];
	if (g === "day") {
		list.push(a.format("YYYY-MM-DD"));
		return list;
	}
	if (g === "week") {
		var day = a.day();
		var delta = (day - fd + 7) % 7;
		var start = a.clone().subtract(delta, "days");
		for (var i = 0; i < 7; i++) {
			list.push(start.clone().add(i, "days").format("YYYY-MM-DD"));
		}
		return list;
	}
	if (g === "month") {
		var dim = a.daysInMonth();
		var ym = a.clone().startOf("month");
		for (var j = 0; j < dim; j++) {
			list.push(ym.clone().add(j, "days").format("YYYY-MM-DD"));
		}
		return list;
	}
	if (g === "year") {
		var ys = a.clone().startOf("year");
		var ye = a.clone().endOf("year");
		var cur = ys.clone();
		while (cur.isBefore(ye, "day") || cur.isSame(ye, "day")) {
			list.push(cur.format("YYYY-MM-DD"));
			cur.add(1, "days");
		}
		return list;
	}
	return list;
}
function normalizeTaskCalendarRangeGranularity(granularity) {
	var g = String(granularity || "week");
	return /^(day|week|month|year)$/.test(g) ? g : "week";
}
function getTaskCalendarRangeAnchor(m, granularity) {
	var g = normalizeTaskCalendarRangeGranularity(granularity);
	var fd = eisenhowerFirstDayOfWeekNum();
	var x = moment(m).clone();
	if (g === "day") {
		return x.startOf("day");
	}
	if (g === "week") {
		var day = x.day();
		var delta = (day - fd + 7) % 7;
		return x.subtract(delta, "days").startOf("day");
	}
	if (g === "month") {
		return x.startOf("month");
	}
	if (g === "year") {
		return x.startOf("year");
	}
	return x.startOf("day");
}
function formatTaskCalendarRangeTitle(anchor, granularity) {
	return taskCalendarDateHeading(anchor, normalizeTaskCalendarRangeGranularity(granularity));
}

function createTaskCalendarRangeModel(anchor, granularity) {
	var g = normalizeTaskCalendarRangeGranularity(granularity);
	var a = getTaskCalendarRangeAnchor(anchor, g);
	return {
		granularity: g,
		anchor: a,
		days: eisenhowerRangeDayStrings(a, g),
		titleHtml: formatTaskCalendarRangeTitle(a, g)
	};
}
function snapSelectedDateToEisenAnchor(m) {
	return getTaskCalendarRangeAnchor(m, eisenhowerGranularity);
}
function formatEisenhowerToolbarTitle(anchor) {
	return formatTaskCalendarRangeTitle(anchor, eisenhowerGranularity);
}
function createTaskCalendarRangeStats(openEntries, completedEntries) {
	var stats = {
		due: 0,
		done: completedEntries ? completedEntries.size : 0,
		overdue: 0,
		start: 0,
		scheduled: 0,
		recurrence: 0,
		dailyNote: 0
	};
	// The matrix includes carried-over tasks; a date-only snapshot is a different population.
	if (openEntries) openEntries.forEach(function (entry) {
		if (entry.typ === "overdue") stats.overdue++;
		else stats.due++;
		var types = entry.types || new Set([entry.typ]);
		["start", "scheduled", "recurrence", "dailyNote"].forEach(function (type) { if(types.has(type)) stats[type]++; });
	});
	return stats;
}
function setStatisticValuesFromRangeStats(stats) {
	var s = stats || createTaskCalendarRangeStats();
	setStatisticValues(s.due, s.done, s.overdue, s.start, s.scheduled, s.recurrence, s.dailyNote);
}
function inheritEisenhowerGranularityFromView(activeView) {
	var viewName = String(activeView || "");
	if (viewName === "day" || viewName === "week" || viewName === "month") {
		eisenhowerGranularity = viewName;
		return true;
	}
	return false;
}
function coerceEisenhowerFocusDate(m) {
	var d = moment(m || calendarNow()).clone();
	if (!d || !d.isValid || !d.isValid()) {
		d = calendarNow();
	}
	return d.startOf("day");
}
function setEisenhowerFocusDate(m) {
	eisenhowerFocusDate = coerceEisenhowerFocusDate(m);
	return eisenhowerFocusDate.clone();
}
function getEisenhowerFocusDate(focusDate) {
	if (focusDate != null) {
		return setEisenhowerFocusDate(focusDate);
	}
	if (eisenhowerFocusDate && eisenhowerFocusDate.isValid && eisenhowerFocusDate.isValid()) {
		return eisenhowerFocusDate.clone();
	}
	return setEisenhowerFocusDate(selectedDate || calendarNow());
}
function initializeEisenhowerFocusDateFromView(activeView) {
	var viewName = String(activeView || "");
	var today = calendarNow().startOf("day");
	if (viewName === "day") {
		return setEisenhowerFocusDate(selectedDate || today);
	}
	if (viewName === "week" || viewName === "month") {
		var rangeModel = createTaskCalendarRangeModel(selectedDate || today, viewName);
		if (rangeModel.days && rangeModel.days.indexOf(today.format("YYYY-MM-DD")) >= 0) {
			return setEisenhowerFocusDate(today);
		}
		return setEisenhowerFocusDate(selectedDate || today);
	}
	return getEisenhowerFocusDate(selectedDate || today);
}
function shiftEisenhowerFocusDate(direction) {
	var delta = direction < 0 ? -1 : 1;
	var focus = getEisenhowerFocusDate();
	if (eisenhowerGranularity === "day") {
		focus.add(delta, "day");
	} else if (eisenhowerGranularity === "week") {
		focus.add(delta * 7, "days");
	} else if (eisenhowerGranularity === "month") {
		focus.add(delta, "month");
	} else if (eisenhowerGranularity === "year") {
		focus.add(delta, "year");
	} else {
		focus.add(delta * 7, "days");
	}
	return setEisenhowerFocusDate(focus);
}
function getEisenGranularityPool() {
	return rootNode && rootNode.querySelector(":scope > .tc-eisen-granularity-pool");
}
function undockEisenGranularity() {
	var seg = rootNode && rootNode.querySelector(".tc-eisen-granularity");
	if (!seg) {
		return;
	}
	var pool = getEisenGranularityPool();
	if (pool && seg.parentNode !== pool) {
		pool.appendChild(seg);
	}
}
function dockEisenGranularityToolbar() {
	var seg = rootNode.querySelector(".tc-eisen-granularity");
	var slot = rootNode.querySelector(".tc-toolbar-start");
	if (seg && slot) slot.appendChild(seg);
}
function paintEisenhowerGranularityUI() {
	var seg = rootNode && rootNode.querySelector(".tc-eisen-granularity");
	if (!seg) {
		return;
	}
	var isList = rootNode.getAttribute("view") === "list";
	seg.style.display = isList ? "block" : "none";
	if (!isList) {
		return;
	}
	seg.value = eisenhowerGranularity;
}

/** 月表拖改期依赖 data-start-date / data-due-*；ctx.el 扁条默认不带这些属性时补齐（含仅 scheduled 的任务） */
function tcEnsureCalItemTemporalAttrs(el, obj) {
	if (!el || !obj || el.nodeType !== 1) { return; }
	if (obj.calendarSchedule) el.setAttribute("data-schedule-index",String(obj.calendarSchedule.index));
	try {
		var stY = coerceTemporalToYmd(obj.start) || "";
		var duY = coerceTemporalToYmd(obj.due) || "";
		var schY = coerceTemporalToYmd(obj.scheduled) || "";
		if (!String(el.getAttribute("data-start-date") || "").trim()) {
			el.setAttribute("data-start-date", stY || schY || "");
		}
		if (!String(el.getAttribute("data-due-date") || "").trim()) {
			el.setAttribute("data-due-date", duY || schY || stY || "");
		}
		if (!el.hasAttribute("data-start-time")) {
			el.setAttribute("data-start-time", obj.startTime ? String(obj.startTime) : "");
		}
		if (!el.hasAttribute("data-due-time")) {
			el.setAttribute("data-due-time", obj.dueTime ? String(obj.dueTime) : "");
		}
	} catch (_) {}
}

function buildTaskElement(obj, cls, currentDate, ownerDoc, buildOpts) {
	try {
	buildOpts = buildOpts || {};
	var eisenContentOnly = !!buildOpts.eisenContentOnly;
	var monthView = !!buildOpts.monthView;
	var doc = (ownerDoc && ownerDoc.createElement) ? ownerDoc : getTasksCalendarDocument();
	var lighter = 25;
	var darker = -40;
	var typeCls = obj.calendarSchedule && !obj.completed && !obj.checked ? "scheduled" : String(cls || "");
	var notePages = buildOpts.notePages || new Map();
	var noteColor = normalizeHexColor(getMetaFromNote(obj, "color", notePages));
	var textColor = normalizeHexColor(getMetaFromNote(obj, "textColor", notePages));
	var noteIcon = getMetaFromNote(obj, "icon", notePages);
	var taskTextPlain = normalizeDisplayTaskText(obj.text, typeCls);
	if (isVisualEmptyTaskTitle(taskTextPlain) || String(taskTextPlain || "").trim() === "任务") { return null; }
	var rawPath = (obj.link && obj.link.path) ? String(obj.link.path) : String(obj.path || "");
	var taskPath = rawPath.replace(/\\/g, "/");
	var taskIcon = taskIconForClass(typeCls);
	var relative = "";
	if (obj.due) {
		var dueYmd = coerceTemporalToYmd(obj.due);
		if (dueYmd) relative = moment(dueYmd, "YYYY-MM-DD").fromNow();
	}
	var noteFilename = rawPath ? getFilename(taskPath) : "";
	var clsAcc = typeCls + " noNoteIcon";
	var noteText = noteIcon ? (String(noteIcon) + "\u00A0" + noteFilename) : (String(taskIcon) + "\u00A0" + noteFilename);
	if (clsAcc.indexOf("overdue") === 0) {
		noteText = "";
	}
	var taskSubpath = (obj.header && obj.header.subpath) ? obj.header.subpath : "";
	var taskLine = taskSubpath ? taskPath + "#" + taskSubpath : taskPath;
	var taskLineIndex = "";
	if (obj.position && obj.position.start && typeof obj.position.start.line !== "undefined") {
		taskLineIndex = String(obj.position.start.line);
	} else if (typeof obj.line !== "undefined") {
		taskLineIndex = String(obj.line);
	}
	var taskSig = "";
	try {
		var rawSig = String(obj.rawLine || obj.rawText || "");
		taskSig = encodeURIComponent(rawSig);
		// Keep the complete source snapshot for later schedule additions and conflict checks.
	} catch (_) {
		taskSig = "";
	}
	var style = "";
	if (noteColor && textColor) {
		style = "--task-background:" + noteColor + "33;--task-color:" + noteColor + ";--dark-task-text-color:" + textColor + ";--light-task-text-color:" + textColor;
	} else if (noteColor && !textColor) {
		style = "--task-background:" + noteColor + "33;--task-color:" + noteColor + ";--dark-task-text-color:" + transColor(noteColor, darker) + ";--light-task-text-color:" + transColor(noteColor, lighter);
	} else if (!noteColor && textColor) {
		style = "--task-background:#7D7D7D33;--task-color:#7D7D7D;--dark-task-text-color:" + transColor(textColor, darker) + ";--light-task-text-color:" + transColor(textColor, lighter);
	} else {
		style = "--task-background:#7D7D7D33;--task-color:#7D7D7D;--dark-task-text-color:" + transColor("#7D7D7D", darker) + ";--light-task-text-color:" + transColor("#7D7D7D", lighter);
	}
	var progressAlert = "false";
	var progressLeft = "";
	var progressLabel = "";
	var progressUrgency = "none";
	if (currentDate && !obj.calendarSchedule && obj.start && obj.due && !obj.completed) {
		var startMoment = moment(coerceTemporalToYmd(obj.start), "YYYY-MM-DD", true);
		var dueMoment = moment(coerceTemporalToYmd(obj.due), "YYYY-MM-DD", true);
		var nowMoment = moment(currentDate, "YYYY-MM-DD", true);
		if (startMoment.isValid() && dueMoment.isValid() && nowMoment.isValid() && dueMoment.isAfter(startMoment)) {
			var totalDays = Math.max(1, dueMoment.diff(startMoment, "days"));
			var elapsedDays = Math.max(0, nowMoment.diff(startMoment, "days"));
			var progressRatio = elapsedDays / totalDays;
			var daysLeft = Math.max(0, dueMoment.diff(nowMoment, "days"));
			if (progressRatio >= 0.8 && daysLeft > 0 && (typeCls == "process" || typeCls == "due")) {
				progressAlert = "true";
				progressLeft = String(daysLeft);
				progressLabel = "⏳" + daysLeft + "d";
				if (daysLeft <= 1) {
					progressUrgency = "high";
				} else if (daysLeft <= 3) {
					progressUrgency = "medium";
				} else {
					progressUrgency = "low";
				}
			}
		}
	}
	var timeStartLabel = normalizeTimeStr(obj.startTime || "");
	var timeEndLabel = normalizeTimeStr(obj.dueTime || "");
	var fallbackTimeLabel = normalizeTimeStr(getTimeForClass(obj, typeCls));
	var timeLabel = timeStartLabel || timeEndLabel || fallbackTimeLabel;
	var hasTime = timeLabel ? "true" : "false";
	var sortLabel = timeStartLabel || timeEndLabel || fallbackTimeLabel;
	var slot = getTaskTimeSlot(obj, typeCls, currentDate);
	var onStartDay = !!(obj.start && taskDateSameDay(obj.start, currentDate));
	var onDueDay = !!(obj.due && taskDateSameDay(obj.due, currentDate));
	var startYmd = coerceTemporalToYmd(obj.start) || "";
	var dueYmd = coerceTemporalToYmd(obj.due) || "";
	var isCrossDayRange = !!(startYmd && dueYmd && startYmd !== dueYmd && obj.startTime && obj.dueTime && slot.slotType === "range");
	var crossSeg = "";
	if (isCrossDayRange) {
		if (onStartDay && !onDueDay) {
			crossSeg = "start";
		} else if (!onStartDay && onDueDay) {
			crossSeg = "end";
		} else {
			var curM = moment(String(currentDate), "YYYY-MM-DD", true);
			var sM = moment(startYmd, "YYYY-MM-DD", true);
			var eM = moment(dueYmd, "YYYY-MM-DD", true);
			if (curM.isValid() && sM.isValid() && eM.isValid() && curM.isAfter(sM, "day") && curM.isBefore(eM, "day")) {
				crossSeg = "mid";
			}
		}
	}
	var slotDuration = Number(slot.endMin) - Number(slot.startMin);
	var compactTimeOnly = (slot.slotType != "none" && Number.isFinite(slotDuration) && slotDuration <= PLANNER_CHROME_COMPACT_MAX_MIN) ? "true" : "false";
	if (isCrossDayRange && crossSeg === "start") {
		compactTimeOnly = "false";
		var sms = parseInt(slot.startMin, 10);
		var ems = parseInt(slot.endMin, 10);
		timeStartLabel = normalizeTimeStr(obj.startTime || "") || minutesToTimeStr(Number.isFinite(sms) ? sms : 0);
		var dueTShow = normalizeTimeStr(obj.dueTime || "");
		var startDayM = moment(startYmd, "YYYY-MM-DD", true);
		var endDayM = moment(dueYmd + " " + (dueTShow || "00:00"), "YYYY-MM-DD HH:mm", true);
		if (dueTShow && startDayM.isValid() && endDayM.isValid()) {
			var dayDiff = endDayM.clone().startOf("day").diff(startDayM.clone().startOf("day"), "days");
			if (dayDiff === 1) {
				timeEndLabel = "次日 " + dueTShow;
			} else if (dayDiff > 1) {
				timeEndLabel = endDayM.format("M/D HH:mm");
			} else {
				timeEndLabel = minutesToTimeStr(Number.isFinite(ems) ? ems : 24 * 60);
			}
		} else {
			timeEndLabel = minutesToTimeStr(Number.isFinite(ems) ? ems : 24 * 60);
		}
	}
	if (compactTimeOnly == "true") {
		timeStartLabel = timeStartLabel || fallbackTimeLabel;
		timeEndLabel = "";
	}
	timeLabel = timeStartLabel || timeEndLabel || fallbackTimeLabel;
	sortLabel = timeStartLabel || timeEndLabel || fallbackTimeLabel;
	hasTime = timeLabel ? "true" : "false";
	var tone = getTaskTone(obj, typeCls);
	var lane = (obj.isTimelineDay || slot.slotType == "none") ? "day" : "time";
	if (slot.slotType != "none") {
		style += slotToCssVars(slot);
	}
	var el = doc.createElement("div");
	/* 主类名避免字面量「task」：部分 Live Preview 消毒会整节点剥掉 class 含 task 的元素；琥珀 fallback 即因 .task 计数恒为 0 */
	el.className = ("tc-cal-item " + clsAcc).trim();
	el.tabIndex = 0;
	el.setAttribute("data-nav-href", taskLine);
	el.title = noteFilename ? (noteFilename + ": " + taskTextPlain) : taskTextPlain;
	if (obj.calendarSource && obj.calendarSource.due) el.title += " · " + tcRuntimeT("workbench.due") + " " + coerceTemporalToYmd(obj.calendarSource.due) + (obj.calendarSource.dueTime ? " "+obj.calendarSource.dueTime : "");
	else if (obj.calendarDeadline) el.title += " · " + tcRuntimeT("workbench.due") + " " + coerceTemporalToYmd(obj.due) + (obj.dueTime ? " "+obj.dueTime : "");
	el.style.cssText = style;
	el.setAttribute("data-progress-alert", progressAlert);
	el.setAttribute("data-progress-left", progressLeft);
	el.setAttribute("data-progress-label", progressLabel);
	el.setAttribute("data-progress-urgency", progressUrgency);
	el.setAttribute("data-has-time", hasTime);
	el.setAttribute("data-time", timeLabel);
	el.setAttribute("data-time-sort", Number.isFinite(timeToMinutes(sortLabel)) ? String(timeToMinutes(sortLabel)) : "");
	el.setAttribute("data-slot", slot.slotType);
	el.setAttribute("data-start-min", slot.startMin);
	el.setAttribute("data-end-min", slot.endMin);
	el.setAttribute("data-compact", compactTimeOnly);
	el.setAttribute("data-tone", tone);
	applyTaskTagColorMeta(el, obj, typeCls);
	applyTaskDependencyStateToEl(el, obj);
	el.setAttribute("data-lane", lane);
	el.setAttribute("data-tc-path", taskPath);
	el.setAttribute("data-tc-line", taskLineIndex);
	el.setAttribute("data-tc-sig", taskSig);
	if (obj.calendarSchedule) el.setAttribute("data-schedule-index", String(obj.calendarSchedule.index));
	el.setAttribute("data-start-date", coerceTemporalToYmd(obj.start || (obj.calendarSchedule && obj.scheduled)) || "");
	el.setAttribute("data-start-time", String(obj.startTime || (obj.calendarSchedule && obj.scheduledTime) || ""));
	el.setAttribute("data-due-date", coerceTemporalToYmd(obj.due || (obj.calendarSchedule && obj.scheduled)) || "");
	el.setAttribute("data-due-time", String(obj.dueTime || (obj.calendarSchedule && obj.scheduledTime) || ""));
	if (isCrossDayRange && crossSeg === "start") {
		el.setAttribute("data-planner-cross", "1");
		el.setAttribute("data-planner-cross-seg", "start");
		el.setAttribute("data-planner-cross-id", hashTaskSnippet(getTaskKey(obj) + "|" + startYmd + "|" + dueYmd));
		try {
			var crossHint = normalizeTimeStr(obj.startTime || "") + " → " + normalizeTimeStr(obj.dueTime || "") + " (" + startYmd + " → " + dueYmd + ")";
			el.title = (el.title || "") + " · " + tcRuntimeT("runtime.tasksCalendar.crossDay.hint", { range: crossHint });
		} catch (_) {}
	}
	var spanMultiDay = !!(startYmd && dueYmd && startYmd !== dueYmd);
	var monthRole = monthView ? normalizeMonthTaskRole(obj, currentDate) : "none";
	try { if (monthView) { el.setAttribute("data-tc-month-role", monthRole); } } catch (_) {}
	if (monthView && !eisenContentOnly && !spanMultiDay && !isCrossDayRange) {
		el.classList.add("tc-cal-item--month-compact");
		try {
			el.style.cssText = "";
		} catch (_) {
			try {
				el.style.cssText = "";
			} catch (_2) {}
		}
		var rawStMc = String(obj.startTime || "").trim();
		var rawDtMc = String(obj.dueTime || "").trim();
		var hasExplicitTimeMc = !!(rawStMc || rawDtMc);
		el.setAttribute("data-has-time", hasExplicitTimeMc ? "true" : "false");
		if (hasExplicitTimeMc) {
			el.setAttribute("data-time", normalizeTimeStr(rawStMc || rawDtMc));
		} else {
			el.removeAttribute("data-time");
		}
		var innerMc = doc.createElement("span");
		innerMc.className = "inner";
		var dotMc = doc.createElement("span");
		dotMc.className = "tc-month-dot";
		dotMc.setAttribute("aria-hidden", "true");
		var dotTone = tcResolveMonthDotUrgency(obj, typeCls, "day");
		dotMc.setAttribute("data-tc-month-dot-tone", dotTone);
		innerMc.appendChild(dotMc);
		var linkMc = doc.createElement("span");
		linkMc.className = "description tc-month-task-title";
		linkMc.textContent = taskTextPlain;
		linkMc.setAttribute("role", "link");
		linkMc.tabIndex = 0;
		innerMc.appendChild(linkMc);
		if (hasExplicitTimeMc) {
			var timeMc = doc.createElement("span");
			timeMc.className = "tc-month-time";
			timeMc.textContent = normalizeTimeStr(rawStMc || rawDtMc);
			innerMc.appendChild(timeMc);
		}
		/* 月表标题与状态控件保持兄弟关系，避免长标题裁掉状态控件。 */
		var statusCircleMc = tcMakeNativeTaskCheckbox(obj, typeCls);
		if (statusCircleMc) { innerMc.appendChild(statusCircleMc); }
		el.appendChild(innerMc);
		el.setAttribute("data-tc-cal-item", "1");
		el.setAttribute("data-tc-kind", typeCls);
		normalizeMonthTaskRowDom(el, obj, typeCls);
		syncMonthTaskDateHandles(el, "single");
		return el;
	}
	if (monthView && spanMultiDay && monthRole !== "none" && monthRole !== "single") {
		try {
			el.setAttribute("data-tc-month-span", "1");
			var spanPos = monthRole === "start" ? "start" : (monthRole === "end" ? "end" : "middle");
			el.setAttribute("data-tc-month-span-pos", spanPos);
			el.setAttribute("data-has-time", "false");
			el.removeAttribute("data-time");
		} catch (_3) {}
	}
	if (eisenContentOnly) {
		el.className = ("tc-cal-item " + clsAcc + " tc-cal-item--eisen-content").trim();
		el.setAttribute("data-has-time", "false");
		el.removeAttribute("data-time");
		el.removeAttribute("data-time-sort");
		el.setAttribute("data-slot", "none");
		el.setAttribute("data-full-text", taskTextPlain || "");
		el.title = taskTextPlain;
		var innerE = doc.createElement("span");
		innerE.className = "inner";
		var descE = doc.createElement("span");
		descE.className = "description";
		descE.textContent = taskTextPlain;
		innerE.appendChild(descE);
		var checkE = tcMakeNativeTaskCheckbox(obj, typeCls);
		if (checkE) { innerE.appendChild(checkE); }
		el.appendChild(innerE);
		el.setAttribute("data-tc-cal-item", "1");
		el.setAttribute("data-tc-kind", typeCls);
		return el;
	}
	var rhTop = doc.createElement("span");
	rhTop.className = "resize-handle top";
	rhTop.setAttribute("aria-hidden", "true");
	var inner = doc.createElement("span");
	inner.className = "inner";
	var noteEl = doc.createElement("span");
	noteEl.className = "note";
	noteEl.textContent = noteText;
	var iconEl = doc.createElement("span");
	iconEl.className = "icon";
	iconEl.textContent = taskIcon;
	var desc = doc.createElement("span");
	desc.className = "description";
	desc.setAttribute("data-relative", relative);
	desc.textContent = taskTextPlain;
	el.setAttribute("data-full-text", taskTextPlain || "");
	var timeWrap = doc.createElement("span");
	timeWrap.className = "time";
	var tlnS = doc.createElement("span");
	tlnS.className = "tline start";
	tlnS.textContent = timeStartLabel;
	var tlnE = doc.createElement("span");
	tlnE.className = "tline end";
	tlnE.textContent = timeEndLabel;
	timeWrap.appendChild(tlnS);
	timeWrap.appendChild(tlnE);
	var titleRow = doc.createElement("span");
	titleRow.className = "tc-title-row";
	titleRow.appendChild(desc);
	inner.appendChild(noteEl);
	inner.appendChild(iconEl);
	inner.appendChild(titleRow);
	inner.appendChild(timeWrap);
	/* week/day 首帧兜底：默认先隐藏时段，等待 finalize 统一决策后再显式输出，避免旧规则抢布局导致首帧错排。 */
	if (!monthView && (slot.slotType === "range" || slot.slotType === "point") && hasTime) {
		el.classList.add("tc-hide-time");
		el.setAttribute("data-hide-time", "true");
		el.setAttribute("data-time-density", "hidden");
		el.setAttribute("data-auto-time-mode", "hidden");
		el.setAttribute("data-auto-layout", "multi");
	}
	/* 非时间任务条使用 Obsidian 原生 checkbox；时间轴条保留专用 status-circle 语义。 */
	if (slot.slotType === "none" && !(spanMultiDay && monthRole !== "none" && monthRole !== "single")) {
		var statusCircleMain = tcMakeNativeTaskCheckbox(obj, typeCls);
		if (statusCircleMain) {
			try { titleRow.appendChild(statusCircleMain); } catch (_) { inner.insertBefore(statusCircleMain, timeWrap); }
		}
	}
	var rhBot = doc.createElement("span");
	rhBot.className = "resize-handle bottom";
	rhBot.setAttribute("aria-hidden", "true");
	el.appendChild(rhTop);
	el.appendChild(inner);
	el.appendChild(rhBot);
	el.setAttribute("data-tc-cal-item", "1");
	el.setAttribute("data-tc-kind", typeCls);
	return el;
	} catch (err) {
		console.error("[noria tasksCalendar] buildTaskElement failed", err);
		return null;
	}
}

/* v0.5 Phase C：status-circle 工厂（无外部 DOM 依赖，可被任意 builder 挂载）
 * 状态映射：
 *   - default / process / due / start / scheduled / recurrence / dailynote / overdue → 空心
 *   - done → 实心
 *   - cancelled → 叉
 * 当前 MVP 行为：单击切换 done（调用 setTaskCompletionState），其余状态仅做视觉表达。
 * Alt+单击 cancelled、滚轮调 progress::N 留待后续完善（设计文档 §5.3.2）。 */
function tcMakeStatusCircle(taskObj, typeCls) {
	try {
		var doc = getTasksCalendarDocument();
		if (!doc || typeof doc.createElement !== "function") { return null; }
		var btn = doc.createElement("button");
		btn.type = "button";
		btn.className = "noria-status-circle";
		btn.setAttribute("aria-label", tcRuntimeT("runtime.tasksCalendar.task.toggleComplete"));
		btn.setAttribute("data-noria-status-circle", "1");
		var state = "default";
		try {
			if (taskObj && (taskObj.completed || typeCls === "done")) { state = "done"; }
			else if (typeCls === "cancelled") { state = "cancelled"; }
			else if (typeCls === "overdue") { state = "overdue"; }
			else if (typeCls === "process") { state = "process"; }
			else if (typeCls === "due") { state = "due"; }
			else if (typeCls === "start") { state = "start"; }
			else if (typeCls === "scheduled") { state = "scheduled"; }
			else if (typeCls === "recurrence") { state = "recurrence"; }
			else if (typeCls === "dailyNote") { state = "dailynote"; }
		} catch (_) {}
		btn.setAttribute("data-state", state);
		return btn;
	} catch (_) {
		return null;
	}
}

function tcMakeNativeTaskCheckbox(taskObj, typeCls) {
	try {
		var doc = getTasksCalendarDocument();
		if (!doc || typeof doc.createElement !== "function") { return null; }
		var input = doc.createElement("input");
		input.type = "checkbox";
		input.className = "task-list-item-checkbox noria-themed-checkbox noria-themed-checkbox--board tc-compact-checkbox";
		input.setAttribute("data-tc-compact-checkbox", "1");
		input.setAttribute("aria-label", tcRuntimeT("runtime.tasksCalendar.task.toggleComplete"));
		var state = "default";
		try {
			if (taskObj && (taskObj.completed || typeCls === "done")) { state = "done"; }
			else if (typeCls === "cancelled") { state = "cancelled"; }
			else if (typeCls === "overdue") { state = "overdue"; }
			else if (typeCls === "process") { state = "process"; }
			else if (typeCls === "due") { state = "due"; }
			else if (typeCls === "start") { state = "start"; }
			else if (typeCls === "scheduled") { state = "scheduled"; }
			else if (typeCls === "recurrence") { state = "recurrence"; }
			else if (typeCls === "dailyNote") { state = "dailynote"; }
		} catch (_) {}
		input.checked = state === "done";
		input.setAttribute("data-state", state);
		return input;
	} catch (_) {
		return null;
	}
}

function tcResolveCircleStateByType(typeCls, completed) {
	if (completed) { return "done"; }
	var t = String(typeCls || "");
	if (t === "cancelled") { return "cancelled"; }
	if (t === "overdue") { return "overdue"; }
	if (t === "process") { return "process"; }
	if (t === "due") { return "due"; }
	if (t === "start") { return "start"; }
	if (t === "scheduled") { return "scheduled"; }
	if (t === "recurrence") { return "recurrence"; }
	if (t === "dailyNote") { return "dailynote"; }
	return "default";
}

function tcApplyDoneVisualState(taskEl, circleEl, doneFlag) {
	if (!taskEl || !circleEl) { return; }
	var done = !!doneFlag;
	try {
		taskEl.classList.toggle("done", done);
		if (done) {
			taskEl.classList.remove("cancelled");
		}
	} catch (_) {}
	try {
		var kind = tcInferTypeClsFromCalItemEl(taskEl);
		var state = tcResolveCircleStateByType(kind, done);
		circleEl.setAttribute("data-state", state);
		if (circleEl.type === "checkbox") {
			circleEl.checked = done;
		}
	} catch (_) {}
}

var tcCircleTxnState = new Map();
async function tcToggleTaskDoneTransaction(taskEl, preferredCircle, options) {
	options = options || {};
	if (!taskEl) { return false; }
	var circleEl = preferredCircle || null;
	if (!circleEl) {
		try { circleEl = taskEl.querySelector(".tc-compact-checkbox[data-tc-compact-checkbox='1'], .noria-status-circle[data-noria-status-circle='1']"); } catch (_) { circleEl = null; }
	}
	if (!circleEl) { return false; }
	var taskKey = "";
	try {
		taskKey = getTaskIdentityKey(taskEl) || String(taskEl.getAttribute("data-nav-href") || "");
	} catch (_) {
		taskKey = "";
	}
	var nowTs = Date.now();
	var lock = taskKey ? tcCircleTxnState.get(taskKey) : null;
	if (lock && lock.inflight) { return false; }
	if (lock && nowTs - Number(lock.lastTs || 0) < 40) { return false; }
	var circleDone = (circleEl.getAttribute("data-state") || "") === "done";
	var domDone = !!(taskEl.classList && taskEl.classList.contains("done"));
	var currentDone = domDone || circleDone;
	var nextDone = typeof options.desiredDone === "boolean" ? !!options.desiredDone : !currentDone;
	tcApplyDoneVisualState(taskEl, circleEl, nextDone);
	if (taskKey) { tcCircleTxnState.set(taskKey, { inflight: true, lastTs: nowTs }); }
	try {
		await setTaskCompletionState(taskEl, nextDone, { silentNotice: !!options.silentNotice });
		return true;
	} catch (err) {
		try { tcApplyDoneVisualState(taskEl, circleEl, currentDone); } catch (_) {}
		var reason = (err && err.message) ? err.message : String(err || "未知错误");
		try { console.warn("[noria tasksCalendar] status-circle toggle failed", err); } catch (_) {}
	try { showDebugNotice(tcRuntimeT("runtime.tasksCalendar.notice.statusUpdateFailed", { message: reason })); } catch (_) {}
		return false;
	} finally {
		if (taskKey) { tcCircleTxnState.set(taskKey, { inflight: false, lastTs: Date.now() }); }
	}
}

/* status-circle 始终作为标题元素的兄弟节点，避免与省略文本共享裁剪盒。
 * 完整任务条使用 .description，月表紧凑条使用 .internal-link。
 * 跨天「源条」（仍在 cellContent 内）不挂；跨天 overlay 克隆条可挂圆圈并可点切换完成 */
function tcInferTypeClsFromCalItemEl(el) {
	if (!el || !el.getAttribute) { return "due"; }
	try {
		var k = el.getAttribute("data-tc-kind");
		if (k) { return String(k); }
	} catch (_) {}
	var kinds = ["overdue", "cancelled", "done", "process", "due", "start", "scheduled", "recurrence", "dailyNote"];
	for (var kix = 0; kix < kinds.length; kix++) {
		try {
			if (el.classList && el.classList.contains(kinds[kix])) { return kinds[kix]; }
		} catch (_) {}
	}
	return "due";
}
function tcTaskRowFromCalItemEl(el, rowIndex) {
	try {
		return findTaskRowForSaveMeta(collectTaskMeta(el), rowIndex);
	} catch (_) {
		return null;
	}
}
function isMonthTaskRowElement(rootEl) {
	if (!rootEl || !rootEl.getAttribute) { return false; }
	try {
		if (rootEl.classList && (rootEl.classList.contains("tc-month-span-overlay-item") || rootEl.classList.contains("tc-cal-item--month-compact"))) { return true; }
		if (rootEl.getAttribute("data-tc-month-row") || rootEl.getAttribute("data-tc-month-role")) { return true; }
		var cal = rootEl.closest && rootEl.closest(".tasksCalendar");
		if (cal && cal.getAttribute("view") === "month" && rootEl.matches && rootEl.matches("[data-tc-cal-item='1'], .tc-cal-item")) { return true; }
	} catch (_) {}
	return false;
}
function normalizeMonthTaskRowDom(rootEl, taskObj, typeCls) {
	if (!rootEl || !rootEl.querySelector || !isMonthTaskRowElement(rootEl)) { return; }
	try {
		var isSpan = rootEl.classList && rootEl.classList.contains("tc-month-span-overlay-item");
		rootEl.setAttribute("data-tc-month-row", isSpan ? "span" : "task");
		rootEl.setAttribute("data-tc-month-normalized", "1");
		applyTaskTagColorMeta(rootEl, taskObj, typeCls);
		var doc = rootEl.ownerDocument || getTasksCalendarDocument() || document;
		var inner = rootEl.querySelector(":scope > .inner");
		if (!inner) {
			inner = rootEl.querySelector(".inner");
		}
		if (!inner) {
			inner = doc.createElement("span");
			inner.className = "inner";
			while (rootEl.firstChild) {
				inner.appendChild(rootEl.firstChild);
			}
			rootEl.appendChild(inner);
		}
		var titleSlot = null;
		try { titleSlot = inner.querySelector(":scope > .tc-month-title-slot"); } catch (_) { titleSlot = null; }
		if (!titleSlot) {
			titleSlot = inner.querySelector(".tc-month-title-slot");
		}
		if (!titleSlot) {
			titleSlot = doc.createElement("span");
			titleSlot.className = "tc-month-title-slot";
			titleSlot.setAttribute("data-tc-month-title-slot", "1");
		}
		var slot = null;
		try { slot = inner.querySelector(":scope > .tc-status-slot"); } catch (_) { slot = null; }
		if (!slot) {
			slot = inner.querySelector(".tc-status-slot");
		}
		if (!slot) {
			slot = doc.createElement("span");
			slot.className = "tc-status-slot";
			slot.setAttribute("data-tc-status-slot", "1");
		}
		try { titleSlot.setAttribute("data-tc-month-title-slot", "1"); } catch (_) {}
		try { slot.setAttribute("data-tc-status-slot", "1"); } catch (_) {}
		try {
			if (titleSlot.parentNode !== inner) {
				inner.appendChild(titleSlot);
			}
			if (slot.parentNode !== inner) {
				inner.appendChild(slot);
			}
		} catch (_) {}
		try {
			var directChildren = Array.prototype.slice.call(inner.childNodes || []);
			directChildren.forEach(function (node) {
				if (!node || node === titleSlot || node === slot) { return; }
				if (node.nodeType === 1) {
					var el = node;
					if (el.classList && el.classList.contains("tc-status-slot")) {
						Array.prototype.slice.call(el.querySelectorAll(".noria-status-circle[data-noria-status-circle='1'], .tc-compact-checkbox[data-tc-compact-checkbox='1']")).forEach(function (c) {
							try { slot.appendChild(c); } catch (_) {}
						});
						try { el.remove(); } catch (_) {}
						return;
					}
					if (el.classList && (el.classList.contains("noria-status-circle") || el.classList.contains("tc-compact-checkbox"))) {
						try { slot.appendChild(el); } catch (_) {}
						return;
					}
				}
				try { titleSlot.appendChild(node); } catch (_) {}
			});
		} catch (_) {}
		try {
			if (inner.firstChild !== titleSlot) {
				inner.insertBefore(titleSlot, inner.firstChild);
			}
			if (slot.previousSibling !== titleSlot) {
				inner.insertBefore(slot, titleSlot.nextSibling);
			}
		} catch (_) {}
		try {
			Array.prototype.slice.call(inner.childNodes || []).forEach(function (node) {
				if (node === titleSlot || node === slot) { return; }
				try { titleSlot.appendChild(node); } catch (_) {}
			});
			if (inner.firstChild !== titleSlot) { inner.insertBefore(titleSlot, inner.firstChild); }
			if (slot.previousSibling !== titleSlot) { inner.insertBefore(slot, titleSlot.nextSibling); }
		} catch (_) {}
		var circle = null;
		var circles = [];
		try { circles = Array.prototype.slice.call(rootEl.querySelectorAll(".noria-status-circle[data-noria-status-circle='1'], .tc-compact-checkbox[data-tc-compact-checkbox='1']")); } catch (_) { circles = []; }
		if (circles.length) {
			circle = circles[0];
		}
		if (!circle) {
			circle = tcMakeNativeTaskCheckbox(taskObj, typeCls);
		}
		if (circle) {
			try {
				circles.forEach(function (oldCircle) {
					if (!oldCircle || oldCircle === circle) { return; }
					try { oldCircle.remove(); } catch (_) {}
				});
			} catch (_) {}
			try { if (circle.parentNode !== slot) { slot.appendChild(circle); } } catch (_) {}
			try {
				Array.prototype.slice.call(titleSlot.querySelectorAll(".noria-status-circle[data-noria-status-circle='1'], .tc-compact-checkbox[data-tc-compact-checkbox='1']")).forEach(function (titleCircle) {
					if (!titleCircle) { return; }
					try { slot.appendChild(titleCircle); } catch (_) {}
				});
				var slotCircles = Array.prototype.slice.call(slot.querySelectorAll(".noria-status-circle[data-noria-status-circle='1'], .tc-compact-checkbox[data-tc-compact-checkbox='1']"));
				slotCircles.forEach(function (slotCircle, idx) {
					if (!slotCircle) { return; }
					if (idx === 0) {
						try {
							if (slotCircle.classList && slotCircle.classList.contains("tc-compact-checkbox")) {
								slotCircle.setAttribute("data-tc-compact-checkbox", "1");
							} else {
								slotCircle.setAttribute("data-noria-status-circle", "1");
							}
						} catch (_) {}
						return;
					}
					try { slotCircle.remove(); } catch (_) {}
				});
			} catch (_) {}
			rootEl.setAttribute("data-circle-mounted", "1");
		} else {
			rootEl.setAttribute("data-circle-mounted", "0");
		}
	} catch (_) {}
}
function normalizeMonthTaskRows(rootEl) {
	if (!rootEl || !rootEl.querySelectorAll) { return; }
	try {
		// This index belongs to this synchronous pass only; source edits and
		// refreshes are resolved from the current task list on the next pass.
		var rowIndex = buildCalendarTaskRowIndex();
		var rows = [];
		if (isMonthTaskRowElement(rootEl)) { rows.push(rootEl); }
		Array.prototype.slice.call(rootEl.querySelectorAll(".tc-cal-item--month-compact, .tc-month-span-overlay-item, [data-tc-month-row], [data-tc-month-role], [data-tc-cal-item='1']")).forEach(function (el) {
			if (rows.indexOf(el) < 0) { rows.push(el); }
		});
		for (var i = 0; i < rows.length; i++) {
			var row = rows[i];
			if (!row || !isMonthTaskRowElement(row)) { continue; }
			normalizeMonthTaskRowDom(row, tcTaskRowFromCalItemEl(row, rowIndex), tcInferTypeClsFromCalItemEl(row));
		}
	} catch (_) {}
}
function tcEnsureStatusCircle(rootEl, taskObj, typeCls) {
	if (!rootEl || !rootEl.querySelector) { return; }
	try {
		// 跨天源条不挂（避免 cell 内分段条重复圆圈）；overlay 克隆条允许
		if (rootEl.getAttribute && rootEl.getAttribute("data-tc-month-span") === "1") {
			var isOverlayBar = rootEl.classList && rootEl.classList.contains("tc-month-span-overlay-item");
			if (!isOverlayBar) { return; }
		}
		if (isMonthTaskRowElement(rootEl)) {
			var monthCircle = rootEl.querySelector(".tc-compact-checkbox[data-tc-compact-checkbox='1'], .noria-status-circle[data-noria-status-circle='1']");
			if (!monthCircle) {
				normalizeMonthTaskRowDom(rootEl, taskObj, typeCls);
				monthCircle = tcMakeNativeTaskCheckbox(taskObj, typeCls);
				var monthHost = rootEl.querySelector(".tc-status-slot") || rootEl.querySelector(".inner") || rootEl;
				try { monthHost.appendChild(monthCircle); } catch (_) {}
			}
			normalizeMonthTaskRowDom(rootEl, taskObj, typeCls);
			return;
		}
		var existing = rootEl.querySelector(".tc-compact-checkbox[data-tc-compact-checkbox='1'], .noria-status-circle[data-noria-status-circle='1']");
		if (existing) { return; }
		var circle = tcMakeNativeTaskCheckbox(taskObj, typeCls);
		if (!circle) { return; }
		var titleRowHost = rootEl.querySelector(".tc-title-row");
		if (titleRowHost) {
			var descInRow = titleRowHost.querySelector(".description, a.internal-link, .internal-link");
			if (descInRow && descInRow.parentNode === titleRowHost) {
				try { titleRowHost.insertBefore(circle, descInRow.nextSibling); } catch (_) { titleRowHost.appendChild(circle); }
			} else {
				try { titleRowHost.appendChild(circle); } catch (_) {}
			}
			return;
		}
		var desc = rootEl.querySelector(".description");
		if (desc && desc.parentNode) {
			desc.parentNode.insertBefore(circle, desc.nextSibling);
			return;
		}
		var link = rootEl.querySelector("a.internal-link, .internal-link");
		if (link && link.parentNode) {
			link.parentNode.insertBefore(circle, link.nextSibling);
			return;
		}
	} catch (_) {}
}

function tcFindBucketChild(hostEl, bucketClass) {
	if (!hostEl || !hostEl.children) return null;
	for (var bi = 0; bi < hostEl.children.length; bi++) {
		var ch = hostEl.children[bi];
		if (ch && ch.classList && ch.classList.contains(bucketClass)) return ch;
	}
	return null;
}

/**
 * 统计格内日程条：优先 data-tc-cal-item / ctx 标记；再 class；再 plannerChrome 桶（不用 :scope，避免环境差异）
 */
/** LP/metadata 偶发把节点建在与 cell 不同的 document；append 前先收养到宿主文档，避免静默丢节点 */
function tcEnsureNodeDocument(node, targetDoc) {
	if (!node || node.nodeType !== 1 || !targetDoc || typeof targetDoc.importNode !== "function") return node;
	try {
		var od = node.ownerDocument;
		if (od && od !== targetDoc) {
			return targetDoc.importNode(node, true);
		}
	} catch (_) {}
	return node;
}

function countCalItemsInHost(hostEl) {
	if (!hostEl || !hostEl.querySelectorAll) return 0;
	var n = hostEl.querySelectorAll('[data-tc-cal-item="1"]').length;
	if (n > 0) return n;
	n = hostEl.querySelectorAll(".tc-cal-item, .task, .tc-cal-item--ctx").length;
	if (n > 0) return n;
	var db = tcFindBucketChild(hostEl, "dayBucket");
	var tl = tcFindBucketChild(hostEl, "timeLane");
	if (db || tl) {
		var sum = 0;
		if (db) {
			var q = db.querySelectorAll('[data-tc-cal-item="1"]');
			if (q.length > 0) sum += q.length;
			else if (db.children && db.children.length) sum += db.children.length;
		}
		if (tl) {
			var q2 = tl.querySelectorAll('[data-tc-cal-item="1"]');
			if (q2.length > 0) sum += q2.length;
			else if (tl.children && tl.children.length) sum += tl.children.length;
		}
		return sum;
	}
	var acc = 0;
	for (var ci = 0; ci < hostEl.children.length; ci++) {
		var ch = hostEl.children[ci];
		if (!ch || ch.nodeType !== 1) continue;
		var cl = ch.classList;
		if (cl && (cl.contains("tc-cell-ph") || cl.contains("tc-cell-render-fallback"))) continue;
		if (cl && (cl.contains("dayBucket") || cl.contains("timeLane"))) continue;
		acc++;
	}
	return acc;
}

/**
 * LP 下由 HTML 字符串插入的 .cellContent 常被视作「静态子树」，向其 append 的节点（含 ctx.el 行）会被立刻剥掉。
 * 将整个 .cellContent 换成 ctx.el 容器后，再挂任务条，与 metadata 渲染同源，可显著减少「有数无条」。
 */
function upgradeCellContentToRuntimeBacked(cell, existingBox) {
	if (!cell || !existingBox || existingBox.nodeType !== 1) return existingBox;
	if (existingBox.getAttribute("data-tc-ctx-host") === "1") return existingBox;
	if (typeof ctx === "undefined" || !ctx || typeof ctx.el !== "function") return existingBox;
	var cls = String(existingBox.className || "").trim();
	if (!cls) cls = "cellContent";
	if (!/\bcellContent\b/.test(cls)) cls = (cls + " cellContent").trim();
	var dvBox = null;
	try {
		dvBox = ctx.el("div", "", {
			cls: cls + " tc-cell-ctx-host",
			attr: { "data-tc-ctx-host": "1" }
		});
	} catch (ex) {
		try { console.warn("[noria tasksCalendar] upgradeCellContentToRuntimeBacked ctx.el failed", ex); } catch (_) {}
		return existingBox;
	}
	if (!dvBox) return existingBox;
	var parent = existingBox.parentNode;
	if (!parent) return existingBox;
	try {
		parent.insertBefore(dvBox, existingBox);
		parent.removeChild(existingBox);
	} catch (err) {
		try { console.warn("[noria tasksCalendar] upgradeCellContentToRuntimeBacked replace failed", err); } catch (_) {}
		return existingBox;
	}
	return dvBox;
}

/**
 * LP/消毒器可能摘掉空的 .cellContent，导致 hydrate 永远跳过该格（querySelector 不到则 continue）
 */
function ensureCellContentHostForCell(cell) {
	if (!cell || cell.nodeType !== 1) return null;
	var doc = (cell.ownerDocument && cell.ownerDocument.createElement) ? cell.ownerDocument : getTasksCalendarDocument();
	var box = null;
	try {
		box = cell.querySelector(":scope > .cellContent");
	} catch (_) {
		box = null;
	}
	if (!box) {
		box = cell.querySelector(".cellContent");
	}
	if (box) return box;
	var nameEl = cell.querySelector(".cellName");
	try {
		if (typeof ctx !== "undefined" && ctx && typeof ctx.el === "function") {
			box = ctx.el("div", "", {
				cls: "cellContent tc-cell-ctx-host",
				attr: { "data-tc-ctx-host": "1" }
			});
			var ph = ctx.el("span", "\u200b", { cls: "tc-cell-ph", attr: { "aria-hidden": "true" } });
			if (box && ph) box.appendChild(ph);
		}
	} catch (_) {
		box = null;
	}
	if (!box) {
		box = doc.createElement("div");
		box.className = "cellContent";
		var ph2 = doc.createElement("span");
		ph2.className = "tc-cell-ph";
		ph2.setAttribute("aria-hidden", "true");
		ph2.textContent = "\u200b";
		box.appendChild(ph2);
	}
	try {
		if (nameEl && nameEl.parentNode === cell) {
			if (nameEl.nextSibling) {
				cell.insertBefore(box, nameEl.nextSibling);
			} else {
				cell.appendChild(box);
			}
		} else {
			cell.appendChild(box);
		}
	} catch (_) {
		try {
			cell.appendChild(box);
		} catch (__) {
			return null;
		}
	}
	return box;
}

function findCalendarCellByDate(gridEl, ymd) {
	if (!gridEl || !ymd) return null;
	var s = String(ymd).replace(/\\/g, "/");
	try {
		return gridEl.querySelector('.cell[data-date="' + s.replace(/"/g, "") + '"]');
	} catch (_) {
		return null;
	}
}

/** 月表：强制重灌若干 YYYY-MM-DD 格（源日+目标日），避免仅目标格更新、源日仍留幽灵条 */
function tcHydrateMonthCellsForDates(ymdList, opts) {
	if (!rootNode || rootNode.getAttribute("view") !== "month") return;
	opts = opts || {};
	var arr = Array.isArray(ymdList) ? ymdList : [];
	if (!arr.length) return;
	var grid = null;
	try {
		grid = rootNode.querySelector(":scope > .grid");
	} catch (_) {
		grid = null;
	}
	if (!grid) {
		try {
			grid = rootNode.querySelector(".grid");
		} catch (_) {
			grid = null;
		}
	}
	if (!grid) return;
	var plannerChrome = false;
	var seen = Object.create(null);
	for (var i = 0; i < arr.length; i++) {
		var d = String(arr[i] || "").trim();
		if (!d || seen[d]) continue;
		seen[d] = true;
		var cell = findCalendarCellByDate(grid, d);
		if (!cell) continue;
		var box = cell.querySelector(".cellContent");
		if (!box) {
			try {
				box = ensureCellContentHostForCell(cell);
			} catch (_) {
				box = null;
			}
		}
		if (!box) continue;
		try {
			box = upgradeCellContentToRuntimeBacked(cell, box);
		} catch (_) {}
		try {
			renderTasksIntoHost(box, d, plannerChrome);
		} catch (eH) {
			try {
				console.warn("[noria tasksCalendar] tcHydrateMonthCellsForDates failed", d, eH);
			} catch (_) {}
		}
	}
	commitMonthLayout(grid, { reason: "tcHydrateMonthCellsForDates", revision: Number(opts.revision || 0) });
}

/**
 * innerHTML 挂上的 .cell 在 Live Preview 中常被整体标记为「不可变」子树，只换 .cellContent 仍挂在 parser 节点下，任务条会被剥掉。
 * 用 ctx.el 按原 data-date / class / 日记链接重建整格，使挂载链与顶栏 tasksCalendar 根一致。
 */
function upgradeCalendarCellToRuntimeTree(oldCell) {
	if (!oldCell || oldCell.nodeType !== 1) return oldCell;
	if (oldCell.getAttribute("data-tc-cell-ctx") === "1") return oldCell;
	if (typeof ctx === "undefined" || !ctx || typeof ctx.el !== "function") return oldCell;
	var parent = oldCell.parentNode;
	if (!parent) return oldCell;
	var dateStr = oldCell.getAttribute("data-date") || "";
	var weekdayStr = oldCell.getAttribute("data-weekday") || "";
	var cls = String(oldCell.className || "").trim();
	var nameA = null;
	try {
		nameA = oldCell.querySelector(":scope > a.cellName");
	} catch (_) {
		nameA = null;
	}
	if (!nameA) nameA = oldCell.querySelector("a.cellName");
	var href = "";
	var linkText = "";
	if (nameA) {
		href = nameA.getAttribute("href") || nameA.getAttribute("data-href") || "";
		linkText = String(nameA.textContent || "").trim();
	}
	var newCell = null;
	try {
		newCell = ctx.el("div", "", {
			cls: cls || "cell",
			attr: {
				"data-date": dateStr,
				"data-weekday": weekdayStr,
				"data-tc-cell-ctx": "1"
			}
		});
	} catch (e) {
		try { console.warn("[noria tasksCalendar] upgradeCalendarCellToRuntimeTree ctx.el cell failed", e); } catch (_) {}
		return oldCell;
	}
	if (!newCell) return oldCell;
	try {
		if (href) {
			var safeHref = String(href).replace(/\\/g, "/");
			var linkEl = ctx.el("a", linkText, {
				cls: "internal-link cellName",
				attr: { href: safeHref, "data-href": safeHref }
			});
			if (linkEl) newCell.appendChild(linkEl);
		}
		var cellContent = ctx.el("div", "", {
			cls: "cellContent tc-cell-ctx-host",
			attr: { "data-tc-ctx-host": "1" }
		});
		if (cellContent) {
			var ph = ctx.el("span", "\u200b", { cls: "tc-cell-ph", attr: { "aria-hidden": "true" } });
			if (ph) cellContent.appendChild(ph);
			newCell.appendChild(cellContent);
		}
		parent.replaceChild(newCell, oldCell);
	} catch (err) {
		try { console.warn("[noria tasksCalendar] upgradeCalendarCellToRuntimeTree replace failed", dateStr, err); } catch (_) {}
		return oldCell;
	}
	return newCell;
}

/** metadata 任务行号：用于同日列表内「较新行优先」tie-break */
function getTaskSourceLine(task) {
	if (!task) return -1;
	try {
		if (task.position && task.position.start != null && typeof task.position.start.line === "number") {
			return task.position.start.line;
		}
	} catch (_) {}
	if (typeof task.line === "number" && Number.isFinite(task.line)) return task.line;
	var p = parseInt(String(task.line || "").trim(), 10);
	return Number.isFinite(p) ? p : -1;
}

function hoistMonthWeekCellsToRuntimeTree(gridEl) {
	var v = rootNode && rootNode.getAttribute("view");
	if (v !== "month" && v !== "week" && v !== "day") return;
	if (!gridEl || typeof ctx === "undefined" || !ctx || typeof ctx.el !== "function") return;
	try {
		var arr = Array.prototype.slice.call(gridEl.querySelectorAll(".cell[data-date]"));
		for (var hi = 0; hi < arr.length; hi++) {
			var oc = arr[hi];
			if (!oc || oc.getAttribute("data-tc-cell-ctx") === "1") continue;
			try {
				upgradeCalendarCellToRuntimeTree(oc);
			} catch (_) {}
		}
	} catch (_) {}
}

function renderTasksIntoHost(hostEl, currentDate, forcePlannerChromeWeek) {
	if (!hostEl) return;
	// Share note facts only within this synchronous render; later renders read
	// current properties again, including newly added or removed colors/icons.
	var notePages = new Map();
	/* hydrate 时必须先按当日刷新全局分组；否则仍停留在网格构建循环里最后一次 getTasks 的状态，易导致「统计有数、格子全空」 */
	getTasksViaAdapter(currentDate);
	/* 与被灌入的格子属同一 ownerDocument，避免嵌入/LP 下跨文档节点 append 静默失败 */
	var doc = (hostEl.ownerDocument && hostEl.ownerDocument.createElement) ? hostEl.ownerDocument : getTasksCalendarDocument();
	var plannerChromeWeek = (typeof forcePlannerChromeWeek === "boolean")
		? forcePlannerChromeWeek
		: isPlannerChromeActive(rootNode, ["week", "day"]);
	while (hostEl.firstChild) {
		hostEl.removeChild(hostEl.firstChild);
	}
	try {
		hostEl.removeAttribute("data-tc-span-relocated");
	} catch (_) {}
	/* 与 cellTemplate 一致：留零宽占位；优先 ctx.el 与格容器同源，减轻 LP 剥子树 */
	if (!plannerChromeWeek) {
		var isMonthForSpacer = (rootNode.getAttribute("view") === "month");
		if (isMonthForSpacer) {
			var spacer = doc.createElement("span");
			spacer.className = "tc-month-reserve-spacer";
			spacer.setAttribute("aria-hidden", "true");
			hostEl.appendChild(spacer);
		}
		var ph0 = null;
		if (typeof ctx !== "undefined" && ctx && typeof ctx.el === "function") {
			try {
				ph0 = ctx.el("span", "\u200b", { cls: "tc-cell-ph", attr: { "aria-hidden": "true" } });
			} catch (_) {
				ph0 = null;
			}
		}
		if (!ph0) {
			ph0 = doc.createElement("span");
			ph0.className = "tc-cell-ph";
			ph0.setAttribute("aria-hidden", "true");
			ph0.textContent = "\u200b";
		}
		hostEl.appendChild(ph0);
	}
	var renderedTaskKeys = new Set();
	var dayBucketEl = null;
	var timeLaneEl = null;
	if (plannerChromeWeek) {
		if (typeof ctx !== "undefined" && ctx && typeof ctx.el === "function") {
			try {
				dayBucketEl = ctx.el("div", "", { cls: "dayBucket" });
				timeLaneEl = ctx.el("div", "", { cls: "timeLane" });
			} catch (_) {
				dayBucketEl = null;
				timeLaneEl = null;
			}
		}
		if (!dayBucketEl || !timeLaneEl) {
			dayBucketEl = doc.createElement("div");
			dayBucketEl.className = "dayBucket";
			timeLaneEl = doc.createElement("div");
			timeLaneEl.className = "timeLane";
		}
		hostEl.appendChild(dayBucketEl);
		hostEl.appendChild(timeLaneEl);
	}
	/* plannerChrome：dayBucket 跨桶统一排序后再挂载（非 #tl 全局在前） */
	var dayBucketPlan = plannerChromeWeek ? [] : null;
	var outsideHours = new Map();
	function compareDayBucketPlanEntry(x, y) {
		var xTl = isTimelineTaggedTask(x.task) ? 1 : 0;
		var yTl = isTimelineTaggedTask(y.task) ? 1 : 0;
		if (xTl !== yTl) { return xTl - yTl; }
		var xTime = Number(x.task && x.task.timeSort);
		var yTime = Number(y.task && y.task.timeSort);
		if (!Number.isFinite(xTime)) { xTime = Number.POSITIVE_INFINITY; }
		if (!Number.isFinite(yTime)) { yTime = Number.POSITIVE_INFINITY; }
		if (xTime !== yTime) { return xTime - yTime; }
		var xp = String((x.task && x.task.priority) || "C").toUpperCase();
		var yp = String((y.task && y.task.priority) || "C").toUpperCase();
		if (xp < yp) return -1;
		if (xp > yp) return 1;
		var xt = String((x.task && x.task.text) || "").toUpperCase();
		var yt = String((y.task && y.task.text) || "").toUpperCase();
		if (xt < yt) return -1;
		if (xt > yt) return 1;
		var xl = getTaskSourceLine(x.task);
		var yl = getTaskSourceLine(y.task);
		if (xl !== yl) { return yl - xl; }
		return 0;
	}
	var appendedRows = 0;
	function compareFn(a, b) {
		var aTime = Number(a && a.timeSort);
		var bTime = Number(b && b.timeSort);
		if (!Number.isFinite(aTime)) aTime = Number.POSITIVE_INFINITY;
		if (!Number.isFinite(bTime)) bTime = Number.POSITIVE_INFINITY;
		if (aTime != bTime) {
			return aTime - bTime;
		}
		var ap = String(a.priority || "C").toUpperCase();
		var bp = String(b.priority || "C").toUpperCase();
		if (ap < bp) return -1;
		if (ap > bp) return 1;
		var at = String(a.text || "").toUpperCase();
		var bt = String(b.text || "").toUpperCase();
		if (at < bt) return -1;
		if (at > bt) return 1;
		var al = getTaskSourceLine(a);
		var bl = getTaskSourceLine(b);
		if (al !== bl) { return al - bl; }
		return String(getTaskKey(a)).localeCompare(String(getTaskKey(b)));
	}
	function showTasks(tasksToShow, typ) {
		if (!tasksToShow || !tasksToShow.length) return;
		var sorted;
		try {
			sorted = tasksToShow.slice().sort(compareFn);
		} catch (sortErr) {
			try { console.warn("[noria tasksCalendar] showTasks sort failed, use raw order", typ, sortErr); } catch (_) {}
			sorted = tasksToShow.slice();
		}
		for (var t = 0; t < sorted.length; t++) {
			if (!isRenderableTaskRow(sorted[t], typ)) { continue; }
			/*
			 * 默认允许跨桶展示（key 含 typ）；
			 * 但 #tl/#timeline 事项以「时间块」为主语义，不应因 due/start/scheduled 多字段并列重复渲染。
			 */
			var baseTaskKey = getTaskKey(sorted[t]);
			var isTimelineTask = isTimelineTaggedTask(sorted[t]);
			var slotEarly = getTaskTimeSlot(sorted[t], typ, currentDate);
			// An interval ending at midnight occupies no time on its ending date.
			if (plannerChromeWeek && slotEarly.slotType === "range" && Number(slotEarly.endMin) <= Number(slotEarly.startMin)) { continue; }
			/* 周 plannerChrome 时段：同一笔记行因 due/start/scheduled 等多桶重复出现时只渲染一次，避免并列重影 */
			var isMonthGrid = (rootNode.getAttribute("view") === "month");
			if (isMonthGrid && shouldSkipMonthTaskRender(sorted[t], typ)) {
				continue;
			}
			var monthRole = isMonthGrid ? normalizeMonthTaskRole(sorted[t], currentDate) : "none";
			if (isMonthGrid && monthRole === "none") { continue; }
			var taskKey;
			if (plannerChromeWeek && slotEarly.slotType != "none") {
				var syK = coerceTemporalToYmd(sorted[t].start);
				var eyK = coerceTemporalToYmd(sorted[t].due);
				if (syK && eyK && syK !== eyK && sorted[t].startTime && sorted[t].dueTime
					&& sorted[t].start && taskDateSameDay(sorted[t].start, currentDate)
					&& !(sorted[t].due && taskDateSameDay(sorted[t].due, currentDate))) {
					taskKey = baseTaskKey + "\0plannerTime\0cross\0" + syK + "\0" + eyK;
				} else {
					taskKey = baseTaskKey + "\0plannerTime\0" + String(currentDate) + "\0" + String(slotEarly.startMin) + "\0" + String(slotEarly.endMin);
				}
			} else if (plannerChromeWeek) {
				/* 无时段：同日多桶（due/start/scheduled…）只保留一条，避免任务面板重复 */
				taskKey = baseTaskKey + "\0plannerDay\0" + String(currentDate);
			} else if (isTimelineTask) {
				taskKey = baseTaskKey;
			} else if (isMonthGrid) {
				/* 月表：同日多桶（due/start/scheduled/dailyNote…）只保留一条，与周 plannerChrome dayBucket 一致，避免双条 */
				taskKey = baseTaskKey + "\0monthDay\0" + String(currentDate) + "\0role\0" + monthRole;
			} else {
				taskKey = baseTaskKey + "\0" + String(typ);
			}
			if (renderedTaskKeys.has(taskKey)) continue;
			if (plannerChromeWeek && slotEarly.slotType != "none") {
				var edge = classifyPlannerHoursSlot(slotEarly, plannerActiveHours.start, plannerActiveHours.end);
				var entry = { task: sorted[t], typ: typ, date: currentDate };
				if (edge.before || edge.after) outsideHours.set(baseTaskKey, entry);
				if (classifyPlannerHoursSlot(slotEarly, getPlannerChromeTimelineStartMin(), getPlannerChromeTimelineEndMin()).outside) {
					renderedTaskKeys.add(taskKey);
					continue;
				}
			}
			if (plannerChromeWeek && slotEarly.slotType == "none") {
				if (dayBucketPlan) {
					dayBucketPlan.push({ task: sorted[t], node: null, typ: typ });
				}
				renderedTaskKeys.add(taskKey);
				continue;
			}
			var slot = slotEarly;
			var node = buildTaskElement(
				sorted[t],
				typ,
				currentDate,
				doc,
				{ monthView: isMonthGrid, notePages: notePages }
			);
			if (!node) continue;
			node = tcEnsureNodeDocument(node, doc);
			if (isTimelineTask) {
				node.setAttribute("data-timeline-tagged", "1");
			}
			if (!plannerChromeWeek) {
				if (rootNode.getAttribute("view") === "month") {
					tcEnsureCalItemTemporalAttrs(node, sorted[t]);
				}
				hostEl.appendChild(node);
				appendedRows++;
				renderedTaskKeys.add(taskKey);
				continue;
			}
			/* 有明确时段（range/point）的任务一律进 timeLane，与是否 #tl 无关；仅无时段或全日 #tl 进 dayBucket */
			var isDayTask = !!sorted[t].isTimelineDay || slot.slotType == "none";
			if (isDayTask) {
				if (dayBucketPlan) {
					dayBucketPlan.push({ task: sorted[t], node: node, typ: typ });
			} else {
				dayBucketEl.appendChild(node);
				}
			} else {
				timeLaneEl.appendChild(node);
			}
			appendedRows++;
			renderedTaskKeys.add(taskKey);
		}
	}
	if (tToday == currentDate) {
		showTasks(overdue, "overdue");
	}
	showTasks(due, "due");
	showTasks(recurrence, "recurrence");
	showTasks(start, "start");
	showTasks(scheduled, "scheduled");
	showTasks(process, "process");
	showTasks(dailyNote, "dailyNote");
	showTasks(done, "done");
	showTasks(cancelled, "cancelled");
	if (plannerChromeWeek && !showEarlyHours && (plannerActiveHours.start > 0 || plannerActiveHours.end < 1440)) {
		hostEl.insertBefore(buildPlannerHoursBoundary(outsideHours, currentDate, doc), timeLaneEl);
		var hoursGrid = hostEl.closest('.grid');
		if (hoursGrid) hoursGrid.classList.toggle('has-hours-boundary', !!hoursGrid.querySelector('.tc-hours-boundary button'));
	}
	if (dayBucketPlan && dayBucketPlan.length) {
		try {
			dayBucketPlan.sort(compareDayBucketPlanEntry);
		} catch (sortDb) {
			try { console.warn("[noria tasksCalendar] dayBucketPlan sort failed", sortDb); } catch (_) {}
		}
		rememberPlannerChromeWaitingEntriesForDate(currentDate, dayBucketPlan);
		var waitingRendered = renderPlannerChromeWaitingHostForDate(currentDate, dayBucketPlan, hostEl, dayBucketEl);
		if (arePlannerChromeWaitingRowsEnabled()) {
			appendedRows -= Math.max(0, dayBucketPlan.length - waitingRendered);
		}
	} else if (plannerChromeWeek) {
		rememberPlannerChromeWaitingEntriesForDate(currentDate, []);
		renderPlannerChromeWaitingHostForDate(currentDate, [], hostEl, dayBucketEl);
	}
	/*
	 * 第一性自检口径必须与真实渲染一致：
	 * - 旧口径用各桶简单求和（due/start/scheduled/process...），会把同一任务跨桶重复计入；
	 * - 新口径使用 appendedRows（已通过 taskKey 去重且成功 append 的节点数），避免出现“1项未能显示”的假阳性。
	 */
	var rawExpect = Math.max(0, appendedRows);
	try {
		hostEl.setAttribute("data-tc-last-appended", String(appendedRows));
	} catch (_) {}
	var actual = countCalItemsInHost(hostEl);
	/* plannerChrome 的等待区由独立 host 管理，不在本格挂载可见任务条。 */
	if (plannerChromeWeek && rawExpect > 0 && actual === 0) {
		return;
	}
	actual = countCalItemsInHost(hostEl);
	function mountFallback() {
		if (rootNode.getAttribute("view") === "month" && hostEl.getAttribute("data-tc-span-relocated") === "1") { return; }
		if (hostEl.querySelector(".tc-cell-render-fallback")) return;
		var fb = doc.createElement("div");
		fb.className = "tc-cell-render-fallback";
		fb.setAttribute("role", "status");
		fb.setAttribute("aria-live", "polite");
		fb.setAttribute("data-date", String(currentDate || ""));
		fb.textContent = tcRuntimeT("runtime.tasksCalendar.notice.visibleFallback", { count: rawExpect });
		fb.title = tcRuntimeT("runtime.tasksCalendar.notice.visibleFallbackTitle");
		hostEl.appendChild(fb);
	}
	function stripFallbackIfRendered() {
		hostEl.querySelectorAll(".tc-cell-render-fallback").forEach(function (x) {
			try { x.remove(); } catch (_) {}
		});
	}
	function reconcileFallback() {
		if (rootNode.getAttribute("view") === "month" && hostEl.getAttribute("data-tc-span-relocated") === "1") {
			stripFallbackIfRendered();
			return;
		}
		var aN = countCalItemsInHost(hostEl);
		if (rawExpect > 0 && aN === 0) {
			mountFallback();
		} else if (aN > 0) {
			stripFallbackIfRendered();
		}
	}
	if (rawExpect > 0 && actual === 0) {
		mountFallback();
	}
	/* LP/metadata 可能在多帧内改写 DOM：双 rAF 再 reconcile，减少误报 / 漏报 琥珀 */
	try {
		requestAnimationFrame(function () {
			reconcileFallback();
			requestAnimationFrame(function () {
				reconcileFallback();
			});
		});
	} catch (_) {}
}

function resolveHydrationGrid(gridEl) {
	/* 曾仅用 isConnected 判定：metadata/LP 下 root 可能晚几帧才进文档，grid 在内存中已存在但 isConnected=false，导致整次 hydrate 被跳过（统计有数、格子永远空）。 */
	if (gridEl && gridEl.isConnected) return gridEl;
	try {
		var live = rootNode && rootNode.querySelector ? rootNode.querySelector(":scope > .grid") : null;
		if (live) return live;
	} catch (_) {}
	return gridEl || null;
}

function hydrateGridTaskCells(gridEl) {
	if (deferHydrationIfInteracting(gridEl)) return;
	gridEl = resolveHydrationGrid(gridEl);
	if (!gridEl) return;
	if (!rootNode || !rootNode.isConnected || !gridEl.isConnected) return;
	var focusedOverflow = gridEl.ownerDocument.activeElement;
	var overflowFocus = gridEl.contains(focusedOverflow) && focusedOverflow?.matches(".tc-overflow-more")
		? { date: focusedOverflow.closest(".cell").getAttribute("data-date"), start: focusedOverflow._tcOverflowSummary.start } : null;
	hoistMonthWeekCellsToRuntimeTree(gridEl);
	var isWk = (rootNode.getAttribute("view") == "week" || rootNode.getAttribute("view") == "day");
	var plannerChrome = isWk && isPlannerChromeTimelineView(rootNode, ["week", "day"]);
	preparePlannerChromeWaitingLayer(gridEl, plannerChrome);
	var cells = gridEl.querySelectorAll(".cell[data-date]");
	var hydrationComplete = true;
	for (var ci = 0; ci < cells.length; ci++) {
		var cell = cells[ci];
		var d = cell.getAttribute("data-date");
		var box = cell.querySelector(".cellContent");
		if (!box && d) {
			try {
				box = ensureCellContentHostForCell(cell);
			} catch (_) {}
		}
		if (!box || !d) { hydrationComplete = false; continue; }
		try {
			box = upgradeCellContentToRuntimeBacked(cell, box);
		} catch (_) {}
		try {
			renderTasksIntoHost(box, d, plannerChrome);
		} catch (hydrErr) {
			hydrationComplete = false;
			console.error("[noria tasksCalendar] hydrate cell failed", d, hydrErr);
		}
	}
	if (plannerChrome) {
		try { syncPlannerChromeDayBucketPeekVar(rootNode); } catch (_) {}
		try { enforcePlannerChromeWeekGridLayout(); } catch (_) {}
		try { applyPlannerChromeTimelineAxis(); } catch (_) {}
	}
	try {
		var totalTasks = gridEl.querySelectorAll('[data-tc-cal-item="1"]').length;
		var metaLen = tasks && tasks.length ? tasks.length : 0;
		rootNode.setAttribute("data-tc-hydrate-cells", String(cells.length));
		rootNode.setAttribute("data-tc-hydrate-tasks", String(totalTasks));
		rootNode.setAttribute("data-tc-meta-tasks", String(metaLen));
		if (metaLen > 0 && totalTasks === 0 && (rootNode.getAttribute("view") === "month" || rootNode.getAttribute("view") === "week" || rootNode.getAttribute("view") === "day")) {
			console.warn("[noria tasksCalendar] 元数据中有任务但网格内 0 条：若为 LP，可切换阅读模式或稍后重试；也可看上方 rootConnected / data-tc-* 属性。");
			try {
	rootNode.title = tcRuntimeT("runtime.tasksCalendar.notice.gridMissingTitle", { count: metaLen });
			} catch (_) {}
		} else {
			try {
				rootNode.removeAttribute("title");
			} catch (_) {}
		}
	} catch (_) {}
	if (plannerChrome) {
		// Resolve widths in this frame, before fresh full-width nodes can be painted.
		try { normalizePlannerChromeWeekTaskGeometry(); applyPlannerChromeOverlapLayout(); } catch (_) {}
		if (overflowFocus) focusPlannerOverflow(overflowFocus.date, overflowFocus.start);
		try { schedulePlannerChromeWeekLanesFinalize(true); } catch (_) {}
		try { schedulePlannerChromeWeekLanesFinalizePost(true); } catch (_) {}
		try { schedulePlannerChromeOverlapLayout(); } catch (_) {}
	}
	/* 月表任务条在异步 hydrate 之后才出现；此前 scheduleMonthTaskDragBind 会绑到空网格，必须在灌入后重绑 */
	if (rootNode && rootNode.getAttribute("view") === "month") {
		commitMonthLayout(gridEl, "hydrateGridTaskCells");
	}
	gridEl._noriaTaskCellsHydrated = hydrationComplete;
}

/** metadata / 预览画布有时会晚一帧改写外层布局；延迟再灌一次 DOM，避免「统计有数、格子无条」 */
var tcVisibleIo = null;
var tcVisibleIoExpiryTimer = null;
var tcCellMo = null;
var tcMoDebounceTimer = null;
var tcCellMoBound = false;
var tcWakeHydrationTimer = null;
var tcWakeHydrationHandler = null;
var tcWakeVisibilityHandler = null;
/** LP/metadata 可能在灌入后再剥 cellContent：防抖重灌当前格（避免与 render 死磕同一帧） */
function bindTasksCalendarCellContentObserver() {
	if (tcCellMoBound || typeof MutationObserver === "undefined" || !rootNode) return;
	tcCellMoBound = true;
	try {
		tcCellMo = new MutationObserver(function (muts) {
			if (!muts || !muts.length) return;
			if (plannerChromeInteractionActive) {
				deferHydrationIfInteracting(null);
				return;
			}
			if (tcMoDebounceTimer) clearTimeout(tcMoDebounceTimer);
			tcMoDebounceTimer = setTimeout(function () {
				tcMoDebounceTimer = null;
				var g = null;
				try {
					g = rootNode.querySelector(":scope > .grid");
				} catch (_) {
					g = rootNode.querySelector(".grid");
				}
				if (!g || !g.isConnected) return;
				var isWk = (rootNode.getAttribute("view") == "week" || rootNode.getAttribute("view") == "day");
				var plannerChrome = isWk && isPlannerChromeActive(rootNode, ["week", "day"]);
				var seen = Object.create(null);
				var rehydrated = false;
				for (var mi = 0; mi < muts.length; mi++) {
					var mu = muts[mi];
					var tgt = mu.target;
					if (!tgt || tgt.nodeType !== 1) continue;
					var affectsMonthSpan = false;
					if (rootNode.getAttribute("view") === "month") {
						try {
							// 月表跨天源段（或其克隆）变化：强制允许重灌，即便 cellContent 已有其它任务
							if (tgt.matches && tgt.matches(".tc-month-span-overlay-item")) { affectsMonthSpan = true; }
							if (!affectsMonthSpan && tgt.closest) {
								var c1 = tgt.closest(".tc-cal-item[data-tc-month-span='1'], [data-tc-cal-item='1'][data-tc-month-span='1']");
								var c2 = tgt.closest(".tc-month-span-overlay-item");
								if (c1 || c2) { affectsMonthSpan = true; }
							}
							// added/removed 节点也可能直接携带 span 标记
							var checkNodes = function (nl) {
								if (affectsMonthSpan || !nl || !nl.length) return;
								for (var ni = 0; ni < nl.length; ni++) {
									var nn = nl[ni];
									if (!nn || nn.nodeType !== 1) continue;
									if (nn.matches && (nn.matches(".tc-month-span-overlay-item") || nn.matches(".tc-cal-item[data-tc-month-span='1'], [data-tc-cal-item='1'][data-tc-month-span='1']"))) { affectsMonthSpan = true; break; }
									if (nn.querySelector) {
										try {
											if (nn.querySelector(".tc-month-span-overlay-item, .tc-cal-item[data-tc-month-span='1'], [data-tc-cal-item='1'][data-tc-month-span='1']")) { affectsMonthSpan = true; break; }
										} catch (_) {}
									}
								}
							};
							checkNodes(mu.addedNodes);
							checkNodes(mu.removedNodes);
						} catch (_) {}
					}
					var box = typeof tgt.closest === "function" ? tgt.closest(".cellContent") : null;
					if (!box && tgt.matches && tgt.matches(".cell[data-date]")) {
						try {
							var dkMo0 = tgt.getAttribute("data-date") || "";
							if (tgt.getAttribute("data-tc-cell-ctx") !== "1") upgradeCalendarCellToRuntimeTree(tgt);
							var cellMo0 = dkMo0 ? findCalendarCellByDate(g, dkMo0) : null;
							box = cellMo0 ? cellMo0.querySelector(".cellContent") : null;
						} catch (_) {}
					}
					if (!box && mu.type === "childList" && mu.removedNodes && mu.removedNodes.length) {
						for (var ri = 0; ri < mu.removedNodes.length; ri++) {
							var rn = mu.removedNodes[ri];
							if (!rn || rn.nodeType !== 1 || !rn.classList || !rn.classList.contains("cellContent")) continue;
							var pc = tgt.matches && tgt.matches(".cell[data-date]")
								? tgt
								: (typeof tgt.closest === "function" ? tgt.closest(".cell[data-date]") : null);
							if (pc) {
								try {
									var dkMo1 = pc.getAttribute("data-date") || "";
									if (pc.getAttribute("data-tc-cell-ctx") !== "1") upgradeCalendarCellToRuntimeTree(pc);
									var cellMo1 = dkMo1 ? findCalendarCellByDate(g, dkMo1) : null;
									box = cellMo1 ? cellMo1.querySelector(".cellContent") : null;
								} catch (_) {}
							}
							break;
						}
					}
					if (!box || !rootNode.contains(box)) continue;
					var cell = box.closest(".cell[data-date]");
					if (!cell) continue;
					var dkey = cell.getAttribute("data-date") || "";
					if (!dkey || seen[dkey]) continue;
					if (cell.getAttribute("data-tc-cell-ctx") !== "1") {
						try {
							upgradeCalendarCellToRuntimeTree(cell);
							cell = findCalendarCellByDate(g, dkey);
							if (!cell) continue;
							box = cell.querySelector(".cellContent");
							if (!box || !rootNode.contains(box)) continue;
						} catch (_) {}
					}
					try {
						box = upgradeCellContentToRuntimeBacked(cell, box);
					} catch (_) {}
					/* v0.5 Phase C 第三轮：MO 不再无条件跳过 relocate 格，否则 metadata 异步把同任务 DOM
					 * 再追加进来时只能等下次切视图才能清掉，端日重复条复发。
					 * 改为：先跑一次轻量 path+line dedupe（不重灌、不闪烁），再交由后续 commitMonthLayout 刷新 overlay。
					 * 这样既保住 overlay 不抖动（不进入 renderTasksIntoHost），又能即时收掉幽灵条。 */
					var isMonthMoStep = rootNode.getAttribute("view") === "month";
					if (isMonthMoStep) {
						try { dedupeMonthCellTasks(box); } catch (_) {}
					}
					if (isMonthMoStep && box.getAttribute("data-tc-span-relocated") === "1") continue;
					// 跨周编辑/跨天任务移动时，destination/source 可能都是非空 cellContent；
					// 若本次 mutation 牵涉 month-span/overlay，应允许重灌以更新 overlay 几何（否则需要切视图才恢复）。
					if (!affectsMonthSpan && countCalItemsInHost(box) > 0) continue;
					var lastTs = parseInt(box.getAttribute("data-tc-mo-ts") || "0", 10);
					var minGap = box.querySelector(".tc-cell-render-fallback") ? 420 : 100;
					if (Date.now() - lastTs < minGap) continue;
					seen[dkey] = true;
					// Most mutations come from our own title/checkbox layout. Query
					// the source only when this cell actually needs repair, once per batch.
					var exp = sumBucketExpectForDate(dkey);
					if (exp <= 0) continue;
					box.setAttribute("data-tc-mo-ts", String(Date.now()));
					try {
						renderTasksIntoHost(box, dkey, plannerChrome);
						rehydrated = true;
					} catch (re) {
						console.error("[noria tasksCalendar] MutationObserver rehydrate failed", dkey, re);
					}
				}
				if (rootNode.getAttribute("view") === "month") {
					commitMonthLayout(g, "monthMutationObserver");
				}
				// Layout rebuilds waiting hosts and time labels, which this observer
				// also sees. Only an actual repair needs another layout pass.
				if (plannerChrome && rehydrated) {
					try { schedulePlannerChromeWeekLanesFinalize(true); } catch (_) {}
					try { schedulePlannerChromeWeekLanesFinalizePost(true); } catch (_) {}
					try { schedulePlannerChromeOverlapLayout(); } catch (_) {}
				}
			}, 56);
		});
		tcCellMo.observe(rootNode, { subtree: true, childList: true });
	} catch (e) {
		tcCellMoBound = false;
		try { console.warn("[noria tasksCalendar] cell MutationObserver not available", e); } catch (_) {}
	}
}

function bindTasksCalendarIntersectionHydrate() {
	if (tcRuntimeDisposed) return;
	if (!rootNode || rootNode.getAttribute("data-tc-visible-io") === "1") return;
	if (typeof IntersectionObserver === "undefined") return;
	rootNode.setAttribute("data-tc-visible-io", "1");
	var initialNotification = true;
	try {
		tcVisibleIo = new IntersectionObserver(function (entries) {
			if (!rootNode || !rootNode.isConnected) {
				try { if (tcVisibleIo) tcVisibleIo.disconnect(); } catch (_) {}
				tcVisibleIo = null;
				return;
			}
			for (var i = 0; i < entries.length; i++) {
				var initial = initialNotification;
				initialNotification = false;
				if (!entries[i].isIntersecting) continue;
				if (plannerChromeInteractionActive) {
					deferHydrationIfInteracting(null);
					return;
				}
				var g = null;
				try {
					g = rootNode.querySelector(":scope > .grid");
				} catch (_) {}
				if (g && !(initial && g._noriaTaskCellsHydrated)) hydrateGridTaskCells(g);
				return;
			}
		}, { threshold: 0.02, rootMargin: "140px 0px 140px 0px" });
		tcVisibleIo.observe(rootNode);
		if (tcVisibleIoExpiryTimer) { clearTimeout(tcVisibleIoExpiryTimer); }
		tcVisibleIoExpiryTimer = setTimeout(function () {
			tcVisibleIoExpiryTimer = null;
			try {
				if (tcVisibleIo) tcVisibleIo.disconnect();
				tcVisibleIo = null;
			} catch (_) {}
		}, 120000);
	} catch (_) {}
}

function clearTasksCalendarWakeHydration() {
	if (tcWakeHydrationTimer) {
		try { clearTimeout(tcWakeHydrationTimer); } catch (_) {}
		tcWakeHydrationTimer = null;
	}
	try {
		if (tcWakeVisibilityHandler && typeof document !== "undefined") {
			document.removeEventListener("visibilitychange", tcWakeVisibilityHandler, true);
		}
	} catch (_) {}
	try {
		if (tcWakeHydrationHandler && typeof window !== "undefined") {
			window.removeEventListener("focus", tcWakeHydrationHandler, true);
			window.removeEventListener("pageshow", tcWakeHydrationHandler, true);
			window.removeEventListener("resize", tcWakeHydrationHandler);
		}
	} catch (_) {}
	tcWakeVisibilityHandler = null;
	tcWakeHydrationHandler = null;
	try { if (rootNode) rootNode.removeAttribute("data-tc-wake-bound"); } catch (_) {}
}

function hydrateGridWhenReady(gridEl, retryCount) {
	var attempt = Number.isFinite(retryCount) ? retryCount : 0;
	if (!rootNode || !rootNode.isConnected) { return; }
	var g = resolveHydrationGrid(gridEl);
	if (!g) { return; }
	if (!g.isConnected && attempt < 8) {
		setTimeout(function () {
			hydrateGridWhenReady(g, attempt + 1);
		}, 120 + attempt * 120);
		return;
	}
	var rootRect = null;
	var gridRect = null;
	try {
		rootRect = rootNode && rootNode.getBoundingClientRect ? rootNode.getBoundingClientRect() : null;
		gridRect = g.getBoundingClientRect ? g.getBoundingClientRect() : null;
	} catch (_) {}
	var rootW = rootRect ? rootRect.width : 0;
	var rootH = rootRect ? rootRect.height : 0;
	var gridW = gridRect ? gridRect.width : 0;
	var gridH = gridRect ? gridRect.height : 0;
	var ready = !!(rootNode && rootNode.isConnected) && rootW >= 180 && rootH >= 120 && gridW >= 160 && gridH >= 100;
	if (!ready && attempt < 8) {
		setTimeout(function () {
			hydrateGridWhenReady(g, attempt + 1);
		}, 120 + attempt * 120);
		return;
	}
	hydrateGridTaskCells(g);
}

function bindTasksCalendarWakeHydration(gridEl) {
	if (tcRuntimeDisposed) { return; }
	if (!rootNode || rootNode.getAttribute("data-tc-wake-bound") === "1") { return; }
	rootNode.setAttribute("data-tc-wake-bound", "1");
	tcWakeHydrationHandler = function () {
		if (!rootNode || !rootNode.isConnected) { return; }
		if (tcWakeHydrationTimer) { clearTimeout(tcWakeHydrationTimer); }
		tcWakeHydrationTimer = setTimeout(function () {
			tcWakeHydrationTimer = null;
			if (tcRuntimeDisposed) { return; }
			if (!rootNode || !rootNode.isConnected) { return; }
			hydrateGridWhenReady(gridEl, 0);
		}, 90);
	};
	tcWakeVisibilityHandler = function () {
		if (document.visibilityState === "visible" && tcWakeHydrationHandler) { tcWakeHydrationHandler(); }
	};
	try {
		document.addEventListener("visibilitychange", tcWakeVisibilityHandler, true);
	} catch (_) {}
	try { window.addEventListener("focus", tcWakeHydrationHandler, true); } catch (_) {}
	try { window.addEventListener("pageshow", tcWakeHydrationHandler, true); } catch (_) {}
	try { window.addEventListener("resize", tcWakeHydrationHandler, { passive: true }); } catch (_) {
		try { window.addEventListener("resize", tcWakeHydrationHandler); } catch (_) {}
	}
}

function scheduleGridHydration(gridEl) {
	if (!gridEl) return;
	if (!rootNode || !rootNode.isConnected) return;
	bindTasksCalendarCellContentObserver();
	hydrateGridWhenReady(gridEl, 0);
	bindTasksCalendarIntersectionHydrate();
	bindTasksCalendarWakeHydration(gridEl);

}

function setTaskContentContainer(currentDate, forcePlannerChromeWeek) {
	var wrap = document.createElement("div");
	renderTasksIntoHost(wrap, currentDate, forcePlannerChromeWeek);
	return wrap.innerHTML;
}

/** 从任务条打开笔记（支持 Ctrl/Cmd 新窗格）。 */
function openTaskNoteFromTaskEl(taskEl, newLeaf) {
	if (!taskEl || !app) { return; }
	var href = taskEl.getAttribute("data-nav-href");
	if (!href) { return; }
	try {
		app.workspace.openLinkText(String(href).replace(/\\/g, "/"), "", !!newLeaf);
	} catch (err) {
		console.error("[noria tasksCalendar] openLinkText failed", href, err);
	}
}

function isTaskElementCompleted(taskEl) {
	if (!taskEl) { return false; }
	var kind = String(taskEl.getAttribute("data-tc-kind") || "").toLowerCase();
	if (kind === "done") { return true; }
	var sig = "";
	try {
		sig = decodeURIComponent(String(taskEl.getAttribute("data-tc-sig") || ""));
	} catch (_) {
		sig = "";
	}
	if (/^\s*-\s*\[[xX]\]/.test(sig)) { return true; }
	return taskEl.classList && taskEl.classList.contains("done");
}

function closeTaskQuickActionMenu() {
	var doc = getTasksCalendarDocument();
	if (!doc || !doc.querySelectorAll) { return; }
	doc.querySelectorAll(".tc-task-quick-menu").forEach(function (n) {
		try { n.remove(); } catch (_) {}
	});
}

function bindTaskQuickActionMenuDismissOnce() {
	var doc = getTasksCalendarDocument();
	if (!doc || !doc.documentElement) { return; }
	var docEl = doc.documentElement;
	if (docEl._noriaTaskQuickMenuDismissBound) { return; }
	docEl._noriaTaskQuickMenuDismissBound = true;
	doc.addEventListener("click", function (ev) {
		var t = ev.target;
		if (t && typeof t.closest === "function" && t.closest(".tc-task-quick-menu")) { return; }
		closeTaskQuickActionMenu();
	}, true);
	doc.addEventListener("keydown", function (ev) {
		if (ev.key === "Escape") { closeTaskQuickActionMenu(); }
	}, true);
}

function positionTaskQuickActionMenu(menuEl, x, y) {
	if (!menuEl) { return; }
	var doc = getTasksCalendarDocument();
	var win = doc.defaultView || window;
	var vw = (win && Number.isFinite(win.innerWidth)) ? win.innerWidth : 800;
	var vh = (win && Number.isFinite(win.innerHeight)) ? win.innerHeight : 600;
	var margin = 8;
	var mw = menuEl.offsetWidth || 170;
	var mh = menuEl.offsetHeight || 132;
	var left = Math.max(margin, Math.min(Number(x) || 0, vw - mw - margin));
	var top = Math.max(margin, Math.min(Number(y) || 0, vh - mh - margin));
	menuEl.style.left = Math.round(left) + "px";
	menuEl.style.top = Math.round(top) + "px";
}

function openTaskQuickActionMenu(taskEl, x, y) {
	if (!taskEl) { return; }
	var doc = getTasksCalendarDocument();
	if (!doc || !doc.body) { return; }
	closeTaskQuickActionMenu();
	bindTaskQuickActionMenuDismissOnce();
	var isDone = isTaskElementCompleted(taskEl);
	var menu = doc.createElement("div");
	menu.className = "tc-task-quick-menu";
	menu.style.cssText = "position:fixed;z-index:100080;min-width:170px;max-width:min(92vw,260px);padding:6px;border-radius:10px;background:var(--background-primary);border:1px solid color-mix(in srgb,var(--background-modifier-border) 70%,transparent);box-shadow:0 8px 28px rgba(15,23,42,0.18);display:flex;flex-direction:column;gap:2px;";
	function mkItem(label, onClick, emphasis) {
		var b = doc.createElement("button");
		b.type = "button";
		b.textContent = label;
		b.style.cssText = "margin:0;border:none;background:transparent;padding:7px 10px;border-radius:8px;text-align:left;font-size:12.5px;line-height:1.35;color:var(--text-normal);cursor:pointer;";
		if (emphasis) {
			b.style.fontWeight = "600";
		}
		b.addEventListener("mouseenter", function () { b.style.background = "var(--background-modifier-hover)"; });
		b.addEventListener("mouseleave", function () { b.style.background = "transparent"; });
		b.addEventListener("click", function (ev) {
			ev.preventDefault();
			ev.stopPropagation();
			try { onClick && onClick(); } catch (_) {}
		});
		menu.appendChild(b);
		return b;
	}
	mkItem(isDone ? "撤销完成" : "完成任务", async function () {
		closeTaskQuickActionMenu();
		try {
			await tcToggleTaskDoneTransaction(taskEl, null, { silentNotice: false });
		} catch (err) {
			showDebugNotice(tcRuntimeT("runtime.tasksCalendar.notice.statusUpdateFailed", { message: err && err.message ? err.message : err }));
		}
	}, true);
	mkItem("编辑日期与时段", function () {
		closeTaskQuickActionMenu();
		openTaskDateTimeEditor(taskEl);
	}, false);
	mkItem("打开任务笔记", function () {
		closeTaskQuickActionMenu();
		openTaskNoteFromTaskEl(taskEl, false);
	}, false);
	doc.body.appendChild(menu);
	positionTaskQuickActionMenu(menu, x, y);
}

function formatDurationZh(totalMin) {
	if (!Number.isFinite(totalMin) || totalMin < 0) { return "—"; }
	var h = Math.floor(totalMin / 60);
	var mm = Math.round(totalMin % 60);
	if (h > 0 && mm > 0) { return h + " 小时 " + mm + " 分"; }
	if (h > 0) { return h + " 小时"; }
	return mm + " 分钟";
}

/** 时段编辑浮层用：更短的时长展示，降低视觉噪声 */
function formatDurationCompact(totalMin) {
	if (!Number.isFinite(totalMin) || totalMin < 0) { return "—"; }
	var h = Math.floor(totalMin / 60);
	var mm = Math.round(totalMin % 60);
	if (h > 0 && mm > 0) { return h + "h" + mm + "′"; }
	if (h > 0) { return h + "h"; }
	return mm + "′";
}

/**
 * 统一「日期 + 时段」编辑面板（ Tasks / Tasks Calendar 行内字段 start:: · due:: ）
 * - 周 plannerChrome 时间轴：与原先一致，仍由右键点小钟或此函数的调用打开
 * - 月视图格内、周全日桶、四象限列表：右键任务条，或 Shift+左键 打开；左键仍打开所在笔记
 */
function openTaskDateTimeEditor(taskEl, opts) {
	if (!app) return;
	opts = opts || {};
	var workbench = opts.workbench || null;
	var createMode = !taskEl || !!workbench?.create;
	if (!createMode && !taskEl) return;
	if (document.querySelector(".tc-planner-te-overlay")) { return; }
	if (createMode && !workbench) {
		var date=opts.dateStr||calendarNow().format("YYYY-MM-DD"),schedule={start:date};
		if (Number.isFinite(opts.startMin)) {
			var seed=moment(date,"YYYY-MM-DD",true).add(Math.max(0,Math.min(1439,opts.startMin)),"minutes");
			schedule={start:seed.format("YYYY-MM-DD HH:mm"),end:seed.clone().add(Math.max(5,Number(opts.durationMin)||60),"minutes").format("YYYY-MM-DD HH:mm")};
		}
		Promise.resolve(noriaBridge.runtime.openPeriodTaskCreate({mode:"daily",date:date,schedule:schedule,anchor:opts.returnFocusEl})).catch(function(error){showDebugNotice(error.message);});
		return;
	}
	var sourceWasTask = true;
	if (!createMode && taskEl && (taskEl.getAttribute("data-noria-source-was-task") === "0" || taskEl.getAttribute("data-noria-source-was-task") === "false")) {
		sourceWasTask = false;
	}
	if (!createMode && sourceWasTask && !workbench) {
		var editMeta=collectTaskMeta(taskEl);
		Promise.resolve(bridge.tasks.openDetails({path:editMeta.filePath,line:editMeta.lineIndex,rawText:decodeURIComponent(editMeta.rawSig||"")||editMeta.rawText},
			{anchor:opts.returnFocusEl||taskEl,presentation:"modal",restoreFocus:opts.restoreFocus})).catch(function(error){showDebugNotice(error.message);});
		return;
	}
	var returnFocusEl = opts && opts.returnFocusEl != null ? opts.returnFocusEl : taskEl;
	var srcCell = taskEl && taskEl.closest ? taskEl.closest(".cell[data-date]") : null;
	var srcDate = srcCell ? srcCell.getAttribute("data-date") : String(opts.dateStr || "");
	var startD = createMode ? (srcDate || calendarNow().format("YYYY-MM-DD")) : (taskEl.getAttribute("data-start-date") || "");
	var dueD = createMode ? startD : (taskEl.getAttribute("data-due-date") || "");
	if (!startD && dueD) { startD = dueD; }
	if (!startD && srcDate) { startD = srcDate; }
	if (!dueD && startD) { dueD = startD; }
	if (!startD) { startD = calendarNow().format("YYYY-MM-DD"); }
	if (!dueD) { dueD = startD; }
	var seedMin = Math.max(0, Math.min(24 * 60 - 1, parseInt(opts.startMin, 10) || 9 * 60));
	var seedDurationMin = Math.max(5, Math.min(24 * 60, parseInt(opts.durationMin, 10) || 60));
	var startT = createMode ? minutesToTimeStr(seedMin) : (normalizeTimeStr(taskEl.getAttribute("data-start-time")) || "09:00");
	var dueT = createMode ? minutesToTimeStr(Math.min(24 * 60, seedMin + seedDurationMin)) : normalizeTimeStr(taskEl.getAttribute("data-due-time"));
	var sm = moment(startD + " " + startT, "YYYY-MM-DD HH:mm", true);
	var em = dueT ? moment(dueD + " " + dueT, "YYYY-MM-DD HH:mm", true) : moment(sm).add(60, "minutes");
	if (!sm.isValid()) { sm = moment(startD + " 09:00", "YYYY-MM-DD HH:mm", true); }
	if (!sm.isValid()) { sm = calendarNow().hours(9).minutes(0).seconds(0); }
	if (!em.isValid() || !em.isAfter(sm)) { em = moment(sm).add(60, "minutes"); }
	var taskTitle = "";
	if (!createMode) {
		var descN = taskEl.querySelector(".description");
		if (descN) { taskTitle = String(descN.textContent || "").trim(); }
		if (!taskTitle) { taskTitle = String(taskEl.getAttribute("data-full-text") || "").trim(); }
	}
	if (!taskTitle) { taskTitle = createMode ? "新任务" : "任务"; }
	var rawSigLine = "";
	try {
		rawSigLine = taskEl ? decodeURIComponent(String(taskEl.getAttribute("data-tc-sig") || taskEl.getAttribute("data-task-sig") || "")) : "";
	} catch (_) { rawSigLine = ""; }
	var splitMain = splitTaskTitleAndTagsFromRaw(rawSigLine, taskTitle);
	taskTitle = splitMain.title || taskTitle;
	if (workbench) taskTitle = workbench.model.title;
	var taskTags = createMode ? "" : (splitMain.tags || "");
	var taskRowState = (!createMode && taskEl) ? tcTaskRowFromCalItemEl(taskEl) : null;
	var taskPriority = createMode ? "normal" : getPriorityFromText(rawSigLine, taskRowState ? taskRowState.priority : (taskEl ? taskEl.getAttribute("data-priority") : "normal"));
	var taskAdvanced = extractTaskEditorMetadata(rawSigLine, taskRowState, createMode);
	if (workbench) {
		taskAdvanced.status=workbench.model.status;taskTags=workbench.model.tags;taskPriority=normalizePriorityValue(workbench.model.priority);
		taskAdvanced.scheduledDate=workbench.model.scheduled;taskAdvanced.createdDate=workbench.model.created;
		taskAdvanced.doneDate=workbench.model.completion;taskAdvanced.cancelledDate=workbench.model.cancelled;
		taskAdvanced.repeat=workbench.model.repeat;taskAdvanced.id=workbench.model.id;taskAdvanced.dependsOnIds=normalizeTaskIdList(workbench.model.dependsOn);
	}
	var currentMetaForDeps = createMode ? { filePath: "", lineIndex: "", rawText: "" } : collectTaskMeta(taskEl);
	var allDependencyRefs = listTaskDependencyRefs(currentMetaForDeps);
	var refsById = Object.create(null);
	allDependencyRefs.forEach(function (ref) {
		if (ref.id && !refsById[ref.id]) refsById[ref.id] = ref;
	});
	var selectedBeforeRefs = taskAdvanced.dependsOnIds.map(function (id) {
		return refsById[id] || { id: id, title: id, path: "", line: "", rawText: "", dependsOn: [] };
	});
	var selectedAfterRefs = taskAdvanced.id
		? allDependencyRefs.filter(function (ref) { return ref.dependsOn && ref.dependsOn.indexOf(taskAdvanced.id) >= 0; })
		: [];
	var originalAfterRefs = selectedAfterRefs.slice();
	var completionSeedText = "";
	if (taskRowState) {
		var compDate = String(taskRowState.completion || "").trim();
		var compTime = normalizeTimeStr(taskRowState.completionTime || "");
		if (compDate) {
			completionSeedText = compDate + (compTime ? (" " + compTime) : " 09:00");
		}
	}
	var completionSeedLocal = "";
	if (completionSeedText) {
		var cmSeed = moment(completionSeedText, ["YYYY-MM-DD HH:mm", "YYYY-MM-DD"], true);
		if (cmSeed.isValid()) { completionSeedLocal = cmSeed.format("YYYY-MM-DDTHH:mm"); }
	}

	var overlay = document.createElement("div");
	overlay.className = "tc-planner-te-overlay";
	overlay.tabIndex = -1;
	var panel = document.createElement("div");
	panel.className = "tc-planner-te-panel";
	panel.setAttribute("role", "dialog");
	panel.setAttribute("aria-modal", "true");
	panel.setAttribute("aria-labelledby", "tc-planner-te-heading");
	if (workbench && workbench.presentation !== "modal") { overlay.classList.add("tc-planner-te-overlay--workbench"); panel.classList.add("tc-planner-te-panel--workbench"); }

	var head = document.createElement("div");
	head.className = "tc-planner-te-head";
	var headMain = document.createElement("div");
	headMain.className = "tc-planner-te-head-main";
 if(workbench?.timeZone){var zoneLabel=document.createElement('span');zoneLabel.className='tc-calendar-zone-caption';zoneLabel.textContent=workbench.timeZone;headMain.appendChild(zoneLabel);}

	var h2 = document.createElement("h2");
	h2.className = "tc-planner-te-heading";
	h2.id = "tc-planner-te-heading";
	h2.textContent = createMode ? tcRuntimeT("runtime.tasksCalendar.editor.createTask") : tcRuntimeT("runtime.tasksCalendar.editor.editTask");
	headMain.appendChild(h2);
	var btnClose = document.createElement("button");
	btnClose.type = "button";
	btnClose.className = "tc-planner-te-close";
	btnClose.setAttribute("aria-label", tcRuntimeT("runtime.tasksCalendar.common.close"));
	bridge.setTaskEditorIcon(btnClose,"x",tcRuntimeT("runtime.tasksCalendar.common.close"));
	head.appendChild(headMain);
	head.appendChild(btnClose);

	var metaGrid = document.createElement("div");
	metaGrid.className = "tc-planner-te-grid tc-planner-te-grid--meta";
	var inTitle = document.createElement("textarea");
	inTitle.rows = 1;
	inTitle.className = "tc-planner-te-input";
	inTitle.placeholder = tcRuntimeT("runtime.tasksCalendar.editor.titlePlaceholder");
	inTitle.value = taskTitle;
	var inTags = document.createElement("input");
	inTags.type = "text";
	inTags.className = "tc-planner-te-input";
	inTags.placeholder = tcRuntimeT("runtime.tasksCalendar.editor.addTags");
	inTags.value = taskTags;
	metaGrid.appendChild(wrapField(tcRuntimeT("runtime.tasksCalendar.editor.task"), inTitle, "tc-planner-te-title"));
	metaGrid.appendChild(wrapField(tcRuntimeT("runtime.tasksCalendar.editor.tags"), inTags, "tc-planner-te-tags"));
	var priorityBar=document.createElement("select");
	priorityBar.className="dropdown";
	["highest","high","medium","normal","low","lowest"].forEach(function(value){
		var option=document.createElement("option");option.value=value;option.textContent=tcRuntimeT("runtime.tasksCalendar.priority."+value);priorityBar.appendChild(option);
	});
	priorityBar.addEventListener("change",function(){taskPriority=priorityBar.value;});
	var priorityField=wrapField(tcRuntimeT("runtime.tasksCalendar.editor.priority"),priorityBar,"tc-planner-te-priority","tc-planner-te-field--priority");

	var grid = document.createElement("div");
	grid.className = "tc-planner-te-grid tc-planner-te-grid--time-range";
	function wrapField(labelText, inputEl, inputId, extraCls) {
		var field = document.createElement("div");
		field.className = "tc-planner-te-field tc-planner-te-field--row" + (extraCls ? (" " + extraCls) : "");
		var lb = document.createElement("label");
		lb.className = "tc-planner-te-label";
		if (inputId) { lb.htmlFor = inputId; }
		lb.textContent = labelText;
		if (inputId && inputEl) { inputEl.id = inputId; }
		var tagName = inputEl && inputEl.tagName ? String(inputEl.tagName).toUpperCase() : "";
		if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
			inputEl.className = "tc-planner-te-input tc-planner-te-input--datetime";
		}
		field.appendChild(lb);
		field.appendChild(inputEl);
		return field;
	}
	var activeStepMin = 15;
	var activeTimePopover = null;
	function closeTaskTimePopover() {
		if (activeTimePopover && activeTimePopover.el) {
			try {
				if (typeof activeTimePopover.cleanup === "function") activeTimePopover.cleanup();
			} catch (_) {}
			try { activeTimePopover.el.remove(); } catch (_) {}
		}
		activeTimePopover = null;
	}
	function openTaskTimePopover(parts, anchorWrap, labelText) {
		if (!parts || !anchorWrap) return;
		if(activeTimePopover && activeTimePopover.parts===parts){closeTaskTimePopover();parts.timeButton.focus();return;}
		closeTaskTimePopover();
		var pop=document.createElement("div");pop.className="tc-planner-te-time-popover";
		pop.setAttribute("role","dialog");pop.setAttribute("aria-label",tcRuntimeT("runtime.tasksCalendar.time.adjustFor",{label:labelText}));
		pop.setAttribute("popover","manual");
		function element(tag,cls,text){var el=document.createElement(tag);el.className=cls;if(text)el.textContent=text;return el;}
		function button(cls,label,fn,icon){var b=element("button",cls,label);b.type="button";if(icon)bridge.setTaskEditorIcon(b,icon,label);b.addEventListener("click",fn);return b;}
		var head=element("div","tc-planner-te-time-head");
		head.appendChild(element("span","",tcRuntimeT("runtime.tasksCalendar.time.title",{label:labelText})));
		var current=element("div","tc-planner-te-time-popover-current");head.appendChild(current);
		head.appendChild(button("clickable-icon tc-planner-te-time-close",tcRuntimeT("runtime.tasksCalendar.common.close"),function(){closeTaskTimePopover();parts.timeButton.focus();},"x"));
		var picker=element("div","tc-planner-te-time-popover-picker"),columns=[];
		function seed(){return normalizeTimeStr(parts.timeInput.value)||"09:00";}
		function setTime(value){parts.timeInput.value=value;parts.timeInput.dispatchEvent(new Event("input",{bubbles:true}));sync();}
		[24,60].forEach(function(count,columnIndex){
			var column=element("div","tc-planner-te-time-column");
			var label=tcRuntimeT("runtime.tasksCalendar.time."+(columnIndex?"minutes":"hours"));
			column.appendChild(element("div","tc-planner-te-time-caption",label));
			var wheel=element("div","tc-planner-te-time-wheel"),buttons=[];
			wheel.setAttribute("role","listbox");wheel.setAttribute("aria-label",label);
			for(var i=0;i<count;i++)(function(value){
				var b=button("tc-planner-te-time-wheel-btn",value,function(){var time=seed();setTime(columnIndex?time.slice(0,3)+value:value+time.slice(2));});
				b.setAttribute("role","option");buttons.push(b);wheel.appendChild(b);
			})(String(i).padStart(2,"0"));
			wheel.addEventListener("keydown",function(e){
				if(!["ArrowUp","ArrowDown","Home","End"].includes(e.key))return;
				var at=buttons.indexOf(document.activeElement);if(at<0)return;e.preventDefault();e.stopPropagation();
				var next=e.key==="Home"?0:e.key==="End"?count-1:Math.max(0,Math.min(count-1,at+(e.key==="ArrowDown"?1:-1)));
				buttons[next].click();buttons[next].focus({preventScroll:true});scrollColumns();
			});
			column.appendChild(wheel);picker.appendChild(column);columns.push({wheel:wheel,buttons:buttons});
		});
		var fine=element("div","tc-planner-te-time-fine"),steps=[];
		function adjust(direction){parts.nudgeBy(direction*activeStepMin);sync();scrollColumns();}
		var minus=button("tc-planner-te-time-adjust-btn","",function(){adjust(-1);},"minus");fine.appendChild(minus);
		[5,15,30,60].forEach(function(step){
			var label=tcRuntimeT("runtime.tasksCalendar.time."+(step===60?"hourStep":"minuteStep"),{value:step});
			var b=button("tc-planner-te-time-step-btn",label,function(){activeStepMin=step;sync();});
			steps.push({value:step,button:b});fine.appendChild(b);
		});
		var plus=button("tc-planner-te-time-adjust-btn","",function(){adjust(1);},"plus");fine.appendChild(plus);
		var actions=element("div","tc-planner-te-time-popover-actions");
		actions.appendChild(button("tc-planner-te-time-mini-btn",tcRuntimeT("runtime.tasksCalendar.time.now"),function(){setTime(calendarNow().format("HH:mm"));scrollColumns();}));
		actions.appendChild(button("tc-planner-te-time-mini-btn",tcRuntimeT("runtime.tasksCalendar.time.clear"),function(){setTime("");}));
		pop.append(head,picker,fine,actions);anchorWrap.appendChild(pop);
		function position(){
			if(!pop.isConnected)return;var anchor=anchorWrap.getBoundingClientRect(),r=pop.getBoundingClientRect(),pr=panel.getBoundingClientRect();
			pop.style.left=Math.round(Math.max(Math.max(12,pr.left+12),Math.min(anchor.right-r.width,Math.min(innerWidth-12,pr.right-12)-r.width)))+"px";
			pop.style.top=Math.round(anchor.bottom+7+r.height<=innerHeight-12?anchor.bottom+7:Math.max(12,anchor.top-r.height-7))+"px";
		}
		function sync(){
			var time=normalizeTimeStr(parts.timeInput.value);current.textContent=time||tcRuntimeT("runtime.tasksCalendar.time.noTime");
			columns.forEach(function(column,index){
				var selected=Number((time||"09:00").slice(index?3:0,index?5:2));
				column.buttons.forEach(function(b,i){var active=!!time&&i===selected;b.classList.toggle("is-active",active);b.setAttribute("aria-selected",String(active));b.tabIndex=i===selected?0:-1;});
			});
			steps.forEach(function(item){var active=item.value===activeStepMin;item.button.classList.toggle("is-active",active);item.button.setAttribute("aria-pressed",String(active));});
			var step=steps.find(function(item){return item.value===activeStepMin;}).button.textContent;
			[minus,plus].forEach(function(b,i){b.title=tcRuntimeT("runtime.tasksCalendar.time."+(i?"later":"earlier"),{step:step});b.setAttribute("aria-label",b.title);});
		}
		function scrollColumns(){columns.forEach(function(column){var b=column.wheel.querySelector('[tabindex="0"]');column.wheel.scrollTop=Math.max(0,b.offsetTop-column.wheel.offsetTop-column.wheel.clientHeight/2+b.offsetHeight/2);});}
		function outside(e){if(!pop.contains(e.target)&&!anchorWrap.contains(e.target))closeTaskTimePopover();}
		parts.timeInput.addEventListener("input",sync);document.addEventListener("pointerdown",outside,true);
		window.addEventListener("resize",position);panel.addEventListener("scroll",position,{passive:true});
		activeTimePopover={el:pop,parts:parts,cleanup:function(){
			parts.timeButton.setAttribute("aria-expanded","false");parts.timeInput.removeEventListener("input",sync);
			document.removeEventListener("pointerdown",outside,true);window.removeEventListener("resize",position);panel.removeEventListener("scroll",position);
		}};
		pop.addEventListener("keydown",function(e){if(e.key==="Escape"){e.preventDefault();e.stopPropagation();closeTaskTimePopover();parts.timeInput.focus();}});
		parts.timeButton.setAttribute("aria-expanded","true");pop.showPopover();sync();position();
		setTimeout(function(){if(pop.isConnected){scrollColumns();position();columns[0].wheel.querySelector('[tabindex="0"]').focus({preventScroll:true});}},0);
	}

	function buildSplitDateTimeField(labelText, idBase, seedValue, allowEmpty) {
		var field = document.createElement("div");
		field.className = "tc-planner-te-field tc-planner-te-field--split tc-planner-te-field--row";
		var lb = document.createElement("label");
		lb.className = "tc-planner-te-label";
		lb.textContent = labelText;
		var row = document.createElement("div");
		row.className = "tc-planner-te-split-row";
		var controls = document.createElement("div");
		controls.className = "tc-planner-te-split-controls";
		var dateInput = document.createElement("input");
		dateInput.type = "date";
		dateInput.id = idBase + "-date";
		lb.htmlFor = dateInput.id;
		dateInput.className = "tc-planner-te-input tc-planner-te-input--date";
		var timeInput = document.createElement("input");
		timeInput.type = "time";
		timeInput.step = "60";
		timeInput.inputMode = "numeric";
		timeInput.placeholder = "--:--";
		timeInput.maxLength = 5;
		timeInput.autocomplete = "off";
		timeInput.spellcheck = false;

		timeInput.id = idBase + "-time";
		timeInput.setAttribute("aria-label",tcRuntimeT("runtime.tasksCalendar.time.adjustFor",{label:labelText}));
		timeInput.className = "tc-planner-te-input tc-planner-te-input--time";
		var timeWrap = document.createElement("span");
		timeWrap.className = "tc-planner-te-time-wrap";
		var timeTrigger = document.createElement("button");
		timeTrigger.type = "button";
		timeTrigger.className = "tc-planner-te-time-trigger";
		bridge.setTaskEditorIcon(timeTrigger,"clock",tcRuntimeT("runtime.tasksCalendar.time.adjustFor",{label:labelText}));
		timeTrigger.classList.add("clickable-icon");timeTrigger.setAttribute("aria-haspopup","dialog");timeTrigger.setAttribute("aria-expanded","false");
		timeTrigger.setAttribute("aria-label", tcRuntimeT("runtime.tasksCalendar.time.adjustFor", { label: labelText }));
		timeTrigger.title = tcRuntimeT("runtime.tasksCalendar.time.adjustFor", { label: labelText });
		function setDateTimeString(nextValue) {
			var parsed = parseDateTimeValue(String(nextValue || "").replace("T", " "));
			if (parsed.date) {
				dateInput.value = parsed.date;
				timeInput.value = parsed.time || "";
			} else if (allowEmpty) {
				dateInput.value = "";
				timeInput.value = "";
			}
		}
		function setMomentValue(nextMoment) {
			if (nextMoment && nextMoment.isValid && nextMoment.isValid()) {
				dateInput.value = nextMoment.format("YYYY-MM-DD");
				timeInput.value = nextMoment.format("HH:mm");
			} else {
				setDateTimeString("");
			}
		}
		function readMomentValue() {
			var dateVal = String(dateInput.value || "").trim();
			var timeVal = String(timeInput.value || "").trim();
			if (!dateVal) { return moment.invalid(); }
			if (!timeVal) { timeVal = "09:00"; }
			return moment(dateVal + " " + timeVal, "YYYY-MM-DD HH:mm", true);
		}
		function readDateTimeString() {
			return formatTaskDateTimeFromParts(dateInput.value, timeInput.value);
		}
		if (seedValue && seedValue.isValid && seedValue.isValid()) {
			setMomentValue(seedValue);
		} else {
			setDateTimeString(seedValue);
		}
		timeWrap.appendChild(timeInput);
		timeWrap.appendChild(timeTrigger);
		controls.appendChild(dateInput);
		controls.appendChild(timeWrap);
		row.appendChild(controls);
		field.appendChild(lb);
		field.appendChild(row);
		var api = null;
		function nudgeBy(deltaMin) {
			var time=normalizeTimeStr(timeInput.value)||"09:00";
			var minutes=Math.max(0,Math.min(1439,Number(time.slice(0,2))*60+Number(time.slice(3))+deltaMin));
			timeInput.value=String(Math.floor(minutes/60)).padStart(2,"0")+":"+String(minutes%60).padStart(2,"0");
			timeInput.dispatchEvent(new Event("input",{bubbles:true}));
		}
		function requestPopover() {
			if (api) openTaskTimePopover(api, timeWrap, labelText);
		}
		timeInput.addEventListener("click",closeTaskTimePopover);
		timeInput.addEventListener("keydown",function(e){if((e.altKey&&e.key==="ArrowDown")||e.key==="F4"){e.preventDefault();requestPopover();}});
		timeTrigger.addEventListener("click",function(e){e.preventDefault();requestPopover();});
		function syncManualDateTimeInput() {
			if (!api) return;
			dateInput.classList.toggle("is-empty",!dateInput.value);timeInput.classList.toggle("is-empty",!timeInput.value);
			updateDurationLabel();
		}
		dateInput.addEventListener("input", syncManualDateTimeInput);
		timeInput.addEventListener("input", syncManualDateTimeInput);
		api = {
			field: field,
			dateInput: dateInput,
			timeInput: timeInput,
			timeButton: timeTrigger,
			readMoment: readMomentValue,
			readDateTimeString: readDateTimeString,
			setMoment: setMomentValue,
			setDateTimeString: setDateTimeString,
			nudgeBy: nudgeBy,
			setDisabled: function (disabled) {
				dateInput.disabled = !!disabled;
				timeInput.disabled = !!disabled;
				timeTrigger.disabled = !!disabled;
			},
			clear: function () {
				dateInput.value = "";
				timeInput.value = "";
			},
			clearTime: function () {
				timeInput.value = "";
			}
		};
		return api;
	}
	var startParts = buildSplitDateTimeField(tcRuntimeT("runtime.tasksCalendar.fields.start"), "tc-planner-te-start", sm, true);
	var endParts = buildSplitDateTimeField(tcRuntimeT(workbench?.model.start&&workbench?.model.due?"workbench.legacyEnd":"runtime.tasksCalendar.fields.end"), "tc-planner-te-end", em, true);
	if (workbench) { startParts.clear(); endParts.clear(); startParts.setDateTimeString(workbench.model.start); endParts.setDateTimeString(workbench.model.due); }

	var dateMetaGrid = document.createElement("div");
	dateMetaGrid.className = "tc-planner-te-grid tc-planner-te-grid--dates";
	var scheduledParts = buildSplitDateTimeField(tcRuntimeT("runtime.tasksCalendar.fields.scheduled"), "tc-planner-te-scheduled", taskAdvanced.scheduledDate, true);
	if (workbench) scheduledParts.setDateTimeString(workbench.model.scheduled);
	var createdParts = buildSplitDateTimeField(tcRuntimeT("runtime.tasksCalendar.fields.created"), "tc-planner-te-created", taskAdvanced.createdDate, true);
	var doneParts = buildSplitDateTimeField(tcRuntimeT("runtime.tasksCalendar.fields.done"), "tc-planner-te-done", workbench ? workbench.model.completion : (taskAdvanced.doneDate || completionSeedLocal), true);
	var cancelledParts = buildSplitDateTimeField(tcRuntimeT("runtime.tasksCalendar.fields.cancelled"), "tc-planner-te-cancelled", taskAdvanced.cancelledDate, true);
	dateMetaGrid.appendChild(scheduledParts.field);
	dateMetaGrid.appendChild(createdParts.field);
	dateMetaGrid.appendChild(doneParts.field);
	dateMetaGrid.appendChild(cancelledParts.field);

	var statusGrid = document.createElement("div");
	statusGrid.className = "tc-planner-te-grid tc-planner-te-grid--status";
	var statusBar=document.createElement("select");statusBar.className="dropdown";
	var rangeDurationValue=null,doneDurationValue=null,actualDurationItem=null;
	TASKS_STATUS_OPTIONS.forEach(function(opt){var option=document.createElement("option");option.value=opt.value;option.textContent=tcRuntimeT(opt.labelKey);statusBar.appendChild(option);});
	if(workbench&&!TASKS_STATUS_OPTIONS.some(function(opt){return opt.value===taskAdvanced.status;})){
		var customStatus=document.createElement("option");customStatus.value=taskAdvanced.status;customStatus.textContent="["+taskAdvanced.status+"]";statusBar.appendChild(customStatus);
	}
	statusBar.addEventListener("change",function(){taskAdvanced.status=statusBar.value;syncStatusEditorState(true);});
	var statusField=wrapField(tcRuntimeT("runtime.tasksCalendar.fields.status"),statusBar,"tc-planner-te-status","tc-planner-te-field--status");
	function syncStatusEditorState(changed){
		var status=taskAdvanced.status;statusBar.value=status;
		doneParts.setDisabled(status!=="done");cancelledParts.setDisabled(status!=="cancelled");
		if(changed){
			if(status==="done"&&!doneParts.readDateTimeString())doneParts.setDateTimeString(calendarNow().format("YYYY-MM-DD"));
			if(status==="cancelled"&&!cancelledParts.readDateTimeString())cancelledParts.setDateTimeString(calendarNow().format("YYYY-MM-DD"));
			if(status!=="done")doneParts.clear();if(status!=="cancelled")cancelledParts.clear();
		}
		updateDurationLabel();
	}
	function syncPriorityEditorState(){priorityBar.value=normalizePriorityValue(taskPriority);}
	syncPriorityEditorState();syncStatusEditorState();

	var durationSummaryRow = document.createElement("div");
	durationSummaryRow.className = "tc-planner-te-duration-summary";
	function buildDurationMetric(labelText) {
		var item = document.createElement("div");
		item.className = "tc-planner-te-duration-item";
		var label = document.createElement("span");
		label.className = "tc-planner-te-duration-label";
		label.textContent = labelText;
		var value = document.createElement("span");
		value.className = "tc-planner-te-duration";
		value.setAttribute("aria-live", "polite");
		item.appendChild(label);
		item.appendChild(value);
		durationSummaryRow.appendChild(item);
		return { item: item, value: value };
	}
	var rangeDurationMetric = buildDurationMetric(tcRuntimeT("runtime.tasksCalendar.duration.range"));
	var actualDurationMetric = buildDurationMetric(tcRuntimeT("runtime.tasksCalendar.duration.actual"));
	rangeDurationValue = rangeDurationMetric.value;
	doneDurationValue = actualDurationMetric.value;
	actualDurationItem = actualDurationMetric.item;
	function describeDurationBetween(startApi, endApi, opts) {
		opts = opts || {};
		var startField = parseDateTimeValue(startApi.readDateTimeString());
		var endField = parseDateTimeValue(endApi.readDateTimeString());
		if (opts.requireEnd && !endApi.readDateTimeString()) {
			return { text: "—", title: "" };
		}
		if (opts.requireFullTime && (!startField.time || !endField.time)) {
			return { text: "—", title: "" };
		}
		if (startField.date && endField.date && (!startField.time || !endField.time)) {
			var sDate = moment(startField.date, "YYYY-MM-DD", true);
			var eDate = moment(endField.date, "YYYY-MM-DD", true);
			if (sDate.isValid() && eDate.isValid() && !eDate.isBefore(sDate, "day")) {
				return {
					text: startField.date === endField.date ? tcRuntimeT("runtime.tasksCalendar.duration.dateOnly") : tcRuntimeT("runtime.tasksCalendar.duration.crossDay"),
					title: tcRuntimeT("runtime.tasksCalendar.duration.dateTimeMissing")
				};
			}
		}
		var ns = startApi.readMoment();
		var ne = endApi.readMoment();
		if (!ns.isValid() || !ne.isValid() || !ne.isAfter(ns)) {
			return { text: "—", title: "" };
		}
		var mins = ne.diff(ns, "minutes");
        if(workbench?.timeZone){try{mins=bridgeCfg.tasksCalendar.zoneAdapter({source:workbench.timeZone,display:workbench.timeZone}).elapsed(ns.format("YYYY-MM-DD HH:mm"),ne.format("YYYY-MM-DD HH:mm"));}catch(error){return {text:"—",title:error.message};}}

		return { text: formatDurationCompact(mins), title: tcRuntimeT("runtime.tasksCalendar.duration.title", { duration: formatDurationZh(mins) }) };
	}
	function updateDurationLabel() {
		if (!rangeDurationValue || !doneDurationValue) return;
		var rangeDuration = describeDurationBetween(startParts, endParts);
		rangeDurationValue.textContent = rangeDuration.text;
		rangeDurationValue.setAttribute("title", rangeDuration.title);
		var doneDuration = normalizeTaskStatusValue(taskAdvanced.status) === "done"
			? describeDurationBetween(startParts, doneParts, { requireEnd: true, requireFullTime: true })
			: { text: "—", title: "" };
		var showActualDuration = doneDuration.text && doneDuration.text !== "—";
		if (actualDurationItem) actualDurationItem.classList.toggle("is-hidden", !showActualDuration);
		doneDurationValue.textContent = showActualDuration ? doneDuration.text : "";
		doneDurationValue.setAttribute("title", doneDuration.title);
	}
	updateDurationLabel();
	grid.appendChild(startParts.field);
	grid.appendChild(endParts.field);


	var repeatDepsBlock = document.createElement("details");
	repeatDepsBlock.className = "tc-planner-te-block tc-planner-te-section tc-planner-te-section--repeat";
	repeatDepsBlock.open = false;
	var advancedSummary = document.createElement("summary");
	advancedSummary.className = "tc-planner-te-advanced-summary";
	advancedSummary.textContent = tcRuntimeT("runtime.tasksCalendar.editor.advanced");
	repeatDepsBlock.appendChild(advancedSummary);
	var advancedBody = document.createElement("div");
	advancedBody.className = "tc-planner-te-advanced-body";
	var repeatGrid = document.createElement("div");
	repeatGrid.className = "tc-planner-te-grid tc-planner-te-grid--repeat";
	var repeatInput = document.createElement("input");
	repeatInput.type = "text";
	repeatInput.className = "tc-planner-te-input";
	repeatInput.placeholder = tcRuntimeT("runtime.tasksCalendar.editor.repeatPlaceholder");
	repeatInput.value = taskAdvanced.repeat || "";
	repeatGrid.appendChild(wrapField(tcRuntimeT("runtime.tasksCalendar.fields.recurs"), repeatInput, "tc-planner-te-repeat"));
	advancedBody.appendChild(repeatGrid);

	function dependencyRefSame(a, b) {
		if (!a || !b) return false;
		if (a.id && b.id && a.id === b.id) return true;
		return taskDependencyRefKey(a) === taskDependencyRefKey(b);
	}
	function dependencyRefIn(list, ref) {
		for (var di = 0; di < list.length; di++) {
			if (dependencyRefSame(list[di], ref)) return true;
		}
		return false;
	}
	function buildDependencyPicker(label, placeholder, selectedList, idSuffix) {
		var wrap = document.createElement("div");
		wrap.className = "tc-planner-te-dependency tc-planner-te-field--row";
		var head = document.createElement("label");
		head.className = "tc-planner-te-dependency-head";
		head.textContent = label;
		var box = document.createElement("div");
		box.className = "tc-planner-te-dependency-box";
		var chips = document.createElement("div");
		chips.className = "tc-planner-te-dependency-chips";
		var input = document.createElement("input");
		input.type = "text";
		input.className = "tc-planner-te-input tc-planner-te-dependency-input";
		input.placeholder = placeholder;
		head.htmlFor = "tc-planner-te-dep-" + String(idSuffix || "task").replace(/\s+/g, "-").toLowerCase();
		input.id = head.htmlFor;
		var suggestions = document.createElement("div");
		suggestions.className = "tc-planner-te-dependency-dropdown";
		var activeSuggestionIndex = -1;
		var visibleRefs = [];
		function renderChips() {
			chips.innerHTML = "";
			selectedList.forEach(function (ref) {
				var chip = document.createElement("button");
				chip.type = "button";
				chip.className = "tc-planner-te-dependency-chip";
				chip.textContent = ref.title || ref.id || tcRuntimeT("runtime.tasksCalendar.editor.task");
				chip.title = tcRuntimeT("runtime.tasksCalendar.task.removeDependency");
				chip.addEventListener("click", function () {
					for (var ri = selectedList.length - 1; ri >= 0; ri--) {
						if (dependencyRefSame(selectedList[ri], ref)) selectedList.splice(ri, 1);
					}
					renderChips();
					renderSuggestions();
				});
				chips.appendChild(chip);
			});
			box.classList.toggle("has-chips", !!selectedList.length);
		}
		function findDependencyExactMatch(query) {
			var needle = String(query || "").trim().toLowerCase();
			if (!needle) return null;
			for (var i = 0; i < allDependencyRefs.length; i++) {
				var ref = allDependencyRefs[i];
				if (dependencyRefIn(selectedList, ref)) continue;
				if (String(ref.id || "").trim().toLowerCase() === needle) return ref;
			}
			for (var j = 0; j < allDependencyRefs.length; j++) {
				var ref2 = allDependencyRefs[j];
				if (dependencyRefIn(selectedList, ref2)) continue;
				if (String(ref2.title || "").trim().toLowerCase() === needle) return ref2;
			}
			return null;
		}
		function selectDependencyRef(ref) {
			if (!ref || dependencyRefIn(selectedList, ref)) return false;
			selectedList.push(ref);
			input.value = "";
			activeSuggestionIndex = -1;
			renderChips();
			renderSuggestions();
			input.focus();
			return true;
		}
		function renderSuggestions() {
			suggestions.innerHTML = "";
			var q = String(input.value || "").trim().toLowerCase();
			visibleRefs = [];
			if (!q) {
				allDependencyRefs.forEach(function (ref) {
					if (visibleRefs.length >= 8 || dependencyRefIn(selectedList, ref)) return;
					visibleRefs.push(ref);
				});
			} else {
				allDependencyRefs.forEach(function (ref) {
					if (visibleRefs.length >= 8 || dependencyRefIn(selectedList, ref)) return;
					var hay = [ref.title, ref.id, ref.path].join(" ").toLowerCase();
					if (hay.indexOf(q) < 0) return;
					visibleRefs.push(ref);
				});
			}
			if (activeSuggestionIndex >= visibleRefs.length) activeSuggestionIndex = visibleRefs.length - 1;
			visibleRefs.forEach(function (ref, idx) {
				var item = document.createElement("button");
				item.type = "button";
				item.className = "tc-planner-te-dependency-suggestion";
				if (idx === activeSuggestionIndex) item.classList.add("is-active");
				var titleSpan = document.createElement("span");
				titleSpan.className = "tc-planner-te-dependency-suggestion-title";
				titleSpan.textContent = ref.title || ref.id || tcRuntimeT("runtime.tasksCalendar.editor.task");
				var pathSpan = document.createElement("span");
				pathSpan.className = "tc-planner-te-dependency-suggestion-path";
				pathSpan.textContent = ref.path ? ref.path.split("/").pop() : (ref.id || "");
				item.appendChild(titleSpan);
				item.appendChild(pathSpan);
				item.title = ref.path || "";
				item.addEventListener("mousedown", function (ev) {
					ev.preventDefault();
				});
				item.addEventListener("click", function () {
					selectDependencyRef(ref);
				});
				suggestions.appendChild(item);
			});
			suggestions.classList.toggle("is-open", visibleRefs.length > 0);
		}
		function commitDependencyInput() {
			var q = String(input.value || "").trim();
			if (!q && visibleRefs[activeSuggestionIndex >= 0 ? activeSuggestionIndex : 0]) {
				return selectDependencyRef(visibleRefs[activeSuggestionIndex >= 0 ? activeSuggestionIndex : 0]);
			}
			if (visibleRefs[activeSuggestionIndex]) {
				return selectDependencyRef(visibleRefs[activeSuggestionIndex]);
			}
			var exact = findDependencyExactMatch(q);
			if (exact) return selectDependencyRef(exact);
			if (q) {
				showDebugNotice(tcRuntimeT("runtime.tasksCalendar.notice.noDependencyMatch"));
			}
			return false;
		}
		input.addEventListener("input", renderSuggestions);
		input.addEventListener("focus", renderSuggestions);
		input.addEventListener("keydown", function (ev) {
			if (ev.key === "ArrowDown") {
				ev.preventDefault();
				activeSuggestionIndex = Math.min(visibleRefs.length - 1, activeSuggestionIndex + 1);
				if (activeSuggestionIndex < 0 && visibleRefs.length) activeSuggestionIndex = 0;
				renderSuggestions();
			} else if (ev.key === "ArrowUp") {
				ev.preventDefault();
				activeSuggestionIndex = Math.max(0, activeSuggestionIndex - 1);
				renderSuggestions();
			} else if (ev.key === "Enter") {
				ev.preventDefault();
				commitDependencyInput();
			} else if (ev.key === "Escape") {
				ev.preventDefault();
				suggestions.innerHTML = "";
				suggestions.classList.remove("is-open");
			}
		});
		input.addEventListener("blur", function () {
			setTimeout(function () {
				suggestions.innerHTML = "";
				suggestions.classList.remove("is-open");
			}, 140);
		});
		wrap.appendChild(head);
		box.appendChild(chips);
		box.appendChild(input);
		box.appendChild(suggestions);
		wrap.appendChild(box);
		renderChips();
		wrap.refreshSelection=renderChips;
		return wrap;
	}
	var dependencyGrid = document.createElement("div");
	dependencyGrid.className = "tc-planner-te-dependency-grid";
	dependencyGrid.appendChild(buildDependencyPicker(
		tcRuntimeT("runtime.tasksCalendar.editor.beforeThis"),
		tcRuntimeT("runtime.tasksCalendar.editor.beforePlaceholder"),
		selectedBeforeRefs,
		"before"
	));
	dependencyGrid.appendChild(buildDependencyPicker(
		tcRuntimeT("runtime.tasksCalendar.editor.afterThis"),
		tcRuntimeT("runtime.tasksCalendar.editor.afterPlaceholder"),
		selectedAfterRefs,
		"after"
	));
	advancedBody.appendChild(dependencyGrid);
	repeatDepsBlock.appendChild(advancedBody);

	var actionsRow = document.createElement("div");
	actionsRow.className = "tc-planner-te-actionsrow";
	var actionsSecondary = document.createElement("div");
	actionsSecondary.className = "tc-planner-te-actions tc-planner-te-actions--secondary";
	var actionsPrimary = document.createElement("div");
	actionsPrimary.className = "tc-planner-te-actions tc-planner-te-actions--primary";

	function makeTaskEditorIconButton(kind, iconName, label) {
		var button = document.createElement("button");
		button.type = "button";
		button.className = "tc-planner-te-btn tc-planner-te-btn--icon tc-planner-te-btn--" + kind;
		bridge.setTaskEditorIcon(button,iconName,label);
		button.title = label;
		button.setAttribute("aria-label", label);
		return button;
	}
	var btnDelete = makeTaskEditorIconButton("danger", "trash-2", tcRuntimeT("runtime.tasksCalendar.task.delete"));
	btnDelete.title = tcRuntimeT("runtime.tasksCalendar.task.deleteWithWriteback");
	var btnOpen = makeTaskEditorIconButton("ghost", "external-link", tcRuntimeT("runtime.tasksCalendar.menu.openNote"));
	var btnSave = makeTaskEditorIconButton("primary", "save", tcRuntimeT("runtime.tasksCalendar.task.save"));
	actionsSecondary.appendChild(btnDelete);
	if(workbench?.conversion)btnDelete.hidden=true;
	actionsPrimary.appendChild(btnOpen);
	actionsPrimary.appendChild(btnSave);
	actionsRow.appendChild(actionsSecondary);
	actionsRow.appendChild(actionsPrimary);

	var workbenchSaving=false,workbenchSaved=false,workbenchInitialFields;
	var editorDateParts={start:startParts,due:endParts,scheduled:scheduledParts,created:createdParts,completion:doneParts,cancelled:cancelledParts};
	if(workbench)delete editorDateParts.scheduled;
	var scheduleEditor=null;
	function allEditorDateParts(){return Object.values(editorDateParts).concat(scheduleEditor?scheduleEditor.dateParts():[]);}
	var originalBeforeRefs=selectedBeforeRefs.slice();
	function readWorkbenchInputs(){
		var value={title:inTitle.value.trim().replace(/[\r\n]+/g," "),tags:inTags.value.trim(),priority:taskPriority,repeat:repeatInput.value.trim(),status:taskAdvanced.status};
		for(var key in editorDateParts)value[key]=editorDateParts[key].readDateTimeString();return value;
	}
	function readWorkbenchFields(){
		var value=readWorkbenchInputs();value.dateInputs={};value.patch={};
		for(var key in editorDateParts){var parts=editorDateParts[key];value.dateInputs[key]={date:parts.dateInput.value,time:parts.timeInput.value};}
		if(workbenchInitialFields)for(var field in workbenchInitialFields)if(value[field]!==workbenchInitialFields[field])value.patch[field]=value[field];
		if(scheduleEditor){value.scheduleDraft=scheduleEditor.snapshot();var schedulePatch=scheduleEditor.patch();if(schedulePatch.length)value.patch.schedule=schedulePatch;}
		value.before=selectedBeforeRefs.slice();value.after=selectedAfterRefs.slice();
		var refKeys=function(refs){return refs.map(taskDependencyRefKey).sort().join("\n");};
		if(refKeys(value.before)!==refKeys(originalBeforeRefs)||refKeys(value.after)!==refKeys(originalAfterRefs))value.dependencies={before:value.before,after:value.after,originalAfter:originalAfterRefs,knownIds:getKnownTaskIds()};
		return value;
	}
	var close = function () {
		if (workbenchSaving) return;
		if(workbench&&!workbenchSaved&&allEditorDateParts().some(function(parts){return parts.dateInput.validity.badInput||parts.timeInput.validity.badInput;})){
			workbenchError.textContent=tcRuntimeT("runtime.tasksCalendar.notice.finishDateTime");return;
		}
		if (workbench && !workbenchSaved) workbench.onDraft(readWorkbenchFields());
		closeTaskTimePopover();
		window.removeEventListener("resize", positionWorkbench);
		try { overlay.remove(); } catch (_) {}
		try {
			if (workbench) workbench.restoreFocus();
			else if (returnFocusEl && typeof returnFocusEl.focus === "function") {
				returnFocusEl.focus({ preventScroll: true });
			}
		} catch (_) {}
	};
	startParts.dateInput.addEventListener("input", updateDurationLabel);
	startParts.timeInput.addEventListener("input", updateDurationLabel);
	endParts.dateInput.addEventListener("input", updateDurationLabel);
	endParts.timeInput.addEventListener("input", updateDurationLabel);
	doneParts.dateInput.addEventListener("input", updateDurationLabel);
	doneParts.timeInput.addEventListener("input", updateDurationLabel);
	btnClose.onclick = close;
	btnOpen.onclick = function () {
		if(workbench) {
			btnOpen.disabled=true;
			Promise.resolve().then(()=>workbench.onOpenSource()).then(result=>{if(result?.ok)close();})
				.catch(error=>{workbenchError.textContent=String(error?.message||error);})
				.finally(()=>{btnOpen.disabled=false;});
			return;
		}
		try {
			if (createMode) {
				showDebugNotice(tcRuntimeT("runtime.tasksCalendar.notice.createBeforeOpen"));
				return;
			}
			var href = taskEl ? String(taskEl.getAttribute("data-nav-href") || "").replace(/\\/g, "/") : "";
			if (!href) {
				showDebugNotice(tcRuntimeT("runtime.tasksCalendar.notice.noTaskLink"));
				return;
			}
			close();
			app.workspace.openLinkText(href, "", false);
		} catch (err) {
			console.error("[tasksCalendar] open task from editor failed:", err);
			showDebugNotice(tcRuntimeT("runtime.tasksCalendar.notice.openNoteFailed", { message: err?.message || err }));
		}
	};
	if (createMode) {
		btnOpen.disabled = true;
		btnOpen.classList.add("disabled");
	}
	if (!sourceWasTask) {
		btnDelete.disabled = true;
		btnDelete.classList.add("disabled");
		btnDelete.title = tcRuntimeT("runtime.tasksCalendar.notice.deleteConversionMode");
		btnDelete.setAttribute("aria-label", tcRuntimeT("runtime.tasksCalendar.notice.deleteConversionMode"));
	}
	overlay.addEventListener("click", function (e) { if (e.target === overlay) { close(); } });
	panel.addEventListener("mousedown", function (e) {
		if (!activeTimePopover || !activeTimePopover.el) return;
		var target = e && e.target ? e.target : null;
		if (target && activeTimePopover.el.contains(target)) return;
		if (target && target.closest && target.closest(".tc-planner-te-time-wrap")) return;
		closeTaskTimePopover();
	});
	overlay.addEventListener("keydown", function (e) {
		if (e.isComposing || e.keyCode === 229) return;
		if (e.key === "Tab") {
			var focusable = Array.from(panel.querySelectorAll("button,input,textarea,select,summary,[tabindex='0']")).filter(function(el){return !el.disabled && el.getClientRects().length;});
			var index = focusable.indexOf(document.activeElement);
			if (e.shiftKey && index <= 0) { e.preventDefault(); focusable[focusable.length-1]?.focus(); }
			else if (!e.shiftKey && index === focusable.length-1) {e.preventDefault(); focusable[0]?.focus();}
		}
		if (e.key === "Escape") {
			e.preventDefault();
			if (activeTimePopover && activeTimePopover.el) {
				closeTaskTimePopover();
				return;
			}
			close();
		}
		if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
			e.preventDefault();
			btnSave.click();
		}
	});
	async function persistDateTime() {
		if (workbench) {
			if (workbenchSaving) return false;
			var value = readWorkbenchFields();
			if (!value.title) {inTitle.focus();return false;}
			var dateFields = allEditorDateParts();
			var invalid=dateFields.find(function(p){return !p.dateInput.validity.valid||!p.timeInput.validity.valid||(p.timeInput.value&&!p.dateInput.value);});
			if (invalid) {
				workbenchError.textContent=tcRuntimeT("runtime.tasksCalendar.notice.dateBeforeTime");invalid.dateInput.focus();return false;
			}
			workbenchSaving=true; panel.setAttribute("aria-busy","true"); workbenchError.textContent="";
			var controls=Array.from(panel.querySelectorAll("input,textarea,select,button")); var disabled=controls.map(function(el){return el.disabled;});
			controls.forEach(function(el){el.disabled=true;});
			try { await workbench.onSave(value);workbenchSaved=true;workbenchSaving=false;close();return true; }
			catch(error) {
				workbench.onDraft(value);
				var message=/invalid-date|invalid-schedule|end-before/.test(error.message)?tcRuntimeT("workbench.taskInvalidDates"):/not-found|ambiguous|task-changed/.test(error.message)?tcRuntimeT("workbench.taskChanged"):error.message;
				workbenchError.textContent=tcRuntimeT("runtime.tasksCalendar.notice.saveFailed",{message:message});return false;
			}
			finally {workbenchSaving=false;panel.removeAttribute("aria-busy");controls.forEach(function(el,i){el.disabled=disabled[i];});}
		}
		var ns = startParts.readMoment();
		var ne = endParts.readMoment();
		var startField = parseDateTimeValue(startParts.readDateTimeString());
		var endField = parseDateTimeValue(endParts.readDateTimeString());
		var dateOnlyRangeOk = false;
		if (startField.date && endField.date && (!startField.time || !endField.time)) {
			var startDay = moment(startField.date, "YYYY-MM-DD", true);
			var endDay = moment(endField.date, "YYYY-MM-DD", true);
			dateOnlyRangeOk = startDay.isValid() && endDay.isValid() && !endDay.isBefore(startDay, "day");
		}
		if (!ns.isValid() || !ne.isValid()) {
			showDebugNotice(tcRuntimeT("runtime.tasksCalendar.notice.invalidTime"));
			return false;
		}
		if (!ne.isAfter(ns) && !dateOnlyRangeOk) {
			showDebugNotice(tcRuntimeT("runtime.tasksCalendar.notice.endAfterStart"));
			return false;
		}
		var taskTitleVal = String(inTitle.value || "").replace(/\s+/g, " ").trim();
		var taskTagsVal = normalizeTaskTagsInput(inTags.value || "");
		var taskPriorityVal = normalizePriorityValue(taskPriority);
		if (!taskTitleVal) {
			showDebugNotice(tcRuntimeT("runtime.tasksCalendar.notice.titleRequired"));
			inTitle.focus();
			return false;
		}
		var advancedForSave = {
			status: normalizeTaskStatusValue(taskAdvanced.status),
			scheduledDate: scheduledParts.readDateTimeString(),
			createdDate: createdParts.readDateTimeString(),
			doneDate: doneParts.readDateTimeString(),
			cancelledDate: cancelledParts.readDateTimeString(),
			repeat: String(repeatInput.value || "").replace(/\s+/g, " ").trim(),
			onCompletion: taskAdvanced.onCompletion || "",
			id: String(taskAdvanced.id || "").trim(),
			dependsOnIds: []
		};
		btnDelete.disabled = true;
		btnSave.disabled = true;
		btnSave.classList.add("is-busy");
		btnSave.setAttribute("aria-label", tcRuntimeT("runtime.tasksCalendar.task.saving"));
		btnSave.title = tcRuntimeT("runtime.tasksCalendar.task.saving");
		try {
			var depSync = await syncTaskEditorDependencies(
				currentMetaForDeps,
				advancedForSave.id,
				selectedBeforeRefs,
				selectedAfterRefs,
				originalAfterRefs
			);
			advancedForSave.id = depSync.currentId || advancedForSave.id;
			advancedForSave.dependsOnIds = depSync.beforeIds || [];
			await mdTaskAdapter.saveDateTime(taskEl, ns, ne, {
				suppressRefresh: true,
				silentNotice: true,
				startDateTimeString: startParts.readDateTimeString(),
				dueDateTimeString: endParts.readDateTimeString(),
				taskTitle: taskTitleVal,
				taskTags: taskTagsVal,
				taskPriority: taskPriorityVal,
				taskAdvanced: advancedForSave
			});
			try {
				var savedStartParts = parseDateTimeValue(startParts.readDateTimeString());
				var savedDueParts = parseDateTimeValue(endParts.readDateTimeString());
				taskEl.setAttribute("data-start-date", ns.format("YYYY-MM-DD"));
				taskEl.setAttribute("data-start-time", savedStartParts.time || "");
				taskEl.setAttribute("data-due-date", ne.format("YYYY-MM-DD"));
				taskEl.setAttribute("data-due-time", savedDueParts.time || "");
				taskEl.setAttribute("data-full-text", taskTitleVal);
				taskEl.setAttribute("data-priority", taskPriorityVal);
				taskEl.classList.toggle("done", advancedForSave.status === "done");
				taskEl.classList.toggle("cancelled", advancedForSave.status === "cancelled");
				var descNode = taskEl.querySelector(".description");
				if (descNode) { descNode.textContent = taskTitleVal; }
				var patchedRow = findTaskRowForSaveMeta(currentMetaForDeps);
				if (patchedRow) { applyTaskDependencyStateToEl(taskEl, patchedRow); }
			} catch (_) {}
			afterTaskDateTimeEditorSave(taskEl);
			try { schedulePlannerChromeWeekLanesFinalize(true); } catch (_) {}
			close();
			showDebugNotice(tcRuntimeT("runtime.tasksCalendar.task.saved"));
			return true;
		} catch (err) {
			console.error(err);
			showDebugNotice(tcRuntimeT("runtime.tasksCalendar.notice.saveFailed", { message: err && err.message ? err.message : err }));
			btnDelete.disabled = !sourceWasTask;
			btnSave.disabled = false;
			btnSave.classList.remove("is-busy");
			btnSave.setAttribute("aria-label", tcRuntimeT("runtime.tasksCalendar.task.save"));
			btnSave.title = tcRuntimeT("runtime.tasksCalendar.task.save");
			return false;
		}
	}
	btnSave.onclick = function () { persistDateTime(); };
	btnDelete.onclick = async function () {
		if (createMode) {
			showDebugNotice(tcRuntimeT("runtime.tasksCalendar.notice.deleteCreateMode"));
			return;
		}
		if (!sourceWasTask) {
			showDebugNotice(tcRuntimeT("runtime.tasksCalendar.notice.deleteConversionMode"));
			return;
		}
		if (btnDelete.disabled) { return; }
		btnDelete.disabled = true;
		btnSave.disabled = true;
		btnDelete.classList.add("is-busy");
		btnDelete.setAttribute("aria-label", tcRuntimeT("runtime.tasksCalendar.task.deleting"));
		btnDelete.title = tcRuntimeT("runtime.tasksCalendar.task.deleting");
		try {
			if(workbench){workbenchSaving=true;await workbench.onDelete();workbenchSaving=false;workbenchSaved=true;}
			else await mdTaskAdapter.removeTask(taskEl, { suppressRefresh: true, silentNotice: true });
			try { taskEl.remove(); } catch (_) {}
			forceImmediateTimelineVisibility([
				String(taskEl.getAttribute("data-start-date") || ""),
				String(taskEl.getAttribute("data-due-date") || "")
			], "editor-delete");
			showDebugNotice(tcRuntimeT("runtime.tasksCalendar.task.deleted"));
			close();
		} catch (err) {
			workbenchSaving=false;
			console.error("[tasksCalendar] delete failed:", err);
			showDebugNotice(tcRuntimeT("runtime.tasksCalendar.notice.deleteFailed", { message: err && err.message ? err.message : err }));
		}
		btnDelete.disabled = false;
		btnSave.disabled = false;
		btnDelete.classList.remove("is-busy");
		btnDelete.setAttribute("aria-label", tcRuntimeT("runtime.tasksCalendar.task.delete"));
		btnDelete.title = tcRuntimeT("runtime.tasksCalendar.task.deleteWithWriteback");
	};

	var titleField=inTitle.closest(".tc-planner-te-field"),tagsField=inTags.closest(".tc-planner-te-field");
	titleField.classList.add("tc-planner-te-title-field");tagsField.classList.add("tc-planner-te-tags-field");
	var properties=document.createElement("div");properties.className="tc-planner-te-properties";properties.append(statusField,priorityField);
	var dateGroup=document.createElement("div");dateGroup.className="tc-planner-te-dates";
	if(workbench){
		scheduleEditor=noriaBridge.tasks.createScheduleEditor({document:document,initial:workbench.model.schedules||[],createDateField:buildSplitDateTimeField,
			iconButton:makeTaskEditorIconButton,t:tcRuntimeT,closeTimePopover:closeTaskTimePopover,onChange:function(){queueMicrotask(positionWorkbench);},
			getDeadline:function(){return workbench.model.start?"":endParts.readDateTimeString();}});
		endParts.field.addEventListener("input",function(){scheduleEditor.refreshDeadline();queueMicrotask(positionWorkbench);});
		scheduledParts.field.remove();dateGroup.append(scheduleEditor.element);
		if(workbench.model.start)dateGroup.append(startParts.field);else dateMetaGrid.prepend(startParts.field);
		dateGroup.append(endParts.field);
	}else dateGroup.append(startParts.field,scheduledParts.field,endParts.field);
	var lifecycle=document.createElement("details");lifecycle.className="tc-planner-te-details";
	var lifecycleSummary=document.createElement("summary");lifecycleSummary.textContent=tcRuntimeT("runtime.tasksCalendar.editor.dateDetails");
	lifecycle.append(lifecycleSummary,dateMetaGrid);
	if(!workbench)lifecycle.append(durationSummaryRow);
	repeatDepsBlock.classList.add("tc-planner-te-details");
	var advancedLabel=document.createElement("span");advancedLabel.textContent=tcRuntimeT("runtime.tasksCalendar.editor.advanced");
	var advancedHint=document.createElement("span");advancedHint.className="tc-planner-te-summary-hint";advancedSummary.replaceChildren(advancedLabel,advancedHint);
	function updateSummary(){advancedHint.textContent=[repeatInput.value.trim(),selectedBeforeRefs.length?tcRuntimeT("runtime.tasksCalendar.editor.prerequisiteCount",{count:selectedBeforeRefs.length}):"",selectedAfterRefs.length?tcRuntimeT("runtime.tasksCalendar.editor.followupCount",{count:selectedAfterRefs.length}):""].filter(Boolean).join(" · ");}
	repeatDepsBlock.addEventListener("input",updateSummary);repeatDepsBlock.addEventListener("click",function(){queueMicrotask(updateSummary);});updateSummary();
	btnOpen.classList.add("tc-planner-te-source");
	var sourceLabel=document.createElement("span");sourceLabel.textContent=String(currentMetaForDeps.filePath||"").split("/").pop().replace(/\.md$/,"");btnOpen.appendChild(sourceLabel);
	actionsSecondary.appendChild(btnOpen);
	panel.append(head,titleField,properties,tagsField,dateGroup,repeatDepsBlock,lifecycle,actionsRow);
	if(workbench?.destination){
		var destination=workbench.destination;
		var destinationField=document.createElement("div");destinationField.className="tc-planner-te-destination";
		var destinationLabel=document.createElement("span");destinationLabel.className="tc-planner-te-label";destinationLabel.textContent=tcRuntimeT("workbench.adoptionDestination");
		var destinationButton=document.createElement("button");destinationButton.type="button";destinationButton.className="noria-review-text-action";
		var updateDestination=function(){destinationButton.textContent=destination.label();destinationButton.title=destination.detail();};
		destinationButton.onclick=async function(){destinationButton.disabled=true;try{await destination.choose();updateDestination();}catch(error){workbenchError.textContent=String(error?.message||error);}finally{destinationButton.disabled=false;destinationButton.focus();}};
		updateDestination();destinationField.append(destinationLabel,destinationButton);panel.insertBefore(destinationField,properties);
		btnOpen.hidden=true;btnDelete.hidden=true;
	}
	if(workbench?.onOpenOrigin){
		var originButton=makeTaskEditorIconButton("ghost","link",tcRuntimeT("workbench.adoptionOpenOrigin"));
		originButton.classList.add("tc-planner-te-origin");actionsSecondary.appendChild(originButton);
		originButton.onclick=function(){close();if(overlay.isConnected)return;Promise.resolve(workbench.onOpenOrigin()).catch(error=>showDebugNotice(error.message));};
	}
	if(workbench?.onFocus){
		var focusButton=makeTaskEditorIconButton("ghost","timer",tcRuntimeT("workbench.focus"));
		focusButton.classList.add("tc-planner-te-focus");actionsSecondary.appendChild(focusButton);
		focusButton.onclick=function(){Promise.resolve(workbench.onFocus(focusButton)).catch(error=>showDebugNotice(error.message));};
	}
	function sizeTitle(){inTitle.style.height="auto";inTitle.style.height=Math.min(112,inTitle.scrollHeight)+"px";}
	inTitle.addEventListener("input",sizeTitle);

	var workbenchError = document.createElement("div");
	function positionWorkbench() {
		if (!workbench || workbench.presentation==="modal") return;
		var anchor=workbench.anchor, rect=anchor?.getBoundingClientRect?.();
		var pane=anchor?.closest?.(".workspace-leaf-content")?.getBoundingClientRect();
		var width=Math.min(520,window.innerWidth-24,pane&&pane.width>=320?pane.width-24:520);
		panel.style.width=width+"px";
		var height=panel.getBoundingClientRect().height;
		var leftBound=pane&&pane.width>=320?Math.max(12,pane.left+12):12;
		var rightBound=pane&&pane.width>=320?Math.min(window.innerWidth-12,pane.right-12):window.innerWidth-12;
		var left=rect?Math.max(leftBound,Math.min(rect.left,rightBound-width)):(window.innerWidth-width)/2;
		var top=rect?rect.bottom+8:Math.max(12,(window.innerHeight-height)/2);
		if(top+height>window.innerHeight-12)top=Math.max(12,rect?rect.top-height-8:12);
		top=Math.max(12,Math.min(top,window.innerHeight-height-12));
		panel.style.left=left+"px";panel.style.top=top+"px";
	}
	if (workbench) {
		overlay.dataset.sourcePath=taskEl.getAttribute("data-tc-path")||"";
		overlay.dataset.sourceLine=taskEl.getAttribute("data-tc-line")||"";
		workbenchError.className="tc-planner-te-error";workbenchError.setAttribute("role","status");panel.insertBefore(workbenchError,actionsRow);
		var cancel=makeTaskEditorIconButton("ghost","undo-2",tcRuntimeT("workbench.discardTaskEdits"));cancel.classList.add("tc-planner-te-discard");
		cancel.onclick=function(){workbenchSaved=true;workbench.onDiscard();close();};actionsPrimary.insertBefore(cancel,btnSave);
		workbenchInitialFields=readWorkbenchInputs();
		if(workbench.draft){
			var draft=workbench.draft;inTitle.value=draft.title;if(draft.tags!=null)inTags.value=draft.tags;if(draft.priority)taskPriority=draft.priority;if(draft.repeat!=null)repeatInput.value=draft.repeat;
			taskAdvanced.status=draft.status;
			for(var key in editorDateParts)if(draft.dateInputs&&draft.dateInputs[key]){editorDateParts[key].dateInput.value=draft.dateInputs[key].date;editorDateParts[key].timeInput.value=draft.dateInputs[key].time;}
			if(scheduleEditor&&draft.scheduleDraft)scheduleEditor.restore(draft.scheduleDraft);
			if(scheduleEditor)scheduleEditor.refreshDeadline();
			if(draft.before)selectedBeforeRefs.splice(0,selectedBeforeRefs.length,...draft.before);
			if(draft.after)selectedAfterRefs.splice(0,selectedAfterRefs.length,...draft.after);
			Array.from(dependencyGrid.children).forEach(function(picker){picker.refreshSelection();});
			syncPriorityEditorState();syncStatusEditorState();updateSummary();
		}
		window.addEventListener("resize",positionWorkbench);
	}
	overlay.appendChild(panel);
	document.body.appendChild(overlay);
	positionWorkbench();sizeTitle();
	for(var key in editorDateParts){var pair=editorDateParts[key];pair.dateInput.classList.toggle("is-empty",!pair.dateInput.value);pair.timeInput.classList.toggle("is-empty",!pair.timeInput.value);}
	setTimeout(function () {
		overlay.focus();
		inTitle.focus();
	}, 0);
}

function openTaskDateTimeEditorFromMarkdownLine(payload) {
	payload = payload || {};
	var filePath = normalizeVaultRelPath(payload.filePath || "");
	var lineIndex = String(payload.lineIndex != null ? payload.lineIndex : "").trim();
	var rawLine = String(payload.rawLine || "");
	var parsedLineIndex = parseInt(lineIndex, 10);
	if (!filePath || !Number.isFinite(parsedLineIndex) || parsedLineIndex < 0) {
		return false;
	}
	var fallbackTitle = tcRuntimeT("runtime.tasksCalendar.editor.task");
	var draft = normalizeMarkdownLineToTaskDraft(rawLine, fallbackTitle);
	var sourceWasTask = typeof payload.sourceWasTask === "boolean" ? payload.sourceWasTask : draft.sourceWasTask;
	var syntheticLine = sourceWasTask ? rawLine : draft.syntheticLine;
	if (!sourceWasTask && !payload.workbench) {
		Promise.resolve(bridge.tasks.openDetails({path:filePath,line:lineIndex,rawText:rawLine},
			{conversion:{taskLine:syntheticLine},anchor:payload.returnFocusEl,presentation:"modal"})).catch(function(error){showDebugNotice(error.message);});
		return true;
	}
	var doc = getTasksCalendarDocument() || document;
	var synthetic = doc.createElement("div");
	synthetic.className = "tc-cal-item tc-cal-item--markdown-source";
	synthetic.setAttribute("data-tc-cal-item", "1");
	synthetic.setAttribute("data-tc-path", filePath);
	synthetic.setAttribute("data-task-path", filePath);
	synthetic.setAttribute("data-tc-line", lineIndex);
	synthetic.setAttribute("data-task-line", lineIndex);
	synthetic.setAttribute("data-tc-sig", encodeURIComponent(syntheticLine));
	synthetic.setAttribute("data-task-sig", encodeURIComponent(syntheticLine));
	synthetic.setAttribute("data-noria-source-was-task", sourceWasTask ? "1" : "0");
	synthetic.setAttribute("data-noria-source-raw-line", encodeURIComponent(rawLine));
	synthetic.setAttribute("data-nav-href", filePath);
	var titleInfo = draft.titleInfo || splitTaskTitleAndTagsFromRaw(syntheticLine, fallbackTitle);
	synthetic.setAttribute("data-full-text", titleInfo.title);
	synthetic.setAttribute("data-priority", getPriorityFromText(syntheticLine, "normal"));
	var status = getTaskStatusFromText(syntheticLine, "todo");
	synthetic.setAttribute("data-tc-kind", status === "done" || status === "cancelled" ? status : "due");
	var startParts = parseDateTimeValue(getInlineFieldValue(syntheticLine, "start"));
	var dueParts = parseDateTimeValue(getInlineFieldValue(syntheticLine, "due"));
	var scheduledParts = parseDateTimeValue(getInlineFieldValue(syntheticLine, "scheduled"));
	var doneParts = parseDateTimeValue(getInlineFieldValue(syntheticLine, "completion") || getInlineFieldValue(syntheticLine, "done"));
	synthetic.setAttribute("data-start-date", startParts.date || scheduledParts.date || dueParts.date || "");
	synthetic.setAttribute("data-start-time", startParts.time || scheduledParts.time || "");
	synthetic.setAttribute("data-due-date", dueParts.date || startParts.date || scheduledParts.date || "");
	synthetic.setAttribute("data-due-time", dueParts.time || "");
	if (doneParts.date) {
		synthetic.setAttribute("data-completion-date", doneParts.date);
		synthetic.setAttribute("data-completion-time", doneParts.time || "");
	}
	var inner = doc.createElement("span");
	inner.className = "inner";
	var desc = doc.createElement("span");
	desc.className = "description";
	desc.textContent = titleInfo.title;
	inner.appendChild(desc);
	synthetic.appendChild(inner);
	openTaskDateTimeEditor(synthetic, { returnFocusEl: payload.returnFocusEl || null, workbench:payload.workbench || null });
	return true;
}

try {
	if (typeof globalThis !== "undefined") {
		globalThis.__noriaTasksCalendarApi = globalThis.__noriaTasksCalendarApi || {};
		globalThis.__noriaTasksCalendarApi.openTaskDateTimeEditor = openTaskDateTimeEditor;
		globalThis.__noriaTasksCalendarApi.openTaskDateTimeEditorFromMarkdownLine = openTaskDateTimeEditorFromMarkdownLine;
		globalThis.__noriaTasksCalendarApi.setTaskCompletionState = setTaskCompletionState;
	}
} catch (_noriaTcApi) {}

/** @deprecated 语义保留：与 openTaskDateTimeEditor 相同 */
function openPlannerChromeTaskTimeEditor(taskEl) {
	openTaskDateTimeEditor(taskEl);
}

function ensureTasksCalendarNavBound() {
	if (rootNode.getAttribute("data-tc-nav-bound") === "1") return;
	rootNode.setAttribute("data-tc-nav-bound", "1");
	async function openPeriodicNoteFromCellLink(linkEl, newLeaf) {
		if (!linkEl) return;
		var href = String(linkEl.getAttribute("data-href") || linkEl.getAttribute("href") || "").replace(/\\/g, "/");
		if (!href) return;
		try {
			var normalized = href.replace(/^\/+/, "");
			var cellDate = linkEl.closest(".cell[data-date]")?.getAttribute("data-date");
			if (cellDate && noriaBridge?.calendar?.resolveNote) {
				var spec = await noriaBridge.calendar.resolveNote({period:"daily",date:cellDate});
				normalized = spec.path;
			}
			var file = app.vault.getAbstractFileByPath(normalized);
			if (!file) {
				await ensurePeriodicNoteFromTemplate(normalized);
				file = app.vault.getAbstractFileByPath(normalized);
			}
			if (file) {
				await app.workspace.getLeaf(!!newLeaf).openFile(file);
			} else {
				await app.workspace.openLinkText(normalized.replace(/\.md$/i, ""), "", !!newLeaf);
			}
		} catch (err) {
			console.error("[tasksCalendar] open periodic note failed:", err);
			showDebugNotice(tcRuntimeT("runtime.tasksCalendar.notice.openNoteFailed", { message: err?.message || err }));
		}
	}
	rootNode.addEventListener("click", function (ev) {
		var dateLink = ev.target.closest(".cellName.internal-link, a.cellName.internal-link");
		if (dateLink && rootNode.contains(dateLink)) {
			ev.preventDefault();
			ev.stopPropagation();
			void openPeriodicNoteFromCellLink(dateLink, !!(ev.metaKey || ev.ctrlKey));
			return;
		}
		var monthTaskTitle = ev.target.closest(".tc-month-task-title");
		if (monthTaskTitle && rootNode.contains(monthTaskTitle) && !ev.shiftKey) {
			var monthTaskEl = monthTaskTitle.closest('[data-tc-cal-item="1"][data-nav-href], .tc-cal-item[data-nav-href]');
			if (monthTaskEl) {
				ev.preventDefault();
				ev.stopPropagation();
				openTaskNoteFromTaskEl(monthTaskEl, !!(ev.metaKey || ev.ctrlKey));
				return;
			}
		}
		if (rootNode.getAttribute("view") === "month") {
			var taskHitMo = ev.target.closest('[data-tc-cal-item="1"], .tc-cal-item, .task');
			if (!taskHitMo || !rootNode.contains(taskHitMo)) {
				if (!ev.target.closest(".wrapperButton")) {
					var mCell = ev.target.closest(".cell[data-date]");
					var mCc = ev.target.closest(".cellContent");
					if (mCell && mCc && mCell.contains(mCc) && rootNode.contains(mCell)) {
						ev.preventDefault();
						ev.stopPropagation();
						var ymdMo = String(mCell.getAttribute("data-date") || "").trim();
						if (ymdMo) {
							void (async function () {
								try {
									var lineMo = "- [ ] 新任务 📅 " + ymdMo;
									await appendTaskLineToDaily(ymdMo, lineMo);
									hydrateQuickAddedTaskIntoRuntime(ymdMo, lineMo);
									scheduleTasksCalendarSoftRefresh(420);
									showBriefNotice(tcRuntimeT("runtime.tasksCalendar.notice.addedToDaily"), 1000);
								} catch (eAddMo) {
									showDebugNotice(tcRuntimeT("runtime.tasksCalendar.notice.createFailed", { message: eAddMo && eAddMo.message ? eAddMo.message : eAddMo }));
								}
							})();
						}
						return;
					}
				}
			}
		}
		var taskEl = ev.target.closest('[data-tc-cal-item="1"][data-nav-href], .tc-cal-item[data-nav-href], .task[data-nav-href]');
		if (!taskEl || !rootNode.contains(taskEl)) return;
		if (!ev.shiftKey) { return; }
		ev.preventDefault();
		ev.stopPropagation();
		openTaskDateTimeEditor(taskEl);
	});
	rootNode.addEventListener("keydown", function (ev) {
		if (ev.key !== "Enter" && ev.key !== " ") return;
		var dateLink = ev.target.closest(".cellName.internal-link, a.cellName.internal-link");
		if (dateLink && rootNode.contains(dateLink)) {
			ev.preventDefault();
			ev.stopPropagation();
			void openPeriodicNoteFromCellLink(dateLink, !!(ev.metaKey || ev.ctrlKey));
			return;
		}
		var monthTaskTitle = ev.target.closest(".tc-month-task-title");
		if (monthTaskTitle && rootNode.contains(monthTaskTitle)) {
			var monthTaskEl = monthTaskTitle.closest('[data-tc-cal-item="1"][data-nav-href], .tc-cal-item[data-nav-href]');
			if (monthTaskEl) {
				ev.preventDefault();
				ev.stopPropagation();
				if (ev.shiftKey) { openTaskDateTimeEditor(monthTaskEl); }
				else { openTaskNoteFromTaskEl(monthTaskEl, !!(ev.metaKey || ev.ctrlKey)); }
				return;
			}
		}
		var taskEl = ev.target.closest('[data-tc-cal-item="1"][data-nav-href], .tc-cal-item[data-nav-href], .task[data-nav-href]');
		if (!taskEl || !rootNode.contains(taskEl)) return;
		if (!taskEl.contains(ev.target)) return;
		ev.preventDefault();
		ev.stopPropagation();
		openTaskDateTimeEditor(taskEl);
	});
}

function getVisibleWeekDates() {
	var base = moment(selectedDate);
	var currentWeekday = base.format("d");
	var dates = [];
	for (var i=0-currentWeekday+parseInt(firstDayOfWeek); i<7-currentWeekday+parseInt(firstDayOfWeek); i++) {
		dates.push(base.clone().add(i, "days").format("YYYY-MM-DD"));
	}
	return dates;
};

function toSlug(raw) {
	return String(raw || "")
		.trim()
		.toLowerCase()
		.replace(/[^\w\u4e00-\u9fa5]+/g, "_")
		.replace(/^_+|_+$/g, "") || "custom";
};


function escapeHtmlAttr(value) {
	return String(value || "")
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
};
function escapeHtmlText(value) {
	return String(value || "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
};
/** 点击抑制：日程条节点为 [data-tc-cal-item] / .tc-cal-item（兼容遗留 .task） */
function resolveTaskSuppressionTarget(anchor) {
	if (!anchor) return null;
	if (anchor.getAttribute && anchor.getAttribute("data-tc-cal-item") === "1") return anchor;
	if (anchor.classList && (anchor.classList.contains("tc-cal-item") || anchor.classList.contains("task"))) return anchor;
	return anchor.querySelector('[data-tc-cal-item="1"], .tc-cal-item, .task');
};

async function appendTaskLineToDaily(dateStr, lineText, startMomentOpt, endMomentOpt, targetOverride) {
	var sm = startMomentOpt ? moment(startMomentOpt) : moment(dateStr, "YYYY-MM-DD", true);
	var em = endMomentOpt ? moment(endMomentOpt) : (sm && sm.isValid() ? sm.clone() : calendarNow());
	if (!sm || !sm.isValid()) sm = calendarNow();
	if (!em || !em.isValid()) em = sm.clone();
	var target = targetOverride || resolveNewTaskAppendTarget(sm, em);
	var destNorm = normalizeVaultRelPath(target.filePath || "");
	if (destNorm && !app.vault.getAbstractFileByPath(destNorm)) {
		try {
			await ensurePeriodicNoteFromTemplate(destNorm);
		} catch (_ens) {}
	}
	var adapter = await ensureTimelineIoAdapterLoaded();
	if (adapter && typeof adapter.appendTaskLineToDaily === "function") {
		return adapter.appendTaskLineToDaily({
			app,
			buildDailyNotePath,
			dateStr,
			lineText,
			sectionHeading: target.sectionHeading,
			filePathOverride: target.filePath
		});
	}
	throw new Error("timeline io adapter unavailable");
};

function hydrateQuickAddedTaskIntoRuntime(filePathOrDateStr, lineText) {
	try {
		var pathRaw = String(filePathOrDateStr || "").replace(/\\/g, "/").trim();
		var path = pathRaw.indexOf("/") >= 0 || /\.md$/i.test(pathRaw)
			? normalizeVaultRelPath(pathRaw)
			: normalizeVaultRelPath(buildDailyNotePath(pathRaw));
		var raw = String(lineText || "");
		var candidate = {
			path: path,
			link: { path: path },
			text: raw,
			visual: raw,
			completed: false,
			checked: false,
			status: " "
		};
		var parsed = getMeta([candidate]);
		if (!parsed || !parsed.length) { return; }
		var incoming = parsed[0];
		var incomingKey = getTaskKey(incoming);
		for (var i = 0; i < tasks.length; i++) {
			if (getTaskKey(tasks[i]) === incomingKey) { return; }
		}
		tasks.push(incoming);
	} catch (_) {}
}
function rerenderCalendarViewNow() {
	var v = rootNode && rootNode.getAttribute ? rootNode.getAttribute("view") : "";
	return renderTaskCalendarViewNow(v, selectedDate);
}
function renderTimelineDatesImmediately(dateList) {
	if (!Array.isArray(dateList) || !dateList.length) { return; }
	var grid = null;
	try {
		grid = rootNode && rootNode.querySelector
			? (rootNode.querySelector(":scope > .grid") || rootNode.querySelector(".grid"))
			: null;
	} catch (_) {}
	if (!grid) { return; }
	var isWeekLike = rootNode && rootNode.getAttribute
		? (rootNode.getAttribute("view") === "week" || rootNode.getAttribute("view") === "day")
		: false;
	var forcePlannerChromeWeek = !!(isWeekLike && isPlannerChromeActive(rootNode, ["week", "day"]));
	var uniq = [];
	for (var i = 0; i < dateList.length; i++) {
		var d = String(dateList[i] || "").trim();
		if (!d || uniq.indexOf(d) >= 0) { continue; }
		uniq.push(d);
	}
	for (var j = 0; j < uniq.length; j++) {
		var day = uniq[j];
		try {
			var cell = findCalendarCellByDate(grid, day);
			if (!cell) { continue; }
			var host = cell.querySelector(".cellContent");
			if (!host) { host = ensureCellContentHostForCell(cell); }
			try { host = upgradeCellContentToRuntimeBacked(cell, host); } catch (_) {}
			renderTasksIntoHost(host, day, forcePlannerChromeWeek);
		} catch (_) {}
	}
}
var tcMutationTxSeq = 0;
var tcMutationReconcileTimer = null;
function scheduleOverlapFinalizeBurst() {
	try { schedulePlannerChromeWeekLanesFinalize(true); } catch (_) {}
	try { schedulePlannerChromeOverlapLayout(); } catch (_) {}
	setTimeout(function () {
		try { schedulePlannerChromeWeekLanesFinalize(true); } catch (_) {}
		try { schedulePlannerChromeOverlapLayout(); } catch (_) {}
	}, 34);
	setTimeout(function () {
		try { schedulePlannerChromeWeekLanesFinalize(true); } catch (_) {}
		try { schedulePlannerChromeOverlapLayout(); } catch (_) {}
	}, 96);
}
function runTimelineOptimisticFrame(dateHints, reason, options) {
	var opts = options || {};
	try { renderTimelineDatesImmediately(dateHints); } catch (_) {}
	if (!opts.skipViewRerender) {
		try { rerenderCalendarViewNow(); } catch (_) {}
	}
	try { schedulePlannerChromeWeekLanesFinalize(true); } catch (_) {}
	try { schedulePlannerChromeOverlapLayout(); } catch (_) {}
	try {
		var g = rootNode && rootNode.querySelector
			? (rootNode.querySelector(":scope > .grid") || rootNode.querySelector(".grid"))
			: null;
		if (g) { hydrateGridTaskCells(g); }
	} catch (_) {}
	if (!opts.skipDeferredFlush) {
		flushDeferredHydration(24);
		flushDeferredTaskFreshRefresh(96);
	}
	if (!opts.skipFinalizeBurst) {
		scheduleOverlapFinalizeBurst();
	}
}
function scheduleTimelineMutationReconcile(dateHints, reason, options) {
	var txId = ++tcMutationTxSeq;
	if (tcMutationReconcileTimer) {
		try { clearTimeout(tcMutationReconcileTimer); } catch (_) {}
		tcMutationReconcileTimer = null;
	}
	tcMutationReconcileTimer = setTimeout(function () {
		tcMutationReconcileTimer = null;
		if (txId !== tcMutationTxSeq) { return; }
		try { triggerTaskFreshRefresh(); } catch (_) {}
	setTimeout(function () {
			if (txId !== tcMutationTxSeq) { return; }
			try { Promise.resolve(refreshTasksFromFreshSource("timeline-reconcile#" + String(txId))).catch(function () {}); } catch (_) {}
			runTimelineOptimisticFrame(dateHints, (reason || "mutation") + "-reconcile", options || {});
		}, 180);
	}, 180);
}
function forceImmediateTimelineVisibility(dateHints, reason) {
	runTimelineOptimisticFrame(dateHints, reason || "mutation");
	setTimeout(function () {
		runTimelineOptimisticFrame(dateHints, (reason || "mutation") + "-stabilize");
	}, 120);
	scheduleTimelineMutationReconcile(dateHints, reason || "mutation");
}

function flushTimelineMutationAfterQuickAdd(dateHints, reason) {
	var uniq = [];
	try {
		(Array.isArray(dateHints) ? dateHints : [dateHints]).forEach(function (d) {
			var s = normalizeDateStr(d);
			if (s && uniq.indexOf(s) === -1) { uniq.push(s); }
		});
	} catch (_) {}
	if (!uniq.length) {
		try { uniq = [normalizeDateStr(selectedDate)].filter(Boolean); } catch (_) {}
	}
	runTimelineOptimisticFrame(uniq, reason || "quick-add", {
		skipViewRerender: true,
		skipDeferredFlush: true,
		skipFinalizeBurst: true
	});
	requestAnimationFrame(function () {
		try { schedulePlannerChromeStableTimelineReflow(rootNode); } catch (_) {}
		try { schedulePlannerChromeOverlapLayout(); } catch (_) {}
		try { syncPlannerChromeWeekTimeBadgeVisibility(); } catch (_) {}
	});
	scheduleTimelineMutationReconcile(uniq, reason || "quick-add", {
		skipViewRerender: true,
		skipDeferredFlush: true,
		skipFinalizeBurst: true
	});
}

function normalizeQuickEventTemplatePath() {
	return String(DEFAULT_TEMPLATE_LIBRARY_PATH || "").trim().replace(/[\\]+/g, "/").replace(/^\/+/, "");
}

function getQuickEventTemplatesForRender() {
	return quickEventLibraryCache.templates;
}

function getQuickEventTemplateByKey(key) {
	return getQuickEventTemplatesForRender().find(item => item.key === String(key || ""));
}

async function refreshQuickEventLibraryTemplates(force) {
	const snapshot = await noriaBridge.eventLibrary.read(normalizeQuickEventTemplatePath());
	const changed = force || quickEventLibraryCache.path !== snapshot.path || quickEventLibraryCache.signature !== snapshot.revision;
	quickEventLibraryCache.path = snapshot.path;
	quickEventLibraryCache.signature = snapshot.revision;
	quickEventLibraryCache.all = snapshot.items;
	quickEventLibraryCache.templates = snapshot.items.filter(item => item.enabled !== false);
	quickEventLibraryCache.source = snapshot.source;
	return changed;
}

function scheduleQuickEventLibraryTemplateRefresh(force) {
	if (quickEventLibraryCache.promise) { return; }
	quickEventLibraryCache.promise = refreshQuickEventLibraryTemplates(!!force)
		.then(function (changed) {
			if (changed && rootNode && rootNode.classList && rootNode.classList.contains("tc-timeline-quick-open")) {
				setQuickTimelinePanel();
			}
		})
		.catch(function (err) {
			console.error("[tasksCalendar] refresh event library failed:", err);
		})
		.finally(function () {
			quickEventLibraryCache.promise = null;
		});
}

async function appendTemplateToLibrary(templateObj) {
	var libPath = DEFAULT_TEMPLATE_LIBRARY_PATH;
	var actions = await ensureTimelineActionsAdapterLoaded();
	var normalizeMinutes = actions?.normalizeMinutes || ((n) => {
		var x = parseInt(String(n || ""), 10);
		return Number.isFinite(x) && x > 0 ? x : 30;
	});
	var timelineTag = String(templateObj.timelineTag || "#tl/custom").trim();
	var line = actions && typeof actions.buildEventTemplateLine === "function"
		? actions.buildEventTemplateLine({
			label: templateObj.label,
			timelineTag: timelineTag,
			startTime: templateObj.defaultStart || "",
			durationMin: normalizeMinutes(templateObj.defaultDuration || 30)
		}, true)
		: "- [x] " + templateObj.label
			+ " [default_tag:: " + timelineTag + "]"
			+ " [default_start::" + (templateObj.defaultStart || "") + "]"
			+ " [default_duration_min::" + String(normalizeMinutes(templateObj.defaultDuration || 30)) + "]"
			+ " #tl/template";
	var initialSeed = (await noriaBridge.eventLibrary.read(libPath)).text;
	var adapter = await ensureTimelineIoAdapterLoaded();
	if (adapter && typeof adapter.appendTemplateToLibrary === "function") {
		var result = await adapter.appendTemplateToLibrary({
			app,
			libPath,
			line,
			uniqueNeedle: "[default_tag:: " + timelineTag + "]",
			initialSeed
		});
		quickEventLibraryCache.mtime = null;
		scheduleQuickEventLibraryTemplateRefresh(true);
		return result;
	}
};

async function quickAddTimelineEvent(dateStr, cfg) {
	var actions = await ensureTimelineActionsAdapterLoaded();
	var buildLine = actions?.buildTimelineTaskLine;
	if (typeof buildLine !== "function") {
		throw new Error("timeline actions adapter unavailable");
	}
	var line = buildLine({
		label: cfg.label,
		startDate: cfg.startDate || dateStr,
		startTime: cfg.startTime,
		dueDate: cfg.dueDate || dateStr,
		dueTime: cfg.dueTime,
		durationMin: cfg.durationMin,
		timelineTag: cfg.timelineTag,
		timelineDay: cfg.timelineDay
	});
 if(taskCalendarZone)line=taskCalendarZone.lineFromDisplay(line);
	var sd = String(cfg.startDate || dateStr || "").trim();
	var dd = String(cfg.dueDate || cfg.startDate || dateStr || "").trim();
	var smQ = moment(sd || dateStr, "YYYY-MM-DD", true);
	var emQ = moment(dd || sd || dateStr, "YYYY-MM-DD", true);
	if (!smQ.isValid()) smQ = moment(dateStr, "YYYY-MM-DD", true);
	if (!emQ.isValid()) emQ = smQ.clone();
	var appendTargetQ = resolveNewTaskAppendTarget(smQ, emQ);
	if (noriaBridge?.calendar?.resolveNote) {
		var spanQ = calendarDaySpanBetweenStartDays(smQ, emQ);
		var specQ = await noriaBridge.calendar.resolveNote({period:spanQ<=1?"daily":spanQ<=7?"weekly":"monthly",date:smQ.format("YYYY-MM-DD")});
		appendTargetQ.filePath = specQ.path;
	}
	var added = await appendTaskLineToDaily(dateStr, line, smQ, emQ, appendTargetQ);
	var affectedDates = [];
	if (sd) { affectedDates.push(sd); }
	if (dd && affectedDates.indexOf(dd) < 0) { affectedDates.push(dd); }
	if (added) {
		hydrateQuickAddedTaskIntoRuntime(appendTargetQ.filePath, line);
	}
	showDebugNotice(
		added
			? tcRuntimeT("runtime.tasksCalendar.notice.quickAdded", { label: cfg.label, dest: describePeriodicDestForNotice(appendTargetQ.filePath) })
			: tcRuntimeT("runtime.tasksCalendar.notice.quickExists", { label: cfg.label })
	);
	return { added: !!added, affectedDates: affectedDates };
};

function setQuickTimelinePanel() {
	syncTimelineQuickDrawerChrome();
	try {
		var legacy = rootNode && rootNode.querySelector(":scope > .quickTimelinePanel");
		if (legacy) {
			legacy.remove();
		}
	} catch (_) {}
	if (!rootNode) {
		return;
	}
	var scrollHost = rootNode.querySelector(".tc-timeline-quick-popover-scroll");
	if (!isTimelineCalendarView()) {
		if (scrollHost) {
			scrollHost.innerHTML = "";
		}
		return;
	}
	var html = "";
	var quickEvents = getQuickEventTemplatesForRender();
	var quickDates = getVisibleWeekDates(), quickDate = getFallbackDateInView();
	html += "<div class='quickTarget'><select class='quickDate' aria-label='" + escapeHtmlAttr(tcRuntimeT("runtime.tasksCalendar.quick.targetDate")) + "'>";
	quickDates.forEach(function(date){html += "<option value='"+date+"'"+(date===quickDate?" selected":"")+">"+date+"</option>";});
	html += "</select><select class='quickScope' aria-label='"+escapeHtmlAttr(tcRuntimeT("runtime.tasksCalendar.quick.scope"))+"'>";
	["daily-only","weekly-all","mixed"].forEach(function(value){html += "<option value='"+value+"'"+(value===timelineQuickStrategy?" selected":"")+">"+escapeHtmlText(getTimelineStrategyLabel(value))+"</option>";});
	html += "</select></div>";

	if (!customInlineOpen) {
	html += "<div class='row eventLibraryRow'>";
	html += "<div class='seg librarySeg'>";
	if (!quickEvents.length && quickEventLibraryCache.source === "library") html += "<div class='quickLibraryHint'>"+escapeHtmlText(tcRuntimeT("runtime.tasksCalendar.quick.libraryEmpty"))+"</div>";
	quickEvents.forEach(function (item) {
		var duration = tasksCalendarRuntimeLocale() === "zh-CN" ? formatDurationZh(item.durationMin) : formatDurationCompact(item.durationMin);
		var meta = item.startTime ? (item.startTime + " · " + duration) : duration;
		html += "<button class='qa eventTemplate' data-action='event-template' data-event-key='" + escapeHtmlAttr(item.key) + "' title='" + escapeHtmlAttr(item.label + " · " + meta) + "'>"
			+ "<span class='eventTemplateLabel'>" + escapeHtmlText(item.label) + "</span>"
			+ "<span class='eventTemplateMeta'>" + escapeHtmlText(meta) + "</span>"
			+ "</button>";
	});
	html += "</div>";
	if (quickEventLibraryCache.source === "builtin") {
		html += "<div class='quickLibraryHint'>" + escapeHtmlText(tcRuntimeT("runtime.tasksCalendar.quick.libraryFallback")) + "</div>";
	}
	html += "</div>";
	html += "<div class='row row-main'>";
	html += "<div class='seg toolSeg'>";
	html += "<button class='qa' data-action='pregen'>" + escapeHtmlText(tcRuntimeT("runtime.tasksCalendar.quick.pregen")) + "</button>";
	html += "<button class='qa' data-action='configure'>" + escapeHtmlText(tcRuntimeT("runtime.tasksCalendar.quick.configure")) + "</button>";
	html += "<button class='qa' data-action='custom'>" + escapeHtmlText(tcRuntimeT("runtime.tasksCalendar.quick.custom")) + "</button>";
	html += "</div>";
	html += "</div>";
	}
	if (customInlineOpen) {
		html += "<div class='quickSectionHead'>"+escapeHtmlText(tcRuntimeT("runtime.tasksCalendar.quick.custom"))+"</div>";
		html += "<div class='row customInline'>";
		html += "<div class='customInline-fields'>";
		[["label","labelPlaceholder","text"],["tagSuffix","tagPlaceholder","text"],["startTime","startPlaceholder","time"],["durationMin","durationPlaceholder","number"]].forEach(function(field){
			var name=escapeHtmlText(tcRuntimeT("runtime.tasksCalendar.quick."+field[1]));
			html += "<label class='quickField'><span>"+name+"</span><input class='qf' data-field='"+field[0]+"' type='"+field[2]+"'"+(field[2]==="number"?" min='1'":"")+" value='"+escapeHtmlAttr(customInlineDraft[field[0]])+"'/></label>";
		});
		html += "</div>";
		html += "<div class='customInline-actions'>";
		html += "<button class='qa' data-action='custom-submit'>" + escapeHtmlText(tcRuntimeT("runtime.tasksCalendar.quick.add")) + "</button>";
		html += "<button class='qa' data-action='custom-save-toggle' aria-pressed='"+String(customInlineDraft.saveToLibrary)+"'>" + escapeHtmlText(tcRuntimeT("runtime.tasksCalendar.quick.keepTemplate")) + "</button>";
		html += "<button class='qa' data-action='custom-close'>" + escapeHtmlText(tcRuntimeT("runtime.tasksCalendar.quick.close")) + "</button>";
		html += "</div>";
		html += "</div>";
	}
	if (!scrollHost) {
		ensureTimelineQuickDrawerChrome();
		scrollHost = rootNode.querySelector(".tc-timeline-quick-popover-scroll");
	}
	if (!scrollHost) {
		return;
	}
	scrollHost.innerHTML = "";
	var panelRoot = document.createElement("div");
	panelRoot.className = "quickTimelinePanel active";
	panelRoot.innerHTML = html;
	scrollHost.appendChild(panelRoot);
	setQuickTimelinePanelEvents();
	scheduleQuickEventLibraryTemplateRefresh(false);
	if (rootNode.classList.contains("tc-timeline-quick-open")) {
		var drAnchor = rootNode.querySelector("button.tc-timeline-quick-drawer");
		if (drAnchor) {
			requestAnimationFrame(function () {
				try {
					positionTimelineQuickPopover(drAnchor);
				} catch (_) {}
				requestAnimationFrame(function () {
					try {
						positionTimelineQuickPopover(drAnchor);
					} catch (_) {}
				});
			});
		}
	}
};

function resetWeekInteractionState() {
	customInlineOpen = false;
	pendingDeleteMode = false;
	setTaskStoreEditMode("idle");
	clearPendingTaskChanges();
	plannerChromeInteractionActive = false;
	setEditModeRenderFreezeUi(false);
	flushDeferredHydration(40);
	flushDeferredTaskFreshRefresh(220);
	overlapRelayoutAll = false;
	overlapRelayoutLaneSet = new Set();
	if (overlapRelayoutRaf !== null) {
		try { cancelAnimationFrame(overlapRelayoutRaf); } catch (_) {}
		overlapRelayoutRaf = null;
	}
	if (weekLanesFinalizeRaf !== null) {
		try { cancelAnimationFrame(weekLanesFinalizeRaf); } catch (_) {}
		weekLanesFinalizeRaf = null;
	}
};

function getQuickTimelineContext() {
	return String(rootNode.getAttribute("view") || "") + "|" + moment(selectedDate).format("YYYY-MM-DD");
}
function collectCalendarRangeTasks(openEntries, completedEntries, currentDate) {
	// A task can have several date roles, or occupy several days; count its identity once.
	var groups = {due: due, start: start, process: process, scheduled: scheduled, recurrence: recurrence, dailyNote: dailyNote};
	if (calendarNow().format("YYYY-MM-DD") === currentDate) groups.overdue = overdue;
	Object.keys(groups).forEach(function (type) {
		groups[type].forEach(function (task) {
			var key = getTaskKey(task.calendarSource || task), entry = openEntries.get(key);
			var role = task.calendarSchedule ? "scheduled" : type;
			if (!entry) { entry = {task: task.calendarSource || task, typ: role, types: new Set()}; openEntries.set(key, entry); }
			entry.types.add(role);
			if (type === "overdue") entry.typ = type;
		});
	});
	done.forEach(function (task) { if (!task.calendarSchedule) completedEntries.set(getTaskKey(task), task); });
}
function refreshCalendarRangeStatistics() {
	var currentView = rootNode.getAttribute("view");
	if (currentView !== "month" && currentView !== "week" && currentView !== "day") return;
	var openEntries = new Map(), completedEntries = new Map();
	var selector = currentView === "month" ? ".cell.currentMonth[data-date], .cell.today[data-date]" : ".cell[data-date]";
	rootNode.querySelectorAll(selector).forEach(function (cell) {
		var date = cell.getAttribute("data-date");
		getTasksViaAdapter(date);
		collectCalendarRangeTasks(openEntries, completedEntries, date);
	});
	setStatisticValuesFromRangeStats(createTaskCalendarRangeStats(openEntries, completedEntries));
}
function getFallbackDateInView() {
	var weekDates = getVisibleWeekDates();
	if(timelineQuickTargetContext === getQuickTimelineContext() && weekDates.includes(timelineQuickTargetDate))return timelineQuickTargetDate;
	var selected = moment(selectedDate).format("YYYY-MM-DD");
	if(rootNode.getAttribute("view") === "day" && weekDates.includes(selected))return selected;
	var today = calendarNow().format("YYYY-MM-DD");
	return weekDates.includes(today) ? today : weekDates[0];
};

function getTimelineStrategyLabel(strategy) {
	return tcRuntimeT("runtime.tasksCalendar.quick." + (strategy==="weekly-all"?"scopeAll":strategy==="mixed"?"scopeMixed":"scopeDay"), {days:timelineSettings.pregenSpanDays || 7});
};

function exitEditModeWithCheck() {
	if (getPendingEditCount() > 0) {
		showDebugNotice(tcRuntimeT("runtime.tasksCalendar.notice.pendingNeedConfirm"));
		return false;
	}
	editModeActive = false;
	pendingDeleteMode = false;
	customInlineOpen = false;
	setEditModeRenderFreezeUi(false);
	setTaskStoreEditMode("idle");
	flushDeferredHydration(40);
	flushDeferredTaskFreshRefresh(160);
	setQuickTimelinePanel();
	showDebugNotice(tcRuntimeT("runtime.tasksCalendar.notice.editExited"));
	return true;
};

function enterEditMode() {
	editModeActive = true;
	pendingDeleteMode = false;
	customInlineOpen = false;
	setEditModeRenderFreezeUi(true);
	setTaskStoreEditMode("editing");
	setQuickTimelinePanel();
	showDebugNotice(tcRuntimeT("runtime.tasksCalendar.notice.editEntered"));
};

function toggleEditDeleteMode() {
	if (!editModeActive) {
		showDebugNotice(tcRuntimeT("runtime.tasksCalendar.notice.enterEditFirst"));
		return;
	}
	pendingDeleteMode = !pendingDeleteMode;
	taskStore.edit.deleteMarking = !!pendingDeleteMode;
	customInlineOpen = false;
	setQuickTimelinePanel();
	showDebugNotice(tcRuntimeT(pendingDeleteMode ? "runtime.tasksCalendar.notice.deleteMarkingOpen" : "runtime.tasksCalendar.notice.deleteMarkingClosed"));
};

function toggleCustomInlinePanel() {
	customInlineOpen = !customInlineOpen;
	setQuickTimelinePanel();
	if (customInlineOpen) rootNode.querySelector('.customInline input[data-field="label"]')?.focus();
};


async function runQuickAction(action, sourceEl) {
	action = String(action || "");
	if (action === "event-template" || action === "pregen" || action === "custom-submit") {
		showBriefNotice(tcRuntimeT("runtime.tasksCalendar.notice.writingTimeline"), 900);
	}
	if (action === "open-library") return noriaBridge.eventLibrary.open(normalizeQuickEventTemplatePath());
	if (action === "configure") return noriaBridge.eventLibrary.settings();
	const preHandlers = {
		"custom": async () => { toggleCustomInlinePanel(); },
		"custom-save-toggle": async () => { customInlineDraft.saveToLibrary = !customInlineDraft.saveToLibrary; setQuickTimelinePanel(); },
		"custom-close": async () => { customInlineOpen = false; setQuickTimelinePanel(); }
	};
	if (preHandlers[action]) {
		await preHandlers[action]();
		return;
	}
	var actions = await ensureTimelineActionsAdapterLoaded();
	if (!actions) { throw new Error("timeline actions adapter unavailable"); }
	var targetDate = getFallbackDateInView();
	var weekDates = getVisibleWeekDates();
	var dateTargets = actions.getPregenDates({selectedDate:targetDate,firstDayOfWeek,spanDays:timelineSettings.pregenSpanDays,strategy:timelineQuickStrategy});
	if (action === "event-template" || action === "pregen") {
		await refreshQuickEventLibraryTemplates(true);
		const keys = action === "pregen" ? (timelineSettings.pregenItems || []) : [sourceEl?.getAttribute("data-event-key")];
		const available = action === "pregen" ? quickEventLibraryCache.all : getQuickEventTemplatesForRender();
		const chosen = keys.map(key => available.find(item => item.key === key));
		if (chosen.some(item => !item)) throw Error(tcRuntimeT("runtime.tasksCalendar.notice.eventSelectionMissing"));
		if (!chosen.length) { showDebugNotice(tcRuntimeT("runtime.tasksCalendar.notice.eventSelectionEmpty")); return; }
		var affectedDates = [];
		for (const item of chosen) for (const date of dateTargets) {
			const result = await quickAddTimelineEvent(date, item.startTime ? {
				label:item.label,startDate:date,startTime:item.startTime,
				dueDate:item.crossDay ? moment(date,"YYYY-MM-DD",true).add(1,"day").format("YYYY-MM-DD") : date,
				dueTime:actions.addMinutesToTime(item.startTime,item.durationMin),durationMin:item.durationMin,timelineTag:item.timelineTag
			} : {label:item.label,timelineDay:true});
			affectedDates = affectedDates.concat(result?.affectedDates || [date]);
		}
		flushTimelineMutationAfterQuickAdd(affectedDates,"quick-event-library");
		return;
	}
	if (action == "custom-submit") {
		var labelCustom = String(customInlineDraft.label || "").trim() || "自定义事件";
		var tagSuffix = toSlug(customInlineDraft.tagSuffix || labelCustom);
		var customTag = "#tl/" + tagSuffix;
		var startCustom = String(customInlineDraft.startTime || "").trim();
		var durationCustom = String(customInlineDraft.durationMin || "35").trim() || "35";
		var affectedCustomDates = [];
		for (var customDate of dateTargets) {
			var customRes;
			if (!startCustom) {
				customRes = await quickAddTimelineEvent(customDate, {label: labelCustom, timelineDay:true});
			} else {
				var customEnd = moment(customDate+" "+startCustom,"YYYY-MM-DD HH:mm",true).add(Number(durationCustom),"minutes");
				customRes = await quickAddTimelineEvent(customDate, {label: labelCustom, startDate:customDate, startTime:startCustom, dueDate:customEnd.format("YYYY-MM-DD"), dueTime:customEnd.format("HH:mm"), durationMin:durationCustom, timelineTag: customTag});
			}
			affectedCustomDates = affectedCustomDates.concat(customRes?.affectedDates || [customDate]);
		}
		if (customInlineDraft.saveToLibrary) {
			await appendTemplateToLibrary({
				label: labelCustom,
				timelineTag: customTag,
				defaultStart: startCustom || "",
				defaultDuration: durationCustom || 30
			});
			showDebugNotice(tcRuntimeT("runtime.tasksCalendar.notice.savedToLibrary"));
		} else {
			showDebugNotice(tcRuntimeT("runtime.tasksCalendar.notice.customEventAdded"));
		}
		flushTimelineMutationAfterQuickAdd(affectedCustomDates, "quick-custom");
		return;
	}
};

function setQuickTimelinePanelEvents() {
	var panel = rootNode.querySelector(".quickTimelinePanel");
	var dateSelect = panel && panel.querySelector(".quickDate"), scopeSelect = panel && panel.querySelector(".quickScope");
	if(dateSelect)dateSelect.onchange=function(){timelineQuickTargetDate=dateSelect.value;timelineQuickTargetContext=getQuickTimelineContext();};
	if(scopeSelect)scopeSelect.onchange=function(){timelineQuickStrategy=scopeSelect.value;};
	rootNode.querySelectorAll(".quickTimelinePanel .qa").forEach((btn) => {
		btn.addEventListener("click", async (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			if (btn.classList.contains("disabled") || quickActionBusy) { return; }
			if(btn.getAttribute("data-action")==="custom-submit"){
				var label=String(customInlineDraft.label||"").trim(), start=String(customInlineDraft.startTime||"").trim(), duration=Number(customInlineDraft.durationMin);
				if(!label || start&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(start) || start&&(!Number.isFinite(duration)||duration<=0)){
					showBriefNotice(tcRuntimeT("runtime.tasksCalendar.quick.invalidEvent"),3000);return;
				}
			}
			quickActionBusy=true;
			var controls=Array.from(panel.querySelectorAll("button,input,select")).map(function(el){var before=el.disabled;el.disabled=true;return [el,before];});
			panel.setAttribute("aria-busy","true");
			try {
				await runQuickAction(btn.getAttribute("data-action"), btn);
			} catch (err) {
				console.error("[tasksCalendar] quick action failed:", err);
				showBriefNotice(tcRuntimeT("runtime.tasksCalendar.notice.quickAddFailed", { message: err?.message || err }),4000);
			} finally {quickActionBusy=false;controls.forEach(function(pair){pair[0].disabled=pair[1];});panel.removeAttribute("aria-busy");}
		});
	});
	rootNode.querySelectorAll(".quickTimelinePanel .qf[data-field]").forEach((inp) => {
		inp.addEventListener("input", () => {
			var f = inp.getAttribute("data-field");
			if (!f) { return; }
			customInlineDraft[f] = inp.value;
		});
	});
};

function unwrapDirectSpans(parentNode) {
	if (!parentNode) { return; }
	Array.from(parentNode.children || []).forEach((n) => {
		if (n.tagName == "SPAN") {
			while (n.firstChild) { parentNode.insertBefore(n.firstChild, n); }
			n.remove();
		}
	});
}

function tcPeriodPickerChevronHtml() {
	return "<span class=\"tc-period-chevron\" aria-hidden=\"true\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"m6 9 6 6 6-6\"/></svg></span>";
}
function wrapToolbarPeriodLabelHtml(innerSpans) {
	return "<span class=\"tc-period-text\">" + String(innerSpans || "") + "</span>" + tcPeriodPickerChevronHtml();
}
function taskCalendarDateHeading(anchor, period) {
	var start=moment(anchor).clone(),end=start.clone();
	if(period==='week'){var bounds=weekBoundsFromFirstDaySetting(start);start=bounds.start;end=bounds.end;}
	else if(period==='month'){start.startOf('month');end.endOf('month');}
	else if(period==='year'){start.startOf('year');end.endOf('year');}
	var parts=bridgeCfg.dateControls.dateHeading(start.format('YYYY-MM-DD'),end.format('YYYY-MM-DD'),period,tasksCalendarRuntimeLocale());
	return "<span class='current-main'>"+parts.primary+"</span>"+(parts.secondary?"<span class='current-sub'>"+parts.secondary+"</span>":'');
}

function weekBoundsFromFirstDaySetting(dayAnchor) {
	var fdRaw = parseInt(String(firstDayOfWeek), 10);
	var fd = Number.isFinite(fdRaw) && fdRaw >= 0 && fdRaw <= 6 ? fdRaw : 0;
	var m = moment(dayAnchor).clone().startOf("day");
	var delta = (m.day() - fd + 7) % 7;
	var start = m.clone().subtract(delta, "days");
	return { start: start, end: start.clone().add(6, "days") };
}
function applyNavigationFromPickedYmd(ymd) {
	var picked = moment(String(ymd || "").trim(), "YYYY-MM-DD", true);
	if (!picked.isValid()) {
		return;
	}
	var activeView = rootNode.getAttribute("view");
	if (activeView == "month") {
		selectedDate = picked.clone().startOf("month");
		getMonth(tasks, selectedDate);
	} else if (activeView == "week") {
		try { rootNode.classList.remove("todayFocus"); } catch (_) {}
		var b = weekBoundsFromFirstDaySetting(picked);
		selectedDate = b.start.clone();
		getWeek(tasks, selectedDate);
	} else if (activeView == "day") {
		selectedDate = picked.clone().startOf("day");
		getDay(tasks, selectedDate);
	} else if (activeView == "list") {
		setEisenhowerFocusDate(picked);
		getList(tasks, getEisenhowerFocusDate());
	}
}

/** 上一段/下一段箭头：按当前视图更新 title（无障碍与悬停提示） */
async function syncTaskCalendarWeather() {
	if (!rootNode) return;
	var generation = rootNode._weatherGeneration = (rootNode._weatherGeneration || 0) + 1;
	rootNode.querySelectorAll(".tc-weather").forEach(function (node) { node.remove(); });
	rootNode.classList.remove("tc-has-forecast");
	if (tcTaskTimelineMode || getTasksCalendarRuntimeSettings().showWeather === false || !bridgeCfg.tasksCalendar?.getForecast) return;
	var mode = rootNode.getAttribute("view");
	if (mode === "list" && eisenhowerGranularity !== "day") return;
	var targets = mode === "day" || mode === "list"
		? [{ date: taskStore.view.anchorDate, host: rootNode.querySelector(".tc-nav-period") }]
		: Array.from(rootNode.querySelectorAll(".cell[data-date]")).map(function (cell) {
			return { date: cell.getAttribute("data-date"), host: cell.querySelector(mode === "month" ? ".tc-month-date-header" : ".cellName") };
		});
	if (!targets.some(function (target) { return target.host && target.date; })) return;
	try {
		var days = await bridgeCfg.tasksCalendar.getForecast({ dates: targets.filter(function (target) { return target.host; }).map(function (target) { return target.date; }) });
		if (!rootNode.isConnected || generation !== rootNode._weatherGeneration || getTasksCalendarRuntimeSettings().showWeather === false) return;
		var byDate = new Map(days.map(function (day) { return [day.date, day]; }));
		targets.forEach(function (target) {
			var day = byDate.get(target.date);
			if (!target.host?.isConnected || !day) return;
			var weather = document.createElement("span");
			weather.className = "tc-weather";
			weather.setAttribute("data-weather-date", target.date);
			var temps = [day.tempMax, day.tempMin].filter(function (t) { return t !== "" && t != null; }).map(function (t) { return t + "°"; }).join(" ");
			weather.title = [day.city, target.date, day.statusText, temps ? temps + "C" : "", day.historical ? (tasksCalendarRuntimeLocale() === "zh-CN" ? "历史天气 · Open-Meteo" : "Historical weather · Open-Meteo") : day.source].filter(Boolean).join(" · ");
			weather.setAttribute("aria-label", weather.title);
			weather.setAttribute("role", "img");
			var icon = document.createElement("span");
			icon.className = "tc-weather-icon";
			var iconName = ({ "晴": "sun", "暴晒": "sun", "多云": "cloud-sun", "阴": "cloud", "雨": "cloud-rain", "雪": "cloud-snow", "风": "wind" })[day.mappedWeather] || "cloud";
			weather.dataset.weather = iconName;
			bridge.setTaskEditorIcon(icon, iconName, "");
			icon.setAttribute("aria-hidden", "true");
			weather.appendChild(icon);
			if (temps) {
				var text = document.createElement("span");
				text.className = "tc-weather-temperatures"; text.textContent = temps; weather.appendChild(text);
			}
			target.host.appendChild(weather);
			rootNode.classList.add("tc-has-forecast");
		});
		if (mode === "week") schedulePlannerChromeStableTimelineReflow(rootNode);
	} catch (_) { /* Optional weather leaves the calendar usable when the provider is unavailable. */ }
}

function syncToolbarNavChevronTitles() {
 if(rootNode){rootNode.querySelectorAll('.tc-calendar-zone-caption').forEach(node=>node.remove());
  if(taskCalendarZone){var parent=rootNode.querySelector('.tc-nav-period');if(parent){var caption=document.createElement('span');caption.className='tc-calendar-zone-caption';caption.textContent=taskCalendarZone.label(taskStore.view.anchorDate);caption.title=taskCalendarZone.display;parent.appendChild(caption);}}
 }

	var period = rootNode && rootNode.querySelector("button.current");
	if (period) {
		var label = Array.from(period.querySelectorAll(".current-main, .current-sub")).map(function (el) { return el.textContent; }).join(" ");
		period.title = label + " · " + tcRuntimeT("runtime.tasksCalendar.nav.pickDate");
		period.setAttribute("aria-label", period.title);
	}
 const activePeriod=rootNode.getAttribute('view')==='list'?eisenhowerGranularity:rootNode.getAttribute('view');
 const todayButton=rootNode.querySelector('.tcNavToday');if(todayButton){const currentPeriod=activePeriod==='week'&&toBoolOr(getWrapperTimelineCompat().focusOnTodayOpensDayView,false)?'day':activePeriod;const label=bridgeCfg.dateControls.currentLabel(currentPeriod,tasksCalendarRuntimeLocale());todayButton.querySelector('.tc-btn-label').textContent=label;todayButton.setAttribute('aria-label',label);}
 rootNode.querySelectorAll('.tc-panel-segment-button').forEach(b=>{const on=b.classList.contains(rootNode.getAttribute('view')+'View');b.setAttribute('role','tab');b.setAttribute('aria-selected',String(on));});
 var compactView=rootNode.querySelector('.tc-view-compact');if(compactView)compactView.value=rootNode.getAttribute('view')==='list'?'list:'+eisenhowerGranularity:rootNode.getAttribute('view');
	void syncTaskCalendarWeather();
	if (!rootNode || !rootNode.querySelector) { return; }
	var prev = rootNode.querySelector("button.previous");
	var next = rootNode.querySelector("button.next");
	if (!prev || !next) { return; }
	var v = String(rootNode.getAttribute("view") || "");
	if (v === "month") {
		prev.setAttribute("title", tcRuntimeT("runtime.tasksCalendar.nav.prevMonth"));
		next.setAttribute("title", tcRuntimeT("runtime.tasksCalendar.nav.nextMonth"));
	} else if (v === "week") {
		prev.setAttribute("title", tcRuntimeT("runtime.tasksCalendar.nav.prevWeek"));
		next.setAttribute("title", tcRuntimeT("runtime.tasksCalendar.nav.nextWeek"));
	} else if (v === "day") {
		prev.setAttribute("title", tcRuntimeT("runtime.tasksCalendar.nav.prevDay"));
		next.setAttribute("title", tcRuntimeT("runtime.tasksCalendar.nav.nextDay"));
	} else if (v === "list") {
		var g = String(typeof eisenhowerGranularity !== "undefined" ? eisenhowerGranularity : "week");
		if (g === "day") {
			prev.setAttribute("title", tcRuntimeT("runtime.tasksCalendar.nav.prevDay"));
			next.setAttribute("title", tcRuntimeT("runtime.tasksCalendar.nav.nextDay"));
		} else if (g === "week") {
			prev.setAttribute("title", tcRuntimeT("runtime.tasksCalendar.nav.prevWeek"));
			next.setAttribute("title", tcRuntimeT("runtime.tasksCalendar.nav.nextWeek"));
		} else if (g === "month") {
			prev.setAttribute("title", tcRuntimeT("runtime.tasksCalendar.nav.prevMonth"));
			next.setAttribute("title", tcRuntimeT("runtime.tasksCalendar.nav.nextMonth"));
		} else if (g === "year") {
			prev.setAttribute("title", tcRuntimeT("runtime.tasksCalendar.nav.prevYear"));
			next.setAttribute("title", tcRuntimeT("runtime.tasksCalendar.nav.nextYear"));
		} else {
			prev.setAttribute("title", tcRuntimeT("runtime.tasksCalendar.nav.prevPeriod"));
			next.setAttribute("title", tcRuntimeT("runtime.tasksCalendar.nav.nextPeriod"));
		}
	} else {
		prev.setAttribute("title", tcRuntimeT("runtime.tasksCalendar.nav.prevPeriod"));
		next.setAttribute("title", tcRuntimeT("runtime.tasksCalendar.nav.nextPeriod"));
	}
}

function openToolbarNativeDatePicker(optPeriodAnchorEl) {
 const anchor=optPeriodAnchorEl||rootNode.querySelector('button.current');
 rootNode._datePickerClose?.();
 const mode=rootNode.getAttribute('view'),period=mode==='list'?eisenhowerGranularity:mode;
 rootNode._datePickerClose=bridgeCfg.dateControls.openDatePicker(anchor,{locale:tasksCalendarRuntimeLocale(),kind:period==='month'?'month':period==='year'?'year':'day',value:moment(selectedDate||calendarNow()).format('YYYY-MM-DD'),onSelect:applyNavigationFromPickedYmd});
}
function navigatePeriodToToday() {
	var activeView = rootNode.getAttribute("view");
	if (activeView == "month") {
		selectedDate = calendarNow().date(1);
		getMonth(tasks, selectedDate);
	} else if (activeView == "week") {
		var wtc = getWrapperTimelineCompat();
		var openDayOnCurrent = toBoolOr(wtc.focusOnTodayOpensDayView, false);
		if (openDayOnCurrent && tcFeatureFlags.dayView && !tcTaskTimelineMode) {
			selectedDate = calendarNow().startOf("day");
			getDay(tasks, selectedDate);
		} else {
			selectedDate = taskCalendarConfiguredWeekStart(calendarNow());
			getWeek(tasks, selectedDate);
			try {
				if (toBoolOr(wtc.defaultTodayFocus, false)) {
					rootNode.classList.add("todayFocus");
				} else {
					rootNode.classList.remove("todayFocus");
				}
			} catch (_) {}
			try {
				requestAnimationFrame(function () {
					var todayCell = rootNode.querySelector(".cell.today[data-date]");
					if (todayCell && typeof todayCell.scrollIntoView === "function") {
						todayCell.scrollIntoView({ block: "nearest", inline: "center" });
					}
				});
			} catch (_) {}
		}
	} else if (activeView == "day") {
		selectedDate = calendarNow().startOf("day");
		getDay(tasks, selectedDate);
	} else if (activeView == "list") {
		setEisenhowerFocusDate(calendarNow());
		getList(tasks, getEisenhowerFocusDate());
	}
}

function noriaTcMoreCompositeForCal(r) {
	try {
		return r && r.closest ? r.closest(".noria-timeline-composite") : null;
	} catch (_) {
		return null;
	}
}

function closeTimelineToolbarMorePopoverForRoot(r) {
	if (!r) {
		return;
	}
	try {
		var popH = r._noriaTimelineToolbarMorePopEl;
		if (popH && popH.isConnected) {
			popH.style.setProperty("display", "none", "important");
			popH.style.setProperty("visibility", "hidden", "important");
			popH.style.setProperty("pointer-events", "none", "important");
		}
	} catch (_) {}
	r.classList.remove("tc-timeline-toolbar-more-open");
	try {
		var comp = noriaTcMoreCompositeForCal(r);
		if (comp) {
			comp.classList.remove("tc-timeline-toolbar-more-open");
		}
	} catch (_) {}
	try {
		var b = r.querySelector("button.tc-toolbar-more");
		if (b) {
			b.setAttribute("aria-expanded", "false");
		}
	} catch (_) {}
}

function positionTimelineToolbarMorePopoverFor(calRoot, anchorBtn) {
	if (!anchorBtn || !calRoot) {
		return;
	}
	var pop = calRoot._noriaTimelineToolbarMorePopEl || calRoot.querySelector(".tc-timeline-toolbar-more-pop");
	if (!pop) {
		return;
	}
	try {
		var r = anchorBtn.getBoundingClientRect();
		var comp = noriaTcMoreCompositeForCal(calRoot);
		var margin = 8;
		if (comp && pop.parentNode === comp) {
			/* 右侧边栏优先：在 composite 内 absolute 定位，避免 fixed 在窄栏中跑出可视区 */
			var cr = comp.getBoundingClientRect();
			var maxW = Math.max(180, Math.min(320, Math.floor((cr.width || 320) - margin * 2)));
			pop.style.maxWidth = maxW + "px";
			pop.style.position = "absolute";
			var pwIn = pop.offsetWidth || Math.min(280, maxW);
			var phIn = pop.offsetHeight || 220;
			var leftIn = (r.right - cr.left) - pwIn;
			if (leftIn < margin) { leftIn = r.left - cr.left; }
			if (leftIn + pwIn > cr.width - margin) {
				leftIn = cr.width - pwIn - margin;
			}
			leftIn = Math.max(margin, leftIn);
			var topIn = (r.bottom - cr.top) + 6;
			if (topIn + phIn > cr.height - margin) {
				topIn = Math.max(margin, (r.top - cr.top) - phIn - 6);
			}
			topIn = Math.max(margin, topIn);
			pop.style.left = Math.round(leftIn + (comp.scrollLeft || 0)) + "px";
			pop.style.top = Math.round(topIn + (comp.scrollTop || 0)) + "px";
			pop.style.right = "auto";
		} else {
			/* 兜底：普通 fixed 定位 */
			pop.style.position = "fixed";
			var vw = window.innerWidth || 800;
			var vh = window.innerHeight || 600;
			var pw = pop.offsetWidth || 280;
			var ph = pop.offsetHeight || 200;
			var leftPx = r.right - pw;
			if (leftPx < margin) { leftPx = r.left; }
			if (leftPx + pw > vw - margin) { leftPx = vw - pw - margin; }
			leftPx = Math.max(margin, leftPx);
			var topPx = r.bottom + 6;
			if (topPx + ph > vh - margin) { topPx = Math.max(margin, r.top - ph - 6); }
			pop.style.left = Math.round(leftPx) + "px";
			pop.style.top = Math.round(topPx) + "px";
			pop.style.right = "auto";
		}
		try {
			pop.style.zIndex = "10050";
		} catch (_) {}
	} catch (_) {}
}

function positionTimelineToolbarMorePopover(anchorBtn) {
	positionTimelineToolbarMorePopoverFor(rootNode, anchorBtn);
}

function toggleTimelineToolbarMorePopover(anchorBtn) {
	if (!rootNode || !anchorBtn) {
		return;
	}
	var open = rootNode.classList.contains("tc-timeline-toolbar-more-open");
	if (open) {
		closeTimelineToolbarMorePopoverForRoot(rootNode);
	} else {
		try {
			closeTimelineQuickPopoverForRoot(rootNode);
		} catch (_) {}
		rootNode.classList.add("tc-timeline-toolbar-more-open");
		try {
			var compOpen = noriaTcMoreCompositeForCal(rootNode);
			if (compOpen) {
				compOpen.classList.add("tc-timeline-toolbar-more-open");
			}
		} catch (_) {}
		anchorBtn.setAttribute("aria-expanded", "true");
		try {
			var popO = rootNode._noriaTimelineToolbarMorePopEl || rootNode.querySelector(".tc-timeline-toolbar-more-pop");
			if (popO) {
				popO.style.setProperty("display", "block", "important");
				popO.style.setProperty("visibility", "visible", "important");
				popO.style.setProperty("pointer-events", "auto", "important");
			}
		} catch (_) {}
		positionTimelineToolbarMorePopoverFor(rootNode, anchorBtn);
		requestAnimationFrame(function () {
			positionTimelineToolbarMorePopoverFor(rootNode, anchorBtn);
		});
		setTimeout(function () {
			positionTimelineToolbarMorePopoverFor(rootNode, anchorBtn);
		}, 0);
	}
}

function bindTimelineToolbarMoreDismissOnce() {
	var doc = getTasksCalendarDocument();
	if (!doc || !doc.documentElement) {
		return;
	}
	var docEl = doc.documentElement;
	if (docEl._noriaTcToolbarMoreDismissBound) {
		return;
	}
	docEl._noriaTcToolbarMoreDismissBound = true;
	var win = doc.defaultView || (typeof window !== "undefined" ? window : null);
	doc.addEventListener(
		"click",
		function (ev) {
			var opens = doc.querySelectorAll(".tasksCalendar.tc-timeline-toolbar-more-open");
			if (!opens.length) {
				return;
			}
			var t = ev.target;
			for (var oi = 0; oi < opens.length; oi++) {
				var cal = opens[oi];
				var pop = cal._noriaTimelineToolbarMorePopEl || cal.querySelector(".tc-timeline-toolbar-more-pop");
				var moreBtn = cal.querySelector("button.tc-toolbar-more");
				if (moreBtn && (moreBtn === t || (moreBtn.contains && moreBtn.contains(t)))) {
					return;
				}
				if (t && typeof t.closest === "function" && t.closest(".noria-tl-chrome-more")) {
					return;
				}
				if (pop && (pop === t || (pop.contains && pop.contains(t)))) {
					return;
				}
				closeTimelineToolbarMorePopoverForRoot(cal);
			}
		},
		false
	);
	doc.addEventListener(
		"keydown",
		function (kev) {
			if (kev.key !== "Escape") {
				return;
			}
			doc.querySelectorAll(".tasksCalendar.tc-timeline-toolbar-more-open").forEach(function (cal) {
				closeTimelineToolbarMorePopoverForRoot(cal);
			});
		},
		true
	);
	if (win) {
		win.addEventListener("resize", function () {
			doc.querySelectorAll(".tasksCalendar.tc-timeline-toolbar-more-open").forEach(function (cal) {
				var anchor = cal.querySelector("button.tc-toolbar-more");
				if (anchor) {
					positionTimelineToolbarMorePopoverFor(cal, anchor);
				}
			});
			doc.querySelectorAll(".tasksCalendar.stat-open").forEach(function (cal) {
				try {
					var statBtn = cal.querySelector("button.statistic");
					if (statBtn) {
						positionStatisticPopup(statBtn);
					}
				} catch (_) {}
			});
		});
	}
}

function setTaskCalendarActionState(target, state, error) {
	if (!target || typeof target.setAttribute !== "function") { return; }
	var nextState = String(state || "idle").trim() || "idle";
	target.setAttribute("data-noria-action-state", nextState);
	if (error) {
		target.setAttribute("data-noria-action-error", String(error));
	} else if (typeof target.removeAttribute === "function") {
		target.removeAttribute("data-noria-action-error");
	}
}

function getTaskCalendarToolbarActionKind(btn) {
	if (!btn || !btn.classList) { return ""; }
	if (btn.classList.contains("monthView")) { return "switch-view-month"; }
	if (btn.classList.contains("weekView")) { return "switch-view-week"; }
	if (btn.classList.contains("dayView")) { return "switch-view-day"; }
	if (btn.classList.contains("listView")) { return "switch-view-list"; }
	if (btn.classList.contains("previous")) { return "navigate-previous"; }
	if (btn.classList.contains("tcNavToday")) { return "navigate-today"; }
	if (btn.classList.contains("next")) { return "navigate-next"; }
	if (btn.classList.contains("current")) { return "open-date-picker"; }
	if (btn.classList.contains("statistic")) { return "toggle-statistics"; }
	return "";
}

function decorateTaskCalendarToolbarAction(btn) {
	if (!btn || typeof btn.setAttribute !== "function") { return btn; }
	var kind = getTaskCalendarToolbarActionKind(btn);
	if (!kind) { return btn; }
	btn.setAttribute("data-noria-action-source", "tasks-calendar-toolbar");
	btn.setAttribute("data-noria-action-kind", kind);
	if (kind.indexOf("switch-view-") === 0) {
		btn.setAttribute("data-noria-action-target-view", kind.replace("switch-view-", ""));
	} else if (typeof btn.removeAttribute === "function") {
		btn.removeAttribute("data-noria-action-target-view");
	}
	setTaskCalendarActionState(btn, "idle");
	return btn;
}

function setButtons() {
	var host = rootNode;
	if (!host) { return; }
	var ui = globalThis.__noriaTaskCalendarUi || null;
	var taskTimelineMode = !!tcTaskTimelineMode;
	var buttonsNode = document.createElement("div");
	buttonsNode.className = "buttons";
	buttonsNode.setAttribute("data-layout", "toolbar-v6");
	function mkBtn(cls, title, iconHtml, labelText) {
		if (ui && typeof ui.createToolbarButton === "function") {
			var viaUi = ui.createToolbarButton({
				doc: document,
				className: cls,
				title: title,
				iconHtml: iconHtml,
				labelText: labelText
			});
			if (viaUi) { return decorateTaskCalendarToolbarAction(viaUi); }
		}
		var b = document.createElement("button");
		b.type = "button";
		b.className = cls;
		if (title) { b.setAttribute("title", title); }
		if (iconHtml) { b.innerHTML = iconHtml; }
		if (labelText) {
			var span = document.createElement("span");
			span.className = "tc-btn-label";
			span.textContent = labelText;
			b.appendChild(span);
		}
		return decorateTaskCalendarToolbarAction(b);
	}
	/* One toolbar: date, view, then actions. Grid range belongs to the grid. */
	var left = (ui && typeof ui.createButtonGroup === "function")
		? ui.createButtonGroup({ doc: document, className: "btn-group left tc-toolbar-start" })
		: null;
	if (!left) {
		left = document.createElement("div");
		left.className = "btn-group left tc-toolbar-start";
	}
	var seg = (ui && typeof ui.createSegmentedContainer === "function")
		? ui.createSegmentedContainer({
			doc: document,
			className: "tc-segmented tc-panel-segment-group",
			ariaLabel: taskTimelineMode ? tcRuntimeT("runtime.tasksCalendar.toolbar.weekSchedule") : tcRuntimeT("runtime.tasksCalendar.toolbar.calendarView")
		})
		: null;
	if (!seg) {
		seg = document.createElement("div");
		seg.className = "tc-segmented tc-panel-segment-group";
		seg.setAttribute("role", "tablist");
		seg.setAttribute("aria-label", taskTimelineMode ? tcRuntimeT("runtime.tasksCalendar.toolbar.weekSchedule") : tcRuntimeT("runtime.tasksCalendar.toolbar.calendarView"));
	}
	if (taskTimelineMode) {
			seg.appendChild(mkBtn("weekView tc-panel-segment-button", tcRuntimeT("runtime.tasksCalendar.view.week"), "", tcRuntimeT("runtime.tasksCalendar.view.shortWeek")));
	} else {
			seg.appendChild(mkBtn("monthView tc-panel-segment-button", tcRuntimeT("runtime.tasksCalendar.view.month"), "", tcRuntimeT("runtime.tasksCalendar.view.shortMonth")));
			seg.appendChild(mkBtn("weekView tc-panel-segment-button", tcRuntimeT("runtime.tasksCalendar.view.week"), "", tcRuntimeT("runtime.tasksCalendar.view.shortWeek")));
			seg.appendChild(mkBtn("dayView tc-panel-segment-button", tcRuntimeT("runtime.tasksCalendar.view.day"), "", tcRuntimeT("runtime.tasksCalendar.view.shortDay")));
			seg.appendChild(mkBtn("listView tc-panel-segment-button", tcRuntimeT("runtime.tasksCalendar.eisenhower.viewTitle"), "", tcRuntimeT("runtime.tasksCalendar.eisenhower.short")));
	}
	left.appendChild(seg);
  bridgeCfg.dateControls.bindSegments(seg);
	if(!taskTimelineMode){
		var compactView=document.createElement('select');compactView.className='tc-view-compact';compactView.setAttribute('aria-label',tcRuntimeT('runtime.tasksCalendar.toolbar.calendarView'));
		[['month','monthView'],['week','weekView'],['day','dayView']].forEach(function(pair){var option=document.createElement('option');option.value=pair[0];option.textContent=seg.querySelector('.'+pair[1]).textContent;compactView.appendChild(option);});
		['day','week','month','year'].forEach(function(period){var option=document.createElement('option');option.value='list:'+period;option.textContent=tcRuntimeT('runtime.tasksCalendar.eisenhower.short')+' · '+tcRuntimeT('runtime.tasksCalendar.view.short'+period[0].toUpperCase()+period.slice(1));compactView.appendChild(option);});
		compactView.addEventListener('change',function(){const [view,period]=compactView.value.split(':');if(view==='list'){eisenhowerGranularity=period;initializeEisenhowerFocusDateFromView(rootNode.getAttribute('view'));saveTasksCalendarRuntimePreference('eisenhowerGranularity',period,'noria.eisen.granularity');getList(tasks,getEisenhowerFocusDate());}else seg.querySelector('.'+({month:'monthView',week:'weekView',day:'dayView'}[view])).click();compactView.focus({preventScroll:true});});left.appendChild(compactView);
	}
	var navArrows = null;
	navArrows = (ui && typeof ui.createNavArrowsGroup === "function")
		? ui.createNavArrowsGroup({
			doc: document,
			mkBtn: mkBtn,
			leftIcon: tcNavChevronLeftSvg,
			rightIcon: tcNavChevronRightSvg
		})
		: null;
	if (!navArrows) {
		navArrows = document.createElement("div");
		navArrows.className = "tc-nav-arrows";
		navArrows.setAttribute("role", "group");
		navArrows.setAttribute("aria-label", tcRuntimeT("runtime.tasksCalendar.nav.group"));
		navArrows.appendChild(mkBtn("previous", tcRuntimeT("runtime.tasksCalendar.nav.prevPeriod"), tcNavChevronLeftSvg, ""));
		navArrows.appendChild(mkBtn("tcNavToday", tcRuntimeT("runtime.tasksCalendar.nav.todayTitle"), "", tcRuntimeT("runtime.tasksCalendar.nav.today")));
		navArrows.appendChild(mkBtn("next", tcRuntimeT("runtime.tasksCalendar.nav.nextPeriod"), tcNavChevronRightSvg, ""));
	}
	var navPeriod = document.createElement("div");
	navPeriod.className = "tc-nav-period";
	var curBtn = mkBtn("current", tcRuntimeT("runtime.tasksCalendar.nav.pickDate"), "", "");
	curBtn.setAttribute("aria-haspopup", "dialog");
	navPeriod.appendChild(curBtn);

	/* 右：完成度摘要（四象限周期挂载在顶部辅助区；时间轴模式不创建） */
	var right = (ui && typeof ui.createButtonGroup === "function")
		? ui.createButtonGroup({ doc: document, className: "btn-group right tc-toolbar-end" })
		: null;
	if (!right) {
		right = document.createElement("div");
		right.className = "btn-group right tc-toolbar-end";
	}
	if(taskTimelineMode){
	var stat = (ui && typeof ui.createStatisticButton === "function")
		? ui.createStatisticButton({ mkBtn: mkBtn, glyph: tcStatisticGlyphIcon })
		: null;
	if (!stat) {
		stat = mkBtn("statistic", tcRuntimeT("runtime.tasksCalendar.stats.buttonTitle"), "", "");
		stat.setAttribute("percentage", "");
		stat.setAttribute("data-total", "0");
		stat.innerHTML = "<span class='tc-stat-glyph'>" + tcStatisticGlyphIcon + "</span><span class='tc-stat-pct'>—</span>";
	}
	right.appendChild(stat);
	}
	if (!taskTimelineMode) {
		var filter=mkBtn('tc-toolbar-filter clickable-icon',tasksCalendarRuntimeLocale()==='zh-CN'?'筛选':'Filters','','');
		bridge.setTaskEditorIcon(filter,'filter',filter.title);filter.setAttribute('aria-haspopup','dialog');filter.onclick=function(event){event.stopPropagation();toggleStatisticPopupForButton(filter);};right.appendChild(filter);
		var more = mkBtn("tc-toolbar-more clickable-icon", tasksCalendarRuntimeLocale() === "zh-CN" ? "更多" : "More", "", "");
		bridge.setTaskEditorIcon(more, "ellipsis", more.title);
		more.setAttribute("aria-haspopup", "menu");
		more.addEventListener("click", function (event) {
			event.stopPropagation();
			bridgeCfg.tasksCalendar?.openMore(more, function () { void syncTaskCalendarWeather(); },{
				statistics:function(){setTimeout(function(){toggleStatisticPopupForButton(more);},0);},
				hours:isTimelineCalendarView()?function(){setTimeout(function(){openPlannerHoursSettings(more);},0);}:null
			});
		});
		right.appendChild(more);
	}

	var row = document.createElement("div");
	row.className = "tc-button-row";
	const dateNav = document.createElement('div'); dateNav.className='tc-date-navigation noria-date-navigation';
 dateNav.appendChild(curBtn);dateNav.appendChild(navArrows.querySelector('.previous'));dateNav.appendChild(navArrows.querySelector('.next'));dateNav.appendChild(navArrows.querySelector('.tcNavToday'));
 navPeriod.prepend(dateNav);row.appendChild(navPeriod);row.appendChild(left);

	var contextTools = document.createElement("div");
	contextTools.className = "tc-context-tools";
	if (!taskTimelineMode) {
		var plannerSlot0 = document.createElement("div");
		plannerSlot0.className = "tc-toolbar-planner-slot";
		contextTools.appendChild(plannerSlot0);
	}
	right.prepend(contextTools);row.appendChild(right);buttonsNode.appendChild(row);
	host.appendChild(buttonsNode);
	if (!taskTimelineMode) {
	var eisenSeg=document.createElement('select');eisenSeg.className='tc-eisen-granularity';eisenSeg.setAttribute('aria-label',tcRuntimeT('runtime.tasksCalendar.eisenhower.rangeAria'));
	[
		["day", tcRuntimeT("runtime.tasksCalendar.view.shortDay")],
		["week", tcRuntimeT("runtime.tasksCalendar.view.shortWeek")],
		["month", tcRuntimeT("runtime.tasksCalendar.view.shortMonth")],
		["year", tcRuntimeT("runtime.tasksCalendar.view.shortYear")]
	].forEach((pair) => {
		var ek = pair[0];
		var elab = pair[1];
		var eb = document.createElement("option");
		eb.value=ek;
		eb.textContent = elab;
		eisenSeg.appendChild(eb);
	});
	eisenSeg.addEventListener('change',function(){eisenhowerGranularity=eisenSeg.value;saveTasksCalendarRuntimePreference('eisenhowerGranularity',eisenSeg.value,'noria.eisen.granularity');getList(tasks,getEisenhowerFocusDate());eisenSeg.focus({preventScroll:true});});
	eisenSeg.style.display = "none";
		var eisenPool = document.createElement("div");
		eisenPool.className = "tc-eisen-granularity-pool";
		eisenPool.setAttribute("aria-hidden", "true");
		eisenPool.appendChild(eisenSeg);
		host.appendChild(eisenPool);
	}
	setQuickTimelinePanel();
	setButtonEvents();
	syncToolbarNavChevronTitles();
};

function setButtonEvents() {
	rootNode.querySelectorAll('button').forEach(btn => btn.addEventListener('click', ((ev) => {
		/* Planner 工具条：晨轴 / 快捷按钮由专用 listener 处理，避免冒泡末尾 blur 与重复逻辑抢交互 */
		if (
			btn.classList.contains("tc-planner-axis-toggle")
			|| btn.classList.contains("tc-timeline-quick-drawer")
			|| btn.classList.contains("tc-timeline-quick-popover-close")
			|| btn.classList.contains("tc-eisen-gran-btn")
		) {
			return;
		}
		if (btn.closest && btn.closest(".tc-timeline-quick-popover")) {
			return;
		}
		var actionKind = getTaskCalendarToolbarActionKind(btn);
		var activeView = rootNode.getAttribute("view");
		/* TimelineModeContract 护栏：时间轴模式禁止切到 month/day/list */
		if (tcTaskTimelineMode) {
			if (
				btn.classList.contains("monthView")
				|| btn.classList.contains("dayView")
				|| btn.classList.contains("listView")
			) {
				if (actionKind) { setTaskCalendarActionState(btn, "unavailable", tcRuntimeT("runtime.tasksCalendar.notice.timelineWeekOnly")); }
				showDebugNotice(tcRuntimeT("runtime.tasksCalendar.notice.timelineWeekOnly"));
				btn.blur();
				return;
			}
		}
		if (btn.classList.contains("tc-toolbar-more")) {
			return;
		}
		if (btn.classList.contains("statistic") && btn._noriaTimelineMoreStatBound) {
			return;
		}
		if (actionKind) { setTaskCalendarActionState(btn, "pending"); }
		try {
			if (btn.classList.contains("tcNavToday")) {
				navigatePeriodToToday();
			} else if (btn.classList.contains("previous")) {
				if (activeView == "month") {
					selectedDate = moment(selectedDate).subtract(1, "months");
					getMonth(tasks, selectedDate);
				} else if (activeView == "week") {
					try { rootNode.classList.remove("todayFocus"); } catch (_) {}
					selectedDate = taskCalendarConfiguredWeekStart(moment(selectedDate).subtract(7, "days"));
					getWeek(tasks, selectedDate);
				} else if (activeView == "day") {
					selectedDate = moment(selectedDate).subtract(1, "day").startOf("day");
					getDay(tasks, selectedDate);
				} else if (activeView == "list") {
					shiftEisenhowerFocusDate(-1);
					getList(tasks, getEisenhowerFocusDate());
				}
			} else if (btn.classList.contains("current")) {
				openToolbarNativeDatePicker();
			} else if (btn.classList.contains("next")) {
				if (activeView == "month") {
					selectedDate = moment(selectedDate).add(1, "months");
					getMonth(tasks, selectedDate);
				} else if (activeView == "week") {
					try { rootNode.classList.remove("todayFocus"); } catch (_) {}
					selectedDate = taskCalendarConfiguredWeekStart(moment(selectedDate).add(7, "days"));
					getWeek(tasks, selectedDate);
				} else if (activeView == "day") {
					selectedDate = moment(selectedDate).add(1, "day").startOf("day");
					getDay(tasks, selectedDate);
				} else if (activeView == "list") {
					shiftEisenhowerFocusDate(1);
					getList(tasks, getEisenhowerFocusDate());
				};
			} else if (btn.classList.contains("monthView")) {
				try { rootNode.classList.remove("todayFocus"); } catch (_) {}
				if ( calendarNow().format("ww-YYYY") == moment(selectedDate).format("ww-YYYY") ) {
					selectedDate = calendarNow().date(1);
				} else {
					selectedDate = moment(selectedDate).date(1);
				};
				getMonth(tasks, selectedDate);
			} else if (btn.classList.contains("dayView")) {
				try { rootNode.classList.remove("todayFocus"); } catch (_) {}
				selectedDate = moment(selectedDate || calendarNow()).startOf("day");
				getDay(tasks, selectedDate);
			} else if (btn.classList.contains("listView")) {
				try { rootNode.classList.remove("todayFocus"); } catch (_) {}
				inheritEisenhowerGranularityFromView(activeView);
				initializeEisenhowerFocusDateFromView(activeView);
				getList(tasks, getEisenhowerFocusDate());
			} else if (btn.classList.contains("weekView")) {
				try { rootNode.classList.remove("todayFocus"); } catch (_) {}
				getWeek(tasks, selectedDate);
			} else if (btn.classList.contains("statistic")) {
				try {
					ev.preventDefault();
					ev.stopPropagation();
				} catch (_) {}
				toggleStatisticPopupForButton(btn);
			};
			if (actionKind) { setTaskCalendarActionState(btn, "ok"); }
		} catch (error) {
			if (actionKind) { setTaskCalendarActionState(btn, "failed", error && error.message ? error.message : error); }
			try { console.warn("[noria tasksCalendar] toolbar action failed:", error); } catch (_) {}
		}
		btn.blur();
	})));
	/* v0.5 Phase C 第三轮：status-circle 全局 click 委派（capture 阶段，避免被子层 stopPropagation 吞掉）
	 * - 单击 .noria-status-circle → 切换 done（调用既有 setTaskCompletionState）
	 * - 失败（meta 缺字段 / 找不到任务行 / 写盘失败）走 showDebugNotice 让用户感知，不再静默 console.warn
	 * - 成功才更新 data-state；失败时保持原状态以反映「未生效」 */
	rootNode.addEventListener("pointerdown", function (event) {
		var activeView0 = rootNode && rootNode.getAttribute ? rootNode.getAttribute("view") : "";
		if ((activeView0 === "week" || activeView0 === "day") && isPlannerChromeActive(rootNode, ["week", "day"])) { return; }
		var circle = event.target && event.target.closest ? event.target.closest(".noria-status-circle[data-noria-status-circle='1']") : null;
		if (!circle || !rootNode.contains(circle)) { return; }
		var taskEl = circle.closest('.tc-cal-item, [data-tc-cal-item="1"], .tc-month-span-overlay-item');
		if (!taskEl) { return; }
		try { event.preventDefault(); event.stopPropagation(); } catch (_) {}
		try { circle.__tcLastPointerTs = Date.now(); } catch (_) {}
		(async function () {
			await tcToggleTaskDoneTransaction(taskEl, circle, { silentNotice: false });
		})();
	}, true);
	rootNode.addEventListener("click", function (event) {
		var activeView1 = rootNode && rootNode.getAttribute ? rootNode.getAttribute("view") : "";
		if ((activeView1 === "week" || activeView1 === "day") && isPlannerChromeActive(rootNode, ["week", "day"])) { return; }
		var circle = event.target && event.target.closest ? event.target.closest(".noria-status-circle[data-noria-status-circle='1']") : null;
		if (!circle || !rootNode.contains(circle)) { return; }
		try {
			var lastPtrTs = Number(circle.__tcLastPointerTs || 0);
			if (lastPtrTs > 0 && (Date.now() - lastPtrTs) < 260) { return; }
		} catch (_) {}
		var taskEl = circle.closest('.tc-cal-item, [data-tc-cal-item="1"], .tc-month-span-overlay-item');
		if (!taskEl) { return; }
		try { event.preventDefault(); event.stopPropagation(); } catch (_) {}
		(async function () {
			await tcToggleTaskDoneTransaction(taskEl, circle, { silentNotice: false });
		})();
	}, true);
	rootNode.addEventListener("pointerdown", function (event) {
		var native = event.target && event.target.closest ? event.target.closest(".tc-compact-checkbox[data-tc-compact-checkbox='1']") : null;
		if (!native || !rootNode.contains(native)) { return; }
		try { event.stopPropagation(); } catch (_) {}
	}, true);
	rootNode.addEventListener("click", function (event) {
		var native = event.target && event.target.closest ? event.target.closest(".tc-compact-checkbox[data-tc-compact-checkbox='1']") : null;
		if (!native || !rootNode.contains(native)) { return; }
		try { event.stopPropagation(); } catch (_) {}
	}, true);
	rootNode.addEventListener("change", function (event) {
		var native = event.target && event.target.closest ? event.target.closest(".tc-compact-checkbox[data-tc-compact-checkbox='1']") : null;
		if (!native || !rootNode.contains(native)) { return; }
		var taskEl = native.closest('.tc-cal-item, [data-tc-cal-item="1"], .tc-month-span-overlay-item');
		if (!taskEl) { return; }
		try { event.preventDefault(); event.stopPropagation(); } catch (_) {}
		var desiredDone = !!native.checked;
		(async function () {
			await tcToggleTaskDoneTransaction(taskEl, native, { silentNotice: false, desiredDone: desiredDone });
		})();
	}, true);
	rootNode.addEventListener("contextmenu", function (event) {
		var tNav = event.target.closest('[data-tc-cal-item="1"][data-nav-href], .tc-cal-item[data-nav-href], .task[data-nav-href]');
		var view = rootNode.getAttribute("view");
		if (tNav && rootNode.contains(tNav) && tNav.getAttribute("data-nav-href")) {
			event.preventDefault();
			event.stopPropagation();
			/* v0.5 Phase C：右键 = 直接打开任务日期/时段编辑器（取消旧"先弹快捷菜单再选编辑"两步）。
			 * 设计文档：[[设计-Noria-UI系统]] §5.3.2。
			 * 触屏长按由浏览器自动派发 contextmenu，与桌面右键走同一路径，等价。 */
			openTaskDateTimeEditor(tNav);
			return;
		}
		if ((view === "week" || view === "day") && isPlannerChromeActive(rootNode, ["week", "day"]) && !tNav) {
			var lane = event.target.closest(".timeLane");
			var cell = event.target.closest(".cell[data-date]");
			if (lane && cell && rootNode.contains(cell)) {
				event.preventDefault();
				event.stopPropagation();
				var laneRect = lane.getBoundingClientRect();
				var y = Math.max(0, Math.min(event.clientY - laneRect.top, laneRect.height || 1));
				var axisStart = getPlannerChromeTimelineStartMin();
				var axisEnd = getPlannerChromeTimelineEndMin();
				var minute = roundMinutesToStep(axisStart + (y / Math.max(1, laneRect.height)) * (axisEnd - axisStart), 15);
				openTaskDateTimeEditor(null, {
					create: true,
					dateStr: cell.getAttribute("data-date") || calendarNow().format("YYYY-MM-DD"),
					startMin: minute
				});
				return;
			}
		}
		event.preventDefault();
	});
	/* v0.5 Phase C：月表 cell 空白单击 = 在该日新建任务（设计文档 §6.2.6）
	 * 关键决策：
	 *  1. 用 capture 阶段，避免被 metadata/LP 渲染的子元素 stopPropagation 吞事件
	 *  2. 排除任务条 / overlay 跨天条 / 日期头 / fallback 提示条；spacer 已 pointer-events:none，不必排除
	 *  3. 不强制 cellContent 命中，只要落在 .cell[data-date] 内即可，避免 cellName 之外的 padding 区域漏触发
	 *  4. 复用既有 openTaskDateTimeEditor({ create:true, dateStr }) 入口（与 week/day plannerChrome timeline 空白右键创建路径一致） */
	rootNode.addEventListener("click", function (event) {
		var view = rootNode.getAttribute("view");
		if (view !== "month") { return; }
		var tgt = event.target;
		if (!tgt || !tgt.closest) { return; }
		var insideTask = tgt.closest(
			'.tc-cal-item, [data-tc-cal-item="1"], .tc-month-span-overlay, .tc-month-span-overlay-item, .cellName, .tc-cell-render-fallback, .noria-status-circle'
		);
		if (insideTask) { return; }
		var cell = tgt.closest(".cell[data-date]");
		if (!cell || !rootNode.contains(cell)) { return; }
		var dateStr = cell.getAttribute("data-date") || "";
		if (!dateStr) { return; }
		try { event.preventDefault(); event.stopPropagation(); } catch (_) {}
		try {
			openTaskDateTimeEditor(null, { create: true, dateStr: dateStr });
		} catch (err) {
			try { console.warn("[noria tasksCalendar] month-cell empty click → open editor failed", err); } catch (_) {}
		}
	}, true);
};

function positionStatisticPopup(anchorBtn) {
 var pop=getStatisticPopupEl(); if(!pop||!anchorBtn)return;
 pop.style.display="block";pop.style.visibility="visible";pop.style.pointerEvents="auto";pop.style.zIndex="100040";
 bridgeCfg.tasksCalendar.placePopover(pop,anchorBtn,rootNode);
}
function getStatisticPopupEl() {
	if (!rootNode) {
		return null;
	}
	try {
		if (rootNode._noriaStatPopupEl && rootNode._noriaStatPopupEl.isConnected) {
			return rootNode._noriaStatPopupEl;
		}
	} catch (_) {}
	var pop = null;
	try {
		pop = rootNode.querySelector(".statisticPopup");
	} catch (_) {}
	if (!pop) {
		try {
			var comp = noriaTcMoreCompositeForCal(rootNode);
			if (comp) {
				pop = comp.querySelector(".statisticPopup");
			}
		} catch (_) {}
	}
	if (!pop) {
		try {
			var ownerId = String((rootNode.getAttribute("id") || "").trim());
			if (ownerId) {
				pop = document.querySelector(".statisticPopup[data-noria-owner='" + ownerId.replace(/'/g, "\\'") + "']");
			}
		} catch (_) {}
	}
	try {
		rootNode._noriaStatPopupEl = pop || null;
	} catch (_) {}
	return pop || null;
}
function setStatisticPopupOpenState(open, anchorBtn) {
	if (!rootNode) {
		return;
	}
	var isOpen = !!open;
	if (isOpen) {
		var ensured = getStatisticPopupEl();
		if (!ensured) {
			try {
				setStatisticPopUp();
			} catch (_) {}
		}
		try { rootNode._noriaStatDismissBound = "0"; } catch (_) {}
	}
	rootNode.classList.toggle("stat-open", isOpen);
	try {
		var comp = noriaTcMoreCompositeForCal(rootNode);
		if (comp) {
			comp.classList.toggle("tc-stat-open", isOpen);
		}
	} catch (_) {}
	if(anchorBtn)rootNode._noriaStatAnchor=anchorBtn;
	var btn = anchorBtn || rootNode._noriaStatAnchor || rootNode.querySelector("button.statistic");
	if (btn) {
		try {
			btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
		} catch (_) {}
	}
	var pop = getStatisticPopupEl();
	if (pop) {
		try {
			pop.style.setProperty("display", isOpen ? "block" : "none", "important");
			pop.style.setProperty("visibility", isOpen ? "visible" : "hidden", "important");
			pop.style.setProperty("pointer-events", isOpen ? "auto" : "none", "important");
			pop.setAttribute("aria-hidden", isOpen ? "false" : "true");
		} catch (_) {}
	}
	if (isOpen) {
		try { bindStatisticPopupDismissOnce(anchorBtn || btn || null); } catch (_) {}
	}
}

function bindStatisticPopupDismissOnce(anchorBtn) {
	if (!rootNode || rootNode._noriaStatDismissBound === "1") {
		return;
	}
	rootNode._noriaStatDismissBound = "1";
	var bindTimer = null;
	var clear = function () {
		if (bindTimer) {
			try { clearTimeout(bindTimer); } catch (_) {}
			bindTimer = null;
		}
		try { document.removeEventListener("pointerdown", onDocPointerDown, true); } catch (_) {}
		try { document.removeEventListener("keydown", onDocKeyDown, true); } catch (_) {}
		try { rootNode._noriaStatDismissBound = "0"; } catch (_) {}
		try {
			if (rootNode._noriaStatDismissCleanup === clear) rootNode._noriaStatDismissCleanup = null;
		} catch (_) {}
	};
	rootNode._noriaStatDismissCleanup = clear;
	var onDocPointerDown = function (ev) {
		if (!rootNode || !rootNode.isConnected) {
			clear();
			return;
		}
		if (!rootNode.classList.contains("stat-open")) {
			clear();
			return;
		}
		var target = ev && ev.target ? ev.target : null;
		if (!target) { return; }
		try {
			if (target.closest && (target.closest(".statisticPopup") || target.closest("button.statistic"))) {
				return;
			}
			if (anchorBtn && anchorBtn.contains && anchorBtn.contains(target)) {
				return;
			}
		} catch (_) {}
		try { setStatisticPopupOpenState(false); } catch (_) {}
		clear();
	};
	var onDocKeyDown = function (ev) {
		if (!rootNode || !rootNode.isConnected) {
			clear();
			return;
		}
		if (!rootNode.classList.contains("stat-open")) {
			clear();
			return;
		}
		if (!ev || ev.key !== "Escape") { return; }
		try { setStatisticPopupOpenState(false); anchorBtn?.focus({ preventScroll: true }); } catch (_) {}
		clear();
	};
	bindTimer = setTimeout(function () {
		bindTimer = null;
		if (tcRuntimeDisposed || !rootNode || !rootNode.isConnected) {
			clear();
			return;
		}
		try { document.addEventListener("pointerdown", onDocPointerDown, true); } catch (_) {}
		try { document.addEventListener("keydown", onDocKeyDown, true); } catch (_) {}
	}, 0);
}
function toggleStatisticPopupForButton(anchorBtn) {
	if (!rootNode) {
		return;
	}
	try {
		var nowTs = Date.now();
		var lastTs = Number(rootNode._noriaStatToggleTs || 0);
		if (nowTs - lastTs < 120) {
			return;
		}
		rootNode._noriaStatToggleTs = nowTs;
	} catch (_) {}
	var open = !rootNode.classList.contains("stat-open");
	setStatisticPopupOpenState(open, anchorBtn);
	if (open) {
		var pop = getStatisticPopupEl();
		if (pop) {
			renderStatisticScope(pop);
			try {
				pop.classList.add("active");
				pop.style.setProperty("display", "block", "important");
				pop.style.setProperty("visibility", "visible", "important");
				pop.style.setProperty("pointer-events", "auto", "important");
				pop.style.setProperty("z-index", "100060", "important");
			} catch (_) {}
		}
	}
	if (!open || !anchorBtn) {
		return;
	}
	try {
		positionStatisticPopup(anchorBtn);
	} catch (_) {}
	try {
		requestAnimationFrame(function () {
			try { positionStatisticPopup(anchorBtn); (getStatisticPopupEl()?.querySelector("li.active") || getStatisticPopupEl()?.querySelector("li[data-group]"))?.focus({ preventScroll: true }); } catch (_) {}
		});
	} catch (_) {}
}

function setWrapperEvents() {
	rootNode.querySelectorAll('.wrapperButton').forEach(wBtn => wBtn.addEventListener('click', (() => {
		var week = wBtn.getAttribute("data-week");
		var year = wBtn.getAttribute("data-year");
		selectedDate = taskCalendarConfiguredWeekStart(moment(moment(year).add(week, "weeks")));
		getWeek(tasks, selectedDate);
	})));
};

function currentStatisticFocus() {
	return ["done", "due", "overdue", "start", "scheduled", "recurrence", "dailyNote"].find(function (group) {
		return rootNode.classList.contains("focus" + capitalize(group));
	}) || "";
}
function syncQuadrantFocusCounts() {
	var group = currentStatisticFocus();
	rootNode.querySelectorAll(".quadrant").forEach(function (section) {
		var items = Array.from(section.querySelectorAll(".qTask"));
		var count = items.filter(function (el) { return !group || (el.getAttribute("data-tc-kinds") || el.getAttribute("data-tc-kind") || "").split(" ").includes(group); }).length;
		section.querySelector(".qCount").textContent = String(count);
		var empty = section.querySelector(".qEmpty");
		if (!empty) { empty = section.ownerDocument.createElement("div"); empty.className = "qEmpty"; section.querySelector(".qContent").appendChild(empty); }
		empty.textContent = tcRuntimeT("runtime.tasksCalendar.eisenhower.empty"); empty.hidden = count > 0;
	});
}
function setStatisticPopUpEvents() {
	var popup = getStatisticPopupEl();
	if (!popup) return;
	var rows = Array.from(popup.querySelectorAll("li[data-group]"));
	rows.forEach(function (li) {
		li.tabIndex = 0; li.setAttribute("role", "button");
		function paint() {
			rows.forEach(function (row) {
				var selected = row.dataset.group === currentStatisticFocus();
				row.classList.toggle("active", selected); row.setAttribute("aria-pressed", String(selected));
			});
		}
		paint();
		li.addEventListener("click", function () {
			var group = li.dataset.group, previous = currentStatisticFocus();
			rootNode.classList.remove("filter");
			rootNode.classList.remove.apply(rootNode.classList, Array.from(rootNode.classList).filter(function (v) { return v.startsWith("focus"); }));
			if (previous !== group) rootNode.classList.add("focus" + capitalize(group));
			paint(); syncQuadrantFocusCounts();
		});
		li.addEventListener("keydown", function (e) {
			if (e.key === "Enter" || e.key === " ") { e.preventDefault(); li.click(); }
			var index = rows.indexOf(li);
			if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Home" || e.key === "End") {
				e.preventDefault(); index = e.key === "Home" ? 0 : e.key === "End" ? rows.length - 1 : (index + (e.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length;
				rows[index].focus();
			}
		});
	});
}
function normalizeFilterNumber(raw) {
	var n = parseInt(String(raw || "").trim(), 10);
	return Number.isFinite(n) ? n : NaN;
}

function setFilterJumpStatus(text, tone) {
	var status = rootNode.querySelector(".filterContext .jumpStatus");
	if (!status) { return; }
	status.textContent = String(text || "");
	status.setAttribute("data-tone", String(tone || "info"));
	status.setAttribute("data-prefix", tcTaskTimelineMode && String(tone || "info") == "info" ? (tcRuntimeT("runtime.tasksCalendar.css.timelineMode") + " · ") : "");
}

function harmonizeFilterJumpLabels() {
	var menu = rootNode.querySelector(".filterContext");
	if (!menu) { return; }
	var btns = Array.from(menu.querySelectorAll(".jumpBtn"));
	if (tcTaskTimelineMode) {
		if (btns[0]) { btns[0].textContent = tcRuntimeT("runtime.tasksCalendar.jump.toWeek"); }
	} else {
	if (btns[0]) { btns[0].textContent = tcRuntimeT("runtime.tasksCalendar.jump.toYear"); }
	if (btns[1]) { btns[1].textContent = tcRuntimeT("runtime.tasksCalendar.jump.toMonth"); }
	if (btns[2]) { btns[2].textContent = tcRuntimeT("runtime.tasksCalendar.jump.toWeek"); }
	}
	var status = menu.querySelector(".jumpStatus");
	if (status && status.getAttribute("data-tone") == "info") {
		status.textContent = tcTaskTimelineMode ? tcRuntimeT("runtime.tasksCalendar.jump.hintWeek") : tcRuntimeT("runtime.tasksCalendar.jump.hintFull");
		status.setAttribute("data-prefix", tcTaskTimelineMode ? (tcRuntimeT("runtime.tasksCalendar.css.timelineMode") + " · ") : "");
	}
}

function prefillFilterJumpInputs() {
	var menu = rootNode.querySelector(".filterContext");
	if (!menu) { return; }
	var anchor = moment(selectedDate || calendarNow());
	var y = menu.querySelector(".jumpYear");
	var m = menu.querySelector(".jumpMonth");
	var d = menu.querySelector(".jumpDay");
	if (y && !String(y.value || "").trim()) { y.value = anchor.format("YYYY"); }
	if (m && !String(m.value || "").trim()) { m.value = anchor.format("MM"); }
	if (d && !String(d.value || "").trim()) { d.value = anchor.format("DD"); }
}

function flashJumpTarget(dateText) {
	if (!dateText) { return; }
	rootNode.querySelectorAll(".cell.jumpTarget").forEach((n) => n.classList.remove("jumpTarget"));
	var targetCell = rootNode.querySelector(".cell[data-date='" + dateText + "']");
	if (!targetCell) { return; }
	targetCell.classList.add("jumpTarget");
	setTimeout(() => targetCell.classList.remove("jumpTarget"), 2400);
}

function jumpToExplicitDate(mode) {
	var menu = rootNode.querySelector(".filterContext");
	if (!menu) { return false; }
	var year = normalizeFilterNumber(menu.querySelector(".jumpYear")?.value);
	var month = normalizeFilterNumber(menu.querySelector(".jumpMonth")?.value);
	var dayRaw = normalizeFilterNumber(menu.querySelector(".jumpDay")?.value);
	if (!Number.isFinite(year) || !Number.isFinite(month)) {
		setFilterJumpStatus(tcRuntimeT("runtime.tasksCalendar.jump.invalidYearMonth"), "warn");
		return false;
	}
	var day = Number.isFinite(dayRaw) ? dayRaw : 1;
	var target = moment(String(year) + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0"), "YYYY-MM-DD", true);
	if (!target.isValid()) {
		setFilterJumpStatus(tcRuntimeT("runtime.tasksCalendar.jump.invalidDate"), "warn");
		return false;
	}
	if (tcTaskTimelineMode) {
		selectedDate = taskCalendarConfiguredWeekStart(moment(target));
		getWeek(tasks, selectedDate);
		requestAnimationFrame(() => flashJumpTarget(moment(target).format("YYYY-MM-DD")));
		setFilterJumpStatus(tcRuntimeT("runtime.tasksCalendar.jump.doneWeek", { week: moment(selectedDate).format("YYYY-[W]w") }), "ok");
		return true;
	}
	if (mode == "year") {
		selectedDate = moment(target).startOf("year");
		getMonth(tasks, selectedDate);
		setFilterJumpStatus(tcRuntimeT("runtime.tasksCalendar.jump.doneDate", { date: moment(target).format("YYYY") }), "ok");
		return true;
	}
	if (mode == "month") {
		selectedDate = moment(target).startOf("month");
		getMonth(tasks, selectedDate);
		setFilterJumpStatus(tcRuntimeT("runtime.tasksCalendar.jump.doneDate", { date: moment(target).format("YYYY-MM") }), "ok");
		return true;
	}
	if (mode == "day") {
		selectedDate = moment(target).startOf("day");
		getDay(tasks, selectedDate);
		setFilterJumpStatus(tcRuntimeT("runtime.tasksCalendar.jump.doneDate", { date: moment(target).format("YYYY-MM-DD") }), "ok");
		return true;
	}
	selectedDate = taskCalendarConfiguredWeekStart(moment(target));
	getWeek(tasks, selectedDate);
	if (mode == "week" || mode == "day") {
		requestAnimationFrame(() => flashJumpTarget(moment(target).format("YYYY-MM-DD")));
	}
	setFilterJumpStatus(tcRuntimeT("runtime.tasksCalendar.jump.doneDate", { date: moment(target).format("YYYY-MM-DD") }), "ok");
	return true;
}

function setFilterContextEvents() {
	rootNode.querySelectorAll(".filterContext .jumpBtn").forEach((btn) => btn.addEventListener("click", (evt) => {
		evt.preventDefault();
		evt.stopPropagation();
		var mode = String(btn.getAttribute("data-jump") || "").trim();
		if (!mode) { return; }
		var ok = jumpToExplicitDate(mode);
		if (!ok) { return; }
	}));
	rootNode.querySelectorAll(".filterContext li").forEach((li) => li.addEventListener("click", () => {
		if (li.classList.contains("filterJump")) { return; }
		var action = li.getAttribute("data-action");
		if (action == "this-week") {
			selectedDate = taskCalendarConfiguredWeekStart(calendarNow());
			getWeek(tasks, selectedDate);
		} else if (action == "this-month") {
			selectedDate = calendarNow().date(1);
			getMonth(tasks, selectedDate);
		}
		rootNode.querySelector(".filterContext")?.classList.remove("active");
	}));
	rootNode.querySelectorAll(".filterContext .jumpInputs input").forEach((input) => input.addEventListener("keydown", (evt) => {
		if (evt.key !== "Enter") { return; }
		evt.preventDefault();
		jumpToExplicitDate("week");
	}));
}

function setFilterContext() {
	rootNode.querySelectorAll(".filterContext").forEach((n) => n.remove());
	var items = "";
	items += "<li data-action='this-week'>" + tcRuntimeT("runtime.tasksCalendar.jump.thisWeek") + "</li>";
	if (!tcTaskTimelineMode) {
	items += "<li data-action='this-month'>" + tcRuntimeT("runtime.tasksCalendar.jump.thisMonth") + "</li>";
	}
	items += "<li class='break'></li>";
	items += "<li class='filterJump' data-action='none'>";
	items += "<div class='jumpInputs'>";
	items += "<input class='jumpYear' type='number' min='2000' max='2099' placeholder='YYYY'/>";
	items += "<input class='jumpMonth' type='number' min='1' max='12' placeholder='MM'/>";
	items += "<input class='jumpDay' type='number' min='1' max='31' placeholder='DD'/>";
	items += "</div>";
	items += "<div class='jumpButtons'>";
	if (!tcTaskTimelineMode) {
	items += "<button type='button' class='jumpBtn' data-jump='year'>" + tcRuntimeT("runtime.tasksCalendar.jump.toYear") + "</button>";
	items += "<button type='button' class='jumpBtn' data-jump='month'>" + tcRuntimeT("runtime.tasksCalendar.jump.toMonth") + "</button>";
	}
	items += "<button type='button' class='jumpBtn' data-jump='week'>" + tcRuntimeT("runtime.tasksCalendar.jump.toWeek") + "</button>";
	items += "</div>";
	items += "<div class='jumpStatus' data-tone='info' data-prefix='" + (tcTaskTimelineMode ? escapeHtmlAttr(tcRuntimeT("runtime.tasksCalendar.css.timelineMode") + " · ") : "") + "'>" + (tcTaskTimelineMode ? tcRuntimeT("runtime.tasksCalendar.jump.hintWeek") : tcRuntimeT("runtime.tasksCalendar.jump.hintFull")) + "</div>";
	items += "</li>";
	rootNode.appendChild(ctx.el("ul", items, {cls: "filterContext"}));
	harmonizeFilterJumpLabels();
	setFilterContextEvents();
}

function statisticScopeRows(view, policy, tags) {
	var rows = [];
	if (view === "month") rows.push(["timeline", policy.includeTimelineInMonth ? "shown" : "hidden"]);
	rows.push(["cancelled", policy.includeCancelled ? "shown" : "hidden"]);
	rows.push(["overdueTimeline", policy.excludeOverdueTimeline ? "notCarried" : "carried"]);
	if (tags.includeTags.length) rows.push(["includeTags", tags.includeTags.join(", "), true]);
	if (tags.excludeTags.length) rows.push(["excludeTags", tags.excludeTags.join(", "), true]);
	return rows;
}

function renderStatisticScope(popup) {
	var old = popup.querySelector(".tc-stat-scope-row");
	if (old) old.remove();
	var item = document.createElement("li");
	item.className = "tc-stat-scope-row";
	var details = document.createElement("details");
	details.className = "tc-stat-scope";
	var summary = document.createElement("summary");
	var month = rootNode.getAttribute("view") === "month";
	summary.textContent = tcRuntimeT("runtime.tasksCalendar.scope." + (month ? (runtimeTaskQueryPolicy.includeTimelineInMonth ? "monthWithTimeline" : "monthWithoutTimeline") : "title"));
	details.appendChild(summary);
	var list = document.createElement("dl");
	statisticScopeRows(rootNode.getAttribute("view"), runtimeTaskQueryPolicy, runtimeTaskTagFilter).forEach(function (row) {
		var label = document.createElement("dt"), value = document.createElement("dd");
		label.textContent = tcRuntimeT("runtime.tasksCalendar.scope." + row[0]);
		value.textContent = row[2] ? row[1] : tcRuntimeT("runtime.tasksCalendar.scope." + row[1]);
		list.append(label, value);
	});
	details.appendChild(list);
	var note = document.createElement("p");
	note.textContent = tcRuntimeT("runtime.tasksCalendar.scope.timelineTags");
	if (runtimeTaskTagFilter.excludeTags.length) note.textContent += " " + tcRuntimeT("runtime.tasksCalendar.scope.timelineException");
	details.appendChild(note);
	var openSettings = bridgeCfg.runtime && bridgeCfg.runtime.openTaskFilterSettings;
	if (typeof openSettings === "function") {
		var button = document.createElement("button");
		button.type = "button"; button.className = "tc-stat-scope-settings";
		button.textContent = tcRuntimeT("runtime.tasksCalendar.scope.settings");
		button.addEventListener("click", function () {
			setStatisticPopupOpenState(false);
			openSettings();
		});
		details.appendChild(button);
	}
	details.addEventListener("toggle", function () {
		if (rootNode.classList.contains("stat-open")) positionStatisticPopup(rootNode._noriaStatAnchor||rootNode.querySelector("button.statistic"));
	});
	item.appendChild(details); popup.appendChild(item);
}

function setStatisticPopUp() {
	rootNode.querySelectorAll(".statisticPopup").forEach((n) => n.remove());
	try {
		var comp0 = noriaTcMoreCompositeForCal(rootNode);
		if (comp0) {
			comp0.querySelectorAll(".statisticPopup").forEach(function (n) {
				try { n.remove(); } catch (_) {}
			});
		}
	} catch (_) {}
	try {
		var owner0 = String((rootNode.getAttribute("id") || "").trim());
		if (owner0) {
			document.querySelectorAll(".statisticPopup[data-noria-owner='" + owner0.replace(/'/g, "\\'") + "']").forEach(function (n) {
				try { n.remove(); } catch (_) {}
			});
		}
	} catch (_) {}
	setStatisticPopupOpenState(false);
	var statistic = "<li id='statisticDone' data-group='done'></li>";
	statistic += "<li id='statisticDue' data-group='due'></li>";
	statistic += "<li id='statisticOverdue' data-group='overdue'></li>";
	statistic += "<li class='break'></li>";
	statistic += "<li id='statisticStart' data-group='start'></li>";
	statistic += "<li id='statisticScheduled' data-group='scheduled'></li>";
	statistic += "<li id='statisticRecurrence' data-group='recurrence'></li>";
	statistic += "<li class='break'></li>";
	statistic += "<li id='statisticDailyNote' data-group='dailyNote'></li>";
	var popup = null;
	try {
		popup = document.createElement("ul");
		popup.className = "statisticPopup";
		popup.innerHTML = statistic;
	} catch (_) {
		popup = null;
	}
	if (!popup && typeof ctx !== "undefined" && ctx && typeof ctx.el === "function") {
		try {
			popup = ctx.el("ul", statistic, {cls: "statisticPopup"});
		} catch (_) {
			popup = null;
		}
	}
	if (!popup) {
		return;
	}
	try {
		popup.classList.add("noria-statistic-popup");
		popup.classList.add("noria-statistic-popup-floating");
		popup.setAttribute("aria-hidden", "true");
		var ownerId = String((rootNode.getAttribute("id") || "").trim());
		if (ownerId) {
			popup.setAttribute("data-noria-owner", ownerId);
		}
		popup.style.position = "fixed";
		popup.style.margin = "0";
		popup.style.padding = "8px";
		popup.style.minWidth = "214px";
		popup.style.maxHeight = "360px";
		popup.style.overflowY = "auto";
		popup.style.listStyle = "none";
		popup.style.borderRadius = "14px";
		popup.style.border = "1px solid rgba(148,163,184,.34)";
		popup.style.background = "var(--background-primary)";
		popup.style.boxShadow = "var(--shadow-s)";
		popup.style.display = "none";
		popup.style.visibility = "hidden";
		popup.style.pointerEvents = "none";
	} catch (_) {}
	var mount = (document && document.body) ? document.body : rootNode;
	mount.appendChild(popup);
	try {
		rootNode._noriaStatPopupEl = popup;
	} catch (_) {}
	if (popup) { popup.classList.remove("active"); }
	setStatisticPopUpEvents();
};

function setWeekViewContext() {
	rootNode.querySelectorAll(".weekViewContext").forEach((n) => n.remove());
};

function applyWeekCurrentTitle(week) {
	var currentBtn = rootNode.querySelector("button.current");
	if (!currentBtn) { return; }
	var inner = taskCalendarDateHeading(week,'week');
	currentBtn.innerHTML = wrapToolbarPeriodLabelHtml(inner);
}
function applyDayCurrentTitle(day) {
	var currentBtn = rootNode.querySelector("button.current");
	if (!currentBtn) { return; }
	var inner = taskCalendarDateHeading(day,'day');
	currentBtn.innerHTML = wrapToolbarPeriodLabelHtml(inner);
}
function unbindPlannerChromeNowNeedleListeners() {
	if (!rootNode || !rootNode._noriaNeedleListenerCleanups) { return; }
	rootNode._noriaNeedleListenerCleanups.forEach(function (fn) {
		try { fn(); } catch (_) {}
	});
	rootNode._noriaNeedleListenerCleanups = [];
}
/** 日/周表当前时刻线：grid 级 accent 圆点 + 长渐隐时针；整点刻度始终保留。 */
var PLANNER_CHROME_AXIS_MARK_OVERLAP_CLASS = "tc-planner-axis-mark--needle-overlap";
function plannerChromeUpdateDayAxisMarksNeedleOverlap() {
	if (!rootNode || rootNode.getAttribute("view") !== "day" || !isPlannerChromeActive(rootNode, ["day"])) {
		return;
	}
	var axis = rootNode.querySelector(":scope > .grid > .timeAxisGlobal");
	if (!axis || !axis.querySelectorAll) {
		return;
	}
	var marks = axis.querySelectorAll(":scope > .mark");
	for (var mi = 0; mi < marks.length; mi++) {
		try {
			marks[mi].classList.remove(PLANNER_CHROME_AXIS_MARK_OVERLAP_CLASS);
		} catch (_) {}
	}
}
function getPlannerChromeNowNeedleLane() {
	if (!rootNode) { return null; }
	var today = calendarNow().format("YYYY-MM-DD");
	return rootNode.querySelector(".cell[data-date=\"" + today + "\"] .timeLane");
}
function updatePlannerChromeNowNeedleA11y(needle) {
	if (!needle) { return; }
	var timeLbl = calendarNow().format("HH:mm");
	try {
		needle.setAttribute("aria-label", timeLbl);
		needle.setAttribute("title", timeLbl);
	} catch (_) {}
}
function getPlannerChromeNowTimelinePosition(grid) {
	if (!rootNode || !grid) { return null; }
	var dayStart = getPlannerChromeTimelineStartMin();
	var dayEnd = getPlannerChromeTimelineEndMin();
	var nowMoment = calendarNow();
	var nowMin = nowMoment.hours() * 60 + nowMoment.minutes() + nowMoment.seconds() / 60;
	if (nowMin < dayStart || nowMin > dayEnd) {
		return null;
	}
	var lane = getPlannerChromeNowNeedleLane();
	if (!lane) {
		return null;
	}
	var pct = Math.max(0, Math.min(1, (nowMin - dayStart) / Math.max(1, (dayEnd - dayStart))));
	var cs = getComputedStyle(rootNode);
	var axisTop = parseFloat(cs.getPropertyValue("--time-axis-top"));
	var laneH = parseFloat(cs.getPropertyValue("--time-lane-height"));
	if (!Number.isFinite(axisTop)) {
		axisTop = 0;
	}
	if (!Number.isFinite(laneH) || laneH < 1) {
		laneH = lane.scrollHeight || lane.clientHeight || parseFloat(getComputedStyle(lane).height) || 1;
		try {
			var laneRect = lane.getBoundingClientRect();
			var gridRect = grid.getBoundingClientRect();
			var rectTop = laneRect.top - gridRect.top;
			if (Number.isFinite(rectTop)) {
				axisTop = Math.max(0, rectTop);
			}
		} catch (_) {}
	}
	return {
		top: Math.max(0, axisTop + pct * laneH),
		nowMin: nowMin,
		dayStart: dayStart,
		dayEnd: dayEnd
	};
}
function syncPlannerChromeNowNeedleSpan(needle, grid) {
	if (!needle || !grid) { return; }
	var lane = getPlannerChromeNowNeedleLane();
	if (!lane || !lane.getBoundingClientRect || !grid.getBoundingClientRect) { return; }
	try {
		var laneRect = lane.getBoundingClientRect();
		var gridRect = grid.getBoundingClientRect();
		var left = Math.max(0, Math.round(laneRect.left - gridRect.left));
		var width = Math.max(16, Math.round(laneRect.width));
		needle.style.setProperty("--tc-now-needle-left", left + "px");
		needle.style.setProperty("--tc-now-needle-width", width + "px");
	} catch (_) {}
}
function refreshPlannerChromeNowOnlyPosition() {
	if (!shouldShowPlannerChromeNowNeedleForActiveView()) { return; }
	rootNode.querySelectorAll(".tc-now-needle").forEach(function (needle) {
		var par = needle.parentElement;
		if (!par || !par.classList) { return; }
		if (!par.classList.contains("grid")) {
			return;
		}
		var pos = getPlannerChromeNowTimelinePosition(par);
		if (!pos) {
			needle.style.display = "none";
			return;
		}
		syncPlannerChromeNowNeedleSpan(needle, par);
		needle.style.display = "";
		needle.style.top = pos.top + "px";
		updatePlannerChromeNowNeedleA11y(needle);
	});
	try {
		plannerChromeUpdateDayAxisMarksNeedleOverlap();
	} catch (_) {}
}
function bindPlannerChromeNowNeedleListeners() {
	unbindPlannerChromeNowNeedleListeners();
	if (!shouldShowPlannerChromeNowNeedleForActiveView()) { return; }
	var rafId = null;
	function scheduleRepos() {
		if (rafId != null) { return; }
		rafId = requestAnimationFrame(function () {
			rafId = null;
			try { refreshPlannerChromeNowOnlyPosition(); } catch (_) {}
		});
	}
	var cleanups = [];
	var lanes = rootNode.querySelectorAll(".cell .timeLane");
	for (var i = 0; i < lanes.length; i++) {
		(function (lane) {
			try {
				lane.addEventListener("scroll", scheduleRepos, { passive: true });
			} catch (_) {
				lane.addEventListener("scroll", scheduleRepos);
			}
			cleanups.push(function () {
				try { lane.removeEventListener("scroll", scheduleRepos); } catch (_) {}
			});
		})(lanes[i]);
	}
	try {
		window.addEventListener("resize", scheduleRepos, { passive: true });
	} catch (_) {
		window.addEventListener("resize", scheduleRepos);
	}
	cleanups.push(function () {
		try { window.removeEventListener("resize", scheduleRepos); } catch (_) {}
	});
	rootNode._noriaNeedleListenerCleanups = cleanups;
}
function refreshPlannerChromeNowNeedle() {
	if (!isPlannerChromeTimelineView(rootNode, ["week", "day"])) { return; }
	unbindPlannerChromeNowNeedleListeners();
	rootNode.querySelectorAll(".tc-now-needle").forEach((n) => { try { n.remove(); } catch (_) {} });
	if (!shouldShowPlannerChromeNowNeedleForActiveView()) {
		if (rootNode._noriaNowNeedleTimer) {
			try { clearInterval(rootNode._noriaNowNeedleTimer); } catch (_) {}
			rootNode._noriaNowNeedleTimer = null;
		}
		return;
	}
	var today = calendarNow().format("YYYY-MM-DD");
	var lanes = rootNode.querySelectorAll(".cell[data-date=\"" + today + "\"] .timeLane");
	/* 导航到不含\"今天\"的周时，勿给每一列插针（否则多根横线/误判为异常控件） */
	if (!lanes.length) {
		return;
	}
	var doc = getTasksCalendarDocument();
	var grid = rootNode.querySelector(":scope > .grid");
	if (!grid) {
		return;
	}
	var initialPosition = getPlannerChromeNowTimelinePosition(grid);
	if (!initialPosition) {
		return;
	}
	var needle = doc.createElement("div");
	needle.className = "tc-now-needle";
	needle.setAttribute("data-noria-now-needle", "1");
	needle.setAttribute("data-noria-now-layer", "planner-grid");
	var inner = doc.createElement("div");
	inner.className = "tc-now-needle-inner";
	var dot = doc.createElement("span");
	dot.className = "tc-now-needle-dot";
	dot.setAttribute("aria-hidden", "true");
	var hand = doc.createElement("span");
	hand.className = "tc-now-needle-hand";
	hand.setAttribute("aria-hidden", "true");
	var line = doc.createElement("span");
	line.className = "tc-now-needle-line";
	line.setAttribute("aria-hidden", "true");
	hand.appendChild(line);
	inner.appendChild(dot);
	inner.appendChild(hand);
	needle.appendChild(inner);
	var mount = grid;
	mount.appendChild(needle);
	syncPlannerChromeNowNeedleSpan(needle, grid);
	needle.style.top = initialPosition.top + "px";
	updatePlannerChromeNowNeedleA11y(needle);
	refreshPlannerChromeNowOnlyPosition();
	bindPlannerChromeNowNeedleListeners();
	if (!rootNode._noriaNowNeedleTimer) {
		try {
			rootNode._noriaNowNeedleTimer = setInterval(function () {
				try {
					refreshPlannerChromeNowOnlyPosition();
					plannerChromeUpdateDayAxisMarksNeedleOverlap();
				} catch (_) {}
			}, 60000);
		} catch (_) {}
	}
	try {
		plannerChromeUpdateDayAxisMarksNeedleOverlap();
	} catch (_) {}
	requestAnimationFrame(function () {
		try {
			plannerChromeUpdateDayAxisMarksNeedleOverlap();
		} catch (_) {}
	});
}
function renderDayClockOverlay(gridEl) {
	rootNode.querySelectorAll(".tc-day-clock-overlay").forEach((n) => { try { n.remove(); } catch (_) {} });
	if (shouldShowPlannerChromeNowNeedleForActiveView()) { return; }
	if (!tcFeatureFlags.clockOverlay) { return; }
	if (!gridEl || rootNode.getAttribute("view") !== "day") { return; }
	var lane = gridEl.querySelector(".cell .timeLane");
	if (!lane) { return; }
	var clock = document.createElement("div");
	clock.className = "tc-day-clock-overlay";
	clock.innerHTML = "<div class='tc-day-clock-face'><div class='tc-day-clock-hand'></div><div class='tc-day-clock-dot'></div></div><div class='tc-day-clock-label'>--:--</div>";
	rootNode.appendChild(clock);
	var hand = clock.querySelector(".tc-day-clock-hand");
	var label = clock.querySelector(".tc-day-clock-label");
	var update = function () {
		if (!lane || !hand || !label) { return; }
		var now = (typeof moment === "function") ? calendarNow() : null;
		var minutes = now && now.isValid && now.isValid()
			? (now.hours() * 60 + now.minutes())
			: 0;
		var hh = Math.floor(minutes / 60) % 24;
		var mm = minutes % 60;
		hand.style.transform = "rotate(" + ((minutes / (24 * 60)) * 360).toFixed(3) + "deg)";
		label.textContent = String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
	};
	update();
}

function applyPlannerChromeTimelineAxis() {
	var grid = rootNode.querySelector(":scope > .grid");
	if (!grid) { return; };
	grid.querySelectorAll(":scope > .timeAxisGlobal").forEach(node => node.remove());
	if (!isTimelineCalendarView()) { return; };
	if (!isPlannerChromeActive(rootNode, ["week", "day"])) { return; };
	var axis = getTasksCalendarDocument().createElement("div");
	axis.className = "timeAxisGlobal";
	var laneTop = 18;
	var slotHeight = parseFloat(getComputedStyle(rootNode).getPropertyValue("--time-slot-height"));
	if (!Number.isFinite(slotHeight) || slotHeight < 18) { slotHeight = 60; }
	var startMin = getPlannerChromeTimelineStartMin(), endMin = getPlannerChromeTimelineEndMin();
	var slotCount = (endMin - startMin) / 60;
	var firstLane = rootNode.querySelector(".cell .timeLane");
	if (firstLane) {
		var gridRect = grid.getBoundingClientRect();
		var laneRect = firstLane.getBoundingClientRect();
		laneTop = Math.max(0, Math.round(laneRect.top - gridRect.top));
	}
	var laneHeightPx = parseFloat(getComputedStyle(rootNode).getPropertyValue("--time-lane-height"));
	if (!Number.isFinite(laneHeightPx) || laneHeightPx <= 0) {
		laneHeightPx = Math.max(360, Math.round(slotHeight * slotCount));
	}
	rootNode.style.setProperty("--time-axis-top", String(laneTop) + "px");
	axis.style.top = laneTop + "px";
	/* 高度与 .timeLane 一致：由 CSS var(--time-lane-height) 驱动，避免与刻度块累计高度双源漂移 */
	try {
		axis.style.height = "";
	} catch (_) {}
	plannerHoursAxisMarks(startMin, endMin, laneHeightPx).forEach(function (minute) {
		var mark = getTasksCalendarDocument().createElement("div");
		mark.className = "mark";
		mark.textContent = minutesToTimeStr(minute);

		mark.style.position = "absolute";
		mark.style.top = ((minute - startMin) / (endMin - startMin) * laneHeightPx) + "px";
		mark.style.height = "0px"; mark.style.minHeight = "0px";
		if (minute === endMin) {
			mark.classList.add("tc-planner-axis-end-mark");
		}
		axis.appendChild(mark);
	});
	grid.prepend(axis);
	try { refreshPlannerChromeNowNeedle(); } catch (_) {}
};

function plannerHoursAxisMarks(start, end, height) {
	var result = [start], span = end - start;
	for (var m = Math.ceil(start / 60) * 60; m < end; m += 60) {
		if ((m - result[result.length - 1]) / span * height >= 15 && (end - m) / span * height >= 15) result.push(m);
	}
	result.push(end); return result;
}
function applyPlannerChromeAdaptiveSizing() {
	if (!isPlannerChromeTimelineView(rootNode, ["week", "day"])) { return; }
	var grid = rootNode.querySelector(":scope > .grid");
	if (!grid) { return; }
	var firstCell = grid.querySelector(":scope > .cell");
	if (!firstCell) { return; }
	if (rootNode._noriaPlannerSizingGrid !== grid) {
		rootNode._noriaPlannerSizingObserver?.disconnect();
		var previousSize = "";
		rootNode._noriaPlannerSizingObserver = new (rootNode.ownerDocument.defaultView.ResizeObserver)(function (entries) {
			var rect = entries[0].contentRect;
			var size = rect.width.toFixed(1) + "|" + rect.height.toFixed(1);
			if (size === previousSize || tcRuntimeDisposed || !rootNode.isConnected) { return; }
			previousSize = size;
			if (!plannerChromeInteractionActive) schedulePlannerChromeStableTimelineReflow(rootNode);
		});
		rootNode._noriaPlannerSizingGrid = grid;
		rootNode._noriaPlannerSizingObserver.observe(grid);
	}
	var viewportHeight = window.innerHeight || document.documentElement.clientHeight || 900;
	var gridRect = grid.getBoundingClientRect();
	function rectHeightOf(el) {
		if (!el || !el.getBoundingClientRect) { return 0; }
		try {
			var r = el.getBoundingClientRect();
			return r && Number.isFinite(r.height) ? r.height : 0;
		} catch (_) {
			return 0;
		}
	}
	function findSizingHost() {
		var sels = [
			".noria-tasks-host",
			".noria-task-timeline-host",
			".view-content",
			".workspace-leaf-content",
			".workspace-leaf"
		];
		for (var si = 0; si < sels.length; si++) {
			try {
				var h = rootNode.closest(sels[si]);
				if (h && rectHeightOf(h) >= 260) { return h; }
			} catch (_) {}
		}
		try {
			if (rootNode.parentElement && rectHeightOf(rootNode.parentElement) >= 260) {
				return rootNode.parentElement;
			}
		} catch (_) {}
		return null;
	}
	syncPlannerChromeDayBucketPeekVar(rootNode);
	var slotCount = (getPlannerChromeTimelineEndMin() - getPlannerChromeTimelineStartMin()) / 60;
	var host = findSizingHost();
	var hostBottom = host ? Math.min(viewportHeight, host.getBoundingClientRect().bottom) : viewportHeight;
	// ItemViews already give the grid the remaining pane height. Measure that frame,
	// not an estimated header + a hidden boundary or rounded hourly slot count.
	var fixedPane = rootNode.closest(".noria-tasks-host, .noria-task-timeline-host");
	var frameHeight = fixedPane && gridRect.height > 120 ? gridRect.height : hostBottom - gridRect.top - 16;
	var gridStyle = getComputedStyle(grid);
	var bottomInset = parseFloat(gridStyle.paddingBottom) || 0;
	var isDayView = rootNode.getAttribute("view") === "day";
	var headHeight = isDayView ? 0 : rectHeightOf(firstCell.querySelector(".cellName"));
	var boundaryHeight = rectHeightOf(firstCell.querySelector(".tc-hours-boundary"));
	var firstLane = firstCell.querySelector(".timeLane");
	var laneTop = firstLane ? firstLane.getBoundingClientRect().top - gridRect.top : headHeight;
	var bottomSafe = 16;
	var laneHeight = Math.max(120, Math.floor(frameHeight - bottomInset - laneTop - bottomSafe));
	var slotHeight = laneHeight / slotCount;
	var density = slotHeight >= 30 ? "comfortable" : (slotHeight >= 20 ? "tight" : "micro");
	rootNode.style.setProperty("--tc-planner-cell-head-height", headHeight + "px");
	rootNode.style.setProperty("--tc-planner-boundary-height", boundaryHeight + "px");
	try {
		rootNode.classList.add("tc-planner-no-scroll-fit");
		rootNode.setAttribute("data-tc-density", density);
		rootNode.style.setProperty("--tc-planner-axis-font-size", density === "micro" ? "9px" : (density === "tight" ? "10px" : "11px"));
		rootNode.style.setProperty("--tc-planner-task-font-size", density === "micro" ? "10px" : (density === "tight" ? "11px" : "12px"));
		rootNode.style.setProperty("--tc-planner-time-font-size", density === "micro" ? "8.5px" : (density === "tight" ? "9px" : "10px"));
		rootNode.style.setProperty("--tc-planner-lane-bottom-safe", String(bottomSafe) + "px");
		rootNode.style.setProperty("--tc-planner-lane-visual-height", String(laneHeight + bottomSafe) + "px");
	} catch (_) {}
	rootNode.style.setProperty("--time-slot-height", String(slotHeight) + "px");
	rootNode.style.setProperty("--time-lane-height", String(laneHeight) + "px");
	rootNode.style.setProperty("--tc-hour-grid-offset", String(((60 - getPlannerChromeTimelineStartMin() % 60) % 60) / 60 * slotHeight) + "px");
}

function enforcePlannerChromeWeekGridLayout(options) {
	if (!isPlannerChromeTimelineView(rootNode, ["week", "day"])) { return; }
	var grid = rootNode.querySelector(":scope > .grid");
	if (!grid) { return; }
	var isDay = rootNode.getAttribute("view") === "day";
	var opts = options || {};
	if (!opts.skipAdaptive) {
		applyPlannerChromeAdaptiveSizing();
	} else {
		syncPlannerChromeDayBucketPeekVar(rootNode);
	}
	grid.style.display = "grid";
	/* 日表：列宽与间距由 default.css 中 var(--tc-planner-axis-col)/var(--tc-planner-axis-gap) 单口维护，勿在此写死 px 以免压过样式表 */
	if (isDay) {
		grid.style.gridTemplateColumns = "";
		grid.style.gridTemplateRows = "auto";
		grid.style.alignItems = "start";
	} else {
		grid.style.gridTemplateColumns = "repeat(7, minmax(0, 1fr))";
		grid.style.gridTemplateRows = "auto";
		grid.style.alignItems = "";
	}
	grid.style.columnGap = "";
	grid.style.rowGap = "0";
	grid.style.width = "";
	grid.style.minWidth = "0";
	grid.style.overflowX = "clip";
	grid.style.overflowY = "clip";
	grid.style.height = "auto";
	grid.style.maxHeight = "none";
	var cells = grid.querySelectorAll(":scope > .cell");
	cells.forEach((cell) => {
		if (isDay) {
			cell.style.gridColumn = "2";
			cell.style.gridRow = "1";
		} else {
			cell.style.gridColumn = "";
			cell.style.gridRow = "";
		}
		cell.style.display = "grid";
		/* 日表无格内日期条：单列 1fr，避免残留 auto 行占位 */
		cell.style.gridTemplateRows = isDay ? "1fr" : "auto 1fr";
		cell.style.alignContent = "start";
		cell.style.minWidth = "0";
	});
}

function syncPlannerChromeWeekDayFocus() {
	if (!isPlannerChromeTimelineView(rootNode, ["week"]) || !tcFeatureFlags.dayView) { return; }
	rootNode.querySelectorAll(".grid > .cell[data-date]").forEach(function (cell) {
		var button = cell.querySelector(".tc-week-day-focus");
		if (!button) {
			button = document.createElement("button");
			button.type = "button";
			button.className = "tc-week-day-focus clickable-icon";
			var date = cell.getAttribute("data-date");
			var label = tcRuntimeT("runtime.tasksCalendar.view.expandDay", { date: date });
			bridge.setTaskEditorIcon(button, "expand", label);
			button.title = label;
			button.setAttribute("aria-label", label);
			button.addEventListener("click", function (event) {
				event.preventDefault();
				event.stopPropagation();
				rootNode.classList.remove("todayFocus");
				getDay(tasks, date);
				rootNode.querySelector(".weekView")?.focus({ preventScroll: true });
			});
			cell.appendChild(button);
		}
		cell.classList.add("tc-week-day-focusable");
		var heading = cell.querySelector(".cellName");
		if (heading) {
			heading.setAttribute("data-day-number", String(Number(cell.getAttribute("data-date").slice(-2))));
			heading.title = cell.getAttribute("data-date");
		}
		cell.classList.toggle("tc-week-day-compact", cell.getBoundingClientRect().width < 100);
		var crowded = !!cell.querySelector(".tc-overflow-more") || Array.from(cell.querySelectorAll(".timeLane > .tc-cal-item[data-overlap-cols]")).some(function (task) {
			return Number(task.getAttribute("data-overlap-cols")) > 1 && task.getBoundingClientRect().width < 72;
		});
		cell.classList.toggle("tc-week-day-crowded", crowded);
	});
}

function planPlannerOverflow(group, laneWidth, enabled) {
	var capacity = Math.max(1, Math.floor(laneWidth / 72));
	var hidden = enabled && laneWidth > 0 ? group.filter(function (item) { return item.col >= capacity; }) : [];
	var summaries = [];
	hidden.slice().sort(function (a, b) { return a.start - b.start || a.end - b.end; }).forEach(function (item) {
		var last = summaries[summaries.length - 1];
		if (last && item.start < last.end) { last.end = Math.max(last.end, item.end); last.items.push(item); }
		else summaries.push({ start: item.start, end: item.end, items: [item] });
	});
	return { hidden: new Set(hidden), summaries: summaries, capacity: capacity, reservePct: hidden.length ? Math.min(44, 32 / laneWidth * 100) : 0 };
}
function syncPlannerOverflowButtons(lane, summaries) {
	var old = new Map(Array.from(lane.querySelectorAll(":scope > .tc-overflow-more")).map(function (b) { return [b.dataset.overflowKey, b]; }));
	summaries.forEach(function (summary) {
		var key = summary.items.map(function (item) { return getTaskIdentityKey(item.el); }).sort().join("\n");
		var button = old.get(key); old.delete(key);
		if (!button) {
			button = lane.ownerDocument.createElement("button"); button.type = "button"; button.className = "tc-overflow-more";
			button.dataset.overflowKey = key; button.setAttribute("aria-haspopup", "dialog"); lane.appendChild(button);
			button.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); openPlannerOverflow(button); });
		}
		button._tcOverflowSummary = summary;
		button.textContent = "+" + summary.items.length;
		button.setAttribute("aria-label", tcRuntimeT("runtime.tasksCalendar.overflow.more", { count: summary.items.length }));
		button.title = button.getAttribute("aria-label");
		var start = getPlannerChromeTimelineStartMin(), span = getPlannerChromeTimelineEndMin() - start;
		button.style.top = ((summary.start - start) / span * 100) + "%";
		button.style.height = ((summary.end - summary.start) / span * 100) + "%";
	});
	old.forEach(function (button) {
		if (button._tcOverflowPopover) button._tcOverflowPopover.close();
		button.remove();
	});
}
function findPlannerOverflow(date, start) {
	var cell = Array.from(rootNode.querySelectorAll(".cell[data-date]")).find(function (c) { return c.getAttribute("data-date") === date; });
	return cell && Array.from(cell.querySelectorAll(".tc-overflow-more")).find(function (b) { return b._tcOverflowSummary?.start === start; });
}
function focusPlannerOverflow(date, start) {
	(findPlannerOverflow(date, start) || rootNode.querySelector(".weekView"))?.focus({ preventScroll: true });
}
function openPlannerOverflow(anchor) {
	var summary = anchor._tcOverflowSummary;
	if (!summary) return;
	var date = anchor.closest(".cell")?.getAttribute("data-date"), summaryStart = summary.start;
	var popover = createPlannerHoursPopover(anchor, anchor.getAttribute("aria-label")), doc = popover.el.ownerDocument;
	anchor._tcOverflowPopover = popover;
	popover.el.classList.add("tc-overflow-popover");
	popover.el._tcOverflowContext = { anchor: anchor, date: date, start: summaryStart };
	summary.items.forEach(function (item) {
		var node = item.el, button = doc.createElement("button"); button.type = "button"; button.className = "tc-hours-entry";
		button.dataset.taskKey = getTaskIdentityKey(node);
		var title = doc.createElement("span"); title.textContent = node.getAttribute("data-full-text") || node.querySelector(".description")?.textContent || "";
		var timeLabel = doc.createElement("span"); timeLabel.className = "tc-hours-entry-time";
		timeLabel.textContent = formatPlannerTaskAccessibleTime(node, minutesToTimeStr(Number(node.getAttribute("data-start-min"))));
		button.append(title, timeLabel); popover.el.appendChild(button);
		button.addEventListener("click", function () {
			popover.close();
			openTaskDateTimeEditor(node, { returnFocusEl: anchor, restoreFocus: function () {
				focusPlannerOverflow(date, summaryStart);
			} });
		});
	});
	popover.open(); popover.el.querySelector("button")?.focus({ preventScroll: true });
}
function applyPlannerChromeOverlapLayout(targetLanes) {
	if (!isPlannerChromeTimelineView(rootNode, ["week", "day"])) { return; }
	var openPopup = rootNode.querySelector(".tc-overflow-popover:popover-open");
	var popupContext = openPopup?._tcOverflowContext;
	var focusedEntryKey = openPopup?.ownerDocument.activeElement?.dataset.taskKey;
	var dayStartOv = getPlannerChromeTimelineStartMin();
	var dayEndOv = getPlannerChromeTimelineEndMin();
	var lanes = targetLanes && targetLanes.length ? targetLanes : rootNode.querySelectorAll(".timeLane");
	lanes.forEach((lane) => {
		if (!lane || !lane.querySelectorAll) { return; }
		var overflowSummaries = [];
		var directTimedSelector = ":scope > [data-tc-cal-item='1'][data-slot='range'], :scope > [data-tc-cal-item='1'][data-slot='point'], :scope > .tc-cal-item[data-slot='range'], :scope > .tc-cal-item[data-slot='point'], :scope > .task[data-slot='range'], :scope > .task[data-slot='point']";
		var taskEls = [];
		try {
			taskEls = Array.from(lane.querySelectorAll(directTimedSelector));
		} catch (_) {
			taskEls = Array.from(lane.children || []).filter(function (el) {
				return !!(el && el.matches && el.matches("[data-tc-cal-item='1'][data-slot='range'], [data-tc-cal-item='1'][data-slot='point'], .tc-cal-item[data-slot='range'], .tc-cal-item[data-slot='point'], .task[data-slot='range'], .task[data-slot='point']"));
			});
		}
		taskEls.forEach((el) => {
			el.style.removeProperty("--ov-left");
			el.style.removeProperty("--ov-width");
			el.removeAttribute("data-overlap-cols");
			el.removeAttribute("data-overlap-col");
			el.removeAttribute("data-tc-overflow-hidden");
		});
		var items = taskEls.map((el) => {
			var s = parseInt(el.getAttribute("data-start-min") || "", 10);
			var e = parseInt(el.getAttribute("data-end-min") || "", 10);
			if (!Number.isFinite(s)) { s = 0; }
			if (!Number.isFinite(e)) { e = s + PLANNER_CHROME_MIN_VISUAL_RANGE_MIN; }
			var b = computePlannerChromeExpandedSlotBounds(dayStartOv, dayEndOv, s, e);
			return { el: el, start: b.s, end: b.e };
		}).filter((x) => Number.isFinite(x.start) && Number.isFinite(x.end));
		var seenLaneDup = Object.create(null);
		items = items.filter(function (x) {
			var idk = getTaskIdentityKey(x.el);
			if (!idk) { return true; }
			var k = idk + "\0" + x.start + "\0" + x.end;
			if (seenLaneDup[k]) {
				try { x.el.remove(); } catch (_) {}
				return false;
			}
			seenLaneDup[k] = true;
			return true;
		});
		if (items.length === 0) { syncPlannerOverflowButtons(lane, []); return; }

		// Build connected overlap groups first (so unrelated tasks remain full width).
		var groups = [];
		var used = new Array(items.length).fill(false);
		function overlaps(a, b) { return a.start < b.end && b.start < a.end; }
		for (var i = 0; i < items.length; i++) {
			if (used[i]) { continue; }
			var queue = [i];
			used[i] = true;
			var idxs = [];
			while (queue.length) {
				var cur = queue.shift();
				idxs.push(cur);
				for (var j = 0; j < items.length; j++) {
					if (used[j]) { continue; }
					if (overlaps(items[cur], items[j])) {
						used[j] = true;
						queue.push(j);
					}
				}
			}
			groups.push(idxs.map((k) => items[k]));
		}

		groups.forEach((group) => {
			if (group.length === 1) {
				return;
			}
			group.sort((a, b) => a.start - b.start || b.end - a.end);
			var byColEnd = [];
			var columns = [];
			var maxCols = 0;
			group.forEach((item) => {
				var col = 0;
				while (col < byColEnd.length && byColEnd[col] > item.start) { col++; }
				byColEnd[col] = item.end;
				item.col = col;
				if (!columns[col]) { columns[col] = []; }
				columns[col].push(item);
				if (col + 1 > maxCols) { maxCols = col + 1; }
			});
			// Retain the collision columns, but let each task use adjacent columns
			// that are unoccupied throughout its own displayed interval.
			var gapPct = 1.15;
			var n = Math.max(1, maxCols);
			var overflow = planPlannerOverflow(group, lane.getBoundingClientRect().width, ["week", "day"].includes(rootNode.getAttribute("view")));
			overflowSummaries.push.apply(overflowSummaries, overflow.summaries);
			if (overflow.hidden.size) n = overflow.capacity;
			var usable = 100 - overflow.reservePct - gapPct * (n - 1);
			var cellPct = usable / n;
			group.forEach((item) => {
				if (overflow.hidden.has(item)) { item.el.setAttribute("data-tc-overflow-hidden", "true"); return; }
				var left, width;
				if (n === 1) {
					left = 0;
					width = 100 - overflow.reservePct;
				} else {
					var span = 1;
					for (var nextCol = item.col + 1; nextCol < n; nextCol++) {
						if (columns[nextCol].some((other) => overlaps(item, other))) { break; }
						span++;
					}
					left = item.col * (cellPct + gapPct);
					width = span * cellPct + (span - 1) * gapPct;
				}
				item.el.style.setProperty("--ov-left", Math.max(0, left).toFixed(3) + "%");
				item.el.style.setProperty("--ov-width", Math.max(0, width).toFixed(3) + "%");
				item.el.setAttribute("data-overlap-cols", String(n));
				item.el.setAttribute("data-overlap-col", String(item.col));
			});
		});
		syncPlannerOverflowButtons(lane, overflowSummaries);
	});
	if (popupContext && !popupContext.anchor.isConnected) {
		var replacement = findPlannerOverflow(popupContext.date, popupContext.start);
		if (replacement) {
			openPlannerOverflow(replacement);
			var entry = Array.from(replacement._tcOverflowPopover.el.querySelectorAll(".tc-hours-entry")).find(function (el) { return el.dataset.taskKey === focusedEntryKey; });
			entry?.focus({ preventScroll: true });
		} else { openPopup.hidePopover(); focusPlannerOverflow(popupContext.date, popupContext.start); }
	}
};

var tcWeekAdaptiveStableState = new Map();
function tcGetWeekAdaptiveStableKey(taskEl) {
	if (!taskEl) { return ""; }
	try {
		var k = getTaskIdentityKey(taskEl);
		if (k) { return String(k); }
	} catch (_) {}
	try {
		var href = taskEl.getAttribute ? taskEl.getAttribute("data-nav-href") : "";
		if (href) { return String(href); }
	} catch (_) {}
	return "";
}
function formatPlannerTaskAccessibleTime(taskEl, localTimeLabel) {
	var startDate = taskEl.getAttribute("data-start-date") || "";
	var endDate = taskEl.getAttribute("data-due-date") || "";
	var startTime = taskEl.getAttribute("data-start-time") || "";
	var endTime = taskEl.getAttribute("data-due-time") || "";
	if (startDate && endDate && startDate !== endDate) {
		return startDate + (startTime ? " " + startTime : "") + " → " + endDate + (endTime ? " " + endTime : "");
	}
	if (startTime && endTime) { return startTime + "–" + endTime; }
	return localTimeLabel;
}

function syncPlannerChromeWeekTimeBadgeVisibility(targetLanes) {
	if (!isPlannerChromeTimelineView(rootNode, ["week", "day"])) { return; }
	var labCfg = tcReadPlannerLabControls();
	var labWeekDay = (labCfg && labCfg.weekDay) ? labCfg.weekDay : {};
	function readRawTimeTexts(taskEl) {
		var startText = "";
		var endText = "";
		if (!taskEl || !taskEl.querySelector) { return { start: startText, end: endText }; }
		function normalizeClockLabel(raw) {
			var s = String(raw || "").trim();
			if (!s) { return ""; }
			var crossDay = s.match(/^次日\s+(.+)$/);
			if (crossDay) {
				var nCross = normalizeTimeStr(crossDay[1]);
				return nCross ? ("次日 " + nCross) : "";
			}
			var withDate = s.match(/^(\d{1,2}\/\d{1,2})\s+(.+)$/);
			if (withDate) {
				var nDateTime = normalizeTimeStr(withDate[2]);
				return nDateTime ? (withDate[1] + " " + nDateTime) : "";
			}
			var n0 = normalizeTimeStr(s);
			if (n0) { return n0; }
			var m0 = s.match(/([0-2]?\d\s*:\s*[0-5]?\d(?::[0-5]?\d)?)/);
			if (m0 && m0[1]) {
				var n1 = normalizeTimeStr(m0[1]);
				if (n1) { return n1; }
			}
			return "";
		}
		try {
			var slotKind = taskEl.getAttribute("data-slot") || "";
			var startMinAttr = parseInt(taskEl.getAttribute("data-start-min") || "", 10);
			var endMinAttr = parseInt(taskEl.getAttribute("data-end-min") || "", 10);
			if (Number.isFinite(startMinAttr)) {
				startText = minutesToTimeStr(Math.max(0, Math.min(24 * 60, startMinAttr)));
			}
			if (Number.isFinite(endMinAttr) && Number.isFinite(startMinAttr) && endMinAttr > startMinAttr) {
				var derivedSpanMin = endMinAttr - startMinAttr;
				var canUseDerivedEnd = slotKind === "range" || (slotKind === "point" && derivedSpanMin >= 10 && derivedSpanMin <= 240);
				if (canUseDerivedEnd) {
					endText = minutesToTimeStr(Math.max(0, Math.min(24 * 60, endMinAttr)));
				}
			}
			var startAttr = normalizeClockLabel(taskEl.getAttribute("data-start-time") || "");
			var endAttr = normalizeClockLabel(taskEl.getAttribute("data-end-time") || taskEl.getAttribute("data-due-time") || "");
			if (!startText && startAttr) { startText = startAttr; }
			if (!endText && endAttr) { endText = endAttr; }
			var startEl = taskEl.querySelector(".time .tline.start");
			var endEl = taskEl.querySelector(".time .tline.end");
			if (startEl) {
				if (!startEl.hasAttribute("data-raw-time") || !startText) {
					var nextStartRaw = normalizeClockLabel(String(startEl.textContent || "").trim());
					startEl.setAttribute("data-raw-time", nextStartRaw);
				}
				if (!startText) { startText = normalizeClockLabel(String(startEl.getAttribute("data-raw-time") || "").trim()); }
			}
			if (endEl) {
				if (!endEl.hasAttribute("data-raw-time") || !endText) {
					var nextEndRaw = normalizeClockLabel(String(endEl.textContent || "").trim().replace(/^\s*-\s*/, ""));
					endEl.setAttribute("data-raw-time", nextEndRaw);
				}
				if (!endText) { endText = normalizeClockLabel(String(endEl.getAttribute("data-raw-time") || "").trim().replace(/^\s*-\s*/, "")); }
			}
			if (startText && !endText) {
				var mergedMatch = String(startEl ? (startEl.textContent || "") : "").match(/(\d{1,2}:\d{2}(?::\d{2})?).*?(\d{1,2}:\d{2}(?::\d{2})?)/);
				if (mergedMatch && mergedMatch.length >= 3) {
					startText = normalizeClockLabel(mergedMatch[1]);
					endText = normalizeClockLabel(mergedMatch[2]);
				}
			}
		} catch (_) {}
		return { start: startText, end: endText };
	}
	function normalizeWeekDensity(density) {
		var raw = String(density || "").trim();
		if (raw === "full-stacked") { return "full"; }
		if (raw === "start-only" || raw === "hidden") { return raw; }
		if (raw === "full") { return "full"; }
		return "hidden";
	}
	function syncTimeTextByDensity(taskEl, density) {
		if (!taskEl || !taskEl.querySelector) { return; }
		try {
			var texts = readRawTimeTexts(taskEl);
			var startEl = taskEl.querySelector(".time .tline.start");
			var endEl = taskEl.querySelector(".time .tline.end");
			if (startEl) { startEl.textContent = texts.start; }
			if (!endEl) { return; }
			endEl.textContent = texts.end;
		} catch (_) {}
	}
	function estimateTimeReserveByText(taskEl, density, compact) {
		if (!taskEl || density === "hidden") { return 10; }
		var texts = readRawTimeTexts(taskEl);
		var startText = texts.start;
		var endText = texts.end;
		var baseMode = normalizeWeekDensity(density);
		var sample = "";
		if (baseMode === "start-only" || !endText) {
			sample = startText;
		} else if (density === "full-stacked") {
			sample = startText.length >= endText.length ? startText : endText;
		} else {
			sample = startText + " - " + endText;
		}
		var textLen = sample.length;
		if (!textLen) {
			return baseMode === "start-only" ? (compact ? 32 : 36) : (compact ? 40 : 46);
		}
		var charPx = compact ? 5.6 : 6.2;
		var padPx = compact ? 16 : 20;
		var minReserve = 28;
		var maxReserve = compact ? 54 : 88;
		if (baseMode === "start-only") {
			minReserve = compact ? 34 : 38;
			maxReserve = compact ? 48 : 58;
		} else {
			minReserve = compact ? 46 : 52;
			maxReserve = compact ? 60 : 72;
		}
		return Math.max(minReserve, Math.min(maxReserve, Math.round(textLen * charPx + padPx)));
	}
	var tcMeasureCanvas = null;
	var plannerTimeTypography = { fontSize: 11, weight: 500, lineHeight: 14, gap: 1, bottom: 5, titleGap: 3 };
	function measureWeekTaskTextPx(taskEl, sample, fallbackCharPx) {
		var text = String(sample || "");
		if (!text) { return 0; }
		try {
			if (!tcMeasureCanvas && typeof document !== "undefined" && document.createElement) {
				tcMeasureCanvas = document.createElement("canvas");
			}
			var ctx = tcMeasureCanvas && tcMeasureCanvas.getContext ? tcMeasureCanvas.getContext("2d") : null;
			if (ctx) {
				var css = taskEl && typeof window !== "undefined" && window.getComputedStyle ? window.getComputedStyle(taskEl) : null;
				var fontSize = plannerTimeTypography.fontSize + "px";
				var fontFamily = css ? (css.fontFamily || "sans-serif") : "sans-serif";
				var fontWeight = plannerTimeTypography.weight;
				ctx.font = fontWeight + " " + fontSize + " " + fontFamily;
				return Math.ceil(ctx.measureText(text).width || 0);
			}
		} catch (_) {}
		return Math.ceil(text.length * (fallbackCharPx || 5.4));
	}
	function decidePlannerChromeTimePlacement(taskEl, metrics) {
		var viewName = String((metrics && metrics.view) || "");
		var width = Math.max(0, Number((metrics && metrics.usableWidth) || 0));
		var height = Math.max(0, Number((metrics && metrics.usableHeight) || 0));
		var compact = !!(metrics && metrics.compact);
		var overlapCols = Math.max(1, Number((metrics && metrics.overlapCols) || 1));
		var timeTexts = (metrics && metrics.timeTexts) || readRawTimeTexts(taskEl);
		var hasStart = !!(timeTexts && timeTexts.start);
		var hasEnd = !!(timeTexts && timeTexts.end);
		var titlePx = Math.max(0, Number((metrics && metrics.approxTitlePx) || 0));
		var measuredFullNeed = Math.max(0, Number((metrics && metrics.measuredFullNeed) || 0));
		var measuredStackNeed = Math.max(0, Number((metrics && metrics.measuredStackNeed) || 0));
		var startTimeNeed = Math.max(0, Number((metrics && metrics.startTimeNeed) || 0));
		var titleLinePx = compact ? 13 : 15;
		var minReadableTitleW = overlapCols >= 3 ? 42 : (overlapCols >= 2 ? 50 : 62);
		var titleWidth = Math.max(28, width - 12);
		var estimatedTitleRows = titlePx > 0 ? Math.ceil(titlePx / Math.max(minReadableTitleW, titleWidth)) : 1;
		var maxTitleRows = viewName === "day" && overlapCols <= 1 ? 3 : 2;
		estimatedTitleRows = Math.max(1, Math.min(maxTitleRows, estimatedTitleRows));
		var titleNeedH = estimatedTitleRows * titleLinePx;
		var titleEl = taskEl && taskEl.querySelector ? taskEl.querySelector(".tc-title-row, .description") : null;
		if (titleEl && titleEl.getBoundingClientRect) {
			try {
				var actualTitleH = titleEl.getBoundingClientRect().height || 0;
				if (actualTitleH > 0) {
					titleNeedH = Math.max(titleLinePx, actualTitleH);
				}
			} catch (_) {}
		}
		var bottomBand = Math.max(0, height - titleNeedH - 4);
		var canReadTitle = width >= minReadableTitleW && height >= (titleLinePx + 5);
		var cornerBandNeed = plannerTimeTypography.lineHeight + plannerTimeTypography.bottom + plannerTimeTypography.titleGap;
		var stackBandNeed = cornerBandNeed + plannerTimeTypography.lineHeight + plannerTimeTypography.gap;
		var startBandNeed = cornerBandNeed;
		var decision = {
			mode: "hidden",
			placement: "hidden",
			cornerTimeOk: false,
			timeBandPx: 0,
			reason: "hidden"
		};
		if ((viewName !== "week" && viewName !== "day") || !hasStart || width < 52 || height < 38 || !canReadTitle) {
			return decision;
		}
		var textWidth = Math.max(0, width - 16);
		var fullCornerFits = hasEnd && measuredFullNeed > 0 && measuredFullNeed <= textWidth && bottomBand >= cornerBandNeed;
		var stackFits = hasEnd && measuredStackNeed > 0 && measuredStackNeed <= textWidth && bottomBand >= stackBandNeed;
		var startFits = startTimeNeed > 0 && startTimeNeed <= textWidth && bottomBand >= startBandNeed;
		if (hasEnd) {
			if (fullCornerFits) {
				decision.mode = "full-stacked";
				decision.placement = "range-corner";
				decision.cornerTimeOk = true;
				decision.timeBandPx = cornerBandNeed;
				decision.reason = "range-corner-fit";
				decision.nearTitle = width >= 120 && height >= 56;
				decision.timeTopPx = titleNeedH + 8;
				return decision;
			}
			if (stackFits) {
				decision.mode = "full-stacked";
				decision.placement = "range-stack";
				decision.cornerTimeOk = true;
				decision.timeBandPx = stackBandNeed;
				decision.reason = "range-stack-fallback";
				return decision;
			}
		}
		if (startFits && height >= 22) {
			decision.mode = "start-only";
			decision.placement = "start-corner";
			decision.cornerTimeOk = true;
			decision.timeBandPx = startBandNeed;
			decision.reason = "start-fit";
		}
		return decision;
	}
	function setAttrIfChanged(el, key, value) {
		if (!el || !el.getAttribute || !el.setAttribute) { return; }
		var next = String(value);
		if (el.getAttribute(key) !== next) { el.setAttribute(key, next); }
	}
	function setStyleIfChanged(el, key, value) {
		if (!el || !el.style) { return; }
		var next = String(value);
		if (el.style.getPropertyValue(key) !== next) { el.style.setProperty(key, next); }
	}
	var lanes = targetLanes && targetLanes.length ? targetLanes : rootNode.querySelectorAll(".timeLane");
	lanes.forEach((lane) => {
		if (!lane || !lane.querySelectorAll) { return; }
		try {
			var allTaskEls = lane.querySelectorAll("[data-tc-cal-item='1'], .tc-cal-item, .task");
			allTaskEls.forEach(function (el) {
				if (!el || !el.querySelectorAll) { return; }
				try {
					el.querySelectorAll(".noria-status-circle").forEach(function (oldC) {
						try { oldC.remove(); } catch (_) {}
					});
				} catch (_) {}
			});
		} catch (_) {}
		var taskEls = lane.querySelectorAll("[data-tc-cal-item='1'][data-slot='range'], [data-tc-cal-item='1'][data-slot='point'], .tc-cal-item[data-slot='range'], .tc-cal-item[data-slot='point'], .task[data-slot='range'], .task[data-slot='point']");
		taskEls.forEach((taskEl) => {
			var slot = taskEl ? taskEl.getAttribute("data-slot") : "";
			if (!taskEl || taskEl.getAttribute("data-has-time") !== "true") {
				if (taskEl) {
					taskEl.classList.add("tc-hide-time");
					setAttrIfChanged(taskEl, "data-hide-time", "true");
					setAttrIfChanged(taskEl, "data-time-density", "hidden");
					setAttrIfChanged(taskEl, "data-auto-time-mode", "hidden");
					setAttrIfChanged(taskEl, "data-auto-layout", "multi");
					syncTimeTextByDensity(taskEl, "hidden");
					setStyleIfChanged(taskEl, "--tc-time-reserve", "10px");
					setStyleIfChanged(taskEl, "--tc-time-reserve-visual", "0px");
				}
				return;
			}
			if (slot !== "range" && slot !== "point") {
				taskEl.classList.remove("tc-hide-time");
				setAttrIfChanged(taskEl, "data-hide-time", "false");
				setAttrIfChanged(taskEl, "data-time-density", "full-stacked");
				setAttrIfChanged(taskEl, "data-auto-time-mode", "full");
				setAttrIfChanged(taskEl, "data-auto-layout", "multi");
				syncTimeTextByDensity(taskEl, "full-stacked");
				return;
			}
			var rect = taskEl.getBoundingClientRect();
			var inner = taskEl.querySelector(".inner");
			var usableWidth = 0;
			if (inner && inner.getBoundingClientRect) {
				usableWidth = inner.getBoundingClientRect().width || 0;
			}
			if (!usableWidth) { usableWidth = rect.width || taskEl.clientWidth || 0; }
			var usableHeight = rect.height || taskEl.offsetHeight || 0;
			/* 抗抖：把亚像素尺寸量化到稳定档位，避免临界阈值在多帧来回抖动。 */
			usableWidth = Math.round(Math.max(0, usableWidth) / 2) * 2;
			usableHeight = Math.round(Math.max(0, usableHeight) / 2) * 2;
			var compact = taskEl.getAttribute("data-compact") === "true";
			var overlapCols = parseInt(taskEl.getAttribute("data-overlap-cols") || "1", 10);
			if (!Number.isFinite(overlapCols) || overlapCols < 1) { overlapCols = 1; }
			var isOverlapped = overlapCols >= 2;
			var rootDensity = rootNode && rootNode.getAttribute ? String(rootNode.getAttribute("data-tc-density") || "") : "";
			var mode = "full-stacked";
			var autoLayout = "multi";
			var descEl = taskEl.querySelector(".description");
			var fullText = String(taskEl.getAttribute("data-full-text") || "").trim();
			if (!fullText && descEl) {
				try { fullText = String(descEl.textContent || "").trim(); } catch (_) {}
			}
			var timeTexts = readRawTimeTexts(taskEl);
			var hasEndTime = !!timeTexts.end;
			var fullTimeLabel = timeTexts.start ? (timeTexts.start + (timeTexts.end ? (" - " + timeTexts.end) : "")) : "";
			var startMinForFit = parseInt(taskEl.getAttribute("data-start-min") || "", 10);
			var endMinForFit = parseInt(taskEl.getAttribute("data-end-min") || "", 10);
			var durationForFit = Number.isFinite(startMinForFit) && Number.isFinite(endMinForFit) && endMinForFit > startMinForFit ? (endMinForFit - startMinForFit) : 0;
			var currentViewName = rootNode && rootNode.getAttribute ? String(rootNode.getAttribute("view") || "") : "";
			var titleCharPx = compact ? 5.4 : 6.1;
			var approxTitlePx = Math.max(0, Math.round(fullText.length * titleCharPx));
			setStyleIfChanged(taskEl, "--tc-circle-inline-reserve", "0px");
			var withOverlap = overlapCols >= 2 ? 12 : 0;
			if (overlapCols >= 3) { withOverlap += 8; }
			var hiddenThresholdBase = compact ? Math.max(64, Number(labWeekDay.hiddenThreshold || 92) - 10) : Number(labWeekDay.hiddenThreshold || 92);
			var startOnlyThresholdBase = compact ? Math.max(hiddenThresholdBase + 8, Number(labWeekDay.startOnlyThreshold || 112) - 10) : Number(labWeekDay.startOnlyThreshold || 112);
			var hiddenThreshold = hiddenThresholdBase + withOverlap;
			var startOnlyThreshold = startOnlyThresholdBase + withOverlap;
			var fullThreshold = startOnlyThreshold + (compact ? 22 : 20);
			var titleOverflowEstimate = usableWidth > 0 ? (approxTitlePx > Math.max(16, usableWidth - 8)) : false;
			var titleOverflowReal = false;
			if (descEl) {
				try {
					var sw = Math.ceil(descEl.scrollWidth || 0);
					var cw = Math.floor(descEl.clientWidth || (descEl.getBoundingClientRect ? (descEl.getBoundingClientRect().width || 0) : 0));
					if (cw > 0 && sw > (cw + 1)) { titleOverflowReal = true; }
				} catch (_) {}
			}
			var titleOverflow = titleOverflowReal || titleOverflowEstimate;
			setAttrIfChanged(taskEl, "data-title-overflow", titleOverflow ? "true" : "false");
			setAttrIfChanged(taskEl, "data-overlap-layout", overlapCols >= 3 ? "stack" : (overlapCols === 2 ? "pair" : "solo"));

			var singleHeightThreshold = Number(labWeekDay.singleHeightThreshold || 30);
			if (usableHeight <= singleHeightThreshold || (usableHeight <= (singleHeightThreshold + 4) && titleOverflow)) {
				autoLayout = "single";
			}
			if (compact) {
				autoLayout = "single";
			}

			var widthForTime = usableWidth;
			widthForTime = Math.round(Math.max(0, widthForTime) / 2) * 2;
			var visibilityMode = "full";
			if (autoLayout === "single") {
				if (usableHeight <= 21) {
					visibilityMode = "hidden";
				} else if (usableHeight <= 24) {
					visibilityMode = titleOverflow ? "hidden" : "start-only";
				} else {
					visibilityMode = widthForTime >= fullThreshold && hasEndTime ? "full" : (widthForTime >= startOnlyThreshold ? "start-only" : "hidden");
				}
			} else {
				if (overlapCols >= 2 && widthForTime <= 124) {
					visibilityMode = "hidden";
				} else if (overlapCols >= 2 && widthForTime <= 144) {
					visibilityMode = "start-only";
				}
				if (widthForTime > 0 && widthForTime < hiddenThreshold) {
					visibilityMode = "hidden";
				} else if (widthForTime > 0 && widthForTime < fullThreshold) {
					visibilityMode = "start-only";
				}
				if (usableHeight <= 28 && visibilityMode === "full") {
					visibilityMode = "start-only";
				}
				if (usableHeight <= 22 && (visibilityMode === "full" || visibilityMode === "start-only")) {
					visibilityMode = "hidden";
				}
			}
			/* 时段文本本体也要可容纳：避免低宽度下 start/end 挤成一团。 */
			var startLen = Math.max(0, String(timeTexts.start || "").length);
			var endLen = Math.max(0, String(timeTexts.end || "").length);
			var charPxTime = compact ? 5.0 : 5.4;
			var fullTimeNeed = Math.round(Math.max(startLen, endLen || 0) * charPxTime + 12);
			var startTimeNeed = Math.round(Math.max(4, startLen) * charPxTime + 10);
			var measuredStartNeed = Math.round(measureWeekTaskTextPx(taskEl, timeTexts.start || "", compact ? 5.0 : 5.4) + 10);
			var measuredFullNeed = measureWeekTaskTextPx(taskEl, (timeTexts.start || "") + (timeTexts.end ? (" – " + timeTexts.end) : ""), 6);
			var measuredStackNeed = Math.round(Math.max(
				measureWeekTaskTextPx(taskEl, timeTexts.start || "", compact ? 5.0 : 5.4),
				measureWeekTaskTextPx(taskEl, timeTexts.end || "", compact ? 5.0 : 5.4)
			));
			startTimeNeed = Math.max(startTimeNeed, measuredStartNeed);
			fullTimeNeed = Math.max(fullTimeNeed, measuredFullNeed);
			var sameBandStartOk = false;
			if (usableWidth > 0 && startTimeNeed > 0) {
				var sameBandTitleBudget = usableWidth - startTimeNeed - 18;
				sameBandStartOk = sameBandTitleBudget >= 32 && (!titleOverflow || approxTitlePx <= sameBandTitleBudget);
			}
			if (visibilityMode === "full" && widthForTime > 0 && widthForTime < fullTimeNeed) {
				visibilityMode = "start-only";
			}
			if (visibilityMode === "start-only" && widthForTime > 0 && widthForTime < startTimeNeed) {
				visibilityMode = "hidden";
			}
			/* 标题优先：只有低高度无法同时容纳标题与角标时，才隐藏时段。 */
			if (titleOverflow && usableHeight <= (compact ? 30 : 32)) {
				visibilityMode = "hidden";
			}

			var prevMode = String(taskEl.getAttribute("data-time-density") || "");
			if (visibilityMode === "hidden" && usableHeight >= 46 && widthForTime >= (hiddenThreshold + 18) && prevMode !== "hidden") {
				visibilityMode = "start-only";
			}
			if (visibilityMode === "start-only" && autoLayout === "multi" && usableHeight >= 36 && widthForTime >= (fullThreshold + 14) && !titleOverflow && hasEndTime) {
				visibilityMode = "full";
			}
			if (usableWidth > 0) {
				var reserveFullStacked = estimateTimeReserveByText(taskEl, "full-stacked", compact);
				var reserveStart = estimateTimeReserveByText(taskEl, "start-only", compact);
				var reserveHidden = estimateTimeReserveByText(taskEl, "hidden", compact);
				var minTitleReadableWidth = isOverlapped ? (overlapCols >= 3 ? 58 : 66) : 34;
				var titleBudgetWithFull = usableWidth - reserveFullStacked - 10;
				var titleBudgetWithStart = usableWidth - reserveStart - 8;
				var fullCap = Math.max(34, Math.floor(usableWidth * (compact ? 0.34 : 0.38)));
				var startCap = Math.max(26, Math.floor(usableWidth * (compact ? 0.30 : 0.34)));
				if (visibilityMode === "full" && (!hasEndTime || reserveFullStacked > fullCap)) {
					visibilityMode = "start-only";
				}
				if (visibilityMode === "start-only" && reserveStart > startCap && (titleOverflow || usableHeight <= 26)) {
					visibilityMode = "hidden";
				}
				var canFitFullStacked = approxTitlePx <= Math.max(18, usableWidth - reserveFullStacked);
				var canFitStart = approxTitlePx <= Math.max(18, usableWidth - reserveStart);
				if (visibilityMode === "full" && (!hasEndTime || !canFitFullStacked)) {
					visibilityMode = "start-only";
				}
				if (visibilityMode === "start-only" && !canFitStart) {
					var hiddenFit = Math.max(18, usableWidth - reserveHidden);
					var severeOverflow = approxTitlePx > (hiddenFit + (compact ? 30 : 48));
					var noVerticalRoom = usableHeight <= (compact ? 21 : 23);
					if (severeOverflow || noVerticalRoom) {
						visibilityMode = "hidden";
					}
				}
				if (isOverlapped) {
					if (rootDensity === "micro") {
						var allowMicroTall = currentViewName === "day" && hasEndTime && usableWidth >= 86 && usableHeight >= 72;
						visibilityMode = allowMicroTall ? "full" : "hidden";
					} else if (overlapCols >= 3) {
						var allowStackFull = currentViewName === "day" && hasEndTime && usableWidth >= 84 && usableHeight >= 70;
						var allowStackStart = usableWidth >= 68 && usableHeight >= 48 && titleBudgetWithStart >= minTitleReadableWidth;
						visibilityMode = allowStackFull ? "full" : (allowStackStart ? "start-only" : "hidden");
					} else {
						var allowPairFull = hasEndTime && usableWidth >= 76 && usableHeight >= 56;
						var allowPairStart = usableWidth >= 62 && usableHeight >= 38 && titleBudgetWithStart >= minTitleReadableWidth;
						if (visibilityMode === "full" && !allowPairFull) {
							visibilityMode = allowPairStart ? "start-only" : "hidden";
						} else if (visibilityMode === "start-only" && !allowPairStart) {
							visibilityMode = "hidden";
						}
					}
				}
			}
			/* 低高度 + 长标题冲突兜底：当标题可能与右下角时段角标发生几何冲突时，优先隐藏时段。 */
			if (autoLayout === "single" && visibilityMode !== "hidden") {
				var longTitle = fullText.length >= 12;
				var mediumTitle = fullText.length >= 9;
				var titleRowEl = taskEl.querySelector(".tc-title-row");
				var titleRowH = 0;
				if (titleRowEl && titleRowEl.getBoundingClientRect) {
					try { titleRowH = titleRowEl.getBoundingClientRect().height || 0; } catch (_) {}
				}
				var estTimeH = visibilityMode === "full" ? 14 : 11;
				var projectedTimeTop = usableHeight - estTimeH - 1;
				var titleCrowded = (titleRowH > 0 && projectedTimeTop > 0 && (titleRowH + 4 >= projectedTimeTop));
				if ((longTitle && usableHeight <= 30 && !sameBandStartOk) ||
					(mediumTitle && overlapCols >= 2 && usableHeight <= 32) ||
					(titleOverflow && usableHeight <= 28) ||
					(titleCrowded && !sameBandStartOk)) {
					visibilityMode = "hidden";
					setAttrIfChanged(taskEl, "data-time-conflict", "true");
				} else {
					setAttrIfChanged(taskEl, "data-time-conflict", "false");
				}
			} else {
				setAttrIfChanged(taskEl, "data-time-conflict", "false");
			}
			if (visibilityMode === "full") {
				mode = "full-stacked";
				if (autoLayout === "single") { mode = "start-only"; }
			} else {
				mode = visibilityMode;
			}
			/* full-stacked 需要足够垂直空间：低条高时禁止双行时段，避免上下时间互挤或越界。 */
			var minFullStackedHeight = compact ? 44 : (currentViewName === "week" ? (overlapCols >= 2 ? 54 : 48) : (overlapCols >= 2 ? 52 : 48));
			if (mode === "full-stacked" && (usableHeight < minFullStackedHeight || !hasEndTime)) {
				mode = "start-only";
			}
			if (mode === "start-only" && titleOverflow && usableHeight <= 30) {
				mode = "hidden";
			}
			function overlapAllowsTimeMode(candidateMode) {
				if (!isOverlapped || candidateMode === "hidden") { return true; }
				if (rootDensity === "micro") {
					return candidateMode === "full-stacked" && currentViewName === "day" && hasEndTime && usableWidth >= 86 && usableHeight >= 72;
				}
				if (overlapCols >= 3) {
					if (candidateMode === "full-stacked" || candidateMode === "full") {
						return hasEndTime && currentViewName === "day" && usableWidth >= 84 && usableHeight >= 70;
					}
					return usableWidth >= 68 && usableHeight >= 48;
				}
				if (candidateMode === "full-stacked" || candidateMode === "full") {
					return hasEndTime && usableWidth >= 76 && usableHeight >= 56;
				}
				return usableWidth >= 62 && usableHeight >= 38;
			}
			if (mode === "full-stacked" && !overlapAllowsTimeMode("full-stacked")) {
				mode = overlapAllowsTimeMode("start-only") ? "start-only" : "hidden";
			}
			if (mode === "start-only" && !overlapAllowsTimeMode("start-only")) {
				mode = "hidden";
			}
			/* 防闪烁稳定窗：临界尺寸下短时间内优先保持上次决策，避免 mode/row 来回跳。 */
			var stableKey = tcGetWeekAdaptiveStableKey(taskEl);
			if (stableKey) {
				stableKey = [
					currentViewName || "",
					taskEl.getAttribute("data-start-date") || taskEl.getAttribute("data-date") || "",
					taskEl.getAttribute("data-due-date") || "",
					String(overlapCols),
					stableKey
				].join("|");
			}
			var nowStableTs = Date.now();
			var prevStable = stableKey ? tcWeekAdaptiveStableState.get(stableKey) : null;
			var severeNow = mode === "hidden" || normalizeWeekDensity(mode) === "start-only" || usableHeight <= 24 || overlapCols >= 3 || taskEl.getAttribute("data-time-conflict") === "true";
			var widthBucketStep = Math.max(2, Number(labWeekDay.widthBucketStep || 4));
			var heightBucketStep = Math.max(1, Number(labWeekDay.heightBucketStep || 2));
			var keepBias = Math.max(0, Number(labWeekDay.keepBias || 1));
			var modeLockDuration = Math.max(120, Number(labWeekDay.modeLockMs || 760));
			var widthBucket = Math.round(widthForTime / widthBucketStep);
			var heightBucket = Math.round(usableHeight / heightBucketStep);
			if (prevStable) {
				var dtMode = nowStableTs - Number(prevStable.modeTs || prevStable.ts || 0);
				var modeLockUntil = Number(prevStable.modeLockUntil || prevStable.lockUntil || 0);
				var widthDelta = Math.abs(widthBucket - Number(prevStable.widthBucket || widthBucket));
				var heightDelta = Math.abs(heightBucket - Number(prevStable.heightBucket || heightBucket));
				var nearSize = widthDelta <= (1 + keepBias) && heightDelta <= (1 + keepBias);
				var strongKeepSize = widthDelta <= (2 + keepBias) && heightDelta <= (2 + keepBias);
				/* 锁窗内且尺寸桶未显著变化：冻结时段模式，抑制临界尺寸来回跳。 */
				if (nearSize && modeLockUntil > nowStableTs) {
					mode = prevStable.mode || mode;
				}
				var prevStableVisibility = normalizeWeekDensity(prevStable.mode);
				var nextVisibility = normalizeWeekDensity(mode);
				if (strongKeepSize && modeLockUntil > nowStableTs && prevStableVisibility === "full" && nextVisibility === "hidden") {
					mode = "start-only";
				} else if (strongKeepSize && modeLockUntil > nowStableTs && prevStableVisibility === "start-only" && nextVisibility === "hidden") {
					mode = "start-only";
				}
				if (nearSize && prevStableVisibility === "hidden" && normalizeWeekDensity(mode) !== "hidden" && dtMode < 420) {
					mode = "hidden";
				}
				if (nearSize && mode !== prevStable.mode && dtMode < 260) {
					mode = prevStable.mode || mode;
				}
			}
			try {
				taskEl.removeAttribute("data-circle-row");
				taskEl.removeAttribute("data-circle-force");
				taskEl.removeAttribute("data-circle-anchor");
				if (taskEl.style.getPropertyValue("--tc-circle-anchor-x")) { taskEl.style.removeProperty("--tc-circle-anchor-x"); }
				if (taskEl.style.getPropertyValue("--tc-circle-anchor-y")) { taskEl.style.removeProperty("--tc-circle-anchor-y"); }
			} catch (_) {}
			if (mode === "full") {
				mode = "full-stacked";
			}
			if (autoLayout === "single" && mode !== "hidden") {
				mode = "start-only";
			}
			/*
			 * Final containment gate.
			 * The stability window may keep a previous mode, but it must not keep a
			 * mode that cannot physically fit in the current bar.  This is the hard
			 * stop for clipped "13:45" -> "3:45" and stacked times spilling outside.
			 */
			var finalGapPx = 6;
			function canContainTimeMode(candidateMode) {
				if (candidateMode === "hidden") { return true; }
				if (usableWidth <= 0) { return false; }
				if (currentViewName === "week" || currentViewName === "day") {
					var titleLineForContain = compact ? 13 : 15;
					var titleRowsForContain = usableWidth > 0 ? Math.max(1, Math.ceil(approxTitlePx / Math.max(34, usableWidth - 12))) : 1;
					var titleHeightForContain = Math.min(titleRowsForContain, isOverlapped ? 2 : 3) * titleLineForContain;
					if (isOverlapped) {
					if (candidateMode === "full-stacked") {
						var overlapFullMinH = overlapCols >= 3 ? 70 : 56;
						return hasEndTime && overlapAllowsTimeMode("full-stacked") && usableHeight >= overlapFullMinH && usableWidth >= (measuredStackNeed + 8) && (usableHeight - titleLineForContain) >= 22;
					}
						return overlapAllowsTimeMode("start-only") && usableHeight >= 38 && usableWidth >= (startTimeNeed + 8);
					}
					if (candidateMode === "full-stacked") {
						return hasEndTime && usableHeight >= Math.max(38, compact ? 38 : 40) && usableWidth >= (fullTimeNeed + 16) && (usableHeight - titleHeightForContain) >= 12;
					}
					var hasVerticalStartBand = (usableHeight - titleHeightForContain) >= 10;
					return usableHeight >= 22 && usableWidth >= (startTimeNeed + 16) && (hasVerticalStartBand || sameBandStartOk);
				}
				var reservePx = estimateTimeReserveByText(taskEl, candidateMode, compact);
				var minTitlePx = Math.min(Math.max(32, approxTitlePx), Math.max(32, usableWidth - 8));
				var maxReserveByBar = Math.max(0, usableWidth - minTitlePx - finalGapPx);
				var capRatio = candidateMode === "full-stacked" ? (compact ? 0.34 : 0.38) : (compact ? 0.30 : 0.34);
				var ratioCap = Math.max(candidateMode === "full-stacked" ? 34 : 26, Math.floor(usableWidth * capRatio));
				var hardReserveCap = Math.max(0, Math.min(maxReserveByBar, ratioCap));
				if (reservePx > hardReserveCap) { return false; }
				var titleFitWidth = usableWidth - reservePx - finalGapPx;
				if (titleOverflow || approxTitlePx > Math.max(18, titleFitWidth + 2)) { return false; }
				if (candidateMode === "full-stacked") {
					return hasEndTime && usableHeight >= Math.max(35, minFullStackedHeight);
				}
				var minStartOnlyHeight = compact ? 28 : 30;
				return usableHeight >= minStartOnlyHeight;
			}
			if (mode === "full-stacked" && !canContainTimeMode("full-stacked")) {
				mode = "start-only";
			}
			if (mode === "start-only" && !canContainTimeMode("start-only")) {
				mode = "hidden";
			}
			if (mode === "full-stacked" && !overlapAllowsTimeMode("full-stacked")) {
				mode = overlapAllowsTimeMode("start-only") ? "start-only" : "hidden";
			}
			if (mode === "start-only" && !overlapAllowsTimeMode("start-only")) {
				mode = "hidden";
			}
			var cornerTimeOk = false;
			var timePlacement = "hidden";
			var useCornerTime = currentViewName === "week" || currentViewName === "day";
			var timeBandPx = 0;
			var timeNearTitle = false, timeTopPx = 0;
			if (useCornerTime) {
				var placementDecision = decidePlannerChromeTimePlacement(taskEl, {
					view: currentViewName,
					usableWidth: usableWidth,
					usableHeight: usableHeight,
					compact: compact,
					overlapCols: overlapCols,
					timeTexts: timeTexts,
					approxTitlePx: approxTitlePx,
					measuredFullNeed: measuredFullNeed,
					measuredStackNeed: measuredStackNeed,
					startTimeNeed: startTimeNeed
				});
				mode = placementDecision.mode || "hidden";
				cornerTimeOk = !!placementDecision.cornerTimeOk;
				timePlacement = placementDecision.placement || "hidden";
				timeBandPx = Number(placementDecision.timeBandPx || 0);
				timeNearTitle = !!placementDecision.nearTitle;
				timeTopPx = Number(placementDecision.timeTopPx || 0);
				setAttrIfChanged(taskEl, "data-time-fit-reason", placementDecision.reason || "hidden");
			} else {
				cornerTimeOk = true;
				timePlacement = mode === "hidden" ? "hidden" : "range-corner";
				timeBandPx = mode === "hidden" ? 0 : 16;
			}
			setAttrIfChanged(taskEl, "data-week-time-ok", currentViewName === "week" && cornerTimeOk ? "true" : "false");
			setAttrIfChanged(taskEl, "data-corner-time-ok", useCornerTime && cornerTimeOk ? "true" : "false");
			var hideTime = mode === "hidden";
			if (hideTime) {
				timePlacement = "hidden";
			} else if (!timePlacement || timePlacement === "hidden") {
				timePlacement = mode === "start-only" ? "start-corner" : "range-corner";
			}
			var hasHideClass = taskEl.classList.contains("tc-hide-time");
			if (hasHideClass !== hideTime) {
				taskEl.classList.toggle("tc-hide-time", hideTime);
			}
			setAttrIfChanged(taskEl, "data-hide-time", hideTime ? "true" : "false");
			setAttrIfChanged(taskEl, "data-time-density", mode);
			setAttrIfChanged(taskEl, "data-time-placement", timePlacement);
			setAttrIfChanged(taskEl, "data-time-near-title", timeNearTitle ? "true" : "false");
			setAttrIfChanged(taskEl, "data-auto-time-mode", normalizeWeekDensity(mode));
			setAttrIfChanged(taskEl, "data-auto-layout", autoLayout);
			if (hideTime) {
				timeBandPx = 0;
			} else if (timePlacement === "range-stack") {
				timeBandPx = Math.max(timeBandPx || 0, 27);
			} else if (timePlacement === "range-corner") {
				timeBandPx = Math.max(timeBandPx || 0, 16);
			} else if (timePlacement === "start-corner") {
				timeBandPx = Math.max(timeBandPx || 0, 14);
			}
			setStyleIfChanged(taskEl, "--tc-time-band-h", timeBandPx + "px");
			syncTimeTextByDensity(taskEl, mode);
			if (fullText || fullTimeLabel) {
				var accessText = fullText || "";
				var accessibleTime = formatPlannerTaskAccessibleTime(taskEl, fullTimeLabel);
				if (accessibleTime) { accessText = accessText ? (accessText + "\n" + accessibleTime) : accessibleTime; }
				if (taskEl._noriaTooltipText !== accessText) {
					bridge.setTaskCalendarTooltip(taskEl, accessText);
					taskEl._noriaTooltipText = accessText;
				}
				setAttrIfChanged(taskEl, "aria-label", accessText);
			}
			var reserve = estimateTimeReserveByText(taskEl, mode, compact);
			if (useCornerTime) {
				var timeElForCorner = taskEl.querySelector(".time");
				var titleRowForCorner = taskEl.querySelector(".tc-title-row");
				if (timeElForCorner && timeElForCorner.style) {
					if (cornerTimeOk && (mode === "full-stacked" || mode === "start-only")) {
						if (taskEl && taskEl.style) {
							taskEl.style.setProperty("position", "absolute", "important");
						}
						timeElForCorner.style.setProperty("display", "inline-flex", "important");
						timeElForCorner.style.setProperty("position", "absolute", "important");
						timeElForCorner.style.setProperty("right", timeNearTitle ? "auto" : "8px", "important");
						timeElForCorner.style.setProperty("left", timeNearTitle ? "8px" : "auto", "important");
						timeElForCorner.style.setProperty("top", timeNearTitle ? timeTopPx + "px" : "auto", "important");
						timeElForCorner.style.setProperty("bottom", timeNearTitle ? "auto" : plannerTimeTypography.bottom + "px", "important");
						timeElForCorner.style.setProperty("flex-direction", timePlacement === "range-stack" ? "column" : "row", "important");
						timeElForCorner.style.setProperty("width", "auto", "important");
						timeElForCorner.style.setProperty("min-width", "0", "important");
						timeElForCorner.style.setProperty("min-height", "0", "important");
						timeElForCorner.style.setProperty("height", "auto", "important");
						timeElForCorner.style.setProperty("padding", "0", "important");
						timeElForCorner.style.setProperty("max-width", "calc(100% - 16px)", "important");
						timeElForCorner.style.setProperty("justify-content", timeNearTitle ? "flex-start" : "flex-end", "important");
						timeElForCorner.style.setProperty("align-items", timePlacement === "range-stack" ? "flex-end" : "center", "important");
						timeElForCorner.style.setProperty("gap", timePlacement === "range-stack" ? plannerTimeTypography.gap + "px" : "0", "important");
						timeElForCorner.style.setProperty("font-size", plannerTimeTypography.fontSize + "px", "important");
						timeElForCorner.style.setProperty("font-weight", String(plannerTimeTypography.weight), "important");
						timeElForCorner.style.setProperty("line-height", plannerTimeTypography.lineHeight + "px", "important");
						timeElForCorner.style.setProperty("font-variant-numeric", "tabular-nums", "important");
						timeElForCorner.style.setProperty("text-align", "right", "important");
						timeElForCorner.style.setProperty("pointer-events", "none", "important");
						timeElForCorner.style.setProperty("opacity", "1", "important");
					} else {
						timeElForCorner.style.setProperty("display", "none", "important");
						timeElForCorner.style.removeProperty("position");
						timeElForCorner.style.removeProperty("right");
						timeElForCorner.style.removeProperty("left");
						timeElForCorner.style.removeProperty("top");
						timeElForCorner.style.removeProperty("bottom");
						timeElForCorner.style.setProperty("width", "0px", "important");
						timeElForCorner.style.setProperty("min-width", "0px", "important");
						timeElForCorner.style.setProperty("max-width", "0px", "important");
					}
				}
				if (titleRowForCorner && titleRowForCorner.style) {
					if (cornerTimeOk && (mode === "full-stacked" || mode === "start-only")) {
						titleRowForCorner.style.setProperty("position", "static", "important");
						titleRowForCorner.style.setProperty("left", "auto", "important");
						titleRowForCorner.style.setProperty("right", "auto", "important");
						titleRowForCorner.style.setProperty("top", "auto", "important");
						titleRowForCorner.style.setProperty("bottom", "auto", "important");
						titleRowForCorner.style.setProperty("transform", "none", "important");
						titleRowForCorner.style.setProperty("width", "auto", "important");
						if (!isOverlapped && mode === "start-only" && sameBandStartOk && usableHeight <= 32) {
							titleRowForCorner.style.setProperty("max-width", "calc(100% - " + Math.max(42, reserve + 16) + "px)", "important");
						} else {
							titleRowForCorner.style.setProperty("max-width", "100%", "important");
						}
						titleRowForCorner.style.setProperty("min-width", "0", "important");
						titleRowForCorner.style.setProperty("overflow", "hidden", "important");
					} else {
						titleRowForCorner.style.removeProperty("position");
						titleRowForCorner.style.removeProperty("left");
						titleRowForCorner.style.removeProperty("right");
						titleRowForCorner.style.removeProperty("top");
						titleRowForCorner.style.removeProperty("bottom");
						titleRowForCorner.style.removeProperty("transform");
						titleRowForCorner.style.removeProperty("width");
						titleRowForCorner.style.removeProperty("max-width");
						titleRowForCorner.style.removeProperty("min-width");
					}
				}
				if (inner && inner.style) {
					if (cornerTimeOk && (mode === "full-stacked" || mode === "start-only")) {
						inner.style.setProperty("position", "static", "important");
						inner.style.setProperty("padding-bottom", (timeNearTitle ? 0 : timeBandPx) + "px", "important");
						inner.style.setProperty("align-content", "start", "important");
						inner.style.setProperty("grid-template-columns", "minmax(0, 1fr)", "important");
						inner.style.removeProperty("grid-template-rows");
						inner.style.removeProperty("row-gap");
						inner.style.setProperty("column-gap", "0", "important");
					} else {
						inner.style.setProperty("grid-template-columns", "minmax(0, 1fr) 0px", "important");
						inner.style.setProperty("column-gap", "0", "important");
						inner.style.removeProperty("position");
						inner.style.removeProperty("padding-bottom");
						inner.style.removeProperty("align-content");
						inner.style.removeProperty("grid-template-rows");
						inner.style.removeProperty("row-gap");
					}
				}
			} else {
				var timeElNonWeek = taskEl.querySelector(".time");
				if (timeElNonWeek && timeElNonWeek.style) {
					timeElNonWeek.style.removeProperty("display");
					timeElNonWeek.style.removeProperty("position");
					timeElNonWeek.style.removeProperty("right");
					timeElNonWeek.style.removeProperty("left");
					timeElNonWeek.style.removeProperty("top");
					timeElNonWeek.style.removeProperty("bottom");
					timeElNonWeek.style.removeProperty("width");
					timeElNonWeek.style.removeProperty("min-width");
					timeElNonWeek.style.removeProperty("max-width");
					timeElNonWeek.style.removeProperty("flex-direction");
					timeElNonWeek.style.removeProperty("justify-content");
					timeElNonWeek.style.removeProperty("align-items");
					timeElNonWeek.style.removeProperty("gap");
					timeElNonWeek.style.removeProperty("font-size");
					timeElNonWeek.style.removeProperty("opacity");
				}
				if (inner && inner.style) {
					inner.style.removeProperty("position");
						inner.style.removeProperty("padding-bottom");
						inner.style.removeProperty("align-content");
					inner.style.removeProperty("grid-template-columns");
					inner.style.removeProperty("column-gap");
					inner.style.removeProperty("grid-template-rows");
					inner.style.removeProperty("row-gap");
				}
			}
			setStyleIfChanged(taskEl, "--tc-time-reserve", reserve + "px");
			var visualReserve = reserve;
			if (!compact && autoLayout !== "single") {
				if (mode === "full-stacked") {
					visualReserve = Math.min(13, Math.max(7, Math.floor(reserve * 0.22)));
				} else if (mode === "start-only") {
					visualReserve = Math.min(12, Math.max(6, Math.floor(reserve * 0.24)));
				} else {
					visualReserve = 0;
				}
				if (usableHeight <= 30) {
					visualReserve = Math.max(0, visualReserve - 4);
				}
			}
			setStyleIfChanged(taskEl, "--tc-circle-inline-reserve", "0px");
			setStyleIfChanged(taskEl, "--tc-time-reserve-visual", visualReserve + "px");
			var titleLines = 1;
			var titleBudget = usableHeight - 8;
			if (mode !== "hidden") { titleBudget -= (mode === "full-stacked" ? 18 : 12); }
			if (overlapCols >= 2) { titleBudget -= 2; }
			if (autoLayout !== "single" || usableHeight >= 34 || mode === "hidden") {
				if (titleBudget >= 43) {
					titleLines = 3;
				} else if (titleBudget >= 25) {
					titleLines = 2;
				}
			}
			if (overlapCols >= 2 && mode === "hidden" && usableHeight >= 30) {
				titleLines = Math.max(2, titleLines);
			}
			setAttrIfChanged(taskEl, "data-title-lines", String(titleLines));
			setStyleIfChanged(taskEl, "--tc-title-lines", String(titleLines));
			if (stableKey) {
				var prevModeTs = prevStable ? Number(prevStable.modeTs || prevStable.ts || 0) : 0;
				var modeChanged = !!(prevStable && prevStable.mode !== mode);
				var modeLockUntilNext = prevStable ? Number(prevStable.modeLockUntil || prevStable.lockUntil || 0) : 0;
				if (modeChanged) {
					modeLockUntilNext = nowStableTs + (severeNow ? Math.min(modeLockDuration, 220) : modeLockDuration);
				}
				tcWeekAdaptiveStableState.set(stableKey, {
					mode: mode,
					ts: nowStableTs,
					modeTs: modeChanged || prevModeTs <= 0 ? nowStableTs : prevModeTs,
					modeLockUntil: modeLockUntilNext,
					lockUntil: modeLockUntilNext,
					widthBucket: widthBucket,
					heightBucket: heightBucket
				});
			}
		});
	});
}

/** 周 plannerChrome：在 hydrate/LP 多帧灌条后统一执行「几何 + 并列」，避免重叠仍占满宽 */
var weekLanesFinalizeRaf = null;
function runPlannerChromeWeekLanesFinalize(forceRun) {
	if (!isPlannerChromeTimelineView(rootNode, ["week", "day"])) { return; }
	if (plannerChromeInteractionActive) { return; }
	var nowTs = Date.now();
	var stamp = "";
	try {
		var viewName = rootNode.getAttribute("view") || "";
		var gridNode = rootNode.querySelector(":scope > .grid");
		var wk = gridNode?.getAttribute("data-week") || "";
		var dy = gridNode?.getAttribute("data-day") || "";
		var timed = rootNode.querySelectorAll(".cell .timeLane [data-tc-cal-item='1'][data-slot='range'], .cell .timeLane [data-tc-cal-item='1'][data-slot='point']").length;
		var cnt = rootNode.getAttribute("data-tc-hydrate-tasks") || "";
		stamp = viewName + "|" + dy + "|" + wk + "|" + cnt + "|" + timed;
	} catch (_) {}
	if (!forceRun && stamp && stamp === weekLanesFinalizeLastStamp && (nowTs - weekLanesFinalizeLastRunTs) < 360) { return; }
	if (!forceRun && (nowTs - weekLanesFinalizeLastRunTs) < 150) { return; }
	if (forceRun && (nowTs - weekLanesFinalizeLastRunTs) < 24) { return; }
	try { tcReparentStrayTimeLaneItems(); } catch (_) {}
	try { tcApplyPlannerLabCssVars(rootNode); } catch (_) {}
	try { rebuildPlannerChromeWaitingHostsFromSnapshots(rootNode); } catch (_) {}
	try { syncPlannerChromeDayBucketPeekVar(rootNode); } catch (_) {}
	try { enforcePlannerChromeWeekGridLayout(); } catch (_) {}
	try { applyPlannerChromeTimelineAxis(); } catch (_) {}
	try { normalizePlannerChromeWeekTaskGeometry(); } catch (_) {}
	try { applyPlannerChromeOverlapLayout(); } catch (_) {}
	try { syncPlannerChromeWeekDayFocus(); } catch (_) {}
	try { syncPlannerChromeWeekTimeBadgeVisibility(); } catch (_) {}
	try { refreshPlannerChromeNowNeedle(); } catch (_) {}
	try { setupPlannerChromeDragAndResize(); } catch (_) {}
	try { schedulePlannerChromeWaitingLayerPostReflow(rootNode); } catch (_) {}
	try { syncPlannerChromeAxisToggleChrome(); } catch (_) {}
	weekLanesFinalizeLastRunTs = nowTs;
	weekLanesFinalizeLastStamp = stamp;
}
var weekLanesFinalizeForcePending = false;
var weekLanesFinalizeLastRunTs = 0;
var weekLanesFinalizeLastStamp = "";
/** View actions share the toolbar end; the range toggle lives in the grid. */
function ensureTcToolbarPlannerSlot() {
	if (!rootNode) {
		return null;
	}
	var left = rootNode.querySelector(".buttons .tc-context-tools");
	if (!left) {
		return null;
	}
	var slot = rootNode.querySelector(".tc-toolbar-planner-slot");
	if (!slot) {
		var popHost = rootNode._noriaTimelineToolbarMorePopEl || rootNode.querySelector(".tc-timeline-toolbar-more-pop");
		if (popHost) {
			slot = popHost.querySelector(".tc-toolbar-planner-slot");
		}
	}
	if (!slot) {
		slot = document.createElement("div");
		slot.className = "tc-toolbar-planner-slot";
		var seg = left.querySelector(".tc-segmented");
		if (seg && seg.parentNode === left) {
			if (seg.nextSibling) {
				left.insertBefore(slot, seg.nextSibling);
			} else {
				left.appendChild(slot);
			}
		} else {
			left.appendChild(slot);
		}
	}
	try {
		left.querySelectorAll(".tc-timeline-quick-drawer").forEach(function (b) {
			if (b && b.parentNode !== slot) {
				slot.appendChild(b);
			}
		});
	} catch (_) {}
	var retiredWaitingButtonClass = "tc-planner-" + "daybucket-toggle";
	try {
		left.querySelectorAll("." + retiredWaitingButtonClass).forEach(function (b) { try { b.remove(); } catch (_) {} });
		slot.querySelectorAll("." + retiredWaitingButtonClass).forEach(function (b) { try { b.remove(); } catch (_) {} });
	} catch (_) {}
	try {
		var axOrd = slot.querySelector(".tc-planner-axis-toggle");
		var drOrd = slot.querySelector(".tc-timeline-quick-drawer");
		if (axOrd && drOrd && drOrd.previousSibling !== axOrd) {
			slot.insertBefore(drOrd, axOrd.nextSibling);
		}
	} catch (_) {}
	return slot;
}
function queryTimelineChromeButton(btnClass) {
	if (!btnClass || !rootNode) {
		return null;
	}
	try {
		var inRoot = rootNode.querySelector("button." + btnClass);
		if (inRoot) {
			return inRoot;
		}
		var popHost = rootNode._noriaTimelineToolbarMorePopEl || rootNode.querySelector(".tc-timeline-toolbar-more-pop");
		if (popHost) {
			var inPop = popHost.querySelector("button." + btnClass);
			if (inPop) {
				return inPop;
			}
		}
	} catch (_) {}
	return null;
}
function dedupeTimelineChromeButtons(slot, btnClass) {
	if (!slot || !btnClass) {
		return null;
	}
	var all = [];
	try {
		all = Array.from(slot.querySelectorAll("button." + btnClass));
	} catch (_) {
		all = [];
	}
	if (!all.length) {
		return null;
	}
	var keep = all[0];
	for (var i = 1; i < all.length; i++) {
		try { all[i].remove(); } catch (_) {}
	}
	return keep;
}
/** 隐藏时仍占布局宽：与周/日可见时「四象—晨轴」间距像素级一致 */
function tcPlannerChromeChromeBtnSetLayoutVisible(btn, visible) {
	if (!btn) {
		return;
	}
	try {
		btn.style.display = "";
		if (visible) {
			btn.style.visibility = "";
			btn.style.pointerEvents = "";
			btn.removeAttribute("aria-hidden");
			btn.removeAttribute("tabindex");
		} else {
			btn.style.visibility = "hidden";
			btn.style.pointerEvents = "none";
			btn.setAttribute("aria-hidden", "true");
			btn.setAttribute("tabindex", "-1");
		}
	} catch (_) {}
}
/** Expand the visible time range without covering tasks or changing their times. */
function ensurePlannerChromeToolbarChromeButtonsExist() {
	bindPlannerHoursActions();
	ensureTimelineQuickDrawerChrome();
	var grid=rootNode?.querySelector(':scope > .grid');
	if(!grid||!isPlannerChromeTimelineView(rootNode,['week','day']))return;
	var ax=grid.querySelector('.tc-planner-axis-toggle');
	if (!ax) {
		ax = document.createElement("button");
		ax.type = "button";
		ax.className = "tc-planner-axis-toggle tc-hours-view-toggle";
		grid.prepend(ax);
		ax.addEventListener("click", async function (e) {
			e.preventDefault();
			e.stopPropagation();
			if(ax.disabled)return;ax.disabled=true;
			var fullDay=!(showEarlyHours||plannerHoursExpanded);
			try{
				var saved=await bridgeCfg.tasksCalendar.savePreference('activeHours',{...plannerActiveHours,fullDay:fullDay});
				if(!saved||saved.ok===false)throw new Error(plannerHoursText('saveFailed'));
				bridgeCfg.tasksCalendarSettings=saved.settings;showEarlyHours=fullDay;plannerHoursExpanded=false;
				rerenderCalendarViewNow();syncPlannerChromeAxisToggleChrome();rootNode.querySelector('.tc-hours-view-toggle')?.focus({preventScroll:true});
			}catch(error){ax.disabled=false;showDebugNotice(plannerHoursText('saveFailed'));}
		});
	}
}
function ensurePlannerChromePlannerLabPanel() {
	if (!rootNode) { return null; }
	var panel = rootNode.querySelector(".tc-planner-lab-panel");
	if (panel) { return panel; }
	panel = document.createElement("div");
	panel.className = "tc-planner-lab-panel";
	panel.hidden = true;
	rootNode.appendChild(panel);
	return panel;
}
function tcBuildPlannerLabSlider(panel, scopeKey, fieldKey, labelText, min, max, step, suffix) {
	var cfg = tcReadPlannerLabControls();
	if (!cfg[scopeKey]) { cfg[scopeKey] = {}; }
	var row = document.createElement("label");
	row.className = "tc-planner-lab-row";
	var label = document.createElement("span");
	label.className = "tc-planner-lab-row-label";
	label.textContent = labelText;
	var value = document.createElement("span");
	value.className = "tc-planner-lab-row-value";
	var input = document.createElement("input");
	input.type = "range";
	input.min = String(min);
	input.max = String(max);
	input.step = String(step);
	input.value = String(cfg[scopeKey][fieldKey]);
	function syncValue() {
		value.textContent = String(input.value) + (suffix || "");
	}
	syncValue();
	input.addEventListener("input", function () {
		cfg[scopeKey][fieldKey] = Number(input.value);
		syncValue();
		tcPlannerLabControls = tcMergePlannerLabControls(cfg);
		tcApplyPlannerLabCssVars(rootNode);
		try { schedulePlannerChromeWeekLanesFinalize(true); } catch (_) {}
		tcSchedulePlannerLabControlsSave();
	});
	row.appendChild(label);
	row.appendChild(value);
	row.appendChild(input);
	panel.appendChild(row);
}
function renderPlannerChromePlannerLabPanel(panel) {
	if (!panel) { return; }
	panel.innerHTML = "";
	var heading = document.createElement("div");
	heading.className = "tc-planner-lab-heading";
	heading.textContent = tcRuntimeT("runtime.tasksCalendar.lab.title");
	panel.appendChild(heading);
	var scopeTag = document.createElement("div");
	scopeTag.className = "tc-planner-lab-scope";
	scopeTag.textContent = tcRuntimeT("runtime.tasksCalendar.lab.scope");
	panel.appendChild(scopeTag);
	tcBuildPlannerLabSlider(panel, "global", "titleGap", tcRuntimeT("runtime.tasksCalendar.lab.field.titleGap"), 0, 12, 1, "px");
	tcBuildPlannerLabSlider(panel, "global", "timeBadgeMinWidth", tcRuntimeT("runtime.tasksCalendar.lab.field.timeBadgeMinWidth"), 24, 90, 1, "px");
	tcBuildPlannerLabSlider(panel, "global", "timeBadgeMaxWidth", tcRuntimeT("runtime.tasksCalendar.lab.field.timeBadgeMaxWidth"), 32, 120, 1, "px");
	tcBuildPlannerLabSlider(panel, "weekDay", "singleHeightThreshold", tcRuntimeT("runtime.tasksCalendar.lab.field.singleHeightThreshold"), 20, 42, 1, "px");
	tcBuildPlannerLabSlider(panel, "weekDay", "hiddenThreshold", tcRuntimeT("runtime.tasksCalendar.lab.field.hiddenThreshold"), 64, 140, 1, "px");
	tcBuildPlannerLabSlider(panel, "weekDay", "startOnlyThreshold", tcRuntimeT("runtime.tasksCalendar.lab.field.startOnlyThreshold"), 80, 170, 1, "px");
	tcBuildPlannerLabSlider(panel, "weekDay", "timeFontSize", tcRuntimeT("runtime.tasksCalendar.lab.field.timeFontSize"), 7.5, 14, 0.5, "px");
	tcBuildPlannerLabSlider(panel, "weekDay", "modeLockMs", tcRuntimeT("runtime.tasksCalendar.lab.field.modeLockMs"), 120, 1200, 20, "ms");
	tcBuildPlannerLabSlider(panel, "weekDay", "widthBucketStep", tcRuntimeT("runtime.tasksCalendar.lab.field.widthBucketStep"), 2, 12, 1, "px");
	tcBuildPlannerLabSlider(panel, "weekDay", "heightBucketStep", tcRuntimeT("runtime.tasksCalendar.lab.field.heightBucketStep"), 1, 8, 1, "px");
	tcBuildPlannerLabSlider(panel, "weekDay", "keepBias", tcRuntimeT("runtime.tasksCalendar.lab.field.keepBias"), 0, 4, 1, "");
	var actions = document.createElement("div");
	actions.className = "tc-planner-lab-actions";
	var resetScope = document.createElement("button");
	resetScope.type = "button";
	resetScope.className = "tc-planner-lab-btn";
	resetScope.textContent = tcRuntimeT("runtime.tasksCalendar.lab.resetScope");
	resetScope.addEventListener("click", function () {
		if (!bridgeCfg || typeof bridgeCfg.resetPlannerLabControls !== "function") { return; }
		try {
			Promise.resolve(bridgeCfg.resetPlannerLabControls("weekDay")).then(function (res) {
				tcPlannerLabControls = tcMergePlannerLabControls((res && res.plannerLabControls) || tcDefaultPlannerLabControls());
				tcApplyPlannerLabCssVars(rootNode);
				renderPlannerChromePlannerLabPanel(panel);
				schedulePlannerChromeWeekLanesFinalize(true);
			});
		} catch (_) {}
	});
	var resetAll = document.createElement("button");
	resetAll.type = "button";
	resetAll.className = "tc-planner-lab-btn";
	resetAll.textContent = tcRuntimeT("runtime.tasksCalendar.lab.resetAll");
	resetAll.addEventListener("click", function () {
		if (!bridgeCfg || typeof bridgeCfg.resetPlannerLabControls !== "function") { return; }
		try {
			Promise.resolve(bridgeCfg.resetPlannerLabControls("all")).then(function (res) {
				tcPlannerLabControls = tcMergePlannerLabControls((res && res.plannerLabControls) || tcDefaultPlannerLabControls());
				tcApplyPlannerLabCssVars(rootNode);
				renderPlannerChromePlannerLabPanel(panel);
				schedulePlannerChromeWeekLanesFinalize(true);
			});
		} catch (_) {}
	});
	actions.appendChild(resetScope);
	actions.appendChild(resetAll);
	panel.appendChild(actions);
}
function ensurePlannerChromePlannerLabChrome() {
	var slot = ensureTcToolbarPlannerSlot();
	if (!slot || !rootNode) { return null; }
	var btn = dedupeTimelineChromeButtons(slot, "tc-planner-lab-toggle") || queryTimelineChromeButton("tc-planner-lab-toggle");
	if (!btn) {
		btn = document.createElement("button");
		btn.type = "button";
		btn.className = "tc-planner-lab-toggle tc-toolbar-planner";
		btn.setAttribute("title", tcRuntimeT("runtime.tasksCalendar.lab.open"));
		btn.textContent = tcRuntimeT("runtime.tasksCalendar.lab.button");
		slot.appendChild(btn);
		btn.addEventListener("click", function (ev) {
			ev.preventDefault();
			ev.stopPropagation();
			var panel = ensurePlannerChromePlannerLabPanel();
			var willOpen = !!panel.hidden;
			if (willOpen) {
				tcPlannerLabControls = tcMergePlannerLabControls(tcReadPlannerLabControls());
				renderPlannerChromePlannerLabPanel(panel);
			}
			panel.hidden = !willOpen;
			btn.classList.toggle("is-active", willOpen);
			if (!willOpen) { return; }
			tcApplyPlannerLabCssVars(rootNode);
		});
	}
	var panel = ensurePlannerChromePlannerLabPanel();
	if (panel) {
		panel.hidden = panel.hidden && !btn.classList.contains("is-active");
	}
	tcPlannerChromeChromeBtnSetLayoutVisible(btn, isPlannerChromeTimelineView(rootNode, ["week", "day"]));
	return btn;
}
function closeTimelineQuickPopoverForRoot(r) {
	if (!r) {
		return;
	}
	r.classList.remove("tc-timeline-quick-open");
	try {
		var b = r.querySelector("button.tc-timeline-quick-drawer");
		if (b) {
			b.setAttribute("aria-expanded", "false");
		}
			} catch (_) {}
}
function closeTimelineQuickPopover() {
	closeTimelineQuickPopoverForRoot(rootNode);
}
function getPlannerChromeWaitingEntryMap(r) {
	var root = r || rootNode;
	if (!root) { return null; }
	if (!root._noriaPlannerWaitingEntriesByDate) {
		try {
			root._noriaPlannerWaitingEntriesByDate = Object.create(null);
		} catch (_) {
			root._noriaPlannerWaitingEntriesByDate = {};
		}
	}
	return root._noriaPlannerWaitingEntriesByDate;
}
function rememberPlannerChromeWaitingEntriesForDate(currentDate, entries) {
	var ymd = String(currentDate || "");
	if (!ymd) { return 0; }
	var map = getPlannerChromeWaitingEntryMap(rootNode);
	if (!map) { return 0; }
	var src = Array.isArray(entries) ? entries : [];
	var saved = [];
	for (var i = 0; i < src.length; i++) {
		var ent = src[i] || {};
		var node = ent.node || (ent.nodeType === 1 ? ent : null);
		var typ = ent.typ || ent.type || ent.cls || "";
		if (!typ && node) {
			try { typ = tcInferTypeClsFromCalItemEl(node); } catch (_) { typ = ""; }
		}
		if (!typ) { typ = "due"; }
		saved.push({ task: ent.task || ent.taskObj || null, node: node, typ: typ });
	}
	map[ymd] = saved;
	return saved.length;
}
function getPlannerChromeWaitingSnapshotEntries(r) {
	var map = getPlannerChromeWaitingEntryMap(r);
	var out = [];
	if (!map) { return out; }
	try {
		Object.keys(map).sort().forEach(function (ymd) {
			var arr = Array.isArray(map[ymd]) ? map[ymd] : [];
			arr.forEach(function (entry) {
				out.push({ date: ymd, entry: entry });
			});
		});
	} catch (_) {}
	return out;
}
function syncPlannerChromeDayBucketPeekVar(calRoot) {
	var r = calRoot || rootNode;
	if (!r) { return; }
	try {
		var peek = computePlannerChromeWaitingPeek(r);
		r.style.setProperty("--tc-planner-waiting-peek", peek + "px");
	} catch (_) {}
}
function computePlannerChromeWaitingPeek(calRoot) {
	var r = calRoot || rootNode;
	if (!r || !r.querySelectorAll) { return 0; }
	if (!arePlannerChromeWaitingRowsEnabled()) { return 0; }
	var maxCount = 0;
	try {
		r.querySelectorAll(".tc-planner-waiting-strip:not([hidden])").forEach(function (strip) {
			var n = getPlannerChromeWaitingStripCount(strip);
			if (n > maxCount) { maxCount = n; }
		});
	} catch (_) { maxCount = 0; }
	if (!maxCount) { return 0; }
	if (maxCount <= 1) { return 24; }
	return 46;
}
function getPlannerChromeWaitingCellContent(currentDate, calRoot) {
	var r = calRoot || rootNode;
	if (!r || !r.querySelector) { return null; }
	var ymd = String(currentDate || "");
	if (!ymd) { return null; }
	try {
		var grid = r.querySelector(":scope > .grid");
		var cell = grid && grid.querySelector(":scope > .cell[data-date=\"" + ymd + "\"]");
		return cell && cell.querySelector ? cell.querySelector(":scope > .cellContent") || cell.querySelector(".cellContent") : null;
	} catch (_) {
		return null;
	}
}
function ensurePlannerChromeWaitingHost(cellContent, currentDate) {
	if (!cellContent || !cellContent.querySelector) { return null; }
	var doc = (cellContent.ownerDocument && cellContent.ownerDocument.createElement) ? cellContent.ownerDocument : getTasksCalendarDocument();
	var ymd = String(currentDate || "");
	var host = null;
	try { host = cellContent.querySelector(":scope > .tc-planner-waiting-host"); } catch (_) { host = cellContent.querySelector(".tc-planner-waiting-host"); }
	if (!host) {
		host = doc.createElement("div");
		host.className = "tc-planner-waiting-host";
		host.setAttribute("aria-label", tcRuntimeT("runtime.tasksCalendar.waiting.aria"));
	}
	try {
		host.setAttribute("data-date", ymd);
	} catch (_) {}
	var timeLane = null;
	try { timeLane = cellContent.querySelector(":scope > .timeLane"); } catch (_) { timeLane = cellContent.querySelector(".timeLane"); }
	var laneBoundary = cellContent.querySelector(".tc-hours-boundary") || timeLane;
	try {
		if (laneBoundary && host.parentNode !== cellContent) {
			cellContent.insertBefore(host, laneBoundary);
		} else if (laneBoundary && host.nextSibling !== laneBoundary) {
			cellContent.insertBefore(host, laneBoundary);
		} else if (!host.parentNode) {
			cellContent.appendChild(host);
		}
	} catch (_) {
		try { if (!host.parentNode) { cellContent.appendChild(host); } } catch (_2) {}
	}
	var strip = null;
	try { strip = host.querySelector(":scope > .tc-planner-waiting-strip"); } catch (_) { strip = host.querySelector(".tc-planner-waiting-strip"); }
	if (!strip) {
		strip = doc.createElement("div");
		strip.className = "tc-planner-waiting-strip";
		strip.setAttribute("aria-label", tcRuntimeT("runtime.tasksCalendar.waiting.aria"));
		try { host.appendChild(strip); } catch (_) {}
	}
	return host;
}
function positionPlannerChromeWaitingLayer(calRoot) {
	syncPlannerChromeDayBucketPeekVar(calRoot || rootNode);
}
function ensurePlannerChromeWaitingLayer(gridEl) {
	return null;
}
function preparePlannerChromeWaitingLayer(gridEl, enabled) {
	var grid = gridEl || (rootNode && rootNode.querySelector && rootNode.querySelector(":scope > .grid"));
	if (!grid) { return null; }
	if (!enabled || !arePlannerChromeWaitingRowsEnabled()) {
		clearPlannerChromeWaitingLayer(rootNode);
		return null;
	}
	try {
		rootNode.style.setProperty("--tc-planner-waiting-peek", "0px");
		rootNode._noriaPlannerWaitingEntriesByDate = Object.create(null);
		grid.querySelectorAll(":scope > .tc-planner-waiting-layer").forEach(function (layer) {
			try { layer.remove(); } catch (_) {}
		});
		grid.querySelectorAll(":scope > .cell .cellContent > .tc-planner-waiting-host").forEach(function (host) {
			try { host.remove(); } catch (_) {}
		});
	} catch (_) {}
	return null;
}
function findPlannerChromeWaitingDayIndex(gridEl, currentDate) {
	var grid = gridEl || (rootNode && rootNode.querySelector && rootNode.querySelector(":scope > .grid"));
	if (!grid) { return 0; }
	try {
		var cells = Array.prototype.slice.call(grid.querySelectorAll(":scope > .cell[data-date]"));
		for (var i = 0; i < cells.length; i++) {
			if (cells[i].getAttribute("data-date") === String(currentDate || "")) { return i; }
		}
	} catch (_) {}
	return 0;
}
function getPlannerChromeWaitingTaskText(el) {
	if (!el) { return ""; }
	var txt = "";
	try { txt = String(el.getAttribute("data-full-text") || ""); } catch (_) { txt = ""; }
	if (!txt) {
		try { txt = String(el.getAttribute("title") || ""); } catch (_) { txt = ""; }
	}
	if (!txt) {
		try {
			var link = el.querySelector && el.querySelector(".internal-link, .description, .tc-title-row");
			txt = String((link && link.textContent) || "");
		} catch (_) { txt = ""; }
	}
	if (!txt) {
		try { txt = String(el.textContent || ""); } catch (_) { txt = ""; }
	}
	return txt.replace(/\u200b/g, "").trim();
}
function hasPlannerChromeWaitingTaskIdentity(el) {
	if (!el || !el.getAttribute) { return false; }
	try {
		var path = String(el.getAttribute("data-tc-path") || el.getAttribute("data-path") || "").trim();
		var line = String(el.getAttribute("data-tc-line") || el.getAttribute("data-line") || "").trim();
		var sig = String(el.getAttribute("data-tc-sig") || el.getAttribute("data-task-sig") || el.getAttribute("data-nav-href") || "").trim();
		return !!(path && (line || sig));
	} catch (_) {
		return false;
	}
}
function isPlannerChromeWaitingPlaceholderElement(el) {
	if (!el || el.nodeType !== 1) { return true; }
	try {
		var cl = el.classList;
		if (cl && (cl.contains("tc-cell-ph") || cl.contains("tc-cell-render-fallback"))) { return true; }
		if (el.getAttribute("data-tc-empty-title") === "1") { return true; }
		var txt = getPlannerChromeWaitingTaskText(el);
		if (!txt || txt === "·") { return true; }
		if (txt === "任务") { return true; }
		return false;
	} catch (_) {
		return true;
	}
}
function isPlannerChromeWaitingTaskElement(el) {
	if (!el || el.nodeType !== 1) { return false; }
	try {
		var cl = el.classList;
		if (cl && (cl.contains("tc-cell-ph") || cl.contains("tc-cell-render-fallback"))) { return false; }
		if (!(el.matches && el.matches("[data-tc-cal-item='1'], .tc-cal-item"))) { return false; }
		if (isPlannerChromeWaitingPlaceholderElement(el)) { return false; }
		var txt = getPlannerChromeWaitingTaskText(el);
		var meaningful = txt.replace(/[\[\]\(\)（）【】「」『』《》<>〔〕{}\-–—·•,.;:!?，。；：！？、\s]/g, "");
		return !!meaningful;
	} catch (_) {
		return false;
	}
}
function normalizePlannerChromeWaitingItem(item) {
	if (!item || item.nodeType !== 1) { return null; }
	try {
		if (!item.matches || !item.matches("[data-tc-cal-item='1'], .tc-cal-item")) { return null; }
		var sourceTask = item._noriaPlannerWaitingTask || null;
		var typeCls = item._noriaPlannerWaitingType || tcInferTypeClsFromCalItemEl(item);
		var row = sourceTask || null;
		if (!row) {
			try { row = tcTaskRowFromCalItemEl(item); } catch (_) { row = null; }
		}
		item.classList.add("tc-cal-item");
		item.setAttribute("data-tc-cal-item", "1");
		item.setAttribute("data-slot", "waiting");
		item.setAttribute("data-lane", "waiting");
		item.setAttribute("data-has-time", "false");
		item.setAttribute("data-time-density", "hidden");
		item.setAttribute("data-hide-time", "true");
		item.removeAttribute("data-time");
		item.removeAttribute("data-time-sort");
		item.removeAttribute("data-start-min");
		item.removeAttribute("data-end-min");
		item.removeAttribute("data-compact");
		try {
			item.style.removeProperty("--ov-left");
			item.style.removeProperty("--ov-width");
			item.style.removeProperty("left");
			item.style.removeProperty("right");
			item.style.removeProperty("top");
			item.style.removeProperty("height");
			item.style.removeProperty("width");
			item.style.removeProperty("max-width");
			item.style.removeProperty("touch-action");
			item.removeAttribute("draggable");
			item.removeAttribute("data-overlap-cols");
			item.removeAttribute("data-overlap-col");
			item.removeAttribute("data-overlap-layout");
			item.querySelectorAll(".resize-handle").forEach(function (handle) {
				try { handle.remove(); } catch (_) {}
			});
		} catch (_) {}
		item.setAttribute("data-progress-alert", "false");
		item.removeAttribute("data-progress-label");
		item.removeAttribute("data-progress-left");
		item.removeAttribute("data-progress-urgency");
		if (item.getAttribute("data-planner-pointerdown-bound") !== "1") {
			item.addEventListener("pointerdown",onTaskPointerDown,true);
			item.setAttribute("data-planner-pointerdown-bound","1");
		}
		applyTaskTagColorMeta(item, row, typeCls);
		tcEnsureStatusCircle(item, row, typeCls);
		var doc = item.ownerDocument || getTasksCalendarDocument();
		var inner = null;
		try { inner = item.querySelector(":scope > .inner"); } catch (_) { inner = item.querySelector(".inner"); }
		if (!inner && doc && doc.createElement) {
			inner = doc.createElement("span");
			inner.className = "inner";
			while (item.firstChild) { inner.appendChild(item.firstChild); }
			item.appendChild(inner);
		}
		if (inner) {
			var titleRow = inner.querySelector(".tc-title-row");
			var desc = inner.querySelector(".description, a.internal-link, .internal-link");
			if (!titleRow && doc && doc.createElement) {
				titleRow = doc.createElement("span");
				titleRow.className = "tc-title-row";
				if (desc && desc.parentNode) {
					try { desc.parentNode.insertBefore(titleRow, desc); } catch (_) { inner.appendChild(titleRow); }
					try { titleRow.appendChild(desc); } catch (_) {}
				} else {
					var title = getPlannerChromeWaitingTaskText(item);
					var span = doc.createElement("span");
					span.className = "description";
					span.textContent = title;
					titleRow.appendChild(span);
					inner.appendChild(titleRow);
				}
			} else if (titleRow && desc && desc.parentNode !== titleRow) {
				try { titleRow.appendChild(desc); } catch (_) {}
			}
			var circle = item.querySelector(".noria-status-circle[data-noria-status-circle='1']");
			if (titleRow && circle && circle.parentNode !== titleRow) {
				try { titleRow.appendChild(circle); } catch (_) {}
			}
		}
		var timeEl = item.querySelector(".time");
		if (timeEl) {
			try { timeEl.setAttribute("aria-hidden", "true"); } catch (_) {}
		}
		return item;
	} catch (_) {
		return item;
	}
}
function hasPlannerChromeWaitingStandardStructure(el) {
	if (!el || el.nodeType !== 1 || !el.querySelector) { return false; }
	try {
		var inner = null;
		try { inner = el.querySelector(":scope > .inner"); } catch (_) { inner = el.querySelector(".inner"); }
		if (!inner) { return false; }
		var titleRow = inner.querySelector(".tc-title-row");
		if (!titleRow) { return false; }
		var title = titleRow.querySelector(".description, .internal-link, a.internal-link");
		if (!title) { return false; }
		return !!String(title.textContent || "").replace(/\u200b/g, "").trim();
	} catch (_) {
		return false;
	}
}
function collectValidWaitingTasks(bucket, options) {
	options = options || {};
	var valid = [];
	if (!bucket || !bucket.querySelectorAll) { return valid; }
	try {
		Array.prototype.slice.call(bucket.querySelectorAll("[data-tc-cal-item='1'], .tc-cal-item")).forEach(function (node) {
			var ok = isPlannerChromeWaitingTaskElement(node);
			try {
				if (ok) {
					node.removeAttribute("data-tc-waiting-hidden");
					node.setAttribute("data-tc-waiting-valid", "1");
					try { applyTaskTagColorMeta(node, tcTaskRowFromCalItemEl(node), tcInferTypeClsFromCalItemEl(node)); } catch (_) {}
					try { normalizePlannerChromeWaitingItem(node); } catch (_) {}
					valid.push(node);
				} else {
					node.setAttribute("data-tc-waiting-hidden", "1");
					node.removeAttribute("data-tc-waiting-valid");
					if (options.prunePlaceholders && isPlannerChromeWaitingPlaceholderElement(node)) {
						try { node.remove(); } catch (_) {}
					}
				}
			} catch (_) {
				if (ok) { valid.push(node); }
			}
		});
	} catch (_) {}
	return valid;
}
var PLANNER_WAITING_VISIBLE_LIMIT = 2;
var PLANNER_WAITING_ROWS_ENABLED = true;
function arePlannerChromeWaitingRowsEnabled() {
	return PLANNER_WAITING_ROWS_ENABLED === true;
}
function clearPlannerChromeWaitingLayer(calRoot) {
	var r = calRoot || rootNode;
	if (!r) { return; }
	try {
		r.style.setProperty("--tc-planner-waiting-peek", "0px");
	} catch (_) {}
	try {
		var grid = r.querySelector && r.querySelector(":scope > .grid");
		if (!grid) { return; }
		grid.querySelectorAll(":scope > .tc-planner-waiting-layer").forEach(function (layer) {
			try { layer.remove(); } catch (_) {}
		});
		grid.querySelectorAll(":scope > .cell .cellContent > .tc-planner-waiting-host").forEach(function (host) {
			try { host.remove(); } catch (_) {}
		});
	} catch (_) {}
}
function getPlannerChromeWaitingStripCount(strip) {
	if (!strip || !strip.getAttribute) { return 0; }
	var n = parseInt(String(strip.getAttribute("data-count") || "0"), 10);
	return Number.isFinite(n) ? Math.max(0, n) : 0;
}
function buildPlannerChromeWaitingItemFromEntry(ent, currentDate, doc) {
	ent = ent || {};
	var task = ent.task || ent.taskObj || null;
	var node = ent.node || (ent.nodeType === 1 ? ent : null);
	var typ = ent.typ || ent.type || ent.cls || "";
	if (!typ && node) {
		try { typ = tcInferTypeClsFromCalItemEl(node); } catch (_) { typ = ""; }
	}
	if (!typ) { typ = "due"; }
	if (task && isRenderableTaskRow(task, typ)) {
		var item = null;
		try { item = buildTaskElement(task, typ, currentDate, doc); } catch (_) { item = null; }
		if (item && hasPlannerChromeWaitingStandardStructure(item)) {
			try { item = tcEnsureNodeDocument(item, doc); } catch (_) {}
			try {
				item._noriaPlannerWaitingTask = task;
				item._noriaPlannerWaitingType = typ;
				item.setAttribute("data-noria-waiting-rebuilt", "1");
				applyTaskTagColorMeta(item, task, typ);
				applyTaskDependencyStateToEl(item, task);
				tcEnsureStatusCircle(item, task, typ);
				normalizePlannerChromeWaitingItem(item);
				if (typ === "overdue") {
					var originalTime = normalizeTimeStr(getTimeForClass(task, typ));
					var originalDate = coerceTemporalToYmd(task && task.due) || coerceTemporalToYmd(task && task.start) || "";
					var originalWhen = [originalDate, originalTime].filter(Boolean).join(" ");
					if (originalWhen) {
						var waitingTitle = getPlannerChromeWaitingTaskText(item);
						var waitingDetail = waitingTitle ? (waitingTitle + " · " + originalWhen) : originalWhen;
						item.setAttribute("title", waitingDetail);
						item.setAttribute("aria-label", waitingDetail);
					}
				}
			} catch (_) {}
			return (isPlannerChromeWaitingTaskElement(item) && hasPlannerChromeWaitingStandardStructure(item)) ? item : null;
		}
	}
	if (node && isPlannerChromeWaitingTaskElement(node) && hasPlannerChromeWaitingStandardStructure(node)) {
		return node;
	}
	return null;
}
var PLANNER_WAITING_USER_SCROLLING_MS = 900;
var plannerChromeWaitingScrollStateByDate = Object.create(null);
function getPlannerChromeWaitingStripDate(strip) {
	if (!strip || strip.nodeType !== 1) { return ""; }
	try {
		return String(strip.getAttribute("data-date") || strip.closest(".tc-planner-waiting-host")?.getAttribute("data-date") || "").trim();
	} catch (_) {
		return String(strip.getAttribute("data-date") || "").trim();
	}
}
function getPlannerChromeWaitingStripItemCount(strip) {
	if (!strip || strip.nodeType !== 1) { return 0; }
	var itemCount = 0;
	try {
		itemCount = strip.querySelectorAll(":scope > .tc-planner-waiting-strip-list > [data-tc-waiting-item='1']").length;
	} catch (_q) {
		try { itemCount = strip.querySelectorAll("[data-tc-waiting-item='1']").length; } catch (_q2) { itemCount = 0; }
	}
	if (!itemCount) {
		var rawCount = getPlannerChromeWaitingStripCount(strip);
		if (rawCount > 0) { itemCount = rawCount; }
	}
	return itemCount;
}
function getPlannerChromeWaitingStripMaxScroll(strip) {
	if (!strip || strip.nodeType !== 1) { return 0; }
	return Math.max(0, (strip.scrollHeight || 0) - (strip.clientHeight || 0));
}
function setPlannerChromeWaitingScrollRestoreState(strip, state, reason, top) {
	if (!strip || strip.nodeType !== 1) { return; }
	try {
		if (state) {
			strip.setAttribute("data-scroll-restore-state", String(state));
		} else {
			strip.removeAttribute("data-scroll-restore-state");
		}
		if (reason) {
			strip.setAttribute("data-scroll-restore-reason", String(reason));
		} else {
			strip.removeAttribute("data-scroll-restore-reason");
		}
		if (typeof top === "number" && isFinite(top)) {
			strip.setAttribute("data-scroll-restore-top", String(Math.round(top * 100) / 100));
		} else {
			strip.removeAttribute("data-scroll-restore-top");
		}
	} catch (_) {}
}
function capturePlannerChromeWaitingStripScroll(strip) {
	if (!strip || strip.nodeType !== 1) { return null; }
	try {
		var ymd = getPlannerChromeWaitingStripDate(strip);
		var maxScroll = getPlannerChromeWaitingStripMaxScroll(strip);
		var itemCount = getPlannerChromeWaitingStripItemCount(strip);
		var top = Math.max(0, Math.min(maxScroll, Number(strip.scrollTop || 0)));
		var state = { top: top, itemCount: itemCount, range: maxScroll, ts: Date.now() };
		if (ymd) { plannerChromeWaitingScrollStateByDate[ymd] = state; }
		if (ymd) { strip.setAttribute("data-scroll-key", ymd); } else { strip.removeAttribute("data-scroll-key"); }
		strip.setAttribute("data-scroll-cache-state", "captured");
		strip.setAttribute("data-scroll-cache-top", String(Math.round(top * 100) / 100));
		strip.setAttribute("data-scroll-cache-count", String(itemCount));
		strip.setAttribute("data-scroll-cache-range", String(Math.round(maxScroll * 100) / 100));
		strip.setAttribute("data-scroll-top", String(Math.round(top * 100) / 100));
		return state;
	} catch (_) {
		return null;
	}
}
function capturePlannerChromeWaitingScrollState(r) {
	var root = r || rootNode;
	if (!root || !root.querySelectorAll) { return; }
	try {
		root.querySelectorAll(".tc-planner-waiting-strip").forEach(function (strip) {
			capturePlannerChromeWaitingStripScroll(strip);
		});
	} catch (_) {}
}
function restorePlannerChromeWaitingStripScroll(strip, fallbackState) {
	if (!strip || strip.nodeType !== 1) { return false; }
	try {
		var itemCount = getPlannerChromeWaitingStripItemCount(strip);
		var scrollHeight = Number(strip.scrollHeight) || 0;
		var clientHeight = Number(strip.clientHeight) || 0;
		var maxScroll = Math.max(0, scrollHeight - clientHeight);
		var ymd = getPlannerChromeWaitingStripDate(strip);
		if (ymd) { strip.setAttribute("data-scroll-key", ymd); }
		strip.setAttribute("data-scroll-restore-source", fallbackState ? "fallback" : (ymd ? "date-cache" : "none"));
		var state = fallbackState || (ymd ? plannerChromeWaitingScrollStateByDate[ymd] : null);
		if (!state) {
			setPlannerChromeWaitingScrollRestoreState(strip, "missing-cache", "no cached scroll state");
			return false;
		}
		if (!strip.hidden && itemCount > PLANNER_WAITING_VISIBLE_LIMIT && maxScroll <= 1) {
			setPlannerChromeWaitingScrollRestoreState(strip, "pending-geometry", "waiting for scroll range", Number(state.top || 0));
			return false;
		}
		if (strip.hidden || itemCount <= PLANNER_WAITING_VISIBLE_LIMIT || maxScroll <= 1) {
			setPlannerChromeWaitingScrollRestoreState(strip, "not-scrollable", "strip has no scroll range", Number(state.top || 0));
			return false;
		}
		var nextTop = Math.max(0, Math.min(maxScroll, Number(state.top || 0)));
		strip.scrollTop = nextTop;
		strip.setAttribute("data-scroll-top", String(Math.round(nextTop * 100) / 100));
		setPlannerChromeWaitingScrollRestoreState(strip, "applied", "restored cached scroll", nextTop);
		return true;
	} catch (_) {
		setPlannerChromeWaitingScrollRestoreState(strip, "failed", "restore threw");
		return false;
	}
}
function markPlannerChromeWaitingStripUserScrolling(strip) {
	if (!strip || strip.nodeType !== 1) { return; }
	try {
		strip.setAttribute("data-tc-waiting-user-scrolling", "1");
		strip.setAttribute("data-tc-waiting-user-scroll-ts", String(Date.now()));
		capturePlannerChromeWaitingStripScroll(strip);
		if (strip._noriaWaitingUserScrollTimer) {
			try { clearTimeout(strip._noriaWaitingUserScrollTimer); } catch (_) {}
		}
		strip._noriaWaitingUserScrollTimer = setTimeout(function () {
			try {
				var ts = Number(strip.getAttribute("data-tc-waiting-user-scroll-ts") || 0);
				if (!ts || (Date.now() - ts) >= PLANNER_WAITING_USER_SCROLLING_MS) {
					strip.removeAttribute("data-tc-waiting-user-scrolling");
				}
			} catch (_) {}
		}, PLANNER_WAITING_USER_SCROLLING_MS + 40);
	} catch (_) {}
}
function hasPlannerChromeWaitingUserScrolling(r) {
	var root = r || rootNode;
	if (!root || !root.querySelectorAll) { return false; }
	var active = false;
	try {
		root.querySelectorAll(".tc-planner-waiting-strip[data-tc-waiting-user-scrolling='1']").forEach(function (strip) {
			if (active) { return; }
			var ts = Number(strip.getAttribute("data-tc-waiting-user-scroll-ts") || 0);
			if (!ts || (Date.now() - ts) <= (PLANNER_WAITING_USER_SCROLLING_MS + 120)) {
				active = true;
			} else {
				try { strip.removeAttribute("data-tc-waiting-user-scrolling"); } catch (_) {}
			}
		});
	} catch (_) {}
	return active;
}
function schedulePlannerChromeWaitingRebuildAfterScroll(r) {
	var root = r || rootNode;
	if (!root || root._noriaWaitingRebuildAfterScrollTimer) { return; }
	root._noriaWaitingRebuildAfterScrollTimer = setTimeout(function () {
		root._noriaWaitingRebuildAfterScrollTimer = null;
		if (!root || !root.isConnected) { return; }
		if (hasPlannerChromeWaitingUserScrolling(root)) {
			schedulePlannerChromeWaitingRebuildAfterScroll(root);
			return;
		}
		try { rebuildPlannerChromeWaitingHostsFromSnapshots(root); } catch (_) {}
		try { syncPlannerChromeDayBucketPeekVar(root); } catch (_) {}
	}, PLANNER_WAITING_USER_SCROLLING_MS + 80);
}
function renderPlannerChromeWaitingStrip(strip, entries, fallbackBucket, currentDate) {
	if (!strip) { return 0; }
	var doc = (strip.ownerDocument && strip.ownerDocument.createElement) ? strip.ownerDocument : getTasksCalendarDocument();
	var valid = [];
	var currentDateKey = currentDate ? String(currentDate || "") : "";
	try { if (currentDateKey) { strip.setAttribute("data-date", currentDateKey); } } catch (_) {}
	var priorScrollState = currentDateKey ? plannerChromeWaitingScrollStateByDate[currentDateKey] : null;
	var hasExistingWaitingScrollSurface = false;
	try {
		hasExistingWaitingScrollSurface = getPlannerChromeWaitingStripItemCount(strip) > 0 || Number(strip.scrollTop || 0) > 0;
	} catch (_) {
		hasExistingWaitingScrollSurface = Number(strip.scrollTop || 0) > 0;
	}
	var savedScrollState = hasExistingWaitingScrollSurface ? (capturePlannerChromeWaitingStripScroll(strip) || priorScrollState) : priorScrollState;
	try {
		while (strip.firstChild) { strip.removeChild(strip.firstChild); }
	} catch (_) {}
	entries = Array.isArray(entries) ? entries : [];
	for (var i = 0; i < entries.length; i++) {
		var ent = entries[i] || {};
		var node = buildPlannerChromeWaitingItemFromEntry(ent, currentDate, doc);
		if (!node || node.nodeType !== 1) { continue; }
		if (!isPlannerChromeWaitingTaskElement(node) || !hasPlannerChromeWaitingStandardStructure(node)) {
			try { node.remove(); } catch (_) {}
			continue;
		}
		valid.push(node);
	}
	if (!valid.length) {
		try {
			strip.hidden = true;
			strip.classList.add("is-empty");
			strip.setAttribute("data-count", "0");
		} catch (_) {}
		try { syncPlannerChromeWaitingStripScrollableState(strip); } catch (_) {}
		if (fallbackBucket) {
			try { while (fallbackBucket.firstChild) { fallbackBucket.removeChild(fallbackBucket.firstChild); } } catch (_) {}
		}
		return 0;
	}
	try {
		strip.hidden = false;
		strip.classList.remove("is-empty");
		strip.setAttribute("data-count", String(valid.length));
		if (currentDateKey) { strip.setAttribute("data-date", currentDateKey); }
	} catch (_) {}
	var list = doc.createElement("div");
	list.className = "tc-planner-waiting-strip-list";
	for (var vi = 0; vi < valid.length; vi++) {
		var item = valid[vi];
		try {
			normalizePlannerChromeWaitingItem(item);
			item.setAttribute("data-tc-waiting-item", "1");
			item.setAttribute("data-tc-waiting-index", String(vi));
			if (vi >= PLANNER_WAITING_VISIBLE_LIMIT) {
				item.setAttribute("data-tc-waiting-overflow", "1");
			} else {
				item.removeAttribute("data-tc-waiting-overflow");
			}
			item.removeAttribute("data-tc-waiting-hidden");
			item.setAttribute("data-tc-waiting-valid", "1");
			item.setAttribute("data-noria-waiting-visible", "1");
			try {
				applyTaskTagColorMeta(
					item,
					item._noriaPlannerWaitingTask || tcTaskRowFromCalItemEl(item),
					item._noriaPlannerWaitingType || tcInferTypeClsFromCalItemEl(item)
				);
			} catch (_) {}
		} catch (_) {}
		try { list.appendChild(item); } catch (_) {}
	}
	try { strip.appendChild(list); } catch (_) {}
	try { syncPlannerChromeWaitingStripScrollableState(strip); } catch (_) {}
	try { restorePlannerChromeWaitingStripScroll(strip, savedScrollState); } catch (_) {}
	try {
		requestAnimationFrame(function () {
			try { syncPlannerChromeWaitingStripScrollableState(strip); } catch (_) {}
			try { restorePlannerChromeWaitingStripScroll(strip, savedScrollState); } catch (_) {}
		});
	} catch (_) {}
	return valid.length;
}
function syncPlannerChromeWaitingStripScrollableState(strip) {
	if (!strip || strip.nodeType !== 1) { return false; }
	try {
		var itemCount = getPlannerChromeWaitingStripItemCount(strip);
		var scrollHeight = Number(strip.scrollHeight) || 0;
		var clientHeight = Number(strip.clientHeight) || 0;
		var maxScroll = Math.max(0, scrollHeight - clientHeight);
		try {
			strip.setAttribute("data-scroll-count", String(itemCount));
			strip.setAttribute("data-scroll-range", String(Math.round(maxScroll * 100) / 100));
		} catch (_meta) {}
		var canScroll = !strip.hidden && itemCount > PLANNER_WAITING_VISIBLE_LIMIT && maxScroll > 1;
		if (canScroll) {
			strip.setAttribute("data-scrollable", "1");
			return true;
		}
		strip.removeAttribute("data-scrollable");
		if (strip.hidden || itemCount <= PLANNER_WAITING_VISIBLE_LIMIT) {
			strip.scrollTop = 0;
		}
		return false;
	} catch (_) {
		try {
			strip.removeAttribute("data-scrollable");
			strip.removeAttribute("data-scroll-count");
			strip.removeAttribute("data-scroll-range");
			strip.scrollTop = 0;
		} catch (_2) {}
		return false;
	}
}
var WAITING_STRIP_SCROLL_GUARD_VERSION = "3";
function bindPlannerChromeWaitingStripScrollGuard(strip) {
	if (!strip || strip.nodeType !== 1) { return; }
	if (strip.getAttribute("data-tc-waiting-scroll-bound-version") === WAITING_STRIP_SCROLL_GUARD_VERSION) { return; }
	var onWheel = function (ev) {
		try {
			syncPlannerChromeWaitingStripScrollableState(strip);
			if (strip.getAttribute("data-scrollable") !== "1") { return; }
			var deltaY = Number(ev.deltaY || 0);
			if (!deltaY) { return; }
			var maxScroll = Math.max(0, (strip.scrollHeight || 0) - (strip.clientHeight || 0));
			if (maxScroll <= 1) { return; }
			var current = Math.max(0, Math.min(maxScroll, Number(strip.scrollTop || 0)));
			var next = Math.max(0, Math.min(maxScroll, current + deltaY));
			if (next === current) { return; }
			strip.scrollTop = next;
			markPlannerChromeWaitingStripUserScrolling(strip);
			capturePlannerChromeWaitingStripScroll(strip);
			if (typeof ev.preventDefault === "function") { ev.preventDefault(); }
			ev.stopPropagation();
		} catch (_) {}
	};
	var onScrollStart = function (ev) {
		try {
			if (!syncPlannerChromeWaitingStripScrollableState(strip)) { return; }
			markPlannerChromeWaitingStripUserScrolling(strip);
			capturePlannerChromeWaitingStripScroll(strip);
			ev.stopPropagation();
		} catch (_) {}
	};
	var onScroll = function () {
		try {
			markPlannerChromeWaitingStripUserScrolling(strip);
			capturePlannerChromeWaitingStripScroll(strip);
		} catch (_) {}
	};
	try {
		strip.addEventListener("wheel", onWheel, { capture: true, passive: false });
	} catch (_) {
		try { strip.addEventListener("wheel", onWheel, true); } catch (_2) {}
	}
	try { strip.addEventListener("pointerdown", onScrollStart, { capture: true }); } catch (_) { try { strip.addEventListener("pointerdown", onScrollStart, true); } catch (_3) {} }
	try { strip.addEventListener("mousedown", onScrollStart, { capture: true }); } catch (_) { try { strip.addEventListener("mousedown", onScrollStart, true); } catch (_4) {} }
	try { strip.addEventListener("touchstart", onScrollStart, { capture: true, passive: true }); } catch (_) { try { strip.addEventListener("touchstart", onScrollStart, true); } catch (_5) {} }
	try { strip.addEventListener("scroll", onScroll, { passive: true }); } catch (_) { try { strip.addEventListener("scroll", onScroll); } catch (_6) {} }
	try {
		strip.setAttribute("data-tc-waiting-scroll-bound", "1");
		strip.setAttribute("data-tc-waiting-scroll-bound-version", WAITING_STRIP_SCROLL_GUARD_VERSION);
	} catch (_) {}
}
function renderPlannerChromeWaitingHostForDate(currentDate, entries, cellContent, fallbackBucket) {
	if (!arePlannerChromeWaitingRowsEnabled()) {
		clearPlannerChromeWaitingLayer(rootNode);
		if (fallbackBucket) {
			try { while (fallbackBucket.firstChild) { fallbackBucket.removeChild(fallbackBucket.firstChild); } } catch (_) {}
		}
		return 0;
	}
	cellContent = cellContent || getPlannerChromeWaitingCellContent(currentDate, rootNode);
	if (!cellContent) { return 0; }
	var ymd = String(currentDate || "");
	var host = ensurePlannerChromeWaitingHost(cellContent, currentDate);
	if (!host) { return 0; }
	var strip = null;
	try { strip = host.querySelector(":scope > .tc-planner-waiting-strip"); } catch (_) { strip = null; }
	if (!strip) {
		strip = getTasksCalendarDocument().createElement("div");
		strip.className = "tc-planner-waiting-strip";
		strip.setAttribute("aria-label", tcRuntimeT("runtime.tasksCalendar.waiting.aria"));
		host.appendChild(strip);
	}
	var count = renderPlannerChromeWaitingStrip(strip, entries, fallbackBucket, currentDate);
	try { bindPlannerChromeWaitingStripScrollGuard(strip); } catch (_) {}
	try {
		host.hidden = false;
		host.setAttribute("data-empty", count <= 0 ? "1" : "0");
		host.setAttribute("data-count", String(count));
		host.setAttribute("data-source-count", String((Array.isArray(entries) ? entries : []).length));
		host.setAttribute("data-date", ymd);
		if (count <= 0) { host.removeAttribute("data-render-miss"); }
	} catch (_) {}
	var total = countPlannerChromeWaitingLayerTasks(rootNode);
	var sourceTotal = countPlannerChromeWaitingSourceTasks(rootNode);
	try {
		rootNode.toggleAttribute("data-tc-waiting-render-miss", sourceTotal > 0 && total <= 0);
		rootNode.setAttribute("data-tc-waiting-visible-count", String(total));
		rootNode.setAttribute("data-tc-waiting-source-count", String(sourceTotal));
		syncPlannerChromeDayBucketPeekVar(rootNode);
	} catch (_) {}
	return count;
}
function renderPlannerChromeWaitingLayerForDate(currentDate, entries, fallbackBucket) {
	return renderPlannerChromeWaitingHostForDate(currentDate, entries, getPlannerChromeWaitingCellContent(currentDate, rootNode), fallbackBucket);
}
function countPlannerChromeWaitingLayerTasks(r) {
	var n = 0;
	if (!r || !r.querySelectorAll) { return n; }
	try {
		r.querySelectorAll(".tc-planner-waiting-strip [data-tc-waiting-item='1']").forEach(function (node) {
			if (isPlannerChromeWaitingTaskElement(node)) { n++; }
		});
	} catch (_) { n = 0; }
	return n;
}
function countPlannerChromeWaitingSourceTasks(r) {
	var root = r || rootNode;
	var n = 0;
	if (!root) { return n; }
	try {
		var snapshot = getPlannerChromeWaitingSnapshotEntries(root);
		for (var i = 0; i < snapshot.length; i++) {
			var ent = snapshot[i].entry || {};
			var typ = ent.typ || ent.type || ent.cls || "";
			var node = ent.node || null;
			if (!typ && node) {
				try { typ = tcInferTypeClsFromCalItemEl(node); } catch (_) { typ = ""; }
			}
			if (!typ) { typ = "due"; }
			if ((ent.task && isRenderableTaskRow(ent.task, typ)) || isPlannerChromeWaitingTaskElement(node)) {
				n++;
			}
		}
	} catch (_) { n = 0; }
	if (n > 0) { return n; }
	try { n = countPlannerChromeWaitingLayerTasks(root); } catch (_) { n = 0; }
	if (n > 0) { return n; }
	try {
		root.querySelectorAll(".dayBucket [data-tc-cal-item='1'], .dayBucket .tc-cal-item").forEach(function (node) {
			if (isPlannerChromeWaitingTaskElement(node)) { n++; }
		});
	} catch (_) {}
	return n;
}
function countPlannerChromeWaitingTasksInRoot(r) {
	return countPlannerChromeWaitingSourceTasks(r);
}
function rebuildPlannerChromeWaitingHostsFromSnapshots(r) {
	var root = r || rootNode;
	if (!root || !root.querySelector) { return 0; }
	if (!arePlannerChromeWaitingRowsEnabled()) {
		clearPlannerChromeWaitingLayer(root);
		return 0;
	}
	try { capturePlannerChromeWaitingScrollState(root); } catch (_) {}
	if (hasPlannerChromeWaitingUserScrolling(root)) {
		schedulePlannerChromeWaitingRebuildAfterScroll(root);
		return countPlannerChromeWaitingLayerTasks(root);
	}
	var map = getPlannerChromeWaitingEntryMap(root);
	if (!map) { return 0; }
	var grid = null;
	try { grid = root.querySelector(":scope > .grid"); } catch (_) { grid = null; }
	if (!grid) { return 0; }
	try {
		grid.querySelectorAll(":scope > .tc-planner-waiting-layer").forEach(function (layer) {
			try { layer.remove(); } catch (_) {}
		});
		grid.querySelectorAll(":scope > .cell .cellContent > .tc-planner-waiting-host").forEach(function (host) {
			try { host.remove(); } catch (_) {}
		});
	} catch (_) {}
	var total = 0;
	try {
		Object.keys(map).sort().forEach(function (ymd) {
			var entries = Array.isArray(map[ymd]) ? map[ymd] : [];
			var content = getPlannerChromeWaitingCellContent(ymd, root);
			if (!content) { return; }
			total += renderPlannerChromeWaitingHostForDate(ymd, entries, content, null);
		});
	} catch (_) {}
	try {
		var visibleTotal = countPlannerChromeWaitingLayerTasks(root);
		var sourceTotal = countPlannerChromeWaitingSourceTasks(root);
		root.toggleAttribute("data-tc-waiting-render-miss", sourceTotal > 0 && visibleTotal <= 0);
		root.setAttribute("data-tc-waiting-visible-count", String(visibleTotal));
		root.setAttribute("data-tc-waiting-source-count", String(sourceTotal));
		syncPlannerChromeDayBucketPeekVar(root);
	} catch (_) {}
	return total;
}
function rebuildPlannerChromeWaitingLayerFromSnapshots(r) {
	return rebuildPlannerChromeWaitingHostsFromSnapshots(r);
}
function markPlannerChromeWaitingBucketValidity(bucket) {
	return collectValidWaitingTasks(bucket, { prunePlaceholders: false });
}
function schedulePlannerChromeWaitingLayerPostReflow(calRoot) {
	var r = calRoot || rootNode;
	if (!r) { return; }
	if (r._noriaPlannerWaitingPostReflowRaf) { return; }
	r._noriaPlannerWaitingPostReflowRaf = requestAnimationFrame(function () {
		try { r._noriaPlannerWaitingPostReflowRaf = null; } catch (_) {}
		try { syncPlannerChromeDayBucketPeekVar(r); } catch (_) {}
		r._noriaPlannerWaitingPostReflowInnerRaf = requestAnimationFrame(function () {
			try { r._noriaPlannerWaitingPostReflowInnerRaf = null; } catch (_) {}
			if (tcRuntimeDisposed || !r || !r.isConnected) { return; }
			try { syncPlannerChromeDayBucketPeekVar(r); } catch (_) {}
			try { enforcePlannerChromeWeekGridLayout(); } catch (_) {}
			try { applyPlannerChromeTimelineAxis(); } catch (_) {}
			try { refreshPlannerChromeNowNeedle(); } catch (_) {}
		});
	});
}
function schedulePlannerChromeStableTimelineReflow(calRoot, anchorBtn) {
	var r = calRoot || rootNode;
	if (!r) { return; }
	try { syncPlannerChromeDayBucketPeekVar(r); } catch (_) {}
	if (r._noriaPlannerStableReflowRaf) { return; }
	r._noriaPlannerStableReflowRaf = requestAnimationFrame(function () {
		try { r._noriaPlannerStableReflowRaf = null; } catch (_) {}
		try { syncPlannerChromeDayBucketPeekVar(r); } catch (_) {}
		try { enforcePlannerChromeWeekGridLayout(); } catch (_) {}
		try { applyPlannerChromeTimelineAxis(); } catch (_) {}
		try { refreshPlannerChromeNowNeedle(); } catch (_) {}
		try { schedulePlannerChromeWeekLanesFinalize(true); } catch (_) {}
		try { schedulePlannerChromeWaitingLayerPostReflow(r); } catch (_) {}
	});
}
function positionTimelineQuickPopover(anchorBtn) {
 var cal=anchorBtn&&anchorBtn.closest(".tasksCalendar"),pop=cal&&cal.querySelector(".tc-timeline-quick-popover");
 if(pop)bridgeCfg.tasksCalendar.placePopover(pop,anchorBtn,cal);
}
function ensureTimelineQuickPopoverTitleRow(pop) {
	if (!pop) {
		return;
	}
	var card = pop.querySelector(".tc-timeline-quick-popover-card");
	if (!card) {
		return;
	}
	var existingTitleRow = card.querySelector(".tc-timeline-quick-popover-title-row");
	if (existingTitleRow) {
		if (!existingTitleRow.querySelector(".tc-timeline-quick-popover-library")) {
			var existingClose = existingTitleRow.querySelector(".tc-timeline-quick-popover-close");
			var existingLib = document.createElement("button");
			existingLib.type = "button";
			existingLib.className = "tc-timeline-quick-popover-library";
			existingLib.textContent = tcRuntimeT("runtime.tasksCalendar.quick.library");
			existingLib.addEventListener("click", function (ev) {
				ev.preventDefault();
				ev.stopPropagation();
				runQuickAction("open-library").catch(function (err) {
					console.error("[tasksCalendar] open event library failed:", err);
				});
			});
			existingTitleRow.insertBefore(existingLib, existingClose || null);
		}
		return;
	}
	var scroll = card.querySelector(".tc-timeline-quick-popover-scroll");
	var oldTitle = card.querySelector(".tc-timeline-quick-popover-title");
	var titleRow = document.createElement("div");
	titleRow.className = "tc-timeline-quick-popover-title-row";
	var titleText = document.createElement("div");
	titleText.className = "tc-timeline-quick-popover-title-text";
	titleText.id = "tc-timeline-quick-popover-heading";
	titleText.textContent = (oldTitle && oldTitle.textContent) ? oldTitle.textContent.trim() : tcRuntimeT("runtime.tasksCalendar.quickTimeline.title");
	var btnClose = document.createElement("button");
	btnClose.type = "button";
	btnClose.className = "tc-timeline-quick-popover-close";
	btnClose.setAttribute("aria-label", tcRuntimeT("runtime.tasksCalendar.common.close"));
	btnClose.innerHTML = "<span aria-hidden=\"true\">\u00d7</span>";
	var btnLibrary = document.createElement("button");
	btnLibrary.type = "button";
	btnLibrary.className = "tc-timeline-quick-popover-library";
	btnLibrary.textContent = tcRuntimeT("runtime.tasksCalendar.quick.library");
	titleRow.appendChild(titleText);
	titleRow.appendChild(btnLibrary);
	titleRow.appendChild(btnClose);
	if (oldTitle) {
		try {
			oldTitle.remove();
		} catch (_) {}
	}
	if (scroll && scroll.parentNode === card) {
		card.insertBefore(titleRow, scroll);
	} else {
		card.insertBefore(titleRow, card.firstChild);
	}
	var cal = pop.closest(".tasksCalendar");
	btnClose.addEventListener("click", function (ev) {
		ev.preventDefault();
		ev.stopPropagation();
		closeTimelineQuickPopoverForRoot(cal);
	});
	btnLibrary.addEventListener("click", function (ev) {
		ev.preventDefault();
		ev.stopPropagation();
		runQuickAction("open-library").catch(function (err) {
			console.error("[tasksCalendar] open event library failed:", err);
		});
	});
	try {
		pop.setAttribute("aria-labelledby", "tc-timeline-quick-popover-heading");
	} catch (_) {}
}
function bindTimelineQuickPopoverDismissOnce() {
	var docEl = typeof document !== "undefined" ? document.documentElement : null;
	if (!docEl || docEl._noriaTcTimelineQuickPopDismissBound) {
		return;
	}
	docEl._noriaTcTimelineQuickPopDismissBound = true;
	document.addEventListener("click", function (ev) {
		var opens = document.querySelectorAll(".tasksCalendar.tc-timeline-quick-open");
		if (!opens.length) {
			return;
		}
		var t = ev.target;
		for (var oi = 0; oi < opens.length; oi++) {
			var cal = opens[oi];
			var pop = cal.querySelector(".tc-timeline-quick-popover");
			var dr = cal.querySelector("button.tc-timeline-quick-drawer");
			if (dr && (dr === t || (dr.contains && dr.contains(t)))) {
				continue;
			}
			if (pop && (pop === t || (pop.contains && pop.contains(t)))) {
				continue;
			}
			closeTimelineQuickPopoverForRoot(cal);
		}
	}, true);
	try {
		document.addEventListener("keydown", function (kev) {
			if (kev.key !== "Escape") {
				return;
			}
			document.querySelectorAll(".tasksCalendar.tc-timeline-quick-open").forEach(function (cal) {
				closeTimelineQuickPopoverForRoot(cal);
			});
		}, true);
	} catch (_) {}
	try {
		window.addEventListener("resize", function () {
			document.querySelectorAll(".tasksCalendar.tc-timeline-quick-open").forEach(function (cal) {
				closeTimelineQuickPopoverForRoot(cal);
			});
		}, { passive: true });
	} catch (_) {
		window.addEventListener("resize", function () {
			document.querySelectorAll(".tasksCalendar.tc-timeline-quick-open").forEach(function (cal) {
				closeTimelineQuickPopoverForRoot(cal);
			});
		});
	}
}
function ensureTimelineQuickDrawerChrome() {
	if (!rootNode) {
		return;
	}
	var slot = ensureTcToolbarPlannerSlot();
	if (!slot) {
		return;
	}
	var ax = queryTimelineChromeButton("tc-planner-axis-toggle");
	var dr = dedupeTimelineChromeButtons(slot, "tc-timeline-quick-drawer") || queryTimelineChromeButton("tc-timeline-quick-drawer");
	if (!dr) {
		dr = document.createElement("button");
		dr.type = "button";
		dr.className = "tc-timeline-quick-drawer tc-toolbar-planner";
		dr.setAttribute("aria-expanded", "false");
		dr.setAttribute("aria-haspopup", "dialog");
		dr.setAttribute("title", tcRuntimeT("runtime.tasksCalendar.quickTimeline.drawerTitle"));
		bridge.setTaskEditorIcon(dr,'plus',tcRuntimeT('runtime.tasksCalendar.quickTimeline.drawerTitle'));
		if (ax && ax.parentNode === slot) {
			slot.insertBefore(dr, ax.nextSibling);
		} else {
			slot.appendChild(dr);
		}
		function warmTimelineQuickPanelFromPointer(e) {
			if (!e || (e.pointerType === "mouse" && e.button !== 0)) {
				return;
			}
			/* 仅预灌 DOM 与尺寸，真正展开仍在 click，避免同一手势先开后关 */
			setQuickTimelinePanel();
			var popEl = rootNode.querySelector(".tc-timeline-quick-popover");
			if (popEl) {
				try {
					void popEl.offsetWidth;
				} catch (_) {}
			}
		}
		function onTimelineQuickDrawerClick(e) {
			e.preventDefault();
			e.stopPropagation();
			var open = rootNode.classList.contains("tc-timeline-quick-open");
			if (open) {
				closeTimelineQuickPopover();
				return;
			}
			setQuickTimelinePanel();
			var popEl = rootNode.querySelector(".tc-timeline-quick-popover");
			if (popEl) {
				try {
					void popEl.offsetWidth;
				} catch (_) {}
			}
			rootNode.classList.add("tc-timeline-quick-open");
			dr.setAttribute("aria-expanded", "true");
			positionTimelineQuickPopover(dr);
			requestAnimationFrame(function () {
				try {
					positionTimelineQuickPopover(dr);
				} catch (_) {}
				requestAnimationFrame(function () {
					try {
						positionTimelineQuickPopover(dr);
					} catch (_) {}
				});
			});
		}
		try {
			dr.addEventListener("pointerdown", warmTimelineQuickPanelFromPointer, { capture: true });
		} catch (_) {
			dr.addEventListener("pointerdown", warmTimelineQuickPanelFromPointer, true);
		}
		dr.addEventListener("click", onTimelineQuickDrawerClick, true);
		bindTimelineQuickPopoverDismissOnce();
	}
	var pop = rootNode.querySelector(".tc-timeline-quick-popover");
	if (!pop) {
		pop = document.createElement("div");
		pop.className = "tc-timeline-quick-popover";
		pop.setAttribute("role", "dialog");
		pop.setAttribute("aria-label", tcRuntimeT("runtime.tasksCalendar.quickTimeline.title"));
		var card = document.createElement("div");
		card.className = "tc-timeline-quick-popover-card";
		var scroll = document.createElement("div");
		scroll.className = "tc-timeline-quick-popover-scroll";
		card.appendChild(scroll);
		pop.appendChild(card);
		rootNode.appendChild(pop);
		ensureTimelineQuickPopoverTitleRow(pop);
		bindTimelineQuickPopoverDismissOnce();
	} else {
		ensureTimelineQuickPopoverTitleRow(pop);
	}
	try {
		if (ax && dr && dr.parentNode === slot && ax.nextSibling !== dr) {
			slot.insertBefore(dr, ax.nextSibling);
		}
	} catch (_) {}
}
function syncTimelineQuickDrawerChrome() {
	if (!rootNode) {
		return;
	}
	ensureTimelineQuickDrawerChrome();
	var dr = queryTimelineChromeButton("tc-timeline-quick-drawer");
	if (!dr) {
		return;
	}
	if (!isTimelineCalendarView()) {
		closeTimelineQuickPopover();
		tcPlannerChromeChromeBtnSetLayoutVisible(dr, false);
		return;
	}
	tcPlannerChromeChromeBtnSetLayoutVisible(dr, true);
}
function plannerHoursText(key, args) {
	return tcRuntimeT("runtime.tasksCalendar.activeHours." + key, args);
}
function createPlannerHoursPopover(anchor, title) {
	rootNode.querySelectorAll(".tc-hours-popover").forEach(function (p) { p.hidePopover(); p.remove(); });
	var doc = getTasksCalendarDocument(), pop = doc.createElement("div");
	pop.className = "tc-hours-popover";
	pop.setAttribute("popover", "auto");
	pop.setAttribute("role", "dialog");
	pop.setAttribute("aria-label", title);
	rootNode.appendChild(pop);
	anchor.setAttribute("aria-expanded", "true");
	function position() { bridgeCfg.tasksCalendar.placePopover(pop,anchor,rootNode); }
 var win=doc.defaultView,observer=new win.ResizeObserver(position);

	pop.addEventListener("toggle", function (e) {
		if (e.newState !== "closed") return;
		anchor.setAttribute("aria-expanded", "false");
		win.removeEventListener("resize", position);
        win.removeEventListener("scroll",position,true);observer.disconnect();
		pop.remove();
	});
	pop.addEventListener("click", function (e) { e.stopPropagation(); });
	return { el: pop, open: function () { pop.showPopover(); position(); win.addEventListener("resize", position);win.addEventListener("scroll",position,true);observer.observe(rootNode); }, close: function () { if (pop.isConnected) pop.hidePopover(); if (anchor.isConnected) anchor.focus({ preventScroll: true }); } };
}
function openPlannerHoursSettings(anchor) {
	var popover = createPlannerHoursPopover(anchor, plannerHoursText("title"));
	var pop = popover.el, doc = pop.ownerDocument;
	function make(tag, cls, text) { var el = doc.createElement(tag); el.className = cls; if (text) el.textContent = text; return el; }
	var form = make("form", "tc-hours-form"), modes = make("div", "tc-hours-modes"), fullDay = showEarlyHours;
	var modeButtons = [];
	[false, true].forEach(function (full) {
		var b = make("button", "tc-hours-mode", plannerHoursText(full ? "fullDay" : "active")); b.type = "button";
		b.addEventListener("click", function () { fullDay = full; sync(); });
		modeButtons.push(b); modes.appendChild(b);
	});
	var fields = make("div", "tc-hours-fields"), inputs = [];
	["start", "end"].forEach(function (key) {
		var label = make("label", "", plannerHoursText(key)), input = make("input", "");
		input.type = "text"; input.inputMode = "numeric"; input.value = minutesToTimeStr(plannerActiveHours[key]);
		input.setAttribute("aria-label", plannerHoursText(key)); input.setAttribute("data-hours-field", key);
		input.addEventListener("input", function () { error.textContent = ""; });
		label.appendChild(input); fields.appendChild(label); inputs.push(input);
	});
	var error = make("div", "tc-hours-error"); error.setAttribute("role", "status");
	var save = make("button", "tc-hours-save", plannerHoursText("apply")); save.type = "submit";
	form.append(modes, fields, error, save); pop.appendChild(form);
	function sync() {
		modeButtons.forEach(function (b, i) { b.setAttribute("aria-pressed", String(fullDay === (i === 1))); });
		inputs.forEach(function (i) { i.disabled = fullDay; });
	}
	form.addEventListener("submit", async function (e) {
		e.preventDefault();
		function parse(value) { var m = /^(\d{1,2}):(\d{2})$/.exec(value.trim()); return m && +m[1] <= 24 && +m[2] < 60 && (+m[1] < 24 || +m[2] === 0) ? +m[1] * 60 + +m[2] : NaN; }
		var start = fullDay ? plannerActiveHours.start : parse(inputs[0].value), end = fullDay ? plannerActiveHours.end : parse(inputs[1].value);
		if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < 60) { error.textContent = plannerHoursText("invalid"); return; }
		save.disabled = true;
		try {
			var saved = await bridgeCfg.tasksCalendar.savePreference("activeHours", { start: start, end: end, fullDay: fullDay });
			if (!saved || saved.ok === false) throw new Error(plannerHoursText("saveFailed"));
			bridgeCfg.tasksCalendarSettings = saved.settings;
			plannerActiveHours = { start: start, end: end }; showEarlyHours = fullDay;
			plannerHoursExpanded = false;
			popover.close(); rerenderCalendarViewNow();
		} catch (err) { error.textContent = plannerHoursText("saveFailed"); save.disabled = false; }
	});
	sync(); popover.open(); modeButtons[fullDay ? 1 : 0].focus({ preventScroll: true });
}
function buildPlannerHoursBoundary(entries, date, doc) {
	var key = String(date);
	plannerHoursEntries.set(key, Array.from(entries.values()));
	if (plannerHoursEntries.size > 32) plannerHoursEntries.delete(plannerHoursEntries.keys().next().value);
	var row = doc.createElement("div"); row.className = "tc-hours-boundary";
	if (!entries.size && !plannerHoursExpanded) return row;
	var toggle = doc.createElement("button"); toggle.type = "button"; toggle.className = "tc-hours-expand"; toggle.dataset.hoursExpand = "true";
	toggle.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';
	toggle.setAttribute("aria-expanded", String(plannerHoursExpanded));
	toggle.setAttribute("aria-label", plannerHoursText(plannerHoursExpanded ? "collapse" : "expand"));
	toggle.title = toggle.getAttribute("aria-label"); row.appendChild(toggle);
	if (entries.size) {
		var summary = doc.createElement("button"); summary.type = "button"; summary.className = "tc-hours-summary"; summary.dataset.hoursEntries = key;
		var first = entries.values().next().value.task;
		var text = doc.createElement("span"); text.textContent = getTaskRowTitle(first); summary.appendChild(text);
		var count = doc.createElement("span"); count.className = "tc-hours-count"; count.dataset.count = String(entries.size); count.textContent = entries.size > 1 ? "+" + (entries.size - 1) : ""; summary.appendChild(count);
		summary.title = plannerHoursText("tasks", { count: entries.size });
		summary.setAttribute("aria-label", summary.title); row.appendChild(summary);
	}
	return row;
}
function openPlannerHoursEntries(anchor, entries) {
	var popover = createPlannerHoursPopover(anchor, plannerHoursText("outside")), doc = popover.el.ownerDocument;
	entries.forEach(function (entry) {
		var taskEl = buildTaskElement(entry.task, entry.typ, entry.date || selectedDate, doc);
		if (!taskEl) return;
		var button = doc.createElement("button"); button.type = "button"; button.className = "tc-hours-entry";
		var title = doc.createElement("span"); title.textContent = getTaskRowTitle(entry.task);
		var time = doc.createElement("span"); time.className = "tc-hours-entry-time"; time.textContent = formatPlannerTaskAccessibleTime(taskEl, taskEl.getAttribute("data-start-time") || taskEl.getAttribute("data-due-time") || "");
		button.append(title, time); popover.el.appendChild(button);
		button.addEventListener("click", function () { popover.close(); openTaskDateTimeEditor(taskEl, { returnFocusEl: anchor }); });
	});
	popover.open(); popover.el.querySelector("button")?.focus({ preventScroll: true });
}
function bindPlannerHoursActions() {
	if (rootNode.__tcHoursBound) return; rootNode.__tcHoursBound = true;
	rootNode.addEventListener("click", function (e) {
		var button = e.target.closest("[data-hours-expand], [data-hours-entries]");
		if (!button || !rootNode.contains(button)) return;
		e.preventDefault(); e.stopPropagation();
		if (button.dataset.hoursExpand) {
			plannerHoursExpanded = !plannerHoursExpanded; rerenderCalendarViewNow();
		} else openPlannerHoursEntries(button, plannerHoursEntries.get(button.dataset.hoursEntries) || []);
	});
}
function syncPlannerChromeAxisToggleChrome() {
	var rn = rootNode;
	if (!rn) { return; }
	ensurePlannerChromeToolbarChromeButtonsExist();
	var btn = queryTimelineChromeButton("tc-planner-axis-toggle");
	var showPlannerChrome = isPlannerChromeTimelineView(rn, ["week", "day"]);
	if (!showPlannerChrome) {
		tcPlannerChromeChromeBtnSetLayoutVisible(btn, false);
		return;
	}
	if(!btn)return;
	var expanded=showEarlyHours||plannerHoursExpanded;
	var label=tasksCalendarRuntimeLocale()==='zh-CN'?(expanded?'收起至活跃时段':'展开全天'):(expanded?'Show active hours':'Show full day');
	bridge.setTaskEditorIcon(btn,expanded?'minus':'plus',label);
	btn.setAttribute('aria-expanded',String(expanded));btn.setAttribute('aria-label',label);
	btn.title=label+' · '+(expanded?minutesToTimeStr(plannerActiveHours.start)+'–'+minutesToTimeStr(plannerActiveHours.end):'00:00–24:00');
	btn.hidden=plannerActiveHours.start===0&&plannerActiveHours.end===1440;
}

function syncPlannerChromeDayBucketChrome() {
	var rn = rootNode;
	if (!rn) { return; }
	ensurePlannerChromeToolbarChromeButtonsExist();
	var axBtn = queryTimelineChromeButton("tc-planner-axis-toggle");
	var showPlannerChrome = isPlannerChromeTimelineView(rn, ["week", "day"]);
	if (!showPlannerChrome) {
		tcPlannerChromeChromeBtnSetLayoutVisible(axBtn, false);
		return;
	}
	syncPlannerChromeAxisToggleChrome();
}

function schedulePlannerChromeWeekLanesFinalize(forceRun) {
	if (!isPlannerChromeTimelineView(rootNode, ["week", "day"])) { return; }
	if (forceRun) { weekLanesFinalizeForcePending = true; }
	if (plannerChromeInteractionActive) { return; }
	if (weekLanesFinalizeRaf !== null) { return; }
	weekLanesFinalizeRaf = requestAnimationFrame(function () {
		weekLanesFinalizeRaf = null;
		var doForce = weekLanesFinalizeForcePending;
		weekLanesFinalizeForcePending = false;
		runPlannerChromeWeekLanesFinalize(doForce);
	});
}

function schedulePlannerChromeWeekLanesFinalizePost(forceRun) {
	if (!isPlannerChromeTimelineView(rootNode, ["week", "day"])) { return; }
	requestAnimationFrame(function () {
		requestAnimationFrame(function () {
			try { schedulePlannerChromeWeekLanesFinalize(forceRun); } catch (_) {}
		});
	});
}

var overlapRelayoutRaf = null;
var plannerChromeInteractionActive = false;
var overlapRelayoutAll = false;
var overlapRelayoutLaneSet = new Set();
function schedulePlannerChromeOverlapLayout(targetLanes) {
	if (!isPlannerChromeTimelineView(rootNode, ["week", "day"])) { return; }
	if (plannerChromeInteractionActive) { return; }
	if (!targetLanes || !targetLanes.length) {
		overlapRelayoutAll = true;
		overlapRelayoutLaneSet.clear();
	} else if (!overlapRelayoutAll) {
		targetLanes.forEach((lane) => { if (lane) { overlapRelayoutLaneSet.add(lane); } });
	}
	if (overlapRelayoutRaf !== null) { return; }
	overlapRelayoutRaf = requestAnimationFrame(() => {
		overlapRelayoutRaf = null;
		if (overlapRelayoutAll) {
			applyPlannerChromeOverlapLayout();
		} else {
			applyPlannerChromeOverlapLayout(Array.from(overlapRelayoutLaneSet));
		}
		syncPlannerChromeWeekDayFocus();
		overlapRelayoutAll = false;
		overlapRelayoutLaneSet.clear();
	});
};

function normalizePlannerChromeWeekTaskGeometry() {
	if (!isPlannerChromeTimelineView(rootNode, ["week", "day"])) { return; }
	var dayStart = getPlannerChromeTimelineStartMin();
	var dayEnd = getPlannerChromeTimelineEndMin();
	var span = Math.max(1, dayEnd - dayStart);
	rootNode.querySelectorAll(".cell .timeLane [data-tc-cal-item='1'][data-slot='range'], .cell .timeLane [data-tc-cal-item='1'][data-slot='point'], .cell .timeLane .tc-cal-item[data-slot='range'], .cell .timeLane .tc-cal-item[data-slot='point'], .cell .timeLane .task[data-slot='range'], .cell .timeLane .task[data-slot='point']").forEach((taskEl) => {
		var s = parseInt(taskEl.getAttribute("data-start-min") || "", 10);
		var e = parseInt(taskEl.getAttribute("data-end-min") || "", 10);
		if (!Number.isFinite(s) || !Number.isFinite(e)) { return; }
		/* 标签与 compact：按数据层真实跨度，不受 45min 视觉垫高影响 */
		var rawStart = Math.max(dayStart, Math.min(s, dayEnd - 1));
		var rawEnd = Math.min(Math.max(e, s), dayEnd);
		taskEl.setAttribute("data-clipped-start", String(s < dayStart));
		taskEl.setAttribute("data-clipped-end", String(e > dayEnd));
		var rawSpan = Math.max(0, rawEnd - rawStart);
		var compact = rawSpan <= PLANNER_CHROME_COMPACT_MAX_MIN;
		var vis = computePlannerChromeExpandedSlotBounds(dayStart, dayEnd, s, e);
		var top = ((vis.s - dayStart) / span) * 100;
		var height = ((vis.e - vis.s) / span) * 100;
		var minPct = (PLANNER_CHROME_MIN_VISUAL_RANGE_MIN / span) * 100;
		var slotAttr = taskEl.getAttribute("data-slot") || "range";
		if (slotAttr === "point") {
			height = Math.max(height, minPct, 2.1);
		} else {
			height = Math.max(height, minPct, 2.5);
		}
		taskEl.style.top = top.toFixed(3) + "%";
		taskEl.style.height = height.toFixed(3) + "%";
		taskEl.setAttribute("data-compact", compact ? "true" : "false");
		var timeNode = taskEl.querySelector(".time");
		if (!timeNode) { return; }
		var startLine = timeNode.querySelector(".tline.start");
		var endLine = timeNode.querySelector(".tline.end");
		var startLabel = minutesToTimeStr(rawStart);
		var endLabel = minutesToTimeStr(rawEnd > rawStart ? rawEnd : Math.min(dayEnd, rawStart + 10));
		if (startLine) { startLine.textContent = startLabel; }
		if (endLine) { endLine.textContent = compact ? "" : endLabel; }
	});
};

function setStatisticValues(dueCounter, doneCounter, overdueCounter, startCounter, scheduledCounter, recurrenceCounter, dailyNoteCounter) {
	var taskCounter = parseInt(dueCounter+doneCounter+overdueCounter);
	var tasksRemaining = taskCounter - doneCounter;
	var percentage = taskCounter > 0 ? Math.round(100 * doneCounter / taskCounter) : NaN;

	var popupRoot = getStatisticPopupEl();
	var statBtn = rootNode.querySelector("button.statistic");
	if (!statBtn) {
		try {
			var compBtnHost = noriaTcMoreCompositeForCal(rootNode);
			if (compBtnHost) {
				statBtn = compBtnHost.querySelector("button.statistic");
			}
		} catch (_) {}
	}
	var ui = globalThis.__noriaTaskCalendarUi || null;
	if (statBtn) {
		var glyph = tcStatisticGlyphIcon;
		if (ui && typeof ui.renderStatisticButton === "function") {
			ui.renderStatisticButton(statBtn, { glyph: glyph, percentage: isNaN(percentage) ? NaN : percentage });
		} else {
			statBtn.innerHTML = "<span class='tc-stat-glyph'>" + glyph + "</span><span class='tc-stat-pct'>" + (isNaN(percentage) ? "—" : percentage + "%") + "</span>";
		}
	}
	if (tasksRemaining > 99) { tasksRemaining = "99+"; }
	if (statBtn) {
		statBtn.setAttribute("data-percentage", Number.isFinite(percentage) ? percentage : "");
		statBtn.setAttribute("data-remaining", tasksRemaining);
		statBtn.setAttribute("data-total", taskCounter);
	}

	function setStatLine(id, icon, label, value, tone) {
		var node = rootNode.querySelector(id) || (popupRoot ? popupRoot.querySelector(id) : null);
		if (!node) { return; }
		if (ui && typeof ui.renderStatisticLine === "function") {
			ui.renderStatisticLine(node, { icon: icon, label: label, value: value, tone: tone });
		} else {
			node.classList.remove("tone-success", "tone-primary", "tone-warning", "tone-info", "tone-muted");
			node.classList.add("statLine");
			if (tone) { node.classList.add(tone); }
			node.innerHTML = "<span class='metricLabel'><span class='metricIcon'>" + icon + "</span><span class='metricText'>" + label + "</span></span><span class='metricValue'>" + value + "</span>";
		}
	}

	setStatLine("#statisticDone", "✅", "完成", doneCounter + "/" + taskCounter, "tone-success");
	setStatLine("#statisticDue", "📅", "待办", String(dueCounter), "tone-primary");
	setStatLine("#statisticOverdue", "⏱️", "逾期", String(overdueCounter), "tone-warning");
	setStatLine("#statisticStart", "🛫", "开始", String(startCounter), "tone-info");
	setStatLine("#statisticScheduled", "⏳", "计划", String(scheduledCounter), "tone-info");
	setStatLine("#statisticRecurrence", "🔁", "循环", String(recurrenceCounter), "tone-primary");
	setStatLine("#statisticDailyNote", "📄", "日记项", String(dailyNoteCounter), "tone-muted");
};

function cleanupTasksCalendarRuntime() {
	rootNode._noriaPlannerSizingObserver?.disconnect();
	rootNode._noriaPlannerSizingObserver = null;
	rootNode._noriaPlannerSizingGrid = null;
	try { rootNode.querySelectorAll(".tc-hours-popover").forEach(function (p) { p.hidePopover(); }); } catch (_) {}
	if (tcRuntimeDisposed) { return; }
	tcRuntimeDisposed = true;
	if(calendarDragCancel)calendarDragCancel();
	if(calendarUndoClose)calendarUndoClose();
	tcStartupRecoverStopped = true;
	clearStartupTaskRecoveryTimers();
	clearFreshTaskInvalidationEvent();
	clearTasksCalendarWakeHydration();

	try {
		if (tcVisibleIo) { tcVisibleIo.disconnect(); }
		tcVisibleIo = null;
	} catch (_) {}
	try {
		if (tcCellMo) { tcCellMo.disconnect(); }
		tcCellMo = null;
		tcCellMoBound = false;
	} catch (_) {}
	try {
		if (tcMonthLayoutRo) { tcMonthLayoutRo.disconnect(); }
		tcMonthLayoutRo = null;
		tcMonthLayoutRoGrid = null;
		tcMonthLayoutRoTargets.clear();
	} catch (_) {}

	if (tcVisibleIoExpiryTimer) {
		try { clearTimeout(tcVisibleIoExpiryTimer); } catch (_) {}
		tcVisibleIoExpiryTimer = null;
	}
	if (tcMoDebounceTimer) {
		try { clearTimeout(tcMoDebounceTimer); } catch (_) {}
		tcMoDebounceTimer = null;
	}
	if (tcMonthLayoutRoTimer) {
		try { clearTimeout(tcMonthLayoutRoTimer); } catch (_) {}
		tcMonthLayoutRoTimer = null;
	}
	if (tcSoftRefreshTimer) {
		try { clearTimeout(tcSoftRefreshTimer); } catch (_) {}
		tcSoftRefreshTimer = null;
	}
	if (tcMutationReconcileTimer) {
		try { clearTimeout(tcMutationReconcileTimer); } catch (_) {}
		tcMutationReconcileTimer = null;
	}
	tcMutationTxSeq += 1;
	tcFlushPlannerLabControlsSave();

	try { unbindPlannerChromeNowNeedleListeners(); } catch (_) {}
	if (rootNode && rootNode._noriaNowNeedleTimer) {
		try { clearInterval(rootNode._noriaNowNeedleTimer); } catch (_) {}
		rootNode._noriaNowNeedleTimer = null;
	}
	if (weekLanesFinalizeRaf != null) {
		try { cancelAnimationFrame(weekLanesFinalizeRaf); } catch (_) {}
		weekLanesFinalizeRaf = null;
	}
	if (overlapRelayoutRaf != null) {
		try { cancelAnimationFrame(overlapRelayoutRaf); } catch (_) {}
		overlapRelayoutRaf = null;
	}
	if (monthCompactTimeSyncRaf != null) {
		try { cancelAnimationFrame(monthCompactTimeSyncRaf); } catch (_) {}
		monthCompactTimeSyncRaf = null;
	}

	if (rootNode) {
		for (var rafKey of ["_noriaPlannerWaitingPostReflowRaf", "_noriaPlannerWaitingPostReflowInnerRaf", "_noriaPlannerStableReflowRaf"]) {
			if (rootNode[rafKey] == null) { continue; }
			try { cancelAnimationFrame(rootNode[rafKey]); } catch (_) {}
			rootNode[rafKey] = null;
		}
		if (rootNode._noriaWaitingRebuildAfterScrollTimer) {
			try { clearTimeout(rootNode._noriaWaitingRebuildAfterScrollTimer); } catch (_) {}
			rootNode._noriaWaitingRebuildAfterScrollTimer = null;
		}
		try {
			rootNode.querySelectorAll(".tc-planner-waiting-strip").forEach(function (strip) {
				if (!strip._noriaWaitingUserScrollTimer) { return; }
				try { clearTimeout(strip._noriaWaitingUserScrollTimer); } catch (_) {}
				strip._noriaWaitingUserScrollTimer = null;
			});
		} catch (_) {}
		try {
			if (typeof rootNode._noriaStatDismissCleanup === "function") rootNode._noriaStatDismissCleanup();
		} catch (_) {}
		try {
			var statPopup = rootNode._noriaStatPopupEl;
			if (statPopup && typeof statPopup.remove === "function") statPopup.remove();
			rootNode._noriaStatPopupEl = null;
		} catch (_) {}
		try {
			var toolbarPopup = rootNode._noriaTimelineToolbarMorePopEl;
			if (toolbarPopup && typeof toolbarPopup.remove === "function") toolbarPopup.remove();
			rootNode._noriaTimelineToolbarMorePopEl = null;
		} catch (_) {}
		try { closeTimelineQuickPopoverForRoot(rootNode); } catch (_) {}
		try { rootNode.removeAttribute("data-tc-visible-io"); } catch (_) {}
		try {
			if (rootNode.__noriaTasksCalendarCleanup === cleanupTasksCalendarRuntime) {
				delete rootNode.__noriaTasksCalendarCleanup;
			}
		} catch (_) {}
	}

	tcRefreshDeferredByInteraction = false;
	tcHydrationDeferredByInteraction = false;
	tcDeferredHydrationGrid = null;
	overlapRelayoutAll = false;
	overlapRelayoutLaneSet = new Set();
}

function removeExistingView() {
	rootNode.querySelectorAll(".tc-hours-popover").forEach(function (pop) { pop.hidePopover(); });
	try { rootNode.querySelectorAll(".wrappers > .wrapper").forEach(captureMonthWeekScroll); } catch (_) {}
	try {
		if (tcVisibleIo) { tcVisibleIo.disconnect(); }
		tcVisibleIo = null;
	} catch (_) {}
	try {
		if (tcCellMo) { tcCellMo.disconnect(); }
		tcCellMo = null;
		tcCellMoBound = false;
	} catch (_) {}
	try {
		if (tcMoDebounceTimer) { clearTimeout(tcMoDebounceTimer); }
		tcMoDebounceTimer = null;
	} catch (_) {}
	try {
		closeTimelineToolbarMorePopoverForRoot(rootNode);
	} catch (_) {}
	try {
		undockEisenGranularity();
	} catch (_) {}
	// rootNode 自身携带 id=tasksCalendar{tid}，不可用「#该id .grid」从自身向下搜（#id 不会匹配祖先自身），否则 .grid/.list 永远不会被移除，导致多层空网格叠在真实内容之上。
	rootNode.querySelectorAll(":scope > .grid").forEach((n) => n.remove());
	rootNode.querySelectorAll(":scope > .list").forEach((n) => n.remove());
};

function mountHtmlContainer(className, html, attrs) {
	var host = rootNode;
	var container = null;
	var opts = { cls: String(className || "").trim() };
	if (attrs && typeof attrs === "object") {
		opts.attr = {};
		Object.keys(attrs).forEach((k) => {
			if (attrs[k] !== undefined && attrs[k] !== null) opts.attr[k] = String(attrs[k]);
		});
	}
	if (typeof ctx !== "undefined" && ctx && typeof ctx.el === "function") {
		try {
			container = ctx.el("div", "", opts);
		} catch (_) {
			container = null;
		}
	}
	if (!container) {
		container = getTasksCalendarDocument().createElement("div");
	container.className = className || "";
	if (attrs && typeof attrs === "object") {
		Object.keys(attrs).forEach((k) => {
			if (attrs[k] !== undefined && attrs[k] !== null) {
				container.setAttribute(k, String(attrs[k]));
			}
		});
		}
	}
	container.innerHTML = String(html || "");
	host.appendChild(container);
	return container;
}

function unwrapGridSpanChildren(gridEl) {
	if (!gridEl || !gridEl.children) { return; }
	var spans = Array.from(gridEl.children).filter((el) => el && el.tagName == "SPAN");
	spans.forEach((sp) => {
		while (sp.firstChild) {
			gridEl.insertBefore(sp.firstChild, sp);
		}
		sp.remove();
	});
}

var monthCompactTimeSyncRaf = null;
function syncMonthCompactTimeVisibility() {
	if (!rootNode || !rootNode.getAttribute || rootNode.getAttribute("view") !== "month") { return; }
	var itemEls = [];
	try {
		itemEls = rootNode.querySelectorAll(
			".cellContent > .tc-cal-item--month-compact, " +
			".cellContent > .tc-cal-item:not([data-tc-month-span='1']), " +
			".cellContent > [data-tc-cal-item='1']:not([data-tc-month-span='1'])"
		);
	} catch (_) {
		itemEls = [];
	}
	itemEls.forEach((itemEl) => {
		if (!itemEl || !itemEl.querySelector) { return; }
		var timeEl = itemEl.querySelector(".tc-month-time");
		if (!timeEl) { return; }
		var spanVal = String(itemEl.getAttribute("data-tc-month-span") || "");
		if (spanVal === "1") {
			itemEl.setAttribute("data-month-time-mode", "hidden");
			return;
		}
		var titleEl = itemEl.querySelector(".internal-link, .description");
		var innerEl = itemEl.querySelector(".inner") || itemEl;
		if (!titleEl || !innerEl) {
			itemEl.setAttribute("data-month-time-mode", "hidden");
			return;
		}
		itemEl.setAttribute("data-month-time-mode", "hidden");
		var titleFits = false;
		try {
			var sw = titleEl.scrollWidth || 0;
			var cw = titleEl.clientWidth || 0;
			titleFits = sw > 0 && cw > 0 && sw <= (cw + 1);
		} catch (_) {}
		if (!titleFits) { return; }
		var usableWidth = 0;
		try {
			usableWidth = innerEl.getBoundingClientRect ? (innerEl.getBoundingClientRect().width || 0) : 0;
		} catch (_) {}
		if (!usableWidth) { usableWidth = innerEl.clientWidth || itemEl.clientWidth || 0; }
		var mode = "hidden";
		if (usableWidth >= 248) {
			mode = "inline";
		} else if (usableWidth >= 186) {
			mode = "next-line";
		}
		itemEl.setAttribute("data-month-time-mode", mode);
	});
}
function scheduleMonthCompactTimeSync() {
	if (monthCompactTimeSyncRaf) {
		try { cancelAnimationFrame(monthCompactTimeSyncRaf); } catch (_) {}
		monthCompactTimeSyncRaf = null;
	}
	monthCompactTimeSyncRaf = requestAnimationFrame(function () {
		monthCompactTimeSyncRaf = null;
		try { syncMonthCompactTimeVisibility(); } catch (_) {}
		setTimeout(function () {
			try { syncMonthCompactTimeVisibility(); } catch (_) {}
		}, 80);
	});
}

function getMonth(tasks, month) {
	removeExistingView();
	resetWeekInteractionState();
	setStatisticPopupOpenState(false);
	rootNode.querySelector(".statisticPopup")?.classList.remove("active");
	rootNode.setAttribute("view", "month");
	setTaskStoreView("month", moment(month).format("YYYY-MM-DD"));
	var currentTitle = taskCalendarDateHeading(month,'month');
	rootNode.querySelector("button.current").innerHTML = wrapToolbarPeriodLabelHtml(currentTitle);
	var gridContent = "";
	var rangeOpenTasks = new Map(), rangeCompletedTasks = new Map();
	var monthStart = moment(month).clone().startOf("month");
	var fdRaw = parseInt(String(firstDayOfWeek), 10);
	var fd = Number.isFinite(fdRaw) && fdRaw >= 0 && fdRaw <= 6 ? fdRaw : 0;
	var offset = (monthStart.day() - fd + 7) % 7;
	var starts = -offset;
	var dim = monthStart.daysInMonth();
	var numWeeks = Math.ceil((offset + dim) / 7);
	if (numWeeks < 1) { numWeeks = 1; }

	// Set Grid Heads（与首行格子同一周：starts … starts+6）
	var gridHeads = "";
	for (let j = 0; j < 7; j++) {
		var h = starts + j;
		var weekDayNr = moment(month).add(h, "days").format("d");
		var weekDayName = moment(month).add(h, "days").format("ddd");
		if ( tDay == weekDayNr && tMonth == moment(month).format("M") && tYear == moment(month).format("YYYY") ) {
			gridHeads += "<div class='gridHead today' data-weekday='" + weekDayNr + "'>" + weekDayName + "</div>";
		} else {
			gridHeads += "<div class='gridHead' data-weekday='" + weekDayNr + "'>" + weekDayName + "</div>";
		};
	};

	// Set Wrappers（按当月实际占用周数，避免固定 6 行）
	var wrappers = "";
	for (let w=1; w<=numWeeks; w++) {
		var wrapper = "";
		var weekNr = "";
		var yearNr = "";
		var monthName = moment(month).format("MMM").replace(".","").substring(0,3);
		var rowStart = starts + (w - 1) * 7;
		for (let i=rowStart;i<rowStart+7;i++) {
			if (i==rowStart) {
				weekNr = moment(month).add(i, "days").format("w");
				yearNr = moment(month).add(i, "days").format("YYYY");
			};
			var currentDate = moment(month).add(i, "days").format("YYYY-MM-DD");
			var dailyNotePath = buildDailyNotePath(currentDate);
			var weekDay = moment(month).add(i, "days").format("d");
			var shortDayName = moment(month).add(i, "days").format("D");
			var longDayName = moment(month).add(i, "days").format("D. MMM");
			var shortWeekday = moment(month).add(i, "days").format("ddd");

			// Filter Tasks
			getTasksViaAdapter(currentDate);

			// Count Events Only From Selected Month
			if (moment(month).format("MM") == moment(month).add(i, "days").format("MM")) {
				collectCalendarRangeTasks(rangeOpenTasks, rangeCompletedTasks, currentDate);
			};

			// Set Cell Name And Weekday（任务由 hydrateGridTaskCells DOM 注入）
			if ( moment(month).add(i, "days").format("D") == 1 ) {
				var cell = cellTemplate.replace("{{date}}", currentDate).replace("{{cellName}}", longDayName).replace("{{weekday}}", weekDay).replaceAll("{{dailyNote}}", dailyNotePath);
				cell = cell.replace("{{class}}", "{{class}} newMonth");
			} else {
				var cell = cellTemplate.replace("{{date}}", currentDate).replace("{{cellName}}", shortDayName).replace("{{weekday}}", weekDay).replaceAll("{{dailyNote}}", dailyNotePath);
			};

			// Set prevMonth, currentMonth, nextMonth（按日历日期判断，避免用网格索引 i 与「当月天数」比较出错）
			var cellDay = moment(currentDate, "YYYY-MM-DD", true);
			var viewMonthStart = moment(month).startOf("month");
			if (!cellDay.isValid()) {
				cell = cell.replace("{{class}}", "currentMonth");
			} else if (cellDay.isBefore(viewMonthStart, "day")) {
				cell = cell.replace("{{class}}", "prevMonth");
			} else if (cellDay.isSame(viewMonthStart, "month")) {
				cell = cell.replace("{{class}}", tToday === currentDate ? "currentMonth today" : "currentMonth");
			} else {
				cell = cell.replace("{{class}}", "nextMonth");
			}
			wrapper += cell;
		};
		wrappers += "<div class='wrapper'><div class='wrapperButton' data-week='"+weekNr+"' data-year='"+yearNr+"'>W"+weekNr+"</div>"+wrapper+"</div>";
	};
	gridContent += "<div class='gridHeads'><div class='gridHead gridWeekHead' aria-hidden='true'></div>"+gridHeads+"</div>";
	gridContent += "<div class='wrappers' data-month='"+monthName+"'>"+wrappers+"</div>";
	var monthGrid = mountHtmlContainer("grid", gridContent);
	unwrapGridSpanChildren(monthGrid);
	prepareMonthWeekScroll(monthGrid);
	scheduleGridHydration(monthGrid);
	scheduleMonthCompactTimeSync();
	setTimeout(function () { try { scheduleMonthCompactTimeSync(); } catch (_) {} }, 240);
	setTimeout(function () { try { scheduleMonthCompactTimeSync(); } catch (_) {} }, 620);
	setWrapperEvents();
	setStatisticValuesFromRangeStats(createTaskCalendarRangeStats(rangeOpenTasks, rangeCompletedTasks));
	setQuickTimelinePanel();
	paintEisenhowerGranularityUI();
	scheduleMonthTaskDragBind();
	syncPlannerChromeDayBucketChrome();
	syncToolbarNavChevronTitles();
};

function getWeek(tasks, week) {
	removeExistingView();
	resetWeekInteractionState();
	setStatisticPopupOpenState(false);
	rootNode.querySelector(".statisticPopup")?.classList.remove("active");
	rootNode.setAttribute("view", "week");
	if (tcFeatureFlags && tcFeatureFlags.storeWeek) {
		try { rootNode.classList.add("planner-chrome"); } catch (_) {}
	}
	setTaskStoreView("week", moment(week).format("YYYY-MM-DD"));
	applyWeekCurrentTitle(week);
	var gridContent = "";
	var currentWeekday = moment(week).format("d");
	var weekNr = moment(week).format("[W]w");
	var rangeOpenTasks = new Map(), rangeCompletedTasks = new Map();

	for (let i=0-currentWeekday+parseInt(firstDayOfWeek);i<7-currentWeekday+parseInt(firstDayOfWeek);i++) {
		var currentDate = moment(week).add(i, "days").format("YYYY-MM-DD");
		var dailyNotePath = buildDailyNotePath(currentDate);
		var weekDay = moment(week).add(i, "days").format("d");
		var dayName = moment(currentDate).format("ddd D.");
		var longDayName = moment(currentDate).format("ddd, D. MMM");

		// Filter Tasks
		getTasksViaAdapter(currentDate);

		// Count Events From Selected Week
		collectCalendarRangeTasks(rangeOpenTasks, rangeCompletedTasks, currentDate);

		// Set Cell Name And Weekday（任务由 hydrateGridTaskCells DOM 注入）
		if ( moment(week).add(i, "days").format("D") == 1 ) {
			var cell = cellTemplate.replace("{{date}}", currentDate).replace("{{cellName}}", longDayName).replace("{{weekday}}", weekDay).replaceAll("{{dailyNote}}", dailyNotePath);
		} else {
			var cell = cellTemplate.replace("{{date}}", currentDate).replace("{{cellName}}", dayName).replace("{{weekday}}", weekDay).replaceAll("{{dailyNote}}", dailyNotePath);
		};

		// Set Today, Before Today, After Today
		if (currentDate < tToday) {
			cell = cell.replace("{{class}}", "beforeToday");
		} else if (currentDate == tToday) {
			cell = cell.replace("{{class}}", "today");
		} else if (currentDate > tToday) {
			cell = cell.replace("{{class}}", "afterToday");
		};
		gridContent += cell;
	};
	var weekGrid = mountHtmlContainer("grid", gridContent, {'data-week': weekNr});
	unwrapGridSpanChildren(weekGrid);
	scheduleGridHydration(weekGrid);
	syncPlannerChromeDayBucketChrome();
	enforcePlannerChromeWeekGridLayout();
	setStatisticValuesFromRangeStats(createTaskCalendarRangeStats(rangeOpenTasks, rangeCompletedTasks));
	setQuickTimelinePanel();
	try {
		requestAnimationFrame(() => {
			if (!rootNode || rootNode.getAttribute("view") !== "week") { return; }
			applyWeekCurrentTitle(week);
			/* 周视图稳态：避免进入后额外强制 hydrate 造成二次抖动 */
			if (!rootNode.classList.contains("planner-chrome") || !tcFeatureFlags.storeWeek) {
				hydrateGridTaskCells(weekGrid);
			}
			schedulePlannerChromeStableTimelineReflow(rootNode);
		});
	} catch (_) {}
	setupPlannerChromeDragAndResize();
	bindWeekCellInlineActions();
	paintEisenhowerGranularityUI();
	syncToolbarNavChevronTitles();
};

function getDay(tasks, dayAnchor) {
	removeExistingView();
	resetWeekInteractionState();
	setStatisticPopupOpenState(false);
	rootNode.querySelector(".statisticPopup")?.classList.remove("active");
	rootNode.setAttribute("view", "day");
	if (tcFeatureFlags && tcFeatureFlags.storeWeek) {
		try { rootNode.classList.add("planner-chrome"); } catch (_) {}
	}
	var day = moment(dayAnchor || selectedDate || calendarNow()).startOf("day");
	selectedDate = day.clone();
	setTaskStoreView("day", day.format("YYYY-MM-DD"));
	applyDayCurrentTitle(day);
	var rangeOpenTasks = new Map(), rangeCompletedTasks = new Map();
	var currentDate = day.format("YYYY-MM-DD");
	var dailyNotePath = buildDailyNotePath(currentDate);
	var weekDay = day.format("d");
	var mo = day.month() + 1;
	var dnum = day.date();
	/* plannerChrome 日表格内日期条已隐藏（与顶栏重复）；非 plannerChrome 仍显示格头 */
	var cellName = rootNode.classList.contains("planner-chrome") ? "\u200b" : mo + "月" + dnum + "日";
		getTasksViaAdapter(currentDate);
	collectCalendarRangeTasks(rangeOpenTasks, rangeCompletedTasks, currentDate);
	var cell = cellTemplate
		.replace("{{date}}", currentDate)
		.replace("{{cellName}}", cellName)
		.replace("{{weekday}}", weekDay)
		.replaceAll("{{dailyNote}}", dailyNotePath);
	cell = cell.replace("{{class}}", currentDate === tToday ? "today" : "currentMonth");
	var dayGrid = mountHtmlContainer("grid", cell, {"data-day": day.format("YYYY-MM-DD")});
	unwrapGridSpanChildren(dayGrid);
	scheduleGridHydration(dayGrid);
	syncPlannerChromeDayBucketChrome();
	enforcePlannerChromeWeekGridLayout();
	setStatisticValuesFromRangeStats(createTaskCalendarRangeStats(rangeOpenTasks, rangeCompletedTasks));
	setQuickTimelinePanel();
	try {
		requestAnimationFrame(function () {
			if (!rootNode || rootNode.getAttribute("view") !== "day") { return; }
			applyDayCurrentTitle(day);
			if (!rootNode.classList.contains("planner-chrome") || !tcFeatureFlags.storeWeek) {
				hydrateGridTaskCells(dayGrid);
			}
			schedulePlannerChromeStableTimelineReflow(rootNode);
		});
	} catch (_) {}
	setupPlannerChromeDragAndResize();
	bindWeekCellInlineActions();
	paintEisenhowerGranularityUI();
	renderDayClockOverlay(dayGrid);
	syncToolbarNavChevronTitles();
}

function getList(tasks, focusDate) {
	/* 列表入口升级为四象限：减少低价值滚动，直接支持优先级决策 */
	removeExistingView();
	resetWeekInteractionState();
	setStatisticPopupOpenState(false);
	rootNode.querySelector(".statisticPopup")?.classList.remove("active");
	var focus = getEisenhowerFocusDate(focusDate);
	var rangeModel = createTaskCalendarRangeModel(focus, eisenhowerGranularity);
	selectedDate = rangeModel.anchor.clone();
	var currentTitle = rangeModel.titleHtml;
	rootNode.querySelector("button.current").innerHTML = wrapToolbarPeriodLabelHtml(currentTitle);
	var monthName = moment(selectedDate).format("MMM").replace(".","").substring(0,3);
	var completedInRange = new Map();
	var eisenDayList = rangeModel.days;
	var buckets = { q1: [], q2: [], q3: [], q4: [] };
	/* 艾森豪威尔：纵轴=重要度（🔽/priority D → 不重要），横轴=紧急度（相对今天：逾期或 due 在 N 天内 → 紧急）。与 Tasks 行内优先级 emoji 对齐。 */
	var TC_EISEN_URGENT_WITHIN_DAYS = 3;
	var todayStr = calendarNow().format("YYYY-MM-DD");
	var typRank = { overdue: 60, due: 50, process: 48, recurrence: 44, scheduled: 38, start: 32, dailyNote: 24 };
	function skipQuadrantTask(typ) {
		return typ === "done" || typ === "cancelled";
	}
	var taskQuadrantBest = new Map();
	function noteQuadrantTask(task, typ, dateStr) {
		if (skipQuadrantTask(typ)) { return; }
		task = task.calendarSource || task;
		var k = getTaskKey(task);
		var rank = typRank[typ] || 10;
		var prev = taskQuadrantBest.get(k);
		var types = prev ? prev.types : new Set();
		types.add(typ);
		if (!prev || rank > prev.rank) {
			taskQuadrantBest.set(k, { task: task, typ: typ, dateStr: dateStr, rank: rank, types: types });
		}
	}
	function taskIsLowPriorityForEisen(t) {
		var priority = String((t && t.priority) || "normal").trim().toLowerCase();
		return priority === "d" || priority === "4" || priority === "low" || priority === "lowest";
	}
	function classifyEisenhowerBucket(entry) {
		var task = entry.task;
		var manualBucket = getTaskEisenhowerBucketOverride(task);
		if (manualBucket) { return manualBucket; }
		/* 日程标签表示记录形式；重要程度继续由优先级和手动分区决定。 */
		var low = taskIsLowPriorityForEisen(task);
		var urgent = false;
		var dueYmd = coerceTemporalToYmd(task && task.due) || coerceTemporalToYmd(task && task.scheduled);
		if (dueYmd) {
			var dm = moment(dueYmd, "YYYY-MM-DD", true);
			var tn = moment(todayStr, "YYYY-MM-DD", true);
			if (dm.isValid() && tn.isValid()) {
				var dleft = dm.diff(tn, "days");
				if (dleft < 0 || dleft <= TC_EISEN_URGENT_WITHIN_DAYS) { urgent = true; }
			}
		}
		if (urgent && !low) { return "q1"; }
		if (!urgent && !low) { return "q2"; }
		if (urgent && low) { return "q3"; }
		return "q4";
	}
	for (let i = 0; i < eisenDayList.length; i++) {
		var currentDate = eisenDayList[i];
		getTasksViaAdapter(currentDate);
		done.forEach(function (task) { if (!task.calendarSchedule) completedInRange.set(getTaskKey(task), task); });
		overdue.forEach(t => noteQuadrantTask(t, "overdue", currentDate));
		due.forEach(t => noteQuadrantTask(t, "due", currentDate));
		process.forEach(t => noteQuadrantTask(t, "process", currentDate));
		start.forEach(t => noteQuadrantTask(t, "start", currentDate));
		scheduled.forEach(t => noteQuadrantTask(t, "scheduled", currentDate));
		recurrence.forEach(t => noteQuadrantTask(t, "recurrence", currentDate));
		dailyNote.forEach(t => noteQuadrantTask(t, "dailyNote", currentDate));
	}
	taskQuadrantBest.forEach((entry) => {
		var b = classifyEisenhowerBucket(entry);
		buckets[b].push({ task: entry.task, typ: entry.typ, dateStr: entry.dateStr, types: entry.types });
	});
	/* 象限图标：Q1 爆发 · Q2 罗盘/方向 · Q3 多人委派 · Q4 收纳盒 */
	var gQ1 = "<span class='qGlyph' aria-hidden='true'><svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M13 2L3 14h8l-1 8 10-12h-8l1-8z'/></svg></span>";
	var gQ2 = "<span class='qGlyph' aria-hidden='true'><svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10'/><polygon points='16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76'/></svg></span>";
	var gQ3 = "<span class='qGlyph' aria-hidden='true'><svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2'/><circle cx='9' cy='7' r='4'/><path d='M23 21v-2a4 4 0 0 0-3-3.87'/><path d='M16 3.13a4 4 0 0 1 0 7.75'/></svg></span>";
	var gQ4 = "<span class='qGlyph' aria-hidden='true'><svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M21 8v13H3V8'/><path d='M1 3h22v5H1z'/><path d='M10 12h4'/></svg></span>";
	var eisenRegionAria = tcRuntimeT("runtime.tasksCalendar.eisenhower.regionAria");
	var q2Title = tcRuntimeT("runtime.tasksCalendar.eisenhower.q2Title");
	var q2Hint = tcRuntimeT("runtime.tasksCalendar.eisenhower.q2Hint");
	var q2Aria = tcRuntimeT("runtime.tasksCalendar.eisenhower.q2Aria");
	var q1Title = tcRuntimeT("runtime.tasksCalendar.eisenhower.q1Title");
	var q1Hint = tcRuntimeT("runtime.tasksCalendar.eisenhower.q1Hint");
	var q1Aria = tcRuntimeT("runtime.tasksCalendar.eisenhower.q1Aria");
	var q4Title = tcRuntimeT("runtime.tasksCalendar.eisenhower.q4Title");
	var q4Hint = tcRuntimeT("runtime.tasksCalendar.eisenhower.q4Hint");
	var q4Aria = tcRuntimeT("runtime.tasksCalendar.eisenhower.q4Aria");
	var q3Title = tcRuntimeT("runtime.tasksCalendar.eisenhower.q3Title");
	var q3Hint = tcRuntimeT("runtime.tasksCalendar.eisenhower.q3Hint");
	var q3Aria = tcRuntimeT("runtime.tasksCalendar.eisenhower.q3Aria");
	var qHtml = "";
	qHtml += "<div class='eisenhowerMatrix' role='region' aria-label='" + eisenRegionAria + "'>";
	qHtml += "<div class='eisenMatrixShell'>";
	/* 标准象限：左上 Q2、右上 Q1、左下 Q4、右下 Q3 */
	qHtml += "<div class='quadrantGrid tc-matrix'>";
	qHtml += "<section class='quadrant q2' aria-label='" + q2Aria + "'><header title=\"" + escapeHtmlAttr(q2Hint) + "\">" + gQ2 + "<div class='qHeadingRow'><span class='qTitle'>" + q2Title + "</span><span class='qCount'>" + buckets.q2.length + "</span></div></header><div class='qContent' data-q='q2'></div></section>";
	qHtml += "<section class='quadrant q1' aria-label='" + q1Aria + "'><header title=\"" + escapeHtmlAttr(q1Hint) + "\">" + gQ1 + "<div class='qHeadingRow'><span class='qTitle'>" + q1Title + "</span><span class='qCount'>" + buckets.q1.length + "</span></div></header><div class='qContent' data-q='q1'></div></section>";
	qHtml += "<section class='quadrant q4' aria-label='" + q4Aria + "'><header title=\"" + escapeHtmlAttr(q4Hint) + "\">" + gQ4 + "<div class='qHeadingRow'><span class='qTitle'>" + q4Title + "</span><span class='qCount'>" + buckets.q4.length + "</span></div></header><div class='qContent' data-q='q4'></div></section>";
	qHtml += "<section class='quadrant q3' aria-label='" + q3Aria + "'><header title=\"" + escapeHtmlAttr(q3Hint) + "\">" + gQ3 + "<div class='qHeadingRow'><span class='qTitle'>" + q3Title + "</span><span class='qCount'>" + buckets.q3.length + "</span></div></header><div class='qContent' data-q='q3'></div></section>";
	qHtml += "</div>";
	qHtml += "</div></div>";
	var listNode = mountHtmlContainer("list tc-quadrant-view", qHtml, {"data-month": monthName, "data-eisen": eisenhowerGranularity});
	var eisenDragTaskEl = null;
	var eisenDragSourceBucket = "";
	function clearEisenhowerDropState() {
		try {
			listNode.querySelectorAll(".qContent.is-drop-target").forEach(function (host) {
				host.classList.remove("is-drop-target");
			});
			if (eisenDragTaskEl) eisenDragTaskEl.classList.remove("is-dragging");
		} catch (_) {}
		eisenDragTaskEl = null;
		eisenDragSourceBucket = "";
	}

	function moveEisenhowerTaskOptimistically(taskEl, targetHost, targetBucket) {
		if (!taskEl || !targetHost) return null;
		var sourceHost = taskEl.parentElement;
		var snapshot = {
			taskEl: taskEl,
			sourceHost: sourceHost,
			targetHost: targetHost,
			nextSibling: taskEl.nextSibling,
			previousBucket: taskEl.getAttribute("data-eisen-bucket") || ""
		};
		targetHost.querySelectorAll(".qEmpty").forEach(function (node) { node.remove(); });
		targetHost.appendChild(taskEl);
		taskEl.setAttribute("data-eisen-bucket", targetBucket);
		taskEl.classList.add("is-saving");
		syncQuadrantFocusCounts();
		return snapshot;
	}
	function restoreEisenhowerTaskOptimistically(snapshot) {
		if (!snapshot || !snapshot.taskEl || !snapshot.sourceHost) return;
		var taskEl = snapshot.taskEl;
		var sourceHost = snapshot.sourceHost;
		sourceHost.querySelectorAll(".qEmpty").forEach(function (node) { node.remove(); });
		if (snapshot.nextSibling && snapshot.nextSibling.parentElement === sourceHost) {
			sourceHost.insertBefore(taskEl, snapshot.nextSibling);
		} else {
			sourceHost.appendChild(taskEl);
		}
		taskEl.setAttribute("data-eisen-bucket", snapshot.previousBucket);
		taskEl.classList.remove("is-saving");
		syncQuadrantFocusCounts();
	}
	function bindEisenhowerDropTarget(host, targetBucket) {
		host.addEventListener("dragenter", function (event) {
			if (!eisenDragTaskEl || targetBucket === eisenDragSourceBucket) return;
			event.preventDefault();
			host.classList.add("is-drop-target");
		});
		host.addEventListener("dragover", function (event) {
			if (!eisenDragTaskEl || targetBucket === eisenDragSourceBucket) return;
			event.preventDefault();
			if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
		});
		host.addEventListener("dragleave", function (event) {
			if (!host.contains(event.relatedTarget)) host.classList.remove("is-drop-target");
		});
		host.addEventListener("drop", async function (event) {
			event.preventDefault();
			var taskEl = eisenDragTaskEl;
			if (!taskEl || targetBucket === eisenDragSourceBucket) {
				clearEisenhowerDropState();
				return;
			}
			var optimisticMove = moveEisenhowerTaskOptimistically(taskEl, host, targetBucket);
			try {
				await saveTaskEisenhowerBucket(taskEl, targetBucket);
				taskEl.classList.remove("is-saving");
				clearEisenhowerDropState();
			} catch (error) {
				restoreEisenhowerTaskOptimistically(optimisticMove);
				clearEisenhowerDropState();
				showDebugNotice(tcRuntimeT("runtime.tasksCalendar.notice.saveFailed", {
					message: error && error.message ? error.message : error
				}));
			}
		});
	}
	function fillBucket(q, maxCount) {
		var host = listNode.querySelector(".qContent[data-q='" + q + "']");
		if (!host) return;
		bindEisenhowerDropTarget(host, q);
		var items = buckets[q];
		items.sort((a, b) => {
			var da = coerceTemporalToYmd(a.task && a.task.due) || "9999-12-31";
			var db = coerceTemporalToYmd(b.task && b.task.due) || "9999-12-31";
			if (da !== db) { return da.localeCompare(db); }
			var byDate = String(a.dateStr).localeCompare(String(b.dateStr));
			if (byDate) { return byDate; }
			var ap = String((a.task && a.task.priority) || "C").toUpperCase();
			var bp = String((b.task && b.task.priority) || "C").toUpperCase();
			if (ap !== bp) { return ap < bp ? -1 : 1; }
			var at = String((a.task && a.task.text) || "").toUpperCase();
			var bt = String((b.task && b.task.text) || "").toUpperCase();
			if (at !== bt) { return at < bt ? -1 : 1; }
			var al = getTaskSourceLine(a.task);
			var bl = getTaskSourceLine(b.task);
			if (al !== bl) { return al - bl; }
			return String(getTaskKey(a.task)).localeCompare(String(getTaskKey(b.task)));
		});
		for (var i = 0; i < Math.min(items.length, maxCount || 120); i++) {
			let node = buildTaskElement(items[i].task, items[i].typ, items[i].dateStr, listNode.ownerDocument, { eisenContentOnly: true });
			if (!node) continue;
			node.classList.add("qTask", "tc-cal-item--eisen-content");
			node.setAttribute("data-tc-kinds", Array.from(items[i].types).join(" "));
			node.draggable = true;
			node.setAttribute("data-eisen-bucket", q);
			node.addEventListener("dragstart", function (event) {
				eisenDragTaskEl = node;
				eisenDragSourceBucket = node.getAttribute("data-eisen-bucket");
				node.classList.add("is-dragging");
				if (event.dataTransfer) {
					event.dataTransfer.effectAllowed = "move";
					event.dataTransfer.setData("text/plain", getTaskIdentityKey(node));
				}
			});
			node.addEventListener("dragend", clearEisenhowerDropState);
			try {
				var reason = q === "q1"
					? tcRuntimeT("runtime.tasksCalendar.eisenhower.q1Reason")
					: (q === "q2"
						? tcRuntimeT("runtime.tasksCalendar.eisenhower.q2Reason")
						: (q === "q3" ? tcRuntimeT("runtime.tasksCalendar.eisenhower.q3Reason") : tcRuntimeT("runtime.tasksCalendar.eisenhower.q4Reason")));
				node.setAttribute("data-eisen-reason", reason);
				node.setAttribute("aria-label", reason + "：" + (node.getAttribute("data-full-text") || node.textContent || ""));
				node.title = (node.title || "").trim() ? ((node.title || "").trim() + " · " + reason) : reason;
			} catch (_) {}
			host.appendChild(node);
		}
		if (!host.children.length) {
			var emptyDoc = (typeof getTasksCalendarDocument === "function" && getTasksCalendarDocument()) || (typeof document !== "undefined" ? document : null);
			if (emptyDoc && typeof emptyDoc.createElement === "function") {
				var emptyNode = emptyDoc.createElement("div");
				emptyNode.className = "qEmpty";
				emptyNode.textContent = tcRuntimeT("runtime.tasksCalendar.eisenhower.empty");
				host.appendChild(emptyNode);
			}
		}
	}
	fillBucket("q1", 180);
	fillBucket("q2", 180);
	fillBucket("q3", 120);
	fillBucket("q4", 120);
	dockEisenGranularityToolbar();
	setStatisticValuesFromRangeStats(createTaskCalendarRangeStats(taskQuadrantBest, completedInRange));
	rootNode.setAttribute("view", "list");
	syncQuadrantFocusCounts();
	setTaskStoreView("list", moment(selectedDate).format("YYYY-MM-DD"));
	setQuickTimelinePanel();
	paintEisenhowerGranularityUI();
	syncPlannerChromeDayBucketChrome();
	syncToolbarNavChevronTitles();
};
