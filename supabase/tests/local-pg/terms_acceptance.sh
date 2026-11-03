#!/usr/bin/env bash
# Tests for 20261026130000_terms_acceptance.sql
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_ta
psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/tests/00_supabase_stub.sql" 2>/dev/null || { echo "stub failed"; exit 1; }
LIST="20261021000000_v1_schema 20261022100000_feed_events 20261022110000_allow_three_images 20261023100000_lost_found_manila_date 20261023110000_lost_found_type 20261023120000_edit_delete_own 20261023130000_comments_edit_delete 20261024100000_poll_vote_change 20261024110000_block_filtering 20261024120000_notifications 20261025100000_comment_reactions 20261025110000_top_reactions 20261025120000_comment_replies 20261025130000_listings_filters 20261026100000_account_settings 20261026110000_nickname_keywords 20261026120000_delete_account_closes_listings"
# two accounts exist BEFORE the migration, to test the backfill
for f in $LIST; do
  [[ $f == 20261024110000_block_filtering ]] && psql -X -q -d $DB -c "revoke all on public.user_blocks from anon"
  psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/$f.sql" 2>&1 | grep -v NOTICE
done
SU() { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }
eq()  { if [[ "$3" == "$2" ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }
P=66666666-9999-4000-8000-0000000000
OLD1=${P}01; OLD2=${P}02
SU "insert into auth.users (id,email,raw_user_meta_data) values ('$OLD1','old1@unm.test','{\"nickname\":\"old_one\",\"terms_accepted_at\":\"2026-10-01T00:00:00Z\"}'),('$OLD2','old2@unm.test','{\"nickname\":\"old_two\"}')" >/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/20261026130000_terms_acceptance.sql" 2>&1 | grep -v NOTICE
eq "backfill: sign-up metadata with terms is recorded" "true" "$(SU "select (terms_accepted_at is not null)::text from public.user_flags where user_id='$OLD1'")"
eq "backfill: no metadata stays empty" "false" "$(SU "select (terms_accepted_at is not null)::text from public.user_flags where user_id='$OLD2'")"

echo "== sign-up"
E=${P}10; G=${P}11
SU "insert into auth.users (id,email,raw_user_meta_data) values ('$E','e@unm.test','{\"nickname\":\"email_user\",\"terms_accepted_at\":\"2026-10-26T10:00:00Z\"}')" >/dev/null
eq "email sign-up with terms: recorded at server time" "true" "$(SU "select (terms_accepted_at > now() - interval '1 minute')::text from public.user_flags where user_id='$E'")"
SU "insert into auth.users (id,email,raw_user_meta_data) values ('$G','g@unm.test','{\"full_name\":\"Google Person\",\"avatar_url\":\"http://x/y.png\"}')" >/dev/null
eq "google sign-up: no terms yet" "false" "$(SU "select (terms_accepted_at is not null)::text from public.user_flags where user_id='$G'")"
eq "google sign-up: no nickname, nothing copied from Google" "|avatar_01" "$(SU "select coalesce(nickname,'')||'|'||avatar_key from public.profiles where id='$G'")"
SU "insert into auth.users (id,email,raw_user_meta_data) values ('${P}12','blank@unm.test','{\"nickname\":\"blank_user\",\"terms_accepted_at\":\"\"}')" >/dev/null
eq "empty terms value is not an acceptance" "false" "$(SU "select (terms_accepted_at is not null)::text from public.user_flags where user_id='${P}12'")"
chk "bad nickname in metadata still fails sign-up" "nickname_flagged" "$(SU "insert into auth.users (id,email,raw_user_meta_data) values ('${P}13','bad@unm.test','{\"nickname\":\"fuck_x\"}')")"

echo "== set_nickname"
chk "guest cannot" "permission denied" "$(as '' anon "select public.set_nickname('guest_x', true)")"
chk "old one-argument call still resolves for people who accepted (nickname_locked)" "nickname_locked" "$(as $E authenticated "select public.set_nickname('another_one')")"
chk "google user without the box ticked" "terms_required" "$(as $G authenticated "select public.set_nickname('google_user')")"
chk "...explicit false" "terms_required" "$(as $G authenticated "select public.set_nickname('google_user', false)")"
chk "...null" "terms_required" "$(as $G authenticated "select public.set_nickname('google_user', null)")"
eq "nothing saved after refusals" "|false" "$(SU "select coalesce(p.nickname,'')||'|'||(f.terms_accepted_at is not null)::text from public.profiles p join public.user_flags f on f.user_id=p.id where p.id='$G'")"
chk "flagged name with the box ticked is refused" "nickname_flagged" "$(as $G authenticated "select public.set_nickname('f.u.c.k_me', true)")"
eq "...and acceptance is NOT recorded by a failed call" "false" "$(SU "select (terms_accepted_at is not null)::text from public.user_flags where user_id='$G'")"
chk "taken name" "nickname_taken" "$(as $G authenticated "select public.set_nickname('EMAIL_USER', true)")"
as $G authenticated "select public.set_nickname('  google_user  ', true)" >/dev/null
eq "ticked: nickname saved (trimmed)" "google_user" "$(SU "select nickname from public.profiles where id='$G'")"
eq "...acceptance recorded" "true" "$(SU "select (terms_accepted_at > now() - interval '1 minute')::text from public.user_flags where user_id='$G'")"
chk "second time: nickname_locked" "nickname_locked" "$(as $G authenticated "select public.set_nickname('other_name', true)")"
# an email user who accepted at sign-up but has no nickname yet does not need the box
SU "insert into auth.users (id,email,raw_user_meta_data) values ('${P}14','n@unm.test','{\"terms_accepted_at\":\"2026-10-26T10:00:00Z\"}')" >/dev/null
as ${P}14 authenticated "select public.set_nickname('late_chooser')" >/dev/null
eq "accepted at sign-up: no checkbox needed later" "late_chooser" "$(SU "select nickname from public.profiles where id='${P}14'")"

echo "== restrictions on set_nickname"
for pair in "15:banned" "16:suspended" "17:active"; do
  id=${P}${pair%%:*}
  SU "insert into auth.users (id,email) values ('$id','r${pair%%:*}@unm.test')" >/dev/null
done
SU "update public.user_flags set status='banned' where user_id='${P}15'; update public.user_flags set status='suspended', suspended_until=now()+interval '1 day' where user_id='${P}16'" >/dev/null
chk "banned" "banned" "$(as ${P}15 authenticated "select public.set_nickname('banned_try', true)")"
chk "suspended" "suspended" "$(as ${P}16 authenticated "select public.set_nickname('susp_try', true)")"
SU "update public.user_flags set suspended_until=now()-interval '1 hour' where user_id='${P}16'" >/dev/null
as ${P}16 authenticated "select public.set_nickname('susp_over', true)" >/dev/null
eq "an ended suspension no longer blocks" "susp_over" "$(SU "select nickname from public.profiles where id='${P}16'")"
SU "update public.user_flags set status='suspended', suspended_until=null where user_id='${P}17'" >/dev/null
chk "suspension with no end date blocks" "suspended" "$(as ${P}17 authenticated "select public.set_nickname('forever', true)")"

echo "== delete_my_account and restrictions"
chk "banned cannot delete" "account_restricted" "$(as ${P}15 authenticated "select public.delete_my_account('delete')")"
eq "...still exists" "1" "$(SU "select count(*) from auth.users where id='${P}15'")"
chk "suspended (no end) cannot delete" "account_restricted" "$(as ${P}17 authenticated "select public.delete_my_account('delete')")"
SU "update public.user_flags set status='suspended', suspended_until=now()-interval '1 hour' where user_id='${P}16'" >/dev/null
as ${P}16 authenticated "select public.delete_my_account('susp_over')" >/dev/null
eq "ended suspension: can delete" "0" "$(SU "select count(*) from auth.users where id='${P}16'")"
as $G authenticated "select public.delete_my_account('google_user')" >/dev/null
eq "normal user can delete" "0" "$(SU "select count(*) from auth.users where id='$G'")"
chk "deleted: second attempt not_found" "not_found" "$(as $G authenticated "select public.delete_my_account('delete')")"
chk "deleted: set_nickname refused" "account_deleted" "$(as $G authenticated "select public.set_nickname('zombie', true)")"
eq "banned user's flags unchanged by the refusal" "banned" "$(SU "select status::text from public.user_flags where user_id='${P}15'")"
chk "guests cannot delete" "permission denied" "$(as '' anon "select public.delete_my_account('x')")"

echo; echo "RESULT: $pass passed, $fail failed"; [[ $fail -eq 0 ]]
