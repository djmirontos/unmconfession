-- =====================================================================
-- feed_events: a tiny "a post just became visible" signal for Realtime.
--
-- Why: the app used to listen to changes on public.posts. That table also
-- changes on every reaction and comment (the counters live there), so each
-- reaction was pushed to every open phone. Now phones listen only to
-- feed_events, which gets one row when a post becomes visible:
--   * published straight away, or
--   * approved by a moderator (pending -> published), or
--   * restored (removed/rejected -> published).
-- public.posts is removed from the Realtime publication.
-- =====================================================================

create table public.feed_events (
  id          bigint generated always as identity primary key,
  post_id     uuid not null references public.posts (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index feed_events_created_idx on public.feed_events (created_at);

alter table public.feed_events enable row level security;

-- The row holds only a post id and a time, and the post is public once
-- published, so a plain "true" keeps Realtime's per-subscriber check cheap.
create policy feed_events_read on public.feed_events
  for select to anon, authenticated using (true);

revoke all on public.feed_events from anon, authenticated;
grant select on public.feed_events to anon, authenticated;

create function public.posts_publish_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'published'
     and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    insert into public.feed_events (post_id) values (new.id);
  end if;
  return null;
end $$;

revoke execute on function public.posts_publish_event() from public, anon, authenticated;

create trigger posts_publish_event
  after insert or update of status on public.posts
  for each row execute function public.posts_publish_event();

-- Realtime: listen to feed_events instead of posts.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.feed_events;
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'posts'
    ) then
      alter publication supabase_realtime drop table public.posts;
    end if;
  end if;
end $$;

-- Housekeeping: events are only useful for a short time.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('unm-purge-feed-events', '7 * * * *',
      'delete from public.feed_events where created_at < now() - interval ''1 day''');
  else
    raise notice 'pg_cron is not enabled: schedule a daily delete of feed_events older than 1 day.';
  end if;
end $$;
