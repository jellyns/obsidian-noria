"use strict";

function inboxWorkflowSeed({locale, root, queue}) {
    const zh = locale === "zh";
    const text = (cn, en) => zh ? cn : en;
    return [
      text("## Inbox 使用说明", "## Using Inbox"), "",
      text(`尚未处理的资料与想法可以先放在 \`${root}\`；归属明确时直接存到对应位置。主页 Inbox 卡片和 [[${queue}|Inbox 列表]] 都能打开这些笔记。`,
        `Keep incoming material and ideas in \`${root}\`, or save them directly where they belong. Open these notes from the Home Inbox card or [[${queue}|Inbox list]].`), "",
      text("打开原笔记阅读、批注或写下下一步，暂时不处理就保留。收下内容不需要先填写阶段、成品形态或回看日期。",
        "Read, annotate, or leave a next step in the original note. Keep it here if you want to return later. Capturing a note does not require a stage, output type, or review date."), "",
      text("按住卡片中的条目，向左选择我的动作，向右选择 SI 的动作，松手保存；两侧都支持自定义。已有安排可点击修改，标题栏可按人或动作筛选。卡片与 Base 共用 `inbox-work` 属性；清除安排会保留笔记。选择 SI 目前只保存安排，尚未接通自动执行。",
        "Hold a card entry, drag left for Me or right for SI, and release to save. Both sides support custom actions. Click an existing assignment to change it; filter by person or action in the header. The card and Base share `inbox-work`; clearing an assignment keeps the note. Assigning SI does not yet start execution."), "",
      text("去向明确时，拖向下方的“移出 Inbox”并选择目录，插件会移动原笔记、清除临时 `inbox-*` 属性，并提供撤销。不必先读完或提炼完；仍想阅读或讨论时，保留资料链接与问题。",
        "When the destination is clear, drag to Move out and choose a folder. The plugin moves the original note, clears temporary `inbox-*` properties, and offers Undo. Reading or processing need not be finished; keep a link and your question if you want to return."), "",
      text("日记中的随手记留在日记里。只有另存为这里的笔记，才会进入这个队列。",
        "Quick notes in your diary stay there. They join this queue only when saved as separate notes in the Inbox folder."), ""
    ].join("\n");
  }

function inboxQueueSeed({locale, root, views=[]}) {
    const zh=locale === "zh";
    const orderLines = ["      - file.name", "      - note.inbox-work"];
    const lines = [
      "filters:",
      "  and:",
      `    - file.inFolder(${JSON.stringify(root)})`,
      "    - file.ext == \"md\"",
      "properties:",
      "  file.name:",
      `    displayName: ${zh ? "文件" : "File"}`,
      "  note.inbox-work:",
      `    displayName: ${zh ? "下一步" : "Next step"}`,
      "views:",
      "  - type: table",
      `    name: ${JSON.stringify(zh ? "全部" : "All")}`,
      "    order:",
      ...orderLines,
      "    sort:",
      "      - property: file.mtime",
      "        direction: DESC"
    ];
    for (const view of views) {
      lines.push("  - type: table");
      lines.push(`    name: ${JSON.stringify(view.name)}`);
      lines.push(...view.filters);
      lines.push("    order:");
      lines.push(...orderLines);
    }
    lines.push("");
    return lines.join("\n");
  }

module.exports={inboxWorkflowSeed,inboxQueueSeed};
