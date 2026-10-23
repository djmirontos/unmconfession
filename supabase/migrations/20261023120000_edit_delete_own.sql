-- =====================================================================
-- Module 3.1: authors can edit and delete their own posts and listings.
--
-- Edit
--   * Confession / shoutout text (and "To:"), and a listing's title,
--     description, price, condition, location and date. Not photos, not
--     polls, not the kind, not the lost/found type.
--   * Only while the item is published or pending, and only within 24
--     hours of posting. Rejected / removed items cannot be edited.
--   * The new text goes through the same keyword check as a new post:
--     if it matches, the item goes back to 'pending' (hidden) until a
--     moderator approves it. Under pre-moderation it always goes pending.
--   * edited_at is set (the app shows "Edited").
--   * The previous text is kept in moderation_actions (action 'edit',
--     reason_code 'author_edit', original_body = JSON text) so moderators
--     can see it; it expires with audit_retention_days.
--   * At most 10 edits per hour per user.
--
-- Delete
--   * Hides the item immediately (status 'removed', deleted_at set) and
--     it disappears from the author's own lists too. The row is purged by
--     purge_expired after rejected_retention_days. Post numbers are never
--     reused.
-- =====================================================================

alter table public.posts    add column edited_at timestamptz, add column deleted_at timestamptz;
alter table public.listings add column edited_at timestamptz, add column deleted_at timestamptz;

-- Authors no longer see their own deleted rows.
drop policy posts_read on public.posts;
create policy posts_read on public.posts for select to anon, authenticated
  using (status = 'published'
         or (author_id = (select auth.uid()) and deleted_at is null)
         or public.is_staff());

drop policy listings_read on public.listings;
create policy listings_read on public.listings for select to anon, authenticated
  using (status = 'published'
         or (author_id = (select auth.uid()) and deleted_at is null)
         or public.is_staff());

-- Expose edited_at (appended at the end, so existing columns keep their order).
create or replace view public.feed_posts with (security_invoker = true) as
select
  p.id, p.number, p.kind, p.body, p.target_name, p.images, p.ends_at,
  p.author_id, pr.nickname, pr.avatar_key,
  p.published_at, p.reaction_count, p.comment_count,
  (select r.type from public.reactions r
     where r.post_id = p.id and r.user_id = (select auth.uid())) as my_reaction,
  case when p.kind = 'poll' then
    (select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label, 'votes', o.vote_count) order by o.position)
       from public.poll_options o where o.post_id = p.id)
  end as poll_options,
  case when p.kind = 'poll' then
    (select v.option_id from public.poll_votes v
       where v.post_id = p.id and v.user_id = (select auth.uid()))
  end as my_vote,
  p.edited_at
from public.posts p
join public.profiles pr on pr.id = p.author_id
where p.status = 'published';

create or replace view public.feed_listings with (security_invoker = true) as
select
  l.id, l.kind, l.title, l.description, l.price, l.condition, l.location, l.event_date,
  l.images, l.is_closed, l.author_id, pr.nickname, pr.avatar_key, l.published_at, l.comment_count,
  l.lost_found_type,
  l.edited_at
from public.listings l
join public.profiles pr on pr.id = l.author_id
where l.status = 'published';

-- ---------------------------------------------------------------------
-- Edit a post (confession or shoutout)
-- ---------------------------------------------------------------------
create function public.edit_own_post(p_post_id uuid, p_body text, p_target_name text default null)
returns public.posts
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.assert_active_member();
  p   public.posts;
  d   record;
begin
  p_body := btrim(coalesce(p_body, ''));
  p_target_name := nullif(btrim(coalesce(p_target_name, '')), '');

  select * into p from public.posts
    where id = p_post_id and author_id = uid and deleted_at is null for update;
  if not found then raise exception 'not_found'; end if;
  if p.kind = 'poll' then raise exception 'not_editable'; end if;
  if p.status not in ('published', 'pending') then raise exception 'not_editable'; end if;
  if p.created_at < now() - interval '24 hours' then raise exception 'edit_window_closed'; end if;

  if char_length(p_body) not between 1 and 2000 then raise exception 'invalid_body'; end if;
  if p.kind = 'shoutout' and p_target_name is null then raise exception 'target_required'; end if;
  if p.kind = 'confession' and p_target_name is not null then raise exception 'invalid_target'; end if;
  if char_length(coalesce(p_target_name, '')) > 80 then raise exception 'invalid_target'; end if;

  -- Nothing changed: no edit, no label, no audit row.
  if p_body = p.body and p_target_name is not distinct from p.target_name then return p; end if;

  if (select count(*) from public.moderation_actions
        where actor_id = uid and reason_code = 'author_edit' and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'rate_limited';
  end if;

  select * into d from public._moderation_decision('post', p_body || ' ' || coalesce(p_target_name, ''));

  insert into public.moderation_actions (actor_id, target_type, target_id, action, reason_code, original_body)
  values (uid, 'post', p.id, 'edit', 'author_edit',
          jsonb_build_object('body', p.body, 'target_name', p.target_name)::text);

  update public.posts
     set body = p_body, target_name = p_target_name, edited_at = now(), status = d.out_status
   where id = p.id
  returning * into p;

  if d.out_status = 'pending' then
    insert into public.moderation_holds (target_type, target_id, reason, matched_term)
    values ('post', p.id, d.out_reason, d.out_term)
    on conflict (target_type, target_id)
    do update set reason = excluded.reason, matched_term = excluded.matched_term, created_at = now();
  else
    delete from public.moderation_holds where target_type = 'post' and target_id = p.id;
  end if;
  return p;
end $$;

-- ---------------------------------------------------------------------
-- Edit a listing (sell or lost & found)
-- ---------------------------------------------------------------------
create function public.edit_own_listing(
  p_listing_id  uuid,
  p_title       text,
  p_description text default null,
  p_price       numeric default null,
  p_condition   text default null,
  p_location    text default null,
  p_event_date  date default null
) returns public.listings
language plpgsql security definer set search_path = '' as $$
declare
  uid   uuid := public.assert_active_member();
  today date := (now() at time zone 'Asia/Manila')::date;
  l     public.listings;
  d     record;
  old   jsonb;
begin
  p_title := btrim(coalesce(p_title, ''));
  p_description := nullif(btrim(coalesce(p_description, '')), '');
  p_location := nullif(btrim(coalesce(p_location, '')), '');

  select * into l from public.listings
    where id = p_listing_id and author_id = uid and deleted_at is null for update;
  if not found then raise exception 'not_found'; end if;
  if l.status not in ('published', 'pending') then raise exception 'not_editable'; end if;
  if l.created_at < now() - interval '24 hours' then raise exception 'edit_window_closed'; end if;

  if char_length(p_title) not between 1 and 100 then raise exception 'invalid_title'; end if;
  if char_length(coalesce(p_description, '')) > 2000 then raise exception 'invalid_body'; end if;

  if l.kind = 'sell' then
    if p_price is null or p_price < 0 or p_price > 9999999 then raise exception 'invalid_price'; end if;
    if p_condition is null or p_condition not in ('new', 'like_new', 'good', 'fair', 'poor') then
      raise exception 'condition_required';
    end if;
    p_location := null; p_event_date := null;
  else
    if p_location is null or char_length(p_location) > 100 or p_event_date is null
       or p_event_date > today or p_event_date < today - 60 then
      raise exception 'invalid_lost_found';
    end if;
    p_price := null; p_condition := null;
  end if;

  if p_title = l.title and p_description is not distinct from l.description
     and p_price is not distinct from l.price and p_condition is not distinct from l.condition
     and p_location is not distinct from l.location and p_event_date is not distinct from l.event_date then
    return l;
  end if;

  if (select count(*) from public.moderation_actions
        where actor_id = uid and reason_code = 'author_edit' and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'rate_limited';
  end if;

  select * into d from public._moderation_decision(
    'listing', p_title || ' ' || coalesce(p_description, '') || ' ' || coalesce(p_location, ''));

  old := jsonb_build_object('title', l.title, 'description', l.description, 'price', l.price,
                            'condition', l.condition, 'location', l.location, 'event_date', l.event_date);
  insert into public.moderation_actions (actor_id, target_type, target_id, action, reason_code, original_body)
  values (uid, 'listing', l.id, 'edit', 'author_edit', old::text);

  update public.listings
     set title = p_title, description = p_description, price = p_price, condition = p_condition,
         location = p_location, event_date = p_event_date, edited_at = now(), status = d.out_status
   where id = l.id
  returning * into l;

  if d.out_status = 'pending' then
    insert into public.moderation_holds (target_type, target_id, reason, matched_term)
    values ('listing', l.id, d.out_reason, d.out_term)
    on conflict (target_type, target_id)
    do update set reason = excluded.reason, matched_term = excluded.matched_term, created_at = now();
  else
    delete from public.moderation_holds where target_type = 'listing' and target_id = l.id;
  end if;
  return l;
end $$;

-- ---------------------------------------------------------------------
-- Delete (hide now, purge later)
-- ---------------------------------------------------------------------
create function public.delete_own_post(p_post_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.assert_active_member();
begin
  update public.posts
     set deleted_at = now(),
         status = case when status in ('published', 'pending') then 'removed'::public.content_status else status end,
         moderated_at = case when status in ('published', 'pending') then now() else moderated_at end,
         moderated_by = case when status in ('published', 'pending') then null else moderated_by end
   where id = p_post_id and author_id = uid and deleted_at is null;
  if not found then raise exception 'not_found'; end if;
end $$;

create function public.delete_own_listing(p_listing_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.assert_active_member();
begin
  update public.listings
     set deleted_at = now(),
         status = case when status in ('published', 'pending') then 'removed'::public.content_status else status end,
         moderated_at = case when status in ('published', 'pending') then now() else moderated_at end,
         moderated_by = case when status in ('published', 'pending') then null else moderated_by end
   where id = p_listing_id and author_id = uid and deleted_at is null;
  if not found then raise exception 'not_found'; end if;
end $$;

revoke execute on function
  public.edit_own_post(uuid, text, text),
  public.edit_own_listing(uuid, text, text, numeric, text, text, date),
  public.delete_own_post(uuid),
  public.delete_own_listing(uuid)
  from public, anon, authenticated;
grant execute on function
  public.edit_own_post(uuid, text, text),
  public.edit_own_listing(uuid, text, text, numeric, text, text, date),
  public.delete_own_post(uuid),
  public.delete_own_listing(uuid)
  to authenticated;

-- ---------------------------------------------------------------------
-- Purge: also remove rows the author deleted, after the same retention.
-- ---------------------------------------------------------------------
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
  delete from public.comments where status in ('rejected', 'removed')
    and moderated_at < now() - make_interval(days => s.rejected_retention_days);
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
