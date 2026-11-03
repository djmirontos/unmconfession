#!/usr/bin/env bash
# Tests for 20261031120000_push_cleanup_on_delete.sql (new file runs in ONE transaction like the SQL editor).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_pc
psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/tests/00_supabase_stub.sql" 2>/dev/null || { echo "stub failed"; exit 1; }
for f in $(ls "$HERE"/migrations/*.sql | sort | awk -v own=20261031120000 '{ n=$0; sub(/.*\//,"",n); if (substr(n,1,14) < own) print }'); do
  psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$f" 2>&1 | grep -v NOTICE
done
psql -X -q -v ON_ERROR_STOP=1 -d $DB <<'SQL'
create schema net;
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
  headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint
language sql as $$ select 1::bigint $$;
SQL
echo "== apply new migration in one transaction"
psql -X -q -1 -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/20261031120000_push_cleanup_on_delete.sql" 2>&1 | grep -v NOTICE
SU() { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1 | grep -v '^SET$'; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }
eq()  { if [[ "$3" == "$2" ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }

A=77777777-0000-4000-8000-000000000001; B=77777777-0000-4000-8000-000000000002
for pair in "$A:del_a" "$B:keep_b"; do
  SU "insert into auth.users (id,email,raw_user_meta_data) values ('${pair%%:*}','${pair##*:}@unm.test','{\"nickname\":\"${pair##*:}\"}')" >/dev/null
done
TA='ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]'; TB='ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]'
as $A authenticated "select public.register_push_token('$TA','android')" >/dev/null
as $B authenticated "select public.register_push_token('$TB','android')" >/dev/null
as $A authenticated "select * from public.set_push_settings(p_deals := false)" >/dev/null
as $B authenticated "select * from public.set_push_settings(p_deals := false)" >/dev/null
SU "insert into public.notifications (user_id, type, target_type, target_id, actor_id) values ('$A','comment','post','77777777-0000-4000-8000-0000000000aa','$B')" >/dev/null
eq "outbox row exists for the member" "1" "$(SU "select count(*) from public.push_outbox where user_id='$A'")"

echo "== before"
eq "member has a token"      "1" "$(SU "select count(*) from public.push_tokens where user_id='$A'")"
eq "member has settings"     "1" "$(SU "select count(*) from public.push_settings where user_id='$A'")"

echo "== delete account"
as $A authenticated "select public.delete_my_account('del_a')" >/dev/null
eq "tokens erased"           "0" "$(SU "select count(*) from public.push_tokens where user_id='$A'")"
eq "settings erased"         "0" "$(SU "select count(*) from public.push_settings where user_id='$A'")"
eq "send log erased"         "0" "$(SU "select count(*) from public.push_outbox where user_id='$A'")"
eq "the token is gone for good (not just disabled)" "0" "$(SU "select count(*) from public.push_tokens where token='$TA'")"
eq "other member's token kept"    "1" "$(SU "select count(*) from public.push_tokens where user_id='$B'")"
eq "other member's settings kept" "1" "$(SU "select count(*) from public.push_settings where user_id='$B'")"
eq "account locked and marked deleted" "banned|account_deleted" "$(SU "select status||'|'||status_reason from public.user_flags where user_id='$A'")"
eq "own notifications still erased" "0" "$(SU "select count(*) from public.notifications where user_id='$A'")"
eq "auth user removed"       "0" "$(SU "select count(*) from auth.users where id='$A'")"

echo "== unchanged behaviour"
chk "wrong confirmation is still refused" "confirm_mismatch" "$(as $B authenticated "select public.delete_my_account('nope')")"
chk "guests still cannot delete" "permission denied" "$(as '' anon "select public.delete_my_account('x')")"
chk "members can still call it"  "t" "$(SU "select has_function_privilege('authenticated','public.delete_my_account(text)','EXECUTE')::text" | cut -c1)"
eq "other member's data survived the refused attempt" "1" "$(SU "select count(*) from public.push_tokens where user_id='$B'")"
as $B authenticated "select public.delete_my_account('keep_b')" >/dev/null
eq "second member deleted too" "0" "$(SU "select count(*) from public.push_tokens")"

echo; echo "passed: $pass  failed: $fail"; [[ $fail -eq 0 ]]
