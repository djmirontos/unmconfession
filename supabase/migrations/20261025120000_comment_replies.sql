-- =====================================================================
-- Module 4.6b: one-level replies to comments.
--
--   * comments.parent_id (the top-level comment a reply belongs to),
--     reply_to_id (the exact comment being answered, used for the
--     notification and the "@name" the app puts in the text) and
--     reply_count (published replies of a top-level comment, kept by the
--     existing comment trigger).
--   * create_reply(to_comment_id, body): replying to a reply lands in the
--     same thread (parent = the top-level comment). Same moderation,
--     length limit, rate limit and hold rules as comments.
--   * get_comments returns TOP-LEVEL comments only; get_replies(parent,
--     cursor) returns one comment's replies, oldest first, lazily.
--   * Notifications: a reply notifies the author of the comment answered
--     ('reply', grouped per target comment). The post/listing owner is
--     only notified of top-level comments, never of replies. Blocked users
--     send nothing; nobody is notified of their own reply.
--   * When a top-level comment is removed or rejected (by its author or a
--     moderator), its replies are removed with it so counters stay right
--     and no reply is orphaned. A comment that is only held for review
--     (edited into a keyword hold) keeps its replies.
--   * post/listing comment_count keeps counting every published comment,
--     replies included.
-- =====================================================================

alter table public.comments
  add column parent_id   uuid references public.comments (id) on delete cascade,
  add column reply_to_id uuid references public.comments (id) on delete set null,
  add column reply_count int not null default 0,
  add constraint comments_not_own_parent check (parent_id is null or parent_id <> id);

create index comments_replies_idx on public.comments (parent_id, published_at, id)
  where status = 'published' and parent_id is not null;

create or replace view public.thread_comments with (security_invoker = true) as
select c.id, c.post_id, c.listing_id, c.body, c.author_id, pr.nickname, pr.avatar_key, c.published_at,
       c.edited_at,
       c.reaction_count,
       (select r.type from public.comment_reactions r
          where r.comment_id = c.id and r.user_id = (select auth.uid())) as my_reaction,
       array(select e.key from jsonb_each_text(c.reaction_breakdown) e
              order by e.value::int desc,
                       array_position(array['like','love','haha','wow','sad','angry'], e.key)
              limit 3) as top_reactions,
       c.parent_id,
       c.reply_to_id,
       c.reply_count
from public.comments c
join public.profiles pr on pr.id = c.author_id
where c.status = 'published'
  and not exists (select 1 from public.user_blocks b
                   where b.blocker_id = (select auth.uid()) and b.blocked_id = c.author_id);

-- Top-level comments only (replies are loaded on demand with get_replies).
create or replace function public.get_comments(
  p_target_type public.content_type, p_target_id uuid,
  p_after_ts timestamptz default null, p_after_id uuid default null, p_limit int default 50)
returns setof public.thread_comments
language sql stable security invoker set search_path = '' as $$
  select * from public.thread_comments c
  where ((p_target_type = 'post' and c.post_id = p_target_id) or (p_target_type = 'listing' and c.listing_id = p_target_id))
    and c.parent_id is null
    and (p_after_ts is null or (c.published_at, c.id) > (p_after_ts, p_after_id))
  order by c.published_at, c.id
  limit least(greatest(p_limit, 1), 100);
$$;

-- Replies of one visible top-level comment, oldest first.
create function public.get_replies(
  p_parent_id uuid, p_after_ts timestamptz default null, p_after_id uuid default null, p_limit int default 20)
returns setof public.thread_comments
language sql stable security invoker set search_path = '' as $$
  select * from public.thread_comments c
  where c.parent_id = p_parent_id
    and exists (select 1 from public.thread_comments t where t.id = p_parent_id)
    and (p_after_ts is null or (c.published_at, c.id) > (p_after_ts, p_after_id))
  order by c.published_at, c.id
  limit least(greatest(p_limit, 1), 100);
$$;
revoke execute on function public.get_replies(uuid, timestamptz, uuid, int) from public, anon, authenticated;
grant execute on function public.get_replies(uuid, timestamptz, uuid, int) to anon, authenticated;

create function public.create_reply(p_to_comment_id uuid, p_body text)
returns public.comments
language plpgsql security definer set search_path = '' as $$
declare
  uid    uuid := public.assert_active_member();
  t      public.comments;
  parent uuid;
  ok     boolean;
  d      record;
  c      public.comments;
begin
  p_body := btrim(coalesce(p_body, ''));
  if char_length(p_body) not between 1 and 1000 then raise exception 'invalid_body'; end if;

  select * into t from public.comments where id = p_to_comment_id and status = 'published';
  if not found then raise exception 'not_found'; end if;

  parent := coalesce(t.parent_id, t.id);
  if t.parent_id is not null
     and not exists (select 1 from public.comments where id = t.parent_id and status = 'published') then
    raise exception 'not_found';
  end if;

  if t.post_id is not null then
    select exists (select 1 from public.posts where id = t.post_id and status = 'published') into ok;
  else
    select exists (select 1 from public.listings where id = t.listing_id and status = 'published') into ok;
  end if;
  if not ok then raise exception 'not_found'; end if;

  if (select count(*) from public.comments where author_id = uid and created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'rate_limited';
  end if;

  select * into d from public._moderation_decision('comment', p_body);

  insert into public.comments (post_id, listing_id, author_id, body, status, published_at, parent_id, reply_to_id)
  values (t.post_id, t.listing_id, uid, p_body, d.out_status,
          case when d.out_status = 'published' then now() end, parent, t.id)
  returning * into c;

  if d.out_status = 'pending' then
    insert into public.moderation_holds (target_type, target_id, reason, matched_term)
    values ('comment', c.id, d.out_reason, d.out_term);
  end if;
  return c;
end $$;
revoke execute on function public.create_reply(uuid, text) from public, anon, authenticated;
grant execute on function public.create_reply(uuid, text) to authenticated;

-- Counters and notifications for comments and replies.
create or replace function public.comments_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r        public.comments;
  was_pub  boolean := false;
  is_pub   boolean := false;
  delta    int;
  owner    uuid;
  answered uuid;
begin
  if tg_op = 'DELETE' then r := old; was_pub := (old.status = 'published');
  elsif tg_op = 'INSERT' then r := new; is_pub := (new.status = 'published');
  else r := new; was_pub := (old.status = 'published'); is_pub := (new.status = 'published');
  end if;

  if was_pub = is_pub then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  delta := case when is_pub then 1 else -1 end;

  if r.post_id is not null then
    update public.posts set comment_count = greatest(comment_count + delta, 0) where id = r.post_id
    returning author_id into owner;
  else
    update public.listings set comment_count = greatest(comment_count + delta, 0) where id = r.listing_id
    returning author_id into owner;
  end if;

  if r.parent_id is not null then
    update public.comments set reply_count = greatest(reply_count + delta, 0) where id = r.parent_id;
    if is_pub then
      select author_id into answered from public.comments where id = r.reply_to_id;
      if answered is not null and answered <> r.author_id
         and not exists (select 1 from public.user_blocks where blocker_id = answered and blocked_id = r.author_id) then
        insert into public.notifications (user_id, type, target_type, target_id, actor_id)
        values (answered, 'reply', 'comment', r.reply_to_id, r.author_id);
      end if;
    end if;
  elsif is_pub and owner is not null and owner <> r.author_id
        and not exists (select 1 from public.user_blocks where blocker_id = owner and blocked_id = r.author_id) then
    insert into public.notifications (user_id, type, target_type, target_id, actor_id)
    values (owner, 'comment',
            case when r.post_id is not null then 'post'::public.content_type else 'listing'::public.content_type end,
            coalesce(r.post_id, r.listing_id), r.author_id);
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;

-- A removed or rejected top-level comment takes its replies with it.
create function public.comments_cascade_children() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.parent_id is null and new.status in ('removed', 'rejected')
     and old.status is distinct from new.status then
    delete from public.moderation_holds h
      using public.comments c
     where c.parent_id = new.id and c.status = 'pending'
       and h.target_type = 'comment' and h.target_id = c.id;
    update public.comments
       set status = 'removed', moderated_at = now(), deleted_at = coalesce(deleted_at, new.deleted_at)
     where parent_id = new.id and status in ('published', 'pending');
  end if;
  return null;
end $$;
create trigger comments_cascade_children after update of status on public.comments
  for each row execute function public.comments_cascade_children();
