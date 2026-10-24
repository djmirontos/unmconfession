-- =====================================================================
-- Module 4.3: a vote can be changed until the poll ends.
--
-- Same signature as before, so CREATE OR REPLACE keeps the existing
-- privileges. Voting for the option you already chose is a no-op.
-- Changing moves the vote: the old row is deleted and the new one inserted
-- in one sub-transaction, so the existing trigger keeps vote_count right
-- (-1 on the old option, +1 on the new one). If the new option is invalid
-- the sub-transaction rolls back and the original vote stays.
-- =====================================================================

create or replace function public.vote_poll(p_post_id uuid, p_option_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.assert_active_member();
  cur uuid;
begin
  if not exists (
    select 1 from public.posts
    where id = p_post_id and kind = 'poll' and status = 'published' and ends_at > now()
  ) then
    raise exception 'poll_closed';
  end if;

  select option_id into cur from public.poll_votes
    where post_id = p_post_id and user_id = uid for update;

  if cur is not null and cur = p_option_id then
    return;
  end if;

  begin
    if cur is not null then
      delete from public.poll_votes where post_id = p_post_id and user_id = uid;
    end if;
    insert into public.poll_votes (post_id, user_id, option_id) values (p_post_id, uid, p_option_id);
  exception
    when unique_violation then raise exception 'already_voted';
    when foreign_key_violation then raise exception 'invalid_option';
  end;
end $$;
