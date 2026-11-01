// Friendly anonymous names for "Suggest a name": adjective + noun + 2–3 digits, e.g. "quietowl482".
// Lowercase letters only, at most 17 characters together, so every result fits ^[A-Za-z0-9_.]{3,20}$.
// Words that are also common first names (rose, robin, sunny…) and ones that hide rude
// substrings (compass, grape, petite…) are left out on purpose; tests/nicknameSuggestions checks it.

export const ADJECTIVES: readonly string[] = [
  'quiet', 'brave', 'calm', 'clever', 'cosmic', 'cozy', 'curious', 'gentle', 'golden', 'happy',
  'humble', 'jolly', 'kind', 'lucky', 'lunar', 'mellow', 'misty', 'nimble', 'noble', 'polar',
  'rapid', 'silent', 'sleepy', 'snowy', 'solar', 'starry', 'sturdy', 'swift', 'tidy', 'witty',
  'zesty', 'bright', 'breezy', 'eager', 'fuzzy', 'mighty', 'velvet', 'wise', 'frosty', 'sparkly',
];

export const NOUNS: readonly string[] = [
  'owl', 'otter', 'panda', 'falcon', 'comet', 'pebble', 'maple', 'cactus', 'walrus', 'koala',
  'lantern', 'meteor', 'badger', 'bison', 'cloud', 'dolphin', 'fox', 'gecko', 'heron', 'kiwi',
  'lemur', 'lynx', 'magpie', 'moose', 'narwhal', 'nebula', 'orca', 'parrot', 'penguin', 'puffin',
  'quokka', 'sparrow', 'squid', 'tiger', 'toucan', 'turtle', 'waffle', 'yak', 'zebra', 'mango',
  'pretzel', 'biscuit', 'noodle', 'muffin', 'acorn', 'pinecone', 'rocket', 'kettle', 'teapot',
];

// The lists are never empty, so the fallback never shows.
const pick = (items: readonly string[], random: () => number): string =>
  items[Math.min(items.length - 1, Math.floor(random() * items.length))] ?? '';

/** One suggestion. `random` returns [0, 1) like Math.random (injected by the tests). */
export function suggestNickname(random: () => number = Math.random): string {
  const digits = 10 + Math.floor(random() * 990); // 10–999: two or three digits
  return `${pick(ADJECTIVES, random)}${pick(NOUNS, random)}${digits}`;
}

/**
 * Tries up to `attempts` different suggestions, one request at a time, and returns the first
 * the server accepts, or null when none was free. A failed check (offline) is thrown as is.
 */
export async function findAvailableNickname(
  isAvailable: (nickname: string) => Promise<boolean>,
  { attempts = 5, random = Math.random }: { attempts?: number; random?: () => number } = {},
): Promise<string | null> {
  const tried = new Set<string>();
  for (let i = 0; i < attempts; i++) {
    let candidate = suggestNickname(random);
    // A repeat is very unlikely; a few redraws keep the attempts distinct without looping forever.
    for (let redraw = 0; tried.has(candidate) && redraw < 5; redraw++) candidate = suggestNickname(random);
    tried.add(candidate);
    if (await isAvailable(candidate)) return candidate;
  }
  return null;
}
