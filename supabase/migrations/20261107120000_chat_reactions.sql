-- =====================================================================
-- v1.0.5 - Chat message reactions
--
--   chat_message_reactions   one reaction per member per message (the member picks one of six;
--                            picking another replaces it; null removes it). Stored as a KEY, not
--                            a glyph, so the app owns how it looks:
--                              like, love, laugh, wow, sad, thanks
--   react_to_chat_message    members of an accepted chat only; not on deleted messages, not on
--                            messages the member cleared with "Delete chat for me", not when
--                            blocked or when the other side is unavailable. Muted/suspended
--                            members cannot react (same gate as sending). Reacting to more than
--                            30 different messages in a minute is refused.
--   get_message_reactions    for the messages on screen (max 100 ids): per message and key, the
--                            count and whether it is mine. In a 1:1 chat "theirs" is
--                            count - mine, so no identities are returned.
--   No notification and no push for reactions. A reaction never changes the chat's order, its
--   last message or anyone's unread count.
--
-- Additions only: get_messages and every other existing function are untouched, so builds that
-- do not know about reactions keep working. Messages purged by retention, chats removed with an
-- account and deleted messages take their reactions with them (cascade or filter).
-- =====================================================================

create table public.chat_message_reactions (
  message_id uuid not null references public.chat_messages (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  reaction   text not null check (reaction in ('like', 'love', 'laugh', 'wow', 'sad', 'thanks')),
  updated_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index chat_message_reactions_user_idx on public.chat_message_reactions (user_id, updated_at desc);
alter table public.chat_message_reactions enable row level security;
revoke all on public.chat_message_reactions from public, anon, authenticated;

create function public.react_to_chat_message(p_message uuid, p_reaction text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid     uuid := public._chat_member();
  c       public.chat_conversations;
  m       public.chat_messages;
  other   uuid;
  cleared timestamptz;
begin
  if p_message is null then raise exception 'not_found'; end if;
  if p_reaction is not null and p_reaction not in ('like', 'love', 'laugh', 'wow', 'sad', 'thanks') then
    raise exception 'invalid_reaction';
  end if;

  select * into m from public.chat_messages where id = p_message;
  if not found or m.deleted_at is not null then raise exception 'not_found'; end if;
  select * into c from public.chat_conversations
   where id = m.conversation_id and uid in (member_a, member_b) and status = 'accepted';
  if not found then raise exception 'not_found'; end if;
  other := case when c.member_a = uid then c.member_b else c.member_a end;
  if public._chat_blocked(uid, other) or not public._chat_available(other) then
    raise exception 'not_found';
  end if;
  select cm.cleared_before into cleared from public.chat_members cm
   where cm.conversation_id = c.id and cm.user_id = uid;
  if cleared is not null and m.created_at <= cleared then raise exception 'not_found'; end if;

  -- Removing, or changing a reaction I already have on this message, is never limited.
  if p_reaction is not null
     and not exists (select 1 from public.chat_message_reactions x
                      where x.message_id = p_message and x.user_id = uid)
     and (select count(*) from public.chat_message_reactions
           where user_id = uid and updated_at > now() - interval '1 minute') >= 30 then
    raise exception 'rate_limited';
  end if;

  if p_reaction is null then
    delete from public.chat_message_reactions where message_id = p_message and user_id = uid;
  else
    insert into public.chat_message_reactions (message_id, user_id, reaction)
    values (p_message, uid, p_reaction)
    on conflict (message_id, user_id)
    do update set reaction = excluded.reaction, updated_at = now();
  end if;
end $$;

create function public.get_message_reactions(p_conversation uuid, p_message_ids uuid[])
returns table (message_id uuid, reaction text, reaction_count int, mine boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid     uuid := public._chat_member();
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

revoke all on function public.react_to_chat_message(uuid, text)       from public, anon, authenticated;
revoke all on function public.get_message_reactions(uuid, uuid[])      from public, anon, authenticated;
grant execute on function public.react_to_chat_message(uuid, text)    to authenticated;
grant execute on function public.get_message_reactions(uuid, uuid[])  to authenticated;
