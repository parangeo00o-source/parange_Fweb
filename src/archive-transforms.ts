import * as THREE from 'three'

/** Keep authored matrices bit-identical, but compose only when a transform changes.
 * This is local to the archive scene; animated joints still update normally. */
export function cacheArchiveTransforms(root: THREE.Object3D) {
  root.traverse(object => {
    if (cached.has(object)) return
    cached.add(object)
    const update = object.updateMatrix
    const position = new THREE.Vector3(NaN, NaN, NaN)
    const rotation = new THREE.Quaternion(NaN, NaN, NaN, NaN)
    const scale = new THREE.Vector3(NaN, NaN, NaN)
    const pivot = new THREE.Vector3(NaN, NaN, NaN)
    let hadPivot = false
    object.updateMatrix = function () {
      if (position.equals(this.position) && rotation.equals(this.quaternion) && scale.equals(this.scale)
        && hadPivot === (this.pivot !== null) && (!this.pivot || pivot.equals(this.pivot))) return
      update.call(this)
      // A localToWorld/getWorldPosition call may update only an ancestor.
      // Preserve its invalidation until each descendant has consumed it.
      for (const child of this.children) child.traverse(descendant => { descendant.matrixWorldNeedsUpdate = true })
      position.copy(this.position); rotation.copy(this.quaternion); scale.copy(this.scale)
      hadPivot = this.pivot !== null
      if (this.pivot) pivot.copy(this.pivot)
    }
  })
}

const cached = new WeakSet<THREE.Object3D>()
