#!/usr/bin/env bash
# Tests for 20261023120000_edit_delete_own.sql (stub + all migrations on a fresh DB).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_ed

psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/tests/00_supabase_stub.sql" 2>/dev/null || { echo "stub failed"; exit 1; }
for f in 20261021000000_v1_schema 20261022100000_feed_events 20261022110000_allow_three_images 20261023100000_lost_found_manila_date 20261023110000_lost_found_type 20261023120000_edit_delete_own; do
  psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/$f.sql" 2>&1 | grep -v NOTICE
done

SU() { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }

A=ffffffff-0000-4000-8000-000000000001
B=ffffffff-0000-4000-8000-000000000002
M=ffffffff-0000-4000-8000-000000000003
C=ffffffff-0000-4000-8000-000000000004
SU "insert into auth.users (id, email, raw_user_meta_data) values
  ('$A','a@unm.test','{\"nickname\":\"author_a\"}'),('$B','b@unm.test','{\"nickname\":\"other_b\"}'),
  ('$M','m@unm.test','{\"nickname\":\"mod_m\"}'),('$C','c@unm.test','{\"nickname\":\"spammy_c\"}');
  update public.user_flags set role='moderator' where user_id='$M';" >/dev/null
SU "insert into public.keywords (term, match_type, applies_to) values ('seedtestword','contains','{post,listing}')" >/dev/null
TODAY=$(SU "select (now() at time zone 'Asia/Manila')::date")

ep() { as $A authenticated "select $2 from public.edit_own_post('$1', $3)"; }

echo "== edit a confession"
P1=$(as $A authenticated "select id from public.create_post('confession','first version')")
chk "edit works"                 "second version" "$(ep $P1 body "'second version'")"
chk "edited_at is set"           "t" "$(SU "select edited_at is not null from public.posts where id='$P1'")"
chk "stays published"            "published" "$(SU "select status from public.posts where id='$P1'")"
chk "previous text kept for mods" "first version" "$(SU "select original_body from public.moderation_actions where target_id='$P1' and reason_code='author_edit'")"
chk "mod audit row names the author" "$A" "$(SU "select actor_id from public.moderation_actions where target_id='$P1' and reason_code='author_edit'")"
P2=$(as $A authenticated "select id from public.create_post('confession','unchanged')")
chk "same text = no edit"        "f" "$(ep $P2 "edited_at is not null" "'unchanged'")"
chk "same text writes no audit row" "0" "$(SU "select count(*) from public.moderation_actions where target_id='$P2'")"
chk "another user cannot edit"   "not_found" "$(as $B authenticated "select * from public.edit_own_post('$P1','hacked')")"
chk "empty body rejected"        "invalid_body" "$(ep $P1 body "'   '")"
chk "guest cannot call"          "permission denied" "$(as '' anon "select * from public.edit_own_post('$P1','x')")"
chk "visible in the feed with edited_at" "t" "$(as '' anon "select edited_at is not null from public.get_feed(null,null,50) where id='$P1'")"

echo "== polls, shoutouts, windows, status"
POLL=$(as $A authenticated "select id from public.create_post('poll','Best canteen?',null,'[]',array['A','B'],now()+interval '1 day')")
chk "poll cannot be edited"      "not_editable" "$(ep $POLL body "'Changed?'")"
SH=$(as $A authenticated "select id from public.create_post('shoutout','thanks a lot','Prof X')")
chk "shoutout edit changes To:"  "Prof Y" "$(ep $SH target_name "'thanks a lot','Prof Y'")"
chk "shoutout needs a target"    "target_required" "$(ep $SH body "'thanks a lot'")"
chk "confession cannot get a target" "invalid_target" "$(ep $P1 body "'second version','Someone'")"
SU "update public.posts set created_at = now() - interval '25 hours' where id='$P2'" >/dev/null
chk "after 24 hours: closed"     "edit_window_closed" "$(ep $P2 body "'late edit'")"

echo "== moderation re-check on edit"
chk "keyword hit sends it back to pending" "pending" "$(ep $P1 status "'now with seedtestword'")"
chk "hold row created with the term"       "seedtestword" "$(SU "select matched_term from public.moderation_holds where target_id='$P1'")"
chk "pending post is hidden from the feed" "0" "$(as '' anon "select count(*) from public.get_feed(null,null,50) where id='$P1'")"
EVT=$(SU "select count(*) from public.feed_events where post_id='$P1'")
chk "clean edit republishes"               "published" "$(ep $P1 status "'clean again'")"
chk "hold removed after republish"         "0" "$(SU "select count(*) from public.moderation_holds where target_id='$P1'")"
chk "republish emits a feed event"         "$((EVT+1))" "$(SU "select count(*) from public.feed_events where post_id='$P1'")"
P3=$(as $A authenticated "select id from public.create_post('confession','born with seedtestword')")
chk "pending post starts held"             "pending" "$(SU "select status from public.posts where id='$P3'")"
chk "editing a pending post republishes if clean" "published" "$(ep $P3 status "'cleaned up'")"
chk "first publish assigns a number"       "t" "$(SU "select number is not null from public.posts where id='$P3'")"
SU "update public.app_settings set moderation_mode='pre'" >/dev/null
chk "pre-moderation: edit goes pending"    "pending" "$(ep $P3 status "'edited under pre mode'")"
chk "pre-moderation hold reason"           "pre_moderation" "$(SU "select reason from public.moderation_holds where target_id='$P3'")"
SU "update public.app_settings set moderation_mode='post'" >/dev/null
PM=$(as $M authenticated "select id from public.create_post('confession','mod post')")
chk "staff edits are never held"           "published" "$(as $M authenticated "select status from public.edit_own_post('$PM','mod post seedtestword')")"
P4=$(as $A authenticated "select id from public.create_post('confession','will be rejected')")
as $M authenticated "select public.mod_review('post','$P4','remove','spam')" >/dev/null
chk "removed post cannot be edited"        "not_editable" "$(ep $P4 body "'fixed'")"

echo "== rate limit (10 edits per hour)"
PR=$(as $C authenticated "select id from public.create_post('confession','rate 0')")
for i in 1 2 3 4 5 6 7 8 9 10; do as $C authenticated "select 1 from public.edit_own_post('$PR','rate $i')" >/dev/null; done
chk "11th edit in an hour is refused"      "rate_limited" "$(as $C authenticated "select * from public.edit_own_post('$PR','rate 11')")"

echo "== edit listings"
L1=$(as $A authenticated "select id from public.create_listing('sell','Old desk','solid',500,'good')")
el() { as $A authenticated "select $2 from public.edit_own_listing('$1', $3)"; }
chk "sell edit works"            "Big desk" "$(el $L1 title "'Big desk','solid',450,'fair'")"
chk "price updated"              "450.00" "$(SU "select price from public.listings where id='$L1'")"
chk "listing edited_at set"      "t" "$(SU "select edited_at is not null from public.listings where id='$L1'")"
chk "old values kept for mods"   "Old desk" "$(SU "select original_body from public.moderation_actions where target_id='$L1' and reason_code='author_edit'")"
chk "bad price rejected"         "invalid_price" "$(el $L1 title "'Big desk','solid',null,'fair'")"
chk "bad condition rejected"     "condition_required" "$(el $L1 title "'Big desk','solid',450,'broken'")"
chk "another user cannot edit"   "not_found" "$(as $B authenticated "select * from public.edit_own_listing('$L1','x',null,1,'good')")"
chk "prohibited word sends it to pending" "pending" "$(el $L1 status "'Big desk','sells marijuana',450,'fair'")"
chk "feed_listings exposes edited_at" "t" "$(as '' anon "select count(*) >= 0 from public.get_listings('sell')")"
LF=$(as $A authenticated "select id from public.create_listing('lost_found','Black wallet',null,null,null,'Library','$TODAY','[]'::jsonb,'found')")
chk "lost&found location edit"   "Cafeteria" "$(el $LF location "'Black wallet',null,null,null,'Cafeteria','$TODAY'")"
chk "lost/found type is kept"    "found" "$(SU "select lost_found_type from public.listings where id='$LF'")"
chk "future date rejected"       "invalid_lost_found" "$(el $LF location "'Black wallet',null,null,null,'Cafeteria','$TODAY'::date + 1")"
chk "missing location rejected"  "invalid_lost_found" "$(el $LF location "'Black wallet',null,null,null,null,'$TODAY'")"
SU "update public.listings set created_at = now() - interval '25 hours' where id='$LF'" >/dev/null
chk "listing window closes too"  "edit_window_closed" "$(el $LF location "'Black wallet',null,null,null,'Gym','$TODAY'")"

echo "== delete"
D1=$(as $A authenticated "select id from public.create_post('confession','delete me')")
NUM=$(SU "select number from public.posts where id='$D1'")
chk "another user cannot delete" "not_found" "$(as $B authenticated "select public.delete_own_post('$D1')")"
as $A authenticated "select public.delete_own_post('$D1')" >/dev/null
chk "gone from the feed"         "0" "$(as '' anon "select count(*) from public.get_feed(null,null,50) where id='$D1'")"
chk "author cannot see it either" "0" "$(as $A authenticated "select count(*) from public.posts where id='$D1'")"
chk "staff still can"            "1" "$(as $M authenticated "select count(*) from public.posts where id='$D1'")"
chk "row is marked removed + deleted_at" "removed|t" "$(SU "select status || '|' || (deleted_at is not null) from public.posts where id='$D1'")"
chk "second delete is not_found" "not_found" "$(as $A authenticated "select public.delete_own_post('$D1')")"
D2=$(as $A authenticated "select id from public.create_post('confession','next one')")
chk "post numbers are never reused" "t" "$(SU "select number > $NUM from public.posts where id='$D2'")"
chk "poll can be deleted"        "" "$(as $A authenticated "select public.delete_own_post('$POLL')" | grep -i error)"
chk "rejected post can be deleted by its author" "removed" "$(as $A authenticated "select public.delete_own_post('$P4')" >/dev/null; SU "select status from public.posts where id='$P4'")"
chk "deleted rejected post hidden from author" "0" "$(as $A authenticated "select count(*) from public.posts where id='$P4'")"
as $A authenticated "select public.delete_own_listing('$L1')" >/dev/null
chk "deleted listing hidden from the author" "0" "$(as $A authenticated "select count(*) from public.listings where id='$L1'")"
chk "listing second delete not_found" "not_found" "$(as $A authenticated "select public.delete_own_listing('$L1')")"
chk "other user cannot delete a listing" "not_found" "$(as $B authenticated "select public.delete_own_listing('$LF')")"

echo "== purge"
SU "update public.posts set deleted_at = now() - interval '31 days' where id='$D1'" >/dev/null
SU "select public.purge_expired()" >/dev/null
chk "deleted rows are purged after the retention" "0" "$(SU "select count(*) from public.posts where id='$D1'")"
chk "recently deleted rows are kept"              "1" "$(SU "select count(*) from public.posts where id='$POLL'")"

echo "== privileges"
for fn in "edit_own_post('$P1','x')" "delete_own_post('$P1')" "delete_own_listing('$LF')" "edit_own_listing('$LF','x')"; do
  chk "guest cannot call $fn" "permission denied" "$(as '' anon "select public.$fn")"
done

echo; echo "RESULT: $pass passed, $fail failed"; [[ $fail -eq 0 ]]
