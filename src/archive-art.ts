import { cassettePreview } from './archive-cassette-art'
/** Native cassette preview used by accessible links and the WebGL fallback. */
export function archiveArtwork(index: number): string {
  return `<img src="${cassettePreview(index)}" width="1000" height="630" alt="" decoding="async" draggable="false">`
}
