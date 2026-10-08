import assert from 'node:assert/strict'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
  const page=await browser.newPage({ignoreHTTPSErrors:true})
  await page.goto(process.env.REVIEW_URL || 'https://localhost:5173')
  const result=await page.evaluate(async()=>{
    const {selectResidentDesign:pick}=await import('/src/resident-selection.ts')
    const {residentDesigns}=await import('/src/resident-designs.ts')
    const all=residentDesigns.map((_,i)=>i)
    const possibilities=(existing,seed)=>all.map(i=>pick(existing,seed,()=>i/all.length))
    for(const seed of [0,1,17,98121]){
      const occupied=[0,0,2,5,11,15]
      const missing=all.filter(i=>!occupied.includes(i))
      const sampled=possibilities(occupied,seed)
      if(sampled.some(i=>occupied.includes(i))||new Set(sampled).size!==missing.length)throw Error('Missing species are not preferred/reachable')
      if(new Set(possibilities([],seed)).size!==all.length)throw Error('Empty village cannot select every species')
      if(new Set(possibilities(all,seed)).size!==all.length)throw Error('Full roster must still allow all species')
      for(const absent of all){
        if(possibilities(all.filter(i=>i!==absent),seed).some(i=>i!==absent))throw Error('Last missing/departed species must be selected')
      }
      const roster=[]
      for(let i=0;i<all.length;i++)roster.push(pick(roster,seed,()=>.73))
      if(new Set(roster).size!==all.length)throw Error('First 16 arrivals must be different')
    }
    // Invalid/legacy entries are harmless, and selection does not reserve or mutate.
    const existing=[undefined,-1,999,0],before=[...existing]
    const first=pick(existing,0,()=>0),retry=pick(existing,0,()=>0)
    if(first!==retry||existing.some((v,i)=>v!==before[i])||first===0)throw Error('Selection reserved or mutated village data')
    return {species:all.length,missingFirst:true,fullRosterFallback:true,departedEligible:true,cancelDoesNotReserve:true}
  })
  assert.equal(result.species,16)
  console.log(JSON.stringify(result,null,2))
}finally{await browser.close()}
