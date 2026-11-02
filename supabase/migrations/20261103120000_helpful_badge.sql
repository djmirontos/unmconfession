-- =====================================================================
-- v1.0.3 - "Helpful" badge (step C)
--
-- Earned by giving the top-voted answer on 3 DIFFERENT Q&A posts.
-- A Q&A post produces at most ONE win, recorded the first time it qualifies:
--   * the post is a published Q&A post, at least 48 hours old,
--   * it has at least 2 published answers (top-level comments),
--   * the winning answer was written by someone other than the asker,
--   * it has at least 3 distinct upvoters, not counting its author, and upvoters whose account is
--     banned or deleted do not count,
--   * it has the most such upvotes among the answers that can win; a tie goes to the earlier
--     answer, then to the lower id.
-- A recorded win is never taken back (even if the answer is later removed or overtaken), and the
-- badge is never revoked, like every other badge. A member who is banned or deleted receives
-- nothing (same eligibility as the other badges).
--
-- The award engine runs every 10 minutes (existing cron job); award_badges() below is identical to
-- 20261030160000_trusted_seller.sql plus the helpful block. The app shows unknown badge codes with
-- a neutral ribbon, so builds without the "Helpful" icon still work.
-- =====================================================================

insert into public.badges (code, name, description, sort_order) values
  ('helpful', 'Helpful', 'Gave the top-voted answer on 3 different questions.', 6)
on conflict (code) do nothing;

-- One row per Q&A post that has produced a winner. No foreign keys on post/comment on purpose:
-- a purged post or comment must not erase progress. Only the member link cascades.
create table public.helpful_wins (
  post_id    uuid primary key,
  comment_id uuid,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  won_at     timestamptz not null default now()
);
create index helpful_wins_user_idx on public.helpful_wins (user_id);
alter table public.helpful_wins enable row level security;
revoke all on public.helpful_wins from public, anon, authenticated;

create or replace function public.award_badges() returns void
language plpgsql security definer set search_path = '' as $$
declare
  threshold int;
begin
  select campus_voice_reactions into threshold from public.app_settings where id = 1;
  threshold := coalesce(threshold, 10);

  create temporary table if not exists _eligible (user_id uuid primary key) on commit drop;
  truncate _eligible;
  insert into _eligible
  select f.user_id from public.user_flags f
   where f.status <> 'banned' and f.deleted_at is null;

  insert into public.user_badges (user_id, badge_code)
  select r.id, 'first_circle'
    from (
      select p.id, row_number() over (order by p.created_at, p.id) as rn
        from public.profiles p
        join public.user_flags f on f.user_id = p.id
       where p.nickname is not null and f.role = 'user' and f.deleted_at is null
    ) r
    join _eligible e on e.user_id = r.id
   where r.rn <= 20
  on conflict do nothing;

  insert into public.user_badges (user_id, badge_code)
  select distinct x.author_id, 'nocturnal'
    from (
      select author_id, published_at from public.posts    where status = 'published'
      union all
      select author_id, published_at from public.comments where status = 'published'
    ) x
    join _eligible e on e.user_id = x.author_id
   where extract(hour from x.published_at at time zone 'Asia/Manila') < 4
  on conflict do nothing;

  insert into public.user_badges (user_id, badge_code)
  select d.user_id, 'campus_regular'
    from (
      select author_id as user_id, (published_at at time zone 'Asia/Manila')::date as day
        from public.posts    where status = 'published'
      union
      select author_id, (published_at at time zone 'Asia/Manila')::date
        from public.comments where status = 'published'
      union
      select user_id, (created_at at time zone 'Asia/Manila')::date
        from public.reactions
    ) d
    join _eligible e on e.user_id = d.user_id
   group by d.user_id
  having count(*) >= 7
  on conflict do nothing;

  insert into public.user_badges (user_id, badge_code)
  select distinct p.author_id, 'campus_voice'
    from public.posts p
    join _eligible e on e.user_id = p.author_id
   where p.status = 'published'
     and p.published_at <= now() - interval '24 hours'
     and p.reaction_count >= threshold
     and not exists (
       select 1 from public.reports r
        where r.target_type = 'post' and r.target_id = p.id and r.status = 'open')
  on conflict do nothing;

  insert into public.user_badges (user_id, badge_code)
  select r.finder_id, 'campus_hero'
    from public.item_returns r
    join _eligible e on e.user_id = r.finder_id
   where r.status = 'confirmed'
   group by r.finder_id
  having count(distinct r.owner_id) >= 3
  on conflict do nothing;

  -- trusted_seller: confirmed sales to 5 different buyers.
  insert into public.user_badges (user_id, badge_code)
  select s.seller_id, 'trusted_seller'
    from public.item_sales s
    join _eligible e on e.user_id = s.seller_id
   where s.status = 'confirmed'
   group by s.seller_id
  having count(distinct s.buyer_id) >= 5
  on conflict do nothing;

  -- helpful, part 1: record a win for every Q&A post that qualifies and has none yet.
  insert into public.helpful_wins (post_id, comment_id, user_id)
  select w.post_id, w.comment_id, w.author_id
    from (
      select distinct on (a.post_id) a.post_id, a.comment_id, a.author_id
        from (
          select c.post_id, c.id as comment_id, c.author_id, c.published_at,
                 (select count(*)
                    from public.comment_upvotes u
                    join public.user_flags uf on uf.user_id = u.user_id
                   where u.comment_id = c.id
                     and u.user_id <> c.author_id
                     and uf.status <> 'banned' and uf.deleted_at is null) as votes
            from public.comments c
            join public.posts p on p.id = c.post_id
            join _eligible e on e.user_id = c.author_id
           where p.post_type = 'qa'
             and p.status = 'published'
             and p.published_at <= now() - interval '48 hours'
             and c.status = 'published'
             and c.parent_id is null
             and c.author_id <> p.author_id
             and (select count(*) from public.comments c2
                   where c2.post_id = p.id and c2.parent_id is null and c2.status = 'published') >= 2
        ) a
       where a.votes >= 3
       order by a.post_id, a.votes desc, a.published_at, a.comment_id
    ) w
  on conflict (post_id) do nothing;

  -- helpful, part 2: three wins on three different posts.
  insert into public.user_badges (user_id, badge_code)
  select h.user_id, 'helpful'
    from public.helpful_wins h
    join _eligible e on e.user_id = h.user_id
   group by h.user_id
  having count(*) >= 3
  on conflict do nothing;
end $$;

revoke all on function public.award_badges() from public, anon, authenticated;
