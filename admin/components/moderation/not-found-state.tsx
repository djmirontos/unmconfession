import { FileQuestion } from 'lucide-react';
import Link from 'next/link';

import { EmptyState } from '@/components/panel/empty-state';
import { Button } from '@/components/ui/button';

export function NotFoundState({ title, backHref, backLabel }: { title: string; backHref: string; backLabel: string }) {
  return (
    <EmptyState icon={FileQuestion} title={title} description="It does not exist or the link is wrong.">
      <Button asChild>
        <Link href={backHref}>{backLabel}</Link>
      </Button>
    </EmptyState>
  );
}
