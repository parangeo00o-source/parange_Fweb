import * as THREE from 'three'

/** Cache only authored mesh-local transforms. Parent/joint world transforms,
 * shaders, materials and shadows remain live; animated meshes must opt out. */
export function cacheStaticMeshTransforms(root:THREE.Object3D,animated:ReadonlySet<THREE.Object3D>=new Set()) {
  root.traverse(node=>{
    if(!(node instanceof THREE.Mesh)||animated.has(node))return
    node.updateMatrix();node.matrixAutoUpdate=false
  })
}

/** Lossless indexing, not welding/simplification. Only bit-identical complete
 * vertices share storage; seams, normals, UVs, triangle order and -0 survive. */
export function indexExactGeometry(geometry:THREE.BufferGeometry) {
  if(geometry.index||Object.keys(geometry.morphAttributes).length)return
  const entries=Object.entries(geometry.attributes)
  if(!entries.length||entries.some(([,a])=>!(a instanceof THREE.BufferAttribute)||!(a.array instanceof Float32Array)))return
  const attributes=entries as Array<[string,THREE.BufferAttribute]>
  const count=geometry.attributes.position.count
  if(attributes.some(([,a])=>a.count!==count))return
  const bits=attributes.map(([,a])=>new Uint32Array(a.array.buffer,a.array.byteOffset,a.array.length))
  const unique:number[]=[],indices:number[]=[],lookup=new Map<string,number>()
  for(let vertex=0;vertex<count;vertex++){
    let key=''
    for(let a=0;a<attributes.length;a++){
      const size=attributes[a][1].itemSize
      for(let c=0;c<size;c++)key+=`${bits[a][vertex*size+c]},`
    }
    let index=lookup.get(key)
    if(index===undefined){index=unique.length;lookup.set(key,index);unique.push(vertex)}
    indices.push(index)
  }
  const stride=attributes.reduce((sum,[,a])=>sum+a.itemSize*4,0),indexBytes=unique.length>65535?4:2
  if(unique.length*stride+count*indexBytes>=count*stride)return
  for(const [name,attribute] of attributes){
    const values=new Float32Array(unique.length*attribute.itemSize),source=attribute.array as Float32Array
    for(let i=0;i<unique.length;i++)values.set(source.subarray(unique[i]*attribute.itemSize,(unique[i]+1)*attribute.itemSize),i*attribute.itemSize)
    const replacement=new THREE.Float32BufferAttribute(values,attribute.itemSize,attribute.normalized)
    replacement.name=attribute.name;replacement.setUsage(attribute.usage)
    geometry.setAttribute(name,replacement)
  }
  geometry.setIndex(indices)
}
