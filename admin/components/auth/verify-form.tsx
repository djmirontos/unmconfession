'use client';

import { useActionState } from 'react';

import { verifyCode } from '@/app/(auth)/actions';
import { CodeField } from '@/components/auth/code-field';
import { FormError, SubmitButton } from '@/components/auth/form-parts';

export function VerifyForm() {
  const [state, action] = useActionState(verifyCode, null);

  return (
    <form action={action} className="space-y-6">
      <CodeField autoFocus />
      <FormError message={state && !state.ok ? state.message : null} />
      <SubmitButton label="Verify and sign in" pendingLabel="Verifying…" />
    </form>
  );
}
