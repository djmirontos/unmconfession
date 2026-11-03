#!/usr/bin/env bash
# Tests for 20261023130000_comments_edit_delete.sql (stub + all migrations on a fresh DB).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_ce

psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/tests/00_supabase_stub.sql" 2>/dev/null || { echo "stub failed"; exit 1; }
for f in 20261021000000_v1_schema 20261022100000_feed_events 20261022110000_allow_three_images 20261023100000_lost_found_manila_date 20261023110000_lost_found_type 20261023120000_edit_delete_own 20261023130000_comments_edit_delete; do
  psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/$f.sql" 2>&1 | grep -v NOTICE
done

SU() { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }

A=aaaaaaaa-1111-4000-8000-000000000001
B=aaaaaaaa-1111-4000-8000-000000000002
M=aaaaaaaa-1111-4000-8000-000000000003
C=aaaaaaaa-1111-4000-8000-000000000004
SU "insert into auth.users (id, email, raw_user_meta_data) values
  ('$A','a@unm.test','{\"nickname\":\"post_owner\"}'),('$B','b@unm.test','{\"nickname\":\"commenter_b\"}'),
  ('$M','m@unm.test','{\"nickname\":\"mod_m\"}'),('$C','c@unm.test','{\"nickname\":\"spammy_c\"}');
  update public.user_flags set role='moderator' where user_id='$M';" >/dev/null

P=$(as $A authenticated "select id from public.create_post('confession','a post to comment on')")
L=$(as $A authenticated "select id from public.create_listing('sell','Desk',null,100,'good')")
cnt() { SU "select comment_count from public.posts where id='$P'"; }
ec() { as $B authenticated "select $2 from public.edit_own_comment('$1', $3)"; }
mk() { as $B authenticated "select id from public.create_comment('post','$P','$1')"; }

echo "== edit a comment"
C1=$(mk "first version")
chk "comment counted"                "1" "$(cnt)"
chk "edit works"                     "second version" "$(ec $C1 body "'second version'")"
chk "edited_at is set"               "t" "$(SU "select edited_at is not null from public.comments where id='$C1'")"
chk "still published, count unchanged" "published|1" "$(SU "select status from public.comments where id='$C1'")|$(cnt)"
chk "previous text kept for mods"    "first version" "$(SU "select original_body from public.moderation_actions where target_id='$C1' and reason_code='author_edit'")"
chk "same text = no edit"            "0" "$(ec $C1 "(select count(*) from public.moderation_actions where target_id='$C1' and created_at > now() - interval '1 second')" "'second version'")"
chk "post owner cannot edit it"      "not_found" "$(as $A authenticated "select * from public.edit_own_comment('$C1','hijack')")"
chk "empty text rejected"            "invalid_body" "$(ec $C1 body "'  '")"
chk "text over 1000 chars rejected"  "invalid_body" "$(ec $C1 body "repeat('x',1001)")"
chk "thread exposes edited_at"       "t" "$(as '' anon "select edited_at is not null from public.get_comments('post','$P') where id='$C1'")"
chk "guest cannot call"              "permission denied" "$(as '' anon "select * from public.edit_own_comment('$C1','x')")"

echo "== moderation re-check on edit"
chk "keyword hit sends it back to pending" "pending" "$(ec $C1 status "'see fb.com/someone'")"
chk "hold row has the term"          "fb.com/" "$(SU "select matched_term from public.moderation_holds where target_id='$C1'")"
chk "pending comment leaves the count" "0" "$(cnt)"
chk "pending comment hidden from the thread" "0" "$(as '' anon "select count(*) from public.get_comments('post','$P') where id='$C1'")"
chk "author still sees own pending row" "1" "$(as $B authenticated "select count(*) from public.comments where id='$C1'")"
chk "clean edit republishes"         "published" "$(ec $C1 status "'clean again'")"
chk "count restored"                 "1" "$(cnt)"
chk "hold removed"                   "0" "$(SU "select count(*) from public.moderation_holds where target_id='$C1'")"
SU "update public.app_settings set moderation_mode='pre'" >/dev/null
chk "pre-moderation: edit goes pending" "pending" "$(ec $C1 status "'edited under pre mode'")"
SU "update public.app_settings set moderation_mode='post'" >/dev/null
as $M authenticated "select public.mod_review('comment','$C1','approve')" >/dev/null
SU "update public.comments set created_at = now() - interval '25 hours' where id='$C1'" >/dev/null
chk "after 24 hours: closed"         "edit_window_closed" "$(ec $C1 body "'too late'")"
C2=$(mk "to be removed")
as $M authenticated "select public.mod_review('comment','$C2','remove','spam')" >/dev/null
chk "removed comment cannot be edited" "not_editable" "$(ec $C2 body "'fixed'")"

echo "== rate limit (shared 10 per hour)"
CR=$(as $C authenticated "select id from public.create_comment('post','$P','rate 0')")
for i in 1 2 3 4 5 6 7 8 9 10; do as $C authenticated "select 1 from public.edit_own_comment('$CR','rate $i')" >/dev/null; done
chk "11th edit in an hour is refused" "rate_limited" "$(as $C authenticated "select * from public.edit_own_comment('$CR','rate 11')")"

echo "== delete"
C3=$(mk "delete me")
BEFORE=$(cnt)
chk "other user cannot delete"       "not_found" "$(as $C authenticated "select public.delete_own_comment('$C3')")"
chk "post owner cannot delete either" "not_found" "$(as $A authenticated "select public.delete_own_comment('$C3')")"
as $B authenticated "select public.delete_own_comment('$C3')" >/dev/null
chk "gone from the thread"           "0" "$(as '' anon "select count(*) from public.get_comments('post','$P') where id='$C3'")"
chk "author cannot see it any more"  "0" "$(as $B authenticated "select count(*) from public.comments where id='$C3'")"
chk "staff still can"                "1" "$(as $M authenticated "select count(*) from public.comments where id='$C3'")"
chk "comment_count decreased"        "$((BEFORE-1))" "$(cnt)"
chk "row is removed + deleted_at"    "removed|t" "$(SU "select status || '|' || (deleted_at is not null) from public.comments where id='$C3'")"
chk "second delete is not_found"     "not_found" "$(as $B authenticated "select public.delete_own_comment('$C3')")"
chk "removed comment can be deleted by its author" "removed" "$(as $B authenticated "select public.delete_own_comment('$C2')" >/dev/null; SU "select status from public.comments where id='$C2'")"
chk "deleted removed comment hidden from author" "0" "$(as $B authenticated "select count(*) from public.comments where id='$C2'")"
CL=$(as $B authenticated "select id from public.create_comment('listing','$L','nice desk')")
chk "listing comment can be edited too" "great desk" "$(ec $CL body "'great desk'")"
chk "listing comment can be deleted"    "0" "$(as $B authenticated "select public.delete_own_comment('$CL')" >/dev/null; as $B authenticated "select count(*) from public.comments where id='$CL'")"
chk "guest cannot delete"            "permission denied" "$(as '' anon "select public.delete_own_comment('$C1')")"

echo "== purge"
SU "update public.comments set deleted_at = now() - interval '31 days' where id='$C3'" >/dev/null
SU "select public.purge_expired()" >/dev/null
chk "deleted comments purged after the retention" "0" "$(SU "select count(*) from public.comments where id='$C3'")"
chk "recent deleted rows are kept"   "1" "$(SU "select count(*) from public.comments where id='$C2'")"

echo; echo "RESULT: $pass passed, $fail failed"; [[ $fail -eq 0 ]]
