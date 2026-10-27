'use client';

import { useActionState, useId } from 'react';

import { findUserByEmail } from '@/app/(panel)/users/actions';
import { FormError, SubmitButton } from '@/components/auth/form-parts';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Admin only. The address is sent in the form body, never in the URL. */
export function EmailLookup() {
  const [state, action] = useActionState(findUserByEmail, null);
  const id = useId();
  return (
    <form action={action} className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1 space-y-1.5">
          <Label htmlFor={id}>Find by email (admins)</Label>
          <Input id={id} name="email" type="email" autoComplete="off" required maxLength={254} />
        </div>
        <div className="w-32">
          <SubmitButton label="Find" pendingLabel="Finding…" />
        </div>
      </div>
      <FormError message={state && !state.ok ? state.message : null} />
      <p className="text-xs text-muted-foreground">
        Each lookup is written to the audit log. The address you type is not stored.
      </p>
    </form>
  );
}
