import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

type Track = (geometry: THREE.BufferGeometry, material: THREE.Material) => void
type Surface = (w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) => THREE.Texture

/** A local-only, user-enabled camera behind a cyan CRT glass insert. */
export function createArchiveMonitor(pivot: THREE.Group, host: HTMLElement, texture: Surface, track: Track, request: () => void) {
  const group = new THREE.Group(); group.name = 'case-webcam-monitor'
  group.position.set(0, .32, 5.55); group.rotation.x = Math.PI / 2; pivot.add(group)
  function part(g: THREE.BufferGeometry, m: THREE.Material, z: number, name: string) {
    track(g,m); const mesh = new THREE.Mesh(g,m); mesh.position.z=z; mesh.name=name; group.add(mesh); return mesh
  }
  const bezel = new THREE.MeshPhysicalMaterial({color:'#101418',metalness:.2,roughness:.26,clearcoat:.9,clearcoatRoughness:.18})
  part(new RoundedBoxGeometry(12.0,9.8,.25,5,.14),bezel,0,'monitor-black-frame')
  const standby = texture(768,576,ctx=>{
    const g=ctx.createRadialGradient(390,255,20,390,280,490)
    g.addColorStop(0,'#32b8d6');g.addColorStop(.65,'#08799c');g.addColorStop(1,'#033646')
    ctx.fillStyle=g;ctx.fillRect(0,0,768,576)
  })
  const video=document.createElement('video'); video.muted=true;video.autoplay=true;video.playsInline=true
  video.setAttribute('aria-hidden','true');video.style.cssText='position:fixed;width:1px;height:1px;left:-9999px;pointer-events:none'
  document.body.append(video)
  const liveTexture=new THREE.VideoTexture(video);liveTexture.colorSpace=THREE.SRGBColorSpace
  const material=new THREE.ShaderMaterial({
    uniforms:{feed:{value:standby},live:{value:0},aspect:{value:4/3},screenAspect:{value:11.1*1.28/8.8},time:{value:0}},
    vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`
      varying vec2 vUv; uniform sampler2D feed; uniform float live; uniform float aspect; uniform float screenAspect; uniform float time;
      void main(){
        vec2 p=vUv*2.-1.; vec2 uv=.5+.5*p*(1.+.035*dot(p,p));
        vec2 d=abs(p)-vec2(.93,.91); if(length(max(d,0.))+min(max(d.x,d.y),0.)>.07)discard;
        vec2 sampleUv=uv;
        if(aspect>screenAspect)sampleUv.x=(sampleUv.x-.5)*screenAspect/aspect+.5;
        else sampleUv.y=(sampleUv.y-.5)*aspect/screenAspect+.5;
        sampleUv.x=mix(sampleUv.x,1.-sampleUv.x,live);
        vec3 source=texture2D(feed,clamp(sampleUv,0.,1.)).rgb;
        float luma=dot(source,vec3(.299,.587,.114));
        vec3 cyan=mix(vec3(.002,.045,.12),vec3(.015,.64,.95),pow(luma,.78));
        vec3 col=mix(source,cyan,live);
        float scan=.955+.045*sin(uv.y*580.);
        float noise=fract(sin(dot(gl_FragCoord.xy+floor(time*24.),vec2(12.9898,78.233)))*43758.5453);
        col*=scan*(1.-.26*pow(length(p)*.7,2.)); col+=(noise-.5)*.018;
        // Soft reflected light on the curved glass, without obscuring the feed.
        float shine=exp(-pow((uv.x+.42*uv.y-.32)*13.,2.))*smoothstep(.48,.98,uv.y);
        col+=vec3(.5,.83,.9)*shine*.14;
        gl_FragColor=vec4(col,1.);
        #include <colorspace_fragment>
      }`,
    toneMapped:false,
  })
  const glassGeometry=new THREE.PlaneGeometry(11.1,8.8,48,40)
  const positions=glassGeometry.attributes.position
  for(let i=0;i<positions.count;i++){
    const x=positions.getX(i)/5.55,y=positions.getY(i)/4.4
    positions.setZ(i,.1*(1-x*x)*(1-y*y))
  }
  glassGeometry.computeVertexNormals()
  const worldScale=new THREE.Vector3()
  const glass=part(glassGeometry,material,.145,'monitor-cyan-glass')
  const button=document.createElement('button');button.type='button';button.className='ar-monitor-control';button.hidden=true
  const status=document.createElement('span');status.className='ar-monitor-status';status.setAttribute('role','status')
  host.append(button,status)
  let stream:MediaStream|undefined, available=false, disposed=false, generation=0, pending=false, frame:number|undefined
  function state(text='', label='Focus webcam monitor and start camera'){
    button.textContent='';status.textContent=text;button.setAttribute('aria-label',label);button.disabled=pending
    host.dataset.cameraState=stream?'live':pending?'connecting':'off';request()
  }
  function stop(){
    generation++;pending=false
    if(frame!==undefined)video.cancelVideoFrameCallback?.(frame)
    frame=undefined;stream?.getTracks().forEach(t=>t.stop());stream=undefined
    video.pause();video.srcObject=null;material.uniforms.feed.value=standby;material.uniforms.live.value=0
    state()
  }
  function nextFrame(){
    if(!stream||disposed||!available)return
    request()
    if(video.requestVideoFrameCallback)frame=video.requestVideoFrameCallback(nextFrame)
  }
  async function start(){
    if(stream)return
    if(!available||pending||disposed)return
    const ticket=++generation;pending=true;status.textContent='';state('CONNECTING…','Connecting to camera')
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('unavailable')
      const result=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:1280},height:{ideal:720},frameRate:{ideal:24,max:30}}})
      if(ticket!==generation||disposed||!available){result.getTracks().forEach(t=>t.stop());return}
      stream=result;video.srcObject=result;await video.play()
      if(ticket!==generation||disposed||!available)return
      material.uniforms.feed.value=liveTexture;material.uniforms.live.value=1
      material.uniforms.aspect.value=(video.videoWidth||1280)/(video.videoHeight||720)
      pending=false;state('','Focus webcam monitor')
      result.getVideoTracks()[0]?.addEventListener('ended',()=>{if(stream===result)stop()},{once:true})
      nextFrame()
    }catch(error){
      if(ticket!==generation||disposed)return
      stop();host.dataset.cameraState='error'
      const denied=error instanceof DOMException && error.name==='NotAllowedError'
      state(denied?'Allow camera access in your browser, then click the monitor to retry.':'Camera unavailable. Click the monitor to retry.','Retry camera');host.dataset.cameraState='error'
    }
  }
  const suspend=()=>{if(document.hidden)stop()}
  document.addEventListener('visibilitychange',suspend);window.addEventListener('pagehide',stop)
  state()
  return {
    button, start,
    setAvailable(value:boolean){if(available&&!value)stop();available=value;if(!value)button.hidden=true},
    update(time:number){material.uniforms.time.value=time/1000;group.getWorldScale(worldScale);material.uniforms.screenAspect.value=11.1*worldScale.x/(8.8*worldScale.y);return !!stream&&!video.requestVideoFrameCallback},
    bounds(){group.updateWorldMatrix(true,false);return [-6.1,6.1].flatMap(x=>[-5,5].map(y=>group.localToWorld(new THREE.Vector3(x,y,.2))))},
    surface(){group.updateWorldMatrix(true,false);return [[-6,4.9],[6,4.9],[6,-4.9],[-6,-4.9]].map(([x,y])=>group.localToWorld(new THREE.Vector3(x,y,.25)))},
    direction(){return new THREE.Vector3(0,0,1).transformDirection(group.matrixWorld)},
    facing(camera:THREE.Camera){const normal=new THREE.Vector3(0,0,1).transformDirection(glass.matrixWorld);return normal.dot(camera.position.clone().sub(glass.getWorldPosition(new THREE.Vector3())))>0},
    stop,
    dispose(){disposed=true;stop();button.remove();status.remove();video.remove();liveTexture.dispose();document.removeEventListener('visibilitychange',suspend);window.removeEventListener('pagehide',stop)},
  }
}
