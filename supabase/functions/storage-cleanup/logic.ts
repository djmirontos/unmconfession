// Pure helpers for the storage-cleanup Edge Function. No Deno or network APIs, so
// logic.test.ts runs them with node:test (and Deno can run the same file).

export type CleanupRow = { id: number; bucket: string; path: string };

export const ALLOWED_BUCKETS = ['avatars', 'post-images'] as const;
export type AllowedBucket = (typeof ALLOWED_BUCKETS)[number];

export const BATCH_DEFAULT = 100;
export const BATCH_MAX = 200;
/** Storage remove() is called with at most this many paths. */
export const REMOVE_CHUNK = 100;

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
// Same shapes as public._cleanup_path_ok (migration 20261029190000).
const AVATAR_PATH = new RegExp(`^${UUID}/c_[0-9a-f]{12}\\.jpg$`);
const POST_IMAGE_PATH = new RegExp(`^${UUID}/[A-Za-z0-9._-]{1,120}$`);

export const isAllowedBucket = (bucket: string): bucket is AllowedBucket => (ALLOWED_BUCKETS as readonly string[]).includes(bucket);

/** Only avatars/<uuid>/c_<12 hex>.jpg and post-images/<uuid>/<file name>, never "..". */
export function isAllowedPath(bucket: string, path: string): boolean {
  if (typeof path !== 'string' || path.includes('..')) return false;
  if (bucket === 'avatars') return AVATAR_PATH.test(path);
  if (bucket === 'post-images') return POST_IMAGE_PATH.test(path);
  return false;
}

/** Rows per bucket, in their original order. */
export function groupByBucket<R extends { bucket: string }>(rows: readonly R[]): Map<string, R[]> {
  const groups = new Map<string, R[]>();
  for (const row of rows) {
    const list = groups.get(row.bucket);
    if (list) list.push(row);
    else groups.set(row.bucket, [row]);
  }
  return groups;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new RangeError('chunk size must be a positive integer');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Compares two secrets without stopping at the first difference. The length is not
 * hidden (the work is padded to the longer string, and a length mismatch still fails).
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  const length = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < length; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Real deletion only when the value is exactly "false"; anything else (unset included) is a dry run. */
export function parseDryRun(value: string | undefined | null): boolean {
  return value !== 'false';
}

/** CLEANUP_BATCH: a whole number clamped to 1..200, default 100. */
export function parseBatch(value: string | undefined | null): number {
  const n = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(n)) return BATCH_DEFAULT;
  return Math.min(BATCH_MAX, Math.max(1, n));
}

/** Rows counted per allowed bucket (dry run); anything else counts as skipped. */
export function countByBucket(rows: readonly CleanupRow[]): { avatars: number; postImages: number; skipped: number } {
  let avatars = 0;
  let postImages = 0;
  let skipped = 0;
  for (const row of rows) {
    if (!isAllowedPath(row.bucket, row.path)) skipped++;
    else if (row.bucket === 'avatars') avatars++;
    else postImages++;
  }
  return { avatars, postImages, skipped };
}
