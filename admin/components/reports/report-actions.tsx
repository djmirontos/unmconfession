'use client';

import { CheckCheck, PencilLine, Trash2, TriangleAlert, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { editPublished, removePublished } from '@/app/(panel)/content/actions';
import { resolveReports } from '@/app/(panel)/reports/actions';
import { ConfirmDialog, EditDialog, ReasonDialog } from '@/components/moderation/dialogs';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { FlowMessage } from '@/lib/moderation/mutations';
import type { ActionResult } from '@/lib/result';
import { BODY_MAX, type ContentType } from '@/lib/review/schemas';

type Props = {
  type: ContentType;
  id: string;
  body: string;
  status: string;
  openReports: number;
  /** Top-level comment: its replies are removed with it. */
  cascades: boolean;
  /** Where to go once the item is handled (the server picks the next reported item). */
  nextHref: string;
};

type Dialog = 'remove' | 'dismiss' | 'handled' | 'edit' | null;

export function ReportActions({ type, id, body, status, openReports, cascades, nextHref }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [partial, setPartial] = useState<string | null>(null);
  const published = status === 'published';
  const editable = published && (type === 'post' || type === 'comment');

  /** One request at a time. Finished flows move on; partial ones stay with a retry for the rest. */
  const run = <T,>(call: () => Promise<ActionResult<T>>, onOk: (data: T) => void) => {
    if (busy.current) return;
    busy.current = true;
    startTransition(async () => {
      try {
        const result = await call();
        setDialog(null);
        if (result.ok) onOk(result.data);
        else toast.error(result.message);
      } finally {
        busy.current = false;
      }
    });
  };

  const finishFlow = (data: FlowMessage) => {
    if (data.partial) {
      setPartial(data.message);
      router.refresh();
      return;
    }
    setPartial(null);
    toast.success(data.message);
    router.replace(nextHref);
  };

  const retryResolve = () => run(() => resolveReports({ type, id, status: 'actioned' }), finishFlow);

  return (
    <div className="space-y-4">
      {partial ? (
        <Alert variant="destructive" role="alert">
          <TriangleAlert />
          <AlertTitle>Only part of this was done</AlertTitle>
          <AlertDescription>{partial} Retry only marks the remaining reports handled.</AlertDescription>
          <AlertAction>
            <Button size="sm" onClick={retryResolve} disabled={pending}>
              Retry
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {published ? (
          <Button size="lg" variant="destructive" onClick={() => setDialog('remove')} disabled={pending}>
            <Trash2 aria-hidden="true" /> Remove content…
          </Button>
        ) : null}
        {openReports > 0 ? (
          <>
            <Button size="lg" onClick={() => setDialog('handled')} disabled={pending}>
              <CheckCheck aria-hidden="true" /> Mark handled…
            </Button>
            <Button size="lg" variant="outline" onClick={() => setDialog('dismiss')} disabled={pending}>
              <XCircle aria-hidden="true" /> Dismiss reports…
            </Button>
          </>
        ) : null}
        {editable ? (
          <Button size="lg" variant="outline" onClick={() => setDialog('edit')} disabled={pending}>
            <PencilLine aria-hidden="true" /> Edit content…
          </Button>
        ) : null}
      </div>

      <ReasonDialog
        key={dialog === 'remove' ? 'remove-open' : 'remove'}
        open={dialog === 'remove'}
        onOpenChange={(o) => setDialog(o ? 'remove' : null)}
        pending={pending}
        title="Remove this content"
        description={
          <>
            It disappears from the app and the author is notified with the reason. Every open report on it is marked handled.
            {cascades ? ' Its replies are removed too and do not come back if it is restored later.' : ''}
          </>
        }
        confirmLabel="Remove"
        pendingLabel="Removing…"
        onConfirm={(reason, note) => run(() => removePublished({ type, id, reason, note }), finishFlow)}
      />
      <ConfirmDialog
        open={dialog === 'handled'}
        onOpenChange={(o) => setDialog(o ? 'handled' : null)}
        pending={pending}
        title="Mark the reports handled"
        description={<p>The content stays as it is. Use this after editing it or acting on the author&apos;s account.</p>}
        confirmLabel="Mark handled"
        onConfirm={() => run(() => resolveReports({ type, id, status: 'actioned' }), finishFlow)}
      />
      <ConfirmDialog
        open={dialog === 'dismiss'}
        onOpenChange={(o) => setDialog(o ? 'dismiss' : null)}
        pending={pending}
        title="Dismiss the reports"
        description={<p>The reports were not justified. The content stays and nobody is notified.</p>}
        confirmLabel="Dismiss reports"
        onConfirm={() => run(() => resolveReports({ type, id, status: 'dismissed' }), finishFlow)}
      />
      {editable ? (
        <EditDialog
          key={dialog === 'edit' ? 'edit-open' : 'edit'}
          open={dialog === 'edit'}
          onOpenChange={(o) => setDialog(o ? 'edit' : null)}
          pending={pending}
          initialBody={body}
          max={BODY_MAX[type as 'post' | 'comment']}
          title="Edit content"
          description="The original text is kept in the moderation log. The reports stay open until you mark them handled."
          confirmLabel="Save edit"
          onConfirm={(newBody, reason) =>
            run(
              () => editPublished({ type, id, body: newBody, reason }),
              () => {
                toast.success('Edit saved. The reports are still open.');
                router.refresh();
              },
            )
          }
        />
      ) : null}
    </div>
  );
}
