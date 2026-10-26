'use client';

import { useActionState } from 'react';

import { confirmEnrollment, startEnrollment } from '@/app/(auth)/actions';
import { CodeField } from '@/components/auth/code-field';
import { FormError, SubmitButton } from '@/components/auth/form-parts';

/** Step 1: create the authenticator (QR + secret). Step 2: confirm it with a code. */
export function EnrollFlow() {
  const [setup, start] = useActionState(startEnrollment, null);
  const [confirm, confirmAction] = useActionState(confirmEnrollment, null);

  if (!setup || !setup.ok) {
    return (
      <form action={start} className="space-y-6">
        <p className="text-sm text-muted-foreground">
          You will need an authenticator app such as Google Authenticator, Microsoft Authenticator or 1Password.
        </p>
        <FormError message={setup && !setup.ok ? setup.message : null} />
        <SubmitButton label="Set up authenticator" pendingLabel="Preparing…" />
      </form>
    );
  }

  const { factorId, qrCode, secret } = setup.data;
  return (
    <div className="space-y-6">
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>Open your authenticator app and scan this code.</li>
        <li>Enter the 6-digit code it shows.</li>
      </ol>
      <div className="flex justify-center rounded-lg border bg-white p-4">
        {/* Supabase returns the QR code as an SVG data URL; no external request. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrCode} alt="QR code for your authenticator app" width={192} height={192} className="size-48" />
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Can&apos;t scan? Enter the key instead</summary>
        <p className="mt-2 break-all rounded-md bg-muted p-3 font-mono text-xs" aria-label="Setup key">
          {secret}
        </p>
      </details>
      <form action={confirmAction} className="space-y-6">
        <input type="hidden" name="factorId" value={factorId} />
        <CodeField autoFocus />
        <FormError message={confirm && !confirm.ok ? confirm.message : null} />
        <SubmitButton label="Confirm and continue" pendingLabel="Confirming…" />
      </form>
    </div>
  );
}
