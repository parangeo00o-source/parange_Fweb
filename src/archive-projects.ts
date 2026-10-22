export type ArchiveProject = {
  id: string
  title: string
  artwork: number
  group?: string
  // A post's Share → Copy link URL, not the account's profile URL.
  instagramUrl: string | null
  preview?: boolean
}

export const instagramProfile = 'https://www.instagram.com/parange.oo/'

// Related posts stay consecutive. Drawer packing keeps each project group together.
export const archiveProjects: ArchiveProject[] = [
  { id: '01', title: 'parange F.web', artwork: 0, instagramUrl: 'https://www.instagram.com/p/Def-k32FIrW/?img_index=1' },
  { id: '02', title: 'Louis Vuitton Dosan Pop-up', artwork: 1, instagramUrl: 'https://www.instagram.com/p/Dd_NkxCAqx6/' },
  { id: '03', title: 'Coloso_chapter3.Bucketlist', group: 'coloso', artwork: 2, instagramUrl: 'https://www.instagram.com/p/DYEGW9wmVZm/?img_index=1' },
  { id: '04', title: 'Coloso_chapter2.Playlist', group: 'coloso', artwork: 3, instagramUrl: 'https://www.instagram.com/p/DYEHTmYlOx0/?img_index=1' },
  { id: '05', title: 'Coloso_chapter1.Wishlist', group: 'coloso', artwork: 4, instagramUrl: 'https://www.instagram.com/p/DXyaT4OAjcH/' },
  { id: '06', title: 'Coloso_Plus', group: 'coloso', artwork: 5, instagramUrl: 'https://www.instagram.com/p/DY-gtx4k4Jf/?img_index=1' },
  { id: '07', title: 'DailyDirection 01', group: 'daily-direction', artwork: 6, instagramUrl: 'https://www.instagram.com/p/DVHG3nLEnY0/' },
  { id: '15', title: 'DailyDirection 02', group: 'daily-direction', artwork: 14, instagramUrl: 'https://www.instagram.com/p/DVHIsHUE096/?img_index=1' },
  { id: '16', title: 'DailyDirection 03', group: 'daily-direction', artwork: 15, instagramUrl: 'https://www.instagram.com/p/DVLfaEkj-Gd/?img_index=1' },
  { id: '08', title: 'FIFTY FIFTY ‘Imperfect-I’mperfect’ Highlight Medley', artwork: 7, instagramUrl: 'https://www.instagram.com/p/DY4qHcFARs4/' },
  { id: '09', title: 'closeyoureyes 01', group: 'close-your-eyes', artwork: 8, instagramUrl: 'https://www.instagram.com/p/DeDqZOpFG0m/?img_index=1' },
  { id: '10', title: 'closeyoureyes 02', group: 'close-your-eyes', artwork: 9, instagramUrl: 'https://www.instagram.com/p/DeDqhEWlMpP/?img_index=1' },
  { id: '11', title: 'closeyoureyes 03', group: 'close-your-eyes', artwork: 10, instagramUrl: 'https://www.instagram.com/p/DeDqvHPlPy2/?img_index=1' },
  { id: '12', title: 'waters of march 01', artwork: 11, instagramUrl: 'https://www.instagram.com/p/DKbow8Av6Fh/' },
  { id: '13', title: 'parange cell', artwork: 12, instagramUrl: 'https://www.instagram.com/p/C1zqGXPPDVz/' },
  { id: '14', title: 'jellyframe', artwork: 13, instagramUrl: 'https://www.instagram.com/p/DJjHDUsv1e2/' },
  { id: '17', title: 'Xdinary Heroes 9th Mini Album <IMPULSE> Highlight Sampler', artwork: 16, instagramUrl: 'https://www.instagram.com/p/DeLb1wZFJBe/?img_index=1' },
  { id: '18', title: 'NUFLAAT', artwork: 17, instagramUrl: 'https://www.instagram.com/p/DONmcavjxdd/?img_index=1' },
  { id: '19', title: '2026 KISS OF LIFE IDENTITY FILM', artwork: 18, instagramUrl: 'https://www.instagram.com/p/DTGN7LOEh1W/' },
  { id: '20', title: 'Maybe Your Dream is…The End of the World too!', artwork: 19, instagramUrl: 'https://www.instagram.com/p/DWvnTJRlLs9/?img_index=1' },
  { id: '21', title: 'hearttiramisu', artwork: 20, instagramUrl: 'https://www.instagram.com/p/DVJjvKNEuEV/' },
  { id: '22', title: 'personal work', artwork: 21, instagramUrl: 'https://www.instagram.com/p/DKL9vBDPiMg/' },
  { id: '23', title: 'NMIXX “See that?” M/V', group: 'nmixx-see-that', artwork: 22, instagramUrl: 'https://www.instagram.com/p/C-2h9o9vq1F/' },
  { id: '24', title: 'NMIXX “See that?” 01', group: 'nmixx-see-that', artwork: 23, instagramUrl: 'https://www.instagram.com/p/C-2ilgPP46n/?img_index=1' },
  { id: '25', title: 'NMIXX “See that?” 02', group: 'nmixx-see-that', artwork: 24, instagramUrl: 'https://www.instagram.com/p/C-2ixSpv0yK/?img_index=1' },
  { id: '26', title: "NCT 127 4TH TOUR 'NEO CITY - THE MOMENTUM'", artwork: 25, instagramUrl: 'https://www.instagram.com/p/DB-eKXzv3Gc/?img_index=1' },
  { id: '27', title: 'Incheon Pentaport Music Festival 2025', artwork: 26, instagramUrl: 'https://www.instagram.com/p/DG5AganvIvM/' },
  { id: '28', title: 'oiad brand film 01', group: 'oiad', artwork: 27, instagramUrl: 'https://www.instagram.com/p/DHc2C1gviq9/' },
  { id: '29', title: 'oiad brand film 02', group: 'oiad', artwork: 28, instagramUrl: 'https://www.instagram.com/p/DHc2zEfPAAd/?img_index=1' },
]

// Pack consecutive groups as a unit, leaving room in the previous drawer when
// needed. Oversized future groups can span drawers without dropping any posts.
export function projectDrawers(projects: ArchiveProject[], size = 12): ArchiveProject[][] {
  const groups: ArchiveProject[][] = []
  for (const project of projects) {
    const last = groups.at(-1)
    if (project.group && last?.[0].group === project.group) last.push(project)
    else groups.push([project])
  }
  const drawers: ArchiveProject[][] = [[]]
  for (const group of groups) {
    if (drawers.at(-1)!.length && drawers.at(-1)!.length + group.length > size) drawers.push([])
    for (const project of group) {
      if (drawers.at(-1)!.length === size) drawers.push([])
      drawers.at(-1)!.push(project)
    }
  }
  return drawers
}

export function instagramPostUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.port || !['instagram.com', 'www.instagram.com'].includes(url.hostname)) return null
    if (!/^\/(p|reel|tv)\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) return null
    const slide = url.searchParams.get('img_index')
    const query = slide && /^[1-9]\d*$/.test(slide) ? `?img_index=${slide}` : ''
    return `${url.origin}${url.pathname}${query}`
  } catch { return null }
}
