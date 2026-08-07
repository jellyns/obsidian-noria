const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { sourcePath } = require("./source-paths.cjs");
const { spawnSync } = require("node:child_process");

const pluginRoot = path.resolve(__dirname, "..");

function pluginPath(...parts) {
  return sourcePath(path.join(...parts).replace(/\\/g, "/"));
}
const releaseCheck = pluginPath("scripts", "release-check.mjs");
const releaseSmoke = pluginPath("scripts", "release-smoke.mjs");
const releaseInstall = pluginPath("scripts", "install-release-to-vault.mjs");

function localMarkdownImages(file) {
  const source = fs.readFileSync(file, "utf8");
  return Array.from(source.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g), (match) => match[1].trim())
    .filter((target) => !/^(?:https?:|data:)/i.test(target));
}

function makeReleaseDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "noria-release-"));
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(dir, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, "utf8");
  }
  return dir;
}

function runReleaseCheck(dir) {
  return spawnSync(process.execPath, [releaseCheck, dir], {
    cwd: pluginRoot,
    encoding: "utf8"
  });
}

function runReleaseSmoke(dir) {
  return spawnSync(process.execPath, [releaseSmoke, dir], {
    cwd: pluginRoot,
    encoding: "utf8"
  });
}

function collectProductionSource() {
  const roots = [pluginPath("src", "runtime")];
  const files = [
    pluginPath("src", "main.js"),
    pluginPath("src", "generated", "embedded-runtime-sources.js")
  ];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(target);
      else files.push(target);
    }
  };
  roots.forEach(visit);
  return files
    .filter((file) => /\.(?:css|js|json|md|xml)$/i.test(file))
    .map((file) => `${path.relative(pluginRoot, file).replace(/\\/g, "/")}\n${fs.readFileSync(file, "utf8")}`)
    .join("\n");
}

test("release check accepts only manifest main and styles", () => {
  const dir = makeReleaseDir({
    "manifest.json": "{}\n",
    "main.js": "module.exports = class {}\n",
    "styles.css": "\n"
  });

  const result = runReleaseCheck(dir);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Noria release check passed/);
});

test("release check rejects dev and local files even when they are gitignored", () => {
  const dir = makeReleaseDir({
    "manifest.json": "{}\n",
    "main.js": "module.exports = class {}\n",
    "styles.css": "\n",
    "data.json": "{}\n",
    "views/dashboard/view.js": "",
    "review/daily/.gitkeep": "",
    "task_plan.md": "",
    "docs/local/private.md": ""
  });

  const result = runReleaseCheck(dir);

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /data\.json|views|review|task_plan\.md|docs\/local/);
});

test("release smoke loads the final CommonJS plugin artifact through the Obsidian boundary", () => {
  const dir = makeReleaseDir({
    "manifest.json": JSON.stringify({ id: "noria", name: "Noria", version: "0.3.6" }),
    "main.js": [
      'const obsidian = require("obsidian");',
      "module.exports = class NoriaPlugin extends obsidian.Plugin {",
      "  async onload() {}",
      "  async loadSettings() {}",
      "  initializeMissingManagedNotes() {}",
      "  getSetupStatus() {}",
      "  buildRuntimeBridgeConfig() {}",
      "};"
    ].join("\n"),
    "styles.css": ".noria-smoke { display: block; }\n"
  });

  const result = runReleaseSmoke(dir);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Noria release smoke passed/);
});

test("release smoke rejects an artifact that does not export the plugin class", () => {
  const dir = makeReleaseDir({
    "manifest.json": JSON.stringify({ id: "noria", name: "Noria", version: "0.3.6" }),
    "main.js": "module.exports = {};\n",
    "styles.css": ".noria-smoke { display: block; }\n"
  });

  const result = runReleaseSmoke(dir);

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /plugin class/i);
});

test("source branch ignores pure generated bundles while retaining authored release CSS", () => {
  const ignore = fs.readFileSync(pluginPath(".gitignore"), "utf8");
  const pkg = JSON.parse(fs.readFileSync(pluginPath("package.json"), "utf8"));

  assert.match(ignore, /^\/main\.js$/m);
  assert.doesNotMatch(ignore, /^main\.js$/m);
  assert.match(ignore, /^src\/generated\/embedded-runtime-sources\.js$/m);
  assert.doesNotMatch(ignore, /^styles\.css$/m);
  assert.match(pkg.scripts["release:check"], /release-smoke\.mjs/);
});

test("built plugin embeds runtime source registry for release-only installs", () => {
  const main = fs.readFileSync(pluginPath("main.js"), "utf8");

  assert.match(main, /NORIA_EMBEDDED_SOURCES|__noriaEmbeddedSources/);
  assert.match(main, /views\/tasks-calendar\/runtime-core\.js/);
  assert.match(main, /views\/dashboard\/core\/utils\/diary-day-blocks\.js/);
  assert.match(main, /config\/timeline-settings\.md/);
});

test("production runtime has no retired vendor, sample data, demo, or historical path dependency", () => {
  const production = collectProductionSource();
  const forbidden = [
    ["window", "Timeline"].join("."),
    ["Si", "mile", "Ajax"].join(""),
    ["Default", "EventSource"].join(""),
    ["createHotZone", "BandInfo"].join(""),
    ["noria-open-", "si", "mile-timeline-demo"].join(""),
    ["VIEW_TYPE_NORIA_", "SIM", "ILE_TIMELINE_DEMO"].join(""),
    ["views/", "si", "mile-timeline"].join(""),
    ["data", ["jfk", "xml"].join(".")].join("/"),
    ["noria", "Si", "mileTimeline"].join(""),
    ["legacy", "backend.js"].join("-"),
    ["parity", "contract.js"].join("-"),
    ["native", "compare-shadow"].join("-")
  ];

  for (const token of forbidden) {
    assert.equal(production.includes(token), false, `production runtime still contains ${token}`);
  }
});

test("Task Board hot paths do not emit incidental production info logs", () => {
  const runtime = fs.readFileSync(
    pluginPath("src", "runtime", "views", "tasks-calendar", "runtime-core.js"),
    "utf8"
  );

  assert.doesNotMatch(runtime, /console\.(?:info|log|debug)\s*\(/);
});

test("public documentation ships every referenced local screenshot", () => {
  const docs = [
    pluginPath("README.md"),
    pluginPath("README.zh-CN.md"),
    pluginPath("docs", "USER-GUIDE.md"),
    pluginPath("docs", "zh-CN", "USER-GUIDE.md")
  ];

  for (const file of docs) {
    for (const target of localMarkdownImages(file)) {
      const resolved = path.resolve(path.dirname(file), target);
      assert.equal(fs.existsSync(resolved), true, `${path.relative(pluginRoot, file)} references missing ${target}`);
    }
  }
});

test("English and Chinese public docs keep equivalent demo images in separate locale folders", () => {
  const pairs = [
    [pluginPath("README.md"), pluginPath("README.zh-CN.md")],
    [pluginPath("docs", "USER-GUIDE.md"), pluginPath("docs", "zh-CN", "USER-GUIDE.md")]
  ];
  const expected = [
    "home-dashboard.png",
    "task-board-month.png",
    "task-board-week.png",
    "task-board-day.png",
    "task-board-quadrant.png",
    "task-timeline.png",
    "review-center.png"
  ];

  for (const [englishFile, chineseFile] of pairs) {
    const englishTargets = localMarkdownImages(englishFile);
    const chineseTargets = localMarkdownImages(chineseFile);
    assert.deepEqual(englishTargets.map((target) => path.basename(target)), expected);
    assert.deepEqual(chineseTargets.map((target) => path.basename(target)), expected);
    assert.ok(englishTargets.every((target) => target.replace(/\\/g, "/").includes("assets/en/")));
    assert.ok(chineseTargets.every((target) => target.replace(/\\/g, "/").includes("assets/zh-CN/")));
  }
});

test("bilingual public docs present the Noria-only identity", () => {
  const englishReadme = fs.readFileSync(pluginPath("README.md"), "utf8");
  const chineseReadme = fs.readFileSync(pluginPath("README.zh-CN.md"), "utf8");
  const englishGuide = fs.readFileSync(pluginPath("docs", "USER-GUIDE.md"), "utf8");
  const chineseGuide = fs.readFileSync(pluginPath("docs", "zh-CN", "USER-GUIDE.md"), "utf8");
  const publicDocs = [
    englishReadme,
    chineseReadme,
    englishGuide,
    chineseGuide
  ].join("\n");

  assert.match(englishReadme, /^# Noria for Obsidian$/m);
  assert.match(chineseReadme, /^# Noria$/m);
  assert.match(englishReadme, /Turn knowledge into action, and action into lasting knowledge\./);
  assert.match(chineseReadme, /让知识进入行动，让行动沉淀为知识。/);
  assert.match(englishReadme, /docs\/assets\/brand\/noria-app-icon\.svg/);
  assert.match(chineseReadme, /docs\/assets\/brand\/noria-app-icon\.svg/);
  assert.match(publicDocs, /github\.com\/jellyns\/obsidian-noria/);
  assert.match(englishReadme, /\.obsidian\/plugins\/noria\//);
  assert.match(chineseReadme, /\.obsidian\/plugins\/noria\//);
  assert.match(englishGuide, /Noria\/Home\.md/);
  assert.match(chineseGuide, /Noria\/Home\.md/);

  assert.doesNotMatch(englishReadme, /From Noria to Noria|imports your existing settings|reassign custom hotkeys/i);
  assert.doesNotMatch(chineseReadme, /从 Noria 迁移到 Noria|导入已有设置|重新分配自定义快捷键/);

  assert.match(englishGuide, /Noria settings have seven top-level pages/);
  assert.match(chineseGuide, /Noria 设置按七页组织/);
  assert.match(englishGuide, /^### 9\.5 Calendar$/m);
  assert.match(chineseGuide, /^### 9\.5 日历$/m);
  assert.match(englishGuide, /^### 9\.7 Maintenance$/m);
  assert.match(chineseGuide, /^### 9\.7 维护$/m);
  for (const legacyDoc of [
    pluginPath("docs", "FAQ.md"),
    pluginPath("docs", "SETTINGS-MAPPING.md"),
    pluginPath("docs", "zh-CN", "FAQ.md"),
    pluginPath("docs", "zh-CN", "SETTINGS-MAPPING.md")
  ]) {
    assert.equal(fs.existsSync(legacyDoc), false);
  }

  assert.doesNotMatch(publicDocs, /\bbuilt-in AI\b|\bAI generation settings\b|\bAI API key\b/i);
  assert.doesNotMatch(publicDocs, /内置 AI|AI 生成设置|AI API 密钥/);
  assert.doesNotMatch(publicDocs, /automatically migrates (?:your )?notes|自动迁移你的笔记/i);
});

test("manifest package versions and Obsidian compatibility table stay aligned", () => {
  const manifest = JSON.parse(fs.readFileSync(pluginPath("manifest.json"), "utf8"));
  const pkg = JSON.parse(fs.readFileSync(pluginPath("package.json"), "utf8"));
  const lock = JSON.parse(fs.readFileSync(pluginPath("package-lock.json"), "utf8"));
  const versions = JSON.parse(fs.readFileSync(pluginPath("versions.json"), "utf8"));

  assert.equal(manifest.id, "noria");
  assert.equal(manifest.name, "Noria");
  assert.equal(pkg.name, "noria");
  assert.equal(pkg.repository?.url, "git+https://github.com/jellyns/obsidian-noria.git");
  assert.equal(pkg.homepage, "https://github.com/jellyns/obsidian-noria#readme");
  assert.equal(pkg.version, manifest.version);
  assert.equal(lock.name, pkg.name);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages?.[""]?.name, pkg.name);
  assert.equal(lock.packages?.[""]?.version, pkg.version);
  assert.equal(manifest.version, "0.4.3");
  assert.equal(versions[manifest.version], manifest.minAppVersion);
  assert.match(pkg.scripts.version, /version-bump\.mjs/);
});

test("community submission metadata and public support files are release ready", () => {
  const requiredRootFiles = ["README.md", "LICENSE", "manifest.json"];
  for (const file of requiredRootFiles) {
    const target = pluginPath(file);
    assert.equal(fs.existsSync(target), true, `${file} must exist at the repository root`);
    assert.ok(fs.statSync(target).size > 0, `${file} must not be empty`);
  }

  const manifest = JSON.parse(fs.readFileSync(pluginPath("manifest.json"), "utf8"));
  assert.match(manifest.id, /^[a-z][a-z-]*$/);
  assert.doesNotMatch(manifest.id, /obsidian/);
  assert.doesNotMatch(manifest.id, /plugin$/);
  assert.equal(manifest.name, "Noria");
  assert.doesNotMatch(manifest.name, /obsidian|plugin/i);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.match(manifest.minAppVersion, /^\d+\.\d+\.\d+$/);
  assert.ok(manifest.description.trim().length > 0);
  assert.doesNotMatch(manifest.description, /obsidian/i);
  assert.ok(manifest.author.trim().length > 0);
  assert.equal(manifest.isDesktopOnly, true);

  const supportFiles = [
    "CONTRIBUTING.md",
    "SECURITY.md",
    "CODE_OF_CONDUCT.md",
    ".github/ISSUE_TEMPLATE/bug_report.md",
    ".github/ISSUE_TEMPLATE/feature_request.md",
    ".github/PULL_REQUEST_TEMPLATE.md"
  ];
  const supportText = supportFiles
    .map((file) => fs.readFileSync(pluginPath(file), "utf8"))
    .join("\n");
  const retiredBrandPattern = new RegExp(`\\b${["ca", "dence"].join("")}\\b`, "i");
  assert.doesNotMatch(supportText, retiredBrandPattern);
  assert.doesNotMatch(supportText, /Dataview (?:version|版本)/i);

  const bugTemplate = fs.readFileSync(
    pluginPath(".github", "ISSUE_TEMPLATE", "bug_report.md"),
    "utf8"
  );
  const featureTemplate = fs.readFileSync(
    pluginPath(".github", "ISSUE_TEMPLATE", "feature_request.md"),
    "utf8"
  );
  const contributing = fs.readFileSync(pluginPath("CONTRIBUTING.md"), "utf8");
  const englishReadme = fs.readFileSync(pluginPath("README.md"), "utf8");
  const chineseReadme = fs.readFileSync(pluginPath("README.zh-CN.md"), "utf8");
  assert.match(bugTemplate, /^## Environment$/m);
  assert.match(bugTemplate, /^## Reproduction Steps$/m);
  assert.match(featureTemplate, /^## Problem$/m);
  assert.match(featureTemplate, /^## Proposed Experience$/m);
  assert.doesNotMatch(contributing, /docs\/(?:FAQ|SETTINGS-MAPPING)\.md/);
  assert.match(englishReadme, /github\.com\/jellyns\/obsidian-noria\/issues/);
  assert.match(chineseReadme, /github\.com\/jellyns\/obsidian-noria\/issues/);

  const changelog = fs.readFileSync(pluginPath("CHANGELOG.md"), "utf8");
  const unreleased = changelog.slice(0, changelog.indexOf("## 0.3.6"));
  assert.doesNotMatch(unreleased, new RegExp(`${["ca", "dence"].join("")}-owned`, "i"));

  const pluginSource = fs.readFileSync(pluginPath("src", "main.js"), "utf8");
  assert.doesNotMatch(pluginSource, /\.vault\.delete\s*\(/);
  assert.match(pluginSource, /fileManager\?\.trashFile|fileManager\.trashFile/);
});

test("tagged release workflow builds and publishes only canonical plugin assets", () => {
  const workflow = fs.readFileSync(pluginPath(".github", "workflows", "release.yml"), "utf8");

  assert.match(workflow, /npm run check/);
  assert.match(workflow, /npm run release:check/);
  assert.match(workflow, /Tag \$tag does not match manifest version \$manifest_version/);
  assert.match(workflow, /gh release create/);
  assert.match(workflow, /main\.js manifest\.json/);
  assert.match(workflow, /styles\.css/);
  assert.doesNotMatch(workflow, /\bsrc\b|\btests\b|data\.json/);
  const releaseCommand = workflow.slice(workflow.indexOf("gh release create"));
  const releaseAssets = Array.from(releaseCommand.matchAll(/\b[\w.-]+\.(?:js|json|css|md)\b/g), (match) => match[0]);
  assert.deepEqual([...new Set(releaseAssets)].sort(), ["main.js", "manifest.json", "styles.css"]);
});

test("vault install cleans only Noria development files and preserves Noria data", () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "noria-vault-"));
  const target = path.join(vault, ".obsidian", "plugins", "noria");
  fs.mkdirSync(path.join(target, "src"), { recursive: true });
  fs.writeFileSync(path.join(target, "src", "main.js"), "dev source\n", "utf8");
  fs.writeFileSync(path.join(target, "README.md"), "dev readme\n", "utf8");
  fs.writeFileSync(path.join(target, "data.json"), "{\"keep\":true}\n", "utf8");

  const result = spawnSync(process.execPath, [releaseInstall, vault], {
    cwd: pluginRoot,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(fs.readdirSync(target).sort(), ["data.json", "main.js", "manifest.json", "styles.css"]);
  assert.equal(fs.readFileSync(path.join(target, "data.json"), "utf8"), "{\"keep\":true}\n");
  assert.match(result.stdout, /Noria installed to/);
});

test("vault install refuses a linked Noria install target", () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "noria-linked-vault-"));
  const pluginsRoot = path.join(vault, ".obsidian", "plugins");
  const linkedRoot = path.join(vault, "linked-target");
  const noriaRoot = path.join(pluginsRoot, "noria");
  fs.mkdirSync(linkedRoot, { recursive: true });
  fs.writeFileSync(path.join(linkedRoot, "data.json"), "{\"linked\":true}\n", "utf8");
  fs.writeFileSync(path.join(linkedRoot, "linked-only.txt"), "must survive\n", "utf8");
  fs.mkdirSync(pluginsRoot, { recursive: true });
  fs.symlinkSync(linkedRoot, noriaRoot, process.platform === "win32" ? "junction" : "dir");

  const result = spawnSync(process.execPath, [releaseInstall, vault], {
    cwd: pluginRoot,
    encoding: "utf8"
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /symbolic link|junction|linked install target/i);
  assert.equal(fs.readFileSync(path.join(linkedRoot, "data.json"), "utf8"), "{\"linked\":true}\n");
  assert.equal(fs.readFileSync(path.join(linkedRoot, "linked-only.txt"), "utf8"), "must survive\n");
  assert.equal(fs.existsSync(path.join(linkedRoot, "main.js")), false);
  assert.equal(fs.existsSync(path.join(linkedRoot, "manifest.json")), false);
  assert.equal(fs.existsSync(path.join(linkedRoot, "styles.css")), false);
});

test("vault install accepts only NORIA_VAULT", () => {
  const installerSource = fs.readFileSync(releaseInstall, "utf8");
  assert.match(installerSource, /process\.env\.NORIA_VAULT/);
  assert.doesNotMatch(installerSource, new RegExp(["CAD", "ENCE_VAULT"].join("")));
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "noria-env-vault-"));

  const result = spawnSync(process.execPath, [releaseInstall], {
    cwd: pluginRoot,
    encoding: "utf8",
    env: { ...process.env, NORIA_VAULT: vault }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(path.join(vault, ".obsidian", "plugins", "noria", "manifest.json")), true);
});
