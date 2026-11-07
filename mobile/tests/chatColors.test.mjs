// Run with: npm run test:chatcolors  (Node 22.6+ strips the TypeScript types of the import)
// Chat colours: Messenger-style blue on a neutral background, every pair WCAG-checked in both themes.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { register } from 'node:module';
import { join } from 'node:path';
import { test } from 'node:test';

register('./aliasHook.mjs', import.meta.url);

const K = await import('../lib/contrast.ts');
const { chatColorPairs } = await import('../lib/chatColors.ts');
const { palettes } = await import('../theme/palettes.ts');

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// ---------------------------------------------------------------- the helper

test('contrast helper: known values', () => {
  assert.equal(K.contrastRatio('#000000', '#FFFFFF').toFixed(2), '21.00');
  assert.equal(K.contrastRatio('#FFFFFF', '#FFFFFF'), 1);
  assert.equal(K.contrastRatio('#777777', '#FFFFFF').toFixed(2), '4.48');
  assert.equal(K.contrastRatio('#FFFFFF', '#0866FF').toFixed(2), K.contrastRatio('#0866FF', '#FFFFFF').toFixed(2), 'symmetric');
  assert.equal(K.luminance('#000000'), 0);
  assert.equal(K.luminance('#ffffff'), 1);
  assert.throws(() => K.luminance('#FFF'));
  assert.throws(() => K.luminance('blue'));
});

test('thresholds: text 4.5:1, graphics 3:1', () => {
  assert.equal(K.MIN_TEXT, 4.5);
  assert.equal(K.MIN_GRAPHIC, 3);
  assert.equal(K.meetsContrast({ name: 'x', fg: '#777777', bg: '#FFFFFF', kind: 'text' }), false);
  assert.equal(K.meetsContrast({ name: 'x', fg: '#777777', bg: '#FFFFFF', kind: 'graphic' }), true);
});

// ---------------------------------------------------------------- the chat palette

test('own bubbles are Messenger blue with white text, in both themes', () => {
  for (const scheme of ['light', 'dark']) {
    assert.equal(palettes[scheme].chatOwn, '#0866FF', scheme);
    assert.equal(palettes[scheme].onChatOwn, '#FFFFFF', scheme);
  }
  // The rest of the app keeps its amber accent.
  assert.equal(palettes.dark.accent, '#FFB020');
  assert.equal(palettes.light.accent, '#F0A000');
});

test('every chat colour pair meets WCAG in light and dark', () => {
  for (const scheme of ['light', 'dark']) {
    const pairs = chatColorPairs(palettes[scheme]);
    assert.ok(pairs.length >= 40);
    const failing = pairs
      .filter((p) => !K.meetsContrast(p))
      .map((p) => `${scheme} ${p.name}: ${p.fg} on ${p.bg} = ${K.contrastRatio(p.fg, p.bg).toFixed(2)}`);
    assert.deepEqual(failing, []);
  }
});

test('every chat token is a CSS variable and a Tailwind colour', () => {
  const colors = read('../theme/colors.ts');
  const tailwind = read('../tailwind.config.js');
  for (const name of ['chat-bg', 'chat-own', 'on-chat-own', 'chat-other', 'chat-accent', 'chat-accent-text', 'chat-accent-dim']) {
    assert.match(colors, new RegExp(`'--color-${name}'`), name);
    assert.match(tailwind, new RegExp(`'${name}': token\\('${name}'\\)`), name);
  }
});

// ---------------------------------------------------------------- the chat files use the chat colours

function chatFiles() {
  const out = [];
  for (const dir of ['components/chat', 'app/chat']) {
    for (const e of readdirSync(join(root, dir))) out.push([`${dir}/${e}`, readFileSync(join(root, dir, e), 'utf8')]);
  }
  return out;
}

test('no amber accent, alpha overlays or faded rows left in the chat screens (the profile Message button excepted)', () => {
  for (const [path, text] of chatFiles()) {
    if (path === 'components/chat/MessageButton.tsx' || path === 'app/chat/requests.tsx') continue;
    assert.doesNotMatch(text, /\b(bg|text|border)-accent\b|\b(bg|text|border)-accent-dim\b|text-on-accent|border-on-accent/, path);
    assert.doesNotMatch(text, /colors\.accent\b|colors\.onAccent\b/, path);
    // A dimmed modal backdrop (inset-0) is fine; text never sits on a see-through colour.
    for (const line of text.split('\n')) if (!/inset-0/.test(line)) assert.doesNotMatch(line, /bg-black\/\d+|opacity-60/, path);
  }
});

test('bubbles, send button, badge and screens use the chat tokens', () => {
  const bubble = read('../components/chat/MessageBubble.tsx');
  assert.match(bubble, /row\.mine \? 'bg-chat-own' : 'bg-chat-other'/);
  assert.match(bubble, /'text-on-chat-own'/);
  const composer = read('../components/chat/ChatComposer.tsx');
  assert.match(composer, /canSend \? 'bg-chat-own' : 'bg-surface2'/);
  assert.match(composer, /border-chat-accent/);
  const row = read('../components/chat/ConversationRow.tsx');
  assert.match(row, /text-chat-accent-text/);
  assert.match(row, /bg-chat-own px-1\.5/);
  assert.match(read('../app/chat/[id].tsx'), /className="flex-1 bg-chat-bg"/);
  assert.match(read('../app/chat/new.tsx'), /className="flex-1 bg-chat-bg"/);
  // "Online" is text: grey (green text fails on white); the green dot stays.
  assert.match(read('../components/chat/ChatHeader.tsx'), /text-xs font-semibold text-text-dim">Online/);
});
