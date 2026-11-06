-- =====================================================================
-- v1.0.5 - Why is my content held? (author-facing, keyword hold notice)
--
-- One read-only function. A member asks about THEIR OWN pending post, comment or listing and
-- gets back:
--     'keyword'         the text matched the staff keyword list
--     'pre_moderation'  the whole community is in pre-moderation mode
--     null              nothing is held for them (published, removed, not theirs, unknown id)
-- It never returns the matched word, and it returns null for anyone else's content, so it
-- cannot be used to probe the keyword list or to learn about other members' posts.
-- Nothing else changes: create_post / create_comment / create_listing and the tables are
-- untouched, so older app builds behave exactly as before.
-- =====================================================================
create function public.get_my_hold_reason(p_type public.content_type, p_id uuid)
returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  r   text;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select h.reason into r
    from public.moderation_holds h
   where h.target_type = p_type and h.target_id = p_id
     and case p_type
           when 'post'    then exists (select 1 from public.posts    x where x.id = p_id and x.author_id = uid and x.status = 'pending')
           when 'comment' then exists (select 1 from public.comments x where x.id = p_id and x.author_id = uid and x.status = 'pending')
           when 'listing' then exists (select 1 from public.listings x where x.id = p_id and x.author_id = uid and x.status = 'pending')
           else false
         end;
  return r;
end $$;

revoke all on function public.get_my_hold_reason(public.content_type, uuid) from public, anon, authenticated;
grant execute on function public.get_my_hold_reason(public.content_type, uuid) to authenticated;
