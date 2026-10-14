import * as THREE from 'three'
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js'

let template:THREE.BufferGeometry|undefined

/** A single watertight branched surface; no intersecting tubes/tip balls. */
export function residentAntlerGeometry():THREE.BufferGeometry {
  if(template)return template.clone()
  const paths:Array<{points:number[][];radius:[number,number]}>= [
    {points:[[0,-.02,0],[.025,.09,0],[.055,.185,0],[.044,.255,-.008]],radius:[.042,.027]},
    {points:[[.016,.068,0],[.08,.115,0],[.135,.178,.004]],radius:[.033,.021]},
    {points:[[.034,.13,0],[-.012,.17,.005],[-.032,.216,.004]],radius:[.027,.019]},
  ]
  const segments: Array<{a:THREE.Vector3;b:THREE.Vector3;r0:number;r1:number}>=[]
  for(const path of paths){
    const curve=new THREE.CatmullRomCurve3(path.points.map(p=>new THREE.Vector3(...p as [number,number,number])))
    for(let i=0;i<10;i++)segments.push({a:curve.getPoint(i/10),b:curve.getPoint((i+1)/10),
      r0:THREE.MathUtils.lerp(...path.radius,i/10),r1:THREE.MathUtils.lerp(...path.radius,(i+1)/10)})
  }
  const resolution=48,temporaryMaterial=new THREE.MeshBasicMaterial()
  const field=new MarchingCubes(resolution,temporaryMaterial,false,false,16000)
  field.isolation=0
  const p=new THREE.Vector3(),ab=new THREE.Vector3(),ap=new THREE.Vector3()
  for(let z=0;z<resolution;z++)for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++){
    // Include the closed root cap plus the mesher's two-cell boundary margin.
    p.set((x/resolution*2-1)*.22,(y/resolution*2-1)*.22+.12,(z/resolution*2-1)*.22)
    let distance=1
    for(const segment of segments){
      ab.subVectors(segment.b,segment.a);ap.subVectors(p,segment.a)
      const t=THREE.MathUtils.clamp(ap.dot(ab)/ab.lengthSq(),0,1)
      const d=ap.addScaledVector(ab,-t).length()-THREE.MathUtils.lerp(segment.r0,segment.r1,t)
      // Small smooth union joins the forks without bulbous intersection rings.
      const h=Math.max(.007-Math.abs(distance-d),0)/.007
      distance=Math.min(distance,d)-h*h*.007*.25
    }
    field.field[x+resolution*(y+resolution*z)]=-distance
  }
  field.update()
  const count=field.geometry.drawRange.count
  template=new THREE.BufferGeometry()
  for(const name of ['position','normal']){
    const source=field.geometry.getAttribute(name)
    template.setAttribute(name,new THREE.Float32BufferAttribute(source.array.slice(0,count*3),3))
  }
  template.scale(.22,.22,.22);template.translate(0,.12,0)
  template.userData.connectedBranches=true
  field.geometry.dispose();temporaryMaterial.dispose()
  return template.clone()
}
