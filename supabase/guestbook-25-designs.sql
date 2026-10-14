-- Run once in Supabase SQL Editor on the existing guestbook project.
-- Safe to rerun. Expands design IDs only; preserves all messages and deletion keys.
-- guestbook.sql must already be installed. For creation/deletion RPCs, also run
-- guestbook-delete.sql if you have not installed it yet.
begin;
alter table public.guestbook_entries
  drop constraint if exists guestbook_entries_paper_check;
alter table public.guestbook_entries
  add constraint guestbook_entries_paper_check check (paper between 0 and 24);
notify pgrst, 'reload schema';
commit;
