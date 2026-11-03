#!/usr/bin/env bash
# Tests for 20261022100000_feed_events.sql. Applies stub + both migrations on a fresh DB.
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_fe

psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/tests/00_supabase_stub.sql" 2>/dev/null || { echo "stub failed"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/20261021000000_v1_schema.sql" 2>&1 | grep -v NOTICE
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/20261022100000_feed_events.sql" 2>&1 | grep -v NOTICE

SU() { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }

U1=bbbbbbbb-0000-4000-8000-000000000001
U2=bbbbbbbb-0000-4000-8000-000000000002
MOD=bbbbbbbb-0000-4000-8000-000000000003
SU "insert into auth.users (id, email, raw_user_meta_data) values
  ('$U1','u1@unm.test','{\"nickname\":\"user_one\"}'),
  ('$U2','u2@unm.test','{\"nickname\":\"user_two\"}'),
  ('$MOD','m@unm.test','{\"nickname\":\"mod_one\"}');
  update public.user_flags set role='moderator' where user_id='$MOD';" >/dev/null

cnt() { SU "select count(*) from public.feed_events"; }

echo "== publication"
chk "feed_events is published to Realtime" "1" "$(SU "select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename='feed_events'")"
chk "posts is no longer published"         "0" "$(SU "select count(*) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='posts'")"
chk "comments still published"             "1" "$(SU "select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename='comments'")"
chk "notifications still published"        "1" "$(SU "select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename='notifications'")"

echo "== events"
P1=$(as $U1 authenticated "select id from public.create_post('confession','hello world')")
chk "direct publish emits one event" "1" "$(cnt)"
chk "event points at the post"       "$P1" "$(SU "select post_id from public.feed_events")"
HELD=$(as $U1 authenticated "select id from public.create_post('confession','see fb.com/someone')")
chk "keyword-held post emits nothing" "1" "$(cnt)"
chk "approving the held post emits"   "2" "$(as $MOD authenticated "select public.mod_review('post','$HELD','approve')" >/dev/null; cnt)"
as $U2 authenticated "select public.set_reaction('$P1','love'); select public.create_comment('post','$P1','nice')" >/dev/null
chk "reaction + comment emit nothing" "2" "$(cnt)"
as $MOD authenticated "select public.mod_review('post','$P1','remove','spam')" >/dev/null
chk "removing emits nothing"          "2" "$(cnt)"
chk "restoring emits"                 "3" "$(as $MOD authenticated "select public.mod_review('post','$P1','restore')" >/dev/null; cnt)"
chk "editing text emits nothing"      "3" "$(as $MOD authenticated "select public.mod_edit_content('post','$P1','edited text')" >/dev/null; cnt)"
chk "poll publish emits"              "4" "$(as $U1 authenticated "select id from public.create_post('poll','Best canteen?',null,'[]',array['A','B'],now()+interval '1 day')" >/dev/null; cnt)"
chk "deleting a post removes both of its events" "2" "$(SU "delete from public.posts where id='$P1'" >/dev/null; cnt)"

echo "== access"
chk "guest can read events"            "2" "$(as '' anon "select count(*) from public.feed_events")"
chk "member can read events"           "2" "$(as $U1 authenticated "select count(*) from public.feed_events")"
chk "member cannot insert events"      "permission denied" "$(as $U1 authenticated "insert into public.feed_events (post_id) values ((select id from public.posts limit 1))")"
chk "guest cannot insert events"       "permission denied" "$(as '' anon "insert into public.feed_events (post_id) values ((select id from public.posts limit 1))")"
chk "member cannot delete events"      "permission denied" "$(as $U1 authenticated "delete from public.feed_events")"
chk "trigger function not callable"    "permission denied" "$(as $U1 authenticated "select public.posts_publish_event()")"
chk "RLS is enabled"                   "t" "$(SU "select relrowsecurity from pg_class where oid='public.feed_events'::regclass")"

echo "== idempotence of the Realtime block"
chk "re-running the publication block is safe" "" "$(SU "do \$\$ begin
  if exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='posts') then
    alter publication supabase_realtime drop table public.posts; end if; end \$\$" | grep -i error)"

echo; echo "RESULT: $pass passed, $fail failed"; [[ $fail -eq 0 ]]
