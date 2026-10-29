// The app's preset avatars are native (icons and emoji); the panel shows a neutral initial instead.
// A member's own picture (`src`, from the public avatars bucket) is shown as a plain <img>.
export function UserAvatar({
  nickname,
  src = null,
  size = 'md',
}: {
  nickname: string | null;
  src?: string | null;
  size?: 'md' | 'lg' | 'xl';
}) {
  const box = size === 'xl' ? 'size-24 text-3xl' : size === 'lg' ? 'size-14 text-xl' : 'size-9 text-sm';
  const px = size === 'xl' ? 96 : size === 'lg' ? 56 : 36;
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" aria-hidden="true" width={px} height={px} className={`shrink-0 rounded-full bg-secondary object-cover ${box}`} />
    );
  }
  const initial = nickname ? nickname.charAt(0).toUpperCase() : '?';
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-secondary font-semibold text-secondary-foreground ${box}`}
    >
      {initial}
    </span>
  );
}
