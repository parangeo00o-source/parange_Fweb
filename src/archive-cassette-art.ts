import handwritingFont from './assets/guestbook/Courgette-Regular.ttf'
const handwriting = new FontFace('CassetteHand', `url(${handwritingFont})`)
export const cassetteTypographyReady = handwriting.load().then(font => { document.fonts.add(font) }).catch(() => {})

/** Reference-led cassette editions. Each project keeps a stable, distinct design. */
export interface CassetteEdition { brand: string; model: string; body: string; paper: string; ink: string; accent: string; clear: boolean; layout: number; minutes: string; note?: string }
export const cassetteEditions: CassetteEdition[] = [
  {brand:'SEIKO',model:'Compact Cassette',body:'#d5d4bd',paper:'#f2efdb',ink:'#16241d',accent:'#149bca',clear:false,layout:0,minutes:'60'},
  {brand:'DENON',model:'LX',body:'#bacbc2',paper:'#eeeedd',ink:'#171c1b',accent:'#a5d429',clear:true,layout:1,minutes:'60'},
  {brand:'SONY',model:'FX I',body:'#b43c58',paper:'#eee6e2',ink:'#f3dcd9',accent:'#bc2928',clear:true,layout:2,minutes:'60'},
  {brand:'SONY',model:'C-1K',body:'#006d9a',paper:'#ebe9d9',ink:'#064c6c',accent:'#43c4d6',clear:true,layout:3,minutes:'01'},
  {brand:'Scotch',model:'MAGNETIC TAPE',body:'#8ac3d1',paper:'#eeead5',ink:'#365665',accent:'#c9d9ca',clear:true,layout:4,minutes:'120',note:'Flown on Apollo 9'},
  {brand:'STRICTLY CASSETTE',model:'SC',body:'#00a6d1',paper:'#10181b',ink:'#dedfd4',accent:'#079bc7',clear:true,layout:5,minutes:'90'},
  {brand:'Scotch',model:'No. 273',body:'#8ecbbf',paper:'#f0ebce',ink:'#497771',accent:'#b1d0b7',clear:true,layout:4,minutes:'120',note:'Walk with me'},
  {brand:'AGFA',model:'FERRO COLOR',body:'#078fbf',paper:'#f4efd5',ink:'#102a33',accent:'#009bc4',clear:false,layout:6,minutes:'60'},
  {brand:'KENNEX',model:'EXD',body:'#a4a6bf',paper:'#ece8d4',ink:'#171e20',accent:'#c942a9',clear:true,layout:7,minutes:'90',note:'MIXTAPE MONDAYS'},
  {brand:'AXIA',model:'PS·1',body:'#c7e8eb',paper:'#ede9dd',ink:'#183e46',accent:'#20879b',clear:true,layout:8,minutes:'74'},
  {brand:'TEAC',model:'mdx1',body:'#d9e82f',paper:'#d8e147',ink:'#243728',accent:'#5f861e',clear:true,layout:9,minutes:'100'},
  {brand:'AGFA',model:'LNS',body:'#765086',paper:'#f8c53e',ink:'#292024',accent:'#f0b921',clear:false,layout:10,minutes:'90'},
  {brand:'Universum',model:'C-90',body:'#bbb9ae',paper:'#eee9db',ink:'#141b24',accent:'#1667b7',clear:false,layout:11,minutes:'90'},
  {brand:'MEMOREX',model:'HIGH BIAS',body:'#152b3b',paper:'#ede6ca',ink:'#e6e4cc',accent:'#1a6080',clear:false,layout:3,minutes:'90'},
  {brand:'HITACHI',model:'LOW NOISE',body:'#babca8',paper:'#eee9d9',ink:'#1b345b',accent:'#18439a',clear:false,layout:11,minutes:'60'},
  {brand:'GRUNDIG',model:'Studio-Cassette',body:'#252d33',paper:'#e6e4ce',ink:'#e9e4d0',accent:'#187da6',clear:false,layout:6,minutes:'60'},
  {brand:'PHILIPS',model:'Compact Cassette',body:'#dfd9b8',paper:'#f0e5c3',ink:'#695b51',accent:'#c36d94',clear:false,layout:10,minutes:'90'},
  {brand:'DENON',model:'DX1',body:'#4a615a',paper:'#e5e6ce',ink:'#e4eddb',accent:'#3db6a5',clear:true,layout:1,minutes:'90'},
  {brand:'AKAI',model:'CASSETTE TAPE',body:'#d8d5b6',paper:'#f1eaca',ink:'#132b29',accent:'#37a5a9',clear:false,layout:7,minutes:'90'},
  {brand:'TDK',model:'D',body:'#333c3e',paper:'#e9e4cd',ink:'#f4e6bb',accent:'#c49a53',clear:false,layout:8,minutes:'60'},
  {brand:'maxell',model:'UD II',body:'#777e78',paper:'#e8e3d0',ink:'#f2e9da',accent:'#be3c2b',clear:true,layout:7,minutes:'90'},
  {brand:'BASF',model:'CHROME EXTRA',body:'#28343f',paper:'#e6e4d5',ink:'#ecddc5',accent:'#e58c30',clear:false,layout:6,minutes:'90'},
  {brand:'FUJI',model:'DR-I',body:'#ced9ce',paper:'#f3eedc',ink:'#174638',accent:'#248c5e',clear:true,layout:0,minutes:'60'},
  {brand:'SONY',model:'HF',body:'#d4c9be',paper:'#f0e9d5',ink:'#1e2830',accent:'#c54a3a',clear:false,layout:3,minutes:'90'},
  {brand:'AXIA',model:'Jz1',body:'#9a99cc',paper:'#efebdb',ink:'#2c2454',accent:'#9586c2',clear:true,layout:8,minutes:'46'},
  {brand:'TEAC',model:'SOUND',body:'#d485a2',paper:'#e9cdd9',ink:'#552745',accent:'#ab326c',clear:true,layout:9,minutes:'52'},
  {brand:'Scotch',model:'MASTER I',body:'#b4b9ad',paper:'#e9ddbe',ink:'#384e52',accent:'#8daaa5',clear:true,layout:4,minutes:'90',note:'Dream / the end'},
  {brand:'NATIONAL',model:'RT',body:'#ded8c3',paper:'#f0e9cc',ink:'#3b3527',accent:'#be9a46',clear:false,layout:0,minutes:'60'},
  {brand:'PIONEER',model:'METAL',body:'#435664',paper:'#dee4e3',ink:'#1d3448',accent:'#83b6c8',clear:true,layout:11,minutes:'90'},
]
export const cassetteEdition = (index: number) => cassetteEditions[((index % cassetteEditions.length) + cassetteEditions.length) % cassetteEditions.length]

/** Label only: clear window leaves real reels and the tape mechanism visible. */
export function drawCassetteLabel(ctx: CanvasRenderingContext2D, index: number) {
  const d = cassetteEdition(index), W=1000, H=630
  ctx.save(); ctx.scale(ctx.canvas.width / W, ctx.canvas.height / H)
  ctx.clearRect(0,0,W,H)
  ctx.save(); ctx.beginPath(); ctx.roundRect(55,45,890,420,24); ctx.clip()
  ctx.fillStyle=d.paper; ctx.fillRect(55,45,890,420)
  const text=(s:string,x:number,y:number,size:number,color=d.ink,font='Arial',weight='700')=>{ctx.fillStyle=color;ctx.font=`${weight} ${size}px ${font}`;ctx.fillText(s,x,y)}
  const rules=(x:number,y:number,w:number,n=3)=>{ctx.strokeStyle=d.ink;ctx.lineWidth=1.8;for(let i=0;i<n;i++){ctx.beginPath();ctx.moveTo(x,y+i*29);ctx.lineTo(x+w,y+i*29);ctx.stroke()}}
  switch(d.layout) {
    case 0:
      rules(70,85,860,12);ctx.fillStyle=d.accent;ctx.fillRect(310,45,390,420)
      ctx.save();ctx.translate(324,0);ctx.scale(1.08,1);text(d.brand,0,132,77,d.paper,'Arial Black, Arial','900');ctx.restore()
      ctx.strokeStyle=d.paper;ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(363,145);ctx.lineTo(654,145);ctx.lineTo(632,194);ctx.lineTo(341,194);ctx.closePath();ctx.stroke()
      text('Compact',387,168,25,d.paper,'CassetteHand, cursive','400');text('Cassette',400,190,25,d.paper,'CassetteHand, cursive','400');text(`C-${d.minutes}`,330,444,85,'#111a1e','Arial Black, Arial','900');text('INDEX',75,80,22);text('A',860,120,58,d.accent);break
    case 1:
      ctx.fillStyle='#111a19';ctx.fillRect(55,195,890,270);rules(85,90,780,3);text('NR',765,158,17);text('ON / OFF',765,184,15)
      ctx.fillStyle=d.accent;ctx.fillRect(55,385,330,80);text(d.brand,80,440,42,'#12241b');text(`${d.model}/${d.minutes}`,590,445,61,'#f2f0d8');text('A',80,177,44);text('NORMAL POSITION · MADE IN JAPAN',370,205,17,'#e5e9db');break
    case 2:
      ctx.clearRect(55,45,890,420);ctx.fillStyle=d.paper;ctx.fillRect(70,58,860,64);text('Title',85,104,30,d.accent,'Georgia');text('B',75,190,48,d.accent,'Georgia');text('POSITION: NORMAL',590,170,24,d.accent,'Georgia');text(d.model,695,235,66,d.accent,'Georgia');text(d.minutes,790,409,62,d.accent,'Georgia');text(d.brand,668,451,41,d.paper,'Times New Roman','900');text('Position IEC I / Type I  Normal Bias 120µs EQ',530,192,16,d.paper);text('•   •   •',560,410,24,d.paper);break
    case 3:
      ctx.fillStyle=d.accent;ctx.fillRect(55,180,890,195);text(d.brand,85,131,88,d.ink,'Times New Roman','900');text(d.model,690,130,68);text(d.model==='C-1K'?'Cleaning Cassette / Cassette de Nettoyage':'HIGH FIDELITY · LOW NOISE',86,173,25);text('To clean the heads: Run both sides of this cassette',85,416,23);text('through the recorder in playback mode.',85,446,23);break
    case 4:
      ctx.fillStyle=d.accent;ctx.fillRect(55,205,890,190);rules(195,89,705,3);text('SIDE NO.',74,83,18);text('SUBJECT',199,80,17);text('2',85,146,47);text(`C-${d.minutes}`,798,276,38);text(d.brand,77,444,38);text(d.model,290,443,23);if(d.note)text(d.note,214,157,44,'#304c65','CassetteHand, cursive','400');break
    case 5:
      text('SIDE',775,108,25);text('2',805,180,80);text('STEREO · ORIGINAL RECORDING',91,103,23);text(d.brand,92,417,42);text('SOUND ARCHIVE  /  LIMITED EDITION',95,447,19);break
    case 6:
      ctx.fillStyle=d.accent;ctx.fillRect(55,205,890,260);rules(210,106,670,2);text('○',80,166,108,d.ink,'Arial','400');text(d.brand,75,425,49,d.ink);text(d.model,270,425,46,d.ink);text('HIGH DYNAMIC   AGFA-GEVAERT   Made in Germany',80,454,20);ctx.fillStyle=d.paper;ctx.fillRect(809,222,107,132);text(d.minutes,816,326,95,'#101b22','Impact, Arial Narrow');
      if(d.brand==='AGFA') {ctx.fillStyle='#17265b';ctx.fillRect(65,215,142,146);ctx.strokeStyle='#eee4c6';ctx.lineWidth=1.5;for(let r=10;r<140;r+=14){ctx.beginPath();ctx.arc(92,340,r,0,Math.PI*2);ctx.stroke()}ctx.fillStyle='#e8522d';ctx.beginPath();ctx.moveTo(75,251);ctx.lineTo(146,228);ctx.lineTo(190,259);ctx.lineTo(121,287);ctx.closePath();ctx.fill();text('Agfa',106,266,25,'#fff4d6','CassetteHand, cursive','400')};break
    case 7:
      ctx.fillStyle='#111c24';ctx.fillRect(55,365,890,100);ctx.fillStyle=d.accent;ctx.beginPath();ctx.moveTo(430,465);ctx.lineTo(530,365);ctx.lineTo(740,365);ctx.lineTo(640,465);ctx.fill();text(d.brand,75,437,47,'#f4efda');text(d.model,576,438,48,'#eadac8');text(d.minutes,805,438,54,'#eee5d1');rules(90,105,800,2);text(d.note||'STEREO  /  LOW NOISE',96,155,35,'#263437','CassetteHand, cursive','500');break
    case 8:
      ctx.fillStyle=d.accent;ctx.beginPath();ctx.moveTo(55,196);ctx.lineTo(945,126);ctx.lineTo(945,350);ctx.lineTo(55,420);ctx.fill();text(d.brand,80,112,57,d.ink,'Arial Black, Arial','900');text('NORMAL POSITION  AXIA’S STABLE TAPE RUNNING MECHANISM',80,70,16);text(d.model,430,227,73,d.paper,'Georgia');text('A',870,208,53,d.paper);text(d.minutes,850,332,49,d.paper);rules(80,421,830,2);ctx.strokeStyle=d.paper;for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(540,250+i*12);ctx.lineTo(635,250+i*12);ctx.lineTo(690,195+i*12);ctx.lineTo(830,195+i*12);ctx.stroke()}break
    case 9:
      ctx.clearRect(55,45,890,420);ctx.strokeStyle=d.paper;ctx.lineWidth=3;ctx.strokeRect(60,55,880,105);text(d.brand,315,137,85,'#eef0cd','Georgia');text('type I',70,285,28);text('a',475,230,84);text(d.model,735,275,49);text('superferro   normal position 120µs eq',225,435,23);text(d.minutes+' min',777,437,30);break
    case 10:
      text(d.brand,75,105,30);text(d.model,310,144,71);text(d.minutes,310,192,54,d.paper);rules(485,115,410,2);ctx.strokeStyle=d.accent;ctx.lineWidth=15;ctx.beginPath();ctx.roundRect(125,315,730,130,60);ctx.stroke();text('2 × 45 MIN.  LOW-NOISE SPECIAL',100,444,30);break
    default:
      ctx.fillStyle=d.accent;ctx.fillRect(55,193,890,185);ctx.strokeStyle=d.ink;ctx.lineWidth=8;for(let i=0;i<7;i++){ctx.beginPath();ctx.ellipse(500,285,210+i*36,130,0,0,Math.PI*2);ctx.stroke()}text(d.model,383,136,66);rules(80,107,260,2);rules(685,107,230,2);text(d.brand,280,441,53);text('2 × 45 Min.',760,438,23);break
  }
  if (![2,9].includes(d.layout)) {
    ctx.strokeStyle='rgba(64,58,40,.28)';ctx.lineWidth=.75;ctx.beginPath();ctx.roundRect(55.5,45.5,889,419,23);ctx.stroke()
  }
  ctx.restore()
  // Die-cut aperture in the paper, separate from the acrylic face and hubs.
  ctx.save();ctx.globalCompositeOperation='destination-out';ctx.beginPath();ctx.roundRect(230,225,540,135,60);ctx.fill();ctx.restore()
  ctx.fillStyle=d.clear?'#eee9d8':'#303734';ctx.font='16px monospace';ctx.fillText(`A  /  ${String(index+1).padStart(2,'0')}       NORMAL POSITION · 120µs`,100,490)
  let seed=index+52;const rand=()=>{seed=seed*16807%2147483647;return seed/2147483647}
  ctx.save();ctx.globalCompositeOperation='source-atop';for(let i=0;i<7800;i++){ctx.fillStyle=rand()>.5?'rgba(255,255,255,.07)':'rgba(20,20,10,.045)';ctx.fillRect(rand()*1000,rand()*630,.25+rand()*.65,.35)}ctx.restore()
  ctx.restore()
}
const previews = new Map<number,string>()
export function cassettePreview(index:number) {
  if(previews.has(index)) return previews.get(index)!
  const c=document.createElement('canvas');c.width=1000;c.height=630;const ctx=c.getContext('2d')!,d=cassetteEdition(index)
  ctx.fillStyle=d.body;ctx.beginPath();ctx.roundRect(6,6,988,618,38);ctx.fill()
  ctx.strokeStyle='#ebeee5';ctx.lineWidth=5;ctx.stroke();ctx.fillStyle='#202522';ctx.beginPath();ctx.roundRect(205,209,590,170,70);ctx.fill()
  for(const x of [312,688]){ctx.fillStyle='#d9e0d5';ctx.beginPath();ctx.arc(x,294,61,0,Math.PI*2);ctx.fill();ctx.fillStyle='#253238';ctx.beginPath();ctx.arc(x,294,40,0,Math.PI*2);ctx.fill();for(let j=0;j<6;j++){ctx.save();ctx.translate(x,294);ctx.rotate(j*Math.PI/3);ctx.fillStyle='#d9e0d5';ctx.fillRect(-7,-43,14,15);ctx.restore()}}
  const label=document.createElement('canvas');label.width=1000;label.height=630;drawCassetteLabel(label.getContext('2d')!,index);ctx.drawImage(label,0,0)
  ctx.strokeStyle='#dde9e7';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(155,615);ctx.lineTo(185,505);ctx.lineTo(815,505);ctx.lineTo(845,615);ctx.stroke()
  for(const x of [35,965])for(const y of [35,595]){ctx.fillStyle='#727c7c';ctx.beginPath();ctx.arc(x,y,14,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#202c2d';ctx.beginPath();ctx.moveTo(x-8,y+8);ctx.lineTo(x+8,y-8);ctx.stroke()}
  for(const x of [245,350,650,755]){ctx.fillStyle='#263336';ctx.beginPath();ctx.arc(x,578,15,0,Math.PI*2);ctx.fill()}
  const result=c.toDataURL('image/png');previews.set(index,result);return result
}
