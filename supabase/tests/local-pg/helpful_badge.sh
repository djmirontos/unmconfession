#!/usr/bin/env bash
# Tests for 20261103120000_helpful_badge.sql (applied in ONE transaction like the SQL editor).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_hb
OWN=20261103120000
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
uid() { printf 'ffffffff-0000-4000-8000-%012d' "$1"; }
K1=$(uid 1); K2=$(uid 2); K3=$(uid 3); K4=$(uid 4); A=$(uid 5); B=$(uid 6)
V1=$(uid 11); V2=$(uid 12); V3=$(uid 13); V4=$(uid 14); V5=$(uid 15); BV=$(uid 16); DV=$(uid 17); BA=$(uid 18)
ALL="$K1 $K2 $K3 $K4 $A $B $V1 $V2 $V3 $V4 $V5 $BV $DV $BA"
for u in $ALL; do SU "insert into auth.users (id) values ('$u')" >/dev/null; done
n=0; for u in $ALL; do n=$((n+1)); SU "update public.profiles set nickname='nick_$n' where id='$u'" >/dev/null; done
has()  { SU "select count(*) from public.user_badges where user_id='$1' and badge_code='helpful'"; }
wins() { SU "select count(*) from public.helpful_wins where user_id='$1'"; }
award() { SU "select public.award_badges()" >/dev/null; }
age()  { SU "update public.posts set published_at = now() - interval '$2 hours' where id='$1'" >/dev/null; }
# qa <asker> <body> -> post id
qa()   { as "$1" authenticated "select id from public.create_qa_post('$2')"; }
ans()  { as "$1" authenticated "select id from public.create_comment('post','$2','$3')"; }
up()   { as "$1" authenticated "select public.set_answer_upvote('$2', true)" >/dev/null; }

echo "== apply new migration in one transaction"
psql -X -q -1 -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/${OWN}_helpful_badge.sql" 2>&1 | grep -v NOTICE

echo "== catalog and access"
eq  "badge exists with sort_order 6"      "Helpful|6" "$(SU "select name||'|'||sort_order from public.badges where code='helpful'")"
chk "members cannot read helpful_wins"    "permission denied" "$(as $A authenticated "select * from public.helpful_wins")"
chk "members cannot write helpful_wins"   "permission denied" "$(as $A authenticated "insert into public.helpful_wins (post_id,user_id) values (gen_random_uuid(),'$A')")"
chk "guests cannot read helpful_wins"     "permission denied" "$(as '' anon "select * from public.helpful_wins")"
chk "members cannot run award_badges"     "permission denied" "$(as $A authenticated "select public.award_badges()")"

echo "== a win needs the right conditions"
P1=$(qa $K1 'Which canteen is best?')
a1=$(ans $A $P1 'north canteen'); b1=$(ans $B $P1 'south canteen')
for v in $V1 $V2 $V3; do up $v $a1; done
up $V1 $b1
award
eq  "post is too new: no win"             "0" "$(wins $A)"
age $P1 47
award
eq  "47 hours old: still no win"          "0" "$(wins $A)"
age $P1 49
award
eq  "49 hours, 3 upvoters, 2 answers: win" "1" "$(wins $A)"
eq  "win points at the post and answer"   "$P1|$a1" "$(SU "select post_id||'|'||comment_id from public.helpful_wins where user_id='$A'")"
eq  "one win is not enough for the badge" "0" "$(has $A)"
award
eq  "running again adds nothing"          "1" "$(wins $A)"

echo "== conditions that must NOT produce a win"
P2=$(qa $K1 'Only one answer here?'); x=$(ans $A $P2 'lonely answer'); for v in $V1 $V2 $V3; do up $v $x; done; age $P2 60
P3=$(qa $K1 'Only two upvoters?'); y=$(ans $A $P3 'two votes'); z=$(ans $B $P3 'other'); for v in $V1 $V2; do up $v $y; done; age $P3 60
P4=$(qa $K2 'Asker answers own question?'); own=$(ans $K2 $P4 'my own answer'); oth=$(ans $B $P4 'another answer')
for v in $V1 $V2 $V3 $V4; do up $v $own; done; age $P4 60
award
eq  "one answer only: no win"             "0" "$(SU "select count(*) from public.helpful_wins where post_id='$P2'")"
eq  "two upvoters only: no win"           "0" "$(SU "select count(*) from public.helpful_wins where post_id='$P3'")"
eq  "asker's own answer cannot win; the other has no votes" "0" "$(SU "select count(*) from public.helpful_wins where post_id='$P4'")"
for v in $V1 $V2 $V3; do up $v $oth; done
award
eq  "another answer with 3 upvoters wins when the asker's is excluded" "$B" "$(SU "select user_id from public.helpful_wins where post_id='$P4'")"
NP=$(as $K3 authenticated "select id from public.create_post('confession','normal post')"); n1=$(ans $A $NP 'c1'); n2=$(ans $B $NP 'c2'); age $NP 60
eq  "normal posts never count"            "0" "$(SU "select count(*) from public.helpful_wins where post_id='$NP'")"
SU "select count(*) from public.comment_upvotes" >/dev/null

echo "== banned and deleted voters do not count"
P5=$(qa $K3 'Votes from banned accounts?'); a5=$(ans $A $P5 'answer'); b5=$(ans $B $P5 'other')
for v in $V1 $V2 $BV; do up $v $a5; done
SU "update public.user_flags set status='banned' where user_id='$BV'" >/dev/null
age $P5 60; award
eq  "2 valid + 1 banned voter: no win"    "0" "$(SU "select count(*) from public.helpful_wins where post_id='$P5'")"
up $DV $a5
SU "update public.user_flags set deleted_at=now(), status='banned' where user_id='$DV'" >/dev/null
award
eq  "a deleted voter does not count either" "0" "$(SU "select count(*) from public.helpful_wins where post_id='$P5'")"
up $V3 $a5
award
eq  "a third VALID upvoter completes it"  "$A" "$(SU "select user_id from public.helpful_wins where post_id='$P5'")"

echo "== ties and locking"
P6=$(qa $K3 'Tie between two answers?'); a6=$(ans $A $P6 'first answer'); b6=$(ans $B $P6 'second answer')
for v in $V1 $V2 $V3; do up $v $a6; up $v $b6; done
SU "update public.comments set published_at = now() - interval '10 hours' where id='$b6'; update public.comments set published_at = now() - interval '9 hours' where id='$a6'" >/dev/null
age $P6 60; award
eq  "tie: the earlier answer wins"        "$B" "$(SU "select user_id from public.helpful_wins where post_id='$P6'")"
for v in $V4 $V5; do up $v $a6; done
award
eq  "overtaking later does not change the winner" "$B" "$(SU "select user_id from public.helpful_wins where post_id='$P6'")"
eq  "winners are recorded once per post"  "1" "$(SU "select count(*) from public.helpful_wins where post_id='$P6'")"

echo "== the badge needs 3 different posts"
eq  "A has wins on P1 and P5"             "2" "$(wins $A)"
eq  "still no badge with 2 wins"          "0" "$(has $A)"
P7=$(qa $K4 'Third question for A?'); a7=$(ans $A $P7 'a answer'); b7=$(ans $B $P7 'b answer')
for v in $V1 $V2 $V3; do up $v $a7; done
age $P7 60; award
eq  "third win"                           "3" "$(wins $A)"
eq  "badge awarded on the third win"      "1" "$(has $A)"
eq  "B has wins on P4 and P6 only"        "2" "$(wins $B)"
eq  "B has no badge yet"                  "0" "$(has $B)"
eq  "get_top_badges returns it"           "helpful|Helpful" "$(as $K1 authenticated "select code||'|'||name from public.get_top_badges(array['$A']::uuid[]) where code='helpful'")"
eq  "get_user_badges returns it"          "helpful" "$(as $K1 authenticated "select code from public.get_user_badges('$A') where code='helpful'")"

echo "== never revoked"
SU "delete from public.comment_upvotes" >/dev/null
SU "update public.comments set status='removed' where id in ('$a1','$a5','$a7')" >/dev/null
award
eq  "wins remain after votes vanish and answers are removed" "3" "$(wins $A)"
eq  "badge stays"                         "1" "$(has $A)"
SU "delete from public.posts where id='$P1'" >/dev/null
eq  "a purged post does not erase the win" "3" "$(wins $A)"

echo "== banned members get nothing"
P8=$(qa $K4 'Banned answerer?'); a8=$(ans $BA $P8 'banned answer'); b8=$(ans $B $P8 'ok answer')
for v in $V1 $V2 $V3; do up $v $a8; done
SU "update public.user_flags set status='banned' where user_id='$BA'" >/dev/null
age $P8 60; award
eq  "banned author's answer cannot win"   "0" "$(SU "select count(*) from public.helpful_wins where user_id='$BA'")"
eq  "banned member has no helpful badge"  "0" "$(has $BA)"
SU "update public.user_flags set status='banned' where user_id='$B'" >/dev/null
award
eq  "a banned member never gets the badge" "0" "$(has $B)"

echo "== other badges still work"
eq  "first_circle still awarded"          "1" "$(SU "select count(*) from public.user_badges where user_id='$K1' and badge_code='first_circle'")"
SU "delete from public.user_badges where user_id='$K1' and badge_code='first_circle'" >/dev/null
award
eq  "...and re-awarded by the same function" "1" "$(SU "select count(*) from public.user_badges where user_id='$K1' and badge_code='first_circle'")"

echo; echo "Result: $pass passed, $fail failed"; [[ $fail -eq 0 ]]
