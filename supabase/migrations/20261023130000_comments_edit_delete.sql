-- =====================================================================
-- Module 4.2: authors can edit and delete their own comments.
--
-- Same rules as posts and listings (20261023120000_edit_delete_own.sql):
--   * Edit only while the comment is published or pending and within 24
--     hours of posting. Rejected / removed comments cannot be edited.
--   * The new text is re-checked by the keyword filter; a match sends the
--     comment back to 'pending' (hidden until a moderator approves it).
--   * edited_at is set (the app shows "Edited"); the previous text is kept
--     in moderation_actions (action 'edit', reason_code 'author_edit',
--     original_body = JSON text) for audit_retention_days.
--   * The 10-edits-per-hour limit is shared with posts and listings.
--   * Delete hides the comment immediately (status 'removed', deleted_at
--     set); the row is purged after rejected_retention_days. The existing
--     comment counter trigger keeps comment_count right.
-- =====================================================================

alter table public.comments add column edited_at timestamptz, add column deleted_at timestamptz;

-- Authors no longer see their own deleted comments.
drop policy comments_read on public.comments;
create policy comments_read on public.comments for select to anon, authenticated
  using (
    (author_id = (select auth.uid()) and deleted_at is null) or public.is_staff()
    or (status = 'published' and (
         (post_id is not null    and exists (select 1 from public.posts p    where p.id = post_id    and p.status = 'published'))
      or (listing_id is not null and exists (select 1 from public.listings l where l.id = listing_id and l.status = 'published'))))
  );

-- Expose edited_at (appended at the end so existing columns keep their order).
create or replace view public.thread_comments with (security_invoker = true) as
select c.id, c.post_id, c.listing_id, c.body, c.author_id, pr.nickname, pr.avatar_key, c.published_at,
       c.edited_at
from public.comments c
join public.profiles pr on pr.id = c.author_id
where c.status = 'published';

create function public.edit_own_comment(p_comment_id uuid, p_body text)
returns public.comments
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.assert_active_member();
  c   public.comments;
  d   record;
begin
  p_body := btrim(coalesce(p_body, ''));

  select * into c from public.comments
    where id = p_comment_id and author_id = uid and deleted_at is null for update;
  if not found then raise exception 'not_found'; end if;
  if c.status not in ('published', 'pending') then raise exception 'not_editable'; end if;
  if c.created_at < now() - interval '24 hours' then raise exception 'edit_window_closed'; end if;
  if char_length(p_body) not between 1 and 1000 then raise exception 'invalid_body'; end if;

  -- Nothing changed: no edit, no label, no audit row.
  if p_body = c.body then return c; end if;

  if (select count(*) from public.moderation_actions
        where actor_id = uid and reason_code = 'author_edit' and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'rate_limited';
  end if;

  select * into d from public._moderation_decision('comment', p_body);

  insert into public.moderation_actions (actor_id, target_type, target_id, action, reason_code, original_body)
  values (uid, 'comment', c.id, 'edit', 'author_edit', jsonb_build_object('body', c.body)::text);

  update public.comments set body = p_body, edited_at = now(), status = d.out_status
   where id = c.id
  returning * into c;

  if d.out_status = 'pending' then
    insert into public.moderation_holds (target_type, target_id, reason, matched_term)
    values ('comment', c.id, d.out_reason, d.out_term)
    on conflict (target_type, target_id)
    do update set reason = excluded.reason, matched_term = excluded.matched_term, created_at = now();
  else
    delete from public.moderation_holds where target_type = 'comment' and target_id = c.id;
  end if;
  return c;
end $$;

create function public.delete_own_comment(p_comment_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.assert_active_member();
begin
  update public.comments
     set deleted_at = now(),
         status = case when status in ('published', 'pending') then 'removed'::public.content_status else status end,
         moderated_at = case when status in ('published', 'pending') then now() else moderated_at end,
         moderated_by = case when status in ('published', 'pending') then null else moderated_by end
   where id = p_comment_id and author_id = uid and deleted_at is null;
  if not found then raise exception 'not_found'; end if;
end $$;

revoke execute on function public.edit_own_comment(uuid, text), public.delete_own_comment(uuid)
  from public, anon, authenticated;
grant execute on function public.edit_own_comment(uuid, text), public.delete_own_comment(uuid)
  to authenticated;

-- Purge: also remove comments the author deleted, after the same retention.
create or replace function public.purge_expired() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s record;
  n_audit int; n_actions int; n_reports int; n_posts int; n_comments int; n_listings int;
begin
  select * into s from public.app_settings where id = 1;

  delete from public.identity_audit_log where created_at < now() - make_interval(days => s.audit_retention_days);
  get diagnostics n_audit = row_count;
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

  delete from public.moderation_holds h where not exists (
    select 1 from public.posts p where h.target_type = 'post' and p.id = h.target_id
    union all select 1 from public.comments c where h.target_type = 'comment' and c.id = h.target_id
    union all select 1 from public.listings l where h.target_type = 'listing' and l.id = h.target_id);

  return jsonb_build_object('audit_log', n_audit, 'moderation_actions', n_actions, 'reports', n_reports,
                            'posts', n_posts, 'comments', n_comments, 'listings', n_listings);
end $$;
