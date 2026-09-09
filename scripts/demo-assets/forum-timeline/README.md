# Task Timeline screenshot sample

Fictional Markdown tasks for the English community-post screenshot. The scene follows a small team making a city garden field guide and hosting a community walk over two weeks. These notes contain no personal work records.

To reproduce the scene in a disposable vault:

1. Copy `Field notebook.md`, `Illustrated guide.md`, and `Community walk.md` into a project folder included in Noria's task query scope. Register these projects on Home to make them available in the annotation editor; adjust the annotation project paths in `view.json` to match their location.
2. Open Task Timeline in the main area. Include `#noria-forum-demo`, show completed tasks, and select the task and annotation layers.
3. Use the dates, zoom levels, and time annotations in `view.json`. The scene contains 30 tasks and three time spans, centered on September 12, 2026. For an hourly view, apply `hourFilter` over `filter`; it centers the same tasks on September 8 at 14:00. Focus the bottom navigation and press `+` to halve the visible time span and display half-hour ticks.
4. Use the light theme and English interface. The reference capture uses a 1920 × 625 window, 115% zoom, and collapsed sidebars. Obsidian's status bar is omitted from the capture.

The resulting [wide screenshot](../../../docs/assets/en/task-timeline-wide.png) is a direct capture of the plugin view, 1869 × 579 pixels, using the local Timeline improvements after 0.4.5. The Markdown files are the task source; `view.json` describes the display settings and is not an importable vault configuration.

Every short title follows its circle at the task's start time; tasks beginning before the visible range stay at the left edge. Completion changes the circle color while titles remain equally readable. The three project phases occupy compact bands above the mixed tasks.

The bottom date row follows the main zoom level. Drag either the dates or the minimap to pan; the brighter miniature segments indicate the visible range. Hover or focus a task title to see its times, duration rail, and source note.

For Chinese captures, use the project names, task titles, and phase labels from `zh-CN.json` and select the Chinese interface. Keep the same dates, source paths, and task states so both languages show the same example. The [Chinese day view](../../../docs/assets/zh-CN/task-timeline-wide.png) and [hour view](../../../docs/assets/zh-CN/task-timeline-hours.png) are native captures of this localized scene.
