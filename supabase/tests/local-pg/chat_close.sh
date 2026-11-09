#!/usr/bin/env bash
# Tests for 20261108100000_chat_close.sql (applied in ONE transaction like the SQL editor).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_chatclose
OWN=20261108100000
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
uid() { printf '77777777-0000-4000-8000-%012d' "$1"; }
A=$(uid 1); B=$(uid 2); C=$(uid 3)
for pair in "$A:alice_a" "$B:bobby_b" "$C:carol_c"; do
  SU "insert into auth.users (id,email,raw_user_meta_data) values ('${pair%%:*}','${pair##*:}@unm.test','{\"nickname\":\"${pair##*:}\"}')" >/dev/null
done
SU "update public.app_settings set chat_mode='on' where id=1" >/dev/null

echo "== apply the migration in one transaction"
OTHER_SQL="select md5(string_agg(md5(replace(prosrc, chr(13), '')), ',' order by proname)) from pg_proc where pronamespace='public'::regnamespace and (proname like '%chat%' or proname in ('delete_my_account','admin_delete_account','get_messages')) and proname not in ('send_chat_message','reopen_my_chat','close_my_chat')"
O1=$(SU "$OTHER_SQL")
SEND_OLD=$(SU "select md5(replace(prosrc, chr(13), '')) from pg_proc where proname='send_chat_message'")
REOPEN_OLD=$(SU "select md5(replace(prosrc, chr(13), '')) from pg_proc where proname='reopen_my_chat'")
OUT=$( (echo "begin;"; cat "$HERE/migrations/$OWN"_chat_close.sql; echo "commit;") | psql -X -q -v ON_ERROR_STOP=1 -d $DB 2>&1 | grep -v NOTICE)
eq "migration applies cleanly" "" "$OUT"
eq "no other chat function changed" "$O1" "$(SU "$OTHER_SQL")"
# the two re-created functions differ from before only by the documented additions
SEND_BACK=$(SU "select md5(replace(replace(replace(replace(prosrc, chr(13), ''), E'  if exists (select 1 from public.chat_members cm\n              where cm.conversation_id = c.id and cm.user_id = other and cm.closed_at is not null) then\n    raise exception ''not_accepting_messages'';\n  end if;\n', ''), E'  -- a chat I closed myself is not reachable from the app; reopen it first\n  if exists (select 1 from public.chat_members cm\n              where cm.conversation_id = c.id and cm.user_id = uid and cm.closed_at is not null) then\n    raise exception ''not_found'';\n  end if;\n', ''), ' and closed_at is null;', ';')) from pg_proc where proname='send_chat_message'")
eq "send_chat_message differs from the old version only by the additions" "$SEND_OLD" "$SEND_BACK"
eq "grants: close_my_chat" "false|true|false" "$(SU "select has_function_privilege('anon','public.close_my_chat(uuid)','execute')||'|'||has_function_privilege('authenticated','public.close_my_chat(uuid)','execute')||'|'||has_function_privilege('public','public.close_my_chat(uuid)','execute')")"
eq "grants kept: send_chat_message / reopen_my_chat" "false|true|false|true" "$(SU "select has_function_privilege('anon','public.send_chat_message(uuid,text,uuid)','execute')||'|'||has_function_privilege('authenticated','public.send_chat_message(uuid,text,uuid)','execute')||'|'||has_function_privilege('anon','public.reopen_my_chat(uuid)','execute')||'|'||has_function_privilege('authenticated','public.reopen_my_chat(uuid)','execute')")"
chk "guest cannot close" "permission denied" "$(as '' anon "select public.close_my_chat(gen_random_uuid())")"
eq "definer with an empty search_path" "t" "$(SU "select bool_and(prosecdef and exists (select 1 from unnest(proconfig) c where c like 'search_path=%')) from pg_proc where proname in ('close_my_chat','send_chat_message','reopen_my_chat')")"

echo "== setup: an accepted chat A-B"
CID=$(as $A authenticated "select public.send_chat_request('$B','hello bob')")
as $B authenticated "select public.respond_chat_request('$CID', true)" >/dev/null
as $A authenticated "select public.send_chat_message('$CID','from alice') is not null" >/dev/null
as $B authenticated "select public.send_chat_message('$CID','from bob') is not null" >/dev/null

echo "== normal behaviour is unchanged"
as $A authenticated "select public.delete_chat_for_me('$CID')" >/dev/null
as $B authenticated "select public.send_chat_message('$CID','are you there?')" >/dev/null
eq "a new message still brings back a chat deleted for me" "accepted" "$(as $A authenticated "select status from public.get_conversations()")"
chk "rate limit still applies" "rate_limited" "$(SU "update public.app_settings set chat_messages_per_minute=1 where id=1" >/dev/null; as $B authenticated "select public.send_chat_message('$CID','too fast')")"
SU "update public.app_settings set chat_messages_per_minute=20 where id=1" >/dev/null
chk "invalid reply target still refused" "invalid_reply" "$(as $B authenticated "select public.send_chat_message('$CID','x', gen_random_uuid())")"
SU "update public.chat_messages set created_at = created_at - interval '5 minutes' where conversation_id='$CID'" >/dev/null

echo "== close chat"
chk "unknown conversation" "not_found" "$(as $A authenticated "select public.close_my_chat(gen_random_uuid())")"
chk "outsider" "not_found" "$(as $C authenticated "select public.close_my_chat('$CID')")"
CB_BEFORE=$(SU "select coalesce(cleared_before::text,'none') from public.chat_members where conversation_id='$CID' and user_id='$A'")
eq "A closes the chat" "" "$(as $A authenticated "select public.close_my_chat('$CID')")"
eq "hidden for A" "" "$(as $A authenticated "select * from public.get_conversations()")"
eq "closing does not clear history (cleared_before untouched)" "$CB_BEFORE|t" "$(SU "select coalesce(cleared_before::text,'none')||'|'||(closed_at is not null and hidden) from public.chat_members where conversation_id='$CID' and user_id='$A'" | sed 's/true/t/')"
eq "B still sees the chat" "accepted" "$(as $B authenticated "select status from public.get_conversations()")"
chk "B cannot send to A any more" "not_accepting_messages" "$(as $B authenticated "select public.send_chat_message('$CID','please answer')")"
eq "...and nothing was stored" "0" "$(SU "select count(*) from public.chat_messages where body='please answer'")"
eq "the closed chat stays hidden for A" "" "$(as $A authenticated "select * from public.get_conversations()")"
eq "B can still read the history" "t" "$(as $B authenticated "select count(*) >= 3 from public.get_messages('$CID')")"
chk "B cannot reopen it from their side" "not_accepting_messages" "$(as $B authenticated "select public.reopen_my_chat('$A')")"
chk "B cannot start over with a request" "already_chatting" "$(as $B authenticated "select public.send_chat_request('$A','hello again')")"
chk "A (who closed) cannot send until reopened" "not_found" "$(as $A authenticated "select public.send_chat_message('$CID','hi')")"
eq "closing twice is harmless and keeps the first time" "t" "$(T1=$(SU "select closed_at from public.chat_members where conversation_id='$CID' and user_id='$A'"); as $A authenticated "select public.close_my_chat('$CID')" >/dev/null; [[ "$T1" == "$(SU "select closed_at from public.chat_members where conversation_id='$CID' and user_id='$A'")" ]] && echo t || echo f)"
eq "the member is not blocked anywhere else" "0" "$(SU "select count(*) from public.user_blocks")"
eq "unread counts for A ignore the closed chat" "0|0" "$(as $A authenticated "select unread_chats||'|'||pending_requests from public.get_chat_unread_count()")"

echo "== undo: the Message button on their profile"
eq "A reopens (undoes the close)" "$CID" "$(as $A authenticated "select public.reopen_my_chat('$B')")"
eq "visible again" "accepted" "$(as $A authenticated "select status from public.get_conversations()")"
eq "closed flag cleared" "t" "$(SU "select closed_at is null and not hidden from public.chat_members where conversation_id='$CID' and user_id='$A'")"
eq "B can send again" "t" "$(as $B authenticated "select public.send_chat_message('$CID','welcome back') is not null")"
eq "A can send again" "t" "$(as $A authenticated "select public.send_chat_message('$CID','thanks') is not null")"

echo "== close while muted, and the other side closing first"
SU "update public.user_flags set status='suspended', suspended_until = now() + interval '1 hour' where user_id='$A'" >/dev/null
eq "a muted member can close a chat" "" "$(as $A authenticated "select public.close_my_chat('$CID')")"
SU "update public.user_flags set status='active', suspended_until=null where user_id='$A'" >/dev/null
chk "reopening is a write: refused while muted" "suspended" "$(SU "update public.user_flags set status='suspended', suspended_until = now() + interval '1 hour' where user_id='$A'" >/dev/null; as $A authenticated "select public.reopen_my_chat('$B')")"
SU "update public.user_flags set status='active', suspended_until=null where user_id='$A'" >/dev/null
as $A authenticated "select public.reopen_my_chat('$B')" >/dev/null
as $B authenticated "select public.close_my_chat('$CID')" >/dev/null
chk "A cannot send to B after B closed" "not_accepting_messages" "$(as $A authenticated "select public.send_chat_message('$CID','x')")"
chk "A cannot reopen from their side" "not_accepting_messages" "$(as $A authenticated "select public.reopen_my_chat('$B')")"
eq "A still sees the chat" "accepted" "$(as $A authenticated "select status from public.get_conversations()")"
as $B authenticated "select public.reopen_my_chat('$A')" >/dev/null

echo "== closing does not touch blocks, reports or pending requests"
CP=$(as $C authenticated "select public.send_chat_request('$A','pending one')")
chk "a pending request cannot be closed" "not_found" "$(as $A authenticated "select public.close_my_chat('$CP')")"
chk "closing needs chat switched on" "chat_disabled" "$(SU "update public.app_settings set chat_mode='off' where id=1" >/dev/null; as $A authenticated "select public.close_my_chat('$CID')")"
SU "update public.app_settings set chat_mode='on' where id=1" >/dev/null
SU "update public.user_flags set status='banned' where user_id='$A'" >/dev/null
chk "a banned member cannot" "banned" "$(as $A authenticated "select public.close_my_chat('$CID')")"
SU "update public.user_flags set status='active' where user_id='$A'" >/dev/null

echo "== account deletion still works"
as $A authenticated "select public.close_my_chat('$CID')" >/dev/null
as $B authenticated "select public.delete_my_account('bobby_b')" >/dev/null
eq "the chat is gone with the account" "0" "$(SU "select count(*) from public.chat_conversations where id='$CID'")"

echo
echo "passed: $pass  failed: $fail"
[ "$fail" -eq 0 ]
