// Run against the local Vite server. Playwright is a review-only dependency;
// PLAYWRIGHT_MODULE may point to an existing installation outside this project.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser=await chromium.launch({channel:process.env.CHROME_CHANNEL || 'chrome',headless:true})
try {
  const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1440,height:1080}})
  const errors=[]
  page.on('pageerror',error=>errors.push(String(error)))
  await page.goto(`${process.env.REVIEW_URL || 'https://localhost:5173'}/tools/resident-preview.html`)
  const results=await page.evaluate(async()=>{
    const {preview}=await import('/src/resident-preview.ts')
    const THREE=await import('/node_modules/.vite/deps/three.js')
    preview.pause();preview.setGallery(false)
    const assert=(test,message)=>{if(!test)throw Error(message)}
    const results=[]
    for(let index=0;index<16;index++){
      const start=performance.now();preview.select(index);preview.setAngle(0)
      const buildMs=performance.now()-start,rig=preview.rigs[0]
      const geometries=new Set(),materials=new Set(),textures=new Set()
      let meshes=0,triangles=0
      rig.group.traverse(node=>{
        if(!node.isMesh)return
        meshes++;geometries.add(node.geometry)
        assert(node.geometry.type!=='PlaneGeometry',`${index}: image card`)
        for(const key of ['position','normal','uv']){
          const attribute=node.geometry.getAttribute(key)
          if(attribute)for(const n of attribute.array)assert(Number.isFinite(n),`${index}: non-finite ${key}`)
        }
        triangles+=(node.geometry.index?.count||node.geometry.getAttribute('position').count)/3
        const meshMaterials=Array.isArray(node.material)?node.material:[node.material]
        for(const material of meshMaterials){
          materials.add(material)
          assert(!material.transparent,`${index}: transparent image shell`)
          if(material.map){
            textures.add(material.map)
            assert(material.map.isDataTexture&&material.map.name.startsWith('authored-mask-'),`${index}: projected reference image`)
            const pixels=material.map.image.data
            for(let i=3;i<pixels.length;i+=4)assert(pixels[i]===255,`${index}: transparent texture`)
          }
        }
      })
      const bounds=new THREE.Box3().setFromObject(rig.group)
      assert(Math.abs(bounds.min.y)<.0001,`${index}: neutral feet do not touch ground`)
      const head=rig.group.getObjectByName('sculpted-head')
      head.geometry.computeBoundingBox()
      const size=head.geometry.boundingBox.getSize(new THREE.Vector3())
      assert(size.z>.4&&size.x>.5,`${index}: head has no full volume`)
      for(const side of ['left','right']){
        const boot=rig.group.getObjectByName(`${side}-boot`)
        assert(boot.parent.name===`${side}-ankle`&&boot.parent.parent.name===`${side}-knee`,`${index}: detached footwear`)
      }
      const left=new THREE.Box3().setFromObject(rig.group.getObjectByName('left-boot'))
      const right=new THREE.Box3().setFromObject(rig.group.getObjectByName('right-boot'))
      assert(left.max.x<right.min.x,`${index}: boots intersect in rest pose`)
      rig.group.position.set(2,3,4)
      for(const mood of ['normal','held','meeting'])for(let frame=0;frame<120;frame++){
        rig.animate(1000+(['normal','held','meeting'].indexOf(mood)*120+frame)*16.67,true,mood)
        rig.group.updateMatrixWorld(true)
        rig.group.traverse(node=>assert(node.matrixWorld.elements.every(Number.isFinite),`${index}: invalid ${mood} transform`))
        const headScale=rig.group.getObjectByName('neck-head').getWorldScale(new THREE.Vector3())
        assert(Math.max(headScale.x,headScale.y,headScale.z)-Math.min(headScale.x,headScale.y,headScale.z)<.0001,`${index}: head squashes while turning`)
      }
      assert(rig.group.position.toArray().join()==='2,3,4',`${index}: animation overwrites village placement`)
      rig.group.position.set(0,0,0)
      preview.render()
      const disposed=new Map()
      for(const resource of [...geometries,...materials,...textures]){
        disposed.set(resource,0);resource.addEventListener('dispose',()=>disposed.set(resource,disposed.get(resource)+1))
      }
      rig.dispose();rig.dispose()
      assert([...disposed.values()].every(n=>n===1),`${index}: resource leak or double disposal`)
      results.push({index,name:rig.group.name,meshes,triangles,textures:textures.size,buildMs:Math.round(buildMs)})
    }
    return results
  })
  if(errors.length)throw Error(errors.join('\n'))
  console.log(JSON.stringify({passed:results.length,results,errors},null,2))
} finally {await browser.close()}
