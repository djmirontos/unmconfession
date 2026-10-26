import { FileQuestion } from 'lucide-react';
import Link from 'next/link';

import { EmptyState } from '@/components/panel/empty-state';
import { Button } from '@/components/ui/button';

export default function ReviewItemNotFound() {
  return (
    <EmptyState icon={FileQuestion} title="Item not found" description="This item does not exist or the link is wrong.">
      <Button asChild>
        <Link href="/review">Back to the queue</Link>
      </Button>
    </EmptyState>
  );
}
