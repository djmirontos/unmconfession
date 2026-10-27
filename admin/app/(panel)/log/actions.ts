'use server';

import { unstable_rethrow } from 'next/navigation';

import { requireStaff } from '@/lib/auth';
import { fetchLog, type LogRow, type Page } from '@/lib/moderation/data';
import { logLoadSchema } from '@/lib/moderation/log';
import { type ActionResult, fail, ok } from '@/lib/result';

export async function loadMoreLog(input: unknown): Promise<ActionResult<Page<LogRow>>> {
  await requireStaff();
  const parsed = logLoadSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_input');
  try {
    return ok(await fetchLog(parsed.data.filters, parsed.data.cursor));
  } catch (e) {
    unstable_rethrow(e);
    return fail(e instanceof Error ? e.message : 'unknown');
  }
}
