import type { QueryClient } from '@tanstack/react-query';

import { invalidateNotifications } from '@/lib/notifications';

// Every cached list or item that shows an author's nickname or avatar. The server joins
// them in on read, so after a block, a rename or a new avatar these refetch and the
// server result takes over.
const AUTHORED_LISTS = [
  ['feed'],
  ['post'],
  ['listing'],
  ['listings'],
  ['comments'],
  ['replies'],
  ['trending'],
  ['polls'],
  ['my-posts'],
] as const;

export function invalidateAuthoredLists(queryClient: QueryClient): void {
  for (const queryKey of AUTHORED_LISTS) void queryClient.invalidateQueries({ queryKey });
  // Notices carry the actor's name and avatar (and hide blocked members); list and badge refetch too.
  invalidateNotifications(queryClient);
}
