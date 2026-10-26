'use client';

import { TriangleAlert } from 'lucide-react';

import { EmptyState } from '@/components/panel/empty-state';
import { Button } from '@/components/ui/button';

/** Shown by error.tsx boundaries. In production Next.js hides server error details, so the text stays generic. */
export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      icon={TriangleAlert}
      title="This page could not be loaded"
      description="Something went wrong while loading. Check your connection and try again."
    >
      <Button onClick={onRetry}>Try again</Button>
    </EmptyState>
  );
}
