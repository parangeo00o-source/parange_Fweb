import * as THREE from 'three'

/** A shared HDR daylight probe. Broad sky/softbox lobes give curved objects
 * actual material highlights instead of stripes painted onto their surfaces.
 * The source is discarded after PMREM filtering; nothing is generated per frame. */
export function createIslandReflection(renderer:THREE.WebGLRenderer) {
  const width=512,height=256,pixels=new Float32Array(width*height*4)
  const sky=new THREE.Color('#b1d8f3'),ground=new THREE.Color('#789c91'),horizon=new THREE.Color('#f7f8e6')
  const key=new THREE.Vector3(-.48,.72,.50).normalize(),fill=new THREE.Vector3(.74,.28,.61).normalize()
  const rim=new THREE.Vector3(-.35,.35,-.87).normalize(),direction=new THREE.Vector3(),color=new THREE.Color()
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const theta=(1-(y+.5)/height)*Math.PI,phi=(x+.5)/width*Math.PI*2
    direction.set(-Math.cos(phi)*Math.sin(theta),Math.cos(theta),Math.sin(phi)*Math.sin(theta))
    color.copy(ground).lerp(sky,THREE.MathUtils.smoothstep(direction.y,-.25,.85))
    color.lerp(horizon,Math.exp(-direction.y*direction.y*18)*.42)
    const warm=3.6*Math.exp((direction.dot(key)-1)*22)
    const cool=1.65*Math.exp((direction.dot(fill)-1)*12)
    const edge=2.1*Math.exp((direction.dot(rim)-1)*28)
    const i=(y*width+x)*4
    pixels[i]=color.r+warm+cool*.66+edge*.80
    pixels[i+1]=color.g+warm*.95+cool*.85+edge*.92
    pixels[i+2]=color.b+warm*.84+cool+edge
    pixels[i+3]=1
  }
  const source=new THREE.DataTexture(pixels,width,height,THREE.RGBAFormat,THREE.FloatType)
  source.mapping=THREE.EquirectangularReflectionMapping;source.needsUpdate=true
  const generator=new THREE.PMREMGenerator(renderer),target=generator.fromEquirectangular(source)
  target.texture.name='island-soft-daylight-hdr'
  source.dispose();generator.dispose()
  return target
}

/** Retina detail without unbounded 3×/4× mobile render targets. */
export function islandPixelRatio(width:number,height:number,dpr:number) {
  return Math.min(Math.max(1,dpr),2,Math.sqrt(4_000_000/Math.max(1,width*height)))
}

/** Soft contact pigment under rooted scenery, baked once into existing ground
 * vertices. No screen-space blur pass, floating shadow cards or new draw calls. */
export function bakeIslandContact(geometry:THREE.BufferGeometry,sites:ReadonlyArray<{normal:THREE.Vector3;radius:number;strength:number}>) {
  const positions=geometry.attributes.position,colors=geometry.attributes.color,n=new THREE.Vector3()
  for(let i=0;i<positions.count;i++){
    n.fromBufferAttribute(positions,i).normalize()
    let shade=0
    for(const site of sites){
      const d=n.distanceToSquared(site.normal)/(site.radius*site.radius)
      if(d<9)shade=Math.max(shade,site.strength*Math.exp(-d*1.6))
    }
    // A cool green occlusion hue avoids dirty brown patches in sunlit grass.
    colors.setXYZ(i,colors.getX(i)*(1-shade),colors.getY(i)*(1-shade*.83),colors.getZ(i)*(1-shade*.55))
  }
  colors.needsUpdate=true;geometry.userData.bakedIslandContact=true
}
