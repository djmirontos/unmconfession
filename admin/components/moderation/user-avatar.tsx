// The app's avatar set is native (icons and emoji); the panel shows a neutral initial instead.
export function UserAvatar({ nickname, size = 'md' }: { nickname: string | null; size?: 'md' | 'lg' }) {
  const initial = nickname ? nickname.charAt(0).toUpperCase() : '?';
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-secondary font-semibold text-secondary-foreground ${size === 'lg' ? 'size-14 text-xl' : 'size-9 text-sm'}`}
    >
      {initial}
    </span>
  );
}
