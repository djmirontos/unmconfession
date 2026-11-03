#!/usr/bin/env bash
# Tests for 20261102110000_app_version_tracking.sql (new file runs in ONE transaction like the SQL editor).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_av
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
for f in $(ls "$HERE"/migrations/*.sql | sort | awk -v own=20261102110000 '{ n=$0; sub(/.*\//,"",n); if (substr(n,1,14) < own) print }'); do
  psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$f" 2>&1 | grep -v NOTICE
done
SU() { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1 | grep -v '^SET$'; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }
uid() { printf 'bbbbbbbb-0000-4000-8000-%012d' "$1"; }
ADM=$(uid 1); MOD=$(uid 2); M1=$(uid 3); M2=$(uid 4); M3=$(uid 5); M4=$(uid 6); NONICK=$(uid 7); BAN=$(uid 8); DEL=$(uid 9); M5=$(uid 10)
for u in $ADM $MOD $M1 $M2 $M3 $M4 $NONICK $BAN $DEL $M5; do SU "insert into auth.users (id) values ('$u')" >/dev/null; done
n=0; for u in $ADM $MOD $M1 $M2 $M3 $M4 $BAN $DEL $M5; do n=$((n+1)); SU "update public.profiles set nickname='nick_$n' where id='$u'" >/dev/null; done
SU "update public.user_flags set role='admin' where user_id='$ADM'; update public.user_flags set role='moderator' where user_id='$MOD';
    update public.user_flags set status='banned' where user_id='$BAN'; update public.user_flags set deleted_at=now() where user_id='$DEL'" >/dev/null

echo "== apply new migration in one transaction"
psql -X -q -1 -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/20261102110000_app_version_tracking.sql" 2>&1 | grep -v NOTICE

echo "== access"
chk "guest cannot report"                "permission denied" "$(as '' anon "select public.report_app_version('1.0.2','android')")"
chk "member cannot read the table"       "permission denied" "$(as $M1 authenticated "select * from public.member_app_versions")"
chk "member cannot write the table"      "permission denied" "$(as $M1 authenticated "insert into public.member_app_versions (user_id,app_version,platform) values ('$M1','1.0.2','android')")"
chk "guest cannot call staff counts"     "permission denied" "$(as '' anon "select * from public.mod_app_versions()")"
chk "member forbidden for staff counts"  "forbidden" "$(as $M1 authenticated "select * from public.mod_app_versions()")"
SU "update public.user_flags set status='suspended', suspended_until=now()+interval '1 day' where user_id='$MOD'" >/dev/null
chk "suspended moderator forbidden"      "forbidden" "$(as $MOD authenticated "select * from public.mod_app_versions()")"
SU "update public.user_flags set status='active', suspended_until=null where user_id='$MOD'" >/dev/null

echo "== report validation"
chk "invalid version rejected"           "invalid_version" "$(as $M1 authenticated "select public.report_app_version('1.0','android')")"
chk "text version rejected"              "invalid_version" "$(as $M1 authenticated "select public.report_app_version('latest','android')")"
chk "injection-looking version rejected" "invalid_version" "$(as $M1 authenticated "select public.report_app_version('1.0.2; drop table x','android')")"
chk "null version rejected"              "invalid_version" "$(as $M1 authenticated "select public.report_app_version(null,'android')")"
chk "bad platform rejected"              "invalid_platform" "$(as $M1 authenticated "select public.report_app_version('1.0.2','web')")"
chk "nothing stored by failed calls"     "0" "$(SU "select count(*) from public.member_app_versions")"

echo "== report behaviour"
as $M1 authenticated "select public.report_app_version('1.0.2','android')" >/dev/null
chk "member row stored"                  "1.0.2|android" "$(SU "select app_version||'|'||platform from public.member_app_versions where user_id='$M1'")"
SU "update public.member_app_versions set updated_at = now() - interval '1 hour' where user_id='$M1'" >/dev/null
T1="$(SU "select updated_at from public.member_app_versions where user_id='$M1'")"
as $M1 authenticated "select public.report_app_version('1.0.2','android')" >/dev/null
chk "same report within 12 h: no write"  "$T1" "$(SU "select updated_at from public.member_app_versions where user_id='$M1'")"
SU "update public.member_app_versions set updated_at = now() - interval '13 hours' where user_id='$M1'" >/dev/null
T2="$(SU "select updated_at from public.member_app_versions where user_id='$M1'")"
as $M1 authenticated "select public.report_app_version('1.0.2','android')" >/dev/null
chk "after 12 h the row is refreshed"    "t" "$(SU "select (updated_at > '$T2'::timestamptz)::text from public.member_app_versions where user_id='$M1'" | cut -c1)"
SU "update public.member_app_versions set updated_at = now() - interval '1 hour' where user_id='$M1'" >/dev/null
as $M1 authenticated "select public.report_app_version('1.0.3','android')" >/dev/null
chk "version change writes at once"      "1.0.3" "$(SU "select app_version from public.member_app_versions where user_id='$M1'")"
chk "still one row per member"           "1" "$(SU "select count(*) from public.member_app_versions where user_id='$M1'")"
as $M1 authenticated "select public.report_app_version('1.0.2','android')" >/dev/null
chk "a downgrade is recorded as sent"    "1.0.2" "$(SU "select app_version from public.member_app_versions where user_id='$M1'")"
as $NONICK authenticated "select public.report_app_version('1.0.2','android')" >/dev/null
chk "no nickname: nothing stored"        "0" "$(SU "select count(*) from public.member_app_versions where user_id='$NONICK'")"
as $BAN authenticated "select public.report_app_version('1.0.2','android')" >/dev/null
chk "banned: nothing stored"             "0" "$(SU "select count(*) from public.member_app_versions where user_id='$BAN'")"
as $DEL authenticated "select public.report_app_version('1.0.2','android')" >/dev/null
chk "deleted: nothing stored"            "0" "$(SU "select count(*) from public.member_app_versions where user_id='$DEL'")"

echo "== staff counts"
# members: ADM, MOD, M1..M4, BAN, M5 = 8 (DEL and NONICK excluded)
as $M2 authenticated "select public.report_app_version('1.0.2','android')" >/dev/null
as $M3 authenticated "select public.report_app_version('1.0.10','android')" >/dev/null
as $M4 authenticated "select public.report_app_version('1.0.1','ios')" >/dev/null
as $MOD authenticated "select public.report_app_version('1.0.2','android')" >/dev/null
SU "update public.member_app_versions set updated_at = now() - interval '10 days' where user_id='$M4'" >/dev/null
OUT="$(as $MOD authenticated "select coalesce(app_version,'none')||'|'||coalesce(platform,'-')||'|'||members||'|'||seen_7d from public.mod_app_versions()")"
chk "1.0.10 sorts above 1.0.2 (numeric)" "1.0.10|android|1|1" "$(echo "$OUT" | sed -n 1p)"
chk "1.0.2 android: M1, M2, MOD"         "1.0.2|android|3|3" "$(echo "$OUT" | sed -n 2p)"
chk "1.0.1 ios: one member, not seen in 7d" "1.0.1|ios|1|0" "$(echo "$OUT" | sed -n 3p)"
chk "not reporting last: ADM, BAN, M5"   "none|-|3|0" "$(echo "$OUT" | sed -n 4p)"
chk "exactly 4 rows"                     "4" "$(echo "$OUT" | wc -l | tr -d ' ')"
chk "admin sees the same"                "1.0.10|android|1|1" "$(as $ADM authenticated "select app_version||'|'||platform||'|'||members||'|'||seen_7d from public.mod_app_versions() limit 1")"
chk "result has no identity columns"     "app_version,platform,members,seen_7d" "$(SU "select array_to_string(proargnames,',') from pg_proc where proname='mod_app_versions'")"
SU "update public.user_flags set deleted_at=now() where user_id='$M3'" >/dev/null
chk "deleted member leaves the counts"   "1.0.2|android|3|3" "$(as $MOD authenticated "select app_version||'|'||platform||'|'||members||'|'||seen_7d from public.mod_app_versions() limit 1")"
SU "update public.user_flags set deleted_at=null where user_id='$M3'" >/dev/null

echo "== account deletion erases the record"
as $M5 authenticated "select public.report_app_version('1.0.2','android')" >/dev/null
TOK='ExponentPushToken[zzzzzzzzzzzzzzzzzzzzzz]'
as $M5 authenticated "select public.register_push_token('$TOK','android')" >/dev/null
chk "record exists before deletion"      "1" "$(SU "select count(*) from public.member_app_versions where user_id='$M5'")"
as $M5 authenticated "select public.delete_my_account('nick_9')" >/dev/null
chk "delete_my_account removes version row" "0" "$(SU "select count(*) from public.member_app_versions where user_id='$M5'")"
chk "delete_my_account still removes push token" "0" "$(SU "select count(*) from public.push_tokens where user_id='$M5'")"
chk "other members keep their rows"      "1" "$(SU "select count(*) from public.member_app_versions where user_id='$M1'")"
# admin deletes a banned member
as $M2 authenticated "select public.register_push_token('ExponentPushToken[yyyyyyyyyyyyyyyyyyyyyy]','android')" >/dev/null
as $M2 authenticated "select public.set_push_settings(p_comments := false)" >/dev/null
SU "update public.user_flags set status='banned' where user_id='$M2'" >/dev/null
chk "before admin delete: token exists"  "1" "$(SU "select count(*) from public.push_tokens where user_id='$M2'")"
chk "before admin delete: version row exists" "1" "$(SU "select count(*) from public.member_app_versions where user_id='$M2'")"
chk "moderator cannot admin-delete"      "forbidden" "$(as $MOD authenticated "select public.admin_delete_account('$M2','spam account')")"
as $ADM authenticated "select public.admin_delete_account('$M2','spam account')" >/dev/null
chk "admin delete removes version row"   "0" "$(SU "select count(*) from public.member_app_versions where user_id='$M2'")"
chk "admin delete removes push tokens (new)" "0" "$(SU "select count(*) from public.push_tokens where user_id='$M2'")"
chk "admin delete removes push settings (new)" "0" "$(SU "select count(*) from public.push_settings where user_id='$M2'")"
chk "admin delete still audited"         "1" "$(SU "select count(*) from public.admin_audit_log where subject_user_id='$M2' and action='delete_account'")"
chk "admin delete still needs a reason"  "reason_required" "$(as $ADM authenticated "select public.admin_delete_account('$M4','')")"
chk "admin delete refuses active account" "account_not_restricted" "$(as $ADM authenticated "select public.admin_delete_account('$M4','x')")"

echo; echo "passed: $pass  failed: $fail"; [[ $fail -eq 0 ]]
