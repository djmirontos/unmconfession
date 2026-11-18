import 'server-only';

import { codeFromError } from '@/lib/errors';
import { muteSchema, warningInputError, warnSchema } from '@/lib/moderation/warnings';
import { type ActionResult, fail, ok } from '@/lib/result';
import { createClient } from '@/lib/supabase/server';

// Warn and mute, shared by the member page and the chat report page. The callers check staff
// access first (requireStaff) and decide what to revalidate: the member page refreshes the whole
// panel; the chat report page must not re-render itself (each render is an audit-logged open).

/** mod_warn_user: a listed reason and an optional note the member sees (never the sender). */
export async function warnMember(input: unknown): Promise<ActionResult> {
  const parsed = warnSchema.safeParse(input);
  if (!parsed.success) return fail(warningInputError(parsed.error.issues));
  const supabase = await createClient();
  const { error } = await supabase.rpc('mod_warn_user', {
    p_user: parsed.data.user,
    p_reason: parsed.data.reason,
    ...(parsed.data.note ? { p_note: parsed.data.note } : {}),
  });
  return error ? fail(codeFromError(error)) : ok(undefined);
}

/** mod_mute_user: the timed suspension (read-only) for 1 to 720 hours, with a member notice. */
export async function muteMember(input: unknown): Promise<ActionResult> {
  const parsed = muteSchema.safeParse(input);
  if (!parsed.success) return fail(warningInputError(parsed.error.issues));
  const supabase = await createClient();
  const { error } = await supabase.rpc('mod_mute_user', {
    p_user: parsed.data.user,
    p_hours: parsed.data.hours,
    p_reason: parsed.data.reason,
    ...(parsed.data.note ? { p_note: parsed.data.note } : {}),
  });
  return error ? fail(codeFromError(error)) : ok(undefined);
}
