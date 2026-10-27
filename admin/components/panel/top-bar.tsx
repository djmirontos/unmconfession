import { LogOut } from 'lucide-react';

import { signOut } from '@/app/(auth)/actions';
import { BackButton } from '@/components/panel/back-nav';
import { MobileNav } from '@/components/panel/mobile-nav';
import type { NavCounts } from '@/components/panel/nav-links';
import { RoleBadge } from '@/components/panel/role-badge';
import { Button } from '@/components/ui/button';
import type { NavItem } from '@/lib/access';
import type { StaffContext } from '@/lib/auth';

export function TopBar({ staff, items, counts }: { staff: StaffContext; items: readonly NavItem[]; counts?: NavCounts }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur sm:px-6">
      <div className="flex shrink-0 items-center gap-1 lg:contents">
        <MobileNav items={items} counts={counts} />
        <BackButton />
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className="truncate font-medium" title={staff.nickname ?? undefined}>
            {staff.nickname ?? 'No nickname'}
          </span>
          <RoleBadge role={staff.role} />
        </div>
        <form action={signOut}>
          <Button type="submit" variant="outline" className="max-sm:size-11 max-sm:px-0">
            <LogOut aria-hidden="true" />
            <span className="max-sm:sr-only">Sign out</span>
          </Button>
        </form>
      </div>
    </header>
  );
}
