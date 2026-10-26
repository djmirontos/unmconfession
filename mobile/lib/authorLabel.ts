// A null nickname on someone's content means the account was deleted (delete_my_account):
// posts, comments and listings stay, shown under this label with a neutral avatar.
export const DELETED_USER_LABEL = 'Deleted user';

export const isDeletedAuthor = (nickname: string | null | undefined): boolean => !nickname;

/** The name to show for an author or actor. */
export function authorLabel(nickname: string | null | undefined): string {
  return nickname || DELETED_USER_LABEL;
}
