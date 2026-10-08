import {residentDesigns} from './resident-designs'

/** Prefer species missing from the current village, not from past generations.
 * Cancelled arrivals and departed neighbors must not reserve a species. */
export function selectResidentDesign(existing:readonly (number|undefined)[],temperament:number,random:()=>number=Math.random) {
  const occupied=new Set(existing)
  const all=residentDesigns.map((_,index)=>index)
  const missing=all.filter(index=>!occupied.has(index))
  const candidates=missing.length?missing:all
  return candidates[(Math.abs(temperament)+Math.floor(random()*candidates.length))%candidates.length]
}
