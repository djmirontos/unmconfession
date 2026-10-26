'use client';

import {
  ClipboardCheck,
  FileSearch,
  Flag,
  LayoutDashboard,
  type LucideIcon,
  ScrollText,
  ShieldCheck,
  Tags,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { isActive, type NavIcon, type NavItem } from '@/lib/access';
import { cn } from '@/lib/utils';

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  review: ClipboardCheck,
  reports: Flag,
  content: FileSearch,
  users: Users,
  keywords: Tags,
  log: ScrollText,
  audit: ShieldCheck,
};

export function NavLinks({ items, onNavigate }: { items: readonly NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Panel">
      <ul className="space-y-1">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-lg border-l-4 px-3 py-2 text-sm font-medium transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring',
                  active
                    ? 'border-sidebar-primary bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'border-transparent text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
