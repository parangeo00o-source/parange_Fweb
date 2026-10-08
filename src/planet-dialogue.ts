import {createDialogueDeck} from './resident-lines'

export function createPlanetDialogue(parent:HTMLElement,returnToGlobe:()=>void) {
  const bubble=document.createElement('section')
  bubble.className='planet-dialogue';bubble.hidden=true;bubble.lang='en';bubble.setAttribute('aria-label','A word from your neighbor')
  bubble.innerHTML=`<header><strong class="planet-dialogue-name"></strong><span class="planet-dialogue-channel" aria-hidden="true">NEIGHBOR CHAT!</span><button class="planet-dialogue-exit" type="button">GLOBE VIEW ↗</button></header><p class="planet-dialogue-text" lang="ko" aria-hidden="true"></p><p class="planet-dialogue-announcement" lang="ko" role="status" aria-live="polite" aria-atomic="true"></p><footer><span><i aria-hidden="true">✥</i> DRAG TO LOOK AROUND</span><button class="planet-dialogue-next" type="button">TELL ME MORE <span aria-hidden="true">▶</span></button></footer>`
  parent.append(bubble)
  const name=bubble.querySelector<HTMLElement>('.planet-dialogue-name')!
  const text=bubble.querySelector<HTMLElement>('.planet-dialogue-text')!
  const announcement=bubble.querySelector<HTMLElement>('.planet-dialogue-announcement')!
  const next=bubble.querySelector<HTMLButtonElement>('.planet-dialogue-next')!
  const decks=new Map<string,ReturnType<typeof createDialogueDeck>>()
  const reduced=matchMedia('(prefers-reduced-motion: reduce)')
  let selected:string|null=null, timer=0, characters:string[]=[],position=0
  const stop=()=>{clearTimeout(timer);timer=0}
  const complete=()=>{
    stop();position=characters.length;text.textContent=characters.join('');announcement.textContent=`${name.textContent}: ${text.textContent}`
    bubble.classList.remove('is-typing');next.firstChild!.textContent='TELL ME MORE '
    if(selected&&!document.hidden)timer=window.setTimeout(speak,8000)
  }
  const type=()=>{
    if(!selected||document.hidden)return
    position++;text.textContent=characters.slice(0,position).join('')
    if(position>=characters.length){complete();return}
    const character=characters[position-1]
    const delay=/[.!?]/.test(character)?220:/[,;:]/.test(character)?120:character===' '?16:26+Math.random()*24
    timer=window.setTimeout(type,delay)
  }
  function speak(){
    stop();if(!selected)return
    let deck=decks.get(selected);if(!deck){deck=createDialogueDeck();decks.set(selected,deck)}
    characters=Array.from(deck());position=0;text.textContent='';announcement.textContent=''
    bubble.classList.add('is-typing');next.firstChild!.textContent='READ IT ALL '
    if(reduced.matches)complete();else type()
  }
  next.addEventListener('click',()=>position<characters.length?complete():speak())
  bubble.querySelector('header button')!.addEventListener('click',returnToGlobe)
  const visibility=()=>{stop();if(!document.hidden&&selected){if(position<characters.length)type();else timer=window.setTimeout(speak,8000)}}
  document.addEventListener('visibilitychange',visibility)
  return {
    setResident:(resident:{id:string;name:string}|null)=>{
      if(!resident){stop();selected=null;bubble.hidden=true;announcement.textContent='';return}
      name.textContent=resident.name;name.title=resident.name
      if(selected===resident.id)return
      selected=resident.id;bubble.hidden=false;speak()
    },
    forget:(id:string)=>{decks.delete(id);if(selected===id){stop();selected=null;bubble.hidden=true}},
    dispose:()=>{stop();document.removeEventListener('visibilitychange',visibility);decks.clear();bubble.remove()},
  }
}
