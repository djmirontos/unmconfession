-- Module 13a: badges engine + automatic badges.
--
-- Badges earned by activity (stored): first_circle, nocturnal, campus_regular, campus_voice.
-- Role labels (moderator, admin) are derived from user_flags.role when read, never stored.
--
-- Awarding is server-side only. public.award_badges() is idempotent and runs every
-- 10 minutes from pg_cron (and once at the end of this file). No app or admin client
-- can write to user_badges. Badges are not revoked when content is later removed.
-- Banned and deleted accounts are skipped, and their badges are hidden.
--
-- Definitions (all times Asia/Manila):
--   first_circle    one of the first 20 non-staff accounts with a nickname, by sign-up time
--   nocturnal       has a published post or comment published between 00:00 and 03:59
--   campus_regular  published posts/comments or reactions on 7 or more different days
--   campus_voice    a post published 24h+ ago, still published, with at least
--                   app_settings.campus_voice_reactions reactions and no open report

-- ---------------------------------------------------------------------
-- 1. Setting
-- ---------------------------------------------------------------------
alter table public.app_settings
  add column if not exists campus_voice_reactions int not null default 10;
alter table public.app_settings
  drop constraint if exists app_settings_campus_voice_check,
  add constraint app_settings_campus_voice_check check (campus_voice_reactions between 1 and 10000);

-- ---------------------------------------------------------------------
-- 2. Tables (RLS on, no policies, no API grants: access only through functions)
-- ---------------------------------------------------------------------
create table public.badges (
  code        text primary key check (code ~ '^[a-z_]{3,30}$'),
  name        text not null check (char_length(name) between 1 and 30),
  description text not null check (char_length(description) between 1 and 160),
  sort_order  int  not null
);

create table public.user_badges (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  badge_code text not null references public.badges (code) on delete cascade,
  earned_at  timestamptz not null default now(),
  primary key (user_id, badge_code)
);
create index user_badges_code_idx on public.user_badges (badge_code);

alter table public.badges      enable row level security;
alter table public.user_badges enable row level security;
revoke all on public.badges, public.user_badges from public, anon, authenticated;

insert into public.badges (code, name, description, sort_order) values
  ('first_circle',   'First Circle',   'One of the first 20 members of UNM Freedom Confessions.', 10),
  ('campus_voice',   'Campus Voice',   'Wrote a post the community responded to.',                20),
  ('campus_regular', 'Campus Regular', 'Was active on 7 different days.',                         30),
  ('nocturnal',      'Nocturnal',      'Posted or commented between midnight and 4 AM.',          40)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- 3. Award engine (cron / SQL editor only)
-- ---------------------------------------------------------------------
create function public.award_badges() returns void
language plpgsql security definer set search_path = '' as $$
declare
  threshold int;
begin
  select campus_voice_reactions into threshold from public.app_settings where id = 1;
  threshold := coalesce(threshold, 10);

  -- Eligible accounts: not banned, not deleted.
  create temporary table if not exists _eligible (user_id uuid primary key) on commit drop;
  truncate _eligible;
  insert into _eligible
  select f.user_id from public.user_flags f
   where f.status <> 'banned' and f.deleted_at is null;

  -- first_circle: first 20 non-staff accounts with a nickname.
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

  -- nocturnal: published post or comment published 00:00-03:59 Manila.
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

  -- campus_regular: 7 distinct Manila days with a published post/comment or a reaction.
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

  -- campus_voice: a post that survived 24h with enough reactions and no open report.
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
end $$;

revoke all on function public.award_badges() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Read badges of a member (signed-in only)
-- Earned badges first (by sort order), then the role label.
-- Empty for banned/deleted accounts and for members the viewer blocked.
-- ---------------------------------------------------------------------
create function public.get_user_badges(p_user uuid)
returns table (code text, name text, description text, earned_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return query
  select t.code, t.name, t.description, t.earned_at from (
    select b.code, b.name, b.description, ub.earned_at, b.sort_order
      from public.user_badges ub
      join public.badges b on b.code = ub.badge_code
      join public.user_flags f on f.user_id = ub.user_id
     where ub.user_id = p_user
       and f.status <> 'banned' and f.deleted_at is null
       and not exists (select 1 from public.user_blocks k where k.blocker_id = uid and k.blocked_id = p_user)
    union all
    select f.role::text, initcap(f.role::text),
           case f.role::text when 'admin' then 'Administrator of UNM Freedom Confessions.'
                             else 'Moderator of UNM Freedom Confessions.' end,
           null::timestamptz, 1000
      from public.user_flags f
     where f.user_id = p_user and f.role::text in ('moderator', 'admin')
       and f.status <> 'banned' and f.deleted_at is null
       and not exists (select 1 from public.user_blocks k where k.blocker_id = uid and k.blocked_id = p_user)
  ) t order by t.sort_order;
end $$;

revoke all on function public.get_user_badges(uuid) from public, anon;
grant execute on function public.get_user_badges(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Schedule and first run
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('unm-award-badges', '*/10 * * * *', 'select public.award_badges()');
  else
    raise notice 'pg_cron is not enabled: schedule award_badges() every 10 minutes.';
  end if;
end $$;

select public.award_badges();
