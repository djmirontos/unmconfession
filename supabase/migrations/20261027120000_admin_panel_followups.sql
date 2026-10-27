-- Module 7d.2: follow-ups found while building the panel.
-- 1. mod_list_content can filter by author (user page shows their content).
-- 2. mod_review('restore') refuses items the author deleted themselves, and
--    no longer writes a notification for a deleted account.
-- 3. admin_set_nickname refuses deleted accounts.

-- ---------------------------------------------------------------------
-- 1. Browse content by author (new trailing argument, so the signature changes)
-- ---------------------------------------------------------------------
drop function public.mod_list_content(public.content_type, public.content_status, text, int, timestamptz, uuid);

create function public.mod_list_content(
  p_type public.content_type default null, p_status public.content_status default null,
  p_search text default null, p_limit int default 30,
  p_after_ts timestamptz default null, p_after_id uuid default null,
  p_author uuid default null)
returns table (
  target_type public.content_type, target_id uuid, status public.content_status,
  title text, body text, images jsonb, author_id uuid, nickname text,
  created_at timestamptz, deleted_at timestamptz, post_number bigint)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  s   text := left(btrim(coalesce(p_search, '')), 100);
  pat text;
  num bigint;
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if s <> '' then
    if s ~ '^#?[0-9]{1,15}$' then num := replace(s, '#', '')::bigint; end if;
    pat := '%' || replace(replace(replace(s, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  return query
  select u.target_type, u.target_id, u.status, u.title, u.body, u.images,
         u.author_id, pr.nickname, u.created_at, u.deleted_at, u.post_number
  from (
    select 'post'::public.content_type as target_type, p.id as target_id, p.status,
           p.kind::text as title, p.body, p.images, p.author_id, p.created_at, p.deleted_at,
           p.number as post_number
      from public.posts p
     where (p_type is null or p_type = 'post')
       and (p_status is null or p.status = p_status)
       and (p_author is null or p.author_id = p_author)
       and (s = '' or (num is not null and p.number = num) or p.body ilike pat escape '\')
    union all
    select 'comment'::public.content_type, c.id, c.status, null::text, c.body, '[]'::jsonb,
           c.author_id, c.created_at, c.deleted_at, null::bigint
      from public.comments c
     where (p_type is null or p_type = 'comment')
       and (p_status is null or c.status = p_status)
       and (p_author is null or c.author_id = p_author)
       and (s = '' or c.body ilike pat escape '\')
    union all
    select 'listing'::public.content_type, l.id, l.status, l.title, l.description, l.images,
           l.author_id, l.created_at, l.deleted_at, null::bigint
      from public.listings l
     where (p_type is null or p_type = 'listing')
       and (p_status is null or l.status = p_status)
       and (p_author is null or l.author_id = p_author)
       and (s = '' or l.title ilike pat escape '\' or l.description ilike pat escape '\')
  ) u
  left join public.profiles pr on pr.id = u.author_id
  where p_after_ts is null
     or (u.created_at, u.target_id) < (p_after_ts, coalesce(p_after_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
  order by u.created_at desc, u.target_id desc
  limit least(greatest(p_limit, 1), 100);
end $$;

revoke all on function public.mod_list_content(public.content_type, public.content_status, text, int, timestamptz, uuid, uuid) from public, anon, authenticated;
grant execute on function public.mod_list_content(public.content_type, public.content_status, text, int, timestamptz, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. mod_review: no restore of author-deleted items, no notice to deleted accounts
-- ---------------------------------------------------------------------
create or replace function public.mod_review(
  p_type public.content_type, p_id uuid, p_action text,
  p_reason text default null, p_note text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  cur   public.content_status;
  owner uuid;
  del   timestamptz;
  ns    public.content_status;
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_action not in ('approve', 'reject', 'remove', 'restore') then raise exception 'invalid_action'; end if;
  p_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if p_action in ('reject', 'remove') and p_reason is null then raise exception 'reason_required'; end if;

  if p_type = 'post' then
    select status, author_id, deleted_at into cur, owner, del from public.posts where id = p_id for update;
  elsif p_type = 'comment' then
    select status, author_id, deleted_at into cur, owner, del from public.comments where id = p_id for update;
  else
    select status, author_id, deleted_at into cur, owner, del from public.listings where id = p_id for update;
  end if;
  if not found then raise exception 'not_found'; end if;

  if (p_action in ('approve', 'reject') and cur <> 'pending')
     or (p_action = 'remove' and cur <> 'published')
     or (p_action = 'restore' and cur not in ('removed', 'rejected')) then
    raise exception 'invalid_transition';
  end if;
  -- the author deleted it themselves: a moderator must not bring it back
  if p_action = 'restore' and del is not null then raise exception 'deleted_by_author'; end if;

  ns := (case p_action when 'approve' then 'published' when 'reject' then 'rejected'
                       when 'remove' then 'removed' else 'published' end)::public.content_status;

  if p_type = 'post' then
    update public.posts set status = ns,
      reject_reason = case when ns in ('rejected', 'removed') then p_reason end,
      moderated_by = actor, moderated_at = now(),
      published_at = case when p_action = 'approve' then now() else published_at end
    where id = p_id;
  elsif p_type = 'comment' then
    update public.comments set status = ns,
      reject_reason = case when ns in ('rejected', 'removed') then p_reason end,
      moderated_by = actor, moderated_at = now(),
      published_at = case when p_action = 'approve' then now() else published_at end
    where id = p_id;
  else
    update public.listings set status = ns,
      reject_reason = case when ns in ('rejected', 'removed') then p_reason end,
      moderated_by = actor, moderated_at = now(),
      published_at = case when p_action = 'approve' then now() else published_at end
    where id = p_id;
  end if;

  delete from public.moderation_holds where target_type = p_type and target_id = p_id;

  if ns in ('rejected', 'removed') then
    update public.reports set status = 'actioned', handled_by = actor, handled_at = now()
    where target_type = p_type and target_id = p_id and status = 'open';
  end if;

  insert into public.moderation_actions (actor_id, target_type, target_id, action, reason_code, note)
  values (actor, p_type::text, p_id, p_action, p_reason, p_note);

  -- nobody is left to read it when the account is deleted
  if not exists (select 1 from public.user_flags f where f.user_id = owner and f.deleted_at is not null) then
    insert into public.notifications (user_id, type, target_type, target_id, data)
    values (owner,
            case ns when 'rejected' then 'content_rejected' when 'removed' then 'content_removed' else 'content_approved' end,
            p_type, p_id, jsonb_build_object('reason', p_reason));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. admin_set_nickname: deleted accounts keep no nickname
-- ---------------------------------------------------------------------
create or replace function public.admin_set_nickname(p_user uuid, p_nickname text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  was_deleted timestamptz;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  p_nickname := btrim(p_nickname);
  if p_nickname !~ '^[A-Za-z0-9_.]{3,20}$' then raise exception 'nickname_invalid'; end if;
  select deleted_at into was_deleted from public.user_flags where user_id = p_user;
  if not found then raise exception 'not_found'; end if;
  if was_deleted is not null then raise exception 'account_deleted'; end if;
  if exists (select 1 from public.profiles where lower(nickname) = lower(p_nickname) and id <> p_user) then
    raise exception 'nickname_taken';
  end if;
  update public.profiles set nickname = p_nickname where id = p_user;
  if not found then raise exception 'not_found'; end if;
end $$;
