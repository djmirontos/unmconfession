'use client';

import { Ban, Eye, EyeOff, PencilLine, RotateCcw, ShieldCheck, Timer, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import {
  banUser,
  deleteAccount,
  type Identity,
  renameUser,
  restoreUser,
  revealIdentity,
  setUserRole,
  suspendUser,
} from '@/app/(panel)/users/actions';
import { ConfirmDialog } from '@/components/moderation/dialogs';
import { ACTION_GRID, TAP_BELOW_MD } from '@/components/moderation/mobile-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { UserActions as Available } from '@/lib/moderation/availability';
import { ROLE_HELP } from '@/lib/moderation/labels';
import { DELETE_REASON_MAX, NICKNAME_PATTERN, ROLES, STATUS_REASON_MAX, STATUS_REASON_MIN } from '@/lib/moderation/schemas';
import { isFuture, manilaLocalToUtc, presetUntil, SUSPENSION_PRESETS, type PresetValue } from '@/lib/moderation/suspension';
import type { ActionResult } from '@/lib/result';

type Role = (typeof ROLES)[number];
type DialogName = 'suspend' | 'ban' | 'restore' | 'role' | 'rename' | 'delete' | null;

type Props = {
  user: { id: string; nickname: string | null; role: Role; status: string };
  available: Available;
};

function ReasonField({
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

export function UserActions({ user, available }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);

  // Dialog form state (reset each time a dialog opens).
  const [reason, setReason] = useState('');
  const [preset, setPreset] = useState<PresetValue | 'custom'>('7d');
  const [custom, setCustom] = useState('');
  const [role, setRole] = useState<Role>(user.role);
  const [nickname, setNickname] = useState(user.nickname ?? '');
  const [confirmText, setConfirmText] = useState('');

  const open = (name: Exclude<DialogName, null>) => {
    setReason('');
    setPreset('7d');
    setCustom('');
    setRole(user.role);
    setNickname(user.nickname ?? '');
    setConfirmText('');
    setDialog(name);
  };
  const onOpenChange = (name: Exclude<DialogName, null>) => (o: boolean) => (o ? open(name) : setDialog(null));

  const run = <T,>(call: () => Promise<ActionResult<T>>, onOk: (data: T) => void) => {
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
        onOk(result.data);
      } finally {
        busy.current = false;
      }
    });
  };
  const done = (message: string) => () => {
    toast.success(message);
    router.refresh();
  };

  const until = preset === 'custom' ? manilaLocalToUtc(custom) : presetUntil(preset);
  const untilValid = until !== null && isFuture(until);
  const reasonOk = reason.trim().length >= STATUS_REASON_MIN;
  const name = user.nickname ?? 'this user';
  const anyAction = Object.values(available).some(Boolean);

  if (!anyAction) {
    return <p className="text-sm text-muted-foreground">No actions are available for this account.</p>;
  }

  return (
    <div className="space-y-6">
      <div className={ACTION_GRID}>
        {available.suspend ? (
          <Button variant="outline" onClick={() => open('suspend')} disabled={pending}>
            <Timer aria-hidden="true" /> {user.status === 'suspended' ? 'Change suspension…' : 'Suspend…'}
          </Button>
        ) : null}
        {available.ban ? (
          <Button variant="destructive" onClick={() => open('ban')} disabled={pending}>
            <Ban aria-hidden="true" /> Ban…
          </Button>
        ) : null}
        {available.restore ? (
          <Button onClick={() => open('restore')} disabled={pending}>
            <RotateCcw aria-hidden="true" /> Restore account…
          </Button>
        ) : null}
      </div>

      {available.changeRole || available.rename || available.revealIdentity || available.deleteAccount ? (
        <div className="space-y-3 rounded-lg border border-dashed p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Admin only</p>
          <div className={ACTION_GRID}>
            {available.changeRole ? (
              <Button variant="outline" onClick={() => open('role')} disabled={pending}>
                <ShieldCheck aria-hidden="true" /> Change role…
              </Button>
            ) : null}
            {available.rename ? (
              <Button variant="outline" onClick={() => open('rename')} disabled={pending}>
                <PencilLine aria-hidden="true" /> Rename…
              </Button>
            ) : null}
            {available.revealIdentity ? (
              identity ? (
                <Button variant="outline" onClick={() => setIdentity(null)}>
                  <EyeOff aria-hidden="true" /> Hide email
                </Button>
              ) : (
                <Button variant="outline" onClick={() => run(() => revealIdentity(user.id), setIdentity)} disabled={pending}>
                  <Eye aria-hidden="true" /> Reveal email and sign-in details
                </Button>
              )
            ) : null}
            {available.deleteAccount ? (
              <Button variant="destructive" onClick={() => open('delete')} disabled={pending}>
                <Trash2 aria-hidden="true" /> Delete account…
              </Button>
            ) : null}
          </div>
          {available.revealIdentity && !identity ? (
            <p className="text-xs text-muted-foreground">Revealing the email is written to the audit log with your name.</p>
          ) : null}
          {identity ? (
            <Card className="bg-muted/40">
              <CardHeader>
                <CardTitle>
                  <h2 className="text-sm">Sign-in details (logged view)</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">Email</dt>
                    <dd className="break-all font-medium">{identity.email}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Email confirmed</dt>
                    <dd>{identity.confirmed ? 'Yes' : 'No'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Last sign-in</dt>
                    <dd>{identity.lastSignIn}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Sign-in methods</dt>
                    <dd>{identity.providers.length ? identity.providers.join(', ') : '—'}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={dialog === 'suspend'}
        onOpenChange={onOpenChange('suspend')}
        pending={pending}
        title={`Suspend ${name}`}
        description={<p>They cannot post, comment, react or vote until the end date. Reading stays open.</p>}
        confirmLabel="Suspend"
        pendingLabel="Suspending…"
        destructive
        canConfirm={untilValid && reasonOk}
        onConfirm={() => until && run(() => suspendUser({ user: user.id, until, reason }), done('Account suspended.'))}
      >
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">Until</legend>
          <div className="flex flex-wrap gap-2">
            {SUSPENSION_PRESETS.map((p) => (
              <label
                key={p.value}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-secondary has-focus-visible:outline-2 has-focus-visible:outline-ring ${TAP_BELOW_MD}`}
              >
                <input type="radio" name="until" checked={preset === p.value} onChange={() => setPreset(p.value)} className="accent-[var(--primary)]" />
                {p.label}
              </label>
            ))}
            <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-secondary has-focus-visible:outline-2 has-focus-visible:outline-ring ${TAP_BELOW_MD}`}>
              <input type="radio" name="until" checked={preset === 'custom'} onChange={() => setPreset('custom')} className="accent-[var(--primary)]" />
              Pick a date
            </label>
          </div>
          {preset === 'custom' ? (
            <div className="space-y-1.5 pt-2">
              <Label htmlFor="suspend-until">End (Manila time)</Label>
              <Input id="suspend-until" type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} aria-invalid={custom !== '' && !untilValid} />
              {custom !== '' && !untilValid ? <p className="text-xs text-destructive">Choose a time in the future.</p> : null}
            </div>
          ) : null}
        </fieldset>
        <ReasonField value={reason} onChange={setReason} label="Reason (required, the member does not see it)" min={STATUS_REASON_MIN} max={STATUS_REASON_MAX} />
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'ban'}
        onOpenChange={onOpenChange('ban')}
        pending={pending}
        title={`Ban ${name}`}
        description={<p>A ban has no end date. They keep reading access but cannot take part until an admin or moderator restores the account.</p>}
        confirmLabel="Ban account"
        pendingLabel="Banning…"
        destructive
        canConfirm={reasonOk}
        onConfirm={() => run(() => banUser({ user: user.id, reason }), done('Account banned.'))}
      >
        <ReasonField value={reason} onChange={setReason} label="Reason (required)" min={STATUS_REASON_MIN} max={STATUS_REASON_MAX} />
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'restore'}
        onOpenChange={onOpenChange('restore')}
        pending={pending}
        title={`Restore ${name}`}
        description={<p>The account becomes active again and the stored reason is cleared.</p>}
        confirmLabel="Restore account"
        pendingLabel="Restoring…"
        onConfirm={() => run(() => restoreUser({ user: user.id, reason: reason || undefined }), done('Account restored.'))}
      >
        <ReasonField value={reason} onChange={setReason} label="Note for the log (optional)" max={STATUS_REASON_MAX} />
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'role'}
        onOpenChange={onOpenChange('role')}
        pending={pending}
        title={`Change the role of ${name}`}
        description={<p>The change is written to the audit log.</p>}
        confirmLabel="Change role"
        pendingLabel="Saving…"
        canConfirm={role !== user.role}
        onConfirm={() => run(() => setUserRole({ user: user.id, role }), done('Role changed.'))}
      >
        <fieldset className="space-y-2">
          <legend className="sr-only">Role</legend>
          {ROLES.map((r) => (
            <label
              key={r}
              className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm max-md:min-h-11 has-checked:border-primary has-checked:bg-secondary has-focus-visible:outline-2 has-focus-visible:outline-ring"
            >
              <input type="radio" name="role" checked={role === r} onChange={() => setRole(r)} className="mt-0.5 accent-[var(--primary)]" />
              <span>
                <span className="font-medium capitalize">{r}</span>
                {r === user.role ? <span className="text-muted-foreground"> (current)</span> : null}
                <span className="block text-muted-foreground">{ROLE_HELP[r]}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'rename'}
        onOpenChange={onOpenChange('rename')}
        pending={pending}
        title={`Rename ${name}`}
        description={<p>The new nickname shows on all their posts and comments, old ones included.</p>}
        confirmLabel="Rename"
        pendingLabel="Saving…"
        canConfirm={NICKNAME_PATTERN.test(nickname.trim()) && nickname.trim() !== user.nickname}
        onConfirm={() => run(() => renameUser({ user: user.id, nickname: nickname.trim() }), done('Nickname changed.'))}
      >
        <div className="space-y-1.5">
          <Label htmlFor="rename-nickname">New nickname</Label>
          <Input id="rename-nickname" value={nickname} maxLength={20} onChange={(e) => setNickname(e.target.value)} autoComplete="off" />
          <p className="text-xs text-muted-foreground">3 to 20 letters, digits, underscores or dots.</p>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={onOpenChange('delete')}
        pending={pending}
        title={`Delete the account of ${name}`}
        description={
          <>
            <p>This cannot be undone. Deleting the account:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>removes their sign-in, so they can no longer log in;</li>
              <li>keeps their posts, comments and listings, shown as &ldquo;Deleted user&rdquo;;</li>
              <li>erases their own blocks, notifications and settings;</li>
              <li>closes their open listings.</li>
            </ul>
          </>
        }
        confirmLabel="Delete account"
        pendingLabel="Deleting…"
        destructive
        canConfirm={reason.trim().length > 0 && user.nickname !== null && confirmText.trim() === user.nickname}
        onConfirm={() => run(() => deleteAccount({ user: user.id, reason, confirm: confirmText }), done('Account deleted.'))}
      >
        <ReasonField value={reason} onChange={setReason} label="Reason (required, kept in the audit log)" min={1} max={DELETE_REASON_MAX} />
        <div className="space-y-1.5">
          <Label htmlFor="delete-confirm">
            Type <strong>{user.nickname}</strong> to confirm
          </Label>
          <Input id="delete-confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
        </div>
      </ConfirmDialog>
    </div>
  );
}
