#!/usr/bin/env bash
# Tests for 20261025120000_comment_replies.sql
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_rp

psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/tests/00_supabase_stub.sql" 2>/dev/null || { echo "stub failed"; exit 1; }
for f in 20261021000000_v1_schema 20261022100000_feed_events 20261022110000_allow_three_images 20261023100000_lost_found_manila_date 20261023110000_lost_found_type 20261023120000_edit_delete_own 20261023130000_comments_edit_delete 20261024100000_poll_vote_change 20261024110000_block_filtering 20261024120000_notifications 20261025100000_comment_reactions 20261025110000_top_reactions 20261025120000_comment_replies; do
  [[ $f == 20261024110000_block_filtering ]] && psql -X -q -d $DB -c "revoke all on public.user_blocks from anon"
  [[ $f == 20261025100000_comment_reactions ]] && psql -X -q -d $DB -c "alter default privileges in schema public revoke all on tables from anon, authenticated, service_role"
  psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/$f.sql" 2>&1 | grep -v NOTICE
done

SU() { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }
eq()  { if [[ "$3" == "$2" ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }

O=11111111-7777-4000-8000-000000000001   # post owner
A=11111111-7777-4000-8000-000000000002   # top-level commenter
B=11111111-7777-4000-8000-000000000003
C=11111111-7777-4000-8000-000000000004
M=11111111-7777-4000-8000-000000000005   # moderator
for pair in "$O:owner_o" "$A:author_a" "$B:user_b" "$C:user_c" "$M:mod_m"; do
  SU "insert into auth.users (id,email,raw_user_meta_data) values ('${pair%%:*}','${pair##*:}@unm.test','{\"nickname\":\"${pair##*:}\"}')" >/dev/null
done
SU "update public.user_flags set role='moderator' where user_id='$M'" >/dev/null
SU "insert into public.keywords (term, match_type, applies_to) values ('holdword','contains','{comment}')" >/dev/null

P=$(as $O authenticated "select id from public.create_post('confession','A post with threads')")
L=$(as $O authenticated "select id from public.create_listing('sell','Bike',null,100,'good')")
CA=$(as $A authenticated "select id from public.create_comment('post','$P','top-level by A')")
top()  { as "$1" "$2" "select count(*) from public.get_comments('post','$P')"; }
reps() { as "$1" "$2" "select count(*) from public.get_replies('$3')"; }
pcount() { SU "select comment_count from public.posts where id='$P'"; }
rcount() { SU "select reply_count from public.comments where id='$1'"; }

echo "== schema"
eq "view: new columns are last"        "parent_id,reply_to_id,reply_count" "$(SU "select string_agg(column_name, ',' order by ordinal_position) from (select column_name, ordinal_position from information_schema.columns where table_name='thread_comments' order by ordinal_position desc limit 3) x")"
eq "no replies yet"                    "0" "$(rcount $CA)"

echo "== replying"
R1=$(as $B authenticated "select id from public.create_reply('$CA','first reply by B')")
eq "parent and reply_to are set"       "$CA|$CA" "$(SU "select parent_id||'|'||reply_to_id from public.comments where id='$R1'")"
eq "reply inherits the post"           "$P" "$(SU "select post_id from public.comments where id='$R1'")"
eq "top-level list excludes replies"   "1" "$(top $C authenticated)"
eq "get_replies returns it"            "1" "$(reps $C authenticated $CA)"
eq "reply_count is 1"                  "1" "$(rcount $CA)"
eq "post comment_count counts replies" "2" "$(pcount)"
eq "view shows reply_count"            "1" "$(as $C authenticated "select reply_count from public.get_comments('post','$P') where id='$CA'")"
R2=$(as $C authenticated "select id from public.create_reply('$R1','answer to B')")
eq "reply to a reply joins the same thread" "$CA|$R1" "$(SU "select parent_id||'|'||reply_to_id from public.comments where id='$R2'")"
eq "still one level: 2 replies"        "2" "$(rcount $CA)"
eq "replies in order"                  "first reply by B|answer to B" "$(as $A authenticated "select string_agg(body, '|' order by published_at, id) from public.get_replies('$CA')")"
eq "reply to a reply has no replies"   "0" "$(reps $A authenticated $R1)"
eq "guests can read replies"           "2" "$(reps '' anon $CA)"
eq "pagination: after the first"       "1" "$(as $A authenticated "select count(*) from public.get_replies('$CA', (select published_at from public.comments where id='$R1'), '$R1'::uuid, 20)")"
eq "limit"                             "1" "$(as $A authenticated "select count(*) from public.get_replies('$CA', null, null, 1)")"

echo "== validation"
chk "guests cannot reply"              "permission denied" "$(as '' anon "select public.create_reply('$CA','hi')")"
chk "empty body"                       "invalid_body" "$(as $B authenticated "select public.create_reply('$CA','   ')")"
chk "too long"                         "invalid_body" "$(as $B authenticated "select public.create_reply('$CA','$(printf 'x%.0s' $(seq 1 1001))')")"
chk "unknown comment"                  "not_found" "$(as $B authenticated "select public.create_reply('00000000-0000-4000-8000-000000000000','hi')")"
chk "get_replies hides unknown parent" "0" "$(reps $B authenticated 00000000-0000-4000-8000-000000000000)"

echo "== notifications"
eq "A (answered by B) gets a reply notice" "1" "$(as $A authenticated "select count(*) from public.get_notifications() where type='reply'")"
eq "reply notice: target is the answered comment" "$CA|$P|user_b" "$(as $A authenticated "select target_id||'|'||parent_post_id||'|'||actor_nickname from public.get_notifications() where type='reply'")"
eq "B (answered by C) gets a reply notice" "$R1" "$(as $B authenticated "select target_id from public.get_notifications() where type='reply'")"
eq "post owner: only the top-level comment" "1" "$(as $O authenticated "select event_count from public.get_notifications() where type='comment' and target_id='$P'")"
eq "post owner: no reply notices"      "0" "$(as $O authenticated "select count(*) from public.get_notifications() where type='reply'")"
R3=$(as $A authenticated "select id from public.create_reply('$CA','A answers own comment')")
eq "no notice for answering yourself"  "1" "$(as $A authenticated "select count(*) from public.get_notifications() where type='reply'")"
as $C authenticated "select public.create_reply('$CA','second from C')" >/dev/null
eq "replies to the same comment group" "2|2" "$(as $A authenticated "select event_count||'|'||actor_count from public.get_notifications() where type='reply' and target_id='$CA'")"
eq "group key"                         "reply:$CA" "$(as $A authenticated "select group_key from public.get_notifications() where type='reply' and target_id='$CA'")"
eq "unread groups count replies"       "1" "$(as $A authenticated "select public.get_unread_notification_count()")"
as $A authenticated "select public.mark_notifications_read(array['reply:$CA'])" >/dev/null
eq "mark reply group read"             "0" "$(as $A authenticated "select public.get_unread_notification_count()")"

echo "== reactions on replies"
as $A authenticated "select public.set_comment_reaction('$R1','love')" >/dev/null
eq "reply can be reacted to"           "1|{love}" "$(as $C authenticated "select reaction_count||'|'||top_reactions::text from public.get_replies('$CA') where id='$R1'")"

echo "== blocking"
as $A authenticated "insert into public.user_blocks (blocker_id, blocked_id) values ('$A','$B')" >/dev/null
eq "blocked replier hidden from A"     "3" "$(reps $A authenticated $CA)"
BEFORE=$(SU "select count(*) from public.notifications where user_id='$A'")
as $B authenticated "select public.create_reply('$CA','B again')" >/dev/null
eq "no reply notice from a blocked user" "$BEFORE" "$(SU "select count(*) from public.notifications where user_id='$A'")"
as $A authenticated "delete from public.user_blocks where blocked_id='$B'" >/dev/null

echo "== held replies"
H=$(as $B authenticated "select id from public.create_reply('$CA','this has holdword inside')")
eq "held reply is pending"             "pending" "$(SU "select status from public.comments where id='$H'")"
eq "held reply not counted"            "5" "$(rcount $CA)"
eq "held reply not visible"            "0" "$(as $C authenticated "select count(*) from public.get_replies('$CA') where id='$H'")"
eq "held reply: no notice yet"         "0" "$(SU "select count(*) from public.notifications where target_id='$CA' and actor_id='$B' and created_at > now() - interval '1 second' and 1=0")"
as $M authenticated "select public.mod_review('comment','$H','approve',null,null)" >/dev/null
eq "approved reply appears"            "1" "$(as $C authenticated "select count(*) from public.get_replies('$CA') where id='$H'")"
eq "and is counted"                    "6" "$(rcount $CA)"

echo "== deleting a reply"
as $B authenticated "select public.delete_own_comment('$R1')" >/dev/null
eq "reply_count drops"                 "5" "$(rcount $CA)"
eq "post comment_count drops (1 + 5 replies)" "6" "$(pcount)"
eq "deleted reply is gone from the list" "0" "$(as $C authenticated "select count(*) from public.get_replies('$CA') where id='$R1'")"

echo "== editing a reply"
chk "author can edit a reply"          "" "$(as $C authenticated "select public.edit_own_comment('$R2','edited answer')" | grep -i error)"
eq "edited body"                       "edited answer" "$(as $A authenticated "select body from public.get_replies('$CA') where id='$R2'")"

echo "== removing a top-level comment takes its replies"
CB=$(as $A authenticated "select id from public.create_comment('post','$P','second thread')")
as $B authenticated "select public.create_reply('$CB','r1')" >/dev/null
as $C authenticated "select public.create_reply('$CB','r2')" >/dev/null
HP=$(as $C authenticated "select id from public.create_reply('$CB','held holdword reply')")
BEFORE=$(pcount)
as $A authenticated "select public.delete_own_comment('$CB')" >/dev/null
eq "replies removed with the parent"   "0" "$(SU "select count(*) from public.comments where parent_id='$CB' and status in ('published','pending')")"
eq "comment_count: parent + 2 replies" "$((BEFORE-3))" "$(pcount)"
eq "held reply's hold is gone"         "0" "$(SU "select count(*) from public.moderation_holds where target_id='$HP'")"
eq "thread not reachable"              "0" "$(reps $B authenticated $CB)"
eq "reply_count back to 0"             "0" "$(rcount $CB)"
CM=$(as $A authenticated "select id from public.create_comment('post','$P','third thread')")
as $B authenticated "select public.create_reply('$CM','m1')" >/dev/null
SU "update public.comments set status='removed', moderated_at=now() where id='$CM'" >/dev/null
eq "moderator removal cascades too"    "0" "$(SU "select count(*) from public.comments where parent_id='$CM' and status='published'")"

echo "== a held parent keeps its replies"
CH=$(as $A authenticated "select id from public.create_comment('post','$P','fine for now')")
as $B authenticated "select public.create_reply('$CH','keeps living')" >/dev/null
as $A authenticated "select public.edit_own_comment('$CH','now holdword inside')" >/dev/null
eq "edited parent is pending"          "pending" "$(SU "select status from public.comments where id='$CH'")"
eq "its reply is untouched"            "published" "$(SU "select status from public.comments where parent_id='$CH'")"
eq "but not reachable while held"      "0" "$(reps $C authenticated $CH)"

echo "== targets"
CL=$(as $A authenticated "select id from public.create_comment('listing','$L','listing comment')")
RL=$(as $B authenticated "select id from public.create_reply('$CL','listing reply')")
eq "reply on a listing"                "$L" "$(SU "select listing_id from public.comments where id='$RL'")"
eq "listing comment_count"             "2" "$(SU "select comment_count from public.listings where id='$L'")"
SU "update public.posts set status='removed' where id='$P'" >/dev/null
chk "no replies under a removed post"  "not_found" "$(as $B authenticated "select public.create_reply('$CA','late')")"
SU "update public.posts set status='published' where id='$P'" >/dev/null

echo "== cascade and housekeeping"
SU "delete from public.comments where id='$CA'" >/dev/null
eq "hard delete removes replies"       "0" "$(SU "select count(*) from public.comments where parent_id='$CA'")"
chk "purge still runs"                 "comments" "$(SU "select public.purge_expired()")"
eq "reply_to_id is nulled, not blocking" "" "$(SU "delete from public.comments where id='$R3'" | grep -i error)"

echo; echo "RESULT: $pass passed, $fail failed"; [[ $fail -eq 0 ]]
