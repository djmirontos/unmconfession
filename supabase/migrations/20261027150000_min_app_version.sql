-- Module 8b: force update. The app reads the minimum allowed version (and where to get the
-- update) at launch; guests can read it too. The new columns get no UPDATE grant for the app
-- or the panel, so only the Supabase dashboard / SQL editor can change them; the guard below
-- also keeps them admin-only if a grant is ever added.
alter table public.app_settings
  add column if not exists min_app_version text not null default '0.0.0',
  add column if not exists update_url text,
  add column if not exists update_message text;

alter table public.app_settings
  drop constraint if exists app_settings_min_version_check,
  drop constraint if exists app_settings_update_url_check,
  drop constraint if exists app_settings_update_message_check;
alter table public.app_settings
  add constraint app_settings_min_version_check
    check (min_app_version ~ '^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}$'),
  add constraint app_settings_update_url_check
    check (update_url is null or (update_url ~ '^https://' and char_length(update_url) <= 300)),
  add constraint app_settings_update_message_check
    check (update_message is null or char_length(update_message) <= 200);

-- Staff may edit branding. Mode, retention and the force-update fields are admin-only.
create or replace function public.app_settings_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- auth.uid() is null for dashboard/service-role changes, which are allowed.
  if (select auth.uid()) is not null and not public.is_admin() then
    if new.moderation_mode is distinct from old.moderation_mode
       or new.audit_retention_days is distinct from old.audit_retention_days
       or new.rejected_retention_days is distinct from old.rejected_retention_days
       or new.min_app_version is distinct from old.min_app_version
       or new.update_url is distinct from old.update_url
       or new.update_message is distinct from old.update_message then
      raise exception 'admin_only' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end $$;

-- Public read for the app (guests included); returns no other settings.
create or replace function public.get_app_requirements()
returns table (min_app_version text, update_url text, update_message text)
language sql stable security definer set search_path = ''
as $$
  select s.min_app_version, s.update_url, s.update_message
  from public.app_settings s where s.id = 1;
$$;

revoke all on function public.get_app_requirements() from public, anon, authenticated;
grant execute on function public.get_app_requirements() to anon, authenticated;
