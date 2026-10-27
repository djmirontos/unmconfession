import type { Metadata } from 'next';
import { ArrowLeft, Info } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ContentActions } from '@/components/content/content-actions';
import { ContentView } from '@/components/moderation/content-view';
import { TAP_LINK_BELOW_MD } from '@/components/moderation/mobile-dialog';
import { HistoryList } from '@/components/moderation/history-list';
import { kindLabel, TypeBadge } from '@/components/review/hold-badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireStaff } from '@/lib/auth';
import { isTopLevelComment, loadContent } from '@/lib/moderation/content-data';
import { fetchHistory, type HistoryQuery } from '@/lib/moderation/data';
import { targetSchema } from '@/lib/review/schemas';

export const metadata: Metadata = { title: 'Content item' };

export default async function ContentItemPage({ params }: PageProps<'/content/[type]/[id]'>) {
  await requireStaff();
  const target = targetSchema.safeParse(await params);
  if (!target.success) notFound();
  const { type, id } = target.data;

  const query: HistoryQuery = { kind: 'target', type, id };
  const [loaded, history] = await Promise.all([loadContent(type, id), fetchHistory(query)]);
  if (!loaded) notFound();
  const { item } = loaded;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/content">
            <ArrowLeft aria-hidden="true" /> Content
          </Link>
        </Button>
        <TypeBadge type={type} />
        {type !== 'comment' && kindLabel(item.kind) ? <span className="font-medium">{kindLabel(item.kind)}</span> : null}
      </div>

      {item.status === 'pending' ? (
        <Alert>
          <Info />
          <AlertDescription>
            This item is waiting for review.{' '}
            <Link href={`/review/${type}/${id}`} className={`font-medium text-primary underline underline-offset-4 ${TAP_LINK_BELOW_MD}`}>
              Open it in the review queue
            </Link>
            .
          </AlertDescription>
        </Alert>
      ) : null}

      <ContentView
        {...loaded}
        aside={
          <Card>
            <CardHeader>
              <CardTitle>
                <h2 className="text-base">Moderation history</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <HistoryList query={query} initial={history} />
            </CardContent>
          </Card>
        }
      >
        <ContentActions
          type={type}
          id={id}
          body={item.body ?? ''}
          status={item.status}
          deletedByAuthor={item.deleted_at !== null}
          cascades={isTopLevelComment(item)}
        />
      </ContentView>
    </div>
  );
}
