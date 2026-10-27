import { NotFoundState } from '@/components/moderation/not-found-state';

export default function ContentItemNotFound() {
  return <NotFoundState title="Item not found" backHref="/content" backLabel="Back to content" />;
}
