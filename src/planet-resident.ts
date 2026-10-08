import type * as THREE from 'three'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { residentDesigns, residentEnglish } from './resident-designs'
import { createResidentRig } from './resident-model'
import { residentPortrait } from './resident-portrait'
import { normalizeResidentName } from './resident-store'
import { selectResidentDesign } from './resident-selection'

export type ResidentModel = { group: THREE.Group; animate: (time: number, walking: boolean, mood?: 'normal' | 'held' | 'meeting') => void; dispose: () => void; portrait: string; mapped: boolean; name: string; trait: string; id?:string; designIndex?:number; customName?:boolean }

let faceModel: Promise<FaceLandmarker> | null = null
export const prepareResidentModels = () => {
  faceModel ??= (async () => {
    const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm')
    return FaceLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task' }, runningMode: 'IMAGE', numFaces: 1 })
  })().catch(error => { faceModel = null; throw error })
  return faceModel
}

const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
const faceTemperament = (points: Array<{ x: number; y: number }>) => {
  const left = points[33], right = points[263], upper = points[13], lower = points[14], nose = points[1]
  if (!left || !right || !upper || !lower || !nose) return 0
  return Math.floor((Math.hypot(right.x - left.x, right.y - left.y) * 991 + Math.hypot(upper.x - lower.x, upper.y - lower.y) * 577 + Math.abs(nose.x - (left.x + right.x) / 2) * 313) * 10_000)
}
export const buildResident = async (photo: HTMLCanvasElement, report: (message: string) => void, signal: AbortSignal, requestedName='', existingDesigns:readonly (number|undefined)[]=[]): Promise<ResidentModel> => {
  const check = () => signal.throwIfAborted()
  check(); report('Looking for your smile…')
  const model = await prepareResidentModels(); check(); await nextFrame(); check()
  const face = model.detect(photo).faceLandmarks[0]
  if (!face) throw new Error('We could not see your face. Look at the camera and take another snapshot.')
  report('Finding your little neighbor…'); await nextFrame(); check()
  const index = selectResidentDesign(existingDesigns,faceTemperament(face))
  const design = residentDesigns[index], portrait = await residentPortrait(index); check()
  const english=residentEnglish[design.kind]
  report((normalizeResidentName(requestedName)||'Your little neighbor') + ' is getting ready to move in…'); await nextFrame(); check()
  const rig = createResidentRig(index)
  const name=normalizeResidentName(requestedName)
  return { ...rig, mapped: false, ...english, name, customName:Boolean(name), designIndex:index, portrait }
}
