#!/usr/bin/env bash
# Tests for 20261030100000_badges.sql (new file runs in ONE transaction like the SQL editor).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_bd
psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/tests/00_supabase_stub.sql" 2>/dev/null || { echo "stub failed"; exit 1; }
for f in $(ls "$HERE"/migrations/*.sql | sort | awk -v own=20261030100000 '{ n=$0; sub(/.*\//,"",n); if (substr(n,1,14) < own) print }'); do
  psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$f" 2>&1 | grep -v NOTICE
done
SU() { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }
uid() { printf 'dddddddd-0000-4000-8000-%012d' "$1"; }
has() { SU "select count(*) from public.user_badges where user_id='$1' and badge_code='$2'"; }

# 1 admin, 1 moderator, 22 members (member i joined i hours after the start), 1 host, plus special users
ADM=$(uid 900); MOD=$(uid 901); HOST=$(uid 902)
SU "insert into auth.users (id,email,raw_user_meta_data) values
  ('$ADM','adm@unm.test','{\"nickname\":\"dean_x\"}'),('$MOD','mod@unm.test','{\"nickname\":\"marshal_x\"}'),
  ('$HOST','host@unm.test','{\"nickname\":\"poster_x\"}')" >/dev/null
for i in $(seq 1 22); do
  SU "insert into auth.users (id,email,raw_user_meta_data) values ('$(uid $i)','m$i@unm.test','{\"nickname\":\"member$i\"}')" >/dev/null
done
SU "update public.profiles set created_at = now() - interval '100 days' + (id::text = '$ADM')::int * interval '0'" >/dev/null
for i in $(seq 1 22); do SU "update public.profiles set created_at = timestamptz '2026-01-01 00:00+00' + interval '$i hours' where id='$(uid $i)'" >/dev/null; done
SU "update public.profiles set created_at = timestamptz '2025-12-01' where id in ('$ADM','$MOD')" >/dev/null
SU "update public.profiles set created_at = timestamptz '2026-03-01' where id='$HOST'" >/dev/null
SU "update public.user_flags set role='admin' where user_id='$ADM'; update public.user_flags set role='moderator' where user_id='$MOD'" >/dev/null

echo "== apply new migration in one transaction"
psql -X -q -1 -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/20261030100000_badges.sql" 2>&1 | grep -v NOTICE
psql -X -q -d $DB -c "grant all on public.badges, public.user_badges to anon, authenticated" >/dev/null  # mimic Supabase default privileges ... then re-check below
psql -X -q -d $DB -c "revoke all on public.badges, public.user_badges from anon, authenticated" >/dev/null

echo "== access"
chk "catalog has 4 badges"                    "4" "$(SU "select count(*) from public.badges")"
chk "authenticated cannot read user_badges"   "permission denied" "$(as $(uid 1) authenticated "select * from public.user_badges")"
chk "authenticated cannot insert badges"      "permission denied" "$(as $(uid 1) authenticated "insert into public.user_badges (user_id,badge_code) values ('$(uid 1)','nocturnal')")"
chk "anon cannot read user_badges"            "permission denied" "$(as '' anon "select * from public.user_badges")"
chk "authenticated cannot run award_badges"   "permission denied" "$(as $(uid 1) authenticated "select public.award_badges()")"
chk "anon cannot run award_badges"            "permission denied" "$(as '' anon "select public.award_badges()")"
chk "guest cannot call get_user_badges"       "permission denied" "$(as '' anon "select * from public.get_user_badges('$(uid 1)')")"
chk "setting default is 10"                   "10" "$(SU "select campus_voice_reactions from public.app_settings where id=1")"
chk "setting rejects 0"                       "violates check" "$(SU "update public.app_settings set campus_voice_reactions=0")"

echo "== first_circle"
chk "member 1 has it"             "1" "$(has $(uid 1) first_circle)"
chk "member 20 has it"            "1" "$(has $(uid 20) first_circle)"
chk "member 21 does not"          "0" "$(has $(uid 21) first_circle)"
chk "member 22 does not"          "0" "$(has $(uid 22) first_circle)"
chk "admin does not"              "0" "$(has $ADM first_circle)"
chk "moderator does not"          "0" "$(has $MOD first_circle)"
chk "host (joined later) does not" "0" "$(has $HOST first_circle)"
chk "exactly 20 holders"          "20" "$(SU "select count(*) from public.user_badges where badge_code='first_circle'")"
# a banned or deleted early member frees nothing retroactively; a deleted one is skipped, next one fills the slot
SU "update public.user_flags set deleted_at=now() where user_id='$(uid 5)'" >/dev/null
SU "delete from public.user_badges where user_id='$(uid 5)'" >/dev/null
SU "select public.award_badges()" >/dev/null
chk "deleted member 5 not re-awarded"  "0" "$(has $(uid 5) first_circle)"
chk "member 21 takes the free slot"    "1" "$(has $(uid 21) first_circle)"
SU "update public.user_flags set status='banned' where user_id='$(uid 6)'" >/dev/null
SU "delete from public.user_badges where user_id='$(uid 6)'" >/dev/null
SU "select public.award_badges()" >/dev/null
chk "banned member 6 not re-awarded"   "0" "$(has $(uid 6) first_circle)"

echo "== nocturnal (Asia/Manila 00:00-03:59)"
N1=$(uid 30); N2=$(uid 31); N3=$(uid 32); N4=$(uid 33); N5=$(uid 34)
for u in $N1 $N2 $N3 $N4 $N5; do SU "insert into auth.users (id,email,raw_user_meta_data) values ('$u','$u@unm.test','{\"nickname\":\"n${u: -2}\"}')" >/dev/null; done
# Manila = UTC+8: 02:30 Manila = 18:30 UTC previous day; 12:00 Manila = 04:00 UTC; 04:00 Manila = 20:00 UTC; 00:00 Manila = 16:00 UTC prev day
SU "insert into public.posts (id,number,kind,author_id,body,status,published_at,created_at) values
  (gen_random_uuid(),9001,'confession','$N1','late',  'published', timestamptz '2026-09-30 18:30+00', now()),
  (gen_random_uuid(),9002,'confession','$N2','noon',  'published', timestamptz '2026-10-01 04:00+00', now()),
  (gen_random_uuid(),9003,'confession','$N3','four',  'published', timestamptz '2026-09-30 20:00+00', now()),
  (gen_random_uuid(),9004,'confession','$N4','mid',   'published', timestamptz '2026-09-30 16:00+00', now()),
  (gen_random_uuid(),9005,'confession','$N5','gone',  'removed',   timestamptz '2026-09-30 18:30+00', now())" >/dev/null
SU "select public.award_badges()" >/dev/null
chk "02:30 post earns it"          "1" "$(has $N1 nocturnal)"
chk "12:00 post does not"          "0" "$(has $N2 nocturnal)"
chk "04:00 sharp does not"         "0" "$(has $N3 nocturnal)"
chk "00:00 sharp earns it"         "1" "$(has $N4 nocturnal)"
chk "removed night post does not"  "0" "$(has $N5 nocturnal)"
HP=$(SU "insert into public.posts (id,number,kind,author_id,body,status,published_at,created_at) values (gen_random_uuid(),9010,'confession','$HOST','host post','published',now(),now()) returning id" | head -1)
SU "insert into public.comments (post_id,author_id,body,status,published_at,created_at) values ('$HP','$N2','night comment','published', timestamptz '2026-10-01 19:59+00', now())" >/dev/null
SU "select public.award_badges()" >/dev/null
chk "03:59 comment earns it"       "1" "$(has $N2 nocturnal)"

echo "== campus_regular (7 distinct Manila days)"
R7=$(uid 40); R6=$(uid 41); RS=$(uid 42)
for u in $R7 $R6 $RS; do SU "insert into auth.users (id,email,raw_user_meta_data) values ('$u','$u@unm.test','{\"nickname\":\"r${u: -2}\"}')" >/dev/null; done
# R7: 4 posts (days 1-4, noon Manila), 2 comments (days 5-6), 1 reaction (day 7)
for d in 1 2 3 4; do SU "insert into public.posts (id,number,kind,author_id,body,status,published_at,created_at) values (gen_random_uuid(),$((9100+d)),'confession','$R7','p$d','published', timestamptz '2026-09-0$d 12:00+08', now())" >/dev/null; done
for d in 5 6; do SU "insert into public.comments (post_id,author_id,body,status,published_at,created_at) values ('$HP','$R7','c$d','published', timestamptz '2026-09-0$d 12:00+08', now())" >/dev/null; done
SU "insert into public.reactions (post_id,user_id,type,created_at,updated_at) values ('$HP','$R7','like', timestamptz '2026-09-07 12:00+08', now())" >/dev/null
# R6: 6 days only, with extra items on the same days
for d in 1 2 3 4 5 6; do SU "insert into public.posts (id,number,kind,author_id,body,status,published_at,created_at) values (gen_random_uuid(),$((9200+d)),'confession','$R6','p$d','published', timestamptz '2026-09-0$d 12:00+08', now()), (gen_random_uuid(),$((9210+d)),'confession','$R6','q$d','published', timestamptz '2026-09-0$d 13:00+08', now())" >/dev/null; done
# RS: Manila day boundary: 23:30 UTC on day N is 07:30 Manila on day N+1 -> counts as the same Manila day as 12:00 Manila day N+1
for d in 1 2 3 4 5 6; do SU "insert into public.posts (id,number,kind,author_id,body,status,published_at,created_at) values (gen_random_uuid(),$((9300+d)),'confession','$RS','p$d','published', timestamptz '2026-09-0$d 12:00+08', now())" >/dev/null; done
SU "insert into public.posts (id,number,kind,author_id,body,status,published_at,created_at) values (gen_random_uuid(),9310,'confession','$RS','same-day','published', timestamptz '2026-09-06 23:30+00', now())" >/dev/null  # = 2026-09-07 07:30 Manila -> day 7
SU "select public.award_badges()" >/dev/null
chk "7 distinct days earns it"            "1" "$(has $R7 campus_regular)"
chk "6 days (12 items) does not"          "0" "$(has $R6 campus_regular)"
chk "Manila boundary makes day 7"         "1" "$(has $RS campus_regular)"

echo "== campus_voice (threshold, 24h, open report)"
V10=$(uid 50); V9=$(uid 51); V23=$(uid 52); VREP=$(uid 53); VDIS=$(uid 54); VREM=$(uid 55); VT3=$(uid 56)
for u in $V10 $V9 $V23 $VREP $VDIS $VREM $VT3; do SU "insert into auth.users (id,email,raw_user_meta_data) values ('$u','$u@unm.test','{\"nickname\":\"v${u: -2}\"}')" >/dev/null; done
mk() { SU "insert into public.posts (id,number,kind,author_id,body,status,published_at,reaction_count,created_at) values (gen_random_uuid(),$1,'confession','$2','voice','$3', now() - interval '$4', $5, now()) returning id" | head -1; }
mk 9401 $V10 published '25 hours' 10 >/dev/null
mk 9402 $V9  published '25 hours' 9  >/dev/null
mk 9403 $V23 published '23 hours' 50 >/dev/null
PREP=$(mk 9404 $VREP published '25 hours' 12); PDIS=$(mk 9405 $VDIS published '25 hours' 12); mk 9406 $VREM removed '25 hours' 12 >/dev/null
mk 9407 $VT3 published '25 hours' 4 >/dev/null
SU "insert into public.reports (reporter_id,target_type,target_id,reason,status) values ('$(uid 1)','post','$PREP','spam','open'), ('$(uid 1)','post','$PDIS','spam','dismissed')" >/dev/null
SU "select public.award_badges()" >/dev/null
chk "10 reactions after 25h earns it"     "1" "$(has $V10 campus_voice)"
chk "9 reactions does not"                "0" "$(has $V9 campus_voice)"
chk "23h old does not"                    "0" "$(has $V23 campus_voice)"
chk "open report blocks it"               "0" "$(has $VREP campus_voice)"
chk "dismissed report does not block"     "1" "$(has $VDIS campus_voice)"
chk "removed post does not"               "0" "$(has $VREM campus_voice)"
chk "4 reactions not enough at 10"        "0" "$(has $VT3 campus_voice)"
SU "update public.app_settings set campus_voice_reactions=3" >/dev/null
SU "select public.award_badges()" >/dev/null
chk "lower threshold awards 9 reactions"  "1" "$(has $V9 campus_voice)"
chk "lower threshold awards 4 reactions"  "1" "$(has $VT3 campus_voice)"
chk "open report still blocks at 3"       "0" "$(has $VREP campus_voice)"
SU "update public.reports set status='actioned' where target_id='$PREP'" >/dev/null
SU "update public.app_settings set campus_voice_reactions=10" >/dev/null

echo "== idempotent + kept after later removal"
SU "select public.award_badges()" >/dev/null
B1=$(SU "select count(*) from public.user_badges"); SU "select public.award_badges()" >/dev/null
chk "second run adds nothing"             "$B1" "$(SU "select count(*) from public.user_badges")"
SU "update public.posts set status='removed' where author_id='$V10'" >/dev/null
SU "select public.award_badges()" >/dev/null
chk "badge kept after post removed"       "1" "$(has $V10 campus_voice)"

echo "== get_user_badges"
chk "member sees own badges in order"     "first_circle|First Circle" "$(as $(uid 1) authenticated "select code||'|'||name from public.get_user_badges('$(uid 1)')")"
chk "member sees another's badge"         "campus_voice" "$(as $(uid 2) authenticated "select code from public.get_user_badges('$V10')")"
chk "badges sorted (first_circle before nocturnal)" "first_circle,nocturnal" "$(SU "insert into public.user_badges (user_id,badge_code) values ('$N2','first_circle') on conflict do nothing" >/dev/null; as $(uid 1) authenticated "select string_agg(code, ',' order by ordinality) from public.get_user_badges('$N2') with ordinality")"
chk "moderator label derived"             "moderator|Moderator" "$(as $(uid 1) authenticated "select code||'|'||name from public.get_user_badges('$MOD')")"
chk "admin label derived"                 "admin|Admin" "$(as $(uid 1) authenticated "select code||'|'||name from public.get_user_badges('$ADM')")"
chk "role labels are not stored"          "0" "$(SU "select count(*) from public.user_badges where badge_code in ('admin','moderator')")"
chk "user with nothing gets empty"        "0" "$(as $(uid 2) authenticated "select count(*) from public.get_user_badges('$HOST')")"
SU "insert into public.user_blocks (blocker_id,blocked_id) values ('$(uid 2)','$V10')" >/dev/null
chk "blocked member's badges hidden"      "0" "$(as $(uid 2) authenticated "select count(*) from public.get_user_badges('$V10')")"
chk "others still see them"               "1" "$(as $(uid 3) authenticated "select count(*) from public.get_user_badges('$V10')")"
SU "update public.user_flags set status='banned' where user_id='$V10'" >/dev/null
chk "banned member's badges hidden"       "0" "$(as $(uid 3) authenticated "select count(*) from public.get_user_badges('$V10')")"
SU "update public.user_flags set status='banned' where user_id='$MOD'" >/dev/null
chk "banned moderator label hidden"       "0" "$(as $(uid 3) authenticated "select count(*) from public.get_user_badges('$MOD')")"
SU "update public.user_flags set deleted_at=now() where user_id='$ADM'" >/dev/null
chk "deleted admin label hidden"          "0" "$(as $(uid 3) authenticated "select count(*) from public.get_user_badges('$ADM')")"

echo; echo "passed: $pass  failed: $fail"; [[ $fail -eq 0 ]]
