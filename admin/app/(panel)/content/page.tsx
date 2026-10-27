import type { Metadata } from 'next';
import { SearchX } from 'lucide-react';

import { ContentList } from '@/components/content/content-list';
import { SearchBox, SelectFilter } from '@/components/moderation/url-filters';
import { EmptyState } from '@/components/panel/empty-state';
import { PageHeader } from '@/components/panel/page-header';
import { requireStaff } from '@/lib/auth';
import { fetchContentPage } from '@/lib/moderation/data';
import { contentFiltersSchema } from '@/lib/moderation/schemas';

export const metadata: Metadata = { title: 'Content' };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ContentPage({ searchParams }: PageProps<'/content'>) {
  await requireStaff();
  const params = await searchParams;
  const filters = contentFiltersSchema.parse({ type: one(params.type), status: one(params.status), q: one(params.q) || undefined });
  const initial = await fetchContentPage(filters);

  return (
    <>
      <PageHeader
        title="Content"
        description="Browse and search posts, comments and listings. Search matches text, listing titles, or a post number like #12."
      />
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <SearchBox label="Search" placeholder="Text or #number" />
        <div className="w-40">
          <SelectFilter
            name="type"
            label="Type"
            options={[
              { value: 'post', label: 'Posts' },
              { value: 'comment', label: 'Comments' },
              { value: 'listing', label: 'Listings' },
            ]}
          />
        </div>
        <div className="w-44">
          <SelectFilter
            name="status"
            label="Status"
            options={[
              { value: 'published', label: 'Published' },
              { value: 'pending', label: 'Pending review' },
              { value: 'removed', label: 'Removed' },
              { value: 'rejected', label: 'Rejected' },
            ]}
          />
        </div>
      </div>
      {initial.rows.length === 0 ? (
        <EmptyState icon={SearchX} title="No content matches" description="Try another search or clear the filters." />
      ) : (
        <ContentList key={JSON.stringify(filters)} initial={initial} filters={filters} />
      )}
    </>
  );
}
