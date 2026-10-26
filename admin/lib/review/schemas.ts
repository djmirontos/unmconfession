import { z } from 'zod';

import { REJECT_REASON_VALUES } from '@/lib/review/reasons';

export const CONTENT_TYPES = ['post', 'comment', 'listing'] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const BODY_MAX = { post: 2000, comment: 1000 } as const;
export const NOTE_MAX = 500;
export const EDIT_REASON_MAX = 200;

export const contentTypeSchema = z.enum(CONTENT_TYPES);

export const targetSchema = z.object({
  type: contentTypeSchema,
  id: z.uuid(),
});
export type Target = z.infer<typeof targetSchema>;

// The queue's created_at, used only as a cursor (passed back unchanged to keep microseconds).
export const cursorSchema = z.iso.datetime({ offset: true });

export const rejectSchema = targetSchema.extend({
  reason: z.enum(REJECT_REASON_VALUES),
  note: z.string().trim().max(NOTE_MAX).optional(),
});

export const editSchema = z
  .object({
    type: z.enum(['post', 'comment']),
    id: z.uuid(),
    body: z.string().trim().min(1),
    reason: z.string().trim().min(1).max(EDIT_REASON_MAX),
  })
  .refine((v) => v.body.length <= BODY_MAX[v.type], { path: ['body'], message: 'too_long' });

export const filterSchema = contentTypeSchema.optional().catch(undefined);
