import { describe, expect, it } from 'vitest';

import { authorLabel, kindLabel } from '@/components/review/hold-badge';

describe('kindLabel', () => {
  it('shows the post kind confession as "Post" (the DB value stays)', () => {
    expect(kindLabel('confession')).toBe('Post');
  });
  it('keeps the other kinds and knows Q&A', () => {
    expect(kindLabel('shoutout')).toBe('Shoutout');
    expect(kindLabel('poll')).toBe('Poll');
    expect(kindLabel('qa')).toBe('Q&A');
    expect(kindLabel('sell')).toBe('Buy & Sell');
    expect(kindLabel('lost_found')).toBe('Lost & Found');
    expect(kindLabel('comment')).toBe('Comment');
  });
  it('shows an unknown kind as is, and nothing for none', () => {
    expect(kindLabel('something_new')).toBe('something_new');
    expect(kindLabel(null)).toBeNull();
    expect(kindLabel(undefined)).toBeNull();
    expect(kindLabel('')).toBeNull();
  });
  it('never labels anything "Confession"', () => {
    for (const kind of ['confession', 'shoutout', 'poll', 'qa', 'sell', 'lost_found', 'comment']) {
      expect(kindLabel(kind)).not.toMatch(/confession/i);
    }
  });
  it('names a deleted account', () => {
    expect(authorLabel(null)).toBe('Deleted user');
    expect(authorLabel('kenshin')).toBe('kenshin');
  });
});
