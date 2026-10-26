import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { codeFromError, messageFor } from '@/lib/errors';
import { imageCount, parseImages, parseListingExtra, parsePostExtra } from '@/lib/review/content';
import { splitHighlight } from '@/lib/review/highlight';
import { keyOf, neighbors, pickNextAfterAction, preview, type QueueEntry, reviewHref } from '@/lib/review/queue';
import { REJECT_REASONS, reasonLabel } from '@/lib/review/reasons';
import { cursorSchema, editSchema, rejectSchema, targetSchema } from '@/lib/review/schemas';
import { resolveShortcut } from '@/lib/review/shortcuts';

const ID = '3f0c5a52-1f8b-4d3e-9a7c-2b6d8e4f1a90';

describe('reject reasons', () => {
  it('sends the label as p_reason', () => {
    expect(reasonLabel('doxxing')).toBe('Doxxing or personal info');
    expect(reasonLabel('other')).toBe('Other');
  });
  it('has the six agreed reasons with unique values', () => {
    expect(REJECT_REASONS.map((r) => r.label)).toEqual([
      'Doxxing or personal info',
      'Bullying or harassment',
      'Spam',
      'Prohibited item',
      'Inappropriate content',
      'Other',
    ]);
    expect(new Set(REJECT_REASONS.map((r) => r.value)).size).toBe(REJECT_REASONS.length);
  });
});

describe('splitHighlight', () => {
  const marked = (text: string, term: string | null) =>
    splitHighlight(text, term)
      .map((s) => (s.match ? `[${s.text}]` : s.text))
      .join('');

  it('marks every match, case-insensitively, keeping the original casing', () => {
    expect(marked('Sell DRUGS here, drugs!', 'drugs')).toBe('Sell [DRUGS] here, [drugs]!');
  });
  it('escapes regex characters in the term', () => {
    expect(marked('price is $5.00 (cash)', '$5.00 (cash)')).toBe('price is [$5.00 (cash)]');
    expect(marked('a.b axb', 'a.b')).toBe('[a.b] axb');
  });
  it('returns plain text for an empty, blank or missing term', () => {
    expect(splitHighlight('hello', '')).toEqual([{ text: 'hello', match: false }]);
    expect(splitHighlight('hello', '   ')).toEqual([{ text: 'hello', match: false }]);
    expect(splitHighlight('hello', null)).toEqual([{ text: 'hello', match: false }]);
    expect(splitHighlight('', 'x')).toEqual([]);
  });
  it('does not overlap matches', () => {
    expect(marked('aaaa', 'aa')).toBe('[aa][aa]');
    expect(marked('aaa', 'aa')).toBe('[aa]a');
  });
  it('handles Unicode case and surrogate pairs', () => {
    expect(marked('ÉCOLE école', 'école')).toBe('[ÉCOLE] [école]');
    expect(marked('ok 🔥🔥 ok', '🔥')).toBe('ok [🔥][🔥] ok');
  });
  it('keeps line breaks in the text parts', () => {
    expect(marked('line one\nbad word\nline three', 'bad')).toBe('line one\n[bad] word\nline three');
  });
  it('loses no characters', () => {
    const text = 'Mixed CASE text with term, Term and TERM.';
    expect(splitHighlight(text, 'term').map((s) => s.text).join('')).toBe(text);
  });
});

describe('action input schemas', () => {
  it('accepts a valid target and rejects bad types or ids', () => {
    expect(targetSchema.safeParse({ type: 'post', id: ID }).success).toBe(true);
    expect(targetSchema.safeParse({ type: 'user', id: ID }).success).toBe(false);
    expect(targetSchema.safeParse({ type: 'post', id: 'not-a-uuid' }).success).toBe(false);
    expect(targetSchema.safeParse({ type: 'post', id: `${ID}' or 1=1` }).success).toBe(false);
  });
  it('requires a known reject reason and caps the note at 500', () => {
    expect(rejectSchema.safeParse({ type: 'post', id: ID }).success).toBe(false);
    expect(rejectSchema.safeParse({ type: 'post', id: ID, reason: 'Spam' }).success).toBe(false);
    expect(rejectSchema.safeParse({ type: 'post', id: ID, reason: 'spam' }).success).toBe(true);
    expect(rejectSchema.safeParse({ type: 'post', id: ID, reason: 'spam', note: 'x'.repeat(501) }).success).toBe(false);
  });
  it('limits edits: posts 2000, comments 1000, never listings, trimmed non-empty, reason 1-200', () => {
    const ok = (type: string, body: string, reason = 'Removed a name') =>
      editSchema.safeParse({ type, id: ID, body, reason }).success;
    expect(ok('post', 'x'.repeat(2000))).toBe(true);
    expect(ok('post', 'x'.repeat(2001))).toBe(false);
    expect(ok('comment', 'x'.repeat(1000))).toBe(true);
    expect(ok('comment', 'x'.repeat(1001))).toBe(false);
    expect(ok('listing', 'fine')).toBe(false);
    expect(ok('post', '   ')).toBe(false);
    expect(ok('post', 'fine', '  ')).toBe(false);
    expect(ok('post', 'fine', 'r'.repeat(201))).toBe(false);
    expect(ok('post', `  ${'x'.repeat(2000)}  `)).toBe(true);
  });
  it('accepts Postgres timestamps (with microseconds) as cursors only', () => {
    expect(cursorSchema.safeParse('2026-10-27T08:00:00.123456+00:00').success).toBe(true);
    expect(cursorSchema.safeParse('yesterday').success).toBe(false);
  });
});

describe('error mapping for the review RPCs', () => {
  it.each(['invalid_transition', 'reason_required', 'invalid_body', 'invalid_target', 'account_deleted', 'not_found', 'forbidden'])(
    '%s has its own message',
    (code) => {
      expect(codeFromError({ code: 'P0001', message: code })).toBe(code);
      expect(messageFor(code)).not.toBe(messageFor('unknown'));
    },
  );
  it('explains a lost race in plain words', () => {
    expect(messageFor('invalid_transition')).toBe('Someone else already handled this item.');
  });
  it('is honest about a saved edit whose approval failed', () => {
    expect(messageFor('approve_failed_after_edit')).toMatch(/edit was saved/);
  });
});

const q = (type: QueueEntry['target_type'], id: string, minute: number): QueueEntry => ({
  target_type: type,
  target_id: id,
  created_at: `2026-10-27T08:${String(minute).padStart(2, '0')}:00.000000+00:00`,
});

describe('next-item selection', () => {
  const a = q('post', 'a', 1);
  const b = q('comment', 'b', 2);
  const c = q('post', 'c', 3);
  const all = [a, b, c];

  it('goes to the item after the current one', () => {
    expect(pickNextAfterAction([b, c], all, keyOf(a))).toEqual(b);
  });
  it('wraps to the oldest remaining item after the last one', () => {
    expect(pickNextAfterAction([], [a, b], keyOf(c))).toEqual(a);
  });
  it('returns null when the queue is empty or only holds the current item', () => {
    expect(pickNextAfterAction([], [], keyOf(a))).toBeNull();
    expect(pickNextAfterAction([], [a], keyOf(a))).toBeNull();
  });
  it('skips the current item if it is still listed (action raced)', () => {
    expect(pickNextAfterAction([a, b], all, keyOf(a))).toEqual(b);
  });
  it('respects the type filter, including the wrap-around', () => {
    expect(pickNextAfterAction([b, c], all, keyOf(a), 'post')).toEqual(c);
    expect(pickNextAfterAction([], [a, b], keyOf(c), 'comment')).toEqual(b);
    expect(pickNextAfterAction([b], [b], keyOf(a), 'listing')).toBeNull();
  });

  it('finds previous and next around the current item', () => {
    expect(neighbors(all, [c], { key: keyOf(b), createdAt: b.created_at })).toEqual({ prev: a, next: c });
    expect(neighbors(all, [b, c], { key: keyOf(a), createdAt: a.created_at })).toEqual({ prev: null, next: b });
    expect(neighbors(all, [], { key: keyOf(c), createdAt: c.created_at })).toEqual({ prev: b, next: null });
  });
  it('still finds neighbors when the current item disappeared from the queue', () => {
    const gone = q('listing', 'gone', 2);
    expect(neighbors([a, c], [c], { key: keyOf(gone), createdAt: gone.created_at })).toEqual({ prev: a, next: c });
  });
  it('applies the filter to neighbors', () => {
    expect(neighbors(all, [b, c], { key: keyOf(a), createdAt: a.created_at }, 'post')).toEqual({ prev: null, next: c });
  });
  it('builds detail links that keep the filter', () => {
    expect(reviewHref('post', ID, 'post')).toBe(`/review/post/${ID}?filter=post`);
    expect(reviewHref('post', ID)).toBe(`/review/post/${ID}`);
  });
});

describe('list preview', () => {
  it('flattens whitespace and keeps short text whole', () => {
    expect(preview('Hello\n\n  world')).toBe('Hello world');
    expect(preview(null)).toBe('');
  });
  it('cuts long text at a word boundary with an ellipsis', () => {
    const out = preview(`${'word '.repeat(60)}end`);
    expect(out.length).toBeLessThanOrEqual(201);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/wor…$/);
  });
});

describe('content JSON parsing', () => {
  const base = 'https://xyz.supabase.co/rest/v1';
  it('builds public post-images URLs and keeps the stored size', () => {
    expect(parseImages([{ path: 'u1/p1.jpg', width: 1440, height: 1080, blurhash: 'x' }], base)).toEqual([
      { url: 'https://xyz.supabase.co/storage/v1/object/public/post-images/u1/p1.jpg', width: 1440, height: 1080 },
    ]);
  });
  it('drops malformed or unsafe entries', () => {
    expect(parseImages([{ path: '../secret', width: 1, height: 1 }, { path: 'a/b.jpg' }, 'x', { path: 'https://evil/x.jpg', width: 1, height: 1 }], base)).toEqual([]);
    expect(parseImages(null, base)).toEqual([]);
    expect(imageCount([{}, {}])).toBe(2);
    expect(imageCount('nope')).toBe(0);
  });
  it('reads poll and listing extras, tolerating junk', () => {
    expect(parsePostExtra({ target_name: null, ends_at: '2026-11-01T00:00:00Z' }).ends_at).toBe('2026-11-01T00:00:00Z');
    expect(parseListingExtra({ price: 150, condition: 'good', is_closed: false }).price).toBe(150);
    expect(parseListingExtra('junk')).toEqual({});
  });
});

describe('keyboard shortcuts', () => {
  const key = (k: string, extra: Partial<Parameters<typeof resolveShortcut>[0]> = {}) =>
    resolveShortcut({ key: k, ctrlKey: false, metaKey: false, altKey: false, targetTag: 'BODY', targetEditable: false, dialogOpen: false, ...extra });

  it('maps A, R, E and the arrows', () => {
    expect(key('a')).toBe('approve');
    expect(key('R')).toBe('reject');
    expect(key('e')).toBe('edit');
    expect(key('ArrowRight')).toBe('next');
    expect(key('ArrowLeft')).toBe('prev');
    expect(key('x')).toBeNull();
  });
  it('is ignored while typing, in a dialog or with modifiers', () => {
    expect(key('a', { targetTag: 'INPUT' })).toBeNull();
    expect(key('a', { targetTag: 'TEXTAREA' })).toBeNull();
    expect(key('ArrowRight', { targetTag: 'TEXTAREA' })).toBeNull();
    expect(key('a', { targetEditable: true })).toBeNull();
    expect(key('a', { dialogOpen: true })).toBeNull();
    expect(key('a', { ctrlKey: true })).toBeNull();
    expect(key('r', { metaKey: true })).toBeNull();
  });
  it('works while a button has focus', () => {
    expect(key('a', { targetTag: 'BUTTON' })).toBe('approve');
  });
});

describe('review pages and actions check access on the server', () => {
  const src = (path: string) => readFileSync(fileURLToPath(new URL(`../app/(panel)/review/${path}`, import.meta.url)), 'utf8');

  it.each(['page.tsx', '[type]/[id]/page.tsx', 'next/page.tsx'])('%s calls requireStaff()', (file) => {
    expect(src(file)).toMatch(/await requireStaff\(\)/);
  });
  it('every exported action calls requireStaff() first', () => {
    const code = src('actions.ts');
    // The signature ends with "{" at the end of its line; the next line is the first statement.
    const exported = [...code.matchAll(/export async function (\w+)\([^)]*\)[^\n]*\{\n\s*([^\n]*)/g)];
    expect(exported.map((m) => m[1]).sort()).toEqual(['approveItem', 'editAndApprove', 'loadMoreQueue', 'rejectItem']);
    for (const [, name, firstLine] of exported) expect(firstLine, name).toBe('await requireStaff();');
  });
});
