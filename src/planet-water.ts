/** The swimmer and GPU surface use the same small, continuous radial swell. */
export const WATER_LEVEL = -.046
export function waterSwell(x:number,y:number,z:number,time:number) {
  return .0026*Math.sin(x*19+y*13+time*1.25)+.0014*Math.sin(z*23-y*11-time*.93)
}
export const waterSwellGLSL=`
float waterSwell(vec3 p,float t) {
  return .0026*sin(p.x*19.0+p.y*13.0+t*1.25)+.0014*sin(p.z*23.0-p.y*11.0-t*.93);
}`
