#!/usr/bin/env bash
# Tests for 20261103130000_listing_updates.sql (applied in ONE transaction like the SQL editor,
# on top of rows that already exist, to prove the backfill).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_lu
OWN=20261103130000
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
S=$(uid 1); X=$(uid 2); V=$(uid 3); M=$(uid 4); G=$(uid 5)
for pair in "$S:seller_s" "$X:seller_x" "$V:viewer_v" "$M:mod_m" "$G:seller_g"; do
  SU "insert into auth.users (id,email,raw_user_meta_data) values ('${pair%%:*}','${pair##*:}@unm.test','{\"nickname\":\"${pair##*:}\"}')" >/dev/null
done
SU "update public.user_flags set role='moderator' where user_id='$M'" >/dev/null
SU "insert into public.keywords (term, match_type, applies_to) values ('seedtestword','contains','{post,listing}')" >/dev/null
TODAY="(now() at time zone 'Asia/Manila')::date"
mk() { as "$1" authenticated "select id from public.create_listing('sell','$2','desc $2',$3,'good')"; }
lf() { as "$1" authenticated "select id from public.create_listing('lost_found','$2','desc $2',null,null,'$3',$TODAY,'[]','$4')"; }
# Test-only time travel: the trigger makes first_published_at immutable, so switch it off here.
setfp() { SU "alter table public.listings disable trigger listings_first_published; update public.listings set first_published_at = $2 where id='$1'; alter table public.listings enable trigger listings_first_published" >/dev/null; }
OLD="now() - interval '30 seconds'"

echo "== before the migration: existing rows"
PRE_PUB=$(SU "insert into public.listings (kind,author_id,title,price,status,published_at) values ('sell','$S','Old published',100,'published', now() - interval '3 days') returning id")
PRE_PUB=$(echo "$PRE_PUB" | head -1)
PRE_PEND=$(SU "insert into public.listings (kind,author_id,title,price,status) values ('sell','$S','Old pending',100,'pending') returning id" | head -1)
PRE_REM=$(SU "insert into public.listings (kind,author_id,title,price,status,published_at) values ('sell','$S','Old removed',100,'removed', now() - interval '2 days') returning id" | head -1)
PRE_PA=$(SU "select published_at from public.listings where id='$PRE_PUB'")
H_BEFORE=$(SU "select md5(pg_get_viewdef('public.feed_listings'::regclass)||pg_get_viewdef('public.feed_posts'::regclass)||pg_get_functiondef('public.get_listings(public.listing_kind,timestamptz,uuid,int,text,boolean,text)'::regprocedure)||pg_get_functiondef('public.get_feed(timestamptz,uuid,int)'::regprocedure))")

echo "== apply the migration in one transaction"
OUT=$( (echo "begin;"; cat "$HERE/migrations/$OWN"_listing_updates.sql; echo "commit;") | psql -X -q -v ON_ERROR_STOP=1 -d $DB 2>&1 | grep -v NOTICE)
eq "migration applies cleanly" "" "$OUT"
eq "backfill: published row gets its published_at"   "$PRE_PA" "$(SU "select first_published_at from public.listings where id='$PRE_PUB'")"
eq "backfill: never-published row stays null"        "" "$(SU "select coalesce(first_published_at::text,'') from public.listings where id='$PRE_PEND'")"
chk "backfill: removed-but-once-published row too"   "$(SU "select published_at from public.listings where id='$PRE_REM'")" "$(SU "select first_published_at from public.listings where id='$PRE_REM'")"
eq "published_at untouched by the migration"         "$PRE_PA" "$(SU "select published_at from public.listings where id='$PRE_PUB'")"
H_AFTER=$(SU "select md5(pg_get_viewdef('public.feed_listings'::regclass)||pg_get_viewdef('public.feed_posts'::regclass)||pg_get_functiondef('public.get_listings(public.listing_kind,timestamptz,uuid,int,text,boolean,text)'::regprocedure)||pg_get_functiondef('public.get_feed(timestamptz,uuid,int)'::regprocedure))")
eq "feed_listings, feed_posts, get_listings, get_feed unchanged" "$H_BEFORE" "$H_AFTER"

echo "== first_published_at is set once and cannot be supplied or changed"
B1=$(mk $S "Blue bike" 3000)
eq "new published listing: equals published_at" "t" "$(SU "select first_published_at = published_at from public.listings where id='$B1'")"
SU "insert into public.listings (id,kind,author_id,title,price,status,first_published_at) values ('eeeeeeee-1111-4000-8000-000000000001','sell','$S','Forged',1,'published','1999-01-01')" >/dev/null
eq "a supplied value on insert is ignored" "t" "$(SU "select first_published_at > now() - interval '1 minute' from public.listings where id='eeeeeeee-1111-4000-8000-000000000001'")"
SU "insert into public.listings (id,kind,author_id,title,price,status,first_published_at) values ('eeeeeeee-1111-4000-8000-000000000002','sell','$S','Forged pending',1,'pending','1999-01-01')" >/dev/null
eq "a supplied value on a pending insert is ignored" "" "$(SU "select coalesce(first_published_at::text,'') from public.listings where id='eeeeeeee-1111-4000-8000-000000000002'")"
SU "update public.listings set first_published_at = '2000-01-01' where id='$B1'" >/dev/null
eq "an update cannot change it (even from the SQL editor)" "t" "$(SU "select first_published_at > now() - interval '1 minute' from public.listings where id='$B1'")"
SU "update public.listings set first_published_at = null where id='$B1'" >/dev/null
eq "an update cannot clear it" "t" "$(SU "select first_published_at is not null from public.listings where id='$B1'")"
chk "a signed-in member cannot write the table" "permission denied" "$(as $S authenticated "update public.listings set first_published_at = now() where id='$B1'")"
chk "a guest cannot write the table"            "permission denied" "$(as '' anon "update public.listings set first_published_at = now() where id='$B1'")"

echo "== held listing: first approval stamps it; later edits / re-approval / restore do not move it"
H1=$(as $S authenticated "select id from public.create_listing('sell','Held one','mentions seedtestword',200,'good')")
eq "created held: pending" "pending" "$(SU "select status from public.listings where id='$H1'")"
eq "created held: no first_published_at yet" "" "$(SU "select coalesce(first_published_at::text,'') from public.listings where id='$H1'")"
as $M authenticated "select public.mod_review('listing','$H1','approve')" >/dev/null
eq "first approval: first_published_at set" "t" "$(SU "select first_published_at is not null and first_published_at = published_at from public.listings where id='$H1'")"
FP1=$(SU "select first_published_at from public.listings where id='$H1'")
SU "select pg_sleep(1.2)" >/dev/null
as $S authenticated "select status from public.edit_own_listing('$H1','Held one edited','now seedtestword again',250,'good')" >/dev/null
eq "edit with a keyword: back to pending" "pending" "$(SU "select status from public.listings where id='$H1'")"
as $M authenticated "select public.mod_review('listing','$H1','approve')" >/dev/null
eq "re-approval DOES move published_at (the problem this column avoids)" "t" "$(SU "select published_at > first_published_at from public.listings where id='$H1'")"
eq "re-approval does NOT move first_published_at"                       "$FP1" "$(SU "select first_published_at from public.listings where id='$H1'")"
as $M authenticated "select public.mod_review('listing','$H1','remove','spam')" >/dev/null
as $M authenticated "select public.mod_review('listing','$H1','restore')" >/dev/null
eq "remove then restore keeps first_published_at" "$FP1" "$(SU "select first_published_at from public.listings where id='$H1'")"
as $S authenticated "select public.set_listing_closed('$H1', true)" >/dev/null
as $S authenticated "select public.set_listing_closed('$H1', false)" >/dev/null
eq "closing and reopening keeps it" "$FP1" "$(SU "select first_published_at from public.listings where id='$H1'")"

echo "== function: shape, grants, safety"
eq "security invoker"  "f" "$(SU "select prosecdef from pg_proc where proname='get_listing_updates'")"
eq "stable"            "s" "$(SU "select provolatile from pg_proc where proname='get_listing_updates'")"
eq "anon may execute (guests)"          "t" "$(SU "select has_function_privilege('anon','public.get_listing_updates(timestamptz,timestamptz)','execute')")"
eq "authenticated may execute"          "t" "$(SU "select has_function_privilege('authenticated','public.get_listing_updates(timestamptz,timestamptz)','execute')")"
eq "PUBLIC may not execute"             "f" "$(SU "select has_function_privilege('public','public.get_listing_updates(timestamptz,timestamptz)','execute')" 2>&1 | tail -1)"
eq "exactly two rows, sections named"   "lost_found,sell" "$(as $V authenticated "select string_agg(section, ',' order by section) from public.get_listing_updates(null, null)")"
eq "seed (null since): both counts are 0" "0,0" "$(as $V authenticated "select string_agg(new_count::text, ',') from public.get_listing_updates(null, null)")"
eq "guest can call it (real anon role)" "lost_found,sell" "$(as '' anon "select string_agg(section, ',' order by section) from public.get_listing_updates(null, null)")"
eq "mark is the same on both rows"      "1" "$(as $V authenticated "select count(distinct mark) from public.get_listing_updates(null, null)")"
eq "mark is about 5 seconds in the past" "t" "$(as $V authenticated "select min(mark) between now() - interval '6 seconds' and now() - interval '4 seconds' from public.get_listing_updates(null, null)")"
eq "a far-past since does not error"    "ok" "$(as $V authenticated "select case when count(*) = 2 then 'ok' end from public.get_listing_updates('1970-01-01', '1970-01-01')")"
eq "a future since gives 0"             "0,0" "$(as $V authenticated "select string_agg(new_count::text, ',') from public.get_listing_updates(now() + interval '1 day', now() + interval '1 day')")"

echo "== counting"
# clean slate for deterministic counts
SU "delete from public.listings" >/dev/null
SINCE="now() - interval '1 hour'"
cnt() { # who role sell_since lf_since section
  as "$1" "$2" "select new_count from public.get_listing_updates($3, $4) where section='$5'"; }
S1=$(mk $S "S one" 100); S2=$(mk $S "S two" 200); X1=$(mk $X "X one" 300)
for i in $S1 $S2 $X1; do setfp $i "$OLD"; done
eq "sell: viewer counts all 3 eligible"            "3" "$(cnt $V authenticated "$SINCE" null sell)"
G1=$(mk $G "Fresh" 5)
eq "a listing inside the 5-second margin is not counted yet" "3" "$(cnt $V authenticated "$SINCE" null sell)"
setfp $G1 "$OLD"
eq "...and is counted once it is older than the margin"      "4" "$(cnt $V authenticated "$SINCE" null sell)"
eq "own listings are excluded (seller S)"          "2" "$(cnt $S authenticated "$SINCE" null sell)"
eq "own listings are excluded (seller X)"          "3" "$(cnt $X authenticated "$SINCE" null sell)"
eq "guest counts everything eligible"              "4" "$(cnt '' anon "$SINCE" null sell)"
as $S authenticated "select public.set_listing_closed('$S2', true)" >/dev/null
eq "closed (sold) listings are excluded"           "3" "$(cnt $V authenticated "$SINCE" null sell)"
as $S authenticated "select public.set_listing_closed('$S2', false)" >/dev/null
P=$(as $S authenticated "select id from public.create_listing('sell','Held new','seedtestword here',50,'good')")
eq "a held (pending) listing is excluded"          "4" "$(cnt $V authenticated "$SINCE" null sell)"
as $M authenticated "select public.mod_review('listing','$P','approve')" >/dev/null
setfp $P "$OLD"
eq "first approval makes it count as new"          "5" "$(cnt $V authenticated "$SINCE" null sell)"
as $M authenticated "select public.mod_review('listing','$P','remove','spam')" >/dev/null
eq "a removed listing is excluded"                 "4" "$(cnt $V authenticated "$SINCE" null sell)"
as $M authenticated "select public.mod_review('listing','$P','restore')" >/dev/null
eq "a restored listing returns (its old first date)" "5" "$(cnt $V authenticated "$SINCE" null sell)"
as $S authenticated "select public.delete_own_listing('$P')" >/dev/null
eq "an author-deleted listing is excluded"         "4" "$(cnt $V authenticated "$SINCE" null sell)"
R=$(mk $X "To reject" 10); SU "update public.listings set status='rejected' where id='$R'" >/dev/null
eq "a rejected listing is excluded"                "4" "$(cnt $V authenticated "$SINCE" null sell)"

echo "== blocking"
SU "insert into public.user_blocks (blocker_id, blocked_id) values ('$V','$X')" >/dev/null
eq "listings of a member the viewer blocked are hidden" "3" "$(cnt $V authenticated "$SINCE" null sell)"
eq "another viewer is unaffected"                       "4" "$(cnt $M authenticated "$SINCE" null sell)"
SU "delete from public.user_blocks" >/dev/null
SU "insert into public.user_blocks (blocker_id, blocked_id, kind) values ('$V','$X','mute')" >/dev/null
eq "a mute hides them the same way as feed_listings does" "3" "$(cnt $V authenticated "$SINCE" null sell)"
SU "delete from public.user_blocks" >/dev/null
SU "insert into public.user_blocks (blocker_id, blocked_id) values ('$X','$V')" >/dev/null
eq "the author having blocked the viewer: same as the dedicated page (counted)" "4" "$(cnt $V authenticated "$SINCE" null sell)"
SU "delete from public.user_blocks" >/dev/null

echo "== Lost & Found combined, sections independent"
L1=$(lf $S "Lost keys" "Library" lost); L2=$(lf $X "Found umbrella" "Gate" found); L3=$(lf $X "Found wallet" "Cafe" found)
for i in $L1 $L2 $L3; do setfp $i "$OLD"; done
as $X authenticated "select public.set_listing_closed('$L3', true)" >/dev/null
eq "lost + found counted together, closed excluded" "2" "$(cnt $V authenticated null "$SINCE" lost_found)"
eq "sell is not affected by lost & found"           "4" "$(cnt $V authenticated "$SINCE" "$SINCE" sell)"
eq "a null since seeds only its own section (lost_found seeded)" "0" "$(cnt $V authenticated "$SINCE" null lost_found)"
eq "...while the other section still counts"                     "4" "$(cnt $V authenticated "$SINCE" null sell)"
eq "lost & found: own listing excluded"                          "1" "$(cnt $S authenticated null "$SINCE" lost_found)"

echo "== the explicit window: since < first_published_at <= mark"
# one transaction, so now() (and therefore the mark) is the same for every statement
OUT=$(PGOPTIONS="-c request.jwt.claim.sub=$V" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB <<SQL 2>&1 | grep -v '^SET$'
begin;
alter table public.listings disable trigger listings_first_published;
set local role authenticated;
select 'm=' || (select mark from public.get_listing_updates(null,null) limit 1);
reset role;
update public.listings set first_published_at = now() - interval '5 seconds' where id = '$S1';
update public.listings set first_published_at = now() - interval '5 seconds' + interval '1 microsecond' where id = '$S2';
update public.listings set first_published_at = now() - interval '5 seconds' - interval '1 microsecond' where id = '$X1';
update public.listings set first_published_at = now() - interval '2 hours' where id = '$G1';
set local role authenticated;
select 'a_in_window=' || new_count from public.get_listing_updates(now() - interval '1 hour', null) where section='sell';
select 'b_since_equals_mark=' || new_count from public.get_listing_updates(now() - interval '5 seconds', null) where section='sell';
select 'c_since_just_below_mark=' || new_count from public.get_listing_updates(now() - interval '5 seconds' - interval '1 microsecond', null) where section='sell';
rollback;
SQL
)
# S1 sits exactly on the mark (in the window), S2 is one microsecond after it (next batch),
# X1 one microsecond before it (in), G1 is two hours old (outside a one-hour window).
eq "window ends at the mark: at the mark and just before it are in; one microsecond after is not" "a_in_window=2" "$(echo "$OUT" | grep a_in_window)"
eq "using the mark as the next since excludes the listing at the mark (no double counting)" "b_since_equals_mark=0" "$(echo "$OUT" | grep b_since_equals_mark)"
eq "since is exclusive: since = mark-1us counts only the listing at the mark (the one at mark-1us equals since)" "c_since_just_below_mark=1" "$(echo "$OUT" | grep c_since_just_below_mark)"

echo "== an edited listing is not new again"
E=$(mk $G "Edit me" 400); setfp $E "$OLD"
MARK=$(as $V authenticated "select mark from public.get_listing_updates(null,null) limit 1")
BEFORE=$(cnt $V authenticated "$SINCE" null sell)
SU "select pg_sleep(1.2)" >/dev/null
as $G authenticated "select status from public.edit_own_listing('$E','Edit me v2','seedtestword please',450,'good')" >/dev/null
as $M authenticated "select public.mod_review('listing','$E','approve')" >/dev/null
eq "after edit + hold + approve: published_at moved forward" "t" "$(SU "select published_at > first_published_at from public.listings where id='$E'")"
eq "...and it is still counted exactly once in the older window" "$BEFORE" "$(cnt $V authenticated "$SINCE" null sell)"
eq "...but nothing is new since the mark taken before the edit" "0" "$(as $V authenticated "select new_count from public.get_listing_updates('$MARK', null) where section='sell'")"

echo "== parity with the dedicated pages (feed_listings)"
parity() { # who role
  local want got
  want=$(as "$1" "$2" "select count(*) from public.feed_listings f join public.listings l on l.id = f.id where l.kind='sell' and not f.is_closed and l.first_published_at > now() - interval '1 day' and l.first_published_at <= now() - interval '5 seconds' and f.author_id is distinct from (select auth.uid())")
  got=$(as "$1" "$2" "select new_count from public.get_listing_updates(now() - interval '1 day', null) where section='sell'")
  eq "parity for $3" "$want" "$got"
}
SU "insert into public.user_blocks (blocker_id, blocked_id) values ('$V','$G')" >/dev/null
parity $V authenticated "viewer who blocked one seller"
parity $S authenticated "a seller (own excluded)"
parity $X authenticated "another seller"
parity $M authenticated "a moderator (staff can read pending rows, the count must not)"
parity '' anon "a guest"
SU "delete from public.user_blocks" >/dev/null

echo "== old surfaces still work"
eq "get_listings still returns sell rows"  "t" "$(as $V authenticated "select count(*) > 0 from public.get_listings('sell')")"
as $S authenticated "select id from public.create_post('confession','a plain post')" >/dev/null
eq "get_feed still works for guests"       "t" "$(as '' anon "select count(*) > 0 from public.get_feed(null,null,5)")"
eq "create_listing signature unchanged"    "1" "$(SU "select count(*) from pg_proc where proname='create_listing' and pronamespace='public'::regnamespace")"

echo "== re-running the migration is refused (it is not idempotent by design)"
chk "second run fails" "already exists" "$(psql -X -q -d $DB -f "$HERE/migrations/${OWN}_listing_updates.sql" 2>&1)"

echo; echo "Result: $pass passed, $fail failed"
exit $((fail>0))
