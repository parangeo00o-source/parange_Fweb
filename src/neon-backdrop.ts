import {drawPearlWing} from './neon-sky-art'

const note=new Path2D('M -10 -37 L 24 -45 L 24 18 C 24 32 0 35 -3 23 C -5 14 10 7 19 11 L 19 -23 L -5 -17 L -5 34 C -5 49 -30 49 -32 38 C -34 28 -19 23 -10 26 Z')
const glimmer=new Path2D('M 0 -28 Q 5 -6 24 0 Q 5 6 0 28 Q -5 6 -24 0 Q -5 -6 0 -28 Z')

/** A compact mirrored pair rooted behind the planet's left/right shoulders. */
export function pearlWingLayout(w:number,h:number){
  const portrait=w/h<.8
  return {
    width:Math.min(w*(portrait?.31:.27),h*.43)*1.15,
    left:w*(portrait?.35:.32),right:w*(portrait?.65:.68),
    y:h*(portrait?.435:.385),angle:-.16,alpha:.68,
  }
}

/** Pearl paper and paired wings, cached on resize/load. */
export function paintNeonBackdrop(canvas:HTMLCanvasElement,w:number,h:number){
  w=Math.max(1,w);h=Math.max(1,h)
  const density=Math.min(devicePixelRatio||1,2,Math.sqrt(4_000_000/(w*h)))
  canvas.width=Math.max(1,Math.floor(w*density));canvas.height=Math.max(1,Math.floor(h*density))
  const c=canvas.getContext('2d')!;c.scale(density,density)
  c.fillStyle='#fffefd';c.fillRect(0,0,w,h)
  for(const [x,y,r,color] of [[.05,.3,.44,'#e5f6fb'],[.96,.68,.4,'#fcebf5'],[.43,1,.34,'#eeeffd']] as const){
    const radius=Math.max(w,h)*r,g=c.createRadialGradient(w*x,h*y,0,w*x,h*y,radius)
    g.addColorStop(0,color);g.addColorStop(1,'#ffffff00');c.fillStyle=g;c.fillRect(0,0,w,h)
  }
  const portrait=w/h<.8
  // Equal size, height and mirrored angle make the feathers read as one pair.
  // Roots sit underneath the globe; only the outward fans remain visible.
  const wings=pearlWingLayout(w,h)
  for(const [x,flip] of [[wings.left,-1],[wings.right,1]]){
    c.save();c.translate(x,wings.y);c.scale(flip,1);c.rotate(wings.angle);c.globalAlpha=wings.alpha
    drawPearlWing(c,wings.width);c.restore()
  }
  // Fine, oversized ghost notes and sparkles fill the spaces between the
  // painted sprites. They remain deliberately quieter than the primary art.
  const marks=portrait?[[.09,.47,1.25,-.32,0],[.95,.32,.9,.25,0],[.90,.65,1.2,.4,1],[.18,.20,.8,-.2,1]]:
    [[.075,.51,2.3,-.25,0],[.9,.29,1.7,.2,0],[.72,.75,1.4,.32,0],[.35,.18,1.2,-.2,1],[.94,.5,1.4,.2,1],[.11,.85,1.1,-.2,1]]
  for(const [x,y,size,angle,kind] of marks){
    c.save();c.translate(w*x,h*y);c.rotate(angle);c.scale(size,size)
    c.fillStyle=kind?'#e2dcf236':'#f7cee326';c.strokeStyle=kind?'#aba5c36b':'#b9abb74f';c.lineWidth=.85/size
    c.fill(kind?glimmer:note);c.stroke(kind?glimmer:note);c.restore()
  }
}
