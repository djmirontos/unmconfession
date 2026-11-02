// Run with: npm run test:legal
// The legal texts live twice: in the app (app/legal/[doc].tsx, DOCS) and on the site (site/content/legal.ts,
// LEGAL), word for word. This reads both files as text and compares them; only whitespace is normalised.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const app = readFileSync(new URL('../app/legal/[doc].tsx', import.meta.url), 'utf8');
const site = readFileSync(new URL('../../site/content/legal.ts', import.meta.url), 'utf8');

const norm = (s) => s.replace(/\s+/g, ' ').trim();

/** The string literals in one document's `sections` array, e.g. sections(app, 'privacy'). */
function sections(source, doc) {
  const start = source.indexOf(`  ${doc}: {`);
  assert.ok(start >= 0, `${doc} not found`);
  const open = source.indexOf('sections: [', start);
  const close = source.indexOf('\n    ],', open);
  assert.ok(open > start && close > open, `${doc} sections not found`);
  const block = source.slice(open, close);
  // Single- or double-quoted literals; the texts use one kind or the other, never escapes.
  return [...block.matchAll(/'([^'\n]*)'|"([^"\n]*)"/g)].map((m) => norm(m[1] ?? m[2]));
}

const A =
  'We store which version of the app you use and whether it runs on Android or iOS, only so we can support updates. We do not store your phone model or any device identifier for this.';
const B =
  'While the app is in Google Play testing, we may add your account email address to our Google Play tester list so you can install the app from Google Play. Google handles that list under its own terms.';
const ERASE = 'push notification tokens and the record of which app version you use are erased.';

for (const doc of ['terms', 'privacy', 'rules']) {
  test(`${doc}: the app and the site say the same, word for word`, () => {
    const fromApp = sections(app, doc);
    assert.ok(fromApp.length > 0);
    assert.deepEqual(fromApp, sections(site, doc));
  });
}

test('the privacy policy names the app version record and the Play tester list, in both places', () => {
  for (const [name, source] of [['app', app], ['site', site]]) {
    const privacy = sections(source, 'privacy');
    assert.ok(privacy.includes(A), `${name}: sentence (a)`);
    assert.ok(privacy.includes(B), `${name}: sentence (b)`);
  }
});

test('the deletion paragraph erases the app version record and promises nothing about Google Play', () => {
  for (const [name, source] of [['app', app], ['site', site]]) {
    const deletion = sections(source, 'privacy').find((s) => s.startsWith('Deleting your account:'));
    assert.ok(deletion?.includes(ERASE), `${name}: erase mention`);
    assert.ok(!/google play/i.test(deletion), `${name}: no Play promise`);
  }
});

test('the site delete-account page lists the app version record among what is erased', () => {
  const page = readFileSync(new URL('../../site/app/delete-account/page.tsx', import.meta.url), 'utf8');
  const erased = page.slice(page.indexOf('const ERASED = ['), page.indexOf('];', page.indexOf('const ERASED = [')));
  assert.match(norm(erased), /push notification tokens and the record of which app version you use\./);
});

test('the in-app delete-account screen lists push tokens and the app version record among what is erased', () => {
  const screen = readFileSync(new URL('../app/delete-account.tsx', import.meta.url), 'utf8');
  const start = screen.indexOf("title: 'What will be erased'");
  assert.ok(start >= 0, 'erased block not found');
  const erased = norm(screen.slice(start, screen.indexOf('],', start)));
  assert.match(erased, /push notification tokens/);
  assert.match(erased, /the record of which app version you use/);
  assert.doesNotMatch(erased, /google play/i);
});
