'use client';

import { Button } from '@/components/ui/button';

export function LoadMore({ hasMore, pending, onClick }: { hasMore: boolean; pending: boolean; onClick: () => void }) {
  if (!hasMore) return null;
  return (
    <div className="flex justify-center">
      <Button variant="outline" onClick={onClick} disabled={pending} aria-busy={pending}>
        {pending ? 'Loading…' : 'Load more'}
      </Button>
    </div>
  );
}
