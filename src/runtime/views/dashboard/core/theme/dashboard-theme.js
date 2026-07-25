(() => {
  const root = globalThis.dashboardCore || (globalThis.dashboardCore = {});

  root.theme = {
    colors: {
      primary: "#3b82f6",
      accent: "#06b6d4",
      success: "#10b981",
      warning: "#f59e0b",
      danger: "#ef4444",
      muted: "#64748b",
      text: "#0f172a",
      textMuted: "#475569",
      surface: "color-mix(in srgb,var(--background-primary) 82%,transparent)",
      border: "rgba(59,130,246,.18)"
    },
    chart: {
      bars: ["#93c5fd", "#7dd3fc", "#60a5fa"],
      lines: ["#818cf8", "#6ee7b7", "#38bdf8"],
      /** 与主页 bootstrap / --dash-chart 同系的淡雅分段色（仅 #RRGGBB，供渐变后缀 cc/99 使用） */
      heatLevels: ["#f1f4ff", "#e4e9ff", "#d5def8", "#c7d2fe", "#a8b8f0", "#94a3e8"],
      distributionSegments: [
        "#aeb8e8",
        "#c4b5f0",
        "#9ec5ef",
        "#98dce8",
        "#9fd4b8",
        "#f0c9a0",
        "#ecbdc8",
        "#b8c8e8"
      ],
      /** 日态条带：以 bootstrap --dash-chart-strip-* 与 chart-palette 为准；此处仅作非主页场景的兜底参考 */
      stripHeat: {
        emptyFill: "color-mix(in srgb,var(--background-primary) 84%, rgb(226 232 240))",
        emptyBorder: "rgba(100, 116, 139, 0.36)",
        fills: ["#e7ebfb", "#d2d9f5", "#b8c4ec", "#9aaee0", "#7f96d4", "#677fc4"],
        borders: ["#cfd5ee", "#bcc5e6", "#a5b1dc", "#8e9cd0", "#7a89c2", "#6676b0"],
        glowRgb: "80, 96, 170",
        glowMax: 0.24
      }
    },
    size: {
      radiusSm: 8,
      radiusMd: 12,
      radiusLg: 14,
      chipHeight: 20,
      ringWidth: 52,
      ringHeight: 103
    },
    shadow: {
      soft: "0 2px 10px rgba(15,23,42,.05)",
      cardInset: "inset 0 1px 0 color-mix(in srgb,var(--background-primary) 62%,transparent)"
    },
    typography: {
      titleWeight: 760,
      labelSize: ".82em",
      valueSize: ".9em"
    },
    home: {
      /** 壳层：与 bootstrap-style 中 .dashboard-* class 呼应，便于以后只做主题改 JS 少改 */
      shell: {
        accent: "rgba(99,102,241,.85)",
        accentSoft: "rgba(99,102,241,.12)",
        border: "rgba(99,102,241,.18)",
        shadowCard: "0 1px 5px rgba(15,23,42,.04)",
        radiusLg: "14px",
        radiusMd: "12px"
      },
      /** 主页概览 / 导引 等区域的可调参数（各 view 读取 globalThis.dashboardCore.theme） */
      overview: {
        /** 概览三列（待办 / 习惯 / 倒计时）单卡内容区最大高度 */
        columnScrollMax: "min(42vh, 380px)",
        /** Inbox、项目入口面板内容区最大高度 */
        guidePanelScrollMax: "min(36vh, 320px)",
        /** 顶栏四卡阴影（极轻） */
        metricsCardShadowHero: "0 1px 3px rgba(15,23,42,.035)",
        /** 其它场景若复用指标卡可用 */
        metricsCardShadow: "0 2px 8px rgba(15,23,42,.06)",
        /** 概览四卡；任务完成数在待办分筛行右侧 */
        identity: {
          displayName: "",
          greetingName: "",
          /** 相对库根；无则显示占位字 */
          avatarPath: "Noria/avatar.svg",
          quoteListPath: "Noria/Quotes.md"
        },
        /** 顶栏右侧四卡：淡底 + labelColor/accent 用深色字（未配则用代码内默认） */
        metricCardStylesHero: [
          {
            background: "var(--dash-surface-raised, color-mix(in srgb,var(--background-primary) 98%,var(--background-secondary)))",
            accent: "var(--noria-module-home,var(--interactive-accent))",
            labelColor: "var(--text-muted)"
          },
          {
            background: "var(--dash-surface-raised, color-mix(in srgb,var(--background-primary) 98%,var(--background-secondary)))",
            accent: "var(--noria-module-tasks,#6366f1)",
            labelColor: "var(--text-muted)"
          },
          {
            background: "var(--dash-surface-raised, color-mix(in srgb,var(--background-primary) 98%,var(--background-secondary)))",
            accent: "var(--noria-module-review,#f59e0b)",
            labelColor: "var(--text-muted)"
          },
          {
            background: "var(--dash-surface-raised, color-mix(in srgb,var(--background-primary) 98%,var(--background-secondary)))",
            accent: "var(--noria-module-timeline,#06b6d4)",
            labelColor: "var(--text-muted)"
          }
        ],
        metricCardStyles: [
          {
            background: "var(--dash-surface-raised, color-mix(in srgb,var(--background-primary) 98%,var(--background-secondary)))",
            accent: "var(--noria-module-home,var(--interactive-accent))",
            labelColor: "var(--text-muted)"
          },
          {
            background: "var(--dash-surface-raised, color-mix(in srgb,var(--background-primary) 98%,var(--background-secondary)))",
            accent: "var(--noria-module-tasks,#6366f1)",
            labelColor: "var(--text-muted)"
          },
          {
            background: "var(--dash-surface-raised, color-mix(in srgb,var(--background-primary) 98%,var(--background-secondary)))",
            accent: "var(--noria-module-review,#f59e0b)",
            labelColor: "var(--text-muted)"
          },
          {
            background: "var(--dash-surface-raised, color-mix(in srgb,var(--background-primary) 98%,var(--background-secondary)))",
            accent: "var(--noria-module-timeline,#06b6d4)",
            labelColor: "var(--text-muted)"
          }
        ]
      },
      trends: {
        topPanelBg: "linear-gradient(160deg,rgba(59,130,246,.08),rgba(6,182,212,.08))",
        topPanelBorder: "1px solid rgba(59,130,246,.2)",
        topPanelShadow: "0 2px 8px rgba(15,23,42,.055)",
        topPanelRadius: "14px",
        stateCardBg: "rgba(59,130,246,.05)",
        stateCardBorder: "1px solid rgba(59,130,246,.18)",
        stateCardRadius: "12px",
        distributionPalette: [
          "#aeb8e8",
          "#c4b5f0",
          "#9ec5ef",
          "#98dce8",
          "#9fd4b8",
          "#f0c9a0",
          "#ecbdc8",
          "#b8c8e8"
        ],
        /** 根目录甜甜圈 / 图例；与 chart.distributionSegments 同系 */
        tagPalette: [
          "#aeb8e8",
          "#c4b5f0",
          "#9ec5ef",
          "#98dce8",
          "#9fd4b8",
          "#f0c9a0",
          "#ecbdc8",
          "#b8c8e8",
          "#c5d0eb",
          "#d4c4f0"
        ],
        /** 优先于 tagPalette，专供首级目录占比（可与上列一致） */
        dirTopPalette: [
          "#aeb8e8",
          "#c4b5f0",
          "#9ec5ef",
          "#98dce8",
          "#9fd4b8",
          "#f0c9a0",
          "#ecbdc8",
          "#b8c8e8"
        ]
      }
    }
  };
})();
