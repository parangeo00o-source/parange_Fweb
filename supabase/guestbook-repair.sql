-- CURRENT COMPLETE SETUP / REPAIR: run this entire file in Supabase SQL Editor.
-- Works with a new database or any of the earlier guestbook migrations.
-- Safe to rerun: existing postcards and their deletion keys are preserved.
-- No secret key, new server, or frontend fallback is needed.
begin;

create table if not exists public.guestbook_entries (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  message text not null check (char_length(btrim(message)) between 1 and 500),
  paper smallint not null default 0 check (paper between 0 and 24),
  created_at timestamptz not null default now()
);
create index if not exists guestbook_entries_newest_idx
  on public.guestbook_entries (created_at desc, id desc);
alter table public.guestbook_entries drop constraint if exists guestbook_entries_paper_check;
alter table public.guestbook_entries add constraint guestbook_entries_paper_check
  check (paper between 0 and 24);

alter table public.guestbook_entries enable row level security;
revoke all on public.guestbook_entries from public, anon, authenticated;
-- Column-level grants from the original setup survive table-level REVOKE.
revoke insert (id, name, message, paper) on public.guestbook_entries from public, anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.guestbook_entries to anon, authenticated;
drop policy if exists "Anyone can read postcards" on public.guestbook_entries;
create policy "Anyone can read postcards"
  on public.guestbook_entries for select to anon, authenticated using (true);
drop policy if exists "Anyone can leave a postcard" on public.guestbook_entries;

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
declare inserted_id uuid;
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

revoke all on function public.create_guestbook_postcard(uuid, text, text, integer, text) from public, anon, authenticated;
revoke all on function public.delete_guestbook_postcard(uuid, text) from public, anon, authenticated;
grant execute on function public.create_guestbook_postcard(uuid, text, text, integer, text) to anon, authenticated;
grant execute on function public.delete_guestbook_postcard(uuid, text) to anon, authenticated;
notify pgrst, 'reload schema';
commit;

-- Existing entries without deletion keys remain administrator-managed.
-- Public posting is not spam protection; moderate in Supabase Table Editor.
