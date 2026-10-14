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
  cheekWidth?: number
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
  fox: { widths:[.52,1.12,1,.86,.50], depths:[.51,.82,1,.88,.53], jawForward:.035, cheekDepth:.055, cheekWidth:.24, sectionRoundness:1,
    body:[.93,.74,.95],arm:[1.02,.86,1],leg:[.98,.97,1],stance:.138,hand:1.14,shoe:[1.20,1.04,1.28],eyes:[.133,.057,.043,.086],hem:.226,waist:.194,chest:.196 },
  bear: { widths:[.58,.92,1,.90,.57], depths:[.57,.92,1,.90,.57],jawForward:.012,sectionRoundness:.98,
    body:[1.22,.81,1.18],arm:[1.19,.88,1.16],leg:[1.16,.85,1.12],stance:.157,hand:1.28,shoe:[1.34,1.22,1.30],eyes:[.135,.062,.046,.090],hem:.237,waist:.238,chest:.216 },
  rabbit: { widths:[.64,.97,1,.89,.54],depths:[.60,.94,1,.89,.54],jawForward:.018,sectionRoundness:.92,
    body:[.90,.73,.93],arm:[.91,.91,.93],leg:[.96,.87,.96],stance:.137,hand:1.38,shoe:[1.29,1.15,1.25],eyes:[.126,.044,.042,.084],hem:.282,waist:.192,chest:.163 },
  cat: { widths:[.66,1.02,1,.88,.52],depths:[.60,.94,1,.88,.52],jawForward:.023,sectionRoundness:.87,
    body:[.91,.74,.93],arm:[.98,.92,1],leg:[1,1,1],stance:.137,hand:1.32,shoe:[1.29,1.12,1.30],eyes:[.136,.055,.043,.095],hem:.216,waist:.19,chest:.178 },
  penguin: { widths:[.61,.94,1,.91,.57],depths:[.61,.94,1,.91,.57],jawForward:.018,sectionRoundness:1,
    body:[1.11,.97,1.16],arm:[1.16,.74,.91],leg:[.98,.61,1],stance:.154,hand:1.17,shoe:[1.43,1.55,1.50],eyes:[.129,.033,.046,.090],hem:.245,waist:.251,chest:.188 },
  koala: { widths:[.61,.98,1,.89,.55],depths:[.58,.94,1,.88,.53],jawForward:.025,sectionRoundness:.94,
    body:[.96,.73,.97],arm:[1,.87,1.04],leg:[1,.90,1],stance:.135,hand:1.25,shoe:[1.27,1.14,1.29],eyes:[.150,.031,.037,.081],hem:.220,waist:.211,chest:.18 },
  frog: { widths:[.60,.96,1,.92,.57],depths:[.61,.95,1,.88,.53],jawForward:.032,sectionRoundness:.98,
    body:[.86,.65,.90],arm:[.87,.95,.91],leg:[.89,1.03,.91],stance:.142,hand:1.24,shoe:[1.19,1.08,1.29],eyes:[.227,.242,.073,.098],hem:.213,waist:.197,chest:.179 },
  elephant: { widths:[.60,.94,1,.91,.56],depths:[.62,.96,1,.92,.56],jawForward:.026,sectionRoundness:.96,
    body:[1.12,.75,1.14],arm:[1.08,.87,1.11],leg:[1.1,.83,1.13],stance:.153,hand:1.28,shoe:[1.38,1.18,1.35],eyes:[.132,.052,.040,.093],hem:.237,waist:.237,chest:.208 },
  raccoon: { widths:[.49,1.09,1,.87,.52],depths:[.52,.92,1,.88,.53],jawForward:.033,cheekWidth:.17,sectionRoundness:.95,
    body:[.98,.74,1.01],arm:[1,.86,1.02],leg:[1.01,.88,1],stance:.14,hand:1.31,shoe:[1.28,1.16,1.32],eyes:[.128,.037,.039,.081],hem:.224,waist:.209,chest:.190 },
  deer: { widths:[.58,.92,1,.91,.56],depths:[.56,.92,1,.90,.55],jawForward:.029,sectionRoundness:.98,
    body:[.88,.73,.92],arm:[.91,.90,.95],leg:[.91,1.06,.95],stance:.13,hand:1.28,shoe:[1.25,1.15,1.30],eyes:[.121,.050,.041,.087],hem:.218,waist:.195,chest:.176 },
  dog: { widths:[.65,.99,1,.88,.53],depths:[.60,.96,1,.89,.53],jawForward:.065,cheekDepth:.045,sectionRoundness:.92,
    body:[1,.74,1.05],arm:[1.06,.88,1.04],leg:[1.06,.92,1.08],stance:.142,hand:1.32,shoe:[1.31,1.16,1.34],eyes:[.132,.053,.043,.091],hem:.232,waist:.210,chest:.194 },
  duck: { widths:[.58,.92,1,.91,.56],depths:[.60,.96,1,.91,.55],jawForward:.017,sectionRoundness:.99,
    body:[1.02,.77,1.06],arm:[1.04,.84,.97],leg:[.91,.71,.98],stance:.145,hand:1.34,shoe:[1.49,1.04,1.52],eyes:[.115,.056,.043,.089],hem:.234,waist:.227,chest:.186 },
  sheep: { widths:[.63,.97,1,.89,.54],depths:[.60,.94,1,.88,.53],jawForward:.025,sectionRoundness:.94,
    body:[.96,.73,1.0],arm:[.97,.85,1],leg:[.96,.86,.99],stance:.135,hand:1.31,shoe:[1.33,1.15,1.29],eyes:[.115,.035,.036,.080],hem:.228,waist:.214,chest:.191 },
  mouse: { widths:[.56,.95,1,.88,.53],depths:[.51,.90,1,.87,.51],jawForward:.049,sectionRoundness:.98,
    body:[.82,.68,.90],arm:[.85,.82,.92],leg:[.86,.80,.94],stance:.121,hand:1.21,shoe:[1.28,1.09,1.31],eyes:[.108,.016,.035,.079],hem:.209,waist:.201,chest:.174 },
  otter: { widths:[.64,1.04,1,.87,.52],depths:[.60,.96,1,.88,.52],jawForward:.044,cheekDepth:.029,cheekWidth:.035,sectionRoundness:.96,
    body:[1.03,.77,1.08],arm:[1.06,.91,1.04],leg:[1.03,.92,1.04],stance:.146,hand:1.32,shoe:[1.29,1.14,1.32],eyes:[.136,.060,.038,.080],hem:.231,waist:.222,chest:.199 },
  capybara: { widths:[.57,.92,1,.92,.60],depths:[.57,.93,1,.97,.63],jawForward:.025,sectionRoundness:1,
    body:[1.23,.65,.92],arm:[1.07,.78,1.06],leg:[.99,.60,1.03],stance:.171,hand:1.26,shoe:[1.24,1.55,1.29],eyes:[.251,.071,.034,.080],hem:.24,waist:.248,chest:.225 },
}

// A single positive Bernstein envelope, not a series of interpolated rings.
// C2+ curvature prevents the horizontal bands/dents that separate Hermite
// sections left in specular highlights. Controls retain species proportions.
const sectionScale = (values: Sections, y: number) => {
  const t=(y+1)*.5,s=1-t
  return values[0]/.57236352*s**4+4*values[1]/.88791892*s**3*t
    +6*values[2]*s*s*t*t+4*values[3]/.88791892*s*t**3+values[4]/.57236352*t**4
}
// Regularise superellipse axes. abs(n)^p with p<1 has an infinite derivative
// at zero, which made a pinched seam at the front and sides of several heads.
const signedPower = (n:number,p:number)=>n*((n*n+.012)/(1.012))**((p-1)/2)

/** Returns a point on a closed, species-specific head, not on a billboard. */
export function headPoint(sculpt:ResidentSculpt, size:[number,number,number], x:number,y:number,z:number): THREE.Vector3 {
  const radius=Math.sqrt(Math.max(0,1-y*y)), [hx,hy,hz]=size
  const cx=radius>1e-6?x/radius:0, cz=radius>1e-6?z/radius:0
  const blend=THREE.MathUtils.clamp((cz+.35)/.9,0,1)
  const front=blend**3*(blend*(blend*6-15)+10)
  // Angular deformation must vanish at BOTH poles. A finite jaw offset there
  // made the chin/crown pinch and fold when viewed from below or behind.
  const envelope=radius*radius,weight=front*envelope
  const cheek=Math.exp(-(((y+.28)/.36)**2))
  const width=radius*(1+(sectionScale(sculpt.widths,y)-1)*weight+(sculpt.cheekWidth??0)*cheek*weight*cx*cx)
  const depth=radius*(1+(sectionScale(sculpt.depths,y)-1)*weight)
  const forward=weight*(sculpt.jawForward*Math.exp(-(((y+.36)/.6)**2))
    +(sculpt.cheekDepth??0)*cheek*Math.max(0,cz)**2)
  const power=1+(sculpt.sectionRoundness-1)*envelope
  return new THREE.Vector3(signedPower(cx,power)*width*hx,
    y*hy,signedPower(cz,power)*depth*hz+forward)
}

/** Exact front surface position used to seat eyes/markings on the sculpt. */
export function headFront(sculpt:ResidentSculpt,size:[number,number,number],x:number,y:number):number {
  const ny=THREE.MathUtils.clamp(y/size[1],-.999,.999)
  const radius=Math.sqrt(1-ny*ny)
  let low=0,high=Math.PI/2
  // Query the same surface used for the mesh, including the front/back blend;
  // separate approximate formulas left the eyes floating above side views.
  for(let i=0;i<24;i++){
    const angle=(low+high)/2
    const point=headPoint(sculpt,size,Math.sin(angle)*radius,ny,Math.cos(angle)*radius)
    if(point.x<Math.abs(x))low=angle;else high=angle
  }
  const angle=(low+high)/2
  return headPoint(sculpt,size,Math.sin(angle)*radius,ny,Math.cos(angle)*radius).z
}
