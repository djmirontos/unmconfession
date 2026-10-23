-- Lost & Found event date is judged in Manila time (Asia/Manila), not UTC. The date may not be older than 60 days.
create or replace function public.create_listing(
  p_kind         public.listing_kind,
  p_title        text,
  p_description  text default null,
  p_price        numeric default null,
  p_condition    text default null,
  p_location     text default null,
  p_event_date   date default null,
  p_images       jsonb default '[]'::jsonb
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
    p_location := null; p_event_date := null;
  else
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

  insert into public.listings (kind, author_id, title, description, price, condition, location, event_date, images, status, published_at)
  values (p_kind, uid, p_title, p_description, p_price, p_condition, p_location, p_event_date, imgs,
          d.out_status, case when d.out_status = 'published' then now() end)
  returning * into l;

  if d.out_status = 'pending' then
    insert into public.moderation_holds (target_type, target_id, reason, matched_term)
    values ('listing', l.id, d.out_reason, d.out_term);
  end if;
  return l;
end $$;
