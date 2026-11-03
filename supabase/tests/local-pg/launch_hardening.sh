#!/usr/bin/env bash
# Tests for 20261030180000_launch_hardening.sql (new file runs in ONE transaction like the SQL editor).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_lh
psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/tests/00_supabase_stub.sql" 2>/dev/null || { echo "stub failed"; exit 1; }
for f in $(ls "$HERE"/migrations/*.sql | sort | awk -v own=20261030180000 '{ n=$0; sub(/.*\//,"",n); if (substr(n,1,14) < own) print }'); do
  psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$f" 2>&1 | grep -v NOTICE
done
echo "== apply new migration in one transaction"
psql -X -q -1 -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/20261030180000_launch_hardening.sql" 2>&1 | grep -v NOTICE
SU() { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }

echo "== indexes"
for ix in reactions_user_idx comment_reactions_user_idx poll_votes_user_idx user_blocks_blocked_idx notifications_actor_idx comments_reply_to_idx feed_events_post_idx; do
  chk "index $ix exists" "1" "$(SU "select count(*) from pg_indexes where schemaname='public' and indexname='$ix'")"
done

echo "== trigger helpers are not callable"
for fn in comment_reactions_after_write comments_cascade_children profiles_avatar_guard; do
  chk "$fn: anon cannot execute"          "f" "$(SU "select has_function_privilege('anon','public.$fn()','EXECUTE')::text" | cut -c1)"
  chk "$fn: authenticated cannot execute" "f" "$(SU "select has_function_privilege('authenticated','public.$fn()','EXECUTE')::text" | cut -c1)"
done

echo "== things that must still be callable"
chk "is_staff still callable by anon"        "t" "$(SU "select has_function_privilege('anon','public.is_staff()','EXECUTE')::text" | cut -c1)"
chk "is_admin still callable by anon"        "t" "$(SU "select has_function_privilege('anon','public.is_admin()','EXECUTE')::text" | cut -c1)"
chk "nickname check callable by anon"        "t" "$(SU "select has_function_privilege('anon','public.is_nickname_available(text)','EXECUTE')::text" | cut -c1)"

chk "nickname check callable by authenticated" "t" "$(SU "select has_function_privilege('authenticated','public.is_nickname_available(text)','EXECUTE')::text" | cut -c1)"
chk "valid free nickname is available"   "t" "$(as '' anon "select public.is_nickname_available('free_name_1')")"
chk "invalid nickname is not available"  "f" "$(as '' anon "select public.is_nickname_available('x')")"
chk "no public (default) execute"        "f" "$(SU "select coalesce(bool_or(grantee = 0), false)::text from (select (aclexplode(proacl)).grantee as grantee from pg_proc where oid = 'public.is_nickname_available(text)'::regprocedure) g" | cut -c1)"

echo "== triggers still fire for members"
A=cdcdcdcd-0000-4000-8000-000000000001; B=cdcdcdcd-0000-4000-8000-000000000002
SU "insert into auth.users (id,email,raw_user_meta_data) values ('$A','a@unm.test','{\"nickname\":\"user_a\"}'),('$B','b@unm.test','{\"nickname\":\"user_b\"}')" >/dev/null
P=$(as $A authenticated "select id from public.create_post('confession','trigger test')" | head -1)
CM=$(as $A authenticated "select id from public.create_comment('post','$P','hello')" | head -1)
as $B authenticated "select public.set_reaction('$P','like')" >/dev/null
chk "post reaction counter trigger"   "1" "$(SU "select reaction_count from public.posts where id='$P'")"
as $B authenticated "select public.set_comment_reaction('$CM','love')" >/dev/null
chk "comment reaction counter trigger" "1" "$(SU "select count(*) from public.comment_reactions where comment_id='$CM'")"
chk "comment counter trigger"         "1" "$(SU "select comment_count from public.posts where id='$P'")"
chk "avatar guard still blocks bad key" "error" "$(as $A authenticated "update public.profiles set avatar_key='c_000000000000' where id='$A'" | tr 'A-Z' 'a-z' | grep -o 'error' | head -1)"

echo; echo "passed: $pass  failed: $fail"; [[ $fail -eq 0 ]]
