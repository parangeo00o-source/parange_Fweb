export type ResidentRecord={id:string;name:string;designIndex:number;normal:[number,number,number]}
type Save={version:1;nextNumber:number;residents:ResidentRecord[];expelled:string[]}
const KEY='parange.planet.residents.v1'
export const normalizeResidentName=(value:string)=>Array.from(value.normalize('NFC').replace(/[\p{Cc}\p{Cf}]/gu,'').replace(/\s+/g,' ').trim()).slice(0,24).join('')

// Only species, names and surface coordinates are stored. Never camera images.
export function createResidentStore() {
  let data:Save={version:1,nextNumber:1,residents:[],expelled:[]},available=true
  try {
    const raw=localStorage.getItem(KEY),saved=raw?JSON.parse(raw):null
    if(saved?.version===1){
      const expelled: string[]=Array.isArray(saved.expelled)?saved.expelled.filter((id:unknown)=>typeof id==='string'):[]
      const seen=new Set<string>()
      const residents:ResidentRecord[]=[]
      for(const item of Array.isArray(saved.residents)?saved.residents:[]){
        if(!item||typeof item.id!=='string'||seen.has(item.id)||expelled.includes(item.id)||!Number.isInteger(item.designIndex)||item.designIndex<0||item.designIndex>=16)continue
        if(!Array.isArray(item.normal)||item.normal.length!==3||!item.normal.every((n:unknown)=>typeof n==='number'&&Number.isFinite(n))||Math.hypot(...item.normal)<.01)continue
        seen.add(item.id)
        residents.push({id:item.id,designIndex:item.designIndex,name:typeof item.name==='string'?normalizeResidentName(item.name):'',normal:item.normal})
      }
      const highest=Math.max(0,...residents.map(r=>Number(/^주민 (\d+)$/.exec(r.name)?.[1])||0).filter(Number.isSafeInteger))
      data={version:1,nextNumber:Math.max(highest+1,Number.isSafeInteger(saved.nextNumber)?saved.nextNumber:1,1),residents,expelled}
      for(const resident of data.residents)if(!resident.name)resident.name=`주민 ${data.nextNumber++}`
    }
  }catch {available=false}
  // Never let an older open tab overwrite a durable expulsion with its stale
  // roster. IDs are never reused, even when a new animal of the same kind moves in.
  const mergeExpulsions=()=>{
    const raw=localStorage.getItem(KEY)
    if(!raw)return
    let current:Save
    try{current=JSON.parse(raw)}catch{return}
    if(current?.version!==1)return
    if(Array.isArray(current.expelled))data.expelled=[...new Set([...data.expelled,...current.expelled.filter(id=>typeof id==='string')])]
    if(Number.isSafeInteger(current.nextNumber))data.nextNumber=Math.max(data.nextNumber,current.nextNumber)
    data.residents=data.residents.filter(r=>!data.expelled.includes(r.id))
  }
  const write=()=>{try{mergeExpulsions();localStorage.setItem(KEY,JSON.stringify(data));available=true}catch{available=false}}
  return {
    get records(){return data.residents.map(r=>({...r,normal:[...r.normal] as ResidentRecord['normal']}))},
    get available(){return available},
    isExpelled:(id:string)=>{try{mergeExpulsions()}catch{available=false}return data.expelled.includes(id)},
    identity:(requestedName:string)=>{
      try{mergeExpulsions()}catch{available=false}
      const number=data.nextNumber++,name=normalizeResidentName(requestedName)||`주민 ${number}`
      const id=crypto.randomUUID();write();return {id,name}
    },
    save:(residents:ResidentRecord[])=>{data.residents=residents.filter(r=>!data.expelled.includes(r.id));write()},
    expel:(id:string)=>{if(!data.expelled.includes(id))data.expelled.push(id);data.residents=data.residents.filter(r=>r.id!==id);write()},
  }
}
