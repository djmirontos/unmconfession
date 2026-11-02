// Members see the post kind 'confession' as "post" (v1.0.3), and a Q&A post (post_type 'qa')
// as "question". The DB value stays 'confession'. Pure, no imports (tests/postLabels.test.mjs).

/** Lower-case word for a post kind in running text: "shoutout", "poll", otherwise "post". */
export function postKindWord(kind: string | null | undefined): 'post' | 'shoutout' | 'poll' {
  return kind === 'shoutout' || kind === 'poll' ? kind : 'post';
}

/** Like postKindWord, but a Q&A post reads "question". Only kind 'confession' can be Q&A. */
export function postWord(kind: string | null | undefined, postType: string | null | undefined): 'post' | 'question' | 'shoutout' | 'poll' {
  const word = postKindWord(kind);
  return word === 'post' && postType === 'qa' ? 'question' : word;
}
