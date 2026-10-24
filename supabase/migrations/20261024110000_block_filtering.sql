-- =====================================================================
-- Module 4.4: blocking and reporting.
--
-- Block (one-way): a user who blocks someone no longer sees that person's
-- posts, listings or comments anywhere (feed, trending, active polls,
-- Buy & Sell, comment threads), and gets no notifications caused by them.
-- The blocked person notices nothing. Blocks are rows in user_blocks
-- (kind 'block'; the 'mute' kind stays unused). Staff content is not
-- exempt: a user may block anyone except themselves.
--
-- The feed views are security_invoker, so filtering by auth.uid() in the
-- view applies to every function built on them (get_feed, get_trending,
-- get_active_polls, get_listings, get_comments). Guests have no blocks.
--
-- Report: a user can no longer report their own content.
-- =====================================================================

create or replace view public.feed_posts with (security_invoker = true) as
select
  p.id, p.number, p.kind, p.body, p.target_name, p.images, p.ends_at,
  p.author_id, pr.nickname, pr.avatar_key,
  p.published_at, p.reaction_count, p.comment_count,
  (select r.type from public.reactions r
     where r.post_id = p.id and r.user_id = (select auth.uid())) as my_reaction,
  case when p.kind = 'poll' then
    (select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label, 'votes', o.vote_count) order by o.position)
       from public.poll_options o where o.post_id = p.id)
  end as poll_options,
  case when p.kind = 'poll' then
    (select v.option_id from public.poll_votes v
       where v.post_id = p.id and v.user_id = (select auth.uid()))
  end as my_vote,
  p.edited_at
from public.posts p
join public.profiles pr on pr.id = p.author_id
where p.status = 'published'
  and not exists (select 1 from public.user_blocks b
                   where b.blocker_id = (select auth.uid()) and b.blocked_id = p.author_id);

create or replace view public.feed_listings with (security_invoker = true) as
select
  l.id, l.kind, l.title, l.description, l.price, l.condition, l.location, l.event_date,
  l.images, l.is_closed, l.author_id, pr.nickname, pr.avatar_key, l.published_at, l.comment_count,
  l.lost_found_type,
  l.edited_at
from public.listings l
join public.profiles pr on pr.id = l.author_id
where l.status = 'published'
  and not exists (select 1 from public.user_blocks b
                   where b.blocker_id = (select auth.uid()) and b.blocked_id = l.author_id);

create or replace view public.thread_comments with (security_invoker = true) as
select c.id, c.post_id, c.listing_id, c.body, c.author_id, pr.nickname, pr.avatar_key, c.published_at,
       c.edited_at
from public.comments c
join public.profiles pr on pr.id = c.author_id
where c.status = 'published'
  and not exists (select 1 from public.user_blocks b
                   where b.blocker_id = (select auth.uid()) and b.blocked_id = c.author_id);

-- No reaction notification when the post's owner has blocked the reactor.
create or replace function public.set_reaction(p_post_id uuid, p_type public.reaction_type) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid       uuid := public.assert_active_member();
  owner     uuid;
  inserted  boolean;
begin
  if p_type is null then
    delete from public.reactions where post_id = p_post_id and user_id = uid;
    return;
  end if;

  select author_id into owner from public.posts where id = p_post_id and status = 'published';
  if not found then raise exception 'not_found'; end if;

  insert into public.reactions (post_id, user_id, type) values (p_post_id, uid, p_type)
  on conflict (post_id, user_id) do update set type = excluded.type, updated_at = now()
  returning (xmax = 0) into inserted;

  if inserted and owner <> uid
     and not exists (select 1 from public.user_blocks where blocker_id = owner and blocked_id = uid) then
    insert into public.notifications (user_id, type, target_type, target_id, actor_id)
    values (owner, 'reaction', 'post', p_post_id, uid)
    on conflict (user_id, target_id, actor_id) where type = 'reaction' do nothing;
  end if;
end $$;

-- No comment notification when the owner has blocked the commenter.
create or replace function public.comments_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r        public.comments;
  was_pub  boolean := false;
  is_pub   boolean := false;
  delta    int;
  owner    uuid;
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

  if is_pub and owner is not null and owner <> r.author_id
     and not exists (select 1 from public.user_blocks where blocker_id = owner and blocked_id = r.author_id) then
    insert into public.notifications (user_id, type, target_type, target_id, actor_id)
    values (owner, 'comment',
            case when r.post_id is not null then 'post'::public.content_type else 'listing'::public.content_type end,
            coalesce(r.post_id, r.listing_id), r.author_id);
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;

-- A user cannot report their own content.
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

-- Guests read the feed views, which now check user_blocks. RLS has no anon policy, so anon sees no rows.
grant select on public.user_blocks to anon;
