"use strict";
const { createHash } = require("crypto");
const { createReviewDraftId } = require("./review-center-core.js");
const {readReviewDocument} = require("./review-document.js");

function splitDateMarkdown(markdown) {
  const raw = String(markdown || "");
  const frontmatter = /^(?:\uFEFF)?---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)(?:\r?\n|$)/.exec(raw);
  return { prefix: frontmatter?.[0] || "", body: raw.slice(frontmatter?.[0].length || 0) };
}
function fingerprint(raw) { return "diary-v1-" + createHash("sha256").update(raw).digest("hex"); }
function failure(code) { const error = new Error(code); error.code = code; return error; }

function mergeIndependentReview(base, draft, current, heading) {
  try {
    const a=readReviewDocument(base,[heading]), b=readReviewDocument(draft,[heading]), c=readReviewDocument(current,[heading]);
    if(!a.exists || !b.exists || !c.exists) return null;
    if(base.slice(a.start,a.end) !== draft.slice(b.start,b.end)) return null;
    if(base.slice(0,a.start) !== current.slice(0,c.start) || base.slice(a.end) !== current.slice(c.end)) return null;
    return draft.slice(0,b.start)+current.slice(c.start,c.end)+draft.slice(b.end);
  } catch (_) {return null;}
}

// Reapply one known, committed line edit to an independently edited draft.
// Ambiguous or locally modified target lines remain an explicit conflict.
function mergeKnownLineChange(base,draft,next) {
  if(base===next)return draft;
  const lines=value=>value.match(/[^\n]*\n|[^\n]+$/g)||[];
  const a=lines(base),b=lines(next);let first=0,lastA=a.length,lastB=b.length;
  while(first<lastA && first<lastB && a[first]===b[first])first++;
  while(lastA>first && lastB>first && a[lastA-1]===b[lastB-1]){lastA--;lastB--;}
  const old=a.slice(first,lastA).join(""),replacement=b.slice(first,lastB).join("");
  if(old) {
    const index=draft.indexOf(old);
    if(index<0 || draft.indexOf(old,index+1)>=0 || (index>0 && draft[index-1]!=="\n"))return null;
    return draft.slice(0,index)+replacement+draft.slice(index+old.length);
  }
  if(first===a.length) {
    const eol=/\r\n|\n/.exec(next)?.[0] || "\n";
    return draft+(draft && !draft.endsWith("\n")?eol:"")+replacement;
  }
  const tail=a.slice(first).join(""),index=draft.indexOf(tail);
  if(!tail || index<0 || draft.indexOf(tail,index+1)>=0)return null;
  return draft.slice(0,index)+replacement+draft.slice(index);
}

class DiaryDocumentStore {
  constructor(plugin) { this.plugin = plugin; }
  rebaseKnownWrite(model,body,result) {
    if(model.path!==result.path || model.raw!==result.previousText)return null;
    const eol=/\r\n|\n/.exec(model.raw||model.prefix)?.[0] || "\n";
    const draft=model.prefix+String(body).replace(/\r\n?|\n/g,eol);
    const base=model.raw || model.prefix+model.body;
    const merged=draft===base?result.text:mergeKnownLineChange(base,draft,result.text);
    if(merged===null)return null;
    return {body:splitDateMarkdown(merged).body,model:{...model,exists:true,raw:result.text,...splitDateMarkdown(result.text),baseFingerprint:fingerprint(result.text)}};
  }
  async load(input) {
    const selection = this.plugin.resolveReviewSelection(input);
    const spec = await this.plugin.resolveCalendarNoteSpecAsync(selection.mode, selection.anchorDate);
    const exists = !!this.plugin.app.vault.getAbstractFileByPath(spec.path);
    const raw = exists ? await this.plugin.loadTextFromVault(spec.path) : "";
    const seed = exists ? raw : await this.plugin.buildCalendarNoteContent(spec);
    const targetKey = `diary:${selection.mode}:${selection.period}`;
    const baseFingerprint = fingerprint(raw);
    const candidate = await this.plugin.loadReviewRecoveryEntry(targetKey);
    const drafts = candidate ? [...(candidate.preservedDrafts || []), candidate] : [];
    const matching = drafts.filter(d => d.targetPath === spec.path && d.baseFingerprint === baseFingerprint && d.payload?.format === "diary-markdown");
    const recoveryDraft = matching[matching.length - 1] || null;
    return { selection, spec, path: spec.path, targetKey, exists, raw, ...splitDateMarkdown(seed),
      baseFingerprint, draftId: createReviewDraftId(), recoveryDraft,
      preservedDrafts: drafts.filter(d => d !== recoveryDraft) };
  }
  async preserve(model, body) {
    const revision = model.recoveryRevision = (model.recoveryRevision || 0) + 1;
    if (String(body).replace(/\r\n?/g,"\n") === model.body.replace(/\r\n?/g,"\n")) {
      if (!model.localRecovery && !model.recoveryDraft) return;
      await this.plugin.clearReviewRecoveryEntry(model.targetKey, [
        {draftId: model.draftId}, model.recoveryDraft
      ].filter(Boolean));
      if (revision === model.recoveryRevision) {model.localRecovery = false; model.recoveryDraft = null;}
      return;
    }
    model.localRecovery = true;
    return this.plugin.queueReviewRecoveryEntry({schemaVersion: 1, draftId: model.draftId,
      targetKey: model.targetKey, targetPath: model.path, baseFingerprint: model.baseFingerprint,
      payload: {format: "diary-markdown", body}, updatedAt: Date.now()}, model.recoveryDraft);
  }
  async save(model, body) {
    const spec = await this.plugin.resolveCalendarNoteSpecAsync(model.selection.mode, model.selection.anchorDate);
    if (spec.path !== model.path || (spec.periodId && spec.periodId !== model.selection.period)) throw failure("diary-target");
    await this.preserve(model, body);
    const eol = /\r\n|\n|\r/.exec(model.raw || model.prefix)?.[0] || "\n";
    let next = model.prefix + String(body).replace(/\r\n?|\n/g, eol);
    await this.plugin.processTextAtVaultPath(model.path, current => {
      if (String(current || "") !== model.raw) {
        const heading=this.plugin.getReviewFinalSectionHeading?.(model.selection.mode,model.raw);
        const merged=mergeIndependentReview(model.raw,next,String(current||""),heading);
        if(merged === null) throw failure("diary-conflict");
        next=merged;
      }
      return next;
    });
    let recoveryCleared = true;
    try {
      await this.plugin.clearReviewRecoveryEntry(model.targetKey, [
        {draftId: model.draftId, targetPath: model.path, baseFingerprint: model.baseFingerprint, payload: {format: "diary-markdown", body}},
        model.recoveryDraft
      ].filter(Boolean));
    } catch (_) { recoveryCleared = false; }
    this.plugin.requestNoriaRefresh("review", "diary-save");
    return { ...model, exists: true, raw: next, ...splitDateMarkdown(next), baseFingerprint: fingerprint(next),
      draftId: createReviewDraftId(), recoveryDraft: null, localRecovery: false, recoveryCleared };
  }
}
module.exports = { DiaryDocumentStore, splitDateMarkdown, mergeKnownLineChange };
