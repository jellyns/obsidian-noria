"use strict";
const {extractH2Section}=require('./public-api.js');

// Only the configured daily notes in the recent month are candidates. An
// explicit empty Suggestions section ends the search, including after removal.
async function recentSuggestionSource(source,{resolvePath,read}){
  const day=new Date(source.date+'T12:00:00Z');
  if(!Number.isFinite(+day)||day.toISOString().slice(0,10)!==source.date)return source;
  for(let offset=0;offset<30;offset++){
    const date=day.toISOString().slice(0,10),path=offset?await resolvePath(date):source.path;
    const candidate={...source,date,path};
    try{
      const raw=await read(path);
      if(raw!=null&&extractH2Section(raw,'建议').found)return candidate;
    }catch{return candidate;} // Let the normal card show the source error, never silently substitute older advice.
    day.setUTCDate(day.getUTCDate()-1);
  }
  return source;
}
module.exports={recentSuggestionSource};
