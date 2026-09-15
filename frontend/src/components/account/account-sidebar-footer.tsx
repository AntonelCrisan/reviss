"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { createPortal } from "react-dom";
import {
  AccountSidebarTooltip,
  getAccountSidebarLabelClass,
} from "@/components/account/account-sidebar-ui";

type AccountSidebarFooterProps = {
  fullName: string;
  email: string;
  isCollapsed: boolean;
  isLoggingOut: boolean;
  /** Runs once the reader confirms; the shell owns the session. */
  onLogout: () => void;
};

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
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function SignOutIcon() {
  return (
    <Icon>
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
      <path d="M21 19V5" />
    </Icon>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * The foot of both sidebars: the way out, then who is signed in.
 *
 * Shared rather than copied, because the two shells had drifted into keeping
 * their own identical version of this block and a change to one silently left
 * the other behind.
 */
export function AccountSidebarFooter({
  fullName,
  email,
  isCollapsed,
  isLoggingOut,
  onLogout,
}: AccountSidebarFooterProps) {
  const t = useTranslations("accountShell");
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  return (
    <div className="shrink-0 p-3">
      <button
        type="button"
        onClick={() => setIsConfirmOpen(true)}
        disabled={isLoggingOut}
        className={`group/sidebar-item relative flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-semibold text-danger outline-none transition hover:bg-danger-soft focus-visible:bg-danger-soft disabled:cursor-wait disabled:opacity-60 ${
          isCollapsed
            ? "lg:mx-auto lg:h-10 lg:w-10 lg:justify-center lg:gap-0 lg:px-0"
            : ""
        }`}
        aria-label={t("iesire")}
      >
        <SignOutIcon />
        <span className={getAccountSidebarLabelClass(isCollapsed)}>
          {t("iesire")}
        </span>
        <AccountSidebarTooltip enabled={isCollapsed}>
          {t("iesire")}
        </AccountSidebarTooltip>
      </button>

      <div
        className={`mt-3 flex items-center gap-3 border-t border-subtle px-2 pt-3 ${
          isCollapsed ? "lg:justify-center lg:gap-0 lg:px-0" : ""
        }`}
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-subtle bg-success-soft text-xs font-bold text-success ${
            isCollapsed ? "lg:hidden" : ""
          }`}
        >
          {initials(fullName)}
        </span>
        <span className={getAccountSidebarLabelClass(isCollapsed)}>
          <span className="block truncate text-sm font-semibold text-content">
            {fullName}
          </span>
          <span className="block truncate text-xs text-muted">{email}</span>
        </span>
      </div>

      {/* Rendered into <body>, not here: the sidebar animates with `translate`
          and clips with `overflow-hidden`, and a translated element becomes the
          containing block for its fixed descendants. Left in place the dialog
          is measured against the sidebar and trapped inside it.

          Reading `document` at render is safe because the dialog only exists
          after a click, so this branch never runs on the server. */}
      {isConfirmOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[80] flex items-center justify-center bg-content/40 px-4 py-6 backdrop-blur-sm"
              role="dialog"
              aria-modal="true"
              aria-labelledby="logout-confirm-title"
              // Dismissing by clicking away means "no", which is the safe answer
              // to a question about losing your session.
              onClick={(event) => {
                if (event.target === event.currentTarget && !isLoggingOut) {
                  setIsConfirmOpen(false);
                }
              }}
            >
              <div className="w-full max-w-md rounded-xl border border-subtle bg-surface p-6 shadow-2xl shadow-black/20">
                <span className="flex h-11 w-11 items-center justify-center rounded-full border border-danger-border bg-danger-soft text-danger">
                  <SignOutIcon />
                </span>
                <h2
                  id="logout-confirm-title"
                  className="mt-4 font-serif text-2xl font-semibold leading-tight text-content"
                >
                  {t("confirmaIesirea")}
                </h2>
                <p className="mt-3 text-sm leading-6 text-muted">
                  {t("vaTrebuiSaTeAutentifici")}
                </p>

                <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
                  <button
                    type="button"
                    onClick={onLogout}
                    disabled={isLoggingOut}
                    className="min-h-11 flex-1 cursor-pointer rounded-md bg-danger px-5 py-2.5 text-center text-sm font-black text-on-action transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
                  >
                    {isLoggingOut ? t("seIese") : t("daIesi")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsConfirmOpen(false)}
                    disabled={isLoggingOut}
                    className="min-h-11 flex-1 cursor-pointer rounded-md border border-subtle bg-surface px-5 py-2.5 text-center text-sm font-black text-content transition hover:bg-surface-hover disabled:opacity-60"
                  >
                    {t("ramaiConectat")}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
