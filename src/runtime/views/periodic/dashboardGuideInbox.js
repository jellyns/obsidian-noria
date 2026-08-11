const host = (input && input.mount) ? input.mount : this.container;
const bridge = input?.noriaBridge || globalThis.__noriaRuntimeBridge || {};
const inboxT = (key, params = {}) => {
  try {
    if (bridge && typeof bridge.t === "function") {
      const direct = bridge.t(key, params);
      if (direct && direct !== key) return String(direct);
    }
  } catch (_) {}
  try {
    const raw = bridge.i18n?.messages?.[key] || bridge.i18n?.fallback?.[key] || key;
    return String(raw).replace(/\{([^}]+)\}/g, (_, name) => params[name] == null ? "" : String(params[name]));
  } catch (_) {
    return String(key || "");
  }
};

const normPath = (p) => String(p || "").replace(/\\/g, "/").replace(/^\/+/, "");
const normalizeId = (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
const textList = (value) => Array.isArray(value) ? value.map(String).filter(Boolean) : [];
const objectList = (value) => Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];
const inboxRoot = normPath(bridge.paths?.inboxRoot || "00_Inbox").replace(/\/+$/, "");
const workflow = bridge.inboxWorkflow && typeof bridge.inboxWorkflow === "object" ? bridge.inboxWorkflow : {};
const statuses = objectList(workflow.statuses).filter((item) => item.id);
const statusById = new Map(statuses.map((item) => [String(item.id), item]));
const aliasToId = new Map();
statuses.forEach((status) => {
  const id = String(status.id || "");
  aliasToId.set(normalizeId(id), id);
  textList(status.aliases).forEach((alias) => {
    aliasToId.set(String(alias || "").trim(), id);
    const aliasNorm = normalizeId(alias);
    if (aliasNorm) aliasToId.set(aliasNorm, id);
  });
});
const homeViews = objectList(workflow.homeViews)
  .map((item, index) => item && typeof item === "object" ? { ...item, order: Number.isFinite(Number(item.order)) ? Number(item.order) : (index + 1) * 10 } : null)
  .filter((item) => item && item.showOnHome !== false)
  .sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.id || "").localeCompare(String(b.id || "")));
const toDateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayKey = toDateStr(new Date());
const scalar = (value) => {
  if (value == null) return "";
  if (Array.isArray(value)) return value.filter(Boolean).map(String).join(", ");
  if (typeof value === "object" && value.path) return String(value.path || "");
  return String(value || "").trim();
};
const parseDate = (value) => {
  const m = String(value || "").match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : "";
};

function resolveStatusId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const normalized = normalizeId(raw);
  return aliasToId.get(raw) || (normalized ? aliasToId.get(normalized) : "") || raw;
}

function paintInboxGlyph(el) {
  const fn = globalThis.dashboardCore?.utils?.applyLucideIcon;
  if (typeof fn === "function") {
    fn(el, "inbox");
    return;
  }
  el.textContent = "I";
}

async function openPath(path) {
  const p = normPath(path);
  const file = app?.vault?.getAbstractFileByPath?.(p);
  if (file && app?.workspace?.getLeaf) {
    await app.workspace.getLeaf(false).openFile(file);
    return;
  }
  if (app?.workspace?.openLinkText) await app.workspace.openLinkText(p, "", false);
}

async function readContent(path) {
  const p = normPath(path);
  try {
    const file = app?.vault?.getAbstractFileByPath?.(p);
    if (file) return String(await app.vault.cachedRead(file) || "");
  } catch (_) {}
  try {
    return String(await app.vault.adapter.read(p) || "");
  } catch (_) {
    return "";
  }
}

function hasRelated(value) {
  if (Array.isArray(value)) return value.length > 0;
  return !!scalar(value);
}

function hasSourceBlock(content) {
  const text = String(content || "");
  if (!/^##\s+Source\b/m.test(text)) return false;
  const source = (text.match(/^##\s+Source\b[\s\S]*?(?=^##\s+|$)/m) || [])[0] || "";
  return /(https?:\/\/|\[\[[^\]]+\]\]|DOI|doi|Zotero|无外部来源)/.test(source);
}

function plainInboxWikiLink(target, label = "") {
  const title = String(label || target || "")
    .split("#")[0]
    .split("|")
    .pop()
    .split("/")
    .pop()
    .replace(/\.(md|canvas)$/i, "")
    .trim();
  return title;
}

function normalizeInboxPreviewCompare(value) {
  return String(value || "")
    .replace(/\.md$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cleanInboxPreviewLine(line) {
  let text = String(line || "").trim();
  if (!text) return "";
  if (/^(\|?\s*:?-{3,}:?\s*)+\|?$/.test(text)) return "";
  if (/^[-*_]{3,}$/.test(text)) return "";
  text = text
    .replace(/^>\s*\[![^\]]+\][+-]?\s*/, "")
    .replace(/^>\s?/, "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\s*[-*+]\s+\[[ xX-]\]\s+/, "")
    .replace(/^\s*[-*+]\s+/, "")
    .replace(/^\s*\d+[.)]\s+/, "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (_m, target, label) => plainInboxWikiLink(target, label))
    .replace(/\[\[([^\]]+)\]\]/g, (_m, target) => plainInboxWikiLink(target, ""))
    .replace(/<[^>]+>/g, " ")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (/^(source|sources|来源|参考|metadata|元数据)$/i.test(text)) return "";
  return text;
}

function truncateInboxPreview(value, maxLength = 112) {
  const chars = Array.from(String(value || "").trim());
  if (chars.length <= maxLength) return chars.join("");
  return `${chars.slice(0, Math.max(0, maxLength - 3)).join("").trimEnd()}...`;
}

function extractInboxPreview(content, item = {}) {
  const body = String(content || "").replace(/^---\s*[\r\n][\s\S]*?[\r\n]---\s*(?:[\r\n]|$)/, "");
  const skipValues = new Set([
    item.name,
    item.path ? item.path.split("/").pop() : ""
  ].map(normalizeInboxPreviewCompare).filter(Boolean));
  let inFence = false;
  for (const rawLine of body.split(/\r?\n/)) {
    const trimmed = String(rawLine || "").trim();
    if (/^(```|~~~)/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const cleaned = cleanInboxPreviewLine(rawLine);
    if (!cleaned) continue;
    if (skipValues.has(normalizeInboxPreviewCompare(cleaned))) continue;
    return truncateInboxPreview(cleaned);
  }
  return "";
}

function classifyInboxItem(item) {
  const action = item.action;
  const closing = ["file", "archive", "delete"].includes(action);
  const missingCore = !action || !item.statusId || !item.shape;
  const reviewDue = !!item.review && item.review <= todayKey;
  const missingTrust = closing && action !== "delete" && (!item.next || (!item.hasSource && !item.hasRelated));
  return { reviewDue, missingCore, missingTrust };
}

function inboxNeedEntries(item) {
  const entries = [];
  if (item.flags.missingCore) entries.push({
    code: "decision",
    label: inboxT("runtime.periodic.inbox.needsDecision")
  });
  if (item.flags.missingTrust) entries.push({
    code: "evidence",
    label: inboxT("runtime.periodic.inbox.needsEvidence")
  });
  if (item.flags.reviewDue && item.review) entries.push({
    code: "review",
    label: inboxT("runtime.periodic.inbox.reviewMeta", { date: item.review })
  });
  return entries;
}

function inboxPrimaryNext(item) {
  if (item.flags.missingCore) return "decide-status";
  if (item.flags.missingTrust) return "add-evidence";
  if (item.flags.reviewDue) return "review-source";
  return "open-source";
}

function inboxPrimaryNextLabel(code) {
  const fallback = {
    "decide-status": "Fill handling decision",
    "add-evidence": "Add source or links",
    "review-source": "Review source",
    "open-source": "Open source"
  };
  const keys = {
    "decide-status": "runtime.periodic.inbox.primaryNext.decideStatus",
    "add-evidence": "runtime.periodic.inbox.primaryNext.addEvidence",
    "review-source": "runtime.periodic.inbox.primaryNext.reviewSource",
    "open-source": "runtime.periodic.inbox.primaryNext.openSource"
  };
  const key = keys[code] || keys["open-source"];
  const translated = inboxT(key);
  return translated && translated !== key ? translated : fallback[code] || fallback["open-source"];
}

function inboxCuePrefix() {
  const key = "runtime.periodic.inbox.cuePrefix";
  const text = inboxT(key);
  return text && text !== key ? text : "Suggestion";
}

function inboxRhythmLabel(id) {
  const fallback = {
    now: "Now",
    next: "Next",
    later: "Later"
  };
  const key = `runtime.periodic.inbox.rhythm.${id || "later"}`;
  const translated = inboxT(key);
  return translated && translated !== key ? translated : (fallback[id] || fallback.later);
}

function inboxRhythmProfile(item, primaryNext = "", needs = [], writeback = null) {
  const action = normalizeId(item?.action || "");
  const status = normalizeId(item?.statusId || item?.status || "");
  let id = "later";
  if (action === "defer" || status === "defer" || status === "waiting") {
    id = "later";
  } else if (Array.isArray(needs) && needs.length > 0) {
    id = "now";
  } else if (["decide-status", "add-evidence", "review-source"].includes(primaryNext)) {
    id = "now";
  } else if (writeback?.state === "ready" || ["file", "archive", "merge", "split", "refine"].includes(action)) {
    id = "next";
  }
  return { id, label: inboxRhythmLabel(id) };
}

function formatMtime(value) {
  const ds = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ds) ? ds.slice(5) : "—";
}

function displayInboxName(item) {
  const raw = String(item?.name || item?.path?.split("/").pop() || "").trim();
  return raw.replace(/\.md$/i, "") || inboxT("runtime.periodic.inbox.unnamed");
}

function inboxSortReason(item) {
  return inboxPrimaryNext(item);
}

function inboxWritebackProfile(item) {
  const capabilities = ["open-source"];
  if (!item.path) return { state: "blocked", boundary: "missing-path", capabilities: [] };
  if (!statuses.length) return { state: "source-only", boundary: "workflow-unconfigured", capabilities };
  if (!item.statusId) return { state: "blocked", boundary: "missing-status", capabilities };
  if (!statusById.has(item.statusId)) return { state: "blocked", boundary: "unknown-status", capabilities };
  if (!item.action || !item.shape) return { state: "source-only", boundary: "missing-decision", capabilities };
  if (item.flags.missingTrust) return { state: "source-only", boundary: "missing-trust", capabilities };
  if (item.flags.reviewDue) return { state: "source-only", boundary: "review-due", capabilities: [...capabilities, "review-source"] };
  if (item.action === "delete") return { state: "source-only", boundary: "confirmation-required", capabilities };
  const readyCapabilities = [...capabilities, "status-writeback"];
  if (["file", "archive"].includes(item.action)) readyCapabilities.push("move-candidate");
  return { state: "ready", boundary: "sop-ready", capabilities: readyCapabilities };
}

function inboxStructuralProfile(item, writeback = null) {
  const action = String(item?.action || "").trim().toLowerCase();
  const shape = String(item?.shape || "").trim().toLowerCase();
  const actions = [];
  const requires = ["source-position"];
  const target = String(item?.next || "").trim();
  if (action === "file") actions.push("move");
  if (action === "archive") actions.push("archive", "move");
  if (action === "delete") actions.push("delete");
  if (shape === "task" || action === "convert" || action === "convert-task") actions.push("convert-task");
  if (!actions.length) {
    return { state: "none", boundary: "none", actions: [], requires: [], target: "" };
  }
  const uniqueActions = [...new Set([...actions, "base-sync"])];
  if (action === "delete") requires.push("delete-confirmation");
  if (actions.includes("move") || actions.includes("archive")) requires.push("destination-confirmation");
  if (actions.includes("convert-task")) requires.push("task-preview");
  requires.push("base-sync");
  const boundary = actions.includes("convert-task")
    ? "task-conversion-preview"
    : action === "delete"
      ? "delete-confirmation"
      : action === "archive"
        ? "archive-confirmation"
        : "destination-confirmation";
  const writebackState = writeback?.state || inboxWritebackProfile(item).state;
  const state = writebackState === "blocked" ? "blocked" : "requires-confirmation";
  return {
    state,
    boundary,
    actions: uniqueActions,
    requires: [...new Set(requires)],
    target
  };
}

function inboxStatusLabel(statusId) {
  const status = statusById.get(String(statusId || ""));
  return String(status?.label || statusId || "").trim();
}

function inboxStatusActionText(statusId) {
  const status = inboxStatusLabel(statusId);
  const key = "runtime.periodic.inbox.statusAction";
  const translated = inboxT(key, { status });
  if (translated && translated !== key) return translated;
  return status ? `Mark ${status}` : "";
}

function firstKnownStatus(ids) {
  for (const id of textList(ids)) {
    const value = String(id || "");
    if (value && statusById.has(value)) return value;
  }
  return "";
}

function statusFromWorkflowAction(action) {
  const actionId = String(action || "");
  if (!actionId || actionId === "delete") return "";
  for (const view of homeViews) {
    const actions = new Set(textList(view.actionIds).map(String));
    if (!actions.has(actionId)) continue;
    const statusId = firstKnownStatus(view.statusIds);
    if (statusId) return statusId;
  }
  if (["refine", "split", "merge"].includes(actionId) && statusById.has("processing")) return "processing";
  if (["file", "archive"].includes(actionId) && statusById.has("ready")) return "ready";
  return "";
}

function inboxStatusWritebackTarget(item, writeback) {
  if (!item || writeback?.state !== "ready") return "";
  const nextStatus = statusFromWorkflowAction(item.action);
  if (!nextStatus || nextStatus === item.statusId) return "";
  return nextStatus;
}

function setActionState(el, state, error = "") {
  try {
    el.setAttr("data-noria-action-state", state || "idle");
    const message = String(error || "").trim();
    if (message) {
      el.setAttr("data-noria-action-error", message);
    } else if (state !== "failed") {
      if (typeof el.removeAttribute === "function") {
        el.removeAttribute("data-noria-action-error");
      } else if (el.attrs) {
        delete el.attrs["data-noria-action-error"];
      }
    }
  } catch (_) {}
}

function setActionStateMany(targets, state, error = "") {
  const list = Array.isArray(targets) ? targets : [targets];
  for (const target of list) {
    if (target) setActionState(target, state, error);
  }
}

async function runInboxSourceOpen(targets, item) {
  const path = String(item?.path || "").trim();
  setActionStateMany(targets, "pending");
  if (!path) {
    setActionStateMany(targets, "failed", "missing-path");
    return false;
  }
  try {
    await openPath(path);
    setActionStateMany(targets, "ok");
    return true;
  } catch (error) {
    const reason = String(error?.message || error || "failed");
    setActionStateMany(targets, "failed", reason);
    try { bridge.runtime?.notice?.("runtime.periodic.inbox.openSourceFailed", { reason }, 2600); } catch (_) {}
    return false;
  }
}

function renderInboxStatusAction(parent, item, writeback) {
  const nextStatus = inboxStatusWritebackTarget(item, writeback);
  const api = bridge.inbox && typeof bridge.inbox.updateStatus === "function" ? bridge.inbox : null;
  if (!nextStatus || !api) return null;
  const label = inboxStatusActionText(nextStatus);
  if (!label) return null;
  const action = parent.createEl("span", { text: label });
  action.className = "dashboard-inbox-row__status-action";
  action.setAttr("role", "button");
  action.setAttr("tabindex", "0");
  action.setAttr("data-noria-action-source", "home-inbox-status");
  action.setAttr("data-noria-action-kind", "update-inbox-status");
  action.setAttr("data-noria-action-target", item.path);
  action.setAttr("data-noria-action-state", "idle");
  action.setAttr("data-noria-inbox-status-current", item.statusId || "");
  action.setAttr("data-noria-inbox-status-next", nextStatus);
  const run = async (evt) => {
    evt?.preventDefault?.();
    evt?.stopPropagation?.();
    setActionState(action, "pending");
    try {
      const result = await api.updateStatus({
        path: item.path,
        currentStatus: item.statusId || "",
        nextStatus,
        reason: "home-inbox-status-action"
      });
      if (result && result.ok !== false) {
        item.statusId = result.status || nextStatus;
        item.status = item.statusId;
        setActionState(action, "ok");
        try { bridge.refresh?.requestRefresh?.("home", "writeback:inbox-status", { reloadViews: true }); } catch (_) {}
        return true;
      }
      const reason = result?.reason || "failed";
      setActionState(action, "failed", reason);
      try { bridge.runtime?.notice?.("runtime.periodic.inbox.statusWritebackFailed", { reason }, 2600); } catch (_) {}
      return false;
    } catch (error) {
      const reason = String(error?.message || error || "failed");
      setActionState(action, "failed", reason);
      try { bridge.runtime?.notice?.("runtime.periodic.inbox.statusWritebackFailed", { reason }, 2600); } catch (_) {}
      return false;
    }
  };
  action.onclick = run;
  action.onkeydown = (evt) => {
    if (evt?.key !== "Enter" && evt?.key !== " ") return undefined;
    return run(evt);
  };
  return action;
}

function inboxWritebackCounts(rows) {
  const counts = { ready: 0, sourceOnly: 0, blocked: 0 };
  for (const item of rows || []) {
    const state = inboxWritebackProfile(item).state;
    if (state === "ready") counts.ready += 1;
    else if (state === "blocked") counts.blocked += 1;
    else counts.sourceOnly += 1;
  }
  return counts;
}

function inboxStructuralCounts(rows) {
  const counts = { candidates: 0, blocked: 0 };
  for (const item of rows || []) {
    const profile = inboxStructuralProfile(item, inboxWritebackProfile(item));
    if (profile.state === "requires-confirmation") counts.candidates += 1;
    else if (profile.state === "blocked") counts.blocked += 1;
  }
  return counts;
}

function inboxIsWaitingItem(item) {
  const status = statusById.get(String(item?.statusId || ""));
  const aliases = textList(status?.aliases).join(" ");
  const stage = queueStage(item);
  const haystack = [
    item?.statusId,
    item?.status,
    status?.label,
    aliases,
    stage.id,
    stage.label
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  return /(^|[\s._-])(wait|waiting|defer|deferred|later|hold|on-hold)(?=$|[\s._-])/.test(haystack)
    || /暂缓|等待|搁置|稍后/.test(haystack);
}

function inboxQueueHealth(rows) {
  const health = { ready: 0, blocked: 0, waiting: 0, stale: 0, primary: null };
  for (const item of rows || []) {
    const writeback = inboxWritebackProfile(item);
    const structural = inboxStructuralProfile(item, writeback);
    const ready = writeback.state === "ready";
    if (ready) {
      health.ready += 1;
      if (!health.primary) health.primary = item;
    }
    if (writeback.state === "blocked" || structural.state === "blocked") health.blocked += 1;
    if (inboxIsWaitingItem(item)) health.waiting += 1;
    if (item?.flags?.reviewDue) health.stale += 1;
  }
  return health;
}

function inboxStructuralStateLabel(state) {
  const value = String(state || "none");
  const key = `runtime.periodic.inbox.structuralPanel.state.${value}`;
  const translated = inboxT(key);
  if (translated && translated !== key) return translated;
  const fallback = {
    "requires-confirmation": "Needs confirmation",
    blocked: "Blocked",
    none: "No action"
  };
  return fallback[value] || value;
}

function inboxStructuralActionLabel(action) {
  const value = String(action || "").trim();
  if (!value) return "";
  const key = `runtime.periodic.inbox.structuralPanel.action.${value}`;
  const translated = inboxT(key);
  if (translated && translated !== key) return translated;
  const fallback = {
    move: "Move",
    archive: "Archive",
    delete: "Delete",
    "convert-task": "Convert task",
    "base-sync": "Base sync"
  };
  return fallback[value] || value;
}

function inboxStructuralRequireLabel(requirement) {
  const value = String(requirement || "").trim();
  if (!value) return "";
  const key = `runtime.periodic.inbox.structuralPanel.require.${value}`;
  const translated = inboxT(key);
  if (translated && translated !== key) return translated;
  const fallback = {
    "source-position": "Source position",
    "destination-confirmation": "Destination",
    "delete-confirmation": "Delete confirmation",
    "task-preview": "Task preview",
    "base-sync": "Base sync"
  };
  return fallback[value] || value;
}

function inboxStructuralTargetText(target) {
  const value = String(target || "").trim();
  if (!value) {
    const key = "runtime.periodic.inbox.structuralPanel.noTarget";
    const translated = inboxT(key);
    return translated && translated !== key ? translated : "Target pending";
  }
  const key = "runtime.periodic.inbox.structuralPanel.target";
  const translated = inboxT(key, { target: value });
  return translated && translated !== key ? translated : `Target ${value}`;
}

function inboxStructuralExecutionProfile(item, profile) {
  const actions = (profile?.actions || []).map(String).filter(Boolean);
  const actionSet = new Set(actions);
  const executable = [];
  const blocked = [];
  const hasMoveApi = !!(bridge.inbox && typeof bridge.inbox.moveOut === "function");
  const hasConvertApi = !!(bridge.inbox && typeof bridge.inbox.convertToTask === "function");
  const canMove = hasMoveApi
    && item?.action === "file"
    && actionSet.has("move")
    && !actionSet.has("archive")
    && !actionSet.has("delete")
    && !actionSet.has("convert-task")
    && !!profile?.target;
  const canConvert = hasConvertApi
    && actionSet.has("convert-task")
    && !actionSet.has("archive")
    && !actionSet.has("delete")
    && !!profile?.target;
  if (canMove) executable.push("move-inbox-file");
  if (canConvert) executable.push("convert-inbox-task");
  for (const action of actions) {
    if (action === "move" && canMove) continue;
    if (action === "convert-task" && canConvert) continue;
    blocked.push(action);
  }
  let reason = "";
  if (blocked.some((action) => action === "delete" || action === "archive")) {
    reason = "destructive-action-not-implemented";
  } else if (blocked.length === 1 && blocked[0] === "base-sync") {
    reason = "base-sync-not-implemented";
  } else if (blocked.length && executable.length) {
    reason = "partial-structural-actions-not-implemented";
  } else if (blocked.length && !profile?.target && (actionSet.has("move") || actionSet.has("convert-task"))) {
    reason = "target-required";
  } else if (blocked.length) {
    reason = "structural-action-not-implemented";
  }
  return {
    executable,
    blocked: [...new Set(blocked)],
    reason
  };
}

function inboxStructuralConfirmMoveText() {
  const key = "runtime.periodic.inbox.structuralPanel.confirmMove";
  const translated = inboxT(key);
  return translated && translated !== key ? translated : "Confirm move";
}

function inboxStructuralConfirmConvertTaskText() {
  const key = "runtime.periodic.inbox.structuralPanel.confirmConvertTask";
  const translated = inboxT(key);
  return translated && translated !== key ? translated : "Confirm task";
}

function inboxVaultPathExists(path) {
  const p = normPath(path);
  if (!p) return false;
  try {
    return !!app?.vault?.getAbstractFileByPath?.(p);
  } catch (_) {
    return false;
  }
}

function bindInboxStructuralHandoff(el, path, kind, options = {}) {
  const p = normPath(path);
  const openable = options.openable !== false && !!p;
  el.setAttr("data-noria-action-source", "home-inbox-structural");
  el.setAttr("data-noria-action-kind", kind);
  el.setAttr("data-noria-action-target", p);
  el.setAttr("data-noria-action-state", openable ? "idle" : "unavailable");
  el.setAttr("data-noria-inbox-structural-handoff", options.handoff || "");
  el.setAttr("data-noria-inbox-structural-target-state", openable ? "openable" : (options.unavailableState || "missing"));
  if (!openable) return el;
  el.setAttr("role", "button");
  el.setAttr("tabindex", "0");
  const run = async (evt) => {
    evt?.preventDefault?.();
    evt?.stopPropagation?.();
    setActionState(el, "pending");
    try {
      await openPath(p);
      setActionState(el, "ok");
      return true;
    } catch (error) {
      const reason = String(error?.message || error || "failed");
      setActionState(el, "failed", reason);
      try { bridge.runtime?.notice?.("runtime.periodic.inbox.openSourceFailed", { reason }, 2600); } catch (_) {}
      return false;
    }
  };
  el.onclick = run;
  el.onkeydown = (evt) => {
    if (evt?.key !== "Enter" && evt?.key !== " ") return undefined;
    return run(evt);
  };
  return el;
}

function renderInboxStructuralHandoff(parent, label, path, kind, options = {}) {
  const p = normPath(path);
  const el = parent.createEl("span");
  el.className = "dashboard-inbox-structural-panel__handoff";
  el.setAttr("title", p || "");
  el.createEl("span", { text: label }).className = "dashboard-inbox-structural-panel__handoff-label";
  el.createEl("span", { text: p || inboxStructuralTargetText("") }).className = "dashboard-inbox-structural-panel__handoff-path";
  return bindInboxStructuralHandoff(el, p, kind, options);
}

function viewMatches(item, view) {
  if (!view) return false;
  const statusIds = new Set(textList(view.statusIds).map(String));
  const actionIds = new Set(textList(view.actionIds).map(String));
  const checks = [];
  if (statusIds.size) checks.push(statusIds.has(item.statusId));
  if (actionIds.size) checks.push(actionIds.has(item.action));
  if (view.includeMissingCore) checks.push(item.flags.missingCore);
  if (view.reviewDue) checks.push(item.flags.reviewDue);
  if (view.missingTrust) checks.push(item.flags.missingTrust);
  return checks.some(Boolean);
}

function localizedViewText(view, field = "label") {
  const key = field === "title" ? String(view?.titleKey || "").trim() : String(view?.labelKey || "").trim();
  if (key) {
    const translated = inboxT(key);
    if (translated && translated !== key) return translated;
  }
  return String(view?.[field] || view?.label || view?.id || "Inbox");
}

function queueStage(item) {
  const lane = homeViews.find((view) => viewMatches(item, view));
  if (lane) return { id: normalizeId(lane.id || lane.label) || "inbox", label: localizedViewText(lane, "label"), title: localizedViewText(lane, "title") };
  const status = statusById.get(item.statusId);
  if (status) return { id: normalizeId(status.id) || "quiet", label: String(status.label || status.id), title: String(status.label || status.id) };
  return { id: "quiet", label: inboxT("runtime.periodic.inbox.quiet"), title: inboxT("runtime.periodic.inbox.quietTitle") };
}

function appendInboxMeta(parent, text, cls = "") {
  const value = String(text || "").trim();
  if (!value) return null;
  const el = parent.createEl("span", { text: value });
  el.className = `dashboard-inbox-row__meta-item${cls ? ` ${cls}` : ""}`;
  return el;
}

function renderInboxCue(parent, primaryNext) {
  void parent;
  void primaryNext;
  return null;
}

function renderInboxRhythm(parent, rhythm) {
  if (!rhythm?.id || !rhythm?.label) return null;
  const chip = parent.createEl("span", { text: rhythm.label });
  chip.className = "dashboard-inbox-row__rhythm";
  chip.setAttr("data-noria-inbox-rhythm", rhythm.id);
  return chip;
}

function renderInboxMeta(parent, item, stage) {
  const meta = parent.createDiv();
  meta.className = "dashboard-inbox-row__meta";
  appendInboxMeta(meta, stage.label, "dashboard-inbox-row__meta-stage");
  for (const need of inboxNeedEntries(item)) {
    appendInboxMeta(meta, need.label, "dashboard-inbox-row__meta-attention dashboard-inbox-row__meta-need");
  }
  if (item.action) appendInboxMeta(meta, inboxT("runtime.periodic.inbox.actionMeta", { action: item.action }));
  if (item.shape) appendInboxMeta(meta, inboxT("runtime.periodic.inbox.shapeMeta", { shape: item.shape }));
  if (item.next) appendInboxMeta(meta, inboxT("runtime.periodic.inbox.nextMeta", { next: item.next }), "dashboard-inbox-row__meta-next");
  return meta;
}

async function buildInboxItem(p) {
  const path = normPath(p?.file?.path || "");
  const content = await readContent(path);
  const rawStatus = scalar(p?.["inbox-status"]);
  const item = {
    name: String(p?.file?.name || path.split("/").pop() || inboxT("runtime.periodic.inbox.unnamed")),
    path,
    mtime: String(p?.file?.mtime || ""),
    action: scalar(p?.["inbox-action"]),
    status: rawStatus,
    statusId: resolveStatusId(rawStatus),
    shape: scalar(p?.["inbox-shape"]),
    next: scalar(p?.["inbox-next"]),
    review: parseDate(p?.["inbox-review"]),
    hasRelated: hasRelated(p?.related),
    hasSource: hasSourceBlock(content)
  };
  item.preview = extractInboxPreview(content, item);
  item.flags = classifyInboxItem(item);
  return item;
}

async function runInboxItemBuildQueue(rows, workerCount = 6) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const results = new Array(sourceRows.length);
  const jobs = sourceRows.map((row, index) => ({ row, index }));
  const count = Math.max(1, Math.min(Number(workerCount) || 1, jobs.length || 1));
  const workers = Array.from({ length: count }, async () => {
    while (jobs.length) {
      const job = jobs.shift();
      if (!job) continue;
      results[job.index] = await buildInboxItem(job.row);
    }
  });
  await Promise.all(workers);
  return results.filter(Boolean);
}

const dvRows = bridge.runtime?.pagesForManagedPath?.("inboxRoot", ctx) || [];
const items = await runInboxItemBuildQueue(dvRows);

const activeItems = items;
const lanes = homeViews.map((lane) => ({
  ...lane,
  id: normalizeId(lane.id || lane.label) || "inbox",
  label: localizedViewText(lane, "label"),
  title: localizedViewText(lane, "title"),
  match: (x) => viewMatches(x, lane)
})).map((lane) => ({ ...lane, count: activeItems.filter(lane.match).length }));
const laneById = new Map(lanes.map((lane) => [lane.id, lane]));
let activeLaneId = "";
let activeStructuralPath = "";
let showAllInbox = false;
const renderedInboxRowsByPath = new Map();

const priorityOf = (x) => {
  const index = lanes.findIndex((lane) => lane.match(x));
  return index >= 0 ? index : lanes.length + 1;
};

function sortedInboxRows(rows) {
  return rows.slice().sort((a, b) =>
    priorityOf(a) - priorityOf(b) ||
    String(a.review || "9999-99-99").localeCompare(String(b.review || "9999-99-99")) ||
    String(a.mtime || "").localeCompare(String(b.mtime || ""))
  );
}

function filteredInboxRows() {
  const lane = activeLaneId ? laneById.get(activeLaneId) : null;
  return lane ? activeItems.filter(lane.match) : activeItems;
}

const wrap = host.createDiv();
wrap.className = "dashboard-inbox-dashboard";

const laneRow = wrap.createDiv();
laneRow.className = "dashboard-inbox-lanes";
const laneButtons = new Map();
lanes.forEach((lane) => {
  const btn = laneRow.createEl("button");
  btn.type = "button";
  btn.className = `dashboard-inbox-lane dashboard-inbox-lane--${lane.id}`;
  btn.setAttr("title", lane.title);
  btn.setAttr("aria-label", [lane.label, lane.count ? String(lane.count) : "0", lane.title].filter(Boolean).join(" · "));
  btn.setAttr("aria-pressed", "false");
  btn.setAttr("data-noria-action-source", "home-inbox-lane");
  btn.setAttr("data-noria-action-kind", "toggle-inbox-lane");
  btn.setAttr("data-noria-action-state", "idle");
  btn.setAttr("data-noria-inbox-lane-id", lane.id);
  btn.setAttr("data-noria-inbox-lane-label", lane.label);
  btn.setAttr("data-noria-inbox-lane-title", lane.title);
  btn.setAttr("data-noria-inbox-lane-count", lane.count);
  btn.onclick = (evt) => {
    evt?.preventDefault?.();
    evt?.stopPropagation?.();
    activeLaneId = activeLaneId === lane.id ? "" : lane.id;
    showAllInbox = false;
    syncLaneButtons();
    renderInboxList();
  };
  btn.createEl("span", { text: lane.label }).className = "dashboard-inbox-lane__label";
  btn.createEl("strong", { text: String(lane.count) }).className = "dashboard-inbox-lane__count";
  laneButtons.set(lane.id, btn);
});

const summaryRow = wrap.createDiv();
summaryRow.className = "dashboard-inbox-workbench-summary";

const structuralPanel = wrap.createDiv();
structuralPanel.className = "dashboard-inbox-structural-panel";
structuralPanel.setAttr("data-noria-inbox-structural-panel", "1");
structuralPanel.setAttr("hidden", "true");

const box = wrap.createDiv();
box.className = "dashboard-inbox-list";

function syncLaneButtons() {
  laneButtons.forEach((btn, id) => {
    const isActive = id === activeLaneId;
    btn.toggleClass("is-active", isActive);
    btn.setAttr("aria-pressed", isActive ? "true" : "false");
    btn.setAttr("data-noria-inbox-lane-state", isActive ? "active" : "inactive");
    btn.setAttr("data-noria-inbox-lane-active", isActive ? "true" : "false");
  });
}

function renderEmpty(text) {
  box.createDiv({ text }).style.cssText =
    "color:var(--text-muted);font-size:.86em;line-height:1.45;padding:7px 4px 9px;";
}

function appendSummaryFact(text, cls = "") {
  const value = String(text || "").trim();
  if (!value) return;
  const item = summaryRow.createEl("span", { text: value });
  item.className = `dashboard-inbox-workbench-summary__item${cls ? ` ${cls}` : ""}`;
  return item;
}

function setInboxSummaryVisibility(visible) {
  const isVisible = visible === true;
  summaryRow.setAttr("data-noria-inbox-summary-visible", isVisible ? "true" : "false");
  if (isVisible) {
    summaryRow.removeAttribute?.("hidden");
    if (summaryRow.style) summaryRow.style.display = "";
  } else {
    summaryRow.setAttr("hidden", "true");
    if (summaryRow.style) summaryRow.style.display = "none";
  }
}

function inboxOverflowActionText(expanded, hidden, limit) {
  const key = expanded ? "runtime.periodic.inbox.queueCollapse" : "runtime.periodic.inbox.queueExpand";
  const translated = inboxT(key, { hidden, limit });
  if (translated && translated !== key) return translated;
  return expanded ? `Show first ${limit}` : `Show ${hidden} more`;
}

function renderInboxOverflowAction(hidden, limit, filtered) {
  if (filtered <= limit) return null;
  const expanded = !!showAllInbox;
  const action = appendSummaryFact(
    inboxOverflowActionText(expanded, hidden, limit),
    "dashboard-inbox-workbench-summary__item--overflow-action"
  );
  if (!action) return null;
  action.setAttr("role", "button");
  action.setAttr("tabindex", "0");
  action.setAttr("data-noria-action-source", "home-inbox-overflow");
  action.setAttr("data-noria-action-kind", expanded ? "collapse-inbox-overflow" : "expand-inbox-overflow");
  action.setAttr("data-noria-action-state", "idle");
  action.setAttr("data-noria-inbox-overflow-state", expanded ? "expanded" : "collapsed");
  action.setAttr("data-noria-inbox-limit", limit);
  action.setAttr("data-noria-inbox-filtered", filtered);
  action.setAttr("data-noria-inbox-hidden", hidden);
  const run = (evt) => {
    evt?.preventDefault?.();
    evt?.stopPropagation?.();
    showAllInbox = !showAllInbox;
    renderInboxList();
    return true;
  };
  action.onclick = run;
  action.onkeydown = (evt) => {
    if (evt?.key !== "Enter" && evt?.key !== " ") return undefined;
    return run(evt);
  };
  return action;
}

function structuralStateForItem(item) {
  if (!item) return null;
  const writeback = inboxWritebackProfile(item);
  const structural = inboxStructuralProfile(item, writeback);
  return structural.state === "none" ? null : { item, structural };
}

function resolveStructuralSelection(displayItems) {
  const rows = Array.isArray(displayItems) ? displayItems : [];
  const candidates = rows.map(structuralStateForItem).filter(Boolean);
  if (!candidates.length) return null;
  const previous = candidates.find((entry) => entry.item.path && entry.item.path === activeStructuralPath);
  if (previous) return previous;
  return candidates.find((entry) => entry.structural.state === "requires-confirmation") || candidates[0];
}

function setStructuralPanelHidden(hidden) {
  if (hidden) {
    structuralPanel.setAttr("hidden", "true");
    structuralPanel.hidden = true;
    return;
  }
  structuralPanel.hidden = false;
  if (typeof structuralPanel.removeAttribute === "function") {
    structuralPanel.removeAttribute("hidden");
  } else if (structuralPanel.attrs) {
    delete structuralPanel.attrs.hidden;
  }
}

function syncStructuralRowSelection() {
  renderedInboxRowsByPath.forEach((row, path) => {
    const selected = !!activeStructuralPath && path === activeStructuralPath;
    row.toggleClass("is-structural-selected", selected);
    row.setAttr("data-noria-inbox-structural-selected", selected ? "true" : "false");
  });
}

function renderInboxStructuralPanel(item, structural) {
  structuralPanel.empty?.();
  const profile = structural || (item ? inboxStructuralProfile(item, inboxWritebackProfile(item)) : null);
  if (!item || !profile || profile.state === "none") {
    activeStructuralPath = "";
    structuralPanel.className = "dashboard-inbox-structural-panel";
    structuralPanel.setAttr("data-noria-inbox-structural-state", "none");
    structuralPanel.setAttr("data-noria-inbox-structural-source", "");
    structuralPanel.setAttr("data-noria-inbox-structural-actions", "");
    structuralPanel.setAttr("data-noria-inbox-structural-requires", "");
    structuralPanel.setAttr("data-noria-inbox-structural-target", "");
    structuralPanel.setAttr("data-noria-inbox-structural-can-execute", "false");
    structuralPanel.setAttr("data-noria-inbox-structural-executable-actions", "");
    structuralPanel.setAttr("data-noria-inbox-structural-blocked-actions", "");
    structuralPanel.setAttr("data-noria-inbox-structural-blocked-reason", "");
    structuralPanel.setAttr("data-noria-action-state", "empty");
    setStructuralPanelHidden(true);
    syncStructuralRowSelection();
    return;
  }
  const execution = inboxStructuralExecutionProfile(item, profile);
  activeStructuralPath = item.path || "";
  structuralPanel.className = `dashboard-inbox-structural-panel dashboard-inbox-structural-panel--${profile.state}`;
  structuralPanel.setAttr("data-noria-inbox-structural-panel", "1");
  structuralPanel.setAttr("data-noria-inbox-structural-state", profile.state);
  structuralPanel.setAttr("data-noria-inbox-structural-boundary", profile.boundary);
  structuralPanel.setAttr("data-noria-inbox-structural-source", item.path || "");
  structuralPanel.setAttr("data-noria-inbox-structural-actions", profile.actions.join(" "));
  structuralPanel.setAttr("data-noria-inbox-structural-requires", profile.requires.join(" "));
  structuralPanel.setAttr("data-noria-inbox-structural-target", profile.target || "");
  structuralPanel.setAttr("data-noria-inbox-structural-can-execute", execution.executable.length ? "true" : "false");
  structuralPanel.setAttr("data-noria-inbox-structural-executable-actions", execution.executable.join(" "));
  structuralPanel.setAttr("data-noria-inbox-structural-blocked-actions", execution.blocked.join(" "));
  structuralPanel.setAttr("data-noria-inbox-structural-blocked-reason", execution.reason);
  structuralPanel.setAttr("data-noria-action-state", "preview-only");
  setStructuralPanelHidden(false);

  const head = structuralPanel.createDiv();
  head.className = "dashboard-inbox-structural-panel__head";
  head.createEl("span", { text: inboxStructuralStateLabel(profile.state) }).className = "dashboard-inbox-structural-panel__state";
  const title = head.createEl("strong", { text: displayInboxName(item) });
  title.className = "dashboard-inbox-structural-panel__title";
  title.setAttr("title", item.path || "");

  const target = structuralPanel.createEl("span", { text: inboxStructuralTargetText(profile.target) });
  target.className = "dashboard-inbox-structural-panel__target";
  target.setAttr("title", profile.target || "");

  const handoffRow = structuralPanel.createDiv();
  handoffRow.className = "dashboard-inbox-structural-panel__handoffs";
  renderInboxStructuralHandoff(
    handoffRow,
    inboxStructuralRequireLabel("source-position"),
    item.path || "",
    "open-structural-source",
    { handoff: "source", openable: !!item.path }
  );
  if (profile.target) {
    renderInboxStructuralHandoff(
      handoffRow,
      inboxStructuralRequireLabel("destination-confirmation"),
      profile.target,
      "open-structural-target",
      {
        handoff: "target",
        openable: inboxVaultPathExists(profile.target),
        unavailableState: "missing"
      }
    );
  }

  const actionRow = structuralPanel.createDiv();
  actionRow.className = "dashboard-inbox-structural-panel__actions";
  for (const action of profile.actions || []) {
    const label = inboxStructuralActionLabel(action);
    if (!label) continue;
    const chip = actionRow.createEl("span", { text: label });
    chip.className = "dashboard-inbox-structural-panel__action";
    chip.setAttr("data-noria-inbox-structural-action", action);
  }

  const checkRow = structuralPanel.createDiv();
  checkRow.className = "dashboard-inbox-structural-panel__checks";
  for (const requirement of profile.requires || []) {
    const label = inboxStructuralRequireLabel(requirement);
    if (!label) continue;
    const chip = checkRow.createEl("span", { text: label });
    chip.className = "dashboard-inbox-structural-panel__check";
    chip.setAttr("data-noria-inbox-structural-require", requirement);
  }
  renderInboxStructuralMoveAction(actionRow, item, profile, execution);
  renderInboxStructuralConvertTaskAction(actionRow, item, profile, execution);
  syncStructuralRowSelection();
}

function renderInboxStructuralMoveAction(parent, item, profile, execution = null) {
  const api = bridge.inbox && typeof bridge.inbox.moveOut === "function" ? bridge.inbox : null;
  const executable = new Set((execution || inboxStructuralExecutionProfile(item, profile)).executable || []);
  const canMove = api && executable.has("move-inbox-file");
  if (!canMove) return null;
  const action = parent.createEl("span", { text: inboxStructuralConfirmMoveText() });
  action.className = "dashboard-inbox-structural-panel__confirm";
  action.setAttr("role", "button");
  action.setAttr("tabindex", "0");
  action.setAttr("data-noria-action-source", "home-inbox-structural");
  action.setAttr("data-noria-action-kind", "move-inbox-file");
  action.setAttr("data-noria-action-target", profile.target);
  action.setAttr("data-noria-action-state", "idle");
  action.setAttr("data-noria-inbox-source", item.path || "");
  action.setAttr("data-noria-inbox-action", item.action || "");
  const run = async (evt) => {
    evt?.preventDefault?.();
    evt?.stopPropagation?.();
    setActionState(action, "pending");
    try {
      const result = await api.moveOut({
        path: item.path,
        action: item.action,
        target: profile.target,
        confirm: true,
        reason: "home-inbox-structural-move"
      });
      if (result && result.ok !== false) {
        setActionState(action, "ok");
        try { bridge.refresh?.requestRefresh?.("home", "writeback:inbox-move", { reloadViews: true }); } catch (_) {}
        return true;
      }
      const reason = result?.reason || "failed";
      setActionState(action, "failed", reason);
      try { bridge.runtime?.notice?.("runtime.periodic.inbox.structuralMoveFailed", { reason }, 2800); } catch (_) {}
      return false;
    } catch (error) {
      const reason = String(error?.message || error || "failed");
      setActionState(action, "failed", reason);
      try { bridge.runtime?.notice?.("runtime.periodic.inbox.structuralMoveFailed", { reason }, 2800); } catch (_) {}
      return false;
    }
  };
  action.onclick = run;
  action.onkeydown = (evt) => {
    if (evt?.key !== "Enter" && evt?.key !== " ") return undefined;
    return run(evt);
  };
  return action;
}

function renderInboxStructuralConvertTaskAction(parent, item, profile, execution = null) {
  const api = bridge.inbox && typeof bridge.inbox.convertToTask === "function" ? bridge.inbox : null;
  const executable = new Set((execution || inboxStructuralExecutionProfile(item, profile)).executable || []);
  const canConvert = api && executable.has("convert-inbox-task");
  if (!canConvert) return null;
  const action = parent.createEl("span", { text: inboxStructuralConfirmConvertTaskText() });
  action.className = "dashboard-inbox-structural-panel__confirm";
  action.setAttr("role", "button");
  action.setAttr("tabindex", "0");
  action.setAttr("data-noria-action-source", "home-inbox-structural");
  action.setAttr("data-noria-action-kind", "convert-inbox-task");
  action.setAttr("data-noria-action-target", profile.target);
  action.setAttr("data-noria-action-state", "idle");
  action.setAttr("data-noria-inbox-source", item.path || "");
  action.setAttr("data-noria-inbox-action", "convert-task");
  const run = async (evt) => {
    evt?.preventDefault?.();
    evt?.stopPropagation?.();
    setActionState(action, "pending");
    try {
      const result = await api.convertToTask({
        path: item.path,
        action: "convert-task",
        target: profile.target,
        confirm: true,
        reason: "home-inbox-structural-convert-task"
      });
      if (result && result.ok !== false) {
        setActionState(action, "ok");
        try { bridge.refresh?.requestRefresh?.("home", "writeback:inbox-convert-task", { reloadViews: true }); } catch (_) {}
        return true;
      }
      const reason = result?.reason || "failed";
      setActionState(action, "failed", reason);
      try { bridge.runtime?.notice?.("runtime.periodic.inbox.structuralConvertTaskFailed", { reason }, 2800); } catch (_) {}
      return false;
    } catch (error) {
      const reason = String(error?.message || error || "failed");
      setActionState(action, "failed", reason);
      try { bridge.runtime?.notice?.("runtime.periodic.inbox.structuralConvertTaskFailed", { reason }, 2800); } catch (_) {}
      return false;
    }
  };
  action.onclick = run;
  action.onkeydown = (evt) => {
    if (evt?.key !== "Enter" && evt?.key !== " ") return undefined;
    return run(evt);
  };
  return action;
}

function selectStructuralItem(item, structural) {
  const profile = structural || (item ? inboxStructuralProfile(item, inboxWritebackProfile(item)) : null);
  if (!item || !profile || profile.state === "none") return;
  renderInboxStructuralPanel(item, profile);
}

function renderInboxSummary(displayItems, filteredItems, selectedStructural = null) {
  const visible = Array.isArray(displayItems) ? displayItems.length : 0;
  const filtered = Array.isArray(filteredItems) ? filteredItems.length : 0;
  const total = activeItems.length;
  const hidden = Math.max(0, filtered - visible);
  const limit = 10;
  const overflowState = filtered > limit ? (showAllInbox ? "expanded" : "collapsed") : "none";
  const attention = (filteredItems || []).filter((item) => inboxNeedEntries(item).length > 0).length;
  const reviewDue = (filteredItems || []).filter((item) => item.flags.reviewDue).length;
  const priorityItem = Array.isArray(displayItems) && displayItems.length > 0 ? displayItems[0] : null;
  const priorityNext = priorityItem ? inboxPrimaryNext(priorityItem) : "";
  const priorityLabel = priorityItem ? inboxPrimaryNextLabel(priorityNext) : "";
  const priorityStage = priorityItem ? queueStage(priorityItem) : null;
  const writebackCounts = inboxWritebackCounts(filteredItems || []);
  const structuralCounts = inboxStructuralCounts(filteredItems || []);
  const health = inboxQueueHealth(filteredItems || []);
  const healthPrimaryStage = health.primary ? queueStage(health.primary) : null;
  const activeLane = activeLaneId ? laneById.get(activeLaneId) : null;
  summaryRow.empty?.();
  summaryRow.setAttr("data-noria-inbox-total", total);
  summaryRow.setAttr("data-noria-inbox-filtered", filtered);
  summaryRow.setAttr("data-noria-inbox-visible", visible);
  summaryRow.setAttr("data-noria-inbox-hidden", hidden);
  summaryRow.setAttr("data-noria-inbox-overflow-state", overflowState);
  summaryRow.setAttr("data-noria-inbox-overflow-limit", limit);
  summaryRow.setAttr("data-noria-inbox-attention", attention);
  summaryRow.setAttr("data-noria-inbox-review-due", reviewDue);
  summaryRow.setAttr("data-noria-inbox-active-lane", activeLaneId || "");
  summaryRow.setAttr("data-noria-inbox-active-lane-label", activeLane?.label || "");
  summaryRow.setAttr("data-noria-inbox-active-lane-title", activeLane?.title || "");
  summaryRow.setAttr("data-noria-inbox-active-lane-count", activeLane?.count || "");
  summaryRow.setAttr("data-noria-inbox-priority-path", priorityItem?.path || "");
  summaryRow.setAttr("data-noria-inbox-priority-next", priorityNext);
  summaryRow.setAttr("data-noria-inbox-priority-label", priorityLabel);
  summaryRow.setAttr("data-noria-inbox-priority-stage", priorityStage?.id || "");
  summaryRow.setAttr("data-noria-inbox-writeback-ready", writebackCounts.ready);
  summaryRow.setAttr("data-noria-inbox-writeback-source-only", writebackCounts.sourceOnly);
  summaryRow.setAttr("data-noria-inbox-writeback-blocked", writebackCounts.blocked);
  summaryRow.setAttr("data-noria-inbox-structural-candidates", structuralCounts.candidates);
  summaryRow.setAttr("data-noria-inbox-structural-blocked", structuralCounts.blocked);
  summaryRow.setAttr("data-noria-inbox-structural-selected", selectedStructural?.item?.path || "");
  summaryRow.setAttr("data-noria-inbox-health-ready", health.ready);
  summaryRow.setAttr("data-noria-inbox-health-blocked", health.blocked);
  summaryRow.setAttr("data-noria-inbox-health-waiting", health.waiting);
  summaryRow.setAttr("data-noria-inbox-health-stale", health.stale);
  summaryRow.setAttr("data-noria-inbox-health-primary-path", health.primary?.path || "");
  summaryRow.setAttr("data-noria-inbox-health-primary-stage", healthPrimaryStage?.id || "");
  const overflow = renderInboxOverflowAction(hidden, limit, filtered);
  setInboxSummaryVisibility(!!overflow);
}

function renderInboxList() {
  box.empty();
  renderedInboxRowsByPath.clear();
  const filteredItems = sortedInboxRows(filteredInboxRows());
  const displayItems = showAllInbox ? filteredItems : filteredItems.slice(0, 10);
  const selectedStructural = resolveStructuralSelection(displayItems);
  renderInboxSummary(displayItems, filteredItems, selectedStructural);
  renderInboxStructuralPanel(selectedStructural?.item || null, selectedStructural?.structural || null);
  if (items.length === 0) {
    renderEmpty(inboxT("runtime.periodic.inbox.emptyQueue"));
    return;
  }

  if (displayItems.length === 0) {
    renderEmpty(activeLaneId ? inboxT("runtime.periodic.inbox.emptyFiltered") : inboxT("runtime.periodic.inbox.emptyActive"));
    return;
  }

  displayItems.forEach((item, index) => {
    const stage = queueStage(item);
    const needs = inboxNeedEntries(item);
    const primaryNext = inboxPrimaryNext(item);
    const primaryNextLabel = inboxPrimaryNextLabel(primaryNext);
    const writeback = inboxWritebackProfile(item);
    const structural = inboxStructuralProfile(item, writeback);
    const rhythm = inboxRhythmProfile(item, primaryNext, needs, writeback);
    const row = box.createDiv();
    row.addClass("dashboard-inbox-row");
    row.addClass("dashboard-inbox-row--clickable");
    row.addClass(`dashboard-inbox-row--${stage.id}`);
    row.addClass(`dashboard-inbox-row--writeback-${writeback.state}`);
    row.addClass(`dashboard-inbox-row--rhythm-${rhythm.id}`);
    row.setAttr("role", "button");
    row.setAttr("tabindex", "0");
    row.setAttr("data-inbox-path", item.path);
    row.setAttr("data-inbox-stage", stage.id);
    row.setAttr("data-inbox-status", item.statusId || "");
    row.setAttr("data-inbox-action", item.action || "");
    row.setAttr("data-inbox-shape", item.shape || "");
    row.setAttr("data-inbox-next", item.next || "");
    row.setAttr("data-inbox-preview", item.preview || "");
    row.setAttr("data-noria-action-kind", "open-inbox-source");
    row.setAttr("data-noria-action-source", "home-inbox");
    row.setAttr("data-noria-action-target", item.path);
    row.setAttr("data-noria-action-state", "idle");
    row.setAttr("data-noria-inbox-stage", stage.id);
    row.setAttr("data-noria-inbox-status", item.statusId || "");
    row.setAttr("data-noria-inbox-needs", needs.map((need) => need.code).join(" "));
    row.setAttr("data-noria-inbox-primary-next", primaryNext);
    row.setAttr("data-noria-inbox-primary-next-label", primaryNextLabel);
    row.setAttr("data-noria-inbox-rhythm", rhythm.id);
    row.setAttr("data-noria-inbox-rhythm-label", rhythm.label);
    row.setAttr("data-noria-inbox-priority-rank", String(index + 1));
    row.setAttr("data-noria-inbox-sort-reason", inboxSortReason(item));
    row.setAttr("data-noria-inbox-writeback-state", writeback.state);
    row.setAttr("data-noria-inbox-writeback-boundary", writeback.boundary);
    row.setAttr("data-noria-inbox-writeback-capabilities", writeback.capabilities.join(" "));
    row.setAttr("data-noria-inbox-structural-state", structural.state);
    row.setAttr("data-noria-inbox-structural-actions", structural.actions.join(" "));
    row.setAttr("data-noria-inbox-structural-boundary", structural.boundary);
    row.setAttr("data-noria-inbox-structural-requires", structural.requires.join(" "));
    row.setAttr("data-noria-inbox-structural-target", structural.target);
    row.setAttr("data-noria-inbox-structural-selected", item.path && item.path === activeStructuralPath ? "true" : "false");
    row.setAttr("title", `${stage.title} ${inboxT("runtime.periodic.inbox.openNoteHint")}`);
    row.setAttr("aria-label", [item.name, rhythm.label, stage.label, needs.map((need) => need.label).join(" · "), primaryNextLabel, inboxT("runtime.periodic.inbox.openNoteHint")].filter(Boolean).join(" · "));
    row.toggleClass("has-preview", !!item.preview);
    row.toggleClass("has-needs", needs.length > 0);
    const openItem = (targets = row) => runInboxSourceOpen(targets, item);
    row.onclick = (evt) => {
      if (evt?.target?.closest?.("a,button")) return;
      return openItem(row);
    };
    row.onkeydown = (evt) => {
      if (evt?.target?.closest?.("a,button")) return;
      if (evt?.key !== "Enter" && evt?.key !== " ") return;
      evt.preventDefault?.();
      return openItem(row);
    };
    row.onfocus = () => selectStructuralItem(item, structural);
    row.onmouseenter = () => selectStructuralItem(item, structural);
    if (item.flags.reviewDue) row.addClass("is-review-due");
    if (item.flags.missingCore || item.flags.missingTrust) row.addClass("is-attention");
    renderedInboxRowsByPath.set(item.path, row);

    const left = row.createDiv();
    left.className = "dashboard-inbox-row__main";
    const ic = left.createDiv();
    ic.className = `dashboard-inbox-row__icon dashboard-inbox-row__icon--${stage.id}`;
    paintInboxGlyph(ic);

    const textWrap = left.createDiv();
    textWrap.className = "dashboard-inbox-row__text";
    const titleLine = textWrap.createDiv();
    titleLine.className = "dashboard-inbox-row__titleline";
    const link = titleLine.createEl("a", { text: item.name });
    link.addClass("internal-link");
    link.addClass("dashboard-task-title");
    link.addClass("dashboard-task-title--one-line");
    link.addClass("dashboard-task-title--link");
    link.setAttr("data-href", item.path);
    link.setAttr("href", item.path);
    link.setAttr("title", item.path);
    link.setAttr("data-noria-action-kind", "open-inbox-source");
    link.setAttr("data-noria-action-source", "home-inbox");
    link.setAttr("data-noria-action-target", item.path);
    link.setAttr("data-noria-action-state", "idle");
    link.onclick = (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      return openItem([row, link]);
    };
    renderInboxRhythm(titleLine, rhythm);
    renderInboxCue(textWrap, primaryNext);
    renderInboxStatusAction(textWrap, item, writeback);
    if (item.preview) {
      const preview = textWrap.createDiv({ text: item.preview });
      preview.className = "dashboard-inbox-row__preview";
      preview.setAttr("data-inbox-preview", item.preview);
      preview.setAttr("title", item.preview);
    }
    renderInboxMeta(textWrap, item, stage);

    const right = row.createDiv();
    right.className = "dashboard-inbox-row__side";
    right.createEl("span", { text: formatMtime(item.mtime) }).className = "dashboard-inbox-date";
  });
  syncStructuralRowSelection();
}

syncLaneButtons();
renderInboxList();
