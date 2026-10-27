import { ListSkeleton } from '@/components/moderation/list-skeleton';

export default function UsersLoading() {
  return <ListSkeleton label="Loading users" filters />;
}
