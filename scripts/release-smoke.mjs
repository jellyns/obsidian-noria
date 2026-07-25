import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const targetRoot = process.argv[2] ? path.resolve(process.argv[2]) : repoRoot;

function fail(message) {
  throw new Error(message);
}

function readRequired(name) {
  const target = path.join(targetRoot, name);
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    fail(`missing release asset: ${name}`);
  }
  return fs.readFileSync(target, "utf8");
}

function makeObsidianStub() {
  class Plugin {}
  return {
    Plugin,
    PluginSettingTab: class {
      constructor(app, plugin) {
        this.app = app;
        this.plugin = plugin;
      }
    },
    ItemView: class {
      constructor(leaf) {
        this.leaf = leaf;
        this.containerEl = null;
      }
    },
    Setting: class {},
    Notice: class {},
    MarkdownRenderer: {},
    TFile: class {},
    setIcon() {},
    async requestUrl() {
      return { json: {} };
    },
    getLanguage() {
      return "en";
    }
  };
}

function loadPluginClass(source) {
  const obsidian = makeObsidianStub();
  const module = { exports: {} };
  const context = {
    Buffer,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    console,
    module,
    exports: module.exports,
    process,
    navigator: {},
    setTimeout() {
      return 1;
    },
    clearTimeout() {},
    setInterval() {
      return 1;
    },
    clearInterval() {},
    queueMicrotask,
    require(id) {
      if (id === "obsidian") return obsidian;
      if (id === "child_process" || id === "electron") return {};
      if (id === "fs") return fs;
      if (id === "os") return os;
      if (id === "path") return path;
      fail(`unexpected external require: ${id}`);
    },
    globalThis: null,
    window: null
  };
  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "main.js", timeout: 10_000 });

  const PluginClass = module.exports?.default || module.exports;
  if (typeof PluginClass !== "function") {
    fail("main.js did not export an Obsidian plugin class");
  }
  const instance = new PluginClass();
  if (!(instance instanceof obsidian.Plugin)) {
    fail("exported plugin class does not extend obsidian.Plugin");
  }
  return PluginClass;
}

try {
  const manifest = JSON.parse(readRequired("manifest.json"));
  const mainSource = readRequired("main.js");
  const stylesSource = readRequired("styles.css");
  if (manifest.id !== "noria" || manifest.name !== "Noria" || !manifest.version) {
    fail("manifest identity is not the canonical Noria contract");
  }
  if (!mainSource.trim()) fail("main.js is empty");
  if (!stylesSource.trim()) fail("styles.css is empty");

  const PluginClass = loadPluginClass(mainSource);
  const requiredMethods = [
    "onload",
    "loadSettings",
    "initializeMissingManagedNotes",
    "getSetupStatus",
    "buildRuntimeBridgeConfig"
  ];
  const missing = requiredMethods.filter((name) => typeof PluginClass.prototype[name] !== "function");
  if (missing.length) fail(`plugin class is missing required methods: ${missing.join(", ")}`);

  console.log(`Noria release smoke passed: ${manifest.id}@${manifest.version} bundle loaded with ${requiredMethods.length} required methods.`);
} catch (error) {
  console.error(`Noria release smoke failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
