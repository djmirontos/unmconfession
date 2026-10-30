-- Module 13b: Campus Hero. Confirmed returns of lost items.
--
-- A return links a Lost & Found listing to the member who gave the item back (finder) and the
-- member it belongs to (owner). The OWNER always confirms, so nobody can award themselves:
--   * On a 'lost' listing the author is the owner. They pick the commenter who helped; the
--     return is confirmed immediately and the finder is notified.
--   * On a 'found' listing the author is the finder. They pick the commenter who claims the
--     item; the owner gets a request and must confirm it (pending until then, 14 days).
-- Confirming closes the listing. Campus Hero = confirmed returns with 3 DIFFERENT owners.
--
-- Limits: both accounts at least 3 days old, the counterpart must have a published comment on
-- the listing, no blocks either way, one active/confirmed return per listing, at most 3
-- returns started per member per 24h. Return rows are only readable through the functions.

-- ---------------------------------------------------------------------
-- 1. Notification types
-- ---------------------------------------------------------------------
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('comment', 'reaction', 'comment_reaction', 'reply',
                  'content_approved', 'content_rejected', 'content_removed',
                  'return_request', 'return_confirmed'));

-- ---------------------------------------------------------------------
-- 2. Table (RLS on, no policies, no API grants)
-- ---------------------------------------------------------------------
create table public.item_returns (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings (id) on delete cascade,
  finder_id    uuid not null references public.profiles (id) on delete cascade,
  owner_id     uuid not null references public.profiles (id) on delete cascade,
  initiated_by uuid not null references public.profiles (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'confirmed', 'declined', 'cancelled')),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  constraint item_returns_distinct  check (finder_id <> owner_id),
  constraint item_returns_initiator check (initiated_by in (finder_id, owner_id))
);
create unique index item_returns_active_uniq on public.item_returns (listing_id) where status in ('pending', 'confirmed');
create index item_returns_finder_idx on public.item_returns (finder_id) where status = 'confirmed';
create index item_returns_owner_idx  on public.item_returns (owner_id)  where status = 'pending';
create index item_returns_init_idx   on public.item_returns (initiated_by, created_at);

alter table public.item_returns enable row level security;
revoke all on public.item_returns from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Badge
-- ---------------------------------------------------------------------
insert into public.badges (code, name, description, sort_order) values
  ('campus_hero', 'Campus Hero', 'Helped 3 different members get their lost items back.', 5)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- 4. Candidates: members who commented on the listing (author only)
-- ---------------------------------------------------------------------
create function public.get_return_candidates(p_listing uuid)
returns table (user_id uuid, nickname text, avatar_key text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := public.assert_active_member();
begin
  if not exists (select 1 from public.listings l
                  where l.id = p_listing and l.author_id = uid and l.kind = 'lost_found' and l.status = 'published') then
    raise exception 'not_found';
  end if;
  return query
  select pr.id, pr.nickname, pr.avatar_key
    from (select c.author_id, max(c.published_at) as last_at
            from public.comments c
           where c.listing_id = p_listing and c.status = 'published' and c.author_id <> uid
           group by c.author_id) x
    join public.profiles pr on pr.id = x.author_id
    join public.user_flags f on f.user_id = pr.id
   where pr.nickname is not null and f.status <> 'banned' and f.deleted_at is null
     and pr.created_at <= now() - interval '3 days'
     and not exists (select 1 from public.user_blocks k
                      where (k.blocker_id = uid and k.blocked_id = pr.id) or (k.blocker_id = pr.id and k.blocked_id = uid))
   order by x.last_at desc
   limit 50;
end $$;

-- ---------------------------------------------------------------------
-- 5. Start a return (listing author only)
-- ---------------------------------------------------------------------
create function public.start_item_return(p_listing uuid, p_user uuid)
returns table (return_id uuid, status text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := public.assert_active_member();
  l   public.listings;
  r   public.item_returns;
begin
  select * into l from public.listings
   where id = p_listing and kind = 'lost_found' and status = 'published';
  if not found then raise exception 'not_found'; end if;
  if l.author_id <> uid then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_user is null or p_user = uid then raise exception 'invalid_user'; end if;

  if not exists (select 1 from public.profiles pr join public.user_flags f on f.user_id = pr.id
                  where pr.id = p_user and pr.nickname is not null
                    and f.status <> 'banned' and f.deleted_at is null) then
    raise exception 'invalid_user';
  end if;
  if not exists (select 1 from public.comments c
                  where c.listing_id = p_listing and c.author_id = p_user and c.status = 'published') then
    raise exception 'not_commenter';
  end if;
  if exists (select 1 from public.user_blocks k
              where (k.blocker_id = uid and k.blocked_id = p_user) or (k.blocker_id = p_user and k.blocked_id = uid)) then
    raise exception 'invalid_user';
  end if;
  if (select count(*) from public.profiles where id in (uid, p_user) and created_at <= now() - interval '3 days') < 2 then
    raise exception 'account_too_new';
  end if;
  if (select count(*) from public.item_returns where initiated_by = uid and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'rate_limited';
  end if;

  -- a request nobody answered for 14 days no longer blocks the listing
  update public.item_returns set status = 'cancelled', resolved_at = now()
   where listing_id = p_listing and status = 'pending' and created_at < now() - interval '14 days';
  if exists (select 1 from public.item_returns where listing_id = p_listing and status in ('pending', 'confirmed')) then
    raise exception 'already_returned';
  end if;

  if l.lost_found_type = 'lost' then
    insert into public.item_returns (listing_id, finder_id, owner_id, initiated_by, status, resolved_at)
    values (p_listing, p_user, uid, uid, 'confirmed', now()) returning * into r;
    update public.listings set is_closed = true where id = p_listing;
    insert into public.notifications (user_id, type, target_type, target_id, actor_id, data)
    values (p_user, 'return_confirmed', 'listing', p_listing, uid, jsonb_build_object('return_id', r.id));
  else
    insert into public.item_returns (listing_id, finder_id, owner_id, initiated_by)
    values (p_listing, uid, p_user, uid) returning * into r;
    insert into public.notifications (user_id, type, target_type, target_id, actor_id, data)
    values (p_user, 'return_request', 'listing', p_listing, uid, jsonb_build_object('return_id', r.id));
  end if;
  return query select r.id, r.status;
end $$;

-- ---------------------------------------------------------------------
-- 6. Owner answers a request
-- ---------------------------------------------------------------------
create function public.respond_item_return(p_return uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.assert_active_member();
  r   public.item_returns;
begin
  select * into r from public.item_returns where id = p_return and owner_id = uid and status = 'pending' for update;
  if not found then raise exception 'not_found'; end if;
  if r.created_at < now() - interval '14 days' then
    update public.item_returns set status = 'cancelled', resolved_at = now() where id = r.id;
    raise exception 'expired';
  end if;
  if p_accept is null then raise exception 'invalid_input'; end if;

  if p_accept then
    update public.item_returns set status = 'confirmed', resolved_at = now() where id = r.id;
    update public.listings set is_closed = true where id = r.listing_id;
    insert into public.notifications (user_id, type, target_type, target_id, actor_id, data)
    values (r.finder_id, 'return_confirmed', 'listing', r.listing_id, uid, jsonb_build_object('return_id', r.id));
  else
    update public.item_returns set status = 'declined', resolved_at = now() where id = r.id;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 7. Author cancels a pending request
-- ---------------------------------------------------------------------
create function public.cancel_item_return(p_return uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.assert_active_member();
begin
  update public.item_returns set status = 'cancelled', resolved_at = now()
   where id = p_return and initiated_by = uid and status = 'pending';
  if not found then raise exception 'not_found'; end if;
end $$;

-- ---------------------------------------------------------------------
-- 8. What the viewer should see on a listing (participants only)
-- role: 'finder' or 'owner'. status: pending or confirmed. At most one row.
-- ---------------------------------------------------------------------
create function public.get_listing_return(p_listing uuid)
returns table (return_id uuid, status text, role text, other_id uuid, other_nickname text,
               other_avatar_key text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return query
  select r.id, r.status,
         case when r.finder_id = uid then 'finder' else 'owner' end,
         o.id, o.nickname, o.avatar_key, r.created_at
    from public.item_returns r
    join public.profiles o on o.id = case when r.finder_id = uid then r.owner_id else r.finder_id end
   where r.listing_id = p_listing and r.status in ('pending', 'confirmed')
     and uid in (r.finder_id, r.owner_id)
     and (r.status = 'confirmed' or r.created_at >= now() - interval '14 days')
   limit 1;
end $$;

revoke all on function
  public.get_return_candidates(uuid), public.start_item_return(uuid, uuid),
  public.respond_item_return(uuid, boolean), public.cancel_item_return(uuid),
  public.get_listing_return(uuid)
  from public, anon;
grant execute on function
  public.get_return_candidates(uuid), public.start_item_return(uuid, uuid),
  public.respond_item_return(uuid, boolean), public.cancel_item_return(uuid),
  public.get_listing_return(uuid)
  to authenticated;

-- ---------------------------------------------------------------------
-- 9. Award engine: add campus_hero (same function as 13a plus one block)
-- ---------------------------------------------------------------------
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

  -- campus_hero: confirmed returns with 3 different owners.
  insert into public.user_badges (user_id, badge_code)
  select r.finder_id, 'campus_hero'
    from public.item_returns r
    join _eligible e on e.user_id = r.finder_id
   where r.status = 'confirmed'
   group by r.finder_id
  having count(distinct r.owner_id) >= 3
  on conflict do nothing;
end $$;

revoke all on function public.award_badges() from public, anon, authenticated;

select public.award_badges();
