#!/usr/bin/env bash
# Tests for 20261107120000_chat_reactions.sql (applied in ONE transaction like the SQL editor).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_react
OWN=20261107120000
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
uid() { printf 'ffffffff-0000-4000-8000-%012d' "$1"; }
A=$(uid 1); B=$(uid 2); C=$(uid 3); MOD=$(uid 4)
for pair in "$A:alice_a" "$B:bobby_b" "$C:carol_c" "$MOD:mod_m"; do
  SU "insert into auth.users (id,email,raw_user_meta_data) values ('${pair%%:*}','${pair##*:}@unm.test','{\"nickname\":\"${pair##*:}\"}')" >/dev/null
done
SU "update public.user_flags set role='moderator' where user_id='$MOD'" >/dev/null
SU "update public.app_settings set chat_mode='on' where id=1" >/dev/null

echo "== apply the migration in one transaction"
FN_SQL="select md5(string_agg(md5(pg_get_functiondef(p.oid)), ',' order by p.proname)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like '%chat%' or p.proname in ('get_messages','delete_my_account','admin_delete_account')) and p.proname not in ('react_to_chat_message','get_message_reactions')"
H_BEFORE=$(SU "$FN_SQL")
OUT=$( (echo "begin;"; cat "$HERE/migrations/$OWN"_chat_reactions.sql; echo "commit;") | psql -X -q -v ON_ERROR_STOP=1 -d $DB 2>&1 | grep -v NOTICE)
eq "migration applies cleanly" "" "$OUT"
eq "no existing chat function, get_messages or delete function changed" "$H_BEFORE" "$(SU "$FN_SQL")"

echo "== grants"
chk "guest cannot react" "permission denied" "$(as '' anon "select public.react_to_chat_message(gen_random_uuid(),'like')")"
chk "guest cannot read reactions" "permission denied" "$(as '' anon "select * from public.get_message_reactions(gen_random_uuid(), array[]::uuid[])")"
chk "member cannot read the table" "permission denied" "$(as $A authenticated "select * from public.chat_message_reactions")"
chk "member cannot write the table" "permission denied" "$(as $A authenticated "insert into public.chat_message_reactions (message_id,user_id,reaction) values (gen_random_uuid(),'$A','like')")"
for fn in "react_to_chat_message(uuid,text)" "get_message_reactions(uuid,uuid[])"; do
  eq "public has no execute: $fn" "f" "$(SU "select has_function_privilege('public','public.$fn','execute')")"
done
eq "definer with an empty search_path" "t" "$(SU "select bool_and(prosecdef and exists (select 1 from unnest(proconfig) c where c like 'search_path=%')) from pg_proc where proname in ('react_to_chat_message','get_message_reactions')")"
chk "no auth: refused" "not_authenticated" "$(PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -d $DB -c "set role authenticated" -c "select public.react_to_chat_message(gen_random_uuid(),'like')" 2>&1)"

echo "== setup: an accepted chat A-B"
CID=$(as $A authenticated "select public.send_chat_request('$B','hello bob')")
as $B authenticated "select public.respond_chat_request('$CID', true)" >/dev/null
M1=$(SU "select id from public.chat_messages where conversation_id='$CID' order by created_at limit 1")
M2=$(as $B authenticated "select public.send_chat_message('$CID','second message')")
M3=$(as $A authenticated "select public.send_chat_message('$CID','third message')")
SU "update public.chat_messages set created_at = created_at - interval '10 minutes' where conversation_id='$CID'" >/dev/null
LAST_BEFORE=$(SU "select last_message_at from public.chat_conversations where id='$CID'")
UNREAD_BEFORE=$(as $B authenticated "select unread_chats||'|'||pending_requests from public.get_chat_unread_count()")
R() { as "$1" authenticated "select string_agg(reaction||':'||reaction_count||':'||mine, ',' order by reaction) from public.get_message_reactions('$CID', array['$2']::uuid[])"; }

echo "== reacting"
eq "A reacts like on B's message" "" "$(as $A authenticated "select public.react_to_chat_message('$M2','like')")"
eq "A sees it as mine" "like:1:true" "$(R $A $M2)"
eq "B sees one 'like', not mine" "like:1:false" "$(R $B $M2)"
as $B authenticated "select public.react_to_chat_message('$M2','like')" >/dev/null
eq "A's view after both liked" "like:2:true" "$(R $A $M2)"
as $A authenticated "select public.react_to_chat_message('$M2','love')" >/dev/null
eq "one reaction per person: A's like is replaced by love" "like:1:false,love:1:true" "$(R $A $M2)"
eq "...and B's own is untouched" "like:1:true,love:1:false" "$(R $B $M2)"
as $A authenticated "select public.react_to_chat_message('$M2','love')" >/dev/null
eq "the same reaction again is a no-op" "like:1:false,love:1:true" "$(R $A $M2)"
for k in like love laugh wow sad thanks; do
  eq "key accepted: $k" "$k:1:true" "$(as $A authenticated "select public.react_to_chat_message('$M3','$k')" >/dev/null; R $A $M3)"
done
as $A authenticated "select public.react_to_chat_message('$M3', null)" >/dev/null
eq "null removes my reaction" "" "$(R $A $M3)"
eq "removing twice is harmless" "" "$(as $A authenticated "select public.react_to_chat_message('$M3', null)")"
chk "unknown key" "invalid_reaction" "$(as $A authenticated "select public.react_to_chat_message('$M2','angry')")"
chk "a glyph is not a key" "invalid_reaction" "$(as $A authenticated "select public.react_to_chat_message('$M2','👍')")"
chk "empty text is not a key" "invalid_reaction" "$(as $A authenticated "select public.react_to_chat_message('$M2','')")"
chk "unknown message" "not_found" "$(as $A authenticated "select public.react_to_chat_message(gen_random_uuid(),'like')")"
chk "null message" "not_found" "$(as $A authenticated "select public.react_to_chat_message(null,'like')")"
eq "I can react to my own message" "" "$(as $A authenticated "select public.react_to_chat_message('$M3','laugh')")"
eq "...and it shows for the other side" "laugh:1:false" "$(R $B $M3)"

echo "== privacy of chats"
chk "an outsider cannot react" "not_found" "$(as $C authenticated "select public.react_to_chat_message('$M2','like')")"
chk "an outsider cannot read" "not_found" "$(as $C authenticated "select * from public.get_message_reactions('$CID', array['$M2']::uuid[])")"
chk "staff cannot react in a chat they are not in" "not_found" "$(as $MOD authenticated "select public.react_to_chat_message('$M2','like')")"
eq "reactions are not side effects on the chat order" "$LAST_BEFORE" "$(SU "select last_message_at from public.chat_conversations where id='$CID'")"
eq "reactions do not change unread counts" "$UNREAD_BEFORE" "$(as $B authenticated "select unread_chats||'|'||pending_requests from public.get_chat_unread_count()")"
eq "reactions create no notification" "0" "$(SU "select count(*) from public.notifications where user_id in ('$A','$B')")"
eq "reactions send no push request" "0" "$(SU "select count(*) from net._calls")"

echo "== reading limits"
eq "no ids: empty" "" "$(as $A authenticated "select * from public.get_message_reactions('$CID', array[]::uuid[])")"
chk "null ids" "invalid_input" "$(as $A authenticated "select * from public.get_message_reactions('$CID', null)")"
chk "more than 100 ids" "invalid_input" "$(as $A authenticated "select * from public.get_message_reactions('$CID', (select array_agg(gen_random_uuid()) from generate_series(1,101)))")"
eq "exactly 100 ids is fine" "" "$(as $A authenticated "select * from public.get_message_reactions('$CID', (select array_agg(gen_random_uuid()) from generate_series(1,100)))")"
as $B authenticated "select public.react_to_chat_message('$M1','thanks')" >/dev/null
eq "several messages in one read" "3" "$(as $A authenticated "select count(distinct message_id) from public.get_message_reactions('$CID', array['$M1','$M2','$M3']::uuid[])")"
eq "a message id from another chat is ignored" "" "$(as $A authenticated "select * from public.get_message_reactions('$CID', array[gen_random_uuid()]::uuid[])")"

echo "== deleted messages"
as $A authenticated "select public.delete_my_chat_message('$M3')" >/dev/null
chk "cannot react to a deleted message" "not_found" "$(as $B authenticated "select public.react_to_chat_message('$M3','like')")"
eq "reactions on a deleted message are hidden" "" "$(R $B $M3)"

echo "== delete chat for me"
as $A authenticated "select public.delete_chat_for_me('$CID')" >/dev/null
chk "cleared messages cannot be reacted to by the member who cleared" "not_found" "$(as $A authenticated "select public.react_to_chat_message('$M2','like')")"
as $B authenticated "select public.send_chat_message('$CID','new after clear')" >/dev/null
MN=$(SU "select id from public.chat_messages where body='new after clear'")
eq "A can react to a new message after clearing" "" "$(as $A authenticated "select public.react_to_chat_message('$MN','wow')")"
eq "A no longer reads reactions on cleared messages" "" "$(as $A authenticated "select * from public.get_message_reactions('$CID', array['$M1','$M2']::uuid[])")"
eq "B still reads them" "t" "$(as $B authenticated "select count(*) > 0 from public.get_message_reactions('$CID', array['$M1','$M2']::uuid[])")"

echo "== blocks, bans, switches, mute"
SU "insert into public.user_blocks (blocker_id,blocked_id,kind) values ('$A','$B','block')" >/dev/null
chk "blocker cannot react" "not_found" "$(as $A authenticated "select public.react_to_chat_message('$MN','like')")"
chk "blocked cannot react" "not_found" "$(as $B authenticated "select public.react_to_chat_message('$MN','like')")"
chk "blocked cannot read" "not_found" "$(as $B authenticated "select * from public.get_message_reactions('$CID', array['$MN']::uuid[])")"
SU "delete from public.user_blocks" >/dev/null
SU "update public.user_flags set status='banned' where user_id='$B'" >/dev/null
chk "recipient banned: refused" "not_found" "$(as $A authenticated "select public.react_to_chat_message('$MN','like')")"
SU "update public.user_flags set status='active' where user_id='$B'" >/dev/null
SU "update public.app_settings set chat_mode='off' where id=1" >/dev/null
chk "chat off: refused" "chat_disabled" "$(as $A authenticated "select public.react_to_chat_message('$MN','like')")"
chk "chat off: read refused" "chat_disabled" "$(as $A authenticated "select * from public.get_message_reactions('$CID', array['$MN']::uuid[])")"
SU "update public.app_settings set chat_mode='on' where id=1" >/dev/null
SU "update public.user_flags set status='suspended', suspended_until = now() + interval '1 hour' where user_id='$A'" >/dev/null
OUTM=$(as $A authenticated "select public.react_to_chat_message('$MN','like')")
eq "muted member cannot react" "t" "$([[ "$OUTM" == ERROR* ]] && echo t || echo f)"
chk "...and reading is refused too, like get_messages (existing chat rule)" "suspended" "$(as $A authenticated "select * from public.get_message_reactions('$CID', array['$MN']::uuid[])")"
SU "update public.user_flags set status='active', suspended_until=null where user_id='$A'" >/dev/null
SU "update public.user_flags set status='banned' where user_id='$A'" >/dev/null
OUTB=$(as $A authenticated "select public.react_to_chat_message('$MN','like')")
eq "banned member cannot react" "t" "$([[ "$OUTB" == ERROR* ]] && echo t || echo f)"
SU "update public.user_flags set status='active' where user_id='$A'" >/dev/null

echo "== rate limit (30 different messages a minute)"
SU "delete from public.chat_message_reactions" >/dev/null
SU "insert into public.chat_messages (conversation_id, sender_id, body, created_at) select '$CID', '$B', 'bulk '||g, now() + (g||' seconds')::interval from generate_series(1,31) g" >/dev/null
BULK=$(SU "select id from public.chat_messages where body like 'bulk %' order by created_at")
i=0; for id in $BULK; do i=$((i+1)); if [ $i -le 30 ]; then as $A authenticated "select public.react_to_chat_message('$id','like')" >/dev/null; else LASTID=$id; fi; done
chk "31st different message in a minute refused" "rate_limited" "$(as $A authenticated "select public.react_to_chat_message('$LASTID','like')")"
eq "changing a reaction I already have is still allowed" "" "$(as $A authenticated "select public.react_to_chat_message('$(echo "$BULK" | head -1)','love')")"
eq "the other member is not limited" "" "$(as $B authenticated "select public.react_to_chat_message('$(echo "$BULK" | head -1)','sad')")"
SU "update public.chat_message_reactions set updated_at = now() - interval '2 minutes'" >/dev/null
eq "removing a reaction is never limited" "" "$(as $A authenticated "select public.react_to_chat_message('$LASTID', null)")"
eq "after a minute it works again" "" "$(as $A authenticated "select public.react_to_chat_message('$LASTID','like')")"
MN=$(echo "$BULK" | head -1)

echo "== cascade"
SU "delete from public.chat_message_reactions" >/dev/null
as $A authenticated "select public.react_to_chat_message('$MN','love')" >/dev/null
SU "delete from public.chat_messages where id='$MN'" >/dev/null
eq "deleting a message (retention purge) removes its reactions" "0" "$(SU "select count(*) from public.chat_message_reactions where message_id='$MN'")"
as $B authenticated "select public.react_to_chat_message('$M2','wow')" >/dev/null
as $B authenticated "select public.delete_my_account('bobby_b')" >/dev/null
eq "account deletion removes reactions" "0" "$(SU "select count(*) from public.chat_message_reactions")"

echo
echo "passed: $pass  failed: $fail"
[ "$fail" -eq 0 ]
