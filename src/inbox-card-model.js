"use strict";
const { parseWork } = require("./inbox-work.js");
const ACTIONS = { "我": ["阅读", "整理", "提炼"], SI: ["整理", "提炼"] };

function selectItems(items, actor = "", action = "") {
  return items.filter(item => {
    const work = parseWork(item.work);
    return (!actor || work.actor === actor) && (!action || work.action === action);
  });
}
function actionCount(items, actor, action) {
  return items.filter(item => {
    const work = parseWork(item.work);
    return work.actor === actor && (action === "自定义" ? !!work.action && !ACTIONS[actor].includes(work.action) : work.action === action);
  }).length;
}
function edgeDepth(y) { return 94 * Math.sqrt(Math.max(0, 1 - ((y - 200) / 170) ** 2)); }
function sectors(actor, width, height = 390) {
  const scale = height / 390;
  const actions = [...ACTIONS[actor], "自定义"];
  return actions.map((action, index) => {
    const custom = action === "自定义";
    const a = custom ? 252.7 : 30 + index * 222 / (actions.length - 1) + (index ? .7 : 0);
    const b = custom ? 370 : 30 + (index + 1) * 222 / (actions.length - 1) - .7;
    const mirror = x => actor === "我" ? x : width - x;
    const points = [[mirror(0), a * scale]];
    for (let y = a; y <= b; y += 2) points.push([mirror(edgeDepth(y)), y * scale]);
    points.push([mirror(edgeDepth(b)), b * scale], [mirror(0), b * scale]);
    // The tapered last sector carries its label nearer its visual center.
    const y = custom ? 300 : (a + b) / 2;
    return { actor, action, y: y * scale, x: mirror(edgeDepth(y) * .54), endX: mirror(edgeDepth(y) + 7),
      polygon: `polygon(${points.map(p => p.map(v => v.toFixed(2) + "px").join(" ")).join(",")})` };
  });
}
function preview(raw, name) {
  const body = String(raw || "").replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "");
  let fenced = false;
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const text = line.trim().replace(/^>\s*\[![^\]]+\][+-]?\s*/, "").replace(/^[#>\s]+/, "")
      .replace(/^[-*+]\s+(?:\[[ xX-]\]\s+)?/, "").replace(/^\d+[.)]\s+/, "")
      .replace(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => label || target.split("/").pop())
      .replace(/!?\[([^\]]*)\]\([^)]+\)/g, "$1").replace(/<[^>]+>/g, " ").replace(/[`*_~]/g, "").replace(/\s+/g, " ").trim();
    if (!text || text.replace(/[ -]/g, "") === name.replace(/[ -]/g, "") || /^[-|:\s]+$/.test(text) || /^(source|sources|来源|参考)$/i.test(text)) continue;
    return [...text].slice(0, 112).join("");
  }
  return "";
}
module.exports = { ACTIONS, selectItems, actionCount, sectors, preview };
