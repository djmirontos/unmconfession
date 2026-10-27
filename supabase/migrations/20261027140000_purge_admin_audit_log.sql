-- Module 7g: the nightly purge also deletes old admin_audit_log rows, so the system
-- matches the Privacy text ("Audit logs ... are kept for 30 days, then deleted").
-- Same function, same signature, one added delete; retention follows app_settings.audit_retention_days.
create or replace function public.purge_expired()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s record;
  n_audit int; n_admin_audit int; n_actions int; n_reports int; n_posts int; n_comments int; n_listings int; n_notifs int;
begin
  select * into s from public.app_settings where id = 1;

  delete from public.identity_audit_log where created_at < now() - make_interval(days => s.audit_retention_days);
  get diagnostics n_audit = row_count;
  delete from public.admin_audit_log where created_at < now() - make_interval(days => s.audit_retention_days);
  get diagnostics n_admin_audit = row_count;
  delete from public.moderation_actions where created_at < now() - make_interval(days => s.audit_retention_days);
  get diagnostics n_actions = row_count;
  delete from public.reports where status <> 'open' and handled_at < now() - make_interval(days => s.audit_retention_days);
  get diagnostics n_reports = row_count;

  delete from public.posts
    where (status in ('rejected', 'removed') and moderated_at < now() - make_interval(days => s.rejected_retention_days))
       or deleted_at < now() - make_interval(days => s.rejected_retention_days);
  get diagnostics n_posts = row_count;
  delete from public.comments
    where (status in ('rejected', 'removed') and moderated_at < now() - make_interval(days => s.rejected_retention_days))
       or deleted_at < now() - make_interval(days => s.rejected_retention_days);
  get diagnostics n_comments = row_count;
  delete from public.listings
    where (status in ('rejected', 'removed') and moderated_at < now() - make_interval(days => s.rejected_retention_days))
       or deleted_at < now() - make_interval(days => s.rejected_retention_days);
  get diagnostics n_listings = row_count;

  delete from public.notifications where created_at < now() - interval '90 days';
  get diagnostics n_notifs = row_count;

  delete from public.moderation_holds h where not exists (
    select 1 from public.posts p where h.target_type = 'post' and p.id = h.target_id
    union all select 1 from public.comments c where h.target_type = 'comment' and c.id = h.target_id
    union all select 1 from public.listings l where h.target_type = 'listing' and l.id = h.target_id);

  return jsonb_build_object('audit_log', n_audit, 'admin_audit_log', n_admin_audit,
                            'moderation_actions', n_actions, 'reports', n_reports,
                            'posts', n_posts, 'comments', n_comments, 'listings', n_listings,
                            'notifications', n_notifs);
end $$;
