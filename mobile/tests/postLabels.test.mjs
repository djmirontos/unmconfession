// Run with: npm run test:labels  (Node 22.6+ strips the TypeScript types of the import)
// v1.0.3: members never see a post number, and the post kind 'confession' reads "post".
// The DB value 'confession' and the app name "UNM Freedom Confessions" stay.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const { postKindWord } = await import('../lib/postKindWord.ts');

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// Everything a member can see is built from these folders.
const DIRS = ['app', 'components', 'hooks', 'lib', 'stores'];

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(e.name) ? [path] : [];
  });
}
const FILES = DIRS.flatMap((d) => sourceFiles(join(ROOT, d))).map((path) => ({
  name: relative(ROOT, path).split(sep).join('/'),
  lines: readFileSync(path, 'utf8').split('\n'),
}));

/** Code lines only: whole-line comments and trailing // comments are skipped. */
function codeLines(file) {
  return file.lines.flatMap((line, i) => {
    const t = line.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return [];
    return [{ at: `${file.name}:${i + 1}`, text: line.replace(/\s\/\/.*$/, '') }];
  });
}

// ---------------------------------------------------------------- the helper

test('postKindWord: confession reads "post", shoutout and poll keep their word', () => {
  assert.equal(postKindWord('confession'), 'post');
  assert.equal(postKindWord('shoutout'), 'shoutout');
  assert.equal(postKindWord('poll'), 'poll');
});

test('postKindWord: unknown, empty and missing kinds read "post"', () => {
  for (const kind of ['qa', '', null, undefined, 'Shoutout', 'listing']) {
    assert.equal(postKindWord(kind), 'post', String(kind));
  }
});

test('postKindWord never returns the word "confession"', () => {
  for (const kind of ['confession', 'Confession', 'shoutout', 'poll', 'qa', null]) {
    assert.doesNotMatch(postKindWord(kind), /confession/i);
  }
});

// ---------------------------------------------------------------- source scans

test('the scan sees the member-facing folders', () => {
  for (const name of ['components/feed/PostHeader.tsx', 'components/share/ShareCard.tsx', 'app/post-status.tsx', 'hooks/useCreateSubmit.ts']) {
    assert.ok(
      FILES.some((f) => f.name === name),
      name,
    );
  }
});

// Allowed: the DB value on its own (lower case, exactly), the app name and the package id.
const ALLOWED_TEXT = (s) => s === 'confession' || /Freedom Confessions|unmfreedom\.confessions/i.test(s);

test('no string or JSX text says "confession" (except the DB value and the app name)', () => {
  const found = [];
  for (const file of FILES) {
    for (const { at, text } of codeLines(file)) {
      const strings = [...text.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`|>([^<>{}\n]+)</g)].map(
        (m) => m[1] ?? m[2] ?? m[3] ?? m[4],
      );
      for (const s of strings) {
        if (/confession/i.test(s) && !ALLOWED_TEXT(s)) found.push(`${at}: ${s.trim()}`);
      }
    }
  }
  assert.deepEqual(found, []);
});

// The one dead branch left as is: polls never get a number (posts_stamp), so it never renders one.
const ALLOWED_NUMBER = new Set(["        <Chip label={post.number !== null ? `Poll #${post.number}` : 'Poll'} />"]);

test('no member-facing screen renders a post number', () => {
  const found = [];
  for (const file of FILES) {
    // Staff screens may show it (the web panel does).
    if (file.name.startsWith('app/moderation/') || file.name.startsWith('components/moderation/')) continue;
    for (const { at, text } of codeLines(file)) {
      if (ALLOWED_NUMBER.has(text.replace(/\r$/, ''))) continue;
      const shows =
        /#\$\{[^}]*\bnumber\b/.test(text) || // `#${post.number}`
        /#\{[^}]*\bnumber\b/.test(text) || // #{post.number} in JSX
        /\{\s*[\w?.]*\.number\s*\}/.test(text) || // {item.number} or number={post.number}
        /Post number/i.test(text);
      if (shows) found.push(`${at}: ${text.trim()}`);
    }
  }
  assert.deepEqual(found, []);
});
