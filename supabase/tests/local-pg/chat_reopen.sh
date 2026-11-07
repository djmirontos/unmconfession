#!/usr/bin/env bash
# Tests for 20261107100000_chat_reopen.sql (applied in ONE transaction like the SQL editor).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_reopen
OWN=20261107100000
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
uid() { printf 'eeeeeeee-0000-4000-8000-%012d' "$1"; }
A=$(uid 1); B=$(uid 2); C=$(uid 3); D=$(uid 4); MOD=$(uid 5); E=$(uid 6)
for pair in "$A:alice_a" "$B:bobby_b" "$C:carol_c" "$D:dan_d" "$MOD:mod_m" "$E:erin_e"; do
  SU "insert into auth.users (id,email,raw_user_meta_data) values ('${pair%%:*}','${pair##*:}@unm.test','{\"nickname\":\"${pair##*:}\"}')" >/dev/null
done
SU "update public.user_flags set role='moderator' where user_id='$MOD'" >/dev/null
SU "update public.app_settings set chat_mode='on' where id=1" >/dev/null

echo "== apply the migration in one transaction"
H_BEFORE=$(SU "select md5(string_agg(md5(pg_get_functiondef(p.oid)), ',' order by p.proname)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like '%chat%'")
OUT=$( (echo "begin;"; cat "$HERE/migrations/$OWN"_chat_reopen.sql; echo "commit;") | psql -X -q -v ON_ERROR_STOP=1 -d $DB 2>&1 | grep -v NOTICE)
eq "migration applies cleanly" "" "$OUT"
H_AFTER=$(SU "select md5(string_agg(md5(pg_get_functiondef(p.oid)), ',' order by p.proname)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like '%chat%' and p.proname <> 'reopen_my_chat'")
eq "no existing chat function was changed" "t" "$(SU "select '$H_BEFORE' = '$H_AFTER'")"

echo "== grants"
chk "guest cannot call it" "permission denied" "$(as '' anon "select public.reopen_my_chat('$B')")"
eq "public has no execute" "f" "$(SU "select has_function_privilege('public','public.reopen_my_chat(uuid)','execute')")"
eq "definer with an empty search_path" "t" "$(SU "select prosecdef and exists (select 1 from unnest(proconfig) c where c like 'search_path=%') from pg_proc where proname='reopen_my_chat'")"
chk "no auth: refused" "not_authenticated" "$(PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -d $DB -c "set role authenticated" -c "select public.reopen_my_chat('$B')" 2>&1)"

echo "== setup: an accepted chat A-B with a few messages"
CID=$(as $A authenticated "select public.send_chat_request('$B','hello bob')")
as $B authenticated "select public.respond_chat_request('$CID', true)" >/dev/null
as $A authenticated "select public.send_chat_message('$CID','old message 1')" >/dev/null
as $B authenticated "select public.send_chat_message('$CID','old message 2')" >/dev/null
SU "update public.chat_messages set created_at = created_at - interval '5 minutes' where conversation_id='$CID'" >/dev/null
SU "update public.chat_conversations set last_message_at = now() - interval '5 minutes' where id='$CID'" >/dev/null
SU "update public.chat_members set last_read_at = now() - interval '4 minutes' where conversation_id='$CID'" >/dev/null

echo "== the dead end, then the way out"
as $A authenticated "select public.delete_chat_for_me('$CID')" >/dev/null
eq "hidden from my list" "" "$(as $A authenticated "select * from public.get_conversations()")"
chk "a new request is refused with already_chatting" "already_chatting" "$(as $A authenticated "select public.send_chat_request('$B','hi again')")"
eq "reopen returns the same conversation" "$CID" "$(as $A authenticated "select public.reopen_my_chat('$B')")"
eq "it is back in my list" "accepted|$B" "$(as $A authenticated "select status||'|'||other_id from public.get_conversations()")"
eq "the history I deleted stays deleted" "0" "$(as $A authenticated "select count(*) from public.get_messages('$CID')")"
eq "reopen is idempotent" "$CID" "$(as $A authenticated "select public.reopen_my_chat('$B')")"
eq "the other member's list is unchanged" "accepted|$A" "$(as $B authenticated "select status||'|'||other_id from public.get_conversations()")"
eq "the other member still sees all history" "t" "$(as $B authenticated "select count(*) >= 3 from public.get_messages('$CID')")"
eq "I can write again" "t" "$(as $A authenticated "select public.send_chat_message('$CID','back!') is not null")"
eq "reopen created no notification" "0" "$(SU "select count(*) from public.notifications where user_id='$B'")"
eq "reopen sent no message by itself" "t" "$(as $B authenticated "select string_agg(body,'|' order by created_at) from public.get_messages('$CID')" | grep -qx '.*back!' && echo t || echo f)"
eq "reopen leaves unread counts alone" "0|0" "$(as $A authenticated "select unread_chats||'|'||pending_requests from public.get_chat_unread_count()")"

echo "== both sides deleted"
as $A authenticated "select public.delete_chat_for_me('$CID')" >/dev/null
as $B authenticated "select public.delete_chat_for_me('$CID')" >/dev/null
eq "B reopens too" "$CID" "$(as $B authenticated "select public.reopen_my_chat('$A')")"
eq "B sees it, A still does not" "1|0" "$(as $B authenticated "select count(*) from public.get_conversations()")|$(as $A authenticated "select count(*) from public.get_conversations()")"

echo "== what cannot be reopened"
chk "no chat at all" "not_found" "$(as $A authenticated "select public.reopen_my_chat('$C')")"
chk "self" "not_found" "$(as $A authenticated "select public.reopen_my_chat('$A')")"
chk "null" "not_found" "$(as $A authenticated "select public.reopen_my_chat(null)")"
chk "unknown member" "not_found" "$(as $A authenticated "select public.reopen_my_chat(gen_random_uuid())")"
CP=$(as $A authenticated "select public.send_chat_request('$C','pending one')")
chk "a pending request cannot be reopened" "not_found" "$(as $A authenticated "select public.reopen_my_chat('$C')")"
as $C authenticated "select public.respond_chat_request('$CP', false)" >/dev/null
chk "a declined request cannot be reopened" "not_found" "$(as $A authenticated "select public.reopen_my_chat('$C')")"
chk "declined: the other side neither" "not_found" "$(as $C authenticated "select public.reopen_my_chat('$A')")"

echo "== blocks, bans, deletions, settings"
as $A authenticated "select public.delete_chat_for_me('$CID')" >/dev/null
SU "insert into public.user_blocks (blocker_id,blocked_id,kind) values ('$B','$A','block')" >/dev/null
chk "blocked by them: refused" "not_found" "$(as $A authenticated "select public.reopen_my_chat('$B')")"
SU "delete from public.user_blocks" >/dev/null
SU "insert into public.user_blocks (blocker_id,blocked_id,kind) values ('$A','$B','block')" >/dev/null
chk "I blocked them: refused" "not_found" "$(as $A authenticated "select public.reopen_my_chat('$B')")"
SU "delete from public.user_blocks" >/dev/null
SU "update public.user_flags set status='banned' where user_id='$B'" >/dev/null
chk "banned recipient: refused" "not_found" "$(as $A authenticated "select public.reopen_my_chat('$B')")"
SU "update public.user_flags set status='active' where user_id='$B'" >/dev/null
SU "update public.chat_settings set who_can_message='nobody' where user_id='$B'" >/dev/null
SU "insert into public.chat_settings (user_id, who_can_message) values ('$B','nobody') on conflict (user_id) do update set who_can_message='nobody'" >/dev/null
chk "recipient set to nobody: refused" "not_accepting_messages" "$(as $A authenticated "select public.reopen_my_chat('$B')")"
eq "...and the chat stays hidden" "" "$(as $A authenticated "select * from public.get_conversations()")"
SU "update public.chat_settings set who_can_message='everyone' where user_id='$B'" >/dev/null
SU "update public.profiles set nickname=null where id='$B'" >/dev/null
chk "recipient without a nickname: refused" "not_found" "$(as $A authenticated "select public.reopen_my_chat('$B')")"
SU "update public.profiles set nickname='bobby_b' where id='$B'" >/dev/null
eq "all clear again: reopens" "$CID" "$(as $A authenticated "select public.reopen_my_chat('$B')")"

echo "== switches"
as $A authenticated "select public.delete_chat_for_me('$CID')" >/dev/null
CM=$(as $MOD authenticated "select public.send_chat_request('$B','from the moderator')")
as $B authenticated "select public.respond_chat_request('$CM', true)" >/dev/null
as $MOD authenticated "select public.delete_chat_for_me('$CM')" >/dev/null
SU "update public.app_settings set chat_mode='off' where id=1" >/dev/null
chk "chat off: refused" "chat_disabled" "$(as $A authenticated "select public.reopen_my_chat('$B')")"
SU "update public.app_settings set chat_mode='staff' where id=1" >/dev/null
chk "staff mode: a non-staff caller is refused" "chat_disabled" "$(as $A authenticated "select public.reopen_my_chat('$B')")"
chk "staff mode: staff cannot reopen a chat with a non-staff member" "not_found" "$(as $MOD authenticated "select public.reopen_my_chat('$B')")"
SU "update public.app_settings set chat_mode='on' where id=1" >/dev/null
eq "mode on again: the moderator reopens" "$CM" "$(as $MOD authenticated "select public.reopen_my_chat('$B')")"

echo "== a muted caller cannot reopen"
SU "update public.user_flags set status='suspended', suspended_until = now() + interval '1 hour' where user_id='$A'" >/dev/null
OUTM=$(as $A authenticated "select public.reopen_my_chat('$B')")
eq "suspended (muted) caller: refused" "t" "$([[ "$OUTM" == ERROR* ]] && echo t || echo f)"
eq "...and the chat stays hidden" "f" "$(SU "select not hidden from public.chat_members where conversation_id='$CID' and user_id='$A'")"
SU "update public.user_flags set status='active', suspended_until=null where user_id='$A'" >/dev/null
echo "== a chat that is gone"
SU "delete from public.chat_conversations where id='$CID'" >/dev/null
chk "deleted conversation: not found" "not_found" "$(as $A authenticated "select public.reopen_my_chat('$B')")"

echo
echo "passed: $pass  failed: $fail"
[ "$fail" -eq 0 ]
