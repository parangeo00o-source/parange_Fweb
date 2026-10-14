import {neonInk} from './neon-paint'

type C=CanvasRenderingContext2D
type Shape={path:Path2D;x:number;y:number;w:number;h:number}
const shapes=new Map<string,Shape>()
const swatches=new Map<string,HTMLCanvasElement>()
const patterns=new WeakMap<C,Map<string,CanvasPattern>>()
const size=192

/** Opaque material swatches: pigment grain and soft pearly light, never new
 * character features. One fill of the ORIGINAL path preserves edge coverage;
 * repeated translucent overlays would subtly expand antialiased silhouettes. */
export function residentFill(c:C,color:string,x:number,y:number,w:number,h:number):string|CanvasPattern{
  if(!/^#[\da-f]{6}$/i.test(color)||color===neonInk||Math.min(w,h)<5)return color
  let swatch=swatches.get(color)
  if(!swatch){
    swatch=document.createElement('canvas');swatch.width=size;swatch.height=size
    const context=swatch.getContext('2d')!,pixels=context.createImageData(size,size)
    const n=parseInt(color.slice(1),16),rgb=[n>>16,(n>>8)&255,n&255]
    let seed=1234567
    for(let py=0;py<size;py++)for(let px=0;px<size;px++){
      const u=px/(size-1),v=py/(size-1)
      const pearl=Math.exp(-((u-.30)**2/.10+(v-.23)**2/.075))*.40
      const shade=.035*(u+v)+.018*v*v
      seed=(Math.imul(seed,1664525)+1013904223)>>>0
      const grain=((seed/4294967296)-.5)*4
      const offset=(py*size+px)*4
      for(let channel=0;channel<3;channel++){
        const pigment=rgb[channel]
        pixels.data[offset+channel]=pigment+(255-pigment)*(.13+pearl)-pigment*shade+grain
      }
      pixels.data[offset+3]=255
    }
    context.putImageData(pixels,0,0);swatches.set(color,swatch)
  }
  let contextPatterns=patterns.get(c)
  if(!contextPatterns){contextPatterns=new Map();patterns.set(c,contextPatterns)}
  let pattern=contextPatterns.get(color)
  if(!pattern){pattern=c.createPattern(swatch,'repeat')!;contextPatterns.set(color,pattern)}
  // Padding prevents the repeating seam from touching a shape's extreme edge.
  pattern.setTransform(new DOMMatrix().translate(x-1,y-1).scale((w+2)/size,(h+2)/size))
  return pattern
}

export function path(c:C,d:string,fill:string,stroke=neonInk,width=2){
  let shape=shapes.get(d)
  if(!shape){
    // Resident paths contain absolute M/L/Q/C/Z only. Control-point bounds
    // are conservative; they affect the material coordinates, not geometry.
    const numbers=(d.match(/-?\d*\.?\d+/g)??[]).map(Number)
    const xs=numbers.filter((_,i)=>i%2===0),ys=numbers.filter((_,i)=>i%2===1)
    const x=Math.min(...xs),y=Math.min(...ys)
    shape={path:new Path2D(d),x,y,w:Math.max(1,Math.max(...xs)-x),h:Math.max(1,Math.max(...ys)-y)}
    if(shapes.size>=512)shapes.clear()
    shapes.set(d,shape)
  }
  if(fill){c.fillStyle=residentFill(c,fill,shape.x,shape.y,shape.w,shape.h);c.fill(shape.path)}
  if(stroke){c.strokeStyle=stroke;c.lineWidth=width*.72;c.stroke(shape.path)}
}

export function ellipse(c:C,x:number,y:number,rx:number,ry:number,fill:string,stroke=neonInk,width=2){
  c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2)
  c.fillStyle=residentFill(c,fill,x-rx,y-ry,rx*2,ry*2);c.fill()
  if(stroke){c.strokeStyle=stroke;c.lineWidth=width*.72;c.stroke()}
}
