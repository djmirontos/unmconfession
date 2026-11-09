import type { Metadata } from 'next';
import { Lock } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ChatReportView } from '@/components/chat-reports/chat-report-view';
import { EmptyState } from '@/components/panel/empty-state';
import { Button } from '@/components/ui/button';
import { requireStaff } from '@/lib/auth';
import { formatExact } from '@/lib/format';
import { fetchChatReport } from '@/lib/moderation/chat-report-data';
import { buildTranscript, chatReportIdSchema } from '@/lib/moderation/chat-reports';
import { fetchUser } from '@/lib/moderation/data';
import { disciplineActions } from '@/lib/moderation/warnings';
import { requestNow } from '@/lib/request-time';

// A static title: generateMetadata would be a second (audit-logged) open of the report.
export const metadata: Metadata = { title: 'Chat report' };

/**
 * One chat report and its evidence. Exactly one mod_get_chat_report call per navigation (the
 * database writes it to the audit log); the actions on this page never re-render it.
 */
export default async function ChatReportPage({ params }: PageProps<'/chat-reports/[id]'>) {
  const staff = await requireStaff();
  const id = chatReportIdSchema.safeParse((await params).id);
  if (!id.success) notFound();

  const result = await fetchChatReport(id.data);
  if (result.kind === 'not_found') notFound();
  if (result.kind === 'restricted') {
    return (
      <EmptyState icon={Lock} title="This report is restricted to admins." description="Only admins can open it.">
        <Button asChild variant="outline">
          <Link href="/chat-reports">Back to chat reports</Link>
        </Button>
      </EmptyState>
    );
  }

  const report = result.report;
  // The member row (not audit-logged) decides the same warn/mute rules as the member page.
  const member = report.reportedId ? await fetchUser(report.reportedId).catch(() => null) : null;
  const now = requestNow();
  const viewer = { id: staff.userId, isAdmin: staff.isAdmin };
  const discipline =
    member && !member.deleted
      ? disciplineActions(
          viewer,
          { id: member.id, role: member.role, status: member.status, suspendedUntil: member.suspendedUntil, deleted: member.deleted },
          now,
        )
      : { warn: false, mute: false, muteBlocked: false };
  const transcript = buildTranscript(report.snapshot, { reporter: report.reporterNickname, reported: report.reportedNickname });

  return (
    <ChatReportView
      report={{ ...report, snapshot: undefined }}
      lines={transcript?.map((l) => ({ ...l, atExact: formatExact(l.at) })) ?? null}
      member={member && !member.deleted ? { id: member.id, nickname: member.nickname } : null}
      discipline={discipline}
      isAdmin={staff.isAdmin}
    />
  );
}
