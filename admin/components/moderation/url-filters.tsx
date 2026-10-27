'use client';

import { Search } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useState, useTransition } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Filters live in the URL so the list is rendered on the server and links can be shared.
// No personal data goes in the URL (nickname or text search only, never an email).

function useSetParam() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const set = (name: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(name, value);
    else next.delete(name);
    const query = next.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  };
  return { value: (name: string) => params.get(name) ?? '', set, pending };
}

/** Text search, applied 350 ms after typing stops. */
export function SearchBox({ name = 'q', label, placeholder }: { name?: string; label: string; placeholder: string }) {
  const { value, set, pending } = useSetParam();
  const [text, setText] = useState(value(name));
  const id = useId();
  const current = value(name);

  useEffect(() => {
    if (text.trim() === current) return;
    const timer = setTimeout(() => set(name, text.trim() || null), 350);
    return () => clearTimeout(timer);
  });

  return (
    <div className="min-w-56 flex-1 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          id={id}
          type="search"
          value={text}
          maxLength={100}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          className="pl-8"
          aria-busy={pending}
        />
      </div>
    </div>
  );
}

export function SelectFilter({
  name,
  label,
  options,
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
}) {
  const { value, set } = useSetParam();
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value(name)}
        onChange={(e) => set(name, e.target.value || null)}
        className="h-8 w-full rounded-lg border border-input bg-card px-2.5 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ToggleFilter({ name, label }: { name: string; label: string }) {
  const { value, set } = useSetParam();
  const id = useId();
  return (
    <div className="flex items-center gap-2 self-end pb-1.5">
      <input
        id={id}
        type="checkbox"
        checked={value(name) === '1'}
        onChange={(e) => set(name, e.target.checked ? '1' : null)}
        className="size-4 accent-[var(--primary)]"
      />
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
}
