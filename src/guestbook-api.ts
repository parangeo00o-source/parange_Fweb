// This is a browser-safe publishable key, not a secret/service_role key.
// Reads use RLS; writes use the capability-checked functions installed by
// supabase/guestbook-repair.sql (complete, rerunnable setup).
const projectUrl = (import.meta.env.VITE_SUPABASE_URL || 'https://cfvfdrbnmscvwlfaxirc.supabase.co').replace(/\/$/, '')
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_cDt13hNWy6pXWWAdzTMiCw_VVk95QpH'
export const DRAWER_SIZE = 25
export type Postcard = { id: string; name: string; message: string; paper: number; created_at: string }
export type PostcardDraft = Omit<Postcard, 'created_at'>

async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(`${projectUrl}/rest/v1/${path}`, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(15000),
      headers: { apikey: publishableKey, 'Content-Type': 'application/json', ...init.headers },
    })
  } catch (error) {
    if (init.signal?.aborted) throw error
    throw new Error('The connection was interrupted. Please try again. Your words are still here.')
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    if (body.code === 'PGRST205') throw new Error('The guestbook database needs setup. Please ask the owner to run guestbook-repair.sql in Supabase.')
    if (body.code === 'PGRST202') throw new Error('The postcard saving or deletion function is missing from the database API. Please ask the owner to run guestbook-repair.sql in Supabase, then try again. Your words are still here.')
    if (body.code === '23514' && String(body.message).includes('guestbook_entries_paper_check')) throw new Error('The postcard collection needs a database update. Please ask the owner to run guestbook-repair.sql in Supabase. Your words are still here.')
    if (response.status === 401 || response.status === 403) throw new Error('The guestbook access settings need attention. Please check the Supabase public key and RLS permissions.')
    if (response.status === 429) throw new Error('A few too many requests. Please try again in a moment.')
    throw new Error('We could not process your postcard. Please try again.')
  }
  return response.json()
}

function postcards(rows: unknown): Postcard[] {
  if (!Array.isArray(rows)) throw new Error('The guestbook returned an unexpected response.')
  return rows.filter((row): row is Postcard => typeof row?.id === 'string' && typeof row.name === 'string'
    && typeof row.message === 'string' && typeof row.created_at === 'string' && Number.isInteger(row.paper) && row.paper >= 0 && row.paper <= 24)
}

export async function loadPostcards(page: number, signal?: AbortSignal) {
  const rows = postcards(await request(`guestbook_entries?select=id,name,message,paper,created_at&order=created_at.desc,id.desc&offset=${page * DRAWER_SIZE}&limit=${DRAWER_SIZE + 1}`, { signal }))
  return { entries: rows.slice(0, DRAWER_SIZE), hasNext: rows.length > DRAWER_SIZE }
}

export async function savePostcard(draft: PostcardDraft) {
  // Persist the 256-bit capability BEFORE sending; a lost response can be
  // retried without losing ownership. Never send it in a URL or public row.
  let key = deletionKey(draft.id)
  if (!key) {
    key = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('')
    try { localStorage.setItem(keyPrefix + draft.id, key) }
    catch { throw new Error('Allow browser storage to keep your private deletion key before posting.') }
  }
  const rows = postcards(await request('rpc/create_guestbook_postcard', {
    method: 'POST', body: JSON.stringify({ p_id: draft.id, p_name: draft.name, p_message: draft.message, p_paper: draft.paper, p_delete_key: key }),
  }))
  if (!rows[0]) throw new Error('We could not confirm your postcard was saved. Please try again.')
  return rows[0]
}

const keyPrefix = 'parange:guestbook:delete:'
function deletionKey(id: string) {
  try { const value = localStorage.getItem(keyPrefix + id); return value && /^[a-f0-9]{64}$/.test(value) ? value : null }
  catch { return null }
}
export const canDeletePostcard = (id: string) => deletionKey(id) !== null

export async function deletePostcard(id: string) {
  const key = deletionKey(id)
  if (!key) throw new Error('This browser does not have the private key for this postcard.')
  const removed = await request('rpc/delete_guestbook_postcard', { method: 'POST', body: JSON.stringify({ p_id: id, p_delete_key: key }) })
  if (removed !== true) throw new Error('This postcard was already removed, or its deletion key could not be verified.')
  try { localStorage.removeItem(keyPrefix + id) } catch { /* The server deletion already succeeded. */ }
}
