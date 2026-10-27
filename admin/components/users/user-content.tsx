import { FileText, TriangleAlert } from 'lucide-react';

import { ContentList } from '@/components/content/content-list';
import { SelectFilter } from '@/components/moderation/url-filters';
import { EmptyState } from '@/components/panel/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { type ContentFilters, fetchContentPage } from '@/lib/moderation/data';

const TYPE_OPTIONS = [
  { value: 'post', label: 'Posts' },
  { value: 'comment', label: 'Comments' },
  { value: 'listing', label: 'Listings' },
];
const STATUS_OPTIONS = [
  { value: 'published', label: 'Published' },
  { value: 'pending', label: 'Pending review' },
  { value: 'removed', label: 'Removed' },
  { value: 'rejected', label: 'Rejected' },
];

/** Rows only (the card and filters are already on screen). */
export function UserContentSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading this user's content" className="divide-y rounded-lg border bg-card">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="space-y-3 p-5">
          <div className="flex gap-2">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-24" />
          </div>
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  );
}

/** The type and status filters live in the user page URL, like the Content page. */
export function UserContentFilters() {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-40">
        <SelectFilter name="type" label="Type" options={TYPE_OPTIONS} />
      </div>
      <div className="w-44">
        <SelectFilter name="status" label="Status" options={STATUS_OPTIONS} />
      </div>
    </div>
  );
}

/** One user's posts, comments and listings (any status), newest first, with "Load more". Works for deleted accounts too. */
export async function UserContent({ filters }: { filters: ContentFilters & { author: string } }) {
  let initial;
  try {
    initial = await fetchContentPage(filters);
  } catch {
    return (
      <EmptyState
        icon={TriangleAlert}
        title="Could not load this user's content"
        description="Check your connection, then reload the page."
      />
    );
  }

  if (initial.rows.length === 0) {
    const filtered = Boolean(filters.type || filters.status);
    return (
      <EmptyState
        icon={FileText}
        title={filtered ? 'Nothing matches these filters' : 'This user has no content'}
        description={filtered ? 'Try another type or status.' : 'Posts, comments and listings by this account show up here.'}
      />
    );
  }

  return <ContentList key={JSON.stringify(filters)} initial={initial} filters={filters} />;
}
