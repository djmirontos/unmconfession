import { ListSkeleton } from '@/components/moderation/list-skeleton';

export default function ModerationLogLoading() {
  return <ListSkeleton label="Loading the moderation log" filters />;
}
