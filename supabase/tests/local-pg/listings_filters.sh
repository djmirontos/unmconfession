#!/usr/bin/env bash
# Tests for 20261025130000_listings_filters.sql
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_lf

psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/tests/00_supabase_stub.sql" 2>/dev/null || { echo "stub failed"; exit 1; }
for f in 20261021000000_v1_schema 20261022100000_feed_events 20261022110000_allow_three_images 20261023100000_lost_found_manila_date 20261023110000_lost_found_type 20261023120000_edit_delete_own 20261023130000_comments_edit_delete 20261024100000_poll_vote_change 20261024110000_block_filtering 20261024120000_notifications 20261025100000_comment_reactions 20261025110000_top_reactions 20261025120000_comment_replies 20261025130000_listings_filters; do
  [[ $f == 20261024110000_block_filtering ]] && psql -X -q -d $DB -c "revoke all on public.user_blocks from anon"
  psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/$f.sql" 2>&1 | grep -v NOTICE
done

SU() { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }
eq()  { if [[ "$3" == "$2" ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }

S=22222222-8888-4000-8000-000000000001   # seller
V=22222222-8888-4000-8000-000000000002   # viewer
X=22222222-8888-4000-8000-000000000003   # another seller
for pair in "$S:seller_s" "$V:viewer_v" "$X:seller_x"; do
  SU "insert into auth.users (id,email,raw_user_meta_data) values ('${pair%%:*}','${pair##*:}@unm.test','{\"nickname\":\"${pair##*:}\"}')" >/dev/null
done
TODAY="(now() at time zone 'Asia/Manila')::date"
mk()  { as "$1" authenticated "select id from public.create_listing('sell','$2','$3',$4,'good')"; }
lf()  { as "$1" authenticated "select id from public.create_listing('lost_found','$2','$3',null,null,'$4',$TODAY,'[]','$5')"; }

B1=$(mk $S "Blue Bike" "Mountain bike, barely used" 3000)
B2=$(mk $S "Desk lamp" "50% off, call me_now" 150)
B3=$(mk $X "Calculus book" "Stewart 8th edition" 400)
B4=$(mk $X "Old guitar" "needs new strings" 900)
as $X authenticated "select public.set_listing_closed('$B4', true)" >/dev/null
L1=$(lf $S "Lost keys" "Silver keyring with a red tag" "Library" lost)
L2=$(lf $X "Found umbrella" "Black umbrella" "Main gate" found)
L3=$(lf $X "Found wallet" "Brown wallet" "Cafeteria" found)
as $X authenticated "select public.set_listing_closed('$L3', true)" >/dev/null
cnt() { as "$1" "$2" "select count(*) from public.get_listings($3)"; }

echo "== old behaviour is unchanged"
eq "sell: all 4 by default"            "4" "$(cnt $V authenticated "'sell'")"
eq "lost_found: all 3 by default"      "3" "$(cnt $V authenticated "'lost_found'")"
eq "newest first"                      "Old guitar" "$(as $V authenticated "select title from public.get_listings('sell') limit 1")"
eq "old 4-argument call still works"   "2" "$(as $V authenticated "select count(*) from public.get_listings('sell', null, null, 2)")"
eq "the old overload is gone"          "1" "$(SU "select count(*) from pg_proc where proname='get_listings' and pronamespace='public'::regnamespace")"

echo "== lost / found filter"
eq "lost only"                         "1" "$(cnt $V authenticated "'lost_found', null, null, 20, 'lost'")"
eq "found only"                        "2" "$(cnt $V authenticated "'lost_found', null, null, 20, 'found'")"
eq "found + hide closed"               "1" "$(cnt $V authenticated "'lost_found', null, null, 20, 'found', false")"
eq "unknown type returns nothing"      "0" "$(cnt $V authenticated "'lost_found', null, null, 20, 'xyz'")"
eq "type filter on sell finds nothing" "0" "$(cnt $V authenticated "'sell', null, null, 20, 'lost'")"

echo "== include sold"
eq "hide sold"                         "3" "$(cnt $V authenticated "'sell', null, null, 20, null, false")"
eq "include sold"                      "4" "$(cnt $V authenticated "'sell', null, null, 20, null, true")"
eq "null means include"                "4" "$(cnt $V authenticated "'sell', null, null, 20, null, null")"
eq "sold item is the hidden one"       "0" "$(as $V authenticated "select count(*) from public.get_listings('sell', null, null, 20, null, false) where id='$B4'")"

echo "== search"
eq "title, case-insensitive"           "$B1" "$(as $V authenticated "select id from public.get_listings('sell', null, null, 20, null, true, 'BLUE bike')")"
eq "partial word"                      "$B3" "$(as $V authenticated "select id from public.get_listings('sell', null, null, 20, null, true, 'calc')")"
eq "description is searched"           "$B1" "$(as $V authenticated "select id from public.get_listings('sell', null, null, 20, null, true, 'mountain')")"
eq "place is searched (lost & found)"  "$L1" "$(as $V authenticated "select id from public.get_listings('lost_found', null, null, 20, null, true, 'library')")"
eq "surrounding spaces are ignored"    "$B3" "$(as $V authenticated "select id from public.get_listings('sell', null, null, 20, null, true, '   calc  ')")"
eq "empty search means no filter"      "4" "$(cnt $V authenticated "'sell', null, null, 20, null, true, '   '")"
eq "no match"                          "0" "$(cnt $V authenticated "'sell', null, null, 20, null, true, 'zzzz'")"
eq "% is plain text, not a wildcard"   "$B2" "$(as $V authenticated "select id from public.get_listings('sell', null, null, 20, null, true, '50% off')")"
eq "_ is plain text"                   "$B2" "$(as $V authenticated "select id from public.get_listings('sell', null, null, 20, null, true, 'me_now')")"
eq "a lone % matches only real %"      "$B2" "$(as $V authenticated "select id from public.get_listings('sell', null, null, 20, null, true, '%')")"
eq "quotes are safe"                   "0" "$(cnt $V authenticated "'sell', null, null, 20, null, true, '''; drop table x; --'")"
eq "search is limited to 60 chars"     "0" "$(cnt $V authenticated "'sell', null, null, 20, null, true, '$(printf 'a%.0s' $(seq 1 200))'")"
eq "search + hide sold"                "0" "$(as $V authenticated "select count(*) from public.get_listings('sell', null, null, 20, null, false, 'guitar')")"
eq "search + type"                     "$L2" "$(as $V authenticated "select id from public.get_listings('lost_found', null, null, 20, 'found', true, 'umbrella')")"

echo "== paging with filters"
FIRST=$(as $V authenticated "select published_at||'|'||id from public.get_listings('sell', null, null, 2, null, false) offset 1 limit 1")
TS="${FIRST%%|*}"; ID="${FIRST#*|}"
eq "page 1 has 2"                      "2" "$(as $V authenticated "select count(*) from public.get_listings('sell', null, null, 2, null, false)")"
eq "page 2 continues (hide sold)"      "1" "$(as $V authenticated "select count(*) from public.get_listings('sell', '$TS', '$ID', 2, null, false)")"
eq "page 2 holds the oldest"           "$B1" "$(as $V authenticated "select id from public.get_listings('sell', '$TS', '$ID', 2, null, false)")"

echo "== blocking, guests, limits"
as $V authenticated "insert into public.user_blocks (blocker_id, blocked_id) values ('$V','$X')" >/dev/null
eq "blocked seller's listings hidden"  "2" "$(cnt $V authenticated "'sell'")"
eq "others still see them"             "4" "$(cnt $S authenticated "'sell'")"
eq "guests can browse"                 "4" "$(cnt '' anon "'sell'")"
eq "guests can search"                 "$B1" "$(as '' anon "select id from public.get_listings('sell', null, null, 20, null, true, 'blue')")"
eq "limit is capped at 50"             "4" "$(cnt $S authenticated "'sell', null, null, 1000")"
eq "limit floor is 1"                  "1" "$(cnt $S authenticated "'sell', null, null, 0")"

echo; echo "RESULT: $pass passed, $fail failed"; [[ $fail -eq 0 ]]
