import type { Metadata } from 'next';
import { ShieldCheck, TriangleAlert } from 'lucide-react';
import { unstable_rethrow } from 'next/navigation';

import { AuditList } from '@/components/audit/audit-list';
import { EmptyState } from '@/components/panel/empty-state';
import { PageHeader } from '@/components/panel/page-header';
import { requireAdmin } from '@/lib/auth';
import { type AuditRow, fetchAudit, type Page } from '@/lib/moderation/data';

export const metadata: Metadata = { title: 'Audit log' };

export default async function AuditLogPage() {
  // Moderators are redirected to /403 (and admin_get_audit refuses them as well).
  await requireAdmin();

  let initial: Page<AuditRow> | null = null;
  try {
    initial = await fetchAudit();
  } catch (e) {
    unstable_rethrow(e);
    initial = null;
  }

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Identity lookups, email searches, role changes and account deletions by admins, newest first. Searched email addresses are never stored."
      />
      {initial === null ? (
        <EmptyState icon={TriangleAlert} title="Could not load the audit log" description="Check your connection, then reload the page." />
      ) : initial.rows.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No entries yet" description="Admin lookups and admin-only actions appear here." />
      ) : (
        <AuditList initial={initial} />
      )}
    </>
  );
}
