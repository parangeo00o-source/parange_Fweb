import * as THREE from 'three'

export type DogExpression = 'off' | 'loading' | 'star' | 'heart' | 'smile'
const modes: Record<DogExpression, number> = { off: 0, loading: 1, star: 2, heart: 3, smile: 4 }

/** One shared, prewarmed shader for both eyes. Only uniforms change at runtime;
 * the green lenses remain intact underneath this transparent light layer. */
export function createDogLED() {
 const material = new THREE.ShaderMaterial({
  name: 'dog-led-light', transparent: true, depthWrite: false, toneMapped: false,
  blending: THREE.AdditiveBlending,
  uniforms: { mode: { value: 0 }, previous: { value: 0 }, blend: { value: 1 }, gain: { value: 1 }, time: { value: 0 }, animate: { value: 0 } },
  vertexShader: 'attribute vec2 heartUv; varying vec2 vUv; varying vec2 vHeartUv; void main(){vUv=uv;vHeartUv=heartUv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `
   varying vec2 vUv, vHeartUv;
   uniform float mode, previous, blend, gain, time, animate;
   const float PI=3.14159265359;
   float segment(vec2 p,vec2 a,vec2 b){vec2 ab=b-a;return length(p-a-ab*clamp(dot(p-a,ab)/dot(ab,ab),0.,1.));}
   float diode(float d,float radius){
    float aa=max(fwidth(d),.008);
    return 1.-smoothstep(radius-aa,radius+aa,d)+.26*exp(-max(0.,d-radius)*28.);
   }
   float glyph(vec2 p,float kind){
    float light=0.;
    if(kind<.5)return 0.;
    if(kind<1.5){
     // Twelve individual radial LEDs, with a clockwise travelling highlight.
     for(int i=0;i<12;i++){
      float a=PI*.5-float(i)*PI/6.;vec2 ray=vec2(cos(a),sin(a));
      float trail=fract(float(i)/12.-time*.65);
      float power=mix(.85,.24+.76*pow(trail,2.),animate);
      light+=diode(segment(p,ray*.50,ray*.72),.055)*power;
     }
    }else if(kind<2.5){
     // Keep the dotted outline, fill its interior from the centre, then turn
     // the whole star off briefly. One clear fill/blink cycle takes 1.8 s.
     vec2 cell=floor(p/.14+.5),q=cell*.14;
     float inside=0.,edgeDistance=10.;
     for(int i=0;i<10;i++){
      float a=PI*.5+float(i)*PI/5.,b=a+PI/5.;
      float ra=mod(float(i),2.)<.5?.76:.34,rb=1.10-ra;
      vec2 start=vec2(cos(a),sin(a))*ra,end=vec2(cos(b),sin(b))*rb;
      light+=max(diode(length(p-start),.065),diode(length(p-mix(start,end,.5)),.057));
      edgeDistance=min(edgeDistance,segment(q,start,end));
      if((start.y>q.y)!=(end.y>q.y)){
       float crossing=start.x+(q.y-start.y)*(end.x-start.x)/(end.y-start.y);
       if(q.x<crossing)inside=1.-inside;
      }
     }
     float cycle=fract(time/1.8);
     float radius=mix(.84,mix(-.08,.84,smoothstep(.10,.44,cycle)),animate);
     float fill=inside*smoothstep(.025,.065,edgeDistance)*(1.-smoothstep(radius-.08,radius+.04,length(q)));
     light=max(light,fill*diode(length(p-q),.047));
     light*=mix(1.,smoothstep(0.,.07,cycle)*(1.-smoothstep(.67,.78,cycle)),animate);
    }else if(kind<3.5){
     // An exactly mirrored 9-row matrix stays upright on each curved lens.
     // A clear double heartbeat: contract to 70%, expand to 104%, then a
     // smaller second beat and a rest. Keep its centre and upright axis fixed.
     float cycle=fract(time/1.4);
     float beat=exp(-pow((cycle-.18)/.065,2.))+.65*exp(-pow((cycle-.40)/.075,2.));
     p=(vHeartUv*2.-1.)/mix(1.,.70+.34*beat,animate);
     vec2 cell=floor(p/.16+.5),q=cell*.16;
     float x=abs(cell.x),y=cell.y,inside=0.;
     if(y==4.)inside=step(2.,x)*step(x,3.);
     else if(y==3.)inside=step(1.,x)*step(x,4.);
     else if(y==2.||y==1.)inside=step(x,4.);
     else if(y==0.||y==-1.)inside=step(x,3.);
     else if(y==-2.)inside=step(x,2.);
     else if(y==-3.)inside=step(x,1.);
     else if(y==-4.)inside=step(x,0.);
     light=inside*diode(length(p-q),.055)*(1.-animate*.22*(1.-beat));
    }else{
     // Seven rays form the upward arch of the reference's smiling eye.
     for(int i=0;i<7;i++){
      float a=float(i)*PI/6.;vec2 ray=vec2(cos(a),sin(a));
      light+=diode(segment(p-vec2(0.,-.23),ray*.43,ray*.68),.064);
     }
    }
    return light*(1.-smoothstep(.87,.97,length(p)));
   }
   void main(){
    vec2 p=vUv*2.-1.;
    // Blink switching uses a binary blend. Evaluate only the visible glyph,
    // rather than running both LED patterns for every fragment.
    float glow=glyph(p,blend<.5?previous:mode)*gain;
    // Pale mint cores and a cyan halo read as emitted light without recolouring
    // or obscuring the original lime-green optics.
    vec3 light=mix(vec3(.12,.80,.88),vec3(.78,1.,.86),smoothstep(.25,.85,glow));
    gl_FragColor=vec4(light,min(glow,.96));
    #include <colorspace_fragment>
   }`,
 })
 let expression: DogExpression = 'off', changedAt = -Infinity, startGain = 1
 function update(next: DogExpression, now: number, animated: boolean, reduced: boolean) {
  if(next!==expression){
   material.uniforms.previous.value=material.uniforms.blend.value<.5?material.uniforms.previous.value:material.uniforms.mode.value
   material.uniforms.mode.value=modes[next]
   startGain=material.uniforms.gain.value;expression=next;changedAt=now
  }
  if(reduced)changedAt=-Infinity
  const elapsed=now-changedAt
  // Dim the old LEDs, switch glyphs while dark, then light the new pattern.
  // Keep the current brightness when an action interrupts an existing blink.
  material.uniforms.blend.value=elapsed<150?0:1
  material.uniforms.gain.value=elapsed<150?startGain*(1-THREE.MathUtils.smoothstep(elapsed,0,100)):THREE.MathUtils.smoothstep(elapsed,170,350)
  material.uniforms.time.value=reduced?0:now/1000
  material.uniforms.animate.value=animated&&!reduced?1:0
  return !reduced&&(elapsed<350||animated)
 }
 return { material, update }
}
