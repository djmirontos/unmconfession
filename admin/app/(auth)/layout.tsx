import type { ReactNode } from 'react';

import { BrandMark } from '@/components/brand/brand-mark';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <div className="h-1.5 bg-navy" aria-hidden="true">
        <div className="h-full w-24 bg-gold" />
      </div>
      <main className="flex flex-1 items-start justify-center px-4 py-12 sm:items-center">
        <div className="w-full max-w-md space-y-8">
          <BrandMark />
          {children}
          <p className="text-xs text-muted-foreground">
            Authorised moderators and administrators only. Every identity lookup and admin action is recorded.
          </p>
        </div>
      </main>
    </div>
  );
}
