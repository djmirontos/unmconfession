#!/usr/bin/env bash
# Tests for 20261027120000_admin_panel_followups.sql
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_fu
psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/tests/00_supabase_stub.sql" 2>/dev/null || { echo "stub failed"; exit 1; }
psql -X -q -d $DB -c "alter table auth.users add column last_sign_in_at timestamptz, add column email_confirmed_at timestamptz, add column raw_app_meta_data jsonb not null default '{}'::jsonb"
LIST="20261021000000_v1_schema 20261022100000_feed_events 20261022110000_allow_three_images 20261023100000_lost_found_manila_date 20261023110000_lost_found_type 20261023120000_edit_delete_own 20261023130000_comments_edit_delete 20261024100000_poll_vote_change 20261024110000_block_filtering 20261024120000_notifications 20261025100000_comment_reactions 20261025110000_top_reactions 20261025120000_comment_replies 20261025130000_listings_filters 20261026100000_account_settings 20261026110000_nickname_keywords 20261026120000_delete_account_closes_listings 20261026130000_terms_acceptance 20261027100000_admin_panel 20261027120000_admin_panel_followups"
for f in $LIST; do
  [[ $f == 20261024110000_block_filtering ]] && psql -X -q -d $DB -c "revoke all on public.user_blocks from anon"
  psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/$f.sql" 2>&1 | grep -v NOTICE
done
SU() { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }
eq()  { if [[ "$3" == "$2" ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }
P=88888888-0000-4000-8000-0000000000
ALICE=${P}01; BOB=${P}02; MOD=${P}04; ADM=${P}05; GONE=${P}06
SU "insert into auth.users (id,email,raw_user_meta_data) values
  ('$ALICE','a@unm.test','{\"nickname\":\"alice_unm\"}'),('$BOB','b@unm.test','{\"nickname\":\"bobby.b\"}'),
  ('$MOD','m@unm.test','{\"nickname\":\"juan_mod\"}'),('$ADM','ad@unm.test','{\"nickname\":\"dean_x\"}'),
  ('$GONE','g@unm.test','{\"nickname\":\"soon_gone\"}');
  update public.user_flags set role='moderator' where user_id='$MOD'; update public.user_flags set role='admin' where user_id='$ADM';" >/dev/null
PA1=${P}a1; PA2=${P}a2; PB1=${P}a3; CA=${P}b1; LA=${P}c1; PG=${P}a4; PGD=${P}a5
SU "insert into public.posts (id,number,kind,author_id,body,status,published_at,created_at) values
  ('$PA1',nextval('public.post_number_seq'),'confession','$ALICE','alice first post','published',now(),now()-interval '3 hours'),
  ('$PA2',nextval('public.post_number_seq'),'confession','$ALICE','alice second post','removed',now(),now()-interval '2 hours'),
  ('$PB1',nextval('public.post_number_seq'),'confession','$BOB','bob post','published',now(),now()-interval '1 hour'),
  ('$PG',nextval('public.post_number_seq'),'confession','$GONE','gone user post','published',now(),now()-interval '50 minutes');
  insert into public.comments (id,post_id,author_id,body,status,published_at) values ('$CA','$PB1','$ALICE','alice comment on bob','published',now());
  insert into public.listings (id,kind,author_id,title,description,price,status,published_at) values ('$LA','sell','$ALICE','alice calculator','works',100,'published',now());" >/dev/null

echo "== mod_list_content by author"
eq "alice has 4 items" "4" "$(as $MOD authenticated "select count(*) from public.mod_list_content(p_author => '$ALICE', p_limit => 50)")"
eq "bob has 1" "1" "$(as $MOD authenticated "select count(*) from public.mod_list_content(p_author => '$BOB')")"
eq "author + type" "2" "$(as $MOD authenticated "select count(*) from public.mod_list_content(p_type => 'post', p_author => '$ALICE')")"
eq "author + status" "$PA2" "$(as $MOD authenticated "select target_id from public.mod_list_content(p_status => 'removed', p_author => '$ALICE')")"
eq "author + search" "$LA" "$(as $MOD authenticated "select target_id from public.mod_list_content(p_search => 'calculator', p_author => '$ALICE')")"
eq "search that only matches someone else's item finds nothing for this author" "0" "$(as $MOD authenticated "select count(*) from public.mod_list_content(p_search => 'bob post', p_author => '$ALICE')")"
eq "unknown author: nothing" "0" "$(as $MOD authenticated "select count(*) from public.mod_list_content(p_author => '${P}ff')")"
eq "no author: everything (old behaviour)" "6" "$(as $MOD authenticated "select count(*) from public.mod_list_content(p_limit => 50)")"
eq "keyset paging within one author" "$PA1" "$(as $MOD authenticated "select target_id from public.mod_list_content(p_type => 'post', p_author => '$ALICE', p_limit => 1, p_after_ts => (select created_at from public.posts where id='$PA2'), p_after_id => '$PA2') ")"
eq "old 6-argument call still resolves" "6" "$(as $MOD authenticated "select count(*) from public.mod_list_content(null, null, null, 50, null, null)")"
chk "plain user cannot" "forbidden" "$(as $ALICE authenticated "select * from public.mod_list_content(p_author => '$ALICE')")"
chk "guest cannot" "permission denied" "$(as '' anon "select * from public.mod_list_content(p_author => '$ALICE')")"
eq "only one signature exists" "1" "$(SU "select count(*) from pg_proc where proname='mod_list_content' and pronamespace='public'::regnamespace")"

echo "== restore refuses author-deleted items"
SU "update public.posts set status='removed', deleted_at=now() where id='$PB1'" >/dev/null
chk "author deleted: restore refused" "deleted_by_author" "$(as $MOD authenticated "select public.mod_review('post','$PB1','restore')")"
eq "...still removed" "removed" "$(SU "select status::text from public.posts where id='$PB1'")"
as $MOD authenticated "select public.mod_review('post','$PA2','restore')" >/dev/null
eq "moderator-removed item can still be restored" "published" "$(SU "select status::text from public.posts where id='$PA2'")"
eq "...and the author got an approved notice" "1" "$(SU "select count(*) from public.notifications where user_id='$ALICE' and type='content_approved' and target_id='$PA2'")"
SU "update public.listings set status='removed', deleted_at=now() where id='$LA'; update public.comments set status='removed', deleted_at=now() where id='$CA'" >/dev/null
chk "author-deleted listing" "deleted_by_author" "$(as $MOD authenticated "select public.mod_review('listing','$LA','restore')")"
chk "author-deleted comment" "deleted_by_author" "$(as $MOD authenticated "select public.mod_review('comment','$CA','restore')")"
chk "invalid transition still reported first for a published item" "invalid_transition" "$(as $MOD authenticated "select public.mod_review('post','$PA1','restore')")"
chk "unknown item" "not_found" "$(as $MOD authenticated "select public.mod_review('post','${P}fe','restore')")"
chk "remove without reason" "reason_required" "$(as $MOD authenticated "select public.mod_review('post','$PA1','remove')")"
as $MOD authenticated "select public.mod_review('post','$PA1','remove','spam')" >/dev/null
eq "remove still works and notifies the live author" "1" "$(SU "select count(*) from public.notifications where user_id='$ALICE' and type='content_removed' and target_id='$PA1'")"
eq "remove resolved open reports (none here) and logged the action" "1" "$(SU "select count(*) from public.moderation_actions where target_id='$PA1' and action='remove'")"

echo "== no notification for a deleted account"
as $GONE authenticated "select public.delete_my_account('soon_gone')" >/dev/null
as $MOD authenticated "select public.mod_review('post','$PG','remove','spam')" >/dev/null
eq "removed; no notification row for the deleted account" "0" "$(SU "select count(*) from public.notifications where user_id='$GONE'")"
eq "...but the removal is logged" "1" "$(SU "select count(*) from public.moderation_actions where target_id='$PG' and action='remove'")"
as $MOD authenticated "select public.mod_review('post','$PG','restore')" >/dev/null
eq "restore of a moderator-removed post by a deleted account works, still no notification" "0" "$(SU "select count(*) from public.notifications where user_id='$GONE'")"

echo "== admin_set_nickname"
as $ADM authenticated "select public.admin_set_nickname('$BOB','bob_renamed')" >/dev/null
eq "rename works" "bob_renamed" "$(SU "select nickname from public.profiles where id='$BOB'")"
chk "deleted account refused" "account_deleted" "$(as $ADM authenticated "select public.admin_set_nickname('$GONE','zombie_name')")"
eq "...nickname stays null" "" "$(SU "select coalesce(nickname,'') from public.profiles where id='$GONE'")"
chk "taken (case-insensitive)" "nickname_taken" "$(as $ADM authenticated "select public.admin_set_nickname('$BOB','ALICE_UNM')")"
chk "invalid characters" "nickname_invalid" "$(as $ADM authenticated "select public.admin_set_nickname('$BOB','no spaces!')")"
chk "too short" "nickname_invalid" "$(as $ADM authenticated "select public.admin_set_nickname('$BOB','ab')")"
chk "unknown user" "not_found" "$(as $ADM authenticated "select public.admin_set_nickname('${P}fd','valid_name')")"
chk "moderator cannot" "forbidden" "$(as $MOD authenticated "select public.admin_set_nickname('$BOB','mod_try')")"
chk "plain user cannot" "forbidden" "$(as $ALICE authenticated "select public.admin_set_nickname('$BOB','user_try')")"
chk "guest cannot" "permission denied" "$(as '' anon "select public.admin_set_nickname('$BOB','guest_try')")"
eq "invalid input is checked before anything else (admin renaming to own current name is fine)" "" "$(as $ADM authenticated "select public.admin_set_nickname('$ADM','dean_x')")"

echo; echo "RESULT: $pass passed, $fail failed"; [[ $fail -eq 0 ]]
