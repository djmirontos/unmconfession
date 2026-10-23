import { z } from 'zod';

import { lostFoundDateRange } from '@/lib/manilaDate';

// Mirrors create_post / create_listing. The database re-validates everything.
export const LIMITS = {
  body: 2000,
  target: 80,
  pollQuestionMin: 3,
  pollQuestion: 280,
  pollOption: 80,
  pollOptionsMin: 2,
  pollOptionsMax: 6,
  title: 100,
  description: 2000,
  location: 100,
  priceMax: 9_999_999,
  photos: 3,
} as const;

export const CONDITIONS = ['new', 'like_new', 'good', 'fair', 'poor'] as const;
export type Condition = (typeof CONDITIONS)[number];

export const POLL_DURATIONS = [
  { label: '1 hour', hours: 1 },
  { label: '6 hours', hours: 6 },
  { label: '1 day', hours: 24 },
  { label: '3 days', hours: 72 },
  { label: '7 days', hours: 168 },
] as const;
export const DEFAULT_POLL_HOURS = 24;

const trimmed = (max: number, message: string, min = 1) =>
  z.string().trim().min(min, message).max(max, `At most ${max} characters.`);

export const confessionSchema = z.object({
  body: trimmed(LIMITS.body, 'Write something first.'),
});

export const shoutoutSchema = z.object({
  target: trimmed(LIMITS.target, 'Who is this for?'),
  body: trimmed(LIMITS.body, 'Write your shoutout.'),
});

export const pollSchema = z.object({
  question: trimmed(LIMITS.pollQuestion, `At least ${LIMITS.pollQuestionMin} characters.`, LIMITS.pollQuestionMin),
  options: z
    .array(z.string().trim())
    .transform((opts) => opts.filter((o) => o.length > 0))
    .pipe(
      z
        .array(z.string().max(LIMITS.pollOption, `Choices are at most ${LIMITS.pollOption} characters.`))
        .min(LIMITS.pollOptionsMin, 'Add at least 2 choices.')
        .max(LIMITS.pollOptionsMax, 'At most 6 choices.')
        .refine((opts) => new Set(opts.map((o) => o.toLowerCase())).size === opts.length, 'Choices must be different.'),
    ),
  hours: z.number().int().min(1).max(24 * 30),
});

/** "1,250.50" or "1250" -> 1250.5. Empty or invalid -> NaN, caught by the schema. */
export function parsePrice(text: string): number {
  const clean = text.replace(/[,\s₱]/g, '');
  return /^\d+(\.\d{1,2})?$/.test(clean) ? Number(clean) : Number.NaN;
}

export const sellSchema = z.object({
  title: trimmed(LIMITS.title, 'Add a title.'),
  description: z.string().trim().max(LIMITS.description, `At most ${LIMITS.description} characters.`),
  price: z
    .string()
    .transform(parsePrice)
    .pipe(
      z
        .number({ error: 'Enter a price, e.g. 250.' })
        .min(0, 'Enter a price, e.g. 250.')
        .max(LIMITS.priceMax, 'At most ₱9,999,999.'),
    ),
  condition: z.enum(CONDITIONS, { error: 'Pick the condition.' }),
});

export const LOST_FOUND_TYPES = ['lost', 'found'] as const;
export type LostFoundType = (typeof LOST_FOUND_TYPES)[number];
export const LOST_FOUND_TYPE_REQUIRED = 'Choose whether you lost or found something.';

export const lostFoundSchema = z.object({
  lostFoundType: z.enum(LOST_FOUND_TYPES, { error: LOST_FOUND_TYPE_REQUIRED }),
  title: trimmed(LIMITS.title, 'Add what was lost or found.'),
  description: z.string().trim().max(LIMITS.description, `At most ${LIMITS.description} characters.`),
  location: trimmed(LIMITS.location, 'Add where.'),
  eventDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick the date.')
    .refine((d) => {
      const { min, max } = lostFoundDateRange();
      return d >= min && d <= max;
    }, 'Choose a date from the last 60 days, up to today.'),
});
