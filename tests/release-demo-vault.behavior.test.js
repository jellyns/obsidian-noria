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
  const contentRoots = ["00_Inbox", "01_Projects", "02_Areas", "03_Resources", "04_Archives", "05_MOC", "06_Diary", "99_Attachment"];
  const files = contentRoots.flatMap((name) => filesUnder(path.join(root, name)));
  const relative = files.map((file) => path.relative(root, file).replace(/\\/g, "/"));
  const text = files
    .filter((file) => /\.(?:md|base)$/i.test(file))
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");
  const habits = read(root, "02_Areas/Noria/Habits.md");
  const count = (pattern, source = text) => (source.match(pattern) || []).length;
  return {
    files: relative.length,
    diaries: relative.filter((file) => /^06_Diary\/\d{4}\/\d{4}-\d{2}-\d{2}\.md$/.test(file)).length,
    inbox: relative.filter((file) => /^00_Inbox\/[^/]+\.md$/.test(file)).length,
    projects: relative.filter((file) => /^01_Projects\/[^/]+\/[^/]+\.md$/.test(file)).length,
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

test("release demo vault is isolated, installable, and populated with current IPARA examples", () => {
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
  const gitignore = read(target, ".gitignore");
  assert.match(gitignore, /^\.obsidian\/workspace\*\.json$/m);
  assert.match(gitignore, /^\.obsidian\/plugins\/noria\/main\.js$/m);
  assert.match(gitignore, /^\.obsidian\/plugins\/noria\/manifest\.json$/m);
  assert.match(gitignore, /^\.obsidian\/plugins\/noria\/styles\.css$/m);
  assert.doesNotMatch(gitignore, /data\.json/);
  assert.equal(fs.existsSync(path.join(target, `.${retiredBrand}-demo-vault`)), false);

  const data = JSON.parse(read(target, ".obsidian/plugins/noria/data.json"));
  assert.equal(data.onboarding.profile, "standard");
  assert.equal(data.onboarding.workspaceRoot, "02_Areas/Noria");
  assert.equal(data.weather.qweatherSecretName, "noria-weather-qweather-key");
  assert.equal(data.weather.manualCity, "Berlin");
  assert.equal(Object.prototype.hasOwnProperty.call(data.weather, "qweatherKey"), false);
  Object.values(data.managedPaths).forEach((managedPath) => {
    assert.doesNotMatch(managedPath, /^[A-Za-z]:[\\/]/);
    assert.match(managedPath, /^(?:00_Inbox|01_Projects|02_Areas|06_Diary)(?:\/|$)/);
  });

  const today = read(target, "06_Diary/2026/2026-07-11.md");
  assert.match(today, /Process three Inbox notes/);
  assert.match(today, /Walk and reset attention/);
  assert.doesNotMatch(today, /Draft the introduction outline/);
  assert.match(today, /#noria-demo/);
  assert.doesNotMatch(today, new RegExp(`#${retiredBrand}-demo`, "i"));
  assert.match(today, /weather: "(?:clear|partly cloudy|overcast|rain)"/);
  assert.match(read(target, "02_Areas/Noria/Projects.md"), /Research writing/);
  const researchProject = read(target, "01_Projects/Research writing/Research writing.md");
  assert.match(researchProject, /Draft the introduction outline/);
  assert.match(researchProject, /Review the experiment summary/);
  assert.match(researchProject, /\[start:: 2026-07-11 09:00\]/);
  assert.match(researchProject, /Review the experiment summary \[start:: 2026-07-12 11:00\]/);
  const knowledgeProject = read(target, "01_Projects/Knowledge system/Knowledge system.md");
  assert.match(knowledgeProject, /Organize two evergreen notes \[scheduled:: 2026-07-13 14:00\]/);
  assert.match(knowledgeProject, /Refine the weekly briefing \[scheduled:: 2026-07-14 15:30\]/);
  const habits = read(target, "02_Areas/Noria/Habits.md");
  assert.match(habits, /## Active habits/);
  assert.match(habits, /## Paused habits/);
  assert.match(habits, /## Established habits/);
  assert.match(habits, /## Daily recurring task source/);
  assert.doesNotMatch(habits, /打卡中的习惯|循环任务源（每日）/);
  assert.match(habits, /Deep work/);
  assert.match(habits, /Read for twenty minutes \[type:: check\]/);
  assert.doesNotMatch(habits, /Read for twenty minutes \[type:: number\]/);
  assert.ok((habits.match(/\[completion::/g) || []).length >= 40);
  assert.match(read(target, "02_Areas/Noria/Countdowns.md"), /Draft review/);
  const inboxWorkflow = read(target, "02_Areas/Noria/Inbox workflow.md");
  assert.match(inboxWorkflow, /\| Triage \| `triage` \|/);
  assert.match(inboxWorkflow, /Completion is not a fourth status/);
  assert.match(inboxWorkflow, /not a separate default stage/);
  assert.doesNotMatch(inboxWorkflow, /\| Closed \||`closed`/);
  assert.doesNotMatch(inboxWorkflow, /- defer: postpone/);
  assert.equal(fs.readdirSync(path.join(target, "06_Diary", "2026")).filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name)).length, 90);

  const allText = fs.readdirSync(path.join(target, "00_Inbox"))
    .map((name) => read(target, `00_Inbox/${name}`))
    .join("\n");
  assert.doesNotMatch(allText, /inbox-status: "deferred"/);
  assert.match(allText, /inbox-status: "triage"[\s\S]*inbox-action: "defer"/);
  assert.doesNotMatch(allText, /WENO|ZFD|Library|jellyns/i);
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
  assert.equal(data.home.identity.displayName, "乙辛Zmod31");

  const today = read(target, "06_Diary/2026/2026-07-11.md");
  assert.match(today, /散步并重置注意力/);
  assert.match(today, /写下今日复盘/);
  assert.match(today, /#noria-demo/);
  assert.match(read(target, "02_Areas/Noria/Projects.md"), /研究写作/);
  assert.match(read(target, "01_Projects/研究写作/研究写作.md"), /检查实验总结 \[start:: 2026-07-12 11:00\]/);
  assert.match(read(target, "01_Projects/知识系统/知识系统.md"), /整理两条常青笔记 \[scheduled:: 2026-07-13 14:00\]/);
  assert.match(read(target, "02_Areas/Noria/Projects.md"), /\[\[01_Projects\/研究写作\/研究写作\.md\|研究写作\]\]/);
  assert.ok(fs.existsSync(path.join(target, "00_Inbox", "每周简报草稿.md")));
  const habits = read(target, "02_Areas/Noria/Habits.md");
  assert.match(habits, /## 打卡中的习惯/);
  assert.match(habits, /## 暂停的习惯/);
  assert.match(habits, /## 已养成习惯/);
  assert.match(habits, /## 循环任务源（每日）/);
  assert.doesNotMatch(habits, /## Active habits|## Daily recurring task source/);
  assert.match(habits, /深度工作/);
  assert.ok((habits.match(/\[completion::/g) || []).length >= 40);
  assert.match(read(target, "02_Areas/Noria/Countdowns.md"), /初稿评审/);
  assert.match(read(target, "02_Areas/Noria/Quotes.md"), /知识不在书中/);
  const inboxWorkflow = read(target, "02_Areas/Noria/Inbox workflow.md");
  assert.match(inboxWorkflow, /\| 判断去留 \| `triage` \|/);
  assert.match(inboxWorkflow, /处理完成不是第四个状态/);
  assert.match(inboxWorkflow, /不是独立的默认阶段/);
  assert.doesNotMatch(inboxWorkflow, /\| 已关闭 \||`closed`/);
  assert.doesNotMatch(inboxWorkflow, /- defer：暂缓/);

  const englishParent = fs.mkdtempSync(path.join(os.tmpdir(), "noria-demo-equivalent-en-"));
  const englishTarget = path.join(englishParent, "vault");
  const englishResult = spawnSync(process.execPath, [script, englishTarget, "--date=2026-07-11"], {
    cwd: pluginRoot,
    encoding: "utf8"
  });
  assert.equal(englishResult.status, 0, englishResult.stderr || englishResult.stdout);
  assert.deepEqual(demoInventory(target), demoInventory(englishTarget));
  const inventory = demoInventory(target);
  assert.equal(inventory.diaries, 90);
  assert.equal(inventory.inbox, 4);
  assert.equal(inventory.projects, 2);
  assert.ok(inventory.habitHistory >= 200);
  assert.equal(inventory.currentHabits, 4);

  for (const demoRoot of [target, englishTarget]) {
    assert.equal(fs.existsSync(path.join(demoRoot, retiredBrandTitle)), false);
    assert.equal(fs.existsSync(path.join(demoRoot, ".obsidian", "plugins", retiredBrand)), false);
    assert.equal(fs.existsSync(path.join(demoRoot, `.${retiredBrand}-demo-vault`)), false);
    const diaryText = filesUnder(path.join(demoRoot, "06_Diary"))
      .map((file) => fs.readFileSync(file, "utf8"))
      .join("\n");
    assert.doesNotMatch(diaryText, new RegExp(`#${retiredBrand}-demo`, "i"));
  }
});

test("Chinese showcase vault expresses IPARA, Library identity, and ninety days of source data", () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "noria-showcase-zh-"));
  const target = path.join(parent, "vault");
  const result = spawnSync(process.execPath, [script, target, "--date=2026-08-10", "--locale=zh-CN"], {
    cwd: pluginRoot,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const data = JSON.parse(read(target, ".obsidian/plugins/noria/data.json"));
  assert.equal(data.onboarding.workspaceRoot, "02_Areas/Noria");
  assert.deepEqual(data.managedPaths, {
    timelineSettings: "02_Areas/Noria/Timeline settings.md",
    templateLibrary: "02_Areas/Noria/Event library.md",
    importantDates: "02_Areas/Noria/Countdowns.md",
    habitRegistry: "02_Areas/Noria/Habits.md",
    projectRegistry: "02_Areas/Noria/Projects.md",
    inboxWorkflow: "02_Areas/Noria/Inbox workflow.md",
    inboxQueue: "02_Areas/Noria/Inbox queue.base",
    inboxRoot: "00_Inbox",
    projectsRoot: "01_Projects",
    diaryRoot: "06_Diary",
    dailyTemplate: "02_Areas/Noria/Templates/Daily Template.md",
    weeklyTemplate: "02_Areas/Noria/Templates/Weekly Template.md",
    monthlyTemplate: "02_Areas/Noria/Templates/Monthly Template.md",
    yearlyTemplate: "02_Areas/Noria/Templates/Yearly Template.md"
  });
  assert.equal(data.home.identity.displayName, "乙辛Zmod31");
  assert.equal(data.home.identity.greetingName, "乙辛Zmod31");
  assert.equal(data.home.identity.avatarPath, "99_Attachment/乙辛Zmod31头像.jpg");
  assert.equal(data.home.identity.quoteListPath, "02_Areas/Noria/Quotes.md");

  for (const root of ["00_Inbox", "01_Projects", "02_Areas", "03_Resources", "04_Archives", "05_MOC", "06_Diary", "99_Attachment"]) {
    assert.ok(fs.existsSync(path.join(target, root)), `missing ${root}`);
  }
  assert.equal(fs.existsSync(path.join(target, "Noria")), false);
  assert.ok(fs.statSync(path.join(target, "99_Attachment", "乙辛Zmod31头像.jpg")).size > 10000);
  assert.ok((read(target, "02_Areas/Noria/Quotes.md").match(/^- /gm) || []).length >= 12);
  assert.ok(fs.existsSync(path.join(target, "05_MOC", "知识管理·MOC.md")));
  assert.ok(fs.existsSync(path.join(target, "03_Resources", "知识工作", "渐进式提炼.md")));
  assert.ok(fs.existsSync(path.join(target, "04_Archives", "01_Projects", "工作区初始化", "工作区初始化.md")));

  const diaryFiles = filesUnder(path.join(target, "06_Diary"))
    .filter((file) => /\d{4}-\d{2}-\d{2}\.md$/.test(file));
  assert.equal(diaryFiles.length, 90);
  const diaryText = diaryFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
  assert.equal((diaryText.match(/^created: "\d{4}-\d{2}-\d{2}"$/gm) || []).length, 90);
  assert.match(diaryText, /#noria-demo/);
  assert.match(diaryText, /## 复盘/);
  assert.equal(Object.prototype.hasOwnProperty.call(data, "statsSnapshot"), false);
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
