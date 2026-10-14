import * as THREE from 'three'
import type {ResidentModel} from './planet-resident'
import {capsulePose,arrivalDuration} from './planet-capsule'
import {drawNeonResident,drawNeonProp,ellipse,path,star,flower,neonInk,neonPaper,neonColors} from './neon-illustration'
import {surfaceAngle,sphereOccludes,clippedScreenPolygon,neonGroundPoint,neonGroundRadius} from './neon-projection'
import {createNeonBackground} from './neon-background'
import {sceneryTileBounds} from './neon-scenery'
import {globePaint} from './neon-surface'

type Neighbor={model:ResidentModel;normal:THREE.Vector3;pauseUntil:number;lift?:number}
type Premiere={model:ResidentModel;normal:THREE.Vector3;started:number;flying:boolean;getFrame?:()=>{left:number;top:number;width:number;height:number}}
type Sink={normal:THREE.Vector3;visible:boolean;amount:number}
type Vertex={n:THREE.Vector3;land:number}

/** A separate, resolution-independent illustration renderer. It shares the
 * simulation/camera, not the basic edition's materials or WebGL draw loop. */
export function createPlanetNeon(canvas:HTMLCanvasElement,world:THREE.Group,camera:THREE.PerspectiveCamera,surface:(n:THREE.Vector3)=>{height:number}){
  const layer=document.createElement('canvas');layer.className='planet-neon-canvas';layer.setAttribute('aria-hidden','true');layer.hidden=true;canvas.after(layer)
  const c=layer.getContext('2d',{alpha:false})!
  const background=createNeonBackground()
  // Small world props reuse a high-DPI art tile; close-ups use the vector
  // original. Added leaf/window detail must not multiply per-frame painting.
  const sceneryTiles=new Map<string,HTMLCanvasElement>()
  const scenery=(kind:string,index:number,scale:number,time:number)=>{
    if(scale*dpr>2){drawNeonProp(c,kind,index,time);return}
    const key=kind+':'+index%12
    let tile=sceneryTiles.get(key)
    const b=sceneryTileBounds
    if(!tile){tile=document.createElement('canvas');tile.width=b.width*2;tile.height=b.height*2;const tc=tile.getContext('2d')!;tc.translate(-b.left*2,-b.top*2);tc.scale(2,2);drawNeonProp(tc,kind,index);sceneryTiles.set(key,tile)}
    c.drawImage(tile,b.left,b.top,b.width,b.height)
  }
  let width=1,height=1,dpr=1
  let premierePose:{id:string|undefined;x:number;y:number;scale:number}|null=null
  const hitAreas:{id:string;x:number;y:number;size:number;angle:number;hidden:boolean}[]=[]
  const reduced=matchMedia('(prefers-reduced-motion: reduce)')
  const vertices:Vertex[]=[],faces:number[][]=[],cols=96,rows=56
  for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++){
    const lat=y/rows*Math.PI,lon=x/cols*Math.PI*2,n=new THREE.Vector3(Math.sin(lat)*Math.cos(lon),Math.cos(lat),Math.sin(lat)*Math.sin(lon))
    vertices.push({n,land:surface(n).height+.046})
  }
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
    const a=y*(cols+1)+x,b=a+1,d=a+cols+1,e=d+1;faces.push([a,b,e],[a,e,d])
  }
  // Clip at the actual waterline once. No texture fetches or per-frame mesh construction.
  const landPolygons:THREE.Vector3[][]=[],coasts:THREE.Vector3[][]=[]
  for(const face of faces){
    const polygon:THREE.Vector3[]=[],edges:THREE.Vector3[]=[]
    for(let i=0;i<3;i++){
      const a=vertices[face[i]],b=vertices[face[(i+1)%3]]
      if(a.land>=0)polygon.push(a.n)
      if((a.land>=0)!==(b.land>=0)){const n=a.n.clone().lerp(b.n,a.land/(a.land-b.land)).normalize();polygon.push(n);edges.push(n)}
    }
    if(polygon.length>2)landPolygons.push(polygon)
    if(edges.length===2)coasts.push(edges)
  }
  const gardenBeds:THREE.Vector3[][]=[]
  // Equal-area, world-anchored surface flecks. Reprojected only when the camera
  // or globe changes; they never crawl across the land during an idle frame.
  const flecks=Array.from({length:1400},(_,i)=>{
    const y=1-2*(i+.5)/1400,a=i*2.399963229728653,r=Math.sqrt(1-y*y)
    const n=new THREE.Vector3(Math.cos(a)*r,y,Math.sin(a)*r)
    return {n,land:surface(n).height+.046,index:i}
  })
  for(let i=127;i<vertices.length;i+=139){
    const {n,land}=vertices[i];if(land<.025)continue
    const east=new THREE.Vector3().crossVectors(n,Math.abs(n.y)>.9?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0)).normalize(),north=new THREE.Vector3().crossVectors(n,east)
    const bed:THREE.Vector3[]=[]
    for(let j=0;j<36;j++){
      const a=j/36*Math.PI*2,radius=(.18+(i%3)*.035)*(1+.12*Math.cos(a*3+i))
      bed.push(n.clone().addScaledVector(east,Math.cos(a)*radius).addScaledVector(north,Math.sin(a)*radius*.62).normalize())
    }
    gardenBeds.push(bed)
  }
  const props:{object?:THREE.Object3D;n:THREE.Vector3;kind:string;size:number;index:number}[]=[]
  const trees=world.userData.biomePlacements as {normal:number[];kind:string;size:number}[]
  trees?.forEach((tree,i)=>props.push({n:new THREE.Vector3(...tree.normal),kind:tree.kind,size:tree.size*.009,index:i}))
  world.traverse(object=>{
    const name=object.name
    if(name.startsWith('garden-landmark-')||name==='console-loop-course'||name==='console-arcade-bridge'||name==='console-star-marker'||name==='garden-rainbow-gate'||object.isObject3D&&object.type==='Group'&&name.startsWith('playground-')){
      const p=object.getWorldPosition(new THREE.Vector3());world.worldToLocal(p)
      props.push({object,n:p.normalize(),kind:name.replace('garden-landmark-','').replace('playground-','').replace('console-loop-course','loop').replace('garden-rainbow-gate','gate'),size:name.startsWith('playground')?.006:.011,index:props.length})
    }
  })
  const trails:THREE.Vector3[][]=[]
  world.traverse(object=>{
    if(object.name!=='garden-promenade'||!(object instanceof THREE.Mesh))return
    const a=object.geometry.getAttribute('position'),points:THREE.Vector3[]=[]
    for(let i=0;i<a.count;i+=4)points.push(new THREE.Vector3().fromBufferAttribute(a,i).normalize())
    trails.push(points)
  })
  const fish=world.getObjectByName('coastal-fish')?.children.filter(o=>/^coastal-fish-\d+$/.test(o.name))??[]
  const localCamera=new THREE.Vector3(),v=new THREE.Vector3(),p=new THREE.Vector3()
  const project=(point:THREE.Vector3)=>{v.copy(point).project(camera);return {x:(v.x*.5+.5)*width,y:(.5-v.y*.5)*height,z:v.z}}
  const pixelsPerUnit=(point:THREE.Vector3)=>height/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*Math.max(.1,-v.copy(point).applyMatrix4(camera.matrixWorldInverse).z))
  const fromNormal=(n:THREE.Vector3,r=neonGroundRadius)=>project(p.copy(n).multiplyScalar(r).applyMatrix4(world.matrixWorld))
  const front=(n:THREE.Vector3)=>n.dot(localCamera)-3.03>.03
  const appendPolygon=(out:Path2D,points:THREE.Vector3[])=>{
    const projected=clippedScreenPolygon(points,camera,width,height)
    projected.forEach((a,i)=>{if(i)out.lineTo(a.x,a.y);else out.moveTo(a.x,a.y)});if(projected.length)out.closePath()
  }
  let outsideGlobe=new Path2D()
  let landCacheKey='',landCache=new Path2D(),shoreCache=new Path2D(),bedCache:{shape:Path2D;tone:number}[]=[]
  let grassFlecks=new Path2D(),grassGlints=new Path2D(),waterGlints=new Path2D()
  const frameAt=(base:THREE.Vector3,normal:THREE.Vector3,units:number,tall:number)=>{
    const head=base.clone().addScaledVector(normal,units*tall),depth=(point:THREE.Vector3)=>-v.copy(point).applyMatrix4(camera.matrixWorldInverse).z
    if(Math.max(depth(base),depth(head))<camera.near)return null
    const hidden=sphereOccludes(base,camera.position)
    if(hidden&&sphereOccludes(head,camera.position))return null
    // An off-screen foot is not an off-screen sprite. Anchor on the visible
    // upper body when the foot crosses the near plane, preserving its extent.
    const offset=depth(base)<camera.near*2?tall*.85:0,anchor=base.clone().addScaledVector(normal,units*offset)
    if(depth(anchor)<camera.near)return null
    const a=project(anchor),b=project(anchor.clone().addScaledVector(normal,.05)),angle=surfaceAngle(a,b),scale=pixelsPerUnit(anchor)*units
    a.x-=Math.sin(angle)*offset*scale;a.y+=Math.cos(angle)*offset*scale
    return {a,angle,scale,hidden}
  }
  const resident=(model:ResidentModel,time:number,walking:boolean,flightBlend=1,groundedOrigin?:THREE.Vector3)=>{
    const origin=groundedOrigin??model.group.localToWorld(new THREE.Vector3()),normal=new THREE.Vector3(0,1,0).transformDirection(model.group.matrixWorld)
    const frame=frameAt(origin,normal,model.group.getWorldScale(new THREE.Vector3()).y*1.9/120,145)
    if(!frame)return
    const {a}=frame;let size=frame.scale,angle=frame.angle
    if(premierePose&&premierePose.id===model.id&&flightBlend<1){a.x=THREE.MathUtils.lerp(premierePose.x,a.x,flightBlend);a.y=THREE.MathUtils.lerp(premierePose.y,a.y,flightBlend);size=THREE.MathUtils.lerp(premierePose.scale,size,flightBlend);angle*=flightBlend}
    if(model.id)hitAreas.push({id:model.id,x:a.x,y:a.y,size,angle,hidden:frame.hidden})
    c.save();if(frame.hidden)c.clip(outsideGlobe,'evenodd');c.translate(a.x,a.y);c.rotate(angle);c.scale(size,size)
    ellipse(c,0,-1,27,6,'#28223222','')
    const view=model.group.worldToLocal(camera.position.clone())
    drawNeonResident(c,model.designIndex??0,time,Math.atan2(view.x,view.z),walking);c.restore()
  }
  const resize=()=>{
    width=canvas.clientWidth||innerWidth;height=canvas.clientHeight||innerHeight;dpr=Math.min(devicePixelRatio||1,2,Math.sqrt(4_000_000/(width*height)))
    layer.width=Math.round(width*dpr);layer.height=Math.round(height*dpr)
    background.resize(width,height)
  }
  function render(now:number,neighbors:Neighbor[],arrival:Premiere|null,sink:Sink,followingId:string|null){
    hitAreas.length=0
    const t=reduced.matches?0:now
    world.updateMatrixWorld(true);camera.updateMatrixWorld(true);localCamera.copy(camera.position);world.worldToLocal(localCamera)
    c.setTransform(dpr,0,0,dpr,0,0);background.render(c,t);c.lineJoin='round';c.lineCap='round'
    if(world.visible){
      // The silhouette is an off-axis ellipse in follow view, not a circle
      // around the projected origin. Project the actual sphere horizon.
      const distance=camera.position.length(),axis=camera.position.clone().normalize(),rimCenter=axis.clone().multiplyScalar(3.03*3.03/distance)
      const right=new THREE.Vector3().crossVectors(axis,Math.abs(axis.y)>.9?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0)).normalize(),up=new THREE.Vector3().crossVectors(axis,right)
      const rimRadius=3.03*Math.sqrt(Math.max(0,1-(3.03/distance)**2)),outline=new Path2D(),rim:THREE.Vector3[]=[]
      for(let i=0;i<128;i++){const angle=i/128*Math.PI*2;rim.push(rimCenter.clone().addScaledVector(right,Math.cos(angle)*rimRadius).addScaledVector(up,Math.sin(angle)*rimRadius))}appendPolygon(outline,rim)
      outsideGlobe=new Path2D();outsideGlobe.rect(0,0,width,height);outsideGlobe.addPath(outline)
      const r=Math.min(height*2,pixelsPerUnit(new THREE.Vector3())*3.03)
      const center=project(new THREE.Vector3())
      c.save();c.translate(2,5);c.fillStyle='#a9a0c14d';c.fill(outline);c.restore()
      c.fillStyle=globePaint(c,center.x,center.y,r,'sea');c.fill(outline)
      c.strokeStyle='#8e809e';c.lineWidth=1.2;c.stroke(outline)
      c.save();c.clip(outline)
      const key=[width,height,...world.matrixWorld.elements,...camera.matrixWorldInverse.elements,...camera.projectionMatrix.elements].map(n=>Math.round(n*100000)).join(',')
      if(key!==landCacheKey){
        landCacheKey=key;landCache=new Path2D();shoreCache=new Path2D()
        for(const polygon of landPolygons){if(!polygon.some(front))continue;appendPolygon(landCache,polygon.map(n=>n.clone().multiplyScalar(3.03).applyMatrix4(world.matrixWorld)))}
        for(const edge of coasts){if(!edge.some(front))continue;const segment=clippedScreenPolygon(edge.map(n=>n.clone().multiplyScalar(3.03).applyMatrix4(world.matrixWorld)),camera,width,height);if(segment.length>1){shoreCache.moveTo(segment[0].x,segment[0].y);shoreCache.lineTo(segment[1].x,segment[1].y)}}
        bedCache=[]
        for(const [tone,bed] of gardenBeds.entries()){if(!bed.every(front))continue;const shape=new Path2D();appendPolygon(shape,bed.map(n=>neonGroundPoint(n).applyMatrix4(world.matrixWorld)));bedCache.push({shape,tone})}
        grassFlecks=new Path2D();grassGlints=new Path2D();waterGlints=new Path2D()
        for(const {n,land,index} of flecks){
          if(!front(n))continue
          const a=fromNormal(n);if(a.z< -1||a.z>1)continue
          const s=Math.min(9,Math.max(.45,pixelsPerUnit(n.clone().multiplyScalar(3.05).applyMatrix4(world.matrixWorld))*.011))
          if(land>0){
            const dots=index%3?grassFlecks:grassGlints
            dots.moveTo(a.x+s*.7,a.y);dots.ellipse(a.x,a.y,s*.7,s*.42,index*.7,0,Math.PI*2)
            if(index%7===0){dots.moveTo(a.x+2*s,a.y+s);dots.ellipse(a.x+2*s,a.y+s,s*.4,s*.3,0,0,Math.PI*2)}
          }else{
            waterGlints.moveTo(a.x-3*s,a.y);waterGlints.quadraticCurveTo(a.x-s,a.y-s,a.x,a.y)
            waterGlints.quadraticCurveTo(a.x+s,a.y+s,a.x+3*s,a.y)
          }
        }
      }
      const land=landCache,shore=shoreCache
      c.strokeStyle='#f5ffef8a';c.lineWidth=.85;c.stroke(waterGlints)
      const coastWidth=Math.max(3,Math.min(22,r*.042))
      c.strokeStyle='#e3fff359';c.lineWidth=coastWidth*2.4;c.stroke(shore)
      c.strokeStyle='#f0ffe88a';c.lineWidth=coastWidth*1.65;c.stroke(shore)
      c.fillStyle=globePaint(c,center.x,center.y,r,'grass');c.fill(land)
      c.strokeStyle='#aabda24a';c.lineWidth=coastWidth+3;c.stroke(shore)
      c.strokeStyle='#ffefcf';c.lineWidth=coastWidth;c.stroke(shore)
      c.strokeStyle='#fffceb';c.lineWidth=coastWidth*.4;c.stroke(shore)
      c.save();c.clip(land)
      for(const {shape,tone} of bedCache){
        c.fillStyle=tone%3===0?'#fff4cf45':tone%3===1?'#8abcac2b':'#dcc5e52b';c.fill(shape)
        c.strokeStyle='#fff9e570';c.lineWidth=.8;c.stroke(shape)
      }
      c.fillStyle='#4d8c7825';c.fill(grassFlecks)
      c.fillStyle='#fffde6af';c.fill(grassGlints)
      c.restore()
      for(const points of trails){
        c.beginPath();let pen=false;for(const n of points){if(!front(n)){pen=false;continue}const a=fromNormal(n);if(a.z< -1||a.z>1){pen=false;continue}if(pen)c.lineTo(a.x,a.y);else c.moveTo(a.x,a.y);pen=true}
        c.strokeStyle='#729d812b';c.lineWidth=12;c.stroke();c.strokeStyle='#c8b6be';c.lineWidth=8.5;c.stroke()
        c.strokeStyle='#f5e6d8';c.lineWidth=7;c.stroke();c.strokeStyle='#fff9e98a';c.lineWidth=3;c.stroke()
        c.setLineDash([.6,6]);c.strokeStyle='#aa94ad88';c.lineWidth=1.2;c.stroke();c.setLineDash([])
      }
      // Botanical vignettes, anchored to the surface instead of a uniform
      // screen-space flower scatter. Size and direction follow the camera.
      for(let i=0;i<vertices.length;i+=61){
        const a=vertices[i];if(a.land<.07||!front(a.n))continue
        const base=neonGroundPoint(a.n).applyMatrix4(world.matrixWorld),b=project(base)
        if(b.z< -1||b.z>1)continue
        const f=frameAt(base,a.n.clone().transformDirection(world.matrixWorld),.003,30);if(!f)continue
        c.save();c.translate(f.a.x,f.a.y);c.rotate(f.angle);c.scale(f.scale,f.scale)
        ellipse(c,0,0,18,5,'#749a7d15','')
        path(c,'M -9 -1 Q -15 -8 -12 -13 Q -4 -10 -5 -2 M 6 -1 Q 3 -12 9 -17 Q 16 -10 10 -1','#8dbb92','#738c7e',.8)
        if(i%3){path(c,'M 0 0 Q -3 -12 0 -22','',neonInk,.9);flower(c,0,-23,6,neonColors[i%6]);ellipse(c,16,-2,2,2,neonPaper,'')}
        else path(c,'M -19 0 Q -21 -7 -23 -8 M 17 0 Q 22 -5 21 -10','',neonInk,.8)
        c.restore()
      }
      c.fillStyle=globePaint(c,center.x,center.y,r,'light');c.fill(outline)
      c.strokeStyle='#fff9e586';c.lineWidth=3;c.stroke(outline)
      c.restore()
      const items:{depth:number;draw:()=>void}[]=[]
      for(const prop of props){
        const base=neonGroundPoint(prop.n).applyMatrix4(world.matrixWorld)
        const frame=frameAt(base,prop.n.clone().transformDirection(world.matrixWorld),prop.size,110)
        if(!frame)continue
        const {a,angle,scale,hidden}=frame
        items.push({depth:base.distanceToSquared(camera.position),draw:()=>{c.save();if(hidden)c.clip(outsideGlobe,'evenodd');c.translate(a.x,a.y);c.rotate(angle);c.scale(scale,scale);ellipse(c,0,0,25,5,'#63547718','');scenery(prop.kind,prop.index,scale,t);c.restore()}})
      }
      for(const f of fish){const base=f.getWorldPosition(new THREE.Vector3()),n=world.worldToLocal(base.clone()).normalize();if(!front(n))continue;const a=project(base);c.save();c.translate(a.x,a.y);c.rotate(Math.sin(t*.0004+f.id)*.4);c.scale(Math.max(.25,r/240),Math.max(.25,r/240));path(c,'M -9 0 Q 0 -8 10 0 Q 0 8 -9 0 L -16 -6 L -16 6 Z','#7066c1');ellipse(c,5,-1,1,1,neonPaper,'');c.restore()}
      if(sink.visible&&front(sink.normal)){const a=fromNormal(sink.normal);ellipse(c,a.x,a.y,r*.10*sink.amount,r*.06*sink.amount,neonInk,'#ff51b8',4)}
      for(const n of neighbors){
        const base=neonGroundPoint(n.normal,n.lift??0).applyMatrix4(world.matrixWorld)
        items.push({depth:n.model.id===followingId?-1:base.distanceToSquared(camera.position),draw:()=>resident(n.model,t,n.pauseUntil<now&&!reduced.matches,1,base)})
      }
      items.sort((a,b)=>b.depth-a.depth).forEach(item=>item.draw())
    }
    if(arrival){
      const age=now-arrival.started,pose=capsulePose(age,reduced.matches),shellVisible=!reduced.matches&&age<2800
      if(arrival.flying){
        const progress=THREE.MathUtils.clamp((age-arrivalDuration(reduced.matches))/2200,0,1),blend=progress*progress*(3-2*progress)
        // Preserve the flight arc, but converge on the illustrated ground rather
        // than the raised 3D landing point. Avoid a last-frame downward snap.
        const delta=neonGroundRadius-(3+surface(arrival.normal).height+.02)
        const correction=arrival.normal.clone().transformDirection(world.matrixWorld).multiplyScalar(delta*blend)
        const origin=arrival.model.group.getWorldPosition(new THREE.Vector3()).add(correction)
        resident(arrival.model,t,false,blend,origin)
      }
      else {
        const bounds=canvas.getBoundingClientRect(),frame=arrival.getFrame?.()??{left:bounds.left,top:bounds.top+height*.18,width,height:height*.57}
        const cx=frame.left-bounds.left+frame.width/2,cy=frame.top-bounds.top+frame.height*.57,s=Math.min(frame.width,frame.height)*.0026
        premierePose={id:arrival.model.id,x:cx,y:cy+58*s,scale:s*1.04}
        c.save();c.translate(cx-(1-pose.roll)*(cx+200),cy);c.scale(s,s);c.rotate((1-pose.roll)*-Math.PI*3+pose.wobble)
        ellipse(c,0,83,92,13,'#28223222','')
        if(shellVisible){
          c.save();c.translate(0,-pose.open*95);c.rotate(-pose.open*.32);path(c,'M -94 0 A 94 94 0 0 1 94 0 Z','#83dfe9');path(c,'M -70 -25 Q -48 -65 -18 -66','',neonPaper,7);star(c,45,-34,16,'#ff51b8');c.restore()
        }
        if(pose.open>.05&&shellVisible){c.save();c.translate(0,68-pose.release*10);c.scale(1.04,1.04);drawNeonResident(c,arrival.model.designIndex??0,t,pose.turn,false);c.restore()}
        if(shellVisible){path(c,'M -94 0 A 94 86 0 0 0 94 0 Z','#b7f52d');path(c,'M -92 0 L 92 0','',neonInk,4);ellipse(c,0,0,15,15,'#ff51b8');star(c,0,0,9,neonPaper)}
        if(!shellVisible){c.save();c.translate(0,58);c.scale(1.04,1.04);drawNeonResident(c,arrival.model.designIndex??0,t,pose.turn,false);c.restore()}
        if(pose.burst>0)for(let i=0;i<12;i++){const a=i/12*Math.PI*2,r=110+pose.burst*35;star(c,Math.cos(a)*r,Math.sin(a)*r-25,8*pose.burst,neonColors[i%6])}
        c.restore()
        if(age>arrivalDuration(reduced.matches))resident(arrival.model,t,false)
      }
    }
  }
  return {layer,resize,render,pick(x:number,y:number){
    const bounds=canvas.getBoundingClientRect()
    for(let i=hitAreas.length-1;i>=0;i--){const a=hitAreas[i];if(a.hidden&&!c.isPointInPath(outsideGlobe,(x-bounds.left)*dpr,(y-bounds.top)*dpr,'evenodd'))continue;const dx=x-bounds.left-a.x,dy=y-bounds.top-a.y,lx=(Math.cos(a.angle)*dx+Math.sin(a.angle)*dy)/a.size,ly=(-Math.sin(a.angle)*dx+Math.cos(a.angle)*dy)/a.size;if(Math.abs(lx)<42&&ly>-140&&ly<4)return a.id}
    return null
  },setVisible(value:boolean){layer.hidden=!value;canvas.style.opacity=value?'0':''}}
}
