-- =====================================================================
-- v1.0.5 - Chat reports (safety stage)
--
--   chat_reports           a report keeps its OWN copy of the evidence. The server copies the
--                          reported message and up to 10 before / 10 after it (text only, only
--                          what the reporter could see) at the moment of the report, so the
--                          evidence survives message deletion, "Delete chat for me", retention
--                          purges and account deletion. There are deliberately no foreign keys
--                          to chats or members. The client never sends message text.
--   report_chat            members report a message or a chat (also a pending/declined request
--                          they RECEIVED, whose text is the evidence). Allowed while muted, not
--                          while banned. One open report per reporter per chat; 10 a day.
--                          The reported member is never told.
--   staff                  list (no snapshot), open one (snapshot; EVERY open is written to
--                          admin_audit_log), escalate to admins, resolve with an outcome.
--                          Staff never browse chats: they only see snapshots. Nobody can open
--                          or resolve a report about themselves.
--   child_safety           reports with this reason are admin-only from the start and held:
--                          moderators see that one exists (reason and date) but nothing else.
--   held                   a held report is never purged; only an admin can release the hold.
--   alert                  staff get the existing 'staff_report' notification (generic push
--                          "New report to review"); child-safety/escalated ones go to admins only.
--   retention              resolved, un-held reports are deleted after 90 days; open un-held
--                          ones after 180 days (daily, pg_cron when available).
--
-- Additions only. Existing functions are untouched.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Audit log actions
-- ---------------------------------------------------------------------
alter table public.admin_audit_log drop constraint admin_audit_log_action_check;
alter table public.admin_audit_log add constraint admin_audit_log_action_check
  check (action in ('view_identity', 'find_by_email', 'set_role', 'delete_account',
                    'view_chat_report', 'escalate_chat_report', 'release_chat_hold'));

-- ---------------------------------------------------------------------
-- 2. Table
-- ---------------------------------------------------------------------
create table public.chat_reports (
  id                uuid primary key default gen_random_uuid(),
  reporter_id       uuid not null,
  reported_id       uuid not null,
  conversation_id   uuid not null,
  message_id        uuid,
  reason            text not null check (reason in ('harassment', 'spam_scam', 'sexual_content', 'threats', 'child_safety', 'other')),
  note              text check (note is null or char_length(note) <= 300),
  reporter_nickname text,
  reported_nickname text,
  snapshot          jsonb not null default '[]'::jsonb check (jsonb_typeof(snapshot) = 'array'),
  status            text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  admin_only        boolean not null default false,
  held              boolean not null default false,
  outcome           text check (outcome is null or outcome in ('dismissed', 'warned', 'muted', 'banned', 'other')),
  resolution_note   text check (resolution_note is null or char_length(resolution_note) <= 300),
  resolved_by       uuid,
  resolved_at       timestamptz,
  created_at        timestamptz not null default now(),
  constraint chat_reports_resolved check ((status = 'open') = (resolved_at is null))
);
create unique index chat_reports_one_open_idx on public.chat_reports (reporter_id, conversation_id) where status = 'open';
create index chat_reports_queue_idx   on public.chat_reports (status, created_at, id);
create index chat_reports_reporter_idx on public.chat_reports (reporter_id, created_at desc);
alter table public.chat_reports enable row level security;
revoke all on public.chat_reports from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Members report
-- ---------------------------------------------------------------------
create function public.report_chat(p_conversation uuid, p_message uuid, p_reason text, p_note text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid      uuid := public._chat_reader();
  c        public.chat_conversations;
  other    uuid;
  cleared  timestamptz;
  target   public.chat_messages;
  v_note   text := nullif(btrim(coalesce(p_note, '')), '');
  snap     jsonb;
  rid      uuid;
  csafety  boolean := (p_reason = 'child_safety');
begin
  if p_reason is null or p_reason not in ('harassment', 'spam_scam', 'sexual_content', 'threats', 'child_safety', 'other') then
    raise exception 'invalid_reason';
  end if;
  if v_note is not null and char_length(v_note) > 300 then raise exception 'note_too_long'; end if;

  select * into c from public.chat_conversations where id = p_conversation and uid in (member_a, member_b);
  if not found then raise exception 'not_found'; end if;
  other := case when c.member_a = uid then c.member_b else c.member_a end;

  if (select count(*) from public.chat_reports where reporter_id = uid and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'rate_limited';
  end if;
  if exists (select 1 from public.chat_reports where reporter_id = uid and conversation_id = c.id and status = 'open') then
    raise exception 'already_reported';
  end if;

  if c.status = 'accepted' then
    select cm.cleared_before into cleared from public.chat_members cm
     where cm.conversation_id = c.id and cm.user_id = uid;
    if p_message is not null then
      select * into target from public.chat_messages
       where id = p_message and conversation_id = c.id and deleted_at is null
         and (cleared is null or created_at > cleared);
      if not found then raise exception 'not_found'; end if;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', s.id, 'from', case when s.sender_id = uid then 'reporter' else 'reported' end,
             'at', s.created_at, 'body', s.body, 'deleted', s.deleted_at is not null,
             'reported', coalesce(s.id = p_message, false)) order by s.created_at, s.id), '[]'::jsonb)
      into snap
      from (
        select m.* from public.chat_messages m
         where m.conversation_id = c.id and (cleared is null or m.created_at > cleared)
           and (
             (p_message is null)
             or m.id in (select x.id from (
                   (select id, created_at from public.chat_messages
                     where conversation_id = c.id and (cleared is null or created_at > cleared)
                       and (created_at, id) <= (target.created_at, target.id)
                     order by created_at desc, id desc limit 11)
                   union
                   (select id, created_at from public.chat_messages
                     where conversation_id = c.id and (cleared is null or created_at > cleared)
                       and (created_at, id) > (target.created_at, target.id)
                     order by created_at, id limit 10)) x)
           )
         order by m.created_at desc, m.id desc
         limit 21
      ) s;
  else
    -- a request I RECEIVED (pending or declined): its text is the evidence
    if c.requested_by = uid then raise exception 'not_found'; end if;
    if p_message is not null then raise exception 'not_found'; end if;
    snap := jsonb_build_array(jsonb_build_object(
              'id', null, 'from', 'reported', 'at', c.requested_at, 'body', c.request_body,
              'deleted', false, 'reported', true));
  end if;

  insert into public.chat_reports (reporter_id, reported_id, conversation_id, message_id, reason, note,
                                   reporter_nickname, reported_nickname, snapshot, admin_only, held)
  values (uid, other, c.id, p_message, p_reason, v_note,
          (select nickname from public.profiles where id = uid),
          (select nickname from public.profiles where id = other),
          snap, csafety, csafety)
  returning id into rid;
  return rid;
end $$;

-- ---------------------------------------------------------------------
-- 4. Alert staff (never blocks the report)
-- ---------------------------------------------------------------------
create function public._chat_report_alert(p_reporter uuid, p_admins_only boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, type, actor_id)
  select f.user_id, 'staff_report', null
    from public.user_flags f
   where f.status = 'active' and f.deleted_at is null
     and (f.role = 'admin' or (f.role = 'moderator' and not p_admins_only))
     and f.user_id <> p_reporter
     and not exists (select 1 from public.notifications n
                      where n.user_id = f.user_id and n.type = 'staff_report'
                        and n.created_at > now() - interval '15 minutes');
exception when others then
  raise warning '_chat_report_alert failed: %', sqlerrm;
end $$;
revoke all on function public._chat_report_alert(uuid, boolean) from public, anon, authenticated;

create function public.chat_reports_alert_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public._chat_report_alert(new.reporter_id, new.admin_only);
  return new;
end $$;
revoke all on function public.chat_reports_alert_trigger() from public, anon, authenticated;
create trigger chat_reports_alert after insert on public.chat_reports
  for each row execute function public.chat_reports_alert_trigger();

-- ---------------------------------------------------------------------
-- 5. Staff
-- ---------------------------------------------------------------------
create function public.mod_get_chat_reports(p_status text default 'open', p_limit int default 50,
                                            p_after_ts timestamptz default null, p_after_id uuid default null)
returns table (id uuid, reason text, status text, created_at timestamptz,
               reporter_nickname text, reported_nickname text, note text,
               admin_only boolean, held boolean, outcome text, resolved_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid  uuid := (select auth.uid());
  adm  boolean := public.is_admin();
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status is null or p_status not in ('open', 'dismissed', 'actioned') then raise exception 'invalid_status'; end if;
  return query
  select r.id, r.reason, r.status, r.created_at,
         case when r.admin_only and not adm then null else r.reporter_nickname end,
         case when r.admin_only and not adm then null else r.reported_nickname end,
         case when r.admin_only and not adm then null else r.note end,
         r.admin_only, r.held, r.outcome, r.resolved_at
    from public.chat_reports r
   where r.status = p_status
     and r.reported_id <> uid
     and (p_after_ts is null or p_after_id is null or (r.created_at, r.id) > (p_after_ts, p_after_id))
   order by r.created_at, r.id
   limit least(greatest(coalesce(p_limit, 50), 1), 100);
end $$;

create function public.mod_get_chat_report(p_report uuid)
returns table (id uuid, reason text, note text, status text, created_at timestamptz,
               reporter_nickname text, reported_nickname text, reported_id uuid, message_id uuid,
               snapshot jsonb, admin_only boolean, held boolean, outcome text, resolution_note text,
               resolved_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  r   public.chat_reports;
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from public.chat_reports where chat_reports.id = p_report;
  if not found or r.reported_id = uid then raise exception 'not_found'; end if;
  if r.admin_only and not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  insert into public.admin_audit_log (admin_id, action, subject_user_id, detail)
  values (uid, 'view_chat_report', (select p.id from public.profiles p where p.id = r.reported_id),
          'report ' || r.id::text);

  return query
  select r.id, r.reason, r.note, r.status, r.created_at, r.reporter_nickname, r.reported_nickname,
         r.reported_id, r.message_id, r.snapshot, r.admin_only, r.held, r.outcome, r.resolution_note, r.resolved_at;
end $$;

create function public.mod_escalate_chat_report(p_report uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  r   public.chat_reports;
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from public.chat_reports where id = p_report for update;
  if not found or r.reported_id = uid then raise exception 'not_found'; end if;
  if r.status <> 'open' then raise exception 'already_resolved'; end if;
  if r.admin_only and not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.admin_only then return; end if;
  update public.chat_reports set admin_only = true, held = true where id = r.id;
  insert into public.admin_audit_log (admin_id, action, subject_user_id, detail)
  values (uid, 'escalate_chat_report', (select p.id from public.profiles p where p.id = r.reported_id),
          'report ' || r.id::text);
  perform public._chat_report_alert(uid, true);
end $$;

create function public.mod_resolve_chat_report(p_report uuid, p_outcome text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid  uuid := (select auth.uid());
  r    public.chat_reports;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_outcome is null or p_outcome not in ('dismissed', 'warned', 'muted', 'banned', 'other') then
    raise exception 'invalid_outcome';
  end if;
  if v_note is not null and char_length(v_note) > 300 then raise exception 'note_too_long'; end if;
  select * into r from public.chat_reports where id = p_report for update;
  if not found or r.reported_id = uid then raise exception 'not_found'; end if;
  if r.status <> 'open' then raise exception 'already_resolved'; end if;
  if r.admin_only and not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.chat_reports
     set status = case when p_outcome = 'dismissed' then 'dismissed' else 'actioned' end,
         outcome = p_outcome, resolution_note = v_note, resolved_by = uid, resolved_at = now()
   where id = r.id;
end $$;

create function public.admin_release_chat_report_hold(p_report uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  r   public.chat_reports;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from public.chat_reports where id = p_report for update;
  if not found or r.reported_id = uid then raise exception 'not_found'; end if;
  if not r.held then return; end if;
  update public.chat_reports set held = false where id = r.id;
  insert into public.admin_audit_log (admin_id, action, subject_user_id, detail)
  values (uid, 'release_chat_hold', (select p.id from public.profiles p where p.id = r.reported_id),
          'report ' || r.id::text);
end $$;

create function public.mod_open_chat_report_count() returns int
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  return (select count(*)::int from public.chat_reports
           where status = 'open' and reported_id <> (select auth.uid()));
end $$;

-- ---------------------------------------------------------------------
-- 6. Housekeeping (daily, 03:55 UTC)
-- ---------------------------------------------------------------------
create function public.purge_chat_reports() returns void
language sql security definer set search_path = '' as $$
  delete from public.chat_reports
   where not held
     and ((status <> 'open' and resolved_at < now() - interval '90 days')
       or (status = 'open'  and created_at  < now() - interval '180 days'));
$$;
revoke all on function public.purge_chat_reports() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('unm-chat-reports-purge', '55 3 * * *', 'select public.purge_chat_reports()');
  else
    raise notice 'pg_cron is not enabled: schedule purge_chat_reports() once a day.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 7. Grants (staff functions check the role themselves)
-- ---------------------------------------------------------------------
revoke all on function public.report_chat(uuid, uuid, text, text)                  from public, anon, authenticated;
revoke all on function public.mod_get_chat_reports(text, int, timestamptz, uuid)   from public, anon, authenticated;
revoke all on function public.mod_get_chat_report(uuid)                            from public, anon, authenticated;
revoke all on function public.mod_escalate_chat_report(uuid)                       from public, anon, authenticated;
revoke all on function public.mod_resolve_chat_report(uuid, text, text)            from public, anon, authenticated;
revoke all on function public.admin_release_chat_report_hold(uuid)                 from public, anon, authenticated;
revoke all on function public.mod_open_chat_report_count()                         from public, anon, authenticated;
grant execute on function public.report_chat(uuid, uuid, text, text)                to authenticated;
grant execute on function public.mod_get_chat_reports(text, int, timestamptz, uuid) to authenticated;
grant execute on function public.mod_get_chat_report(uuid)                          to authenticated;
grant execute on function public.mod_escalate_chat_report(uuid)                     to authenticated;
grant execute on function public.mod_resolve_chat_report(uuid, text, text)          to authenticated;
grant execute on function public.admin_release_chat_report_hold(uuid)               to authenticated;
grant execute on function public.mod_open_chat_report_count()                       to authenticated;
