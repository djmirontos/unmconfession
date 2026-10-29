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
- Staff accounts (moderator / admin) bypass the keyword filter by design. Test keyword holds with a non-admin account (second test account `tester@example.invalid`, nickname `tester_two`).

**Still open**
- Branding: `mobile/public/unmlogo.png` is still untracked.

**Next**
- 4.3 poll voting (vote change allowed until the poll ends).
- 4.4 report and block (block only).
- 4.5 notifications.
- 4.6 comment reactions and one-level replies.

## Module 4.3: Poll vote change (2026-10-24)

**Database:** `supabase/migrations/20261024100000_poll_vote_change.sql`, applied by the owner. `vote_poll` keeps its signature; a vote can be changed until the poll ends (the old vote moves to the new option in one sub-transaction, so `vote_count` stays right). Voting for the option you already have is a no-op.

**App**
- Users can change their vote until the poll ends; tapping the current option does nothing; guests get the sign-in sheet.
- Optimistic updates of the feed pages and the post detail with latest-only sync per poll (`lib/pollVoteSync.ts`, `hooks/usePollVote.ts`); rollback and a toast on failure; `poll_closed` also marks the poll ended in the caches.
- Live results: the 30-second counts refresh also merges `poll_options` and `my_vote`, skipping polls with a local vote in flight.
- Live countdown via `useMinuteClock` (one shared interval, only while an open poll is on screen); ended polls highlight the leading option(s).
- Error texts for `poll_closed` and `invalid_option`.

**Verified:** device QA passed.

## Module 4.4: Report + Block (2026-10-24)

**Database:** `supabase/migrations/20261024110000_block_filtering.sql`, applied by the owner. It includes `grant select on user_blocks to anon`, so guests can still read the feed views (RLS has no anon policy, so anon sees no rows).
- Blocked authors are hidden server-side for the blocker in Feed, Trending, active polls, listings and comment threads (`feed_posts`, `feed_listings`, `thread_comments`).
- No comment or reaction notifications from blocked users.
- Reporting your own content is rejected (`own_content`).

**App**
- Report sheet: six reasons, optional note up to 500 characters, on posts and comments (listings supported; the screen comes with Module 5).
- One-way Block from the "⋯" menu of other people's posts and comments; their content leaves the cached lists at once, then the lists refetch. Blocking the author of an open post goes back.
- Blocked users screen under Profile with Unblock (optimistic).
- Guests get "Sign in to report" / "Sign in to block".
- Report sheet keyboard fix on Android ("pan" mode): `TextField` `keyboardGap`, the same padding + negative margin technique as the comment composer, so the note and the full Submit button stay above the keyboard.
- Blocked users rows redesigned as separate cards with a compact Unblock pill.

**Known issues**
- `comment_count` can include a blocked user's comments, and the live "New comments" pill can count them.

**Verified:** device QA passed.

## Module 4.5: Notifications (2026-10-24)

**Database:** `supabase/migrations/20261024120000_notifications.sql`, applied by the owner.
- `get_notifications` (grouped, newest first, keyset on `(latest_at, group_key)`), `get_unread_notification_count` (unread groups), `mark_notifications_read`, `delete_notifications`; all SECURITY INVOKER, members only.
- Comment notices also return the parent post or listing.
- Reaction notifications carry the current reaction type and update when the reactor changes it, without re-notifying.
- Blocked users' notifications are hidden.
- Notifications older than 90 days are purged nightly (`purge_expired`, pg_cron job `unm-purge-expired`).

**App**
- Bell with unread badge in the Feed header (members only), a dot on the Profile tab and a Notifications row in Profile.
- Notifications screen with grouped rows: reactions and comments per post/listing ("X and N others reacted…"); approved / rejected / removed notices one row each with a reason.
- Newest first with keyset pagination, pull to refresh, Mark all as read, long-press to mark read or delete.
- Live updates through Realtime (debounced invalidation) for the list and the badge.
- Tap opens the post or the status screen; comment notices open the parent post; listing targets show a "soon" toast until Module 5.

**Known gaps**
- Listing notification targets cannot open until Module 5.
- Relative times update only on re-render.

**Verified:** device QA passed.

**Follow-up:** 'Delete all' in the Notifications header menu (with confirmation, optimistic with rollback; uses the existing own-rows delete permission, no migration). Device QA passed.

## Module 4.6a: Reactions on comments (2026-10-25)

**Database:** `supabase/migrations/20261025100000_comment_reactions.sql`, applied by the owner.
- `comment_reactions` table and `comments.reaction_count` (kept by a trigger).
- `thread_comments` exposes `reaction_count` and `my_reaction`.
- `set_comment_reaction` RPC (null removes).
- Notification types `comment_reaction` and `reply` (`reply` is used in 4.6b); the notification list groups them per comment.

**App**
- Same six reactions as posts: tap = Like, hold = picker, optimistic latest-only sync with rollback. `ReactionButton` is shared (new `onChange` and `compact` props).
- Compact button and count on every published comment; guests get the sign-in sheet.
- Realtime: reaction UPDATEs no longer count as new comments. An UPDATE of an unloaded comment counts as new only if it was published within ~90 s (a moderator-approved held comment).
- Notifications: "X and N others reacted to your comment"; tap opens the parent post.

**Known gaps**
- Comment reactions on listing comments have no screen until Module 5.
- A comment kept only in local state updates its reaction after the next refetch.
- Blocked authors' INSERT events can still raise the "New comments" pill (existing 4.4 issue).

**Verified:** device QA passed.

## Module 4.6a+: Top reactions (2026-10-25)

**Database:** `supabase/migrations/20261025110000_top_reactions.sql`, applied by the owner.
- `posts.reaction_breakdown` / `comments.reaction_breakdown` tallies, kept by the reaction triggers (add, remove, change type) and backfilled.
- `feed_posts` and `thread_comments` expose `top_reactions` (most used first, ties in fixed order). No identities exposed.

**App**
- Top reactions (Facebook style): posts and comments show the top 3 reaction types as overlapping emoji with the total, on the right before Share (posts) and next to the reaction button (comments, compact). Shared `TopReactions` component; the post stack is hidden when the action row is too tight.
- Optimistic approximation of the order with an exact total; the exact order comes from the next 30 s refresh (posts) or realtime row (comments).
- My Posts computes the same top 3 from `reaction_breakdown`.
- Persist buster bumped 2 → 3 (one cache reset on first launch after updating).

**Known gaps**
- Trending screen is still a placeholder.
- Order between refreshes is approximate while reacting.

**Verified:** device QA passed.

## Module 4.6b: One-level replies (2026-10-25)

**Database:** `supabase/migrations/20261025120000_comment_replies.sql`, applied by the owner.
- `comments.parent_id` / `reply_to_id` / `reply_count`; `create_reply` and `get_replies` RPCs; `get_comments` returns top-level comments only.
- Post/listing `comment_count` counts replies.
- `reply` notification to the author of the comment answered; the post owner is notified only of top-level comments.
- Removing or rejecting a top-level comment removes its replies; a comment merely held keeps them.

**App**
- Reply action on every comment and reply; reply mode in the composer ("Replying to {nickname}", prefill "@nickname " when answering a reply).
- Replies collapsed behind "View N replies", loaded lazily 20 at a time via `get_replies`, indented, one level only (answering a reply lands in the same thread).
- Same actions as comments: reactions with top 3, edit, delete, report, block.
- Optimistic send/delete with count patching and rollback; held replies show "Waiting for review" and are not counted.
- Flattened single-FlashList row model (comment, reply, viewReplies, viewMoreReplies, hideReplies); replies caches (`['replies', parentId]`) not persisted.
- Realtime: replies never raise the "New comments" pill or join the top-level list; they bump the post count and refresh loaded replies.

**Known gaps**
- Pages loaded with "View more replies" collapse back to the first 20 after a refetch.
- A moderator removing a top-level comment while you watch leaves its replies on screen until the next refetch.
- Blocked authors' reply INSERTs still bump the comment count (4.4 issue).
- Notification taps open the post without scrolling to the reply.
- Restoring a removed comment does not restore its replies (handle in the Module 7 moderator panel).

**Verified:** device QA passed.

## Module 5.1: Trending tab (2026-10-25)

**No migrations.** Server ranking (`get_trending`) is recomputed every 5 min by pg_cron (verified active); `get_active_polls` serves open polls.

**App**
- Header like the Feed (title + bell); segmented control Trending | Polls (last segment remembered in memory).
- Trending = top posts of the last 7 days ranked by reactions + 2×comments, up to 50, with a quiet rank badge (top 3 in accent).
- Polls = active polls, most votes first, inline voting / vote change and "Ends in" countdown.
- Same PostCard as the Feed with all interactions; both lists stay mounted so switching keeps scroll.
- Pull-to-refresh, skeleton, empty, error and offline states; refetch on focus / foreground only when older than 60 s; not persisted.
- Shared cache patcher (`lib/postLists.ts` `updateListedPosts`) keeps Feed, Trending and Polls coherent for reactions, votes, counts, edits, deletes, block/unblock and sign-out. Block now also removes the blocked user's replies from loaded threads.
- Shared hooks / components: `usePostListActions`, `PostListView`. `ChipGroup` chips get a 44 px touch target (hit slop).

**Known gaps**
- A post you just reacted to moves in the ranking only after the next 5-minute server refresh.
- An ended poll shows "Ended" until the next refetch removes it.

**Verified:** device QA passed.

## Module 5.2: Listing detail screen (2026-10-25)

**No migrations.**

**App**
- Listing detail screen (`/listing/[id]`): paged photo gallery (whole photos, no cropping; tap opens the zoomable full-screen viewer).
- Sell details (price, condition, Sold badge) and Lost & Found details (Lost/Found tag, place, Manila date, Found/Claimed badge); seller line; the existing MarketNotice / LostFoundNotice.
- Full comment thread with replies and comment reactions.
- Owner menu (Edit/Delete) and close toggle (Mark as sold / available, Mark as found / claimed / reopen) with optimistic cache patching and rollback; others get Report/Block.
- Unavailable, blocked and offline states; paints instantly from a cached My Posts card.
- Entry points: My Posts (published listings) and notification taps (comment / reply / comment reaction on a listing, approved listing / comment). Rejected / removed listing notices open `/post-status?source=listing`. The "Listings open in Buy & Sell soon" toasts are gone.

**Known gaps**
- Buy & Sell list/cache not built yet (add it to the listing patcher in 5.3).
- Closing a listing that was deleted meanwhile rolls back with the generic error text.
- A close toggle in the first moment patches only the My Posts copy until the fetch arrives.

**Verified:** device QA passed except the guest check, which moves to 5.3 because listings are not reachable for guests until the Buy & Sell tab exists (verified at the database level: guests can read `feed_listings`, `get_listings` and listing comments).

## Module 5.3: Buy & Sell tab (2026-10-25)

**Migration** `20261025130000_listings_filters.sql`: `get_listings` gains `p_lost_found_type`, `p_include_closed` and `p_search` (server-side, so keyset paging stays correct). Types regenerated.

**App**
- Buy & Sell tab (replaces the placeholder): header like Trending (title + bell), segmented switch Buy & Sell | Lost & Found (remembered in memory only). Both sections stay mounted, each with its own search, filters and scroll.
- Search box per section: 400 ms debounce, trimmed, max 60 characters, clear (X) button; clearing applies at once.
- Buy & Sell: 2-column grid (`ListingGridCard`): square first photo or a placeholder, price (`formatPrice`), 2-line title, SOLD badge. "Hide sold" on by default.
- Lost & Found: chips All | Lost | Found, the existing `ListingCard` (LOST / FOUND tag, date and place line, Found / Claimed badge, comment count). "Hide returned" on by default.
- One infinite query per section and filter combination (`['listings', viewer, filters]`), keyset paging, 20 per page, not persisted. While a new combination loads, the previous list stays on screen dimmed (no spinner).
- Listing cache patcher now covers every cached list page: close / reopen (hide-closed lists drop a closed item; on reopen they are marked stale and refetch on focus), comment-count changes, delete (dropped at once), edit (lists refetch), block (seller's listings dropped at once, then refetch), sign-out (lists removed). A new listing from Create invalidates the lists.
- States: skeleton grid / cards, search vs "nothing here yet" empty texts, error with Retry, "Couldn't refresh" banner on cached lists, pull-to-refresh, "Loading more…" footer, refetch on focus / foreground when older than 60 s.
- The listing detail screen paints instantly from a cached list card.
- Shared: `useDebouncedValue` (moved out of the nickname hook), `useRefetchWhenStale` (moved out of `PostListView`), `SearchField`, `InlineCheckbox`.
- 5.3c fixes: the tall gaps under the search box came from the form `Checkbox`, whose `flex-1` label got no width inside the filter row, so the text wrapped one letter per line. Replaced by `InlineCheckbox` (box + label, one 44 px target). Floating "+" removed (the Create tab does this; nothing else used Create's `?kind=` support, so it went too). Grid tiles keep a fixed price + 2-line title height so rows align; the list starts 8 px under the filters.
- 5.3d: listing detail shows the seller row (`AuthorLine`) at the top, above the gallery, for Sell and Lost & Found; the loading skeleton (`ListingDetailSkeleton`) matches.

**Known gaps**
- No realtime on the lists: new listings by others show after a pull-to-refresh, a focus refetch (older than 60 s) or a filter change.
- An edit refreshes the lists by refetching instead of patching in place.
- A reopened listing (or a failed close that rolls back) comes back to a hide-closed list only after the refetch, not instantly.
- The no-payments / safety notices show on the detail screen, not on the grid cards.

**Verified:** typecheck and lint pass. Device QA pending (including the guest check carried over from 5.2).

## Module 5.4: Back to top button (2026-10-25)

**No migrations.**

**App**
- Shared `useBackToTop(listRef, onScroll?)` + `BackToTopButton` (44 px round arrow-up, surface + hairline border, shadow, "Back to top"). Offset kept in a ref; state changes only when the button shows or hides, so scrolling never re-renders rows. `scrollEventThrottle` 16; an existing list `onScroll` (Feed at-top merge, comment thread near-bottom) is chained, not replaced.
- Shows past max(list height, 600 px), hides below it; fades and scales in over 150 ms (instant with reduce motion). While hidden it takes no touches and is hidden from screen readers.
- Tap: animated scroll to 0. Past 4 screens it first jumps to 1.5 screens from the top, then animates (a long animated scroll renders every row on the way). Reduce motion: jumps straight to the top.
- On Feed, Trending, Polls, Buy & Sell grid, Lost & Found list, My Posts, Notifications and the comment thread (post and listing). Tab screens: 16 px above the tab bar; stack screens: 16 px + bottom safe area; threads: 12 px above the composer, inside the list's box, so the keyboard moves it with the composer.

**Known gaps**
- On a thread, while the "New comments" pill shows, the pill (centred) and the button (right) share the bottom edge; they do not overlap on phone widths, but sit side by side.

**Verified:** typecheck and lint pass. Device QA pending.

## Module 6: Share card (2026-10-25)

**No migrations.** Installed with `npx expo install` (both in Expo Go): `react-native-view-shot` 5.1.0, `expo-sharing` ~57.0.24 (its config plugin was added to `app.json`).

**App**
- `ShareCard` (360 x 450 dp, captured at exactly 1080 x 1350 px): fixed indigo brand look, the same in light and dark, font scaling off so the system text size cannot push text out. Variants: confession (#number chip + body), shoutout ("Shoutout to …" + body), poll (question, up to 4 options, "+N more", no counts), sell (first photo, SELL chip, price, 2-line title), lost & found (big LOST / FOUND, title, place, date, photo if any). Sold / found / claimed listings get their badge. Posts with photos stay text-only. No author, nickname or avatar on any card.
- Brand in one place: `components/share/ShareCardBrand.tsx` (`SHARE_COLORS`, `ShareCardLogo` text wordmark; swap the logo there at the branding step).
- Text rules in `lib/shareText.ts` (pure, `npm run test:share`, 9 tests): over 600 characters cut at a word boundary with "…" and a "read more in the app" line; counted by code point (emoji never split); blank lines collapsed, at most 10 line breaks; runs over 20 characters without spaces (URLs) get zero-width break points; body size steps 30 / 24 / 19 / 16 / 14 px by length (line breaks count extra), each with a line cap that fits the box; polls cap the question at 3 lines and options at 1 line when 3+ / 4 options are shown.
- Capture: one `ShareCardHost` at the root (no hidden card per row), driven by `shareCardStore`. During a share the card is laid out at the top-left inside an `opacity: 0`, `pointerEvents="none"`, screen-reader-hidden wrapper (not off-screen: Android can skip drawing views outside the screen); the card view itself (`collapsable={false}`) is captured, so the wrapper's opacity is not in the image. Waits for layout and the listing photo (max 5 s; on error or timeout the card is shared without it), then `captureRef` → PNG in the cache → `Sharing.shareAsync` (image/png) → the file is deleted (best effort). Dev log prints the PNG size to spot blank captures.
- `useShareCard()`: sign-in check (guests get the sign-in sheet, per the PRD), `Sharing.isAvailableAsync()` first, one share at a time (other taps ignored), friendly toast on failure, closing the share sheet shows nothing.
- Wired: Share button in the post action bar (Feed, Trending, Polls, post screen) with a spinner and "busy" state for that post only; My Posts: "Share" in the "⋯" menu of published items; listing screen: share icon in the header, left of "⋯".
- 6b: confessions and shoutouts with photos show the first photo (cover-cropped, 240 dp tall, rounded, inset like the text) with the #number chip on its top-left and "+N more" bottom-right, then a caption of at most 5 lines (line breaks flattened, cut at 160 characters, 100 for shoutouts, plus "read more in the app" when cut). Same stored image as the feed (already 1440 px JPEG; there is no smaller rendition), same 5 s wait; a photo that fails falls back to the text-only card. Text-only cards: body centred between the chip and the footer, new 36 px step for texts up to 40 characters, a faint opening quote mark above short confessions.

**Deviation from the brief:** the brief said guests can share without signing in; the PRD (and CLAUDE.md) say sharing needs sign-in. Kept the PRD rule, confirmed with the owner.

**Known gaps**
- No direct Facebook / Instagram Story share until the dev build (system share sheet only).
- No link or QR code in the footer yet.
- Logo is a text wordmark placeholder until branding.
- The brand accent on the card is indigo; the app's accent is amber (one constant to change).

**Verified:** typecheck, lint and `test:share` pass. Device QA pending (including a check that Android captures are not blank).

## Module 8: Account settings (8a database, 8b nickname keywords, 8c profile screens) (2026-10-26)

**Migrations** (applied in the SQL editor): `20261026100000_account_settings.sql` (`user_settings`, `get_my_settings`, `set_notification_prefs`, `change_nickname` with a 30-day wait, `delete_my_account`, `user_flags.deleted_at`, `profiles_guard` locks deleted profiles, notification switches filter the list and badge) and `20261026110000_nickname_keywords.sql` (`nickname` keyword scope, `_nickname_flagged`, `nickname_flagged` from `_validate_nickname`, starter list). Types regenerated.

**App (8c)**
- Profile (members): header card with the 80 px avatar and a pencil badge (tap = avatar picker), nickname and email. Groups: Account (Nickname with "Next change on …" during the wait, My Posts, Notifications with the unread count, Blocked users, Notification preferences), About (Terms of Use, Privacy Policy, Open source notices), Appearance, Log out. Shared `SettingsGroup` / `SettingsRow`. Guests (and the moment before the profile loads) keep the old screen.
- Avatars: one table in `lib/avatars.ts` (12 classic icon presets unchanged + 68 emoji avatars in Faces, Animals, Nature, Food, Travel, Fun; keys `em_<name>`), emoji on a soft theme-aware tint fixed per emoji; unknown keys look like `avatar_01`. Picker is a bottom sheet (shared `BottomSheet`, also used by `ActionSheet`) with category chips, 5 x 56 px cells, opens on the current avatar's category; applies at once (optimistic, rollback, toast).
- Change nickname (`/change-nickname`): current name, rules line, the sign-up `NicknameField` with live check (own name: same = "already your nickname", capitals-only change allowed), confirm dialog, `change_nickname`; during the wait the field is disabled with the date. Errors mapped in `lib/errors.ts` (`nickname_flagged`, `nickname_unchanged`, `nickname_cooldown`, `account_deleted`; `nickname_locked` reworded); choose-nickname now shows the flagged message too.
- Notification preferences (`/notification-preferences`): Reactions, Comments, Replies switches, optimistic with rollback and toast, skeleton, error + Retry, locked with a notice when a refresh fails.
- A rename or a new avatar refetches every list that shows author names or avatars (shared `invalidateAuthoredLists`, also used by block / unblock; now includes My Posts).
- Texts: "permanent nickname" removed from Profile, choose-nickname, the nickname field hint, `nickname_locked` and the Terms. PRD and CLAUDE.md updated (nickname changeable every 30 days, admins rename, flagged words, new DB objects).
- 8c-fix: Terms eligibility no longer limits accounts to UNM students or staff: anyone can read; an account needs legal age where you live (or a parent's or guardian's permission), and the holder is responsible for it. No other legal or sign-up text named students as the only users.

**Decisions:** persist buster not bumped (no persisted shape changed; the invalidated feed refetches, and a restored stale feed refetches on open). Notifications row kept on Profile (the PRD lists it there and the Profile tab dot points to it). Terms and Privacy rows added to About (in the PRD's Settings list; they were only reachable from sign-up before).

**Known gaps**
- Other devices of the same member see a new nickname or avatar only after their lists refetch.
- A deleted author still reads as "member" / "Someone" in the app; the "Deleted user" label comes with account deletion in 8d.
- Staff can still change a deleted account's status or role (harmless; noted in 8a).

**Verified:** typecheck and lint pass. Device QA pending.

## Module 8d: About, Send feedback, Delete account, "Deleted user" (2026-10-26)

**Migration** (applied): `20261026120000_delete_account_closes_listings.sql` (`delete_my_account` also closes the person's open listings; otherwise unchanged).

**App**
- Profile About group: Community rules (new `rules` legal document, 10 short points), Terms of Use, Privacy Policy, Open source notices, Send feedback (mailto to `FEEDBACK_EMAIL` in `lib/config.ts`, placeholder; body has only app version and OS; a sheet with the selectable address if no mail app opens), Version (expo-constants; build number shown when the build sets one). `SettingsRow` gained info rows (no press) and an explicit chevron.
- Danger zone at the bottom: Delete account → `/delete-account`: warning card (erased / stays / also), type the nickname (trimmed, any case), final confirm, `delete_my_account`. On success (or `not_found` / `account_deleted`): `forgetDeletedAccount` in `lib/auth.ts` makes the app a guest first, then signs out locally (removes the stored session itself if that call fails offline), drops every query and local storage key for that user id (drafts, avatar tip), and goes to the Feed with "Your account was deleted." Other errors stay on the screen (`confirm_mismatch` on the field, `last_admin`, network); double taps ignored.
- "Deleted user": one helper `lib/authorLabel.ts` replaces the "member" / "this member" / "Someone" fallbacks (author lines, comments, reply target, blocked users, block toasts, notifications); deleted authors get a grey silhouette avatar; Block is hidden for them (menu and hook), Report stays; a deleted author's closed listings read "Closed" (grid, Lost & Found card, detail, share card).
- Legal: Privacy gains a "Deleting your account" paragraph; Terms one sentence pointing to Profile → Delete account.
- PRD and CLAUDE.md: settings list, deletion rule, open TODOs (panel status/role refuse deleted accounts, Google Play deletion page, feedback address).

**Known gaps**
- 8d-fix: Privacy no longer says "ask an admin to delete your account and content"; it now says you can delete your own posts, comments and listings anytime and delete your account yourself in Profile → Delete account.
- Replying to a deleted user's reply adds no "@name" prefix (there is no name to mention).
- The no-connection text stays the app-wide one ("No connection. Check your internet and try again.").

**Verified:** typecheck and lint pass. Device QA pending.

## Module 9b: native Google Sign-In, Terms and age checkbox, encrypted session, auth fixes (2026-10-26)

**Migration** (9a, applied): `20261026130000_terms_acceptance.sql` (`user_flags.terms_accepted_at`, `set_nickname(p_nickname, p_accept_terms)`, `set_nickname` and `delete_my_account` refuse restricted accounts). Types regenerated.

**Packages:** `@react-native-google-signin/google-signin` 16.1.5 (free "Original" API; supports Expo 52.0.40–57, RN 0.76–0.87, old and new architecture; not in Expo Go), `expo-secure-store` ~57.0.4 (in Expo Go), `aes-js` 3.1.2 + `@types/aes-js` 3.1.4. Removed `expo-web-browser` (no users left). `expo-linking` kept (expo-router depends on it).

**App**
- Google: `lib/googleSignIn.ts` loads the library lazily (importing it without the native module throws), configures it once at startup with `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, and `isGoogleSignInAvailable()` is the one feature check. `signInWithGoogle()` in `lib/auth.ts`: Play services check, account picker, ID token, `signInWithIdToken`; returns success / cancelled (silent) / failed (message from `lib/errors.ts`: Play services, no connection, no ID token, setup error, provider off). No nonce: the free API has none. Sign-out and account deletion also sign out of Google (best effort). Old browser OAuth code, `OAUTH_REDIRECT_URL` and `app/oauth-callback.tsx` removed. The button stays visible but disabled, with a helper line, in Expo Go or without the client id.
- Terms: shared `TermsCheckbox` (legal age or guardian permission, Terms of Use, Privacy Policy) on sign-up and, when `terms_accepted_at` is null, on choose-nickname (`useTermsAccepted`); the Save button waits for a valid nickname and the box. `terms_required` shows on the box.
- Errors: `terms_required`, `account_restricted`, Google codes, `provider_disabled`; wrong password and "account already exists" add "Joined with Google? Use Continue with Google."
- Membership: new `error` state (profile failed, nothing cached) with `retry`. `useRequireAuth` shows "Checking your account…" while loading and a tappable "Could not load your account. Tap to retry." on error (the toast gained an optional tap action). Create and Profile show a "Try again" card instead of an endless skeleton.
- Cold start: a plain cover hides the app until the stored session is read and, when there is one, the membership is known (at most 2.5 s), so the tabs no longer flash before choose-nickname. Not shown on later sign-ins, so a Google sign-in from the sheet leaves the user where they were.
- Session: `lib/sessionStorage.ts` (Supabase "LargeSecureStore" pattern): a fresh 256-bit key per write (expo-crypto) in SecureStore, AES-CTR ciphertext in AsyncStorage. Unreadable values (no key, restored backup, Keystore error, the old plain-text session) are removed and the app continues as a guest. The value is URI-encoded before encryption because aes-js 3.1.2 corrupts 4-byte UTF-8 (emoji). `forgetDeletedAccount` removes the session through the same storage.
- Privacy Policy: two sentences on what Google shares and what is kept. PRD and CLAUDE.md: sign-in methods, Terms storage, restricted accounts, encrypted session.

**Decisions not in the brief:** Google plugin entry kept without options (no-op on Android without `google-services.json`; iOS will need `iosUrlScheme`). A fresh AES key on every write (Supabase's pattern) instead of one long-lived key. Startup cover capped at 2.5 s. The sign-up checkbox no longer mentions admin email lookups (the Terms and Privacy Policy still do). A paused profile query counts as an error.

**Left / setup:** Google Cloud OAuth clients (Web client id in `.env`; Android client with the debug and release SHA-1), Supabase Google provider (web client id as the first client id). Native Google Sign-In cannot be tested in Expo Go; it is tested after the development build (Module 9c). If Supabase rejects the token over a nonce, turn on "Skip nonce checks".

**Verified:** typecheck and lint pass; `expo-doctor` 21/21; AES round trip, wrong-key rejection and emoji tested in Node. Device QA pending.

## Module 9c-1: project ready for one development build (2026-10-26)

**Native dependencies:** added `expo-dev-client` ~57.0.20, `expo-updates` ~57.0.26, `expo-splash-screen` ~57.0.10 (all via `npx expo install`); `sharp` (dev, for branding). No missing native module found in the source. `expo-build-properties` not needed.

**Branding:** `npm run branding` (`scripts/make-branding.mjs`) makes `assets/branding/` from `public/unmlogo.png` (untracked, unchanged): `icon.png` (1024, opaque, seal at 84% on navy `#03224B`), `adaptive-icon-foreground.png` (seal 640 px, inside the 66% safe circle), `splash-icon.png` (1024, transparent), `favicon.png` (48). Palette PNGs; files over 250 KB fall back to 16 colours without dithering (the seal is flat colour). No monochrome icon: the seal is a full disc with ring text, so a one-colour silhouette is a plain circle with noise. Splash background white `#FFFFFF`, dark `#0A0A0B` (the app's dark background).

**app.json:** icon, adaptive icon (navy background), `versionCode` 1, splash plugin (image width 200, light and dark), `blockedPermissions` SYSTEM_ALERT_WINDOW and VIBRATE (RECORD_AUDIO already removed by the image picker plugin). Kept: INTERNET, CAMERA, ACCESS_NETWORK_STATE, READ/WRITE_EXTERNAL_STORAGE (max SDK 32; the photo picker asks for both on Android 12 and older). No `updates.url`, `runtimeVersion` or `extra.eas.projectId` by hand: `eas init` and `eas update:configure` add them.

**eas.json:** CLI >= 22.2.0, remote app versions; development (dev client, internal APK, channel development), preview (internal APK, channel preview), production (AAB, auto increment, channel production).

**EAS environment variables:** preview and production builds need `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` created as EAS environment variables (`eas env:create`), because EAS builds do not read the local `.env`. The development build gets them from Metro (local `.env`) when it loads the JS.

**From now on:** the app runs only in the development build (Expo Go cannot load it). Rebuild only when a native dependency or native config changes.

**Verified:** typecheck, lint, `expo-doctor` 21/21. `expo prebuild --platform android --no-install --clean`: manifest (permissions above, scheme `unmconfessions`, label "UNM Freedom Confessions"), `applicationId` com.unmfreedom.confessions, `versionCode` 1, adaptive icon with `#03224B`, splash colours, Google Sign-In and all Expo modules autolinked. `android/` and `ios/` deleted again (both gitignored); prebuild's rewrite of the `android`/`ios` npm scripts to `expo run:*` was reverted.

**Device QA (after 9c-1):** the first development build is installed on an Android phone, and Google sign-in passed device QA.

## Module 9d: bottom-edge spacing and legal wording (2026-10-26)

**Found on the first development build (Android, edge-to-edge):** the guest "Sign in to comment" bar sat almost on the bottom edge with its label looking clipped, and bottom sheets ended too close to the system navigation/gesture area.

**Audit:** every bottom-pinned element except the comment composer already added `insets.bottom`, but with no minimum (a phone that reports 0 left only the 12–24 px padding). The composer used `max(insets.bottom, 10)` with no padding of its own. Buttons, action-sheet rows and report reasons had a fixed `h-12`, so a larger system font could clip the label. The tab bar (React Navigation) and the scrolling screens (`insets.bottom + 16/24`) were fine.

**Changes (JS only, no rebuild):**
- `hooks/useBottomInset.ts`: `max(insets.bottom, 12)`, the one source for bottom-edge spacing. Used by `BottomSheet` (+12, so ActionSheet, avatar picker, profile sheet, own-item and Report/Block menus), `SignInSheet` (+24), `ReportSheet` (+12), the iOS date sheet in `RecentDateChips` (+16) and `CommentComposer` (+8, guest and member, post and listing detail).
- Composer with the keyboard open: on iOS (`hooks/useKeyboardWillShow.ts`, "will" events only fire there) the safe-area part is dropped, so the composer sits right on the keyboard. On Android the window pans, and the padding below the input stays hidden under the keyboard (unchanged `KEYBOARD_GAP` behaviour).
- `Button`: `min-h-12 py-3` instead of `h-12`, and the label shrinks and wraps, so the button grows instead of clipping. Same for `ActionSheet` rows and `ReportSheet` reasons (`min-h-12 py-2`). The normal height is unchanged (48).
- Legal: Draft wording removed after school approval (the "Draft. Final wording pending school approval." subtitle and the draft comment in `app/legal/[doc].tsx`). No other legal text changed.
- CLAUDE.md: OTA rule (`runtimeVersion` policy `appVersion`: native changes need a `version` bump and a new build; JS-only changes ship as an EAS Update on the matching channel) and the bottom-inset rule.

**Verified:** typecheck, lint and `expo-doctor` pass. Spacing and keyboard behaviour need a device check.

## Module 9d-2: guest comment button opens the sign-in sheet (2026-10-26)

- A guest tapping the comment button on a card in Feed or Trending now gets the sign-in sheet ("Sign in to comment") in place, through `useRequireAuth('comment')` in `usePostListActions().openComments`, the one handler both lists share. The rest of the card still opens the post so guests can read the comments. Members are unchanged (post opens with the composer focused). Loading, error and choose-nickname-pending accounts still open the post as before; banned and suspended accounts are members, so their handling is unchanged too.
- My Posts and Buy & Sell listing cards only show read-only counts (no comment button). The post detail screen (its card button and its "Sign in to comment" bar) is unchanged.
- Not done: opening the post automatically after a sign-in started from this sheet. Sign-in finishes in three places (Google in the sheet, the email sign-in screen, choose-nickname), so carrying the target post through all three is more than a few lines.

**Verified:** typecheck, lint, `expo-doctor`. Device QA pending.

## Module 7a: admin panel data layer (2026-10-27)

**Migration** `20261027100000_admin_panel.sql` (applied): `admin_audit_log` (admin-only read), staff read RPCs (`mod_get_reports`, `mod_get_report_details`, `mod_get_content`, `mod_list_content`, `mod_search_users`, `mod_get_actions`, `mod_dashboard`), admin-only `admin_get_user_identity`, `admin_find_user_by_email` (audited; the searched address is not stored), `admin_get_audit`, `admin_delete_account` (banned or suspended accounts only, reason required, audited). `mod_set_user_status` and `admin_set_role` now refuse deleted accounts, and `admin_set_role` is audited. Types regenerated for mobile and admin (additions only; mobile typecheck passes).

**Left:** the retention purge does not clear `admin_audit_log` yet (needs a migration).

## Module 7b: admin panel scaffold, sign-in with TOTP, dashboard (2026-10-27)

**Stack (`admin/`):** Next.js 16.4.3 (App Router, Turbopack, `proxy.ts`), React 19.3.1, TypeScript ~6.0.3, Tailwind 4.3.3, shadcn 4.22.1 (Radix base, nova preset; `cn` from shadcn replaces clsx + tailwind-merge), `@supabase/ssr` 0.12.7, `@supabase/supabase-js` 2.118.0, zod 4.6.7, vitest 5.0.5, ESLint 9 with `eslint-config-next` 16.4.3. TypeScript 7 and ESLint 10 are newer, but typescript-eslint needs TypeScript below 6.1 and the React, import and jsx-a11y ESLint plugins do not support ESLint 10 yet.

**Security:**
- Server-only Supabase: no browser client. `SUPABASE_URL` / `SUPABASE_ANON_KEY` are read on the server only. Cookies are httpOnly, `sameSite=lax`, and `secure` in production.
- `requireStaff()` / `requireAdmin()` (React `cache`) run on every page and action: `getUser()` validated by Supabase Auth, the assurance level from that token (`aal2` required), the 12-hour limit from the token's `amr` password timestamp, then `is_staff` / `is_admin` → `/403`.
- TOTP: after the password, non-staff accounts are signed out ("no panel access"). No verified factor means `/security/enroll` (old unverified factors are removed first, then `mfa.enroll`, a QR data URL and the secret, then `mfa.challengeAndVerify`). With a factor, `/login/verify` uses `mfa.challengeAndVerify` with the factor taken from the validated user, never from the form.
- Proxy: `getClaims()` session refresh, the activity cookie (30 minutes idle, 12 hours absolute; a future timestamp counts as tampering) with `signOut({ scope: 'local' })`, redirect to `/login` for signed-out visitors, and a fresh CSP nonce. A session past 12 hours found by a page goes to `/auth/expired`, which signs out.
- Headers: nonce + `strict-dynamic` CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, `no-referrer`, Permissions-Policy, COOP, `X-Robots-Tag: noindex`, plus robots.txt disallow-all and the noindex meta tag. `cacheComponents` / partial prefetching are off (partial prerendering does not work with a nonce CSP), and the root layout awaits `connection()`.
- Login errors are generic; inputs are validated with zod; `ActionResult` results; codes become text only in `lib/errors.ts`.

**UI:** navy sidebar with a gold active marker, a top bar with nickname, role badge and Sign out, the sidebar as a sheet on mobile, and light/dark following the system (CSS media query, no theme script). Font: Public Sans, self-hosted by next/font. Dashboard: `mod_dashboard` in 4 groups of linked tiles, with a skeleton and an error boundary with retry. Review, Reports, Content, Users, Keywords, Moderation log and Audit log (admin) are "Coming in the next step" placeholders behind the real guards. Root not-found, error and global-error pages.

**Tests:** 54 vitest tests: error mapping, the route access table (plus a check that every page calls the right guard), the idle and absolute timeout logic, the CSP builder, and the service-role scan (`npm run check:secrets`).

**Verified:** `npm run typecheck` (with `next typegen`), lint, tests and `next build` (dummy env values inline) all pass with no warnings. A smoke run of the build: signed-out `/` and `/audit` redirect (307) to `/login`; every header is present; each response has a fresh nonce and all Next.js scripts carry it; robots.txt disallows everything.

**Deviations:** CSP `style-src 'unsafe-inline'` (Radix and Sonner set inline styles, and style attributes cannot carry a nonce). Enrolling TOTP signs the person out of their other sessions, including the mobile app, once (Supabase behaviour). The idle cookie is not signed (no extra secret allowed); tampering only extends the person's own idle window, and the 12-hour limit comes from the validated token.

**Left (7c–7f):** review queue, reports, content, users, keywords, logs. A real sign-in on a running panel needs `admin/.env.local` and a moderator account with TOTP.

## Module 7b-fix: local sign-in blocked (2026-10-27)

**Causes found on a real local run:**
- Server Actions were rejected ("origin `null` does not match x-forwarded-host"). `Referrer-Policy: no-referrer`, from both the header and the `<meta name="referrer">` that the root layout metadata emitted, makes browsers send `Origin: null` on same-origin form POSTs, and Next.js's CSRF check rejects them.
- That rejection is also why `POST /login` was followed by `GET /login`: the password action never ran, so no session and no redirect. Reading the flow end to end found no other lost state: the session written during the action is visible to the `is_staff` check in the same request, the activity cookie is set before the redirect, and the proxy leaves signed-out requests to /login alone.
- HTTP 431: by default `@supabase/ssr` stores the whole user object (identities, metadata, factors) in the session cookie. Measured with the library's own encoder: 3,469 B for a typical moderator and 8,774 B (3 chunks) in the worst case (254-character email, Google-linked). Cookies from other localhost dev servers share Node's 16 KB request-header limit.

**Fixes:**
- `Referrer-Policy: same-origin` (header in the new `lib/security-headers.ts`, and the metadata). The Server Actions origin check is unchanged and no allowedOrigins were added.
- The session cookie stores only the tokens (`encode: 'tokens-only'` in both server clients; the user object stays in per-request memory, and the panel never reads `session.user`). Now 1,557 B typical and 3,168 B worst case, in one cookie, including the 40 B activity cookie. Old `.0/.1/.2` chunks are removed by `@supabase/ssr` on the next write.
- `lib/auth-flow.ts`: one `redirectFor(state, page)` used by `requireStaff()`, the three sign-in pages and the actions. A session past 12 hours on /login now goes through `/auth/expired` (sign-out) instead of showing the form over a stale session.
- `allowedDevOrigins: ['127.0.0.1']` in development only.
- In development, the proxy logs the Cookie header size and cookie names (never values) when the header is over 3 KB.
- `vitest.config.ts` renamed to `.mts` (removes Vite's ESM warning).

**Redirect sequences:**
- (a) No authenticator: `POST /login` (action) → `/security/enroll` → set up → `/`.
- (b) Authenticator set up: `POST /login` → `/login/verify` → code → `/`.
- (c) Already at aal2: `/login`, `/login/verify` and `/security/enroll` all → `/`.

**Verified:** typecheck, lint, 84 tests (cookie budget under 4 KB; the redirect table with a no-loop check; headers) and `next build`, all with no warnings. The built app sends `Referrer-Policy: same-origin` and `<meta name="referrer" content="same-origin">`. A real sign-in is still to be retested by the user.

## Module 7b-fix2: /security/enroll crashed after the tokens-only change (2026-10-27)

**Root cause:** `getAuthState()` called `mfa.getAuthenticatorAssuranceLevel()` with no token. That auth-js path reads `session.user.factors` from `getSession()` to compute `nextLevel` (GoTrueClient.js, the only `session.user.factors` read in auth-js). With tokens-only cookies the session's `user` is a placeholder that throws on access, so every sign-in page and `requireStaff()` failed once a password session existed. Our own code never read the session's user; the sign-in action used `data.user` from the `signInWithPassword` response.

**Changes:**
- `lib/auth.ts`: `getValidatedUser()` (React `cache`, one `getUser()` per request) is the only source of user fields. `getAuthState()` takes `aal` and `amr` from `getClaims()` (signature checked, or confirmed with Supabase Auth) and also checks that `claims.sub` matches the user's id. The decision is the pure `deriveAuthState()` in `lib/auth-flow.ts` (now also `verifiedTotpFactorId()`).
- `app/(auth)/actions.ts`: `signIn` reads factors from a fresh `getUser()` after the password, not from the sign-in response. The enrol and verify actions keep using factors from the validated user (never from the form).
- `proxy.ts`: the matcher skips Next's dev-only `/__nextjs_*` endpoints.
- Checked in auth-js: `getClaims`, `getUser`, `mfa.challengeAndVerify`, `mfa.enroll`, `mfa.unenroll`, `signOut` and the session refresh use only the session's tokens, not its user.

**Tests (100):** a source-scan guard (no `getSession()`, no `session.user`, no `data.session.user`, no no-argument `getAuthenticatorAssuranceLevel()` in app/lib/components/proxy). Page tests render the real `/security/enroll` and `/login/verify` and run `requireStaff()` against a fake Supabase client that throws like tokens-only (enroll renders; the redirects for factor / aal2 / signed out / over 12 hours; aal1 refused; non-staff → /403). The fake client also proves the old call throws.

**Console `Unexpected end of JSON input`:** not from panel code (no client `fetch` or `JSON.parse`; actions use React's own protocol). Most likely Next's dev error overlay reacting to the server error above, or a browser extension.

## Module 7c: review queue (2026-10-27)

**Pages:**
- `/review`: `mod_get_queue`, oldest first, pages of 50 with Load more (the cursor is the last `created_at`, passed back unchanged so microseconds are kept). Filter chips All / Posts / Comments / Listings (`?filter=`, applied to the loaded rows; the dashboard tiles link to them). Each row shows the type, kind, author ("Deleted user" for a null nickname), relative time with the exact Manila time on hover, a 200-character preview, the image count, and the hold (matched keyword in a gold badge, or pre-moderation). Empty state "The queue is clear".
- `/review/[type]/[id]`: `mod_get_content`, with the full body as plain text (line breaks kept, the keyword marked case-insensitively), images in a click-to-zoom dialog, author status, post number, the parent post number for comments (one extra `mod_get_content`), shoutout target, poll end, listing fields, hold reason, created time and open reports (link to /reports). An item that is no longer pending shows its current status and who handled it, with a link back. Bad ids or missing items show not-found.
- `/review/next`: the server picks the next pending item after the current one, wrapping to the oldest and keeping the filter, or goes back to the list with "No more items" when nothing is left.

**Actions** (`app/(panel)/review/actions.ts`; every one calls `requireStaff()` and validates with zod):
- Approve.
- Reject: dialog with a required reason (6 labels; the label goes to `p_reason`) and an optional note (500 → `p_note`).
- Edit and approve (posts 2000 / comments 1000, trimmed, required reason ≤ 200): `mod_edit_content`, then `mod_review` approve. If the edit is saved but the approval fails, the result is `approve_failed_after_edit`; the page then shows "The edit was saved, but approving failed" with Retry approval (approve only).
- `invalid_transition` shows "Someone else already handled this item" and moves on to the next item.
- Buttons are disabled while a request runs (`useTransition` plus a ref guard against double submits). `revalidatePath('/')` and `revalidatePath('/review')` keep the dashboard counts current.
- Shortcuts: A, R, E, ← and →, ignored in inputs, textareas, dialogs and with modifier keys; a legend sits under the buttons. Previous / next come from the head of the queue (100 items) plus an exact "after" query.

**Images:** plain `<img>` from the public `post-images` bucket on the project's Supabase origin (already allowed by the CSP `img-src`), with `referrerpolicy=no-referrer`, the stored width and height (no layout shift), lazy loading, and a Radix dialog lightbox with arrow keys. Paths outside `<folder>/<file>` are dropped.

**Tests (143):** reject reason labels; highlight (regex escaping, case, no overlaps, empty term, Unicode and emoji, line breaks); action schemas; the new error codes; next-item selection (middle, last → wrap, empty, item already gone, filters); previous / next; preview; image and extra parsing; shortcuts; and each review page and action calling `requireStaff()`.

**Verified:** typecheck, lint, tests and `next build` pass with no warnings. Not tested against live data.

**Limits:** `mod_get_queue` pages by `created_at` only, so two items with the same microsecond at a page boundary could be skipped (very unlikely). For regex keywords (phone numbers), `matched_term` is the pattern, so nothing is highlighted. Filters apply to loaded pages, so a filtered view may need Load more to reach older items of that type.

## Module 7d: reports, content and users (2026-10-27)

**Database facts the UI relies on (read from the migrations):**
- `mod_review('remove'|'reject')` itself marks every open report on the item `actioned`, writes `moderation_actions`, and notifies the author (`content_removed` / `content_rejected` with the reason). `remove` needs status published. `restore` needs removed or rejected, publishes again (the stamp trigger sets `published_at` and a post number if missing), clears `reject_reason`, and sends the author `content_approved`. It does not check `deleted_at`.
- `comments_cascade_children`: removing or rejecting a top-level comment sets its published and pending replies to removed (and drops their holds), with no log entry or notification for those replies. Nothing reverses this on restore.
- `mod_resolve_report` resolves one open report and raises `not_found` when the report is already resolved.
- `admin_set_nickname` does not check `deleted_at` or reserved/flagged words. `admin_set_role` allows changing another admin.

**Pages:**
- `/reports`: list (type chips, Load more by `(first_reported_at, id)`).
- `/reports/[type]/[id]`: content view, all reports, and Remove content (reason list + note → `mod_review remove`, then resolve the reports still open), Mark handled, Dismiss reports, Edit (reports stay open). A pending item shows a banner to the review page; removed or rejected items keep only the resolve actions. Reports whose content was purged still show and can be resolved. Then `/reports/next` picks the next item (same tested pick function as the review queue), or "No more reports".
- `/content`: type, status and debounced text search in the URL, rendered on the server, Load more by `(created_at, id)`.
- `/content/[type]/[id]`: content view, moderation history (original text of edits in a disclosure), Remove / Edit / Restore by status. No Restore for author-deleted items. Warning on restoring a top-level comment: its cascaded replies stay removed.
- `/users`: nickname search, status and role filters, "Show deleted accounts", initial avatar. Admins get Find by email (form POST, never in the URL; audited; zero rows → "No user with that email"; success → the user page).
- `/users/[id]`: details, history (`p_subject_user`), Suspend (1 / 3 / 7 / 30 days or a custom Manila time → UTC, future only, reason 3–300), Ban (reason), Restore. Admins: Change role (with one-line role help), Rename, Reveal email and sign-in details (audited; kept only in the page state, Hide button), Delete account (banned or actively suspended, not admin, not self; reason ≤ 300 plus the typed nickname, checked again on the server). Deleted accounts show "Deleted user", the stored reason and no actions.
- Sidebar: count badges for Review queue and Reports from `mod_dashboard` (cached per request, shared with the dashboard, hidden at zero or on error).

**Refactor:** shared `ContentView`, `ReasonDialog` / `EditDialog` / `ConfirmDialog`, status badges, history list, URL filters, keyset hook and skeletons; the review detail page now uses them. The 7c behaviour is unchanged.

**Tests (208):** the multi-step flows (remove then resolve, already removed, partial, reports already handled), next-report pick, suspension dates (presets, Manila → UTC, past rejected, "Suspension ended"), the availability matrix, every new schema, the new error codes (plus the nickname unique-index race), labels, and that every 7d page and action calls the right guard.

**Verified:** typecheck, lint, tests, check:secrets and `next build` pass with no warnings. Not tested against live data.

**Suggested database additions (not built):**
- An author filter on `mod_list_content` (a user's own posts, comments and listings on their page).
- `mod_review('restore')` refusing items with `deleted_at` (the panel already hides Restore for them).
- `admin_set_nickname` refusing deleted accounts and applying the reserved/flagged-word rules.
- A way to restore the replies a top-level comment removal cascaded, or log them in `moderation_actions`.
- A "mute" status (the PRD lists mute; the schema has active, suspended and banned only).
- A last-admin guard on `admin_set_role` (two admins can demote each other).

## Module 7d.2 / 7d.3: panel follow-ups (2026-10-27)

**Migration** `20261027120000_admin_panel_followups.sql` (7d.2, applied):
- `mod_list_content` gains a trailing `p_author` filter (dropped and recreated, since the signature changed; staff only as before).
- `mod_review('restore')` refuses items the author deleted themselves (`deleted_by_author`) and no longer notifies a deleted account.
- `admin_set_nickname` refuses deleted accounts (`account_deleted`).
- Types regenerated with the CLI; `admin/types/database.ts` and `mobile/types/database.ts` are identical again (one optional arg added; mobile typecheck passes).

**Panel (7d.3):**
- `/users/[id]`: "Content by this user" card: the shared `ContentList` (rows link to `/content/[type]/[id]`, keyset Load more) filtered by author, with type and status filters in the URL, a row skeleton (Suspense), "This user has no content" / "Nothing matches these filters", and an inline error. Works for deleted accounts (rows show "Deleted user").
- `contentListArgs` (`lib/moderation/content-args.ts`) builds the `mod_list_content` arguments for the Content page and the user page; `contentFiltersSchema` accepts an `author` id.
- `contentActions` (`lib/moderation/availability.ts`) decides Remove / Edit / Restore; author-deleted items show "Deleted by author" instead of Restore. Restore only appears on the content detail page (the review and report pages offer none). The server action still pre-checks `deleted_at` and surfaces `deleted_by_author` if the RPC refuses.
- Errors: `deleted_by_author` → "The author deleted this themselves, so it cannot be restored."; `renameUser` maps `account_deleted` to `nickname_account_deleted` → "This account was deleted, so its nickname cannot be changed." The generic `account_deleted` text stays for the other actions.
- Rename was already hidden for deleted accounts (no actions at all); now covered by a test.

**Tests (217):** author filter pass-through and schema, the two new codes, Restore hidden / shown by `deleted_at`, rename hidden for deleted accounts.

**Verified:** typecheck, lint, tests and check:secrets pass. Not tested against live data.

**Left (from the 7d suggestions):** `admin_set_nickname` still does not apply the reserved / flagged-word rules, and the replies a top-level comment removal cascaded still cannot be restored. The other 7d suggestions are unchanged.

## Module 7e.1: keywords page (2026-10-27)

**No migrations.** Moderators and admins manage `public.keywords` directly with the session client (RLS `keywords_staff`); the database still checks the constraints, the unique `(lower(term), match_type)` index and `keywords_validate` (invalid regex).

**Panel:**
- `/keywords` (sidebar entry already existed; `requireStaff` on the page and every action): table of term, match type, category, scope chips, active switch, added date, Edit and Delete (confirm). Sorted by category, then term; loads in one go (up to 1000 rows). URL filters: category, scope (`applies_to` contains), match type, active / inactive, term search (LIKE wildcards escaped). Loading skeleton, "No keywords yet" / "Nothing matches these filters", inline error.
- Add / edit dialog: term, match type, category, scope (at least one), active. One zod schema (`lib/keywords/schemas.ts`) for the form and the Server Actions; created_by is set from `requireStaff()` (validated `getUser()`) on create and never written on update.
- Self-protection (`lib/keywords/safety.ts`, enforced in the actions, including when a keyword is switched on): a regex that matches the empty string or all of "hello", "the", "a", "123", "test post" is refused. Warnings only: a single-character plain term, a whole-word term that starts or ends with a non-word character (it can never match), and patterns the browser cannot check (PostgreSQL-only syntax, or not compilable in JavaScript).
- "Preview (mirrors the database rules)": a sample text for content or a nickname. Content mirrors `_moderation_decision` (word = `\m` + escaped term + `\M`, contains = `strpos(lower, lower)`, regex = `~*`); nicknames mirror `_nickname_flagged` (leet digits, `_` / `.` splitting, broken patterns skipped). Not mirrored exactly, and labelled as such in the UI: PostgreSQL-only regex syntax (`\m`, `\y`, `\b`, `[[:class:]]`, embedded options, `***`) is reported as "cannot preview"; `\w` / `\d` / `\s` may differ for non-English letters; a pattern JavaScript cannot compile is reported, not guessed.
- Categories (7e.1d, after migration `20261027130000_keyword_categories.sql`): added Adult content, Violence, Hate speech and Gambling; the list and labels live only in `lib/keywords/schemas.ts` (types unchanged: `category` is a text column).
- Errors: `keywords_term_key` unique violation → "That term already exists for this match type."; `invalid_regex` → "This regular expression is not valid."; check violations → "Invalid keyword settings."; plus `keyword_matches_everything` and `keyword_term_invalid`.

**Keyword changes are not audited yet** (no log entry for add, edit, switch or delete; needs a migration).

**Tests (254, 37 new in `tests/keywords.test.ts`):** the schema (valid, empty, too long, scope rules), created_by never from the form, the self-protection rules, the preview for every match type in both contexts, the error mapping, the filters → query builder, and the access checks.

**Verified:** typecheck, lint, tests and check:secrets pass. Not tested against live data.

## Module 7e.1b: keywords page on phones (2026-10-27)

**Keywords below md (target 390 px; laid out for 360–430):**
- Stacked cards instead of the table: the term in bold mono, wrapped with `break-all`, then chips for match type, category and scope, the active switch, the date, Edit and Delete. The desktop table is unchanged.
- Filters: the search stays visible; category, scope, match type and state move into a bottom `Sheet` behind a "Filters" button with a count badge, "Clear" (keeps the search) and "Done". From md up the filters sit inline as before. Helpers `activeFilterCount` / `clearSheetFilters` in `lib/keywords/query.ts`.
- Add / edit dialog: full screen on phones (`FULLSCREEN_BELOW_MD`), with a header, a scrolling body (the form and the "Try it" preview), and Cancel / Save in a footer outside the scroll area, clear of the home indicator.
- Delete confirm: a bottom sheet (`ConfirmDialog sheetOnMobile`, opt-in, so the other pages keep the centred dialog).
- Tap targets ≥ 44 px on phones: the switch (44 × 44 tap area, same track), Edit / Delete, Add, Filters, the scope checkboxes and Active, the selects and inputs, and the dialog footer buttons.

**Shared changes:**
- `components/moderation/mobile-dialog.ts`: the small-screen DialogContent class sets.
- `ConfirmDialog` gains an opt-in `sheetOnMobile`.
- `SelectFilter` and `SearchBox`: 44 px tall with 16 px text below md (no iOS zoom on focus), unchanged from md up. `SearchBox` takes an optional `className`.
- Root viewport: `width=device-width, initial-scale=1, interactive-widget=resizes-content` (the Android keyboard shrinks the layout, so dialog footers stay above it). Zoom stays allowed.

**Navigation:** unchanged. It already works on phones: below lg the top bar has a menu button that opens the sidebar as a slide-in sheet (closes on navigation), and Sign out is always in the top bar.

**Forms:** already right. The authenticator code (`/login/verify`, `/security/enroll`, shared `CodeField`) has `inputMode="numeric"`, `autocomplete="one-time-code"`, a 6-digit pattern and text-lg. `/login` has `type="email"` + `autocomplete="username"` and `autocomplete="current-password"`. `Input` / `Textarea` are 16 px below md.

**Audit at 390 px (other pages, not fixed).** Based on reading the components: the panel needs a staff session with TOTP, so it could not be opened in a headless browser here, and no screenshots were taken.
- All pages: default buttons are 32 px tall and `size="lg"` 36 px, below 44 px. The top bar's menu button is 36 px and Sign out 32 px. The "Back" links on detail pages are `size="sm"` (28 px).
- All pages with dialogs (review reject / edit, report remove, content remove / edit / restore, user suspend / ban / role / rename / delete): the shared `DialogContent` is centred with no max height or scrolling. Tall dialogs (Suspend: presets, custom time and a reason; Reject: 6 reasons and a note) can run past the screen, especially with the keyboard open, and the footer buttons become unreachable. They are not bottom sheets.
- Dashboard: tiles are one column on phones (fine); no other issues found.
- Review queue: type filter chips are about 32 px tall. List rows are full-width links (fine).
- Review detail: Approve / Reject / Edit and Previous / Next share one wrapping row, so Previous / Next can drop to a second line on their own. The keyboard-shortcut hint is shown on phones (no keyboard). "Retry approval" is 28 px.
- Reports list: fine (wrapping rows). Report detail: the remove / resolve buttons are 32–36 px; "Retry" is 28 px. The pending-item banner link is text-sized.
- Content list: filters now 44 px (shared fix). Content detail: Remove / Edit / Restore are 36 px; the details aside moves under the text (fine).
- Users list: rows wrap; the counts `dl` does not wrap but is short (fine at 390, tight at 360). Status and role selects now 44 px.
- Users detail: action buttons 32 px; the radio options in Suspend / Change role are about 36 px; Find by email (admins) wraps correctly. Horizontal scroll: none expected anywhere (no tables outside Keywords; long text uses `break-words`).

**Tests (257, 3 new):** `activeFilterCount` and `clearSheetFilters`.

**Verified:** typecheck, lint, tests and check:secrets pass. `next build` and a real-device check were not run. On iOS Safari the keyboard does not resize the dynamic viewport, so the dialog footer may sit under the keyboard there (scrolling the body still works).

## Module 7e.m: mobile pass over the panel pages (2026-10-27)

Layout and dialog behaviour below `md` only (target 390 px, laid out for 360–430 px). No database, action or permission changes. From `md` up the panel looks and behaves as before.

**Shared:**
- `components/ui/button.tsx`: every size is at least 44 px tall below md (`max-md:min-h-11`), icon sizes 44 x 44 (`max-md:min-w-11`). This covers the top bar (menu, Sign out), "Back" links (`size="sm"`), "Retry" / "Retry approval", Load more, the dialog and sheet close buttons, and the dashboard and auth pages too.
- `components/ui/alert.tsx`: below md the alert action (Retry buttons) sits under the text at full width instead of over it.
- `components/moderation/dialogs.tsx`: `ReasonDialog`, `EditDialog` and `ConfirmDialog` share one `DialogForm` frame. Below md it is a bottom sheet: at most 90dvh, the title on top, a scrolling body (description and fields), the buttons in a footer that stays on screen with safe-area padding (stacked full width below sm, side by side from sm). Radix still handles focus, Escape and the close button; the confirm texts are unchanged. This covers Reject / Edit and approve (review), Remove / Edit / Mark handled / Dismiss (reports), Remove / Edit / Restore (content), Suspend / Ban / Restore / Change role / Rename / Delete account (users) and the keyword delete. The opt-in `sheetOnMobile` prop from 7e.1b is gone (every dialog is a sheet now). Reason radio rows are 44 px tall; textareas were already 16 px.
- `components/moderation/mobile-dialog.ts`: the sheet class sets (`SHEET_*`), `TAP_LINK_BELOW_MD`, `ACTION_GRID` (a wrapping set of buttons that fill their row on phones), `ACTION_BAR_BELOW_MD` (actions pinned to the bottom edge) and the matching page padding (`ACTION_BAR_SPACE_ONE_ROW` / `_TWO_ROWS`). The sheet width is `!important` so a dialog's own `sm:max-w-*` cannot narrow it between 640 and 767 px.
- Mobile nav sheet links: 44 px tall.

**Per page:**
- Dashboard: nothing needed beyond the shared button rule.
- Review queue: the type filter chips are 44 px tall. Previews break long words.
- Review detail: Approve, Reject and Edit form a bar pinned to the bottom edge (top border, blurred card background, above the safe area); Edit is labelled "Edit…" there. It is the same set of buttons (from md they are inline again via `md:contents`), so there are no duplicate ids and no double submit. Previous / Next get their own full-width row. The keyboard-shortcut hint is hidden below md and on touch screens (`pointer-coarse`). The page has bottom padding for the bar.
- Reports list: previews break long words. Report detail: Remove, Mark handled, Dismiss and Edit form the pinned bar (two per row); no bar is rendered when there is no action. The pending-item banner link is a 44 px tap target. Both page states have bottom padding for the bar.
- Content list: previews break long words. Content detail: Remove / Edit / Restore wrap and fill their rows at 44 px; the "Deleted by author" note is unchanged. The banner link, the author link and the open-reports link are 44 px tap targets.
- Users list: the counts row wraps (fits at 360 px).
- User detail: the action buttons (both groups) wrap and fill their rows at 44 px; the Suspend preset and Change role radio rows are 44 px tall.
- Overflow: `ContentView` and the user page grid use `grid-cols-1` (`minmax(0, 1fr)`) so long content cannot widen the column; listing titles and detail values break long words. Images already had `max-w-full` / `w-full`.

**Known limits:** on iOS Safari the keyboard does not resize the dynamic viewport, so a sheet's footer or the pinned bar may sit under the keyboard; this needs a real-device check after deploy. Left under 44 px: the "Original text before the edit" disclosure in the moderation history (a text-sized `<summary>`); the native radio and checkbox circles themselves (their whole row is the 44 px target).

**Tests (286, 26 new in `tests/mobile.test.ts`):** the phone-only helpers contain only `max-md:` classes (plus the desktop spacing they keep), every Button size is 44 px below md with unchanged desktop heights, the review and report actions are a single set of buttons with the bar and page padding, the shortcut hint is hidden on touch screens, and all three moderation dialogs use the shared sheet frame. No existing assertion changed.

**Verified:** typecheck, lint, tests, check:secrets and `next build` pass; the built CSS contains the new classes (`pointer-coarse:hidden`, `md:contents`, `max-md:max-w-none!`, the 90dvh sheet). Not checked in a browser: the panel needs a staff session with TOTP.

## Module 7e.2: moderation log, audit log and dashboard links (2026-10-27)

**No migrations.** Uses the live `mod_get_actions`, `admin_get_audit` and `mod_dashboard`.

**/log (moderators and admins):**
- Cards (all widths): action label, actor nickname (links to the user page), Manila time, the target type with an "Open" link to the content or user page, reason, note, and the collapsible "Original text before the edit" (`OriginalBody`, now shared with the moderation history).
- Filters in the URL, ids only: target type (`post`, `comment`, `listing`, `user`, from the `moderation_actions.target_type` check) and staff member (moderators and admins from the existing `mod_search_users`; a former staff member chosen from a link is added to the list). Inline from md, in the Filters bottom sheet on phones. The subject user comes from the new "Open in the moderation log" link on the user page and shows as a removable chip ("About <nickname>").
- Action labels come from the `moderation_actions.action` check (approve, reject, remove, restore, edit, suspend, ban, restore_user, all already labelled); unknown values are shown as stored.
- Keyset "Load more" (30 per page, cursor = created_at + id), loading skeleton, "No actions yet" / "Nothing matches these filters", inline error card.

**/audit (admins only):** cards with Manila time, admin nickname, the action label (Viewed identity, Looked up by email, Changed role, Deleted account; unknown values as stored), the account (links to the user page; "None" for an email lookup without a match), and the stored detail (role change, deletion reason, "No account matched"). No email is shown or stored. Same paging, skeleton, empty and error states; no filters. `admin_get_audit` also returns `view_content_author` entries (the content-author lookups in `identity_audit_log`): labelled "Viewed a content author" with an "Open" link to the content.

**Access:** the pages, the loaders (`fetchLog` → `requireStaff()`, `fetchAudit` → `requireAdmin()`) and the "Load more" actions all check on the server; the RPCs check again. Moderators get the existing /403 redirect on /audit, and the nav entry was already admin-only. The try/catch around the loaders calls `unstable_rethrow`, so a guard redirect is never turned into the error card. URL params and "Load more" input are zod-validated (uuid, enum, ISO timestamp + uuid cursor).

**Nav:** both entries already existed; the "Coming soon" placeholders and `ComingSoon` are removed.

**Dashboard:** links come from `lib/dashboard-links.ts`. Linked: pending posts / comments / listings → review queue by type; reported items and reports in total → reports; new posts / comments / listings (24 h) → content list by type; suspended / banned → users list by status. Plain text (no exact filter exists): new accounts (24 h) and deleted accounts ("Show deleted accounts" adds them to the list rather than showing only them). Note: the suspended count excludes expired suspensions; the users list status filter may still include accounts whose suspension has run out.

**Shared:** `components/moderation/filter-sheet.tsx` (the Keywords Filters sheet, now shared by /keywords and /log), `lib/url-params.ts` (`withoutParams`), `lib/moderation/keyset.ts` (the keyset page helper moved out of the server-only `data.ts`), `lib/moderation/log.ts` (filters, RPC arguments, labels, links).

**Tests (310, 24 new in `tests/log.test.ts`):** filters → `mod_get_actions` arguments, bad URL values, chips and "Clear", the "Load more" schemas, cursor handling, action labels including unknown values, target links, the admin-only guard on the audit page / loader / action (and the staff guard on /log), the rethrow, no email fields, and every dashboard link parsed by the target page's own filter schema (plus the two unlinked tiles).

**Verified:** typecheck, lint, tests, check:secrets and `next build` pass. Not tested against live data or in a browser (the panel needs a staff session with TOTP).

## Module 7e.b: phone back arrow and V2 backlog (2026-10-27)

**No migrations, no change to any action.** Layout and navigation only.

**Back arrow:** below lg the top bar shows a 44 px "Back" arrow next to the menu button on every panel page that is not a sidebar destination (dashboard, review queue, reports, content, users, keywords, log, audit). That covers the review, report, content and user detail pages. Login and TOTP enrolment are outside the panel layout and get none. If the panel has its own history entry behind the current one, the arrow calls `router.back()`, so filters and search in the URL come back exactly. Otherwise it goes to the parent list (`/review`, `/reports`, `/content`, `/users`) or the dashboard. The pure logic lives in `lib/back-nav.ts` (`isMainDestination`, `backFallback` and the tracker), the components in `components/panel/back-nav.tsx`.

**Tracker:** in memory in the panel layout, with no sessionStorage. It starts at zero on every full page load, so a bookmark, a new tab or a refresh always uses the fallback. It counts growth of `history.length` (in-panel pushes) and treats each `popstate` as one step back. A replace, which is how the review and report "next item" flow moves between detail pages, adds nothing. Every miscount undercounts, so `router.back()` never leaves the site. The browser's own back button and Server Action redirects are untouched.

**Other changes:** the detail pages' "Queue / Reports / Content / Users" links are hidden below lg, with desktop unchanged. The review page's "Back to the queue" button on an already-handled item stays, as it is the page's main action. Below sm, "Sign out" is icon-only (its label stays for screen readers) and the nickname truncates, so the arrow fits at 360 px. The menu button is now 44 px up to lg as well.

**Backlog:** `docs/V2_BACKLOG.md` lists mute status, replies removed by the comment cascade, auditing keyword changes, and (optional) nickname rules for admin renames.

**Tests (327, 17 new in `tests/back-nav.test.ts`):** main destinations, the fallback for every detail route, the "next" routes and unknown paths, the tracker (direct open, push, replace, back, forward, a push that truncates history, the floor at zero), and source checks for the wiring and the hidden desktop links.

**Verified:** typecheck, lint, tests and `next build` pass. Not checked in a browser: the panel needs a staff session with TOTP.

## Module 7f.1: UNM logo in the admin panel (2026-10-27)

**No migrations, no behaviour change.** Branding only.

**Source:** `mobile/assets/branding/splash-icon.png`, the tracked, transparent 1024 px seal that `mobile/scripts/make-branding.mjs` generates. The original `mobile/public/unmlogo.png` stays untracked, so the panel builds from the tracked copy and anyone can regenerate it.

**Generated** by `admin/scripts/make-branding.mjs` (`cd admin && npm run branding`, using the sharp that comes with Next.js; no new dependency):
- `admin/components/brand/unm-mark.png`: 108 px, the UI mark, shown at 36 px.
- `admin/app/icon.png`: 512 px, transparent.
- `admin/app/apple-icon.png`: 180 px, the seal on opaque navy `#03224B`.
- `admin/app/favicon.ico`: PNG-in-ICO, 16/32/48 px.

Next's file conventions add the `<link>` tags. The old `app/icon.svg` (a placeholder "U" mark) is removed.

**UI:** `BrandMark` (login, authenticator code and enrolment pages, 403, sidebar, phone menu sheet) shows the seal instead of the placeholder SVG. Its size is unchanged (36 px), the image has width and height set, and it is `aria-hidden` because the name text sits next to it. A faint white ring keeps the seal's navy edge visible on the navy sidebar and in dark mode. The phone top bar has no logo today and is unchanged. The `themeColor` viewport entry already existed and is unchanged.

**Verified:** typecheck, lint, 327 tests and `next build` pass; the build emits `/icon.png`, `/apple-icon.png` and `/favicon.ico`. `next start` serves all three with status 200, and the login page head links them. No new tests (no helper logic).

## Module 7g.1: public website, unm.klasmeyt.com (2026-10-27)

**New app `site/`:** a static Next.js site, separate install like `admin/`, on the same Next 16.4.3, React 19.3.1, TypeScript 6 and Tailwind 4.3.3 versions. It adds no dependency that `admin/` does not already use. It has no database, Supabase, sign-in, cookies, analytics, environment variables or external requests, and every page is prerendered.

**Pages:**
- `/`: description from the PRD, and "coming soon to Google Play" with no store link.
- `/privacy`, `/terms`, `/rules`: the app's `DOCS` text word for word, in `site/content/legal.ts`. A check confirms it is identical; see `site/README.md`.
- `/delete-account`: the in-app steps (Profile tab → Delete account → type the nickname → Delete my account → Delete), what is erased and what stays (checked against `delete_my_account`), and an email request to support@klasmeyt.com with a prefilled subject.
- A not-found page, and a footer on every page.

**SEO:** `metadataBase` `https://unm.klasmeyt.com`; a title, description, canonical URL and Open Graph tags (with the seal) per page; `robots.txt` allows all; `sitemap.xml` lists the five pages. The icons are copies of the admin panel's; theme-color is navy.

**Headers:** CSP (self only, `frame-ancestors 'none'`), nosniff, `strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, and a Permissions-Policy denying the camera, microphone and geolocation. `poweredByHeader` is off. The CSP's `script-src` allows `'unsafe-inline'`: static pages cannot carry a per-request nonce, and Next.js's hydration scripts are inline.

**Docs:** `site/README.md` (running, editing the legal text, keeping it in sync with the app) and `docs/SITE_DEPLOY.md` (Vercel with Root Directory `site`, the GoDaddy CNAME `unm`, how to verify and how to roll back).

**Verified:** typecheck, lint and `next build` pass in `site/` (all routes static). A local `next start` returns 200 for the five pages, `robots.txt`, `sitemap.xml` and the icons, and 404 for a missing page. It sends the headers above, no cookies and no `X-Powered-By`. Not checked in a browser at 360 px.

**Left:**
- Deploy the site and enter `/delete-account` in Play Console.
- Decide a response time for email deletion requests (none is stated anywhere; the page says "as soon as we can").
- The legal texts have no date, so "Last updated: 27 October 2026" is the site's first publication date.
- Replace the app's `FEEDBACK_EMAIL` placeholder.

**Wording (7g.2):** the home page text and its meta and Open Graph descriptions say "members" instead of "UNM students". The legal text is unchanged and still identical to the app.

## Module 7g.3: "members" wording (2026-10-27)

Updated wording: three in-app texts no longer mention the campus (the Buy & Sell notice, the poll question placeholder and the empty Lost & Found message), and the CLAUDE.md and PRD overviews say "members" instead of "UNM students". The legal text is unchanged. The in-app changes are JS only: they reach users with an EAS Update on the matching channel or with the next build.

## Module 7g.5: "Get the app" buttons and the deletion response time (2026-10-27)

**Download buttons:** the home page shows two:
- **Google Play:** Google's official badge, `site/public/badges/google-play-badge.svg`, unmodified. The file was renamed from `.svg.svg`; its contents are unchanged.
- **GitHub:** "Download APK on GitHub" with the official Octicon `mark-github` path, inline in `components/brand/github-mark.tsx`. The path was copied from `@primer/octicons` 19.42.0, and the package was uninstalled again, so there is no new dependency.

The URLs come from `PLAY_STORE_URL` and `APK_RELEASES_URL` in `site/lib/site.ts`. Both are `null` for now. While null, a button is dimmed, is not a link, is `aria-disabled` and has the caption "Coming soon". When set, it becomes a link that opens in a new tab, and the GitHub install note appears. The buttons stack on phones and sit side by side from `sm`. The badge is 56 px tall at its own aspect ratio.

**Deletion response time:** `/delete-account` now says "We process deletion requests within 30 days, usually much sooner."

**Docs:** a "Download links" section in `site/README.md` and `docs/SITE_DEPLOY.md`.

**Verified:** typecheck, lint and `next build` pass, and the legal text is still identical to the app. A local `next start` gives 200 for `/`, `/delete-account` and the badge. The home page shows two "Coming soon" captions and no github.com or play.google.com links, and the headers are unchanged. With test URLs set temporarily (then reverted and rebuilt), both buttons became new-tab links with `noopener noreferrer`, the captions disappeared and the install note appeared.

## Module 8b-2 / 8a: force update in the app, feedback email (2026-10-27)

**Database (8b-1, applied live):** migration `20261027150000_min_app_version.sql` adds `min_app_version`, `update_url` and `update_message` to `app_settings`, with checks; the guard makes them admin-only; and `get_app_requirements()` is readable by guests. Types regenerated with the Supabase CLI; `mobile/` and `admin/` copies identical.

**App (8b-2):**
- `lib/versionGate.ts` (pure): `parseVersion`, `isUpdateRequired` (numeric, fails open), row and cache parsing, `resolveRequirement` (fresh value, else cached, else do not block), `safeUpdateUrl` (https:// only).
- `lib/appRequirements.ts`: the RPC with an 8 s abort; never throws. The last good answer goes to AsyncStorage (`unm-app-requirements`).
- `hooks/useAppRequirements.ts`: `useAppRequirementsSync()` (root layout) applies the cached value at once, then fetches after the session is restored, at launch and on each return to the foreground, at most once per 5 minutes per attempt. `useForceUpdate()` reads `stores/appRequirementStore.ts`.
- `components/layout/ForceUpdateGate.tsx`: a full-screen Modal mounted last in the root layout (above tabs and sheets). Logo, "Update required", message or default text, installed and required versions, "Update now" only for an https:// link. Back is blocked and there is no close control. It follows the theme and safe area, and disappears when a later check is satisfied.
- `lib/config.ts`: `installedVersion()` (app.json `version` via expo-constants); `appVersion()` uses it.

**Feedback email (8a):** `FEEDBACK_EMAIL` is `support@klasmeyt.com` (TODO removed); the Profile fallback sheet shows it. The email field placeholders on the sign-in, sign-up and forgot-password screens are unchanged.

**Docs:** `docs/FORCE_UPDATE.md` (how it works, the SQL to turn it on and off, versions and OTA, testing, the lock-out warning).

**Verified:** typecheck and lint pass in `mobile/` and `admin/`; mobile tests 5 (redact) + 11 (share) + 8 (version) pass; admin 327 tests pass. Not checked on a device.

**JS only:** no native module, no new dependency, app.json `version` unchanged. These changes must be in the first APK build so that build can be forced to update later. An OTA update cannot add the gate to a build that shipped without it.

**Left:** test the screen on a device (high minimum, then back to `'0.0.0'`). CLAUDE.md still lists the `FEEDBACK_EMAIL` placeholder under open TODOs.

## Module 10a: announcements in the admin panel (2026-10-27)

**No database changes.** The page uses `public.announcements` directly through the session client; RLS (`announcements_staff_write`, `announcements_read`) limits writes and the full list to staff.

**Page `/announcements`** (moderators and admins; `requireStaff()` on the page and as the first line of every action; in the sidebar and the phone menu with a megaphone icon):
- Cards, newest first, at most 100 (a note shows when more exist). Each shows a status chip (Scheduled, Live, Ended), the title, the body as plain text with line breaks (clamped to 4 lines with "Show more"), start and end in Manila time, and the author.
- The author comes from the same query, through the `created_by` foreign key (`author:profiles!announcements_created_by_fkey(nickname)`; profiles are readable by everyone). A null author shows "Deleted user".
- Status filter (All, Live, Scheduled, Ended) in the URL, validated with zod (a bad value means All); inline from md, in the Filters sheet on phones. Each status is the same time rule as the read policy.
- A note under the title: announcements appear at the top of the feed for everyone, including guests, until closed or ended.
- Loading skeleton, a load-error state and two empty states (none yet, none for the filter).

**Create and edit** (one dialog, full screen on phones): title and message with live 100 / 1000 counters, Start ("Publish now", "Schedule" with a Manila date-time, and when editing "Keep the current start"), End ("No end date" by default, or a Manila date-time), and a preview of the app card (bold title, body, close icon). Manila input converts to UTC at a fixed +08:00. One shared check (`checkAnnouncement` in `lib/announcements/schemas.ts`) runs in the dialog and in the actions: trimmed non-empty text within the limits, valid dates, end strictly after start, start at most 1 year ahead. "Keep the current start" is checked against the stored start, which the server reads itself.

**Actions:** Edit (updates in place, so the id stays and people who closed a live announcement do not see it again), "End now" (Live only, with a confirm step; sets `ends_at` to now and only matches a row that is still live), Delete (any status, confirm step). Each revalidates the page and shows a toast. `created_by` comes from `requireStaff()` (`getUser()`), never from the form; updates never write it.

**Errors:** `announcementErrorCode` in `lib/errors.ts`: check violations → "Check the dates and the text limits."; permission and RLS errors keep the existing forbidden message; form codes for the title, message, dates, the 1-year limit, end before start, and "not live any more" for End now.

**Tests:** `tests/announcements.test.ts` (25): the form checks, Manila to UTC and back (00:00 and 23:59 edges, nonexistent days), status at the boundaries, the filter to query steps, End now only for Live, created_by never from the form, every action checking staff first, error mapping. The access test now covers the new page. `tests/back-nav.test.ts` pins the sidebar list, so its expected list gained `/announcements`.

**Verified:** typecheck, lint, 353 tests (16 files) and `next build` pass; `check:secrets` finds no service-role reference. Not checked in a browser or against live data.


## Module 10b: announcement card shows only the text, with a close button (2026-10-27)

**No database changes, JS only** (no native module or dependency, app.json version unchanged).

**App:**
- `AnnouncementCard` shows only the body: plain text, line breaks kept, nothing parsed, links not clickable. The "Announcement" label and the card's colours stay; the title line is gone. A close button (X) sits in the top-right corner with a 44 x 44 tap area ("Close announcement"), positioned so the card keeps its height. Closing removes the card with no animation.
- Closed ids are remembered per device in AsyncStorage (`unm-closed-announcements`, a JSON array, newest last, at most 200), for guests and members alike; signing out keeps them. `stores/closedAnnouncementsStore.ts` hides the card at once and writes in the background, so a storage failure still closes it for the session. The card waits until the stored list has been read, so a closed announcement never flashes.
- `lib/announcementPick.ts` (pure): `pickAnnouncement` (the newest live one not closed, by starts_at then created_at, live checked on the device too), `addClosedId` (no duplicates, 200 cap), `parseClosedIds` (missing or malformed data is an empty list). After a close, the next newest live one appears.
- `hooks/useAnnouncement.ts` now fetches up to 20 live rows, ordered by starts_at then created_at, without the title. The device's live check uses the shared minute clock (`useMinuteClock`), so one that ends while the feed is open goes away within a minute without a network call.
- Refresh: pull to refresh on the Feed now also refetches the announcement, and `useRefetchWhenStale` refetches it on tab focus and return to the foreground when older than 5 minutes (the same rule as the other lists). Before this, it refetched only when the Feed mounted with stale data. No polling.
- The persisted cache buster went from 3 to 4 (the announcement rows changed shape), so every phone starts with an empty cache once after updating.

**Panel:** the title field is "Internal title (only staff see this)" with a short note; the 1 to 100 limit is unchanged. The preview shows only the body with the close icon. The list keeps the title as each card's heading, with a note that headings are internal titles. The page note is now "Users see only the text, at the top of the feed, until they close it or it ends." No admin test asserted the old wording, so no test changed.

**Tests:** `tests/announcements.test.mjs` (9, `npm run test:announcements`).

**Verified:** typecheck and lint pass in `mobile/` and `admin/`; mobile tests 5 (redact) + 11 (share) + 8 (version) + 9 (announcements) pass; admin 353 tests (16 files) and `next build` pass. Not checked on a device.

**V2 backlog:** remember closed announcements per account instead of per device.

## Module 8b-4: the UNM seal is the default app logo (2026-10-27)

`AppLogo` (Feed header) showed a chat-bubble icon whenever no logo was uploaded in the panel (`app_settings.logo_path` null). It now shows the bundled seal (`assets/branding/splash-icon.png`) on a white disc with a hairline ring, through a new shared `components/brand/Seal.tsx` that `ForceUpdateGate` also uses (same 104 px look as before). An uploaded logo still takes priority; the seal stays underneath while it loads and comes back if it fails, so there is no gap and no swap when nothing is uploaded. Size, layout and the header's accessibility label are unchanged; the seal is decorative there because the app name sits next to it. The other chat-bubble icons in the app are functional (comment buttons, comment counts, empty states, the comment notification badge) and stay. JS only, no new tests (no pure helper). Verified: typecheck, lint and all mobile tests (5 + 11 + 8 + 9) pass. Not checked on a device.

## Module 11a: first APK published, GitHub download button live (2026-10-28)

The first signed APK is published at github.com/djmirontos/unm-releases (release v1.0.0). `APK_RELEASES_URL` in `site/lib/site.ts` now points to its latest-release page, so the site's "Download APK on GitHub" button is a live link (new tab, `noopener noreferrer`) and the install note shows under it. `PLAY_STORE_URL` stays null: the Google Play badge is still dimmed with "Coming soon". Nothing else on the site changed. Verified: typecheck, lint and `next build` pass; a production start serves `/` with 200, the link, the note, the dimmed badge and unchanged security headers; the legal text check against the app returns true.

## Module 11b: site: child safety standards page; accounts are 18+ (2026-10-28)

**Age.** Accounts are now 18+ only; the parent-or-guardian path is gone. Terms (app `mobile/app/legal/[doc].tsx` and site `site/content/legal.ts`, word for word): "You must be at least 18 years old to create an account or use UNM Freedom Confessions. If we learn that an account belongs to someone under 18, we may remove it." The sign-up checkbox (`TermsCheckbox`) now reads "I am 18 or older and I agree to the Terms of Use and Privacy Policy." Rules gain: "Content that sexualizes minors, or that is used to contact or exploit minors, is strictly prohibited and will be reported to the relevant authorities." The Privacy Policy says nothing about age and is unchanged. `LEGAL_LAST_UPDATED` and the sitemap date are 28 October 2026 (the app shows no date). PRD and CLAUDE.md say 18+. Earlier entries above (8c-fix, 9b) describe the old wording and are left as history.

**Terms acceptance.** Only a timestamp is stored (`user_flags.terms_accepted_at`); there is no Terms version. No migration and no re-acceptance: accounts that accepted the old wording are not asked again.

**Page.** `/child-safety` (https://unm.klasmeyt.com/child-safety), static HTML, text in `site/content/child-safety.ts` (site only, not part of the legal parity check). Sections: commitment, who can use the app (18+), what is prohibited, how to report (in-app ⋯ → Report, or email support@klasmeyt.com), how we respond, reporting to authorities, prevention features, contact. Linked in the footer ("Child safety") and listed in the sitemap; robots unchanged.

**Checked against the code:** Report on posts, comments and listings (`ContentMenu` on post, listing and comment screens; `content_type` enum); reasons (`lib/reports.ts`, no child-safety-specific reason, so the page points to "Inappropriate content"); remove (`mod_review`), suspend and ban (`mod_set_user_status`, panel Users page); suspended or banned accounts cannot self-delete (`delete_my_account`, `account_restricted`); keyword holds on posts, comments and listings (`_moderation_decision`) and refused nicknames (`nickname` scope); blocking hides posts, comments and listings and the person is not told (`useBlockUser`); 3 photos per post or listing, none on polls (`allow_three_images` migration); EXIF stripped (`lib/photos`); no messaging tables or screens; no real name collected (Privacy Policy).

**Verified:** site typecheck, lint and production build pass; `/child-safety` returns 200 with the title, description, canonical URL and unchanged security headers; the sitemap lists it; the footer links it; the legal parity check is true. Mobile typecheck, lint and all tests (5 + 11 + 8 + 9) pass. The site has no test runner, so no site test was added.

**Left:** the app's text changes ship with the next EAS Update. "Reporting to authorities" is a policy statement; there is no in-panel CSAM escalation or evidence-preservation step, and the 30-day purge deletes removed content.

**11b follow-up (2026-10-28):** the Terms sentence no longer says under-18s cannot "use" the app, which clashed with reading without an account. It now reads: "UNM Freedom Confessions is intended for adults. You must be at least 18 years old to create an account. If we learn that an account belongs to someone under 18, we may remove it." (app and site, word for word; the `/child-safety` page did not repeat the old sentence). Three items added to `docs/V2_BACKLOG.md`: CSAM escalation and evidence preservation, a dedicated child safety report reason, and a Terms version with re-acceptance.

## Module 11c: Play URL set on site (2026-10-28)

`PLAY_STORE_URL` in `site/lib/site.ts` is now https://play.google.com/store/apps/details?id=com.unmfreedom.confessions (the package in `mobile/app.json`). The official Google Play badge is a normal link in the same tab (`rel="noopener"`); the "Coming soon" caption and "coming soon to Google Play" line are gone. The GitHub APK button stays and still opens in a new tab (`noopener noreferrer`). `Download` in `get-the-app.tsx` gained a `newTab` flag for that. CSP and headers unchanged; no new requests or scripts. Verified: site typecheck, lint and build; a production start serves both links and no "Coming soon".

## Module 12a: stay signed in (2026-10-29)

**Goal:** a member stays signed in until they tap Log out. No inactivity or session-age limit exists in the app (none was found; none added). The admin panel keeps its own 30-minute idle and 12-hour limits (not touched).

**Audit:** the client already had `persistSession`, `autoRefreshToken`, `detectSessionInUrl: false`, encrypted storage (AES key in SecureStore, ciphertext in AsyncStorage, so the ~2 KB SecureStore limit does not apply) and the AppState start/stop pattern. In React Native, auth-js also starts the refresh ticker at launch. auth-js 2.118 keeps the stored session on network, timeout and 502/503/504 errors, and removes it only when the refresh token is rejected (or `getUser` reports a missing session). `signOut` is called only by Log out (Profile, choose-nickname) and account deletion. The query cache (`unm-query-cache`, buster 4) is separate from the session key.

**Fixed:**
- Offline launch with an expired access token: `getSession()` returns no session, so the app showed a guest until a refresh succeeded. `useAuthBootstrap` now keeps the stored session in that case (`restoreOutcome` in `lib/sessionRules.ts`); auto-refresh sends `TOKEN_REFRESHED` once online. `INITIAL_SESSION` is no longer applied (the launch read covers it), and a later auth event always wins over the launch read.
- `sessionStorage.getItem` removed the session on any error, including a Keystore read that fails for a moment. SecureStore reads now retry (3 tries) and then throw, which leaves the session stored. Only a missing key or a ciphertext that no key opens still counts as no session.
- A crash between writing the new AES key and the new ciphertext (every refresh) left a pair that could not be opened, which signed the person out. `setItem` keeps the previous key (`<key>.prev`), `getItem` falls back to it and repairs the main key, and reads and writes run one at a time.
- A sign-out the person did not ask for (refresh token rejected or revoked) now shows "Please sign in again." (`SESSION_ENDED` in `lib/errors.ts`); Log out and account deletion do not (`isIntentionalSignOut`).
- `storageKey` is passed explicitly with Supabase's default value (`SESSION_STORAGE_KEY`), so no stored session moves and nobody is signed out by this change.

**Tests:** `npm run test:session` (6 tests: retryable vs rejected refresh errors, the launch outcome, forced vs intentional sign-out).

**Verified:** mobile typecheck, lint and all tests (5 + 11 + 8 + 9 + 6) pass. Not checked on a device.

**Left:** Log out while offline fails with the connection message and keeps the session (auth-js only clears it after the server call); decide whether Log out should always clear the device. Plain-text sessions from before encrypted storage (dev builds only, before 9b) are still treated as no session. The Supabase dashboard session settings must be checked by hand.

**12a-2 (2026-10-29): Log out always clears the phone.** Profile and choose-nickname call `logOut()` (`lib/auth.ts`). It makes the person a guest and clears the member caches at once, then removes the stored session directly, and then calls `supabase.auth.signOut({ scope: 'local' })`, which, with nothing stored, makes no request and only resets the client and emits `SIGNED_OUT`. Before the local clear it takes the access token and starts the server revocation in the background with `supabase.auth.admin.signOut(token, 'local')` (the same `/logout?scope=local` request `signOut` makes, sent with the user's own JWT), with a 5-second limit; a failure is only logged in dev. No error is shown and no "Please sign in again". Auth events other than `SIGNED_OUT` are ignored while Log out runs, so a refresh that finishes then cannot sign the person back in. `forgetDeletedAccount` is unchanged. Correction to the "Left" note above: auth-js 2.118 already cleared the phone after a plain network failure, but showed an error, waited for the request, and kept the session when the access token had expired offline. If the access token has expired when the person logs out, the server rejects the revocation (401) and that refresh token lives on until it expires unused. Tests: `npm run test:session` now has 10 (offline, hanging, throwing and successful revocation all end signed out locally). Verified: typecheck, lint and all mobile tests (5 + 11 + 8 + 9 + 10). Not checked on a device.

**Staging (2026-10-29):** staging profile/channel: internal test builds that never receive public OTA updates. `eas.json` profile `staging` is the preview profile (internal APK, `autoIncrement`) on channel `staging`, with the preview environment's EAS variables (`"environment": "preview"`). Same package, version 1.0.0 (runtime 1.0.0) and default EAS keystore as the preview build, so it installs over it. The public GitHub APK (v1.0.0) is a preview build, so anything published to the `preview` channel reaches its users; test OTA updates go to `staging`.

## Module 12b: custom profile pictures (2026-10-29)

**Database** (`supabase/migrations/20261029100000_custom_avatars.sql`, applied by hand in the SQL editor): a custom picture is a special `profiles.avatar_key`, `c_` + 12 hex, with its file at `avatars/<user id>/<key>.jpg` in a new public bucket (JPEG only, 512 KB). No view or RPC changed: every author already carries `avatar_key`. Storage policies allow a member to insert only well-formed names into their own folder while active, at most 5 files, and to read and delete their own folder; staff can read and delete any. A trigger on `profiles` refuses a custom key whose file is missing (`avatar_not_uploaded`), requires an active member for self-changes, and queues the replaced custom file in `storage_cleanup_queue`. `mod_remove_avatar(p_user, p_reason)` lets staff reset a picture to `avatar_01` (logged as `remove_avatar`); **the admin panel button is not built yet**. Types regenerated (mobile and admin, identical).

**App:**
- `lib/avatar.ts` (pure, `npm run test:avatar`, 7 tests): `isCustomAvatarKey`, `avatarFilePath`, `avatarUrl` (public URL from author id + key), `newAvatarKey` (6 random bytes from expo-crypto), `avatarFilesToDelete` (every custom file except the current one; other names untouched).
- `components/profile/Avatar.tsx`: takes `userId` and `nickname`; a custom key with a known id shows the picture through expo-image (disk cache, keyed by URL) over the `avatar_01` preset, which stays if loading fails. The picture is announced as "<nickname>'s profile picture"; presets stay decorative as before. Every call site passes the id: post and listing cards and details (`AuthorLine`, `PostHeader`), comments, notifications (`actor_id`), blocked users, the Profile header. Sizes unchanged.
- Choose an avatar sheet: "Choose from gallery" and "Take a photo" above the presets. `usePhotoPicker(onPicked, 'avatar')`: one photo, the picker's square crop (`allowsEditing: true`, `aspect: [1, 1]`), `quality: 1`, `exif: false`, with avatar wording in the existing permission alerts.
- `lib/photos/avatarPhoto.ts`: decode, scale to at most 512 x 512 (never up), one JPEG encode at 0.9, then 0.85, 0.8, 0.75 from the same bitmap until it is at most 524288 bytes, else `image_too_large`. Upload goes through the shared `uploadJpeg` (`lib/photos/upload.ts`, now also used by `uploadPhoto`): `File.bytes()`, EXIF/XMP/IPTC stripped, `contentType: image/jpeg`, `upsert: false`.
- `hooks/useAvatarPhoto.ts`: process; list the own folder (a network failure stops here, before anything changes); delete every file but the current one; upload under a new key (one retry after a network failure); save the key with the same update as presets (`saveAvatarKey`); on a failed save delete the new file; then set the cached profile, refetch every authored list (`invalidateAuthoredLists`) and delete the replaced picture. Choosing a preset after a custom picture deletes the old file too (`useUpdateAvatar`). File deletes are best effort and logged in dev.
- Profile header: dimmed avatar with a spinner and no taps while saving; "Profile picture updated" toast; errors from `getAvatarErrorMessage` (no connection, banned, suspended, nickname required, photo too large or unreadable, otherwise "Could not update your picture. Please try again.").
- Legal (app and site, word for word, dated 29 October 2026): Rules gain "These rules also apply to your profile picture."; the Privacy bullet on photo location data gains "A profile picture you upload is public, like your nickname."

**Verified:** mobile typecheck, lint and all tests (5 + 11 + 8 + 9 + 10 + 7); admin typecheck with the new types; site typecheck, lint and build; legal parity true. Not checked on a device.

**Deviations / notes:** no connectivity module is installed (adding one would need a new build), so the first request (listing the own folder) is the "no internet" check. The DB queues replaced files but nothing processes the queue yet (V2 backlog). JS only: no new native module, no rebuild.

## Module 12c: public profiles (2026-10-29)

App only: no database change. Tapping a member's avatar or nickname opens `/user/[id]` (`app/user/[id].tsx`, a stack screen like `post/[id]`): their avatar (96 px, same preset fallback), nickname and published posts. Nothing else is shown.

- `lib/profileView.ts` (pure, `npm run test:profile`, 8 tests): `isValidUserId` (UUID route param) and `getProfileViewState` → guest / self / missing / deleted / blocked / ok.
- `components/profile/ProfileLink.tsx`: wraps avatar and/or nickname; `accessibilityRole="link"`, "View <nickname>'s profile", touch area grown to 44 px with `hitSlop` so nothing moves. Guests get the sign-in sheet ("Sign in to see profiles", new `profile` action); your own id opens the Profile tab; a deleted account (null nickname) is not pressable; on a profile page its own posts do not link to the same page again (`CurrentProfileContext`). Used in `AuthorLine` (post and listing cards and details; only the avatar-and-name block, so the rest of the header still opens the card), comments (avatar and name), notifications (actor avatar) and Blocked users (avatar and name). No list of who reacted exists, so none was built.
- Data (`hooks/useUserProfile.ts`, `lib/userPosts.ts`): `profiles` (`id, nickname, avatar_key`, `maybeSingle`), my own `user_blocks` row (`kind = 'block'`), and `feed_posts` filtered by `author_id`, newest first, keyset `(published_at, id)` with 20 per page (the `or()` cursor is quoted and was checked against the live view). Keys `['user-profile', id]`, `['blocked-by-me', me, id]`, `['user-posts', id, me]`; none persisted. `updateListedPosts` also patches `['user-posts']`, so reactions, votes, counts and blocks update there like in the feed; `invalidateAuthoredLists` refetches it; `usePost` paints a post opened from a profile from that cache; `afterBlock` / `afterUnblock` refetch `['blocked-by-me']`.
- Screen states: guest prompt (also on a direct link), your own id replaced by the Profile tab, skeleton while loading, error with Retry, "This profile isn't available" with Back (unknown or invalid id), deleted account (silhouette and "Deleted user", nothing else), blocked ("You blocked this user" with Unblock, no posts), and the posts list with pull to refresh, "No posts yet", load more and "That's everything.". The header has Block (existing confirm flow) except on your own and blocked profiles.

**Verified:** typecheck, lint and all mobile tests (5 + 11 + 8 + 9 + 10 + 7 + 8). Not checked on a device. Site and admin untouched.

**Not included:** listings (Buy & Sell / Lost & Found are the separate `listings` table, read through `get_listings`; a profile section for them would need a filtered query). Reporting a profile is 12c-2 in the V2 backlog.

## Module 12c-1: listings tab on public profiles (2026-10-29)

App only: no database change. The profile page (`app/user/[id].tsx`) has a "Posts | Listings" chip group under the avatar (`ChipGroup`, radio role, 36 px chips with 44 px touch targets). The chosen tab lives only while the screen is open. The Posts tab is unchanged. The Listings tab loads the first time it is opened; after that both lists stay mounted and keep their scroll position. Tabs show only in the normal state (not guest, blocked, deleted, missing or loading).

- `lib/userListings.ts`: `feed_listings` filtered by `author_id` (Buy & Sell and Lost & Found, closed ones included), newest first, keyset `(published_at, id)` with 20 per page, the same quoted `or()` cursor as the posts. `toListingCard` in `lib/listings.ts` is now exported, so rows parse exactly like the Buy & Sell lists.
- Key `['listings', viewer, { author: id }]`: it sits under `['listings', viewer]` with the same page shape, so `updateListedListings` (comment counts, sold / returned, blocks), `findListedListing` (instant listing screen), `invalidateAuthoredLists`, the edit and delete invalidations and the sign-out cleanup all cover it with no new code. It never hides closed listings. Not persisted.
- `useUserListings` (`hooks/useUserProfile.ts`) and `components/profile/UserListings.tsx`: the full `ListingCard` with its comment count (the Lost & Found card, for both kinds), tap opens `listing/[id]`, no author link back to the same profile (`CurrentProfileContext`). Skeletons, "No listings yet", error with Retry, pull to refresh, load more and "That's everything.".

**Verified:** typecheck, lint and all mobile tests (5 + 11 + 8 + 9 + 10 + 7 + 8). The keyset filter was checked live on `feed_posts` in 12c; `feed_listings` returned no rows to a guest, so its paging was not checked live. Not checked on a device. No new pure helper, so no new test. Site and admin untouched.

## Module 12c-2: report a profile and moderator handling (2026-10-29)

**Database** (`20261029130000_report_profiles.sql`, applied by hand in the SQL editor): `content_type` gains `profile`. `report_content('profile', <user id>, …)` refuses your own profile (`own_content`) and deleted accounts or profiles without a nickname (`not_found`); same reasons, daily limit and silent duplicate as other reports. `mod_get_reports` lists reported profiles (title `profile`, no body or images, status `removed` for a deleted account) and returns `avatar_key` as a new last column. Types regenerated; `mobile/types/database.ts` and `admin/types/database.ts` are identical.

**App:**
- The public profile header has Report next to Block (normal state only; 44 px, "Report this profile"). It opens the existing `ReportSheet` with target `profile` and the user's id: same reasons, optional note and success toast; the sheet title reads "Report this profile".
- `getReportErrorMessage(error, target)` in `lib/errors.ts`: for a profile, `own_content` is "You can't report your own profile." and `not_found` is "This profile isn't available."; the daily limit keeps its report wording.
- No mobile code switches on the content type exhaustively, so nothing else changed.

**Admin panel:**
- `lib/review/schemas.ts`: `REPORT_TARGET_TYPES` (content types plus `profile`), `reportTargetSchema`, `reportFilterSchema` and the `isContentType` guard. Content-only loaders (review queue, `mod_list_content`) narrow with the guard; `keysetPage` now leaves out rows its mapper returns null for (the cursor still uses the last raw row). No casts.
- Reports list: profile rows show the Profile label, the picture (custom from the public `avatars` URL, otherwise the panel's initial), the nickname, count, reasons and first/last reported, with no preview text. A "Profiles" filter chip on the reports page.
- `/reports/profile/<id>` (`components/reports/profile-report.tsx`): never calls `mod_get_content`; the account comes from `mod_search_users` (`fetchUser`) and the reports from `mod_get_report_details('profile', id)` (reasons, notes, reporter nicknames). It shows the picture, role and status, a link to the user page for suspend or ban, and the action bar: Remove avatar (custom pictures only, when allowed) and the existing Mark handled / Dismiss reports, then the next reported item.
- Remove avatar (`components/users/remove-avatar.tsx`, `removeAvatar` in `app/(panel)/users/actions.ts`): a confirm dialog with an optional reason (prefilled "Reported: <reasons>" from a report; up to 300 characters), `requireStaff()` then zod then `mod_remove_avatar(user, reason)`, then `refreshPanel()`. Errors: `forbidden` becomes "Only an admin can remove a moderator's or admin's profile picture.", plus `no_custom_avatar`, `account_deleted` and `not_found` (all in `lib/errors.ts`). It does not resolve reports.
- User page: the picture at 96 px, a "Profile picture" fact and the Remove avatar button (`canRemoveAvatar` in `lib/moderation/avatar.ts`: a custom picture, not deleted, and moderators only on regular users, the same rule as the database). The user list shows custom pictures too.
- Moderation log: `remove_avatar` reads "Removed profile picture"; `user` targets already show as "Account" with a link to the user page and the reason.
- Images: the CSP `img-src` already allows the project's Supabase origin, and the panel uses plain `<img>` (no `next/image` remote patterns), so no config change.

**Verified:**
- Mobile: typecheck, lint and all tests (5 + 11 + 8 + 9 + 10 + 7 + 8).
- Admin: typecheck, lint, build and tests (367, including the new `tests/profile-reports.test.ts`). Two source-scan counts changed on purpose: the report page builds its Back link once (1, was 2), and it has three branches that reserve room for the action bar (3, was 2).
- Secret check passed.
- Not checked on a device or against the live panel. Site untouched.

**Deviations / notes:** a profile row in the reports list opens its report page, not the user page directly, because that is where Mark handled and Dismiss live. The report page links to the user page. The removed file is only queued for cleanup; nothing processes the queue yet (V2 backlog).
