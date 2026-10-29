import Link from 'next/link';

import type { ReportTargetType } from '@/lib/review/schemas';
import { cn } from '@/lib/utils';

const CHIPS: { label: string; value?: ReportTargetType }[] = [
  { label: 'All' },
  { label: 'Posts', value: 'post' },
  { label: 'Comments', value: 'comment' },
  { label: 'Listings', value: 'listing' },
];
const PROFILES_CHIP: { label: string; value: ReportTargetType } = { label: 'Profiles', value: 'profile' };

/** Type chips for a list page (`?filter=`). The reports list adds Profiles. */
export function FilterChips({
  active,
  basePath = '/review',
  withProfiles = false,
}: {
  active?: ReportTargetType;
  basePath?: string;
  withProfiles?: boolean;
}) {
  return (
    <nav aria-label="Filter by type" className="flex flex-wrap gap-2">
      {(withProfiles ? [...CHIPS, PROFILES_CHIP] : CHIPS).map((chip) => {
        const selected = chip.value === active;
        return (
          <Link
            key={chip.label}
            href={chip.value ? `${basePath}?filter=${chip.value}` : basePath}
            aria-current={selected ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
              // Phones: 44 px tall tap target.
              'max-md:inline-flex max-md:min-h-11 max-md:items-center max-md:px-4',
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
