import fishUrl from './assets/planet/neon-fish-atlas-v2.png'
import motifsUrl from './assets/planet/neon-motifs-atlas-v2.png'
import birdUrl from './assets/planet/neon-bird-rig-v2.png'
import pearlWingUrl from './assets/planet/neon-pearl-wing-v1.png'

type C=CanvasRenderingContext2D
type Rect=readonly [number,number,number,number]
type Sprite={image:HTMLImageElement;rect:Rect}
const sprites:{fish:Sprite[];motifs:Sprite[];bird:Sprite[];wings:Sprite[]}={fish:[],motifs:[],bird:[],wings:[]}
let pending:Promise<boolean>|undefined
const quadrants:Rect[]=[[0,0,.5,.5],[.5,0,.5,.5],[0,.5,.5,.5],[.5,.5,.5,.5]]
// Measured gutters keep neighbouring silhouettes outside source rectangles.
const fishRects:Rect[]=[[0,0,.55,.501],[.568,0,.432,.507],[0,.52,.535,.48],[.547,.52,.453,.48]]
export function loadSkyArtwork(){
  return pending??=Promise.all(([['fish',fishUrl,fishRects],['motifs',motifsUrl,quadrants],['bird',birdUrl,[[0,0,.5,1],[.5,0,.5,1]]],['wings',pearlWingUrl,[[0,0,1,1]]]] as const).map(([key,url,rects])=>new Promise<boolean>(resolve=>{
    const image=new Image();image.decoding='async'
    image.onload=()=>{sprites[key]=rects.map(rect=>({image,rect}));resolve(true)}
    image.onerror=()=>resolve(false);image.src=url
  }))).then(results=>results.every(Boolean))
}
function draw(c:C,s:Sprite,x:number,y:number,w:number,h:number){
  const [sx,sy,sw,sh]=s.rect,i=s.image
  c.drawImage(i,sx*i.width,sy*i.height,sw*i.width,sh*i.height,x,y,w,h)
}
export const skyFishDesigns=['pearl-scales','pink-star-zebra','candy-targets','porcelain-rose'] as const

/** Nose stays steady; a travelling wave grows towards the tail. */
export function fishBend(u:number,time:number,index:number){
  return Math.pow(1-u,2.8)*8*Math.sin(time*.0031-index*.9-u*5)
}
export function drawIllustratedFish(c:C,index:number,time:number){
  const sprite=sprites.fish[index%4];if(!sprite)return false
  const [sx,sy,sw,sh]=sprite.rect,image=sprite.image,w=154,h=w*sh/sw,n=28
  for(let j=0;j<n;j++){
    const u=j/n,v=(j+1)/n,x=-w/2+u*w,a=fishBend(u,time,index),b=fishBend(v,time,index),strip=w/n
    c.save();c.translate(x,-h/2+a);c.transform(1,(b-a)/strip,0,1,0,0)
    // Subpixel overlap avoids hairline gaps on high-DPI/rotated canvases.
    c.drawImage(image,(sx+sw*u)*image.width,sy*image.height,sw/n*image.width,sh*image.height,0,0,strip+.35,h)
    c.restore()
  }
  return true
}
export function drawSkyMotif(c:C,index:number,size:number){
  const s=sprites.motifs[index];if(!s)return false
  draw(c,s,-size/2,-size/2,size,size);return true
}
/** Full-resolution pearl feather layer, painted into the cached paper once. */
export function drawPearlWing(c:C,width:number){
  const wing=sprites.wings[0];if(!wing)return false
  draw(c,wing,0,0,width,width*wing.image.height/wing.image.width);return true
}
export function wingAngle(time:number,index:number){return -.16+Math.sin(time*.008+index*2)*.78}
export function drawSkyBird(c:C,time:number,index:number){
  const [body,wing]=sprites.bird;if(!body||!wing)return
  const flap=wingAngle(time,index)
  // Root measured at 76%, 88% of the wing cell, not its image centre.
  const paintWing=(back:boolean)=>{
    c.save();c.translate(back?12:4,18);c.rotate(flap+(back?.3:0));c.scale(back?.76:1,back?.76:1)
    if(back)c.globalAlpha*=.72
    draw(c,wing,-76*.76,-76*.88,76,76);c.restore()
  }
  paintWing(true);draw(c,body,-54,-35,108,108);paintWing(false)
}

/** Transparent soap film with a chromatic rim and two reflected highlights. */
export function createBubbleTile(){
  const tile=document.createElement('canvas');tile.width=256;tile.height=256
  const c=tile.getContext('2d')!,r=52;c.scale(2,2);c.translate(64,64)
  const wash=c.createRadialGradient(-16,-18,2,0,0,r)
  wash.addColorStop(0,'#ffffff08');wash.addColorStop(.68,'#f3e9ff10');wash.addColorStop(.88,'#b4ddf45a');wash.addColorStop(.97,'#ffd5e777');wash.addColorStop(1,'#ffffff05')
  c.fillStyle=wash;c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.fill()
  c.save();c.clip()
  for(const [x,y,color] of [[22,-21,'#9ee2c281'],[-23,18,'#b1bcf08a'],[22,27,'#f7bbe06e'],[-5,35,'#ffe8a66e']] as const){
    const sheen=c.createRadialGradient(x,y,2,x,y,29);sheen.addColorStop(0,color);sheen.addColorStop(1,'#ffffff00')
    c.fillStyle=sheen;c.fillRect(-r,-r,r*2,r*2)
  }
  c.restore()
  const rim=c.createLinearGradient(-40,-48,40,48);rim.addColorStop(0,'#9cc5cf');rim.addColorStop(.3,'#eac1dc');rim.addColorStop(.6,'#a9addc');rim.addColorStop(1,'#e7d9a8')
  c.strokeStyle=rim;c.lineWidth=1.3;c.stroke()
  c.strokeStyle='#ffffffef';c.lineWidth=4;c.lineCap='round';c.beginPath();c.arc(-1,-1,46,3.55,4.6);c.stroke()
  c.lineWidth=2;c.beginPath();c.arc(1,2,44,.3,1.1);c.stroke()
  c.fillStyle='#fff';c.beginPath();c.ellipse(-23,-33,5,8,.7,0,Math.PI*2);c.fill()
  return tile
}
