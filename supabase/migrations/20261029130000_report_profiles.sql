-- Module 12c-2: members can report a profile (avatar or nickname), and
-- moderators see reported profiles in the report queue.
--
-- A profile report uses target_type 'profile' and target_id = the reported user's id.
-- Reasons are the same list as other reports.
-- Moderators act with the existing tools: mod_remove_avatar(), suspend/ban, mod_resolve_report().

-- New value for the report target type. It is only used by the functions below
-- (they run later, after this file has been committed).
alter type public.content_type add value if not exists 'profile';

-- ---------------------------------------------------------------------
-- report_content: add the 'profile' target. Same signature, so grants stay.
-- A user cannot report their own profile; deleted accounts and profiles
-- without a nickname are not reportable.
-- ---------------------------------------------------------------------
create or replace function public.report_content(
  p_type public.content_type, p_id uuid, p_reason text, p_note text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid    uuid := (select auth.uid());
  author uuid;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_type = 'post' then
    select author_id into author from public.posts where id = p_id and status = 'published';
  elsif p_type = 'comment' then
    select author_id into author from public.comments where id = p_id and status = 'published';
  elsif p_type = 'profile' then
    select pr.id into author
      from public.profiles pr
      join public.user_flags f on f.user_id = pr.id
     where pr.id = p_id and pr.nickname is not null and f.deleted_at is null;
  else
    select author_id into author from public.listings where id = p_id and status = 'published';
  end if;
  if author is null then raise exception 'not_found'; end if;
  if author = uid then raise exception 'own_content'; end if;
  if (select count(*) from public.reports where reporter_id = uid and created_at > now() - interval '24 hours') >= 20 then
    raise exception 'rate_limited';
  end if;
  insert into public.reports (reporter_id, target_type, target_id, reason, note)
  values (uid, p_type, p_id, p_reason, nullif(btrim(coalesce(p_note, '')), ''))
  on conflict (reporter_id, target_type, target_id) do nothing;
end $$;

-- ---------------------------------------------------------------------
-- mod_get_reports: also list reported profiles, and return avatar_key so
-- the panel can show the reported picture. The return type changes
-- (new last column), so the function is dropped and created again.
-- For a profile row: author_id = the reported user, title = 'profile',
-- body is null, content_status is 'removed' if the account was deleted.
-- ---------------------------------------------------------------------
drop function public.mod_get_reports(int, timestamptz, uuid);

create function public.mod_get_reports(
  p_limit int default 50, p_after_ts timestamptz default null, p_after_id uuid default null
) returns table (
  target_type public.content_type, target_id uuid, report_count int, reasons text[],
  first_reported_at timestamptz, last_reported_at timestamptz,
  content_status public.content_status, title text, body text, images jsonb,
  author_id uuid, nickname text, avatar_key text
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select g.target_type, g.target_id, g.cnt, g.reasons, g.first_at, g.last_at,
         c.status, c.title, c.body, c.images, c.author_id, pr.nickname, pr.avatar_key
  from (
    select r.target_type, r.target_id, count(*)::int as cnt,
           array_agg(distinct r.reason order by r.reason) as reasons,
           min(r.created_at) as first_at, max(r.created_at) as last_at
    from public.reports r
    where r.status = 'open'
    group by r.target_type, r.target_id
  ) g
  left join lateral (
    select p.status, p.kind::text as title, p.body, p.images, p.author_id
      from public.posts p where g.target_type = 'post' and p.id = g.target_id
    union all
    select c2.status, null::text, c2.body, '[]'::jsonb, c2.author_id
      from public.comments c2 where g.target_type = 'comment' and c2.id = g.target_id
    union all
    select l.status, l.title, l.description, l.images, l.author_id
      from public.listings l where g.target_type = 'listing' and l.id = g.target_id
    union all
    select case when f.deleted_at is null then 'published'::public.content_status
                else 'removed'::public.content_status end,
           'profile'::text, null::text, '[]'::jsonb, pr2.id
      from public.profiles pr2
      join public.user_flags f on f.user_id = pr2.id
     where g.target_type = 'profile' and pr2.id = g.target_id
  ) c on true
  left join public.profiles pr on pr.id = c.author_id
  where p_after_ts is null
     or (g.first_at, g.target_id) > (p_after_ts, coalesce(p_after_id, '00000000-0000-0000-0000-000000000000'::uuid))
  order by g.first_at, g.target_id
  limit least(greatest(p_limit, 1), 100);
end $$;

revoke all on function public.mod_get_reports(int, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.mod_get_reports(int, timestamptz, uuid) to authenticated;
