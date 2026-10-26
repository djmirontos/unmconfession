import Link from 'next/link';

import { listHref } from '@/lib/review/queue';
import type { ContentType } from '@/lib/review/schemas';
import { cn } from '@/lib/utils';

const CHIPS: { label: string; value?: ContentType }[] = [
  { label: 'All' },
  { label: 'Posts', value: 'post' },
  { label: 'Comments', value: 'comment' },
  { label: 'Listings', value: 'listing' },
];

export function FilterChips({ active }: { active?: ContentType }) {
  return (
    <nav aria-label="Filter by type" className="flex flex-wrap gap-2">
      {CHIPS.map((chip) => {
        const selected = chip.value === active;
        return (
          <Link
            key={chip.label}
            href={listHref(chip.value)}
            aria-current={selected ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              selected ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
            )}
          >
            {chip.label}
          </Link>
        );
      })}
    </nav>
  );
}
