#!/usr/bin/env bash
# Tests for 20261105100000_chat_core.sql (applied in ONE transaction like the SQL editor).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_chat
OWN=20261105100000
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
uid() { printf 'cccccccc-0000-4000-8000-%012d' "$1"; }
A=$(uid 1); B=$(uid 2); C=$(uid 3); D=$(uid 4); MOD=$(uid 5); ADM=$(uid 6); NONICK=$(uid 7); BAN=$(uid 8); MOD2=$(uid 9)
for pair in "$A:alice_a" "$B:bobby_b" "$C:carol_c" "$D:dan_d" "$MOD:mod_m" "$ADM:admin_x" "$BAN:banned_z" "$MOD2:mod_two"; do
  SU "insert into auth.users (id,email,raw_user_meta_data) values ('${pair%%:*}','${pair##*:}@unm.test','{\"nickname\":\"${pair##*:}\"}')" >/dev/null
done
SU "insert into auth.users (id,email) values ('$NONICK','nonick@unm.test')" >/dev/null
SU "update public.user_flags set role='moderator' where user_id in ('$MOD','$MOD2')" >/dev/null
SU "update public.user_flags set role='admin' where user_id='$ADM'" >/dev/null
SU "insert into public.keywords (term, match_type, applies_to) values ('badword','contains','{post,comment,listing}')" >/dev/null

echo "== apply the migration in one transaction"
OUT=$( (echo "begin;"; cat "$HERE/migrations/$OWN"_chat_core.sql; echo "commit;") | psql -X -q -v ON_ERROR_STOP=1 -d $DB 2>&1 | grep -v NOTICE)
eq "migration applies cleanly" "" "$OUT"
eq "chat_mode defaults to off" "off" "$(SU "select chat_mode from public.app_settings where id=1")"
eq "default limits" "10|20|7|180" "$(SU "select chat_requests_per_day||'|'||chat_messages_per_minute||'|'||chat_request_cooldown_days||'|'||chat_retention_days from public.app_settings where id=1")"

echo "== switch off: everything refuses"
chk "request refused while off" "chat_disabled" "$(as $A authenticated "select public.send_chat_request('$B','hi')")"
chk "conversations refused while off" "chat_disabled" "$(as $A authenticated "select * from public.get_conversations()")"
chk "heartbeat refused while off" "chat_disabled" "$(as $A authenticated "select public.chat_heartbeat()")"
chk "settings refused while off" "chat_disabled" "$(as $A authenticated "select * from public.get_chat_settings()")"

echo "== grants"
chk "guest cannot request" "permission denied" "$(as '' anon "select public.send_chat_request('$B','hi')")"
chk "guest cannot list" "permission denied" "$(as '' anon "select * from public.get_conversations()")"
chk "guest cannot read messages" "permission denied" "$(as '' anon "select * from public.get_messages('$A')")"
chk "member cannot read tables" "permission denied" "$(as $A authenticated "select * from public.chat_messages")"
chk "member cannot read conversations table" "permission denied" "$(as $A authenticated "select * from public.chat_conversations")"
chk "member cannot read settings table" "permission denied" "$(as $A authenticated "select * from public.chat_settings")"
chk "member cannot write tables" "permission denied" "$(as $A authenticated "insert into public.chat_messages (conversation_id,sender_id,body) values (gen_random_uuid(),'$A','x')")"
chk "helper not callable: _chat_member" "permission denied" "$(as $A authenticated "select public._chat_member()")"
chk "helper not callable: _chat_blocked" "permission denied" "$(as $A authenticated "select public._chat_blocked('$A','$B')")"
chk "purge not callable by members" "permission denied" "$(as $A authenticated "select public.purge_old_chats()")"

echo "== chat_mode is admin-only"
# Signed-in roles have no UPDATE grant on app_settings at all; the switch is changed in the
# dashboard / SQL editor (auth.uid() is null there, which the guard allows).
chk "moderator cannot switch chat on" "permission denied" "$(as $MOD authenticated "update public.app_settings set chat_mode='on' where id=1")"
chk "admin cannot switch it from the app either" "permission denied" "$(as $ADM authenticated "update public.app_settings set chat_requests_per_day=99 where id=1")"
chk "guest cannot read the chat switch" "permission denied" "$(as '' anon "select chat_mode from public.app_settings")"
eq "members can read the switch (the app needs it)" "off" "$(as $A authenticated "select chat_mode from public.app_settings where id=1")"
SU "grant update on public.app_settings to authenticated" >/dev/null
chk "guard rejects a non-admin signed-in change (chat)" "admin_only" "$(as $MOD authenticated "update public.app_settings set chat_mode='on' where id=1")"
chk "guard rejects a non-admin signed-in change (limits)" "admin_only" "$(as $MOD authenticated "update public.app_settings set chat_messages_per_minute=99 where id=1")"
chk "guard still protects the older fields" "admin_only" "$(as $MOD authenticated "update public.app_settings set min_app_version='9.9.9' where id=1")"
as $ADM authenticated "update public.app_settings set chat_requests_per_day=11 where id=1" >/dev/null
eq "an admin may change it through the guard" "11" "$(SU "select chat_requests_per_day from public.app_settings where id=1")"
SU "update public.app_settings set chat_requests_per_day=10 where id=1" >/dev/null
SU "revoke update on public.app_settings from authenticated" >/dev/null
SU "update public.app_settings set chat_mode='staff' where id=1" >/dev/null
eq "switch to staff (dashboard)" "staff" "$(SU "select chat_mode from public.app_settings where id=1")"
chk "invalid chat_mode rejected" "violates check" "$(SU "update public.app_settings set chat_mode='maybe' where id=1")"

echo "== staff mode: only staff, only with staff"
chk "non-staff refused in staff mode" "chat_disabled" "$(as $A authenticated "select public.send_chat_request('$B','hi')")"
chk "staff to non-staff: not_found" "not_found" "$(as $MOD authenticated "select public.send_chat_request('$A','hi')")"
SC=$(as $MOD authenticated "select public.send_chat_request('$MOD2','test between staff')")
chk "staff to staff works" "-" "$SC"
SU "update public.app_settings set chat_mode='on' where id=1" >/dev/null
SU "delete from public.chat_conversations" >/dev/null

echo "== request validation"
chk "cannot message yourself" "cannot_message_self" "$(as $A authenticated "select public.send_chat_request('$A','hi')")"
chk "empty body" "body_required" "$(as $A authenticated "select public.send_chat_request('$B','   ')")"
chk "null body" "body_required" "$(as $A authenticated "select public.send_chat_request('$B',null)")"
chk "201 chars" "body_too_long" "$(as $A authenticated "select public.send_chat_request('$B', repeat('a',201))")"
chk "unknown recipient" "not_found" "$(as $A authenticated "select public.send_chat_request(gen_random_uuid(),'hi')")"
chk "null recipient" "not_found" "$(as $A authenticated "select public.send_chat_request(null,'hi')")"
chk "recipient without nickname" "not_found" "$(as $A authenticated "select public.send_chat_request('$NONICK','hi')")"
SU "update public.user_flags set status='banned' where user_id='$BAN'" >/dev/null
chk "banned recipient" "not_found" "$(as $A authenticated "select public.send_chat_request('$BAN','hi')")"
chk "link refused (https)" "contact_info_not_allowed" "$(as $A authenticated "select public.send_chat_request('$B','see https://x.example/a')")"
chk "link refused (www)" "contact_info_not_allowed" "$(as $A authenticated "select public.send_chat_request('$B','go to www.example')")"
chk "link refused (domain)" "contact_info_not_allowed" "$(as $A authenticated "select public.send_chat_request('$B','visit foo.com now')")"
chk "e-mail refused" "contact_info_not_allowed" "$(as $A authenticated "select public.send_chat_request('$B','mail me a.b@mail.example')")"
chk "phone refused" "_not_allowed" "$(as $A authenticated "select public.send_chat_request('$B','call 0917 123 4567')")"
chk "phone with dashes refused" "contact_info_not_allowed" "$(as $A authenticated "select public.send_chat_request('$B','09-17-123-4567')")"
chk "keyword refused" "message_not_allowed" "$(as $A authenticated "select public.send_chat_request('$B','you are a BADWORD')")"
chk "short numbers are fine" "-" "$(as $D authenticated "select public.send_chat_request('$C','I am in room 204, section 3')")"
SU "delete from public.chat_conversations" >/dev/null
chk "guest-style nobody setting" "ok" "ok"
as $B authenticated "select public.set_chat_settings('nobody', null)" >/dev/null
chk "recipient set to nobody" "not_accepting_messages" "$(as $A authenticated "select public.send_chat_request('$B','hello there')")"
as $B authenticated "select public.set_chat_settings('everyone', null)" >/dev/null
chk "invalid setting refused" "invalid_input" "$(as $B authenticated "select public.set_chat_settings('some', null)")"
SU "insert into public.user_blocks (blocker_id,blocked_id,kind) values ('$B','$A','block')" >/dev/null
chk "blocked by recipient: not_found" "not_found" "$(as $A authenticated "select public.send_chat_request('$B','hello')")"
chk "blocking sender: not_found" "not_found" "$(as $B authenticated "select public.send_chat_request('$A','hello')")"
SU "delete from public.user_blocks" >/dev/null
SU "insert into public.user_blocks (blocker_id,blocked_id,kind) values ('$B','$A','mute')" >/dev/null
chk "mute (content) does not stop chat" "-" "$(as $A authenticated "select public.send_chat_request('$B','hello after mute')")"
SU "delete from public.user_blocks" >/dev/null
SU "delete from public.chat_conversations" >/dev/null

echo "== request, list, accept"
CID=$(as $A authenticated "select public.send_chat_request('$B','Hi, are you in the 3rd year?')")
chk "request returns an id" "-" "$CID"
eq "pair stored in order" "t" "$(SU "select member_a < member_b from public.chat_conversations where id='$CID'")"
eq "two member rows" "2" "$(SU "select count(*) from public.chat_members where conversation_id='$CID'")"
chk "sender: request pending" "request_pending" "$(as $A authenticated "select public.send_chat_request('$B','again')")"
chk "recipient: request incoming" "request_incoming" "$(as $B authenticated "select public.send_chat_request('$A','hello first')")"
eq "recipient sees the request" "$CID|$A|alice_a|Hi, are you in the 3rd year?" "$(as $B authenticated "select conversation_id||'|'||from_id||'|'||from_nickname||'|'||body from public.get_chat_requests()")"
eq "sender has no incoming request" "" "$(as $A authenticated "select * from public.get_chat_requests()")"
eq "sender sees it as pending_sent" "pending_sent|bobby_b|Hi, are you in the 3rd year?" "$(as $A authenticated "select status||'|'||other_nickname||'|'||last_message_body from public.get_conversations()")"
eq "recipient list is empty before accept" "" "$(as $B authenticated "select * from public.get_conversations()")"
eq "badge: request counted" "0|1" "$(as $B authenticated "select unread_chats||'|'||pending_requests from public.get_chat_unread_count()")"
chk "cannot send before accept" "not_found" "$(as $A authenticated "select public.send_chat_message('$CID','hello')")"
chk "recipient cannot send before accept" "not_found" "$(as $B authenticated "select public.send_chat_message('$CID','hello')")"
chk "messages not readable before accept" "not_found" "$(as $A authenticated "select * from public.get_messages('$CID')")"
chk "requester cannot accept own request" "not_found" "$(as $A authenticated "select public.respond_chat_request('$CID', true)")"
chk "outsider cannot accept" "not_found" "$(as $C authenticated "select public.respond_chat_request('$CID', true)")"
chk "null answer refused" "invalid_input" "$(as $B authenticated "select public.respond_chat_request('$CID', null)")"
as $B authenticated "select public.respond_chat_request('$CID', true)" >/dev/null
eq "accepted" "accepted" "$(SU "select status from public.chat_conversations where id='$CID'")"
eq "request text became the first message from the requester" "1|$A|Hi, are you in the 3rd year?" "$(SU "select count(*)||'|'||min(sender_id::text)||'|'||min(body) from public.chat_messages where conversation_id='$CID'")"
eq "first message keeps the request time" "t" "$(SU "select m.created_at = c.requested_at from public.chat_messages m join public.chat_conversations c on c.id=m.conversation_id where c.id='$CID'")"
chk "cannot accept twice" "not_found" "$(as $B authenticated "select public.respond_chat_request('$CID', true)")"
chk "already chatting" "already_chatting" "$(as $A authenticated "select public.send_chat_request('$B','hello?')")"
eq "recipient's request message counts as read" "0" "$(as $B authenticated "select unread_count from public.get_conversations()")"
eq "requester has nothing unread" "0" "$(as $A authenticated "select unread_count from public.get_conversations()")"
eq "both see the accepted chat" "accepted|alice_a" "$(as $B authenticated "select status||'|'||other_nickname from public.get_conversations()")"

echo "== messages, unread, mute, reply, paging"
M1=$(as $B authenticated "select public.send_chat_message('$CID','  Yes, 3rd year  ')")
chk "message sent" "-" "$M1"
eq "body trimmed" "Yes, 3rd year" "$(SU "select body from public.chat_messages where id='$M1'")"
eq "sender unread unchanged" "0" "$(as $B authenticated "select unread_count from public.get_conversations()")"
eq "other side has 1 unread" "1" "$(as $A authenticated "select unread_count from public.get_conversations()")"
eq "tab badge counts one chat" "1|0" "$(as $A authenticated "select unread_chats||'|'||pending_requests from public.get_chat_unread_count()")"
eq "list shows last message" "Yes, 3rd year|$B" "$(as $A authenticated "select last_message_body||'|'||last_message_sender from public.get_conversations()")"
as $A authenticated "select public.set_chat_muted('$CID', true)" >/dev/null
eq "muted chat leaves the badge" "0|0" "$(as $A authenticated "select unread_chats||'|'||pending_requests from public.get_chat_unread_count()")"
eq "muted flag in list, unread still counted" "true|1" "$(as $A authenticated "select muted||'|'||unread_count from public.get_conversations()")"
as $A authenticated "select public.set_chat_muted('$CID', false)" >/dev/null
as $A authenticated "select public.mark_chat_read('$CID')" >/dev/null
eq "mark read clears unread" "0" "$(as $A authenticated "select unread_count from public.get_conversations()")"
chk "outsider cannot mark read" "not_found" "$(as $C authenticated "select public.mark_chat_read('$CID')")"
chk "outsider cannot mute" "not_found" "$(as $C authenticated "select public.set_chat_muted('$CID', true)")"
chk "outsider cannot read messages" "not_found" "$(as $C authenticated "select * from public.get_messages('$CID')")"
chk "outsider cannot send" "not_found" "$(as $C authenticated "select public.send_chat_message('$CID','hi')")"
chk "empty message" "body_required" "$(as $A authenticated "select public.send_chat_message('$CID','  ')")"
chk "2001 chars" "body_too_long" "$(as $A authenticated "select public.send_chat_message('$CID', repeat('b',2001))")"
chk "2000 chars ok" "-" "$(as $A authenticated "select public.send_chat_message('$CID', repeat('b',2000))")"
M3=$(as $A authenticated "select public.send_chat_message('$CID','replying to you', '$M1')")
eq "reply stored" "$M1" "$(SU "select reply_to_id from public.chat_messages where id='$M3'")"
eq "reply preview in get_messages" "Yes, 3rd year|$B" "$(as $B authenticated "select reply_body||'|'||reply_sender_id from public.get_messages('$CID') where id='$M3'")"
CID2=$(as $C authenticated "select public.send_chat_request('$D','another pair here')")
as $D authenticated "select public.respond_chat_request('$CID2', true)" >/dev/null
OTHERMSG=$(SU "select id from public.chat_messages where conversation_id='$CID2' limit 1")
chk "reply to a message of another chat refused" "invalid_reply" "$(as $A authenticated "select public.send_chat_message('$CID','x', '$OTHERMSG')")"
chk "unknown reply target refused" "invalid_reply" "$(as $A authenticated "select public.send_chat_message('$CID','x', gen_random_uuid())")"
# paging: 3 messages at known times
SU "delete from public.chat_messages where conversation_id='$CID'" >/dev/null
for i in 1 2 3 4 5; do SU "insert into public.chat_messages (conversation_id,sender_id,body,created_at) values ('$CID','$A','m$i', now() - interval '$((10-i)) minutes')" >/dev/null; done
eq "newest first" "m5|m4|m3|m2|m1" "$(as $B authenticated "select string_agg(body,'|' order by created_at desc) from public.get_messages('$CID')")"
eq "limit 2" "m5|m4" "$(as $B authenticated "select string_agg(body,'|' order by created_at desc) from public.get_messages('$CID', null, null, 2)")"
T=$(SU "select created_at from public.chat_messages where conversation_id='$CID' and body='m4'")
I=$(SU "select id from public.chat_messages where conversation_id='$CID' and body='m4'")
eq "next page after m4" "m3|m2" "$(as $B authenticated "select string_agg(body,'|' order by created_at desc) from public.get_messages('$CID', '$T', '$I', 2)")"
eq "limit is clamped to 100" "5" "$(as $B authenticated "select count(*) from public.get_messages('$CID', null, null, 100000)")"
eq "limit below 1 becomes 1" "1" "$(as $B authenticated "select count(*) from public.get_messages('$CID', null, null, 0)")"

echo "== delete my message"
MX=$(SU "select id from public.chat_messages where conversation_id='$CID' and body='m3'")
chk "cannot delete the other person's message" "not_found" "$(as $B authenticated "select public.delete_my_chat_message('$MX')")"
as $A authenticated "select public.delete_my_chat_message('$MX')" >/dev/null
eq "text cleared, stub kept" "|true" "$(SU "select coalesce(body,'')||'|'||(deleted_at is not null) from public.chat_messages where id='$MX'")"
eq "get_messages hides the text" "true|" "$(as $B authenticated "select deleted||'|'||coalesce(body,'') from public.get_messages('$CID') where id='$MX'")"
chk "cannot delete twice" "not_found" "$(as $A authenticated "select public.delete_my_chat_message('$MX')")"
M6=$(as $B authenticated "select public.send_chat_message('$CID','quoting a deleted one', '$MX')")
eq "reply to a deleted message shows no preview" "|" "$(as $A authenticated "select coalesce(reply_body,'')||'|'||coalesce(reply_sender_id::text,'') from public.get_messages('$CID') where id='$M6'")"

echo "== rate limit"
SU "delete from public.chat_messages where conversation_id='$CID'" >/dev/null
SU "update public.app_settings set chat_messages_per_minute=3 where id=1" >/dev/null
for i in 1 2 3; do as $A authenticated "select public.send_chat_message('$CID','r$i')" >/dev/null; done
chk "4th message in a minute refused" "rate_limited" "$(as $A authenticated "select public.send_chat_message('$CID','r4')")"
chk "the other member is not limited" "-" "$(as $B authenticated "select public.send_chat_message('$CID','from bob')")"
SU "update public.app_settings set chat_messages_per_minute=20 where id=1" >/dev/null
SU "update public.chat_messages set created_at = created_at - interval '2 minutes' where conversation_id='$CID'" >/dev/null

echo "== delete chat for me"
as $A authenticated "select public.mark_chat_read('$CID')" >/dev/null
as $A authenticated "select public.delete_chat_for_me('$CID')" >/dev/null
eq "hidden from my list" "" "$(as $A authenticated "select * from public.get_conversations()")"
eq "my history is cleared" "0" "$(as $A authenticated "select count(*) from public.get_messages('$CID')")"
eq "the other member keeps everything" "t" "$(as $B authenticated "select count(*) >= 4 from public.get_messages('$CID')")"
as $B authenticated "select public.send_chat_message('$CID','are you still there?')" >/dev/null
eq "a new message brings the chat back" "accepted|are you still there?|1" "$(as $A authenticated "select status||'|'||last_message_body||'|'||unread_count from public.get_conversations()")"
eq "only the new message is visible to me" "are you still there?" "$(as $A authenticated "select string_agg(body,'|') from public.get_messages('$CID')")"
chk "cannot delete a pending chat for me" "not_found" "$(as $C authenticated "select public.delete_chat_for_me('$CID')")"

echo "== blocks"
SU "insert into public.user_blocks (blocker_id,blocked_id,kind) values ('$A','$B','block')" >/dev/null
eq "blocker's list is empty" "" "$(as $A authenticated "select * from public.get_conversations()")"
eq "blocked member's list is empty" "" "$(as $B authenticated "select * from public.get_conversations()")"
chk "blocker cannot send" "not_found" "$(as $A authenticated "select public.send_chat_message('$CID','x')")"
chk "blocked cannot send" "not_found" "$(as $B authenticated "select public.send_chat_message('$CID','x')")"
chk "blocked cannot read" "not_found" "$(as $B authenticated "select * from public.get_messages('$CID')")"
eq "blocked chats leave the badge" "0|0" "$(as $A authenticated "select unread_chats||'|'||pending_requests from public.get_chat_unread_count()")"
SU "delete from public.user_blocks" >/dev/null
eq "unblocking brings the chat back" "1" "$(as $A authenticated "select count(*) from public.get_conversations()")"
SU "insert into public.user_blocks (blocker_id,blocked_id,kind) values ('$A','$B','mute')" >/dev/null
eq "content mute does not hide the chat" "1" "$(as $A authenticated "select count(*) from public.get_conversations()")"
SU "delete from public.user_blocks" >/dev/null

echo "== banned or deleted partner"
SU "update public.user_flags set status='banned' where user_id='$B'" >/dev/null
eq "banned partner disappears" "" "$(as $A authenticated "select * from public.get_conversations()")"
chk "cannot write to a banned member" "recipient_unavailable" "$(as $A authenticated "select public.send_chat_message('$CID','x')")"
chk "banned member cannot send" "banned" "$(as $B authenticated "select public.send_chat_message('$CID','x')")"
chk "banned member cannot request" "banned" "$(as $B authenticated "select public.send_chat_request('$C','x')")"
SU "update public.user_flags set status='active' where user_id='$B'" >/dev/null
SU "update public.user_flags set status='suspended', suspended_until = now() + interval '1 day' where user_id='$B'" >/dev/null
chk "suspended member cannot send" "suspended" "$(as $B authenticated "select public.send_chat_message('$CID','x')")"
chk "can still write to a suspended member" "-" "$(as $A authenticated "select public.send_chat_message('$CID','get well')")"
SU "update public.user_flags set status='active', suspended_until=null where user_id='$B'" >/dev/null

echo "== decline, cooldown, re-request, daily cap"
SU "delete from public.chat_conversations" >/dev/null
CD=$(as $A authenticated "select public.send_chat_request('$C','hello carol')")
as $C authenticated "select public.respond_chat_request('$CD', false)" >/dev/null
eq "declined" "declined" "$(SU "select status from public.chat_conversations where id='$CD'")"
eq "declined request is not shown to the sender" "" "$(as $A authenticated "select * from public.get_conversations()")"
eq "nor to the decliner" "" "$(as $C authenticated "select * from public.get_chat_requests()")"
chk "asker waits out the cooldown" "request_cooldown" "$(as $A authenticated "select public.send_chat_request('$C','please?')")"
chk "decliner may write first" "-" "$(as $C authenticated "select public.send_chat_request('$A','sorry, hi')")"
eq "roles swapped on the same pair" "$C|pending" "$(SU "select requested_by||'|'||status from public.chat_conversations where id='$CD'")"
eq "same conversation row reused" "1" "$(SU "select count(*) from public.chat_conversations")"
as $A authenticated "select public.respond_chat_request('$CD', false)" >/dev/null
SU "update public.chat_conversations set declined_at = now() - interval '8 days' where id='$CD'" >/dev/null
chk "after the cooldown a new request works" "-" "$(as $C authenticated "select public.send_chat_request('$A','hello again')")"
SU "delete from public.chat_conversations" >/dev/null
CD=$(as $A authenticated "select public.send_chat_request('$C','hello carol')")
as $C authenticated "select public.respond_chat_request('$CD', false)" >/dev/null
SU "update public.chat_conversations set declined_at = now() - interval '8 days' where id='$CD'" >/dev/null
chk "asker may re-request after 8 days" "-" "$(as $A authenticated "select public.send_chat_request('$C','second try')")"
eq "request body replaced and pending again" "second try|pending|" "$(SU "select request_body||'|'||status||'|'||coalesce(declined_at::text,'') from public.chat_conversations where id='$CD'")"
SU "delete from public.chat_conversations" >/dev/null
SU "update public.app_settings set chat_requests_per_day=2 where id=1" >/dev/null
as $A authenticated "select public.send_chat_request('$B','one')" >/dev/null
as $A authenticated "select public.send_chat_request('$C','two')" >/dev/null
chk "third request today refused" "request_limit" "$(as $A authenticated "select public.send_chat_request('$D','three')")"
SU "update public.chat_conversations set requested_at = now() - interval '25 hours' where requested_by='$A' and member_a < member_b and requested_at is not null and id in (select id from public.chat_conversations order by created_at limit 1)" >/dev/null
chk "the cap is per rolling day" "-" "$(as $A authenticated "select public.send_chat_request('$D','three')")"
SU "update public.app_settings set chat_requests_per_day=10 where id=1" >/dev/null
SU "delete from public.chat_conversations" >/dev/null

echo "== presence and settings"
eq "defaults" "everyone|true" "$(as $A authenticated "select who_can_message||'|'||show_online from public.get_chat_settings()")"
CP=$(as $A authenticated "select public.send_chat_request('$B','presence test')")
as $B authenticated "select public.respond_chat_request('$CP', true)" >/dev/null
eq "no heartbeat yet: offline, not null" "f" "$(as $A authenticated "select is_online from public.get_conversations()")"
as $B authenticated "select public.chat_heartbeat()" >/dev/null
eq "after heartbeat: online" "t" "$(as $A authenticated "select is_online from public.get_conversations()")"
SU "update public.chat_settings set last_active_at = now() - interval '5 minutes' where user_id='$B'" >/dev/null
eq "5 minutes later: offline" "f" "$(as $A authenticated "select is_online from public.get_conversations()")"
as $B authenticated "select public.chat_heartbeat()" >/dev/null
as $B authenticated "select public.set_chat_settings(null, false)" >/dev/null
eq "hidden status is null, decided on the server" "" "$(as $A authenticated "select coalesce(is_online::text,'') from public.get_conversations()")"
eq "who_can_message kept when only show_online changes" "everyone|false" "$(as $B authenticated "select who_can_message||'|'||show_online from public.get_chat_settings()")"
as $B authenticated "select public.set_chat_settings('nobody', true)" >/dev/null
eq "both settings saved" "nobody|true" "$(as $B authenticated "select who_can_message||'|'||show_online from public.get_chat_settings()")"
chk "existing chats still work when set to nobody" "-" "$(as $A authenticated "select public.send_chat_message('$CP','still fine')")"
SU "update public.chat_settings set last_active_at = now() - interval '10 seconds' where user_id='$B'" >/dev/null
BEFORE=$(SU "select last_active_at from public.chat_settings where user_id='$B'")
as $B authenticated "select public.chat_heartbeat()" >/dev/null
eq "heartbeat writes at most every 30 seconds" "$BEFORE" "$(SU "select last_active_at from public.chat_settings where user_id='$B'")"
eq "pending chats show no online status" "" "$(as $C authenticated "select public.send_chat_request('$A','hey a')" >/dev/null; as $C authenticated "select coalesce(is_online::text,'') from public.get_conversations()")"

echo "== account deletion removes chats for both sides"
SU "delete from public.chat_conversations" >/dev/null
SU "update public.chat_settings set who_can_message='everyone', show_online=true" >/dev/null
CZ=$(as $A authenticated "select public.send_chat_request('$B','delete test')")
as $B authenticated "select public.respond_chat_request('$CZ', true)" >/dev/null
as $A authenticated "select public.set_chat_settings('everyone', false)" >/dev/null
CY=$(as $C authenticated "select public.send_chat_request('$A','from carol')")
as $A authenticated "select public.respond_chat_request('$CY', true)" >/dev/null
as $A authenticated "select public.delete_my_account('alice_a')" >/dev/null
eq "their conversations are gone" "0" "$(SU "select count(*) from public.chat_conversations where member_a='$A' or member_b='$A'")"
eq "the other members' copies are gone too" "0" "$(as $B authenticated "select count(*) from public.get_conversations()")"
eq "messages are gone" "0" "$(SU "select count(*) from public.chat_messages where conversation_id in ('$CZ','$CY')")"
eq "member rows are gone" "0" "$(SU "select count(*) from public.chat_members where conversation_id in ('$CZ','$CY')")"
eq "settings are gone" "0" "$(SU "select count(*) from public.chat_settings where user_id='$A'")"
CW=$(as $C authenticated "select public.send_chat_request('$D','admin deletion')")
as $D authenticated "select public.respond_chat_request('$CW', true)" >/dev/null
as $D authenticated "select public.set_chat_settings('nobody', null)" >/dev/null
SU "update public.user_flags set status='banned' where user_id='$D'" >/dev/null
as $ADM authenticated "select public.admin_delete_account('$D','spam')" >/dev/null
eq "admin deletion removes the chat" "0|0" "$(SU "select (select count(*) from public.chat_conversations where '$D' in (member_a,member_b))||'|'||(select count(*) from public.chat_settings where user_id='$D')")"
eq "the other side's list is empty" "0" "$(as $C authenticated "select count(*) from public.get_conversations()")"

echo "== retention purge"
SU "delete from public.chat_conversations" >/dev/null
CR=$(as $B authenticated "select public.send_chat_request('$C','retention')")
as $C authenticated "select public.respond_chat_request('$CR', true)" >/dev/null
SU "insert into public.chat_messages (conversation_id,sender_id,body,created_at) values ('$CR','$B','old', now() - interval '200 days'), ('$CR','$B','recent', now() - interval '10 days')" >/dev/null
CS=$(as $B authenticated "select public.send_chat_request('$MOD','old declined')")
as $MOD authenticated "select public.respond_chat_request('$CS', false)" >/dev/null
SU "update public.chat_conversations set requested_at = now() - interval '200 days' where id='$CS'" >/dev/null
SU "select public.purge_old_chats()" >/dev/null
eq "old messages purged, recent kept" "recent" "$(SU "select string_agg(body,'|') from public.chat_messages where body in ('old','recent')")"
eq "accepted chat survives" "1" "$(SU "select count(*) from public.chat_conversations where id='$CR'")"
eq "old declined request purged" "0" "$(SU "select count(*) from public.chat_conversations where id='$CS'")"

echo "== schema safety"
eq "RLS on all four tables" "4" "$(SU "select count(*) from pg_class where relname in ('chat_conversations','chat_messages','chat_members','chat_settings') and relrowsecurity")"
eq "no policies" "0" "$(SU "select count(*) from pg_policies where tablename like 'chat\_%'")"
eq "all chat functions are security definer with an empty search_path" "0" "$(SU "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like '%chat%' or p.proname in ('get_messages','get_conversations')) and p.proname <> 'purge_old_chats' and not (p.prosecdef and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))")"
chk "attachments must stay empty in phase 1" "violates check" "$(SU "insert into public.chat_messages (conversation_id,sender_id,body,attachments) select id, member_a, 'x', '[{\"a\":1}]' from public.chat_conversations limit 1")"
chk "a deleted stub cannot keep text" "violates check" "$(SU "update public.chat_messages set deleted_at=now() where body='recent'")"
chk "pair order is enforced" "violates check" "$(SU "insert into public.chat_conversations (member_a,member_b,requested_by,request_body) values ('$D','$C','$D','x')")"

echo
echo "chat_core: $pass passed, $fail failed"
[[ $fail -eq 0 ]]
