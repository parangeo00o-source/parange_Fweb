import * as THREE from 'three'
import type { AnimalKind } from './resident-designs'

// Authored against the original roster, not inferred from a face photograph.
// Horizontal sections run from chin to crown. Each species has its own cheek,
// temple and crown contour; the front/back depth is sculpted independently.
type Sections = [number, number, number, number, number]
export type ResidentSculpt = {
  widths: Sections
  depths: Sections
  jawForward: number
  cheekDepth?: number
  sectionRoundness: number
  body: [number, number, number]
  arm: [number, number, number]
  leg: [number, number, number]
  stance: number
  hand: number
  shoe: [number, number, number]
  eyes: [number, number, number, number] // spacing, height, width, height
  hem: number
  waist: number
  chest: number
}

export const residentSculpts: Record<AnimalKind, ResidentSculpt> = {
  fox: { widths:[.69,1.13,1,.81,.46], depths:[.59,.90,1,.84,.49], jawForward:.038, cheekDepth:.075, sectionRoundness:.93,
    body:[.85,.79,.89],arm:[1.02,.89,1],leg:[.98,1.03,1],stance:.138,hand:1.10,shoe:[1.16,1.16,1.16],eyes:[.133,.057,.043,.086],hem:.226,waist:.194,chest:.196 },
  bear: { widths:[.68,.94,1,.84,.49], depths:[.63,.95,1,.85,.49],jawForward:.012,sectionRoundness:.94,
    body:[1.16,.86,1.13],arm:[1.16,.94,1.12],leg:[1.16,.91,1.12],stance:.157,hand:1.24,shoe:[1.30,1.35,1.22],eyes:[.135,.062,.046,.090],hem:.237,waist:.238,chest:.216 },
  rabbit: { widths:[.72,.97,1,.79,.40],depths:[.66,.94,1,.83,.46],jawForward:.018,sectionRoundness:.90,
    body:[.83,.78,.87],arm:[.88,.98,.90],leg:[.96,.93,.96],stance:.137,hand:1.34,shoe:[1.25,1.25,1.17],eyes:[.126,.044,.042,.084],hem:.282,waist:.192,chest:.163 },
  cat: { widths:[.81,1.04,1,.81,.43],depths:[.68,.92,1,.84,.47],jawForward:.023,sectionRoundness:.83,
    body:[.85,.80,.87],arm:[.94,1.0,.96],leg:[1,1.06,1],stance:.137,hand:1.30,shoe:[1.26,1.18,1.24],eyes:[.136,.055,.043,.095],hem:.216,waist:.19,chest:.178 },
  penguin: { widths:[.65,.94,1,.87,.52],depths:[.65,.94,1,.88,.54],jawForward:.018,sectionRoundness:1,
    body:[1.04,.91,1.1],arm:[1.14,.78,.86],leg:[.98,.64,1],stance:.154,hand:1.12,shoe:[1.4,.98,1.44],eyes:[.129,.033,.046,.090],hem:.245,waist:.251,chest:.188 },
  koala: { widths:[.75,1.02,1,.78,.42],depths:[.63,.94,1,.82,.46],jawForward:.025,sectionRoundness:.89,
    body:[.87,.80,.91],arm:[.95,.94,1],leg:[1,.96,1],stance:.135,hand:1.20,shoe:[1.22,1.23,1.22],eyes:[.150,.031,.037,.081],hem:.220,waist:.211,chest:.18 },
  frog: { widths:[.75,.98,1,.89,.55],depths:[.70,.98,1,.86,.50],jawForward:.032,sectionRoundness:.94,
    body:[.81,.76,.84],arm:[.84,1.04,.87],leg:[.89,1.09,.91],stance:.142,hand:1.18,shoe:[1.15,1.12,1.21],eyes:[.227,.275,.061,.092],hem:.213,waist:.197,chest:.179 },
  elephant: { widths:[.68,.94,1,.84,.48],depths:[.72,.98,1,.88,.53],jawForward:.026,sectionRoundness:.91,
    body:[1.03,.81,1.07],arm:[1.04,.93,1.07],leg:[1.1,.89,1.13],stance:.153,hand:1.23,shoe:[1.35,1.28,1.29],eyes:[.132,.052,.040,.093],hem:.237,waist:.237,chest:.208 },
  raccoon: { widths:[.69,1.08,1,.79,.44],depths:[.60,.92,1,.84,.48],jawForward:.043,sectionRoundness:.91,
    body:[.9,.80,.94],arm:[.95,.9,.98],leg:[1.01,.94,1],stance:.14,hand:1.28,shoe:[1.22,1.25,1.25],eyes:[.128,.037,.039,.081],hem:.224,waist:.209,chest:.190 },
  deer: { widths:[.64,.92,1,.83,.45],depths:[.57,.91,1,.87,.49],jawForward:.029,sectionRoundness:.96,
    body:[.82,.80,.86],arm:[.87,.97,.91],leg:[.91,1.12,.95],stance:.13,hand:1.22,shoe:[1.21,1.22,1.24],eyes:[.121,.050,.041,.087],hem:.218,waist:.195,chest:.176 },
  dog: { widths:[.76,.98,1,.78,.43],depths:[.68,.96,1,.83,.47],jawForward:.041,sectionRoundness:.88,
    body:[.93,.8,.99],arm:[1.01,.95,1],leg:[1.06,.98,1.08],stance:.142,hand:1.29,shoe:[1.28,1.24,1.25],eyes:[.132,.053,.043,.091],hem:.232,waist:.210,chest:.194 },
  duck: { widths:[.62,.91,1,.85,.48],depths:[.64,.96,1,.87,.50],jawForward:.017,sectionRoundness:.97,
    body:[.91,.80,.98],arm:[.98,.9,.91],leg:[.91,.76,.98],stance:.145,hand:1.26,shoe:[1.46,.91,1.45],eyes:[.115,.056,.043,.089],hem:.234,waist:.227,chest:.186 },
  sheep: { widths:[.76,.97,1,.84,.45],depths:[.69,.94,1,.84,.48],jawForward:.025,sectionRoundness:.87,
    body:[.88,.78,.94],arm:[.93,.91,.95],leg:[.96,.91,.99],stance:.135,hand:1.26,shoe:[1.28,1.23,1.21],eyes:[.115,.035,.036,.080],hem:.228,waist:.214,chest:.191 },
  mouse: { widths:[.67,.96,1,.75,.40],depths:[.56,.88,1,.79,.43],jawForward:.049,sectionRoundness:.94,
    body:[.77,.73,.84],arm:[.82,.87,.88],leg:[.86,.85,.94],stance:.121,hand:1.16,shoe:[1.24,1.18,1.24],eyes:[.108,.016,.035,.079],hem:.209,waist:.201,chest:.174 },
  otter: { widths:[.83,1.04,1,.77,.40],depths:[.68,.96,1,.83,.45],jawForward:.052,sectionRoundness:.80,
    body:[.96,.83,1.01],arm:[1.01,.99,1],leg:[1.03,.98,1.04],stance:.146,hand:1.28,shoe:[1.24,1.21,1.24],eyes:[.136,.060,.038,.080],hem:.231,waist:.222,chest:.199 },
  capybara: { widths:[.82,1.02,1,.83,.48],depths:[.80,1,1,.86,.49],jawForward:.063,cheekDepth:.085,sectionRoundness:.72,
    body:[1.24,.68,1.16],arm:[1.02,.82,1.02],leg:[.99,.63,1.03],stance:.171,hand:1.22,shoe:[1.20,1.07,1.22],eyes:[.226,.066,.031,.076],hem:.24,waist:.248,chest:.225 },
}

// Cubic sections retain a continuous tangent at each authored contour station.
const section = (values: Sections, y: number) => {
  const heights = [-1,-.82,-.46,0,.46,.82,1]
  // Interpolate the deviation from a spherical section, not raw radii. The
  // sqrt falloff at the two poles is essential: linear falloff makes a cone.
  const inner=values.map((radius,i)=>radius/Math.sqrt(1-heights[i+1]**2))
  const radii = [inner[0],...inner,inner[4]]
  let i = 0
  while (i < heights.length-2 && y > heights[i+1]) i++
  const start=heights[i], end=heights[i+1], t=THREE.MathUtils.clamp((y-start)/(end-start),0,1)
  const slope=(k:number)=>(radii[Math.min(k+1,6)]-radii[Math.max(k-1,0)])/(heights[Math.min(k+1,6)]-heights[Math.max(k-1,0)])
  return Math.sqrt(Math.max(0,1-y*y))*Math.max(0,(2*t**3-3*t*t+1)*radii[i]+(t**3-2*t*t+t)*(end-start)*slope(i)
    +(-2*t**3+3*t*t)*radii[i+1]+(t**3-t*t)*(end-start)*slope(i+1))
}
const signedPower = (n:number,p:number)=>Math.sign(n)*Math.abs(n)**p

/** Returns a point on a closed, species-specific head, not on a billboard. */
export function headPoint(sculpt:ResidentSculpt, size:[number,number,number], x:number,y:number,z:number): THREE.Vector3 {
  const radius=Math.sqrt(Math.max(0,1-y*y)), [hx,hy,hz]=size
  const cx=radius>1e-6?x/radius:0, cz=radius>1e-6?z/radius:0
  const forward=sculpt.jawForward*Math.exp(-(((y+.36)/.6)**2))
    +(sculpt.cheekDepth??0)*Math.exp(-(((y+.38)/.36)**2))*Math.max(0,cz)**1.5
  return new THREE.Vector3(signedPower(cx,sculpt.sectionRoundness)*section(sculpt.widths,y)*hx,
    y*hy,signedPower(cz,sculpt.sectionRoundness)*section(sculpt.depths,y)*hz+forward)
}

/** Exact front surface position used to seat eyes/markings on the sculpt. */
export function headFront(sculpt:ResidentSculpt,size:[number,number,number],x:number,y:number):number {
  const ny=THREE.MathUtils.clamp(y/size[1],-.999,.999)
  const width=section(sculpt.widths,ny)*size[0]
  const cos=Math.min(.999,Math.abs(x/width))**(1/sculpt.sectionRoundness)
  return Math.sqrt(1-cos*cos)**sculpt.sectionRoundness*section(sculpt.depths,ny)*size[2]
    +sculpt.jawForward*Math.exp(-(((ny+.36)/.6)**2))
    +(sculpt.cheekDepth??0)*Math.exp(-(((ny+.38)/.36)**2))*(1-cos*cos)**.75
}
