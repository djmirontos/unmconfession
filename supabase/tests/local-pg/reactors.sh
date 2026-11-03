#!/usr/bin/env bash
# Tests for 20261029170000_reactors.sql (stub + all migrations; the new file runs in ONE transaction like the SQL editor).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_rc
psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/tests/00_supabase_stub.sql" 2>/dev/null || { echo "stub failed"; exit 1; }
for f in $(ls "$HERE"/migrations/*.sql | sort | grep -v 20261029170000); do
  psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$f" 2>&1 | grep -v NOTICE
done
# mimic Supabase default privileges: new tables are open to the API roles
psql -X -q -d $DB -c "grant all on public.comment_reactions to anon, authenticated" >/dev/null
echo "== apply new migration in one transaction"
psql -X -q -1 -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/20261029170000_reactors.sql" 2>&1 | grep -v NOTICE
SU() { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }

A=cccccccc-0000-4000-8000-000000000001
B=cccccccc-0000-4000-8000-000000000002
C=cccccccc-0000-4000-8000-000000000003
D=cccccccc-0000-4000-8000-000000000004
E=cccccccc-0000-4000-8000-000000000005
SU "insert into auth.users (id, email, raw_user_meta_data) values
  ('$A','a@unm.test','{\"nickname\":\"user_a\"}'),('$B','b@unm.test','{\"nickname\":\"user_b\"}'),
  ('$C','c@unm.test','{\"nickname\":\"user_c\"}'),('$D','d@unm.test','{\"nickname\":\"user_d\"}'),
  ('$E','e@unm.test','{\"nickname\":\"user_e\"}');" >/dev/null
P=$(as $A authenticated "select id from public.create_post('confession','react to me')")
CM=$(as $A authenticated "select id from public.create_comment('post','$P','nice comment')")

echo "== grants hardening"
chk "anon cannot truncate comment_reactions"   "f" "$(SU "select has_table_privilege('anon','public.comment_reactions','TRUNCATE')::text" | cut -c1)"
chk "authenticated cannot insert directly"     "f" "$(SU "select has_table_privilege('authenticated','public.comment_reactions','INSERT')::text" | cut -c1)"
chk "authenticated can still select"           "t" "$(SU "select has_table_privilege('authenticated','public.comment_reactions','SELECT')::text" | cut -c1)"
chk "guest cannot call the list"               "permission denied" "$(as '' anon "select * from public.get_post_reactors('$P')")"
chk "guest cannot call the counts"             "permission denied" "$(as '' anon "select * from public.get_post_reactor_counts('$P')")"

echo "== post reactors"
as $B authenticated "select public.set_reaction('$P','like')" >/dev/null; sleep 0.05
as $C authenticated "select public.set_reaction('$P','love')" >/dev/null; sleep 0.05
as $D authenticated "select public.set_reaction('$P','haha')" >/dev/null; sleep 0.05
as $E authenticated "select public.set_reaction('$P','like')" >/dev/null
chk "newest first, with nickname and type"     "user_e|like"$'\n'"user_d|haha"$'\n'"user_c|love"$'\n'"user_b|like" "$(as $A authenticated "select nickname, type from public.get_post_reactors('$P')")"
chk "type filter"                              "user_e|like"$'\n'"user_b|like" "$(as $A authenticated "select nickname, type from public.get_post_reactors('$P','like')")"
chk "counts per type"                          "like|2"$'\n'"love|1"$'\n'"haha|1" "$(as $A authenticated "select type, total from public.get_post_reactor_counts('$P')")"
chk "keyset page 1 (limit 2)"                  "user_e"$'\n'"user_d" "$(as $A authenticated "select nickname from public.get_post_reactors('$P',null,null,null,2)")"
TS=$(SU "select updated_at from public.reactions where post_id='$P' and user_id='$D'"); 
chk "keyset page 2"                            "user_c"$'\n'"user_b" "$(as $A authenticated "select nickname from public.get_post_reactors('$P',null,'$TS','$D',2)")"
chk "my own reaction is listed"                "user_b|like" "$(as $B authenticated "select nickname, type from public.get_post_reactors('$P') where user_id='$B'")"
chk "changing a reaction moves it to the top"  "user_b|haha" "$(as $B authenticated "select public.set_reaction('$P','haha')" >/dev/null; as $A authenticated "select nickname, type from public.get_post_reactors('$P',null,null,null,1)")"

echo "== hidden people"
as $A authenticated "insert into public.user_blocks (blocker_id, blocked_id) values ('$A','$C')" >/dev/null
chk "blocked member hidden from list"          "0" "$(as $A authenticated "select count(*) from public.get_post_reactors('$P') where user_id='$C'")"
chk "blocked member hidden from counts"        "0" "$(as $A authenticated "select count(*) from public.get_post_reactor_counts('$P') where type='love'")"
chk "other members still see them"             "1" "$(as $B authenticated "select count(*) from public.get_post_reactors('$P') where user_id='$C'")"
SU "update public.user_flags set status='banned', deleted_at=now() where user_id='$D'; select set_config('app.account_change','on',false); update public.profiles set nickname=null where id='$D'" >/dev/null
chk "deleted account hidden"                   "0" "$(as $A authenticated "select count(*) from public.get_post_reactors('$P') where user_id='$D'")"
SU "update public.user_flags set status='banned' where user_id='$E'" >/dev/null
chk "banned member hidden"                     "0" "$(as $A authenticated "select count(*) from public.get_post_reactors('$P') where user_id='$E'")"
chk "invalid limit is clamped"                 "1" "$(as $A authenticated "select count(*) from public.get_post_reactors('$P',null,null,null,0)")"
echo "== comment reactors"
as $B authenticated "select public.set_comment_reaction('$CM','wow')" >/dev/null; sleep 0.05
as $C authenticated "select public.set_comment_reaction('$CM','sad')" >/dev/null
chk "comment list"                             "user_c|sad"$'\n'"user_b|wow" "$(as $B authenticated "select nickname, type from public.get_comment_reactors('$CM')")"
chk "comment counts"                           "wow|1"$'\n'"sad|1" "$(as $B authenticated "select type, total from public.get_comment_reactor_counts('$CM')")"
chk "guest cannot call comment list"           "permission denied" "$(as '' anon "select * from public.get_comment_reactors('$CM')")"

echo "== removed post"
SU "update public.posts set status='removed' where id='$P'" >/dev/null
chk "removed post lists nobody"                "0" "$(as $B authenticated "select count(*) from public.get_post_reactors('$P')")"
chk "unknown post lists nobody"                "0" "$(as $B authenticated "select count(*) from public.get_post_reactors('cccccccc-0000-4000-8000-0000000000ff')")"

echo; echo "passed: $pass  failed: $fail"; [[ $fail -eq 0 ]]
