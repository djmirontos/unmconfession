import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { announcementErrorCode, codeFromError, messageFor } from '@/lib/errors';
import {
  type AnnouncementQuery,
  announcementInsertRow,
  announcementUpdateRow,
  applyAnnouncementFilters,
} from '@/lib/announcements/query';
import {
  announcementFiltersSchema,
  announcementFormSchema,
  announcementUpdateSchema,
  BODY_MAX,
  checkAnnouncement,
  TITLE_MAX,
} from '@/lib/announcements/schemas';
import { announcementActions, announcementStatus, isoToManilaInput, manilaInputToIso } from '@/lib/announcements/time';

const ID = '3f0c5a52-1f8b-4d3e-9a7c-2b6d8e4f1a90';
const USER = '7b1d2c3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
// 2026-10-27 10:00 Manila.
const NOW = Date.parse('2026-10-27T02:00:00Z');
const valid = { title: '  Exams week  ', body: 'Library open late.\nGood luck!', start: { mode: 'now' }, end: null };
const src = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8');

const code = (input: unknown, stored: string | null = null) => {
  const r = checkAnnouncement(input, NOW, stored);
  return r.ok ? 'ok' : r.code;
};

// ------------------------------------------------------------ schema

describe('announcement form', () => {
  it('accepts a valid announcement, trims the text and keeps line breaks', () => {
    const r = checkAnnouncement(valid, NOW);
    expect(r).toEqual({
      ok: true,
      values: { title: 'Exams week', body: 'Library open late.\nGood luck!', startsAt: new Date(NOW).toISOString(), endsAt: null },
    });
  });
  it('refuses an empty or blank title, and one over 100 characters', () => {
    expect(code({ ...valid, title: '' })).toBe('announcement_title_invalid');
    expect(code({ ...valid, title: '   ' })).toBe('announcement_title_invalid');
    expect(code({ ...valid, title: 'x'.repeat(TITLE_MAX) })).toBe('ok');
    expect(code({ ...valid, title: 'x'.repeat(TITLE_MAX + 1) })).toBe('announcement_title_invalid');
  });
  it('refuses an empty body, and one over 1000 characters', () => {
    expect(code({ ...valid, body: ' \n ' })).toBe('announcement_body_invalid');
    expect(code({ ...valid, body: 'x'.repeat(BODY_MAX) })).toBe('ok');
    expect(code({ ...valid, body: 'x'.repeat(BODY_MAX + 1) })).toBe('announcement_body_invalid');
  });
  it('a schedule converts Manila time to UTC', () => {
    const r = checkAnnouncement({ ...valid, start: { mode: 'schedule', at: '2026-11-01T08:00' }, end: '2026-11-02T00:00' }, NOW);
    expect(r.ok && r.values).toMatchObject({ startsAt: '2026-11-01T00:00:00.000Z', endsAt: '2026-11-01T16:00:00.000Z' });
  });
  it('the end must be strictly after the start', () => {
    const start = { mode: 'schedule', at: '2026-11-01T08:00' };
    expect(code({ ...valid, start, end: '2026-11-01T07:59' })).toBe('announcement_end_before_start');
    expect(code({ ...valid, start, end: '2026-11-01T08:00' })).toBe('announcement_end_before_start');
    expect(code({ ...valid, start, end: '2026-11-01T08:01' })).toBe('ok');
    // Publish now: the end is compared with now.
    expect(code({ ...valid, end: '2026-10-27T09:00' })).toBe('announcement_end_before_start');
  });
  it('refuses invalid dates', () => {
    expect(code({ ...valid, start: { mode: 'schedule', at: '' } })).toBe('announcement_date_invalid');
    expect(code({ ...valid, start: { mode: 'schedule', at: '2026-02-30T10:00' } })).toBe('announcement_date_invalid');
    expect(code({ ...valid, start: { mode: 'schedule', at: '2026-11-01 10:00' } })).toBe('announcement_date_invalid');
    expect(code({ ...valid, end: '2026-13-01T10:00' })).toBe('announcement_date_invalid');
    expect(code({ ...valid, end: '2026-11-01T24:00' })).toBe('announcement_date_invalid');
  });
  it('refuses a start more than a year ahead', () => {
    expect(code({ ...valid, start: { mode: 'schedule', at: '2027-10-27T10:00' } })).toBe('ok'); // exactly 365 days
    expect(code({ ...valid, start: { mode: 'schedule', at: '2027-10-27T10:01' } })).toBe('announcement_start_too_far');
  });
  it('"keep the current start" uses the stored start, and needs one', () => {
    const stored = '2026-10-20T00:00:00.000Z';
    const r = checkAnnouncement({ ...valid, start: { mode: 'keep' } }, NOW, stored);
    expect(r.ok && r.values.startsAt).toBe(stored);
    expect(code({ ...valid, start: { mode: 'keep' } })).toBe('invalid_input');
    expect(code({ ...valid, start: { mode: 'keep' }, end: '2026-10-20T07:00' }, stored)).toBe('announcement_end_before_start');
  });
  it('refuses unknown start modes', () => {
    expect(code({ ...valid, start: { mode: 'later' } })).toBe('invalid_input');
  });
});

// ------------------------------------------------------------ Manila time

describe('Manila time conversion', () => {
  it.each([
    ['2026-10-27T00:00', '2026-10-26T16:00:00.000Z'],
    ['2026-10-27T23:59', '2026-10-27T15:59:00.000Z'],
    ['2026-01-01T07:59', '2025-12-31T23:59:00.000Z'],
    ['2028-02-29T12:00', '2028-02-29T04:00:00.000Z'],
  ])('%s Manila is %s and back', (local, utc) => {
    expect(manilaInputToIso(local)).toBe(utc);
    expect(isoToManilaInput(utc)).toBe(local);
  });
  it('drops seconds when showing a stored time', () => {
    expect(isoToManilaInput('2026-10-26T16:00:59.123Z')).toBe('2026-10-27T00:00');
  });
  it('refuses days that do not exist', () => {
    expect(manilaInputToIso('2026-04-31T10:00')).toBeNull();
    expect(manilaInputToIso('2027-02-29T10:00')).toBeNull();
  });
});

// ------------------------------------------------------------ status

describe('status', () => {
  const at = (iso: string) => Date.parse(iso);
  const start = '2026-10-27T02:00:00.000Z';
  const end = '2026-10-28T02:00:00.000Z';
  it('scheduled until the start, live from the start, ended at the end', () => {
    expect(announcementStatus(start, end, at(start) - 1)).toBe('scheduled');
    expect(announcementStatus(start, end, at(start))).toBe('live');
    expect(announcementStatus(start, end, at(end) - 1)).toBe('live');
    expect(announcementStatus(start, end, at(end))).toBe('ended');
  });
  it('no end date stays live', () => {
    expect(announcementStatus(start, null, at('2030-01-01T00:00:00Z'))).toBe('live');
  });
  it('"End now" is offered only for live announcements', () => {
    expect(announcementActions('live')).toEqual(['edit', 'end', 'delete']);
    expect(announcementActions('scheduled')).toEqual(['edit', 'delete']);
    expect(announcementActions('ended')).toEqual(['edit', 'delete']);
  });
});

// ------------------------------------------------------------ filter

type Call = [string, ...unknown[]];
class Recorder implements AnnouncementQuery<Recorder> {
  calls: Call[] = [];
  lte(c: string, v: string) {
    this.calls.push(['lte', c, v]);
    return this;
  }
  gt(c: string, v: string) {
    this.calls.push(['gt', c, v]);
    return this;
  }
  or(f: string) {
    this.calls.push(['or', f]);
    return this;
  }
}

describe('status filter', () => {
  const nowIso = '2026-10-27T02:00:00.000Z';
  const run = (status?: string) => applyAnnouncementFilters(new Recorder(), announcementFiltersSchema.parse({ status }), nowIso).calls;
  it('maps each status to the same rule as the read policy', () => {
    expect(run('live')).toEqual([
      ['lte', 'starts_at', nowIso],
      ['or', `ends_at.is.null,ends_at.gt.${nowIso}`],
    ]);
    expect(run('scheduled')).toEqual([['gt', 'starts_at', nowIso]]);
    expect(run('ended')).toEqual([['lte', 'ends_at', nowIso]]);
  });
  it('"all" and bad values add no condition', () => {
    expect(run()).toEqual([]);
    expect(run('everything')).toEqual([]);
  });
});

// ------------------------------------------------------------ created_by

describe('created_by never comes from the form', () => {
  it('the form schemas drop a created_by field', () => {
    const r = announcementFormSchema.safeParse({ ...valid, created_by: ID });
    expect(r.success && 'created_by' in r.data).toBe(false);
    const u = announcementUpdateSchema.safeParse({ ...valid, id: ID, created_by: ID });
    expect(u.success && 'created_by' in u.data).toBe(false);
  });
  it('insert rows use the session user id; update rows have no created_by or id', () => {
    const r = checkAnnouncement({ ...valid, created_by: ID }, NOW);
    if (!r.ok) throw new Error(r.code);
    expect(announcementInsertRow(r.values, USER).created_by).toBe(USER);
    const update = announcementUpdateRow(r.values);
    expect('created_by' in update).toBe(false);
    expect('id' in update).toBe(false);
  });
  it('the create action takes created_by from requireStaff(), not from the input', () => {
    const s = src('app/(panel)/announcements/actions.ts');
    expect(s).toMatch(/announcementInsertRow\(checked\.values, staff\.userId\)/);
    expect(s).not.toMatch(/created_by\s*:/);
  });
  it('every action checks staff access first', () => {
    const s = src('app/(panel)/announcements/actions.ts');
    const actions = s.match(/export async function \w+\(input: unknown\)[^{]*\{\s*\n\s*(.+)/g) ?? [];
    expect(actions).toHaveLength(4);
    for (const a of actions) expect(a).toMatch(/await requireStaff\(\);$/);
  });
});

// ------------------------------------------------------------ errors

describe('announcement errors', () => {
  it('a check violation gets the dates and limits message; RLS gets the forbidden one', () => {
    expect(messageFor(announcementErrorCode({ code: '23514', message: 'violates check constraint' }))).toBe('Check the dates and the text limits.');
    expect(announcementErrorCode({ code: '42501', message: 'new row violates row-level security policy' })).toBe('forbidden');
    expect(codeFromError({ code: '42501', message: 'permission denied' })).toBe('forbidden');
  });
});
