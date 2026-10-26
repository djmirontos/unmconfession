import type { Metadata } from 'next';
import { Suspense } from 'react';

import { DashboardStats, DashboardStatsSkeleton } from '@/components/dashboard/dashboard-stats';
import { PageHeader } from '@/components/panel/page-header';
import { requireStaff } from '@/lib/auth';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const staff = await requireStaff();
  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Welcome${staff.nickname ? `, ${staff.nickname}` : ''}. What needs attention right now.`}
      />
      <Suspense fallback={<DashboardStatsSkeleton />}>
        <DashboardStats />
      </Suspense>
    </>
  );
}
