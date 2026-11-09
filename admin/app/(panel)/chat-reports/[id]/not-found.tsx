import { NotFoundState } from '@/components/moderation/not-found-state';

export default function ChatReportNotFound() {
  return <NotFoundState title="Report not found" backHref="/chat-reports" backLabel="Back to chat reports" />;
}
