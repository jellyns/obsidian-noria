"use strict";

// Reuse the section revision: independent diary edits survive, while advice
// changed by the user or an Agent must be reread before it can be replaced.
function suggestionEdit(api,source){
  let current={...source};
  return {
    snapshot:()=>({...current}),
    async save(markdown){
      const before=current;
      const after=await api.suggestions.update({date:before.date,revision:before.revision,markdown});
      current=after;
      let undone=false;
      return {before,after,async undo(){
        if(undone)return current;
        const restored=await api.suggestions.update({date:after.date,revision:after.revision,markdown:before.markdown});
        undone=true;current=restored;return restored;
      }};
    }
  };
}
module.exports={suggestionEdit};
