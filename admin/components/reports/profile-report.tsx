import { Info, UserRound } from 'lucide-react';
import Link from 'next/link';

import { TAP_LINK_BELOW_MD } from '@/components/moderation/mobile-dialog';
import { AccountStatusBadge } from '@/components/moderation/status-badges';
import { UserAvatar } from '@/components/moderation/user-avatar';
import { RoleBadge } from '@/components/panel/role-badge';
import { ReportActions } from '@/components/reports/report-actions';
import { ReportHistory } from '@/components/reports/report-history';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { ClearDetailsButton, RemoveAvatarButton } from '@/components/users/profile-tools';
import { reasonFromReports } from '@/lib/moderation/avatar';
import type { ReportDetail, UserRow } from '@/lib/moderation/data';

type Props = {
  /** The reported account, or null when it no longer exists. */
  user: UserRow | null;
  id: string;
  reports: ReportDetail[];
  canRemove: boolean;
  /** The member's details as "Label: value" lines (mod_get_reports body), or null. */
  details: string | null;
  canClear: boolean;
  now: number;
  nextHref: string;
};

/**
 * A reported profile (picture or nickname): the account card, the reports and the actions.
 * Suspending or banning happens on the user page, so the reasons and the history stay in one place.
 */
export function ProfileReport({ user, id, reports, canRemove, details, canClear, now, nextHref }: Props) {
  const open = reports.filter((r) => r.status === 'open');
  const reasons = [...new Set(open.map((r) => r.reason))];
  const actions = (
    <ReportActions
      type="profile"
      id={id}
      body=""
      status={user && !user.deleted ? 'published' : 'missing'}
      openReports={open.length}
      cascades={false}
      nextHref={nextHref}
      leading={
        user && (canRemove || canClear) ? (
          <>
            {canRemove ? (
              <RemoveAvatarButton
                user={{ id: user.id, nickname: user.nickname }}
                defaultReason={reasonFromReports(reasons)}
                successMessage="Profile picture removed. The reports are still open."
                size="lg"
              />
            ) : null}
            {canClear ? (
              <ClearDetailsButton
                user={{ id: user.id, nickname: user.nickname }}
                defaultReason={reasonFromReports(reasons)}
                successMessage="Profile details cleared. The reports are still open."
                size="lg"
              />
            ) : null}
          </>
        ) : undefined
      }
    />
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-6">
        {!user || user.deleted ? (
          <Alert>
            <Info />
            <AlertDescription>This account was deleted. Only its reports are left to handle.</AlertDescription>
          </Alert>
        ) : null}
        {user ? (
          <Card>
            <CardContent className="flex flex-wrap items-center gap-4">
              <UserAvatar nickname={user.nickname} src={user.avatarUrl} size="xl" />
              <div className="min-w-0 space-y-1.5">
                <p className={`text-xl font-semibold break-words ${user.nickname ? '' : 'italic text-muted-foreground'}`}>
                  {user.nickname ?? 'Deleted user'}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <RoleBadge role={user.role} />
                  <AccountStatusBadge status={user.status} deleted={user.deleted} suspendedUntil={user.suspendedUntil} now={now} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {user.avatarUrl ? 'Own picture' : 'Default avatar (an app preset; nothing to remove)'}
                </p>
                <Link
                  href={`/users/${user.id}`}
                  className={`inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline ${TAP_LINK_BELOW_MD}`}
                >
                  <UserRound className="size-4" aria-hidden="true" /> Open the user page to suspend or ban
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : null}
        {details ? (
          <Card>
            <CardContent className="space-y-2">
              <h2 className="text-sm font-semibold">Profile details (may be hidden from members)</h2>
              {/* Member text: plain React text only, line breaks kept. */}
              <p className="text-sm whitespace-pre-wrap break-words">{details}</p>
            </CardContent>
          </Card>
        ) : null}
        {actions}
      </div>
      <ReportHistory reports={reports} />
    </div>
  );
}
