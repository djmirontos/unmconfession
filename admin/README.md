# UNM Freedom Confessions: moderation panel

Next.js (App Router) web panel for moderators and admins. Separate app from `mobile/`, same Supabase project.

## Run locally

1. Create `admin/.env.local` from `.env.example` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`).
2. `npm install`
3. `npm run dev`, then open http://localhost:3000 (http://127.0.0.1:3000 also works in development). Sign in with a moderator or admin account. The first sign-in sets up an authenticator app.

Checks: `npm run typecheck`, `npm run lint`, `npm test` (also scans for the service-role key), `npm run build`.
Types: `npm run gen:types` (same CLI command as mobile; keep `mobile/types/database.ts` identical).

## Security model

1. All Supabase access runs on the server (Server Components, Server Actions, Route Handlers). There is no browser Supabase client.
2. The env vars are server-only (no `NEXT_PUBLIC_`). Only the anon key is used; a test fails if the service-role key is mentioned anywhere.
3. Session cookies are httpOnly, `sameSite=lax`, and `secure` in production. The session cookie holds only the tokens (the user object stays in server memory), so a signed-in session's Cookie header stays under 4 KB (tested).
4. `requireStaff()` / `requireAdmin()` run on every page and action: `getUser()` (validated by Supabase Auth), assurance level `aal2`, then `is_staff` / `is_admin`.
5. TOTP is required: no authenticator means enrolment at `/security/enroll`; otherwise the code is asked at `/login/verify`.
6. Sessions end after 30 minutes idle (proxy cookie) and 12 hours in total (from the token's `amr` sign-in time).
7. `proxy.ts` only refreshes the session, applies the timeouts and sets the CSP nonce. It is never the only gate, and the RPCs check roles again.
8. Login errors are generic, inputs are validated with zod, and error codes become text only in `lib/errors.ts`.
9. Headers: nonce CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: same-origin`, Permissions-Policy, COOP, plus noindex (header, meta tag and robots.txt). Use `same-origin`, not `no-referrer`: `no-referrer` makes browsers send `Origin: null` on form posts, and Next.js then rejects every Server Action.
10. Verifying an authenticator signs the person out of their other sessions (including the mobile app) once; that is Supabase's behaviour.

## Pages

| Route | Access | What it does |
|---|---|---|
| `/login`, `/login/verify`, `/security/enroll` | sign-in steps | Password, then the authenticator code (or setting one up) |
| `/` | staff | Dashboard (`mod_dashboard`) |
| `/review` | staff | Pending posts, comments and listings, oldest first; filter by type; Load more |
| `/review/[type]/[id]` | staff | One item: full text with the held keyword marked, images (click to zoom), author status, approve / reject / edit and approve, previous / next, shortcuts A R E ← → |
| `/review/next` | staff | Redirects to the next pending item after an action (wraps to the oldest; back to the list when empty) |
| `/reports` | staff | Reported items grouped per item, oldest first report first; type chips; Load more |
| `/reports/[type]/[id]` | staff | The item, every report on it, and Remove content / Mark handled / Dismiss reports / Edit content |
| `/reports/next` | staff | Redirects to the next reported item after one is handled |
| `/content` | staff | Browse and search all content (type, status, text or `#number`); Load more |
| `/content/[type]/[id]` | staff | The item, its moderation history (original text of edits), Remove / Edit / Restore |
| `/users` | staff | Search by nickname, status and role filters, deleted toggle; admins also find by email (audited) |
| `/users/[id]` | staff | Account details and history; suspend / ban / restore; admins: role, rename, reveal email (audited), delete restricted account |
| `/keywords`, `/log` | staff | Placeholders (modules 7e–7f) |
| `/audit` | admin | Placeholder |
| `/403` | anyone | No access |

Deployment: see `docs/ADMIN_DEPLOY.md`.
