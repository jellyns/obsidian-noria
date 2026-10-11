"use strict";
const {createHash}=require('node:crypto');
const {normalizeReviewSelection}=require('./review-center-core.js');
const {readReviewDocument}=require('./review-document.js');
const fail=(code,message)=>Object.assign(Error(message),{code});

function selectionOf(request){
  if(!request||typeof request!=='object'||Array.isArray(request)||Object.keys(request).some(key=>!['mode','anchorDate','yearlyVariant'].includes(key))||
    !['daily','weekly','monthly','yearly'].includes(request.mode)||typeof request.anchorDate!=='string'||!request.anchorDate||
    request.yearlyVariant!==undefined&&!['month','week'].includes(request.yearlyVariant))throw fail('invalid-input','Specify mode, anchorDate (YYYY-MM-DD) and optionally yearlyVariant (month or week)');
  try{return normalizeReviewSelection(request);}catch(error){throw fail('invalid-input',error.message);}
}
const revision=(path,exists,markdown)=>'review-api-v1-'+createHash('sha256').update(JSON.stringify([path,exists,markdown])).digest('hex');

async function readReview(plugin,request){
  const selection=selectionOf(request),target=await plugin.getReviewFinalTarget(selection);
  const raw=await plugin.loadTextFromVault(target.targetPath);
  let binding;
  try{binding=readReviewDocument(raw,[plugin.getReviewFinalSectionHeading(selection.mode,raw)]);}catch(error){
    if(error.code==='review-range')throw fail('conflict','The saved review boundaries are ambiguous; open the source note to repair them');
    throw error;
  }
  const path=await plugin.resolveReviewAnalysisArtifactPath(selection),markdown=await plugin.loadTextFromVault(path);
  return {selection,path:target.targetPath,noteExists:target.exists,exists:binding.exists,markdown:binding.markdown,
    revision:revision(target.targetPath,binding.exists,binding.markdown),
    analysis:{path,exists:!!markdown,markdown,revision:revision(path,!!markdown,markdown)}};
}
async function prepareReview(plugin,request){
  const selection=selectionOf(request),result=await plugin.prepareReviewAnalysis(selection,null,{notify:false});
  return {ok:result.ok,selection:result.selection,evidenceHash:result.evidence.evidenceHash,
    evidencePath:result.evidencePath,readingPath:result.readingPath,promptPath:result.promptPath,artifactPath:result.artifactPath,
    material:result.material,prompt:result.prompt};
}
async function submitAnalysis(plugin,request){
  if(!request||typeof request!=='object'||Array.isArray(request))throw fail('invalid-input','Specify the review selection, analysis revision, evidenceHash and Markdown');
  const {revision:expectedRevision,evidenceHash,markdown,...selectionRequest}=request;
  const selection=selectionOf(selectionRequest);
  if(typeof expectedRevision!=='string'||!expectedRevision||typeof evidenceHash!=='string'||!evidenceHash||typeof markdown!=='string'||!markdown.trim()){
    throw fail('invalid-input','Use the analysis revision from reviews.read and evidenceHash from reviews.prepare');
  }
  const review=await plugin.ensureReviewCenterUtils(),parsed=review.parseReviewArtifact(markdown);
  if(parsed.meta.evidence_hash!==evidenceHash||!review.hasGeneratedReviewContent(parsed)||/%%\s*noria:review:(?:start|end)\s*%%/.test(markdown)){
    throw fail('invalid-input','Analysis must contain content and matching evidence_hash frontmatter, without final-review boundary markers');
  }
  const path=await plugin.resolveReviewAnalysisArtifactPath(selection);
  // Retries compare the complete saved artifact. No extra receipt or history file is needed.
  const previous=await plugin.loadTextFromVault(path);
  if(previous!==markdown&&revision(path,!!previous,previous)!==expectedRevision)throw fail('conflict','The analysis or its configured destination changed; read it again before updating');
  const evidence=await plugin.getFullReviewEvidence(selection);
  if(evidence.evidenceHash!==evidenceHash)throw fail('conflict','The review material changed; prepare and inspect the current material before submitting');
  if(await plugin.resolveReviewAnalysisArtifactPath(selection)!==path)throw fail('conflict','The analysis destination changed; read it again before updating');
  let changed=false;
  await plugin.processTextAtVaultPath(path,current=>{
    if(current===markdown)return current;
    if(revision(path,!!current,current)!==expectedRevision)throw fail('conflict','The analysis changed while submitting; read it again before updating');
    changed=true;
    return markdown;
  });
  const result={ok:true,changed,selection,path,revision:revision(path,true,markdown)};
  // A display failure must not disguise an already successful file write.
  try{await plugin.reloadOpenNoriaViews('review');}catch(error){result.refreshError=String(error?.message||error);}
  return result;
}
module.exports={readReview,prepareReview,submitAnalysis};
