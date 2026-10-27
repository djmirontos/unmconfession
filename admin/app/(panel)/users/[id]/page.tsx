import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { HistoryList } from '@/components/moderation/history-list';
import { AccountStatusBadge } from '@/components/moderation/status-badges';
import { UserAvatar } from '@/components/moderation/user-avatar';
import { RoleBadge } from '@/components/panel/role-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UserActions } from '@/components/users/user-actions';
import { requireStaff } from '@/lib/auth';
import { userActions } from '@/lib/moderation/availability';
import { fetchHistory, fetchUser, type HistoryQuery } from '@/lib/moderation/data';
import { userIdSchema } from '@/lib/moderation/schemas';
import { suspensionLabel } from '@/lib/moderation/suspension';
import { requestNow } from '@/lib/request-time';

export const metadata: Metadata = { title: 'User' };

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export default async function UserPage({ params }: PageProps<'/users/[id]'>) {
  const staff = await requireStaff();
  const id = userIdSchema.safeParse((await params).id);
  if (!id.success) notFound();

  const query: HistoryQuery = { kind: 'user', user: id.data };
  const [user, history] = await Promise.all([fetchUser(id.data), fetchHistory(query)]);
  if (!user) notFound();

  const now = requestNow();
  const available = userActions(
    { id: staff.userId, isAdmin: staff.isAdmin },
    { id: user.id, role: user.role, status: user.status, suspendedUntil: user.suspendedUntil, deleted: user.deleted },
    now,
  );
  const suspension = suspensionLabel(user.status, user.suspendedUntil, now);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/users">
          <ArrowLeft aria-hidden="true" /> Users
        </Link>
      </Button>

      <div className="flex flex-wrap items-center gap-4">
        <UserAvatar nickname={user.nickname} size="lg" />
        <div className="space-y-1">
          <h1 className={`text-2xl font-semibold ${user.nickname ? '' : 'italic text-muted-foreground'}`}>
            {user.nickname ?? 'Deleted user'}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <RoleBadge role={user.role} />
            <AccountStatusBadge status={user.status} deleted={user.deleted} suspendedUntil={user.suspendedUntil} now={now} />
            {staff.userId === user.id ? <span className="text-sm text-muted-foreground">(you)</span> : null}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <Card>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Fact label="Joined">{user.joinedExact}</Fact>
                <Fact label="Terms accepted">{user.termsAcceptedExact ?? 'Not recorded'}</Fact>
                <Fact label="Content">
                  {user.posts} posts · {user.comments} comments · {user.listings} listings
                </Fact>
                <Fact label="Open reports against">{user.openReports}</Fact>
                {suspension ? <Fact label="Suspension">{suspension}</Fact> : null}
                {user.statusReason ? <Fact label={user.deleted ? 'Stored reason' : 'Status reason'}>{user.statusReason}</Fact> : null}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2 className="text-base">Actions</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {user.deleted ? (
                <p className="text-sm text-muted-foreground">This account was deleted. Nothing can be changed.</p>
              ) : (
                <UserActions
                  user={{ id: user.id, nickname: user.nickname, role: user.role, status: user.status }}
                  available={available}
                />
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-base">Moderation history</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <HistoryList query={query} initial={history} showTarget />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
