'use server';

import { revalidatePath } from 'next/cache';

import { announcementInsertRow, announcementUpdateRow } from '@/lib/announcements/query';
import { announcementIdSchema, announcementUpdateSchema, checkAnnouncement } from '@/lib/announcements/schemas';
import { requireStaff } from '@/lib/auth';
import { announcementErrorCode } from '@/lib/errors';
import { type ActionResult, fail, ok } from '@/lib/result';
import { createClient } from '@/lib/supabase/server';

// Moderators and admins manage announcements (RLS announcements_staff_write); every write goes
// through the session client, so the database checks the role and the constraints again.

function refresh() {
  revalidatePath('/announcements');
}

export async function createAnnouncement(input: unknown): Promise<ActionResult> {
  const staff = await requireStaff();
  const checked = checkAnnouncement(input, Date.now());
  if (!checked.ok) return fail(checked.code);
  const supabase = await createClient();
  // created_by is the user validated by requireStaff() (getUser()), never a form value.
  const { error } = await supabase.from('announcements').insert(announcementInsertRow(checked.values, staff.userId));
  if (error) return fail(announcementErrorCode(error));
  refresh();
  return ok(undefined);
}

/** Updates in place: the id stays, so people who closed a live announcement do not see it again. */
export async function updateAnnouncement(input: unknown): Promise<ActionResult> {
  await requireStaff();
  const parsed = announcementUpdateSchema.safeParse(input);
  if (!parsed.success) return fail(formFailCode(input));
  const supabase = await createClient();
  // "Keep the current start" is checked against the stored value, never one sent by the form.
  const { data: current, error: readError } = await supabase
    .from('announcements')
    .select('starts_at')
    .eq('id', parsed.data.id)
    .maybeSingle();
  if (readError) return fail(announcementErrorCode(readError));
  if (!current) return fail('not_found');
  const checked = checkAnnouncement(parsed.data, Date.now(), current.starts_at);
  if (!checked.ok) return fail(checked.code);
  const { data, error } = await supabase
    .from('announcements')
    .update(announcementUpdateRow(checked.values))
    .eq('id', parsed.data.id)
    .select('id');
  if (error) return fail(announcementErrorCode(error));
  if (!data?.length) return fail('not_found');
  refresh();
  return ok(undefined);
}

/** The form's own error code when there is one (text, dates); otherwise a bad id or shape. */
function formFailCode(input: unknown): string {
  const checked = checkAnnouncement(input, Date.now());
  return checked.ok ? 'invalid_input' : checked.code;
}

/** Sets ends_at to now, only while the announcement is live (the filter makes it a no-op otherwise). */
export async function endAnnouncement(input: unknown): Promise<ActionResult> {
  await requireStaff();
  const parsed = announcementIdSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_input');
  const nowIso = new Date().toISOString();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('announcements')
    .update({ ends_at: nowIso })
    .eq('id', parsed.data)
    .lte('starts_at', nowIso)
    .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
    .select('id');
  if (error) return fail(announcementErrorCode(error));
  if (!data?.length) return fail('announcement_not_live');
  refresh();
  return ok(undefined);
}

export async function deleteAnnouncement(input: unknown): Promise<ActionResult> {
  await requireStaff();
  const parsed = announcementIdSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_input');
  const supabase = await createClient();
  const { data, error } = await supabase.from('announcements').delete().eq('id', parsed.data).select('id');
  if (error) return fail(announcementErrorCode(error));
  if (!data?.length) return fail('not_found');
  refresh();
  return ok(undefined);
}
