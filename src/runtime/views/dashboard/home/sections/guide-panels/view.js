(async () => {
  async function loadText(path) {
    try {
      const txt = await ctx.io.load(path);
      if (txt) return String(txt);
    } catch (_) {}
    try {
      const normalized = String(path || "").replace(/\\/g, "/").replace(/^\/+/, "");
      return String(await app.vault.adapter.read(normalized) || "");
    } catch (_) {
      return "";
    }
  }

  function getHomeChildViewRuntimeBuildId() {
    return String(
      input?.noriaBridge?.runtimeBuildId ||
      globalThis.__noriaRuntimeBridge?.runtimeBuildId ||
      globalThis.__noriaRuntimeBuildId ||
      ""
    );
  }

  function getHomeChildViewLoaderState() {
    const runtimeBuildId = getHomeChildViewRuntimeBuildId();
    try {
      const key = "__noriaHomeChildViewLoaderV1";
      const current = globalThis[key];
      if (!current || current.runtimeBuildId !== runtimeBuildId) {
        globalThis[key] = {
          runtimeBuildId,
          sourceTextCache: new Map(),
          sourceTextPending: new Map(),
          runnerCache: new Map()
        };
      }
      return globalThis[key];
    } catch (_) {
      return {
        runtimeBuildId,
        sourceTextCache: new Map(),
        sourceTextPending: new Map(),
        runnerCache: new Map()
      };
    }
  }

  function hashHomeChildViewSource(value) {
    const text = String(value || "");
    let h = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(36);
  }

  async function loadHomeChildViewSource(path) {
    const normalized = String(path || "").replace(/\\/g, "/").replace(/^\/+/, "");
    const perf = input?.noriaBridge?.performance || globalThis.__noriaRuntimeBridge?.performance || {};
    if (perf.viewSourceCache === false) return loadText(normalized);
    const state = getHomeChildViewLoaderState();
    if (state.sourceTextCache?.has?.(normalized)) return state.sourceTextCache.get(normalized);
    if (state.sourceTextPending?.has?.(normalized)) return await state.sourceTextPending.get(normalized);
    const pending = loadText(normalized)
      .then((code) => {
        const text = String(code || "");
        if (text) state.sourceTextCache.set(normalized, text);
        return text;
      })
      .finally(() => {
        try { state.sourceTextPending.delete(normalized); } catch (_) {}
      });
    state.sourceTextPending.set(normalized, pending);
    return await pending;
  }

  function getHomeChildViewRunner(sourcePath, sourceCode) {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const perf = input?.noriaBridge?.performance || globalThis.__noriaRuntimeBridge?.performance || {};
    if (perf.viewSourceCache === false) {
      return new AsyncFunction("ctx", "input", "app", "moment", "window", "document", "globalThis", String(sourceCode));
    }
    const state = getHomeChildViewLoaderState();
    const key = `${String(sourcePath || "")}:${hashHomeChildViewSource(sourceCode)}`;
    let run = state.runnerCache?.get?.(key);
    if (!run) {
      run = new AsyncFunction("ctx", "input", "app", "moment", "window", "document", "globalThis", String(sourceCode));
      state.runnerCache.set(key, run);
      if (state.runnerCache.size > 64) {
        const firstKey = state.runnerCache.keys().next().value;
        if (firstKey) state.runnerCache.delete(firstKey);
      }
    }
    return run;
  }

  async function runCustomViewByPath(viewPath, viewInput) {
    const normalized = String(viewPath || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    if (!normalized) throw new Error("empty custom view path");
    const candidates = normalized.toLowerCase().endsWith(".js")
      ? [normalized]
      : [`${normalized}.js`, `${normalized}/view.js`];
    let sourcePath = "";
    let loadedSourceCode = "";
    for (const candidate of candidates) {
      const sourceCode = await loadHomeChildViewSource(candidate);
      if (sourceCode) {
        sourcePath = candidate;
        loadedSourceCode = sourceCode;
        break;
      }
    }
    if (!loadedSourceCode) throw new Error(`Custom view failed to load: ${normalized}`);
    const run = getHomeChildViewRunner(sourcePath, loadedSourceCode);
    await run(ctx, viewInput || {}, app, window.moment, window, document, globalThis);
  }

  const norm = (p) => String(p || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const runtimeBridge = input?.noriaBridge || globalThis.__noriaRuntimeBridge || {};
  function homeRuntimeT(key, params = {}) {
    try {
      if (runtimeBridge && typeof runtimeBridge.t === "function") {
        const direct = runtimeBridge.t(key, params);
        if (direct && direct !== key) return String(direct);
      }
    } catch (_) {}
    try {
      const i18n = runtimeBridge && runtimeBridge.i18n ? runtimeBridge.i18n : null;
      const messages = (i18n && i18n.messages) || {};
      const fallback = (i18n && i18n.fallback) || {};
      const raw = messages[key] || fallback[key] || key;
      return String(raw).replace(/\{([^}]+)\}/g, (_, name) => (params[name] == null ? "" : String(params[name])));
    } catch (_) {
      return String(key || "");
    }
  }
  const projectListPath = String(runtimeBridge.paths?.projectRegistryPath || "Noria/Projects.md");
  const projectsRoot = norm(runtimeBridge.paths?.projectsRoot || "01_Projects").replace(/\/+$/, "");
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const HOME_REFRESH_BUS_KEY = "__noriaHomeRefreshBus";

  function getHomeRefreshBus() {
    const g = globalThis;
    if (g[HOME_REFRESH_BUS_KEY]) return g[HOME_REFRESH_BUS_KEY];
    const listeners = new Map();
    const pending = new Map();
    const bus = {
      on(section, fn) {
        if (!section || typeof fn !== "function") return () => {};
        const set = listeners.get(section) || new Set();
        set.add(fn);
        listeners.set(section, set);
        return () => {
          const cur = listeners.get(section);
          if (!cur) return;
          cur.delete(fn);
          if (cur.size === 0) listeners.delete(section);
        };
      },
      emit(section, delay = 40) {
        if (!section) return;
        const wait = Math.max(0, Number(delay) || 0);
        const old = pending.get(section);
        if (old) clearTimeout(old);
        const t = setTimeout(async () => {
          pending.delete(section);
          const set = listeners.get(section);
          if (!set || set.size === 0) return;
          for (const fn of [...set]) {
            try {
              await fn();
            } catch (_) {}
          }
        }, wait);
        pending.set(section, t);
      }
    };
    g[HOME_REFRESH_BUS_KEY] = bus;
    return bus;
  }

  function createManagerUiKit() {
    const shared = globalThis.dashboardCore?.components?.ui?.managerPanel || globalThis.__noriaManagerUiKit;
    if (shared) return shared;
    const styles = {
      overlay:
        "position:fixed;inset:0;background:rgba(15,23,42,.32);z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px;",
      panel:
    "background:var(--dash-surface,color-mix(in srgb,var(--background-primary) 99%,var(--background-secondary)));border:1px solid color-mix(in srgb,var(--background-modifier-border) 86%,rgba(148,163,184,.14));border-radius:16px;box-shadow:0 8px 24px rgba(15,23,42,.16);",
      input:
    "height:28px;border-radius:8px;border:1px solid rgba(99,102,241,.2);padding:0 8px;background:color-mix(in srgb,var(--background-primary) 92%,var(--background-secondary));color:var(--text-normal);font-size:.82em;outline:none;box-sizing:border-box;",
      btn: {
        neutral:
          "height:26px;padding:0 10px;border-radius:8px;border:1px solid rgba(148,163,184,.24);background:color-mix(in srgb,var(--background-primary) 90%, rgba(241,245,249,.85));color:var(--text-muted);font-size:.75em;font-weight:620;cursor:pointer;",
        primary:
          "height:26px;padding:0 10px;border-radius:8px;border:1px solid rgba(67,56,202,.3);background:color-mix(in srgb,var(--background-primary) 84%, rgba(224,231,255,.92));color:#3730a3;font-size:.75em;font-weight:700;cursor:pointer;",
        danger:
          "height:26px;padding:0 9px;border-radius:8px;border:1px solid rgba(148,163,184,.28);background:color-mix(in srgb,var(--background-primary) 88%, rgba(226,232,240,.9));color:color-mix(in srgb,var(--text-normal) 72%, rgba(71,85,105,.82));font-size:.75em;font-weight:700;cursor:pointer;"
      }
    };
    const mkBtn = (txt, variant = "neutral") => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = txt;
      b.style.cssText = styles.btn[variant] || styles.btn.neutral;
      b.onmouseenter = () => { b.style.filter = "brightness(1.03)"; };
      b.onmouseleave = () => { b.style.filter = ""; };
      b.onfocus = () => { b.style.boxShadow = "0 0 0 2px rgba(99,102,241,.22)"; };
      b.onblur = () => { b.style.boxShadow = ""; };
      return b;
    };
    const enhanceInput = (el) => {
      el.style.cssText = styles.input;
      el.onfocus = () => { el.style.boxShadow = "0 0 0 2px rgba(99,102,241,.16)"; };
      el.onblur = () => { el.style.boxShadow = ""; };
      return el;
    };
    const kit = { styles, mkBtn, enhanceInput };
    globalThis.__noriaManagerUiKit = kit;
    return kit;
  }

  function paintIcon(el, iconId) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
    el.textContent = "";
    try {
      if (typeof setIcon === "function") {
        setIcon(el, iconId);
        if (!el.querySelector || el.querySelector("svg")) return;
      }
    } catch (_) {}
    try {
      const api = globalThis?.obsidian || window?.obsidian || ((typeof window?.require === "function") ? window.require("obsidian") : null);
      if (api && typeof api.setIcon === "function") {
        api.setIcon(el, iconId);
        if (!el.querySelector || el.querySelector("svg")) return;
      }
    } catch (_) {}
    const fn = globalThis.dashboardCore?.utils?.applyLucideIcon;
    if (typeof fn === "function") {
      fn(el, iconId);
      return;
    }
    const fallback = {
      search: "⌕",
      "arrow-up": "↑",
      "arrow-down": "↓",
      "trash-2": "×",
      x: "×"
    };
    el.textContent = fallback[iconId] || "";
  }

  async function openFilePath(path) {
    const p = norm(path);
    const f = app.vault.getAbstractFileByPath(p);
    if (!f) {
      new Notice(homeRuntimeT("runtime.home.notice.missingPath", { path: p }), 4500);
      return;
    }
    return runtimeBridge.runtime.openHomeSource(p);
  }

  async function pickVaultPathWithSuggest(initialQuery = "") {
    let obsidian = null;
    try {
      if (typeof require !== "undefined") obsidian = require("obsidian");
    } catch (_) {}
    const FuzzySuggestModal = obsidian?.FuzzySuggestModal;
    if (typeof FuzzySuggestModal !== "function") return "";
    const files = (input?.noriaBridge?.runtime?.filesForScope?.("notes") || []).filter((f) => {
      const p = String(f?.path || "").toLowerCase();
      return p.endsWith(".md") || p.endsWith(".canvas");
    });
    const preferred = normalizePath(initialQuery || "");
    return await new Promise((resolve) => {
      let done = false;
      const finish = (val) => {
        if (done) return;
        done = true;
        resolve(String(val || ""));
      };
      class VaultFileSuggestModal extends FuzzySuggestModal {
        constructor() {
          super(app);
          this.setPlaceholder(homeRuntimeT("runtime.home.moc.pathPicker"));
          if (preferred) this.inputEl.value = preferred;
        }
        getItems() {
          return files;
        }
        getItemText(file) {
          return String(file?.path || "");
        }
        onChooseItem(file) {
          finish(String(file?.path || ""));
        }
        onClose() {
          super.onClose();
          finish("");
        }
      }
      new VaultFileSuggestModal().open();
    });
  }

  function openAddMocPanel(onSaved) {
    const bridge=globalThis.__noriaRuntimeBridge;
    const text=(zh,en)=>/^zh/.test(bridge.locale)?zh:en;
    const update=async(mutator)=>{
      const current=bridge.getMocEntries(), next=current.map(entry=>({...entry}));mutator(next);
      await bridge.setMocEntries(next,{expectedEntries:current});if(onSaved)await onSaved();
    };
    return bridge.runtime.openRecordManager({title:homeRuntimeT("runtime.home.moc.managerTitle"),
      list:async()=>bridge.getMocEntries().map(row=>({...row,id:row.path,name:row.path.split("/").pop().replace(/\.(md|canvas)$/i,"")})),
      summary:row=>row.path,defaults:()=>({path:"",color:"#6366f1"}),
      fields:[{key:"path",label:homeRuntimeT("runtime.home.moc.path"),type:"file",fileType:"moc",required:true},{key:"color",label:homeRuntimeT("runtime.home.moc.color"),type:"color"}],
      save:async(draft,original)=>{
        const path=String(draft.path||"").trim().replace(/\\/g,"/");const file=app.vault.getAbstractFileByPath(path);
        if(!file||!["md","canvas","base"].includes(file.extension))throw Error(text("请选择已有笔记或视图","Choose an existing note or view"));
        await update(entries=>{const index=original?entries.findIndex(e=>e.path===original.path):-1;
          if(original&&(index<0||entries[index].color!==original.color))throw Error(text("此入口已更改，请返回列表重试。","This entry changed. Return to the list and try again."));
          if(entries.some((e,i)=>e.path===path&&i!==index))throw Error(homeRuntimeT("runtime.home.moc.duplicate"));
          const entry={path,color:draft.color};if(index<0)entries.push(entry);else entries[index]=entry;
        });
      },
      removeLabel:homeRuntimeT("runtime.home.moc.removeEntry"),remove:row=>update(entries=>{const i=entries.findIndex(e=>e.path===row.path);if(i>=0)entries.splice(i,1);}),
      actions:row=>[[-1,"arrow-up","runtime.home.moc.moveUp"],[1,"arrow-down","runtime.home.moc.moveDown"]].map(([delta,icon,key])=>({icon,label:homeRuntimeT(key),run:()=>update(entries=>{const i=entries.findIndex(e=>e.path===row.path),j=i+delta;if(i>=0&&j>=0&&j<entries.length)[entries[i],entries[j]]=[entries[j],entries[i]];})}))
    });
  }

  const PROJECT_LIST_PATH = projectListPath;
  const projectsUseChinese = /^zh(?:-|$)/i.test(String(runtimeBridge.locale || runtimeBridge.i18n?.locale || "en"));
  const PROJECT_SECTION_ALIASES = {
    hidden: ["项目隐藏清单", "Hidden projects"],
    active: ["进行中的项目", "Active projects"],
    planned: ["计划中的项目", "Planned projects"],
    done: ["已完成的项目", "Completed projects"]
  };
  const PROJECT_SECTIONS = {
    hidden: PROJECT_SECTION_ALIASES.hidden[projectsUseChinese ? 0 : 1],
    active: PROJECT_SECTION_ALIASES.active[projectsUseChinese ? 0 : 1],
    planned: PROJECT_SECTION_ALIASES.planned[projectsUseChinese ? 0 : 1],
    done: PROJECT_SECTION_ALIASES.done[projectsUseChinese ? 0 : 1]
  };
  const projectSectionAliases = (title) => {
    const raw = String(title || "").trim();
    return Object.values(PROJECT_SECTION_ALIASES).find((group) => group.includes(raw)) || [raw];
  };
  const DEFAULT_PROJECT_FRONT = [
    "---",
    "tags:",
    "  - dashboard",
    "  - projects",
    "  - moc",
    "related:",
    "  - \"[[0_看板-主页]]\"",
    "---"
  ].join("\n");
  const normalizeName = (txt) => String(txt || "").trim();
  const normalizePath = (txt) => String(txt || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  const isPlaceholderName = (name) => {
    const n = normalizeName(name);
    if (!n) return true;
    if (n === "（空）" || n === "(空)" || /^\(?\s*empty\s*\)?$/i.test(n)) return true;
    if (/^[（(]?\s*空\s*[)）]?$/u.test(n)) return true;
    return false;
  };
  const parseProjectItem = (line) => {
    const previousStage=String(line || "").match(/<!-- noria-stage:(active|planned|done) -->/)?.[1] || "";
    const raw = String(line || "").replace(/<!-- noria-stage:(?:active|planned|done) -->/g, "").replace(/^-+\s*/, "").trim();
    const m = raw.match(/^\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/);
    if (m) {
      const path = normalizePath(m[1] || "");
      const description = raw.slice(m[0].length);
      const projSeg = path.match(new RegExp(`${projectsRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/([^/]+)`));
      if (projSeg) return { name: normalizeName(m[2] || projSeg[1]), targetPath: path, description, previousStage };
      const alias = normalizeName(m[2] || "");
      if (alias) return { name: alias, targetPath: path, description, previousStage };
      return { name: normalizeName(path.split("/").pop().replace(/\.(md|canvas)$/i,"")), targetPath: path, description, previousStage };
    }
    return { name: normalizeName(raw), targetPath: "", previousStage };
  };
  const stripFrontmatter = (text) => {
    const s = String(text || "").trimStart();
    if (!s.startsWith("---")) return { front: "", body: s };
    const end = s.indexOf("\n---", 3);
    if (end === -1) return { front: "", body: s };
    return { front: s.slice(0, end + 4).trimEnd(), body: s.slice(end + 4).replace(/^\s+/, "") };
  };
  const toEntryMap = (items) => {
    const map = new Map();
    (items || []).forEach((item) => {
      const name = normalizeName(item?.name || "");
      if (!name || isPlaceholderName(name)) return;
      map.set(name, { name, targetPath: normalizePath(item?.targetPath || ""), description:item.description || "", previousStage:item.previousStage || "" });
    });
    return map;
  };
  const getSectionItemMap = (content, title) => {
    let block = "";
    for (const candidate of projectSectionAliases(title)) {
      const escaped = String(candidate || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      block = (String(content || "").match(new RegExp(`##\\s*${escaped}[\\s\\S]*?(?=\\n##\\s|$)`)) || [])[0] || "";
      if (block) break;
    }
    const items = block
      .split("\n")
      .map((x) => x.trim())
      .filter((x) => /^-\s+/.test(x))
      .map(parseProjectItem);
    return toEntryMap(items);
  };
  const cloneRegistry = (reg) => ({
    hidden: new Map(reg.hidden),
    active: new Map(reg.active),
    planned: new Map(reg.planned),
    done: new Map(reg.done)
  });
  const getRegistryEntry = (registry, name) => {
    const n = normalizeName(name);
    return registry.active.get(n) || registry.planned.get(n) || registry.hidden.get(n) || registry.done.get(n) || null;
  };
  const setStageEntry = (registry, stage, entry) => {
    const n = normalizeName(entry?.name || "");
    if (!n) return;
    const payload = { name: n, targetPath: normalizePath(entry?.targetPath || ""), description:entry.description || "", previousStage:stage === "hidden" ? entry.previousStage || "" : "" };
    registry.hidden.delete(n);
    registry.active.delete(n);
    registry.planned.delete(n);
    registry.done.delete(n);
    if (stage === "hidden") registry.hidden.set(n, payload);
    else if (stage === "done") registry.done.set(n, payload);
    else if (stage === "planned") registry.planned.set(n, payload);
    else registry.active.set(n, payload);
  };
  const parseProjectRegistry = (raw) => {
    const { body } = stripFrontmatter(raw);
    const content = body || raw;
    return {
      hidden: getSectionItemMap(content, PROJECT_SECTIONS.hidden),
      active: getSectionItemMap(content, PROJECT_SECTIONS.active),
      planned: getSectionItemMap(content, PROJECT_SECTIONS.planned),
      done: getSectionItemMap(content, PROJECT_SECTIONS.done)
    };
  };
  const readProjectRegistry = async () => {
    const file = app.vault.getAbstractFileByPath(PROJECT_LIST_PATH);
    const raw = file ? await app.vault.read(file) : "";
    return { file, registry: parseProjectRegistry(raw) };
  };
  const buildProjectBody = (reg) => {
    const rows = (map) => [...(map || new Map()).values()]
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
      .map((x) => {
        const name = normalizeName(x?.name || "");
        if (!name) return "";
        const targetPath = normalizePath(x?.targetPath || "");
        return (targetPath ? `- [[${targetPath}|${name}]]` : `- ${name}`)+(x.description || "")+(x.previousStage ? ` <!-- noria-stage:${x.previousStage} -->` : "");
      })
      .filter(Boolean)
      .join("\n");
    return [
      "# Projects",
      "",
      projectsUseChinese
        ? "> 用于主页看板：分组维护项目；点「+」在项目管理里添加、隐藏或从清单移除。"
        : "> Organize Home projects by stage. Use + to add, hide, or remove projects from the registry.",
      "",
      `## ${PROJECT_SECTIONS.hidden}`,
      "",
      rows(reg.hidden) || (projectsUseChinese ? "- （空）" : "- (empty)"),
      "",
      `## ${PROJECT_SECTIONS.active}`,
      "",
      rows(reg.active) || (projectsUseChinese ? "- （空）" : "- (empty)"),
      "",
      `## ${PROJECT_SECTIONS.planned}`,
      "",
      rows(reg.planned) || (projectsUseChinese ? "- （空）" : "- (empty)"),
      "",
      `## ${PROJECT_SECTIONS.done}`,
      "",
      rows(reg.done) || (projectsUseChinese ? "- （空）" : "- (empty)"),
      ""
    ].join("\n");
  };
  const processProjectRegistry = async (mutator) => {
    let changed = false;
    const apply = (current) => {
      const source = String(current || "");
      const registry = parseProjectRegistry(source);
      const result = typeof mutator === "function" ? mutator(registry) : true;
      if (result === false) return source;
      changed = true;
      const { front } = stripFrontmatter(source);
      const fm = front || DEFAULT_PROJECT_FRONT;
      if(!source.trim())return `${fm}\n\n${buildProjectBody(registry)}`;
      const generated=buildProjectBody(registry);
      let output=source;
      for(const stage of ["hidden","active","planned","done"]){
        const title=PROJECT_SECTIONS[stage],aliases=projectSectionAliases(title);
        const lines=output.split("\n");let start=lines.findIndex(line=>aliases.some(name=>line.trim()===`## ${name}`));
        const newLines=generated.split("\n"),from=newLines.findIndex(line=>line===`## ${title}`);let to=from+1;while(to<newLines.length&&!/^#{1,2}\s/.test(newLines[to]))to++;
        const rows=newLines.slice(from+1,to).filter(line=>/^-\s/.test(line));
        if(start<0){output=output.trimEnd()+`\n\n## ${title}\n\n`+rows.join("\n")+"\n";continue;}
        let end=start+1;while(end<lines.length&&!/^#{1,2}\s/.test(lines[end]))end++;
        const body=lines.slice(start+1,end),first=body.findIndex(line=>/^-\s/.test(line));
        const kept=body.filter(line=>!/^[-]\s/.test(line));kept.splice(first<0?0:Math.min(first,kept.length),0,...rows);
        lines.splice(start+1,end-start-1,...kept);output=lines.join("\n");
      }
      return output;
    };

    let file = app.vault.getAbstractFileByPath(PROJECT_LIST_PATH);
    let created = false;
    if (!file) {
      const initial = apply("");
      if (!changed) return false;
      try {
        file = await app.vault.create(PROJECT_LIST_PATH, initial);
        created = true;
      } catch (error) {
        const message = String(error?.message || error || "");
        file = app.vault.getAbstractFileByPath(PROJECT_LIST_PATH);
        if (!file && !/File already exists|already exists/i.test(message)) throw error;
        if (!file) throw error;
      }
    }
    if (!created) {
      if (typeof app.vault.process === "function") {
        await app.vault.process(file, apply);
      } else {
        const current = String(await app.vault.read(file) || "");
        const next = apply(current);
        if (next !== current) await app.vault.modify(file, next);
      }
    }
    if (!changed) return false;
    try { getHomeRefreshBus().emit("projects", 20); } catch (_) {}
    try {
      globalThis.__noriaRuntimeBridge?.refresh?.requestRefresh?.("home", "project-registry-write");
    } catch (_) {}
    return true;
  };
  const deleteProjectEntry = async (name) => {
    const n = normalizeName(name);
    if (!n) return false;
    return processProjectRegistry((registry) => {
      if (!getRegistryEntry(registry, n)) return false;
      registry.hidden.delete(n);
      registry.active.delete(n);
      registry.planned.delete(n);
      registry.done.delete(n);
      return true;
    });
  };
  function openManageProjectPanel(initial=false) {
    const text=(zh,en)=>projectsUseChinese?zh:en;
    const stages=["active","planned","hidden","done"].map(value=>({value,label:homeRuntimeT("runtime.home.project."+value)}));
    return runtimeBridge.runtime.openRecordManager({title:homeRuntimeT("runtime.home.project.managerTitle"),initial,initialFilter:"active",filters:stages,
      list:async()=>{const {registry}=await readProjectRegistry();return ["active","planned","hidden","done"].flatMap(stage=>[...registry[stage].values()].map(row=>({...row,id:row.name,stage,path:row.targetPath})));},
      label:row=>row.name.replace(/^\[\[([^|\]]+)(?:\|([^\]]+))?\]\]$/,(_,path,alias)=>alias||path.split("/").pop().replace(/\.md$/i,"")),
      summary:row=>String(row.description||"").replace(/^[\s:：—–-]+/,"")||(!row.targetPath?text("尚未指定源笔记","No source note selected"):""),
      defaults:()=>({name:"",targetPath:"",stage:"planned",sourceMode:"existing"}),
      fields:record=>[
        ...(!record.id?[{key:"sourceMode",label:text("源笔记","Source note"),type:"select",refresh:true,options:[{value:"existing",label:text("选择已有笔记","Choose an existing note")},{value:"new",label:text("新建项目笔记","Create a project note")}]}]:[]),
        {key:"targetPath",label:text("项目源笔记","Project source note"),type:"file",fileType:"project",required:true,when:d=>d.sourceMode!=="new",onChange:(draft,inputs,previousPath)=>{const title=path=>String(path||"").replace(/\\/g,"/").split("/").pop().replace(/\.(md|canvas)$/i,"");if(!draft.name||draft.name===title(previousPath)){const name=title(draft.targetPath);inputs.get("name").value=name;draft.name=name;}}},
        {key:"name",label:text("显示名称","Display name"),required:true},
        {key:"stage",label:text("阶段","Stage"),type:"select",options:stages,required:true}
      ],
      save:async(draft,original)=>{
        const name=normalizeName(draft.name);let targetPath=normalizePath(draft.targetPath);
        if(!name||/[\n\r|\[\]]/.test(name))throw Error(text("请输入清楚的项目名称","Enter a plain project name"));
        if(!original&&draft.sourceMode==="new"){
          if(/[\\/:*?"<>|]/.test(name)||name==="."||name==="..")throw Error(text("名称不能包含路径符号","Use a name without path separators"));
          const {registry}=await readProjectRegistry();if(getRegistryEntry(registry,name))throw Error(text("已有同名入口","An entry with this name already exists"));
          targetPath=`${projectsRoot}/${name}/${name}.md`;
          if(app.vault.getAbstractFileByPath(targetPath))throw Error(text("笔记已存在，请选择已有笔记。","The note exists. Choose it as an existing note."));
          const parts=targetPath.split("/");parts.pop();let folder="";for(const part of parts){folder=folder?`${folder}/${part}`:part;if(!app.vault.getAbstractFileByPath(folder))await app.vault.createFolder(folder);}
          await app.vault.create(targetPath,text("## 概览\n\n## 任务\n\n## 输出\n","## Overview\n\n## Tasks\n\n## Output\n"));
        }
        const source=app.vault.getAbstractFileByPath(targetPath);if(!source||!["md","canvas"].includes(source.extension))throw Error(text("请选择已有的项目笔记或 Canvas","Choose an existing project note or Canvas"));
        await processProjectRegistry(registry=>{
          const current=original&&getRegistryEntry(registry,original.name);
          if(original&&(!current||current.targetPath!==original.targetPath||["active","planned","hidden","done"].find(stage=>registry[stage].has(original.name))!==original.stage))throw Error(text("此入口已在别处修改，请返回列表重试。","This entry changed elsewhere. Return to the list and try again."));
          if(name!==original?.name&&getRegistryEntry(registry,name))throw Error(text("已有同名入口","An entry with this name already exists"));
          if(original&&name!==original.name)for(const map of Object.values(registry))map.delete(original.name);
          const previousStage=draft.stage==="hidden"?(original?.stage!=="hidden"?original?.stage:current?.previousStage):"";
          setStageEntry(registry,draft.stage,{name,targetPath,previousStage,description:current?.description||""});return true;
        });
      },
      removeLabel:text("移除入口","Remove entry"),remove:async row=>deleteProjectEntry(row.name),
      actions:row=>row.stage==="hidden"&&row.previousStage?[{label:text("恢复到原阶段","Restore previous stage"),icon:"rotate-ccw",run:()=>processProjectRegistry(registry=>{const current=getRegistryEntry(registry,row.name);if(current)setStageEntry(registry,row.previousStage,current);return !!current;})}]:[]
    });
  }

  function setGuideToolbarActionState(control, state, error = "") {
    const next = String(state || "idle");
    control.setAttribute("data-noria-action-state", next);
    control.toggleClass?.("is-pending", next === "pending");
    control.toggleClass?.("is-failed", next === "failed");
    control.toggleClass?.("is-ok", next === "ok");
    if (next === "pending") control.setAttribute("aria-busy", "true");
    else control.removeAttribute("aria-busy");
    if (error) control.setAttribute("data-noria-action-error", String(error));
    else control.removeAttribute("data-noria-action-error");
  }

  function bindGuideToolbarAction(control, actionKind, run, opts = {}) {
    const kind = String(actionKind || "guide-toolbar-action");
    control.setAttribute("data-noria-action-source", "home-guide-toolbar");
    control.setAttribute("data-noria-action-kind", kind);
    if (opts?.target) control.setAttribute("data-noria-action-target", String(opts.target));
    setGuideToolbarActionState(control, "idle");
    control.onclick = async (ev) => {
      ev.preventDefault();
      control.disabled = true;
      setGuideToolbarActionState(control, "pending");
      try {
        const result = await run();
        if (result === false) {
          setGuideToolbarActionState(control, "failed", "action returned false");
          return false;
        }
        setGuideToolbarActionState(control, "ok");
        return true;
      } catch (error) {
        const message = String(error?.message || error || "failed");
        setGuideToolbarActionState(control, "failed", message);
        try { runtimeBridge?.runtime?.notice?.("runtime.home.notice.createFailed", { message }, 4500); } catch (_) {}
        return false;
      } finally {
        control.disabled = false;
      }
    };
  }

  /** @param {{ variant?: "governance", actionKind?: string, target?: string }} [opts] governance=琥珀 emphasis，与 Inbox 流水操作（冷紫）区分 */
  function addIconBtn(parent, iconId, tooltip, run, opts = {}) {
    const b = parent.createEl("button");
    b.type = "button";
    b.setAttribute("aria-label", tooltip);
    b.setAttribute("title", tooltip);
    b.addClass("dashboard-guide-icon-btn");
    if (opts?.variant === "governance") b.addClass("dashboard-guide-icon-btn--governance");
    paintIcon(b, iconId);
    bindGuideToolbarAction(b, opts?.actionKind || iconId, run, opts);
    return b;
  }

  /**
   * Card actions share the same icon treatment as MOC and habits.
   */
  const GUIDE_TOOLBAR_PRIMARY_ADD_ICON = "plus";
  try {
    globalThis.__noriaGuideToolbar = Object.assign({}, globalThis.__noriaGuideToolbar || {}, {
      primaryAddIcon: GUIDE_TOOLBAR_PRIMARY_ADD_ICON,
      primaryAddUseTextPlus: false
    });
  } catch (_) {}
  function addGuidePrimaryAddBtn(parent, tooltip, run, opts = {}) {
    const b = parent.createEl("button");
    b.type = "button";
    paintIcon(b, "plus");
    b.setAttribute("aria-label", tooltip);
    b.setAttribute("title", tooltip);
    b.addClass("dashboard-guide-icon-btn");
    b.addClass("dashboard-guide-toolbar-plus");
    bindGuideToolbarAction(b, opts?.actionKind || "guide-primary-add", run, opts);
    return b;
  }

  function attachLinkedResizer(cards, options) {
    if(input?.widgetInstanceId && runtimeBridge.runtime?.attachHomeCardResize)return;
    const targets = Array.isArray(cards) ? cards.filter(Boolean) : [];
    if (targets.length === 0) return;
    const key = String(options?.storageKey || "") + (String(input?.widgetInstanceId||"").startsWith("card-")?":"+input.widgetInstanceId:"");
    const minH = Number(options?.minHeight || 160);
    const maxH = Number(options?.maxHeight || 760);
    const onResize = typeof options?.onResize === "function" ? options.onResize : null;
    const original = targets.map(card => ({ minHeight: card.style.minHeight, maxHeight: card.style.maxHeight }));
    const setResizeAttr = (el, name, value) => {
      try {
        if (typeof el?.setAttr === "function") el.setAttr(name, String(value));
        else if (typeof el?.setAttribute === "function") el.setAttribute(name, String(value));
      } catch (_) {}
    };
    const apply = (h, persist) => {
      const next = clamp(Number(h) || minH, minH, maxH);
      targets.forEach((card) => {
        card.style.minHeight = `${next}px`;
        card.style.height = "auto";
        card.style.maxHeight = "none";
        setResizeAttr(card, "data-noria-tray-resize-scope", "local-transient");
        if (key) setResizeAttr(card, "data-noria-tray-resize-key", key);
        setResizeAttr(card, "data-noria-tray-resize-height", next);
        setResizeAttr(card, "data-noria-tray-resize-persisted", persist ? "1" : "0");
      });
      if (onResize) onResize(next);
      if (persist && key) {
        try { localStorage.setItem(key, String(next)); } catch (_) {}
      }
      return next;
    };
    const reset = () => {
      targets.forEach((card, index) => {
        card.style.minHeight = original[index].minHeight;
        card.style.maxHeight = original[index].maxHeight;
        card.style.height = "";
        card.removeAttribute("data-noria-tray-resize-height");
        const handle = card.querySelector(".dashboard-tray-resize-handle");
        handle?.removeAttribute("aria-valuenow");
      });
      if (key) localStorage.removeItem(key);
    };
    targets.forEach(card => {
      const shell = card.closest?.(".dashboard-home-widget-shell");
      if (shell) shell._noriaResetHeight = reset;
    });
    if (key) {
      try {
        const raw = Number(localStorage.getItem(key) || "");
        if (Number.isFinite(raw) && raw > 0) apply(raw, false);
      } catch (_) {}
    }
    targets.forEach((card) => {
      card.style.position = "relative";
      const handle = card.createDiv();
      handle.addClass("dashboard-tray-resize-handle");
      handle.setAttr("title", homeRuntimeT("runtime.home.overview.trayResize"));
      handle.setAttr("role", "separator");
      handle.setAttr("aria-orientation", "horizontal");
      handle.setAttr("tabindex", "0");
      handle.setAttr("aria-valuemin", String(minH));
      handle.setAttr("aria-valuemax", String(maxH));
      handle.ondblclick = reset;
      handle.onkeydown = (event) => {
        if (event.key === "Home") { event.preventDefault(); reset(); }
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          const height = apply(card.getBoundingClientRect().height + (event.key === "ArrowDown" ? 20 : -20), true);
          handle.setAttr("aria-valuenow", String(height));
        }
      };
      handle.setAttr("data-noria-tray-resize-scope", "local-transient");
      if (key) handle.setAttr("data-noria-tray-resize-key", key);
      handle.setAttr("data-noria-tray-resize-min", String(minH));
      handle.setAttr("data-noria-tray-resize-max", String(maxH));
      let startY = 0;
      let startH = 0;
      const onMove = (ev) => {
        const dy = Number(ev.clientY) - startY;
        apply(startH + dy, false);
      };
      const onUp = (ev) => {
        const dy = Number(ev.clientY) - startY;
        apply(startH + dy, true);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      handle.onpointerdown = (ev) => {
        ev.preventDefault();
        startY = Number(ev.clientY);
        startH = targets[0].getBoundingClientRect().height;
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      };
    });
  }

  const container = input?.mount || ((typeof this !== "undefined" && this && this.container) ? this.container : (ctx.container || null));
  if (!container || typeof container.createDiv !== "function") {
    ctx.paragraph(homeRuntimeT("runtime.home.noContainer"));
    return;
  }
  const themeHome = globalThis.dashboardCore?.theme?.home?.overview || {};
  const guideMax = themeHome.guidePanelScrollMax || "min(36vh, 320px)";
  const sectionMode = ["projects", "moc", "review"].includes(String(input?.sectionMode || ""))
    ? String(input.sectionMode)
    : "all";
  const showProjects = sectionMode === "all" || sectionMode === "projects";
  const showMoc = sectionMode === "all" || sectionMode === "moc";
  const showReview = sectionMode === "all" || sectionMode === "review";

  const wrap = container.createDiv();
  wrap.addClass("dashboard-guide-panels-stack");
  wrap.setAttribute("data-noria-guide-section-mode", sectionMode);
  /* gap 内联：不依赖 .dashboard-home-root 祖先，避免落在其它容器时间距为 0 */
  /* 略加大与 MOC 的纵向分离，避免 chip 行紧贴 Inbox/项目卡底 */
  wrap.style.cssText = "display:flex;flex-direction:column;gap:16px;width:100%;min-width:0;";
  const root = showProjects ? wrap.createDiv() : null;
  if (root) root.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:stretch;";
  const w = container?.clientWidth || 0;
  if (root && w > 0 && w < 1100) root.style.gridTemplateColumns = "1fr";

  const makePanel = (title, renderToolbar) => {
    const card = root.createDiv();
    card.addClass("dashboard-guide-card");
    card.style.cssText = `padding:12px 13px 13px;border-radius:12px;min-width:0;min-height:${input?.widgetInstanceId ? "0" : "min(32vh,300px)"};display:flex;flex-direction:column;max-height:${input?.widgetInstanceId ? "none" : guideMax};`;

    const headRow = card.createDiv();
    headRow.addClass("dashboard-guide-card__head");
    headRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;flex-shrink:0;margin-bottom:8px;min-height:30px;";
    const titleEl = headRow.createDiv();
    titleEl.addClass("dashboard-guide-card__title");
    const titleDot = titleEl.createEl("span");
    titleDot.addClass("dashboard-card-heading-icon");
    titleDot.setAttr("aria-hidden", "true");
    paintIcon(titleDot, "folder-kanban");
    titleEl.createEl("span", { text: title, cls: "dashboard-guide-card__title-text" });
    if (renderToolbar) {
      const tool = headRow.createDiv();
      tool.addClass("dashboard-guide-card__tools");
      tool.style.cssText = "display:flex;align-items:center;gap:3px;flex-shrink:0;";
      renderToolbar(tool);
    }

    const body = card.createDiv();
    body.addClass("dashboard-guide-card__body");
    body.style.cssText = "min-width:0;flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;";
    return { card, body };
  };

  if (showProjects) {
  const projectPanel = makePanel(homeRuntimeT("runtime.home.project.title"), (tool) => {
    addIconBtn(tool, "folder-kanban", homeRuntimeT("runtime.home.project.openRegistry"), () => openFilePath(projectListPath), { actionKind: "open-project-registry", target: projectListPath });
    addGuidePrimaryAddBtn(tool, homeRuntimeT("runtime.periodic.projects.nextPlaceholder"), () => {
      const add=projectPanel.body._noriaAddProjectTask;
      if(typeof add==='function')add();else openManageProjectPanel(true);
    }, { actionKind: "add-project-task", target: projectsRoot });
  });
  projectPanel.card.addClass("dashboard-guide-projects");
  const projectOpen = projectPanel.card.querySelector('[data-noria-action-kind="open-project-registry"]');
  if (projectOpen) {
    projectOpen.addClass('dashboard-card-heading-icon','noria-card-open');
    projectPanel.card.querySelector('.dashboard-guide-card__title .dashboard-card-heading-icon').replaceWith(projectOpen);
  }
  const projectShell=projectPanel.card.closest(".dashboard-home-widget-shell");if(projectShell)projectShell._noriaConfigureWidget=()=>openManageProjectPanel();
  projectPanel.card.style.gridColumn = "1 / -1";
  let projectRenderSeq = 0;
  const rerenderProjectPanel = async () => {
    const seq = ++projectRenderSeq;
    projectPanel.body.empty?.();
    const loading = projectPanel.body.createDiv?.({ text: homeRuntimeT("runtime.home.project.loading") });
    if (loading) {
      loading.style.cssText = "padding:8px 10px;color:var(--text-muted);font-size:.86em;";
    }
    try {
      await runCustomViewByPath(".obsidian/plugins/noria/views/periodic/dashboardGuideProjects", { mount: projectPanel.body, noriaBridge: runtimeBridge });
      if (seq !== projectRenderSeq) return;
      try { loading?.remove?.(); } catch (_) {}
    } catch (err) {
      if (seq !== projectRenderSeq) return;
      projectPanel.body.empty?.();
      const msg = projectPanel.body.createDiv?.({ text: homeRuntimeT("runtime.home.project.refreshLater") });
      if (msg) {
        msg.style.cssText = "padding:8px 10px;border-radius:10px;color:var(--text-muted);font-size:.86em;background:color-mix(in srgb,var(--background-primary) 94%,rgba(99,102,241,.08));border:1px dashed color-mix(in srgb,var(--background-modifier-border) 80%,rgba(99,102,241,.18));";
      }
      try { console.warn("[noria] guide project panel render skipped", err); } catch (_) {}
    }
  };
  await rerenderProjectPanel();
  try {
    const unsubscribe = getHomeRefreshBus().on("projects", rerenderProjectPanel);
    if (typeof input?.registerCleanup === "function" && typeof unsubscribe === "function") input.registerCleanup(unsubscribe);
  } catch (_) {}

  attachLinkedResizer([projectPanel.card].filter(Boolean), {
    storageKey: "noria.tray.guide.entries.height",
    minHeight: 160,
    maxHeight: 760,
    onResize: () => {
      projectPanel.body.style.maxHeight = "none";
    }
  });
  }

  if (showMoc) {
  const mocPanel = wrap.createDiv();
  /* MOC 仅一行 chip 导航：不再套「导引白卡」，避免与分区底色双重视觉托盘；高度仍可拖拽（dashboard-moc-host） */
  mocPanel.addClass("dashboard-moc-host");
  mocPanel.style.cssText = "min-width:0;display:flex;flex-direction:column;position:relative;overflow:visible;";
  const mocBody = mocPanel.createDiv();
  mocBody.style.cssText = "min-width:0;flex:1;display:flex;flex-direction:column;";
  const rerenderMocStrip = async () => {
    mocBody.empty?.();
    await runCustomViewByPath(".obsidian/plugins/noria/views/dashboard/home/sections/moc-chips", {
      mount: mocBody,
      onAddMoc: () => runtimeBridge.runtime.pickMocEntry(),
      bareStrip: true
    });
  };
  await rerenderMocStrip();
  try {
    const unsubscribe = getHomeRefreshBus().on("moc", rerenderMocStrip);
    if (typeof input?.registerCleanup === "function" && typeof unsubscribe === "function") input.registerCleanup(unsubscribe);
  } catch (_) {}

  const mocShell = mocPanel.closest?.(".dashboard-home-widget-shell");
  if (mocShell) mocShell._noriaConfigureWidget = () => openAddMocPanel(rerenderMocStrip);
  attachLinkedResizer([mocPanel], { storageKey: "noria.tray.guide.moc.height", minHeight: 108, maxHeight: 760 });
  }

  if (showReview && (sectionMode === "review" || runtimeBridge?.homeSettings?.guidePanels?.reviewCenter !== false)) {
    const reviewPanel = wrap.createDiv();
    reviewPanel.addClass("dashboard-review-center-host");
    reviewPanel.setAttribute("data-noria-review-focus", "closed");
    const card = reviewPanel.createEl("button", {
      cls: "dashboard-review-center-card dashboard-review-center-open",
      type: "button"
    });
    card.setAttribute("data-noria-review-home-summary", "1");
    card.setAttribute("aria-expanded", "false");
    card.setAttribute("hidden", "true");
    const summary = card.createEl("span", { cls: "dashboard-review-center-summary" });
    const marker = summary.createEl("span", { cls: "dashboard-review-center-marker" });
    marker.setAttribute("aria-hidden", "true");
    const summaryCopy = summary.createEl("span", { cls: "dashboard-review-center-summary-copy" });
    const titleRow = summaryCopy.createEl("span", { cls: "dashboard-review-center-title-row" });
    titleRow.createEl("span", { cls: "dashboard-review-center-summary-title", text: homeRuntimeT("review.title") });
    const meta = titleRow.createEl("span", { cls: "dashboard-review-center-meta" });
    meta.createSpan({ text: homeRuntimeT("review.home.diary", { date: "" }) });
    const actionRow = card.createEl("span", { cls: "dashboard-review-center-action-row" });
    const toggleLabel = actionRow.createEl("span", { cls: "dashboard-review-center-toggle-label" });
    const chevron = actionRow.createEl("span", { cls: "dashboard-review-center-chevron", text: "⌄" });
    chevron.setAttribute("aria-hidden", "true");
    const openButton = card;
    const setReviewToggleState = (expanded) => {
      const isExpanded = expanded === true;
      openButton.setAttribute("aria-expanded", isExpanded ? "true" : "false");
      toggleLabel.setText(homeRuntimeT(isExpanded ? "review.home.collapse" : "review.home.open"));
    };
    setReviewToggleState(false);
    const focusPanel = reviewPanel.createDiv({ cls: "dashboard-review-focus-panel" });
    const focusHead = focusPanel.createDiv({ cls: "dashboard-review-focus-head" });
    focusHead.setAttribute("hidden", "true");
    const controlsHost = focusHead.createDiv({ cls: "dashboard-review-focus-controls" });
    const focusBody = focusPanel.createDiv({ cls: "dashboard-review-focus-body" });
    let reviewRenderer = null;
    let reviewRendererPromise = null;
    let focusRenderSeq = 0;
    let defaultReviewFocusSeq = 0;
    function nowHomeReviewFocusMs() {
      try {
        const perf = globalThis?.performance || window?.performance;
        if (perf && typeof perf.now === "function") return Math.round(perf.now());
      } catch (_) {}
      return Date.now();
    }
    function setHomeReviewFocusDiagnostics(state, detail = {}) {
      const nextState = String(state || "idle");
      const targets = [reviewPanel, focusBody].filter(Boolean);
      const phaseAttributes = {
        modelMs: "data-noria-review-focus-model-ms",
        renderMs: "data-noria-review-focus-render-ms",
        evidenceMs: "data-noria-review-focus-evidence-ms",
        tasksMs: "data-noria-review-focus-tasks-ms",
        gitMs: "data-noria-review-focus-git-ms",
        statsMs: "data-noria-review-focus-stats-ms",
        excerptsMs: "data-noria-review-focus-excerpts-ms"
      };
      targets.forEach((target) => {
        target.setAttribute("data-noria-review-focus-state", nextState);
        if (detail.source) target.setAttribute("data-noria-review-focus-source", String(detail.source));
        if (Number.isFinite(Number(detail.startedAt))) target.setAttribute("data-noria-review-focus-started-at", String(Math.round(Number(detail.startedAt))));
        if (Number.isFinite(Number(detail.mountedAt))) target.setAttribute("data-noria-review-focus-mounted-at", String(Math.round(Number(detail.mountedAt))));
        if (Number.isFinite(Number(detail.mountMs))) target.setAttribute("data-noria-review-focus-mount-ms", String(Math.max(0, Math.round(Number(detail.mountMs)))));
        Object.entries(phaseAttributes).forEach(([key, attribute]) => {
          if (Number.isFinite(Number(detail[key]))) target.setAttribute(attribute, String(Math.max(0, Number(detail[key]))));
          else if (nextState === "ready" || nextState === "error") target.removeAttribute?.(attribute);
        });
        if (detail.error) target.setAttribute("data-noria-review-focus-error", String(detail.error));
        else if (nextState !== "error") target.removeAttribute?.("data-noria-review-focus-error");
      });
    }
    const nextReviewFocusFrame = () => new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      if (typeof setTimeout === "function") setTimeout(finish, 120);
      const frame =
        typeof requestAnimationFrame === "function"
          ? requestAnimationFrame
          : (typeof window?.requestAnimationFrame === "function" ? window.requestAnimationFrame.bind(window) : null);
      if (frame) {
        try {
          frame(finish);
          return;
        } catch (_) {}
      }
      if (typeof setTimeout === "function") setTimeout(finish, 0);
      else finish();
    });
    const nextReviewFocusIdle = () => new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      if (typeof setTimeout === "function") setTimeout(finish, 1000);
      const idle =
        typeof requestIdleCallback === "function"
          ? requestIdleCallback
          : (typeof window?.requestIdleCallback === "function" ? window.requestIdleCallback.bind(window) : null);
      if (idle) {
        try {
          idle(finish, { timeout: 900 });
          return;
        } catch (_) {}
      }
      if (typeof setTimeout === "function") setTimeout(finish, 120);
      else finish();
    });
    const renderReviewFocusFallback = (state, detail = "") => {
      focusBody.empty?.();
      focusBody.setAttribute("data-noria-review-focus-state", state || "error");
      const fallback = focusBody.createDiv({ cls: "dashboard-review-focus-fallback" });
      const stateRow = fallback.createDiv({ cls: "dashboard-review-focus-fallback-state" });
      stateRow.createSpan({
        cls: "dashboard-review-focus-fallback-state-title",
        text: homeRuntimeT("review.home.focusError")
      });
      stateRow.createSpan({
        cls: "dashboard-review-focus-fallback-state-hint",
        text: homeRuntimeT("review.home.fallback.errorHint")
      });
      if (detail) stateRow.title = String(detail);
      const stages = [
        {
          key: "evidence",
          title: "review.home.fallback.evidence.title",
          body: "review.home.fallback.evidence.body"
        },
        {
          key: "draft",
          title: "review.home.fallback.draft.title",
          body: "review.home.fallback.draft.body"
        },
        {
          key: "final",
          title: "review.home.fallback.final.title",
          body: "review.home.fallback.final.body"
        }
      ];
      const stageGrid = fallback.createDiv({ cls: "dashboard-review-focus-fallback-stages" });
      stages.forEach((stage, index) => {
        const row = stageGrid.createDiv({ cls: "dashboard-review-focus-fallback-stage" });
        row.setAttribute("data-noria-review-stage", stage.key);
        row.createSpan({ cls: "dashboard-review-focus-fallback-index", text: String(index + 1) });
        const copy = row.createSpan({ cls: "dashboard-review-focus-fallback-copy" });
        copy.createSpan({ cls: "dashboard-review-focus-fallback-title", text: homeRuntimeT(stage.title) });
        copy.createSpan({ cls: "dashboard-review-focus-fallback-body", text: homeRuntimeT(stage.body) });
      });
    };
    const ensureHomeReviewRenderer = () => {
      if (reviewRendererPromise) return reviewRendererPromise;
      reviewRendererPromise = (async () => {
        if (typeof runtimeBridge.renderReviewCenter !== "function") throw new Error("renderReviewCenter bridge missing");
        const renderer = await runtimeBridge.renderReviewCenter(focusBody, {
          expanded: false,
          mode: "home-focus"
        });
        reviewRenderer = renderer;
        return renderer;
      })().catch((error) => {
        reviewRendererPromise = null;
        throw error;
      });
      return reviewRendererPromise;
    };
    const clearHomeReviewRenderer = (options = {}) => {
      defaultReviewFocusSeq++;
      focusRenderSeq++;
      try { reviewRenderer?.unload?.(); } catch (_) {}
      reviewRenderer = null;
      reviewRendererPromise = null;
      controlsHost.empty?.();
      focusBody.empty?.();
      focusBody.removeAttribute?.("data-noria-review-focus-state");
      focusBody.removeAttribute?.("data-noria-review-focus-error");
      if (options.hide !== false) {
        focusPanel.setAttribute("hidden", "true");
        reviewPanel.setAttribute("data-noria-review-focus", "closed");
        setHomeReviewFocusDiagnostics("closed");
        setReviewToggleState(false);
      }
      openButton.disabled = false;
    };
    const collapseReviewFocusPanel = async () => {
      await reviewRenderer?.setExpanded?.(false);
      reviewPanel.setAttribute("data-noria-review-focus", "closed");
      setHomeReviewFocusDiagnostics("closed");
    };
    const mountHomeReviewFocusPanel = async (seq, request = {}, loading = null) => {
      try {
        await nextReviewFocusFrame();
        if (seq !== focusRenderSeq) return;
        const startedAt = Number(request?.__startedAt || nowHomeReviewFocusMs());
        const source = String(request?.__source || request?.source || "manual");
        setHomeReviewFocusDiagnostics("loading", { source, startedAt });
        const nextRenderer = await ensureHomeReviewRenderer();
        const mountedAt = nowHomeReviewFocusMs();
        if (seq !== focusRenderSeq) return;
        reviewRenderer = nextRenderer;
        const requestedSelection = request?.selection || (
          request?.activePeriod || request?.mode || request?.selectedDate || request?.date || request?.period || request?.yearlyVariant || request?.variant
            ? {
              mode: request?.activePeriod || request?.mode || "daily",
              anchorDate: request?.selectedDate || request?.date || undefined,
              period: request?.period,
              yearlyVariant: request?.yearlyVariant || request?.variant
            }
            : null
        );
        if (requestedSelection) await reviewRenderer?.setSelection?.(requestedSelection);
        await reviewRenderer?.setExpanded?.(true);
        try { loading.remove?.(); } catch (_) {}
        const reviewPerformance = nextRenderer?.performance || {};
        setHomeReviewFocusDiagnostics("ready", {
          source,
          startedAt,
          mountedAt,
          mountMs: mountedAt - startedAt,
          modelMs: reviewPerformance.modelMs,
          renderMs: reviewPerformance.renderMs,
          evidenceMs: reviewPerformance.evidenceMs,
          tasksMs: reviewPerformance.tasksMs,
          gitMs: reviewPerformance.gitMs,
          statsMs: reviewPerformance.statsMs,
          excerptsMs: reviewPerformance.excerptsMs
        });
      } catch (err) {
        if (seq !== focusRenderSeq) return;
        const startedAt = Number(request?.__startedAt || nowHomeReviewFocusMs());
        const failedAt = nowHomeReviewFocusMs();
        const message = String(err?.message || err || "");
        controlsHost.empty?.();
        setHomeReviewFocusDiagnostics("error", {
          source: String(request?.__source || request?.source || "manual"),
          startedAt,
          mountedAt: failedAt,
          mountMs: failedAt - startedAt,
          error: message
        });
        renderReviewFocusFallback("error", message);
      }
    };
    const renderHomeReviewFocusPanel = (request = {}) => {
      defaultReviewFocusSeq++;
      const seq = ++focusRenderSeq;
      reviewPanel.setAttribute("data-noria-review-focus", "open");
      focusPanel.removeAttribute("hidden");
      setReviewToggleState(true);
      openButton.disabled = false;
      controlsHost.empty?.();
      const startedAt = nowHomeReviewFocusMs();
      const source = String(request?.source || "manual");
      setHomeReviewFocusDiagnostics("opening", { source, startedAt });
      void mountHomeReviewFocusPanel(seq, { ...(request || {}), __source: source, __startedAt: startedAt }, null);
    };
    const openHomeReviewFocusPanel = async (request = {}) => {
      renderHomeReviewFocusPanel(request || {});
      try { focusPanel.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (_) {}
    };
    const scheduleDefaultReviewFocusOpen = (request = {}) => {
      const scheduleSeq = ++defaultReviewFocusSeq;
      const startedAt = nowHomeReviewFocusMs();
      const source = String(request?.source || "home-default");
      setHomeReviewFocusDiagnostics("scheduled", { source, startedAt });
      void (async () => {
        await nextReviewFocusIdle();
        if (scheduleSeq !== defaultReviewFocusSeq) return;
        if (!reviewPanel.isConnected) return;
        if (reviewPanel.getAttribute("data-noria-review-focus") !== "closed") return;
        await openHomeReviewFocusPanel({ ...(request || {}), source: "home-default" });
      })();
    };
    openButton.addEventListener("click", async (ev) => {
      ev.preventDefault();
      if (reviewPanel.getAttribute("data-noria-review-focus") === "open") {
        await collapseReviewFocusPanel();
        return;
      }
      await openHomeReviewFocusPanel({});
    });
    try {
      const homeHost = container.closest?.(".noria-home-host") || container.closest?.(".noria-itemview-host") || container;
      if (homeHost) {
        homeHost.__noriaOpenReviewFocusPanel = openHomeReviewFocusPanel;
        if (typeof input?.registerCleanup === "function") {
          input.registerCleanup(() => {
            if (homeHost.__noriaOpenReviewFocusPanel === openHomeReviewFocusPanel) delete homeHost.__noriaOpenReviewFocusPanel;
          });
        }
      }
    } catch (_) {}
    if (typeof input?.registerCleanup === "function") {
      input.registerCleanup(() => clearHomeReviewRenderer({ hide: true }));
    }
    void ensureHomeReviewRenderer().catch((error) => {
      const message = String(error?.message || error || "");
      setHomeReviewFocusDiagnostics("error", { error: message });
      renderReviewFocusFallback("error", message);
    });
    const defaultExpanded = typeof input?.defaultExpanded === "boolean"
      ? input.defaultExpanded
      : runtimeBridge?.homeSettings?.guidePanels?.reviewCenterExpanded === true;
    const defaultReviewFocusRequest = defaultExpanded
      ? { source: "home-default" }
      : null;
    const pendingReviewFocus = typeof runtimeBridge.consumeHomeReviewFocusRequest === "function"
      ? runtimeBridge.consumeHomeReviewFocusRequest()
      : null;
    if (pendingReviewFocus) void openHomeReviewFocusPanel(pendingReviewFocus);
    else if (defaultReviewFocusRequest) scheduleDefaultReviewFocusOpen(defaultReviewFocusRequest);
  }
})();
