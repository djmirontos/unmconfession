'use client';

import { ErrorState } from '@/components/panel/error-state';

export default function RootError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <ErrorState onRetry={retry} />
    </main>
  );
}
