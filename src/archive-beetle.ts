import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

type Track = (g: THREE.BufferGeometry, m: THREE.Material) => void
type Surface = (w:number,h:number,draw:(ctx:CanvasRenderingContext2D)=>void)=>THREE.Texture
const V = (x:number,y:number,z:number) => new THREE.Vector3(x,y,z)
const signedPow = (n:number,p:number) => Math.sign(n)*Math.pow(Math.abs(n),p)

/** Hollow automotive shell and six independently articulated walking legs. */
export function createArchiveBeetle(model:THREE.Group, makeTexture:Surface, track:Track) {
  const paint = new THREE.MeshPhysicalMaterial({color:'#087ca8',metalness:.32,roughness:.32,clearcoat:1,clearcoatRoughness:.27,side:THREE.DoubleSide})
  const cream = new THREE.MeshPhysicalMaterial({color:'#e9dfba',metalness:.12,roughness:.35,clearcoat:.8})
  const chrome = new THREE.MeshStandardMaterial({color:'#d0e1dd',metalness:.95,roughness:.21})
  const rubber = new THREE.MeshStandardMaterial({color:'#101e22',roughness:.68})
  const mechanical = new THREE.MeshStandardMaterial({color:'#273b40',metalness:.8,roughness:.3})
  const glass = new THREE.MeshPhysicalMaterial({color:'#214451',metalness:.12,roughness:.21,clearcoat:1,clearcoatRoughness:.08,side:THREE.DoubleSide})
  const lamp = new THREE.MeshPhysicalMaterial({color:'#f1f0d3',emissive:'#def4e4',emissiveIntensity:.35,roughness:.2,metalness:.1,clearcoat:1})
  const amber = new THREE.MeshPhysicalMaterial({color:'#ef9c36',emissive:'#c85d13',emissiveIntensity:.22,roughness:.25,clearcoat:1})
  const red = new THREE.MeshPhysicalMaterial({color:'#ac3931',emissive:'#8b211b',emissiveIntensity:.2,roughness:.22,clearcoat:1})
  const mesh=(g:THREE.BufferGeometry,m:THREE.Material,p:THREE.Vector3,parent:THREE.Object3D=model)=>{
    track(g,m);const item=new THREE.Mesh(g,m);item.position.copy(p);item.castShadow=item.receiveShadow=true;parent.add(item);return item
  }
  function box(w:number,h:number,d:number,p:THREE.Vector3,m:THREE.Material,r=.05,parent:THREE.Object3D=model){return mesh(new RoundedBoxGeometry(w,h,d,3,r),m,p,parent)}
  function ellipsoid(p:THREE.Vector3,scale:THREE.Vector3,m:THREE.Material,parent:THREE.Object3D=model){const item=mesh(new THREE.SphereGeometry(1,40,24),m,p,parent);item.scale.copy(scale);return item}
  function tube(points:THREE.Vector3[],radius:number,m:THREE.Material,parent:THREE.Object3D=model,closed=false){
    return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,closed),Math.max(32,points.length*4),radius,8,closed),m,V(0,0,0),parent)
  }
  function surface(fn:(u:number,v:number)=>THREE.Vector3, m:THREE.Material, parent:THREE.Object3D=model, flip=false, nu=32,nv=96){
    const p:number[]=[],uv:number[]=[],indices:number[]=[]
    for(let i=0;i<=nu;i++)for(let j=0;j<=nv;j++){const a=fn(i/nu,j/nv);p.push(a.x,a.y,a.z);uv.push(j/nv,i/nu);if(i<nu&&j<nv){const a=i*(nv+1)+j,b=a+nv+1;indices.push(...(flip?[a,b,a+1,a+1,b,b+1]:[a,a+1,b,a+1,b+1,b]))}}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return mesh(g,m,V(0,0,0),parent)
  }
  const coachworkParts: THREE.Object3D[] = []
  const innerShell = new THREE.MeshStandardMaterial({color:"#274551",metalness:.42,roughness:.55,side:THREE.DoubleSide})
  // The superellipse gives the cargo bay usable corners inside an organic oval.
  const perimeter=(a:number,r=1)=>V(9.4*signedPow(Math.cos(a),.78)*r,2.08,6.55*signedPow(Math.sin(a),.78)*r)
  const bowl=(u:number,v:number)=>{const a=u*Math.PI/2,p=perimeter(v*Math.PI*2,Math.cos(a));p.y=2.08-2.85*Math.sin(a);return p}
  surface(bowl,paint).name='beetle-lower-shell'
  surface((u,v)=>{const p=bowl(u,v);p.x*=.973;p.z*=.973;p.y+=.13*(1-u);return p},rubber,model,true)
  surface((u,v)=>{const p=perimeter(v*Math.PI*2,1-u*.027);p.y+=u*.035;return p},mechanical,model,true,3,128).name='beetle-rim-flange'
  // Sealed chassis: service cover, stiffening rails and recessed fasteners.
  box(10.7,.2,7.8,V(0,-.68,0),mechanical,.22).name='beetle-undertray'
  for(const z of [-2.9,2.9])box(11.4,.18,.24,V(0,-.83,z),rubber,.06)
  for(const x of [-4.6,0,4.6])for(const z of [-3.3,3.3]){
    mesh(new THREE.CylinderGeometry(.105,.105,.07,6),chrome,V(x,-.81,z))
  }
  const rim=Array.from({length:96},(_,i)=>perimeter(i/96*Math.PI*2))
  tube(rim,.035,chrome,model,true)
  tube(rim.map(p=>p.clone().add(V(0,-.14,0))),.065,rubber,model,true)
  box(12.45,.13,10.3,V(0,.7,0),rubber,.055)

  // Swept ivory side inserts and chrome pinstriping reference mid-century microcars.
  for(const side of [-1,1]){
    const stripe=(u:number,v:number)=>{const theta=(.15+v*.7)*Math.PI*side;const y=1.43-u*(.08+.27*Math.sin(Math.PI*v));const a=Math.asin((2.08-y)/2.85);const p=perimeter(theta,Math.cos(a)+.004);p.y=y;return p}
    surface(stripe,cream,model,side<0,5,64)
    tube(Array.from({length:48},(_,i)=>stripe(1,i/47)),.037,chrome)
    for(const x of [-5.8,5.8]){
      // Rounded wheel-arch fairings conceal the leg attachment mechanism.
      // Each fairing splits at the same gasket plane as the body. Only the
      // upper cap moves, so no low-hanging pod sweeps through the fixed tray.
      const topCut=Math.acos((2.14-1.1)/2.1),bottomCut=Math.acos((2.06-1.1)/2.1)
      const upper=mesh(new THREE.SphereGeometry(1,64,24,0,Math.PI*2,0,topCut),paint,V(x,1.1,side*5.85))
      upper.scale.set(2.5,2.1,1.55);upper.name='beetle-fairing-upper';coachworkParts.push(upper)
      const lower=mesh(new THREE.SphereGeometry(1,64,32,0,Math.PI*2,bottomCut,Math.PI-bottomCut),paint,V(x,1.1,side*5.85))
      lower.scale.set(2.5,2.1,1.55);lower.name='beetle-fairing-lower'
      for(const upperHalf of [false,true]){
        const cut=upperHalf?topCut:bottomCut
        const cap=mesh(new THREE.CylinderGeometry(Math.sin(cut),Math.sin(cut),.04,64),upperHalf?innerShell:rubber,V(x,upperHalf?2.16:2.04,side*5.85))
        cap.scale.set(2.5,1,1.55)
        if(upperHalf)coachworkParts.push(cap)
      }
      // Recessed lower arch; the blue fairing blends into the shoulder above.
      const hub=mesh(new THREE.CylinderGeometry(.58,.58,.95,40),mechanical,V(x,-.1,side*5.96));hub.rotation.x=Math.PI/2
      const ring=mesh(new THREE.TorusGeometry(.52,.045,10,40),chrome,V(x,-.1,side*6.44));
      ring.rotation.y=side<0?Math.PI:0
      for(let i=0;i<12;i++){const a=i*Math.PI/6;box(.045,.35,.035,V(x+Math.sin(a)*.38,-.1+Math.cos(a)*.38,side*6.48),chrome,.01).rotation.z=-a}
    }
  }
  // Two domed headlamps, separate indicators, rubber bumper and a small nameplate.
  for(const side of [-1,1]){
    const lamps=new THREE.Group();lamps.position.set(-7.8,2.95,side*4.0);lamps.lookAt(V(-12,5.5,side*4.8));model.add(lamps);coachworkParts.push(lamps)
    ellipsoid(V(0,0,-.18),V(.91,1.0,.32),paint,lamps)
    mesh(new THREE.TorusGeometry(.64,.09,12,64),chrome,V(0,0,.26),lamps)
    ellipsoid(V(0,0,.28),V(.57,.69,.19),lamp,lamps)
    for(let i=-3;i<=3;i++)box(.018,.85-Math.abs(i)*.1,.016,V(i*.13,0,.464-Math.abs(i)*.015),chrome,.004,lamps)
    ellipsoid(V(.88,-.32,.15),V(.18,.13,.1),amber,lamps)
    ellipsoid(V(8.65,1.15,side*2.75),V(.18,.23,.6),red)
  }
  tube([V(-7.95,.25,-3.8),V(-9.12,.35,-1.8),V(-9.48,.4,0),V(-9.12,.35,1.8),V(-7.95,.25,3.8)],.13,chrome)
  tube([V(8.35,.3,-3),V(9.35,.35,0),V(8.35,.3,3)],.11,chrome)
  const badge=makeTexture(1024,256,ctx=>{ctx.fillStyle='#12262c';ctx.fillRect(0,0,1024,256);ctx.fillStyle='#ece5c9';ctx.font='700 100px Arial';ctx.textAlign='center';ctx.fillText('PARANGE',512,122);ctx.font='32px monospace';ctx.fillText('R–29   /   AUTOMATON',512,196)})
  const badgeMesh=mesh(new THREE.PlaneGeometry(2,.5),new THREE.MeshStandardMaterial({map:badge,roughness:.5}),V(-9.42,1.15,0));badgeMesh.rotation.y=-Math.PI/2
  for(let i=0;i<7;i++)box(.04,.03,2.3-Math.abs(i-3)*.28,V(8.8+i*.035,.15+i*.13,0),rubber,.01)

  // Entire glazed coachwork is the hinged cargo cover, with a real hollow inside.
  const pivot=new THREE.Group();pivot.name='beetle-canopy';pivot.position.set(0,2.38,-7.65);model.add(pivot)
  // Loft a raised, rearward cabin into a long rounded bonnet. Unlike an
  // ellipsoid, these coachwork sections have a distinct roof, glazing and shoulder.
  function canopy(phi:number,theta:number,offset=0){
    const c=signedPow(Math.cos(theta),.88),s=signedPow(Math.sin(theta),.88)
    const edge=perimeter(theta)
    const curve=new THREE.CatmullRomCurve3([
      V(1.8,5.45,0),
      V(1.65+4.6*c,5.05,3.15*s),
      V(1.2+6.05*c,3.8,4.65*s),
      V(.55+7.65*c,1.55,5.75*s),
      V(edge.x,0,edge.z),
    ],false,'catmullrom',.45)
    const t=THREE.MathUtils.clamp(phi/(Math.PI/2),0,1)
    let p=curve.getPoint(t)
    if(t<.25){
      const q=t*4,q2=q*q,q3=q2*q
      const p0=V(1.8,5.45,0),p1=V(1.65+4.6*c,5.05,3.15*s)
      const m0=V(4.6*c*1.2-.15,0,3.15*s*1.2)
      const m1=V(1.2+6.05*c-1.8,3.8-5.45,4.65*s).multiplyScalar(.45)
      p=p0.multiplyScalar(2*q3-3*q2+1).addScaledVector(m0,q3-2*q2+q).addScaledVector(p1,-2*q3+3*q2).addScaledVector(m1,q3-q2)
    }
    p.y+=offset-.24;p.z+=7.65;return p
  }
  const patch=(lo:number,hi:number,start:number,end:number,m:THREE.Material,offset=0)=>surface((u,v)=>canopy(lo+(hi-lo)*u,start+(end-start)*v,offset),m,pivot,false,48,128)
  const roof=.43,belt=.95
  // One continuous skin under the glazing: no missing wedges at the pillars.
  const skin=patch(0,Math.PI/2,0,Math.PI*2,paint)
  skin.name='beetle-continuous-coachwork'
  const roofNormals=skin.geometry.getAttribute('normal')
  for(let i=0;i<=128;i++)roofNormals.setXYZ(i,0,1,0)
  roofNormals.needsUpdate=true
  const innerPoint=(phi:number,theta:number)=>{
    const p=canopy(phi,theta);p.x=1.8+(p.x-1.8)*.983;p.z=7.65+(p.z-7.65)*.983;p.y-=.12;return p
  }
  const innerMesh=surface((u,v)=>innerPoint(u*Math.PI/2,v*Math.PI*2),innerShell,pivot,true,48,128)
  innerMesh.name='beetle-inner-coachwork'
  const innerNormals=innerMesh.geometry.getAttribute('normal');for(let i=0;i<=128;i++)innerNormals.setXYZ(i,0,-1,0);innerNormals.needsUpdate=true
  surface((u,v)=>canopy(Math.PI/2,v*Math.PI*2).lerp(innerPoint(Math.PI/2,v*Math.PI*2),u),mechanical,pivot,false,3,128).name='beetle-cover-return-flange'
  for(const part of coachworkParts){part.position.sub(pivot.position);pivot.add(part)}
  // A broad front windscreen, two side doors with quarter lights, rear glass.
  const pillars=[-.64,.64,1.5,2.43,3.85,4.78,Math.PI*2-.64]
  for(let i=0;i<pillars.length-1;i++){
    const start=pillars[i],end=pillars[i+1],gap=.045
    patch(roof,belt,start+gap,end-gap,glass,.045)
    const outline=[...Array.from({length:20},(_,j)=>canopy(roof,j/19*(end-start-2*gap)+start+gap,.065)),
      ...Array.from({length:20},(_,j)=>canopy(roof+(belt-roof)*j/19,end-gap,.065)),
      ...Array.from({length:20},(_,j)=>canopy(belt,end-gap-j/19*(end-start-2*gap),.065)),
      ...Array.from({length:20},(_,j)=>canopy(belt-(belt-roof)*j/19,start+gap,.065))]
    tube(outline,.038,rubber,pivot,true)
  }
  // Narrow metal glazing seals, bonnet shut-lines and recessed door handles.
  for(const side of [-1,1]){
    tube([canopy(.75,Math.PI+side*.24,.05),canopy(.87,Math.PI+side*.32,.05),canopy(.935,Math.PI+side*.46,.05)],.032,rubber,pivot)
    const door=Array.from({length:30},(_,i)=>canopy(belt+i/29*(Math.PI/2-belt),side*1.5,.022))
    tube(door,.026,rubber,pivot)
    tube(Array.from({length:36},(_,i)=>canopy(.955+i/35*.59,Math.PI+side*.59,.065)),.025,rubber,pivot)
    const handlePoint=canopy(1.07,side*1.56,.04)
    ellipsoid(handlePoint,V(.43,.09,.09),rubber,pivot)
    box(.58,.08,.1,handlePoint.clone().add(V(-.02,.04,side*.06)),chrome,.035,pivot)
    const mirrorPoint=canopy(.965,Math.PI-side*.92,.04)
    tube([mirrorPoint,mirrorPoint.clone().add(V(-.12,.32,side*.45))],.05,chrome,pivot)
    ellipsoid(mirrorPoint.clone().add(V(-.12,.32,side*.6)),V(.37,.21,.23),paint,pivot)
    ellipsoid(mirrorPoint.clone().add(V(.08,.34,side*.62)),V(.035,.15,.17),chrome,pivot)
    // Rear engine-deck louvers follow the curvature instead of floating above it.
    for(let i=0;i<5;i++)tube(Array.from({length:12},(_,j)=>canopy(1.16+i*.045,side*(.12+j/11*.4),.025)),.028,rubber,pivot)
  }
  tube(Array.from({length:40},(_,i)=>canopy(1.03+i/39*.49,Math.PI,.018)),.025,paint,pivot)
  const emblemPoint=canopy(1.4,Math.PI,.04)
  ellipsoid(emblemPoint,V(.13,.035,.22),chrome,pivot)
  // Formed inner lining follows the actual roof; no flat photographic insert.
  for(const theta of [.8,Math.PI/2,2.35,3.93,Math.PI*1.5,5.5]){
    tube(Array.from({length:48},(_,i)=>innerPoint(.035+i/47*1.5,theta).add(V(0,-.045,0))),.065,mechanical,pivot)
  }
  tube(Array.from({length:128},(_,i)=>innerPoint(Math.PI/2,i/128*Math.PI*2)),.07,rubber,pivot,true)
  // External pin axis clears both the rolled rim and the moving rear fairings.
  // Alternating knuckles share one pin; the fixed and moving leaves are separate.
  for(const x of [-4.3,4.3]){
    tube([V(x,1.65,-5.9),V(x,2.02,-6.9),V(x,2.38,-7.65)],.17,mechanical)
    for(const offset of [-.6,0,.6]){
      const knuckle=mesh(new THREE.CylinderGeometry(.22,.22,.27,32),mechanical,V(x+offset,2.38,-7.65));knuckle.rotation.z=Math.PI/2
    }
    for(const offset of [-.3,.3]){
      const knuckle=mesh(new THREE.CylinderGeometry(.218,.218,.27,32),chrome,V(x+offset,0,0),pivot);knuckle.rotation.z=Math.PI/2
    }
    const pin=mesh(new THREE.CylinderGeometry(.1,.1,1.65,32),chrome,V(x,2.38,-7.65));pin.rotation.z=Math.PI/2
    tube([V(x,0,0),V(x,.0,.65),V(x,-.2,1.6)],.13,mechanical,pivot)
    box(1.45,.12,.75,V(x,-.28,1.6),mechanical,.06,pivot)
    for(const dx of [-.45,.45])mesh(new THREE.CylinderGeometry(.09,.09,.08,6),chrome,V(x+dx,-.36,1.6),pivot)
  }
  // Twin folding stays use two fixed-length links with pinned ends.
  const stays=[-1,1].map(side=>{
    const base=V(side*7.9,.4,-4.7),tip=V(side*7.9,.15,3.6)
    const lower=box(.14,1,.24,V(0,0,0),mechanical,.045),upper=box(.12,1,.18,V(0,0,0),chrome,.04)
    lower.name='beetle-stay-lower';upper.name='beetle-stay-upper'
    const elbow=ellipsoid(V(0,0,0),V(.21,.21,.21),chrome)
    ellipsoid(base,V(.23,.23,.23),mechanical)
    ellipsoid(tip,V(.2,.2,.2),mechanical,pivot)
    return {base,tip,lower,upper,elbow}
  })
  // Catch and striker meet across the same seam when closed.
  box(.85,.3,.42,V(-9.05,1.86,0),mechanical,.09)
  box(.55,.22,.26,V(-9.05,-.22,7.65),chrome,.06,pivot)

  // Antennae are slender articulated feelers mounted ahead of the windscreen.
  const feelers:THREE.Group[]=[]
  for(const side of [-1,1]){
    const feeler=new THREE.Group();feeler.position.set(-9.05,2.2,side*2.25);model.add(feeler);feelers.push(feeler)
    ellipsoid(V(0,0,0),V(.17,.17,.17),chrome,feeler)
    tube([V(0,0,0),V(-.55,1.05,side*.25),V(-1.0,2.25,side*.55),V(-1.75,2.9,side*.8)],.055,mechanical,feeler)
    ellipsoid(V(-1.75,2.9,side*.8),V(.12,.12,.2),rubber,feeler)
  }
  const legs:{side:number;row:number;hip:THREE.Vector3;upper:THREE.Mesh;lower:THREE.Mesh;shin:THREE.Mesh;knee:THREE.Mesh;ankle:THREE.Mesh;foot:THREE.Group}[]=[]
  const cylinder=(radius:number)=>mesh(new THREE.CylinderGeometry(radius*.65,radius,1,12),mechanical,V(0,0,0))
  for(const side of [-1,1])for(let row=0;row<3;row++){
    const hip=V((row-1)*5.8,-.25,side*(row===1?6.15:5.6))
    tube([V(hip.x*.9,.5,side*4),V(hip.x,-.05,side*5.0),hip],.18,mechanical)
    ellipsoid(hip,V(.4,.35,.4),rubber)
    const upper=cylinder(.15),lower=cylinder(.1),shin=cylinder(.07)
    upper.name=`beetle-femur-${side}-${row}`;lower.name=`beetle-tibia-${side}-${row}`
    const knee=ellipsoid(V(0,0,0),V(.23,.23,.23),mechanical)
    const ankle=ellipsoid(V(0,0,0),V(.13,.13,.13),chrome)
    const foot=new THREE.Group();foot.name=`beetle-foot-${side}-${row}`;model.add(foot)
    tube([V(0,.08,0),V(-.22,0,side*.24),V(-.32,0,side*.43)],.045,rubber,foot)
    tube([V(0,.08,0),V(.18,0,side*.2),V(.32,0,side*.35)],.035,rubber,foot)
    legs.push({side,row,hip,upper,lower,shin,knee,ankle,foot})
  }
  const up=V(0,1,0)
  function segment(item:THREE.Mesh,a:THREE.Vector3,b:THREE.Vector3){const delta=b.clone().sub(a);item.position.copy(a).add(b).multiplyScalar(.5);item.quaternion.setFromUnitVectors(up,delta.clone().normalize());item.scale.y=delta.length()}
  function walk(phase:number,strength:number){
    for(const leg of legs){
      const {side,row,hip}=leg,angle=phase+(row+(side>0?1:0))%2*Math.PI
      const cycle=((angle/(Math.PI*2))%1+1)%1
      const swing=cycle>.6?(cycle-.6)/.4:0
      const step=(cycle<=.6?-1.2+2.4*cycle/.6:1.2-2.4*swing)*strength
      const spread=(row-1)*1.65,lift=Math.sin(swing*Math.PI)*.65*strength
      const ankle=V(hip.x+spread+step,-2.55+lift,side*8.35)
      const toe=V(hip.x+spread+step-.28,-3.12+lift,side*8.8)
      // Solve the knee in a fixed-length two-bone chain, bending outward.
      const direction=ankle.clone().sub(hip),distance=direction.length();direction.divideScalar(distance)
      const along=(2.25**2-3.1**2+distance**2)/(2*distance)
      const bend=V(spread*.3,.7,side*1.7);bend.addScaledVector(direction,-bend.dot(direction)).normalize()
      const knee=hip.clone().addScaledVector(direction,along).addScaledVector(bend,Math.sqrt(Math.max(0,2.25**2-along**2)))
      segment(leg.upper,hip,knee);segment(leg.lower,knee,ankle);segment(leg.shin,ankle,toe)
      leg.knee.position.copy(knee);leg.ankle.position.copy(ankle);leg.foot.position.copy(toe)
    }
    feelers.forEach((f,i)=>{f.rotation.z=Math.sin(phase*.55+i)*.08*strength;f.rotation.y=Math.cos(phase*.4+i)*.09*strength})
  }
  function setProgress(value:number){
    pivot.rotation.x=-THREE.MathUtils.degToRad(106)*value;pivot.updateMatrix()
    for(const stay of stays){
      const tip=stay.tip.clone().applyMatrix4(pivot.matrix),delta=tip.clone().sub(stay.base)
      const d=delta.length(),direction=delta.clone().normalize()
      const bend=V(0,-direction.z,direction.y).normalize()
      const knee=stay.base.clone().addScaledVector(direction,d*.5).addScaledVector(bend,Math.sqrt(Math.max(0,3.7**2-d*d*.25)))
      segment(stay.lower,stay.base,knee);segment(stay.upper,knee,tip);stay.elbow.position.copy(knee)
    }
  }
  // Individual part bounds are tighter than a giant axis-aligned lid box,
  // while including the underside, mirrors, feelers, feet and moving hardware.
  function partPoints(root:THREE.Object3D,exclude?:THREE.Object3D){
    model.updateMatrixWorld(true)
    const inverse=root.matrixWorld.clone().invert(),points:THREE.Vector3[]=[]
    root.traverse(o=>{
      let p:THREE.Object3D|null=o
      while(p){if(p===exclude)return;p=p.parent}
      if(!(o instanceof THREE.Mesh))return
      o.geometry.computeBoundingBox()
      const b=o.geometry.boundingBox!,matrix=inverse.clone().multiply(o.matrixWorld)
      for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])points.push(V(x,y,z).applyMatrix4(matrix))
    })
    return points
  }
  walk(0,0);setProgress(0)
  const fixedPoints=partPoints(model,pivot),coverPoints=partPoints(pivot)
  function bounds(){
    pivot.updateMatrix()
    const moving=coverPoints.map(p=>p.clone().applyMatrix4(pivot.matrix))
    const staysPoints=stays.flatMap(s=>[s.base,s.elbow.position,s.tip.clone().applyMatrix4(pivot.matrix)])
    return [...fixedPoints,...moving,...staysPoints].map(p=>p.clone().multiply(model.scale))
  }
  return {pivot,setProgress,bounds,walk}
}
