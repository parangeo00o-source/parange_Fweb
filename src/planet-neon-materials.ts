import * as THREE from 'three'

/** A reversible pigment layer on the original scene materials. No replacement
 * meshes, billboard silhouettes or extra outline draw calls. Existing wind,
 * water, vertex colours and sinkhole clipping shaders are composed unchanged. */
export function createNeonMaterialStyle(){
  const strength={value:0},seen=new WeakSet<THREE.Material>()
  function include(root:THREE.Object3D){
    root.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return
      let resident=false
      for(let p:THREE.Object3D|null=object;p;p=p.parent)if(p.name.startsWith('resident-')&&p.name!=='resident-sinkhole')resident=true
      for(const material of Array.isArray(object.material)?object.material:[object.material]){
        if(seen.has(material)||!(material instanceof THREE.MeshStandardMaterial||material instanceof THREE.MeshPhongMaterial||material instanceof THREE.MeshBasicMaterial))continue
        seen.add(material)
        // Keep eyes, noses and facial marks crisp, not washed-out pastel grey.
        if(resident&&material instanceof THREE.MeshPhysicalMaterial&&material.roughness<.2)continue
        const previous=material.onBeforeCompile,key=material.customProgramCacheKey()
        const shaded=!(material instanceof THREE.MeshBasicMaterial)
        material.onBeforeCompile=(shader,renderer)=>{
          previous.call(material,shader,renderer)
          shader.uniforms.uNeonIllustration=strength
          shader.vertexShader='varying vec3 vNeonPrintPosition;\n'+shader.vertexShader
          shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvNeonPrintPosition=position;')
          shader.fragmentShader=`uniform float uNeonIllustration;varying vec3 vNeonPrintPosition;
            vec3 neonPaperPigment(vec3 pigment){
              float hi=max(pigment.r,max(pigment.g,pigment.b));
              float lo=min(pigment.r,min(pigment.g,pigment.b));
              float chroma=hi-lo;
              float luminance=dot(pigment,vec3(.2126,.7152,.0722));
              vec3 paper=vec3(.96,.94,.84);
              vec3 tint=paper;
              if(chroma>.035){
                if(pigment.g>=hi) tint=mix(vec3(.50,.72,.35),vec3(.35,.70,.56),smoothstep(.2,.9,pigment.b/max(pigment.g,.001)));
                else if(pigment.b>=hi) tint=mix(vec3(.48,.34,.65),vec3(.33,.66,.72),smoothstep(.55,1.1,pigment.g/max(pigment.b,.001)));
                else tint=mix(vec3(.79,.30,.53),vec3(.87,.74,.39),smoothstep(.15,.8,pigment.g/max(pigment.r,.001)));
              }
              tint=mix(tint,paper,smoothstep(.48,.95,luminance)*.68);
              return tint*mix(.72,1.04,smoothstep(.015,.7,luminance));
            }\n`+shader.fragmentShader
          shader.fragmentShader=shader.fragmentShader.replace('#include <alphamap_fragment>',`
            if(uNeonIllustration>0.0){
              vec3 pigment=${resident?'mix(diffuseColor.rgb,vec3(1.0,.985,.965),.12)':'neonPaperPigment(diffuseColor.rgb)'};
              float grain=fract(sin(dot(floor(vNeonPrintPosition*480.0),vec3(127.1,311.7,74.7)))*43758.5453);
              float detail=1.0-smoothstep(.004,.024,length(fwidth(vNeonPrintPosition)));
              float fiber=pow(.5+.5*sin(vNeonPrintPosition.x*500.0+sin(vNeonPrintPosition.y*55.0+vNeonPrintPosition.z*28.0)*2.2),10.0);
              pigment*=1.0+((grain-.5)*.055+(fiber-.18)*${resident?'.12':'.04'})*detail;
              diffuseColor.rgb=mix(diffuseColor.rgb,pigment,uNeonIllustration);
            }
            #include <alphamap_fragment>`)
          shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
            roughnessFactor=mix(roughnessFactor,.92,uNeonIllustration);`)
          shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>',`#include <metalnessmap_fragment>
            metalnessFactor*=1.0-uNeonIllustration;`)
          if(shaded)shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
            if(uNeonIllustration>0.0){
              // Retain physical shading/contact shadows, with a soft paper fill
              // and restrained ink at grazing angles to describe real volume.
              vec3 printed=mix(outgoingLight,diffuseColor.rgb*.88+outgoingLight*.22,.48);
              float edge=pow(1.0-abs(dot(normal,normalize(vViewPosition))),3.0);
              printed=mix(printed,printed*vec3(.72,.65,.83),edge*.24);
              outgoingLight=mix(outgoingLight,printed,uNeonIllustration);
            }
            #include <opaque_fragment>`)
        }
        material.customProgramCacheKey=()=>key+`-neon-3d-print-v1-${resident}-${shaded}`
        material.needsUpdate=true
      }
    })
  }
  return {include,setEnabled:(enabled:boolean)=>{strength.value=enabled?1:0}}
}
