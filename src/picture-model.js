"use strict";
const imageExtensions=new Set(["png","jpg","jpeg","webp","svg"]);
function validPicture(value){
 if(typeof value!=="string"||value.length>512)return false;
 if(/^[a-z][a-z0-9-]*$/.test(value))return true;
 if(/^asset:[a-z0-9-]+$/.test(value))return true;
 if(value.startsWith("emoji:")){try{const text=decodeURIComponent(value.slice(6));return text.length>0&&text.length<=32&&!/[\x00-\x1f<>]/.test(text);}catch(_){return false;}}
 return false;
}
function renamedAssets(assets,oldPath,newPath){return Object.fromEntries(Object.entries(assets||{}).map(([id,path])=>[id,path===oldPath?newPath:path.startsWith(oldPath+"/")?newPath+path.slice(oldPath.length):path]));}
module.exports={validPicture,imageExtensions,renamedAssets};
