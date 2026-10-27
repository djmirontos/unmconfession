import type { Metadata } from 'next';
import { UserX } from 'lucide-react';

import { SearchBox, SelectFilter, ToggleFilter } from '@/components/moderation/url-filters';
import { EmptyState } from '@/components/panel/empty-state';
import { PageHeader } from '@/components/panel/page-header';
import { EmailLookup } from '@/components/users/email-lookup';
import { UserList } from '@/components/users/user-list';
import { requireStaff } from '@/lib/auth';
import { fetchUsersPage } from '@/lib/moderation/data';
import { userFiltersSchema } from '@/lib/moderation/schemas';
import { requestNow } from '@/lib/request-time';

export const metadata: Metadata = { title: 'Users' };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function UsersPage({ searchParams }: PageProps<'/users'>) {
  const staff = await requireStaff();
  const params = await searchParams;
  const filters = userFiltersSchema.parse({
    q: one(params.q) || undefined,
    status: one(params.status),
    role: one(params.role),
    deleted: one(params.deleted),
  });
  const initial = await fetchUsersPage(filters);
  const now = requestNow();

  return (
    <>
      <PageHeader title="Users" description="Find members by nickname. Email is never shown in lists." />
      <div className="space-y-6">
        {staff.isAdmin ? <EmailLookup /> : null}
        <div className="flex flex-wrap items-end gap-3">
          <SearchBox label="Nickname" placeholder="Part of a nickname" />
          <div className="w-40">
            <SelectFilter
              name="status"
              label="Status"
              options={[
                { value: 'active', label: 'Active' },
                { value: 'suspended', label: 'Suspended' },
                { value: 'banned', label: 'Banned' },
              ]}
            />
          </div>
          <div className="w-40">
            <SelectFilter
              name="role"
              label="Role"
              options={[
                { value: 'user', label: 'User' },
                { value: 'moderator', label: 'Moderator' },
                { value: 'admin', label: 'Admin' },
              ]}
            />
          </div>
          <ToggleFilter name="deleted" label="Show deleted accounts" />
        </div>
        {initial.rows.length === 0 ? (
          <EmptyState icon={UserX} title="No users match" description="Try another nickname or clear the filters." />
        ) : (
          <UserList key={JSON.stringify(filters)} initial={initial} filters={filters} now={now} />
        )}
      </div>
    </>
  );
}
