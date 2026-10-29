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

## Storage cleanup processor

Storage cleanup processor (storage_cleanup_queue has no consumer; avatars/ and post-images/ files of removed content and deleted accounts are not physically deleted yet).

## Remove a profile picture in the admin panel (done in 12c-2)

Done: the reported-profile page and the user page have a Remove avatar button, and the moderation log labels `remove_avatar` "Removed profile picture". Original note: `mod_remove_avatar(p_user, p_reason)` (migration `20261029100000_custom_avatars.sql`) resets a member's custom picture to the default preset, queues the file for cleanup and writes a `remove_avatar` moderation action. The admin panel has no button for it yet. It checks `is_staff()`, so it only works for a signed-in staff account through the API; the SQL editor has no `auth.uid()` and is refused.

## 12c-2: Report a profile (done 2026-10-29)

Done in Module 12c-2 (migration `20261029130000_report_profiles.sql`, app and admin panel); see PROGRESS. Original note: Report profile: needs a new report target type `profile` in the DB, `report_content`, `mod_get_reports` / `mod_get_report_details`, and the admin panel. In the same step: an admin panel button for `mod_remove_avatar` and a label for the `remove_avatar` action in the moderation log. Must be done BEFORE building the preview / Play versions.

## Moderator tool to force a nickname change

Moderator tool to force a nickname change (only admins can rename via admin_set_nickname today).

## 12d: Optional profile details

College/department (pick list), year level, course (pick list), hobbies (fixed list, at most 5) and About me (at most 150 characters). All empty and hidden by default, with a "Show on my profile" switch in Profile settings; visible to signed-in members only. About me blocks links, phone numbers, emails and handles, goes through the keyword filter, can be reported, and moderators can clear it. Add one sentence each to the Privacy Policy and the Rules when built.

## Module 13: badges

Campus Hero, Trusted Seller, Campus Voice, Night Owl, Campus Regular, First Circle, Community Guardian, plus Moderator / Admin labels from the role. Order: 13a badge engine and automatic badges (Regular, Voice, First Circle, Night Owl, staff labels); 13b owner-confirm button and Campus Hero; 13c buyer-confirm button and Trusted Seller; 13d Community Guardian. Server-side only; the Campus Voice threshold lives in `app_settings`; badges are hidden for suspended and banned users. Full details are in the project doc v2-badges-plan.
