// Deterministic native-render export, not AI re-authoring of character designs.
import {writeFile,mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
const output=resolve('src/assets/planet/neon-original-rigs')
await mkdir(output,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
  const page=await browser.newPage({ignoreHTTPSErrors:true}),errors=[]
  page.on('pageerror',e=>errors.push(String(e)))
  await page.goto('https://localhost:5173');await page.waitForLoadState('networkidle')
  await page.evaluate(async()=>{
    const T=await import('/node_modules/.vite/deps/three.js')
    const {createResidentRig}=await import('/src/resident-model.ts')
    const {applyNeonFinish}=await import('/src/resident-neon-finish.ts')
    const {residentDesigns}=await import('/src/resident-designs.ts')
    const renderer=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true})
    renderer.setSize(480,480);renderer.setClearColor(0,0)
    renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.06
    const scene=new T.Scene(),camera=new T.OrthographicCamera(-.95,.95,1.8,-.1,.01,20)
    camera.position.set(0,0,6);camera.lookAt(0,0,0)
    scene.add(new T.HemisphereLight('#fffdf4','#e2dced',2.1))
    const key=new T.DirectionalLight('#fff9ee',1.9);key.position.set(-3,5,5);scene.add(key)
    const fill=new T.DirectionalLight('#e6faf5',.9);fill.position.set(4,1,2);scene.add(fill)
    window.bake=async index=>{
      const rig=createResidentRig(index);rig.animate(0,false);scene.add(rig.group)
      const atlas=document.createElement('canvas');atlas.width=480*8;atlas.height=480
      const c=atlas.getContext('2d'),baseline=document.createElement('canvas');baseline.width=480;baseline.height=480
      const bc=baseline.getContext('2d',{willReadFrequently:true})
      renderer.render(scene,camera);bc.drawImage(renderer.domElement,0,0)
      const before=bc.getImageData(0,0,480,480).data
      applyNeonFinish(rig.group)
      let changedAlpha=0
      for(let view=0;view<8;view++){
        rig.group.rotation.y=-view*Math.PI/4;renderer.render(scene,camera)
        c.drawImage(renderer.domElement,view*480,0)
        bc.clearRect(0,0,480,480);bc.drawImage(renderer.domElement,0,0)
        const after=bc.getImageData(0,0,480,480).data
        if(view===0)for(let p=3;p<before.length;p+=4)if(before[p]!==after[p])changedAlpha++
        for(let i=0;i<480;i++)for(const at of [i,i*480,i*480+479,479*480+i])if(after[at*4+3])throw Error('Clipped character '+index+' view '+view)
      }
      if(changedAlpha)throw Error('Material changed original rig silhouette: '+index)
      const bounds=new T.Box3().setFromObject(rig.group)
      scene.remove(rig.group);rig.dispose()
      return {kind:residentDesigns[index].kind,data:atlas.toDataURL('image/webp',.96),changedAlpha,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()}}
    }
  })
  const records=[]
  for(let index=0;index<16;index++){
    const result=await page.evaluate(index=>window.bake(index),index)
    const bytes=Buffer.from(result.data.split(',')[1],'base64')
    await writeFile(resolve(output,`${result.kind}-v1.webp`),bytes)
    records.push({index,kind:result.kind,bytes:bytes.length,changedAlpha:result.changedAlpha,bounds:result.bounds})
    console.log(result.kind,bytes.length,'bytes; original silhouette unchanged')
  }
  if(errors.length)throw Error(errors.join('\n'))
  await writeFile(resolve(output,'manifest.json'),JSON.stringify({source:'createResidentRig / residents-16.png',finish:'resident-neon-finish.ts',cell:[480,480],views:8,camera:{left:-.95,right:.95,top:1.8,bottom:-.1},records},null,2)+'\n')
}finally{await browser.close()}
