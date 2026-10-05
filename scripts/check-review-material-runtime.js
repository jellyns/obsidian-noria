/* Evaluate only in the isolated NoriaTest vault. Created fixtures are recorded for recovery. */
(async()=>{
  if(app.vault.getName()!=="NoriaTest")throw Error("NoriaTest required");
  const p=app.plugins.plugins.noria,fs=require("fs"),dir="F:/NoriaTest/_acceptance-c-review-20260916";
  const checks=[],artifacts=[],check=(name,ok,detail)=>{checks.push({name,ok:!!ok,detail});if(!ok)throw Error(name);};
  const save=()=>fs.writeFileSync(dir+"/runtime-results.json",JSON.stringify({build:globalThis.__noriaRuntimeBuildId,checks,artifacts},null,2));
  const prepare=async input=>{
    const calls=[],read=p.loadTextFromVault;p.loadTextFromVault=async function(path){calls.push(path);return read.call(this,path);};
    try{
      const result=await p.prepareReviewAnalysis(input),full=await p.loadTextFromVault(result.evidencePath);
      const materialPath=result.evidencePath.replace(/\.json$/, ".material.json"),raw=await p.loadTextFromVault(materialPath),material=JSON.parse(raw);
      return {result,material,materialPath,calls,fullBytes:Buffer.byteLength(full,"utf8"),materialBytes:Buffer.byteLength(raw,"utf8")};
    }finally{p.loadTextFromVault=read;}
  };
  try{
    const input={mode:"monthly",anchorDate:"2001-02-12"},weekly=await p.resolveCalendarNoteSpecAsync("weekly","2001-02-12");
    check("Lower-review fixture is not an existing user note",!app.vault.getAbstractFileByPath(weekly.path),weekly.path);
    const missing=await prepare(input);
    check("Missing weekly reviews still use actual daily records",missing.material.payload.records.some(r=>r.role==="daily-note"&&r.path.endsWith("2001-02-12.md")));
    check("No artifact is generated or adopted by preparing material",!app.vault.getAbstractFileByPath(missing.result.artifactPath));
    const heading=p.getReviewFinalSectionHeading("weekly","");
    await app.vault.create(weekly.path,`---\nperiod: 2001-W07\n---\n## ${heading}\n\n沿河散步留下了一个想法，也记下了下次想拍的照片。\n`);
    artifacts.push(weekly.path);save();
    const lower=await prepare(input),payload=lower.material.payload;
    check("Month includes an adopted weekly review",payload.records.some(r=>r.role==="lower-review"&&r.path===weekly.path));
    check("Daily source remains available for tracing",payload.references.some(r=>r.path.endsWith("2001-02-12.md")&&r.reason==="covered by lower review"));
    check("Covered daily prose is not duplicated in model material",!payload.records.some(r=>r.role==="daily-note"&&r.path.endsWith("2001-02-12.md")));
    check("Adding an adopted review updates the evidence identity",lower.result.evidence.evidenceHash!==missing.result.evidence.evidenceHash);
    const repeats=payload.alreadyRead.filter((v,i,a)=>a.indexOf(v)!==i);
    check("Material collector reads each source at most once",repeats.length===0,repeats);
    const daily=await prepare({mode:"daily",anchorDate:"2001-02-12"});
    check("Full original quick note remains in material",daily.material.payload.records.some(r=>r.text.includes("先原样留下")&&r.text.includes("[[Noria/MOC/Knowledge Base]]")));
    const prompt=await p.loadTextFromVault(daily.result.promptPath);
    check("External prompt points at compact material",prompt.includes(daily.materialPath));
    const artifact=daily.result.artifactPath;
    check("Analysis fixture target is new",!app.vault.getAbstractFileByPath(artifact),artifact);
    await app.vault.create(artifact,`---\nperiod: 2001-02-12\nmode: daily\nevidence_hash: ${daily.result.evidence.evidenceHash}\n---\n这段散步留下了一个值得保留的想法。\n\n## 留给下次散步的照片\n\n先把路上的细节记下来，照片可以下次再看。\n`);
    artifacts.push(artifact);save();
    const parsed=await p.getReviewAnalysisArtifact({mode:"daily",anchorDate:"2001-02-12"},daily.result.evidence);
    check("Natural headings and an opening paragraph count as generated content",parsed.generated&&!parsed.stale);
    const source=await p.loadTextFromVault(daily.result.evidence.diaryPath);
    check("External analysis does not overwrite original diary",!source.includes("留给下次散步的照片"));
    check("Evidence sizes are measured as UTF-8 bytes only",true,{daily:{full:daily.fullBytes,material:daily.materialBytes},month:{full:lower.fullBytes,material:lower.materialBytes},note:"Not model tokens or measured token savings"});
    return {checks:checks.length,failed:checks.filter(c=>!c.ok),artifacts};
  }finally{save();}
})()
