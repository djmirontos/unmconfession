-- =====================================================================
-- Module 4.6a+: top reactions (Facebook style).
--
-- Posts and comments keep a running tally per reaction type
-- (reaction_breakdown, e.g. {"like":5,"love":2}), maintained by the
-- existing reaction triggers: +1 when a reaction is added, -1 when it is
-- removed, and a move from the old type to the new one when a reaction
-- changes. The feed views read the top 3 types from that tally (most used
-- first, ties in the fixed order like, love, haha, wow, sad, angry), so
-- showing them costs nothing per row and stays fast as reactions grow.
-- No identities are exposed: only types and counts.
--
--   * posts.reaction_breakdown / comments.reaction_breakdown jsonb
--   * existing rows are backfilled from the reaction tables
--   * feed_posts and thread_comments gain top_reactions text[] (appended
--     last, so every existing column keeps its position)
-- =====================================================================

alter table public.posts    add column reaction_breakdown jsonb not null default '{}'::jsonb;
alter table public.comments add column reaction_breakdown jsonb not null default '{}'::jsonb;

update public.posts p
   set reaction_breakdown = t.b
  from (select post_id, jsonb_object_agg(type, n) as b
          from (select post_id, type, count(*) as n from public.reactions group by post_id, type) x
         group by post_id) t
 where t.post_id = p.id;

update public.comments c
   set reaction_breakdown = t.b
  from (select comment_id, jsonb_object_agg(type, n) as b
          from (select comment_id, type, count(*) as n from public.comment_reactions group by comment_id, type) x
         group by comment_id) t
 where t.comment_id = c.id;

-- Internal helper: add d (+1 or -1) to one type in a tally; a type at 0 disappears.
create function public._bump_reaction(b jsonb, t text, d int) returns jsonb
language sql immutable set search_path = '' as $$
  select case
    when greatest(coalesce((b ->> t)::int, 0) + d, 0) = 0 then b - t
    else jsonb_set(b, array[t], to_jsonb(greatest(coalesce((b ->> t)::int, 0) + d, 0)))
  end
$$;
revoke execute on function public._bump_reaction(jsonb, text, int) from public, anon, authenticated;

create or replace function public.reactions_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.posts
       set reaction_count = reaction_count + 1,
           reaction_breakdown = public._bump_reaction(reaction_breakdown, new.type::text, 1)
     where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.posts
       set reaction_count = greatest(reaction_count - 1, 0),
           reaction_breakdown = public._bump_reaction(reaction_breakdown, old.type::text, -1)
     where id = old.post_id;
  elsif new.type is distinct from old.type then
    update public.posts
       set reaction_breakdown = public._bump_reaction(
             public._bump_reaction(reaction_breakdown, old.type::text, -1), new.type::text, 1)
     where id = new.post_id;
  end if;
  return null;
end $$;
drop trigger reactions_after_write on public.reactions;
create trigger reactions_after_write after insert or update of type or delete on public.reactions
  for each row execute function public.reactions_after_write();

create or replace function public.comment_reactions_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.comments
       set reaction_count = reaction_count + 1,
           reaction_breakdown = public._bump_reaction(reaction_breakdown, new.type::text, 1)
     where id = new.comment_id;
  elsif tg_op = 'DELETE' then
    update public.comments
       set reaction_count = greatest(reaction_count - 1, 0),
           reaction_breakdown = public._bump_reaction(reaction_breakdown, old.type::text, -1)
     where id = old.comment_id;
  elsif new.type is distinct from old.type then
    update public.comments
       set reaction_breakdown = public._bump_reaction(
             public._bump_reaction(reaction_breakdown, old.type::text, -1), new.type::text, 1)
     where id = new.comment_id;
  end if;
  return null;
end $$;
drop trigger comment_reactions_after_write on public.comment_reactions;
create trigger comment_reactions_after_write after insert or update of type or delete on public.comment_reactions
  for each row execute function public.comment_reactions_after_write();

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
         limit 3) as top_reactions
from public.posts p
join public.profiles pr on pr.id = p.author_id
where p.status = 'published'
  and not exists (select 1 from public.user_blocks b
                   where b.blocker_id = (select auth.uid()) and b.blocked_id = p.author_id);

create or replace view public.thread_comments with (security_invoker = true) as
select c.id, c.post_id, c.listing_id, c.body, c.author_id, pr.nickname, pr.avatar_key, c.published_at,
       c.edited_at,
       c.reaction_count,
       (select r.type from public.comment_reactions r
          where r.comment_id = c.id and r.user_id = (select auth.uid())) as my_reaction,
       array(select e.key from jsonb_each_text(c.reaction_breakdown) e
              order by e.value::int desc,
                       array_position(array['like','love','haha','wow','sad','angry'], e.key)
              limit 3) as top_reactions
from public.comments c
join public.profiles pr on pr.id = c.author_id
where c.status = 'published'
  and not exists (select 1 from public.user_blocks b
                   where b.blocker_id = (select auth.uid()) and b.blocked_id = c.author_id);
