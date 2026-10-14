export const neonInk='#44354f',neonPaper='#fffdf3'
export const neonColors=['#ef80c7','#cee96b','#83dbd1','#aa8edc','#f2df75','#f3ad9b']
type C=CanvasRenderingContext2D
const vectorPaths=new Map<string,Path2D>()
function tint(hex:string,amount:number){const n=parseInt(hex.slice(1),16);return '#'+[n>>16,(n>>8)&255,n&255].map(v=>Math.round(v+(amount>0?255-v:v)*amount).toString(16).padStart(2,'0')).join('')}
function paint(c:C,fill:string,x:number,y:number,w:number,h:number):string|CanvasGradient{
  if(!/^#[\da-f]{6}$/i.test(fill)||fill===neonInk||fill===neonPaper)return fill
  const g=c.createLinearGradient(x,y,x+w*.8,y+h);g.addColorStop(0,tint(fill,.27));g.addColorStop(.55,fill);g.addColorStop(1,tint(fill,-.10));return g
}
export function ellipse(c:C,x:number,y:number,rx:number,ry:number,fill:string,stroke=neonInk,width=2){
  c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fillStyle=paint(c,fill,x-rx,y-ry,rx*2,ry*2);c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=width*.72;c.stroke()}
}
export function path(c:C,d:string,fill:string,stroke=neonInk,width=2){
  let p=vectorPaths.get(d)
  if(!p){p=new Path2D(d);if(vectorPaths.size>=512)vectorPaths.clear();vectorPaths.set(d,p)}
  if(fill){c.fillStyle=paint(c,fill,-35,-120,70,120);c.fill(p)}if(stroke){c.strokeStyle=stroke;c.lineWidth=width*.72;c.stroke(p)}
}
export function star(c:C,x:number,y:number,r:number,fill:string,points=5){
  c.beginPath();for(let i=0;i<points*2;i++){const a=i/points*Math.PI-Math.PI/2,s=i%2?r*.43:r;c.lineTo(x+Math.cos(a)*s,y+Math.sin(a)*s)}c.closePath();c.fillStyle=fill;c.fill();c.strokeStyle=neonInk;c.lineWidth=1.8;c.stroke()
}
export function flower(c:C,x:number,y:number,r:number,fill:string){
  c.beginPath();for(let i=0;i<=100;i++){const a=i/100*Math.PI*2,rr=r*(.80+.20*Math.cos(a*5)),px=x+Math.cos(a)*rr,py=y+Math.sin(a)*rr;if(i)c.lineTo(px,py);else c.moveTo(px,py)}c.closePath();c.fillStyle=paint(c,fill,x-r,y-r,r*2,r*2);c.fill();c.strokeStyle=neonInk;c.lineWidth=1;c.stroke()
  ellipse(c,x,y,r*.26,r*.26,neonPaper,neonInk,1.3)
}
