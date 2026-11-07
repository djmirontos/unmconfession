-- =====================================================================
-- v1.0.5 - Chat stage 2b: reopen a chat the member deleted "for me"
--
-- Problem: "Delete chat for me" hides an accepted chat and clears its history for that member
-- only. The conversation row stays 'accepted', so a new request is refused with
-- already_chatting and the member could not start talking to that person again (unless the
-- other side wrote first).
--
-- reopen_my_chat(p_with) makes the hidden chat visible again for the caller. It is what the
-- app calls when a request answers already_chatting. Rules:
--   * only an existing ACCEPTED chat between the two can be reopened (it never creates a
--     chat, never sends a notification, never sends a message)
--   * the history the member deleted stays deleted (cleared_before is kept)
--   * the same checks as starting a chat: blocks, banned/deleted/no-nickname recipients,
--     "staff only" mode, and the recipient's "nobody can message me" setting
--   * idempotent: reopening a chat that is already visible just returns its id
-- Additions only: no existing function or table is changed.
-- =====================================================================

create function public.reopen_my_chat(p_with uuid) returns uuid
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

  update public.chat_members set hidden = false
   where conversation_id = cid and user_id = uid and hidden;
  return cid;
end $$;

revoke all on function public.reopen_my_chat(uuid) from public, anon, authenticated;
grant execute on function public.reopen_my_chat(uuid) to authenticated;
