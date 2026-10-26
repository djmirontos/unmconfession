import type { Metadata } from 'next';

import { ComingSoon } from '@/components/panel/coming-soon';
import { requireStaff } from '@/lib/auth';

export const metadata: Metadata = { title: 'Reports' };

export default async function ReportsPage() {
  await requireStaff();
  return <ComingSoon title="Reports" description="Items reported by members, grouped per item, oldest first." />;
}
