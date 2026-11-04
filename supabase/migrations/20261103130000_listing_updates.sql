-- =====================================================================
-- v1.0.4 - "New listings" discovery banners (database part)
--
-- The banners tell a member how many eligible Buy & Sell / Lost & Found listings were first
-- published since that member last looked. What the member has seen is kept on the phone;
-- nothing about it is stored here. This migration adds two things:
--
--   1. listings.first_published_at - the moment a listing FIRST became published. A trigger sets
--      it once and it can never be supplied or changed afterwards (not by a client, and not by a
--      later edit / re-approval / restore). published_at is NOT used for counting because the
--      moderator "approve" action rewrites it, so an edited listing that is held by a keyword and
--      then approved would look brand new. published_at itself is left exactly as it is.
--      Backfill limitation: rows whose published_at was already overwritten by an earlier
--      re-approval cannot get their original date back; for them first_published_at starts at that
--      overwritten value.
--
--   2. get_listing_updates(p_since_sell, p_since_lost_found) - one row per section:
--        section    'sell' or 'lost_found' (Lost and Found are counted together)
--        new_count  eligible listings with  since < first_published_at <= mark
--        mark       the end of that window, the same for both rows of one call
--      mark is the server time minus 5 seconds. The margin is a best-effort guard for a
--      transaction that took its timestamp earlier than it committed; it is NOT a guarantee
--      against delayed transactions, and it can make a listing published within ~5 seconds of a
--      visit show once more as new. Listings after the mark belong to the next update batch.
--      A null since means "seed": new_count is 0 and only the mark is of interest.
--      Eligible = published and visible to the caller exactly as on the dedicated pages
--      (security invoker: row security applies, listings by members the caller blocked are hidden,
--      same join to profiles as feed_listings), and not closed (sold / resolved), and not the
--      caller's own. Guests (anon) can call it.
--      Known, separate, existing behaviour: feed_listings does not hide listings of banned or
--      suspended authors, so neither does this count. That is a moderation question for the
--      dedicated pages too and is deliberately not changed here.
--
-- Nothing else is touched: feed_listings, get_listings, feed_posts and every other function keep
-- their definitions, so older app builds are unaffected.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. first_published_at
-- ---------------------------------------------------------------------
alter table public.listings add column first_published_at timestamptz;

-- Every row that has ever been published has a published_at. Run before the trigger exists.
update public.listings set first_published_at = published_at where published_at is not null;

create function public.listings_first_published() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    -- whatever the caller sent is ignored
    new.first_published_at := case when new.status = 'published' then now() end;
  else
    -- never changes once set; set the first time the listing is published
    new.first_published_at := coalesce(old.first_published_at,
                                       case when new.status = 'published' then now() end);
  end if;
  return new;
end $$;

create trigger listings_first_published before insert or update on public.listings
  for each row execute function public.listings_first_published();

-- ---------------------------------------------------------------------
-- 2. Counts for the banners
-- ---------------------------------------------------------------------
create function public.get_listing_updates(
  p_since_sell        timestamptz default null,
  p_since_lost_found  timestamptz default null
) returns table (section text, new_count int, mark timestamptz)
language sql stable security invoker set search_path = '' as $$
  with m as (select now() - interval '5 seconds' as mark),
  s (section, since, kind) as (
    values ('sell'::text,       p_since_sell,       'sell'::public.listing_kind),
           ('lost_found'::text, p_since_lost_found, 'lost_found'::public.listing_kind)
  )
  select s.section,
         case when s.since is null then 0
              else (select count(*)::int
                      from public.listings l
                      join public.profiles pr on pr.id = l.author_id
                     where l.kind = s.kind
                       and l.status = 'published'
                       and not l.is_closed
                       and l.first_published_at >  s.since
                       and l.first_published_at <= m.mark
                       and l.author_id is distinct from (select auth.uid())
                       and not exists (select 1 from public.user_blocks b
                                        where b.blocker_id = (select auth.uid())
                                          and b.blocked_id = l.author_id))
         end,
         m.mark
    from s cross join m
   order by s.section;
$$;

revoke all on function public.get_listing_updates(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.get_listing_updates(timestamptz, timestamptz) to anon, authenticated;
