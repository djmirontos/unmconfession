-- Custom avatars (module 12b).
--
-- Design: profiles.avatar_key already travels with every author in the feed,
-- comment, listing and notification views, so a custom picture is stored as a
-- special key instead of a new column:
--     preset avatar : avatar_01 ... (unchanged)
--     custom avatar : c_<12 hex>   file = avatars/<user id>/<key>.jpg
-- Every upload gets a new key, so the file URL never changes content (cache
-- friendly) and no view or RPC has to change. The app builds the URL from
-- author_id + avatar_key.
--
-- 1. Public 'avatars' bucket: JPEG only, 512 KB max.
-- 2. Upload only into your own folder, only with a well-formed name, only
--    while your account is active, and at most 5 files at a time (the app
--    deletes the previous file after switching).
-- 3. profiles trigger: a custom key must point at an uploaded file; the
--    replaced custom file is queued in storage_cleanup_queue.
-- 4. mod_remove_avatar(): staff reset someone's picture to the default.
-- Idempotent where it can be.

-- ---------------------------------------------------------------------
-- 1. Bucket
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 524288, array['image/jpeg'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2. Storage policies
-- ---------------------------------------------------------------------
create or replace function public._can_upload_avatar() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_flags f
    where f.user_id = (select auth.uid())
      and f.deleted_at is null
      and (f.status = 'active'
           or (f.status = 'suspended' and f.suspended_until is not null and f.suspended_until <= now()))
  )
  -- at most 5 files in your own folder (counted with this function's own
  -- rights: a signed-in member has no SELECT policy on storage.objects)
  and (select count(*) from storage.objects o
        where o.bucket_id = 'avatars'
          and (storage.foldername(o.name))[1] = (select auth.uid())::text) < 5
$$;
revoke all on function public._can_upload_avatar() from public, anon;
grant execute on function public._can_upload_avatar() to authenticated;

drop policy if exists "avatars: upload own" on storage.objects;
create policy "avatars: upload own" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ ('^' || (select auth.uid())::text || '/c_[0-9a-f]{12}\.jpg$')
    and public._can_upload_avatar()
  );

-- Reading your own folder is needed so Storage can find the file before
-- deleting it (and for the cleanup count). The bucket is public, so showing
-- pictures to everyone does not use these policies.
drop policy if exists "avatars: read own" on storage.objects;
create policy "avatars: read own" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "avatars: staff read" on storage.objects;
create policy "avatars: staff read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and public.is_staff());

drop policy if exists "avatars: delete own" on storage.objects;
create policy "avatars: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "avatars: staff delete" on storage.objects;
create policy "avatars: staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and public.is_staff());

-- ---------------------------------------------------------------------
-- 3. profiles.avatar_key trigger
-- ---------------------------------------------------------------------
create or replace function public.profiles_avatar_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.avatar_key is not distinct from old.avatar_key then return new; end if;

  if new.avatar_key ~ '^c_[0-9a-f]{12}$' then
    if not exists (select 1 from storage.objects o
                    where o.bucket_id = 'avatars'
                      and o.name = new.id::text || '/' || new.avatar_key || '.jpg') then
      raise exception 'avatar_not_uploaded';
    end if;
    -- A member changing their own picture must be an active member
    -- (banned / suspended / no nickname yet are refused).
    if (select auth.uid()) = new.id then
      perform public.assert_active_member();
    end if;
  end if;

  -- The replaced custom file is garbage: queue it for the storage cleanup.
  if old.avatar_key ~ '^c_[0-9a-f]{12}$' then
    insert into public.storage_cleanup_queue (bucket, path)
    values ('avatars', old.id::text || '/' || old.avatar_key || '.jpg');
  end if;
  return new;
end $$;

drop trigger if exists profiles_avatar_guard on public.profiles;
create trigger profiles_avatar_guard before update of avatar_key on public.profiles
  for each row execute function public.profiles_avatar_guard();

-- ---------------------------------------------------------------------
-- 4. Staff: remove an inappropriate picture
-- ---------------------------------------------------------------------
alter table public.moderation_actions drop constraint if exists moderation_actions_action_check;
alter table public.moderation_actions add constraint moderation_actions_action_check
  check (action in ('approve', 'reject', 'remove', 'restore', 'edit', 'suspend', 'ban', 'restore_user', 'remove_avatar'));

create or replace function public.mod_remove_avatar(p_user uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  f     public.user_flags;
  cur   text;
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into f from public.user_flags where user_id = p_user;
  if not found then raise exception 'not_found'; end if;
  if f.deleted_at is not null then raise exception 'account_deleted'; end if;
  if f.role <> 'user' and not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select avatar_key into cur from public.profiles where id = p_user;
  if cur is null or cur !~ '^c_[0-9a-f]{12}$' then raise exception 'no_custom_avatar'; end if;

  perform set_config('app.account_change', 'on', true);
  update public.profiles set avatar_key = 'avatar_01' where id = p_user;   -- trigger queues the file
  perform set_config('app.account_change', 'off', true);

  insert into public.moderation_actions (actor_id, target_type, target_id, action, reason_code)
  values (actor, 'user', p_user, 'remove_avatar', nullif(btrim(coalesce(p_reason, '')), ''));
end $$;

revoke all on function public.mod_remove_avatar(uuid, text) from public, anon;
grant execute on function public.mod_remove_avatar(uuid, text) to authenticated;
