import firstUrl from './assets/planet/neon-residents-01-v1.png'
import secondUrl from './assets/planet/neon-residents-02-v2.png'
import thirdUrl from './assets/planet/neon-residents-03-v1.png'
import fourthUrl from './assets/planet/neon-residents-04-v2.png'
import {residentDesigns} from './resident-designs'

type C=CanvasRenderingContext2D
type Sprite={image:HTMLCanvasElement;width:number;height:number;anchor:number}
const art:({front:Sprite;rear:Sprite}|undefined)[]=Array(16)
let pending:Promise<boolean>|undefined,revision=0
export const residentArtRevision=()=>revision
export const residentArtStatus=()=>art.map((entry,index)=>({kind:residentDesigns[index].kind,ready:Boolean(entry),front:entry&&[entry.front.image.width,entry.front.image.height],rear:entry&&[entry.rear.image.width,entry.rear.image.height]}))

/** Generated silhouettes have unequal ear/tail widths. Locate connected alpha
 * islands once instead of cutting an arbitrary grid through an ear or tail.
 * Tiny disconnected pencil flecks stay with their nearest silhouette. The PNGs
 * themselves are retained unchanged, including their original transparency. */
function unpack(image:HTMLImageElement):Sprite[]{
  const w=image.naturalWidth,h=image.naturalHeight,canvas=document.createElement('canvas')
  canvas.width=w;canvas.height=h
  const c=canvas.getContext('2d',{willReadFrequently:true})!;c.drawImage(image,0,0)
  const pixels=c.getImageData(0,0,w,h),labels=new Int32Array(w*h),queue=new Int32Array(w*h)
  const components:{id:number;count:number;left:number;top:number;right:number;bottom:number}[]=[]
  let id=0
  for(let start=0;start<labels.length;start++){
    if(labels[start]||pixels.data[start*4+3]<12)continue
    id++;let read=0,write=1;queue[0]=start;labels[start]=id
    let left=w,right=0,top=h,bottom=0
    while(read<write){
      const at=queue[read++],x=at%w,y=Math.floor(at/w)
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)
      for(const next of [x?at-1:-1,x<w-1?at+1:-1,y?at-w:-1,y<h-1?at+w:-1]){
        if(next<0||labels[next]||pixels.data[next*4+3]<12)continue
        labels[next]=id;queue[write++]=next
      }
    }
    if(write>w*h*.009)components.push({id,count:write,left,top,right,bottom})
  }
  if(components.length!==8)throw new Error(`Character atlas needs eight isolated silhouettes, found ${components.length}`)
  components.sort((a,b)=>(a.top+a.bottom)-(b.top+b.bottom))
  const ordered=[...components.slice(0,4).sort((a,b)=>a.left-b.left),...components.slice(4).sort((a,b)=>a.left-b.left)]
  const bigIds=new Set(components.map(a=>a.id))
  const result=ordered.map(part=>{
    const left=Math.max(0,part.left-3),top=Math.max(0,part.top-3),right=Math.min(w,part.right+4),bottom=Math.min(h,part.bottom+4)
    const tile=document.createElement('canvas');tile.width=right-left;tile.height=bottom-top
    const tc=tile.getContext('2d')!,crop=tc.createImageData(tile.width,tile.height)
    for(let y=0;y<tile.height;y++)for(let x=0;x<tile.width;x++){
      const src=(top+y)*w+left+x,label=labels[src]
      // Adjacent large ears can enter the bounding rectangle of another
      // animal. Discard only that neighbour, not this sprite's soft edge.
      if(label!==part.id&&bigIds.has(label))continue
      const dst=(y*tile.width+x)*4
      crop.data.set(pixels.data.subarray(src*4,src*4+4),dst)
    }
    tc.putImageData(crop,0,0)
    // Centre on the feet, not the entire silhouette: a large fox/raccoon tail
    // must not shift the standing point when switching from front to rear.
    let weight=0,weightedX=0
    for(let y=Math.floor(tile.height*.94);y<tile.height;y++)for(let x=0;x<tile.width;x++){
      const alpha=crop.data[(y*tile.width+x)*4+3];weight+=alpha;weightedX+=x*alpha
    }
    return {image:tile,width:tile.width,height:tile.height,anchor:weight?weightedX/weight/tile.width:.5}
  })
  canvas.width=canvas.height=1
  return result
}

export function loadResidentArtwork(){
  return pending??=Promise.all([firstUrl,secondUrl,thirdUrl,fourthUrl].map((url,group)=>new Promise<boolean>(resolve=>{
    const image=new Image();image.decoding='async'
    image.onerror=()=>resolve(false)
    image.onload=()=>{
      try{
        const sprites=unpack(image)
        for(let i=0;i<4;i++)art[group*4+i]={front:sprites[i],rear:sprites[i+4]}
        revision++;resolve(true)
      }catch(error){console.warn('Neon resident illustration unavailable; keeping vector art.',error);resolve(false)}
    }
    image.src=url
  }))).then(results=>results.every(Boolean))
}

type Point={x:number;y:number}
// The face is a rigid piece. Only the lower mesh bends: opposite footfall and
// a restrained arm/cloth sway, with continuous joints rather than cut-out gaps.
function bend(u:number,v:number,phase:number,amplitude:number,anchor:number):Point{
  const foot=Math.max(0,(v-.8)/.2),arm=Math.max(0,1-Math.abs(v-.69)/.17)*Math.max(0,(Math.abs(u-anchor)-.18)/.32)
  return {x:u+arm*Math.cos(phase)*amplitude*.008,y:v+foot*(u<anchor?1:-1)*Math.sin(phase)*amplitude*.019+arm*(u<anchor?-1:1)*Math.sin(phase)*amplitude*.009}
}
function triangle(c:C,image:HTMLCanvasElement,source:Point[],dest:Point[],w:number,h:number){
  const [a,b,d]=source,[p,q,r]=dest,sx=b.x-a.x,sy=b.y-a.y,tx=d.x-a.x,ty=d.y-a.y,det=sx*ty-sy*tx
  const ax=((q.x-p.x)*ty-(r.x-p.x)*sy)/det,ay=((q.y-p.y)*ty-(r.y-p.y)*sy)/det
  const bx=((r.x-p.x)*sx-(q.x-p.x)*tx)/det,by=((r.y-p.y)*sx-(q.y-p.y)*tx)/det
  const cx=(p.x+q.x+r.x)/3,cy=(p.y+q.y+r.y)/3
  c.save();c.beginPath()
  for(const [i,v] of dest.entries()){
    // A subpixel overlap prevents transparent seams on high-DPI rotations.
    const dx=v.x-cx,dy=v.y-cy,length=Math.hypot(dx,dy)||1,x=v.x+dx/length*.10,y=v.y+dy/length*.10
    if(i)c.lineTo(x,y);else c.moveTo(x,y)
  }
  c.closePath();c.clip();c.transform(ax,ay,bx,by,p.x-ax*a.x-bx*a.y,p.y-ay*a.x-by*a.y)
  c.drawImage(image,0,0,w,h);c.restore()
}

/** Same logical foot anchor and height budget as the original vector rig. */
export function drawPaintedResident(c:C,index:number,time:number,yaw:number,walking:boolean){
  const entry=art[index];if(!entry)return false
  const s=Math.cos(yaw)<-.35?entry.rear:entry.front
  const kind=residentDesigns[index].kind,height=kind==='rabbit'?144:kind==='deer'?132:118
  const w=height*s.width/s.height,h=height,phase=time*.009+index*.43
  const motion=residentDesigns[index].motion,amplitude=motion==='scurry'?1.15:motion==='waddle'?.65:1
  const bob=walking?(motion==='hop'?-Math.abs(Math.sin(phase))*3:Math.sin(phase*2)*1.25):Math.sin(time*.002+index)*.6
  c.save();c.translate(0,bob);c.scale(.94+.06*Math.abs(Math.cos(yaw)),1)
  if(walking)c.rotate(Math.sin(phase)*(motion==='waddle'?.025:.008))
  c.translate(-w*s.anchor,-h)
  if(!walking)c.drawImage(s.image,0,0,w,h)
  else{
    // Four columns, three lower bands; the whole head uses one image call.
    const xs=[0,s.anchor*.5,s.anchor,s.anchor+(1-s.anchor)*.5,1],ys=[.52,.66,.82,1]
    c.drawImage(s.image,0,0,s.image.width,s.image.height*.52,0,0,w,h*.52+.1)
    for(let row=0;row<ys.length-1;row++)for(let col=0;col<xs.length-1;col++){
      const uv=[[xs[col],ys[row]],[xs[col+1],ys[row]],[xs[col+1],ys[row+1]],[xs[col],ys[row+1]]]
      const source=uv.map(([u,v])=>({x:u*w,y:v*h})),dest=uv.map(([u,v])=>{const a=bend(u,v,phase,amplitude,s.anchor);return{x:a.x*w,y:a.y*h}})
      triangle(c,s.image,[source[0],source[1],source[2]],[dest[0],dest[1],dest[2]],w,h)
      triangle(c,s.image,[source[0],source[2],source[3]],[dest[0],dest[2],dest[3]],w,h)
    }
  }
  c.restore();return true
}
