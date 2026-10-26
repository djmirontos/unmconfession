import { StatTile, StatTileSkeleton } from '@/components/dashboard/stat-tile';
import { codeFromError, messageFor } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`${title}-heading`} className="space-y-3">
      <h2 id={`${title}-heading`} className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </section>
  );
}

/** mod_dashboard checks the staff role itself; the page has already called requireStaff(). */
export async function DashboardStats() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('mod_dashboard');
  // Caught by the (panel) error boundary, which offers a retry.
  if (error) throw new Error(messageFor(codeFromError(error)));
  const d = data?.[0];
  if (!d) throw new Error(messageFor('unknown'));

  return (
    <div className="space-y-10">
      <Section title="Pending review">
        <StatTile label="Posts" value={d.pending_posts} href="/review?filter=post" highlight />
        <StatTile label="Comments" value={d.pending_comments} href="/review?filter=comment" highlight />
        <StatTile label="Listings" value={d.pending_listings} href="/review?filter=listing" highlight />
      </Section>
      <Section title="Open reports">
        <StatTile label="Reported items" value={d.reported_items} href="/reports" highlight />
        <StatTile label="Reports in total" value={d.open_reports} href="/reports" />
      </Section>
      <Section title="Last 24 hours">
        <StatTile label="New posts" value={d.posts_24h} href="/content?type=post" />
        <StatTile label="New comments" value={d.comments_24h} href="/content?type=comment" />
        <StatTile label="New listings" value={d.listings_24h} href="/content?type=listing" />
        <StatTile label="New accounts" value={d.new_users_24h} href="/users" />
      </Section>
      <Section title="Accounts">
        <StatTile label="Suspended" value={d.suspended_users} href="/users?status=suspended" />
        <StatTile label="Banned" value={d.banned_users} href="/users?status=banned" />
        <StatTile label="Deleted" value={d.deleted_accounts} href="/users?deleted=1" />
      </Section>
    </div>
  );
}

export function DashboardStatsSkeleton() {
  const groups = [3, 2, 4, 3];
  return (
    <div className="space-y-10" aria-busy="true" aria-label="Loading dashboard">
      {groups.map((count, i) => (
        <div key={i} className="space-y-3">
          <div className="h-4 w-32 rounded bg-muted" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: count }, (_, j) => (
              <StatTileSkeleton key={j} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
