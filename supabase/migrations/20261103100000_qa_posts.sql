-- =====================================================================
-- v1.0.3 - Q&A posts (step A: post type and answer count)
--
-- A Q&A post is a normal post (kind 'confession', shown to members as "Post") with a new
-- column post_type = 'qa'. The kind is NOT changed, so builds 1.0.1 and 1.0.2 keep showing
-- Q&A posts as ordinary posts instead of dropping them.
--   * posts.post_type : 'post' (default) or 'qa'. Q&A is only allowed on kind 'confession'.
--     The type is chosen when posting and cannot be changed afterwards.
--   * posts.answer_count : published TOP-LEVEL comments only (replies are not answers).
--     comment_count is unchanged and still counts replies.
--   * feed_posts gains post_type and answer_count, appended last.
--   * create_post keeps its exact signature and behaviour: it is now a thin wrapper around the
--     internal _create_post(). No overload is added, so old builds keep resolving the same
--     function. New function create_qa_post(body, images) creates a Q&A post.
-- Moderation is unchanged: a Q&A post is a post, so holds, reports and removals work as before.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------
alter table public.posts
  add column post_type    text not null default 'post',
  add column answer_count int  not null default 0;

alter table public.posts
  add constraint posts_post_type_check check (post_type in ('post', 'qa')),
  add constraint posts_qa_kind_check   check (post_type = 'post' or kind = 'confession');

-- Existing posts: count their published top-level comments.
update public.posts p
   set answer_count = (select count(*)::int from public.comments c
                        where c.post_id = p.id and c.parent_id is null and c.status = 'published');

-- The type is fixed once posted. Dashboard / SQL editor changes (no signed-in user) stay possible.
create function public.posts_lock_type() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.post_type is distinct from old.post_type and (select auth.uid()) is not null then
    raise exception 'post_type_locked' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger posts_lock_type before update of post_type on public.posts
  for each row execute function public.posts_lock_type();

-- ---------------------------------------------------------------------
-- 2. Answer counter (comments_after_write is identical to 20261025120000_comment_replies.sql
--    except that the post update also maintains answer_count for top-level comments)
-- ---------------------------------------------------------------------
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
    update public.posts
       set comment_count = greatest(comment_count + delta, 0),
           answer_count  = case when r.parent_id is null
                                then greatest(answer_count + delta, 0) else answer_count end
     where id = r.post_id
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

-- ---------------------------------------------------------------------
-- 3. Feed view: identical to 20261025110000_top_reactions.sql plus two columns at the end
-- ---------------------------------------------------------------------
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
  p.edited_at,
  array(select e.key from jsonb_each_text(p.reaction_breakdown) e
         order by e.value::int desc,
                  array_position(array['like','love','haha','wow','sad','angry'], e.key)
         limit 3) as top_reactions,
  p.post_type,
  p.answer_count
from public.posts p
join public.profiles pr on pr.id = p.author_id
where p.status = 'published'
  and not exists (select 1 from public.user_blocks b
                   where b.blocker_id = (select auth.uid()) and b.blocked_id = p.author_id);

-- ---------------------------------------------------------------------
-- 4. Creating posts
--    _create_post is the body of the old create_post plus p_post_type. create_post keeps its
--    exact signature (and grants) and passes 'post'.
-- ---------------------------------------------------------------------
create function public._create_post(
  p_kind          public.post_kind,
  p_body          text,
  p_target_name   text,
  p_images        jsonb,
  p_poll_options  text[],
  p_ends_at       timestamptz,
  p_post_type     text
) returns public.posts
language plpgsql security definer set search_path = '' as $$
declare
  uid   uuid := public.assert_active_member();
  d     record;
  p     public.posts;
  opts  text[];
  imgs  jsonb;
  txt   text;
begin
  if p_post_type is null or p_post_type not in ('post', 'qa') then raise exception 'invalid_post_type'; end if;
  if p_post_type = 'qa' and p_kind <> 'confession' then raise exception 'invalid_post_type'; end if;

  p_body := btrim(coalesce(p_body, ''));
  p_target_name := nullif(btrim(coalesce(p_target_name, '')), '');
  if char_length(p_body) < 1 or char_length(p_body) > 2000 then raise exception 'invalid_body'; end if;

  imgs := public._check_images(coalesce(p_images, '[]'::jsonb), uid);

  if p_kind = 'poll' then
    if char_length(p_body) < 3 or char_length(p_body) > 280 then raise exception 'invalid_body'; end if;
    if jsonb_array_length(imgs) > 0 then raise exception 'invalid_images'; end if;
    if p_target_name is not null then raise exception 'invalid_target'; end if;
    if coalesce(array_length(p_poll_options, 1), 0) not between 2 and 6 then raise exception 'invalid_poll_options'; end if;
    select array_agg(btrim(u.o) order by u.ord) into opts from unnest(p_poll_options) with ordinality as u (o, ord);
    if exists (select 1 from unnest(opts) x where char_length(x) not between 1 and 80)
       or (select count(distinct lower(x)) from unnest(opts) x) <> array_length(opts, 1) then
      raise exception 'invalid_poll_options';
    end if;
    if p_ends_at is null or p_ends_at < now() + interval '5 minutes' or p_ends_at > now() + interval '30 days' then
      raise exception 'invalid_poll_end';
    end if;
  else
    if p_poll_options is not null or p_ends_at is not null then raise exception 'invalid_poll_options'; end if;
    if p_kind = 'shoutout' and p_target_name is null then raise exception 'target_required'; end if;
    if p_kind = 'confession' and p_target_name is not null then raise exception 'invalid_target'; end if;
  end if;

  if (select count(*) from public.posts where author_id = uid and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'rate_limited';
  end if;

  txt := p_body || ' ' || coalesce(p_target_name, '') || ' ' || coalesce(array_to_string(opts, ' '), '');
  select * into d from public._moderation_decision('post', txt);

  insert into public.posts (kind, author_id, body, target_name, images, ends_at, status, published_at, post_type)
  values (p_kind, uid, p_body, p_target_name, imgs, case when p_kind = 'poll' then p_ends_at end,
          d.out_status, case when d.out_status = 'published' then now() end, p_post_type)
  returning * into p;

  if p_kind = 'poll' then
    insert into public.poll_options (post_id, label, position)
    select p.id, u.o, (u.ord - 1)::smallint from unnest(opts) with ordinality as u (o, ord);
  end if;

  if d.out_status = 'pending' then
    insert into public.moderation_holds (target_type, target_id, reason, matched_term)
    values ('post', p.id, d.out_reason, d.out_term);
  end if;
  return p;
end $$;

revoke all on function public._create_post(public.post_kind, text, text, jsonb, text[], timestamptz, text)
  from public, anon, authenticated;

-- Same signature as before, so existing grants stay and old builds call the same function.
create or replace function public.create_post(
  p_kind          public.post_kind,
  p_body          text,
  p_target_name   text default null,
  p_images        jsonb default '[]'::jsonb,
  p_poll_options  text[] default null,
  p_ends_at       timestamptz default null
) returns public.posts
language plpgsql security definer set search_path = '' as $$
begin
  return public._create_post(p_kind, p_body, p_target_name, p_images, p_poll_options, p_ends_at, 'post');
end $$;

create function public.create_qa_post(
  p_body    text,
  p_images  jsonb default '[]'::jsonb
) returns public.posts
language plpgsql security definer set search_path = '' as $$
begin
  return public._create_post('confession', p_body, null, p_images, null, null, 'qa');
end $$;

revoke all on function public.create_qa_post(text, jsonb) from public, anon, authenticated;
grant execute on function public.create_qa_post(text, jsonb) to authenticated;
