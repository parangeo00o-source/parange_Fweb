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
      const {residentDesigns}=await import('/src/resident-designs.ts'),kind=residentDesigns[index].kind
      const {headPoint,residentSculpts}=await import('/src/resident-sculpt.ts')
      // Rear skull must remain rounded rather than inheriting front cheek
      // cross-section overshoot. Check the whole vertical rear meridian.
      for(let step=1;step<40;step++){
        const y=-1+step/20,r=Math.sqrt(1-y*y)
        const rear=headPoint(residentSculpts[kind],residentDesigns[index].head,0,y,-r)
        assert(Math.abs(rear.z+r*residentDesigns[index].head[2])<1e-7,`${kind}: dented rear skull`)
      }
      const speciesParts={fox:['fox-brush','pointed-ear-shell'],bear:['folded-hood','chest-badge'],rabbit:['long-ear','wrap-dress-lapel'],cat:['curled-cat-tail','cat-whisker-mark'],penguin:['penguin-round-belly','scarf-wrap'],koala:['ear-shell','muzzle-volume'],frog:['eye-turret','frog-throat'],elephant:['curled-trunk','ear-shell'],raccoon:['striped-raccoon-tail'],deer:['antler-inner-tine','deer-tail'],dog:['floppy-ear','dog-chest-frame'],duck:['upper-bill','left-wing-feather'],sheep:['forehead-wool-curl','sheep-drooping-ear'],mouse:['mouse-tail','whisker'],otter:['otter-cheeks','otter-tail'],capybara:['capybara-round-belly','nostril']}
      for(const part of speciesParts[kind])assert(rig.group.getObjectByName(part),`${kind}: missing original-design detail ${part}`)
      for(const side of ['left','right']){
        assert(!rig.group.getObjectByName(`${side}-boot-cuff`),`${kind}: stacked ankle rings returned`)
        assert(!rig.group.getObjectByName(`${side}-sole`),`${kind}: detached sole disc returned`)
        assert(!rig.group.getObjectByName(`${side}-boot-shaft`),`${kind}: intersecting boot shaft returned`)
        if(kind==='penguin')assert(rig.group.getObjectByName(`${side}-flipper`)&&!rig.group.getObjectByName(`${side}-forearm`), 'Penguin needs continuous paddle wings')
      }
      // The FIRST posed roster is authoritative, not the alternate uniform
      // costumes/colours in the later turnaround sheets.
      if(kind==='duck')assert(residentDesigns[index].fur==='#fff1ad'&&rig.group.getObjectByName('left-wing-feather'), 'Duck lost cream feathers')
      if(kind==='penguin')assert(rig.group.getObjectByName('penguin-round-belly')&&!rig.group.getObjectByName('garment-shell'),'Penguin was put in the turnaround uniform')
      if(kind==='frog')assert(rig.group.getObjectByName('right-glove').material.color.getHexString()==='65c519'&&rig.group.getObjectByName('left-boot').material.color.getHexString()==='65c519','Frog original asymmetric colours missing')
      if(kind==='dog')assert(residentDesigns[index].boots==='#e9a02a','Dog original amber footwear lost')
      if(kind==='capybara')assert(rig.group.getObjectByName('capybara-backpack'),'Capybara rear outfit detail missing')
      if(kind==='deer')assert(rig.group.getObjectByName('antler-rounded-tip'),'Deer antler tips missing')
      rig.group.traverse(node=>{
        if(node.name==='eye-gloss')assert(node.scale.z<=.016,`${kind}: protruding eyes`)
        if(node.name==='ear-shell'){
          node.geometry.computeBoundingBox()
          assert(node.geometry.boundingBox.getSize(new THREE.Vector3()).z>.18,`${kind}: flat ear card`)
        }
      })
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
        rig.group.rotation.y=frame/120*Math.PI*2
        rig.animate(1000+(['normal','held','meeting'].indexOf(mood)*120+frame)*16.67,true,mood)
        rig.group.updateMatrixWorld(true)
        rig.group.traverse(node=>assert(node.matrixWorld.elements.every(Number.isFinite),`${index}: invalid ${mood} transform`))
        const headScale=rig.group.getObjectByName('neck-head').getWorldScale(new THREE.Vector3())
        assert(Math.max(headScale.x,headScale.y,headScale.z)-Math.min(headScale.x,headScale.y,headScale.z)<.0001,`${index}: head squashes while turning`)
        // Rotation must not inherit a non-uniform scale/shear from hips or
        // shoulders. This catches flattening during walking and held motion.
        for(const side of ['left','right'])for(const joint of ['shoulder','elbow','wrist','hip','knee','ankle']){
          const matrix=rig.group.getObjectByName(`${side}-${joint}`).matrixWorld
          const basis=[0,1,2].map(axis=>new THREE.Vector3().setFromMatrixColumn(matrix,axis))
          assert(basis.every(v=>Math.abs(v.length()-1)<1e-6)&&Math.abs(basis[0].dot(basis[1]))<1e-6&&Math.abs(basis[1].dot(basis[2]))<1e-6,`${kind}: ${joint} shears while ${mood}`)
        }
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
