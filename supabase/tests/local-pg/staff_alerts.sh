#!/usr/bin/env bash
# Tests for 20261101120000_staff_alerts.sql (new file runs in ONE transaction like the SQL editor).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_sa
psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/tests/00_supabase_stub.sql" 2>/dev/null || { echo "stub failed"; exit 1; }
# pg_net stand-in must exist BEFORE the push migration runs
psql -X -q -v ON_ERROR_STOP=1 -d $DB <<'SQL'
create schema net;
create table net._calls (id bigint generated always as identity primary key, url text, body jsonb, headers jsonb);
create table net._http_response (id bigint primary key, status_code int, content text);
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
  headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint
language sql as $$ insert into net._calls (url, body, headers) values (url, body, headers) returning id $$;
SQL
for f in $(ls "$HERE"/migrations/*.sql | sort | awk -v own=20261101120000 '{ n=$0; sub(/.*\//,"",n); if (substr(n,1,14) < own) print }'); do
  psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$f" 2>&1 | grep -v NOTICE
done
SU() { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1 | grep -v '^SET$'; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }
uid() { printf 'ffffffff-0000-4000-8000-%012d' "$1"; }

ADM=$(uid 1); MOD=$(uid 2); MOD2=$(uid 3); REP=$(uid 4); REP2=$(uid 5); AUTH=$(uid 6); BADMOD=$(uid 7)
TADM='ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]'; TMOD='ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]'
for u in $ADM $MOD $MOD2 $REP $REP2 $AUTH $BADMOD; do SU "insert into auth.users (id) values ('$u')" >/dev/null; done
SU "update public.profiles set nickname='adm_x' where id='$ADM'; update public.profiles set nickname='mod_x' where id='$MOD';
    update public.profiles set nickname='mod2_x' where id='$MOD2'; update public.profiles set nickname='rep_x' where id='$REP';
    update public.profiles set nickname='rep2_x' where id='$REP2'; update public.profiles set nickname='auth_x' where id='$AUTH';
    update public.profiles set nickname='badmod_x' where id='$BADMOD';
    update public.user_flags set role='admin' where user_id='$ADM';
    update public.user_flags set role='moderator' where user_id in ('$MOD','$MOD2','$BADMOD')" >/dev/null
as $ADM authenticated "select public.register_push_token('$TADM','android')" >/dev/null
as $MOD authenticated "select public.register_push_token('$TMOD','android')" >/dev/null
mkpost() { SU "insert into public.posts (kind,author_id,body,status,published_at) values ('confession','$AUTH','secret text $1','published',now()) returning id" | head -1; }
P1=$(mkpost 1); P2=$(mkpost 2); P3=$(mkpost 3); P4=$(mkpost 4); P5=$(mkpost 5)
rep() { SU "insert into public.reports (reporter_id,target_type,target_id,reason) values ('$1','post','$2','spam')" >/dev/null; }
alerts() { SU "select count(*) from public.notifications where type='$1' ${2:+and user_id='$2'}"; }
calls() { SU "select count(*) from net._calls"; }
reset() { SU "truncate net._calls, net._http_response; delete from public.push_outbox; delete from public.notifications; delete from public.reports; delete from public.moderation_holds" >/dev/null; }

echo "== apply new migration in one transaction"
psql -X -q -1 -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/20261101120000_staff_alerts.sql" 2>&1 | grep -v NOTICE
reset

echo "== first report on an item"
rep $REP $P1
chk "admin alerted"                     "1" "$(alerts staff_report $ADM)"
chk "moderator alerted"                 "1" "$(alerts staff_report $MOD)"
chk "second moderator alerted"          "1" "$(alerts staff_report $MOD2)"
chk "no alert for the reporter"         "0" "$(alerts staff_report $REP)"
chk "no alert for the post author"      "0" "$(alerts staff_report $AUTH)"
chk "exactly 4 staff rows? (3 staff + bad mod)" "4" "$(alerts staff_report)"
chk "actor is null (reporter not linked)" "0" "$(SU "select count(*) from public.notifications where type='staff_report' and actor_id is not null")"
chk "pushes only to phones with tokens (2)" "2" "$(calls)"
BODY="$(SU "select body::text from net._calls order by id limit 1")"
chk "generic title and text"            "New report to review" "$BODY"
chk "type in payload"                   "staff_report" "$BODY"
chk "no nickname in payload"            "0" "$(SU "select count(*) from net._calls where body::text ~* 'rep_x|auth_x|secret'")"

echo "== only the FIRST open report per item"
rep $REP2 $P1
chk "second report on same item: no new alert" "4" "$(alerts staff_report)"
chk "no new push"                       "2" "$(calls)"

echo "== throttle 15 minutes per staff member and kind"
rep $REP $P2
chk "report on another item inside 15 min: throttled" "4" "$(alerts staff_report)"
chk "no new push"                       "2" "$(calls)"
SU "update public.notifications set created_at = now() - interval '20 minutes'" >/dev/null
rep $REP2 $P3
chk "after 15 min a new alert is created for all staff" "8" "$(alerts staff_report)"
chk "two more pushes"                   "4" "$(calls)"
# partial throttle: only MOD was alerted recently
SU "update public.notifications set created_at = now() - interval '20 minutes' where user_id <> '$MOD'" >/dev/null
rep $REP $P5
chk "only staff outside the window get it" "11" "$(alerts staff_report)"
chk "MOD got no extra row"              "2" "$(alerts staff_report $MOD)"

echo "== staff reporting an item is skipped"
reset
rep $MOD $P4
chk "reporter MOD skipped"              "0" "$(alerts staff_report $MOD)"
chk "admin still alerted"               "1" "$(alerts staff_report $ADM)"
chk "second moderator still alerted"    "1" "$(alerts staff_report $MOD2)"

echo "== held items"
reset
SU "insert into public.moderation_holds (target_type,target_id,reason,matched_term) values ('post','$P1','keyword','beer')" >/dev/null
chk "held: admin alerted"               "1" "$(alerts staff_held $ADM)"
chk "held: rows for 4 staff"            "4" "$(alerts staff_held)"
chk "held push text"                    "New item waiting for review" "$(SU "select body::text from net._calls order by id limit 1")"
chk "held payload has no matched term"  "0" "$(SU "select count(*) from net._calls where body::text ~* 'beer|secret'")"
SU "insert into public.moderation_holds (target_type,target_id,reason) values ('post','$P2','pre_moderation')" >/dev/null
chk "held throttled inside 15 min"      "4" "$(alerts staff_held)"
rep $REP $P3
chk "report kind not throttled by held kind" "4" "$(alerts staff_report)"

echo "== switches and kill switch"
reset
as $ADM authenticated "select * from public.set_push_settings(p_staff_alerts := false)" >/dev/null
rep $REP $P1
chk "alert row still created for admin" "1" "$(alerts staff_report $ADM)"
chk "but admin switched off: only MOD phone pushed" "1" "$(calls)"
chk "that push went to MOD's token"     "$TMOD" "$(SU "select body::text from net._calls order by id limit 1")"
as $ADM authenticated "select * from public.set_push_settings(p_staff_alerts := true, p_enabled := false)" >/dev/null
reset; rep $REP $P1
chk "master switch off: still only MOD" "1" "$(calls)"
as $ADM authenticated "select * from public.set_push_settings(p_enabled := true)" >/dev/null
SU "update public.app_settings set push_enabled = false where id=1" >/dev/null
reset; rep $REP $P1
chk "kill switch: no pushes"            "0" "$(calls)"
SU "update public.app_settings set push_enabled = true where id=1" >/dev/null

echo "== role is checked"
reset
SU "update public.user_flags set role='user' where user_id='$MOD2'; update public.user_flags set status='banned' where user_id='$BADMOD'" >/dev/null
rep $REP $P1
chk "demoted moderator gets no row"     "0" "$(alerts staff_report $MOD2)"
chk "banned moderator gets no row"      "0" "$(alerts staff_report $BADMOD)"
chk "active staff still alerted (2)"    "2" "$(alerts staff_report)"
# a stale alert row for someone who is no longer staff must not push at send time
SU "truncate net._calls; insert into public.push_tokens (user_id, token, platform) values ('$MOD2','ExponentPushToken[cccccccccccccccccccccc]','android')" >/dev/null
SU "insert into public.notifications (user_id,type,target_type,target_id) values ('$MOD2','staff_report','post','$P1')" >/dev/null
chk "non-staff row does not push"       "0" "$(calls)"
SU "update public.user_flags set role='moderator' where user_id='$MOD2'; update public.user_flags set status='suspended', suspended_until=now()+interval '1 day' where user_id='$MOD'" >/dev/null
reset; rep $REP $P2
chk "suspended moderator gets no row"   "0" "$(alerts staff_report $MOD)"
SU "update public.user_flags set status='active', suspended_until=null where user_id='$MOD'; update public.user_flags set status='active' where user_id='$BADMOD'" >/dev/null

echo "== hidden from the list and the bell"
reset
rep $REP $P1
SU "insert into public.notifications (user_id,type,target_type,target_id,actor_id) values ('$MOD','comment','post','$P1','$REP')" >/dev/null
chk "MOD has unread staff alert row"    "1" "$(alerts staff_report $MOD)"
chk "list shows no staff type"          "0" "$(as $MOD authenticated "select count(*) from public.get_notifications() where type like 'staff_%'")"
chk "list still shows the comment"      "1" "$(as $MOD authenticated "select count(*) from public.get_notifications() where type='comment'")"
chk "bell counts only the comment"      "1" "$(as $MOD authenticated "select public.get_unread_notification_count()")"

echo "== settings RPCs"
chk "default staff_alerts is on"        "t" "$(as $MOD2 authenticated "select staff_alerts::text from public.get_push_settings()" | cut -c1)"
chk "set false persists"                "f" "$(as $MOD2 authenticated "select staff_alerts::text from public.set_push_settings(p_staff_alerts := false)" | cut -c1)"
chk "old-style call keeps staff switch" "f" "$(as $MOD2 authenticated "select staff_alerts::text from public.set_push_settings(p_enabled := true)" | cut -c1)"
chk "old-style call changes only master" "f" "$(as $MOD2 authenticated "select reactions::text from public.set_push_settings(p_comments := true)" | cut -c1)"
chk "old 6-arg signature is gone"       "0" "$(SU "select count(*) from pg_proc where proname='set_push_settings' and pronargs=6")"
chk "guest cannot read settings"        "permission denied" "$(as '' anon "select * from public.get_push_settings()")"
chk "guest cannot set settings"         "permission denied" "$(as '' anon "select * from public.set_push_settings(p_staff_alerts := true)")"
chk "member cannot run purge"           "permission denied" "$(as $MOD authenticated "select public.purge_staff_alerts()")"
chk "member cannot call alert trigger fn" "permission denied" "$(as $MOD authenticated "select public.staff_alert_on_report()")"

echo "== a failing alert never blocks the report or the post"
reset
SU "alter table public.notifications add constraint force_fail check (type not in ('staff_report','staff_held')) not valid" >/dev/null
rep $REP $P3
chk "report was stored anyway"          "1" "$(SU "select count(*) from public.reports where target_id='$P3'")"
SU "insert into public.moderation_holds (target_type,target_id,reason) values ('post','$P3','pre_moderation')" >/dev/null
chk "hold was stored anyway"            "1" "$(SU "select count(*) from public.moderation_holds where target_id='$P3'")"
SU "alter table public.notifications drop constraint force_fail" >/dev/null

echo "== purge"
reset
SU "insert into public.notifications (user_id,type,target_type,target_id,created_at) values
  ('$ADM','staff_report','post','$P1', now() - interval '8 days'),
  ('$ADM','staff_held','post','$P1', now() - interval '8 days'),
  ('$ADM','staff_report','post','$P1', now() - interval '1 day'),
  ('$ADM','content_removed','post','$P1', now() - interval '30 days')" >/dev/null
SU "select public.purge_staff_alerts()" >/dev/null
chk "old alerts deleted, recent and other types kept" "2" "$(SU "select count(*) from public.notifications")"
chk "the old removal notice survived"   "1" "$(SU "select count(*) from public.notifications where type='content_removed'")"

echo "== existing member pushes unchanged"
reset
SU "insert into public.notifications (user_id,type,target_type,target_id,actor_id) values ('$ADM','comment','post','$P1','$REP')" >/dev/null
chk "comment push still sent"           "Someone commented on your post" "$(SU "select body::text from net._calls order by id limit 1")"
chk "comment hidden from nobody"        "1" "$(as $ADM authenticated "select count(*) from public.get_notifications() where type='comment'")"

echo; echo "passed: $pass  failed: $fail"; [[ $fail -eq 0 ]]
