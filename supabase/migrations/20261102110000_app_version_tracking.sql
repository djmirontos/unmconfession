-- =====================================================================
-- v1.0.2 - Which app version do members have installed?
--
-- One row per signed-in member: the app version, the platform and when the app last
-- reported. Nothing else (no phone model, no device id, no location).
--   * report_app_version(version, platform): members only, called by the app once per launch.
--     The database ignores repeats: the row is only written when the version or platform
--     changed, or the last report is older than 12 hours.
--   * mod_app_versions(): staff only. Counts of members per version and platform, plus one
--     row (version null) for members who have never reported = still on an older build.
-- The version comes from the phone, so treat it as informative, not as proof.
--
-- Privacy: the row is deleted when the account is deleted (by the member or by an admin).
-- delete_my_account() keeps the profile row, so ON DELETE CASCADE would never fire; both
-- delete functions below are identical to their current versions plus explicit deletes.
-- Fix found on the way: admin_delete_account() never erased push data. It does now.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Table (RLS on, no policies, no API grants: access only through functions)
-- ---------------------------------------------------------------------
create table public.member_app_versions (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  app_version text not null check (app_version ~ '^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}$'),
  platform    text not null check (platform in ('android', 'ios')),
  updated_at  timestamptz not null default now()
);
create index member_app_versions_version_idx on public.member_app_versions (app_version);
alter table public.member_app_versions enable row level security;
revoke all on public.member_app_versions from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Member report
-- ---------------------------------------------------------------------
create function public.report_app_version(p_version text, p_platform text)
returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_version is null or p_version !~ '^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}$' then
    raise exception 'invalid_version' using errcode = '22023';
  end if;
  if p_platform is null or p_platform not in ('android', 'ios') then
    raise exception 'invalid_platform' using errcode = '22023';
  end if;
  -- Members only: a nickname is set and the account is neither banned nor deleted.
  if not exists (select 1 from public.profiles p
                   join public.user_flags f on f.user_id = p.id
                  where p.id = uid and p.nickname is not null
                    and f.status <> 'banned' and f.deleted_at is null) then
    return;
  end if;

  insert into public.member_app_versions as v (user_id, app_version, platform)
  values (uid, p_version, p_platform)
  on conflict (user_id) do update
    set app_version = excluded.app_version, platform = excluded.platform, updated_at = now()
  where v.app_version is distinct from excluded.app_version
     or v.platform    is distinct from excluded.platform
     or v.updated_at  < now() - interval '12 hours';
end $$;

-- ---------------------------------------------------------------------
-- 3. Staff counts
--    member = profile with a nickname whose account is not deleted
--    version null = members who have not reported yet (older builds)
-- ---------------------------------------------------------------------
create function public.mod_app_versions()
returns table (app_version text, platform text, members int, seen_7d int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  with m as (
    select p.id
      from public.profiles p
      join public.user_flags f on f.user_id = p.id
     where p.nickname is not null and f.deleted_at is null
  ),
  rows_ as (
    select v.app_version as ver, v.platform as plat,
           count(*)::int as n,
           (count(*) filter (where v.updated_at > now() - interval '7 days'))::int as n7
      from public.member_app_versions v
      join m on m.id = v.user_id
     group by v.app_version, v.platform
    union all
    select null::text, null::text, count(*)::int, 0
      from m
     where not exists (select 1 from public.member_app_versions v where v.user_id = m.id)
  )
  select r.ver, r.plat, r.n, r.n7
    from rows_ r
   where r.n > 0
   order by (r.ver is null), string_to_array(r.ver, '.')::int[] desc nulls last, r.plat;
end $$;

-- ---------------------------------------------------------------------
-- 4. Grants: signed-in only; the staff function checks is_staff() itself
-- ---------------------------------------------------------------------
revoke all on function public.report_app_version(text, text) from public, anon, authenticated;
revoke all on function public.mod_app_versions()             from public, anon, authenticated;
grant execute on function public.report_app_version(text, text) to authenticated;
grant execute on function public.mod_app_versions()             to authenticated;

-- ---------------------------------------------------------------------
-- 5. Erase on account deletion
--    delete_my_account: identical to 20261031120000_push_cleanup_on_delete.sql
--    plus one delete (member_app_versions).
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

--    admin_delete_account: identical to 20261027100000_admin_panel.sql plus the push and
--    app version deletes (the push cleanup was missing there).
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

  -- Added: push data and the app version record.
  delete from public.push_tokens   where user_id = p_user;
  delete from public.push_settings where user_id = p_user;
  delete from public.push_outbox   where user_id = p_user;
  delete from public.member_app_versions where user_id = p_user;

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
