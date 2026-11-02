// The Create tab's chips, in order. Pure, no imports (tests/answers.test.mjs).
// 'confession' is the DB kind members see as "Post"; 'qa' is a Q&A post (create_qa_post).

export type FormKind = 'confession' | 'qa' | 'shoutout' | 'poll' | 'sell' | 'lost_found';

export const CREATE_KINDS: readonly { value: FormKind; label: string }[] = [
  { value: 'confession', label: 'Post' },
  { value: 'qa', label: 'Q&A' },
  { value: 'shoutout', label: 'Shoutout' },
  { value: 'poll', label: 'Poll' },
  { value: 'sell', label: 'Sell' },
  { value: 'lost_found', label: 'Lost & Found' },
];
