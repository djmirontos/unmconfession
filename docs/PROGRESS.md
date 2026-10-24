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

## Module 3: Create, photo pipeline, My Posts (2026-10-22)

**Built**
- Migration `20261022110000_allow_three_images.sql` (applied by the owner): 3 images per post and listing; polls none. PRD and CLAUDE.md updated from 2 to 3.
- Create tab: chips Confession / Shoutout / Poll / Sell / Lost & Found. All five forms stay mounted (hidden when inactive), so switching keeps text and photos. Zod schemas mirror the server limits (`lib/createSchemas.ts`); counters, inline errors after a field is edited, submit disabled while invalid, preparing photos or submitting; double taps ignored. Drafts (text only) per user and form in AsyncStorage, debounced, cleared on success. Sell and Lost & Found show the no-payments notice and a prohibited-items note linking to the Terms. Lost & Found dates are chips for the last 14 days (no native date picker).
- After submit: published post -> "Your confession is live (#123)" / "Your poll is live" and the post opens; pending -> "Sent for review. You'll be notified when it's approved." and My Posts opens; published listing -> toast and My Posts. Never says why something was held. My Posts and the Feed cache are refreshed.
- Photo pipeline (`lib/photos`): expo-image-picker (camera or gallery, picker quality 1, `exif: false`), permission denial explained with a Settings button; expo-image-manipulator decodes (orientation applied by the loader), shrinks to 1440 px on the long side (never enlarges), encodes JPEG 0.8; one photo at a time. Upload reads the file as an ArrayBuffer (Supabase's documented RN approach), strips APP1 (EXIF/XMP, incl. GPS), APP13 (IPTC) and comment segments from the bytes, rejects non-JPEG and files over 3 MB, and uploads to `post-images/<uid>/<uuid>.jpg` (expo-crypto) as image/jpeg, one at a time. Width and height come from the manipulated result. Thumbnails show Preparing / Uploading / done / Failed with remove; sizes are logged in dev only.
- Blurhash: pure JS (manipulator makes a 32 px copy, jpeg-js decodes it, `blurhash` encodes 4x3). Shipped, behind `computeBlurhash()`, returns null on any failure. TODO in the file to swap for a native encoder in the dev build if on-device timing disappoints.
- Retry: uploaded paths are kept per photo, so a failed RPC retry reuses them; the error says "Your photos were uploaded but the post failed, please try again." plus the reason.
- Cards (feed and detail): 1 photo at its ratio, 2 side by side, 3 as one large plus two small; blurhash or a neutral fill. Tap opens a full-screen viewer (swipe, pinch, drag while zoomed, double tap) built with react-native-gesture-handler + Reanimated, both in Expo Go.
- My Posts (Profile > My Posts, `/my-posts`): own posts and listings in every status merged newest first with keyset paging on (created_at, id) per source; the merge emits only rows that cannot be preceded by unfetched rows. Status badges, "Waiting for a moderator", reject/remove reason in plain words, published posts open. Skeleton, empty, error with retry, pull to refresh.
- errors.ts: no_profile, invalid_body, invalid_title, invalid_target, target_required, too_many_images, invalid_images, invalid_poll_options, invalid_poll_end, condition_required, invalid_price, invalid_lost_found, image_too_large.
- Deps via `npx expo install`: expo-image-picker, expo-image-manipulator, react-native-gesture-handler (all in Expo Go SDK 57). Pure JS: blurhash, jpeg-js. app.json: expo-image-picker plugin with photo and camera permission text, microphone off.

**Verified**
- `tsc --noEmit` 0 errors, `expo lint` 0 problems, `expo-doctor` 21/21, Android bundle exports.
- Node test of the metadata stripper: a JPEG with injected EXIF (GPS text), IPTC and comment segments comes out byte-identical to the clean original, decodes to the same pixels, and non-JPEG input is rejected.
- Node fuzz test (3000 random timelines, many equal timestamps) of the My Posts merge: every row once, in order, no gaps.
- jpeg-js + blurhash produce a valid 28-character hash (8 ms in Node for 64x48).

**Not verified**
- Anything on a device: picker, camera, permissions, resize quality and orientation, upload, blurhash timing on Hermes, viewer gestures, drafts, toasts and navigation, My Posts against real RLS.
- That a real phone photo with GPS has none after upload (see the manual check in the report).

**Known gaps**
- Stray uploads: if a post fails for good after its photos uploaded, or the user removes an uploaded photo, the file stays in Storage. Members cannot delete files (only staff), so cleanup needs a staff/cron job later.
- Upload progress is per photo (Preparing / Uploading / done), not a byte percentage: supabase-js `upload` has no progress callback.
- Lost & Found date: create_listing compares with `current_date` in the database time zone (UTC), so between midnight and 8 AM Philippine time "today" would be rejected. The app caps the date chips at the UTC date as a workaround; a migration using `(now() at time zone 'Asia/Manila')::date` would fix it properly.

## Module 3 fix: photo upload and dev error console (2026-10-23)

**Problem:** posting with a gallery photo showed "A photo could not be uploaded. Check your connection…". Metro showed the blurhash line but never the next `[photos] upload … KB` line, and Storage logged no request, so it failed on the phone between preparing the photo and sending it: reading the file or stripping its metadata. Neither error had a mapped code, so both became the generic message.

**Most likely cause:** the file was read with `fetch(file://…).arrayBuffer()`. In SDK 57 the global `fetch` is Expo's native fetch (expo/fetch), which reads local files through an interceptor and returns a "file not found" style response instead of throwing; the code never checked `res.ok`, so a failed read either threw or produced non-JPEG bytes that the metadata stripper then rejected (`not_jpeg`). Not confirmed on a device.

**Changed**
- Files are read with expo-file-system's native `new File(uri).bytes()` (SDK 57 API; the old `readAsStringAsync` style functions now throw unless imported from `expo-file-system/legacy`; this code never used them). expo-file-system added via `npx expo install` (in Expo Go).
- The upload body is an exact-size ArrayBuffer, as in supabase-js's documented React Native example. The path is built from the signed-in session's user id; a missing session or mismatching id is logged.
- Distinct friendly messages: `photo_read_failed` ("We could not read that photo…"), `upload_failed`, `network_error` (no connection), plus the existing `image_too_large`. The real error is kept as `cause` and logged.
- `lib/log.ts`: `logError` / `logInfo`, dev only, print name, message, status, statusCode, code, details, hint, error, originalError, cause and 4 stack lines. `lib/redact.ts` masks emails (a***@domain), hides JWTs, Bearer headers, Supabase keys and any secret-looking key (password, token, otp, apikey, authorization, session…). Test: `npm run test:redact` (5 cases, Node's built-in runner).
- Logged: every photo stage (decode, encode with size, blurhash, read, strip, upload start/done/fail), create_post / create_listing, feed refresh, realtime catch-up, counts refresh, realtime channel errors, all Auth calls, and every failed query or mutation via global QueryCache / MutationCache `onError` (scoped by key).

**Verified:** `tsc` 0 errors, `expo lint` 0 problems, `expo-doctor` 21/21, `npm run test:redact` 5/5, Android bundle exports.

**Not verified:** the fix on a device.

## Module 3 complete: Create, photos, My Posts, fix batches A and B (2026-10-23)

**Done (tested on device by the owner)**
- Create: confession, shoutout, poll, sell, lost & found; drafts saved per user and form; camera and gallery with permission handling; on-device resize (1440 px long side, JPEG 0.8); EXIF/GPS stripped from the bytes before upload; max 3 photos; upload reads files with the expo-file-system `File` API (`fetch(file://)` does not work with SDK 57's global expo/fetch); retry after a network failure reuses uploaded photos.
- My Posts with statuses (published, pending review, rejected, removed), posts and listings merged with keyset paging, Lost & Found event line ("On Oct 9 · Library 2F").
- `/post-status?source=&id=`: read-only screen for rejected and removed items with the full reason ("Why it was not published" / "Why it was removed"). Reads the My Posts cache, then the own row through RLS; no new server function.
- Dev error console (`lib/log.ts`, redacted, dev only) across photos, uploads, RPCs, feed, realtime, auth and all queries and mutations.

**Migrations added (applied by the owner in the SQL editor)**
- `20261022110000_allow_three_images.sql`: 3 images per post and listing.
- `20261023100000_lost_found_manila_date.sql`: create_listing judges the Lost & Found date in Asia/Manila, at most 60 days old. Replaces the client-side UTC workaround noted in the Module 3 entry.

**Decisions**
- Lost & Found date: Manila time, today back to 60 days; quick chips (Today, Yesterday, two earlier days) plus a native date picker (@react-native-community/datetimepicker 9.1.0).
- Single photo: full card width, frame clamped from 4:5 to 16:9, cover crop; the viewer shows the whole photo.
- Rejected reason: one truncated line on the My Posts card ("Rejected: <reason>"), in full on /post-status.
- The Lost & Found form shows the phone/ID safety notice at the top instead of the no-payments notice.

**Still open**
- Lost vs Found: needs a migration (column on listings) and a Lost/Found toggle on the form (batch C). Until then My Posts shows "LOST & FOUND".
- Edit and delete own posts (Module 3.1).
- Notifications and reactions (Module 4).
- Lost & Found tab (Module 5).
- Stray uploads when a post fails for good (members cannot delete files).

## Module 3 batches C and D: Lost vs Found, "Still needed" hint (2026-10-23)

**Batch C: Lost vs Found**
- `listings.lost_found_type` ('lost' | 'found'), required for Lost & Found and null for Sell. Migration `20261023110000_lost_found_type.sql`, applied by the owner in the SQL editor: create_listing now has a 9th parameter `p_lost_found_type`; existing Lost & Found rows were backfilled as 'lost'; `feed_listings` exposes the column. Types regenerated (only the new column and parameter changed).
- Lost & Found form: required toggle "I lost something" / "I found something" at the top, nothing preselected. Labels follow the choice ("Where did you lose it?" / "When did you find it?", neutral "Where" / "When" before a choice). "Choose whether you lost or found something." under the toggle once another field is edited, and for the server error `lost_found_type_required`. The choice is part of the draft; drafts saved before the toggle restore with nothing chosen. Sell never sends the parameter.
- My Posts: "LOST" / "FOUND" label and "Lost on Oct 9 · Library 2F" / "Found on …" line. /post-status: "Lost at" / "Found at" and "Lost on" / "Found on".

**Batch D: "Still needed" hint**
- "Still needed: <names>" below the Post button on all five Create forms (`MissingFieldsHint`, rendered by `SubmitFooter`). `lib/missingFields.ts` lists a field only when the existing schema validation flags it and it is empty, so the rules are not duplicated; filled-but-invalid fields keep their inline error.
- Names: Confession "Your confession"; Shoutout "Who it's for", "Your message"; Poll "Your question", "At least 2 options", "End time"; Sell "Title", "Price", "Condition"; Lost & Found "Lost or Found", "What", "Where", "When".
- Removed hints: "Pick the date to continue." (Lost & Found) and "Pick the condition to continue." (Sell). Photo hints ("Preparing photos…", "Remove the photo that failed to continue.") stay.

**Decisions**
- The Post button stays disabled until the form is valid.
- The hint can be hidden while the keyboard covers it; accepted.

**Still open**
- Module 3.1, edit and delete own posts: 24-hour edit window, keyword re-check on edit, "Edited" label, moderators see the original text for 30 days, delete with confirmation.
- Module 4: reactions, comments, voting, report / block / mute, notifications.
- Module 5: Trending, Buy & Sell tab, Lost & Found tab.
- Stray uploads when a post fails for good (members cannot delete files).

## Module 3.1: edit and delete own posts; batches F and G (2026-10-23)

**Database:** `supabase/migrations/20261023120000_edit_delete_own.sql`, applied by the owner in the SQL editor.
- RPCs `edit_own_post`, `edit_own_listing`, `delete_own_post`, `delete_own_listing`.
- `edited_at` and `deleted_at` on posts and listings; authors no longer see their own deleted rows (posts_read / listings_read).
- `feed_posts` and `feed_listings` expose `edited_at`.
- `purge_expired` also removes author-deleted rows after `rejected_retention_days`.

**Rules (server-enforced; the app mirrors them for UX)**
- Edit within 24 hours of posting, only published or pending items; not polls, not photos, not the kind or the Lost/Found choice.
- The keyword filter re-checks every edit: a match sends the item back to pending; under pre-moderation an edit always goes to pending.
- The previous text is kept in `moderation_actions` (action 'edit', reason_code 'author_edit', original_body = JSON text) for moderators for `audit_retention_days`.
- At most 10 edits per hour per user.
- Rejected and removed items cannot be edited, only deleted.
- Delete hides the item immediately and the row is purged after 30 days (`rejected_retention_days`). Post numbers are never reused.

**App**
- "· Edited" next to the time on feed cards and the post detail.
- "⋯" menu (Edit when allowed, Delete) on My Posts cards and on the post detail of the author's own post; one shared bottom sheet (`ActionSheet`, no new dependency).
- `/edit?source=&id=`: same fields, limits, schemas and "Still needed" hint as Create; photos read-only; notes for the 24-hour window (with time left) and the review filter; Save enabled only when changed and valid; toast "Saved" or "Sent for review"; the cached feed is patched and only the affected queries are invalidated. No drafts.
- Delete with confirmation ("Delete this post?" / "Delete this listing?", "It disappears right away and can't be undone."), toast "Deleted".
- `/post-status` for rejected, removed and pending items; pending shows "Waiting for review" / "A moderator will check it before it is published." (never the keyword or hold reason); Delete button on all of them.
- Error texts for `not_editable`, `edit_window_closed`, `not_found`.

**Batch F:** My Posts shows the same full cards as the Feed: `PostCard` reused (read-only: no action bar, no voting; counts on published items), new reusable `ListingCard` (SELL / LOST / FOUND, price and condition or the Lost/Found line, "Read more", photos), with the status badge, "⋯" and the review note. The query joins the author's profile and poll options. Published listings are not tappable yet (no listing detail screen).

**Batch G:** My Posts list aligned with the Feed: three post cell types plus one listing type, stable `onEndReached`, content style, header, empty and footer props. No visible change. Not measured on a device.

**Still open**
- Module 5: Trending, Buy & Sell tab and Lost & Found tab, with a listing detail screen.
- Module 4: reactions, comments, voting, report / block / mute, notifications.
- Branding: resize `mobile/public/unmlogo.png` (1.7 MB, untracked), app icon, splash, web panel logo.
- Module 7: moderator web panel.
- Stray uploads when a post fails for good (members cannot delete files).

## Module 4.1: Reactions (2026-10-23)

**Done**
- Six reactions with Microsoft Fluent Emoji 3D (MIT), resized to 96x96 PNG (about 4 KB each) from `microsoft/fluentui-emoji` commit `1ffb34c752ecf5d402f04cfb4b392c77f57c54bc` (angry = "Pouting face", U+1F621). LICENSE copied to `mobile/assets/reactions/LICENSE-fluentui-emoji.txt`; "Open source notices" screen under Profile -> About.
- Typed map in `lib/reactions.ts` (from the generated reaction enum).

**Behavior**
- Tap = like / unlike. Press and hold = picker: react-native-gesture-handler Pan after a 350 ms long press; list scrolling is locked while the picker is open. Release over an emoji picks it (same as current removes it); release without hovering keeps the picker open for a tap; release after dragging away closes with no change.
- Motion with Reanimated on the UI thread (card fade/scale in, staggered emoji springs, hover lift and scale, pick pop, button pop); reduce motion = highlight and fades only.
- Optimistic updates of the feed pages and the post detail, with a per-post latest-only queue (`lib/latestOnlyQueue.ts`) and rollback plus a toast on failure. No feed invalidation; the 30-second counts refresh reconciles.
- Guests get the sign-in sheet; counts only (no list of who reacted); My Posts counts stay read-only.

**Decisions / lessons**
- PanResponder and View touch handlers could not keep the gesture once FlashList's native scroll took the touch; gesture-handler with `activateAfterLongPress` does. `GestureHandlerRootView` now wraps the app.
- No haptics (expo-haptics is not installed).

**Next**
- 4.2 comments (list, composer, live updates, edit and delete own comment).
- 4.3 poll voting (vote change allowed until the poll ends).
- 4.4 report and block (block only).
- 4.5 notifications.
- Server work needed: edit/delete own comment, vote change, block filtering in feed / comments / trending.

## Module 4.2: Comments (2026-10-24)

**Database:** `supabase/migrations/20261023130000_comments_edit_delete.sql`, applied by the owner.
- RPCs `edit_own_comment` and `delete_own_comment`.
- `edited_at` and `deleted_at` on comments; `thread_comments` exposes `edited_at`.
- Authors no longer see their own deleted comments.
- `purge_expired` also removes author-deleted comments.

**Rules (same as posts)**
- Edit within 24 hours; the keyword filter re-checks every edit; "Edited" label.
- The previous text is kept in `moderation_actions` for moderators.
- At most 10 edits per hour per user, shared with post and listing edits.

**App**
- `CommentThread`: generic for posts and listings; it owns the detail screen's single FlashList.
- `CommentComposer`, with a fix for the gap above the Android keyboard.
- Edit and delete own comments.
- Held comments are shown to their author with a "Waiting for review" tag.
- Live updates via realtime (topic `comments:post:<uuid>:<random uuid>`) and a "New comments" pill.
- The thread cache is patched after create / edit / delete, with a 10-second staleTime.
- The Feed comment button opens the post with the composer focused.

**Lessons**
- A cached empty thread showed "No comments yet" next to a count of 1.
- Staff accounts (moderator / admin) bypass the keyword filter by design. Test keyword holds with a non-admin account (second test account `djmirontos+tester@gmail.com`, nickname `tester_two`).

**Still open**
- Branding: `mobile/public/unmlogo.png` is still untracked.

**Next**
- 4.3 poll voting (vote change allowed until the poll ends).
- 4.4 report and block (block only).
- 4.5 notifications.
- 4.6 comment reactions and one-level replies.
