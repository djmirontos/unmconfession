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

export type NavCounts = Partial<Record<NavIcon, number>>;

export function NavLinks({
  items,
  counts = {},
  onNavigate,
}: {
  items: readonly NavItem[];
  counts?: NavCounts;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label="Panel">
      <ul className="space-y-1">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(pathname, item.href);
          const count = counts[item.icon] ?? 0;
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
                {count > 0 ? (
                  <span className="ml-auto rounded-full bg-sidebar-primary px-2 py-0.5 text-xs font-semibold tabular-nums text-sidebar-primary-foreground">
                    {count > 99 ? '99+' : count}
                    <span className="sr-only"> waiting</span>
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
