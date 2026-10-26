import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

/** The 6-digit authenticator code. */
export function CodeField({ autoFocus = false }: { autoFocus?: boolean }) {
  return (
    <Field>
      <FieldLabel htmlFor="code">Authenticator code</FieldLabel>
      <Input
        id="code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        autoFocus={autoFocus}
        className="h-11 max-w-48 font-mono text-lg tracking-[0.4em]"
        aria-describedby="code-help"
      />
      <FieldDescription id="code-help">The code changes every 30 seconds.</FieldDescription>
    </Field>
  );
}
