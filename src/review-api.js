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
module.exports={readReview,prepareReview};
