#!/usr/bin/env bash
# Tests for 20261026100000_account_settings.sql
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_acct

psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/tests/00_supabase_stub.sql" 2>/dev/null || { echo "stub failed"; exit 1; }
for f in 20261021000000_v1_schema 20261022100000_feed_events 20261022110000_allow_three_images 20261023100000_lost_found_manila_date 20261023110000_lost_found_type 20261023120000_edit_delete_own 20261023130000_comments_edit_delete 20261024100000_poll_vote_change 20261024110000_block_filtering 20261024120000_notifications 20261025100000_comment_reactions 20261025110000_top_reactions 20261025120000_comment_replies 20261025130000_listings_filters 20261026100000_account_settings; do
  [[ $f == 20261024110000_block_filtering ]] && psql -X -q -d $DB -c "revoke all on public.user_blocks from anon"
  psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/$f.sql" 2>&1 | grep -v NOTICE
done

SU() { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }
eq()  { if [[ "$3" == "$2" ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }

A=33333333-9999-4000-8000-000000000001   # main user
B=33333333-9999-4000-8000-000000000002   # other user
C=33333333-9999-4000-8000-000000000003   # admin
D=33333333-9999-4000-8000-000000000004   # second admin
E=33333333-9999-4000-8000-000000000005   # banned user
for pair in "$A:alice_a" "$B:bob_b" "$C:carl_c" "$D:dana_d" "$E:eve_e"; do
  SU "insert into auth.users (id,email,raw_user_meta_data) values ('${pair%%:*}','${pair##*:}@unm.test','{\"nickname\":\"${pair##*:}\"}')" >/dev/null
done
SU "update public.user_flags set role='admin' where user_id in ('$C','$D'); update public.user_flags set status='banned' where user_id='$E'" >/dev/null

echo "== settings defaults and switches"
eq "defaults: all on, no change yet" "true|true|true||" "$(as $A authenticated "select notify_reactions||'|'||notify_comments||'|'||notify_replies||'|'||coalesce(nickname_changed_at::text,'')||'|'||coalesce(nickname_next_change_at::text,'') from public.get_my_settings()")"
chk "guest cannot read settings"      "permission denied" "$(as '' anon "select * from public.get_my_settings()")"
chk "guest cannot set switches"       "permission denied" "$(as '' anon "select public.set_notification_prefs(false)")"
as $A authenticated "select public.set_notification_prefs(false)" >/dev/null
eq "reactions off, others untouched"  "false|true|true" "$(as $A authenticated "select notify_reactions||'|'||notify_comments||'|'||notify_replies from public.get_my_settings()")"
as $A authenticated "select public.set_notification_prefs(null, false, null)" >/dev/null
eq "null keeps reactions off, comments off" "false|false|true" "$(as $A authenticated "select notify_reactions||'|'||notify_comments||'|'||notify_replies from public.get_my_settings()")"
as $A authenticated "select public.set_notification_prefs(true, true, true)" >/dev/null
eq "all back on"                       "true|true|true" "$(as $A authenticated "select notify_reactions||'|'||notify_comments||'|'||notify_replies from public.get_my_settings()")"
eq "users cannot read others' settings" "0" "$(as $B authenticated "select count(*) from public.user_settings where user_id='$A'")"
chk "no direct writes to settings"    "permission denied" "$(as $A authenticated "update public.user_settings set notify_reactions=false")"
chk "no direct inserts"               "permission denied" "$(as $B authenticated "insert into public.user_settings (user_id) values ('$B')")"
eq "A cannot see B's switches in the RPC" "true|true|true" "$(as $B authenticated "select notify_reactions||'|'||notify_comments||'|'||notify_replies from public.get_my_settings()")"

echo "== switches hide notifications at read time"
T1=33333333-aaaa-4000-8000-000000000001; T2=33333333-aaaa-4000-8000-000000000002
T3=33333333-aaaa-4000-8000-000000000003; T4=33333333-aaaa-4000-8000-000000000004; T5=33333333-aaaa-4000-8000-000000000005
SU "insert into public.notifications (user_id,type,target_type,target_id,actor_id) values
  ('$A','reaction','post','$T1','$B'),
  ('$A','comment_reaction','comment','$T2','$B'),
  ('$A','comment','post','$T3','$B'),
  ('$A','reply','comment','$T4','$B');
  insert into public.notifications (user_id,type,target_type,target_id) values ('$A','content_approved','post','$T5')" >/dev/null
ng() { as $A authenticated "select count(*) from public.get_notifications()"; }
nu() { as $A authenticated "select public.get_unread_notification_count()"; }
eq "all on: 5 groups"                  "5" "$(ng)"
eq "all on: 5 unread"                  "5" "$(nu)"
as $A authenticated "select public.set_notification_prefs(false)" >/dev/null
eq "reactions off hides reaction + comment_reaction" "3" "$(ng)"
eq "badge follows"                     "3" "$(nu)"
eq "the right ones are hidden"         "0" "$(as $A authenticated "select count(*) from public.get_notifications() where type in ('reaction','comment_reaction')")"
as $A authenticated "select public.set_notification_prefs(true, false)" >/dev/null
eq "comments off hides comment"        "4" "$(ng)"
as $A authenticated "select public.set_notification_prefs(true, true, false)" >/dev/null
eq "replies off hides reply"           "4" "$(ng)"
as $A authenticated "select public.set_notification_prefs(false, false, false)" >/dev/null
eq "all off: only the moderation notice" "1" "$(ng)"
eq "all off: badge 1"                  "1" "$(nu)"
eq "moderation notice is the one left" "content_approved" "$(as $A authenticated "select type from public.get_notifications()")"
as $A authenticated "select public.set_notification_prefs(true, true, true)" >/dev/null
eq "turned back on: all 5 return"      "5" "$(ng)"
eq "another user is unaffected"        "0" "$(as $B authenticated "select count(*) from public.get_notifications()")"
SU "delete from public.notifications" >/dev/null

echo "== change nickname"
chk "guest cannot"                     "permission denied" "$(as '' anon "select public.change_nickname('guest_new')")"
chk "banned user cannot"               "banned" "$(as $E authenticated "select public.change_nickname('eve_new')")"
chk "unchanged name is refused"        "nickname_unchanged" "$(as $A authenticated "select public.change_nickname('alice_a')")"
chk "invalid format"                   "nickname_invalid" "$(as $A authenticated "select public.change_nickname('a b')")"
chk "too short"                        "nickname_invalid" "$(as $A authenticated "select public.change_nickname('ab')")"
chk "reserved name"                    "nickname_reserved" "$(as $A authenticated "select public.change_nickname('admin')")"
chk "taken name (case-insensitive)"    "nickname_taken" "$(as $A authenticated "select public.change_nickname('BOB_B')")"
eq "nothing changed after refusals"    "alice_a" "$(SU "select nickname from public.profiles where id='$A'")"
eq "no cooldown started by refusals"   "" "$(SU "select coalesce(nickname_changed_at::text,'') from public.user_settings where user_id='$A'")"
as $A authenticated "select public.change_nickname('  alice_new  ')" >/dev/null
eq "changed (spaces trimmed)"          "alice_new" "$(SU "select nickname from public.profiles where id='$A'")"
eq "cooldown recorded"                 "true" "$(SU "select (nickname_changed_at > now() - interval '1 minute')::text from public.user_settings where user_id='$A'")"
eq "next change in 30 days"            "true" "$(as $A authenticated "select (nickname_next_change_at > now() + interval '29 days 23 hours')::text from public.get_my_settings()")"
chk "second change blocked"            "nickname_cooldown" "$(as $A authenticated "select public.change_nickname('alice_two')")"
eq "old name is free again"            "0" "$(SU "select count(*) from public.profiles where lower(nickname)='alice_a'")"
chk "direct update still locked"       "permission denied" "$(as $A authenticated "update public.profiles set nickname='hack_name' where id='$A'")"
chk "set_nickname still locked"        "nickname_locked" "$(as $A authenticated "select public.set_nickname('hack_name')")"
eq "other fields still editable (avatar)" "avatar_05" "$(as $A authenticated "update public.profiles set avatar_key='avatar_05' where id='$A' returning avatar_key" | head -1)"
SU "update public.user_settings set nickname_changed_at = now() - interval '31 days' where user_id='$A'" >/dev/null
as $A authenticated "select public.change_nickname('ALICE_NEW')" >/dev/null
eq "after cooldown: capital letters only" "ALICE_NEW" "$(SU "select nickname from public.profiles where id='$A'")"
SU "update public.user_settings set nickname_changed_at = now() - interval '31 days' where user_id='$A'" >/dev/null
as $B authenticated "select public.change_nickname('alice_a')" >/dev/null
eq "someone else takes the freed name" "alice_a" "$(SU "select nickname from public.profiles where id='$B'")"
chk "A cannot take B's new name"       "nickname_taken" "$(as $A authenticated "select public.change_nickname('alice_a')")"
PA=$(as $A authenticated "select id from public.create_post('confession','hello from A')")
eq "feed shows the current nickname"   "ALICE_NEW" "$(as '' anon "select nickname from public.feed_posts where id='$PA'")"
as $A authenticated "select public.change_nickname('alice_x')" >/dev/null
eq "feed follows a later change"       "alice_x" "$(as '' anon "select nickname from public.feed_posts where id='$PA'")"

echo "== delete account"
chk "guest cannot"                     "permission denied" "$(as '' anon "select public.delete_my_account('x')")"
chk "wrong confirmation"               "confirm_mismatch" "$(as $A authenticated "select public.delete_my_account('nope')")"
chk "empty confirmation"               "confirm_mismatch" "$(as $A authenticated "select public.delete_my_account('')")"
eq "nothing deleted after refusals"    "1" "$(SU "select count(*) from auth.users where id='$A'")"
PB=$(as $B authenticated "select id from public.create_post('confession','post by B')")
CA=$(as $A authenticated "select id from public.create_comment('post','$PB','comment by A')")
CB=$(as $B authenticated "select id from public.create_comment('post','$PA','comment by B')")
as $A authenticated "select public.set_reaction('$PB','love')" >/dev/null
as $A authenticated "insert into public.user_blocks (blocker_id,blocked_id) values ('$A','$B')" >/dev/null
as $D authenticated "insert into public.user_blocks (blocker_id,blocked_id) values ('$D','$A')" >/dev/null
as $A authenticated "select public.set_notification_prefs(false)" >/dev/null
SU "insert into public.notifications (user_id,type,target_type,target_id,actor_id) values ('$A','comment','post','$PA','$B')" >/dev/null
chk "right confirmation (any case) works" "" "$(as $A authenticated "select public.delete_my_account('  ALICE_X ')" | grep -i error)"
eq "sign-in record is gone"            "0" "$(SU "select count(*) from auth.users where id='$A'")"
eq "profile row stays"                 "1" "$(SU "select count(*) from public.profiles where id='$A'")"
eq "profile has no nickname"           "" "$(SU "select coalesce(nickname,'') from public.profiles where id='$A'")"
eq "avatar reset"                      "avatar_01" "$(SU "select avatar_key from public.profiles where id='$A'")"
eq "post stays, shows no nickname"     "|hello from A" "$(as '' anon "select coalesce(nickname,'')||'|'||body from public.feed_posts where id='$PA'")"
eq "comment stays on other's post"     "1" "$(SU "select count(*) from public.comments where id='$CA' and status='published'")"
eq "comment shows no nickname"         "" "$(as '' anon "select coalesce(nickname,'') from public.thread_comments where id='$CA'")"
eq "reaction stays"                    "1" "$(SU "select count(*) from public.reactions where user_id='$A'")"
eq "own blocks removed"                "0" "$(SU "select count(*) from public.user_blocks where blocker_id='$A'")"
eq "others' blocks of the user stay"   "1" "$(SU "select count(*) from public.user_blocks where blocked_id='$A' and blocker_id='$D'")"
eq "...so the blocked posts stay hidden for D" "0" "$(as $D authenticated "select count(*) from public.feed_posts where id='$PA'")"
eq "notifications removed"             "0" "$(SU "select count(*) from public.notifications where user_id='$A'")"
eq "settings removed"                  "0" "$(SU "select count(*) from public.user_settings where user_id='$A'")"
eq "flags: locked for good"            "banned|account_deleted|true" "$(SU "select status||'|'||status_reason||'|'||(deleted_at is not null)::text from public.user_flags where user_id='$A'")"
eq "name is free for others"           "0" "$(SU "select count(*) from public.profiles where lower(nickname)='alice_x' and id='$A'")"
eq "email can sign up again (new id)"  "1" "$(SU "insert into auth.users (email,raw_user_meta_data) values ('alice_a@unm.test','{\"nickname\":\"alice_x\"}') returning 1" | head -1)"
eq "...and gets the old name back"     "1" "$(SU "select count(*) from public.profiles where lower(nickname)='alice_x'")"
echo "-- a leftover sign-in token cannot be used"
echo "-- a moderation action cannot undo the lock"
SU "update public.user_flags set status='active', status_reason='restored by mod' where user_id='$A'" >/dev/null
chk "marker survives a status change"  "account_deleted" "$(as $A authenticated "select public.set_nickname('zombie_y')")"
chk "delete cannot be repeated either" "not_found" "$(as $A authenticated "select public.delete_my_account('delete')")"
chk "avatar still locked"              "account_deleted" "$(as $A authenticated "update public.profiles set avatar_key='avatar_04' where id='$A'")"
chk "no posting even when 'active'"    "nickname_required" "$(as $A authenticated "select public.create_post('confession','zombie')")"
SU "update public.user_flags set status='banned', status_reason='account_deleted' where user_id='$A'" >/dev/null
chk "cannot post"                      "banned" "$(as $A authenticated "select public.create_post('confession','zombie')")"
chk "cannot comment"                   "banned" "$(as $A authenticated "select public.create_comment('post','$PB','zombie')")"
chk "cannot react"                     "banned" "$(as $A authenticated "select public.set_reaction('$PB','like')")"
chk "cannot delete twice"              "not_found" "$(as $A authenticated "select public.delete_my_account('delete')")"
chk "leftover profile cannot set a nickname" "account_deleted" "$(as $A authenticated "select public.set_nickname('zombie_x')")"
chk "leftover profile cannot change avatar"   "account_deleted" "$(as $A authenticated "update public.profiles set avatar_key='avatar_03' where id='$A'")"
eq "...nickname stays empty" "" "$(SU "select coalesce(nickname,'') from public.profiles where id='$A'")"
eq "...avatar stays reset" "avatar_01" "$(SU "select avatar_key from public.profiles where id='$A'")"
eq "SQL-editor cleanup is still possible" "avatar_02" "$(SU "update public.profiles set avatar_key='avatar_02' where id='$A' returning avatar_key" | head -1)"
SU "update public.profiles set avatar_key='avatar_01' where id='$A'" >/dev/null
chk "cannot get a new nickname"        "banned" "$(as $A authenticated "select public.change_nickname('zombie_x')")"

echo "== delete account: staff and edge cases"
as $D authenticated "select public.delete_my_account('dana_d')" >/dev/null 2>&1
eq "with two admins, one can leave"    "0" "$(SU "select count(*) from auth.users where id='$D'")"
eq "...and loses the role"             "user" "$(SU "select role from public.user_flags where user_id='$D'")"
chk "the last remaining admin is refused" "last_admin" "$(as $C authenticated "select public.delete_my_account('carl_c')")"
eq "...and nothing is deleted"         "1" "$(SU "select count(*) from auth.users where id='$C'")"
eq "banned user keeps the ban reason"  "banned" "$(as $E authenticated "select public.delete_my_account('eve_e')" >/dev/null 2>&1; SU "select status from public.user_flags where user_id='$E'")"
SU "insert into auth.users (id,email) values ('33333333-9999-4000-8000-000000000009','nonick@unm.test')" >/dev/null
N=33333333-9999-4000-8000-000000000009
chk "no nickname: needs the word DELETE" "confirm_mismatch" "$(as $N authenticated "select public.delete_my_account('nonick')")"
as $N authenticated "select public.delete_my_account('delete')" >/dev/null 2>&1
eq "no nickname: DELETE works"         "0" "$(SU "select count(*) from auth.users where id='$N'")"

echo; echo "RESULT: $pass passed, $fail failed"; [[ $fail -eq 0 ]]
