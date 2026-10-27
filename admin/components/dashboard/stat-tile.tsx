import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Without an href (no page filters exactly these items) the tile is plain text. */
type Props = { label: string; value: number; href: string | null; highlight?: boolean; hint?: string };

const format = new Intl.NumberFormat('en');

/** One number on the dashboard; the whole tile (at least 44 px tall) links to the page that handles it. */
export function StatTile({ label, value, href, highlight = false, hint }: Props) {
  const box = cn('flex flex-col justify-between gap-3 rounded-lg border bg-card p-5 shadow-xs', highlight && value > 0 && 'border-l-4 border-l-gold');
  const body = (
    <>
      <span className="flex items-center justify-between text-sm font-medium text-muted-foreground">
        {label}
        {href ? <ChevronRight className="size-4 opacity-60 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /> : null}
      </span>
      <span className="text-3xl font-semibold tabular-nums">{format.format(value)}</span>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </>
  );
  if (!href) return <div className={box}>{body}</div>;
  return (
    <Link
      href={href}
      className={cn(
        box,
        'group transition-shadow hover:shadow-md',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
      )}
    >
      {body}
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
