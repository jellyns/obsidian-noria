"use strict";

const obsidian = require("obsidian");

/*! Embedded editor construction adapted from Matthew Meyers and Fevol's
 * MIT-licensed example: https://gist.github.com/Fevol/caa478ce303e69eabede7b12b2323838
 * Copyright 2024 Matthew Meyers, Fevol
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
// Keep access to
// this internal API here; the document and save layers do not depend on it.
const editorTypes = new WeakMap();
function resolveEditorType(app) {
  if (editorTypes.has(app)) return editorTypes.get(app);
  const createEmbed = app.embedRegistry?.embedByExtension?.md;
  if (typeof createEmbed !== "function") throw new Error("Markdown editor is unavailable in this Obsidian version");
  const embed = createEmbed({ app, containerEl: document.createElement("div") }, null, "");
  try {
    embed.editable = true;
    embed.showEditor();
    const Type = Object.getPrototypeOf(Object.getPrototypeOf(embed.editMode)).constructor;
    editorTypes.set(app, Type);
    return Type;
  } finally {
    embed.unload();
  }
}

function createReviewMarkdownEditor({ app, container, file, value, onChange, onSave, onExit, onToggleMode, position }) {
  const Base = resolveEditorType(app);
  let ready = false;
  let disposed = false;
  let instance;
  let scopeActive = false;
  let previousEditor = null;
  let compositionActive = false;
  const owner = {
    app, file: file || null,
    containerEl: container,
    isShown() { return !disposed && container.isShown(); },
    get path() { return file?.path || ""; },
    get editor() { return instance?.editor; },
    getMode: () => "source",
    onMarkdownScroll() {},
    requestSave() {},
    save() {},
    showSearch() { instance?.showSearch?.(); },
    toggleMode() { if(!composing())return onToggleMode?.(); }
  };
  class ReviewEditor extends Base {
    updateBottomPadding() {}
    // Live-preview widgets assume whole-file offsets. This editor owns a fragment.
    toggleSource() { if (!this.sourceMode) super.toggleSource(); }
    onUpdate(update, changed) {
      super.onUpdate(update, changed);
      if (ready && !disposed && changed) onChange?.(this.editor.getValue());
    }
  }
  const scope = new obsidian.Scope(app.scope);
  const composing = (event) => !!(compositionActive || event?.isComposing || instance?.cm?.composing);
  const compositionStart = () => { compositionActive = true; };
  const compositionEnd = () => { compositionActive = false; };
  scope.register(["Mod"], "s", (event) => { if (!composing(event)) onSave?.(); return false; });
  scope.register([], "Escape", (event) => { if (!composing(event)) onExit?.(); return false; });
  const activate = () => {
    if (disposed) return;
    if (!scopeActive) {
      previousEditor = app.workspace.activeEditor;
      app.keymap.pushScope(scope);
      scopeActive = true;
    }
    app.workspace.activeEditor = owner;
  };
  const deactivate = (event) => {
    if (!disposed && event?.relatedTarget && container.contains(event.relatedTarget)) return;
    if (scopeActive) app.keymap.popScope(scope);
    scopeActive = false;
    if (app.workspace.activeEditor === owner) {
      // The workspace setter ignores native MarkdownViews, so clear first.
      app.workspace.unsetActiveEditor(owner);
      if (previousEditor !== owner && previousEditor?.isShown?.()) app.workspace.activeEditor = previousEditor;
    }
  };
  try {
    instance = new ReviewEditor(app, container, owner);
    owner.editMode = instance;
    instance.load();
    if (!instance.sourceMode) instance.toggleSource();
    instance.set(String(value || ""));
    // Capture before CodeMirror's focus handler assigns this owner itself.
    container.addEventListener("focus", activate, true);
    container.addEventListener("focusout", deactivate);
    container.addEventListener("compositionstart", compositionStart, true);
    container.addEventListener("compositionend", compositionEnd, true);
    ready = true;
    if (position) instance.editor.setSelection(position.anchor, position.head || position.anchor);
  } catch (error) {
    disposed = true;
    deactivate();
    instance?.unload?.();
    throw error;
  }
  return {
    editor: instance.editor,
    cm: instance.cm,
    isComposing: () => composing(),
    focus() { instance.editor.focus(); },
    setFile(nextFile) { file=nextFile || null;owner.file=file; },
    getPosition() { return { anchor: instance.editor.getCursor("anchor"), head: instance.editor.getCursor("head") }; },
    setValue(text) { ready = false; try { instance.set(String(text || "")); } finally { ready = true; } },
    dispose() {
      if (disposed) return;
      disposed = true;
      deactivate();
      container.removeEventListener("focus", activate, true);
      container.removeEventListener("focusout", deactivate);
      container.removeEventListener("compositionstart", compositionStart, true);
      container.removeEventListener("compositionend", compositionEnd, true);
      instance.unload();
      container.empty();
    }
  };
}

module.exports = { createReviewMarkdownEditor };
