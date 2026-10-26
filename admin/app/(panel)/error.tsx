'use client';

import { ErrorState } from '@/components/panel/error-state';

export default function PanelError({ retry }: { error: unknown; retry: () => void }) {
  return <ErrorState onRetry={retry} />;
}
