-- =====================================================================
-- Removes everything dev_seed.sql created (rows starting with "[seed] ").
-- Run in the Supabase SQL editor.
-- Comments go first so their triggers update posts that still exist;
-- deleting posts cascades to poll_options, reactions, votes and trending.
-- =====================================================================
begin;

delete from public.comments      where body  like '[seed] %';
delete from public.posts         where body  like '[seed] %';
delete from public.announcements where title like '[seed] %';

commit;

-- post_number_seq is not rewound, so the next real post continues after the
-- seeded numbers. Only on a database with NO real posts, you may reset it:
-- select setval('public.post_number_seq', coalesce((select max(number) from public.posts), 0) + 1, false);
