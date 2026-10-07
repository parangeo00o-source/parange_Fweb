// Camera-free development review. Uses exactly the mesh factory used at move-in.
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { createResidentRig } from './resident-model'
import type { ResidentRig } from './resident-model'
import { residentDesigns } from './resident-designs'
import { residentPortrait } from './resident-portrait'
import roster01 from './assets/planet/turnarounds/roster-01.png'
import roster02 from './assets/planet/turnarounds/roster-02.png'
import roster03 from './assets/planet/turnarounds/roster-03.png'
import roster04 from './assets/planet/turnarounds/roster-04.png'

const sheets = [roster01,roster02,roster03,roster04]
document.head.insertAdjacentHTML('beforeend', `<style>
*{box-sizing:border-box}body{margin:0;background:#f0ede5;color:#292521;font:14px system-ui,sans-serif}button,select{font:inherit;cursor:pointer}button,select{background:#fffaf2;color:inherit;border:1px solid #c8beac;border-radius:9px;padding:9px 13px}button[aria-pressed=true]{background:#292521;color:white}header{padding:20px 28px;display:flex;align-items:center;gap:16px;flex-wrap:wrap}h1{font-size:17px;letter-spacing:.05em;margin:0 auto 0 0}main{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:16px;padding:0 24px}.viewport{height:calc(100vh - 174px);min-height:430px;position:relative;background:#e8e2d6;border-radius:16px;overflow:hidden}canvas{display:block;width:100%;height:100%;touch-action:none}.caption{position:absolute;left:22px;bottom:18px;pointer-events:none}aside{padding:16px;background:#fffaf3;border-radius:16px}aside h2{font-size:13px}.reference{height:260px;background-repeat:no-repeat;background-size:400% 400%;background-color:#e9e3d8;border-radius:12px}.turnaround{width:100%;aspect-ratio:4;background-repeat:no-repeat;background-size:100% 400%;background-color:#e9e3d8}.roster{display:flex;gap:6px;flex-wrap:wrap;padding:16px 24px}.roster button{font-size:12px;padding:6px 11px}.gallery main{grid-template-columns:1fr}.gallery aside{display:none}.gallery .viewport{height:calc(100vh - 174px)}@media(max-width:760px){main{grid-template-columns:1fr;padding:0 12px}aside{display:none}header{padding:12px}.viewport{height:66vh}.roster{padding:12px}.roster button{padding:6px}.caption{font-size:12px}}
</style>`)
document.body.innerHTML = `<header><h1>PARANGE / CHARACTER LAB</h1><button data-view="0">정면</button><button data-view="1.5707963267948966">측면</button><button data-view="3.141592653589793">후면</button><button id="rotate" aria-pressed="false">자동 회전</button><button id="walk" aria-pressed="false">걷기</button><button id="gallery" aria-pressed="false">16종 보기</button></header><main><div class="viewport"><canvas aria-label="마우스로 회전할 수 있는 3D 캐릭터"></canvas><div class="caption"><strong id="name"></strong><br>드래그: 360° 회전 · 휠: 확대</div></div><aside><h2>원본 디자인</h2><div class="reference"></div><h2>정면 · 측면 · 후면 · 측면</h2><div class="turnaround"></div><p>입주할 때 사용하는 실제 3D 모델입니다. 방향 버튼과 드래그로 실루엣, 의상 뒷면, 관절을 확인하세요.</p></aside></main><nav class="roster" aria-label="캐릭터 선택">${residentDesigns.map((d,i)=>`<button data-index="${i}">${String(i+1).padStart(2,'0')} ${d.name}</button>`).join('')}</nav>`
const canvas = document.querySelector('canvas')!, viewport = document.querySelector<HTMLElement>('.viewport')!
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .86
renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap
const scene=new THREE.Scene(); scene.background=new THREE.Color('#e8e2d6')
const camera=new THREE.PerspectiveCamera(32,1,.01,100)
const controls=new OrbitControls(camera,canvas); controls.target.set(0,.8,0); controls.enableDamping=true; controls.minDistance=1.7; controls.maxDistance=16
const room=new RoomEnvironment(), pmrem=new THREE.PMREMGenerator(renderer)
const environment=pmrem.fromScene(room,.06); scene.environment=environment.texture; scene.environmentIntensity=.65
room.dispose(); pmrem.dispose()
scene.add(new THREE.HemisphereLight('#edf5ff','#ad9069',.85))
const key=new THREE.DirectionalLight('#fff2dc',2); key.position.set(-3,5,4); key.castShadow=true
key.shadow.mapSize.set(2048,2048); key.shadow.camera.left=-5; key.shadow.camera.right=5; key.shadow.camera.top=5; key.shadow.camera.bottom=-5; key.shadow.normalBias=.01; scene.add(key)
const fill=new THREE.DirectionalLight('#ddeeff',.9); fill.position.set(4,3,-4); scene.add(fill)
const floor=new THREE.Mesh(new THREE.PlaneGeometry(60,60),new THREE.ShadowMaterial({opacity:.13})); floor.rotation.x=-Math.PI/2; floor.position.y=-.008; floor.receiveShadow=true; scene.add(floor)
let rigs:ResidentRig[]=[], index=0, gallery=false, walking=false, rotating=false, angle=.25, running=true
const resize=()=>{const {width,height}=viewport.getBoundingClientRect(); renderer.setSize(width,height,false); camera.aspect=width/height; camera.updateProjectionMatrix()}
new ResizeObserver(resize).observe(viewport)
const select=(next:number)=>{index=next;mount()}
const mount=()=>{
  rigs.forEach(rig=>rig.dispose()); rigs=[]
  const indices=gallery?residentDesigns.map((_,i)=>i):[index]
  indices.forEach(i=>{
    const rig=createResidentRig(i); rigs.push(rig); scene.add(rig.group)
    if(gallery) rig.group.position.set(((i%4)-1.5)*1.9,(3-Math.floor(i/4))*2.05,0)
    rig.group.rotation.y=angle
  })
  floor.visible=!gallery; document.body.classList.toggle('gallery',gallery)
  controls.target.set(0,gallery?3.8:.8,0); camera.position.set(0,gallery?4.1:1.55,gallery?15:3.9); controls.update()
  document.querySelector('#name')!.textContent=gallery?'16종 · 동일 조명 / 동일 시점':residentDesigns[index].name
  const ref=document.querySelector<HTMLElement>('.reference')!, selected=index
  void residentPortrait(index).then(url=>{if(index===selected){ref.style.backgroundImage=`url(${url})`;ref.style.backgroundPosition='center';ref.style.backgroundSize='contain'}})
  const turn=document.querySelector<HTMLElement>('.turnaround')!; turn.style.backgroundImage=`url(${sheets[Math.floor(index/4)]})`;turn.style.backgroundPosition=`0 ${(index%4)/3*100}%`
  document.querySelectorAll<HTMLButtonElement>('[data-index]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.index)===index&&!gallery)))
  resize()
}
const setAngle=(radians:number)=>{angle=radians; rigs.forEach(rig=>rig.group.rotation.y=angle);controls.target.set(0,gallery?3.8:.8,0);camera.position.set(0,gallery?4.1:1.55,gallery?15:3.9);controls.update()}
document.querySelectorAll<HTMLButtonElement>('[data-index]').forEach(button=>button.onclick=()=>{gallery=false;document.querySelector('#gallery')!.setAttribute('aria-pressed','false');select(Number(button.dataset.index))})
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button=>button.onclick=()=>setAngle(Number(button.dataset.view)))
document.querySelector<HTMLButtonElement>('#rotate')!.onclick=()=>{rotating=!rotating;document.querySelector('#rotate')!.setAttribute('aria-pressed',String(rotating))}
document.querySelector<HTMLButtonElement>('#walk')!.onclick=()=>{walking=!walking;document.querySelector('#walk')!.setAttribute('aria-pressed',String(walking))}
document.querySelector<HTMLButtonElement>('#gallery')!.onclick=()=>{gallery=!gallery;document.querySelector('#gallery')!.setAttribute('aria-pressed',String(gallery));mount()}
mount()
function render(time:number){if(!running)return; if(rotating){angle+=.006;rigs.forEach(rig=>rig.group.rotation.y=angle)}rigs.forEach(rig=>rig.animate(time,walking));controls.update();renderer.render(scene,camera);requestAnimationFrame(render)}
requestAnimationFrame(render)
// Review automation uses this same rendering path; it never mocks the meshes.
export const preview={select,setAngle,get rigs(){return rigs},get renderer(){return renderer},setGallery(value:boolean){gallery=value;mount()},
  pose(time:number,walk:boolean){rigs.forEach(rig=>rig.animate(time,walk));renderer.render(scene,camera)},
  pause(){running=false},render(){renderer.render(scene,camera)}}
