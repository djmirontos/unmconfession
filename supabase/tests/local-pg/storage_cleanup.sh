#!/usr/bin/env bash
# Tests for 20261029190000_storage_cleanup_functions.sql (the new file runs in ONE transaction like the SQL editor).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_sc
psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/tests/00_supabase_stub.sql" 2>/dev/null || { echo "stub failed"; exit 1; }
for f in $(ls "$HERE"/migrations/*.sql | sort | grep -v 20261029190000); do
  psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$f" 2>&1 | grep -v NOTICE
done
echo "== apply new migration in one transaction"
psql -X -q -1 -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/20261029190000_storage_cleanup_functions.sql" 2>&1 | grep -v NOTICE
SU() { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }
sr() { as '' service_role "$1"; }

U=11111111-2222-4333-8444-555555555555
SU "insert into public.storage_cleanup_queue (bucket, path, queued_at) values
  ('avatars','$U/c_0123456789ab.jpg', now() - interval '5 min'),
  ('post-images','$U/photo_1.jpg',    now() - interval '4 min'),
  ('post-images','$U/photo-2.webp',   now() - interval '3 min'),
  ('avatars','$U/avatar_01.jpg',      now() - interval '2 min'),
  ('private-docs','$U/secret.pdf',    now() - interval '1 min'),
  ('post-images','../etc/passwd',     now()),
  ('post-images','$U/../other/x.jpg', now())" >/dev/null

echo "== access"
chk "members cannot claim"           "permission denied" "$(as $U authenticated "select * from public.cleanup_claim_batch()")"
chk "guests cannot claim"            "permission denied" "$(as '' anon "select * from public.cleanup_claim_batch()")"
chk "members cannot peek"            "permission denied" "$(as $U authenticated "select * from public.cleanup_peek_batch()")"
chk "members cannot mark done"       "permission denied" "$(as $U authenticated "select public.cleanup_mark_done('{1}')")"
chk "members cannot read stats"      "permission denied" "$(as $U authenticated "select * from public.cleanup_queue_stats()")"
chk "queue not readable by members"  "permission denied" "$(as $U authenticated "select * from public.storage_cleanup_queue")"

echo "== peek is read-only and filters"
chk "peek returns only valid rows in order" "avatars|$U/c_0123456789ab.jpg"$'\n'"post-images|$U/photo_1.jpg"$'\n'"post-images|$U/photo-2.webp" "$(sr "select bucket, path from public.cleanup_peek_batch()")"
chk "peek does not count attempts"   "0" "$(SU "select coalesce(max(attempts),0) from public.storage_cleanup_queue where attempts < 99")"
chk "peek respects the limit"        "1" "$(sr "select count(*) from public.cleanup_peek_batch(1)")"
chk "peek clamps a bad limit"        "1" "$(sr "select count(*) from public.cleanup_peek_batch(0)")"

echo "== claim"
chk "claim returns the valid rows"   "avatars|$U/c_0123456789ab.jpg"$'\n'"post-images|$U/photo_1.jpg"$'\n'"post-images|$U/photo-2.webp" "$(sr "select bucket, path from public.cleanup_claim_batch()")"
chk "claim counted an attempt"       "1" "$(SU "select attempts from public.storage_cleanup_queue where path='$U/photo_1.jpg'")"
chk "wrong shapes are parked as dead" "4" "$(SU "select count(*) from public.storage_cleanup_queue where attempts = 99")"
chk "parked rows are never returned" "3" "$(sr "select count(*) from public.cleanup_claim_batch()")"
chk "second claim counted again"     "2" "$(SU "select attempts from public.storage_cleanup_queue where path='$U/photo_1.jpg'")"
sr "select count(*) from public.cleanup_claim_batch()" >/dev/null; sr "select count(*) from public.cleanup_claim_batch()" >/dev/null; sr "select count(*) from public.cleanup_claim_batch()" >/dev/null
chk "after 5 attempts a row stops being returned" "0" "$(sr "select count(*) from public.cleanup_claim_batch()")"
chk "stats: none pending, dead rows counted" "0|7" "$(sr "select pending||'|'||dead from public.cleanup_queue_stats()")"

echo "== mark done"
chk "three rows reached 5 attempts"    "3" "$(SU "select count(*) from public.storage_cleanup_queue where attempts = 5")"
chk "mark done returns the count"    "2" "$(sr "select public.cleanup_mark_done(array(select id from public.storage_cleanup_queue where path in ('$U/photo_1.jpg','$U/photo-2.webp')))")"
chk "rows are gone"                  "0" "$(SU "select count(*) from public.storage_cleanup_queue where path in ('$U/photo_1.jpg','$U/photo-2.webp')")"
chk "null ids delete nothing"        "0" "$(sr "select public.cleanup_mark_done(null)")"

echo "== limits and fresh rows"
SU "insert into public.storage_cleanup_queue (bucket, path) select 'post-images', '$U/bulk_'||g||'.jpg' from generate_series(1,250) g" >/dev/null
chk "batch size is capped at 200"    "200" "$(sr "select count(*) from public.cleanup_claim_batch(1000)")"
chk "remaining pending"              "50|" "$(sr "select pending||'|' from public.cleanup_queue_stats()")"

echo; echo "passed: $pass  failed: $fail"; [[ $fail -eq 0 ]]
