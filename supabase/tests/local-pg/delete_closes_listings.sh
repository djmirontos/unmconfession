#!/usr/bin/env bash
# Tests for 20261026120000_delete_account_closes_listings.sql
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_dl
psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/tests/00_supabase_stub.sql" 2>/dev/null || { echo "stub failed"; exit 1; }
for f in 20261021000000_v1_schema 20261022100000_feed_events 20261022110000_allow_three_images 20261023100000_lost_found_manila_date 20261023110000_lost_found_type 20261023120000_edit_delete_own 20261023130000_comments_edit_delete 20261024100000_poll_vote_change 20261024110000_block_filtering 20261024120000_notifications 20261025100000_comment_reactions 20261025110000_top_reactions 20261025120000_comment_replies 20261025130000_listings_filters 20261026100000_account_settings 20261026110000_nickname_keywords 20261026120000_delete_account_closes_listings; do
  [[ $f == 20261024110000_block_filtering ]] && psql -X -q -d $DB -c "revoke all on public.user_blocks from anon"
  psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/$f.sql" 2>&1 | grep -v NOTICE
done
SU() { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }
eq()  { if [[ "$3" == "$2" ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }
A=55555555-9999-4000-8000-000000000001; B=55555555-9999-4000-8000-000000000002; V=55555555-9999-4000-8000-000000000003
for pair in "$A:alice_a" "$B:bob_b" "$V:vic_v"; do
  SU "insert into auth.users (id,email,raw_user_meta_data) values ('${pair%%:*}','${pair##*:}@unm.test','{\"nickname\":\"${pair##*:}\"}')" >/dev/null
done
TODAY="(now() at time zone 'Asia/Manila')::date"
S1=$(as $A authenticated "select id from public.create_listing('sell','Bike','good bike',3000,'good')")
S2=$(as $A authenticated "select id from public.create_listing('sell','Lamp','old lamp',100,'fair')")
L1=$(as $A authenticated "select id from public.create_listing('lost_found','Keys','silver',null,null,'Library',$TODAY,'[]','lost')")
SB=$(as $B authenticated "select id from public.create_listing('sell','Book','a book',400,'good')")
as $A authenticated "select public.set_listing_closed('$S2', true)" >/dev/null
EDIT_BEFORE=$(SU "select coalesce(edited_at::text,'') from public.listings where id='$S1'")
chk "A's open listings: 2 before" "2" "$(SU "select count(*) from public.listings where author_id='$A' and not is_closed")"
as $A authenticated "select public.delete_my_account('alice_a')" >/dev/null
eq "account deleted"                    "0" "$(SU "select count(*) from auth.users where id='$A'")"
eq "all of A's listings are closed"     "0" "$(SU "select count(*) from public.listings where author_id='$A' and not is_closed")"
eq "A's listings still exist"           "3" "$(SU "select count(*) from public.listings where author_id='$A'")"
eq "...and are still published"         "3" "$(SU "select count(*) from public.listings where author_id='$A' and status='published'")"
eq "the sold one stays closed"          "true" "$(SU "select is_closed::text from public.listings where id='$S2'")"
eq "lost & found closed too"            "true" "$(SU "select is_closed::text from public.listings where id='$L1'")"
eq "closing is not shown as an edit"    "$EDIT_BEFORE" "$(SU "select coalesce(edited_at::text,'') from public.listings where id='$S1'")"
eq "B's listing untouched"              "false" "$(SU "select is_closed::text from public.listings where id='$SB'")"
eq "guests see A's listing as closed"   "true" "$(as '' anon "select is_closed::text from public.feed_listings where id='$S1'")"
eq "...with no nickname"                "" "$(as '' anon "select coalesce(nickname,'') from public.feed_listings where id='$S1'")"
eq "'hide sold' hides them"             "1" "$(as $V authenticated "select count(*) from public.get_listings('sell', null, null, 20, null, false)")"
chk "a refused delete changes nothing"  "confirm_mismatch" "$(as $B authenticated "select public.delete_my_account('wrong')")"
eq "...B's listing is still open"       "false" "$(SU "select is_closed::text from public.listings where id='$SB'")"
chk "second delete is not_found"        "not_found" "$(as $A authenticated "select public.delete_my_account('delete')")"
chk "execute still limited to signed-in" "permission denied" "$(as '' anon "select public.delete_my_account('x')")"
echo; echo "RESULT: $pass passed, $fail failed"; [[ $fail -eq 0 ]]
