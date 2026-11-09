-- =====================================================================
-- v1.0.5 - Chat: "Close chat" (stop messages from one member in one chat)
--
-- After a report (or any time) a member can choose a lighter option than blocking the whole
-- member: close this one chat. The member stays visible everywhere else (feed, comments).
--
--   chat_members.closed_at   set by close_my_chat; the chat is hidden for me and the OTHER
--                            member can no longer send me messages in it ("not_accepting_
--                            messages"); they also cannot reopen it from their side.
--   close_my_chat(conv)      accepted chats only. Allowed while muted (it protects the member).
--                            Keeps my history (use "Delete chat for me" to clear it). Idempotent.
--   reopen_my_chat(with)     now also UNDOES my own close (the undo is the Message button on
--                            their profile). It is refused for the other member while I have
--                            the chat closed.
--   send_chat_message        two small additions: refuse when the recipient closed the chat, and
--                            never un-hide a chat the recipient closed (and a sender who closed the
--                            chat must reopen it first). Everything else is the
--                            earlier version, unchanged.
--
-- Additions only for older builds: they never call close_my_chat; a refused send shows the
-- existing "isn't accepting messages" text.
-- =====================================================================

alter table public.chat_members add column closed_at timestamptz;

create function public.close_my_chat(p_conversation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._chat_reader();
begin
  update public.chat_members cm set closed_at = coalesce(cm.closed_at, now()), hidden = true,
         last_read_at = now()
   where cm.conversation_id = p_conversation and cm.user_id = uid
     and exists (select 1 from public.chat_conversations c
                  where c.id = p_conversation and c.status = 'accepted');
  if not found then raise exception 'not_found'; end if;
end $$;
revoke all on function public.close_my_chat(uuid) from public, anon, authenticated;
grant execute on function public.close_my_chat(uuid) to authenticated;

create or replace function public.send_chat_message(p_conversation uuid, p_body text, p_reply_to uuid default null)
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
  if exists (select 1 from public.chat_members cm
              where cm.conversation_id = c.id and cm.user_id = other and cm.closed_at is not null) then
    raise exception 'not_accepting_messages';
  end if;
  -- a chat I closed myself is not reachable from the app; reopen it first
  if exists (select 1 from public.chat_members cm
              where cm.conversation_id = c.id and cm.user_id = uid and cm.closed_at is not null) then
    raise exception 'not_found';
  end if;

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
  update public.chat_members set hidden = false where conversation_id = c.id and closed_at is null;
  update public.chat_members set last_read_at = now() where conversation_id = c.id and user_id = uid;
  return mid;
end $$;

create or replace function public.reopen_my_chat(p_with uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid  uuid := public._chat_member();
  m    text;
  who  text;
  cid  uuid;
begin
  if p_with is null or p_with = uid then raise exception 'not_found'; end if;

  select c.id into cid from public.chat_conversations c
   where c.member_a = least(uid, p_with) and c.member_b = greatest(uid, p_with)
     and c.status = 'accepted';
  if cid is null then raise exception 'not_found'; end if;

  select chat_mode into m from public.app_settings where id = 1;
  if m = 'staff' and not public._chat_is_staff_user(p_with) then raise exception 'not_found'; end if;
  if not public._chat_available(p_with) or public._chat_blocked(uid, p_with) then
    raise exception 'not_found';
  end if;
  select s.who_can_message into who from public.chat_settings s where s.user_id = p_with;
  if coalesce(who, 'everyone') = 'nobody' then raise exception 'not_accepting_messages'; end if;
  if exists (select 1 from public.chat_members cm
              where cm.conversation_id = cid and cm.user_id = p_with and cm.closed_at is not null) then
    raise exception 'not_accepting_messages';
  end if;

  -- reopening also undoes my own "close chat"
  update public.chat_members set hidden = false, closed_at = null
   where conversation_id = cid and user_id = uid and (hidden or closed_at is not null);
  return cid;
end $$;
