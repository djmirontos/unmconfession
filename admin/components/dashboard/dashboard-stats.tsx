import { StatTile, StatTileSkeleton } from '@/components/dashboard/stat-tile';
import { getDashboard } from '@/lib/dashboard';
import { DASHBOARD_LINKS as L } from '@/lib/dashboard-links';

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
  // Errors reach the (panel) error boundary, which offers a retry.
  const d = await getDashboard();

  return (
    <div className="space-y-10">
      <Section title="Pending review">
        <StatTile label="Posts" value={d.pending_posts} href={L.pending_posts} highlight />
        <StatTile label="Comments" value={d.pending_comments} href={L.pending_comments} highlight />
        <StatTile label="Listings" value={d.pending_listings} href={L.pending_listings} highlight />
      </Section>
      <Section title="Open reports">
        <StatTile label="Reported items" value={d.reported_items} href={L.reported_items} highlight />
        <StatTile label="Reports in total" value={d.open_reports} href={L.open_reports} />
      </Section>
      <Section title="Last 24 hours">
        <StatTile label="New posts" value={d.posts_24h} href={L.posts_24h} />
        <StatTile label="New comments" value={d.comments_24h} href={L.comments_24h} />
        <StatTile label="New listings" value={d.listings_24h} href={L.listings_24h} />
        <StatTile label="New accounts" value={d.new_users_24h} href={L.new_users_24h} />
      </Section>
      <Section title="Accounts">
        <StatTile label="Suspended" value={d.suspended_users} href={L.suspended_users} />
        <StatTile label="Banned" value={d.banned_users} href={L.banned_users} />
        <StatTile label="Deleted" value={d.deleted_accounts} href={L.deleted_accounts} />
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
