type C=CanvasRenderingContext2D
/** Porcelain/paper lighting shared by the sea and garden. Painted underneath
 * inhabitants, with no blur filters, extra canvas or animation loop. */
export function globePaint(c:C,x:number,y:number,r:number,kind:'sea'|'grass'|'light'){
  const g=c.createRadialGradient(x-r*.34,y-r*.42,r*.025,x,y,r*1.08)
  const stops:readonly [number,string][]=kind==='sea'
    ?[[0,'#f0ffef'],[.35,'#d0f3df'],[.7,'#8bd8d8'],[.92,'#78b8cf'],[1,'#b3a5d3']]
    :kind==='grass'?[[0,'#faf6cb'],[.3,'#e8edb8'],[.65,'#c5dfa8'],[.86,'#a3cbb1'],[1,'#9db8c2']]
    :[[0,'#fff9dd24'],[.52,'#fff7e000'],[.78,'#6c598408'],[.94,'#76658a29'],[1,'#ece5ff6b']]
  for(const [at,color] of stops)g.addColorStop(at,color)
  return g
}
