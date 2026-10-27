import { NotFoundState } from '@/components/moderation/not-found-state';

export default function ReportItemNotFound() {
  return <NotFoundState title="Item not found" backHref="/reports" backLabel="Back to reports" />;
}
