'use client';

import { type FormEvent, type ReactNode, useId, useState } from 'react';

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
import {
  SHEET_BELOW_MD,
  SHEET_BODY,
  SHEET_FOOTER,
  SHEET_FORM,
  SHEET_HEADER,
} from '@/components/moderation/mobile-dialog';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { REJECT_REASONS, type RejectReason } from '@/lib/review/reasons';
import { EDIT_REASON_MAX, NOTE_MAX } from '@/lib/review/schemas';

// Shared moderation dialogs. Callers remount them on every opening (key) so each starts fresh.

type Base = { open: boolean; onOpenChange: (open: boolean) => void; pending: boolean };

function CancelButton() {
  return (
    <DialogClose asChild>
      <Button type="button" variant="outline">
        Cancel
      </Button>
    </DialogClose>
  );
}

/**
 * The frame every moderation dialog uses: centred from md up; below md a bottom sheet with the
 * title on top, a scrolling body (description and fields) and the buttons always on screen.
 */
function DialogForm({
  open,
  onOpenChange,
  className,
  title,
  description,
  onSubmit,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
  title: string;
  description: ReactNode;
  onSubmit: () => void;
  children?: ReactNode;
  footer: ReactNode;
}) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(SHEET_BELOW_MD, className)}>
        <form className={SHEET_FORM} onSubmit={submit}>
          <DialogHeader className={SHEET_HEADER}>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className={SHEET_BODY}>
            <DialogDescription asChild>
              <div className="space-y-2">{description}</div>
            </DialogDescription>
            {children}
          </div>
          <DialogFooter className={SHEET_FOOTER}>{footer}</DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
    <DialogForm
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      onSubmit={() => {
        if (reason) onConfirm(reason, note.trim());
      }}
      footer={
        <>
          <CancelButton />
          <Button type="submit" variant="destructive" disabled={!reason || pending}>
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </>
      }
    >
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Reason (required)</legend>
        {REJECT_REASONS.map((r) => (
          <label
            key={r.value}
            className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm max-md:min-h-11 has-checked:border-primary has-checked:bg-secondary has-focus-visible:outline-2 has-focus-visible:outline-ring"
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
    </DialogForm>
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
    <DialogForm
      open={open}
      onOpenChange={onOpenChange}
      className="sm:max-w-2xl"
      title={title}
      description={description}
      onSubmit={() => {
        if (valid) onConfirm(body.trim(), reason.trim());
      }}
      footer={
        <>
          <CancelButton />
          <Button type="submit" disabled={!valid || pending}>
            {pending ? 'Saving…' : confirmLabel}
          </Button>
        </>
      }
    >
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
    </DialogForm>
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
}: Base & {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  destructive?: boolean;
  canConfirm?: boolean;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  return (
    <DialogForm
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      onSubmit={() => {
        if (canConfirm) onConfirm();
      }}
      footer={
        <>
          <CancelButton />
          <Button type="submit" variant={destructive ? 'destructive' : 'default'} disabled={!canConfirm || pending}>
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </DialogForm>
  );
}
