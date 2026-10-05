"use strict";

const FIELD = "inbox-work";

function parseWork(value) {
  if (typeof value !== "string") return { value: "", actor: "", action: "" };
  const text = value.trim();
  const match = /^(我|SI)\s*[:：]\s*(\S[^\r\n]*)$/.exec(text);
  return { value: text, actor: match?.[1] || "", action: match?.[2]?.trim() || "" };
}

async function updateWork(plugin, request = {}) {
  const path = String(request.path || "").replace(/\\/g, "/");
  const root = plugin.getManagedPath("inboxRoot").replace(/\\/g, "/").replace(/\/+$/, "");
  if (!root || !path.startsWith(root + "/") || /(^|\/)\.\.?($|\/)/.test(path) || !/\.md$/i.test(path)) {
    return { ok: false, reason: "outside-inbox-root" };
  }
  const file = plugin.app.vault.getAbstractFileByPath(path);
  if (!file) return { ok: false, reason: "missing-file" };
  const work = parseWork(request.work);
  if (typeof request.work !== "string" || (work.value && (!work.actor || !work.action))) {
    return { ok: false, reason: "invalid-work" };
  }
  const value = work.value ? `${work.actor}：${work.action}` : "";
  let previous;
  let conflict = false;
  try {
    await plugin.app.fileManager.processFrontMatter(file, fm => {
      previous = fm[FIELD] ?? "";
      if (typeof previous !== "string" || (Object.hasOwn(request, "currentWork") && previous.trim() !== request.currentWork)) {
        conflict = true;
        throw Error("Inbox work changed");
      }
      if (value) fm[FIELD] = value;
      else delete fm[FIELD];
    });
  } catch (error) {
    if (conflict) return { ok: false, reason: "conflict", currentWork: previous };
    throw error;
  }
  return { ok: true, path, work: value, previousWork: previous };
}

async function moveFile(plugin, path, folder) {
  const { parseYaml } = require("obsidian");
  const { vault, fileManager } = plugin.app;
  const root = plugin.getManagedPath("inboxRoot").replace(/\/+$/, "") + "/";
  const file = vault.getAbstractFileByPath(path);
  const destination = folder ? vault.getAbstractFileByPath(folder) : vault.getRoot();
  if (!file?.extension || !path.startsWith(root)) throw Error("笔记已不在 Inbox，请重新打开。");
  if (!destination || !Array.isArray(destination.children) || /(^|\/)\.\.?($|\/)/.test(folder)) throw Error("请选择已有目录。");
  const target = `${folder ? folder + "/" : ""}${file.name}`;
  if (target.startsWith(root)) throw Error("请选择 Inbox 以外的目录。");
  if (vault.getAbstractFileByPath(target)) throw Error("目标目录已有同名笔记，请选择其他目录。");
  await fileManager.renameFile(file, target);
  const temporary = {};
  try {
    const text = await vault.read(file);
    const fm = parseYaml(/^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] || "") || {};
    if (Object.keys(fm).some(key => key.startsWith("inbox-"))) {
      await fileManager.processFrontMatter(file, properties => {
        for (const key of Object.keys(properties)) if (key.startsWith("inbox-")) {
          temporary[key] = structuredClone(properties[key]);
          delete properties[key];
        }
      });
    }
  } catch (error) {
    await fileManager.renameFile(file, path);
    throw error;
  }
  return { from: path, target, temporary };
}

async function undoMove(plugin, receipt) {
  const { vault, fileManager } = plugin.app;
  const file = vault.getAbstractFileByPath(receipt.target);
  if (!file?.extension) throw Error("笔记位置已变化，请先打开笔记查看。");
  if (vault.getAbstractFileByPath(receipt.from)) throw Error("原位置已有同名笔记，不能覆盖。");
  await fileManager.renameFile(file, receipt.from);
  if (Object.keys(receipt.temporary).length) {
    try {
      await fileManager.processFrontMatter(file, fm => {
        for (const key of Object.keys(receipt.temporary)) {
          if (Object.hasOwn(fm, key)) throw Error("协作属性已变化，请先查看笔记。");
          fm[key] = receipt.temporary[key];
        }
      });
    } catch (error) {
      await fileManager.renameFile(file, receipt.target);
      throw error;
    }
  }
}

module.exports = { FIELD, parseWork, updateWork, moveFile, undoMove };
