import { FileQuestion } from 'lucide-react';
import Link from 'next/link';

import { EmptyState } from '@/components/panel/empty-state';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <EmptyState icon={FileQuestion} title="Page not found" description="This page does not exist or has moved.">
        <Button asChild>
          <Link href="/">Go to the dashboard</Link>
        </Button>
      </EmptyState>
    </main>
  );
}
