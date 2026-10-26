# Deploying the moderation panel (later)

Not deployed yet. These are the steps for when it is.

## Supabase (dashboard)

1. **MFA:** Authentication → Multi-Factor → make sure **TOTP (App Authenticator)** enrolment and verification are enabled. TOTP is on by default in every project; check that nobody switched it off.
2. **URL configuration:** Authentication → URL Configuration:
   - Keep the **Site URL** the mobile app needs. The panel uses password sign-in only (no email links or OAuth), so it needs no redirect URL.
   - If panel email links (for example password reset) are added later, add `https://admin.klasmeyt.com/**` to **Redirect URLs**.
3. **Sessions (optional, paid plans):** Authentication → Sessions can also set a time-box or inactivity timeout server-side. The panel already enforces 30 minutes idle and 12 hours in total itself.
4. **Roles:** only accounts with `user_flags.role` moderator or admin and status active can sign in. Set the first admin in the SQL editor; the panel's Users page will change roles later.

## Vercel

1. New Project → import the repository → **Root Directory: `admin`**. The framework (Next.js) is detected; leave the build command as `next build`.
2. Environment variables (Production and Preview), **not** prefixed with `NEXT_PUBLIC_`:
   - `SUPABASE_URL`: `https://<project-ref>.supabase.co`
   - `SUPABASE_ANON_KEY`: the anon (public) key
   - Never add the service-role key.
3. Domains → add `admin.klasmeyt.com`, then create the DNS record Vercel shows (CNAME `admin` → `cname.vercel-dns.com`, or what the dashboard says). HTTPS is automatic.
4. Optional: Deployment Protection (Vercel Authentication) on Preview deployments, so preview URLs are not public.
5. After the first deploy, check:
   - `https://admin.klasmeyt.com/robots.txt` disallows everything;
   - the response headers include `Content-Security-Policy`, `Strict-Transport-Security` and `X-Robots-Tag: noindex`;
   - sign-in asks for the authenticator code.

## Before going live

- Two admins, each with their own authenticator, so one lost phone does not lock everyone out. A lost authenticator is removed in Supabase (Authentication → Users → the user → MFA factors).
- The panel is not indexed (noindex header, meta tag, robots.txt). Do not link to it from public pages.
