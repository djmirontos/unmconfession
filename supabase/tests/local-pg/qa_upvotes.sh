#!/usr/bin/env bash
# Tests for 20261103110000_qa_upvotes.sql (applied in ONE transaction like the SQL editor).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_qu
OWN=20261103110000
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
uid() { printf 'eeeeeeee-0000-4000-8000-%012d' "$1"; }
ASK=$(uid 1); ANS=$(uid 2); V1=$(uid 3); V2=$(uid 4); V3=$(uid 5); NONICK=$(uid 6); BAN=$(uid 7); SUS=$(uid 8); M=$(uid 9)
for u in $ASK $ANS $V1 $V2 $V3 $NONICK $BAN $SUS $M; do SU "insert into auth.users (id) values ('$u')" >/dev/null; done
n=0; for u in $ASK $ANS $V1 $V2 $V3 $BAN $SUS $M; do n=$((n+1)); SU "update public.profiles set nickname='nick_$n' where id='$u'" >/dev/null; done
SU "update public.user_flags set role='moderator' where user_id='$M'" >/dev/null
SU "insert into public.keywords (term, match_type, applies_to) values ('holdword','contains','{comment}')" >/dev/null

QA=$(as $ASK authenticated "select id from public.create_qa_post('Which canteen is best?')")
NP=$(as $ASK authenticated "select id from public.create_post('confession','A normal post')")
LST=$(as $ASK authenticated "select id from public.create_listing('sell','Bike',null,100,'good')")
A1=$(as $ANS authenticated "select id from public.create_comment('post','$QA','the north one')")
A2=$(as $V3 authenticated "select id from public.create_comment('post','$QA','the south one')")
RP=$(as $V1 authenticated "select id from public.create_reply('$A1','a reply to A1')")
NC=$(as $ANS authenticated "select id from public.create_comment('post','$NP','comment on a normal post')")
LC=$(as $ANS authenticated "select id from public.create_comment('listing','$LST','comment on a listing')")
HC=$(as $ANS authenticated "select id from public.create_comment('post','$QA','holdword answer')")

echo "== apply new migration in one transaction"
psql -X -q -1 -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/${OWN}_qa_upvotes.sql" 2>&1 | grep -v NOTICE

echo "== schema"
eq "upvote_count starts at 0"           "0" "$(SU "select upvote_count from public.comments where id='$A1'")"
eq "thread_comments: two new columns are last" "upvote_count,my_upvote" "$(SU "select string_agg(column_name, ',' order by ordinal_position) from (select column_name, ordinal_position from information_schema.columns where table_name='thread_comments' order by ordinal_position desc limit 2) x")"
eq "reply_count still before them"      "reply_count" "$(SU "select column_name from information_schema.columns where table_name='thread_comments' order by ordinal_position desc offset 2 limit 1")"
eq "RLS on comment_upvotes"             "t" "$(SU "select relrowsecurity::text from pg_class where oid='public.comment_upvotes'::regclass" | cut -c1)"

echo "== access"
chk "guest cannot upvote"               "permission denied" "$(as '' anon "select public.set_answer_upvote('$A1', true)")"
chk "member cannot insert directly"     "permission denied" "$(as $V1 authenticated "insert into public.comment_upvotes (comment_id,user_id) values ('$A1','$V1')")"
chk "member cannot update count directly" "permission denied" "$(as $V1 authenticated "update public.comments set upvote_count=99 where id='$A1'")"
chk "trigger helper is not callable"    "permission denied" "$(as $V1 authenticated "select public.comment_upvotes_after_write()")"
chk "posts_lock_type is not callable"   "permission denied" "$(as $V1 authenticated "select public.posts_lock_type()")"

echo "== upvoting an answer"
eq "first upvote returns 1"             "1" "$(as $V1 authenticated "select public.set_answer_upvote('$A1', true)")"
eq "stored count"                       "1" "$(SU "select upvote_count from public.comments where id='$A1'")"
eq "same upvote again: still 1"         "1" "$(as $V1 authenticated "select public.set_answer_upvote('$A1', true)")"
eq "second voter: 2"                    "2" "$(as $V2 authenticated "select public.set_answer_upvote('$A1', true)")"
eq "a different answer is independent"  "0" "$(SU "select upvote_count from public.comments where id='$A2'")"
eq "voter sees my_upvote true"          "t" "$(as $V1 authenticated "select my_upvote from public.get_comments('post','$QA') where id='$A1'")"
eq "other member sees my_upvote false"  "f" "$(as $V3 authenticated "select my_upvote from public.get_comments('post','$QA') where id='$A1'")"
eq "everyone sees the number"           "2" "$(as $V3 authenticated "select upvote_count from public.get_comments('post','$QA') where id='$A1'")"
eq "guests see the number, no my_upvote" "2|false" "$(as '' anon "select upvote_count||'|'||my_upvote from public.get_comments('post','$QA') where id='$A1'")"
eq "voter reads only own row"           "1" "$(as $V1 authenticated "select count(*) from public.comment_upvotes")"
eq "another member cannot read the row" "0" "$(as $V3 authenticated "select count(*) from public.comment_upvotes where comment_id='$A1' and user_id='$V1'")"
eq "answers still ordered by time"      "the north one|the south one" "$(as $V1 authenticated "select string_agg(body, '|' order by published_at, id) from public.get_comments('post','$QA')")"

echo "== removing an upvote"
eq "remove returns 1"                   "1" "$(as $V1 authenticated "select public.set_answer_upvote('$A1', false)")"
eq "remove again: not below the real count" "1" "$(as $V1 authenticated "select public.set_answer_upvote('$A1', false)")"
eq "removing a never-given upvote is harmless" "1" "$(as $V3 authenticated "select public.set_answer_upvote('$A1', false)")"
eq "remove the last: 0"                 "0" "$(as $V2 authenticated "select public.set_answer_upvote('$A1', false)")"
eq "toggle on again"                    "1" "$(as $V1 authenticated "select public.set_answer_upvote('$A1', true)")"
eq "null flag counts as off"            "0" "$(as $V1 authenticated "select public.set_answer_upvote('$A1', null)")"

echo "== rules"
chk "own answer refused"                "own_answer" "$(as $ANS authenticated "select public.set_answer_upvote('$A1', true)")"
chk "a reply cannot be upvoted"         "not_found" "$(as $V2 authenticated "select public.set_answer_upvote('$RP', true)")"
chk "comment on a normal post refused"  "not_found" "$(as $V2 authenticated "select public.set_answer_upvote('$NC', true)")"
chk "comment on a listing refused"      "not_found" "$(as $V2 authenticated "select public.set_answer_upvote('$LC', true)")"
chk "held (pending) answer refused"     "not_found" "$(as $V2 authenticated "select public.set_answer_upvote('$HC', true)")"
chk "unknown comment refused"           "not_found" "$(as $V2 authenticated "select public.set_answer_upvote('00000000-0000-4000-8000-000000000000', true)")"
chk "null comment refused"              "not_found" "$(as $V2 authenticated "select public.set_answer_upvote(null, true)")"
chk "no nickname refused"               "nickname_required" "$(as $NONICK authenticated "select public.set_answer_upvote('$A1', true)")"
SU "update public.user_flags set status='banned' where user_id='$BAN'; update public.user_flags set status='suspended', suspended_until=now()+interval '1 day' where user_id='$SUS'" >/dev/null
chk "banned refused"                    "banned" "$(as $BAN authenticated "select public.set_answer_upvote('$A1', true)")"
chk "suspended refused"                 "suspended" "$(as $SUS authenticated "select public.set_answer_upvote('$A1', true)")"
eq  "nothing stored by refused calls"   "0" "$(SU "select count(*) from public.comment_upvotes where user_id in ('$BAN','$SUS','$NONICK','$ANS')")"

echo "== blocking"
SU "insert into public.user_blocks (blocker_id, blocked_id) values ('$ANS','$V2')" >/dev/null
chk "author blocked the voter: refused" "not_found" "$(as $V2 authenticated "select public.set_answer_upvote('$A1', true)")"
SU "delete from public.user_blocks" >/dev/null
SU "insert into public.user_blocks (blocker_id, blocked_id) values ('$V2','$ANS')" >/dev/null
chk "voter blocked the author: refused" "not_found" "$(as $V2 authenticated "select public.set_answer_upvote('$A1', true)")"
SU "delete from public.user_blocks" >/dev/null
eq  "unblocked: works again"            "1" "$(as $V2 authenticated "select public.set_answer_upvote('$A1', true)")"

echo "== moderation and lifecycle"
SU "update public.comments set status='removed' where id='$A1'" >/dev/null
chk "removed answer refused"            "not_found" "$(as $V3 authenticated "select public.set_answer_upvote('$A1', true)")"
eq  "removed answer leaves the thread"  "1" "$(as $V3 authenticated "select count(*) from public.get_comments('post','$QA')")"
SU "update public.comments set status='published' where id='$A1'" >/dev/null
eq  "restored answer keeps its count"   "1" "$(as $V3 authenticated "select upvote_count from public.get_comments('post','$QA') where id='$A1'")"
SU "update public.posts set status='removed' where id='$QA'" >/dev/null
chk "post removed: upvote refused"      "not_found" "$(as $V3 authenticated "select public.set_answer_upvote('$A1', true)")"
SU "update public.posts set status='published' where id='$QA'" >/dev/null
eq  "counter equals real rows"          "t" "$(SU "select (c.upvote_count = (select count(*) from public.comment_upvotes u where u.comment_id=c.id))::text from public.comments c where c.id='$A1'" | cut -c1)"
as $M authenticated "select public.mod_review('comment','$HC','approve',null,null)" >/dev/null
eq  "an approved answer can then be upvoted" "1" "$(as $V2 authenticated "select public.set_answer_upvote('$HC', true)")"
SU "delete from public.comments where id='$HC'" >/dev/null
eq  "deleting the answer deletes its upvotes" "0" "$(SU "select count(*) from public.comment_upvotes where comment_id='$HC'")"

echo "== old builds and other features"
eq "old column list still selects"      "2" "$(as $V1 authenticated "select count(*) from (select id, post_id, listing_id, body, author_id, nickname, avatar_key, published_at, edited_at, reaction_count, my_reaction, top_reactions, parent_id, reply_to_id, reply_count from public.get_comments('post','$QA')) x")"
eq "removing an answer removed its reply (existing rule)" "0" "$(as $V1 authenticated "select count(*) from public.get_replies('$A1')")"
RP2=$(as $V1 authenticated "select id from public.create_reply('$A1','a new reply')")
eq "replies still load"                 "1" "$(as $V1 authenticated "select count(*) from public.get_replies('$A1')")"
eq "reply shows upvote_count 0"         "0" "$(as $V1 authenticated "select upvote_count from public.get_replies('$A1')")"
as $V1 authenticated "select public.set_comment_reaction('$A1','like')" >/dev/null
eq "comment reactions unaffected"       "1|1" "$(as $V2 authenticated "select reaction_count||'|'||upvote_count from public.get_comments('post','$QA') where id='$A1'")"
eq "reaction and upvote coexist"        "true" "$(as $V1 authenticated "select (my_reaction is not null and upvote_count >= 0)::text from public.get_comments('post','$QA') where id='$A1'")"

echo "== account deletion keeps others' numbers"
eq "before: A1 has V2's upvote"         "1" "$(SU "select upvote_count from public.comments where id='$A1'")"
as $V2 authenticated "select public.delete_my_account('nick_4')" >/dev/null 2>&1
eq "after V2 deletes the account: number unchanged" "1" "$(SU "select upvote_count from public.comments where id='$A1'")"

echo; echo "Result: $pass passed, $fail failed"; [[ $fail -eq 0 ]]
