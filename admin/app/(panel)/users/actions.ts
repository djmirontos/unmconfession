'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { requireAdmin, requireStaff } from '@/lib/auth';
import { codeFromError } from '@/lib/errors';
import { formatExact } from '@/lib/format';
import { fetchUser, fetchUsersPage, type Page, type UserRow } from '@/lib/moderation/data';
import { refreshPanel } from '@/lib/moderation/mutations';
import {
  banSchema,
  deleteAccountSchema,
  emailSchema,
  keysetCursorSchema,
  nicknameSchema,
  restoreUserSchema,
  roleSchema,
  suspendSchema,
  userFiltersValueSchema,
  userIdSchema,
} from '@/lib/moderation/schemas';
import { isFuture } from '@/lib/moderation/suspension';
import { type ActionResult, fail, ok } from '@/lib/result';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';

// Moderators and admins: status changes (the database limits moderators to regular users).
// Admins only: role, nickname, identity, email lookup, account deletion (requireAdmin() here
// and again in the database).

const loadSchema = z.object({ filters: userFiltersValueSchema, cursor: keysetCursorSchema });

export async function loadMoreUsers(input: unknown): Promise<ActionResult<Page<UserRow>>> {
  await requireStaff();
  const parsed = loadSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_input');
  try {
    return ok(await fetchUsersPage(parsed.data.filters, parsed.data.cursor));
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'unknown');
  }
}

async function setStatus(
  user: string,
  status: Database['public']['Enums']['account_status'],
  reason?: string,
  until?: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('mod_set_user_status', {
    p_user: user,
    p_status: status,
    ...(until ? { p_until: until } : {}),
    ...(reason ? { p_reason: reason } : {}),
  });
  if (error) return fail(codeFromError(error));
  refreshPanel();
  return ok(undefined);
}

const reasonError = (issues: z.core.$ZodIssue[]) => (issues.some((i) => i.path[0] === 'reason') ? 'reason_required' : 'invalid_input');

export async function suspendUser(input: unknown): Promise<ActionResult> {
  await requireStaff();
  const parsed = suspendSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues.some((i) => i.path[0] === 'until') ? 'invalid_until' : reasonError(parsed.error.issues));
  }
  if (!isFuture(parsed.data.until)) return fail('invalid_until');
  return setStatus(parsed.data.user, 'suspended', parsed.data.reason, parsed.data.until);
}

export async function banUser(input: unknown): Promise<ActionResult> {
  await requireStaff();
  const parsed = banSchema.safeParse(input);
  if (!parsed.success) return fail(reasonError(parsed.error.issues));
  return setStatus(parsed.data.user, 'banned', parsed.data.reason);
}

export async function restoreUser(input: unknown): Promise<ActionResult> {
  await requireStaff();
  const parsed = restoreUserSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_input');
  return setStatus(parsed.data.user, 'active', parsed.data.reason || undefined);
}

export async function setUserRole(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_input');
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_set_role', { p_user: parsed.data.user, p_role: parsed.data.role });
  if (error) return fail(codeFromError(error));
  refreshPanel();
  return ok(undefined);
}

export async function renameUser(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = nicknameSchema.safeParse(input);
  if (!parsed.success) return fail('nickname_invalid');
  // admin_set_nickname does not check deleted accounts itself.
  const target = await fetchUser(parsed.data.user).catch(() => null);
  if (!target) return fail('not_found');
  if (target.deleted) return fail('account_deleted');
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_set_nickname', { p_user: parsed.data.user, p_nickname: parsed.data.nickname });
  if (error) return fail(codeFromError(error));
  refreshPanel();
  return ok(undefined);
}

export type Identity = { email: string; confirmed: boolean; lastSignIn: string; joined: string; providers: string[] };

/** Email and sign-in details. Audited by the database on every call; never cached or logged here. */
export async function revealIdentity(input: unknown): Promise<ActionResult<Identity>> {
  await requireAdmin();
  const parsed = userIdSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_input');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_get_user_identity', { p_user: parsed.data });
  if (error) {
    const code = codeFromError(error);
    return fail(code === 'not_found' ? 'identity_unavailable' : code);
  }
  const row = data?.[0];
  if (!row) return fail('identity_unavailable');
  return ok({
    email: row.email,
    confirmed: row.email_confirmed,
    lastSignIn: row.last_sign_in_at ? formatExact(row.last_sign_in_at) : 'Never',
    joined: formatExact(row.joined_at),
    providers: row.providers ?? [],
  });
}

/** Typed-nickname confirmation is checked here against the stored nickname, not just in the browser. */
export async function deleteAccount(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = deleteAccountSchema.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return fail(field === 'reason' ? (parsed.error.issues[0]?.code === 'too_big' ? 'reason_too_long' : 'reason_required') : 'invalid_input');
  }
  const target = await fetchUser(parsed.data.user).catch(() => null);
  if (!target || target.deleted) return fail('not_found');
  if (target.nickname === null || parsed.data.confirm !== target.nickname) return fail('confirm_mismatch');

  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_delete_account', { p_user: parsed.data.user, p_reason: parsed.data.reason });
  if (error) return fail(codeFromError(error));
  refreshPanel();
  return ok(undefined);
}

/** Admin lookup by email (audited; the address itself is never stored). Success goes to the user page. */
export async function findUserByEmail(_prev: ActionResult | null, formData: FormData): Promise<ActionResult | null> {
  await requireAdmin();
  const parsed = emailSchema.safeParse(formData.get('email'));
  if (!parsed.success) return fail('invalid_email');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_find_user_by_email', { p_email: parsed.data });
  if (error) return fail(codeFromError(error));
  const found = data?.[0];
  if (!found) return fail('no_user_with_email');
  redirect(`/users/${found.user_id}`);
}
