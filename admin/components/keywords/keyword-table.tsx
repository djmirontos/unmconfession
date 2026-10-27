'use client';

import { PencilLine, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { createKeyword, deleteKeyword, setKeywordActive, updateKeyword } from '@/app/(panel)/keywords/actions';
import { KeywordDialog } from '@/components/keywords/keyword-dialog';
import { ConfirmDialog } from '@/components/moderation/dialogs';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { KeywordRow } from '@/lib/keywords/data';
import { CATEGORY_LABELS, type KeywordInput, MATCH_LABELS, SCOPE_LABELS } from '@/lib/keywords/schemas';
import type { ActionResult } from '@/lib/result';

const NEW_KEYWORD: KeywordInput = { term: '', match_type: 'word', category: 'other', applies_to: ['post', 'comment', 'listing'], active: true };

type Dialog = { kind: 'add' } | { kind: 'edit'; row: KeywordRow } | { kind: 'delete'; row: KeywordRow } | null;

/** On / off switch. `large` gives it a 44 x 44 px tap area (phone cards); the track looks the same. */
function ActiveSwitch({ row, disabled, onToggle, large = false }: { row: KeywordRow; disabled: boolean; onToggle: () => void; large?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={row.active}
      aria-label={`${row.active ? 'Deactivate' : 'Activate'} ${row.term}`}
      disabled={disabled}
      onClick={onToggle}
      className={`inline-flex items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 ${large ? 'min-h-11 min-w-11' : ''}`}
    >
      <span className={`inline-flex h-6 w-11 items-center rounded-full border transition-colors ${row.active ? 'bg-primary' : 'bg-muted'}`}>
        <span className={`size-4 rounded-full bg-background shadow transition-transform ${row.active ? 'translate-x-5' : 'translate-x-1'}`} />
      </span>
    </button>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border px-2 py-0.5 text-xs">{children}</span>;
}

/** Add button plus the table (or the empty state passed in). Every change goes through a Server Action. */
export function KeywordTable({ rows, empty }: { rows: KeywordRow[]; empty: React.ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  // Remounts the add / edit dialog on every opening so it starts fresh.
  const [opening, setOpening] = useState(0);

  const run = (call: () => Promise<ActionResult>, success: string) => {
    if (busy.current) return;
    busy.current = true;
    startTransition(async () => {
      try {
        const result = await call();
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        setDialog(null);
        toast.success(success);
        router.refresh();
      } finally {
        busy.current = false;
      }
    });
  };
  const open = (d: Exclude<Dialog, null>) => {
    setOpening((n) => n + 1);
    setDialog(d);
  };
  const close = (o: boolean) => {
    if (!o) setDialog(null);
  };
  const toggle = (row: KeywordRow) => () =>
    run(() => setKeywordActive({ id: row.id, active: !row.active }), row.active ? 'Keyword turned off.' : 'Keyword turned on.');

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => open({ kind: 'add' })} disabled={pending} className="max-md:min-h-11 max-md:w-full">
          <Plus aria-hidden="true" /> Add keyword
        </Button>
      </div>

      {rows.length === 0 ? (
        empty
      ) : (
        <>
        {/* Phones: one card per keyword. */}
        <ul className="space-y-3 md:hidden" aria-label="Keywords">
          {rows.map((row) => (
            <li key={row.id} className={`space-y-3 rounded-lg border bg-card p-4 shadow-xs ${row.active ? '' : 'text-muted-foreground'}`}>
              <p className="font-mono text-sm font-semibold break-all whitespace-pre-wrap">{row.term}</p>
              <div className="flex flex-wrap gap-1.5">
                <Chip>{MATCH_LABELS[row.matchType]}</Chip>
                <Chip>{CATEGORY_LABELS[row.category]}</Chip>
                {row.appliesTo.map((s) => (
                  <Chip key={s}>{SCOPE_LABELS[s]}</Chip>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ActiveSwitch row={row} disabled={pending} onToggle={toggle(row)} large />
                <span className="text-sm">{row.active ? 'Active' : 'Off'}</span>
                <time title={row.createdExact} className="text-xs text-muted-foreground">
                  · {row.createdAgo}
                </time>
                <div className="ml-auto flex gap-1">
                  <Button variant="outline" className="min-h-11" aria-label={`Edit ${row.term}`} onClick={() => open({ kind: 'edit', row })} disabled={pending}>
                    <PencilLine aria-hidden="true" /> Edit
                  </Button>
                  <Button variant="outline" className="min-h-11 min-w-11" aria-label={`Delete ${row.term}`} onClick={() => open({ kind: 'delete', row })} disabled={pending}>
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-hidden rounded-lg border bg-card shadow-xs md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Term</TableHead>
                <TableHead>Match</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Applies to</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Added</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} className={row.active ? '' : 'text-muted-foreground'}>
                  <TableCell className="max-w-64 font-mono text-sm break-all whitespace-pre-wrap">{row.term}</TableCell>
                  <TableCell>{MATCH_LABELS[row.matchType]}</TableCell>
                  <TableCell>{CATEGORY_LABELS[row.category]}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {row.appliesTo.map((s) => (
                        <Chip key={s}>{SCOPE_LABELS[s]}</Chip>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <ActiveSwitch row={row} disabled={pending} onToggle={toggle(row)} />
                  </TableCell>
                  <TableCell>
                    <time title={row.createdExact}>{row.createdAgo}</time>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" aria-label={`Edit ${row.term}`} onClick={() => open({ kind: 'edit', row })} disabled={pending}>
                        <PencilLine aria-hidden="true" />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label={`Delete ${row.term}`} onClick={() => open({ kind: 'delete', row })} disabled={pending}>
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        </>
      )}

      {dialog?.kind === 'add' ? (
        <KeywordDialog
          key={`add-${opening}`}
          open
          onOpenChange={close}
          pending={pending}
          title="Add a keyword"
          confirmLabel="Add keyword"
          initial={NEW_KEYWORD}
          onSubmit={(input) => run(() => createKeyword(input), 'Keyword added.')}
        />
      ) : null}
      {dialog?.kind === 'edit' ? (
        <KeywordDialog
          key={`edit-${opening}`}
          open
          onOpenChange={close}
          pending={pending}
          title="Edit keyword"
          confirmLabel="Save changes"
          initial={{
            term: dialog.row.term,
            match_type: dialog.row.matchType,
            category: dialog.row.category,
            applies_to: dialog.row.appliesTo,
            active: dialog.row.active,
          }}
          onSubmit={(input) => run(() => updateKeyword({ ...input, id: dialog.row.id }), 'Keyword saved.')}
        />
      ) : null}
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        onOpenChange={close}
        pending={pending}
        destructive
        title="Delete this keyword?"
        description={
          dialog?.kind === 'delete' ? (
            <>
              <span className="font-mono">{dialog.row.term}</span> stops holding posts and refusing nicknames. To pause it instead, turn it off.
            </>
          ) : null
        }
        confirmLabel="Delete"
        pendingLabel="Deleting…"
        onConfirm={() => {
          if (dialog?.kind === 'delete') run(() => deleteKeyword(dialog.row.id), 'Keyword deleted.');
        }}
      />
    </div>
  );
}
