#!/usr/bin/env bash
# Tests for 20261026110000_nickname_keywords.sql (needs 20261026100000 too)
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_nk

psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/tests/00_supabase_stub.sql" 2>/dev/null || { echo "stub failed"; exit 1; }
for f in 20261021000000_v1_schema 20261022100000_feed_events 20261022110000_allow_three_images 20261023100000_lost_found_manila_date 20261023110000_lost_found_type 20261023120000_edit_delete_own 20261023130000_comments_edit_delete 20261024100000_poll_vote_change 20261024110000_block_filtering 20261024120000_notifications 20261025100000_comment_reactions 20261025110000_top_reactions 20261025120000_comment_replies 20261025130000_listings_filters 20261026100000_account_settings 20261026110000_nickname_keywords; do
  [[ $f == 20261024110000_block_filtering ]] && psql -X -q -d $DB -c "revoke all on public.user_blocks from anon"
  psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/$f.sql" 2>&1 | grep -v NOTICE
done

SU() { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }
eq()  { if [[ "$3" == "$2" ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }
flag() { SU "select coalesce(public._nickname_flagged('$1'), '-')"; }
val()  { SU "select public._validate_nickname('$1')" ; }

echo "== starter list catches the obvious, and the disguises"
eq "plain"                       "fuck"   "$(flag fuck_you)"
eq "capital letters"             "(^|[_.])sh[i1]t" "$(flag SHIT_head)"
eq "digit for a letter (sh1t)"   "(^|[_.])sh[i1]t" "$(flag sh1t_post)"
eq "at the start of a name"      "(^|[_.])sh[i1]t" "$(flag shitlord)"
eq "after a separator"            "(^|[_.])sh[i1]t" "$(flag xx.shit)"
eq "cunt at the start"            "(^|[_.])cunt" "$(flag cunt_x)"
eq "digits (b1tch)"              "bitch"  "$(flag b1tch_x)"
eq "dots between letters"        "fuck"   "$(flag f.u.c.k)"
eq "underscores between letters" "fuck"   "$(flag f_u_c_k)"
eq "inside a longer name"        "fuck"   "$(flag xx_fuck_xx)"
eq "Filipino term"               "putang" "$(flag PutangIna99)"
eq "tangina"                     "tangina" "$(flag t4ngina_x)"
eq "second term in the list works" "hitler" "$(flag little_hitler)"

echo "== normal names are not caught"
for n in alice_a Juan.Dela.Cruz maria123 cl4ss_rep glass_half bassist unm_fan classic cassandra pedro_2005 Yoshitaka Mashitah Toshito Scunthorpe Scunthorpe_fan the.quick.fox; do
  eq "clean: $n" "-" "$(flag $n)"
done

echo "== keyword types and scopes"
SU "insert into public.keywords (term, match_type, applies_to, category) values
  ('ass','word',array['nickname'],'abuse'),
  ('^xx+\$','regex',array['nickname'],'abuse'),
  ('lemon','contains',array['post','comment'],'other'),
  ('melon','contains',array['nickname'],'other')" >/dev/null
SU "alter table public.keywords disable trigger keywords_validate; insert into public.keywords (term, match_type, applies_to, category) values ('([','regex',array['nickname'],'abuse'); alter table public.keywords enable trigger keywords_validate" >/dev/null
eq "word: separate part matches"  "ass" "$(flag ass_king)"
eq "word: dotted part matches"    "ass" "$(flag my.ass)"
eq "word: inside 'class' does not" "-" "$(flag class)"
eq "word: 'bass' does not"         "-" "$(flag bass_guitar)"
eq "word: 'passion' does not"      "-" "$(flag passion)"
eq "regex matches"                 "^xx+\$" "$(flag xxxx)"
eq "regex: no match elsewhere"     "-" "$(flag axxb)"
eq "a broken regex is skipped, others still work" "fuck" "$(flag fuck_me)"
eq "a broken regex alone blocks nobody" "-" "$(flag perfectly_fine)"
eq "post-only keyword is ignored for names" "-" "$(flag lemon_tree)"
eq "nickname keyword applies"       "melon" "$(flag water_melon)"
SU "update public.keywords set active=false where term='melon'" >/dev/null
eq "inactive keyword is ignored"    "-" "$(flag water_melon)"
SU "update public.keywords set active=true where term='melon'" >/dev/null
eq "new scope accepted by the table check" "1" "$(SU "select count(*) from public.keywords where applies_to = array['nickname']::text[] and term='melon'")"
chk "other scopes still refused"    "violates check constraint" "$(SU "insert into public.keywords (term, applies_to) values ('zzz', array['bogus'])")"
chk "empty scope still refused"     "violates check constraint" "$(SU "insert into public.keywords (term, applies_to) values ('zzz', array[]::text[])")"
eq "post moderation unaffected by nickname terms" "pending" "$(SU "select out_status from public._moderation_decision('post','a lemon here')")"
eq "...and nickname-only terms do not hold posts" "published" "$(SU "select out_status from public._moderation_decision('post','fuck this melon')")"

echo "== validation and the error message"
chk "flagged name is refused"      "nickname_flagged" "$(val fuck_you)"
chk "message hides the word"       "" "$(val fuck_you | grep -ci 'matched' | sed 's/^0$//')"
chk "format check comes first"     "nickname_invalid" "$(val 'f u')"
chk "reserved check comes first"   "nickname_reserved" "$(val admin)"
eq "a clean name passes"           "" "$(val clean_name1)"

echo "== sign-up and change"
A=44444444-9999-4000-8000-000000000001
chk "sign-up with a flagged nickname fails" "nickname_flagged" "$(SU "insert into auth.users (id,email,raw_user_meta_data) values ('$A','a@unm.test','{\"nickname\":\"sh1t_lord\"}')")"
eq "...and no account was created"  "0" "$(SU "select count(*) from auth.users where id='$A'")"
SU "insert into auth.users (id,email,raw_user_meta_data) values ('$A','a@unm.test','{\"nickname\":\"alice_a\"}')" >/dev/null
chk "change to a flagged name refused" "nickname_flagged" "$(as $A authenticated "select public.change_nickname('Fuck_Off')")"
chk "...disguised too"              "nickname_flagged" "$(as $A authenticated "select public.change_nickname('f.u.c.k.er')")"
eq "name unchanged"                 "alice_a" "$(SU "select nickname from public.profiles where id='$A'")"
eq "cooldown not started by a refusal" "" "$(SU "select coalesce(nickname_changed_at::text,'') from public.user_settings where user_id='$A'")"
as $A authenticated "select public.change_nickname('alice_ok')" >/dev/null
eq "a clean change still works"     "alice_ok" "$(SU "select nickname from public.profiles where id='$A'")"
SU "insert into public.keywords (term, match_type, applies_to, category) values ('alice','contains',array['nickname'],'other')" >/dev/null
SU "update public.user_settings set nickname_changed_at = now() - interval '40 days' where user_id='$A'" >/dev/null
as $A authenticated "select public.change_nickname('ALICE_OK')" >/dev/null
eq "capital-letter change of an existing name is not re-checked" "ALICE_OK" "$(SU "select nickname from public.profiles where id='$A'")"
chk "set_nickname refuses flagged too" "nickname_flagged" "$(SU "insert into auth.users (id,email) values ('44444444-9999-4000-8000-000000000002','b@unm.test')" >/dev/null; as 44444444-9999-4000-8000-000000000002 authenticated "select public.set_nickname('shit_user')")"
SU "update public.user_flags set role='admin' where user_id='$A'" >/dev/null
as $A authenticated "select public.admin_set_nickname('44444444-9999-4000-8000-000000000002','fuck_staff')" >/dev/null
eq "an admin can still set any name" "fuck_staff" "$(SU "select nickname from public.profiles where id='44444444-9999-4000-8000-000000000002'")"
chk "guests cannot run the checker" "permission denied" "$(as '' anon "select public._nickname_flagged('x')")"
chk "signed-in users cannot run it either" "permission denied" "$(as $A authenticated "select public._nickname_flagged('x')")"

echo; echo "RESULT: $pass passed, $fail failed"; [[ $fail -eq 0 ]]
