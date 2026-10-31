-- Launch hardening.
--
-- 1. Indexes on foreign keys that are looked up by user or parent id and are deleted by cascade
--    (profile purge, post purge). No behaviour change; queries and cascades get faster as data grows.
-- 2. Trigger helper functions are not meant to be called through the API. Triggers keep firing
--    (PostgreSQL does not check EXECUTE when a trigger fires), but guests and signed-in members
--    can no longer call them as /rest/v1/rpc/... endpoints.
--
-- 3. is_nickname_available(text) existed in production (created by hand in the SQL editor) but in no
--    migration. It is added here with the same definition and the same privileges, so a database
--    built from the migrations matches production. create or replace makes this safe to run there.
--
-- is_staff() and is_admin() are NOT touched: row-level policies call them for guests too.

create index if not exists reactions_user_idx         on public.reactions (user_id);
create index if not exists comment_reactions_user_idx on public.comment_reactions (user_id);
create index if not exists poll_votes_user_idx        on public.poll_votes (user_id);
create index if not exists user_blocks_blocked_idx    on public.user_blocks (blocked_id);
create index if not exists notifications_actor_idx    on public.notifications (actor_id);
create index if not exists comments_reply_to_idx      on public.comments (reply_to_id);
create index if not exists feed_events_post_idx       on public.feed_events (post_id);

revoke all on function public.comment_reactions_after_write() from public, anon, authenticated;
revoke all on function public.comments_cascade_children()     from public, anon, authenticated;
revoke all on function public.profiles_avatar_guard()         from public, anon, authenticated;

create or replace function public.is_nickname_available(p_nickname text)
returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._validate_nickname(btrim(p_nickname));
  return true;
exception
  when raise_exception then
    return false;
end $$;

revoke all on function public.is_nickname_available(text) from public;
grant execute on function public.is_nickname_available(text) to anon, authenticated;
