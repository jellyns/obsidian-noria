# 事件库

> 勾选表示出现在任务面板「快捷」弹层；取消勾选则保留但隐藏。

- [x] 早餐 [default_tag:: #tl/breakfast] [default_start::08:00] [default_duration_min::20] #tl/template
- [x] 午餐 [default_tag:: #tl/lunch] [default_start::12:30] [default_duration_min::30] #tl/template
- [x] 晚餐 [default_tag:: #tl/dinner] [default_start::18:30] [default_duration_min::30] #tl/template
- [x] 午休 [default_tag:: #tl/nap] [default_start::13:00] [default_duration_min::30] #tl/template
- [x] 睡眠 [default_tag:: #tl/sleep] [default_start::23:30] [default_duration_min::450] [default_cross_day:: true] #tl/template
- [x] 深度工作 [default_tag:: #tl/focus] [default_start::09:00] [default_duration_min::90] #tl/template
- [x] 晚间复盘 [default_tag:: #tl/review] [default_start::21:30] [default_duration_min::20] #tl/template

## 说明

- 新增模板请按同格式追加一行。
- `default_tag` 建议使用单标签：`#tl/<name>`。
- `default_start` 为空表示更偏向当日事项。
- 跨日事件可添加 `[default_cross_day:: true]`。
