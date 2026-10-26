import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type Props = { label: string; value: number; href: string; highlight?: boolean; hint?: string };

const format = new Intl.NumberFormat('en');

/** One number on the dashboard; the whole tile links to the page that handles it. */
export function StatTile({ label, value, href, highlight = false, hint }: Props) {
  return (
    <Link
      href={href}
      className={cn(
        'group flex flex-col justify-between gap-3 rounded-lg border bg-card p-5 shadow-xs transition-shadow hover:shadow-md',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        highlight && value > 0 && 'border-l-4 border-l-gold',
      )}
    >
      <span className="flex items-center justify-between text-sm font-medium text-muted-foreground">
        {label}
        <ChevronRight className="size-4 opacity-60 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
      <span className="text-3xl font-semibold tabular-nums">{format.format(value)}</span>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </Link>
  );
}

export function StatTileSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-5">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-9 w-16" />
    </div>
  );
}
