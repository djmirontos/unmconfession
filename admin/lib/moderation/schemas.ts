import { z } from 'zod';

import { REJECT_REASON_VALUES } from '@/lib/review/reasons';
import { contentTypeSchema, NOTE_MAX, targetSchema } from '@/lib/review/schemas';

export const STATUS_REASON_MIN = 3;
export const STATUS_REASON_MAX = 300;
export const DELETE_REASON_MAX = 300;
export const NICKNAME_PATTERN = /^[A-Za-z0-9_.]{3,20}$/;

export const CONTENT_STATUSES = ['published', 'pending', 'removed', 'rejected'] as const;
export const ACCOUNT_STATUSES = ['active', 'suspended', 'banned'] as const;
export const ROLES = ['user', 'moderator', 'admin'] as const;

/** Keyset cursor for the (timestamp, id) ordered RPCs. */
export const keysetCursorSchema = z.object({ ts: z.iso.datetime({ offset: true }), id: z.uuid() });
export type KeysetCursor = z.infer<typeof keysetCursorSchema>;

// Remove a published item (reports and content pages): same reason list as reject.
export const removeSchema = targetSchema.extend({
  reason: z.enum(REJECT_REASON_VALUES),
  note: z.string().trim().max(NOTE_MAX).optional(),
});

export const resolveSchema = targetSchema.extend({ status: z.enum(['actioned', 'dismissed']) });

// URL filters (bad values fall back to "all").
export const contentFiltersSchema = z.object({
  type: contentTypeSchema.optional().catch(undefined),
  status: z.enum(CONTENT_STATUSES).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
});

export const userFiltersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum(ACCOUNT_STATUSES).optional().catch(undefined),
  role: z.enum(ROLES).optional().catch(undefined),
  deleted: z
    .enum(['1'])
    .optional()
    .catch(undefined)
    .transform((v) => v === '1'),
});

/** The parsed filters as the list sends them back with "Load more" (deleted is already a boolean). */
export const userFiltersValueSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(ACCOUNT_STATUSES).optional(),
  role: z.enum(ROLES).optional(),
  deleted: z.boolean(),
});

export const userIdSchema = z.uuid();

const statusReason = z.string().trim().min(STATUS_REASON_MIN).max(STATUS_REASON_MAX);

export const suspendSchema = z.object({
  user: z.uuid(),
  until: z.iso.datetime({ offset: true }),
  reason: statusReason,
});

export const banSchema = z.object({ user: z.uuid(), reason: statusReason });

export const restoreUserSchema = z.object({
  user: z.uuid(),
  reason: z.string().trim().max(STATUS_REASON_MAX).optional(),
});

export const roleSchema = z.object({ user: z.uuid(), role: z.enum(ROLES) });

export const nicknameSchema = z.object({
  user: z.uuid(),
  nickname: z.string().trim().regex(NICKNAME_PATTERN),
});

export const deleteAccountSchema = z.object({
  user: z.uuid(),
  reason: z.string().trim().min(1).max(DELETE_REASON_MAX),
  confirm: z.string().trim().min(1).max(40),
});

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const historyQuerySchema = z.union([
  z.object({ kind: z.literal('target'), type: contentTypeSchema, id: z.uuid(), cursor: keysetCursorSchema }),
  z.object({ kind: z.literal('user'), user: z.uuid(), cursor: keysetCursorSchema }),
]);
