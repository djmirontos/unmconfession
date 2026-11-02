-- =====================================================================
-- v1.0.2 - Soft update reminder ("New update available. Update / Later")
--
-- The hard gate (min_app_version) stays exactly as it is. This adds the SOFT reminder:
--   * latest_app_version  : newest published version. Apps older than this show a polite
--                           popup with Update / Later. Raise it with one SQL line per release.
--   * play_update_url     : where Google Play installs should go (a Play install cannot be
--                           updated from a GitHub file: different signing key).
--   * latest_update_message : optional popup text (the app has a default).
--   * update_url          : existing column, reused for GitHub installs.
-- New function get_latest_app_info() (guests included) returns only these fields.
-- get_app_requirements() is NOT changed, so older apps keep working untouched.
-- Like the hard-update fields, the new columns get no UPDATE grant for the app or the panel:
-- only the Supabase dashboard / SQL editor can change them; the guard keeps them admin-only
-- if a grant is ever added.
-- =====================================================================

alter table public.app_settings
  add column if not exists latest_app_version text not null default '0.0.0',
  add column if not exists play_update_url text,
  add column if not exists latest_update_message text;

alter table public.app_settings
  drop constraint if exists app_settings_latest_version_check,
  drop constraint if exists app_settings_play_url_check,
  drop constraint if exists app_settings_latest_message_check;
alter table public.app_settings
  add constraint app_settings_latest_version_check
    check (latest_app_version ~ '^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}$'),
  add constraint app_settings_play_url_check
    check (play_update_url is null or (play_update_url ~ '^https://' and char_length(play_update_url) <= 300)),
  add constraint app_settings_latest_message_check
    check (latest_update_message is null or char_length(latest_update_message) <= 200);

-- Same guard as before (20261027150000_min_app_version.sql) plus the three new fields.
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
       or new.update_message is distinct from old.update_message
       or new.latest_app_version is distinct from old.latest_app_version
       or new.play_update_url is distinct from old.play_update_url
       or new.latest_update_message is distinct from old.latest_update_message then
      raise exception 'admin_only' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end $$;

-- Public read for the app (guests included); returns no other settings.
create function public.get_latest_app_info()
returns table (latest_app_version text, update_url text, play_update_url text, latest_update_message text)
language sql stable security definer set search_path = ''
as $$
  select s.latest_app_version, s.update_url, s.play_update_url, s.latest_update_message
  from public.app_settings s where s.id = 1;
$$;

revoke all on function public.get_latest_app_info() from public, anon, authenticated;
grant execute on function public.get_latest_app_info() to anon, authenticated;
