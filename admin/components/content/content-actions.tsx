'use client';

import { PencilLine, RotateCcw, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { editPublished, removePublished, restoreRemoved } from '@/app/(panel)/content/actions';
import { ConfirmDialog, EditDialog, ReasonDialog } from '@/components/moderation/dialogs';
import { Button } from '@/components/ui/button';
import type { ActionResult } from '@/lib/result';
import { BODY_MAX, type ContentType } from '@/lib/review/schemas';

type Props = {
  type: ContentType;
  id: string;
  body: string;
  status: string;
  deletedByAuthor: boolean;
  /** Top-level comment: replies cascade on removal and do not come back on restore. */
  cascades: boolean;
};

export function ContentActions({ type, id, body, status, deletedByAuthor, cascades }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  const [dialog, setDialog] = useState<'remove' | 'restore' | 'edit' | null>(null);
  const published = status === 'published';
  const restorable = (status === 'removed' || status === 'rejected') && !deletedByAuthor;
  const editable = published && (type === 'post' || type === 'comment');

  const run = <T,>(call: () => Promise<ActionResult<T>>, message: (data: T) => string) => {
    if (busy.current) return;
    busy.current = true;
    startTransition(async () => {
      try {
        const result = await call();
        setDialog(null);
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        toast.success(message(result.data));
        router.refresh();
      } finally {
        busy.current = false;
      }
    });
  };

  if (!published && !restorable) {
    return deletedByAuthor ? (
      <p className="text-sm text-muted-foreground">The author deleted this item, so it cannot be restored.</p>
    ) : null;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {published ? (
          <Button size="lg" variant="destructive" onClick={() => setDialog('remove')} disabled={pending}>
            <Trash2 aria-hidden="true" /> Remove…
          </Button>
        ) : null}
        {editable ? (
          <Button size="lg" variant="outline" onClick={() => setDialog('edit')} disabled={pending}>
            <PencilLine aria-hidden="true" /> Edit…
          </Button>
        ) : null}
        {restorable ? (
          <Button size="lg" onClick={() => setDialog('restore')} disabled={pending}>
            <RotateCcw aria-hidden="true" /> Restore…
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
            It disappears from the app and the author is notified with the reason. Open reports on it are marked handled.
            {cascades ? ' Its replies are removed too and do not come back if it is restored later.' : ''}
          </>
        }
        confirmLabel="Remove"
        pendingLabel="Removing…"
        onConfirm={(reason, note) => run(() => removePublished({ type, id, reason, note }), (d) => d.message)}
      />
      <ConfirmDialog
        open={dialog === 'restore'}
        onOpenChange={(o) => setDialog(o ? 'restore' : null)}
        pending={pending}
        title="Restore this content"
        description={
          <>
            <p>It is published again and the author gets an &ldquo;approved&rdquo; notification.</p>
            {cascades ? (
              <p className="font-medium text-foreground">
                Replies that were removed together with this comment stay removed. Restore them one by one if needed.
              </p>
            ) : null}
          </>
        }
        confirmLabel="Restore"
        pendingLabel="Restoring…"
        onConfirm={() => run(() => restoreRemoved({ type, id }), () => 'Restored. It is published again.')}
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
          description="The original text is kept in the moderation log."
          confirmLabel="Save edit"
          onConfirm={(newBody, reason) => run(() => editPublished({ type, id, body: newBody, reason }), () => 'Edit saved.')}
        />
      ) : null}
    </div>
  );
}
