"use client";

/** The two initials an account shows before anyone uploads a picture. */
export function accountInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

type AccountAvatarProps = {
  fullName: string;
  /** Null while the account still shows its initials. */
  imageUrl: string | null;
  /** Size and colour of the circle, given by whoever places it. */
  className: string;
};

/**
 * One circle, two possible contents: the picture, or the initials.
 *
 * Shared so the sidebar and the settings page can never drift into showing
 * different things for the same account.
 */
export function AccountAvatar({
  fullName,
  imageUrl,
  className,
}: AccountAvatarProps) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={fullName}
        className={`${className} object-cover`}
      />
    );
  }

  return (
    <span aria-hidden="true" className={className}>
      {accountInitials(fullName)}
    </span>
  );
}
