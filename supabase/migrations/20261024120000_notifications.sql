-- =====================================================================
-- Module 4.5: notifications list.
--
-- The notifications table, its RLS (own rows only), the Realtime
-- publication and the notification triggers already exist. This adds:
--   * Grouped list: comments and reactions on the same post/listing are one
--     row ("tester_two and 4 others reacted to your post"). Approved /
--     rejected / removed notices stay one row each. A group key is
--     'comment:<target>' / 'reaction:<target>' or the notification id.
--   * get_notifications(before_ts, before_key, limit): newest group first,
--     keyset pagination on (latest_at, group_key), with the latest actor,
--     the target's state (for routing and "no longer available") and a
--     preview (for a comment notice also the parent post/listing, so a tap can
--     open the thread). Notifications caused by users the viewer blocked are hidden.
--   * get_unread_notification_count(): unread GROUPS, not rows.
--   * mark_notifications_read(keys) (null = all) and delete_notifications(keys).
--   * set_reaction stores the reaction type in the notification (readers
--     cannot see other people's reactions), and keeps it current when the
--     reactor changes their reaction. Changing a reaction never re-notifies.
--   * purge_expired also deletes notifications older than 90 days.
-- All new functions are SECURITY INVOKER: RLS limits every query to the
-- caller's own rows, and guests have no access.
-- =====================================================================

create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create function public.get_notifications(
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
           case when n.type in ('comment', 'reaction') then n.type || ':' || n.target_id::text
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

create function public.get_unread_notification_count() returns int
language sql stable security invoker set search_path = '' as $$
  select count(distinct case when n.type in ('comment', 'reaction') then n.type || ':' || n.target_id::text
                             else n.id::text end)::int
  from public.notifications n
  where n.user_id = (select auth.uid())
    and n.read_at is null
    and not exists (select 1 from public.user_blocks b
                     where b.blocker_id = (select auth.uid()) and b.blocked_id = n.actor_id)
$$;

create function public.mark_notifications_read(p_keys text[] default null) returns void
language sql security invoker set search_path = '' as $$
  update public.notifications n
     set read_at = now()
   where n.user_id = (select auth.uid())
     and n.read_at is null
     and (p_keys is null
          or (case when n.type in ('comment', 'reaction') then n.type || ':' || n.target_id::text
                   else n.id::text end) = any (p_keys))
$$;

create function public.delete_notifications(p_keys text[]) returns void
language sql security invoker set search_path = '' as $$
  delete from public.notifications n
   where n.user_id = (select auth.uid())
     and (case when n.type in ('comment', 'reaction') then n.type || ':' || n.target_id::text
               else n.id::text end) = any (p_keys)
$$;

revoke execute on function
  public.get_notifications(timestamptz, text, int),
  public.get_unread_notification_count(),
  public.mark_notifications_read(text[]),
  public.delete_notifications(text[])
  from public, anon, authenticated;
grant execute on function
  public.get_notifications(timestamptz, text, int),
  public.get_unread_notification_count(),
  public.mark_notifications_read(text[]),
  public.delete_notifications(text[])
  to authenticated;

-- Reaction notifications carry the reactor's current reaction type.
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

  if owner <> uid
     and not exists (select 1 from public.user_blocks where blocker_id = owner and blocked_id = uid) then
    if inserted then
      insert into public.notifications (user_id, type, target_type, target_id, actor_id, data)
      values (owner, 'reaction', 'post', p_post_id, uid, jsonb_build_object('reaction', p_type))
      on conflict (user_id, target_id, actor_id) where type = 'reaction'
      do update set data = excluded.data;
    else
      update public.notifications
         set data = jsonb_build_object('reaction', p_type)
       where user_id = owner and type = 'reaction' and target_id = p_post_id and actor_id = uid;
    end if;
  end if;
end $$;

-- Existing reaction notifications get their current reaction type.
update public.notifications n
   set data = jsonb_build_object('reaction', r.type)
  from public.reactions r
 where n.type = 'reaction' and r.post_id = n.target_id and r.user_id = n.actor_id
   and not (n.data ? 'reaction');

-- Purge: also remove notifications older than 90 days.
create or replace function public.purge_expired() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s record;
  n_audit int; n_actions int; n_reports int; n_posts int; n_comments int; n_listings int; n_notifs int;
begin
  select * into s from public.app_settings where id = 1;

  delete from public.identity_audit_log where created_at < now() - make_interval(days => s.audit_retention_days);
  get diagnostics n_audit = row_count;
  delete from public.moderation_actions where created_at < now() - make_interval(days => s.audit_retention_days);
  get diagnostics n_actions = row_count;
  delete from public.reports where status <> 'open' and handled_at < now() - make_interval(days => s.audit_retention_days);
  get diagnostics n_reports = row_count;

  delete from public.posts
    where (status in ('rejected', 'removed') and moderated_at < now() - make_interval(days => s.rejected_retention_days))
       or deleted_at < now() - make_interval(days => s.rejected_retention_days);
  get diagnostics n_posts = row_count;
  delete from public.comments
    where (status in ('rejected', 'removed') and moderated_at < now() - make_interval(days => s.rejected_retention_days))
       or deleted_at < now() - make_interval(days => s.rejected_retention_days);
  get diagnostics n_comments = row_count;
  delete from public.listings
    where (status in ('rejected', 'removed') and moderated_at < now() - make_interval(days => s.rejected_retention_days))
       or deleted_at < now() - make_interval(days => s.rejected_retention_days);
  get diagnostics n_listings = row_count;

  delete from public.notifications where created_at < now() - interval '90 days';
  get diagnostics n_notifs = row_count;

  delete from public.moderation_holds h where not exists (
    select 1 from public.posts p where h.target_type = 'post' and p.id = h.target_id
    union all select 1 from public.comments c where h.target_type = 'comment' and c.id = h.target_id
    union all select 1 from public.listings l where h.target_type = 'listing' and l.id = h.target_id);

  return jsonb_build_object('audit_log', n_audit, 'moderation_actions', n_actions, 'reports', n_reports,
                            'posts', n_posts, 'comments', n_comments, 'listings', n_listings,
                            'notifications', n_notifs);
end $$;
