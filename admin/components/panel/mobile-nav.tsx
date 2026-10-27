'use client';

import { Menu } from 'lucide-react';
import { useState } from 'react';

import { BrandMark } from '@/components/brand/brand-mark';
import { type NavCounts, NavLinks } from '@/components/panel/nav-links';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import type { NavItem } from '@/lib/access';

/** Below the lg breakpoint the sidebar opens as a sheet. */
export function MobileNav({ items, counts }: { items: readonly NavItem[]; counts?: NavCounts }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-lg" className="lg:hidden" aria-label="Open menu">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar p-4 text-sidebar-foreground">
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <SheetDescription className="sr-only">Panel sections</SheetDescription>
        <BrandMark inverted className="mb-6 px-1" />
        <NavLinks items={items} counts={counts} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
