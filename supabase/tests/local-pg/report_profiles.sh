#!/usr/bin/env bash
# Tests for 20261029130000_report_profiles.sql (stub + all migrations on a fresh DB; the new file runs in ONE transaction like the SQL editor).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_rp
psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/tests/00_supabase_stub.sql" 2>/dev/null || { echo "stub failed"; exit 1; }
for f in $(ls "$HERE"/migrations/*.sql | sort | grep -v 20261029130000); do
  psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$f" 2>&1 | grep -v NOTICE
done
echo "== apply new migration in one transaction"
psql -X -q -1 -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/20261029130000_report_profiles.sql" 2>&1 | grep -v NOTICE
SU() { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }
SU "grant select, insert, update, delete on storage.objects to authenticated, anon, service_role" >/dev/null

A=eeeeeeee-0000-4000-8000-000000000001
B=eeeeeeee-0000-4000-8000-000000000002
C=eeeeeeee-0000-4000-8000-000000000003
M=eeeeeeee-0000-4000-8000-000000000004
D=eeeeeeee-0000-4000-8000-000000000005
G=eeeeeeee-0000-4000-8000-000000000006
SU "insert into auth.users (id, email, raw_user_meta_data) values
  ('$A','a@unm.test','{\"nickname\":\"user_a\"}'),('$B','b@unm.test','{\"nickname\":\"user_b\"}'),
  ('$C','c@unm.test','{\"nickname\":\"user_c\"}'),('$M','m@unm.test','{\"nickname\":\"mod_m\"}'),
  ('$D','d@unm.test','{\"nickname\":\"user_d\"}');
  insert into auth.users (id, email) values ('$G','g@unm.test');
  update public.user_flags set role='moderator' where user_id='$M';" >/dev/null

echo "== enum"
chk "content_type has profile" "profile" "$(SU "select string_agg(enumlabel, ',' order by enumsortorder) from pg_enum where enumtypid='public.content_type'::regtype")"

echo "== report_content"
chk "report a profile ok"            "1" "$(as $B authenticated "select public.report_content('profile','$A','inappropriate','bad picture')" >/dev/null; SU "select count(*) from public.reports where target_type='profile' and target_id='$A' and reporter_id='$B'")"
chk "duplicate report ignored"       "1" "$(as $B authenticated "select public.report_content('profile','$A','spam')" >/dev/null; SU "select count(*) from public.reports where target_type='profile' and target_id='$A'")"
chk "second reporter counted"        "2" "$(as $C authenticated "select public.report_content('profile','$A','bullying')" >/dev/null; SU "select count(*) from public.reports where target_type='profile' and target_id='$A'")"
chk "own profile refused"            "own_content" "$(as $A authenticated "select public.report_content('profile','$A','spam')")"
chk "unknown id refused"             "not_found" "$(as $B authenticated "select public.report_content('profile','eeeeeeee-0000-4000-8000-0000000000ff','spam')")"
chk "profile without nickname refused" "not_found" "$(as $B authenticated "select public.report_content('profile','$G','spam')")"
chk "invalid reason refused"         "reports_reason_check" "$(as $B authenticated "select public.report_content('profile','$D','not_a_reason')")"
chk "guest cannot report"            "permission denied" "$(as '' anon "select public.report_content('profile','$A','spam')")"
SU "update public.user_flags set deleted_at=now(), status='banned' where user_id='$D'" >/dev/null
chk "deleted account refused"        "not_found" "$(as $B authenticated "select public.report_content('profile','$D','spam')")"
chk "old post report still works"    "1" "$(P=$(as $A authenticated "select id from public.create_post('confession','report me please')"); as $B authenticated "select public.report_content('post','$P','spam')" >/dev/null; SU "select count(*) from public.reports where target_type='post' and target_id='$P'")"

echo "== mod_get_reports"
chk "member cannot list reports"     "forbidden" "$(as $B authenticated "select * from public.mod_get_reports()")"
chk "anon cannot execute"            "permission denied" "$(as '' anon "select * from public.mod_get_reports()")"
ROW="$(as $M authenticated "select target_type, report_count, reasons, content_status, title, author_id, nickname, avatar_key from public.mod_get_reports() where target_type='profile' and target_id='$A'")"
chk "profile row: type, count"       "profile|2|{bullying,inappropriate}|published|profile|$A|user_a|avatar_01" "$ROW"
chk "post row still listed"          "confession" "$(as $M authenticated "select title from public.mod_get_reports() where target_type='post'")"
chk "details for a profile"          "inappropriate|bad picture" "$(as $M authenticated "select reason, note from public.mod_get_report_details('profile','$A') where reporter_nickname='user_b'" )"
SU "update public.user_flags set deleted_at=now(), status='banned' where user_id='$A'" >/dev/null
chk "deleted account shows as removed" "removed" "$(as $M authenticated "select content_status from public.mod_get_reports() where target_type='profile' and target_id='$A'")"
SU "update public.user_flags set deleted_at=null, status='active' where user_id='$A'" >/dev/null

echo "== moderator actions on a reported profile"
K=c_0123456789ab
SU "select set_config('app.account_change','on',false); insert into storage.objects (bucket_id,name) values ('avatars','$A/$K.jpg'); update public.profiles set avatar_key='$K' where id='$A'" >/dev/null
chk "panel row shows the custom key" "$K" "$(as $M authenticated "select avatar_key from public.mod_get_reports() where target_type='profile' and target_id='$A'")"
as $M authenticated "select public.mod_remove_avatar('$A','reported')" >/dev/null
chk "remove avatar resets the key"   "avatar_01" "$(as $M authenticated "select avatar_key from public.mod_get_reports() where target_type='profile' and target_id='$A'")"
R=$(SU "select id from public.reports where target_type='profile' and target_id='$A' and reporter_id='$B'")
chk "resolve the report"             "0" "$(as $M authenticated "select public.mod_resolve_report('$R','actioned')" >/dev/null; as $M authenticated "select count(*) from public.mod_get_reports() where target_type='profile' and target_id='$A' and report_count=2")"
chk "other report still open (count 1)" "1" "$(as $M authenticated "select report_count from public.mod_get_reports() where target_type='profile' and target_id='$A'")"

echo; echo "passed: $pass  failed: $fail"; [[ $fail -eq 0 ]]
