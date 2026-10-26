import type { Metadata } from 'next';

import { ComingSoon } from '@/components/panel/coming-soon';
import { requireAdmin } from '@/lib/auth';

export const metadata: Metadata = { title: 'Audit log' };

export default async function AuditLogPage() {
  await requireAdmin();
  return <ComingSoon title="Audit log" description="Admin identity lookups and admin-only actions. Admins only." />;
}
