#!/usr/bin/env bash
# Tests for 20261022110000_allow_three_images.sql (applies stub + all migrations to a fresh DB).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_img

psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/tests/00_supabase_stub.sql" 2>/dev/null || { echo "stub failed"; exit 1; }
for f in 20261021000000_v1_schema 20261022100000_feed_events 20261022110000_allow_three_images; do
  psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/migrations/$f.sql" 2>&1 | grep -v NOTICE
done

SU() { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }

U=cccccccc-0000-4000-8000-000000000001
V=cccccccc-0000-4000-8000-000000000002
SU "insert into auth.users (id, email, raw_user_meta_data) values
  ('$U','a@unm.test','{\"nickname\":\"user_a\"}'),('$V','b@unm.test','{\"nickname\":\"user_b\"}')" >/dev/null

img() { echo "{\"path\":\"$1/$2.jpg\",\"width\":1440,\"height\":900,\"blurhash\":\"LEHV6nWB2yk8pyo0adR*.7kCMdnj\"}"; }
I1=$(img $U a); I2=$(img $U b); I3=$(img $U c); I4=$(img $U d)

echo "== posts"
chk "1 image ok"                 "1" "$(as $U authenticated "select jsonb_array_length(images) from public.create_post('confession','p1',null,'[$I1]')")"
chk "2 images ok"                "2" "$(as $U authenticated "select jsonb_array_length(images) from public.create_post('confession','p2',null,'[$I1,$I2]')")"
chk "3 images ok"                "3" "$(as $U authenticated "select jsonb_array_length(images) from public.create_post('shoutout','p3','Prof X','[$I1,$I2,$I3]')")"
chk "4 images rejected"          "too_many_images" "$(as $U authenticated "select * from public.create_post('confession','p4',null,'[$I1,$I2,$I3,$I4]')")"
chk "3 images, one in foreign folder" "invalid_images" "$(as $U authenticated "select * from public.create_post('confession','p5',null,'[$I1,$I2,$(img $V z)]')")"
chk "poll still cannot carry images" "invalid_images" "$(as $U authenticated "select * from public.create_post('poll','Which one?',null,'[$I1]',array['a','b'],now()+interval '1 day')")"
chk "stored shape keeps blurhash" "LEHV6nWB2yk8pyo0adR*.7kCMdnj" "$(SU "select images->0->>'blurhash' from public.posts where body='p3'")"
chk "null blurhash accepted"     "1" "$(as $U authenticated "select jsonb_array_length(images) from public.create_post('confession','p6',null,'[{\"path\":\"$U/n.jpg\",\"width\":800,\"height\":600}]')")"

echo "== listings"
chk "listing with 3 images ok"   "3" "$(as $U authenticated "select jsonb_array_length(images) from public.create_listing('sell','Desk',null,500,'good',null,null,'[$I1,$I2,$I3]')")"
chk "listing with 4 images rejected" "too_many_images" "$(as $U authenticated "select * from public.create_listing('sell','Chair',null,200,'good',null,null,'[$I1,$I2,$I3,$I4]')")"

echo "== table constraints (bypassing the RPCs, as postgres)"
chk "posts check blocks 4 images" "posts_images_max3" "$(SU "insert into public.posts (kind, author_id, body, status, published_at, images) values ('confession','$U','x','published',now(),'[1,2,3,4]'::jsonb)")"
chk "listings check blocks 4 images" "listings_images_max3" "$(SU "insert into public.listings (kind, author_id, title, price, condition, status, published_at, images) values ('sell','$U','x',1,'good','published',now(),'[1,2,3,4]'::jsonb)")"
chk "old constraints are gone" "0" "$(SU "select count(*) from pg_constraint where conname in ('posts_images_max2','listings_images_max2')")"

echo "== privileges unchanged"
chk "members still cannot call _check_images" "permission denied" "$(as $U authenticated "select public._check_images('[]'::jsonb, '$U')")"

echo; echo "RESULT: $pass passed, $fail failed"; [[ $fail -eq 0 ]]
