'use client';

import { Eraser, ImageOff, type LucideIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { clearProfileDetails, removeAvatar } from '@/app/(panel)/users/actions';
import { ConfirmDialog } from '@/components/moderation/dialogs';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PROFILE_REASON_MAX } from '@/lib/moderation/avatar';
import type { ActionResult } from '@/lib/result';

type User = { id: string; nickname: string | null };

type ToolProps = {
  user: User;
  /** Prefilled reason (from the report reasons on a profile report). */
  defaultReason?: string;
  /** Said after success: on a report page the reports stay open. */
  successMessage?: string;
  size?: 'default' | 'lg';
};

type Config = {
  icon: LucideIcon;
  label: string;
  title: string;
  description: (name: string) => string;
  confirmLabel: string;
  pendingLabel: string;
  defaultSuccess: string;
  run: (input: { user: string; reason?: string }) => Promise<ActionResult>;
};

/** One profile tool (Remove avatar, Clear details): a destructive button and its confirm dialog with an optional reason. */
function ProfileToolButton({ config, user, defaultReason = '', successMessage, size = 'default' }: ToolProps & { config: Config }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(defaultReason);
  const fieldId = useId();
  const Icon = config.icon;

  const openDialog = () => {
    setReason(defaultReason);
    setOpen(true);
  };

  const confirm = () => {
    if (busy.current) return;
    busy.current = true;
    startTransition(async () => {
      try {
        const result = await config.run({ user: user.id, reason: reason.trim() || undefined });
        setOpen(false);
        if (result.ok) toast.success(successMessage ?? config.defaultSuccess);
        else toast.error(result.message);
        // Also after an error: someone else may already have done it.
        router.refresh();
      } finally {
        busy.current = false;
      }
    });
  };

  return (
    <>
      <Button size={size} variant="destructive" onClick={openDialog} disabled={pending}>
        <Icon aria-hidden="true" /> {config.label}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        pending={pending}
        destructive
        title={config.title}
        description={<p>{config.description(user.nickname ?? 'This user')}</p>}
        confirmLabel={config.confirmLabel}
        pendingLabel={config.pendingLabel}
        onConfirm={confirm}
      >
        <div className="space-y-2">
          <Label htmlFor={fieldId}>Reason (optional, kept in the moderation log)</Label>
          <Textarea id={fieldId} value={reason} maxLength={PROFILE_REASON_MAX} rows={3} onChange={(e) => setReason(e.target.value)} />
          <p className="text-right text-xs text-muted-foreground" aria-live="polite">
            {reason.length}/{PROFILE_REASON_MAX}
          </p>
        </div>
      </ConfirmDialog>
    </>
  );
}

const REMOVE_AVATAR: Config = {
  icon: ImageOff,
  label: 'Remove avatar…',
  title: 'Remove this profile picture',
  description: (name) => `${name}'s picture is replaced by the default avatar everywhere in the app. The member can upload a new one.`,
  confirmLabel: 'Remove avatar',
  pendingLabel: 'Removing…',
  defaultSuccess: 'Profile picture removed.',
  run: removeAvatar,
};

const CLEAR_DETAILS: Config = {
  icon: Eraser,
  label: 'Clear details…',
  title: 'Clear these profile details',
  description: (name) =>
    `${name}'s college, course, year level, hobbies and About me are emptied. Their show switch stays as it is, and they can add new details.`,
  confirmLabel: 'Clear details',
  pendingLabel: 'Clearing…',
  defaultSuccess: 'Profile details cleared.',
  run: clearProfileDetails,
};

/** "Remove avatar…": resets a custom picture to the default preset through mod_remove_avatar. */
export function RemoveAvatarButton(props: ToolProps) {
  return <ProfileToolButton config={REMOVE_AVATAR} {...props} />;
}

/** "Clear details…": empties the member's profile details through mod_clear_profile_details. */
export function ClearDetailsButton(props: ToolProps) {
  return <ProfileToolButton config={CLEAR_DETAILS} {...props} />;
}
