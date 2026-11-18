-- =====================================================================
-- v1.0.5 - Chat: a muted (suspended) member can still READ chat
--
-- Until now every chat function used the same gate as posting, which refuses suspended
-- members. So a timed suspension ("mute": read-only) also hid the member's chats, which does
-- not match "can read but not post".
--
--   _chat_reader()   like _chat_member() (signed in, has a nickname, chat switched on for them,
--                    staff-only mode respected) but a suspended member is allowed. A BANNED
--                    member is still refused.
--
-- Switched to it (reads only; each body is otherwise identical to its earlier version):
--   get_conversations, get_chat_requests, get_messages, get_chat_unread_count,
--   get_chat_settings, mark_chat_read (only moves my own read marker), get_message_reactions.
--
-- Unchanged and still refusing a suspended member: sending requests and messages, answering
-- requests, deleting messages or chats, reactions, reopening, chat settings changes, muting a
-- conversation and the online heartbeat. Grants are unchanged (CREATE OR REPLACE keeps them).
-- =====================================================================

create function public._chat_reader() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  f   public.user_flags;
  m   text;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into f from public.user_flags where user_id = uid;
  if not found then raise exception 'no_profile'; end if;
  if f.status = 'banned' then raise exception 'banned' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = uid and nickname is not null) then
    raise exception 'nickname_required';
  end if;
  select chat_mode into m from public.app_settings where id = 1;
  if m = 'off' or (m = 'staff' and not public.is_staff()) then
    raise exception 'chat_disabled' using errcode = '42501';
  end if;
  return uid;
end $$;
revoke all on function public._chat_reader() from public, anon, authenticated;

create or replace function public.get_conversations()
returns table (conversation_id uuid, status text, other_id uuid, other_nickname text,
               other_avatar_key text, last_message_body text, last_message_at timestamptz,
               last_message_sender uuid, unread_count int, muted boolean, is_online boolean)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public._chat_reader();
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

create or replace function public.get_chat_requests()
returns table (conversation_id uuid, from_id uuid, from_nickname text, from_avatar_key text,
               body text, requested_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public._chat_reader();
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

create or replace function public.get_messages(p_conversation uuid, p_before_at timestamptz default null,
                                    p_before_id uuid default null, p_limit int default 30)
returns table (id uuid, sender_id uuid, body text, reply_to_id uuid, reply_body text,
               reply_sender_id uuid, created_at timestamptz, deleted boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid   uuid := public._chat_reader();
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

create or replace function public.get_chat_unread_count()
returns table (unread_chats int, pending_requests int)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public._chat_reader();
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

create or replace function public.get_chat_settings()
returns table (who_can_message text, show_online boolean)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public._chat_reader();
begin
  return query
  select coalesce(s.who_can_message, 'everyone'), coalesce(s.show_online, true)
    from (select 1) x left join public.chat_settings s on s.user_id = uid;
end $$;

create or replace function public.mark_chat_read(p_conversation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._chat_reader();
begin
  update public.chat_members set last_read_at = now()
   where conversation_id = p_conversation and user_id = uid;
  if not found then raise exception 'not_found'; end if;
end $$;

create or replace function public.get_message_reactions(p_conversation uuid, p_message_ids uuid[])
returns table (message_id uuid, reaction text, reaction_count int, mine boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid     uuid := public._chat_reader();
  c       public.chat_conversations;
  other   uuid;
  cleared timestamptz;
begin
  if p_message_ids is null or coalesce(array_length(p_message_ids, 1), 0) > 100 then
    raise exception 'invalid_input';
  end if;
  select * into c from public.chat_conversations
   where id = p_conversation and uid in (member_a, member_b) and status = 'accepted';
  if not found then raise exception 'not_found'; end if;
  other := case when c.member_a = uid then c.member_b else c.member_a end;
  if public._chat_blocked(uid, other) then raise exception 'not_found'; end if;
  select cm.cleared_before into cleared from public.chat_members cm
   where cm.conversation_id = c.id and cm.user_id = uid;

  return query
  select r.message_id, r.reaction, count(*)::int, bool_or(r.user_id = uid)
    from public.chat_message_reactions r
    join public.chat_messages m on m.id = r.message_id
   where m.conversation_id = c.id
     and r.message_id = any (p_message_ids)
     and m.deleted_at is null
     and (cleared is null or m.created_at > cleared)
   group by r.message_id, r.reaction
   order by r.message_id, r.reaction;
end $$;
