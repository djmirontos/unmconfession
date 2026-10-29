'use client';

import Link from 'next/link';

import { loadMoreUsers } from '@/app/(panel)/users/actions';
import { LoadMore } from '@/components/moderation/load-more';
import { AccountStatusBadge } from '@/components/moderation/status-badges';
import { useKeyset } from '@/components/moderation/use-keyset';
import { UserAvatar } from '@/components/moderation/user-avatar';
import { RoleBadge } from '@/components/panel/role-badge';
import type { Page, UserFilters, UserRow } from '@/lib/moderation/data';

/** Accounts, newest first. Rows render as cards, which also works on small screens. */
export function UserList({ initial, filters, now }: { initial: Page<UserRow>; filters: UserFilters; now: number }) {
  const { rows, hasMore, pending, loadMore } = useKeyset(initial, (cursor) => loadMoreUsers({ filters, cursor }), (r) => r.id);

  return (
    <div className="space-y-4">
      <ul className="divide-y overflow-hidden rounded-lg border bg-card shadow-xs" aria-label="Accounts">
        {rows.map((u) => (
          <li key={u.id}>
            <Link
              href={`/users/${u.id}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:px-5"
            >
              <UserAvatar nickname={u.nickname} src={u.avatarUrl} />
              <div className="min-w-40 flex-1 space-y-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className={u.nickname ? 'font-medium' : 'italic text-muted-foreground'}>{u.nickname ?? 'Deleted user'}</span>
                  {u.role !== 'user' ? <RoleBadge role={u.role} /> : null}
                  <AccountStatusBadge status={u.status} deleted={u.deleted} suspendedUntil={u.suspendedUntil} now={now} />
                </p>
                <p className="text-xs text-muted-foreground">Joined {u.joinedExact}</p>
              </div>
              <dl className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                <Stat label="Posts" value={u.posts} />
                <Stat label="Comments" value={u.comments} />
                <Stat label="Listings" value={u.listings} />
                <Stat label="Open reports" value={u.openReports} highlight={u.openReports > 0} />
              </dl>
            </Link>
          </li>
        ))}
      </ul>
      <LoadMore hasMore={hasMore} pending={pending} onClick={loadMore} />
    </div>
  );
}

function Stat({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="text-center">
      <dd className={`text-sm font-semibold tabular-nums ${highlight ? 'text-destructive' : 'text-foreground'}`}>{value}</dd>
      <dt>{label}</dt>
    </div>
  );
}
