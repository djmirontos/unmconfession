import { Badge } from '@/components/ui/badge';
import { suspensionLabel } from '@/lib/moderation/suspension';

const CONTENT_STATUS: Record<string, { label: string; className: string }> = {
  published: { label: 'Published', className: 'bg-secondary text-secondary-foreground' },
  pending: { label: 'Pending review', className: 'bg-gold text-gold-foreground' },
  rejected: { label: 'Rejected', className: 'bg-destructive/10 text-destructive' },
  removed: { label: 'Removed', className: 'bg-destructive/10 text-destructive' },
};

export function contentStatusLabel(status: string): string {
  return CONTENT_STATUS[status]?.label ?? status;
}

export function ContentStatusBadge({ status }: { status: string }) {
  const s = CONTENT_STATUS[status];
  return <Badge className={s?.className ?? ''}>{s?.label ?? status}</Badge>;
}

/** Account state; a suspension whose end date passed reads "Suspension ended". */
export function AccountStatusBadge({
  status,
  deleted,
  suspendedUntil = null,
  now,
}: {
  status: string | null;
  deleted: boolean;
  suspendedUntil?: string | null;
  /** The request time (server) or the time the list was rendered (client). */
  now: number;
}) {
  if (deleted) return <Badge variant="outline">Deleted</Badge>;
  if (status === 'banned') return <Badge variant="destructive">Banned</Badge>;
  if (status === 'suspended') {
    const label = suspensionLabel(status, suspendedUntil, now) ?? 'Suspended';
    const ended = label === 'Suspension ended';
    return (
      <Badge className={ended ? 'bg-secondary text-secondary-foreground' : 'bg-gold text-gold-foreground'} title={label}>
        {ended ? 'Suspension ended' : 'Suspended'}
      </Badge>
    );
  }
  return <Badge variant="secondary">Active</Badge>;
}
