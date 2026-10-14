-- Run AFTER guestbook.sql in Supabase SQL Editor. Safe to re-run.
-- Deployment: publish the matching frontend and run this entire file together.
-- The new frontend requires these RPCs; the old frontend's direct inserts are
-- intentionally revoked. Do NOT rerun guestbook.sql on an existing table.
-- Keep browser/site data: deleting it loses the browser's private deletion keys.
-- Keys are origin-specific (localhost and GitHub Pages do not share them).
-- Existing postcards are preserved. They have no deletion keys and remain
-- administrator-managed in Table Editor; we never infer ownership from a name.
begin;

create schema if not exists guestbook_private;
revoke all on schema guestbook_private from public, anon, authenticated;
create table if not exists guestbook_private.postcard_keys (
  entry_id uuid primary key references public.guestbook_entries(id) on delete cascade,
  key_hash bytea not null
);
alter table guestbook_private.postcard_keys enable row level security;
revoke all on guestbook_private.postcard_keys from public, anon, authenticated;

create or replace function public.create_guestbook_postcard(
  p_id uuid, p_name text, p_message text, p_paper integer, p_delete_key text
) returns setof public.guestbook_entries
language plpgsql security definer set search_path = '' as $$
declare
  inserted_id uuid;
begin
  if p_delete_key is null or p_delete_key !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid deletion key' using errcode = '22023';
  end if;
  insert into public.guestbook_entries(id, name, message, paper)
    values (p_id, btrim(p_name), btrim(p_message), p_paper)
    on conflict (id) do nothing returning id into inserted_id;
  if inserted_id is not null then
    insert into guestbook_private.postcard_keys(entry_id, key_hash)
      values (inserted_id, sha256(convert_to(p_delete_key, 'UTF8')));
  elsif not exists (
    select 1 from guestbook_private.postcard_keys
    where entry_id = p_id and key_hash = sha256(convert_to(p_delete_key, 'UTF8'))
  ) then
    raise exception 'Postcard ownership could not be verified' using errcode = '42501';
  end if;
  -- A retry with the same id and key returns the first saved postcard.
  return query select * from public.guestbook_entries where id = p_id;
end;
$$;

create or replace function public.delete_guestbook_postcard(p_id uuid, p_delete_key text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare removed_id uuid;
begin
  if p_delete_key is null or p_delete_key !~ '^[a-f0-9]{64}$' then
    return false;
  end if;
  delete from public.guestbook_entries e using guestbook_private.postcard_keys k
    where e.id = p_id and k.entry_id = e.id
      and k.key_hash = sha256(convert_to(p_delete_key, 'UTF8'))
    returning e.id into removed_id;
  return removed_id is not null;
end;
$$;

-- All new posts go through the atomic create function; keys cannot be claimed
-- later for an existing postcard. Public reads remain unchanged.
drop policy if exists "Anyone can leave a postcard" on public.guestbook_entries;
revoke insert on public.guestbook_entries from public, anon, authenticated;
revoke insert (id, name, message, paper) on public.guestbook_entries from public, anon, authenticated;
revoke update, delete on public.guestbook_entries from public, anon, authenticated;
revoke all on function public.create_guestbook_postcard(uuid, text, text, integer, text) from public, anon, authenticated;
revoke all on function public.delete_guestbook_postcard(uuid, text) from public, anon, authenticated;
grant execute on function public.create_guestbook_postcard(uuid, text, text, integer, text) to anon, authenticated;
grant execute on function public.delete_guestbook_postcard(uuid, text) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
