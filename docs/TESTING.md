# Testing Noria

Choose checks for the behavior being changed. Passing test counts are an inventory,
not a score for usability or correctness. Do not add a test solely because a function
or CSS rule was added.

## During development

- Run related Node tests while editing: `node --test tests/task-editor-writeback.behavior.test.js`.
- At a completed code batch, run `npm run check` once for the build and fast suite.
  Repeat when changes, failures or unresolved risks justify it.
- Inspect affected UI in an isolated Obsidian vault. Choose relevant widths and themes;
  do not repeat every feature's full visual matrix for a local change.
- Use `npm run release:check` for a release/package change, not every spacing adjustment.

Preserve tests for source text integrity, date and habit calculations, write conflicts,
draft recovery and asynchronous cancellation. Prefer a real module with a small storage,
clock or host adapter over extracting private function text. Integration checks should
exercise the result of collaborating components rather than require an exact call sequence.

Avoid assertions on decorative CSS literals, private names, test constants or duplicated
implementation logic. A styling bug may justify a focused rendered-layout regression;
it does not justify freezing every margin, class name or selector. Static checks for
release contents or restricted capabilities have a different purpose and remain useful.

When a host check times out, separate source-write time from view refresh and inspect
other mounted views before changing the timeout or adding recovery code. A calendar
observer loop can block Timeline input on the same renderer thread. For observer/layout
changes, check both recovery after real content removal and settling afterward; passing
one does not establish the other. Resolve DOM targets again after a rebuild.
Settings can open in a separate Obsidian window. Capture the target element's owning
window, and inspect the result before counting it as visual evidence.

Keep high-frequency diagnostic logs outside the vault, or buffer them until the probe
finishes. Writing a trace into the watched vault can trigger its own invalidation loop.
Historical tool runtimes and acceptance artifacts in NoriaTest also make it an unsuitable
small-vault performance baseline; record that limitation rather than delete old evidence.

## Public build scope

`scripts/public-runtime-files.json` declares the runtime files shipped in the public
bundle. When adding, renaming or removing a public runtime file, update this inventory
with the code change. Do not regenerate it from the runtime directory during a build:
new files must be explicitly reviewed for inclusion. A missing or undeclared file
stops embedding before replacing the last successful generated runtime.

Run `node --test tests/embedded-release-scope.behavior.test.js` to check declared code
and configuration, accidental inclusion, and missing release content in temporary
fixtures. Then run `npm run release:check` against the actual package.

The main bundle uses `scripts/build-plugin.mjs`. It checks esbuild's resolved inputs
before writing `main.js`: first-party code and imported assets belong under `src/`,
and installed dependencies under `node_modules/`. Files outside these roots, including
directory links to them, stop the build and leave the previous bundle intact. Keep
self-use code outside the public repository; ignoring a file in Git does not exclude
it from a bundle. Normal and release builds use the same check.

Run `node --test tests/public-bundle.behavior.test.js` to exercise the actual bundler
with a working plugin export, accidental private imports and a directory link. These
fixtures use temporary directories and do not modify the repository's sources.

This validates static bundle inputs, not the meaning of every file. Shared styles
remain in `styles.css`, partly generated from the declared Home bootstrap source.
Public source history, documentation, screenshots and examples still require release
review. No self-use loader or separate self-use build is provided by this check.

## Reusable installed Timeline smoke

`scripts/check-timeline-runtime.js` exercises the installed plugin in **NoriaTest**:

1. Today locates today and keeps neighboring entries.
2. Scrolling upward reads earlier dates.
3. Expanding and collapsing a long record leaves its source intact and preview visible.
4. Pointer completion writes the task; Space undoes completion from the retained focus.

Setup calls plugin APIs; these actions use Electron input events. This is an installed
desktop smoke, not evidence of physical device coverage, every keyboard path, restart
recovery, every theme or arbitrary third-party extensions. The Node suite owns detailed
algorithm cases; this flow checks the host integration.

Open the installed Task Timeline in NoriaTest. Run from Obsidian CLI, replacing the
example source/vault paths and `taskFolder` with the managed folder in that test vault:

```powershell
obsidian vault=NoriaTest eval 'code=(async()=>{const file="C:/dev/noria/scripts/check-timeline-runtime.js";delete require.cache[require.resolve(file)];return JSON.stringify(await require(file)(app,{vaultPath:"C:/vaults/NoriaTest",outputDir:"C:/vaults/NoriaTest/_acceptance/timeline",taskFolder:"Noria/Projects"}));})()'
```

The script verifies the explicit vault identity, creates one diary and one task file, and
uses bounded condition waits. It temporarily focuses the test window, places the view
in a fixed viewport and disables background throttling. In `finally`, it removes only
its own fixtures and restores the view, plugin configuration and throttling.

Each run keeps a separate `result.json` and screenshot under `outputDir`. Check the
report's `status`, not just the CLI exit code: the CLI can return successfully while a
check reports failure. `setup-failed`, `failed` and `cleanup-failed` remain distinct;
cleanup errors never become a passing run. Preflight errors throw before setup.
Failed checks include fixture-only source and focus diagnostics before cleanup. A source
change that has not reached the visible control is a failed integration result; do not
replace that assertion with a source-only check to obtain a passing report.

Historical acceptance scripts and images remain evidence of their original batches.
Use this maintained flow for subsequent Timeline changes instead of copying another
dated script. It is a small starting point; extend it only for a distinct recurring risk.
