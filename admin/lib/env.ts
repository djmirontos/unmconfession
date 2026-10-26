import { z } from 'zod';

// Server-only by naming: no NEXT_PUBLIC_ prefix, so Next.js never inlines these into browser code.
const schema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: z.string().min(20),
});

export type ServerEnv = { url: string; anonKey: string };

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse({
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  });
  if (!parsed.success) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set (see admin/.env.example).');
  }
  cached = { url: parsed.data.SUPABASE_URL, anonKey: parsed.data.SUPABASE_ANON_KEY };
  return cached;
}
