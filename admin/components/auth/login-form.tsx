'use client';

import { useActionState } from 'react';

import { signIn } from '@/app/(auth)/actions';
import { FormError, SubmitButton } from '@/components/auth/form-parts';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

export function LoginForm() {
  const [state, action] = useActionState(signIn, null);

  return (
    <form action={action} className="space-y-6" noValidate>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" name="email" type="email" autoComplete="username" required maxLength={254} />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input id="password" name="password" type="password" autoComplete="current-password" required maxLength={256} />
        </Field>
      </FieldGroup>
      <FormError message={state && !state.ok ? state.message : null} />
      <SubmitButton label="Continue" pendingLabel="Checking…" />
    </form>
  );
}
