"use strict";

// A reading position belongs to the page containing the Inbox, not the active tab.
// Weak keys let closed pages go away; native Markdown views own editing and saving.
const readers = new WeakMap();

function createInboxReader(plugin, host) {
  const { workspace, vault } = plugin.app;
  let disposed = false;
  const leaves = () => { const result = []; workspace.iterateAllLeaves(leaf => { result.push(leaf); }); return result; };
  const owner = leaves().find(leaf => leaf.view?.containerEl?.contains(host));
  let state = owner && readers.get(owner);
  if (owner && !state) {
    state = { leaf: null, parent: null, file: null, positions: new WeakMap(), revision: 0, queue: Promise.resolve() };
    readers.set(owner, state);
  }
  const reusable = () => state?.leaf && leaves().includes(state.leaf)
    && state.leaf !== owner && state.leaf.parent !== owner.parent
    && !state.leaf.getViewState().pinned
    && state.leaf.view?.getViewType() === "markdown"
    && state.leaf.view.file === state.file;

  return {
    currentPath() { return reusable() && vault.getAbstractFileByPath(state.file.path) === state.file ? state.file.path : ""; },
    dispose() { disposed = true; },
    async open(path, event, { line } = {}) {
      const { Keymap } = require("obsidian");
      if (disposed || !host.isConnected) return { ok: false, cancelled: true };
      // Explicit new-tab/window gestures keep the usual Obsidian behavior.
      if (!owner || (event && Keymap.isModEvent(event))) return plugin.openHomeSource(path, { event });
      const revision = ++state.revision;
      const run = async () => {
        if (disposed || !host.isConnected || revision !== state.revision || !leaves().includes(owner))
          return { ok: false, cancelled: true };
        const file = vault.getAbstractFileByPath(path);
        if (!file || file.extension !== "md") return { ok: false, reason: "missing" };
        if (!reusable()) {
          // A pinned or repurposed reader is now the user's tab. Leave it alone.
          const parent = state.parent;
          state.leaf = parent && parent !== owner.parent && leaves().some(leaf => leaf.parent === parent)
            ? workspace.createLeafInParent(parent, parent.children.length)
            : workspace.createLeafBySplit(owner, "vertical", false);
          state.parent = state.leaf.parent;
          state.file = null;
        }
        const leaf = state.leaf;
        if (state.file !== file) {
          if (state.file) state.positions.set(state.file, {
            state: leaf.getViewState().state, eState: leaf.getEphemeralState()
          });
          await leaf.openFile(file, { ...state.positions.get(file), active: false });
          state.file = file;
        }
        if (disposed || revision !== state.revision || !reusable()) return { ok: false, cancelled: true };
        if (Number.isInteger(line) && line >= 0) leaf.setEphemeralState({ line });
        // Reveal the reading tab without moving keyboard focus out of the list.
        workspace.setActiveLeaf(leaf, { focus: false });
        workspace.setActiveLeaf(owner, { focus: false });
        return { ok: true, path: file.path };
      };
      const pending = state.queue.then(run, run);
      state.queue = pending.catch(() => {});
      // Restoring a native editor cursor can focus it even with active:false.
      // Return focus to the list only if the user has not started another action.
      const doc = host.ownerDocument, focused = doc?.activeElement;
      const returnFocus = focused && host.contains(focused);
      let interrupted = false;
      const interrupt = () => { interrupted = true; };
      if (returnFocus) for (const name of ["pointerdown", "keydown"]) doc.addEventListener(name, interrupt, true);
      try {
        const result = await pending;
        if (result.ok && returnFocus && !interrupted && focused.isConnected) focused.focus({ preventScroll: true });
        return result;
      } finally {
        if (returnFocus) for (const name of ["pointerdown", "keydown"]) doc.removeEventListener(name, interrupt, true);
      }
    }
  };
}

module.exports = { createInboxReader };
