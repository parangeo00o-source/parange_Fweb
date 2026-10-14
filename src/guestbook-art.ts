// 25 independently generated vintage prints. IDs are stable database values.
// Vite emits hashed, base-path-safe URLs for GitHub Pages; full artwork is only
// requested by the preview/reader, while cabinets use lightweight thumbnails.
export const printNames = [
  "Teddy Greetings",
  "Letter Kitten",
  "Birthday Pup",
  "Starlight Wishes",
  "Forget Me Not",
  "Wishes Express",
  "Patchwork Puppy",
  "Postal Archive",
  "Teddy Hello",
  "Clover Letter",
  "Midnight Lace",
  "Rabbit Post",
  "Summer Lake",
  "Lemon Post",
  "Post Post Post",
  "Mouse Messenger",
  "Bluebird Ribbon",
  "Strawberry Picnic",
  "Violet Keepsake",
  "Kitten Tea",
  "Lucky Clover",
  "Butterfly Cabinet",
  "Seaside Hello",
  "Rose Envelope",
  "Moonlit Teddy"
] as const
export const POSTCARD_DESIGN_COUNT = printNames.length
const thumbnails = import.meta.glob<string>('./assets/guestbook/vintage-v1/thumb-*.jpg', { eager: true, query: '?url', import: 'default' })
const originals = import.meta.glob<string>('./assets/guestbook/vintage-v1/card-*.jpg', { eager: true, query: '?url', import: 'default' })
export function postcardArtwork(paper: number, full = false) {
  const index = Number.isInteger(paper) && paper >= 0 && paper < POSTCARD_DESIGN_COUNT ? paper : 0
  const number = String(index + 1).padStart(2, '0')
  const collection = full ? originals : thumbnails
  const src = collection[`./assets/guestbook/vintage-v1/${full ? 'card' : 'thumb'}-${number}.jpg`]
  return `<img src="${src}" alt="${printNames[index]} vintage postcard" width="640" height="960" loading="${full ? 'eager' : 'lazy'}" decoding="async" draggable="false">`
}
