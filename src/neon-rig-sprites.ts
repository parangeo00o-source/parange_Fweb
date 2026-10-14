import {residentDesigns} from './resident-designs'
const urls=import.meta.glob('./assets/planet/neon-original-rigs/*-v1.webp',{eager:true,query:'?url',import:'default'}) as Record<string,string>
const sprites:(HTMLImageElement|undefined)[]=Array(16)
const pending=new Map<number,Promise<boolean>>()
const failed=new Set<number>()
let revision=0
export const residentArtRevision=()=>revision
export const residentArtStatus=()=>residentDesigns.map((d,i)=>({kind:d.kind,ready:Boolean(sprites[i]),views:8}))
export function loadResidentArtwork(indices:readonly number[]=residentDesigns.map((_,index)=>index)){
  return Promise.all([...new Set(indices)].filter(index=>Boolean(residentDesigns[index])).map(index=>{
    if(sprites[index])return Promise.resolve(true)
    if(failed.delete(index))pending.delete(index)
    const cached=pending.get(index);if(cached)return cached
    const promise=new Promise<boolean>(resolve=>{
    const design=residentDesigns[index]
    const image=new Image();image.decoding='async'
    image.onload=()=>{sprites[index]=image;revision++;resolve(true)}
    image.onerror=()=>{failed.add(index);resolve(false)}
    image.src=urls[`./assets/planet/neon-original-rigs/${design.kind}-v1.webp`]
    });pending.set(index,promise);return promise
  })).then(results=>results.every(Boolean))
}
type C=CanvasRenderingContext2D
type Point={x:number;y:number}
const cellWidth=480,cellHeight=480,units=120/1.9,w=1.9*units,h=1.9*units
function triangle(c:C,image:HTMLImageElement,view:number,source:Point[],dest:Point[]){
  const [a,b,d]=source,[p,q,r]=dest,sx=b.x-a.x,sy=b.y-a.y,tx=d.x-a.x,ty=d.y-a.y,det=sx*ty-sy*tx
  const ax=((q.x-p.x)*ty-(r.x-p.x)*sy)/det,ay=((q.y-p.y)*ty-(r.y-p.y)*sy)/det
  const bx=((r.x-p.x)*sx-(q.x-p.x)*tx)/det,by=((r.y-p.y)*sx-(q.y-p.y)*tx)/det
  const cx=(p.x+q.x+r.x)/3,cy=(p.y+q.y+r.y)/3
  c.save();c.beginPath()
  dest.forEach((v,i)=>{const dx=v.x-cx,dy=v.y-cy,l=Math.hypot(dx,dy)||1,x=v.x+dx/l*.08,y=v.y+dy/l*.08;if(i)c.lineTo(x,y);else c.moveTo(x,y)})
  c.closePath();c.clip();c.transform(ax,ay,bx,by,p.x-ax*a.x-bx*a.y,p.y-ay*a.x-by*a.y)
  c.drawImage(image,view*cellWidth,0,cellWidth,cellHeight,0,0,w,h);c.restore()
}

/** Eight baked views of the shared 3D rig. No redesigned faces, costumes,
 * markings, or palette. No extra WebGL renderer or texture generation in-game. */
export function drawRigResident(c:C,index:number,time:number,yaw:number,walking:boolean){
  const image=sprites[index];if(!image){if(!pending.has(index))void loadResidentArtwork([index]);return false}
  const view=((Math.round(yaw/(Math.PI/4))%8)+8)%8
  const motion=residentDesigns[index].motion,phase=time*.009+index*.43
  // Resting soles stay on y=0. Only a deliberate hopping gait leaves the ground.
  const bob=walking&&motion==='hop'?-Math.abs(Math.sin(phase))*2.6:0
  c.save();c.translate(-w/2,-1.8*units+bob)
  if(!walking)c.drawImage(image,view*cellWidth,0,cellWidth,cellHeight,0,0,w,h)
  else{
    // Upper silhouette/face remain rigid; continuous lower mesh articulates
    // feet and sleeves without replacing the original garment design.
    const xs=[0,.25,.5,.75,1],ys=[.64,.76,.88,1]
    c.drawImage(image,view*cellWidth,0,cellWidth,cellHeight*.64,0,0,w,h*.64+.08)
    const bend=(u:number,v:number)=>{
      const foot=Math.max(0,(v-.84)/.16),arm=Math.max(0,1-Math.abs(v-.77)/.12)*Math.max(0,(Math.abs(u-.5)-.18)/.32)
      const step=Math.sin(phase)*(u<.5?1:-1)
      return {x:u*w+arm*Math.cos(phase)*.6,y:v*h-Math.max(0,step)*foot*2.3+step*arm*.7}
    }
    for(let row=0;row<3;row++)for(let col=0;col<4;col++){
      const uv=[[xs[col],ys[row]],[xs[col+1],ys[row]],[xs[col+1],ys[row+1]],[xs[col],ys[row+1]]]
      const source=uv.map(([u,v])=>({x:u*w,y:v*h})),dest=uv.map(([u,v])=>bend(u,v))
      triangle(c,image,view,[source[0],source[1],source[2]],[dest[0],dest[1],dest[2]])
      triangle(c,image,view,[source[0],source[2],source[3]],[dest[0],dest[2],dest[3]])
    }
  }
  c.restore();return true
}
