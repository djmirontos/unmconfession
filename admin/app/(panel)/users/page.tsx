import type { Metadata } from 'next';

import { ComingSoon } from '@/components/panel/coming-soon';
import { requireStaff } from '@/lib/auth';

export const metadata: Metadata = { title: 'Users' };

export default async function UsersPage() {
  await requireStaff();
  return <ComingSoon title="Users" description="Find members by nickname, then suspend, ban or restore them." />;
}
