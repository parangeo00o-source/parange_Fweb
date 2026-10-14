import {residentDesigns} from './resident-designs'
import {drawRigResident,residentArtRevision} from './neon-rig-sprites'
export {loadResidentArtwork,residentArtStatus} from './neon-rig-sprites'
import * as originalPaint from './neon-paint'
import * as residentPaint from './neon-resident-paint'
import {neonInk,neonPaper} from './neon-paint'
export {ellipse,path,star,flower,neonInk,neonPaper,neonColors} from './neon-paint'
export {drawNeonScenery as drawNeonProp} from './neon-scenery'
type C=CanvasRenderingContext2D

/** Vector art in logical pixels: the same drawings serve world, reveal and UI.
 * Original species/costume cues remain recognisable, re-authored as ink shapes.
 * Feet are at y=0; yaw chooses a drawn rear view, never a transparent 3D shell. */
export function drawNeonResident(c:C,index:number,time=0,yaw=0,walking=false,material=true){
  if(material&&drawRigResident(c,index,time,yaw,walking))return
  // Both finishes share this one original drawing. The optional unpainted
  // finish provides a geometry-preservation reference for regression tests.
  const {ellipse,path}=material?residentPaint:originalPaint
  const d=residentDesigns[index]??residentDesigns[0],kind=d.kind
  const body=({bear:'#5075ff',rabbit:'#ff51b8',cat:'#a273ef',penguin:'#52dfdb',koala:'#b6ee36',frog:'#ff914c',elephant:'#ff597f',raccoon:'#6f89ff',deer:'#ff51b8',dog:'#ff6a58',duck:'#55ddeb',sheep:'#ae7cff',mouse:'#e5ef43',otter:'#52d4ba',capybara:'#a9ec49',fox:'#ff9b56'} as Record<string,string>)[kind]
  const fur=({fox:'#ff9758',bear:'#cc935d',rabbit:'#fff8de',cat:'#ffe498',penguin:'#6b6cdd',koala:'#b2a4da',frog:'#a9ed45',elephant:'#70cbed',raccoon:'#c6a077',deer:'#ffc46c',dog:'#dca36e',duck:'#fff4b9',sheep:'#fff3d3',mouse:'#baa6e5',otter:'#d5a36e',capybara:'#cda074'} as Record<string,string>)[kind]
  const cream=neonPaper,pink='#ff9dd5',rear=Math.cos(yaw)<-.35
  const bob=walking?Math.sin(time*.008)*1.7:Math.sin(time*.002+index)*.6
  c.save();c.lineJoin='round';c.lineCap='round';c.translate(0,bob);c.scale(.94+.06*Math.abs(Math.cos(yaw)),1)
  // Rear accessories are still visible beside the body in the front view.
  if(kind==='fox')path(c,'M 16 -18 C 60 -16 61 -77 45 -89 C 40 -65 26 -58 13 -39 Z',fur)
  if(kind==='fox')path(c,'M 45 -89 C 56 -78 58 -65 54 -55 L 46 -61 L 43 -53 L 37 -58 C 43 -70 42 -76 45 -89 Z',cream)
  if(kind==='raccoon'){
    const tail=new Path2D('M 13 -19 C 54 -10 61 -54 40 -64 C 21 -72 20 -41 9 -37 Z')
    path(c,'M 13 -19 C 54 -10 61 -54 40 -64 C 21 -72 20 -41 9 -37 Z',fur);c.save();c.clip(tail)
    path(c,'M 34 -62 L 51 -49 M 24 -48 L 48 -32 M 20 -33 L 37 -21','',neonInk,8)
    c.restore()
  }
  if(kind==='mouse'){path(c,'M 15 -19 C 48 -8 54 -34 40 -38 C 21 -44 35 -70 53 -55','',neonInk,7);path(c,'M 15 -19 C 48 -8 54 -34 40 -38 C 21 -44 35 -70 53 -55','',pink,4)}
  if(kind==='otter')path(c,'M 11 -20 C 44 -15 58 -40 47 -45 C 34 -48 29 -32 11 -33 Z',fur)
  if(kind==='cat')path(c,'M 16 -19 C 43 -17 47 -49 36 -60','',neonInk,13)
  if(kind==='cat')path(c,'M 16 -19 C 43 -17 47 -49 36 -60','',fur,9)
  if(kind==='dog')path(c,'M 15 -24 Q 43 -22 42 -46','',fur,8)
  if(kind==='capybara')ellipse(c,19,-41,16,19,'#91c745')
  const step=walking?Math.sin(time*.009)*5:0
  for(const side of [-1,1]){
    c.save();c.translate(side*12,side*step)
    const foot=kind==='duck'||kind==='penguin'?'#f5d96a':body
    path(c,'M -9 -24 L 9 -24 L 10 -9 L -10 -9 Z',body,neonInk,1.5)
    path(c,`M -10 -12 Q -17 -10 -16 -4 Q -15 1 -3 1 L 11 1 Q 16 0 14 -6 L 9 -13 Z`,foot,neonInk,1.6)
    if(kind!=='duck'&&kind!=='penguin')path(c,'M -10 -13 Q 0 -10 10 -12 L 11 -8 Q 0 -7 -12 -10 Z',cream,'')
    path(c,'M -13 -3 Q -2 -1 12 -2','',neonInk,.7);c.restore()
  }
  if(kind==='rabbit')path(c,'M -15 -58 Q 0 -63 15 -58 L 18 -40 L 27 -20 Q 0 -11 -27 -20 L -18 -40 Z',body,neonInk,1.7)
  else path(c,'M -15 -59 Q 0 -63 15 -59 Q 24 -54 23 -43 L 23 -23 Q 23 -17 17 -17 L -17 -17 Q -23 -17 -23 -23 L -23 -43 Q -24 -54 -15 -59 Z',body,neonInk,1.7)
  if(kind==='penguin'&&!rear){ellipse(c,0,-33,15,20,cream);ellipse(c,0,-31,10,17,body,'')}
  if(kind!=='penguin')path(c,'M -22 -25 Q 0 -22 22 -25 L 22 -21 Q 0 -18 -22 -21 Z',cream,'')
  if(kind==='rabbit'&&!rear)path(c,'M -12 -52 L 0 -40 L 12 -52','',cream,5)
  if(kind==='bear'){
    path(c,'M -26 -52 Q 0 -73 26 -52 L 20 -42 Q 0 -53 -20 -42 Z',body)
    if(!rear){path(c,'M -11 -32 Q 0 -37 11 -32 L 12 -25 L -12 -25 Z','',neonInk,1);path(c,'M -8 -46 L -9 -39 M 8 -46 L 9 -39','',cream,1.8)}
  }
  if(kind==='mouse')path(c,'M -16 -49 L -13 -30 M 16 -49 L 13 -30','',neonInk,7)
  for(const side of [-1,1]){
    c.save();c.translate(side*23,-40);c.rotate(side*(-.28+Math.sin(time*.008)*.12*(walking?1:0)))
    if(kind==='duck'){c.scale(-side,1);path(c,'M -5 -4 C -22 -24 -31 -10 -19 -5 C -38 -8 -35 6 -20 5 C -31 18 -12 23 1 8 Z',cream)}
    else{
      c.scale(side,1)
      if(kind==='penguin')path(c,'M -7 -14 C 4 -18 18 3 13 21 Q 3 28 -4 9 Z',fur,neonInk,1.6)
      else{
        path(c,'M -7 -15 Q 5 -19 12 -6 L 15 3 Q 13 12 2 11 L -7 0 Z',body,neonInk,1.5)
        path(c,'M 2 5 Q 11 -1 16 6 C 25 14 13 24 5 20 Q -2 16 2 5 Z',kind==='bear'?fur:body,neonInk,1.5)
        path(c,'M -1 3 L 12 -3 L 15 3 L 2 9 Z',cream,neonInk,.85)
        path(c,'M 14 9 Q 10 9 10 13','',neonInk,.75)
      }
    }
    c.restore()
  }
  if(!rear&&!['penguin','rabbit','bear','mouse'].includes(kind)){
    path(c,'M 0 -48 L 0 -26','',neonInk,.8)
    ellipse(c,0,-40,4,4,'#f7e293',neonInk,1)
    path(c,'M -13 -32 L -6 -32 M 6 -32 L 13 -32','',cream,1.5)
  }
  const headY=-79+(kind==='frog'?6:0),wide=['otter','mouse','fox','raccoon','cat','elephant','koala','penguin','bear'].includes(kind)?35:32
  // Ears and antlers: different silhouettes, not recoloured copies.
  for(const side of [-1,1]){
    c.save();c.translate(side*23,headY-17)
    if(kind==='rabbit'){
      c.rotate(side*.25);path(c,'M -8 2 C -14 -9 -13 -42 -6 -49 C 5 -56 14 -43 10 -24 L 8 2 Z',fur,neonInk,1.5);if(!rear)path(c,'M -3 -7 Q -8 -39 -2 -43 Q 5 -47 5 -32 L 3 -8 Z',pink,'')
    }else if(kind==='raccoon'){
      c.rotate(side*.25);path(c,'M -11 7 C -17 -7 -13 -25 -2 -25 C 11 -24 15 -9 12 7 Z',fur,neonInk,1.5)
      if(!rear)path(c,'M -7 0 C -10 -10 -8 -19 -2 -19 Q 8 -18 7 0 Z',cream,'')
    }else if(['cat','fox','deer'].includes(kind)){
      c.rotate(side*(kind==='deer'?.65:.18));path(c,'M -13 10 Q -16 -14 -8 -32 Q 6 -25 13 6 Z',kind==='cat'&&side<0?neonInk:fur)
      if(!rear)path(c,'M -7 3 Q -10 -10 -7 -22 L 6 1 Z',kind==='cat'?pink:cream,'')
    }else if(kind==='dog'){
      c.scale(side,1);path(c,'M -4 -13 C 6 -25 19 -17 22 -4 L 31 27 C 35 45 17 49 10 36 C 2 21 1 2 -4 -13 Z','#b98876',neonInk,1.6)
      path(c,'M 11 -7 Q 12 19 22 35','',neonInk,.65)
    }else if(kind==='sheep'){
      c.scale(side,1);path(c,'M -6 0 C 10 -8 27 5 30 17 C 15 28 -1 19 -6 0 Z',fur,neonInk,1.4);if(!rear)path(c,'M 1 4 Q 15 3 24 16 Q 8 16 1 4 Z',pink,'')
    }else if(['bear','mouse','koala','elephant','otter','capybara'].includes(kind)){
      const r=kind==='mouse'?22:kind==='koala'?21:kind==='elephant'?24:kind==='bear'?13:7
      ellipse(c,side*7,kind==='elephant'?13:-3,r,kind==='elephant'?r*1.15:r,fur,neonInk,1.6)
      if(r>8&&!rear)ellipse(c,side*7,kind==='elephant'?13:-3,r*.67,r*.67,kind==='mouse'||kind==='elephant'?pink:cream,'')
    }
    c.restore()
  }
  if(kind==='deer')for(const side of [-1,1]){
    path(c,`M ${side*15} -94 Q ${side*20} -110 ${side*18} -125 M ${side*19} -111 L ${side*29} -121 M ${side*19} -115 L ${side*9} -124`,'',neonInk,6)
    path(c,`M ${side*15} -94 Q ${side*20} -110 ${side*18} -125 M ${side*19} -111 L ${side*29} -121 M ${side*19} -115 L ${side*9} -124`,'',fur,3)
  }
  if(kind==='sheep'){
    const wool=new Path2D();for(let i=0;i<=160;i++){const a=i/160*Math.PI*2,r=34+3*Math.cos(a*10),x=Math.cos(a)*r,y=headY+Math.sin(a)*r*.88;if(i)wool.lineTo(x,y);else wool.moveTo(x,y)}wool.closePath();c.fillStyle=material?residentPaint.residentFill(c,cream,-37,headY-33,74,66):cream;c.fill(wool);c.strokeStyle=neonInk;c.lineWidth=1.4;c.stroke(wool)
  }
  let head:Path2D
  if(kind==='frog'&&rear)for(const side of [-1,1])ellipse(c,side*21,headY-19,12,15,fur)
  if(kind==='fox'||kind==='raccoon'){
    const outline=`M -34 ${headY-5} Q -22 ${headY-34} 0 ${headY-27} Q 22 ${headY-34} 34 ${headY-5} L 44 ${headY+5} Q 28 ${headY+28} 0 ${headY+26} Q -28 ${headY+28} -44 ${headY+5} Z`
    head=new Path2D(outline);path(c,outline,fur)
  }else{
    // Broad cheek / softer jaw contours, not a single stretched oval for every species.
    const h=kind==='frog'?20:kind==='mouse'||kind==='elephant'?25:28,w=kind==='capybara'?37:wide
    const outline=kind==='capybara'?`M -29 ${headY+8} C -37 ${headY-18} -21 ${headY-30} -2 ${headY-26} Q 13 ${headY-27} 20 ${headY-13} C 48 ${headY-14} 49 ${headY+17} 31 ${headY+24} L -9 ${headY+25} Q -26 ${headY+24} -29 ${headY+8} Z`:`M ${-w} ${headY+2} C ${-w-2} ${headY-h*.72} ${-w*.61} ${headY-h} 0 ${headY-h} C ${w*.61} ${headY-h} ${w+2} ${headY-h*.72} ${w} ${headY+2} C ${w+4} ${headY+h*.66} ${w*.64} ${headY+h} 0 ${headY+h} C ${-w*.64} ${headY+h} ${-w-4} ${headY+h*.66} ${-w} ${headY+2} Z`
    head=new Path2D(outline);path(c,outline,fur,neonInk,1.7)
  }
  if(rear){
    if(kind==='rabbit'||kind==='sheep')ellipse(c,0,-24,8,8,cream)
  }else{
    c.save();c.clip(head)
    if(kind==='fox')path(c,`M -42 ${headY+4} Q -18 ${headY+12} 0 ${headY+1} Q 18 ${headY+12} 42 ${headY+4} Q 24 ${headY+29} 0 ${headY+25} Q -24 ${headY+29} -42 ${headY+4} Z`,cream,'')
    if(kind==='raccoon')path(c,`M -38 ${headY+3} Q -22 ${headY-20} -5 ${headY-7} Q 0 ${headY-3} 5 ${headY-7} Q 22 ${headY-20} 38 ${headY+3} Q 18 ${headY+22} 0 ${headY+13} Q -18 ${headY+22} -38 ${headY+3} Z`,neonInk,cream,2)
    if(kind==='raccoon')ellipse(c,0,headY+16,14,9,cream,'')
    if(kind==='penguin')path(c,`M 0 ${headY-17} C -38 ${headY-43} -42 ${headY+26} 0 ${headY+25} C 42 ${headY+26} 38 ${headY-43} 0 ${headY-17} Z`,cream,'')
    if(kind==='cat'){path(c,`M -33 ${headY+4} L -12 ${headY-13} L -3 ${headY-26} Q 11 ${headY-7} 34 ${headY+1} Q 23 ${headY+26} 0 ${headY+26} Q -24 ${headY+26} -33 ${headY+4} Z`,cream,'')}
    if(kind==='dog')path(c,`M -31 ${headY+5} C -25 ${headY-18} -7 ${headY-29} 0 ${headY-14} C 7 ${headY-4} 14 ${headY-13} 22 ${headY+1} Q 33 ${headY+24} 0 ${headY+29} Q -27 ${headY+29} -31 ${headY+5} Z`,cream,'')
    if(kind==='deer')path(c,`M -28 ${headY+17} C -32 ${headY-11} -14 ${headY-25} -4 ${headY-9} Q 0 ${headY+1} 4 ${headY-9} C 14 ${headY-25} 32 ${headY-11} 28 ${headY+17} Q 0 ${headY+36} -28 ${headY+17} Z`,cream,'')
    if(kind==='otter'||kind==='frog')ellipse(c,0,headY+11,wide-2,13,cream,'')
    if(kind==='bear'||kind==='koala')ellipse(c,0,headY+13,16,11,cream,'')
    if(kind==='capybara')path(c,`M 5 ${headY-3} C 14 ${headY-15} 43 ${headY-7} 44 ${headY+9} Q 45 ${headY+26} 19 ${headY+24} Q 2 ${headY+20} 5 ${headY-3} Z`,'#c09377','')
    c.restore()
    for(const side of [-1,1]){
      const ex=kind==='capybara'?side*14-8:side*13,ey=headY-3
      if(kind==='frog'){ellipse(c,side*21,headY-19,12,15,fur);ellipse(c,side*21,headY-20,5,7,neonInk,'')}
      else{if(kind==='raccoon')ellipse(c,ex,ey,6,9,cream,'');ellipse(c,ex,ey,4.2,7,neonInk,'');ellipse(c,ex-1,ey-2,1.2,1.7,cream,'')}
    }
    if(kind==='duck'){
      path(c,`M -21 ${headY+10} C -14 ${headY+5} -8 ${headY+6} 0 ${headY+8} C 8 ${headY+6} 14 ${headY+5} 21 ${headY+10} C 31 ${headY+20} 12 ${headY+24} 0 ${headY+23} C -12 ${headY+24} -31 ${headY+20} -21 ${headY+10} Z`,'#f4b45f',neonInk,1.3)
      path(c,`M -20 ${headY+15} Q 0 ${headY+19} 20 ${headY+15}`,'',neonInk,.8)
      for(const x of [-6,6])ellipse(c,x,headY+11,1.1,.8,neonInk,'')
    }
    else if(kind==='penguin')path(c,`M -9 ${headY+11} L 0 ${headY+6} L 10 ${headY+12} L 0 ${headY+18} Z`,'#fff04f')
    else if(kind==='elephant')path(c,`M -7 ${headY+6} Q -11 ${headY+34} 10 ${headY+34} Q 25 ${headY+35} 22 ${headY+19} Q 15 ${headY+17} 15 ${headY+25} Q 3 ${headY+26} 7 ${headY+6} Z`,fur)
    else if(kind==='koala')ellipse(c,0,headY+6,8,12,neonInk)
    else if(!['rabbit','sheep','frog','capybara'].includes(kind))ellipse(c,0,headY+11,4,3,neonInk,'')
    if(['cat','otter','mouse'].includes(kind))for(const side of [-1,1])for(let j=0;j<2;j++)path(c,`M ${side*22} ${headY+9+j*5} L ${side*34} ${headY+6+j*7}`,'',neonInk,1.6)
    if(kind==='capybara')for(const x of [18,27])ellipse(c,x,headY+2,1.5,2,neonInk,'')
    if(['bear','cat','mouse','otter','dog','sheep','rabbit'].includes(kind))path(c,`M -4 ${headY+17} Q 0 ${headY+21} 4 ${headY+17}`,'',neonInk,1)
    if(!['raccoon','capybara','frog'].includes(kind))for(const side of [-1,1]){c.globalAlpha=.3;ellipse(c,side*23,headY+10,4.5,2.5,pink,'');c.globalAlpha=1}
  }
  if(kind==='sheep')path(c,`M -30 ${headY-15} C -39 ${headY-27} -26 ${headY-37} -17 ${headY-31} C -12 ${headY-42} 0 ${headY-42} 5 ${headY-34} C 19 ${headY-42} 30 ${headY-31} 25 ${headY-24} C 37 ${headY-19} 28 ${headY-9} 18 ${headY-17} Q 8 ${headY-7} 0 ${headY-19} Q -13 ${headY-8} -18 ${headY-20} Q -24 ${headY-12} -30 ${headY-15} Z`,cream)
  if(kind==='duck'||kind==='penguin')path(c,`M -7 ${headY-26} Q 0 ${headY-38} 9 ${headY-28}`,fur)
  if(kind==='penguin'){path(c,'M 12 -47 L 23 -44 L 19 -25 Q 13 -25 10 -29 Z',body);path(c,'M -26 -53 Q 0 -45 26 -53 L 24 -45 Q 0 -38 -25 -45 Z',body)}
  c.restore()
}

const portraits=new Map<number,string>()
let portraitRevision=-1
export function neonResidentPortrait(index:number){
  if(portraitRevision!==residentArtRevision()){portraits.clear();portraitRevision=residentArtRevision()}
  let cached=portraits.get(index);if(cached)return cached
  const canvas=document.createElement('canvas');canvas.width=240;canvas.height=280
  const c=canvas.getContext('2d')!;c.translate(120,265);c.scale(1.7,1.7);drawNeonResident(c,index)
  cached=canvas.toDataURL('image/png');portraits.set(index,cached);return cached
}

