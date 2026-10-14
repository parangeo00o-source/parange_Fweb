import * as THREE from 'three'

const worldCached=new WeakSet<THREE.Object3D>()
const renderCached=new WeakSet<THREE.Object3D>()
const groupCached=new WeakSet<THREE.Object3D>()

/** The shadow and colour passes use different cameras but repeat the same
 * products for stationary scenery. Cache each camera separately, retaining the
 * exact Matrix4 output; never bake/round vertices or change draw ordering. */
function cacheRenderMatrices(node:THREE.Mesh){
  if(renderCached.has(node))return
  renderCached.add(node)
  const products=new WeakMap<THREE.Matrix4,{left:THREE.Matrix4;right:THREE.Matrix4;result:THREE.Matrix4}>()
  const multiply=node.modelViewMatrix.multiplyMatrices
  node.modelViewMatrix.multiplyMatrices=function(a,b){
    if(this===a||this===b)return multiply.call(this,a,b)
    let entry=products.get(a)
    if(entry&&entry.left.equals(a)&&entry.right.equals(b))return this.copy(entry.result)
    multiply.call(this,a,b)
    if(!entry){entry={left:a.clone(),right:b.clone(),result:this.clone()};products.set(a,entry)}
    else{entry.left.copy(a);entry.right.copy(b);entry.result.copy(this)}
    return this
  }
  const normal=node.normalMatrix.getNormalMatrix,source=new THREE.Matrix4(),result=new THREE.Matrix3()
  let ready=false
  node.normalMatrix.getNormalMatrix=function(matrix){
    if(ready&&source.equals(matrix))return this.copy(result)
    normal.call(this,matrix);source.copy(matrix);result.copy(this);ready=true
    return this
  }
}

/** Keep live joint animation and manual updateMatrix() semantics, but avoid
 * composing identical Group TRS values on every renderer/raycast traversal. */
export function cacheUnchangedGroupTransforms(root:THREE.Object3D){
  root.traverse(node=>{
    if(!(node instanceof THREE.Group)||groupCached.has(node))return
    groupCached.add(node)
    const update=node.updateMatrix,position=new THREE.Vector3(),quaternion=new THREE.Quaternion(),scale=new THREE.Vector3(),matrix=new THREE.Matrix4()
    let ready=false
    node.updateMatrix=function(){
      if(ready&&position.equals(this.position)&&quaternion.equals(this.quaternion)&&scale.equals(this.scale)&&matrix.equals(this.matrix))return
      update.call(this);position.copy(this.position);quaternion.copy(this.quaternion);scale.copy(this.scale);matrix.copy(this.matrix);ready=true
    }
  })
}

/** A static leaf needs a new world matrix only when its parent actually moves.
 * Three's scene-wide forced update otherwise multiplies every fixed rock,
 * building and leaf again on every frame. Animated parents still invalidate
 * this cache immediately; raycasting/updateWorldMatrix remain untouched. */
function cacheStaticLeafWorldMatrix(node:THREE.Object3D){
  if(node.children.length||worldCached.has(node))return
  worldCached.add(node)
  const update=node.updateMatrixWorld,parentMatrix=new THREE.Matrix4()
  let parent:THREE.Object3D|null=null,ready=false
  node.updateMatrixWorld=function(force?:boolean){
    if(this.matrixAutoUpdate||this.children.length||!this.matrixWorldAutoUpdate){
      ready=false;update.call(this,force);return
    }
    const sameParent=ready&&parent===this.parent&&(!parent||parentMatrix.equals(parent.matrixWorld))
    if(sameParent&&!this.matrixWorldNeedsUpdate)return
    update.call(this,force||!sameParent)
    parent=this.parent;if(parent)parentMatrix.copy(parent.matrixWorld)
    ready=true
  }
}

/** Cache only authored mesh-local transforms. Parent/joint world transforms,
 * shaders, materials and shadows remain live; animated meshes must opt out. */
export function cacheStaticMeshTransforms(root:THREE.Object3D,animated:ReadonlySet<THREE.Object3D>=new Set(),cacheWorld=false) {
  cacheUnchangedGroupTransforms(root)
  root.traverse(node=>{
    if(!(node instanceof THREE.Mesh))return
    // Moving residents change most matrices every frame; caching their render
    // products costs more than it saves. Reserve this for fixed scenery.
    if(cacheWorld)cacheRenderMatrices(node)
    if(animated.has(node))return
    node.updateMatrix();node.matrixAutoUpdate=false
    // Continuously animated resident joints do not benefit from parent-matrix
    // comparisons; reserve world caching for predominantly static scenery.
    if(cacheWorld)cacheStaticLeafWorldMatrix(node)
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
  // Numeric buckets avoid building a long decimal string per vertex during
  // planet startup. Resolve hash collisions with exact attribute-bit checks.
  const unique:number[]=[],indices:number[]=[],lookup=new Map<number,number>()
  const links=new Uint32Array(count)
  for(let vertex=0;vertex<count;vertex++){
    let hash=2166136261
    for(let a=0;a<attributes.length;a++){
      const size=attributes[a][1].itemSize
      for(let c=0;c<size;c++)hash=Math.imul(hash^bits[a][vertex*size+c],16777619)>>>0
    }
    const head=lookup.get(hash)??0
    let link=head,index=-1
    while(link){
      const candidate=link-1,original=unique[candidate]
      let equal=true
      for(let a=0;a<attributes.length&&equal;a++){
        const size=attributes[a][1].itemSize
        for(let c=0;c<size;c++)if(bits[a][vertex*size+c]!==bits[a][original*size+c]){equal=false;break}
      }
      if(equal){index=candidate;break}
      link=links[candidate]
    }
    if(index<0){index=unique.length;unique.push(vertex);links[index]=head;lookup.set(hash,index+1)}
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
