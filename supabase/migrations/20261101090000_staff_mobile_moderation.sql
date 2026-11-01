-- =====================================================================
-- v1.0.2 - Staff moderation on the phone (step 1: database)
--
-- What this adds (all staff-only: active moderators and admins, same rights):
--   1. reports_open_target_idx: partial index so per-item report lookups and
--      the open-item count do not scan the whole reports table.
--   2. mod_open_report_count(): number of ITEMS (post/comment/listing/profile)
--      with at least one open report. This is the number on the Home shield.
--   3. mod_resolve_reports_for(type, id, status): dismiss or close every open
--      report on one item in ONE call (the web panel loops over mod_resolve_report).
--   4. mod_app_stats(): totals for the small phone dashboard.
--   5. mod_recent_signups(limit): latest members, nickname and date only.
--
-- Privacy: nothing here returns an email, auth data or any identity detail.
-- Counts only count real members: a nickname is set and the account is not deleted.
-- No TOTP / aal check on purpose: the phone has none; admin_* functions are not used by the app.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Index
-- ---------------------------------------------------------------------
create index if not exists reports_open_target_idx
  on public.reports (target_type, target_id) where status = 'open';

-- ---------------------------------------------------------------------
-- 2. Open item count (Home shield badge)
-- ---------------------------------------------------------------------
create function public.mod_open_report_count() returns int
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  return (select count(*)::int from (
            select 1 from public.reports where status = 'open' group by target_type, target_id
          ) t);
end $$;

-- ---------------------------------------------------------------------
-- 3. Close every open report on one item
-- ---------------------------------------------------------------------
create function public.mod_resolve_reports_for(p_type public.content_type, p_id uuid, p_status text)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('actioned', 'dismissed') then raise exception 'invalid_action'; end if;
  update public.reports
     set status = p_status, handled_by = (select auth.uid()), handled_at = now()
   where target_type = p_type and target_id = p_id and status = 'open';
  get diagnostics n = row_count;
  if n = 0 then raise exception 'not_found'; end if;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- 4. Dashboard numbers
--    member = profile with a nickname whose account is not deleted
--    engaged = ever posted, listed, commented or reacted
--    active_7d = did any of those in the last 7 days
-- ---------------------------------------------------------------------
create function public.mod_app_stats()
returns table (
  total_members int, signups_24h int, signups_7d int,
  engaged_members int, active_7d int, badge_counts jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  with members as (
    select p.id, p.created_at
      from public.profiles p
      join public.user_flags f on f.user_id = p.id
     where p.nickname is not null and f.deleted_at is null
  ),
  acts as (
    select author_id as uid, created_at as at from public.posts
    union all select author_id, created_at from public.listings
    union all select author_id, created_at from public.comments
    union all select user_id, created_at from public.reactions
    union all select user_id, created_at from public.comment_reactions
  ),
  per_user as (
    select a.uid, max(a.at) as last_at
      from acts a join members m on m.id = a.uid
     group by a.uid
  )
  select (select count(*)::int from members),
         (select count(*)::int from members where created_at > now() - interval '24 hours'),
         (select count(*)::int from members where created_at > now() - interval '7 days'),
         (select count(*)::int from per_user),
         (select count(*)::int from per_user where last_at > now() - interval '7 days'),
         coalesce((select jsonb_agg(jsonb_build_object('code', b.code, 'name', b.name, 'count', x.n)
                                    order by b.sort_order)
                     from public.badges b
                     cross join lateral (
                       select count(*)::int as n
                         from public.user_badges ub join members m on m.id = ub.user_id
                        where ub.badge_code = b.code) x), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- 5. Latest members (nickname and date only, never an email)
-- ---------------------------------------------------------------------
create function public.mod_recent_signups(p_limit int default 10)
returns table (user_id uuid, nickname text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select p.id, p.nickname, p.created_at
    from public.profiles p
    join public.user_flags f on f.user_id = p.id
   where p.nickname is not null and f.deleted_at is null
   order by p.created_at desc, p.id desc
   limit least(greatest(coalesce(p_limit, 10), 1), 50);
end $$;

-- ---------------------------------------------------------------------
-- Grants: signed-in only; the function itself checks is_staff()
-- ---------------------------------------------------------------------
revoke all on function public.mod_open_report_count() from public, anon, authenticated;
revoke all on function public.mod_resolve_reports_for(public.content_type, uuid, text) from public, anon, authenticated;
revoke all on function public.mod_app_stats() from public, anon, authenticated;
revoke all on function public.mod_recent_signups(int) from public, anon, authenticated;

grant execute on function public.mod_open_report_count() to authenticated;
grant execute on function public.mod_resolve_reports_for(public.content_type, uuid, text) to authenticated;
grant execute on function public.mod_app_stats() to authenticated;
grant execute on function public.mod_recent_signups(int) to authenticated;
