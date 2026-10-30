-- Module 13c: Trusted Seller. Buyer-confirmed sales.
--
-- The seller (listing author) picks the buyer from the people who commented on a Buy & Sell
-- listing. The BUYER must confirm, so nobody can award themselves. Confirming closes the listing.
-- Trusted Seller = confirmed sales to 5 DIFFERENT buyers. Free items (price 0) do not count.
--
-- Limits: both accounts at least 3 days old, the buyer must have a published comment on the
-- listing, no blocks either way, one pending/confirmed sale per listing, at most 3 sales
-- started per seller per 24h, a request expires after 14 days. Rows are only readable
-- through the functions below.
--
-- Also: get_top_badges now returns up to 3 badges per author (staff label first, then earned
-- badges by sort order, never nocturnal) for the icons next to nicknames.

-- ---------------------------------------------------------------------
-- 1. Notification types
-- ---------------------------------------------------------------------
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('comment', 'reaction', 'comment_reaction', 'reply',
                  'content_approved', 'content_rejected', 'content_removed',
                  'return_request', 'return_confirmed',
                  'sale_request', 'sale_confirmed'));

-- ---------------------------------------------------------------------
-- 2. Table (RLS on, no policies, no API grants)
-- ---------------------------------------------------------------------
create table public.item_sales (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings (id) on delete cascade,
  seller_id   uuid not null references public.profiles (id) on delete cascade,
  buyer_id    uuid not null references public.profiles (id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'confirmed', 'declined', 'cancelled')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  constraint item_sales_distinct check (seller_id <> buyer_id)
);
create unique index item_sales_active_uniq on public.item_sales (listing_id) where status in ('pending', 'confirmed');
create index item_sales_seller_idx on public.item_sales (seller_id) where status = 'confirmed';
create index item_sales_buyer_idx  on public.item_sales (buyer_id)  where status = 'pending';
create index item_sales_start_idx  on public.item_sales (seller_id, created_at);

alter table public.item_sales enable row level security;
revoke all on public.item_sales from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Badge (sort 7: right after Campus Hero)
-- ---------------------------------------------------------------------
insert into public.badges (code, name, description, sort_order) values
  ('trusted_seller', 'Trusted Seller', 'Completed 5 sales confirmed by different buyers.', 7)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- 4. Candidates: members who commented on the listing (seller only)
-- ---------------------------------------------------------------------
create function public.get_sale_candidates(p_listing uuid)
returns table (user_id uuid, nickname text, avatar_key text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := public.assert_active_member();
begin
  if not exists (select 1 from public.listings l
                  where l.id = p_listing and l.author_id = uid and l.kind = 'sell' and l.status = 'published') then
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
-- 5. Start a sale (seller only)
-- ---------------------------------------------------------------------
create function public.start_item_sale(p_listing uuid, p_buyer uuid)
returns table (sale_id uuid, status text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := public.assert_active_member();
  l   public.listings;
  s   public.item_sales;
begin
  select * into l from public.listings
   where id = p_listing and kind = 'sell' and status = 'published';
  if not found then raise exception 'not_found'; end if;
  if l.author_id <> uid then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(l.price, 0) <= 0 then raise exception 'free_item'; end if;
  if p_buyer is null or p_buyer = uid then raise exception 'invalid_user'; end if;

  if not exists (select 1 from public.profiles pr join public.user_flags f on f.user_id = pr.id
                  where pr.id = p_buyer and pr.nickname is not null
                    and f.status <> 'banned' and f.deleted_at is null) then
    raise exception 'invalid_user';
  end if;
  if not exists (select 1 from public.comments c
                  where c.listing_id = p_listing and c.author_id = p_buyer and c.status = 'published') then
    raise exception 'not_commenter';
  end if;
  if exists (select 1 from public.user_blocks k
              where (k.blocker_id = uid and k.blocked_id = p_buyer) or (k.blocker_id = p_buyer and k.blocked_id = uid)) then
    raise exception 'invalid_user';
  end if;
  if (select count(*) from public.profiles where id in (uid, p_buyer) and created_at <= now() - interval '3 days') < 2 then
    raise exception 'account_too_new';
  end if;
  if (select count(*) from public.item_sales where seller_id = uid and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'rate_limited';
  end if;

  -- a request nobody answered for 14 days no longer blocks the listing
  update public.item_sales set status = 'cancelled', resolved_at = now()
   where listing_id = p_listing and status = 'pending' and created_at < now() - interval '14 days';
  if exists (select 1 from public.item_sales where listing_id = p_listing and status in ('pending', 'confirmed')) then
    raise exception 'already_sold';
  end if;

  insert into public.item_sales (listing_id, seller_id, buyer_id)
  values (p_listing, uid, p_buyer) returning * into s;
  insert into public.notifications (user_id, type, target_type, target_id, actor_id, data)
  values (p_buyer, 'sale_request', 'listing', p_listing, uid, jsonb_build_object('sale_id', s.id));
  return query select s.id, s.status;
end $$;

-- ---------------------------------------------------------------------
-- 6. Buyer answers a request
-- ---------------------------------------------------------------------
create function public.respond_item_sale(p_sale uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.assert_active_member();
  s   public.item_sales;
begin
  select * into s from public.item_sales where id = p_sale and buyer_id = uid and status = 'pending' for update;
  if not found then raise exception 'not_found'; end if;
  if s.created_at < now() - interval '14 days' then
    update public.item_sales set status = 'cancelled', resolved_at = now() where id = s.id;
    raise exception 'expired';
  end if;
  if p_accept is null then raise exception 'invalid_input'; end if;

  if p_accept then
    update public.item_sales set status = 'confirmed', resolved_at = now() where id = s.id;
    update public.listings set is_closed = true where id = s.listing_id;
    insert into public.notifications (user_id, type, target_type, target_id, actor_id, data)
    values (s.seller_id, 'sale_confirmed', 'listing', s.listing_id, uid, jsonb_build_object('sale_id', s.id));
  else
    update public.item_sales set status = 'declined', resolved_at = now() where id = s.id;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 7. Seller cancels a pending request
-- ---------------------------------------------------------------------
create function public.cancel_item_sale(p_sale uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.assert_active_member();
begin
  update public.item_sales set status = 'cancelled', resolved_at = now()
   where id = p_sale and seller_id = uid and status = 'pending';
  if not found then raise exception 'not_found'; end if;
end $$;

-- ---------------------------------------------------------------------
-- 8. What the viewer should see on a listing (participants only)
-- role: 'seller' or 'buyer'. status: pending or confirmed. At most one row.
-- ---------------------------------------------------------------------
create function public.get_listing_sale(p_listing uuid)
returns table (sale_id uuid, status text, role text, other_id uuid, other_nickname text,
               other_avatar_key text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return query
  select s.id, s.status,
         case when s.seller_id = uid then 'seller' else 'buyer' end,
         o.id, o.nickname, o.avatar_key, s.created_at
    from public.item_sales s
    join public.profiles o on o.id = case when s.seller_id = uid then s.buyer_id else s.seller_id end
   where s.listing_id = p_listing and s.status in ('pending', 'confirmed')
     and uid in (s.seller_id, s.buyer_id)
     and (s.status = 'confirmed' or s.created_at >= now() - interval '14 days')
   limit 1;
end $$;

revoke all on function
  public.get_sale_candidates(uuid), public.start_item_sale(uuid, uuid),
  public.respond_item_sale(uuid, boolean), public.cancel_item_sale(uuid),
  public.get_listing_sale(uuid)
  from public, anon;
grant execute on function
  public.get_sale_candidates(uuid), public.start_item_sale(uuid, uuid),
  public.respond_item_sale(uuid, boolean), public.cancel_item_sale(uuid),
  public.get_listing_sale(uuid)
  to authenticated;

-- ---------------------------------------------------------------------
-- 9. Award engine: add trusted_seller (same function as 13b plus one block)
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
end $$;

revoke all on function public.award_badges() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 10. get_top_badges: up to 3 badges per author, in priority order
-- (same signature, so grants stay)
-- ---------------------------------------------------------------------
create or replace function public.get_top_badges(p_users uuid[])
returns table (user_id uuid, code text, name text)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return query
  select z.user_id, z.code, z.name
    from (
      select c.user_id, c.code, c.name,
             row_number() over (partition by c.user_id order by c.rank, c.code) as rn
        from (
          select f.user_id, f.role::text as code, initcap(f.role::text) as name, 0 as rank
            from public.user_flags f
           where f.user_id = any (p_users[1:100]) and f.role::text in ('moderator', 'admin')
             and f.status <> 'banned' and f.deleted_at is null
          union all
          select ub.user_id, b.code, b.name, b.sort_order
            from public.user_badges ub
            join public.badges b on b.code = ub.badge_code
            join public.user_flags f on f.user_id = ub.user_id
           where ub.user_id = any (p_users[1:100]) and b.code <> 'nocturnal'
             and f.status <> 'banned' and f.deleted_at is null
        ) c
       where not exists (select 1 from public.user_blocks k where k.blocker_id = uid and k.blocked_id = c.user_id)
    ) z
   where z.rn <= 3
   order by z.user_id, z.rn;
end $$;

select public.award_badges();
