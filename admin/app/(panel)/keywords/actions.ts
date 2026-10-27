'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireStaff } from '@/lib/auth';
import { keywordErrorCode } from '@/lib/errors';
import { keywordInsertRow, keywordUpdateRow } from '@/lib/keywords/query';
import { checkKeyword } from '@/lib/keywords/safety';
import {
  type KeywordInput,
  keywordIdSchema,
  keywordInputError,
  keywordInputSchema,
  keywordToggleSchema,
  keywordUpdateSchema,
  MATCH_TYPES,
} from '@/lib/keywords/schemas';
import { type ActionResult, fail, ok } from '@/lib/result';
import { createClient } from '@/lib/supabase/server';

// Moderators and admins manage keywords (RLS keywords_staff); every write goes through the
// session client, so the database checks the role, the constraints and the regex again.
// Keyword changes are not written to any audit log yet.

/** The self-protection check (a pattern that matches everything), refused here, not only in the form. */
function refused(input: Pick<KeywordInput, 'term' | 'match_type'>): string | null {
  return checkKeyword(input.term, input.match_type).errors[0] ?? null;
}

function refresh() {
  revalidatePath('/keywords');
}

export async function createKeyword(input: unknown): Promise<ActionResult> {
  const staff = await requireStaff();
  const parsed = keywordInputSchema.safeParse(input);
  if (!parsed.success) return fail(keywordInputError(parsed.error.issues));
  const blocked = refused(parsed.data);
  if (blocked) return fail(blocked);
  const supabase = await createClient();
  // created_by is the user validated by requireStaff() (getUser()), never a form value.
  const { error } = await supabase.from('keywords').insert(keywordInsertRow(parsed.data, staff.userId));
  if (error) return fail(keywordErrorCode(error));
  refresh();
  return ok(undefined);
}

export async function updateKeyword(input: unknown): Promise<ActionResult> {
  await requireStaff();
  const parsed = keywordUpdateSchema.safeParse(input);
  if (!parsed.success) return fail(keywordInputError(parsed.error.issues));
  const blocked = refused(parsed.data);
  if (blocked) return fail(blocked);
  const supabase = await createClient();
  const { data, error } = await supabase.from('keywords').update(keywordUpdateRow(parsed.data)).eq('id', parsed.data.id).select('id');
  if (error) return fail(keywordErrorCode(error));
  if (!data?.length) return fail('not_found');
  refresh();
  return ok(undefined);
}

export async function setKeywordActive(input: unknown): Promise<ActionResult> {
  await requireStaff();
  const parsed = keywordToggleSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_input');
  const supabase = await createClient();
  if (parsed.data.active) {
    // Turning a pattern on is the moment it starts holding posts: check it again.
    const { data: row, error: readError } = await supabase.from('keywords').select('term, match_type').eq('id', parsed.data.id).maybeSingle();
    if (readError) return fail(keywordErrorCode(readError));
    if (!row) return fail('not_found');
    const matchType = z.enum(MATCH_TYPES).safeParse(row.match_type);
    if (!matchType.success) return fail('keyword_invalid');
    const blocked = refused({ term: row.term, match_type: matchType.data });
    if (blocked) return fail(blocked);
  }
  const { data, error } = await supabase.from('keywords').update({ active: parsed.data.active }).eq('id', parsed.data.id).select('id');
  if (error) return fail(keywordErrorCode(error));
  if (!data?.length) return fail('not_found');
  refresh();
  return ok(undefined);
}

export async function deleteKeyword(input: unknown): Promise<ActionResult> {
  await requireStaff();
  const parsed = keywordIdSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_input');
  const supabase = await createClient();
  const { data, error } = await supabase.from('keywords').delete().eq('id', parsed.data).select('id');
  if (error) return fail(keywordErrorCode(error));
  if (!data?.length) return fail('not_found');
  refresh();
  return ok(undefined);
}
