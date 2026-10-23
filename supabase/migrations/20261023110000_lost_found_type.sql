-- =====================================================================
-- Lost vs Found. A Lost & Found listing is now either 'lost' or 'found'.
--   * listings.lost_found_type ('lost' | 'found'), required for kind
--     'lost_found' and null for 'sell'.
--   * Existing Lost & Found rows (test data) are backfilled as 'lost'.
--   * feed_listings exposes the new column (appended at the end).
--   * create_listing gets a trailing parameter p_lost_found_type. A new
--     parameter means a new signature, so the old function is dropped
--     and recreated with its privileges set explicitly.
-- =====================================================================

alter table public.listings
  add column lost_found_type text check (lost_found_type in ('lost', 'found'));

update public.listings set lost_found_type = 'lost'
  where kind = 'lost_found' and lost_found_type is null;

alter table public.listings
  add constraint listings_lf_type
  check ((kind = 'lost_found') = (lost_found_type is not null));

create or replace view public.feed_listings with (security_invoker = true) as
select
  l.id, l.kind, l.title, l.description, l.price, l.condition, l.location, l.event_date,
  l.images, l.is_closed, l.author_id, pr.nickname, pr.avatar_key, l.published_at, l.comment_count,
  l.lost_found_type
from public.listings l
join public.profiles pr on pr.id = l.author_id
where l.status = 'published';

drop function public.create_listing(public.listing_kind, text, text, numeric, text, text, date, jsonb);

create function public.create_listing(
  p_kind            public.listing_kind,
  p_title           text,
  p_description     text default null,
  p_price           numeric default null,
  p_condition       text default null,
  p_location        text default null,
  p_event_date      date default null,
  p_images          jsonb default '[]'::jsonb,
  p_lost_found_type text default null
) returns public.listings
language plpgsql security definer set search_path = '' as $$
declare
  uid   uuid := public.assert_active_member();
  today date := (now() at time zone 'Asia/Manila')::date;
  d     record;
  l     public.listings;
  imgs  jsonb;
begin
  p_title := btrim(coalesce(p_title, ''));
  p_description := nullif(btrim(coalesce(p_description, '')), '');
  p_location := nullif(btrim(coalesce(p_location, '')), '');
  if char_length(p_title) not between 1 and 100 then raise exception 'invalid_title'; end if;
  imgs := public._check_images(coalesce(p_images, '[]'::jsonb), uid);

  if p_kind = 'sell' then
    if p_price is null or p_price < 0 or p_price > 9999999 then raise exception 'invalid_price'; end if;
    if p_condition is null then raise exception 'condition_required'; end if;
    p_location := null; p_event_date := null; p_lost_found_type := null;
  else
    if p_lost_found_type is null or p_lost_found_type not in ('lost', 'found') then
      raise exception 'lost_found_type_required';
    end if;
    if p_location is null or p_event_date is null
       or p_event_date > today or p_event_date < today - 60 then
      raise exception 'invalid_lost_found';
    end if;
    p_price := null; p_condition := null;
  end if;

  if (select count(*) from public.listings where author_id = uid and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'rate_limited';
  end if;

  select * into d from public._moderation_decision(
    'listing', p_title || ' ' || coalesce(p_description, '') || ' ' || coalesce(p_location, ''));

  insert into public.listings (kind, author_id, title, description, price, condition, location, event_date,
                               lost_found_type, images, status, published_at)
  values (p_kind, uid, p_title, p_description, p_price, p_condition, p_location, p_event_date,
          p_lost_found_type, imgs, d.out_status, case when d.out_status = 'published' then now() end)
  returning * into l;

  if d.out_status = 'pending' then
    insert into public.moderation_holds (target_type, target_id, reason, matched_term)
    values ('listing', l.id, d.out_reason, d.out_term);
  end if;
  return l;
end $$;

revoke execute on function
  public.create_listing(public.listing_kind, text, text, numeric, text, text, date, jsonb, text)
  from public, anon, authenticated;
grant execute on function
  public.create_listing(public.listing_kind, text, text, numeric, text, text, date, jsonb, text)
  to authenticated;
