#!/usr/bin/env bash
# Tests for 20261031100000_push_notifications.sql (new file runs in ONE transaction like the SQL editor).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_push
psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/tests/00_supabase_stub.sql" 2>/dev/null || { echo "stub failed"; exit 1; }
for f in $(ls "$HERE"/migrations/*.sql | sort | awk -v own=20261031100000 '{ n=$0; sub(/.*\//,"",n); if (substr(n,1,14) < own) print }'); do
  psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$f" 2>&1 | grep -v NOTICE
done
# Stand-in for pg_net: records every call, returns an id; tests insert fake replies.
psql -X -q -v ON_ERROR_STOP=1 -d $DB <<'SQL'
create schema net;
create table net._calls (id bigint generated always as identity primary key, url text, body jsonb, headers jsonb);
create table net._http_response (id bigint primary key, status_code int, content text);
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
  headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint
language sql as $$ insert into net._calls (url, body, headers) values (url, body, headers) returning id $$;
SQL
echo "== apply new migration in one transaction"
psql -X -q -1 -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/20261031100000_push_notifications.sql" 2>&1 | grep -v NOTICE
SU() { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1 | grep -v '^SET$'; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }

A=aaaaaaaa-0000-4000-8000-000000000001   # recipient
B=bbbbbbbb-0000-4000-8000-000000000002   # actor
C=cccccccc-0000-4000-8000-000000000003   # other member
T1='ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]'
T2='ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]'
for u in $A $B $C; do SU "insert into auth.users (id) values ('$u')" >/dev/null; done
SU "update public.profiles set nickname='push_a' where id='$A'; update public.profiles set nickname='push_b' where id='$B'; update public.profiles set nickname='push_c' where id='$C'" >/dev/null
P=dddddddd-0000-4000-8000-0000000000aa
notify() { SU "insert into public.notifications (user_id, type, target_type, target_id, actor_id) values ('$1','$2','${4:-post}','$P',${3:-null}) returning id" | head -1; }
calls() { SU "select count(*) from net._calls"; }
reset() { SU "truncate net._calls, net._http_response; delete from public.push_outbox; delete from public.notifications" >/dev/null; }

echo "== access"
chk "guests cannot register"        "permission denied" "$(as '' anon "select public.register_push_token('$T1','android')")"
chk "guests cannot read settings"   "permission denied" "$(as '' anon "select * from public.get_push_settings()")"
chk "members cannot read tokens"    "permission denied" "$(as $A authenticated "select * from public.push_tokens")"
chk "members cannot read settings table" "permission denied" "$(as $A authenticated "select * from public.push_settings")"
chk "members cannot read outbox"    "permission denied" "$(as $A authenticated "select * from public.push_outbox")"
chk "members cannot call the sender"   "permission denied" "$(as $A authenticated "select public.push_on_notification()")"
chk "members cannot call the processor" "permission denied" "$(as $A authenticated "select public.process_push_responses()")"
chk "kill switch defaults on"       "t" "$(SU "select push_enabled::text from public.app_settings where id=1" | cut -c1)"

echo "== register"
chk "register ok"                   "" "$(as $A authenticated "select public.register_push_token('$T1','android')" | tr -d '\n')"
chk "token stored"                  "1" "$(SU "select count(*) from public.push_tokens where user_id='$A' and token='$T1'")"
chk "register twice keeps one row"  "1" "$(as $A authenticated "select public.register_push_token('$T1','android')" >/dev/null; SU "select count(*) from public.push_tokens where token='$T1'")"
chk "bad token rejected"            "invalid_token" "$(as $A authenticated "select public.register_push_token('not-a-token','android')")"
chk "injection-looking token rejected" "invalid_token" "$(as $A authenticated "select public.register_push_token('ExponentPushToken[x\"; drop table y;--]','android')")"
chk "bad platform rejected"         "invalid_platform" "$(as $A authenticated "select public.register_push_token('$T1','web')")"
chk "null token rejected"           "invalid_token" "$(as $A authenticated "select public.register_push_token(null,'ios')")"
as $B authenticated "select public.register_push_token('$T1','android')" >/dev/null
chk "token moves to the new account" "$B" "$(SU "select user_id from public.push_tokens where token='$T1'")"
as $A authenticated "select public.register_push_token('$T1','android')" >/dev/null
for n in 1 2 3 4 5 6; do
  as $A authenticated "select public.register_push_token('ExponentPushToken[cap000000000000000000$n]','android')" >/dev/null
  SU "update public.push_tokens set updated_at = now() + interval '$n second' where token='ExponentPushToken[cap000000000000000000$n]'" >/dev/null
done
as $A authenticated "select public.register_push_token('ExponentPushToken[cap0000000000000000007]','android')" >/dev/null
chk "at most 5 active tokens"       "5" "$(SU "select count(*) from public.push_tokens where user_id='$A' and disabled_at is null")"
chk "the original (oldest) was retired" "f" "$(SU "select (disabled_at is null)::text from public.push_tokens where token='$T1'" | cut -c1)"
SU "delete from public.push_tokens" >/dev/null
as $A authenticated "select public.register_push_token('$T1','android')" >/dev/null
chk "unregister removes own token"  "0" "$(as $A authenticated "select public.unregister_push_token('$T1')" >/dev/null; SU "select count(*) from public.push_tokens")"
as $A authenticated "select public.register_push_token('$T1','android')" >/dev/null
as $B authenticated "select public.unregister_push_token('$T1')" >/dev/null
chk "cannot unregister someone else's token" "1" "$(SU "select count(*) from public.push_tokens where token='$T1'")"
SU "update public.user_flags set status='banned' where user_id='$C'" >/dev/null
chk "banned account cannot register" "account_unavailable" "$(as $C authenticated "select public.register_push_token('$T2','android')")"
SU "update public.user_flags set status='active' where user_id='$C'" >/dev/null

echo "== settings"
chk "defaults"                      "t|t|t|t|t|f" "$(as $A authenticated "select enabled||'|'||comments||'|'||replies||'|'||deals||'|'||moderation||'|'||reactions from public.get_push_settings()" | sed 's/true/t/g;s/false/f/g')"
chk "partial update keeps the rest" "f|t|t|t|t|f" "$(as $A authenticated "select enabled||'|'||comments||'|'||replies||'|'||deals||'|'||moderation||'|'||reactions from public.set_push_settings(p_enabled := false)" | sed 's/true/t/g;s/false/f/g')"
chk "second partial update"         "f|f|t|t|t|t" "$(as $A authenticated "select enabled||'|'||comments||'|'||replies||'|'||deals||'|'||moderation||'|'||reactions from public.set_push_settings(p_comments := false, p_reactions := true)" | sed 's/true/t/g;s/false/f/g')"
chk "settings are per member"       "t|t|t|t|t|f" "$(as $B authenticated "select enabled||'|'||comments||'|'||replies||'|'||deals||'|'||moderation||'|'||reactions from public.get_push_settings()" | sed 's/true/t/g;s/false/f/g')"
as $A authenticated "select * from public.set_push_settings(p_enabled := true, p_comments := true, p_reactions := false)" >/dev/null

echo "== sending"
reset
NID=$(notify $A comment "'$B'")
chk "a comment sends one request"    "1" "$(calls)"
chk "request goes to Expo"           "https://exp.host/--/api/v2/push/send" "$(SU "select url from net._calls")"
chk "one message per active token"   "1" "$(SU "select jsonb_array_length(body) from net._calls")"
chk "message targets the token"      "$T1" "$(SU "select body->0->>'to' from net._calls")"
chk "generic text, no nickname"      "Someone commented on your post" "$(SU "select body->0->>'body' from net._calls")"
chk "payload never contains nicknames" "0" "$(SU "select count(*) from net._calls where body::text ilike '%push_b%' or body::text ilike '%push_a%'")"
chk "tap data carries ids"           "comment|post|$P" "$(SU "select (body->0->'data'->>'type')||'|'||(body->0->'data'->>'targetType')||'|'||(body->0->'data'->>'targetId') from net._calls")"
chk "tap data carries notification id" "$NID" "$(SU "select body->0->'data'->>'nid' from net._calls")"
chk "headers are JSON"               "application/json" "$(SU "select headers->>'Content-Type' from net._calls")"
chk "outbox row written"             "1" "$(SU "select count(*) from public.push_outbox where user_id='$A' and request_id is not null")"
chk "outbox keeps the token id"      "1" "$(SU "select cardinality(token_ids) from public.push_outbox")"

reset; notify $A comment "'$B'" listing >/dev/null
chk "listing comment text"           "Someone commented on your listing" "$(SU "select body->0->>'body' from net._calls")"

for pair in "reply:Someone replied to your comment" "return_request:You have a new item return request" "return_confirmed:An item return was confirmed" "sale_request:You have a new purchase confirmation request" "sale_confirmed:A sale was confirmed"; do
  reset; notify $A "${pair%%:*}" "'$B'" >/dev/null
  chk "${pair%%:*} text" "${pair#*:}" "$(SU "select body->0->>'body' from net._calls")"
done
for pair in "content_approved:Your content was approved" "content_rejected:Your content was not approved" "content_removed:Your content was removed"; do
  reset; notify $A "${pair%%:*}" null >/dev/null
  chk "${pair%%:*} text" "${pair#*:}" "$(SU "select body->0->>'body' from net._calls")"
done
reset; notify $A reaction "'$B'" >/dev/null
chk "reactions are off by default"   "0" "$(calls)"
as $A authenticated "select * from public.set_push_settings(p_reactions := true)" >/dev/null
notify $A reaction "'$C'" >/dev/null
chk "reactions send when switched on" "Someone reacted to your post" "$(SU "select body->0->>'body' from net._calls")"
reset; notify $A comment_reaction "'$B'" comment >/dev/null
chk "comment reaction text"          "Someone reacted to your comment" "$(SU "select body->0->>'body' from net._calls")"
as $A authenticated "select * from public.set_push_settings(p_reactions := false)" >/dev/null

echo "== who does not get a push"
reset; as $A authenticated "select * from public.set_push_settings(p_enabled := false)" >/dev/null; notify $A comment "'$B'" >/dev/null
chk "master switch off"              "0" "$(calls)"
as $A authenticated "select * from public.set_push_settings(p_enabled := true)" >/dev/null
for k in comments replies deals moderation; do
  reset; as $A authenticated "select * from public.set_push_settings(p_$k := false)" >/dev/null
  case $k in comments) t=comment;; replies) t=reply;; deals) t=sale_request;; moderation) t=content_removed;; esac
  notify $A $t "'$B'" >/dev/null
  chk "$k switch off blocks $t"      "0" "$(calls)"
  other=comment; [[ $t == comment ]] && other=reply
  notify $A $other "'$B'" >/dev/null
  chk "$k off does not block $other" "1" "$(calls)"
  as $A authenticated "select * from public.set_push_settings(p_$k := true)" >/dev/null
done
reset; notify $A comment "'$A'" >/dev/null
chk "own action sends nothing"       "0" "$(calls)"
reset; notify $C comment "'$B'" >/dev/null
chk "member without a token: nothing" "0" "$(calls)"
chk "no outbox row without a token"  "0" "$(SU "select count(*) from public.push_outbox")"
SU "insert into public.user_blocks (blocker_id, blocked_id) values ('$A','$B')" >/dev/null
reset; notify $A comment "'$B'" >/dev/null
chk "recipient blocked actor"        "0" "$(calls)"
SU "delete from public.user_blocks; insert into public.user_blocks (blocker_id, blocked_id) values ('$B','$A')" >/dev/null
reset; notify $A comment "'$B'" >/dev/null
chk "actor blocked recipient"        "0" "$(calls)"
SU "delete from public.user_blocks" >/dev/null
SU "update public.user_flags set status='banned' where user_id='$A'" >/dev/null
reset; notify $A content_removed null >/dev/null
chk "banned recipient"               "0" "$(calls)"
SU "update public.user_flags set status='active' where user_id='$A'" >/dev/null
reset; SU "update public.app_settings set push_enabled=false where id=1" >/dev/null; notify $A comment "'$B'" >/dev/null
chk "global kill switch"             "0" "$(calls)"
SU "update public.app_settings set push_enabled=true where id=1" >/dev/null
reset; SU "update public.push_tokens set disabled_at=now() where user_id='$A'" >/dev/null; notify $A comment "'$B'" >/dev/null
chk "disabled token is skipped"      "0" "$(calls)"
SU "update public.push_tokens set disabled_at=null where user_id='$A'" >/dev/null

echo "== several phones, hourly cap, never blocks the action"
reset; as $A authenticated "select public.register_push_token('$T2','ios')" >/dev/null
notify $A comment "'$B'" >/dev/null
chk "two phones: two messages in one request" "1|2" "$(calls)|$(SU "select jsonb_array_length(body) from net._calls")"
chk "outbox holds both token ids"    "2" "$(SU "select cardinality(token_ids) from public.push_outbox")"
reset
for n in $(seq 1 25); do notify $A comment "'$B'" >/dev/null; done
chk "cap: only 20 requests in an hour" "20" "$(calls)"
chk "cap: all 25 notifications still saved" "25" "$(SU "select count(*) from public.notifications where user_id='$A'")"
SU "update public.push_outbox set created_at = now() - interval '61 minutes'" >/dev/null
notify $A comment "'$B'" >/dev/null
chk "cap resets after an hour"       "21" "$(calls)"
reset
SU "alter table public.push_outbox rename to push_outbox_x" >/dev/null
ERR=$(SU "insert into public.notifications (user_id, type, target_type, target_id, actor_id) values ('$A','comment','post','$P','$B')")
chk "a push failure only logs a warning" "push_on_notification failed" "$ERR"
chk "the notification row exists anyway" "1" "$(SU "select count(*) from public.notifications")"
SU "alter table public.push_outbox_x rename to push_outbox" >/dev/null
SU "drop schema net cascade" >/dev/null
W=$(SU "insert into public.notifications (user_id, type, target_type, target_id, actor_id) values ('$A','comment','post','$P','$B')")
chk "missing pg_net only logs a warning" "push_on_notification failed" "$W"
chk "missing pg_net: notification still saved" "2" "$(SU "select count(*) from public.notifications")"
SU "create schema net; create table net._calls (id bigint generated always as identity primary key, url text, body jsonb, headers jsonb); create table net._http_response (id bigint primary key, status_code int, content text); create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as 'insert into net._calls (url, body, headers) values (url, body, headers) returning id'" >/dev/null

echo "== replies from Expo"
reset; as $A authenticated "select public.unregister_push_token('$T2')" >/dev/null
notify $A comment "'$B'" >/dev/null
RID=$(SU "select request_id from public.push_outbox")
SU "update public.push_outbox set created_at = now() - interval '5 minutes'" >/dev/null
chk "no reply yet: stays pending"    "1" "$(SU "select public.process_push_responses(); select count(*) from public.push_outbox where processed_at is null" | tail -1)"
SU "insert into net._http_response values ($RID, 200, '{\"data\":[{\"status\":\"error\",\"message\":\"bad\",\"details\":{\"error\":\"DeviceNotRegistered\"}}]}')" >/dev/null
SU "select public.process_push_responses()" >/dev/null
chk "DeviceNotRegistered disables the token" "f" "$(SU "select (disabled_at is null)::text from public.push_tokens where token='$T1'" | cut -c1)"
chk "outbox row marked processed"    "0" "$(SU "select count(*) from public.push_outbox where processed_at is null")"

reset; SU "update public.push_tokens set disabled_at=null" >/dev/null
as $A authenticated "select public.register_push_token('$T2','ios')" >/dev/null
notify $A comment "'$B'" >/dev/null
RID=$(SU "select request_id from public.push_outbox"); SU "update public.push_outbox set created_at = now() - interval '5 minutes'" >/dev/null
SU "insert into net._http_response values ($RID, 200, '{\"data\":[{\"status\":\"ok\",\"id\":\"x\"},{\"status\":\"error\",\"message\":\"gone\",\"details\":{\"error\":\"DeviceNotRegistered\"}}]}')" >/dev/null
SU "select public.process_push_responses()" >/dev/null
chk "only the failing ticket's token is disabled" "1" "$(SU "select count(*) from public.push_tokens where disabled_at is not null")"
chk "the other token is still active" "1" "$(SU "select count(*) from public.push_tokens where disabled_at is null")"

reset; SU "update public.push_tokens set disabled_at=null" >/dev/null
notify $A comment "'$B'" >/dev/null
RID=$(SU "select request_id from public.push_outbox"); SU "update public.push_outbox set created_at = now() - interval '5 minutes'" >/dev/null
SU "insert into net._http_response values ($RID, 500, 'oops')" >/dev/null
chk "HTTP error: processed, tokens untouched" "0|2" "$(SU "select public.process_push_responses(); select (select count(*) from public.push_outbox where processed_at is null)||'|'||(select count(*) from public.push_tokens where disabled_at is null)" | tail -1)"

reset
notify $A comment "'$B'" >/dev/null
RID=$(SU "select request_id from public.push_outbox"); SU "update public.push_outbox set created_at = now() - interval '5 minutes'" >/dev/null
SU "insert into net._http_response values ($RID, 200, 'not json')" >/dev/null
chk "garbage reply does not crash"   "0" "$(SU "select public.process_push_responses(); select count(*) from public.push_outbox where processed_at is null" | tail -1)"
reset
notify $A comment "'$B'" >/dev/null
SU "update public.push_outbox set created_at = now() - interval '3 hours'" >/dev/null
SU "select public.process_push_responses()" >/dev/null
chk "reply lost after 2 hours: row closed" "0" "$(SU "select count(*) from public.push_outbox where processed_at is null")"

echo "== housekeeping"
reset
SU "update public.push_tokens set updated_at = now() - interval '61 days' where token='$T2'" >/dev/null
SU "select public.process_push_responses()" >/dev/null
chk "tokens unused for 60 days are deleted" "0" "$(SU "select count(*) from public.push_tokens where token='$T2'")"
chk "fresh tokens are kept"          "1" "$(SU "select count(*) from public.push_tokens where token='$T1'")"
SU "insert into public.push_outbox (user_id, request_id, token_ids, created_at, processed_at) values ('$A', 1, '{}', now() - interval '3 days', now() - interval '3 days')" >/dev/null
SU "select public.process_push_responses()" >/dev/null
chk "old processed outbox rows are deleted" "0" "$(SU "select count(*) from public.push_outbox where processed_at < now() - interval '2 days'")"
chk "deleting an account removes tokens" "0" "$(SU "delete from public.profiles where id='$A'; select count(*) from public.push_tokens where user_id='$A'" | tail -1)"

echo; echo "passed: $pass  failed: $fail"; [[ $fail -eq 0 ]]
