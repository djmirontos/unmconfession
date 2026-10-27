// The multi-step report flows. Pure orchestration over injected RPC calls, so the partial
// failure rules are unit-tested. Each call returns an error code or null.

export type ResolveOutcome = {
  resolved: number;
  /** Already resolved by someone else (mod_resolve_report raises not_found): not an error. */
  alreadyHandled: number;
  failed: number;
  firstError: string | null;
};

type Call = () => Promise<string | null>;

export async function resolveEach(reportIds: readonly string[], resolveOne: (id: string) => Promise<string | null>): Promise<ResolveOutcome> {
  const outcome: ResolveOutcome = { resolved: 0, alreadyHandled: 0, failed: 0, firstError: null };
  // Sequential on purpose: a handful of reports per item, and the first error stays meaningful.
  for (const id of reportIds) {
    const code = await resolveOne(id);
    if (code === null) outcome.resolved += 1;
    else if (code === 'not_found') outcome.alreadyHandled += 1;
    else {
      outcome.failed += 1;
      outcome.firstError ??= code;
    }
  }
  return outcome;
}

export type RemoveFlowResult =
  | { kind: 'done'; removed: 'now' | 'already'; reports: ResolveOutcome }
  /** The content was removed (or already was) but some reports are still open. Retry = resolve only. */
  | { kind: 'partial'; removed: 'now' | 'already'; reports: ResolveOutcome }
  /** Nothing changed. */
  | { kind: 'failed'; code: string };

/**
 * Remove the content, then mark every report still open as actioned. mod_review('remove')
 * already resolves the open reports itself; the second step catches reports filed in between.
 * "Already removed" (invalid_transition while the item is no longer published) still resolves.
 */
export async function removeThenResolve(steps: {
  remove: Call;
  isRemoved: () => Promise<boolean>;
  openReportIds: () => Promise<string[] | null>;
  resolveOne: (id: string) => Promise<string | null>;
}): Promise<RemoveFlowResult> {
  const code = await steps.remove();
  let removed: 'now' | 'already' = 'now';
  if (code === 'invalid_transition' && (await steps.isRemoved())) removed = 'already';
  else if (code !== null) return { kind: 'failed', code };

  const open = await steps.openReportIds();
  if (open === null) {
    return { kind: 'partial', removed, reports: { resolved: 0, alreadyHandled: 0, failed: 1, firstError: 'unknown' } };
  }
  const reports = await resolveEach(open, steps.resolveOne);
  return { kind: reports.failed > 0 ? 'partial' : 'done', removed, reports };
}

/** Toast / banner text for a finished flow. */
export function describeRemoveFlow(result: RemoveFlowResult): string {
  if (result.kind === 'failed') return '';
  const head = result.removed === 'now' ? 'Content removed' : 'The content was already removed';
  if (result.kind === 'partial') {
    const n = result.reports.failed;
    return `${head}, but ${n} ${n === 1 ? 'report' : 'reports'} could not be marked handled.`;
  }
  return `${head}. Reports marked handled.`;
}

export function describeResolve(outcome: ResolveOutcome, status: 'actioned' | 'dismissed'): string {
  const verb = status === 'dismissed' ? 'dismissed' : 'marked handled';
  if (outcome.failed > 0) {
    return `${outcome.resolved} ${outcome.resolved === 1 ? 'report' : 'reports'} ${verb}, ${outcome.failed} could not be.`;
  }
  if (outcome.resolved === 0) return 'These reports were already handled.';
  return `${outcome.resolved} ${outcome.resolved === 1 ? 'report' : 'reports'} ${verb}.`;
}
