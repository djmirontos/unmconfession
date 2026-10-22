import { z } from 'zod';

// Mirrors public._validate_nickname for instant feedback; the DB stays authoritative.
const NICKNAME_FORMAT = /^[A-Za-z0-9_.]{3,20}$/;
const NICKNAME_RESERVED =
  /^(admin|administrator|moderator|mod|staff|official|support|system|anonymous|anon|unm)[_.]?[0-9]*$/;

export const nicknameSchema = z
  .string()
  .trim()
  .min(3, 'At least 3 characters.')
  .max(20, 'At most 20 characters.')
  .regex(NICKNAME_FORMAT, 'Only letters, numbers, underscore and dot.')
  .refine((v) => !NICKNAME_RESERVED.test(v.toLowerCase()), 'That nickname is reserved.');

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.'));

export const passwordSchema = z
  .string()
  .min(8, 'At least 8 characters.')
  .max(72, 'At most 72 characters.')
  .regex(/[A-Za-z]/, 'Include at least one letter.')
  .regex(/[0-9]/, 'Include at least one number.');

export const otpSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{6}$/, 'Enter the 6-digit code from your email.');

export const signUpSchema = z.object({
  email: emailSchema,
  nickname: nicknameSchema,
  password: passwordSchema,
  acceptedTerms: z.literal(true, { error: 'You need to accept the Terms and Privacy Policy.' }),
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.'),
});

export const emailOnlySchema = z.object({ email: emailSchema });

export const verifyOtpSchema = z.object({ token: otpSchema });

export const nicknameFormSchema = z.object({ nickname: nicknameSchema });

export const resetPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match.', path: ['confirm'] });

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

/** Validates form values; returns parsed data or the first error per field. */
export function validate<S extends z.ZodType<Record<string, unknown>>>(
  schema: S,
  values: { [K in keyof z.input<S>]: unknown },
): { data: z.output<S>; errors: null } | { data: null; errors: FieldErrors<z.input<S>> } {
  const result = schema.safeParse(values);
  if (result.success) return { data: result.data, errors: null };
  const errors: FieldErrors<z.input<S>> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof z.input<S> | undefined;
    if (key !== undefined && errors[key] === undefined) errors[key] = issue.message;
  }
  return { data: null, errors };
}
