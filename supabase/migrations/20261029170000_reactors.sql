-- Module 14: "who reacted" lists for posts and comments.
--
-- Members can open the list behind the reaction icons: avatar, nickname and the
-- reaction each person gave. Signed-in members only (guests keep seeing counts).
-- People I blocked or muted, banned members and deleted accounts are left out,
-- like in the feed. The raw reactions tables stay private; only these functions read them.
--
-- Also hardens comment_reactions: it had full table privileges for the API roles
-- (row-level security already blocked writes). It is now read-only, like reactions.

revoke all on public.comment_reactions from anon, authenticated;
grant select on public.comment_reactions to anon, authenticated;

create index if not exists reactions_post_recent_idx
  on public.reactions (post_id, updated_at desc, user_id desc);
create index if not exists comment_reactions_recent_idx
  on public.comment_reactions (comment_id, updated_at desc, user_id desc);

-- ---------------------------------------------------------------------
-- Posts
-- ---------------------------------------------------------------------
create function public.get_post_reactors(
  p_post_id uuid, p_type public.reaction_type default null,
  p_before_ts timestamptz default null, p_before_user uuid default null, p_limit int default 30
) returns table (user_id uuid, nickname text, avatar_key text, type public.reaction_type, reacted_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return query
  select r.user_id, pr.nickname, pr.avatar_key, r.type, r.updated_at
    from public.reactions r
    join public.posts p on p.id = r.post_id and p.status = 'published'
    join public.profiles pr on pr.id = r.user_id and pr.nickname is not null
    join public.user_flags f on f.user_id = r.user_id and f.status <> 'banned' and f.deleted_at is null
   where r.post_id = p_post_id
     and (p_type is null or r.type = p_type)
     and not exists (select 1 from public.user_blocks b where b.blocker_id = uid and b.blocked_id = r.user_id)
     and (p_before_ts is null or (r.updated_at, r.user_id) < (p_before_ts, coalesce(p_before_user, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
   order by r.updated_at desc, r.user_id desc
   limit least(greatest(p_limit, 1), 50);
end $$;

-- Counts per reaction type for the tabs, with the same filters as the list.
create function public.get_post_reactor_counts(p_post_id uuid)
returns table (type public.reaction_type, total int)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return query
  select r.type, count(*)::int
    from public.reactions r
    join public.posts p on p.id = r.post_id and p.status = 'published'
    join public.profiles pr on pr.id = r.user_id and pr.nickname is not null
    join public.user_flags f on f.user_id = r.user_id and f.status <> 'banned' and f.deleted_at is null
   where r.post_id = p_post_id
     and not exists (select 1 from public.user_blocks b where b.blocker_id = uid and b.blocked_id = r.user_id)
   group by r.type
   order by count(*) desc, r.type;
end $$;

-- ---------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------
create function public.get_comment_reactors(
  p_comment_id uuid, p_type public.reaction_type default null,
  p_before_ts timestamptz default null, p_before_user uuid default null, p_limit int default 30
) returns table (user_id uuid, nickname text, avatar_key text, type public.reaction_type, reacted_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return query
  select r.user_id, pr.nickname, pr.avatar_key, r.type, r.updated_at
    from public.comment_reactions r
    join public.comments c on c.id = r.comment_id and c.status = 'published'
    join public.profiles pr on pr.id = r.user_id and pr.nickname is not null
    join public.user_flags f on f.user_id = r.user_id and f.status <> 'banned' and f.deleted_at is null
   where r.comment_id = p_comment_id
     and (p_type is null or r.type = p_type)
     and not exists (select 1 from public.user_blocks b where b.blocker_id = uid and b.blocked_id = r.user_id)
     and (p_before_ts is null or (r.updated_at, r.user_id) < (p_before_ts, coalesce(p_before_user, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
   order by r.updated_at desc, r.user_id desc
   limit least(greatest(p_limit, 1), 50);
end $$;

create function public.get_comment_reactor_counts(p_comment_id uuid)
returns table (type public.reaction_type, total int)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return query
  select r.type, count(*)::int
    from public.comment_reactions r
    join public.comments c on c.id = r.comment_id and c.status = 'published'
    join public.profiles pr on pr.id = r.user_id and pr.nickname is not null
    join public.user_flags f on f.user_id = r.user_id and f.status <> 'banned' and f.deleted_at is null
   where r.comment_id = p_comment_id
     and not exists (select 1 from public.user_blocks b where b.blocker_id = uid and b.blocked_id = r.user_id)
   group by r.type
   order by count(*) desc, r.type;
end $$;

revoke all on function public.get_post_reactors(uuid, public.reaction_type, timestamptz, uuid, int) from public, anon;
revoke all on function public.get_post_reactor_counts(uuid) from public, anon;
revoke all on function public.get_comment_reactors(uuid, public.reaction_type, timestamptz, uuid, int) from public, anon;
revoke all on function public.get_comment_reactor_counts(uuid) from public, anon;
grant execute on function public.get_post_reactors(uuid, public.reaction_type, timestamptz, uuid, int) to authenticated;
grant execute on function public.get_post_reactor_counts(uuid) to authenticated;
grant execute on function public.get_comment_reactors(uuid, public.reaction_type, timestamptz, uuid, int) to authenticated;
grant execute on function public.get_comment_reactor_counts(uuid) to authenticated;
