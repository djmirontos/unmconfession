#!/usr/bin/env bash
# Tests for 20261107160000_chat_reports.sql (applied in ONE transaction like the SQL editor).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_creports
OWN=20261107160000
psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/tests/00_supabase_stub.sql" 2>/dev/null || { echo "stub failed"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 -d $DB <<'SQL'
create schema if not exists net;
create table net._calls (id bigint generated always as identity primary key, url text, body jsonb, headers jsonb);
create table net._http_response (id bigint primary key, status_code int, content text);
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
  headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint
language sql as $$ insert into net._calls (url, body, headers) values (url, body, headers) returning id $$;
SQL
for f in $(ls "$HERE"/migrations/*.sql | sort | awk -v own=$OWN '{ n=$0; sub(/.*\//,"",n); if (substr(n,1,14) < own) print }'); do
  psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$f" 2>&1 | grep -v NOTICE
done
SU() { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1 | grep -v '^SET$'; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }
eq()  { if [[ "$3" == "$2" ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }
uid() { printf '88888888-0000-4000-8000-%012d' "$1"; }
A=$(uid 1); B=$(uid 2); C=$(uid 3); MOD=$(uid 4); MOD2=$(uid 5); ADM=$(uid 6); ADM2=$(uid 7); D=$(uid 8)
for pair in "$A:alice_a" "$B:bobby_b" "$C:carol_c" "$MOD:mod_m" "$MOD2:mod_two" "$ADM:admin_x" "$ADM2:admin_y" "$D:dan_d"; do
  SU "insert into auth.users (id,email,raw_user_meta_data) values ('${pair%%:*}','${pair##*:}@unm.test','{\"nickname\":\"${pair##*:}\"}')" >/dev/null
done
SU "update public.user_flags set role='moderator' where user_id in ('$MOD','$MOD2'); update public.user_flags set role='admin' where user_id in ('$ADM','$ADM2')" >/dev/null
SU "update public.app_settings set chat_mode='on' where id=1" >/dev/null
T1='ExponentPush''Token[mmmmmmmmmmmmmmmmmmmmmm]'
SU "insert into public.push_tokens (user_id, token, platform) values ('$MOD','$T1','android')" >/dev/null

echo "== apply the migration in one transaction"
RC_BEFORE=$(SU "select md5(replace(prosrc, chr(13), '')) from pg_proc where proname='report_content'")
GN_BEFORE=$(SU "select md5(replace(prosrc, chr(13), '')) from pg_proc where proname='get_notifications'")
OUT=$( (echo "begin;"; cat "$HERE/migrations/$OWN"_chat_reports.sql; echo "commit;") | psql -X -q -v ON_ERROR_STOP=1 -d $DB 2>&1 | grep -v NOTICE)
eq "migration applies cleanly" "" "$OUT"
eq "report_content untouched" "$RC_BEFORE" "$(SU "select md5(replace(prosrc, chr(13), '')) from pg_proc where proname='report_content'")"
eq "get_notifications untouched" "$GN_BEFORE" "$(SU "select md5(replace(prosrc, chr(13), '')) from pg_proc where proname='get_notifications'")"

echo "== structure and grants"
eq "no foreign keys: the evidence outlives chats and members" "0" "$(SU "select count(*) from pg_constraint where conrelid='public.chat_reports'::regclass and contype='f'")"
chk "members cannot read the table" "permission denied" "$(as $A authenticated "select * from public.chat_reports")"
chk "members cannot write the table" "permission denied" "$(as $A authenticated "insert into public.chat_reports (reporter_id,reported_id,conversation_id,reason) values ('$A','$B',gen_random_uuid(),'other')")"
chk "guest cannot report" "permission denied" "$(as '' anon "select public.report_chat(gen_random_uuid(), null, 'other')")"
chk "guest cannot list" "permission denied" "$(as '' anon "select * from public.mod_get_chat_reports()")"
for fn in "report_chat(uuid,uuid,text,text)" "mod_get_chat_reports(text,int,timestamptz,uuid)" "mod_get_chat_report(uuid)" "mod_escalate_chat_report(uuid)" "mod_resolve_chat_report(uuid,text,text)" "admin_release_chat_report_hold(uuid)" "mod_open_chat_report_count()"; do
  eq "public has no execute: $fn" "f" "$(SU "select has_function_privilege('public','public.$fn','execute')")"
done
chk "members cannot call the internal alert function" "permission denied" "$(as $A authenticated "select public._chat_report_alert('$A', false)")"
chk "members cannot call the purge" "permission denied" "$(as $A authenticated "select public.purge_chat_reports()")"
eq "definer + empty search_path on all new functions" "t" "$(SU "select bool_and(prosecdef and exists (select 1 from unnest(proconfig) c where c like 'search_path=%')) from pg_proc where pronamespace='public'::regnamespace and proname in ('report_chat','mod_get_chat_reports','mod_get_chat_report','mod_escalate_chat_report','mod_resolve_chat_report','admin_release_chat_report_hold','mod_open_chat_report_count','purge_chat_reports','_chat_report_alert','chat_reports_alert_trigger')")"

echo "== setup: an accepted chat A-B with 30 messages"
CID=$(as $A authenticated "select public.send_chat_request('$B','m00 hello')")
as $B authenticated "select public.respond_chat_request('$CID', true)" >/dev/null
SU "delete from public.chat_messages where conversation_id='$CID'" >/dev/null
SU "insert into public.chat_messages (conversation_id, sender_id, body, created_at)
    select '$CID', case when g % 2 = 0 then '$A'::uuid else '$B'::uuid end, 'm'||lpad(g::text,2,'0'), now() - interval '1 hour' + (g||' minutes')::interval from generate_series(1,30) g" >/dev/null
MID=$(SU "select id from public.chat_messages where conversation_id='$CID' and body='m15'")
SU "delete from public.notifications" >/dev/null

echo "== validation"
chk "unknown reason" "invalid_reason" "$(as $A authenticated "select public.report_chat('$CID', null, 'bad')")"
chk "null reason" "invalid_reason" "$(as $A authenticated "select public.report_chat('$CID', null, null)")"
chk "note too long" "note_too_long" "$(as $A authenticated "select public.report_chat('$CID', null, 'other', '$(printf 'x%.0s' $(seq 1 301))')")"
chk "unknown conversation" "not_found" "$(as $A authenticated "select public.report_chat(gen_random_uuid(), null, 'other')")"
chk "outsider cannot report a chat" "not_found" "$(as $C authenticated "select public.report_chat('$CID', null, 'other')")"
chk "staff outside the chat cannot report it either" "not_found" "$(as $MOD authenticated "select public.report_chat('$CID', null, 'other')")"
chk "message that is not in this chat" "not_found" "$(as $A authenticated "select public.report_chat('$CID', gen_random_uuid(), 'other')")"

echo "== report a message: the server copies the evidence"
RID=$(as $A authenticated "select public.report_chat('$CID', '$MID', 'harassment', '  he keeps insulting me  ')")
eq "stored with the right parties" "$A|$B|harassment|he keeps insulting me|alice_a|bobby_b|open|false|false" "$(SU "select reporter_id||'|'||reported_id||'|'||reason||'|'||note||'|'||reporter_nickname||'|'||reported_nickname||'|'||status||'|'||admin_only||'|'||held from public.chat_reports where id='$RID'" | sed 's/true/true/')"
eq "snapshot: 11 before (with the target) + 10 after = 21" "21" "$(SU "select jsonb_array_length(snapshot) from public.chat_reports where id='$RID'")"
eq "first and last messages of the window" "m05|m25" "$(SU "select (snapshot->0->>'body')||'|'||(snapshot->20->>'body') from public.chat_reports where id='$RID'")"
eq "ascending order" "t" "$(SU "select (select array_agg(e->>'body' order by ord) from jsonb_array_elements(snapshot) with ordinality t(e,ord)) = (select array_agg(e->>'body' order by e->>'body') from jsonb_array_elements(snapshot) e) from public.chat_reports where id='$RID'")"
eq "exactly one message is flagged as the reported one: m15" "1|m15" "$(SU "select count(*)||'|'||min(e->>'body') from public.chat_reports r, jsonb_array_elements(r.snapshot) e where r.id='$RID' and (e->>'reported')::boolean")"
eq "senders are labelled, never identified" "t" "$(SU "select not (snapshot::text like '%$A%' or snapshot::text like '%$B%') and not (snapshot::text ilike '%alice%' or snapshot::text ilike '%bobby%') from public.chat_reports where id='$RID'")"
chk "already reported while open" "already_reported" "$(as $A authenticated "select public.report_chat('$CID', '$MID', 'other')")"
eq "the reported member was told nothing" "0" "$(SU "select count(*) from public.notifications where user_id='$B'")"
eq "the reported member's chat is unchanged" "30" "$(as $B authenticated "select count(*) from public.get_messages('$CID', null, null, 100)")"

echo "== the evidence outlives the chat"
SU "update public.chat_messages set body = null, deleted_at = now() where conversation_id='$CID' and body in ('m14','m15')" >/dev/null
eq "snapshot still has the original text" "m15" "$(SU "select e->>'body' from public.chat_reports r, jsonb_array_elements(r.snapshot) e where r.id='$RID' and (e->>'reported')::boolean")"
SU "update public.chat_messages set body = case when id='$MID' then 'm15' else 'm14' end, deleted_at = null where conversation_id='$CID' and deleted_at is not null" >/dev/null

echo "== a window without a message id: the last 21"
CID2=$(as $C authenticated "select public.send_chat_request('$D','hi dan')")
as $D authenticated "select public.respond_chat_request('$CID2', true)" >/dev/null
SU "delete from public.chat_messages where conversation_id='$CID2'" >/dev/null
SU "insert into public.chat_messages (conversation_id, sender_id, body, created_at) select '$CID2', '$D', 'n'||g, now() - interval '1 hour' + (g||' minutes')::interval from generate_series(1,40) g" >/dev/null
RID2=$(as $C authenticated "select public.report_chat('$CID2', null, 'spam_scam')")
eq "21 messages, the newest last" "21|n40" "$(SU "select jsonb_array_length(snapshot)||'|'||(snapshot->20->>'body') from public.chat_reports where id='$RID2'")"
eq "no message flagged" "0" "$(SU "select count(*) from public.chat_reports r, jsonb_array_elements(r.snapshot) e where r.id='$RID2' and (e->>'reported')::boolean")"

echo "== delete chat for me: the reporter can only report what they saw"
CID3=$(as $D authenticated "select public.send_chat_request('$A','hi alice from dan')")
as $A authenticated "select public.respond_chat_request('$CID3', true)" >/dev/null
SU "insert into public.chat_messages (conversation_id, sender_id, body, created_at) select '$CID3', '$D', 'old'||g, now() - interval '3 hours' + (g||' minutes')::interval from generate_series(1,5) g" >/dev/null
OLDM=$(SU "select id from public.chat_messages where body='old3'")
as $A authenticated "select public.delete_chat_for_me('$CID3')" >/dev/null
as $D authenticated "select public.send_chat_message('$CID3','new after clear')" >/dev/null
chk "cleared message cannot be reported" "not_found" "$(as $A authenticated "select public.report_chat('$CID3', '$OLDM', 'other')")"
RID3=$(as $A authenticated "select public.report_chat('$CID3', null, 'threats')")
eq "snapshot holds only what the reporter could see" "new after clear" "$(SU "select string_agg(e->>'body','|') from public.chat_reports r, jsonb_array_elements(r.snapshot) e where r.id='$RID3'")"
eq "...and it is a different chat so it does not count as a second open report" "t" "$(SU "select count(*) = 1 from public.chat_reports where id='$RID3'")"

echo "== requests I received"
CP=$(as $C authenticated "select public.send_chat_request('$A','nasty pending request')")
chk "the requester cannot report their own request" "not_found" "$(as $C authenticated "select public.report_chat('$CP', null, 'other')")"
chk "a message id makes no sense for a request" "not_found" "$(as $A authenticated "select public.report_chat('$CP', gen_random_uuid(), 'other')")"
RIDP=$(as $A authenticated "select public.report_chat('$CP', null, 'harassment')")
eq "the request text is the evidence" "1|nasty pending request|reported" "$(SU "select jsonb_array_length(snapshot)||'|'||(snapshot->0->>'body')||'|'||(snapshot->0->>'from') from public.chat_reports where id='$RIDP'")"
as $A authenticated "select public.respond_chat_request('$CP', false)" >/dev/null
SU "update public.chat_reports set status='dismissed', outcome='dismissed', resolved_at=now() where id='$RIDP'" >/dev/null
eq "a declined request can still be reported" "t" "$(as $A authenticated "select public.report_chat('$CP', null, 'harassment') is not null")"

echo "== who can report"
SU "update public.user_flags set status='suspended', suspended_until = now() + interval '1 hour' where user_id='$D'" >/dev/null
CID4=$(SU "select id from public.chat_conversations where id='$CID2'")
eq "a muted member can still report" "t" "$(as $D authenticated "select public.report_chat('$CID2', null, 'harassment') is not null")"
SU "update public.user_flags set status='banned' where user_id='$D'" >/dev/null
chk "a banned member cannot" "banned" "$(as $D authenticated "select public.report_chat('$CID3', null, 'other')")"
SU "update public.user_flags set status='active', suspended_until=null where user_id='$D'" >/dev/null
SU "insert into public.user_blocks (blocker_id,blocked_id,kind) values ('$C','$D','block')" >/dev/null
SU "update public.chat_reports set status='dismissed', outcome='dismissed', resolved_at=now() where reporter_id='$C'" >/dev/null
eq "a member who blocked the other can still report" "t" "$(as $C authenticated "select public.report_chat('$CID2', null, 'harassment') is not null")"
SU "delete from public.user_blocks" >/dev/null
SU "update public.app_settings set chat_mode='off' where id=1" >/dev/null
chk "chat off: refused" "chat_disabled" "$(as $A authenticated "select public.report_chat('$CID', null, 'other')")"
SU "update public.app_settings set chat_mode='on' where id=1" >/dev/null

echo "== rate limit: 10 a day"
SU "delete from public.chat_reports where reporter_id='$D'" >/dev/null
SU "insert into public.chat_reports (reporter_id, reported_id, conversation_id, reason) select '$D', '$A', gen_random_uuid(), 'other' from generate_series(1,10)" >/dev/null
chk "11th report in 24 hours" "rate_limited" "$(as $D authenticated "select public.report_chat('$CID3', null, 'other')")"
SU "delete from public.chat_reports where reporter_id='$D'" >/dev/null

echo "== staff alerts"
SU "delete from public.chat_reports; delete from public.notifications; truncate net._calls" >/dev/null
RA=$(as $A authenticated "select public.report_chat('$CID', '$MID', 'harassment')")
eq "all staff alerted: 2 moderators + 2 admins" "4" "$(SU "select count(*) from public.notifications where type='staff_report'")"
eq "alerts carry no target, no actor, no content" "t" "$(SU "select bool_and(target_type is null and target_id is null and actor_id is null and data = '{}'::jsonb) from public.notifications where type='staff_report'")"
eq "the reporter is not alerted" "0" "$(SU "select count(*) from public.notifications where user_id='$A'")"
eq "one push, generic text" "1|New report to review" "$(SU "select count(*)||'|'||min(body->0->>'body') from net._calls")"
eq "the push contains neither names nor reasons" "0" "$(SU "select count(*) from net._calls where body::text ilike '%alice%' or body::text ilike '%bobby%' or body::text ilike '%harass%'")"
as $C authenticated "select public.report_chat('$CID2', null, 'spam_scam')" >/dev/null
eq "throttled: no second alert within 15 minutes" "4" "$(SU "select count(*) from public.notifications where type='staff_report'")"
eq "alerts stay out of the staff member's notification list" "0" "$(as $MOD authenticated "select count(*) from public.get_notifications(null,null,50)")"
eq "...and out of the unread badge" "0" "$(as $MOD authenticated "select public.get_unread_notification_count()")"
SU "delete from public.chat_reports; delete from public.notifications" >/dev/null
RC=$(as $A authenticated "select public.report_chat('$CID', '$MID', 'child_safety')")
eq "child safety: only admins alerted" "2|0" "$(SU "select count(*) filter (where f.role='admin')||'|'||count(*) filter (where f.role='moderator') from public.notifications n join public.user_flags f on f.user_id=n.user_id where n.type='staff_report'")"
eq "child safety: admin-only and held from the start" "true|true" "$(SU "select admin_only||'|'||held from public.chat_reports where id='$RC'")"

echo "== staff access"
chk "ordinary member: list" "forbidden" "$(as $A authenticated "select * from public.mod_get_chat_reports()")"
chk "ordinary member: open" "forbidden" "$(as $A authenticated "select * from public.mod_get_chat_report('$RC')")"
chk "ordinary member: count" "forbidden" "$(as $A authenticated "select public.mod_open_chat_report_count()")"
chk "ordinary member: resolve" "forbidden" "$(as $A authenticated "select public.mod_resolve_chat_report('$RC','dismissed')")"
chk "ordinary member: escalate" "forbidden" "$(as $A authenticated "select public.mod_escalate_chat_report('$RC')")"
chk "ordinary member: release" "forbidden" "$(as $A authenticated "select public.admin_release_chat_report_hold('$RC')")"
chk "invalid status filter" "invalid_status" "$(as $MOD authenticated "select * from public.mod_get_chat_reports('weird')")"
eq "a moderator sees that a child-safety report exists, nothing more" "child_safety|||t|t" "$(as $MOD authenticated "select reason||'|'||coalesce(reporter_nickname,'')||'|'||coalesce(reported_nickname,'')||'|'||admin_only||'|'||held from public.mod_get_chat_reports()" | sed 's/true/t/g')"
chk "a moderator cannot open it" "forbidden" "$(as $MOD authenticated "select * from public.mod_get_chat_report('$RC')")"
chk "a moderator cannot resolve it" "forbidden" "$(as $MOD authenticated "select public.mod_resolve_chat_report('$RC','dismissed')")"
chk "a moderator cannot escalate or release it" "forbidden" "$(as $MOD authenticated "select public.mod_escalate_chat_report('$RC')")"
eq "an admin sees the names" "alice_a|bobby_b" "$(as $ADM authenticated "select reporter_nickname||'|'||reported_nickname from public.mod_get_chat_reports()")"
eq "open reports count" "1" "$(as $MOD authenticated "select public.mod_open_chat_report_count()")"

echo "== opening a report is audited, every time"
SU "delete from public.admin_audit_log" >/dev/null
eq "an admin opens the snapshot" "21|child_safety|$B" "$(as $ADM authenticated "select jsonb_array_length(snapshot)||'|'||reason||'|'||reported_id from public.mod_get_chat_report('$RC')")"
as $ADM authenticated "select * from public.mod_get_chat_report('$RC')" >/dev/null
eq "two opens = two audit rows" "2" "$(SU "select count(*) from public.admin_audit_log where action='view_chat_report' and admin_id='$ADM' and subject_user_id='$B' and detail='report $RC'")"
eq "the audit log is readable by admins only" "2|0" "$(as $ADM authenticated "select count(*) from public.admin_audit_log")|$(as $MOD authenticated "select count(*) from public.admin_audit_log")"
chk "unknown report" "not_found" "$(as $ADM authenticated "select * from public.mod_get_chat_report(gen_random_uuid())")"
RN=$(as $A authenticated "select public.report_chat('$CID3', null, 'other', 'normal one')")
eq "a moderator opens a normal report" "other|normal one" "$(as $MOD authenticated "select reason||'|'||note from public.mod_get_chat_report('$RN')")"
as $MOD authenticated "select * from public.mod_get_chat_report('$RN')" >/dev/null
eq "moderator opens are audited too (2 so far)" "2" "$(SU "select count(*) from public.admin_audit_log where action='view_chat_report' and admin_id='$MOD'")"
chk "a refused open is not logged as a view" "forbidden" "$(as $MOD authenticated "select * from public.mod_get_chat_report('$RC')")"
eq "still 2 moderator rows" "2" "$(SU "select count(*) from public.admin_audit_log where action='view_chat_report' and admin_id='$MOD'")"

echo "== nobody handles a report about themselves"
SU "update public.user_flags set role='moderator' where user_id='$D'" >/dev/null
SU "insert into public.chat_reports (reporter_id, reported_id, conversation_id, reason, snapshot) values ('$A','$MOD',gen_random_uuid(),'harassment','[]'::jsonb)" >/dev/null
RM=$(SU "select id from public.chat_reports where reported_id='$MOD'")
eq "hidden from the list for the reported staff member" "0" "$(as $MOD authenticated "select count(*) from public.mod_get_chat_reports() where id='$RM'")"
chk "cannot open" "not_found" "$(as $MOD authenticated "select * from public.mod_get_chat_report('$RM')")"
chk "cannot resolve" "not_found" "$(as $MOD authenticated "select public.mod_resolve_chat_report('$RM','dismissed')")"
chk "cannot escalate" "not_found" "$(as $MOD authenticated "select public.mod_escalate_chat_report('$RM')")"
eq "another moderator can" "t" "$(as $MOD2 authenticated "select count(*) = 1 from public.mod_get_chat_reports() where id='$RM'")"
SU "delete from public.chat_reports where id='$RM'" >/dev/null
SU "update public.user_flags set role='user' where user_id='$D'" >/dev/null

echo "== escalate"
SU "delete from public.notifications" >/dev/null
eq "a moderator escalates a normal report" "" "$(as $MOD authenticated "select public.mod_escalate_chat_report('$RN')")"
eq "now admin-only and held" "true|true" "$(SU "select admin_only||'|'||held from public.chat_reports where id='$RN'")"
eq "audited" "1" "$(SU "select count(*) from public.admin_audit_log where action='escalate_chat_report' and admin_id='$MOD' and detail='report $RN'")"
eq "only admins alerted" "2|0" "$(SU "select count(*) filter (where f.role='admin')||'|'||count(*) filter (where f.role='moderator') from public.notifications n join public.user_flags f on f.user_id=n.user_id where n.type='staff_report'")"
chk "the moderator can no longer open it" "forbidden" "$(as $MOD authenticated "select * from public.mod_get_chat_report('$RN')")"
eq "escalating again is harmless for an admin" "" "$(as $ADM authenticated "select public.mod_escalate_chat_report('$RN')")"

echo "== resolve"
RR=$(as $C authenticated "select public.report_chat('$CID2', null, 'spam_scam', 'spam')" 2>&1 | head -1)
SU "delete from public.chat_reports where id='$RR'" >/dev/null 2>&1
SU "update public.chat_reports set status='dismissed', outcome='dismissed', resolved_at=now() where reporter_id='$C'" >/dev/null
RR=$(as $C authenticated "select public.report_chat('$CID2', null, 'spam_scam', 'spam')")
chk "invalid outcome" "invalid_outcome" "$(as $MOD authenticated "select public.mod_resolve_chat_report('$RR','nope')")"
chk "null outcome" "invalid_outcome" "$(as $MOD authenticated "select public.mod_resolve_chat_report('$RR',null)")"
chk "note too long" "note_too_long" "$(as $MOD authenticated "select public.mod_resolve_chat_report('$RR','warned','$(printf 'x%.0s' $(seq 1 301))')")"
eq "resolve as warned" "" "$(as $MOD authenticated "select public.mod_resolve_chat_report('$RR','warned','  sent a warning  ')")"
eq "status actioned with the outcome" "actioned|warned|sent a warning|$MOD|t" "$(SU "select status||'|'||outcome||'|'||resolution_note||'|'||resolved_by||'|'||(resolved_at is not null) from public.chat_reports where id='$RR'" | sed 's/true/t/')"
chk "resolved twice" "already_resolved" "$(as $MOD2 authenticated "select public.mod_resolve_chat_report('$RR','dismissed')")"
chk "escalating a resolved report" "already_resolved" "$(as $MOD2 authenticated "select public.mod_escalate_chat_report('$RR')")"
eq "it moved to the resolved list" "1|0" "$(as $MOD authenticated "select count(*) from public.mod_get_chat_reports('actioned') where id='$RR'")|$(as $MOD authenticated "select count(*) from public.mod_get_chat_reports('open') where id='$RR'")"
chk "a moderator cannot resolve an admin-only report" "forbidden" "$(as $MOD authenticated "select public.mod_resolve_chat_report('$RN','dismissed')")"
eq "an admin resolves the escalated one: dismissed" "" "$(as $ADM authenticated "select public.mod_resolve_chat_report('$RN','dismissed')")"
eq "dismissed status" "dismissed|dismissed" "$(SU "select status||'|'||outcome from public.chat_reports where id='$RN'")"
eq "a resolved report can be reported again (new open one allowed)" "t" "$(as $A authenticated "select public.report_chat('$CID3', null, 'other') is not null")"

echo "== the hold"
eq "child-safety report is still held after resolving" "t" "$(as $ADM authenticated "select public.mod_resolve_chat_report('$RC','banned')" >/dev/null; SU "select held from public.chat_reports where id='$RC'")"
chk "a moderator cannot release" "forbidden" "$(as $MOD authenticated "select public.admin_release_chat_report_hold('$RC')")"
eq "an admin releases" "f" "$(as $ADM authenticated "select public.admin_release_chat_report_hold('$RC')" >/dev/null; SU "select held from public.chat_reports where id='$RC'")"
eq "release is audited" "1" "$(SU "select count(*) from public.admin_audit_log where action='release_chat_hold' and admin_id='$ADM' and detail='report $RC'")"
eq "releasing again is harmless and not logged twice" "1" "$(as $ADM authenticated "select public.admin_release_chat_report_hold('$RC')" >/dev/null; SU "select count(*) from public.admin_audit_log where action='release_chat_hold'")"

echo "== retention"
SU "delete from public.chat_reports" >/dev/null
ins() { SU "insert into public.chat_reports (reporter_id,reported_id,conversation_id,reason,status,held,outcome,resolved_at,created_at) values ('$A','$B',gen_random_uuid(),'other','$1',$2,$3,$4,$5) returning id"; }
R1=$(ins dismissed false "'dismissed'" "now() - interval '91 days'" "now() - interval '95 days'")
R2=$(ins dismissed true  "'dismissed'" "now() - interval '91 days'" "now() - interval '95 days'")
R3=$(ins dismissed false "'dismissed'" "now() - interval '89 days'" "now() - interval '95 days'")
R4=$(ins open false null null "now() - interval '181 days'")
R5=$(ins open true  null null "now() - interval '181 days'")
R6=$(ins open false null null "now() - interval '100 days'")
SU "select public.purge_chat_reports()" >/dev/null
eq "old resolved: deleted | held: kept | recent: kept" "0|1|1" "$(SU "select count(*) from public.chat_reports where id='$R1'")|$(SU "select count(*) from public.chat_reports where id='$R2'")|$(SU "select count(*) from public.chat_reports where id='$R3'")"
eq "very old open: deleted | held: kept | 100 days: kept" "0|1|1" "$(SU "select count(*) from public.chat_reports where id='$R4'")|$(SU "select count(*) from public.chat_reports where id='$R5'")|$(SU "select count(*) from public.chat_reports where id='$R6'")"

echo "== paging"
SU "delete from public.chat_reports" >/dev/null
SU "insert into public.chat_reports (reporter_id,reported_id,conversation_id,reason,created_at) select '$A','$B',gen_random_uuid(),'other', now() - (g||' minutes')::interval from generate_series(1,5) g" >/dev/null
eq "oldest first" "5" "$(as $MOD authenticated "select count(*) from public.mod_get_chat_reports('open', 100)")"
eq "limit" "2" "$(as $MOD authenticated "select count(*) from public.mod_get_chat_reports('open', 2)")"
eq "keyset: the next page starts after the cursor" "3" "$(LAST=$(as $MOD authenticated "select created_at||'|'||id from public.mod_get_chat_reports('open', 2) order by created_at desc, id desc limit 1"); TS=${LAST%%|*}; ID=${LAST##*|}; as $MOD authenticated "select count(*) from public.mod_get_chat_reports('open', 100, '$TS', '$ID')")"

echo "== reports survive deleting the accounts"
SU "delete from public.chat_reports" >/dev/null
RD=$(as $A authenticated "select public.report_chat('$CID', '$MID', 'harassment')")
as $B authenticated "select public.delete_my_account('bobby_b')" >/dev/null
eq "the report and its snapshot remain" "21" "$(SU "select jsonb_array_length(snapshot) from public.chat_reports where id='$RD'")"
eq "the conversation itself is gone" "0" "$(SU "select count(*) from public.chat_conversations where id='$CID'")"
as $A authenticated "select public.delete_my_account('alice_a')" >/dev/null
eq "also after the reporter deletes their account" "1" "$(SU "select count(*) from public.chat_reports where id='$RD'")"
eq "an admin can still open it" "21" "$(as $ADM authenticated "select jsonb_array_length(snapshot) from public.mod_get_chat_report('$RD')")"

echo
echo "passed: $pass  failed: $fail"
[ "$fail" -eq 0 ]
