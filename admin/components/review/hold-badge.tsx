import { Badge } from '@/components/ui/badge';

/** Why the item is waiting: the matched keyword (highlighted) or pre-moderation. */
export function HoldBadge({ reason, term }: { reason: string | null; term: string | null }) {
  if (reason === 'keyword') {
    return (
      <Badge className="max-w-full border border-gold bg-gold/15 text-foreground" title="Held by the keyword filter">
        <span className="font-normal text-muted-foreground">Keyword</span>
        <span className="truncate font-semibold">{term ?? 'unknown'}</span>
      </Badge>
    );
  }
  if (reason === 'pre_moderation') {
    return <Badge variant="secondary">Pre-moderation</Badge>;
  }
  return <Badge variant="outline">No hold record</Badge>;
}

const TYPE_LABEL: Record<string, string> = { post: 'Post', comment: 'Comment', listing: 'Listing' };

export function TypeBadge({ type }: { type: string }) {
  return (
    <Badge variant="outline" className="font-semibold">
      {TYPE_LABEL[type] ?? type}
    </Badge>
  );
}

const KIND_LABEL: Record<string, string> = {
  confession: 'Confession',
  shoutout: 'Shoutout',
  poll: 'Poll',
  sell: 'Buy & Sell',
  lost_found: 'Lost & Found',
  comment: 'Comment',
};

export function kindLabel(kind: string | null | undefined): string | null {
  return kind ? (KIND_LABEL[kind] ?? kind) : null;
}

export function authorLabel(nickname: string | null | undefined): string {
  return nickname ?? 'Deleted user';
}
