'use client';

import { CircleStop, PencilLine, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { createAnnouncement, deleteAnnouncement, endAnnouncement, updateAnnouncement } from '@/app/(panel)/announcements/actions';
import { type AnnouncementDraft, AnnouncementDialog, TITLE_NOTE } from '@/components/announcements/announcement-dialog';
import { ConfirmDialog } from '@/components/moderation/dialogs';
import { ACTION_GRID } from '@/components/moderation/mobile-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AnnouncementRow } from '@/lib/announcements/data';
import { type AnnouncementStatus, announcementActions, isoToManilaInput, STATUS_LABELS } from '@/lib/announcements/time';
import type { ActionResult } from '@/lib/result';

type Dialog =
  | { kind: 'add' }
  | { kind: 'edit'; row: AnnouncementRow }
  | { kind: 'end'; row: AnnouncementRow }
  | { kind: 'delete'; row: AnnouncementRow }
  | null;

const STATUS_CLASS: Record<AnnouncementStatus, string> = {
  live: 'bg-primary text-primary-foreground',
  scheduled: 'bg-gold text-gold-foreground',
  ended: 'bg-secondary text-secondary-foreground',
};

// Clamp only bodies that would not fit in four lines anyway.
const LONG_BODY = 280;
const LONG_LINES = 4;

function Body({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > LONG_BODY || text.split('\n').length > LONG_LINES;
  return (
    <div className="space-y-1">
      <p className={`text-sm break-words whitespace-pre-wrap text-foreground/90 ${long && !expanded ? 'line-clamp-4' : ''}`}>{text}</p>
      {long ? (
        <Button variant="link" className="h-auto px-0 max-md:min-h-11" aria-expanded={expanded} onClick={() => setExpanded((e) => !e)}>
          {expanded ? 'Show less' : 'Show more'}
        </Button>
      ) : null}
    </div>
  );
}

function draftFor(row: AnnouncementRow): AnnouncementDraft {
  return {
    title: row.title,
    body: row.body,
    startMode: 'keep',
    startAt: row.startInput,
    end: row.endInput,
    stored: { iso: row.startsAt, exact: row.startsExact },
  };
}

/** Create button plus one card per announcement (or the empty state passed in). Every change goes through a Server Action. */
export function AnnouncementList({
  rows,
  now,
  limitNote,
  empty,
}: {
  rows: AnnouncementRow[];
  now: number;
  limitNote: string | null;
  empty: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  // Remounts the create / edit dialog on every opening so it starts fresh.
  const [opening, setOpening] = useState(0);

  const run = (call: () => Promise<ActionResult>, success: string) => {
    if (busy.current) return;
    busy.current = true;
    startTransition(async () => {
      try {
        const result = await call();
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        setDialog(null);
        toast.success(success);
        router.refresh();
      } finally {
        busy.current = false;
      }
    });
  };
  const open = (d: Exclude<Dialog, null>) => {
    setOpening((n) => n + 1);
    setDialog(d);
  };
  const close = (o: boolean) => {
    if (!o) setDialog(null);
  };

  const newDraft: AnnouncementDraft = {
    title: '',
    body: '',
    startMode: 'now',
    startAt: isoToManilaInput(new Date(now + 3600 * 1000).toISOString()),
    end: null,
    stored: null,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Card headings are internal titles. {TITLE_NOTE}</p>
        <Button onClick={() => open({ kind: 'add' })} disabled={pending} className="max-md:w-full">
          <Plus aria-hidden="true" /> New announcement
        </Button>
      </div>

      {rows.length === 0 ? (
        empty
      ) : (
        <ul className="space-y-3" aria-label="Announcements">
          {rows.map((row) => {
            const actions = announcementActions(row.status);
            return (
              <li key={row.id} className="space-y-3 rounded-lg border bg-card p-4 shadow-xs">
                <div className="flex flex-wrap items-start gap-2">
                  <Badge className={STATUS_CLASS[row.status]}>{STATUS_LABELS[row.status]}</Badge>
                  <h2 className="min-w-0 flex-1 basis-48 font-semibold break-words">{row.title}</h2>
                </div>
                <Body text={row.body} />
                <dl className="grid gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3">
                  <div>
                    <dt className="inline">Start: </dt>
                    <dd className="inline">{row.startsExact}</dd>
                  </div>
                  <div>
                    <dt className="inline">End: </dt>
                    <dd className="inline">{row.endsExact ?? 'No end date'}</dd>
                  </div>
                  <div>
                    <dt className="inline">By: </dt>
                    <dd className="inline">{row.author ?? 'Deleted user'}</dd>
                  </div>
                </dl>
                <div className={ACTION_GRID}>
                  {actions.includes('edit') ? (
                    <Button variant="outline" aria-label={`Edit ${row.title}`} onClick={() => open({ kind: 'edit', row })} disabled={pending}>
                      <PencilLine aria-hidden="true" /> Edit
                    </Button>
                  ) : null}
                  {actions.includes('end') ? (
                    <Button variant="outline" aria-label={`End ${row.title} now`} onClick={() => open({ kind: 'end', row })} disabled={pending}>
                      <CircleStop aria-hidden="true" /> End now
                    </Button>
                  ) : null}
                  {actions.includes('delete') ? (
                    <Button variant="outline" aria-label={`Delete ${row.title}`} onClick={() => open({ kind: 'delete', row })} disabled={pending}>
                      <Trash2 aria-hidden="true" /> Delete
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {limitNote ? <p className="text-sm text-muted-foreground">{limitNote}</p> : null}

      {dialog?.kind === 'add' ? (
        <AnnouncementDialog
          key={`add-${opening}`}
          open
          onOpenChange={close}
          pending={pending}
          title="New announcement"
          confirmLabel="Create"
          initial={newDraft}
          now={now}
          onSubmit={(form) => run(() => createAnnouncement(form), 'Announcement created.')}
        />
      ) : null}
      {dialog?.kind === 'edit' ? (
        <AnnouncementDialog
          key={`edit-${opening}`}
          open
          onOpenChange={close}
          pending={pending}
          title="Edit announcement"
          confirmLabel="Save changes"
          initial={draftFor(dialog.row)}
          now={now}
          onSubmit={(form) => run(() => updateAnnouncement({ ...form, id: dialog.row.id }), 'Announcement saved.')}
        />
      ) : null}
      <ConfirmDialog
        open={dialog?.kind === 'end'}
        onOpenChange={close}
        pending={pending}
        title="End this announcement now?"
        description={
          dialog?.kind === 'end' ? (
            <>
              <span className="font-medium break-words">{dialog.row.title}</span> stops showing in the app right away. It stays in this list as Ended.
            </>
          ) : null
        }
        confirmLabel="End now"
        pendingLabel="Ending…"
        onConfirm={() => {
          if (dialog?.kind === 'end') run(() => endAnnouncement(dialog.row.id), 'Announcement ended.');
        }}
      />
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        onOpenChange={close}
        pending={pending}
        destructive
        title="Delete this announcement?"
        description={
          dialog?.kind === 'delete' ? (
            <>
              <span className="font-medium break-words">{dialog.row.title}</span> is removed for good. To stop showing it but keep it here, end it instead.
            </>
          ) : null
        }
        confirmLabel="Delete"
        pendingLabel="Deleting…"
        onConfirm={() => {
          if (dialog?.kind === 'delete') run(() => deleteAnnouncement(dialog.row.id), 'Announcement deleted.');
        }}
      />
    </div>
  );
}
