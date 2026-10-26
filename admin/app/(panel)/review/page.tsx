import type { Metadata } from 'next';

import { ComingSoon } from '@/components/panel/coming-soon';
import { requireStaff } from '@/lib/auth';

export const metadata: Metadata = { title: 'Review queue' };

export default async function ReviewPage() {
  await requireStaff();
  return <ComingSoon title="Review queue" description="Posts, comments and listings held by the keyword filter or pre-moderation." />;
}
