import type { ReactNode } from 'react';

import { BrandMark } from '@/components/brand/brand-mark';
import { BackNavProvider } from '@/components/panel/back-nav';
import { NavLinks } from '@/components/panel/nav-links';
import { TopBar } from '@/components/panel/top-bar';
import { navFor } from '@/lib/access';
import { requireStaff } from '@/lib/auth';
import { navCounts } from '@/lib/dashboard';

export default async function PanelLayout({ children }: { children: ReactNode }) {
  const staff = await requireStaff();
  const items = navFor(staff.isAdmin);
  const counts = await navCounts();

  return (
    <div className="flex min-h-svh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-4 focus:py-2"
      >
        Skip to content
      </a>
      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar p-4 text-sidebar-foreground lg:flex">
        <BrandMark inverted className="mb-8 px-1" />
        <NavLinks items={items} counts={counts} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {/* The layout stays mounted across panel navigation, so the tracker sees every step. */}
        <BackNavProvider>
          <TopBar staff={staff} items={items} counts={counts} />
        </BackNavProvider>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
