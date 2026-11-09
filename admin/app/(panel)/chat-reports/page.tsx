import type { Metadata } from 'next';
import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

import { ChatReportList } from '@/components/chat-reports/chat-report-list';
import { RefreshOnce } from '@/components/chat-reports/refresh-once';
import { EmptyState } from '@/components/panel/empty-state';
import { PageHeader } from '@/components/panel/page-header';
import { requireStaff } from '@/lib/auth';
import { fetchChatReportsPage } from '@/lib/moderation/chat-report-data';
import { CHAT_REPORT_STATUS_LABELS, CHAT_REPORT_STATUSES, chatReportStatusSchema } from '@/lib/moderation/chat-reports';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Chat reports' };

const listHref = (status: string) => (status === 'open' ? '/chat-reports' : `/chat-reports?status=${status}`);

/** Chat reports by status, oldest first. The list never opens a report (that is audit-logged). */
export default async function ChatReportsPage({ searchParams }: PageProps<'/chat-reports'>) {
  const staff = await requireStaff();
  const params = await searchParams;
  const status = chatReportStatusSchema.parse(typeof params.status === 'string' ? params.status : undefined);
  const initial = await fetchChatReportsPage(status);

  return (
    <>
      <PageHeader title="Chat reports" description="Reports members made about private chats. Opening a report is recorded in the audit log." />
      {params.updated === '1' ? <RefreshOnce cleanHref={listHref(status)} /> : null}
      <div className="space-y-6">
        <nav aria-label="Report status" className="flex flex-wrap gap-2">
          {CHAT_REPORT_STATUSES.map((s) => (
            <Link
              key={s}
              href={listHref(s)}
              aria-current={s === status ? 'page' : undefined}
              className={cn(
                'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                'max-md:inline-flex max-md:min-h-11 max-md:items-center max-md:px-4',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                s === status ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
              )}
            >
              {CHAT_REPORT_STATUS_LABELS[s]}
            </Link>
          ))}
        </nav>
        {initial.rows.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title={status === 'open' ? 'No chat reports to handle' : `No ${CHAT_REPORT_STATUS_LABELS[status].toLowerCase()} chat reports`}
            description={status === 'open' ? 'Every chat report has been handled.' : 'Nothing here yet.'}
          />
        ) : (
          <ChatReportList key={status} initial={initial} status={status} isAdmin={staff.isAdmin} />
        )}
      </div>
    </>
  );
}
