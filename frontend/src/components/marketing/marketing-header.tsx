"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NotificationBell } from "@/components/account/notification-bell";
import { useAuth } from "@/components/auth/auth-provider";
import { BrandLogo } from "@/components/brand-logo";
import { LanguageSelect } from "@/components/language-select";
import { useLanguage } from "@/components/language-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  type LanguagePreference,
  updateLanguagePreference,
} from "@/lib/auth-api";

// Every section these point at lives on the homepage, so a bare "#..." only
// works while we are on "/". Elsewhere it has to be resolved against the
// homepage or the browser just appends the hash to the current path.
const menuItems = [
  { hash: "#cum-functioneaza", labelKey: "marketing.nav.how" },
  { hash: "#flashcards", labelKey: "marketing.nav.flashcards" },
  { hash: "#beneficii", labelKey: "marketing.nav.benefits" },
  { hash: "#abonamente", labelKey: "marketing.nav.pricing" },
  { hash: "#intrebari", labelKey: "marketing.nav.questions" },
] as const;

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      {open ? (
        <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
      ) : (
        <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
      )}
    </svg>
  );
}

export function MarketingHeader() {
  const [isOpen, setIsOpen] = useState(false);
  const [isSavingLanguage, setIsSavingLanguage] = useState(false);
  const { user, isLoading, setUser } = useAuth();
  const { setLanguage, t } = useLanguage();
  const pathname = usePathname();
  const isHomePage = pathname === "/";
  const sectionHref = (hash: string) => (isHomePage ? hash : `/${hash}`);

  async function persistLanguagePreference(nextLanguage: LanguagePreference) {
    if (!user || user.language_preference === nextLanguage || isSavingLanguage) {
      return;
    }

    const previousUser = user;
    setIsSavingLanguage(true);
    setUser({ ...user, language_preference: nextLanguage });

    try {
      const updatedUser = await updateLanguagePreference(nextLanguage);
      setUser(updatedUser);
    } catch (error) {
      console.error("Nu s-a putut salva limba contului.", error);
      setUser(previousUser);
      setLanguage(previousUser.language_preference);
    } finally {
      setIsSavingLanguage(false);
    }
  }

  return (
    <header className="sticky top-0 z-50 border-b border-subtle/80 bg-surface/90 backdrop-blur-xl">
      <div className="mx-auto grid h-[4.5rem] max-w-7xl grid-cols-[1fr_auto] items-center px-4 sm:px-6 xl:grid-cols-[auto_minmax(0,1fr)_auto] xl:gap-8 xl:px-8">
        <BrandLogo
          href="/"
          className="w-fit shrink-0 text-content transition hover:text-action"
          logoClassName="h-8 w-32 sm:h-9 sm:w-36"
        />

        <nav
          aria-label="Navigatie principala"
          className="hidden min-w-0 items-center justify-self-center rounded-2xl border border-subtle bg-app/70 p-1 xl:flex"
        >
          {menuItems.map((item) => (
            <a
              key={item.hash}
              href={sectionHref(item.hash)}
              className="whitespace-nowrap rounded-md px-3 py-2 text-xs font-bold text-muted transition hover:bg-surface hover:text-content 2xl:px-4"
            >
              {t(item.labelKey)}
            </a>
          ))}
        </nav>

        <div className="flex shrink-0 flex-nowrap items-center justify-end gap-2 justify-self-end">
          <LanguageSelect
            compact
            disabled={isSavingLanguage}
            onChange={persistLanguagePreference}
            className="hidden shrink-0 sm:inline-flex"
          />
          {!isLoading && !user ? <ThemeToggle /> : null}
          {isLoading ? (
            <span className="hidden h-10 w-28 shrink-0 animate-pulse rounded-xl bg-surface-hover sm:block" />
          ) : user ? (
            <Link
              href="/myaccount"
              className="hidden shrink-0 items-center gap-2 whitespace-nowrap rounded-md bg-action px-4 py-2.5 text-xs font-bold text-on-action transition hover:bg-action-hover sm:inline-flex"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-on-action/15 text-[9px]">
                {user.full_name.charAt(0).toUpperCase()}
              </span>
              {t("marketing.account")}
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden shrink-0 whitespace-nowrap rounded-md px-4 py-2.5 text-xs font-bold text-muted transition hover:bg-surface-hover hover:text-content sm:inline-flex"
              >
                {t("marketing.login")}
              </Link>
              <Link
                href="/register"
                className="hidden shrink-0 whitespace-nowrap rounded-md bg-action px-4 py-2.5 text-xs font-bold text-on-action transition hover:bg-action-hover sm:inline-flex"
              >
                {t("marketing.register")}
              </Link>
            </>
          )}
          {!isLoading && user ? (
            <div className="shrink-0">
              <NotificationBell />
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setIsOpen((open) => !open)}
            aria-expanded={isOpen}
            aria-controls="mobile-navigation"
            aria-label={
              isOpen ? t("marketing.closeMenu") : t("marketing.openMenu")
            }
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-subtle bg-surface text-content xl:hidden"
          >
            <MenuIcon open={isOpen} />
          </button>
        </div>
      </div>

      <div
        id="mobile-navigation"
        className={`overflow-hidden border-subtle bg-surface transition-[max-height,border-color] duration-300 xl:hidden ${
          isOpen ? "max-h-96 border-t" : "max-h-0 border-t-transparent"
        }`}
      >
        <nav
          aria-label="Navigatie mobila"
          className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4 sm:px-6"
        >
          <LanguageSelect
            disabled={isSavingLanguage}
            onChange={persistLanguagePreference}
            className="mb-2 w-full sm:hidden"
          />
          {menuItems.map((item) => (
            <a
              key={item.hash}
              href={sectionHref(item.hash)}
              onClick={() => setIsOpen(false)}
              className="rounded-md px-4 py-3 text-sm font-bold text-muted transition hover:bg-surface-hover hover:text-content"
            >
              {t(item.labelKey)}
            </a>
          ))}
          {!isLoading ? (
            user ? (
              <Link
                href="/myaccount"
                onClick={() => setIsOpen(false)}
                className="mt-2 rounded-md bg-action px-4 py-3 text-center text-xs font-bold text-on-action sm:hidden"
              >
                {t("marketing.goToAccount")}
              </Link>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-subtle pt-4 sm:hidden">
                <Link
                  href="/login"
                  className="rounded-md border border-subtle bg-app px-4 py-3 text-center text-xs font-bold"
                >
                  {t("marketing.login")}
                </Link>
                <Link
                  href="/register"
                  className="rounded-md bg-action px-4 py-3 text-center text-xs font-bold text-on-action"
                >
                  {t("marketing.register")}
                </Link>
              </div>
            )
          ) : null}
        </nav>
      </div>
    </header>
  );
}
