#!/usr/bin/env bash
# Tests for 20261025110000_top_reactions.sql (includes a backfill check on pre-existing reactions).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_tr

psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/tests/00_supabase_stub.sql" 2>/dev/null || { echo "stub failed"; exit 1; }
apply() { psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/$1.sql" 2>&1 | grep -v NOTICE; }
for f in 20261021000000_v1_schema 20261022100000_feed_events 20261022110000_allow_three_images 20261023100000_lost_found_manila_date 20261023110000_lost_found_type 20261023120000_edit_delete_own 20261023130000_comments_edit_delete 20261024100000_poll_vote_change 20261024110000_block_filtering 20261024120000_notifications 20261025100000_comment_reactions; do
  [[ $f == 20261024110000_block_filtering ]] && psql -X -q -d $DB -c "revoke all on public.user_blocks from anon"
  [[ $f == 20261025100000_comment_reactions ]] && psql -X -q -d $DB -c "alter default privileges in schema public revoke all on tables from anon, authenticated, service_role"
  apply $f
done

SU() { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }
eq()  { if [[ "$3" == "$2" ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }

U1=ffffffff-6666-4000-8000-000000000001; U2=ffffffff-6666-4000-8000-000000000002
U3=ffffffff-6666-4000-8000-000000000003; U4=ffffffff-6666-4000-8000-000000000004
U5=ffffffff-6666-4000-8000-000000000005; U6=ffffffff-6666-4000-8000-000000000006
for i in 1 2 3 4 5 6; do eval "u=\$U$i"; SU "insert into auth.users (id,email,raw_user_meta_data) values ('$u','u$i@unm.test','{\"nickname\":\"user_$i\"}')" >/dev/null; done

P0=$(as $U1 authenticated "select id from public.create_post('confession','Old post with reactions')")
C0=$(as $U1 authenticated "select id from public.create_comment('post','$P0','old comment')")
echo "== seed reactions BEFORE the migration (backfill check)"
as $U2 authenticated "select public.set_reaction('$P0','like')" >/dev/null
as $U3 authenticated "select public.set_reaction('$P0','like')" >/dev/null
as $U4 authenticated "select public.set_reaction('$P0','love')" >/dev/null
as $U2 authenticated "select public.set_comment_reaction('$C0','haha')" >/dev/null
as $U3 authenticated "select public.set_comment_reaction('$C0','haha')" >/dev/null
as $U4 authenticated "select public.set_comment_reaction('$C0','sad')" >/dev/null

apply 20261025110000_top_reactions
eq "backfill: post tally"               '{"like": 2, "love": 1}' "$(SU "select reaction_breakdown from public.posts where id='$P0'" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin), sort_keys=True))")"
eq "backfill: comment tally"            '{"haha": 2, "sad": 1}' "$(SU "select reaction_breakdown from public.comments where id='$C0'" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin), sort_keys=True))")"
eq "feed: top_reactions after backfill" "{like,love}" "$(as $U5 authenticated "select top_reactions from public.get_feed(null,null,50) where id='$P0'")"
eq "comments: top_reactions backfill"   "{haha,sad}" "$(as $U5 authenticated "select top_reactions from public.get_comments('post','$P0') where id='$C0'")"

echo "== live maintenance (posts)"
P=$(as $U1 authenticated "select id from public.create_post('confession','Fresh post')")
tr() { as $U5 authenticated "select top_reactions from public.get_feed(null,null,50) where id='$P'"; }
bd() { SU "select reaction_breakdown from public.posts where id='$P'" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin), sort_keys=True))"; }
eq "no reactions: empty array"          "{}" "$(tr)"
eq "no reactions: empty tally"          "{}" "$(bd)"
as $U2 authenticated "select public.set_reaction('$P','love')" >/dev/null
eq "one reaction"                       "{love}" "$(tr)"
as $U3 authenticated "select public.set_reaction('$P','like')" >/dev/null
as $U4 authenticated "select public.set_reaction('$P','like')" >/dev/null
eq "most used first"                    "{like,love}" "$(tr)"
as $U5 authenticated "select public.set_reaction('$P','wow')" >/dev/null
as $U6 authenticated "select public.set_reaction('$P','angry')" >/dev/null
eq "only the top 3 are returned"        "{like,love,wow}" "$(tr)"
eq "tally contents"                     '{"angry": 1, "like": 2, "love": 1, "wow": 1}' "$(bd)"
as $U4 authenticated "select public.set_reaction('$P','angry')" >/dev/null
eq "changing moves the tally"           '{"angry": 2, "like": 1, "love": 1, "wow": 1}' "$(bd)"
eq "after the change"                   "{angry,like,love}" "$(tr)"
as $U4 authenticated "select public.set_reaction('$P',null)" >/dev/null
eq "removing lowers it"                 '{"angry": 1, "like": 1, "love": 1, "wow": 1}' "$(bd)"
as $U3 authenticated "select public.set_reaction('$P',null)" >/dev/null
as $U2 authenticated "select public.set_reaction('$P',null)" >/dev/null
eq "a type at zero disappears"          '{"angry": 1, "wow": 1}' "$(bd)"
as $U5 authenticated "select public.set_reaction('$P','wow')" >/dev/null
eq "re-sending the same type is a no-op" '{"angry": 1, "wow": 1}' "$(bd)"
eq "reaction_count agrees with the tally" "2" "$(SU "select reaction_count from public.posts where id='$P'")"

echo "== live maintenance (comments)"
C=$(as $U1 authenticated "select id from public.create_comment('post','$P','fresh comment')")
ct() { as $U5 authenticated "select top_reactions from public.get_comments('post','$P') where id='$C'"; }
eq "comment: empty"                     "{}" "$(ct)"
as $U2 authenticated "select public.set_comment_reaction('$C','like')" >/dev/null
as $U3 authenticated "select public.set_comment_reaction('$C','like')" >/dev/null
as $U4 authenticated "select public.set_comment_reaction('$C','wow')" >/dev/null
eq "comment: most used first"           "{like,wow}" "$(ct)"
as $U3 authenticated "select public.set_comment_reaction('$C','wow')" >/dev/null
eq "comment: change moves the tally"    "{wow,like}" "$(ct)"
as $U2 authenticated "select public.set_comment_reaction('$C',null)" >/dev/null
as $U3 authenticated "select public.set_comment_reaction('$C',null)" >/dev/null
eq "comment: removal"                   "{wow}" "$(ct)"
eq "comment: tally and count agree"     '{"wow": 1}|1' "$(SU "select reaction_breakdown::text||'|'||reaction_count from public.comments where id='$C'")"

echo "== other views and guests"
eq "guests see top reactions (tie: wow before angry)" "{wow,angry}" "$(as '' anon "select top_reactions from public.get_feed(null,null,50) where id='$P'")"
eq "guests see comment top reactions"   "{wow}" "$(as '' anon "select top_reactions from public.get_comments('post','$P') where id='$C'")"
chk "get_active_polls still works"      "" "$(as $U5 authenticated "select count(*) from public.get_active_polls(10)" | grep -i error)"
chk "get_trending still works"          "" "$(as $U5 authenticated "select count(*) from public.get_trending(10)" | grep -i error)"
eq "feed_posts: new column is last"     "top_reactions" "$(SU "select column_name from information_schema.columns where table_name='feed_posts' order by ordinal_position desc limit 1")"
eq "thread_comments: new column is last" "top_reactions" "$(SU "select column_name from information_schema.columns where table_name='thread_comments' order by ordinal_position desc limit 1")"
chk "helper is not callable by members"  "permission denied" "$(as $U2 authenticated "select public._bump_reaction('{}'::jsonb,'like',1)")"

echo "== invariant: tally always sums to the count"
for i in $(seq 1 25); do
  u="U$(( (i % 6) + 1 ))"; uid="${!u}"
  types=(like love haha wow sad angry null)
  t="${types[$(( (i * 7) % 7 ))]}"; [[ "$t" == null ]] && tt="null" || tt="'$t'"
  as $uid authenticated "select public.set_reaction('$P',$tt)" >/dev/null
  as $uid authenticated "select public.set_comment_reaction('$C',$tt)" >/dev/null
done
eq "posts: sum(tally) = reaction_count"    "0" "$(SU "select count(*) from public.posts p where coalesce((select sum(value::int) from jsonb_each_text(p.reaction_breakdown)),0) <> p.reaction_count")"
eq "comments: sum(tally) = reaction_count" "0" "$(SU "select count(*) from public.comments c where coalesce((select sum(value::int) from jsonb_each_text(c.reaction_breakdown)),0) <> c.reaction_count")"
eq "tally matches the reaction rows (posts)" "0" "$(SU "select count(*) from public.posts p where p.reaction_breakdown <> coalesce((select jsonb_object_agg(type,n) from (select type, count(*) n from public.reactions r where r.post_id=p.id group by type) x),'{}'::jsonb)")"

echo; echo "RESULT: $pass passed, $fail failed"; [[ $fail -eq 0 ]]
