import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ReportDetail } from '@/lib/moderation/data';

const STATUS: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  open: { label: 'Open', variant: 'default' },
  actioned: { label: 'Handled', variant: 'secondary' },
  dismissed: { label: 'Dismissed', variant: 'outline' },
};

/** Every report on the item, open and handled. */
export function ReportHistory({ reports }: { reports: ReportDetail[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-base">Reports ({reports.length})</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reports on this item.</p>
        ) : (
          <ol className="space-y-4">
            {reports.map((r) => {
              const s = STATUS[r.status] ?? { label: r.status, variant: 'outline' as const };
              return (
                <li key={r.id} className="space-y-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{r.reason}</strong>
                    <Badge variant={s.variant}>{s.label}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    by {r.reporter ?? 'Deleted user'} · <time title={r.exact}>{r.ago}</time>
                  </p>
                  {r.note ? <p className="whitespace-pre-wrap break-words">{r.note}</p> : null}
                  {r.status !== 'open' ? (
                    <p className="text-xs text-muted-foreground">
                      {s.label} {r.handledBy ? `by ${r.handledBy}` : ''} {r.handledExact ? `· ${r.handledExact}` : ''}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
