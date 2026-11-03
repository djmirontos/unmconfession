#!/usr/bin/env bash
# Tests for 20261024110000_block_filtering.sql (stub + all migrations on a fresh DB).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_bl

psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/tests/00_supabase_stub.sql" 2>/dev/null || { echo "stub failed"; exit 1; }
for f in 20261021000000_v1_schema 20261022100000_feed_events 20261022110000_allow_three_images 20261023100000_lost_found_manila_date 20261023110000_lost_found_type 20261023120000_edit_delete_own 20261023130000_comments_edit_delete 20261024100000_poll_vote_change 20261024110000_block_filtering; do
  # Real Supabase grants user_blocks to authenticated only; the stub grants everything, so mimic the real schema.
  [[ $f == 20261024110000_block_filtering ]] && psql -X -q -d $DB -c "revoke all on public.user_blocks from anon"
  psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/$f.sql" 2>&1 | grep -v NOTICE
done

SU() { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }

A=cccccccc-3333-4000-8000-000000000001   # the author who gets blocked
B=cccccccc-3333-4000-8000-000000000002   # the blocker
C=cccccccc-3333-4000-8000-000000000003   # bystander
M=cccccccc-3333-4000-8000-000000000004   # moderator
SU "insert into auth.users (id, email, raw_user_meta_data) values
  ('$A','a@unm.test','{\"nickname\":\"author_a\"}'),('$B','b@unm.test','{\"nickname\":\"blocker_b\"}'),
  ('$C','c@unm.test','{\"nickname\":\"bystander_c\"}'),('$M','m@unm.test','{\"nickname\":\"mod_m\"}');
  update public.user_flags set role='moderator' where user_id='$M';" >/dev/null

PA=$(as $A authenticated "select id from public.create_post('confession','post by A')")
PC=$(as $C authenticated "select id from public.create_post('confession','post by C')")
POLLA=$(as $A authenticated "select id from public.create_post('poll','Poll by A?',null,'[]',array['x','y'],now()+interval '1 day')")
LA=$(as $A authenticated "select id from public.create_listing('sell','Desk by A',null,100,'good')")
CA=$(as $A authenticated "select id from public.create_comment('post','$PC','comment by A')")
CC=$(as $C authenticated "select id from public.create_comment('post','$PC','comment by C')")
feed() { as "$1" "$2" "select count(*) from public.get_feed(null,null,50) where id='$3'"; }

echo "== before blocking"
chk "B sees A's post"                 "1" "$(feed $B authenticated $PA)"
chk "B sees A's comment"              "1" "$(as $B authenticated "select count(*) from public.get_comments('post','$PC') where id='$CA'")"

echo "== block"
chk "B can block A"                   "" "$(as $B authenticated "insert into public.user_blocks (blocker_id, blocked_id) values ('$B','$A')" | grep -i error)"
chk "kind defaults to block"          "block" "$(SU "select kind from public.user_blocks where blocker_id='$B' and blocked_id='$A'")"
chk "cannot block yourself"           "violates check constraint" "$(as $B authenticated "insert into public.user_blocks (blocker_id, blocked_id) values ('$B','$B')")"
chk "cannot block on someone else's behalf" "row-level security" "$(as $C authenticated "insert into public.user_blocks (blocker_id, blocked_id) values ('$B','$C')")"
chk "feed hides A's post for B"       "0" "$(feed $B authenticated $PA)"
chk "feed still shows C's post to B"  "1" "$(feed $B authenticated $PC)"
chk "A's post still visible to others" "1" "$(feed $C authenticated $PA)"
G=$(feed '' anon $PA); [[ "$G" == "1" ]] && chk "A's post still visible to guests" "1" "$G" || chk "A's post still visible to guests" "exactly 1" "$G"
G=$(as '' anon "select count(*) from public.get_comments('post','$PC')"); [[ "$G" == "2" ]] && chk "guests read comments" "2" "$G" || chk "guests read comments" "exactly 2" "$G"
G=$(as '' anon "select count(*) from public.get_listings('sell')"); [[ "$G" =~ ^[0-9]+$ ]] && chk "guests read listings" "$G" "$G" || chk "guests read listings" "a number" "$G"
chk "A can still see their own post"  "1" "$(feed $A authenticated $PA)"
chk "active polls hide A's poll for B" "0" "$(as $B authenticated "select count(*) from public.get_active_polls(50) where id='$POLLA'")"
chk "active polls still show it to C" "1" "$(as $C authenticated "select count(*) from public.get_active_polls(50) where id='$POLLA'")"
chk "Buy & Sell hides A's listing for B" "0" "$(as $B authenticated "select count(*) from public.get_listings('sell') where id='$LA'")"
chk "Buy & Sell shows it to C"        "1" "$(as $C authenticated "select count(*) from public.get_listings('sell') where id='$LA'")"
chk "A's comment hidden from B"       "0" "$(as $B authenticated "select count(*) from public.get_comments('post','$PC') where id='$CA'")"
chk "C's comment still shown to B"    "1" "$(as $B authenticated "select count(*) from public.get_comments('post','$PC') where id='$CC'")"
chk "A's comment shown to C"          "1" "$(as $C authenticated "select count(*) from public.get_comments('post','$PC') where id='$CA'")"
SU "insert into public.trending_scores (post_id, score) values ('$PA', 5)" >/dev/null
chk "trending hides A's post for B"   "0" "$(as $B authenticated "select count(*) from public.get_trending(50) where id='$PA'")"
chk "trending shows it to C"          "1" "$(as $C authenticated "select count(*) from public.get_trending(50) where id='$PA'")"
chk "others cannot read B's blocks"   "0" "$(as $C authenticated "select count(*) from public.user_blocks")"
chk "B reads own blocks"              "1" "$(as $B authenticated "select count(*) from public.user_blocks")"

echo "== notifications"
PB=$(as $B authenticated "select id from public.create_post('confession','post by B')")
BEFORE=$(SU "select count(*) from public.notifications where user_id='$B'")
as $A authenticated "select public.create_comment('post','$PB','blocked comment')" >/dev/null
as $A authenticated "select public.set_reaction('$PB','love')" >/dev/null
chk "no notification from a blocked user" "$BEFORE" "$(SU "select count(*) from public.notifications where user_id='$B'")"
as $C authenticated "select public.create_comment('post','$PB','friendly comment')" >/dev/null
chk "notification from others still works" "$((BEFORE+1))" "$(SU "select count(*) from public.notifications where user_id='$B'")"
chk "blocked comment still counted"   "2" "$(SU "select comment_count from public.posts where id='$PB'")"

echo "== unblock"
as $B authenticated "delete from public.user_blocks where blocked_id='$A'" >/dev/null
chk "A's post is back for B"          "1" "$(feed $B authenticated $PA)"
chk "A's comment is back for B"       "1" "$(as $B authenticated "select count(*) from public.get_comments('post','$PC') where id='$CA'")"
chk "A's listing is back for B"       "1" "$(as $B authenticated "select count(*) from public.get_listings('sell') where id='$LA'")"

echo "== reports"
chk "report a post"                   "" "$(as $B authenticated "select public.report_content('post','$PA','bullying','mean words')" | grep -i error)"
chk "report row stored"               "bullying" "$(SU "select reason from public.reports where target_id='$PA' and reporter_id='$B'")"
chk "reporting twice is harmless"     "" "$(as $B authenticated "select public.report_content('post','$PA','spam')" | grep -i error)"
chk "still one report per user"       "1" "$(SU "select count(*) from public.reports where target_id='$PA' and reporter_id='$B'")"
chk "report a comment"                "" "$(as $B authenticated "select public.report_content('comment','$CA','doxxing')" | grep -i error)"
chk "report a listing"                "" "$(as $B authenticated "select public.report_content('listing','$LA','prohibited_item')" | grep -i error)"
chk "own content cannot be reported"  "own_content" "$(as $A authenticated "select public.report_content('post','$PA','spam')")"
chk "own comment cannot be reported"  "own_content" "$(as $A authenticated "select public.report_content('comment','$CA','spam')")"
chk "bad reason rejected"             "violates check constraint" "$(as $B authenticated "select public.report_content('post','$PC','nonsense')")"
chk "unknown target"                  "not_found" "$(as $B authenticated "select public.report_content('post','00000000-0000-4000-8000-000000000000','spam')")"
chk "guests cannot report"            "permission denied" "$(as '' anon "select public.report_content('post','$PA','spam')")"
chk "members cannot read reports"     "0" "$(as $B authenticated "select count(*) from public.reports")"
chk "staff can read reports"          "3" "$(as $M authenticated "select count(*) from public.reports")"

echo; echo "RESULT: $pass passed, $fail failed"; [[ $fail -eq 0 ]]
