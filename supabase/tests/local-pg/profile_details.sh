#!/usr/bin/env bash
# Tests for 20261029150000_profile_details.sql (stub + all migrations; the new file runs in ONE transaction like the SQL editor).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_pd
psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/tests/00_supabase_stub.sql" 2>/dev/null || { echo "stub failed"; exit 1; }
for f in $(ls "$HERE"/migrations/*.sql | sort | grep -v 20261029150000); do
  psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$f" 2>&1 | grep -v NOTICE
done
echo "== apply new migration in one transaction"
psql -X -q -1 -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/20261029150000_profile_details.sql" 2>&1 | grep -v NOTICE
SU() { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }

A=ffffffff-0000-4000-8000-000000000001
B=ffffffff-0000-4000-8000-000000000002
M=ffffffff-0000-4000-8000-000000000003
ADM=ffffffff-0000-4000-8000-000000000004
S=ffffffff-0000-4000-8000-000000000005
G=ffffffff-0000-4000-8000-000000000006
SU "insert into auth.users (id, email, raw_user_meta_data) values
  ('$A','a@unm.test','{\"nickname\":\"user_a\"}'),('$B','b@unm.test','{\"nickname\":\"user_b\"}'),
  ('$M','m@unm.test','{\"nickname\":\"mod_m\"}'),('$ADM','ad@unm.test','{\"nickname\":\"adm_x\"}'),
  ('$S','s@unm.test','{\"nickname\":\"mod_s\"}');
  insert into auth.users (id, email) values ('$G','g@unm.test');
  update public.user_flags set role='moderator' where user_id in ('$M','$S');
  update public.user_flags set role='admin' where user_id='$ADM';" >/dev/null
set_() { as $1 authenticated "select public.set_my_profile_details($2)"; }

echo "== access"
chk "table not readable by members"      "permission denied" "$(as $A authenticated "select * from public.profile_details")"
chk "guest cannot set"                   "permission denied" "$(as '' anon "select public.set_my_profile_details(true,'a','b','1st year','c','d')")"
chk "guest cannot read details"          "permission denied" "$(as '' anon "select * from public.get_profile_details('$A')")"
chk "no nickname cannot set"             "nickname_required" "$(set_ $G "true,null,null,null,null,null")"

echo "== set and read"
chk "empty by default"                   "0" "$(as $A authenticated "select count(*) from public.get_my_profile_details()")"
chk "save all fields (hidden)"           "" "$(set_ $A "false,'College of Engineering','BS Computer Engineering','3rd year','Gaming, basketball','Coffee lover and night coder'")"
chk "my details readable"                "f|College of Engineering|BS Computer Engineering|3rd year|Gaming, basketball|Coffee lover and night coder" "$(as $A authenticated "select * from public.get_my_profile_details()")"
chk "hidden: others see nothing"         "0" "$(as $B authenticated "select count(*) from public.get_profile_details('$A')")"
set_ $A "true,'College of Engineering','BS Computer Engineering','3rd year','Gaming, basketball','Coffee lover and night coder'" >/dev/null
chk "shown: other member sees it"        "College of Engineering|BS Computer Engineering|3rd year|Gaming, basketball|Coffee lover and night coder" "$(as $B authenticated "select * from public.get_profile_details('$A')")"
chk "spaces trimmed, empty -> null"      "true|false" "$(set_ $B "true,'  ','','','',''" >/dev/null; SU "select (college is null)::text||'|'||(about is not null)::text from public.profile_details where user_id='$B'")"
chk "update replaces"                    "College of Law" "$(set_ $B "true,'  College   of  Law ',null,null,null,null" >/dev/null; SU "select college from public.profile_details where user_id='$B'")"

echo "== validation"
chk "college too long"                   "details_invalid" "$(set_ $B "true,'$(printf 'x%.0s' {1..61})',null,null,null,null")"
chk "about too long"                     "details_invalid" "$(set_ $B "true,null,null,null,null,'$(printf 'x%.0s' {1..151})'")"
chk "about 150 ok"                       "" "$(set_ $B "true,null,null,null,null,'$(printf 'x%.0s' {1..150})'")"
chk "bad year level"                     "details_invalid" "$(set_ $B "true,null,null,'6th year',null,null")"
chk "control character refused"          "details_invalid" "$(set_ $B "true,null,null,null,null,E'bad\\x07text'")"
chk "null show refused"                  "details_invalid" "$(set_ $B "null,null,null,null,null,null")"
chk "link refused"                       "details_contact" "$(set_ $B "true,null,null,null,null,'visit www.mysite.com'")"
chk "domain refused"                     "details_contact" "$(set_ $B "true,null,null,null,null,'my page: foo.com/me'")"
chk "at sign refused"                    "details_contact" "$(set_ $B "true,null,null,null,null,'dm @cooluser'")"
chk "email refused"                      "details_contact" "$(set_ $B "true,null,null,null,null,'me at name@mail.test'")"
chk "phone refused"                      "details_contact" "$(set_ $B "true,null,null,null,null,'call 0917 123 4567'")"
chk "phone with dashes refused"          "details_contact" "$(set_ $B "true,null,null,null,null,'0917-123-4567'")"
chk "contact app name refused"           "details_contact" "$(set_ $B "true,null,null,null,null,'add me on Instagram'")"
chk "year range is fine"                 "" "$(set_ $B "true,null,null,null,null,'Batch 2022-2026 and proud'")"
chk "hobby field checked too"            "details_contact" "$(set_ $B "true,null,null,null,'telegram chat',null")"

echo "== keywords (scope profile)"
SU "insert into public.keywords (term, match_type, applies_to, category) values ('badword','contains','{profile}','abuse'), ('shout','word','{profile}','abuse'), ('listingonly','contains','{listing}','other')" >/dev/null
chk "keyword contains blocks"            "details_flagged" "$(set_ $B "true,null,null,null,null,'so BadWord here'")"
chk "leet blocks"                        "details_flagged" "$(set_ $B "true,null,null,null,null,'b4dw0rd'")"
chk "word match blocks whole word"       "details_flagged" "$(set_ $B "true,null,null,null,null,'dont shout at me'")"
chk "word match ignores inside words"    "" "$(set_ $B "true,null,null,null,null,'shouting is fine'")"
chk "other scope does not apply"         "" "$(set_ $B "true,null,null,null,null,'listingonly'")"
chk "error does not reveal the word"     "details_flagged" "$(set_ $B "true,null,null,null,null,'badword'" | grep -vi 'badword.*badword')"
chk "existing post keywords copied to profile scope" "t" "$(SU "select bool_and('profile' = any(applies_to)) from public.keywords where 'post' = any(applies_to) and term not in ('listingonly')")"

echo "== visibility rules"
set_ $B "true,'College of Law',null,null,null,null" >/dev/null
chk "visible to others"                  "College of Law" "$(as $A authenticated "select college from public.get_profile_details('$B')")"
as $A authenticated "insert into public.user_blocks (blocker_id, blocked_id) values ('$A','$B')" >/dev/null
chk "hidden when I blocked them"         "0" "$(as $A authenticated "select count(*) from public.get_profile_details('$B')")"
as $A authenticated "delete from public.user_blocks where blocker_id='$A'" >/dev/null
SU "update public.user_flags set status='banned' where user_id='$B'" >/dev/null
chk "hidden for banned member"           "0" "$(as $A authenticated "select count(*) from public.get_profile_details('$B')")"
chk "banned member cannot save"          "banned" "$(set_ $B "true,null,null,null,null,null")"
SU "update public.user_flags set status='active' where user_id='$B'" >/dev/null

echo "== staff clear"
chk "member cannot clear"                "forbidden" "$(as $A authenticated "select public.mod_clear_profile_details('$B')")"
chk "guest cannot clear"                 "permission denied" "$(as '' anon "select public.mod_clear_profile_details('$B')")"
chk "moderator clears with reason"       "" "$(as $M authenticated "select public.mod_clear_profile_details('$B','inappropriate about me')")"
chk "text gone, switch kept"             "true|true" "$(SU "select (college is null and about is null)::text||'|'||show_details::text from public.profile_details where user_id='$B'")"
chk "action logged"                      "clear_details|user|inappropriate about me" "$(SU "select action||'|'||target_type||'|'||reason_code from public.moderation_actions where action='clear_details' order by created_at desc limit 1")"
chk "nothing left to clear"              "no_details" "$(as $M authenticated "select public.mod_clear_profile_details('$B')")"
chk "unknown user"                       "not_found" "$(as $M authenticated "select public.mod_clear_profile_details('ffffffff-0000-4000-8000-0000000000ff')")"
chk "moderator cannot clear a moderator" "forbidden" "$(set_ $S "true,'Staff College',null,null,null,null" >/dev/null; as $M authenticated "select public.mod_clear_profile_details('$S')")"
chk "admin can clear a moderator"        "" "$(as $ADM authenticated "select public.mod_clear_profile_details('$S')")"

echo "== reports carry the details"
set_ $A "false,'College of Engineering',null,'3rd year',null,'About text here'" >/dev/null
as $B authenticated "select public.report_content('profile','$A','inappropriate')" >/dev/null
chk "moderator sees details even if hidden" "College: College of Engineering"$'\n'"Year: 3rd year"$'\n'"About me: About text here" "$(as $M authenticated "select body from public.mod_get_reports() where target_type='profile' and target_id='$A'")"
chk "title still 'profile'"              "profile" "$(as $M authenticated "select title from public.mod_get_reports() where target_type='profile' and target_id='$A'")"
chk "member cannot list reports"         "forbidden" "$(as $B authenticated "select * from public.mod_get_reports()")"

echo "== account deletion"
set_ $A "true,'College of Engineering',null,null,null,null" >/dev/null
SU "update public.user_flags set deleted_at=now(), status='banned' where user_id='$A'" >/dev/null
chk "details purged when the account is deleted" "0" "$(SU "select count(*) from public.profile_details where user_id='$A'")"

echo; echo "passed: $pass  failed: $fail"; [[ $fail -eq 0 ]]
