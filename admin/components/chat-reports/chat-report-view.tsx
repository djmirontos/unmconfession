'use client';

import { ArrowLeft, ArrowUpCircle, CheckCircle2, MessageSquareWarning, ShieldOff, UserRound, VolumeX } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import {
  escalateChatReport,
  muteReportedMember,
  releaseChatReportHold,
  resolveChatReport,
  warnReportedMember,
} from '@/app/(panel)/chat-reports/actions';
import { ConfirmDialog } from '@/components/moderation/dialogs';
import { ACTION_GRID, TAP_BELOW_MD } from '@/components/moderation/mobile-dialog';
import { MuteDialog, ReasonField, WarnDialog } from '@/components/users/discipline-dialogs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ChatReportDetail } from '@/lib/moderation/chat-report-data';
import {
  CHAT_REPORT_OUTCOMES,
  CHAT_REPORT_STATUS_LABELS,
  type ChatReportOutcome,
  chatReportActions,
  outcomeAfter,
  outcomeLabel,
  RESOLUTION_NOTE_MAX,
  type TranscriptLine,
} from '@/lib/moderation/chat-reports';
import type { DisciplineActions } from '@/lib/moderation/warnings';
import type { ActionResult } from '@/lib/result';

type Line = TranscriptLine & { atExact: string };
type Dialog = 'warn' | 'mute' | 'escalate' | 'resolve' | 'release' | null;

type Props = {
  report: Omit<ChatReportDetail, 'snapshot'> & { snapshot?: undefined };
  /** null: the evidence could not be read. */
  lines: Line[] | null;
  /** The reported member while the account exists. */
  member: { id: string; nickname: string | null } | null;
  discipline: DisciplineActions;
  isAdmin: boolean;
};

const nick = (n: string | null) => n ?? 'Deleted user';

/** The evidence: read-only, plain text (never HTML), the reported message marked. */
function Transcript({ lines }: { lines: Line[] | null }) {
  if (lines === null) return <p className="text-sm text-destructive">The evidence could not be read.</p>;
  if (lines.length === 0) return <p className="text-sm text-muted-foreground">No messages were copied.</p>;
  return (
    <ol className="space-y-2" aria-label="Copied messages, oldest first">
      {lines.map((l) => (
        <li
          key={l.key}
          className={`rounded-lg border px-3 py-2 ${l.highlighted ? 'border-destructive bg-destructive/5' : 'bg-card'} ${l.from === 'reported' ? 'sm:mr-12' : 'sm:ml-12'}`}
        >
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{l.sender}</span>
            <time>{l.atExact}</time>
            {l.highlighted ? <Badge variant="destructive">Reported message</Badge> : null}
          </div>
          {l.deleted ? (
            <p className="mt-1 text-sm italic text-muted-foreground">message deleted</p>
          ) : (
            <p className="mt-1 text-sm whitespace-pre-wrap break-words">{l.body}</p>
          )}
        </li>
      ))}
    </ol>
  );
}

/**
 * A chat report: header, evidence and actions. Actions update this state from their results; the
 * page is never refreshed (each render would be another audit-logged open). After a change, the
 * way back to the list asks it to refresh once (the sidebar badge included).
 */
export function ChatReportView({ report, lines, member, discipline, isAdmin }: Props) {
  const [status, setStatus] = useState(report.status);
  const [outcome, setOutcome] = useState(report.outcome);
  const [resolutionNote, setResolutionNote] = useState(report.resolutionNote);
  const [resolvedExact, setResolvedExact] = useState(report.resolvedExact);
  const [held, setHeld] = useState(report.held);
  const [adminOnly, setAdminOnly] = useState(report.adminOnly);
  const [changed, setChanged] = useState(false);
  const [disciplined, setDisciplined] = useState<'warn' | 'mute' | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [pick, setPick] = useState<ChatReportOutcome | ''>('');
  const [note, setNote] = useState('');
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);

  const can = chatReportActions({ isAdmin }, { status, adminOnly, held });
  const memberName = nick(report.reportedNickname);

  const run = <T,>(call: () => Promise<ActionResult<T>>, onOk: (data: T) => void) => {
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
        setChanged(true);
        onOk(result.data);
      } finally {
        busy.current = false;
      }
    });
  };

  const openResolve = (prefill: ChatReportOutcome | '') => {
    setPick(prefill);
    setNote('');
    setDialog('resolve');
  };

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href={changed ? '/chat-reports?updated=1' : '/chat-reports'}>
          <ArrowLeft aria-hidden="true" /> Chat reports
        </Link>
      </Button>

      <p className="text-sm text-muted-foreground">Opening this report is recorded in the audit log.</p>

      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="text-xl font-semibold">{report.reason}</h1>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={status === 'open' ? 'default' : 'secondary'}>{CHAT_REPORT_STATUS_LABELS[status]}</Badge>
            {adminOnly ? <Badge variant="outline">Admin only</Badge> : null}
            {held ? <Badge variant="outline">Held</Badge> : null}
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Reported member</dt>
              <dd className="break-words font-medium">{memberName}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Reported by</dt>
              <dd className="break-words">{nick(report.reporterNickname)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Reported</dt>
              <dd>{report.createdExact}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">About</dt>
              <dd>{report.messageId ? 'One message' : 'The whole chat'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Reporter&apos;s note</dt>
              <dd className="whitespace-pre-wrap break-words">{report.note ?? <span className="text-muted-foreground">No note</span>}</dd>
            </div>
            {status !== 'open' ? (
              <>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Outcome</dt>
                  <dd>{outcomeLabel(outcome) ?? CHAT_REPORT_STATUS_LABELS[status]}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Resolved</dt>
                  <dd>{resolvedExact ?? 'Just now'}</dd>
                </div>
                {resolutionNote ? (
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Resolution note</dt>
                    <dd className="whitespace-pre-wrap break-words">{resolutionNote}</dd>
                  </div>
                ) : null}
              </>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="text-base">Evidence</h2>
          </CardTitle>
          <p className="text-sm text-muted-foreground">Copied when the report was made. Read only.</p>
        </CardHeader>
        <CardContent>
          <Transcript lines={lines} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="text-base">Actions</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {disciplined && status === 'open' ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
              <span>{disciplined === 'warn' ? 'Warning sent.' : 'Member muted.'} Mark this report as resolved?</span>
              <Button size="sm" onClick={() => openResolve(outcomeAfter(disciplined))}>
                <CheckCircle2 aria-hidden="true" /> Mark report as resolved
              </Button>
            </div>
          ) : null}
          {status === 'open' ? (
            <>
              <div className={ACTION_GRID}>
                {can.discipline && discipline.warn ? (
                  <Button variant="outline" onClick={() => setDialog('warn')} disabled={pending}>
                    <MessageSquareWarning aria-hidden="true" /> Warn member…
                  </Button>
                ) : null}
                {can.discipline && (discipline.mute || discipline.muteBlocked) ? (
                  <Button variant="outline" onClick={() => setDialog('mute')} disabled={pending || !discipline.mute}>
                    <VolumeX aria-hidden="true" /> Mute member…
                  </Button>
                ) : null}
                {can.escalate ? (
                  <Button variant="outline" onClick={() => setDialog('escalate')} disabled={pending}>
                    <ArrowUpCircle aria-hidden="true" /> Escalate to admins…
                  </Button>
                ) : null}
                {can.resolve ? (
                  <Button onClick={() => openResolve('')} disabled={pending}>
                    <CheckCircle2 aria-hidden="true" /> Resolve…
                  </Button>
                ) : null}
              </div>
              {discipline.muteBlocked ? (
                <p className="text-xs text-muted-foreground">Mute is not available while the account is suspended or banned.</p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">This report is resolved.</p>
          )}
          {member ? (
            <Button asChild variant="link" className={`h-auto px-0 ${TAP_BELOW_MD}`}>
              <Link href={`/users/${member.id}`}>
                <UserRound aria-hidden="true" /> Open member page (suspend, ban, history)
              </Link>
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">This account was deleted.</p>
          )}
          {can.release ? (
            <Button variant="outline" onClick={() => setDialog('release')} disabled={pending}>
              <ShieldOff aria-hidden="true" /> Release hold…
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {member ? (
        <>
          <WarnDialog
            open={dialog === 'warn'}
            onOpenChange={(o) => setDialog(o ? 'warn' : null)}
            pending={pending}
            name={memberName}
            onSend={(input) =>
              run(
                () => warnReportedMember({ user: member.id, ...input }),
                () => {
                  toast.success('Warning sent.');
                  setDisciplined('warn');
                },
              )
            }
          />
          <MuteDialog
            open={dialog === 'mute'}
            onOpenChange={(o) => setDialog(o ? 'mute' : null)}
            pending={pending}
            name={memberName}
            canMute={discipline.mute}
            onSend={(input) =>
              run(
                () => muteReportedMember({ user: member.id, ...input }),
                () => {
                  toast.success('Member muted.');
                  setDisciplined('mute');
                },
              )
            }
          />
        </>
      ) : null}

      <ConfirmDialog
        open={dialog === 'escalate'}
        onOpenChange={(o) => setDialog(o ? 'escalate' : null)}
        pending={pending}
        title="Escalate to admins"
        description={<p>After this, only admins can open this report, and its evidence is held until an admin releases it.</p>}
        confirmLabel="Escalate"
        pendingLabel="Escalating…"
        onConfirm={() =>
          run(
            () => escalateChatReport(report.id),
            (data) => {
              setAdminOnly(data.adminOnly);
              setHeld(data.held);
              toast.success('Escalated to admins.');
            },
          )
        }
      />

      <ConfirmDialog
        open={dialog === 'resolve'}
        onOpenChange={(o) => setDialog(o ? 'resolve' : null)}
        pending={pending}
        title="Resolve this report"
        description={<p>Pick what was done. The reporter and the reported member are not told.</p>}
        confirmLabel="Resolve"
        pendingLabel="Saving…"
        canConfirm={pick !== ''}
        onConfirm={() =>
          pick &&
          run(
            () => resolveChatReport({ report: report.id, outcome: pick, note: note.trim() || undefined }),
            (data) => {
              setStatus(data.status);
              setOutcome(data.outcome);
              setResolutionNote(data.note);
              setResolvedExact(null);
              setDisciplined(null);
              toast.success('Report resolved.');
            },
          )
        }
      >
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">Outcome</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {CHAT_REPORT_OUTCOMES.map((o) => (
              <label
                key={o.value}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-secondary has-focus-visible:outline-2 has-focus-visible:outline-ring ${TAP_BELOW_MD}`}
              >
                <input type="radio" name="outcome" checked={pick === o.value} onChange={() => setPick(o.value)} className="accent-[var(--primary)]" />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
        <ReasonField value={note} onChange={setNote} label="Note for the log (optional)" max={RESOLUTION_NOTE_MAX} />
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'release'}
        onOpenChange={(o) => setDialog(o ? 'release' : null)}
        pending={pending}
        title="Release the hold"
        description={<p>The evidence will then be deleted by the normal cleanup, 90 days after the report is resolved. This is recorded in the audit log.</p>}
        confirmLabel="Release hold"
        pendingLabel="Releasing…"
        destructive
        onConfirm={() =>
          run(
            () => releaseChatReportHold(report.id),
            (data) => {
              setHeld(data.held);
              toast.success('Hold released.');
            },
          )
        }
      />
    </div>
  );
}
