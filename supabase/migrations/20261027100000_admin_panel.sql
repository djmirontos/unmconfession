-- Module 7a: data layer for the admin / moderation web panel.
-- Read RPCs for staff, admin-only identity tools with an audit trail,
-- and safety fixes: moderation tools refuse deleted accounts, and admins
-- can delete a restricted account. All writes stay RPC-only.

-- ---------------------------------------------------------------------
-- Audit trail for admin-only actions
-- ---------------------------------------------------------------------
create table public.admin_audit_log (
  id               uuid primary key default gen_random_uuid(),
  admin_id         uuid references public.profiles (id) on delete set null,
  action           text not null check (action in ('view_identity', 'find_by_email', 'set_role', 'delete_account')),
  subject_user_id  uuid references public.profiles (id) on delete set null,
  detail           text check (detail is null or char_length(detail) <= 500),
  created_at       timestamptz not null default now()
);
create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc, id desc);
alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from anon, authenticated;
grant select on public.admin_audit_log to authenticated;
create policy admin_audit_select on public.admin_audit_log
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- Reports queue: open reports grouped per reported item, oldest first
-- ---------------------------------------------------------------------
create function public.mod_get_reports(
  p_limit int default 50, p_after_ts timestamptz default null, p_after_id uuid default null)
returns table (
  target_type public.content_type, target_id uuid, report_count int, reasons text[],
  first_reported_at timestamptz, last_reported_at timestamptz,
  content_status public.content_status, title text, body text, images jsonb,
  author_id uuid, nickname text)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select g.target_type, g.target_id, g.cnt, g.reasons, g.first_at, g.last_at,
         c.status, c.title, c.body, c.images, c.author_id, pr.nickname
  from (
    select r.target_type, r.target_id, count(*)::int as cnt,
           array_agg(distinct r.reason order by r.reason) as reasons,
           min(r.created_at) as first_at, max(r.created_at) as last_at
    from public.reports r
    where r.status = 'open'
    group by r.target_type, r.target_id
  ) g
  left join lateral (
    select p.status, p.kind::text as title, p.body, p.images, p.author_id
      from public.posts p where g.target_type = 'post' and p.id = g.target_id
    union all
    select c2.status, null::text, c2.body, '[]'::jsonb, c2.author_id
      from public.comments c2 where g.target_type = 'comment' and c2.id = g.target_id
    union all
    select l.status, l.title, l.description, l.images, l.author_id
      from public.listings l where g.target_type = 'listing' and l.id = g.target_id
  ) c on true
  left join public.profiles pr on pr.id = c.author_id
  where p_after_ts is null
     or (g.first_at, g.target_id) > (p_after_ts, coalesce(p_after_id, '00000000-0000-0000-0000-000000000000'::uuid))
  order by g.first_at, g.target_id
  limit least(greatest(p_limit, 1), 100);
end $$;

-- Every report on one item (open and handled), with who reported and who handled
create function public.mod_get_report_details(p_type public.content_type, p_id uuid)
returns table (
  report_id uuid, reason text, note text, status text, created_at timestamptz,
  reporter_id uuid, reporter_nickname text, handled_by_nickname text, handled_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select r.id, r.reason, r.note, r.status, r.created_at, r.reporter_id, rp.nickname, hp.nickname, r.handled_at
  from public.reports r
  left join public.profiles rp on rp.id = r.reporter_id
  left join public.profiles hp on hp.id = r.handled_by
  where r.target_type = p_type and r.target_id = p_id
  order by r.created_at, r.id;
end $$;

-- ---------------------------------------------------------------------
-- One item in full: for the review and report screens
-- ---------------------------------------------------------------------
create function public.mod_get_content(p_type public.content_type, p_id uuid)
returns table (
  target_type public.content_type, target_id uuid, kind text, status public.content_status,
  reject_reason text, title text, body text, images jsonb,
  author_id uuid, nickname text, author_status public.account_status, author_deleted boolean,
  created_at timestamptz, published_at timestamptz, edited_at timestamptz, deleted_at timestamptz,
  moderated_at timestamptz, moderated_by_nickname text,
  reaction_count int, comment_count int, post_id uuid, listing_id uuid, post_number bigint,
  hold_reason text, matched_term text, open_report_count int, extra jsonb)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select p_type, p_id, c.kind, c.status, c.reject_reason, c.title, c.body, c.images,
         c.author_id, pr.nickname, f.status, (f.deleted_at is not null),
         c.created_at, c.published_at, c.edited_at, c.deleted_at,
         c.moderated_at, mp.nickname,
         c.reaction_count, c.comment_count, c.post_id, c.listing_id, c.post_number,
         h.reason, h.matched_term,
         (select count(*)::int from public.reports r
           where r.target_type = p_type and r.target_id = p_id and r.status = 'open'),
         c.extra
  from (
    select p.kind::text as kind, p.status, p.reject_reason, null::text as title, p.body, p.images,
           p.author_id, p.created_at, p.published_at, p.edited_at, p.deleted_at,
           p.moderated_at, p.moderated_by, p.reaction_count, p.comment_count,
           null::uuid as post_id, null::uuid as listing_id, p.number as post_number,
           jsonb_build_object('target_name', p.target_name, 'ends_at', p.ends_at) as extra
      from public.posts p where p_type = 'post' and p.id = p_id
    union all
    select 'comment', c2.status, c2.reject_reason, null::text, c2.body, '[]'::jsonb,
           c2.author_id, c2.created_at, c2.published_at, c2.edited_at, c2.deleted_at,
           c2.moderated_at, c2.moderated_by, c2.reaction_count, c2.reply_count,
           c2.post_id, c2.listing_id, null::bigint,
           jsonb_build_object('parent_id', c2.parent_id)
      from public.comments c2 where p_type = 'comment' and c2.id = p_id
    union all
    select l.kind::text, l.status, l.reject_reason, l.title, l.description, l.images,
           l.author_id, l.created_at, l.published_at, l.edited_at, l.deleted_at,
           l.moderated_at, l.moderated_by, 0, l.comment_count,
           null::uuid, null::uuid, null::bigint,
           jsonb_build_object('price', l.price, 'condition', l.condition, 'location', l.location,
                              'event_date', l.event_date, 'is_closed', l.is_closed,
                              'lost_found_type', l.lost_found_type)
      from public.listings l where p_type = 'listing' and l.id = p_id
  ) c
  left join public.profiles pr on pr.id = c.author_id
  left join public.user_flags f on f.user_id = c.author_id
  left join public.profiles mp on mp.id = c.moderated_by
  left join public.moderation_holds h on h.target_type = p_type and h.target_id = p_id;
  if not found then raise exception 'not_found'; end if;
end $$;

-- ---------------------------------------------------------------------
-- Browse / search content (to remove or restore live items)
-- ---------------------------------------------------------------------
create function public.mod_list_content(
  p_type public.content_type default null, p_status public.content_status default null,
  p_search text default null, p_limit int default 30,
  p_after_ts timestamptz default null, p_after_id uuid default null)
returns table (
  target_type public.content_type, target_id uuid, status public.content_status,
  title text, body text, images jsonb, author_id uuid, nickname text,
  created_at timestamptz, deleted_at timestamptz, post_number bigint)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  s   text := left(btrim(coalesce(p_search, '')), 100);
  pat text;
  num bigint;
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if s <> '' then
    if s ~ '^#?[0-9]{1,15}$' then num := replace(s, '#', '')::bigint; end if;
    pat := '%' || replace(replace(replace(s, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  return query
  select u.target_type, u.target_id, u.status, u.title, u.body, u.images,
         u.author_id, pr.nickname, u.created_at, u.deleted_at, u.post_number
  from (
    select 'post'::public.content_type as target_type, p.id as target_id, p.status,
           p.kind::text as title, p.body, p.images, p.author_id, p.created_at, p.deleted_at,
           p.number as post_number
      from public.posts p
     where (p_type is null or p_type = 'post')
       and (p_status is null or p.status = p_status)
       and (s = '' or (num is not null and p.number = num) or p.body ilike pat escape '\')
    union all
    select 'comment'::public.content_type, c.id, c.status, null::text, c.body, '[]'::jsonb,
           c.author_id, c.created_at, c.deleted_at, null::bigint
      from public.comments c
     where (p_type is null or p_type = 'comment')
       and (p_status is null or c.status = p_status)
       and (s = '' or c.body ilike pat escape '\')
    union all
    select 'listing'::public.content_type, l.id, l.status, l.title, l.description, l.images,
           l.author_id, l.created_at, l.deleted_at, null::bigint
      from public.listings l
     where (p_type is null or p_type = 'listing')
       and (p_status is null or l.status = p_status)
       and (s = '' or l.title ilike pat escape '\' or l.description ilike pat escape '\')
  ) u
  left join public.profiles pr on pr.id = u.author_id
  where p_after_ts is null
     or (u.created_at, u.target_id) < (p_after_ts, coalesce(p_after_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
  order by u.created_at desc, u.target_id desc
  limit least(greatest(p_limit, 1), 100);
end $$;

-- ---------------------------------------------------------------------
-- Users: search by nickname, or one user by id. No email here.
-- ---------------------------------------------------------------------
create function public.mod_search_users(
  p_search text default null, p_status public.account_status default null,
  p_role public.app_role default null, p_user uuid default null,
  p_include_deleted boolean default false, p_limit int default 30,
  p_after_ts timestamptz default null, p_after_id uuid default null)
returns table (
  user_id uuid, nickname text, avatar_key text, role public.app_role, status public.account_status,
  suspended_until timestamptz, status_reason text, deleted boolean, joined_at timestamptz,
  terms_accepted_at timestamptz, post_count int, comment_count int, listing_count int,
  open_reports_against int)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  s   text := left(btrim(coalesce(p_search, '')), 100);
  pat text;
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if s <> '' then
    pat := '%' || replace(replace(replace(s, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  return query
  select pr.id, pr.nickname, pr.avatar_key, f.role, f.status, f.suspended_until, f.status_reason,
         (f.deleted_at is not null), pr.created_at, f.terms_accepted_at,
         (select count(*)::int from public.posts x where x.author_id = pr.id),
         (select count(*)::int from public.comments x where x.author_id = pr.id),
         (select count(*)::int from public.listings x where x.author_id = pr.id),
         (select count(*)::int from public.reports r
           where r.status = 'open' and (
             (r.target_type = 'post' and exists (select 1 from public.posts x where x.id = r.target_id and x.author_id = pr.id))
             or (r.target_type = 'comment' and exists (select 1 from public.comments x where x.id = r.target_id and x.author_id = pr.id))
             or (r.target_type = 'listing' and exists (select 1 from public.listings x where x.id = r.target_id and x.author_id = pr.id))))
  from public.profiles pr
  join public.user_flags f on f.user_id = pr.id
  where case
          when p_user is not null then pr.id = p_user
          else (p_include_deleted or f.deleted_at is null)
               and (s = '' or pr.nickname ilike pat escape '\')
               and (p_status is null or f.status = p_status)
               and (p_role is null or f.role = p_role)
               and (p_after_ts is null
                    or (pr.created_at, pr.id) < (p_after_ts, coalesce(p_after_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
        end
  order by pr.created_at desc, pr.id desc
  limit least(greatest(p_limit, 1), 100);
end $$;

-- ---------------------------------------------------------------------
-- Moderation log. p_subject_user also matches actions on that user's content.
-- ---------------------------------------------------------------------
create function public.mod_get_actions(
  p_target_type text default null, p_target_id uuid default null, p_actor uuid default null,
  p_subject_user uuid default null, p_limit int default 50,
  p_after_ts timestamptz default null, p_after_id uuid default null)
returns table (
  id uuid, created_at timestamptz, actor_id uuid, actor_nickname text,
  target_type text, target_id uuid, action text, reason_code text, note text, original_body text)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select a.id, a.created_at, a.actor_id, ap.nickname, a.target_type, a.target_id,
         a.action, a.reason_code, a.note, a.original_body
  from public.moderation_actions a
  left join public.profiles ap on ap.id = a.actor_id
  where (p_target_type is null or a.target_type = p_target_type)
    and (p_target_id is null or a.target_id = p_target_id)
    and (p_actor is null or a.actor_id = p_actor)
    and (p_subject_user is null
         or (a.target_type = 'user' and a.target_id = p_subject_user)
         or (a.target_type = 'post' and exists (select 1 from public.posts x where x.id = a.target_id and x.author_id = p_subject_user))
         or (a.target_type = 'comment' and exists (select 1 from public.comments x where x.id = a.target_id and x.author_id = p_subject_user))
         or (a.target_type = 'listing' and exists (select 1 from public.listings x where x.id = a.target_id and x.author_id = p_subject_user)))
    and (p_after_ts is null
         or (a.created_at, a.id) < (p_after_ts, coalesce(p_after_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by a.created_at desc, a.id desc
  limit least(greatest(p_limit, 1), 100);
end $$;

-- ---------------------------------------------------------------------
-- Dashboard numbers
-- ---------------------------------------------------------------------
create function public.mod_dashboard()
returns table (
  pending_posts int, pending_comments int, pending_listings int,
  open_reports int, reported_items int,
  posts_24h int, comments_24h int, listings_24h int, new_users_24h int,
  suspended_users int, banned_users int, deleted_accounts int)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select (select count(*)::int from public.posts where status = 'pending'),
         (select count(*)::int from public.comments where status = 'pending'),
         (select count(*)::int from public.listings where status = 'pending'),
         (select count(*)::int from public.reports where status = 'open'),
         (select count(*)::int from (select 1 from public.reports where status = 'open' group by target_type, target_id) t),
         (select count(*)::int from public.posts where status = 'published' and published_at > now() - interval '24 hours'),
         (select count(*)::int from public.comments where status = 'published' and published_at > now() - interval '24 hours'),
         (select count(*)::int from public.listings where status = 'published' and published_at > now() - interval '24 hours'),
         (select count(*)::int from public.profiles where created_at > now() - interval '24 hours'),
         (select count(*)::int from public.user_flags
           where status = 'suspended' and deleted_at is null and (suspended_until is null or suspended_until > now())),
         (select count(*)::int from public.user_flags where status = 'banned' and deleted_at is null),
         (select count(*)::int from public.user_flags where deleted_at is not null);
end $$;

-- ---------------------------------------------------------------------
-- Admin only: email and sign-in details. Every call is written to the audit log.
-- ---------------------------------------------------------------------
create function public.admin_get_user_identity(p_user uuid)
returns table (
  user_id uuid, nickname text, email text, joined_at timestamptz,
  last_sign_in_at timestamptz, email_confirmed boolean, providers text[])
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from auth.users u where u.id = p_user) then raise exception 'not_found'; end if;
  insert into public.admin_audit_log (admin_id, action, subject_user_id)
  values ((select auth.uid()), 'view_identity', p_user);
  return query
  select pr.id, pr.nickname, u.email::text, u.created_at, u.last_sign_in_at,
         (u.email_confirmed_at is not null),
         coalesce(array(select jsonb_array_elements_text(u.raw_app_meta_data -> 'providers')), '{}'::text[])
  from auth.users u
  left join public.profiles pr on pr.id = u.id
  where u.id = p_user;
end $$;

create function public.admin_find_user_by_email(p_email text)
returns table (user_id uuid, nickname text)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  found_id uuid;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  p_email := lower(btrim(coalesce(p_email, '')));
  if p_email = '' or char_length(p_email) > 254 then raise exception 'invalid_email'; end if;
  select u.id into found_id from auth.users u where lower(u.email) = p_email;
  -- the searched address itself is never stored
  insert into public.admin_audit_log (admin_id, action, subject_user_id, detail)
  values ((select auth.uid()), 'find_by_email', found_id, case when found_id is null then 'no match' end);
  -- no match returns no rows (an error would roll the audit entry back)
  return query select pr.id, pr.nickname from public.profiles pr where pr.id = found_id;
end $$;

-- Audit log feed: content-author lookups and the admin actions above
create function public.admin_get_audit(
  p_limit int default 50, p_after_ts timestamptz default null, p_after_id uuid default null)
returns table (
  id uuid, created_at timestamptz, admin_id uuid, admin_nickname text, action text,
  subject_user_id uuid, subject_nickname text, target_type text, target_id uuid, detail text)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select u.id, u.created_at, u.admin_id, ap.nickname, u.action, u.subject_user_id, sp.nickname,
         u.target_type, u.target_id, u.detail
  from (
    select a.id, a.created_at, a.admin_id, 'view_content_author'::text as action, a.subject_user_id,
           a.target_type::text as target_type, a.target_id, null::text as detail
      from public.identity_audit_log a
    union all
    select b.id, b.created_at, b.admin_id, b.action, b.subject_user_id, null::text, null::uuid, b.detail
      from public.admin_audit_log b
  ) u
  left join public.profiles ap on ap.id = u.admin_id
  left join public.profiles sp on sp.id = u.subject_user_id
  where p_after_ts is null
     or (u.created_at, u.id) < (p_after_ts, coalesce(p_after_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
  order by u.created_at desc, u.id desc
  limit least(greatest(p_limit, 1), 100);
end $$;

-- ---------------------------------------------------------------------
-- Admin deletes a restricted account (same result as the user deleting it)
-- ---------------------------------------------------------------------
create function public.admin_delete_account(p_user uuid, p_reason text)
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

-- ---------------------------------------------------------------------
-- Existing tools: refuse deleted accounts (same signatures, grants stay)
-- ---------------------------------------------------------------------
create or replace function public.mod_set_user_status(
  p_user uuid, p_status public.account_status,
  p_until timestamptz default null, p_reason text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target_role public.app_role;
  was_deleted timestamptz;
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_user = actor then raise exception 'cannot_target_self'; end if;
  select role, deleted_at into target_role, was_deleted from public.user_flags where user_id = p_user;
  if not found then raise exception 'not_found'; end if;
  if was_deleted is not null then raise exception 'account_deleted'; end if;
  if target_role <> 'user' and not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if target_role = 'admin' then raise exception 'cannot_target_admin'; end if;
  if p_status = 'suspended' and (p_until is null or p_until <= now()) then raise exception 'invalid_until'; end if;

  update public.user_flags
     set status = p_status,
         suspended_until = case when p_status = 'suspended' then p_until end,
         status_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         updated_at = now()
   where user_id = p_user;

  insert into public.moderation_actions (actor_id, target_type, target_id, action, reason_code)
  values (actor, 'user', p_user,
          case p_status when 'banned' then 'ban' when 'suspended' then 'suspend' else 'restore_user' end,
          nullif(btrim(coalesce(p_reason, '')), ''));
end $$;

create or replace function public.admin_set_role(p_user uuid, p_role public.app_role)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  old_role public.app_role;
  was_deleted timestamptz;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_user = actor then raise exception 'cannot_target_self'; end if;
  select role, deleted_at into old_role, was_deleted from public.user_flags where user_id = p_user;
  if not found then raise exception 'not_found'; end if;
  if was_deleted is not null then raise exception 'account_deleted'; end if;
  update public.user_flags set role = p_role, updated_at = now() where user_id = p_user;
  insert into public.admin_audit_log (admin_id, action, subject_user_id, detail)
  values (actor, 'set_role', p_user, old_role::text || ' -> ' || p_role::text);
end $$;

-- ---------------------------------------------------------------------
-- Grants: signed-in only; each function checks the role itself
-- ---------------------------------------------------------------------
revoke all on function public.mod_get_reports(int, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.mod_get_report_details(public.content_type, uuid) from public, anon, authenticated;
revoke all on function public.mod_get_content(public.content_type, uuid) from public, anon, authenticated;
revoke all on function public.mod_list_content(public.content_type, public.content_status, text, int, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.mod_search_users(text, public.account_status, public.app_role, uuid, boolean, int, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.mod_get_actions(text, uuid, uuid, uuid, int, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.mod_dashboard() from public, anon, authenticated;
revoke all on function public.admin_get_user_identity(uuid) from public, anon, authenticated;
revoke all on function public.admin_find_user_by_email(text) from public, anon, authenticated;
revoke all on function public.admin_get_audit(int, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.admin_delete_account(uuid, text) from public, anon, authenticated;

grant execute on function public.mod_get_reports(int, timestamptz, uuid) to authenticated;
grant execute on function public.mod_get_report_details(public.content_type, uuid) to authenticated;
grant execute on function public.mod_get_content(public.content_type, uuid) to authenticated;
grant execute on function public.mod_list_content(public.content_type, public.content_status, text, int, timestamptz, uuid) to authenticated;
grant execute on function public.mod_search_users(text, public.account_status, public.app_role, uuid, boolean, int, timestamptz, uuid) to authenticated;
grant execute on function public.mod_get_actions(text, uuid, uuid, uuid, int, timestamptz, uuid) to authenticated;
grant execute on function public.mod_dashboard() to authenticated;
grant execute on function public.admin_get_user_identity(uuid) to authenticated;
grant execute on function public.admin_find_user_by_email(text) to authenticated;
grant execute on function public.admin_get_audit(int, timestamptz, uuid) to authenticated;
grant execute on function public.admin_delete_account(uuid, text) to authenticated;
