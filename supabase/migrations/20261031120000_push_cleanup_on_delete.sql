-- Push notifications: erase push data when an account is deleted.
--
-- delete_my_account() keeps a nameless, locked profile row, so the ON DELETE CASCADE on the push tables
-- never fires. This redefinition is identical to the current one (20261026130000_terms_acceptance.sql)
-- except for three added deletes: push_tokens, push_settings and push_outbox of the member.
-- Grants are unchanged (create or replace keeps them).

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
