const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

function setup(previousEmbedded = null, onToggleMode) {
  const nativeView = { isShown: () => true };
  let active = previousEmbedded;
  const workspace = {
    get activeEditor() { return active || nativeView; },
    // Obsidian ignores native MarkdownView assignments; clearing is separate.
    set activeEditor(value) { if (value !== nativeView) active = value; },
    unsetActiveEditor(value) { if (!value || active === value) active = null; }
  };
  const listeners = new Map(), scopes = new Set();
  const container = {
    isConnected: true,
    isShown() { return this.isConnected; },
    contains: () => false,
    addEventListener(name, fn, capture) { listeners.set(name, { fn, capture }); },
    removeEventListener(name) { listeners.delete(name); },
    empty() {}
  };
  class Base {
    constructor(app, element, owner) {
      this.sourceMode = false;
      this.cm = {};
      this.editor = {
        getValue: () => this.value,
        focus: () => {
          listeners.get("focus")?.fn({});
          // The native CM focus handler runs before bubbling focusin.
          app.workspace.activeEditor = owner;
          listeners.get("focusin")?.fn({});
        }
      };
    }
    load() {}
    unload() {}
    toggleSource() { this.sourceMode = true; }
    set(value) { this.value = value; }
  }
  class Embedded extends Base {}
  const app = { workspace, keymap: { pushScope: s => scopes.add(s), popScope: s => scopes.delete(s) },
    embedRegistry: { embedByExtension: { md: () => ({ editMode: new Embedded(), showEditor() {}, unload() {} }) } } };
  const module = { exports: {} };
  const code = fs.readFileSync(path.join(__dirname, "../src/review-markdown-editor.js"), "utf8");
  vm.runInNewContext(code, { module, document: {createElement: () => ({})}, require: id => {
    assert.equal(id, "obsidian"); return { Scope: class { register() {} } };
  } });
  const editor = module.exports.createReviewMarkdownEditor({ app, container, value: "A draft",onToggleMode });
  return { editor, workspace, nativeView, container, listeners, scopes };
}

test("the embedded editor advertises visibility and releases native workspace ownership", () => {
  const s = setup();
  s.editor.focus();
  const owner = s.workspace.activeEditor;
  assert.equal(typeof owner.isShown, "function");
  assert.equal(owner.isShown(), true);
  s.editor.dispose();
  assert.equal(owner.isShown(), false);
  assert.equal(s.workspace.activeEditor, s.nativeView);
  assert.equal(s.scopes.size, 0);
});

test("native preview command reaches the embedded owner and respects composition",()=>{
  let toggles=0;const s=setup(null,()=>toggles++);s.editor.focus();const owner=s.workspace.activeEditor;
  owner.toggleMode();assert.equal(toggles,1);
  s.listeners.get("compositionstart").fn();owner.toggleMode();assert.equal(toggles,1);
  s.listeners.get("compositionend").fn();owner.toggleMode();assert.equal(toggles,2);
  s.editor.setFile({path:"Created/2098-01-01.md"});assert.equal(owner.path,"Created/2098-01-01.md");
  s.editor.dispose();
});

test("blur restores a prior visible editor rather than restoring itself", () => {
  const previous = { isShown: () => true };
  const s = setup(previous);
  s.editor.focus();
  s.listeners.get("focusout").fn({relatedTarget:null});
  assert.equal(s.workspace.activeEditor, previous);
  assert.equal(s.scopes.size, 0);
  s.editor.dispose();
});
