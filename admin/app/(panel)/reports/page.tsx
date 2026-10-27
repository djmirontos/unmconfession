import type { Metadata } from 'next';
import { CheckCircle2, Info } from 'lucide-react';

import { EmptyState } from '@/components/panel/empty-state';
import { PageHeader } from '@/components/panel/page-header';
import { ReportList } from '@/components/reports/report-list';
import { FilterChips } from '@/components/review/filter-chips';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { requireStaff } from '@/lib/auth';
import { fetchReportsPage } from '@/lib/moderation/data';
import { filterSchema } from '@/lib/review/schemas';

export const metadata: Metadata = { title: 'Reports' };

export default async function ReportsPage({ searchParams }: PageProps<'/reports'>) {
  await requireStaff();
  const params = await searchParams;
  const filter = filterSchema.parse(typeof params.filter === 'string' ? params.filter : undefined);
  const initial = await fetchReportsPage();

  return (
    <>
      <PageHeader title="Reports" description="Items members reported, grouped per item. The oldest first report comes first." />
      {initial.rows.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="No reports to handle" description="Every report has been handled." />
      ) : (
        <div className="space-y-6">
          {params.cleared === '1' ? (
            <Alert>
              <Info />
              <AlertDescription>No more reports of this type.</AlertDescription>
            </Alert>
          ) : null}
          <FilterChips active={filter} basePath="/reports" />
          <ReportList key={filter ?? 'all'} initial={initial} filter={filter} />
        </div>
      )}
    </>
  );
}
