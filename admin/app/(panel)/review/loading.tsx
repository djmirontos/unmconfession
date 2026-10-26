import { Skeleton } from '@/components/ui/skeleton';

export default function ReviewLoading() {
  return (
    <div aria-busy="true" aria-label="Loading the review queue">
      <div className="mb-8 space-y-2 border-b pb-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="mb-6 flex gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>
      <div className="divide-y rounded-lg border bg-card">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="space-y-3 p-5">
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-40" />
              <Skeleton className="ml-auto h-5 w-28" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
