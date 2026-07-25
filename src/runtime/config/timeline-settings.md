---
timeline_settings:
  defaultStrategy: daily-only
  dayBucketHeight: 84
  laneHeight: 1080
  pregenSpanDays: 7
  pregenItems: [sleep, breakfast, lunch, dinner, nap]
  items:
    breakfast:
      label: 早餐
      timelineTag: "#tl/breakfast"
      startTime: "08:00"
      durationMin: 20
    lunch:
      label: 午餐
      timelineTag: "#tl/lunch"
      startTime: "12:30"
      durationMin: 30
    dinner:
      label: 晚餐
      timelineTag: "#tl/dinner"
      startTime: "18:30"
      durationMin: 30
    nap:
      label: 午休
      timelineTag: "#tl/nap"
      startTime: "13:00"
      durationMin: 30
    sleep:
      label: 睡眠
      timelineTag: "#tl/sleep"
      startTime: "23:30"
      durationMin: 450
      crossDay: true
---

# timeline settings

## 快速说明

- `defaultStrategy`：默认建议 `daily-only`（你当前诉求）。
- `pregenItems`：控制“按配置预生成”会生成哪些事件。
- `pregenSpanDays`：控制预生成跨度（天）。
- `items.*`：每个事件的预定义时间、时长、跨日与单标签（`timelineTag`）。
