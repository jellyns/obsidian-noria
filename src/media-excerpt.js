"use strict";
const {readSection}=require('./media-content-model.js');
const {preview}=require('./inbox-card-model.js');

// Reuse the note preview language, excluding hidden comments and embedded media.
function excerpt(value){
  return preview(String(value||'').replace(/%%[\s\S]*?(?:%%|$)/g,'').replace(/<!--[\s\S]*?(?:-->|$)/g,'')
    .replace(/!\[\[[^\]]*\]\]/g,'').replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/^\s*#{1,6}\s+.*$/gm,''),'');
}
function mediaExcerpt(raw,profile,description){
  const review=excerpt(readSection(raw,profile.review).content);
  if(review)return {text:review,label:profile.review,kind:'review'};
  const intro=readSection(raw,profile.intro);
  const text=excerpt(intro.exists?intro.content:description);
  return text?{text,label:profile.intro,kind:'intro'}:null;
}
module.exports={mediaExcerpt};
