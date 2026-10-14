import {ellipse,path,star,flower,neonInk,neonPaper} from './neon-paint'
import {paintNeonBackdrop} from './neon-backdrop'
import {loadSkyArtwork,drawIllustratedFish,drawSkyMotif,drawSkyBird,createBubbleTile} from './neon-sky-art'
import {skyLayout} from './neon-sky-layout'
export {skyFishDesigns} from './neon-sky-art'
type C=CanvasRenderingContext2D

/** Individually authored silhouettes and patterns; never a reference-image crop. */
export function drawSkyFish(c:C,index:number,time=0){
  if(drawIllustratedFish(c,index,time))return
  const variant=index%8,colors=['#6bded6','#f76ebc','#d4f269','#a88ce0','#93d1b5','#a5e7eb','#f5c4e4','#b6a9ee']
  c.save();c.lineJoin='round';c.lineCap='round'
  c.save();c.translate(-43,0);c.rotate(Math.sin(time*.0015+index)*.10)
  path(c,variant%2?'M 8 0 Q -10 -17 -27 -32 Q -17 0 -27 32 Q -7 15 8 0 Z':'M 8 0 L -28 -25 Q -16 0 -28 25 Z',colors[variant],neonInk,1.1)
  for(let i=-1;i<=1;i++)path(c,`M 4 0 Q -12 ${i*10} -23 ${i*22}`,'','#fffdf6',1)
  c.restore()
  // Translucent fan fins sit behind the patterned body, with a fine ray structure.
  for(const side of [-1,1]){
    c.save();c.scale(1,side)
    path(c,'M -21 -17 Q -15 -47 4 -48 Q 1 -29 19 -20 Z',colors[variant]+'88','#85788c',.8)
    for(let i=0;i<5;i++)path(c,`M ${-17+i*7} -20 Q ${-15+i*3} -33 ${-7+i*2.5} -43`,'','#ffffffaa',.8)
    c.restore()
  }
  const body=new Path2D(variant===1||variant===6?'M -47 0 Q -24 -18 -11 -52 Q 9 -25 45 -8 Q 58 0 45 8 Q 9 25 -11 52 Q -24 18 -47 0 Z':variant===3?'M -49 0 C -17 -27 28 -27 57 0 C 28 27 -17 27 -49 0 Z':'M -48 0 C -31 -41 20 -40 49 -6 Q 60 0 49 6 C 20 40 -31 41 -48 0 Z')
  c.fillStyle=neonPaper;c.fill(body);c.save();c.clip(body)
  const wash=c.createLinearGradient(-30,-30,42,25);wash.addColorStop(0,'#fffefa');wash.addColorStop(.62,colors[variant]);wash.addColorStop(1,'#fff3f7');c.fillStyle=wash;c.fillRect(-65,-55,130,110)
  if(variant===0){for(let y=-26;y<31;y+=10)for(let x=-38;x<25;x+=12){c.beginPath();c.arc(x+(y%20?6:0),y,7,0,Math.PI);c.fillStyle=['#72c8ca','#f5a2c9','#adade1'][(Math.round((x+38)/12)+Math.round((y+26)/10))%3];c.fill();c.strokeStyle='#fffbee';c.lineWidth=1;c.stroke()}}
  if(variant===1)for(let x=-36;x<28;x+=12)path(c,`M ${x} -53 Q ${x+30} -12 ${x-7} 45`,'','#f63daa',6)
  if(variant===2)for(const [x,y,r] of [[-24,-10,17],[7,12,15],[22,-18,14]])for(let j=0;j<4;j++)ellipse(c,x,y,r-j*3,r-j*3,['#f969b2','#f4ec5c','#80e2db','#fffef3'][j],'')
  if(variant===3){for(let x=-40;x<30;x+=8){path(c,`M ${x} -22 L ${x} 22`,'','#8377af',.6);if(x%24)path(c,`M ${x+1} -22 L ${x+1} -2`,'','#56476f',4)}star(c,28,7,9,'#ff80c3')}
  if(variant===4){for(let x=-40;x<30;x+=14)path(c,`M ${x} -36 Q ${x-18} 0 ${x} 36 M ${x} -36 Q ${x+18} 0 ${x} 36`,'','#64bfa0',.8);flower(c,-5,0,20,'#c5d0f6')}
  if(variant===5){for(let y=-30;y<32;y+=10)for(let x=-40;x<31;x+=10)if((x+y)%20===0){c.fillStyle='#c0a9ea';c.fillRect(x,y,10,10)}}
  if(variant===6){star(c,-12,-12,17,'#ecf45b');star(c,-10,18,10,'#85e4df');path(c,'M -37 5 Q -4 -21 27 -8','',neonPaper,3)}
  if(variant===7)for(let i=0;i<4;i++)path(c,`M -55 ${-33+i*15} C -17 ${17+i*11} 9 ${-48+i*17} 37 ${-24+i*14}`,'',['#f7a4d8','#fff8be','#b8f0e0','#9381db'][i],6)
  c.restore();c.strokeStyle='#685675';c.lineWidth=1.1;c.stroke(body)
  path(c,'M 25 -13 Q 16 0 25 13','','#84748e',.9)
  path(c,'M 10 2 Q -5 -13 -12 2 Q -2 13 10 2 Z','#ffffff99','#8e8194',.7)
  path(c,'M 8 2 L -8 2 M 8 2 L -6 -2','',colors[variant],.65)
  ellipse(c,38,-4,5,5,neonPaper,'#685675',.8);ellipse(c,39,-4,2.5,3,'#494154','');ellipse(c,40,-5,1,1,'#fff','')
  c.restore()
}

export function createNeonBackground(){
  const backdrop=document.createElement('canvas'),bubble=createBubbleTile(),ready=loadSkyArtwork()
  let width=1,height=1,backdropKey=''
  let layout=skyLayout(width,height)
  let still:HTMLCanvasElement|null=null
  void ready.then(()=>{paintNeonBackdrop(backdrop,width,height);still=null})
  function resize(w:number,h:number){
    width=Math.max(1,w);height=Math.max(1,h)
    const key=[width,height,devicePixelRatio||1].join(':')
    if(key===backdropKey)return
    still=null
    layout=skyLayout(width,height)
    paintNeonBackdrop(backdrop,width,height);backdropKey=key
  }
  function paintFrame(c:C,time:number){
    c.save()
    c.clearRect(0,0,width,height)
    c.fillStyle='#fffefd';c.fillRect(0,0,width,height)
    c.drawImage(backdrop,0,0,width,height)
    const {unit,portrait}=layout,seconds=time*.001
    // Buoyancy: small bubbles rise faster and sway independently. They only
    // wrap after leaving the viewport, never popping out in the visible sky.
    for(let i=0;i<26;i++){
      const r=(7+i%6*4)*unit,span=height+2*r,speed=5+(i%4)*2
      const x=width*((i*.381966+.07)%1)+Math.sin(seconds*.4+i*2)*12*unit
      const y=span-((i*.173*span+seconds*speed)%span)-r
      c.save();c.globalAlpha=.64+.15*Math.sin(seconds*.6+i);c.drawImage(bubble,x-r,y-r,r*2,r*2);c.restore()
    }
    layout.bubbles.forEach(([x,y,size],i)=>{
      const r=size*unit,dx=Math.sin(seconds*.22+i)*8*unit,dy=Math.cos(seconds*.28+i)*9*unit
      c.save();c.translate(width*x+dx,height*y+dy);c.globalAlpha=.86
      c.drawImage(bubble,-r,-r,r*2,r*2)
      c.drawImage(bubble,r*.42,-r*1.04,r*.82,r*.82);c.restore()
    })
    // A composed, asymmetric margin garden; nothing is glued to the planet.
    layout.motifs.forEach(([kind,x,y,size],i)=>{
      const beat=Math.sin(seconds*2.5+i),sway=Math.sin(seconds*.45+i)
      const offset=kind===1?-Math.pow(Math.max(0,beat),3)*9:kind===3?Math.sin(seconds*.65)*3:sway*5
      c.save();c.translate(width*x+Math.cos(seconds*.24+i)*5*unit,height*y+offset*unit)
      c.rotate(kind===0?seconds*.035+i*.8:kind===1?beat*.08:kind===2?sway*.13:-.12+sway*.025)
      if(kind===2)c.globalAlpha=.78+.2*Math.sin(seconds*1.2+i)
      if(!drawSkyMotif(c,kind,size*unit)){
        if(kind===0)flower(c,0,0,size*unit*.3,'#fac4e0')
        else if(kind===2)star(c,0,0,size*unit*.3,'#c7e9ef')
      }
      c.restore()
    })
    // Four genuinely different illustrations; paired lanes leave the middle
    // quiet. Slow horizontal journeys, tail wave and body pitch are separate.
    layout.fish.forEach(([start,y,direction,size],i)=>{
      // Slow through-swimming preserves the initial collage for longer. The
      // offscreen gutter includes the largest fish, so wrapping cannot pop.
      const margin=Math.max(140,154*size*.7)*unit,span=width+margin*2
      const x=((start*width+margin+seconds*(portrait?3.4:5.2)*direction)%span+span)%span-margin
      const swim=Math.sin(seconds*.52+i*1.7)
      c.save();c.translate(x,height*y+swim*17*unit);c.rotate(Math.cos(seconds*.52+i*1.7)*.045*direction)
      c.scale(direction*unit*size,unit*size);drawSkyFish(c,i,time);c.restore()
    })
    for(let i=0;i<2;i++){
      const span=width+240*unit,direction=i===0?1:-1
      const travel=(seconds*(22+i*7)+width*(i===0?.57:.21))%span
      const x=direction===1?travel-120*unit:width+120*unit-travel
      const y=height*(i===0?.21:.59)+Math.sin(seconds*.9+i)*12*unit
      c.save();c.translate(x,y);c.rotate(Math.cos(seconds*.9+i)*.07*direction);c.scale(direction*unit*.64,unit*.64)
      drawSkyBird(c,time,i);c.restore()
    }
    c.restore()
  }
  function render(c:C,time:number){
    // Reduced-motion is a single cached composition, not 28-strip animation
    // repainted each frame. Rebuild only on resize or when artwork is ready.
    if(time===0){
      if(!still){
        still=document.createElement('canvas');still.width=backdrop.width;still.height=backdrop.height
        const sc=still.getContext('2d',{alpha:false})!;sc.scale(still.width/width,still.height/height);paintFrame(sc,0)
      }
      c.drawImage(still,0,0,width,height)
    }else paintFrame(c,time)
  }
  return {resize,render,ready}
}
