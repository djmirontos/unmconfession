import { NotFoundState } from '@/components/moderation/not-found-state';

export default function UserNotFound() {
  return <NotFoundState title="Account not found" backHref="/users" backLabel="Back to users" />;
}
