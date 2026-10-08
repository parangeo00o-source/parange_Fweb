import * as THREE from 'three'

const clamp=THREE.MathUtils.clamp
const ease=(v:number)=>{const t=clamp(v,0,1);return t*t*(3-2*t)}
export const arrivalDuration=(reduced:boolean)=>reduced?2600:5600
export function capsulePose(age:number,reduced=false) {
  if(reduced)return {phase:age<2600?'revealed':'flight',roll:1,wobble:0,open:1,release:1,turn:0,burst:0,fade:1}
  const roll=1-Math.pow(1-clamp(age/1250,0,1),3)
  return {
    phase:age<1250?'rolling':age<1900?'settling':age<2100?'opening':age<5600?'revealed':'flight',
    roll,wobble:age>=1250&&age<1900?Math.sin((age-1250)*.017)*Math.exp(-(age-1250)/240)*.19:0,
    // Release overlaps the opening: no empty, fully-open capsule waiting beat.
    open:ease((age-1900)/480),release:ease((age-2100)/450),
    turn:Math.PI*2*ease((age-2650)/2600),
    burst:Math.sin(Math.PI*clamp((age-2020)/650,0,1)),fade:age<2800?1:0,
  }
}
export type CapsulePose=ReturnType<typeof capsulePose>

/** HDR studio/sky lighting, sampled by the physical material's reflection
 * vector. Broad softboxes bend naturally over the sphere and moving lid. */
function capsuleReflectionEnvironment() {
  const width=512,height=256,pixels=new Float32Array(width*height*4)
  const key=new THREE.Vector3(-.48,.58,.66).normalize()
  const fill=new THREE.Vector3(.86,.15,.48).normalize()
  for(let row=0;row<height;row++)for(let col=0;col<width;col++){
    const latitude=((row+.5)/height-.5)*Math.PI,longitude=((col+.5)/width-.5)*Math.PI*2
    const y=Math.sin(latitude),x=Math.cos(latitude)*Math.cos(longitude),z=Math.cos(latitude)*Math.sin(longitude)
    const sky=THREE.MathUtils.smoothstep(y,-.25,.85)
    // Soft, elongated light sources with feathered borders, not painted bands.
    const softbox=12*Math.exp(-2*((x-key.x)**2/.42+(y-key.y)**2/.065+(z-key.z)**2/.34))
    const sidebox=5*Math.exp(-2*((x-fill.x)**2/.045+(y-fill.y)**2/.60+(z-fill.z)**2/.25))
    const horizon=.28*Math.exp(-(((y+.14)/.22)**2)),offset=(row*width+col)*4
    pixels[offset]=.025+.14*sky+softbox+sidebox*.72+horizon*.40
    pixels[offset+1]=.08+.27*sky+softbox+sidebox*.95+horizon
    pixels[offset+2]=.055+.44*sky+softbox*.92+sidebox+horizon*.82
    pixels[offset+3]=1
  }
  const map=new THREE.DataTexture(pixels,width,height,THREE.RGBAFormat,THREE.FloatType)
  map.name='capsule-softbox-environment';map.mapping=THREE.EquirectangularReflectionMapping
  map.colorSpace=THREE.LinearSRGBColorSpace;map.needsUpdate=true
  return map
}

/** Hinged glass hemispheres, rim and latch are actual 3D surfaces.
 * One reusable effect rig per arrival; all owned GPU resources are released. */
export function createArrivalCapsule(scene:THREE.Scene) {
  const group=new THREE.Group();group.name='arrival-capsule';scene.add(group)
  const shell=new THREE.Group();group.add(shell)
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>()
  const add=(parent:THREE.Object3D,name:string,geometry:THREE.BufferGeometry,material:THREE.Material)=>{
    geometries.add(geometry);materials.add(material)
    const mesh=new THREE.Mesh(geometry,material);mesh.name=name;parent.add(mesh);return mesh
  }
  // Dense tinted resin like the reference's blue/green game ball, rather than
  // a nearly invisible soap bubble. Keep some translucency during the opening.
  const reflectionMap=capsuleReflectionEnvironment()
  const glass=new THREE.MeshPhysicalMaterial({color:'#289cbd',transparent:true,opacity:.76,roughness:.24,metalness:0,ior:1.46,clearcoat:.9,clearcoatRoughness:.23,side:THREE.DoubleSide,depthWrite:false,envMap:reflectionMap,envMapIntensity:1.35})
  const green=glass.clone();green.color.set('#16975b');green.opacity=.88
  for(const material of [glass,green]){
    // The world's three small lights light the character, but made pinprick
    // dots on this glossy shell. Let broad environment reflection dominate it.
    material.onBeforeCompile=shader=>{
      shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
        reflectedLight.directSpecular *= .12;
        #ifdef USE_CLEARCOAT
          clearcoatSpecularDirect *= .12;
        #endif
      `)
    }
    material.customProgramCacheKey=()=> 'capsule-softbox-resin-v1'
  }
  const rim=new THREE.MeshStandardMaterial({color:'#c3eee1',metalness:.28,roughness:.25,emissive:'#507c78',emissiveIntensity:.10,transparent:true})
  const white=new THREE.MeshBasicMaterial({color:'#efffff',transparent:true,opacity:.48,depthWrite:false})
  const bottom=add(shell,'capsule-bottom',new THREE.SphereGeometry(1,64,32,0,Math.PI*2,Math.PI/2,Math.PI/2),green)
  const hinge=new THREE.Group();hinge.name='capsule-hinge';hinge.position.z=-1;shell.add(hinge)
  const lid=new THREE.Group();lid.position.z=1;hinge.add(lid)
  add(lid,'capsule-lid',new THREE.SphereGeometry(1,64,32,0,Math.PI*2,0,Math.PI/2),glass)
  for(const [parent,name] of [[shell,'bottom-rim'],[lid,'lid-rim']] as const){
    const ring=add(parent,name,new THREE.TorusGeometry(1,.018,12,80),rim);ring.rotation.x=Math.PI/2
  }
  const latch=add(shell,'capsule-latch',new THREE.SphereGeometry(1,24,16),rim);latch.position.set(0,0,1);latch.scale.set(.13,.13,.06)
  const lens=add(shell,'capsule-latch-light',new THREE.SphereGeometry(1,20,12),white);lens.position.set(0,0,1.052);lens.scale.set(.071,.071,.027)
  const glowCanvas=document.createElement('canvas');glowCanvas.width=128;glowCanvas.height=128
  const ctx=glowCanvas.getContext('2d')!,gradient=ctx.createRadialGradient(64,64,0,64,64,64)
  gradient.addColorStop(0,'#ffffeb');gradient.addColorStop(.2,'#ffffbadd');gradient.addColorStop(.48,'#b9ffe866');gradient.addColorStop(1,'#8eeaff00')
  ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128)
  const glowMap=new THREE.CanvasTexture(glowCanvas)
  const glowMaterial=new THREE.SpriteMaterial({map:glowMap,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:0});materials.add(glowMaterial)
  const glow=new THREE.Sprite(glowMaterial);glow.name='capsule-opening-glow';glow.position.z=.18;group.add(glow)
  const shadowMaterial=new THREE.SpriteMaterial({map:glowMap,color:'#315607',transparent:true,depthWrite:false,opacity:.24});materials.add(shadowMaterial)
  const shadow=new THREE.Sprite(shadowMaterial);shadow.name='capsule-contact-shadow';shadow.scale.set(2.2,.20,1);group.add(shadow)
  const shape=new THREE.Shape()
  for(let j=0;j<10;j++){const a=Math.PI/2+j*Math.PI/5,r=j%2?.43:1;const x=Math.cos(a)*r,y=Math.sin(a)*r;if(j)shape.lineTo(x,y);else shape.moveTo(x,y)}shape.closePath()
  const starGeometry=new THREE.ShapeGeometry(shape)
  const colors=['#fff3a0','#ff74aa','#89f6ed','#fffef1']
  const sparks=Array.from({length:28},(_,i)=>{
    const material=new THREE.MeshBasicMaterial({color:colors[i%4],side:THREE.DoubleSide,transparent:true,depthWrite:false})
    return add(group,'capsule-star-spark',starGeometry,material)
  })
  const light=new THREE.PointLight('#fff3b4',0,5,2);light.name='capsule-opening-light';light.position.set(1,2,3);group.add(light)
  let disposed=false
  return {group,update:(age:number,pose:CapsulePose,center:THREE.Vector3,radius:number,leftEdge:number,reduced:boolean,rearClearance=radius)=>{
    if(disposed)return
    group.visible=pose.phase!=='flight';group.position.copy(center);group.scale.setScalar(radius)
    shell.visible=!reduced&&pose.fade>0
    const entryX=leftEdge-center.x-radius*1.5
    shell.position.set(entryX*(1-pose.roll)/radius,-.08+Math.abs(pose.wobble)*.4,0)
    shell.rotation.z=-entryX/radius*(1-pose.roll)+pose.wobble
    hinge.rotation.x=-pose.open*1.92
    // Clear the character's depth BEFORE revealing it. The shell then leaves
    // downwards at its original opacity; it never dissolves through the body.
    const clearBack=ease((age-1940)/150),depart=ease((age-2350)/450)
    shell.position.z=-(1+rearClearance/radius+.15)*clearBack
    shell.position.y-=depart*4.2
    shadow.visible=shell.visible;shadow.position.set(shell.position.x,-1.11,-.12);shadowMaterial.opacity=.24*pose.fade*(1-pose.release)
    glow.position.z=-rearClearance/radius-.25
    glowMaterial.opacity=reduced?0:pose.burst*.65;glow.scale.setScalar(2.4+pose.burst*2.2)
    light.intensity=2.5+(reduced?0:pose.burst*(1-pose.release))
    const ageBurst=clamp((age-2020)/900,0,1)
    sparks.forEach((spark,i)=>{
      const a=i*2.39996,d=.25+ageBurst*(1.2+(i%5)*.17)
      spark.visible=!reduced&&age>2020&&ageBurst<1
      spark.position.set(Math.cos(a)*d,Math.sin(a)*d-ageBurst*ageBurst*.4,.3+(i%3)*.06)
      spark.rotation.z=a+ageBurst*2;spark.scale.setScalar((.045+(i%3)*.022)*(1-ageBurst*.45))
      ;(spark.material as THREE.MeshBasicMaterial).opacity=Math.sin(Math.PI*ageBurst)
    })
    bottom.userData.open=pose.open;group.userData.phase=pose.phase
  },dispose:()=>{
    if(disposed)return;disposed=true;group.removeFromParent();group.clear()
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());glowMap.dispose();reflectionMap.dispose()
  }}
}
