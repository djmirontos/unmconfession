// Child Safety Standards (Google Play CSAE requirement). Site-only: not mirrored in the app.
// Every feature named here was checked against the code; see the Module 11b entry in docs/PROGRESS.md.
// If reporting, moderation, blocking or photo limits change, update this text.

import { SUPPORT_EMAIL } from '@/lib/site';

export const CHILD_SAFETY_LAST_UPDATED = '28 October 2026';

export type ChildSafetySection = {
  id: string;
  heading: string;
  paragraphs: readonly string[];
  list?: readonly string[];
};

export const CHILD_SAFETY = {
  title: 'Child Safety Standards',
  sections: [
    {
      id: 'commitment',
      heading: 'Our commitment',
      paragraphs: [
        'UNM Freedom Confessions has zero tolerance for child sexual abuse and exploitation (CSAE) and for child sexual abuse material (CSAM). This content is never allowed in the app, and we act on every report of it.',
      ],
    },
    {
      id: 'who',
      heading: 'Who can use the app',
      paragraphs: [
        'UNM Freedom Confessions is for adults only. Users must be 18 or older. Everyone confirms this when they create an account. If we learn that an account belongs to someone under 18, we may remove it.',
      ],
    },
    {
      id: 'prohibited',
      heading: 'What is prohibited',
      paragraphs: ['The following are strictly prohibited:'],
      list: [
        'Any sexual content involving minors, including child sexual abuse material.',
        'Content that sexualizes minors.',
        'Grooming: building trust with a minor in order to abuse or exploit them.',
        'Sharing or requesting images of minors in a sexual context.',
        'Using posts, comments or listings to contact minors for sexual purposes, or to exploit them in any other way.',
      ],
    },
    {
      id: 'report',
      heading: 'How to report',
      paragraphs: ['If you see anything that may harm a child, report it straight away.'],
      list: [
        'In the app: open the post, comment or listing, tap the ⋯ menu and choose Report. Pick a reason, such as Inappropriate content, and add a note if you like. Reporting needs a signed-in account.',
        `By email: write to ${SUPPORT_EMAIL} with the nickname and a description of the content or where to find it. You do not need an account. Please do not send or forward the images themselves.`,
      ],
    },
    {
      id: 'response',
      heading: 'How we respond',
      paragraphs: [],
      list: [
        'Moderators review every report.',
        'Content that breaks these standards is removed.',
        'Accounts that break them can be suspended or banned. A suspended or banned account cannot be deleted by its owner to escape the restriction.',
        'Posts, comments and listings that contain flagged words are held, and a moderator reviews them before they appear.',
        'Nicknames that contain flagged words are refused.',
      ],
    },
    {
      id: 'authorities',
      heading: 'Reporting to authorities',
      paragraphs: ['When we find apparent child sexual abuse material, we report it to the relevant authorities as required by law.'],
    },
    {
      id: 'prevention',
      heading: 'Prevention features',
      paragraphs: [],
      list: [
        'Nickname-only profiles: we do not collect real names, and other users never see your email address.',
        'No private messaging: the app has no direct messages. Posts, comments and listings are visible to everyone and to our moderators.',
        'At most 3 photos per post or listing, and none on polls. Photo location data (EXIF) is removed before upload.',
        'Block: hide a person’s posts, comments and listings from you. They are not told.',
        'Report: available on every post, comment and listing.',
      ],
    },
    {
      id: 'contact',
      heading: 'Contact for child safety matters',
      paragraphs: [`For anything about child safety, email ${SUPPORT_EMAIL}.`],
    },
  ] satisfies readonly ChildSafetySection[],
} as const;
