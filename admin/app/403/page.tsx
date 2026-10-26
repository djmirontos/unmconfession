import type { Metadata } from 'next';
import { ShieldX } from 'lucide-react';
import Link from 'next/link';

import { signOut } from '@/app/(auth)/actions';
import { BrandMark } from '@/components/brand/brand-mark';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'No access' };

export default function ForbiddenPage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-8 px-4 py-12">
      <BrandMark />
      <div className="space-y-3">
        <ShieldX className="size-10 text-destructive" aria-hidden="true" />
        <h1 className="text-2xl font-semibold">You do not have access to this page</h1>
        <p className="text-muted-foreground">
          This page is for a different role, or your account is no longer an active moderator or admin. Ask an admin if
          you think this is a mistake.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link href="/">Back to the dashboard</Link>
        </Button>
        <form action={signOut}>
          <Button type="submit">Sign out</Button>
        </form>
      </div>
    </main>
  );
}
