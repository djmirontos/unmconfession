import { LEGAL, LEGAL_LAST_UPDATED, type LegalDoc } from '@/content/legal';

/** One legal text from the app, shown as it is there: a title and a list of paragraphs. */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  const { title, sections } = LEGAL[doc];
  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-navy">{title}</h1>
        <p className="text-sm text-muted">Last updated: {LEGAL_LAST_UPDATED}</p>
      </header>
      <ul className="list-disc space-y-3 pl-5 leading-7">
        {sections.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
    </article>
  );
}
