import type { Metadata } from 'next';

import { ComingSoon } from '@/components/panel/coming-soon';
import { requireStaff } from '@/lib/auth';

export const metadata: Metadata = { title: 'Keywords' };

export default async function KeywordsPage() {
  await requireStaff();
  return <ComingSoon title="Keywords" description="Words that hold a post for review, and words refused in nicknames." />;
}
