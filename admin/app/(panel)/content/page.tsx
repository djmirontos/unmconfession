import type { Metadata } from 'next';

import { ComingSoon } from '@/components/panel/coming-soon';
import { requireStaff } from '@/lib/auth';

export const metadata: Metadata = { title: 'Content' };

export default async function ContentPage() {
  await requireStaff();
  return <ComingSoon title="Content" description="Browse and search posts, comments and listings to remove or restore them." />;
}
