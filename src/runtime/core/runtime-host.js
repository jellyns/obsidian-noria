"use strict";

/**
 * 注意：`main.js` 为兼容 Obsidian require 解析，已内联与本文件等价的实现。
 * 修改 native view context 时请同步更新 `main.js` 顶部 `createNoriaViewContext`。
 */

function normalizeVaultPath(raw) {
  return String(raw || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
}

function createNoriaViewContext(app, plugin, options = {}) {
  const container = options.container;
  const explicitOrigin = normalizeVaultPath(options.originFile ?? "");
  const activeOrigin = normalizeVaultPath(app?.workspace?.getActiveFile?.()?.path || "");
  const originCandidates = [explicitOrigin, activeOrigin]
    .filter(Boolean)
    .filter((value, index, arr) => arr.indexOf(value) === index);
  const originFile = originCandidates[0] || "";

  const dom = {
    el(tag, text, opts = {}) {
      const o = { ...(opts || {}) };
      const parent = o.container || container;
      delete o.container;
      const attr = o.attr;
      if (attr) delete o.attr;

      const str = text == null ? "" : String(text);
      const htmlLike = typeof text === "string" && /<\s*[a-z!/]/i.test(text);
      const el = parent.createEl(tag, htmlLike || text == null || typeof text === "object"
        ? o
        : { ...o, text: str === "" ? undefined : str });
      if (attr) Object.entries(attr).forEach(([k, v]) => el.setAttribute(k, String(v)));
      if (htmlLike) {
        el.innerHTML = str;
      } else if (text != null && typeof text === "object" && !(text instanceof String)) {
        const path = text.path;
        const display = text.display;
        if (path) {
          el.createEl("a", {
            text: display || path,
            href: path.endsWith(".md") ? path : `${path}.md`,
            cls: "internal-link"
          });
        } else {
          el.setText(str || JSON.stringify(text));
        }
      }
      return el;
    },
    span(text, opts) {
      return this.el("span", text, opts);
    },
    paragraph(text, opts) {
      return this.el("p", text, opts);
    }
  };

  const ioLoad = async (path) => {
    const text = await plugin.loadTextFromVault(normalizeVaultPath(path));
    return text ? text : undefined;
  };
  const toArray = (raw) => Array.isArray(raw) ? raw : Array.from(raw || []);
  const parseQueryRoots = (query) => {
    const raw = String(query == null ? "" : query).trim();
    if (!raw) return [];
    const roots = [];
    raw.replace(/"([^"]+)"/g, (_, root) => {
      const normalized = normalizeVaultPath(root);
      if (normalized && !roots.includes(normalized)) roots.push(normalized);
      return "";
    });
    if (!roots.length) {
      const normalized = normalizeVaultPath(raw.replace(/^'+|'+$/g, ""));
      if (normalized) roots.push(normalized);
    }
    return roots;
  };
  const pagesForRoots = (roots) => {
    try {
      const files = toArray(app?.vault?.getMarkdownFiles?.());
      return files
        .filter((file) => {
          const pathText = normalizeVaultPath(file?.path || "");
          if (!pathText || plugin.isReviewNotePath?.(pathText)) return false;
          if (!roots.length) return true;
          return roots.some((root) => pathText === root || pathText.startsWith(`${root.replace(/\/+$/, "")}/`));
        })
        .map((file) => plugin.pageFactFromFile(file))
        .filter(Boolean);
    } catch (_) {
      return [];
    }
  };
  const pageForPath = (pathText) => plugin.pageFactForPath(pathText);
  const currentPage = () => {
    for (const origin of originCandidates) {
      const page = pageForPath(origin);
      if (page) return page;
    }
    return undefined;
  };

  return {
    container,
    mount: container,
    app,
    bridge: globalThis.__noriaRuntimeBridge || plugin.buildRuntimeBridgeConfig?.() || {},
    sourcePath: originFile,
    props: options.props || {},
    readText: ioLoad,
    createEl: dom.el.bind(dom),
    filesForScope: (scopeId) => plugin.filesForScope(scopeId),
    filesForManagedPath: (pathKey) => plugin.filesForManagedPath(pathKey),
    page: pageForPath,
    current: currentPage,
    io: {
      load: ioLoad,
      normalize: (path) => normalizeVaultPath(path),
      csv: async () => undefined
    },
    pages: (query) => pagesForRoots(parseQueryRoots(query)),
    pagePaths: (query) => pagesForRoots(parseQueryRoots(query)).map((page) => page?.file?.path).filter(Boolean),
    array: toArray,
    isArray: Array.isArray,
    isDataArray: () => false,
    el: dom.el.bind(dom),
    span: dom.span.bind(dom),
    paragraph: dom.paragraph.bind(dom)
  };
}

module.exports = { createNoriaViewContext, normalizeVaultPath };
