-- Module 13a-2: one badge chip per author for feed cards and comments.
--
-- get_top_badges(user ids) returns, for each member that has one, a single badge to show
-- next to the nickname: the role label (admin, moderator) if staff, otherwise the earned
-- badge with the lowest sort_order, ignoring nocturnal (it only shows on the profile).
-- Signed-in only. At most 100 ids are used per call. Members who are banned, deleted or
-- blocked by the viewer return nothing. Members with no badge return no row.

create function public.get_top_badges(p_users uuid[])
returns table (user_id uuid, code text, name text)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return query
  select distinct on (c.user_id) c.user_id, c.code, c.name
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
   order by c.user_id, c.rank;
end $$;

revoke all on function public.get_top_badges(uuid[]) from public, anon;
grant execute on function public.get_top_badges(uuid[]) to authenticated;
