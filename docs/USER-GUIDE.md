# Noria User Guide

**Language**: English | [简体中文](zh-CN/USER-GUIDE.md)

Noria connects daily records, accumulated knowledge, planning, execution, and review in one Obsidian workbench. It uses ordinary Markdown as its content foundation and provides a configurable Home, Task Board, Task Timeline, Calendar, Habits, Trends and Statistics, and Review Center so you can see the current state, choose the next useful action, and keep long-term knowledge connected to ongoing work.

This guide starts with installation, then covers every module, common workflows, troubleshooting, paths, and advanced extension boundaries. For the product overview and release information, see the [README](../README.md).

## 1. Installation And Initialization

### 1.1 Requirements

Noria is currently a desktop plugin and requires Obsidian `1.5.0` or newer.

When Noria is available through Community plugins, search for **Noria** and enable it. For manual installation, place only the three GitHub Release files in:

```text
.obsidian/plugins/noria/
|-- manifest.json
|-- main.js
`-- styles.css
```

Obsidian creates `data.json` after settings are saved. Do not copy `src/`, `tests/`, `scripts/`, or `node_modules/` from the source repository into a user plugin directory.

The Noria interface follows the Obsidian language. Unsupported languages fall back to English.

### 1.2 Choose A Workspace Mode

The first time you open `Settings -> Noria -> Overview`, choose one mode:

- **Standard workspace**: for a new vault, a test vault, or a vault that keeps Noria-managed content under `Noria/`.
- **Custom paths**: for a vault that already has Inbox, Projects, Diary, MOC, and template structures.

IPARA is not a third profile. For an IPARA vault, choose Custom paths, keep Noria lists and workflow files under `02_Areas/Noria/`, and map content roots to the existing top-level buckets.

### 1.3 Initialization Flow

Noria does not silently create or move files at startup. Use this order:

1. Review the workspace preview and missing items.
2. Check Inbox, Projects, Diary, template, and registry paths.
3. Confirm which files and parent directories will be created.
4. Run initialization or repair.
5. Open Home and add a next step to Noria Workspace. The Project card’s **+** adds a task to the selected project; card settings manage projects.
6. Complete it or open its details, then find the same task in its source, Diary and Task Board.

Initialization supplies the workspace files and entrances without synthetic completions, check-ins or deadlines. Screenshots use a separate demonstration vault.

### 1.4 First Acceptance Check

- Home opens, and an unspecified avatar uses the Noria mark.
- All four Task Board views can be selected.
- Task Timeline loads without opening Task Board first.
- Calendar creates period notes under the configured path.
- Habit, countdown, project, and MOC entries open their source files.
- Open Diary from the top navigation and switch to Review; Day, Week, Month and Year are available.
- Weather is off in a fresh installation. The first explicit workspace initialization enables it; later repairs preserve the user's choice. Configure a location or provider only when weather is needed.

## 2. Home

Use **Add card → Interaction** to select existing content or create questions. Supported answers are single/multiple choice, text, numbers and dates. The pencil button edits questions, options and defaults. Answers are saved in Markdown; external Agents can read them and respond through Noria's API, with results shown in the same card. Saving does not start an Agent. Multiple placements share the conversation; changed questions preserve drafts for review.

Open **Page settings → Manage pages** to rename, reorder, show or hide navigation entries, choose their pictures, or set the default entry. Create a blank page or start with the trends template, then use **Add a card** to compose it. Each page keeps its own layout while cards read the original notes and tasks. Restore hidden cards from the catalog; removing a custom page does not delete source notes. Diary and Day retain their dedicated features. The default applies to new workbenches; existing workspaces restore their saved page.

Page entries use icons, with names on hover or keyboard focus and a selected background for the current page. Tab into navigation, move focus with the arrow keys, and press Enter or Space to open a page; Home / End move to the first / last entry. On narrow windows, open remaining pages from **More pages**. Change an icon in **Page settings → Manage pages**.

Home is Noria's central workbench, not a fixed collection of features. It organizes current state, next actions, knowledge entrances, and longer-term observations on one configurable page.

![Noria Home](assets/en/home-dashboard.png)

### 2.1 First-Screen Structure

The default first screen is organized as:

1. Identity, quote, weather, and overview metrics.
2. Top navigation for Home and Diary, with Day and Calendar links; Page settings provides Add a card to this page and Arrange cards on this page.
3. Today Tasks, Inbox, and Countdown cards.
4. Projects and MOC entrances.
5. Trends and Statistics; reviews are available from Diary.

The default order is only a starting point. Every major card can be managed as a level-one widget.

### 2.2 Capture And Task Input

Home no longer duplicates the capture and task input strip:

- **Capture** ideas, clues, and temporary records in Timeline.
- **Add tasks** from the Today Tasks card.

Resize cards in ordinary mode by hovering over a card or focusing its bottom-edge handle. Layout editing keeps handles visible. Home and Diary share this interaction, including narrow panes; the card menu restores automatic height. Captured material does not need to be classified immediately.

Drag a card’s right edge to resize across ten grid widths. Release to save or press Escape to cancel. More → Layout → Width offers six common proportions and a fine-adjustment slider; use arrow keys and Enter to apply a keyboard adjustment. Narrow panes stack cards without overwriting their saved widths. The focus dial fills and centers within the space above its bottom controls.

### 2.3 Today Tasks

Today Tasks group work by pace and current capability instead of keeping deadline pressure permanently visible.

- Incomplete tasks use clearer weight.
- The first open group shows its count and the total open tasks in the selected range, separated by a middle dot. Counts no longer crowd the card title.
- A Completed section previews the latest three completed tasks; expand it for more. Checked boxes and muted, struck-through text provide feedback. Uncheck a task to reopen it.
- A suggested first task is naturally sorted to the top with a quiet marker instead of a separate recommendation panel.
- Clicking a task opens its source; hovering shows dates, tags, project, and source details.
- Day, Week, Month, and Year ranges remain available and collapse into a period selector in narrow cards.

An unfinished task can continue the next day. Noria does not treat rollover as punishment.

### 2.4 Inbox

Inbox lists inputs in your Inbox folder. Filter by Me / SI and action in the header. Click an item to read and edit its source alongside the list. Further selections reuse that reading pane; Up and Down move between visible items. Pin a note to keep it: the next selection opens another tab on the same side. Hold and drag an item to a side action to assign work. The queue Base shares the same inbox-work property. Keep requests in the source note; assigning SI does not start an external assistant. See [Process Inbox](#113-process-inbox) for the steps.

### Habit Card

The Habit card starts with today and separate recent date cells, showing up to seven days on wide cards. Narrow cards reduce historical columns while keeping names and today's controls visible. Numeric habits show today's actual value and unit, including zero. Use the history icon to expand the longer, horizontally scrollable range; click again to return to recent days. The expanded range defaults to 21 days and can be changed in **… → Card settings → History days**. Click a date cell to backfill a check-in, or a habit name to edit its parameters.

![Home habit history](assets/en/home-habits.png)

### 2.5 Countdowns

Each item shows “In n days”, or “Today”; Home shows upcoming items only; expired and archived items remain available in the manager. Use **+** to add an item and select an item to edit its name, start and end dates. Progress uses the actual date range; an older item without a start date has no invented progress.

The colored bar displays time progress only. Date fields and setup hints stay inside the editor; click the item to edit its name, start date and deadline. Archive and restore items in the manager. Records stay in countdown Markdown; task-backed items update the original task.

### 2.6 Projects And MOCs

- Click a project to select its tasks. Project names stay in one row; the dropdown can find more projects without a separate search icon. The note and timeline icons in the card heading open the selected project’s source and schedule. The card’s **+** reveals task input; save to keep entering tasks, or press `Esc` to collapse it. The selected project and unfinished input are retained.
- MOC entries use an aligned grid that adapts to the card width. A small color marker identifies each entry; a same-name Canvas gets a separate icon. The display omits the trailing `·MOC`, while the source filename stays intact.
- Use **+** to choose an existing Markdown or Canvas file. Use **… → Manage content** to adjust order, color, or paths and remove entries. Removing an entry keeps the source file. File and folder renames in the vault update saved entry paths; a missing entry offers a replacement picker.

Project, MOC, workflow, and queue source links keep Home available and reuse an existing Markdown, Canvas, or Base tab. Ctrl/Cmd-click or middle-click opens another tab; Ctrl/Cmd+Alt-click opens a split. Hover preview follows Obsidian's Page preview settings. Home keeps links to source documents rather than duplicating their content.

![MOC entries on Home](assets/en/home-moc.png)

Project management lists names and stages before opening a single item for editing. Choose an existing note or explicitly create a project note. An invalid existing path does not silently create a file. Hiding, completing or removing an entry keeps its source note.

### 2.7 Home Widgets

Home, Diary and custom pages support a tall card beside a vertical stack of cards. Drag blank heading space toward another card’s top or bottom edge to stack; use its left or right edge for separate placement. Release at the preview to save, or press `Esc` to cancel. **… → Layout → Stack with…** offers the same choices; **Place separately** removes the current card from its stack. Stack members share a width and keep independent heights. Narrow panes use one column; restoring a hidden card restores its stack. Layout stays in plugin settings and does not alter Markdown.

Open **Page settings → Add a card to this page** at the right of the top navigation to add built-in functions, a note / Base, statistics or an available third-party component. Home, Diary and custom pages share this entry. Configure the card with a preview of real content; restore hidden cards from the same catalog.

Choose **Statistics templates** at the top right of the card catalog, then browse Recommended, All styles or My templates. Dashboard statistics includes the overview, note and task trends, habit history, both yearly heatmaps, tag distribution and daily records. These retain their existing metrics and interactions, can be added to Home or custom pages, and can be saved as personal templates. The overview, note and task trends, both heatmaps and daily records also work in Diary, following the selected day, week, month or year by default. Tag distribution reflects the current library and stays on Home or custom pages; Diary uses its existing habit card. The gallery explains these two restrictions. The eleven basic chart types each have a default setup; record templates use configured fields where available. Choose a property if no suitable state field exists. Gallery drawings illustrate styles; the editor previews real data. Recent days includes today, and switching basic charts keeps the date range and filters. Templates store configuration without copying source data; removing one leaves existing cards intact. Ready-made dashboard cards retain their existing range and metric settings rather than offering arbitrary data-source substitution.

Segmented composition restores the earlier percentage strip as a configurable chart. It uses your current record property, supports Follow page for daily/weekly/monthly/yearly notes, and opens the corresponding records from a segment or category detail. Missing values are excluded; overlapping categories and negative values cannot form exclusive shares. Use counts, sums or distributions rather than averages or extrema. The same renderer also serves legacy periodic distributions.

Period trends offers two dual-axis templates: Notes and words, and Task count and completion rate. They work on Home, custom pages and diaries. Follow page is the default; fixed ranges and recent days are also available. Day/week/month buttons change the current view; save the default grouping in card settings. Auto uses days up to 45 days, weeks up to 180 days, and months for longer ranges. Task activity places completed tasks by completion date and open tasks by due/scheduled/start dates or the existing fallback. Rates are recomputed from grouped completed/activity counts, never averaged from daily percentages; periods without tasks have no rate. Values and definitions exposes full period keys, both metrics and their calculation rules. Legends identify the left and right axes. Point or touch the chart to inspect exact values; arrow keys select periods and Home / End jump to the endpoints. Resizing preserves the selected period and expanded values. Click the plot, press Enter, or select View sources beside the readout to inspect the same period: tasks are grouped into completed and open, and notes into newly created notes and diary character sources. Saved cards open the original note, locating the current line for tasks. Configuration previews are read-only and retain unapplied settings when you return. The note chart pairs new-note counts with diary non-whitespace character counts, including Markdown markup; this is not the amount newly written that day.

Home note and task trends support pointer or touch inspection and arrow keys / Home / End, with exact values in the hover or keyboard tooltip. Resizing retains the selected period; zero-valued bars have no height. Generic line and column charts retain the selected date when an in-place property edit refreshes their data.

The **Focus card** switches between Timer and Review without changing its height or interrupting a session. Today’s total or the active timer status sits in the title row. The dial stays centered above a single bottom row: task and timer controls in Timer, a date button at the lower left and timer controls at the lower right in Review. Select the date button to open the date picker; find Intervals & sources in the card’s more menu. Timer mode shares the dial’s status line and can be changed before starting. Pause, resume and finish remain available in Review. Standalone time rings belong on the statistics page by default, including new pages created from the Trends and statistics template. Add them to Home or a diary when needed; upgrades no longer insert a separate ring on Home or remove existing custom cards.

**Focus card** can be placed on Home through Add card. The task row in Timer view switches between Pomodoro and free timing. The dial shows elapsed progress only for Pomodoro; free timing shows elapsed time. Choose a task by its title, or open its note with the source icon. Drag a task title from Home, a project or a diary onto the card to begin. An active session asks you to finish and switch or cancel, retaining recorded time. Dropping the same task does not restart it. The task is not moved, rescheduled or completed. Changed or ambiguous sources require a refresh. Keyboard users can use the focus menu in the task editor.

**Focus time ring** is a shared statistics template for Home, diaries and custom pages. It reads actual focus segments from the timer and ordinary Markdown. The range follows the page by default; the date controls select a day within that range, initially the latest day with a record. Pauses are excluded, midnight crossings are clipped to the day, and overlapping time counts once. No records displays “—”; unrecorded time does not mean free time, and legacy intervals without segments are not inferred. Hover to inspect, click to keep a selection, or use the arrow keys and Home / End. Enter opens the source; **Intervals & sources** beside the date lists dense short segments separately. The center shows the daily total, or the duration and title of the selected interval. Click that title to open its source; hover it for the full time range. Enable **Compare task schedules** in card settings to show explicitly timed task schedules as a fine dashed outer ring, with actual focus on the solid inner ring. New time-ring templates enable this comparison; existing cards keep their setting. The center keeps actual focus and scheduled duration separate. Date-only tasks and deadlines do not imply durations; ambiguous legacy start/due pairs are not inferred. Cancelled schedules are excluded, completed schedules remain available for comparison, and overlapping scheduled time counts once. Clicking a schedule title opens its task; clicking a focus title opens the recorded segment.

The task board, horizontal and vertical timelines, and focus time ring share task category colors. The first eligible tag in the task text is used, with an exact match before its root tag. Status and overdue cues remain separate. Appearance settings accept Chinese and hierarchical tags. Focus inherits a category only when its source task can be matched uniquely; ambiguous names retain the default color. An explicit accent on a statistics card takes precedence.

In Obsidian Reading view and Markdown rendered by Noria, focus entries show the task name and actual duration first. Expand an entry for its timer mode and recorded intervals; select the task name to open the source note. Pauses are excluded, short records use seconds, and midnight crossings retain the date. Exact timestamps remain in the original Markdown and are visible in editing/source mode. Editing them still updates statistics from that same source.

**Goal progress rings** combines one to four independently calculated metrics in a shared statistics card. The default uses task completion and scheduled habit completion. Card settings can change each ring to tasks, habits or a numeric diary property and give it a name. Tasks use scheduled or due dates; habits use historical schedules; diary values use a sum or mean. Numeric targets apply to the entire selected range and are not multiplied automatically when switching between days, weeks or months. Leave the unit blank to use the record definition. Different units never become a combined completion percentage. Select a ring or legend item to see its value and target in the center. Select the center or **… → Selected metric & sources** for records and original notes. Arrow keys and Home / End select metrics; Enter opens sources. Percentages above 100 remain visible while the arc stops at a full circle. No records, no target and recorded zero are distinct. Source edits refresh the card while preserving selection and keyboard focus; incomplete or invalid data is identified instead of presenting a partial value as a complete result.

Under **Chart appearance**, choose colors and the density, scale, sample markers or legend options applicable to the chart. Line and column charts support a reference value in the same unit. Values outside a custom scale remain visible, with an expanded-scale notice. **Save appearance** reuses display settings without changing another card's data source, filters or reference value. Removing a preset leaves applied cards unchanged. Empty line and column charts omit unused axes; diary charts retain a date picker for adding records.

Each card’s **…** separates content management from layout: visual width choices, move, collapse, automatic height, duplicate and hide. Copies have independent configuration. Cards in a row share a height; the bottom handle adjusts it, while a narrow single column grows naturally. Home has its own layout. Daily, weekly, monthly and yearly diaries each share a separate layout across dates.

A Dataview card uses a note containing a query. Its dependency opens in Obsidian’s native plugin installer. Two cards can use separate notes; disabling the dependency affects those cards, and enabling it restores them. Note / Base cards reuse native rendering. Other plugins need an adapter or embeddable note content; arbitrary full plugin interfaces are not supported. See the [card provider API](CARD-PROVIDERS.md).

![Add and configure cards](assets/en/card-catalog.png)

![Shared card menu](assets/en/home-card-menu.png)

### 2.8 External Markdown Workbench

Markdown widgets can read daily briefings, current suggestions, weekly reviews, and project-monitor files produced by external agents, RSS workflows, or other scripts. Noria displays the content, source handoff, and freshness state; the external workflow remains responsible for generating it.

### Media page and Home shortcuts

Start in Media library to browse the collection; Home shows only shortcuts you deliberately add. Both read the original work notes, without creating a second collection.

| Entry | Purpose | Selecting a work |
| --- | --- | --- |
| Top navigation → Media library → Works | Browse, read, update progress and find notes | Opens work details |
| Home shortcuts | Open selected works or other content quickly | Opens the explicit reading/playback destination, or details when none is set |
| Page settings → Add a card to this page → Works list | Put a simple list on another page | Opens the original work note |

#### Open the library

Open **Media library** from the bookshelf icon in the top navigation. The page title and library, open-book, film, disc and gamepad navigation sit outside the cards and select All, Books, Film & TV, Music, or Games. Hover for names or focus the group and use Left/Right to switch. Works and recent-completion statistics follow the section together.

Choose an existing folder in the **Works** card on All. Other sections inherit this folder when their folder setting is empty, or can select another folder. Each section saves its own cards, order, sizes and settings; **Page settings → Add a card to this page** targets the current section. Switching preserves section search and detail state, and reloading restores the active section. Other custom statistics retain their explicitly configured sources and calculations. No notes need to move.

On the first load, the library prefers an existing `In progress` or `进行中` status. If both are present, it selects the one matching the interface language; if neither is present, it shows all works. Choose **All** to see the whole collection. This initial choice does not translate or rewrite note properties; custom statuses remain available as filters.

Switch between **Cover** and **Detail** views at the right of the page header. Cover view starts with artwork and titles only; Detail view includes creators, progress and excerpts. Excerpts prefer the selected review section, then the description section; an absent description heading uses the legacy description property. Each excerpt identifies its source section and quotes existing text without generating content. **Display settings** controls Creator, Progress and Review / description separately for each view and adjusts cover size. Each section remembers its preferences, while switching views preserves search and filters. Click progress text to edit it directly. A book needs valid page and total counts to show a proportion; otherwise only its page position is shown. Other media use status without inferred percentages. Existing rating fields remain unchanged; direct personal rating is still pending.

Status, search and add actions share one toolbar inside the Works card, wrapping when space is limited. Clear filters to recover from an empty search. Covers retain their proportions and share a bottom edge; shortcut actions appear on hover or focus and remain visible for pinned works. Opening a work and returning keeps the selected section.

Opening a work moves its cover from the collection into the detail page; returning moves it back and restores focus. Section changes use a short transition. Reversing direction, scrolling or switching sections cancels the old transition without blocking controls. The system reduced-motion preference skips these effects. Music keeps square artwork and labels its explicit playback destination **Listen**. With no dated completions, the statistic shows a compact empty state.

#### Add works and choose templates

The library reads ordinary Markdown in its configured folder. Adding or editing a work note in Obsidian or an external editor updates the view automatically after Obsidian detects and indexes the file; another import or manual refresh is unnecessary. The note must be inside the configured works folder and carry a supported media identity tag. Active search and filters still apply. Existing identity tags such as `book`, `movie`, `music` and `game` identify works; other tags organize their categories. Ratings, progress and covers remain properties. Related notes without a media identity tag are not collected as separate works. External type changes update the open detail's Read/Watch action and editing fields. An active review retains its input and cursor; finishing it adopts the new type's section profile without rewriting or deleting the old sections.

Chinese identity tags are also supported: `图书` / `书籍` for books; `电影` / `影视` / `电视剧` / `动画` for film and TV; `音乐` / `专辑` / `歌曲` for music; and `游戏` for games. Both frontmatter and inline tags work, and original spelling is retained. Identity tags are excluded from category charts. Matching is exact: `电影研究` and `电影/科幻` do not identify a film by themselves; add `电影` separately when needed.

Use **＋ Add a work** on the right to enter its title and an existing destination folder. Books, Film & TV, Music and Games inherit their section's type; All and standalone cards retain the type chooser. Choose a subfolder within the card scope; duplicate lookup covers the whole card folder. Matching works show their original paths and open directly. Choose **Add a separate edition** and a free filename when it really is another edition. A matching ISBN or source edition still returns the original record. Creation opens the new work unless you already dismissed the editor, in which case a notice confirms completion without navigating. An omitted status does not become “in progress.” Dismissing or cancelling retains temporary input in the current card, separately by category; rebuilding the page or reloading the plugin may discard it.

For books, enter a title, ISBN or Open Library link and choose **Find details**. Title results lead to specific editions. You can also expand **Work details** without searching and enter the author, publisher, publication text, ISBN, page count and source/cover links manually. Short fields share rows; long links use a full row. Author names are resolved from the edition’s author identifiers. If any remain unavailable, the author field explains what is missing and still allows manual correction. Starting a new search preserves entered details; selecting a specific edition replaces them. **Remove these details** clears the supplemental values while leaving manual entry available. Film/TV, music and game intake is currently manual. Existing music notes expose `artist` for display and search.

Use **Add a work → Template** to choose a vault `.md` file per media type; no special filename suffix is required. Closing template settings returns to Add with the title, folder and metadata retained. The same settings remain available from **Display settings → Work template…** and the work menu. The file-edit icon saves the current settings and opens the original template in Obsidian's editor. New works read the latest template prose and custom properties, with explicitly supplied metadata taking precedence. An existing identity tag for the selected type is retained without adding another alias. `{{title}}` and `{{date}}` are supported; template scripts are not executed. Changing a template never rewrites existing works. A missing or mismatched template stops creation.

Content defaults to **Follow the note**, preserving section order, nested headings and free prose. New sections need no registration. Description/review mappings and optional section selection live under the collapsed **Display and excerpts** options. Existing deliberate section selections remain in effect until you choose Follow the note. Duplicate headings stay readable; edit them in the original note to avoid ambiguous section updates.

Choose **Edit work details** from a work’s menu. Books show author, publisher, ISBN, page count and publication text; film/TV shows directors, music shows artists, and games show developers. These three types also provide a year field. Expand **Source and cover** for links. Changed fields show their original values and a restore action. Save writes only changed fields, preserving status, current page, ratings and prose; clearing an input clears that field. Covers accept vault image paths, wikilinks or HTTP(S) links. A hint appears when the original `image` property takes display priority. A conflicting metadata edit keeps your input visible so you can check the source before reopening. For books, expand **Find edition details** to search by title, ISBN or Open Library link. Select a specific edition, compare each supplied value, and choose **Use** for the fields you want. Selection alone does not replace any input or write the note. A new query clears the suggestions but keeps your edits and adopted values; the source URL is also a separate choice.

Cover references live in the work note's `cover` property as an image wikilink, vault path or HTTP(S) image URL; the existing `image` field retains priority. Editing the reference updates the list and open detail after indexing. Missing or failed images use the default cover. Replacing, deleting or restoring a local image at the same path updates open covers without interrupting prose editing. Failed remote images retry when connectivity returns; successfully loaded images are retained, and remote URLs are not polled. Adding a note does not automatically fetch artwork. If the source is deleted, moved outside the collection or loses every media identity tag, idle details return to the list. Active edits remain visible while stale actions are disabled. Returning after deletion backs up unsaved input using Obsidian text backups without recreating the deleted note. Native Obsidian renames preserve the editor and retarget writes; external renames reported as deletion plus creation follow the missing-source path without guessing file identity.

#### Read, update progress and link notes

**Link destination** and **Change destination** share the same editor. The folder icon beside the input opens the vault file picker; you can also paste a link. Saving returns focus to Read, Watch, Listen or Play. Saving an unchanged destination preserves the source note formatting.

Book lists and details share the same page position. An explicit `pageprogress: 0` shows page zero; lists omit the row when both status and page position are missing. Details keep **Progress** beside Read; films, music and games use **Status**. Once recorded, this action shows the existing status or page position and remains editable. A compact bar appears when a valid total is known and the last page has not been reached. Unknown or inconsistent totals show the current page without a percentage. Record the page number printed in the book; the PDF reader keeps its own location. A sample PDF's length is not the complete book's page count. Reaching the last page does not set a completion date, status or rating. Nonbooks do not infer time-based percentages. Clearing the list's progress returns focus to the work title.

Details provide progress, an optional completion date, a work destination, and related notes. Status and page position share one editable line; **Edit work details** in the work menu changes type-specific metadata: book details and total pages, film directors, music artists, game developers, and release years. Saving refreshes the display and restores focus to the action you used; inputs are disabled during the write. Conflicts retain unsaved input and ask you to check the source note. Selected description, review and additional second-level sections appear below the cover; the file icon beside the Linked notes heading opens the complete work note, next to the add-note action. Hover or keyboard focus reveals its label. Use a section’s pencil to edit it in place. Pausing input autosaves; Finish or Ctrl/Cmd+Enter returns to reading. Autosave waits for IME composition. Changes go to the original section in the same `.md`; independent edits elsewhere are retained. A concurrent edit to that section keeps your input and preserves a text backup instead of overwriting the source. Compare your draft with the original. When the selected description heading is absent, an existing `description` field remains its source, including when edited. Other incoming mentions are collapsed. The explicit work destination uses `media-open`, accepting vault files with locations, web URLs, and Obsidian, Steam or Zotero links. The metadata `source` is not used as a work destination.

Long descriptions in work details start with a roughly six-line plain-text preview. **Read more** reveals complete Markdown and links; **Show less** returns to the preview. Short descriptions remain visible without an extra control. Editing always opens the full section. Disclosure never changes the source note and adapts to the pane width.

Keep short impressions in the work note, and create a linked note when the content deserves its own document. Dated records use `YYYY-MM-DD Title.md`, with known `HHmm` only when needed to distinguish same-day entries; ongoing topics use stable names. Existing experience notes stay linked and are not merged, renamed or moved automatically. Maintain internal links when renaming or moving notes. The dated-note Base gathers independent dated files; dated paragraphs inside the work note are not included yet.

**Linked notes → ＋** offers **New linked note** and **Link an existing note**. New notes ask only for a name and open directly in Obsidian, beside the work, with a `related` link. No date, experience tag or records directory is required. Existing names are never overwritten; use the existing-note option. Existing notes keep their locations. The list shows titles, actual filename dates and source excerpts; edits, renames and deletions refresh it. Undated notes receive no inferred date. Other mentions load excerpts when expanded.

Noria reuses an already open local work or linked-note tab. A destination without an anchor preserves the reader position; a link such as `#page=7` still navigates explicitly. External edits to the work Markdown update the open detail header, cover, categories, progress and destination in place without replacing an active review editor or its selection.

If a configured local file is missing or the destination format is invalid, opening it from Home or work details shows that work's destination editor with the old value retained. Cancel leaves the source unchanged; saving a replacement lets the next click open it directly. Noria does not create a substitute file or use the metadata source URL as a reading destination.

#### Categories and statistics

Use the **filter icon beside Search library** to search and select category tags. Untagged means no category tags; identity tags do not count. Genre property choices appear only when existing notes provide them. Multiple choices within a group match any choice; selected genres and tags must both match. Classification combines with search and status, with counts following the filtered works. Conditions can be removed individually or cleared. Zero results retain conditions; Clear filters clears search, status and classification together.

Returning from details, switching between existing category pages and refreshing note metadata retain current conditions. These session filters are not restored after page recreation or plugin reload. Statistics retain their full collection scope. Existing `genre` values are preserved; tagging does not require duplicating them. Tags match complete names. New distribution cards default to tags; saved grouping choices remain unchanged and can be changed in card settings.

Open a work and select its category text, or **Add categories** when empty, to edit tags. A Genre property input appears only for existing nonempty `genre` values; editing tags does not create that property. Separate entries with semicolons and use existing category suggestions. Changed fields can be restored. Only changed properties are written; filters and distribution refresh from the note. Identity tags are retained. Inline tags are read-only with a source-note link. Repair malformed tags in the source. Competing edits retain unsaved input and show a conflict; Cancel writes nothing.

The default library layout gives works the full width, followed by Recent completions and Collection distribution side by side. Narrow containers stack these cards. Detailed browsing uses two columns in wide cards and one in narrow cards. Music defaults to works and distribution. Untouched older defaults are upgraded; custom sizes, order and settings are retained, and removed cards stay removed.

**Recent completions** counts each work once by its explicit `finishedAt` date, without inferring dates from current status or counting reading or playing sessions. Select a month to see works ordered by completion date, newest first. Titles open work details; file icons open the source notes. Rows retain the completion date and current status. Edits, renames and deletions refresh the list while keeping the selected month. Use Hide works to collapse it. The card menu's Calculation details explains the date rules.

In **All works**, book, film and game icons select separate completion statistics instead of combining their totals. Arrow keys switch categories within this card; the page's work list stays unchanged. Individual category pages follow their own type without duplicate controls. New Music pages start with browsing and collection distribution, without a default completion card. Saved or explicitly added statistics cards are retained; a Music completion card can show explicit completion dates, but these do not measure plays or listening time.

**Recent completions** uses a monthly chart through the shared renderer for 3, 6 or 12 months of explicit `finishedAt: YYYY-MM-DD` records. Choose **Dot matrix** or **Columns** in **… → Card settings → Chart style**; preview and apply use the same works. Dots are the default, with a legend stating the number of works per tile. Larger counts use grouped tiles, with partial fills preserving remainders; pale empty tiles are not completion records. Months run left to right, retaining empty months. Only the inspected value and maximum are labelled; consecutive equal maxima share one label. Hover to inspect and click a month to show its works. Arrow keys select months, Home/End reaches the endpoints, and Enter opens works. Narrow cards reduce axis labels and tighten tile spacing while retaining every month's interaction. Status, page position and impressions do not imply completion dates or experience volume. The common card menu controls settings and layout; an empty folder follows the library folder.

**Collection distribution** is visible by default. Add further instances from **Page settings → Add a card to this page**. Horizontal bars show counts for existing genres or tags. Select a category to view its works and source notes. Long labels wrap above the bars; counts remain aligned on the right. The first six categories appear initially, with an option to show all. The scope includes all collected works in the folder and current category page, regardless of completion dates. Existing libraries receive the missing distribution card once, preserving existing instances. Explicitly emptied or fully hidden pages are not repopulated.

In **… → Card settings**, choose Genre (`genre` text or a text list) or Tags, with an optional tag prefix such as `topic`. Media identity tags such as `book` are excluded, and prefixes match complete tag levels. Each work counts once per category; categories can overlap, so counts are not exclusive shares or measures of preference. **Unclassified** and **Needs review** retain access to missing and invalid classifications. Edit properties or tags in the source note; the chart and open list refresh together without creating another classification record. An empty folder follows the library folder.

#### Home shortcuts

The shared **Shortcuts** area initially sits above MOC. You can move it afterward; restarting does not reset its position. Choose **＋** to search works, ordinary notes, Bases, canvases and Noria pages, or paste a web or supported app link. Entries show a cover or icon and a short name. The context menu edits the display name, picture and destination, reorders entries, or removes a reference. Dragging also reorders. Display-name changes never rename the file; removing a shortcut leaves the original content intact.

**Add to shortcuts** in work details uses this same list. A work opens its explicit work destination, or its detail page when none is configured; its notes button opens related notes. Previous Home media choices migrate with their order preserved. The full library and its statistics stay separate. Adding an entry requires no task, date or duration, and links open only when activated.

These features are in the development version. Isolated tests and representative native operations have passed; real collections, additional themes and full user acceptance remain pending.

### Existing media library card

This optional standalone card differs from Works inside Media library. Use the top-level library for normal browsing; add this card when another page needs direct access to the original notes.

Choose **Page settings → Add a card to this page → Works list** (previously Media library), select the folder containing your works, and apply. Subfolders are included by default. It uses the same identity rules as the library, including the Chinese aliases listed above and existing `book`, `movie` / `tv` / `anime`, `music` / `album` / `song`, or `game` tags; list and template notes beginning with `清单-` or `模板-` are excluded. The default status filter is `进行中` (in progress). In card settings, replace it with the status your notes use, or leave it empty for all works.

Search titles, authors or directors, filter by type and stored status, and click a work to open its original note. The card retains its current filters when opening a source; metadata changes refresh the collection. Choose covers or a compact list in card settings. Local and existing HTTP(S) cover links are supported, with `image` taking precedence over `cover`. Missing images retain the title and type icon. Book pages are a current position, not reading volume; ratings and experience dates are not inferred. Click the status or page position to edit the current status and, for books, the current page. Save changes explicitly; competing status or page edits require reopening the editor. Configuration previews remain read-only.

## 3. Task Board

Task Board organizes Markdown tasks from diary, project, and regular notes into four complementary views. Tasks remain in their source files.

### 3.1 Month

Use Month to review task distribution, multi-day work, deadlines, and workload over a longer span. Start with the overall shape, then move into Week or Day to arrange time.

Scroll within a crowded week to reach its remaining tasks. All seven days scroll together under fixed date headings, preserving continuous multi-day bars; other weeks stay in place. Editing or completing a task preserves your position. Completion uses the checkbox and color cues while titles stay readable.

Month excludes events tagged `#timeline` or `#tl` (including subtags) by default; Day and Week still show them. The statistics button explains the current rule. Expand it to inspect tag, cancellation, and overdue carry-over conditions, then choose **Filter settings** to change the existing settings. Tasks and counts update when you return.

![Task Board month view](assets/en/task-board-month.png)

### 3.2 Week

Use Week to arrange tasks and time blocks across the current week. Parallel tasks adapt title and time detail to the available width and height while preserving task identity.

When simultaneous tasks exceed the column width, **+N** groups the overflow beside that time range. Open it to read full names and times, then edit the original task. The list follows its count when resizing. Collapsed tasks remain included in statistics; their source notes and schedules are unchanged.

Crowded days show an expand button in their heading to open that date in Day view. Other headings reveal it on hover or keyboard focus. The date link still opens the diary. Switching between Day and Week keeps the date you are viewing; use Today to return to the current date.

In Day and Week, **Active** sets the visible start and end times or switches to **Full day**. The summary above the grid shows tasks before and after that range, or their count in narrow columns. Select the summary to inspect or edit the original tasks; use its arrow to expand or collapse both ends together. While collapsed, empty dates have no controls, and a grid with no such tasks has no empty summary row. Changing the visible range does not change task times, source notes, or statistics.

![Task Board week view](assets/en/task-board-week.png)

### 3.3 Day

Use Day for concrete daily arrangement. Untimed and all-day tasks stay at the top; tasks with a time range enter the hourly grid.

![Task Board day view](assets/en/task-board-day.png)

### 3.4 Matrix

Use Matrix to reconsider importance and urgency when the task pool grows. The four areas reorganize one task pool; they do not duplicate tasks.

Choose day, week, month, or year in the top toolbar. Counts beside quadrant titles follow the active filter. Open statistics and select a category, such as Scheduled, to filter; select it again to clear. Changing the period keeps the filter. Use Up/Down to navigate, Enter or Space to select, and Escape to close and return focus to the button. Dragging a task between quadrants changes only its quadrant, keeping its source note and dates.

![Task Board matrix view](assets/en/task-board-quadrant.png)

### 3.5 Edit Tasks

Hover over a time block to read its full title and actual time range in the native tooltip. Multi-day tasks show both endpoint dates rather than using the visible segment's midnight boundary as the deadline. The readout closes when dragging starts.

Dragging in Month preserves the task's existing date fields and times; a date-only deadline stays date-only. Moving a block in Week or Day preserves its actual duration, even when a short task has a larger visual height. Small pointer movements do not reschedule. Press Escape or release outside a valid date cell to cancel.

Rescheduling keeps the task, child tasks and attached paragraphs in the original note; it does not create the destination day's note. Dragging an undated diary task adds a `scheduled` date without inventing start or end times. Month shows the new date, while opening the source returns to the original note. Diary cards also respect a future arrangement instead of displaying it early merely because its source is an older diary.

Week and Day show the full interval on one line when it fits, such as `09:00–11:30`. Narrow blocks may use two lines. When space is insufficient, the label shows only the start time or is hidden; the full interval remains available in the task tooltip and editor.

A floating preview shows the proposed interval. Drag near the top or bottom of a scrollable region to scroll automatically. Month range bars expose handles at their real endpoints; these change only the selected date, keeping its time. Middle segments across weeks have no endpoint handles. Rescheduling one task, including a diary task, offers **Undo** for about 12 seconds, extended while hovered or focused. Undo restores only that task line and refuses to overwrite subsequent changes to it. This shortcut does not yet cover batch editing.

The task editor supports:

- title and tags;
- priority and status;
- `start`, `scheduled`, `due`, `completion`, and related dates;
- start and end time;
- recurrence and before/after dependencies;
- source opening, saving, and deletion.

In any Markdown note, place the cursor on a task or plain text line and run **Noria: Edit or create task at cursor**.

Home, Diary, Task Board, and Timeline use this same editor. Start, Scheduled, and Due stay in fixed rows, with space for individual date and time digits. Type a time directly, or open the picker using the clock or `Alt+↓`. Expand repeat rules, dependencies, and lifecycle dates when needed. Dates and times are optional; changing the title adds no date, and editing one endpoint does not move the other. Save applies changes. Closing retains input for the current session; **Discard changes** clears it.

### 3.6 Create Period Notes

Selecting a date opens Diary in the workbench. A missing note is created on the first save, using the configured path and template. Quarterly notes and native-note entry points when Home is disabled still follow Calendar's creation-confirmation setting.

## 4. Task Timeline

Task Timeline is Noria's own time view for observing tasks across dates, time blocks, and stages. Tasks still come from source Markdown; the view provides organization, filtering, and interaction.

![Tasks and project phases across two weeks](assets/en/task-timeline-wide.png)

*This section describes Timeline in Noria 0.4.6. Screenshots use example tasks.*

### 4.1 Main Area And Sidebar

- The main editor area is useful for longer ranges, layer filtering, and broader inspection.
- The sidebar is designed to stay open as a compact view of the current schedule. Titles adapt to available vertical space.

Task Timeline should load after Obsidian restores the workspace and should not require Task Board to be opened first.

### 4.2 Navigation And Scale

One toolbar button switches between horizontal and vertical layouts. The vertical timeline mixes tasks, captures and diary records by date and recorded time. **Today** jumps to today's entries; scrolling up or down loads neighboring dates as needed. Click a date heading to navigate this timeline with the sidebar calendar without changing the diary page. An empty today still has a landing point. Horizontal span and vertical reading position are kept separately.

Complete or edit tasks in place. Completed tasks remain with reduced emphasis; vertical filters can hide them or open **Unscheduled tasks**. Folder and tag details are optional. Untimed entries do not add a time placeholder. Note creation and last modification are opt-in; last modification is not an edit history. Failed page loads can be retried at the affected edge without clearing existing entries. Dense days offer further expansion.

Long records start with a compact preview. **Read more** renders the complete Markdown in place; **Collapse** keeps the preview visible. Expansion is retained in the view state without changing the source note. Task completion and stream refresh preserve the focused control when it remains available, without taking focus from another panel. Failed expansion keeps the preview and allows retry.

In the horizontal layout, open **Filter → Visible range** to inspect and change the current duration. Expand **Custom duration** to enter hours, days, weeks, months or years; only **Save favorite** adds a shortcut. Use the panel's edit icon to reorder or remove favorites, or restore defaults while preserving custom entries. Custom spans retain their amount, such as **12 hours**. Edge arrows move by the selected span; months and years use calendar arithmetic. Resizing, refreshing and reopening preserve the endpoints; switching orientation does not rewrite the horizontal span. Free Ctrl/Cmd-wheel zoom displays **Custom** and the actual span. Named views also retain exact endpoints.

- Click **Today** to return to the current date.
- Use the wheel to pan horizontally through time.
- Drag an empty part of the time band to pan.
- Use `Ctrl/Cmd + wheel` to zoom.
- Drag either the bottom date row or the minimap to pan. Focus this area and use the arrow keys to pan or `+` / `-` to zoom.

Dates and the minimap share one continuous bottom area. There is one date row; at an hourly scale, the date appears on the first tick and when the day changes. Brighter minimap segments indicate the visible range.

![The same example tasks at an hourly scale](assets/en/task-timeline-hours.png)

### 4.3 Task Visuals And Write-Back

In the default free layout, task rows remain mixed across projects. The circle and short title identify the task; extra details appear during interaction:

- every task uses the same circle followed by its short title, positioned at its start time; tasks that started before the visible range stay at the left edge;
- hover or focus reveals full times, the duration rail, and source details; interval handles appear only during interaction;
- circle color expresses completion; completed titles keep the same color and weight as incomplete titles;
- full titles are shown when space allows and truncated only when necessary;
- clicking a title or circle opens the task in its Markdown source;
- dragging a task or interval boundary writes back to the source task line.

Before writing, Noria checks the source fingerprint and rejects an overwrite when the source has changed.

Choose **Filter → By project** for a project overview, then expand projects into individual task rows. Project titles open source notes; task titles open the shared editor. Only tasks in the visible date range occupy rows. Choose the Unscheduled count beside a project heading to select a task and edit its schedule. The neutral bracket shows the date coverage of the current tasks, not project progress or an explicit project plan. Dots indicate single dates and diamonds indicate deadlines. Very short intervals retain a small mark when zoomed out; hover for exact times. Their click targets are larger, while resize grips stay at the actual endpoints.

When an expanded project’s scheduled tasks are all outside the current window, **Show schedule** fits that project’s actual dates while preserving other projects and filters. Its arrow indicates earlier, later or both directions. Narrow panes show just the arrow; hover for the action and dates. Projects containing only unscheduled tasks keep their Unscheduled entry without inactive expand or fit controls.

The timeline icon on Home scopes the view to the current project and fits its task dates. Clear the project condition in Filter to return to all projects. Saved views retain grouping, project scope and expanded rows. Project layout displays tasks; use free layout for focus records and other activity layers. Switching layout retains the current project scope. Enable Focus in free layout to see that project’s scheduled tasks and actual work; saved views retain this combination. Focus on an unscheduled task also inherits its uniquely matched category and follows include/exclude tag filters. Opening focus still goes to its diary record, using the record anchor when preceding lines have moved. Project headings and tasks share the original timeline canvas without a left-hand name column. Names appear inside wide bars or just above short intervals; the overview retains its ordinary timeline position. Dragging still updates the original task without changing an independent deadline.

### 4.4 Layers And Filters

Use the Project selector in Filter to choose a project or return to all projects. Selecting a project expands it and fits its existing schedules; unscheduled tasks remain available from the count beside each project heading. **Visible range → Show all scheduled tasks** returns a panned view to the task dates in the current filter, and is disabled when there are no scheduled tasks. Favorite scales share a compact row; reordering, removal and restoring defaults appear when editing favorites.

Horizontal layers include tasks, marks, notes, Git, Noria, and Pomodoro. Pomodoro is off by default.

Filters support:

- showing or hiding completed tasks;
- text queries;
- including only specified tags;
- excluding specified tags.

Filters change only the view and do not modify tasks.

In the vertical layout, **Filter → View unscheduled tasks** opens tasks without an explicit date. The list starts at the top and keeps its position when refreshed. **Back to timeline** restores your previous reading position. Tasks remain in their source notes and can be edited through their titles; dragging them directly into Day/Week time slots is not yet supported.

Both orientations use the same task query syntax: `tag:#tag`, `path:folder`, and `status:open` / `status:done`. Combine these with ordinary text, or exclude tags and statuses with `-tag:` and `-status:`. Unscheduled tasks support the same conditions. Vertical records can be searched by body text and `path:`; task status conditions do not treat records as tasks. Filter settings are currently retained separately for each orientation and are not copied when switching.

### 4.5 Named Views

In either orientation, open **… → Save and manage views** to save the current setup. Filters hold content, visible range and layout controls. Horizontal views retain layers, completion state, query, included/excluded tags, time range and zoom. Vertical views retain tasks, records, note activity, completion state, query and task source display, while continuing at the current date.

Selecting a view restores its orientation and conditions; existing views are treated as horizontal. Changed conditions are marked as modified and replace the saved view only when you click **Update**. A failed save retains your input and the original view for retry. Renaming preserves conditions; deleting a view keeps the current filters and source records. Ordinary horizontal filters and the selected view are also restored with the Obsidian workspace.

### 4.6 Time Annotations

1. Click the toolbar button **Select a time range annotation**, then drag across an empty part of the main area to preview a range. You can also use `Shift + drag`.
2. Enter a name, choose a project registered on Home or **Global period**, and adjust the times and color.
3. Select **Save** to keep the annotation. **Cancel** or **Escape** discards the draft. Either action returns to normal panning.

Annotations appear as compact phase bands above the mixed task rows. Project annotations show **Project · Phase**. Overlapping bands use up to two rows; open **More phases** to access additional annotations. Click a band name to edit or delete it. While editing, dragging an endpoint changes the draft; use **Save** to keep it or **Escape** to cancel. Annotations do not change task dates. They describe phases or periods; they are not tasks or measured work time.

## 5. Calendar And Diary



The **+** action on a diary task card opens the shared task editor and saves to the selected day, week, month or year note. For a daily note, Scheduled starts at the selected date; Start and Due stay empty. Closing retains input for the current session; Discard changes clears it.

Choose **Add a card → Activity** to browse diary content, captures and task creation/completion by date. The current diary body is not repeated, and confirmed reviews remain in their own section. Load earlier records in batches of 7, 14 or 30 dates. Source buttons and event titles open the original note. Home uses the current week; Diary follows the selected period.

Card settings separately control records, task events, note creation and last modification. Task events require recorded creation/completion dates; planned dates are not treated as actual events. File activity is off by default. Last modification reflects the current file timestamp, not a history of individual edits.

Persistent **Home / Diary** navigation leads to a shared diary page: records above and the confirmed review below, reachable through the outline. They share the selected period, date, and Markdown source; reference material opens on demand. This update is available in the local experience build.

![Diary workspace](assets/en/diary-workspace.png)

Select the date title to open the existing calendar temporarily. **Open in sidebar** keeps it available beside the workbench; when that calendar is already visible, the date title uses it. Task Board, Timeline, and ordinary notes retain their independent views.

### 5.1 Main Actions

Daily, weekly, monthly and yearly journals use one Tasks card. The current period's top three priorities appear first, followed by other tasks. The first three completions are visible, with collapse and show-more controls. Priorities follow existing task priority and date ordering; past priorities are not inferred. Completion, editing, dragging to Focus and source links still act on the original task.

Overview, Tasks and Habits can share a row, with Record and Review below. Each diary period has defaults, while each note can customize its cards, statistics and layout.

Card definitions, filters, dimensions, ordering and folding are stored in Noria settings keyed by note path. Adding a card does not create or modify Markdown. Renaming a note or folder moves its settings. Prose, tasks and focus records remain in the source note.

Card settings apply to the current note. **Page settings → Default cards…** edits the shared starting point; **Restore default layout** clears local geometry and ordering while preserving the note's added cards and prose. Core and extension cards use the same note-specific layout rules.

Legacy `noria-view / diary-cards` blocks remain readable. On the first card edit, their configuration is adopted into plugin settings; historical source blocks are not automatically removed. No new blocks are generated. Copying a Markdown file alone does not transfer its Noria card settings; migrate plugin settings when transferring those arrangements. Markdown templates continue to own prose and headings.

- Hover or focus a card to reveal **…** for width, movement and folding. Layout changes are saved to the current note's plugin settings.
- Day, Week, Month, and Year change the period around the selected date. The date strip shows seven days in the selected week, adjacent weeks, months of the selected year, or adjacent years. The date title still opens the calendar.
- Select a month or year heading in the sidebar calendar to open its list. Choosing a month opens that monthly journal; choosing a year opens that yearly journal. The list stays open for further selections. The only middle-header action is Back to calendar, shown while a list is open. This action, selecting the same heading again, or Escape returns to the day grid without changing the viewed journal. Date-input popovers retain year → month → day selection without opening journals.
- **Today / This week / This month / This year** returns to the actual current period. Choosing a date closes the temporary calendar and returns keyboard focus.
- The date arrows use the same controls as the task panel. The pencil/book icon switches between editing and reading, as does Obsidian's reading/editing command with your current shortcut. The list, file, and refresh icons open the outline, source note, and reload action. Hover or focus a control for its label.
- Existing notes open for reading. Missing dates show the configured template ready to edit. Changes autosave while you write; saving keeps the editor, selection, and scroll position. `Ctrl/Cmd+S` saves immediately.
- Switching pages retains drafts, the cursor, and scrolling. Closing and reopening can recover unfinished text and its target date.

![Diary editing with autosave](assets/en/diary-editor.png)

*Editing in the local experience build, with example note content. The book icon returns to reading; no separate Save button is needed for normal writing.*

### 5.2 Creation Behavior

Use **Page settings → Add a card to this page → Diary section** to name a card and select an H2 heading. Suggestions come from the current note and its configured period template; you can also enter a heading. Preview shows that section and its nested headings. Common card controls handle size, order, collapse and removal.

Each day, week, month or year layout shares its own configuration; changing the selected period reads the matching section from that period's note. The header pencil opens the original heading. If the note is missing, this explicit action creates it through the existing calendar template flow. Browsing and preview never create a note. Missing, duplicate and empty sections have distinct messages. Section cards are reading surfaces with read-only task checkboxes; use the original note or task card to edit.

In **Record card → … → Card settings → Display scope**, keep the default **Full note** or choose **Selected sections**. Select H2 headings from the current note or template, or add another heading. Sections appear in source order; managed reviews and today's habit records remain in their own cards. Missing or duplicate headings show a message instead of revealing other sections. Each period type keeps its own scope. This only changes the reading view: the pencil opens the full note, and an active editor retains its content and selection. Adding a separate section card never automatically removes that section from Record; select the desired scope yourself.

Browsing, focusing, or leaving an untouched template creates no file. The first text change is autosaved to the selected date; a habit check-in or quick capture can also create it using the same configured template. The source icon explicitly creates and opens a missing note using Calendar's creation settings. Switching dates or reading modes flushes pending edits to their original destination. An existing empty or frontmatter-only note stays as it is; Noria does not refill its template.

New built-in day, week, month, and year templates start with **Notes** and **Plan**. Inbox, habit records, and review are added when used. Existing custom templates remain unchanged, and date variables follow the selected period, including past dates. Rename, remove, or reorder headings freely. `cssclasses: [daily-clean]` scopes typography to date notes and inherits the theme and fonts. The action list reads tasks across their original sources, including earlier unfinished work; task titles open the shared compact editor, its source icon opens the original line, and checkboxes complete or reopen the original task. The top-three focus appears only for the actual current period. Checkboxes inside the prose preview remain read-only.

Diary and Home habit actions write dated records to the configured daily note. Definitions stay in Habits.md; actual values and targets are stored with each quantitative record. Past dates show recorded activity and offer explicit backfill; future dates cannot be checked in. Recording a habit can create a missing daily note. Week, month, and year show a compact task/habit/writing summary with independent statistics available through Add card.

You can check a task or record a habit while editing prose. Independent changes carry into the draft; overlapping edits still require comparison. Habit annotations, tags, and block links are preserved. Outline follows the current headings in both reading and editing.

File-change events for the current period note refresh clean prose without rebuilding date navigation or card layouts. A clean editor retains its instance and selection. Unsaved, conflicted, unadopted recovery drafts and active IME input are protected from external refresh; concurrent edits still use the existing conflict and recovery flow.

If saving fails or the source changes externally, the editor keeps your input and offers retry, copy, and recovery actions. Reopened recovery text waits for editing or **Use this draft** before saving; simply opening it does not overwrite the source. Review uses the same protection described in [Save protection](#85-save-protection).

Installation does not rewrite existing templates, embedded views, or historical notes. The older `focusPanel` and `habitCheckin` habit controls also write to the selected date note, supporting withdrawals and actual values; they require an explicit date. Existing registry check-ins remain readable, and date-note records take precedence for the same habit and day, including withdrawals. Review historical migration differences first; duplicate records remain available for comparison. Quarterly notes and native entry points with Home disabled retain Calendar's creation and confirmation behavior.

The date-note preset uses matching heading levels in reading and Live Preview. Its styles are maintained in the plugin. If your vault also enables the older `daily-clean` CSS snippet, disable that snippet in Appearance to use the plugin preset; you can keep the snippet file.

### 5.3 Date Sources

Calendar supports three sources:

- **Noria** uses Diary root and templates from `Overview -> Paths`.
- **Daily Notes** reads Obsidian Daily Notes settings.
- **Custom** uses a separately configured folder, naming pattern, and template.

Only fields relevant to the active source are shown, preventing multiple path systems from competing on the same page.

### 5.4 Quick Notes And Daily State

In a daily **Record** page, the square-pencil icon opens Quick note for the selected date. Home capture and the **Noria: Quick note** command use today; assign a shortcut through Obsidian if useful. The composer names its target date. Week, Month, and Year do not silently write a daily note.

Enter inserts a new line; `Ctrl/Cmd+Enter` saves. Links, paragraphs, and indentation stay in Markdown under `## Inbox`. Today's notes receive a time; past or future dates do not receive a made-up event time. You can supply `[HH:mm]` explicitly. Reading shows a quiet time column, with untimed notes after timed ones, without rearranging the source.

A first capture uses the selected date's configured template. Unfinished input survives changing dates; a failed save keeps the text for retry. Independent prose changes are preserved, while an unresolved conflict blocks capture. Recording a note does not create a task; use passage selection when you choose to turn it into one.

Mood and Energy beside the daily record use native menus. Clear removes a value; Focus is optional under **…**, and existing weather remains background information. Filling in a state on an empty date also uses that date's template.

![Quick notes and state controls](assets/en/diary-quick-notes.png)

*Example content in the experience build.*

### 5.5 Diary templates and card layout

In Diary, **period toolbar … → Edit template** opens the actual template used by the selected day, week, month or year. **Change template** opens the corresponding existing settings: Noria templates, custom period templates, or Obsidian Daily Notes. Noria template inputs search Markdown files throughout the vault. Changes affect newly created notes only. An explicitly empty template starts blank; a missing or unreadable selected file stops creation with an error. Existing diaries can still receive captures and state updates after a template disappears. Only an unspecified template uses the built-in initial content.

The period toolbar ends with **Add card, Source note, and Page actions**. Add statistics through the shared card catalogue; their range follows the selected period by default. Record, Review, and added cards share the same layout. Drag blank header space to reorder, use the edges to resize, or use the Record/Review layout menu. Removing a card preserves source content; restore it from the catalogue. Each period type keeps its own layout. Place dated-note collections last, or embed the Base after your prose and review without duplicating it as a card.

### Dated notes in the diary

Dated notes stay in their own folders, named `YYYY-MM-DD Title.md`, with optional `HHmm` when distinguishing same-day entries. One shared Base can be embedded in daily, weekly, monthly or yearly notes, or displayed as a Noria diary card. For regular use, add the embed to your chosen period template. Noria does not append a separate list or rewrite existing diaries or templates.

Copy the [Dated notes Base template](templates/Dated%20notes.base) into your existing templates folder and insert `![[Dated notes.base]]` in the note body. The default “Records” view recognizes a leading `YYYY-MM-DD`, `YYYY-Www`, `YYYY-MM` or `YYYY`, optionally followed by a space and title. Weeks use ISO week-years and Monday–Sunday boundaries, including dates across calendar years. Unrecognized note names give no period results; they never imply today. Opening the Base independently shows all records. The “All” table remains available for manual filtering and configuration. The list shows titles, optional times and date groups; entries open their originals. Modification times and evolution paragraphs are not queried.

In the Noria diary, choose **Page settings → Add page card → Note or Base** and select the same file. This template follows the selected day/week/month/year even if the corresponding diary does not exist; viewing never creates a diary. The card hides the duplicate Base toolbar and omits the date group for a single day. Open **… → Manage contents** to configure the original Base; its changes refresh the card. Period context is bound only in memory, preserving the shared file. Each period layout still controls whether to include the card. This binding applies to this template; unrelated Bases are not rewritten. Custom filenames in native note embeds require matching Base rules, while Noria cards use the selected period directly.

## 6. Habits

Habits separate today's completion from long-term formation.

### 6.1 Today's Habits

The compact habit entry under the Home Inbox card is for quick check-in and does not repeat historical charts.

### 6.2 Habit Cards

The full habit card shows habit names, date columns, and check-in states. Consecutive completed days form connected bands; gaps and partial records remain distinct. Habit names reuse MOC card title size and weight so typography stays consistent across Noria.

Supported behavior includes:

- checkbox habits;
- numeric habits;
- targets and units;
- adding, editing, pausing, and marking a habit as established;
- refreshing sleep habits from `#tl/sleep`.

### 6.3 History And Heatmaps

Home keeps names and today's controls fixed. Recent days fit the card width; the history icon expands the configured range without increasing card height. Expanded history is horizontally scrollable and retains its inspected position through refreshes. The range includes today exactly once; **… → Card settings → History days** offers 7, 14, 21, 30, 60 and 90 days, initially 21. Select a historical cell to backfill that date. Streak counts appear only in expanded historical segments; today's column keeps its actual value or check-in state.

Each habit can have its own icon and color, with a scheduled streak and the actual number of checked-in days this week. Hover the summary for scheduled progress and extra check-ins. Streaks are independent of the visible window. Choose daily or selected weekdays and an effective date for schedule changes. Rest days and recorded pauses do not break a streak; extra check-ins on rest days do not increase it. An unfinished today is not counted as a break. Older habits keep their daily meaning, without inventing past pause intervals.

New habits can start in the past. Backfills before the first schedule count toward actual weekly check-ins and show a prompt to complete the historical plan. Select the habit name to edit its initial start date. Moving that date earlier extends only the first schedule, preserving later changes, pauses, and the original check-in notes.

Home and Diary share checkbox, numeric and time controls. Actual values stay separate from goals; failed saves retain input. The registry owns definitions and each date note owns its records. Renaming retains history, pause / established states keep past records, and a new goal does not reinterpret old check-ins.

Numeric target changes use **New schedule effective from**. New numeric habits keep target history from their initial start date; backfills use the dated target, while existing records retain their own target. An older habit's unknown target history is not invented when first changing its goal. If a backfill has no known target, the editor asks for **Target for this date**, saved only with that record. Once target history exists, use a new habit for a different type or unit to preserve historical meaning.

Numeric habits can explicitly bind to a daily record property, sharing one value with statistics. Heatmaps and period summaries remain available separately.

## 7. Trends And Statistics

Trends and Statistics are for observing sustained change, not evaluating yourself every day.

### 7.1 Shared Range

All statistics cards share one range control:

- Recent 30 days;
- Week;
- Month;
- Year;
- Custom range.

### 7.2 Note Trend

Note Trend shows newly created notes and the current non-whitespace character count of diary files. Character count describes current file content, not characters added that day.

Click a date position in either built-in trend chart, or select it with the arrow keys and press Enter, to inspect its sources. Note Trend separates newly created notes from diary character sources. Task Trend separates completed and open tasks; together they make up total activity. Selecting a source opens the note, focusing the current task line for tasks. Returning preserves the chart selection.

### 7.3 Task Completion Trend

This chart shows total task activity, completed tasks, and completion rate. Completed tasks without a completion date stay in an undated group instead of being forced into a day.

### 7.4 Habit And Workload Heatmaps

- Habit heatmaps can show one selected habit or the aggregate.
- Workload heatmaps normalize note, task, and word-count activity into relative intensity. They are not exact time tracking.
- Task counts use the configured task scope and actual completion dates. The legacy **Open diary statistics** view uses the same basis in **Completed tasks heatmap**. Open tasks and completions without a date are not assigned to a day. Source failures show an error instead of substituting diary checkbox counts.

### 7.5 Note Distribution

Note Distribution groups notes by top-level vault directory, not by tags. It helps reveal long-term content distribution and is not a score for how many folders you have.

### 7.6 Daily Records

Unrecorded daily fields show their icon and name. Categories have state icons; scales use visual segments. In **Configure records → Edit → State appearance**, change each state's label, icon and color while retaining its original stored value. Use a separate field for a different property, type, unit or scale range so old records keep their meaning.

Mood and energy are optional presets that can be renamed or disabled. In Diary, **… → Record fields** lets you choose a preset, reuse a property or create a field. Configure options, a scale, a number / unit or a toggle, plus an icon and color. By default each field keeps one current value per day; replace a numeric value or add to its daily total.

Enable **Multiple entries per day** on an individual field to retain each entry. Numbers can use a daily total or the latest entry; states use the latest entry, which does not represent an overall feeling for the day. Open the field to add, click a detail row to edit, or delete that row individually. Time is optional and starts blank for historical dates. An existing daily value is retained as an untimed entry; it is never split into invented events.

Diary uses compact, field-colored controls that save a selection immediately. Home’s Daily records card aligns up to three fields on one date axis: bands for categories and independently scaled trends for numbers. Missing dates remain gaps, not zeros. Click the header date to choose a day or return to today; a range containing today initially selects it. Click a field name or value to edit the selected day. Hover or use the arrow keys on a chart to browse dates, then click or press Enter to edit. Saving retains the selected date. Choose displayed fields with the header filter icon, and expand Summary & sources for distributions, averages and source records.

Single values live in the date note’s native properties. Multiple entries live in a dedicated Markdown section; the property is a derived daily summary for Bases. Statistics and bound habits derive their values from the same details. Period averages count daily summaries, not individual events. Existing days keep their stored summary method and remain editable after multiple mode is disabled. If you edit detail Markdown manually, Noria reads those details; its next save updates the property summary. Do not overwrite the property to replace the details.

Disabling a field preserves history; renaming its display label keeps the property key. Use a separate field for a different unit or type so old values retain their meaning. Review material includes the configured names, units and values for the selected period, with details retained in the diary body.

“Choose displayed fields → Manage fields” and “… → Manage contents” open the same field list. Disabling a selected field preserves the card’s choice without substituting another field. Re-enabling restores it, and statistics can still read historical values. An empty card offers field selection or management when all fields are disabled. Diary choices are saved separately for daily, weekly, monthly and yearly layouts; statistics added from a record stay on the current page.

![Custom records and statistics](assets/en/daily-state.png)

### 7.7 Custom Statistics Cards

Choose **Overview** from Add a card or Statistics templates to display focus, tasks, habits and diary characters in one full-width card. Configure rows 1–6 to select, hide or reorder metrics, including note counts and configured numeric daily records. In a diary it follows the selected day, week, month or year. Hover or use arrow keys to inspect a date across all rows; click or press Enter for sources. The day view shows time positions only for actual focus segments. Characters reflect the current non-whitespace diary contents, not historical editing volume. Existing page layouts are not automatically replaced.

The generic statistics configuration preview is read-only. Select dates and inspect values or sources; use the saved card or original note to enter or edit records. Canceling configuration does not save the card draft.

Preview sources open for reading inside the details window, with expandable properties and read-only task checkboxes. Back to sources restores the list; closing details returns to the unapplied settings with the draft and edit position retained. Sources opened from a saved card still go directly to the original note.

Choose “Add statistics card” from a record to prefill its property, or select Statistics in the card catalog and start from a record, folder, task or habit template. Configure Source → Field and calculation → Time range → Display, alongside a preview of actual data. Open matched counts and source details from the top-right chart button. Additional filters cover subfolders, tags, property conditions and grouping.

Task sources show the title, date and file path. Selecting one closes the list and focuses the current task line, even after surrounding paragraphs move it. Changed or ambiguous tasks prompt you to refresh the statistics. Ordinary note sources reuse an open tab; missing sources do not create empty notes.

Use count, sum, mean, minimum, maximum or category distribution, or reuse task and habit statistics. Diary cards follow the selected period; Home follows its shared range. A card can instead use fixed or all dates. Trends for ordinary notes require an event-date property or an explicit file creation / modification date. A current category is not a history of changes.

Use Statistics templates in the card library to browse or search templates. All styles starts with editable chart types. Returning from the editor keeps the selected category, search and template; unapplied edits can be kept or discarded.

Available displays follow the data type: numbers, lines, columns, horizontal bars, donuts, continuous strips, daily states, calendar heatmaps, target progress and period comparison. Overlapping categories and negative values cannot become donut shares. Task completion uses all tasks in the chosen due/scheduled cohort and their current completion state; habit completion uses historically scheduled check-ins through today. Targets use the same unit as the value. Comparison uses equally long ranges, truncates the current period at today, and does not calculate percentage growth from a zero baseline. Zero baselines and missing records are explained directly. Signed comparisons share a zero line, with negative values to the left and positive values to the right. Number summaries retain exact values with a smaller unit; click the number or either comparison period to inspect its own sources. No scheduled check-ins is not shown as 0% completion. Values above the target retain their actual percentage while the bar stops at full.

Click a donut slice or leader label to inspect or edit its source. Labels remain interactive when the legend is hidden; use Tab and Enter or Space with a keyboard. Hover or focus a category to highlight its leader and temporarily show its full name, value and percentage; leaving it clears the readout. Read-only donuts also support keyboard inspection. Dense labels receive more vertical room, and cross-side leaders stay outside the ring. Tiny shares retain their true size and can be opened from labels or composition detail rows. Horizontal bars share a common baseline and track width for accurate comparison.

Heatmaps and daily state grids label their months. Monthly calendars align each month to weekdays. Long heatmaps and strips initially reveal the selected date and retain selection and scrolling after source updates. Tab enters the selected day; use arrows and Home/End to navigate. Long heatmaps move one week horizontally and one day vertically; monthly calendars move one week vertically. Numeric heatmap colors follow signed values from low to high, with a scale legend. Zero, missing records and multiple states remain distinct.

The homepage habit and workload heatmaps retain their own yearly views and show each year in a cross-year range. Tab enters a day; left/right moves a week, up/down moves a day, and Home/End reaches the year's endpoints. Focus shows a temporary exact readout. New notes use their original creation dates, never weekly or monthly bucket totals. Completed tasks shares the configured task scope and completion dates with Task completion trend: explicit completion dates take priority, daily-note tasks without one use the note date, and tasks without any usable date stay outside day cells. Diary characters counts current non-whitespace content, including properties and Markdown syntax. Later edits change the count; it is not daily writing output.

Activity intensity scales daily completed tasks, new notes and diary characters to their respective daily peaks in the range, weighted 35%, 35% and 30%. Colors and active dates support relative comparisons, not hours worked or productivity; changing the range can change colors and rankings. Mixed scores are no longer displayed as output quantities. Open **… → How this is calculated** at the top right of the workload heatmap for the current metric's definition and the number of completed tasks without a usable date. The explanation follows the selected metric. The same menu is available on Home, Diary and custom pages.

Missing values remain distinct from zero and false; lines break across missing dates. Incompatible types or a specified mixed-unit property list the affected sources. Multi-select categories count each note once per category. Select a daily state or a single property source to edit it in place; multiple sources open a note chooser. Writes go to that source, and a changed original value blocks a stale edit. Missing diary dates support backfilling; future actual records are disabled. Summary numbers and task/habit charts show sources rather than writing an aggregate back to one record.

![Configure a statistics card](assets/en/card-statistics.png)

*Screenshots use isolated demonstration records. Card and configurable-record improvements are in the current experience build and have not been formally released.*

## 8. Review Center

Day, Week, Month and Year reviews appear **below the diary body**, also reachable through its outline. Records and review share the selected date and Markdown note. The preview shows confirmed text; recovered drafts and reference material remain separate. Review commands still open the requested period directly. This update is available in the local experience build and has not yet been formally released.

![Review Center](assets/en/review-center.png)

*The screenshot uses example content.*

### 8.1 Core Flow

1. Select a period and target date.
2. Read an existing review, or start writing if the period is still unwritten.
3. Use a section's pencil to edit it, or **Edit review** for the full Markdown. Both edit the same draft.
4. Open **Reference** when you need records, earlier reviews, evidence, or external analysis.
5. Changes autosave to the selected date note while you keep editing. Reading a different reference does not change this destination.

### 8.2 Reading And Editing

Sections follow the actual Markdown hierarchy and order, including custom and repeated headings. Short sections are shown in full; long ones offer **Read more**. Wide panes can pair two adjacent short sections, while narrow panes use one column. The outline icon opens a section menu. Source, reload, and reference icons stay beside it; hover or focus them for their labels.

The editor uses Obsidian's Markdown Source mode, with headings, lists, links, undo/redo, and `Ctrl/Cmd+S` for immediate saving. Autosave keeps the editor and cursor in place, and waits for IME composition to finish. Editing a section keeps the rest of the document intact. **All sections** and the book icon flush pending edits before returning to reading; Obsidian's reading/editing command and your assigned shortcut also work here. Use undo for ordinary corrections. To rename the review's outer title, edit the full Markdown.

**Add a writing outline** is optional. You can rename, remove, or add headings, write a few unstructured lines, or keep GDD as a personal reflection outline. Noria no longer creates mandatory Highlight, Deviation, and Blocker fields. Existing templates and historical notes are not rewritten on installation; custom templates remain under your control. Mood, weather, energy, and focus remain separate Daily State data.

### 8.3 References Across Periods

**Reference → Records** opens alongside the review in a wide pane. In a narrow pane it temporarily takes the reading area; close it to return to the same editor and cursor.

A monthly review can reference weekly reviews and follow **Read source records** into their daily notes. A yearly review can reference months or daily records. Missing lower-level reviews do not prevent reading the available records or writing the current review. Dates resolve through Noria's existing diary and Calendar paths. When viewing the current day's records, the review being edited is omitted from the reference preview to avoid repeating it.

Tasks in review previews are read-only. Open the source to change them. Legacy embedded dashboards and note transclusions link to their source instead of exposing controls that could write using the wrong line number; ordinary images remain visible.

### 8.4 Evidence And External Agents

**Reference → Analysis** keeps the separate proposal available. A notice identifies changed material or missing material-version information. **Prepare material** reads the current records and updates the material and prompt; it does not generate analysis or alter your review. If preparation fails, the existing analysis stays available and you can retry.

The development MCP connection supports review reading, material preparation and analysis submission (`reviews.read`, `reviews.prepare`, `reviews.submitAnalysis`). An external assistant saves its analysis separately and Noria requests a view refresh. In **Reference → Analysis**, choose sections to add to your review; existing prose is preserved. Changed material or analysis requires another inspection before submission. See [Review API](AGENT-API.md#reviews-and-reading-material). Installing the test build and native acceptance remain pending.

Noria prepares local evidence JSON and prompts but does not call a model inside the plugin. From **Reference → Analysis**, prepare the evidence, run your external workflow, then refresh to inspect its review note.

The prompt points to a `.material.json` file containing original prose, relevant task/state facts, and a source index. The full evidence JSON remains available for checking a specific gap. Monthly material prefers adopted weekly reviews; yearly material prefers monthly reviews, with daily records when lower reviews are missing. Executable view blocks and repeated statistics are omitted from the reading material; authored text is retained.

The default skill uses concrete theme headings, distinguishes facts from interpretation, and respects personal records without forcing them into action plans. Length follows the material. It asks for additional reading only when a named gap affects an important judgment; it does not require scanning the vault, all conversations, or every project's plans.

For an existing installation, use **Default review Skill → Install** in the review settings to update an unchanged older stock skill. Custom skills are preserved; **Reset** deliberately replaces them. Noria still does not run a model or automatically adopt its output.

**Add this section** adopts a selected analysis section into your review, preserves the existing text, and autosaves the result. Merely opening or refreshing analysis does not add it to your note. Adoption does not create tasks. Keep only material you want in your own review; observations and personal records need not become actions.

### 8.5 Save Protection

- Unsaved content enters a recovery draft.
- Noria blocks an overwrite when the target note changed externally.
- External analysis enters your review only through deliberate adoption.
- Your edits autosave; reopening a recovery draft alone does not write it to Markdown.

When a recovery draft's original source still matches, its text reopens for inspection. Edit it or choose **Use this draft** to resume saving. If the source changed, an older draft cannot be verified safely, or another draft remains for the same period, use **Drafts (n)** to inspect, copy, or use a selected draft. **Discard this draft** applies only to that draft.

After a save conflict, **Keep draft and reload source** preserves the local content before loading the latest source for editing. A successful save clears only the drafts handled by that save; other editors' drafts and unresolved content remain available. Hard breaks, indentation, and fenced code are preserved and included in conflict checks. Dates and periods that disagree are rejected.

The first save binds one complete review with two hidden-in-reading-mode comments. Keep both comments when editing the source; titles inside them are free to change:

```markdown
%% noria:review:start %%
## A few things from this month

### Worth remembering

Your own words.
%% noria:review:end %%
```

Incomplete or duplicate boundaries, ambiguous legacy review headings, and unfinished fences prevent saving. Use **Open source** to repair the note, then refresh. Content outside the review is preserved.

### 8.6 Create Or Link Tasks From Records

Select a passage while reading or editing a diary or review. Use the context menu or **… → Create task from selection**, or **Link selection to an existing task**. Both actions are also available as Noria commands, with shortcuts assignable in Obsidian.

For a new task, the shared editor lets you change the title and choose **Save to**: an existing project task note or daily tasks on the adoption day. Dates remain optional. Linking an existing task adds the source without changing its title, status, or schedule. Selecting text that is already a task opens that original task.

The original passage stays intact. The task stores an ordinary Markdown link and quotation beneath its checkbox. After saving, continue at the original reading or editing position; **View task** opens the task, and its **Back to record** icon returns to the source diary or review. Repeating the action on the same passage offers linked tasks and an explicit option to create another.

Closing the task editor keeps input for the current session; **Discard changes** clears it. Unresolved record drafts and changed source passages must be handled before a task can be saved. A task adoption action does not accept a recovery draft on your behalf.

![Create a task from a review passage](assets/en/review-task-adoption.png)

## 9. Settings

Noria settings have seven top-level pages.

### 9.1 Overview

Overview initializes and checks the workspace:

- Standard workspace and Custom paths;
- missing files and directories;
- folded path groups;
- module switches;
- query range and performance;
- initialize, repair, and open actions.

### 9.2 Home

Home settings cover:

- display name, salutation, avatar, and quotes;
- level-one Home widgets;
- MOC entrances;
- Inbox workflow;
- review prompts;
- weather.

Home uses one widget manager instead of separate legacy managers for the first screen, workbench, and trends.

### 9.3 Tasks

Tasks settings control Task Board opening behavior, scan range, include and exclude tags, status policy, and advanced queries.

### 9.4 Timeline

Timeline settings control opening position, drag step, default layers, completion state, scale, named views, and context axis.

### 9.5 Calendar

Calendar settings select Noria, Daily Notes, or Custom as the date source and control confirmation, open-after-create, today highlight, and period templates.

### 9.6 Appearance

Appearance controls density, theme following, status colors, tag colors, and planner details. It presents visible semantic choices instead of requiring ordinary users to edit raw tokens.

### 9.7 Maintenance

Maintenance provides:

- Noria installation checks;
- a locally saved troubleshooting report;
- settings backup export and import;
- SecretStorage status;
- trusted custom JavaScript view management;
- developer diagnostics when expanded.

## 10. Markdown, Data, And External Workflows

### 10.1 Data Boundaries

| Layer | Content | Source of truth |
| --- | --- | --- |
| Content | Notes, tasks, projects, diary, habits, countdowns | Markdown or Base |
| Configuration | Paths, modules, Home layout, view preferences | Plugin `data.json` |
| Derived | Statistics snapshots and review evidence | Regenerable support data |
| Recovery | Unsaved reviews and preserved conflicting drafts | User input that cannot be regenerated; cleared only after the corresponding save or explicit discard |
| Credentials | Weather service keys | Obsidian SecretStorage |

Noria does not convert the vault into a private database. Ordinary Markdown remains readable and editable when the plugin is disabled.

### 10.2 Tasks

Noria reads standard Markdown tasks:

```markdown
- [ ] Organize experiment results [start:: 2026-08-04] [due:: 2026-08-07]
- [x] Complete the first draft [completion:: 2026-08-03]
```

Tasks can include `start`, `scheduled`, `due`, `completion`, `created`, `cancelled`, priority, and related fields. Task Board, Task Timeline, and Calendar edit the same source line.

### 10.3 Timeline Events

Tasks with `#tl/` tags and time fields can enter Task Timeline. Event templates live in `Event library.md`:

```markdown
- [x] Deep work [default_tag:: #tl/focus] [default_start:: 09:00] [default_duration_min:: 90] #tl/template
```

### 10.4 Habits, Projects, And Countdowns

- `Habits.md` stores active, paused, and established habits.
- `#habit` tasks are excluded from ordinary task lists by default.
- `Projects.md` uses groups and wikilinks for project entrances.
- `Countdowns.md` stores important dates in a Markdown table.
- `Inbox workflow.md` explains the workflow; `Inbox queue.base` provides an editable file and property view. Both the card and Base use the note’s `inbox-work` assignment.
- Unmodified default queue and guide files update automatically. Custom or untracked content stays intact, and deleted files are not recreated. To adopt a new version or restore the previous one, open Companion files in the advanced Inbox workflow settings. Restoring keeps your choice instead of automatically replacing it again. If the file was edited after updating, it stays intact and backup details remain available.

### 10.5 Diary And Review

Daily, weekly, monthly, and yearly notes remain ordinary Markdown. Diary and Review read and edit the same date note; task lists and statistics are provided by the workspace. Existing embedded view blocks remain available in older notes and templates.

### 10.6 External Content On Home

Markdown briefing sources use:

```text
name | path | role | freshness hours
```

For example:

```text
Daily briefing | Noria/Inbox/daily-brief.md | daily | 36
Current suggestions | Noria/Inbox/current-suggestions.md | current | 72
```

Available roles include `daily`, `current`, `weekly`, `project`, and ordinary note.

### 10.7 External Agent Collaboration

1. An external agent reads selected Markdown, review evidence, or a Noria JSON export.
2. The agent writes a briefing, suggestion, project monitor, or review result to an agreed file.
3. Noria displays the content and preserves source navigation.
4. Diary and final review content is written back only after user confirmation.

### 10.8 Security Boundary

- Custom JavaScript views are disabled by default.
- Only explicitly trusted vault-relative paths run.
- Protocol URLs, absolute paths, and path traversal are blocked.
- Noria does not silently move notes, reorganize folders, or rewrite unrelated prose.

## 11. Common Workflows

Noria does not require every module to be used every day.

### 11.1 Start The Day

1. Open Home and check current progress and active projects.
2. Choose a task that fits the current pace.
3. Check today's habits and nearby countdowns.
4. Open Task Timeline or Calendar only when a concrete time arrangement is useful.

### 11.2 Capture Quickly

- Use **Noria: Quick note** for today or the Diary icon for the selected date. Timeline also provides quick-note input.
- Use Task when the item is already actionable.

### 11.3 Process Inbox

Capture first, then read and organize when useful. No processing stage is required. Select a title to open its source note; an existing tab is reused. Returning to Inbox keeps the filters and reading position. Long lists scroll inside the card without increasing its height.

- Hold an item to reveal the side actions, then drag and release to assign it. You can also select its existing marker or right-click. Your shortcuts are Read, Organize and Distill; SI offers Organize and Distill. Both support custom actions.
- Filter by Me / SI and action in the header. The optional text property `inbox-work` stores the current assignment and is shared with `Inbox queue.base`. Editing it in the Base updates the card automatically.
- Put detailed requests in the source note and keep results in the actual materials. Assigning SI records the work; it does not start an external assistant.
- Once the destination is clear, use Move out of Inbox to choose an existing folder. Moving preserves the body and clears temporary `inbox-*` properties. The action receipt provides Undo.

Moving removes the item from Inbox by default. Select “Keep in Inbox” to append a plain Markdown link to `Inbox.md` in the Inbox folder; add handoff text directly when useful. No identifiers are generated and old assignments are not inherited. Done removes only the entry and can be undone; sources remain. Assigning Me/SI adds the optional work marker. Automatic triggers are not connected; assigning SI does not start execution.

### 11.4 Use Task Board

- Month shows longer-term distribution.
- Week arranges the near-term schedule.
- Day handles today's time blocks.
- Matrix reconsiders priority.

### 11.5 Use Task Timeline

1. Use Today, wheel pan, background drag, or the bottom navigation to locate the range.
2. Choose layers, completion state, and tag filters.
3. Click a title or circle to open its source; hover or focus for details.
4. Use a task's interaction handles when its schedule needs adjustment.
5. Add a named project or global time annotation when you want to show a phase without changing task dates.
6. Save a useful center, scale, layer set, and filters as a named view.

### 11.6 Advance Projects And Knowledge

1. Find a project in Home's Projects area. With the starter workspace, you can use one of the example projects first.
2. Enter a concrete action in **Add next step**. Noria uses the project's existing task note and task section. If several task notes are possible, choose the destination. The new task appears immediately, and failed writes retain your input.
3. Click a task title to use the same editor as Task Board. Tags, priority, repeat rules, and dependencies are available there too. The source icon opens the original task line. Dates are optional, and closing retains input for the current session.
4. Complete or reopen a task with its checkbox. Use **View all** for the remaining list and expand completed items when needed. Task Board and Task Timeline read the same original task; undated tasks remain undated until you schedule them.

Maintain stage outputs in the project note and connect reusable conclusions to the appropriate MOC.

![Shared task editor with optional dates and times](assets/en/workbench-task-editor.png)

### 11.7 Use Habits And Trends

Use Home for today's check-in and recent records, expanding longer history when needed. Open Trends and Statistics for broader habit history and heatmaps. Trends are more useful during weekly and monthly review than as a daily score.

### 11.8 Receive External Briefings

An external workflow generates Markdown and Home displays its summary and source. After reading, decide whether the content should become a task, project material, or long-term note.

### 11.9 Complete A Daily Review

Open the day, read what is already there or start writing, and edit only the part that needs attention. An outline and external analysis are optional. Save explicitly to the same day's note.

### 11.10 Review A Period

Inspect task, project, habit, Daily State, and trend evidence. Separate completed work, still-useful work, items to adjust, and items to stop, then keep only a small number of priorities for the next period.

### 11.11 Minimal Use

```text
capture a note -> choose a task -> update Markdown -> review when useful
```

## 12. FAQ And Troubleshooting

### 12.1 Standard Diagnostic Order

1. **Entrance**: confirm the module is enabled and the intended view is open.
2. **Source**: confirm the Markdown exists, is saved, and uses the expected format.
3. **Scope**: confirm paths, scan roots, dates, and tag filters include the target.
4. **Refresh**: use the view refresh or retry action, then reopen the view.
5. **Diagnostics**: run the installation check under Maintenance and save the report.

Do not begin by deleting `data.json`, rebuilding every file, or reinstalling the plugin.

### 12.2 A View Opens Blank

Check that the plugin and module are enabled, required paths exist, and the view is not still loading. Use Retry or reopen the view. If Task Timeline must be restored by opening Task Board after every restart, treat that as a startup recovery bug.

### 12.3 Tasks Do Not Appear

Check Markdown task syntax, whether the source is saved, scan scope, include and exclude tags, date range, and whether the current view hides completed, cancelled, undated, or habit tasks.

### 12.4 Board, Timeline, And Calendar Disagree

Compare date range, completion state, tag filters, and undated-task policy. The three views share task facts but serve different display goals, so item counts alone are not sufficient.

### 12.5 Timeline Is Slow Or Cannot Be Operated

Confirm that the pane is not a diagnostic shell, narrow the task scan scope, reduce unrelated layers, and check for source conflicts. Persistent blank state, unresponsive wheel panning, or recovery only after rerunning a command should be reported as a bug.

### 12.6 A File Was Created In The Wrong Folder

Check Diary, Inbox, Projects, template, and registry paths under `Overview -> Paths`. **Replace all paths** switches the entire mapping, so inspect the preview before applying it.

### 12.7 A Home Widget Has No Content

Check whether the widget is enabled, its source path exists, the file is non-empty, the briefing is still fresh, and the widget is not hidden. Stale Markdown should not present itself as current information.

### 12.8 Statistics Differ From Expectations

Check the shared time range, task completion dates, note scan scope, diary naming, habit source, and saved file state. Incomplete data is not the same as zero.

### 12.9 Review Cannot Save Or Refresh

Check the target period note and path. After an external agent updates its note, use Refresh. When a source conflict appears, compare the target note instead of forcing an overwrite.

### 12.10 Weather Does Not Appear

Weather is off before first initialization. After enabling it, choose a location or city, configure SecretStorage credentials when the provider requires them, and use manual refresh to verify the result.

### 12.11 An External Briefing Does Not Appear

Check that the target `.md` file was generated, source path and role are correct, modification time is within the freshness window, and the body is not empty.

### 12.12 Restore Settings

Prefer importing a settings backup, filling missing paths, restoring one module's defaults, or recreating missing files. Delete `data.json` only when you intentionally want to clear all settings.

### 12.13 Report A Problem

Include Noria, Obsidian, and operating-system versions, the affected module, minimal reproduction steps, a screenshot, the Maintenance report, and relevant console errors. Do not include API keys, complete private diaries, or unrelated vault content.

## Appendix A: Paths And Data Storage

### A.1 Standard Workspace

| Purpose | Default path |
| --- | --- |
| Timeline settings | `Noria/Timeline settings.md` |
| Event templates | `Noria/Event library.md` |
| Countdowns | `Noria/Countdowns.md` |
| Habit registry | `Noria/Habits.md` |
| Project registry | `Noria/Projects.md` |
| Inbox workflow | `Noria/Inbox workflow.md` |
| Inbox queue | `Noria/Inbox queue.base` |
| Inbox content | `Noria/Inbox/` |
| Projects root | `Noria/Projects/` |
| Diary root | `Noria/Diary/` |
| Daily, weekly, monthly, and yearly templates | `Noria/Templates/` |
| Avatar and quotes | `Noria/avatar.svg`, `Noria/Quotes.md` |

Standard initialization can also create `Noria/Workflow·MOC.md` and `Noria/Knowledge Base·MOC.md`. The current version does not require `Noria/Home.md`; Home is a plugin view.

### A.2 Recommended IPARA Mapping

| Purpose | Recommended path |
| --- | --- |
| Noria lists and workflow files | `02_Areas/Noria/` |
| Noria templates | `02_Areas/Noria/Templates/` |
| Inbox content | `00_Inbox/` |
| Project content | `01_Projects/` |
| Diary and period notes | `06_Diary/` |
| MOC entrances | `05_MOC/` |
| Avatar and quotes | `02_Areas/Noria/` |

Changing configuration does not move existing files. Initialization creates only missing content.

### A.3 Plugin Configuration And Cache

```text
.obsidian/plugins/noria/data.json
.obsidian/plugins/noria/cache/stats/snapshots/
.obsidian/plugins/noria/cache/stats/tasks/
.obsidian/plugins/noria/cache/stats/review/
.obsidian/plugins/noria/cache/review/recovery-drafts.json
```

Markdown, Base, Canvas, templates, and final review notes should be preserved. Statistics caches and evidence can be regenerated. `cache/review/recovery-drafts.json` contains user input and must not be deleted as ordinary cache. The repository installer preserves existing `data.json` and `cache/`. A settings backup does not include recovery drafts; include the recovery file when backing up unsaved content.

### A.4 Review Paths

The final review is a section of the corresponding date note, such as `Noria/Diary/2026/2026-08-04.md`, `2026-W32.md`, `2026-08.md`, or `2026.md`. Daily reviews follow Diary root; longer periods use their configured Calendar paths.

External analysis artifacts are separate notes under Diary root:

```text
06_Diary/2026/2026-08-04-review.md
06_Diary/2026/2026-W32-review.md
06_Diary/2026/2026-08-review.md
06_Diary/2026/2026-review-month.md
06_Diary/2026/2026-review-week.md
```

The Standard workspace uses the same names under `Noria/Diary/`.

### A.5 Migration And Backup

Preserve user content, Noria registries and templates, final review notes, and a settings export. Statistics caches usually do not need to move. SecretStorage credentials such as weather keys must be configured again on a new device.

## Appendix B: Advanced And Developer Reference

### B.1 Extension Boundaries

Noria provides three extension surfaces:

1. Markdown file contracts;
2. versioned JSON exports;
3. trusted custom JavaScript views.

Internal DOM, CSS class names, cache implementation, refresh hooks, and source-module paths are not stable public interfaces.

### B.2 Custom JavaScript Views

Custom views are disabled by default. When enabled, vault JavaScript receives access to Obsidian, Noria, `window`, and `document`; it is not a security sandbox.

```js
const bridge = input.noriaBridge;
const result = await bridge.data.getSnapshot({
  preset: "home",
  range: { mode: "last30" }
});

const el = document.createElement("pre");
el.textContent = JSON.stringify(result.range, null, 2);
input.mount.appendChild(el);
```

Run only code that you wrote or reviewed, and prefer the injected `input.noriaBridge`.

### B.3 Public Data API

The experience build also exposes `app.plugins.plugins.noria.api` (version 1) for task queries/date/status updates and daily suggestion reads/updates. See [External Agent API](AGENT-API.md) for inputs, conflicts, refresh and lifecycle behavior. The existing Data API below is unchanged; task writes use the new API's `ref`, not the Data API `identity`.

```js
bridge.data.resolveRange(request)
bridge.data.getSnapshot(request)
bridge.data.getTasks(request)
bridge.data.getTimelineAnnotations(request)
bridge.data.getTimelineTraces(request)
bridge.data.getPeriods(request)
bridge.data.getReviewEvidence(request)
bridge.data.export(request)
```

`data.invalidate()` is an internal refresh hook and is not part of the public contract.

### B.4 Ranges And Presets

Ranges include `last30`, `week`, `month`, `year`, `custom`, and `homeCurrent`. Built-in presets include `home`, `board`, `timeline`, `periodic`, `review`, and `exportAll`.

### B.5 Snapshot

```json
{
  "meta": { "schemaVersion": 1, "request": {}, "resolvedRequest": {}, "policy": {} },
  "range": {},
  "granularity": "day",
  "domains": {},
  "views": {},
  "warnings": [],
  "sourceCompleteness": {}
}
```

Callers must inspect `schemaVersion`, `warnings`, and `sourceCompleteness`.

### B.6 Task Facts And Write-Back

Task identity is determined by:

```text
sourcePath + line/blockId + fingerprint
```

Write-back must locate the source Markdown, verify the fingerprint, modify only the target task line, and reject an overwrite when the source changed. A renderer does not modify the vault directly.

### B.7 JSON Export

```json
{
  "exportKind": "noria.snapshot",
  "exportVersion": 1,
  "exportedAt": "",
  "noriaVersion": "0.4.6",
  "payload": {}
}
```

Supported kinds include `noria.snapshot`, `noria.tasks`, and `noria.reviewEvidence`. External tools should parse by `exportKind` and `exportVersion`.

### B.8 Compatibility

Extensions should check `bridgeVersion` and data `schemaVersion`, feature-detect optional fields, avoid depending on internal property order, never edit `data.json` directly, and never read or print SecretStorage credentials.

### B.9 Source Validation

```bash
npm ci
npm run build
npm test
npm run release:check
```

The public installation package contains only `manifest.json`, `main.js`, and `styles.css`.


### Pictures and date navigation

Card, habit, record-field and state appearance settings share one picture picker. Search the host application's icons, enter an emoji, or select PNG, JPEG, WebP or SVG images from a vault folder, optionally including subfolders. Images keep their original colors; line icons inherit the content color. Stable image references follow file and folder renames within the vault. Missing images can be replaced or reset to the default.

Change home card pictures in Card settings. Built-in diary cards offer Change picture in their header menu; layouts remain shared separately by daily, weekly, monthly and yearly notes. Action icons keep a consistent meaning.

The date strip arrows move a group of dates. The row below combines the date range, period controls, return-to-current action and document actions. Narrow cards keep editing visible and collect secondary actions in More. Clicking the range opens the existing sidebar calendar on its day grid. Month/year headings open lists whose entries directly open the corresponding journals. The list remains available; the middle-header calendar icon returns to the day grid. Review actions sit beside the Review heading.

Built-in home, diary, task calendar, Timeline and statistics views run without Dataview. Dataview remains optional for user-authored Dataview queries; it is not needed for Noria's native data queries. New habits use semantic default pictures; explicitly selected pictures and colors are preserved.

Daily record charts use compact bands for scales and trends for continuous numbers. Missing data is distinct from zero. Completed habit runs show their count in the last block, starting at two. Counts use the complete history and historical schedule, independently of the displayed history window.

### Card layout gestures

The function picture stays at the far left, frequent actions on the right, and the `…` menu at the far right. Collapse or expand a card from that menu; its title and menu remain available when collapsed. Diary Record and Review sections use their own `…` menus in the same way. They save edits before collapsing and remain visible if saving fails. Drag blank space in the card header to reorder; text, links and buttons retain their normal behavior. Drag the outer right edge to preview a snapped width, release to save, or press Escape to cancel. At narrow viewport widths cards use the responsive layout; the Layout submenu sets the preferred width for a wider view. Height remains adjustable at the bottom edge without entering layout mode.

The native header menu retains content management and Card settings. Its Layout submenu contains Narrow, Medium, Wide, Full row, Move up, Move down, Automatic height, Collapse/expand, and supported Duplicate card and Remove from page actions. Every item has an icon and a short label; the current width has a checkmark. Remove from page retains configuration, contents and position: use Undo or Restore in Add a card to bring it back. There is no separate Hide action. Diary Tasks, Habits, Record and Review support title and picture changes in Card settings, without rewriting source headings or contents. Width is configured only under Layout. Use Move up and Move down for keyboard or touch reordering; with the width handle focused, arrow keys adjust width; the height handle's Home key restores automatic height. Daily, weekly, monthly and yearly diary layouts remain separate.

Default mood pictures share one expression family, energy uses five sun states, and focus uses converging rings. Empty fields remain muted. Pictures and state labels remain customizable, and these default pictures are also available in the shared picture picker. Legacy default pictures use the refreshed artwork; custom pictures and state overrides are retained.

New focus records write start/end times at second resolution, without milliseconds. Cross-day dates and paused intervals remain explicit. Legacy millisecond records remain readable; the internal timer still uses milliseconds. Summary displays use minutes or hours where appropriate.
