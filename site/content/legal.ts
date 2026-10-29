// The legal texts, copied WORD FOR WORD from the app (mobile/app/legal/[doc].tsx, `DOCS`).
// Do not edit them here alone: change the app and this file together (see site/README.md).

/** No date is stated in the app's texts; this is the date they last changed. */
export const LEGAL_LAST_UPDATED = '29 October 2026';

export const LEGAL = {
  terms: {
    title: 'Terms of Use',
    sections: [
      'Anyone can read UNM Freedom Confessions without an account. UNM Freedom Confessions is intended for adults. You must be at least 18 years old to create an account. If we learn that an account belongs to someone under 18, we may remove it. By creating an account you confirm this. You are responsible for the account you register and for everything that is posted with it.',
      'Posts are shown under your nickname. You can change it once every 30 days; the new name shows on all your old posts and comments. Posts are pseudonymous, not anonymous.',
      'Admins can see the email address behind any nickname to handle abuse. Every such lookup is recorded in an audit log.',
      'Do not post names, phone numbers or other details that identify people without their consent. Bullying, harassment and prohibited items are removed.',
      'Moderators may hold, edit, reject or remove content and may suspend or ban accounts.',
      'Buy & Sell is for listings only. The app does not handle payments; deal at your own risk.',
      'You can delete your account at any time in Profile → Delete account.',
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    sections: [
      'We collect your email address, nickname and the content you post. We do not collect your real name.',
      'If you sign in with Google, Google shares your email address with us, and also your name and profile photo, which we do not use or show in the app. We keep only your email address for your account.',
      'Your email is never shown to other users. Only admins can view it, and each view is logged.',
      'Photo location data (EXIF) is removed before upload. A profile picture you upload is public, like your nickname.',
      'Optional profile details you add (college, course, year level, hobbies and a short bio) are visible only to signed-in members, and only while you keep them switched on.',
      'Audit logs and rejected posts are kept for 30 days, then deleted.',
      'You can delete your own posts, comments and listings at any time, and you can delete your account yourself in Profile → Delete account.',
      'Deleting your account: you can do it yourself in Profile → Delete account. Your sign-in, email, nickname, avatar, blocked users, notification settings and notifications are erased. Your posts, comments, reactions, poll votes and listings stay on the app, no longer linked to you, and are shown as "Deleted user". Your open listings are closed. Reports you filed stay with the moderators. This cannot be undone.',
    ],
  },
  rules: {
    title: 'Community rules',
    sections: [
      'Be respectful. Disagree with ideas, not with people.',
      'No hate speech, harassment, bullying or threats.',
      "Don't share other people's personal information: names together with phone numbers, addresses, ID numbers, or photos of private people.",
      'No spam, scams or advertising. Selling belongs in Buy & Sell only.',
      'Listings must not offer prohibited items such as weapons, drugs, alcohol, stolen goods or counterfeit items.',
      "Don't pretend to be a moderator, staff member or another person.",
      'No sexually explicit or violent content.',
      'Content that sexualizes minors, or that is used to contact or exploit minors, is strictly prohibited and will be reported to the relevant authorities.',
      'These rules also apply to your profile picture.',
      'These rules also apply to your profile details.',
      'See something wrong? Use the Report button and a moderator will look at it.',
      'Moderators may remove content, hold posts for review, and suspend or ban accounts that break these rules.',
      'Nothing in the app is a payment or a guarantee. Deals are between the users involved.',
    ],
  },
} as const;

export type LegalDoc = keyof typeof LEGAL;
