type Motif=readonly [kind:number,x:number,y:number,size:number]
type Fish=readonly [x:number,y:number,direction:number,size:number]

/** Reference-led hierarchy: patterned fish, medium musical accents and
 * tiny pearly punctuation. Portrait is recomposed rather than scaled/cropped. */
export function skyLayout(width:number,height:number){
  const portrait=width/height<.8
  const unit=Math.max(.58,Math.min(1.25,width/1150))
  const fish:Fish[]=portrait?[
    [.25,.285,1,1.35],[.95,.40,-1,1.6],[.14,.685,1,1.05],[.90,.715,-1,1.65],
  ]:[
    [.24,.255,1,1.6],[.92,.36,-1,1.85],[.24,.79,1,1.3],[.92,.76,-1,2],
  ]
  const motifs:Motif[]=portrait?[
    [0,.07,.235,58],[0,.96,.60,46],[0,.17,.87,36],
    [1,.08,.375,94],[1,.87,.275,76],[1,.68,.685,48],
    [2,.57,.245,43],[2,.08,.58,52],[2,.95,.85,38],
    [3,.48,.685,119],
  ]:[
    [0,.38,.16,45],[0,.965,.50,61],[0,.32,.90,33],
    [1,.16,.29,119],[1,.74,.24,93],[1,.82,.85,56],
    [2,.58,.16,59],[2,.94,.58,96],[2,.26,.66,48],[2,.68,.92,35],
    [3,.795,.57,147],
  ]
  // Large soap-film clusters are background punctuation, not opaque discs.
  const bubbles=portrait?[
    [.04,.24,38],[.92,.56,49],[.06,.68,27],[.96,.9,32],
  ]:[
    [.065,.26,64],[.95,.61,73],[.34,.86,39],[.73,.18,37],[.97,.92,52],
  ]
  // Reduce every species equally; preserve relative proportions and placement.
  const scaledFish=fish.map(([x,y,direction,size]):Fish=>[x,y,direction,size*.55])
  return {portrait,unit,fish:scaledFish,motifs,bubbles}
}
