'use client';

import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FULLSCREEN_BELOW_MD, TAP_BELOW_MD } from '@/components/moderation/mobile-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { messageFor } from '@/lib/errors';
import { matchContent, matchNickname, matchProfile, type MatchResult } from '@/lib/keywords/match';
import { checkKeyword } from '@/lib/keywords/safety';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  type KeywordInput,
  keywordInputSchema,
  MATCH_LABELS,
  MATCH_TYPES,
  type MatchType,
  SCOPE_LABELS,
  SCOPES,
  type Scope,
  TERM_MAX,
} from '@/lib/keywords/schemas';

// Phones: 44 px tall and 16 px text (smaller text makes iOS zoom in on focus).
const SELECT =
  'h-11 w-full rounded-lg border border-input bg-card px-2.5 text-base focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9 md:text-sm';

const PREVIEW_MAX = 300;

function PreviewOutcome({ result }: { result: MatchResult }) {
  switch (result.kind) {
    case 'match':
      return <span className="font-medium text-destructive">Matches: this would be held (or refused for a nickname).</span>;
    case 'no-match':
      return <span className="font-medium">No match.</span>;
    case 'unsupported':
      return <span className="text-muted-foreground">{result.reason}</span>;
    case 'invalid':
      return <span className="text-muted-foreground">The browser cannot read this pattern, so it cannot be previewed.</span>;
  }
}

type PreviewContext = 'content' | 'nickname' | 'profile';
const PREVIEW_MATCH: Record<PreviewContext, typeof matchContent> = { content: matchContent, nickname: matchNickname, profile: matchProfile };

/** "Try it": the mirrored database rules on a short sample text. */
function Preview({ term, matchType, scopes }: { term: string; matchType: MatchType; scopes: readonly Scope[] }) {
  const [sample, setSample] = useState('');
  const [context, setContext] = useState<PreviewContext>(scopes.length === 1 && (scopes[0] === 'nickname' || scopes[0] === 'profile') ? scopes[0] : 'content');
  const id = useId();
  const t = term.trim();
  const result = t && sample ? PREVIEW_MATCH[context](t, matchType, sample) : null;

  return (
    <section className="space-y-2 rounded-lg border bg-muted/40 p-3" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="text-sm font-medium">
        Preview (mirrors the database rules)
      </h3>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          aria-label="Preview as"
          value={context}
          onChange={(e) => setContext(e.target.value === 'nickname' || e.target.value === 'profile' ? e.target.value : 'content')}
          className={`${SELECT} sm:w-44 sm:shrink-0`}
        >
          <option value="content">Post / comment / listing</option>
          <option value="nickname">Nickname</option>
          <option value="profile">Profile details</option>
        </select>
        <Input
          aria-label="Sample text"
          placeholder={context === 'nickname' ? 'A nickname, e.g. sh1t_lord' : 'Type a sample text'}
          value={sample}
          maxLength={PREVIEW_MAX}
          onChange={(e) => setSample(e.target.value)}
          autoCapitalize="off"
          className="max-md:h-11"
        />
      </div>
      <p className="text-sm" aria-live="polite">
        {result ? <PreviewOutcome result={result} /> : <span className="text-muted-foreground">Type a term and a sample to try it.</span>}
      </p>
      {context === 'nickname' ? (
        <p className="text-xs text-muted-foreground">
          Nicknames: the digits 0 1 3 4 5 7 read as o i e a s t; &ldquo;_&rdquo; and &ldquo;.&rdquo; split words; a broken pattern is skipped.
        </p>
      ) : context === 'profile' ? (
        <p className="text-xs text-muted-foreground">
          Profile details: the post rules, also with the digits 0 1 3 4 5 7 read as o i e a s t; a broken pattern is skipped. Links,
          &ldquo;@&rdquo;, phone numbers and contact-app names are refused separately.
        </p>
      ) : matchType === 'regex' ? (
        <p className="text-xs text-muted-foreground">
          Regular expressions run in PostgreSQL. Patterns that use PostgreSQL-only syntax cannot be previewed here, and
          \w, \d and \s may treat non-English letters differently.
        </p>
      ) : null}
    </section>
  );
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  title: string;
  confirmLabel: string;
  initial: KeywordInput;
  onSubmit: (input: KeywordInput) => void;
};

/** Add or edit a keyword. Remount it on every opening (key) so it starts from `initial`. */
export function KeywordDialog({ open, onOpenChange, pending, title, confirmLabel, initial, onSubmit }: Props) {
  const [term, setTerm] = useState(initial.term);
  const [matchType, setMatchType] = useState<MatchType>(initial.match_type);
  const [category, setCategory] = useState(initial.category);
  const [scopes, setScopes] = useState<Scope[]>(initial.applies_to);
  const [active, setActive] = useState(initial.active);
  const ids = { term: useId(), match: useId(), category: useId(), active: useId() };

  const input = { term, match_type: matchType, category, applies_to: scopes, active };
  const parsed = keywordInputSchema.safeParse(input);
  const check = checkKeyword(term, matchType);
  const canSave = parsed.success && check.errors.length === 0 && !pending;
  const toggleScope = (s: Scope) => setScopes((list) => (list.includes(s) ? list.filter((x) => x !== s) : SCOPES.filter((x) => x === s || list.includes(x))));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Phones: full screen; header, a scrolling body (form and preview), and the footer always on screen. */}
      <DialogContent className={`flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-lg ${FULLSCREEN_BELOW_MD}`}>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            if (parsed.success && canSave) onSubmit(parsed.data);
          }}
        >
          <DialogHeader className="shrink-0 px-4 pt-4 pr-12 pb-3 max-md:pr-14">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>A match holds the post for review. With the Nicknames scope, the name is refused.</DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 pb-4">
          <div className="space-y-2">
            <Label htmlFor={ids.term}>Term</Label>
            <Input
              id={ids.term}
              value={term}
              maxLength={TERM_MAX}
              onChange={(e) => setTerm(e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="max-md:h-11"
            />
            <p className="text-right text-xs text-muted-foreground">
              {term.trim().length}/{TERM_MAX}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={ids.match}>Match type</Label>
              <select id={ids.match} value={matchType} onChange={(e) => setMatchType(MATCH_TYPES.find((m) => m === e.target.value) ?? 'word')} className={SELECT}>
                {MATCH_TYPES.map((m) => (
                  <option key={m} value={m}>
                    {MATCH_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={ids.category}>Category</Label>
              <select id={ids.category} value={category} onChange={(e) => setCategory(CATEGORIES.find((c) => c === e.target.value) ?? 'other')} className={SELECT}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">Applies to (at least one)</legend>
            <div className="flex flex-wrap gap-2">
              {SCOPES.map((s) => (
                <label
                  key={s}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-secondary has-focus-visible:outline-2 has-focus-visible:outline-ring md:min-h-0"
                >
                  <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggleScope(s)} className="size-4 accent-[var(--primary)]" />
                  {SCOPE_LABELS[s]}
                </label>
              ))}
            </div>
            {scopes.length === 0 ? <p className="text-xs text-destructive">Choose at least one.</p> : null}
          </fieldset>

          <label htmlFor={ids.active} className="flex min-h-11 cursor-pointer items-center gap-2 self-start text-sm font-medium md:min-h-0">
            <input id={ids.active} type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-4 accent-[var(--primary)]" />
            Active
          </label>

          {check.errors.map((code) => (
            <p key={code} role="alert" className="text-sm font-medium text-destructive">
              {messageFor(code)}
            </p>
          ))}
          {check.warnings.map((w) => (
            <p key={w} className="text-sm text-amber-700 dark:text-amber-400">
              {w}
            </p>
          ))}

          <Preview term={term} matchType={matchType} scopes={scopes} />
          </div>

          <DialogFooter className="mx-0 mb-0 shrink-0 max-md:rounded-none max-md:pb-[max(1rem,env(safe-area-inset-bottom))]">
            <DialogClose asChild>
              <Button type="button" variant="outline" className={TAP_BELOW_MD}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!canSave} aria-busy={pending} className={TAP_BELOW_MD}>
              {pending ? 'Saving…' : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
