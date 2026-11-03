#!/usr/bin/env bash
# Tests for 20261030160000_trusted_seller.sql (new file runs in ONE transaction like the SQL editor).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_ts
psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/tests/00_supabase_stub.sql" 2>/dev/null || { echo "stub failed"; exit 1; }
for f in $(ls "$HERE"/migrations/*.sql | sort | awk -v own=20261030160000 '{ n=$0; sub(/.*\//,"",n); if (substr(n,1,14) < own) print }'); do
  psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$f" 2>&1 | grep -v NOTICE
done
echo "== apply new migration in one transaction"
psql -X -q -1 -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/20261030160000_trusted_seller.sql" 2>&1 | grep -v NOTICE
SU() { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }
uid() { printf 'abababab-0000-4000-8000-%012d' "$1"; }
n=0
for i in $(seq 1 30); do SU "insert into auth.users (id,email,raw_user_meta_data) values ('$(uid $i)','s$i@unm.test','{\"nickname\":\"seller$i\"}')" >/dev/null; done
SU "update public.profiles set created_at = now() - interval '30 days'" >/dev/null
S=$(uid 1); B1=$(uid 2); B2=$(uid 3); NEW=$(uid 4); BAN=$(uid 5); BLK=$(uid 6); BLK2=$(uid 7); X=$(uid 8)
SU "update public.profiles set created_at = now() where id='$NEW'; update public.user_flags set status='banned' where user_id='$BAN'" >/dev/null
mks() { n=$((n+1)); SU "insert into public.listings (id,kind,author_id,title,price,condition,status,published_at,created_at) values (gen_random_uuid(),'sell','$2','item $n',$1,'good','published',now(),now()) returning id" | head -1; }
cm() { SU "insert into public.comments (listing_id,author_id,body,status,published_at,created_at) values ('$1','$2','c','published',now(),now())" >/dev/null; }
closed() { SU "select is_closed from public.listings where id='$1'"; }
st() { SU "select status from public.item_sales where listing_id='$1' order by created_at desc limit 1"; }

L1=$(mks 100 $S); for u in $B1 $B2 $NEW $BAN $BLK $BLK2; do cm $L1 $u; done
SU "insert into public.user_blocks (blocker_id,blocked_id) values ('$S','$BLK'),('$BLK2','$S')" >/dev/null

echo "== access"
chk "guest cannot start"        "permission denied" "$(as '' anon "select * from public.start_item_sale('$L1','$B1')")"
chk "guest cannot read state"   "permission denied" "$(as '' anon "select * from public.get_listing_sale('$L1')")"
chk "guest cannot respond"      "permission denied" "$(as '' anon "select public.respond_item_sale('$L1', true)")"
chk "auth cannot read table"    "permission denied" "$(as $S authenticated "select * from public.item_sales")"
chk "auth cannot insert table"  "permission denied" "$(as $S authenticated "insert into public.item_sales (listing_id,seller_id,buyer_id) values ('$L1','$S','$B1')")"

echo "== candidates"
CAND=$(as $S authenticated "select user_id from public.get_sale_candidates('$L1')")
chk "commenter listed"          "$B1" "$CAND"
chk "second commenter listed"   "$B2" "$CAND"
chk "too-new hidden"            "0" "$(echo "$CAND" | grep -c "$NEW")"
chk "banned hidden"             "0" "$(echo "$CAND" | grep -c "$BAN")"
chk "blocked hidden"            "0" "$(echo "$CAND" | grep -c "$BLK")"
chk "blocker hidden"            "0" "$(echo "$CAND" | grep -c "$BLK2")"
chk "non-seller not_found"      "not_found" "$(as $B1 authenticated "select * from public.get_sale_candidates('$L1')")"

echo "== start validation"
chk "non-seller forbidden"      "forbidden" "$(as $B1 authenticated "select * from public.start_item_sale('$L1','$B2')")"
chk "unknown listing"           "not_found" "$(as $S authenticated "select * from public.start_item_sale(gen_random_uuid(),'$B1')")"
chk "cannot pick yourself"      "invalid_user" "$(as $S authenticated "select * from public.start_item_sale('$L1','$S')")"
chk "non-commenter rejected"    "not_commenter" "$(as $S authenticated "select * from public.start_item_sale('$L1','$X')")"
chk "banned rejected"           "invalid_user" "$(as $S authenticated "select * from public.start_item_sale('$L1','$BAN')")"
chk "blocked rejected"          "invalid_user" "$(as $S authenticated "select * from public.start_item_sale('$L1','$BLK')")"
chk "blocker rejected"          "invalid_user" "$(as $S authenticated "select * from public.start_item_sale('$L1','$BLK2')")"
chk "new account rejected"      "account_too_new" "$(as $S authenticated "select * from public.start_item_sale('$L1','$NEW')")"
LFREE=$(mks 0 $S); cm $LFREE $B1
chk "free item rejected"        "free_item" "$(as $S authenticated "select * from public.start_item_sale('$LFREE','$B1')")"
LL=$(SU "insert into public.listings (id,kind,author_id,title,location,event_date,lost_found_type,status,published_at,created_at) values (gen_random_uuid(),'lost_found','$S','lost',  'lib',current_date,'lost','published',now(),now()) returning id" | head -1); cm $LL $B1
chk "lost&found rejected"       "not_found" "$(as $S authenticated "select * from public.start_item_sale('$LL','$B1')")"
chk "nothing created so far"    "0" "$(SU "select count(*) from public.item_sales")"

echo "== sale flow (buyer confirms)"
chk "request is pending"        "pending" "$(as $S authenticated "select status from public.start_item_sale('$L1','$B1')")"
SID=$(SU "select id from public.item_sales where listing_id='$L1'" | head -1)
chk "buyer notified"            "sale_request" "$(SU "select type from public.notifications where user_id='$B1' and target_id='$L1'")"
chk "listing still open"        "f" "$(closed $L1)"
chk "seller sees pending"       "pending|seller" "$(as $S authenticated "select status||'|'||role from public.get_listing_sale('$L1')")"
chk "buyer sees pending"        "pending|buyer" "$(as $B1 authenticated "select status||'|'||role from public.get_listing_sale('$L1')")"
chk "stranger sees nothing"     "0" "$(as $X authenticated "select count(*) from public.get_listing_sale('$L1')")"
chk "second start blocked"      "already_sold" "$(as $S authenticated "select * from public.start_item_sale('$L1','$B2')")"
chk "seller cannot self-confirm" "not_found" "$(as $S authenticated "select public.respond_item_sale('$SID', true)")"
chk "third party cannot confirm" "not_found" "$(as $X authenticated "select public.respond_item_sale('$SID', true)")"
chk "buyer cannot cancel"       "not_found" "$(as $B1 authenticated "select public.cancel_item_sale('$SID')")"
chk "seller cancels"            "cancelled" "$(as $S authenticated "select public.cancel_item_sale('$SID')" >/dev/null; st $L1)"
chk "pick again after cancel"   "pending" "$(as $S authenticated "select status from public.start_item_sale('$L1','$B1')")"
SID=$(SU "select id from public.item_sales where listing_id='$L1' and status='pending'" | head -1)
chk "buyer declines"            "declined" "$(as $B1 authenticated "select public.respond_item_sale('$SID', false)" >/dev/null; st $L1)"
chk "declined not counted"      "0" "$(SU "select count(*) from public.item_sales where status='confirmed'")"
chk "pick again after decline"  "pending" "$(as $S authenticated "select status from public.start_item_sale('$L1','$B2')")"
SID=$(SU "select id from public.item_sales where listing_id='$L1' and status='pending'" | head -1)
chk "buyer accepts"             "confirmed" "$(as $B2 authenticated "select public.respond_item_sale('$SID', true)" >/dev/null; st $L1)"
chk "accept closes listing"     "t" "$(closed $L1)"
chk "seller notified"           "sale_confirmed" "$(SU "select type from public.notifications where user_id='$S' and target_id='$L1'")"
chk "cannot answer twice"       "not_found" "$(as $B2 authenticated "select public.respond_item_sale('$SID', false)")"
SU "update public.item_sales set created_at = created_at - interval '2 days' where seller_id='$S'" >/dev/null   # keep the daily start limit out of the way
chk "no new sale on same listing" "already_sold" "$(as $S authenticated "select * from public.start_item_sale('$L1','$B1')")"
LE=$(mks 50 $S); cm $LE $B1
as $S authenticated "select * from public.start_item_sale('$LE','$B1')" >/dev/null
EID=$(SU "select id from public.item_sales where listing_id='$LE'" | head -1)
SU "update public.item_sales set created_at = now() - interval '15 days' where id='$EID'" >/dev/null
chk "expired hidden"            "0" "$(as $B1 authenticated "select count(*) from public.get_listing_sale('$LE')")"
chk "expired cannot be answered" "expired" "$(as $B1 authenticated "select public.respond_item_sale('$EID', true)")"
chk "expired frees listing"     "pending" "$(as $S authenticated "select status from public.start_item_sale('$LE','$B1')")"
LM=$(mks 80 $S); cm $LM $B1; SU "update public.listings set is_closed=true where id='$LM'" >/dev/null
chk "closed-by-hand can still start" "pending" "$(as $S authenticated "select status from public.start_item_sale('$LM','$B1')")"

echo "== rate limit (3 per 24h)"
RS=$(uid 15); RB=$(uid 16)
for k in 1 2 3 4; do L=$(mks 20 $RS); cm $L $RB; LLS[$k]=$L; done
for k in 1 2 3; do as $RS authenticated "select * from public.start_item_sale('${LLS[$k]}','$RB')" >/dev/null; done
chk "4th start rate limited"    "rate_limited" "$(as $RS authenticated "select * from public.start_item_sale('${LLS[4]}','$RB')")"

echo "== trusted_seller (5 different buyers)"
T=$(uid 20)
for k in 21 22 23 24 25; do TB[$k]=$(uid $k); done
sell() { # buyer listing-price
  L=$(mks 30 $T); cm $L $1
  as $T authenticated "select * from public.start_item_sale('$L','$1')" >/dev/null
  SD=$(SU "select id from public.item_sales where listing_id='$L'" | head -1)
  as $1 authenticated "select public.respond_item_sale('$SD', true)" >/dev/null
  SU "update public.item_sales set created_at = now() - interval '2 days' where id='$SD'" >/dev/null   # keep the daily start limit out of the way
}
sell ${TB[21]}; sell ${TB[22]}; sell ${TB[22]}; sell ${TB[23]}; sell ${TB[24]}
SU "select public.award_badges()" >/dev/null
chk "5 sales, 4 buyers: no badge" "0" "$(SU "select count(*) from public.user_badges where user_id='$T' and badge_code='trusted_seller'")"
sell ${TB[25]}
SU "select public.award_badges()" >/dev/null
chk "5 different buyers: badge"   "1" "$(SU "select count(*) from public.user_badges where user_id='$T' and badge_code='trusted_seller'")"
chk "buyers do not get it"        "0" "$(SU "select count(*) from public.user_badges where user_id='${TB[21]}' and badge_code='trusted_seller'")"
chk "declined/pending never count" "0" "$(SU "select count(*) from public.user_badges where user_id='$S' and badge_code='trusted_seller'")"
chk "idempotent"                  "1" "$(SU "select public.award_badges()" >/dev/null; SU "select count(*) from public.user_badges where badge_code='trusted_seller'")"

echo "== get_top_badges returns up to 3, in order"
SU "insert into public.user_badges (user_id,badge_code) values ('$T','first_circle'),('$T','campus_voice'),('$T','campus_regular'),('$T','nocturnal'),('$T','campus_hero') on conflict do nothing" >/dev/null
chk "3 icons max, hero then seller then circle" "campus_hero,trusted_seller,first_circle" "$(as $X authenticated "select string_agg(code, ',' order by ordinality) from public.get_top_badges(array['$T']::uuid[]) with ordinality")"
chk "exactly 3 rows"              "3" "$(as $X authenticated "select count(*) from public.get_top_badges(array['$T']::uuid[])")"
SU "update public.user_flags set role='moderator' where user_id='$T'" >/dev/null
chk "staff label takes first slot" "moderator,campus_hero,trusted_seller" "$(as $X authenticated "select string_agg(code, ',' order by ordinality) from public.get_top_badges(array['$T']::uuid[]) with ordinality")"
chk "nocturnal never shown"       "0" "$(as $X authenticated "select count(*) from public.get_top_badges(array['$T']::uuid[]) where code='nocturnal'")"
chk "blocked author hidden"       "0" "$(SU "insert into public.user_blocks (blocker_id,blocked_id) values ('$X','$T')" >/dev/null; as $X authenticated "select count(*) from public.get_top_badges(array['$T']::uuid[])")"
chk "guest denied"                "permission denied" "$(as '' anon "select * from public.get_top_badges(array['$T']::uuid[])")"
SU "update public.user_flags set status='banned' where user_id='$T'" >/dev/null
chk "banned hidden for others"    "0" "$(as $B1 authenticated "select count(*) from public.get_top_badges(array['$T']::uuid[])")"
chk "profile order: hero first"   "campus_hero" "$(as $B1 authenticated "select count(*) from public.get_user_badges('$S')" >/dev/null; SU "update public.user_flags set status='active' where user_id='$T'" >/dev/null; as $B1 authenticated "select code from public.get_user_badges('$T') limit 1")"

echo; echo "passed: $pass  failed: $fail"; [[ $fail -eq 0 ]]
