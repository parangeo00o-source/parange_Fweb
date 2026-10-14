import * as THREE from 'three'

/** Material-only treatment of the SAME rig used by Sunlight/Moonlight Walk.
 * Never moves a vertex, changes a mask, substitutes an eye or adds clothing.
 * Used by the offline sprite baker, not a second in-game renderer. */
export function applyNeonFinish(root:THREE.Object3D){
  const visited=new Set<THREE.MeshPhysicalMaterial>()
  root.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return
    for(const material of Array.isArray(object.material)?object.material:[object.material]){
      if(!(material instanceof THREE.MeshPhysicalMaterial)||visited.has(material))continue
      visited.add(material)
      const eye=material.roughness<.2,fur=material.roughness>.4
      if(eye)continue
      material.roughness=fur?.92:.82;material.clearcoat=0;material.envMapIntensity=.12
      material.onBeforeCompile=shader=>{
        shader.vertexShader='varying vec3 vNeonPigment;\n'+shader.vertexShader
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvNeonPigment=position;')
        shader.fragmentShader='varying vec3 vNeonPigment;\n'+shader.fragmentShader
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
          vec3 p=vNeonPigment;
          float grain=fract(sin(dot(floor(p*640.0),vec3(127.1,311.7,74.7)))*43758.5453);
          float fiber=pow(.5+.5*sin(p.x*500.0+sin(p.y*55.0+p.z*28.0)*2.2),10.0)*(.5+.5*sin(p.y*90.0+p.z*180.0));
          float detail=1.0-smoothstep(.004,.022,length(fwidth(p)));
          // A pearl-paper tint lifts pigment to the scenery's pastel range.
          // Eyes and glossy nose details keep their original dark definition.
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(1.0,.985,.965),${fur?'.14':'.10'});
          diffuseColor.rgb*=1.0+detail*((grain-.5)*.10+(fiber-.08)*${fur?'.22':'.06'});
        `)
      }
      material.customProgramCacheKey=()=>`resident-neon-pigment-v2-${fur}`
      material.needsUpdate=true
    }
  })
}
