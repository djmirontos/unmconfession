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
