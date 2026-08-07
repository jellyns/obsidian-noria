(() => {
  const hideInlineTitle = () => {
    const root = this.container?.closest(".markdown-reading-view, .markdown-source-view.mod-cm6, .workspace-leaf-content");
    const t = root?.querySelector?.(".inline-title");
    if (t) t.style.display = "none";
  };
  hideInlineTitle();
  setTimeout(hideInlineTitle, 0);
  setTimeout(hideInlineTitle, 180);

  const styleId = "dashboard-compact-spacing";
  const runtimeBuildId = String(
    input?.noriaBridge?.runtimeBuildId ||
    globalThis.__noriaRuntimeBuildId ||
    globalThis.__noriaRuntimeBridge?.runtimeBuildId ||
    "dev"
  );
  let style = document.getElementById(styleId);
  const existingBuildId = String(
    style?.getAttribute?.("data-noria-runtime-build-id") ||
    style?.attrs?.["data-noria-runtime-build-id"] ||
    ""
  );
  const requiredStyleSentinel = "dashboard-countdown-hero-days-v2";
  if (
    style &&
    existingBuildId === runtimeBuildId &&
    String(style.textContent || "").includes("--dash-radius") &&
    String(style.textContent || "").includes(requiredStyleSentinel)
  ) return;
  const shouldAppendStyle = !style;
  if (!style) {
    style = document.createElement("style");
    style.id = styleId;
  }
  style.setAttribute?.("data-noria-runtime-build-id", runtimeBuildId);
  style.setAttr?.("data-noria-runtime-build-id", runtimeBuildId);
  style.textContent = `
    :root,
    body {
      --dash-radius: 12px;
      --dash-pill-radius: 999px;
      --dash-radius-card: 14px;
      --dash-section-x: 2px;
      /* 主页一级区块纵向节奏：头像、工作台、导引、趋势统计之间统一用这一处调整 */
      --dash-home-section-gap: 2px;
      --dash-workbench-gap: 12px;
      --dash-workbench-accent: color-mix(in srgb, var(--interactive-accent) 72%, rgb(14 165 233));
      --dash-hero-gap: 14px;
      --dash-hero-half-gap: 7px;
      /* 导引条目标题（待办 / Inbox / 项目任务行）：与 JS 内联统一走变量，避免各处 .86em/500 分叉 */
      --dash-text-row-size: 0.86em;
      --dash-text-row-line: 1.25;
      --dash-text-row-weight: 500;
      /* MOC 条目与习惯历史名称共享同一排版合同 */
      --dash-moc-entry-font-family: var(--font-interface);
      --dash-moc-entry-font-size: .84em;
      --dash-moc-entry-line-height: 1.25;
      --dash-moc-entry-font-weight: 650;
      --dash-moc-entry-letter-spacing: 0;
      --dash-moc-entry-color: color-mix(in srgb, var(--text-normal) 88%, var(--background-primary) 12%);
      /* 列表行悬停与圆角：待办 / Inbox / 项目任务行共用 */
      --dash-heading-text: color-mix(in srgb, var(--text-normal) 88%, var(--noria-module-home, var(--interactive-accent)) 12%);
      --dash-heading-accent: color-mix(in srgb, var(--interactive-accent) 76%, rgb(96 165 250));
      --dash-heading-divider: color-mix(in srgb, var(--background-modifier-border) 54%, var(--dash-heading-accent) 46%);
      --dash-title-color: var(--dash-heading-text);
      --dash-row-hover-bg: color-mix(in srgb, var(--background-primary) 91%, var(--noria-module-home, var(--interactive-accent)) 9%);
      --dash-surface: color-mix(in srgb, var(--background-primary) 99%, var(--background-secondary));
      --dash-surface-raised: color-mix(in srgb, var(--background-primary) 98%, var(--background-secondary));
      --dash-surface-muted: color-mix(in srgb, var(--background-primary) 99%, var(--background-secondary));
      --dash-surface-tinted: color-mix(in srgb, var(--background-primary) 97%, var(--background-secondary));
      --dash-widget-bg: var(--dash-surface);
      --dash-widget-panel: color-mix(in srgb, var(--background-primary) 98%, rgb(241 245 249));
      --dash-widget-panel-hover: color-mix(in srgb, var(--background-primary) 96%, rgb(226 232 240));
      --dash-widget-border: color-mix(in srgb, var(--background-modifier-border) 84%, rgba(148, 163, 184, 0.18));
      --dash-widget-accent: color-mix(in srgb, var(--interactive-accent) 72%, rgb(14 165 233));
      --dash-widget-accent-soft: color-mix(in srgb, var(--dash-widget-accent) 12%, transparent);
      --dash-widget-text: var(--text-normal);
      --dash-widget-muted: color-mix(in srgb, var(--text-muted) 92%, rgb(71 85 105));
      --dash-row-radius: 8px;
      --dash-row-y: 3px;
      --dash-row-x: 3px;
      --dash-row-gap: 7px;
      /* 图表色板（笔记趋势、双轴 SVG 等共用；先定义语义角色，再派生具体用途） */
      --dash-chart-series-bars: color-mix(in srgb, rgb(8 126 164) 88%, var(--text-normal) 12%);
      --dash-chart-series-line: color-mix(in srgb, rgb(79 70 229) 90%, var(--text-normal) 10%);
      --dash-chart-series-grid: color-mix(in srgb, var(--text-muted) 64%, var(--background-modifier-border) 36%);
      --dash-chart-series-left: var(--dash-chart-series-line);
      --dash-chart-series-right: color-mix(in srgb, var(--dash-chart-series-bars) 88%, var(--text-normal) 12%);
      --dash-chart-bar-fill: color-mix(in srgb, var(--dash-chart-series-bars) 82%, transparent);
      --dash-chart-bar-stroke: color-mix(in srgb, var(--dash-chart-series-bars) 72%, var(--text-normal));
      --dash-chart-line-stroke: var(--dash-chart-series-line);
      --dash-chart-line-marker-fill: var(--dash-surface, var(--background-primary));
      --dash-chart-line-marker-stroke: var(--dash-chart-series-line);
      --dash-chart-grid-stroke: var(--dash-chart-series-grid);
      --dash-chart-grid-opacity: 0.32;
      --dash-chart-axis-left: color-mix(in srgb, var(--dash-chart-series-left) 58%, transparent);
      --dash-chart-axis-right: color-mix(in srgb, var(--dash-chart-series-right) 58%, transparent);
      --dash-chart-tick-left: var(--dash-chart-series-left);
      --dash-chart-tick-right: var(--dash-chart-series-right);
      --dash-chart-tick-x: color-mix(in srgb, var(--text-muted) 86%, var(--dash-chart-series-grid) 14%);
      --dash-chart-area-stop-top: color-mix(in srgb, var(--dash-chart-series-line) 18%, transparent);
      --dash-chart-area-stop-mid: color-mix(in srgb, var(--dash-chart-series-line) 7%, transparent);
      --dash-chart-area-stop-bottom: color-mix(in srgb, var(--dash-chart-series-line) 0%, transparent);
      /* 日态分布：图例与堆叠条同一 key 同色（淡雅但色相可辨） */
      --dash-chart-weather-clear: #e8c47a;
      --dash-chart-weather-scorch: #f0b8a0;
      --dash-chart-weather-cloudy: #8eb8ea;
      --dash-chart-weather-overcast: #aeb6ce;
      --dash-chart-weather-rain: #7fa8df;
      --dash-chart-weather-wind: #8fd4c2;
      --dash-chart-weather-snow: #c0e4f2;
      --dash-chart-mood-great: #8fc9a0;
      --dash-chart-mood-stable: #9eb4e8;
      --dash-chart-mood-ok: #dfd19a;
      --dash-chart-mood-low: #e8b896;
      --dash-chart-mood-bad: #e0a0ad;
      /* 日态能量/专注条：空档与 6 档（对比强于上一版，仍偏 indigo 系） */
      --dash-chart-strip-empty-fill: color-mix(in srgb, var(--background-primary) 84%, rgb(226 232 240));
      --dash-chart-strip-empty-border: rgba(100, 116, 139, 0.36);
      --dash-chart-strip-fill-1: #e7ebfb;
      --dash-chart-strip-fill-2: #d2d9f5;
      --dash-chart-strip-fill-3: #b8c4ec;
      --dash-chart-strip-fill-4: #9aaee0;
      --dash-chart-strip-fill-5: #7f96d4;
      --dash-chart-strip-fill-6: #677fc4;
      --dash-chart-strip-border-1: #cfd5ee;
      --dash-chart-strip-border-2: #bcc5e6;
      --dash-chart-strip-border-3: #a5b1dc;
      --dash-chart-strip-border-4: #8e9cd0;
      --dash-chart-strip-border-5: #7a89c2;
      --dash-chart-strip-border-6: #6676b0;
      --dash-chart-strip-glow-rgb: 80, 96, 170;
      --dash-chart-strip-glow-max: 0.24;
      --dash-daily-energy-fill: #14b8a6;
      --dash-daily-energy-border: #0f9488;
      --dash-daily-energy-text: color-mix(in srgb, #0f9488 76%, var(--text-normal));
      --dash-daily-energy-level-1: #dff7ee;
      --dash-daily-energy-level-2: #c4f0df;
      --dash-daily-energy-level-3: #9ee4ca;
      --dash-daily-energy-level-4: #74d5b4;
      --dash-daily-energy-level-5: #42bd95;
      --dash-daily-energy-level-6: #14916c;
      --dash-daily-focus-text: color-mix(in srgb, #4f46e5 76%, var(--text-normal));
      --dash-daily-focus-level-1: #e7ebfb;
      --dash-daily-focus-level-2: #d2d9f5;
      --dash-daily-focus-level-3: #b8c4ec;
      --dash-daily-focus-level-4: #9aaee0;
      --dash-daily-focus-level-5: #7f96d4;
      --dash-daily-focus-level-6: #677fc4;
      /* Noria 原生年度热力图：默认统一青绿色阶 */
      --dash-heatmap-empty-fill: color-mix(in srgb, var(--background-primary) 82%, rgb(226 232 240));
      --dash-heatmap-empty-border: transparent;
      --dash-heatmap-label-color: var(--text-muted);
      --dash-heatmap-today-border: color-mix(in srgb, var(--interactive-accent) 72%, var(--text-normal));
      --dash-heatmap-hover-border: color-mix(in srgb, var(--interactive-accent) 55%, var(--background-modifier-border));
      --dash-heatmap-habit-level-1: #dff7ee;
      --dash-heatmap-habit-level-2: #c4f0df;
      --dash-heatmap-habit-level-3: #9ee4ca;
      --dash-heatmap-habit-level-4: #74d5b4;
      --dash-heatmap-habit-level-5: #42bd95;
      --dash-heatmap-habit-level-6: #14916c;
      --dash-heatmap-work-level-1: #dff7ee;
      --dash-heatmap-work-level-2: #c4f0df;
      --dash-heatmap-work-level-3: #9ee4ca;
      --dash-heatmap-work-level-4: #74d5b4;
      --dash-heatmap-work-level-5: #42bd95;
      --dash-heatmap-work-level-6: #14916c;
      --dash-stroke-soft: color-mix(in srgb, var(--background-modifier-border) 88%, rgba(148, 163, 184, 0.12));
      --dash-shadow-card: 0 1px 4px rgba(15, 23, 42, 0.035);
      --dash-shadow-card-hover: 0 2px 8px rgba(15, 23, 42, 0.055);
      --dash-focus-ring: 0 0 0 2px rgba(99,102,241,.28);
      --dash-motion-fast: .16s ease;
      --dash-progress-track: rgba(148,163,184,.24);
      --dash-progress-fill: linear-gradient(90deg, rgba(34,197,94,.86), rgba(6,182,212,.9));
      --dash-shadow-btn: 0 1px 1px rgba(15,23,42,.055);
      --dash-shadow-inset-soft: none;
      --dash-shadow-progress: 0 0 0 1px rgba(255,255,255,.28) inset, 0 0 10px rgba(6,182,212,.25);
      --dash-compact-segment-height: 26px;
      --dash-compact-segment-radius: 8px;
      --dash-compact-segment-font-size: 12px;
      --dash-compact-segment-weight: 650;
      --dash-compact-segment-active-weight: 720;
      --dash-compact-segment-active-bg: color-mix(in srgb, var(--interactive-accent) 14%, var(--background-primary));
      --dash-compact-segment-hover-bg: color-mix(in srgb, var(--background-primary) 88%, rgba(59,130,246,.1));
      --dash-panel-segment-height: 28px;
      --dash-panel-segment-radius: 8px;
      --dash-panel-segment-font-size: 13px;
      --dash-panel-segment-weight: 650;
      --dash-panel-segment-active-weight: 720;
      --dash-panel-segment-active-bg: var(--dash-compact-segment-active-bg);
      --dash-panel-segment-hover-bg: var(--dash-compact-segment-hover-bg);
    }
    .theme-dark {
      --dash-heading-text: color-mix(in srgb, var(--text-normal) 92%, var(--noria-module-home, var(--interactive-accent)) 8%);
      --dash-heading-accent: color-mix(in srgb, var(--interactive-accent) 72%, rgb(147 197 253));
      --dash-heading-divider: color-mix(in srgb, var(--background-modifier-border) 46%, var(--dash-heading-accent) 54%);
      --dash-title-color: var(--dash-heading-text);
      --dash-row-hover-bg: color-mix(in srgb, var(--background-primary) 86%, var(--noria-module-home, var(--interactive-accent)) 14%);
      --dash-surface: color-mix(in srgb, var(--background-primary) 92%, var(--background-secondary));
      --dash-surface-raised: color-mix(in srgb, var(--background-primary) 93%, rgb(30 41 59));
      --dash-surface-muted: color-mix(in srgb, var(--background-primary) 95%, rgb(30 41 59));
      --dash-surface-tinted: color-mix(in srgb, var(--background-primary) 91%, rgb(30 41 59));
      --dash-widget-bg: var(--dash-surface);
      --dash-widget-panel: color-mix(in srgb, var(--background-primary) 88%, rgb(30 41 59));
      --dash-widget-panel-hover: color-mix(in srgb, var(--background-primary) 82%, rgb(51 65 85));
      --dash-widget-border: color-mix(in srgb, var(--background-modifier-border) 72%, rgba(148, 163, 184, 0.24));
      --dash-widget-accent: color-mix(in srgb, var(--interactive-accent) 68%, rgb(125 211 252));
      --dash-widget-accent-soft: color-mix(in srgb, var(--dash-widget-accent) 18%, transparent);
      --dash-widget-text: color-mix(in srgb, var(--text-normal) 96%, rgb(226 232 240));
      --dash-widget-muted: color-mix(in srgb, var(--text-muted) 88%, rgb(148 163 184));
      --dash-chart-series-bars: color-mix(in srgb, rgb(56 189 248) 82%, var(--text-normal) 18%);
      --dash-chart-series-line: color-mix(in srgb, rgb(165 180 252) 86%, var(--text-normal) 14%);
      --dash-chart-series-grid: color-mix(in srgb, var(--text-muted) 54%, var(--background-modifier-border) 46%);
      --dash-chart-series-left: var(--dash-chart-series-line);
      --dash-chart-series-right: color-mix(in srgb, var(--dash-chart-series-bars) 88%, var(--text-normal) 12%);
      --dash-chart-weather-clear: #d4b070;
      --dash-chart-weather-scorch: #d9a08c;
      --dash-chart-weather-cloudy: #7aa3d9;
      --dash-chart-weather-overcast: #949db8;
      --dash-chart-weather-rain: #6b94d0;
      --dash-chart-weather-wind: #7bc4ae;
      --dash-chart-weather-snow: #a8d4e8;
      --dash-chart-mood-great: #7ab88c;
      --dash-chart-mood-stable: #8aa3dc;
      --dash-chart-mood-ok: #c9bc86;
      --dash-chart-mood-low: #d4a682;
      --dash-chart-mood-bad: #cc8f9c;
      --dash-chart-strip-empty-fill: color-mix(in srgb, var(--background-primary) 72%, rgb(51 65 85));
      --dash-chart-strip-empty-border: rgba(148, 163, 184, 0.45);
      --dash-chart-strip-fill-1: #2a3150;
      --dash-chart-strip-fill-2: #343c5e;
      --dash-chart-strip-fill-3: #3f4a72;
      --dash-chart-strip-fill-4: #4d5a86;
      --dash-chart-strip-fill-5: #5c6a9a;
      --dash-chart-strip-fill-6: #6d7cae;
      --dash-chart-strip-border-1: #3d4666;
      --dash-chart-strip-border-2: #4a5578;
      --dash-chart-strip-border-3: #57638a;
      --dash-chart-strip-border-4: #65719c;
      --dash-chart-strip-border-5: #7480ae;
      --dash-chart-strip-border-6: #8490c0;
      --dash-chart-strip-glow-rgb: 129, 140, 200;
      --dash-chart-strip-glow-max: 0.35;
      --dash-daily-energy-fill: #2dd4bf;
      --dash-daily-energy-border: #5eead4;
      --dash-daily-energy-text: color-mix(in srgb, #5eead4 72%, var(--text-normal));
      --dash-daily-energy-level-1: #173a35;
      --dash-daily-energy-level-2: #1d4a42;
      --dash-daily-energy-level-3: #246454;
      --dash-daily-energy-level-4: #2e7f66;
      --dash-daily-energy-level-5: #3ca17e;
      --dash-daily-energy-level-6: #58c39a;
      --dash-daily-focus-text: color-mix(in srgb, #a5b4fc 78%, var(--text-normal));
      --dash-daily-focus-level-1: #2a3150;
      --dash-daily-focus-level-2: #343c5e;
      --dash-daily-focus-level-3: #3f4a72;
      --dash-daily-focus-level-4: #4d5a86;
      --dash-daily-focus-level-5: #5c6a9a;
      --dash-daily-focus-level-6: #6d7cae;
      --dash-heatmap-empty-fill: color-mix(in srgb, var(--background-primary) 70%, rgb(51 65 85));
      --dash-heatmap-empty-border: transparent;
      --dash-heatmap-label-color: color-mix(in srgb, var(--text-muted) 90%, rgb(148 163 184));
      --dash-heatmap-today-border: color-mix(in srgb, var(--interactive-accent) 78%, white);
      --dash-heatmap-hover-border: color-mix(in srgb, var(--interactive-accent) 62%, var(--background-modifier-border));
      --dash-heatmap-habit-level-1: #173a35;
      --dash-heatmap-habit-level-2: #1d4a42;
      --dash-heatmap-habit-level-3: #246454;
      --dash-heatmap-habit-level-4: #2e7f66;
      --dash-heatmap-habit-level-5: #3ca17e;
      --dash-heatmap-habit-level-6: #58c39a;
      --dash-heatmap-work-level-1: #173a35;
      --dash-heatmap-work-level-2: #1d4a42;
      --dash-heatmap-work-level-3: #246454;
      --dash-heatmap-work-level-4: #2e7f66;
      --dash-heatmap-work-level-5: #3ca17e;
      --dash-heatmap-work-level-6: #58c39a;
    }
    .dashboard-home-root button:focus-visible,
    .dashboard-home-root [role="button"]:focus-visible,
    .dashboard-home-root a.internal-link:focus-visible,
    .dashboard-home-root summary:focus-visible,
    .dashboard-home-root input:focus-visible,
    .dashboard-home-root textarea:focus-visible {
      outline: none ;
      box-shadow: var(--dash-focus-ring) ;
    }
    /* 主页根：三大块纵向节律；与编辑器背景融合见下方 @supports */
    .dashboard-home-root {
      display: grid;
      grid-template-columns: repeat(12, minmax(0, 1fr));
      gap: var(--dash-home-section-gap);
      margin: 4px 0 12px 0;
      align-items: stretch;
      container-type: inline-size;
      container-name: noria-home;
    }
    .dashboard-home-root > .dashboard-hero-strip,
    .dashboard-home-root > .callout.dashboard-callout-section-wrap {
      grid-column: 1 / -1;
      min-width: 0;
    }
    .dashboard-home-root > [data-noria-widget-span="1"] { grid-column: span 1; }
    .dashboard-home-root > [data-noria-widget-span="2"] { grid-column: span 2; }
    .dashboard-home-root > [data-noria-widget-span="3"] { grid-column: span 3; }
    .dashboard-home-root > [data-noria-widget-span="4"] { grid-column: span 4; }
    .dashboard-home-root > [data-noria-widget-span="5"] { grid-column: span 5; }
    .dashboard-home-root > [data-noria-widget-span="6"] { grid-column: span 6; }
    .dashboard-home-root > [data-noria-widget-span="7"] { grid-column: span 7; }
    .dashboard-home-root > [data-noria-widget-span="8"] { grid-column: span 8; }
    .dashboard-home-root > [data-noria-widget-span="9"] { grid-column: span 9; }
    .dashboard-home-root > [data-noria-widget-span="10"] { grid-column: span 10; }
    .dashboard-home-root > [data-noria-widget-span="11"] { grid-column: span 11; }
    .dashboard-home-root > [data-noria-widget-span="12"] { grid-column: span 12; }
    @media (max-width: 900px) {
      .dashboard-home-root > [data-noria-widget-span] {
        grid-column: 1 / -1 ;
      }
    }
    @container noria-home (max-width: 900px) {
      .dashboard-home-root > [data-noria-widget-span] {
        grid-column: 1 / -1 ;
      }
    }
    .dashboard-home-root > .callout[data-callout="info"] {
      margin: 0 ;
      border: none ;
      box-shadow: none ;
      transition: box-shadow var(--dash-motion-fast), border-color var(--dash-motion-fast);
    }
    .theme-dark .dashboard-home-root > .callout[data-callout="info"] {
      box-shadow: none ;
    }
    /*
     * 分区单层托盘：与「整块白底」拉开差距需叠入可见的 slate / 蓝紫（仅靠 94% primary 混蓝在纯白主题上仍像白板）。
     * 内层卡片用 .dashboard-guide-card 提亮，形成托盘承托、卡片浮起的层次（仍只有一层分区底，无内容区第二张大底）。
     */
    .dashboard-home-root > .callout.dashboard-callout-section-wrap {
      margin: 0 ;
      padding: var(--dash-home-section-gap) var(--dash-section-x) ;
      border: none ;
      border-radius: var(--dash-radius) ;
      background: transparent ;
      box-shadow: none ;
      overflow: hidden ;
    }
    .dashboard-home-root > .callout.dashboard-callout-section-wrap:not(.dashboard-callout-notitle) {
      padding-top: var(--dash-home-section-gap) ;
      padding-bottom: var(--dash-home-section-gap) ;
    }
    .theme-dark .dashboard-home-root > .callout.dashboard-callout-section-wrap {
      background: transparent ;
      border-color: transparent ;
      box-shadow: none ;
    }
    /* 主页卡片使用纯色 surface，避免装饰渐变抢占信息层级。 */
    .dashboard-home-root .dashboard-guide-card {
      background: color-mix(in srgb, var(--dash-surface) 88%, transparent) ;
      border: 1px solid color-mix(in srgb, var(--background-modifier-border) 58%, transparent) ;
      box-shadow: none ;
      transition: box-shadow var(--dash-motion-fast), border-color var(--dash-motion-fast);
    }
    .dashboard-home-root .dashboard-guide-card:hover,
    .dashboard-home-root .dashboard-guide-card:focus-within {
      border-color: color-mix(in srgb, var(--background-modifier-border) 62%, var(--dash-workbench-accent) 18%) ;
    }
    .dashboard-home-root .dashboard-guide-card__head {
      gap: 8px ;
      min-height: 28px ;
      margin-bottom: 9px ;
    }
    .dashboard-home-root .dashboard-guide-card__title {
      display: inline-flex ;
      align-items: center ;
      gap: 7px;
      min-width: 0;
      color: var(--dash-heading-text, var(--text-normal));
      font-weight: 800;
      font-size: 1em;
      letter-spacing: 0;
      line-height: 1.2;
    }
    .dashboard-home-root .dashboard-guide-card__title-dot {
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--dash-workbench-accent) 68%, var(--text-muted) 32%);
      flex: 0 0 auto;
      opacity: .72;
    }
    .dashboard-home-root .dashboard-guide-card__title-text {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .dashboard-home-root .dashboard-guide-card__tools {
      gap: 3px ;
      min-width: 0;
      justify-content: flex-end;
    }
    .dashboard-home-root .dashboard-guide-card__body {
    }
    .dashboard-home-root .dashboard-guide-card button.dashboard-guide-icon-btn {
      width: 28px ;
      height: 28px ;
      border-color: transparent ;
      background: transparent ;
      color: color-mix(in srgb, var(--dash-workbench-accent) 62%, var(--text-muted)) ;
      box-shadow: none ;
    }
    .dashboard-home-root .dashboard-guide-card button.dashboard-guide-icon-btn:hover:not(:disabled) {
      background: color-mix(in srgb, var(--dash-workbench-accent) 10%, transparent) ;
      border-color: color-mix(in srgb, var(--dash-workbench-accent) 22%, transparent) ;
      box-shadow: none ;
    }
    .dashboard-home-root .dashboard-guide-card button.dashboard-guide-icon-btn:focus-visible {
      box-shadow: var(--dash-focus-ring) ;
    }
    .dashboard-home-root .dashboard-guide-card button.dashboard-guide-icon-btn[data-noria-action-state="pending"] {
      opacity: .72;
      box-shadow: none ;
    }
    .dashboard-home-root .dashboard-guide-card button.dashboard-guide-icon-btn[data-noria-action-state="failed"] {
      color: color-mix(in srgb, var(--text-error) 72%, var(--text-muted)) ;
      background: color-mix(in srgb, var(--text-error) 8%, transparent) ;
      box-shadow: none ;
    }
    .dashboard-home-root .dashboard-guide-card button.dashboard-guide-icon-btn--governance {
      border-left: 0 ;
      border-color: transparent ;
      background: transparent ;
      color: color-mix(in srgb, rgb(217 119 6) 56%, var(--text-muted)) ;
      box-shadow: none ;
    }
    .dashboard-home-root .dashboard-guide-card button.dashboard-guide-icon-btn--governance:hover:not(:disabled) {
      border-color: color-mix(in srgb, rgb(217 119 6) 24%, transparent) ;
      background: color-mix(in srgb, rgb(217 119 6) 10%, transparent) ;
      box-shadow: none ;
    }
    .dashboard-tray-resize-handle {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      width: auto;
      height: 12px;
      border: 0;
      border-radius: 0 0 12px 12px;
      background: transparent;
      cursor: ns-resize;
      opacity: 0;
      z-index: 4;
      transition: opacity .12s ease;
      user-select: none;
      touch-action: none;
    }
    .dashboard-home-root .dashboard-guide-card:hover .dashboard-tray-resize-handle,
    .dashboard-home-root .dashboard-guide-card:focus-within .dashboard-tray-resize-handle,
    .dashboard-home-root .dashboard-moc-host:hover .dashboard-tray-resize-handle,
    .dashboard-home-root .dashboard-moc-host:focus-within .dashboard-tray-resize-handle {
      opacity: .01; /* 维持可交互命中，视觉上近乎不可见 */
    }
    /* MOC：嵌入导引区，无第二张「白卡」外框；chip 自身仍有 pill 层次 */
    .dashboard-home-root .dashboard-moc-host {
      background: transparent ;
      border: none ;
      box-shadow: none ;
      border-radius: 0 ;
    }
    .theme-dark .dashboard-home-root .dashboard-guide-card {
      background: var(--dash-surface) ;
      border-color: color-mix(in srgb, var(--background-modifier-border) 42%, transparent) ;
      box-shadow: none ;
    }
    .dashboard-home-root .dashboard-workbench-container {
      container-type: inline-size;
      container-name: noria-home-workbench;
      min-width: 0;
    }
    .dashboard-home-root .dashboard-workbench-grid {
      gap: var(--dash-workbench-gap) ;
      align-items: stretch ;
    }
    @container noria-home-workbench (max-width: 980px) {
      .dashboard-home-root .dashboard-workbench-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr)) ;
      }
      .dashboard-home-root .dashboard-workbench-panel[data-noria-overview-panel-group="right"] {
        grid-column: 1 / -1;
      }
    }
    @container noria-home-workbench (max-width: 640px) {
      .dashboard-home-root .dashboard-workbench-grid {
        grid-template-columns: minmax(0, 1fr) ;
      }
      .dashboard-home-root .dashboard-workbench-panel[data-noria-overview-panel-group="right"] {
        grid-column: auto;
      }
    }
    .dashboard-home-root .dashboard-workbench-panel {
      padding: 12px 13px 13px ;
      border-radius: 12px ;
      background: color-mix(in srgb, var(--dash-surface) 88%, transparent) ;
      border: 1px solid color-mix(in srgb, var(--background-modifier-border) 58%, transparent) ;
      box-shadow: none ;
    }
    .dashboard-home-root .dashboard-workbench-panel:hover,
    .dashboard-home-root .dashboard-workbench-panel:focus-within {
      border-color: color-mix(in srgb, var(--background-modifier-border) 62%, var(--dash-workbench-accent) 18%) ;
    }
    .theme-dark .dashboard-home-root .dashboard-workbench-panel {
      background: color-mix(in srgb, var(--dash-surface) 94%, var(--background-primary) 6%) ;
      border-color: color-mix(in srgb, var(--background-modifier-border) 32%, transparent) ;
    }
    .theme-dark .dashboard-home-root .dashboard-workbench-panel:hover,
    .theme-dark .dashboard-home-root .dashboard-workbench-panel:focus-within {
      border-color: color-mix(in srgb, var(--background-modifier-border) 38%, var(--dash-workbench-accent) 16%) ;
    }
    .dashboard-home-root .dashboard-workbench-panel__head {
      margin-bottom: 9px ;
      min-height: 28px ;
      gap: 8px ;
    }
    .dashboard-home-root .dashboard-workbench-panel__title {
      display: inline-flex ;
      align-items: center ;
      gap: 7px;
      min-width: 0;
      color: var(--dash-heading-text) ;
      font-size: .98em ;
      font-weight: 780 ;
      letter-spacing: 0 ;
      line-height: 1.25 ;
    }
    .dashboard-home-root .dashboard-workbench-panel__title::before {
      content: "";
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--dash-workbench-accent) 72%, var(--text-muted) 28%);
      flex: 0 0 auto;
      opacity: .72;
    }
    .dashboard-home-root .dashboard-workbench-panel__tools {
      gap: 3px ;
      min-width: 0;
      justify-content: flex-end;
    }
    @container noria-home (max-width: 340px) {
      .dashboard-home-root .dashboard-workbench-panel__head {
        flex-wrap: wrap ;
        align-items: flex-start ;
        row-gap: 4px ;
      }
      .dashboard-home-root .dashboard-workbench-panel__title {
        flex: 1 0 100%;
        white-space: nowrap ;
        word-break: keep-all;
      }
      .dashboard-home-root .dashboard-workbench-panel__tools {
        flex: 0 1 100% ;
        margin-left: auto ;
        justify-content: flex-end ;
      }
    }
    .dashboard-home-root .dashboard-workbench-panel button.dashboard-guide-icon-btn {
      width: 28px ;
      height: 28px ;
      border-color: transparent ;
      background: transparent ;
      color: color-mix(in srgb, var(--dash-workbench-accent) 62%, var(--text-muted)) ;
      box-shadow: none ;
    }
    .dashboard-home-root .dashboard-workbench-panel button.dashboard-guide-icon-btn:hover:not(:disabled) {
      background: color-mix(in srgb, var(--dash-workbench-accent) 10%, transparent) ;
      border-color: color-mix(in srgb, var(--dash-workbench-accent) 22%, transparent) ;
      box-shadow: none ;
    }
    .dashboard-home-root .dashboard-workbench-panel button.dashboard-guide-icon-btn:focus-visible {
      box-shadow: var(--dash-focus-ring) ;
    }
    .dashboard-home-root .dashboard-workbench-panel button.dashboard-guide-icon-btn[data-noria-action-state="pending"] {
      opacity: .68;
      box-shadow: none ;
    }
    .dashboard-home-root .dashboard-workbench-panel button.dashboard-guide-icon-btn[data-noria-action-state="failed"] {
      color: color-mix(in srgb, var(--text-error) 72%, var(--text-muted)) ;
      background: color-mix(in srgb, var(--text-error) 8%, transparent) ;
      box-shadow: none ;
    }
    .dashboard-home-root .dashboard-workbench-panel__body {
    }
    .dashboard-home-root .dashboard-workbench-panel__body,
    .dashboard-home-root .dashboard-workbench-panel__body * {
    }
    .dashboard-home-root .dashboard-overview-habit-context .dashboard-habit-21-grid {
      display: none ;
    }
    .dashboard-home-root .dashboard-overview-habit-context .dashboard-habit-21-shell > button.dashboard-guide-icon-btn {
      display: none ;
    }
    .dashboard-home-root .dashboard-overview-habit-context .dashboard-habit-today-strip {
      border-bottom: 0 ;
      padding-bottom: 0 ;
      margin-bottom: 0 ;
    }
    .dashboard-home-root .dashboard-overview-habit-context .dashboard-habit-today-title {
      font-size: 12px;
    }
    .dashboard-home-root .dashboard-overview-habit-context .dashboard-habit-today-chip {
      font-size: 12px;
    }
    .dashboard-home-root .dashboard-home-trends-habit-history .dashboard-habit-today-strip {
      display: none ;
    }
    .dashboard-home-root .dashboard-home-trends-habit-history .dashboard-habit-21-shell {
      --habit-name-col: clamp(96px, 13%, 126px);
      --habit-grid-line: color-mix(in srgb, var(--text-muted) 14%, transparent);
    }
    .dashboard-home-root .dashboard-home-trends-habit-history .dashboard-habit-21-name.dashboard-habit-21-cell {
      align-items: center;
      padding-top: 0;
      padding-right: 10px;
    }
    .dashboard-home-root .dashboard-home-trends-habit-history .dashboard-habit-21-name-wrap {
      align-items: center;
      height: 100%;
    }
    .dashboard-home-root .dashboard-home-trends-habit-history .dashboard-habit-21-name .dashboard-task-title {
      color: var(--dash-moc-entry-color);
      font-family: var(--dash-moc-entry-font-family);
      font-size: var(--dash-moc-entry-font-size);
      line-height: var(--dash-moc-entry-line-height);
      font-weight: var(--dash-moc-entry-font-weight);
      letter-spacing: var(--dash-moc-entry-letter-spacing);
    }
    .dashboard-home-root > .callout.dashboard-callout-section-wrap > .callout-content {
      padding: 0 ;
      margin: 0 ;
      background: transparent ;
      border: none ;
      border-radius: 0 ;
      box-shadow: none ;
    }
    .dashboard-home-root > .callout.dashboard-callout-section-wrap > .callout-title {
      position: relative ;
      display: flex ;
      align-items: center ;
      gap: 7px ;
      background: transparent ;
      border: none ;
      border-radius: 0 ;
      padding: 2px 2px 10px 14px ;
      margin: 3px 0 8px 0 ;
      box-shadow: none ;
    }
    .dashboard-home-root > .callout.dashboard-callout-section-wrap > .callout-title::before {
      content: "" ;
      position: absolute ;
      left: 0 ;
      top: 2px ;
      bottom: 10px ;
      width: 5px ;
      border-radius: 6px ;
      background: var(--dash-heading-accent) ;
    }
    .dashboard-home-root > .callout.dashboard-callout-section-wrap > .callout-title::after {
      content: "" ;
      position: absolute ;
      left: 14px ;
      bottom: 2px ;
      width: 25% ;
      min-width: 150px ;
      max-width: calc(100% - 14px) ;
      border-bottom: 2px dashed var(--dash-heading-divider) ;
      pointer-events: none ;
    }
    .theme-dark .dashboard-home-root > .callout.dashboard-callout-section-wrap > .callout-title::before {
      width: 3px ;
      opacity: .52;
      background: color-mix(in srgb, var(--dash-heading-accent) 54%, var(--background-primary)) ;
    }
    .theme-dark .dashboard-home-root > .callout.dashboard-callout-section-wrap > .callout-title::after {
      border-bottom: 1px solid color-mix(in srgb, var(--dash-heading-divider) 38%, transparent) ;
      opacity: .7;
    }
    .dashboard-home-root > .callout.dashboard-callout-section-wrap > .callout-title .callout-title-inner {
      font-weight: 800 ;
      letter-spacing: 0.01em ;
      font-size: 1.02em ;
      color: var(--dash-heading-text) ;
      flex: 0 0 auto ;
      min-width: 0 ;
    }
    .dashboard-home-root > .callout.dashboard-callout-section-wrap > .callout-title .dashboard-home-widget-title-actions {
      margin-left: auto ;
      display: flex ;
      align-items: center ;
      justify-content: flex-end ;
      gap: 6px ;
      min-width: 0 ;
      max-width: min(100%, 760px) ;
      position: relative ;
      z-index: 1 ;
    }
    .dashboard-home-root > .callout.dashboard-callout-section-wrap > .callout-title .callout-icon {
      display: none ;
    }
    .dashboard-home-root > .callout.dashboard-callout-section-wrap.dashboard-callout-notitle > .callout-title {
      display: none ;
      margin: 0 ;
      padding: 0 ;
      border: none ;
    }
    @supports (background: color-mix(in srgb, white, black)) {
      .dashboard-home-root .callout[data-callout="info"] > .callout-content {
        background: var(--dash-surface) ;
      }
      .dashboard-home-root > .callout.dashboard-callout-section-wrap > .callout-content {
        background: transparent ;
      }
    }
    /* 仅主页 .dashboard-home-root 内美化 callout，避免污染全库普通笔记（应遵循 Minimal / Obsidian 默认） */
    .dashboard-home-root .callout[data-callout="info"],
    .dashboard-home-root .callout[data-callout="abstract"],
    .dashboard-home-root .callout[data-callout="success"] {
      margin: 6px 0 ;
      border-radius: var(--dash-radius) ;
      overflow: hidden;
    }
    .dashboard-home-root .callout[data-callout="info"] .callout-content,
    .dashboard-home-root .callout[data-callout="abstract"] .callout-content,
    .dashboard-home-root .callout[data-callout="success"] .callout-content { padding-top: 4px ; padding-bottom: 6px ; }
    .dashboard-home-root .callout.dashboard-callout-notitle > .callout-content {
      padding-top: 8px ;
      border-radius: var(--dash-radius) ;
    }
    .dashboard-home-root .callout .callout {
      margin: 4px 0 ;
      border-radius: var(--dash-radius) ;
      overflow: hidden;
    }
    .dashboard-home-root .callout .callout-content > * { margin-top: 4px ; margin-bottom: 4px ; }
    .dashboard-home-root .callout[data-callout="abstract"] > .callout-title {
      background: var(--dash-surface-muted) ;
      border-bottom: 1px solid color-mix(in srgb, var(--background-modifier-border) 88%, rgba(148,163,184,.12)) ;
      border-radius: var(--dash-radius) var(--dash-radius) 0 0 ;
      padding-top: 6px ;
      padding-bottom: 6px ;
    }
    .dashboard-home-root .callout[data-callout="abstract"] > .callout-title .callout-icon { color: rgba(67,56,202,.86) ; }
    .dashboard-home-root .callout[data-callout="abstract"] > .callout-title .callout-title-inner {
      font-weight: 700 ; letter-spacing: .12px; color: rgba(49,46,129,.95) ;
    }
    .dashboard-home-root .callout[data-callout="abstract"] > .callout-content {
      background: var(--dash-surface);
      border-radius: 0 0 var(--dash-radius) var(--dash-radius);
    }
    .dashboard-home-root .callout[data-callout="success"] > .callout-title {
      background: var(--dash-surface-muted) ;
      border-bottom: 1px solid color-mix(in srgb, var(--background-modifier-border) 88%, rgba(148,163,184,.12)) ;
      border-radius: var(--dash-radius) var(--dash-radius) 0 0 ;
      padding-top: 6px ;
      padding-bottom: 6px ;
    }
    .dashboard-home-root .callout[data-callout="success"] > .callout-title .callout-icon { color: rgba(22,163,74,.86) ; }
    .dashboard-home-root .callout[data-callout="success"] > .callout-title .callout-title-inner {
      font-weight: 700 ; letter-spacing: .12px; color: rgba(21,128,61,.95) ;
    }
    .dashboard-home-root .callout[data-callout="success"] > .callout-content {
      background: var(--dash-surface);
      border-radius: 0 0 var(--dash-radius) var(--dash-radius);
    }
    .dashboard-home-root .callout[data-callout="info"]:not(.dashboard-callout-section-wrap) > .callout-title {
      background: transparent ;
      border-bottom: none ;
      border-radius: 0 ;
      padding-top: 0 ;
      padding-bottom: 4px ;
    }
    .dashboard-home-root .callout[data-callout="info"]:not(.dashboard-callout-section-wrap) > .callout-title .callout-icon { color: rgba(37,99,235,.86) ; }
    .dashboard-home-root .callout[data-callout="info"]:not(.dashboard-callout-section-wrap) > .callout-title .callout-title-inner {
      font-weight: 800 ; letter-spacing: .02em; color: var(--dash-title-color) ; font-size: 1.02em ;
    }
    .dashboard-home-root .callout[data-callout="info"]:not(.dashboard-callout-section-wrap) > .callout-content {
      background: var(--dash-surface);
      border-radius: 0 0 var(--dash-radius) var(--dash-radius);
    }
    .dashboard-home-root .dashboard-home-widget-shell {
      --dash-widget-accent: color-mix(in srgb, var(--interactive-accent) 72%, rgb(14 165 233));
      --dash-widget-accent-soft: color-mix(in srgb, var(--dash-widget-accent) 12%, transparent);
      color: var(--dash-widget-text);
      position: relative;
    }
    .theme-dark .dashboard-home-root .dashboard-home-widget-shell {
      --dash-widget-accent: color-mix(in srgb, var(--interactive-accent) 68%, rgb(125 211 252));
      --dash-widget-accent-soft: color-mix(in srgb, var(--dash-widget-accent) 18%, transparent);
    }
    .dashboard-home-root .dashboard-home-widget-shell[data-noria-widget-type="action"] {
      --dash-widget-accent: rgb(20 184 166);
    }
    .dashboard-home-root .dashboard-home-widget-shell[data-noria-widget-id="today-actions"] {
      --dash-widget-accent: rgb(20 184 166);
      --dash-widget-accent-soft: color-mix(in srgb, var(--dash-widget-accent) 10%, transparent);
    }
    .dashboard-home-root .dashboard-home-widget-shell[data-noria-widget-id="focus-strip"] {
      --dash-widget-accent: rgb(59 130 246);
      --dash-widget-accent-soft: color-mix(in srgb, var(--dash-widget-accent) 9%, transparent);
    }
    .dashboard-home-root .dashboard-home-widget-shell[data-noria-widget-type="stat"] {
      --dash-widget-accent: rgb(99 102 241);
    }
    .dashboard-home-root .dashboard-home-widget-shell[data-noria-widget-type="base"],
    .dashboard-home-root .dashboard-home-widget-shell[data-noria-widget-type="list"] {
      --dash-widget-accent: rgb(14 165 233);
    }
    .dashboard-home-root .dashboard-home-widget-shell[data-noria-widget-type="markdown"] {
      --dash-widget-accent: rgb(139 92 246);
    }
    .dashboard-home-root .dashboard-home-widget-shell:not(.dashboard-callout-notitle) > .callout-title::before {
      background: var(--dash-widget-accent) ;
    }
    .dashboard-home-root .dashboard-home-widget-shell > .callout-content {
      color: var(--dash-widget-text);
    }
    .dashboard-home-root .dashboard-home-widget-shell-native {
      min-width: 0;
      width: 100%;
      container-type: inline-size;
      container-name: noria-home-widget;
      padding: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
    }
    .dashboard-home-root .dashboard-home-widget-native-content {
      width: 100%;
      min-width: 0;
    }
    .dashboard-home-root > .dashboard-home-widget-shell-native:not([data-noria-widget-collapsed="true"]) {
      align-self: stretch;
      display: flex;
      flex-direction: column;
    }
    .dashboard-home-root > .dashboard-home-widget-shell-native:not([data-noria-widget-collapsed="true"]) > .dashboard-home-widget-native-content {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    .dashboard-home-root > .dashboard-home-widget-shell-native:not([data-noria-widget-collapsed="true"]) > .dashboard-home-widget-native-content > :first-child {
      flex: 1 1 auto;
      min-height: 0;
    }
    .dashboard-home-root .dashboard-home-widget-native-title-actions {
      display: flex;
      align-items: center;
      min-width: 0;
    }
    .dashboard-home-root .dashboard-home-widget-shell-native > .dashboard-home-widget-shell-actions--overlay {
      left: auto;
      right: 8px;
    }
    .dashboard-workbench-grid.dashboard-workbench-grid--card {
      grid-template-columns: minmax(0, 1fr) ;
    }
    .dashboard-home-root .dashboard-home-widget-shell[data-noria-widget-collapsed="true"] {
      min-height: 0;
      opacity: .78;
    }
    .dashboard-home-root .dashboard-home-widget-shell[data-noria-widget-collapsed="true"] > .callout-title {
      border-bottom: 0 ;
    }
    .dashboard-home-root .dashboard-home-widget-shell[data-noria-widget-collapsed="true"] > .callout-content {
      display: none ;
    }
    .dashboard-home-widget-collapsed-label {
      display: inline-flex;
      align-items: center;
      min-width: 0;
      color: var(--dash-widget-muted);
      font-size: .78em;
      font-weight: 650;
      line-height: 1.2;
      white-space: nowrap;
    }
    .dashboard-home-widget-shell-actions {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      opacity: 0;
      pointer-events: none;
      transition: opacity var(--dash-motion-fast);
    }
    .dashboard-home-widget-shell-actions--overlay {
      position: absolute;
      top: 0;
      right: 8px;
      left: auto;
      z-index: 8;
      transform: translateY(calc(-100% - 4px));
      padding: 2px;
      border: 1px solid color-mix(in srgb, var(--background-modifier-border) 58%, transparent);
      border-radius: 6px;
      background: color-mix(in srgb, var(--background-primary) 92%, transparent);
      box-shadow: 0 1px 4px color-mix(in srgb, var(--background-modifier-box-shadow) 18%, transparent);
    }
    .dashboard-home-widget-shell:hover .dashboard-home-widget-shell-actions,
    .dashboard-home-widget-shell:focus-within .dashboard-home-widget-shell-actions {
      opacity: 1;
      pointer-events: auto;
    }
    .dashboard-home-widget-shell[data-noria-widget-collapsed="true"] .dashboard-home-widget-shell-actions {
      opacity: .72;
      pointer-events: auto;
    }
    .dashboard-home-widget-shell-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      min-width: 24px;
      height: 24px;
      min-height: 24px;
      margin: 0;
      padding: 0;
      border: 0;
      border-radius: 5px;
      background: transparent;
      box-shadow: none;
      color: var(--dash-widget-muted);
    }
    .dashboard-home-widget-shell-action:hover,
    .dashboard-home-widget-shell-action:focus-visible {
      background: color-mix(in srgb, var(--dash-widget-accent) 9%, transparent);
      color: var(--dash-widget-text);
      outline: none;
    }
    .dashboard-home-widget-shell-action:focus-visible {
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--dash-widget-accent) 34%, transparent);
    }
    .dashboard-home-widget-shell-action:disabled {
      opacity: .48;
      cursor: wait;
    }
    .dashboard-home-root[data-noria-home-edit-mode="true"] .dashboard-home-widget-shell {
      margin-top: 30px;
      outline: 1px solid color-mix(in srgb, var(--dash-widget-accent) 20%, transparent);
      outline-offset: -1px;
      background: color-mix(in srgb, var(--dash-widget-panel) 96%, var(--dash-widget-accent-soft));
    }
    [data-noria-home-edit-mode="true"] .dashboard-home-widget-shell-actions {
      flex-wrap: wrap;
      justify-content: flex-end;
      max-width: min(100%, 260px);
      opacity: 1;
      pointer-events: auto;
    }
    [data-noria-home-edit-mode="true"] .dashboard-home-widget-shell.dashboard-callout-notitle {
      overflow: visible;
    }
    [data-noria-home-edit-mode="true"] .dashboard-home-widget-shell-native {
      min-height: 52px;
      border-radius: 8px;
    }
    [data-noria-home-edit-mode="true"] .dashboard-home-widget-shell-native > .dashboard-home-widget-shell-actions--overlay {
      top: 0;
      right: 8px;
    }
    .dashboard-home-widget-edit-size {
      width: 72px;
      min-width: 72px;
      height: 24px;
      min-height: 24px;
      margin: 0;
      padding: 0 20px 0 6px;
      border: 0;
      border-radius: 5px;
      background-color: transparent;
      box-shadow: none;
      color: var(--dash-widget-muted);
      font-size: 11.5px;
      font-weight: 650;
      line-height: 22px;
      letter-spacing: 0;
    }
    .dashboard-home-widget-edit-size:hover,
    .dashboard-home-widget-edit-size:focus-visible {
      background-color: color-mix(in srgb, var(--dash-widget-accent) 9%, transparent);
      color: var(--dash-widget-text);
      outline: none;
    }
    .dashboard-home-widget-edit-size:focus-visible {
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--dash-widget-accent) 34%, transparent);
    }
    .dashboard-home-widget-shell-hidden {
      min-height: 42px ;
      opacity: .58;
    }
    .dashboard-home-widget-shell-hidden > .callout-content {
      display: none ;
    }
    .dashboard-home-widget-shell-hidden > .callout-title {
      min-height: 34px;
      border-bottom: 0 ;
    }
    .dashboard-home-widget-shell-hidden > .dashboard-home-widget-native-content,
    .dashboard-home-widget-shell-native[data-noria-widget-collapsed="true"] > .dashboard-home-widget-native-content {
      display: none ;
    }
    .dashboard-home-layout-edit-bar {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
      min-height: 30px;
      padding: 0 3px;
      color: var(--dash-widget-muted);
    }
    .dashboard-home-layout-recovery-entry {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      min-width: 0;
      min-height: 28px;
      margin-bottom: calc(var(--dash-home-section-gap) * -0.5);
    }
    .dashboard-home-layout-recovery-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      min-width: 28px;
      height: 28px;
      min-height: 28px;
      margin: 0;
      padding: 0 ;
      border: 0 ;
      border-radius: 6px;
      background: transparent ;
      box-shadow: none ;
      color: var(--dash-widget-muted) ;
      opacity: .56;
      transition: background-color var(--dash-motion-fast), color var(--dash-motion-fast), opacity var(--dash-motion-fast);
    }
    .dashboard-home-layout-recovery-button:hover,
    .dashboard-home-layout-recovery-button:focus-visible {
      background: color-mix(in srgb, var(--dash-widget-accent) 9%, transparent) ;
      color: var(--dash-widget-text) ;
      opacity: 1;
    }
    .dashboard-home-layout-recovery-button:disabled {
      opacity: .38;
      cursor: wait;
    }
    .dashboard-home-layout-edit-label {
      min-width: 0;
      font-size: 12px;
      font-weight: 700;
      line-height: 1.2;
      letter-spacing: 0;
    }
    .dashboard-home-layout-edit-done {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      min-width: 28px;
      height: 28px;
      min-height: 28px;
      margin: 0;
      padding: 0;
      border: 1px solid color-mix(in srgb, var(--dash-widget-border) 72%, transparent);
      border-radius: 6px;
      background: var(--dash-widget-panel);
      box-shadow: none;
      color: var(--dash-widget-text);
    }
    .dashboard-home-layout-edit-done:hover,
    .dashboard-home-layout-edit-done:focus-visible {
      border-color: color-mix(in srgb, var(--dash-widget-border) 48%, var(--dash-widget-accent));
      background: var(--dash-widget-panel-hover);
      outline: none;
    }
    .dashboard-home-widget-empty {
      min-width: 0;
      padding: 8px 10px;
      border-radius: 8px;
      border: 1px dashed var(--dash-widget-border);
      background: var(--dash-widget-accent-soft);
      color: var(--dash-widget-muted);
      font-size: .86em;
      line-height: 1.35;
    }
    .dashboard-home-markdown-widget {
      min-width: 0;
      max-height: min(58vh, 460px);
      overflow-x: hidden;
      overflow-y: auto;
      padding: 2px 1px;
      color: var(--dash-widget-text);
      font-size: .9em;
      line-height: 1.5;
    }
    .dashboard-home-markdown-widget > :first-child {
      margin-top: 0 ;
    }
    .dashboard-home-markdown-widget > :last-child {
      margin-bottom: 0 ;
    }
    .dashboard-home-markdown-single-content {
      min-width: 0;
    }
    .dashboard-home-markdown-single-state {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      min-width: 0;
      min-height: 30px;
      padding: 6px 2px;
      color: var(--dash-widget-muted);
      font-size: 12px;
      line-height: 1.35;
    }
    .dashboard-home-markdown-single-content:not(:empty) + .dashboard-home-markdown-single-state {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid color-mix(in srgb, var(--dash-widget-border) 72%, transparent);
    }
    .dashboard-home-markdown-single-state[data-noria-markdown-source-state="failed"] {
      color: color-mix(in srgb, var(--dash-widget-muted) 80%, var(--text-error));
    }
    .dashboard-home-markdown-single-state-action {
      flex: 0 0 auto;
      min-height: 26px ;
      margin: 0 ;
      padding: 2px 7px ;
      border: 0 ;
      border-radius: 6px ;
      background: transparent ;
      box-shadow: none ;
      color: color-mix(in srgb, var(--dash-widget-text) 72%, var(--dash-widget-accent)) ;
      font-size: 11.5px ;
      font-weight: 650 ;
      line-height: 1.2 ;
    }
    .dashboard-home-markdown-single-state-action:hover,
    .dashboard-home-markdown-single-state-action:focus-visible {
      background: var(--dash-widget-accent-soft) ;
      outline: none;
    }
    .dashboard-home-markdown-single-state-action[data-noria-action-state="failed"] {
      color: var(--text-error) ;
    }
    .dashboard-home-markdown-briefing {
      container-type: inline-size;
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: min(64vh, 560px);
      padding: 0;
    }
    .dashboard-home-markdown-briefing-overview {
      display: inline-flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px 10px;
      min-width: 0;
      padding: 0 2px 2px;
      color: var(--dash-widget-muted);
      font-size: 11px;
      line-height: 1.2;
      font-weight: 590;
      letter-spacing: 0;
    }
    .dashboard-home-markdown-briefing-overview-fact {
      display: inline-flex;
      align-items: center;
      min-width: 0;
      max-width: 100%;
      opacity: .86;
      white-space: nowrap;
    }
    .dashboard-home-markdown-briefing-overview-fact + .dashboard-home-markdown-briefing-overview-fact::before {
      content: "·";
      margin-right: 10px;
      opacity: .48;
    }
    .dashboard-home-markdown-briefing-priority {
      display: inline-block;
      min-width: 0;
      max-width: 100%;
      color: color-mix(in srgb, var(--dash-widget-text) 70%, var(--dash-widget-accent));
      font-weight: 680;
      cursor: pointer;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .dashboard-home-markdown-briefing-priority[data-noria-action-state="pending"] {
      color: var(--dash-widget-accent);
      opacity: .78;
    }
    .dashboard-home-markdown-briefing-priority[data-noria-action-state="failed"] {
      color: var(--text-error);
    }
    .dashboard-home-markdown-briefing-priority + .dashboard-home-markdown-briefing-overview-fact::before {
      content: "·";
      margin-right: 10px;
      opacity: .48;
    }
    .dashboard-home-markdown-briefing-overview-stale,
    .dashboard-home-markdown-briefing-overview-failed {
      color: color-mix(in srgb, var(--dash-widget-muted) 58%, rgb(217 119 6));
      opacity: .95;
    }
    .dashboard-home-markdown-briefing-overview-actions {
      color: color-mix(in srgb, var(--dash-widget-text) 68%, var(--dash-widget-accent));
      opacity: .92;
    }
    .dashboard-home-markdown-briefing-action-list {
      display: flex;
      flex-basis: 100%;
      min-width: 0;
      max-width: 100%;
      flex-wrap: wrap;
      align-items: center;
      gap: 5px 7px;
      padding-top: 1px;
    }
    .dashboard-home-markdown-briefing-action-workbench {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 4px;
      flex-basis: 100%;
      width: 100%;
      min-width: 0;
      max-width: 100%;
      padding-top: 2px;
    }
    .dashboard-home-markdown-briefing-action-lane {
      display: grid;
      grid-template-columns: max-content minmax(0, 1fr);
      align-items: baseline;
      gap: 6px;
      min-width: 0;
    }
    .dashboard-home-markdown-briefing-action-lane-label {
      color: var(--dash-widget-muted);
      font-size: 10px;
      line-height: 1.2;
      font-weight: 650;
      white-space: nowrap;
      opacity: .72;
    }
    .dashboard-home-markdown-briefing-action-lane-items {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 4px 7px;
      min-width: 0;
    }
    .dashboard-home-markdown-briefing-action-candidate {
      display: inline-flex;
      align-items: center;
      min-width: 0;
      max-width: min(100%, 34ch);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: color-mix(in srgb, var(--dash-widget-text) 72%, var(--dash-widget-accent));
      font-weight: 620;
      cursor: pointer;
    }
    .dashboard-home-markdown-briefing-action-candidate + .dashboard-home-markdown-briefing-action-candidate::before {
      content: "·";
      margin-right: 7px;
      color: var(--dash-widget-muted);
      opacity: .44;
      font-weight: 520;
    }
    .dashboard-home-markdown-briefing-action-candidate[data-noria-action-state="pending"] {
      color: var(--dash-widget-accent);
      opacity: .78;
    }
    .dashboard-home-markdown-briefing-action-candidate[data-noria-action-state="failed"] {
      color: var(--text-error);
    }
    .dashboard-home-markdown-briefing-item {
      min-width: 0;
      overflow: hidden;
      border-top: 1px solid color-mix(in srgb, var(--dash-widget-border) 68%, transparent);
      border-radius: 0;
      background: transparent;
    }
    .dashboard-home-markdown-briefing-item[open] {
      background: transparent;
      border-top-color: color-mix(in srgb, var(--dash-widget-border) 62%, var(--dash-widget-accent));
    }
    .dashboard-home-markdown-briefing-summary {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, min(34%, 32rem));
      align-items: start;
      gap: 8px 12px;
      padding: 9px 10px;
      cursor: pointer;
      list-style: none;
    }
    .dashboard-home-markdown-briefing-summary::-webkit-details-marker {
      display: none;
    }
    .dashboard-home-markdown-source-title {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 6px 8px;
      min-width: 0;
    }
    .dashboard-home-markdown-source-label {
      color: var(--dash-widget-text);
      font-size: 13px;
      line-height: 1.25;
      font-weight: 720;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .dashboard-home-markdown-source-role {
      color: color-mix(in srgb, var(--dash-widget-muted) 74%, var(--dash-widget-accent));
      font-size: 10.5px;
      line-height: 1.2;
      font-weight: 700;
      letter-spacing: 0;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .dashboard-home-markdown-source-desc {
      color: var(--dash-widget-muted);
      font-size: 11.5px;
      line-height: 1.25;
      font-weight: 520;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .dashboard-home-markdown-source-excerpt {
      flex-basis: 100%;
      min-width: 0;
      color: var(--dash-widget-muted);
      font-size: 11px;
      line-height: 1.25;
      font-weight: 500;
      opacity: .86;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .dashboard-home-markdown-source-action-hint {
      flex-basis: 100%;
      min-width: 0;
      color: color-mix(in srgb, var(--dash-widget-text) 70%, var(--dash-widget-accent));
      font-size: 11px;
      line-height: 1.25;
      font-weight: 610;
      opacity: .9;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .dashboard-home-markdown-source-action-hint[data-noria-action-kind] {
      cursor: pointer;
    }
    .dashboard-home-markdown-source-action-hint[data-noria-action-kind]:hover,
    .dashboard-home-markdown-source-action-hint[data-noria-action-kind]:focus-visible {
      color: var(--dash-widget-accent);
      opacity: 1;
      outline: 0;
    }
    .dashboard-home-markdown-source-action-hint[data-noria-action-state="pending"] {
      color: var(--dash-widget-accent);
      opacity: .78;
    }
    .dashboard-home-markdown-source-action-hint[data-noria-action-state="failed"] {
      color: var(--text-error);
      opacity: .9;
    }
    .dashboard-home-markdown-source-section-trail {
      flex-basis: 100%;
      min-width: 0;
      color: color-mix(in srgb, var(--dash-widget-muted) 80%, var(--dash-widget-accent));
      font-size: 10.5px;
      line-height: 1.25;
      font-weight: 560;
      opacity: .82;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .dashboard-home-markdown-source-section-trail[data-noria-action-kind] {
      cursor: pointer;
    }
    .dashboard-home-markdown-source-section-trail[data-noria-action-kind]:hover,
    .dashboard-home-markdown-source-section-trail[data-noria-action-kind]:focus-visible {
      color: var(--dash-widget-accent);
      opacity: 1;
      outline: 0;
    }
    .dashboard-home-markdown-source-section-trail[data-noria-action-state="pending"] {
      color: var(--dash-widget-accent);
      opacity: .78;
    }
    .dashboard-home-markdown-source-section-trail[data-noria-action-state="failed"] {
      color: var(--text-error);
      opacity: .9;
    }
    .dashboard-home-markdown-source-excerpt[hidden] {
      display: none;
    }
    .dashboard-home-markdown-source-action-hint[hidden] {
      display: none;
    }
    .dashboard-home-markdown-source-section-trail[hidden] {
      display: none;
    }
    .dashboard-home-markdown-source-meta {
      display: inline-flex;
      align-items: center;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 8px;
      min-width: 0;
    }
    .dashboard-home-markdown-source-path {
      flex: 1 1 10rem;
      max-width: min(18rem, 100%);
      color: var(--dash-widget-muted);
      font-size: 11px;
      line-height: 1.2;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .dashboard-home-markdown-source-facts {
      display: inline-flex;
      align-items: center;
      justify-content: flex-end;
      gap: 6px;
      min-width: 0;
      color: var(--dash-widget-muted);
      font-size: 10.5px;
      line-height: 1.2;
      font-weight: 560;
      white-space: nowrap;
    }
    .dashboard-home-markdown-source-updated,
    .dashboard-home-markdown-source-freshness,
    .dashboard-home-markdown-source-size,
    .dashboard-home-markdown-source-action-count {
      display: inline-flex;
      align-items: center;
      min-width: 0;
      opacity: .88;
    }
    .dashboard-home-markdown-source-facts > span + span::before {
      content: "·";
      margin-right: 6px;
      opacity: .58;
    }
    .dashboard-home-markdown-source-freshness[data-noria-markdown-source-freshness="fresh"] {
      color: color-mix(in srgb, var(--dash-widget-muted) 76%, rgb(22 163 74));
    }
    .dashboard-home-markdown-source-freshness[data-noria-markdown-source-freshness="stale"] {
      color: color-mix(in srgb, var(--dash-widget-muted) 64%, rgb(217 119 6));
    }
    .dashboard-home-markdown-source-freshness[data-noria-markdown-source-freshness="unknown"] {
      opacity: .72;
    }
    .dashboard-home-markdown-source-state {
      max-width: 11rem;
      min-height: 20px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 2px 7px;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--dash-widget-border) 72%, transparent);
      background: color-mix(in srgb, var(--dash-widget-panel) 92%, var(--dash-widget-accent-soft));
      color: color-mix(in srgb, var(--dash-widget-muted) 82%, var(--dash-widget-accent));
      font-size: 10.5px;
      font-weight: 680;
      line-height: 1.15;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .dashboard-home-markdown-source-state[data-noria-markdown-source-state="empty"] {
      border-color: color-mix(in srgb, var(--dash-widget-border) 76%, rgba(148,163,184,.22));
      background: color-mix(in srgb, var(--dash-widget-panel) 94%, rgba(148,163,184,.09));
      color: color-mix(in srgb, var(--dash-widget-muted) 88%, var(--text-muted));
    }
    .dashboard-home-markdown-source-state[data-noria-markdown-source-state="failed"] {
      border-color: color-mix(in srgb, var(--dash-widget-border) 70%, rgba(220,38,38,.28));
      background: color-mix(in srgb, var(--dash-widget-panel) 92%, rgba(220,38,38,.08));
      color: color-mix(in srgb, var(--text-muted) 70%, rgb(185 28 28));
    }
    .dashboard-home-markdown-source-open {
      min-height: 24px ;
      padding: 2px 8px ;
      border: 1px solid color-mix(in srgb, var(--dash-widget-border) 76%, transparent) ;
      border-radius: 7px ;
      background: transparent ;
      box-shadow: none ;
      color: color-mix(in srgb, var(--dash-widget-text) 82%, var(--dash-widget-accent)) ;
      font-size: 11.5px ;
      font-weight: 650 ;
      line-height: 1.2 ;
      cursor: pointer;
    }
    .dashboard-home-markdown-source-open:hover {
      border-color: color-mix(in srgb, var(--dash-widget-border) 58%, var(--dash-widget-accent)) ;
      background: var(--dash-widget-accent-soft) ;
    }
    .dashboard-home-markdown-source-open[data-noria-action-state="pending"] {
      color: var(--dash-widget-accent) ;
      opacity: .78;
    }
    .dashboard-home-markdown-source-open[data-noria-action-state="failed"] {
      color: var(--text-error) ;
    }
    .dashboard-home-markdown-briefing-content {
      max-height: min(48vh, 360px);
      overflow-x: hidden;
      overflow-y: auto;
      padding: 10px 12px 12px;
      border-top: 1px solid color-mix(in srgb, var(--dash-widget-border) 82%, transparent);
    }
    .dashboard-home-markdown-briefing-content > :first-child {
      margin-top: 0 ;
    }
    .dashboard-home-markdown-briefing-content > :last-child {
      margin-bottom: 0 ;
    }
    @container (max-width: 720px) {
      .dashboard-home-markdown-briefing-summary {
        grid-template-columns: minmax(0, 1fr);
      }
      .dashboard-home-markdown-source-meta {
        justify-content: flex-start;
      }
    }
    @media (max-width: 700px) {
      .dashboard-home-markdown-briefing-summary {
        grid-template-columns: minmax(0, 1fr);
      }
      .dashboard-home-markdown-source-meta {
        justify-content: flex-start;
        flex-wrap: wrap;
      }
      .dashboard-home-markdown-source-path {
        max-width: 100%;
      }
    }
    .dashboard-home-stat-widget {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(116px, 1fr));
      gap: 8px;
      min-width: 0;
    }
    .dashboard-home-stat-card {
      min-width: 0;
      padding: 10px 11px;
      border-radius: 8px;
      border: 1px solid var(--dash-widget-border);
      background: var(--dash-widget-panel);
      box-shadow: var(--dash-shadow-card);
      transition: background-color var(--dash-motion-fast), border-color var(--dash-motion-fast), box-shadow var(--dash-motion-fast), transform var(--dash-motion-fast);
    }
    .dashboard-home-stat-card:hover {
      background: var(--dash-widget-panel-hover);
      border-color: color-mix(in srgb, var(--dash-widget-border) 70%, var(--dash-widget-accent));
      box-shadow: var(--dash-shadow-card-hover);
      transform: translateY(-1px);
    }
    .dashboard-home-stat-value {
      color: var(--dash-widget-text);
      font-size: 20px;
      line-height: 1.1;
      font-weight: 760;
      letter-spacing: 0;
      overflow-wrap: anywhere;
    }
    .dashboard-home-stat-label {
      margin-top: 4px;
      color: var(--dash-widget-muted);
      font-size: 11.5px;
      line-height: 1.2;
      font-weight: 620;
      letter-spacing: 0;
    }
    .dashboard-home-stat-heatmap {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }
    .dashboard-home-stat-heatmap-controls {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
      min-width: 0;
    }
    .dashboard-home-stat-heatmap-subject {
      min-height: 26px;
      height: 26px;
      max-width: 100%;
      margin: 0;
      padding: 0 8px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      box-shadow: none;
      color: var(--dash-widget-muted);
      font-size: 12px;
      line-height: 1;
      font-weight: 620;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .dashboard-home-stat-heatmap-subject:hover,
    .dashboard-home-stat-heatmap-subject:focus-visible,
    .dashboard-home-stat-heatmap-subject.is-active {
      background: color-mix(in srgb, var(--dash-widget-accent) 9%, transparent);
      color: var(--dash-widget-text);
      outline: none;
    }
    .dashboard-home-stat-heatmap-subject.is-active {
      font-weight: 700;
    }
    .dashboard-home-stat-heatmap-chart {
      min-width: 0;
      overflow: hidden;
    }
    .dashboard-home-action-widget {
      display: flex;
      flex-wrap: wrap;
      align-items: stretch;
      gap: 8px;
      min-width: 0;
    }
    .dashboard-home-action-button {
      min-height: 30px ;
      max-width: 100%;
      padding: 5px 10px 5px 11px ;
      border-radius: 8px ;
      border: 1px solid var(--dash-widget-border) ;
      background: var(--dash-widget-panel) ;
      box-shadow: var(--dash-shadow-btn);
      color: var(--dash-widget-text) ;
      font-size: 12.5px ;
      font-weight: 650 ;
      line-height: 1.2 ;
      letter-spacing: 0;
      white-space: normal;
      text-align: left;
      overflow-wrap: anywhere;
      cursor: pointer;
      transition: background-color var(--dash-motion-fast), border-color var(--dash-motion-fast), box-shadow var(--dash-motion-fast), transform var(--dash-motion-fast);
    }
    .dashboard-home-action-button[data-noria-widget-kind="quickcapture"],
    .dashboard-home-action-button[data-noria-widget-kind="quick-capture"],
    .dashboard-home-action-button[data-noria-widget-kind="capture"] {
      --dash-widget-accent: rgb(22 163 74);
    }
    .dashboard-home-action-button:not(:disabled):hover {
      background: var(--dash-widget-panel-hover) ;
      border-color: color-mix(in srgb, var(--dash-widget-border) 62%, var(--dash-widget-accent)) ;
      box-shadow: var(--dash-shadow-card-hover);
      transform: translateY(-1px);
    }
    .dashboard-home-action-button:not(:disabled):active {
      transform: translateY(0);
      box-shadow: var(--dash-shadow-btn);
    }
    .dashboard-home-action-button:disabled {
      cursor: default;
      opacity: .55;
      filter: grayscale(.18);
    }
    .dashboard-home-today-actions {
      display: grid;
      grid-template-columns: minmax(18rem, 1fr) max-content;
      align-items: center;
      gap: 8px 12px;
      min-width: 0;
      width: 100%;
    }
    .dashboard-home-today-flow {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(10rem, max-content);
      align-items: center;
      gap: 8px 18px;
      min-width: 0;
      width: 100%;
    }
    .dashboard-home-today-flow__actions {
      min-width: 0;
      grid-column: 1;
      grid-row: 1;
    }
    .dashboard-home-today-flow__focus {
      grid-column: 2;
      grid-row: 1 / span 2;
      min-width: 0;
    }
    .dashboard-home-today-flow__focus > .dashboard-home-focus-strip {
      display: grid;
      grid-template-columns: minmax(10rem, max-content);
      align-items: center;
      gap: 8px;
    }
    .dashboard-home-today-flow .dashboard-home-focus-summary {
      grid-column: 1;
      grid-row: auto;
      align-self: center;
    }
    .dashboard-home-today-flow .dashboard-home-focus-list {
      grid-column: 1;
      grid-row: auto;
    }
    .dashboard-home-today-capture {
      display: grid;
      grid-template-columns: max-content minmax(0, 1fr) max-content;
      align-items: center;
      gap: 0;
      min-width: 0;
      min-height: 32px;
      border: 1px solid var(--dash-widget-border);
      border-radius: 8px;
      background: var(--dash-widget-panel);
      box-shadow: none;
      overflow: hidden;
      transition: background-color var(--dash-motion-fast), border-color var(--dash-motion-fast);
    }
    .dashboard-home-today-capture:focus-within {
      border-color: color-mix(in srgb, var(--dash-widget-border) 58%, var(--dash-widget-accent));
      background: color-mix(in srgb, var(--dash-widget-panel) 94%, var(--dash-widget-accent-soft));
    }
    .dashboard-home-today-capture-modes {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      min-width: 0;
      height: 32px;
      min-height: 32px;
      padding: 3px 4px;
      border: 0 ;
      border-radius: 0;
      background: transparent ;
      box-shadow: none;
    }
    .dashboard-home-today-capture-mode {
      appearance: none;
      -webkit-appearance: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 26px ;
      min-height: 26px ;
      padding: 0 8px ;
      border: 0 ;
      border-radius: 6px ;
      background: transparent ;
      box-shadow: none ;
      color: var(--dash-widget-muted) ;
      font-size: 12px ;
      font-weight: 660 ;
      line-height: 1 ;
      letter-spacing: 0;
      white-space: nowrap;
      cursor: pointer;
    }
    .dashboard-home-today-capture-mode.is-active {
      background: color-mix(in srgb, var(--dash-widget-accent-soft) 76%, var(--dash-widget-panel)) ;
      color: var(--dash-widget-text) ;
    }
    .dashboard-home-today-capture-mode:hover:not(.is-active) {
      background: color-mix(in srgb, var(--dash-widget-panel-hover) 72%, transparent) ;
      color: var(--dash-widget-text) ;
    }
    .dashboard-home-today-capture-mode:focus-visible {
      outline: none;
      box-shadow: var(--dash-focus-ring) ;
    }
    .dashboard-home-today-capture-input {
      min-width: 0;
      width: 100%;
      height: 32px;
      min-height: 32px;
      max-height: 86px;
      resize: none;
      overflow-y: auto;
      padding: 6px 8px ;
      border-radius: 0 ;
      border: 0 ;
      background: transparent ;
      box-shadow: none ;
      color: var(--dash-widget-text) ;
      font-size: 12.5px ;
      line-height: 20px ;
      letter-spacing: 0;
    }
    .dashboard-home-today-capture-input::placeholder {
      color: var(--dash-widget-muted);
      opacity: .72;
    }
    .dashboard-home-today-capture-input:focus {
      outline: none;
      background: transparent ;
    }
    .dashboard-home-today-capture-button,
    .dashboard-home-today-action-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 32px ;
      min-height: 32px ;
      max-width: 100%;
      padding: 0 10px ;
      border-radius: 8px ;
      border: 1px solid transparent ;
      box-shadow: none ;
      color: var(--dash-widget-text) ;
      font-size: 12.5px ;
      font-weight: 670 ;
      line-height: 20px ;
      letter-spacing: 0;
      white-space: nowrap;
      cursor: pointer;
      transition: background-color var(--dash-motion-fast), border-color var(--dash-motion-fast), color var(--dash-motion-fast), transform var(--dash-motion-fast);
    }
    .dashboard-home-today-capture-button {
      border: 0 ;
      border-radius: 0 ;
      background: transparent ;
      color: color-mix(in srgb, var(--dash-widget-accent) 72%, var(--dash-widget-text)) ;
    }
    .dashboard-home-today-action-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: 4px;
      min-width: 0;
    }
    .dashboard-home-today-action-button {
      background: transparent ;
      color: var(--dash-widget-muted) ;
    }
    .dashboard-home-layout-edit-toggle {
      width: 32px;
      min-width: 32px;
      padding: 0 ;
    }
    .dashboard-home-today-capture-button[data-noria-action-state="pending"],
    .dashboard-home-today-action-button[data-noria-action-state="pending"] {
      color: var(--dash-widget-accent) ;
      opacity: .78;
    }
    .dashboard-home-today-capture-button[data-noria-action-state="failed"],
    .dashboard-home-today-action-button[data-noria-action-state="failed"] {
      color: var(--text-error) ;
    }
    .dashboard-home-today-capture-button:not(:disabled):hover,
    .dashboard-home-today-action-button:not(:disabled):hover {
      border-color: color-mix(in srgb, var(--dash-widget-border) 60%, var(--dash-widget-accent)) ;
      background: color-mix(in srgb, var(--dash-widget-panel-hover) 86%, var(--dash-widget-accent-soft)) ;
      color: var(--dash-widget-text) ;
      transform: translateY(-1px);
    }
    .dashboard-home-today-capture-button:not(:disabled):hover {
      transform: none;
    }
    .dashboard-home-today-capture-button:not(:disabled):active,
    .dashboard-home-today-action-button:not(:disabled):active {
      transform: translateY(0);
    }
    .dashboard-home-today-capture-button:disabled,
    .dashboard-home-today-action-button:disabled {
      cursor: default;
      opacity: .48;
      filter: grayscale(.16);
    }
    @media (max-width: 860px) {
      .dashboard-home-today-actions {
        grid-template-columns: 1fr;
        align-items: stretch;
      }
      .dashboard-home-today-action-row {
        justify-content: flex-start;
      }
    }
    @container noria-home (max-width: 860px) {
      .dashboard-home-today-flow {
        grid-template-columns: minmax(0, 1fr);
        align-items: stretch;
      }
      .dashboard-home-today-flow__actions {
        grid-column: 1;
        grid-row: auto;
      }
      .dashboard-home-today-flow__focus,
      .dashboard-home-today-flow__focus > .dashboard-home-focus-strip {
        display: grid;
      }
      .dashboard-home-today-flow .dashboard-home-focus-summary,
      .dashboard-home-today-flow .dashboard-home-focus-list {
        grid-column: 1;
        grid-row: auto;
      }
      .dashboard-home-today-actions {
        grid-template-columns: 1fr;
        align-items: stretch;
      }
      .dashboard-home-today-action-row {
        justify-content: flex-start;
      }
    }
    @media (max-width: 520px) {
      .dashboard-home-today-capture {
        grid-template-columns: 1fr max-content;
      }
      .dashboard-home-today-capture-modes {
        grid-column: 1 / -1;
        justify-content: flex-start;
      }
      .dashboard-home-today-capture-button,
      .dashboard-home-today-action-button {
        white-space: normal;
      }
    }
    @container noria-home (max-width: 520px) {
      .dashboard-home-today-capture {
        grid-template-columns: 1fr max-content;
      }
      .dashboard-home-today-capture-modes {
        grid-column: 1 / -1;
        justify-content: flex-start;
      }
      .dashboard-home-today-capture-button,
      .dashboard-home-today-action-button {
        white-space: normal;
      }
    }
    .dashboard-home-focus-strip {
      display: grid;
      grid-template-columns: minmax(9rem, 0.26fr) minmax(24rem, 1fr);
      align-items: center;
      gap: 8px 10px;
      width: 100%;
      min-width: 0;
    }
    .dashboard-home-focus-strip[data-noria-home-focus-state="empty"] {
      grid-template-columns: minmax(0, max-content);
      align-items: center;
      justify-content: start;
    }
    .dashboard-home-focus-summary {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
      padding: 2px 0;
    }
    .dashboard-home-focus-eyebrow {
      color: var(--dash-widget-muted);
      font-size: 11px;
      line-height: 1.2;
      font-weight: 680;
      letter-spacing: 0;
    }
    .dashboard-home-focus-title {
      min-width: 0;
      color: var(--dash-widget-text);
      font-size: 14px;
      line-height: 1.25;
      font-weight: 780;
      letter-spacing: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .dashboard-home-focus-meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 6px;
      min-width: 0;
      color: var(--dash-widget-muted);
      font-size: 11.5px;
      line-height: 1.25;
      font-weight: 560;
    }
    .dashboard-home-focus-meta:empty {
      display: none;
    }
    .dashboard-home-focus-meta span + span::before {
      content: "";
      display: inline-block;
      width: 4px;
      height: 4px;
      margin: 0 6px 1px 0;
      border-radius: 999px;
      background: color-mix(in srgb, var(--dash-widget-accent) 58%, var(--dash-widget-muted));
      opacity: .76;
    }
    .dashboard-home-focus-empty-inline,
    .dashboard-home-focus-remaining-inline {
      color: color-mix(in srgb, var(--dash-widget-muted) 88%, var(--dash-widget-accent) 12%);
      font-weight: 580;
    }
    .dashboard-home-focus-strip[data-noria-home-focus-state="empty"] .dashboard-home-focus-summary {
      flex-direction: row;
      flex-wrap: wrap;
      align-items: center;
      gap: 2px 9px;
      padding: 1px 0;
    }
    .dashboard-home-focus-strip[data-noria-home-focus-state="empty"] .dashboard-home-focus-eyebrow {
      display: none;
    }
    .dashboard-home-focus-strip[data-noria-home-focus-state="empty"] .dashboard-home-focus-title {
      flex: 0 0 auto;
      font-size: 13px;
    }
    .dashboard-home-focus-strip[data-noria-home-focus-state="empty"] .dashboard-home-focus-meta {
      flex: 0 1 auto;
      min-width: 0;
    }
    .dashboard-home-focus-list {
      min-width: 0;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
      align-items: stretch;
    }
    .dashboard-home-focus-list[hidden] {
      display: none ;
    }
    .dashboard-home-focus-item {
      min-width: 0;
      min-height: 42px;
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 6px;
      padding: 4px 6px 4px 7px;
      border-radius: 8px;
      border: 1px solid color-mix(in srgb, var(--dash-widget-border) 82%, transparent);
      background: color-mix(in srgb, var(--dash-widget-panel) 92%, var(--dash-widget-accent-soft));
      color: var(--dash-widget-text);
      transition: background-color var(--dash-motion-fast), border-color var(--dash-motion-fast), color var(--dash-motion-fast);
    }
    .dashboard-home-focus-item:hover {
      background: color-mix(in srgb, var(--dash-widget-panel-hover) 88%, var(--dash-widget-accent-soft));
      border-color: color-mix(in srgb, var(--dash-widget-border) 58%, var(--dash-widget-accent));
    }
    .dashboard-home-focus-item.is-done,
    .dashboard-home-focus-item.is-deferred {
      opacity: .55;
    }
    .dashboard-home-focus-item.is-done .dashboard-home-focus-item-title {
    }
    .dashboard-home-focus-item-done {
      flex: 0 0 auto;
      width: 18px;
      height: 18px ;
      min-height: 18px ;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 ;
      border-radius: 50% ;
      border: 1.5px solid color-mix(in srgb, var(--dash-widget-border) 55%, var(--dash-widget-muted)) ;
      background: transparent ;
      box-shadow: none ;
      color: transparent ;
      font-size: 11px ;
      line-height: 1 ;
      cursor: pointer;
      transition: border-color var(--dash-motion-fast), background-color var(--dash-motion-fast), color var(--dash-motion-fast);
    }
    .dashboard-home-focus-item-done::after {
      content: "✓";
    }
    .dashboard-home-focus-item-done:not(:disabled):hover {
      border-color: var(--dash-widget-accent) ;
      background: color-mix(in srgb, var(--dash-widget-accent) 18%, transparent) ;
      color: var(--dash-widget-accent) ;
    }
    .dashboard-home-focus-item.is-done .dashboard-home-focus-item-done {
      border-color: var(--dash-widget-accent) ;
      background: var(--dash-widget-accent) ;
      color: var(--dash-widget-panel) ;
    }
    .dashboard-home-focus-item-open {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: center;
      gap: 3px;
      padding: 2px 0 ;
      margin: 0 ;
      border: none ;
      border-radius: 6px ;
      background: transparent ;
      box-shadow: none ;
      color: inherit ;
      text-align: left;
      cursor: pointer;
    }
    .dashboard-home-focus-item-open:disabled {
      cursor: default;
      opacity: .58;
    }
    .dashboard-home-focus-item-pomodoro {
      flex: 0 0 auto;
      width: 22px;
      height: 22px ;
      min-height: 22px ;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 ;
      border-radius: 7px ;
      border: 1px solid color-mix(in srgb, var(--dash-widget-border) 70%, transparent) ;
      background: transparent ;
      box-shadow: none ;
      color: var(--dash-widget-muted) ;
      font-size: 10.5px ;
      font-weight: 720 ;
      line-height: 1 ;
      letter-spacing: 0;
      cursor: pointer;
      opacity: 0;
      transition: opacity var(--dash-motion-fast), border-color var(--dash-motion-fast), color var(--dash-motion-fast), background-color var(--dash-motion-fast);
    }
    .dashboard-home-focus-item:hover .dashboard-home-focus-item-pomodoro,
    .dashboard-home-focus-item:focus-within .dashboard-home-focus-item-pomodoro,
    .dashboard-home-focus-item.has-pomodoro .dashboard-home-focus-item-pomodoro,
    .dashboard-home-focus-item.is-pomodoro-running .dashboard-home-focus-item-pomodoro {
      opacity: 1;
    }
    .dashboard-home-focus-item-pomodoro:not(:disabled):hover,
    .dashboard-home-focus-item-pomodoro.is-running {
      color: var(--dash-widget-accent) ;
      border-color: color-mix(in srgb, var(--dash-widget-border) 38%, var(--dash-widget-accent)) ;
      background: color-mix(in srgb, var(--dash-widget-accent) 13%, transparent) ;
    }
    .dashboard-home-focus-item-pomodoro.is-paused {
      color: color-mix(in srgb, var(--dash-widget-accent) 70%, var(--dash-widget-muted)) ;
      border-color: color-mix(in srgb, var(--dash-widget-border) 52%, var(--dash-widget-accent)) ;
      background: color-mix(in srgb, var(--dash-widget-accent) 8%, transparent) ;
    }
    .dashboard-home-focus-item-defer {
      flex: 0 0 auto;
      min-height: 22px ;
      padding: 2px 7px ;
      border-radius: 6px ;
      border: 1px solid color-mix(in srgb, var(--dash-widget-border) 70%, transparent) ;
      background: transparent ;
      box-shadow: none ;
      color: var(--dash-widget-muted) ;
      font-size: 10.5px ;
      font-weight: 620 ;
      line-height: 1.2 ;
      white-space: nowrap;
      cursor: pointer;
      opacity: 0;
      transition: opacity var(--dash-motion-fast), border-color var(--dash-motion-fast), color var(--dash-motion-fast), background-color var(--dash-motion-fast);
    }
    .dashboard-home-focus-item:hover .dashboard-home-focus-item-defer,
    .dashboard-home-focus-item:focus-within .dashboard-home-focus-item-defer {
      opacity: 1;
    }
    .dashboard-home-focus-item-defer:not(:disabled):hover {
      color: var(--dash-widget-text) ;
      border-color: color-mix(in srgb, var(--dash-widget-border) 45%, var(--dash-widget-accent)) ;
      background: color-mix(in srgb, var(--dash-widget-panel-hover) 85%, var(--dash-widget-accent-soft)) ;
    }
    .dashboard-home-focus-item-title {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 12.5px;
      line-height: 1.22;
      font-weight: 700;
      letter-spacing: 0;
    }
    .dashboard-home-focus-item-meta {
      display: flex;
      align-items: center;
      gap: 5px;
      min-width: 0;
      color: var(--dash-widget-muted);
      font-size: 10.8px;
      line-height: 1.2;
      font-weight: 560;
    }
    .dashboard-home-focus-item-meta span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .dashboard-home-focus-more {
      align-self: center;
      color: var(--dash-widget-muted);
      font-size: 11.5px;
      line-height: 1.25;
      font-weight: 620;
      white-space: nowrap;
      padding: 0 2px;
    }
    @media (max-width: 1040px) {
      .dashboard-home-focus-strip {
        grid-template-columns: minmax(10rem, .36fr) minmax(18rem, 1fr);
      }
      .dashboard-home-focus-strip[data-noria-home-focus-state="empty"] {
        grid-template-columns: minmax(0, max-content);
      }
    }
    @container noria-home (max-width: 1040px) {
      .dashboard-home-focus-strip {
        grid-template-columns: minmax(10rem, .36fr) minmax(18rem, 1fr);
      }
      .dashboard-home-focus-strip[data-noria-home-focus-state="empty"] {
        grid-template-columns: minmax(0, max-content);
      }
    }
    @media (max-width: 860px) {
      .dashboard-home-focus-strip {
        grid-template-columns: 1fr;
        align-items: stretch;
      }
      .dashboard-home-focus-list {
        grid-template-columns: 1fr;
      }
      .dashboard-home-focus-strip[data-noria-home-focus-state="empty"] {
        grid-template-columns: 1fr;
      }
      .dashboard-home-focus-strip[data-noria-home-focus-state="empty"] .dashboard-home-focus-summary {
        flex-direction: column;
        align-items: flex-start;
      }
    }
    @container noria-home (max-width: 860px) {
      .dashboard-home-focus-strip {
        grid-template-columns: 1fr;
        align-items: stretch;
      }
      .dashboard-home-focus-list {
        grid-template-columns: 1fr;
      }
      .dashboard-home-focus-strip[data-noria-home-focus-state="empty"] {
        grid-template-columns: 1fr;
      }
      .dashboard-home-focus-strip[data-noria-home-focus-state="empty"] .dashboard-home-focus-summary {
        flex-direction: column;
        align-items: flex-start;
      }
    }
    .dashboard-home-entry-widget {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
    }
    .dashboard-home-entry-widget__description,
    .dashboard-home-entry-description {
      color: var(--dash-widget-muted);
      font-size: 12.5px;
      line-height: 1.35;
    }
    .dashboard-home-entry-row {
      display: grid;
      grid-template-columns: minmax(0, max-content) minmax(0, 1fr);
      align-items: center;
      gap: 6px 10px;
      min-width: 0;
      padding: 8px 9px;
      border: 1px solid var(--dash-widget-border);
      border-radius: 8px;
      background: var(--dash-widget-panel);
      box-shadow: var(--dash-shadow-card);
      transition: background-color var(--dash-motion-fast), border-color var(--dash-motion-fast), box-shadow var(--dash-motion-fast);
    }
    .dashboard-home-entry-row:hover {
      background: var(--dash-widget-panel-hover);
      border-color: color-mix(in srgb, var(--dash-widget-border) 68%, var(--dash-widget-accent));
      box-shadow: var(--dash-shadow-card-hover);
    }
    .dashboard-home-entry-button {
      min-height: 28px ;
      max-width: 100%;
      padding: 4px 9px ;
      border-radius: 7px ;
      border: 1px solid color-mix(in srgb, var(--dash-widget-border) 80%, transparent) ;
      background: color-mix(in srgb, var(--dash-widget-panel) 82%, var(--dash-widget-accent-soft)) ;
      color: var(--dash-widget-text) ;
      font-size: 12.5px ;
      font-weight: 650 ;
      line-height: 1.2 ;
      letter-spacing: 0;
      white-space: normal;
      overflow-wrap: anywhere;
      cursor: pointer;
    }
    .dashboard-home-entry-button:not(:disabled):hover {
      border-color: color-mix(in srgb, var(--dash-widget-border) 56%, var(--dash-widget-accent)) ;
      background: var(--dash-widget-accent-soft) ;
    }
    .dashboard-home-entry-button:disabled {
      cursor: default;
      opacity: .55;
    }
    .dashboard-home-entry-meta {
      min-width: 0;
      color: var(--dash-widget-muted);
      font-size: 11.5px;
      line-height: 1.25;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .dashboard-home-entry-description {
      grid-column: 1 / -1;
      font-size: 12px;
    }
    @media (max-width: 640px) {
      .dashboard-home-entry-row {
        grid-template-columns: 1fr;
      }
      .dashboard-home-entry-meta {
        white-space: normal;
        overflow-wrap: anywhere;
      }
    }
    .dashboard-progress {
      width: 100%; height: 7px; border: 0; border-radius: var(--dash-pill-radius);
      overflow: hidden; appearance: none; -webkit-appearance: none;
      background: var(--dash-progress-track); box-shadow: inset 0 1px 2px rgba(15,23,42,.12);
    }
    .dashboard-progress::-webkit-progress-bar { background: var(--dash-progress-track); border-radius: var(--dash-pill-radius); }
    .dashboard-progress::-webkit-progress-value { border-radius: var(--dash-pill-radius); background: var(--dash-progress-fill); box-shadow: var(--dash-shadow-progress); }
    .dashboard-progress::-moz-progress-bar { border-radius: var(--dash-pill-radius); background: var(--dash-progress-fill); box-shadow: var(--dash-shadow-progress); }
    /* 导引「项目」：进度条置于待办条目下方，轨道更弱、填充与主页靛青阶一致 */
    .dashboard-project-progress-row {
      flex-shrink: 0;
    }
    .dashboard-progress.dashboard-progress--project {
      height: 8px;
      border-radius: 999px;
    }
    .dashboard-progress.dashboard-progress--project::-webkit-progress-bar {
      background: color-mix(in srgb, var(--background-modifier-border) 42%, rgba(148,163,184,.14));
      border-radius: 999px;
      box-shadow: inset 0 1px 2px rgba(15,23,42,.07);
    }
    .dashboard-progress.dashboard-progress--project::-webkit-progress-value {
      border-radius: 999px;
      /* 纯色、偏淡：混白降低饱和度，仍保持靛青倾向 */
      background: color-mix(in srgb, rgb(99, 102, 241) 42%, rgb(255, 255, 255));
      box-shadow: 0 0 0 1px rgba(255,255,255,.35) inset, 0 1px 4px rgba(67,56,202,.09);
    }
    .dashboard-progress.dashboard-progress--project::-moz-progress-bar {
      border-radius: 999px;
      background: color-mix(in srgb, rgb(99, 102, 241) 42%, rgb(255, 255, 255));
      box-shadow: 0 0 0 1px rgba(255,255,255,.32) inset, 0 1px 3px rgba(67,56,202,.08);
    }
    .theme-dark .dashboard-progress.dashboard-progress--project::-webkit-progress-bar {
      background: color-mix(in srgb, var(--background-modifier-border) 35%, rgba(30,41,59,.6));
      box-shadow: inset 0 1px 2px rgba(0,0,0,.28);
    }
    .theme-dark .dashboard-progress.dashboard-progress--project::-webkit-progress-value {
      background: color-mix(in srgb, var(--background-primary) 45%, rgb(165, 180, 252));
      box-shadow: 0 0 0 1px rgba(255,255,255,.06) inset, 0 1px 5px rgba(99,102,241,.14);
    }
    .theme-dark .dashboard-progress.dashboard-progress--project::-moz-progress-bar {
      background: color-mix(in srgb, var(--background-primary) 45%, rgb(165, 180, 252));
      box-shadow: 0 0 0 1px rgba(255,255,255,.06) inset, 0 1px 4px rgba(99,102,241,.12);
    }
    .dashboard-home-root .callout[data-callout="info"] button,
    .dashboard-home-root .callout[data-callout="abstract"] button,
    .dashboard-home-root .callout[data-callout="success"] button { box-shadow: var(--dash-shadow-btn); }
    .dashboard-home-root .callout[data-callout="info"] .callout-content span[style*="border-radius:999px"],
    .dashboard-home-root .callout[data-callout="abstract"] .callout-content span[style*="border-radius:999px"],
    .dashboard-home-root .callout[data-callout="success"] .callout-content span[style*="border-radius:999px"] { box-shadow: var(--dash-shadow-inset-soft); }
    .dashboard-home-root .callout[data-callout="info"] .callout-content a.internal-link:not(.dashboard-task-title--link),
    .dashboard-home-root .callout[data-callout="abstract"] .callout-content a.internal-link:not(.dashboard-task-title--link),
    .dashboard-home-root .callout[data-callout="success"] .callout-content a.internal-link:not(.dashboard-task-title--link) { box-shadow: var(--dash-shadow-inset-soft); }
    .dashboard-project-next-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 6px;
      margin: 0 0 7px;
      padding: 0 0 7px;
      border-bottom: 1px solid color-mix(in srgb, var(--background-modifier-border) 68%, transparent);
    }
    .dashboard-project-next-input {
      min-width: 0;
      width: 100%;
      height: 28px ;
      min-height: 28px ;
      padding: 0 9px ;
      border-radius: 8px ;
      border: 1px solid color-mix(in srgb, var(--background-modifier-border) 76%, transparent) ;
      background: transparent ;
      box-shadow: none ;
      color: var(--text-normal) ;
      font-size: .84em ;
      line-height: 1.2 ;
      letter-spacing: 0;
    }
    .dashboard-project-next-input:focus {
      border-color: color-mix(in srgb, var(--background-modifier-border) 52%, var(--noria-module-home, var(--interactive-accent))) ;
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--noria-module-home, var(--interactive-accent)) 12%, transparent) ;
      outline: none ;
    }
    .dashboard-project-next-add {
      width: 28px;
      height: 28px ;
      min-height: 28px ;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 ;
      border-radius: 8px ;
      border: 1px solid color-mix(in srgb, var(--background-modifier-border) 72%, transparent) ;
      background: transparent ;
      box-shadow: none ;
      color: color-mix(in srgb, var(--text-muted) 76%, var(--noria-module-home, var(--interactive-accent))) ;
      font-size: 15px ;
      font-weight: 720 ;
      line-height: 1 ;
      cursor: pointer;
      transition: background .12s ease, border-color .12s ease, color .12s ease;
    }
    .dashboard-project-next-add:hover:not(:disabled),
    .dashboard-project-next-add:focus-visible {
      border-color: color-mix(in srgb, var(--background-modifier-border) 46%, var(--noria-module-home, var(--interactive-accent))) ;
      background: color-mix(in srgb, var(--noria-module-home, var(--interactive-accent)) 8%, transparent) ;
      color: var(--text-normal) ;
      outline: none ;
    }
    .dashboard-project-next-row[data-noria-project-next-state="saving"] {
      opacity: .74;
    }
    .dashboard-project-next-row[data-noria-project-next-state="saving"] .dashboard-project-next-input,
    .dashboard-project-next-row[data-noria-project-next-state="saving"] .dashboard-project-next-add {
      cursor: progress ;
    }
    .dashboard-project-next-input[data-noria-action-state="pending"] {
      opacity: .72;
    }
    .dashboard-project-next-add[data-noria-action-state="pending"] {
      opacity: .72;
      color: color-mix(in srgb, var(--text-muted) 62%, var(--noria-module-home, var(--interactive-accent))) ;
    }
    .dashboard-project-next-input[data-noria-action-state="failed"],
    .dashboard-project-next-add[data-noria-action-state="failed"] {
      color: var(--text-error) ;
    }
    .dashboard-project-next-row[data-noria-project-next-state="error"] .dashboard-project-next-input {
      border-color: color-mix(in srgb, var(--text-error) 46%, var(--background-modifier-border)) ;
    }
    .dashboard-project-task-row {
      cursor: pointer;
      border: none ;
      border-radius: var(--dash-row-radius) ;
      border-bottom: none ;
      background: transparent ;
      box-shadow: none ;
      transition: background .12s ease, transform .08s ease;
    }
    .dashboard-project-task-list .dashboard-project-task-row:last-child {
      border-bottom: none ;
    }
    .dashboard-project-task-row:hover {
      background: var(--dash-row-hover-bg) ;
    }
    .dashboard-project-task-row:active {
      transform: scale(0.995);
    }
    .dashboard-guide-projects .dashboard-project-workbench {
      gap: 7px ;
    }
    .dashboard-guide-projects .dashboard-project-chip-strip {
      gap: 5px;
      padding: 0 0 1px;
    }
    .dashboard-guide-projects .dashboard-project-current-panel {
      border: 0 ;
      border-radius: 0 ;
      padding: 0 ;
      background: transparent ;
      box-shadow: none ;
    }
    .dashboard-guide-projects .dashboard-project-next-row {
      margin: 0 0 6px;
      padding: 0 0 6px;
    }
    .dashboard-guide-projects .dashboard-project-next-input {
      height: 26px ;
      min-height: 26px ;
      padding: 0 8px ;
    }
    .dashboard-guide-projects .dashboard-project-next-add {
      width: 26px;
      height: 26px ;
      min-height: 26px ;
      border-color: transparent ;
    }
    .dashboard-guide-projects .dashboard-project-task-list {
      gap: 3px ;
    }
    .dashboard-guide-projects .dashboard-project-task-row {
      padding: 3px 2px ;
    }
    .dashboard-project-chip {
      --project-chip-bg: color-mix(in srgb, var(--background-primary) 98%, var(--background-secondary));
      --project-chip-fill: color-mix(in srgb, var(--noria-module-home, var(--interactive-accent)) 8%, transparent);
      --project-chip-border: color-mix(in srgb, var(--background-modifier-border) 84%, var(--noria-module-home, var(--interactive-accent)) 16%);
      position: relative;
      padding: 3px 10px;
      border-radius: 9px;
      border: 1px solid var(--project-chip-border);
      background: linear-gradient(90deg, var(--project-chip-fill) 0 var(--noria-project-progress), var(--project-chip-bg) var(--noria-project-progress) 100%);
      color: var(--text-normal);
      font-size: .84em;
      line-height: 1.25;
      font-weight: 560;
      box-sizing: border-box;
      box-shadow: none ;
      cursor: pointer;
      transition: border-color .14s ease, background .14s ease, color .14s ease, box-shadow .14s ease, filter .14s ease;
    }
    .dashboard-project-chip[aria-pressed="true"] {
      --project-chip-bg: color-mix(in srgb, var(--background-primary) 94%, var(--noria-module-home, var(--interactive-accent)) 6%);
      --project-chip-fill: color-mix(in srgb, var(--noria-module-home, var(--interactive-accent)) 26%, transparent);
      --project-chip-border: color-mix(in srgb, var(--noria-module-home, var(--interactive-accent)) 48%, var(--background-modifier-border));
      font-weight: 700;
      color: color-mix(in srgb, var(--text-normal) 92%, var(--noria-module-home, var(--interactive-accent)) 8%);
      box-shadow: none ;
    }
    .dashboard-project-chip[data-project-stage="planned"] {
      --project-chip-bg: color-mix(in srgb, var(--background-primary) 98%, var(--background-secondary));
      --project-chip-fill: color-mix(in srgb, rgb(20 184 166) 10%, transparent);
      --project-chip-border: color-mix(in srgb, var(--background-modifier-border) 82%, rgb(20 184 166) 18%);
    }
    .dashboard-project-chip[data-project-stage="planned"][aria-pressed="true"] {
      --project-chip-bg: color-mix(in srgb, var(--background-primary) 94%, rgb(20 184 166 / 0.10));
      --project-chip-fill: color-mix(in srgb, rgb(20 184 166) 28%, transparent);
      --project-chip-border: color-mix(in srgb, rgb(20 184 166) 46%, var(--background-modifier-border));
    }
    .dashboard-project-chip:hover {
      border-color: color-mix(in srgb, var(--project-chip-border) 82%, var(--text-muted) 18%);
      filter: none;
    }
    .theme-dark .dashboard-project-chip {
      --project-chip-bg: color-mix(in srgb, var(--background-primary) 92%, rgb(30 41 59));
      --project-chip-fill: color-mix(in srgb, var(--noria-module-home, var(--interactive-accent)) 14%, transparent);
      --project-chip-border: color-mix(in srgb, var(--background-modifier-border) 74%, var(--noria-module-home, var(--interactive-accent)) 26%);
    }
    .theme-dark .dashboard-project-chip[aria-pressed="true"] {
      --project-chip-bg: color-mix(in srgb, var(--background-primary) 86%, var(--noria-module-home, var(--interactive-accent)) 14%);
      --project-chip-fill: color-mix(in srgb, var(--noria-module-home, var(--interactive-accent)) 34%, transparent);
    }
    .dashboard-guide-projects .dashboard-project-chip {
      max-width: min(100%, 11rem);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-height: 26px;
      padding: 3px 9px;
    }
    .dashboard-project-quick-menu {
      position: fixed;
      z-index: 10020;
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 132px;
      padding: 6px;
      border-radius: 10px;
      border: 1px solid color-mix(in srgb, var(--background-modifier-border) 76%, rgba(99,102,241,.32));
      background: var(--dash-surface-raised);
      box-shadow: 0 10px 24px rgba(15,23,42,.16), 0 1px 0 rgba(255,255,255,.58) inset;
      backdrop-filter: blur(2px);
    }
    .theme-dark .dashboard-project-quick-menu {
      box-shadow: 0 12px 28px rgba(0,0,0,.42), 0 1px 0 rgba(255,255,255,.06) inset;
    }
    .dashboard-project-quick-menu__btn {
      height: 27px;
      padding: 0 10px;
      border-radius: 8px;
      border: 1px solid rgba(99,102,241,.22);
      background: color-mix(in srgb, var(--background-primary) 92%, rgba(99,102,241,.08));
      color: var(--text-normal);
      font-size: .76em;
      font-weight: 650;
      text-align: left;
      cursor: pointer;
      transition: border-color .14s ease, background .14s ease, color .14s ease;
    }
    .dashboard-project-quick-menu__btn:hover:not(:disabled) {
      border-color: rgba(79,70,229,.34);
      background: color-mix(in srgb, var(--background-primary) 86%, rgba(99,102,241,.16));
    }
    .dashboard-project-quick-menu__btn.is-warn {
      border-color: rgba(217,119,6,.28);
      background: color-mix(in srgb, var(--background-primary) 90%, rgba(251,191,36,.2));
      color: color-mix(in srgb, var(--text-normal) 84%, rgba(146,64,14,.72));
    }
    .dashboard-project-quick-menu__btn.is-done {
      border-color: rgba(22,163,74,.26);
      background: color-mix(in srgb, var(--background-primary) 90%, rgba(74,222,128,.18));
      color: color-mix(in srgb, var(--text-normal) 84%, rgba(22,101,52,.72));
    }
    .dashboard-project-quick-menu__btn.is-danger {
      border-color: rgba(148,163,184,.26);
      background: color-mix(in srgb, var(--background-primary) 90%, rgba(226,232,240,.24));
      color: color-mix(in srgb, var(--text-normal) 76%, rgba(71,85,105,.82));
    }
    .dashboard-home-root .callout[data-callout="col"] { margin: 6px 0 ; border: 0 ; background: transparent ; box-shadow: none ; }
    .dashboard-home-root .callout[data-callout="col"] > .callout-title { display: none ; }
    .dashboard-home-root .callout[data-callout="col"] > .callout-content {
      display: grid ; grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px; padding: 0 ; background: transparent ;
    }
    .dashboard-home-root .callout[data-callout="col"] > .callout-content > .callout { margin: 0 ; min-width: 0; }
    .dashboard-home-root .callout[data-callout="tasks"] { margin: 6px 0 ; border-radius: var(--dash-radius) ; overflow: hidden; }
    .dashboard-home-root .callout[data-callout="tasks"] > .callout-title { display: none ; }
    .dashboard-home-root .callout[data-callout="tasks"] > .callout-content {
      display: grid ; grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px; padding: 8px ;
      background: var(--dash-surface);
      border-radius: var(--dash-radius); align-items: start;
    }
    .dashboard-home-root .callout[data-callout="tasks"] > .callout-content > .callout { margin: 0 ; min-width: 0; border-radius: 10px ; }
    @media (max-width: 1100px) {
      .dashboard-home-root .callout[data-callout="col"] > .callout-content { grid-template-columns: 1fr ; }
      .dashboard-home-root .callout[data-callout="tasks"] > .callout-content { grid-template-columns: 1fr ; }
    }
    /* 导引 / 概览列标题旁：Lucide 图标按钮 */
    button.dashboard-guide-icon-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      padding: 0;
      border-radius: 8px;
      border: 1px solid rgba(99,102,241,.22);
      background: var(--dash-surface-raised);
      color: #3730a3;
      cursor: pointer;
      transition: box-shadow .15s ease, transform .08s ease, border-color .15s ease;
    }
    button.dashboard-guide-icon-btn svg {
      display: block;
      width: 16px;
      height: 16px;
      stroke-width: 2;
      pointer-events: none;
      flex-shrink: 0;
    }
    button.dashboard-guide-icon-btn:hover:not(:disabled) {
      box-shadow: 0 2px 8px rgba(67,56,202,.14);
      border-color: rgba(79,70,229,.32);
    }
    button.dashboard-guide-icon-btn:active:not(:disabled) {
      transform: scale(0.96);
    }
    button.dashboard-guide-icon-btn:focus-visible {
      box-shadow: var(--dash-focus-ring), var(--dash-shadow-btn) ;
    }
    button.dashboard-guide-icon-btn:disabled {
      opacity: 0.55;
      cursor: wait;
    }
    /* 习惯 / 倒计时 / 导引 / 待办 / MOC：统一粗体「+」，略大于 16px 以提高可读性 */
    button.dashboard-guide-icon-btn.dashboard-guide-toolbar-plus {
      font-size: 18px;
      font-weight: 750;
      line-height: 1;
      letter-spacing: -0.03em;
    }
    /* 知识库治理：琥珀系 + 「书架」图标；置于工具栏首位时不需左外推 */
    button.dashboard-guide-icon-btn--governance:not(:first-child) {
      margin-left: 4px;
    }
    button.dashboard-guide-icon-btn--governance {
      padding-left: 1px;
      border: 1px solid rgba(217, 119, 6, 0.3);
      border-radius: 8px;
      background: color-mix(in srgb, var(--dash-surface) 86%, rgba(251, 191, 36, 0.18));
      color: #9a3412;
    }
    button.dashboard-guide-icon-btn--governance:hover:not(:disabled) {
      border-color: rgba(234, 88, 12, 0.42);
      box-shadow: 0 2px 10px rgba(234, 88, 12, 0.12);
    }
    .theme-dark button.dashboard-guide-icon-btn--governance {
      background: color-mix(in srgb, var(--dash-surface) 84%, rgba(251, 191, 36, 0.16));
      border-color: rgba(251, 191, 36, 0.28);
      color: color-mix(in srgb, var(--text-normal) 82%, rgba(253, 186, 116, 0.35));
    }
    .theme-dark button.dashboard-guide-icon-btn--governance:hover:not(:disabled) {
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.35);
    }
    /* 待办：与周表 plannerChrome 共用正文节律 + Obsidian 正文字体（与 .markdown-rendered 体感一致） */
    .dashboard-task-title {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      overflow: hidden;
      word-break: break-word;
      line-height: 1.35;
      font-size: 0.92em;
      font-weight: 580;
      letter-spacing: 0.01em;
      font-family: var(--font-text, var(--font-interface));
      color: var(--text-normal);
      width: 100%;
      align-self: stretch;
      -webkit-font-smoothing: antialiased;
    }
    .dashboard-task-title--one-line {
      display: block;
      -webkit-line-clamp: unset;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
      flex: 1 1 auto;
      /* 与圆钮同排时勿 stretch，否则字块占满行高、视觉上“偏上” */
      align-self: center;
      line-height: 1.25;
      font-size: 0.92em;
      font-weight: 580;
      letter-spacing: 0.01em;
      font-family: var(--font-text, var(--font-interface));
      color: var(--text-normal);
      -webkit-font-smoothing: antialiased;
    }
    a.dashboard-task-title--link {
      cursor: pointer;
      color: inherit ;
      box-shadow: none ;
      background-image: none ;
    }
    .dashboard-task-row a.dashboard-task-title--link {
      box-shadow: none ;
      background-image: none ;
    }
    .dashboard-project-task-row a.dashboard-task-title--link {
      box-shadow: none ;
      background-image: none ;
    }
    /* 与 Inbox / 项目一致：不在链接上画下划线（避免与行间分割混淆），仅靠行背景提示可点 */
    a.dashboard-task-title--link:hover {
      color: inherit ;
    }
    .theme-dark a.dashboard-task-title--link:hover {
      color: inherit ;
    }
    .dashboard-task-row {
      display: flex;
      align-items: center;
      gap: var(--dash-row-gap);
      padding: var(--dash-row-y) var(--dash-row-x);
      min-height: 24px;
      border-bottom: none;
      border-radius: var(--dash-row-radius);
      background: transparent;
      transition: background .12s ease;
    }
    .dashboard-task-row:last-child {
      border-bottom: none;
    }
    .dashboard-task-row:hover {
      background: var(--dash-row-hover-bg);
    }
    .dashboard-period-task-shell {
      min-width: 0;
    }
    .dashboard-period-task-scroll {
    }
    .dashboard-period-task-list {
      display: flex;
      flex-direction: column;
      gap: 3px ;
      min-width: 0;
    }
    .dashboard-period-task-empty {
      color: var(--text-muted);
      font-size: .88em;
      line-height: 1.4;
      padding: 3px 2px;
    }
    .dashboard-period-task-summary {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 10px;
      min-width: 0;
      min-height: 31px;
      padding: 0 2px 4px;
    }
    .dashboard-period-task-summary-main {
      display: flex;
      flex-direction: column;
      gap: 1px;
      min-width: 0;
    }
    .dashboard-period-task-summary-label {
      min-width: 0;
      color: color-mix(in srgb, var(--text-normal) 88%, var(--dash-workbench-accent));
      font-size: .82em;
      font-weight: 720;
      line-height: 1.3;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .dashboard-period-task-summary-meta {
      min-width: 0;
      color: var(--text-muted);
      font-size: .72em;
      font-weight: 600;
      line-height: 1.25;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .dashboard-period-task-summary-count {
      min-width: 34px;
      justify-content: center;
    }
    .dashboard-period-task-group {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
      padding: 4px 0 2px;
    }
    .dashboard-period-task-group-head {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 6px;
      min-width: 0;
      min-height: 18px;
      padding: 0 2px;
    }
    .dashboard-period-task-group-label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      max-width: 100%;
    }
    .dashboard-period-task-group-body {
      display: flex;
      flex-direction: column;
      gap: 1px;
      min-width: 0;
    }
    .dashboard-period-task-section-label {
      display: inline-flex;
      align-items: center;
      position: relative;
      width: fit-content;
      max-width: 100%;
      margin: 0;
      padding: 0 0 0 10px;
      border-radius: 0;
      background: transparent;
      color: color-mix(in srgb, var(--dash-heading-text) 82%, var(--dash-workbench-accent));
      font-size: .78em;
      font-weight: 720;
      line-height: 1.25;
      letter-spacing: 0;
    }
    .dashboard-period-task-section-label::before {
      content: "";
      position: absolute;
      left: 0;
      top: 50%;
      width: 5px;
      height: 5px;
      border-radius: 999px;
      background: currentColor;
      opacity: .72;
      transform: translateY(-50%);
    }
    .dashboard-period-task-group--now .dashboard-period-task-section-label {
      color: color-mix(in srgb, var(--text-normal) 76%, rgb(14 165 233));
    }
    .dashboard-period-task-group--next .dashboard-period-task-section-label {
      color: color-mix(in srgb, var(--text-normal) 74%, rgb(34 197 94));
    }
    .dashboard-period-task-group--later .dashboard-period-task-section-label {
      color: color-mix(in srgb, var(--text-muted) 86%, var(--dash-workbench-accent));
    }
    .dashboard-period-task-count {
      color: color-mix(in srgb, var(--text-muted) 84%, var(--dash-workbench-accent));
      font-weight: 680;
    }
    .dashboard-period-task-group-count {
      min-width: 20px;
      justify-content: center;
      color: color-mix(in srgb, var(--text-muted) 78%, var(--dash-workbench-accent));
      font-size: .74em;
    }
    .dashboard-period-task-divider {
      height: 0;
      margin: 5px 2px 4px;
      border: 0;
      border-top: 1px solid color-mix(in srgb, var(--background-modifier-border) 74%, var(--dash-workbench-accent) 18%);
      opacity: .64;
    }
    .dashboard-period-task-completed {
      margin-top: 3px;
      min-width: 0;
    }
    .dashboard-period-task-completed-toggle {
      appearance: none;
      border: 0;
      font: inherit;
      text-align: inherit;
      box-shadow: none;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      width: fit-content;
      max-width: 100%;
      margin: 2px 0 1px;
      padding: 1px 2px;
      border-radius: 6px;
      background: transparent ;
      color: var(--text-muted);
      font-size: .78em;
      font-weight: 650;
      line-height: 1.3;
      letter-spacing: 0;
    }
    .dashboard-period-task-completed-toggle:hover {
      color: var(--text-normal);
      background: color-mix(in srgb, var(--dash-workbench-accent) 7%, transparent) ;
    }
    .dashboard-period-task-completed-toggle:focus-visible {
      box-shadow: var(--dash-focus-ring);
      outline: none;
    }
    .dashboard-period-task-completed-list {
      min-width: 0;
      padding-top: 2px;
    }
    /* 主页任务复选框直接交给 Obsidian 主题；Noria 只在行文本上表达状态。 */
    .dashboard-segment-tabs {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      flex-wrap: wrap;
      padding: 0 4px 0 0;
      margin: 0;
      border: 0 ;
      background: transparent ;
      box-shadow: none ;
    }
    button.dashboard-segment-tab {
      appearance: none;
      -webkit-appearance: none;
      min-width: 26px;
      height: var(--dash-compact-segment-height, 26px);
      padding: 0 8px;
      border: 0 ;
      border-color: transparent ;
      border-radius: var(--dash-compact-segment-radius, 8px);
      background: transparent ;
      background-image: none ;
      box-shadow: none ;
      color: var(--text-muted);
      font-size: var(--dash-compact-segment-font-size, 12px);
      font-weight: var(--dash-compact-segment-weight, 650);
      letter-spacing: 0;
      line-height: 1;
      cursor: pointer;
      transition: background .12s ease, color .12s ease, box-shadow .12s ease;
    }
    button.dashboard-segment-tab:hover:not(.is-active) {
      background: var(--dash-compact-segment-hover-bg, color-mix(in srgb, var(--background-primary) 88%, rgba(59,130,246,.1))) ;
      color: var(--text-normal) ;
    }
    button.dashboard-segment-tab.is-active {
      background: var(--dash-compact-segment-active-bg, color-mix(in srgb, var(--background-primary) 78%, rgba(59,130,246,.22))) ;
      color: var(--dash-title-color) ;
      font-weight: var(--dash-compact-segment-active-weight, 720);
      box-shadow: none ;
    }
    .theme-dark button.dashboard-segment-tab.is-active {
      color: color-mix(in srgb, var(--text-normal) 90%, rgba(165,180,252,.25));
    }
    button.dashboard-segment-tab:focus-visible {
      outline: none;
      box-shadow: var(--dash-focus-ring);
    }
    .dashboard-heatmap-mode-button {
      appearance: none;
      -webkit-appearance: none;
      min-height: var(--dash-panel-segment-height, 28px);
      height: var(--dash-panel-segment-height, 28px);
      border-radius: var(--dash-panel-segment-radius, 8px) ;
      border: 0 ;
      border-color: transparent ;
      box-shadow: none ;
      outline: none ;
      font-size: var(--dash-panel-segment-font-size, 13px);
      font-weight: var(--dash-panel-segment-weight, 650);
      letter-spacing: 0;
      line-height: 1;
    }
    .dashboard-heatmap-mode-button:hover:not(.is-active) {
      background: var(--dash-panel-segment-hover-bg, color-mix(in srgb, var(--background-primary) 88%, rgba(59,130,246,.1))) ;
      color: var(--text-normal) ;
    }
    .dashboard-heatmap-mode-button.is-active {
      font-weight: var(--dash-panel-segment-active-weight, 720);
    }
    .dashboard-heatmap-mode-button:focus-visible {
      box-shadow: var(--dash-focus-ring) ;
    }
    .dashboard-mit-row {
      padding-bottom: 4px;
      margin-bottom: 4px;
      border-bottom: none;
    }
    .dashboard-countdown-tray {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .dashboard-countdown-empty {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      color: var(--text-muted);
      font-size: .88em;
      line-height: 1.35;
    }
    .dashboard-countdown-empty-copy {
      display: inline-flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      min-width: 0;
    }
    .dashboard-countdown-empty-text {
      color: var(--text-muted);
    }
    .dashboard-countdown-empty-action {
      appearance: none;
      -webkit-appearance: none;
      height: 26px;
      padding: 0 2px ;
      border: 0 ;
      border-radius: 6px ;
      background: transparent ;
      box-shadow: none ;
      color: color-mix(in srgb, var(--dash-workbench-accent) 62%, var(--text-muted)) ;
      font-size: .82em ;
      font-weight: 660 ;
      cursor: pointer;
    }
    .dashboard-countdown-empty-action:hover {
      color: var(--text-normal) ;
      background: color-mix(in srgb, var(--dash-workbench-accent) 8%, transparent) ;
    }
    .dashboard-countdown-card {
      appearance: none;
      -webkit-appearance: none;
      width: 100%;
      min-height: 78px;
      padding: 0;
      border: 1px solid var(--countdown-row-stroke, color-mix(in srgb, var(--background-modifier-border) 82%, var(--background-primary)));
      border-radius: 10px;
      background: var(--countdown-row-surface);
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
      transition: background-color .14s ease, border-color .14s ease, filter .14s ease, transform .08s ease;
    }
    .dashboard-countdown-card[data-countdown-visual="hero-days-v2"] {
      /* dashboard-countdown-hero-days-v2 */
      display: block;
    }
    .dashboard-countdown-card [class~="dashboard-countdown-date"],
    .dashboard-countdown-card [data-countdown-date-label] {
      display: none ;
    }
    .dashboard-countdown-card:hover {
      border-color: color-mix(in srgb, var(--background-modifier-border) 70%, var(--text-muted));
      background: var(--countdown-row-surface);
      filter: saturate(1.04) brightness(1.01);
    }
    .dashboard-countdown-card:active {
      transform: translateY(0);
    }
    .dashboard-countdown-card:focus-visible {
      outline: none;
      background: var(--countdown-row-surface);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--dash-workbench-accent) 18%, transparent) ;
    }
    .dashboard-countdown-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(92px, auto);
      align-items: center;
      gap: 12px;
      min-height: 58px;
      min-width: 0;
      padding: 9px 14px 3px;
    }
    .dashboard-countdown-title {
      min-width: 0;
      display: block;
      overflow: hidden;
      white-space: nowrap;
    }
    .dashboard-countdown-name {
      display: block;
      min-width: 0;
      color: var(--text-normal);
      font-size: .95em;
      font-weight: 760;
      line-height: 1.3;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .dashboard-countdown-days-figure {
      display: inline-grid;
      grid-template-columns: auto auto;
      align-items: center;
      justify-content: end;
      justify-self: end;
      gap: 6px;
      min-width: 0;
      min-height: 0;
      padding: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      color: var(--countdown-remaining-color);
      font-size: 1em;
      font-weight: 760;
      line-height: 1;
      white-space: nowrap;
      text-align: right;
    }
    .dashboard-countdown-days-label {
      display: inline-flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 1px;
      min-width: 0;
      line-height: 1;
    }
    .dashboard-countdown-days-prefix,
    .dashboard-countdown-days-unit {
      font-size: .82em;
      font-weight: 720;
      opacity: .72;
    }
    .dashboard-countdown-days-number {
      min-width: 1ch;
      font-size: 3.8em;
      font-weight: 900;
      line-height: .72;
      letter-spacing: 0;
      font-variant-numeric: tabular-nums;
      text-align: center;
    }
    .dashboard-countdown-progress {
      height: 6px;
      margin: 0 14px 10px;
      border-radius: 999px;
      background: var(--countdown-progress-track);
      overflow: hidden;
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--background-primary) 42%, transparent) inset;
    }
    .dashboard-countdown-progress-fill {
      width: var(--countdown-progress-width);
      height: 100%;
      border-radius: inherit;
      background: var(--countdown-progress-fill);
    }
    .dashboard-habit-week-table .dashboard-task-title--one-line,
    .dashboard-habit-status-panel .dashboard-task-title--one-line {
      font-family: var(--font-text, var(--font-interface));
      font-size: var(--dash-text-row-size, .86em);
      line-height: var(--dash-text-row-line, 1.25);
      font-weight: var(--dash-text-row-weight, 500);
      color: var(--text-normal);
      letter-spacing: 0;
      -webkit-font-smoothing: antialiased;
    }
    .dashboard-habit-21-shell {
      container-type: inline-size;
      --habit-name-col: clamp(88px, 25%, 116px);
      --habit-cell-h: 17px;
      --habit-head-h: 19px;
      --habit-token-h: 10px;
      --habit-streak-pad: 1px;
      --habit-matrix-bg: transparent;
      --habit-matrix-bg-strong: transparent;
      --habit-grid-line: color-mix(in srgb, var(--text-muted) 18%, transparent);
      --habit-grid-line-soft: color-mix(in srgb, var(--text-muted) 11%, transparent);
      --habit-name-color: var(--text-normal);
      --habit-date-color: color-mix(in srgb, var(--text-muted) 88%, #8b5cf6);
      --habit-amber: rgba(245,158,11,.82);
      --habit-done: #8b5cf6;
      --habit-done-hover: #a78bfa;
      --habit-done-border: color-mix(in srgb, #c4b5fd 56%, transparent);
      --habit-done-text: color-mix(in srgb, #211735 78%, black);
      --habit-hover-fill: color-mix(in srgb, #8b5cf6 24%, transparent);
      --habit-hover-ring: color-mix(in srgb, #a78bfa 62%, transparent);
      --habit-hover-glow: color-mix(in srgb, #8b5cf6 18%, transparent);
      --habit-row-hover: color-mix(in srgb, #8b5cf6 5%, transparent);
      --habit-today-column: color-mix(in srgb, #8b5cf6 7%, transparent);
      width: 100%;
      min-width: 0;
      background: transparent;
      border: 0;
      border-radius: 0;
    }
    .dashboard-habit-today-strip {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
      margin: 0 0 8px 0;
      padding: 0 0 7px 0;
      border-bottom: 1px solid color-mix(in srgb, var(--background-modifier-border) 70%, var(--habit-done) 12%);
    }
    .dashboard-habit-today-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
    }
    .dashboard-habit-today-title {
      color: color-mix(in srgb, var(--habit-name-color) 86%, var(--habit-done));
      font-size: .78em;
      line-height: 1.2;
      font-weight: 740;
      letter-spacing: 0;
    }
    .dashboard-habit-today-summary {
      min-width: 0;
      color: color-mix(in srgb, var(--text-muted) 86%, var(--habit-done));
      font-size: .74em;
      line-height: 1.2;
      font-weight: 620;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .dashboard-habit-today-list {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 5px;
      min-width: 0;
    }
    .dashboard-habit-today-chip {
      appearance: none;
      -webkit-appearance: none;
      max-width: 100%;
      min-width: 0;
      height: 23px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 9px;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--background-modifier-border) 76%, var(--habit-done) 12%);
      background: color-mix(in srgb, var(--background-primary) 96%, var(--habit-done) 4%);
      color: color-mix(in srgb, var(--text-muted) 82%, var(--text-normal));
      box-shadow: none;
      font-size: .76em;
      line-height: 1;
      font-weight: 650;
      letter-spacing: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      cursor: pointer;
      transition: background .12s ease, border-color .12s ease, color .12s ease, transform .12s ease;
    }
    .dashboard-habit-today-chip.is-done {
      border-color: color-mix(in srgb, var(--habit-done-border) 58%, transparent);
      background: color-mix(in srgb, var(--habit-done) 16%, var(--background-primary));
      color: color-mix(in srgb, var(--text-normal) 78%, var(--habit-done));
    }
    .dashboard-habit-today-chip:hover:not(:disabled),
    .dashboard-habit-today-chip:focus-visible {
      border-color: color-mix(in srgb, var(--habit-hover-ring) 76%, var(--background-modifier-border));
      background: color-mix(in srgb, var(--background-primary) 90%, var(--habit-done) 10%);
      color: var(--text-normal);
      outline: none;
    }
    .dashboard-habit-21-grid {
      flex: 0 0 auto;
      min-height: 0;
      min-width: 0;
      width: 100%;
      overflow: visible;
      display: flex;
      flex-direction: column;
      gap: 0;
      padding: 0;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
    }
    .dashboard-habit-21-row {
      display: grid;
      grid-template-columns: var(--habit-name-col) minmax(0, 1fr);
      width: 100%;
      min-width: 0;
      align-items: start;
      border-bottom: 0;
    }
    .dashboard-habit-21-row:last-child {
      border-bottom: 0;
    }
    .dashboard-habit-21-header {
      position: relative;
      z-index: 2;
      background: transparent;
    }
    .dashboard-habit-21-track {
      min-width: 0;
      width: 100%;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: center;
      position: relative;
      background-image: linear-gradient(90deg, var(--habit-grid-line-soft) 0 1px, transparent 1px);
      background-size: calc(100% / 22) 100%;
      background-position: 0 0;
    }
    .dashboard-habit-21-line {
      min-width: 0;
      display: grid;
      grid-template-columns: repeat(11, minmax(0, 1fr));
      align-items: center;
    }
    .dashboard-habit-21-head-track {
      grid-template-columns: repeat(22, minmax(0, 1fr));
    }
    .dashboard-habit-21-track::after {
      content: "";
      pointer-events: none;
      position: absolute;
      z-index: 0;
      top: 0;
      bottom: 0;
      left: calc((var(--habit-today-index, 21) * 100%) / 22);
      width: calc(100% / 22);
      background: var(--habit-today-column);
    }
    .dashboard-habit-21-cell,
    .dashboard-habit-21-head-cell {
      min-width: 0;
      height: var(--habit-cell-h);
      display: flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      background: transparent;
      position: relative;
      z-index: 1;
    }
    .dashboard-habit-21-row:not(.dashboard-habit-21-header):hover .dashboard-habit-21-track {
      background-color: var(--habit-row-hover);
    }
    .dashboard-habit-21-head-cell {
      height: var(--habit-head-h);
      font-size: clamp(9px, .66em, 10.5px);
      font-weight: 500;
      color: var(--habit-date-color);
      border-bottom: 1px solid var(--habit-grid-line);
      letter-spacing: 0;
    }
    .dashboard-habit-21-name {
      position: relative;
      z-index: 9;
      justify-content: flex-start;
      padding: 0 6px 0 0;
      background: transparent;
      border-right: 0;
    }
    .dashboard-habit-21-header .dashboard-habit-21-name {
      z-index: 3;
    }
    .dashboard-habit-21-name.dashboard-habit-21-cell {
      align-items: flex-start;
      padding-top: 1px;
    }
    .dashboard-habit-21-name-wrap {
      min-width: 0;
      width: 100%;
      display: flex;
      align-items: flex-start;
    }
    .dashboard-habit-21-name .dashboard-task-title {
      color: var(--habit-name-color);
      font-size: 12px;
      line-height: 1.25;
      font-weight: 620;
    }
    .dashboard-habit-21-date-head.is-weekend {
      color: color-mix(in srgb, var(--habit-date-color) 78%, #a78bfa);
    }
    .dashboard-habit-21-date-head.is-month-start {
      color: color-mix(in srgb, var(--habit-date-color) 72%, var(--text-normal));
      font-weight: 680;
      box-shadow: inset 1px 0 0 var(--habit-grid-line);
    }
    .dashboard-habit-21-date-head.is-today {
      color: color-mix(in srgb, #a78bfa 70%, var(--text-normal));
      border-radius: 999px;
      background: color-mix(in srgb, #8b5cf6 10%, transparent);
      font-weight: 760;
      box-shadow: inset 0 0 0 1px color-mix(in srgb, #a78bfa 44%, transparent);
    }
    .dashboard-habit-21-slot {
      position: relative;
      z-index: 1;
      width: 100%;
      height: var(--habit-token-h);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 var(--habit-streak-pad);
      box-sizing: border-box;
    }
    .dashboard-habit-21-cell.is-today::before {
      content: "";
      pointer-events: none;
      position: absolute;
      z-index: 0;
      inset: 1px 0;
      border-radius: 5px;
      background: var(--habit-today-column);
    }
    .dashboard-habit-21-token {
      width: 100%;
      height: var(--habit-token-h);
      max-width: 100%;
      min-width: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      padding: 0;
      margin: 0;
      border-radius: 4px;
      border: 0;
      background: transparent;
      background-color: transparent;
      background-image: none;
      color: var(--habit-done-text);
      appearance: none;
      -webkit-appearance: none;
      font-size: 0;
      line-height: 1;
      font-weight: 700;
      cursor: pointer;
      box-shadow: none;
      transform: translateZ(0);
      transform-origin: center;
      transition: filter .12s ease, box-shadow .12s ease, background .12s ease, transform .12s ease;
      position: relative;
      z-index: 1;
    }
    button.dashboard-habit-21-token,
    span.dashboard-habit-21-token {
      border: 0 ;
      background: transparent ;
      background-color: transparent ;
      background-image: none ;
      box-shadow: none ;
    }
    span.dashboard-habit-21-token {
      cursor: default;
    }
    .dashboard-habit-21-cell.is-done .dashboard-habit-21-token {
      width: 100%;
      background: var(--habit-done) ;
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--habit-done-border) 50%, transparent), 0 1px 2px color-mix(in srgb, var(--habit-done) 18%, transparent) ;
    }
    .dashboard-habit-21-cell.is-done.is-streak-start.is-streak-end .dashboard-habit-21-token {
      width: min(10px, 72%);
      border-radius: 999px;
    }
    .dashboard-habit-21-token.has-streak-count {
      font-size: 8px;
      line-height: 1;
      font-weight: 700;
      color: var(--habit-done-text);
      text-shadow: none;
      letter-spacing: 0;
    }
    .dashboard-habit-21-cell.is-done.is-streak-start:not(.is-streak-end) .dashboard-habit-21-slot {
      padding-left: var(--habit-streak-pad);
      padding-right: 0;
    }
    .dashboard-habit-21-cell.is-done.is-streak-middle .dashboard-habit-21-slot {
      padding-left: 0;
      padding-right: 0;
    }
    .dashboard-habit-21-cell.is-done.is-streak-end:not(.is-streak-start) .dashboard-habit-21-slot {
      padding-left: 0;
      padding-right: var(--habit-streak-pad);
    }
    .dashboard-habit-21-cell.is-done.is-streak-start:not(.is-streak-end) .dashboard-habit-21-token {
      border-top-right-radius: 0;
      border-bottom-right-radius: 0;
    }
    .dashboard-habit-21-cell.is-done.is-streak-middle .dashboard-habit-21-token {
      border-radius: 0;
      box-shadow: inset 0 1px 0 color-mix(in srgb, white 12%, transparent), inset 0 -1px 0 color-mix(in srgb, black 8%, transparent) ;
    }
    .dashboard-habit-21-cell.is-done.is-streak-end:not(.is-streak-start) .dashboard-habit-21-token {
      border-top-left-radius: 0;
      border-bottom-left-radius: 0;
    }
    .dashboard-habit-21-cell.has-partial .dashboard-habit-21-token {
      background: color-mix(in srgb, var(--habit-amber) 16%, transparent) ;
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--habit-amber) 58%, transparent) ;
    }
    .dashboard-habit-21-cell.is-today .dashboard-habit-21-token {
      box-shadow: none ;
    }
    .dashboard-habit-21-cell.is-today.is-done .dashboard-habit-21-token {
      box-shadow: inset 0 0 0 1px color-mix(in srgb, #ddd6fe 56%, var(--habit-done-border)), 0 1px 3px color-mix(in srgb, var(--habit-done) 22%, transparent) ;
    }
    .dashboard-habit-21-token:hover:not(:disabled) {
      background: var(--habit-hover-fill) ;
      filter: brightness(1.08);
      transform: scaleY(1.34);
      box-shadow: inset 0 0 0 1px var(--habit-hover-ring), 0 0 0 1px var(--habit-hover-glow), 0 1px 5px var(--habit-hover-glow) ;
      z-index: 3;
    }
    .dashboard-habit-21-token:focus-visible {
      background: var(--habit-hover-fill) ;
      box-shadow: inset 0 0 0 1px var(--habit-hover-ring), 0 0 0 2px color-mix(in srgb, #8b5cf6 18%, transparent) ;
      outline: none;
    }
    .dashboard-habit-21-cell.is-done .dashboard-habit-21-token:hover:not(:disabled) {
      background: var(--habit-done-hover) ;
      box-shadow: inset 0 0 0 1px var(--habit-done-border), 0 0 0 1px var(--habit-hover-glow), 0 1px 4px var(--habit-hover-glow) ;
    }
    button.dashboard-habit-21-token[data-noria-action-state="pending"] {
      opacity: .58;
      cursor: wait;
      filter: saturate(.82);
    }
    button.dashboard-habit-21-token[data-noria-action-state="failed"] {
      background: color-mix(in srgb, var(--text-error) 12%, transparent) ;
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--text-error) 52%, transparent) ;
    }
    @media (prefers-reduced-motion: reduce) {
      .dashboard-habit-21-token {
        transition: background .12s ease, box-shadow .12s ease, filter .12s ease;
      }
      .dashboard-habit-21-token:hover:not(:disabled) {
        transform: none;
      }
    }
    .dashboard-habit-21-input {
      width: min(38px, 100%);
      height: 20px;
      border-radius: 6px;
      border: 1px solid var(--habit-done-border);
      background: var(--background-primary);
      color: var(--text-normal);
      font-size: .72em;
      text-align: center;
      padding: 0 3px;
      box-sizing: border-box;
      outline: none;
    }
    .theme-dark .dashboard-habit-21-shell {
      --habit-matrix-bg: transparent;
      --habit-matrix-bg-strong: transparent;
      --habit-grid-line: color-mix(in srgb, #c4b5fd 13%, transparent);
      --habit-grid-line-soft: color-mix(in srgb, #c4b5fd 8%, transparent);
      --habit-name-color: var(--text-normal);
      --habit-date-color: color-mix(in srgb, #c4b5fd 62%, var(--text-muted));
      --habit-done-text: color-mix(in srgb, white 84%, #2e1065);
      --habit-hover-ring: color-mix(in srgb, #c4b5fd 62%, transparent);
      --habit-hover-glow: color-mix(in srgb, #8b5cf6 28%, transparent);
      --habit-row-hover: color-mix(in srgb, #8b5cf6 8%, transparent);
      --habit-today-column: color-mix(in srgb, #a78bfa 12%, transparent);
    }
    .theme-dark .dashboard-habit-21-token.has-streak-count {
      text-shadow: 0 1px 0 color-mix(in srgb, black 28%, transparent);
    }
    @container (max-width: 520px) {
      .dashboard-habit-21-grid {
        --habit-cell-h: 17px;
        --habit-head-h: 15px;
        --habit-token-h: 10px;
        gap: 2px;
      }
      .dashboard-habit-21-header {
        margin-bottom: 1px;
      }
      .dashboard-habit-21-row:not(.dashboard-habit-21-header) {
        row-gap: 0;
      }
      .dashboard-habit-21-row:not(.dashboard-habit-21-header) .dashboard-habit-21-track {
        display: flex;
        flex-direction: column;
        gap: 1px;
        background-image: none;
      }
      .dashboard-habit-21-row:not(.dashboard-habit-21-header) .dashboard-habit-21-track::after {
        top: calc(var(--habit-cell-h) + 1px);
        left: calc(((var(--habit-today-index, 21) - 11) * 100%) / 11);
        width: calc(100% / 11);
      }
      .dashboard-habit-21-row:not(.dashboard-habit-21-header) .dashboard-habit-21-line {
        min-width: 0;
        width: 100%;
        display: grid;
        align-items: center;
        position: relative;
        background-image: linear-gradient(90deg, var(--habit-grid-line-soft) 0 1px, transparent 1px);
        background-size: calc(100% / 11) 100%;
        background-position: 0 0;
      }
      .dashboard-habit-21-line--early {
        grid-template-columns: repeat(11, minmax(0, 1fr));
      }
      .dashboard-habit-21-line--recent {
        grid-template-columns: repeat(11, minmax(0, 1fr));
        border-top: 0;
      }
      .dashboard-habit-21-head-track {
        display: flex;
        flex-direction: column;
        gap: 0;
        background-image: none;
      }
      .dashboard-habit-21-head-track::after {
        display: none;
      }
      .dashboard-habit-21-head-track .dashboard-habit-21-line {
        min-width: 0;
        width: 100%;
        display: grid;
        grid-template-columns: repeat(11, minmax(0, 1fr));
        align-items: center;
        background-image: linear-gradient(90deg, var(--habit-grid-line-soft) 0 1px, transparent 1px);
        background-size: calc(100% / 11) 100%;
        background-position: 0 0;
      }
      .dashboard-habit-21-header .dashboard-habit-21-name,
      .dashboard-habit-21-head-track {
        min-height: calc(var(--habit-head-h) * 2);
      }
      .dashboard-habit-21-head-cell {
        border-bottom: 0;
      }
      .dashboard-habit-21-name.dashboard-habit-21-cell,
      .dashboard-habit-21-header .dashboard-habit-21-name {
        height: auto;
        align-self: stretch;
        align-items: flex-start;
      }
      .dashboard-habit-21-cell.is-done.is-visual-line-start:not(.is-streak-start) .dashboard-habit-21-slot {
        padding-left: var(--habit-streak-pad);
      }
      .dashboard-habit-21-cell.is-done.is-visual-line-end:not(.is-streak-end) .dashboard-habit-21-slot {
        padding-right: var(--habit-streak-pad);
      }
      .dashboard-habit-21-cell.is-done.is-visual-line-start:not(.is-streak-start) .dashboard-habit-21-token {
        border-top-left-radius: 4px;
        border-bottom-left-radius: 4px;
      }
      .dashboard-habit-21-cell.is-done.is-visual-line-end:not(.is-streak-end) .dashboard-habit-21-token {
        border-top-right-radius: 4px;
        border-bottom-right-radius: 4px;
      }
    }
    /* —— 主页通用：MOC 条、Inbox 行、GDD、身份条 —— */
    .dashboard-moc-strip {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px 12px;
      width: 100%;
      min-width: 0;
      padding: 10px 12px 10px 14px;
      border-radius: var(--dash-radius);
      background: var(--dash-surface-raised);
      border: 1px solid color-mix(in srgb, var(--background-modifier-border) 70%, rgba(99,102,241,.22));
      box-shadow: 0 1px 0 rgba(255,255,255,.2) inset, 0 2px 10px rgba(30,58,138,.05);
    }
    .theme-dark .dashboard-moc-strip {
      box-shadow: 0 1px 0 rgba(255,255,255,.04) inset, 0 2px 14px rgba(0,0,0,.2);
    }
    /* 导引区内联：strip 不再套独立描边条；MOC 外层用 dashboard-moc-host，无白卡托盘 */
    .dashboard-moc-strip.dashboard-moc-strip--bare {
      padding: 2px 0 0;
      margin: 0;
      border: none;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
      gap: 8px 10px;
    }
    .theme-dark .dashboard-moc-strip.dashboard-moc-strip--bare {
      box-shadow: none;
    }
    .dashboard-moc-empty.dashboard-moc-empty--bare {
      border: none;
      background: transparent;
      box-shadow: none;
      padding: 6px 0 4px;
    }
    .dashboard-moc-strip__lead {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex: 0 0 auto;
    }
    .dashboard-moc-strip__toolbar {
      display: inline-flex;
      align-items: center;
      flex: 0 0 auto;
      margin-left: auto;
    }
    .dashboard-moc-strip__lead-icon {
      width: 18px;
      height: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: rgba(67,56,202,.88);
      opacity: .9;
    }
    .dashboard-moc-strip__label {
      font-size: 1.02em;
      font-weight: 800;
      letter-spacing: .12px;
      line-height: 1.25;
      color: var(--dash-title-color);
      opacity: 1;
    }
    .dashboard-moc-entry {
      display: inline-flex;
      align-items: center;
      min-width: 0;
      gap: 3px;
    }
    .dashboard-moc-chip {
      --moc-chip-accent: #6366f1;
      --moc-chip-fill: color-mix(in srgb, var(--moc-chip-accent) 16%, var(--dash-surface-raised) 84%);
      --moc-chip-border: color-mix(in srgb, var(--moc-chip-accent) 34%, var(--background-modifier-border) 66%);
      --moc-chip-ink: var(--dash-moc-entry-color);
      display: inline-flex;
      align-items: center;
      max-width: 100%;
      padding: 5px 12px;
      border-radius: var(--dash-pill-radius);
      font-family: var(--dash-moc-entry-font-family);
      font-size: var(--dash-moc-entry-font-size);
      line-height: var(--dash-moc-entry-line-height);
      font-weight: var(--dash-moc-entry-font-weight);
      letter-spacing: var(--dash-moc-entry-letter-spacing);
      border: 1px solid var(--moc-chip-border);
      background: var(--moc-chip-fill);
      color: var(--moc-chip-ink) ;
      transition: transform .1s ease, box-shadow .15s ease, border-color .15s ease, background .15s ease;
      box-shadow: var(--dash-shadow-inset-soft);
    }
    .dashboard-moc-visual-action {
      width: 26px;
      height: 26px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: var(--text-muted);
      box-shadow: none;
      opacity: .72;
      cursor: pointer;
    }
    .dashboard-moc-visual-action:hover,
    .dashboard-moc-visual-action:focus-visible {
      background: var(--background-modifier-hover);
      color: var(--text-normal);
      opacity: 1;
    }
    .theme-dark .dashboard-moc-chip {
      --moc-chip-fill: color-mix(in srgb, var(--moc-chip-accent) 10%, var(--dash-surface-raised) 90%);
      --moc-chip-border: color-mix(in srgb, var(--moc-chip-accent) 18%, var(--background-modifier-border) 82%);
      --moc-chip-ink: color-mix(in srgb, var(--text-normal) 92%, var(--background-primary) 8%);
    }
    .dashboard-moc-chip:hover {
      --moc-chip-fill: color-mix(in srgb, var(--moc-chip-accent) 24%, var(--dash-surface-raised) 76%);
      border-color: color-mix(in srgb, var(--moc-chip-accent) 42%, var(--background-modifier-border) 58%);
      box-shadow: 0 2px 8px color-mix(in srgb, var(--moc-chip-accent) 18%, rgba(67,56,202,.08));
      transform: translateY(-0.5px);
    }
    .theme-dark .dashboard-moc-chip:hover {
      --moc-chip-fill: color-mix(in srgb, var(--moc-chip-accent) 26%, var(--dash-surface-raised) 74%);
      border-color: color-mix(in srgb, var(--moc-chip-accent) 44%, var(--background-modifier-border) 56%);
    }
    .dashboard-moc-chip:focus-visible {
      outline: none;
      box-shadow: var(--dash-focus-ring), var(--dash-shadow-inset-soft);
    }
    .dashboard-moc-chip--missing {
      --moc-chip-fill: color-mix(in srgb, rgba(239,68,68,.34) 42%, var(--dash-surface-raised) 58%);
      --moc-chip-ink: color-mix(in srgb, rgba(185,28,28,.92) 78%, var(--text-normal) 22%);
      border-style: solid;
      border-color: color-mix(in srgb, var(--moc-chip-accent) 44%, rgba(239,68,68,.36));
    }
    .theme-dark .dashboard-moc-chip--missing {
      --moc-chip-fill: color-mix(in srgb, rgba(248,113,113,.28) 38%, var(--dash-surface-raised) 62%);
      --moc-chip-ink: color-mix(in srgb, rgba(248,113,113,.88) 68%, var(--text-normal) 32%);
      border-color: color-mix(in srgb, var(--moc-chip-accent) 42%, rgba(248,113,113,.42));
    }
    .dashboard-moc-empty {
      font-size: .8em;
      line-height: 1.45;
      color: var(--text-muted);
      padding: 10px 12px;
      border-radius: var(--dash-radius);
      border: 1px dashed color-mix(in srgb, var(--background-modifier-border) 85%, rgba(99,102,241,.25));
      background: color-mix(in srgb, var(--background-primary) 96%, rgba(129,140,248,.06));
    }
    .dashboard-guide-card {
      border-radius: var(--dash-radius-card) ;
    }
    .dashboard-flat-section {
      margin: 8px 0 0;
      padding: 11px 12px 12px;
      border: 1px solid color-mix(in srgb, var(--background-modifier-border) 72%, rgba(99, 102, 241, 0.2));
      border-radius: var(--dash-radius);
      background: color-mix(in srgb, var(--background-primary) 94%, rgba(59, 130, 246, 0.055));
      box-shadow: 0 1px 0 color-mix(in srgb, var(--background-primary) 86%, white) inset;
    }
    .dashboard-section-title {
      position: relative;
      display: flex;
      align-items: center;
      gap: 7px;
      min-height: 28px;
      margin: 3px 0 10px;
      padding: 2px 2px 10px 14px;
      color: var(--dash-heading-text);
      font-size: 1.02em;
      font-weight: 800;
      letter-spacing: 0.01em;
      line-height: 1.25;
    }
    .dashboard-section-title::before {
      content: "";
      position: absolute;
      left: 0;
      top: 2px;
      bottom: 10px;
      width: 5px;
      border-radius: 6px;
      background: var(--dash-heading-accent);
    }
    .dashboard-section-title::after {
      content: "";
      position: absolute;
      left: 14px;
      bottom: 2px;
      width: 25%;
      min-width: 150px;
      max-width: calc(100% - 14px);
      border-bottom: 2px dashed var(--dash-heading-divider);
      pointer-events: none;
    }
    .theme-dark .dashboard-section-title::before {
      width: 3px;
      opacity: .52;
      background: color-mix(in srgb, var(--dash-heading-accent) 54%, var(--background-primary));
    }
    .theme-dark .dashboard-section-title::after {
      border-bottom: 1px solid color-mix(in srgb, var(--dash-heading-divider) 38%, transparent);
      opacity: .7;
    }
    .dashboard-panel-title {
      font-size: 1.02em ;
      font-weight: 800 ;
      color: var(--dash-heading-text) ;
      letter-spacing: 0.01em ;
      line-height: 1.25 ;
    }
    .dashboard-section-content {
      min-width: 0;
    }
    .dashboard-daily-state-date-segment {
      flex: 0 0 auto;
    }
    .dashboard-daily-state-date-button svg {
      width: 15px;
      height: 15px;
      stroke-width: 2;
    }
    .dashboard-daily-state-date::-webkit-calendar-picker-indicator {
      display: none;
      opacity: 0;
      width: 0;
      height: 0;
      margin: 0;
      padding: 0;
    }
    .dashboard-daily-state-date {
      width: 112px ;
      min-width: 112px ;
      padding-left: 7px ;
      padding-right: 7px ;
      appearance: none;
      -webkit-appearance: none;
    }
    .dashboard-inbox-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      padding: 5px var(--dash-row-x);
      min-height: 34px;
      border-radius: var(--dash-row-radius);
      background: transparent;
      border: none;
      border-bottom: none;
      box-shadow: none;
      transition: background .12s ease;
    }
    .theme-dark .dashboard-inbox-row {
      box-shadow: none;
    }
    .dashboard-inbox-row:hover {
      background: var(--dash-row-hover-bg);
    }
    .dashboard-inbox-row.is-structural-selected {
      background: color-mix(in srgb, var(--background-primary) 96%, var(--inbox-lane-accent, var(--interactive-accent)) 4%);
    }
    .dashboard-inbox-row[data-noria-action-state="pending"] {
      opacity: .68;
      cursor: progress;
    }
    .dashboard-inbox-row[data-noria-action-state="failed"] {
      background: color-mix(in srgb, var(--background-primary) 94%, var(--text-error, #dc2626) 6%);
      color: var(--text-normal);
    }
    .dashboard-inbox-row--clickable {
      cursor: pointer;
    }
    .dashboard-inbox-dashboard {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-height: 0;
      flex: 1 1 auto;
      overflow: hidden;
      --inbox-triage: #d89122;
      --inbox-review: #df7f59;
      --inbox-processing: #4e82d8;
      --inbox-closing: #38a77a;
      --inbox-trust: #7567c8;
      --inbox-quiet: #94a3b8;
    }
    .dashboard-inbox-lanes {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 4px 8px;
      flex-shrink: 0;
      padding: 0 2px 1px;
    }
    .dashboard-inbox-lane {
      --inbox-lane-accent: var(--interactive-accent);
      min-width: 0;
      min-height: calc(.82em * 1.25 + 6px);
      display: inline-flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      padding: 2px 5px;
      border-radius: 7px;
      border: none;
      background: transparent;
      color: var(--text-muted);
      font-size: .82em;
      line-height: 1.25;
      cursor: pointer;
      transition: background .14s ease, color .14s ease;
      box-shadow: none;
      appearance: none;
    }
    .dashboard-inbox-lane--triage { --inbox-lane-accent: var(--inbox-triage); }
    .dashboard-inbox-lane--review { --inbox-lane-accent: var(--inbox-review); }
    .dashboard-inbox-lane--review-due { --inbox-lane-accent: var(--inbox-review); }
    .dashboard-inbox-lane--processing { --inbox-lane-accent: var(--inbox-processing); }
    .dashboard-inbox-lane--closing { --inbox-lane-accent: var(--inbox-closing); }
    .dashboard-inbox-lane--ready { --inbox-lane-accent: var(--inbox-closing); }
    .dashboard-inbox-lane--trust { --inbox-lane-accent: var(--inbox-trust); }
    .dashboard-inbox-lane:hover {
      color: var(--text-normal);
      background: color-mix(in srgb, var(--background-primary) 96%, var(--inbox-lane-accent) 4%);
    }
    .dashboard-inbox-lane.is-active {
      color: color-mix(in srgb, var(--text-normal) 76%, var(--inbox-lane-accent));
      background: color-mix(in srgb, var(--background-primary) 93%, var(--inbox-lane-accent) 7%);
      box-shadow: none;
    }
    .dashboard-inbox-lane__label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 1em;
      font-weight: 620;
    }
    .dashboard-inbox-lane__count {
      font-size: 1em;
      font-weight: 760;
      font-variant-numeric: tabular-nums;
      color: var(--inbox-lane-accent);
      opacity: .9;
      min-width: 1.35em;
      text-align: right;
    }
    .dashboard-inbox-lane.is-active .dashboard-inbox-lane__count {
      opacity: 1;
      text-shadow: 0 0 .01px currentColor;
    }
    .dashboard-inbox-workbench-summary {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      row-gap: 2px;
      min-width: 0;
      padding: 0 2px 1px;
      color: var(--text-muted);
      font-size: .72em;
      line-height: 1.25;
      flex-shrink: 0;
    }
    .dashboard-inbox-workbench-summary__item {
      min-width: 0;
      white-space: nowrap;
      font-weight: 560;
      opacity: .86;
    }
    .dashboard-inbox-workbench-summary__item--overflow-action {
      color: color-mix(in srgb, var(--text-normal) 68%, var(--interactive-accent));
      cursor: pointer;
      text-underline-offset: 2px;
      font-weight: 640;
      opacity: .92;
    }
    .dashboard-inbox-workbench-summary__item--overflow-action:hover,
    .dashboard-inbox-workbench-summary__item--overflow-action:focus-visible {
      color: color-mix(in srgb, var(--text-normal) 54%, var(--interactive-accent));
      outline: none;
    }
    .dashboard-inbox-workbench-summary__item:not(:first-child)::before {
      content: "·";
      margin-right: 8px;
      color: var(--text-muted);
      opacity: .36;
    }
    .dashboard-inbox-structural-panel {
      display: grid;
      grid-template-columns: minmax(0, 1.3fr) minmax(8rem, .9fr);
      grid-template-areas:
        "head target"
        "handoffs handoffs"
        "actions checks";
      align-items: center;
      gap: 5px 12px;
      min-width: 0;
      padding: 7px 10px;
      border: 1px solid color-mix(in srgb, var(--background-modifier-border) 72%, var(--inbox-closing) 18%);
      border-radius: 11px;
      background: color-mix(in srgb, var(--background-primary) 97%, var(--inbox-closing) 3%);
      color: var(--text-muted);
      box-shadow: none;
      flex-shrink: 0;
    }
    .dashboard-inbox-structural-panel[hidden] {
      display: none;
    }
    .dashboard-inbox-structural-panel__head {
      grid-area: head;
      min-width: 0;
      display: flex;
      align-items: baseline;
      gap: 7px;
    }
    .dashboard-inbox-structural-panel__state {
      flex: 0 0 auto;
      color: color-mix(in srgb, var(--text-normal) 68%, var(--inbox-closing));
      font-size: .74em;
      line-height: 1.2;
      font-weight: 720;
    }
    .dashboard-inbox-structural-panel__title {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--text-normal);
      font-size: .84em;
      line-height: 1.25;
      font-weight: 680;
    }
    .dashboard-inbox-structural-panel__target {
      grid-area: target;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      justify-self: end;
      max-width: 100%;
      color: var(--text-muted);
      font-size: .74em;
      line-height: 1.22;
      font-weight: 540;
      opacity: .9;
    }
    .dashboard-inbox-structural-panel__actions,
    .dashboard-inbox-structural-panel__checks,
    .dashboard-inbox-structural-panel__handoffs {
      min-width: 0;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 4px 6px;
    }
    .dashboard-inbox-structural-panel__handoffs {
      grid-area: handoffs;
      gap: 3px 12px;
      padding-top: 1px;
    }
    .dashboard-inbox-structural-panel__handoff {
      display: inline-flex;
      align-items: baseline;
      gap: 5px;
      min-width: 0;
      max-width: 100%;
      padding: 0;
      border: none;
      border-radius: 0;
      background: transparent;
      color: var(--text-muted);
      box-shadow: none;
      font-size: .72em;
      line-height: 1.2;
      font-weight: 560;
      white-space: nowrap;
    }
    .dashboard-inbox-structural-panel__handoff[data-noria-inbox-structural-target-state="openable"] {
      color: color-mix(in srgb, var(--inbox-closing) 74%, var(--text-normal));
      cursor: pointer;
    }
    .dashboard-inbox-structural-panel__handoff[data-noria-inbox-structural-target-state="openable"] .dashboard-inbox-structural-panel__handoff-path {
      border-bottom: 1px solid color-mix(in srgb, var(--inbox-closing) 34%, transparent);
    }
    .dashboard-inbox-structural-panel__handoff[data-noria-inbox-structural-target-state="openable"]:hover .dashboard-inbox-structural-panel__handoff-path,
    .dashboard-inbox-structural-panel__handoff[data-noria-inbox-structural-target-state="openable"]:focus-visible .dashboard-inbox-structural-panel__handoff-path {
      border-bottom-color: color-mix(in srgb, var(--inbox-closing) 62%, transparent);
    }
    .dashboard-inbox-structural-panel__handoff[data-noria-inbox-structural-target-state="missing"] {
      opacity: .72;
    }
    .dashboard-inbox-structural-panel__handoff[data-noria-action-state="pending"] {
      opacity: .62;
      pointer-events: none;
    }
    .dashboard-inbox-structural-panel__handoff[data-noria-action-state="failed"] {
      color: var(--text-error);
    }
    .dashboard-inbox-structural-panel__handoff-label {
      flex: 0 0 auto;
      color: var(--text-muted);
      opacity: .9;
    }
    .dashboard-inbox-structural-panel__handoff-path {
      min-width: 0;
      max-width: 16rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: inherit;
    }
    .dashboard-inbox-structural-panel__actions {
      grid-area: actions;
    }
    .dashboard-inbox-structural-panel__checks {
      grid-area: checks;
      justify-content: flex-end;
    }
    .dashboard-inbox-structural-panel__action {
      display: inline-flex;
      align-items: center;
      max-width: 100%;
      padding: 0;
      border: none;
      border-radius: 0;
      background: transparent;
      color: color-mix(in srgb, var(--text-normal) 70%, var(--inbox-closing));
      box-shadow: none;
      font-size: .74em;
      line-height: 1.22;
      font-weight: 680;
      white-space: nowrap;
    }
    .dashboard-inbox-structural-panel__action:not(:first-child)::before {
      content: "->";
      margin: 0 6px 0 0;
      color: var(--text-muted);
      opacity: .5;
      font-weight: 520;
    }
    .dashboard-inbox-structural-panel__check {
      display: inline-flex;
      align-items: center;
      max-width: 100%;
      padding: 0;
      border: none;
      border-radius: 0;
      background: transparent;
      color: var(--text-muted);
      box-shadow: none;
      font-size: .72em;
      line-height: 1.2;
      font-weight: 560;
      white-space: nowrap;
      opacity: .88;
    }
    .dashboard-inbox-structural-panel__check::before {
      content: "";
      width: 4px;
      height: 4px;
      margin-right: 5px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--inbox-closing) 64%, var(--text-muted));
      opacity: .72;
    }
    .dashboard-inbox-structural-panel__confirm {
      display: inline-flex;
      align-items: center;
      width: max-content;
      max-width: 100%;
      margin-left: 2px;
      color: color-mix(in srgb, var(--inbox-closing) 82%, var(--text-normal));
      border-bottom: 1px solid color-mix(in srgb, var(--inbox-closing) 42%, transparent);
      font-size: .74em;
      line-height: 1.22;
      font-weight: 720;
      white-space: nowrap;
      cursor: pointer;
    }
    .dashboard-inbox-structural-panel__confirm:hover,
    .dashboard-inbox-structural-panel__confirm:focus-visible {
      color: color-mix(in srgb, var(--inbox-closing) 92%, var(--text-normal));
      border-bottom-color: color-mix(in srgb, var(--inbox-closing) 68%, transparent);
      outline: none;
    }
    .dashboard-inbox-structural-panel__confirm[data-noria-action-state="pending"] {
      opacity: .62;
      pointer-events: none;
    }
    .dashboard-inbox-structural-panel__confirm[data-noria-action-state="failed"] {
      color: var(--text-error);
      border-bottom-color: color-mix(in srgb, var(--text-error) 54%, transparent);
    }
    .dashboard-inbox-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      border: 1px solid color-mix(in srgb, var(--background-modifier-border) 78%, rgba(99,102,241,.18));
      border-radius: 11px;
      padding: 8px 10px;
      background: color-mix(in srgb, var(--background-primary) 98%, rgba(59,130,246,.02));
    }
    .dashboard-inbox-row__main {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      min-width: 0;
      flex: 1 1 auto;
    }
    .dashboard-inbox-row__icon {
      flex-shrink: 0;
      margin-top: 1px;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 7px;
      color: var(--text-muted);
      background: transparent;
    }
    .dashboard-inbox-row__icon--triage {
      color: var(--inbox-triage);
      background: color-mix(in srgb, var(--background-primary) 86%, var(--inbox-triage) 14%);
    }
    .dashboard-inbox-row--triage {
      --inbox-lane-accent: var(--inbox-triage);
    }
    .dashboard-inbox-row__icon--review {
      color: var(--inbox-review);
      background: color-mix(in srgb, var(--background-primary) 86%, var(--inbox-review) 14%);
    }
    .dashboard-inbox-row__icon--review-due {
      color: var(--inbox-review);
      background: color-mix(in srgb, var(--background-primary) 86%, var(--inbox-review) 14%);
    }
    .dashboard-inbox-row--review,
    .dashboard-inbox-row--review-due {
      --inbox-lane-accent: var(--inbox-review);
    }
    .dashboard-inbox-row__icon--processing {
      color: var(--inbox-processing);
      background: color-mix(in srgb, var(--background-primary) 86%, var(--inbox-processing) 14%);
    }
    .dashboard-inbox-row--processing {
      --inbox-lane-accent: var(--inbox-processing);
    }
    .dashboard-inbox-row__icon--closing {
      color: var(--inbox-closing);
      background: color-mix(in srgb, var(--background-primary) 86%, var(--inbox-closing) 14%);
    }
    .dashboard-inbox-row__icon--ready {
      color: var(--inbox-closing);
      background: color-mix(in srgb, var(--background-primary) 86%, var(--inbox-closing) 14%);
    }
    .dashboard-inbox-row--closing,
    .dashboard-inbox-row--ready {
      --inbox-lane-accent: var(--inbox-closing);
    }
    .dashboard-inbox-row__icon--trust {
      color: var(--inbox-trust);
      background: color-mix(in srgb, var(--background-primary) 86%, var(--inbox-trust) 14%);
    }
    .dashboard-inbox-row--trust {
      --inbox-lane-accent: var(--inbox-trust);
    }
    .dashboard-inbox-row__icon--quiet {
      color: var(--text-muted);
      background: color-mix(in srgb, var(--background-primary) 90%, var(--inbox-quiet) 10%);
    }
    .dashboard-inbox-row--quiet {
      --inbox-lane-accent: var(--inbox-quiet);
    }
    .dashboard-inbox-row--rhythm-now {
      --inbox-rhythm-accent: var(--inbox-lane-accent, var(--inbox-triage));
    }
    .dashboard-inbox-row--rhythm-next {
      --inbox-rhythm-accent: var(--inbox-closing);
    }
    .dashboard-inbox-row--rhythm-later {
      --inbox-rhythm-accent: var(--inbox-quiet);
    }
    .dashboard-inbox-row__icon svg {
      width: 14px;
      height: 14px;
      stroke-width: 2;
    }
    .dashboard-inbox-row__text {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .dashboard-inbox-row__titleline {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      max-width: 100%;
    }
    .dashboard-inbox-row__titleline > a {
      flex: 1 1 auto;
      min-width: 0;
    }
    .dashboard-inbox-row__rhythm {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      max-width: 38px;
      padding: 1px 5px;
      border-radius: 999px;
      color: color-mix(in srgb, var(--text-muted) 62%, var(--inbox-rhythm-accent, var(--inbox-lane-accent, var(--interactive-accent))));
      background: color-mix(in srgb, var(--background-primary) 92%, var(--inbox-rhythm-accent, var(--inbox-lane-accent, var(--interactive-accent))) 8%);
      border: 1px solid color-mix(in srgb, var(--background-modifier-border) 76%, var(--inbox-rhythm-accent, var(--inbox-lane-accent, var(--interactive-accent))) 18%);
      font-size: .7em;
      line-height: 1.45;
      font-weight: 680;
      letter-spacing: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .dashboard-inbox-row__preview {
      min-width: 0;
      color: var(--text-muted);
      font-size: .76em;
      line-height: 1.32;
      font-weight: 450;
      letter-spacing: 0;
      opacity: .86;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .dashboard-inbox-row__cue {
      display: flex;
      align-items: baseline;
      min-width: 0;
      max-width: 100%;
      gap: 5px;
      color: color-mix(in srgb, var(--text-normal) 72%, var(--inbox-lane-accent, var(--interactive-accent)));
      font-size: .78em;
      line-height: 1.26;
      font-weight: 610;
      letter-spacing: 0;
    }
    .dashboard-inbox-row__cue-label {
      flex: 0 0 auto;
      color: color-mix(in srgb, var(--text-muted) 72%, var(--inbox-lane-accent, var(--interactive-accent)));
      font-size: .92em;
      font-weight: 640;
    }
    .dashboard-inbox-row__cue-text {
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .dashboard-inbox-row__status-action {
      display: inline-flex;
      align-items: center;
      align-self: flex-start;
      width: max-content;
      max-width: 100%;
      margin-top: 1px;
      color: color-mix(in srgb, var(--inbox-lane-accent, var(--interactive-accent)) 78%, var(--text-normal));
      border-bottom: 1px solid color-mix(in srgb, var(--inbox-lane-accent, var(--interactive-accent)) 38%, transparent);
      font-size: .77em;
      font-weight: 650;
      line-height: 1.3;
      letter-spacing: 0;
      cursor: pointer;
      white-space: nowrap;
    }
    .dashboard-inbox-row__status-action:hover,
    .dashboard-inbox-row__status-action:focus-visible {
      color: color-mix(in srgb, var(--inbox-lane-accent, var(--interactive-accent)) 90%, var(--text-normal));
      border-bottom-color: color-mix(in srgb, var(--inbox-lane-accent, var(--interactive-accent)) 62%, transparent);
      outline: none;
    }
    .dashboard-inbox-row__status-action[data-noria-action-state="pending"] {
      opacity: .62;
      pointer-events: none;
    }
    .dashboard-inbox-row__status-action[data-noria-action-state="failed"] {
      color: var(--text-error);
      border-bottom-color: color-mix(in srgb, var(--text-error) 54%, transparent);
    }
    .dashboard-inbox-row:last-child {
      border-bottom: none;
    }
    /* Inbox 标题与主页任务/项目条统一，避免因链接默认样式显得突兀 */
    .dashboard-inbox-row a.dashboard-task-title--link {
      color: var(--text-normal) ;
      box-shadow: none ;
      background-image: none ;
      font-family: inherit;
      font-size: var(--dash-text-row-size, .86em) ;
      line-height: var(--dash-text-row-line, 1.25) ;
      font-weight: var(--dash-text-row-weight, 500) ;
      letter-spacing: 0;
    }
    .dashboard-inbox-row a.dashboard-task-title--link:hover {
      color: var(--text-normal) ;
    }
    .dashboard-inbox-row a.dashboard-task-title--link[data-noria-action-state="pending"] {
      opacity: .68;
      cursor: progress;
    }
    .dashboard-inbox-row a.dashboard-task-title--link[data-noria-action-state="failed"] {
      color: var(--text-error) ;
    }
    .dashboard-inbox-row__meta {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 2px 0;
      min-width: 0;
      color: var(--text-muted);
      font-size: .72em;
      line-height: 1.25;
      font-weight: 500;
      letter-spacing: 0;
    }
    .dashboard-inbox-row__meta-item {
      display: inline-flex;
      align-items: center;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      opacity: .84;
    }
    .dashboard-inbox-row__meta-item:not(:first-child)::before {
      content: "·";
      flex: 0 0 auto;
      margin: 0 5px;
      color: color-mix(in srgb, var(--text-muted) 62%, transparent);
      opacity: .78;
    }
    .dashboard-inbox-row__meta-stage {
      color: color-mix(in srgb, var(--text-muted) 82%, var(--inbox-lane-accent, var(--interactive-accent)));
      font-weight: 640;
    }
    .dashboard-inbox-row__meta-next {
      flex: 1 1 10rem;
    }
    .dashboard-inbox-row__meta-attention {
      color: color-mix(in srgb, var(--text-muted) 70%, var(--inbox-lane-accent, var(--interactive-accent)));
      font-weight: 620;
    }
    .dashboard-inbox-row__meta-need {
      color: color-mix(in srgb, var(--text-normal) 62%, var(--inbox-lane-accent, var(--interactive-accent)));
      font-weight: 680;
      background: transparent;
      border: none;
      box-shadow: none;
    }
    .dashboard-inbox-pill,
    .dashboard-inbox-meta {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      flex-shrink: 0;
      padding: 0;
      border-radius: 0;
      font-size: .72em;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.02em;
      color: var(--text-muted);
      background: transparent;
      border: none;
      box-shadow: none;
      opacity: 0.88;
      cursor: pointer;
    }
    .dashboard-inbox-meta__icon,
    .dashboard-inbox-meta__icon svg {
      width: 12px;
      height: 12px;
      display: inline-flex;
    }
    .dashboard-inbox-row__side {
      display: inline-flex;
      align-items: center;
      justify-content: flex-end;
      gap: 0;
      min-width: 34px;
      flex: 0 0 auto;
      font-variant-numeric: tabular-nums;
      padding-top: 2px;
    }
    .dashboard-inbox-date {
      color: var(--text-muted);
      font-size: .72em;
      font-weight: 500;
      white-space: nowrap;
      opacity: .82;
    }
    .dashboard-guide-inbox .dashboard-inbox-row__side {
      display: none;
    }
    .dashboard-guide-inbox .dashboard-inbox-list {
      padding: 6px 8px;
    }
    .dashboard-guide-inbox .dashboard-inbox-row {
      min-height: 28px;
      padding: 4px 2px;
      align-items: center;
    }
    .dashboard-guide-inbox .dashboard-inbox-row__text {
      gap: 0;
    }
    .dashboard-guide-inbox .dashboard-inbox-row__cue,
    .dashboard-guide-inbox .dashboard-inbox-row__preview,
    .dashboard-guide-inbox .dashboard-inbox-row__meta,
    .dashboard-guide-inbox .dashboard-inbox-row__status-action {
      display: none;
    }
    @media (max-width: 720px) {
      .dashboard-inbox-lanes {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .dashboard-inbox-row__side {
        gap: 5px;
      }
      .dashboard-inbox-date {
        display: none;
      }
      .dashboard-inbox-row__meta {
        font-size: .74em;
      }
    }
    .dashboard-weak-details {
      margin-top: 10px;
      flex-shrink: 0;
      border-top: 1px solid rgba(99,102,241,.12);
      padding-top: 8px;
      min-width: 0;
    }
    .dashboard-weak-details > summary {
      cursor: pointer;
      font-size: .78em;
      font-weight: 650;
      color: var(--text-muted);
      user-select: none;
      padding: 4px 0 6px;
      line-height: 1.4;
      list-style-position: outside;
    }
    .dashboard-weak-details > summary:hover {
      color: var(--text-normal);
    }
    .dashboard-weak-links {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 14px;
      padding: 6px 0 4px;
      align-items: center;
    }
    .dashboard-weak-links a.internal-link {
      font-size: .84em;
      font-weight: 650;
      padding: 4px 10px;
      border-radius: 8px;
      background: rgba(99,102,241,.08);
      border: 1px solid rgba(99,102,241,.2);
      color: rgba(67,56,202,.95) ;
      transition: background .12s ease, border-color .12s ease;
    }
    .dashboard-weak-links a.internal-link:hover {
      background: rgba(99,102,241,.14);
      border-color: rgba(79,70,229,.32);
    }
    .dashboard-gdd-panel {
      padding: 10px 11px 10px;
      border-radius: 12px;
      background: var(--dash-surface-raised);
      border: 1px solid rgba(99,102,241,.16);
      flex-shrink: 0;
    }
    .dashboard-gdd-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 6px;
    }
    .dashboard-gdd-title {
      font-weight: 780;
      font-size: .9em;
      color: rgba(30,64,175,.94);
      letter-spacing: .02em;
    }
    .dashboard-gdd-path {
      font-size: .66em;
      font-family: var(--font-monospace-theme), var(--font-monospace), monospace;
      color: var(--text-muted);
      opacity: .88;
      margin-bottom: 8px;
      word-break: break-all;
      line-height: 1.35;
    }
    .dashboard-gdd-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 6px 10px;
    }
    @media (min-width: 520px) {
      .dashboard-gdd-grid { grid-template-columns: 1fr 1fr; }
      .dashboard-gdd-grid .dashboard-gdd-field--full { grid-column: 1 / -1; }
    }
    .dashboard-gdd-field__label {
      font-size: .74em;
      font-weight: 650;
      color: var(--text-muted);
      margin: 4px 0 3px;
    }
    .dashboard-gdd-textarea {
      width: 100%;
      min-height: 46px;
      resize: vertical;
      font-size: .82em;
      line-height: 1.38;
      padding: 7px 9px;
      border-radius: 9px;
      border: 1px solid rgba(99,102,241,.22);
      background: var(--background-primary);
      color: var(--text-normal);
      box-sizing: border-box;
      transition: border-color .15s ease, box-shadow .15s ease;
    }
    .dashboard-gdd-textarea:focus {
      border-color: rgba(79,70,229,.45);
      box-shadow: 0 0 0 2px rgba(99,102,241,.15);
      outline: none;
    }
    .dashboard-gdd-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 12px;
      margin-top: 10px;
    }
    .dashboard-btn-primary {
      padding: 6px 14px;
      border-radius: 9px;
      border: 1px solid rgba(67,56,202,.38);
      background: color-mix(in srgb, var(--dash-surface) 80%, rgba(99,102,241,.24));
      font-size: .8em;
      font-weight: 700;
      cursor: pointer;
      color: var(--text-normal);
      transition: filter .12s ease, transform .08s ease;
      box-shadow: 0 1px 0 rgba(255,255,255,.25) inset;
    }
    .dashboard-btn-primary:hover:not(:disabled) {
      filter: brightness(1.05);
    }
    .dashboard-btn-primary:active:not(:disabled) {
      transform: scale(0.98);
    }
    .dashboard-btn-primary:disabled {
      opacity: 0.6;
      cursor: wait;
    }
    .dashboard-btn-ghost {
      padding: 5px 11px;
      border-radius: 8px;
      border: 1px solid color-mix(in srgb, var(--background-modifier-border) 80%, rgba(99,102,241,.25));
      background: color-mix(in srgb, var(--background-primary) 92%, rgba(99,102,241,.04));
      font-size: .78em;
      font-weight: 650;
      cursor: pointer;
      color: var(--text-muted);
    }
    .dashboard-btn-ghost:hover {
      color: var(--text-normal);
      border-color: rgba(99,102,241,.28);
    }
    .dashboard-gdd-hint {
      font-size: .72em;
      color: var(--text-muted);
      line-height: 1.4;
      flex: 1 1 160px;
    }
    @keyframes dashboard-recap-pane-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    /* 今日复盘：纯文字步骤；路径 hover 面板 */
    /* 复盘整体：不再用外框包「步骤条 + 右侧编辑区」；输入/textarea 自身边框保留在各自规则里 */
    .dashboard-recap-panel {
      container-type: inline-size;
      display: flex;
      flex-direction: column;
      gap: 7px;
      min-height: 0;
      max-height: 100%;
      padding: 8px 2px 8px 0;
      border-radius: 0;
      background: transparent;
      border: none;
      box-shadow: none;
      box-sizing: border-box;
    }
    .theme-dark .dashboard-recap-panel {
      box-shadow: none;
      border: none;
      background: transparent;
    }
    .dashboard-recap-inline-input {
      display: flex;
      align-items: stretch;
      gap: 8px;
      width: 100%;
      min-width: 0;
    }
    .dashboard-recap-inline-input .dashboard-recap-input {
      flex: 1 1 auto;
      min-width: 0;
    }
    button.dashboard-recap-icon-submit {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 38px;
      min-height: 36px;
      padding: 0;
      border-radius: 9px;
      border: 1px solid rgba(67,56,202,.32);
      background: color-mix(in srgb, var(--dash-surface) 80%, rgba(99,102,241,.24));
      color: var(--text-normal);
      cursor: pointer;
      box-shadow: 0 1px 0 rgba(255,255,255,.22) inset;
      transition: filter .12s ease, transform .08s ease;
    }
    button.dashboard-recap-icon-submit svg {
      width: 18px;
      height: 18px;
      stroke-width: 2.2;
    }
    button.dashboard-recap-icon-submit:hover:not(:disabled) {
      filter: brightness(1.06);
    }
    button.dashboard-recap-icon-submit:active:not(:disabled) {
      transform: scale(0.97);
    }
    button.dashboard-recap-icon-submit:focus-visible {
      outline: none;
      box-shadow: var(--dash-focus-ring), 0 1px 0 rgba(255,255,255,.22) inset;
    }
    @media (prefers-reduced-motion: reduce) {
      button.dashboard-recap-icon-submit:active:not(:disabled) { transform: none; }
    }
    .dashboard-recap-body {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 10px;
      min-height: 0;
      flex: 1 1 auto;
      /* stretch 让右列能吃满行高以便垂直居中；左列单独 align-self:center 避免被拉高 */
      align-items: stretch;
    }
    .dashboard-recap-body > .dashboard-recap-steps--vertical {
      align-self: center;
    }
    .dashboard-recap-steps {
      flex-shrink: 0;
      display: flex;
      flex-wrap: nowrap;
      gap: 4px;
      overflow-x: auto;
      overflow-y: visible;
      padding: 2px 0 3px;
    }
    .dashboard-recap-steps--vertical {
      display: grid;
      /* auto 行高：固定按钮高度，避免 1fr 在定高容器里被撑开导致裁切/滚动错觉 */
      grid-template-columns: 34px max-content;
      grid-template-rows: repeat(3, auto);
      align-items: stretch;
      justify-content: start;
      gap: 5px 7px;
      overflow: visible;
      padding: 0;
      width: max-content;
      max-width: 100%;
      border-radius: 0;
      background: transparent;
      border: none;
    }
    button.dashboard-recap-step {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex: 0 0 auto;
      justify-content: center;
      min-height: 30px;
      padding: 0 10px;
      border-radius: 9px;
      border: none;
      background: transparent;
      color: var(--text-muted);
      font-size: clamp(12px, 0.82rem, 14px);
      font-weight: 660;
      cursor: pointer;
      transition: background .14s ease, color .14s ease, box-shadow .14s ease, transform .08s ease;
    }
    .dashboard-recap-steps--vertical button.dashboard-recap-step:nth-child(2),
    .dashboard-recap-steps--vertical button.dashboard-recap-step:nth-child(3),
    .dashboard-recap-steps--vertical button.dashboard-recap-step:nth-child(4) {
      justify-content: center;
      padding: 0;
      min-width: 36px;
      width: 36px;
      min-height: 36px;
      height: 36px;
      border-radius: 10px;
      font-size: clamp(11px, 0.76rem, 13px);
      font-weight: 680;
      line-height: 1.12;
      letter-spacing: 0.02em;
    }
    .dashboard-recap-steps--vertical button.dashboard-recap-step--inbox {
      grid-column: 1;
      grid-row: 1 / span 3;
      flex-direction: column;
      gap: 0;
      min-height: 0;
      height: 100%;
      padding: 0;
      border-radius: 10px;
      background: color-mix(in srgb, var(--background-primary) 94%, rgba(59,130,246,.06));
    }
    .dashboard-recap-step__icon {
      width: 18px;
      height: 18px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      opacity: .9;
    }
    .dashboard-recap-step__icon svg {
      width: 18px;
      height: 18px;
      stroke-width: 2;
    }
    .dashboard-recap-steps--vertical button.dashboard-recap-step--inbox .dashboard-recap-step__label {
      display: none;
    }
    button.dashboard-recap-step .dashboard-recap-step__label {
      white-space: nowrap;
      letter-spacing: .02em;
    }
    button.dashboard-recap-step:hover:not(:disabled) {
      color: var(--text-normal);
      background: color-mix(in srgb, var(--background-primary) 90%, rgba(59,130,246,.1));
    }
    button.dashboard-recap-step:active:not(:disabled) {
      transform: scale(0.97);
    }
    button.dashboard-recap-step:focus-visible {
      outline: none;
      box-shadow: var(--dash-focus-ring);
    }
    button.dashboard-recap-step.is-active {
      background: color-mix(in srgb, var(--background-primary) 82%, rgba(59,130,246,.2));
      color: var(--dash-title-color);
      box-shadow: inset 4px 0 0 rgba(37,99,235,.55);
    }
    .dashboard-recap-steps--vertical button.dashboard-recap-step--inbox.is-active {
      background: color-mix(in srgb, var(--background-primary) 88%, rgba(59,130,246,.14));
      box-shadow: inset 0 0 0 1px color-mix(in srgb, rgba(59,130,246,.22), transparent);
    }
    .theme-dark button.dashboard-recap-step.is-active {
      color: color-mix(in srgb, var(--text-normal) 90%, rgba(99,102,241,.24));
      background: color-mix(in srgb, var(--background-primary) 78%, rgba(59,130,246,.22));
      box-shadow: inset 4px 0 0 rgba(129,140,248,.45);
    }
    .theme-dark .dashboard-recap-steps--vertical button.dashboard-recap-step--inbox.is-active {
      box-shadow: inset 0 0 0 1px color-mix(in srgb, rgba(129,140,248,.28), transparent);
    }
    .dashboard-recap-pane-wrap {
      flex: 1 1 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: safe center;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 2px 0 2px 6px;
      -webkit-overflow-scrolling: touch;
      border-radius: 0;
      border: none;
      background: transparent;
    }
    @media (max-width: 760px) {
      .dashboard-recap-body {
        grid-template-columns: 1fr;
        gap: 6px;
      }
      .dashboard-recap-steps--vertical {
        width: auto;
        flex-direction: row;
        display: flex;
        overflow-x: auto;
        gap: 6px;
        padding: 2px 0;
      }
      .dashboard-recap-steps--vertical button.dashboard-recap-step--inbox {
        min-height: 30px;
        flex-direction: row;
        gap: 6px;
        padding: 0 10px;
      }
    }
    .dashboard-recap-pane {
      display: flex;
      flex-direction: column;
      gap: 9px;
      flex: 1 1 auto;
      min-height: 0;
      padding-top: 2px;
      animation: dashboard-recap-pane-in .14s ease-out both;
    }
    .dashboard-recap-pane .dashboard-recap-inline-input {
      min-height: 36px;
    }
    .dashboard-recap-pane > .dashboard-gdd-textarea {
      min-height: 3.5rem;
      max-height: 9rem;
      padding: 9px 11px;
      font-size: .82em;
      line-height: 1.45;
      border-radius: 10px;
      resize: vertical;
    }
    @media (prefers-reduced-motion: reduce) {
      .dashboard-recap-pane { animation: none; }
      button.dashboard-recap-step:active:not(:disabled) { transform: none; }
      button.dashboard-recap-pill:active { transform: none; }
    }
    .dashboard-recap-hint {
      font-size: .72em;
      color: var(--text-muted);
      line-height: 1.4;
    }
    .dashboard-recap-input {
      width: 100%;
      box-sizing: border-box;
      height: 34px;
      padding: 0 11px;
      border-radius: 9px;
      border: 1px solid rgba(99,102,241,.22);
      background: var(--background-primary);
      color: var(--text-normal);
      font-size: .84em;
    }
    .dashboard-recap-input:focus {
      border-color: rgba(79,70,229,.45);
      outline: none;
      box-shadow: 0 0 0 2px rgba(99,102,241,.12);
    }
    .dashboard-recap-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
    }
    .dashboard-recap-actions .dashboard-btn-primary {
      min-height: 30px;
      padding: 0 12px;
      border-radius: 9px;
      font-size: .8em;
      font-weight: 700;
    }
    .dashboard-recap-save-split {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: start;
      gap: 8px;
      min-width: 0;
    }
    .dashboard-recap-save-split--fill {
      flex: 1 1 auto;
      height: 100%;
      min-height: 0;
      align-items: stretch;
    }
    .dashboard-recap-pane--inbox,
    .dashboard-recap-pane--thought {
      min-height: 100%;
      height: 100%;
    }
    .dashboard-recap-pane--inbox .dashboard-recap-save-split--fill,
    .dashboard-recap-pane--thought .dashboard-recap-save-split--fill {
      height: 100%;
    }
    .dashboard-recap-fill-main {
      min-width: 0;
      min-height: 0;
      height: 100%;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .dashboard-recap-save-rail {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      gap: 6px;
      padding-top: 1px;
    }
    button.dashboard-recap-icon-submit--rail {
      width: 36px;
      min-width: 36px;
      height: 36px;
      border-radius: 9px;
      padding: 0;
      flex: 0 0 auto;
    }
    .dashboard-recap-state-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      justify-content: stretch;
      gap: 8px 10px;
      align-content: center;
      align-items: stretch;
      overflow: visible;
    }
    .dashboard-recap-state-grid > .dashboard-recap-state-card {
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
    }
    @media (max-width: 520px) {
      .dashboard-recap-state-grid { grid-template-columns: 1fr; }
      .dashboard-recap-state-row { align-items: center; }
      .dashboard-recap-state-row .dashboard-recap-pills,
      .dashboard-recap-state-row .dashboard-recap-energy { flex: 0 0 auto; }
      .dashboard-recap-save-split {
        grid-template-columns: 1fr;
      }
      .dashboard-recap-save-rail {
        align-items: flex-end;
        padding-top: 0;
      }
    }
    .dashboard-recap-state-card {
      border: none;
      border-radius: 8px;
      padding: 6px 4px;
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      min-height: 40px;
    }
    .dashboard-recap-state-row {
      display: flex;
      align-items: center;
      gap: 8px 10px;
      flex-wrap: nowrap;
      min-width: 0;
      width: 100%;
    }
    .dashboard-recap-state-title-inline {
      font-size: 0.8rem;
      font-weight: 650;
      color: color-mix(in srgb, var(--text-normal) 58%, var(--text-muted) 42%);
      letter-spacing: 0.03em;
      flex: 0 0 auto;
      flex-shrink: 0;
      margin: 0;
      line-height: 1;
      opacity: 1;
      padding: 0;
      white-space: nowrap;
      display: inline-flex;
      align-items: center;
      justify-content: flex-start;
      min-height: var(--recap-state-hit, 32px);
    }
    .dashboard-recap-state-row .dashboard-recap-pills,
    .dashboard-recap-state-row .dashboard-recap-energy {
      flex: 1 1 0;
      min-width: 0;
      align-self: center;
    }
    .dashboard-recap-state-title {
      font-size: .64em;
      font-weight: 750;
      color: var(--text-muted);
      margin: 0 0 3px;
      letter-spacing: .02em;
    }
    .dashboard-recap-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 2px;
      align-items: center;
    }
    .dashboard-recap-pills--hscroll {
      flex-wrap: nowrap;
      overflow-x: auto;
      overflow-y: hidden;
      -webkit-overflow-scrolling: touch;
      gap: 5px;
      padding: 0 0 1px;
      align-items: center;
    }
    button.dashboard-daily-state-picker-button {
      box-sizing: border-box;
      border: 0;
      box-shadow: none;
      background: transparent;
      color: var(--text-normal);
      transition: background .12s ease, transform .08s ease, color .12s ease;
    }
    button.dashboard-daily-state-picker-button:hover:not(.is-active):not(.is-on) {
      background: color-mix(in srgb, var(--background-primary) 82%, rgba(99,102,241,.1));
    }
    button.dashboard-daily-state-picker-button:active {
      transform: scale(0.96);
    }
    button.dashboard-daily-state-picker-button[data-noria-action-state="pending"] {
      opacity: .58;
      cursor: wait;
      background: color-mix(in srgb, var(--interactive-accent) 10%, transparent);
    }
    button.dashboard-daily-state-picker-button[data-noria-action-state="failed"] {
      color: var(--text-error);
      background: color-mix(in srgb, var(--text-error) 10%, transparent);
    }
    button.dashboard-daily-state-picker-button.is-active,
    button.dashboard-daily-state-picker-button.is-on {
      background: color-mix(in srgb, var(--interactive-accent) 14%, transparent);
    }
    button.dashboard-daily-state-picker-button:focus-visible {
      outline: none;
      box-shadow: var(--dash-focus-ring);
    }
    button.dashboard-recap-pill {
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: color-mix(in srgb, var(--background-primary) 94%, rgba(99,102,241,.04));
      color: var(--text-normal);
      border-radius: var(--recap-state-radius, 8px);
      padding: 0;
      flex: 0 0 auto;
      width: var(--recap-state-hit, 32px);
      height: var(--recap-state-hit, 32px);
      min-width: var(--recap-state-hit, 32px);
      min-height: var(--recap-state-hit, 32px);
      font-size: 1.05rem;
      line-height: 1;
      cursor: pointer;
      transition: background .12s ease, box-shadow .12s ease, transform .08s ease;
    }
    button.dashboard-recap-pill:hover:not(.is-active) {
      background: color-mix(in srgb, var(--background-primary) 88%, rgba(99,102,241,.1));
    }
    button.dashboard-recap-pill:active {
      transform: scale(0.96);
    }
    button.dashboard-recap-pill.is-active {
      background: var(--recap-state-active-bg, rgba(59, 130, 246, 0.2));
      font-weight: 700;
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--recap-state-active-bd, rgba(37, 99, 235, 0.55)) 70%, transparent), var(--recap-state-active-inset, 0 1px 0 rgba(255,255,255,.22) inset);
    }
    button.dashboard-recap-pill:focus-visible {
      outline: none;
      box-shadow: var(--dash-focus-ring);
    }
    .dashboard-recap-energy {
      display: flex;
      gap: var(--recap-state-gap, 4px);
      flex-wrap: nowrap;
      align-items: center;
    }
    .dashboard-recap-energy--hscroll {
      overflow-x: auto;
      overflow-y: hidden;
      -webkit-overflow-scrolling: touch;
      padding: 0 0 1px;
      align-items: center;
    }
    button.dashboard-recap-energy-cell {
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      width: var(--recap-state-hit, 32px);
      height: var(--recap-state-hit, 32px);
      min-width: var(--recap-state-hit, 32px);
      min-height: var(--recap-state-hit, 32px);
      border-radius: var(--recap-state-radius, 8px);
      border: none;
      background: color-mix(in srgb, var(--background-primary) 94%, rgba(99,102,241,.04));
      color: var(--text-muted);
      font-size: 0.96rem;
      font-weight: 600;
      cursor: pointer;
      padding: 0;
      transition: background .12s ease, color .12s ease, box-shadow .12s ease, transform .08s ease;
    }
    .dashboard-recap-energy-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
      transform: translateY(-0.02em);
      filter: saturate(.85);
      opacity: .72;
      transition: filter .12s ease, opacity .12s ease;
    }
    button.dashboard-recap-energy-cell[data-energy-level="1"] .dashboard-recap-energy-icon {
      font-size: .88em;
      opacity: .78;
    }
    button.dashboard-recap-energy-cell:hover:not(.is-on) {
      color: var(--text-normal);
      background: color-mix(in srgb, var(--background-primary) 88%, rgba(99,102,241,.1));
    }
    button.dashboard-recap-energy-cell:hover:not(.is-on) .dashboard-recap-energy-icon {
      opacity: .9;
      filter: saturate(.95);
    }
    button.dashboard-recap-energy-cell.is-on {
      background: var(--recap-state-active-bg, rgba(59, 130, 246, 0.2));
      color: rgba(30, 64, 175, 0.92);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--recap-state-active-bd, rgba(37, 99, 235, 0.55)) 70%, transparent), var(--recap-state-active-inset, 0 1px 0 rgba(255,255,255,.22) inset);
    }
    button.dashboard-recap-energy-cell:focus-visible {
      outline: none;
      box-shadow: var(--dash-focus-ring);
    }
    button.dashboard-recap-energy-cell.is-on .dashboard-recap-energy-icon {
      opacity: 1;
      filter: saturate(1.05);
    }
    .dashboard-recap-gdd-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 8px;
      align-content: start;
    }
    .dashboard-recap-gdd-grid .dashboard-recap-gdd-full {
      grid-column: 1 / -1;
    }
    .dashboard-recap-gdd-grid .dashboard-gdd-field__label {
      font-size: .73em;
      font-weight: 700;
      margin: 2px 0 2px;
    }
    .dashboard-recap-gdd-grid .dashboard-gdd-textarea {
      min-height: 2.65rem;
      max-height: 6.75rem;
      line-height: 1.42;
      padding: 7px 10px;
      font-size: .78em;
      resize: vertical;
      box-sizing: border-box;
      border-radius: 10px;
      border: 1px solid color-mix(in srgb, var(--background-modifier-border) 78%, rgba(99,102,241,.24));
      background: var(--dash-surface);
      box-shadow: 0 1px 0 rgba(255,255,255,.5) inset;
      transition: border-color .14s ease, box-shadow .14s ease, background .14s ease;
    }
    .dashboard-recap-gdd-grid .dashboard-gdd-textarea::placeholder,
    .dashboard-recap-pane > .dashboard-gdd-textarea::placeholder {
      color: color-mix(in srgb, var(--text-muted) 86%, rgba(71,85,105,.34));
    }
    .dashboard-recap-gdd-grid .dashboard-gdd-textarea:focus,
    .dashboard-recap-pane > .dashboard-gdd-textarea:focus {
      border-color: rgba(79,70,229,.4);
      box-shadow: 0 0 0 2px rgba(99,102,241,.12), 0 1px 0 rgba(255,255,255,.58) inset;
      background: color-mix(in srgb, var(--background-primary) 97%, rgba(99,102,241,.055));
    }
    .dashboard-recap-pane--gdd .dashboard-recap-actions {
      flex-shrink: 0;
      justify-content: flex-end;
      align-items: center;
      gap: 8px;
      margin-top: 1px;
      padding-top: 3px;
      border-top: 1px solid color-mix(in srgb, var(--background-modifier-border) 75%, rgba(99,102,241,.12));
    }
    .dashboard-recap-gdd-save-hint {
      margin-right: auto;
      font-size: .66em;
      font-weight: 550;
      color: var(--text-muted);
      letter-spacing: .02em;
      line-height: 1.3;
      white-space: nowrap;
    }
    .dashboard-recap-pane--state {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      justify-content: safe center;
      min-height: 0;
      width: 100%;
      gap: 8px;
      overflow: visible;
      --recap-state-hit: 30px;
      --recap-state-radius: 9px;
      --recap-state-gap: 5px;
      --recap-state-preview-icons: 6;
      --recap-mood-preview-icons: 5;
      --recap-energy-icons: 5;
      --recap-state-edge: color-mix(in srgb, var(--background-modifier-border) 86%, rgba(59,130,246,.1));
      --recap-state-edge-hover: rgba(99,102,241,.3);
      --recap-state-active-bd: rgba(37, 99, 235, 0.62);
      --recap-state-active-bg: rgba(59, 130, 246, 0.14);
      --recap-state-active-inset: 0 1px 0 rgba(255,255,255,.28) inset;
    }
    .dashboard-recap-pane--state .dashboard-recap-state-grid {
      flex: 0 1 auto;
    }
    .dashboard-recap-pane--state .dashboard-recap-pills {
      gap: var(--recap-state-gap);
    }
    .dashboard-recap-pane--state .dashboard-recap-pills--hscroll {
      gap: var(--recap-state-gap);
    }
    /* 天气：默认无滚动条且单行裁切；仅悬停天气区域时展开 */
    .dashboard-recap-state-card--weather {
      overflow: visible;
      position: relative;
      justify-self: stretch;
      width: 100%;
    }
    .dashboard-recap-state-card--weather .dashboard-recap-state-row {
      overflow: visible;
      width: 100%;
    }
    .dashboard-recap-pills--weather {
      flex-wrap: nowrap;
      overflow-x: auto;
      overflow-y: hidden;
      gap: var(--recap-state-gap);
      flex: 1 1 auto;
      min-width: 0;
      width: 100%;
      max-width: 100%;
      transition: box-shadow .14s ease, background .14s ease;
      position: relative;
      z-index: 1;
    }
    .dashboard-recap-pills--mood {
      flex-wrap: nowrap;
      overflow-x: auto;
      overflow-y: hidden;
      gap: var(--recap-state-gap);
      flex: 1 1 auto;
      min-width: 0;
      width: 100%;
      max-width: 100%;
    }
    .dashboard-recap-state-card--weather:hover .dashboard-recap-pills--weather,
    .dashboard-recap-state-card--weather:focus-within .dashboard-recap-pills--weather {
      overflow-x: auto;
      z-index: 1;
      background: transparent;
      border-radius: 0;
      box-shadow: none;
    }
    /* 能量：默认长度与天气协调，多一个图标位 */
    .dashboard-recap-state-card--energy {
      overflow-x: visible;
      justify-self: stretch;
      width: 100%;
    }
    .dashboard-recap-state-card--energy .dashboard-recap-state-row {
      min-width: 0;
      width: 100%;
    }
    .dashboard-recap-state-card--energy .dashboard-recap-energy--compact {
      flex: 1 1 auto;
      min-width: 0;
      width: 100%;
      max-width: 100%;
    }
    .dashboard-recap-state-card--mood {
      justify-self: stretch;
      width: 100%;
    }
    .dashboard-recap-state-card--mood .dashboard-recap-state-row {
      width: 100%;
    }
    .theme-dark .dashboard-recap-pane--state {
      --recap-state-edge: color-mix(in srgb, var(--background-modifier-border) 78%, rgba(99,102,241,.16));
      --recap-state-active-bg: color-mix(in srgb, rgba(59, 130, 246, 0.22) 55%, transparent);
      --recap-state-active-inset: none;
    }
    .theme-dark button.dashboard-recap-energy-cell.is-on {
      color: color-mix(in srgb, var(--text-normal) 88%, rgba(165,180,252,.28));
    }
    .dashboard-recap-pane--gdd {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      justify-content: safe center;
      min-height: 0;
      width: 100%;
      gap: 7px;
    }
    .dashboard-recap-pane--gdd .dashboard-recap-save-split {
      flex: 0 1 auto;
    }
    .dashboard-recap-textarea-fill {
      flex: 1 1 auto;
      min-height: 108px;
      height: 100%;
      max-height: none;
      resize: none;
      margin: 0;
      align-self: stretch;
    }
    .dashboard-recap-textarea-fill {
      flex: 1 1 auto;
      min-height: 108px;
      height: 100%;
      max-height: none;
      resize: none;
    }
    @media (max-width: 520px) {
      .dashboard-recap-gdd-grid { grid-template-columns: 1fr; }
    }
    .dashboard-habit-sep {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 8px 0;
      flex-shrink: 0;
      color: var(--text-muted);
    }
    .dashboard-habit-sep__label {
      flex: 0 0 auto;
      font-size: max(10px, 0.68em);
      font-weight: 650;
      letter-spacing: 0.1em;
      color: color-mix(in srgb, var(--text-muted) 88%, rgba(37,99,235,.35));
      opacity: 0.95;
      white-space: nowrap;
    }
    .dashboard-habit-sep::before,
    .dashboard-habit-sep::after {
      content: "";
      flex: 1;
      height: 1px;
      background: color-mix(in srgb, var(--background-modifier-border) 70%, rgba(59,130,246,.22));
    }
    /*
     * 习惯列内复盘：单一纵向滚动在 .dashboard-recap-panel 上，避免「外层 hidden + 内层 auto」
     * 双滚动嵌套在极矮高度下会把步骤条挤出可视区或裁切标签；步骤条 sticky 始终可读。
     */
    .dashboard-habit-recap-mount .dashboard-recap-panel {
      flex: 1 1 auto;
      min-height: 0;
      max-height: none;
      height: 100%;
      overflow-x: hidden;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 0 8px 6px;
      gap: 0;
    }
    .dashboard-habit-recap-mount .dashboard-recap-steps {
      position: sticky;
      top: 0;
      z-index: 4;
      flex-shrink: 0;
      margin: 0;
      padding: 6px 0 5px;
      overflow-y: visible;
      background: var(--dash-surface);
      box-shadow: 0 4px 10px rgba(30,58,138,.06);
      border-bottom: 1px solid rgba(99,102,241,.12);
    }
    .theme-dark .dashboard-habit-recap-mount .dashboard-recap-steps {
      background: var(--dash-surface);
      border-bottom-color: rgba(99,102,241,.22);
      box-shadow: 0 3px 10px rgba(0,0,0,.14);
    }
    .dashboard-habit-recap-mount .dashboard-recap-pane-wrap {
      flex: 0 0 auto;
      min-height: 0;
      max-height: none;
      height: auto;
      overflow-x: hidden;
      overflow-y: visible;
      padding-right: 0;
    }
    /* 顶栏：左头像/欢迎/名言 + 右四指标（与下方工作台 callout 分离） */
    .dashboard-hero-strip {
      margin: 0;
      padding: 0 var(--dash-section-x);
      border-radius: var(--dash-radius);
      background: var(--dash-surface-muted);
      border: none;
      box-shadow: none;
      transition: box-shadow var(--dash-motion-fast), border-color var(--dash-motion-fast);
    }
    .theme-dark .dashboard-hero-strip {
      box-shadow: none;
    }
    .dashboard-hero-strip__inner {
      display: flex;
      flex-direction: row;
      align-items: stretch;
      justify-content: space-between;
      gap: var(--dash-hero-gap);
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
    }
    .dashboard-hero-strip__welcome {
      flex: 0 0 calc(45% - var(--dash-hero-half-gap));
      min-width: 0;
      max-width: calc(45% - var(--dash-hero-half-gap));
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
      position: relative;
      overflow: visible;
    }
    .dashboard-hero-strip__welcome-top {
      position: relative;
      flex: 0 0 auto;
      min-height: 6.45rem;
      display: flex;
      align-items: stretch;
      overflow: hidden;
      border-radius: 12px;
    }
    .dashboard-hero-strip__welcome-top .dashboard-identity-strip {
      flex: 1 1 auto;
      min-width: 0;
      margin-bottom: 0;
      width: 100%;
      padding: 2px 4px 2px 2px;
      min-height: 6.45rem;
      align-items: stretch;
      background: transparent;
      border: 0;
      box-shadow: none;
    }
    .dashboard-identity-excerpt-host {
      flex: 1 1 auto;
      min-width: 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .dashboard-hero-weather {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 4px;
      margin: 4px 4px 2px 2px;
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid color-mix(in srgb, var(--background-modifier-border) 82%, rgba(59,130,246,.16));
      background: var(--dash-surface-raised);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.58);
      min-height: 6.45rem;
      width: clamp(9.2rem, 18vw, 10.8rem);
      flex: 0 0 auto;
    }
    .theme-dark .dashboard-hero-weather {
      background: var(--dash-surface-raised);
      border-color: color-mix(in srgb, var(--background-modifier-border) 70%, rgba(129,140,248,.22));
      box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
    }
    .dashboard-hero-weather__city {
      font-size: .9em;
      line-height: 1.2;
      font-weight: 700;
      color: var(--text-normal);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .dashboard-hero-weather__main {
      font-size: .88em;
      line-height: 1.32;
      font-weight: 650;
      color: var(--text-normal);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .dashboard-hero-weather__meta {
      font-size: .76em;
      line-height: 1.3;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .dashboard-hero-weather__tomorrow {
      font-size: .73em;
      line-height: 1.28;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .dashboard-hero-strip__metrics {
      flex: 0 0 calc(55% - var(--dash-hero-half-gap));
      min-width: 0;
      max-width: calc(55% - var(--dash-hero-half-gap));
      min-height: 0;
      align-self: stretch;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
    }
    @media (max-width: 900px) {
      .dashboard-hero-strip__welcome {
        flex: 1 1 auto;
        max-width: 100%;
      }
      .dashboard-hero-strip__metrics {
        flex: 1 1 auto;
        min-width: 0;
        max-width: none;
      }
    }
    @container noria-home (max-width: 900px) {
      .dashboard-hero-strip__welcome {
        flex: 1 1 auto;
        max-width: 100%;
      }
      .dashboard-hero-strip__metrics {
        flex: 1 1 auto;
        min-width: 0;
        max-width: none;
      }
    }
    .dashboard-hero-strip__metrics > .dashboard-metrics-host--hero {
      flex: 1 1 auto;
      min-height: 6.45rem;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      box-sizing: border-box;
      overflow: hidden;
    }
    .dashboard-hero-strip__metrics > .dashboard-metrics-host--hero .dashboard-metric-card--hero b {
      overflow: visible ;
      text-overflow: clip ;
      letter-spacing: 0 ;
    }
    .theme-dark .dashboard-hero-strip__metrics > .dashboard-metrics-host--hero .dashboard-metric-card--hero {
      border-color: color-mix(in srgb, var(--background-modifier-border) 42%, transparent) ;
      box-shadow: none ;
    }
    @media (max-width: 1180px) {
      .dashboard-hero-strip__metrics > .dashboard-metrics-host--hero {
        grid-template-columns: repeat(2, minmax(0, 1fr)) ;
        height: auto ;
      }
    }
    @container noria-home (max-width: 1180px) {
      .dashboard-hero-strip__metrics > .dashboard-metrics-host--hero {
        grid-template-columns: repeat(2, minmax(0, 1fr)) ;
        height: auto ;
      }
    }
    .dashboard-hero-strip__welcome-top .dashboard-identity-avatar-wrap {
      width: auto;
      min-width: 4.5rem;
      height: auto;
      min-height: 0;
      flex: 0 0 auto;
      align-self: stretch;
      aspect-ratio: 1;
      max-width: min(7.5rem, 28vw);
      border-radius: 13px;
    }
    @media (max-width: 900px) {
      .dashboard-hero-strip__inner {
        flex-direction: column;
        align-items: stretch;
      }
      .dashboard-hero-strip__metrics {
        align-self: stretch;
      }
    }
    @container noria-home (max-width: 900px) {
      .dashboard-hero-strip__inner {
        flex-direction: column;
        align-items: stretch;
      }
      .dashboard-hero-strip__metrics {
        align-self: stretch;
      }
    }
    .dashboard-identity-strip {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 10px;
      padding: 11px 14px;
      border-radius: var(--dash-radius-card);
      background: var(--dash-surface-muted);
      border: 1px solid color-mix(in srgb, var(--background-modifier-border) 75%, rgba(99,102,241,.2));
      box-shadow: var(--dash-shadow-card);
      transition: box-shadow var(--dash-motion-fast), border-color var(--dash-motion-fast);
    }
    .theme-dark .dashboard-identity-strip {
      box-shadow: 0 2px 16px rgba(0,0,0,.2), inset 0 1px 0 rgba(255,255,255,.05);
    }
    .dashboard-identity-avatar-wrap {
      flex: 0 0 auto;
      width: 48px;
      height: 48px;
      border-radius: 14px;
      overflow: hidden;
      border: 1px solid rgba(99,102,241,.28);
      background: var(--dash-surface-tinted);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .dashboard-identity-avatar-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .dashboard-identity-avatar {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 820;
      font-size: 1em;
      color: #312e81;
    }
    .dashboard-identity-textcol {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .dashboard-identity-welcome {
      font-weight: 820;
      font-size: 1.02em;
      color: rgba(30,58,138,.95);
      letter-spacing: .02em;
      line-height: 1.35;
    }
    .theme-dark .dashboard-identity-welcome {
      color: color-mix(in srgb, var(--text-normal) 92%, rgba(165,180,252,.2));
    }
    .dashboard-identity-quote {
      font-size: .94em;
      line-height: 1.52;
      color: color-mix(in srgb, var(--text-normal) 88%, rgb(51 65 85));
      opacity: 1;
      font-style: italic;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      overflow: hidden;
    }
    .theme-dark .dashboard-identity-quote {
      color: color-mix(in srgb, var(--text-normal) 93%, rgba(226, 232, 240, 0.14));
    }
    .dashboard-hero-weather-inline {
      margin-top: 9px;
      min-height: 1.2rem;
      display: flex;
      align-items: center;
      width: 100%;
      min-width: 0;
      padding: 2px 0 0 0;
    }
    .dashboard-hero-weather-inline__line {
      font-size: .78em;
      line-height: 1.3;
      color: color-mix(in srgb, var(--text-normal) 82%, rgb(71 85 105));
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      background: color-mix(in srgb, var(--background-primary) 97%, rgba(148,163,184,.14));
      border: 0;
      border-radius: 999px;
      padding: 3px 8px;
      margin: 0;
      font-weight: 560;
      letter-spacing: .01em;
    }
    .dashboard-hero-weather-inline__line[data-noria-weather-state="failed"],
    .dashboard-hero-weather-inline__line[data-noria-weather-state="unavailable"] {
      color: color-mix(in srgb, var(--text-muted) 88%, var(--text-normal));
      background: transparent;
      padding-left: 0;
      font-weight: 520;
      letter-spacing: 0;
    }
    .theme-dark .dashboard-hero-weather-inline__line {
      color: color-mix(in srgb, var(--text-normal) 90%, rgba(148,163,184,.28));
      background: color-mix(in srgb, var(--background-primary) 88%, rgba(71,85,105,.32));
    }
    .theme-dark .dashboard-hero-weather-inline__line[data-noria-weather-state="failed"],
    .theme-dark .dashboard-hero-weather-inline__line[data-noria-weather-state="unavailable"] {
      color: color-mix(in srgb, var(--text-muted) 86%, var(--text-normal));
      background: transparent;
    }
    @container noria-home (max-width: 420px) {
      .dashboard-hero-strip__welcome-top .dashboard-identity-avatar-wrap {
        width: 4rem;
        min-width: 4rem;
        max-width: 4rem;
        height: 4rem;
        min-height: 4rem;
        align-self: flex-start;
      }
      .dashboard-hero-weather-inline__line[data-noria-weather-state="ready"] {
        white-space: normal;
        overflow: visible;
        text-overflow: clip;
        letter-spacing: 0;
      }
    }
    .dashboard-identity-snippet-divider {
      margin: 2px 0 2px;
      height: 0;
      border: 0;
      border-top: 1px dashed color-mix(in srgb, var(--background-modifier-border) 55%, rgba(99, 102, 241, 0.35));
      opacity: 1;
    }
    .theme-dark .dashboard-identity-snippet-divider {
      border-top-color: color-mix(in srgb, var(--background-modifier-border) 45%, rgba(165, 180, 252, 0.42));
    }
    .dashboard-identity-snippet {
      display: flex;
      flex-direction: column;
      gap: 5px;
      min-width: 0;
    }
    .dashboard-identity-snippet-title {
      font-size: .9em;
      line-height: 1.35;
      min-width: 0;
    }
    .dashboard-identity-snippet-title .internal-link {
      font-weight: 700;
      color: color-mix(in srgb, var(--text-accent) 72%, rgb(67 56 202)) ;
      text-underline-offset: 3px;
    }
    .theme-dark .dashboard-identity-snippet-title .internal-link {
      color: color-mix(in srgb, var(--text-accent) 78%, rgba(165, 180, 252, 0.55)) ;
    }
    .dashboard-identity-snippet-body {
      font-size: .9em;
      line-height: 1.55;
      color: color-mix(in srgb, var(--text-normal) 92%, rgb(51 65 85));
      font-style: normal;
    }
    .dashboard-identity-snippet-body.markdown-rendered {
      display: block;
      max-height: min(40vh, 220px);
      overflow-y: auto;
      overflow-x: hidden;
      padding: 8px 10px;
      border-radius: 10px;
      background: color-mix(in srgb, var(--background-primary) 94%, rgba(99, 102, 241, 0.06));
      border: 1px solid color-mix(in srgb, var(--background-modifier-border) 78%, rgba(99, 102, 241, 0.14));
    }
    .theme-dark .dashboard-identity-snippet-body.markdown-rendered {
      background: color-mix(in srgb, var(--background-primary) 92%, rgba(99, 102, 241, 0.12));
      border-color: color-mix(in srgb, var(--background-modifier-border) 60%, rgba(165, 180, 252, 0.22));
    }
    .dashboard-identity-snippet-body.markdown-rendered p {
      margin: 0.4em 0;
      color: inherit;
    }
    .dashboard-identity-snippet-body.markdown-rendered p:first-child {
      margin-top: 0;
    }
    .dashboard-identity-snippet-body.markdown-rendered p:last-child {
      margin-bottom: 0;
    }
    .dashboard-identity-snippet-body.markdown-rendered strong {
      color: color-mix(in srgb, var(--text-normal) 96%, rgb(30 58 138));
      font-weight: 700;
    }
    .theme-dark .dashboard-identity-snippet-body.markdown-rendered strong {
      color: color-mix(in srgb, var(--text-normal) 95%, rgba(165, 180, 252, 0.35));
    }
    .dashboard-identity-snippet-body.markdown-rendered a.internal-link {
      color: color-mix(in srgb, var(--text-accent) 75%, rgb(67 56 202));
      font-weight: 600;
    }
    .dashboard-identity-snippet-body.markdown-rendered code {
      font-size: 0.88em;
      padding: 0.08em 0.35em;
      border-radius: 5px;
      background: color-mix(in srgb, var(--background-modifier-border) 55%, transparent);
    }
    .theme-dark .dashboard-identity-snippet-body {
      color: color-mix(in srgb, var(--text-normal) 94%, rgba(226, 232, 240, 0.1));
    }
    .dashboard-hero-strip__welcome-top .dashboard-identity-quote {
      -webkit-line-clamp: 3;
    }
  `;
  if (shouldAppendStyle) document.head.appendChild(style);
})();
