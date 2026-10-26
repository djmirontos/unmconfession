# UNM Freedom Confessions

A guest-first mobile app (Expo / React Native, Android first) for UNM students that replaces the school's Facebook confessions group. Anyone can read the feed; signed-in members post confessions, shoutouts and polls under a unique public nickname, react, comment, vote, and trade in Buy & Sell / Lost & Found. Moderators and admins keep it safe through a keyword hold, a moderation queue, reports and audit-logged identity lookups. Backend is Supabase (Postgres + RLS, RPCs, Realtime, Storage).

## Source of truth

The PRD at `UNM Freedom Confessions V1 PRD.md` (repo root). Read it before starting any module. If code or schema conflicts with the PRD, stop and ask me; do not decide silently.

## Database

`supabase/migrations/*.sql` is the schema. Clients write only through RPCs. Any DB change is a NEW migration file, never an edit to an applied one. Regenerate types after a schema change: `cd mobile && npm run gen:types`.

## Locked decisions

- Guest-first: reading needs no account; posting, commenting, reacting, voting and sharing need sign-in. Guests have no Supabase session (no anonymous sign-ins).
- Posts, comments and listings show the author's nickname. Email is private and visible only to admins, with every lookup audit-logged.
- Nickname is unique and shown on all of the user's posts and comments (old ones too, after a change). The user can change it once every 30 days (`change_nickname`); an admin can rename anyone (`admin_set_nickname`). Names containing flagged words (keywords with the `nickname` scope) are refused.
- Account data: `user_settings` (notification switches, last nickname change) via `get_my_settings` / `set_notification_prefs`; `delete_my_account` removes the sign-in and private data, closes the person's open listings and keeps the content under a nameless profile, marked for good by `user_flags.deleted_at`. In the app a null author nickname means a deleted account: show "Deleted user" (`lib/authorLabel.ts`), a neutral avatar, no Block action.
- Profile settings: Account (Nickname, My Posts, Notifications, Blocked users, Notification preferences), About (Community rules, Terms, Privacy, Open source notices, Send feedback, Version), Appearance, Log out, then Delete account on its own.
- Open TODOs: the web panel's `mod_set_user_status` / `admin_set_role` must refuse targets with `deleted_at`; Google Play needs a public account-deletion request page; `FEEDBACK_EMAIL` in `mobile/lib/config.ts` is a placeholder.
- No real name collected. Email OTP verification at sign-up.
- Feed is newest first. Trending is the only engagement-ranked view. Max 3 images per post or listing (none on polls), resized on the phone (1440px long side, quality 0.8) with EXIF removed.
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
- Photos only through `lib/photos`: `processPhoto` (1440 px, JPEG 0.8) then `uploadPhoto` (reads bytes with expo-file-system `new File(uri).bytes()`, never `fetch(file://)`; strips EXIF/XMP/IPTC; uploads to `post-images/<uid>/<uuid>.jpg`). Order on submit: validate, upload, then the RPC.
- Gestures that must hold the touch inside a scrolling list (press-and-hold, drag) use react-native-gesture-handler (`GestureHandlerRootView` wraps the app), not PanResponder or View responder props. Per-frame state lives in Reanimated shared values, not React state.
- Dev logging only through `lib/log.ts` (`logError` / `logInfo`, dev only, redacted by `lib/redact.ts`). No direct `console.*` calls; never log secrets, tokens, OTPs or full emails.
- Dev seed data lives in `supabase/seed/` (not migrations); every seed row starts with `[seed] `.

## Progress log

At the end of each module, append a short entry to `docs/PROGRESS.md`: what was built, what was verified, what is left, and any deviations from the PRD.
