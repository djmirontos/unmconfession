'use client';

import { X } from 'lucide-react';
import { useId, useState } from 'react';

import { FULLSCREEN_BELOW_MD, TAP_BELOW_MD } from '@/components/moderation/mobile-dialog';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { type AnnouncementForm, BODY_MAX, checkAnnouncement, MAX_AHEAD_MS, TITLE_MAX } from '@/lib/announcements/schemas';
import { isoToManilaInput } from '@/lib/announcements/time';
import { messageFor } from '@/lib/errors';

type StartMode = 'now' | 'schedule' | 'keep';

export type AnnouncementDraft = {
  title: string;
  body: string;
  startMode: StartMode;
  /** Manila "YYYY-MM-DDTHH:mm" for the Schedule input. */
  startAt: string;
  /** Manila end, or null for "No end date". */
  end: string | null;
  /** Editing: the stored start (UTC ISO) and how it reads in Manila time; enables "Keep the current start". */
  stored: { iso: string; exact: string } | null;
};

// Shown as soon as they apply; empty text only disables the button.
const DATE_CODES = new Set(['announcement_date_invalid', 'announcement_start_too_far', 'announcement_end_before_start']);

/** How the card reads in the app: only the body, with its line breaks, and a close icon (the title is never shown). */
function Preview({ body }: { body: string }) {
  const id = useId();
  return (
    <section className="space-y-2" aria-labelledby={id}>
      <h3 id={id} className="text-sm font-medium">
        Preview
      </h3>
      <div className="relative rounded-xl border bg-card p-4 pr-11 shadow-xs">
        <X className="absolute top-3.5 right-3.5 size-4 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm break-words whitespace-pre-wrap text-foreground/90">
          {body.trim() || <span className="text-muted-foreground">Message</span>}
        </p>
      </div>
    </section>
  );
}

export const TITLE_NOTE = 'Users never see it; it names the announcement in this panel.';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  title: string;
  confirmLabel: string;
  initial: AnnouncementDraft;
  /** The page's request time: the 1-year limit and the default times. The server checks again. */
  now: number;
  onSubmit: (form: AnnouncementForm) => void;
};

/** Create or edit an announcement. Remount it on every opening (key) so it starts from `initial`. */
export function AnnouncementDialog({ open, onOpenChange, pending, title, confirmLabel, initial, now, onSubmit }: Props) {
  const [heading, setHeading] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [startMode, setStartMode] = useState<StartMode>(initial.startMode);
  const [startAt, setStartAt] = useState(initial.startAt);
  const [hasEnd, setHasEnd] = useState(initial.end !== null);
  const [end, setEnd] = useState(initial.end ?? initial.startAt);
  const ids = { title: useId(), body: useId(), start: useId(), end: useId(), noEnd: useId() };

  const form: AnnouncementForm = {
    title: heading,
    body,
    start: startMode === 'schedule' ? { mode: 'schedule', at: startAt } : { mode: startMode },
    end: hasEnd ? end : null,
  };
  const checked = checkAnnouncement(form, now, initial.stored?.iso ?? null);
  const dateError = !checked.ok && DATE_CODES.has(checked.code) ? checked.code : null;
  const canSave = checked.ok && !pending;
  const maxInput = isoToManilaInput(new Date(now + MAX_AHEAD_MS).toISOString());

  const startOptions: { mode: StartMode; label: string }[] = [
    ...(initial.stored ? [{ mode: 'keep' as const, label: `Keep the current start (${initial.stored.exact})` }] : []),
    { mode: 'now', label: 'Publish now' },
    { mode: 'schedule', label: 'Schedule' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Phones: full screen; header, a scrolling body (form and preview), and the footer always on screen. */}
      <DialogContent className={`flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-lg ${FULLSCREEN_BELOW_MD}`}>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave) onSubmit(form);
          }}
        >
          <DialogHeader className="shrink-0 px-4 pt-4 pr-12 pb-3 max-md:pr-14">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>Plain text only: line breaks are kept, links are not clickable. Times are Manila time.</DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 pb-4">
            <div className="space-y-2">
              <Label htmlFor={ids.title}>Internal title (only staff see this)</Label>
              <Input
                id={ids.title}
                value={heading}
                maxLength={TITLE_MAX}
                onChange={(e) => setHeading(e.target.value)}
                autoComplete="off"
                aria-describedby={`${ids.title}-note`}
                className="max-md:h-11"
              />
              <div className="flex gap-2 text-xs text-muted-foreground">
                <p id={`${ids.title}-note`} className="flex-1">
                  {TITLE_NOTE}
                </p>
                <p aria-live="polite">
                  {heading.trim().length}/{TITLE_MAX}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor={ids.body}>Message (what users see)</Label>
              <Textarea id={ids.body} value={body} maxLength={BODY_MAX} onChange={(e) => setBody(e.target.value)} rows={5} className="max-h-72" />
              <p className="text-right text-xs text-muted-foreground" aria-live="polite">
                {body.trim().length}/{BODY_MAX}
              </p>
            </div>

            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium">Start</legend>
              <div className="flex flex-col gap-1">
                {startOptions.map((o) => (
                  <label key={o.mode} className={`flex cursor-pointer items-center gap-2 text-sm ${TAP_BELOW_MD}`}>
                    <input
                      type="radio"
                      name="start"
                      checked={startMode === o.mode}
                      onChange={() => setStartMode(o.mode)}
                      className="size-4 accent-[var(--primary)]"
                    />
                    {o.label}
                  </label>
                ))}
              </div>
              {startMode === 'schedule' ? (
                <div className="space-y-1.5">
                  <Label htmlFor={ids.start}>Start (Manila time)</Label>
                  <Input
                    id={ids.start}
                    type="datetime-local"
                    value={startAt}
                    max={maxInput}
                    onChange={(e) => setStartAt(e.target.value)}
                    className="max-md:h-11"
                  />
                </div>
              ) : null}
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium">End</legend>
              <label htmlFor={ids.noEnd} className={`flex cursor-pointer items-center gap-2 self-start text-sm ${TAP_BELOW_MD}`}>
                <input id={ids.noEnd} type="checkbox" checked={!hasEnd} onChange={(e) => setHasEnd(!e.target.checked)} className="size-4 accent-[var(--primary)]" />
                No end date
              </label>
              {hasEnd ? (
                <div className="space-y-1.5">
                  <Label htmlFor={ids.end}>End (Manila time)</Label>
                  <Input id={ids.end} type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className="max-md:h-11" />
                </div>
              ) : null}
            </fieldset>

            {dateError ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                {messageFor(dateError)}
              </p>
            ) : null}

            <Preview body={body} />
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
