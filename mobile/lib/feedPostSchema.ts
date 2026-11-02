// The feed_posts row schema. Pure (no React Native), so tests/answers.test.mjs can parse rows in Node.
import { z } from 'zod';

import { POST_TYPES } from '@/lib/answers';
import { parseTopReactions } from '@/lib/reactionTypes';
import { Constants } from '@/types/database';

export const imageSchema = z.object({
  path: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
  blurhash: z.string().nullish(),
});

export const pollOptionSchema = z.object({ id: z.string(), label: z.string(), votes: z.number() });

// Views make every column nullable in the generated types; this narrows a
// feed_posts row to what a published post always has.
export const feedPostSchema = z.object({
  id: z.string(),
  number: z.number().nullable(),
  kind: z.enum(Constants.public.Enums.post_kind),
  body: z.string(),
  target_name: z.string().nullable(),
  images: z.array(imageSchema).catch([]),
  ends_at: z.string().nullable(),
  author_id: z.string(),
  nickname: z.string().nullable(),
  avatar_key: z.string().nullable(),
  published_at: z.string(),
  reaction_count: z.number(),
  comment_count: z.number(),
  my_reaction: z.enum(Constants.public.Enums.reaction_type).nullable(),
  poll_options: z.array(pollOptionSchema).nullable().catch(null),
  my_vote: z.string().nullable(),
  // Missing on rows cached before the column existed.
  edited_at: z.string().nullable().catch(null),
  // Most used first; missing on rows cached before 4.6a+, unknown types dropped.
  top_reactions: z.unknown().transform(parseTopReactions),
  // v1.0.3 (Q&A): missing before the column existed, so a normal post with no answers.
  post_type: z.enum(POST_TYPES).catch('post'),
  answer_count: z.number().int().min(0).catch(0),
}).transform(({ post_type, answer_count, ...row }) => ({ ...row, postType: post_type, answerCount: answer_count }));
