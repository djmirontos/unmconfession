#!/usr/bin/env bash
# Tests for 20261029100000_custom_avatars.sql (stub + all migrations on a fresh DB).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST="${PGHOST:-/var/lib/postgresql/unm_test}" PGPORT="${PGPORT:-54329}" PGUSER=postgres
DB=unm_av
psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$HERE/tests/00_supabase_stub.sql" 2>/dev/null || { echo "stub failed"; exit 1; }
for f in $(ls "$HERE"/migrations/*.sql | sort); do
  psql -X -q -v ON_ERROR_STOP=1 -d $DB -f "$f" 2>&1 | grep -v NOTICE
done
SU() { PGOPTIONS="-c request.jwt.claim.sub=" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "$1" 2>&1; }
as() { PGOPTIONS="-c request.jwt.claim.sub=$1" psql -X -q -t -A -v ON_ERROR_STOP=1 -d $DB -c "set role $2" -c "$3" 2>&1; }
pass=0; fail=0
chk() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "      want: $2"; echo "      got:  $3"; fi; }

# the stub has no storage grants; real Supabase gives these to the API roles
SU "grant select, insert, update, delete on storage.objects to authenticated, anon, service_role" >/dev/null

A=dddddddd-0000-4000-8000-000000000001
B=dddddddd-0000-4000-8000-000000000002
M=dddddddd-0000-4000-8000-000000000003
X=dddddddd-0000-4000-8000-000000000004
D=dddddddd-0000-4000-8000-000000000005
SU "insert into auth.users (id, email, raw_user_meta_data) values
  ('$A','a@unm.test','{\"nickname\":\"user_a\"}'),('$B','b@unm.test','{\"nickname\":\"user_b\"}'),
  ('$M','m@unm.test','{\"nickname\":\"mod_m\"}'),('$X','x@unm.test','{\"nickname\":\"user_x\"}'),
  ('$D','d@unm.test','{\"nickname\":\"user_d\"}');
  update public.user_flags set role='moderator' where user_id='$M';" >/dev/null

n() { as "$1" authenticated "with x as ($2 returning 1) select count(*) from x" | tail -1; }
up() { as $1 authenticated "insert into storage.objects (bucket_id, name) values ('avatars', '$2')"; }
k1=c_0123456789ab; k2=c_ba9876543210; k3=c_00000000000c

echo "== bucket"
chk "bucket exists, public, jpeg only, 512 KB" "avatars|true|524288|{image/jpeg}" "$(SU "select id||'|'||public||'|'||file_size_limit||'|'||allowed_mime_types::text from storage.buckets where id='avatars'")"

echo "== upload policy"
chk "upload own folder ok"          "1" "$(up $A "$A/$k1.jpg" >/dev/null; SU "select count(*) from storage.objects where name='$A/$k1.jpg'")"
chk "upload into someone else's folder" "row-level security" "$(up $A "$B/$k1.jpg")"
chk "bad file name"                 "row-level security" "$(up $A "$A/photo.jpg")"
chk "png name refused"              "row-level security" "$(up $A "$A/$k2.png")"
chk "nested path refused"           "row-level security" "$(up $A "$A/x/$k2.jpg")"
chk "guest cannot upload"           "row-level security" "$(PGOPTIONS='-c request.jwt.claim.sub=' psql -X -q -t -A -d $DB -c 'set role anon' -c "insert into storage.objects (bucket_id,name) values ('avatars','$A/$k3.jpg')" 2>&1)"
chk "other bucket unaffected: no policy => refused" "row-level security" "$(as $A authenticated "insert into storage.objects (bucket_id, name) values ('somewhere', '$A/$k2.jpg')")"

echo "== max 5 files"
for h in 1 2 3 4; do up $A "$A/c_00000000000$h.jpg" >/dev/null; done
chk "5th file ok (already 5 incl. first)" "row-level security" "$(up $A "$A/c_0000000000aa.jpg")"
as $A authenticated "delete from storage.objects where name = '$A/c_000000000001.jpg'" >/dev/null
chk "after deleting one, upload ok" "1" "$(up $A "$A/c_0000000000aa.jpg" >/dev/null; SU "select count(*) from storage.objects where name='$A/c_0000000000aa.jpg'")"

echo "== account state"
SU "update public.user_flags set status='banned' where user_id='$B'" >/dev/null
chk "banned cannot upload"          "row-level security" "$(up $B "$B/$k1.jpg")"
SU "update public.user_flags set status='suspended', suspended_until = now() + interval '1 day' where user_id='$B'" >/dev/null
chk "suspended cannot upload"       "row-level security" "$(up $B "$B/$k1.jpg")"
SU "update public.user_flags set status='suspended', suspended_until = now() - interval '1 day' where user_id='$B'" >/dev/null
chk "expired suspension can upload" "1" "$(up $B "$B/$k1.jpg" >/dev/null; SU "select count(*) from storage.objects where name='$B/$k1.jpg'")"
SU "update public.user_flags set status='active', suspended_until=null where user_id='$B'" >/dev/null

echo "== profile key"
chk "default key"                   "avatar_01" "$(SU "select avatar_key from public.profiles where id='$A'")"
chk "custom key for a file that does not exist" "avatar_not_uploaded" "$(as $A authenticated "update public.profiles set avatar_key='c_ffffffffffff' where id='$A'")"
chk "custom key pointing at someone else's file (same key, own folder empty)" "avatar_not_uploaded" "$(as $X authenticated "update public.profiles set avatar_key='$k1' where id='$X'")"
chk "set custom key"                "1" "$(n $A "update public.profiles set avatar_key='$k1' where id='$A'")"
chk "key stored"                    "$k1" "$(SU "select avatar_key from public.profiles where id='$A'")"
chk "no cleanup queued yet"         "0" "$(SU "select count(*) from public.storage_cleanup_queue where bucket='avatars'")"
# the app deletes old files before uploading a new one (limit is 5 files)
for f in c_000000000002 c_000000000003 c_000000000004 c_0000000000aa; do as $A authenticated "delete from storage.objects where bucket_id='avatars' and name='$A/$f.jpg'" >/dev/null; done
up $A "$A/$k2.jpg" >/dev/null 2>&1
chk "switch to a new custom key"    "1" "$(n $A "update public.profiles set avatar_key='$k2' where id='$A'")"
chk "old file queued for cleanup"   "$A/$k1.jpg" "$(SU "select path from public.storage_cleanup_queue where bucket='avatars'")"
chk "back to preset queues the custom file" "1" "$(n $A "update public.profiles set avatar_key='avatar_03' where id='$A'")"
chk "two files queued"              "2" "$(SU "select count(*) from public.storage_cleanup_queue where bucket='avatars'")"
chk "same key again does nothing"   "1" "$(n $A "update public.profiles set avatar_key='avatar_03' where id='$A'")"
chk "no extra queue row"            "2" "$(SU "select count(*) from public.storage_cleanup_queue where bucket='avatars'")"
chk "banned cannot switch to custom" "banned" "$(SU "update public.user_flags set status='banned' where user_id='$B'" >/dev/null; as $B authenticated "update public.profiles set avatar_key='$k1' where id='$B'")"
SU "update public.user_flags set status='active' where user_id='$B'" >/dev/null
chk "cannot edit another member's avatar" "0" "$(n $A "update public.profiles set avatar_key='avatar_05' where id='$B'")"
chk "format check still applies"    "violates check constraint" "$(as $A authenticated "update public.profiles set avatar_key='Bad Key!' where id='$A'")"

echo "== delete own / staff"
chk "delete own file"               "1" "$(n $A "delete from storage.objects where bucket_id='avatars' and name='$A/$k2.jpg'")"
chk "cannot delete another's file"  "0" "$(n $A "delete from storage.objects where bucket_id='avatars' and name='$B/$k1.jpg'")"
chk "staff can delete any"          "1" "$(n $M "delete from storage.objects where bucket_id='avatars' and name='$B/$k1.jpg'")"

echo "== mod_remove_avatar"
up $B "$B/$k3.jpg" >/dev/null 2>&1
as $B authenticated "update public.profiles set avatar_key='$k3' where id='$B'" >/dev/null
chk "member cannot call it"         "forbidden" "$(as $A authenticated "select public.mod_remove_avatar('$B','x')")"
chk "guest cannot call it"          "permission denied" "$(PGOPTIONS='-c request.jwt.claim.sub=' psql -X -q -t -A -d $DB -c 'set role anon' -c "select public.mod_remove_avatar('$B','x')" 2>&1)"
chk "staff removes custom avatar"   "" "$(as $M authenticated "select public.mod_remove_avatar('$B','inappropriate')")"
chk "reset to default"              "avatar_01" "$(SU "select avatar_key from public.profiles where id='$B'")"
chk "file queued"                   "$B/$k3.jpg" "$(SU "select path from public.storage_cleanup_queue where bucket='avatars' and path like '$B/%'")"
chk "action logged"                 "remove_avatar|user|inappropriate" "$(SU "select action||'|'||target_type||'|'||reason_code from public.moderation_actions where target_id='$B' and action='remove_avatar'")"
chk "no custom avatar left"         "no_custom_avatar" "$(as $M authenticated "select public.mod_remove_avatar('$B','x')")"
chk "unknown user"                  "not_found" "$(as $M authenticated "select public.mod_remove_avatar('dddddddd-0000-4000-8000-0000000000ff','x')")"

echo "== account deletion"
up $X "$X/$k1.jpg" >/dev/null 2>&1
as $X authenticated "update public.profiles set avatar_key='$k1' where id='$X'" >/dev/null
as $X authenticated "select public.delete_my_account('user_x')"
chk "deleted account falls back to default avatar" "avatar_01" "$(SU "select avatar_key from public.profiles where id='$X'")"
chk "deleted account's file queued" "$X/$k1.jpg" "$(SU "select path from public.storage_cleanup_queue where bucket='avatars' and path like '$X/%'")"
chk "deleted account cannot set custom avatar again" "ERROR" "$(as $X authenticated "update public.profiles set avatar_key='$k1' where id='$X'")"

echo "== moderator cannot target staff avatars"
SU "update public.profiles set avatar_key='avatar_01' where id='$M'" >/dev/null
chk "admin target: moderator refused" "forbidden" "$(SU "update public.user_flags set role='admin' where user_id='$D'" >/dev/null; as $M authenticated "select public.mod_remove_avatar('$D','x')")"

echo; echo "passed $pass, failed $fail"
