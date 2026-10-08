import type {ResidentModel} from './planet-resident'
import {residentDesigns} from './resident-designs'
import type {CapsulePose} from './planet-capsule'

/** The reveal stage and its caption occupy separate layout rows. The renderer
 * uses the actual stage bounds, including on small screens and with long names. */
export function createPlanetArrival(screen:HTMLElement) {
  const panel=document.createElement('section')
  panel.className='planet-arrival';panel.hidden=true;panel.setAttribute('aria-label','Meet your new neighbor')
  panel.innerHTML=`<div class="planet-arrival-window"><header class="planet-unlock-header"><b>PARANGE PLANET / CAPSULE DELIVERY</b><span><i>HELLO,</i> <i>ADVENTURE!</i></span></header><div class="planet-reveal-stage" aria-hidden="true"><div class="planet-reveal-halo"></div>${['★','✦','★','✧','✦','★','✧','✦'].map((star,i)=>`<span class="planet-reveal-star star-${i}">${star}</span>`).join('')}<span class="planet-reveal-sticker">A LITTLE<br>SURPRISE!</span></div><div class="planet-arrival-caption" role="status"><span class="planet-card-index">SPECIAL DELIVERY</span><h2></h2><p></p><small>★ NEXT STOP: YOUR LITTLE PLANET ★</small></div></div>`
  const backdrop=document.createElement('div');backdrop.className='planet-reveal-backdrop';backdrop.setAttribute('aria-hidden','true');screen.append(backdrop)
  screen.append(panel)
  const stage=panel.querySelector<HTMLElement>('.planet-reveal-stage')!
  const title=panel.querySelector('h2')!,description=panel.querySelector('p')!,label=panel.querySelector('.planet-card-index')!
  let current:ResidentModel|null=null,lastPhase=''
  return {
    show:(model:ResidentModel)=>{
      current=model;lastPhase='rolling';panel.dataset.phase='rolling';backdrop.dataset.phase='rolling'
      label.textContent='SPECIAL DELIVERY';title.textContent='SOMETHING WONDERFUL!'
      description.textContent='A new friend is rolling into your world.'
      panel.hidden=false;panel.classList.remove('is-flying');screen.classList.add('is-presenting','is-revealing')
    },
    update:(pose:CapsulePose)=>{
      if(!current||lastPhase===pose.phase)return
      lastPhase=pose.phase;panel.dataset.phase=pose.phase;backdrop.dataset.phase=pose.phase
      if(pose.phase==='opening'){title.textContent='READY, SET… HELLO!';description.textContent='A little sparkle. A brand-new adventure.'}
      if(pose.phase==='revealed'){
        const kind=residentDesigns[current.designIndex??-1]?.kind
        label.textContent=kind?`NEW NEIGHBOR / ${kind.toUpperCase()}`:'HELLO, NEW NEIGHBOR'
        title.textContent=`HELLO, ${current.name}!`;description.textContent=`${current.trait}. Ready for a new home!`
      }
    },
    fly:()=>{
      panel.classList.add('is-flying');screen.classList.remove('is-revealing')
      label.textContent='NEXT STOP / YOUR LITTLE PLANET'
      title.textContent='LET THE ADVENTURE BEGIN!'
      description.textContent='A little world of flowers, rivers, and new friends.'
    },
    hide:()=>{current=null;lastPhase='';panel.hidden=true;delete panel.dataset.phase;panel.classList.remove('is-flying');screen.classList.remove('is-presenting','is-revealing')},
    getFrame:()=>{
      const frame=stage.getBoundingClientRect(),background=backdrop.getBoundingClientRect()
      backdrop.style.setProperty('--stage-x',`${frame.left+frame.width/2-background.left}px`)
      backdrop.style.setProperty('--stage-y',`${frame.top+frame.height/2-background.top}px`)
      backdrop.style.setProperty('--halo-size',`${Math.min(frame.width,frame.height)*.94}px`)
      return frame
    },
  }
}
