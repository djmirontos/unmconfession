-- =====================================================================
-- v1.0.2 - Staff push alerts (step 4: database)
--
-- Moderators and admins get a push when:
--   * an item gets its FIRST open report      -> type 'staff_report'
--   * an item is held for review              -> type 'staff_held'
--
-- Rules:
--   * recipients: every ACTIVE moderator/admin (not banned, suspended or deleted).
--     A staff member who made the report does not get an alert for it.
--   * throttle: at most one alert of each kind per staff member every 15 minutes
--     (a burst, e.g. pre-moderation mode, cannot flood a phone or eat the 20/hour cap).
--   * push only: these rows are hidden from the notification list and the bell count.
--     Staff see the work in the Moderation screens. Old rows are purged after 7 days.
--   * text is generic: "New report to review" / "New item waiting for review".
--   * one switch per staff member: push_settings.staff_alerts (default on); the master
--     switch and the global kill switch also apply.
--   * a failure here NEVER blocks a report or a post: the triggers swallow errors with a warning.
--   * a demoted or banned moderator stops getting alerts (role is re-checked at send time).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Notification types
-- ---------------------------------------------------------------------
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('comment', 'reaction', 'comment_reaction', 'reply',
                  'content_approved', 'content_rejected', 'content_removed',
                  'return_request', 'return_confirmed',
                  'sale_request', 'sale_confirmed',
                  'staff_report', 'staff_held'));

-- ---------------------------------------------------------------------
-- 2. Switch
-- ---------------------------------------------------------------------
alter table public.push_settings
  add column if not exists staff_alerts boolean not null default true;

-- Same names and grants as before, one more switch. The return type changes,
-- so the two functions are dropped and created again (the old app keeps working:
-- it passes named arguments and ignores the extra column).
drop function public.set_push_settings(boolean, boolean, boolean, boolean, boolean, boolean);
drop function public.get_push_settings();

create function public.get_push_settings()
returns table (enabled boolean, comments boolean, replies boolean, deals boolean,
               moderation boolean, reactions boolean, staff_alerts boolean)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return query
  select coalesce(s.enabled, true), coalesce(s.comments, true), coalesce(s.replies, true),
         coalesce(s.deals, true), coalesce(s.moderation, true), coalesce(s.reactions, false),
         coalesce(s.staff_alerts, true)
    from (select 1) d
    left join public.push_settings s on s.user_id = uid;
end $$;

create function public.set_push_settings(
  p_enabled boolean default null, p_comments boolean default null, p_replies boolean default null,
  p_deals boolean default null, p_moderation boolean default null, p_reactions boolean default null,
  p_staff_alerts boolean default null)
returns table (enabled boolean, comments boolean, replies boolean, deals boolean,
               moderation boolean, reactions boolean, staff_alerts boolean)
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  insert into public.push_settings as s
    (user_id, enabled, comments, replies, deals, moderation, reactions, staff_alerts)
  values (uid, coalesce(p_enabled, true), coalesce(p_comments, true), coalesce(p_replies, true),
          coalesce(p_deals, true), coalesce(p_moderation, true), coalesce(p_reactions, false),
          coalesce(p_staff_alerts, true))
  on conflict (user_id) do update set
    enabled      = coalesce(p_enabled,      s.enabled),
    comments     = coalesce(p_comments,     s.comments),
    replies      = coalesce(p_replies,      s.replies),
    deals        = coalesce(p_deals,        s.deals),
    moderation   = coalesce(p_moderation,   s.moderation),
    reactions    = coalesce(p_reactions,    s.reactions),
    staff_alerts = coalesce(p_staff_alerts, s.staff_alerts),
    updated_at   = now();
  return query select * from public.get_push_settings();
end $$;

revoke all on function public.get_push_settings() from public, anon;
revoke all on function public.set_push_settings(boolean, boolean, boolean, boolean, boolean, boolean, boolean)
  from public, anon;
grant execute on function public.get_push_settings() to authenticated;
grant execute on function public.set_push_settings(boolean, boolean, boolean, boolean, boolean, boolean, boolean)
  to authenticated;

-- ---------------------------------------------------------------------
-- 3. Sender: same as before plus the two staff types
-- ---------------------------------------------------------------------
create or replace function public.push_on_notification() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  cat       text;
  body_text text;
  s         public.push_settings%rowtype;
  allowed   boolean;
  tok_ids   uuid[];
  msgs      jsonb;
  req       bigint;
begin
  begin
    cat := case new.type
      when 'comment'           then 'comments'
      when 'reply'             then 'replies'
      when 'return_request'    then 'deals'
      when 'return_confirmed'  then 'deals'
      when 'sale_request'      then 'deals'
      when 'sale_confirmed'    then 'deals'
      when 'content_approved'  then 'moderation'
      when 'content_rejected'  then 'moderation'
      when 'content_removed'   then 'moderation'
      when 'reaction'          then 'reactions'
      when 'comment_reaction'  then 'reactions'
      when 'staff_report'      then 'staff'
      when 'staff_held'        then 'staff'
      else null end;
    if cat is null then return new; end if;

    if not coalesce((select a.push_enabled from public.app_settings a where a.id = 1), true) then
      return new;
    end if;

    -- Recipient must be an active account.
    if exists (select 1 from public.user_flags f
                where f.user_id = new.user_id and (f.status = 'banned' or f.deleted_at is not null)) then
      return new;
    end if;

    -- Staff alerts: the recipient must still be active staff right now.
    if cat = 'staff' and not exists (
         select 1 from public.user_flags f
          where f.user_id = new.user_id and f.role in ('moderator', 'admin')
            and f.status = 'active' and f.deleted_at is null) then
      return new;
    end if;

    -- Member switches (no row = defaults: all on, reactions off).
    select * into s from public.push_settings where user_id = new.user_id;
    if not found then
      s.enabled := true; s.comments := true; s.replies := true; s.deals := true;
      s.moderation := true; s.reactions := false; s.staff_alerts := true;
    end if;
    allowed := s.enabled and case cat
      when 'comments'   then s.comments
      when 'replies'    then s.replies
      when 'deals'      then s.deals
      when 'moderation' then s.moderation
      when 'staff'      then s.staff_alerts
      else s.reactions end;
    if not allowed then return new; end if;

    -- No push for blocked pairs (either direction) or for your own actions.
    if new.actor_id is not null then
      if new.actor_id = new.user_id then return new; end if;
      if exists (select 1 from public.user_blocks k
                  where (k.blocker_id = new.user_id and k.blocked_id = new.actor_id)
                     or (k.blocker_id = new.actor_id and k.blocked_id = new.user_id)) then
        return new;
      end if;
    end if;

    -- Hourly cap per member.
    if (select count(*) from public.push_outbox o
         where o.user_id = new.user_id and o.created_at > now() - interval '1 hour') >= 20 then
      return new;
    end if;

    select array_agg(t.id order by t.id) into tok_ids
      from public.push_tokens t where t.user_id = new.user_id and t.disabled_at is null;
    if tok_ids is null then return new; end if;

    body_text := case new.type
      when 'comment'          then case when new.target_type = 'listing'
                                        then 'Someone commented on your listing'
                                        else 'Someone commented on your post' end
      when 'reply'            then 'Someone replied to your comment'
      when 'reaction'         then 'Someone reacted to your post'
      when 'comment_reaction' then 'Someone reacted to your comment'
      when 'return_request'   then 'You have a new item return request'
      when 'return_confirmed' then 'An item return was confirmed'
      when 'sale_request'     then 'You have a new purchase confirmation request'
      when 'sale_confirmed'   then 'A sale was confirmed'
      when 'content_approved' then 'Your content was approved'
      when 'content_rejected' then 'Your content was not approved'
      when 'staff_report'     then 'New report to review'
      when 'staff_held'       then 'New item waiting for review'
      else 'Your content was removed' end;

    select jsonb_agg(jsonb_build_object(
             'to', t.token,
             'title', 'UNM Freedom Confessions',
             'body', body_text,
             'sound', 'default',
             'priority', 'high',
             'channelId', 'default',
             'data', jsonb_build_object(
                       'nid', new.id, 'type', new.type,
                       'targetType', new.target_type, 'targetId', new.target_id))
             order by t.id)
      into msgs
      from public.push_tokens t where t.id = any (tok_ids);

    select net.http_post(
             url     := 'https://exp.host/--/api/v2/push/send',
             body    := msgs,
             headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb)
      into req;

    insert into public.push_outbox (user_id, notification_id, request_id, token_ids)
    values (new.user_id, new.id, req, tok_ids);
  exception when others then
    raise warning 'push_on_notification failed: %', sqlerrm;
  end;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 4. Triggers that create the alerts (never block the report / the post)
-- ---------------------------------------------------------------------
create function public.staff_alert_on_report() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    -- Only the first open report on an item raises an alert.
    if exists (select 1 from public.reports r
                where r.target_type = new.target_type and r.target_id = new.target_id
                  and r.status = 'open' and r.id <> new.id) then
      return new;
    end if;
    insert into public.notifications (user_id, type, target_type, target_id, actor_id)
    select f.user_id, 'staff_report', new.target_type, new.target_id, null
      from public.user_flags f
     where f.role in ('moderator', 'admin') and f.status = 'active' and f.deleted_at is null
       and f.user_id <> new.reporter_id
       and not exists (select 1 from public.notifications n
                        where n.user_id = f.user_id and n.type = 'staff_report'
                          and n.created_at > now() - interval '15 minutes');
  exception when others then
    raise warning 'staff_alert_on_report failed: %', sqlerrm;
  end;
  return new;
end $$;

create function public.staff_alert_on_hold() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    insert into public.notifications (user_id, type, target_type, target_id, actor_id)
    select f.user_id, 'staff_held', new.target_type, new.target_id, null
      from public.user_flags f
     where f.role in ('moderator', 'admin') and f.status = 'active' and f.deleted_at is null
       and not exists (select 1 from public.notifications n
                        where n.user_id = f.user_id and n.type = 'staff_held'
                          and n.created_at > now() - interval '15 minutes');
  exception when others then
    raise warning 'staff_alert_on_hold failed: %', sqlerrm;
  end;
  return new;
end $$;

revoke all on function public.staff_alert_on_report() from public, anon, authenticated;
revoke all on function public.staff_alert_on_hold()   from public, anon, authenticated;

create trigger reports_staff_alert after insert on public.reports
  for each row execute function public.staff_alert_on_report();
create trigger holds_staff_alert after insert on public.moderation_holds
  for each row execute function public.staff_alert_on_hold();

-- ---------------------------------------------------------------------
-- 5. Hide the alerts from the notification list and the bell count
--    (same signatures and bodies as 20261026100000_account_settings.sql,
--     plus one filter line; the existing grants stay)
-- ---------------------------------------------------------------------
create or replace function public.get_notifications(
  p_before_ts  timestamptz default null,
  p_before_key text default null,
  p_limit      int default 20
) returns table (
  group_key         text,
  type              text,
  target_type       public.content_type,
  target_id         uuid,
  latest_at         timestamptz,
  event_count       int,
  actor_count       int,
  unread_count      int,
  actor_id          uuid,
  actor_nickname    text,
  actor_avatar_key  text,
  reaction_type     text,
  reason            text,
  target_exists     boolean,
  target_status     text,
  target_kind       text,
  target_preview    text,
  parent_post_id    uuid,
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
      and n.type not in ('staff_report', 'staff_held')
      and not exists (select 1 from public.user_blocks b
                       where b.blocker_id = (select auth.uid()) and b.blocked_id = n.actor_id)
      and not exists (select 1 from public.user_settings s
                       where s.user_id = (select auth.uid())
                         and ((n.type in ('reaction', 'comment_reaction') and not s.notify_reactions)
                           or (n.type = 'comment' and not s.notify_comments)
                           or (n.type = 'reply' and not s.notify_replies)))
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
    and n.type not in ('staff_report', 'staff_held')
    and not exists (select 1 from public.user_blocks b
                     where b.blocker_id = (select auth.uid()) and b.blocked_id = n.actor_id)
    and not exists (select 1 from public.user_settings s
                     where s.user_id = (select auth.uid())
                       and ((n.type in ('reaction', 'comment_reaction') and not s.notify_reactions)
                         or (n.type = 'comment' and not s.notify_comments)
                         or (n.type = 'reply' and not s.notify_replies)))
$$;

-- ---------------------------------------------------------------------
-- 6. Housekeeping: alerts older than 7 days are deleted (daily, 03:30 UTC)
-- ---------------------------------------------------------------------
create function public.purge_staff_alerts() returns void
language sql security definer set search_path = '' as $$
  delete from public.notifications
   where type in ('staff_report', 'staff_held') and created_at < now() - interval '7 days';
$$;
revoke all on function public.purge_staff_alerts() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('unm-staff-alerts-purge', '30 3 * * *', 'select public.purge_staff_alerts()');
  else
    raise notice 'pg_cron is not enabled: schedule purge_staff_alerts() once a day.';
  end if;
end $$;
