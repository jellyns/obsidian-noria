const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const pluginRoot = path.resolve(__dirname, "..");
const script = path.join(pluginRoot, "scripts", "prepare-release-demo-vault.mjs");
const retiredBrand = ["ca", "dence"].join("");
const retiredBrandTitle = `${retiredBrand[0].toUpperCase()}${retiredBrand.slice(1)}`;

function read(root, rel) {
  return fs.readFileSync(path.join(root, ...rel.split("/")), "utf8");
}

function filesUnder(root) {
  const out = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else out.push(file);
    }
  };
  visit(root);
  return out;
}

function demoInventory(root) {
  const noriaRoot = path.join(root, "Noria");
  const files = filesUnder(noriaRoot);
  const relative = files.map((file) => path.relative(noriaRoot, file).replace(/\\/g, "/"));
  const text = files
    .filter((file) => /\.(?:md|base)$/i.test(file))
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");
  const habits = read(root, "Noria/Habits.md");
  const count = (pattern, source = text) => (source.match(pattern) || []).length;
  return {
    files: relative.length,
    diaries: relative.filter((file) => /^Diary\/\d{4}\/\d{4}-\d{2}-\d{2}\.md$/.test(file)).length,
    inbox: relative.filter((file) => /^Inbox\/[^/]+\.md$/.test(file)).length,
    projects: relative.filter((file) => /^Projects\/[^/]+\/[^/]+\.md$/.test(file)).length,
    habitHistory: count(/\[completion::/g, habits),
    currentHabits: count(/^- \[ \].*#habit #active.*\[due:: 2026-07-11\]/gm, habits),
    fields: {
      start: count(/\[start::/g),
      scheduled: count(/\[scheduled::/g),
      due: count(/\[due::/g),
      completion: count(/\[completion::/g)
    }
  };
}

test("release demo vault is isolated, installable, and populated with current generic examples", () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "noria-demo-"));
  const target = path.join(parent, "vault");
  const result = spawnSync(process.execPath, [script, target, "--date=2026-07-11"], {
    cwd: pluginRoot,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(
    fs.readdirSync(path.join(target, ".obsidian", "plugins", "noria")).sort(),
    ["data.json", "main.js", "manifest.json", "styles.css"]
  );
  assert.deepEqual(JSON.parse(read(target, ".obsidian/community-plugins.json")), ["noria"]);
  assert.match(read(target, ".noria-demo-vault"), /Noria release demo/);
  assert.match(read(target, ".noria-demo-vault"), /Locale: en/);
  assert.equal(fs.existsSync(path.join(target, `.${retiredBrand}-demo-vault`)), false);

  const data = JSON.parse(read(target, ".obsidian/plugins/noria/data.json"));
  assert.equal(data.onboarding.profile, "standard");
  assert.equal(data.onboarding.workspaceRoot, "Noria");
  assert.equal(data.weather.qweatherSecretName, "noria-weather-qweather-key");
  assert.equal(data.weather.manualCity, "Berlin");
  assert.equal(Object.prototype.hasOwnProperty.call(data.weather, "qweatherKey"), false);
  Object.values(data.managedPaths).forEach((managedPath) => assert.match(managedPath, /^Noria\//));

  const today = read(target, "Noria/Diary/2026/2026-07-11.md");
  assert.match(today, /Process three Inbox notes/);
  assert.match(today, /Walk and reset attention/);
  assert.doesNotMatch(today, /Draft the introduction outline/);
  assert.match(today, /#noria-demo/);
  assert.doesNotMatch(today, new RegExp(`#${retiredBrand}-demo`, "i"));
  assert.match(today, /weather: "(?:clear|partly cloudy|overcast|rain)"/);
  assert.match(read(target, "Noria/Projects.md"), /Research writing/);
  const researchProject = read(target, "Noria/Projects/Research writing/Research writing.md");
  assert.match(researchProject, /Draft the introduction outline/);
  assert.match(researchProject, /Review the experiment summary/);
  assert.match(researchProject, /\[start:: 2026-07-11 09:00\]/);
  assert.match(researchProject, /Review the experiment summary \[start:: 2026-07-12 11:00\]/);
  const knowledgeProject = read(target, "Noria/Projects/Knowledge system/Knowledge system.md");
  assert.match(knowledgeProject, /Organize two evergreen notes \[scheduled:: 2026-07-13 14:00\]/);
  assert.match(knowledgeProject, /Refine the weekly briefing \[scheduled:: 2026-07-14 15:30\]/);
  const habits = read(target, "Noria/Habits.md");
  assert.match(habits, /## Active habits/);
  assert.match(habits, /## Paused habits/);
  assert.match(habits, /## Established habits/);
  assert.match(habits, /## Daily recurring task source/);
  assert.doesNotMatch(habits, /打卡中的习惯|循环任务源（每日）/);
  assert.match(habits, /Deep work/);
  assert.match(habits, /Read for twenty minutes \[type:: check\]/);
  assert.doesNotMatch(habits, /Read for twenty minutes \[type:: number\]/);
  assert.ok((habits.match(/\[completion::/g) || []).length >= 40);
  assert.match(read(target, "Noria/Countdowns.md"), /Draft review/);
  assert.equal(fs.readdirSync(path.join(target, "Noria", "Diary", "2026")).filter((name) => name.endsWith(".md")).length, 30);

  const allText = fs.readdirSync(path.join(target, "Noria", "Inbox"))
    .map((name) => read(target, `Noria/Inbox/${name}`))
    .join("\n");
  assert.doesNotMatch(allText, /Zmod31|WENO|ZFD|Library|jellyns/i);
});

test("release demo vault can generate an equivalent Simplified Chinese fixture", () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "noria-demo-zh-"));
  const target = path.join(parent, "vault");
  const result = spawnSync(process.execPath, [script, target, "--date=2026-07-11", "--locale=zh-CN"], {
    cwd: pluginRoot,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(read(target, ".noria-demo-vault"), /Locale: zh-CN/);

  const data = JSON.parse(read(target, ".obsidian/plugins/noria/data.json"));
  assert.equal(data.weather.manualCity, "北京");
  assert.equal(data.home.identity.displayName, "小序");

  const today = read(target, "Noria/Diary/2026/2026-07-11.md");
  assert.match(today, /散步并重置注意力/);
  assert.match(today, /写下今日复盘/);
  assert.match(today, /#noria-demo/);
  assert.match(read(target, "Noria/Projects.md"), /研究写作/);
  assert.match(read(target, "Noria/Projects/研究写作/研究写作.md"), /检查实验总结 \[start:: 2026-07-12 11:00\]/);
  assert.match(read(target, "Noria/Projects/知识系统/知识系统.md"), /整理两条常青笔记 \[scheduled:: 2026-07-13 14:00\]/);
  assert.match(read(target, "Noria/Projects.md"), /\[\[Noria\/Projects\/研究写作\/研究写作\.md\|研究写作\]\]/);
  assert.ok(fs.existsSync(path.join(target, "Noria", "Inbox", "每周简报草稿.md")));
  const habits = read(target, "Noria/Habits.md");
  assert.match(habits, /## 打卡中的习惯/);
  assert.match(habits, /## 暂停的习惯/);
  assert.match(habits, /## 已养成习惯/);
  assert.match(habits, /## 循环任务源（每日）/);
  assert.doesNotMatch(habits, /## Active habits|## Daily recurring task source/);
  assert.match(habits, /深度工作/);
  assert.ok((habits.match(/\[completion::/g) || []).length >= 40);
  assert.match(read(target, "Noria/Countdowns.md"), /初稿评审/);
  assert.match(read(target, "Noria/Quotes.md"), /让下一步有用的行动更容易被看见/);

  const englishParent = fs.mkdtempSync(path.join(os.tmpdir(), "noria-demo-equivalent-en-"));
  const englishTarget = path.join(englishParent, "vault");
  const englishResult = spawnSync(process.execPath, [script, englishTarget, "--date=2026-07-11"], {
    cwd: pluginRoot,
    encoding: "utf8"
  });
  assert.equal(englishResult.status, 0, englishResult.stderr || englishResult.stdout);
  assert.deepEqual(demoInventory(target), demoInventory(englishTarget));
  assert.deepEqual(demoInventory(target), {
    files: 51,
    diaries: 30,
    inbox: 4,
    projects: 2,
    habitHistory: 63,
    currentHabits: 3,
    fields: { start: 6, scheduled: 2, due: 74, completion: 103 }
  });

  for (const demoRoot of [target, englishTarget]) {
    assert.equal(fs.existsSync(path.join(demoRoot, retiredBrandTitle)), false);
    assert.equal(fs.existsSync(path.join(demoRoot, ".obsidian", "plugins", retiredBrand)), false);
    assert.equal(fs.existsSync(path.join(demoRoot, `.${retiredBrand}-demo-vault`)), false);
    const diaryText = filesUnder(path.join(demoRoot, "Noria", "Diary"))
      .map((file) => fs.readFileSync(file, "utf8"))
      .join("\n");
    assert.doesNotMatch(diaryText, new RegExp(`#${retiredBrand}-demo`, "i"));
  }
});

test("release demo vault refuses to write into a non-empty directory", () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "noria-demo-existing-"));
  fs.writeFileSync(path.join(target, "keep.txt"), "keep\n", "utf8");

  const result = spawnSync(process.execPath, [script, target, "--date=2026-07-11"], {
    cwd: pluginRoot,
    encoding: "utf8"
  });

  assert.notEqual(result.status, 0);
  assert.equal(fs.readFileSync(path.join(target, "keep.txt"), "utf8"), "keep\n");
});
