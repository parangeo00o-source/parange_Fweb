import * as THREE from 'three'

/** A shaded pit cut out of the terrain, not a UI deletion target or a flat icon. */
export function createPlanetSinkhole(world:THREE.Group,terrain:THREE.Mesh,radius:number,surface:(n:THREE.Vector3)=>{height:number},underlays:THREE.Mesh[]=[]) {
  const normal=new THREE.Vector3(0,0,1),forward=new THREE.Vector3(0,0,1)
  const size=1.85,openingRadius=.203*size,outerRadius=.229*size
  const holeNormal={value:normal},holeCos={value:2}
  const cut=(material:THREE.Material)=>{
    const previous=material.onBeforeCompile
    material.onBeforeCompile=(shader,renderer)=>{
      // Keep the environment's painted turf / caustics / course shaders intact.
      previous.call(material,shader,renderer)
      shader.uniforms.uSinkNormal=holeNormal;shader.uniforms.uSinkCos=holeCos
      shader.vertexShader='varying vec3 vSinkPosition;\n'+shader.vertexShader
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n#ifdef USE_INSTANCING\nvSinkPosition = (instanceMatrix * vec4(position, 1.0)).xyz;\n#else\nvSinkPosition = position;\n#endif')
      shader.fragmentShader='uniform vec3 uSinkNormal;\nuniform float uSinkCos;\nvarying vec3 vSinkPosition;\n'+shader.fragmentShader
      shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif (dot(normalize(vSinkPosition), uSinkNormal) > uSinkCos) discard;')
    }
    material.customProgramCacheKey=()=> 'planet-sinkhole-v1'+(material.userData.consoleStyle?`:${material.userData.consoleStyle}`:'');material.needsUpdate=true
  }
  const terrainMaterial=terrain.material as THREE.Material
  cut(terrainMaterial)
  // The planet has a complete water sphere under its land; cut that surface
  // too, otherwise the pit would expose a blue puddle instead of its dark base.
  underlays.forEach(mesh=>cut(mesh.material as THREE.Material))
  const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});cut(depth);terrain.customDepthMaterial=depth
  const group=new THREE.Group();group.name='resident-sinkhole';group.visible=false;world.add(group)
  const profile=[[0,-.36],[.065,-.35],[.102,-.26],[.145,-.13],[.19,-.018],[.207,.012],[.229,.007]]
  const geometry=new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),64)
  const colors:number[]=[],positions=geometry.getAttribute('position'),dark=new THREE.Color('#100d27'),earth=new THREE.Color('#9a5136'),rimColor=new THREE.Color('#eeb26c')
  for(let i=0;i<positions.count;i++){
    const y=positions.getY(i),c=dark.clone().lerp(earth,THREE.MathUtils.smoothstep(y,-.28,-.014))
    c.lerp(rimColor,THREE.MathUtils.smoothstep(y,-.012,.01));colors.push(c.r,c.g,c.b)
  }
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3))
  const material=new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:.94})
  const cup=new THREE.Mesh(geometry,material);cup.rotation.x=Math.PI/2;cup.receiveShadow=true;group.add(cup)
  // A dark base provides depth even if the sun is directly above the pit.
  const baseGeometry=new THREE.CircleGeometry(.102,48),baseMaterial=new THREE.MeshBasicMaterial({color:'#110b22',side:THREE.DoubleSide})
  const base=new THREE.Mesh(baseGeometry,baseMaterial);base.position.z=-.255;group.add(base)
  const rimGeometry=new THREE.TorusGeometry(.211,.009,8,64),rimMaterial=new THREE.MeshStandardMaterial({color:'#d18b4b',roughness:.85})
  const rim=new THREE.Mesh(rimGeometry,rimMaterial);rim.position.z=.01;group.add(rim)
  let target=0,amount=0,closeAt=0
  const place=(point:THREE.Vector3)=>{
    normal.copy(point).normalize();group.position.copy(normal).multiplyScalar(radius+surface(normal).height+.008)
    group.quaternion.setFromUnitVectors(forward,normal)
  }
  return {
    normal,
    get visible(){return group.visible},
    get open(){return target===1},
    get amount(){return amount},
    get clearance(){return outerRadius/(radius+surface(normal).height)+.06},
    outerRadius,
    show:(point:THREE.Vector3)=>{place(point);target=1;closeAt=0;group.visible=true},
    close:(delay=0)=>{closeAt=performance.now()+delay;if(!delay)target=0},
    hide:()=>{target=0;amount=0;closeAt=0;group.visible=false;holeCos.value=2},
    contains:(point:THREE.Vector3)=>target===1&&amount>.65&&normal.angleTo(point)<.182*size*amount/(radius+surface(normal).height),
    hover:(value:boolean)=>{rimMaterial.color.set(value?'#ff7758':'#d18b4b');rimMaterial.emissive.set(value?'#6c1c08':'#000000')},
    update:(now:number,dt:number)=>{
      if(closeAt&&now>=closeAt){target=0;closeAt=0}
      amount=THREE.MathUtils.damp(amount,target,target?10:7,dt)
      if(target===0&&amount<.003){amount=0;group.visible=false}
      group.scale.setScalar(Math.max(.001,amount)*size)
      holeCos.value=amount>.002?Math.cos(openingRadius*amount/(radius+surface(normal).height)):2
    },
  }
}
