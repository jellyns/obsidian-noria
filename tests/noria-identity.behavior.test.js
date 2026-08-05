const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  PUBLIC_PLUGIN_ID,
  PUBLIC_PLUGIN_NAME,
  PUBLIC_REPOSITORY,
  NORIA_HOME_ICON_ID,
  NORIA_MARK_PATH,
  buildNoriaMarkBody,
  registerNoriaHomeIcon
} = require("../src/noria-identity.js");

const pluginRoot = path.resolve(__dirname, "..");

function readAsset(relativePath) {
  return fs.readFileSync(path.join(pluginRoot, relativePath), "utf8");
}

function extractCanonicalPath(svg) {
  const match = svg.match(/\bd="(M4\.769[^"]+)"/);
  assert.ok(match, "expected an SVG path whose d attribute starts with M4.769");
  return match[1];
}

test("exports the approved Noria public identity", () => {
  assert.equal(PUBLIC_PLUGIN_ID, "noria");
  assert.equal(PUBLIC_PLUGIN_NAME, "Noria");
  assert.equal(PUBLIC_REPOSITORY, "obsidian-noria");
  assert.equal(NORIA_HOME_ICON_ID, "noria-home");
});

test("active product files use only the Noria namespace", () => {
  const retiredBrand = ["ca", "dence"].join("");
  const activeRoots = ["src", "scripts", "tests", ".github"];
  const publicFiles = [
    "README.md",
    "README.zh-CN.md",
    "CHANGELOG.md",
    "CODE_OF_CONDUCT.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "manifest.json",
    "package.json",
    "package-lock.json",
    "styles.css",
    "docs/USER-GUIDE.md",
    "docs/zh-CN/USER-GUIDE.md"
  ];
  const ignoredDirectories = new Set(["node_modules", ".git", "generated"]);
  const candidates = [];
  const visit = (relativePath) => {
    const absolutePath = path.join(pluginRoot, relativePath);
    for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
      if (ignoredDirectories.has(entry.name)) continue;
      const child = path.join(relativePath, entry.name);
      if (entry.isDirectory()) visit(child);
      else candidates.push(child.replace(/\\/g, "/"));
    }
  };

  activeRoots.forEach(visit);
  candidates.push(...publicFiles);

  const violations = candidates
    .filter((relativePath) => relativePath.toLowerCase().includes(retiredBrand)
      || fs.readFileSync(path.join(pluginRoot, relativePath), "utf8").toLowerCase().includes(retiredBrand))
    .sort();

  assert.deepEqual(violations, []);
});

test("declares use strict in the directive prologue", () => {
  const source = fs.readFileSync(path.join(pluginRoot, "src/noria-identity.js"), "utf8");
  const directivePrologue = /^(?:\uFEFF)?(?:(?:\s+)|(?:\/\/[^\r\n]*(?:\r?\n|$))|(?:\/\*[\s\S]*?\*\/))*(["'])use strict\1\s*;/;

  assert.match(source, directivePrologue);
});

test("uses the byte-identical open canonical path from both brand assets", () => {
  const markPath = extractCanonicalPath(readAsset("docs/assets/brand/noria-mark.svg"));
  const appIconPath = extractCanonicalPath(readAsset("docs/assets/brand/noria-app-icon.svg"));

  assert.equal(markPath, NORIA_MARK_PATH);
  assert.equal(appIconPath, NORIA_MARK_PATH);
  assert.ok(NORIA_MARK_PATH.endsWith("14.981 6.545"));
  assert.doesNotMatch(NORIA_MARK_PATH, /Z\s*$/i);
});

test("registers the Noria home mark with currentColor and rounded strokes", () => {
  let registration = null;
  const expectedBody = `<path d="${NORIA_MARK_PATH}" transform="scale(4.166666667)" fill="none" stroke="currentColor" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round" />`;
  const obsidianApi = {
    addIcon(id, body) {
      registration = { id, body };
    }
  };

  assert.equal(registerNoriaHomeIcon(obsidianApi), true);
  assert.equal(buildNoriaMarkBody(), expectedBody);
  assert.equal(registration.id, NORIA_HOME_ICON_ID);
  assert.equal(registration.body, expectedBody);
});

test("builds exactly one unfilled canonical path without event attributes", () => {
  const body = buildNoriaMarkBody();

  assert.equal((body.match(/<path\b/g) || []).length, 1);
  assert.match(body, /^<path\b[^>]*\/>$/);
  assert.match(body, /\bfill="none"/);
  assert.match(body, /\btransform="scale\(4\.166666667\)"/);
  assert.match(body, /\bstroke-width="2\.15"/);
  assert.doesNotMatch(body, /<(?!path\b)/);
  assert.doesNotMatch(body, /\son[a-z]+\s*=/i);
});

test("main plugin registers the Noria home icon before the rest of onload", () => {
  const source = fs.readFileSync(path.join(pluginRoot, "src/main.js"), "utf8");
  const onloadStart = source.indexOf("async onload() {");
  const firstLifecycleStep = source.indexOf("noriaClearRetiredTimelineRuntimeState();", onloadStart);
  const onloadPrefix = source.slice(onloadStart, firstLifecycleStep);

  assert.match(source, /const noriaIdentity = require\("\.\/noria-identity\.js"\);/);
  assert.ok(onloadStart >= 0 && firstLifecycleStep > onloadStart);
  assert.match(onloadPrefix, /this\._noriaHomeIconRegistered\s*=\s*noriaIdentity\.registerNoriaHomeIcon\(obsidian\);/);
});

test("Ribbon creation refreshes the custom Noria mark before adding buttons", () => {
  const source = fs.readFileSync(path.join(pluginRoot, "src", "main.js"), "utf8");
  const start = source.indexOf("registerCoreRibbons() {");
  const end = source.indexOf("\n  getWorkspaceRibbonHiddenItems()", start);
  const block = source.slice(start, end);

  assert.match(block, /noriaIdentity\.registerNoriaHomeIcon\(obsidian\)/);
  assert.ok(
    block.indexOf("noriaIdentity.registerNoriaHomeIcon(obsidian)") < block.indexOf("this.addRibbonIcon("),
    "the custom icon should be refreshed before Ribbon buttons are created"
  );
});

test("Home Ribbon reapplies the canonical mark to the created button element", () => {
  const source = fs.readFileSync(path.join(pluginRoot, "src", "main.js"), "utf8");
  const start = source.indexOf("registerCoreRibbons() {");
  const end = source.indexOf("\n  getWorkspaceRibbonHiddenItems()", start);
  const block = source.slice(start, end);

  assert.match(block, /const\s+ribbonItem\s*=\s*this\.addRibbonIcon\(/);
  assert.match(block, /spec\.icon\s*===\s*noriaIdentity\.NORIA_HOME_ICON_ID/);
  assert.match(block, /noriaIdentity\.ensureNoriaHomeRibbonIcon\(ribbonItem,\s*obsidian\)/);
  assert.ok(
    block.indexOf("this.addRibbonIcon(") < block.indexOf("noriaIdentity.ensureNoriaHomeRibbonIcon("),
    "the rendered Ribbon element should be repaired after Obsidian creates it"
  );
});

test("Home Ribbon repair uses setIcon and verifies the canonical path", () => {
  const calls = [];
  let rendered = false;
  const element = {
    querySelector(selector) {
      if (selector === `path[d="${NORIA_MARK_PATH}"]` && rendered) return {};
      return null;
    }
  };
  const obsidianApi = {
    setIcon(target, iconId) {
      calls.push({ target, iconId });
      rendered = true;
    }
  };

  assert.equal(require("../src/noria-identity.js").ensureNoriaHomeRibbonIcon(element, obsidianApi), true);
  assert.deepEqual(calls, [{ target: element, iconId: NORIA_HOME_ICON_ID }]);
});

test("returns false when addIcon is unavailable or throws", () => {
  assert.equal(registerNoriaHomeIcon(), false);
  assert.equal(registerNoriaHomeIcon({}), false);
  assert.equal(registerNoriaHomeIcon({ addIcon() { throw new Error("registration failed"); } }), false);
});
