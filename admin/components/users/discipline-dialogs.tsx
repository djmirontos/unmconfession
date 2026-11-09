'use client';

import { useId, useState } from 'react';

import { ConfirmDialog } from '@/components/moderation/dialogs';
import { TAP_BELOW_MD } from '@/components/moderation/mobile-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MUTE_PRESETS, type MuteHours, WARNING_NOTE_MAX, WARNING_REASONS, type WarningReason } from '@/lib/moderation/warnings';

// The Warn and Mute dialogs, shared by the member page and the chat report page (each passes its
// own Server Action). Their fields reset every time they open.

export function ReasonField({
  value,
  onChange,
  label,
  min = 0,
  max,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  min?: number;
  max: number;
}) {
  const id = useId();
  const length = value.trim().length;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} value={value} maxLength={max} rows={3} onChange={(e) => onChange(e.target.value)} />
      <p className="text-right text-xs text-muted-foreground" aria-live="polite">
        {min > 0 && length < min ? `At least ${min} characters · ` : ''}
        {value.length}/{max}
      </p>
    </div>
  );
}

/** The fixed warning reason list as radio buttons. */
function WarningReasonPicker({ value, onChange }: { value: WarningReason | ''; onChange: (v: WarningReason) => void }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">Reason</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {WARNING_REASONS.map((r) => (
          <label
            key={r.value}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-secondary has-focus-visible:outline-2 has-focus-visible:outline-ring ${TAP_BELOW_MD}`}
          >
            <input type="radio" name="warning-reason" checked={value === r.value} onChange={() => onChange(r.value)} className="accent-[var(--primary)]" />
            {r.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Reason, note and length, reset each time the dialog opens. */
function useDisciplineFields(open: boolean) {
  const [reason, setReason] = useState<WarningReason | ''>('');
  const [note, setNote] = useState('');
  const [hours, setHours] = useState<MuteHours>(24);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setReason('');
      setNote('');
      setHours(24);
    }
  }
  return { reason, setReason, note, setNote, hours, setHours };
}

type Base = { open: boolean; onOpenChange: (open: boolean) => void; pending: boolean; name: string };

export function WarnDialog({ open, onOpenChange, pending, name, onSend }: Base & { onSend: (input: { reason: WarningReason; note?: string }) => void }) {
  const f = useDisciplineFields(open);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      pending={pending}
      title={`Send a warning to ${name}`}
      description={<p>The member sees the reason and your note, never your name.</p>}
      confirmLabel="Send warning"
      pendingLabel="Sending…"
      canConfirm={f.reason !== ''}
      onConfirm={() => f.reason && onSend({ reason: f.reason, note: f.note.trim() || undefined })}
    >
      <WarningReasonPicker value={f.reason} onChange={f.setReason} />
      <ReasonField value={f.note} onChange={f.setNote} label="Note for the member (optional)" max={WARNING_NOTE_MAX} />
    </ConfirmDialog>
  );
}

export function MuteDialog({
  open,
  onOpenChange,
  pending,
  name,
  canMute,
  onSend,
}: Base & { canMute: boolean; onSend: (input: { hours: MuteHours; reason: WarningReason; note?: string }) => void }) {
  const f = useDisciplineFields(open);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      pending={pending}
      title={`Mute ${name}`}
      description={
        <>
          <p>The member can still read but cannot post, comment, react or chat until it ends.</p>
          <p>The member sees the reason and your note, never your name.</p>
        </>
      }
      confirmLabel="Mute"
      pendingLabel="Muting…"
      destructive
      canConfirm={f.reason !== '' && canMute}
      onConfirm={() => f.reason && onSend({ hours: f.hours, reason: f.reason, note: f.note.trim() || undefined })}
    >
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">For</legend>
        <div className="flex flex-wrap gap-2">
          {MUTE_PRESETS.map((p) => (
            <label
              key={p.hours}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-secondary has-focus-visible:outline-2 has-focus-visible:outline-ring ${TAP_BELOW_MD}`}
            >
              <input type="radio" name="mute-hours" checked={f.hours === p.hours} onChange={() => f.setHours(p.hours)} className="accent-[var(--primary)]" />
              {p.label}
            </label>
          ))}
        </div>
      </fieldset>
      <WarningReasonPicker value={f.reason} onChange={f.setReason} />
      <ReasonField value={f.note} onChange={f.setNote} label="Note for the member (optional)" max={WARNING_NOTE_MAX} />
    </ConfirmDialog>
  );
}
