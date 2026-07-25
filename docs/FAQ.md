# FAQ

**Language**: English | [简体中文](zh-CN/FAQ.md)

## Q1: How should I install Noria?

A normal install needs only three files from GitHub Releases:

- `manifest.json`
- `main.js`
- `styles.css`

Put them in `.obsidian/plugins/noria/` inside your current vault, then enable Noria from Obsidian community plugins. Do not clone the source repository into the plugin directory; the source repo contains development files such as `src/`, `tests/`, `scripts/`, and `node_modules/`.

After settings are saved, Obsidian also creates `data.json` in the plugin directory. That is expected.

## Q2: The view is blank. What should I check?

Check in this order:

1. Noria is enabled in community plugins.
2. `Settings -> Noria -> Overview` opens normally.
3. The installed plugin directory contains release assets, not the source repository.
4. Overview shows whether seed files or directories are missing.
5. Diary, Projects, Inbox, templates, and list paths in `Overview -> Paths` match your vault.
6. The current task source directories actually contain Markdown tasks.
7. The developer console has no `noria` errors.

For a new vault, start with the Standard workspace profile. For an existing vault, switch to Custom paths and make `Overview -> Paths` correct before diagnosing individual views.

## Q3: Task Board creates diary notes in the wrong directory. Why?

Task Board should use `Overview -> Paths -> Diary root` when creating diary notes. If the directory is wrong:

1. Open `Settings -> Noria -> Overview -> Paths`.
2. Check that `Diary root` is the directory you want, for example `Noria/Diary` or `06_Diary`.
3. Save settings and reopen Task Board.
4. Create the diary note from the date cell again.

If you just migrated old settings, use the Overview profile preview to confirm where the current paths come from.

## Q4: Why are my tasks missing?

Common causes are paths, filters, and task semantics:

- The task is outside the current scan range.
- `Tasks -> Include tags` is not empty, so only matching tasks are shown.
- `Tasks -> Exclude tags` or compatibility filters exclude `#habit`, `#tl/*`, or your custom tags.
- The task date, scheduled date, start date, due date, completion date, or current view range does not match the view.
- Cancelled tasks or habit tasks may be intentionally hidden in some views.
- The note was not saved yet.

Start by clearing filters and using a minimal task sample. Restore filters only after the source path is confirmed.

## Q5: Why do Timeline and Task Board disagree?

They use the same task facts, but they optimize for different displays:

- Task Board focuses on month, week, day, and matrix planning.
- Task Timeline focuses on dates, time blocks, and daily arrangement.

Check:

1. Diary, Projects, Inbox, and scan range in `Overview -> Paths` and `Tasks`.
2. Include / exclude tags in `Tasks`.
3. Timeline policies that hide overdue, cancelled, untimed, or waiting tasks.
4. The selected board view and date range.

Task completion and task edits should update from Markdown source quickly. If a task appears stale for more than a short moment, save the source note, then reopen the affected view and record the file path, task line, and console error if it persists.

## Q6: Why does Home show different statistics than I expected?

Home statistics use one shared range control. The default is recent 30 days; week, month, year, and custom ranges change the same snapshot used by note trend, task completion trend, heatmaps, note distribution, and daily-state distribution.

Check:

1. The selected range in the `Trends and Statistics` title row.
2. Whether the task has a completion date or can use the diary date fallback.
3. Whether the note is inside the configured notes scan scope.
4. Whether diary and review artifacts are being filtered as expected.
5. Whether the changed source file was saved.

If you are comparing with an older embedded weekly/monthly/yearly statistics block, prefer the current Home statistics or explicit Diary Stats command instead.

## Q7: How do Home widgets work?

Home has a default widget layout, but it is configurable.

In `Settings -> Noria -> Home`, you can:

- Enable or disable built-in widgets.
- Reorder widgets.
- Change widget size.
- Add Markdown widgets for static content.
- Add trusted vault-relative custom JavaScript view widgets for dynamic content after enabling the Advanced permission.

Markdown widgets do not execute inline scripts. Custom JavaScript views are disabled by default; enable **Advanced -> Custom JavaScript views** only for trusted files, then read Noria statistics or tasks through `noriaBridge.data.*`.

## Q8: Can I use only one module?

Yes. You can use only Home, Task Board, Task Timeline, Diary Stats, or Review Center. Unused modules do not require you to create every list in advance. Disable modules or Home panels you do not need in Overview or Home settings.

## Q9: Does Noria auto-generate many default notes?

No. Noria does not create files in bulk on startup. File generation happens only when:

- You click initialize, generate, or repair in Overview or path settings.
- A feature needs to write to a target file that does not exist.

Generated files follow the current `Overview -> Paths` configuration. Initialization does not overwrite existing files or migrate old notes automatically.

## Q10: How do I restore default settings?

Do not delete the whole `data.json` unless you intentionally want to reset all Noria settings. Safer process:

1. Back up `.obsidian/plugins/noria/data.json`.
2. Open `Settings -> Noria -> Overview`.
3. Choose Standard workspace or Custom paths.
4. Use **Apply missing/default paths** to fill only blank paths.
5. Use **Replace all paths** only when you want to switch the full path profile.
6. Use generate/repair for missing list files.

## Q11: Why did a path change not refresh immediately?

Most writes request a local refresh, but Obsidian still delivers file-change events asynchronously. Try:

1. Save settings.
2. Close and reopen the affected view.
3. If the task source changed, reopen Task Board and Task Timeline.
4. If it still disagrees, record the entrance, target file, steps, and console error.

Task status changes should usually update from Markdown source without waiting for a separate external index.

## Q12: How is the weather credential stored?

The optional QWeather credential is stored through Obsidian SecretStorage when available; after migration, future `data.json` saves should not keep its plaintext value.

When troubleshooting, record only the weather provider, enabled state, cache duration, manual city, and whether the credential is configured or missing. Do not publish the credential.

## Q13: Where are review notes and evidence files saved?

Review artifacts are Markdown notes derived from the diary or period path. Examples:

```text
Noria/Diary/2026/2026-05-03-review.md
Noria/Diary/2026/2026-W19-review.md
Noria/Diary/2026/2026-05-review.md
Noria/Diary/2026/2026-review-month.md
Noria/Diary/2026/2026-review-week.md
```

Review evidence files are JSON files under the plugin cache, for example:

```text
.obsidian/plugins/noria/cache/stats/review/2026/2026-05-03.json
.obsidian/plugins/noria/cache/stats/review/2026/2026-W19.json
.obsidian/plugins/noria/cache/stats/review/2026/2026-05.json
```

Review artifacts are knowledge work products you may keep in version control. Cache evidence files are generated support data and usually do not need to be committed.

## Q14: How can I use an external AI tool for review?

Noria does not call a model or store a model credential. Review Center prepares a local review note, evidence file, and prompt that you can copy to Codex, another assistant, or your own script.

The prompt references the review note and evidence file. Let the external tool read the evidence first, then inspect only the few related notes needed for the review. You decide whether to bring any result back, and Noria writes Markdown only after explicit confirmation.

## Q15: Can external scripts or custom widgets read Noria data?

Yes, inside Noria runtime views you can use `noriaBridge.data.*`:

- `getSnapshot()` for Home, periodic, board, timeline, or review snapshots.
- `getTasks()` for normalized Markdown task facts.
- `getPeriods()` for day/week/month/year period metadata.
- `getReviewEvidence()` for review evidence.
- `export()` for JSON envelopes such as `noria.snapshot`, `noria.tasks`, and `noria.reviewEvidence`.

For a Home custom view widget, prefer the runtime bridge. For an external script outside Obsidian, use exported JSON files.

## Q16: Why did opening User Guide create an empty `docs/` folder?

That was an old-version issue. The current version opens the User Guide on GitHub instead of creating `docs/USER-GUIDE.md` in your vault. If you still see `docs/` being created:

1. Confirm that `main.js` in the installed plugin directory is updated to the latest release.
2. Delete the empty `docs/` directory created during testing.
3. Reload Noria and open User Guide again.
