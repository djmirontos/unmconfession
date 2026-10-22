#!/usr/bin/env bash
# Local test run for the V1 schema against a throwaway Postgres + Supabase stubs.
# Usage: PGHOST=<socket dir> PGPORT=<port> ./tests/run.sh
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm

psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/tests/00_supabase_stub.sql" 2>/dev/null || { echo "stub failed"; exit 1; }
for f in "$HERE"/migrations/*.sql; do
  psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$f" 2>&1 | grep -v NOTICE
done

SU()  { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as()  { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1; }

pass=0; fail=0
chk() { # name want got
  if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"
  else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi
}

ALICE=aaaaaaaa-0000-4000-8000-000000000001
BOB=aaaaaaaa-0000-4000-8000-000000000002
CAROL=aaaaaaaa-0000-4000-8000-000000000003
MOD=aaaaaaaa-0000-4000-8000-000000000004
ADM=aaaaaaaa-0000-4000-8000-000000000005
EVE=aaaaaaaa-0000-4000-8000-000000000006
GOOG=aaaaaaaa-0000-4000-8000-000000000007

SU "insert into auth.users (id, email, raw_user_meta_data) values
  ('$ALICE','alice@unm.test','{\"nickname\":\"alice_unm\"}'),
  ('$BOB','bob@unm.test','{\"nickname\":\"bobby.b\"}'),
  ('$CAROL','carol@unm.test','{\"nickname\":\"carol_c\"}'),
  ('$MOD','mod@unm.test','{\"nickname\":\"juan_mod\"}'),
  ('$ADM','admin@unm.test','{\"nickname\":\"dean_x\"}'),
  ('$EVE','eve@unm.test','{\"nickname\":\"eve_e\"}');
  update public.user_flags set role='moderator' where user_id='$MOD';
  update public.user_flags set role='admin' where user_id='$ADM';" >/dev/null

echo "== signup / nickname"
chk "duplicate nickname (case-insensitive)" "nickname_taken"    "$(SU "insert into auth.users (email, raw_user_meta_data) values ('x1@unm.test','{\"nickname\":\"ALICE_UNM\"}')")"
chk "nickname too short"                    "nickname_invalid"  "$(SU "insert into auth.users (email, raw_user_meta_data) values ('x2@unm.test','{\"nickname\":\"ab\"}')")"
chk "reserved nickname"                     "nickname_reserved" "$(SU "insert into auth.users (email, raw_user_meta_data) values ('x3@unm.test','{\"nickname\":\"Admin\"}')")"
SU "insert into auth.users (id, email) values ('$GOOG','g@unm.test')" >/dev/null
chk "oauth user starts without nickname"    "t" "$(SU "select (nickname is null) from public.profiles where id='$GOOG'")"
chk "cannot post before choosing nickname"  "nickname_required" "$(as $GOOG authenticated "select * from public.create_post('confession','hi')")"
chk "set_nickname works once"               "" "$(as $GOOG authenticated "select public.set_nickname('goog_user')")"
chk "second set_nickname is locked"         "nickname_locked" "$(as $GOOG authenticated "select public.set_nickname('other_name')")"
chk "nickname column not writable by users" "permission denied" "$(as $ALICE authenticated "update public.profiles set nickname='newname' where id='$ALICE'")"
chk "nickname trigger blocks non-admin path" "nickname_locked" "$(SU "select set_config('request.jwt.claim.sub','$ALICE',false); update public.profiles set nickname='newname' where id='$ALICE'" | tail -3)"
chk "admin can rename a user"               "renamed_by_admin" "$(as $ADM authenticated "select public.admin_set_nickname('$EVE','renamed_by_admin'); select nickname from public.profiles where id='$EVE'")"
as $ADM authenticated "select public.admin_set_nickname('$EVE','eve_e')" >/dev/null
chk "guest: free nickname available"        "t" "$(as '' anon "select public.is_nickname_available('fresh_name')")"
chk "taken nickname unavailable (any case)" "f" "$(as '' anon "select public.is_nickname_available('ALICE_UNM')")"
chk "reserved nickname unavailable"         "f" "$(as '' anon "select public.is_nickname_available('admin_1')")"
chk "invalid nickname unavailable"          "f" "$(as '' anon "select public.is_nickname_available('ab')")"
chk "null nickname unavailable"             "f" "$(as '' anon "select public.is_nickname_available(null)")"
chk "availability check trims like signup"  "f" "$(as $BOB authenticated "select public.is_nickname_available('  alice_unm ')")"
chk "avatar update allowed"                "1" "$(as $ALICE authenticated "with u as (update public.profiles set avatar_key='avatar_07' where id='$ALICE' returning 1) select count(*) from u")"
chk "cannot change someone else's avatar"   "0" "$(as $ALICE authenticated "with u as (update public.profiles set avatar_key='avatar_09' where id='$BOB' returning 1) select count(*) from u")"

echo "== posting, numbering, feed"
chk "confession published + numbered #1" "published|1" "$(as $ALICE authenticated "select status, number from public.create_post('confession','First confession')")"
chk "second confession numbered #2"      "published|2" "$(as $BOB authenticated "select status, number from public.create_post('confession','Bob confession')")"
BOBPOST=$(as $BOB authenticated "select id from public.create_post('confession','Hello from bob')")
chk "guest can read feed, newest first"  "Hello from bob" "$(as '' anon "select body from public.get_feed(null,null,1)")"
chk "feed shows nickname not email"      "bobby.b" "$(as '' anon "select nickname from public.get_feed(null,null,1)")"
chk "direct INSERT on posts denied"      "permission denied" "$(as $ALICE authenticated "insert into public.posts (kind, author_id, body, status) values ('confession','$ALICE','x','published')")"
chk "guest cannot call create_post"      "permission denied" "$(as '' anon "select * from public.create_post('confession','x')")"
chk "guest cannot read auth.users"       "permission denied" "$(as '' anon "select email from auth.users")"
chk "member cannot read auth.users"      "permission denied" "$(as $ALICE authenticated "select email from auth.users")"
chk "shoutout needs target"              "target_required" "$(as $ALICE authenticated "select * from public.create_post('shoutout','For you')")"
chk "shoutout ok"                        "published" "$(as $ALICE authenticated "select status from public.create_post('shoutout','Thanks!','Prof Reyes BSIT')")"

echo "== keyword hold + moderation"
HELD=$(as $ALICE authenticated "select id from public.create_post('confession','message him at fb.com/juan.d')")
chk "keyword post is held, not numbered" "pending|" "$(as $ALICE authenticated "select status, coalesce(number::text,'') from public.posts where id='$HELD'")"
chk "held post not in feed"              "0" "$(as '' anon "select count(*) from public.feed_posts where id='$HELD'")"
chk "other member cannot see held post"  "0" "$(as $BOB authenticated "select count(*) from public.posts where id='$HELD'")"
chk "author cannot see hold reason/term" "0" "$(as $ALICE authenticated "select count(*) from public.moderation_holds")"
chk "mod sees matched term in queue"     "keyword|fb.com/" "$(as $MOD authenticated "select hold_reason, matched_term from public.mod_get_queue() where target_id='$HELD'")"
chk "phone number regex holds"           "pending" "$(as $ALICE authenticated "select status from public.create_post('confession','call 0917 123 4567')")"
chk "non-staff cannot review"            "forbidden" "$(as $ALICE authenticated "select public.mod_review('post','$HELD','approve')")"
chk "approve publishes + assigns number" "published|" "$(as $MOD authenticated "select public.mod_review('post','$HELD','approve'); select status, number from public.posts where id='$HELD'")"
chk "approved post now in feed"          "1" "$(as '' anon "select count(*) from public.feed_posts where id='$HELD'")"
chk "author notified of approval"        "content_approved" "$(as $ALICE authenticated "select type from public.notifications where target_id='$HELD' and type like 'content%'")"
HELD2=$(as $ALICE authenticated "select id from public.create_post('confession','dial 09171234567 now')")
chk "reject needs reason"                "reason_required" "$(as $MOD authenticated "select public.mod_review('post','$HELD2','reject')")"
chk "reject sets status and reason"      "rejected|doxxing|" "$(as $MOD authenticated "select public.mod_review('post','$HELD2','reject','doxxing'); select status, reject_reason, coalesce(number::text,'') from public.posts where id='$HELD2'")"
chk "author sees rejection reason"       "doxxing" "$(as $ALICE authenticated "select reject_reason from public.posts where id='$HELD2'")"
chk "cannot approve a rejected post"     "invalid_transition" "$(as $MOD authenticated "select public.mod_review('post','$HELD2','approve')")"
chk "word match respects boundaries"     "published" "$(as $ALICE authenticated "select status from public.create_listing('sell','Gunting scissors',null,50,'good')")"
chk "prohibited item listing held"       "pending" "$(as $ALICE authenticated "select status from public.create_listing('sell','Alak 1 case',null,500,'new')")"
chk "keyword match is case-insensitive"  "pending" "$(as $ALICE authenticated "select status from public.create_listing('sell','GUN toy',null,500,'new')")"
SU "insert into public.keywords (term, match_type) values ('a.b','word')" >/dev/null
chk "regex metachar escaped (a.b)"       "published|pending" "$(as $ALICE authenticated "select (select status from public.create_comment('post','$BOBPOST','axb is fine')) || '|' || (select status from public.create_comment('post','$BOBPOST','see a.b here'))")"

echo "== polls"
chk "poll needs 2+ options"   "invalid_poll_options" "$(as $BOB authenticated "select * from public.create_post('poll','Best canteen?',null,'[]',array['Only one'],now()+interval '1 day')")"
POLL=$(as $BOB authenticated "select id from public.create_post('poll','Best canteen?',null,'[]',array['North','South','Main'],now()+interval '1 day')")
OPT=$(SU "select id from public.poll_options where post_id='$POLL' and position=1")
chk "poll has numbering skipped"  "|" "$(as $BOB authenticated "select coalesce(number::text,'') || '|' from public.posts where id='$POLL'")"
chk "vote counted"            "1" "$(as $ALICE authenticated "select public.vote_poll('$POLL','$OPT'); select vote_count from public.poll_options where id='$OPT'")"
chk "second vote rejected"    "already_voted" "$(as $ALICE authenticated "select public.vote_poll('$POLL','$OPT')")"
chk "feed shows my_vote"      "$OPT" "$(as $ALICE authenticated "select my_vote from public.get_feed() where id='$POLL'")"
chk "other users' vote hidden" "" "$(as $BOB authenticated "select count(*) from public.poll_votes where user_id='$ALICE'" | grep -v '^0$')"
SU "update public.posts set ends_at = now() - interval '1 minute' where id='$POLL'" >/dev/null
chk "closed poll rejects votes" "poll_closed" "$(as $CAROL authenticated "select public.vote_poll('$POLL','$OPT')")"

echo "== reactions, comments, counters"
chk "reaction increments count"        "1" "$(as $ALICE authenticated "select public.set_reaction('$BOBPOST','love'); select reaction_count from public.posts where id='$BOBPOST'")"
chk "owner notified once"              "1" "$(as $BOB authenticated "select count(*) from public.notifications where type='reaction' and target_id='$BOBPOST'")"
chk "change reaction keeps count 1"    "1" "$(as $ALICE authenticated "select public.set_reaction('$BOBPOST','haha'); select reaction_count from public.posts where id='$BOBPOST'")"
chk "changing reaction does not re-notify" "1" "$(SU "select count(*) from public.notifications where type='reaction' and target_id='$BOBPOST' and user_id='$BOB'")"
chk "feed my_reaction"                 "haha" "$(as $ALICE authenticated "select my_reaction from public.get_feed() where id='$BOBPOST'")"
chk "remove reaction"                  "0" "$(as $ALICE authenticated "select public.set_reaction('$BOBPOST',null); select reaction_count from public.posts where id='$BOBPOST'")"
chk "comment on post notifies owner"   "comment" "$(as $CAROL authenticated "select public.create_comment('post','$BOBPOST','nice one')" >/dev/null; as $BOB authenticated "select type from public.notifications where type='comment' and target_id='$BOBPOST' limit 1")"
CHELD=$(as $CAROL authenticated "select id from public.create_comment('post','$BOBPOST','text me 09181234567')")
chk "held comment not counted"         "published|pending" "$(SU "select (select status from public.comments where body='nice one') || '|' || (select status from public.comments where id='$CHELD')")"
chk "approve comment bumps count"      "3" "$(as $MOD authenticated "select public.mod_review('comment','$CHELD','approve'); select comment_count from public.posts where id='$BOBPOST'")"
chk "get_comments oldest first + nickname" "alice_unm,carol_c,carol_c" "$(as '' anon "select string_agg(nickname, ',' order by published_at, id) from public.get_comments('post','$BOBPOST')")"
chk "comment on missing post"          "not_found" "$(as $CAROL authenticated "select * from public.create_comment('post','00000000-0000-0000-0000-000000000000','x')")"
chk "guest cannot comment"             "permission denied" "$(as '' anon "select * from public.create_comment('post','$BOBPOST','x')")"

echo "== listings"
chk "lost&found needs location/date" "invalid_lost_found" "$(as $ALICE authenticated "select * from public.create_listing('lost_found','Black wallet')")"
chk "sell needs price"               "invalid_price" "$(as $ALICE authenticated "select * from public.create_listing('sell','Chair')")"
chk "lost&found ok"                  "published" "$(as $ALICE authenticated "select status from public.create_listing('lost_found','Black wallet',null,null,null,'Library 2F', current_date)")"
chk "get_listings by kind"           "Calculator" "$(as $ALICE authenticated "select status from public.create_listing('sell','Calculator',null,150,'good')" >/dev/null; as '' anon "select title from public.get_listings('sell') where title='Calculator'")"
LST=$(as $ALICE authenticated "select id from public.create_listing('sell','Desk lamp',null,200,'good')")
chk "only owner can close listing"   "not_found" "$(as $BOB authenticated "select public.set_listing_closed('$LST', true)")"
chk "owner can mark sold"            "t" "$(as $ALICE authenticated "select public.set_listing_closed('$LST', true); select is_closed from public.listings where id='$LST'")"

echo "== images"
chk "foreign folder rejected"  "invalid_images" "$(as $ALICE authenticated "select * from public.create_post('confession','pic','',  '[{\"path\":\"$BOB/a.jpg\",\"width\":800,\"height\":600}]')")"
chk "3 images rejected"        "too_many_images" "$(as $ALICE authenticated "select * from public.create_post('confession','pic',null,'[{},{},{}]')")"
chk "2 valid images stored"    "2" "$(as $ALICE authenticated "select jsonb_array_length(images) from public.create_post('confession','two pics',null,'[{\"path\":\"$ALICE/a.jpg\",\"width\":1440,\"height\":900,\"blurhash\":\"LEHV6nWB2yk8pyo0adR*.7kCMdnj\"},{\"path\":\"$ALICE/b.webp\",\"width\":900,\"height\":900}]')")"
chk "poll cannot carry images" "invalid_images" "$(as $BOB authenticated "select * from public.create_post('poll','Which one?',null,'[{\"path\":\"$BOB/a.jpg\",\"width\":1,\"height\":1}]',array['a','b'],now()+interval '1 day')")"

echo "== moderation mode, settings, branding"
chk "mod cannot change moderation_mode" "admin_only" "$(as $MOD authenticated "update public.app_settings set moderation_mode='pre'")"
chk "member cannot edit settings"       "0" "$(as $ALICE authenticated "with u as (update public.app_settings set app_name='hack' returning 1) select count(*) from u")"
chk "mod can edit app name"             "UNM Confess" "$(as $MOD authenticated "update public.app_settings set app_name='UNM Confess'; select app_name from public.app_settings")"
chk "guest sees branding only"          "permission denied" "$(as '' anon "select moderation_mode from public.app_settings")"
chk "guest reads app name"              "UNM Confess" "$(as '' anon "select app_name from public.app_settings")"
chk "admin switches to pre-moderation"  "pre" "$(as $ADM authenticated "update public.app_settings set moderation_mode='pre'; select moderation_mode from public.app_settings")"
chk "pre mode holds normal post"        "pending" "$(as $CAROL authenticated "select status from public.create_post('confession','totally normal text')")"
chk "pre mode: staff post goes live"    "published" "$(as $MOD authenticated "select status from public.create_post('confession','mod post')")"
chk "pre-mod hold reason recorded"      "pre_moderation" "$(as $MOD authenticated "select hold_reason from public.mod_get_queue() where body='totally normal text'")"
as $ADM authenticated "update public.app_settings set moderation_mode='post'" >/dev/null

echo "== identity + audit"
chk "member cannot view identity" "forbidden" "$(as $BOB authenticated "select * from public.admin_view_identity('post','$BOBPOST')")"
chk "moderator cannot view identity" "forbidden" "$(as $MOD authenticated "select * from public.admin_view_identity('post','$BOBPOST')")"
chk "admin sees email + nickname" "bobby.b|bob@unm.test" "$(as $ADM authenticated "select nickname, email from public.admin_view_identity('post','$BOBPOST')")"
chk "lookup is audit-logged" "1|$ADM" "$(as $ADM authenticated "select count(*), min(admin_id::text) from public.identity_audit_log")"
chk "moderator cannot read audit log" "0" "$(as $MOD authenticated "select count(*) from public.identity_audit_log")"
chk "member sees only own flags" "1" "$(as $ALICE authenticated "select count(*) from public.user_flags")"
chk "staff sees all flags" "7" "$(as $MOD authenticated "select count(*) from public.user_flags")"

echo "== trending, pagination"
SU "select public.refresh_trending()" >/dev/null
chk "trending contains commented post" "$BOBPOST" "$(as '' anon "select id from public.get_trending()")"
chk "refresh_trending not callable by members" "permission denied" "$(as $ALICE authenticated "select public.refresh_trending()")"
chk "active polls excludes closed" "0" "$(as '' anon "select count(*) from public.get_active_polls() where id='$POLL'")"
SU "insert into public.posts (kind, author_id, body, status, published_at)
    select 'confession','$CAROL','bulk '||g,'published', timestamptz '2026-10-20 10:00:00+00' from generate_series(1,7) g" >/dev/null
chk "keyset pagination: no dupes, no gaps" "ok" "$(SU "
  create temp table seen(id uuid);
  do \$\$ declare ts timestamptz; lid uuid; n int; total int; uniq int; begin
    select count(*) into total from public.feed_posts;
    loop
      with page as (select * from public.get_feed(ts, lid, 4)) insert into seen select id from page;
      get diagnostics n = row_count; exit when n = 0;
      select f.published_at, f.id into ts, lid from public.feed_posts f where f.id in (select id from seen) order by f.published_at asc, f.id asc limit 1;
    end loop;
    select count(distinct id) into uniq from seen;
    if (select count(*) from seen) <> total or uniq <> total then raise exception 'pagination mismatch % % %', total, uniq, (select count(*) from seen); end if;
  end \$\$;
  select 'ok'")"

echo "== rate limits, suspend/ban"
chk "11th post in an hour is limited" "rate_limited" "$(SU "do \$\$ begin
  perform set_config('request.jwt.claim.sub','$EVE',true);
  for i in 1..11 loop perform public.create_post('confession','spam '||i); end loop;
end \$\$")"
chk "mod suspends user"       "" "$(as $MOD authenticated "select public.mod_set_user_status('$EVE','suspended', now()+interval '1 day','spam')")"
chk "suspended cannot post"   "suspended" "$(as $EVE authenticated "select * from public.create_post('confession','hello')")"
chk "suspended can still read" "1" "$(as $EVE authenticated "select count(*) from public.get_feed(null,null,1)")"
chk "mod cannot ban admin"    "forbidden" "$(as $MOD authenticated "select public.mod_set_user_status('$ADM','banned',null,'x')")"
chk "mod cannot ban self"     "cannot_target_self" "$(as $MOD authenticated "select public.mod_set_user_status('$MOD','banned',null,'x')")"
chk "ban blocks commenting"   "banned" "$(as $MOD authenticated "select public.mod_set_user_status('$BOB','banned',null,'abuse')" >/dev/null; as $BOB authenticated "select * from public.create_comment('post','$BOBPOST','x')")"
chk "restore user"            "published" "$(as $MOD authenticated "select public.mod_set_user_status('$BOB','active')" >/dev/null; as $BOB authenticated "select status from public.create_post('confession','back again')")"
chk "member cannot suspend"   "forbidden" "$(as $ALICE authenticated "select public.mod_set_user_status('$BOB','banned',null,'x')")"
chk "only admin sets roles"   "forbidden" "$(as $MOD authenticated "select public.admin_set_role('$ALICE','moderator')")"
chk "admin sets role"         "moderator" "$(as $ADM authenticated "select public.admin_set_role('$CAROL','moderator'); select role from public.user_flags where user_id='$CAROL'")"
as $ADM authenticated "select public.admin_set_role('$CAROL','user')" >/dev/null

echo "== reports, removal, edit, blocks, announcements"
chk "report recorded (dup ignored)" "1" "$(as $ALICE authenticated "select public.report_content('post','$BOBPOST','bullying'); select public.report_content('post','$BOBPOST','bullying')" >/dev/null; as $MOD authenticated "select count(*) from public.reports where target_id='$BOBPOST'")"
chk "member cannot read reports"    "0" "$(as $ALICE authenticated "select count(*) from public.reports")"
chk "mod edit keeps original"       "[name removed] hello|Hello from bob" "$(as $MOD authenticated "select public.mod_edit_content('post','$BOBPOST','[name removed] hello','doxxing'); select (select body from public.posts where id='$BOBPOST') || '|' || (select original_body from public.moderation_actions where action='edit' and target_id='$BOBPOST')")"
chk "remove needs published + reason" "reason_required" "$(as $MOD authenticated "select public.mod_review('post','$BOBPOST','remove')")"
chk "remove hides post, closes report" "removed|actioned" "$(as $MOD authenticated "select public.mod_review('post','$BOBPOST','remove','bullying'); select (select status from public.posts where id='$BOBPOST') || '|' || (select status from public.reports where target_id='$BOBPOST')")"
chk "removed post gone from feed"   "0" "$(as '' anon "select count(*) from public.feed_posts where id='$BOBPOST'")"
chk "removed post's comments hidden" "0" "$(as '' anon "select count(*) from public.comments where post_id='$BOBPOST'")"
chk "owner told of removal"         "content_removed" "$(SU "select type from public.notifications where target_id='$BOBPOST' and type like 'content_removed'")"
chk "restore brings it back"        "published" "$(as $MOD authenticated "select public.mod_review('post','$BOBPOST','restore'); select status from public.posts where id='$BOBPOST'")"
chk "block is private to blocker"   "1|0" "$(as $ALICE authenticated "insert into public.user_blocks (blocker_id, blocked_id) values ('$ALICE','$BOB')" >/dev/null; echo "$(as $ALICE authenticated "select count(*) from public.user_blocks")|$(as $BOB authenticated "select count(*) from public.user_blocks")")"
chk "cannot block on someone's behalf" "row-level security" "$(as $ALICE authenticated "insert into public.user_blocks (blocker_id, blocked_id) values ('$BOB','$CAROL')")"
chk "announcement staff-only write"  "row-level security" "$(as $ALICE authenticated "insert into public.announcements (title, body) values ('x','y')")"
as $MOD authenticated "insert into public.announcements (title, body) values ('Enrollment','Starts Monday'); insert into public.announcements (title, body, starts_at, ends_at) values ('Old','x', now()-interval '3 days', now()-interval '1 day')" >/dev/null
chk "guest sees only active announcement" "1" "$(as '' anon "select count(*) from public.announcements")"
chk "member marks own notifications read"  "t" "$(as $BOB authenticated "with u as (update public.notifications set read_at=now() where user_id='$BOB' returning 1) select count(*) > 0 from u")"
chk "cannot mark others' notifications"    "0" "$(as $BOB authenticated "with u as (update public.notifications set read_at=now() where user_id='$CAROL' returning 1) select count(*) from u")"
chk "cannot edit someone's notification text" "permission denied" "$(as $BOB authenticated "update public.notifications set type='comment'")"

echo "== retention, account deletion, grants"
SU "update public.posts set moderated_at = now() - interval '40 days' where id='$HELD2';
    update public.identity_audit_log set created_at = now() - interval '40 days'" >/dev/null
chk "purge removes old rejected + audit" "0|0" "$(SU "select public.purge_expired() is not null; select (select count(*) from public.posts where id='$HELD2') || '|' || (select count(*) from public.identity_audit_log)" | tail -1)"
chk "purge keeps recent content"  "1" "$(SU "select count(*) from public.posts where id='$HELD'")"
chk "delete account cascades"     "0|0|0" "$(SU "delete from auth.users where id='$ALICE';
  select (select count(*) from public.profiles where id='$ALICE') || '|' || (select count(*) from public.posts where author_id='$ALICE') || '|' || (select count(*) from public.comments where author_id='$ALICE')")"
chk "deleted user's images queued for cleanup" "post-images" "$(SU "select distinct bucket from public.storage_cleanup_queue")"
chk "comment counters survive cascade" "" "$(SU "select id from public.posts where comment_count < 0")"
chk "members cannot read cleanup queue" "permission denied" "$(as $MOD authenticated "select * from public.storage_cleanup_queue")"
chk "bucket policy limits upload folder" "t" "$(SU "select count(*) = 1 from pg_policies where policyname = 'post-images: upload to own folder'")"

echo
echo "RESULT: $pass passed, $fail failed"
[[ $fail -eq 0 ]]
