-- =====================================================================
-- Module 4.6a: reactions on comments.
--
--   * comment_reactions (one reaction per user per comment, same six types
--     as posts) and comments.reaction_count, kept by a trigger.
--   * thread_comments exposes reaction_count and my_reaction (appended
--     at the end, so existing columns keep their order). Guests can read
--     the view; RLS lets nobody see anyone else's reaction row.
--   * set_comment_reaction(comment_id, type): type null removes the
--     reaction. Only published comments on published posts/listings can be
--     reacted to. The comment's author gets one 'comment_reaction'
--     notification per reactor (unless blocked or self); changing the
--     reaction updates the notification's emoji without notifying again.
--   * notifications.type also allows 'comment_reaction' and 'reply'
--     ('reply' is used by the replies step that follows).
--   * The notification list groups 'comment_reaction' and 'reply' per target
--     comment, like 'comment' and 'reaction' per post.
-- =====================================================================

alter table public.comments add column reaction_count int not null default 0;

create table public.comment_reactions (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       public.reaction_type not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
alter table public.comment_reactions enable row level security;
create policy comment_reactions_own on public.comment_reactions for select to anon, authenticated
  using (user_id = (select auth.uid()));
-- The feed views read it as the caller (guests included); RLS shows only own rows.
grant select on public.comment_reactions to anon, authenticated;

create function public.comment_reactions_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.comments set reaction_count = reaction_count + 1 where id = new.comment_id;
  elsif tg_op = 'DELETE' then
    update public.comments set reaction_count = greatest(reaction_count - 1, 0) where id = old.comment_id;
  end if;
  return null;
end $$;
create trigger comment_reactions_after_write after insert or delete on public.comment_reactions
  for each row execute function public.comment_reactions_after_write();

create or replace view public.thread_comments with (security_invoker = true) as
select c.id, c.post_id, c.listing_id, c.body, c.author_id, pr.nickname, pr.avatar_key, c.published_at,
       c.edited_at,
       c.reaction_count,
       (select r.type from public.comment_reactions r
          where r.comment_id = c.id and r.user_id = (select auth.uid())) as my_reaction
from public.comments c
join public.profiles pr on pr.id = c.author_id
where c.status = 'published'
  and not exists (select 1 from public.user_blocks b
                   where b.blocker_id = (select auth.uid()) and b.blocked_id = c.author_id);

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('comment', 'reaction', 'comment_reaction', 'reply',
                  'content_approved', 'content_rejected', 'content_removed'));
-- One notification per (owner, comment, reactor), so toggling cannot spam.
create unique index notifications_comment_reaction_uniq
  on public.notifications (user_id, target_id, actor_id) where type = 'comment_reaction';

create function public.set_comment_reaction(p_comment_id uuid, p_type public.reaction_type) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid       uuid := public.assert_active_member();
  owner     uuid;
  inserted  boolean;
begin
  if p_type is null then
    delete from public.comment_reactions where comment_id = p_comment_id and user_id = uid;
    return;
  end if;

  select c.author_id into owner
    from public.comments c
   where c.id = p_comment_id and c.status = 'published'
     and ((c.post_id is not null and exists (
              select 1 from public.posts p where p.id = c.post_id and p.status = 'published'))
       or (c.listing_id is not null and exists (
              select 1 from public.listings l where l.id = c.listing_id and l.status = 'published')));
  if not found then raise exception 'not_found'; end if;

  insert into public.comment_reactions (comment_id, user_id, type) values (p_comment_id, uid, p_type)
  on conflict (comment_id, user_id) do update set type = excluded.type, updated_at = now()
  returning (xmax = 0) into inserted;

  if owner <> uid
     and not exists (select 1 from public.user_blocks where blocker_id = owner and blocked_id = uid) then
    if inserted then
      insert into public.notifications (user_id, type, target_type, target_id, actor_id, data)
      values (owner, 'comment_reaction', 'comment', p_comment_id, uid, jsonb_build_object('reaction', p_type))
      on conflict (user_id, target_id, actor_id) where type = 'comment_reaction'
      do update set data = excluded.data;
    else
      update public.notifications
         set data = jsonb_build_object('reaction', p_type)
       where user_id = owner and type = 'comment_reaction' and target_id = p_comment_id and actor_id = uid;
    end if;
  end if;
end $$;

revoke execute on function public.set_comment_reaction(uuid, public.reaction_type)
  from public, anon, authenticated;
grant execute on function public.set_comment_reaction(uuid, public.reaction_type) to authenticated;

-- Notification list: group comment_reaction and reply per target comment.
create or replace function public.get_notifications(
  p_before_ts  timestamptz default null,
  p_before_key text default null,
  p_limit      int default 20
) returns table (
  group_key        text,
  type             text,
  target_type      public.content_type,
  target_id        uuid,
  latest_at        timestamptz,
  event_count      int,
  actor_count      int,
  unread_count     int,
  actor_id         uuid,
  actor_nickname   text,
  actor_avatar_key text,
  reaction_type    text,
  reason           text,
  target_exists    boolean,
  target_status    text,
  target_kind      text,
  target_preview   text,
  parent_post_id   uuid,
  parent_listing_id uuid
)
language sql stable security invoker set search_path = '' as $$
  with base as (
    select n.*,
           case when n.type in ('comment', 'reaction', 'comment_reaction', 'reply')
                then n.type || ':' || n.target_id::text
                else n.id::text end as gkey
    from public.notifications n
    where n.user_id = (select auth.uid())
      and not exists (select 1 from public.user_blocks b
                       where b.blocker_id = (select auth.uid()) and b.blocked_id = n.actor_id)
  ),
  g as (
    select gkey, type, target_type, target_id,
           max(created_at)                                              as latest_at,
           count(*)::int                                                as event_count,
           count(distinct actor_id)::int                                as actor_count,
           (count(*) filter (where read_at is null))::int              as unread_count,
           (array_agg(actor_id order by created_at desc))[1]            as last_actor,
           (array_agg(data ->> 'reaction' order by created_at desc))[1] as reaction_type,
           (array_agg(data ->> 'reason' order by created_at desc))[1]   as reason
    from base
    group by gkey, type, target_type, target_id
  )
  select g.gkey, g.type, g.target_type, g.target_id, g.latest_at, g.event_count, g.actor_count,
         g.unread_count, g.last_actor, pr.nickname, pr.avatar_key, g.reaction_type, g.reason,
         (coalesce(p.id, l.id, c.id) is not null),
         coalesce(p.status::text, l.status::text, c.status::text),
         coalesce(p.kind::text, l.kind::text, case when c.id is not null then 'comment' end),
         left(coalesce(p.body, l.title, c.body), 80),
         c.post_id, c.listing_id
  from g
  left join public.profiles pr on pr.id = g.last_actor
  left join public.posts    p  on g.target_type = 'post'    and p.id = g.target_id
  left join public.listings l  on g.target_type = 'listing' and l.id = g.target_id
  left join public.comments c  on g.target_type = 'comment' and c.id = g.target_id
  where p_before_ts is null or (g.latest_at, g.gkey) < (p_before_ts, p_before_key)
  order by g.latest_at desc, g.gkey desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
$$;

create or replace function public.get_unread_notification_count() returns int
language sql stable security invoker set search_path = '' as $$
  select count(distinct case when n.type in ('comment', 'reaction', 'comment_reaction', 'reply')
                             then n.type || ':' || n.target_id::text
                             else n.id::text end)::int
  from public.notifications n
  where n.user_id = (select auth.uid())
    and n.read_at is null
    and not exists (select 1 from public.user_blocks b
                     where b.blocker_id = (select auth.uid()) and b.blocked_id = n.actor_id)
$$;

create or replace function public.mark_notifications_read(p_keys text[] default null) returns void
language sql security invoker set search_path = '' as $$
  update public.notifications n
     set read_at = now()
   where n.user_id = (select auth.uid())
     and n.read_at is null
     and (p_keys is null
          or (case when n.type in ('comment', 'reaction', 'comment_reaction', 'reply')
                   then n.type || ':' || n.target_id::text
                   else n.id::text end) = any (p_keys))
$$;

create or replace function public.delete_notifications(p_keys text[]) returns void
language sql security invoker set search_path = '' as $$
  delete from public.notifications n
   where n.user_id = (select auth.uid())
     and (case when n.type in ('comment', 'reaction', 'comment_reaction', 'reply')
               then n.type || ':' || n.target_id::text
               else n.id::text end) = any (p_keys)
$$;
