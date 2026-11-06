# V2 backlog

Items found during V1 that are out of scope for now. Each needs a PRD decision before it is built.

## Mute status

A user status that blocks posting, commenting and reacting but still allows reading. It has a duration, a reason the user sees in the app, a notification, a moderation log entry, and a panel action next to Suspend and Ban. It becomes the first and lightest consequence, before a suspension or a ban. In V1 the lightest step is a short suspension.

## Replies removed by the comment cascade

When a top-level comment is removed or rejected, `comments_cascade_children` removes its published and pending replies. Restoring the parent does not bring them back, and the cascade writes no moderation log entry. V2 should log the cascade and offer to restore the replies with their parent.

## Audit keyword changes

Adding, editing and deleting keywords is not logged anywhere today: staff write the `keywords` table directly through RLS, and its only trigger validates the input. V2 should record who changed which term, and when, in the moderation or audit log.

## Optional: nickname rules for admin renames

`admin_set_nickname` does not apply the reserved and flagged-word rules (keywords with the `nickname` scope) that `set_nickname` and `change_nickname` enforce. Decide whether an admin rename should be refused, or only warned about, in the same way.

## Remember closed announcements per account

Remember closed announcements per account (sync across devices) instead of per device. In V1 the app keeps the closed ids in AsyncStorage on the phone (guests included, kept after sign-out), so a member who closes an announcement on one phone still sees it on another.

## CSAM escalation and evidence preservation

When a moderator marks content as apparent CSAM, hide it (do not delete it), exempt it from `purge_expired` and storage cleanup, restrict access to admins, and log the escalation, so it can be handed to the authorities. Moderators must never download, screenshot or forward such material. In V1 removed content is purged after 30 days and reporting to the authorities is a manual step.

## Child safety report reason

Add a dedicated "child safety" report reason (the `reports.reason` check, `lib/reports.ts`, the mobile report sheet, and the admin panel filter), with priority in the review queue. In V1 the closest reason is "Inappropriate content".

## Terms version and re-acceptance

Add a `terms_version` column and ask existing users to confirm they are 18 or older on their next launch. In V1 only `user_flags.terms_accepted_at` is stored, so people who accepted the earlier wording are not asked again.

## Storage cleanup processor (done: live 2026-10-30)

Done: the nightly `storage-cleanup` Edge Function (Module 15, runbook `docs/STORAGE_CLEANUP.md`) runs live (`CLEANUP_DRY_RUN` = `false`) after a controlled go-live test; see PROGRESS. Original note: storage_cleanup_queue has no consumer; avatars/ and post-images/ files of removed content and deleted accounts are not physically deleted yet.

## Remove a profile picture in the admin panel (done in 12c-2)

Done: the reported-profile page and the user page have a Remove avatar button, and the moderation log labels `remove_avatar` "Removed profile picture". Original note: `mod_remove_avatar(p_user, p_reason)` (migration `20261029100000_custom_avatars.sql`) resets a member's custom picture to the default preset, queues the file for cleanup and writes a `remove_avatar` moderation action. The admin panel has no button for it yet. It checks `is_staff()`, so it only works for a signed-in staff account through the API; the SQL editor has no `auth.uid()` and is refused.

## 12c-2: Report a profile (done 2026-10-29)

Done in Module 12c-2 (migration `20261029130000_report_profiles.sql`, app and admin panel); see PROGRESS. Original note: Report profile: needs a new report target type `profile` in the DB, `report_content`, `mod_get_reports` / `mod_get_report_details`, and the admin panel. In the same step: an admin panel button for `mod_remove_avatar` and a label for the `remove_avatar` action in the moderation log. Must be done BEFORE building the preview / Play versions.

## Moderator tool to force a nickname change

Moderator tool to force a nickname change (only admins can rename via admin_set_nickname today).

## 12d: Optional profile details (done 2026-10-29)

Done in Module 12d (migration `20261029150000_profile_details.sql`, app, admin panel, legal text); see PROGRESS. Built as free text with a fixed year list instead of pick lists. Original note: College/department (pick list), year level, course (pick list), hobbies (fixed list, at most 5) and About me (at most 150 characters). All empty and hidden by default, with a "Show on my profile" switch in Profile settings; visible to signed-in members only. About me blocks links, phone numbers, emails and handles, goes through the keyword filter, can be reported, and moderators can clear it. Add one sentence each to the Privacy Policy and the Rules when built.

## Review the profile keyword scope

Review the profile keyword scope (44 existing keywords were copied to it) and add the words your community needs.

## Module 13: badges (13a, 13b and 13c done 2026-10-30)

Badges: Campus Hero (13b, done 2026-10-30), Trusted Seller (13c, done 2026-10-30), Community Guardian (13d); admin screen to edit the Campus Voice threshold and to revoke a badge.

- Staff tool to void a fraudulent return and revoke a badge (today: SQL only).
- Purge old declined/cancelled item_returns rows.
- Staff tool to void a fraudulent sale (today: SQL only).
- Purge old declined/cancelled item_sales rows.
- Badge 13d Community Guardian still to do.

Original plan: Campus Hero, Trusted Seller, Campus Voice, Night Owl, Campus Regular, First Circle, Community Guardian, plus Moderator / Admin labels from the role. Order: 13a badge engine and automatic badges (Regular, Voice, First Circle, Night Owl, staff labels); 13b owner-confirm button and Campus Hero; 13c buyer-confirm button and Trusted Seller; 13d Community Guardian. Server-side only; the Campus Voice threshold lives in `app_settings`; badges are hidden for suspended and banned users. Full details are in the project doc v2-badges-plan.

## Supabase Pro plan

Upgrade Supabase to Pro before or soon after launch (daily backups, no pausing, leaked-password protection); until then run a manual `supabase db dump` on a schedule (storage files are not covered).

## Duplicate read policies

Merge the duplicate read policies on announcements and user_flags (advisor warning, minor).

## Push notifications follow-ups

- Reactions push is OFF by default (decision made 2026-10-31). Option to revisit after launch: default on with its own cap (for example 6 per hour) so reactions never use up the 20-per-hour limit for comments, replies, deals and moderation.
- Expo push receipts: dead tokens are only retired by ticket errors, the 60-day expiry, or logout; add a receipts check if undelivered pushes show up.
- Forced sign-out and account deletion done from another path may leave a token on a phone until the next sign-in or the 60-day expiry (deleting an account through the app erases tokens at once).
- Reply and comment-reaction pushes open the Notifications list, not the exact thread; improve if the thread can be resolved from the notification.
- Play Console Data safety form: declare "Device or other IDs" (collected, app functionality, not shared, deletable by logout or account deletion) before the next Play release.
- Two-phone end-to-end push test.
- iOS push needs APNs credentials if iOS is ever built.

## Staff moderation on the phone: follow-ups (v1.0.2)

1. Add an aal2 (TOTP) check to the `admin_*` functions (web-only) in a separate migration.
2. `mod_get_content` returns no `avatar_key`, so authors show the neutral avatar on the moderation detail screens.
3. Two counts can be stale after a staff removal until the next refresh:
   - The comment count on feed cards can be one too high.
   - The total posts on a profile can be out of date.
4. Raise the `useStaff` staleTime (to about 30 minutes) to cut the per-member `is_staff` request.
5. Held-queue paging uses `created_at` only (the same limit as the web panel), so rows with the same timestamp can be skipped or repeated.
6. Push alerts and app versions:
   - A staff member on 1.0.1 gets the alert push, but tapping it does nothing until they update.
   - kenshin and night_owl have no push token until they sign in on a phone.
7. Possible later:
   - Staff alerts for profile reports.
   - Quiet hours for "Moderation alerts".
   - A tool to void a return or sale and revoke the badge.
   - The Community Guardian badge.

## Onboarding follow-ups (v1.0.2)

1. Offline calls come back as a plain object ("TypeError: Network request failed"), so the existing error mapping shows "Something went wrong" instead of the no-connection message on every screen except nickname suggestions. Fix it centrally in `lib/errors.ts`.
2. Banned and suspended members still see the "Get started" card: the app has no account status on the phone.
3. Optional: let Google users without a nickname browse, and ask for the nickname on their first action.
4. Optional migration: delete abandoned profiles with no nickname and no Terms acceptance after about 30 days. This needs privacy wording.
5. The Google sign-in button's visibility was discussed and deliberately left as is. If revisited, follow Google's official button branding: the white or dark variant with the multicolour G, not a custom colour.
6. Measure onboarding with the read-only funnel queries (sign-ups → nickname → first reaction within 1 day) before and after the campaign.
7. Accent colour themes: 6 options, including #7B7FD4, each with a display colour plus a darker shade for filled areas, for contrast. Pending a read-only audit.

## App versions and updates (v1.0.2)

1. Play Console Data safety form: declare app version and platform (app functionality, not shared, deleted with the account) and the email shared with Google for the tester list.
2. Hub row truncation on narrow phones: "N members · M seen in 7 days" next to the long "Not reporting yet" label may truncate. If it appears, show the counts on a second line.
3. The first privacy sentence "We collect your email address, nickname and the content you post." reads like a complete list; it could say "for example".
4. `admin/AGENTS.md` and `mobile/public/` are untracked and unrelated: decide whether to commit or ignore them.

## v1.0.3 follow-ups

1. Kind text for Q&A: the notification and admin RPCs still return the kind ('confession') for Q&A posts, so members read "Your post was approved" and staff see "Post". Returning 'qa' ("Your question was approved", the admin "Q&A" label already exists) is deferred to a later small migration.
2. The dead `Poll #N` branch in `mobile/components/share/ShareCard.tsx` can be deleted (polls never get a number); `test:labels` allow-lists that one line.
3. Members on builds 1.0.1 and 1.0.2 without the update still see `#N` and "Confession".
4. The post detail top bar still says "Post" for Q&A posts.
5. The persisted feed cache buster went 4 -> 5 (Q&A fields), so the first launch after the update shows the feed skeleton once.
6. `ChipGroup` has a `bleed` option, used only on Create, so the six chips scroll to the screen edges instead of being cut at the padding.
7. The Q&A composer placeholder "What do you want to ask?" was not specified and can be changed.
8. Q&A notification wording ("Your question was approved") is still deferred to the database side (see 1).
9. The guest sign-in sheet for an upvote says "Sign in to react"; it should say upvote.
10. The badges test suite fails during the Manila night window (00:00-03:59) because the Nocturnal badge is awarded to its own test users; make it time-independent.
11. Upvotes stay when the voter deletes their account (same as reactions; decided).
12. Answers stay ordered by time; a "Top | Oldest" switch can be added later.
13. The asker's best-answer pick is postponed.
14. Q&A wording in notifications and the admin panel ("Your question was approved", the admin "Q&A" label): decided to skip in 1.0.3. Needs a small migration recreating `get_notifications` and the admin content functions (see 1).
15. Helpful wins are locked at first qualification: an answer that overtakes the winner later does not change it.
16. Helpful needs 3 wins on 3 different Q&A posts; each win needs at least 3 distinct valid upvoters (not the author, not banned or deleted), on a post at least 48 hours old with at least 2 answers.

## Comments bottom sheet follow-ups

1. TalkBack on Android may reach the feed behind the sheet, because `accessibilityViewIsModal` is iOS-only.
2. The sheet cannot close itself when a member is banned or suspended (the phone does not know the status); the server refusal covers it.
3. Live resizing between the two snap heights re-lays out the list, which may stutter on low-end phones; consider a fixed-height sheet with a translate animation.
4. The Android keyboard relies on `softwareKeyboardLayoutMode` "pan"; if that mode ever changes, revisit `keyboardLift` in `lib/commentsSheet.ts`.

## "New listings" banners follow-ups

1. Existing moderation question: published listings of banned or suspended authors remain visible on the dedicated pages and are counted by the banner identically; to be decided separately.
2. The `first_published_at` backfill cannot recover dates already overwritten by an earlier re-approval.
3. A listing published within about 5 seconds of a visit may show once more as new (the 5-second margin is best-effort).
4. Markers are per device and reset on reinstall (accepted).
5. Play Console Data safety: the banner markers stay on the phone and the "since" values sent with each count request are not stored by our database, so nothing new is collected or declared.
6. A count answer computed before a dismiss or a visit commit can finish afterwards and overwrite the optimistic 0, bringing the banner back until the next refetch. Fix idea: discard any answer that was requested with older markers than the current ones and refetch.
7. `fetchListingUpdates` ignores React Query's abort signal: a cancelled fetch still finishes and stores seeds (harmless today, since seeds only move a missing marker forward).
8. Marker comparison relies on `Date.parse` for mark strings with up to six decimals. It worked on the device (a dismissal survived a restart), but an own small parser would remove the engine dependency.
9. During QA the Buy & Sell banner once vanished about 1 second after appearing and did not reproduce. Suspects: an accidental tap on the x, or the feed's `maintainVisibleContentPosition` shifting the scroll when the header grew. Watch for a repeat; if it recurs, check whether the feed was at the very top.
10. The local-pg SQL suites resolve `HERE` to `supabase/tests`, so inside this repo they look for `supabase/tests/tests/00_supabase_stub.sql` and `supabase/tests/migrations/`, which do not exist; they run only from the layout they were written in. Fix all suites together if they should run from the repo.

## Feed views and Chats follow-ups

1. Chats needs its own plan before any build: private messaging in an anonymous campus app (safety, reporting, blocking, moderation, retention, Play UGC policy, privacy text). The tab is only a placeholder.
2. Tapping the Feed tab again does not scroll to the top (no `useScrollToTop`); consider it for the active view.
3. Polls was unused when this change shipped (0 polls had ever been created); if it stays unused, revisit the Polls view.

## Avatar card follow-ups

1. The once-only flag is per phone (accepted): a member who signs up on one phone and first opens Profile on another sees no card, and a reinstall before opening Profile skips it.

## 1:1 chat (stage 2 built; chat_mode stays 'off')

1. Cancel a sent request: not in the database yet (needs a `cancel_chat_request` RPC); the sender only sees "Request sent" until the other side answers.
2. Live updates (stage 3): broadcast signals per member instead of the 20 s / 30 s polls.
3. Push (stage 4): "New message" / "New chat request" pushes with no message text, the `chats` switch and per-chat mute. Open question from the audit: with or without the nickname (CLAUDE.md says nothing personal).
4. Reports and the admin view (stage 5, required before launch): `report_chat` with a message snapshot, an admin "Chat reports" section with warn / suspend / ban, the child-safety reason and the CSAM hold. Report is not in the chat menus yet.
5. Photos (phase 2): private bucket, signed URLs, reports must keep the files.
6. Launch: privacy policy and terms text (app and site, word for word), the delete-account pages, Play Data safety ("Other in-app messages"), and the PRD and CLAUDE.md amendment (remove "Not in V1: DMs"). Then set `chat_mode = 'on'`.
7. "Delete chat for me" hides a chat until the other member writes again; the member who deleted it cannot reopen it from the profile (the server answers `already_chatting`). Needs a small DB change (unhide on request, or return hidden chats to `existingChatAction`).
8. The conversation header's "Online" refreshes on focus only (the list poll does not run while a chat is open).
9. Copy uses React Native's deprecated core `Clipboard` (still in RN 0.86; a dev warning). Move to `expo-clipboard` with the next native build.
10. Device checks still open: the Android keyboard with "pan" on the chat screen, the inverted list's empty state, swipe-to-reply against vertical scrolling and long press inside the gesture.
11. Members download one extra row while chat is off (the `chat_mode` read, at most once a minute and on foreground); it can be folded into another settings read if it matters.
