// Which account actions the panel offers. Mirrors the database rules (mod_set_user_status,
// admin_set_role, admin_set_nickname, admin_delete_account); the database still decides.

export type Viewer = { id: string; isAdmin: boolean };

export type TargetUser = {
  id: string;
  role: 'user' | 'moderator' | 'admin';
  status: 'active' | 'suspended' | 'banned';
  suspendedUntil: string | null;
  deleted: boolean;
};

export type UserActions = {
  suspend: boolean;
  ban: boolean;
  restore: boolean;
  changeRole: boolean;
  rename: boolean;
  revealIdentity: boolean;
  deleteAccount: boolean;
};

const NONE: UserActions = {
  suspend: false,
  ban: false,
  restore: false,
  changeRole: false,
  rename: false,
  revealIdentity: false,
  deleteAccount: false,
};

/** A suspension still in force (no end date counts as in force). */
export function isActivelySuspended(status: TargetUser['status'], until: string | null, now: number): boolean {
  return status === 'suspended' && (until === null || new Date(until).getTime() > now);
}

export function userActions(viewer: Viewer, target: TargetUser, now = Date.now()): UserActions {
  if (target.deleted) return NONE;
  const self = viewer.id === target.id;

  // Status changes: never yourself, never an admin; moderators only act on regular users.
  const canSetStatus = !self && target.role !== 'admin' && (target.role === 'user' || viewer.isAdmin);
  const restricted = target.status === 'banned' || isActivelySuspended(target.status, target.suspendedUntil, now);

  return {
    suspend: canSetStatus && target.status !== 'banned',
    ban: canSetStatus && target.status !== 'banned',
    restore: canSetStatus && target.status !== 'active',
    changeRole: viewer.isAdmin && !self,
    rename: viewer.isAdmin,
    revealIdentity: viewer.isAdmin,
    deleteAccount: viewer.isAdmin && !self && target.role !== 'admin' && restricted,
  };
}
