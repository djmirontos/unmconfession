# Progress log

## Module 1: Foundation, auth, registration, theme, tab shell (2026-10-22)

**Built**
- `/mobile`: Expo SDK 57, Expo Router (typed routes), strict TS (`noUncheckedIndexedAccess`), NativeWind v4, Supabase JS (PKCE, AsyncStorage session), TanStack Query v5 with a persisted cache (AsyncStorage, 30-min maxAge, allowlist `app-settings` and `profile`), Zustand, expo-image, Ionicons, Zod 4, ESLint (`eslint-config-expo`, `no-explicit-any` set to error).
- `PersistQueryClientProvider` wraps the whole app, outside every gate. The session is read in the background. Guests have no session and no anonymous sign-in.
- `useRequireAuth()` + `<SignInSheet/>`. The Create tab is already gated for guests.
- Email sign-up (email, nickname, password, Terms checkbox) with live debounced nickname availability and a pre-submit check, then email OTP verify (resend with a 60 s cooldown). Also sign-in, forgot password via recovery OTP, set new password, and Google OAuth (`signInWithOAuth` + `openAuthSessionAsync` + PKCE code exchange).
- Choose-nickname screen (`rpc('set_nickname')`). A `Stack.Protected` guard keeps users without a nickname on it.
- `lib/errors.ts` maps DB and Auth error codes to user-facing text.
- Theme: LyriaHub "Dark Studio" tokens for dark and an inverse palette for light (`theme/colors.ts`), exposed as Tailwind tokens via CSS variables. The system/light/dark preference is stored in Zustand + AsyncStorage.
- Tabs: Feed, Trending, Create, Buy & Sell, Profile, each a placeholder with a Reanimated shimmer `Skeleton` (static under reduced motion). `PostCardSkeleton` and `ListingCardSkeleton` are ready for later modules.
- Branding: `useAppSettings()` (persisted) + `<AppLogo/>` with a placeholder until `app_settings` loads.
- Profile tab: nickname, avatar picker (`avatar_01`..`avatar_12` as icon badges, optimistic `profiles.avatar_key` update), theme switch, logout. Guests get a sign-in call to action.
- New migration `20261022000000_nickname_check.sql`: `is_nickname_available(text)`, which delegates to `_validate_nickname`. Tests added to `supabase/tests/run.sh`, which now applies every migration.

**Verified**
- `tsc --noEmit`: 0 errors. `expo lint`: 0 problems. `expo-doctor`: 21/21 checks pass.
- `expo export` bundles Android and iOS. The NativeWind token classes compile to `rgb(var(--color-*))`.
- Metro starts and generates the typed routes.
- `npm run gen:types` works against the linked project (it returned empty types because the remote schema is not applied yet).

**Not verified**
- The app has not run on a device or emulator; there is no Android SDK or device on the dev machine.
- No auth flow has been exercised end to end, because the remote project has no schema yet.
- `types/database.ts` is hand-written to match the SQL. Regenerate it after applying the migrations.
- The new SQL tests were not run (no local Postgres).

**Pending**
- None. (The six-box verification code screen moved to Module 2 and is built.)

**Left / setup:** see the module 1 handoff (apply migrations, regenerate types, Supabase email templates with `{{ .Token }}`, Google OAuth client, redirect URLs, dev build).

**Deviations from the PRD**
- Settings "Edit information": the nickname is not editable (locked decision). Email and password editing are not built yet.
- ~~Keyset pagination uses `(published_at, id)` per the schema, not `(created_at, id)` as the PRD says.~~ Resolved: the schema's `(published_at, id)` is correct and the PRD has been fixed.
- Terms and Privacy are draft placeholder copy in `app/legal/[doc].tsx`.

## Module 2: Feed (read side), post detail, six-box code input, Module 1 fixes (2026-10-22)

**Built**
- Six-box `CodeInput` (`components/ui/CodeInput.tsx`): one hidden number-pad TextInput over six boxes, digits-only and cut to 6 on every change (paste fills all boxes), navy outline on the next box (new `navy` token, lighter blue in dark), all borders red on a wrong/expired code until the next edit, blinking caret that is static under reduced motion, label "Verification code, 6 digits". Autofill props taken from the RN 0.86 source: iOS `textContentType="oneTimeCode"`, Android `autoComplete="email-otp"` (the code comes by email; `one-time-code` maps to `sms-otp` on Android). Used by `verify.tsx` for both sign-up and the password reset code. No auto-submit; the button is disabled until 6 digits. The OTP schema now requires exactly 6 digits.
- After sign-up verification the user lands on the Feed (`useExitAuthFlow('/')`). Profile shows a dismissible "Pick your avatar" card until the picker is opened once (AsyncStorage key per user id); the picker is now behind a "Change avatar" button.
- Status bar: the style is re-applied imperatively on theme change, 300 ms after it and on app foreground, because Android can reset the icons while `<StatusBar>` thinks its cached style is current.
- Feed: `rpc('get_feed')` with `useInfiniteQuery`, keyset cursor = last row's `(published_at, id)`, key per viewer (`['feed', userId|'guest']`, since rows carry `my_reaction`/`my_vote`). Only the first page is persisted (custom persister `serialize`), 30-min maxAge, buster bumped to 2. FlashList 2.0.2 (bundled in Expo Go SDK 57), memoized `PostCard`, stable callbacks, `getItemType` by kind.
- Post card: avatar, nickname, relative time, `#number` (confession/shoutout) or "Poll", "To: …" for shoutouts, ~6-line clamp with "Read more" (line count estimated, not measured, to stay cheap in a recycled list), up to 2 images via expo-image at their stored aspect ratio with blurhash placeholder (public `post-images` URL), poll bars with %, my vote highlighted, "Ended"/"Ends in …", reaction and comment counts. React/comment/vote/share: sign-in sheet for guests, "Coming soon" toast for members (new root `<Toast/>`).
- Announcement: newest active row, filtered on the server and again on the device.
- Realtime new posts: `usePostgresChanges` (UUID topic, foreground only, resubscribes on sign-in/out) on `posts` INSERT+UPDATE `status=eq.published`. Ids not loaded and not older than the newest loaded post count as new (this skips count UPDATEs on older posts). At the top → page 1 is refetched and merged silently; scrolled down → "N new posts ↑" pill (merging when tapped or when the user scrolls back up). On return from background, page 1 is checked for anything missed.
- Counts: every 30 s while the app is active and the Feed is focused, `feed_posts` counts for visible ids are merged into all feed and detail caches.
- States: skeleton on first load only, empty, full error with Retry, "Couldn't refresh" banner over cached posts, pull to refresh (the only spinner, user-initiated), end-of-list footer.
- Post detail `post/[id]`: card from `feed_posts` (painted from the feed cache first), comments via `get_comments` oldest first with keyset paging, live comment refetch on `comments` INSERT/UPDATE `post_id=eq.<id>`, live counts from `posts` UPDATE `id=eq.<id>`, skeleton/empty/error, friendly "not available" screen.
- Seed: `supabase/seed/dev_seed.sql` (24 confessions, 8 shoutouts, 4 polls incl. 1 ended, comments, 1 announcement, all prefixed `[seed] `) and `dev_seed_cleanup.sql`.
- Added deps (via `npx expo install`, both in Expo Go): `@shopify/flash-list` 2.0.2, `expo-crypto` (UUID topics).

**Verified**
- `tsc --noEmit`: 0 errors. `expo lint`: 0 problems. `expo-doctor`: 21/21.
- Typed routes regenerated by Metro (include `/post/[id]`).
- Seed SQL: both files parse with libpg_query (Postgres parser). The PL/pgSQL body of the DO block was not parsed.

**Not verified**
- Nothing ran on a device or emulator: status bar fix, six-box input (typing, paste, Backspace, autofill), FlashList behaviour, realtime delivery (including anon subscriptions and the enum filter `status=eq.published`), counts refresh, toast.
- The seed scripts were not executed (no local Postgres).
- The gear button at the top right of the Feed is Expo's floating dev Tools button, not app code; it does not exist in release builds.

**Left**
- Reactions, comments composer, voting, share (later modules).

**Deviations / notes**
- Relative times are computed at render and do not tick while a card stays on screen.

## Module 2.1: realtime via feed_events, status bar, "Read more" measurement (2026-10-22)

**Built**
- Realtime: migration `20261022100000_feed_events.sql` (applied by the owner) adds `feed_events` and drops `posts` from the Realtime publication. Types regenerated. The feed now listens to `feed_events` INSERT (no filter, UUID topic) and takes only `post_id`: ids already loaded or already pending are ignored; at the top page 1 is refetched and merged silently, scrolled down the pill counts up. Every listener on `posts` is gone.
- `usePostgresChanges` now takes options, keeps the channel through background trips under 30 s, closes it after 30 s in the background and recreates it on return, and calls `onResubscribed` on every SUBSCRIBED after the first (socket rejoin, retry, long background, sign-in/out). The feed then refetches page 1 (merged at the top, pill otherwise; only posts at least as new as the newest loaded one count). CHANNEL_ERROR / TIMED_OUT retry quietly on a fresh channel with backoff (2 s, 5 s, 15 s, 30 s), no UI, a warning in dev only.
- Post detail: live counts came from the `posts` UPDATE stream, which no longer exists. Counts now refresh every 30 s while the screen is focused and the app is active, and right away when a comment event arrives. The comments subscription stays (refetches on resubscribe too).
- Status bar: cause found (see below). The status bar background is now set to the theme `bg` on Android (`StatusBar.setBackgroundColor`), and the window background keeps following the theme (`expo-system-ui`, bundled in Expo Go SDK 57). The Module 2 timer/foreground re-apply was the wrong diagnosis and is removed. `expo-status-bar` still sets dark icons on light, light on dark.
- "Read more": measured with `onTextLayout` on a hidden, unclamped copy of the text (same width and style), not estimated. The unclamped copy avoids the Android/iOS difference in how `onTextLayout` reports lines when `numberOfLines` is set. Measurement and expanded state are keyed by post id.
- PRD: realtime bullet about feed_events added.

**Status bar cause**
- React Native draws the app behind a transparent status bar only when the activity is edge-to-edge. RN turns that on when the host app flags it, or when Android enforces it (target SDK 35+ on Android 15 without opt-out, or Android 16).
- SDK 57 release and dev builds are always edge-to-edge (the prebuild plugin says so; `edgeToEdgeEnabled` is no longer configurable). There our cream root view is behind the bar.
- In Expo Go on the test phone the window was evidently not edge-to-edge. The strip is then painted by `window.statusBarColor` (Expo Go's default: black), not by the app or the window background, which is why `setBackgroundColorAsync` alone did not help.
- `StatusBar.setBackgroundColor` only applies in non-edge-to-edge windows; Android ignores it in edge-to-edge ones. So the same code is right for both.

**Verified**
- `npm run gen:types` includes `feed_events`. `tsc --noEmit`: 0 errors. `expo lint`: 0 problems. `expo-doctor`: 21/21.
- From the library sources: realtime-js 2.118 reports SUBSCRIBED again after rejoins; RN 0.86 `StatusBarModule.setColor` is a no-op under edge-to-edge.

**Not verified**
- On a device: feed_events delivery (guest and member), reconnect/background catch-up, quiet retry, the status bar strip in Expo Go and in a build, the measured "Read more".
- Which Android version the test phone runs, and so exactly why Expo Go is not edge-to-edge there.

**Notes**
- A post restored by a moderator keeps its old `published_at`, so it reappears in its old place, not at the top. If the user is scrolled down, its event still raises the pill by one.
- `app.json` `backgroundColor` is `#0A0A0B`, so in light theme the first frames before JS runs are dark. expo-system-ui saves the color it sets, but its Android module code does not read it back at launch (not checked beyond that module).
