# UNM Freedom Confessions: V1 PRD

Oct 21, 2026 · @Daryl John

## Overview

UNM Freedom Confessions becomes a mobile app so UNM students can post under a nickname, react, comment, run polls and trade items, with moderators keeping it safe. V1 is for one school (UNM) and replaces the slow, hard-to-moderate Facebook group workflow.

**Problems with the Facebook group today**

- No search, no trending, no structured polls or listings.
- Moderation depends on admin approval in Facebook, with no keyword hold or audit trail.
- No control over identity, so abuse is hard to trace.

**V1 goals**

- Anyone can read the feed without an account (guest-first).
- Signed-in users can post, comment, react and vote.
- New posts appear on open screens without a manual refresh.
- The app feels fast: cached feed, skeleton loading, optimized images.
- Admins can see who posted, and every identity lookup is logged.

## Access and registration

The app is open to read and needs an account only to take part, Yipster style. The sign-in prompt appears at the moment a guest tries to post, comment, react, vote or share.

| Action | Guest | Signed in |
| --- | --- | --- |
| Read feed, trending, polls, Buy & Sell | Yes | Yes |
| Post, comment, react, vote, share | No (prompt to sign in) | Yes |
| Report, block, mute | No | Yes |

**Registration fields:** email, nickname (unique and permanent), password or Google sign-in. Real name is not collected.

**Email verification (OTP)** is required so the admin identity view points to a real, reachable email.

**Verification code screen**

- One hidden numeric input styled as six rounded boxes, with a light background and dark digits.
- The next box to fill has a navy outline. All borders turn red when the code is wrong or expired.
- Numbers only. Pasting the full code fills all six boxes, and Backspace works normally.
- The user taps "Verify email" after entering all six digits. Nothing is submitted automatically.
- Resend becomes available after a 60-second countdown, matching Supabase's default minimum between code emails.
- Autofill: on iPhone, a code from an email can be suggested above the keyboard. Android generally autofills only text-message codes, so paste is the main path there.

**Terms and Privacy Policy** are accepted at sign-up. They state that admins can see the identity behind a post and that identity lookups are logged.

## App structure

Five bottom tabs. The feed is one list for everything, with no categories.

| Tab | What it holds |
| --- | --- |
| Feed | One feed of confessions, shoutouts and polls, newest first. A pinned announcement card sits on top only when one is active. Bell icon opens notifications. |
| Trending | Most reacted this week and active polls. |
| Create | Confession, Shoutout, Poll, Buy & Sell listing, Lost & Found. |
| Buy & Sell | Listings, with a toggle between Buy & Sell and Lost & Found. |
| Profile | My Posts with status, Notifications, Settings. |

## Feature details

**Feed and numbering.** Newest first. Each published confession and shoutout gets a sequential number (#1234) at publish time, so rejected or held posts leave no gaps. Comments and Facebook shares reference the number.

**Create**

- Confession: text and up to 3 images.
- Shoutout: text, with a target name or section typed by the user, up to 3 images.
- Poll: a question, 2 to 6 choices, and an end date.
- Buy & Sell listing: item, price, condition, up to 3 images, status (available or sold).
- Lost & Found listing: item, place, date, up to 3 images.

**Reactions.** Six reactions: Like, Love, Haha, Wow, Sad, Angry, drawn from a free open-source emoji set (Fluent Emoji, license to be verified before bundling). One reaction per user per post, changeable or removable.

**Comments.** Show the commenter's nickname. Buy & Sell contact is through comments only in V1, with a no-payments disclaimer on every listing.

**Trending.** Score is reactions plus comments times 2 over the last 7 days, with slight time decay. It is cached and refreshed every few minutes.

**Announcements.** Posted by official accounts (admin and mods for now). Shown as a pinned card on top of the Feed only while active.

**Notifications (in app only).** Comment or reaction on your post, approved or rejected posts (with reason), new announcement.

**Share to Facebook.** A Share button creates an image card (number, text, branding) and opens the phone's share sheet. Automatic posting to the Facebook page is out of V1 because it needs Meta app review.

## Identity and privacy

Posts, comments and listings show the author's nickname. Email stays private. Admins can see the email behind every nickname, and every lookup is recorded.

| Content | Shown to other users | Seen by admin |
| --- | --- | --- |
| Confession, shoutout, poll | Nickname | Email and nickname |
| Comment | Nickname | Email and nickname |
| Buy & Sell, Lost & Found listing | Nickname | Email and nickname |

- Each user's email is stored in a private record that only admins can read. The public API returns only the nickname.
- Every admin identity lookup is written to an audit log (who looked, which post, when).
- Image metadata (EXIF, including GPS) is removed before upload.
- Profile photos are preset avatars only, never real photos.
- Nicknames are permanent and shown on every post and comment, so one person's activity can be linked together. Posts are pseudonymous, not anonymous. The team accepted this trade-off.
- Do not claim "untraceable" anywhere in the app. The Terms say admins can see identities.

## Moderation

The default mode is post-moderation: posts appear right away and moderators review them afterward. A keyword filter overrides this. A post that matches a blocked keyword is not published and goes to the moderator queue until approved.

**Flow for every new post**

1. The server checks the text against the keyword list.
2. Match found: the post is held as pending, the author sees "Pending review", and it is not shown in the feed.
3. No match: the post is published and numbered, and appears for everyone.
4. Moderators review held posts (approve, reject with a reason code, or edit out a name) and spot-check published ones.
5. The author gets an in-app notification about approval or rejection.

**Moderation mode.** An admin setting switches between post-moderation (default) and pre-moderation (every post waits for approval). The team can start with one and change later with no code change.

**Roles.** User, Moderator, Admin. At launch: Admin and Moderators, with 3 moderators for now.

**Tools for moderators**

- Moderation queue with reason codes (doxxing, bullying, spam, prohibited item, other).
- Reports inbox for posts reported by users.
- Mute, suspend and ban for users.
- Keyword list management by admin and moderators, starting from a preset list built into the app.

**Buy & Sell rules.** A prohibited-items list (for example alcohol, cigarettes, medicine) is part of the keyword filter. The app does not process payments, and every listing shows a disclaimer.

**Required for store approval.** Report, block and mute are available on every post and comment.

## Performance, realtime, images and security

Speed and data security are the top priorities during development.

**Speed**

- Skeleton loading on feed, trending and detail screens instead of spinners.
- The last feed is cached on the device and shows instantly on open, then updates in the background.
- Keyset pagination on (published\_at, id), not offset. Published time is used so a held post approved later appears at the top of the feed.
- Optimistic updates for reactions and votes.
- Filtering happens on the device, not through new network requests.

**Feed order.** Newest first. Engagement ranking lives only in Trending.

**Realtime**

- New published posts reach open screens without a refresh. If the user is not at the top, a pill ("3 new posts") appears and scrolls to top when tapped. Posts are never inserted under the user's thumb.
- Held and pending posts are never broadcast.
- New posts are signaled through a small feed_events table (one row when a post becomes visible), not by listening to changes on the posts table, so reactions and comments do not generate traffic for every open phone.
- Notifications use a private per-user channel.
- Reaction and comment counts refresh for visible posts about every 30 seconds, and live inside an opened post. They are not broadcast one by one.

**Images**

- Maximum 3 images per post or listing (polls have none).
- Resized on the phone before upload: 1440 px on the long side, quality 0.8, JPEG or WebP.
- EXIF removed; width, height and a blur placeholder stored for stable layout.
- Storage rules limit file size and type on the server, not only in the app.

**Security**

- Row-level security on every table; the author record of posts is admin-only.
- All inputs validated on the server and sanitized.
- Rate limits on posting, commenting and registration.
- No secrets in the app; admin actions go through protected server functions.

## Settings, theme and tech stack

**Settings (under Profile)**

- Edit information (nickname, email).
- Avatar picker with preset avatars. No real photo upload.
- Dark and light mode. Dark uses the LyriaHub theme and light is its opposite.
- Blocked users.
- Logout.
- Terms and Privacy Policy.

**Branding and customization (web panel)**

- App name, logo and tagline are editable by admin and moderators. A placeholder name and logo are used until the final ones are uploaded.
- Moderation mode, keyword list and announcements are managed in the same panel.
- The in-app name and logo update live. The phone's app icon and splash screen are built into the app, so changing those needs a new build.
- Theme: dark uses the LyriaHub theme and light is its opposite.

**Proposed tech stack** (same family as Yipster, separate Supabase project)

- React Native with Expo, TypeScript strict, NativeWind.
- Supabase: Postgres, row-level security, Realtime, Storage, Edge Functions.
- TanStack Query with persisted cache, Zustand for local state.
- expo-image for image display and caching.
- Builds through EAS cloud for the test APK.
- A web panel for admin and moderators (Next.js), mobile friendly, built after the app screens.

## Out of scope and open items

**Not in V1**

- Direct messages.
- Push notifications (in-app only).
- Automatic posting to the Facebook page.
- Multiple schools.
- Payments.
- Real name collection.

**Decisions from the team**

- Listings show the seller's nickname.
- Keyword and prohibited-items list: managed by admin and moderators, starting from a preset list in the app.
- Reaction icons: Fluent Emoji, license to be verified before bundling.
- Moderator tools: web panel, mobile friendly.
- Announcements: admin and moderators only.
- Retention: audit logs and rejected posts are kept for 1 month.

**Next steps after approval**

1. Supabase schema, security rules and moderation flow.
2. Module 1 prompt for Claude Code: project foundation, auth and registration.
3. Feed, create and moderation modules, then a test APK through EAS.
