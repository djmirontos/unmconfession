-- Module 15: storage cleanup, database part.
--
-- storage_cleanup_queue already collects files that must be deleted (removed posts and
-- listings after retention, replaced profile pictures). Nothing deleted them from storage.
-- A nightly Edge Function will do it. It uses ONLY the functions below, and they can be
-- called only with the service role (never by guests or members).
--
--  * cleanup_peek_batch  : read-only look (used for the dry run)
--  * cleanup_claim_batch : picks a batch, counts an attempt on each row, skips locked rows
--  * cleanup_mark_done   : removes finished rows from the queue
--  * cleanup_queue_stats : counts for the log (no file names)
--
-- Safety: only buckets 'avatars' and 'post-images' and only exact path shapes are ever
-- returned. A row that does not look right is parked as dead (attempts = 99) and never
-- returned. A row that fails 5 times is parked too.

alter table public.storage_cleanup_queue
  add column if not exists attempts        int not null default 0,
  add column if not exists last_attempt_at timestamptz;

create index if not exists storage_cleanup_queue_pending_idx
  on public.storage_cleanup_queue (queued_at, id) where attempts < 5;

-- Exact shapes: avatars/<uuid>/c_<12 hex>.jpg and post-images/<uuid>/<file name>.
create function public._cleanup_path_ok(p_bucket text, p_path text) returns boolean
language sql immutable set search_path = '' as $$
  select case p_bucket
    when 'avatars' then p_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/c_[0-9a-f]{12}\.jpg$'
    when 'post-images' then p_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9._-]{1,120}$'
                            and p_path !~ '\.\.'
    else false
  end;
$$;

create function public.cleanup_peek_batch(p_limit int default 100)
returns table (id bigint, bucket text, path text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  return query
  select q.id, q.bucket, q.path
    from public.storage_cleanup_queue q
   where q.attempts < 5 and public._cleanup_path_ok(q.bucket, q.path)
   order by q.queued_at, q.id
   limit least(greatest(p_limit, 1), 200);
end $$;

create function public.cleanup_claim_batch(p_limit int default 100)
returns table (id bigint, bucket text, path text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  update public.storage_cleanup_queue q
     set attempts = 99, last_attempt_at = now()
   where q.attempts < 5 and not public._cleanup_path_ok(q.bucket, q.path);

  return query
  with picked as (
    select q.id
      from public.storage_cleanup_queue q
     where q.attempts < 5
     order by q.queued_at, q.id
     limit least(greatest(p_limit, 1), 200)
     for update skip locked
  )
  update public.storage_cleanup_queue q
     set attempts = q.attempts + 1, last_attempt_at = now()
    from picked
   where q.id = picked.id
  returning q.id, q.bucket, q.path;
end $$;

create function public.cleanup_mark_done(p_ids bigint[]) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  delete from public.storage_cleanup_queue where id = any (coalesce(p_ids, '{}'::bigint[]));
  get diagnostics n = row_count;
  return n;
end $$;

create function public.cleanup_queue_stats()
returns table (pending int, dead int)
language sql stable security definer set search_path = '' as $$
  select count(*) filter (where attempts < 5)::int, count(*) filter (where attempts >= 5)::int
    from public.storage_cleanup_queue;
$$;

revoke all on function public._cleanup_path_ok(text, text) from public, anon, authenticated;
revoke all on function public.cleanup_peek_batch(int) from public, anon, authenticated;
revoke all on function public.cleanup_claim_batch(int) from public, anon, authenticated;
revoke all on function public.cleanup_mark_done(bigint[]) from public, anon, authenticated;
revoke all on function public.cleanup_queue_stats() from public, anon, authenticated;
grant execute on function public.cleanup_peek_batch(int) to service_role;
grant execute on function public.cleanup_claim_batch(int) to service_role;
grant execute on function public.cleanup_mark_done(bigint[]) to service_role;
grant execute on function public.cleanup_queue_stats() to service_role;
