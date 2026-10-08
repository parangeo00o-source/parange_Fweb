import * as THREE from 'three'

/** Transparent background spheres, with thin-film colour and curved highlights.
 * They stay behind the world and never participate in pointer picking. */
export function createPlanetBubbles(scene:THREE.Scene,camera:THREE.PerspectiveCamera) {
  const group=new THREE.Group();group.name='island-sky-bubbles';scene.add(group)
  const time={value:0},light={value:1}
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uTime:time,uLight:light,uVisibility:{value:1}},
    vertexShader:`varying vec3 vNormal;varying vec3 vView;
      void main(){vec4 p=modelViewMatrix*vec4(position,1.0);vNormal=normalize(normalMatrix*normal);vView=-p.xyz;gl_Position=projectionMatrix*p;}`,
    fragmentShader:`uniform float uTime;uniform float uLight;uniform float uVisibility;varying vec3 vNormal;varying vec3 vView;
      void main(){
        vec3 n=normalize(vNormal),v=normalize(vView);
        float facing=clamp(dot(n,v),0.0,1.0),rim=pow(1.0-facing,2.4);
        float angle=atan(n.y,n.x),film=.5+.5*sin(facing*18.0+angle*2.3+uTime*.22);
        vec3 rainbow=mix(vec3(.20,.91,1.0),vec3(1.0,.39,.77),film);
        rainbow=mix(rainbow,vec3(1.0,.92,.52),pow(.5+.5*sin(angle*3.0+1.0),5.0)*.65);
        float shine=pow(max(0.0,dot(n,normalize(vec3(-.42,.62,1.0)))),70.0);
        // Broad curved sky reflection and a thinner reflected lower crescent.
        float arc=exp(-pow((facing-.48)/.075,2.0))*smoothstep(.05,.66,n.y)*smoothstep(-.8,.2,-n.x);
        float lower=exp(-pow((facing-.27)/.052,2.0))*smoothstep(.08,.72,-n.y)*.36;
        float filmBand=exp(-pow((facing-.20)/.10,2.0))*(.45+.55*sin(angle*2.0+uTime*.18)*sin(angle*2.0+uTime*.18));
        float haze=pow(max(0.0,n.y),3.0)*.035;
        vec3 colour=mix(rainbow,vec3(.95,1.0,1.0),clamp(shine+arc+lower,0.0,1.0));
        float alpha=clamp(.006+rim*.46+filmBand*.16+shine*.80+arc*.62+lower+haze,0.0,.86);
        gl_FragColor=vec4(colour*uLight,alpha*uVisibility);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`})
  const layout=[[-.40,.20,.080],[-.29,-.27,.044],[.36,.25,.10],[.40,-.19,.055],[-.08,.36,.057],[-.46,-.05,.031],[.20,-.36,.040]]
  const geometry=new THREE.SphereGeometry(1,48,32)
  const spheres=layout.map((_,i)=>{
    const mat=i===0?material:material.clone();mat.uniforms.uTime=time;mat.uniforms.uLight=light
    const mesh=new THREE.Mesh(geometry,mat);mesh.name='sky-soap-bubble';group.add(mesh);return mesh
  })
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)'),right=new THREE.Vector3(),up=new THREE.Vector3(),forward=new THREE.Vector3()
  // One reusable instanced sparkle field, separate from the seven pick-free
  // bubbles. No timers or new geometry are created by repeated mode toggles.
  const sparkGeometry=new THREE.InstancedBufferGeometry()
  sparkGeometry.setAttribute('position',new THREE.Float32BufferAttribute([-.5,-.5,0,.5,-.5,0,-.5,.5,0,.5,.5,0],3))
  sparkGeometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1,1,1],2));sparkGeometry.setIndex([0,1,2,2,1,3])
  const centers=new Float32Array(7*64*3),seeds=new Float32Array(7*64*3),colors=new Float32Array(7*64*3)
  const palette=['#ff305d','#ffad18','#13d9ff','#9d4cff','#54ef5c','#ff35d1'].map(c=>new THREE.Color(c))
  for(let i=0;i<7;i++)for(let j=0;j<64;j++){
    const index=i*64+j
    seeds.set([j*2.39996323+i*.7,((j*37+i*13)%101)/101,i*.11],index*3)
    colors.set(palette[(Math.floor(j/8)+i)%palette.length].toArray(),index*3)
  }
  sparkGeometry.setAttribute('aCenter',new THREE.InstancedBufferAttribute(centers,3))
  sparkGeometry.setAttribute('aSeed',new THREE.InstancedBufferAttribute(seeds,3));sparkGeometry.instanceCount=448
  sparkGeometry.setAttribute('aColor',new THREE.InstancedBufferAttribute(colors,3))
  const sparkUniforms={uAge:{value:0},uAspect:{value:1}}
  const sparkMaterial=new THREE.ShaderMaterial({uniforms:sparkUniforms,transparent:true,depthWrite:false,depthTest:true,toneMapped:false,blending:THREE.AdditiveBlending,
    vertexShader:`attribute vec3 aCenter;attribute vec3 aSeed;attribute vec3 aColor;uniform float uAge;uniform float uAspect;
      varying vec2 vSparkUv;varying float vFade;varying vec3 vColor;
      void main(){
        float age=uAge-aSeed.z,life=1.15+aSeed.y*.40,t=clamp(age/life,0.0,1.0);
        vec2 direction=vec2(cos(aSeed.x),sin(aSeed.x));
        float radius=aCenter.z*min(1.0,uAspect/.9);
        vec2 center=vec2(aCenter.x*uAspect,aCenter.y)+direction*(radius*(.18+.7*sqrt(aSeed.y))+max(age,0.0)*(.08+aSeed.y*.13));
        center.y-=max(age,0.0)*max(age,0.0)*.055;
        float size=(.009+aSeed.y*.012)*(1.0-t*.55);
        vec3 point=vec3(center+position.xy*size,0.0);
        vFade=step(0.0,age)*(1.0-step(life,age))*smoothstep(0.0,.045,age)*pow(1.0-t,1.35);
        vColor=aColor;vSparkUv=uv*2.0-1.0;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(point,1.0);
      }`,
    fragmentShader:`varying vec2 vSparkUv;varying float vFade;varying vec3 vColor;
      void main(){
        vec2 p=vSparkUv;float glow=exp(-dot(p,p)*5.0)*.65;
        float core=exp(-dot(p,p)*40.0);
        float rays=(exp(-abs(p.x)*30.0)*exp(-abs(p.y)*3.0)+exp(-abs(p.y)*30.0)*exp(-abs(p.x)*3.0))*.45;
        gl_FragColor=vec4(mix(vColor,vec3(1.0),core*.10),min(1.0,glow+core+rays)*vFade);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`})
  const bursts=new THREE.Mesh(sparkGeometry,sparkMaterial);bursts.name='sky-bubble-bursts';bursts.frustumCulled=false;bursts.visible=false;scene.add(bursts)
  let night=false,started=0,lastNow=0,riseStarted:number|null=null
  let frozenCenters:number[][]=[]
  const centerAt=(i:number,t:number)=>{
    const [x,y,size]=layout[i],phase=i*1.8,speed=.40+(i%3)*.055
    const driftX=reduced.matches?0:Math.sin(t*speed*.71+phase)*.026+Math.sin(t*.21+phase*.8)*.007
    const driftY=reduced.matches?0:Math.sin(t*speed+phase)*.047+Math.sin(t*.24+phase)*.012
    const progress=riseStarted===null||reduced.matches?1:THREE.MathUtils.smoothstep(t*1000-riseStarted-i*120,0,2200)
    return [x+driftX+Math.sin(progress*Math.PI)*.024*Math.sin(phase),THREE.MathUtils.lerp(-.64-size,y+driftY,progress),size,progress]
  }
  return {group,bursts,get burstComplete(){return night&&(reduced.matches||lastNow-started>=2400)},setNight:(value:boolean,now=performance.now())=>{
    if(night===value)return
    if(value)frozenCenters=layout.map((_,i)=>centerAt(i,now*.001))
    night=value;started=now;light.value=value?.65:1;bursts.visible=false
    if(value){
      riseStarted=null
      for(let i=0;i<7;i++)for(let j=0;j<64;j++)centers.set(frozenCenters[i].slice(0,3),(i*64+j)*3)
      sparkGeometry.attributes.aCenter.needsUpdate=true
    }else{riseStarted=now;group.visible=true;spheres.forEach(sphere=>{sphere.visible=true})}
  },update:(now:number,visible:boolean)=>{
    lastNow=now
    const age=(now-started)*.001,bursting=night&&!reduced.matches&&age<2.4
    group.visible=visible&&(!night||bursting);bursts.visible=visible&&bursting
    if(!group.visible&&!bursts.visible)return
    const t=reduced.matches?0:(night?started:now)*.001;time.value=t
    camera.updateMatrixWorld();right.setFromMatrixColumn(camera.matrixWorld,0);up.setFromMatrixColumn(camera.matrixWorld,1);camera.getWorldDirection(forward)
    const depth=camera.position.length()+8,height=2*depth*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),width=height*camera.aspect
    sparkUniforms.uAge.value=age;sparkUniforms.uAspect.value=camera.aspect
    bursts.position.copy(camera.position).addScaledVector(forward,depth);bursts.quaternion.copy(camera.quaternion);bursts.scale.set(height,height,1)
    spheres.forEach((sphere,i)=>{
      const [x,y,size,progress]=night?frozenCenters[i]:centerAt(i,t),pop=age-i*.11
      sphere.visible=!night||pop<0
      sphere.material.uniforms.uVisibility.value=night?1:THREE.MathUtils.smoothstep(progress,0,.25)
      sphere.position.copy(camera.position).addScaledVector(forward,depth).addScaledVector(right,x*width).addScaledVector(up,y*height)
      const anticipation=night?1+.09*THREE.MathUtils.smoothstep(pop,-.14,0):1
      sphere.scale.setScalar(height*size*Math.min(1,camera.aspect/.9)*anticipation*(night?1:.70+.30*progress))
    })
  }}
}
