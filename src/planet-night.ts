import * as THREE from 'three'

/** Camera-relative sky, behind both the globe and its soap bubbles. No dark
 * screen overlay: moonlight on the world comes from separate scene lights. */
export function createPlanetNight(scene:THREE.Scene,camera:THREE.PerspectiveCamera) {
  const uniforms={uTime:{value:0},uAspect:{value:1},uMeteors:{value:-1}}
  const material=new THREE.ShaderMaterial({uniforms,depthWrite:false,depthTest:true,toneMapped:false,
    vertexShader:`varying vec2 vSkyUv;
      void main(){vSkyUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`precision highp float;
      varying vec2 vSkyUv;uniform float uTime;uniform float uAspect;uniform float uMeteors;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
      float clouds(vec2 p){return noise(p)*.57+noise(p*2.03)*.28+noise(p*4.07)*.15;}
      float stars(vec2 p,float density,float radius){
        vec2 grid=p*density,cell=floor(grid);float seed=hash(cell);
        vec2 center=vec2(hash(cell+17.1),hash(cell+43.7))*.7+.15;
        float d=length(fract(grid)-center);
        // Differentiate before fract(): cell edges must not become bright
        // cross-shaped artifacts when tiny stars are antialiased.
        float aa=max(fwidth(grid.x)*.55,.008);
        return (1.0-smoothstep(radius-aa,radius+aa,d))*step(.967,seed)*(.66+.34*sin(uTime*.65+seed*91.0));
      }
      void main(){
        vec2 p=(vSkyUv-.5)*vec2(uAspect,1.0);
        vec3 color=mix(vec3(.006,.014,.050),vec3(.002,.003,.015),smoothstep(0.0,1.0,vSkyUv.y));
        float mist=clouds(p*vec2(2.2,3.0)+vec2(12.0,7.0));
        color+=vec3(.004,.006,.019)*mist;
        float star=stars(p+4.0,155.0,.065)*.65+stars(p+7.3,58.0,.044);
        color+=vec3(.48,.64,.94)*star;
        // Upper-right moon leaves the central globe, title and controls clear.
        vec2 moon=vec2(uAspect*(uAspect<.85?-.22:.28),uAspect<.85?.26:.37);
        vec2 q=(p-moon)/.046;float d=length(q),aa=max(fwidth(d),.004);
        color+=vec3(.10,.21,.36)*exp(-d*d*.30)+vec3(.014,.036,.075)*exp(-d*d*.028);
        float disk=1.0-smoothstep(1.0-aa,1.0+aa,d);
        float z=sqrt(max(0.0,1.0-dot(q,q)));
        float light=.64+.36*max(0.0,dot(normalize(vec3(q,z)),normalize(vec3(-.5,.4,1.0))));
        float crater=clouds(q*5.0+3.0)*.25+noise(q*17.0)*.045;
        color=mix(color,vec3(.64,.86,1.0)*light*(1.0-crater)+vec3(.15,.16,.16),disk);
        // Soft horizontal banks drift slowly, rather than racing across the sky.
        float bank=clouds(p*vec2(3.6,17.0)+vec2(uTime*.006,8.0));
        float veil=smoothstep(.55,.79,bank)*.54;
        color=mix(color,vec3(.011,.021,.049)+vec3(.010,.016,.030)*mist,veil);
        // White-gold star heads, thin blue tails and individual trailing sparks.
        // Independent lanes cover the entire sky, behind the opaque planet.
        if(uMeteors>=0.0)for(int i=0;i<8;i++){
          float lane=float(i),elapsed=uMeteors-lane*.43,period=5.2+hash(vec2(lane,9.0))*1.5;
          float cycle=floor(max(0.0,elapsed)/period),age=mod(max(0.0,elapsed),period);
          float seed=hash(vec2(lane+3.0,cycle+4.0)),life=1.1+seed*.55;
          if(elapsed>=0.0&&age<life){
            vec2 origin=vec2((lane/7.0-.38+(seed-.5)*.16)*uAspect,mix(-.22,.62,hash(vec2(cycle+7.0,lane))));
            vec2 direction=normalize(vec2(-.85-seed*.25,-.65));
            vec2 head=origin+direction*(age/life)*(.32+seed*.22);
            vec2 delta=p-head;float along=dot(delta,-direction),across=abs(delta.x*direction.y-delta.y*direction.x);
            float pixel=max(fwidth(p.x),.0004),tailLength=min(.18,uAspect*.35);
            float tail=(1.0-smoothstep(pixel*.4,pixel*1.6,across))*pow(clamp(1.0-along/tailLength,0.0,1.0),1.8)*step(0.0,along);
            float glow=exp(-dot(delta,delta)/.000055)*.40;
            float core=1.0-smoothstep(pixel*.8,pixel*2.2,length(delta));
            vec2 star=abs(delta);
            float rays=exp(-star.x/(pixel*.65)-star.y/.010)+exp(-star.y/(pixel*.65)-star.x/.010);
            float cell=floor(along*90.0),jitter=hash(vec2(cell+cycle,lane+4.0));
            vec2 sparkOffset=vec2((cell+.18+jitter*.64)/90.0,(hash(vec2(cell+11.0,lane+cycle))-.5)*.009);
            vec2 sparkDelta=vec2(along,delta.x*direction.y-delta.y*direction.x)-sparkOffset;
            float sparkle=exp(-dot(sparkDelta,sparkDelta)/(pixel*pixel*1.4))*(.4+.6*sin(age*8.0+jitter*17.0)*sin(age*8.0+jitter*17.0))*clamp(1.0-along/tailLength,0.0,1.0)*step(.018,along);
            float fade=smoothstep(0.0,.14,age)*(1.0-smoothstep(life*.70,life,age));
            color+=(vec3(.25,.60,1.0)*(tail*.85+sparkle*.38)+vec3(1.0,.88,.57)*(glow+core+rays*.65))*fade;
          }
        }
        gl_FragColor=vec4(color,1.0);
        #include <colorspace_fragment>
      }`})
  const sky=new THREE.Mesh(new THREE.PlaneGeometry(1,1),material)
  sky.name='moonlit-night-sky';sky.frustumCulled=false;sky.renderOrder=-20;sky.visible=false;scene.add(sky)
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)')
  let night=false,meteorsStarted:number|null=null
  return {sky,setNight:(value:boolean)=>{
    if(night===value)return
    night=value;sky.visible=value;meteorsStarted=null;uniforms.uMeteors.value=-1
  },update:(now:number,worldVisible:boolean,meteorReady=true)=>{
    if(night&&meteorReady&&meteorsStarted===null)meteorsStarted=now
    uniforms.uMeteors.value=night&&!reduced.matches&&meteorsStarted!==null?(now-meteorsStarted)*.001:-1
    sky.visible=night&&worldVisible
    if(!sky.visible)return
    uniforms.uTime.value=reduced.matches?0:now*.001;uniforms.uAspect.value=camera.aspect
    const depth=camera.position.length()+14,height=2*depth*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))
    sky.position.set(0,0,-depth).applyQuaternion(camera.quaternion).add(camera.position)
    sky.quaternion.copy(camera.quaternion);sky.scale.set(height*camera.aspect,height,1)
  }}
}
