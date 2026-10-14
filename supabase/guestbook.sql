-- LEGACY initial migration. For the current app, run guestbook-repair.sql ONLY.
-- Kept for migration regression tests; this file alone does not enable RPC saves.
-- This only creates the new guestbook table; existing project data is untouched.
begin;

create table public.guestbook_entries (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  message text not null check (char_length(btrim(message)) between 1 and 500),
  paper smallint not null default 0 check (paper between 0 and 5),
  created_at timestamptz not null default now()
);

create index guestbook_entries_newest_idx
  on public.guestbook_entries (created_at desc, id desc);

alter table public.guestbook_entries enable row level security;
revoke all on public.guestbook_entries from anon, authenticated;
grant select on public.guestbook_entries to anon, authenticated;
-- Visitors cannot supply a date, edit other postcards, or delete records.
grant insert (id, name, message, paper) on public.guestbook_entries to anon, authenticated;

create policy "Anyone can read postcards"
  on public.guestbook_entries for select to anon, authenticated using (true);
create policy "Anyone can leave a postcard"
  on public.guestbook_entries for insert to anon, authenticated with check (true);

commit;

-- This is a public, no-login guestbook. RLS prevents edits/deletes, NOT spam.
-- Moderate unwanted entries in the Supabase Dashboard. For a public campaign,
-- add a Supabase Edge Function with CAPTCHA verification / server rate limiting
-- and revoke direct INSERT before opening it to high-volume traffic.
