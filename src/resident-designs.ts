export type AnimalKind = 'fox' | 'bear' | 'rabbit' | 'cat' | 'penguin' | 'koala' | 'frog' | 'elephant' | 'raccoon' | 'deer' | 'dog' | 'duck' | 'sheep' | 'mouse' | 'otter' | 'capybara'
export type Motion = 'trot' | 'amble' | 'hop' | 'waddle' | 'scurry' | 'sway'
export type ResidentDesign = {
  name: string
  trait: string
  kind: AnimalKind
  fur: string
  cream: string
  secondary: string
  suit: string
  trim: string
  gloves: string
  boots: string
  head: [number, number, number]
  motion: Motion
}

export const residentEnglish: Record<AnimalKind,{name:string;trait:string}> = {
  fox:{name:'Momo the Fox',trait:'A curious explorer'},bear:{name:'Toto the Bear',trait:'A kindhearted gardener'},
  rabbit:{name:'Lulu the Rabbit',trait:'A bouncy trail walker'},cat:{name:'Nero the Cat',trait:'An easygoing musician'},
  penguin:{name:'Popo the Penguin',trait:'A cozy storyteller'},koala:{name:'Coco the Koala',trait:'A peaceful daydreamer'},
  frog:{name:'Pico the Frog',trait:'A collector of little wonders'},elephant:{name:'Ellie the Elephant',trait:'A brave inventor'},
  raccoon:{name:'Rumi the Raccoon',trait:'A playful trader'},deer:{name:'Dori the Deer',trait:'A woodland guide'},
  dog:{name:'Bori the Dog',trait:'A loyal adventurer'},duck:{name:'Mari the Duck',trait:'A cheerful cook'},
  sheep:{name:'Merry the Sheep',trait:'A gentle dressmaker'},mouse:{name:'Mimi the Mouse',trait:'A speedy mail carrier'},
  otter:{name:'Oti the Otter',trait:'A splash-loving champion'},capybara:{name:'Baba the Capybara',trait:'A laid-back tea lover'},
}

// Model dimensions, markings and garments are authored against residents-16.png
// as the palette/silhouette authority. Turnarounds only inform hidden structure;
// their alternate uniform outfits must not replace the original roster designs.
export const residentDesigns: readonly ResidentDesign[] = [
  { name: '여우 모모', trait: '호기심 많은 탐험가', kind: 'fox', fur: '#ee5715', cream: '#fff0cf', secondary: '#923516', suit: '#ee6119', trim: '#fff0cf', gloves: '#eb4916', boots: '#eb4916', head: [.38,.255,.28], motion: 'trot' },
  { name: '곰 토토', trait: '다정한 정원사', kind: 'bear', fur: '#a9552b', cream: '#f8d8a1', secondary: '#70391e', suit: '#125cdf', trim: '#eef3ff', gloves: '#a9552b', boots: '#1465e3', head: [.35,.33,.29], motion: 'amble' },
  { name: '토끼 루루', trait: '경쾌한 산책가', kind: 'rabbit', fur: '#fff0d4', cream: '#fff0d4', secondary: '#f579ad', suit: '#ef338f', trim: '#fff0d4', gloves: '#ee2888', boots: '#ef338f', head: [.335,.29,.265], motion: 'hop' },
  { name: '고양이 네로', trait: '느긋한 음악가', kind: 'cat', fur: '#f49a23', cream: '#fff0c9', secondary: '#613320', suit: '#7330c9', trim: '#fff0c9', gloves: '#7434d0', boots: '#7330c9', head: [.355,.265,.275], motion: 'trot' },
  { name: '펭귄 포포', trait: '포근한 이야기꾼', kind: 'penguin', fur: '#1730a9', cream: '#fff8e1', secondary: '#ffc51a', suit: '#04b8df', trim: '#f2f4dc', gloves: '#1736b5', boots: '#ffc314', head: [.32,.325,.285], motion: 'waddle' },
  { name: '코알라 코코', trait: '차분한 낮잠가', kind: 'koala', fur: '#9392b2', cream: '#f5e5c5', secondary: '#45435a', suit: '#2ab526', trim: '#f8f0d5', gloves: '#2caa23', boots: '#29aa2a', head: [.35,.265,.285], motion: 'amble' },
  { name: '개구리 피코', trait: '반짝이는 수집가', kind: 'frog', fur: '#65c519', cream: '#f7e4a8', secondary: '#369714', suit: '#ed6510', trim: '#ffd653', gloves: '#fa7516', boots: '#f77917', head: [.38,.185,.27], motion: 'hop' },
  { name: '코끼리 엘리', trait: '씩씩한 발명가', kind: 'elephant', fur: '#349dea', cream: '#f192b4', secondary: '#147acb', suit: '#ed3026', trim: '#fff3de', gloves: '#349dea', boots: '#318fe0', head: [.31,.325,.30], motion: 'amble' },
  { name: '너구리 루미', trait: '장난기 많은 상인', kind: 'raccoon', fur: '#bc824b', cream: '#ffe4b6', secondary: '#573528', suit: '#145ed5', trim: '#edf1e1', gloves: '#1262e1', boots: '#1562df', head: [.36,.30,.28], motion: 'scurry' },
  { name: '사슴 도리', trait: '숲길 안내자', kind: 'deer', fur: '#e88b29', cream: '#ffe3ae', secondary: '#9f5126', suit: '#ed388e', trim: '#fff0d5', gloves: '#ed398d', boots: '#ed3a92', head: [.31,.31,.27], motion: 'trot' },
  { name: '강아지 보리', trait: '용감한 친구', kind: 'dog', fur: '#ba784b', cream: '#fff0d3', secondary: '#92512b', suit: '#e53421', trim: '#fff0d8', gloves: '#e83221', boots: '#e9a02a', head: [.325,.30,.275], motion: 'trot' },
  { name: '오리 마리', trait: '신나는 요리사', kind: 'duck', fur: '#fff1ad', cream: '#fff5cd', secondary: '#f79910', suit: '#198bce', trim: '#fff4d6', gloves: '#fff1ad', boots: '#f79516', head: [.305,.31,.285], motion: 'waddle' },
  { name: '양 메리', trait: '달콤한 재봉사', kind: 'sheep', fur: '#ffe9b5', cream: '#fff1d0', secondary: '#f0a2ab', suit: '#8845cb', trim: '#fff0dc', gloves: '#8744cc', boots: '#8846cc', head: [.31,.295,.27], motion: 'sway' },
  { name: '생쥐 미미', trait: '빠른 우편배달부', kind: 'mouse', fur: '#a99bc0', cream: '#ede1d9', secondary: '#f68fae', suit: '#ffcc18', trim: '#332f3a', gloves: '#ffcb16', boots: '#ffd324', head: [.29,.29,.25], motion: 'scurry' },
  { name: '수달 오티', trait: '물놀이 챔피언', kind: 'otter', fur: '#b97643', cream: '#ffe2b2', secondary: '#804926', suit: '#09aeb4', trim: '#e9f0d7', gloves: '#07a4ac', boots: '#0daab1', head: [.345,.285,.275], motion: 'trot' },
  { name: '카피바라 바바', trait: '평화로운 차 마스터', kind: 'capybara', fur: '#b57942', cream: '#fff0ce', secondary: '#764127', suit: '#31a54a', trim: '#edf0d2', gloves: '#2ba048', boots: '#2ea447', head: [.29,.25,.46], motion: 'waddle' },
]
