// Members see the post kind 'confession' as "post" (v1.0.3). The DB value stays 'confession'.
// Pure, no imports (tests/postLabels.test.mjs).

/** Lower-case word for a post kind in running text: "shoutout", "poll", otherwise "post". */
export function postKindWord(kind: string | null | undefined): 'post' | 'shoutout' | 'poll' {
  return kind === 'shoutout' || kind === 'poll' ? kind : 'post';
}
