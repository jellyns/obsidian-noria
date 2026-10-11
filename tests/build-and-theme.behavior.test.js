const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { sourcePath } = require("./source-paths.cjs");

const pluginRoot = path.resolve(__dirname, "..");

function pluginPath(...parts) {
  return sourcePath(path.join(...parts).replace(/\\/g, "/"));
}

function cssBlock(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source.match(new RegExp(`${escaped}\\s*\\{[\\s\\S]*?\\n\\}`))?.[0] || "";
}

function readSourceTree(root) {
  const sources = {};
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    // Generated runtime strings duplicate the sources below; inspect their owners.
    if (entry.name === 'generated') continue;
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) Object.assign(sources, readSourceTree(fullPath));
    else if (/\.(?:js|css)$/.test(entry.name)) sources[path.relative(pluginRoot, fullPath).replace(/\\/g, '/')] = fs.readFileSync(fullPath, "utf8");
  }
  return sources;
}

function assertNoPattern(source, pattern, message) {
  const match = pattern.exec(source);
  assert.equal(match === null, true, match ? `${message} (line ${source.slice(0, match.index).split('\n').length}: ${match[0].trim()})` : message);
}

// Bases owns this asynchronously rendered heading. Keep the single local rule
// instead of attaching a second DOM observer just to hide its empty group label.
function withoutEmptyBaseHeading(source) {
  return source.replace('.noria-period-base .bases-group-heading:has(.bases-group-value:empty) { display:none; }', '');
}

function withoutHiddenEnforcement(source) {
  const selectors = new Set([
    '.noria-agent-settings [hidden]', '.noria-suggestion-replies [hidden]', '.noria-inbox-card [hidden]',
    '.noria-media-editor [hidden]', '.noria-media-subpage[hidden]', '.noria-library [hidden]',
    '.noria-media-page-tools[hidden]', '.noria-library-display-tools[hidden]',
    '.noria-media-classification-editor button.noria-media-classification-restore[hidden]',
    '.noria-record-entry-editor [hidden]'
  ]);
  return source.replace(/([^{}]+)\{\s*display:\s*none\s*!important;\s*\}/g,(rule,selector)=>
    selector.split(',').every(part=>selectors.has(part.trim())) ? '' : rule);
}

test("package scripts use the checked public build for normal and release builds", () => {
  const pkg = JSON.parse(fs.readFileSync(pluginPath("package.json"), "utf8"));

  assert.match(pkg.scripts.build, /build-embedded-runtime\.mjs/);
  assert.match(pkg.scripts.build, /node scripts\/build-plugin\.mjs/);
  assert.equal(pkg.scripts["build:release"], "npm run build");
  assert.match(pkg.scripts["release:check"], /npm run build:release/);
  assert.match(pkg.scripts["release:check"], /release-check\.mjs/);
  assert.match(pkg.scripts.check, /npm run build/);
  assert.match(pkg.scripts.check, /npm test/);
  assert.match(pkg.devDependencies.esbuild, /^\^/);
  assert.equal(fs.existsSync(pluginPath("src", "main.js")), true);
  assert.equal(fs.existsSync(pluginPath("main.js")), true);
});

test("released plugin bundle avoids direct filesystem and shell execution capabilities", () => {
  const source = fs.readFileSync(pluginPath("src", "main.js"), "utf8");
  const bundle = fs.readFileSync(pluginPath("main.js"), "utf8");
  const forbidden = [
    /require\(["'](?:node:)?fs["']\)/,
    /require\(["'](?:node:)?child_process["']\)/,
    /powershell(?:\.exe)?/i,
    /Set-Clipboard/i,
    /\.execFile\s*\(/
  ];

  for (const pattern of forbidden) {
    assert.doesNotMatch(source, pattern);
    assert.doesNotMatch(bundle, pattern);
  }
  assert.doesNotMatch(bundle, /clipboard\.(?:read|readText)\s*\(/);
});

test("release sources follow the supported style subset", () => {
  const sources = {
    ...readSourceTree(path.join(pluginRoot, "src")),
    "release stylesheet": fs.readFileSync(pluginPath("styles.css"), "utf8"),
    "Home stylesheet source": fs.readFileSync(pluginPath("views", "dashboard", "home", "sections", "bootstrap-style", "view.js"), "utf8"),
    "task board stylesheet": fs.readFileSync(pluginPath("views", "tasks-calendar", "default.css"), "utf8"),
    "task timeline stylesheet": fs.readFileSync(pluginPath("views", "task-timeline", "native.css"), "utf8"),
    "task timeline shell stylesheet": fs.readFileSync(pluginPath("views", "task-timeline", "shell.css"), "utf8")
  };
  const forbidden = [
    [/display\s*:\s*contents\b/, "display: contents"],
    [/(?:^|\n)\s*(?:columns|column-(?:count|width|gap|rule(?:-[a-z-]+)?))\s*:[^{};\n]+;/, "multicolumn layout"],
    [/\bscrollbar-(?:color|width)\s*:|::-webkit-scrollbar/, "custom scrollbar styling"],
    [/\btext-decoration(?:-[a-z-]+)?\s*:\s*(?!none\b)\S/, "custom text decoration"],
    [/(?:-webkit-)?mask(?:-[a-z-]+)?\s*:/, "CSS masks"],
    [/\bclip-path\s*:/, "clip-path"],
    [/\b(?:ui-monospace|system-ui)\b|-apple-system/, "extended system font aliases"],
    [/:has\s*\(/, ":has selectors"],
    [/!important\b/, "important declarations"]
  ];

  for (const [label, source] of Object.entries(sources)) {
    // Accessibility-only clipping and scoped hidden-state enforcement are
    // deliberate exceptions, not decorative clipping or cascade overrides.
    const checkedSource = withoutHiddenEnforcement(withoutEmptyBaseHeading(source))
      .replace(/(\.noria-trend-announcement\{[^{}]*?)clip-path:inset\(50%\);/, '$1')
      // Preserve the ordinary link affordance in embedded Bases, not decorative text.
      .replace('.noria-period-base .internal-link:hover { color:var(--text-accent);text-decoration:underline; }', '')
      .replace(/(\.tasksCalendar:is\(\[view='week'\],\[view='day'\]\)\.planner-chrome \.timeLane \[data-tc-overflow-hidden='true'\] \{ display: none) !important(; \})/g, '$1$2');
    for (const [pattern, feature] of forbidden) {
      assertNoPattern(checkedSource, pattern, `${label} should not use ${feature}`);
    }
  }
});

test("runtime queries stay scoped except reviewed discovery and explicit file selection, and never read the clipboard", () => {
  const sources = readSourceTree(path.join(pluginRoot, "src"));
  // Metadata-only recovery must find conversations under old roots and notes
  // moved outside the current query scope. Unrelated note bodies stay unread.
  const discovery = {
    'src/suggestion-reply-library.js': {getMarkdownFiles:1},
    'src/suggestion-reply-library-ui.js': {getMarkdownFiles:1},
    // Focus recovery inspects the native block index, reading bodies only for
    // explicit focus anchors. The source-boundary behavior test guards this.
    'src/focus-records.js': {getMarkdownFiles:1},
    // Explicit picker actions list names, without reading unselected bodies.
    'src/media-workspace.js': {getMarkdownFiles:1,getFiles:1},
    'src/shortcut-card.js': {getFiles:1},
    'src/media-content-settings.js': {getMarkdownFiles:1},
    'src/template-file.js': {getMarkdownFiles:1},
    // Experience API bounds body reads by validated filename dates. Its behavior
    // tests protect cross-folder links, range limits and the read boundary.
    'src/media-experiences.js': {getMarkdownFiles:1}
  };
  const forbidden = [
    [/\bgetMarkdownFiles\s*(?:\?\.)?\s*\(/, "getMarkdownFiles"],
    [/\bgetFiles\s*(?:\?\.)?\s*\(/, "getFiles"],
    [/clipboard\.(?:read|readText)\s*\(/, "clipboard reads"],
    [/require\(["']electron["']\)/, "Electron clipboard fallback"]
  ];

  for (const [label, source] of Object.entries(sources)) {
    for (const [pattern, capability] of forbidden) {
      if (discovery[label]?.[capability]) {
        assert.ok([...source.matchAll(new RegExp(pattern.source,'g'))].length <= discovery[label][capability], `${label}: new discovery call needs review`);
        continue;
      }
      assertNoPattern(source, pattern, `${label} should not use ${capability}`);
    }
  }
  // Draft buttons and the selected-text context menu only write after an explicit action.
  const workspace = fs.readFileSync(pluginPath("src/review-workspace.js"), "utf8");
  const adoption=fs.readFileSync(pluginPath("src/task-adoption.js"),"utf8");
  assert.match(adoption,/onClick\(\(\)=>navigator\.clipboard\.writeText\(selection\.quote\)\)/);
  assert.match(workspace, /this\.action\(actions, this\.plugin\.t\("review\.final\.copyRecovery"\), async \(\) => \{\s*try \{ await navigator\.clipboard\.writeText\(payload\.body\)/);
});

test("release styles avoid parent-query invalidation and duplicate completed-task declarations", () => {
  const sources = {
    "release stylesheet": fs.readFileSync(pluginPath("styles.css"), "utf8"),
    "Home stylesheet source": fs.readFileSync(pluginPath("views", "dashboard", "home", "sections", "bootstrap-style", "view.js"), "utf8"),
    "task board stylesheet": fs.readFileSync(pluginPath("views", "tasks-calendar", "default.css"), "utf8"),
    "task timeline stylesheet": fs.readFileSync(pluginPath("views", "task-timeline", "native.css"), "utf8")
  };

  for (const [label, source] of Object.entries(sources)) {
    assertNoPattern(withoutEmptyBaseHeading(source), /:has\s*\(/, `${label} should not use parent-query selectors`);
  }

  const completedToggle = sources["Home stylesheet source"].match(
    /\.dashboard-period-task-completed-toggle\s*\{[\s\S]*?\n\s{4}\}/
  )?.[0] || "";
  assert.ok(completedToggle, "completed-task toggle style should exist");
  for (const property of ["margin", "padding", "background", "color"]) {
    const declarations = completedToggle.match(new RegExp(`\\b${property}\\s*:`, "g")) || [];
    assert.equal(declarations.length, 1, `${property} should be declared once in the completed-task toggle`);
  }
});

test("settings tabs and ordinary action buttons keep low visual density", () => {
  const css = fs.readFileSync(pluginPath("styles.css"), "utf8");
  const chrome = cssBlock(css, ".noria-settings-chrome");
  const header = cssBlock(css, ".noria-settings-header");
  const tabs = cssBlock(css, ".noria-settings-tabs");
  const tab = cssBlock(css, ".noria-settings-tab");
  const activeTab = cssBlock(css, ".noria-settings-tab.is-active");
  const plainButton = cssBlock(css, ".noria-settings-tab-content .setting-item-control button:not(.mod-cta):not(.mod-warning)");
  const controlGrid = cssBlock(css, ".noria-settings-control-grid");
  const statusCard = cssBlock(css, ".noria-settings-status-card");
  const ordinaryRows = cssBlock(css, ".noria-settings-tab-content > .setting-item,\n.noria-settings-disclosure > .setting-item");
  const adjacentRows = cssBlock(css, ".noria-settings-tab-content > .setting-item + .setting-item,\n.noria-settings-disclosure > .setting-item + .setting-item");

  assert.ok(chrome, "settings navigation should remain one sticky product header");
  assert.match(chrome, /position:\s*sticky/);
  assert.match(chrome, /background:\s*var\(--background-primary\)/);

  assert.ok(header, "settings title and search should share one compact header");
  assert.match(header, /display:\s*flex/);
  assert.match(header, /align-items:\s*center/);
  assert.match(header, /justify-content:\s*space-between/);

  assert.ok(tabs, "settings tabs wrapper should be styled");
  assert.match(tabs, /gap:\s*0/);
  assert.match(tabs, /flex-wrap:\s*nowrap/);
  assert.match(tabs, /overflow-x:\s*auto/);
  assert.match(tabs, /border-bottom:\s*1px solid/);
  assert.match(tabs, /width:\s*100%/);
  assert.match(tabs, /background:\s*transparent/);
  assert.doesNotMatch(tabs, /padding-bottom:\s*10px/);

  assert.ok(tab, "settings tab should be styled");
  assert.match(tab, /height:\s*30px/);
  assert.match(tab, /border:\s*0/);
  assert.match(tab, /background:\s*transparent/);
  assert.match(tab, /box-shadow:\s*none/);

  assert.ok(activeTab, "active settings tab should have its own compact state");
  assert.match(activeTab, /background:\s*color-mix\(in srgb,\s*var\(--interactive-accent\)\s*8%,\s*transparent\)/);
  assert.match(activeTab, /box-shadow:\s*none/);
  assert.match(css, /\.noria-settings-tab\.is-active::after\s*\{[\s\S]*height:\s*2px/);
  assert.match(css, /\.noria-settings-search\s*\{[\s\S]*position:\s*relative/);
  assert.match(css, /\.noria-settings-search-results\s*\{[\s\S]*position:\s*absolute/);
  assert.match(css, /\.noria-settings-search-result\s*\{[\s\S]*border:\s*0/);

  assert.ok(plainButton, "ordinary settings buttons should be secondary by default");
  assert.match(plainButton, /box-shadow:\s*none/);
  assert.match(plainButton, /height:\s*30px/);
  assert.match(plainButton, /background:\s*transparent/);

  assert.ok(controlGrid, "settings control center should be styled");
  assert.match(controlGrid, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(controlGrid, /border-top:\s*1px solid/);
  assert.match(controlGrid, /border-bottom:\s*1px solid/);

  assert.ok(statusCard, "settings status cards should be flat summary cells");
  assert.match(statusCard, /display:\s*flex/);
  assert.match(statusCard, /align-items:\s*center/);
  assert.match(statusCard, /min-height:\s*0/);
  assert.match(statusCard, /border:\s*0/);
  assert.match(statusCard, /border-radius:\s*0/);
  assert.match(statusCard, /background:\s*transparent/);
  assert.match(statusCard, /box-shadow:\s*none/);
  assert.doesNotMatch(statusCard, /min-height:\s*96px/);

  assert.ok(ordinaryRows, "ordinary Noria settings should share one scoped flat-row foundation");
  assert.match(ordinaryRows, /margin:\s*0/);
  assert.match(ordinaryRows, /padding:\s*9px 0/);
  assert.match(ordinaryRows, /border:\s*0/);
  assert.doesNotMatch(ordinaryRows, /border-top/);
  assert.match(ordinaryRows, /border-radius:\s*0/);
  assert.match(ordinaryRows, /background:\s*transparent/);
  assert.match(ordinaryRows, /box-shadow:\s*none/);
  assert.ok(adjacentRows, "only adjacent settings in the same group should receive separators");
  assert.match(adjacentRows, /border-top:\s*1px solid var\(--noria-border-subtle/);
});

test("settings outer chrome typography uses shared Noria setting tokens", () => {
  const css = fs.readFileSync(pluginPath("styles.css"), "utf8");
  const tab = cssBlock(css, ".noria-settings-tab");
  const searchInput = cssBlock(css, '.noria-settings-search input[type="search"]');
  const statusTitle = cssBlock(css, ".noria-settings-status-card-title,\n.noria-settings-path-group-title");
  const statusValue = cssBlock(css, ".noria-settings-status-card-value");
  const statusDesc = cssBlock(css, ".noria-settings-status-card-desc");
  const bannerTitle = cssBlock(css, ".noria-settings-banner-title,\n.noria-settings-setup-title,\n.noria-itemview-disabled-title");
  const bannerDesc = cssBlock(css, ".noria-settings-banner-desc,\n.noria-settings-setup-desc,\n.noria-itemview-disabled-desc");
  const setupList = cssBlock(css, ".noria-settings-setup-list");
  const pathCount = cssBlock(css, ".noria-settings-path-group-count");
  const diagnosticsPre = cssBlock(css, ".noria-settings-diagnostics pre");

  assert.match(css, /--noria-settings-title-font-size:\s*13px/);
  assert.match(css, /--noria-settings-title-weight:\s*700/);
  assert.match(css, /--noria-settings-value-font-size:\s*15px/);
  assert.match(css, /--noria-settings-value-weight:\s*720/);
  assert.match(css, /--noria-settings-value-line-height:\s*1\.25/);

  assert.match(tab, /font-size:\s*var\(--noria-settings-label-font-size,\s*12px\)/);
  assert.match(tab, /font-weight:\s*var\(--noria-settings-label-weight,\s*650\)/);
  assert.match(searchInput, /font-size:\s*var\(--noria-settings-label-font-size,\s*12px\)/);
  assert.match(statusTitle, /font-size:\s*var\(--noria-settings-caption-font-size,\s*11px\)/);
  assert.match(statusTitle, /font-weight:\s*var\(--noria-settings-label-weight,\s*650\)/);
  assert.match(statusValue, /font-size:\s*var\(--noria-settings-label-font-size,\s*12px\)/);
  assert.match(statusValue, /font-weight:\s*var\(--noria-settings-row-title-weight,\s*680\)/);
  assert.match(statusValue, /line-height:\s*1\.3/);
  assert.match(statusDesc, /font-size:\s*var\(--noria-settings-caption-font-size,\s*11px\)/);
  assert.match(statusDesc, /line-height:\s*var\(--noria-settings-caption-line-height,\s*1\.45\)/);
  assert.match(bannerTitle, /font-size:\s*var\(--noria-settings-title-font-size,\s*13px\)/);
  assert.match(bannerTitle, /font-weight:\s*var\(--noria-settings-title-weight,\s*700\)/);
  assert.match(bannerDesc, /font-size:\s*var\(--noria-settings-label-font-size,\s*12px\)/);
  assert.match(bannerDesc, /line-height:\s*var\(--noria-settings-caption-line-height,\s*1\.45\)/);
  assert.match(setupList, /font-size:\s*var\(--noria-settings-label-font-size,\s*12px\)/);
  assert.match(pathCount, /font-size:\s*var\(--noria-settings-caption-font-size,\s*11px\)/);
  assert.match(pathCount, /font-weight:\s*var\(--noria-settings-label-weight,\s*650\)/);
  assert.match(diagnosticsPre, /font-size:\s*var\(--noria-settings-caption-font-size,\s*11px\)/);
});

test("settings disclosures use generic chrome before diagnostics-specific content", () => {
  const css = fs.readFileSync(pluginPath("styles.css"), "utf8");
  const disclosure = cssBlock(css, ".noria-settings-disclosure");
  const collapsedDisclosure = cssBlock(css, ".noria-settings-disclosure:not([open])");
  const summary = cssBlock(css, ".noria-settings-disclosure summary");
  const adjacentDisclosure = cssBlock(css, ".noria-settings-disclosure + .noria-settings-disclosure");
  const chevron = cssBlock(css, ".noria-settings-disclosure-chevron");
  const openChevron = cssBlock(css, ".noria-settings-disclosure[open] > summary > .noria-settings-disclosure-chevron,\n.noria-settings-path-group[open] > summary > .noria-settings-disclosure-chevron");
  const disclosureRow = cssBlock(css, ".noria-settings-disclosure .setting-item");
  const diagnostics = cssBlock(css, ".noria-settings-diagnostics pre");

  assert.match(disclosure, /margin:\s*0/);
  assert.match(disclosure, /padding:\s*0/);
  assert.match(disclosure, /border:\s*0/);
  assert.match(disclosure, /border-radius:\s*0/);
  assert.match(disclosure, /background:\s*transparent/);
  assert.doesNotMatch(collapsedDisclosure, /border-color/);
  assert.match(summary, /display:\s*flex/);
  assert.match(summary, /align-items:\s*center/);
  assert.match(summary, /width:\s*100%/);
  assert.match(summary, /min-height:\s*38px/);
  assert.match(summary, /font-size:\s*var\(--noria-settings-label-font-size,\s*12px\)/);
  assert.match(summary, /font-weight:\s*var\(--noria-settings-label-weight,\s*650\)/);
  assert.match(disclosureRow, /margin:\s*0/);
  assert.match(disclosureRow, /padding:\s*9px 0/);
  assert.match(adjacentDisclosure, /border-top:\s*1px solid var\(--noria-border-subtle/);
  assert.match(chevron, /transition:\s*transform/);
  assert.match(openChevron, /transform:\s*rotate\(90deg\)/);
  assert.match(disclosureRow, /border-top:\s*0/);
  assert.match(disclosureRow, /background:\s*transparent/);
  assert.match(disclosureRow, /border-radius:\s*0/);
  assert.match(disclosureRow, /box-shadow:\s*none/);
  assert.match(diagnostics, /white-space:\s*pre-wrap/);
});

test("settings feature switch rows stay compact inside the folded disclosure", () => {
  const css = fs.readFileSync(pluginPath("styles.css"), "utf8");
  const row = cssBlock(css, ".noria-settings-feature-switches .noria-settings-module-row");
  const name = cssBlock(css, ".noria-settings-feature-switches .noria-settings-module-row .setting-item-name");
  const desc = cssBlock(css, ".noria-settings-feature-switches .noria-settings-module-row .setting-item-description");
  const control = cssBlock(css, ".noria-settings-feature-switches .noria-settings-module-row .setting-item-control");

  assert.match(row, /min-height:\s*34px/);
  assert.match(row, /margin-top:\s*6px/);
  assert.match(row, /padding:\s*6px 0 0/);
  assert.doesNotMatch(row, /border-radius/);
  assert.doesNotMatch(row, /box-shadow/);
  assert.match(name, /font-size:\s*var\(--noria-settings-label-font-size,\s*12px\)/);
  assert.match(name, /font-weight:\s*var\(--noria-settings-label-weight,\s*650\)/);
  assert.match(desc, /font-size:\s*var\(--noria-settings-caption-font-size,\s*11px\)/);
  assert.match(desc, /line-height:\s*var\(--noria-settings-caption-line-height,\s*1\.45\)/);
  assert.match(control, /min-width:\s*min\(100%,\s*220px\)/);
});

test("settings path diagnostics use flat folded rows instead of cards", () => {
  const css = fs.readFileSync(pluginPath("styles.css"), "utf8");
  const pathGroup = cssBlock(css, ".noria-settings-path-group");
  const adjacentPathGroup = cssBlock(css, ".noria-settings-path-group + .noria-settings-path-group");
  const needsWork = cssBlock(css, ".noria-settings-path-group--needs-work");
  const openGroup = cssBlock(css, ".noria-settings-path-group[open]");
  const pathSetting = cssBlock(css, ".noria-settings-path-group .setting-item");

  assert.match(pathGroup, /margin:\s*0/);
  assert.match(pathGroup, /padding:\s*0/);
  assert.match(pathGroup, /border:\s*0/);
  assert.doesNotMatch(pathGroup, /border-top/);
  assert.match(pathGroup, /border-radius:\s*0/);
  assert.match(pathGroup, /background:\s*transparent/);
  assert.match(pathGroup, /box-shadow:\s*none/);
  assert.match(adjacentPathGroup, /border-top:\s*1px solid var\(--noria-border-subtle\)/);
  assert.match(css, /\.noria-settings-path-group summary\s*\{[\s\S]*min-height:\s*38px/);
  assert.match(needsWork, /border-top-color:\s*color-mix\(in srgb,\s*var\(--color-yellow\)\s*36%,\s*var\(--noria-border-subtle\)\)/);
  assert.match(openGroup, /background:\s*transparent/);
  assert.match(pathSetting, /padding:\s*6px 0 0/);
  assert.doesNotMatch(pathSetting, /border-radius/);
});

test("settings action buttons use low-noise action states", () => {
  const css = fs.readFileSync(pluginPath("styles.css"), "utf8");
  const button = cssBlock(css, ".noria-settings-action-button");
  const pending = cssBlock(css, ".noria-settings-action-button[data-noria-action-state=\"pending\"]");
  const failed = cssBlock(css, ".noria-settings-action-button[data-noria-action-state=\"failed\"]");

  assert.match(button, /font-size:\s*var\(--noria-settings-label-font-size,\s*12px\)/);
  assert.match(button, /min-height:\s*28px/);
  assert.match(button, /box-shadow:\s*none/);
  assert.match(pending, /opacity:\s*0\.72/);
  assert.match(failed, /color:\s*var\(--text-error\)/);
  assert.doesNotMatch(pending, /box-shadow|border|outline/);
  assert.doesNotMatch(failed, /box-shadow|border|outline/);
});

test("theme tokens define light and dark Noria semantic surfaces", () => {
  const css = fs.readFileSync(pluginPath("styles.css"), "utf8");
  const taskCalendarCss = fs.readFileSync(pluginPath("views", "tasks-calendar", "default.css"), "utf8");

  for (const token of [
    "--noria-surface-1",
    "--noria-surface-2",
    "--noria-surface-raised",
    "--noria-text-primary",
    "--noria-text-muted",
    "--noria-border-subtle",
    "--noria-shadow-card",
    "--noria-accent"
  ]) {
    assert.match(css, new RegExp(`${token}\\s*:`));
  }
  assert.match(css, /\.theme-dark\s+\.workspace-leaf-content\[data-type\^="noria"\]/);
  assert.doesNotMatch(css, /background:\s*#fff(?:fff)?\b/i);
  assert.doesNotMatch(css, /background-color:\s*#fff(?:fff)?\b/i);
  assert.match(taskCalendarCss, /\.theme-dark\s+\.tasksCalendar\s*\{/);
  assert.match(taskCalendarCss, /\.theme-dark\s+\.tasksCalendar\s*\{[\s\S]*--noria-surface-1:\s*color-mix\(in srgb,\s*var\(--background-primary\)/);
  assert.match(taskCalendarCss, /\.theme-dark\s+\.tasksCalendar\s*\{[\s\S]*--noria-status-default-surface-top:\s*color-mix\(in srgb,\s*var\(--background-primary\)/);
  assert.match(taskCalendarCss, /\.theme-dark\s+\.tasksCalendar\s*\{[\s\S]*--noria-toolbar-hover-bg:\s*linear-gradient\(180deg,\s*color-mix\(in srgb,\s*var\(--interactive-accent\)/);
});

test("daily-clean styling is bundled for Noria diary templates", () => {
  const css = fs.readFileSync(pluginPath("styles.css"), "utf8");

  assert.match(css, /\.markdown-preview-view\.daily-clean/);
  assert.match(css, /\.markdown-source-view\.daily-clean/);
  assert.match(css, /\.markdown-rendered\.daily-clean/);
  assert.match(css, /\.markdown-preview-view\.daily-clean\s+h2/);
  assert.match(css, /\.markdown-source-view\.daily-clean\s+\.markdown-rendered\s+h2/);
  assert.match(css, /\.theme-dark\s+\.markdown-preview-view\.daily-clean/);
  assert.doesNotMatch(css, /(^|[\n}])\s*\.daily-clean\s+h2\s*\{/);
});

test("task calendar core surfaces avoid hardcoded white islands", () => {
  const runtime = fs.readFileSync(pluginPath("views", "tasks-calendar", "runtime-core.js"), "utf8");
  const taskCalendarCss = fs.readFileSync(pluginPath("views", "tasks-calendar", "default.css"), "utf8");

  const rootBlock = taskCalendarCss.match(/\.tasksCalendar\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(rootBlock, "tasks calendar root token block should exist");
  assert.match(rootBlock, /--noria-surface-1:\s*color-mix\(in srgb,\s*var\(--background-primary\)/);
  assert.match(rootBlock, /--noria-surface-2:\s*color-mix\(in srgb,\s*var\(--background-secondary\)/);
  assert.doesNotMatch(rootBlock, /--noria-surface-1:\s*rgba\(255,\s*255,\s*255/i);
  assert.doesNotMatch(rootBlock, /--noria-surface-2:\s*rgba\(248,\s*251,\s*255/i);

  assert.doesNotMatch(runtime, /popup\.style\.background\s*=\s*"linear-gradient\(180deg,\s*rgba\(255,255,255/);
  assert.doesNotMatch(taskCalendarCss, /\.tc-button-row\s*\{[\s\S]*?background:\s*#fff(?:fff)?/i);
});

test("touched periodic runtime surfaces do not add direct white backgrounds", () => {
  const statusSelector = fs.readFileSync(pluginPath("views", "periodic", "statusSelector.js"), "utf8");

  assert.doesNotMatch(statusSelector, /rgba\(255,\s*255,\s*255/i);
  assert.doesNotMatch(statusSelector, /background:\s*#fff(?:fff)?\b/i);
});

test("next touched runtime surfaces avoid direct white islands", () => {
  const files = [
    "views/dashboard/home/sections/guide-panels/view.js",
    "views/dashboard/periodic-stats/impl-legacy/view.js"
  ];

  for (const rel of files) {
    const source = fs.readFileSync(pluginPath(rel), "utf8");
    assert.doesNotMatch(source, /rgba\(255,\s*255,\s*255/i, rel);
    assert.doesNotMatch(source, /#fff(?:fff)?\b/i, rel);
    assert.doesNotMatch(source, /background:\s*white\b/i, rel);
  }

  const taskCalendarCss = fs.readFileSync(pluginPath("views", "tasks-calendar", "default.css"), "utf8");
  for (const selector of [
    ".tasksCalendar .tc-timeline-quick-popover-card",
    ".tasksCalendar:is([view='week'],[view='day']).planner-chrome .tc-planner-lab-panel",
    ".tc-planner-te-time-popover"
  ]) {
    const block = taskCalendarCss.match(new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{[\\s\\S]*?\\n\\}"))?.[0] || "";
    assert.ok(block, `${selector} block should exist`);
    assert.doesNotMatch(block, /rgba\(255,\s*255,\s*255/i, selector);
    assert.doesNotMatch(block, /#fff(?:fff)?\b/i, selector);
  }
});

test("shared charts boards and manager surfaces avoid direct white islands", () => {
  const files = [
    "views/dashboard/core/components/boards/habit-week-matrix.js",
    "views/dashboard/core/components/boards/workload-week-rings.js",
    "views/dashboard/core/components/ui/manager-panel.js",
    "views/dashboard/periodic-stats/impl-legacy/fallbacks/charts.js",
    "views/dashboard/periodic-stats/impl-legacy/fallbacks/boards.js",
    "views/dashboard/home/sections/overview-columns/view.js"
  ];

  for (const rel of files) {
    const source = fs.readFileSync(pluginPath(rel), "utf8");
    assert.doesNotMatch(source, /rgba\(255,\s*255,\s*255/i, rel);
    assert.doesNotMatch(source, /background:\s*#fff(?:fff)?\b/i, rel);
    assert.doesNotMatch(source, /backgroundColor:\s*["']#fff(?:fff)?\b/i, rel);
    assert.doesNotMatch(source, /background:\s*white\b/i, rel);
  }
});

test("tail runtime surfaces use semantic white tokens instead of raw white values", () => {
  const files = [
    "views/periodic/focusPanel.js",
    "views/periodic/habitCheckin.js",
    "views/dashboard/core/theme/dashboard-theme.js",
    "views/dashboard/core/components/charts/strip-heat-series.js",
    "views/dashboard/core/components/charts/stacked-distribution-bar.js",
    "views/dashboard/core/components/charts/chart-palette.js",
    "views/dashboard/core/components/charts/year-heatmap-calendar.js",
    "views/dashboard/home/sections/trends-and-stats/blocks/daily-state/view.js"
  ];

  for (const rel of files) {
    const source = fs.readFileSync(pluginPath(rel), "utf8");
    assert.doesNotMatch(source, /rgba\(255,\s*255,\s*255/i, rel);
    assert.doesNotMatch(source, /#fff(?:fff)?\b/i, rel);
    assert.doesNotMatch(source, /color:\s*white\b/i, rel);
  }

  const chartPalette = fs.readFileSync(pluginPath("views/dashboard/core/components/charts/chart-palette.js"), "utf8");
  assert.match(chartPalette, /lineMarkerFill:\s*"var\(--noria-chart-marker-fill/);

  const focusPanel = fs.readFileSync(pluginPath("views/periodic/focusPanel.js"), "utf8");
  assert.doesNotMatch(focusPanel, /--checkbox-marker-color|--checkbox-border-color|accent-color/);
});

test("release visual contract defines dark-mode module tokens and avoids css text content", () => {
  const css = fs.readFileSync(pluginPath("styles.css"), "utf8");
  const taskCalendarCss = fs.readFileSync(pluginPath("views", "tasks-calendar", "default.css"), "utf8");

  for (const token of [
    "--noria-divider-subtle",
    "--noria-module-home",
    "--noria-module-tasks",
    "--noria-module-review",
    "--noria-review-evidence-accent",
    "--noria-review-generated-accent",
    "--noria-review-final-accent",
    "--noria-review-warning-accent"
  ]) {
    assert.match(css, new RegExp(`${token}\\s*:`), token);
  }

  for (const token of [
    "--noria-tc-month-cell",
    "--noria-tc-month-cell-muted",
    "--noria-tc-month-cell-today",
    "--noria-tc-grid-line",
    "--noria-tc-task-surface",
    "--noria-tc-task-rail",
    "--noria-tc-task-status-overdue-rail",
    "--noria-tc-empty-surface"
  ]) {
    assert.match(taskCalendarCss, new RegExp(`${token}\\s*:`), token);
  }

  assert.match(taskCalendarCss, /\.theme-dark\s+\.tasksCalendar\[view='month'\]\s+\.cell\s*\{[\s\S]*background:\s*var\(--noria-tc-month-cell\)/);
  assert.match(taskCalendarCss, /\.theme-dark\s+\.tasksCalendar\[view='month'\]\s+\.tc-cal-item\s*\{[\s\S]*--tc-task-rail:\s*var\(--noria-tc-task-rail\)/);
  assert.match(taskCalendarCss, /\.theme-dark\s+\.tasksCalendar\[view='list'\]\s+\.matrixNoTasks/);

  const cssContentHan = [...`${css}\n${taskCalendarCss}`.matchAll(/content:\s*["'][^"']*[\u4e00-\u9fff][^"']*["']/g)].map((m) => m[0]);
  assert.deepEqual(cssContentHan, [], `CSS content must not hardcode localized UI text: ${cssContentHan.join(", ")}`);
});

test("home release dark contract uses semantic title divider and metric card tokens", () => {
  const bootstrap = fs.readFileSync(pluginPath("views", "dashboard", "home", "sections", "bootstrap-style", "view.js"), "utf8");
  const theme = fs.readFileSync(pluginPath("views", "dashboard", "core", "theme", "dashboard-theme.js"), "utf8");
  const overviewMetrics = fs.readFileSync(pluginPath("views", "dashboard", "home", "sections", "overview-metrics", "view.js"), "utf8");

  for (const token of ["--dash-surface", "--dash-surface-raised", "--dash-surface-muted", "--dash-surface-tinted"]) {
    assert.match(bootstrap, new RegExp(`${token}\\s*:`), token);
  }
  for (const token of ["--dash-heading-text", "--dash-heading-accent", "--dash-heading-divider"]) {
    assert.match(bootstrap, new RegExp(`${token}\\s*:`), token);
  }
  assert.match(bootstrap, /--dash-heading-text:\s*color-mix\(in srgb,\s*var\(--text-normal\)\s+88%/);
  assert.match(bootstrap, /--dash-title-color:\s*var\(--dash-heading-text\)/);
  assert.match(bootstrap, /--dash-row-hover-bg:\s*color-mix\(in srgb,\s*var\(--background-primary\)[\s\S]*var\(--noria-module-home/);
  assert.doesNotMatch(bootstrap, /--dash-surface(?:-raised|-muted|-tinted)?:\s*color-mix\(in srgb,[^;]*--noria-module-home/);
  assert.match(bootstrap, /border-bottom:\s*2px dashed var\(--dash-heading-divider\)/);
  assert.doesNotMatch(bootstrap, /color:\s*#1e3a8a\b/i);
  for (const [selector, label] of [
    [/\.dashboard-home-root\s+\.dashboard-guide-card\s*\{[\s\S]*?\n\s*\}/, "guide card base block"],
    [/(?:^|\n)\s{4}\.dashboard-hero-strip\s*\{[\s\S]*?\n\s{4}\}/, "hero strip block"],
    [/(?:^|\n)\s{4}\.dashboard-identity-strip\s*\{[\s\S]*?\n\s{4}\}/, "identity strip block"],
    [/(?:^|\n)\s{4}\.dashboard-identity-avatar-wrap\s*\{[\s\S]*?\n\s{4}\}/, "identity avatar block"],
    [/(?:^|\n)\s{4}\.dashboard-moc-strip\s*\{[\s\S]*?\n\s{4}\}/, "MOC strip block"],
    [/(?:^|\n)\s{4}\.dashboard-moc-chip\s*\{[\s\S]*?\n\s{4}\}/, "MOC chip block"]
  ]) {
    const block = bootstrap.match(selector)?.[0] || "";
    assert.ok(block, `${label} should exist`);
    assert.doesNotMatch(block, /(?:linear|radial)-gradient/i, label);
    assert.match(block, /var\(--dash-surface|color-mix\(in srgb,\s*var\(--background-primary\)|--moc-chip-fill:\s*transparent/, label);
  }

  const themeHeroBlock = theme.match(/metricCardStylesHero:\s*\[[\s\S]*?\n\s*\],\n\s*metricCardStyles:/)?.[0] || "";
  assert.ok(themeHeroBlock, "dashboard theme hero metric style block should exist");
  assert.match(themeHeroBlock, /var\(--background-primary\)/);
  assert.doesNotMatch(themeHeroBlock, /background:\s*"[^"]*--noria-module-/);
  assert.doesNotMatch(themeHeroBlock, /rgba\(239,\s*246,\s*255/i);
  assert.doesNotMatch(theme, /乙辛Zmod31|99_Attachment\/乙辛Zmod31头像\.jpg/);
  assert.doesNotMatch(themeHeroBlock, /linear-gradient|radial-gradient/i);

  const runtimeHeroBlock = overviewMetrics.match(/const defaultHeroMetricStyles = \[[\s\S]*?\n\];/)?.[0] || "";
  assert.ok(runtimeHeroBlock, "overview metrics hero fallback block should exist");
  assert.match(runtimeHeroBlock, /var\(--background-primary\)/);
  assert.doesNotMatch(runtimeHeroBlock, /background:\s*"[^"]*--noria-module-/);
  assert.doesNotMatch(runtimeHeroBlock, /rgb\(241 245 249\)/);
  assert.doesNotMatch(runtimeHeroBlock, /linear-gradient|radial-gradient/i);
  assert.doesNotMatch(overviewMetrics, /radial-gradient/i);
});

test("home chart palette uses semantic contrast tokens instead of washed pastels", () => {
  const bootstrap = fs.readFileSync(pluginPath("views", "dashboard", "home", "sections", "bootstrap-style", "view.js"), "utf8");
  const palette = fs.readFileSync(pluginPath("views", "dashboard", "core", "components", "charts", "chart-palette.js"), "utf8");

  for (const token of [
    "--dash-chart-series-bars",
    "--dash-chart-series-line",
    "--dash-chart-series-grid",
    "--dash-chart-series-left",
    "--dash-chart-series-right"
  ]) {
    assert.match(bootstrap, new RegExp(`${token}\\s*:`), `${token} should be defined for Home charts`);
  }

  assert.match(bootstrap, /--dash-chart-bar-fill:\s*color-mix\(in srgb,\s*var\(--dash-chart-series-bars\)/);
  assert.match(bootstrap, /--dash-chart-bar-stroke:\s*color-mix\(in srgb,\s*var\(--dash-chart-series-bars\)/);
  assert.match(bootstrap, /--dash-chart-line-stroke:\s*var\(--dash-chart-series-line\)/);
  assert.match(bootstrap, /--dash-chart-line-marker-fill:\s*var\(--dash-surface/);
  assert.match(bootstrap, /--dash-chart-grid-stroke:\s*var\(--dash-chart-series-grid\)/);
  assert.match(bootstrap, /\.theme-dark\s*\{[\s\S]*--dash-chart-series-bars\s*:/);
  assert.match(bootstrap, /\.theme-dark\s*\{[\s\S]*--dash-chart-series-line\s*:/);
  assert.doesNotMatch(bootstrap, /--dash-chart-bar-fill:\s*rgba\(103,\s*183,\s*236/i);
  assert.doesNotMatch(bootstrap, /--dash-chart-line-marker-fill:\s*#fff(?:fff)?\b/i);

  assert.match(palette, /seriesBars:\s*"var\(--dash-chart-series-bars/);
  assert.match(palette, /seriesLine:\s*"var\(--dash-chart-series-line/);
  assert.match(palette, /barFill:\s*"color-mix\(in srgb,\s*var\(--dash-chart-series-bars/);
  assert.match(palette, /lineMarkerFill:\s*"var\(--noria-chart-marker-fill,\s*var\(--dash-surface/);
  assert.doesNotMatch(palette, /barFill:\s*"rgba\(103,\s*183,\s*236/i);
  assert.doesNotMatch(palette, /lineMarkerFill:\s*"#fff(?:fff)?\b/i);
});

test("home section titles follow daily clean heading rhythm", () => {
  const bootstrap = fs.readFileSync(pluginPath("views", "dashboard", "home", "sections", "bootstrap-style", "view.js"), "utf8");
  const sectionTitleBlock = bootstrap.match(/\.dashboard-section-title\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const sectionBeforeBlock = bootstrap.match(/\.dashboard-section-title::before\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const sectionAfterBlock = bootstrap.match(/\.dashboard-section-title::after\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const darkSectionBeforeBlock = bootstrap.match(/\.theme-dark\s+\.dashboard-section-title::before\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const darkSectionAfterBlock = bootstrap.match(/\.theme-dark\s+\.dashboard-section-title::after\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const calloutTitleBlock = bootstrap.match(/\.dashboard-home-root > \.callout\.dashboard-callout-section-wrap > \.callout-title\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const calloutAfterBlock = bootstrap.match(/\.dashboard-home-root > \.callout\.dashboard-callout-section-wrap > \.callout-title::after\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const darkCalloutAfterBlock = bootstrap.match(/\.theme-dark\s+\.dashboard-home-root > \.callout\.dashboard-callout-section-wrap > \.callout-title::after\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";

  assert.ok(sectionTitleBlock, "dashboard section title block should exist");
  assert.match(sectionTitleBlock, /padding:\s*2px 2px 10px 14px/);
  assert.match(sectionTitleBlock, /color:\s*var\(--dash-heading-text\)/);
  assert.match(sectionTitleBlock, /letter-spacing:\s*0\.01em/);
  assert.match(sectionBeforeBlock, /width:\s*5px/);
  assert.match(sectionBeforeBlock, /top:\s*2px/);
  assert.match(sectionBeforeBlock, /bottom:\s*10px/);
  assert.match(sectionAfterBlock, /left:\s*14px/);
  assert.match(sectionAfterBlock, /bottom:\s*2px/);
  assert.match(sectionAfterBlock, /width:\s*25%/);
  assert.match(sectionAfterBlock, /border-bottom:\s*2px dashed var\(--dash-heading-divider\)/);

  assert.match(calloutTitleBlock, /padding:\s*2px 2px 10px 14px/);
  assert.match(calloutAfterBlock, /left:\s*14px/);
  assert.match(calloutAfterBlock, /border-bottom:\s*2px dashed var\(--dash-heading-divider\)/);
  assert.match(darkSectionBeforeBlock, /width:\s*3px/);
  assert.match(darkSectionBeforeBlock, /opacity:\s*\.52/);
  assert.match(darkSectionAfterBlock, /border-bottom:\s*1px solid/);
  assert.doesNotMatch(darkSectionAfterBlock, /2px dashed/);
  assert.match(darkCalloutAfterBlock, /border-bottom:\s*1px solid/);
  assert.doesNotMatch(darkCalloutAfterBlock, /2px dashed/);
});

test("home dark surfaces reduce card and chip border competition", () => {
  const bootstrap = fs.readFileSync(pluginPath("views", "dashboard", "home", "sections", "bootstrap-style", "view.js"), "utf8");
  const darkGuideBlock = bootstrap.match(/\.theme-dark\s+\.dashboard-home-root\s+\.dashboard-guide-card\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const darkMocChipBlock = bootstrap.match(/\.theme-dark\s+\.dashboard-moc-chip\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const darkHeroMetricBlock = bootstrap.match(/\.theme-dark\s+\.dashboard-hero-strip__metrics \.dashboard-metrics-host--hero \.dashboard-metric-card--hero\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";

  assert.ok(darkGuideBlock, "dark guide card block should exist");
  assert.match(darkGuideBlock, /border-color:\s*color-mix\(in srgb,\s*var\(--background-modifier-border\)\s*42%,\s*transparent\)/);
  assert.match(darkGuideBlock, /box-shadow:\s*none/);

  assert.ok(darkMocChipBlock, "dark MOC chip block should exist");
  assert.match(darkMocChipBlock, /--moc-chip-fill:\s*transparent/);
  assert.match(darkMocChipBlock, /--moc-chip-ink:\s*var\(--text-normal\)/);

  assert.ok(darkHeroMetricBlock, "dark hero metric card block should exist");
  assert.match(darkHeroMetricBlock, /border-color:\s*color-mix\(in srgb,\s*var\(--background-modifier-border\)\s*42%,\s*transparent\)/);
  assert.match(darkHeroMetricBlock, /box-shadow:\s*none/);
});

test("home workbench panels use quiet panel and ghost toolbar contract", () => {
  const bootstrap = fs.readFileSync(pluginPath("views", "dashboard", "home", "sections", "bootstrap-style", "view.js"), "utf8");
  const overviewColumns = fs.readFileSync(pluginPath("views", "dashboard", "home", "sections", "overview-columns", "view.js"), "utf8");

  assert.match(overviewColumns, /dashboard-workbench-grid/);
  assert.match(overviewColumns, /dashboard-workbench-panel/);
  assert.match(overviewColumns, /data-noria-workbench-panel/);
  assert.match(overviewColumns, /dashboard-workbench-panel__head/);
  assert.match(overviewColumns, /dashboard-workbench-panel__tools/);
  assert.match(overviewColumns, /dashboard-workbench-panel__body/);
  assert.doesNotMatch(overviewColumns, /box-shadow:0 1px 4px rgba\(15,23,42,\.035\)/);

  const panelBlock = bootstrap.match(/\.dashboard-home-root\s+\.dashboard-workbench-panel\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const darkPanelBlock = bootstrap.match(/\.theme-dark\s+\.dashboard-home-root\s+\.dashboard-workbench-panel\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const titleBlock = bootstrap.match(/\.dashboard-home-root\s+\.dashboard-workbench-panel__title\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const toolButtonBlock = bootstrap.match(/\.dashboard-home-root\s+\.dashboard-workbench-panel\s+button\.dashboard-guide-icon-btn\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const toolPendingBlock = bootstrap.match(/\.dashboard-home-root\s+\.dashboard-workbench-panel\s+button\.dashboard-guide-icon-btn\[data-noria-action-state="pending"\]\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const toolFailedBlock = bootstrap.match(/\.dashboard-home-root\s+\.dashboard-workbench-panel\s+button\.dashboard-guide-icon-btn\[data-noria-action-state="failed"\]\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const bodyBlock = bootstrap.match(/\.dashboard-home-root\s+\.dashboard-workbench-panel__body\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";

  assert.ok(panelBlock, "workbench panel block should exist");
  assert.match(panelBlock, /background:\s*color-mix\(in srgb,\s*var\(--dash-surface\)\s*88%/);
  assert.match(panelBlock, /box-shadow:\s*none/);
  assert.match(panelBlock, /border:\s*1px solid color-mix\(in srgb,\s*var\(--background-modifier-border\)\s*58%,\s*transparent\)/);
  assert.ok(darkPanelBlock, "dark workbench panel block should exist");
  assert.match(darkPanelBlock, /border-color:\s*color-mix\(in srgb,\s*var\(--background-modifier-border\)\s*32%,\s*transparent\)/);
  assert.ok(titleBlock, "workbench title block should exist");
  assert.match(titleBlock, /gap:\s*7px/);
  assert.match(overviewColumns, /dashboard-card-heading-icon/);
  assert.ok(toolButtonBlock, "workbench toolbar button block should exist");
  assert.match(toolButtonBlock, /border-color:\s*transparent/);
  assert.match(toolButtonBlock, /background:\s*transparent/);
  assert.match(toolButtonBlock, /box-shadow:\s*none/);
  assert.ok(toolPendingBlock, "workbench toolbar pending state should exist");
  assert.match(toolPendingBlock, /opacity:\s*\.68/);
  assert.match(toolPendingBlock, /box-shadow:\s*none/);
  assert.ok(toolFailedBlock, "workbench toolbar failed state should exist");
  assert.match(toolFailedBlock, /color:\s*color-mix\(in srgb,\s*var\(--text-error\)\s*72%/);
  assert.match(toolFailedBlock, /box-shadow:\s*none/);
  assert.ok(bodyBlock, "workbench body block should exist");
  assert.doesNotMatch(bodyBlock, /scrollbar-width:/);
  assert.doesNotMatch(bootstrap, /::-webkit-scrollbar/);
});

test("home workbench columns respond to the Home pane container instead of viewport width", () => {
  const bootstrap = fs.readFileSync(pluginPath("views", "dashboard", "home", "sections", "bootstrap-style", "view.js"), "utf8");
  const overviewColumns = fs.readFileSync(pluginPath("views", "dashboard", "home", "sections", "overview-columns", "view.js"), "utf8");

  assert.match(overviewColumns, /container\.addClass\("dashboard-workbench-container"\)/);
  assert.doesNotMatch(overviewColumns, /container\?\.clientWidth|root\.style\.gridTemplateColumns/);
  assert.match(
    overviewColumns,
    /input\?\.cardMode\s*===\s*true[\s\S]*grid-template-columns:minmax\(0,1fr\)[\s\S]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/,
    "card-mode widgets must write a one-column inline grid instead of relying on CSS to override the three-column inline default"
  );
  assert.match(bootstrap, /\.dashboard-workbench-container\s*\{[\s\S]*container-type:\s*inline-size[\s\S]*container-name:\s*noria-home-workbench/);
  assert.match(bootstrap, /@container noria-home-workbench \(max-width:\s*980px\)[\s\S]*\.dashboard-workbench-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(bootstrap, /@container noria-home-workbench \(max-width:\s*980px\)[\s\S]*data-noria-overview-panel-group="right"[\s\S]*grid-column:\s*1\s*\/\s*-1/);
  assert.match(bootstrap, /@container noria-home-workbench \(max-width:\s*640px\)[\s\S]*\.dashboard-workbench-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
});

test("home overview leaves habits to the first-class habit history card", () => {
  const bootstrap = fs.readFileSync(pluginPath("views", "dashboard", "home", "sections", "bootstrap-style", "view.js"), "utf8");
  const overviewColumns = fs.readFileSync(pluginPath("views", "dashboard", "home", "sections", "overview-columns", "view.js"), "utf8");

  assert.doesNotMatch(overviewColumns, /dashboard-overview-habit-context|dashboardHabitWeek/);
  assert.doesNotMatch(bootstrap, /dashboard-overview-habit-context/);
});

test("home trends habit history hides duplicate today strip and reuses MOC entry typography", () => {
  const bootstrap = fs.readFileSync(pluginPath("views", "dashboard", "home", "sections", "bootstrap-style", "view.js"), "utf8");
  const habitWeek = fs.readFileSync(pluginPath("views", "periodic", "dashboardHabitWeek.js"), "utf8");
  const trendsTodayBlock = bootstrap.match(/\.dashboard-home-root\s+\.dashboard-home-trends-habit-history\s+\.dashboard-habit-today-strip\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const trendsShellBlock = bootstrap.match(/\.dashboard-home-root\s+\.dashboard-home-trends-habit-history\s+\.dashboard-habit-21-shell\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const trendsNameCellBlock = bootstrap.match(/\.dashboard-home-root\s+\.dashboard-home-trends-habit-history\s+\.dashboard-habit-21-name\.dashboard-habit-21-cell\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const trendsNameTitleBlock = bootstrap.match(/\.dashboard-home-root\s+\.dashboard-home-trends-habit-history\s+\.dashboard-habit-21-name\s+\.dashboard-task-title\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const mocChipBlock = bootstrap.match(/\.dashboard-moc-chip\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";

  assert.ok(trendsTodayBlock, "Trends habit history should hide the duplicated today strip");
  assert.match(trendsTodayBlock, /display:\s*none/);
  assert.ok(trendsShellBlock, "Trends habit history should tune matrix label variables");
  assert.match(trendsShellBlock, /--habit-name-col:\s*clamp\(96px,\s*13%,\s*126px\)/);
  assert.match(trendsShellBlock, /--habit-grid-line:\s*color-mix\(in srgb,\s*var\(--text-muted\) 14%,\s*transparent\)/);
  assert.ok(trendsNameCellBlock, "Trends habit matrix names should align like axis labels");
  assert.match(trendsNameCellBlock, /align-items:\s*center/);
  assert.match(trendsNameCellBlock, /padding-top:\s*0/);
  assert.match(trendsNameCellBlock, /padding-right:\s*10px/);
  assert.ok(mocChipBlock, "MOC entries should own the shared typography contract");
  assert.ok(trendsNameTitleBlock, "Trends habit matrix names should reuse MOC entry typography");
  for (const property of ["font-family", "font-size", "line-height", "font-weight", "letter-spacing"]) {
    assert.match(mocChipBlock, new RegExp(`${property}:\\s*var\\(--dash-moc-entry-${property}`));
    assert.match(trendsNameTitleBlock, new RegExp(`${property}:\\s*var\\(--dash-moc-entry-${property}`));
  }
  assert.match(mocChipBlock, /--moc-chip-ink:\s*var\(--dash-moc-entry-color\)/);
  assert.match(mocChipBlock, /color:\s*var\(--moc-chip-ink\)/);
  assert.match(trendsNameTitleBlock, /color:\s*var\(--dash-moc-entry-color\)/);
  assert.doesNotMatch(habitWeek, /font-weight:var\(--habit-name-weight,620\)/);
});

test("home guide panels use workbench-like quiet chrome", () => {
  const bootstrap = fs.readFileSync(pluginPath("views", "dashboard", "home", "sections", "bootstrap-style", "view.js"), "utf8");
  const guidePanels = fs.readFileSync(pluginPath("views", "dashboard", "home", "sections", "guide-panels", "view.js"), "utf8");

  for (const token of [
    "dashboard-guide-card__head",
    "dashboard-guide-card__title",
    "dashboard-card-heading-icon",
    "dashboard-guide-card__tools",
    "dashboard-guide-card__body"
  ]) {
    assert.match(guidePanels, new RegExp(token), token);
  }
  assert.doesNotMatch(guidePanels, /box-shadow:0 1px 4px rgba\(15,23,42,\.035\)/);

  const guideBlock = bootstrap.match(/\.dashboard-home-root\s+\.dashboard-guide-card\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const guideToolBlock = bootstrap.match(/\.dashboard-home-root\s+\.dashboard-guide-card button\.dashboard-guide-icon-btn\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const guideToolHoverBlock = bootstrap.match(/\.dashboard-home-root\s+\.dashboard-guide-card button\.dashboard-guide-icon-btn:hover:not\(:disabled\)\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const guideToolPendingBlock = bootstrap.match(/\.dashboard-home-root\s+\.dashboard-guide-card button\.dashboard-guide-icon-btn\[data-noria-action-state="pending"\]\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const guideToolFailedBlock = bootstrap.match(/\.dashboard-home-root\s+\.dashboard-guide-card button\.dashboard-guide-icon-btn\[data-noria-action-state="failed"\]\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const governanceBlock = bootstrap.match(/\.dashboard-home-root\s+\.dashboard-guide-card button\.dashboard-guide-icon-btn--governance\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";

  assert.ok(guideBlock, "guide card style should exist");
  assert.match(guideBlock, /box-shadow:\s*none/);
  assert.match(guideBlock, /background:\s*color-mix\(in srgb,\s*var\(--dash-surface\)\s*88%,\s*transparent\)/);
  assert.match(guideBlock, /border:\s*1px solid color-mix\(in srgb,\s*var\(--background-modifier-border\)\s*58%,\s*transparent\)/);

  assert.ok(guideToolBlock, "guide toolbar button block should exist");
  assert.match(guideToolBlock, /border-color:\s*transparent/);
  assert.match(guideToolBlock, /background:\s*transparent/);
  assert.match(guideToolBlock, /box-shadow:\s*none/);
  assert.match(guideToolHoverBlock, /box-shadow:\s*none/);
  assert.ok(guideToolPendingBlock, "guide toolbar buttons should expose low-noise pending state");
  assert.match(guideToolPendingBlock, /opacity:\s*\.72/);
  assert.match(guideToolPendingBlock, /box-shadow:\s*none/);
  assert.ok(guideToolFailedBlock, "guide toolbar buttons should expose low-noise failed state");
  assert.match(guideToolFailedBlock, /color:\s*color-mix\(in srgb,\s*var\(--text-error\)/);
  assert.match(guideToolFailedBlock, /box-shadow:\s*none/);

  assert.ok(governanceBlock, "guide governance button block should exist");
  assert.doesNotMatch(governanceBlock, /border-left:\s*2px/);
});

test("home today capture stays a compact workbench command bar", () => {
  const bootstrap = fs.readFileSync(pluginPath("views", "dashboard", "home", "sections", "bootstrap-style", "view.js"), "utf8");

  const captureBlock = bootstrap.match(/\.dashboard-home-today-capture\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const modeGroupBlock = bootstrap.match(/\.dashboard-home-today-capture-modes\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const modeButtonBlock = bootstrap.match(/\.dashboard-home-today-capture-mode\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const activeModeBlock = bootstrap.match(/\.dashboard-home-today-capture-mode\.is-active\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const captureFocusBlock = bootstrap.match(/\.dashboard-home-today-capture:focus-within\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const captureButtonHoverBlock = bootstrap.match(/\.dashboard-home-today-capture-button:not\(:disabled\):hover\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  assert.ok(captureBlock, "today capture layout block should exist");
  assert.match(captureBlock, /grid-template-columns:\s*max-content minmax\(0,\s*1fr\) max-content/);
  assert.match(captureBlock, /align-items:\s*center/);
  assert.match(captureBlock, /gap:\s*0/);
  assert.match(captureBlock, /border:\s*1px solid var\(--dash-widget-border\)/);
  assert.match(captureBlock, /background:\s*var\(--dash-widget-panel\)/);
  assert.match(captureBlock, /overflow:\s*hidden/);
  assert.ok(captureFocusBlock, "today capture should expose one focus-within shell state");
  assert.ok(modeGroupBlock, "today capture mode group block should exist");
  assert.match(modeGroupBlock, /display:\s*inline-flex/);
  assert.match(modeGroupBlock, /height:\s*32px/);
  assert.match(modeGroupBlock, /border:\s*0/);
  assert.match(modeGroupBlock, /background:\s*transparent/);
  assert.match(modeGroupBlock, /box-shadow:\s*none/);
  assert.ok(modeButtonBlock, "today capture mode button block should exist");
  assert.match(modeButtonBlock, /display:\s*inline-flex/);
  assert.match(modeButtonBlock, /align-items:\s*center/);
  assert.match(modeButtonBlock, /height:\s*26px/);
  assert.match(modeButtonBlock, /background:\s*transparent/);
  assert.match(modeButtonBlock, /box-shadow:\s*none/);
  assert.match(modeButtonBlock, /border:\s*0/);
  assert.ok(activeModeBlock, "today capture active mode block should exist");
  assert.doesNotMatch(modeButtonBlock, /border-left|box-shadow:\s*var\(--dash-shadow-btn\)/);

  const inputBlock = bootstrap.match(/\.dashboard-home-today-capture-input\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  assert.ok(inputBlock, "today capture input block should exist");
  assert.match(inputBlock, /resize:\s*none/);
  assert.match(inputBlock, /overflow-y:\s*auto/);
  assert.match(inputBlock, /height:\s*32px/);
  assert.match(inputBlock, /min-height:\s*32px/);
  assert.match(inputBlock, /max-height:\s*86px/);
  assert.match(inputBlock, /line-height:\s*20px/);
  assert.match(inputBlock, /padding:\s*6px 8px/);
  assert.match(inputBlock, /border:\s*0/);
  assert.match(inputBlock, /background:\s*transparent/);
  assert.doesNotMatch(inputBlock, /resize:\s*vertical/);
  assert.ok(captureButtonHoverBlock, "today capture submit should override standalone hover motion");
  assert.match(captureButtonHoverBlock, /transform:\s*none/);

  const actionRowBlock = bootstrap.match(/\.dashboard-home-today-action-row\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  assert.ok(actionRowBlock, "today action row block should exist");
  assert.match(actionRowBlock, /justify-content:\s*flex-end/);
  assert.match(actionRowBlock, /gap:\s*4px/);

  const pendingStateBlock = bootstrap.match(/\.dashboard-home-today-action-button\[data-noria-action-state="pending"\][\s\S]*?\n\s{4}\}/)?.[0] || "";
  const failedStateBlock = bootstrap.match(/\.dashboard-home-today-action-button\[data-noria-action-state="failed"\][\s\S]*?\n\s{4}\}/)?.[0] || "";
  assert.ok(pendingStateBlock, "today action pending state should have a low-noise visual contract");
  assert.ok(failedStateBlock, "today action failed state should have a low-noise visual contract");
  assert.match(pendingStateBlock, /color:\s*var\(--dash-widget-accent\)/);
  assert.match(pendingStateBlock, /opacity:\s*\.78/);
  assert.match(failedStateBlock, /color:\s*var\(--text-error\)/);
  assert.doesNotMatch(`${pendingStateBlock}\n${failedStateBlock}`, /border:|background:|box-shadow:/);
});

test("home workbench task and countdown interiors have stable low-noise contracts", () => {
  const bootstrap = fs.readFileSync(pluginPath("views", "dashboard", "home", "sections", "bootstrap-style", "view.js"), "utf8");
  const todayTasks = fs.readFileSync(pluginPath("views", "periodic", "dashboardTodayTasks.js"), "utf8");
  const countdown = fs.readFileSync(pluginPath("views", "periodic", "dashboardCountdown.js"), "utf8");

  for (const cls of [
    "dashboard-period-task-shell",
    "dashboard-period-task-scroll",
    "dashboard-period-task-list",
    "dashboard-period-task-empty",
    "dashboard-period-task-section-label",
    "dashboard-period-task-summary-meta",
    "dashboard-period-task-group",
    "dashboard-period-task-group-head",
    "dashboard-period-task-group-label",
    "dashboard-period-task-group-count",
    "dashboard-period-task-group-body",
    "dashboard-period-task-completed-toggle",
    "dashboard-period-task-completed-list"
  ]) {
    assert.match(todayTasks, new RegExp(cls), `${cls} should be emitted by today tasks`);
  }
  assert.match(todayTasks, /TASK_GROUPS/);
  assert.match(todayTasks, /runtime\.periodic\.todayTasks\.rhythmNow/);
  assert.match(todayTasks, /runtime\.periodic\.todayTasks\.rhythmNext/);
  assert.match(todayTasks, /runtime\.periodic\.todayTasks\.rhythmLater/);
  assert.match(todayTasks, /data-noria-task-rhythm/);
  assert.match(todayTasks, /data-noria-task-overdue/);
  assert.match(todayTasks, /data-noria-task-date/);
  assert.match(todayTasks, /data-noria-task-priority/);
  assert.doesNotMatch(todayTasks, /dashboard-task-row--overdue/);
  assert.doesNotMatch(todayTasks, /runtime\.periodic\.todayTasks\.groupOverdue/);
  assert.doesNotMatch(todayTasks, /runtime\.periodic\.todayTasks\.groupToday/);
  assert.doesNotMatch(todayTasks, /runtime\.periodic\.todayTasks\.groupPriority/);
  assert.doesNotMatch(todayTasks, /runtime\.periodic\.todayTasks\.groupUnscheduled/);
  assert.doesNotMatch(todayTasks, /text:\s*"MIT"/);
  assert.doesNotMatch(todayTasks, /openTasks\.slice\(0,\s*3\)/);
  assert.doesNotMatch(todayTasks, /const\s+rest\s*=\s*openTasks\.slice\(3\)/);
  assert.doesNotMatch(todayTasks, /rgba\(59,130,246,\.14\)/);
  assert.doesNotMatch(todayTasks, /border-top:1px dashed/);

  const component = fs.readFileSync(pluginPath("src/countdown-cards.js"),"utf8");
  assert.match(countdown,/bridge.runtime.renderCountdown/);
  for(const cls of ["noria-countdown-main","noria-countdown-remaining","noria-countdown-number","noria-countdown-track"])assert.ok(component.includes(cls));
  assert.doesNotMatch(component,/noria-countdown-handle|noria-countdown-dates|onpointermove/);
  assert.match(component,/countdownProgress\(row.start,row.date,today\)/);
  assert.doesNotMatch(component,/90\s*-\s*days/);

});

test("home task periods use the local calendar date instead of UTC", () => {
  const todayTasks = fs.readFileSync(pluginPath("views", "periodic", "dashboardTodayTasks.js"), "utf8");

  assert.doesNotMatch(todayTasks, /now\.toISOString\(\)\.slice\(0,\s*10\)/);
  assert.match(
    todayTasks,
    /const todayStr = `\$\{now\.getFullYear\(\)\}-\$\{String\(now\.getMonth\(\) \+ 1\)\.padStart\(2, "0"\)\}-\$\{String\(now\.getDate\(\)\)\.padStart\(2, "0"\)\}`;/
  );
});

test("home project tasks and focus panel use themed checkbox inputs without Noria shape overrides", () => {
  const bootstrap = fs.readFileSync(pluginPath("views", "dashboard", "home", "sections", "bootstrap-style", "view.js"), "utf8");
  const rootCss = fs.readFileSync(pluginPath("styles.css"), "utf8");
  const todayTasks = fs.readFileSync(pluginPath("views", "periodic", "dashboardTodayTasks.js"), "utf8");
  const projects = fs.readFileSync(pluginPath("views", "periodic", "dashboardGuideProjects.js"), "utf8");
  const focusPanel = fs.readFileSync(pluginPath("views", "periodic", "focusPanel.js"), "utf8");
  const dailyCleanPath = path.resolve(pluginRoot, "..", "..", "snippets", "daily-clean.css");

  const taskCheckBlock = bootstrap.match(/\.dashboard-task-check\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  assert.equal(taskCheckBlock, "", "home should not define a shared checkbox shape block");
  assert.doesNotMatch(bootstrap, /--dash-task-check-size|--dash-task-check-border|--dash-task-check-mark-size/);
  assert.doesNotMatch(rootCss, /--noria-btn-size|--noria-btn-ring|--noria-btn-fill/);
  assert.doesNotMatch(bootstrap, /\.dashboard-task-check\s*\{[\s\S]*?(?:accent-color|inline-size|block-size|border-color)/);
  assert.doesNotMatch(bootstrap, /button\.dashboard-task-check\s*\{/);
  assert.doesNotMatch(bootstrap, /\.dashboard-project-task-ring\s*\{[\s\S]*?width:\s*18px/);
  assert.match(todayTasks, /noria-themed-checkbox/);
  assert.match(todayTasks, /data-state/);
  assert.match(projects, /bridge\.tasks\.renderRow/);
  const taskRow=fs.readFileSync(path.join(pluginRoot,"src/task-row.js"),"utf8");
  assert.match(taskRow, /type:"checkbox"/);
  assert.match(taskRow, /task-list-item-checkbox noria-themed-checkbox/);
  assert.doesNotMatch(projects, /dashboard-task-check/);
  assert.doesNotMatch(projects, /noria-native-checkbox/);
  assert.doesNotMatch(projects, /dashboard-project-task-ring/);
  assert.match(focusPanel, /type\s*=\s*"checkbox"/);
  assert.match(focusPanel, /task-list-item-checkbox daily-focus-check/);
  assert.doesNotMatch(focusPanel, /dashboard-task-check/);
  assert.doesNotMatch(focusPanel, /noria-native-checkbox/);

  if (fs.existsSync(dailyCleanPath)) {
    const dailyClean = fs.readFileSync(dailyCleanPath, "utf8");
    assert.doesNotMatch(dailyClean, /--noria-btn-size:\s*var\(--dash-task-check-size,\s*14px\)/);
    assert.doesNotMatch(dailyClean, /--noria-btn-ring-width:\s*var\(--dash-task-check-border,\s*1\.5px\)/);
  }
});

test("project selection is not presented as overall project progress", () => {
  const bootstrap=fs.readFileSync(pluginPath("views","dashboard","home","sections","bootstrap-style","view.js"),"utf8");
  const projects=fs.readFileSync(pluginPath("views","periodic","dashboardGuideProjects.js"),"utf8");
  assert.doesNotMatch(bootstrap,/--noria-project-progress/);
  assert.doesNotMatch(projects,/--noria-project-progress/);
  assert.match(projects,/aria-pressed/);
  assert.match(bootstrap,/\.dashboard-project-next-row\[hidden\]\s*\{ display: none/);
});

test("home project next-step input stays inline and quiet", () => {
  const bootstrap = fs.readFileSync(pluginPath("views", "dashboard", "home", "sections", "bootstrap-style", "view.js"), "utf8");
  const projects = fs.readFileSync(pluginPath("views", "periodic", "dashboardGuideProjects.js"), "utf8");

  const rowBlock = bootstrap.match(/\.dashboard-project-next-row\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const inputBlock = bootstrap.match(/\.dashboard-project-next-input\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const addBlock = bootstrap.match(/\.dashboard-project-next-add\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const inputPendingBlock = bootstrap.match(/\.dashboard-project-next-input\[data-noria-action-state="pending"\]\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const addPendingBlock = bootstrap.match(/\.dashboard-project-next-add\[data-noria-action-state="pending"\]\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const controlFailedBlock = bootstrap.match(/\.dashboard-project-next-input\[data-noria-action-state="failed"\],\s*\n\s*\.dashboard-project-next-add\[data-noria-action-state="failed"\]\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";

  assert.match(projects, /appendProjectNextStep/);
  assert.match(projects, /runtime\.periodic\.projects\.nextPlaceholder/);
  assert.match(projects, /data-noria-action-kind",\s*"append-project-next-step"/);
  assert.match(projects, /data-noria-action-state/);
  assert.match(projects, /data-noria-action-error/);
  assert.match(projects, /data-noria-project-target-path/);
  assert.match(projects, /data-noria-project-next-state/);
  assert.match(projects, /runtime\.periodic\.projects\.nextAddFailed/);
  assert.match(projects, /data-noria-project-task-source-path/);
  assert.match(projects, /data-noria-project-task-source-line/);
  assert.match(rowBlock, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/);
  assert.match(rowBlock, /border-bottom:\s*1px solid/);
  assert.match(inputBlock, /background:\s*transparent/);
  assert.match(inputBlock, /box-shadow:\s*none/);
  assert.match(addBlock, /background:\s*transparent/);
  assert.match(addBlock, /box-shadow:\s*none/);
  assert.match(bootstrap, /\.dashboard-project-next-row\[data-noria-project-next-state="saving"\]/);
  assert.match(bootstrap, /\.dashboard-project-next-row\[data-noria-project-next-state="error"\]\s+\.dashboard-project-next-input/);
  assert.ok(inputPendingBlock, "project next input pending state should stay low-noise");
  assert.ok(addPendingBlock, "project next add pending state should stay low-noise");
  assert.ok(controlFailedBlock, "project next controls should expose failed state");
  assert.match(`${inputPendingBlock}\n${addPendingBlock}`, /opacity:\s*\.72/);
  assert.match(controlFailedBlock, /color:\s*var\(--text-error\)/);
  assert.doesNotMatch(`${inputPendingBlock}\n${addPendingBlock}\n${controlFailedBlock}`, /box-shadow:\s*(?!none)/);
  assert.doesNotMatch(inputBlock, /linear-gradient|radial-gradient/);
  assert.doesNotMatch(addBlock, /linear-gradient|radial-gradient/);
});

// Selection semantics remain a contract; exact spacing, weight and fill do not.
test("home period control sources retain selected-state attributes", () => {
  const heatmaps = fs.readFileSync(pluginPath("views", "dashboard", "home", "sections", "trends-and-stats", "blocks", "heatmaps", "view.js"), "utf8");
  const todayTasks = fs.readFileSync(pluginPath("views", "periodic", "dashboardTodayTasks.js"), "utf8");
  assert.match(todayTasks, /setAttribute\("aria-pressed"/);
  assert.match(heatmaps, /setAttribute\("aria-pressed"/);
});

test("review workbench uses evidence generated and final semantic accents", () => {
  const css = fs.readFileSync(pluginPath("styles.css"), "utf8");

  const sectionBlock = css.match(/\.noria-review-section,\s*\n\.noria-review-placeholder\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(sectionBlock, "review section shell should exist");
  assert.doesNotMatch(sectionBlock, /border-left(?:-width)?:/);
  assert.match(css, /\.noria-review-section::before\s*\{[\s\S]*--noria-review-section-accent/);
  assert.match(css, /\.noria-review-host--home-focus\s+\.noria-review-section::before\s*\{[\s\S]*display:\s*none/);
  assert.match(css, /\.noria-review-host--home-focus\s+\.noria-review-section\s*\{[\s\S]*box-shadow:\s*none/);
  assert.match(css, /\.theme-dark\s+\.noria-review-host--home-focus\s*\{[\s\S]*--noria-review-home-focus-pane/);
  assert.match(css, /\.theme-dark\s+\.noria-review-host--home-focus\s+\.noria-review-section\s*\{[\s\S]*border-color:\s*var\(--noria-review-home-focus-border\)/);
  assert.match(css, /\.theme-dark\s+\.noria-review-host--home-focus\s+\.noria-review-textarea\s*\{[\s\S]*box-shadow:\s*none/);
  assert.match(css, /\.theme-dark\s+\.noria-review-host--home-focus\s+\.noria-review-workbench-final\s+\.noria-review-textarea\s*\{[\s\S]*border-color:\s*var\(--noria-review-home-focus-field-border\)/);
  assert.match(css, /\.theme-dark\s+\.noria-review-host--home-focus\s+\.noria-review-workbench-final\s+\.noria-review-textarea\s*\{[\s\S]*border-style:\s*dashed/);
  assert.match(css, /\.theme-dark\s+\.noria-review-host--home-focus\s+\.noria-review-btn\[data-noria-action-rank="secondary"\]\s*\{[\s\S]*border-color:\s*transparent/);
  assert.match(css, /\.theme-dark\s+\.noria-review-host--home-focus\s+\.noria-review-adoption\s*\{[\s\S]*border-color:\s*var\(--noria-review-home-focus-border\)/);

  const metricBlock = css.match(/\.noria-review-metric\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(metricBlock, "review metric card block should exist");
  assert.match(metricBlock, /--noria-review-evidence-accent/);
  assert.doesNotMatch(metricBlock, /border-left:\s*3px solid/);
  assert.match(metricBlock, /box-shadow:\s*inset 0 2px 0/);

  const actionbarTitleBlock = css.match(/\.noria-review-actionbar-title\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(actionbarTitleBlock, "review final actionbar title block should exist");
  assert.match(actionbarTitleBlock, /--noria-review-final-accent/);

  assert.doesNotMatch(css, /\.noria-review-state-strip\b/);
  assert.doesNotMatch(css, /\.noria-review-state-card--weather\b/);
  assert.doesNotMatch(css, /\.noria-review-state-card--mood\b/);
  assert.doesNotMatch(css, /\.noria-review-state-card--energy\b/);
  assert.doesNotMatch(css, /\.noria-review-state-card--focus\b/);
});

test("home review focus promotes final editor as the primary work surface", () => {
  const css = fs.readFileSync(pluginPath("styles.css"), "utf8");

  const homeWorkbenchBlock = css.match(/\.noria-review-host--home-focus\s+\.noria-review-workbench\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(homeWorkbenchBlock, "home focus workbench block should exist");
  assert.match(homeWorkbenchBlock, /grid-template-columns:\s*minmax\(240px,\s*\.74fr\)\s+minmax\(420px,\s*1\.32fr\)\s+minmax\(240px,\s*\.7fr\)/);
  assert.match(homeWorkbenchBlock, /align-items:\s*start/);

  assert.match(css, /\.noria-review-host--home-focus\s+\.noria-review-workbench-final\s*\{[\s\S]*grid-column:\s*2/);
  assert.match(css, /\.noria-review-host--home-focus\s+\.noria-review-workbench-final\s*\{[\s\S]*grid-row:\s*1/);
  assert.match(css, /\.noria-review-host--home-focus\s+\.noria-review-workbench-draft\s*\{[\s\S]*grid-column:\s*3/);
  assert.match(css, /\.noria-review-host--home-focus\s+\.noria-review-workbench-draft\s*\{[\s\S]*grid-row:\s*1/);
  assert.match(css, /\.noria-review-host--home-focus\s+\.noria-review-workbench-draft\s+\.noria-review-section--llm\s*\{[\s\S]*height:\s*auto/);

  assert.match(css, /\.noria-review-host--home-focus\s+\.noria-review-workbench-final\s+\.noria-review-section--final\s*\{[\s\S]*border-color:\s*transparent/);
  assert.match(css, /\.noria-review-host--home-focus\s+\.noria-review-workbench-final\s+\.noria-review-gdd-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media \(max-width:\s*1180px\)[\s\S]*\.noria-review-host--home-focus\s+\.noria-review-workbench-final\s*\{[\s\S]*grid-column:\s*1\s*\/\s*-1/);
  assert.match(css, /@media \(max-width:\s*760px\)[\s\S]*\.noria-review-host--home-focus\s+\.noria-review-workbench-final\s+\.noria-review-gdd-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
});

test("home review focus final editor uses compact save and adoption rails", () => {
  const css = fs.readFileSync(pluginPath("styles.css"), "utf8");

  assert.match(css, /\.noria-review-host--home-focus\s+\.noria-review-workbench-final\s+\.noria-review-actionbar\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/);
  assert.match(css, /\.noria-review-host--home-focus\s+\.noria-review-workbench-final\s+\.noria-review-actionbar-copy\s*\{[\s\S]*grid-template-columns:\s*auto\s+auto\s+minmax\(0,\s*1fr\)/);
  assert.match(css, /\.noria-review-host--home-focus\s+\.noria-review-workbench-final\s+\.noria-review-write-target\s*\{[\s\S]*grid-column:\s*auto/);
  assert.match(css, /\.noria-review-host--home-focus\s+\.noria-review-workbench-final\s+\.noria-review-actionbar-buttons\s*\{[\s\S]*justify-content:\s*flex-end/);
  assert.match(css, /\.noria-review-host--home-focus\s+\.noria-review-adoption\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/);
  assert.match(css, /\.noria-review-host--home-focus\s+\.noria-review-adoption-actions\s*\{[\s\S]*grid-column:\s*2/);
  assert.match(css, /\.noria-review-host--home-focus\s+\.noria-review-adoption-actions\s+\.noria-review-btn\s*\{[\s\S]*height:\s*26px/);
});

test("home link shadow guard removes task and inbox row underlines", () => {
  const bootstrap = fs.readFileSync(pluginPath("views", "dashboard", "home", "sections", "bootstrap-style", "view.js"), "utf8");

  for (const selector of [
    ".dashboard-task-row a.dashboard-task-title--link",
    ".dashboard-inbox-row a.dashboard-task-title--link",
    ".dashboard-project-task-row a.dashboard-task-title--link"
  ]) {
    const block = bootstrap.match(new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{[\\s\\S]*?\\n\\s*\\}"))?.[0] || "";
    assert.ok(block, `${selector} should explicitly opt out of decorative link shadows`);
    assert.match(block, /box-shadow:\s*none/);
    assert.match(block, /background-image:\s*none/);
    assert.match(block, /--link-decoration:\s*none/);
    assert.match(block, /--link-decoration-hover:\s*none/);
    assert.doesNotMatch(block, /text-decoration(?:-[a-z-]+)?:/);
  }

  const mocBlock = bootstrap.match(/\.dashboard-moc-chip\s*\{[\s\S]*?\n\s*\}/)?.[0] || "";
  assert.ok(mocBlock, "MOC links should have a visual chip contract");
  assert.match(mocBlock, /--link-decoration:\s*none/);
  assert.match(mocBlock, /--link-decoration-hover:\s*none/);
  assert.match(mocBlock, /background-image:\s*none/);
  assert.doesNotMatch(mocBlock, /text-decoration(?:-[a-z-]+)?:/);

  const calloutLinkShadowRules = [...bootstrap.matchAll(/\.dashboard-home-root\s+\.callout\[data-callout="(?:info|abstract|success)"\]\s+\.callout-content\s+a\.internal-link[^\{]*\{[^}]*box-shadow:\s*var\(--dash-shadow-inset-soft\)/g)].map((m) => m[0]);
  assert.ok(calloutLinkShadowRules.length > 0, "ordinary callout links may keep the soft inset treatment");
  for (const rule of calloutLinkShadowRules) {
    assert.match(rule, /:not\(\.dashboard-task-title--link\)/, "task and inbox row links must be excluded from ordinary callout link shadows");
  }
});

// Current Inbox filters, assignments and rendered controls are covered by
// inbox-card-model, inbox-work and the installed Inbox interaction check.

test("tasks calendar dark title contract keeps task titles primary", () => {
  const taskCalendarCss = fs.readFileSync(pluginPath("views", "tasks-calendar", "default.css"), "utf8");

  for (const token of [
    "--noria-tc-task-title",
    "--noria-tc-task-title-muted",
    "--noria-tc-task-title-weight",
    "--noria-tc-task-rail-subtle"
  ]) {
    assert.match(taskCalendarCss, new RegExp(`${token}\\s*:`), token);
  }

  assert.match(taskCalendarCss, /\.theme-dark\s+\.tasksCalendar:is\(\[view='month'\],\s*\[view='week'\],\s*\[view='day'\],\s*\[view='list'\]\)[\s\S]*\.tc-cal-item\s+\.description[\s\S]*color:\s*var\(--noria-tc-task-title\)/);
  assert.match(taskCalendarCss, /\.theme-dark\s+\.tasksCalendar:is\(\[view='month'\],\s*\[view='week'\],\s*\[view='day'\],\s*\[view='list'\]\)[\s\S]*\.tc-cal-item\s+\.internal-link[\s\S]*font-weight:\s*var\(--noria-tc-task-title-weight\)/);
  assert.match(taskCalendarCss, /\.theme-dark\s+\.tasksCalendar\[view='list'\]\s+\.quadrant\s+\.qContent[\s\S]*\.tc-cal-item\s+\.description[\s\S]*var\(--noria-tc-task-title\)/);
  assert.match(taskCalendarCss, /\.theme-dark\s+\.tasksCalendar\[view='month'\]\s+\.tc-cal-item\s*\{[\s\S]*border-left:\s*2px solid var\(--noria-tc-task-rail-subtle\)/);
  assert.match(taskCalendarCss, /\.theme-dark\s+\.tasksCalendar\s+\.tc-cal-item\.(?:done|completed)[\s\S]*color:\s*var\(--tc-task-text,\s*var\(--text-normal\)\)/);
});

test("task calendar quadrant empty states inherit their theme surface with muted text", () => {
  const taskCalendarCss = fs.readFileSync(pluginPath("views", "tasks-calendar", "default.css"), "utf8");
  const darkEmpty = [...taskCalendarCss.matchAll(
    /\.tasksCalendar\[view='list'\]\s+\.quadrant\s+\.qEmpty\s*\{([\s\S]*?)\}/g
  )].at(-1);

  assert.ok(darkEmpty, "shared quadrant empty state should exist");
  assert.match(darkEmpty[1], /background:\s*transparent/);
  assert.match(darkEmpty[1], /color:\s*var\(--text-muted\)/);
  assert.doesNotMatch(darkEmpty[1], /rgba?\(25[0-5],\s*25[0-5],\s*25[0-5]/);
});
