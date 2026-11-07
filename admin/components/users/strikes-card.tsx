import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { codeFromError, messageFor } from '@/lib/errors';
import { formatAgo, formatExact } from '@/lib/format';
import { fetchStrikes } from '@/lib/moderation/data';
import { hasStrikes, type Strikes } from '@/lib/moderation/warnings';
import { requestNow } from '@/lib/request-time';

function StrikesFrame({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-base">Strikes</h2>
        </CardTitle>
        <p className="text-sm text-muted-foreground">Information for staff only. Nothing happens automatically.</p>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const ROWS: readonly { label: string; d30: keyof Strikes; d90: keyof Strikes }[] = [
  { label: 'Filter hits', d30: 'keywordHits30', d90: 'keywordHits90' },
  { label: 'Warnings', d30: 'warnings30', d90: 'warnings90' },
  { label: 'Mutes', d30: 'mutes30', d90: 'mutes90' },
];

/** mod_get_strikes for one member: 30 and 90 day counts and the last strike. */
export async function StrikesCard({ user }: { user: string }) {
  let strikes: Strikes;
  try {
    strikes = await fetchStrikes(user);
  } catch (e) {
    return (
      <StrikesFrame>
        <p role="alert" className="text-sm text-destructive">
          Could not load strikes. {messageFor(codeFromError(e))}
        </p>
      </StrikesFrame>
    );
  }
  if (!hasStrikes(strikes)) {
    return (
      <StrikesFrame>
        <p className="text-sm text-muted-foreground">No strikes</p>
      </StrikesFrame>
    );
  }
  const now = requestNow();
  return (
    <StrikesFrame>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="pb-2 font-medium">
              Kind
            </th>
            <th scope="col" className="pb-2 text-right font-medium">
              30 days
            </th>
            <th scope="col" className="pb-2 text-right font-medium">
              90 days
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.label} className="border-t">
              <th scope="row" className="py-1.5 text-left font-normal">
                {r.label}
              </th>
              <td className="py-1.5 text-right tabular-nums">{strikes[r.d30]}</td>
              <td className="py-1.5 text-right tabular-nums">{strikes[r.d90]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {strikes.lastStrikeAt ? (
        <p className="mt-3 text-xs text-muted-foreground" title={formatExact(strikes.lastStrikeAt)}>
          Last strike {formatAgo(strikes.lastStrikeAt, now)}
        </p>
      ) : null}
    </StrikesFrame>
  );
}

export function StrikesSkeleton() {
  return (
    <StrikesFrame>
      <div className="space-y-2" aria-label="Loading strikes" role="status">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </StrikesFrame>
  );
}
