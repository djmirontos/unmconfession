-- =====================================================================
-- Module 9a: Terms acceptance, and no escaping a restriction.
--
--   * user_flags.terms_accepted_at: when the person accepted the Terms
--     (including the legal-age confirmation). Email sign-ups record it
--     from the sign-up metadata (handle_new_user, server time). Google
--     sign-ups have no sign-up form, so they accept on the nickname
--     screen: set_nickname gets p_accept_terms and refuses with
--     'terms_required' until it is true. People who already accepted are
--     not asked again. Existing accounts are backfilled from the sign-up
--     metadata when it is there.
--   * set_nickname also refuses banned, suspended and deleted accounts
--     (it used to check only that the person was signed in).
--   * delete_my_account refuses accounts that are banned or under an
--     active suspension ('account_restricted'), so a ban cannot be
--     escaped by deleting and signing up again with the same email.
--     (Deleting such an account on request will be a staff action in the
--     web panel, which is still to be built.)
-- =====================================================================

alter table public.user_flags add column terms_accepted_at timestamptz;

update public.user_flags f
   set terms_accepted_at = u.created_at
  from auth.users u
 where u.id = f.user_id
   and f.terms_accepted_at is null
   and nullif(btrim(u.raw_user_meta_data ->> 'terms_accepted_at'), '') is not null;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  nick     text    := nullif(btrim(new.raw_user_meta_data ->> 'nickname'), '');
  accepted boolean := nullif(btrim(new.raw_user_meta_data ->> 'terms_accepted_at'), '') is not null;
begin
  if nick is not null then
    perform public._validate_nickname(nick);
  end if;
  insert into public.profiles (id, nickname) values (new.id, nick);
  insert into public.user_flags (user_id, terms_accepted_at)
  values (new.id, case when accepted then now() end);
  return new;
end $$;

drop function public.set_nickname(text);

create function public.set_nickname(p_nickname text, p_accept_terms boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  f   public.user_flags;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into f from public.user_flags where user_id = uid;
  if not found then raise exception 'no_profile'; end if;
  if f.deleted_at is not null then raise exception 'account_deleted' using errcode = '42501'; end if;
  if f.status = 'banned' then raise exception 'banned' using errcode = '42501'; end if;
  if f.status = 'suspended' and (f.suspended_until is null or f.suspended_until > now()) then
    raise exception 'suspended' using errcode = '42501';
  end if;

  p_nickname := btrim(coalesce(p_nickname, ''));
  if exists (select 1 from public.profiles where id = uid and nickname is not null) then
    raise exception 'nickname_locked' using errcode = '42501';
  end if;
  if f.terms_accepted_at is null and not coalesce(p_accept_terms, false) then
    raise exception 'terms_required';
  end if;
  perform public._validate_nickname(p_nickname);

  update public.profiles set nickname = p_nickname where id = uid;
  if f.terms_accepted_at is null then
    update public.user_flags set terms_accepted_at = now() where user_id = uid;
  end if;
end $$;

revoke execute on function public.set_nickname(text, boolean) from public, anon, authenticated;
grant execute on function public.set_nickname(text, boolean) to authenticated;

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
