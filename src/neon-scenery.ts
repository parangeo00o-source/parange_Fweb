import {star,flower,neonInk,neonPaper,neonColors} from './neon-paint'
import {ellipse,path} from './neon-scenery-paint'
type C=CanvasRenderingContext2D
export const sceneryTileBounds={left:-60,top:-115,width:120,height:130} as const
const mint='#9cd6b4',leafGreen='#bedf87',lilac='#b9a3d9',rose='#ec8dbd',butter='#f3e29a'

function leaf(c:C,x:number,y:number,s:number,angle:number,color=mint){
  c.save();c.translate(x,y);c.rotate(angle);c.scale(s,s)
  path(c,'M 0 0 C -15 -6 -15 -23 0 -30 C 15 -23 15 -6 0 0 Z',color,neonInk,1.1)
  path(c,'M 0 -2 L 0 -24 M 0 -10 L -6 -17 M 0 -15 L 5 -21','',neonInk,.65);c.restore()
}
function planter(c:C,x:number,y:number,scale=1){
  c.save();c.translate(x,y);c.scale(scale,scale)
  leaf(c,0,-5,.45,-.8);leaf(c,1,-4,.55,.65,leafGreen)
  path(c,'M -9 -8 L 9 -8 L 6 3 Q 0 6 -6 3 Z',rose,neonInk,1.2)
  path(c,'M -10 -8 L 10 -8 L 9 -5 L -9 -5 Z',neonPaper,neonInk,1)
  flower(c,1,-19,6,butter);c.restore()
}
function windowPane(c:C,x:number,y:number,w=12,h=16){
  c.save();c.translate(x,y)
  path(c,`M ${-w/2} 0 L ${-w/2} ${-h+w/2} Q 0 ${-h-w/2} ${w/2} ${-h+w/2} L ${w/2} 0 Z`,neonPaper,neonInk,1.5)
  path(c,`M ${-w/2+2} -2 L ${-w/2+2} ${-h+w/2} Q 0 ${-h-w/2+3} ${w/2-2} ${-h+w/2} L ${w/2-2} -2 Z`,'#9ad9de','')
  path(c,`M ${-w/2+3} ${-h*.3} L ${w/2-3} ${-h*.8} M ${-w/2+3} ${-h*.55} L 0 ${-h*.83}`,'','#ffffffb8',1.6)
  path(c,`M 0 -2 L 0 ${-h+1} M ${-w/2+1} ${-h*.42} L ${w/2-1} ${-h*.42}`,'',neonInk,.8)
  path(c,`M ${-w/2-2} 0 L ${w/2+2} 0`,'',neonInk,1.8);c.restore()
}
function label(c:C,word:string,x:number,y:number,color=neonInk){
  c.fillStyle=color;c.textAlign='center';c.font='600 5px sans-serif';c.fillText(word,x,y)
}
function tree(c:C,kind:string,index:number){
  if(kind==='palm'){
    path(c,'M -7 0 C 4 -18 7 -40 1 -66 L 8 -69 C 17 -41 13 -17 5 0 Z','#d8b8b7')
    for(let i=0;i<6;i++)path(c,`M ${1+i*.7} ${-7-i*8} L ${9+i*.2} ${-10-i*8}`,'','#897b8e',.7)
    for(const [a,s] of [[-1.6,1],[-.94,.9],[-.35,.92],[.6,1],[1.28,.96],[1.8,.75]]){
      c.save();c.translate(5,-67);c.rotate(a);c.scale(s,s)
      path(c,'M 0 0 C -16 -19 -12 -47 8 -51 C 1 -31 18 -17 0 0 Z',a<0?mint:leafGreen,neonInk,1.2)
      path(c,'M 0 -2 Q -4 -27 8 -51 M -2 -12 L -9 -20 M -2 -22 L 6 -29 M 0 -32 L -5 -37','',neonInk,.7);c.restore()
    }
    ellipse(c,0,-64,4,5,butter,neonInk,1);ellipse(c,7,-62,4,5,rose,neonInk,1);return
  }
  path(c,'M -9 0 C -4 -19 -9 -34 -12 -53 L -5 -60 L 3 -56 C 4 -38 3 -19 11 0 Z','#b8b29a')
  path(c,'M -3 -2 Q -8 -21 -1 -36 M 3 -9 Q -1 -17 1 -25','',neonInk,.8)
  // Scalloped, overlapping botanical masses with a connected branching trunk.
  const crown='M -38 -46 C -53 -54 -47 -73 -36 -75 C -40 -89 -23 -98 -13 -91 C -6 -109 14 -108 20 -94 C 34 -102 49 -91 43 -77 C 57 -66 48 -49 37 -47 C 32 -32 12 -32 3 -40 C -11 -29 -29 -31 -38 -46 Z'
  path(c,crown,index%4===0?'#d7c5e6':index%3===0?'#e4e69d':'#bfe3a7',neonInk,1.6)
  c.save();c.clip(new Path2D(crown))
  // Overlapping, softly lit leaf pillows create volume inside one continuous
  // silhouette. No new sprite extents or disconnected outline intersections.
  for(const [x,y,rx,ry] of [[-26,-67,23,25],[0,-83,24,26],[27,-69,24,26],[4,-48,32,17]]){
    const g=c.createRadialGradient(x-7,y-10,1,x,y,rx*1.2)
    g.addColorStop(0,'#fffdebbd');g.addColorStop(.5,'#fffdee35');g.addColorStop(1,'#77739912')
    c.fillStyle=g;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill()
  }
  for(let j=0;j<23;j++){
    const x=Math.sin(j*2.399)*Math.sqrt((j+1)/23)*43,y=-67+Math.cos(j*2.399)*Math.sqrt((j+1)/23)*33
    leaf(c,x,y,.17+(j%3)*.035,(j%2?1:-1)*.9,index%4===0?'#c6addb':'#a2cda4')
  }
  c.restore()
  path(c,'M -2 -29 Q -1 -50 1 -79 M -1 -47 Q -17 -50 -28 -66 M 0 -56 Q 16 -56 27 -76 M 0 -68 Q -9 -72 -13 -87','',neonInk,1.4)
  for(const [x,y,s,a] of [[-21,-66,.58,-.7],[-29,-52,.45,-1.1],[-6,-80,.52,-.5],[16,-72,.64,.7],[28,-52,.46,1.1],[6,-42,.48,.8],[30,-80,.37,.5],[-34,-76,.34,-.6]])leaf(c,x,y,s,a,index%4===0?'#baa0d7':mint)
  if(kind==='fruit-tree'||index%4===1){for(const [x,y] of [[-27,-74],[23,-61],[0,-93]]){ellipse(c,x,y,5,6,rose,neonInk,1);ellipse(c,x-1.6,y-2,1.2,2,'#fff7e5b0','');path(c,`M ${x} ${y-5} L ${x+2} ${y-9}`,'',neonInk,.8)}}
  else for(const [x,y] of [[-31,-43],[28,-89],[11,-50]])flower(c,x,y,4.5,index%2?neonPaper:rose)
  leaf(c,-7,-1,.4,-1.2,leafGreen);leaf(c,6,-1,.3,.9)
}

/** Hand-authored connected silhouettes, restrained ink and shared botanical
 * details. The root at (0, 0) stays on the spherical surface in every view. */
export function drawNeonScenery(c:C,kind:string,index=0,_time=0){
  c.save();c.lineJoin='round';c.lineCap='round'
  const color=neonColors[index%neonColors.length]
  if(kind.includes('tree')||kind==='broadleaf'||kind==='palm'){tree(c,kind,index);c.restore();return}
  if(kind==='home'){
    path(c,'M -33 -3 L -33 -45 L 15 -45 L 15 -3 Z','#fff5db')
    path(c,'M 15 -3 L 35 -13 L 35 -55 L 15 -45 Z','#d2bfdf')
    path(c,'M -39 -43 Q -25 -59 -14 -79 L 8 -84 Q 20 -65 40 -54 L 16 -43 Z',lilac)
    c.save();c.clip(new Path2D('M -39 -43 Q -25 -59 -14 -79 L 8 -84 Q 20 -65 40 -54 L 16 -43 Z'))
    for(let row=0;row<6;row++)for(let col=0;col<10;col++){
      const x=-43+col*10+(row%2)*5,y=-82+row*7
      path(c,`M ${x} ${y} Q ${x+5} ${y+5} ${x+10} ${y}`,'','#f9effb95',.85)
    }
    c.restore()
    path(c,'M -14 -79 Q -3 -59 16 -43 L 40 -54 M -32 -51 Q -12 -50 6 -53 M -26 -60 L 0 -62 M -20 -69 L -8 -71','',neonInk,.85)
    path(c,'M -39 -43 Q -12 -39 16 -43 L 40 -54 L 40 -50 L 16 -39 Q -11 -35 -39 -39 Z',rose,neonInk,1.3)
    path(c,'M -32 -36 Q -9 -32 14 -36 L 14 -32 Q -8 -28 -32 -32 Z','#b49cac35','')
    for(let row=0;row<4;row++)for(let col=0;col<5;col++){
      const x=-31+col*9+(row%2)*3,y=-31+row*7
      if(x<12)path(c,`M ${x} ${y} L ${Math.min(x+5,13)} ${y}`,'','#c1abb938',.6)
    }
    path(c,'M -7 -3 L -7 -25 Q 0 -38 7 -25 L 7 -3 Z','#a9c5bd',neonInk,1.4)
    path(c,'M -4 -5 L -4 -24 Q 0 -29 4 -24 L 4 -5 Z','',neonPaper,1)
    ellipse(c,3,-16,1.3,1.3,butter,neonInk,.7)
    windowPane(c,-21,-18,11,15);windowPane(c,25,-26,10,14)
    path(c,'M -11 -3 L 10 -3 L 14 2 L -14 2 Z','#d8c6e2',neonInk,1)
    path(c,'M -14 2 L 14 2 L 16 5 L -16 5 Z',neonPaper,neonInk,1)
    for(let i=0;i<3;i++)path(c,`M -31 ${-11-i*8} L -27 ${-11-i*8}`,'','#beafbc',.7)
    ellipse(c,-11,-57,6,7,neonPaper,neonInk,1);path(c,'M -11 -63 L -11 -51 M -16 -57 L -6 -57','',neonInk,.8)
    planter(c,28,-2,.7);planter(c,-35,0,.6)
  }else if(kind==='market'){
    path(c,'M -35 -3 L -35 -46 L 27 -46 L 27 -3 Z','#fff5dc')
    path(c,'M 27 -3 L 37 -10 L 37 -51 L 27 -46 Z',lilac)
    path(c,'M -39 -48 L -30 -67 L 28 -67 L 39 -50 L 28 -45 Z',mint)
    path(c,'M -35 -45 L 30 -45 L 39 -28 L -43 -28 Z',neonPaper)
    for(let i=0;i<6;i++)path(c,`M ${-33+i*11} -44 L ${-27+i*11} -44 L ${-23+i*13} -29 L ${-32+i*13} -29 Z`,rose,'')
    path(c,'M -43 -28 Q -36 -20 -30 -28 Q -23 -20 -17 -28 Q -10 -20 -4 -28 Q 3 -20 10 -28 Q 17 -20 24 -28 Q 31 -20 39 -28','',neonInk,1.4)
    path(c,'M -27 -5 L -27 -22 L 19 -22 L 19 -5 Z','#b2d8ce',neonInk,1.2)
    path(c,'M -30 -12 L 24 -12 L 24 -8 L -30 -8 Z',neonPaper,neonInk,1)
    for(let i=0;i<6;i++){ellipse(c,-23+i*7,-16,3.4,3.5,i%2?butter:rose,neonInk,.65);path(c,`M ${-23+i*7} -19 L ${-22+i*7} -21`,'',neonInk,.6)}
    path(c,'M -20 -64 L 20 -64 L 20 -51 L -20 -51 Z',neonPaper,neonInk,1)
    label(c,'FLOWER MART',0,-56)
    planter(c,35,-1,.9);planter(c,-36,0,.55)
  }else if(kind==='park'){
    path(c,'M -38 -2 L -29 -10 L 27 -10 L 38 -2 L 28 3 L -28 3 Z',lilac,neonInk,1)
    for(const x of [-27,24])path(c,`M ${x} -7 L ${x} -47 L ${x+5} -47 L ${x+5} -7 Z`,neonPaper,neonInk,1.3)
    path(c,'M -39 -47 Q -11 -59 -4 -79 Q 9 -62 38 -48 Q 0 -39 -39 -47 Z',rose)
    path(c,'M -4 -79 Q -8 -60 -25 -45 M -4 -79 Q 6 -58 23 -45','',neonInk,.85)
    ellipse(c,-4,-80,3,3,butter,neonInk,1)
    path(c,'M -28 -16 L 29 -16 M -26 -24 L 27 -24','',neonInk,1.4)
    for(let x=-20;x<=24;x+=8)path(c,`M ${x} -24 L ${x} -9`,'',mint,3)
    path(c,'M -19 -37 Q 0 -49 20 -37','',neonInk,1)
    for(const x of [-12,0,12])flower(c,x,-37-(x===0?5:0),3.5,butter)
    planter(c,-33,-2,.7);planter(c,33,-2,.7)
  }else if(kind.includes('signal')||kind.includes('lighthouse')){
    path(c,'M -19 -1 L -11 -71 L 12 -71 L 20 -1 Z',neonPaper)
    for(let y=-10;y>-65;y-=18)path(c,`M ${-18-y*.1} ${y} L ${18+y*.1} ${y-5} L ${17+(y-8)*.1} ${y-13} L ${-17-(y-8)*.1} ${y-8} Z`,rose,'')
    windowPane(c,0,-44,8,12)
    path(c,'M -6 -1 L -6 -15 Q 0 -24 6 -15 L 6 -1 Z',lilac,neonInk,1)
    path(c,'M -21 -70 L -21 -75 L 21 -75 L 21 -70 Z',butter,neonInk,1)
    path(c,'M -15 -75 L -15 -89 L 15 -89 L 15 -75 Z','#b8e9e4',neonInk,1.2)
    path(c,'M -5 -89 L -5 -75 M 6 -89 L 6 -75','',neonInk,1)
    ellipse(c,0,-82,3,5,butter,'')
    path(c,'M -21 -89 Q -8 -96 0 -103 Q 7 -96 21 -89 Z',lilac)
    path(c,'M -25 -71 L -25 -80 M 25 -71 L 25 -80 M -25 -80 L 25 -80','',neonInk,1)
    for(const x of [-17,-9,9,17])path(c,`M ${x} -80 L ${x} -71`,'',neonInk,.7)
    ellipse(c,0,-103,2,2,rose,neonInk,.8)
  }else if(kind.includes('dock')){
    path(c,'M -34 0 L -21 -21 L 28 -21 L 42 0 Z','#e3cba7')
    for(let y=-16;y<0;y+=5)path(c,`M ${-34-y*.6} ${y} L ${42+y*.6} ${y}`,'',neonInk,.7)
    for(const x of [-26,31]){path(c,`M ${x} 2 L ${x} -17`,'',neonInk,5);path(c,`M ${x} 1 L ${x} -17`,'',lilac,3)}
    path(c,'M -25 -14 Q 0 -5 31 -14','',neonInk,1)
    path(c,'M -17 -31 Q 7 -18 34 -33 Q 22 -12 1 -16 Q -9 -20 -17 -31 Z',rose)
    path(c,'M 7 -25 L 7 -75 L 30 -35 L 7 -35 Z',neonPaper,neonInk,1.3)
    path(c,'M 3 -66 L -19 -36 L 3 -36 Z',mint,neonInk,1.2);star(c,16,-45,5,butter)
  }else if(kind.includes('swings')){
    path(c,'M -33 0 L -18 -55 L -12 -55 L -25 0 Z',lilac)
    path(c,'M 16 -55 L 22 -55 L 38 0 L 30 0 Z',lilac)
    path(c,'M -22 -58 L 27 -58 L 27 -52 L -22 -52 Z',rose)
    path(c,'M -7 -51 L -7 -18 M 14 -51 L 14 -18','',neonInk,1.3)
    path(c,'M -12 -18 L 19 -18 L 16 -12 L -9 -12 Z',butter)
    for(const x of [-16,20])ellipse(c,x,-55,1.5,1.5,neonPaper,'')
    flower(c,1,-55,4,neonPaper)
  }else if(kind.includes('slide')){
    path(c,'M -31 0 L -27 -48 L -12 -48 L -10 0','',neonInk,3)
    for(let y=-8;y>-47;y-=8)path(c,`M -29 ${y} L -12 ${y}`,'',lilac,4)
    path(c,'M -15 -49 C 9 -52 2 -12 36 -9 L 38 -3 C 0 -1 1 -39 -15 -42 Z',rose)
    path(c,'M -15 -49 C 9 -52 2 -12 36 -9','',neonPaper,2)
    path(c,'M -30 -49 L -30 -57 L -12 -57 L -12 -49','',mint,4)
  }else if(kind.includes('bench')){
    for(const x of [-23,24])path(c,`M ${x} 0 L ${x} -30`,'',neonInk,3)
    for(let y=-29;y<=-20;y+=7)path(c,`M -30 ${y} Q 0 ${y-3} 31 ${y}`,'',lilac,6)
    path(c,'M -30 -15 L 30 -15 L 35 -9 L -34 -9 Z',rose)
    path(c,'M -28 -20 L -34 -19 L -34 -9 M 30 -20 L 35 -19 L 35 -9','',neonInk,2)
  }else if(kind.includes('seesaw')){
    path(c,'M -9 0 L 0 -21 L 9 0 Z',lilac)
    path(c,'M -36 -30 L 37 -14 L 36 -9 L -37 -25 Z',rose)
    path(c,'M -25 -28 L -25 -39 M 26 -16 L 26 -27','',neonInk,2)
    ellipse(c,0,-21,3,3,butter,neonInk,1)
  }else if(kind.includes('sandbox')){
    ellipse(c,0,-5,33,15,lilac);ellipse(c,0,-8,28,10,butter,neonInk,1)
    path(c,'M -10 -9 L -10 -16 L -2 -16 L 0 -9 Z',rose,neonInk,1)
    path(c,'M 13 -7 L 19 -17 M 17 -20 L 22 -17','',neonInk,1.3);star(c,6,-8,4,neonPaper)
  }else if(kind.includes('fence')){
    path(c,'M -29 -17 L 29 -17 M -29 -7 L 29 -7','',lilac,4)
    for(let x=-25;x<=25;x+=12)path(c,`M ${x-3} 0 L ${x-3} -22 L ${x} -26 L ${x+3} -22 L ${x+3} 0 Z`,neonPaper,neonInk,1)
  }else if(kind.includes('gate')||kind.includes('loop')){
    path(c,'M -33 0 L -33 -18 C -33 -65 33 -65 33 -18 L 33 0 L 20 0 L 20 -18 C 20 -47 -20 -47 -20 -18 L -20 0 Z',lilac)
    path(c,'M -27 0 L -27 -18 C -27 -56 27 -56 27 -18 L 27 0','',rose,4)
    flower(c,0,-47,7,butter);planter(c,-33,0,.6);planter(c,33,0,.6)
  }else if(kind.includes('bridge')){
    path(c,'M -45 0 Q 0 -54 45 0 L 32 1 Q 0 -31 -32 1 Z',lilac)
    path(c,'M -44 -2 Q 0 -56 44 -2','',neonPaper,3)
    for(let x=-36;x<=36;x+=12){const y=-23*(1-(x/45)**2);path(c,`M ${x} ${y} L ${x} ${y-16}`,'',neonInk,1.4)}
    path(c,'M -42 -19 Q 0 -64 42 -19','',rose,3)
  }else if(kind.includes('sign')){
    path(c,'M -3 0 L -3 -39 L 3 -39 L 3 0 Z',lilac)
    path(c,'M -28 -55 L 19 -55 L 31 -43 L 19 -31 L -28 -31 Z',butter)
    label(c,'LET’S PLAY',-2,-42);flower(c,0,-59,5,rose)
  }else if(kind.includes('star-marker')){
    path(c,'M -3 0 L -3 -23 L 3 -23 L 3 0 Z',lilac);star(c,0,-31,15,butter)
    ellipse(c,-4,-32,1,2,neonInk,'');ellipse(c,4,-32,1,2,neonInk,'')
  }else{flower(c,0,-14,14,color)}
  c.restore()
}
