import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { createArchiveCaseLid } from './archive-case-lid'
import { caseFootprint } from './archive-case-dimensions'

type Track = (g:THREE.BufferGeometry,m:THREE.Material)=>void
type Surface = (w:number,h:number,draw:(ctx:CanvasRenderingContext2D)=>void)=>THREE.Texture
const V=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z)
const ease=(t:number)=>{t=THREE.MathUtils.clamp(t,0,1);return t*t*t*(t*(t*6-15)+10)}

/** Separate, eased phases: lower upright, set down, open, then inspect tapes. */
export function archiveCaseMotion(progress:number){
 return {lower:ease(progress/.24),tip:ease((progress-.24)/.18),lid:ease((progress-.48)/.28),zoom:ease((progress-.82)/.18)}
}

/** Articulated moulded robot, carrying the original metal cassette case. */
export function createArchiveDogCarrier(model:THREE.Group,cargo:THREE.Group,texture:Surface,track:Track){
 const white=new THREE.MeshPhysicalMaterial({color:'#eeeede',roughness:.22,metalness:0,clearcoat:.65,clearcoatRoughness:.14,specularIntensity:.65})
 const pearl=new THREE.MeshPhysicalMaterial({color:'#e2e5db',roughness:.29,metalness:0,clearcoat:.45,clearcoatRoughness:.2})
 const blue=new THREE.MeshPhysicalMaterial({color:'#67b5ca',roughness:.22,metalness:.025,clearcoat:.85,clearcoatRoughness:.13})
 const blueDark=new THREE.MeshStandardMaterial({color:'#397a91',metalness:.45,roughness:.32})
 const rubber=new THREE.MeshStandardMaterial({color:'#3c5158',roughness:.75})
 const seam=new THREE.MeshStandardMaterial({color:'#9faeae',roughness:.54,metalness:.3})
 const robotSilver=new THREE.MeshPhysicalMaterial({color:'#c4cdd0',roughness:.28,metalness:.88,clearcoat:.25})
 const chrome=new THREE.MeshStandardMaterial({color:'#d4e1e3',roughness:.2,metalness:.94})
 const eye=new THREE.MeshPhysicalMaterial({color:'#79d72b',emissive:'#4c970c',emissiveIntensity:.12,roughness:.17,metalness:0,clearcoat:1,clearcoatRoughness:.1,specularIntensity:.55})
 const metal=new THREE.MeshPhysicalMaterial({color:'#c5ccce',roughness:.38,metalness:.92,clearcoat:.2})
 const grain=texture(1024,256,ctx=>{ctx.fillStyle='#aaa';ctx.fillRect(0,0,1024,256);let seed=37;for(let i=0;i<4000;i++){seed=(seed*16807)%2147483647;const y=seed%256;ctx.strokeStyle=`rgba(255,255,255,${.02+(seed%9)/100})`;ctx.beginPath();ctx.moveTo(seed%1024,y);ctx.lineTo(seed%1024+20+seed%200,y);ctx.stroke()}})
 grain.colorSpace=THREE.NoColorSpace;grain.wrapS=grain.wrapT=THREE.RepeatWrapping;metal.bumpMap=grain;metal.bumpScale=.018
 function mesh(g:THREE.BufferGeometry,m:THREE.Material,p:THREE.Vector3,parent:THREE.Object3D=model){track(g,m);const o=new THREE.Mesh(g,m);o.position.copy(p);o.castShadow=o.receiveShadow=true;parent.add(o);return o}
 function box(w:number,h:number,d:number,p:THREE.Vector3,m:THREE.Material,r=.1,parent:THREE.Object3D=model){return mesh(new RoundedBoxGeometry(w,h,d,4,r),m,p,parent)}
 function egg(p:THREE.Vector3,s:THREE.Vector3,m:THREE.Material,parent:THREE.Object3D=model){const o=mesh(new THREE.SphereGeometry(1,64,40),m,p,parent);o.scale.copy(s);return o}
 function tube(points:THREE.Vector3[],r:number,m:THREE.Material,parent:THREE.Object3D=model,closed=false){return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,closed),Math.max(48,points.length*4),r,10,closed),m,V(0,0,0),parent)}
 // Original lower case: one rounded annular casting, complete bottom, matched lid.
 const {width,depth,radius}=caseFootprint
 function path(w:number,d:number,r:number){const s=new THREE.Shape(),x=-w/2,z=-d/2;s.moveTo(x+r,z);s.lineTo(x+w-r,z);s.quadraticCurveTo(x+w,z,x+w,z+r);s.lineTo(x+w,z+d-r);s.quadraticCurveTo(x+w,z+d,x+w-r,z+d);s.lineTo(x+r,z+d);s.quadraticCurveTo(x,z+d,x,z+d-r);s.lineTo(x,z+r);s.quadraticCurveTo(x,z,x+r,z);return s}
 const outline=path(width-.07,depth-.07,radius-.035);outline.holes.push(path(width-.63,depth-.63,.1))
 const wall=mesh(new THREE.ExtrudeGeometry(outline,{depth:2.32,bevelEnabled:true,bevelSegments:3,bevelSize:.035,bevelThickness:.025,curveSegments:24}),metal,V(0,-.5,0),cargo);wall.rotation.x=-Math.PI/2;wall.name='case-lower-shell'
 box(width-.2,.22,depth-.2,V(0,-.45,0),metal,.14,cargo).name='case-bottom'
 box(12.6,.12,10.85,V(0,.69,0),rubber,.1,cargo)
 for(const x of [-6.15,6.15])for(const z of [-5.3,5.3]){box(.45,.16,.45,V(x,-.61,z),rubber,.08,cargo);mesh(new THREE.CylinderGeometry(.065,.065,.04,6),chrome,V(x,1.85,z),cargo)}
 // Recessed front carry handle and its pivot bosses.
 for(const x of [-1.55,1.55])box(.42,.55,.22,V(x,.6,5.88),chrome,.12,cargo)
 tube([V(-1.55,.65,6),V(-1.45,-.02,6.55),V(0,-.18,6.65),V(1.45,-.02,6.55),V(1.55,.65,6)],.16,chrome,cargo)
 box(2.2,.34,.32,V(0,-.15,6.65),rubber,.12,cargo)
 const lid=createArchiveCaseLid(cargo,metal,chrome,rubber,texture,track)
 // A compact toy silhouette: large round head, short torso and enclosed limbs.
 const dog=new THREE.Group();dog.name='robot-dog';model.add(dog)
 const body=new THREE.Group();body.name='dog-body';dog.add(body)
 // The silver sill follows the chest and joint arches, dipping between them.
 // Both panels sample the same curved boundary on the original ellipsoid.
 const bodySplit=(phi:number)=>1.98+.15*Math.cos(4*phi)+.04*Math.cos(phi)
 function bodyPanel(upper:boolean){
   const g=new THREE.SphereGeometry(1,96,64),p=g.attributes.position,n=g.attributes.normal
   for(let i=0;i<p.count;i++){
     const phi=Math.atan2(p.getZ(i),-p.getX(i)),t=Math.acos(THREE.MathUtils.clamp(p.getY(i),-1,1))/Math.PI,split=bodySplit(phi)
     const theta=upper?t*split:split+t*(Math.PI-split)
     const x=-Math.sin(theta)*Math.cos(phi),y=Math.cos(theta),z=Math.sin(theta)*Math.sin(phi)
     p.setXYZ(i,x,y,z);n.setXYZ(i,x,y,z)
   }
   const panel=mesh(g,upper?white:robotSilver,V(0,0,0),body);panel.scale.set(3,2.1,2)
   panel.name=upper?'dog-torso':'dog-silver-underbody'
 }
 bodyPanel(true);bodyPanel(false)
 tube(Array.from({length:193},(_,i)=>{
   const phi=i/192*Math.PI*2,theta=bodySplit(phi),r=Math.sin(theta)
   return V(-3*r*Math.cos(phi),2.1*Math.cos(theta),2*r*Math.sin(phi))
 }),.016,seam,body,true).name='dog-service-panel-seam'
 // Recessed speaker perforations follow the chest curvature instead of hovering above it.
 for(let row=-2;row<=2;row++)for(let col=-2;col<=2;col++){
   if(row*row+col*col>5)continue
   const y=row*.22,z=col*.22,x=-3*Math.sqrt(1-y*y/4.41-z*z/4)-.009
   egg(V(x,y,z),V(.015,.048,.048),seam,body).name='dog-speaker-perforation'
 }
 // A solid telescoping neck seated inside two rounded sockets.
 const neck=mesh(new THREE.CylinderGeometry(.61,.69,1,64),pearl,V(0,0,0),dog);neck.name='dog-neck-gimbal'
 const collar=egg(V(0,0,0),V(.82,.25,.82),blue,dog);collar.name='dog-collar-socket'
 const neckSeal=egg(V(0,0,0),V(.73,.30,.73),robotSilver,dog);neckSeal.name='dog-neck-upper-socket'
 const head=new THREE.Group();head.name='dog-head';dog.add(head)
 // Local muzzle contour preserves the restored cranium's proportions.
 // A monotone cubic profile defines a bridge, broad rounded muzzle and tucked
 // lower jaw, without adding a separate intersecting muzzle or a lip line.
 const muzzleProfile=[[-2.72,0],[-2.2,.20],[-1.85,.55],[-1.50,.75],[-1.15,.90],[-.75,.75],[-.40,.58],[-.05,.25],[.45,.06],[1.10,0],[2.72,0]]
 const slopes=muzzleProfile.map((p,i)=>{
   if(i===0||i===muzzleProfile.length-1)return 0
   const prev=muzzleProfile[i-1],next=muzzleProfile[i+1]
   const h0=p[0]-prev[0],h1=next[0]-p[0],d0=(p[1]-prev[1])/h0,d1=(next[1]-p[1])/h1
   if(d0*d1<=0)return 0
   const w0=2*h1+h0,w1=h1+2*h0
   return (w0+w1)/(w0/d0+w1/d1)
 })
 function muzzleOffset(y:number){
   if(y<=muzzleProfile[0][0]||y>=muzzleProfile[muzzleProfile.length-1][0])return 0
   const i=muzzleProfile.findIndex((p,j)=>j<muzzleProfile.length-1&&y>=p[0]&&y<=muzzleProfile[j+1][0])
   const a=muzzleProfile[i],b=muzzleProfile[i+1],h=b[0]-a[0],t=(y-a[0])/h
   return (2*t*t*t-3*t*t+1)*a[1]+(t*t*t-2*t*t+t)*h*slopes[i]+(-2*t*t*t+3*t*t)*b[1]+(t*t*t-t*t)*h*slopes[i+1]
 }
 function headFront(y:number,z:number){
   const q=Math.sqrt(Math.max(0,1-y*y/(2.72*2.72)-z*z/(2.75*2.75)))
   return -3.03*q-q*muzzleOffset(y)
 }
 const headGeometry=new THREE.SphereGeometry(1,112,96),hp=headGeometry.attributes.position
 for(let i=0;i<hp.count;i++){
   const nx=hp.getX(i),y=hp.getY(i)*2.72,z=hp.getZ(i)*2.75
   hp.setXYZ(i,nx*3.03-Math.max(0,-nx)*muzzleOffset(y),y,z)
 }
 headGeometry.computeVertexNormals()
 mesh(headGeometry,white,V(0,0,0),head).name='dog-cranium'
 egg(V(headFront(-.42,0)-.07,-.42,0),V(.16,.22,.59),blue,head).name='dog-nose'
 const gripPoint=V(headFront(-1.25,0)-.02,-1.25,0)
 // Invisible attachment keeps the handle contact without a painted mouth line.
 const gripMarker=new THREE.Object3D();gripMarker.name='dog-handle-grip';gripMarker.position.copy(gripPoint);head.add(gripMarker)
 // A small axis pin, a blue socket and a domed cover form each flush servo cap.
 function cap(parent:THREE.Object3D,r:number,side:number,z:number){
   const base=mesh(new THREE.CylinderGeometry(r,r,.15,64),blue,V(0,0,side*z),parent);base.rotation.x=Math.PI/2
   const gasket=mesh(new THREE.TorusGeometry(r*.94,r*.055,16,64),blueDark,V(0,0,side*(z+.075)),parent)
   gasket.name='dog-cap-gasket'
   const ring=mesh(new THREE.TorusGeometry(r*.91,r*.075,20,64),blue,V(0,0,side*(z+.11)),parent);ring.name='dog-joint-seal'
   const dome=mesh(new THREE.SphereGeometry(1,64,32,0,Math.PI*2,0,Math.PI/2),white,V(0,0,side*(z+.1)),parent)
   dome.scale.set(r*.83,r*.21,r*.83);dome.rotation.x=side*Math.PI/2;dome.name='dog-servo-cap'
 }
 for(const side of [-1,1]){
   const optical=new THREE.Group();optical.name='dog-optical-housing';optical.position.set(-2.59,.65,side*1.45);head.add(optical)
   optical.quaternion.setFromUnitVectors(V(0,0,1),V(-.84,.2,side*.5).normalize())
   const opticalNormal=V(0,0,1).applyQuaternion(optical.quaternion)
   function seatDepth(x:number,y:number){
     const point=V(x,y,0).applyQuaternion(optical.quaternion).add(optical.position)
     let lo=-1.2,hi=1.2
     for(let i=0;i<32;i++){
       const mid=(lo+hi)/2,p=point.clone().addScaledVector(opticalNormal,mid)
       const surface=headFront(p.y,p.z)
       if(p.x<surface)hi=mid;else lo=mid
     }
     return (lo+hi)/2
   }
   // Preserve the robot's original green paw lenses and cyan mounting bezel.
   const outline=new THREE.Shape()
   outline.moveTo(-.5,-.72);outline.bezierCurveTo(-.8,-.65,-.83,-.35,-.72,-.08)
   outline.bezierCurveTo(-1.08,.08,-1.02,.54,-.73,.55)
   outline.bezierCurveTo(-.94,.94,-.47,1.16,-.27,.8)
   outline.bezierCurveTo(.12,.91,.7,.62,.7,-.02)
   outline.bezierCurveTo(.75,-.6,.13,-.94,-.5,-.72)
   const flatBezel=new THREE.ExtrudeGeometry(outline,{depth:.055,bevelEnabled:true,bevelSegments:4,bevelSize:.045,bevelThickness:.025,curveSegments:32})
   const vertices:number[]=[]
   function subdivide(a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3){
     const ab=a.distanceToSquared(b),bc=b.distanceToSquared(c),ca=c.distanceToSquared(a)
     if(Math.max(ab,bc,ca)<.0225){vertices.push(...a.toArray(),...b.toArray(),...c.toArray());return}
     if(ab>=bc&&ab>=ca){const m=a.clone().add(b).multiplyScalar(.5);subdivide(a,m,c);subdivide(m,b,c)}
     else if(bc>=ca){const m=b.clone().add(c).multiplyScalar(.5);subdivide(a,b,m);subdivide(a,m,c)}
     else{const m=c.clone().add(a).multiplyScalar(.5);subdivide(a,b,m);subdivide(m,b,c)}
   }
   const flat=flatBezel.attributes.position
   for(let i=0;i<flat.count;i+=3)subdivide(new THREE.Vector3().fromBufferAttribute(flat,i),new THREE.Vector3().fromBufferAttribute(flat,i+1),new THREE.Vector3().fromBufferAttribute(flat,i+2))
   flatBezel.dispose()
   const bezel=new THREE.BufferGeometry();bezel.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3))
   const bp=bezel.attributes.position
   for(let i=0;i<bp.count;i++){if(side>0)bp.setX(i,-bp.getX(i));bp.setZ(i,bp.getZ(i)+seatDepth(bp.getX(i),bp.getY(i))+.015)}
   if(side>0)for(let i=0;i<bp.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(bp,i),b=new THREE.Vector3().fromBufferAttribute(bp,i+2);bp.setXYZ(i,b.x,b.y,b.z);bp.setXYZ(i+2,a.x,a.y,a.z)}
   const smoothBezel=mergeVertices(bezel,.0001);bezel.dispose()
   smoothBezel.computeVertexNormals();mesh(smoothBezel,blue,V(0,0,0),optical).name='dog-paw-bezel'
   function lensInsert(x:number,y:number,rx:number,ry:number,angle:number,depth:number,offset:number,material:THREE.Material){
     const geometry=new THREE.SphereGeometry(1,48,32),p=geometry.attributes.position
     for(let i=0;i<p.count;i++){
       const u=p.getX(i)*rx,v=p.getY(i)*ry,z=p.getZ(i)*depth
       const px=x+u*Math.cos(angle)-v*Math.sin(angle),py=y+u*Math.sin(angle)+v*Math.cos(angle)
       p.setXYZ(i,px,py,seatDepth(px,py)+offset+z)
     }
     geometry.computeVertexNormals()
     return mesh(geometry,material,V(0,0,0),optical)
   }
   for(const [sourceX,y,rx,ry,sourceAngle] of [[.01,-.1,.48,.58,0],[-.56,.72,.16,.24,-.4],[-.76,.29,.16,.23,-.65]]){
     const x=side>0?-sourceX:sourceX,a=side>0?-sourceAngle:sourceAngle
     lensInsert(x,y,rx+.035,ry+.035,a,.035,.09,blueDark)
     lensInsert(x,y,rx,ry,a,.055,.12,eye).name='dog-optical-lens'
   }
   // Upright, outward-leaning ears grow from the upper sides of the head.
   const ear=new THREE.Group();ear.name=`dog-ear-${side}`;ear.position.set(.35,1.92,side*2.98);head.add(ear)
   ear.quaternion.setFromUnitVectors(V(0,0,1),V(-.98,.03,side*.18).normalize())
   ear.rotateZ(-side*.32)
   const earSurface=(u:number,v:number,w:number)=>{
     // A gentle taper and broad round tip avoid both a disc and a pointed leaf.
     // The back is convex; the front cups inward behind a thick rounded rim.
     const cup=THREE.MathUtils.smoothstep(w,.56,1)
     return V(1.53*u*(1-.16*v)+side*.12*Math.pow((v+1)/2,2),2.02*v,.64*w-.50*cup*cup)
   }
   // Ivory inset and cyan rim meet on one continuous surface, without stacked skins.
   const insetAngle=Math.acos(.56)
   for(const [start,length,material,name] of [[0,insetAngle,white,'mouse-ear-inset'],[insetAngle,Math.PI-insetAngle,blue,'mouse-ear-shell']] as const){
     const geometry=new THREE.SphereGeometry(1,96,64,0,Math.PI*2,start,length),p=geometry.attributes.position
     for(let i=0;i<p.count;i++){
       const q=earSurface(p.getX(i),p.getZ(i),p.getY(i));p.setXYZ(i,q.x,q.y,q.z)
     }
     // Swapping Y/Z reverses winding; keep the outer face and normals outward.
     const index=geometry.index!
     for(let i=0;i<index.count;i+=3){const a=index.getX(i);index.setX(i,index.getX(i+2));index.setX(i+2,a)}
     geometry.computeVertexNormals();mesh(geometry,material,V(0,0,0),ear).name=name
   }
   ear.userData.restQuaternion=ear.quaternion.clone()
   // Three flush cooling slots on the forehead, and a rear service-cover seam.
   for(let i=0;i<3;i++){
     const x=-.4+i*.2,z=side*.84,y=2.72*Math.sqrt(1-x*x/(3.03*3.03)-z*z/(2.75*2.75))+.008
     egg(V(x,y,z),V(.026,.013,.16),seam,head).rotation.x=side*.33
   }
 }
 tube(Array.from({length:97},(_,i)=>{
   const a=i/96*Math.PI*2,r=Math.sqrt(1-(1.1/3.03)**2)
   return V(1.11,2.72*r*Math.sin(a),2.75*r*Math.cos(a))
 }),.012,seam,head,true).name='dog-head-service-seam'
 // Short upward club tail, with a rounded tip and a socket on the rear shell.
 const tail=new THREE.Group();tail.name='dog-tail';body.add(tail);tail.position.set(2.30,1.22,0)
 const tailProfile=new THREE.SplineCurve([new THREE.Vector2(0,0),new THREE.Vector2(.18,.06),new THREE.Vector2(.16,.38),new THREE.Vector2(.20,.79),new THREE.Vector2(.31,1.10),new THREE.Vector2(.32,1.33),new THREE.Vector2(.24,1.54),new THREE.Vector2(.12,1.65),new THREE.Vector2(0,1.69)])
 mesh(new THREE.LatheGeometry(tailProfile.getPoints(80),64),blue,V(0,0,0),tail).name='dog-tail-shell'
 egg(V(0,.02,0),V(.28,.13,.28),robotSilver,tail).name='dog-tail-socket'
 // Four moulded shells with the mechanism inside. No skeletal rods or exposed knees.
 const legs:{front:boolean;side:number;hip:THREE.Group;paw:THREE.Group;shell:THREE.Mesh}[]=[]
 for(const front of [true,false])for(const side of [-1,1]){
   const hip=new THREE.Group();hip.name='dog-hip';dog.add(hip)
   const housing=egg(V(0,0,0),V(front?.86:1.35,front?1.02:1.43,.95),white,hip)
   // A planar seat under each cap replaces an ellipsoid protruding through it.
   const geometry=housing.geometry.clone();track(geometry,white);housing.geometry=geometry
   const p=geometry.attributes.position
   for(let i=0;i<p.count;i++)if(side*p.getZ(i)>.68)p.setZ(i,side*.68)
   geometry.computeVertexNormals()
   cap(hip,front?.73:1.1,side,.7)
   const shell=mesh(new THREE.BufferGeometry(),white,V(0,0,-side*(front?.22:.48)),dog);shell.name='dog-enclosed-leg'
   const paw=new THREE.Group();paw.name=`dog-paw-${front?'front':'rear'}-${side}`;dog.add(paw)
   const foot=egg(V(-.12,0,0),front?V(1.2,1.08,1.24):V(1.35,.68,1.05),white,paw)
   const fg=foot.geometry.clone();track(fg,white);foot.geometry=fg
   const fp=fg.attributes.position
   for(let i=0;i<fp.count;i++)if(side*fp.getZ(i)>.7)fp.setZ(i,side*.7)
   fg.computeVertexNormals()
   egg(V(-.12,front?-.93:-.57,0),front?V(.82,.12,.86):V(1.15,.1,.86),pearl,paw)
   const footCap=new THREE.Group();footCap.position.set(-.12,.02,0);paw.add(footCap)
   cap(footCap,front?.94:.65,side,front?.91:.76)
   legs.push({front,side,hip,paw,shell})
 }
 // A swept solid limb blends the elbow into the upper shell while preserving a rounded foot.
 function limb(o:THREE.Mesh,a:THREE.Vector3,knee:THREE.Vector3,b:THREE.Vector3,front:boolean){
   const curve=new THREE.QuadraticBezierCurve3(a,knee,b),positions:number[]=[],normals:number[]=[],indices:number[]=[]
   const steps=24,sides=24
   for(let i=0;i<=steps;i++){
     const t=i/steps,p=curve.getPoint(t),tangent=curve.getTangent(t).normalize(),u=V(0,0,1).cross(tangent).normalize(),v=tangent.clone().cross(u).normalize()
     const r=(front?.84:.88)*(1-.18*t)*Math.max(.025,Math.pow(Math.sin(Math.PI*t),.2))
     for(let j=0;j<=sides;j++){const theta=j/sides*Math.PI*2,n=u.clone().multiplyScalar(Math.cos(theta)).addScaledVector(v,Math.sin(theta)),q=p.clone().addScaledVector(n,r);positions.push(q.x,q.y,q.z);normals.push(n.x,n.y,n.z);if(i<steps&&j<sides){const z=i*(sides+1)+j;indices.push(z,z+1,z+sides+1,z+1,z+sides+2,z+sides+1)}}
   }
   const g=o.geometry
   if(g.getAttribute('position')){g.getAttribute('position').array.set(positions);g.getAttribute('normal').array.set(normals);g.getAttribute('position').needsUpdate=true;g.getAttribute('normal').needsUpdate=true}
   else{g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setIndex(indices)}
   g.computeBoundingSphere();g.computeBoundingBox()
 }
 const carryRotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(0,0,-1),V(-1,0,0),V(0,1,0)))
 const bagSize=.4,mouth=V(0,0,0),handle=V(0,-.15,6.65),placed=V(-7.3,-6.13,0)
 let sitting=0,opening=0
 function placeBag(){
   const pose=archiveCaseMotion(opening)
   cargo.scale.set(bagSize*1.28,bagSize,bagSize)
   const grip=handle.clone().multiply(cargo.scale).applyQuaternion(carryRotation)
   const held=mouth.clone().sub(grip)
   cargo.quaternion.copy(carryRotation).slerp(new THREE.Quaternion(),pose.tip)
   // Keep the lowest casing corner on the ground throughout the tip-down.
   // This avoids rotating through the floor or throwing the case in one arc.
   let bottom=Infinity
   for(const x of [-6.72,6.72])for(const y of [-.7,3.95])for(const z of [-5.9,6.85]){
     const corner=V(x,y,z).multiply(cargo.scale).applyQuaternion(cargo.quaternion)
     bottom=Math.min(bottom,corner.y)
   }
   const supported=V(placed.x,-6.5-bottom,placed.z)
   cargo.position.copy(held).lerp(supported,pose.lower)
   lid.setProgress(pose.lid)
   // Keep the companion solid and present throughout the cassette zoom.
   dog.visible=true

 }
 function walk(phase:number,amount:number,rest=sitting){
   sitting=rest;const sit=ease(rest),bob=Math.sin(phase*2)*.065*amount
   body.position.set(THREE.MathUtils.lerp(1,1.55,sit),-2.8+bob,0);body.rotation.z=-sit*.67
   head.position.set(THREE.MathUtils.lerp(-2.2,-1.4,sit),2.1+bob,0)
   head.rotation.z=Math.sin(phase+.4)*.018*amount;head.rotation.y=Math.sin(phase*.5)*.02*amount
   const neckBase=V(-2.5,.5,0).applyEuler(body.rotation).add(body.position)
   const neckTop=V(1.15,-2.45,0).applyEuler(head.rotation).add(head.position)
   const neckAxis=neckTop.clone().sub(neckBase),neckDirection=neckAxis.clone().normalize()
   neck.position.copy(neckBase).add(neckTop).multiplyScalar(.5)
   neck.quaternion.setFromUnitVectors(V(0,1,0),neckDirection);neck.scale.set(1,neckAxis.length(),1)
   collar.position.copy(neckBase);collar.quaternion.copy(neck.quaternion)
   neckSeal.position.copy(neckTop);neckSeal.quaternion.copy(neck.quaternion)
   mouth.copy(gripPoint.clone().applyEuler(head.rotation).add(head.position))
   tail.rotation.set(Math.sin(phase*1.1)*.025*amount,Math.sin(phase*1.1)*.10*amount,-.42+sit*.50)
   head.children.filter(o=>o.name.startsWith('dog-ear-')).forEach((o,i)=>{
     o.quaternion.copy(o.userData.restQuaternion)
     o.rotateX(Math.sin(phase+.6+i)*.035*amount);o.rotateZ(Math.sin(phase+.3)*.025*amount)
   })
   for(const leg of legs){
     const {front,side}=leg,offset=front?(side>0?0:Math.PI):(side>0?Math.PI:0),cycle=((phase+offset)%(Math.PI*2))/(Math.PI*2)
     const stance=.65,swing=cycle>stance?(cycle-stance)/(1-stance):0
     const stride=(cycle<stance?-1.2+2.4*cycle/stance:1.2-2.4*ease(swing))*amount
     const hip=V(front?THREE.MathUtils.lerp(-1.15,-.5,sit):THREE.MathUtils.lerp(3.2,2.9,sit),front?THREE.MathUtils.lerp(-2.25,-1.35,sit):THREE.MathUtils.lerp(-3,-4.3,sit),side*1.85)
     const foot=V((front?THREE.MathUtils.lerp(-1.65,-1.8,sit):THREE.MathUtils.lerp(3.7,2.8,sit))+stride,(front?-5.42:-5.8)+Math.sin(Math.PI*swing)*.8*amount,side*(front?2.08:2.2))
     leg.hip.position.copy(hip);leg.paw.position.copy(foot);leg.paw.rotation.z=-Math.sin(Math.PI*swing)*.12*amount
     const knee=hip.clone().lerp(foot,.55).add(V(front?.35:-.65,0,0))
     limb(leg.shell,hip,knee,foot.clone().add(V(.05,.35,0)),front)
   }
   placeBag()
 }
 function setProgress(p:number){opening=p;placeBag()}
 function bounds(){
   model.updateWorldMatrix(true,true);const inverse=model.matrixWorld.clone().invert(),points:THREE.Vector3[]=[]
   model.traverse(o=>{if(!(o instanceof THREE.Mesh) || o.name==='cassette-hover-glow')return;if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();const b=o.geometry.boundingBox;if(!b)return;const matrix=inverse.clone().multiply(o.matrixWorld);for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])points.push(V(x,y,z).applyMatrix4(matrix).multiply(model.scale))})
   return points
 }
 walk(0,0,0)
 return {pivot:lid.pivot,setProgress,bounds,walk,cargo}
}
