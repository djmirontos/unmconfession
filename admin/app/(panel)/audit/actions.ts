'use server';

import { unstable_rethrow } from 'next/navigation';

import { requireAdmin } from '@/lib/auth';
import { type AuditRow, fetchAudit, type Page } from '@/lib/moderation/data';
import { auditLoadSchema } from '@/lib/moderation/log';
import { type ActionResult, fail, ok } from '@/lib/result';

// Admins only: moderators are redirected to /403 here, and admin_get_audit refuses them too.
export async function loadMoreAudit(input: unknown): Promise<ActionResult<Page<AuditRow>>> {
  await requireAdmin();
  const parsed = auditLoadSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_input');
  try {
    return ok(await fetchAudit(parsed.data.cursor));
  } catch (e) {
    unstable_rethrow(e);
    return fail(e instanceof Error ? e.message : 'unknown');
  }
}
