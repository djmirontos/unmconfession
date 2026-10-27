'use client';

import { Check, ChevronLeft, ChevronRight, PencilLine, TriangleAlert, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { approveItem, editAndApprove, rejectItem } from '@/app/(panel)/review/actions';
import { EditDialog, ReasonDialog } from '@/components/moderation/dialogs';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { ActionResult } from '@/lib/result';
import { BODY_MAX, type ContentType } from '@/lib/review/schemas';
import { resolveShortcut } from '@/lib/review/shortcuts';

type Props = {
  type: ContentType;
  id: string;
  body: string;
  /** Where to go after an action (the server picks the next pending item). */
  afterActionHref: string;
  prevHref: string | null;
  nextHref: string | null;
};

export function ReviewActions({ type, id, body, afterActionHref, prevHref, nextHref }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [retryApprove, setRetryApprove] = useState(false);
  const editable = type === 'post' || type === 'comment';

  /** One request at a time; afterwards go on to the next item or show the error. */
  const run = (call: () => Promise<ActionResult>, done: string, onFail?: (r: Extract<ActionResult, { ok: false }>) => boolean) => {
    if (busy.current) return;
    busy.current = true;
    startTransition(async () => {
      try {
        const result = await call();
        if (result.ok) {
          toast.success(done);
          router.replace(afterActionHref);
          return;
        }
        if (result.code === 'invalid_transition') {
          toast.warning(result.message);
          router.replace(afterActionHref);
          return;
        }
        if (!onFail?.(result)) toast.error(result.message);
      } finally {
        busy.current = false;
      }
    });
  };

  const approve = () => run(() => approveItem({ type, id }), 'Approved');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const action = resolveShortcut({
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        targetTag: target?.tagName ?? '',
        targetEditable: Boolean(target?.isContentEditable),
        dialogOpen: rejectOpen || editOpen || document.querySelector('[role="dialog"]') !== null,
      });
      if (!action || busy.current) return;
      e.preventDefault();
      if (action === 'approve') approve();
      if (action === 'reject') setRejectOpen(true);
      if (action === 'edit' && editable) setEditOpen(true);
      if (action === 'next' && nextHref) router.push(nextHref);
      if (action === 'prev' && prevHref) router.push(prevHref);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="space-y-4">
      {retryApprove ? (
        <Alert variant="destructive" role="alert">
          <TriangleAlert />
          <AlertTitle>The edit was saved, but approving failed</AlertTitle>
          <AlertDescription>The new text is stored. Try approving again; the edit will not be sent twice.</AlertDescription>
          <AlertAction>
            <Button size="sm" onClick={approve} disabled={pending}>
              Retry approval
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="lg" onClick={approve} disabled={pending} aria-keyshortcuts="A">
          <Check aria-hidden="true" /> Approve
        </Button>
        <Button size="lg" variant="destructive" onClick={() => setRejectOpen(true)} disabled={pending} aria-keyshortcuts="R">
          <X aria-hidden="true" /> Reject…
        </Button>
        {editable ? (
          <Button size="lg" variant="outline" onClick={() => setEditOpen(true)} disabled={pending} aria-keyshortcuts="E">
            <PencilLine aria-hidden="true" /> Edit and approve…
          </Button>
        ) : null}
        <div className="ml-auto flex gap-2">
          <NavButton href={prevHref} label="Previous item" shortcut="ArrowLeft">
            <ChevronLeft aria-hidden="true" /> Previous
          </NavButton>
          <NavButton href={nextHref} label="Next item" shortcut="ArrowRight">
            Next <ChevronRight aria-hidden="true" />
          </NavButton>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Shortcuts: <Kbd>A</Kbd> approve · <Kbd>R</Kbd> reject{editable ? <> · <Kbd>E</Kbd> edit</> : null} ·{' '}
        <Kbd>←</Kbd> <Kbd>→</Kbd> previous / next
      </p>

      {/* Remounted on every opening so the form starts empty (and with the current text). */}
      <ReasonDialog
        key={rejectOpen ? 'reject-open' : 'reject-closed'}
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        pending={pending}
        title="Reject this item"
        description="The author is told the reason. The item will not be published."
        confirmLabel="Reject"
        pendingLabel="Rejecting…"
        onConfirm={(reason, note) => run(() => rejectItem({ type, id, reason, note }), 'Rejected')}
      />
      {editable ? (
        <EditDialog
          key={editOpen ? 'edit-open' : 'edit-closed'}
          open={editOpen}
          onOpenChange={setEditOpen}
          pending={pending}
          initialBody={body}
          max={BODY_MAX[type]}
          title="Edit and approve"
          description="Remove names or personal details, then approve. The original text is kept in the moderation log."
          confirmLabel="Save and approve"
          onConfirm={(newBody, reason) =>
            run(
              () => editAndApprove({ type, id, body: newBody, reason }),
              'Edited and approved',
              (result) => {
                if (result.code !== 'approve_failed_after_edit') return false;
                setEditOpen(false);
                setRetryApprove(true);
                router.refresh();
                return true;
              },
            )
          }
        />
      ) : null}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[0.7rem] text-foreground">{children}</kbd>;
}

function NavButton({ href, label, shortcut, children }: { href: string | null; label: string; shortcut: string; children: React.ReactNode }) {
  if (!href) {
    return (
      <Button variant="outline" disabled aria-label={`${label} (none)`}>
        {children}
      </Button>
    );
  }
  return (
    <Button asChild variant="outline">
      <Link href={href} aria-label={label} aria-keyshortcuts={shortcut}>
        {children}
      </Link>
    </Button>
  );
}
