'use client';

import { type ReactNode, useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SHEET_BELOW_MD, TAP_BELOW_MD } from '@/components/moderation/mobile-dialog';
import { Textarea } from '@/components/ui/textarea';
import { REJECT_REASONS, type RejectReason } from '@/lib/review/reasons';
import { EDIT_REASON_MAX, NOTE_MAX } from '@/lib/review/schemas';

// Shared moderation dialogs. Callers remount them on every opening (key) so each starts fresh.

type Base = { open: boolean; onOpenChange: (open: boolean) => void; pending: boolean };

function CancelButton({ className }: { className?: string }) {
  return (
    <DialogClose asChild>
      <Button type="button" variant="outline" className={className}>
        Cancel
      </Button>
    </DialogClose>
  );
}

/** Required reason (the reject list) plus an optional note: reject (review) and remove (reports, content). */
export function ReasonDialog({
  open,
  onOpenChange,
  pending,
  title,
  description,
  confirmLabel,
  pendingLabel,
  onConfirm,
}: Base & {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  onConfirm: (reason: RejectReason, note: string) => void;
}) {
  const [reason, setReason] = useState<RejectReason | null>(null);
  const [note, setNote] = useState('');
  const noteId = useId();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason) onConfirm(reason, note.trim());
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Reason (required)</legend>
            {REJECT_REASONS.map((r) => (
              <label
                key={r.value}
                className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm has-checked:border-primary has-checked:bg-secondary has-focus-visible:outline-2 has-focus-visible:outline-ring"
              >
                <input
                  type="radio"
                  name="reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                  className="size-4 accent-[var(--primary)]"
                />
                {r.label}
              </label>
            ))}
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor={noteId}>Note for the moderation log (optional)</Label>
            <Textarea id={noteId} value={note} maxLength={NOTE_MAX} onChange={(e) => setNote(e.target.value)} rows={3} />
            <p className="text-right text-xs text-muted-foreground" aria-live="polite">
              {note.length}/{NOTE_MAX}
            </p>
          </div>
          <DialogFooter>
            <CancelButton />
            <Button type="submit" variant="destructive" disabled={!reason || pending}>
              {pending ? pendingLabel : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Edit the text with a required reason. */
export function EditDialog({
  open,
  onOpenChange,
  pending,
  initialBody,
  max,
  title,
  description,
  confirmLabel,
  onConfirm,
}: Base & {
  initialBody: string;
  max: number;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: (body: string, reason: string) => void;
}) {
  const [body, setBody] = useState(initialBody);
  const [reason, setReason] = useState('');
  const bodyId = useId();
  const reasonId = useId();
  const length = body.trim().length;
  const valid = length > 0 && length <= max && reason.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) onConfirm(body.trim(), reason.trim());
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={bodyId}>Text</Label>
            <Textarea
              id={bodyId}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              aria-invalid={length === 0 || length > max}
              aria-describedby={`${bodyId}-count`}
            />
            <p
              id={`${bodyId}-count`}
              className={`text-right text-xs ${length > max ? 'text-destructive' : 'text-muted-foreground'}`}
              aria-live="polite"
            >
              {length}/{max}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={reasonId}>Why was it edited? (required)</Label>
            <Input
              id={reasonId}
              value={reason}
              maxLength={EDIT_REASON_MAX}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Removed a full name"
            />
          </div>
          <DialogFooter>
            <CancelButton />
            <Button type="submit" disabled={!valid || pending}>
              {pending ? 'Saving…' : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Plain confirmation for a consequential action; `children` holds extra fields when needed. */
export function ConfirmDialog({
  open,
  onOpenChange,
  pending,
  title,
  description,
  confirmLabel,
  pendingLabel = 'Working…',
  destructive = false,
  canConfirm = true,
  onConfirm,
  children,
  sheetOnMobile = false,
}: Base & {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  destructive?: boolean;
  canConfirm?: boolean;
  onConfirm: () => void;
  children?: ReactNode;
  /** Below md: a bottom sheet with 44 px buttons (opt-in; other pages keep the centred dialog). */
  sheetOnMobile?: boolean;
}) {
  const tap = sheetOnMobile ? TAP_BELOW_MD : undefined;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={sheetOnMobile ? SHEET_BELOW_MD : undefined}>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (canConfirm) onConfirm();
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">{description}</div>
            </DialogDescription>
          </DialogHeader>
          {children}
          <DialogFooter>
            <CancelButton className={tap} />
            <Button type="submit" variant={destructive ? 'destructive' : 'default'} disabled={!canConfirm || pending} className={tap}>
              {pending ? pendingLabel : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
