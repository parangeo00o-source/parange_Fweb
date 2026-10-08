import * as THREE from 'three'

// One continuous latitude contour describes the bay AND southern sea. This
// avoids the pinched junction made by intersecting a circular bay with a cap.
const rearLake=new THREE.Vector3(Math.cos(.18)*Math.sin(2.82),Math.sin(.18),Math.cos(.18)*Math.cos(2.82))
const blend=.13,lakeRadius=.26
const smoothMin=(a:number,b:number)=>{
  const h=Math.max(blend-Math.abs(a-b),0)/blend
  return Math.min(a,b)-h*h*blend*.25
}
export function islandBank(n:THREE.Vector3) {
  const longitudeCos=n.z/Math.max(.001,Math.hypot(n.x,n.z))
  const polarFade=1-THREE.MathUtils.smoothstep(Math.abs(n.y),.90,.99)
  const longitude=Math.atan2(n.x,n.z)
  const bay=.36*Math.exp((longitudeCos-1)*6.0)*polarFade
  // Broad scallops, not high-frequency coastline noise or intersecting circles.
  const scallop=(.025*Math.sin(longitude*3+.4)+.012*Math.sin(longitude*7-.6))*polarFade
  const sea=(n.y+.87-bay+scallop)*.78
  const lake=n.distanceTo(rearLake)-lakeRadius
  return smoothMin(sea,lake)+.012*Math.sin(n.x*11+n.z*6)*Math.sin(n.y*9-n.z*4)
}

// CPU navigation and fragment shading share the same constants and formula.
export const islandCoastGLSL=`
float islandBank(vec3 n) {
  float longitudeCos=n.z/max(.001,length(n.xz));
  float polarFade=1.0-smoothstep(.90,.99,abs(n.y));
  float longitude=atan(n.x,n.z);
  float bay=.36*exp((longitudeCos-1.0)*6.0)*polarFade;
  float scallop=(.025*sin(longitude*3.0+.4)+.012*sin(longitude*7.0-.6))*polarFade;
  float sea=(n.y+.87-bay+scallop)*.78;
  float lake=distance(n,vec3(${rearLake.toArray().map(v=>v.toFixed(10)).join(',')}))-${lakeRadius};
  float h=max(${blend}-abs(sea-lake),0.0)/${blend};
  return min(sea,lake)-h*h*${blend}*.25+.012*sin(n.x*11.0+n.z*6.0)*sin(n.y*9.0-n.z*4.0);
}`
