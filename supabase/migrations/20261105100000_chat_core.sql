-- =====================================================================
-- v1.0.5 - 1:1 chat, stage 1: the database core (no app screens yet)
--
-- What this adds (additions only; nothing existing changes except the two account
-- deletion functions and the app_settings guard, which get the new rows / fields):
--
--   app_settings   chat_mode ('off' | 'staff' | 'on', default 'off') and the limits.
--                  Every chat function refuses while chat_mode = 'off'. In 'staff' mode only
--                  staff can use chat, and only with other staff (for testing before launch).
--                  Admin-only to change, like the other launch switches.
--   chat_conversations  one row per pair of members, whoever starts it. It holds the request
--                  (pending / accepted / declined) and its one short first message.
--   chat_messages  the messages. Deleting your own message clears its text and keeps a stub.
--                  attachments is reserved for photos (phase 2) and must stay empty for now.
--   chat_members   per-member state of a conversation: last read, mute, "deleted for me".
--   chat_settings  per member: who can message me (everyone | nobody), show my online status,
--                  and the last activity time used for "online".
--
-- Rules enforced here, in the database (the app is never trusted):
--   * Every function starts with assert_active_member(): guests, banned, suspended and
--     members without a nickname are refused. Guests have no grants at all.
--   * Request first: one text message of 1-200 characters, no links, e-mail addresses or phone
--     numbers, and not matching the staff keyword list. Nothing else can be sent until the
--     other member accepts. Declining starts a cooldown (default 7 days) for the member who
--     asked; the member who declined may still write first.
--   * Daily cap on new requests and a per-minute cap on messages (settings below).
--   * Blocks (user_blocks kind 'block') are checked in both directions in every function; a
--     blocked pair gets not_found and never appears in lists. kind 'mute' is a different
--     thing and is NOT used here: chat mute is its own per-conversation flag.
--   * Banned or deleted members disappear from lists and cannot be written to.
--   * Online: a member is "online" when active in the last 2 minutes. It is returned only for
--     the other side of an accepted conversation and is null when they hide it (decided on the
--     server, so a hidden status never reaches the phone). No exact last-seen time exists.
--   * Account deletion (by the member or by an admin) removes their conversations for both
--     sides, with all messages, plus their chat settings.
--   * Messages older than chat_retention_days are purged daily (pg_cron when available).
--
-- Not in this stage: live updates (broadcast), push, reports with message snapshots and the
-- admin view, photos. The switch stays 'off' until those exist.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Settings
-- ---------------------------------------------------------------------
alter table public.app_settings
  add column chat_mode                  text not null default 'off' check (chat_mode in ('off', 'staff', 'on')),
  add column chat_requests_per_day      int  not null default 10 check (chat_requests_per_day between 1 and 100),
  add column chat_messages_per_minute   int  not null default 20 check (chat_messages_per_minute between 1 and 120),
  add column chat_request_cooldown_days int  not null default 7  check (chat_request_cooldown_days between 0 and 90),
  add column chat_retention_days        int  not null default 180 check (chat_retention_days between 7 and 3650);

-- Same guard as before (20261102100000_soft_update.sql) plus the chat fields.
create or replace function public.app_settings_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- auth.uid() is null for dashboard/service-role changes, which are allowed.
  if (select auth.uid()) is not null and not public.is_admin() then
    if new.moderation_mode is distinct from old.moderation_mode
       or new.audit_retention_days is distinct from old.audit_retention_days
       or new.rejected_retention_days is distinct from old.rejected_retention_days
       or new.min_app_version is distinct from old.min_app_version
       or new.update_url is distinct from old.update_url
       or new.update_message is distinct from old.update_message
       or new.latest_app_version is distinct from old.latest_app_version
       or new.play_update_url is distinct from old.play_update_url
       or new.latest_update_message is distinct from old.latest_update_message
       or new.chat_mode is distinct from old.chat_mode
       or new.chat_requests_per_day is distinct from old.chat_requests_per_day
       or new.chat_messages_per_minute is distinct from old.chat_messages_per_minute
       or new.chat_request_cooldown_days is distinct from old.chat_request_cooldown_days
       or new.chat_retention_days is distinct from old.chat_retention_days then
      raise exception 'admin_only' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 2. Tables (RLS on, no policies, no API grants: access only through functions)
-- ---------------------------------------------------------------------
create table public.chat_conversations (
  id              uuid primary key default gen_random_uuid(),
  member_a        uuid not null references public.profiles (id) on delete cascade,
  member_b        uuid not null references public.profiles (id) on delete cascade,
  status          text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  requested_by    uuid not null references public.profiles (id) on delete cascade,
  request_body    text not null check (char_length(btrim(request_body)) between 1 and 200),
  requested_at    timestamptz not null default now(),
  accepted_at     timestamptz,
  declined_at     timestamptz,
  last_message_at timestamptz,
  created_at      timestamptz not null default now(),
  constraint chat_conversations_pair_order check (member_a < member_b),
  constraint chat_conversations_pair_key   unique (member_a, member_b),
  constraint chat_conversations_requester  check (requested_by in (member_a, member_b))
);
create index chat_conversations_a_idx   on public.chat_conversations (member_a, last_message_at desc nulls last);
create index chat_conversations_b_idx   on public.chat_conversations (member_b, last_message_at desc nulls last);
create index chat_conversations_req_idx on public.chat_conversations (requested_by, requested_at desc);

create table public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete cascade,
  body            text,
  reply_to_id     uuid references public.chat_messages (id) on delete set null,
  attachments     jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint chat_messages_body check (
    (deleted_at is null     and body is not null and char_length(btrim(body)) between 1 and 2000)
    or (deleted_at is not null and body is null)
  ),
  -- Phase 2 (photos) relaxes this in its own migration.
  constraint chat_messages_attachments check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) = 0)
);
create index chat_messages_conv_idx   on public.chat_messages (conversation_id, created_at desc, id desc);
create index chat_messages_sender_idx on public.chat_messages (sender_id, created_at desc);
create index chat_messages_created_idx on public.chat_messages (created_at);

create table public.chat_members (
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  last_read_at    timestamptz,
  muted           boolean not null default false,
  cleared_before  timestamptz,
  hidden          boolean not null default false,
  primary key (conversation_id, user_id)
);
create index chat_members_user_idx on public.chat_members (user_id);

create table public.chat_settings (
  user_id          uuid primary key references public.profiles (id) on delete cascade,
  who_can_message  text not null default 'everyone' check (who_can_message in ('everyone', 'nobody')),
  show_online      boolean not null default true,
  last_active_at   timestamptz
);

alter table public.chat_conversations enable row level security;
alter table public.chat_messages      enable row level security;
alter table public.chat_members       enable row level security;
alter table public.chat_settings      enable row level security;
revoke all on public.chat_conversations from public, anon, authenticated;
revoke all on public.chat_messages      from public, anon, authenticated;
revoke all on public.chat_members       from public, anon, authenticated;
revoke all on public.chat_settings      from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Internal helpers (not callable by the API roles)
-- ---------------------------------------------------------------------
-- The signed-in, active member, and only while chat is switched on for them.
create function public._chat_member() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := public.assert_active_member();
  m   text;
begin
  select chat_mode into m from public.app_settings where id = 1;
  if m = 'off' or (m = 'staff' and not public.is_staff()) then
    raise exception 'chat_disabled' using errcode = '42501';
  end if;
  return uid;
end $$;

create function public._chat_is_staff_user(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_flags f
                  where f.user_id = p_user and f.role in ('moderator', 'admin') and f.status = 'active');
$$;

-- A block in either direction.
create function public._chat_blocked(p_a uuid, p_b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_blocks b
                  where b.kind = 'block'
                    and ((b.blocker_id = p_a and b.blocked_id = p_b)
                      or (b.blocker_id = p_b and b.blocked_id = p_a)));
$$;

-- Someone who can be written to: has a nickname, not banned, not deleted.
create function public._chat_available(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_flags f
                   join public.profiles p on p.id = f.user_id
                  where f.user_id = p_user and f.status <> 'banned'
                    and f.deleted_at is null and p.nickname is not null);
$$;

revoke all on function public._chat_member()                    from public, anon, authenticated;
revoke all on function public._chat_is_staff_user(uuid)         from public, anon, authenticated;
revoke all on function public._chat_blocked(uuid, uuid)         from public, anon, authenticated;
revoke all on function public._chat_available(uuid)             from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Requests
-- ---------------------------------------------------------------------
create function public.send_chat_request(p_to uuid, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid     uuid := public._chat_member();
  m       text;
  body    text := btrim(coalesce(p_body, ''));
  who     text;
  lim     int;
  cd      int;
  a       uuid;
  b       uuid;
  c       public.chat_conversations;
  d       record;
  cid     uuid;
begin
  if p_to is null then raise exception 'not_found'; end if;
  if p_to = uid then raise exception 'cannot_message_self'; end if;
  if char_length(body) < 1 then raise exception 'body_required'; end if;
  if char_length(body) > 200 then raise exception 'body_too_long'; end if;

  select chat_mode, chat_requests_per_day, chat_request_cooldown_days
    into m, lim, cd from public.app_settings where id = 1;
  if m = 'staff' and not public._chat_is_staff_user(p_to) then raise exception 'not_found'; end if;
  if not public._chat_available(p_to) or public._chat_blocked(uid, p_to) then
    raise exception 'not_found';
  end if;

  select s.who_can_message into who from public.chat_settings s where s.user_id = p_to;
  if coalesce(who, 'everyone') = 'nobody' then raise exception 'not_accepting_messages'; end if;

  -- Staff keyword list; links, e-mail addresses and phone numbers are not allowed in requests.
  select * into d from public._moderation_decision('comment', body);
  if d.out_reason = 'keyword' then raise exception 'message_not_allowed'; end if;
  if body ~* '(https?://|www\.|[a-z0-9-]+\.(com|net|org|ph|io|me|gg|ly|co|app|xyz|info|edu)([^a-z0-9]|$))'
     or body ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
     or body ~ '([0-9][ ().-]?){9,}' then
    raise exception 'contact_info_not_allowed';
  end if;

  a := least(uid, p_to);
  b := greatest(uid, p_to);
  select * into c from public.chat_conversations where member_a = a and member_b = b for update;

  if found then
    if c.status = 'accepted' then raise exception 'already_chatting'; end if;
    if c.status = 'pending' then
      if c.requested_by = uid then raise exception 'request_pending'; end if;
      raise exception 'request_incoming';
    end if;
    -- declined: the member who asked waits out the cooldown; the one who declined does not
    if c.requested_by = uid and c.declined_at > now() - make_interval(days => cd) then
      raise exception 'request_cooldown';
    end if;
  end if;

  if (select count(*) from public.chat_conversations
       where requested_by = uid and requested_at > now() - interval '24 hours') >= lim then
    raise exception 'request_limit';
  end if;

  if found then
    update public.chat_conversations
       set status = 'pending', requested_by = uid, request_body = body,
           requested_at = now(), declined_at = null
     where id = c.id
     returning id into cid;
  else
    begin
      insert into public.chat_conversations (member_a, member_b, requested_by, request_body)
      values (a, b, uid, body) returning id into cid;
    exception when unique_violation then
      raise exception 'request_pending';
    end;
  end if;

  insert into public.chat_members (conversation_id, user_id) values (cid, a), (cid, b)
  on conflict do nothing;
  return cid;
end $$;

create function public.respond_chat_request(p_conversation uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid   uuid := public._chat_member();
  c     public.chat_conversations;
  other uuid;
begin
  if p_accept is null then raise exception 'invalid_input'; end if;
  select * into c from public.chat_conversations
   where id = p_conversation and uid in (member_a, member_b) for update;
  if not found or c.status <> 'pending' or c.requested_by = uid then raise exception 'not_found'; end if;
  other := c.requested_by;
  if public._chat_blocked(uid, other) or not public._chat_available(other) then
    raise exception 'not_found';
  end if;

  if p_accept then
    update public.chat_conversations
       set status = 'accepted', accepted_at = now(), last_message_at = c.requested_at
     where id = c.id;
    -- the request text becomes the first message of the chat
    insert into public.chat_messages (conversation_id, sender_id, body, created_at)
    values (c.id, other, c.request_body, c.requested_at);
    update public.chat_members set last_read_at = now(), hidden = false
     where conversation_id = c.id;
  else
    update public.chat_conversations set status = 'declined', declined_at = now() where id = c.id;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 5. Messages
-- ---------------------------------------------------------------------
create function public.send_chat_message(p_conversation uuid, p_body text, p_reply_to uuid default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid   uuid := public._chat_member();
  body  text := btrim(coalesce(p_body, ''));
  c     public.chat_conversations;
  other uuid;
  lim   int;
  mid   uuid;
begin
  if char_length(body) < 1 then raise exception 'body_required'; end if;
  if char_length(body) > 2000 then raise exception 'body_too_long'; end if;

  select * into c from public.chat_conversations
   where id = p_conversation and uid in (member_a, member_b) and status = 'accepted';
  if not found then raise exception 'not_found'; end if;
  other := case when c.member_a = uid then c.member_b else c.member_a end;
  if public._chat_blocked(uid, other) then raise exception 'not_found'; end if;
  if not public._chat_available(other) then raise exception 'recipient_unavailable'; end if;

  select chat_messages_per_minute into lim from public.app_settings where id = 1;
  if (select count(*) from public.chat_messages
       where sender_id = uid and created_at > now() - interval '1 minute') >= lim then
    raise exception 'rate_limited';
  end if;

  if p_reply_to is not null and not exists (
       select 1 from public.chat_messages r where r.id = p_reply_to and r.conversation_id = c.id) then
    raise exception 'invalid_reply';
  end if;

  insert into public.chat_messages (conversation_id, sender_id, body, reply_to_id)
  values (c.id, uid, body, p_reply_to) returning id into mid;

  update public.chat_conversations set last_message_at = now() where id = c.id;
  -- the other side sees the chat again even if they deleted it for themselves
  update public.chat_members set hidden = false where conversation_id = c.id;
  update public.chat_members set last_read_at = now() where conversation_id = c.id and user_id = uid;
  return mid;
end $$;

create function public.delete_my_chat_message(p_message uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._chat_member();
begin
  update public.chat_messages set body = null, deleted_at = now()
   where id = p_message and sender_id = uid and deleted_at is null;
  if not found then raise exception 'not_found'; end if;
end $$;

create function public.mark_chat_read(p_conversation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._chat_member();
begin
  update public.chat_members set last_read_at = now()
   where conversation_id = p_conversation and user_id = uid;
  if not found then raise exception 'not_found'; end if;
end $$;

create function public.set_chat_muted(p_conversation uuid, p_muted boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._chat_member();
begin
  if p_muted is null then raise exception 'invalid_input'; end if;
  update public.chat_members set muted = p_muted
   where conversation_id = p_conversation and user_id = uid;
  if not found then raise exception 'not_found'; end if;
end $$;

-- "Delete chat for me": hides it and everything so far for this member only.
create function public.delete_chat_for_me(p_conversation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._chat_member();
begin
  update public.chat_members set hidden = true, cleared_before = now(), last_read_at = now()
   where conversation_id = p_conversation and user_id = uid
     and exists (select 1 from public.chat_conversations c
                  where c.id = p_conversation and c.status = 'accepted');
  if not found then raise exception 'not_found'; end if;
end $$;

-- ---------------------------------------------------------------------
-- 6. Reads
-- ---------------------------------------------------------------------
-- Accepted chats plus requests I sent that are still waiting. A declined request is not
-- shown to the member who sent it.
create function public.get_conversations()
returns table (conversation_id uuid, status text, other_id uuid, other_nickname text,
               other_avatar_key text, last_message_body text, last_message_at timestamptz,
               last_message_sender uuid, unread_count int, muted boolean, is_online boolean)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public._chat_member();
begin
  return query
  select c.id,
         case when c.status = 'accepted' then 'accepted' else 'pending_sent' end,
         o.id, o.nickname, o.avatar_key,
         case when c.status = 'accepted' then lm.body else c.request_body end,
         case when c.status = 'accepted' then coalesce(lm.created_at, c.accepted_at) else c.requested_at end,
         case when c.status = 'accepted' then lm.sender_id else c.requested_by end,
         case when c.status = 'accepted' then
           (select count(*)::int from public.chat_messages m
             where m.conversation_id = c.id and m.sender_id <> uid and m.deleted_at is null
               and m.created_at > coalesce(cm.last_read_at, '-infinity'::timestamptz)
               and (cm.cleared_before is null or m.created_at > cm.cleared_before))
         else 0 end,
         cm.muted,
         case when c.status = 'accepted' and s.show_online is not false
                   and s.last_active_at > now() - interval '2 minutes'
              then true
              when c.status = 'accepted' and s.show_online is not false then false
              else null end
    from public.chat_conversations c
    join public.chat_members cm on cm.conversation_id = c.id and cm.user_id = uid
    join public.profiles o on o.id = case when c.member_a = uid then c.member_b else c.member_a end
    join public.user_flags of_ on of_.user_id = o.id
    left join public.chat_settings s on s.user_id = o.id
    left join lateral (
      select m.body, m.created_at, m.sender_id
        from public.chat_messages m
       where m.conversation_id = c.id
         and (cm.cleared_before is null or m.created_at > cm.cleared_before)
       order by m.created_at desc, m.id desc limit 1
    ) lm on true
   where uid in (c.member_a, c.member_b)
     and ((c.status = 'accepted' and not cm.hidden)
          or (c.status = 'pending' and c.requested_by = uid))
     and of_.status <> 'banned' and of_.deleted_at is null and o.nickname is not null
     and not public._chat_blocked(uid, o.id)
   order by case when c.status = 'accepted' then coalesce(lm.created_at, c.accepted_at) else c.requested_at end desc,
            c.id;
end $$;

create function public.get_chat_requests()
returns table (conversation_id uuid, from_id uuid, from_nickname text, from_avatar_key text,
               body text, requested_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public._chat_member();
begin
  return query
  select c.id, o.id, o.nickname, o.avatar_key, c.request_body, c.requested_at
    from public.chat_conversations c
    join public.profiles o on o.id = c.requested_by
    join public.user_flags of_ on of_.user_id = o.id
   where uid in (c.member_a, c.member_b) and c.status = 'pending' and c.requested_by <> uid
     and of_.status <> 'banned' and of_.deleted_at is null and o.nickname is not null
     and not public._chat_blocked(uid, o.id)
   order by c.requested_at desc, c.id;
end $$;

-- Newest first, keyset paging on (created_at, id).
create function public.get_messages(p_conversation uuid, p_before_at timestamptz default null,
                                    p_before_id uuid default null, p_limit int default 30)
returns table (id uuid, sender_id uuid, body text, reply_to_id uuid, reply_body text,
               reply_sender_id uuid, created_at timestamptz, deleted boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid   uuid := public._chat_member();
  c     public.chat_conversations;
  other uuid;
  cleared timestamptz;
  lim   int := least(greatest(coalesce(p_limit, 30), 1), 100);
begin
  select * into c from public.chat_conversations
   where chat_conversations.id = p_conversation and uid in (member_a, member_b) and status = 'accepted';
  if not found then raise exception 'not_found'; end if;
  other := case when c.member_a = uid then c.member_b else c.member_a end;
  if public._chat_blocked(uid, other) then raise exception 'not_found'; end if;
  select cm.cleared_before into cleared from public.chat_members cm
   where cm.conversation_id = c.id and cm.user_id = uid;

  return query
  select m.id, m.sender_id, m.body, m.reply_to_id,
         case when r.deleted_at is null and (cleared is null or r.created_at > cleared) then r.body end,
         case when r.deleted_at is null and (cleared is null or r.created_at > cleared) then r.sender_id end,
         m.created_at, (m.deleted_at is not null)
    from public.chat_messages m
    left join public.chat_messages r on r.id = m.reply_to_id and r.conversation_id = m.conversation_id
   where m.conversation_id = c.id
     and (cleared is null or m.created_at > cleared)
     and (p_before_at is null or p_before_id is null or (m.created_at, m.id) < (p_before_at, p_before_id))
   order by m.created_at desc, m.id desc
   limit lim;
end $$;

-- For the Chats tab badge: chats with something unread (muted chats excluded) and requests waiting.
create function public.get_chat_unread_count()
returns table (unread_chats int, pending_requests int)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public._chat_member();
begin
  return query
  select (select count(*)::int
            from public.chat_conversations c
            join public.chat_members cm on cm.conversation_id = c.id and cm.user_id = uid
            join public.user_flags of_ on of_.user_id = case when c.member_a = uid then c.member_b else c.member_a end
           where uid in (c.member_a, c.member_b) and c.status = 'accepted'
             and not cm.hidden and not cm.muted
             and of_.status <> 'banned' and of_.deleted_at is null
             and not public._chat_blocked(uid, case when c.member_a = uid then c.member_b else c.member_a end)
             and exists (select 1 from public.chat_messages m
                          where m.conversation_id = c.id and m.sender_id <> uid and m.deleted_at is null
                            and m.created_at > coalesce(cm.last_read_at, '-infinity'::timestamptz)
                            and (cm.cleared_before is null or m.created_at > cm.cleared_before))),
         (select count(*)::int from public.get_chat_requests());
end $$;

-- ---------------------------------------------------------------------
-- 7. My chat settings and presence
-- ---------------------------------------------------------------------
create function public.get_chat_settings()
returns table (who_can_message text, show_online boolean)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public._chat_member();
begin
  return query
  select coalesce(s.who_can_message, 'everyone'), coalesce(s.show_online, true)
    from (select 1) x left join public.chat_settings s on s.user_id = uid;
end $$;

create function public.set_chat_settings(p_who text default null, p_show_online boolean default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._chat_member();
begin
  if p_who is not null and p_who not in ('everyone', 'nobody') then raise exception 'invalid_input'; end if;
  insert into public.chat_settings (user_id, who_can_message, show_online)
  values (uid, coalesce(p_who, 'everyone'), coalesce(p_show_online, true))
  on conflict (user_id) do update
    set who_can_message = coalesce(p_who, public.chat_settings.who_can_message),
        show_online     = coalesce(p_show_online, public.chat_settings.show_online);
end $$;

-- Called by the app when it opens and about once a minute while open. Writes at most every 30 s.
create function public.chat_heartbeat() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._chat_member();
begin
  insert into public.chat_settings (user_id, last_active_at) values (uid, now())
  on conflict (user_id) do update set last_active_at = now()
   where public.chat_settings.last_active_at is null
      or public.chat_settings.last_active_at < now() - interval '30 seconds';
end $$;

-- ---------------------------------------------------------------------
-- 8. Housekeeping: old messages go after chat_retention_days (daily, 03:45 UTC)
-- ---------------------------------------------------------------------
create function public.purge_old_chats() returns void
language plpgsql security definer set search_path = '' as $$
declare days int;
begin
  select chat_retention_days into days from public.app_settings where id = 1;
  delete from public.chat_messages where created_at < now() - make_interval(days => days);
  delete from public.chat_conversations
   where status <> 'accepted' and requested_at < now() - make_interval(days => days);
end $$;
revoke all on function public.purge_old_chats() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('unm-chat-purge', '45 3 * * *', 'select public.purge_old_chats()');
  else
    raise notice 'pg_cron is not enabled: schedule purge_old_chats() once a day.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 9. Grants: signed-in members only
-- ---------------------------------------------------------------------
revoke all on function public.send_chat_request(uuid, text)                       from public, anon, authenticated;
revoke all on function public.respond_chat_request(uuid, boolean)                 from public, anon, authenticated;
revoke all on function public.send_chat_message(uuid, text, uuid)                 from public, anon, authenticated;
revoke all on function public.delete_my_chat_message(uuid)                        from public, anon, authenticated;
revoke all on function public.mark_chat_read(uuid)                                from public, anon, authenticated;
revoke all on function public.set_chat_muted(uuid, boolean)                       from public, anon, authenticated;
revoke all on function public.delete_chat_for_me(uuid)                            from public, anon, authenticated;
revoke all on function public.get_conversations()                                 from public, anon, authenticated;
revoke all on function public.get_chat_requests()                                 from public, anon, authenticated;
revoke all on function public.get_messages(uuid, timestamptz, uuid, int)          from public, anon, authenticated;
revoke all on function public.get_chat_unread_count()                             from public, anon, authenticated;
revoke all on function public.get_chat_settings()                                 from public, anon, authenticated;
revoke all on function public.set_chat_settings(text, boolean)                    from public, anon, authenticated;
revoke all on function public.chat_heartbeat()                                    from public, anon, authenticated;

grant execute on function public.send_chat_request(uuid, text)                    to authenticated;
grant execute on function public.respond_chat_request(uuid, boolean)              to authenticated;
grant execute on function public.send_chat_message(uuid, text, uuid)              to authenticated;
grant execute on function public.delete_my_chat_message(uuid)                     to authenticated;
grant execute on function public.mark_chat_read(uuid)                             to authenticated;
grant execute on function public.set_chat_muted(uuid, boolean)                    to authenticated;
grant execute on function public.delete_chat_for_me(uuid)                         to authenticated;
grant execute on function public.get_conversations()                              to authenticated;
grant execute on function public.get_chat_requests()                              to authenticated;
grant execute on function public.get_messages(uuid, timestamptz, uuid, int)       to authenticated;
grant execute on function public.get_chat_unread_count()                          to authenticated;
grant execute on function public.get_chat_settings()                              to authenticated;
grant execute on function public.set_chat_settings(text, boolean)                 to authenticated;
grant execute on function public.chat_heartbeat()                                 to authenticated;

-- ---------------------------------------------------------------------
-- 10. Erase on account deletion
--     Both functions are identical to 20261102110000_app_version_tracking.sql plus the
--     chat deletes. Conversations go for BOTH sides; the other member loses the chat too.
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
