const host = (input && input.mount) ? input.mount : this.container;

(async () => {
  const pickDate = (text, patterns) => {
    const s = String(text || "");
    for (const re of patterns) {
      const m = s.match(re);
      if (m && m[1]) return m[1];
    }
    return "";
  };
  const parseFallbackTask = (raw, filePath, lineNo, completedHint = null) => {
    const txt = String(raw || "").trim();
    if (!txt) return null;
    const checkbox = /^\s*[-*]\s*\[[^\]]*\]\s+/.test(txt);
    if (!checkbox && completedHint == null) return null;
    const mark = (txt.match(/^\s*[-*]\s*\[([^\]]*)\]/) || [])[1] || "";
    const checkboxState = /x/i.test(mark)
      ? "done"
      : (mark.trim() === "/" ? "in_progress" : (mark.trim() === "-" ? "cancelled" : "todo"));
    const completed = completedHint == null
      ? checkboxState === "done"
      : !!completedHint;
    const text = txt.replace(/^\s*[-*]\s*\[[^\]]*\]\s*/, "").trim();
    if (!text) return null;
    return {
      text,
      completed,
      cancelled: checkboxState === "cancelled",
      status: checkboxState === "done" ? "done" : (checkboxState === "cancelled" ? "cancelled" : "open"),
      checkboxState,
      due: pickDate(text, [/\[due::\s*(\d{4}-\d{2}-\d{2})\]/i, /(?:📅|📆|🗓)\s*(\d{4}-\d{2}-\d{2})/]),
      scheduled: pickDate(text, [/\[scheduled::\s*(\d{4}-\d{2}-\d{2})\]/i, /⏳\s*(\d{4}-\d{2}-\d{2})/]),
      start: pickDate(text, [/\[start::\s*(\d{4}-\d{2}-\d{2})\]/i, /🛫\s*(\d{4}-\d{2}-\d{2})/]),
      path: filePath,
      from: filePath,
      line: Number(lineNo || 0)
    };
  };
  const parseTaskRowsFromMarkdown = (body, filePath) =>
    String(body || "")
      .split("\n")
      .map((line, idx) => parseFallbackTask(line, filePath, idx))
      .filter(Boolean);
  const getCacheListItemText = (item) => {
    if (!item) return "";
    if (typeof item.task === "string" && item.task.trim()) {
      const status = String(item.task).trim();
      return `- [${/x/i.test(status) ? "x" : " "}] ${item.text || ""}`.trim();
    }
    if (typeof item.text === "string" && item.text.trim()) return item.text;
    if (typeof item.raw === "string" && item.raw.trim()) return item.raw;
    return "";
  };
  const readFileTextCache = new Map();
  const readMarkdownFileText = async (pathText) => {
    const p = normalizePath(pathText);
    if (!p) return "";
    if (readFileTextCache.has(p)) return readFileTextCache.get(p);
    let raw = "";
    try {
      const file = app.vault.getAbstractFileByPath(p);
      if (file && typeof app.vault.read === "function") raw = String(await app.vault.read(file) || "");
    } catch (_) {}
    if (!raw) {
      try {
        if (typeof app.vault.adapter?.read === "function") raw = String(await app.vault.adapter.read(p) || "");
      } catch (_) {}
    }
    readFileTextCache.set(p, raw);
    return raw;
  };
  const gatherTasksByRootFallback = async (rootPath) => {
    const root = String(rootPath || "").replace(/\\/g, "/");
    if (!root) return [];
    const files = app?.vault?.getMarkdownFiles?.() || [];
    const out = [];
    for (const f of files) {
      const p = String(f.path || "").replace(/\\/g, "/");
      if (!(p === root || p.startsWith(root + "/"))) continue;
      const cache = app?.metadataCache?.getFileCache?.(f) || {};
      const list = Array.isArray(cache.listItems) ? cache.listItems : [];
      list.forEach((it) => {
        const taskLike = it?.task === true || typeof it?.task === "string" || /^\s*[-*]\s*\[[^\]]*\]\s+/.test(String(it?.text || it?.raw || ""));
        if (!taskLike) return;
        const rawTaskText = getCacheListItemText(it);
        const completedHint = typeof it.task === "string" ? /x/i.test(it.task) : (it.task === true ? false : null);
        const t = parseFallbackTask(rawTaskText, p, it.position?.start?.line, completedHint);
        if (t) out.push(t);
      });
      const raw = await readMarkdownFileText(p);
      out.push(...parseTaskRowsFromMarkdown(raw, p));
    }
    return out;
  };
  async function runProjectGuideBuildQueue(queue, limit = 4) {
    if (!Array.isArray(queue) || queue.length === 0) return;
    let index = 0;
    const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
      while (index < queue.length) {
        const job = queue[index++];
        if (typeof job === "function") await job();
      }
    });
    await Promise.all(workers);
  }
  const bridge = input?.noriaBridge || globalThis.__noriaRuntimeBridge || {};
  const projectsT = (key, params = {}) => {
    try {
      if (bridge && typeof bridge.t === "function") return bridge.t(key, params);
      const messages = bridge?.i18n?.messages || {};
      const fallback = bridge?.i18n?.fallback || {};
      let template = messages[key] || fallback[key] || key;
      Object.entries(params || {}).forEach(([k, v]) => {
        template = String(template).replace(new RegExp(`\\{${k}\\}`, "g"), String(v ?? ""));
      });
      return String(template);
    } catch (_) {
      return String(key || "");
    }
  };
  const notifyProject = (key, params = {}, duration = 1800) => {
    if (typeof bridge.runtime?.notice === "function") {
      bridge.runtime.notice(key, params, duration);
      return;
    }
    if (typeof Notice !== "undefined") {
      new Notice(projectsT(key, params), duration);
    }
  };
  const projectListPath = String(bridge.paths?.projectRegistryPath || "Noria/Projects.md");
  const projectsRoot = String(bridge.paths?.projectsRoot || "01_Projects").replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
  const projectsUseChinese = /^zh(?:-|$)/i.test(String(bridge.locale || bridge.i18n?.locale || "en"));
  const sectionAliasGroups = {
    hidden: ["项目隐藏清单", "Hidden projects"],
    active: ["进行中的项目", "Active projects"],
    planned: ["计划中的项目", "Planned projects"],
    done: ["已完成的项目", "Completed projects"]
  };
  const sectionTitles = {
    hidden: sectionAliasGroups.hidden[projectsUseChinese ? 0 : 1],
    active: sectionAliasGroups.active[projectsUseChinese ? 0 : 1],
    planned: sectionAliasGroups.planned[projectsUseChinese ? 0 : 1],
    done: sectionAliasGroups.done[projectsUseChinese ? 0 : 1]
  };
  const projectSectionAliases = (title) => {
    const raw = String(title || "").trim();
    return Object.values(sectionAliasGroups).find((group) => group.includes(raw)) || [raw];
  };

  const uniq = (arr) => [...new Set(arr.filter(Boolean))];
  const normalizeName = (txt) => String(txt || "").trim();
  const normalizePath = (txt) => String(txt || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  const setNodeAttr = (node, name, value) => {
    const v = String(value == null ? "" : value);
    try { node?.setAttr?.(name, v); } catch (_) {}
    try { node?.setAttribute?.(name, v); } catch (_) {}
  };
  const removeNodeAttr = (node, name) => {
    try { node?.removeAttr?.(name); } catch (_) {}
    try { node?.removeAttribute?.(name); } catch (_) {}
    try {
      if (node?.attrs && Object.prototype.hasOwnProperty.call(node.attrs, name)) delete node.attrs[name];
    } catch (_) {}
  };
  const escapeRegExp = (txt) => String(txt || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const getProjectInfoFromPath = (pathText) => {
    const filePath = normalizePath(pathText);
    if (!filePath || !filePath.startsWith(`${projectsRoot}/`)) return null;
    const rel = filePath.slice(projectsRoot.length + 1);
    const parts = rel.split("/").filter(Boolean);
    if (parts.length >= 2) {
      return { name: parts[0], root: `${projectsRoot}/${parts[0]}`, singleFile: false };
    }
    if (parts.length === 1 && /\.md$/i.test(parts[0] || "")) {
      const name = String(parts[0] || "").replace(/\.md$/i, "");
      return { name, root: projectsRoot, singleFile: true };
    }
    return null;
  };
  const stripProjectFileName = (value) =>
    normalizeName(String(value || "").split("/").pop() || "")
      .replace(/\.(md|canvas)$/i, "")
      .replace(/[·\-\s]*MOC$/i, "");
  const canonicalProjectKey = (value) =>
    stripProjectFileName(value)
      .replace(/\s+/g, "")
      .toLowerCase();
  const ensureParentFolder = async (pathText) => {
    const parts = normalizePath(pathText).split("/").filter(Boolean);
    parts.pop();
    let cursor = "";
    for (const part of parts) {
      cursor = cursor ? `${cursor}/${part}` : part;
      try {
        if (!app.vault.getAbstractFileByPath(cursor)) await app.vault.createFolder(cursor);
      } catch (_) {}
    }
  };
  const isPlaceholderName = (name) => {
    const n = normalizeName(name);
    if (!n) return true;
    if (n === "（空）" || n === "(空)" || /^\(?\s*empty\s*\)?$/i.test(n)) return true;
    if (/^[（(]?\s*空\s*[)）]?$/u.test(n)) return true;
    return false;
  };
  const parseItemText = (line) => {
    const raw = String(line || "").replace(/^-+\s*/, "").trim();
    const m = raw.match(/^\[\[([^|\]]+)(?:\|([^\]]+))?\]\]$/);
    if (m) {
      const path = normalizePath(m[1] || "");
      const projSeg = path.match(new RegExp(`${escapeRegExp(projectsRoot)}/([^/]+)`));
      if (projSeg) return { name: normalizeName(projSeg[1]), targetPath: path };
      const alias = normalizeName(m[2] || "");
      if (alias) return { name: alias, targetPath: path };
      return { name: normalizeName(path.split("/").pop()), targetPath: path };
    }
    return { name: normalizeName(raw), targetPath: "" };
  };
  const toEntryMap = (items) => {
    const map = new Map();
    (items || []).forEach((item) => {
      const name = normalizeName(item?.name || "");
      if (!name || isPlaceholderName(name)) return;
      const targetPath = normalizePath(item?.targetPath || "");
      const key = canonicalProjectKey(targetPath || name);
      if (key) map.set(key, { name, targetPath });
    });
    return map;
  };
  const getSectionItems = (content, title) => {
    let block = "";
    for (const candidate of projectSectionAliases(title)) {
      const escaped = String(candidate || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      block = (String(content || "").match(new RegExp(`##\\s*${escaped}[\\s\\S]*?(?=\\n##\\s|$)`)) || [])[0] || "";
      if (block) break;
    }
    return block
      .split("\n")
      .map((x) => x.trim())
      .filter((x) => /^-\s+/.test(x))
      .map(parseItemText);
  };

  const parseProjectRegistryText = (content) => ({
    hidden: toEntryMap(getSectionItems(content, sectionTitles.hidden)),
    active: toEntryMap(getSectionItems(content, sectionTitles.active)),
    planned: toEntryMap(getSectionItems(content, sectionTitles.planned)),
    done: toEntryMap(getSectionItems(content, sectionTitles.done))
  });
  const createEmptyRegistry = () => ({
    hidden: new Map(),
    active: new Map(),
    planned: new Map(),
    done: new Map()
  });
  const getRegistryEntry = (registry, name) => {
    const n = canonicalProjectKey(name);
    return registry.active.get(n) || registry.planned.get(n) || registry.hidden.get(n) || registry.done.get(n) || null;
  };
  const readProjectRegistry = async () => {
    const content = await ctx.io.load(projectListPath);
    if (!content) return createEmptyRegistry();
    return parseProjectRegistryText(content);
  };
  const renderProjectRegistry = (registry) => {
    const normalizeBlock = (name, map) => {
      const rows = [...(map || new Map()).values()]
        .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
        .map((x) => {
          const itemName = normalizeName(x?.name || "");
          if (!itemName) return "";
          const targetPath = normalizePath(x?.targetPath || "");
          return targetPath ? `- [[${targetPath}|${itemName}]]` : `- ${itemName}`;
        })
        .filter(Boolean);
      return [`## ${sectionTitles[name]}`, "", ...(rows.length ? rows : [projectsUseChinese ? "- （空）" : "- (empty)"]), ""].join("\n");
    };
    const header = [
      "# Projects",
      "",
      projectsUseChinese
        ? "> 用于主页看板：分组维护项目；点「+」在项目管理里添加、隐藏或从清单移除。"
        : "> Organize Home projects by stage. Use + to add, hide, or remove projects from the registry.",
      ""
    ].join("\n");
    const next = [
      header,
      normalizeBlock("hidden", registry.hidden),
      normalizeBlock("active", registry.active),
      normalizeBlock("planned", registry.planned),
      normalizeBlock("done", registry.done)
    ].join("\n");
    return next;
  };
  const processProjectRegistry = async (mutator) => {
    const apply = (current) => {
      const registry = String(current || "").trim()
        ? parseProjectRegistryText(current)
        : createEmptyRegistry();
      const nextRegistry = typeof mutator === "function" ? (mutator(registry) || registry) : registry;
      return renderProjectRegistry(nextRegistry);
    };
    let target = app.vault.getAbstractFileByPath(projectListPath);
    let created = false;
    if (!target) {
      await ensureParentFolder(projectListPath);
      try {
        target = await app.vault.create(projectListPath, apply(""));
        created = true;
      } catch (error) {
        const message = String(error?.message || error || "");
        target = app.vault.getAbstractFileByPath(projectListPath);
        if (!target && /File already exists|already exists/i.test(message)) {
          await Promise.resolve();
          target = app.vault.getAbstractFileByPath(projectListPath);
        }
        if (!target) throw error;
      }
    }
    if (!created) {
      if (typeof app.vault.process === "function") {
        await app.vault.process(target, apply);
      } else {
        const current = typeof app.vault.read === "function"
          ? String(await app.vault.read(target) || "")
          : String(await app.vault.cachedRead?.(target) || "");
        const next = apply(current);
        if (next !== current) await app.vault.modify(target, next);
      }
    }
    if (bridge.refresh?.requestRefresh) bridge.refresh.requestRefresh("home", "project-registry-write");
    else {
      try { globalThis.__noriaHomeRefreshBus?.emit?.("projects", 20); } catch (_) {}
    }
  };
  const moveProjectStage = async (name, stage) => {
    const n = normalizeName(name);
    if (!n) return false;
    const key = canonicalProjectKey(n);
    await processProjectRegistry((registry) => {
      const prev = getRegistryEntry(registry, n);
      const nextEntry = { name: n, targetPath: normalizePath(prev?.targetPath || "") };
      registry.hidden.delete(key);
      registry.active.delete(key);
      registry.planned.delete(key);
      registry.done.delete(key);
      if (stage === "hidden") registry.hidden.set(key, nextEntry);
      else if (stage === "done") registry.done.set(key, nextEntry);
      else if (stage === "planned") registry.planned.set(key, nextEntry);
      else registry.active.set(key, nextEntry);
      return registry;
    });
    return true;
  };
  const deleteProjectEntry = async (name) => {
    const n = normalizeName(name);
    if (!n) return false;
    const key = canonicalProjectKey(n);
    await processProjectRegistry((registry) => {
      registry.hidden.delete(key);
      registry.active.delete(key);
      registry.planned.delete(key);
      registry.done.delete(key);
      return registry;
    });
    return true;
  };
  const removeProjectFromView = (name) => {
    const idx = projectData.findIndex((x) => x.name === name);
    if (idx >= 0) projectData.splice(idx, 1);
  };
  let activeMenuState = null;
  const closeProjectMenu = () => {
    if (!activeMenuState) return;
    const { menu, onDocPointerDown, onEsc } = activeMenuState;
    document.removeEventListener("pointerdown", onDocPointerDown, true);
    document.removeEventListener("keydown", onEsc, true);
    menu.remove();
    activeMenuState = null;
  };
  const openProjectQuickMenu = (proj, anchorBtn, onChanged) => {
    closeProjectMenu();
    const menu = document.createElement("div");
    menu.className = "dashboard-project-quick-menu";
    menu.setAttribute("role", "menu");
    menu.style.cssText = [
      "position:fixed",
      "z-index:10020",
      "display:flex",
      "flex-direction:column",
      "gap:2px",
      "min-width:124px",
      "padding:5px",
      "border-radius:9px",
      "border:1px solid color-mix(in srgb,var(--background-modifier-border) 88%, rgba(99,102,241,.18))",
      "background:color-mix(in srgb,var(--background-primary) 97%, rgba(99,102,241,.04))",
      "box-shadow:0 8px 18px rgba(15,23,42,.14)",
      "backdrop-filter:blur(1.5px)"
    ].join(";");
    const makeAction = (label, className, runner) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `dashboard-project-quick-menu__btn ${className || ""}`.trim();
      btn.setAttribute("role", "menuitem");
      btn.textContent = label;
      let btnStyle = [
        "height:26px",
        "padding:0 9px",
        "border-radius:7px",
        "border:1px solid transparent",
        "background:transparent",
        "color:var(--text-normal)",
        "font-size:.75em",
        "font-weight:610",
        "text-align:left",
        "cursor:pointer",
        "transition:border-color .12s ease,background .12s ease,color .12s ease"
      ].join(";");
      if (className === "is-warn") {
        btnStyle += ";color:color-mix(in srgb,var(--text-normal) 86%, rgba(146,64,14,.72))";
      } else if (className === "is-done") {
        btnStyle += ";color:color-mix(in srgb,var(--text-normal) 86%, rgba(22,101,52,.72))";
      } else if (className === "is-danger") {
        btnStyle += ";color:color-mix(in srgb,var(--text-normal) 74%, rgba(71,85,105,.82))";
      }
      btn.style.cssText = btnStyle;
      btn.onmouseenter = () => {
        btn.style.borderColor = "color-mix(in srgb,var(--background-modifier-border) 78%, rgba(99,102,241,.22))";
        btn.style.background = "color-mix(in srgb,var(--background-primary) 90%, rgba(99,102,241,.08))";
      };
      btn.onmouseleave = () => {
        btn.style.borderColor = "transparent";
        btn.style.background = "transparent";
      };
      btn.onclick = async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        btn.disabled = true;
        try {
          const ok = await runner();
          if (ok) onChanged();
        } finally {
          closeProjectMenu();
        }
      };
      return btn;
    };
    const hideBtn = makeAction(projectsT("runtime.periodic.projects.hidden"), "is-warn", async () => {
        const ok = await moveProjectStage(proj.name, "hidden");
        if (ok) bridge.runtime?.notice?.("runtime.periodic.projects.noticeHidden", { name: proj.name }, 1800)
          || new Notice(projectsT("runtime.periodic.projects.noticeHidden", { name: proj.name }), 1800);
        return ok;
      });
    const doneBtn = makeAction(projectsT("runtime.periodic.projects.completed"), "is-done", async () => {
        const ok = await moveProjectStage(proj.name, "done");
        if (ok) bridge.runtime?.notice?.("runtime.periodic.projects.noticeCompleted", { name: proj.name }, 1800)
          || new Notice(projectsT("runtime.periodic.projects.noticeCompleted", { name: proj.name }), 1800);
        return ok;
      });
    const delBtn = makeAction(projectsT("runtime.periodic.projects.delete"), "is-danger", async () => {
        const ok = await deleteProjectEntry(proj.name);
        if (ok) bridge.runtime?.notice?.("runtime.periodic.projects.removed", { name: proj.name }, 1800)
          || new Notice(projectsT("runtime.periodic.projects.removed", { name: proj.name }), 1800);
        return ok;
      });
    delBtn.style.marginTop = "2px";
    delBtn.style.borderTopColor = "color-mix(in srgb,var(--background-modifier-border) 84%, rgba(148,163,184,.24))";
    menu.append(hideBtn, doneBtn, delBtn);
    document.body.appendChild(menu);
    const rect = anchorBtn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const menuRect = menu.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left, vw - menuRect.width - 8));
    const topCandidate = rect.bottom + 6;
    const top = topCandidate + menuRect.height <= vh - 8 ? topCandidate : Math.max(8, rect.top - menuRect.height - 6);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    const onDocPointerDown = (ev) => {
      const target = ev.target;
      if (menu.contains(target) || anchorBtn.contains(target)) return;
      closeProjectMenu();
    };
    const onEsc = (ev) => {
      if (ev.key === "Escape") closeProjectMenu();
    };
    document.addEventListener("pointerdown", onDocPointerDown, true);
    document.addEventListener("keydown", onEsc, true);
    activeMenuState = { menu, onDocPointerDown, onEsc };
  };
  const openProjectNote = async (proj) => {
    const preferred = normalizePath(proj?.targetPath || "");
    const fallback = normalizePath(proj?.mocPath || "");
    const p = preferred || fallback;
    const f = app.vault.getAbstractFileByPath(p);
    if (!f) {
      bridge.runtime?.notice?.("runtime.periodic.projects.sourceMissing", { path: p }, 4500)
        || new Notice(projectsT("runtime.periodic.projects.sourceMissing", { path: p }), 4500);
      return;
    }
    await app.workspace.getLeaf(false).openFile(f);
  };
  const projectTaskLine = (text) => {
    const value = normalizeName(text).replace(/^\s*[-*]\s*\[[^\]]*\]\s*/, "").trim();
    return value ? `- [ ] ${value}` : "";
  };
  const appendProjectNextStep = async (proj, text) => {
    const taskLine = projectTaskLine(text);
    if (!taskLine) {
      notifyProject("runtime.periodic.projects.nextEmpty", {}, 1800);
      return null;
    }
    const p = normalizePath(proj?.targetPath || proj?.mocPath || "");
    const f = app.vault.getAbstractFileByPath(p);
    if (!f) {
      notifyProject("runtime.periodic.projects.sourceMissing", { path: p }, 4500);
      return null;
    }
    let line = 0;
    const append = (current) => {
      const base = String(current || "").replace(/\s+$/g, "");
      const prefix = base ? `${base}\n\n` : "";
      line = prefix ? prefix.split("\n").length - 1 : 0;
      return `${prefix}${taskLine}\n`;
    };
    if (typeof app.vault.process === "function") {
      await app.vault.process(f, append);
    } else {
      let before = "";
      try {
        if (typeof app.vault.read === "function") before = String(await app.vault.read(f) || "");
        else before = String(await app.vault.cachedRead?.(f) || "");
      } catch (_) {}
      if (!before) {
        try { before = String(await app.vault.adapter?.read?.(p) || ""); } catch (_) {}
      }
      await app.vault.modify(f, append(before));
    }
    notifyProject("runtime.periodic.projects.nextAdded", { name: proj.name }, 1600);
    try { bridge.refresh?.requestRefresh?.("home", "project-next-step"); } catch (_) {}
    try { globalThis.__noriaHomeRefreshBus?.emit?.("projects", 20); } catch (_) {}
    return {
      text: taskLine,
      completed: false,
      cancelled: false,
      status: "open",
      checkboxState: "todo",
      path: p,
      from: p,
      line,
      _inProgress: false
    };
  };
  const openTaskTarget = async (task) => {
    const p = String(task?.path || task?.from || "").trim();
    if (!p) return;
    const f = app.vault.getAbstractFileByPath(p);
    if (!f) {
      bridge.runtime?.notice?.("runtime.periodic.projects.sourceMissing", { path: p }, 4500)
        || new Notice(projectsT("runtime.periodic.projects.sourceMissing", { path: p }), 4500);
      return;
    }
    const leaf = app.workspace.getLeaf(false);
    await leaf.openFile(f);
    const line = Number(task?.line);
    if (!Number.isFinite(line)) return;
    setTimeout(() => {
      const editor = leaf?.view?.editor;
      if (!editor || typeof editor.setCursor !== "function") return;
      const ln = Math.max(0, Math.floor(line));
      editor.setCursor({ line: ln, ch: 0 });
      if (typeof editor.scrollIntoView === "function") {
        editor.scrollIntoView({ from: { line: ln, ch: 0 }, to: { line: ln, ch: 0 } }, true);
      }
    }, 0);
  };
  const registry = await readProjectRegistry();

  const skipPath = (p) => /\/(\.specstory|\.history|\.github)\//.test(p || "");
  const toPlainArray = (raw) => {
    if (typeof bridge.runtime?.toArray === "function") return bridge.runtime.toArray(raw);
    if (!raw) return [];
    try {
      if (typeof raw.array === "function") return raw.array();
    } catch (_) {}
    try {
      return Array.from(raw || []);
    } catch (_) {}
    try {
      if (typeof raw.length === "number") {
        const out = [];
        for (let i = 0; i < raw.length; i++) {
          if (raw[i] != null) out.push(raw[i]);
        }
        return out;
      }
    } catch (_) {}
    return [];
  };
  const normalizeDataTask = (item) => {
    const sourcePath = normalizePath(
      item?.source?.path
      || item?.identity?.sourcePath
      || item?.sourcePath
      || item?.path
      || item?.from
      || item?.file?.path
      || ""
    );
    const state = String(item?.checkbox?.state || item?.checkboxState || item?.status || "").trim();
    const completed = item?.completed === true || state === "done";
    const cancelled = state === "cancelled";
    const rawText = String(
      item?.text?.raw
      || item?.rawText
      || item?.text?.clean
      || item?.title
      || item?.text
      || ""
    ).trim();
    return {
      text: rawText,
      completed,
      cancelled,
      status: completed ? "done" : (cancelled ? "cancelled" : "open"),
      checkboxState: state === "in_progress" ? "in_progress" : (completed ? "done" : (cancelled ? "cancelled" : "todo")),
      due: String(item?.dates?.due || item?.due || "").slice(0, 10),
      scheduled: String(item?.dates?.scheduled || item?.scheduled || "").slice(0, 10),
      start: String(item?.dates?.start || item?.start || "").slice(0, 10),
      path: sourcePath,
      from: sourcePath,
      line: Number(item?.source?.line ?? item?.identity?.line ?? item?.line ?? 0) || 0,
      projectPath: normalizePath(item?.classification?.projectPath || ""),
      isHabit: item?.classification?.isHabit === true || /(^|\s)#habit(\s|$)/i.test(rawText)
    };
  };
  const getDataTaskRows = async () => {
    if (typeof bridge.data?.getTasks !== "function") return [];
    try {
      const result = await bridge.data.getTasks({
        rangePolicy: "allFacts",
        bucketBy: "active",
        status: "all"
      }, { ctx });
      return toPlainArray(result?.items)
        .map(normalizeDataTask)
        .filter((task) => task.text && task.path);
    } catch (err) {
      try { console.warn("[noria] dashboardGuideProjects data task source skipped", err); } catch (_) {}
      return [];
    }
  };
  const dataTaskRows = await getDataTaskRows();
  const hasDataTaskRows = dataTaskRows.length > 0;
  const taskMatchesProject = (task, proj) => {
    const taskPath = normalizePath(task?.path || task?.from || "");
    const projectPath = normalizePath(task?.projectPath || "");
    const projectRoot = normalizePath(proj?.root || "");
    const projectPages = new Set((proj?.pages || []).map(normalizePath));
    if (projectPath) {
      if (projectPath === projectRoot || projectPath.startsWith(`${projectRoot}/`)) return true;
      if (canonicalProjectKey(projectPath) === canonicalProjectKey(proj?.name)) return true;
    }
    if (proj?.singleFile) return projectPages.has(taskPath);
    return taskPath === projectRoot || taskPath.startsWith(`${projectRoot}/`);
  };
  const isCancelledTask = (task) =>
    task?.cancelled === true
    || String(task?.status || "") === "cancelled"
    || String(task?.checkboxState || "") === "cancelled";
  const isHabitTask = (task) =>
    task?.isHabit === true || /(^|\s)#habit(\s|$)/i.test(String(task?.text || ""));
  let allPages = [];
  try {
    allPages = toPlainArray(bridge.runtime?.pagesForManagedPath?.("projectsRoot", ctx)).filter((p) => !skipPath(p.file.path || ""));
  } catch (err) {
    try { console.warn("[noria] dashboardGuideProjects managed project scope skipped", err); } catch (_) {}
    allPages = [];
  }
  const fallbackProjectFiles = (app?.vault?.getMarkdownFiles?.() || [])
    .map((f) => ({ file: { path: f.path, name: f.name, tasks: [] } }))
    .filter((p) => {
      const path = String(p?.file?.path || "").replace(/\\/g, "/");
      return path.startsWith(`${projectsRoot}/`) && !skipPath(path);
    });
  const pagesSource = (allPages && allPages.length > 0) ? allPages : fallbackProjectFiles;
  const projectDebug = {
    projectsRoot,
    projectRegistryPath: projectListPath,
    source: (allPages && allPages.length > 0) ? "metadata" : "vault",
    candidateFileCount: pagesSource.length,
    metadataTaskCount: 0,
    fallbackTaskCount: 0,
    dataTaskCount: dataTaskRows.length,
    taskSource: hasDataTaskRows ? "data" : "fallback",
    projectCount: 0,
    projects: [],
    currentProject: null
  };
  const pageTasksByPath = new Map();
  const rootTasksByPath = new Map();
  pagesSource.forEach((p) => {
    const filePath = String(p?.file?.path || "").replace(/\\/g, "/");
    if (!filePath || skipPath(filePath)) return;
    const taskRows = toPlainArray(p?.file?.tasks).map((t) => ({ ...t, from: filePath }));
    pageTasksByPath.set(filePath, taskRows);
    const projectInfo = getProjectInfoFromPath(filePath);
    if (projectInfo && !projectInfo.singleFile) {
      const root = projectInfo.root;
      const prev = rootTasksByPath.get(root) || [];
      rootTasksByPath.set(root, prev.concat(taskRows));
    }
  });
  const cleanTask = (txt) =>
    String(txt || "")
      .replace(/\s*#\S+/g, "")
      .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
      .replace(/\[\[([^\]]+)\]\]/g, (_, p1) => String(p1 || "").split("/").pop())
      .replace(/^\s*[-*]\s*\[[^\]]*\]\s*/i, "")
      .replace(/(?:📅|⏳|🛫|➕|✅|❌)\s*\d{4}-\d{2}-\d{2}/g, "")
      .replace(/\b(?:due|scheduled|start|completion|created)::\s*\d{4}-\d{2}-\d{2}\b/gi, "")
      .replace(/\bpriority::\s*\S+\b/gi, "")
      .replace(/\[\s*\]/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();

  const toDateObj = (v) => {
    if (!v) return null;
    const s = String(v).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const d = new Date(`${s}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const today0 = new Date();
  today0.setHours(0, 0, 0, 0);
  const isInProgressTask = (t) => {
    if (String(t?.checkboxState || "") === "in_progress") return true;
    const text = String(t?.text || "");
    if (/进行中/.test(text)) return true;
    const start = toDateObj(t?.start) || toDateObj(t?.scheduled);
    const due = toDateObj(t?.due);
    if (start && due) return start.getTime() <= today0.getTime() && today0.getTime() <= due.getTime();
    if (start && !due) return start.getTime() <= today0.getTime();
    return false;
  };

  const projectMap = new Map();
  pagesSource.forEach((p) => {
    const projectInfo = getProjectInfoFromPath(p.file.path || "");
    if (!projectInfo) return;
    if (!projectInfo.singleFile) {
      const root = projectInfo.root;
      const name = projectInfo.name;
      if (!projectMap.has(root)) projectMap.set(root, { name, root, pages: [] });
      projectMap.get(root).pages.push(p.file.path);
      return;
    }
    if (projectInfo.singleFile) {
      const name = projectInfo.name;
      if (!projectMap.has(`__single__/${name}`)) {
        projectMap.set(`__single__/${name}`, { name, root: projectInfo.root, pages: [p.file.path], singleFile: true });
      }
    }
  });

  const projects = [...projectMap.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  const visibleProjects = projects.filter((proj) => {
    const key = canonicalProjectKey(proj.name);
    return !registry.hidden.has(key) && !registry.done.has(key);
  });
  const projectBuildRows = [];
  const projectBuildJobs = [];
  visibleProjects.forEach((proj, projectIndex) => {
    projectBuildJobs.push(async () => {
      const mocCandidate = proj.singleFile ? (proj.pages[0] || `${proj.root}/${proj.name}.md`) : `${proj.root}/${proj.name}.md`;
      const mocPath = app.vault.getAbstractFileByPath(mocCandidate)
        ? mocCandidate
        : (proj.pages.find((x) => x.endsWith("/README.md")) || proj.pages[0] || proj.root);
      const registryEntry = getRegistryEntry(registry, proj.name);
      const targetPath = normalizePath(registryEntry?.targetPath || "");
      const pathTasksFromData = hasDataTaskRows ? dataTaskRows.filter((task) => taskMatchesProject(task, proj)) : [];
      const pathTasksFromMetadata = hasDataTaskRows ? [] : (proj.singleFile
        ? (pageTasksByPath.get(String(proj.pages[0] || "").replace(/\\/g, "/")) || [])
        : (rootTasksByPath.get(proj.root) || []));
      const pathTasksFromFallback = hasDataTaskRows ? [] : await gatherTasksByRootFallback(proj.singleFile ? String(proj.pages[0] || "") : proj.root);
      const pathTasks = pathTasksFromData.concat(pathTasksFromMetadata, pathTasksFromFallback);
      const debugEntry = {
        name: proj.name,
        root: proj.root,
        pageCount: proj.pages.length,
        dataTaskCount: pathTasksFromData.length,
        metadataTaskCount: pathTasksFromMetadata.length,
        fallbackTaskCount: pathTasksFromFallback.length,
        total: 0,
        openCount: 0,
        stage: "active"
      };
      projectDebug.metadataTaskCount += pathTasksFromMetadata.length;
      projectDebug.fallbackTaskCount += pathTasksFromFallback.length;

      const uniqTask = new Map();
      pathTasks.forEach((t) => {
        const key = `${t.path || t.from}|${t.line || t.text}`;
        if (!uniqTask.has(key)) uniqTask.set(key, t);
      });
      const tasks = [...uniqTask.values()].filter((t) => t.text && !skipPath(t.path || t.from || "") && !isHabitTask(t) && !isCancelledTask(t));
      const done = tasks.filter((t) => t.completed || String(t.status || "") === "done").length;
      const total = tasks.length;
      const open = tasks
        .filter((t) => !t.completed && String(t.status || "") !== "done")
        .map((t) => ({ ...t, _inProgress: isInProgressTask(t) }))
        .sort((a, b) => Number(b._inProgress) - Number(a._inProgress));
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const projectKey = canonicalProjectKey(proj.name);
      const stage = registry.active.has(projectKey) ? "active" : (registry.planned.has(projectKey) ? "planned" : "active");
      const hasInProgress = open.some((t) => t._inProgress);
      debugEntry.total = total;
      debugEntry.openCount = open.length;
      debugEntry.stage = stage;
      projectDebug.projects.push(debugEntry);
      projectBuildRows[projectIndex] = { name: proj.name, mocPath, targetPath, done, total, open, pct, stage, hasInProgress, _debug: debugEntry };
    });
  });
  await runProjectGuideBuildQueue(projectBuildJobs);
  let projectData = projectBuildRows.filter(Boolean)
    .sort((a, b) => {
      const rank = (x) => (x.stage === "active" ? 0 : 1);
      return rank(a) - rank(b)
        || Number(b.hasInProgress) - Number(a.hasInProgress)
        || a.name.localeCompare(b.name, "zh-CN");
    });
  projectDebug.projectCount = projectData.length;
  globalThis.__noriaHomeProjectsLastDebug = projectDebug;

  if (projectData.length === 0) {
    const hasFolders = projects.length > 0;
    const hint = hasFolders
      ? projectsT("runtime.periodic.projects.emptyAllFiltered", { root: projectsRoot, path: projectListPath })
      : projectsT("runtime.periodic.projects.emptyNoFolders", { root: projectsRoot });
    host.createDiv({ text: hint }).style.cssText = "color:var(--text-muted);font-size:.92em;line-height:1.45;";
    return;
  }

  const wrap = host.createDiv();
  wrap.addClass?.("dashboard-project-workbench");
  wrap.style.cssText = "display:flex;flex-direction:column;gap:8px;min-height:0;flex:1;width:100%;";
  const bar = wrap.createDiv();
  bar.addClass?.("dashboard-project-chip-strip");
  bar.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;padding:2px 2px 0;flex-shrink:0;";
  const panel = wrap.createDiv();
  panel.addClass?.("dashboard-project-current-panel");
  panel.style.cssText =
    "border:1px solid color-mix(in srgb,rgba(99,102,241,.12),var(--background-modifier-border) 88%);border-radius:11px;padding:8px 10px;background:color-mix(in srgb,var(--background-primary) 98%,rgba(99,102,241,.03));box-shadow:none;flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;";

  const buttonRefs = [];
  const setBtn = (btn, active, stage, pct) => {
    const pctSafe = Math.max(0, Math.min(100, Number(pct) || 0));
    btn.addClass?.("dashboard-project-chip");
    btn.classList?.add?.("dashboard-project-chip");
    btn.classList?.toggle?.("dashboard-project-chip--active", !!active);
    btn.classList?.toggle?.("dashboard-project-chip--planned", stage === "planned");
    btn.setAttr?.("aria-pressed", active ? "true" : "false");
    btn.setAttribute?.("aria-pressed", active ? "true" : "false");
    btn.setAttr?.("data-project-stage", stage || "active");
    btn.setAttribute?.("data-project-stage", stage || "active");
    btn.style.cssText = "";
    btn.style.setProperty("--noria-project-progress", `${pctSafe}%`);
  };

  const appendProjectTaskRow = (parent, task, displayText, variant, opts = {}) => {
    const row = parent.createDiv();
    row.addClass("dashboard-project-task-row");
    const taskPath = normalizePath(task?.path || task?.from || "");
    const taskLine = Number(task?.line);
    let style = "display:flex;align-items:center;gap:7px;padding:3px 3px 3px 0;min-width:0;cursor:pointer;";
    if (opts.extraTopMargin) style += "margin-top:2px;";
    row.style.cssText = style;
    setNodeAttr(row, "role", "button");
    setNodeAttr(row, "tabindex", "0");
    setNodeAttr(row, "title", projectsT("runtime.periodic.projects.openTaskSource"));
    setNodeAttr(row, "data-noria-action-kind", "open-project-task-source");
    setNodeAttr(row, "data-noria-action-source", "home-project-guide");
    setNodeAttr(row, "data-noria-project-task-kind", variant || "task");
    setNodeAttr(row, "data-noria-project-task-status", task?.status || (task?.completed ? "done" : "open"));
    if (taskPath) setNodeAttr(row, "data-noria-project-task-source-path", taskPath);
    if (Number.isFinite(taskLine) && taskLine >= 0) setNodeAttr(row, "data-noria-project-task-source-line", String(Math.floor(taskLine)));
    const ring = row.createEl("input");
    ring.type = "checkbox";
    ring.checked = !!task.completed;
    ring.className = "task-list-item-checkbox noria-themed-checkbox noria-themed-checkbox--home";
    ring.setAttr("data-state", task.completed ? "done" : "default");
    ring.setAttr("aria-hidden", "true");
    ring.setAttr("tabindex", "-1");
    const textRow = row.createDiv();
    textRow.style.cssText =
      "flex:1;min-width:0;display:flex;align-items:center;justify-content:flex-start;gap:6px;overflow:hidden;min-height:0;";
    const textMain = document.createElement("div");
    textMain.className = "dashboard-task-title dashboard-task-title--one-line";
    textMain.textContent = displayText;
    textMain.style.cssText =
      "font-size:var(--dash-text-row-size,.86em);line-height:var(--dash-text-row-line,1.25);font-weight:var(--dash-text-row-weight,500);color:var(--text-normal);";
    textRow.appendChild(textMain);
    row.appendChild(textRow);
    const open = () => {
      void openTaskTarget(task);
    };
    row.onclick = (ev) => {
      ev.preventDefault();
      open();
    };
    row.onkeydown = (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        open();
      }
    };
  };

  const renderProject = (proj) => {
    panel.empty();
    panel.setAttr?.("data-project-open-count", String(proj.open.length));
    panel.setAttr?.("data-project-total-count", String(proj.total));
    globalThis.__noriaHomeProjectsLastDebug = {
      ...projectDebug,
      currentProject: {
        ...(proj._debug || {}),
        name: proj.name,
        stage: proj.stage,
        total: proj.total,
        openCount: proj.open.length,
        done: proj.done
      }
    };

    const nextRow = panel.createDiv();
    nextRow.addClass("dashboard-project-next-row");
    const nextTargetPath = normalizePath(proj?.targetPath || proj?.mocPath || "");
    const setNextState = (state) => {
      setNodeAttr(nextRow, "data-noria-project-next-state", state || "idle");
    };
    setNodeAttr(nextRow, "data-noria-project-next-row", "true");
    setNodeAttr(nextRow, "data-noria-project-name", proj.name);
    setNodeAttr(nextRow, "data-noria-project-stage", proj.stage || "active");
    if (nextTargetPath) setNodeAttr(nextRow, "data-noria-project-target-path", nextTargetPath);
    setNextState("idle");
    const nextInput = nextRow.createEl("input");
    nextInput.type = "text";
    nextInput.className = "dashboard-project-next-input";
    nextInput.setAttr?.("placeholder", projectsT("runtime.periodic.projects.nextPlaceholder"));
    nextInput.setAttribute?.("aria-label", projectsT("runtime.periodic.projects.nextAria", { name: proj.name }));
    setNodeAttr(nextInput, "data-noria-action-kind", "append-project-next-step");
    setNodeAttr(nextInput, "data-noria-action-source", "home-project-guide");
    setNodeAttr(nextInput, "data-noria-project-name", proj.name);
    setNodeAttr(nextInput, "data-noria-project-stage", proj.stage || "active");
    if (nextTargetPath) setNodeAttr(nextInput, "data-noria-project-target-path", nextTargetPath);
    const nextBtn = nextRow.createEl("button", { text: "+" });
    nextBtn.type = "button";
    nextBtn.className = "dashboard-project-next-add";
    nextBtn.setAttr?.("title", projectsT("runtime.periodic.projects.nextAdd", { name: proj.name }));
    setNodeAttr(nextBtn, "aria-label", projectsT("runtime.periodic.projects.nextAdd", { name: proj.name }));
    setNodeAttr(nextBtn, "data-noria-action-kind", "append-project-next-step");
    setNodeAttr(nextBtn, "data-noria-action-id", "project-next-step-add");
    setNodeAttr(nextBtn, "data-noria-action-source", "home-project-guide");
    setNodeAttr(nextBtn, "data-noria-project-name", proj.name);
    setNodeAttr(nextBtn, "data-noria-project-stage", proj.stage || "active");
    if (nextTargetPath) setNodeAttr(nextBtn, "data-noria-project-target-path", nextTargetPath);
    const setNextActionState = (state = "idle", error = "") => {
      const nextState = String(state || "idle");
      const message = String(error || "").trim();
      [nextInput, nextBtn].forEach((node) => {
        setNodeAttr(node, "data-noria-action-state", nextState);
        if (nextState === "pending") setNodeAttr(node, "aria-busy", "true");
        else removeNodeAttr(node, "aria-busy");
        if (message) setNodeAttr(node, "data-noria-action-error", message);
        else removeNodeAttr(node, "data-noria-action-error");
      });
    };
    setNextActionState("idle");
    let nextSubmitting = false;
    const submitNext = async () => {
      const text = String(nextInput.value || "").trim();
      if (nextSubmitting) return;
      if (!text) {
        await appendProjectNextStep(proj, text);
        return;
      }
      nextSubmitting = true;
      nextInput.disabled = true;
      nextBtn.disabled = true;
      setNextState("saving");
      setNextActionState("pending");
      let created = null;
      let failed = false;
      try {
        created = await appendProjectNextStep(proj, text);
      } catch (err) {
        failed = true;
        const message = String(err?.message || err || "failed");
        setNextState("error");
        setNextActionState("failed", message);
        notifyProject("runtime.periodic.projects.nextAddFailed", { message }, 2600);
      } finally {
        if (!created) {
          nextSubmitting = false;
          nextInput.disabled = false;
          nextBtn.disabled = false;
          if (!failed) {
            setNextState("idle");
            setNextActionState("idle");
          }
        }
      }
      if (!created) return;
      setNextActionState("ok");
      nextInput.value = "";
      proj.open.unshift(created);
      proj.total += 1;
      proj.pct = proj.total > 0 ? Math.round((proj.done / proj.total) * 100) : 0;
      renderProject(proj);
    };
    nextBtn.onclick = async (ev) => {
      ev?.preventDefault?.();
      ev?.stopPropagation?.();
      await submitNext();
    };
    nextInput.addEventListener("keydown", async (ev) => {
      if (ev.key !== "Enter" || ev.shiftKey || ev.isComposing) return;
      ev.preventDefault?.();
      await submitNext();
    });

    const listWrap = panel.createDiv();
    listWrap.addClass("dashboard-project-task-list");
    listWrap.setAttr?.("data-project-open-count", String(proj.open.length));
    listWrap.style.cssText = "display:flex;flex-direction:column;gap:6px;";
    listWrap.setAttr(
      "title",
      proj.total > 0
        ? projectsT("runtime.periodic.projects.taskStats", { done: proj.done, total: proj.total, pct: proj.pct })
        : projectsT("runtime.periodic.projects.noTaskStats")
    );
    if (proj.open.length === 0) {
      const emptyKey = proj.stage === "active"
        ? "runtime.periodic.projects.emptyActiveProjectTasks"
        : "runtime.periodic.projects.emptyPlanTasks";
      const empty = listWrap.createDiv({ text: projectsT(emptyKey, { name: proj.name }) });
      empty.style.cssText =
        "padding:6px 4px;color:var(--text-muted);font-size:.86em;line-height:1.35;";
    } else {
      const inProgress = proj.open.filter((t) => t._inProgress).slice(0, 8);
      const backlog = proj.open.filter((t) => !t._inProgress).slice(0, 8);
      if (inProgress.length) {
        const h = listWrap.createDiv({ text: projectsT("runtime.periodic.projects.inProgress") });
        h.style.cssText =
          "display:inline-flex;align-self:flex-start;padding:1px 8px;border-radius:999px;background:rgba(56,189,248,.14);border:1px solid rgba(56,189,248,.3);font-size:.8em;font-weight:600;color:#075985;";
        inProgress.forEach((t) => appendProjectTaskRow(listWrap, t, cleanTask(t.text), "inProgress"));
      }
      if (backlog.length) {
        const firstMargin = inProgress.length > 0;
        backlog.forEach((t, i) =>
          appendProjectTaskRow(listWrap, t, cleanTask(t.text), "backlog", { extraTopMargin: firstMargin && i === 0 })
        );
      }
    }
  };

  const rebuild = (selectedName) => {
    bar.empty();
    buttonRefs.length = 0;
    if (projectData.length === 0) {
      panel.empty();
      panel.createEl("div", { text: projectsT("runtime.periodic.projects.emptyActive") });
      return;
    }
    projectData.forEach((proj) => {
      const label = proj.stage === "planned" ? `${proj.name}*` : proj.name;
      const btn = bar.createEl("button", { text: label });
      btn.type = "button";
      setBtn(btn, false, proj.stage, proj.pct);
      btn.setAttr("title", projectsT("runtime.periodic.projects.progressTitle", {
        name: proj.name,
        done: proj.done,
        total: proj.total,
        pct: proj.pct
      }));
      btn.onclick = () => {
        closeProjectMenu();
        buttonRefs.forEach((x) => setBtn(x.btn, x.name === proj.name, x.stage, x.pct));
        renderProject(proj);
      };
      btn.ondblclick = async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        closeProjectMenu();
        await openProjectNote(proj);
      };
      btn.oncontextmenu = async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        openProjectQuickMenu(proj, btn, () => {
          removeProjectFromView(proj.name);
          rebuild(projectData[0]?.name || "");
        });
      };
      btn.onmouseup = (ev) => {
        if (ev.button !== 2) return;
        ev.preventDefault();
        ev.stopPropagation();
        openProjectQuickMenu(proj, btn, () => {
          removeProjectFromView(proj.name);
          rebuild(projectData[0]?.name || "");
        });
      };
      buttonRefs.push({ name: proj.name, stage: proj.stage, pct: proj.pct, btn });
    });
    const target = projectData.find((x) => x.name === selectedName) || projectData[0];
    buttonRefs.forEach((x) => setBtn(x.btn, x.name === target.name, x.stage, x.pct));
    renderProject(target);
  };

  rebuild(projectData[0].name);
})();
