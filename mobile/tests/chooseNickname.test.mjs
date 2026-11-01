// Run with: npm run test:nickname  (Node 22.6+ strips the TypeScript types of the import)
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { test } from 'node:test';

// lib/chooseNickname.ts imports '@/lib/validation' (tsconfig paths).
register('./aliasHook.mjs', import.meta.url);
const { ADJECTIVES, NOUNS, findAvailableNickname, suggestNickname } = await import('../lib/nicknameSuggestions.ts');
const { CHOOSE_NICKNAME_COPY, NICKNAME_HINT, NICKNAME_UNAVAILABLE, saveCheck } = await import('../lib/chooseNickname.ts');
const { nicknameSchema } = await import('../lib/validation.ts');
const { getNicknameSuggestionError } = await import('../lib/errors.ts');

const FORMAT = /^[A-Za-z0-9_.]{3,20}$/;
// Rude or unsafe fragments (English and Filipino) that no suggestion may contain, even across the word join.
const BLOCKLIST = [
  'fuck', 'shit', 'cunt', 'bitch', 'slut', 'whore', 'nigg', 'fag', 'ass', 'cock', 'dick', 'tit', 'porn',
  'sex', 'rape', 'nazi', 'hitler', 'kill', 'anal', 'cum', 'hoe', 'piss', 'puta', 'putang', 'tangina',
  'gago', 'tanga', 'bobo', 'ulol', 'kantot', 'pekpek', 'tite', 'puke', 'pakyu', 'admin', 'mod', 'staff',
];
// Words that double as common first names must not appear as a whole word.
const NAMES = ['rose', 'jade', 'ivy', 'hazel', 'robin', 'amber', 'dawn', 'joy', 'grace', 'hope', 'faith', 'sky', 'angel', 'jasper', 'sunny', 'rusty', 'coral', 'ember', 'raven', 'willow', 'fern', 'daisy', 'lily', 'pearl'];

// Deterministic [0, 1) sequence for repeatable tests.
const seeded = (seed) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

// ---------------------------------------------------------------- suggestions

test('the word lists are lowercase letters only and short enough for three digits', () => {
  for (const w of [...ADJECTIVES, ...NOUNS]) assert.match(w, /^[a-z]+$/, w);
  const longest = Math.max(...ADJECTIVES.map((a) => a.length)) + Math.max(...NOUNS.map((n) => n.length));
  assert.ok(longest + 3 <= 20, `longest is ${longest + 3}`);
  assert.equal(new Set(ADJECTIVES).size, ADJECTIVES.length);
  assert.equal(new Set(NOUNS).size, NOUNS.length);
});

test('no adjective + noun pair contains a blocked fragment, and no word is a first name', () => {
  for (const a of ADJECTIVES) {
    for (const n of NOUNS) {
      const joined = `${a}${n}`;
      for (const bad of BLOCKLIST) assert.ok(!joined.includes(bad), `${joined} contains ${bad}`);
    }
  }
  for (const w of [...ADJECTIVES, ...NOUNS]) assert.ok(!NAMES.includes(w), `${w} is a first name`);
});

test('suggestions always pass the format, the client schema and the reserved list', () => {
  const random = seeded(7);
  for (let i = 0; i < 500; i++) {
    const s = suggestNickname(random);
    assert.match(s, FORMAT);
    assert.match(s, /^[a-z]+[0-9]{2,3}$/);
    assert.equal(nicknameSchema.safeParse(s).success, true, s);
  }
});

test('the extremes of the random range still give valid names', () => {
  assert.match(suggestNickname(() => 0), /^[a-z]+10$/);
  assert.match(suggestNickname(() => 0.999999), /^[a-z]+999$/);
});

test('500 suggestions repeat no more than chance allows', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(suggestNickname());
  // About 2 million combinations: the expected number of repeats in 500 draws is well below 1.
  assert.ok(500 - seen.size <= 3, `${500 - seen.size} repeats`);
});

test('findAvailableNickname returns the first free name, checking one at a time', async () => {
  const asked = [];
  let running = 0;
  const name = await findAvailableNickname(
    async (n) => {
      running++;
      assert.equal(running, 1, 'one request at a time');
      asked.push(n);
      await new Promise((r) => setTimeout(r, 1));
      running--;
      return asked.length === 3;
    },
    { random: seeded(3) },
  );
  assert.equal(asked.length, 3);
  assert.equal(name, asked[2]);
  assert.equal(new Set(asked).size, 3);
});

test('findAvailableNickname stops after 5 attempts and returns null', async () => {
  let calls = 0;
  const name = await findAvailableNickname(async () => {
    calls++;
    return false;
  });
  assert.equal(name, null);
  assert.equal(calls, 5);
});

test('findAvailableNickname passes a failed check (offline) on', async () => {
  const offline = { message: 'TypeError: Network request failed', details: '', hint: '', code: '' };
  await assert.rejects(findAvailableNickname(async () => Promise.reject(offline)), (e) => e === offline);
  assert.equal(getNicknameSuggestionError(offline), 'No connection. Check your internet and try again.');
  assert.equal(getNicknameSuggestionError(new TypeError('Network request failed')), 'No connection. Check your internet and try again.');
  assert.equal(getNicknameSuggestionError({ message: 'boom' }), 'Something went wrong. Please try again.');
});

// ---------------------------------------------------------------- what is missing on Save

const base = { nickname: 'quietowl482', availability: 'available', needsTerms: true, acceptedTerms: true };

test('an empty name asks for one with the field hint', () => {
  assert.deepEqual(saveCheck({ ...base, nickname: '   ' }), { kind: 'nickname', message: NICKNAME_HINT });
});

test('format and reserved names give the field messages, before anything else', () => {
  assert.deepEqual(saveCheck({ ...base, nickname: 'ab', availability: 'unavailable', acceptedTerms: false }), {
    kind: 'nickname',
    message: 'At least 3 characters.',
  });
  assert.equal(saveCheck({ ...base, nickname: 'no spaces' }).message, 'Only letters, numbers, underscore and dot.');
  assert.equal(saveCheck({ ...base, nickname: 'admin' }).message, 'That nickname is reserved.');
});

test('an unchecked name is checked first, even when the box is not ticked', () => {
  assert.deepEqual(saveCheck({ ...base, nickname: '  quietowl482 ', availability: 'unknown', acceptedTerms: false }), {
    kind: 'check',
    nickname: 'quietowl482',
  });
});

test('a taken name comes before the box', () => {
  assert.deepEqual(saveCheck({ ...base, availability: 'unavailable', acceptedTerms: false }), {
    kind: 'taken',
    message: NICKNAME_UNAVAILABLE,
  });
});

test('the box comes last; a failed check leaves the decision to the server', () => {
  assert.deepEqual(saveCheck({ ...base, acceptedTerms: false }), { kind: 'terms', message: 'Tick the box to continue' });
  assert.deepEqual(saveCheck({ ...base, availability: 'error' }), { kind: 'ready', nickname: 'quietowl482' });
});

test('accounts that already accepted the Terms do not need the box', () => {
  assert.deepEqual(saveCheck({ ...base, needsTerms: false, acceptedTerms: false }), { kind: 'ready', nickname: 'quietowl482' });
});

test('ready sends the trimmed name, exactly as before', () => {
  assert.deepEqual(saveCheck({ ...base, nickname: ' Night_Owl.21 ' }), { kind: 'ready', nickname: 'Night_Owl.21' });
});

// ---------------------------------------------------------------- copy

test('the screen copy', () => {
  assert.equal(CHOOSE_NICKNAME_COPY.title, 'One last step');
  assert.equal(
    CHOOSE_NICKNAME_COPY.subtitle,
    "Pick a nickname. It's how you appear on UNM Freedom Confessions, so don't use your real name.",
  );
  assert.equal(CHOOSE_NICKNAME_COPY.cancel, 'Cancel sign-up');
  assert.equal(CHOOSE_NICKNAME_COPY.cancelHelp, 'This signs you out of this phone.');
  assert.equal(CHOOSE_NICKNAME_COPY.termsMissing, 'Tick the box to continue');
  assert.equal(CHOOSE_NICKNAME_COPY.suggest, 'Suggest a name');
  assert.equal(CHOOSE_NICKNAME_COPY.suggestNone, "Couldn't find one right now, try again");
  assert.equal(NICKNAME_UNAVAILABLE, 'Taken or not allowed. Try another one.');
  assert.equal(NICKNAME_HINT, '3–20 characters: letters, numbers, underscore or dot.');
  for (const text of Object.values(CHOOSE_NICKNAME_COPY)) assert.doesNotMatch(text, /\p{Extended_Pictographic}/u);
});
