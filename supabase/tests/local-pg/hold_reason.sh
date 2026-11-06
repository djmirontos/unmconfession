#!/usr/bin/env bash
# Tests for 20261106100000_hold_reason.sql (applied in ONE transaction like the SQL editor).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_hold
OWN=20261106100000
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
for f in $(ls "$HERE"/migrations/*.sql | sort | awk -v own=$OWN '{ n=$0; sub(/.*\//,"",n); if (substr(n,1,14) < own) print }'); do
  psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$f" 2>&1 | grep -v NOTICE
done
SU() { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1 | grep -v '^SET$'; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }
eq()  { if [[ "$3" == "$2" ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }
uid() { printf 'dddddddd-0000-4000-8000-%012d' "$1"; }
A=$(uid 1); B=$(uid 2); MOD=$(uid 3)
for pair in "$A:alice_a" "$B:bobby_b" "$MOD:mod_m"; do
  SU "insert into auth.users (id,email,raw_user_meta_data) values ('${pair%%:*}','${pair##*:}@unm.test','{\"nickname\":\"${pair##*:}\"}')" >/dev/null
done
SU "update public.user_flags set role='moderator' where user_id='$MOD'" >/dev/null
SU "insert into public.keywords (term, match_type, applies_to) values ('badword','contains','{post,comment,listing}')" >/dev/null
TODAY="(now() at time zone 'Asia/Manila')::date"

echo "== apply the migration in one transaction"
H_BEFORE=$(SU "select md5(pg_get_functiondef('public.get_feed(timestamptz,uuid,int)'::regprocedure)||pg_get_viewdef('public.feed_posts'::regclass))")
OUT=$( (echo "begin;"; cat "$HERE/migrations/$OWN"_hold_reason.sql; echo "commit;") | psql -X -q -v ON_ERROR_STOP=1 -d $DB 2>&1 | grep -v NOTICE)
eq "migration applies cleanly" "" "$OUT"
eq "feed function and view unchanged" "$H_BEFORE" "$(SU "select md5(pg_get_functiondef('public.get_feed(timestamptz,uuid,int)'::regprocedure)||pg_get_viewdef('public.feed_posts'::regclass))")"

echo "== grants"
chk "guest cannot call it" "permission denied" "$(as '' anon "select public.get_my_hold_reason('post', gen_random_uuid())")"
chk "signed-in role can call it" "" "$(as $A authenticated "select coalesce(public.get_my_hold_reason('post', gen_random_uuid()),'null')")"
eq "public has no execute" "f" "$(SU "select has_function_privilege('public', 'public.get_my_hold_reason(public.content_type, uuid)', 'execute')")"
eq "security definer with an empty search_path" "t" "$(SU "select prosecdef and exists (select 1 from unnest(proconfig) c where c like 'search_path=%') from pg_proc where proname='get_my_hold_reason'")"
chk "no auth: refused" "not_authenticated" "$(PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -d $DB -c "set role authenticated" -c "select public.get_my_hold_reason('post', gen_random_uuid())" 2>&1)"

echo "== keyword holds (post-moderation mode)"
PK=$(as $A authenticated "select id from public.create_post('confession','this has a BADWORD in it')")
eq "post held by keyword" "keyword" "$(as $A authenticated "select public.get_my_hold_reason('post','$PK')")"
PP=$(as $A authenticated "select id from public.create_post('confession','a perfectly fine post')")
eq "published post: null" "null" "$(as $A authenticated "select coalesce(public.get_my_hold_reason('post','$PP'),'null')")"
eq "another member cannot ask about my held post" "null" "$(as $B authenticated "select coalesce(public.get_my_hold_reason('post','$PK'),'null')")"
eq "unknown id: null" "null" "$(as $A authenticated "select coalesce(public.get_my_hold_reason('post', gen_random_uuid()),'null')")"
eq "wrong type for a real id: null" "null" "$(as $A authenticated "select coalesce(public.get_my_hold_reason('comment','$PK'),'null')")"
eq "the matched word is never returned" "t" "$(as $A authenticated "select public.get_my_hold_reason('post','$PK') !~* 'badword'")"
CK=$(as $B authenticated "select id from public.create_comment('post','$PP','a BADWORD comment')")
eq "comment held by keyword" "keyword" "$(as $B authenticated "select public.get_my_hold_reason('comment','$CK')")"
eq "comment: not visible to the post author" "null" "$(as $A authenticated "select coalesce(public.get_my_hold_reason('comment','$CK'),'null')")"
CF=$(as $B authenticated "select id from public.create_comment('post','$PP','nice one')")
eq "published comment: null" "null" "$(as $B authenticated "select coalesce(public.get_my_hold_reason('comment','$CF'),'null')")"
LK=$(as $A authenticated "select id from public.create_listing('sell','Bike badword','desc here',3000,'good')")
eq "listing held by keyword" "keyword" "$(as $A authenticated "select public.get_my_hold_reason('listing','$LK')")"
eq "listing: not visible to others" "null" "$(as $B authenticated "select coalesce(public.get_my_hold_reason('listing','$LK'),'null')")"
eq "profile type is never answered" "null" "$(as $A authenticated "select coalesce(public.get_my_hold_reason('profile','$A'),'null')")"

echo "== edit paths"
as $A authenticated "select id from public.edit_own_post('$PP','now with a badword')" >/dev/null
eq "an edit that hits the filter is held by keyword" "keyword" "$(as $A authenticated "select coalesce(public.get_my_hold_reason('post','$PP'),'null')")"

echo "== after staff decide"
as $MOD authenticated "select public.mod_review('post','$PK','approve')" >/dev/null
eq "approved: no hold left" "null" "$(as $A authenticated "select coalesce(public.get_my_hold_reason('post','$PK'),'null')")"
as $MOD authenticated "select public.mod_review('comment','$CK','reject','spam')" >/dev/null
eq "rejected: no hold left" "null" "$(as $B authenticated "select coalesce(public.get_my_hold_reason('comment','$CK'),'null')")"

echo "== pre-moderation mode"
SU "update public.app_settings set moderation_mode='pre' where id=1" >/dev/null
PM=$(as $A authenticated "select id from public.create_post('confession','fine text, but the community is in pre-moderation')")
eq "pre-moderation reason" "pre_moderation" "$(as $A authenticated "select public.get_my_hold_reason('post','$PM')")"
PM2=$(as $A authenticated "select id from public.create_post('confession','pre mode plus badword')")
eq "keyword wins over pre-moderation" "keyword" "$(as $A authenticated "select public.get_my_hold_reason('post','$PM2')")"
SM=$(as $MOD authenticated "select id from public.create_post('confession','staff bypass badword')")
eq "staff posts are never held" "null" "$(as $MOD authenticated "select coalesce(public.get_my_hold_reason('post','$SM'),'null')")"
SU "update public.app_settings set moderation_mode='post' where id=1" >/dev/null

echo "== removed by the author"
as $A authenticated "select public.delete_own_post('$PM')" >/dev/null 2>&1
eq "after the author deletes it: null" "null" "$(as $A authenticated "select coalesce(public.get_my_hold_reason('post','$PM'),'null')")"

echo
echo "hold_reason: $pass passed, $fail failed"
[[ $fail -eq 0 ]]
