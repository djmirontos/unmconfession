// Pure force-update logic (no React Native imports, so tests/versionGate.test.mjs runs it in Node).
import { z } from 'zod';

export type AppRequirement = {
  minAppVersion: string;
  updateUrl: string | null;
  updateMessage: string | null;
};

/** What the fetch produced: a row, an error (server, network, malformed), or nothing in time. */
export type RequirementFetch = { kind: 'ok'; requirement: AppRequirement } | { kind: 'error' } | { kind: 'timeout' };

type Version = [number, number, number];

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

/** "1.2.3" -> [1, 2, 3]; anything else (missing part, sign, suffix, spaces) -> null. */
export function parseVersion(value: string): Version | null {
  const match = VERSION.exec(value);
  if (!match) return null;
  const parts = [Number(match[1]), Number(match[2]), Number(match[3])] as const;
  if (!parts.every(Number.isSafeInteger)) return null;
  return [parts[0], parts[1], parts[2]];
}

/** True only when both parse and installed < minimum. Unparseable input fails open (false). */
export function isUpdateRequired(installed: string, minimum: string): boolean {
  const a = parseVersion(installed);
  const b = parseVersion(minimum);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

// The generated types call the nullable columns non-null; the DB allows null.
const rowSchema = z.object({
  min_app_version: z.string(),
  update_url: z.string().nullable(),
  update_message: z.string().nullable(),
});

const cachedSchema = z.object({
  minAppVersion: z.string(),
  updateUrl: z.string().nullable(),
  updateMessage: z.string().nullable(),
});

/** The RPC returns a one-row table. Null when the shape is not what we expect. */
export function parseRequirementRows(data: unknown): AppRequirement | null {
  const rows = z.array(rowSchema).min(1).safeParse(data);
  if (!rows.success) return null;
  const row = rows.data[0];
  if (!row) return null;
  return { minAppVersion: row.min_app_version, updateUrl: row.update_url, updateMessage: row.update_message };
}

/** The AsyncStorage copy; null when missing or corrupt. */
export function parseCachedRequirement(raw: string | null): AppRequirement | null {
  if (!raw) return null;
  try {
    const parsed = cachedSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const HTTPS = 'https://';

/** The update link, only if it is an https:// URL with something after the scheme; else null. */
export function safeUpdateUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  return trimmed.startsWith(HTTPS) && trimmed.length > HTTPS.length && !/\s/.test(trimmed) ? trimmed : null;
}

/** Fresh value on success; otherwise the last known one; with neither, null (do not block). */
export function resolveRequirement(fetched: RequirementFetch | null, cached: AppRequirement | null): AppRequirement | null {
  if (fetched?.kind === 'ok') return fetched.requirement;
  return cached;
}
