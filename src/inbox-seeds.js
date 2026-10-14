"use strict";

// Bases display files; linked bullets remain in their original Inbox.md.
function inboxQueueSeed({locale, root}) {
  const zh = locale === "zh";
  const views = [
    [zh ? "全部" : "All", ""],
    [zh ? "未安排" : "Unassigned", String.raw`!note["inbox-work"].isType("string") || !/^(我|SI)\s*[:：]\s*\S[^\r\n]*$/.matches(note["inbox-work"].trim())`],
    [zh ? "我" : "Me", String.raw`note["inbox-work"].isType("string") && /^我\s*[:：]\s*\S[^\r\n]*$/.matches(note["inbox-work"].trim())`],
    ["SI", String.raw`note["inbox-work"].isType("string") && /^SI\s*[:：]\s*\S[^\r\n]*$/.matches(note["inbox-work"].trim())`]
  ];
  const lines = ["filters:", "  and:", `    - file.inFolder(${JSON.stringify(root)})`, '    - file.ext == "md"',
    "properties:", "  file.name:", `    displayName: ${zh ? "文件" : "File"}`,
    "  note.inbox-work:", `    displayName: ${zh ? "下一步" : "Next step"}`, "views:"];
  for (const [name, filter] of views) {
    lines.push("  - type: table", `    name: ${JSON.stringify(name)}`);
    if (filter) lines.push(`    filters: ${JSON.stringify(filter)}`);
    lines.push("    order:", "      - file.name", "      - note.inbox-work", "    sort:", "      - property: file.mtime", "        direction: DESC");
  }
  return lines.join("\n") + "\n";
}
module.exports = {inboxQueueSeed};
