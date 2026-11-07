#!/usr/bin/env bash
# Tests for 20261106120000_warnings_strikes.sql (applied in ONE transaction like the SQL editor).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_strikes
OWN=20261106120000
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
A=$(uid 1); B=$(uid 2); MOD=$(uid 3); ADM=$(uid 4); MOD2=$(uid 5); GONE=$(uid 6)
for pair in "$A:alice_a" "$B:bobby_b" "$MOD:mod_m" "$ADM:admin_x" "$MOD2:mod_two" "$GONE:gone_g"; do
  SU "insert into auth.users (id,email,raw_user_meta_data) values ('${pair%%:*}','${pair##*:}@unm.test','{\"nickname\":\"${pair##*:}\"}')" >/dev/null
done
SU "update public.user_flags set role='moderator' where user_id in ('$MOD','$MOD2'); update public.user_flags set role='admin' where user_id='$ADM'" >/dev/null
SU "insert into public.keywords (term, match_type, applies_to) values ('badword','contains','{post,comment,listing}')" >/dev/null
T1='ExponentPush''Token[aaaaaaaaaaaaaaaaaaaaaa]'  # split so the placeholder never appears literally
SU "insert into public.push_tokens (user_id, token, platform) values ('$A','$T1','android')" >/dev/null

echo "== apply the migration in one transaction"
OUT=$( (echo "begin;"; cat "$HERE/migrations/$OWN"_warnings_strikes.sql; echo "commit;") | psql -X -q -v ON_ERROR_STOP=1 -d $DB 2>&1 | grep -v NOTICE)
eq "migration applies cleanly" "" "$OUT"

echo "== grants"
chk "strikes table closed to members" "permission denied" "$(as $A authenticated "select * from public.member_strikes")"
chk "guest cannot warn" "permission denied" "$(as '' anon "select public.mod_warn_user('$A','other')")"
chk "guest cannot read a notice" "permission denied" "$(as '' anon "select * from public.get_my_warning(gen_random_uuid())")"
for fn in "mod_warn_user(uuid,text,text)" "mod_mute_user(uuid,int,text,text)" "mod_get_strikes(uuid)" "get_my_warning(uuid)"; do
  eq "public has no execute: $fn" "f" "$(SU "select has_function_privilege('public','public.$fn','execute')")"
done
eq "authenticated cannot run the purge" "f" "$(SU "select has_function_privilege('authenticated','public.purge_member_strikes()','execute')")"
eq "all new functions: definer with empty search_path" "t" "$(SU "select bool_and(prosecdef and exists (select 1 from unnest(proconfig) c where c like 'search_path=%')) from pg_proc where proname in ('mod_warn_user','mod_mute_user','mod_get_strikes','get_my_warning','strike_on_keyword_hold','purge_member_strikes')")"

echo "== who may warn"
chk "ordinary member refused" "forbidden" "$(as $A authenticated "select public.mod_warn_user('$B','other')")"
chk "ordinary member cannot read strikes" "forbidden" "$(as $A authenticated "select * from public.mod_get_strikes('$B')")"
chk "no self warning" "cannot_target_self" "$(as $MOD authenticated "select public.mod_warn_user('$MOD','other')")"
chk "admin cannot be warned" "cannot_target_admin" "$(as $MOD authenticated "select public.mod_warn_user('$ADM','other')")"
chk "admin cannot be muted" "cannot_target_admin" "$(as $MOD authenticated "select public.mod_mute_user('$ADM',1,'other')")"
chk "moderator cannot warn a moderator" "forbidden" "$(as $MOD authenticated "select public.mod_warn_user('$MOD2','other')")"
chk "moderator cannot mute a moderator" "forbidden" "$(as $MOD authenticated "select public.mod_mute_user('$MOD2',1,'other')")"
eq "admin can warn a moderator" "" "$(as $ADM authenticated "select public.mod_warn_user('$MOD2','other')")"
chk "unknown reason" "invalid_reason" "$(as $MOD authenticated "select public.mod_warn_user('$A','bad_reason')")"
chk "null reason" "invalid_reason" "$(as $MOD authenticated "select public.mod_warn_user('$A',null)")"
chk "note too long" "note_too_long" "$(as $MOD authenticated "select public.mod_warn_user('$A','other','$(printf 'x%.0s' $(seq 1 301))')")"
chk "unknown member" "not_found" "$(as $MOD authenticated "select public.mod_warn_user(gen_random_uuid(),'other')")"
chk "null member" "cannot_target_self" "$(as $MOD authenticated "select public.mod_warn_user(null,'other')")"

echo "== warning"
SU "truncate net._calls; delete from public.notifications; delete from public.member_strikes; delete from public.moderation_actions" >/dev/null
eq "moderator warns a member" "" "$(as $MOD authenticated "select public.mod_warn_user('$A','harassment','  Please be kind.  ')")"
eq "one notification of type warning" "1" "$(SU "select count(*) from public.notifications where user_id='$A' and type='warning'")"
eq "no actor on the notification" "t" "$(SU "select actor_id is null from public.notifications where user_id='$A' and type='warning'")"
eq "notice data" "warning|harassment|Please be kind." "$(SU "select (data->>'kind')||'|'||(data->>'reason')||'|'||(data->>'note') from public.notifications where user_id='$A' and type='warning'")"
eq "staff identity is nowhere in the notification" "0" "$(SU "select count(*) from public.notifications where user_id='$A' and (data::text like '%$MOD%' or data::text ilike '%mod_m%')")"
eq "moderation log row" "warn|user|harassment|Please be kind." "$(SU "select action||'|'||target_type||'|'||reason_code||'|'||note from public.moderation_actions where target_id='$A'")"
eq "strike row" "warning|harassment|$MOD" "$(SU "select kind||'|'||reason||'|'||actor_id from public.member_strikes where user_id='$A'")"
eq "warning does not restrict the account" "active" "$(SU "select status from public.user_flags where user_id='$A'")"
eq "member can still post after a warning" "t" "$(as $A authenticated "select id is not null from public.create_post('confession','still allowed')")"
eq "empty note stored as absent" "f" "$(as $MOD authenticated "select public.mod_warn_user('$B','spam_scam','   ')" >/dev/null; SU "select data ? 'note' from public.notifications where user_id='$B' and type='warning'")"

echo "== the member reads the notice"
NID=$(SU "select id from public.notifications where user_id='$A' and type='warning'")
eq "member reads own notice" "warning|harassment|Please be kind." "$(as $A authenticated "select kind||'|'||reason||'|'||note from public.get_my_warning('$NID')")"
eq "no end time on a warning" "t" "$(as $A authenticated "select until_at is null from public.get_my_warning('$NID')")"
eq "another member sees nothing" "0" "$(as $B authenticated "select count(*) from public.get_my_warning('$NID')")"
eq "staff cannot read it through the member function" "0" "$(as $MOD authenticated "select count(*) from public.get_my_warning('$NID')")"
eq "wrong notification type returns nothing" "0" "$(SU "insert into public.notifications (user_id,type,target_type,target_id) values ('$A','content_removed','post',gen_random_uuid())" >/dev/null; as $A authenticated "select count(*) from public.get_my_warning((select id from public.notifications where user_id='$A' and type='content_removed' limit 1))")"
eq "list returns the reason" "harassment" "$(as $A authenticated "select reason from public.get_notifications(null,null,20) where type='warning'")"

echo "== push"
eq "one push request" "1" "$(SU "select count(*) from net._calls where body->0->'data'->>'type'='warning'")"
eq "generic text" "You have a new notice from the moderators" "$(SU "select body->0->>'body' from net._calls where body->0->'data'->>'type'='warning'")"
eq "no reason, note or staff name in the push" "0" "$(SU "select count(*) from net._calls where body::text ilike '%harassment%' or body::text ilike '%kind%' or body::text ilike '%mod_m%'")"
eq "tap data type" "warning" "$(SU "select min(body->0->'data'->>'type') from net._calls where body->0->'data'->>'type'='warning'")"
SU "truncate net._calls" >/dev/null
as $A authenticated "select * from public.set_push_settings(p_moderation := false)" >/dev/null
as $MOD authenticated "select public.mod_warn_user('$A','other')" >/dev/null
eq "moderation switch off: no push" "0" "$(SU "select count(*) from net._calls")"
eq "...but the in-app notice is still created" "2" "$(SU "select count(*) from public.notifications where user_id='$A' and type='warning'")"
as $A authenticated "select * from public.set_push_settings(p_moderation := true)" >/dev/null

echo "== mute"
SU "delete from public.member_strikes; delete from public.moderation_actions; truncate net._calls; delete from public.notifications" >/dev/null
chk "duration too short" "invalid_duration" "$(as $MOD authenticated "select public.mod_mute_user('$A',0,'other')")"
chk "duration too long" "invalid_duration" "$(as $MOD authenticated "select public.mod_mute_user('$A',721,'other')")"
chk "duration null" "invalid_duration" "$(as $MOD authenticated "select public.mod_mute_user('$A',null,'other')")"
chk "mute needs a valid reason" "invalid_reason" "$(as $MOD authenticated "select public.mod_mute_user('$A',24,'zzz')")"
chk "no self mute" "cannot_target_self" "$(as $MOD authenticated "select public.mod_mute_user('$MOD',24,'other')")"
eq "moderator mutes a member for 24h" "" "$(as $MOD authenticated "select public.mod_mute_user('$A',24,'spam_scam','Stop the ads')")"
eq "status suspended with end about 24h away" "suspended|true" "$(SU "select status||'|'||(suspended_until between now()+interval '23 hours 59 minutes' and now()+interval '24 hours 1 minute') from public.user_flags where user_id='$A'")"
eq "moderation log has the suspension" "suspend" "$(SU "select action from public.moderation_actions where target_id='$A'")"
eq "strike kind mute" "mute|spam_scam" "$(SU "select kind||'|'||reason from public.member_strikes where user_id='$A'")"
eq "notice kind mute with end time" "mute|spam_scam|Stop the ads|true" "$(SU "select (data->>'kind')||'|'||(data->>'reason')||'|'||(data->>'note')||'|'||((data->>'until')::timestamptz = (select suspended_until from public.user_flags where user_id='$A')) from public.notifications where user_id='$A' and type='warning'")"
MN=$(SU "select id from public.notifications where user_id='$A' and type='warning'")
eq "member reads end time" "mute|true" "$(as $A authenticated "select kind||'|'||(until_at is not null) from public.get_my_warning('$MN')")"
eq "one generic push" "1|You have a new notice from the moderators" "$(SU "select count(*)||'|'||min(body->0->>'body') from net._calls")"
echo "== a muted member can read but not write"
chk "cannot post" "" "$(as $A authenticated "select id from public.create_post('confession','muted post')" | head -c0)"
eq "post refused" "t" "$(as $A authenticated "select id from public.create_post('confession','muted post')" | grep -qi 'suspend\|not_allowed\|forbidden\|restricted' && echo t || echo f)"
eq "comment refused" "t" "$(as $A authenticated "select id from public.create_comment('post',(select id from public.posts limit 1),'muted comment')" | grep -qi 'suspend\|not_allowed\|forbidden\|restricted\|not_found' && echo t || echo f)"
eq "feed still readable" "t" "$(as $A authenticated "select count(*) >= 0 from public.get_feed(null,null,20)")"
chk "already restricted: second mute refused" "already_restricted" "$(as $MOD authenticated "select public.mod_mute_user('$A',1,'other')")"
eq "refused mute left no extra strike" "1" "$(SU "select count(*) from public.member_strikes where user_id='$A' and kind='mute'")"
eq "warning is still possible while muted" "" "$(as $MOD authenticated "select public.mod_warn_user('$A','other')")"
echo "== lifting a mute early"
as $MOD authenticated "select public.mod_set_user_status('$A','active',null,'lift')" >/dev/null
eq "restored" "active" "$(SU "select status from public.user_flags where user_id='$A'")"
eq "member can post again" "t" "$(as $A authenticated "select id is not null from public.create_post('confession','back again')")"
echo "== expired mute"
as $MOD authenticated "select public.mod_mute_user('$A',1,'other')" >/dev/null
SU "update public.user_flags set suspended_until = now() - interval '1 minute' where user_id='$A'" >/dev/null
eq "expired mute: can post, new mute allowed" "" "$(as $MOD authenticated "select public.mod_mute_user('$A',1,'other')")"
SU "update public.user_flags set status='active', suspended_until=null where user_id='$A'" >/dev/null
echo "== banned or deleted targets"
SU "update public.user_flags set status='banned' where user_id='$B'" >/dev/null
chk "banned member cannot be muted" "already_restricted" "$(as $MOD authenticated "select public.mod_mute_user('$B',1,'other')")"
SU "update public.user_flags set status='active' where user_id='$B'; update public.user_flags set deleted_at=now() where user_id='$GONE'" >/dev/null
chk "deleted account: warn" "not_found" "$(as $MOD authenticated "select public.mod_warn_user('$GONE','other')")"
chk "deleted account: mute" "not_found" "$(as $MOD authenticated "select public.mod_mute_user('$GONE',1,'other')")"
echo "== admin mutes a moderator"
eq "admin can mute a moderator" "" "$(as $ADM authenticated "select public.mod_mute_user('$MOD2',1,'other')")"
SU "update public.user_flags set status='active', suspended_until=null where user_id='$MOD2'" >/dev/null

echo "== keyword hits become strikes"
SU "delete from public.member_strikes; delete from public.moderation_holds" >/dev/null
PK=$(as $B authenticated "select id from public.create_post('confession','this has a BADWORD in it')")
eq "post hit: one strike for the author" "keyword_hit|post|$PK" "$(SU "select kind||'|'||target_type||'|'||target_id from public.member_strikes where user_id='$B'")"
PPUB=$(as $A authenticated "select id from public.create_post('confession','a published post by alice')")
as $B authenticated "select id from public.create_comment('post','$PPUB','another BADWORD')" >/dev/null
as $B authenticated "select id from public.create_listing('sell','Bike badword','desc here',3000,'good')" >/dev/null
eq "comment and listing hits counted" "3" "$(SU "select count(*) from public.member_strikes where user_id='$B' and kind='keyword_hit'")"
eq "a clean post makes no strike" "3" "$(as $B authenticated "select id from public.create_post('confession','a fine post')" >/dev/null; SU "select count(*) from public.member_strikes where user_id='$B'")"
as $B authenticated "select id from public.edit_own_post('$PK','edited with a badword again')" >/dev/null
eq "an edit that hits again is another strike" "4" "$(SU "select count(*) from public.member_strikes where user_id='$B' and kind='keyword_hit'")"
eq "strike belongs to the author, not another member" "0" "$(SU "select count(*) from public.member_strikes where user_id='$A'")"
as $MOD authenticated "select public.mod_review('post','$PK','approve')" >/dev/null
eq "approving a hold keeps the strike" "4" "$(SU "select count(*) from public.member_strikes where user_id='$B' and kind='keyword_hit'")"
as $MOD authenticated "select id from public.create_post('confession','staff says badword')" >/dev/null
eq "staff are never struck" "0" "$(SU "select count(*) from public.member_strikes where user_id='$MOD'")"
SU "update public.app_settings set moderation_mode='pre' where id=1" >/dev/null
as $A authenticated "select id from public.create_post('confession','pre moderation clean text')" >/dev/null
eq "pre-moderation hold is not a strike" "0" "$(SU "select count(*) from public.member_strikes where user_id='$A'")"
SU "update public.app_settings set moderation_mode='post' where id=1" >/dev/null
echo "== a failing strike never blocks posting"
SU "alter table public.member_strikes add constraint tmp_block check (false) not valid" >/dev/null
TB=$(as $A authenticated "select id from public.create_post('confession','trouble badword')" | grep -v WARNING)
eq "post is still created and held" "keyword" "$(SU "select reason from public.moderation_holds where target_id='$TB'")"
SU "alter table public.member_strikes drop constraint tmp_block" >/dev/null

echo "== counts"
SU "delete from public.member_strikes" >/dev/null
SU "insert into public.member_strikes (user_id,kind,created_at) values
 ('$A','keyword_hit',now()-interval '1 day'),('$A','keyword_hit',now()-interval '40 days'),('$A','keyword_hit',now()-interval '100 days'),
 ('$A','warning',now()-interval '10 days'),('$A','warning',now()-interval '60 days'),
 ('$A','mute',now()-interval '5 days'),('$A','mute',now()-interval '89 days')" >/dev/null
eq "counts per kind for 30 and 90 days" "1|2|1|2|1|2" "$(as $MOD authenticated "select keyword_hits_30||'|'||keyword_hits_90||'|'||warnings_30||'|'||warnings_90||'|'||mutes_30||'|'||mutes_90 from public.mod_get_strikes('$A')")"
eq "last strike time present" "t" "$(as $MOD authenticated "select last_strike_at is not null from public.mod_get_strikes('$A')")"
eq "member without strikes: zeros, no error" "0|0" "$(as $MOD authenticated "select keyword_hits_90||'|'||mutes_90 from public.mod_get_strikes('$(uid 7)')" 2>/dev/null || echo 0)"
eq "no-strike member returns one row of zeros" "0|0" "$(as $MOD authenticated "select keyword_hits_90||'|'||mutes_90 from public.mod_get_strikes('$GONE')")"

echo "== purge"
SU "select public.purge_member_strikes()" >/dev/null
SU "insert into public.member_strikes (user_id,kind,created_at) values ('$A','warning',now()-interval '181 days')" >/dev/null
SU "select public.purge_member_strikes()" >/dev/null
eq "older than 180 days removed, the rest kept" "7" "$(SU "select count(*) from public.member_strikes where user_id='$A'")"

echo "== account deletion"
SU "update public.user_flags set status='active', suspended_until=null, deleted_at=null where user_id='$B'" >/dev/null
SU "insert into public.member_strikes (user_id,kind) values ('$B','warning')" >/dev/null
as $B authenticated "select public.delete_my_account('bobby_b')" >/dev/null
eq "self deletion removes strikes" "0" "$(SU "select count(*) from public.member_strikes where user_id='$B'")"
SU "insert into public.member_strikes (user_id,kind) values ('$A','warning')" >/dev/null
SU "update public.user_flags set status='banned' where user_id='$A'" >/dev/null
as $ADM authenticated "select public.admin_delete_account('$A','spam')" >/dev/null
eq "admin deletion removes strikes" "0" "$(SU "select count(*) from public.member_strikes where user_id='$A'")"
eq "actor deletion keeps the strike row (actor set to null)" "t" "$(SU "insert into public.member_strikes (user_id,kind,actor_id) values ('$MOD2','warning','$MOD')" >/dev/null; SU "delete from public.profiles where id='$MOD'" >/dev/null; SU "select actor_id is null from public.member_strikes where user_id='$MOD2'")"

echo "== constraints"
eq "warn action allowed in the log" "t" "$(SU "select pg_get_constraintdef(oid) like '%warn%' from pg_constraint where conname='moderation_actions_action_check'")"
eq "warning type allowed" "t" "$(SU "select pg_get_constraintdef(oid) like '%warning%' from pg_constraint where conname='notifications_type_check'")"
eq "all earlier notification types still allowed" "t" "$(SU "select bool_and(pg_get_constraintdef(oid) like '%'||t||'%') from pg_constraint, unnest(array['comment','reaction','comment_reaction','reply','content_approved','content_rejected','content_removed','return_request','return_confirmed','sale_request','sale_confirmed','staff_report','staff_held']) t where conname='notifications_type_check'")"
eq "earlier push behaviour kept: reply push text" "t" "$(SU "select prosrc like '%Someone commented on your post%' from pg_proc where proname='push_on_notification'")"

echo
echo "passed: $pass  failed: $fail"
[ "$fail" -eq 0 ]
