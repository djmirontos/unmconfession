#!/usr/bin/env bash
# Tests for 20261103100000_qa_posts.sql (applied in ONE transaction like the SQL editor).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_qa
OWN=20261103100000
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
SUAS() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$2" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1 | grep -v '^SET$'; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }
eq()  { if [[ "$3" == "$2" ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }
uid() { printf 'cccccccc-0000-4000-8000-%012d' "$1"; }
O=$(uid 1); A=$(uid 2); B=$(uid 3); C=$(uid 4); NONICK=$(uid 5); BAN=$(uid 6); M=$(uid 7)
for u in $O $A $B $C $NONICK $BAN $M; do SU "insert into auth.users (id) values ('$u')" >/dev/null; done
n=0; for u in $O $A $B $C $BAN $M; do n=$((n+1)); SU "update public.profiles set nickname='nick_$n' where id='$u'" >/dev/null; done
SU "update public.user_flags set status='banned' where user_id='$BAN'; update public.user_flags set role='moderator' where user_id='$M'" >/dev/null
SU "insert into public.keywords (term, match_type, applies_to) values ('holdword','contains','{post,comment}')" >/dev/null

echo "== data that exists BEFORE the migration (backfill)"
P0=$(as $O authenticated "select id from public.create_post('confession','old post before migration')")
T1=$(as $A authenticated "select id from public.create_comment('post','$P0','old top 1')")
T2=$(as $B authenticated "select id from public.create_comment('post','$P0','old top 2')")
R1=$(as $C authenticated "select id from public.create_reply('$T1','old reply')")
H1=$(as $C authenticated "select id from public.create_comment('post','$P0','holdword old held top')")
eq "before: comment_count = 3 published (held excluded)" "3" "$(SU "select comment_count from public.posts where id='$P0'")"

echo "== apply new migration in one transaction"
psql -X -q -1 -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/$OWN"_qa_posts.sql 2>&1 | grep -v NOTICE

echo "== schema"
eq "post_type default is post"          "post" "$(SU "select post_type from public.posts where id='$P0'")"
eq "backfill: answers = published top-level only" "2" "$(SU "select answer_count from public.posts where id='$P0'")"
eq "backfill: comment_count untouched"  "3" "$(SU "select comment_count from public.posts where id='$P0'")"
eq "feed_posts: two new columns are last" "post_type,answer_count" "$(SU "select string_agg(column_name, ',' order by ordinal_position) from (select column_name, ordinal_position from information_schema.columns where table_name='feed_posts' order by ordinal_position desc limit 2) x")"
eq "feed_posts: top_reactions still before them" "top_reactions" "$(SU "select column_name from information_schema.columns where table_name='feed_posts' order by ordinal_position desc offset 2 limit 1")"
eq "exactly ONE create_post function (no overload)" "1" "$(SU "select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='create_post'")"
eq "create_post signature unchanged"    "6" "$(SU "select pronargs from pg_proc where proname='create_post' and pronamespace='public'::regnamespace")"

echo "== grants"
chk "guest cannot create Q&A"          "permission denied" "$(as '' anon "select * from public.create_qa_post('hello?')")"
chk "member cannot call _create_post"  "permission denied" "$(as $O authenticated "select * from public._create_post('confession','x',null,'[]',null,null,'qa')")"
eq  "create_post still callable by members" "t" "$(SU "select has_function_privilege('authenticated','public.create_post(public.post_kind,text,text,jsonb,text[],timestamptz)','execute')")"
eq  "create_post still not callable by guests" "f" "$(SU "select has_function_privilege('anon','public.create_post(public.post_kind,text,text,jsonb,text[],timestamptz)','execute')")"

echo "== old-style calls keep working"
QO=$(as $O authenticated "select id from public.create_post('confession','old style call')")
eq "positional old call -> post_type post" "post" "$(SU "select post_type from public.posts where id='$QO'")"
QN=$(as $O authenticated "select id from public.create_post(p_kind => 'confession', p_body => 'named args call')")
eq "named-argument call (PostgREST style) works" "post" "$(SU "select post_type from public.posts where id='$QN'")"
QS=$(as $O authenticated "select id from public.create_post('shoutout','shout','Someone')")
eq "shoutout still works"              "shoutout|post" "$(SU "select kind||'|'||post_type from public.posts where id='$QS'")"
QP=$(as $O authenticated "select id from public.create_post('poll','Pick one?',null,'[]',array['a','b'],now()+interval '1 day')")
eq "poll still works"                  "poll|post" "$(SU "select kind||'|'||post_type from public.posts where id='$QP'")"

echo "== creating a Q&A post"
Q1=$(as $O authenticated "select id from public.create_qa_post('Where is the registrar office?')")
eq "stored as qa on kind confession"   "confession|qa|published" "$(SU "select kind||'|'||post_type||'|'||status from public.posts where id='$Q1'")"
eq "numbered like any post"            "true" "$(SU "select (number is not null)::text from public.posts where id='$Q1'")"
eq "published_at set"                  "true" "$(SU "select (published_at is not null)::text from public.posts where id='$Q1'")"
eq "answer_count starts at 0"          "0" "$(SU "select answer_count from public.posts where id='$Q1'")"
eq "get_feed shows it with post_type"  "qa|0" "$(as $A authenticated "select post_type||'|'||answer_count from public.get_feed() where id='$Q1'")"
eq "guests see it too"                 "qa" "$(as '' anon "select post_type from public.get_feed() where id='$Q1'")"
eq "old-app column list still selects" "1" "$(as $A authenticated "select count(*) from (select id, number, kind, body, target_name, images, ends_at, author_id, nickname, avatar_key, published_at, reaction_count, comment_count, my_reaction, poll_options, my_vote, edited_at, top_reactions from public.feed_posts where id='$Q1') x")"
chk "empty body rejected"              "invalid_body" "$(as $O authenticated "select * from public.create_qa_post('   ')")"
chk "null body rejected"               "invalid_body" "$(as $O authenticated "select * from public.create_qa_post(null)")"
chk "body over 2000 rejected"          "invalid_body" "$(as $O authenticated "select * from public.create_qa_post(repeat('x',2001))")"
chk "bad images rejected"              "invalid_images" "$(as $O authenticated "select * from public.create_qa_post('with bad image', '[{\"x\":1}]'::jsonb)")"
NOK=$(as $NONICK authenticated "select count(*) from public.posts where author_id='$NONICK'" | tail -1)
eq "nothing stored for no-nickname member" "0" "$NOK"
as $BAN authenticated "select * from public.create_qa_post('banned asks')" >/dev/null
eq "banned member stored nothing"      "0" "$(SU "select count(*) from public.posts where author_id='$BAN'")"

echo "== internal rules"
chk "qa on a shoutout is invalid"      "invalid_post_type" "$(SUAS $O "select * from public._create_post('shoutout','x','T','[]',null,null,'qa')" | head -1)"
chk "unknown type is invalid"          "invalid_post_type" "$(SUAS $O "select * from public._create_post('confession','x',null,'[]',null,null,'news')" | head -1)"
chk "check constraint: qa only on confession" "posts_qa_kind_check" "$(SU "update public.posts set post_type='qa' where id='$QS'")"
chk "check constraint: only post or qa" "posts_post_type_check" "$(SU "update public.posts set post_type='x' where id='$Q1'")"

echo "== type is locked"
chk "signed-in change refused"         "post_type_locked" "$(SUAS $O "update public.posts set post_type='post' where id='$Q1'")"
chk "signed-in change post->qa refused" "post_type_locked" "$(SUAS $O "update public.posts set post_type='qa' where id='$QO'")"
eq  "type unchanged"                   "qa" "$(SU "select post_type from public.posts where id='$Q1'")"
SU "update public.posts set post_type='post' where id='$Q1'" >/dev/null
eq  "dashboard/SQL editor can still fix a row" "post" "$(SU "select post_type from public.posts where id='$Q1'")"
SU "update public.posts set post_type='qa' where id='$Q1'" >/dev/null

echo "== moderation unchanged"
QH=$(as $O authenticated "select id from public.create_qa_post('holdword in a question')")
eq "keyword hold: pending"             "pending" "$(SU "select status from public.posts where id='$QH'")"
eq "hold row created"                  "1" "$(SU "select count(*) from public.moderation_holds where target_type='post' and target_id='$QH'")"
eq "held Q&A not in the feed"          "0" "$(as $A authenticated "select count(*) from public.get_feed() where id='$QH'")"
eq "held Q&A keeps its type"           "qa" "$(SU "select post_type from public.posts where id='$QH'")"
as $M authenticated "select public.mod_review('post','$QH','approve',null,null)" >/dev/null
eq "approve publishes it"              "published" "$(SU "select status from public.posts where id='$QH'")"
eq "...and it appears in the feed as qa" "qa" "$(as $A authenticated "select post_type from public.get_feed() where id='$QH'")"
QR=$(as $O authenticated "select id from public.create_qa_post('to be removed')")
as $M authenticated "select public.mod_review('post','$QR','remove','Spam','x')" >/dev/null 2>&1
SU "update public.posts set status='removed' where id='$QR' and status='published'" >/dev/null
eq "removed Q&A leaves the feed"       "0" "$(as $A authenticated "select count(*) from public.get_feed() where id='$QR'")"

echo "== rate limit is shared"
for i in 1 2 3 4 5 6 7 8; do as $C authenticated "select id from public.create_qa_post('rate $i')" >/dev/null; done
as $C authenticated "select id from public.create_post('confession','rate post 9')" >/dev/null
as $C authenticated "select id from public.create_qa_post('rate 10')" >/dev/null
chk "11th post in an hour refused"     "rate_limited" "$(as $C authenticated "select * from public.create_qa_post('rate 11')")"
chk "...also for create_post"          "rate_limited" "$(as $C authenticated "select * from public.create_post('confession','rate 11b')")"

echo "== answer counter"
Q2=$(as $O authenticated "select id from public.create_qa_post('Which canteen is cheapest?')")
a1=$(as $A authenticated "select id from public.create_comment('post','$Q2','the north one')")
eq "first answer counted"              "1|1" "$(SU "select answer_count||'|'||comment_count from public.posts where id='$Q2'")"
a2=$(as $B authenticated "select id from public.create_comment('post','$Q2','the south one')")
eq "second answer counted"             "2|2" "$(SU "select answer_count||'|'||comment_count from public.posts where id='$Q2'")"
r1=$(as $C authenticated "select id from public.create_reply('$a1','thanks!')")
eq "a reply is not an answer"          "2|3" "$(SU "select answer_count||'|'||comment_count from public.posts where id='$Q2'")"
r2=$(as $A authenticated "select id from public.create_reply('$r1','welcome')")
eq "reply to a reply is not an answer" "2|4" "$(SU "select answer_count||'|'||comment_count from public.posts where id='$Q2'")"
ah=$(as $C authenticated "select id from public.create_comment('post','$Q2','holdword answer')")
eq "held answer not counted yet"       "2|4" "$(SU "select answer_count||'|'||comment_count from public.posts where id='$Q2'")"
as $M authenticated "select public.mod_review('comment','$ah','approve',null,null)" >/dev/null
eq "approved answer counted"           "3|5" "$(SU "select answer_count||'|'||comment_count from public.posts where id='$Q2'")"
SU "update public.comments set status='removed' where id='$ah'" >/dev/null
eq "removed answer uncounted"          "2|4" "$(SU "select answer_count||'|'||comment_count from public.posts where id='$Q2'")"
SU "update public.comments set status='removed' where id='$a1'" >/dev/null
eq "removing an answer removes its replies from comment_count too" "1|1" "$(SU "select answer_count||'|'||comment_count from public.posts where id='$Q2'")"
eq "feed shows the answer count"       "1" "$(as $A authenticated "select answer_count from public.get_feed() where id='$Q2'")"
SU "delete from public.comments where id='$a2'" >/dev/null
eq "hard delete of an answer"          "0|0" "$(SU "select answer_count||'|'||comment_count from public.posts where id='$Q2'")"
LST=$(as $O authenticated "select id from public.create_listing('sell','Bike',null,100,'good')")
as $A authenticated "select id from public.create_comment('listing','$LST','nice bike')" >/dev/null
eq "listing comments do not touch posts" "0|0" "$(SU "select answer_count||'|'||comment_count from public.posts where id='$Q2'")"
NP=$(as $O authenticated "select id from public.create_post('confession','normal post')")
as $A authenticated "select id from public.create_comment('post','$NP','c1')" >/dev/null
eq "normal post: answer_count follows top-level comments" "1" "$(SU "select answer_count from public.posts where id='$NP'")"

echo "== block filtering still applies to the feed"
QB=$(as $A authenticated "select id from public.create_qa_post('asked by A')")
as $B authenticated "select public.block_user('$A')" >/dev/null 2>&1
SU "insert into public.user_blocks (blocker_id, blocked_id) values ('$B','$A') on conflict do nothing" >/dev/null
eq "blocked author's Q&A hidden"       "0" "$(as $B authenticated "select count(*) from public.get_feed() where id='$QB'")"
eq "others still see it"               "1" "$(as $C authenticated "select count(*) from public.get_feed() where id='$QB'")"

echo; echo "Result: $pass passed, $fail failed"; [[ $fail -eq 0 ]]
