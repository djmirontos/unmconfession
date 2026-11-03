#!/usr/bin/env bash
# Tests for 20261023100000_lost_found_manila_date.sql (stub + all migrations on a fresh DB).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_md

psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/tests/00_supabase_stub.sql" 2>/dev/null || { echo "stub failed"; exit 1; }
for f in 20261021000000_v1_schema 20261022100000_feed_events 20261022110000_allow_three_images 20261023100000_lost_found_manila_date; do
  psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/$f.sql" 2>&1 | grep -v NOTICE
done

SU() { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }

U=dddddddd-0000-4000-8000-000000000001
SU "insert into auth.users (id, email, raw_user_meta_data) values ('$U','a@unm.test','{\"nickname\":\"user_a\"}')" >/dev/null
TODAY=$(SU "select (now() at time zone 'Asia/Manila')::date")
lf() { as $U authenticated "select status from public.create_listing('lost_found','Wallet',null,null,null,'Library','$1')"; }

echo "== Lost & Found date (Manila today = $TODAY)"
chk "today (Manila) accepted"        "published" "$(lf "$TODAY")"
chk "yesterday accepted"             "published" "$(lf "$(SU "select '$TODAY'::date - 1")")"
chk "60 days ago accepted"           "published" "$(lf "$(SU "select '$TODAY'::date - 60")")"
chk "61 days ago rejected"           "invalid_lost_found" "$(lf "$(SU "select '$TODAY'::date - 61")")"
chk "tomorrow (Manila) rejected"     "invalid_lost_found" "$(lf "$(SU "select '$TODAY'::date + 1")")"
chk "missing date rejected"          "invalid_lost_found" "$(as $U authenticated "select * from public.create_listing('lost_found','Wallet',null,null,null,'Library',null)")"
chk "missing location rejected"      "invalid_lost_found" "$(as $U authenticated "select * from public.create_listing('lost_found','Wallet',null,null,null,null,'$TODAY')")"

echo "== sell unaffected"
chk "sell ignores event date"        "published" "$(as $U authenticated "select status from public.create_listing('sell','Desk',null,500,'good',null,'2000-01-01')")"
chk "sell still needs price"         "invalid_price" "$(as $U authenticated "select * from public.create_listing('sell','Desk',null,null,'good')")"

echo "== privileges"
chk "guest cannot call create_listing" "permission denied" "$(as '' anon "select * from public.create_listing('sell','x',null,1,'good')")"
chk "member can (grant kept)"          "published" "$(as $U authenticated "select status from public.create_listing('sell','Chair',null,10,'good')")"

echo; echo "RESULT: $pass passed, $fail failed"; [[ $fail -eq 0 ]]
