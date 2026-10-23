import { redact, redactString } from '@/lib/redact';

// Fields Supabase errors (Auth, Postgrest, Storage), fetch errors and plain objects carry.
const ERROR_FIELDS = ['status', 'statusCode', 'code', 'details', 'hint', 'error'] as const;
const STACK_LINES = 4;

function describe(error: unknown, depth = 0): Record<string, unknown> {
  if (error === null || typeof error !== 'object') return { message: String(error) };
  const e = error as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (error instanceof Error) {
    out.name = error.name;
    out.message = error.message;
  } else {
    if (typeof e.name === 'string') out.name = e.name;
    if (typeof e.message === 'string') out.message = e.message;
  }
  for (const field of ERROR_FIELDS) if (e[field] !== undefined) out[field] = e[field];
  // StorageUnknownError keeps the underlying fetch error here.
  if (e.originalError !== undefined && depth < 2) out.originalError = describe(e.originalError, depth + 1);
  if (e.cause !== undefined && depth < 2) out.cause = describe(e.cause, depth + 1);
  if (typeof e.stack === 'string') out.stack = e.stack.split('\n').slice(0, STACK_LINES).join('\n');
  return out;
}

/**
 * Dev-only error report in the Metro terminal. Secrets and emails are redacted.
 * Users never see this; they get the friendly text from lib/errors.ts.
 */
export function logError(scope: string, error: unknown, context?: Record<string, unknown>): void {
  if (!__DEV__) return;
  const report = redact({ ...describe(error), ...(context ? { context } : {}) });
  console.warn(`[${redactString(scope)}] ERROR`, JSON.stringify(report, null, 2));
}

export function logInfo(scope: string, message: string, context?: Record<string, unknown>): void {
  if (!__DEV__) return;
  const suffix = context ? ` ${JSON.stringify(redact(context))}` : '';
  console.log(`[${redactString(scope)}] ${redactString(message)}${suffix}`);
}
