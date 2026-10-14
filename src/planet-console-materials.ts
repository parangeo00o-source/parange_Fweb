import * as THREE from 'three'
import {islandCoastGLSL} from './planet-coast'
import {waterSwellGLSL} from './planet-water'

// Object-space detail, not a spherical UV texture. The low-frequency mottling
// and small texel grain evoke painted console environments without polar seams.
const noise=`
float consoleHash(vec3 p) { return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
float consoleNoise(vec3 p) {
  vec3 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(consoleHash(i),consoleHash(i+vec3(1,0,0)),f.x),
    mix(consoleHash(i+vec3(0,1,0)),consoleHash(i+vec3(1,1,0)),f.x),f.y),
    mix(mix(consoleHash(i+vec3(0,0,1)),consoleHash(i+vec3(1,0,1)),f.x),
    mix(consoleHash(i+vec3(0,1,1)),consoleHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}`

/** Cool, hand-painted nighttime pigment response, composed with each surface's
 * existing shader (and subsequently with the village's sinkhole clipping). */
export function moonlitPalette(material:THREE.Material,strength=1) {
  const night={value:0},compile=material.onBeforeCompile,cacheKey=material.customProgramCacheKey()
  material.onBeforeCompile=(shader,renderer)=>{
    compile.call(material,shader,renderer)
    shader.uniforms.uMoonPalette=night
    shader.fragmentShader='uniform float uMoonPalette;\n'+shader.fragmentShader
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(diffuseColor.r*.48,diffuseColor.g*.68,diffuseColor.b*.95+.085),uMoonPalette);
      #include <roughnessmap_fragment>`)
  }
  material.customProgramCacheKey=()=>cacheKey+'-moon-palette-v1'
  return (value:boolean)=>{night.value=value?strength:0}
}

export function consoleGroundMaterial() {
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1})
  material.userData.consoleStyle='painted-turf'
  material.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 vConsoleSurface;\n'+shader.vertexShader
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvConsoleSurface=position;')
    shader.fragmentShader=`varying vec3 vConsoleSurface;\n${noise}\n`+shader.fragmentShader
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float broad=consoleNoise(vConsoleSurface*6.0);
      float fleck=consoleNoise(vConsoleSurface*145.0);
      float detail=1.0-smoothstep(0.008,0.024,length(fwidth(vConsoleSurface)));
      // Broad painted colour masses and fine turf pigment, never black speckles.
      float turf=smoothstep(.01,.12,diffuseColor.g-diffuseColor.r);
      diffuseColor.rgb *= mix(.94,1.06,broad)*mix(1.0,mix(.94,1.045,fleck),detail);
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.87,1.025,1.08),turf*(1.0-broad)*.45);
    `)
  }
  material.customProgramCacheKey=()=> 'console-painted-turf-v2'
  return material
}

export function consoleWaterMaterial() {
  const time={value:0},night={value:0},coastGlowStrength={value:2.3}
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)')
  // Keep painted depth/foam, but remove direct and environment specular glare.
  const material=new THREE.MeshPhysicalMaterial({color:'#109dcc',roughness:.95,metalness:0,clearcoat:0,specularIntensity:0,envMapIntensity:0,emissive:'#005d80',emissiveIntensity:.35,transparent:true,opacity:.76,depthWrite:false})
  material.userData.consoleStyle='lagoon-caustics'
  material.onBeforeCompile=shader=>{
    shader.uniforms.uConsoleTime=time
    shader.uniforms.uConsoleNight=night
    shader.uniforms.uCoastGlowStrength=coastGlowStrength
    shader.vertexShader=`varying vec3 vConsoleSurface;uniform float uConsoleTime;\n${waterSwellGLSL}\n`+shader.vertexShader
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vConsoleSurface=position;
      transformed+=normalize(position)*waterSwell(position,uConsoleTime);`)
    shader.fragmentShader=`varying vec3 vConsoleSurface;uniform float uConsoleTime;uniform float uConsoleNight;uniform float uCoastGlowStrength;\n${noise}\n${islandCoastGLSL}\n`+shader.fragmentShader
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec3 p=vConsoleSurface;
      // Three crossing wave families form soft, closed caustic cells instead
      // of straight stripes. Screen-space filtering keeps distant water stable.
      vec3 flow=p*23.0+vec3(sin(uConsoleTime*.37),cos(uConsoleTime*.29),sin(uConsoleTime*.23));
      float w=sin(flow.x+flow.y*.71+sin(flow.z*.61))
        +sin(flow.z-flow.y*.83+sin(flow.x*.53))
        +sin(flow.y+flow.x*.41-flow.z*.67);
      float caustic=1.0-smoothstep(.035,.17+fwidth(w),abs(w));
      vec3 n=normalize(p);
      float shore=islandBank(n);
      float foam=smoothstep(-.026,-.007,shore+sin(p.x*40.0+p.y*31.0+uConsoleTime)*.002);
      float shallows=smoothstep(-.25,-.015,shore);
      diffuseColor.rgb=mix(vec3(.008,.20,.48),vec3(.055,.64,.62),shallows)*mix(.96,1.035,consoleNoise(p*9.0));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.42,.90,.84),caustic*.32*shallows);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.78,.98,.90),foam*.84);
      vec3 moonWater=mix(vec3(.012,.047,.15),vec3(.035,.25,.32),shallows);
      moonWater+=vec3(.065,.15,.19)*caustic*.15*shallows;
      moonWater=mix(moonWater,vec3(.26,.48,.61),foam*.66);
      diffuseColor.rgb=mix(diffuseColor.rgb,moonWater,uConsoleNight);
      // Travelling crests follow the displaced surface's phase, rather than
      // leaving decorative rings frozen in place on top of the lagoon.
      float crest=pow(.5+.5*sin(p.x*19.0+p.y*13.0+uConsoleTime*1.25),22.0);
      float crossCrest=pow(.5+.5*sin(p.z*23.0-p.y*11.0-uConsoleTime*.93),28.0);
      float brokenCrest=(crest+crossCrest*.55)*smoothstep(.30,.76,consoleNoise(p*12.0));
      diffuseColor.rgb+=mix(vec3(.06,.16,.15),vec3(.015,.045,.075),uConsoleNight)*brokenCrest;
    `)
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      float coastDistance=islandBank(normalize(vConsoleSurface));
      float coastalGlow=exp(-pow((coastDistance+.026)/.050,2.0));
      float lightRibbon=pow(.5+.5*sin(coastDistance*145.0+consoleNoise(vConsoleSurface*8.0)*2.0-uConsoleTime*.45),5.0);
      float quietPulse=.91+.09*sin(uConsoleTime*.6+vConsoleSurface.x*3.0);
      totalEmissiveRadiance+=uConsoleNight*coastalGlow*quietPulse*uCoastGlowStrength*(vec3(.005,.11,.16)+vec3(.008,.045,.065)*lightRibbon);
    `)
  }
  material.customProgramCacheKey=()=> 'console-lagoon-swimmers-v3'
  return {material,setNight:(value:boolean)=>{night.value=value?1:0;material.emissive.set(value?'#071a42':'#005d80');material.emissiveIntensity=value?.18:.35},update:(now:number)=>{time.value=reduced.matches?0:now*.001}}
}

/** Subtle pigment/pore variation. Local geometry coordinates keep the finish
 * seamless on curved bricks and branching trunks, without pasted-on images. */
export function paintedFinish(material:THREE.Material,kind:'stone'|'wood'|'paint') {
  material.userData.paintedFinish=kind
  material.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 vFinish;\n'+shader.vertexShader
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvFinish=position;')
    shader.fragmentShader=`varying vec3 vFinish;\n${noise}\n`+shader.fragmentShader
    const detail=kind==='wood'
      ? 'float g=.5+.5*sin(vFinish.x*83.0+vFinish.z*67.0+consoleNoise(vFinish*vec3(12.0,3.0,12.0))*7.0); diffuseColor.rgb*=mix(1.0,mix(.91,1.055,g),finishDetail);'
      : kind==='stone'
        ? 'float g=consoleNoise(vFinish*130.0);diffuseColor.rgb*=mix(1.0,mix(.96,1.04,g),finishDetail);'
        : 'float g=consoleNoise(vFinish*70.0);diffuseColor.rgb*=mix(1.0,mix(.987,1.013,g),finishDetail);'
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float finishDetail=1.0-smoothstep(.004,.020,length(fwidth(vFinish)));
      ${detail}`)
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
      roughnessFactor=clamp(roughnessFactor+(g-.5)*finishDetail*${kind==='paint'?'.035':'.10'},.04,1.0);`)
  }
  material.customProgramCacheKey=()=>`island-finish-${kind}-v2`
}

export function islandPathMaterial(branch=false) {
  const material=consoleCourseMaterial(branch)
  material.roughness=.96;material.userData.consoleStyle='island-sandstone-path'
  material.onBeforeCompile=shader=>{
    shader.vertexShader='attribute vec2 courseUv;varying vec2 vCourse;\n'+shader.vertexShader
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvCourse=courseUv;')
    shader.fragmentShader=`varying vec2 vCourse;\n${noise}\n`+shader.fragmentShader
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float grain=consoleNoise(vec3(vCourse*vec2(31.0,18.0),0.0));
      float detail=1.0-smoothstep(.05,.25,length(fwidth(vCourse)));
      float edge=smoothstep(.33,.48,abs(vCourse.x-.5));
      float stone=step(.16,fract(vCourse.y*3.7+floor(vCourse.x*9.0)*.35));
      vec3 sand=vec3(.79,.65,.42)*mix(1.0,mix(.96,1.04,grain),detail);
      diffuseColor.rgb=mix(sand,mix(vec3(.53,.46,.32),vec3(.90,.83,.64),stone),edge*.70);
    `)
  }
  material.customProgramCacheKey=()=> 'island-sandstone-path-v2'
  return material
}

/** Checks use distance along the route, not latitude/longitude. */
export function consoleCourseMaterial(branch=false) {
  const material=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.78,side:THREE.DoubleSide,polygonOffset:branch,polygonOffsetFactor:-1,polygonOffsetUnits:-1})
  material.userData.consoleStyle='arc-length-checks'
  material.onBeforeCompile=shader=>{
    shader.vertexShader='attribute vec2 courseUv;varying vec2 vCourse;\n'+shader.vertexShader
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvCourse=courseUv;')
    shader.fragmentShader='varying vec2 vCourse;\n'+shader.fragmentShader
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float checker=mod(floor(vCourse.x*2.0)+floor(vCourse.y*2.0),2.0);
      float edge=step(vCourse.x,.055)+step(.945,vCourse.x);
      diffuseColor.rgb=mix(mix(vec3(.15,.38,.33),vec3(.83,.83,.64),checker),vec3(.94,.60,.08),clamp(edge,0.0,1.0));
    `)
  }
  material.customProgramCacheKey=()=> 'console-course-v1'
  return material
}
