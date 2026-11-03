#!/usr/bin/env bash
# Tests for 20261023110000_lost_found_type.sql. Also proves the backfill on rows created before the migration.
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_lft

psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/tests/00_supabase_stub.sql" 2>/dev/null || { echo "stub failed"; exit 1; }
for f in 20261021000000_v1_schema 20261022100000_feed_events 20261022110000_allow_three_images 20261023100000_lost_found_manila_date; do
  psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/$f.sql" 2>&1 | grep -v NOTICE
done

SU() { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }

U=eeeeeeee-0000-4000-8000-000000000001
SU "insert into auth.users (id, email, raw_user_meta_data) values ('$U','a@unm.test','{\"nickname\":\"user_a\"}')" >/dev/null
TODAY=$(SU "select (now() at time zone 'Asia/Manila')::date")
# A Lost & Found row and a sell row that exist BEFORE the migration (old 8-argument function).
as $U authenticated "select 1 from public.create_listing('lost_found','Old wallet',null,null,null,'Library','$TODAY')" >/dev/null
as $U authenticated "select 1 from public.create_listing('sell','Old desk',null,100,'good')" >/dev/null

psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/20261023110000_lost_found_type.sql" 2>&1 | grep -v NOTICE

echo "== backfill"
chk "existing Lost & Found row becomes 'lost'" "lost" "$(SU "select lost_found_type from public.listings where title='Old wallet'")"
chk "existing sell row stays null"              "" "$(SU "select coalesce(lost_found_type,'') from public.listings where title='Old desk'")"

echo "== create_listing"
lf() { as $U authenticated "select lost_found_type from public.create_listing('lost_found','Item',null,null,null,'Cafeteria','$TODAY','[]'::jsonb,'$1')"; }
chk "lost accepted"                 "lost"  "$(lf lost)"
chk "found accepted"                "found" "$(lf found)"
chk "missing type rejected"         "lost_found_type_required" "$(as $U authenticated "select * from public.create_listing('lost_found','Item',null,null,null,'Cafeteria','$TODAY')")"
chk "bad type rejected"             "lost_found_type_required" "$(lf stolen)"
chk "date rules still apply"        "invalid_lost_found" "$(as $U authenticated "select * from public.create_listing('lost_found','Item',null,null,null,'Cafeteria','$TODAY'::date + 1,'[]'::jsonb,'lost')")"
chk "sell ignores the type"         "" "$(as $U authenticated "select coalesce(lost_found_type,'') from public.create_listing('sell','Chair',null,10,'good',null,null,'[]'::jsonb,'found')")"
chk "sell without type still works" "published" "$(as $U authenticated "select status from public.create_listing('sell','Lamp',null,10,'good')")"

echo "== constraint (bypassing the RPC, as postgres)"
chk "lost_found without type blocked" "listings_lf_type" "$(SU "insert into public.listings (kind, author_id, title, location, event_date, status, published_at) values ('lost_found','$U','x','y',current_date,'published',now())")"
chk "sell with a type blocked"        "listings_lf_type" "$(SU "insert into public.listings (kind, author_id, title, price, condition, lost_found_type, status, published_at) values ('sell','$U','x',1,'good','lost','published',now())")"

echo "== view and feed"
chk "feed_listings exposes the column"  "found" "$(as '' anon "select lost_found_type from public.get_listings('lost_found') where title='Item' and lost_found_type='found' limit 1")"
chk "get_listings still works for guests" "2" "$(as '' anon "select count(*) from public.get_listings('lost_found') where title='Item'")"
chk "get_listings sell unaffected"      "t" "$(as '' anon "select count(*) >= 1 from public.get_listings('sell')")"

echo "== privileges"
chk "old 8-arg function is gone"        "0" "$(SU "select count(*) from pg_proc where proname='create_listing' and pronargs=8")"
chk "guest cannot call create_listing"  "permission denied" "$(as '' anon "select * from public.create_listing('sell','x',null,1,'good')")"
chk "member can call it"                "published" "$(as $U authenticated "select status from public.create_listing('sell','Fan',null,10,'good')")"

echo; echo "RESULT: $pass passed, $fail failed"; [[ $fail -eq 0 ]]
