-- =====================================================================
-- Module 5.3: Buy & Sell / Lost & Found list filters.
--
-- get_listings gains three optional filters, applied on the server so
-- keyset paging stays correct (a client-side filter would return empty
-- pages):
--   * p_lost_found_type  'lost' | 'found' (null = both)
--   * p_include_closed   false hides sold / returned listings
--                        (default true keeps the old behaviour)
--   * p_search           case-insensitive substring match on title,
--                        description or place, at most 60 characters
--                        (plain substring, so % and _ are ordinary text)
-- Blocked authors stay hidden because the function still reads the
-- feed_listings view. A new parameter list is a new signature, so the old
-- function is dropped and the new one gets explicit privileges.
-- =====================================================================

drop function public.get_listings(public.listing_kind, timestamptz, uuid, int);

create function public.get_listings(
  p_kind             public.listing_kind,
  p_before_ts        timestamptz default null,
  p_before_id        uuid default null,
  p_limit            int default 20,
  p_lost_found_type  text default null,
  p_include_closed   boolean default true,
  p_search           text default null
) returns setof public.feed_listings
language sql stable security invoker set search_path = '' as $$
  with q as (select lower(left(btrim(coalesce(p_search, '')), 60)) as term)
  select f.* from public.feed_listings f, q
  where f.kind = p_kind
    and (p_lost_found_type is null or f.lost_found_type = p_lost_found_type)
    and (coalesce(p_include_closed, true) or not f.is_closed)
    and (q.term = ''
         or strpos(lower(f.title), q.term) > 0
         or strpos(lower(coalesce(f.description, '')), q.term) > 0
         or strpos(lower(coalesce(f.location, '')), q.term) > 0)
    and (p_before_ts is null or (f.published_at, f.id) < (p_before_ts, p_before_id))
  order by f.published_at desc, f.id desc
  limit least(greatest(p_limit, 1), 50);
$$;

revoke execute on function
  public.get_listings(public.listing_kind, timestamptz, uuid, int, text, boolean, text)
  from public, anon, authenticated;
grant execute on function
  public.get_listings(public.listing_kind, timestamptz, uuid, int, text, boolean, text)
  to anon, authenticated;
