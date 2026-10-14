import * as THREE from 'three'

/** Clamped cubic B-spline profile: stays inside its control hull and never
 * overshoots into negative radii. Used by both garment geometry and its UV mask
 * so rounded hems/shoulders retain exactly aligned painted trim. */
export function residentProfile(points:ReadonlyArray<readonly [number,number]>) {
  const degree=3,last=points.length-1
  const knots=Array.from({length:points.length+degree+1},(_,i)=>
    i<=degree?0:i>=points.length?1:(i-degree)/(points.length-degree))
  const getPoint=(t:number)=>{
    t=THREE.MathUtils.clamp(t,0,1)
    let span=degree
    while(span<last&&t>=knots[span+1])span++
    const d=Array.from({length:degree+1},(_,j)=>new THREE.Vector2(...points[span-degree+j]))
    for(let r=1;r<=degree;r++)for(let j=degree;j>=r;j--){
      const i=span-degree+j,denom=knots[i+degree-r+1]-knots[i]
      const alpha=denom?(t-knots[i])/denom:0
      d[j].lerpVectors(d[j-1],d[j],alpha)
    }
    return d[degree]
  }
  return {getPoint,getPoints:(segments:number)=>Array.from({length:segments+1},(_,i)=>getPoint(i/segments))}
}
