# Storage cleanup runbook

## a) What it does

Removed posts and listings (after retention) and replaced profile pictures leave their files behind. The database queues those files in `storage_cleanup_queue`. The Edge Function `storage-cleanup` (`supabase/functions/storage-cleanup/`) runs once a night and deletes them from the `avatars` and `post-images` buckets, then removes the finished rows from the queue.

Guardrails:
- It only reaches the queue through four service-role-only functions: `cleanup_peek_batch`, `cleanup_claim_batch`, `cleanup_mark_done` and `cleanup_queue_stats` (migration `20261029190000_storage_cleanup_functions.sql`). Guests and members cannot call them.
- Only two buckets and two exact path shapes are touched: `avatars/<uuid>/c_<12 hex>.jpg` and `post-images/<uuid>/<file name>`, never `..`. The database checks this, and the function checks it again. A row that does not match is parked as dead and never deleted.
- A request without the right `x-cleanup-secret` header gets an empty 401. The secret is compared in constant time.
- It is a dry run unless `CLEANUP_DRY_RUN` is exactly `false`. A dry run deletes and marks nothing.
- Each run handles at most 5 batches (default 100 rows each, up to 200) or about 25 seconds of work.
- Logs and responses hold counts only: no file paths, user ids, queue ids, the secret or raw errors.
- It is the only code in the project that uses the service-role key. It reads the key from the environment variable the platform provides to every Edge Function; the key itself is never in the repo.

## b) Deploy

With the Supabase CLI, from the repo root:

```sh
supabase functions deploy storage-cleanup --no-verify-jwt --project-ref hjvmdgannytjkrhghixu
```

Or in the dashboard: Edge Functions → Deploy a new function, name it `storage-cleanup`, paste `index.ts` and `logic.ts` as two files, and turn **off** "Verify JWT".

The repo has no `supabase/config.toml`, so the `--no-verify-jwt` flag (or the dashboard switch) is what turns JWT checking off. The schedule calls the function without a user token; the secret header protects it.

## c) Secrets (dashboard only, never in the repo)

1. Edge Functions → Secrets:
   - `CLEANUP_SECRET`: a long random value (for example 48+ random characters from a password manager).
   - `CLEANUP_DRY_RUN`: `true`. Leave it like this for the first week.
   - `CLEANUP_BATCH` is optional (default 100, 1 to 200).
   - The project URL and the service-role key are provided by the platform automatically. Do not add them.
2. Database → Vault: add a secret named `cleanup_secret` with the **same** value as `CLEANUP_SECRET`, through the Vault UI.

## d) Schedule

Run this once in the SQL editor, **after** the function is deployed and both secrets are set:

```sql
create extension if not exists pg_net with schema extensions;
select cron.schedule('unm-storage-cleanup', '43 3 * * *', $$ select net.http_post(url := 'https://hjvmdgannytjkrhghixu.supabase.co/functions/v1/storage-cleanup', headers := jsonb_build_object('Content-Type', 'application/json', 'x-cleanup-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cleanup_secret')), body := '{}'::jsonb, timeout_milliseconds := 30000) $$);
```

03:43 UTC is 11:43 Manila time, after the 03:17 UTC purge job (`unm-purge-expired`), which queues the files of content past retention.

## e) Dry run week

Every night, open Edge Functions → storage-cleanup → Logs. Each run writes one line, for example:

```
storage-cleanup: mode=dry_run claimed=12 deleted=0 failed=0 skipped=0 pending=12 dead=0 would_delete_avatars=3 would_delete_post_images=9
```

In a dry run, `claimed` and the `would_delete_*` numbers are what the next live batch would take; nothing is deleted. A `401` in the invocation list means the header did not match (check that the Vault value equals `CLEANUP_SECRET`). A `not configured` line means `CLEANUP_SECRET` is missing.

To go live, set `CLEANUP_DRY_RUN` to `false` in Edge Functions → Secrets. The next run is live and its line says `mode=live`.

## f) How to stop it

```sql
select cron.unschedule('unm-storage-cleanup');
```

To pause deletion but keep the schedule, set `CLEANUP_DRY_RUN` back to `true`.

To rotate the secret, change it in **both** places with the same new value: Edge Functions → Secrets (`CLEANUP_SECRET`) and Database → Vault (`cleanup_secret`). Until both match, runs get a 401 and nothing is deleted.

## g) What the numbers mean

- `claimed`: rows taken from the queue in this run. Each claim counts one attempt on the row.
- `deleted`: rows whose files were removed (or were already gone) and that left the queue.
- `failed`: rows whose delete call returned an error. They stay in the queue and are tried again the next night.
- `skipped`: rows the function's own path check refused. They stay in the queue, and the database parks them as dead on the next claim.
- `pending`: rows still waiting (fewer than 5 attempts).
- `dead`: rows parked for good, either after 5 failed attempts or because their bucket or path did not look right (`attempts = 99`). They are never retried.

Dead rows need a manual look in the SQL editor:

```sql
select id, bucket, path, attempts, last_attempt_at, queued_at
  from public.storage_cleanup_queue
 where attempts >= 5
 order by queued_at;
```

Delete the file by hand in Storage if it is real, then delete the row. If it is not a real file, just delete the row.
