#!/usr/bin/env bash
# Tests for 20261024100000_poll_vote_change.sql (stub + all migrations on a fresh DB).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_pv

psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/tests/00_supabase_stub.sql" 2>/dev/null || { echo "stub failed"; exit 1; }
for f in 20261021000000_v1_schema 20261022100000_feed_events 20261022110000_allow_three_images 20261023100000_lost_found_manila_date 20261023110000_lost_found_type 20261023120000_edit_delete_own 20261023130000_comments_edit_delete 20261024100000_poll_vote_change; do
  psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/$f.sql" 2>&1 | grep -v NOTICE
done

SU() { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }

A=bbbbbbbb-2222-4000-8000-000000000001
B=bbbbbbbb-2222-4000-8000-000000000002
C=bbbbbbbb-2222-4000-8000-000000000003
SU "insert into auth.users (id, email, raw_user_meta_data) values
  ('$A','a@unm.test','{\"nickname\":\"poll_owner\"}'),('$B','b@unm.test','{\"nickname\":\"voter_b\"}'),('$C','c@unm.test','{\"nickname\":\"voter_c\"}')" >/dev/null

P=$(as $A authenticated "select id from public.create_post('poll','Best canteen?',null,'[]',array['A','B','C'],now()+interval '1 day')")
P2=$(as $A authenticated "select id from public.create_post('poll','Other poll?',null,'[]',array['X','Y'],now()+interval '1 day')")
OA=$(SU "select id from public.poll_options where post_id='$P' and label='A'")
OB=$(SU "select id from public.poll_options where post_id='$P' and label='B'")
OC=$(SU "select id from public.poll_options where post_id='$P' and label='C'")
OX=$(SU "select id from public.poll_options where post_id='$P2' and label='X'")
votes() { SU "select string_agg(vote_count::text, ',' order by label) from public.poll_options where post_id='$P'"; }
vote() { as $1 authenticated "select public.vote_poll('$P','$2')"; }

echo "== first vote"
vote $B $OA >/dev/null
chk "vote counted"                     "1,0,0" "$(votes)"
vote $C $OA >/dev/null
chk "second voter counted"             "2,0,0" "$(votes)"

echo "== change vote"
vote $B $OB >/dev/null
chk "vote moves A -> B"                "1,1,0" "$(votes)"
vote $B $OC >/dev/null
chk "vote moves again B -> C"          "1,0,1" "$(votes)"
chk "voter still has exactly one vote" "1" "$(SU "select count(*) from public.poll_votes where post_id='$P' and user_id='$B'")"
chk "stored vote is the latest one"    "$OC" "$(SU "select option_id from public.poll_votes where post_id='$P' and user_id='$B'")"
vote $B $OC >/dev/null
chk "same option again is a no-op"     "1,0,1" "$(votes)"
chk "my_vote in the feed view"         "$OC" "$(as $B authenticated "select my_vote from public.get_feed(null,null,50) where id='$P'")"
chk "other voter unaffected"           "$OA" "$(SU "select option_id from public.poll_votes where post_id='$P' and user_id='$C'")"

echo "== invalid changes keep the old vote"
chk "option of another poll rejected"  "invalid_option" "$(vote $B $OX)"
chk "original vote is kept"            "1,0,1" "$(votes)"
chk "unknown option rejected"          "invalid_option" "$(vote $B 00000000-0000-4000-8000-000000000000)"
chk "still counted once after failures" "1" "$(SU "select count(*) from public.poll_votes where post_id='$P' and user_id='$B'")"

echo "== closed and unavailable polls"
SU "update public.posts set ends_at = now() - interval '1 minute' where id='$P'" >/dev/null
chk "ended poll: change refused"       "poll_closed" "$(vote $B $OA)"
chk "ended poll: counts frozen"        "1,0,1" "$(votes)"
chk "not a poll"                       "poll_closed" "$(as $B authenticated "select public.vote_poll('$(as $A authenticated "select id from public.create_post('confession','not a poll')")','$OA')")"

echo "== privileges"
chk "guest cannot vote"                "permission denied" "$(as '' anon "select public.vote_poll('$P2','$OX')")"
chk "member can vote in another poll"  "" "$(as $B authenticated "select public.vote_poll('$P2','$OX')" | grep -i error)"

echo; echo "RESULT: $pass passed, $fail failed"; [[ $fail -eq 0 ]]
