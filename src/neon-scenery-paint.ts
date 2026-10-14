import {neonInk} from './neon-paint'
type C=CanvasRenderingContext2D
const shapes=new Map<string,{shape:Path2D;x:number;y:number;w:number;h:number}>()
function tint(hex:string,amount:number){
  const n=parseInt(hex.slice(1),16)
  return '#'+[n>>16,(n>>8)&255,n&255].map(v=>Math.round(v+(amount>0?255-v:v)*amount).toString(16).padStart(2,'0')).join('')
}
function glaze(c:C,color:string,x:number,y:number,w:number,h:number){
  if(!/^#[\da-f]{6}$/i.test(color)||color===neonInk)return color
  const g=c.createLinearGradient(x,y,x+w*.72,y+h)
  g.addColorStop(0,tint(color,.60));g.addColorStop(.30,tint(color,.23));g.addColorStop(.66,color);g.addColorStop(1,tint(color,-.23));return g
}
/** Scenery-only glazing. Bounds belong to each individual shape, so small
 * roof tiles, fruit and leaves receive the same light as larger silhouettes.
 * Character illustration and its original line weight remain untouched. */
export function path(c:C,d:string,fill:string,stroke=neonInk,width=2){
  let entry=shapes.get(d)
  if(!entry){
    // Scenery uses absolute M/L/Q/C/Z commands only; control points give a
    // conservative gradient box without expensive runtime SVG DOM measuring.
    const n=(d.match(/-?\d*\.?\d+/g)??[]).map(Number),xs=n.filter((_,i)=>i%2===0),ys=n.filter((_,i)=>i%2===1)
    const x=Math.min(...xs),y=Math.min(...ys)
    entry={shape:new Path2D(d),x,y,w:Math.max(1,Math.max(...xs)-x),h:Math.max(1,Math.max(...ys)-y)}
    if(shapes.size>2048)shapes.clear();shapes.set(d,entry)
  }
  const {shape,x,y,w,h}=entry
  if(fill){c.fillStyle=glaze(c,fill,x,y,w,h);c.fill(shape)}
  if(stroke){c.strokeStyle=stroke===neonInk?'#63576e':stroke;c.lineWidth=width*.61;c.stroke(shape)}
}
export function ellipse(c:C,x:number,y:number,rx:number,ry:number,fill:string,stroke=neonInk,width=2){
  c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2)
  c.fillStyle=glaze(c,fill,x-rx,y-ry,rx*2,ry*2);c.fill()
  if(stroke){c.strokeStyle=stroke===neonInk?'#63576e':stroke;c.lineWidth=width*.61;c.stroke()}
}
