import type { Metadata } from 'next';

import { ComingSoon } from '@/components/panel/coming-soon';
import { requireStaff } from '@/lib/auth';

export const metadata: Metadata = { title: 'Moderation log' };

export default async function ModerationLogPage() {
  await requireStaff();
  return <ComingSoon title="Moderation log" description="Every approval, rejection, removal and account action, newest first." />;
}
