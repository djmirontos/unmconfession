import { messageFor } from '@/lib/errors';

/** What every Server Action returns. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail<T = never>(code: string): ActionResult<T> {
  return { ok: false, code, message: messageFor(code) };
}
