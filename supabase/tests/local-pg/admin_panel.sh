#!/usr/bin/env bash
# Tests for 20261027100000_admin_panel.sql
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_ap
psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/tests/00_supabase_stub.sql" 2>/dev/null || { echo "stub failed"; exit 1; }
# the stub's auth.users is minimal; the real one has these columns
psql -X -q -d $DB -c "alter table auth.users add column last_sign_in_at timestamptz, add column email_confirmed_at timestamptz, add column raw_app_meta_data jsonb not null default '{}'::jsonb"
LIST="20261021000000_v1_schema 20261022100000_feed_events 20261022110000_allow_three_images 20261023100000_lost_found_manila_date 20261023110000_lost_found_type 20261023120000_edit_delete_own 20261023130000_comments_edit_delete 20261024100000_poll_vote_change 20261024110000_block_filtering 20261024120000_notifications 20261025100000_comment_reactions 20261025110000_top_reactions 20261025120000_comment_replies 20261025130000_listings_filters 20261026100000_account_settings 20261026110000_nickname_keywords 20261026120000_delete_account_closes_listings 20261026130000_terms_acceptance 20261027100000_admin_panel"
for f in $LIST; do
  [[ $f == 20261024110000_block_filtering ]] && psql -X -q -d $DB -c "revoke all on public.user_blocks from anon"
  psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/$f.sql" 2>&1 | grep -v NOTICE
done
SU() { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }
eq()  { if [[ "$3" == "$2" ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }
P=77777777-0000-4000-8000-0000000000
ALICE=${P}01; BOB=${P}02; CAROL=${P}03; MOD=${P}04; ADM=${P}05; ADM2=${P}06; EVE=${P}07
SU "insert into auth.users (id,email,raw_user_meta_data,last_sign_in_at,email_confirmed_at,raw_app_meta_data) values
  ('$ALICE','alice@unm.test','{\"nickname\":\"alice_unm\"}', now(), now(), '{\"providers\":[\"email\"]}'),
  ('$BOB','bob@unm.test','{\"nickname\":\"bobby.b\"}', null, null, '{\"providers\":[\"email\",\"google\"]}'),
  ('$CAROL','carol@unm.test','{\"nickname\":\"carol_c\"}', null, now(), '{}'),
  ('$MOD','mod@unm.test','{\"nickname\":\"juan_mod\"}', null, now(), '{}'),
  ('$ADM','admin@unm.test','{\"nickname\":\"dean_x\"}', null, now(), '{}'),
  ('$ADM2','admin2@unm.test','{\"nickname\":\"dean_two\"}', null, now(), '{}'),
  ('$EVE','eve@unm.test','{\"nickname\":\"eve_e\"}', null, now(), '{}');
  update public.user_flags set role='moderator' where user_id='$MOD';
  update public.user_flags set role='admin' where user_id in ('$ADM','$ADM2');" >/dev/null

PUB=${P}a1; PEND=${P}a2; POLL=${P}a3; CMT=${P}b1; CMT2=${P}b2; LST=${P}c1; LST2=${P}c2
SU "insert into public.posts (id,number,kind,author_id,body,status,published_at,created_at) values
  ('$PUB',nextval('public.post_number_seq'),'confession','$ALICE','Published confession about the library','published',now()-interval '3 hours',now()-interval '3 hours'),
  ('$PEND',nextval('public.post_number_seq'),'confession','$ALICE','Pending confession waiting for review','pending',null,now()-interval '2 hours');
  insert into public.posts (id,number,kind,author_id,body,ends_at,status,published_at,created_at) values
  ('$POLL',nextval('public.post_number_seq'),'poll','$BOB','Best canteen? 100% sure_thing','2027-01-01','published',now()-interval '1 hour',now()-interval '1 hour');
  insert into public.comments (id,post_id,author_id,body,status,published_at,created_at) values
  ('$CMT','$PUB','$BOB','Nice one','published',now()-interval '150 minutes',now()-interval '150 minutes'),
  ('$CMT2','$PUB','$CAROL','Spam link here','pending',null,now()-interval '90 minutes');
  insert into public.listings (id,kind,author_id,title,description,price,status,published_at,created_at) values
  ('$LST','sell','$CAROL','Calculator for sale','Casio fx-991, barely used',500,'published',now()-interval '30 minutes',now()-interval '30 minutes'),
  ('$LST2','sell','$CAROL','Pending sale','waiting',100,'pending',null,now()-interval '20 minutes');
  insert into public.moderation_holds (target_type,target_id,reason,matched_term) values ('post','$PEND','keyword','badword'),('comment','$CMT2','keyword','spam');
  insert into public.reports (reporter_id,target_type,target_id,reason,note,created_at) values
  ('$BOB','post','$PUB','bullying','mean to me',now()-interval '100 minutes'),
  ('$CAROL','post','$PUB','doxxing',null,now()-interval '80 minutes'),
  ('$ALICE','listing','$LST','prohibited_item',null,now()-interval '40 minutes'),
  ('$BOB','comment','$CMT2','spam',null,now()-interval '10 minutes');" >/dev/null

echo "== access control"
for fn in "mod_get_reports()" "mod_get_report_details('post','$PUB')" "mod_get_content('post','$PUB')" "mod_list_content()" "mod_search_users()" "mod_get_actions()" "mod_dashboard()"; do
  chk "guest cannot $fn" "permission denied" "$(as '' anon "select * from public.$fn")"
  chk "plain user cannot $fn" "forbidden" "$(as $ALICE authenticated "select * from public.$fn")"
done
for fn in "admin_get_user_identity('$ALICE')" "admin_find_user_by_email('alice@unm.test')" "admin_get_audit()"; do
  chk "guest cannot $fn" "permission denied" "$(as '' anon "select * from public.$fn")"
  chk "plain user cannot $fn" "forbidden" "$(as $ALICE authenticated "select * from public.$fn")"
  chk "moderator cannot $fn" "forbidden" "$(as $MOD authenticated "select * from public.$fn")"
done
chk "guest cannot admin_delete_account" "permission denied" "$(as '' anon "select public.admin_delete_account('$EVE','x')")"
chk "moderator cannot admin_delete_account" "forbidden" "$(as $MOD authenticated "select public.admin_delete_account('$EVE','x')")"
chk "plain user cannot read admin_audit_log" "0" "$(as $ALICE authenticated "select count(*) from public.admin_audit_log")"
chk "plain user cannot write admin_audit_log" "permission denied" "$(as $ALICE authenticated "insert into public.admin_audit_log (action) values ('set_role')")"
chk "even an admin cannot write admin_audit_log directly" "permission denied" "$(as $ADM authenticated "insert into public.admin_audit_log (action) values ('set_role')")"
# a suspended moderator loses access
SU "update public.user_flags set status='suspended', suspended_until=now()+interval '1 day' where user_id='$MOD'" >/dev/null
chk "suspended moderator is locked out" "forbidden" "$(as $MOD authenticated "select * from public.mod_dashboard()")"
SU "update public.user_flags set status='active', suspended_until=null where user_id='$MOD'" >/dev/null

echo "== dashboard"
eq "counts" "1|1|1|4|3|2|1|1|7|0|0|0" "$(as $MOD authenticated "select pending_posts||'|'||pending_comments||'|'||pending_listings||'|'||open_reports||'|'||reported_items||'|'||posts_24h||'|'||comments_24h||'|'||listings_24h||'|'||new_users_24h||'|'||suspended_users||'|'||banned_users||'|'||deleted_accounts from public.mod_dashboard()")"

echo "== reports queue"
eq "three reported items, oldest first" "post,listing,comment" "$(as $MOD authenticated "select string_agg(target_type::text, ',' order by first_reported_at) from public.mod_get_reports()")"
eq "post: 2 reports, both reasons, author" "2|{bullying,doxxing}|alice_unm|published" "$(as $MOD authenticated "select report_count||'|'||reasons::text||'|'||nickname||'|'||content_status from public.mod_get_reports() where target_id='$PUB'")"
eq "pending comment is shown with its body" "Spam link here" "$(as $MOD authenticated "select body from public.mod_get_reports() where target_id='$CMT2'")"
eq "listing shows title" "Calculator for sale" "$(as $MOD authenticated "select title from public.mod_get_reports() where target_id='$LST'")"
eq "keyset: page of 1 then next" "$PUB|$LST" "$(as $MOD authenticated "select (select target_id from public.mod_get_reports(1))||'|'||(select target_id from public.mod_get_reports(1, (select first_reported_at from public.mod_get_reports(1)), '$PUB'))")"
eq "limit above 100 is capped, below 1 is raised" "3|1" "$(as $MOD authenticated "select (select count(*) from public.mod_get_reports(1000))||'|'||(select count(*) from public.mod_get_reports(-5))")"
as $MOD authenticated "select public.mod_resolve_report((select id from public.reports where target_id='$LST'), 'dismissed')" >/dev/null
eq "handled reports leave the queue" "2" "$(as $MOD authenticated "select count(*) from public.mod_get_reports()")"
eq "report details: reasons and reporters" "bullying:bobby.b|doxxing:carol_c" "$(as $MOD authenticated "select string_agg(reason||':'||reporter_nickname, '|' order by created_at) from public.mod_get_report_details('post','$PUB')")"
eq "details include handled ones with the handler" "dismissed:juan_mod" "$(as $MOD authenticated "select status||':'||handled_by_nickname from public.mod_get_report_details('listing','$LST')")"
eq "details of something with no reports: empty" "0" "$(as $MOD authenticated "select count(*) from public.mod_get_report_details('post','$POLL')")"

echo "== content detail"
eq "published post" "confession|published|alice_unm|1|1|2" "$(as $MOD authenticated "select kind||'|'||status||'|'||nickname||'|'||post_number||'|'||comment_count||'|'||open_report_count from public.mod_get_content('post','$PUB')")"
eq "pending post carries the hold reason and term" "keyword|badword" "$(as $MOD authenticated "select hold_reason||'|'||matched_term from public.mod_get_content('post','$PEND')")"
eq "poll extra has ends_at" "true" "$(as $MOD authenticated "select (extra ? 'ends_at')::text from public.mod_get_content('post','$POLL')")"
eq "comment points at its post" "$PUB" "$(as $MOD authenticated "select post_id from public.mod_get_content('comment','$CMT2')")"
eq "listing extra" "500.00|false" "$(as $MOD authenticated "select (extra->>'price')||'|'||(extra->>'is_closed') from public.mod_get_content('listing','$LST')")"
eq "author status and deleted flag" "active|false" "$(as $MOD authenticated "select author_status||'|'||author_deleted from public.mod_get_content('post','$PUB')")"
chk "unknown id" "not_found" "$(as $MOD authenticated "select * from public.mod_get_content('post','$P"'ff'"')")"
chk "type mismatch is not found, not an error leak" "not_found" "$(as $MOD authenticated "select * from public.mod_get_content('comment','$PUB')")"
as $MOD authenticated "select public.mod_review('post','$PEND','approve')" >/dev/null
eq "after approval the hold is gone and moderator is named" "|juan_mod" "$(as $MOD authenticated "select coalesce(hold_reason,'')||'|'||moderated_by_nickname from public.mod_get_content('post','$PEND')")"

echo "== browse and search content"
eq "all content, newest first" "$LST2,$LST,$POLL,$CMT2,$PEND,$CMT,$PUB" "$(as $MOD authenticated "select string_agg(target_id::text, ',' order by created_at desc) from public.mod_list_content(p_limit => 50)")"
eq "filter by type" "2" "$(as $MOD authenticated "select count(*) from public.mod_list_content('comment')")"
eq "filter by status" "1" "$(as $MOD authenticated "select count(*) from public.mod_list_content(p_status => 'pending', p_type => 'listing')")"
eq "search body text, case-insensitive" "$PUB" "$(as $MOD authenticated "select target_id from public.mod_list_content(p_search => 'LIBRARY')")"
eq "search by post number" "$PUB" "$(as $MOD authenticated "select target_id from public.mod_list_content(p_type => 'post', p_search => '#1')")"
chk "search by plain number finds the post (and anything containing the digit)" "$PUB" "$(as $MOD authenticated "select target_id from public.mod_list_content(p_type => 'post', p_search => '1')")"
eq "search listing by title" "$LST" "$(as $MOD authenticated "select target_id from public.mod_list_content(p_search => 'calculator')")"
eq "search listing by description" "$LST" "$(as $MOD authenticated "select target_id from public.mod_list_content(p_search => 'casio')")"
eq "percent sign is literal, not a wildcard" "$POLL" "$(as $MOD authenticated "select target_id from public.mod_list_content(p_search => '100%')")"
eq "bare percent matches only the one containing it" "1" "$(as $MOD authenticated "select count(*) from public.mod_list_content(p_search => '%')")"
eq "underscore is literal" "$POLL" "$(as $MOD authenticated "select target_id from public.mod_list_content(p_search => 'sure_thing')")"
eq "backslash is literal and harmless" "0" "$(as $MOD authenticated "select count(*) from public.mod_list_content(p_search => '\\')")"
eq "quote characters are safe" "0" "$(as $MOD authenticated "select count(*) from public.mod_list_content(p_search => '''; drop table public.posts; --')")"
eq "posts table still there" "3" "$(SU "select count(*) from public.posts")"
eq "keyset paging" "$POLL" "$(as $MOD authenticated "select target_id from public.mod_list_content(p_limit => 1, p_after_ts => (select created_at from public.listings where id='$LST'), p_after_id => '$LST')")"
eq "author nickname is joined" "carol_c" "$(as $MOD authenticated "select nickname from public.mod_list_content(p_search => 'calculator')")"

echo "== users"
eq "search by nickname part" "alice_unm" "$(as $MOD authenticated "select nickname from public.mod_search_users('ALICE')")"
eq "underscore in search is literal" "0" "$(as $MOD authenticated "select count(*) from public.mod_search_users('alice_x')")"
eq "role filter" "dean_two,dean_x" "$(as $MOD authenticated "select string_agg(nickname, ',' order by nickname) from public.mod_search_users(p_role => 'admin')")"
eq "everyone listed, newest first by default" "7" "$(as $MOD authenticated "select count(*) from public.mod_search_users()")"
eq "one user with counts: alice 2 posts, 0 comments, 0 listings, 2 open reports against her" "alice_unm|2|0|0|2" "$(as $MOD authenticated "select nickname||'|'||post_count||'|'||comment_count||'|'||listing_count||'|'||open_reports_against from public.mod_search_users(p_user => '$ALICE')")"
eq "carol: 1 comment, 2 listings, 1 open report (the spam comment)" "1|2|1" "$(as $MOD authenticated "select comment_count||'|'||listing_count||'|'||open_reports_against from public.mod_search_users(p_user => '$CAROL')")"
chk "the result has no email column" "ERROR" "$(as $MOD authenticated "select email from public.mod_search_users()")"
as $MOD authenticated "select public.mod_set_user_status('$EVE','banned',null,'spam')" >/dev/null
eq "status filter" "eve_e" "$(as $MOD authenticated "select nickname from public.mod_search_users(p_status => 'banned')")"

echo "== moderation log"
eq "log shows the approve and the ban with the actor" "ban:eve_e->juan_mod" "$(as $MOD authenticated "select string_agg(action||':'||(select nickname from public.profiles where id=target_id)||'->'||actor_nickname, ',') from public.mod_get_actions('user')")"
eq "approve recorded" "1" "$(as $MOD authenticated "select count(*) from public.mod_get_actions(p_target_type => 'post') where action='approve'")"
as $MOD authenticated "select public.mod_edit_content('post','$PUB','Edited text','pii')" >/dev/null
eq "edit keeps the original body for staff" "Published confession about the library" "$(as $MOD authenticated "select original_body from public.mod_get_actions(p_target_id => '$PUB')")"
eq "subject filter: actions on alice's content" "2" "$(as $MOD authenticated "select count(*) from public.mod_get_actions(p_subject_user => '$ALICE')")"
eq "subject filter: actions on eve herself" "1" "$(as $MOD authenticated "select count(*) from public.mod_get_actions(p_subject_user => '$EVE')")"
eq "actor filter" "3" "$(as $MOD authenticated "select count(*) from public.mod_get_actions(p_actor => '$MOD')")"
eq "paging: page of 2 then the rest" "2|1" "$(as $MOD authenticated "select (select count(*) from public.mod_get_actions(p_limit => 2))||'|'||(select count(*) from public.mod_get_actions(p_limit => 2, p_after_ts => (select min(created_at) from (select created_at from public.mod_get_actions(p_limit => 2)) x), p_after_id => (select id from public.mod_get_actions(p_limit => 2) order by created_at, id limit 1)))")"

echo "== admin identity tools and audit"
eq "identity: email, providers, confirmed" "alice@unm.test|{email}|true" "$(as $ADM authenticated "select email||'|'||providers::text||'|'||email_confirmed from public.admin_get_user_identity('$ALICE')")"
eq "identity: google provider listed, unconfirmed" "{email,google}|false" "$(as $ADM authenticated "select providers::text||'|'||email_confirmed from public.admin_get_user_identity('$BOB')")"
eq "identity: empty provider metadata gives an empty array" "{}" "$(as $ADM authenticated "select providers::text from public.admin_get_user_identity('$CAROL')")"
chk "identity of unknown user" "not_found" "$(as $ADM authenticated "select * from public.admin_get_user_identity('$P"'fe'"')")"
eq "three identity views are logged" "3" "$(SU "select count(*) from public.admin_audit_log where action='view_identity'")"
eq "find by email, case and spaces ignored" "alice_unm" "$(as $ADM authenticated "select nickname from public.admin_find_user_by_email('  ALICE@unm.test ')")"
eq "no match: no rows, no error" "0" "$(as $ADM authenticated "select count(*) from public.admin_find_user_by_email('nobody@x.test')")"
chk "blank email" "invalid_email" "$(as $ADM authenticated "select * from public.admin_find_user_by_email('   ')")"
eq "both searches logged; searched address is not stored" "2|0" "$(SU "select count(*)||'|'||count(*) filter (where detail like '%@%') from public.admin_audit_log where action='find_by_email'")"
eq "audit feed shows admin and subject names" "dean_x|alice_unm" "$(as $ADM authenticated "select admin_nickname||'|'||subject_nickname from public.admin_get_audit() where action='find_by_email' and subject_user_id is not null limit 1")"
as $ADM authenticated "select * from public.admin_view_identity('post','$PUB')" >/dev/null
eq "old content-author lookup also appears in the feed" "1" "$(as $ADM authenticated "select count(*) from public.admin_get_audit() where action='view_content_author'")"
eq "feed is newest first" "view_content_author" "$(as $ADM authenticated "select action from public.admin_get_audit(1)")"

echo "== roles"
as $ADM authenticated "select public.admin_set_role('$ALICE','moderator')" >/dev/null
eq "role changed and logged" "moderator|user -> moderator" "$(SU "select (select role::text from public.user_flags where user_id='$ALICE')||'|'||detail from public.admin_audit_log where action='set_role'")"
chk "cannot change own role" "cannot_target_self" "$(as $ADM authenticated "select public.admin_set_role('$ADM','user')")"
chk "unknown user" "not_found" "$(as $ADM authenticated "select public.admin_set_role('$P"'fd'"','user')")"
chk "moderator cannot change roles" "forbidden" "$(as $MOD authenticated "select public.admin_set_role('$BOB','moderator')")"
as $ADM authenticated "select public.admin_set_role('$ALICE','user')" >/dev/null

echo "== deleted accounts are protected"
# a user deletes themselves
as $CAROL authenticated "select public.delete_my_account('carol_c')" >/dev/null
eq "carol is deleted" "true" "$(as $MOD authenticated "select deleted::text from public.mod_search_users(p_user => '$CAROL')")"
eq "deleted accounts are hidden from normal search" "0" "$(as $MOD authenticated "select count(*) from public.mod_search_users(p_search => '', p_status => 'banned') where user_id='$CAROL'")"
eq "...unless asked for" "1" "$(as $MOD authenticated "select count(*) from public.mod_search_users(p_status => 'banned', p_include_deleted => true) where user_id='$CAROL'")"
chk "moderator cannot unban a deleted account" "account_deleted" "$(as $MOD authenticated "select public.mod_set_user_status('$CAROL','active')")"
chk "moderator cannot suspend a deleted account" "account_deleted" "$(as $MOD authenticated "select public.mod_set_user_status('$CAROL','suspended', now()+interval '1 day', 'x')")"
chk "admin cannot give a deleted account a role" "account_deleted" "$(as $ADM authenticated "select public.admin_set_role('$CAROL','moderator')")"
eq "carol stays banned and a user" "banned|user" "$(SU "select status||'|'||role from public.user_flags where user_id='$CAROL'")"
eq "content of the deleted account is still listed, nickname null" "1" "$(as $MOD authenticated "select count(*) from public.mod_list_content(p_search => 'calculator') where nickname is null")"
chk "identity of a deleted account: not_found" "not_found" "$(as $ADM authenticated "select * from public.admin_get_user_identity('$CAROL')")"
eq "normal moderation of live accounts still works" "suspended" "$(as $MOD authenticated "select public.mod_set_user_status('$BOB','suspended', now()+interval '2 days','test')" >/dev/null; SU "select status::text from public.user_flags where user_id='$BOB'")"
as $MOD authenticated "select public.mod_set_user_status('$BOB','active')" >/dev/null
chk "moderator still cannot target an admin" "cannot_target_admin" "$(as $ADM authenticated "select public.mod_set_user_status('$ADM2','banned',null,'x')")"
as $ADM authenticated "select public.admin_set_role('$ALICE','moderator')" >/dev/null
chk "moderator cannot target another moderator" "forbidden" "$(as $MOD authenticated "select public.mod_set_user_status('$ALICE','banned',null,'x')")"
as $ADM authenticated "select public.admin_set_role('$ALICE','user')" >/dev/null

echo "== admin_delete_account"
chk "reason required" "reason_required" "$(as $ADM authenticated "select public.admin_delete_account('$EVE','  ')")"
chk "reason too long" "reason_too_long" "$(as $ADM authenticated "select public.admin_delete_account('$EVE','$(printf 'x%.0s' $(seq 1 301))')")"
chk "cannot delete yourself" "cannot_target_self" "$(as $ADM authenticated "select public.admin_delete_account('$ADM','x')")"
chk "cannot delete an admin" "cannot_target_admin" "$(as $ADM authenticated "select public.admin_delete_account('$ADM2','x')")"
chk "active account is refused" "account_not_restricted" "$(as $ADM authenticated "select public.admin_delete_account('$ALICE','x')")"
chk "unknown user" "not_found" "$(as $ADM authenticated "select public.admin_delete_account('$P"'fc'"','x')")"
chk "already deleted account" "not_found" "$(as $ADM authenticated "select public.admin_delete_account('$CAROL','x')")"
SU "update public.user_flags set status='suspended', suspended_until=now()-interval '1 hour' where user_id='$BOB'" >/dev/null
chk "ended suspension counts as not restricted" "account_not_restricted" "$(as $ADM authenticated "select public.admin_delete_account('$BOB','x')")"
# eve is banned and owns content, blocks, settings, notifications, a listing
SU "insert into public.listings (id,kind,author_id,title,price,status,published_at) values ('${P}c9','sell','$EVE','Eve item',10,'published',now());
    insert into public.user_blocks (blocker_id,blocked_id) values ('$EVE','$BOB'),('$BOB','$EVE');
    insert into public.posts (id,number,kind,author_id,body,status,published_at) values ('${P}a9',nextval('public.post_number_seq'),'confession','$EVE','Eve post','published',now())" >/dev/null
as $ADM authenticated "select public.admin_delete_account('$EVE','repeated harassment')" >/dev/null
eq "auth user gone" "0" "$(SU "select count(*) from auth.users where id='$EVE'")"
eq "profile kept as Deleted user: nickname null, default avatar" "|avatar_01" "$(SU "select coalesce(nickname,'')||'|'||avatar_key from public.profiles where id='$EVE'")"
eq "flags: deleted, banned, reason kept (was banned for spam)" "true|banned|spam" "$(SU "select (deleted_at is not null)::text||'|'||status||'|'||status_reason from public.user_flags where user_id='$EVE'")"
eq "post stays" "Eve post" "$(SU "select body from public.posts where id='${P}a9'")"
eq "listing closed" "true" "$(SU "select is_closed::text from public.listings where id='${P}c9'")"
eq "her own blocks erased, other people's blocks of her stay" "0|1" "$(SU "select (select count(*) from public.user_blocks where blocker_id='$EVE')||'|'||(select count(*) from public.user_blocks where blocked_id='$EVE')")"
eq "audit entry has the reason and the subject" "repeated harassment" "$(SU "select detail from public.admin_audit_log where action='delete_account' and subject_user_id='$EVE'")"
eq "audit feed shows it" "delete_account" "$(as $ADM authenticated "select action from public.admin_get_audit() where subject_user_id='$EVE' and action='delete_account'")"
eq "suspension without end date is also restricted: moderator-suspended user can be deleted" "ok" "$(SU "insert into auth.users (id,email) values ('${P}08','x8@unm.test')" >/dev/null; SU "update public.user_flags set status='suspended', suspended_until=now()+interval '3 days' where user_id='${P}08'" >/dev/null; as $ADM authenticated "select public.admin_delete_account('${P}08','x')" >/dev/null && echo ok)"
chk "moderator who was banned can be deleted by an admin (role reset)" "user" "$(SU "insert into auth.users (id,email) values ('${P}09','x9@unm.test')" >/dev/null; SU "update public.user_flags set role='moderator', status='banned' where user_id='${P}09'" >/dev/null; as $ADM authenticated "select public.admin_delete_account('${P}09','x')" >/dev/null; SU "select role::text from public.user_flags where user_id='${P}09'")"

echo "== moderation tools after the change keep their rules"
chk "moderator cannot ban himself" "cannot_target_self" "$(as $MOD authenticated "select public.mod_set_user_status('$MOD','banned',null,'x')")"
chk "suspension needs a future end" "invalid_until" "$(as $MOD authenticated "select public.mod_set_user_status('$BOB','suspended', now()-interval '1 day','x')")"
chk "plain user still cannot" "forbidden" "$(as $ALICE authenticated "select public.mod_set_user_status('$BOB','banned',null,'x')")"
chk "guest still cannot" "permission denied" "$(as '' anon "select public.mod_set_user_status('$BOB','banned',null,'x')")"

echo; echo "RESULT: $pass passed, $fail failed"; [[ $fail -eq 0 ]]
