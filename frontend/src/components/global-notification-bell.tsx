"use client";

import { usePathname } from "next/navigation";
import { NotificationBell } from "@/components/account/notification-bell";
import { useAuth } from "@/components/auth/auth-provider";
import { useHasAccountTopBar } from "@/components/account/account-topbar-presence";

// Routes that render MarketingHeader, which embeds a NotificationBell in-flow
// next to its own nav buttons/menu toggle — this fixed overlay would just sit
// on top of that header's buttons instead. Keep in sync with the pages that
// use <MarketingHeader />.
const EXACT_PATHS_WITH_OWN_BELL = new Set(["/"]);
const PATH_PREFIXES_WITH_OWN_BELL = ["/abonamente"];



function hasOwnBell(pathname: string) {
  if (EXACT_PATHS_WITH_OWN_BELL.has(pathname)) return true;

  // Prefix match so plan detail pages (/abonamente/focus) are covered too,
  // without listing every database-driven slug.
  return PATH_PREFIXES_WITH_OWN_BELL.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function GlobalNotificationBell() {
  const pathname = usePathname();
  const { user, isLoading } = useAuth();
  // A phone top bar already shows one, so this overlay is desktop-only
  // wherever that bar is mounted.
  const hasTopBar = useHasAccountTopBar();

  if (isLoading || !user || hasOwnBell(pathname)) return null;

  return (
    <div
      // Marked so a rule in globals.css can take it off screen while a modal
      // is open: it floats above the page at z-100, which is higher than most
      // dialogs, so it used to sit on top of their backdrop blur.
      data-global-bell=""
      className={`fixed right-4 top-4 z-[100] ${
        hasTopBar ? "hidden lg:block" : ""
      }`}
    >
      <NotificationBell />
    </div>
  );
}
