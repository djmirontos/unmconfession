#!/usr/bin/env bash
# Tests for 20261025100000_comment_reactions.sql
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_cr

psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/tests/00_supabase_stub.sql" 2>/dev/null || { echo "stub failed"; exit 1; }
for f in 20261021000000_v1_schema 20261022100000_feed_events 20261022110000_allow_three_images 20261023100000_lost_found_manila_date 20261023110000_lost_found_type 20261023120000_edit_delete_own 20261023130000_comments_edit_delete 20261024100000_poll_vote_change 20261024110000_block_filtering 20261024120000_notifications 20261025100000_comment_reactions; do
  [[ $f == 20261024110000_block_filtering ]] && psql -X -q -d $DB -c "revoke all on public.user_blocks from anon"
  # Supabase gives new tables no implicit grants for these roles in our setup: make the stub strict so
  # the migration must grant what it needs.
  [[ $f == 20261025100000_comment_reactions ]] && psql -X -q -d $DB -c "alter default privileges in schema public revoke all on tables from anon, authenticated, service_role"
  psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/$f.sql" 2>&1 | grep -v NOTICE
done

SU() { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }
eq()  { if [[ "$3" == "$2" ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }

A=eeeeeeee-5555-4000-8000-000000000001   # comment author
B=eeeeeeee-5555-4000-8000-000000000002
C=eeeeeeee-5555-4000-8000-000000000003
O=eeeeeeee-5555-4000-8000-000000000004   # post owner
SU "insert into auth.users (id, email, raw_user_meta_data) values
  ('$A','a@unm.test','{\"nickname\":\"author_a\"}'),('$B','b@unm.test','{\"nickname\":\"user_b\"}'),
  ('$C','c@unm.test','{\"nickname\":\"user_c\"}'),('$O','o@unm.test','{\"nickname\":\"owner_o\"}');" >/dev/null

P=$(as $O authenticated "select id from public.create_post('confession','A post to comment on')")
L=$(as $O authenticated "select id from public.create_listing('sell','Chair',null,50,'good')")
CA=$(as $A authenticated "select id from public.create_comment('post','$P','comment by A')")
CL=$(as $A authenticated "select id from public.create_comment('listing','$L','listing comment by A')")
cnt() { as "$1" "$2" "select reaction_count||'|'||coalesce(my_reaction::text,'-') from public.get_comments('post','$P') where id='$3'"; }

echo "== schema"
eq "view columns appended last"        "reaction_count,my_reaction" "$(SU "select string_agg(column_name, ',' order by ordinal_position) from (select column_name, ordinal_position from information_schema.columns where table_name='thread_comments' order by ordinal_position desc limit 2) x" | tr ',' '\n' | sort -r | paste -sd, -)"
eq "starts at 0 / none"                "0|-" "$(cnt $B authenticated $CA)"
eq "guests can read the thread"        "0|-" "$(cnt '' anon $CA)"

echo "== reacting"
as $B authenticated "select public.set_comment_reaction('$CA','like')" >/dev/null
eq "count 1, B sees own reaction"      "1|like" "$(cnt $B authenticated $CA)"
eq "C sees count but not B's type"     "1|-" "$(cnt $C authenticated $CA)"
eq "guests see the count"              "1|-" "$(cnt '' anon $CA)"
as $C authenticated "select public.set_comment_reaction('$CA','wow')" >/dev/null
eq "two reactors"                      "2|wow" "$(cnt $C authenticated $CA)"
as $B authenticated "select public.set_comment_reaction('$CA','love')" >/dev/null
eq "changing keeps the count"          "2|love" "$(cnt $B authenticated $CA)"
as $B authenticated "select public.set_comment_reaction('$CA',null)" >/dev/null
eq "removing lowers the count"         "1|-" "$(cnt $B authenticated $CA)"
as $B authenticated "select public.set_comment_reaction('$CA',null)" >/dev/null
eq "removing twice is harmless"        "1|-" "$(cnt $B authenticated $CA)"
as $B authenticated "select public.set_comment_reaction('$CA','like')" >/dev/null
eq "listing comments work too"         "" "$(as $B authenticated "select public.set_comment_reaction('$CL','haha')" | grep -i error)"
eq "own comment can be reacted to"     "" "$(as $A authenticated "select public.set_comment_reaction('$CA','like')" | grep -i error)"
eq "count includes the author"         "3" "$(SU "select reaction_count from public.comments where id='$CA'")"
chk "guests cannot react"              "permission denied" "$(as '' anon "select public.set_comment_reaction('$CA','like')")"
chk "unknown comment"                  "not_found" "$(as $B authenticated "select public.set_comment_reaction('00000000-0000-4000-8000-000000000000','like')")"
as $A authenticated "select public.delete_own_comment('$CL')" >/dev/null
chk "deleted comment cannot be reacted" "not_found" "$(as $C authenticated "select public.set_comment_reaction('$CL','like')")"
CP=$(as $B authenticated "select id from public.create_comment('post','$P','b second')")
SU "update public.comments set status='pending' where id='$CP'" >/dev/null
chk "held comment cannot be reacted"   "not_found" "$(as $C authenticated "select public.set_comment_reaction('$CP','like')")"
chk "comment_reactions: others' rows hidden" "0" "$(as $C authenticated "select count(*) from public.comment_reactions where user_id <> '$C'")"

echo "== notifications"
eq "author got one group"              "1" "$(as $A authenticated "select count(*) from public.get_notifications() where type='comment_reaction' and target_id='$CA'")"
eq "events/actors (B, C; A is self)"   "2|2" "$(as $A authenticated "select event_count||'|'||actor_count from public.get_notifications() where type='comment_reaction' and target_id='$CA'")"
eq "group key"                         "comment_reaction:$CA" "$(as $A authenticated "select group_key from public.get_notifications() where type='comment_reaction' and target_id='$CA'")"
eq "target is the comment, parent post" "true|published|comment|$P" "$(as $A authenticated "select target_exists||'|'||target_status||'|'||target_kind||'|'||parent_post_id from public.get_notifications() where type='comment_reaction' and target_id='$CA'")"
eq "latest emoji (C reacted last)"    "wow" "$(as $A authenticated "select reaction_type from public.get_notifications() where type='comment_reaction' and target_id='$CA'")"
as $C authenticated "select public.set_comment_reaction('$CA','sad')" >/dev/null
eq "changing does not add events"      "2" "$(as $A authenticated "select event_count from public.get_notifications() where type='comment_reaction' and target_id='$CA'")"
eq "stored emoji follows the change"   "sad" "$(SU "select data->>'reaction' from public.notifications where type='comment_reaction' and actor_id='$C'")"
eq "toggling does not add rows"        "2" "$(as $C authenticated "select public.set_comment_reaction('$CA',null)" >/dev/null; as $C authenticated "select public.set_comment_reaction('$CA','sad')" >/dev/null; SU "select count(*) from public.notifications where type='comment_reaction' and target_id='$CA'")"
eq "self reaction sends nothing"       "0" "$(SU "select count(*) from public.notifications where type='comment_reaction' and actor_id='$A'")"
eq "unread groups (comment + listing comment)" "2" "$(as $A authenticated "select public.get_unread_notification_count()")"
as $A authenticated "select public.mark_notifications_read(array['comment_reaction:$CA'])" >/dev/null
eq "mark one group read by key"      "1" "$(as $A authenticated "select public.get_unread_notification_count()")"
eq "listing comment reaction parent"   "$L" "$(SU "select c.listing_id from public.notifications n join public.comments c on c.id=n.target_id where n.type='comment_reaction' and n.target_id='$CL'")"
as $A authenticated "select public.delete_notifications(array['comment_reaction:$CA'])" >/dev/null
eq "delete group by key"               "0" "$(SU "select count(*) from public.notifications where type='comment_reaction' and target_id='$CA'")"

echo "== blocking"
as $A authenticated "insert into public.user_blocks (blocker_id, blocked_id) values ('$A','$B')" >/dev/null
BEFORE=$(SU "select count(*) from public.notifications where user_id='$A'")
as $B authenticated "select public.set_comment_reaction('$CA','angry')" >/dev/null
eq "blocked reactor: no notification"  "$BEFORE" "$(SU "select count(*) from public.notifications where user_id='$A'")"
eq "blocked reactor's reaction counts" "2" "$(SU "select count(*) from public.comment_reactions where comment_id='$CA' and user_id in ('$B','$A')")"

echo "== notification type check"
chk "reply type is allowed"            "" "$(SU "insert into public.notifications (user_id,type,target_type,target_id,actor_id) values ('$A','reply','comment','$CA','$C')" | grep -i error)"
eq "reply group key"                   "reply:$CA" "$(as $A authenticated "select group_key from public.get_notifications() where type='reply'")"
chk "unknown type is rejected"         "violates check constraint" "$(SU "insert into public.notifications (user_id,type) values ('$A','bogus')")"

echo "== cascade"
SU "delete from public.comments where id='$CA'" >/dev/null
eq "reactions removed with the comment" "0" "$(SU "select count(*) from public.comment_reactions where comment_id='$CA'")"

echo; echo "RESULT: $pass passed, $fail failed"; [[ $fail -eq 0 ]]
