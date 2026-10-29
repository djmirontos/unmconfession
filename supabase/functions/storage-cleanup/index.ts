// Nightly storage cleanup (Module 15). Called by a pg_cron + pg_net schedule with the
// x-cleanup-secret header; deletes the files listed in storage_cleanup_queue through the
// service-role-only cleanup_* functions. Dry run unless CLEANUP_DRY_RUN is exactly "false".
// Logs and responses carry counts only: never paths, ids, the secret or raw errors.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';

import {
  chunk,
  type CleanupRow,
  constantTimeEqual,
  countByBucket,
  groupByBucket,
  isAllowedPath,
  parseBatch,
  parseDryRun,
  REMOVE_CHUNK,
} from './logic.ts';

const MAX_BATCHES = 5;
const TIME_BUDGET_MS = 25_000;

type Summary = {
  mode: 'dry_run' | 'live';
  claimed: number;
  deleted: number;
  failed: number;
  skipped: number;
  pending: number | null;
  dead: number | null;
  /** Dry run only: what one live batch would delete, per bucket. */
  wouldDelete?: { avatars: number; postImages: number };
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** A short, safe description of an error: its class and Postgres code, never its message. */
function errorClass(error: unknown): string {
  if (error && typeof error === 'object') {
    const name = 'name' in error && typeof error.name === 'string' ? error.name : 'Error';
    const code = 'code' in error && typeof error.code === 'string' && /^[A-Z0-9]{5}$/.test(error.code) ? ` ${error.code}` : '';
    return `${name}${code}`;
  }
  return 'Error';
}

async function rpcRows(supabase: SupabaseClient, fn: 'cleanup_peek_batch' | 'cleanup_claim_batch', limit: number): Promise<CleanupRow[]> {
  const { data, error } = await supabase.rpc(fn, { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as CleanupRow[];
}

async function queueStats(supabase: SupabaseClient): Promise<{ pending: number | null; dead: number | null }> {
  const { data, error } = await supabase.rpc('cleanup_queue_stats');
  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row) return { pending: null, dead: null };
  return { pending: Number(row.pending), dead: Number(row.dead) };
}

async function dryRun(supabase: SupabaseClient, batch: number): Promise<Summary> {
  const counts = countByBucket(await rpcRows(supabase, 'cleanup_peek_batch', batch));
  return {
    mode: 'dry_run',
    claimed: counts.avatars + counts.postImages,
    deleted: 0,
    failed: 0,
    skipped: counts.skipped,
    ...(await queueStats(supabase)),
    wouldDelete: { avatars: counts.avatars, postImages: counts.postImages },
  };
}

async function live(supabase: SupabaseClient, batch: number): Promise<Summary> {
  const started = Date.now();
  const totals = { claimed: 0, deleted: 0, failed: 0, skipped: 0 };

  for (let round = 0; round < MAX_BATCHES && Date.now() - started < TIME_BUDGET_MS; round++) {
    const rows = await rpcRows(supabase, 'cleanup_claim_batch', batch);
    totals.claimed += rows.length;
    const done: number[] = [];

    for (const [bucket, group] of groupByBucket(rows)) {
      // Defense in depth: the database already refuses these; they stay in the queue for it to park.
      const valid = group.filter((r) => isAllowedPath(bucket, r.path));
      totals.skipped += group.length - valid.length;
      for (const part of chunk(valid, REMOVE_CHUNK)) {
        const { error } = await supabase.storage.from(bucket).remove(part.map((r) => r.path));
        // No error: every path in the chunk is gone (a file that was already missing is fine).
        if (error) totals.failed += part.length;
        else done.push(...part.map((r) => r.id));
      }
    }

    if (done.length > 0) {
      const { data, error } = await supabase.rpc('cleanup_mark_done', { p_ids: done });
      if (error) throw error;
      totals.deleted += typeof data === 'number' ? data : done.length;
    }
    if (rows.length < batch) break;
  }

  return { mode: 'live', ...totals, ...(await queueStats(supabase)) };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });

  const secret = Deno.env.get('CLEANUP_SECRET');
  if (!secret) {
    console.log('storage-cleanup: not configured');
    return json(500, { error: 'not_configured' });
  }
  if (!constantTimeEqual(req.headers.get('x-cleanup-secret') ?? '', secret)) return new Response(null, { status: 401 });

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    console.log('storage-cleanup: not configured');
    return json(500, { error: 'not_configured' });
  }
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const batch = parseBatch(Deno.env.get('CLEANUP_BATCH'));

  try {
    const summary = parseDryRun(Deno.env.get('CLEANUP_DRY_RUN')) ? await dryRun(supabase, batch) : await live(supabase, batch);
    console.log(
      `storage-cleanup: mode=${summary.mode} claimed=${summary.claimed} deleted=${summary.deleted} failed=${summary.failed} skipped=${summary.skipped} pending=${summary.pending} dead=${summary.dead}` +
        (summary.wouldDelete ? ` would_delete_avatars=${summary.wouldDelete.avatars} would_delete_post_images=${summary.wouldDelete.postImages}` : ''),
    );
    return json(200, summary);
  } catch (error) {
    console.log(`storage-cleanup: failed (${errorClass(error)})`);
    return json(500, { error: 'cleanup_failed' });
  }
});
