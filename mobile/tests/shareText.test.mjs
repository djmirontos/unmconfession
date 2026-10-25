// Run with: npm run test:share  (Node 22.6+ strips the TypeScript types of the import)
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bodyTextSize, pollLayout, preparePhotoCaption, prepareShareText, SHARE_TEXT_MAX } from '../lib/shareText.ts';

const ZWSP = '​';
const codePoints = (s) => Array.from(s).length;

test('very short text is kept as is and set largest', () => {
  assert.deepEqual(prepareShareText('  hi  '), { text: 'hi', truncated: false });
  assert.equal(bodyTextSize('hi').fontSize, 36);
  assert.equal(bodyTextSize('x'.repeat(40)).fontSize, 36);
  assert.equal(bodyTextSize('x'.repeat(41)).fontSize, 30);
});

test('photo caption: line breaks flattened, cut short with an ellipsis', () => {
  assert.deepEqual(preparePhotoCaption('first\n\nsecond'), { text: 'first second', truncated: false });
  const long = preparePhotoCaption('word '.repeat(100));
  assert.equal(long.truncated, true);
  assert.ok(long.text.endsWith('…'));
  assert.ok(codePoints(long.text) <= 161);
  // A shoutout leaves room for its heading.
  assert.ok(codePoints(preparePhotoCaption('word '.repeat(100), true).text) <= 101);
});

test('photo caption with emoji only is cut by code point', () => {
  const { text, truncated } = preparePhotoCaption('🔥'.repeat(300));
  assert.equal(truncated, true);
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(text), 'no lone high surrogate');
});

test('600+ characters are cut at a word boundary with an ellipsis', () => {
  const long = 'word '.repeat(200); // 1000 characters
  const { text, truncated } = prepareShareText(long);
  assert.equal(truncated, true);
  assert.ok(text.endsWith('word…'), text.slice(-12));
  assert.ok(codePoints(text) <= SHARE_TEXT_MAX + 1);
  assert.equal(bodyTextSize(text, 1).fontSize, 14);
});

test('600 characters fit; 601 are cut', () => {
  const words = (n) => 'abcd '.repeat(Math.ceil(n / 5)).slice(0, n);
  assert.equal(prepareShareText(words(600)).truncated, false);
  assert.equal(prepareShareText(words(601)).truncated, true);
});

test('emoji and non-Latin text are counted and cut by code point, never split', () => {
  const emoji = '😀'.repeat(700);
  const { text, truncated } = prepareShareText(emoji);
  assert.equal(truncated, true);
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(text), 'no lone high surrogate');
  const tagalog = 'Salamat po sa lahat ng tumulong 🙏 ñ ü 中文 '.repeat(30);
  const cut = prepareShareText(tagalog);
  assert.equal(cut.truncated, true);
  assert.ok(codePoints(cut.text) <= SHARE_TEXT_MAX + 1);
});

test('many line breaks collapse and are capped', () => {
  const { text } = prepareShareText('a\n\n\n\n\nb\n'.repeat(1) + Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n'));
  assert.ok(!text.includes('\n\n\n'));
  assert.ok((text.match(/\n/g) ?? []).length <= 10);
  // Line breaks weigh on the size: few characters, many lines -> smaller text.
  assert.ok(bodyTextSize('a\nb\nc\nd\ne\nf\ng\nh').fontSize < bodyTextSize('abcdefgh').fontSize);
});

test('long words and URLs get break points so they can wrap', () => {
  const url = 'https://example.com/' + 'x'.repeat(80);
  const { text } = prepareShareText(`see ${url}`);
  assert.ok(text.includes(ZWSP));
  for (const part of text.split(/[\s​]/)) assert.ok(codePoints(part) <= 20, part);
});

test('more lines reserved means fewer lines for the body', () => {
  assert.equal(bodyTextSize('x'.repeat(500), 3).maxLines, 11);
  assert.equal(bodyTextSize('x', 99).maxLines, 1);
});

test('poll with 2 options: no "+N more", 2-line options', () => {
  assert.deepEqual(pollLayout('Best canteen?', 2), {
    question: { fontSize: 24, lineHeight: 30, maxLines: 3 },
    shown: 2,
    more: 0,
    optionLines: 2,
  });
});

test('poll with 6 options: 4 shown, "+2 more", 1-line options, question capped at 3 lines', () => {
  const layout = pollLayout('q'.repeat(150), 6);
  assert.equal(layout.shown, 4);
  assert.equal(layout.more, 2);
  assert.equal(layout.optionLines, 1);
  assert.equal(layout.question.maxLines, 3);
});
