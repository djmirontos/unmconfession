import { Construction } from 'lucide-react';

import { EmptyState } from '@/components/panel/empty-state';
import { PageHeader } from '@/components/panel/page-header';

/** Placeholder for sections built in modules 7c to 7f. No sample data. */
export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <EmptyState
        icon={Construction}
        title="Coming in the next step"
        description="This section is not built yet. Access to it is already checked on the server."
      />
    </>
  );
}
