import atlasUrl from './assets/planet/residents-16.png'

// The generated sheet is not a uniform grid: long ears and tails extend beyond
// its nominal rows. Crop authored bounds instead of including a neighbour's feet.
const bounds: Array<[number,number,number,number]> = [
  [0,0,330,374], [335,0,326,374], [682,0,302,375], [982,22,289,353],
  [0,375,333,306], [334,374,313,310], [647,379,299,304], [943,358,328,321],
  [0,674,330,276], [333,677,306,276], [638,685,323,270], [958,674,313,283],
  [0,949,323,288], [324,947,320,290], [648,954,315,283], [959,965,312,272],
]
let source: Promise<HTMLImageElement> | undefined
export const residentPortrait = async (index:number) => {
  if (!bounds[index]) throw new RangeError(`Unknown resident portrait: ${index}`)
  source ??= (async()=>{const image=new Image();image.src=atlasUrl;await image.decode();return image})()
    .catch(error=>{source=undefined;throw error})
  const image=await source, result=document.createElement('canvas');result.width=512;result.height=512
  const [x,y,width,height]=bounds[index], ratio=480/Math.max(width,height)
  result.getContext('2d')!.drawImage(image,x,y,width,height,(512-width*ratio)/2,(512-height*ratio)/2,width*ratio,height*ratio)
  return result.toDataURL('image/png')
}
