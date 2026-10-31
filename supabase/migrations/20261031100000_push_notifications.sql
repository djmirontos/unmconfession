-- Push notifications, step 1 (database only).
--
-- Every row inserted into public.notifications can become one push message, sent straight from
-- the database to Expo's push service through pg_net. No Edge Function, no secret, no service_role.
--
-- Delivery rules (all enforced in public.push_on_notification()):
--   * the member has the master switch on and the switch for that kind of notification on
--     (reactions are OFF by default; everything else is ON)
--   * the account is not banned or deleted, and there is no block either way with the actor
--   * at most 20 pushes per member per hour (a flood of comments cannot spam a phone)
--   * the global kill switch app_settings.push_enabled is on
-- Message text is generic on purpose: no nicknames and no confession text on a lock screen.
-- A push failure never blocks the action that caused it (the trigger swallows errors with a warning).
--
-- Dead tokens: Expo's reply to each request is read every 10 minutes by public.process_push_responses().
-- Tokens reported as DeviceNotRegistered are switched off, and tokens the app has not refreshed in
-- 60 days are deleted. The app re-registers its token on every launch, which refreshes updated_at.
--
-- Requires the pg_net and pg_cron extensions (already enabled on this project).

-- ---------------------------------------------------------------------
-- 1. Global kill switch
-- ---------------------------------------------------------------------
alter table public.app_settings
  add column if not exists push_enabled boolean not null default true;

-- ---------------------------------------------------------------------
-- 2. Tables (RLS on, no policies, no API grants: access only through functions)
-- ---------------------------------------------------------------------
create table public.push_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  token       text not null unique
              check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,100}\]$'),
  platform    text not null check (platform in ('android', 'ios')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  disabled_at timestamptz
);
create index push_tokens_user_idx on public.push_tokens (user_id) where disabled_at is null;
create index push_tokens_updated_idx on public.push_tokens (updated_at);

create table public.push_settings (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  enabled    boolean not null default true,
  comments   boolean not null default true,
  replies    boolean not null default true,
  deals      boolean not null default true,
  moderation boolean not null default true,
  reactions  boolean not null default false,
  updated_at timestamptz not null default now()
);

-- One row per request sent to Expo. Used for the hourly cap and to match Expo's reply to tokens.
create table public.push_outbox (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  notification_id uuid,
  request_id      bigint,
  token_ids       uuid[] not null,
  created_at      timestamptz not null default now(),
  processed_at    timestamptz
);
create index push_outbox_user_time_idx on public.push_outbox (user_id, created_at desc);
create index push_outbox_pending_idx   on public.push_outbox (created_at) where processed_at is null;

alter table public.push_tokens   enable row level security;
alter table public.push_settings enable row level security;
alter table public.push_outbox   enable row level security;
revoke all on public.push_tokens, public.push_settings, public.push_outbox from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Member RPCs (signed-in only)
-- ---------------------------------------------------------------------
create function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_platform is null or p_platform not in ('android', 'ios') then
    raise exception 'invalid_platform' using errcode = '22023';
  end if;
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,100}\]$' then
    raise exception 'invalid_token' using errcode = '22023';
  end if;
  if exists (select 1 from public.user_flags f
              where f.user_id = uid and (f.status = 'banned' or f.deleted_at is not null)) then
    raise exception 'account_unavailable' using errcode = '42501';
  end if;

  -- A token belongs to one phone. If another account signed in on it, it moves to the current account.
  insert into public.push_tokens (user_id, token, platform)
  values (uid, p_token, p_platform)
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform,
        disabled_at = null, updated_at = now();

  -- Keep at most 5 active phones per member (newest wins).
  update public.push_tokens t set disabled_at = now()
   where t.user_id = uid and t.disabled_at is null
     and t.id not in (select x.id from public.push_tokens x
                       where x.user_id = uid and x.disabled_at is null
                       order by x.updated_at desc, x.id limit 5);
end $$;

create function public.unregister_push_token(p_token text)
returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  delete from public.push_tokens where token = p_token and user_id = uid;
end $$;

create function public.get_push_settings()
returns table (enabled boolean, comments boolean, replies boolean, deals boolean,
               moderation boolean, reactions boolean)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return query
  select coalesce(s.enabled, true), coalesce(s.comments, true), coalesce(s.replies, true),
         coalesce(s.deals, true), coalesce(s.moderation, true), coalesce(s.reactions, false)
    from (select 1) d
    left join public.push_settings s on s.user_id = uid;
end $$;

-- Only the switches you pass (not null) change.
create function public.set_push_settings(
  p_enabled boolean default null, p_comments boolean default null, p_replies boolean default null,
  p_deals boolean default null, p_moderation boolean default null, p_reactions boolean default null)
returns table (enabled boolean, comments boolean, replies boolean, deals boolean,
               moderation boolean, reactions boolean)
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  insert into public.push_settings as s (user_id, enabled, comments, replies, deals, moderation, reactions)
  values (uid, coalesce(p_enabled, true), coalesce(p_comments, true), coalesce(p_replies, true),
          coalesce(p_deals, true), coalesce(p_moderation, true), coalesce(p_reactions, false))
  on conflict (user_id) do update set
    enabled    = coalesce(p_enabled,    s.enabled),
    comments   = coalesce(p_comments,   s.comments),
    replies    = coalesce(p_replies,    s.replies),
    deals      = coalesce(p_deals,      s.deals),
    moderation = coalesce(p_moderation, s.moderation),
    reactions  = coalesce(p_reactions,  s.reactions),
    updated_at = now();
  return query select * from public.get_push_settings();
end $$;

revoke all on function public.register_push_token(text, text) from public, anon;
revoke all on function public.unregister_push_token(text)     from public, anon;
revoke all on function public.get_push_settings()             from public, anon;
revoke all on function public.set_push_settings(boolean, boolean, boolean, boolean, boolean, boolean)
  from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.unregister_push_token(text)     to authenticated;
grant execute on function public.get_push_settings()             to authenticated;
grant execute on function public.set_push_settings(boolean, boolean, boolean, boolean, boolean, boolean)
  to authenticated;

-- ---------------------------------------------------------------------
-- 4. Sender: one notification row -> one request to Expo
-- ---------------------------------------------------------------------
create function public.push_on_notification() returns trigger
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

    -- Member switches (no row = defaults: all on, reactions off).
    select * into s from public.push_settings where user_id = new.user_id;
    if not found then
      s.enabled := true; s.comments := true; s.replies := true; s.deals := true;
      s.moderation := true; s.reactions := false;
    end if;
    allowed := s.enabled and case cat
      when 'comments'   then s.comments
      when 'replies'    then s.replies
      when 'deals'      then s.deals
      when 'moderation' then s.moderation
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

revoke all on function public.push_on_notification() from public, anon, authenticated;

create trigger notifications_push_after_insert
  after insert on public.notifications
  for each row execute function public.push_on_notification();

-- ---------------------------------------------------------------------
-- 5. Housekeeping (cron every 10 minutes): read Expo's replies, retire dead tokens
-- ---------------------------------------------------------------------
create function public.process_push_responses() returns void
language plpgsql security definer set search_path = '' as $$
declare
  o       record;
  resp    record;
  tickets jsonb;
  i       int;
begin
  for o in
    select * from public.push_outbox
     where processed_at is null and created_at < now() - interval '1 minute'
     order by id limit 500
  loop
    select r.status_code, r.content into resp from net._http_response r where r.id = o.request_id;

    if not found then
      -- pg_net keeps responses for a few hours; after that the reply is gone.
      if o.created_at < now() - interval '2 hours' then
        update public.push_outbox set processed_at = now() where id = o.id;
      end if;
      continue;
    end if;

    if resp.status_code between 200 and 299 then
      begin
        tickets := (resp.content::jsonb) -> 'data';
        if jsonb_typeof(tickets) = 'array' then
          for i in 0 .. jsonb_array_length(tickets) - 1 loop
            if tickets -> i ->> 'status' = 'error' then
              if tickets -> i -> 'details' ->> 'error' = 'DeviceNotRegistered'
                 and i + 1 <= coalesce(array_length(o.token_ids, 1), 0) then
                update public.push_tokens set disabled_at = now()
                 where id = o.token_ids[i + 1] and disabled_at is null;
              else
                raise warning 'push ticket error: %', left(tickets -> i ->> 'message', 200);
              end if;
            end if;
          end loop;
        end if;
      exception when others then
        raise warning 'push response not understood (outbox %): %', o.id, sqlerrm;
      end;
    else
      raise warning 'push request failed (outbox %): HTTP %', o.id, resp.status_code;
    end if;

    update public.push_outbox set processed_at = now() where id = o.id;
  end loop;

  delete from public.push_outbox where processed_at is not null and processed_at < now() - interval '2 days';
  delete from public.push_tokens where updated_at < now() - interval '60 days';
end $$;

revoke all on function public.process_push_responses() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('unm-push-responses', '*/10 * * * *', 'select public.process_push_responses()');
  else
    raise notice 'pg_cron is not enabled: schedule process_push_responses() every 10 minutes.';
  end if;
end $$;
