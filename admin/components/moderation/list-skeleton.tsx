import { Skeleton } from '@/components/ui/skeleton';

/** Loading state for the list pages (header, optional chips or filters, rows). */
export function ListSkeleton({ label, chips = false, filters = false }: { label: string; chips?: boolean; filters?: boolean }) {
  return (
    <div aria-busy="true" aria-label={label}>
      <div className="mb-8 space-y-2 border-b pb-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      {chips ? (
        <div className="mb-6 flex gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-full" />
          ))}
        </div>
      ) : null}
      {filters ? (
        <div className="mb-6 flex flex-wrap gap-3">
          <Skeleton className="h-14 min-w-56 flex-1" />
          <Skeleton className="h-14 w-36" />
          <Skeleton className="h-14 w-36" />
        </div>
      ) : null}
      <div className="divide-y rounded-lg border bg-card">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="space-y-3 p-5">
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-40" />
              <Skeleton className="ml-auto h-5 w-20" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
