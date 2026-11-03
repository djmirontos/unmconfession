#!/usr/bin/env bash
# Tests for 20261101090000_staff_mobile_moderation.sql (new file runs in ONE transaction like the SQL editor).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_sm
psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/tests/00_supabase_stub.sql" 2>/dev/null || { echo "stub failed"; exit 1; }
for f in $(ls "$HERE"/migrations/*.sql | sort | awk -v own=20261101090000 '{ n=$0; sub(/.*\//,"",n); if (substr(n,1,14) < own) print }'); do
  psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$f" 2>&1 | grep -v NOTICE
done
SU() { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }
uid() { printf 'eeeeeeee-0000-4000-8000-%012d' "$1"; }

ADM=$(uid 900); MOD=$(uid 901); BAN=$(uid 902)
U1=$(uid 1); U2=$(uid 2); U3=$(uid 3); U4=$(uid 4); DEL=$(uid 5); NONICK=$(uid 6)
SU "insert into auth.users (id,email,raw_user_meta_data) values
  ('$ADM','adm@unm.test','{\"nickname\":\"dean_x\"}'),('$MOD','mod@unm.test','{\"nickname\":\"marshal_x\"}'),
  ('$BAN','ban@unm.test','{\"nickname\":\"banned_x\"}'),
  ('$U1','u1@unm.test','{\"nickname\":\"user_one\"}'),('$U2','u2@unm.test','{\"nickname\":\"user_two\"}'),
  ('$U3','u3@unm.test','{\"nickname\":\"user_three\"}'),('$U4','u4@unm.test','{\"nickname\":\"user_four\"}'),
  ('$DEL','del@unm.test','{\"nickname\":\"deleted_x\"}'),('$NONICK','nn@unm.test','{}')" >/dev/null
SU "update public.user_flags set role='admin' where user_id='$ADM'; update public.user_flags set role='moderator' where user_id='$MOD';
    update public.user_flags set status='banned' where user_id='$BAN'; update public.user_flags set deleted_at=now() where user_id='$DEL'" >/dev/null
SU "update public.profiles set nickname=null where id='$NONICK'" >/dev/null
# join times: ADM/MOD old, U1 100d, U2 10d, U3 3d, U4 1h, BAN 2d, DEL 1h (deleted), NONICK 1h (no nickname)
SU "update public.profiles set created_at = now() - interval '200 days' where id in ('$ADM','$MOD');
    update public.profiles set created_at = now() - interval '100 days' where id='$U1';
    update public.profiles set created_at = now() - interval '10 days' where id='$U2';
    update public.profiles set created_at = now() - interval '3 days' where id='$U3';
    update public.profiles set created_at = now() - interval '1 hour' where id in ('$U4','$DEL','$NONICK');
    update public.profiles set created_at = now() - interval '2 days' where id='$BAN'" >/dev/null

echo "== apply new migration in one transaction"
psql -X -q -1 -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/20261101090000_staff_mobile_moderation.sql" 2>&1 | grep -v NOTICE

echo "== access"
for fn in "public.mod_open_report_count()" "public.mod_app_stats()" "public.mod_recent_signups()" "public.mod_resolve_reports_for('post','$U1','dismissed')"; do
  chk "member forbidden: $fn" "forbidden" "$(as $U1 authenticated "select * from $fn")"
  chk "anon no access: $fn"  "permission denied" "$(as '' anon "select * from $fn")"
done
SU "update public.user_flags set status='suspended', suspended_until=now()+interval '1 day' where user_id='$MOD'" >/dev/null
chk "suspended mod forbidden" "forbidden" "$(as $MOD authenticated "select public.mod_open_report_count()")"
SU "update public.user_flags set status='active', suspended_until=null where user_id='$MOD'" >/dev/null

echo "== open report count"
chk "starts at 0" "0" "$(as $MOD authenticated "select public.mod_open_report_count()")"
P1=$(SU "insert into public.posts (kind,author_id,body,status,published_at) values ('confession','$U1','post one','published',now()) returning id" | head -1)
P2=$(SU "insert into public.posts (kind,author_id,body,status,published_at) values ('confession','$U2','post two','published',now()) returning id" | head -1)
C1=$(SU "insert into public.comments (post_id,author_id,body,status,published_at) values ('$P1','$U3','c','published',now()) returning id" | head -1)
SU "insert into public.reports (reporter_id,target_type,target_id,reason) values
  ('$U2','post','$P1','spam'),('$U3','post','$P1','bullying'),('$U4','post','$P1','other'),('$U1','comment','$C1','spam'),('$U1','post','$P2','spam')" >/dev/null
chk "3 items, not 5 reports (mod)"   "3" "$(as $MOD authenticated "select public.mod_open_report_count()")"
chk "admin sees the same"            "3" "$(as $ADM authenticated "select public.mod_open_report_count()")"

echo "== resolve all reports for an item"
chk "dismiss post1 returns 3"        "3" "$(as $MOD authenticated "select public.mod_resolve_reports_for('post','$P1','dismissed')")"
chk "count drops to 2"               "2" "$(as $MOD authenticated "select public.mod_open_report_count()")"
chk "handled_by set"                 "$MOD" "$(SU "select distinct handled_by from public.reports where target_id='$P1'")"
chk "status is dismissed"            "dismissed" "$(SU "select distinct status from public.reports where target_id='$P1'")"
chk "second call: not_found"         "not_found" "$(as $MOD authenticated "select public.mod_resolve_reports_for('post','$P1','dismissed')")"
chk "admin can close comment item"   "1" "$(as $ADM authenticated "select public.mod_resolve_reports_for('comment','$C1','actioned')")"
chk "bad status rejected"            "invalid_action" "$(as $MOD authenticated "select public.mod_resolve_reports_for('post','$P2','open')")"
chk "other item untouched"           "open" "$(SU "select status from public.reports where target_id='$P2'")"
chk "count now 1"                    "1" "$(as $MOD authenticated "select public.mod_open_report_count()")"

echo "== app stats"
# members: ADM, MOD, U1, U2, U3, U4, BAN (banned still counts) = 7; DEL and NONICK excluded
chk "total members 7"                "7" "$(as $MOD authenticated "select total_members from public.mod_app_stats()")"
chk "signups 24h = 1 (U4)"           "1" "$(as $MOD authenticated "select signups_24h from public.mod_app_stats()")"
chk "signups 7d = 3 (U3,U4,BAN)"     "3" "$(as $MOD authenticated "select signups_7d from public.mod_app_stats()")"
# activity so far: U1 post, U2 post, U3 comment (all created now); DEL/NONICK activity must not count
SU "insert into public.posts (kind,author_id,body,status,published_at) values ('confession','$DEL','ghost','published',now())" >/dev/null
chk "engaged = 3 (deleted ignored)"  "3" "$(as $MOD authenticated "select engaged_members from public.mod_app_stats()")"
chk "active 7d = 3"                  "3" "$(as $MOD authenticated "select active_7d from public.mod_app_stats()")"
SU "update public.posts set created_at = now() - interval '30 days' where author_id='$U1'; update public.comments set created_at = now() - interval '30 days'" >/dev/null
chk "old activity: engaged still 3"  "3" "$(as $MOD authenticated "select engaged_members from public.mod_app_stats()")"
chk "old activity: active 7d = 1"    "1" "$(as $MOD authenticated "select active_7d from public.mod_app_stats()")"
SU "insert into public.reactions (post_id,user_id,type) values ('$P2','$U4','like')" >/dev/null
chk "reaction counts as engaged"     "4" "$(as $MOD authenticated "select engaged_members from public.mod_app_stats()")"
SU "insert into public.user_badges (user_id,badge_code) values ('$U1','campus_voice'),('$U2','campus_voice'),('$DEL','campus_voice'),('$U3','nocturnal')" >/dev/null
BC="$(as $MOD authenticated "select badge_counts from public.mod_app_stats()")"
chk "campus_voice = 2 (deleted excluded)" '"code": "campus_voice", "name": "Campus Voice", "count": 2' "$BC"
chk "nocturnal = 1"                  '"code": "nocturnal", "name": "Nocturnal", "count": 1' "$BC"
chk "badge with no holders shows 0"  '"code": "first_circle", "name": "First Circle", "count": 0' "$BC"
chk "badges in sort order"           "$(SU "select string_agg(code,',' order by sort_order) from public.badges")" "$(as $MOD authenticated "select string_agg(e->>'code',',' order by o) from public.mod_app_stats(), jsonb_array_elements(badge_counts) with ordinality t(e,o)")"
chk "every badge listed"             "$(SU "select count(*) from public.badges")" "$(as $MOD authenticated "select jsonb_array_length(badge_counts) from public.mod_app_stats()")"

echo "== recent signups"
chk "newest first is user_four"      "user_four" "$(as $MOD authenticated "select nickname from public.mod_recent_signups(10) limit 1")"
chk "deleted not listed"             "0" "$(as $MOD authenticated "select count(*) from public.mod_recent_signups(50) where nickname='deleted_x'")"
chk "no-nickname not listed"         "7" "$(as $MOD authenticated "select count(*) from public.mod_recent_signups(50)")"
chk "limit respected"                "2" "$(as $MOD authenticated "select count(*) from public.mod_recent_signups(2)")"
chk "limit capped at 50"             "7" "$(as $MOD authenticated "select count(*) from public.mod_recent_signups(1000)")"
chk "limit floor of 1"               "1" "$(as $MOD authenticated "select count(*) from public.mod_recent_signups(0)")"
chk "columns: no email"              "user_id,nickname,created_at" "$(SU "select array_to_string((select proargnames[2:] from pg_proc where proname='mod_recent_signups'),',')" | sed 's/^p_limit,//')"

echo "== index"
chk "partial index exists"           "reports_open_target_idx" "$(SU "select indexname from pg_indexes where indexname='reports_open_target_idx'")"

echo; echo "passed: $pass  failed: $fail"; [[ $fail -eq 0 ]]
