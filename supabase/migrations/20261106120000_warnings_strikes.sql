-- =====================================================================
-- v1.0.5 - Warnings, strikes and mute (staff tools)
--
--   member_strikes   one row per filter hit, warning or mute, per member. Staff see counts for
--                    30 and 90 days. It is its own table because the moderation log is purged
--                    after 30 days and a keyword hold row is deleted when staff decide.
--                    No automatic action is ever taken from strikes: staff decide.
--                    Rows older than 180 days are purged daily (pg_cron when available) and
--                    they are deleted when the account is deleted.
--   keyword hits     a trigger on moderation_holds adds a 'keyword_hit' strike for the AUTHOR
--                    each time content is held by the word filter, including an edit that hits
--                    the filter again (the edit path updates the hold row). Pre-moderation
--                    holds are not strikes. Staff are never held, so they never collect hits.
--                    Holds that already existed before this migration are not counted.
--   mod_warn_user    staff action: a reason from a fixed list plus an optional note (visible
--                    to the member). It writes the moderation log ('warn'), a strike and a
--                    member notification of type 'warning' with NO actor (the member is never
--                    told which staff member sent it). Moderators cannot warn staff; nobody can
--                    warn an admin; deleted accounts cannot be warned.
--   mod_mute_user    staff action: "mute" = read-only for 1 hour to 30 days. It is the existing
--                    timed suspension (it already blocks posting, commenting, reacting, editing,
--                    deleting and chat while reading stays possible), so it calls
--                    mod_set_user_status and adds the member notice and a strike. Lifting it
--                    early is the existing "restore user" action.
--   notification     type 'warning' (data: kind 'warning' | 'mute', reason, optional note, and
--                    'until' for a mute). The list already returns data->>'reason'; the full
--                    text (note, end time) is read with get_my_warning(notification id).
--                    The push text is generic ("You have a new notice from the moderators")
--                    and follows the member's master and moderation push switches; the in-app
--                    notice is always delivered.
--   mod_get_strikes  staff only: counts per kind for 30 and 90 days.
--
-- Older app builds keep working: they drop the unknown 'warning' row from the notification
-- list (each row is validated on its own) and still get the push text.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Allowed values
-- ---------------------------------------------------------------------
alter table public.moderation_actions drop constraint if exists moderation_actions_action_check;
alter table public.moderation_actions add constraint moderation_actions_action_check
  check (action in ('approve', 'reject', 'remove', 'restore', 'edit', 'suspend', 'ban', 'restore_user',
                    'remove_avatar', 'clear_details', 'warn'));

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('comment', 'reaction', 'comment_reaction', 'reply',
                  'content_approved', 'content_rejected', 'content_removed',
                  'return_request', 'return_confirmed',
                  'sale_request', 'sale_confirmed',
                  'staff_report', 'staff_held',
                  'warning'));

-- ---------------------------------------------------------------------
-- 2. Strikes
-- ---------------------------------------------------------------------
create table public.member_strikes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('keyword_hit', 'warning', 'mute')),
  target_type text,
  target_id   uuid,
  reason      text,
  actor_id    uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index member_strikes_user_idx    on public.member_strikes (user_id, created_at desc);
create index member_strikes_created_idx on public.member_strikes (created_at);
alter table public.member_strikes enable row level security;
revoke all on public.member_strikes from public, anon, authenticated;

create function public.strike_on_keyword_hold() returns trigger
language plpgsql security definer set search_path = '' as $$
declare author uuid;
begin
  begin
    if new.reason <> 'keyword' then return new; end if;
    author := case new.target_type
      when 'post'    then (select x.author_id from public.posts    x where x.id = new.target_id)
      when 'comment' then (select x.author_id from public.comments x where x.id = new.target_id)
      when 'listing' then (select x.author_id from public.listings x where x.id = new.target_id)
    end;
    if author is not null then
      insert into public.member_strikes (user_id, kind, target_type, target_id)
      values (author, 'keyword_hit', new.target_type::text, new.target_id);
    end if;
  exception when others then
    -- a strike failure must never block a post
    raise warning 'strike_on_keyword_hold failed: %', sqlerrm;
  end;
  return new;
end $$;
revoke all on function public.strike_on_keyword_hold() from public, anon, authenticated;
create trigger holds_strike after insert or update on public.moderation_holds
  for each row execute function public.strike_on_keyword_hold();

-- ---------------------------------------------------------------------
-- 3. Staff actions
-- ---------------------------------------------------------------------
create function public._warning_reason_ok(p_reason text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_reason in ('harassment', 'spam_scam', 'sexual_content', 'threats', 'filter_evasion', 'other'), false);
$$;
revoke all on function public._warning_reason_ok(text) from public, anon, authenticated;

create function public.mod_warn_user(p_user uuid, p_reason text, p_note text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  f     public.user_flags;
  note  text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_user is null or p_user = actor then raise exception 'cannot_target_self'; end if;
  if not public._warning_reason_ok(p_reason) then raise exception 'invalid_reason'; end if;
  if note is not null and char_length(note) > 300 then raise exception 'note_too_long'; end if;
  select * into f from public.user_flags where user_id = p_user;
  if not found or f.deleted_at is not null then raise exception 'not_found'; end if;
  if f.role = 'admin' then raise exception 'cannot_target_admin'; end if;
  if f.role <> 'user' and not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  insert into public.moderation_actions (actor_id, target_type, target_id, action, reason_code, note)
  values (actor, 'user', p_user, 'warn', p_reason, note);
  insert into public.member_strikes (user_id, kind, reason, actor_id)
  values (p_user, 'warning', p_reason, actor);
  insert into public.notifications (user_id, type, data)
  values (p_user, 'warning',
          jsonb_strip_nulls(jsonb_build_object('kind', 'warning', 'reason', p_reason, 'note', note)));
end $$;

create function public.mod_mute_user(p_user uuid, p_hours int, p_reason text, p_note text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  f     public.user_flags;
  note  text := nullif(btrim(coalesce(p_note, '')), '');
  until_ts timestamptz;
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_user is null or p_user = actor then raise exception 'cannot_target_self'; end if;
  if p_hours is null or p_hours < 1 or p_hours > 720 then raise exception 'invalid_duration'; end if;
  if not public._warning_reason_ok(p_reason) then raise exception 'invalid_reason'; end if;
  if note is not null and char_length(note) > 300 then raise exception 'note_too_long'; end if;
  select * into f from public.user_flags where user_id = p_user;
  if not found or f.deleted_at is not null then raise exception 'not_found'; end if;
  if f.role = 'admin' then raise exception 'cannot_target_admin'; end if;
  if f.role <> 'user' and not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  -- Already restricted: lift it first (restore user), then mute. A mute never shortens or
  -- replaces a longer restriction.
  if f.status = 'banned' or (f.status = 'suspended' and (f.suspended_until is null or f.suspended_until > now())) then
    raise exception 'already_restricted';
  end if;

  until_ts := now() + make_interval(hours => p_hours);
  -- the existing timed suspension: checks staff rights again and writes the moderation log
  perform public.mod_set_user_status(p_user, 'suspended', until_ts, p_reason);

  insert into public.member_strikes (user_id, kind, reason, actor_id)
  values (p_user, 'mute', p_reason, actor);
  insert into public.notifications (user_id, type, data)
  values (p_user, 'warning',
          jsonb_strip_nulls(jsonb_build_object('kind', 'mute', 'reason', p_reason, 'note', note,
                                               'until', until_ts)));
end $$;

create function public.mod_get_strikes(p_user uuid)
returns table (keyword_hits_30 int, keyword_hits_90 int, warnings_30 int, warnings_90 int,
               mutes_30 int, mutes_90 int, last_strike_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select (count(*) filter (where s.kind = 'keyword_hit' and s.created_at > now() - interval '30 days'))::int,
         (count(*) filter (where s.kind = 'keyword_hit' and s.created_at > now() - interval '90 days'))::int,
         (count(*) filter (where s.kind = 'warning'     and s.created_at > now() - interval '30 days'))::int,
         (count(*) filter (where s.kind = 'warning'     and s.created_at > now() - interval '90 days'))::int,
         (count(*) filter (where s.kind = 'mute'        and s.created_at > now() - interval '30 days'))::int,
         (count(*) filter (where s.kind = 'mute'        and s.created_at > now() - interval '90 days'))::int,
         max(s.created_at)
    from public.member_strikes s
   where s.user_id = p_user;
end $$;

-- ---------------------------------------------------------------------
-- 4. The member reads their own notice
-- ---------------------------------------------------------------------
create function public.get_my_warning(p_notification uuid)
returns table (kind text, reason text, note text, until_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return query
  select n.data ->> 'kind', n.data ->> 'reason', n.data ->> 'note',
         nullif(n.data ->> 'until', '')::timestamptz, n.created_at
    from public.notifications n
   where n.id = p_notification and n.user_id = uid and n.type = 'warning';
end $$;

-- ---------------------------------------------------------------------
-- 5. Housekeeping: strikes older than 180 days are deleted (daily, 03:50 UTC)
-- ---------------------------------------------------------------------
create function public.purge_member_strikes() returns void
language sql security definer set search_path = '' as $$
  delete from public.member_strikes where created_at < now() - interval '180 days';
$$;
revoke all on function public.purge_member_strikes() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('unm-strikes-purge', '50 3 * * *', 'select public.purge_member_strikes()');
  else
    raise notice 'pg_cron is not enabled: schedule purge_member_strikes() once a day.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 6. Grants (staff functions check is_staff() themselves)
-- ---------------------------------------------------------------------
revoke all on function public.mod_warn_user(uuid, text, text)       from public, anon, authenticated;
revoke all on function public.mod_mute_user(uuid, int, text, text)  from public, anon, authenticated;
revoke all on function public.mod_get_strikes(uuid)                 from public, anon, authenticated;
revoke all on function public.get_my_warning(uuid)                  from public, anon, authenticated;
grant execute on function public.mod_warn_user(uuid, text, text)      to authenticated;
grant execute on function public.mod_mute_user(uuid, int, text, text) to authenticated;
grant execute on function public.mod_get_strikes(uuid)                to authenticated;
grant execute on function public.get_my_warning(uuid)                 to authenticated;

-- ---------------------------------------------------------------------
-- 7. Push sender: identical to 20261101120000_staff_alerts.sql plus the 'warning' type
--    (category 'moderation', generic text)
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
      when 'warning'           then 'moderation'
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
      when 'warning'          then 'You have a new notice from the moderators'
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
-- 8. Account deletion: identical to 20261105100000_chat_core.sql plus the strikes delete
-- ---------------------------------------------------------------------
create or replace function public.delete_my_account(p_confirm text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid  uuid := (select auth.uid());
  nick text;
  f    public.user_flags;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select nickname into nick from public.profiles where id = uid;
  if not found then raise exception 'not_found'; end if;
  select * into f from public.user_flags where user_id = uid;
  if f.deleted_at is not null then raise exception 'not_found'; end if;
  if f.status = 'banned'
     or (f.status = 'suspended' and (f.suspended_until is null or f.suspended_until > now())) then
    raise exception 'account_restricted' using errcode = '42501';
  end if;
  if lower(btrim(coalesce(p_confirm, ''))) <> lower(coalesce(nick, 'delete')) then
    raise exception 'confirm_mismatch';
  end if;
  if f.role = 'admin' and not exists (
       select 1 from public.user_flags o
        where o.role = 'admin' and o.status = 'active' and o.user_id <> uid) then
    raise exception 'last_admin';
  end if;

  -- Only their own blocks go. Other people's blocks of this user stay, so
  -- a blocked person's old posts do not come back after they delete.
  delete from public.user_blocks   where blocker_id = uid;
  delete from public.notifications where user_id = uid;
  delete from public.user_settings where user_id = uid;

  -- Push data goes at once: phone tokens, switches and the send log.
  delete from public.push_tokens   where user_id = uid;
  delete from public.push_settings where user_id = uid;
  delete from public.push_outbox   where user_id = uid;

  -- The app version record goes too.
  delete from public.member_app_versions where user_id = uid;

  -- Chats go for both sides (messages and per-member state cascade), plus chat settings.
  delete from public.chat_conversations where member_a = uid or member_b = uid;
  delete from public.chat_settings      where user_id = uid;
  -- Strikes (filter hits, warnings, mutes) go with the account.
  delete from public.member_strikes     where user_id = uid;

  -- Nobody is left to answer buyers or finders.
  update public.listings set is_closed = true where author_id = uid and not is_closed;

  -- A sign-in token stays valid for a while after deletion, so the
  -- leftover profile is also locked: it can never act again.
  update public.user_flags
     set role = 'user', status = 'banned', deleted_at = now(),
         status_reason = case when status = 'banned' then status_reason else 'account_deleted' end
   where user_id = uid;

  perform set_config('app.account_change', 'on', true);
  update public.profiles set nickname = null, avatar_key = 'avatar_01' where id = uid;
  perform set_config('app.account_change', 'off', true);

  delete from auth.users where id = uid;
end $$;

create or replace function public.admin_delete_account(p_user uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  f     public.user_flags;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_user = actor then raise exception 'cannot_target_self'; end if;
  p_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if p_reason is null then raise exception 'reason_required'; end if;
  if char_length(p_reason) > 300 then raise exception 'reason_too_long'; end if;
  select * into f from public.user_flags where user_id = p_user for update;
  if not found or f.deleted_at is not null then raise exception 'not_found'; end if;
  if f.role = 'admin' then raise exception 'cannot_target_admin'; end if;
  if not (f.status = 'banned'
          or (f.status = 'suspended' and (f.suspended_until is null or f.suspended_until > now()))) then
    raise exception 'account_not_restricted';
  end if;

  delete from public.user_blocks   where blocker_id = p_user;
  delete from public.notifications where user_id = p_user;
  delete from public.user_settings where user_id = p_user;

  delete from public.push_tokens   where user_id = p_user;
  delete from public.push_settings where user_id = p_user;
  delete from public.push_outbox   where user_id = p_user;
  delete from public.member_app_versions where user_id = p_user;

  -- Added: chats (both sides) and chat settings.
  delete from public.chat_conversations where member_a = p_user or member_b = p_user;
  delete from public.chat_settings      where user_id = p_user;
  -- Added: strikes.
  delete from public.member_strikes     where user_id = p_user;

  update public.listings set is_closed = true where author_id = p_user and not is_closed;

  update public.user_flags
     set role = 'user', status = 'banned', deleted_at = now(),
         status_reason = case when status = 'banned' then status_reason else 'account_deleted' end,
         updated_at = now()
   where user_id = p_user;

  perform set_config('app.account_change', 'on', true);
  update public.profiles set nickname = null, avatar_key = 'avatar_01' where id = p_user;
  perform set_config('app.account_change', 'off', true);

  insert into public.admin_audit_log (admin_id, action, subject_user_id, detail)
  values (actor, 'delete_account', p_user, p_reason);

  delete from auth.users where id = p_user;
end $$;
