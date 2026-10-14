import * as THREE from 'three'

/** Neon paints a smooth sphere, not the raised terrain used by the 3D editions.
 * All grounded illustrations share this radius; only intentional motion adds lift. */
export const neonGroundRadius=3.03
export function neonGroundPoint(normal:THREE.Vector3,lift=0){
  return normal.clone().normalize().multiplyScalar(neonGroundRadius+lift)
}

/** No screen-upright angle clamp: local -Y is the projected surface normal. */
export function surfaceAngle(base:{x:number;y:number},tip:{x:number;y:number}){
  const dx=tip.x-base.x,dy=tip.y-base.y
  return Math.hypot(dx,dy)<.001?0:Math.atan2(dx,-dy)
}

export function sphereOccludes(point:THREE.Vector3,eye:THREE.Vector3,radius=3.025){
  const ray=point.clone().sub(eye),length=ray.length();ray.divideScalar(length||1)
  const b=eye.dot(ray),d=b*b-eye.lengthSq()+radius*radius
  return d>0&&-b-Math.sqrt(d)>0&&-b-Math.sqrt(d)<length-.015
}

/** Clip in camera space BEFORE perspective division. Testing only the foot's
 * NDC or projecting a behind-camera horizon caused whole objects to pop out. */
export function clippedScreenPolygon(points:THREE.Vector3[],camera:THREE.PerspectiveCamera,width:number,height:number){
  let vertices=points.map(p=>p.clone().applyMatrix4(camera.matrixWorldInverse))
  const sy=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),sx=sy*camera.aspect
  const planes=[(p:THREE.Vector3)=>-p.z-camera.near,(p:THREE.Vector3)=>p.x-p.z*sx,(p:THREE.Vector3)=>-p.x-p.z*sx,(p:THREE.Vector3)=>p.y-p.z*sy,(p:THREE.Vector3)=>-p.y-p.z*sy]
  for(const distance of planes){
    const output:THREE.Vector3[]=[]
    for(let i=0;i<vertices.length;i++){
      const a=vertices[i],b=vertices[(i+1)%vertices.length],da=distance(a),db=distance(b)
      if(da>=0)output.push(a)
      if((da>=0)!==(db>=0))output.push(a.clone().lerp(b,da/(da-db)))
    }
    vertices=output;if(!vertices.length)break
  }
  return vertices.map(p=>{p.applyMatrix4(camera.projectionMatrix);return{x:(p.x*.5+.5)*width,y:(.5-p.y*.5)*height}})
}
