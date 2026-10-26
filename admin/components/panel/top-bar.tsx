import { LogOut } from 'lucide-react';

import { signOut } from '@/app/(auth)/actions';
import { MobileNav } from '@/components/panel/mobile-nav';
import { RoleBadge } from '@/components/panel/role-badge';
import { Button } from '@/components/ui/button';
import type { NavItem } from '@/lib/access';
import type { StaffContext } from '@/lib/auth';

export function TopBar({ staff, items }: { staff: StaffContext; items: readonly NavItem[] }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur sm:px-6">
      <MobileNav items={items} />
      <div className="ml-auto flex items-center gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className="truncate font-medium" title={staff.nickname ?? undefined}>
            {staff.nickname ?? 'No nickname'}
          </span>
          <RoleBadge role={staff.role} />
        </div>
        <form action={signOut}>
          <Button type="submit" variant="outline">
            <LogOut aria-hidden="true" />
            Sign out
          </Button>
        </form>
      </div>
    </header>
  );
}
