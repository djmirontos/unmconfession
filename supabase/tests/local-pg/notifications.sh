#!/usr/bin/env bash
# Tests for 20261024120000_notifications.sql (stub + all migrations on a fresh DB).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_nt

psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/tests/00_supabase_stub.sql" 2>/dev/null || { echo "stub failed"; exit 1; }
for f in 20261021000000_v1_schema 20261022100000_feed_events 20261022110000_allow_three_images 20261023100000_lost_found_manila_date 20261023110000_lost_found_type 20261023120000_edit_delete_own 20261023130000_comments_edit_delete 20261024100000_poll_vote_change 20261024110000_block_filtering 20261024120000_notifications; do
  [[ $f == 20261024110000_block_filtering ]] && psql -X -q -d $DB -c "revoke all on public.user_blocks from anon"
  psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/$f.sql" 2>&1 | grep -v NOTICE
done

SU() { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }
eq()  { if [[ "$3" == "$2" ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }

A=dddddddd-4444-4000-8000-000000000001   # owner
B=dddddddd-4444-4000-8000-000000000002
C=dddddddd-4444-4000-8000-000000000003
D=dddddddd-4444-4000-8000-000000000004
M=dddddddd-4444-4000-8000-000000000005
SU "insert into auth.users (id, email, raw_user_meta_data) values
  ('$A','a@unm.test','{\"nickname\":\"owner_a\"}'),('$B','b@unm.test','{\"nickname\":\"user_b\"}'),
  ('$C','c@unm.test','{\"nickname\":\"user_c\"}'),('$D','d@unm.test','{\"nickname\":\"user_d\"}'),
  ('$M','m@unm.test','{\"nickname\":\"mod_m\"}');
  update public.user_flags set role='moderator' where user_id='$M';" >/dev/null

P1=$(as $A authenticated "select id from public.create_post('confession','First post of A')")
P2=$(as $A authenticated "select id from public.create_post('confession','Second post of A')")
L1=$(as $A authenticated "select id from public.create_listing('sell','Desk for sale',null,100,'good')")
N() { as $A authenticated "$1"; }

echo "== grouping"
as $B authenticated "select public.set_reaction('$P1','like')" >/dev/null
as $C authenticated "select public.set_reaction('$P1','love')" >/dev/null
as $D authenticated "select public.set_reaction('$P1','wow')" >/dev/null
eq "3 reactions are one group"           "1" "$(N "select count(*) from public.get_notifications() where type='reaction' and target_id='$P1'")"
eq "event_count 3"                       "3" "$(N "select event_count from public.get_notifications() where type='reaction' and target_id='$P1'")"
eq "actor_count 3"                       "3" "$(N "select actor_count from public.get_notifications() where type='reaction' and target_id='$P1'")"
eq "unread_count 3"                      "3" "$(N "select unread_count from public.get_notifications() where type='reaction' and target_id='$P1'")"
eq "latest actor is the last reactor"    "user_d|wow" "$(N "select actor_nickname||'|'||reaction_type from public.get_notifications() where type='reaction' and target_id='$P1'")"
eq "group_key format"                    "reaction:$P1" "$(N "select group_key from public.get_notifications() where type='reaction' and target_id='$P1'")"

as $B authenticated "select public.create_comment('post','$P1','b first')" >/dev/null
as $B authenticated "select public.create_comment('post','$P1','b second')" >/dev/null
as $C authenticated "select public.create_comment('post','$P1','c only')" >/dev/null
eq "comments are one group per post"     "1" "$(N "select count(*) from public.get_notifications() where type='comment' and target_id='$P1'")"
eq "3 comments, 2 distinct commenters"   "3|2" "$(N "select event_count||'|'||actor_count from public.get_notifications() where type='comment' and target_id='$P1'")"
eq "latest commenter"                    "user_c" "$(N "select actor_nickname from public.get_notifications() where type='comment' and target_id='$P1'")"
as $C authenticated "select public.create_comment('listing','$L1','nice desk')" >/dev/null
eq "listing comment is its own group"    "1" "$(N "select count(*) from public.get_notifications() where type='comment' and target_id='$L1'")"
eq "listing preview is the title"        "Desk for sale" "$(N "select target_preview from public.get_notifications() where target_id='$L1'")"
eq "post preview"                        "First post of A" "$(N "select target_preview from public.get_notifications() where type='comment' and target_id='$P1'")"
eq "target info"                         "true|published|confession" "$(N "select target_exists||'|'||target_status||'|'||target_kind from public.get_notifications() where type='comment' and target_id='$P1'")"

echo "== reaction change keeps one row and updates the emoji"
as $B authenticated "select public.set_reaction('$P1','angry')" >/dev/null
eq "still 3 reaction events"             "3" "$(N "select event_count from public.get_notifications() where type='reaction' and target_id='$P1'")"
eq "stored type follows the change"      "angry" "$(SU "select data->>'reaction' from public.notifications where type='reaction' and target_id='$P1' and actor_id='$B'")"
as $B authenticated "select public.set_reaction('$P1',null)" >/dev/null
as $B authenticated "select public.set_reaction('$P1','like')" >/dev/null
eq "toggling does not add rows"          "3" "$(SU "select count(*) from public.notifications where type='reaction' and target_id='$P1'")"

echo "== moderation notices and ordering"
SU "insert into public.notifications (user_id, type, target_type, target_id, data)
    values ('$A','content_rejected','post','$P2','{\"reason\":\"doxxing\"}')" >/dev/null
eq "rejected notice shows its reason"    "doxxing" "$(N "select reason from public.get_notifications() where type='content_rejected'")"
eq "notice is not grouped"               "1" "$(N "select event_count from public.get_notifications() where type='content_rejected'")"
eq "newest group first"                  "content_rejected" "$(N "select type from public.get_notifications() limit 1")"
eq "4 groups in total"                   "4" "$(N "select count(*) from public.get_notifications()")"

echo "== pagination"
FIRST=$(N "select latest_at||'|'||group_key from public.get_notifications(null,null,2) offset 1 limit 1")
TS="${FIRST%%|*}"; KEY="${FIRST#*|}"
eq "page 1 has 2 rows"                   "2" "$(N "select count(*) from public.get_notifications(null,null,2)")"
eq "page 2 has the other 2"              "2" "$(N "select count(*) from public.get_notifications('$TS','$KEY',2)")"
eq "limit is capped at 50"               "4" "$(N "select count(*) from public.get_notifications(null,null,1000)")"

echo "== unread count (groups)"
eq "4 unread groups"                     "4" "$(N "select public.get_unread_notification_count()")"
as $A authenticated "select public.mark_notifications_read(array['reaction:$P1'])" >/dev/null
eq "mark one group read"                 "3" "$(N "select public.get_unread_notification_count()")"
eq "its rows are read"                   "0" "$(SU "select count(*) from public.notifications where type='reaction' and target_id='$P1' and read_at is null")"
eq "other groups still unread"           "3" "$(N "select count(*) from public.get_notifications() where unread_count > 0")"
as $B authenticated "select public.create_comment('post','$P2','late comment')" >/dev/null
eq "new activity makes a group unread"   "4" "$(N "select public.get_unread_notification_count()")"

echo "== other people cannot touch my notifications"
eq "B sees none of A's"                  "0" "$(as $B authenticated "select count(*) from public.get_notifications() where target_id in ('$P1','$P2')")"
as $B authenticated "select public.mark_notifications_read()" >/dev/null
as $B authenticated "select public.delete_notifications(array['reaction:$P1','comment:$P1'])" >/dev/null
eq "A's rows survive B's calls"          "4" "$(N "select public.get_unread_notification_count()")"
chk "guests cannot call"            "permission denied" "$(as '' anon "select * from public.get_notifications()")"
chk "guests cannot count"          "permission denied" "$(as '' anon "select public.get_unread_notification_count()")"

echo "== blocking hides existing notifications"
as $A authenticated "insert into public.user_blocks (blocker_id, blocked_id) values ('$A','$B')" >/dev/null
eq "reaction group shrinks"              "2" "$(N "select event_count from public.get_notifications() where type='reaction' and target_id='$P1'")"
eq "B-only comment group disappears"     "0" "$(N "select count(*) from public.get_notifications() where type='comment' and target_id='$P2'")"
eq "comment group drops B's comments"    "1|1" "$(N "select event_count||'|'||actor_count from public.get_notifications() where type='comment' and target_id='$P1'")"
as $A authenticated "delete from public.user_blocks where blocked_id='$B'" >/dev/null
eq "unblocking restores them"            "3" "$(N "select event_count from public.get_notifications() where type='reaction' and target_id='$P1'")"

echo "== target gone"
as $A authenticated "select public.delete_own_post('$P1')" >/dev/null
eq "deleted post: target_exists false"   "f" "$(N "select target_exists from public.get_notifications() where type='comment' and target_id='$P1'")"
eq "deleted post: no preview"            "" "$(N "select coalesce(target_preview,'') from public.get_notifications() where type='comment' and target_id='$P1'")"

echo "== mark all and delete"
as $A authenticated "select public.mark_notifications_read()" >/dev/null
eq "mark all read"                       "0" "$(N "select public.get_unread_notification_count()")"
as $A authenticated "select public.delete_notifications(array['reaction:$P1'])" >/dev/null
eq "delete a whole group"                "0" "$(SU "select count(*) from public.notifications where type='reaction' and target_id='$P1'")"
eq "other groups remain"                 "1" "$(N "select count(*) from public.get_notifications() where type='comment' and target_id='$L1'")"

echo "== comment notices (approved/rejected/removed comments)"
CM=$(as $B authenticated "select id from public.create_comment('post','$P2','my own comment')")
SU "insert into public.notifications (user_id, type, target_type, target_id, data)
    values ('$B','content_approved','comment','$CM','{}')" >/dev/null
eq "comment notice finds its comment"   "true|published|comment|my own comment" "$(as $B authenticated "select target_exists||'|'||target_status||'|'||target_kind||'|'||target_preview from public.get_notifications() where target_id='$CM'")"
eq "comment notice returns parent post" "$P2" "$(as $B authenticated "select parent_post_id from public.get_notifications() where target_id='$CM'")"
eq "no parent listing"                  "" "$(as $B authenticated "select coalesce(parent_listing_id::text,'') from public.get_notifications() where target_id='$CM'")"
CL=$(as $C authenticated "select id from public.create_comment('listing','$L1','listing remark')")
SU "insert into public.notifications (user_id, type, target_type, target_id, data)
    values ('$C','content_removed','comment','$CL','{\"reason\":\"spam\"}')" >/dev/null
eq "listing comment notice parent"      "$L1" "$(as $C authenticated "select parent_listing_id from public.get_notifications() where target_id='$CL'")"
as $B authenticated "select public.delete_own_comment('$CM')" >/dev/null
eq "deleted comment: target gone"       "f" "$(as $B authenticated "select target_exists from public.get_notifications() where target_id='$CM'")"

echo "== purge"
SU "update public.notifications set created_at = now() - interval '91 days' where type='content_rejected'" >/dev/null
chk "purge reports notifications"        "\"notifications\": 1" "$(SU "select public.purge_expired()")"
eq "old notification removed"            "0" "$(SU "select count(*) from public.notifications where type='content_rejected'")"
eq "recent ones kept"                    "1" "$(N "select count(*) from public.get_notifications() where type='comment' and target_id='$L1'")"

echo "== regression: blocked reactor gets no notification"
as $A authenticated "insert into public.user_blocks (blocker_id, blocked_id) values ('$A','$D')" >/dev/null
BEFORE=$(SU "select count(*) from public.notifications where user_id='$A'")
as $D authenticated "select public.set_reaction('$P2','love')" >/dev/null
eq "no notification from blocked reactor" "$BEFORE" "$(SU "select count(*) from public.notifications where user_id='$A'")"

echo; echo "RESULT: $pass passed, $fail failed"; [[ $fail -eq 0 ]]
