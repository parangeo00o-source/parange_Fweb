import * as THREE from 'three'

/** A round citrus toy car, with windows fitted to the actual curved body. */
export const createOrangeCar = (color: string, peel: THREE.Texture, number: number) => {
  const car = new THREE.Group()
  const paint = new THREE.MeshPhysicalMaterial({ color, map: peel, bumpMap: peel, bumpScale: .003, roughness: .30, clearcoat: .75, clearcoatRoughness: .2 })
  const black = new THREE.MeshStandardMaterial({ color: '#181d17', roughness: .68 })
  const rubber = new THREE.MeshStandardMaterial({ color: '#101511', roughness: .92 })
  const metal = new THREE.MeshStandardMaterial({ color: '#a78d45', roughness: .32, metalness: .65 })
  const glass = new THREE.MeshPhysicalMaterial({ color: '#278db6', roughness: .13, metalness: .20, clearcoat: 1 })
  const cream = new THREE.MeshStandardMaterial({ color: '#fff0b6', roughness: .22, metalness: .2 })
  const green = new THREE.MeshStandardMaterial({ color: '#4a9f32', roughness: .45, side: THREE.DoubleSide })
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, position: number[], scale = [1,1,1]) => {
    const item = new THREE.Mesh(geometry,material);item.position.set(position[0],position[1],position[2]);item.scale.set(scale[0],scale[1],scale[2]);item.castShadow=true;item.receiveShadow=true;car.add(item);return item
  }
  const ball = new THREE.SphereGeometry(1,40,28)
  mesh(ball,paint,[0,.55,0],[.50,.48,.51])
  mesh(ball,black,[0,.115,0],[.40,.035,.40])

  const point = (lon: number, lat: number, offset: number) => new THREE.Vector3((.50+offset)*Math.cos(lat)*Math.sin(lon),.55+(.48+offset)*Math.sin(lat),(.51+offset)*Math.cos(lat)*Math.cos(lon))
  const windowPatch = (center: number, halfWidth: number, bottom: number, top: number, offset: number, material: THREE.Material) => {
    const vertices:number[]=[],indices:number[]=[]
    const cols=32,rows=16
    for(let y=0;y<=rows;y++){
      const v=y/rows, edge=Math.max(0,Math.abs(v*2-1)-.8)
      const rounded=.8+Math.sqrt(Math.max(0,.04-edge*edge))
      for(let x=0;x<=cols;x++){const p=point(center+(x/cols*2-1)*halfWidth*rounded,bottom+v*(top-bottom),offset);vertices.push(p.x,p.y,p.z)}
    }
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const a=y*(cols+1)+x,b=a+1,c=a+cols+1,d=c+1;indices.push(a,b,c,b,d,c)}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();mesh(geometry,material,[0,0,0])
  }
  // A broad front windscreen and wraparound side panes, not circular portholes.
  for(const [center,width] of [[0,.76],[1.56,.62],[-1.56,.62],[Math.PI,.48]]){
    windowPatch(center,width,-.04,.60,.007,black)
    windowPatch(center,width-.045,.003,.552,.013,glass)
  }
  const line = (a: THREE.Vector3,b: THREE.Vector3,radius:number,material:THREE.Material) => {
    const delta=b.clone().sub(a),item=mesh(new THREE.CylinderGeometry(radius,radius,delta.length(),8),material,a.clone().add(b).multiplyScalar(.5).toArray())
    item.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return item
  }
  // Wipers, side door handles and a central radiator grille.
  line(point(-.43,.005,.024),point(-.04,.23,.024),.008,black)
  line(point(.38,.005,.024),point(.03,.08,.027),.006,black)
  for(const side of [-1,1]){
    line(point(side*1.42,-.13,.02),point(side*1.63,-.13,.02),.012,black)
    for(const z of [-.255,.255]){
      const tire=mesh(new THREE.CylinderGeometry(.155,.155,.115,28),rubber,[side*.444,.166,z]);tire.rotation.z=Math.PI/2
      const hub=mesh(new THREE.CylinderGeometry(.090,.090,.009,24),metal,[side*.506,.166,z]);hub.rotation.z=Math.PI/2
      const center=mesh(new THREE.CylinderGeometry(.036,.036,.013,16),black,[side*.514,.166,z]);center.rotation.z=Math.PI/2
      for(let bolt=0;bolt<5;bolt++){const angle=bolt/5*Math.PI*2;mesh(ball,cream,[side*.516,.166+Math.sin(angle)*.059,z+Math.cos(angle)*.059],[.006,.007,.007])}
    }
    mesh(ball,black,[side*.266,.32,.409],[.092,.066,.030])
    mesh(ball,cream,[side*.266,.324,.434],[.060,.044,.016])
    const bumper=mesh(new THREE.BoxGeometry(.17,.038,.045),black,[side*.261,.18,.355]);bumper.rotation.y=side*.30
  }
  for(let i=0;i<6;i++){
    const x=(i-2.5)*.035,z=Math.sqrt(1-x*x/.25)*.51
    mesh(ball,black,[x,.385,z-.012],[.008,.062,.008])
  }
  // A compact, curled calyx sits on the orange skin like the reference toy.
  const leafShape=new THREE.Shape();leafShape.moveTo(0,0);leafShape.bezierCurveTo(-.12,.03,-.10,.19,0,.25);leafShape.bezierCurveTo(.11,.17,.10,.03,0,0)
  const leafGeometry=new THREE.ShapeGeometry(leafShape,10)
  for(let i=0;i<5;i++){
    const leaf=mesh(leafGeometry,green,[Math.sin(i*1.257)*.025,1.026,Math.cos(i*1.257)*.025])
    leaf.rotation.set(-Math.PI/2+.22,i*1.257,.2,'YXZ');leaf.scale.setScalar(i%2?.65:.85)
  }
  line(new THREE.Vector3(0,1.015,0),new THREE.Vector3(.025,1.075,-.015),.019,green)
  const label=(text:string,width:number,height:number,y:number,z:number,background?:string)=>{
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;const ctx=canvas.getContext('2d')!
    if(background){ctx.fillStyle=background;ctx.fillRect(0,0,512,96)}
    ctx.fillStyle=background?'#18251b':'#244921';ctx.textAlign='center';ctx.font='900 70px Arial';ctx.fillText(text,256,74)
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace
    mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshStandardMaterial({map:texture,transparent:true,roughness:.7,depthWrite:false}),[0,y,z])
  }
  label('PARANGE',.27,.050,.269,.422)
  label('PRG '+String(number).padStart(3,'0'),.205,.045,.174,.357,'#fff1d2')
  return car
}
