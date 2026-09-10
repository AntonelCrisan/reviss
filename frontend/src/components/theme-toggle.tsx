"use client";

import { useTranslations } from "next-intl";
import {
  type ThemePreference,
  useTheme,
} from "@/components/theme-provider";

function MoonIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.25 15.25A8.5 8.5 0 0 1 8.75 3.75a8.5 8.5 0 1 0 11.5 11.5Z"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="12" cy="12" r="3.5" />
      <path
        strokeLinecap="round"
        d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"
      />
    </svg>
  );
}

type ThemeToggleProps = {
  disabled?: boolean;
  onChange?: (theme: ThemePreference) => void;
};

export function ThemeToggle({
  disabled = false,
  onChange,
}: ThemeToggleProps) {
  const t = useTranslations("themeToggle");
  const { resolvedTheme, setTheme } = useTheme();
  const nextPreference = resolvedTheme === "dark" ? "light" : "dark";
  const nextTheme = resolvedTheme === "dark" ? t("luminoasa") : t("intunecata");

  function handleClick() {
    if (onChange) {
      onChange(nextPreference);
      return;
    }
    setTheme(nextPreference);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className="flex h-10 w-10 items-center justify-center rounded-md border border-subtle bg-surface text-content shadow-sm transition hover:bg-surface-hover disabled:cursor-wait disabled:opacity-60"
      aria-label={t("activeazaTemaNexttheme", { nextTheme })}
      title={t("activeazaTemaNexttheme", { nextTheme })}
    >
      {resolvedTheme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
