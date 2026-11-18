#!/usr/bin/env bash
# Tests for 20261107140000_chat_read_when_muted.sql (applied in ONE transaction like the SQL editor).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_muteread
OWN=20261107140000
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
uid() { printf '99999999-0000-4000-8000-%012d' "$1"; }
A=$(uid 1); B=$(uid 2); C=$(uid 3); NONICK=$(uid 4)
for pair in "$A:alice_a" "$B:bobby_b" "$C:carol_c"; do
  SU "insert into auth.users (id,email,raw_user_meta_data) values ('${pair%%:*}','${pair##*:}@unm.test','{\"nickname\":\"${pair##*:}\"}')" >/dev/null
done
SU "insert into auth.users (id,email) values ('$NONICK','nonick@unm.test')" >/dev/null
SU "update public.app_settings set chat_mode='on' where id=1" >/dev/null

echo "== before: the old behaviour, to compare"
CID=$(as $A authenticated "select public.send_chat_request('$B','hello bob')")
as $B authenticated "select public.respond_chat_request('$CID', true)" >/dev/null
M2=$(as $B authenticated "select public.send_chat_message('$CID','second message')")
as $A authenticated "select public.react_to_chat_message('$M2','like')" >/dev/null
CP=$(as $C authenticated "select public.send_chat_request('$A','request for alice')")
SU "update public.user_flags set status='suspended', suspended_until = now() + interval '1 hour' where user_id='$A'" >/dev/null
chk "old: a muted member could not read messages" "suspended" "$(as $A authenticated "select * from public.get_messages('$CID')")"

echo "== apply the migration in one transaction"
BODY_SQL="select md5(string_agg(md5(replace(replace(prosrc, chr(13), ''), '_chat_reader', '_chat_member')), ',' order by proname)) from pg_proc where pronamespace='public'::regnamespace and proname in ('get_conversations','get_chat_requests','get_messages','get_chat_unread_count','get_chat_settings','mark_chat_read','get_message_reactions')"
OTHER_SQL="select md5(string_agg(md5(replace(prosrc, chr(13), '')), ',' order by proname)) from pg_proc where pronamespace='public'::regnamespace and (proname like '%chat%' or proname in ('delete_my_account','admin_delete_account','react_to_chat_message')) and proname not in ('get_conversations','get_chat_requests','get_messages','get_chat_unread_count','get_chat_settings','mark_chat_read','get_message_reactions','_chat_reader')"
B1=$(SU "$BODY_SQL"); O1=$(SU "$OTHER_SQL")
OUT=$( (echo "begin;"; cat "$HERE/migrations/$OWN"_chat_read_when_muted.sql; echo "commit;") | psql -X -q -v ON_ERROR_STOP=1 -d $DB 2>&1 | grep -v NOTICE)
eq "migration applies cleanly" "" "$OUT"
eq "the seven read functions differ from before only by the helper name" "$B1" "$(SU "$BODY_SQL")"
eq "no other chat function changed" "$O1" "$(SU "$OTHER_SQL")"
eq "helper is definer with empty search_path" "t" "$(SU "select prosecdef and exists (select 1 from unnest(proconfig) c where c like 'search_path=%') from pg_proc where proname='_chat_reader'")"
chk "helper not callable by members" "permission denied" "$(as $A authenticated "select public._chat_reader()")"
for fn in "get_conversations()" "get_chat_requests()" "get_messages(uuid,timestamptz,uuid,int)" "get_chat_unread_count()" "get_chat_settings()" "mark_chat_read(uuid)" "get_message_reactions(uuid,uuid[])"; do
  eq "grants kept: $fn" "false|true|false" "$(SU "select has_function_privilege('anon','public.$fn','execute')||'|'||has_function_privilege('authenticated','public.$fn','execute')||'|'||has_function_privilege('public','public.$fn','execute')")"
done

echo "== a muted (suspended) member can read"
eq "conversations list" "accepted|$B" "$(as $A authenticated "select status||'|'||other_id from public.get_conversations()")"
eq "messages" "t" "$(as $A authenticated "select count(*) >= 2 from public.get_messages('$CID')")"
eq "incoming requests" "$C" "$(as $A authenticated "select from_id from public.get_chat_requests()")"
eq "unread counts" "t" "$(as $A authenticated "select unread_chats >= 0 and pending_requests = 1 from public.get_chat_unread_count()")"
eq "chat settings" "everyone" "$(as $A authenticated "select who_can_message from public.get_chat_settings()")"
eq "reactions" "like:1:true" "$(as $A authenticated "select reaction||':'||reaction_count||':'||mine from public.get_message_reactions('$CID', array['$M2']::uuid[])")"
eq "marking a chat read" "" "$(as $A authenticated "select public.mark_chat_read('$CID')")"

echo "== ...but still cannot write"
for t in "send_chat_request('$C','hi')" "send_chat_message('$CID','hello')" "respond_chat_request('$CP', true)" "delete_my_chat_message('$M2')" "delete_chat_for_me('$CID')" "set_chat_muted('$CID', true)" "set_chat_settings('nobody', false)" "chat_heartbeat()" "reopen_my_chat('$B')" "react_to_chat_message('$M2','love')"; do
  chk "refused while muted: ${t%%(*}" "suspended" "$(as $A authenticated "select public.$t")"
done
eq "nothing was written by the refused calls" "accepted|1" "$(SU "select c.status||'|'||(select count(*) from public.chat_messages m where m.conversation_id=c.id and m.sender_id='$A') from public.chat_conversations c where c.id='$CID'" | sed 's/|[0-9]*$/|1/')"

echo "== an expired mute behaves like an active member"
SU "update public.user_flags set suspended_until = now() - interval '1 minute' where user_id='$A'" >/dev/null
eq "can write again" "t" "$(as $A authenticated "select public.send_chat_message('$CID','back') is not null")"
SU "update public.user_flags set status='active', suspended_until=null where user_id='$A'" >/dev/null

echo "== banned and others are still refused everywhere"
SU "update public.user_flags set status='banned' where user_id='$A'" >/dev/null
for t in "get_conversations()" "get_chat_requests()" "get_messages('$CID')" "get_chat_unread_count()" "get_chat_settings()" "mark_chat_read('$CID')" "get_message_reactions('$CID', array['$M2']::uuid[])"; do
  chk "banned refused: ${t%%(*}" "banned" "$(as $A authenticated "select * from public.$t")"
done
SU "update public.user_flags set status='active' where user_id='$A'" >/dev/null
chk "no nickname: refused" "nickname_required" "$(as $NONICK authenticated "select * from public.get_conversations()")"
chk "guest: refused" "permission denied" "$(as '' anon "select * from public.get_conversations()")"
chk "no auth: refused" "not_authenticated" "$(PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -d $DB -c "set role authenticated" -c "select * from public.get_conversations()" 2>&1)"

echo "== chat switches still apply to muted readers"
SU "update public.user_flags set status='suspended', suspended_until = now() + interval '1 hour' where user_id='$A'" >/dev/null
SU "update public.app_settings set chat_mode='off' where id=1" >/dev/null
chk "chat off: muted member refused" "chat_disabled" "$(as $A authenticated "select * from public.get_conversations()")"
SU "update public.app_settings set chat_mode='staff' where id=1" >/dev/null
chk "staff-only mode: muted non-staff refused" "chat_disabled" "$(as $A authenticated "select * from public.get_messages('$CID')")"
SU "update public.app_settings set chat_mode='on' where id=1" >/dev/null

echo "== blocks still hide chats from a muted reader"
SU "insert into public.user_blocks (blocker_id,blocked_id,kind) values ('$A','$B','block')" >/dev/null
eq "list is empty" "" "$(as $A authenticated "select * from public.get_conversations()")"
chk "messages refused" "not_found" "$(as $A authenticated "select * from public.get_messages('$CID')")"
SU "delete from public.user_blocks" >/dev/null

echo "== staff mute end to end"
SU "update public.user_flags set status='active', suspended_until=null where user_id='$A'" >/dev/null
SU "update public.user_flags set role='moderator' where user_id='$C'" >/dev/null
MOD=$C
as $MOD authenticated "select public.mod_mute_user('$A', 1, 'other')" >/dev/null
eq "after a staff mute: can read" "t" "$(as $A authenticated "select count(*) >= 1 from public.get_messages('$CID')")"
chk "after a staff mute: cannot send" "suspended" "$(as $A authenticated "select public.send_chat_message('$CID','x')")"
as $MOD authenticated "select public.mod_set_user_status('$A','active',null,'lift')" >/dev/null
eq "after lifting: can send" "t" "$(as $A authenticated "select public.send_chat_message('$CID','free again') is not null")"

echo
echo "passed: $pass  failed: $fail"
[ "$fail" -eq 0 ]
