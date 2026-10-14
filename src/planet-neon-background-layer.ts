import {createNeonBackground} from './neon-background'

/** Existing illustrated sky behind the SAME transparent WebGL world canvas. */
export function createNeonBackgroundLayer(canvas:HTMLCanvasElement){
  const layer=document.createElement('canvas')
  layer.className='planet-neon-canvas';layer.setAttribute('aria-hidden','true');layer.hidden=true
  canvas.before(layer)
  const context=layer.getContext('2d',{alpha:false})!,background=createNeonBackground()
  const reduced=matchMedia('(prefers-reduced-motion: reduce)')
  let dpr=1,lastFrame=-Infinity,dirty=true,paintedReduced=false,lastWidth=0,lastHeight=0,lastDpr=0
  void background.ready.then(()=>{dirty=true})
  return {
    resize(){
      const width=canvas.clientWidth||innerWidth,height=canvas.clientHeight||innerHeight
      dpr=Math.min(devicePixelRatio||1,2,Math.sqrt(4_000_000/(width*height)))
      const pixelWidth=Math.round(width*dpr),pixelHeight=Math.round(height*dpr)
      if(width===lastWidth&&height===lastHeight&&dpr===lastDpr)return
      lastWidth=width;lastHeight=height;lastDpr=dpr
      layer.width=pixelWidth;layer.height=pixelHeight
      background.resize(width,height);lastFrame=-Infinity;dirty=true
    },
    render(now:number){
      // The decorative sky does not need to repaint at the world's full FPS.
      if(reduced.matches&&paintedReduced&&!dirty)return
      if(!dirty&&now-lastFrame<1000/30)return
      lastFrame=now;context.setTransform(dpr,0,0,dpr,0,0)
      background.render(context,reduced.matches?0:now)
      paintedReduced=reduced.matches;dirty=false
    },
    setVisible(visible:boolean){layer.hidden=!visible;lastFrame=-Infinity;dirty=true},
  }
}
