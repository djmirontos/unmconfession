-- =====================================================================
-- Module 8a: account settings.
--
--   * user_settings: per-user notification switches and the time of the
--     last nickname change. Own-row read only; writes go through RPCs.
--   * get_my_settings(), set_notification_prefs(): the in-app switches.
--     Switches hide notifications when they are read (get_notifications
--     and the unread badge). Nothing is lost: turning a switch back on
--     shows everything again. Approved / rejected / removed notices are
--     always shown.
--   * change_nickname(): once every 30 days, same rules as sign-up.
--     profiles_guard still blocks every direct nickname update; this
--     function lifts the block for its own transaction only.
--   * delete_my_account(): removes the sign-in and all private data.
--     Posts, comments, reactions and votes stay (and so do other people's
--     blocks and the reports the user filed), no longer linked to a
--     person: the author shows as a profile with no nickname ("Deleted
--     user" in the app). To allow that, profiles.id no longer cascades
--     from auth.users.
-- =====================================================================

create table public.user_settings (
  user_id             uuid primary key references public.profiles (id) on delete cascade,
  notify_reactions    boolean not null default true,
  notify_comments     boolean not null default true,
  notify_replies      boolean not null default true,
  nickname_changed_at timestamptz,
  updated_at          timestamptz not null default now()
);
alter table public.user_settings enable row level security;
revoke all on public.user_settings from public, anon, authenticated;
grant select on public.user_settings to authenticated;
create policy user_settings_own_read on public.user_settings
  for select to authenticated using (user_id = (select auth.uid()));

-- Deleting an account keeps the profile row (and so the person's posts).
-- deleted_at marks it for good. It is its own column, so the moderation
-- tools that rewrite status and status_reason can never clear it.
alter table public.user_flags add column deleted_at timestamptz;
alter table public.profiles drop constraint profiles_id_fkey;

-- Same nickname lock as before, plus two things:
--   * allowed while an account RPC is running (a transaction-local
--     setting that only the functions below set; clients cannot set
--     settings through the API);
--   * a deleted account's leftover profile can never be edited again,
--     not even its avatar, while an old sign-in token is still valid.
-- Staff and SQL-editor / service-role work (no signed-in user) are exempt.
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.id <> old.id then raise exception 'immutable'; end if;
  if coalesce(current_setting('app.account_change', true), '') <> 'on'
     and (select auth.uid()) is not null and not public.is_admin() then
    if exists (select 1 from public.user_flags f
                where f.user_id = old.id and f.deleted_at is not null) then
      raise exception 'account_deleted' using errcode = '42501';
    end if;
    if old.nickname is not null and new.nickname is distinct from old.nickname then
      raise exception 'nickname_locked' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create function public.get_my_settings() returns table (
  notify_reactions        boolean,
  notify_comments         boolean,
  notify_replies          boolean,
  nickname_changed_at     timestamptz,
  nickname_next_change_at timestamptz
)
language sql stable security invoker set search_path = '' as $$
  select coalesce(s.notify_reactions, true), coalesce(s.notify_comments, true),
         coalesce(s.notify_replies, true), s.nickname_changed_at,
         s.nickname_changed_at + interval '30 days'
  from (select 1) d
  left join public.user_settings s on s.user_id = (select auth.uid())
$$;

-- null leaves a switch as it is.
create function public.set_notification_prefs(
  p_reactions boolean default null,
  p_comments  boolean default null,
  p_replies   boolean default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  insert into public.user_settings (user_id, notify_reactions, notify_comments, notify_replies)
  values (uid, coalesce(p_reactions, true), coalesce(p_comments, true), coalesce(p_replies, true))
  on conflict (user_id) do update set
    notify_reactions = coalesce(p_reactions, public.user_settings.notify_reactions),
    notify_comments  = coalesce(p_comments,  public.user_settings.notify_comments),
    notify_replies   = coalesce(p_replies,   public.user_settings.notify_replies),
    updated_at       = now();
end $$;

create function public.change_nickname(p_nickname text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid         uuid := public.assert_active_member();
  cur         text;
  last_change timestamptz;
begin
  p_nickname := btrim(coalesce(p_nickname, ''));
  select nickname into cur from public.profiles where id = uid;
  if p_nickname = cur then raise exception 'nickname_unchanged'; end if;

  select s.nickname_changed_at into last_change from public.user_settings s where s.user_id = uid;
  if last_change is not null and last_change + interval '30 days' > now() then
    raise exception 'nickname_cooldown' using detail = (last_change + interval '30 days')::text;
  end if;

  if lower(p_nickname) = lower(cur) then
    -- Only the capital letters change; the name is already theirs.
    if p_nickname !~ '^[A-Za-z0-9_.]{3,20}$' then raise exception 'nickname_invalid'; end if;
  else
    perform public._validate_nickname(p_nickname);
  end if;

  perform set_config('app.account_change', 'on', true);
  update public.profiles set nickname = p_nickname where id = uid;
  perform set_config('app.account_change', 'off', true);

  insert into public.user_settings (user_id, nickname_changed_at) values (uid, now())
  on conflict (user_id) do update set nickname_changed_at = now(), updated_at = now();
exception
  when unique_violation then raise exception 'nickname_taken';
end $$;

-- The user must type their nickname (or DELETE if they never chose one).
create function public.delete_my_account(p_confirm text) returns void
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

revoke execute on function
  public.get_my_settings(),
  public.set_notification_prefs(boolean, boolean, boolean),
  public.change_nickname(text),
  public.delete_my_account(text)
  from public, anon, authenticated;
grant execute on function
  public.get_my_settings(),
  public.set_notification_prefs(boolean, boolean, boolean),
  public.change_nickname(text),
  public.delete_my_account(text)
  to authenticated;

-- The switches hide notifications at read time. Same signatures as before,
-- so the existing grants stay.
create or replace function public.get_notifications(
  p_before_ts  timestamptz default null,
  p_before_key text default null,
  p_limit      int default 20
) returns table (
  group_key         text,
  type              text,
  target_type       public.content_type,
  target_id         uuid,
  latest_at         timestamptz,
  event_count       int,
  actor_count       int,
  unread_count      int,
  actor_id          uuid,
  actor_nickname    text,
  actor_avatar_key  text,
  reaction_type     text,
  reason            text,
  target_exists     boolean,
  target_status     text,
  target_kind       text,
  target_preview    text,
  parent_post_id    uuid,
  parent_listing_id uuid
)
language sql stable security invoker set search_path = '' as $$
  with base as (
    select n.*,
           case when n.type in ('comment', 'reaction', 'comment_reaction', 'reply')
                then n.type || ':' || n.target_id::text
                else n.id::text end as gkey
    from public.notifications n
    where n.user_id = (select auth.uid())
      and not exists (select 1 from public.user_blocks b
                       where b.blocker_id = (select auth.uid()) and b.blocked_id = n.actor_id)
      and not exists (select 1 from public.user_settings s
                       where s.user_id = (select auth.uid())
                         and ((n.type in ('reaction', 'comment_reaction') and not s.notify_reactions)
                           or (n.type = 'comment' and not s.notify_comments)
                           or (n.type = 'reply' and not s.notify_replies)))
  ),
  g as (
    select gkey, type, target_type, target_id,
           max(created_at)                                              as latest_at,
           count(*)::int                                                as event_count,
           count(distinct actor_id)::int                                as actor_count,
           (count(*) filter (where read_at is null))::int              as unread_count,
           (array_agg(actor_id order by created_at desc))[1]            as last_actor,
           (array_agg(data ->> 'reaction' order by created_at desc))[1] as reaction_type,
           (array_agg(data ->> 'reason' order by created_at desc))[1]   as reason
    from base
    group by gkey, type, target_type, target_id
  )
  select g.gkey, g.type, g.target_type, g.target_id, g.latest_at, g.event_count, g.actor_count,
         g.unread_count, g.last_actor, pr.nickname, pr.avatar_key, g.reaction_type, g.reason,
         (coalesce(p.id, l.id, c.id) is not null),
         coalesce(p.status::text, l.status::text, c.status::text),
         coalesce(p.kind::text, l.kind::text, case when c.id is not null then 'comment' end),
         left(coalesce(p.body, l.title, c.body), 80),
         c.post_id, c.listing_id
  from g
  left join public.profiles pr on pr.id = g.last_actor
  left join public.posts    p  on g.target_type = 'post'    and p.id = g.target_id
  left join public.listings l  on g.target_type = 'listing' and l.id = g.target_id
  left join public.comments c  on g.target_type = 'comment' and c.id = g.target_id
  where p_before_ts is null or (g.latest_at, g.gkey) < (p_before_ts, p_before_key)
  order by g.latest_at desc, g.gkey desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
$$;

create or replace function public.get_unread_notification_count() returns int
language sql stable security invoker set search_path = '' as $$
  select count(distinct case when n.type in ('comment', 'reaction', 'comment_reaction', 'reply')
                             then n.type || ':' || n.target_id::text
                             else n.id::text end)::int
  from public.notifications n
  where n.user_id = (select auth.uid())
    and n.read_at is null
    and not exists (select 1 from public.user_blocks b
                     where b.blocker_id = (select auth.uid()) and b.blocked_id = n.actor_id)
    and not exists (select 1 from public.user_settings s
                     where s.user_id = (select auth.uid())
                       and ((n.type in ('reaction', 'comment_reaction') and not s.notify_reactions)
                         or (n.type = 'comment' and not s.notify_comments)
                         or (n.type = 'reply' and not s.notify_replies)))
$$;
