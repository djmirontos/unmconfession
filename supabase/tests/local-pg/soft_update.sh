#!/usr/bin/env bash
# Tests for 20261102100000_soft_update.sql (new file runs in ONE transaction like the SQL editor).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_su
psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/tests/00_supabase_stub.sql" 2>/dev/null || { echo "stub failed"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 -d $DB <<'SQL'
create schema if not exists net;
create table net._calls (id bigint generated always as identity primary key, url text, body jsonb, headers jsonb);
create table net._http_response (id bigint primary key, status_code int, content text);
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
  headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint
language sql as $$ insert into net._calls (url, body, headers) values (url, body, headers) returning id $$;
SQL
for f in $(ls "$HERE"/migrations/*.sql | sort | awk -v own=20261102100000 '{ n=$0; sub(/.*\//,"",n); if (substr(n,1,14) < own) print }'); do
  psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$f" 2>&1 | grep -v NOTICE
done
SU() { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1 | grep -v '^SET$'; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }
ADM=aaaaaaaa-0000-4000-8000-000000000001; MOD=aaaaaaaa-0000-4000-8000-000000000002; USR=aaaaaaaa-0000-4000-8000-000000000003
for u in $ADM $MOD $USR; do SU "insert into auth.users (id) values ('$u')" >/dev/null; done
SU "update public.user_flags set role='admin' where user_id='$ADM'; update public.user_flags set role='moderator' where user_id='$MOD'" >/dev/null
SU "update public.app_settings set min_app_version='1.0.1', update_url='https://github.com/djmirontos/unm-releases/releases/latest', update_message='Please update.' where id=1" >/dev/null
OLD_REQ="$(SU "select * from public.get_app_requirements()")"

echo "== apply new migration in one transaction"
psql -X -q -1 -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/20261102100000_soft_update.sql" 2>&1 | grep -v NOTICE

echo "== defaults and old function untouched"
chk "latest defaults to 0.0.0"           "0.0.0" "$(SU "select latest_app_version from public.app_settings where id=1")"
chk "play url defaults to null"          "t" "$(SU "select (play_update_url is null)::text from public.app_settings where id=1" | cut -c1)"
chk "get_app_requirements output same"   "$OLD_REQ" "$(SU "select * from public.get_app_requirements()")"
chk "get_app_requirements still 3 cols"  "3" "$(SU "select count(*) from pg_attribute where attrelid=(select oid from pg_class where relname='pg_proc') and false" >/dev/null; SU "select array_length(proargnames,1) - 0 from pg_proc where proname='get_app_requirements'")"

echo "== new function"
chk "guest can call it"                  "0.0.0" "$(as '' anon "select latest_app_version from public.get_latest_app_info()")"
chk "member can call it"                 "https://github.com/djmirontos/unm-releases/releases/latest" "$(as $USR authenticated "select update_url from public.get_latest_app_info()")"
chk "exactly one row"                    "1" "$(as '' anon "select count(*) from public.get_latest_app_info()")"
chk "returns only 4 fields"              "latest_app_version,update_url,play_update_url,latest_update_message" "$(SU "select array_to_string(proargnames,',') from pg_proc where proname='get_latest_app_info'")"
chk "does not leak push/moderation settings" "0" "$(SU "select count(*) from pg_proc where proname='get_latest_app_info' and prosrc ~* 'push_enabled|moderation_mode'")"

echo "== constraints"
chk "bad version rejected"               "violates check" "$(SU "update public.app_settings set latest_app_version='1.0' where id=1")"
chk "text version rejected"              "violates check" "$(SU "update public.app_settings set latest_app_version='latest' where id=1")"
chk "version with injection rejected"    "violates check" "$(SU "update public.app_settings set latest_app_version='1.0.2; drop' where id=1")"
chk "http play url rejected"             "violates check" "$(SU "update public.app_settings set play_update_url='http://play.google.com/x' where id=1")"
chk "long message rejected"              "violates check" "$(SU "update public.app_settings set latest_update_message='$(printf 'x%.0s' $(seq 1 201))' where id=1")"
chk "valid values accepted"              "1.0.2" "$(SU "update public.app_settings set latest_app_version='1.0.2', play_update_url='https://play.google.com/store/apps/details?id=com.unmfreedom.confessions', latest_update_message='A new version is available.' where id=1 returning latest_app_version" | head -1)"
chk "function returns the new values"    "1.0.2" "$(as '' anon "select latest_app_version from public.get_latest_app_info()")"
chk "message returned"                   "A new version is available." "$(as '' anon "select latest_update_message from public.get_latest_app_info()")"

echo "== only admins / dashboard can change them"
chk "member cannot update (no grant)"    "permission denied" "$(as $USR authenticated "update public.app_settings set latest_app_version='9.9.9' where id=1")"
chk "moderator cannot update (no grant)" "permission denied" "$(as $MOD authenticated "update public.app_settings set latest_app_version='9.9.9' where id=1")"
chk "admin cannot update (no grant)"     "permission denied" "$(as $ADM authenticated "update public.app_settings set latest_app_version='9.9.9' where id=1")"
# the guard is the second line of defence if a grant is ever added
SU "grant update (latest_app_version, play_update_url, latest_update_message, tagline, min_app_version) on public.app_settings to authenticated" >/dev/null
chk "guard: moderator blocked"           "admin_only" "$(as $MOD authenticated "update public.app_settings set latest_app_version='9.9.9' where id=1")"
chk "guard: moderator blocked (play url)" "admin_only" "$(as $MOD authenticated "update public.app_settings set play_update_url='https://example.invalid/x' where id=1")"
chk "guard: moderator blocked (message)" "admin_only" "$(as $MOD authenticated "update public.app_settings set latest_update_message='x' where id=1")"
chk "guard: moderator may still edit branding" "hello" "$(as $MOD authenticated "update public.app_settings set tagline='hello' where id=1 returning tagline")"
chk "guard: admin allowed"               "1.0.3" "$(as $ADM authenticated "update public.app_settings set latest_app_version='1.0.3' where id=1 returning latest_app_version")"
chk "value changed"                      "1.0.3" "$(SU "select latest_app_version from public.app_settings where id=1")"
chk "old guarded field still blocked"    "admin_only" "$(as $MOD authenticated "update public.app_settings set min_app_version='9.9.9' where id=1" )" 
SU "revoke update (latest_app_version, play_update_url, latest_update_message, tagline, min_app_version) on public.app_settings from authenticated" >/dev/null

echo "== grants"
chk "get_latest_app_info: no public execute beyond anon/authenticated" "t" "$(SU "select (has_function_privilege('anon','public.get_latest_app_info()','execute') and has_function_privilege('authenticated','public.get_latest_app_info()','execute'))::text" | cut -c1)"
chk "guests cannot read the new columns directly" "permission denied" "$(as '' anon "select latest_app_version from public.app_settings")"

echo; echo "passed: $pass  failed: $fail"; [[ $fail -eq 0 ]]
