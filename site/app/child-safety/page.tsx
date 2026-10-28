import { CHILD_SAFETY, CHILD_SAFETY_LAST_UPDATED } from '@/content/child-safety';
import { pageMetadata, SUPPORT_EMAIL, supportMailto } from '@/lib/site';

export const metadata = pageMetadata(
  '/child-safety',
  CHILD_SAFETY.title,
  'UNM Freedom Confessions has zero tolerance for child sexual abuse and exploitation: who can use the app, what is prohibited, how to report and how we respond.',
);

const H2 = 'text-xl font-semibold text-navy';
const LIST = 'list-disc space-y-2 pl-5 leading-7';

/** Plain text with the support address turned into a mail link. */
function WithEmail({ text }: { text: string }) {
  const [before, ...rest] = text.split(SUPPORT_EMAIL);
  if (rest.length === 0) return text;
  return (
    <>
      {before}
      <a href={supportMailto} className="break-all text-navy underline underline-offset-4 hover:no-underline">
        {SUPPORT_EMAIL}
      </a>
      {rest.join(SUPPORT_EMAIL)}
    </>
  );
}

export default function ChildSafetyPage() {
  return (
    <article className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-navy">{CHILD_SAFETY.title}</h1>
        <p className="text-sm text-muted">Last updated: {CHILD_SAFETY_LAST_UPDATED}</p>
      </header>

      {CHILD_SAFETY.sections.map((section) => (
        <section key={section.id} className="space-y-3" aria-labelledby={section.id}>
          <h2 id={section.id} className={H2}>
            {section.heading}
          </h2>
          {section.paragraphs.map((text) => (
            <p key={text} className="leading-7">
              <WithEmail text={text} />
            </p>
          ))}
          {section.list ? (
            <ul className={LIST}>
              {section.list.map((item) => (
                <li key={item}>
                  <WithEmail text={item} />
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
    </article>
  );
}
