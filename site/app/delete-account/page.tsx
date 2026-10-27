import { deleteMailto, pageMetadata, SUPPORT_EMAIL } from '@/lib/site';

export const metadata = pageMetadata(
  '/delete-account',
  'Delete your account',
  'How to delete your UNM Freedom Confessions account in the app or by email, and what happens to your data.',
);

// Steps checked against mobile/app/(tabs)/profile.tsx and mobile/app/delete-account.tsx; what
// happens against delete_my_account (supabase/migrations/20261026130000_terms_acceptance.sql).
const STEPS = [
  'Open the app and sign in.',
  'Go to the Profile tab.',
  'Scroll to the bottom and tap Delete account.',
  'Read what will be erased and what stays.',
  'Type your nickname to confirm, then tap Delete my account.',
  'Tap Delete to confirm once more.',
];

const ERASED = [
  'Your account and sign-in, including your email address.',
  'Your nickname. Your avatar is replaced by a default one.',
  'Your blocked users, notification settings and notifications.',
];

const STAYS = [
  'Posts, comments, reactions, poll votes and listings you already published stay in the app, no longer linked to you, and are shown as "Deleted user".',
  'Your open Buy & Sell and Lost & Found listings are closed.',
  'Reports you filed stay with the moderators.',
];

const H2 = 'text-xl font-semibold text-navy';
const LIST = 'list-disc space-y-2 pl-5 leading-7';

export default function DeleteAccountPage() {
  return (
    <article className="space-y-8">
      <h1 className="text-3xl font-bold text-navy">Delete your account</h1>

      <section className="space-y-3" aria-labelledby="in-app">
        <h2 id="in-app" className={H2}>
          In the app
        </h2>
        <ol className="list-decimal space-y-2 pl-5 leading-7">
          {STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="leading-7">Your account is deleted straight away. This cannot be undone.</p>
      </section>

      <section className="space-y-3" aria-labelledby="what-happens">
        <h2 id="what-happens" className={H2}>
          What happens
        </h2>
        <h3 className="font-semibold">Erased</h3>
        <ul className={LIST}>
          {ERASED.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <h3 className="font-semibold">Stays, no longer linked to you</h3>
        <ul className={LIST}>
          {STAYS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="leading-7">
          The same email address can sign up again later as a new account, without the old nickname or history.
        </p>
      </section>

      <section className="space-y-3" aria-labelledby="by-email">
        <h2 id="by-email" className={H2}>
          Without the app
        </h2>
        <p className="leading-7">
          If you cannot use the app, or your account is suspended or banned (the in-app option is not available then), email{' '}
          <a href={deleteMailto} className="break-all text-navy underline underline-offset-4 hover:no-underline">
            {SUPPORT_EMAIL}
          </a>
          :
        </p>
        <ul className={LIST}>
          <li>send it from the email address registered to your account;</li>
          <li>use the subject &ldquo;Delete my account&rdquo;;</li>
          <li>include your nickname.</li>
        </ul>
        <p className="leading-7">We may ask you to confirm the request from the same address.</p>
        <p className="leading-7">We process deletion requests within 30 days, usually much sooner.</p>
        <p>
          <a
            href={deleteMailto}
            className="inline-flex min-h-11 items-center rounded-lg bg-navy px-5 py-2 font-semibold text-white hover:bg-navy/90"
          >
            Email a deletion request
          </a>
        </p>
      </section>
    </article>
  );
}
