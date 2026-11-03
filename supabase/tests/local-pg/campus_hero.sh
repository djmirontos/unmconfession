#!/usr/bin/env bash
# Tests for 20261030140000_campus_hero.sql (new file runs in ONE transaction like the SQL editor).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_ch
psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/tests/00_supabase_stub.sql" 2>/dev/null || { echo "stub failed"; exit 1; }
for f in $(ls "$HERE"/migrations/*.sql | sort | awk -v own=20261030140000 '{ n=$0; sub(/.*\//,"",n); if (substr(n,1,14) < own) print }'); do
  psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$f" 2>&1 | grep -v NOTICE
done
echo "== apply new migration in one transaction"
psql -X -q -1 -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/20261030140000_campus_hero.sql" 2>&1 | grep -v NOTICE
SU() { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }
uid() { printf 'ffffffff-0000-4000-8000-%012d' "$1"; }
n=0
for i in $(seq 1 30); do SU "insert into auth.users (id,email,raw_user_meta_data) values ('$(uid $i)','u$i@unm.test','{\"nickname\":\"person$i\"}')" >/dev/null; done
SU "update public.profiles set created_at = now() - interval '30 days'" >/dev/null
A1=$(uid 1); A2=$(uid 2); A3=$(uid 3); F=$(uid 4); C2=$(uid 5); NEW=$(uid 6); BAN=$(uid 7); BLK=$(uid 8); X=$(uid 9)
FF=$(uid 10); O1=$(uid 11); O2=$(uid 12); O3=$(uid 13); BLK2=$(uid 14)
SU "update public.profiles set created_at = now() where id='$NEW'; update public.user_flags set status='banned' where user_id='$BAN'" >/dev/null
mkl() { n=$((n+1)); SU "insert into public.listings (id,kind,author_id,title,location,event_date,lost_found_type,status,published_at,created_at) values (gen_random_uuid(),'lost_found','$2','item $n','library',current_date,'$1','published',now(),now()) returning id" | head -1; }
cm() { SU "insert into public.comments (listing_id,author_id,body,status,published_at,created_at) values ('$1','$2','c','published',now(),now())" >/dev/null; }
closed() { SU "select is_closed from public.listings where id='$1'"; }
st() { SU "select status from public.item_returns where listing_id='$1' order by created_at desc limit 1"; }

L1=$(mkl lost $A1); for u in $F $C2 $NEW $BAN $BLK; do cm $L1 $u; done
SU "insert into public.user_blocks (blocker_id,blocked_id) values ('$A1','$BLK'),('$BLK2','$A1')" >/dev/null; cm $L1 $BLK2

echo "== access"
chk "guest cannot start"        "permission denied" "$(as '' anon "select * from public.start_item_return('$L1','$F')")"
chk "guest cannot read state"   "permission denied" "$(as '' anon "select * from public.get_listing_return('$L1')")"
chk "guest cannot respond"      "permission denied" "$(as '' anon "select public.respond_item_return('$L1', true)")"
chk "auth cannot read table"    "permission denied" "$(as $A1 authenticated "select * from public.item_returns")"
chk "auth cannot insert table"  "permission denied" "$(as $A1 authenticated "insert into public.item_returns (listing_id,finder_id,owner_id,initiated_by) values ('$L1','$F','$A1','$A1')")"

echo "== candidates"
CAND=$(as $A1 authenticated "select user_id from public.get_return_candidates('$L1')")
chk "commenter listed"          "$F" "$CAND"
chk "second commenter listed"   "$C2" "$CAND"
chk "too-new account hidden"    "0" "$(echo "$CAND" | grep -c "$NEW")"
chk "banned hidden"             "0" "$(echo "$CAND" | grep -c "$BAN")"
chk "blocked by author hidden"  "0" "$(echo "$CAND" | grep -c "$BLK")"
chk "blocker of author hidden"  "0" "$(echo "$CAND" | grep -c "$BLK2")"
chk "non-author gets not_found" "not_found" "$(as $F authenticated "select * from public.get_return_candidates('$L1')")"

echo "== start validation"
chk "non-author forbidden"      "forbidden" "$(as $F authenticated "select * from public.start_item_return('$L1','$C2')")"
chk "unknown listing"           "not_found" "$(as $A1 authenticated "select * from public.start_item_return(gen_random_uuid(),'$F')")"
chk "cannot pick yourself"      "invalid_user" "$(as $A1 authenticated "select * from public.start_item_return('$L1','$A1')")"
chk "non-commenter rejected"    "not_commenter" "$(as $A1 authenticated "select * from public.start_item_return('$L1','$X')")"
chk "banned rejected"           "invalid_user" "$(as $A1 authenticated "select * from public.start_item_return('$L1','$BAN')")"
chk "blocked rejected"          "invalid_user" "$(as $A1 authenticated "select * from public.start_item_return('$L1','$BLK')")"
chk "blocked-by rejected"       "invalid_user" "$(as $A1 authenticated "select * from public.start_item_return('$L1','$BLK2')")"
chk "new account rejected"      "account_too_new" "$(as $A1 authenticated "select * from public.start_item_return('$L1','$NEW')")"
SELL=$(SU "insert into public.listings (id,kind,author_id,title,price,condition,status,published_at,created_at) values (gen_random_uuid(),'sell','$A1','bike',10,'good','published',now(),now()) returning id" | head -1); cm $SELL $F
chk "sell listing rejected"     "not_found" "$(as $A1 authenticated "select * from public.start_item_return('$SELL','$F')")"
chk "nothing created so far"    "0" "$(SU "select count(*) from public.item_returns")"

echo "== lost flow (owner = author, confirmed at once)"
R1=$(as $A1 authenticated "select status from public.start_item_return('$L1','$F')")
chk "confirmed immediately"     "confirmed" "$R1"
chk "listing closed"            "t" "$(closed $L1)"
chk "finder notified"           "return_confirmed" "$(SU "select type from public.notifications where user_id='$F' and target_id='$L1'")"
chk "finder sees role finder"   "finder|$A1" "$(as $F authenticated "select role||'|'||other_id from public.get_listing_return('$L1')")"
chk "owner sees role owner"     "owner|$F" "$(as $A1 authenticated "select role||'|'||other_id from public.get_listing_return('$L1')")"
chk "stranger sees nothing"     "0" "$(as $X authenticated "select count(*) from public.get_listing_return('$L1')")"
chk "second return rejected"    "already_returned" "$(as $A1 authenticated "select * from public.start_item_return('$L1','$C2')")"

echo "== found flow (owner confirms)"
LF=$(mkl found $FF); cm $LF $O1; cm $LF $O2
chk "request is pending"        "pending" "$(as $FF authenticated "select status from public.start_item_return('$LF','$O1')")"
RID=$(SU "select id from public.item_returns where listing_id='$LF'" | head -1)
chk "owner notified"            "return_request" "$(SU "select type from public.notifications where user_id='$O1' and target_id='$LF'")"
chk "listing still open"        "f" "$(closed $LF)"
chk "finder sees pending"       "pending|finder" "$(as $FF authenticated "select status||'|'||role from public.get_listing_return('$LF')")"
chk "owner sees pending"        "pending|owner" "$(as $O1 authenticated "select status||'|'||role from public.get_listing_return('$LF')")"
chk "another start blocked"     "already_returned" "$(as $FF authenticated "select * from public.start_item_return('$LF','$O2')")"
chk "finder cannot self-confirm" "not_found" "$(as $FF authenticated "select public.respond_item_return('$RID', true)")"
chk "third party cannot confirm" "not_found" "$(as $X authenticated "select public.respond_item_return('$RID', true)")"
chk "owner declines"            "declined" "$(as $O1 authenticated "select public.respond_item_return('$RID', false)" >/dev/null; st $LF)"
chk "declined not confirmed"    "0" "$(SU "select count(*) from public.item_returns where status='confirmed' and finder_id='$FF'")"
chk "no notification on decline" "0" "$(SU "select count(*) from public.notifications where user_id='$FF' and type='return_confirmed'")"
chk "can pick another claimant" "pending" "$(as $FF authenticated "select status from public.start_item_return('$LF','$O2')")"
RID2=$(SU "select id from public.item_returns where listing_id='$LF' and status='pending'" | head -1)
chk "author cancels"            "cancelled" "$(as $FF authenticated "select public.cancel_item_return('$RID2')" >/dev/null; st $LF)"
chk "owner cannot cancel"       "not_found" "$(as $O2 authenticated "select public.cancel_item_return('$RID2')")"
chk "start again after cancel"  "pending" "$(as $FF authenticated "select status from public.start_item_return('$LF','$O2')")"
RID3=$(SU "select id from public.item_returns where listing_id='$LF' and status='pending'" | head -1)
chk "owner accepts"             "confirmed" "$(as $O2 authenticated "select public.respond_item_return('$RID3', true)" >/dev/null; st $LF)"
chk "accept closes listing"     "t" "$(closed $LF)"
chk "finder notified on accept" "return_confirmed" "$(SU "select type from public.notifications where user_id='$FF' and target_id='$LF'")"
chk "cannot answer twice"       "not_found" "$(as $O2 authenticated "select public.respond_item_return('$RID3', false)")"
SU "update public.item_returns set created_at = now() - interval '15 days' where id='$RID3'" >/dev/null
SU "update public.item_returns set status='pending', resolved_at=null, created_at = now() - interval '15 days' where id='$RID3'" >/dev/null
chk "expired request hidden"    "0" "$(as $O2 authenticated "select count(*) from public.get_listing_return('$LF')")"
chk "expired cannot be answered" "expired" "$(as $O2 authenticated "select public.respond_item_return('$RID3', true)")"
chk "expired frees the listing" "pending" "$(as $FF authenticated "select status from public.start_item_return('$LF','$O1')")"

echo "== rate limit (3 starts per 24h)"
RL=$(uid 15); RC=$(uid 16)
for k in 1 2 3 4; do L=$(mkl lost $RL); cm $L $RC; LL[$k]=$L; done
for k in 1 2 3; do as $RL authenticated "select * from public.start_item_return('${LL[$k]}','$RC')" >/dev/null; done
chk "4th start rate limited"    "rate_limited" "$(as $RL authenticated "select * from public.start_item_return('${LL[4]}','$RC')")"

echo "== campus_hero (3 different owners)"
H=$(uid 20); HA1=$(uid 21); HA2=$(uid 22); HA3=$(uid 23)
LH1=$(mkl lost $HA1); LH2=$(mkl lost $HA2); LH2b=$(mkl lost $HA2); LH3=$(mkl lost $HA3)
for l in $LH1 $LH2 $LH2b $LH3; do cm $l $H; done
as $HA1 authenticated "select * from public.start_item_return('$LH1','$H')" >/dev/null
as $HA2 authenticated "select * from public.start_item_return('$LH2','$H')" >/dev/null
as $HA2 authenticated "select * from public.start_item_return('$LH2b','$H')" >/dev/null
SU "select public.award_badges()" >/dev/null
chk "3 returns but 2 owners: no badge" "0" "$(SU "select count(*) from public.user_badges where user_id='$H' and badge_code='campus_hero'")"
as $HA3 authenticated "select * from public.start_item_return('$LH3','$H')" >/dev/null
SU "select public.award_badges()" >/dev/null
chk "3 different owners: badge" "1" "$(SU "select count(*) from public.user_badges where user_id='$H' and badge_code='campus_hero'")"
chk "owners did not earn it"    "0" "$(SU "select count(*) from public.user_badges where user_id='$HA1' and badge_code='campus_hero'")"
chk "pending/declined never count" "0" "$(SU "select count(*) from public.user_badges where user_id='$FF' and badge_code='campus_hero'")"
chk "top badge is campus_hero"  "campus_hero" "$(as $X authenticated "select code from public.get_top_badges(array['$H']::uuid[])")"
chk "profile shows hero first"  "campus_hero" "$(as $X authenticated "select code from public.get_user_badges('$H') limit 1")"
SU "update public.user_flags set status='banned' where user_id='$H'" >/dev/null
chk "banned finder hidden"      "0" "$(as $X authenticated "select count(*) from public.get_user_badges('$H')")"
chk "idempotent"                "1" "$(SU "select public.award_badges()" >/dev/null; SU "select count(*) from public.user_badges where badge_code='campus_hero'")"

echo; echo "passed: $pass  failed: $fail"; [[ $fail -eq 0 ]]
