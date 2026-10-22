# UNM Freedom Confessions

A guest-first mobile app (Expo / React Native, Android first) for UNM students that replaces the school's Facebook confessions group. Anyone can read the feed; signed-in members post confessions, shoutouts and polls under a permanent public nickname, react, comment, vote, and trade in Buy & Sell / Lost & Found. Moderators and admins keep it safe through a keyword hold, a moderation queue, reports and audit-logged identity lookups. Backend is Supabase (Postgres + RLS, RPCs, Realtime, Storage).

## Source of truth

The PRD at `UNM Freedom Confessions V1 PRD.md` (repo root). Read it before starting any module. If code or schema conflicts with the PRD, stop and ask me; do not decide silently.

## Database

`supabase/migrations/*.sql` is the schema. Clients write only through RPCs. Any DB change is a NEW migration file, never an edit to an applied one. Regenerate types after a schema change: `cd mobile && npm run gen:types`.

## Locked decisions

- Guest-first: reading needs no account; posting, commenting, reacting, voting and sharing need sign-in. Guests have no Supabase session (no anonymous sign-ins).
- Posts, comments and listings show the author's nickname. Email is private and visible only to admins, with every lookup audit-logged.
- Nickname is permanent. Only an admin can rename a user, via `admin_set_nickname`. The PRD's "Edit information" in Settings means avatar, email and password only. Do NOT build nickname editing.
- No real name collected. Email OTP verification at sign-up.
- Feed is newest first. Trending is the only engagement-ranked view. Max 2 images per post, resized on the phone (1440px long side, quality 0.8) with EXIF removed.
- Post-moderation by default. A keyword match always holds the post for moderator approval. An admin can switch moderation mode to pre-moderation.
- Roles: user, moderator, admin. Moderators and admins manage things in a mobile-friendly Next.js web panel, built after the app screens.
- Tabs: Feed, Trending, Create, Buy & Sell (with a Lost & Found toggle), Profile. Announcements show as a pinned card on top of the Feed only when active.
- Six reactions (Fluent Emoji, license still to be verified), bundled locally. Reactions need sign-in.
- Dark theme = LyriaHub, light = its opposite. App name and logo are editable in the admin panel (`app_settings`).
- Not in V1: DMs, push notifications, payments, multiple schools, automatic posting to Facebook.

## Engineering rules

- Strict TypeScript, no `any`. Use the generated `mobile/types/database.ts` types everywhere.
- Reuse before creating. Small modular files. Comment only non-obvious logic.
- Performance first: cached feed (persisted TanStack Query), skeleton loading, no spinners on filter switches, filter locally, keyset pagination.
- Security first: validate inputs (Zod on the client, the DB re-validates), no secrets in the app, RLS and RPCs are the only write path.
- `PersistQueryClientProvider` wraps the whole app, outside any auth gate. Auth bootstrap never blocks rendering.
- DB error codes map to user-facing text only in `mobile/lib/errors.ts`.
- Realtime only through `hooks/usePostgresChanges` (UUID topic per subscription, foreground only, resubscribes on sign-in/out). A payload is a signal to refetch, never rendered directly (it has no nickname).
- Dev seed data lives in `supabase/seed/` (not migrations); every seed row starts with `[seed] `.

## Progress log

At the end of each module, append a short entry to `docs/PROGRESS.md`: what was built, what was verified, what is left, and any deviations from the PRD.
