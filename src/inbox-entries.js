"use strict";
const { parseWork } = require("./inbox-work.js");
const conflict = () => Error("这段交接已变化或有相同内容，请重新打开；未覆盖新内容。");

// Normal top-level linked bullets; indented prose stays with its bullet.
// Positions are read from the document, never saved as identifiers.
function parseEntries(text) {
  const entries = [], lines = String(text).split(/(?<=\n)/);
  let offset = 0, line = 0, fence = null, current = null;
  const finish = () => {
    if (!current) return;
    current.raw = text.slice(current.start, current.end);
    const fields = [...current.raw.matchAll(/\[inbox-work::\s*([^\]\r\n]*)\]/g)];
    if (fields.length > 1 || (fields[0]?.[1] && !parseWork(fields[0][1]).actor)) throw conflict();
    current.work = parseWork(fields[0]?.[1]).value;
    current.field = fields[0] ? { start: fields[0].index, end: fields[0].index + fields[0][0].length } : null;
    entries.push(current); current = null;
  };
  for (const raw of lines) {
    const value = raw.replace(/\r?\n$/, "");
    if (current && value && !/^\s/.test(value)) finish();
    if (current && /^\s+\S/.test(value)) { current.end = offset + raw.length; }
    else {
      const code = /^ {0,3}(`{3,}|~{3,})/.exec(value);
      if (code) {
        if (!fence) fence = code[1];
        else if (code[1][0] === fence[0] && code[1].length >= fence.length && /^ {0,3}(?:`+|~+)\s*$/.test(value)) fence = null;
      } else if (!fence && /^[-*+] /.test(value)) {
        const link = /\[\[([^\]\r\n]+)\]\]/.exec(value);
        if (link) {
          const [target, alias] = link[1].split("|");
          current = { start: offset, end: offset + raw.length, line, name: alias || target.split("/").pop().replace(/\.md(?=#|$)/, "") };
        }
      }
    }
    offset += raw.length; line++;
  }
  finish(); return entries;
}

function changeEntry(text, expected, replacement) {
  const matches = parseEntries(text).filter(entry => entry.raw === expected.raw);
  if (matches.length !== 1) throw conflict();
  const current = matches[0];
  return text.slice(0,current.start) + replacement + text.slice(current.end);
}

function assignEntry(entry, value) {
  if (value && !parseWork(value).actor) throw conflict();
  const field = value ? "[inbox-work:: " + parseWork(value).actor + "：" + parseWork(value).action + "]" : "";
  if (entry.field) return entry.raw.slice(0,entry.field.start)+field+entry.raw.slice(entry.field.end);
  return entry.raw.replace(/^(.*?)(\r?\n|$)/, (_, first, eol) => first + (field ? " " + field : "") + eol);
}

async function loadEntries(plugin, create = false) {
  const { vault } = plugin.app;
  const path = plugin.getManagedPath("inboxRoot").replace(/\/+$/, "") + "/Inbox.md";
  let file = vault.getAbstractFileByPath(path);
  if (!file && create) {
    try { file = await vault.create(path, "## Inbox\n"); }
    catch (error) { file = vault.getAbstractFileByPath(path); if (!file) throw error; }
  }
  if (!file) return { file: null, entries: [] };
  const text = await vault.read(file), entries = parseEntries(text);
  let remainder = text;
  for (const entry of [...entries].reverse()) remainder = remainder.slice(0,entry.start)+remainder.slice(entry.end);
  // Keep an ordinary note row when the file also has prose outside the linked list.
  const showFile = !!remainder.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "").replace(/^#{1,6} .*$/gm, "").trim();
  return { file, entries, showFile };
}

async function editEntry(plugin, file, expected, replacement) {
  let result;
  await plugin.app.vault.process(file, text => {
    const next = changeEntry(text, expected, replacement);
    result = replacement ? parseEntries(next).find(entry => entry.raw === replacement) : null;
    return next;
  });
  return result;
}

async function appendEntry(plugin, file, raw) {
  let result;
  await plugin.app.vault.process(file, text => {
    if (parseEntries(text).some(entry => entry.raw === raw)) throw conflict();
    const prefix = text + (text.endsWith("\n\n") ? "" : text.endsWith("\n") ? "\n" : "\n\n");
    const next = prefix + raw;
    result = parseEntries(next).find(entry => entry.start === prefix.length);
    if (!result) throw conflict();
    return next;
  });
  return result;
}

async function moveWithEntry(plugin, path, folder, { keep = false } = {}) {
  const { moveFile, undoMove } = require("./inbox-work.js");
  const store = keep ? await loadEntries(plugin, true) : null;
  if (store?.file?.path === path) throw Error("集中承接笔记不能作为资料迁出。");
  const receipt = await moveFile(plugin, path, folder);
  if (!keep) return receipt;
  try {
    const target = plugin.app.vault.getAbstractFileByPath(receipt.target);
    const link = plugin.app.fileManager.generateMarkdownLink(target, store.file.path);
    const raw = "- " + link + "\n";
    const entry = await appendEntry(plugin, store.file, raw);
    return { ...receipt, continuation: { file: store.file, entry } };
  } catch (error) {
    try { await undoMove(plugin, receipt); }
    catch (_) { throw Error(`资料已在 ${receipt.target}，承接写入失败；请打开检查。${error.message}`); }
    throw error;
  }
}

async function undoWithEntry(plugin, receipt) {
  const { undoMove } = require("./inbox-work.js");
  const saved = receipt.continuation;
  if (!saved) return undoMove(plugin, receipt);
  // Remove only the unchanged entry before rename can update its source link.
  await editEntry(plugin, saved.file, saved.entry, "");
  try { await undoMove(plugin, receipt); }
  catch (error) {
    try { await appendEntry(plugin, saved.file, saved.entry.raw); }
    catch (_) { throw Error(`撤销未完成，资料位置请检查 ${receipt.target}；入口未能恢复，可从原回执核对。${error.message}`); }
    throw error;
  }
}

module.exports = { parseEntries, changeEntry, assignEntry, loadEntries, editEntry, appendEntry, moveWithEntry, undoWithEntry };
