// Isolated Postgres test: never connects to the live Supabase database.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const key = 'a'.repeat(64), other = 'b'.repeat(64)
const id = '00000000-0000-4000-8000-000000000001'
const legacy = '00000000-0000-4000-8000-000000000002'
const repair = await readFile('supabase/guestbook-repair.sql', 'utf8')
for (const setup of ['original-table-only', 'previous-migrations', 'fresh']) {
 const db = new PGlite()
 try {
  await db.exec('create role anon; create role authenticated; grant usage on schema public to anon, authenticated;')
  if (setup === 'fresh') await db.exec(repair)
  else await db.exec(await readFile('supabase/guestbook.sql', 'utf8'))
  await db.query('insert into public.guestbook_entries(id,name,message) values($1,$2,$3)', [legacy, 'Existing visitor', 'Preserve me'])
  if (setup === 'previous-migrations') {
  const migration = await readFile('supabase/guestbook-delete.sql', 'utf8')
  await db.exec(migration)
  await db.exec(migration)
  const designs = await readFile('supabase/guestbook-25-designs.sql', 'utf8')
  await db.exec(designs)
  await db.exec(designs)
  }
  await db.exec(repair)
  await db.exec(repair)
  await db.exec('set role anon')
  await assert.rejects(db.query('select * from guestbook_private.postcard_keys'), /permission denied/)
  await assert.rejects(db.query("insert into public.guestbook_entries(id,name,message,paper) values(gen_random_uuid(),'x','y',0)"), /permission denied/)
  await assert.rejects(db.query('delete from public.guestbook_entries'), /permission denied/)
  await assert.rejects(db.query("update public.guestbook_entries set name='x'"), /permission denied/)
  const create = (entryId, secret, name = 'Visitor') => db.query('select * from public.create_guestbook_postcard($1,$2,$3,$4,$5)', [entryId, name, 'Hello', 3, secret])
  assert.equal((await create(id, key)).rows[0].name, 'Visitor')
  // Repair must preserve both an existing entry and its private ownership hash.
  await db.exec('reset role')
  await db.exec(repair)
  await db.exec('set role anon')
  assert.equal((await create(id, key, 'Retry')).rows[0].name, 'Visitor')
  await assert.rejects(create(id, other), /ownership/)
  await assert.rejects(create(legacy, key), /ownership/)
  await assert.rejects(create(crypto.randomUUID(), 'bad'), /Invalid deletion key/)
  await assert.rejects(create(crypto.randomUUID(), key, ''), /check constraint/)
  const remove = async (entryId, secret) => (await db.query('select public.delete_guestbook_postcard($1,$2) as removed', [entryId, secret])).rows[0].removed
  assert.equal(await remove(id, other), false)
  assert.equal(await remove(legacy, key), false)
  assert.equal(await remove(id, key), true)
  assert.equal(await remove(id, key), false)
  for (let paper = 0; paper < 25; paper++) {
    const entryId = crypto.randomUUID()
    const result = await db.query('select * from public.create_guestbook_postcard($1,$2,$3,$4,$5)', [entryId, 'Collection test', 'Hello', paper, key])
    assert.equal(result.rows[0].paper, paper)
    assert.equal(await remove(entryId, key), true)
  }
  for (const paper of [-1, 25]) await assert.rejects(db.query('select * from public.create_guestbook_postcard($1,$2,$3,$4,$5)', [crypto.randomUUID(), 'Invalid', 'Hello', paper, key]), /check constraint/)
  assert.deepEqual((await db.query('select id from public.guestbook_entries')).rows, [{ id: legacy }])
  await db.exec('reset role')
  assert.equal((await db.query('select count(*)::integer as count from guestbook_private.postcard_keys')).rows[0].count, 0)
  console.log(`PASS (${setup}): repair rerun, all 25 designs, out-of-range rejection, public reads, atomic creation, retry, private hashes, no direct writes, ownership rejection, deletion, cascade, legacy preservation`)
 } finally { await db.close() }
}
