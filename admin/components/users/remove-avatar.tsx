'use client';

import { ImageOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { removeAvatar } from '@/app/(panel)/users/actions';
import { ConfirmDialog } from '@/components/moderation/dialogs';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AVATAR_REASON_MAX } from '@/lib/moderation/avatar';

type Props = {
  user: { id: string; nickname: string | null };
  /** Prefilled reason (from the report reasons on a profile report). */
  defaultReason?: string;
  /** Said after success: on a report page the reports stay open. */
  successMessage?: string;
  size?: 'default' | 'lg';
};

/** "Remove avatar…": resets a custom picture to the default preset through mod_remove_avatar. */
export function RemoveAvatarButton({ user, defaultReason = '', successMessage = 'Profile picture removed.', size = 'default' }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(defaultReason);
  const fieldId = useId();

  const openDialog = () => {
    setReason(defaultReason);
    setOpen(true);
  };

  const confirm = () => {
    if (busy.current) return;
    busy.current = true;
    startTransition(async () => {
      try {
        const result = await removeAvatar({ user: user.id, reason: reason.trim() || undefined });
        setOpen(false);
        if (!result.ok) {
          toast.error(result.message);
          // no_custom_avatar: someone else already removed it; show the preset.
          router.refresh();
          return;
        }
        toast.success(successMessage);
        router.refresh();
      } finally {
        busy.current = false;
      }
    });
  };

  return (
    <>
      <Button size={size} variant="destructive" onClick={openDialog} disabled={pending}>
        <ImageOff aria-hidden="true" /> Remove avatar…
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        pending={pending}
        destructive
        title="Remove this profile picture"
        description={
          <p>
            {user.nickname ?? 'This user'}&apos;s picture is replaced by the default avatar everywhere in the app. The member can upload a new one.
          </p>
        }
        confirmLabel="Remove avatar"
        pendingLabel="Removing…"
        onConfirm={confirm}
      >
        <div className="space-y-2">
          <Label htmlFor={fieldId}>Reason (optional, kept in the moderation log)</Label>
          <Textarea id={fieldId} value={reason} maxLength={AVATAR_REASON_MAX} rows={3} onChange={(e) => setReason(e.target.value)} />
          <p className="text-right text-xs text-muted-foreground" aria-live="polite">
            {reason.length}/{AVATAR_REASON_MAX}
          </p>
        </div>
      </ConfirmDialog>
    </>
  );
}
