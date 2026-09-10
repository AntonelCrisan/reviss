"use client";

import { useTranslations } from "next-intl";
import { useOpenCloseTransition } from "@/components/use-open-close-transition";
import { AccountMobileTopBar } from "@/components/account/account-mobile-top-bar";
import Link from "next/link";
import { AccountShellSkeleton } from "@/components/account/account-page-skeletons";
import { usePathname, useRouter } from "next/navigation";
import { type MouseEvent, type ReactNode, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { BrandLogo } from "@/components/brand-logo";
import {
  ACCOUNT_SIDEBAR_COLLAPSED_STORAGE_KEY,
  AccountSidebarTooltip,
  getAccountSidebarActionClass,
  getAccountSidebarActionLabelClass,
  getAccountSidebarChevronClass,
  getAccountSidebarChildItemClass,
  getAccountSidebarHeaderClass,
  getAccountSidebarItemClass,
  getAccountSidebarLabelClass,
  getAccountSidebarScrollClass,
  getAccountSidebarShellClass,
} from "@/components/account/account-sidebar-ui";

type AccountPageId =
  | "dashboard"
  | "settings"
  | "upgrade"
  | "billing-invoices"
  | "admin-settings";
type SettingsSectionId =
  | "account"
  | "study"
  | "appearance"
  | "colors"
  | "notifications"
  | "security"
  | "privacy";
type SidebarGroupId = "settings" | "billing";

const settingsSectionChangeEvent = "revizzio:settings-section-change";
const settingsPagePath = "/settings";

type AccountStaticShellProps = {
  activePage: AccountPageId;
  children: ReactNode;
  /** Drawn while the session resolves, shaped like this page. */
  loadingBody?: ReactNode;
  settingsSection?: SettingsSectionId;
  onSettingsSectionChange?: (section: SettingsSectionId) => void;
};

type ShellTranslator = ReturnType<typeof useTranslations<"accountShell">>;
type ShellKey = Parameters<ShellTranslator>[0];

type NavigationItem = {
  href: string;
  labelKey: ShellKey;
  page: AccountPageId;
  adminOnly?: boolean;
};

const navigationItems = [
  { href: "/myaccount", labelKey: "acasa", page: "dashboard" },
] satisfies NavigationItem[];

const adminNavigationItem = {
  href: "/admin/settings",
  labelKey: "setariAdmin",
  page: "admin-settings",
} satisfies NavigationItem;

const settingsItems = [
  { href: "/settings#account", labelKey: "cont", section: "account" },
  { href: "/settings#study", labelKey: "studiu", section: "study" },
  { href: "/settings#appearance", labelKey: "aspect", section: "appearance" },
  { href: "/settings#colors", labelKey: "culori", section: "colors" },
  {
    href: "/settings#notifications",
    labelKey: "notificari",
    section: "notifications",
  },
  { href: "/settings#security", labelKey: "securitate", section: "security" },
  { href: "/settings#privacy", labelKey: "date", section: "privacy" },
] satisfies Array<{
  href: string;
  labelKey: ShellKey;
  section: SettingsSectionId;
}>;

const billingItems = [
  { href: "/upgrade", labelKey: "planuri", page: "upgrade" },
  { href: "/upgrade/facturi", labelKey: "facturi", page: "billing-invoices" },
] satisfies NavigationItem[];

function isSettingsSection(value: string): value is SettingsSectionId {
  return settingsItems.some((item) => item.section === value);
}

function Icon({
  children,
  className = "h-4 w-4",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      {children}
    </svg>
  );
}

function Logo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <>
      <span className={collapsed ? "hidden lg:inline-flex" : "hidden"}>
        <BrandLogo
          href="/"
          variant="mark"
          className="text-content transition hover:text-action"
          logoClassName="h-8 w-8"
        />
      </span>
      <span className={collapsed ? "lg:hidden" : ""}>
        <BrandLogo
          href="/"
          className="text-content transition hover:text-action"
          logoClassName="h-7 w-28"
        />
      </span>
    </>
  );
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "EQ"
  );
}

function isAdminRole(role: string | undefined) {
  return role?.trim().toLowerCase() === "admin";
}

function PageIcon({ page }: { page: AccountPageId }) {
  return (
    <Icon className="h-[18px] w-[18px]">
      {page === "dashboard" ? (
        <>
          <path d="M3 11l9-8 9 8" />
          <path d="M5 10v10h14V10" />
        </>
      ) : null}
      {page === "settings" ? (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6l-.08.08a2 2 0 1 1-2.83-2.83l.08-.08A1.7 1.7 0 0 0 10.6 15a1.7 1.7 0 0 0-1.88-.34l-.1.04a2 2 0 1 1-1.53-3.7l.1-.04A1.7 1.7 0 0 0 7.8 9a1.7 1.7 0 0 0-.6-1l-.08-.08a2 2 0 1 1 2.83-2.83l.08.08A1.7 1.7 0 0 0 12 4.6a1.7 1.7 0 0 0 1-.6l.08-.08a2 2 0 1 1 2.83 2.83l-.08.08A1.7 1.7 0 0 0 16.4 9a1.7 1.7 0 0 0 1.88.34l.1-.04a2 2 0 1 1 1.53 3.7l-.1.04A1.7 1.7 0 0 0 19.4 15z" />
        </>
      ) : null}
      {page === "admin-settings" ? (
        <>
          <path d="M12 3 20 6v6c0 5-3.4 8.5-8 9-4.6-.5-8-4-8-9V6l8-3z" />
          <path d="M9 12l2 2 4-4" />
        </>
      ) : null}
    </Icon>
  );
}

function primaryNavClass(isActive: boolean, isCollapsed = false) {
  return getAccountSidebarItemClass(isActive, isCollapsed);
}

function secondaryNavClass(isActive: boolean) {
  return getAccountSidebarChildItemClass(isActive);
}

export function AccountStaticShell({
  activePage,
  children,
  loadingBody,
  settingsSection,
  onSettingsSectionChange,
}: AccountStaticShellProps) {
  const t = useTranslations("accountShell");
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading, logout } = useAuth();
  const [openNavGroup, setOpenNavGroup] = useState<SidebarGroupId | null>(() => {
    if (activePage === "settings") return "settings";
    if (activePage === "upgrade" || activePage === "billing-invoices") {
      return "billing";
    }
    return null;
  });
  const [activeSettingsSection, setActiveSettingsSection] =
    useState<SettingsSectionId>("account");
  const visibleSettingsSection = settingsSection ?? activeSettingsSection;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isMounted: isBackdropMounted, isVisible: isBackdropVisible } =
    useOpenCloseTransition(sidebarOpen, 300);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    () =>
      typeof window !== "undefined" &&
      window.localStorage.getItem(ACCOUNT_SIDEBAR_COLLAPSED_STORAGE_KEY) ===
        "true",
  );
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, router, user]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSidebarOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    function syncSettingsSection() {
      const nextSection = window.location.hash.replace("#", "");
      setActiveSettingsSection(
        isSettingsSection(nextSection) ? nextSection : "account",
      );
    }

    function syncSettingsSectionFromEvent(event: Event) {
      if (!(event instanceof CustomEvent)) return;
      const nextSection = event.detail;
      if (typeof nextSection !== "string" || !isSettingsSection(nextSection)) {
        return;
      }
      setActiveSettingsSection(nextSection);
    }

    const frame = window.requestAnimationFrame(syncSettingsSection);
    window.addEventListener("hashchange", syncSettingsSection);
    window.addEventListener("popstate", syncSettingsSection);
    window.addEventListener(
      settingsSectionChangeEvent,
      syncSettingsSectionFromEvent,
    );
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", syncSettingsSection);
      window.removeEventListener("popstate", syncSettingsSection);
      window.removeEventListener(
        settingsSectionChangeEvent,
        syncSettingsSectionFromEvent,
      );
    };
  }, []);

  function handleSettingsItemClick(
    event: MouseEvent<HTMLAnchorElement>,
    section: SettingsSectionId,
  ) {
    // Only the settings page itself switches section in place. The pages
    // under it (/settings/schimba-numele and friends) share this shell with
    // activePage="settings" so the sidebar highlights correctly, but they have
    // no section to switch to -- there the link has to navigate.
    if (pathname !== settingsPagePath) return;

    event.preventDefault();
    setActiveSettingsSection(section);
    onSettingsSectionChange?.(section);
    setSidebarOpen(false);
    // Update the hash directly instead of router.push: pushing the same route
    // can remount the page and reset the freshly selected section back to the
    // default. pushState keeps one history entry per section so Back works,
    // and the popstate listener re-syncs the tab.
    if (window.location.hash !== `#${section}`) {
      window.history.pushState(null, "", `#${section}`);
    }
    window.dispatchEvent(
      new CustomEvent(settingsSectionChangeEvent, { detail: section }),
    );
  }

  function toggleSidebarCollapsed() {
    setIsSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(
        ACCOUNT_SIDEBAR_COLLAPSED_STORAGE_KEY,
        String(next),
      );
      return next;
    });
  }

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await logout();
      router.replace("/");
    } finally {
      setIsLoggingOut(false);
    }
  }

  if (isLoading || !user) {
    return <AccountShellSkeleton body={loadingBody} />;
  }

  return (
    <div className="min-h-svh bg-app text-content lg:flex">
      {isBackdropMounted ? (
        <button
          type="button"
          aria-label={t("inchideMeniul")}
          onClick={() => setSidebarOpen(false)}
          // Fades with the drawer instead of snapping in and out.
          className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 lg:hidden ${
            isBackdropVisible ? "opacity-100" : "opacity-0"
          }`}
        />
      ) : null}

      <aside
        className={getAccountSidebarShellClass(sidebarOpen, isSidebarCollapsed)}
        aria-label={t("meniuPrincipal")}
      >
        <div className={getAccountSidebarHeaderClass(isSidebarCollapsed)}>
          <Logo collapsed={isSidebarCollapsed} />
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="flex h-10 w-10 items-center justify-center rounded-md text-muted transition hover:bg-surface-hover hover:text-content lg:hidden"
            aria-label={t("inchideMeniul")}
          >
            <Icon className="h-5 w-5">
              <path d="M18 6 6 18M6 6l12 12" />
            </Icon>
          </button>
          <button
            type="button"
            onClick={toggleSidebarCollapsed}
            className="hidden h-9 w-9 items-center justify-center rounded-md text-muted transition hover:bg-action-soft hover:text-content lg:flex"
            aria-label={isSidebarCollapsed ? t("extindeMeniul") : t("restrangeMeniul")}
            title={isSidebarCollapsed ? t("extindeMeniul") : t("restrangeMeniul")}
          >
            <Icon className="h-4 w-4">
              {isSidebarCollapsed ? (
                <path d="M13 5l7 7-7 7M20 12H4" />
              ) : (
                <path d="M11 19l-7-7 7-7M4 12h16" />
              )}
            </Icon>
          </button>
        </div>

        <div className={getAccountSidebarScrollClass(isSidebarCollapsed)}>
          <Link
            href="/myaccount"
            onClick={() => setSidebarOpen(false)}
            className={getAccountSidebarActionClass(isSidebarCollapsed)}
          >
            <Icon>
              <path d="M12 5v14M5 12h14" />
            </Icon>
            <span className={getAccountSidebarActionLabelClass(isSidebarCollapsed)}>
              {t("proiectNou")}
            </span>
            <AccountSidebarTooltip enabled={isSidebarCollapsed}>
              {t("proiectNou")}
            </AccountSidebarTooltip>
          </Link>

          <nav className="space-y-1">
            {navigationItems.map((item) => {
              const isActive = item.page === activePage;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={primaryNavClass(isActive, isSidebarCollapsed)}
                >
                  <PageIcon page={item.page} />
                  <span className={getAccountSidebarLabelClass(isSidebarCollapsed)}>
                    {t(item.labelKey)}
                  </span>
                  <AccountSidebarTooltip enabled={isSidebarCollapsed}>
                    {t(item.labelKey)}
                  </AccountSidebarTooltip>
                </Link>
              );
            })}

            <div className="pt-1">
              <button
                type="button"
                onClick={() =>
                  setOpenNavGroup((currentGroup) =>
                    currentGroup === "settings" ? null : "settings",
                  )
                }
                className={primaryNavClass(
                  activePage === "settings",
                  isSidebarCollapsed,
                )}
                aria-expanded={openNavGroup === "settings"}
              >
                <PageIcon page="settings" />
                <span className={getAccountSidebarLabelClass(isSidebarCollapsed)}>
                  {t("setari")}
                </span>
                <Icon
                  className={getAccountSidebarChevronClass(
                    openNavGroup === "settings",
                    isSidebarCollapsed,
                  )}
                >
                  <path d="M9 18l6-6-6-6" />
                </Icon>
                <AccountSidebarTooltip enabled={isSidebarCollapsed}>
                  {t("setari")}
                </AccountSidebarTooltip>
              </button>

              <div
                className={`ml-5 mr-1 overflow-hidden transition-[max-height,opacity] duration-300 ${
                  isSidebarCollapsed ? "lg:hidden" : ""
                } ${
                  openNavGroup === "settings"
                    ? "max-h-80 opacity-100"
                    : "max-h-0 opacity-0"
                }`}
              >
                <div className="mt-2 space-y-1">
                  {settingsItems.map((item) => {
                    const isActive =
                      activePage === "settings" &&
                      item.section === visibleSettingsSection;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={(event) =>
                          handleSettingsItemClick(event, item.section)
                        }
                        className={secondaryNavClass(isActive)}
                      >
                        {t(item.labelKey)}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>

            {isAdminRole(user.role) ? (
              <Link
                href={adminNavigationItem.href}
                onClick={() => setSidebarOpen(false)}
                className={primaryNavClass(
                  activePage === adminNavigationItem.page,
                  isSidebarCollapsed,
                )}
              >
                <PageIcon page={adminNavigationItem.page} />
                <span className={getAccountSidebarLabelClass(isSidebarCollapsed)}>
                  {t(adminNavigationItem.labelKey)}
                </span>
                <AccountSidebarTooltip enabled={isSidebarCollapsed}>
                  {t(adminNavigationItem.labelKey)}
                </AccountSidebarTooltip>
              </Link>
            ) : null}

            <div className="pt-1">
              <button
                type="button"
                onClick={() =>
                  setOpenNavGroup((currentGroup) =>
                    currentGroup === "billing" ? null : "billing",
                  )
                }
                className={primaryNavClass(
                  activePage === "upgrade" ||
                    activePage === "billing-invoices",
                  isSidebarCollapsed,
                )}
                aria-expanded={openNavGroup === "billing"}
              >
                <Icon className="h-[18px] w-[18px]">
                  <path d="M12 3l3.2 6.5 7.1 1-5.1 5 1.2 7-6.4-3.4-6.4 3.4 1.2-7-5.1-5 7.1-1L12 3z" />
                </Icon>
                <span className={getAccountSidebarLabelClass(isSidebarCollapsed)}>
                  {t("abonament")}
                </span>
                <Icon
                  className={getAccountSidebarChevronClass(
                    openNavGroup === "billing",
                    isSidebarCollapsed,
                  )}
                >
                  <path d="M9 18l6-6-6-6" />
                </Icon>
                <AccountSidebarTooltip enabled={isSidebarCollapsed}>
                  {t("abonament")}
                </AccountSidebarTooltip>
              </button>
              <div
                className={`ml-5 mr-1 overflow-hidden transition-[max-height,opacity] duration-300 ${
                  isSidebarCollapsed ? "lg:hidden" : ""
                } ${
                  openNavGroup === "billing"
                    ? "max-h-32 opacity-100"
                    : "max-h-0 opacity-0"
                }`}
              >
                <div className="mt-2 space-y-1">
                  {billingItems.map((item) => {
                    const isActive = item.page === activePage;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setSidebarOpen(false)}
                        className={secondaryNavClass(isActive)}
                      >
                        {t(item.labelKey)}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </nav>
        </div>

        <div className="shrink-0 border-t border-subtle p-3">
          <div
            className={`flex items-center gap-3 rounded-md px-2 py-2 ${
              isSidebarCollapsed ? "lg:justify-center lg:gap-0 lg:px-0" : ""
            }`}
          >
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-subtle bg-success-soft text-xs font-bold text-success ${
                isSidebarCollapsed ? "lg:hidden" : ""
              }`}
            >
              {initials(user.full_name)}
            </span>
            <span className={getAccountSidebarLabelClass(isSidebarCollapsed)}>
              <span className="block truncate text-sm font-semibold text-content">
                {user.full_name}
              </span>
              <span className="block truncate text-xs text-muted">
                {user.email}
              </span>
            </span>
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className={`group/sidebar-item relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-action-soft hover:text-content disabled:cursor-wait disabled:opacity-60 ${
                isSidebarCollapsed ? "lg:h-10 lg:w-10" : ""
              }`}
              aria-label={t("iesiDinCont")}
            >
              <Icon>
                <path d="M10 17l5-5-5-5" />
                <path d="M15 12H3" />
                <path d="M21 19V5" />
              </Icon>
              <AccountSidebarTooltip enabled={isSidebarCollapsed}>
                {t("iesiDinCont")}
              </AccountSidebarTooltip>
            </button>
          </div>
        </div>
      </aside>

      <div className="relative min-w-0 flex-1">
        <AccountMobileTopBar onOpenMenu={() => setSidebarOpen(true)} />

        <main className="w-full px-2 pb-5 pt-4 sm:px-4 md:px-5 lg:px-6 lg:py-8 xl:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
