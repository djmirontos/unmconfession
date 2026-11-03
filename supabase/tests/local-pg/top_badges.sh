#!/usr/bin/env bash
# Tests for 20261030120000_top_badges.sql (new file runs in ONE transaction like the SQL editor).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_tb
psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/tests/00_supabase_stub.sql" 2>/dev/null || { echo "stub failed"; exit 1; }
for f in $(ls "$HERE"/migrations/*.sql | sort | awk -v own=20261030120000 '{ n=$0; sub(/.*\//,"",n); if (substr(n,1,14) < own) print }'); do
  psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$f" 2>&1 | grep -v NOTICE
done
echo "== apply new migration in one transaction"
psql -X -q -1 -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/20261030120000_top_badges.sql" 2>&1 | grep -v NOTICE
SU() { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }
uid() { printf 'eeeeeeee-0000-4000-8000-%012d' "$1"; }
V=$(uid 1); STAFF=$(uid 2); MULTI=$(uid 3); NIGHT=$(uid 4); NONE=$(uid 5); BAN=$(uid 6); BLK=$(uid 7); DEL=$(uid 8); STAFFB=$(uid 9)
for i in 1 2 3 4 5 6 7 8 9; do SU "insert into auth.users (id,email,raw_user_meta_data) values ('$(uid $i)','t$i@unm.test','{\"nickname\":\"tester$i\"}')" >/dev/null; done
SU "update public.user_flags set role='admin' where user_id='$STAFF'; update public.user_flags set role='moderator' where user_id='$STAFFB'" >/dev/null
SU "insert into public.user_badges (user_id,badge_code) values
  ('$STAFF','first_circle'),
  ('$MULTI','campus_regular'),('$MULTI','campus_voice'),('$MULTI','first_circle'),
  ('$NIGHT','nocturnal'),
  ('$BAN','first_circle'),('$BLK','first_circle'),('$DEL','first_circle')" >/dev/null
SU "update public.user_flags set status='banned' where user_id='$BAN'; update public.user_flags set deleted_at=now() where user_id='$DEL'" >/dev/null
SU "insert into public.user_blocks (blocker_id,blocked_id) values ('$V','$BLK')" >/dev/null
ALL="array['$STAFF','$MULTI','$NIGHT','$NONE','$BAN','$BLK','$DEL','$STAFFB']::uuid[]"
R=$(as $V authenticated "select user_id||'|'||code||'|'||name from public.get_top_badges($ALL) order by 1")

echo "== access"
chk "guest denied"                    "permission denied" "$(as '' anon "select * from public.get_top_badges($ALL)")"
chk "authenticated allowed"           "|" "$R"
echo "== priority"
chk "admin label beats first_circle"  "$STAFF|admin|Admin" "$R"
chk "moderator label with no badge"   "$STAFFB|moderator|Moderator" "$R"
chk "lowest sort_order wins"          "$MULTI|first_circle|First Circle" "$R"
chk "one row per user"                "2" "$(echo "$R" | grep -c "$STAFF\|$MULTI" | head -1)"
echo "== exclusions"
chk "nocturnal only -> no row"        "0" "$(echo "$R" | grep -c "$NIGHT")"
chk "no badge -> no row"              "0" "$(echo "$R" | grep -c "$NONE")"
chk "banned hidden"                   "0" "$(echo "$R" | grep -c "$BAN")"
chk "deleted hidden"                  "0" "$(echo "$R" | grep -c "$DEL")"
chk "blocked by viewer hidden"        "0" "$(echo "$R" | grep -c "$BLK")"
chk "others still see blocked user"   "$BLK|first_circle" "$(as $MULTI authenticated "select user_id||'|'||code from public.get_top_badges(array['$BLK']::uuid[])")"
chk "total rows = 3"                  "3" "$(echo "$R" | grep -c .)"
echo "== input handling"
chk "empty array -> empty"            "0" "$(as $V authenticated "select count(*) from public.get_top_badges(array[]::uuid[])")"
chk "null -> empty"                   "0" "$(as $V authenticated "select count(*) from public.get_top_badges(null)")"
chk "unknown ids ignored"             "0" "$(as $V authenticated "select count(*) from public.get_top_badges(array['ffffffff-0000-4000-8000-000000000001']::uuid[])")"
BIG=$(SU "select 'array[' || string_agg(quote_literal('$MULTI'), ',') || ']::uuid[]' from generate_series(1,150)")
chk "150 ids is fine"                 "1" "$(as $V authenticated "select count(*) from public.get_top_badges($BIG)")"
echo; echo "passed: $pass  failed: $fail"; [[ $fail -eq 0 ]]
